-- Add sided three-point drills without changing or removing historical shots.
insert into public.pt_drills (name, active)
values
  ('Corner 3 Left', true),
  ('Corner 3 Right', true),
  ('Wing 3 Left', true),
  ('Wing 3 Right', true),
  ('Slot 3 Left', true),
  ('Slot 3 Right', true)
on conflict (name) do update set active = true;
