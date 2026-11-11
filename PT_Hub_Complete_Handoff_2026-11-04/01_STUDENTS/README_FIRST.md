# PT Basketball Analytics Hub | Student handoff
Prepared November 4, 2026. Read before editing.

## Start here
1. Read `Student_Developer_Guide.docx`.
2. Review the pages and shared assets in `frontend/` and `supabase/functions/pt-hub/index.ts`.
3. Have a faculty administrator establish a school-owned GitHub repository and staging environment. Do not deploy to production without approval.
4. Before a production release, compare the active `frontend/` with the actual current Netlify deployment. The dated handoff archive preserves the original local deployment artifact; independent verification of the current hosted bytes was not possible during handoff.
5. Test with fictional users and shots in staging. Never overwrite production shots or student roster data to test a change.

## Live architecture
Browser -> Netlify/Vercel frontend -> Supabase Edge Function `https://jbznaeunhtqgagnqweqw.supabase.co/functions/v1/pt-hub` -> PostgreSQL.
The active frontend is in `frontend/`, with eight HTML pages and shared CSS and JavaScript in `frontend/assets/`. `index.html` opens Enter Practice Data. Roster, schedule, and backup tools live inside Coach Review. Practice Analytics has been removed. `pt-hub` is a Deno TypeScript Edge Function. Coach access uses code 232323 for both the Coach Review gate and cloud edits; no email/password sign-in is required. The service role secret stays server-side in Supabase only.

## Local development
From the repository root, run `python -m http.server 8000 --bind 127.0.0.1 --directory "01_STUDENTS/frontend"`, then open `http://localhost:8000`.

Edit `shooting-drills.html`, `leaderboards.html`, `other-leaderboards.html`, `player-profiles.html`, `team-profile.html`, `schedule.html`, or `coach-review.html` for page content. Shared behavior is in `assets/app.js`, analytics rendering in `assets/analytics.js`, local coach access in `assets/coach-access.js`, and Supabase integration in `assets/cloud.js`. Keep the complete `frontend/` directory together when serving or publishing. The dated `PT_Hub_Complete_Handoff_2026-11-04/` directory is the original handoff archive, not the active frontend.

Player profile heat charts are in `assets/profiles.js`. Practice results use named drill zones and any saved coordinates. Game results use historical shooting events, uploaded game box scores, and explicitly tagged game shots. Untagged located shots remain practice shots. Unknown locations are included in totals without assigning a court zone. Located shots use `shotContext` in the existing local `court` array and JSON backups; the current Supabase shot schema does not store coordinates or game context.

Team Profile reuses the same profile layout and chart code with all athletes aggregated. Its bottom time-series chart groups shots by date, filters by shot type, and displays attempts, makes, or weighted shooting percentage. The trend, heat chart, and compact shot data follow the same Practice/Game toggle and inclusive Start Date/End Date range. Full Season clears the range restriction without erasing the selected dates. Leaderboards and Coach Review also support inclusive ranges; either boundary may be left blank. Enter Practice Data keeps one date per new shot.

Midrange Low and Midrange High are separate practice-entry categories, leaderboard boards, and coach filters. Existing unsplit Midrange records are labeled “Midrange (Unspecified)” and are not reassigned. Before publishing this change, a database administrator must apply `supabase/migrations/202611040001_split_midrange_drills.sql` to register both new drill names in Supabase. Until then, new midrange shots remain saved locally and queued for sync; the frontend does not relabel them as the old Midrange drill.

## Deployment
Frontend: commit and test source in school-owned Git, and publish via the EXISTING `ptbasketballhub` Netlify project after authorized review. Never create a replacement project without school approval. Backend: deploy `supabase/functions/pt-hub/index.ts` only via authorized Supabase admin access. A domain change requires updating the server's allowed Origin and Supabase Authentication redirect settings.

## Supabase API actions
GET `?action=snapshot&scope=full|coach|player|schedule|schedule-only|entry|situation`: shared players, drills, shots, drill results, schedule records, and game-situation shots, trimmed to what each page needs.
POST `?action=shot`: public shot entry. Optional `label` stores a custom drill name in `notes`.
POST `?action=drill_result`: public drill win or loss.
POST `?action=game_situation_shot`: public Red vs White shot. PATCH with `{undone:true}` hides one; without a coach code the body must carry the uploading device's `owner_token` and the shot must be under 24 hours old.
DELETE `?action=shot`: without a coach code, the body must carry the `owner_token` the uploading device generated, and the shot must be under 15 minutes old (athlete Undo). With a valid coach code, removes any shot.
POST `?action=player`: coach code required. `active:false` deactivates a player. Active roster is capped at 150.
PATCH `?action=shot`: coach correction with valid access code.
POST `?action=schedule_sync`: coach code required. Always writes the single shared schedule record.
POST `?action=coach_code`: coach code required in the header, `{code}` in the body. Rotates the shared code; the Coach Review "Change Code" tool calls this before saving locally.

Dates must be real calendar dates within a year of today. Malformed input returns 400 and the client sets that record aside instead of retrying it.

## Deploying the November 11 hardening
1. Apply `supabase/migrations/202611110001_harden_pt_hub.sql`. The function no longer creates the coach code from a request. On a project whose `pt_coach_access` table is empty, set the function secret `PT_COACH_INITIAL_CODE` (at least 6 characters) before coaches use it; the existing production row keeps working unchanged. The migration also registers the `Custom Drill` category, adds the `pt_game_situation_shots` player foreign key, and revokes direct API grants on function-only tables.
2. Deploy `supabase/functions/pt-hub/index.ts`. The new function accepts requests from the previous frontend.
3. Publish `frontend/`. The new frontend's game-situation page uses the `situation` snapshot scope, which the old function rejects, so deploy the function first.
4. Rotate the coach code from Coach Review once the school controls the project.

## Critical limitations
* Web visitors can submit shots anonymously; the Origin header is NOT an access-control mechanism. School administration should evaluate student privacy and abuse prevention.
* Some client analytics and schedules may use browser storage; not all website sections are established as fully cloud-backed.
* After cloud deletions, ensure cached analytics fully reconcile on every device.
* Other devices may need a refresh to see newly recorded shots.
* Coach Review uses a local access code; unlocked edit/delete requests send that code to the Edge Function, which stores only its SHA-256 hash. Treat the code as nonsecret and rotate it when school administrators take control.
* Never commit service-role keys, database passwords, coach passwords, student data exports, or personal credentials to GitHub.

## Verification before any production release
Phone and desktop navigation; 16 roster entries; add one make and one miss for Test Player; verify across devices; coach update/delete and verify zero phantom entries; check leaderboard and profiles; backup and documented rollback.

## What the package does not do
It is NOT a database backup, does NOT convey site ownership, and does NOT give unrestricted admin login. A school administrator must export the database, transfer Netlify/Supabase projects, invite authorized developers, and rotate/revoke prior credentials.

Other Leaderboards uses saved game events and optional per-game box scores. See `database/game_stats_reference.md` for the import format and missing-data behavior. The existing shooting page is labeled Shooting Leaderboards.

`schedule.html` lists the user-provided 16-game 2026-27 schedule in compact date/time/opponent/score rows. `assets/season-schedule.js` seeds those games once per browser without duplicating existing games. `assets/schedule.js` supports game editing, HTTPS Hudl links, schedule CSV imports, and per-game player-stats CSV uploads with roster matching and review before saving. Re-uploading replaces only that game's imported player totals. Uploaded shooting pairs feed game profile charts; explicit box-score values take precedence over legacy events. All schedule and game data stays in local storage and JSON backups; the Supabase API still syncs practice data only.

`live-game.html` provides game selection, a clickable half-court, five player slots for each team, opponent roster creation, and quick-stat entry. Events persist to the selected game with team, player, court coordinates, and timestamp. Fast Break 2 records one made two-pointer tagged as a fast break. Opponent events are kept separate from Park Tudor analytics. Live events, lineups, and opponent rosters are saved locally and included in JSON backups.

Schedule additions, edits, schedule CSV imports, and Hudl uploads prompt for the coach access code before opening the editor or file picker. They share the same verifier as Coach Review. Approval is limited to the current editor/import and cleared when it closes or the page is left. This is the existing local code gate; cloud edits use the same coach access after unlocking Coach Review. Deploy the updated `pt-hub` Edge Function together with the frontend; older deployed functions still require the previous account sign-in.

## Code-only coach deletion
Coach Review requires only the coach access code (232323 by default). Each individual make or miss has a Delete action under Individual Submissions. The same action also deletes an entire aggregate submission; corrections and deletions remain in the local Correction History. Cloud deletions must succeed before the local record is removed.

Cloud coach operations use the `X-Coach-Code` header; Supabase account email/password sign-in is no longer used by the website. Deploy the frontend and updated Edge Function together. From `01_STUDENTS`, run `supabase functions deploy pt-hub --project-ref jbznaeunhtqgagnqweqw --no-verify-jwt` using the project administrator's existing CLI access. The checked-in `supabase/config.toml` also disables gateway JWT verification for this function, which validates the coach code internally. This deployment step is for administrators, not a coach login step.

## Live Game reports
Generate Report opens a read-only snapshot of the selected game. The report has a portrait summary with team stats, both player box scores, and Quick Insights, followed by team shot charts and zone tables. Use Print / Save PDF in the report toolbar. The summary fits the front and shot charts fit the back of one sheet: choose portrait, double-sided printing, and flip on the long edge. Generating a report does not edit the game or create demo stats in team data.

Calculations are in `frontend/assets/game-report-data.js`; rendering and print styles are in `game-report.js` and `game-report.css`. Imported player totals are supplemented only by later live events. Imported box scores do not provide shot locations. Missing metrics remain unavailable; second-chance points require explicit data. Fast-break points are used instead of the retired points-off-turnovers metric.

Quick Insights uses the open-weight SmolLM2-135M-Instruct model in a browser worker through Transformers.js 3.8.1. The first run downloads roughly 137 MB of quantized model weights from Hugging Face, plus the runtime; the browser can cache these files. No inference API key is needed, and game statistics are processed on the device. The model chooses among verified statistical observations rather than inventing numbers or missing possessions. If downloading or inference fails, the report labels its fallback as a stat-based summary and offers Retry Quick Insights. The report and printing remain available.

Model: https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX-MHA
Runtime: https://huggingface.co/docs/transformers.js
Report calculation tests: `node --test tests/game-report.test.cjs` from the repository root.
