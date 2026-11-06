# Run analytics on Cloudflare D1

A separate Worker stores one anonymous report when a solo or multiplayer run ends. The solo
client or co-op host posts to the same HTTPS endpoint, whichever relay hosted the room. Guests
don't submit. A build without a collector URL sends nothing, and players can turn reporting off
with Share run stats in Settings. Gameplay and local saves never wait for reporting.

## Set up the collector

You need a Cloudflare account (free is fine), Bun and Node 22 or newer. The scripts use the Wrangler
installed for the co-op relay, but deploy a different Worker, `run-escape-analytics`.

1. **Install and log in**, from the repository:

    ```sh
    cd server/cloudflare
    bun install --frozen-lockfile
    bun run wrangler login
    ```

2. **Say where the game is.** In `server/analytics/wrangler.toml`, add the web game's origin to
   `ALLOWED_ORIGINS` (comma-separated; `https://run-escape.invalid`, already there, is the desktop
   app). If another Worker on your account already uses rate limit namespaces `11501` or `11502`,
   pick others.

3. **Create and deploy it**, the first time only:

    ```sh
    bun run analytics:setup
    ```

    The first deploy creates the `run-escape-analytics` database, then the schema is applied. It
    prints the Worker's address, `https://run-escape-analytics.<subdomain>.workers.dev`.

4. **Set a read token** for the daily stats and a private leaderboard: a random string of at
   least 32 characters, kept somewhere safe, as you'll send it to read them.

    ```sh
    bun run wrangler secret put ANALYTICS_READ_TOKEN -c ../analytics/wrangler.toml
    ```

    Reads fail closed without it. Never put it in a game build or a `VITE_` variable.

5. **Point the game at it.** Build the web game with
   `VITE_RUN_ANALYTICS_URL=https://<the Worker's address>/v1/runs`. For desktop releases, set the
   repository variable `RUN_ANALYTICS_URL` (Settings, Secrets and variables, Actions) to the same
   URL, and the release workflow builds it into the game and the launcher. An older launcher
   needs a new download before it lets the game reach the collector. `COOP_URL` is independent.

**After a change** to the Worker or a new migration, run `bun run analytics:deploy`. It applies
new migrations before deploying, so new code never runs against an old schema. Migrations must
add to the schema (new tables, columns with defaults) rather than change it, since the running
Worker uses it until the deploy finishes.

**Locally**, run `bun run analytics:dev`, which applies the schema to a local database and serves
the Worker on port 8789. Put the dev game's origin (usually `http://localhost:5173`) and a test
read token in `server/analytics/.dev.vars`:

```sh
ALLOWED_ORIGINS=http://localhost:5173
ANALYTICS_READ_TOKEN=a-local-token-of-at-least-32-characters
```

and start the game with `VITE_RUN_ANALYTICS_URL=http://localhost:8789/v1/runs bun run start`.

## What it accepts

The collector checks each report's shape and ranges, not the game's rules. A map, mode or
adventurer id is any lowercase id (`a-z`, `0-9`, `_`, up to 40), so new content is recorded
without redeploying the collector, and a game rule changing (expert in co-op, say) doesn't drop
reports. A version is `x.y.z`. `MAX_RUNS_PER_DAY` caps how many runs are stored a day, however
they're sent; past it, reports are dropped until the next UTC day.

Reports carry a `schemaVersion` (`RUN_REPORT_VERSION` in `src/game/client/RunAnalytics.ts`).
When a report's fields change, give it a new version and add its reader to `READERS` in
`schema.mjs`, keeping the old one while older games are still played: the desktop app's game
updates only when its player takes the update.

## What gets stored

`runs` holds individual reports. An insert trigger updates `daily_stats` and the day's count in
the same transaction. The solo client or host creates a random UUID at run start and reuses it on
retry, and the first accepted report for that ID wins: duplicates can't overwrite it, add a
leaderboard entry or count twice. Missing reports (an offline game, a tab closed before sending)
aren't losses. Development maps, stress runs and test raids aren't reported.

- `run_id`, `day`, `ended_at`, `received_at`: the UUID, the UTC day the collector received it,
  and the game's end time and the collector's receipt time (Unix ms). A report more than a day
  from the collector's clock is refused.
- `version`, `build`: the game's version and build. Daily summaries group by version; raw rows
  keep the build.
- `play_type`, `relay`, `party_size`, `characters`: singleplayer or multiplayer; none, Node or
  Cloudflare; the starting party's size and its adventurers, sorted and comma-separated. A host
  playing on alone after losing the relay keeps its starting values.
- `map_id`, `mode`, `endless`, `round`: the map and difficulty the run used (`normal`, `hard` or
  `expert`, expert taking precedence), endless or not, and the round reached.
- `outcome`, `players_left`: a victory is `completed`. The party falling is `failed`, even when
  someone had left before. A run whose last hero standing left, or that the player gave up, is
  `abandoned`, and one interrupted (a graphics reload) is `disconnected`. How many players left
  is counted on its own.
- `duration_seconds`, `level`, `kills`, `coins`, `caskets`: simulation time, the end level, the
  party's kills, coins earned before spending or theft (stolen coins returned aren't earned
  again), and caskets opened.
- `damage_dealt`, `damage_taken`, `healed`, `highest_hit`, `dps`: summed across heroes, the
  highest single hit, and the party's DPS over the whole run (damage over simulation seconds).
  Daily DPS is the ratio of the totals.

A three-player hard Barrows victory counts once for that map, difficulty and starting size. A
teammate going down while the rest fight on doesn't end the run, so it isn't a result.

Party composition is in the raw rows only. `daily_stats` is keyed by every column it groups by,
so a new dimension there means a new table; composition would multiply its rows. Query raw rows
for composition, within their retention.

## Run checks

The co-op relays check a run's frames as they pass (`server/coop-checks.mjs`). For each run they
find anything in, a relay can send the collector a row of its own in `run_checks`: the host's
game can't leave it out, and it's sent whether or not the players share their run stats. It holds
no names, room codes or addresses: the run's build, map, mode, endless, party size and
adventurers (as the host's game gave them, `unknown` where that was nothing a game sends), how far
it got, a count of each kind found, the kind its host was caught by, and whether the relay ended
it. An honest run sends nothing. `MAX_CHECKS_PER_DAY` caps the rows a day, and they expire with
raw runs.

Nothing joins a row to the host's report in `runs`, but the two share their day, build, map,
mode, endless, party and adventurers, and a run the relay didn't end reaches the collector from
both within moments, with about the same length. A run the relay ended goes on alone on the
host's game, which reports it later. The viewer's SQL examples include the query.

To turn it on, once the collector's deployed, choose a token (a random string of at least 32
characters) and give it to the collector and the relay:

```sh
bun run wrangler secret put RUN_CHECKS_TOKEN -c ../analytics/wrangler.toml
bun run wrangler secret put RUN_CHECKS_TOKEN      # the Cloudflare relay
```

The Cloudflare relay reaches the collector through the service binding in its `wrangler.toml`,
which names `run-escape-analytics` (change it there if you renamed the collector). The token turns
it on and off: `wrangler secret delete RUN_CHECKS_TOKEN` stops the rows. The Node relay posts to
`RUN_CHECKS_URL=https://<the Worker's address>/v1/run-checks`, with `RUN_CHECKS_TOKEN` set in its
environment. Without both, a relay sends nothing. A row that doesn't arrive is only missed: the
relay's log has the run's summary too.

## Query by day

`GET /v1/daily?from=2026-11-01&to=2026-11-04&play=multiplayer&endless=false` needs
`Authorization: Bearer <ANALYTICS_READ_TOKEN>`, even when the leaderboard is public. Dates are
inclusive UTC days (today by default, 31 days at most). Optional filters: `map`, `mode`, `play`,
`relay`, `party_size`, `endless`, `version`, `outcome`. It reads only the daily summaries. Each
row has a count, time and stat totals, the highest hit, the average duration and DPS. At 1,000
rows the answer says it was truncated; narrow the dates or filters.

Anything else is a query in the dashboard, or with
`bun run wrangler d1 execute DB --remote -c ../analytics/wrangler.toml --command "..."`. Wins
against full-party deaths on both relays, for example:

```sql
SELECT day, map_id, mode, party_size, outcome, SUM(runs) AS runs
FROM daily_stats
WHERE day BETWEEN '2026-11-01' AND '2026-11-04'
  AND play_type = 'multiplayer' AND party_size IN (2, 3, 4)
  AND endless = 0 AND outcome IN ('completed', 'failed')
GROUP BY day, map_id, mode, party_size, outcome;
```

and win rate by adventurer from the raw rows:

```sql
SELECT characters, map_id, mode,
       AVG(outcome = 'completed') AS win_rate, COUNT(*) AS runs
FROM runs
WHERE play_type = 'singleplayer' AND endless = 0 AND outcome IN ('completed', 'failed')
GROUP BY characters, map_id, mode;
```

## Export and look through it

From `server/cloudflare`, the following command writes the whole database, schema and rows, as SQL.

```sh
bun run wrangler d1 export run-escape-analytics --remote \
    --output runs-2026-11-05.sql -c ../analytics/wrangler.toml
```

Pass `--table daily_stats` to export a single table. Repeat `--table` for more tables or pass
`--no-schema` to omit the `CREATE` statements. The viewer needs the `runs` table to show party
composition, the leaderboard and individual runs. An export
[holds up the database's other requests](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
while it runs. Raw runs expire after `RAW_RETENTION_DAYS`, so keep an export at least that often
to look back further.

To look through exports offline, start the viewer from the repository:

```sh
node server/analytics/viewer/serve.mjs
```

open `http://localhost:8790`, and drop export files on the page (or use Add exports). It loads
files in `server/analytics/exports/` when it starts, which git ignores, and takes files or
folders on the command line too; `--port` changes the port. Nothing leaves your computer and
nothing needs installing: it uses Node's built-in `node:sqlite`, in Node 22.5 or newer.

It shows runs per day, outcomes and win rate by map, difficulty and party, endless survival and,
from raw runs, win rate by adventurer and starting party, the leaderboard and the latest runs,
all filtered by day, map, mode and the rest. A table browser and a read-only SQL console with CSV
download cover anything else. Files load in name order, a later row replacing an earlier one
with the same key, so a folder of daily exports reaches past retention. Only the statements an
export contains run from a file, so a file someone sent you can't do more than add rows.

## Anonymous leaderboard

`GET /v1/leaderboard?day=2026-11-04&map=barrows&version=0.25.0&play=multiplayer&party_size=3&mode=hard&endless=false&limit=20`
needs the same token by default. Set `PUBLIC_LEADERBOARD = "true"` and deploy to allow anonymous
reads of **this endpoint only**. The game never needs a read token.

`map` and `version` are required. Defaults: today (UTC), singleplayer, party size 1 (2 for
multiplayer), normal, not endless, 20 rows (100 at most). Runs compete within the exact day, map,
version, play type, difficulty, party size and endless setting; both relays compete together.
Finite runs rank the **fastest completions** first, endless runs the **longest survival**,
including a player who chose to stop. Zero-length runs, interrupted ones and runs a teammate left
aren't ranked. A partial index serves each partition already in score order, ties broken by
UUID, so a query reads only the rows it returns.

Scores are client-reported. Validation, an origin allowlist, a 4 KiB body limit, per-address rate
limiting and the daily cap protect capacity; they don't prove a score is honest. D1 stores no
names, persistent player IDs, IP addresses, saves, loadouts or room codes. The address is used
only for rate limiting.

## Free-tier budget and retention

[D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) includes 5 million rows read and
100,000 rows written a day; [storage limits](https://developers.cloudflare.com/d1/platform/limits/)
are 500 MB a database and 5 GB an account. Every index entry counts as a row written, so a run
costs several: its row and its index entries, its daily summary and the day's count, and the
deletes when it expires. The tables are `WITHOUT ROWID` so their keys aren't a second index.
Check rows written per run in the D1 dashboard, and set `MAX_RUNS_PER_DAY` to what your plan's
writes allow; the default leaves room on Free. When the cap or a quota is reached, reports are
lost and the game carries on.

An hourly job deletes expired rows: raw runs and run checks in batches until none are left
(`PRUNE_BATCH` and `PRUNE_BATCHES` in `worker.mjs` allow many times the daily cap an hour), and
expired summaries a day at a time. `RAW_RETENTION_DAYS`
defaults to 30 and `DAILY_RETENTION_DAYS` to 365 (UTC days, 2 at least). Rankings cover the
retained raw days; deleting a raw run doesn't take it out of its daily totals. Raise the
retention, or export before rows expire, for longer history.

[Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) lists
100,000 data points and 10,000 read queries a day on Free. It suits higher-volume trends, but it
[may sample](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) and
[keeps data for three months](https://developers.cloudflare.com/analytics/analytics-engine/limits/).
D1 gives exact deduplication, lasting daily totals and indexed rankings for this.
