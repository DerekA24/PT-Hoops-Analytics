create extension if not exists pgcrypto;

create table if not exists public.pt_players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  jersey_number integer,
  grade text,
  position text,
  auth_user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_drills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_shots (
  id uuid primary key,
  player_id uuid not null references public.pt_players(id),
  drill_id uuid not null references public.pt_drills(id),
  made boolean not null,
  practice_date date not null,
  entered_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_coaches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_hub_rate (
  bucket text not null,
  minute_window timestamptz not null,
  count integer not null default 0,
  primary key (bucket, minute_window)
);

create index if not exists pt_shots_player_date_idx
  on public.pt_shots (player_id, practice_date);
create index if not exists pt_shots_drill_date_idx
  on public.pt_shots (drill_id, practice_date);
create index if not exists pt_shots_created_at_idx
  on public.pt_shots (created_at desc);

insert into public.pt_drills (name)
values
  ('Free Throws'),
  ('Top of Key 3'),
  ('Wing 3'),
  ('Slot 3'),
  ('Corner 3'),
  ('Midrange Low'),
  ('Midrange High'),
  ('Floaters'),
  ('Finishing / Layups'),
  ('Contested Shots')
on conflict (name) do update set active = true;

alter table public.pt_players enable row level security;
alter table public.pt_drills enable row level security;
alter table public.pt_shots enable row level security;
alter table public.pt_coaches enable row level security;
alter table public.pt_hub_rate enable row level security;

create or replace function public.pt_is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pt_coaches
    where user_id = (select auth.uid())
  );
$$;

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
  delete from public.pt_hub_rate
  where minute_window < now() - interval '10 minutes';
  return current_count <= greatest(p_limit, 1);
end;
$$;

revoke all on function public.pt_is_coach() from public;
grant execute on function public.pt_is_coach() to authenticated;
revoke all on function public.pt_hub_allow_request(text, integer) from public;
grant execute on function public.pt_hub_allow_request(text, integer) to service_role;

create policy "authenticated coaches read players"
  on public.pt_players for select to authenticated
  using (public.pt_is_coach());
create policy "authenticated coaches manage players"
  on public.pt_players for all to authenticated
  using (public.pt_is_coach())
  with check (public.pt_is_coach());

create policy "authenticated coaches read drills"
  on public.pt_drills for select to authenticated
  using (public.pt_is_coach());
create policy "authenticated coaches manage drills"
  on public.pt_drills for all to authenticated
  using (public.pt_is_coach())
  with check (public.pt_is_coach());

create policy "authenticated coaches manage shots"
  on public.pt_shots for all to authenticated
  using (public.pt_is_coach())
  with check (public.pt_is_coach());

create policy "coaches read membership"
  on public.pt_coaches for select to authenticated
  using (public.pt_is_coach());
