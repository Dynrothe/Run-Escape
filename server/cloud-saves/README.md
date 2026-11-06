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
- **Backups.** `KEEP_VERSIONS` (6) are kept per code: the save and five before it. There's no
  restore in the game yet. To give a player an older one back, find their account by the code's
  hash and read the row, from `server/cloudflare`:

    ```sh
    bun run wrangler d1 execute DB --remote -c ../cloud-saves/wrangler.toml --command \
      "SELECT revision, summary, created_at FROM saves WHERE account_id = (SELECT id FROM accounts WHERE code_hash = '<sha256 of the code, no dashes, upper case>')"
    ```

## What it accepts

The Worker can't run the game's own save loading: `migrateSave` drops ids it doesn't know, so a
Worker left behind a release would strip new content out of saves. It checks the shape only, as
the run collector does: a JSON object of at most 64 KB, with a whole-number `version` and an
`x.y.z` `gameVersion`. It stores the text as it came (gzipped) and never migrates it; the game
migrates a save when it downloads it.

The summary it shows the game is read from the plain fields: `runs`, `victories`, `totalCoins`,
the maps with a victory, and `gameVersion`.

## Privacy and limits

- **Stored:** a random account id, the code's SHA-256, each save version with its summary, and
  when. No names, emails or IP addresses; the address is only used for rate limiting.
- **Lost codes can't be recovered**, as there's nothing else to know a player by. The game keeps
  its file export, and shows the code again in Settings on any device that has it.
- **Rate limits:** every request per address, new codes per address, and uploads per code.
- **Daily caps:** `MAX_SAVES_PER_DAY` and `MAX_ACCOUNTS_PER_DAY`. Past them, the game is told to
  try again later and keeps its save locally.
- **Deleting:** Settings in the game deletes the code. Its saves are kept for a week, for the code
  to restore, then removed with it.
- **What a leaked code can still do:** read the save, and write over it. The 6 versions and the
  upload rate limit mean an old version outlasts a minute of uploads, not a determined flood.

## Budget

D1's daily writes and storage are per account, so on the Free plan this shares them with the run
collector. A save costs about 3 rows written (its row, the day's count, and the oldest version
deleted), a new code about 3. The default caps come to under 20,000 rows a day, which leaves the
collector's share of the 100,000. A full save gzips to about 5 KB, so 6 versions are about 30 KB
per code: around 16,000 codes in D1 Free's 500 MB a database. On Workers Paid, these are far
past what saves need; lower `KEEP_VERSIONS` before raising the caps on Free.

An hourly job deletes the day counts from before yesterday.
