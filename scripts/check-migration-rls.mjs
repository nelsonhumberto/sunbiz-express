#!/usr/bin/env node
/**
 * Fail if a Prisma migration creates a public table that never enables
 * row level security.
 *
 * Tables created before 20261023220000_enable_rls may be enabled by that
 * migration (or any later one). Tables created after it must enable RLS
 * in the same migration.sql. Schema models (and _prisma_migrations) must
 * be enabled somewhere in the migration history.
 */
import fs from 'node:fs';
import path from 'node:path';

const BASELINE_MIGRATION = '20261023220000_enable_rls';

const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|[A-Za-z_][\w]*)\.)?(?:"([^"]+)"|([A-Za-z_][\w]*))/gi;

const ENABLE_RLS_RE =
  /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?(?:(?:"[^"]+"|[A-Za-z_][\w]*)\.)?(?:"([^"]+)"|([A-Za-z_][\w]*))\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\b/gi;

const MODEL_RE = /^\s*model\s+(\w+)\s+\{/gm;

export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
}

function namesFrom(sql, pattern) {
  const names = [];
  const re = new RegExp(pattern.source, pattern.flags);
  let match;
  while ((match = re.exec(sql)) !== null) {
    const name = match[1] ?? match[2];
    if (name) names.push(name);
  }
  return names;
}

export function createdTables(sql) {
  return namesFrom(stripSqlComments(sql), CREATE_TABLE_RE);
}

export function rlsEnabledTables(sql) {
  return namesFrom(stripSqlComments(sql), ENABLE_RLS_RE);
}

export function schemaModelTables(schema) {
  const tables = [];
  const withoutComments = schema
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  let match;
  const re = new RegExp(MODEL_RE.source, MODEL_RE.flags);
  while ((match = re.exec(withoutComments)) !== null) {
    const model = match[1];
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < withoutComments.length && depth > 0) {
      const ch = withoutComments[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    const body = withoutComments.slice(start, i - 1);
    const mapped = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    tables.push(mapped ? mapped[1] : model);
  }
  return tables;
}

export function readMigrationFiles(migrationsDir) {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const file = path.join(migrationsDir, name, 'migration.sql');
      if (!fs.existsSync(file)) return null;
      return { name, sql: fs.readFileSync(file, 'utf8') };
    })
    .filter(Boolean);
}

export function checkRls({ migrations, schema }) {
  const errors = [];
  const parsed = migrations.map((migration) => ({
    name: migration.name,
    creates: createdTables(migration.sql),
    enables: new Set(rlsEnabledTables(migration.sql)),
  }));

  const baselineIndex = parsed.findIndex((migration) => migration.name === BASELINE_MIGRATION);
  const enabledAnywhere = new Set(parsed.flatMap((migration) => [...migration.enables]));

  parsed.forEach((migration, index) => {
    for (const table of migration.creates) {
      const coveredFromHere = parsed
        .slice(index)
        .some((later) => later.enables.has(table));
      if (!coveredFromHere) {
        errors.push(
          `${migration.name} creates "${table}" but no migration enables row level security on it`,
        );
        continue;
      }
      if (baselineIndex !== -1 && index > baselineIndex && !migration.enables.has(table)) {
        errors.push(
          `${migration.name} creates "${table}" without ENABLE ROW LEVEL SECURITY in the same migration`,
        );
      }
    }
  });

  const required = [...schemaModelTables(schema), '_prisma_migrations'];
  for (const table of required) {
    if (!enabledAnywhere.has(table)) {
      errors.push(
        `public table "${table}" has no ENABLE ROW LEVEL SECURITY in prisma/migrations`,
      );
    }
  }

  return errors;
}

function main() {
  const root = process.cwd();
  const migrationsDir = path.join(root, 'prisma', 'migrations');
  const schemaPath = path.join(root, 'prisma', 'schema.prisma');
  const errors = checkRls({
    migrations: readMigrationFiles(migrationsDir),
    schema: fs.readFileSync(schemaPath, 'utf8'),
  });

  if (errors.length > 0) {
    console.error('Migration RLS check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Migration RLS check passed.');
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (invokedDirectly) main();
