# Run analytics on Cloudflare D1

A separate Worker stores one anonymous report when a solo or multiplayer run ends. The solo
client or co-op host posts to the same HTTPS endpoint, independently of which relay hosted the
room. Guests don't submit. A build without a collector URL sends nothing. Gameplay and local
saves never wait for reporting.

## Set up the collector

Use Node 22+ and the existing Wrangler installation: from `server/cloudflare`, run `npm ci`.
The commands below target the **analytics** config, a different Worker from the co-op relay.

1. Run `npx wrangler d1 create run-escape-analytics --config ../analytics/wrangler.toml`.
   Replace the placeholder database ID in that config. Set `ALLOWED_ORIGINS` to the exact
   comma-separated game origins, e.g. `https://game.example,https://run-escape.invalid` (the
   latter is the desktop app). Use unused rate-limit namespace IDs for your Cloudflare account.
2. Apply the schema, deploy, and set a random operator read secret of at least 32 characters:

    ```sh
    npx wrangler d1 migrations apply DB --remote --config ../analytics/wrangler.toml
    npx wrangler deploy --config ../analytics/wrangler.toml
    npx wrangler secret put ANALYTICS_READ_TOKEN --config ../analytics/wrangler.toml
    ```

    Reads fail closed without the secret. Never put it in a game build or a `VITE_` variable.

3. Build the web game with `VITE_RUN_ANALYTICS_URL=https://<analytics-worker>/v1/runs`.
   For desktop releases set the GitHub Actions repository variable `RUN_ANALYTICS_URL` to the
   same URL. It is built into both game and launcher; an older launcher needs a new download to
   permit the endpoint. `COOP_URL` remains independent.

For a local test use `--local` instead of `--remote` to apply the migration, then run
`npx wrangler dev --local --config ../analytics/wrangler.toml --port 8789`. Put the dev game's
actual origin (usually `http://localhost:5173`) and a test read secret in
`server/analytics/.dev.vars` as `ALLOWED_ORIGINS` and `ANALYTICS_READ_TOKEN`. Build or start
the game with `VITE_RUN_ANALYTICS_URL=http://localhost:8789/v1/runs`.

## What gets stored

`runs` contains individual reports. An insert trigger updates `daily_stats` in the same
transaction. The solo client or host creates a random UUID at run start and reuses it on retry.
The first accepted report for that ID wins: duplicates cannot overwrite it, add a leaderboard
entry or increment the summary twice. Missing reports (e.g. an offline game
or a tab killed before sending) aren't losses. Development maps, stress runs and test raids
are excluded.

| Run columns                                                    | Meaning                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_id`, `ended_at`, `received_at`, `day`                     | Anonymous UUID, client end and server receipt times (Unix ms), UTC end date. Reports must be no more than 24 hours old or 5 minutes ahead.                                                                                                      |
| `version`, `build`                                             | Game version and build ID. Daily summaries group by version; raw rows retain the build.                                                                                                                                                         |
| `play_type`, `relay`, `party_size`                             | Singleplayer/multiplayer, none/Node/Cloudflare, and starting party size. A host continuing alone after a disconnect keeps its original dimensions.                                                                                              |
| `map_id`, `mode`, `endless`, `round`                           | Actual map and difficulty applied by the simulation. Expert takes precedence over hard; unmodified play is normal. An omitted mode is stored as `default`. Endless is independent of difficulty.                                                |
| `outcome`, `players_left`                                      | Victory is `completed`; only every starting hero dying is `failed`. Give-ups and endings caused by a live teammate leaving are `abandoned`. An interrupted run (e.g. graphics reload) can be `disconnected`. Departures are counted separately. |
| `duration_seconds`, `level`, `kills`, `coins`, `caskets`       | Simulation time survived as a run (including endless), end level, party-wide mobs killed, coins earned before spending or theft (returns of stolen coins are not new earnings) and caskets opened. Shared totals count once.                    |
| `damage_dealt`, `damage_taken`, `healed`, `highest_hit`, `dps` | Damage and healing summed across heroes, highest single hit, and whole-run party DPS = damage / simulation seconds (zero at zero seconds). Daily DPS uses the ratio of totals.                                                                  |

For example, a three-player hard Barrows victory counts once for that map, difficulty and
starting party size. A teammate dying while the rest fight on doesn't produce a result.

## Query by day

`GET /v1/daily?from=2026-11-01&to=2026-11-04&play=multiplayer&endless=false` requires
`Authorization: Bearer <ANALYTICS_READ_TOKEN>`, even when the leaderboard is public. Dates are
inclusive UTC days (default today; at most 31 days). Optional filters: `map`, `mode`, `play`,
`relay`, `party_size`, `endless`, `version`, `outcome`. The endpoint reads **only** the daily
summary table. Each row contains a count, time and stat totals, highest hit, average duration and
DPS. At 1,000 rows the response indicates whether it was truncated; narrow the dates or filters.

To compare wins and full-party deaths across both relays, for example:

```sql
SELECT day, map_id, mode, party_size, outcome, SUM(runs) AS runs
FROM daily_stats
WHERE day BETWEEN '2026-11-01' AND '2026-11-04'
  AND play_type = 'multiplayer' AND party_size IN (2, 3, 4)
  AND endless = 0 AND outcome IN ('completed', 'failed')
GROUP BY day, map_id, mode, party_size, outcome;
```

## Anonymous leaderboard

`GET /v1/leaderboard?day=2026-11-04&map=barrows&version=0.25.0&play=multiplayer&party_size=3&mode=hard&endless=false&limit=20`
requires the same bearer token by default. Set `PUBLIC_LEADERBOARD = "true"` and deploy to allow
anonymous reads of **this endpoint only**. The game never needs a read token.

`map` and `version` are required. Defaults: today UTC, singleplayer, party size 1 (2 for
multiplayer), normal, non-endless, limit 20 (maximum 100). Runs compete within the exact day,
map, version, play type, difficulty, party size and endless setting; both relay types compete
together. Finite runs rank **fastest completions** first. Endless runs rank **longest survival**
first, including a player who chose to stop. Zero-duration runs, disconnected endings and runs
with a departed teammate are not ranked. A partial composite index serves that partition already
in score order, breaking ties by UUID. The query stops at the requested number of rows.

Scores are client-reported. Validation, an origin allowlist, a 4 KiB body limit and per-address
rate limiting protect capacity; they don't prove a score is honest. D1 stores no names, persistent
player IDs, IPs, save files, loadouts or room codes. The address is used only for rate limiting.

## Free-tier budget and retention

[D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) includes 5 million rows read and
100,000 rows written per day; [storage limits](https://developers.cloudflare.com/d1/platform/limits/)
are 500 MB per database and 5 GB per account. **100,000 writes is not 100,000 runs**: the raw row,
index entries, summary upsert and retention deletes use capacity. Measure rows written per run
and database size in the D1 dashboard. Worker requests also use the account's request quota.
When a quota is exhausted, reports can be lost; the game continues normally.

An hourly job deletes up to 1,000 expired raw rows and 1,000 expired summary rows per invocation.
`RAW_RETENTION_DAYS` defaults to 30 and `DAILY_RETENTION_DAYS` to 365 (UTC day cutoffs).
Rankings cover retained raw days; deleting a raw run does not subtract from its daily totals.
Adjust retention or export before expiry if longer history is needed, and monitor the cleanup
backlog at higher traffic.

[Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) lists
100,000 data points and 10,000 read queries per day on Free. It fits higher-volume trends, but
it [may sample](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) and
[retains data for three months](https://developers.cloudflare.com/analytics/analytics-engine/limits/).
D1 provides exact deduplication, retained daily totals and indexed rankings for this use case.
