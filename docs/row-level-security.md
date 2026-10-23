# Row level security

Every table in the `public` schema must have row level security enabled, including `_prisma_migrations`.

When a migration creates a table, that same `migration.sql` must include:

```sql
ALTER TABLE "<Table>" ENABLE ROW LEVEL SECURITY;
```

Do not add `FORCE ROW LEVEL SECURITY`. The database owner Prisma connects as keeps access. Supabase roles `anon` and `authenticated` must not be granted privileges on these tables.

`npm run check:rls` (and CI) fails if a migration creates a table that never enables row level security. Tables created before `20261023220000_enable_rls` are covered by that migration. Tables created after it must enable RLS in the same file. When that migration runs, it also enables RLS on any other `public` table that already exists.

That migration is safe to run more than once. Production already has it applied. If Prisma should record it without executing the SQL:

```bash
npx prisma migrate resolve --applied 20261023220000_enable_rls
```
