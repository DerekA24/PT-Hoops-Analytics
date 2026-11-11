-- Rate limiting per device, a limiter that cannot lock a gym out past the current minute, and removal of the unused sign-in path.
--
-- Rollout order:
--   1. apply this migration (the previous Edge Function keeps working: p_cost defaults to 1 and it never touched the dropped objects),
--   2. deploy the updated pt-hub Edge Function,
--   3. publish the updated frontend,
--   4. apply 202611120002_drop_entered_by.sql once no old function instance can still write entered_by.

-- 1. Budgets are charged by cost, and a refused request no longer advances the counter. Before this change every retry during a busy
--    minute pushed the count further past the cap, so a burst of refused taps kept the whole bucket locked out. The counter now stops at the cap.
drop function if exists public.pt_hub_allow_request(text, integer);

create or replace function public.pt_hub_allow_request(p_bucket text, p_limit integer, p_cost integer default 1)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_window timestamptz := date_trunc('minute', now());
  cap integer := greatest(p_limit, 1);
  cost integer := greatest(coalesce(p_cost, 1), 1);
  current_count integer;
begin
  if cost > cap then
    return false;
  end if;
  insert into public.pt_hub_rate (bucket, minute_window, count)
  values (p_bucket, current_window, cost)
  on conflict (bucket, minute_window)
  do update set count = public.pt_hub_rate.count + cost
  where public.pt_hub_rate.count + cost <= cap
  returning count into current_count;
  if random() < 0.02 then
    delete from public.pt_hub_rate
    where minute_window < now() - interval '10 minutes';
  end if;
  return current_count is not null;
end;
$$;

revoke all on function public.pt_hub_allow_request(text, integer, integer) from public, anon, authenticated;
grant execute on function public.pt_hub_allow_request(text, integer, integer) to service_role;

-- 2. Nothing signs in. Coaches unlock with the shared access code, which the Edge Function checks against pt_coach_access.
--    The Supabase Auth columns, the coach membership table, and the policies built on them were never exercised by the app.
drop policy if exists "authenticated coaches read players" on public.pt_players;
drop policy if exists "authenticated coaches manage players" on public.pt_players;
drop policy if exists "authenticated coaches read drills" on public.pt_drills;
drop policy if exists "authenticated coaches manage drills" on public.pt_drills;
drop policy if exists "authenticated coaches manage shots" on public.pt_shots;
drop policy if exists "coaches read membership" on public.pt_coaches;
drop function if exists public.pt_is_coach();
drop table if exists public.pt_coaches;
alter table public.pt_players drop column if exists auth_user_id;

-- Every table is reached only through the Edge Function's service role. RLS stays enabled with no policies, which denies everyone else.
revoke all on table public.pt_players, public.pt_drills, public.pt_shots from anon, authenticated;

-- 3. Indexes that match how the snapshot pages through history: newest first, ties broken by id.
create index if not exists pt_shots_created_id_idx
  on public.pt_shots (created_at desc, id desc);
create index if not exists pt_shots_player_created_idx
  on public.pt_shots (player_id, created_at desc, id desc);
create index if not exists pt_game_situation_shots_recorded_id_idx
  on public.pt_game_situation_shots (recorded_at desc, id desc);
create index if not exists pt_game_situation_shots_player_recorded_idx
  on public.pt_game_situation_shots (player_id, recorded_at desc, id desc);
drop index if exists public.pt_shots_created_at_idx;

-- 4. Rate-limit rows from before this migration may hold counts far past any cap. Start clean.
truncate table public.pt_hub_rate;
