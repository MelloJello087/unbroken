-- Live updates for friends: profiles and shared streaks send change notices to signed-in people who can already read them.
-- Private data (user_docs) is deliberately left out, so nothing about private streaks is ever broadcast.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'public_streaks') then
    alter publication supabase_realtime add table public.public_streaks;
  end if;
end $$;
