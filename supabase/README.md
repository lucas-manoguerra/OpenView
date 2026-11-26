# Supabase database

## Chart drawings migration

The hosted OpenView Supabase project has migration version `20261126111503` applied. Keep the migration filename aligned with that recorded version so `supabase db push` does not replay an already-applied schema change.

`20261126111503_create_chart_drawings.sql` creates `public.chart_drawings` with:

- One durable row per authenticated user, canonical instrument ID and drawing UUID.
- `timeframe_scope = NULL` for drawings visible on every timeframe; a concrete value limits visibility to that timeframe.
- A JSONB drawing payload containing only confirmed drawing properties.
- Server-managed creation/update timestamps and optimistic revision numbers.
- Row Level Security for authenticated users, restricted to rows whose `user_id` matches `auth.uid()`.

The table is granted to `authenticated` only. Anonymous access is revoked. Terminal clients must use the authenticated Supabase session and the publishable key; never ship a service-role key to the browser.

## Repository write contract

- Insert with the authenticated user's UUID and initial revision omitted (the database initializes it to `1`).
- Update with a filter on the full row identity and the revision last observed by the client. A successful update returns the incremented revision.
- A zero-row update/delete means the row is missing, inaccessible under RLS, or stale; treat it as a conflict and refresh before retrying.
- The database owns `created_at`, `updated_at` and `revision`. Do not use client timestamps or client-computed revisions as authority.
- Do not change `user_id`, `instrument_id`, `drawing_id` or `timeframe_scope` as part of an ordinary drawing update. Moving a drawing between scopes must be an explicit future repository operation.

## Scope of this migration

This is the database foundation only. It does not add Supabase SDK dependencies, authentication UI, session management, remote repository wiring, offline synchronization, or local-to-account migration. Those remain Terminal responsibilities and must be implemented behind the existing `DrawingRepository` interface. The Chart package must not import Supabase or know this schema exists.

## Verification status

- [x] Migration applied to the connected Supabase project.
- [x] Table, columns, primary key and foreign key verified.
- [x] RLS and FORCE RLS enabled; four ownership policies verified.
- [x] Anonymous table privileges revoked; authenticated CRUD granted.
- [ ] Verify authenticated CRUD and cross-user isolation with two real test accounts.
- [ ] Verify revision conflict behavior through the Terminal repository adapter.
- [ ] Run application CI and integration tests before enabling remote persistence.

The remote repository must not be enabled in the application until the remaining account-level tests pass.
