#!/usr/bin/env node
/**
 * Upload the eight Florida LLC operating agreement samples to the private
 * Supabase Storage bucket `lead-magnets`.
 *
 * The markdown files in content/oa-templates/*.md are the source of truth.
 * Rebuild the PDF and .docx files when that text changes, replace the copies
 * in content/oa-templates/downloads/, then run this script.
 *
 * Requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY. The key is never printed.
 *
 *   node scripts/upload-oa-lead-magnets.mjs
 *   node scripts/upload-oa-lead-magnets.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';

const BUCKET = 'lead-magnets';
const DIR = path.join(process.cwd(), 'content/oa-templates/downloads');
const EXPECTED = [
  'launchforma-acuerdo-operativo-llc-florida-muestra-un-miembro.docx',
  'launchforma-acuerdo-operativo-llc-florida-muestra-un-miembro.pdf',
  'launchforma-acuerdo-operativo-llc-florida-muestra-varios-miembros.docx',
  'launchforma-acuerdo-operativo-llc-florida-muestra-varios-miembros.pdf',
  'launchforma-florida-llc-operating-agreement-sample-multi-member.docx',
  'launchforma-florida-llc-operating-agreement-sample-multi-member.pdf',
  'launchforma-florida-llc-operating-agreement-sample-single-member.docx',
  'launchforma-florida-llc-operating-agreement-sample-single-member.pdf',
];

function listFiles() {
  const found = fs
    .readdirSync(DIR)
    .filter((name) => name.endsWith('.pdf') || name.endsWith('.docx'))
    .sort();
  const expected = EXPECTED.slice().sort();
  if (found.join('\n') !== expected.join('\n')) {
    console.error('content/oa-templates/downloads must contain exactly these 8 files:');
    for (const name of expected) console.error(`  ${name}`);
    process.exit(1);
  }
  return expected;
}

function contentType(name) {
  return name.endsWith('.pdf')
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function config() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(
    /\/$/,
    '',
  );
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before uploading.');
    process.exit(1);
  }
  return { base, key };
}

async function readError(response) {
  const text = await response.text();
  return text.slice(0, 300);
}

async function ensurePrivateBucket(base, key) {
  const headers = {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  };
  const created = await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
    }),
  });
  if (created.status === 200 || created.status === 201) return;
  const body = await readError(created);
  if (!/already exists|Duplicate/i.test(body) && created.status !== 409) {
    console.error(`Could not create bucket ${BUCKET}: ${created.status}`);
    process.exit(1);
  }
  const updated = await fetch(`${base}/storage/v1/bucket/${BUCKET}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ public: false }),
  });
  if (!updated.ok) {
    console.error(`Could not keep bucket ${BUCKET} private: ${updated.status}`);
    process.exit(1);
  }
}

async function uploadOne(base, key, name) {
  const bytes = fs.readFileSync(path.join(DIR, name));
  const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': contentType(name),
      'x-upsert': 'true',
      'cache-control': 'private, no-store',
    },
    body: bytes,
  });
  if (!response.ok) {
    console.error(`Upload failed for ${name}: ${response.status}`);
    process.exit(1);
  }
  console.log(`uploaded ${name}`);
}

const dryRun = process.argv.includes('--dry-run');
const files = listFiles();
if (dryRun) {
  console.log(`dry-run: ${files.length} files would upload to private bucket ${BUCKET}`);
  for (const name of files) console.log(name);
  process.exit(0);
}

const { base, key } = config();
await ensurePrivateBucket(base, key);
for (const name of files) {
  await uploadOne(base, key, name);
}
console.log(`done: ${files.length} objects in private bucket ${BUCKET}`);
