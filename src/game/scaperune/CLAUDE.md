# ScapeRune

ScapeRune makes maps that don't exist in OSRS: our own ground, heights, water and paths, with real
cache objects and buildings on top. It's self-contained: everything is in this folder, and nothing
outside it needs changing to make a map.

**Nothing here ships to players yet.** Every map is in `maps/devMaps.ts`, and those only show on the
dev server (or with `DEV_MAPS=1` in a script). A run on one doesn't touch the save.

## How it works

A recipe builds a `TileGrid`: plain arrays of floors and heights, and a list of locs. `format.ts`
writes it out in the cache's own terrain and loc formats, map square by map square, and
`squares.ts` hands those to the viewer as plain data (`MapViewer.addCustomMapSquares`).
`src/rs/map/CustomMapFileLoader.ts` then serves them to anything that reads a map. So the renderer,
collision, flow field, minimap and bot get them with no idea they aren't real.

The recipe runs once, on the main thread, the first time the map's played. `GameClient.loadGrid` calls
`installRecipe`, and scripts call `installRecipeInSceneBuilder`. Reload the page to see a change.

| File             | What                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `recipe.ts`      | `MapRecipe`, `BuildContext`                                                                               |
| `Ground.ts`      | a map being built: paint overlays, stamp prefabs, place locs                                              |
| `format.ts`      | the tile grid, and reading and writing both file formats                                                  |
| `prefab.ts`      | cut a rectangle out of the real world, turn it                                                            |
| `prefabs.ts`     | the named rectangles, a starter set                                                                       |
| `biomes.ts`      | what each kind of ground is made of, and its rock                                                         |
| `generator.ts`   | the random generator: the order things happen, scatter, reachability                                      |
| `mapBuild.ts`    | what's kept while a map's built, and what its parts share                                                 |
| `rivers.ts`      | rivers, lakes and the sea: where they go, how high they stand                                             |
| `mountains.ts`   | passes, what can be walked, rock, snow, caves, lava                                                       |
| `roads.ts`       | roads and bridges                                                                                         |
| `settlements.ts` | where buildings go, and their plots                                                                       |
| `terrain.ts`     | the height layer: floats per corner, pins, slope limits                                                   |
| `landforms.ts`   | the shape of the land: hills, ranges, mesas, canyons, volcanoes                                           |
| `roadGrades.ts`  | how high every road runs, worked out together                                                             |
| `collision.ts`   | collision from a grid, reachability                                                                       |
| `paths.ts`       | cheapest path, for roads and fords                                                                        |
| `noise.ts`       | seeded random numbers, noise, fractal and ridged noise, distance                                          |
| `palette.ts`     | everything the generator can use, on one map                                                              |
| `squares.ts`     | turns a recipe into squares, and installs them                                                            |
| `maps/`          | the maps: `devMaps.ts` lists them, `terrainTest.ts` is a hand-made one, `cliffGallery.ts` shows rock locs |

## The map generator screen (temporary)

On the dev server the title screen has a **Map generator** button: every setting in sections, presets, Random,
Reset, copying and pasting the settings as JSON, Generate with a preview from above, and Play. It's temporary,
there to try settings, so it's built to delete: remove `MapGeneratorScreen.tsx`, its CSS and `generatedMap.ts`,
then the `MapGeneratorButton` line in `ui/GameUi.tsx` and `setGeneratedMap` in `content/maps.ts`. A production
build never shows it.

Every Generate replaces one map, `scaperune_generated`, at map squares from x 70, y 134. `installGeneratedMap`
replaces whatever kept the old one: the squares on the main thread and in the workers, the renderer's loaded
squares, the map images and the cached collision. A load still on its way for the old squares is dropped
(`MapViewer.customMapVersion`). If you add anything else that's kept per map, clear it there.

**Runs on any map here, dev maps included, leave the save alone**: `MapDef.dev`, checked in `recordRun`.

## Making a map with the generator

Add a line to `GENERATED` in `maps/devMaps.ts`. Only `seed` is required; the rest come from `DEFAULT_SETTINGS`.
`settings.ts` has every setting, what it does and its limits (`SETTINGS`), which section it's in, and the presets.
The screen, the error messages and the tests are all built from `SETTINGS`, so **adding a setting means adding it
there, with a default and a section, and to `CHANGES` in `generator.test.ts`**, which fails if changing a setting
doesn't change the map. A setting that only matters with another (`when`) hides until it does.

```ts
["scaperune_oasis", 71, {
    seed: 42,
    biome: "desert",
    squaresX: 4, // arena size in map squares, each way: 1 to 28
    squaresY: 2,
    boundary: "hills", // what stops you: sea, forest, hills, fence
    rivers: 1,
    lakes: 2,
    trees: 0.2,
    roads: 1,
    roadStyle: "ring", // branching, ring, spine
}],
```

The same seed and settings always give the same map. It's generated at load from a fixed palette (`BIOMES`,
`PREFABS` and `BRIDGE`); nothing is baked to a file.

What it does, in order: the land's shape (`landforms.ts`), rivers down its valleys, sea and lakes, cliffs, passes,
floors, bridges, main roads, buildings with their roads, ruins, then the heights are finished (`gradeRoads`, `settle`),
what's too steep is blocked, then rock, the boundary, scatter, and reachability. Anything it can't connect gets
blocked (see below).

**Boundaries.** Only `sea` makes an island. With the others, land runs on past the arena on all sides, scattered
out to the edge of the margin, so the world looks like it carries on. The arena's edge is still what stops you,
so each one puts something there: `forest` a thick belt of trees either side of it, `hills` ground rising away
with a line of boulders on it, `fence` a fence `boundaryDepth` tiles in, with gaps where roads go through,
`mountains` a ring of rock rising from `boundaryDepth` tiles in.

**The game fades the world to black past the arena's edge**, over 6 tiles (`playAreaFog`). Real maps keep that. It
would hide all of the above, so `GameClient` moves it out by `OPEN_WORLD_MARGIN` on dev maps. A map that ships
needs its own flag for this. The minimap still only covers the arena, so it's black past the edge.

Preview it from above, without a browser. This draws it with the game's own minimap renderer and checks it with
the game's real collision. The minimap doesn't draw trees or rocks, so look at those in the browser.

```sh
npx tsx scripts/scaperune/preview.ts out.png map=scaperune_oasis
npx tsx scripts/scaperune/preview.ts out.png seed=7 biome=snow boundary=forest squaresX=3 rivers=2
```

## Roads and buildings: the rules

`check-maps.ts` fails on any of these, on the dev maps and on `SWEEP`, settings at their extremes:

- **A road never goes through a building**, walls included, whichever was placed first. Buildings keep off road
  tiles; roads and fords can't step within `RoadNetwork.wallGap` of a building (`offLimits`); smoothing that drifts
  onto one is undone; and painting skips `Ground.footprint`.
- **A building's door faces a road.** Main roads and bridges go down first, then buildings with roads, each turned
  so a way out faces the nearest road, with its road running straight out of that door. One that can't reach the
  roads goes somewhere else.
- **A building without a road still faces the nearest road**: they're placed last, so they see all the roads. If
  there are no roads at all they face the spawn. The `roads` setting is the share of buildings that get a road.
- **A door's lead-in is its own.** Other roads join past it, not against the wall.

## How big a map can be

Numbers from a Node run, 400 enemies in the Sim, on this VM, with no mountains:

| Squares a side | Tiles in the grid | Generate     | Start a run | Browser peak | Sim tick, 400 enemies |
| -------------- | ----------------- | ------------ | ----------- | ------------ | --------------------- |
| 4              | 147 k             | 1.1 s (Node) |             |              | 0.73 ms               |
| 8              | 410 k             | 2.5 s        | 2.1 s       | 1.5 GB       | 0.76 ms               |
| 16             | 1.3 M             | 7.1 s        | 3.1 s       | 1.9 GB       | 0.73 ms               |
| 20             | 2 M               | 6.6 s        | 3.1 s       | 1.7 GB       |                       |
| 24             | 2.8 M             | 8.4 s        | 5.0 s       | 2.2 GB       | 0.73 ms               |
| 28             | 3.7 M             | 14.8 s       | 6.2 s       | 2.25 GB      | 0.75 ms               |

Browser figures are with 2 workers, software rendering and no enemy or player models baked, of which about 1.4 GB
is there before a map is built. Some of it is left from earlier runs in a session, so they're not exact.

- **Cost per tick doesn't grow.** The flow field's a fixed 96 tile window round the player, enemies stay near the
  player, and the renderer only loads the squares near the camera (4 to 8 of them). Frame rates were 8 to 18 here
  at every size, which is software rendering, not the map.
- **What grows is memory, with area**: the map grid while it's built on the main thread, and the collision scene
  for a moment in one worker. In Node at 28 they each added about 400 MB.
- **The hard limit is the world**: 28 is what fits at x 70 to 99, because `MapManager.MAX_MAP_X` is 100. Raising
  that is one line, but past 28 this VM's 2.4 GB cap would stop it, so it hasn't been tried.
- **Mountains cost more to build**, in time, not at run time: with `mountains` at 0.75 it took 8.5 s at 8 squares, 22 s
  at 16 and 65 s at 28, in Node with no cache behind it, peaking at 720 MB. It's noise on every corner, passes (nearly 600
  at 28) and fords. A map's run time is the same: 0.12 ms a tick with 66 enemies on `scaperune_alpine`.
- **Three things had to change to get here**: the collision build drew tile models it never read
  (`buildScene`'s `tileModels`), the minimap kept a 205 MB canvas and asked for every square's image at once (big
  arenas are coarser, and ask for what's near), and the preview drew every square (past 5 by 5 it draws the grid).
- Over 8 squares a side the minimap's blurry, and blank away from where you've been.

## Writing a recipe by hand

A recipe says where its squares go and how to build them. This is a whole map: a square of grass in a
ring of water, with a stamped house and some trees.

```ts
import { Ground } from "../Ground";
import { createRng } from "../noise";
import { rotatePrefab } from "../prefab";
import { PREFABS, loadPrefab } from "../prefabs";
import { BuildContext, MapRecipe } from "../recipe";

const SIZE = 3 * 64; // one arena square, one square of margin each side

function build({ maps, locs }: BuildContext) {
    const ground = new Ground(SIZE, SIZE);
    const rng = createRng(1);

    // Floors and heights. Heights are per corner, so they go up to SIZE inclusive.
    ground.level0.underlays.fill(48);
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            ground.setHeight(x, y, 40);
        }
    }

    // Water round the outside: overlay 6, blocked
    const water = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const edge = Math.min(x - 64, 127 - x, y - 64, 127 - y);
            water[ground.tile(x, y)] = edge < 4 ? 1 : 0;
        }
    }
    ground.paintOverlay(water, 6, true);

    // A building, turned a quarter
    const house = rotatePrefab(loadPrefab({ maps, locs }, PREFABS.lumbridge_house), 1, locs);
    ground.stamp(house, 90, 90, { floor: "footprint", feather: 4, flatten: true });

    // Trees: size is the loc's tiles a side
    for (let i = 0; i < 30; i++) {
        const x = 70 + Math.floor(rng() * 50);
        const y = 70 + Math.floor(rng() * 50);
        if (ground.isClear(x, y, 2, 2)) {
            ground.place({ id: 1276, type: 10, rotation: 0, level: 0, x, y }, 2, 2);
        }
    }
    return ground.grid;
}

export const LITTLE_ISLAND: MapRecipe = {
    id: "scaperune_little_island",
    // Map squares the cache doesn't have
    mapX: 71,
    mapY: 116,
    squaresX: 3,
    squaresY: 3,
    // Squares of scenery round the arena
    margin: 1,
    // Grid tile
    spawn: { x: 96, y: 80 },
    build,
};
```

This one has a known fault, left in to show it: the house's door stays shut, so `preview.ts` reports the
23 tiles inside as stranded. Drop the door with `skipLoc`, as the generator does.

Then add it to `SCAPERUNE_DEV_MAPS`. `content/maps.ts` makes a `MapDef` for each dev map, with Lumbridge's
waves. In the browser console: `game.selectMap("scaperune_little_island"); await game.startRun()`.

Grid tiles start at the grid's south-west corner, x east and y north. `getRecipeWorldTile` turns them
into world tiles.

## Floors and heights

- **Underlays** are the ground. They're blended over 11 tiles by the renderer, so colours soften on
  their own.
- **Overlays** sit on top, with hard edges: paths, water, floors. Give `paintField(field, id, blocked)` a
  field with a value per tile corner, above 0 inside: distance to a river's centre less its half width, a
  radius less the distance from a pond's middle. Anything smooth. `addPathToField` makes one from a path,
  and `smoothField` evens one out. `paintOverlay(mask, id, blocked)` does the same from a mask of tiles,
  for hand-made shapes, but the edges follow the tiles more, and it smooths away anything a tile or two
  across.
- **Why fields:** an edge can only cross a tile side at a corner or at its middle, and adjacent tiles share
  those points. So `shapes.ts` picks each tile's shape from which of its eight half sides are covered, and
  edges join up. Picking shapes from whole tiles can't do that: a line ending at a corner next to one
  ending at a side's middle makes a tooth. Don't use shape 11: it dips to both corners, so a row of them is
  a row of teeth.
- **Ids are as the map files store them, the cache's id plus one.** `find-prefabs.ts` prints them this way,
  so copy from there.
- **Heights** are one byte per tile corner, going up, 8 scene units each. A tile is 128 units across, so 16
  a tile is 45°. Real lowland stays between about 0 and 80, and real mountains use all of 0 to 255. `setHeight`
  rounds and clamps for you. The generator works in floats in `Terrain`: see [Height](#height).
- Look at what a kind of ground is made of with `find-prefabs.ts` on a real square, then use those ids.
  That's how `biomes.ts` was made.

## Height

Height's a layer of its own while a map's built: `Terrain` holds a float per corner, and only the finished heights go
into the grid. Nothing writes heights directly. Whatever needs the ground to be a certain height **pins** it, and
`settle` brings the ground round it to meet that, cutting and building no steeper than `SETTLE_SLOPE` of what's
walkable. That one idea does cuttings, embankments, plots and the ground round bridges.

**The limits, measured:**

| What            | Number                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| A height        | 0 to 255, one byte, a step of 8 scene units. 1 reads as 0.                                                   |
| Tallest ground  | 255 is 2040 scene units, 16 tiles. Real peaks use it (Trollheim, Cam Torum)                                  |
| What gets drawn | `MapManager` culls squares with a box 18.75 tiles up: all of it fits                                         |
| Real slopes     | up to 44+ a tile, blocked, with a rock overlay; `getTileSlope` measures                                      |
| Tiles           | two triangles, split south-east to north-west                                                                |
| Light           | from the south-west. 11 to 181 against 84 on the flat, so it can't overflow; camera-facing slopes are bright |
| Actors          | stand on `getHeight` at their middle. They don't tilt.                                                       |

**The camera.** It's fixed: it looks north, at 70° (pitch -400), from 18 tiles (10 to 44 with the wheel), 45° field of
view, so at the default zoom it sees about 27 by 16 tiles. So:

- **A mountain's something you walk under, not something you see.** What reads as height in that window is light, cliffs
  and ledges a dozen tiles across, not peaks a hundred across. `terraces` is what does that.
- **Only drops to the north can hide anything**, because the camera's south of what it's looking at. 70° is 44 height
  units a tile, so a face steeper than that hides its own foot. `limitNorthFaces` keeps them to 30 (`NORTH_FACE_SLOPE`),
  and `check-maps.ts` counts open tiles hidden from the camera, which must be 0. The rest of the view runs from 92° at
  the bottom of the screen to 48° at the top, so a tall ridge can hide a tile or two near the top until you get closer.
- **It doesn't clip.** Over any slope within that limit it stays at least 15% of its distance over the ground.
- **It'd lurch** at creases on tall ground, so on dev maps it eases after the ground (`CAMERA_GROUND_EASE`).

**Walkable.** A tile steeper than `walkSlope` (12 by default) is blocked with the same floor flag as water. That goes by
the rounded heights in the grid, so `getCollisionFlags` and the game's scene agree, and `check-maps.ts` compares every
tile. Enemies need nothing new: to the flow field a cliff's a wall. They only turn up where they can reach you
(`canTurnUpAt`), so one on the far side of a long cliff doesn't stand there.

Cliffs are picked in `shapeCliffs`: tiles over `walkSlope`, without specks, and without ledges too thin to walk. Then
slopes that are left are eased under the limit, so all the height that's lost there goes into the cliffs, and a
hillside comes out as ground you can walk on and cliffs you can't, with nothing in between. **A blocked tile always
looks it**: everything blocked gets the rock overlay.

**Reachability.** `cutPasses` cuts a graded pass to any piece of ground over `MIN_PASS_PIECE` the cliffs cut off, before
roads go down, so roads use them. Anything smaller stays out of reach, which is fine on top of a mesa. Nothing's built
off the `mainland`.

**Roads.** Routes are found with a cost per step (`climb`), so they go round or wind up a slope rather than straight up
it. Their heights are worked out **all together, last** (`roadGrades.ts`): every point's a node, linked along the
road and to anything near it, with leads and plots pinned, and the grade limited along every link. Doing them one
at a time doesn't work, however careful: a road's height depends on what it meets and what it passes, and those can
come later. Then the ground's pinned to them across their width.

**Rivers** (`findValley`) follow the low ground, seam-carved a column at a time, so a river's still a function of how far
along it is and all the bridge logic stands. Their level only falls toward their lower end, is level for
`LEVEL_AT_CROSSING` tiles round a crossing, and banks come down over `riverValley`'s slope: sheer gorges at 0 and wide
valleys at 1. Fresh water's corners are held: nothing moves them.

**Bridges** stand with their banks `BRIDGE_BANK_HEIGHT` over the water (the prefab's river bed is at 0 under banks at 30),
pinned from the prefab's own heights, because the deck's stored relative to the ground under it.

**Buildings** stand on a flat plot (`pinPlot`) with a level step out of the door. They only go where the ground rises
less than `MAX_PLOT_RISE` over the plot, away from cliffs and with room to get down to water, and where their road can
reach what it joins at a walkable grade.

**Actors on slopes.** On dev maps `getHeight` follows the triangles a tile's drawn with (`ArenaGrid.exactGround`), since
easing across a tile can be 0.4 tiles out on a steep one, and anything with a radius over a tile is lifted part of the way
to the highest ground under it (`groundUnder`).

### Rock

Real mountains are mostly just height and a rock overlay: Trollheim's overlay 83, Ice Mountain's 22. What makes them
read as rock is the light on the ridges, stones all over, and at Karuulm, faceted rock locs laid over the steep tiles.
Those fill their tile and follow the ground (contour), which is what the old grey ramp was missing. `RockDef` in
`biomes.ts` says what a biome's made of. To look for more, `scaperune_cliffs` shows locs on a steep band.

| Locs                                                                   | What                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 34384, 34372, 42352 (type 10)                                          | full tile rock: near-black green, olive, black. The good ones              |
| 42097, 42098, 6617, 52795, 48627, 57476 (type 22)                      | flat patterned decals: brown, tan, maroon, green. They look like brickwork |
| 34385, 34388, 34391, 34392, 42353 (type 10)                            | broken facets, with holes                                                  |
| 53538 (wall), 53543 (diagonal)                                         | snow on a wall; ice shards, which look terrible                            |
| Rockslide 11434 grey, 11922 white, 18894 amber, 11933 dark, 3718 mossy | heaps of rock, 2 by 2                                                      |
| 185, 3703, 11439, 3614, 321, 3706 (type 22)                            | stones                                                                     |

**Waterfalls** gather a river's fall into single drops at least `WATERFALL_SPACING` apart, with foam across the river. The
foam's the only art there is: the cache's waterfall models are built for their own cliffs. Most rivers don't fall far in
the arena, because they look for the low ground, so these are rare and mostly in the margin.

**Caves** are decoration: a mouth 3 by 2 tiles at rotation 0 (facing south), set into the foot of a cliff that faces the
camera. Nothing goes in them. They're on tiles that are blocked anyway.

**Tried and dropped:** a rope bridge over a gorge. The cache's (21509, on Neitiznot) is a thin wall loc with no deck, so
it'd need a walkable deck built from nothing, and from above it's a line. `53543` ice shards look terrible as a snow
face, and no overlay's as white as the snow underlay, so snowy cliffs are bare underlay with dark faces.

**A heightmap** replaces hills and ranges (`heightmap`): the screen shrinks an image to `HEIGHTMAP_SIZE` a side, and it
travels in the settings as base64, so it's in the JSON too. Black is the floor of the land and white is `peakHeight`.
Everything after that treats it as any other land.

To add a landform, add a function to `landforms.ts` that adds to `terrain.height` and marks `mountain`, call it from
`createRelief`, add its setting, say so in `hasRelief` (`mapBuild.ts`), and add a line to `SWEEP` at its extreme. To give
a new biome its mountains, fill in `rock` in `biomes.ts`: the palette picks it up.

`npx tsx scripts/scaperune/relief.ts out.png preset=Alpine seed=3` draws a map's height in a second or two without
the cache, which is the quick way to work on shapes. Fake prefabs stand in, so buildings aren't right.

## Water

Paint it with an overlay and `blocked: true`. The blocked flag is what stops you, not the overlay.
Water overlays: 6 and 442 (rivers and sea), 7 (swamp), 5 (lava). There's no water plane: water's drawn at the height of
its tiles' corners, so keep them level, and bring heights near water down to it over a few tiles (`distanceTo` gives
you the distance).

## Prefabs

There's no building entity in the cache. A building is its locs and floor tiles, so a prefab is a
rectangle of the real world.

1. **Find one.** `npx tsx scripts/scaperune/find-prefabs.ts 50 50` draws map square 50,50 as text with
   world coordinates down the side. Pick a rectangle that holds the whole building and nothing else.
2. **Name it** in `PREFABS` (`prefabs.ts`): its south-west corner and size, in world tiles. The rectangle must
   take in every wall of the building, with nothing else in it. A rectangle a row short loses that wall, and the
   floor behind it with it.
3. **Check it**: `npx tsx scripts/scaperune/check-prefabs.ts`. It walks the walls of every prefab in every
   rotation and fails if a wall's cut off, floor is lost indoors, or there's no way out. Then look at it:
   `scaperune_prefabs` is a dev map with all of them in all 4 rotations.
4. **Stamp it**: `stampBuilding(ground, context, def, turns, x, y, towardX, towardY)` stands it on flat ground with
   its doors off, and returns its way out nearest a tile. For anything else,
   `ground.stamp(rotatePrefab(loadPrefab(context, def), turns, locs), x, y, options)`.

`stamp` options:

- `floor`: `"footprint"` keeps our ground and takes only the floor inside the walls, so the ground runs up to
  them and no stray steps or paths come along. Use this for buildings. `"all"` takes the whole rectangle, which rarely looks right. A function picks which
  overlays to take: the bridge takes almost none, so that it stands on our river and our road runs onto it.
- `flatten`: stands it on flat ground. Use this for buildings.
- `feather`: how many tiles the ground takes to ease back. 4 is about right.
- `keepUnderlays`: keeps our ground's colour under it. Use this whenever the prefab's from other ground, or a
  Lumbridge house gets a green halo in the snow.
- `skipLoc`: leaves locs out. The generator drops doors: closed ones block, like walls.
- `height` and `anchor`: stand it at a height, and say which of its own heights that means.

Only rotation is possible. The format has no mirror.

## Checking a map

1. **Reachability, in Node.** `scripts/scaperune/preview.ts` and `check-maps.ts` print how many open tiles
   can't reach the spawn, using the game's real collision. It must be 0.
2. **From above.** Look at the preview's PNG. The white square is the arena and the red dot is the spawn.
3. **In the browser**, because tests don't cover how things look. Use `~/tools/pw/rs-terrain.mjs`, or
   `game.selectMap(id); await game.startRun()` in the console. Look at it side-on too, with a lower
   `game.cameraRig.pitch`: from above, hills barely show.
4. **Tests**: `npx vitest run src/game/scaperune`.
5. **A bot run** shows it plays at all: `DEV_MAPS=1 MAP=scaperune_oasis npx tsx scripts/game/simulate-run.ts wizard 1`.

The generator guarantees reachability: it floods from the spawn over the same collision the game uses,
lays a ford across anything big that's cut off, and blocks whatever's left. A hand-made recipe has no such
check, so use `findReachable` and `findStranded` from `collision.ts`, or `preview.ts`.

## Traps

- **Nothing outside the grid exists.** The game draws black past it. Keep a margin of a square of scenery
  round the arena. `margin: 1` does.
- **The arena's edge is an invisible wall.** Water or trees just inside it hide that.
- **The minimap doesn't draw trees or rocks**, so a preview shows neither.
- **Enemies only path 48 tiles.** The flow field's window is 96 tiles across (`FLOW_FIELD_SIZE` in
  `Sim.ts`), so keep river crossings closer than that to wherever the fight is, or enemies on the far side
  stand at the bank. A long cliff's the same, but they only turn up where they can reach you, so it just means
  they come from your side of it.
- **Two parallel roads merge if they're close.** Roads are smoothed as a field before they're painted, so one 4 rows
  from a bridge's road adds a third row beside it. `BRIDGE_ROAD_CLEAR` is what keeps them apart.
- **A setting that adds rock must say so to `hasRelief`**, or rivers won't look for a valley and main roads won't route.
- **Pins made before a pass are let go** (`cutPasses` clears them, having cut the ground), so anything pinned for good
  comes after it.
- **The camera's fixed, so faces aren't equal.** It only ever sees faces looking south. A rock face on a north-facing
  cliff's mostly lost, and anything that has to be seen (a cave's mouth) has to look south.
- **The map's seed order matters for water**: rivers come after the land's shape and before water's levels, and levels
  need the sea sunk first, or a river's lowest point isn't known.
- **`spawn` must be open**, and it has to be known without building the map, because the game needs it
  first. The generator clears water and scenery round it, wherever `spawnX` and `spawnY` put it.
- **`Math.random` breaks everything.** A recipe runs again on every load and in every script. Use
  `createRng` and `createNoise`. If you add a call to `rng()` early on, every later roll changes, and
  so does the map.
- **One plane is drawn.** The game hides everything above the arena's plane, so roofs and upper floors vanish,
  as on real maps. Bridges still draw: their deck is on level 1 with a flag on level 1's tiles.
- **Doors are closed, or open and turned.** A stamped building with a door has a sealed inside unless you drop
  the door. An open door stands on another side of its tile, off the wall, so don't read a way out from a door's
  rotation: `findExits` goes by the gap. Curtains are doors too.
- **"Indoors" means walls on at least 3 of 4 sides**, straight lines out from the tile (`getInsideTiles`), so
  that a doorway doesn't let the outside in.
- **Cuts clip things.** A wall on a rectangle's edge can belong to the tile outside it. `check-prefabs.ts` finds
  that. Bits of fence or a neighbouring building in the rectangle come along as stray walls, which it doesn't
  find, so look at the gallery.
- **A bridge's deck and fence gap are 2 tiles wide, centred on a line of tile corners**, not on a tile's middle.
  Run a road down that line with a half width of 1 to 1.3 and it fills the gap with its edges on the tiles.
  `check-maps.ts` holds generated bridges to this. A river where the road can't run straight off both ends for
  6 tiles past the stamp gets a ford instead.
- **Roads have an overlay down the middle of a soft underlay.** Underlays blend over 11 tiles, which hides the
  tile grid but can't be narrow, so an underlay alone is a wide faint stain, not a road. An overlay alone has
  a hard edge. Together the stain takes the contrast out of the edge. It needs ground with some colour in it:
  on grey or white snow any tint blends into a pastel halo, so snow's trail is the snow, with no stain.
- **Overlay edges are always faceted.** They can only bend at corners and side middles, so a curve is a
  chain of short straight lines. Keep curves big and contrast low. Nothing makes them truly round.
- **Dev maps draw smooth ground** (`setSmoothTerrain`, in `GameClient`): colours run across tiles rather than
  filling each one flat. Real maps don't, so a dev map's ground looks softer than theirs.
- **Keep noise big on edges.** A field's edge is only as smooth as the field: use `createNoise(seed, 1)` or
  `2` with features at least a dozen tiles across, and `smoothField` it. Bumps under about 3 tiles can't draw.
- **Shallow edges still step.** A line a tile side can't hold has to jump a corner or a middle at a time, so a
  nearly straight shore has small kinks a few tiles apart. Real shores have them too.
- **Squares must be free.** Nothing in the cache uses x 70-99, y 100-130, and the map manager stops at x 100,
  y 200. Each recipe needs its own.
- **A loc on a scene's outermost tile is skipped.** It doesn't matter inside a grid, but don't stand
  anything on the outer edge of one.
- **Updating the game's cache can change a prefab**, because a prefab is coordinates into the real world.
  Check them when `GAME_CACHE_NAME` changes.
- **Browser memory:** headless runs must filter the base bake, as `~/tools/pw/rs-terrain.mjs` does.
- **"Sector index id mismatch" in the browser** means an aborted cache download, usually Vite's first-run
  reload. Delete the browser profile and try again.

## The slim cache

The hosted game's cache only holds what the game reads, found by loading every map in `ALL_MAPS`
(`scripts/cache/slim-cache.ts`). Don't run `npm run slim-cache` as part of a change: it's done when
deploying. To ship a map:

- **A fixed map or a fixed seed:** make it a real entry in `ALL_MAPS`, and say so in the pull request.
  `slim-cache.ts` installs ScapeRune maps as it goes, so their locs, textures and prefab sources get kept.
- **A different seed each run:** seeds read different things, so a sample map isn't enough. Put
  `PALETTE_RECIPE` in `ALL_MAPS` too, as it holds all the generator can use, and hide it from the map list.
  Run-time seeds also need a way to pass the seed in (recipes are a fixed list today).
- **If you add to `BIOMES` or `PREFABS`,** run `npx tsx scripts/scaperune/check-palette.ts`. It fails if a
  generated map reads something the palette doesn't. `palette.ts` picks new entries up by itself.

Terrain and locs live in our code, so they add nothing to the slim cache. Only what they point at does.

Minimap images aren't saved for custom squares, since a saved image is found by square alone and would
outlive a change to the map.
