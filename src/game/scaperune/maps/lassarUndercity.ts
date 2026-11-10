import { Ground } from "../Ground";
import { assertReachable, sealFrom } from "../collision";
import {
    MAP_SQUARE_SIZE,
    type PlacedLoc,
    TILE_BLOCKED,
    TILE_BRIDGE,
    type TileGrid,
} from "../format";
import type { ClosedRoad, GeneratedMap } from "../generator";
import { cutPrefab } from "../prefab";
import { skipBlocking } from "../prefabs";
import type { BuildContext, MapPoint, MapRecipe } from "../recipe";

// The Lassar Undercity, Act II's second map (content/maps.ts): the real sunken city, map squares
// 40 to 42 by 98 to 100, cut whole from the cache, with square 43 east of it for the margin. The
// cache has its Shadow Realm as a twin, tile for tile, four squares west (36 to 39): the same
// heights, the same locs at the same tiles as their shadow ids, the same collision. So the realm
// is a recipe of its own (LASSAR_REALM_RECIPE), cut the same way and thinned the same way, set
// down TWIN_SQUARES west of the city's squares: the game draws one or the other where the city
// is (MapDef.twin), and the sim, which only has the city's collision, never knows which.
//
// In OSRS its streets are broken up by one-tile clutter (crates, barrels, rubble, the shelves of
// its stalls) into a dozen pockets that don't join: off come the clutter and its doors, so the
// city's one piece of street round the water, as big as the Stranglewood's. Its lamps and
// braziers stay. Its middle is the drowned city, the water the cathedral stands in; the
// cathedral's island is the Whisperer's, joined to the north streets by a causeway, and the run
// starts on the forecourt at its top.

const MAP_X = 62;
const MAP_Y = 104;
// The realm's squares are this many west of the city's
export const TWIN_SQUARES = -6;
const SQUARES = 5;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;

// The real squares under the grid's south-west corner (the city's, and the realm's); the grid's
// west column of squares and its north and south rows are empty (nothing in the cache), and the
// east margin is the next real square along
const CITY_REAL = { x: 39 * MAP_SQUARE_SIZE, y: 97 * MAP_SQUARE_SIZE };
const REALM_REAL = { x: 35 * MAP_SQUARE_SIZE, y: 97 * MAP_SQUARE_SIZE };
const CUT = {
    x: MAP_SQUARE_SIZE,
    y: MAP_SQUARE_SIZE,
    sizeX: 4 * MAP_SQUARE_SIZE,
    sizeY: 3 * MAP_SQUARE_SIZE,
};

const ARENA_0 = MARGIN * MAP_SQUARE_SIZE;
const ARENA_1 = (SQUARES - MARGIN) * MAP_SQUARE_SIZE - 1;

// Where the Whisperer stands in the city in OSRS (npc-spawns: 12204), the cathedral's middle
const WHISPERER_REAL = { x: 2655, y: 6369 };
// What stays of the one-tile clutter that blocks the way: the city's lamps and braziers, and the
// realm's (its own ids), which line its squares
const KEPT_PROPS = new Set([48189, 47945, 47961]);

const toGrid = (realX: number, realY: number) => ({
    x: realX - CITY_REAL.x,
    y: realY - CITY_REAL.y,
});

const CATHEDRAL = toGrid(WHISPERER_REAL.x, WHISPERER_REAL.y);
// The run starts on the forecourt at the top of the causeway to the cathedral's island, where she
// rises at the end
const START = toGrid(2656, 6406);

const POINTS: MapPoint[] = [
    { name: "the forecourt", ...START },
    { name: "the island", ...toGrid(2656, 6362) },
    { name: "the cathedral", ...CATHEDRAL },
    // The north streets, over the causeway
    { name: "the north streets", ...toGrid(2600, 6440) },
    // The plaza in the south-east, round the water
    { name: "the south-east plaza", ...toGrid(2725, 6300) },
];

// The city's bridges as they are in OSRS: some can't be walked end to end (ruined ends too steep to
// climb, lamps and benches standing on them), and none is a road of ours (check-maps.ts holds a
// road to being walkable)
const CLOSED_BRIDGES: ClosedRoad[] = [
    { x0: ARENA_0, y0: ARENA_0, x1: ARENA_1, y1: ARENA_1, shownBy: "rubble" },
];

// A loc's place, wherever it's cut from: the realm's stand where the city's do
const locKey = (loc: PlacedLoc) => `${loc.x},${loc.y},${loc.level},${loc.type},${loc.rotation}`;

// The same hash for a loc wherever it's built, so the map's the same every time
const hash = (x: number, y: number, id = 0) =>
    ((Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(id, 2246822519)) >>> 0) /
    0xffffffff;

// Thinned for phones (scripts/scaperune/view-weight.ts PHONE=1, then frameProbe in the game): the
// share of each heavy loc kept, by the city's id
const KEPT: Record<number, number> = {
    // Its lamps are 3,000 triangles each: a few still stand
    48189: 0.25,
    // The ruined houses' walls (400 to 700 triangles a piece), with gaps where the rest fell
    47605: 0.15,
    47607: 0.15,
    47629: 0.25,
    47614: 0.25,
    47612: 0.2,
    47610: 0.2,
    47617: 0.2,
    47616: 0.2,
    47611: 0.2,
    47613: 0.2,
    47615: 0.2,
    47671: 0.3,
    47639: 0.3,
    47638: 0.3,
    47634: 0.3,
    47632: 0.3,
    47631: 0.5,
    47636: 0.5,
    47633: 0.5,
    // What's left in the houses: tables, cupboards, beds, carts, the barracks' ballistae and racks
    47975: 0.2,
    48168: 0.3,
    48163: 0.3,
    48164: 0.3,
    47989: 0.3,
    47982: 0.25,
    47980: 0.3,
    48172: 0.3,
    48194: 0.4,
    47983: 0.4,
    48005: 0.4,
    47974: 0.2,
    47976: 0.2,
    47618: 0.4,
    47630: 0.3,
    47635: 0.3,
    37773: 0.4,
    // Its braziers, its barracks' dummies, ranges and doors left standing in their frames
    47961: 0.5,
    47978: 0.3,
    48169: 0.3,
    48272: 0,
    48273: 0,
    47985: 0.4,
    48123: 0.5,
    // The walls' trims, and rubble on the floor
    47669: 0.5,
    42622: 0.5,
    46950: 0.5,
};
// And the rest of the houses' furniture, by name: a third stays
const FURNITURE =
    /table|cupboard|bed|cart|rack|barrel|crate|shel|chair|stool|bench|ballista|book|chest|drawer|wardrobe|pot|sack|box|cabinet/i;
const FURNITURE_KEPT = 0.33;

// The play camera looks north from about 70 degrees: ground that a rise south of it hides (the city's
// steps down to its water) is blocked, so nobody fights where they can't be seen. As check-maps.ts
// works it out.
const CAMERA_LINE = 44;
const HIDING_REACH = 24;

function cornerHeight(grid: TileGrid, x: number, y: number, level = 0): number {
    const cx = Math.min(Math.max(x, 0), grid.sizeX - 0.001);
    const cy = Math.min(Math.max(y, 0), grid.sizeY - 0.001);
    const tx = Math.floor(cx);
    const ty = Math.floor(cy);
    const corners = grid.sizeX + 1;
    const heights = grid.levels[level].heights;
    const at = tx + ty * corners;
    const south = heights[at] + (heights[at + 1] - heights[at]) * (cx - tx);
    const north =
        heights[at + corners] + (heights[at + corners + 1] - heights[at + corners]) * (cx - tx);
    return south + (north - south) * (cy - ty);
}

function blockHidden(grid: TileGrid): void {
    for (let y = ARENA_0; y <= ARENA_1; y++) {
        for (let x = ARENA_0; x <= ARENA_1; x++) {
            const i = x + y * grid.sizeX;
            const bridge = (grid.levels[1].flags[i] & TILE_BRIDGE) !== 0;
            const height =
                cornerHeight(grid, x + 0.5, y + 0.5) +
                (bridge ? cornerHeight(grid, x + 0.5, y + 0.5, 1) : 0);
            for (let reach = 1; reach <= HIDING_REACH; reach++) {
                if (cornerHeight(grid, x + 0.5, y + 0.5 - reach) > height + CAMERA_LINE * reach) {
                    // A bridge's deck is walked on its own level's flags
                    grid.levels[bridge ? 1 : 0].flags[i] |= TILE_BLOCKED;
                    break;
                }
            }
        }
    }
}

function cutSide(context: BuildContext, real: { x: number; y: number }): TileGrid {
    return cutPrefab(context.maps, real.x + CUT.x, real.y + CUT.y, CUT.sizeX, CUT.sizeY);
}

// What comes off the city: its doors, its clutter but the lamps, and what's thinned
function cityLocsOff(context: BuildContext, city: TileGrid): (loc: PlacedLoc) => boolean {
    const blocking = skipBlocking(context, { doors: true, props: "one-tile", prefab: city });
    return (loc) => {
        if (blocking(loc) && !KEPT_PROPS.has(loc.id)) {
            return true;
        }
        const share =
            KEPT[loc.id] ??
            ((loc.type === 10 || loc.type === 11) && FURNITURE.test(context.locs(loc.id).name)
                ? FURNITURE_KEPT
                : undefined);
        return share !== undefined && hash(loc.x, loc.y, loc.id) >= share;
    };
}

function build(context: BuildContext, realm: boolean): GeneratedMap {
    const ground = new Ground(SIZE, SIZE);
    const city = cutSide(context, CITY_REAL);
    const off = cityLocsOff(context, city);
    // The realm's locs come off where the city's twins do, so both are drawn alike
    const cityOff = new Set(city.locs.filter(off).map(locKey));
    const side = realm ? cutSide(context, REALM_REAL) : city;
    const realmBlocking = skipBlocking(context, { doors: true, props: "one-tile", prefab: side });
    const skipLoc = realm
        ? (loc: PlacedLoc) =>
              cityOff.has(locKey(loc)) || (realmBlocking(loc) && !KEPT_PROPS.has(loc.id))
        : off;
    ground.stamp(side, CUT.x, CUT.y, {
        floor: "all",
        feather: 0,
        flatten: false,
        height: 0,
        anchor: 0,
        skipLoc,
    });
    // Nothing outside the arena is walked on
    const level = ground.grid.levels[0];
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (x < ARENA_0 || x > ARENA_1 || y < ARENA_0 || y > ARENA_1) {
                level.flags[x + y * SIZE] |= TILE_BLOCKED;
            }
        }
    }
    blockHidden(ground.grid);
    // The realm's collision is never used (the sim has the city's), so it's sealed as the
    // city's is only to be checked alike
    const arena = { x0: ARENA_0, y0: ARENA_0, x1: ARENA_1, y1: ARENA_1 };
    const sealed = sealFrom(ground.grid, context.locs, [
        { name: "the city", rect: arena, from: START },
    ]);
    if (!realm) {
        assertReachable(sealed, POINTS, "Lassar Undercity");
    }
    return {
        grid: ground.grid,
        footprint: ground.footprint,
        roadTiles: new Uint8Array(SIZE * SIZE),
        lines: [],
        buildings: [],
        landmarks: [],
        passes: [],
        walkSlope: 48,
        caves: [],
        falls: [],
        waterfalls: [],
        // All of it is the real world's
        designed: [{ x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 }],
        closedRoads: CLOSED_BRIDGES,
    };
}

// The realm's squares: not a map of their own, only what's drawn in the city's place
// (MapDef.twin), installed with it
export const LASSAR_REALM_RECIPE: MapRecipe = {
    id: "lassar_undercity_realm",
    mapX: MAP_X + TWIN_SQUARES,
    mapY: MAP_Y,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    spawn: START,
    build: (context) => build(context, true).grid,
};

export const LASSAR_RECIPE: MapRecipe = {
    id: "lassar_undercity",
    mapX: MAP_X,
    mapY: MAP_Y,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    spawn: START,
    build: (context) => build(context, false).grid,
    detail: (context) => build(context, false),
    points: POINTS,
    twin: LASSAR_REALM_RECIPE,
};

// In world tiles: the cathedral's middle (where the Whisperer rises)
export const LASSAR_CATHEDRAL = {
    x: MAP_X * MAP_SQUARE_SIZE + CATHEDRAL.x + 0.5,
    y: MAP_Y * MAP_SQUARE_SIZE + CATHEDRAL.y + 0.5,
};
