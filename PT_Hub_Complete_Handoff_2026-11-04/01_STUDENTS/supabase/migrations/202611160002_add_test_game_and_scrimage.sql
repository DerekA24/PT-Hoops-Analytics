-- Add a Live Game test fixture and the Scrimage schedule entry.
-- The test fixture is explicitly excluded from profile totals and remains
-- available in Live Game. Scrimage is a normal game entry for both tabs.
do $$
declare
  schedule_record public.pt_schedule_records%rowtype;
begin
  select * into schedule_record
  from public.pt_schedule_records
  where id = '00000000-0000-0000-0000-000000000001'
  for update;

  if not found then
    raise exception 'Expected shared schedule record was not found';
  end if;

  if jsonb_typeof(schedule_record.payload->'games') <> 'array'
     or jsonb_typeof(schedule_record.payload->'schedule') <> 'array' then
    raise exception 'Shared schedule payload does not contain games and schedule arrays';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(schedule_record.payload->'games') as item
    where item->>'id' = 'a6d4920b-6180-4c40-8b0c-8c02d2b10001'
  ) then
    schedule_record.payload := jsonb_set(
      schedule_record.payload,
      '{games}',
      (schedule_record.payload->'games') || jsonb_build_array(jsonb_build_object(
        'id', 'a6d4920b-6180-4c40-8b0c-8c02d2b10001',
        'date', '2026-11-16',
        'time', '',
        'location', 'Home',
        'opponent', 'Test Game',
        'events', '[]'::jsonb,
        'played', false,
        'testOnly', true
      )),
      true
    );
  end if;

  if not exists (
    select 1 from jsonb_array_elements(schedule_record.payload->'schedule') as item
    where item->>'date' = '2026-11-18'
      and lower(trim(item->>'opponent')) = 'scrimage'
  ) then
    schedule_record.payload := jsonb_set(
      schedule_record.payload,
      '{schedule}',
      (schedule_record.payload->'schedule') || jsonb_build_array(jsonb_build_object(
        'id', 'a6d4920b-6180-4c40-8b0c-8c02d2b10002',
        'date', '2026-11-18',
        'time', '',
        'location', 'Home',
        'opponent', 'Scrimage'
      )),
      true
    );
  end if;

  update public.pt_schedule_records
  set payload = schedule_record.payload,
      updated_at = now()
  where id = schedule_record.id;
end;
$$;
