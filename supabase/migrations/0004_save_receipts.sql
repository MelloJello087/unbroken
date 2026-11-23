-- Save receipts and the app version gate. Only adds things: no existing table, rule or row is changed.
-- Undo with supabase/rollback/0004_save_receipts.sql.

/* ---------- Save receipts ---------- */
-- Every save from Motif (Stage 1 onwards) carries a one-time stamp, body->>'rev'. The database records the stamp in the
-- same transaction as the save and refuses a stamp it has seen before, so one save can never be applied twice, and an
-- app that lost the answer to a save can ask whether it landed. Saves without a stamp (older versions) are not affected.
create table if not exists public.save_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  rev text not null check (rev ~ '^[a-z0-9]{6,40}$'),
  doc_id text not null,
  at timestamptz not null default now(),
  primary key (user_id, rev)
);
create index if not exists save_receipts_by_age on public.save_receipts (user_id, at);
alter table public.save_receipts enable row level security;
drop policy if exists "read own receipts" on public.save_receipts;
create policy "read own receipts" on public.save_receipts for select to authenticated using (user_id = auth.uid());
-- People can only read their own receipts; only the database itself writes them.
revoke all on public.save_receipts from public, anon, authenticated;
grant select on public.save_receipts to authenticated;

create or replace function public.user_docs_receipt() returns trigger language plpgsql security definer set search_path = '' as $$
declare r text := new.body->>'rev';
begin
  if r is null then return null; end if;
  insert into public.save_receipts (user_id, rev, doc_id) values (new.user_id, r, new.doc_id);   -- a repeated stamp fails here and cancels the save
  delete from public.save_receipts where user_id = new.user_id and at < now() - interval '60 days';
  return null;
end $$;
revoke execute on function public.user_docs_receipt() from public, anon, authenticated;
drop trigger if exists user_docs_receipt on public.user_docs;
create trigger user_docs_receipt after insert or update on public.user_docs for each row execute function public.user_docs_receipt();

/* ---------- App version gate ---------- */
-- Saves carry the app's version number, body->>'app' (missing means 0, every version before Stage 1).
-- A save below the minimum is refused. The minimum lives in private.config: 'min_app' for everyone, or
-- 'min_app:<user id>' for one account (to try it on your own account first). It starts at 0, which refuses nothing.
insert into private.config (k, v) values ('min_app', '0') on conflict (k) do nothing;
create or replace function public.user_docs_gate() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  have int := case when new.body->>'app' ~ '^\d{1,6}$' then (new.body->>'app')::int else 0 end;
  need int;
begin
  select coalesce(max(case when v ~ '^\d{1,6}$' then v::int end), 0) into need from private.config where k in ('min_app', 'min_app:' || new.user_id::text);
  if have < need then
    raise exception 'motif_outdated: this version of Motif is out of date (%, needs %)', have, need using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.user_docs_gate() from public, anon, authenticated;
drop trigger if exists user_docs_gate on public.user_docs;
create trigger user_docs_gate before insert or update on public.user_docs for each row execute function public.user_docs_gate();
