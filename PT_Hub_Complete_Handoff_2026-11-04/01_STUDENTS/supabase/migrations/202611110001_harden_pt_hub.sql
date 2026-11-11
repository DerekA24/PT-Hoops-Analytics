-- Hardening pass for the pt-hub Edge Function. Apply together with the updated function.

-- 1. The coach access row is no longer created from a request. On a project where pt_coach_access is empty,
--    set the Edge Function secret PT_COACH_INITIAL_CODE (supabase secrets set PT_COACH_INITIAL_CODE=...) and the
--    function stores its hash on first coach use. No credential is written into this repository.

-- 2. Rate limiter: index the cleanup column and stop scanning the table on every request.
create index if not exists pt_hub_rate_window_idx
  on public.pt_hub_rate (minute_window);

create or replace function public.pt_hub_allow_request(p_bucket text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_window timestamptz := date_trunc('minute', now());
  current_count integer;
begin
  insert into public.pt_hub_rate (bucket, minute_window, count)
  values (p_bucket, current_window, 1)
  on conflict (bucket, minute_window)
  do update set count = public.pt_hub_rate.count + 1
  returning count into current_count;
  if random() < 0.02 then
    delete from public.pt_hub_rate
    where minute_window < now() - interval '10 minutes';
  end if;
  return current_count <= greatest(p_limit, 1);
end;
$$;

revoke all on function public.pt_hub_allow_request(text, integer) from public, anon, authenticated;
grant execute on function public.pt_hub_allow_request(text, integer) to service_role;

-- 3. Keep updated_at honest so the newest schedule record always sorts first.
create or replace function public.pt_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pt_schedule_records_touch on public.pt_schedule_records;
create trigger pt_schedule_records_touch
  before update on public.pt_schedule_records
  for each row execute function public.pt_touch_updated_at();

drop trigger if exists pt_game_situations_touch on public.pt_game_situations;
create trigger pt_game_situations_touch
  before update on public.pt_game_situations
  for each row execute function public.pt_touch_updated_at();

drop trigger if exists pt_coach_access_touch on public.pt_coach_access;
create trigger pt_coach_access_touch
  before update on public.pt_coach_access
  for each row execute function public.pt_touch_updated_at();

-- 4. Game situation shots must belong to a roster player. NOT VALID keeps any pre-existing orphan rows readable.
alter table public.pt_game_situation_shots
  drop constraint if exists pt_game_situation_shots_player_id_fkey;
alter table public.pt_game_situation_shots
  add constraint pt_game_situation_shots_player_id_fkey
  foreign key (player_id) references public.pt_players(id) not valid;

-- 5. Defense in depth: these tables are reached only through the Edge Function's service role.
revoke all on table
  public.pt_coach_access,
  public.pt_hub_rate,
  public.pt_drill_results,
  public.pt_schedule_records,
  public.pt_game_situations,
  public.pt_game_situation_shots
from anon, authenticated;

revoke all on table public.pt_players, public.pt_drills, public.pt_shots from anon;

-- 6. Register the Custom Drill category so quick entries using it can sync instead of blocking the queue.
insert into public.pt_drills (name, active)
values ('Custom Drill', true)
on conflict (name) do update set active = true;

-- 7. Owner tokens let the device that uploaded a shot undo it without a coach code. Only the hash is stored.
alter table public.pt_shots add column if not exists owner_token_hash text;
alter table public.pt_game_situation_shots add column if not exists owner_token_hash text;
