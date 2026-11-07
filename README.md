PT BASKETBALL ANALYTICS HUB

A basketball tracking website for Park Tudor players and coaches.
Built with HTML, CSS, JavaScript, and Supabase. The frontend is configured
for Vercel hosting and does not require a frontend build step.

FEATURES
- Enter Practice Data: record shooting makes, misses, drill wins, and losses.
- Live Game: select players, mark court locations, and record game stats.
- Shooting Leaderboards: compare shooting results and daily champions.
- Other Leaderboards: compare game stats and drill wins or win percentage.
- Player Profiles: view individual shooting heat maps and progress over time.
- Team Profile: view combined team shooting data and trends.
- Schedule: view games, manage game details, and upload Hudl stats.
- Coach Review: manage the roster, review or delete submissions, and back up data.

USING THE WEBSITE

Enter Practice Data
Select a player, drill, and practice date. Tap Made or Missed to save
individual attempts. Undo Last Shot corrects a recent entry. Categories
include free throws, three-point locations, Midrange Low, Midrange High,
floaters, finishing, and custom drills. Entries save their recording time
separately from the selected practice date.

Section 3 records drill wins and losses. Player cards are ordered by last
name, left to right and then top to bottom. Choose Win or Lose for each
participating player and submit. Leave nonparticipants unselected.
Clear removes a player's current selection before submission.

Live Game
Choose a game, assign players to the two team lineups, and select the
active player. Click a location on the half-court, then use the shortcut
buttons to record shots, rebounds, assists, turnovers, steals, blocks,
fouls, or fast-break scoring. Opposing players can be added separately.
The score appears below the court. Undo reverses the latest live entry.

Leaderboards
Shooting Leaderboards compares shooting results by drill and date range.
Daily Shooting Champions requires at least 20 attempts in a drill on
that date; ties share a daily win.

Other Leaderboards shows game statistics from recorded games and imported
Hudl totals. Its Drill Wins section ranks practice results by Total Wins
or Win %. Win percentage equals wins divided by wins plus losses.
The date filter applies to drill results; the minimum-games filter
applies to the game-stat boards.

Player and Team Profiles
View individual or combined team shooting with heat maps and trend
graphs. Switch between practice and game results. Select the shot type
and display attempts, makes, or percentage over time.

Heat maps use zone-specific percentage standards. Red, orange, yellow,
light green, and green run from lower to higher performance. Gray means
no recorded attempts. Expand Zone percentage standards to see the cutoffs.
Midrange Low is on the baseline side of the free-throw line; Midrange
High is above it. Older unsplit Midrange records remain in totals
without being assigned a court zone.

Schedule and Hudl Imports
View games chronologically with dates, times, opponents, available scores,
and Hudl links. Coach-protected tools add or edit games, import a schedule
CSV, and upload an individual game's Hudl statistics. Review player
matches before saving. Replacing an import updates that game's imported
player totals.

Coach Review
Search Individual Submissions by player name, jersey number, selected
player, date range, or drill. Recorded At shows the time beside the
practice date. Correct shooting totals or delete submissions as needed.
Corrections and deletions appear in Correction History. Shared-shot
deletion must succeed before the local record is removed.

RUN LOCALLY
1. Install Python if it is not already installed.
2. Open a terminal in the project folder.
3. Run:

python -m http.server 8000 --bind 127.0.0.1 --directory "PT_Hub_Complete_Handoff_2026-11-04/01_STUDENTS/frontend"

4. Open http://127.0.0.1:8000 in your browser.
5. Keep the terminal open while using the website. Press Ctrl+C to stop.

If Windows does not recognize python, try py in the same command.
For a 404 error, check that the terminal is in the repository root and
that the directory in the command exists. If port 8000 is occupied,
stop the existing server or choose another port. Backend cloud access
currently permits local requests on port 8000.

The local server runs the frontend. It still uses the configured Supabase
service for shared practice data; it does not start a separate database.

PROJECT FILES
The active website is in:
PT_Hub_Complete_Handoff_2026-11-04/01_STUDENTS/frontend/

Each page has its own HTML file. Shared JavaScript, CSS, and images are
in frontend/assets/. Supabase backend code and database migrations are
in 01_STUDENTS/supabase/.

Important shared files in frontend/assets/:
- app.js: application state, practice shooting, roster, and coach review.
- drill-results.js: practice drill win/loss entry.
- profiles.js: heat maps and shooting trend charts.
- analytics.js: shooting leaderboard rendering.
- other-leaderboards.js: game-stat and drill-win rankings.
- live-game.js: live player selection and stat entry.
- schedule.js and season-schedule.js: schedule and game imports.
- coach-access.js: coach access-code checks.
- cloud.js: shared practice and roster integration.
- styles.css: shared styles and responsive layouts.

The backend function is in supabase/functions/pt-hub/index.ts.
Database updates are in supabase/migrations/.
supabase/config.toml contains the function's code-access configuration.

COACH ACCESS
Use the coach access code to unlock Coach Review and schedule changes.
Obtain the access code privately from an authorized coach or administrator.

DATA AND BACKUPS
Browser storage saves local data. Supabase handles shared data when the configured cloud service is available.
Use Coach Review > Backup to export or import a JSON backup.
Always use the same browser and address to access your local data.

Different browsers, devices, domains, and localhost versus 127.0.0.1 can
have different local records. Clearing browser storage removes local data.
Pushing code to GitHub does not back up browser statistics.

Export a backup before switching devices, clearing browser storage, or
importing data. Importing a backup replaces the current browser's
application data. Keep backup files somewhere accessible.

DEPLOYMENT
The repository contains a Vercel configuration in vercel.json. It sets
the frontend output directory to:
PT_Hub_Complete_Handoff_2026-11-04/01_STUDENTS/frontend

The configuration also enables clean URLs. Keep all HTML pages and assets
together when deploying. Automatic deployments depend on the connected
Vercel project's branch and deployment settings. The repository retains
a Netlify configuration from the earlier host as well.

The Vercel frontend and Supabase backend are deployed separately. Backend
changes require deploying the updated pt-hub function or applying the
relevant database migration. A Git push, frontend deployment, or local
server does not automatically deploy backend changes.

Deploy related frontend and backend changes together, especially changes
to coach access and timestamp handling. Keep credentials and private
access details out of documentation and commits.

Before publishing, check practice entry, coach access and deletion,
leaderboards, profiles, schedule imports, and Live Game on desktop and
mobile. Use test data rather than changing real team records.

REPOSITORY
https://github.com/DerekA24/PT-Hoops-Analytics
