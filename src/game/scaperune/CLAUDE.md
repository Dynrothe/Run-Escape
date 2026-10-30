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

| File           | What                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `recipe.ts`    | `MapRecipe`, `BuildContext`                                            |
| `Ground.ts`    | a map being built: paint overlays, stamp prefabs, place locs           |
| `format.ts`    | the tile grid, and reading and writing both file formats               |
| `prefab.ts`    | cut a rectangle out of the real world, turn it                         |
| `prefabs.ts`   | the named rectangles, a starter set                                    |
| `biomes.ts`    | what each kind of ground is made of                                    |
| `generator.ts` | the random generator                                                   |
| `collision.ts` | collision from a grid, reachability                                    |
| `paths.ts`     | cheapest path, for roads and fords                                     |
| `noise.ts`     | seeded random numbers and noise, distance to a mask                    |
| `palette.ts`   | everything the generator can use, on one map                           |
| `squares.ts`   | turns a recipe into squares, and installs them                         |
| `maps/`        | the maps: `devMaps.ts` lists them, `terrainTest.ts` is a hand-made one |

## The map generator screen (temporary)

On the dev server the title screen has a **Map generator** button: every `GeneratorSettings` property,
Generate with a preview from above, and Play. It's temporary, there to try settings, so it's built to
delete: remove `MapGeneratorScreen.tsx`, its CSS and `generatedMap.ts`, then the `MapGeneratorButton`
line in `ui/GameUi.tsx` and `setGeneratedMap` in `content/maps.ts`. A production build never shows it.

Every Generate replaces one map, `scaperune_generated`, at fixed map squares. `installGeneratedMap`
replaces whatever kept the old one: the squares on the main thread and in the workers, the renderer's
loaded squares, the map images and the cached collision. A load still on its way for the old squares is
dropped (`MapViewer.customMapVersion`). If you add anything else that's kept per map, clear it there.

**Runs on any map here, dev maps included, leave the save alone**: `MapDef.dev`, checked in `recordRun`.

## Making a map with the generator

Add a line to `SCAPERUNE_DEV_MAPS` in `maps/devMaps.ts`. Only `seed` is required; the rest come from
`DEFAULT_SETTINGS` (`GeneratorSettings` in `generator.ts` says what each does):

```ts
generatedRecipe("scaperune_oasis", 71, 110, {
    seed: 42,
    biome: "desert", // meadow, desert, swamp, snow
    squares: 2, // arena size: 1, 2 or 3 map squares a side
    island: 0, // 0 land past the edge; up to 1, a small island
    rivers: 1, // 0, 1 or 2
    ponds: 3,
    hills: 0.3,
    roads: 0.8,
    buildings: 0.5,
    trees: 0.2,
    rocks: 0.6,
}),
```

The same seed and settings always give the same map. It's generated at load from a fixed palette
(`BIOMES`, `PREFABS` and `BRIDGE`); nothing is baked to a file.

What it does, in order: rivers, sea and ponds, heights, floors, bridges, buildings, roads, scatter, then
reachability. Anything it can't connect gets blocked (see below).

Preview it from above, without a browser. This draws it with the game's own minimap renderer and checks
it with the game's real collision:

```sh
npx tsx scripts/scaperune/preview.ts out.png map=scaperune_oasis
npx tsx scripts/scaperune/preview.ts out.png seed=7 biome=snow rivers=2 island=0.5
```

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
  for hand-made shapes, but the edges follow the tiles more.
- **Why fields:** an edge can only cross a tile side at a corner or at its middle, and adjacent tiles share
  those points. So `shapes.ts` picks each tile's shape from which of its eight half sides are covered, and
  edges join up. Picking shapes from whole tiles can't do that: a line ending at a corner next to one
  ending at a side's middle makes a tooth. Don't use shape 11: it dips to both corners, so a row of them is
  a row of teeth.
- **Ids are as the map files store them, the cache's id plus one.** `find-prefabs.ts` prints them this way,
  so copy from there.
- **Heights** are one byte per tile corner, going up, 8 scene units each. A tile is 128 units across, so 16
  a tile is 45°. Real surface ground stays between about 0 and 80. `setHeight` rounds and clamps for you.
- Look at what a kind of ground is made of with `find-prefabs.ts` on a real square, then use those ids.
  That's how `biomes.ts` was made.

## Water

Paint it with an overlay and `blocked: true`. The blocked flag is what stops you, not the overlay.
Water overlays: 6 and 442 (rivers and sea), 7 (swamp). Sink the ground under it, or at least level it:
heights near water should come down to the bed over a few tiles (`distanceTo` gives you the distance).

## Prefabs

There's no building entity in the cache. A building is its locs and floor tiles, so a prefab is a
rectangle of the real world.

1. **Find one.** `npx tsx scripts/scaperune/find-prefabs.ts 50 50` draws map square 50,50 as text with
   world coordinates down the side. Pick a rectangle that holds the whole building and nothing else.
2. **Name it** in `PREFABS` (`prefabs.ts`): its south-west corner and size, in world tiles.
3. **Stamp it**: `ground.stamp(rotatePrefab(loadPrefab(context, def), turns, locs), x, y, options)`.

`stamp` options:

- `floor`: `"footprint"` keeps our ground and takes only the tiles with an overlay. Use this for buildings:
  there's no edge to see. `"all"` takes the whole rectangle, which rarely looks right. A function picks which
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
- **Enemies only path 48 tiles.** The flow field's window is 96 tiles across (`FLOW_FIELD_SIZE` in
  `Sim.ts`), so keep river crossings closer than that to wherever the fight is, or enemies on the far side
  stand at the bank.
- **`spawn` must be open**, and it has to be known without building the map, because the game needs it
  first. The generator keeps the middle of the arena clear for this.
- **`Math.random` breaks everything.** A recipe runs again on every load and in every script. Use
  `createRng` and `createNoise`. If you add a call to `rng()` early on, every later roll changes, and
  so does the map.
- **One plane is drawn.** The game hides everything above the arena's plane, so roofs and upper floors vanish,
  as on real maps. Bridges still draw: their deck is on level 1 with a flag on level 1's tiles.
- **Doors are closed.** A stamped building with a door has a sealed inside unless you drop the door.
- **Cuts clip things.** A wall on a rectangle's edge can belong to the tile outside it. Check the
  building's collision came through.
- **Cliffs are weak.** Steep blocked tiles with a rock overlay collide, but look like a grey ramp. Real
  mountains use wall-type rock locs along their edges (14622-14626 and others).
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
