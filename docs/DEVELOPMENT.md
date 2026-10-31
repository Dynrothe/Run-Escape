# Developing Run Escape

How the code is laid out, the tools that come with it, and how to host a build. The
[README](../README.md) covers getting it running.

## Hosting

```
npm run build
npm run slim-cache
```

writes the game to `dist/`, with a slim copy of the cache in `dist/caches/`: only what the game
reads, about 26 MB instead of 227 MB. Put what's in `dist/` on a web server, at the site's root or
in a folder (asset paths are relative, so https://example.com/game/ works):

```
index.html
assets/
caches/caches.json
caches/osrs-241_2026-09-30-slim-<hash>/
```

`npm run slim-cache` loads everything the game loads (every model it bakes, an icon for every
item, each map's arena and the map squares around it) with the game's own loaders and keeps the
groups they read. Then it loads it all again from the slim copy and fails if anything is missing.
It takes a couple of minutes. Run it again after changing the content (a new enemy, item or map),
or the game stops on a "missing from the cache" error. The slim cache is named after what's in it,
so players' browsers fetch the new one and drop the old. `npm run preview` serves the build with
its slim cache, to try it before uploading. The full cache works too, if you'd rather host that.
The map viewer (`?viewer=1`) needs the full one.

The server has to send two headers with the page. The game shares the cache with its workers in
a SharedArrayBuffer, which browsers only allow on a cross-origin isolated page; without them the
game says so instead of loading:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

With nginx, in the game's `location` block:

```
add_header Cross-Origin-Opener-Policy same-origin always;
add_header Cross-Origin-Embedder-Policy require-corp always;
```

With Apache, in an `.htaccess` beside `index.html` (needs mod_headers):

```
Header set Cross-Origin-Opener-Policy "same-origin"
Header set Cross-Origin-Embedder-Policy "require-corp"
```

It needs HTTPS (or localhost) for the browser's cache storage, and a folder's address with its
trailing slash (`/game/`, not `/game`), or the relative paths point at the parent folder.

### Co-op relay

The simplest way to host everything: `npm run serve` (`node server/serve.mjs`, no packages) serves
`dist/` with the headers above on `PORT` (8080), and `npm run serve:multiplayer` (or
`MULTIPLAYER=on npm run serve`) runs the co-op relay in the same process. Multiplayer is off unless
it's turned on, and the game only offers it when a relay answers. Run `npm run build` first; with no
slim cache in `dist/caches` it serves the full one from `caches/`, so it also works for trying a
build locally (http://localhost:8080). Put something that does HTTPS in front of it, like Caddy
(`caddy reverse-proxy --from game.example.com --to localhost:8080`).

The relay is light. In a load test at the game's own rates (host frames 25 times a second, guests'
moves about 4), a room of four was about 5.3 KB/s of messages and 109 of them a second, around
12 KB/s on the wire with TCP's own overhead, or about 40 MB an hour. 100 rooms (400 players, and 50
more browsing the room list) took at most 13% of one core and 64 MB. A small VPS runs it easily;
serving the game itself (about 26 MB for each new player) is the bigger cost.

Co-op needs the relay in [server/coop-relay.mjs](../server/coop-relay.mjs): plain Node 20 with no
packages, so copy it with `server/names.mjs` (the name rules, which the game uses too) and
`server/client-ip.mjs` to the server and run it.

```
PORT=8787 node server/coop-relay.mjs
```

The game looks for it at `coop` beside the page (`wss://example.com/game/coop` for a game at
`/game/`), so proxy that path to it. With nginx:

```
location /game/coop {
    proxy_pass http://127.0.0.1:8787/coop;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
}
```

The relay limits each address (see below), so behind a proxy, where every player looks like the
proxy, tell it what's in front with `PROXY` (or `--proxy=` after `npm run serve:multiplayer --`):

| `PROXY`        | For                                                                            | Whose word it takes for a player's address                                                                                       |
| -------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| unset (`none`) | nothing in front, or a LAN                                                     | nobody's: the connection's own                                                                                                   |
| `local`        | Caddy, nginx or a container in front, on the same machine or a private network | that proxy's: the last address in its `X-Forwarded-For`, which it adds itself (Caddy does by default, nginx with the line above) |
| `cloudflare`   | Cloudflare in front, with or without a local proxy behind it                   | Cloudflare's `CF-Connecting-IP`, only from Cloudflare's own addresses (and a local proxy's, as `local`)                          |

Headers from anyone else are ignored, so they can't be made up to get round the limits. Behind a
proxy with `PROXY` unset, the relay says so once. `TRUSTED_PROXIES` (`"10.1.2.3,10.9.0.0/16"`)
adds proxies elsewhere, and `CLOUDFLARE_IPS` replaces the list of Cloudflare's addresses in
`server/client-ip.mjs` if it changes.

Its limits, at the top of `server/coop-relay.mjs`:

| What                          | Limit                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- |
| Rooms on the relay            | 2,000; past that, making one says they're all taken (and the menu shows it) |
| Connections from one address  | 16 (a household or LAN party behind one address)                            |
| Rooms hosted from one address | 4                                                                           |
| Rooms made from one address   | 10 a minute                                                                 |
| A room with nothing happening | closed after 30 minutes                                                     |
| A player's loadout            | 16 KB, or it's dropped                                                      |
| A message                     | 256 KB, and 400 a second from one connection                                |

Or build with `VITE_COOP_URL=wss://relay.example.com/coop npm run build` to point it anywhere
else. `npm run start:multiplayer` (and `npm run preview` with `MULTIPLAYER=on`) runs a relay of its
own at `/coop`.

## Code

```
src/game/
  content/  enemies, weapons, passives, items (gear, utility, caskets), armoury (what each piece
            of gear upgrades into), power-ups and thralls, characters, shop, maps
            (arena, spawn, difficulty) and their waves: plain data with cache ids; unlocks
            (what each map's tasks bring in); quests (what each asks for and pays)
    fun/    the fun maps (endless, random bosses) and their players: outfits, chat, shots
  core/     the game in plain TypeScript (no DOM), tested with vitest
    Sim.ts            fixed 20ms tick: movement, enemies, spawning, weapons, pickups, power-ups,
                      levels
    world/            ArenaGrid (collision + heights), Collision (circle vs tiles and walls),
                      FlowField (Dijkstra from the player, how hundreds of enemies find a way)
    lockstep.ts       co-op's frame events, applying them, and the check that copies agree
    fmath.ts          trigonometry that every browser works out the same, for co-op
    Upgrades.ts       level up choices
    Loot.ts           what's in a casket, the inventory
    save.ts           versioned save with migrations, shop, unlocks (maps, and the adventurers
                      and items earned by tasks), the gear found and the Armoury's upgrades,
                      quests (and the kills and caskets they count)
  client/   GameClient (run flow, camera, input), GameView (3D actors + 2D overlay),
            GameAssets (what gets baked), GameStore (state for the React UI)
    coop/     CoopLobby (the relay connection and the room), CoopRun (a run's lockstep, host or
              guest), protocol (the messages)
  render/   GameWebGLRenderer (the map viewer's renderer with the game's passes), CameraRig
  ui/       React screens and HUD, ChestModal (the casket opening), ItemIcon, CoopScreen (the
            rooms, the lobby, the party in a run)
server/     coop-relay.mjs: co-op's rooms, and passes each run's frames between its players
src/mapviewer/webgl/actor/   actor renderer: baked animation frames drawn anywhere in the world,
                             any number of them, one multi-draw per pass
src/mapviewer/worker/        RegionDataLoader (collision and heights for the whole arena in one
                             scene build), ItemIconLoader (inventory icons drawn like the client)
                             SoundLoader (sound effects synthesized off the main thread),
                             SpriteDataLoader (interface sprites, like hitsplats)
src/rs/audio/               the client's sound effect synth: instruments, envelopes, filters
src/rs/model/player/         player models from identity kits and worn items
```

Changes to the map viewer itself are small: the game subclasses its WebGL renderer, a few decoders
learned the rev 241 opcodes, and two bugs were fixed (floor collision missing on the edge of every
map square, and a resize during loading leaving the 3D view in a corner).

Combat sounds are picked by the server, not the cache, so the ids in `content/` come from the OSRS
Wiki's [list of in-game sound IDs](https://oldschool.runescape.wiki/w/List_of_in-game_sound_IDs).

### Scripts

All run from the repository root with `npx tsx`:

```
scripts/cache/validate-decoders.ts       decode every type the game uses; fails on new opcodes
scripts/cache/find-npcs.ts goblin        NPC ids, levels and idle/walk animations by name
scripts/cache/find-objs.ts "rune .*"     item ids, wear slots and worn models
scripts/cache/check-items.ts             every casket item's id is the item it's named after
scripts/cache/check-fun-outfits.ts       every item the fun maps' players wear is the one named, in its slot
scripts/cache/find-locs.ts multicannon   scenery ids
scripts/cache/find-npc-seqs.ts 655 1173  animations built on an NPC's skeleton
scripts/cache/classify-npc-seqs.ts 655 6182 6183 6184   tell attack and death animations apart
scripts/cache/dump-idk.ts                player body kits
scripts/cache/dump-config.ts 13 92       raw bytes of a config entry, for working out new opcodes
scripts/cache/sounds.ts wav out 2266     write sound effects to .wav (also validate, seqs, info)
scripts/cache/slim-cache.ts [out dir]    the slim cache for hosting (npm run slim-cache)
scripts/game/simulate-run.ts [character] [seeds]        a bot plays full runs, for balancing
                                                        (MAP=barrows for another map,
                                                        META=max ARMOURY=max for everything
                                                        bought; uses a collision snapshot per
                                                        map in caches/collision, built on the
                                                        first run)
scripts/dev/icon-test.ts 1321            draw an item icon as ASCII
```

Tests: `npm test`.

URL flags: `?room=ABCDE` joins a co-op room (the invite link), `?autostart=wizard` starts a run right away, `?stress=300` adds 300 goblins, `?viewer=1`
opens the original map viewer (loaded only then), `?bgtick` (dev only) keeps the game running in a
browser tab that isn't being painted, `?notice` shows the notice even after it's been closed. F3
shows collision and stats.

### Co-op

Co-op runs in lockstep. Every player's browser runs the same `Sim`, built from the same seed and
everyone's loadout (`GameStart`), and only what the players do goes over the network. The host
numbers the ticks (frames) and sends, every frame or two, what happened at each: who changed what
they're pressing (as whole numbers, so every copy moves the same) and who chose what. Guests step
only as far as the host has sent, sending their own input to the host to go in a frame. Nothing
waits on a slow guest; they see the run a little behind. Every 50 frames the host sends a hash of
its run, and a guest whose run differs says so. The host waits for everyone's map to load before
the first frame, and a host whose tab is hidden keeps stepping off a worker's timer.

For that every copy has to agree to the bit. The sim only uses its seeded `Rng`, and its
trigonometry goes through `fm` in `core/fmath.ts`: the browser's own `Math` on your own (so solo
runs are as they were), and in co-op versions built from `+ - * /` and `sqrt`, which every engine
rounds the same. Use `fm.sin`, `fm.cos`, `fm.atan2`, `fm.hypot`, `fm.acos` and `fm.pow` in
`core/`, never `Math`'s (`Math.sqrt`, `floor`, `round` and the like are fine).

The sim's player state is split into `Hero`s, one a player. `sim.player`, `sim.weapons`,
`sim.stats` and the rest are the current hero's: whichever one the sim is working on (an enemy's
target, a projectile's owner, whoever's picking something up), and between ticks the one this
browser plays (`focus`). Something that belongs to a hero (a projectile, a thrall, burning ground,
venom) remembers whose with `hero`, and the sim works as them when it acts. Co-op actions go
through `sim.as(hero, ...)`. Events that are a hero's own (a hit taken, a pickup, a casket) carry
`hero` in co-op, so the client shows its own and leaves the rest. A solo run has one hero and
plays exactly as before.

Rooms only take players who've unlocked their map (and its endless, for an endless room), and the
host can only pick maps everyone in the room has, so nobody skips ahead: someone without it is told
"You need Barrows unlocked to join this room", and the open list shows that room as locked to them.
Each player's game sends the maps it has (`unlocks`), checked by the relay on joining, on the host
changing the map or endless, and at the start. `MULTIPLAYER_ANY_MAP=on` (or `--any-map`) lets anyone
into any room instead, and a win then opens that map for a player who hadn't got there. With no
accounts, a player's maps are their game's word: this keeps fair players fair rather than stopping
a cheat.

A name's only one player's at a time: making or joining a room with a name someone in a room already
has is turned down, and it's free again once they've gone. There are no accounts, so nothing keeps a
name for anyone. A game that's given a map or adventurer it hasn't got (from a newer or made-up game)
leaves the room rather than playing a run it can't, and other players' shop bonuses are kept within
what the shop sells.

Player names, which the open rooms list shows anyone, are lowercase a-z only and checked against a
banned list (with digits and symbols standing in for letters read as letters) in
`server/names.mjs`. The game cleans them as they're typed and won't make or join a room with a
banned one, and the relay cleans every name it's sent, giving a banned one the default.

`server/coop-relay.mjs` holds the rooms (code, open or invite only, host, map, members and their
ready state and loadout) and forwards `up` messages from guests to the host and `down` messages
from the host to everyone else. The host leaving a run ends it for everyone; in the lobby the
room goes to the next player. How much bigger the crowd gets for each player is in
`content/coop.ts`. The balance bot plays solo runs only.

The open rooms list comes a page at a time (8 rooms, the fullest first, then the ones waiting
longest), worked out once after each change rather than for every request; the menu asks for its
page every 5 seconds, and again when joining fails (a room that filled up or started meanwhile).

To try it locally, `npm run start:multiplayer` and open the game in two windows (one private, for a
save of its own), make a room in one and join it from the other.

### Notice

Whatever's written in [public/notice.md](../public/notice.md) pops up on the title screen until the
player closes it, once: a `# Title`, then paragraphs and `- ` lists, with `**bold**`. Changing it
shows it to everyone again; with nothing but its comment there's no notice. It's fetched when the
game loads rather than built in, so on a hosted game `notice.md` can be edited on the server.

### Versions

The version is `package.json`'s, shown in the title screen's corner, and [CHANGELOG.md](../CHANGELOG.md)
says what changed in each one; the title screen shows it too. Note changes under Unreleased as
they're made. For a release, `npm version minor --no-git-tag-version` (or `patch` for fixes alone),
then turn Unreleased into the new version's heading with the date. A test checks the two agree.
