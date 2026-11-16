-- Update only the requested varsity roster jersey numbers. Player IDs and stats are unchanged.
do $$
declare
  matched_players integer;
begin
  select count(distinct full_name)::integer
    into matched_players
  from public.pt_players
  where full_name in (
    'Carlos Lopez', 'Owen Platt', 'Brody Blueitt', 'Quinn Allison',
    'Will Barrett', 'Ashton Reid', 'Kingston May', 'Andrew Guerra',
    'BJ Young', 'Kenneth Benge', 'Solomon Devine', 'Kaleb Keeylan',
    'Konnor Staubach', 'Will Kerrigan'
  );

  if matched_players <> 14 then
    raise exception 'Expected all 14 named players; found %', matched_players;
  end if;
end;
$$;

update public.pt_players as player
set jersey_number = updates.jersey_number
from (values
  ('Carlos Lopez', 23),
  ('Owen Platt', 14),
  ('Brody Blueitt', 13),
  ('Quinn Allison', 3),
  ('Will Barrett', 33),
  ('Ashton Reid', 12),
  ('Kingston May', 2),
  ('Andrew Guerra', 11),
  ('BJ Young', 25),
  ('Kenneth Benge', 0),
  ('Solomon Devine', 10),
  ('Kaleb Keeylan', 32),
  ('Konnor Staubach', 22),
  ('Will Kerrigan', 15)
) as updates(full_name, jersey_number)
where player.full_name = updates.full_name;
