#!/usr/bin/env node
/**
 * Build idempotent SQL for SunbizArCandidate from a Florida corporate file.
 *
 * No database connection is required. The default writes SQL chunks you can
 * paste into the Supabase SQL editor. Pass --db to apply them with
 * DATABASE_URL when that variable is set.
 *
 * Usage:
 *   unzip -p cordata.zip | node scripts/sunbiz-ar-import.mjs --source-date 2026-10-07 --year 2026 --out tmp/sunbiz-ar
 *   node scripts/sunbiz-ar-import.mjs --input cordata.csv --out tmp/sunbiz-ar --year 2026
 *   node scripts/sunbiz-ar-import.mjs --input 20261025c.txt --out tmp/sunbiz-ar --year 2026
 *   node scripts/sunbiz-ar-import.mjs --delete removals.txt --out tmp/sunbiz-ar-deletes
 *   npm run sunbiz:ar-import -- --input cordata.csv --out tmp/sunbiz-ar --year 2026
 *
 * The quarterly cordata.zip is Deflate64. This script does not unzip it.
 * Pipe already-extracted text (unzip -p cordata.zip) or pass a .txt/.csv file.
 * --input - also reads stdin.
 *
 * CSV columns (entity_type is the raw Sunbiz filing type, such as FLAL):
 *   doc_number, entity_type, status, formation_date, ar_year_1, ar_year_2, ar_year_3, source_file_date
 *
 * Fixed-width records use Florida's corporate file layout. Record length is
 * 1440 characters. Dates are MMDDYYYY. Offsets below are 1-based start/length.
 * Source: https://dos.sunbiz.org/data-definitions/cor.html
 *
 *   doc number          1/12
 *   status              205/1     A active, I inactive
 *   filing type         206/15    FLAL FORL DOMP DOMNP FORP FORNP TRUST DOMLP FORLP
 *   formation/file date 473/8
 *   AR1 year            506/4     AR1 date 511/8
 *   AR2 year            519/4     AR2 date 524/8
 *   AR3 year            532/4     AR3 date 537/8
 *
 * A candidate is active, an LLC or corporation filing type (FLAL, FORL, DOMP,
 * DOMNP, FORP, FORNP), formed before January 1 of --year, and that year is not
 * one of the three report years. Any other record in the input becomes a DELETE.
 * Daily c files contain only new filings. They do not update existing entities.
 * Removals (already filed, dissolved, or no longer a candidate) come from a
 * separate document-number list passed with --delete.
 * The later sourceFileDate wins if an older chunk is applied after a newer one.
 */

import fs from 'node:fs';
import path from 'node:path';

export const CORDATA_RECORD_LENGTH = 1440;
export const CHUNK_SIZE = 2000;

/** LLC and corporation filing types. Anything else is not a candidate. */
export const CANDIDATE_FILING_TYPES = ['FLAL', 'FORL', 'DOMP', 'DOMNP', 'FORP', 'FORNP'];

// 0-based [start, end) slices. End is exclusive. Offsets above are 1-based start/length.
const FIELD = {
  documentNumber: [0, 12],
  status: [204, 205],
  entityType: [205, 220],
  fileDate: [472, 480],
  reportYear1: [505, 509],
  reportDate1: [510, 518],
  reportYear2: [518, 522],
  reportDate2: [523, 531],
  reportYear3: [531, 535],
  reportDate3: [536, 544],
};

const CSV_COLUMNS = [
  'doc_number',
  'entity_type',
  'status',
  'formation_date',
  'ar_year_1',
  'ar_year_2',
  'ar_year_3',
  'source_file_date',
];

/**
 * @param {{ DATABASE_URL?: string }} [env]
 */
export function databaseUrlFrom(env = process.env) {
  const url = env.DATABASE_URL?.trim();
  return url || null;
}

export function sourceDateFromFilename(filename) {
  const base = path.basename(filename ?? '');
  const match = base.match(/(19|20)\d{6}/);
  if (!match) return null;
  const digits = match[0];
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return isIsoDate(iso) ? iso : null;
}

export function easternYear(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  return Number(year);
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseLooseDate(value) {
  const text = String(value ?? '').trim();
  if (!text || /^0+$/.test(text)) return null;
  if (isIsoDate(text.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const iso = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    return isIsoDate(iso) ? iso : null;
  }
  if (/^\d{8}$/.test(text)) {
    const yearFirst = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    const monthFirst = `${text.slice(4, 8)}-${text.slice(0, 2)}-${text.slice(2, 4)}`;
    if (/^(19|20)/.test(text) && isIsoDate(yearFirst)) return yearFirst;
    if (isIsoDate(monthFirst)) return monthFirst;
  }
  return null;
}

function parseYear(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}$/.test(text)) return null;
  const year = Number(text);
  if (year < 1900 || year > 2200) return null;
  return year;
}

export function normalizeDocumentNumber(value) {
  return String(value ?? '')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .toUpperCase();
}

function sliceField(line, [start, end]) {
  return line.slice(start, end).trim();
}

function looksLikeCsv(text, filename) {
  if (filename && path.extname(filename).toLowerCase() === '.csv') return true;
  const first = text.split(/\r?\n/).find((line) => line.trim());
  return Boolean(first && /(^|,)doc_number(,|$)/i.test(first));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

function headerIndex(header) {
  const index = new Map();
  header.forEach((name, position) => {
    index.set(name.trim().toLowerCase(), position);
  });
  return index;
}

function cell(row, index, name) {
  const position = index.get(name);
  if (position === undefined) return '';
  return row[position] ?? '';
}

function recordFromParts({
  documentNumber,
  entityType,
  status,
  formationDate,
  years,
  sourceFileDate,
}) {
  const doc = normalizeDocumentNumber(documentNumber);
  if (!/^[A-Z0-9]{5,20}$/.test(doc)) return null;
  const source = parseLooseDate(sourceFileDate);
  if (!source) return null;
  const parsedYears = [];
  for (const year of years) {
    const parsed = parseYear(year);
    if (parsed !== null && !parsedYears.includes(parsed)) parsedYears.push(parsed);
  }
  parsedYears.sort((a, b) => a - b);
  return {
    documentNumber: doc,
    entityType: String(entityType ?? '').trim().toUpperCase().slice(0, 15),
    status: String(status ?? '').trim().slice(0, 40),
    formationDate: parseLooseDate(formationDate),
    arYears: parsedYears,
    sourceFileDate: source,
  };
}

function parseCsvRecords(text, fallbackSourceDate) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const index = headerIndex(rows[0]);
  const missing = CSV_COLUMNS.filter((name) => !index.has(name));
  if (missing.length) {
    throw new Error(`CSV is missing columns: ${missing.join(', ')}`);
  }
  const records = [];
  for (const row of rows.slice(1)) {
    const record = recordFromParts({
      documentNumber: cell(row, index, 'doc_number'),
      entityType: cell(row, index, 'entity_type'),
      status: cell(row, index, 'status'),
      formationDate: cell(row, index, 'formation_date'),
      years: [
        cell(row, index, 'ar_year_1'),
        cell(row, index, 'ar_year_2'),
        cell(row, index, 'ar_year_3'),
      ],
      sourceFileDate: cell(row, index, 'source_file_date') || fallbackSourceDate,
    });
    if (record) records.push(record);
  }
  return records;
}

function splitFixedWidth(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.length > 0);
  if (lines.length === 1 && lines[0].length >= CORDATA_RECORD_LENGTH && lines[0].length % CORDATA_RECORD_LENGTH === 0) {
    const records = [];
    for (let i = 0; i < lines[0].length; i += CORDATA_RECORD_LENGTH) {
      records.push(lines[0].slice(i, i + CORDATA_RECORD_LENGTH));
    }
    return records;
  }
  return lines;
}

function reportYearText(yearText, dateText) {
  if (parseYear(yearText) !== null) return String(yearText).trim();
  const filed = parseLooseDate(dateText);
  return filed ? filed.slice(0, 4) : '';
}

function parseFixedRecords(text, sourceFileDate) {
  if (!sourceFileDate) {
    throw new Error(
      'A fixed-width cor file needs a source date. Pass --source-date YYYY-MM-DD or use a name like 20261025c.txt.',
    );
  }
  const records = [];
  for (const rawLine of splitFixedWidth(text)) {
    const line = rawLine.length > CORDATA_RECORD_LENGTH ? rawLine.slice(0, CORDATA_RECORD_LENGTH) : rawLine;
    if (line.length < FIELD.reportDate3[1]) continue;
    const record = recordFromParts({
      documentNumber: sliceField(line, FIELD.documentNumber),
      entityType: sliceField(line, FIELD.entityType),
      status: sliceField(line, FIELD.status),
      formationDate: sliceField(line, FIELD.fileDate),
      years: [
        reportYearText(sliceField(line, FIELD.reportYear1), sliceField(line, FIELD.reportDate1)),
        reportYearText(sliceField(line, FIELD.reportYear2), sliceField(line, FIELD.reportDate2)),
        reportYearText(sliceField(line, FIELD.reportYear3), sliceField(line, FIELD.reportDate3)),
      ],
      sourceFileDate,
    });
    if (record) records.push(record);
  }
  return records;
}

/**
 * Read a CSV or a raw cor / cordata fixed-width file.
 * Returns one record per input row that has a document number and a source date.
 * @param {{ text: string, filename?: string | null, sourceDate?: string | null }} input
 */
export function parseSunbizArInput(input) {
  const { text, filename, sourceDate } = input;
  const fallback = sourceDate || sourceDateFromFilename(filename);
  if (looksLikeCsv(text, filename)) {
    return parseCsvRecords(text, fallback);
  }
  return parseFixedRecords(text, fallback);
}

export function isActiveStatus(status) {
  const value = String(status ?? '').trim().toUpperCase();
  return value === 'A' || value === 'ACTIVE';
}

export function isCandidateFilingType(entityType) {
  return CANDIDATE_FILING_TYPES.includes(String(entityType ?? '').trim().toUpperCase());
}

export function isArCandidate(record, year) {
  if (!isCandidateFilingType(record.entityType)) return false;
  if (!isActiveStatus(record.status)) return false;
  if (!record.formationDate || record.formationDate >= `${year}-01-01`) return false;
  if (record.arYears.includes(year)) return false;
  return true;
}

/** One document number per line. Blank lines and # comments are ignored. */
export function parseDeleteList(text) {
  const seen = new Set();
  const docs = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const doc = normalizeDocumentNumber(trimmed.split(/[\s,]/)[0]);
    if (!/^[A-Z0-9]{5,20}$/.test(doc) || seen.has(doc)) continue;
    seen.add(doc);
    docs.push(doc);
  }
  return docs;
}

export function buildDeleteSql(documentNumbers, chunkSize = CHUNK_SIZE) {
  const statements = documentNumbers.map(
    (doc) => `DELETE FROM "SunbizArCandidate" WHERE "documentNumber" = ${sqlString(doc)};`,
  );
  const size = Math.max(1, chunkSize);
  const chunks = [];
  for (let i = 0; i < statements.length; i += size) {
    const body = statements.slice(i, i + size).join('\n');
    const header =
      '-- Sunbiz annual report candidate removals.\n' +
      '-- Idempotent. Deletes these document numbers even if a newer source date is stored.\n';
    chunks.push(`${header}${body}\n`);
  }
  return chunks;
}

function keepLater(existing, incoming) {
  if (!existing) return incoming;
  if (incoming.sourceFileDate > existing.sourceFileDate) return incoming;
  if (incoming.sourceFileDate < existing.sourceFileDate) return existing;
  return incoming;
}

export function dedupeRecords(records) {
  const byDocument = new Map();
  for (const record of records) {
    byDocument.set(record.documentNumber, keepLater(byDocument.get(record.documentNumber), record));
  }
  return [...byDocument.values()].sort((a, b) => a.documentNumber.localeCompare(b.documentNumber));
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlYears(years) {
  if (!years.length) return 'ARRAY[]::INTEGER[]';
  return `ARRAY[${years.join(', ')}]::INTEGER[]`;
}

export function statementForRecord(record, year) {
  if (isArCandidate(record, year)) {
    return (
      `INSERT INTO "SunbizArCandidate" ` +
      `("documentNumber", "entityType", "status", "formationDate", "arYears", "sourceFileDate", "updatedAt") ` +
      `VALUES (${sqlString(record.documentNumber)}, ${sqlString(record.entityType)}, ${sqlString(record.status)}, ` +
      `DATE ${sqlString(record.formationDate)}, ${sqlYears(record.arYears)}, DATE ${sqlString(record.sourceFileDate)}, CURRENT_TIMESTAMP) ` +
      `ON CONFLICT ("documentNumber") DO UPDATE SET ` +
      `"entityType" = EXCLUDED."entityType", ` +
      `"status" = EXCLUDED."status", ` +
      `"formationDate" = EXCLUDED."formationDate", ` +
      `"arYears" = EXCLUDED."arYears", ` +
      `"sourceFileDate" = EXCLUDED."sourceFileDate", ` +
      `"updatedAt" = CURRENT_TIMESTAMP ` +
      `WHERE "SunbizArCandidate"."sourceFileDate" <= EXCLUDED."sourceFileDate";`
    );
  }
  return (
    `DELETE FROM "SunbizArCandidate" ` +
    `WHERE "documentNumber" = ${sqlString(record.documentNumber)} ` +
    `AND "sourceFileDate" <= DATE ${sqlString(record.sourceFileDate)};`
  );
}

function chunkHeader(year) {
  return (
    `-- Sunbiz annual report candidates. Target year ${year}.\n` +
    `-- Idempotent. A later sourceFileDate wins. Safe to run again.\n`
  );
}

function chunkBodies(statements, year, chunkSize) {
  const size = Math.max(1, chunkSize);
  const chunks = [];
  const header = chunkHeader(year);
  for (let i = 0; i < statements.length; i += size) {
    const body = statements.slice(i, i + size).join('\n');
    chunks.push(`${header}${body}\n`);
  }
  return chunks;
}

/**
 * One guarded delete for every document number in the chunk.
 * Callers group by source file date first, so the date guard matches each row.
 */
export function deleteStatementForDocuments(documentNumbers, sourceFileDate) {
  const list = documentNumbers.map((doc) => sqlString(doc)).join(', ');
  return (
    `DELETE FROM "SunbizArCandidate" ` +
    `WHERE "documentNumber" IN (${list}) ` +
    `AND "sourceFileDate" <= DATE ${sqlString(sourceFileDate)};`
  );
}

export function buildSunbizArSql({ records, year, chunkSize = CHUNK_SIZE, candidatesOnly = false }) {
  const size = Math.max(1, chunkSize);
  const insertStatements = [];
  const deletesByDate = new Map();
  for (const record of dedupeRecords(records)) {
    if (isArCandidate(record, year)) {
      insertStatements.push(statementForRecord(record, year));
      continue;
    }
    if (candidatesOnly) continue;
    const bucket = deletesByDate.get(record.sourceFileDate) ?? [];
    bucket.push(record.documentNumber);
    deletesByDate.set(record.sourceFileDate, bucket);
  }
  const chunks = chunkBodies(insertStatements, year, size);
  const dates = [...deletesByDate.keys()].sort();
  for (const sourceFileDate of dates) {
    const docs = deletesByDate.get(sourceFileDate);
    for (let i = 0; i < docs.length; i += size) {
      const body = deleteStatementForDocuments(docs.slice(i, i + size), sourceFileDate);
      chunks.push(`${chunkHeader(year)}${body}\n`);
    }
  }
  return chunks;
}

export function writeSqlChunks(chunks, outDir, prefix = 'sunbiz-ar') {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  chunks.forEach((sql, index) => {
    const name = `${prefix}-${String(index + 1).padStart(4, '0')}.sql`;
    const file = path.join(outDir, name);
    fs.writeFileSync(file, sql);
    written.push(file);
  });
  return written;
}

export async function applySqlChunks(chunks, env = process.env) {
  const databaseUrl = databaseUrlFrom(env);
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  try {
    for (const chunk of chunks) {
      const statements = chunk
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('--'));
      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function usage() {
  return [
    'Usage:',
    '  unzip -p cordata.zip | node scripts/sunbiz-ar-import.mjs --source-date 2026-10-07 --year 2026 --out tmp/sunbiz-ar',
    '  node scripts/sunbiz-ar-import.mjs --input <file|-> [--filename <name>] [--out <dir>] [--year <yyyy>] [--source-date <yyyy-mm-dd>] [--chunk-size 2000] [--candidates-only] [--db]',
    '  node scripts/sunbiz-ar-import.mjs --delete <doc-number-list> [--out <dir>] [--chunk-size 2000] [--db]',
    'CSV columns: doc_number, entity_type, status, formation_date, ar_year_1, ar_year_2, ar_year_3, source_file_date',
    'entity_type is the raw Sunbiz filing type (FLAL, FORL, DOMP, DOMNP, FORP, FORNP).',
    'Fixed-width: Florida cordata / daily cor layout, 1440 characters (https://dos.sunbiz.org/data-definitions/cor.html).',
    'This script does not unzip. The quarterly zip is Deflate64. Pipe extracted text or pass a .txt/.csv file.',
    '--input - reads stdin. A pipe with no --input also reads stdin.',
    '--delete reads one document number per line and emits unconditional DELETE chunks.',
    '--candidates-only writes upserts and skips deletes for non-candidates.',
    'Without that flag, non-candidates are one DELETE ... IN (...) per chunk.',
    'Daily c files contain only new filings. Removals belong in --delete, not in the c file.',
    'Writes SQL chunks. Does not connect unless you pass --db and DATABASE_URL is set.',
  ].join('\n');
}

function stdinIsPiped() {
  // A terminal sets isTTY to true. A pipe leaves it unset.
  return process.stdin.isTTY !== true;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
  });
}

async function readCandidateText(input) {
  if (!input || input === '-') return readStdin();
  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }
  return fs.readFileSync(input, 'utf8');
}

function parseChunkSize(argv) {
  const chunkArg = readArg(argv, '--chunk-size');
  const chunkSize = chunkArg ? Number(chunkArg) : CHUNK_SIZE;
  if (!Number.isInteger(chunkSize) || chunkSize < 1) return null;
  return chunkSize;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return 0;
  }
  const deleteFile = readArg(argv, '--delete');
  const inputArg = readArg(argv, '--input');
  const piped = stdinIsPiped();
  const wantsCandidates = Boolean(inputArg) || (piped && !deleteFile);
  if (!deleteFile && !inputArg && !piped) {
    console.log(usage());
    return 1;
  }
  const chunkSize = parseChunkSize(argv);
  if (chunkSize === null) {
    console.error('--chunk-size must be a positive integer');
    return 1;
  }
  const outDir = readArg(argv, '--out') || path.join('tmp', 'sunbiz-ar-sql');
  const sqlChunks = [];

  if (deleteFile) {
    if (!fs.existsSync(deleteFile)) {
      console.error(`Delete list not found: ${deleteFile}`);
      return 1;
    }
    const docs = parseDeleteList(fs.readFileSync(deleteFile, 'utf8'));
    const chunks = buildDeleteSql(docs, chunkSize);
    const files = writeSqlChunks(chunks, outDir, 'sunbiz-ar-delete');
    console.log(`Wrote ${files.length} delete file(s) to ${outDir} (${docs.length} document number(s)).`);
    sqlChunks.push(...chunks);
  }

  if (wantsCandidates) {
    const yearArg = readArg(argv, '--year');
    const year = yearArg ? Number(yearArg) : easternYear();
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      console.error('--year must be a four digit year');
      return 1;
    }
    const sourceDateArg = readArg(argv, '--source-date');
    if (sourceDateArg && !parseLooseDate(sourceDateArg)) {
      console.error('--source-date must be YYYY-MM-DD');
      return 1;
    }
    const filenameArg = readArg(argv, '--filename');
    const filename = inputArg && inputArg !== '-' ? inputArg : filenameArg || '';
    let text;
    try {
      text = await readCandidateText(inputArg && inputArg !== '-' ? inputArg : '-');
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
    let records;
    try {
      records = parseSunbizArInput({
        text,
        filename,
        sourceDate: sourceDateArg ? parseLooseDate(sourceDateArg) : null,
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
    const chunks = buildSunbizArSql({
      records,
      year,
      chunkSize,
      candidatesOnly: argv.includes('--candidates-only'),
    });
    const files = writeSqlChunks(chunks, outDir);
    const inserts = chunks.join('\n').split('INSERT INTO').length - 1;
    const deletes = chunks.join('\n').split('DELETE FROM').length - 1;
    console.log(
      `Wrote ${files.length} file(s) to ${outDir} (${inserts} insert, ${deletes} delete, target year ${year}).`,
    );
    sqlChunks.push(...chunks);
  }

  if (!argv.includes('--db')) return 0;
  if (!databaseUrlFrom(env)) {
    console.error('DATABASE_URL is not set. The SQL files were written. Apply them in Supabase, or set DATABASE_URL and pass --db.');
    return 1;
  }
  await applySqlChunks(sqlChunks, env);
  console.log('Applied SQL with DATABASE_URL.');
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    },
  );
}
