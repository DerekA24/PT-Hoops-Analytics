-- Register the two new drill types before publishing the updated frontend.
-- Existing Midrange records remain unchanged because their zones are unknown.
INSERT INTO public.pt_drills (id, name, active)
VALUES
  (gen_random_uuid(), 'Midrange Low', true),
  (gen_random_uuid(), 'Midrange High', true)
ON CONFLICT (name) DO UPDATE SET active = EXCLUDED.active;
