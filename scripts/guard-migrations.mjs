#!/usr/bin/env node
/**
 * Fail the build when a Prisma migration contains destructive SQL that
 * Nelson has not approved.
 *
 * Approved names live in prisma/destructive-migrations-approved.txt.
 * One migration folder name per line. An entry needs Nelson's explicit OK.
 * This check runs in every environment, including production.
 *
 * On a Vercel preview build (VERCEL_ENV=preview), a destructive migration
 * folder that is not on origin/main fails even when it is listed. The
 * shared preview database must not apply destructive DDL from an unmerged
 * branch. The script tries `git fetch origin main` and then lists
 * prisma/migrations on origin/main. If that fetch or listing fails, or the
 * listing is empty, the preview build uses the approved list only and
 * prints that limitation. Git errors are not printed, because a remote URL
 * can contain credentials.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APPROVED_FILE = 'prisma/destructive-migrations-approved.txt';

export function maskSqlForScan(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith('--')) {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      out += '\n';
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      i += 1;
      while (i < sql.length) {
        if (sql[i] === quote && sql[i + 1] === quote) {
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      out += quote === "'" ? "''" : '""';
      continue;
    }
    const dollar = rest.match(/^\$([A-Za-z_]*)\$/);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end === -1) {
        out += maskSqlForScan(sql.slice(i + tag.length));
        break;
      }
      out += maskSqlForScan(sql.slice(i + tag.length, end));
      i = end + tag.length;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

function statementKinds(statement) {
  const kinds = [];
  if (/\bDROP\s+TABLE\b/i.test(statement)) kinds.push('DROP TABLE');
  if (/\bDROP\s+COLUMN\b/i.test(statement)) kinds.push('DROP COLUMN');
  if (/\bDROP\s+INDEX\b/i.test(statement)) kinds.push('DROP INDEX');
  if (/\bTRUNCATE\b/i.test(statement)) kinds.push('TRUNCATE');
  if (/\bDELETE\s+FROM\b/i.test(statement)) kinds.push('DELETE FROM');
  if (/\bALTER\s+TABLE\b/i.test(statement) && /\bDROP\b/i.test(statement)) {
    kinds.push('ALTER TABLE ... DROP');
  }
  const altersColumnType =
    /\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i.test(statement) ||
    /\bALTER\s+TABLE\b[\s\S]*\bALTER\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i.test(statement);
  if (altersColumnType) kinds.push('ALTER COLUMN ... TYPE');
  return kinds;
}

export function destructiveKinds(sql) {
  const masked = maskSqlForScan(sql);
  const found = new Set();
  for (const statement of masked.split(';')) {
    if (!statement.trim()) continue;
    for (const kind of statementKinds(statement)) found.add(kind);
  }
  return [...found];
}

export function parseApprovedNames(text) {
  const names = new Set();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const name = trimmed.split(/\s+/)[0];
    if (name) names.add(name);
  }
  return names;
}

export function migrationFile(name) {
  return `prisma/migrations/${name}/migration.sql`;
}

export function guardMigrations({
  migrations,
  approvedNames,
  vercelEnv,
  mainMigrationNames,
}) {
  const errors = [];
  for (const migration of migrations) {
    const kinds = destructiveKinds(migration.sql);
    if (kinds.length === 0) continue;
    const file = migrationFile(migration.name);
    const listed = kinds.join(', ');
    if (!approvedNames.has(migration.name)) {
      errors.push(
        `${file} has destructive SQL (${listed}) and is not listed in ${APPROVED_FILE}. An entry needs Nelson's explicit OK.`,
      );
    }
    if (
      vercelEnv === 'preview' &&
      mainMigrationNames instanceof Set &&
      !mainMigrationNames.has(migration.name)
    ) {
      errors.push(
        `${file} has destructive SQL (${listed}) and is not on origin/main. The shared preview database must not apply it from an unmerged branch.`,
      );
    }
  }
  return errors;
}

export function readMigrationFiles(migrationsDir) {
  const names = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const migrations = [];
  for (const name of names) {
    const file = path.join(migrationsDir, name, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    migrations.push({ name, sql: fs.readFileSync(file, 'utf8') });
  }
  return migrations;
}

export function migrationNamesFromLsTree(text) {
  const names = new Set();
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const name = trimmed.split('/').filter(Boolean).pop();
    if (!name || name.includes('.')) continue;
    names.add(name);
  }
  return names;
}

export function readOriginMainMigrationNames(run = defaultGit) {
  try {
    run('git', ['fetch', 'origin', 'main', '--depth=1']);
  } catch {
    return null;
  }
  let output = '';
  try {
    output = run('git', ['ls-tree', '--name-only', 'origin/main', 'prisma/migrations']);
  } catch {
    return null;
  }
  const names = migrationNamesFromLsTree(output ?? '');
  if (names.size === 0) return null;
  return names;
}

function defaultGit(command, args) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  });
}

function main() {
  const root = process.cwd();
  const migrations = readMigrationFiles(path.join(root, 'prisma', 'migrations'));
  const approvedText = fs.readFileSync(path.join(root, APPROVED_FILE), 'utf8');
  const vercelEnv = process.env.VERCEL_ENV;
  let mainMigrationNames = null;
  if (vercelEnv === 'preview') {
    mainMigrationNames = readOriginMainMigrationNames();
    if (!(mainMigrationNames instanceof Set)) {
      console.log(
        'Could not read migration folders from origin/main. This preview build checks destructive migrations against prisma/destructive-migrations-approved.txt only.',
      );
    }
  }
  const errors = guardMigrations({
    migrations,
    approvedNames: parseApprovedNames(approvedText),
    vercelEnv,
    mainMigrationNames,
  });
  if (errors.length > 0) {
    console.error('Migration guard failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log('Migration guard passed.');
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (invokedDirectly) main();
