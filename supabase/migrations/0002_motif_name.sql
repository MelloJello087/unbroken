-- The app is now called Motif: update the sign-up limit message. Same rule, 5 accounts per network.
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
      'message', 'This network already has the most Motif accounts allowed (5).'));
  end if;
  insert into private.signup_networks (ip_hash, accounts) values (h, 1)
    on conflict (ip_hash) do update set accounts = private.signup_networks.accounts + 1;
  return '{}'::jsonb;
end $$;
