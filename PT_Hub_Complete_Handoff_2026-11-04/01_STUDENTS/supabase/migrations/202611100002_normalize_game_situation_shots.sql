-- Preserve the original session rows. New entries use one row per shot.
create table if not exists public.pt_game_situation_shots (
  id uuid primary key,
  player_id uuid not null,
  practice_date date not null,
  shot_type text not null check (shot_type in ('TWO_M', 'TWO_X', 'THREE_M', 'THREE_X', 'FT_M', 'FT_X')),
  court_x smallint check (court_x between 12 and 488),
  court_y smallint check (court_y between 12 and 458),
  recorded_at timestamptz not null,
  undone boolean not null default false
);

create index if not exists pt_game_situation_shots_player_date_idx
  on public.pt_game_situation_shots (player_id, practice_date);

alter table public.pt_game_situation_shots enable row level security;

-- Backfill by event UUID, without updating or deleting the source sessions.
insert into public.pt_game_situation_shots
  (id, player_id, practice_date, shot_type, court_x, court_y, recorded_at)
select
  (event.value->>'id')::uuid,
  (event.value->>'playerId')::uuid,
  session.practice_date,
  event.value->>'type',
  case when event.value->>'x' ~ '^[0-9]+$' and (event.value->>'x')::integer between 12 and 488 then (event.value->>'x')::smallint end,
  case when event.value->>'y' ~ '^[0-9]+$' and (event.value->>'y')::integer between 12 and 458 then (event.value->>'y')::smallint end,
  coalesce(nullif(event.value->>'recordedAt', '')::timestamptz, session.created_at)
from public.pt_game_situations as session
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(session.payload->'events') = 'array' then session.payload->'events' else '[]'::jsonb end
) as event(value)
where event.value->>'type' in ('TWO_M', 'TWO_X', 'THREE_M', 'THREE_X', 'FT_M', 'FT_X')
  and event.value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and event.value->>'playerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (id) do nothing;
