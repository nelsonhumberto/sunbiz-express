import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  destructiveKinds,
  guardMigrations,
  migrationNamesFromLsTree,
  parseApprovedNames,
  readMigrationFiles,
  readOriginMainMigrationNames,
} from '../../scripts/guard-migrations.mjs';

const approvedOnMain = parseApprovedNames(
  fs.readFileSync('prisma/destructive-migrations-approved.txt', 'utf8'),
);

describe('destructive SQL detector', () => {
  it('flags DROP TABLE, DROP COLUMN, and ALTER TABLE DROP', () => {
    expect(destructiveKinds('DROP TABLE "Tmp";')).toContain('DROP TABLE');
    expect(destructiveKinds('drop table if exists "Tmp";')).toContain('DROP TABLE');
    expect(
      destructiveKinds('ALTER TABLE "User" DROP COLUMN "liFatId";'),
    ).toEqual(expect.arrayContaining(['DROP COLUMN', 'ALTER TABLE ... DROP']));
    expect(
      destructiveKinds('ALTER TABLE "ServiceInquiry" DROP CONSTRAINT "ServiceInquiry_pkey";'),
    ).toContain('ALTER TABLE ... DROP');
    expect(
      destructiveKinds('ALTER TABLE "ServiceInquiry" ALTER COLUMN "email" DROP NOT NULL;'),
    ).toEqual(['ALTER TABLE ... DROP']);
  });

  it('flags DROP INDEX, including a unique or primary key index', () => {
    expect(destructiveKinds('DROP INDEX "User_email_key";')).toEqual(['DROP INDEX']);
    expect(destructiveKinds('DROP INDEX CONCURRENTLY IF EXISTS "User_pkey";')).toEqual([
      'DROP INDEX',
    ]);
  });

  it('flags TRUNCATE, DELETE FROM, and ALTER COLUMN TYPE', () => {
    expect(destructiveKinds('TRUNCATE "User";')).toEqual(['TRUNCATE']);
    expect(destructiveKinds('TRUNCATE TABLE "Filing";')).toEqual(['TRUNCATE']);
    expect(destructiveKinds('DELETE FROM "User" WHERE "id" = \'x\';')).toEqual(['DELETE FROM']);
    expect(
      destructiveKinds('ALTER TABLE "User" ALTER COLUMN "email" TYPE citext;'),
    ).toEqual(['ALTER COLUMN ... TYPE']);
    expect(
      destructiveKinds('ALTER TABLE "User" ALTER COLUMN "email" SET DATA TYPE citext;'),
    ).toEqual(['ALTER COLUMN ... TYPE']);
    expect(destructiveKinds('ALTER TABLE "Filing" ALTER "status" TYPE text;')).toEqual([
      'ALTER COLUMN ... TYPE',
    ]);
  });

  it('ignores comments, quoted text, and non-destructive SQL', () => {
    const sql = `
      -- DROP TABLE "User";
      -- DELETE FROM "Filing";
      /* TRUNCATE "Payment";
         ALTER TABLE "User" DROP COLUMN "liFatId";
         ALTER TABLE "User" ALTER COLUMN "email" TYPE citext;
      */
      ALTER TABLE "User" ADD COLUMN "note" TEXT; -- DROP COLUMN "note"
      ALTER TABLE "User" ADD COLUMN "DROP" TEXT;
      CREATE TABLE "Widget" ("id" TEXT);
      CREATE INDEX "Widget_id_idx" ON "Widget"("id");
      INSERT INTO "Note" ("body") VALUES ('DROP TABLE "User"');
      INSERT INTO "Note" ("body") VALUES ('DELETE FROM "User"');
      UPDATE "Payment" SET "isTest" = true;
      ALTER TABLE "Filing" ADD CONSTRAINT "Filing_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
    `;
    expect(destructiveKinds(sql)).toEqual([]);
  });

  it('still sees destructive SQL around comments', () => {
    expect(
      destructiveKinds('ALTER TABLE "User" /* keep */ DROP COLUMN "liFatId";'),
    ).toContain('DROP COLUMN');
    expect(destructiveKinds('SELECT 1;\n-- noise\nDELETE FROM "User";')).toContain('DELETE FROM');
  });
});

describe('migration guard', () => {
  const drop = {
    name: '20261025200000_drop_partner_click_id',
    sql: 'ALTER TABLE "User" DROP COLUMN "liFatId";',
  };
  const additive = {
    name: '20261026000000_add_note',
    sql: 'ALTER TABLE "User" ADD COLUMN "note" TEXT;',
  };

  it('fails unlisted destructive migrations in every environment', () => {
    const errors = guardMigrations({
      migrations: [drop, additive],
      approvedNames: new Set(),
      vercelEnv: 'production',
      mainMigrationNames: null,
    });
    expect(errors).toEqual([
      'prisma/migrations/20261025200000_drop_partner_click_id/migration.sql has destructive SQL (DROP COLUMN, ALTER TABLE ... DROP) and is not listed in prisma/destructive-migrations-approved.txt. An entry needs Nelson\'s explicit OK.',
    ]);
  });

  it('allows a listed destructive migration outside preview', () => {
    const errors = guardMigrations({
      migrations: [drop],
      approvedNames: new Set([drop.name]),
      vercelEnv: 'production',
      mainMigrationNames: null,
    });
    expect(errors).toEqual([]);
  });

  it('refuses a listed destructive migration that preview would add', () => {
    const errors = guardMigrations({
      migrations: [drop, additive],
      approvedNames: new Set([drop.name]),
      vercelEnv: 'preview',
      mainMigrationNames: new Set([additive.name]),
    });
    expect(errors).toEqual([
      'prisma/migrations/20261025200000_drop_partner_click_id/migration.sql has destructive SQL (DROP COLUMN, ALTER TABLE ... DROP) and is not on origin/main. The shared preview database must not apply it from an unmerged branch.',
    ]);
  });

  it('allows a listed destructive migration that is already on main', () => {
    const errors = guardMigrations({
      migrations: [drop],
      approvedNames: new Set([drop.name]),
      vercelEnv: 'preview',
      mainMigrationNames: new Set([drop.name]),
    });
    expect(errors).toEqual([]);
  });

  it('uses the approved list only when origin/main cannot be read', () => {
    const errors = guardMigrations({
      migrations: [drop],
      approvedNames: new Set([drop.name]),
      vercelEnv: 'preview',
      mainMigrationNames: null,
    });
    expect(errors).toEqual([]);
  });

  it('allows an additive migration that is not on main', () => {
    const errors = guardMigrations({
      migrations: [additive],
      approvedNames: new Set(),
      vercelEnv: 'preview',
      mainMigrationNames: new Set(),
    });
    expect(errors).toEqual([]);
  });

  it('parses the approved file and matches the destructive migrations on main', () => {
    expect(approvedOnMain.has('20261024140000_service_inquiry_optional_email')).toBe(true);
    const header = fs.readFileSync('prisma/destructive-migrations-approved.txt', 'utf8');
    expect(header).toMatch(/An entry needs Nelson's explicit OK/);
    const migrations = readMigrationFiles('prisma/migrations');
    const destructive = migrations
      .filter((migration) => destructiveKinds(migration.sql).length > 0)
      .map((migration) => migration.name);
    expect(destructive).toEqual(['20261024140000_service_inquiry_optional_email']);
    expect([...approvedOnMain].sort()).toEqual(destructive);
    expect(
      guardMigrations({
        migrations,
        approvedNames: approvedOnMain,
        vercelEnv: 'production',
        mainMigrationNames: null,
      }),
    ).toEqual([]);
    expect(
      guardMigrations({
        migrations,
        approvedNames: approvedOnMain,
        vercelEnv: 'preview',
        mainMigrationNames: new Set(migrations.map((migration) => migration.name)),
      }),
    ).toEqual([]);
  });
});

describe('origin/main migration listing', () => {
  it('reads folder names and ignores migration_lock.toml', () => {
    const names = migrationNamesFromLsTree(`
prisma/migrations/20261024140000_service_inquiry_optional_email
prisma/migrations/migration_lock.toml
`);
    expect([...names]).toEqual(['20261024140000_service_inquiry_optional_email']);
  });

  it('returns null when fetch fails, the listing fails, or the listing is empty', () => {
    expect(
      readOriginMainMigrationNames(() => {
        throw new Error('https://example.invalid/secret');
      }),
    ).toBeNull();
    expect(
      readOriginMainMigrationNames((command, args) => {
        if (args[0] === 'fetch') return '';
        throw new Error('ls-tree failed');
      }),
    ).toBeNull();
    expect(
      readOriginMainMigrationNames((command, args) => {
        if (args[0] === 'fetch') return '';
        return 'prisma/migrations/migration_lock.toml\n';
      }),
    ).toBeNull();
  });

  it('returns folder names when fetch and ls-tree succeed', () => {
    const names = readOriginMainMigrationNames((command, args) => {
      if (args[0] === 'fetch') return '';
      return 'prisma/migrations/20260425130000_init\nprisma/migrations/migration_lock.toml\n';
    });
    expect(names).toEqual(new Set(['20260425130000_init']));
  });
});
