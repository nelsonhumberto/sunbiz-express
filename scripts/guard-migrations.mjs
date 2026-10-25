#!/usr/bin/env node
/**
 * Fail the build when a Prisma migration contains destructive SQL that
 * Nelson has not approved.
 *
 * Approved names live in prisma/destructive-migrations-approved.txt.
 * One migration folder name per line. An entry needs Nelson's explicit OK.
 * Production and every environment other than Vercel preview use that list.
 *
 * On a Vercel preview build (VERCEL_ENV=preview) the approved list does not
 * apply. The script runs `prisma migrate status` and treats migration
 * folders that are not finished in the preview database as pending. If any
 * pending migration has destructive SQL, the process exits 1 before
 * `prisma migrate deploy`. If the pending set cannot be determined, the
 * build fails closed. Status output is never printed, because it includes
 * the database host.
 *
 * Pull requests run this file with `--ci <base>`. That mode diffs the
 * migrations added by the pull request against the base and also rejects
 * new lines in the approved list. It needs a full git history.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APPROVED_FILE = 'prisma/destructive-migrations-approved.txt';
const FAIL_CLOSED =
  'Could not determine which migrations are pending on the preview database. Refusing to run migrate deploy.';

export function maskSqlForScan(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      out += '\n';
      continue;
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }
    const dollar = dollarTagAt(sql, i);
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      // Isolate the body so its statements are scanned, and so a quote
      // inside the body cannot consume the statement that follows the tag.
      out += ';';
      if (end === -1) {
        out += maskSqlForScan(sql.slice(i + dollar.length));
        break;
      }
      out += maskSqlForScan(sql.slice(i + dollar.length, end));
      out += ';';
      i = end + dollar.length;
      continue;
    }
    if ((sql[i] === 'E' || sql[i] === 'e') && sql[i + 1] === "'") {
      i = consumeQuoted(sql, i + 2, true, "'");
      out += "''";
      continue;
    }
    if (sql[i] === "'") {
      i = consumeQuoted(sql, i + 1, false, "'");
      out += "''";
      continue;
    }
    if (sql[i] === '"') {
      i = consumeQuoted(sql, i + 1, false, '"');
      out += '""';
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

function dollarTagAt(sql, i) {
  if (sql[i] !== '$') return null;
  let j = i + 1;
  while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j += 1;
  if (sql[j] !== '$') return null;
  return sql.slice(i, j + 1);
}

function consumeQuoted(sql, i, escapeBackslash, quote) {
  while (i < sql.length) {
    if (escapeBackslash && sql[i] === '\\') {
      i += i + 1 < sql.length ? 2 : 1;
      continue;
    }
    if (sql[i] === quote && sql[i + 1] === quote) {
      i += 2;
      continue;
    }
    if (sql[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

function isUpdateStatement(statement) {
  const trimmed = statement.trim();
  if (/^UPDATE\b/i.test(trimmed)) return true;
  return /^WITH\b/i.test(trimmed) && /\bUPDATE\b/i.test(trimmed);
}

function statementKinds(statement) {
  const kinds = [];
  if (/\bDROP\s+TABLE\b/i.test(statement)) kinds.push('DROP TABLE');
  if (/\bDROP\s+COLUMN\b/i.test(statement)) kinds.push('DROP COLUMN');
  if (/\bDROP\s+INDEX\b/i.test(statement)) kinds.push('DROP INDEX');
  if (/\bDROP\s+MATERIALIZED\s+VIEW\b/i.test(statement)) kinds.push('DROP MATERIALIZED VIEW');
  if (/\bDROP\s+VIEW\b/i.test(statement)) kinds.push('DROP VIEW');
  if (/\bDROP\s+TYPE\b/i.test(statement)) kinds.push('DROP TYPE');
  if (/\bDROP\s+SCHEMA\b/i.test(statement)) kinds.push('DROP SCHEMA');
  if (/\bDROP\s+SEQUENCE\b/i.test(statement)) kinds.push('DROP SEQUENCE');
  if (/\bDROP\s+FUNCTION\b/i.test(statement)) kinds.push('DROP FUNCTION');
  if (/\bDROP\s+TRIGGER\b/i.test(statement)) kinds.push('DROP TRIGGER');
  if (/\bTRUNCATE\b/i.test(statement)) kinds.push('TRUNCATE');
  if (/\bDELETE\s+FROM\b/i.test(statement)) kinds.push('DELETE FROM');
  const withoutConstraintRelaxation = statement
    .replace(/\bDROP\s+NOT\s+NULL\b/gi, '')
    .replace(/\bDROP\s+DEFAULT\b/gi, '');
  if (
    /\bALTER\s+TABLE\b/i.test(withoutConstraintRelaxation) &&
    /\bDROP\b/i.test(withoutConstraintRelaxation)
  ) {
    kinds.push('ALTER TABLE ... DROP');
  }
  if (/\bRENAME\s+COLUMN\b/i.test(statement)) kinds.push('RENAME COLUMN');
  if (/\bRENAME\s+TO\b/i.test(statement)) kinds.push('RENAME TO');
  if (/\bALTER\s+TABLE\b/i.test(statement) && /\bRENAME\b/i.test(statement)) {
    kinds.push('ALTER TABLE ... RENAME');
  }
  if (/\bALTER\s+TYPE\b/i.test(statement) && /\bRENAME\s+VALUE\b/i.test(statement)) {
    kinds.push('ALTER TYPE ... RENAME VALUE');
  }
  const altersColumnType =
    /\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i.test(statement) ||
    /\bALTER\s+TABLE\b[\s\S]*\bALTER\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i.test(statement);
  if (altersColumnType) kinds.push('ALTER COLUMN ... TYPE');
  if (isUpdateStatement(statement)) kinds.push('UPDATE');
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

export function guardMigrations({ migrations, approvedNames }) {
  const errors = [];
  for (const migration of migrations) {
    const kinds = destructiveKinds(migration.sql);
    if (kinds.length === 0) continue;
    if (approvedNames.has(migration.name)) continue;
    errors.push(
      `${migrationFile(migration.name)} has destructive SQL (${kinds.join(', ')}) and is not listed in ${APPROVED_FILE}. An entry needs Nelson's explicit OK.`,
    );
  }
  return errors;
}

export function stripAnsi(text) {
  return String(text).replace(/\u001b\[[0-9;]*m/g, '');
}

const MIGRATION_NAME = /^\d{8,}_[A-Za-z0-9_-]+$/;

export function parseMigrateStatusOutput(text) {
  const src = stripAnsi(text);
  if (/Database schema is up to date/i.test(src)) {
    return { determined: true, pending: [], unmanaged: false };
  }
  const pending = [];
  let collecting = false;
  for (const line of src.split('\n')) {
    const trimmed = line.trim();
    if (/have not yet been applied:/i.test(trimmed) || /have failed:/i.test(trimmed)) {
      collecting = true;
      continue;
    }
    if (!collecting) continue;
    if (!trimmed || /^(To apply|During development|The migration|The failed|Read more|- )/i.test(trimmed)) {
      collecting = false;
      continue;
    }
    if (MIGRATION_NAME.test(trimmed)) {
      pending.push(trimmed);
      continue;
    }
    collecting = false;
  }
  if (/not managed by Prisma Migrate/i.test(src)) {
    return { determined: true, pending, unmanaged: true };
  }
  if (/have not yet been applied:|have failed:/i.test(src)) {
    return { determined: pending.length > 0, pending: [...new Set(pending)], unmanaged: false };
  }
  return { determined: false, pending: [], unmanaged: false };
}

export function pendingNamesFromStatus(statusText, localNames) {
  const parsed = parseMigrateStatusOutput(statusText);
  if (!parsed.determined) return null;
  if (parsed.unmanaged) return new Set(localNames);
  return new Set(parsed.pending);
}

export function previewGuardErrors({ migrations, statusText }) {
  const pendingNames = pendingNamesFromStatus(
    statusText,
    migrations.map((migration) => migration.name),
  );
  if (!(pendingNames instanceof Set)) return [FAIL_CLOSED];
  const errors = [];
  for (const migration of migrations) {
    if (!pendingNames.has(migration.name)) continue;
    const kinds = destructiveKinds(migration.sql);
    if (kinds.length === 0) continue;
    errors.push(
      `${migrationFile(migration.name)} is pending on the preview database and has destructive SQL (${kinds.join(', ')}). Refusing to run migrate deploy. The approved list does not apply on preview.`,
    );
  }
  return errors;
}

export function addedApprovedEntries(diffText) {
  const entries = [];
  for (const line of String(diffText).split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const content = line.slice(1).trim();
    if (!content || content.startsWith('#')) continue;
    const name = content.split(/\s+/)[0];
    if (name) entries.push(name);
  }
  return entries;
}

export function guardPullRequest({ addedMigrations, approvedNames, approvedDiff }) {
  const errors = [];
  for (const migration of addedMigrations) {
    const kinds = destructiveKinds(migration.sql);
    if (kinds.length === 0) continue;
    if (approvedNames.has(migration.name)) continue;
    const file = migration.file || migrationFile(migration.name);
    errors.push(
      `${file} is added by this pull request and has destructive SQL (${kinds.join(', ')}). It is not listed in ${APPROVED_FILE}. An entry needs Nelson's explicit OK.`,
    );
  }
  for (const entry of addedApprovedEntries(approvedDiff)) {
    errors.push(
      `This pull request adds ${entry} to ${APPROVED_FILE}. An entry needs Nelson's explicit OK.`,
    );
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

function runCaptured(command, args) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    stdio: 'pipe',
  });
}

function readPreviewStatusText() {
  const result = runCaptured('npx', [
    'prisma',
    'migrate',
    'status',
    '--schema',
    'prisma/schema.prisma',
  ]);
  if (result.error && !result.stdout && !result.stderr) return null;
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function printErrors(errors) {
  console.error('Migration guard failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

function runPreview(migrations) {
  const statusText = readPreviewStatusText();
  if (statusText == null) printErrors([FAIL_CLOSED]);
  const errors = previewGuardErrors({ migrations, statusText });
  if (errors.length > 0) printErrors(errors);
  console.log('Migration guard passed. No pending destructive migration.');
}

function runApprovedList(root, migrations) {
  const approvedText = fs.readFileSync(path.join(root, APPROVED_FILE), 'utf8');
  const errors = guardMigrations({
    migrations,
    approvedNames: parseApprovedNames(approvedText),
  });
  if (errors.length > 0) printErrors(errors);
  console.log('Migration guard passed.');
}

function gitBaseBranch(base) {
  return base.startsWith('origin/') ? base.slice('origin/'.length) : base;
}

function runCi(root, base) {
  if (!base) {
    console.error('Migration guard failed: a base revision is required.');
    process.exit(1);
  }
  const branch = gitBaseBranch(base);
  runCaptured('git', ['fetch', 'origin', branch]);
  runCaptured('git', ['fetch', 'origin', '--unshallow']);
  const names = runCaptured('git', [
    'diff',
    '--name-only',
    '--diff-filter=A',
    `${base}...HEAD`,
  ]);
  if (names.status !== 0) {
    console.error(
      'Migration guard failed: could not diff this pull request against its base. A full history is required.',
    );
    process.exit(1);
  }
  const approved = runCaptured('git', ['diff', '-U0', `${base}...HEAD`, '--', APPROVED_FILE]);
  if (approved.status !== 0) {
    console.error(
      'Migration guard failed: could not diff the approved migration list against the base. A full history is required.',
    );
    process.exit(1);
  }
  const addedMigrations = [];
  for (const file of names.stdout.split('\n').map((line) => line.trim()).filter(Boolean)) {
    const match = file.match(/^prisma\/migrations\/([^/]+)\/migration\.sql$/);
    if (!match) continue;
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) {
      printErrors([
        `${file} is added by this pull request but could not be read. An entry needs Nelson's explicit OK.`,
      ]);
    }
    addedMigrations.push({
      name: match[1],
      file,
      sql: fs.readFileSync(absolute, 'utf8'),
    });
  }
  const approvedText = fs.existsSync(path.join(root, APPROVED_FILE))
    ? fs.readFileSync(path.join(root, APPROVED_FILE), 'utf8')
    : '';
  const errors = guardPullRequest({
    addedMigrations,
    approvedNames: parseApprovedNames(approvedText),
    approvedDiff: approved.stdout,
  });
  if (errors.length > 0) printErrors(errors);
  console.log('Migration guard passed.');
}

function main() {
  const root = process.cwd();
  const ciIndex = process.argv.indexOf('--ci');
  if (ciIndex !== -1) {
    runCi(root, process.argv[ciIndex + 1]);
    return;
  }
  const migrations = readMigrationFiles(path.join(root, 'prisma', 'migrations'));
  if (process.env.VERCEL_ENV === 'preview') {
    runPreview(migrations);
    return;
  }
  runApprovedList(root, migrations);
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (invokedDirectly) main();
