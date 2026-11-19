-- Restore the Test Player roster entry without changing or deleting any stats.
-- Prefer the existing row so historic shooting records keep the same player_id.
do $$
declare
  matching_count integer;
  test_player_id uuid;
begin
  select count(*)::integer
    into matching_count
  from public.pt_players
  where lower(btrim(full_name)) = 'test player';

  if matching_count > 1 then
    raise exception 'Found % Test Player rows; resolve the duplicate roster entries before restoring one', matching_count;
  elsif matching_count = 1 then
    select id
      into test_player_id
    from public.pt_players
    where lower(btrim(full_name)) = 'test player'
    order by created_at, id
    limit 1
    for update;

    update public.pt_players
    set active = true
    where id = test_player_id;
  else
    insert into public.pt_players (full_name, active)
    values ('Test Player', true)
    returning id into test_player_id;
  end if;
end;
$$;
