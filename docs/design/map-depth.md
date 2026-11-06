# Map depth: how deep or high a map can go

How much height a Run Escape map takes, measured 2026-11-06 for Dynny's question: "Currently the maps have been mostly
on one level except for the saradomin boss. How deep or high can we go while it still looks good?" Part 1 is height
you play on; part 2 is height as scenery only, round the arena, which is what the question was about.

Two dev maps go with it (Dev tab, dev server only): `scaperune_depth` (`src/game/scaperune/maps/depthTest.ts`, slopes,
cliffs, platforms and pits you can walk) and `scaperune_backdrop` (`src/game/scaperune/maps/backdropTest.ts`, scenery
round six pads). The short rules are in the Height section of `src/game/scaperune/CLAUDE.md`; this is the evidence and
the numbers behind them. Everything was judged in headless Chrome on a software renderer, desktop 1280x720 and phone
844x390, not on a real phone.

## In short

- **Scenery depth:** about 16 tiles (255) is all it needs, as long as a face points at the camera (a drop to the south,
  or a north chasm with a far wall back up). Deeper looks no deeper.
- **Scenery height:** north, about 10 tiles show on desktop and 8 on phone; east and west, under about 6 tiles; south,
  under about 2, or let the ground fall away.
- **Height you play on:** up to 65 (4 tiles) up or down reads well; 30 (one storey) anywhere; 125 (8 tiles) is
  scenery only.
- Height itself costs nothing on a phone (2 triangles a tile); dressing the faces is the cost.

Units: height units as maps store them, 8 scene units each, **16 a tile**. OSRS storey = 30 (1.9 tiles).
Hallowed Sepulchre level / Owl's Court drop = 65 (4 tiles).

## Part 1: height you play on

### The answer

- **Up to 65 (4 tiles, about 2 storeys) near walkable ground: looks good up or down, desktop and phone.** Owl's Court proves it.
- **30 (one storey) works anywhere**, even facing north (hides under 0.7 tile).
- **Drops facing north:** over 44 on walkable ground, keep the ground at the foot blocked for 1.5 tiles (65) or
  3 tiles (125), or the player and enemies there are hidden.
- **125 (8 tiles): scenery only** (a pit you look into, a backdrop to the north). Don't fight across it: things on the
  other level are 0.7x size, pushed off screen, or hidden.
- **Hard limit 255 (16 tiles)** on a ScapeRune map (one byte a corner). Only a level 1 deck stacks more.
- **Faces:** bare terrain faces stretch. Over about 30, dress them (Sepulchre walls over a black void, rock kits), or
  spread them over 2 to 4 tiles as the map guide says.

### 1. How height works today

The sim (`core/`) never reads a height. Height only affects drawing.

| Part                             | What it does with height                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map format                       | 1 byte a corner, 0-255 (16 tiles). Levels 1-3 stack on the level below.                                                                               |
| Planes 0-3                       | One plane is played and drawn (`MapDef.plane`; GWD uses 2). `setPlane` reloads every map square. Others show only as bridges and `TILE_SHOWN` tops.   |
| Collision                        | That plane's, with bridges folded in (deck walked, ground under it not). No overlapping walkways.                                                     |
| Cutting cache places             | `cutPrefab({ plane })` drops that level and above onto level 0; stairs go nowhere.                                                                    |
| Pathing                          | Collision only. Steep tiles are blocked by the map (generator: `walkSlope` 12 a tile). Ramps = walkable tiles.                                        |
| Shots, reach, line of sight, AoE | 2D. Shots ignore world walls and cliffs (only floor pillars and `features.pillars` stop them).                                                        |
| Spawns                           | Any open, reachable tile at 2D distance 19-24, so ledges and pits too if connected.                                                                   |
| Fliers                           | `FlightGrid` stops them only at blocked clumps 4 tiles or wider, so they cross thinner cliff faces.                                                   |
| Drawing                          | Actors at the ground under them. Projectiles at ground +0.9 tile, so they jump at cliff edges. Telegraphs follow the ground and draw over everything. |
| Floor system ledges              | Fake lift (`liftAt`) + `addLedge` walls; demos 0.5/1 up, 0.4 down.                                                                                    |
| Owl's Court                      | All level 0: walkways 130, lower walkway 65 (blocked, only to look at), black void between, Sepulchre walls hung under edges.                         |

### 2. Camera and visibility

Pitch -400 = 70.3 deg down, yaw always north, 45 deg vertical FOV. Desktop 18 tiles (wheel 10-44); phone (coarse pointer,
height <= 520) 15 tiles, no zoom. Targets the player's ground -0.6 tile; on ScapeRune maps it eases over 110 ms.

|                                  | Desktop 18 | Phone 15 | Zoom 10 | Zoom 44 |
| -------------------------------- | ---------- | -------- | ------- | ------- |
| Camera above player              | 16.9 tiles | 14.1     | 9.4     | 41.4    |
| Camera south of player           | 6.1        | 5.1      | 3.4     | 14.8    |
| Flat ground seen north of player | 9.3        | 7.8      |         |         |

Rays run 48 deg (top of screen) to 93 deg (bottom). Near clip 0.1 tile, far 4096: nothing clips.

**Hidden behind a drop facing north** (ground past its top edge):

| Drop | Screen middle | Screen top |
| ---- | ------------- | ---------- |
| 30   | 0.67 tile     | 1.7        |
| 44   | 1.0           | 2.5        |
| 65   | 1.45          | 3.7        |
| 125  | 2.8           | 7.1        |
| 255  | 5.7           | 14.4       |

- **Measured:** 1.25 tiles north of +60, the feet are clipped. 1.5 tiles north of +125, the player is fully hidden (white silhouette).
- **Enemies get no silhouette** (only player, bosses, pets), so they vanish there.
- **Grid check** (check-maps' 44-a-tile rule): +30, +60, -65 hide 0 open rows; +125 and -128 hide 2.

**High ground ahead pushes things off the top of the screen.** Seen north onto a rise:

| Rise | Desktop   | Phone |
| ---- | --------- | ----- |
| 65   | 5.7 tiles | 4.1   |
| 125  | 2.2       | 0.7   |

Measured: goblins on the +64 moderate slope's top were all off-screen on desktop. Pits do the opposite: you see further in.

**Depth doesn't fade.** Fog is by ground distance and the arena edge's 6-tile fade only. Light is by slope (SW light),
not depth. The only depth cue is size:

| Below the camera's level | Desktop scale | Phone scale |
| ------------------------ | ------------- | ----------- |
| 30                       | 0.91          | 0.89        |
| 65                       | 0.82          | 0.80        |
| 125                      | 0.71          | 0.67        |
| 255                      | 0.54          | 0.48        |

**No roof or upper-plane hiding.** Upper planes are never drawn. `isTileDrawn` drops shown upper tiles over indoor tiles
once, at load; nothing happens per frame.

### 3. Tested on `scaperune_depth`

4 squares (arena 128x128), ground at 128. Faces blocked with rock overlays (row A plain grey 10, tall cliff and
platforms grey stone 20, pits dark rock 32). Ramps at 12 a tile, road. Tops and pit floors cobbles. Goblins on each level.
Shots via ~/tools/pw/rs-floor.mjs, sim held.

| Case                         | Look                                                                                    | Phone tris     | Desktop tris    |
| ---------------------------- | --------------------------------------------------------------------------------------- | -------------- | --------------- |
| Gentle slope (2/tile, +60)   | Barely reads on bare grass (light only); fine                                           | 7,504          | 7,504           |
| Moderate slope (8/tile, +64) | Reads; things on top pushed off-screen                                                  | 5,338          | 7,248           |
| Cliff +65 (sheer / 3-tile)   | Flat grey band ~3.5 tiles tall; phone sees ~2 tiles onto the top                        | 8,646          | 11,324          |
| Tallest cliff +125           | Fills the top half; texture streaks badly                                               | 4,826          | 5,594           |
| Platform +30                 | Good, ground below readable                                                             | 7,376          | 8,144           |
| Platform +60                 | Good; feet clipped 1.25 tiles north of it                                               | 8,528 / 11,196 | 8,413 / 11,068  |
| Platform +125                | Top fine; ground below tiny; phone sees none of it; player hidden behind it             | 8,541 / 11,068 | 11,245 / 11,324 |
| Pit -30                      | Good from rim                                                                           | 11,196         | 11,068          |
| Pit -65                      | Good from rim and inside; reads like a room                                             | 11,708 / 8,774 | 11,452 / 8,902  |
| Pit -128                     | Deep box; south rows hidden from rim; streaky walls; rim enemies off-screen from inside | 11,580 / 8,518 | 11,593 / 8,646  |
| Owl's Court (reference)      | Lower walkway 4 down over black void, lips and hung walls: best-looking depth           | 46,640-52,407  | 50,495-51,950   |

Bare terrain costs 2 triangles a tile at any height; the cost is the walls and rock that dress the faces.

pit65 rim phone, pit128 inside, Owl's Court desktop and phone).

### 4. Going further

- **Levels on one surface (fake, as the Owl's Court):** possible today.
    - Work: a recipe helper for platforms, pits and ramps, about 1-2 days. Dressing faces is the real work (Sepulchre kit, or rock kits per biome).
    - Limits: no overlapping walkways (bridges are the only overlap); stairs are scenery over a ramp.
    - Risk: low.
- **True multi-plane maps with stairs:** possible, big (2-4+ weeks).
    - Sim: plane on every actor, projectile and pickup; a grid and flow field per plane (or a linked 3D field); stair links; every spatial query filtered by plane in the 12k-line Sim.
    - Renderer: draw several levels without the reload `setPlane` causes, plus OSRS-style hiding above the player.
    - Risks: determinism (runHash), co-op prediction, plane-switch hitch, phone triangles from extra levels. Not recommended unless it's the feature.
- **Fighting across levels:** already works (2D). Polish:
    - Draw projectiles on an arc from the shooter's height to the target's, not snapping to the ground: 0.5-1 day, client only.
    - Optional rule: no melee when the height gap is over about 1 tile, about 1 day in the sim (heights are in the grid data sims already load).
    - Optional: cliffs block line of sight, a height ray cast, 1-2 days plus a targeting cost.
    - Risk: sim changes need sims and runHash care.
- **Falling off edges:**
    - One-way drops: a collision wall on one side only (walls are per tile side), a fall or slide using `hero.drag` (the floor system already shoves players), and the flow field handling one-way edges. 2-4 days.
    - Falling into a void: damage and put back at the edge, 1-2 days.
    - Risks: flow field correctness, co-op prediction (`PlayerMovement` shared rules).
- **Roof / upper-plane hiding:**
    - Not needed for one surface. Instead, silhouette all enemies (or only those in the camera's shadow): about 0.5 day plus a phone check (extra draw pass).
    - True OSRS roof hiding needs multi-plane drawing: about 1 week on top of true planes.
- **Camera adjustments:**
    - Look ahead: aim at the higher of the player's ground and the ground a few tiles north.
    - Pull back by the height difference on high ground.
    - Steeper pitch near tall north faces (77 deg cuts hiding from 0.36h to 0.23h).
    - Work: 0.5-2 days in GameClient/CameraRig, plus the keep area (CAMERA_REACH).
    - Risks: camera bob, interplay with boss lean and intro pan, whole-game look if pitch changes.

### Not verified

- Real phones (headless Chrome, software renderer).
- Dressed faces on the test map (bare terrain only; Owl's Court is the dressed reference).
- Fliers and shots crossing ledges in motion.
- Desktop at full zoom-out.
- Work estimates (reasoned from code, not prototyped).

## Part 2: backdrops (scenery only, nothing walkable)

Dynny's follow-up: height as world building, only to look nice in the background. Dev map `scaperune_backdrop`
(`maps/backdropTest.ts`): six pads with scenery round them.

### The answer

- **Depth: about 16 tiles (255, the byte limit) is all it needs.** A drop only looks deep when a face points at the
  camera: a drop to the south, the far wall of a chasm to the north, terraces, or black void with a lit ledge below.
  Past 16 tiles nothing looks deeper (32 via a bridge deck works and looks the same).
- **Height: north is cut off by the top of the screen.** About 10 tiles (160) show on desktop and 8 (128) on phone,
  with the player at its foot. East and west: keep it under about 6 tiles, or it leans over the screen. South
  (behind the camera): under about 2 tiles, or let the ground fall away.

### 1. Depth below the arena edge

- **Drop to the south:** its face hangs toward the camera. 16 tiles reads well.
- **Drop to the east or west:** no face shows (it faces away). It looks like flat ground beside the pad.
- **Drop to the north with a bright flat floor (lava):** looks like a lake at your own level, however deep, the 32-tile
  deck too.
- **North chasm with a far rim back up at 255:** reads as deep. The far face is what sells it, and the floor shows as a
  thin band.
- **What helps:**
    - ledges stepping down (65 each, 3 tiles deep);
    - terraces with objects that shrink as they go down;
    - black void with a lit ledge 65 below (as the Owl's Court's lower walkway is).
- **No depth fog or darkening.** Fog only works by ground distance, and on ScapeRune maps the edge fade starts 56 tiles
  out. A depth-darkening shader would be a small change (not built).
- **Limits and ways round them:**
    - 255 a corner on level 0 (16 tiles).
    - A bridge deck on level 1 adds another 255 (tested: a 32-tile drop works and draws, with a black gap under the deck).
    - `LocOverride.height` moves a model down without limit, but per loc id and only for ids placed nowhere (not tested).
- **Bare faces streak:** a textured face stretched over 16 tiles in one tile looks smeared. Dress tall faces.

### 2. Height above

Camera: 17.5 tiles up and 6.1 south on desktop (14.7 and 5.1 on phone). Top of the screen is a 48 deg ray.

- **North:** seen up to 10.9 - 1.1 x (tiles to its foot) on desktop, 9.2 - 1.1 x that on phone. Anything taller is
  triangles nobody sees, but a cut-off column still reads as towering.
- **East and west:** things lean out. A point h tiles up shows 1/(1 - 0.94h/D) further out (D = 18.6 desktop,
  15.6 phone): 1.25x at 4 tiles, 1.7-1.9x at 8. The statue (8.8), blue rock (10) and cave mouth (7.3) loomed badly.
- **South:** hides the player if taller than 2.8x its distance; keep low, or drop away.
- **Best direction:** north for tall things, south for drops.
- **Cache pieces** (phone triangles each):

    | Piece                 | Size          | Triangles | Verdict                         |
    | --------------------- | ------------- | --------- | ------------------------------- |
    | Pillar 52490          | 7.6 tiles     | 1,756     | Great north colonnade           |
    | Sunken steeple 48311  | 15 tiles      | 2,475     | Only its base shows             |
    | White rock face 50964 | 6x3, 9.7 tall | 217       | Cheap pale cliff on a side wall |
    | Blue rock 49068       | 7x7, 10 tall  | 250       | Looms at the side               |
    | Statue 37818          |               | 1,589     | Looms at the side               |
    | Cave mouth 62217      |               | 1,880     | Bad: blob plus a black box      |

### 3. Layering

- **Terraces read best:** steps of 32 every 4 tiles, trees shrinking down them.
- **Fade:** neither helps nor hurts on ScapeRune maps (starts 56 tiles out). On cache maps it starts at the arena edge
  (6 tiles) and blacks out anything beyond: fine for an abyss, kills tall scenery (from the shader, not shot).

### 4. Recipes (phone triangles, whole view, about 3.5k of it two actors)

- **Chasm edge, north** (7,642):
    - Arena 255 over the bottom.
    - Chasm 8-10 tiles across, far rim back at 255 (its face looks at the camera).
    - Near-side ledges dropping 65, 3 tiles deep.
    - Dark or lava bottom; dress the far face.
- **Floating edge / south drop:**
    - Ground falls 16 tiles to the south (9,178).
    - Or black void with Sepulchre walls hung 4 tiles and a lit ledge 65 below (4,482 bare; the Owl's Court is
      46-52k with all its statues).
- **Cliff wall north** (7,168-7,296):
    - Massif in faces of 64 over 2 tiles, 2-tile ledges, up to 128-160 (higher is wasted).
    - White rock 50964 on side walls, under 6 tiles.
- **Terraced valley**, east or north (11,070): steps of 32 every 4 tiles, trees about 2 in 3 spots, 5 apart.
- **Towering temple north** (14,773):
    - 4 pillars 52490 in a row 3 tiles past the north edge (+7k).
    - Skip the steeple; sides under 6 tiles.

### Not verified

- Real phones.
- Waterfalls, mist effects, hung walls deeper than 4 tiles.
- `LocOverride` depth and the cache-map fade (from code only).
- A depth-darkening shader (not built).
- That the black behind rock 50964 is its own back.
- Desktop zoomed out (at zoom 44 about 25 tiles of a north backdrop show).
