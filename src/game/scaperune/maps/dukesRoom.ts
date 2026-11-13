import { Ground } from "../Ground";
import { assertReachable, sealFrom } from "../collision";
import { MAP_SQUARE_SIZE, type PlacedLoc, TILE_BLOCKED } from "../format";
import type { GeneratedMap } from "../generator";
import { LOC_NORMAL, LOC_WALL, WALL_EAST, WALL_WEST } from "../mapBuild";
import { cutPrefab } from "../prefab";
import type { BuildContext, MapPoint, MapRecipe } from "../recipe";

// The Awakened Duke Sucellus's room in Ghorrock Prison (content/duke.ts,
// docs/design/awakened-duke.md): the real room, square 47,100's ground floor, cut from the cache.
// In the cache it's 11 tiles across between its walls, the alcove he sits in at its north end 21
// across, and a fight needs more room than 11. So it's widened to the alcove's width: its side
// walls and what stands along them (salt deposits, buttresses) are moved out four tiles each way,
// and the corner rocks at its south end five tiles south, opening the room to 19 by 19 inside.
// The alcove's left as it is, and the cache's black round it all.
//
// What the fight reads off it is exported here in grid tiles: the braziers (drawn by the game,
// stand-ins here), the vents (the nine holes in the room's floor), the statues that hide you from
// his gaze, his spot and the fight's square.

const MAP_X = 68;
const MAP_Y = 112;
const SQUARES = 3;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;

type Tile = { x: number; y: number };

// The real square, and where a tile of it lands on the grid: the room in the middle square
const REAL = { x: 47 * MAP_SQUARE_SIZE, y: 100 * MAP_SQUARE_SIZE };
const SHIFT = { x: 64, y: 60 };
const grid = (x: number, y: number): Tile => ({ x: x + SHIFT.x, y: y + SHIFT.y });
// What's cut, in the square's own tiles: the room, its alcove and the black either side
const CUT = { x0: 18, y0: 29, x1: 44, y1: 63 };
// The room as it's widened (the square's tiles): its walls' rows, and its south end
const ROOM = { x0: 21, x1: 41, y0: 34, y1: 52 };
const WIDEN = 4;
const SOUTH = 5;
// The room's walls, its floor's border stone, and the cache's black filler
const WALL = 20980;
const FLOOR = 255;
const FILLER = 46649;
const HIDDEN = 42;
const BRAZIER_STAND_IN = 48122;
// The prison's statue: what hides you from his gaze
const STATUE = 49090;

const at = (list: Tile[]) => list.map(({ x, y }) => grid(x, y));

// The Duke's 7 by 7 in the alcove (its south-west tile), and its middle, where he's drawn from
export const DUKE_SPOT = { ...grid(28, 52), size: 7 };
export const DUKE_MIDDLE = { x: DUKE_SPOT.x + 3.5, y: DUKE_SPOT.y + 3.5 };
// The square the party's held in: the widened room (the alcove's blocked)
export const DUKE_ROOM = { ...grid(ROOM.x0, ROOM.y0), size: ROOM.x1 - ROOM.x0 + 1 };
const START: Tile = grid(31, 44);

// Braziers, 2 by 2 from their south-west tiles: two by his alcove (in his sight, and near enough
// for Kindle's flare), two in the south corners (each behind a statue)
export const DUKE_BRAZIERS: Tile[] = at([
    { x: 23, y: 49 },
    { x: 38, y: 49 },
    { x: 23, y: 35 },
    { x: 38, y: 35 },
]);

// The room's floor vents, the middles of their 3 by 3 clouds: the cache's nine holes
export const DUKE_VENTS: Tile[] = at(
    [42, 46, 50].flatMap((y) => [28, 31, 34].map((x) => ({ x, y }))),
).map(({ x, y }) => ({ x: x + 0.5, y: y + 0.5 }));

// The statues, 2 by 2 from their south-west tiles: the two by the south braziers, one either side,
// one south of the vents and one among them (its shadow's in their gas)
export const DUKE_STATUES: Tile[] = at([
    { x: 26, y: 41 },
    { x: 35, y: 41 },
    { x: 23, y: 45 },
    { x: 38, y: 45 },
    { x: 31, y: 38 },
    { x: 30, y: 47 },
]);

const POINTS: MapPoint[] = [
    { name: "start", ...START },
    ...DUKE_BRAZIERS.map((b, i) => ({ name: `brazier ${i}'s side`, x: b.x, y: b.y + 2 })),
];

function inRoom(x: number, y: number): boolean {
    return x >= ROOM.x0 && x <= ROOM.x1 && y >= ROOM.y0 && y <= ROOM.y1;
}

// Where one of the cut's locs goes, in the square's tiles, or undefined to leave it out
function moved(loc: PlacedLoc): Tile | undefined {
    const { x, y } = loc;
    if (y < ROOM.y0) {
        return undefined;
    }
    if (loc.id === FILLER) {
        return inRoom(x, y) ? undefined : { x, y };
    }
    // The floor's carpet, and the alcove, as they are
    if (loc.type === 22 || y > ROOM.y1) {
        return { x, y };
    }
    // The corner rocks, and what's at the room's south end, five tiles south
    if (y < ROOM.y0 + SOUTH) {
        return { x, y: y - SOUTH };
    }
    // The side walls and what's along them, out to the alcove's width
    if (x <= 28) {
        return { x: x - WIDEN, y };
    }
    if (x >= 34) {
        return { x: x + WIDEN, y };
    }
    return { x, y };
}

function buildDetail(context: BuildContext): GeneratedMap {
    const ground = new Ground(SIZE, SIZE);
    const sizeX = CUT.x1 - CUT.x0 + 1;
    const sizeY = CUT.y1 - CUT.y0 + 1;
    const cut = cutPrefab(context.maps, REAL.x + CUT.x0, REAL.y + CUT.y0, sizeX, sizeY);
    const origin = grid(CUT.x0, CUT.y0);
    const level = ground.level0;
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            ground.setHeight(x, y, cut.levels[0].heights[0]);
        }
    }
    ground.stamp(cut, origin.x, origin.y, {
        floor: "all",
        feather: 0,
        flatten: true,
        height: cut.levels[0].heights[0],
        skipLoc: () => true,
    });
    for (const loc of cut.locs) {
        if (loc.level !== 0) {
            continue;
        }
        const to = moved({ ...loc, x: loc.x + CUT.x0, y: loc.y + CUT.y0 });
        if (to) {
            const { x, y } = grid(to.x, to.y);
            ground.grid.locs.push({ ...loc, level: 0, x, y });
        }
    }
    // The widened floor: the room's border stone where the cache has none, the old walls' rows
    // and under the corner rocks too
    for (let y = ROOM.y0 - SOUTH; y <= ROOM.y1; y++) {
        for (let x = ROOM.x0; x <= ROOM.x1; x++) {
            const i = ground.tile(grid(x, y).x, grid(x, y).y);
            if (level.overlays[i] === HIDDEN && y >= ROOM.y0 && !isVent(x, y)) {
                level.overlays[i] = FLOOR;
            }
            if (level.overlays[i] === 0 && level.underlays[i] === 0) {
                level.overlays[i] = FLOOR;
                level.shapes[i] = 0;
            }
        }
    }
    // Only its ground floor's wanted: the cache's levels above it mark tiles of it as bridges
    for (const upper of ground.grid.levels.slice(1)) {
        upper.flags.fill(0);
    }
    // The cache's blocked tiles under its walls and rocks, now inside: open (his row's kept)
    for (let y = ROOM.y0; y < ROOM.y1; y++) {
        for (let x = ROOM.x0 + 1; x < ROOM.x1; x++) {
            level.flags[ground.tile(grid(x, y).x, grid(x, y).y)] &= ~TILE_BLOCKED;
        }
    }
    // Its side walls past where the cache's ran, down to the corner rocks
    for (let y = ROOM.y0; y < ROOM.y0 + SOUTH; y++) {
        const west = grid(ROOM.x0, y);
        const east = grid(ROOM.x1, y);
        ground.grid.locs.push({ id: WALL, type: LOC_WALL, rotation: WALL_EAST, level: 0, ...west });
        ground.grid.locs.push({ id: WALL, type: LOC_WALL, rotation: WALL_WEST, level: 0, ...east });
    }
    const standIns: PlacedLoc[] = [];
    for (const brazier of DUKE_BRAZIERS) {
        for (let ty = brazier.y; ty < brazier.y + 2; ty++) {
            for (let tx = brazier.x; tx < brazier.x + 2; tx++) {
                level.flags[ground.tile(tx, ty)] |= TILE_BLOCKED;
            }
        }
        standIns.push({
            id: BRAZIER_STAND_IN,
            type: LOC_NORMAL,
            rotation: 0,
            level: 0,
            ...brazier,
        });
    }
    for (const statue of DUKE_STATUES) {
        ground.grid.locs.push({ id: STATUE, type: LOC_NORMAL, rotation: 0, level: 0, ...statue });
    }
    // Everything but the room is solid: the alcove, the corridor south, the black. His own 7 by 7
    // isn't, so he can stand on it (he's solid himself)
    const spot = DUKE_SPOT;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const his =
                x >= spot.x && x < spot.x + spot.size && y >= spot.y && y < spot.y + spot.size;
            if (his) {
                level.flags[x + y * SIZE] &= ~TILE_BLOCKED;
            } else if (!inRoom(x - SHIFT.x, y - SHIFT.y)) {
                level.flags[x + y * SIZE] |= TILE_BLOCKED;
            }
        }
    }
    const room = grid(ROOM.x0, ROOM.y0);
    const rect = {
        x0: room.x,
        y0: room.y,
        x1: room.x + ROOM.x1 - ROOM.x0,
        y1: room.y + ROOM.y1 - ROOM.y0,
    };
    const sealed = sealFrom(ground.grid, context.locs, [
        { name: "the Duke's room", rect, from: START, maxSealed: 260 },
    ]);
    assertReachable(sealed, POINTS, "the Duke's room");
    return {
        grid: ground.grid,
        footprint: ground.footprint,
        roadTiles: new Uint8Array(SIZE * SIZE),
        lines: [],
        buildings: [],
        landmarks: [],
        passes: [],
        walkSlope: 12,
        caves: [],
        falls: [],
        waterfalls: [],
        standIns,
        designed: [
            { x0: origin.x, y0: origin.y, x1: origin.x + sizeX - 1, y1: origin.y + sizeY - 1 },
        ],
    };
}

function isVent(x: number, y: number): boolean {
    return [42, 46, 50].includes(y) && [28, 31, 34].includes(x);
}

export const DUKES_ROOM_RECIPE: MapRecipe = {
    id: "awakened_duke",
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

export function dukesRoomWorld(tile: Tile): Tile {
    return { x: MAP_X * MAP_SQUARE_SIZE + tile.x, y: MAP_Y * MAP_SQUARE_SIZE + tile.y };
}
