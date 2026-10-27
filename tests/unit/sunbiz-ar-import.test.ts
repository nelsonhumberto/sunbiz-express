import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORDATA_RECORD_LENGTH,
  CHUNK_SIZE,
  buildDeleteSql,
  buildSunbizArSql,
  databaseUrlFrom,
  deleteStatementForDocuments,
  statementForRecord,
  isArCandidate,
  parseDeleteList,
  parseSunbizArInput,
  sourceDateFromFilename,
} from '../../scripts/sunbiz-ar-import.mjs';

const YEAR = 2026;

// Florida corporate file positions are 1-based.
// https://dos.sunbiz.org/data-definitions/cor.html
// Corporation Number 1-12, Status 205, Filing Type 206-220,
// File Date 473-480 (MMDDYYYY), Report Years 506-509, 519-522, 532-535.
function fixedRecord(fields: {
  documentNumber: string;
  status: string;
  entityType: string;
  fileDate: string;
  year1?: string;
  year2?: string;
  year3?: string;
  date1?: string;
}): string {
  const chars = Array.from({ length: CORDATA_RECORD_LENGTH }, () => ' ');
  const put = (start: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) chars[start - 1 + i] = value[i];
  };
  put(1, fields.documentNumber.padEnd(12, ' '));
  put(205, fields.status);
  put(206, fields.entityType.padEnd(15, ' '));
  put(473, fields.fileDate);
  put(506, (fields.year1 ?? '').padEnd(4, ' '));
  put(511, (fields.date1 ?? '').padEnd(8, ' '));
  put(519, (fields.year2 ?? '').padEnd(4, ' '));
  put(532, (fields.year3 ?? '').padEnd(4, ' '));
  return chars.join('');
}

describe('sunbiz annual report import', () => {
  it('reads the csv fixture and deletes records that are no longer candidates', () => {
    const text = readFileSync(path.join('tests/fixtures/sunbiz-ar/candidates.csv'), 'utf8');
    const records = parseSunbizArInput({ text, filename: 'candidates.csv' });
    expect(records).toHaveLength(6);
    const chunks = buildSunbizArSql({ records, year: YEAR, chunkSize: CHUNK_SIZE });
    expect(chunks).toHaveLength(2);
    const sql = chunks[0];
    expect(sql).toContain('INSERT INTO "SunbizArCandidate"');
    expect(sql).toContain("'L25000509630'");
    expect(sql).toContain("DATE '2025-04-02'");
    expect(sql).toContain('ARRAY[2024, 2025]::INTEGER[]');
    expect(sql).toContain("DATE '2026-10-01'");
    expect(sql).toContain('ON CONFLICT ("documentNumber") DO UPDATE');
    expect(sql).toContain('WHERE "SunbizArCandidate"."sourceFileDate" <= EXCLUDED."sourceFileDate"');
    const joined = chunks.join('\n');
    expect(joined).toContain(
      `DELETE FROM "SunbizArCandidate" WHERE "documentNumber" IN ('L15000021030', 'L25000294800', 'L26000537730') AND "sourceFileDate" <= DATE '2026-10-01';`,
    );
    expect(joined.match(/DELETE FROM/g)).toHaveLength(1);
    expect(sql).toContain("'L11000000001'");
    expect(sql).toContain("DATE '2026-10-25'");
    const sellable = records.find((row) => row.documentNumber === 'L25000509630');
    expect(sellable?.sourceFileDate).toBe('2026-10-01');
    expect(isArCandidate(sellable, YEAR)).toBe(true);
    expect(sql.match(/L25000509630/g)?.length).toBe(1);
  });

  it('reads a fixed-width cor file, including a later delete', () => {
    expect(sourceDateFromFilename('20261025c.txt')).toBe('2026-10-25');
    const lines = [
      fixedRecord({
        documentNumber: 'L25000509630',
        status: 'A',
        entityType: 'FLAL',
        fileDate: '04022025',
        year1: '2024',
        year2: '2025',
      }),
      fixedRecord({
        documentNumber: 'L15000021030',
        status: 'A',
        entityType: 'FLAL',
        fileDate: '04102015',
        year1: '2026',
      }),
      fixedRecord({
        documentNumber: 'L25000294800',
        status: 'I',
        entityType: 'FLAL',
        fileDate: '02012025',
        year1: '2025',
      }),
      fixedRecord({
        documentNumber: 'L26000537730',
        status: 'A',
        entityType: 'FLAL',
        fileDate: '10192026',
      }),
      fixedRecord({
        documentNumber: 'L25000509630',
        status: 'I',
        entityType: 'FLAL',
        fileDate: '04022025',
        year1: '2024',
      }),
    ];
    expect(lines[0]).toHaveLength(CORDATA_RECORD_LENGTH);
    const records = parseSunbizArInput({
      text: `${lines.join('\n')}\n`,
      filename: '20261025c.txt',
    });
    const kept = [...records].reverse().find((row) => row.documentNumber === 'L25000509630');
    expect(kept).toMatchObject({
      entityType: 'FLAL',
      status: 'I',
      formationDate: '2025-04-02',
      arYears: [2024],
      sourceFileDate: '2026-10-25',
    });
    expect(isArCandidate(kept, YEAR)).toBe(false);
    const chunksForDeletes = buildSunbizArSql({ records, year: YEAR, chunkSize: 2 });
    const sql = chunksForDeletes.join('\n');
    expect(sql).not.toContain('INSERT INTO "SunbizArCandidate"');
    expect(sql).toContain(
      `DELETE FROM "SunbizArCandidate" WHERE "documentNumber" IN ('L15000021030', 'L25000294800') AND "sourceFileDate" <= DATE '2026-10-25';`,
    );
    expect(sql).toContain(
      `DELETE FROM "SunbizArCandidate" WHERE "documentNumber" IN ('L25000509630', 'L26000537730') AND "sourceFileDate" <= DATE '2026-10-25';`,
    );
    expect(chunksForDeletes).toHaveLength(2);
  });

  it('lets the later source date win inside one file', () => {
    const records = parseSunbizArInput({
      text: [
        'doc_number,entity_type,status,formation_date,ar_year_1,ar_year_2,ar_year_3,source_file_date',
        'L25000509630,FLAL,I,2025-04-02,2025,,,2026-10-01',
        'L25000509630,FLAL,A,2025-04-02,2024,2025,,2026-10-25',
      ].join('\n'),
      filename: 'later.csv',
    });
    const sql = buildSunbizArSql({ records, year: YEAR })[0];
    expect(sql).toContain('INSERT INTO "SunbizArCandidate"');
    expect(sql).toContain("DATE '2026-10-25'");
    expect(sql).not.toContain('DELETE FROM');
  });

  it('excludes partnerships and trusts, and reads a blank report year from the report date', () => {
    const records = parseSunbizArInput({
      text: [
        fixedRecord({
          documentNumber: 'L25000509630',
          status: 'A',
          entityType: 'FLAL',
          fileDate: '04022025',
          date1: '04152025',
        }),
        fixedRecord({
          documentNumber: 'L25000000002',
          status: 'A',
          entityType: 'TRUST',
          fileDate: '04022015',
          year1: '2025',
        }),
        fixedRecord({
          documentNumber: 'L25000000003',
          status: 'A',
          entityType: 'DOMLP',
          fileDate: '04022015',
        }),
      ].join('\n'),
      filename: '20261007c.txt',
    });
    expect(records.find((row) => row.documentNumber === 'L25000509630')?.arYears).toEqual([2025]);
    expect(isArCandidate(records[0], YEAR)).toBe(true);
    expect(isArCandidate(records[1], YEAR)).toBe(false);
    expect(isArCandidate(records[2], YEAR)).toBe(false);
    const sql = buildSunbizArSql({ records, year: YEAR }).join('\n');
    expect(sql).toContain(`'FLAL'`);
    expect(sql).toContain('ARRAY[2025]::INTEGER[]');
    expect(sql.match(/INSERT INTO/g)).toHaveLength(1);
    expect(sql).toContain(
      `DELETE FROM "SunbizArCandidate" WHERE "documentNumber" IN ('L25000000002', 'L25000000003') AND "sourceFileDate" <= DATE '2026-10-07';`,
    );
    const candidatesOnly = buildSunbizArSql({ records, year: YEAR, candidatesOnly: true }).join('\n');
    expect(candidatesOnly).not.toContain('DELETE FROM');
    expect(candidatesOnly).toContain('INSERT INTO "SunbizArCandidate"');
  });

  it('emits unconditional deletes for a document-number list', () => {
    const docs = parseDeleteList('# already filed\n\nL25000509630\nl25000509630\nnot a doc\nP26QA000001\n');
    expect(docs).toEqual(['L25000509630', 'P26QA000001']);
    const sql = buildDeleteSql(docs, 1).join('\n');
    expect(sql).toContain(`DELETE FROM "SunbizArCandidate" WHERE "documentNumber" = 'L25000509630';`);
    expect(sql).toContain(`DELETE FROM "SunbizArCandidate" WHERE "documentNumber" = 'P26QA000001';`);
    expect(sql).not.toContain('sourceFileDate');
    expect(buildDeleteSql(docs, 1)).toHaveLength(2);
  });

  it('keeps a candidates-only load as upsert chunks with no deletes', () => {
    const records = parseSunbizArInput({
      text: [
        'doc_number,entity_type,status,formation_date,ar_year_1,ar_year_2,ar_year_3,source_file_date',
        'L11000000001,FLAL,A,2011-01-15,2023,2024,2025,2026-10-07',
        'L25000509630,FLAL,A,2025-04-02,2024,2025,,2026-10-07',
        'L25000000002,TRUST,A,2015-04-02,2025,,,2026-10-07',
      ].join('\n'),
      filename: 'candidates_load.csv',
    });
    const kept = records.filter((row) => isArCandidate(row, YEAR));
    const expected = buildSunbizArSql({ records: kept, year: YEAR, chunkSize: 1 });
    const flagged = buildSunbizArSql({ records, year: YEAR, chunkSize: 1, candidatesOnly: true });
    expect(flagged.join('')).toBe(expected.join(''));
    expect(flagged).toHaveLength(2);
    expect(flagged.join('')).not.toContain('DELETE FROM');
    expect(flagged[0]).toBe(
      `-- Sunbiz annual report candidates. Target year ${YEAR}.\n` +
        `-- Idempotent. A later sourceFileDate wins. Safe to run again.\n` +
        `${statementForRecord(kept[0], YEAR)}\n`,
    );
    expect(deleteStatementForDocuments(['L25000000002', 'L25000000003'], '2026-10-07')).toBe(
      `DELETE FROM "SunbizArCandidate" WHERE "documentNumber" IN ('L25000000002', 'L25000000003') AND "sourceFileDate" <= DATE '2026-10-07';`,
    );
  });

  it('does not connect unless DATABASE_URL is set', () => {
    expect(databaseUrlFrom({ DATABASE_URL: '' })).toBeNull();
    expect(databaseUrlFrom({ DATABASE_URL: 'postgres://example' })).toBe('postgres://example');
  });
});
