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
GET `?action=snapshot`: shared players/drills/shots.
POST `?action=shot`: public shot entry.
POST `?action=player`: valid coach access code required.
PATCH `?action=shot`: coach correction with valid access code.
DELETE `?action=shot`: coach deletion with valid access code.

## Critical limitations
* Web visitors can submit shots anonymously; the Origin header is NOT an access-control mechanism. School administration should evaluate student privacy and abuse prevention.
* Some client analytics and schedules may use browser storage; not all website sections are established as fully cloud-backed.
* After cloud deletions, ensure cached analytics fully reconcile on every device.
* Other devices may need a refresh to see newly recorded shots.
* The frontend can include a shared Coach Review access code. Treat it as nonsecret and rotate it when school administrators take control.
* Never commit service-role keys, database passwords, coach passwords, student data exports, or personal credentials to GitHub.

## Verification before any production release
Phone and desktop navigation; 16 roster entries; add one make and one miss for Test Player; verify across devices; coach update/delete and verify zero phantom entries; check leaderboard and profiles; backup and documented rollback.

## What the package does not do
It is NOT a database backup, does NOT convey site ownership, and does NOT give unrestricted admin login. A school administrator must export the database, transfer Netlify/Supabase projects, invite authorized developers, and rotate/revoke prior credentials.

Other Leaderboards uses saved game events and optional per-game box scores. See `database/game_stats_reference.md` for the import format and missing-data behavior. The existing shooting page is labeled Shooting Leaderboards.

`schedule.html` lists the user-provided 16-game 2026-27 schedule in compact date/time/opponent/score rows. `assets/season-schedule.js` seeds those games once per browser without duplicating existing games. `assets/schedule.js` supports game editing, HTTPS Hudl links, schedule CSV imports, and per-game player-stats CSV uploads with roster matching and review before saving. Re-uploading replaces only that game's imported player totals. Uploaded shooting pairs feed game profile charts; explicit box-score values take precedence over legacy events. All schedule and game data stays in local storage and JSON backups; the Supabase API still syncs practice data only.

`live-game.html` provides game selection, a clickable half-court, five player slots for each team, opponent roster creation, and quick-stat entry. Events persist to the selected game with team, player, court coordinates, and timestamp. Fast Break 2 records one made two-pointer tagged as a fast break. Opponent events are kept separate from Park Tudor analytics. Live events, lineups, and opponent rosters are saved locally and included in JSON backups.

Schedule additions, edits, schedule CSV imports, and Hudl uploads prompt for the coach access code before opening the editor or file picker. They share the same verifier as Coach Review. Approval is limited to the current editor/import and cleared when it closes or the page is left. This is the existing local code gate; cloud edits use the same coach access after unlocking Coach Review. Deploy the updated `pt-hub` Edge Function together with the frontend; older deployed functions still require the previous account sign-in.
