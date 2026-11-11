-- Final step of the 2026-11-12 cleanup. Apply only after the updated pt-hub Edge Function is live:
-- the previous function wrote entered_by on every shot and would fail with this column gone.
alter table public.pt_shots drop column if exists entered_by;
