import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkRls,
  createdTables,
  readMigrationFiles,
  rlsEnabledTables,
  schemaModelTables,
} from '../../scripts/check-migration-rls.mjs';

const baselineSql = `
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
`;

const schema = `
model User {
  id String @id
}
`;

describe('check-migration-rls', () => {
  it('reads created and RLS-enabled table names', () => {
    const sql = `
      -- CREATE TABLE "Ignored" (
      CREATE TABLE "Widget" ("id" TEXT);
      ALTER TABLE "Widget" ENABLE ROW LEVEL SECURITY;
    `;
    expect(createdTables(sql)).toEqual(['Widget']);
    expect(rlsEnabledTables(sql)).toEqual(['Widget']);
  });

  it('uses @@map as the table name', () => {
    expect(
      schemaModelTables(`
        model Widget {
          id String
          @@map("widgets")
        }
      `),
    ).toEqual(['widgets']);
  });

  it('fails when a later migration creates a table without RLS', () => {
    const errors = checkRls({
      schema,
      migrations: [
        { name: '20261023220000_enable_rls', sql: baselineSql },
        { name: '20261024000000_add_widget', sql: 'CREATE TABLE "Widget" ("id" TEXT);' },
      ],
    });
    expect(errors).toContain(
      '20261024000000_add_widget creates "Widget" but no migration enables row level security on it',
    );
  });

  it('passes when the same migration enables RLS', () => {
    const errors = checkRls({
      schema,
      migrations: [
        { name: '20261023220000_enable_rls', sql: baselineSql },
        {
          name: '20261024000000_add_widget',
          sql: `
            CREATE TABLE "Widget" ("id" TEXT);
            ALTER TABLE "Widget" ENABLE ROW LEVEL SECURITY;
          `,
        },
      ],
    });
    expect(errors).toEqual([]);
  });

  it('accepts the migrations in this repo', () => {
    const errors = checkRls({
      schema: fs.readFileSync('prisma/schema.prisma', 'utf8'),
      migrations: readMigrationFiles('prisma/migrations'),
    });
    expect(errors).toEqual([]);
  });

  it('fails when a schema table is never enabled', () => {
    const errors = checkRls({
      schema,
      migrations: [{ name: '20261023220000_enable_rls', sql: 'ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;' }],
    });
    expect(errors).toContain(
      'public table "_prisma_migrations" has no ENABLE ROW LEVEL SECURITY in prisma/migrations',
    );
  });
});
