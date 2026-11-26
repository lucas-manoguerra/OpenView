-- Durable, account-owned chart drawings.
-- Chart remains unaware of this schema; only Terminal repositories access it.

create table if not exists public.chart_drawings (
  user_id uuid not null references auth.users (id) on delete cascade,
  instrument_id text not null,
  timeframe_scope text,
  drawing_id uuid not null,
  payload jsonb not null,
  z_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,

  constraint chart_drawings_pkey
    primary key (user_id, instrument_id, drawing_id),
  constraint chart_drawings_instrument_id_nonempty
    check (length(btrim(instrument_id)) > 0),
  constraint chart_drawings_timeframe_scope_nonempty
    check (timeframe_scope is null or length(btrim(timeframe_scope)) > 0),
  constraint chart_drawings_payload_object
    check (jsonb_typeof(payload) = 'object'),
  constraint chart_drawings_payload_type
    check (payload ->> 'type' in (
      'trend-line',
      'ray',
      'horizontal-line',
      'vertical-line',
      'rectangle'
    )),
  constraint chart_drawings_payload_start
    check (
      jsonb_typeof(payload -> 'start') = 'object'
      and jsonb_typeof(payload #> '{start,timestamp}') = 'number'
      and jsonb_typeof(payload #> '{start,price}') = 'number'
    ),
  constraint chart_drawings_payload_end
    check (
      payload -> 'end' = 'null'::jsonb
      or (
        jsonb_typeof(payload -> 'end') = 'object'
        and jsonb_typeof(payload #> '{end,timestamp}') = 'number'
        and jsonb_typeof(payload #> '{end,price}') = 'number'
      )
    ),
  constraint chart_drawings_payload_color
    check (jsonb_typeof(payload -> 'color') = 'string'),
  constraint chart_drawings_z_order_nonnegative
    check (z_order >= 0),
  constraint chart_drawings_revision_positive
    check (revision > 0)
);

comment on table public.chart_drawings is
  'Durable user-owned drawing documents. Runtime Chart state and market data are not stored here.';
comment on column public.chart_drawings.timeframe_scope is
  'NULL means visible on every timeframe; otherwise the canonical timeframe identifier.';
comment on column public.chart_drawings.payload is
  'Versioned serializable drawing properties only; excludes selection, hover, previews and undo history.';
comment on column public.chart_drawings.revision is
  'Server-managed optimistic concurrency revision, starting at 1.';

create index if not exists chart_drawings_scope_order_idx
  on public.chart_drawings (user_id, instrument_id, timeframe_scope, z_order);

create index if not exists chart_drawings_global_order_idx
  on public.chart_drawings (user_id, instrument_id, z_order)
  where timeframe_scope is null;

create or replace function public.set_chart_drawing_update_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.instrument_id is distinct from old.instrument_id
    or new.drawing_id is distinct from old.drawing_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Drawing ownership and identity fields are immutable'
      using errcode = '22000';
  end if;

  new.updated_at := pg_catalog.now();
  new.revision := old.revision + 1;
  return new;
end;
$$;

revoke all on function public.set_chart_drawing_update_metadata() from public;

drop trigger if exists chart_drawings_update_metadata on public.chart_drawings;
create trigger chart_drawings_update_metadata
before update on public.chart_drawings
for each row
execute function public.set_chart_drawing_update_metadata();

alter table public.chart_drawings enable row level security;
alter table public.chart_drawings force row level security;

revoke all on table public.chart_drawings from anon, public;
grant select, insert, update, delete on table public.chart_drawings to authenticated;

drop policy if exists chart_drawings_select_own on public.chart_drawings;
create policy chart_drawings_select_own
  on public.chart_drawings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists chart_drawings_insert_own on public.chart_drawings;
create policy chart_drawings_insert_own
  on public.chart_drawings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists chart_drawings_update_own on public.chart_drawings;
create policy chart_drawings_update_own
  on public.chart_drawings
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists chart_drawings_delete_own on public.chart_drawings;
create policy chart_drawings_delete_own
  on public.chart_drawings
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
