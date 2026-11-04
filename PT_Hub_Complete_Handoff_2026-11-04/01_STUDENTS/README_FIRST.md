# PT Basketball Analytics Hub | Student handoff
Prepared November 4, 2026. Read before editing.

## Start here
1. Read `Student_Developer_Guide.docx`.
2. Review `frontend/index.html` and `supabase/functions/pt-hub/index.ts`.
3. Have a faculty administrator establish a school-owned GitHub repository and staging environment. Do not deploy to production without approval.
4. Before editing, compare `frontend/index.html` with the actual current Netlify deployment. This is the latest local deployment artifact available, but independent verification of the current hosted bytes was not possible.
5. Test with fictional users and shots in staging. Never overwrite production shots or student roster data to test a change.

## Live architecture
Browser -> Netlify `https://ptbasketballhub.netlify.app` -> Supabase Edge Function `https://wlgicbxuwzokvwpjkaus.supabase.co/functions/v1/pt-hub` -> PostgreSQL.
The frontend is one HTML file with CSS and JavaScript. `pt-hub` is a Deno TypeScript Edge Function. The web code uses a publishable Supabase key for coach sign-in; the service role secret stays server-side in Supabase only.

## Deployment
Frontend: commit and test source in school-owned Git, and publish via the EXISTING `ptbasketballhub` Netlify project after authorized review. Never create a replacement project without school approval. Backend: deploy `supabase/functions/pt-hub/index.ts` only via authorized Supabase admin access. A domain change requires updating the server's allowed Origin and Supabase Authentication redirect settings.

## Supabase API actions
GET `?action=snapshot`: shared players/drills/shots.
POST `?action=shot`: public shot entry.
POST `?action=player`: authenticated authorized coach only.
PATCH `?action=shot`: authenticated authorized coach correction.
DELETE `?action=shot`: authenticated authorized coach deletion.

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
