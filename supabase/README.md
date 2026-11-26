# Supabase database

## Connected project

OpenView uses the Supabase project [lucas-manoguerra-openview-project](https://supabase.com/dashboard/project/gaufcmalucbounmtrgal) (`gaufcmalucbounmtrgal`). The project is in `us-east-1` and runs PostgreSQL 17.

The repository includes `supabase/config.toml` for local CLI configuration and a root `.env.example` containing the public project URL and publishable key. Copy it to `.env` for local development. The publishable key is intended for client use and is not an authorization boundary; RLS is. Never add a Supabase secret/service-role key to browser configuration or source control.

Link a local checkout from the repository root:

```bash
supabase link --project-ref gaufcmalucbounmtrgal
supabase migration list --linked
```

The Supabase CLI v3 targets the local stack by default. Use explicit linked-project flags when intentionally inspecting or changing the hosted database, and review its confirmation prompt before applying remote changes.

## Chart drawings migration

The hosted project has migration versions `20261126111503` and `20261126111929` applied. Keep both migration filenames aligned with those recorded versions so `supabase db push` does not replay already-applied schema changes.

The second migration revokes direct Data API execution of the pre-existing `public.rls_auto_enable()` SECURITY DEFINER event-trigger function for `anon` and `authenticated`. The database event trigger remains enabled; only direct RPC execution by client roles is revoked. This removed the project's two security advisor warnings.

`20261126111503_create_chart_drawings.sql` creates `public.chart_drawings` with:

- One durable row per authenticated user, canonical instrument ID and drawing UUID.
- `timeframe_scope = NULL` for drawings visible on every timeframe; a concrete value limits visibility to that timeframe.
- A JSONB drawing payload containing only confirmed drawing properties.
- Server-managed creation/update timestamps and optimistic revision numbers.
- Row Level Security for authenticated users, restricted to rows whose `user_id` matches `auth.uid()`.

The table is granted to `authenticated` only. Anonymous access is revoked. Terminal clients must use the authenticated Supabase session and the publishable key; never ship a service-role key to the browser.

Generated database types are checked in at `apps/terminal/src/lib/supabase/database.types.ts`. Regenerate them after schema changes.

## Repository write contract

- Insert with the authenticated user's UUID and initial revision omitted (the database initializes it to `1`).
- Update with a filter on the full row identity and the revision last observed by the client. A successful update returns the incremented revision.
- A zero-row update/delete means the row is missing, inaccessible under RLS, or stale; treat it as a conflict and refresh before retrying.
- The database owns `created_at`, `updated_at` and `revision`. Do not use client timestamps or client-computed revisions as authority.
- Do not change `user_id`, `instrument_id`, `drawing_id` or `timeframe_scope` as part of an ordinary drawing update. Moving a drawing between scopes must be an explicit future repository operation.

## Scope of this stage

This stage establishes the remote database, RLS, local CLI project configuration and generated database types. It does not add Supabase SDK dependencies, authentication UI, session management, remote repository wiring, offline synchronization, or local-to-account migration. Those remain Terminal responsibilities and must be implemented behind the existing `DrawingRepository` interface. The Chart package must not import Supabase or know this schema exists.

## Verification status

- [x] Migration applied to the connected Supabase project.
- [x] Table, columns, primary key and foreign key verified.
- [x] RLS and FORCE RLS enabled; four ownership policies verified.
- [x] Anonymous table privileges revoked; authenticated CRUD granted.
- [x] Database TypeScript types generated from the hosted schema.
- [ ] Verify authenticated CRUD and cross-user isolation with two real test accounts.
- [ ] Verify revision conflict behavior through the Terminal repository adapter.
- [ ] Run application CI and integration tests before enabling remote persistence.

The remote repository must not be enabled in the application until the remaining account-level tests pass.
