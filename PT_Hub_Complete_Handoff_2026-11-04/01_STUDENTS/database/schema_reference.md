# Database schema reference (not a full migration)
Verified against the migrations folder on 12 November 2026. Every table has RLS enabled with no policies, so nothing reaches the data except the Edge Function, which uses the service role. Nobody signs in: coaches unlock with a shared access code that the function checks against `pt_coach_access`.

* public.pt_players: id uuid PK, full_name text, jersey_number integer nullable, grade text nullable, position text nullable, active boolean default true, created_at timestamptz default now().
* public.pt_drills: id uuid PK, name text unique, active boolean default true, created_at timestamptz default now(). Historical drill names stay active because shots reference them by id and the snapshot only returns active drills.
* public.pt_shots: id uuid PK, player_id uuid FK pt_players.id, drill_id uuid FK pt_drills.id, made boolean, practice_date date, notes text nullable, owner_token_hash text nullable, created_at timestamptz. Indexed by (player_id, practice_date), (drill_id, practice_date), (created_at desc, id desc), (player_id, created_at desc, id desc).
* public.pt_drill_results: id uuid PK, batch_id uuid, player_id uuid FK pt_players.id, result text ('win' or 'loss'), practice_date date, recorded_at timestamptz, created_at timestamptz.
* public.pt_game_situation_shots: id uuid PK, player_id uuid FK pt_players.id, practice_date date, shot_type text (TWO_M, TWO_X, THREE_M, THREE_X, FT_M, FT_X, REB, DRB, ORB, TO), court_x smallint, court_y smallint, recorded_at timestamptz, undone boolean default false, owner_token_hash text nullable. Indexed by (player_id, practice_date), (recorded_at desc, id desc), (player_id, recorded_at desc, id desc).
* public.pt_game_situations: id uuid PK, practice_date date, payload jsonb, updated_at, created_at. Legacy whole-session rows kept for browser tabs that predate per-shot storage; new entries never update them.
* public.pt_schedule_records: id uuid PK, payload jsonb, updated_at, created_at. One row holds the season schedule and game box scores.
* public.pt_coach_access: id text PK ('primary'), code_hash text, updated_at. Seeded from the PT_COACH_INITIAL_CODE function secret on first coach use.
* public.pt_hub_rate: bucket text, minute_window timestamptz, count integer; composite PK (bucket, minute_window); private rate limiting.

## Rate limiting

The Edge Function counts requests per minute in `pt_hub_rate` through `pt_hub_allow_request`, in three layers. A client that sends an `X-PT-Device` header (a random 32-hex id the frontend stores in localStorage) gets its own budget of 120 writes and 40 reads a minute. A client without the header shares its network address's legacy budget of 80 writes and 120 reads. Every network address also has a ceiling of 300 writes and 600 reads a minute, since device ids are self-declared. All writes together are capped at 3000 rows a minute, charged per row so a batch of 100 shots costs 100. A refused request does not advance any counter, so a busy minute never locks a bucket out past that minute. Coach code attempts are limited to 30 a minute per network address, charged before the code is compared, and there is no shared attempt budget that someone else could use to lock a coach out.

Courtside uploads travel as batches. `POST ?action=shots` takes up to 100 shots and `POST ?action=drill_results` takes up to 100 results; each reply lists `saved` ids and `rejected` ids with reasons. The single-record actions `shot` and `drill_result` remain for older cached pages.

## Removed on 12 November 2026

`pt_coaches`, `pt_is_coach()`, the policies built on them, `pt_players.auth_user_id`, and `pt_shots.entered_by`. They belonged to a Supabase Auth sign-in path that the app never used.

To reconstruct a project, export the actual schema, RLS state, database functions, triggers, and migrations with school administrator approval; this document is explanatory only. No real player records are included in the bundle.
