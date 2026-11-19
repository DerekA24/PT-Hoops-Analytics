-- Allow a foul drawn to be recorded as its own game situation action.
-- Existing shooting and rebound/turnover rows are retained unchanged.
alter table public.pt_game_situation_shots
  drop constraint if exists pt_game_situation_shots_shot_type_check;
alter table public.pt_game_situation_shots
  add constraint pt_game_situation_shots_shot_type_check
  check (shot_type in ('TWO_M','TWO_X','THREE_M','THREE_X','FT_M','FT_X','REB','DRB','ORB','TO','DRAW_FOUL'));
