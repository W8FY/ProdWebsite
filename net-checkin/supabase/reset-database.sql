-- W8FY Amateur Radio Net Check-In — development/test database reset
--
-- DESTRUCTIVE SCOPE:
--   1. public.net_checkins (dropped first because it references public.nets)
--   2. public.nets
--
-- No CASCADE is used. If an unexpected external dependency exists, PostgreSQL
-- will stop and roll back the transaction instead of deleting that dependency.
-- This file does not delete the Supabase project or touch Auth, Storage, Edge
-- Functions, or any unrelated table/schema.
--
-- Review this complete file before running it in the Supabase SQL Editor.

begin;

drop table if exists public.net_checkins;
drop table if exists public.nets;

create table public.nets (
  id uuid primary key default gen_random_uuid(),
  net_date date not null,
  net_control_callsign text not null,
  net_control_station_type text not null,
  net_control_traffic boolean not null,
  start_time time without time zone not null,
  end_time time without time zone,
  finalized boolean not null default false,
  email_sent boolean not null default false,
  email_sent_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint nets_callsign_uppercase_check
    check (
      net_control_callsign = upper(btrim(net_control_callsign))
      and length(btrim(net_control_callsign)) > 0
    ),
  constraint nets_station_type_check
    check (net_control_station_type in ('Home', 'Mobile', 'EchoLink', 'Short Time')),
  constraint nets_finalized_end_time_check
    check (not finalized or end_time is not null),
  constraint nets_email_status_check
    check (
      (email_sent = true and email_sent_at is not null)
      or (email_sent = false and email_sent_at is null)
    )
);

create table public.net_checkins (
  id uuid primary key default gen_random_uuid(),
  net_id uuid not null,
  callsign text not null,
  station_type text not null,
  traffic boolean not null,
  is_net_control boolean not null default false,
  created_at timestamp with time zone not null default now(),

  constraint net_checkins_net_id_fkey
    foreign key (net_id) references public.nets(id) on delete cascade,
  constraint net_checkins_callsign_uppercase_check
    check (
      callsign = upper(btrim(callsign))
      and length(btrim(callsign)) > 0
    ),
  constraint net_checkins_station_type_check
    check (station_type in ('Home', 'Mobile', 'EchoLink', 'Short Time')),
  constraint net_checkins_net_callsign_unique
    unique (net_id, callsign)
);

-- Enforce at most one Net Control row per net. The application
-- creates that row as the first check-in.
create unique index net_checkins_one_control_per_net_idx
  on public.net_checkins (net_id)
  where is_net_control = true;

-- Supports restoring the newest active net.
create index nets_active_created_idx
  on public.nets (finalized, created_at desc);

-- Supports loading a net roster in stable creation order.
create index net_checkins_net_created_idx
  on public.net_checkins (net_id, created_at);

alter table public.nets enable row level security;
alter table public.net_checkins enable row level security;

-- Start from no browser privileges, then grant only operations used by the
-- current unauthenticated application. The Edge Function's protected server
-- credential is not used by browser code and is not configured in this file.
revoke all on table public.nets from anon, authenticated;
revoke all on table public.net_checkins from anon, authenticated;

grant select on table public.nets to anon;
grant insert (
  net_date,
  net_control_callsign,
  net_control_station_type,
  net_control_traffic,
  start_time
) on table public.nets to anon;
grant update (end_time, finalized) on table public.nets to anon;

grant select on table public.net_checkins to anon;
grant insert (
  net_id,
  callsign,
  station_type,
  traffic,
  is_net_control
) on table public.net_checkins to anon;
grant delete on table public.net_checkins to anon;

create policy "Public can read nets"
on public.nets
for select
to anon
using (true);

create policy "Public can create open nets"
on public.nets
for insert
to anon
with check (
  finalized = false
  and end_time is null
  and email_sent = false
  and email_sent_at is null
  and net_control_callsign = upper(btrim(net_control_callsign))
);

create policy "Public can finalize open nets"
on public.nets
for update
to anon
using (finalized = false)
with check (
  finalized = true
  and end_time is not null
  and email_sent = false
  and email_sent_at is null
);

create policy "Public can read check-ins"
on public.net_checkins
for select
to anon
using (true);

create policy "Public can add check-ins to open nets"
on public.net_checkins
for insert
to anon
with check (
  callsign = upper(btrim(callsign))
  and exists (
    select 1
    from public.nets
    where nets.id = net_checkins.net_id
      and nets.finalized = false
      and (
        net_checkins.is_net_control = false
        or (
          net_checkins.callsign = nets.net_control_callsign
          and net_checkins.station_type = nets.net_control_station_type
          and net_checkins.traffic = nets.net_control_traffic
        )
      )
  )
);

create policy "Public can remove normal check-ins from open nets"
on public.net_checkins
for delete
to anon
using (
  is_net_control = false
  and exists (
    select 1
    from public.nets
    where nets.id = net_checkins.net_id
      and nets.finalized = false
  )
);

comment on table public.nets is
  'W8FY net sessions. Anonymous clients may create/read sessions and finalize an open session, but may not delete one or set email status.';

comment on table public.net_checkins is
  'W8FY net check-ins. Anonymous clients may add/read rows and remove normal rows from an open net, but may not update rows or delete Net Control.';

commit;
