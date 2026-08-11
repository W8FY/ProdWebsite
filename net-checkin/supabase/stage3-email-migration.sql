-- W8FY Net Check-In — Stage 3 additive migration
-- Safe to run against the existing Stage 2A database. No rows are deleted.

alter table public.nets
  add column if not exists email_sent boolean not null default false;

alter table public.nets
  add column if not exists email_sent_at timestamp with time zone;

comment on column public.nets.email_sent is
  'True only after the send-net-report Edge Function successfully submits the report to Resend.';

comment on column public.nets.email_sent_at is
  'UTC timestamp recorded after the net report is successfully submitted to Resend.';

-- Keep public browser inserts from claiming an email was already sent. The
-- Edge Function uses its protected server credential for the actual update.
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
