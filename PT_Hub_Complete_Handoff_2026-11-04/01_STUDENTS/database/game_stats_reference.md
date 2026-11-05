# Other Leaderboards game statistics

Other Leaderboards reads `games` from the existing browser data and JSON backups. It does not infer game statistics from practice shooting submissions. Game data is not currently part of the Supabase snapshot API.

The Schedule page imports per-game player CSV reports into this format. It detects supported player/stat headers after optional metadata rows, matches names or jersey numbers to the roster, and allows player matches to be corrected before saving. Validation rejects negative or invalid stats, duplicate player rows, games-played totals greater than one, and shooting totals with more makes than attempts. Re-uploading replaces only that game's `playerStats`; it preserves game metadata and legacy events.

Imported shooting pairs use `twoMade`/`twoAttempts`, `threeMade`/`threeAttempts`, and `ftMade`/`ftAttempts`. `FGM`/`FGA` can derive two-point totals when three-point totals are supplied, or supply an unsplit field-goal category otherwise. Game profile charts prefer these box-score pairs over matching event categories to avoid double-counting. Shot locations are not inferred from aggregate box-score totals.

Each game may include a `playerStats` array, with one row per player. A row represents participation unless `played` is false or `gamesPlayed` is zero. Provide explicit zeros for recorded zero totals; omit unknown fields. Saved legacy game events supply points, fouls, rebounds, assists, turnovers, steals, and blocks when a box-score field is absent. An explicit box-score value takes priority, so the same stat is not counted twice.

```json
{
  "id": "example-game",
  "date": "2026-11-04",
  "opponent": "Example opponent",
  "events": [],
  "playerStats": [
    {
      "playerId": "matching-roster-player-id",
      "played": true,
      "started": true,
      "minutes": 25.5,
      "personalFouls": 2,
      "pts": 18,
      "orb": 3,
      "drb": 5,
      "ast": 4,
      "to": 2,
      "stl": 1,
      "blk": 0,
      "pitp": 10,
      "fbp": 2
    }
  ]
}
```

Minutes may be numeric or an `MM:SS` string. Alternatively, `game.starters` may contain player IDs. Points in the paint (PITP) and fast break points (FBP) require explicit totals or scoring events tagged with `inPaint` and `fastBreak` booleans, respectively. These are subsets of points and are not added to PTS.

All boards rank descending totals, show up to 20 athletes, share ranks for ties, and filter by inclusive game-date range. Minimum Games counts games with recorded data for the particular stat; the Games column shows that count. Missing statistics display an empty-state message instead of fabricated zeros. Games Started and Games Played count per-game participation flags, not season totals supplied in one row.

Live Game events include `team` (`pt` or `opponent`), `playerId`, `type`, `x`, `y`, and `recordedAt`. Opponent players live in `game.opponentPlayers`, and opposing events do not enter Park Tudor leaderboards or profiles. Fast Break 2 is a single `TWO_M` event with `fastBreak: true`. New live events recorded after a Hudl import supplement that import; re-uploading a report makes it the new baseline.
