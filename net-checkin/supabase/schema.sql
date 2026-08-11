-- W8FY Amateur Radio Net Check-In — Stage 3
-- Run this complete file in the Supabase SQL Editor.
--
-- Security model for Stage 3:
--   * The browser uses only the public anon/publishable key.
--   * RLS is enabled on both tables.
--   * anon can select/insert nets and can only update end_time/finalized.
--   * anon cannot delete nets or update/delete Net Control check-ins.
--   * New check-ins can only be added to a non-finalized net.
--
-- Without authentication, any visitor holding the public key is still an
-- anonymous user. These policies are intentionally limited, but ownership and
-- operator-specific authorization require a later authenticated stage.

create extension if not exists pgcrypto;

create table if not exists public.nets (
  id uuid primary key default gen_random_uuid(),
  net_date date not null,
  net_control_callsign text not null,
  net_control_station_type text not null,
  net_control_traffic boolean not null,
  start_time time without time zone not null,
  end_time time without time zone,
  finalized boolean not null default false,
  email_sent boolean not null default false,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nets_callsign_uppercase_check
    check (net_control_callsign = upper(btrim(net_control_callsign)) and length(btrim(net_control_callsign)) > 0),
  constraint nets_station_type_check
    check (net_control_station_type in ('Home', 'Mobile', 'EchoLink', 'Short Time')),
  constraint nets_finalized_end_time_check
    check (not finalized or end_time is not null)
);

-- Safe Stage 3 upgrade for a database originally created from the Stage 2A
-- schema. Existing net records are retained and start as not emailed.
alter table public.nets
  add column if not exists email_sent boolean not null default false;

alter table public.nets
  add column if not exists email_sent_at timestamptz;

create table if not exists public.net_checkins (
  id uuid primary key default gen_random_uuid(),
  net_id uuid not null references public.nets(id) on delete cascade,
  callsign text not null,
  station_type text not null,
  traffic boolean not null,
  is_net_control boolean not null default false,
  created_at timestamptz not null default now(),
  constraint net_checkins_callsign_uppercase_check
    check (callsign = upper(btrim(callsign)) and length(btrim(callsign)) > 0),
  constraint net_checkins_station_type_check
    check (station_type in ('Home', 'Mobile', 'EchoLink', 'Short Time')),
  constraint net_checkins_net_callsign_unique unique (net_id, callsign)
);

-- Only one check-in can be identified as Net Control for a given net.
create unique index if not exists net_checkins_one_control_per_net_idx
  on public.net_checkins (net_id)
  where is_net_control;

-- Supports: newest active net lookup.
create index if not exists nets_active_created_idx
  on public.nets (finalized, created_at desc);

-- Supports: roster lookup and stable display ordering for one net.
create index if not exists net_checkins_net_created_idx
  on public.net_checkins (net_id, created_at);

-- The net_checkins_net_callsign_unique constraint also creates the index used
-- for callsign lookup and duplicate prevention within a net.

create or replace function public.set_net_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_nets_updated_at on public.nets;
create trigger set_nets_updated_at
before update on public.nets
for each row execute function public.set_net_updated_at();

alter table public.nets enable row level security;
alter table public.net_checkins enable row level security;

-- Remove default privileges before granting only what the Stage 3 browser
-- needs. The service_role bypasses RLS inside Supabase and must never be used
-- by this browser application.
revoke all on table public.nets from anon, authenticated;
revoke all on table public.net_checkins from anon, authenticated;

grant select, insert on table public.nets to anon;
grant update (end_time, finalized) on table public.nets to anon;
grant select, insert, delete on table public.net_checkins to anon;

drop policy if exists "Public can read nets" on public.nets;
create policy "Public can read nets"
on public.nets
for select
to anon
using (true);

drop policy if exists "Public can create open nets" on public.nets;
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

drop policy if exists "Public can finalize open nets" on public.nets;
create policy "Public can finalize open nets"
on public.nets
for update
to anon
using (finalized = false)
with check (end_time is not null);

drop policy if exists "Public can read check-ins" on public.net_checkins;
create policy "Public can read check-ins"
on public.net_checkins
for select
to anon
using (true);

drop policy if exists "Public can add check-ins to open nets" on public.net_checkins;
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

drop policy if exists "Public can remove normal check-ins from open nets" on public.net_checkins;
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
  'W8FY net sessions. Public Stage 2A clients may create/read sessions and finalize an open session, but may not delete one.';

comment on table public.net_checkins is
  'Check-ins for a W8FY net. Public Stage 2A clients may not update rows or delete the protected Net Control row.';
