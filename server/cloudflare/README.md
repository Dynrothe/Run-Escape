# Co-op relay on Cloudflare

The same relay as [`../coop-relay.mjs`](../coop-relay.mjs), as a Cloudflare Worker with Durable
Objects, so each room runs near its host instead of on one server wherever that is. It's an
alternative to hosting the Node relay, not a replacement: the game works with either, and only
`VITE_COOP_URL` says which.

## How it works

- **The lobby** (`src/lobby.mjs`) is one Durable Object for the whole relay. Every player connects
  to it first, at `/coop`, for their name, the open rooms list, and making or joining a room. It
  hibernates between messages, so players sitting in menus cost next to nothing, and its pings are
  answered without waking it.
- **Each room** (`src/room.mjs`) is its own Durable Object, at `/coop/room/<code>`. Cloudflare
  starts one near the first request for it, which is the host making it, so a run's frames and
  inputs go through a relay close to the host rather than one fixed place.
- To make or join a room, the lobby checks the relay's limits and answers with a `goto`: the room's
  code and a one-time ticket, good for 30 seconds. The game opens the room's own connection with
  it and sends its `create` or `join` there. Everything said in a room (`me`, `start`, `up`, `down`
  and the rest) goes over that connection, and leaving the room closes it. The Node relay never
  sends `goto`, so the game works with either relay.
- The Worker (`src/index.mjs`) only routes: `/coop` to the lobby, `/coop/room/<code>` to that
  room, and a plain GET of `/coop` answers whether co-op's there, as the game asks. It sets each
  player's address from Cloudflare's `CF-Connecting-IP`, for the limits.
- A room tells the lobby it's there every 30 seconds; one that stops (its object restarted) drops
  off the list after 90. The rooms list is kept in the lobby's storage, so it survives the lobby
  hibernating.

## Setting it up

You need a Cloudflare account (free is fine to start: see Cost below) and Node 20 or newer. Nothing
else, and no domain: it runs at a `workers.dev` address.

1. **Install and log in.** From the repository:

    ```sh
    cd server/cloudflare
    npm install
    npx wrangler login
    ```

    `login` opens the browser to let Wrangler use your Cloudflare account.

2. **Try it locally (optional).**

    ```sh
    npx wrangler dev --port 8787
    ```

    and in another terminal, from the repository's root:

    ```sh
    VITE_COOP_URL=ws://127.0.0.1:8787/coop npm start
    ```

    Open the game in two windows (one private), make a room in one and join it from the other.
    Add `--var MULTIPLAYER_ANY_MAP:on` to `wrangler dev` to let a fresh save join any map.

3. **Deploy.**

    ```sh
    npx wrangler deploy
    ```

    The first time, Cloudflare may ask you to pick a `workers.dev` subdomain (the deploy prints a
    link to the dashboard page for it). It prints the relay's address when it's done:
    `https://run-escape-coop.<your-subdomain>.workers.dev`. A new subdomain can take a few minutes
    to resolve. Check it with:

    ```sh
    curl https://run-escape-coop.<your-subdomain>.workers.dev/coop
    # {"coop":true,"players":0,"rooms":0,"full":false}
    npm run check -- wss://run-escape-coop.<your-subdomain>.workers.dev/coop
    ```

    `check` plays a host and a guest through it (an invite-only room, so nobody sees it): making
    and joining a room, starting, frames and inputs both ways, leaving and disbanding. It ends with
    `all good` and the round trip times from where you are. It works on `wrangler dev` too.

4. **Point the game at it.** Build with the relay's address, `wss://` and `/coop` on the end:

    ```sh
    VITE_COOP_URL=wss://run-escape-coop.<your-subdomain>.workers.dev/coop npm run build
    ```

    and deploy the build as usual. Whatever serves the game no longer needs a relay of its own
    (`npm run serve:singleplayer`, or drop the `/coop` proxy).

5. **The desktop app.** Set the `COOP_URL` repository variable (Settings, Secrets and variables,
   Actions) to the same `wss://…/coop` address, and the release workflow builds it into the game and
   the launcher (see Desktop in `docs/DEVELOPMENT.md`). As with any change to `COOP_URL`, players
   only get it in a new launcher download.

**Updating it** after changing anything in `server/cloudflare/` is `npx wrangler deploy` again.
Compatible relay updates can recover existing runs as described below.

## Recovery and compatibility

Cloudflare can reset a room and close its WebSockets during runtime updates or relay deployments.
For a run started with recovery version 1 on **every** client, a disconnect pauses the party for
up to **60 seconds**. The deadline includes reconnecting and replaying missed frames, and does not
restart on another connection attempt or object reset. A silent connection is retried after six
seconds without a room message; pings every two seconds detect this without waiting for TCP.

The room stores its roster, seat tokens, original build, run ID, protocol and recovery deadline.
Create/join/start/leave/kick/end and recovery transitions are saved before acknowledgement;
cosmetic updates remain coalesced. It stores no simulation snapshots and writes no game frames.
Tokens are bearer credentials kept in room storage and the open tab, sent only to their owner.
Use `wss://` outside local development and do not log resume URLs, which contain those tokens.

On recovery, the host's **open tab** supplies missed events in acknowledged chunks. Each chunk is
at most 8 KiB of JSON text; the relay caps replay traffic at 64 KiB/s with a 128 KiB burst budget
(conservatively counting UTF-16 bytes). Host history is limited to 3,000 frames (60 simulation
seconds) and 2 MiB of serialized text. All members must report the same frame and state hash before
play resumes. Unacknowledged guest actions are retried with sequence numbers so they apply once.
Loading/choice timers exclude the pause, and the simulation does not fast-forward the outage.

This covers relay restarts and temporary connection loss, **not page reloads, closing the host's
tab, host migration, or restoring a game from storage**. Missing history, different hashes, a
player leaving during recovery, or the deadline expiring ends the run through the existing early
results flow. A brief visible pause is expected; this is not a guarantee of seamless recovery.

Compatibility:

- Older Cloudflare clients and mixed parties keep the original 10-second reconnect attempt and
  15-second seat hold, without coordinated recovery. Updated clients pace the legacy message
  backlog and reconcile departures missed while disconnected; they keep the legacy 20-second
  frame resend path. Old parties are not upgraded in the middle of a run.
- Deploy this relay and the updated frontend to enable the new behavior for newly started
  capable parties. The first deployment cannot protect runs started on older code retroactively.
- Resume checks the seat token, run ID, protocol, and the **run's original build**, not the latest
  frontend deployment. Tabs running that original build can recover after a frontend update.
  Reloading into a different build cannot take over a live run. Bump the recovery protocol when
  changing its meaning; keep support for active protocols when rolling out compatible updates.
- The standalone Node relay is unchanged. These Cloudflare fixes do not install Node PR #69's
  filesystem recovery, and the client retains the existing Node connection behavior.

From the repository root, `npm test -- server/cloudflare/recovery.test.ts
src/game/client/coop/CoopLobbyRooms.test.ts src/game/client/coop/CoopRun.test.ts` checks persistence,
deadlines, compatibility, bounded replay, and lockstep/action recovery using fake sockets and
storage. It does not run the Cloudflare runtime. `npm run check` from this directory still checks
the legacy wire protocol. For a runtime smoke check, start `wrangler dev` and two updated game
tabs, start a run, and save a file under `src/`: both tabs should pause, then resume together. Try
a second reload while paused and a stop longer than 60 seconds; the deadline must not extend.
Repeat with a guest reconnecting before the host, and confirm that a frontend redeploy alone
does not invalidate the still-open original tabs.

**Settings** are in `wrangler.toml`: `MULTIPLAYER_ANY_MAP = "on"` lets players into rooms on maps
they haven't unlocked, as on the Node relay. The other limits are at the top of `src/shared.mjs`,
the same numbers as `coop-relay.mjs`.

**Taking it down**: `npx wrangler delete run-escape-coop`.

## Cost

Cloudflare bills Durable Objects by requests and by how long they're awake, not by bandwidth.
Incoming WebSocket messages count as one request for every 20, and outgoing ones are free. A room is
billed for every second it's open (at 128 MB), whether or not anything's happening, and the lobby
only for the moments it's handling something.

Measured on a deployed relay, a two-player run sends a room about 29 messages a second (the host's
frames, about 25, and the guest's inputs). Each guest more adds only their own inputs, so a room of
four is around 37 a second. That works out to, for each hour a room is open:

| Party    | Requests | Duration  |
| -------- | -------- | --------- |
| 2 people | ~5,300   | ~450 GB-s |
| 4 people | ~6,700   | ~450 GB-s |

- **Free plan**: 100,000 requests and 13,000 GB-s a day, about 15 to 19 hours of rooms a day. Past
  a limit, co-op fails until the next day, so it's for testing rather than for players.
- **Workers Paid ($5 a month)**: 1 million requests and 400,000 GB-s a month included, then
  $0.15 a million requests and $12.50 a million GB-s. That's under a cent for each hour a room of
  four is open, so about $6.50 a month for 1,000 room-hours, and about $70 for 10,000.

Check [Cloudflare's pricing](https://developers.cloudflare.com/durable-objects/platform/pricing)
for the current numbers. Usage is under Workers & Pages, `run-escape-coop`, Metrics, in the
dashboard.

**Against abuse.** Workers Paid has no spending cap, so the relay keeps what one connection can cost
bounded: a room connection that hasn't made or joined its room within 10 seconds is closed (an open
socket keeps a room billed), cosmetic room changes save at most once a second, lifecycle changes
save immediately, and rooms are capped per address and in all, as on the Node relay. Before
pointing a paid account at players, also:

- set a billing notification (Manage account, Notifications), and
- add a rate limiting rule (Security, WAF) on `/coop/room/` for each IP, about 60 requests a
  minute, so room URLs can't be hammered before they reach a Durable Object. Don't go much lower:
  reconnecting counts against it, and one dropped connection can take 7 tries in its 10 seconds.

## Differences from the Node relay

- Player names are unique among players connected to the lobby, and a name picked with New name in
  a room is unique in that room.
- Connections per address are counted at the lobby only. Cloudflare's own protection sits in front
  of everything.
- The relay's total-connection limit (800 on the Node relay, for a server's open files) doesn't
  apply.
