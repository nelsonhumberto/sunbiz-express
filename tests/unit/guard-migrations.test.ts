import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addedApprovedEntries,
  destructiveKinds,
  guardMigrations,
  guardPullRequest,
  parseApprovedNames,
  previewGuardErrors,
  readMigrationFiles,
} from '../../scripts/guard-migrations.mjs';

const approvedOnMain = parseApprovedNames(
  fs.readFileSync('prisma/destructive-migrations-approved.txt', 'utf8'),
);

const HISTORICAL_UPDATES = [
  '20260804180000_add_ra_renewal_fields',
  '20261023120000_email_suppression_and_test_drafts',
  '20261023120000_payment_is_test',
  '20261023230000_extend_payment_is_test_backfill',
  '20261024220000_resume_drip_send_claim',
];

function pendingStatus(name: string) {
  return `
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-secret.example:5432"

32 migrations found in prisma/migrations
Following migration have not yet been applied:
${name}

To apply migrations in development run prisma migrate dev.
To apply migrations in production run prisma migrate deploy.
`;
}

describe('destructive SQL detector', () => {
  it('flags DROP TABLE, DROP COLUMN, and ALTER TABLE DROP', () => {
    expect(destructiveKinds('DROP TABLE "Tmp";')).toContain('DROP TABLE');
    expect(destructiveKinds('drop table if exists "Tmp";')).toContain('DROP TABLE');
    expect(destructiveKinds('ALTER TABLE "User" DROP COLUMN "liFatId";')).toEqual(
      expect.arrayContaining(['DROP COLUMN', 'ALTER TABLE ... DROP']),
    );
    expect(
      destructiveKinds('ALTER TABLE "ServiceInquiry" DROP CONSTRAINT "ServiceInquiry_pkey";'),
    ).toContain('ALTER TABLE ... DROP');
  });

  it('does not flag DROP NOT NULL or DROP DEFAULT', () => {
    expect(
      destructiveKinds('ALTER TABLE "ServiceInquiry" ALTER COLUMN "email" DROP NOT NULL;'),
    ).toEqual([]);
    expect(destructiveKinds('ALTER TABLE "User" ALTER COLUMN "note" DROP DEFAULT;')).toEqual([]);
    expect(
      destructiveKinds(
        'ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL, ALTER COLUMN "note" DROP DEFAULT;',
      ),
    ).toEqual([]);
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
    expect(destructiveKinds('ALTER TABLE "User" ALTER COLUMN "email" TYPE citext;')).toEqual([
      'ALTER COLUMN ... TYPE',
    ]);
    expect(
      destructiveKinds('ALTER TABLE "User" ALTER COLUMN "email" SET DATA TYPE citext;'),
    ).toEqual(['ALTER COLUMN ... TYPE']);
    expect(destructiveKinds('ALTER TABLE "Filing" ALTER "status" TYPE text;')).toEqual([
      'ALTER COLUMN ... TYPE',
    ]);
  });

  it('flags renames and dropped database objects', () => {
    expect(
      destructiveKinds('ALTER TABLE "User" RENAME COLUMN "liFatId" TO "linkedInId";'),
    ).toEqual(expect.arrayContaining(['RENAME COLUMN', 'ALTER TABLE ... RENAME']));
    expect(destructiveKinds('ALTER TABLE "User" RENAME TO "Users";')).toEqual(
      expect.arrayContaining(['RENAME TO', 'ALTER TABLE ... RENAME']),
    );
    expect(destructiveKinds('ALTER TYPE "Status" RENAME VALUE \'OLD\' TO \'NEW\';')).toEqual([
      'ALTER TYPE ... RENAME VALUE',
    ]);
    expect(destructiveKinds('DROP TYPE "Status";')).toEqual(['DROP TYPE']);
    expect(destructiveKinds('DROP VIEW "open_filings";')).toEqual(['DROP VIEW']);
    expect(destructiveKinds('DROP MATERIALIZED VIEW "filing_totals";')).toEqual([
      'DROP MATERIALIZED VIEW',
    ]);
    expect(destructiveKinds('DROP SCHEMA "archive";')).toEqual(['DROP SCHEMA']);
    expect(destructiveKinds('DROP SEQUENCE "Filing_id_seq";')).toEqual(['DROP SEQUENCE']);
    expect(destructiveKinds('DROP FUNCTION "touch_updated_at";')).toEqual(['DROP FUNCTION']);
    expect(destructiveKinds('DROP TRIGGER "filing_touch" ON "Filing";')).toEqual(['DROP TRIGGER']);
  });

  it('flags UPDATE statements and ignores ON UPDATE CASCADE', () => {
    expect(destructiveKinds('UPDATE "Payment" SET "isTest" = true;')).toEqual(['UPDATE']);
    expect(
      destructiveKinds('WITH doomed AS (SELECT 1) UPDATE "User" SET "role" = \'USER\';'),
    ).toEqual(['UPDATE']);
    expect(
      destructiveKinds(`
        ALTER TABLE "Filing" ADD CONSTRAINT "Filing_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        CREATE TRIGGER "filing_touch" BEFORE UPDATE ON "Filing"
          FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
      `),
    ).toEqual([]);
  });

  it('keeps a statement that follows an escaped E-string quote', () => {
    expect(destructiveKinds(String.raw`SELECT E'it\'s'); DROP TABLE "User";`)).toContain(
      'DROP TABLE',
    );
    expect(destructiveKinds(String.raw`SELECT e'it\'s'); DROP TABLE "User";`)).toContain(
      'DROP TABLE',
    );
    expect(destructiveKinds(String.raw`SELECT E'it\'; DROP TABLE "Nope"';`)).toEqual([]);
  });

  it('does not let a dollar-quoted body hide the next statement', () => {
    expect(destructiveKinds(String.raw`SELECT $tag$ ' $tag$; DROP TABLE "User";`)).toContain(
      'DROP TABLE',
    );
    expect(destructiveKinds(String.raw`SELECT $$ ' $$; DROP VIEW "legacy";`)).toContain(
      'DROP VIEW',
    );
    expect(destructiveKinds('DO $$\nDROP TABLE "User";\n$$;')).toContain('DROP TABLE');
    expect(
      destructiveKinds(String.raw`SELECT $fn$ UPDATE "User" SET "role" = 'USER'; $fn$;`),
    ).toContain('UPDATE');
  });

  it('ignores comments, quoted text, and non-destructive SQL', () => {
    const sql = `
      -- DROP TABLE "User";
      -- DELETE FROM "Filing";
      /* TRUNCATE "Payment";
         ALTER TABLE "User" DROP COLUMN "liFatId";
         ALTER TABLE "User" ALTER COLUMN "email" TYPE citext;
         UPDATE "Payment" SET "isTest" = true;
      */
      ALTER TABLE "User" ADD COLUMN "note" TEXT; -- DROP COLUMN "note"
      ALTER TABLE "User" ADD COLUMN "DROP" TEXT;
      CREATE TABLE "Widget" ("id" TEXT);
      CREATE INDEX "Widget_id_idx" ON "Widget"("id");
      INSERT INTO "Note" ("body") VALUES ('DROP TABLE "User"');
      INSERT INTO "Note" ("body") VALUES ('DELETE FROM "User"');
      ALTER TABLE "Filing" ADD CONSTRAINT "Filing_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "ServiceInquiry" ALTER COLUMN "email" DROP NOT NULL;
    `;
    expect(destructiveKinds(sql)).toEqual([]);
  });

  it('still sees destructive SQL around comments', () => {
    expect(destructiveKinds('ALTER TABLE "User" /* keep */ DROP COLUMN "liFatId";')).toContain(
      'DROP COLUMN',
    );
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

  it('fails unlisted destructive migrations outside preview', () => {
    const errors = guardMigrations({
      migrations: [drop, additive],
      approvedNames: new Set(),
    });
    expect(errors).toEqual([
      'prisma/migrations/20261025200000_drop_partner_click_id/migration.sql has destructive SQL (DROP COLUMN, ALTER TABLE ... DROP) and is not listed in prisma/destructive-migrations-approved.txt. An entry needs Nelson\'s explicit OK.',
    ]);
  });

  it('allows a listed destructive migration outside preview', () => {
    expect(
      guardMigrations({
        migrations: [drop],
        approvedNames: new Set([drop.name]),
      }),
    ).toEqual([]);
  });

  it('fails a pending destructive migration on preview even though the approved list would allow it', () => {
    const errors = previewGuardErrors({
      migrations: [drop, additive],
      statusText: pendingStatus(drop.name),
    });
    expect(errors).toEqual([
      'prisma/migrations/20261025200000_drop_partner_click_id/migration.sql is pending on the preview database and has destructive SQL (DROP COLUMN, ALTER TABLE ... DROP). Refusing to run migrate deploy. The approved list does not apply on preview.',
    ]);
    expect(errors.join('\n')).not.toMatch(/ep-secret|postgres(?:ql)?:\/\//i);
  });

  it('allows a pending migration that is not destructive', () => {
    expect(
      previewGuardErrors({
        migrations: [drop, additive],
        statusText: pendingStatus(additive.name),
      }),
    ).toEqual([]);
  });

  it('allows an already finished destructive migration on preview', () => {
    expect(
      previewGuardErrors({
        migrations: [drop],
        statusText: `
          32 migrations found in prisma/migrations

          Database schema is up to date!
        `,
      }),
    ).toEqual([]);
  });

  it('fails closed when preview pending status cannot be determined', () => {
    const errors = previewGuardErrors({
      migrations: [additive],
      statusText:
        'Error: P1001 Can\'t reach database server at `https://user:secret@ep-secret.example/neondb`',
    });
    expect(errors).toEqual([
      'Could not determine which migrations are pending on the preview database. Refusing to run migrate deploy.',
    ]);
    expect(errors.join('\n')).not.toMatch(/secret|https?:\/\//);
  });

  it('parses the approved file and matches the destructive migrations on main', () => {
    const header = fs.readFileSync('prisma/destructive-migrations-approved.txt', 'utf8');
    expect(header).toMatch(/An entry needs Nelson's explicit OK/);
    expect(header).not.toMatch(/20261024140000_service_inquiry_optional_email/);
    const migrations = readMigrationFiles('prisma/migrations');
    const destructive = migrations
      .filter((migration) => destructiveKinds(migration.sql).length > 0)
      .map((migration) => migration.name);
    expect(destructive).toEqual(HISTORICAL_UPDATES);
    expect([...approvedOnMain].sort()).toEqual(destructive);
    expect(
      guardMigrations({
        migrations,
        approvedNames: approvedOnMain,
      }),
    ).toEqual([]);
  });
});

describe('pull request guard', () => {
  const drop = {
    name: '20261025200000_drop_partner_click_id',
    file: 'prisma/migrations/20261025200000_drop_partner_click_id/migration.sql',
    sql: 'ALTER TABLE "User" DROP COLUMN "liFatId";',
  };

  it('fails a destructive migration added by the pull request when it is not approved', () => {
    const errors = guardPullRequest({
      addedMigrations: [drop],
      approvedNames: new Set(),
      approvedDiff: '',
    });
    expect(errors).toEqual([
      'prisma/migrations/20261025200000_drop_partner_click_id/migration.sql is added by this pull request and has destructive SQL (DROP COLUMN, ALTER TABLE ... DROP). It is not listed in prisma/destructive-migrations-approved.txt. An entry needs Nelson\'s explicit OK.',
    ]);
  });

  it('allows an added destructive migration that is already approved', () => {
    expect(
      guardPullRequest({
        addedMigrations: [drop],
        approvedNames: new Set([drop.name]),
        approvedDiff: '',
      }),
    ).toEqual([]);
  });

  it('fails when the pull request itself adds an approved-list entry', () => {
    const diff = `
diff --git a/prisma/destructive-migrations-approved.txt b/prisma/destructive-migrations-approved.txt
--- a/prisma/destructive-migrations-approved.txt
+++ b/prisma/destructive-migrations-approved.txt
@@ -1,0 +1,2 @@
+# An entry needs Nelson's explicit OK.
+20260804180000_add_ra_renewal_fields
`;
    expect(addedApprovedEntries(diff)).toEqual(['20260804180000_add_ra_renewal_fields']);
    const errors = guardPullRequest({
      addedMigrations: [],
      approvedNames: new Set(['20260804180000_add_ra_renewal_fields']),
      approvedDiff: diff,
    });
    expect(errors).toEqual([
      'This pull request adds 20260804180000_add_ra_renewal_fields to prisma/destructive-migrations-approved.txt. An entry needs Nelson\'s explicit OK.',
    ]);
  });
});
