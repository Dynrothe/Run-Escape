# Cloud saves on Cloudflare D1

A small Worker keeps a copy of a player's save against a **sync code**, so they can carry it to
another browser, the desktop app or a phone. There's no login and nothing personal: the code is
the account. The game makes one when a player turns on cloud save, shows it to copy, and the
player types it in on the other device. The Worker keeps only the code's SHA-256.

The local save stays the main copy. The game uploads at save points (a run's results, leaving
Skills or the Armoury, an import, leaving the tab), only when the progress has changed, and two
minutes apart at least. A game whose build has no cloud-save URL, or that can't reach it, doesn't
offer cloud save at all.

## Set up the Worker

It's set up like the run collector (`server/analytics/README.md`), with the same Wrangler, as a
third Worker, `run-escape-cloud-saves`, with its own database. It can share the account with the
relay and the collector.

1. **Install and log in**, from the repository, if you haven't for the relay or the collector:

    ```sh
    cd server/cloudflare
    bun install --frozen-lockfile
    bun run wrangler login
    ```

2. **Say where the game is.** In `server/cloud-saves/wrangler.toml`, add the web game's origin to
   `ALLOWED_ORIGINS` (comma-separated). The desktop app's (`https://run-escape.invalid`) and the
   Android app's (`https://appassets.androidplatform.net`) are already there. If another Worker on
   your account already uses rate limit namespaces `11503` to `11505`, pick others.

3. **Create and deploy it**, the first time only:

    ```sh
    bun run saves:setup
    ```

    It prints the Worker's address, `https://run-escape-cloud-saves.<subdomain>.workers.dev`.

4. **Point the game at it.** Build the web game with
   `VITE_CLOUD_SAVE_URL=https://<the Worker's address>`. For releases, set the repository variable
   `CLOUD_SAVE_URL` (Settings, Secrets and variables, Actions) to the same address. The desktop
   and Android apps only let the game reach it from the release that added it: an older app keeps
   working, without cloud save.

**After a change** to the Worker or a new migration, run `bun run saves:deploy`. Migrations must
add to the schema rather than change it, since the running Worker uses it until the deploy
finishes.

**Locally**, run `bun run saves:dev`, which serves the Worker on port 8791 with a local database.
Put the dev game's origin in `server/cloud-saves/.dev.vars`:

```sh
ALLOWED_ORIGINS=http://localhost:5173
```

and start the game with `VITE_CLOUD_SAVE_URL=http://localhost:8791 bun run start`.

## How it works

| Method and path            | Needs the code | Does                                                             |
| -------------------------- | -------------- | ---------------------------------------------------------------- |
| `GET /v1/health`           | no             | `{service: "run-escape-cloud-saves"}`, so the game knows it's up |
| `POST /v1/account`         | no             | a new sync code: `{code}`                                        |
| `DELETE /v1/account`       | yes            | marks the code deleted: `{deleted, restorableUntil}`             |
| `POST /v1/account/restore` | yes            | undoes that while it's kept: `{restored}`                        |
| `POST /v1/account/code`    | yes            | a new code for the same saves, the old one retired: `{code}`     |
| `GET /v1/save/meta`        | yes            | `{revision, summary, updatedAt}`, or `{revision: 0}` for none    |
| `GET /v1/save`             | yes            | the same, and `save`: the text as it was sent                    |
| `PUT /v1/save`             | yes            | `{baseRevision, save, force?}` → `{revision, updatedAt}`, or 409 |

The code goes in `Authorization: Bearer <code>`, in any case, with or without its dashes.

- **Revisions.** Each upload says which revision it was based on, and goes in only on top of it,
  in the same transaction as pruning old versions. Another device having got there first is a
  409 with `reason: "stale"` and the cloud save's revision and summary, and the game asks the
  player which to keep.
- **The newer-game rule.** An upload from an older game than the one that wrote the cloud's save
  (its `version` or `gameVersion`) is a 409 with `reason: "newer"`: an older game has dropped
  the ids it doesn't know. `force: true` writes it anyway, when the player chooses to, as
  `saveOverNewer` does for the local save.
- **Deleting is undoable for a week.** Anyone with a code can delete it, so a code that's leaked
  mustn't be able to wipe every version at once. `DELETE` only marks the code deleted
  (`accounts.deleted_at`). Its saves stay untouched for `DELETED_RETENTION_DAYS` (7), and
  meanwhile every request with the code but `POST /v1/account/restore` gets a 410 with
  `restorableUntil`, which restore undoes. The hourly job then removes the code and its saves.
- **A new code shuts out a leaked one.** Deleting can't, since whoever has the code can restore
  it. `POST /v1/account/code` gives the same saves a new code and retires the old one, which
  then gets a 401 everywhere. The player's other devices need the new one typed in.
- **Backups.** `KEEP_VERSIONS` (6) are kept per code: the save and five before it. So is the last
  version of each of the last `KEEP_DAYS` (7) UTC days, however many uploads came after it, so a
  flood of uploads can push out the newest few but not yesterday's. Both go in the same
  transaction as each upload. There's no restore in the game yet. To give a player an older one
  back, find their account by the code's hash and read the row, from `server/cloudflare`:

    ```sh
    bun run wrangler d1 execute DB --remote -c ../cloud-saves/wrangler.toml --command \
      "SELECT revision, summary, created_at FROM saves WHERE account_id = (SELECT id FROM accounts WHERE code_hash = '<sha256 of the code, no dashes, upper case>')"
    ```

## What it accepts

The Worker can't run the game's own save loading: `migrateSave` drops ids it doesn't know, so a
Worker left behind a release would strip new content out of saves. It checks the shape only, as
the run collector does: a JSON object of at most 64 KB, with a whole-number `version`, an
`x.y.z` `gameVersion`, and `runs` and `coins` as numbers, as every save has had. It stores the
text as it came, gzipped, and never migrates it; the game migrates a save when it downloads it.

Gzipped, a save may be 16 KB at most (`MAX_STORED_BYTES`). A full save is about 5 KB, but text
that won't compress is turned away, so the database can't be filled with junk, or used to keep
anything but saves.

The summary it shows the game is read from the plain fields: `runs`, `victories`, `totalCoins`,
the maps with a victory, and `gameVersion`.

## Privacy and limits

- **Stored:** a random account id, the code's SHA-256, each save version with its summary, and
  when; for each code, its uploads today and the last day it was used. No names, emails or IP
  addresses; the address is only used for rate limiting.
- **Codes nobody uses go.** A code with no save after a week goes, and one unused for
  `INACTIVE_DAYS` (25) goes with its saves, though each device keeps its own save. Using a code
  (any request with it, such as the game's check when it starts) is noted at most once a day.
- **Lost codes can't be recovered**, as there's nothing else to know a player by. The game keeps
  its file export, and shows the code again in Settings on any device that has it.
- **Rate limits:** every request per address (60 a minute); new codes and new codes for old ones
  per address (1 a minute); uploads per code (6 a minute) and per address, whatever the code (3 a
  minute).
- **Daily caps:** `MAX_SAVES_PER_DAY` (5,000) and `MAX_ACCOUNTS_PER_DAY` (2,000) bound what the
  whole Worker writes; past them, the game is told to try again later and keeps its save locally.
  Each is above what one address can send in a day at its rate limit (4,320 uploads, 1,440 new
  codes), so no one address can use them up for everyone; it takes several working together.
  Each code also has its own, `MAX_UPLOADS_PER_CODE_PER_DAY` (300): the game sends one every 2
  minutes at most.
- **The origin check isn't a lock.** CORS keeps other websites' pages from using the Worker in a
  visitor's browser, and a new code needs an allowed `Origin`, but anything but a browser can
  send any `Origin`, and Android's is every app's that uses `WebViewAssetLoader`. The code is
  what protects a save; the limits and caps are what bound a stranger.
- **Deleting:** Settings in the game deletes the code. Its saves are kept for a week, for the code
  to restore, then removed with it.
- **What a leaked code can do:** read the save, write over it, delete or restore it, until the
  player gets a new code. Each day's last version is kept for a week, so the most a flood of
  uploads can lose is that day's progress, and the owner can give a player an earlier version
  back (Backups, above).

## Budget

D1's daily writes and storage are per account, so on the Free plan this shares them with the run
collector. A save costs about 4 rows written (its row, the day's count, its code's count, and
the oldest version deleted), a new code about 3. The default caps come to about 26,000 rows a
day at most, which leaves the collector's share of the 100,000. A full save gzips to about 5 KB,
and none may pass 16 KB. A code keeps 6 versions, and up to 7 more for the days before, so 30 to
65 KB for a real one: around 8,000 to 16,000 codes in D1 Free's 500 MB a database. On Workers
Paid, these are far past what saves need; on Free, lower `KEEP_VERSIONS` or `KEEP_DAYS` before
raising the caps.

An hourly job removes codes deleted over a week ago, codes nobody's used (above), and the day
counts from before yesterday.
