-- Keep every existing shot; allow compact rows for three additional courtside stats.
alter table public.pt_game_situation_shots
  drop constraint if exists pt_game_situation_shots_shot_type_check;
alter table public.pt_game_situation_shots
  add constraint pt_game_situation_shots_shot_type_check
  check (shot_type in ('TWO_M','TWO_X','THREE_M','THREE_X','FT_M','FT_X','REB','ORB','TO'));

-- Preserve any rebounds or turnovers saved in legacy session payloads.
insert into public.pt_game_situation_shots
  (id, player_id, practice_date, shot_type, court_x, court_y, recorded_at)
select
  (event.value->>'id')::uuid,
  (event.value->>'playerId')::uuid,
  session.practice_date,
  event.value->>'type',
  (event.value->>'x')::smallint,
  (event.value->>'y')::smallint,
  coalesce(nullif(event.value->>'recordedAt','')::timestamptz, session.created_at)
from public.pt_game_situations as session
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(session.payload->'events')='array' then session.payload->'events' else '[]'::jsonb end
) as event(value)
where event.value->>'type' in ('REB','ORB','TO')
  and event.value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and event.value->>'playerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and case when event.value->>'x' ~ '^[0-9]+$' then (event.value->>'x')::integer between 12 and 488 else false end
  and case when event.value->>'y' ~ '^[0-9]+$' then (event.value->>'y')::integer between 12 and 458 else false end
on conflict (id) do nothing;
