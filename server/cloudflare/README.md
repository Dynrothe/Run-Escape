# Co-op relay on Cloudflare

The same relay as [`../coop-relay.mjs`](../coop-relay.mjs), as a Cloudflare Worker with Durable
Objects, so each room runs near its host instead of on one server wherever that is. It's an
alternative to hosting the Node relay, not a replacement: the game works with either, and only
`VITE_COOP_URL` says which.

## How it works

- **The lobby** (`src/lobby.mjs`) is one Durable Object for the whole relay. Every player connects
  to it first, at `/coop`, for their name, the open rooms list, and making or joining a room. It
  hibernates between messages, so players sitting in menus cost next to nothing, and its pings are
  answered without waking it. It sends the open rooms to everyone looking at them when they change,
  so the game doesn't ask every few seconds, and closes a connection that's only asked for the
  same page for 10 minutes (an older game's, left open on the list). Pings never reach it, so it
  can't close a connection that only pings: the game closes its own after 9 minutes on the list
  with nothing done (`LOBBY_IDLE_MS` in `CoopLobby.ts`).
- **Each room** (`src/room.mjs`) is its own Durable Object, at `/coop/room/<code>`. Cloudflare
  starts one near the first request for it, which is the host making it, so a run's frames and
  inputs go through a relay close to the host rather than one fixed place.
- **Rooms hibernate too.** Their connections use Cloudflare's hibernation API, so a room is billed
  only while it's handling a message, not for every second it's open. A pending `setTimeout` or
  `setInterval` would keep it billed throughout, so everything a room waits for (the 10 seconds to
  make or join it, a dropped player's 15, the save and update throttles, the heartbeat) goes
  through its one alarm, with `later()`. After 10 seconds with nothing to do (a room sitting on
  its menu, never mid-run), Cloudflare can take it out of memory and keep its connections open.
  The next message or alarm makes it again, from its storage and what each socket carries
  (`remember()`): who it's for, the room's code, and when the next heartbeat's due, so being made
  again neither puts the heartbeat off nor sends an extra one. A dropped player's time away is
  saved, so it doesn't start again each time the room's made. The heartbeat saves when the room
  was last used, which a run's messages don't, or a room made again after a restart would look
  idle since its run started. A connection the room closes is forgotten first, since Cloudflare
  lists it until the other end answers. Pings are answered without waking it, so they're outside
  a connection's rate limit.
- To make or join a room, the lobby checks the relay's limits and answers with a `goto`: the room's
  code and a one-time ticket, good for 30 seconds. The game opens the room's own connection with
  it and sends its `create` or `join` there. Everything said in a room (`me`, `start`, `up`, `down`
  and the rest) goes over that connection, and leaving the room closes it. The Node relay never
  sends `goto`, so the game works with either relay.
- The Worker (`src/index.mjs`) only routes: `/coop` to the lobby, `/coop/room/<code>` to that room,
  and a plain GET of `/coop` answers whether co-op's there, as the game asks. It sets each player's
  address from Cloudflare's `CF-Connecting-IP`, for the limits, and their country from
  `request.cf.country`, for their flag in the rooms list and the party (unless they've hidden it and
  don't host an open room).
- A room tells the lobby it's there every 60 seconds, and when something the list shows changes
  (not players' loadouts or ready). It goes off the list when it ends, when someone tries to join it
  and it's gone, or once it's said nothing for 180 seconds while the lobby's awake. Waking from
  hibernation forgets when each room last spoke, so the lobby also stores that, every 30 minutes at
  most (`SEEN_SAVE_MS`): a room that ended without the lobby hearing goes within about half an hour
  of that, however often the lobby wakes, and invite-only ones too, which nobody can try to join
  from the list. A room asked for but never made (a second click of Make) goes 60 seconds after it
  was asked for. The rooms list is kept in the lobby's storage, so it survives the lobby
  hibernating.
- The lobby stops sending a player the list when they make or join a room, and starts again when
  they ask for it, which the game does whenever it's back on the list: out of a room, or turned
  away from one.
- A plain GET of `/coop` is answered by the Worker, without the lobby: it's a billed request to the
  lobby for every game that loads otherwise. So it says co-op's there even if the lobby's broken
  (a bad binding, an error in its constructor), and the game shows Multiplayer anyway. `bun run
check` tests the lobby itself.

## Setting it up

You need a Cloudflare account (free is fine to start: see Cost below), Bun to install Wrangler, and
Node 22 or newer, which Wrangler needs. Nothing else, and no domain: it runs at a `workers.dev`
address.

1. **Install and log in.** From the repository:

    ```sh
    cd server/cloudflare
    bun install --frozen-lockfile
    bun run wrangler login
    ```

    `login` opens the browser to let Wrangler use your Cloudflare account.

2. **Try it locally (optional).**

    ```sh
    bun run wrangler dev --port 8787
    ```

    and in another terminal, from the repository's root:

    ```sh
    VITE_COOP_URL=ws://127.0.0.1:8787/coop bun run start
    ```

    Open the game in two windows (one private), make a room in one and join it from the other.
    Add `--var MULTIPLAYER_ANY_MAP:on` to `wrangler dev` to let a fresh save join any map.

3. **Deploy.**

    ```sh
    bun run wrangler deploy
    ```

    The first time, Cloudflare may ask you to pick a `workers.dev` subdomain (the deploy prints a
    link to the dashboard page for it). It prints the relay's address when it's done:
    `https://run-escape-coop.<your-subdomain>.workers.dev`. A new subdomain can take a few minutes
    to resolve. Check it with:

    ```sh
    curl https://run-escape-coop.<your-subdomain>.workers.dev/coop
    # {"coop":true}
    bun run check wss://run-escape-coop.<your-subdomain>.workers.dev/coop
    ```

    `check` plays a host and a guest through it (an invite-only room, so nobody sees it): making
    and joining a room, starting, frames and inputs both ways, leaving and disbanding. It ends with
    `all good` and the round trip times from where you are. It works on `wrangler dev` too.

4. **Point the game at it.** Build with the relay's address, `wss://` and `/coop` on the end:

    ```sh
    VITE_COOP_URL=wss://run-escape-coop.<your-subdomain>.workers.dev/coop bun run build
    ```

    and deploy the build as usual. Whatever serves the game no longer needs a relay of its own
    (`bun run serve:singleplayer`, or drop the `/coop` proxy).

5. **The desktop app.** Set the `COOP_URL` repository variable (Settings, Secrets and variables,
   Actions) to the same `wss://…/coop` address, and the release workflow builds it into the game and
   the launcher (see Desktop in `docs/DEVELOPMENT.md`). As with any change to `COOP_URL`, players
   only get it in a new launcher download.

**Updating it** after changing anything in `server/cloudflare/` is `bun run wrangler deploy` again.
Rooms carry on through a deploy, as through Cloudflare's own restarts (see below).

**Restarts.** Cloudflare restarts Workers and Durable Objects now and then, on any plan: runtime
updates, and moving objects between machines. Each one drops every connection to the object and
what it had in memory, often more than once an hour. So:

- A room keeps itself in storage, and gives each player a token when they make or join it.
  Someone joining or leaving, and a run starting or ending, are saved before anyone hears of
  them, so a restart straight after doesn't bring back the room as it was.
- A player whose connection drops keeps their place for 15 seconds. Their game reconnects to
  `coop/room/<code>?resume=<token>` for up to 10 seconds, and the run carries on. Someone who
  doesn't come back is let go, as if they'd left.
- Frames the host sent meanwhile come again: each host message says where the one before it
  ended, and a guest that sees a gap asks the host for what it missed (`resend` in `protocol.ts`,
  kept for 20 seconds in `CoopRun`, and answered once a second at most). An item a guest used
  just before the drop is sent again, and the host takes it once.
- The lobby's connection dropping doesn't touch a room: the game makes it again after.

`bun run check` tests coming back, against a running relay. `room.test.ts` runs a room under
Node, with `test/durable-object.mjs` in place of `cloudflare:workers` (see `vite.config.ts`). To see a restart for yourself under `wrangler dev`, save any
file in `src/` during a run: wrangler reloads, which drops everything as Cloudflare does.

**Closing connections.** When a player's game closes a connection (leaving for another room,
closing the co-op menu, closing the tab), the room or lobby has to answer it: at `wrangler.toml`'s
compatibility date Cloudflare doesn't do that by itself. Both call `answerClose` in
`src/shared.mjs`. A close that isn't answered leaves the player's browser waiting until it gives up
and drops the connection, so it ends abnormally instead of cleanly. A connection that's cut (a
phone locking, a lost signal) has no close to answer, and still ends abnormally.

**Settings** are in `wrangler.toml`: `MULTIPLAYER_ANY_MAP = "on"` lets players into rooms on maps
they haven't unlocked, as on the Node relay. `MULTIPLAYER_RUN_CHECKS = "end"` ends a run whose host
the run checks (`../coop-checks.mjs`) catch; with `"log"` they're only logged. The other limits
are at the top of `src/shared.mjs`, the same numbers as `coop-relay.mjs`.

**The run checks' log**: an object for each entry, with `event: "coop_run_check"` and its `kind`,
which `bun run wrangler tail` shows as it happens. To keep them (for 7 days, searchable by field in
the dashboard), turn on Workers Logs without its log of every invocation:

```toml
[observability.logs]
enabled = true
invocation_logs = false
```

Cloudflare's docs don't say whether that also leaves out each WebSocket message to a room, which
would be a log event apiece and far past what the plan includes. After turning it on, watch the
Worker's log events in the dashboard for a while before leaving it on.

**Taking it down**: `bun run wrangler delete run-escape-coop`.

## Cost

For gameplay statistics from solo games and either relay, see the separate
[Cloudflare D1 collector](../analytics/README.md). It does not add requests to the lobby or rooms.

Cloudflare bills Durable Objects by requests and by how long they're awake, not by bandwidth.
Incoming WebSocket messages count as one request for every 20, and outgoing ones are free. Each
call from a room to the lobby (`redeem`, `roomUpdate`, `roomGone`) and each connection is a whole
request. The dashboard's Metrics count every message as one, so they show far more than is billed.
Rooms and the lobby are billed (at 128 MB) only for the moments they're handling something:
a message, a connection or an alarm. Mid-run, that's a sliver of each second.

What the lobby gets: each connected player's pings (`PING_INTERVAL_MS` in `CoopLobby.ts`, answered
without waking it), each room's heartbeat (`ROOM_HEARTBEAT_MS` in `room.mjs`) and its calls when
what the list shows changes, a storage write for each room now and then (`SEEN_SAVE_MS`), and a
message for each page of rooms someone looks at. A game from before the lists were sent asks for
its page every few seconds until it's closed.

Measured on a deployed relay, a two-player run sends a room about 29 messages a second (the host's
frames, about 25, and the guest's inputs). Each guest more adds only their own inputs, so a room of
four is around 37 a second. That's about 5,300 requests for each hour a two-player room is open,
and 6,700 for four. Before rooms hibernated, they were also billed 450 GB-s an hour (every second
at 128 MB), which was most of the bill. By Cloudflare's pricing, an idle object that can hibernate
isn't billed for duration, so a room's should now be only the time it spends handling messages,
leaving requests as most of the bill. That's still to be measured on a deployed relay: check the
dashboard (Durable Objects, Duration) after deploying, and after a change to how a room handles
messages. The estimates below assume it holds.

- **Free plan**: 100,000 requests and 13,000 GB-s a day, about 15 to 19 hours of rooms a day by
  requests. Past a limit, co-op fails until the next day, so it's for testing rather than for
  players.
- **Workers Paid ($5 a month)**: 1 million requests and 400,000 GB-s a month included, then
  $0.15 a million requests and $12.50 a million GB-s. That's about $1 a month more for every 1,000
  room-hours past the first 150 or so, so 100 players in rooms around the clock (about 20,000
  room-hours a month) would come to roughly $25.

Check [Cloudflare's pricing](https://developers.cloudflare.com/durable-objects/platform/pricing)
for the current numbers. Usage is under Workers & Pages, `run-escape-coop`, Metrics, in the
dashboard.

**Against abuse.** Workers Paid has no spending cap, so the relay keeps what one connection can cost
bounded: a room connection that hasn't made or joined its room within 10 seconds is closed (nothing
else would close it: the lobby forgets a room that never got made), a room's saved to storage at
most once a second however often its host changes settings (joins, leaves and a run starting or
ending are saved at once, and the heartbeat once a minute during a run), and rooms are capped per
address and in all, as on the Node relay. Pings are the exception: answered without waking the
lobby or a room, they never reach a connection's rate limit, and Cloudflare doesn't say whether
it counts them as requests (20 to one, like other messages), so a connection flooding pings may
be billed for as long as it's open. Before pointing a paid account at players, also:

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
- Players get flags for where they are wherever it runs. The Node relay only knows that behind
  Cloudflare (`PROXY=cloudflare`).
