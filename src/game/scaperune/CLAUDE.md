# ScapeRune

ScapeRune makes maps that don't exist in OSRS: our own ground, heights, water and paths, with real
cache objects and buildings on top. It's self-contained: everything is in this folder, and nothing
outside it needs changing to make a map.

**Most maps here are dev maps.** Those are in `maps/devMaps.ts`, and only show on the dev server (or with
`DEV_MAPS=1` in a script). A run on one doesn't touch the save. A build leaves them and the map generator's screen
out completely: `vite.config.ts` swaps `devMaps.ts` and `MapGeneratorScreen.tsx` for the `.build` stand-ins beside
them, so the generator's code doesn't reach players. If the game starts importing something new from either file,
add it to the stand-in too. A map that ships is listed in
`maps/shippedMaps.ts` and has a real entry in `MAPS` with `scaperune: true`: see "Shipping a map" below.

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
| `prefabs.ts`     | the named rectangles: buildings from all over the world                                                   |
| `biomes.ts`      | what each kind of ground is made of, and its rock                                                         |
| `catalogue.ts`   | locs that read wrong outside what they were built for                                                     |
| `dress.ts`       | rock's colour and what's on it, and the small things on all the ground                                    |
| `floorKits.ts`   | what real ground has on it, by floor                                                                      |
| `generator.ts`   | the random generator: the order things happen, scatter, reachability                                      |
| `mapBuild.ts`    | what's kept while a map's built, and what its parts share                                                 |
| `rivers.ts`      | rivers, lakes and the sea: where they go, how high they stand                                             |
| `mountains.ts`   | passes, what can be walked, rock, snow, caves, lava                                                       |
| `roads.ts`       | roads and bridges                                                                                         |
| `settlements.ts` | where buildings go, and their plots                                                                       |
| `townPlan.ts`    | towns laid out from the middle: a square, streets, buildings facing them                                  |
| `vignettes.ts`   | small groups of things against a building's walls                                                         |
| `structures.ts`  | set pieces, wrecks and drowned towns, town walls, waymarkers                                              |
| `falls.ts`       | waterfalls off cliffs, with their pools                                                                   |
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
Reset, Randomize (rolls every setting that shapes the map, within its limits, but keeps the size, heightmap, start and
waves), copying and pasting the settings as JSON, Generate with a preview from above, and Play. It's temporary,
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
`PREFABS` and `BRIDGES`); nothing is baked to a file.

What it does, in order: the land's shape (`landforms.ts`), rivers down its valleys, sea and lakes, cliffs, passes,
floors, bridges, main roads, buildings with their roads, set pieces, ruins, pools for waterfalls, town squares, then the
heights are finished (`gradeRoads`, `settle`), what's too steep is blocked, then rock, the falls, what's on the rock, the
boundary, town walls, waymarkers, what stands in water, scatter, reachability, and last the ground's dressing. Anything it
can't connect gets blocked (see below).

**Boundaries.** Only `sea` makes an island. With the others, land runs on past the arena on all sides, scattered
out to the edge of the margin, so the world looks like it carries on. The arena's edge is still what stops you,
so each one puts something there: `forest` a thick belt of trees either side of it, `hills` ground rising away
with a line of rock heaps on it, `fence` a fence `boundaryDepth` tiles in, with gaps where roads go through,
`mountains` a ring of rock rising from `boundaryDepth` tiles in.

## Biomes

Each is an entry in `BIOMES` (`biomes.ts`): its ground, water, trees, scatter, big props, buildings, set pieces, fence,
town wall, waymarker and rock. There's a preset that shows each one off, and a dev map, `scaperune_<id>`, 2 squares a side.

| Biome       | From                                        | Buildings                         | Set pieces                                       |
| ----------- | ------------------------------------------- | --------------------------------- | ------------------------------------------------ |
| `meadow`    | Lumbridge                                   | Lumbridge, Varrock                | stone circle, redwoods, hedge maze, fort, wrecks |
| `desert`    | Kharidian Desert                            | Al Kharid, Pollnivneach, Sophanem | sandstone circle, great skeleton, fort, wrecks   |
| `swamp`     | Lumbridge Swamp, Morytania                  | Canifis, Burgh de Rott            | toadstools, mushroom grove, great tree           |
| `snow`      | Trollweiss, with ice from the north seas    | Rellekka                          | longship, stone circle, fort                     |
| `jungle`    | Karamja, Varlamore's stumps                 | Tai Bwo Wannai                    | great stumps, idol, wrecks                       |
| `tropical`  | the Sailing islands                         | Ape Atoll, Tai Bwo Wannai         | great skeleton, wrecks                           |
| `ash`       | Fossil Island, the Wilderness. Water's lava | Lovakengj, Shayzien               | craters, black crystal                           |
| `autumn`    | maples, on gold ground                      | Hosidius, Shayzien                | redwoods, stone circle, hedge maze, fort         |
| `deadlands` | Morytania past the Salve                    | Darkmeyer, Burgh de Rott          | graveyard, Blisterwood tree, dark crystal, fort  |
| `elven`     | Tirannwn, Prifddinas's crystal              | Prifddinas                        | crystal, crystal field, drowned town             |
| `fairy`     | Zanaris. Nothing's built                    | none, ruins only                  | giant mushroom, mushroom grove, toadstools       |
| `darkwood`  | the Darkwood                                | Darkmeyer                         | dark crystal, great tree, black trees            |
| `astral`    | nowhere: land over the stars                | Prifddinas                        | crystal, stone circle, hedge maze                |

To add one: find what a place is made of with the tools below, give it an entry, a preset and a line in `SWEEP`
(`check-maps.ts`), add it to `GENERATED` in `maps/devMaps.ts`, and look at it. The palette picks it up.

**Mixed maps.** `biomeAt` says what's where, and roads, rock and lava go tile by tile. Water doesn't: a step in its colour
would show as a line across it, so each piece of water is the kind of the biome most of it's in. What's scattered uses
`biomeNear`, which frays the line between two biomes by about 8 tiles, so that woods run into each other.

**Chasms.** A biome with `chasm` has a drop for a sea. The ground comes down in `CHASM_EDGE` tiles rather than `SHORE_REACH`,
so its edge is a cliff, and the "water" is overlay 39, the Cosmic Plane's stars. `hasRelief` is true for these, so all the
rock logic runs on the edge. Fords can't cross it, so anything the sea cuts off is blocked and only looked at, and that
can leave too little to play on: a river cuts the land in two for good, and its water's stars too, so `Sky islands` has
none.

**Finding what a place is made of**, all without a browser:

```sh
npx tsx scripts/scaperune/world-index.ts world.json         # every square's locs and floors, once
npx tsx scripts/scaperune/loc-sheet.ts out.png 1276 1241:22 # draws locs, about as the play camera sees them
npx tsx scripts/scaperune/loc-sheet.ts out.png 3243,3244,6,5 # draws a rectangle of the world from above
npx tsx scripts/scaperune/find-buildings.ts 50 50 51 50     # whole buildings in a block of squares
```

The index is JSON: a few lines of anything will list a region's commonest locs, which is the quick way to choose. A loc's
name is often `null`, so look at them. Sheets are close, not exact: textures are their average colour, and big things are
scaled to fit.

Things worth knowing about in the cache, found this way: `58541` to `58543`, palms; `40754`, a bright orange maple; `40788` on, the Darkwood's trees; `60467` to `60479`,
wrecks made for the sea; `43129` to `43131`, mushroom trees up to 9 tiles across; `48327`, a sunken steeple; `59324`, a skeleton
7 tiles long; `27878` and `27879`, crystals 5 across; `60404` and `60405`, ice; `60390` to `60399`, flat blue ice.

Floors that are more than a colour, for small patches only: overlay `20` grey stone, `32` dark rock, `12` cobbles, `39` stars on black, `52`
planks, `174` flagstones, `196` ice, `84` sandstone. Overlay `42` isn't drawn at all, as in caves. `floors` of the Darkwood
(629 on) couldn't be read by the overlay loader in Node, so its road's an older one.

## Set pieces

`SET_PIECES` in `structures.ts`, named in a biome's `landmarks`. There's `landmarks` to say how many. The kinds:

- `single`, one big loc. `ring`, stones round a circle. `grove`, a loose crowd. `rows`, as in a graveyard.
- `maze`, hedges a tile thick round corridors 3 wide: a tree of corridors with a fifth of its walls knocked through and a
  way in on each side, because a crowd has to fit and it shouldn't be a trap. `fort`, the biome's wall round a yard, with
  a gate on each side.
- `wreck`, in the water near a shore. `sunken`, a steeple in deep water with pillars round it: they're only placed if
  all of their tiles are water, so there's none on a map without a lake or sea big enough.

On land they stand on plots as buildings do (`fitsBuilding`, `pinPlot`), since a big loc on a slope shows its underside, and
`check-maps.ts` holds them to it. Big locs aren't contoured unless their definition says so.

**Town walls.** `townWalls` is the share of towns with one. It's a rectangle a little way out from a town's buildings, open
where roads go through and with a gate on each side, in the biome's `wall`, and inside it roads are cobbled and there's a
square with a fountain unless it's been laid out with one. A wall loc is a thin thing on a tile's side, so it costs nothing, and reachability needs no help.

**Towns** are laid out from the middle (`planTown`), when there are roads to have streets: a market with a well and stalls and a
street off each side of its square, a long axis, or a hamlet on a lane, by how many buildings it wants. Buildings stand along
the square and the streets, facing them, 3 to 5 tiles apart with the biggest on the square, and many have a fenced yard behind.
Each has a step of road to the street, so the rule about doors and roads holds. What doesn't fit goes on the loose ground
round the town as before, and trees come back over 32 tiles past its paved core (`getTownFade`). A town keeps to one family of
prefabs, by the start of their names, and its fence goes with them (`KIT_FENCES`). `Walled city` is the preset for a big one, and
`scaperune_town` is the dev map.

**Sites.** A real region's settlements are about 50 tiles apart, mostly hamlets, with quiet land between them. `getSites` picks
places that far apart, `sites` being how many. With no `towns` asked for, a map's buildings gather in hamlets at the first of them,
landmarks take the rest, and scatter goes by `getPace`: more near a site and less between them. Roads get a stone every 40 tiles.
A town's `towns` setting still works as before, with sites spaced round its towns.

**Vignettes** are one or two small groups a building, against a wall without a door, of what its biome's towns really have.

**Waymarkers** stand beside roads, turn about, every 16 tiles at 1.

**The game fades the world to black past the arena's edge**, over 6 tiles (`playAreaFog`). Real maps keep that. It
would hide all of the above, so `GameClient` moves it out by `OPEN_WORLD_MARGIN` on dev maps and on maps with
`MapDef.scaperune`. The minimap still only covers the arena, so it's black past the edge.

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
waves. `play` takes the waves, enemy density and brightness from a real map, and `mapDef` goes over the `MapDef` itself:
its name, description, icon, difficulty, waves and events. Leave `fun` set, because `startRun` quietly does nothing on a
map that isn't open, and dev maps are only open for being fun maps. That also means they're endless, so one with its own
waves needs a boss in `fun`, and `paced()` needs exactly 15 wave sets. In the browser console:
`game.selectMap("scaperune_little_island"); await game.startRun()`.

`check-maps.ts` skips a hand-made map unless it has a `detail`, which builds it as a `GeneratedMap`. It only checks a road's
grade or a landmark's ground if `detail` passes them on, so `steepest road 0.0` or `0 landmarks` means unchecked.

Three maps are whole worked examples, each going further than this one:

- `maps/vardhelm.ts`: land carved by hand from a massif, a road up a cliff in hairpins, and prefabs of its own.
- `maps/kaluasWake.ts`: coasts drawn as splines, a `Build` of its own with the generator's parts run in its order, sea
  bridges and a raised village.
- `maps/shatteredRealm.ts`: land over a void, its own waves, events and bosses, and terrain as architecture.

`createBuild`, `paintFloors`, `scatter` and `connectGround` are private to the generator, and `paintRock`,
`blockSteepGround`, `gradeRoads` and scatter need a `Build`, so a hand-made map copies what it needs. `squaresX` on a
recipe includes the margin, and in `GeneratorSettings` it doesn't.

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

**Dressing.** Real ground isn't bare: 26 to 39 small things per 100 tiles over whole regions, and 23 to 96 on roads.
`dressGround` runs last, on a seed of its own, and puts down what the floor underfoot has in the real world (`FLOOR_KITS`,
keyed `o14` for an overlay and `u48` for an underlay), falling back on a biome's `decor` on floors the world doesn't use.
It's all type 22 with a `clipType` other than 1, so that it can't block. `dressing` is its setting. Land beside water gets
stones, and fresh water beside land gets reeds. A hand-made map should paint rock with `paintRockFloor`, call `dressRock` on it,
and call `dressGround` last.

**The catalogue.** `BANNED_LOCS` in `catalogue.ts` is a list by hand, not a rule, because plenty of good outdoor locs are
never placed on the surface. It holds boss arena floors, set pieces of ruins from instances, and sea rocks on land.
`check-maps.ts` fails a map with any of them, and with blood that draws nothing or foam away from a fall. Shipped maps aren't
held to it.

## Height

Height's a layer of its own while a map's built: `Terrain` holds a float per corner, and only the finished heights go
into the grid. Nothing in the generator writes heights directly. Whatever needs the ground to be a certain height **pins** it, and
`settle` brings the ground round it to meet that, cutting and building no steeper than `SETTLE_SLOPE` of what's
walkable. That one idea does cuttings, embankments, plots and the ground round bridges. On a tie between two pins,
the first one stays, so a late pin can quietly lose. A pin also beats a held corner.

**Two things decide whether a loc is safe to use**, and `model-bounds.ts` in `scripts/scaperune/research/` prints both:
whether it's contoured (`contouredGround` is 0 or more), so that it bends to the ground, and how far its model reaches, which
a footprint says nothing about. Nearly all real ground decoration is contoured, as are most walls. What isn't stands level,
and shows its underside on the low side of a slope. Check a new loc with that and with `where.ts`, then run `trap-scan.ts`
and `measure.ts` on the map.

**The limits, measured:**

| What            | Number                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| A height        | 0 to 255, one byte, a step of 8 scene units. 1 reads as 0.                                                   |
| Tallest ground  | 255 is 2040 scene units, 16 tiles. Real peaks use it (Trollheim, Cam Torum)                                  |
| What gets drawn | `MapManager` culls squares with a box 18.75 tiles up: all of it fits                                         |
| Real slopes     | 99.96% of tiles are 80 a tile or under; `getTileSlope` measures, and `STEEPEST_FACE` caps ours at 72         |
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

**Faces.** `finishHeights` takes the tops off anything over `STEEPEST_FACE` in any direction (`limitFaces`), and brings
ground up to a corner held high (`liftFaces`). Only what can't move is left over the bar: a bridge's own heights, a fall in
a river, and a road pinned where it meets water.

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

**Bridges** stand with their banks `bankHeight` over the water (a prefab's river bed is at 0), pinned from the prefab's own
heights, because the deck's stored relative to the ground under it. There are three in `BRIDGES`, and a biome names one:
Lumbridge's stone, its twin in Tirannwn with elven lamps, and Varlamore's red timber. They can stand in for each other
because all of them have an 11 tile deck, 2 wide, at the same place in an 18 by 6 rectangle. There are dozens of other bridges
in the cache, but with their own banks: most run into cliffs or are flat with the water, and a few end in blocked tiles.

**Buildings** stand on a flat plot (`pinPlot`) with a level step out of the door. They only go where the ground rises
less than `MAX_PLOT_RISE` over the plot, away from cliffs and with room to get down to water, and where their road can
reach what it joins at a walkable grade.

**Actors on slopes.** On dev maps `getHeight` follows the triangles a tile's drawn with (`ArenaGrid.exactGround`), since
easing across a tile can be 0.4 tiles out on a steep one, and anything with a radius over a tile is lifted part of the way
to the highest ground under it (`groundUnder`).

### Rock

Real rock is plain colour with small things on it, and it stops at the cliff: the walkable tile beside a face is
ordinary ground. Land textures are rare in the world (overlay 20 covers 562 tiles of the whole surface), so biomes paint
rock in flat colour: `83`, `3`, `2`, `99`, `115`, `102`, `14`. `RockDef` in `biomes.ts` says what a biome's made of, and
`dress.ts` does the work:

- `paintRockFloor` paints rock's overlay on rock tiles only. `paintOverlay` smooths outward onto the walkable ground,
  which is what made the hard band at a cliff's foot, so don't use that for rock.
- `dressRock` runs last, on blocked ground only, so nothing it does changes where you walk: pebbles on 40% of tiles, low
  2 by 2 heaps on a third of tiles over 16 a tile (`rubble`), and with `facets`, a full tile of contoured rock on everything
  within 3 tiles of a face. The heaps and facets are the `rockFaces` setting's share. Facets only work as a carpet on their
  own dark overlay, as at Karuulm: anywhere else they read as shards.
- Every kit is contoured, so it follows the ground. Sea rocks (`60436` to `60444`) aren't, and sink 3.5 tiles: they're
  on the ban list (`catalogue.ts`) unless they stand in water.

Above the snow line cliffs have no overlay, and `SNOW_ROCK` dresses them.

A dark underlay bleeds a long way into white (11 tiles), which is where snow's dark smears came from, so `snow` has a pale
`ground` (underlay 16).

`scaperune_rocksheet` is a screen of each biome's rock, as the generator dresses it. `scaperune_cliffs` shows single locs
on a steep band.

| Locs                                                                   | What                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 34384, 34372, 42352 (type 10)                                          | full tile rock: near-black green, olive, black. Dark floors only           |
| 42097, 42098, 6617, 52795, 48627, 57476 (type 22)                      | flat patterned decals: brown, tan, maroon, green. They look like brickwork |
| 34385, 34388, 34391, 34392, 42353 (type 10)                            | broken facets, for the edges of a carpet                                   |
| 53538 (wall), 53543 (diagonal)                                         | snow on a wall; ice shards, which look terrible                            |
| Rockslide 11434 grey, 11922 white, 18894 amber, 11933 dark, 3718 mossy | heaps of rock, 2 by 2, 174 triangles, 0.3 tiles tall                       |
| 3709, 3703, 11439, 336, 14483, 5328 (type 22)                          | pebbles, 18 triangles                                                      |

**Waterfalls.** Rivers gather their fall into single drops at least `WATERFALL_SPACING` apart, with foam across the river.
Most don't fall far in the arena, because they look for the low ground, so these are rare and mostly in the margin. What
you'll see are `cliffFalls` (`falls.ts`): loc 51484, from Varlamore, on a cliff that faces the camera, into a pool made for
it. That loc's contoured, so it climbs whatever's behind it and fits any cliff of 28 units or more, though it only covers
about 3 tiles from its foot, so a taller cliff stays bare above that. The pool's made
before the heights settle, because it needs level corners, and the cliff behind it is held meanwhile, or the pool would
cut it back. It's let go before `limitNorthFaces`, or that can't do its job round it.

**Caves** are decoration: a mouth 3 by 2 tiles at rotation 0 (facing south), set into the foot of a cliff that faces the
camera. Nothing goes in them. They're on tiles that are blocked anyway.

**Tried and dropped:** deeper water away from shores, with overlays 448 to 454. A tile can only hold one, so each band's edge
is a staircase of whole tiles, and it looked like one. A rope bridge over a gorge. The cache's (21509, on Neitiznot) is a thin wall loc with no deck, so
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
Water overlays: 6 and 442 (rivers and sea), 7 (swamp), 19 (lava). There's no water plane: water's drawn at the height of
its tiles' corners, so keep them level, and bring heights near water down to it over a few tiles (`distanceTo` gives
you the distance).

## Prefabs

There's no building entity in the cache. A building is its locs and floor tiles, so a prefab is a
rectangle of the real world.

1. **Find one.** `find-buildings.ts` finds whole buildings in a block of squares, and `loc-sheet.ts` draws what it finds.
   `npx tsx scripts/scaperune/find-prefabs.ts 50 50` draws map square 50,50 as text with
   world coordinates down the side. Pick a rectangle that holds the whole building and nothing else.
2. **Name it** in `PREFABS` (`prefabs.ts`): its south-west corner and size, in world tiles. The rectangle must
   take in every wall of the building, with nothing else in it. A rectangle a row short loses that wall, and the
   floor behind it with it.
3. **Check it**: `npx tsx scripts/scaperune/check-prefabs.ts`. It walks the walls of every prefab in every
   rotation and fails if a wall's cut off, floor is lost indoors, or there's no way out. Then look at it:
   `scaperune_prefabs` is a dev map with all of them in all 4 rotations.
4. **Stamp it**: `kit.stamp(ground, name, turns, x, y)` on a `PrefabKit` stands it on flat ground with its doors off,
   and `kit.stampRuin` leaves most of it gone. `new PrefabKit(context, MY_PREFABS)` lets a map bring its own, which
   the generator won't pick and `check-prefabs.ts` won't check. For anything else,
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
3. **In the browser**, because tests don't cover how things look. Use `~/tools/pw/rs-height.mjs` (pass a distance of 18,
   or it shoots from further out than the play camera), or `game.selectMap(id); await game.startRun()` in the console. Look at it side-on too, with a lower
   `game.cameraRig.pitch`: from above, hills barely show.
4. **Tests**: `npx vitest run src/game/scaperune`.
5. **A bot run** shows it plays at all: `DEV_MAPS=1 MAP=scaperune_oasis npx tsx scripts/game/simulate-run.ts wizard 1`.

`check-maps.ts` also holds every map but shipped ones to how it looks (`checkLook`), with the same measures the real world
was read with: decoration on land and roads, the steepest tile, no textures on rock, what stands on steep ground, rock and
decoration at a cliff's foot, and how far you can see. It prints a line a map of what's only worth knowing, like objects a
screen.

The generator guarantees reachability: it floods from the spawn over the same collision the game uses,
lays a ford across anything big that's cut off, and blocks whatever's left. A hand-made recipe has no such
check, so use `findReachable` and `findStranded` from `collision.ts`, or `preview.ts`.

**`0 stranded` proves nothing if the recipe blocks what's cut off.** A whole island sealed off still passes, as nothing
open is left stranded: one map lost 4,964 tiles that way. Have the recipe count what it blocks and throw over a limit.
`placeBridges` also skips a bridge that doesn't fit without saying so, and needs about 11 tiles of straight land each side
and a crossing of 9, so count what comes back.

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
- **Round buildings have empty corners.** Their plot's a rectangle but only what's inside the walls is reserved, so
  `fitsBuilding` looks at plots as well, or one plot lands on another's corner and a building ends up on a slope.
- **Ruins have no floor.** A floor with half its walls gone is a slab with nothing round it.
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
- **ScapeRune maps draw smooth ground** (`setSmoothTerrain`, in `GameClient`): colours run across tiles rather than
  filling each one flat. Maps from the real world don't, so ours look softer than theirs.
- **Keep noise big on edges.** A field's edge is only as smooth as the field: use `createNoise(seed, 1)` or
  `2` with features at least a dozen tiles across, and `smoothField` it. Bumps under about 3 tiles can't draw.
- **Shallow edges still step.** A line a tile side can't hold has to jump a corner or a middle at a time, so a
  nearly straight shore has small kinks a few tiles apart. Real shores have them too.
- **Squares must be free.** Nothing in the cache uses x 70-99, y 66-199, and the map manager stops at x 100,
  y 200. Each recipe needs its own: dev maps sit in y 72-131 (see `devMaps.ts` and each map's `mapX`, `mapY`), and the
  map generator's screen has x 70-99 from y 134 on.
- **A loc on a scene's outermost tile is skipped.** It doesn't matter inside a grid, but don't stand
  anything on the outer edge of one.
- **Updating the game's cache can change a prefab**, because a prefab is coordinates into the real world.
  Check them when `GAME_CACHE_NAME` changes.
- **Browser memory:** enemies bake per map whatever you do, and filtering the base bake saved nothing measurable when
  three maps were built in October 2026, so expect 1.85-2 GB at peak with or without it.
- **`paintField` and `ground.place` reserve tiles,** so a later `isClear` quietly drops whatever you meant to put there,
  and trees stop fitting round decor. Unpainted paths aren't reserved, so trees grow on them.
- **Fields painted separately leave a seam along their join.** A tile holds one overlay: merge them into one field first.
- **"Sector index id mismatch" in the browser** means an aborted cache download, usually Vite's first-run
  reload. Delete the browser profile and try again.

## Shipping a map

Hallowed Night (`maps/hallowedNight.ts`) is the worked example.

- List the recipe in `maps/shippedMaps.ts`. `getRecipe` and `check-maps` read that list. `check-maps` only picks
  up ids in it or starting `scaperune_`.
- Add a real entry to `MAPS` with `scaperune: true`. That flag gives it what `dev` gives a dev map: smooth ground,
  the open world, the camera ease and collision rebuilt each time.
- `seasonal: true` keeps it out of the campaign chain and opens it from the start. Without that, adding to `MAPS`
  trips the unlock chain, difficulty order and unique enemies tests.
- A recipe only writes a loc's id, type and rotation. To scale a model, give a loc nothing else uses a new model
  and size in `src/rs/config/loctype/LocOverrides.ts`. Check the world index first.
- `bossArena` on the `MapDef` gives a phased boss a square of its own. The player's brought to its middle and
  can't leave while the boss is up. Without it, her totems are in the corners of the whole map.
- Blending brown soil into blue ground goes through green, so give a soil underlay low saturation. Thin overlay
  lines vanish through `smoothField`.
- Editing `src` while a browser job runs reloads its page through Vite and kills the job.

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
