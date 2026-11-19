# Game Situation shot storage rollout

The historical `pt_game_situations` table remains untouched. The new
`pt_game_situation_shots` table stores one row per shot, without Red/White
lineups, teammates, opponents, or session snapshots. A shot's UUID is retained
through the backfill, so the migration is idempotent and profiles can avoid
double counting while both formats coexist.

Deploy in this order:

1. Apply `migrations/202611100002_normalize_game_situation_shots.sql`.
2. Verify the copied count. The read-only audit on November 10 found 65
   shooting events with 65 unique IDs in three historical sessions.
3. Deploy the updated `functions/pt-hub/index.ts` Edge Function.
4. Publish the updated frontend and refresh any already-open Game Situation
   pages. The old endpoint remains available during rollout.

If the updated frontend reaches the old Edge Function before rollout is
complete, it continues saving session snapshots temporarily. After the new
snapshot response includes `gameSituationShots`, it switches to per-shot sync.

Verification queries:

```sql
select count(*) from public.pt_game_situations;
select count(*) from public.pt_game_situation_shots;
select count(distinct id) from public.pt_game_situation_shots;
```

The first count should remain three at rollout. The shot count should be at
least 65, and match the distinct-ID count. New shots should increase only the
new shot table; clicking Undo should mark its row `undone = true`. Keep the
historical session table as a non-destructive backup.

## Draw Foul action

Apply `migrations/202611190001_game_situation_draw_foul.sql`, then deploy the
updated `functions/pt-hub/index.ts` Edge Function before publishing the new
frontend. The migration only expands the allowed event types; it does not
rewrite or delete existing rows. Draw Foul is stored with `shot_type =
'DRAW_FOUL'` and the same player, date, location, and timestamp fields as
other Game Situation actions. It does not count as a shot attempt or a
personal foul. If the frontend is published first, its Draw Foul events stay
on the recording device and retry after the database and function are updated.
