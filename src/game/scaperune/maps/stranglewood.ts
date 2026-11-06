import { Ground } from "../Ground";
import { assertReachable, sealFrom } from "../collision";
import { MAP_SQUARE_SIZE, type PlacedLoc, TILE_BLOCKED } from "../format";
import type { GeneratedMap } from "../generator";
import { createNoise } from "../noise";
import { cutPrefab } from "../prefab";
import type { BuildContext, MapPoint, MapRecipe } from "../recipe";
import { getTileSlope } from "../terrain";

// The Stranglewood, Act II's first map (content/maps.ts): the real wood round Vardorvis's arena,
// map squares 17 to 18 by 52 to 53, cut whole from the cache with the squares round it for its
// margin. In OSRS the wood between its paths is blocked ground under the undergrowth, which leaves
// paths two to five tiles wide: far too narrow for a crowd, or for roots to creep along. So the cut
// opens it: the undergrowth's ground is walkable inside the arena, but for a band of wood along the
// arena's edge and thickets left standing in it, so it reads as a forest you fight through, with
// the wood itself (where the roots creep from) round it. Its trees, ruins, ferns and rocks are all
// the real ones, where they stand. Vardorvis's arena loses its low fence and is the clearing the
// roots never take (MapDef.rule's safe circle): the run starts in it, as the final fight does.
// Its fence would have made a pen of it with no way in, and its wall's drawn but doesn't block, so
// both go, and the clearing's open on every side.

const MAP_X = 94;
const MAP_Y = 66;
const SQUARES = 4;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;

// The real world under the grid's south-west corner: squares 16, 51
const REAL_X = 16 * MAP_SQUARE_SIZE;
const REAL_Y = 51 * MAP_SQUARE_SIZE;

// The arena, in grid tiles (the squares inside the margin)
const ARENA_0 = MARGIN * MAP_SQUARE_SIZE;
const ARENA_1 = (SQUARES - MARGIN) * MAP_SQUARE_SIZE - 1;

// Vardorvis's arena in the real world: the fence round it (loc 85, the collision) and the low
// stone border drawn round it (floor decorations, one a tile) come off, both ends in
const FENCE = { x0: 1118, y0: 3406, x1: 1140, y1: 3430 };
const FENCE_LOC = 85;
const WALL_LOCS = { from: 48470, to: 48494 };
// And the ring of low wall inside it, with its posts (floor decorations too)
const INNER_WALL_LOCS = [48453, 48456];
// Where he stands in OSRS (npc-spawns), the clearing's middle
const CLEARING_REAL = { x: 1128, y: 3417 };

// The wood along the arena's edge that stays as it is, in tiles
const EDGE_WOOD = 7;
// Thickets left standing: where the noise is over this, at this scale (tiles a feature)
const THICKET = 0.66;
const THICKET_SCALE = 14;
const THICKET_SEED = 52;
// Ground this steep stays blocked (the hills' faces), in height units a tile
const STEEP = 48;
// None near the clearing: the safe circle's ground is open all round it
const CLEAR_OF_CLEARING = 14;
// The undergrowth (soft scenery that blocks: plants, bushes, ferns, mushrooms) comes off the opened
// ground but for this share of it, which is left standing as dressing to walk round
const UNDERGROWTH = /plant|bush|fern|mushroom/i;
const UNDERGROWTH_KEPT = 0.25;
// The ground's own plants (floor decorations and mushrooms that block nothing) are thinned all
// over, for phones: the wood's floor is a few hundred triangles a tile otherwise. The shares of
// each kept, the heavier fewer (scripts/scaperune/view-weight.ts PHONE=1 says what's heavy)
const GROUND_KEPT: Record<number, number> = {
    48529: 0.1,
    48516: 0.1,
    48559: 0.1,
    48568: 0.1,
    41433: 0.1,
    48531: 0.1,
    42408: 0.15,
    41432: 0.2,
    41538: 0.2,
    33458: 0.2,
    // The arena's own floor of bones and blood
    48508: 0.5,
    48510: 0.5,
    48453: 0.5,
    48454: 0.4,
    48566: 0.2,
    48557: 0.2,
    48558: 0.2,
    48623: 0.2,
    48624: 0.2,
    48625: 0.2,
    48626: 0.2,
    48627: 0.2,
    48628: 0.2,
    48629: 0.2,
    48630: 0.2,
    48631: 0.2,
    48632: 0.2,
    48532: 0.2,
    48567: 0.2,
    48525: 0.2,
    559: 0.2,
};
// The trees on the opened ground: a quarter of them, the rest left standing to walk round. Each
// is over a thousand triangles.
const TREE = /^(strangled tree|pine tree|pine)$/i;
const TREES_KEPT = 0.25;
// And in the wood itself (the arena's edge and its thickets), a quarter too; and round
// Vardorvis's arena, where the last fight is drawn with the crowd, his attacks and the roots, an
// eighth, within this far of its middle
const WOOD_TREES_KEPT = 0.25;
const CLEARING_TREES_KEPT = 0.12;
const CLEARING_VIEW = 20;
// The ruined town's pillars (1,300 to 1,500 triangles each) are ruins: a quarter stand, but those
// round Vardorvis's arena, which are his
const PILLAR = /^(broken )?pillar$/i;
const PILLARS_KEPT = 0.25;
// The ruined town's walls (200 to 400 triangles a piece): some of each stays, with gaps where the
// rest fell; of the carcasses round Vardorvis's arena (2,000 each), a fifth; and in the margin's
// wood, the heavy scenery no one stands among
const RUINS_KEPT: Record<number, number> = {
    48619: 0.17,
    48620: 0.2,
    48621: 0.35,
    48622: 0.35,
    48413: 0.2,
    48414: 0.2,
    48415: 0.2,
    48416: 0.2,
    48417: 0.2,
    42078: 0.3,
    // The wood's own undergrowth, where it's left standing (500 triangles a bush or plant)
    48545: 0.4,
    48547: 0.4,
    48548: 0.4,
    48549: 0.4,
    11911: 0.5,
    11912: 0.5,
    11913: 0.5,
    11914: 0.5,
    14540: 0.3,
    40552: 0.5,
    31780: 0.3,
    25095: 0.3,
};
// The ruined town's stepped tents (the Strangled Tents' heaviest pieces, 1,300 to 2,100 triangles
// each) come down: a phone can't draw a street of them, and their floors and the town's walls stay
const TENTS = { from: 48599, to: 48613 };
// The wood's own Tendrils lying on its floor (decorations): on the opened ground they'd read as
// roots (MapDef.rule) that don't hurt, so they're only in the wood
const FLOOR_TENDRILS = { from: 48495, to: 48502 };
// Water: the sea's overlays and the river's (map file ids, textured water)
const WATER_OVERLAYS = new Set([6, 442, 445, 448, 451]);

// The real wheat field in the margin's south-east square (19,51), in grid tiles
const MARGIN_FIELD = { x0: 223, y0: 1, x1: 235, y1: 10 };

const toGrid = (realX: number, realY: number) => ({ x: realX - REAL_X, y: realY - REAL_Y });

const CLEARING = toGrid(CLEARING_REAL.x, CLEARING_REAL.y);
// The player starts six tiles south of the clearing's middle, as the boss is north of you in OSRS
const START = { x: CLEARING.x, y: CLEARING.y - 6 };

const POINTS: MapPoint[] = [
    { name: "the start", ...START },
    { name: "the clearing", ...CLEARING },
];

function buildDetail(context: BuildContext): GeneratedMap {
    const ground = new Ground(SIZE, SIZE);
    const wood = cutPrefab(context.maps, REAL_X, REAL_Y, SIZE, SIZE);
    const noise = createNoise(THICKET_SEED, 2);
    // Whether a tile's ground is opened up: inside the arena, past the edge's band of wood, out of
    // the thickets and off the hills' faces; and always round the clearing
    const opened = (x: number, y: number): boolean => {
        if (x < ARENA_0 || x > ARENA_1 || y < ARENA_0 || y > ARENA_1) {
            return false;
        }
        if (Math.hypot(x - CLEARING.x, y - CLEARING.y) < CLEAR_OF_CLEARING) {
            return true;
        }
        const edge = Math.min(x - ARENA_0, ARENA_1 - x, y - ARENA_0, ARENA_1 - y);
        const thicket = noise(x / THICKET_SCALE, y / THICKET_SCALE) > THICKET;
        const steep = getTileSlope(wood.levels[0].heights, SIZE + 1, x, y) > STEEP;
        return edge >= EDGE_WOOD && !thicket && !steep;
    };
    // The same hash for a loc wherever it's built, so the map's the same every time
    const hash = (x: number, y: number, id = 0) =>
        ((Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(id, 2246822519)) >>> 0) /
        0xffffffff;
    const kept = (x: number, y: number) => hash(x, y) < UNDERGROWTH_KEPT;
    const thinned = (loc: PlacedLoc) => {
        if (loc.id >= TENTS.from && loc.id <= TENTS.to) {
            return true;
        }
        if (loc.id >= FLOOR_TENDRILS.from && loc.id <= FLOOR_TENDRILS.to && opened(loc.x, loc.y)) {
            return true;
        }
        const share = GROUND_KEPT[loc.id] ?? RUINS_KEPT[loc.id];
        if (share !== undefined) {
            return hash(loc.x, loc.y, loc.id) >= share;
        }
        if (loc.type !== 10 && loc.type !== 11) {
            return false;
        }
        const name = context.locs(loc.id).name;
        if (PILLAR.test(name)) {
            const his = Math.hypot(loc.x - CLEARING.x, loc.y - CLEARING.y) < CLEAR_OF_CLEARING;
            return !his && hash(loc.x, loc.y, 11) >= PILLARS_KEPT;
        }
        if (!TREE.test(name)) {
            return false;
        }
        const nearClearing = Math.hypot(loc.x - CLEARING.x, loc.y - CLEARING.y) < CLEARING_VIEW;
        const treesKept = nearClearing
            ? CLEARING_TREES_KEPT
            : opened(loc.x, loc.y)
              ? TREES_KEPT
              : WOOD_TREES_KEPT;
        return hash(loc.x, loc.y, 7) >= treesKept;
    };
    const undergrowth = (loc: PlacedLoc) => {
        if (loc.level !== 0 || (loc.type !== 10 && loc.type !== 11)) {
            return false;
        }
        const info = context.locs(loc.id);
        return info.clipType !== 0 && UNDERGROWTH.test(info.name) && opened(loc.x, loc.y);
    };
    const fence = (x: number, y: number) =>
        x + REAL_X >= FENCE.x0 &&
        x + REAL_X <= FENCE.x1 &&
        y + REAL_Y >= FENCE.y0 &&
        y + REAL_Y <= FENCE.y1;
    // The real heights, as they are
    ground.stamp(wood, 0, 0, {
        floor: "all",
        feather: 0,
        flatten: false,
        height: 0,
        anchor: 0,
        skipLoc: (loc) =>
            (loc.level === 0 &&
                (loc.id === FENCE_LOC ||
                    INNER_WALL_LOCS.includes(loc.id) ||
                    (loc.id >= WALL_LOCS.from && loc.id <= WALL_LOCS.to)) &&
                fence(loc.x, loc.y)) ||
            (undergrowth(loc) && !kept(loc.x, loc.y)) ||
            thinned(loc),
    });
    const level = ground.grid.levels[0];
    for (let y = ARENA_0; y <= ARENA_1; y++) {
        for (let x = ARENA_0; x <= ARENA_1; x++) {
            const i = x + y * SIZE;
            if (WATER_OVERLAYS.has(level.overlays[i])) {
                level.flags[i] |= TILE_BLOCKED;
            } else if (opened(x, y)) {
                level.flags[i] &= ~TILE_BLOCKED;
            }
        }
    }
    // What can't be walked to from the start is blocked, so nothing turns up stranded
    const arena = { x0: ARENA_0, y0: ARENA_0, x1: ARENA_1, y1: ARENA_1 };
    const sealed = sealFrom(ground.grid, context.locs, [
        { name: "the wood", rect: arena, from: START },
    ]);
    assertReachable(sealed, POINTS, "Stranglewood");
    return {
        grid: ground.grid,
        footprint: ground.footprint,
        roadTiles: new Uint8Array(SIZE * SIZE),
        lines: [],
        buildings: [],
        landmarks: [],
        passes: [],
        walkSlope: STEEP,
        caves: [],
        falls: [],
        waterfalls: [],
        // All of it is the real world's
        designed: [{ x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 }],
        // A wheat field in the margin, on its hillside as the real one is
        fields: [{ ...MARGIN_FIELD, slopes: true }],
    };
}

export const STRANGLEWOOD_RECIPE: MapRecipe = {
    id: "stranglewood",
    mapX: MAP_X,
    mapY: MAP_Y,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    spawn: START,
    build: (context) => buildDetail(context).grid,
    detail: buildDetail,
    points: POINTS,
};

// In world tiles: the clearing's middle (where Vardorvis rises), and the spawn
export const STRANGLEWOOD_CLEARING = {
    x: MAP_X * MAP_SQUARE_SIZE + CLEARING.x + 0.5,
    y: MAP_Y * MAP_SQUARE_SIZE + CLEARING.y + 0.5,
};
