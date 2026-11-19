-- Route only the scheduled Scrimmage matchup to the Game Situation profile
-- category. Its Live Game events remain attached to the same game record.
do $$
declare
  schedule_record public.pt_schedule_records%rowtype;
  scrimmage_schedule_id constant text := 'a6d4920b-6180-4c40-8b0c-8c02d2b10002';
begin
  select * into schedule_record
  from public.pt_schedule_records
  where id = '00000000-0000-0000-0000-000000000001'
  for update;

  if not found then
    raise exception 'Expected shared schedule record was not found';
  end if;

  if jsonb_typeof(schedule_record.payload->'schedule') <> 'array'
     or jsonb_typeof(schedule_record.payload->'games') <> 'array' then
    raise exception 'Shared schedule payload does not contain schedule and games arrays';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(schedule_record.payload->'schedule') as items(item)
    where item->>'id' = scrimmage_schedule_id
       or (item->>'date' = '2026-11-18' and lower(trim(item->>'opponent')) = 'scrimmage')
  ) then
    raise exception 'Scrimmage schedule entry was not found';
  end if;

  schedule_record.payload := jsonb_set(
    schedule_record.payload,
    '{schedule}',
    (
      select jsonb_agg(
        case
          when item->>'id' = scrimmage_schedule_id
            or (item->>'date' = '2026-11-18' and lower(trim(item->>'opponent')) = 'scrimmage')
            then item || jsonb_build_object('statsCategory', 'game-situation')
          else item
        end
        order by ordinal
      )
      from jsonb_array_elements(schedule_record.payload->'schedule')
           with ordinality as items(item, ordinal)
    ),
    true
  );

  schedule_record.payload := jsonb_set(
    schedule_record.payload,
    '{games}',
    (
      select jsonb_agg(
        case
          when item->>'scheduleId' = scrimmage_schedule_id
            or (item->>'date' = '2026-11-18' and lower(trim(item->>'opponent')) = 'scrimmage')
            then item || jsonb_build_object('statsCategory', 'game-situation')
          else item
        end
        order by ordinal
      )
      from jsonb_array_elements(schedule_record.payload->'games')
           with ordinality as items(item, ordinal)
    ),
    true
  );

  update public.pt_schedule_records
  set payload = schedule_record.payload,
      updated_at = now()
  where id = schedule_record.id;
end;
$$;
