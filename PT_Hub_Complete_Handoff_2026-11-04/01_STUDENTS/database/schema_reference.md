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

The Edge Function counts requests per minute in `pt_hub_rate` through `pt_hub_allow_request`, in layers. A client that sends an `X-PT-Device` header (a random 32-hex id the frontend stores in localStorage) gets its own request budget of 120 writes and 40 reads a minute. A client without the header shares its network address's legacy budget of 80 writes and 120 reads. Every network address also has a read ceiling of 600 a minute and a write ceiling of 3000 rows a minute, and all writes together are capped at 6000 rows a minute. Row budgets count only rows that passed validation, so a batch of garbage costs nothing shared, and they are sized for a whole roster reconnecting after an outage with a 100-shot backlog each. A refused request does not advance any counter, so a busy minute never locks a bucket out past that minute. The network address is `cf-connecting-ip`, which Cloudflare sets on every request and refuses to let a client forge (verified live on 15 November 2026); `x-forwarded-for` is not used because its last entry is Supabase's shared relay. IPv6 is grouped by /64.

Coach code attempts are limited to 10 a minute per device and 40 a minute per network, both charged before the code is compared, and 30 wrong codes a minute per network, counted only on a failed compare so the coach's own correct unlocks on the gym Wi-Fi never lock the coach out. There is deliberately no shared attempt budget, since one would let a guesser anywhere lock the real coach out; codes must be at least 10 characters when seeded or changed, and the coach should rotate any shorter code.

Courtside uploads travel as batches. `POST ?action=shots` takes up to 100 shots and `POST ?action=drill_results` takes up to 100 results; each reply lists `saved` ids and `rejected` ids with reasons. A rejection reading "Unknown player or drill" is treated by the frontend as transient (the phone's roster is older than the coach's last edit) and retried after the next snapshot. The single-record actions `shot` and `drill_result` remain for older cached pages. Bodies over 512 KB are refused before parsing.

## Removed on 12 November 2026

`pt_coaches`, `pt_is_coach()`, the policies built on them, `pt_players.auth_user_id`, and `pt_shots.entered_by`. They belonged to a Supabase Auth sign-in path that the app never used.

To reconstruct a project, export the actual schema, RLS state, database functions, triggers, and migrations with school administrator approval; this document is explanatory only. No real player records are included in the bundle.
