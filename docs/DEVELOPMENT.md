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
    BulletPool.ts     a boss's bullets, in flat arrays: hundreds at once, no allocation in the tick
    world/            ArenaGrid (collision + heights), Collision (circle vs tiles and walls),
                      FlowField (Dijkstra from the player, how hundreds of enemies find a way)
    Upgrades.ts       level up choices
    Loot.ts           what's in a casket, the inventory
    save.ts           versioned save with migrations, shop, unlocks (maps, and the adventurers
                      and items earned by tasks), the gear found and the Armoury's upgrades,
                      quests (and the kills and caskets they count)
  scaperune/ maps that aren't in OSRS: a seeded generator, recipes, prefabs cut from the real world.
            Dev-only so far, with a temporary Map generator button on the dev server's title
            screen. Its CLAUDE.md is the guide to making one
  client/   GameClient (run flow, camera, input), GameView (3D actors + 2D overlay),
            BossFightView (a phased boss's ground marks, bullets and entrance),
            GameAssets (what gets baked), GameStore (state for the React UI)
  render/   GameWebGLRenderer (the map viewer's renderer with the game's passes), CameraRig
  ui/       React screens and HUD, ChestModal (the casket opening), ItemIcon
  client/GameTouch.ts, ui/TouchControls.tsx, ui/Mobile.css   touch screens (see Touch screens)
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
learned the rev 241 opcodes, the map loader can take extra map squares as plain data
(`src/rs/map/CustomMapFileLoader.ts`, from ScapeRune), and two bugs were fixed (floor collision missing on the edge of every
map square, and a resize during loading leaving the 3D view in a corner). `?viewer=1` still loads
map squares its own way (see below).

### Boss fights as data

A boss's fight is in its `BossDef` and `BossAttackDef`, with no boss named in `Sim.ts`. The Nightmare
(`content/nightmare.ts`) is built from these, and any boss can use them:

- `BossDef.intro`: the player's safe, the screen goes dark, what's left runs for the map's edge and
  is gone, and the boss rises. `alone` stops the waves until it's dead.
- `BossDef.phases`: a shield, then totems in the corners, then a blast for a share of its hitpoints.
  Only the shield takes hits, in `damageEnemy`. Totems are enemies that can't die: their hitpoints
  are the charge they still need, and `shieldEnd` is `Infinity` while they can't be hit, which keeps
  weapons off them.
- Attack kinds `pattern` (rings, spirals, aimed spreads), `ground` (marks that land, or stay armed),
  `quarters`, `surge` and `mark`, and `phases` on an attack for when it's used.
- `Sim.bossArena` is the square all this goes by: `MapDef.bossArena`, or the whole map. Nothing's
  sized by hand, so she fights on any square.

The curse is applied to the input in `stepPlayer`, so keys and the touch stick go the same way.

### What gets drawn

A map square is 64 tiles a side and the camera sees a small part of one, so the game's squares are
baked into cells of 8 tiles (32 without `WEBGL_multi_draw`, where each one is a real draw call).
`CullGrid` gives each cell a bounding box of what's really in it: terrain goes in by tile, merged
models by triangle, and instanced models and animated locs by where they stand. Anything wider
than a cell gets a box of its own, so it can't stretch its cell's box over the rest. A frame tests
the boxes against the camera's frustum and leaves the rest out of the multi draw with a count of
0: `gl_DrawID` picks a draw's data, so the list has to stay in order. This holds at any camera
angle, because a box holds everything in it, whatever's looking at it. `SdMapLoaderInput.cullCellSize`
turns it on; those squares have no LOD or interact draws, which the viewer needs and the game
doesn't. The boxes follow what `main.vert.glsl` does to a vertex (`CullGrid.addInstance`), so a change
to where the shader puts things needs one there too. `render-stats.ts --cull=8` checks it.

Actors are culled as spheres in `ActorRenderer.draw`, by `ActorModel.reach`: the furthest any vertex
gets from the model's origin in any frame of any animation, so bosses' big swings count.

The game has no hover menus, so its frames have no interact buffer, and with no multisampling
they're drawn straight into the texture the screen quad reads.

Enemies are baked when a run starts, for that map (`getMapEnemies`, `GameAssets.loadEnemies`), in
place of the last map's: they're most of the actors' memory, and a map uses few of them. It goes by
the enemy ids it finds in the map's waves, events and bosses, and in those enemies, so a new way for
an enemy to bring on another needs nothing added. An enemy that isn't baked anyway (the console's
`spawnBoss`) gets baked when it's first drawn, and shows up a moment later.

`window.frameProbe` (dev only) counts what a frame sends to the GPU, at the GL calls:
`await frameProbe.sample(60)` gives triangles, draws and CPU time, split into world and actors.

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
scripts/scaperune/find-prefabs.ts 50 50  a map square as text, to pick prefabs and survey ground
scripts/scaperune/preview.ts out.png seed=7 biome=snow    a ScapeRune map from above, and its reachability
scripts/scaperune/relief.ts out.png preset=Alpine        a generated map's height, in seconds, without the cache
scripts/scaperune/check-maps.ts          generated maps: every open tile reaches the spawn, roads off bridges, slopes,
                                         road grades, plots, what the camera can see (ONLY=regex for some of them)
scripts/scaperune/check-prefabs.ts       every prefab, in every rotation: its whole floor, a way out
scripts/scaperune/check-palette.ts       the palette map reads all that generated maps read
scripts/game/simulate-run.ts [character] [seeds]        a bot plays full runs, for balancing
                                                        (MAP=barrows for another map,
                                                        META=max ARMOURY=max for everything
                                                        bought; uses a collision snapshot per
                                                        map in caches/collision, built on the
                                                        first run)
scripts/dev/icon-test.ts 1321            draw an item icon as ASCII
scripts/dev/render-stats.ts lumbridge    what a map costs to draw, without a browser: triangles,
                                         draw ranges, bytes (--cull=8 checks the culling boxes and
                                         counts what spots draw, --bake is memory per map's actors)
```

Tests: `npm test`.

URL flags: `?autostart=wizard` starts a run right away, `?stress=300` adds 300 goblins, `?viewer=1`
opens the original map viewer (loaded only then), `?bgtick` (dev only) keeps the game running in a
browser tab that isn't being painted, `?notice` shows the notice even after it's been closed. F3
shows collision and stats.

### Touch screens

Everything touch only hangs off `pointer: coarse`, so a mouse and keyboard never see it:
`isCoarsePointer` in code, a media query in `Mobile.css`.

- `client/GameTouch.ts` is the stick, with no DOM. `GameInput.getMoveVector` reads it when no key
  is down, so the sim gets the same input a keyboard gives: length 0 or 1.
- `ui/TouchControls.tsx` feeds it pointer events. The whole screen is the stick, with the buttons
  on top. Its buttons act on `pointerdown`, because a browser won't fire `click` for a second finger
  while the thumb's down.
- `ui/Mobile.css` lays the screens out again for a phone held sideways (`max-height: 520px`). The
  UI's zoom never goes below 1, as the pixel fonts don't survive it, so a new screen needs rules
  there too. Check it at 844x390 and 667x375. It's imported last, so it wins over the other CSS.
- A touch screen also gets a pixel ratio capped at 1.5, 2 workers instead of 4, and a closer camera
  on a phone.

To test it, Playwright's `isMobile` and `hasTouch` turn on `pointer: coarse`, and CDP's
`Input.dispatchTouchEvent` sends real multi-touch. Mouse clicks don't test any of this.

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
