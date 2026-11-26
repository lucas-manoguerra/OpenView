# Supabase database

## Chart drawings migration

Apply migrations in `supabase/migrations` to the Supabase project before enabling a remote Terminal drawing repository.

`20261126120000_create_chart_drawings.sql` creates `public.chart_drawings` with:

- One durable row per authenticated user, canonical instrument ID and drawing UUID.
- `timeframe_scope = NULL` for drawings visible on every timeframe; a concrete value limits visibility to that timeframe.
- A JSONB drawing payload containing only confirmed drawing properties.
- Server-managed creation/update timestamps and optimistic revision numbers.
- Row Level Security for authenticated users, restricted to rows whose `user_id` matches `auth.uid()`.

The migration deliberately does not create a client-facing service-role path. Terminal clients must use the authenticated Supabase session and the publishable/anon key; never ship a service-role key to the browser.

## Repository write contract

- Insert with the authenticated user's UUID and initial revision omitted (the database initializes it to `1`).
- Update with a filter on the full row identity and the revision last observed by the client. A successful update returns the incremented revision.
- A zero-row update/delete means the row is missing, inaccessible under RLS, or stale; treat it as a conflict and refresh before retrying.
- The database owns `created_at`, `updated_at` and `revision`. Do not use client timestamps or client-computed revisions as authority.
- Do not change `user_id`, `instrument_id`, `drawing_id` or `timeframe_scope` as part of an ordinary drawing update. Moving a drawing between scopes must be an explicit future repository operation.

## Scope of this migration

This is the database foundation only. It does not add Supabase SDK dependencies, authentication UI, session management, remote repository wiring, offline synchronization, or local-to-account migration. Those remain Terminal responsibilities and must be implemented behind the existing `DrawingRepository` interface. The Chart package must not import Supabase or know this schema exists.

## Verification before production

Apply the migration to a disposable Supabase project and verify at minimum:

1. An authenticated user can insert, list, update and delete their own drawing.
2. A second authenticated user cannot select, update or delete the first user's row, even when they know its UUID.
3. An insert with a different `user_id` is rejected.
4. An update filtered by a stale revision affects zero rows; a successful update increments revision exactly once.
5. Anonymous requests cannot read or write the table.
6. Global and timeframe-specific rows can be queried together without modifying their stored scope.

Do not enable remote persistence in the application until these checks pass.
