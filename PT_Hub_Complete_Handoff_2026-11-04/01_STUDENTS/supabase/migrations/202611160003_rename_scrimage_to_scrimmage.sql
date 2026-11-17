-- Correct the opponent label on the Scrimage schedule entry without changing
-- its date, time, location, game linkage, or any recorded statistics.
update public.pt_schedule_records as schedule_record
set payload = jsonb_set(
      schedule_record.payload,
      '{schedule}',
      (
        select jsonb_agg(
          case
            when item->>'id' = 'a6d4920b-6180-4c40-8b0c-8c02d2b10002'
              and item->>'opponent' = 'Scrimage'
              then jsonb_set(item, '{opponent}', '"Scrimmage"'::jsonb, true)
            else item
          end
          order by ordinal
        )
        from jsonb_array_elements(schedule_record.payload->'schedule')
             with ordinality as items(item, ordinal)
      ),
      true
    ),
    updated_at = now()
where schedule_record.id = '00000000-0000-0000-0000-000000000001'
  and exists (
    select 1
    from jsonb_array_elements(schedule_record.payload->'schedule') as items(item)
    where item->>'id' = 'a6d4920b-6180-4c40-8b0c-8c02d2b10002'
      and item->>'opponent' = 'Scrimage'
  );
