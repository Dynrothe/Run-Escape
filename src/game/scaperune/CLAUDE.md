# ScapeRune

ScapeRune makes maps that don't exist in OSRS: our own ground, heights, water and paths, with real
cache objects and buildings on top. It's self-contained: everything is in this folder, and nothing
outside it needs changing to make a map.

| You want                                          | Go to                                                        |
| ------------------------------------------------- | ------------------------------------------------------------ |
| To know what makes a map good                     | [Designing a map](#designing-a-map)                          |
| To know which setting or function to use          | [Building it, step by step](#building-it-step-by-step)       |
| To know whether it worked, and what to do if not  | [Checking a map](#checking-a-map)                            |
| Not to spend a round finding out it can't be done | [What the engine can't do yet](#what-the-engine-cant-do-yet) |
| Everything else                                   | [Reference](#reference), then [Traps](#traps)                |

**Most maps here are dev maps.** Those are in `maps/devMaps.ts`, and only show on the dev server (or with
`DEV_MAPS=1` in a script). A run on one doesn't touch the save. A build leaves them and the map generator's screen
out completely: `vite.config.ts` swaps `devMaps.ts` and `MapGeneratorScreen.tsx` for the `.build` stand-ins beside
them, so the generator's code doesn't reach players. If the game starts importing something new from either file,
add it to the stand-in too. A map that ships is listed in `maps/shippedMaps.ts` and has a real entry in `MAPS` with
`scaperune: true`: see [Shipping a map](#shipping-a-map).

## Designing a map

Design before settings. Noise and scatter on their own give even ground where every screen looks like the last, with
nowhere to arrive at, and a map like that can pass every reachability check and still look awful.

The numbers here are measured from the real world with the same code that measures our maps: all 935 populated surface
squares, and 15 rectangles of real places. The scripts and results are in `scripts/scaperune/research/`. The write-up,
with sources, is `~/assistant/plans/scaperune-design-research.md` on the team's VM.

### Plan it first

Write this down before touching a setting:

1. **The one idea.** What makes this map that map. Hosidius is a market, Piscarilius is boardwalks, Lovakengj is
   furnaces, the Farming Guild is a glasshouse. None of those is a big object. Each is a way things are put together.
2. **The size, and keep it small.** 192 tiles a side is about four hamlets a side, or one town and its country. Jagex's
   own verdict on the first Zeah was that it was bloated, and the cure for Kourend feeling vast but empty was density.
   20 buildings over 192 by 256 tiles is that same mistake.
3. **The places**, about 50 tiles apart, most of them hamlets of one to three buildings, and one or two that matter.
4. **The way through.** Roads join the places. Something should be near any road: about 8 tiles at the median in the
   real world, 16 to 40 at p90, and never much past 80.
5. **Where it's quiet.** Quiet land is part of the plan, not what's left over.

### Pacing: contrast, not evenness

A screen is what the play camera sees, about 27 by 16 tiles.

- **Real screens run from nothing to 130 or more objects.** Over whole regions, p10/50/90 is 0-16 / 18-73 / 129-185.
  Aim for about **5/40/130**.
- **Empty is fine.** 5% to 35% of real screens have under 8 standing objects. What's wrong with a made map is usually
  the top end: no dense place to come to. Maps whose screens are all alike are what "poor pacing" means here.
- **Empty still means dressed.** An empty real screen has 110 to 170 small things on the ground. Quiet land has no
  scenery, not no detail.
- **Places are about 50 tiles apart** (49 to 56 at the median, hamlets included). Big towns are 150 to 300 apart, so an
  arena rarely holds two.
- 8% to 20% of walkable 8-tile chunks have a building in them.

### Landmarks: a place is a composition

- **Big locs are almost absent.** 89% to 99.6% of real scenery is 1 or 2 tiles. Size 5 and up: 1 in Hosidius town, 0 in
  Shayzien, 1 in Varrock.
- **A landmark is normal things put together**: a square with a well, a market, a farm with crops and a fence, graves
  among bushes, a shrine on paving. None of it would stand out alone.
- **It goes at the end of a street or in the middle of a square**, where a road brings you to it.
- **One big loc is a rare accent.** It's a player's memory of somewhere else, and a map full of them reads as a museum.

### Towns: tight, with a middle

- **A town has a formal heart and organic edges.** Hosidius: a paved market about 19 by 15 with a well and four stalls, a
  street off each side, then dirt tracks and gardens. Shayzien: one long paved axis. Civitas: stone roads and walled blocks.
  Auburnvale has no paving at all. Both grid and organic are right, on purpose.
- **Tight.** Buildings 3 to 5 tiles apart, 33 to 72 tiles indoors at the median, 10% to 25% of a town's rectangle indoors.
- **Streets** about 8 wide, alleys about 3, squares and main streets about 15.
- **One town, one kit.** 5 to 12 wall ids make up 90% of a new town's walls, and its fences and paths come from the same
  family. Jagex calls these wall kits.
- **Ground is divided up.** 5 to 8.5 free-standing fence walls per 100 tiles in farm towns: yards, pens, fields, gardens.
  Fence groups of things, not each building.
- **Buildings stand on the street, not in a lawn.** 12% to 69% of the two tiles outside their walls is path or paving, and
  doors are a tile or two from a path.
- **Towns are flat.** 76% to 89% of walkable tiles in Hosidius, Shayzien and Civitas.
- **The edge is a fade, not a line.** Over about 32 tiles walls fall away and trees take over. Decoration stays level:
  only the kind of thing changes, not how busy the ground is.
- **What players see is the ground plan.** The game draws one plane, so roofs vanish. Floors, interiors and furniture
  matter more here than in OSRS itself.

### Terrain: flat, then a step

- **Three quarters of real walkable ground is dead flat.** Land is levels joined by short faces and ramps. Noise leaves
  every tile slightly tilted, which reads as a soft blanket.
- **Faces are short and finished.** 2 to 4 tiles deep, 12 to 30 a tile, a drop of 30 to 60, then flat. Median drops are 27
  to 53. A drop past 150 is rare, and a big rise is several faces, not one. 99.96% of real tiles are 80 a tile or under.
- **Steep ground is 4% of the surface.** Hills are low: Lumbridge's fields run from 0 to 80.
- **A plateau is flat on top**, and the ground past a face is often flat within 2 units.
- **Paths are flatter still**: median slope 0 to 2, p90 1 to 7.
- **The camera decides what reads as height.** It looks north from high up, so a mountain's something you walk under, not
  something you see. Light, cliffs and ledges a dozen tiles across are what read, and only faces looking south are seen.

A real cliff is one of four things:

| Kind       | What it is                                                              | Where              | How to make one                                                            |
| ---------- | ----------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| Massif     | Rough heights, plain colour, pebbles on most tiles, no big locs         | Trollheim          | `rockFaces: 0`, or `share: 0` in `dressRock`                               |
| Ledge      | A steep band of plain colour, heaps on 30% to 50% of tiles, and pebbles | Auburnvale, Kebos  | The default: `rockFaces: 1` with `terraces`                                |
| Carpet     | A contoured facet on every tile, on their own near-black floor          | Karuulm, Lovakengj | A biome with `facets`: `ash`, `deadlands`, `darkwood`                      |
| Built edge | A drop of 1 to 3 tiles with walls along the top, and no rock            | Falador            | By hand only: see [what the engine can't do](#what-the-engine-cant-do-yet) |

Pick one per place. A line of big objects along a cliff is none of these.

### Ground: flat colour with a carpet on it

- **Paint with flat colour.** Only 10.8% of real land overlay tiles have a texture, and most of those are swamp and lava.
  Overlay 20 covers 562 tiles of the whole surface, 32 covers 143 and cobbles (12) cover 1,249. A texture is a tile's
  accent on a floor a few tiles across. Stretched down a face or over a yard, it turns into bands.
- **Plain overlays to use**: `14` dirt, `83` mountain rock, `22` and `80` sandy paths, `81` paths and docks, `10` town
  paving, `171` Varrock's street stone, `11` dark ground, `115` Karuulm's rock.
- **Dress every tile.** Real land carries 35 to 64 small things per 100 tiles by floor, and paths 30 to 60. It's the largest
  single difference between real and made ground, and it costs nothing in collision.
- **Rock stops at the cliff.** The walkable tile beside a face is ordinary dressed ground. Only 2% to 20% of real tiles at
  a cliff's foot are on an overlay, and they carry 29 to 93 decorations per 100 tiles.
- **Roads say whose they are.** Median width 2 to 4. Paving in a core, dirt out from it, narrow tracks to single houses, and
  pebbles of the same family on the road and its shoulder.
- **Shores are lined**: 26 to 155 locs per 100 edge tiles, in reeds, roots, soil, pebbles and rocks.

### What world objects are for

| Layer             | Loc type        | Real, per 100 tiles | What it's for                                         | Blocks         |
| ----------------- | --------------- | ------------------- | ----------------------------------------------------- | -------------- |
| Ground decoration | 22              | 20 to 65            | The carpet: pebbles and grass, by floor               | Only at clip 1 |
| Soft scenery      | 10, clip 0      | 0 to 9              | Body without blocking: flowers, crops, ferns          | No             |
| Solid scenery     | 10, clip over 0 | 5 to 10 in towns    | Trees (1 to 3), rocks, props, furniture               | Yes            |
| Walls and fences  | 0 to 3          | 4 to 20 in towns    | Divide the ground, close a view, hold a street's edge | A tile's edge  |
| Wall decoration   | 4 to 8          | 0 to 3.6            | Detail that takes no room                             | No             |

- **Things sit against things.** 30% to 58% of a town's props touch a wall, half are in groups, and the groups are kits:
  barrel with crate, table with stools, flowers with bushes, graves with bushes, reeds with lilies. A lone prop looks dropped.
- **If it's on a slope, it's contoured.** A contoured loc bends to the ground. One that isn't stands level, and shows its
  underside on the low side. 92% to 100% of real ground decoration is contoured, and so are all the rock kits.
- **A footprint says nothing about a model.** Sea rocks look like boulders and sink 3.5 tiles. The Tombs of Amascut's floor
  plates stand 6 tiles high. Check a new loc before using it: see [Trying a new loc](#trying-a-new-loc).
- **Use what was made for the open.** Nothing from a raid floor or a boss room. There's no exception for boss arenas.

### The one rule that's ours: density goes in what doesn't block

Real views are 2 to 6 tiles at the median, and a real town's 3 tiles would be a trap here. Run Escape needs room for crowds and
kiting, so this is where we leave the real world. Raise soft density a lot and solid density a little: decoration, wall
decoration, flowers, fence lines and the sides of streets, not more trees and rocks. Keep the view's median at 4 or
more, and about 5 where a crowd fights. Use streets of 7 to 9, and accept alleys as dead-end cover.

## Building it, step by step

**Use the generator unless the map needs a shape it can't make**, like a coast drawn by hand or a road up a cliff in
hairpins. A generated map is one line, and gets every rule below for free. A hand-made map is a recipe of a thousand lines
that has to ask for each of them.

Each step here has what to reach for in both. The settings are all in `SETTINGS` (`settings.ts`), with their limits.

### 1. Squares and size

Generated: add a line to `GENERATED` in `maps/devMaps.ts`, with a map's id, its `mapX`, its settings and its `mapY` (104 if
left out). Only `seed` is required: the rest come from `DEFAULT_SETTINGS`.

```ts
["scaperune_oasis", 78, {
    seed: 42,
    biome: "desert",
    squaresX: 3, // arena size in map squares, each way: 1 to 28
    squaresY: 3,
    boundary: "hills", // what stops you: sea, forest, hills, fence, mountains
    hills: 0.2,
    ponds: 2,
    trees: 0.2,
    roads: 1,
    roadStyle: "ring", // branching, ring, spine
    buildings: 0.8,
    towns: 1,
    landmarks: 0.6,
}, 88],
```

The grid is the arena plus a square of margin each side, so that line takes squares x 78 to 82, y 88 to 92. Nothing
checks that two recipes don't overlap, so look through `devMaps.ts` and each hand-made map's `mapX` and `mapY` first: see
[Squares must be free](#traps).

The same seed and settings always give the same map. It's generated at load from a fixed palette (`BIOMES`, `PREFABS`,
`BRIDGES` and friends), and nothing is baked to a file.

Hand-made: a `MapRecipe` (`recipe.ts`): see [Writing a recipe by hand](#writing-a-recipe-by-hand). `squaresX` on a recipe
includes the margin, and in `GeneratorSettings` it doesn't.

### 2. The land

Work on shapes with `relief.ts`, which takes seconds and no cache:

```sh
npx tsx scripts/scaperune/relief.ts out.png seed=7 mountains=0.6 peakHeight=240
npx tsx scripts/scaperune/relief.ts out.png preset=Alpine seed=3
```

| To get                   | Reach for                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Flat ground              | **Lower `hills` first**, then `flatness`. See below                                                      |
| Short faces, split drops | `terraces` (default 0.75), `terraceHeight` (default 30), and `peakHeight` for how tall it all is         |
| Ranges                   | `mountains`, `peakHeight`, `ridgeScale`, `ruggedness`, `warp`                                            |
| Shapes of land           | `plateaus`, `mesas`, `canyons`, `canyonWidth`, `volcanoes`, and `heightmap` in place of hills and ranges |
| What can be walked       | `walkSlope` stays at 12: it holds 98.1% of real walkable tiles                                           |

What moves flat land, on 2 squares of meadow, by the check's `flat` figure: at `hills` 0.5, `flatness` 0 gives 14%, 0.5 gives
30%, the default 0.75 gives 36% and 1 gives 37%. At `hills` 0.3 it's 42%, or 47% at `flatness` 1. At `hills` 0.15 it's 47%.

Terraces on 3 squares of mountains (`mountains` 0.5, `peakHeight` 170): `terraces` 0 gives a median drop of 63 to 73, 0.75
gives 46 to 48, which is inside the real range, and 1 with `terraceHeight` 24 gives 46 to 53.

Hand-made: heights live in `Terrain` as floats, and things that need a height **pin** it ([Height](#height)). With a `Build`,
`finishHeights` does all the limits. Without one, call `limitNorthFaces`, `limitFaces`, `liftFaces` and `limitNorthFaces`
again from `terrain.ts`, as it does, with 30 and 72 as the limits. `maps/vardhelm.ts` carves from a massif, and
`maps/shatteredRealm.ts` works without a `Build`.

### 3. Water

`rivers`, `riverWidth`, `riverValley`, `lakes`, `ponds`, `waterLevel`, `island`, `shoreRoughness`, `waterfalls`,
`cliffFalls`. Rivers follow the low ground. A shore gets its dressing from `dressGround`, which covers land beside water
and puts reeds in fresh water. Hand-made: see [Water](#water), and [Floors and heights](#floors-and-heights) for painting it.

Bridges want about 11 tiles of straight land each side and a crossing of 9. A river without that gets a ford, and fords
are how the generator joins anything big that's cut off.

### 4. Places

- **Places about 50 tiles apart**: `sites` (default 1). About 1.2 to a map square, 50 from each other and 25 from the spawn.
- **Quiet land between them**: the same setting. `createPace` scatters 2.6 times as much within 14 tiles of a site, and 0.6
  times past 30.
- **Hamlets**: `buildings` with `towns: 0` and `roads` over 0. Buildings gather at the first sites, about 3 to a hamlet.
- **A town**: `towns`, `townSize`, `buildings`, and `roads` over 0.
- **Something to see along a road**: `sites` at 1 gives a stone every 40 tiles, and `waymarkers` at 1 makes that 16.
- **Yards**: `gardens`. A planned town's streets get at least 40% whatever it's set to.
- **A wall round a town**: `townWalls`, only for `towns`. Hamlets never get one.

`buildings` at 1 means 3 buildings a map square. `planTown` picks the kind by how many a town wants, which is what's wanted
over the whole map shared between its towns:

| Kind     | Wanted     | Square          | Streets             | In the middle     |
| -------- | ---------- | --------------- | ------------------- | ----------------- |
| `market` | 10 or more | 19 by 15, paved | 4, 7 wide           | Well and 4 stalls |
| `axis`   | 5 or more  | 11 by 9, paved  | 2 in a line, 7 wide | Well              |
| `hamlet` | Under that | 9 by 9, green   | 2, 4 wide           | Well              |

You can't choose a kind directly. At 10 or more it's a market 60% of the time and an axis otherwise, by the seed, and it
drops to the next kind down if the ground won't take the square: it wants 20 units of rise or less, away from water, cliffs
and the spawn. So try a few seeds, keep `hills` low, and look at the preview. If nothing fits, the buildings go on the loose
ground round the middle.

The planner puts the biggest building on the square, the rest along the streets 3 to 5 tiles apart with doors onto them,
one church to every 12 buildings, and a fenced yard behind many. Each gets a step of road to the street, so the rule about
doors and roads holds. Paving runs over 65% of a market or axis's reach, in the biome's `paving` or Varrock's `171`. Trees
come back over 32 tiles past that, or 8 from a hamlet (`createTownFade`).

**One kit per town** is automatic: a town picks a family of prefabs by the start of their names (`lumbridge_house` is
`lumbridge`), and its fence goes with it (`KIT_FENCES`). A family with one prefab makes a town of copies: see
[Biomes](#biomes) for how many each has.

`placeVignettes` then puts one or two groups of 3 to 6 small things against each building, on a wall without a door, from
`VIGNETTES`. They're biome by biome, from what its towns really have. They block, so they keep off roads and leave a tile
clear. `fairy` has none.

Hand-made: `planTown`, `placeVignettes`, `placeSetPieces` and `createPace` all want a `Build`, and the first and third a
`RoadNetwork`, so they're for a map that has those, as `maps/kaluasWake.ts` does. None of the three hand-made maps calls them
yet. Without them, stamp prefabs with `PrefabKit` and lay the town out by hand, to the numbers above. Keep to one family,
and put a square in the middle.

### 5. Landmarks

`landmarks` is how many: about 1.5 pieces a map square on land at 1, and 1 in water. Sites with nothing on them get the
first of them, and each biome lists its pieces in `landmarks` in `biomes.ts`. The least used goes next, so a map gets a spread.

Reach for a **recipe** first, in `SET_PIECES` (`structures.ts`): `market` (`meadow`, `desert`, `jungle`, `autumn`), `farm` and
`orchard` (`meadow`, `autumn`), and `shrine` (`meadow`, `desert`, `snow`, `ash`, `elven`, `astral`). To add one:

```ts
well_yard: {
    kind: "recipe",
    sizeX: 11,
    sizeY: 9,
    paved: true, // the biome's paving, or Varrock's, over the whole plot
    // fenced: true, // a fence round it, with a gate in the south side
    // crops: [15506], // on every other row of what's left of the plot
    locs: [
        // [loc id, tiles across, tiles deep, x on the plot, y on the plot, rotation]
        [884, 2, 2, 4, 3],
        [362, 1, 1, 2, 2],
    ],
},
```

Then name it in a biome's `landmarks`. The palette picks it up through `getPieceLocs`. The other kinds are in
[Set pieces](#set-pieces). `single` is the one to be careful with: it's one big loc, with the biome's small things round it.

Hand-made: `ground.place` a composition yourself, on a flat plot. With a `Build`, `pinPlot` makes the plot.

### 6. Rock

Rock's automatic on a generated map: `paintRock` then `dressCliffs`, from the biome's `RockDef`.

`rockFaces` is how much gets heaps or facets: 0 leaves pebbles only. `rubble` is rock lying about on the mountains. `snow`
brings the snow line down, and past it `SNOW_ROCK` dresses cliffs, which have no overlay there. The dev map
`scaperune_rocksheet` shows every biome's rock from the play camera, and `scaperune_cliffs` shows single locs on a steep band.

Hand-made, in this order. They only need a `Ground`, so any map can call them:

```ts
// Before anything stands on the rock. Never paintOverlay for rock: it smooths out onto the walkable ground.
paintRockFloor(ground, rock, overlay, skip);
// Once the tiles are blocked and whatever stands there has come out of the mask
dressRock(ground, rock, { kitAt, seed: SEED + 202, share: 1 });
```

`rock` is a mask of tiles, and `dressRock` only uses the ones that are blocked and aren't water. `kitAt` gives a `RockKit`
for a tile: a biome's `rock`, or your own. Give it a seed of its own, so that it moves no other roll.

What it does: on tiles over 16 a tile, a 2 by 2 heap on 45% of them at a share of 1, where all four tiles are free rock. With
`facets`, a facet on everything within 3 tiles of a face. Then pebbles on 40% of what's left, up to 44 a tile, because past
that they bend into shards. Facets only work on their own dark overlay (115, 99, 11). Anywhere else they read as shards.

### 7. Scatter

`trees`, `treeClumping`, `treeMix`, `rocks`, `rockMix`, `props`, `flowers`, `grass`. Trees, rocks and props go by the map's
pace and thin out in towns, and flowers go by pace, so a map gets its contrast for free.

Of these only `flowers` and `grass` don't block, so when a map needs more on screen, raise those. A view under 4 usually
means `trees`, `treeMix` or `props` are too high.

Hand-made: `scatter` is private to the generator. Copy what you need, as `maps/kaluasWake.ts` and `maps/vardhelm.ts` do.
`createPace` needs a `Build` with `sites`.

### 8. Dressing

`dressing` (default 1). It runs last, on a seed of its own, and takes what's underfoot from `FLOOR_KITS` (`floorKits.ts`),
keyed `o14` for an overlay and `u48` for an underlay. On a floor with no kit it falls back on `biomeDecor`. A shaped edge
tile takes its overlay's kit half the time. Everything in a kit is type 22 and can't block, so where you can walk doesn't
change. It skips blocked tiles, buildings' tiles, decks and anything that already has a type 10 or 22.

- Between them this and scatter come to about 60% of real decoration (`DRESS_SHARE`). That's a decision, not a limit.
- A road gets at least 35 per 100 before that share, and any floor at least 25.
- Land beside water gets its floor's kit at 70%, and overlays 6 and 7 beside land get reeds on 14% of tiles (`REEDS`).
- The foot of a cliff gets at least 40%.

Hand-made, **last of all**, after reachability has blocked what it's going to, because nothing painted later should sit on it:

```ts
dressGround(ground, { seed: SEED + 300, density: 1, biomeDecor: (x, y) => [4735, 4736] });
```

### 9. Check it

Next section. Then, for anything more than a dev map, [Shipping a map](#shipping-a-map).

## Checking a map

**A round.** Each of these is cheap, so go round often. On a small machine run anything that loads the cache through your
job wrapper, one at a time: on the team's VM that's `~/tools/heavy.sh [seconds] <cmd>`.

```sh
npx tsx scripts/scaperune/preview.ts out.png map=scaperune_oasis          # from above, and reachability
ONLY='scaperune_oasis$' npx tsx scripts/scaperune/check-maps.ts           # every rule, on one map
npx tsx scripts/scaperune/research/measure.ts out.json scaperune_oasis    # everything else
npx tsx scripts/scaperune/world-index.ts world.json                       # once, for the next line
npx tsx scripts/scaperune/research/trap-scan.ts world.json traps.json scaperune_oasis
npx tsx scripts/scaperune/research/overview.ts out.png map=scaperune_oasis 2   # scenery from above, which preview can't show
DEV_MAPS=1 MAP=scaperune_oasis npx tsx scripts/game/simulate-run.ts wizard 1   # it plays at all
```

Before you finish: `npx vitest run src/game/scaperune`, which runs `check-maps.ts` over every dev map, about 60 settings at
their extremes, the presets and 12 random rolls. That takes a few minutes.

### The look line

`check-maps.ts` fails on the rules below, and prints a line a map with what's only worth knowing:

```
look scaperune_town: decor 40, road 22, steepest 11, on steep 25%, foot rock 0% decor 100, view 7; objects 32/69/141, kinds 9, flat 69.9%, indoor 3.2%, gap 6, size 6+ 0
```

It measures the arena only, with the same code the real world was read with. It holds every dev map and sweep, and a
hand-made map if it has a `detail`, but not shipped maps. The bars sit under the real range on purpose, and "Now" is what the
dev maps came to when this was written.

| Field        | What                                 | Real                                      | Fails at                  | Now                            |
| ------------ | ------------------------------------ | ----------------------------------------- | ------------------------- | ------------------------------ |
| `decor`      | Decoration per 100 land tiles        | 26-39 regions, 20-65 places               | Under 20                  | 26-57                          |
| `road`       | Decoration per 100 road tiles        | 23-96, mostly 30-60                       | Under 15                  | 20-41                          |
| `steepest`   | Steepest tile, height units          | 80 at most                                | Over 80                   | 72 at most                     |
| `on steep`   | Steep tiles (16+) with a loc         | 12-83, mostly over 30                     | Under 25%                 | 25+                            |
| `foot rock`  | Cliff's foot on a rock overlay       | 2-20, up to 56                            | Over 30%                  | 0                              |
| `foot decor` | Decoration per 100 tiles at a foot   | 29-93                                     | Under 20                  | 46+                            |
| `view`       | Tiles you can see, median            | 2-6                                       | Under 4                   | 4-8                            |
| `objects`    | Standing objects a screen, p10/50/90 | 0-16 / 18-73 / 129-185                    | Report only, aim 5/40/130 | 5-32 / 13-69 / 32-141          |
| `kinds`      | Kinds of object a screen, median     | 12-48                                     | Report only               | 7-17                           |
| `flat`       | Walkable tiles that are dead flat    | 75 in the world, mostly over 30 in places | Report only, aim 40+      | 24-70                          |
| `indoor`     | Share of the arena indoors           | 9-26 in a town's rectangle                | Report only               | 0-3.7                          |
| `gap`        | Tiles to the next building, median   | 3-5                                       | Report only               | 6+                             |
| `size 6+`    | Locs of 6 tiles or more              | Almost none                               | Report only               | Mostly 0-2. Kalua 10, Ysmar 26 |

The rules skip what's too small to judge: 2,000 land tiles, 200 road tiles, 100 steep tiles, 60 tiles of cliff foot. The
decoration rules are off with `dressing` under 1 or `grass` at 0. `indoor` and `gap` are over the whole arena, so a good town
in a big arena still reads low. `steepest` can't see tiles within 2 of water or 4 of a bridge, or heightmap maps.

### What to do when a check fails

**Look:**

- `decoration is N per 100 land tiles`, or `road tiles`: `dressGround` wasn't called, or something ran after it. A hand-made map
  with floors in no kit needs a real `biomeDecor`, and one with a low road figure may be returning the wrong `roadTiles`.
- `N blocked tiles are on a textured floor`: overlay 20 or 32 on rock. Use a plain overlay and `paintRockFloor`.
- `the steepest tile is N a tile`: heights weren't limited. Use `finishHeights` or `limitFaces`. On a generated map, lower
  `peakHeight` or raise `terraces`.
- `only N% of M steep tiles have anything on them`: is `dressRock`'s mask set and blocked there? A band a tile wide can't take
  a heap, and over 44 a tile takes no pebbles, so make faces wider or gentler.
- `N% of tiles at a cliff's foot are on rock`: `paintOverlay` was used for rock. Use `paintRockFloor`.
- `decoration at a cliff's foot is N per 100`: something else is on those tiles, or `dressGround` isn't last.
- `you can only see N tiles at the median`: too much solid scenery. Lower `trees`, `treeMix` and `props`, and move that density
  to `flowers` and `grass`.

**Catalogue:**

- `banned loc N at x,y: why`: swap it. Rockslides (11433 to 11435) for sea rocks, 4769 Pile of bricks for fallen roofs, raised
  ground and plain stone for a dais.
- `loc 13312 at x,y draws nothing as ground decoration`: that blood only has a wall's model. Use 652, Bloodsplatter.
- `foam at x,y isn't at a fall`: foam (26499) is for within 14 tiles of a fall. Take it away, or list the fall in `detail`.

**Height, roads and buildings:**

- `N open tiles are hidden from the camera`: a drop to the north is steeper than the camera. `limitNorthFaces` keeps them to 30.
- `road too steep at`, `road steps at`: pins are fighting over a road. `gradeRoads` goes after everything's pinned.
- `too steep to walk but open at`: heights changed after blocking. `blockSteepGround` goes after the last height.
- `the generator's collision and the game's differ`: a real bug. Find the tile, and compare `getCollisionFlags` with `ArenaGrid`.
- `road runs through a building`, `road painted on a building`: keep off `ground.footprint`, and `markOffLimits` before routing.
- `X's road doesn't end at its door`, `turns its door from the road`: lay the road from `exit`, and turn the prefab.
- `X isn't on flat ground`, `opens onto ground you can't walk on`, `has something under it`: use `pinPlot`, and `markOffLimits`.
- `gap at x,y off the deck isn't whole road`, `road outside the fences`: run the road down the deck's line for 7 tiles.
- `the waterfall at x,y has no pool`: `placeFallPools` goes before the heights settle.

**Reachability:**

- Anything but `0 stranded`: the generator can't do this. By hand, find it with `findStranded`, then give it a way in, or block
  it and count what you block.
- `refused: These settings leave too little ground to play on.`: fine in a sweep. On your own map, less water or fewer cliffs.

**`0 stranded` proves nothing if the recipe blocks what's cut off.** A whole island sealed off still passes, as nothing
open is left stranded: one map lost 4,964 tiles that way. Have the recipe count what it blocks and throw over a limit.
`placeBridges` also skips a bridge that doesn't fit without saying so, so count what comes back. `check-maps.ts` skips a
hand-made map with no `detail`, and only checks a road's grade or a landmark's ground if `detail` passes them on, so
`steepest road 0.0` or `0 landmarks` means unchecked.

### What's not on the look line

`measure.ts` writes all of it to a JSON file, a map at a time. These are the ones to read, with the real ranges:

```sh
node -e 'const m=require("./out.json").scaperune_oasis;console.log(m.faces.lengthQ,m.enclosures.freeWallsPer100,m.towns.wallKindsFor90Pct,m.objects.props.againstWallPct,m.aprons.ringOverlayPct,m.height.steepest)'
```

| Key                            | What                                         | Real                |
| ------------------------------ | -------------------------------------------- | ------------------- |
| `faces.lengthQ`                | Tiles in a face: p50, p90, longest           | 2-3, 2-7            |
| `faces.dropQ`                  | Height a face drops: p50, p90, p99, most     | 27-53, 39-136       |
| `enclosures.freeWallsPer100`   | Free-standing fence walls per 100 tiles      | 5-8.5 in farm towns |
| `towns.wallKindsFor90Pct`      | Wall ids for 90% of walls                    | 5-12 in a new town  |
| `towns.streetQ`                | Tiles between buildings: p25, p50, p75, p95  | 3-5, 7-8, 14-15     |
| `objects.props.againstWallPct` | Props touching a wall                        | 30-58 in towns      |
| `objects.props.clusterP90`     | Props in a group, p90                        | 6-21                |
| `aprons.ringOverlayPct`        | Two tiles round buildings on path or paving  | 12-69               |
| `underlays.areaP50`            | Tiles in a piece of one underlay, median     | 2-4                 |
| `shore.onShorePer100Edge`      | Locs per 100 tiles of shore                  | 26-155              |
| `height.steepest`              | The real steepest tile, with nothing skipped | 80                  |

`trap-scan.ts` lists what a map's made of, by what's odd about it. Read it like this:

- **Act on**: `sinks over a tile below its origin` on land, `500+ triangles on 2 tiles or less` if there are many of them,
  `big and not contoured` on a slope, `placed as a type it never is`, `never placed in any map file`.
- **Usually fine**: `draws nothing but blocks` from prefabs, where they belong; `animated`; wrecks that sink, because they
  stand in water; `no surface use at all` for good outdoor locs from above y 64, which hold real places like Prifddinas.

`audit-locs.ts world.json scaperune_oasis` says how the world uses each loc in a map.

### Look at it

Tests don't cover how things look, and this is where most maps fall down. From above is for layout only: the white square in
a preview is the arena and the red dot is the spawn, and the minimap renderer doesn't draw trees or rocks.

```sh
npm start        # the dev server, then in another shell, from ~/tools/pw on the team's VM:
LD_LIBRARY_PATH=~/tools/chromelibs/usr/lib/x86_64-linux-gnu PROFILE=<profile dir> PORT=5173 MAP=scaperune_town \
    node rs-height.mjs out square:6152:11674:18 side:6152:11674:18:-250
```

Each stop is `name:x:y[:distance[:pitch]]` and writes `out-name.png`, and `@id` moves to another map. `x` and `y` are world
tiles: `mapX * 64` plus the grid tile. Use a distance of 18, which is the play camera, or it shoots from further out. Look at
it side-on too, with a pitch nearer 0: from above, hills barely show. On your own, `game.selectMap(id); await game.startRun()`
in the console, and `game.cameraRig.pitch`. It takes about 2 GB, so one at a time. Don't edit `src` while a browser job runs:
Vite reloads the page and kills the job.

### Trying a new loc

```sh
npx tsx scripts/scaperune/research/model-bounds.ts 3709 60440    # contour, triangles, how far it really reaches
npx tsx scripts/scaperune/research/where.ts 44,56 3709           # how the world uses it: the ground, and what's round it
npx tsx scripts/scaperune/loc-sheet.ts out.png 1276 1241:22      # draw it, about as the play camera sees it
```

Read `model-bounds.ts` like this: `contour` 0 or more follows the ground, and -1 stands level, so it wants flat ground.
`height tiles` under 0 sinks that far below its origin. `x` and `z` past half its size reach past its tiles. `tris` over about
60 is too heavy for anything there are thousands of. A loc with `types 4` only has a model as wall decoration.

`where.ts` needs a square. This finds them from the index. Squares under y 64 are the surface:

```sh
node -e 'for(const s of require("./world.json").squares){const n=Object.keys(s.locs).filter(k=>k.startsWith("34780:")).length;if(n)console.log(s.x,s.y)}'
```

No surface use isn't a verdict by itself: Prifddinas and the Darkwood are up there. A list by hand is why `BANNED_LOCS`
(`catalogue.ts`) exists, and it's what `check-maps.ts` enforces on everything but shipped maps: the Tombs of Amascut's dial
and pillars (45872 to 45915), a sunken city's fallen roof (48328 to 48333), instance debris (48972, 48973), sea rocks on land
(60436 to 60444, fine in water) and the two quads that line holes (14416, 14427). Something else that's wrong: add it.

`LocInfo` doesn't carry contouring or a model's reach, so nothing in the generator can check them. Only these scripts know.

## What the engine can't do yet

Don't spend a round on these.

**Things it has no way to make**

- **No dock town.** `TownKind` is `market`, `axis` or `hamlet`, and there's no way to make a Piscarilius.
- **No jetty, no boardwalk.** Nothing in the generator lays walkable planks over water, so there's no recipe for one. Only
  bridges cross water. Kalua's stilts are by hand, on a deck with corners of its own (`DECK`, `createDeckMask`): that's the
  code to copy.
- **No choosing a town's kind**, or seeing which it got except by looking.
- **No built edges**: raised ground with walls along the top. By hand, pin the ground and place contoured walls.
- **No road hierarchy past the town core**: roads are one material outside it, with no narrow tracks, and a road that changes
  colour shows a seam.
- **No mottled ground.** Pieces of one underlay are 14 to 22 tiles at the median, against 2 to 4 in the real world, and edges
  between biomes have no dither.
- **No invisible walls.** The real world seals drops with 85 and 2639, which draw nothing. Nothing here uses them on purpose.
- **Streets are straight and square to the map.** Town walls are rectangles, and only for `towns`.
- **Only rotation.** The map format has no mirror.
- **One plane is drawn**, so nothing can be built to be seen upstairs.

**Targets only partly met**

- **Flat land**: 24% to 70% on dev maps, and about 36% on default hills, against a hoped-for 40% and the world's 75%.
  It runs after roads are graded, which limits it. `flatness` past 0.75 adds little: lower `hills`.
- **Pacing**: the top end is short. Most maps reach 47 to 68 objects a screen at p90 against 130, and only `scaperune_town`
  passes it. Hamlets don't make a screen of 130, so that end of the range needs a town.
- **Kinds a screen**: 7 to 17, against 12 to 48. Scatter draws from short lists.
- **Faces** are 3 to 7 tiles at p50 and up to 9 at p90, against 2 to 3 and 7. Getting them shorter means changing
  `shapeCliffs`, the heart of how height's stored.
- **Indoors and gaps**: buildings are about the right size and well spaced in a town, but a town is a small part of an arena.
  In a town's own rectangle the Town preset comes to 10% to 14% indoors, with a gap of 5 to 8.

**Known faults**

- **Meadow's sea road.** `scaperune_meadow` has a 109 a tile where a road runs into the sea: both ends of that tile are held.
  The look line can't see within 2 of water, so it reads 49, and `height.steepest` tells the truth. Roads pinned where they
  meet water can do this on any map.
- **Plain rock is weak on pale ground.** On `snow`, `desert` and `tropical` a plain face doesn't read as one surface: its heaps and
  pebbles show as loose shards against it, even white ones on snow. Snow's kits were cut back for that, and there's no fix yet.
  Keep faces short there, and look at it.
- **Seaweed is heavy.** 30537, 30538 and 30542 are 736 triangles a tile, and they block (clip 1). Kalua's are 1 tile in 16, and
  a tile-by-tile shore is out.
- **Some small things are heavy too.** 5123, a barrel in meadow's `VIGNETTES`, is 726 triangles. `desert`'s cacti (44069 to 44071)
  are over 500 each, and a map can have hundreds. `trap-scan.ts` lists these.
- **Dressing costs triangles.** Kits are capped at 60 a loc and it's still 5 to 8 thousand more a frame, which is 19% to 37% on
  a low count. Heavier kits aren't an option.
- **A family of one makes a town of copies.** Look for a 1 in the [Biomes](#biomes) table. Try another seed, or add prefabs to
  the family.
- **Big maps take a while to build.** 8 s at 16 squares and 26 s at 28: see [How big a map can be](#how-big-a-map-can-be).

**Tried and dropped**

- Flat land before roads were graded: roads failed their grade on about 1 map in 30, because plots landed on different levels.
- Dressing at 90 triangles a loc: world triangles rose 37% to 44%.
- Seaweed as a tile-by-tile shore: see above.
- Deeper water away from shores, with overlays 448 to 454. A tile holds one overlay, so each band's edge is a staircase.
- A rope bridge over a gorge. The cache's (21509, on Neitiznot) is a thin wall loc with no deck, and from above it's a line.
- `53543` ice shards as a snow face. No overlay's as white as the snow underlay either, so snowy cliffs are bare underlay.

## Reference

### How it works

A recipe builds a `TileGrid`: plain arrays of floors and heights, and a list of locs. `format.ts` writes it out in the
cache's own terrain and loc formats, map square by map square, and `squares.ts` hands those to the viewer as plain data
(`MapViewer.addCustomMapSquares`). `src/rs/map/CustomMapFileLoader.ts` then serves them to anything that reads a map. So the
renderer, collision, flow field, minimap and bot get them with no idea they aren't real.

The recipe runs once, on the main thread, the first time the map's played. `GameClient.loadGrid` calls `installRecipe`, and
scripts call `installRecipeInSceneBuilder`. Reload the page to see a change.

| File              | What                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `recipe.ts`       | `MapRecipe`, `BuildContext`                                            |
| `Ground.ts`       | a map being built: paint overlays, stamp prefabs, place locs           |
| `format.ts`       | the tile grid, and reading and writing both file formats               |
| `prefab.ts`       | cut a rectangle out of the real world, turn it                         |
| `prefabs.ts`      | the named rectangles: buildings from all over the world                |
| `building.ts`     | what's inside a prefab's walls, and its ways out                       |
| `biomes.ts`       | what each kind of ground is made of, and its rock                      |
| `catalogue.ts`    | locs that read wrong outside what they were built for                  |
| `dress.ts`        | rock's colour and what's on it, and the small things on all the ground |
| `floorKits.ts`    | what real ground has on it, by floor                                   |
| `settings.ts`     | every setting, its limits, the presets, Randomize                      |
| `generator.ts`    | the random generator: the order things happen, scatter, reachability   |
| `mapBuild.ts`     | what's kept while a map's built, and what its parts share              |
| `rivers.ts`       | rivers, lakes and the sea: where they go, how high they stand          |
| `mountains.ts`    | passes, what can be walked, rock, snow, caves, lava                    |
| `roads.ts`        | roads and bridges                                                      |
| `settlements.ts`  | where buildings go, their plots, and sites                             |
| `townPlan.ts`     | towns laid out from the middle, and pace                               |
| `vignettes.ts`    | small groups of things against a building's walls                      |
| `structures.ts`   | set pieces, wrecks and drowned towns, town walls, waymarkers           |
| `falls.ts`        | waterfalls off cliffs, with their pools                                |
| `terrain.ts`      | the height layer: floats per corner, pins, slope limits                |
| `landforms.ts`    | the shape of the land, and flat land                                   |
| `roadGrades.ts`   | how high every road runs, worked out together                          |
| `collision.ts`    | collision from a grid, reachability                                    |
| `paths.ts`        | cheapest path, for roads and fords                                     |
| `noise.ts`        | seeded random numbers, noise, distance                                 |
| `shapes.ts`       | which overlay shape a tile takes from what covers it                   |
| `palette.ts`      | everything the generator can use, on one map                           |
| `squares.ts`      | turns a recipe into squares, and installs them                         |
| `generatedMap.ts` | the map generator screen's one map                                     |
| `maps/`           | the maps. `devMaps.ts` lists them                                      |

### The generator's order

`generateMapDetail`, in order: the land's shape (`landforms.ts`), rivers down its valleys, sea and lakes, cliffs, passes,
floors, bridges, main roads, sites and buildings with their roads, vignettes, set pieces, ruins, pools for waterfalls, walled
towns' squares, roads graded, flat land, then the heights are finished (`finishHeights`), what's too steep is blocked, roads are
painted, then rock, caves, lava, the falls, what's on the rock, the boundary, town walls, waymarkers, what stands in water,
scatter, reachability, and last the ground's dressing. Anything it can't connect gets blocked.

**Boundaries.** Only `sea` makes an island. With the others, land runs on past the arena on all sides, scattered out to
the edge of the margin, so the world looks like it carries on. The arena's edge is still what stops you, so each one
puts something there: `forest` a thick belt of trees either side of it, `hills` ground rising away with a line of rock heaps
on it, `fence` a fence `boundaryDepth` tiles in with gaps where roads go through, `mountains` a ring of rock rising from
`boundaryDepth` tiles in.

**The game fades the world to black past the arena's edge**, over 6 tiles (`playAreaFog`). Real maps keep that. It would hide
all of the above, so `GameClient` moves it out by `OPEN_WORLD_MARGIN` on dev maps and on maps with `MapDef.scaperune`. The
minimap still only covers the arena, so it's black past the edge.

**Adding a setting**: `settings.ts` has every setting, what it does and its limits (`SETTINGS`), which section it's in, and
the presets. The screen, the error messages and the tests are all built from `SETTINGS`, so adding one means adding it
there, with a default and a section, and to `CHANGES` in `generator.test.ts`, which fails if changing a setting doesn't
change the map. A setting that only matters with another (`when`) hides until it does. New rolls get a seed of their own (`createRng(settings.seed + N)`), so that
layouts stay put.

**Adding to `SWEEP`** (`check-maps.ts`): append, never insert, because seeds go by index.

### The map generator screen (temporary)

On the dev server the title screen has a **Map generator** button: every setting in sections, presets, Random, Reset,
Randomize, copying and pasting the settings as JSON, Generate with a preview from above, and Play. Randomize rolls what shapes
the map, and leaves the size, heightmap, start, waves, `dressing`, `flatness` and `sites` as they are. It's temporary, so it's
built to delete: remove `MapGeneratorScreen.tsx`, its CSS and `generatedMap.ts`, then the `MapGeneratorButton` line in
`ui/GameUi.tsx` and `setGeneratedMap` in `content/maps.ts`.

Every Generate replaces one map, `scaperune_generated`, at map squares from x 70, y 134. `installGeneratedMap` replaces
whatever kept the old one. A load still on its way for the old squares is dropped (`MapViewer.customMapVersion`). If you add
anything else that's kept per map, clear it there.

**Runs on any map here, dev maps included, leave the save alone**: `MapDef.dev`, checked in `recordRun`.

### Biomes

Each is an entry in `BIOMES` (`biomes.ts`): its ground, water, trees, scatter, big props, buildings, set pieces, fence, town
wall, waymarker and rock. There's a preset that shows off most of them, and a dev map, `scaperune_<id>`.

| Biome       | From                                        | Prefab families (how many)       | Rock overlay |
| ----------- | ------------------------------------------- | -------------------------------- | ------------ |
| `meadow`    | Lumbridge                                   | lumbridge 2, varrock 1           | 83           |
| `desert`    | Kharidian Desert                            | al 2, pollnivneach 3, sophanem 1 | 26           |
| `swamp`     | Lumbridge Swamp, Morytania                  | canifis 1, burgh 2               | 102          |
| `snow`      | Trollweiss, with ice from the north seas    | rellekka 2                       | 3            |
| `jungle`    | Karamja, Varlamore's stumps                 | taibwo 3                         | 83           |
| `tropical`  | the Sailing islands                         | ape 1, taibwo 2                  | 26           |
| `ash`       | Fossil Island, the Wilderness. Water's lava | lovakengj 2, shayzien 1          | 115, facets  |
| `autumn`    | maples, on gold ground                      | hosidius 1, shayzien 2           | 14           |
| `deadlands` | Morytania past the Salve                    | darkmeyer 3, burgh 1             | 99, facets   |
| `elven`     | Tirannwn, Prifddinas's crystal              | prif 4                           | 3            |
| `fairy`     | Zanaris. Nothing's built                    | none, ruins only                 | 83           |
| `darkwood`  | the Darkwood                                | darkmeyer 2                      | 99, facets   |
| `astral`    | nowhere: land over the stars                | prif 3                           | 2            |

To add one: find what a place is made of with the tools below, give it an entry, a preset and a line in `SWEEP`, add it to
`GENERATED` in `maps/devMaps.ts`, give it `VIGNETTES`, which TypeScript asks for, and look at it. The palette
picks up what's in `BIOMES`, `PREFABS`, `BRIDGES`, `SET_PIECES`, `FLOOR_KITS`, `VIGNETTES` and `KIT_FENCES`. Anything from
somewhere else needs adding to `palette.ts`, and `check-palette.ts` fails if it isn't.

**Mixed maps.** `biomeAt` says what's where, and roads, rock and lava go tile by tile. Water doesn't: a step in its colour
would show as a line across it, so each piece of water is the kind of the biome most of it's in. What's scattered uses
`biomeNear`, which frays the line between two biomes by about 8 tiles, so that woods run into each other.

**Chasms.** A biome with `chasm` has a drop for a sea: its edge is a cliff in `CHASM_EDGE` tiles rather than `SHORE_REACH`, and
the "water" is overlay 39, the Cosmic Plane's stars. `hasRelief` is true for these. Fords can't cross it, so anything the sea
cuts off is only looked at, and a river would cut the land in two for good, so `Sky islands` has none.

**Finding what a place is made of**, all without a browser:

```sh
npx tsx scripts/scaperune/world-index.ts world.json         # every square's locs and floors, once
npx tsx scripts/scaperune/loc-sheet.ts out.png 1276 1241:22 # draws locs, about as the play camera sees them
npx tsx scripts/scaperune/loc-sheet.ts out.png 3243,3244,6,5 # draws a rectangle of the world from above
npx tsx scripts/scaperune/find-buildings.ts 50 50 51 50     # whole buildings in a block of squares
npx tsx scripts/scaperune/research/cross-section.ts 2820 3628 25 12  # a real cliff as text: heights, floors, what's on it
npx tsx scripts/scaperune/research/overview.ts out.png 3200 3200 96 80 2  # a real place from above
```

The index is JSON: a few lines of anything will list a region's commonest locs, which is the quick way to choose. A loc's
name is often `null`, so look at them. Sheets are close, not exact: textures are their average colour, and big things are
scaled to fit. `FLOOR_KITS` came from `research/survey.ts`, so its results in `research/results/survey.json` have every
floor's commonest decoration.

Things worth knowing about in the cache, found this way: `58541` to `58543`, palms; `40754`, a bright orange maple; `40788` on, the Darkwood's trees; `60467` to `60479`,
wrecks made for the sea; `43129` to `43131`, mushroom trees up to 9 tiles across; `48327`, a sunken steeple; `59324`, a skeleton
7 tiles long; `27878` and `27879`, crystals 5 across; `60404` and `60405`, ice; `60390` to `60399`, flat blue ice.

Floors that are more than a colour, for small patches only: overlay `20` grey stone, `32` dark rock, `12` cobbles, `39` stars on black, `52`
planks, `174` flagstones, `196` ice, `84` sandstone. Overlay `42` isn't drawn at all, as in caves. `floors` of the Darkwood
(629 on) couldn't be read by the overlay loader in Node, so its road's an older one.

### Set pieces

`SET_PIECES` in `structures.ts`, named in a biome's `landmarks`. The kinds:

- `recipe`: normal things on a plot of their own. **Reach for this first.**
- `rows`, as in a graveyard, with `edge` for what grows round it. `ring`, stones round a circle. `grove`, a loose crowd.
- `single`, one big loc, with the biome's small things round it.
- `maze`, hedges round corridors 3 wide, with a fifth of its walls knocked through and a way in on each side, because a crowd
  has to fit. `fort`, the biome's wall round a yard, with a gate on each side.
- `wreck`, in the water near a shore. `sunken`, a steeple in deep water with pillars round it, only if all of their tiles
  are water.

On land they stand on plots as buildings do (`fitsBuilding`, `pinPlot`), since a big loc on a slope shows its underside.

**Town walls.** `townWalls` is the share of `towns` with one. It's a rectangle a little way out from a town's buildings, open
where roads go through and with a gate on each side, in the biome's `wall`, and inside it roads are paved and there's a square
with a fountain unless it's been laid out with one. A wall loc is a thin thing on a tile's side, so it costs nothing, and
reachability needs no help. `Walled city` is the preset for a big one, and `scaperune_town` is the dev map.

### Floors and heights

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

### Height

Height's a layer of its own while a map's built: `Terrain` holds a float per corner, and only the finished heights go
into the grid. Nothing in the generator writes heights directly. Whatever needs the ground to be a certain height **pins** it, and
`settle` brings the ground round it to meet that, cutting and building no steeper than `SETTLE_SLOPE` of what's
walkable. That one idea does cuttings, embankments, plots and the ground round bridges. On a tie between two pins,
the first one stays, so a late pin can quietly lose. A pin also beats a held corner.

**The limits, measured:**

| What           | Number                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| A height       | 0 to 255, one byte, a step of 8 scene units. 1 reads as 0.                                                   |
| Tallest ground | 255 is 2040 scene units, 16 tiles. Real peaks use it (Trollheim, Cam Torum)                                  |
| Real slopes    | 99.96% of tiles are 80 a tile or under; `getTileSlope` measures, and `STEEPEST_FACE` caps ours at 72         |
| Tiles          | two triangles, split south-east to north-west                                                                |
| Light          | from the south-west. 11 to 181 against 84 on the flat, so it can't overflow; camera-facing slopes are bright |
| Actors         | stand on `getHeight` at their middle. They don't tilt.                                                       |

**The camera.** It's fixed: it looks north, at 70° (pitch -400), from 18 tiles (10 to 44 with the wheel), 45° field of
view, so at the default zoom it sees about 27 by 16 tiles. So:

- **Only drops to the north can hide anything**, because the camera's south of what it's looking at. 70° is 44 height
  units a tile, so a face steeper than that hides its own foot. `limitNorthFaces` keeps them to 30 (`NORTH_FACE_SLOPE`),
  and `check-maps.ts` counts open tiles hidden from the camera, which must be 0. The rest of the view runs from 92° at
  the bottom of the screen to 48° at the top, so a tall ridge can hide a tile or two near the top until you get closer.
- **It doesn't clip** over any slope within that limit. It'd lurch at creases on tall ground, so on dev maps it eases after
  the ground (`CAMERA_GROUND_EASE`).

**Walkable.** A tile steeper than `walkSlope` is blocked with the same floor flag as water, going by the rounded heights in the
grid, so `getCollisionFlags` and the game's scene agree. To the flow field a cliff's a wall, and enemies only turn up where they
can reach you (`canTurnUpAt`).

Cliffs are picked in `shapeCliffs`: tiles over `walkSlope`, without specks or ledges too thin to walk. What's left is eased
under the limit, so a hillside comes out as ground you can walk on and cliffs you can't, with nothing in between. **A blocked
tile always looks it**: everything blocked gets rock's overlay.

**Flat land.** `flattenLand` puts open ground on levels 12 apart, with `flatness` the share of each level that's flat. It leaves
slopes near the limit, cliffs and held corners alone, and runs after roads are graded.

**Faces.** `finishHeights` takes the tops off anything over `STEEPEST_FACE` in any direction (`limitFaces`), and brings
ground up to a corner held high (`liftFaces`). Only what can't move is left over the bar: a bridge's own heights, a fall in
a river, and a road pinned where it meets water.

**Reachability.** `cutPasses` cuts a graded pass to any piece of ground over `MIN_PASS_PIECE` the cliffs cut off, before
roads go down, so roads use them. Anything smaller stays out of reach, which is fine on top of a mesa. Nothing's built
off the `mainland`.

**Roads.** Routes are found with a cost per step (`climb`), so they wind up a slope rather than go straight up it. Their heights
are worked out **all together, last** (`roadGrades.ts`), with leads and plots pinned. One at a time doesn't work: a road's
height depends on what it meets and passes, and those can come later. Then the ground's pinned to them across their width.

**Rivers** (`findValley`) follow the low ground, a column at a time, so a river's a function of how far along it is. Their
level only falls toward their lower end, and is level for `LEVEL_AT_CROSSING` tiles round a crossing. Banks come down over
`riverValley`'s slope: sheer gorges at 0 and wide valleys at 1. Fresh water's corners are held: nothing moves them.

**Bridges** stand with their banks `bankHeight` over the water, pinned from the prefab's own heights, because the deck's
stored relative to the ground under it. There are three in `BRIDGES`, and a biome names one. They can stand in for each other
because all have an 11 tile deck, 2 wide, in an 18 by 6 rectangle. The cache's dozens of others have their own banks: most run
into cliffs or are flat with the water.

**Buildings** stand on a flat plot (`pinPlot`) with a level step out of the door, only where the ground rises less than
`MAX_PLOT_RISE`, away from cliffs, with room to get down to water, and where their road can reach what it joins.

**Roads and buildings: the rules.** `check-maps.ts` fails on any of these, on the dev maps and on `SWEEP`, settings at their
extremes:

- **A road never goes through a building**, walls included, whichever was placed first. Buildings keep off road
  tiles; roads and fords can't step within `RoadNetwork.wallGap` of a building (`offLimits`); smoothing that drifts
  onto one is undone; and painting skips `Ground.footprint`.
- **A building's door faces a road.** Main roads and bridges go down first, then buildings with roads, each turned
  so a way out faces the nearest road, with its road running straight out of that door. One that can't reach the
  roads goes somewhere else.
- **A building without a road still faces the nearest road**: they're placed last, so they see all the roads. If
  there are no roads at all they face the spawn. The `roads` setting is the share of buildings that get a road.
- **A door's lead-in is its own.** Other roads join past it, not against the wall.

**Actors on slopes.** On dev maps `getHeight` follows the triangles a tile's drawn with (`ArenaGrid.exactGround`), and anything
with a radius over a tile is lifted part of the way to the highest ground under it (`groundUnder`).

**A heightmap** replaces hills and ranges (`heightmap`). The screen shrinks an image to `HEIGHTMAP_SIZE` a side, and it travels
in the settings as base64. Black is the floor of the land and white is `peakHeight`.

**To add a landform**, add a function to `landforms.ts` that adds to `terrain.height` and marks `mountain`, call it from
`createRelief`, add its setting, say so in `hasRelief` (`mapBuild.ts`), and add a line to `SWEEP` at its extreme. To give
a new biome its mountains, fill in `rock` in `biomes.ts`: the palette picks it up.

### Rock

Real rock is plain colour with small things on it. `RockDef` in `biomes.ts` says what a biome's made of, and `dress.ts` does
the work: see [step 6](#6-rock). Above the snow line cliffs have no overlay, and `SNOW_ROCK` dresses them. A dark underlay
bleeds a long way into white (11 tiles), which is where snow's dark smears came from, so `snow` has a pale `ground` (underlay
16).

| Locs                                                                   | What                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 3709, 3703, 11439, 336, 14483, 5328 (type 22)                          | pebbles, 18 triangles                                                      |
| Rockslide 11434 grey, 11922 white, 18894 amber, 11933 dark, 3718 mossy | heaps of rock, 2 by 2, 174 triangles, 0.3 tiles tall                       |
| 55130 brown, 51792 tan, 4605 dark grey                                 | the same                                                                   |
| 11433 grey, 18893 amber, 55129 brown                                   | bigger heaps on the same 2 by 2, 380 triangles                             |
| 34384, 34372, 42352 (type 10)                                          | full tile rock: near-black green, olive, black. Dark floors only           |
| 34385, 34388, 34391, 34392, 42353 (type 10)                            | broken facets, for the edges of a carpet                                   |
| 42097, 42098, 6617, 52795, 48627, 57476 (type 22)                      | flat patterned decals: brown, tan, maroon, green. They look like brickwork |
| 53538 (wall), 53543 (diagonal)                                         | snow on a wall; ice shards, which look terrible                            |

Don't reach for rock "walls": 85, 2639, 4451, 44603 and 38848 turn up along cliff edges, and they're invisible walls.

### Water

Paint it with an overlay and `blocked: true`. The blocked flag is what stops you, not the overlay.
Water overlays: 6 and 442 (rivers and sea), 7 (swamp), 19 (lava), 547 (`snow`'s), 568 (Ysmar's). There's no water plane:
water's drawn at the height of its tiles' corners, so keep them level, and bring heights near water down to it over a few
tiles (`distanceTo` gives you the distance).

**Waterfalls.** Rivers gather their fall into single drops at least `WATERFALL_SPACING` apart, with foam across the river. Most
don't fall far in the arena, so what you'll see are `cliffFalls` (`falls.ts`): loc 51484 on a cliff that faces the camera, into a
pool made for it. It's contoured, fits any cliff of 28 units or more, and covers about 3 tiles from its foot. The pool's made
before the heights settle, because it needs level corners, and the cliff behind it is held until `limitNorthFaces`.

**Caves** are decoration: a mouth 3 by 2 tiles at rotation 0 (facing south), set into the foot of a cliff that faces the
camera. Nothing goes in them. They're on tiles that are blocked anyway.

### Prefabs

There's no building entity in the cache. A building is its locs and floor tiles, so a prefab is a
rectangle of the real world.

1. **Find one.** `find-buildings.ts` finds whole buildings in a block of squares, and `loc-sheet.ts` draws what it finds.
   `npx tsx scripts/scaperune/find-prefabs.ts 50 50` draws map square 50,50 as text with
   world coordinates down the side. Pick a rectangle that holds the whole building and nothing else.
2. **Name it** in `PREFABS` (`prefabs.ts`): its south-west corner and size, in world tiles, and give it a kind in
   `BUILDING_KINDS`. The rectangle must take in every wall of the building, with nothing else in it. A rectangle a row short
   loses that wall, and the floor behind it with it. The start of its name is its family, so a new prefab for an existing
   family goes in that family's towns.
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
- `keepHeights`: leaves the ground's height alone, for a map that pins it in `Terrain`.
- `skipLoc`: leaves locs out. The generator drops doors: closed ones block, like walls.
- `height` and `anchor`: stand it at a height, and say which of its own heights that means.

### Writing a recipe by hand

A recipe says where its squares go and how to build them. This is a whole map: a square of grass in a
ring of water, with a building, some trees and the ground dressed.

```ts
import { Ground } from "../Ground";
import { dressGround } from "../dress";
import { createRng } from "../noise";
import { PrefabKit } from "../prefabs";
import { BuildContext, MapRecipe } from "../recipe";

const SIZE = 3 * 64; // one arena square, one square of margin each side

function build(context: BuildContext) {
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

    // A building, turned a quarter, on flat ground with its doors off
    new PrefabKit(context).stamp(ground, "lumbridge_house", 1, 90, 90);

    // Trees: size is the loc's tiles a side
    for (let i = 0; i < 30; i++) {
        const x = 70 + Math.floor(rng() * 50);
        const y = 70 + Math.floor(rng() * 50);
        if (ground.isClear(x, y, 2, 2)) {
            ground.place({ id: 1276, type: 10, rotation: 0, level: 0, x, y }, 2, 2);
        }
    }

    // Last of all: what real ground has on it, by floor
    dressGround(ground, { seed: 2, density: 1, biomeDecor: () => [4735, 4736] });
    return ground.grid;
}

export const LITTLE_ISLAND: MapRecipe = {
    id: "scaperune_little_island",
    // Map squares the cache doesn't have
    mapX: 78,
    mapY: 94,
    squaresX: 3,
    squaresY: 3,
    // Squares of scenery round the arena
    margin: 1,
    // Grid tile
    spawn: { x: 96, y: 80 },
    build,
};
```

Then add it to `SCAPERUNE_DEV_MAPS`. `content/maps.ts` makes a `MapDef` for each dev map, with Lumbridge's waves. `play` takes the
waves, enemy density and brightness from a real map, and `mapDef` goes over the `MapDef` itself. Leave `fun` set, because
`startRun` quietly does nothing on a map that isn't open, and dev maps are only open for being fun maps. So they're endless:
one with its own waves needs a boss in `fun`, and `paced()` needs exactly 15 wave sets.

To have `check-maps.ts` hold it to the rules, give the recipe a `detail` that returns a `GeneratedMap`, and have `build` use it.

Three maps are whole worked examples, each going further than this one:

- `maps/vardhelm.ts`: land carved by hand from a massif, a road up a cliff in hairpins, and prefabs of its own.
- `maps/kaluasWake.ts`: coasts drawn as splines, a `Build` of its own with the generator's parts run in its order, sea
  bridges and a raised village. `paintThinRock` puts back the colour on cliffs too thin for `paintRock`.
- `maps/shatteredRealm.ts`: land over a void, its own waves, events and bosses, and terrain as architecture.

`createBuild`, `paintFloors`, `scatter` and `connectGround` are private to the generator, and `paintRock`,
`blockSteepGround`, `gradeRoads` and `createPace` need a `Build`, so a hand-made map copies what it needs. Keep to the order in
[The generator's order](#the-generators-order): it's the one that works.

Grid tiles start at the grid's south-west corner, x east and y north. `getRecipeWorldTile` turns them
into world tiles.

### How big a map can be

Measured in Node on this VM, on a forest-bound meadow with default settings otherwise, through `preview.ts`:

| Squares a side | Tiles in the grid | Generate | With `sites: 0` | Node peak |
| -------------- | ----------------- | -------- | --------------- | --------- |
| 8              | 410 k             | 2.3 s    |                 | 640 MB    |
| 16             | 1.3 M             | 8 s      | 7.3 s           | 1 GB      |
| 28             | 3.7 M             | 26 s     | 23 s            | 1.7 GB    |

- **What's left is mostly roads.** At 16 squares buildings cost about 3 s and `sites` next to nothing: with neither it's 4.3 s.
  At 28, finding the roads to a town's buildings is 7 s of the 24, so `sites: 0` doesn't help any more and few buildings does.
  It runs on the main thread, so on the map generator's screen that's a frozen tab while it lasts.
- **Mountains cost more on top**: 15 s at 16 squares with `mountains` at 0.75. It's noise on every corner, passes and fords.
- **Cost per tick doesn't grow.** The flow field's a fixed 96 tile window round the player, enemies stay near the
  player, and the renderer only loads the squares near the camera (4 to 8 of them). A tick took 0.73 to 0.76 ms with 400
  enemies at every size, before sites and dressing.
- **What grows is memory, with area**: the map grid while it's built on the main thread, and the collision scene for a
  moment in one worker. Browser peaks ran from 1.5 GB at 8 squares to 2.25 GB at 28, of which about 1.4 GB is there before a
  map is built, and that was before dressing added its locs.
- **The hard limit is the world**: 28 is what fits at x 70 to 99, because `MapManager.MAX_MAP_X` is 100. Raising
  that is one line, but past 28 this VM's 2.4 GB cap would stop it, so it hasn't been tried.
- Over 8 squares a side the minimap's blurry, and blank away from where you've been.

### Traps

- **Nothing outside the grid exists.** The game draws black past it. Keep a margin of a square of scenery
  round the arena. `margin: 1` does.
- **The arena's edge is an invisible wall.** Water or trees just inside it hide that.
- **Enemies only path 48 tiles.** The flow field's window is 96 tiles across (`FLOW_FIELD_SIZE` in
  `Sim.ts`), so keep river crossings closer than that to wherever the fight is, or enemies on the far side
  stand at the bank. A long cliff's the same, but they only turn up where they can reach you, so it just means
  they come from your side of it.
- **Rock's colour needs a band 3 tiles across.** `paintRockFloor` and `paintRock` take off anything thinner, and a cliff one
  tile wide gets none. `paintThinRock` in `maps/kaluasWake.ts` puts it back, to the tile.
- **`dressRock` only uses blocked tiles**, so one called before they're blocked does nothing, and says nothing.
- **Sites need roads.** With `roads` at 0 and no `towns`, buildings don't gather. Sites still pull in scatter and landmarks.
- **`foot rock` counts a biome's rock overlays**, wherever they are. `ash`'s roads are overlay 99, which is rock in `deadlands`.
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
  so does the map. Anything new goes on a seed of its own.
- **Bridges draw above the plane**: their deck is on level 1 with a flag on level 1's tiles.
- **Round buildings have empty corners.** Only what's inside the walls is reserved, so `fitsBuilding` looks at plots as well.
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
- **Squares must be free.** Nothing in the cache uses x 70-99, y 66-199, and the map manager stops at x 100,
  y 200. Each recipe needs its own, and nothing checks that: see `devMaps.ts` and each map's `mapX`, `mapY`. The
  map generator's screen, and scripts given settings, have x 70-99 from y 134 on.
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

### Shipping a map

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
- Shipped maps aren't held to the catalogue or the look rules, and must stay byte for byte: Hallowed Night imports `Ground`,
  `collision`, `format`, `mapBuild`, `noise`, `prefabs` and `recipe`. After a change to any of those, check that
  `npx tsx scripts/scaperune/grid-hash.ts halloween` still prints what it did on `main`.

### The slim cache

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
