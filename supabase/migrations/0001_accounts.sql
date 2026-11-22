-- Unbroken: accounts, saved data, profiles and the sign-up limit.
-- Run once on a new project. Every table is locked down with row level security.

/* ---------- Private data ---------- */
-- One row per saved document: 'settings', 'social', and one per streak. Only the owner can see or change their rows.
create table if not exists public.user_docs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doc_id text not null check (doc_id ~ '^[A-Za-z0-9_.~:@+-]{1,64}$'),
  body jsonb not null check (octet_length(body::text) < 300000),
  updated_at timestamptz not null default now(),
  primary key (user_id, doc_id)
);
alter table public.user_docs enable row level security;
drop policy if exists "read own docs" on public.user_docs;
drop policy if exists "add own docs" on public.user_docs;
drop policy if exists "change own docs" on public.user_docs;
drop policy if exists "delete own docs" on public.user_docs;
create policy "read own docs" on public.user_docs for select to authenticated using (user_id = auth.uid());
create policy "add own docs" on public.user_docs for insert to authenticated with check (user_id = auth.uid());
create policy "change own docs" on public.user_docs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own docs" on public.user_docs for delete to authenticated using (user_id = auth.uid());

/* ---------- Profiles ---------- */
-- Anyone signed in can read profiles; only the owner can write theirs.
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  body jsonb not null check (octet_length(body::text) < 200000),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read profiles" on public.profiles;
drop policy if exists "add own profile" on public.profiles;
drop policy if exists "change own profile" on public.profiles;
drop policy if exists "delete own profile" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "add own profile" on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy "change own profile" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own profile" on public.profiles for delete to authenticated using (user_id = auth.uid());

/* ---------- Shared streaks ---------- */
-- Copies of the streaks a person chose to show friends. Private streaks never get a row here.
create table if not exists public.public_streaks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id text not null check (habit_id ~ '^[A-Za-z0-9_.~:@+-]{1,64}$'),
  body jsonb not null check (octet_length(body::text) < 300000),
  updated_at timestamptz not null default now(),
  primary key (user_id, habit_id)
);
alter table public.public_streaks enable row level security;
drop policy if exists "read shared streaks" on public.public_streaks;
drop policy if exists "add own shared streaks" on public.public_streaks;
drop policy if exists "change own shared streaks" on public.public_streaks;
drop policy if exists "delete own shared streaks" on public.public_streaks;
create policy "read shared streaks" on public.public_streaks for select to authenticated using (true);
create policy "add own shared streaks" on public.public_streaks for insert to authenticated with check (user_id = auth.uid());
create policy "change own shared streaks" on public.public_streaks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own shared streaks" on public.public_streaks for delete to authenticated using (user_id = auth.uid());

/* ---------- Sign-up limit ---------- */
-- At most 5 accounts per network. Only a salted fingerprint of the IP address is stored, never the address.
-- The salt is made inside the database on first run and is never written in code.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.config (k text primary key, v text not null);
insert into private.config (k, v) values ('ip_salt', encode(extensions.gen_random_bytes(32), 'hex')) on conflict (k) do nothing;
create table if not exists private.signup_networks (
  ip_hash text primary key,
  accounts int not null default 0,
  first_signup timestamptz not null default now()
);

create or replace function public.before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ip text := event->'metadata'->>'ip_address';
  h text;
  n int;
  max_accounts constant int := 5;
begin
  if ip is null or ip = '' then return '{}'::jsonb; end if;
  select encode(extensions.digest(ip || v, 'sha256'), 'hex') into h from private.config where k = 'ip_salt';
  select accounts into n from private.signup_networks where ip_hash = h for update;
  if coalesce(n, 0) >= max_accounts then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', 'This network already has the most Unbroken accounts allowed (5).'));
  end if;
  insert into private.signup_networks (ip_hash, accounts) values (h, 1)
    on conflict (ip_hash) do update set accounts = private.signup_networks.accounts + 1;
  return '{}'::jsonb;
end $$;

grant usage on schema private to supabase_auth_admin;
grant select on private.config to supabase_auth_admin;
grant select, insert, update on private.signup_networks to supabase_auth_admin;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.before_user_created(jsonb) from public, anon, authenticated;

/* ---------- Table access ---------- */
-- Signed-in users can reach the tables; the row rules above decide which rows. Signed-out visitors get nothing.
grant select, insert, update, delete on public.user_docs, public.profiles, public.public_streaks to authenticated;
revoke all on public.user_docs, public.profiles, public.public_streaks from anon;
