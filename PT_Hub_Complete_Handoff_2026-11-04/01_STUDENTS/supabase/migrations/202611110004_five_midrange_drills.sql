-- Add the five midrange drills. Historical Low/High rows stay intact;
-- the frontend distributes their makes and misses for display only.
insert into public.pt_drills (name, active)
values
  ('Midrange Corner Left', true),
  ('Midrange Corner Right', true),
  ('Midrange Wing Left', true),
  ('Midrange Wing Right', true),
  ('Midrange Key', true)
on conflict (name) do update set active = true;
