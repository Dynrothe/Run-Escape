import type { Ground } from "./Ground";
import { TILE_BLOCKED, TILE_SHOWN } from "./format";

// City walls as the real ones are built. A real city wall isn't one loc: it's a band of tiles,
// with a face on the far edge of the tiles each side of a blocked middle, and a walkway a level up
// over the lot, railed on both sides. The upper level's tiles are flagged to show from the ground,
// which is the one thing the game draws above its plane. The ids and numbers are all measured:
// scripts/scaperune/research/wall-survey.ts reads a place's section, corners and gates.

// The settings read this file, so it can't lean on mapBuild for these
const LOC_WALL = 0;
const LOC_POST = 1;
const LOC_INNER_CORNER = 2;
const LOC_DIAGONAL = 9;
const LOC_NORMAL = 10;

// A wall on a tile's north edge, as walls are in this file's frame: see getSide
const NORTH = 1;
const EAST = 2;
const SOUTH = 3;
const WEST = 0;

// One face of a wall: the wall on the ground and the rail on top of it, a level up
export type WallFace = { wall: number; rail: number };

// A loc of a gate: tiles along the wall from the gate's first column, tiles in from the wall's
// middle (the outer face's tile is -1), level, id, type and rotation, with the outside to the south
export type GatePart = [
    along: number,
    across: number,
    level: number,
    id: number,
    type: number,
    rotation: number,
];

export type CityWallKit = {
    label: string;
    outer: WallFace;
    inner: WallFace;
    // The walkway's floor, as the map files store it, how high it stands in height units, and how
    // many tiles wide it is
    walk: number;
    rise: number;
    width: number;
    // How many tiles a corner's cut back on the diagonal, as the real ones are. 0 is square.
    // Only walkways a tile wide have a diagonal.
    chamfer: number;
    // Columns a gate takes up. With no parts, the wall ends with a cap either side of the gap, and
    // the first and last of those columns have the cap on them: you can walk through them all.
    gateSize: number;
    gateParts?: GatePart[];
    // A buttress against the outer face, every so many tiles
    pier?: { id: number; every: number };
    // For the automatic choice: the town families and the biomes it suits
    families: string[];
    biomes: string[];
};

// Rotation 0 faces west, and each turn goes clockwise, so [outer, inner] rotate with the side
export const CITY_WALLS = {
    // Falador's: the south-east stretch at 2935,3372, and its north gate at 2963 to 2968,3392
    falador: {
        label: "Falador",
        outer: { wall: 24029, rail: 24026 },
        inner: { wall: 24029, rail: 24035 },
        walk: 123,
        rise: 37,
        width: 1,
        chamfer: 3,
        families: ["lumbridge"],
        biomes: ["meadow"],
        gateSize: 6,
        gateParts: [
            [0, -1, 0, 24029, LOC_POST, 0],
            [0, -1, 1, 24026, LOC_POST, 0],
            [0, 0, 0, 24029, LOC_WALL, 0],
            [0, 0, 1, 24028, LOC_WALL, 0],
            [0, 0, 0, 23982, LOC_NORMAL, 0],
            [0, 0, 1, 23985, LOC_NORMAL, 0],
            [0, 1, 0, 24029, LOC_POST, 3],
            [0, 1, 1, 24035, LOC_POST, 3],
            [0, 1, 0, 23983, LOC_NORMAL, 0],
            [0, 1, 1, 23986, LOC_NORMAL, 0],
            [0, 2, 0, 23984, LOC_NORMAL, 0],
            [0, 2, 1, 23987, LOC_NORMAL, 0],
            [5, -1, 0, 24029, LOC_POST, 1],
            [5, -1, 1, 24026, LOC_POST, 1],
            [5, 0, 0, 24175, LOC_WALL, 2],
            [5, 0, 1, 24027, LOC_WALL, 2],
            [5, 0, 0, 23988, LOC_NORMAL, 2],
            [5, 0, 1, 23991, LOC_NORMAL, 2],
            [5, 1, 0, 24029, LOC_POST, 2],
            [5, 1, 1, 24035, LOC_POST, 2],
            [5, 1, 0, 23989, LOC_NORMAL, 2],
            [5, 1, 1, 23992, LOC_NORMAL, 2],
            [5, 2, 0, 23990, LOC_NORMAL, 2],
            [5, 2, 1, 23993, LOC_NORMAL, 2],
        ],
    },
    // Varrock's north-west wall at 3186 to 3188,3464, with its gap for the road at 3189,3489
    varrock: {
        label: "Varrock",
        outer: { wall: 23795, rail: 23777 },
        inner: { wall: 23795, rail: 23777 },
        walk: 171,
        rise: 37,
        width: 1,
        chamfer: 3,
        gateSize: 6,
        pier: { id: 23811, every: 6 },
        families: ["varrock"],
        biomes: ["meadow"],
    },
} satisfies Record<string, CityWallKit>;

export type CityWallId = keyof typeof CITY_WALLS;

export const CITY_WALL_IDS = Object.keys(CITY_WALLS) as CityWallId[];

// The middle of a wall's walkway, in tiles: the corners of the rectangle it runs round
export type WallRect = { x0: number; y0: number; x1: number; y1: number };

// Which side of a rectangle: its turn from south, clockwise
export type WallSide = "south" | "west" | "north" | "east";

export const WALL_SIDES: WallSide[] = ["south", "west", "north", "east"];

// A gate, by the tile at its middle along that side: an x on the north and south, a y on the others
export type CityGate = { side: WallSide; at: number };

// A side of the rectangle in its own frame, the same on every side: along runs from one corner
// to the next, across runs in, and the outside's to the south. Going along, the sides come
// round anticlockwise.
export function getWallSide(rect: WallRect, turn: number) {
    const { x0, y0, x1, y1 } = rect;
    return {
        length: turn & 1 ? y1 - y0 : x1 - x0,
        x: (along: number, across: number) =>
            [x0 + along, x0 + across, x1 - along, x1 - across][turn],
        y: (along: number, across: number) =>
            [y0 + across, y1 - along, y1 - across, y0 + along][turn],
    };
}

// Where a gate is on its side: the first of the columns it takes up
export function getGateColumns(kit: CityWallKit, rect: WallRect, gate: CityGate) {
    const turn = WALL_SIDES.indexOf(gate.side);
    const side = getWallSide(rect, turn);
    const along = turn === 0 || turn === 3 ? gate.at - (turn ? rect.y0 : rect.x0) : 0;
    const back = turn === 1 ? rect.y1 - gate.at : rect.x1 - gate.at;
    const start = (turn === 0 || turn === 3 ? along : back) - ((kit.gateSize - 1) >> 1);
    return { turn, side, start };
}

// The tiles a wall stands on, for keeping things off them before it goes up
export function forWallTiles(
    kit: CityWallKit,
    rect: WallRect,
    visit: (x: number, y: number) => void,
): void {
    for (let turn = 0; turn < 4; turn++) {
        const side = getWallSide(rect, turn);
        for (let along = -1; along <= side.length + 1; along++) {
            for (let across = -1; across <= kit.width; across++) {
                visit(side.x(along, across), side.y(along, across));
            }
        }
    }
}

// Builds a wall round a rectangle. skip says where it can't stand: it stops short of those tiles
// with a cap, as it does at a gate. A hand-made map calls this once its heights are done: the wall
// goes up on the ground as it is, and only needs a Ground. Keep gates on flat ground: a gate's
// locs that aren't contoured show their undersides on a slope.
export function placeCityWall(
    ground: Ground,
    kit: CityWallKit,
    rect: WallRect,
    gates: CityGate[],
    skip: (x: number, y: number) => boolean = () => false,
): void {
    const { outer, inner, walk, rise, width, chamfer, pier } = kit;
    const levelUp = ground.grid.levels[1];
    const corners = ground.sizeX + 1;
    const free = (x: number, y: number) => ground.inside(x, y) && !skip(x, y);

    // A floor a level up, flagged to show from the ground
    const shown = (x: number, y: number) => {
        levelUp.flags[ground.tile(x, y)] |= TILE_SHOWN;
        for (const corner of [0, 1, corners, corners + 1]) {
            levelUp.heights[x + y * corners + corner] = rise;
        }
    };
    const put = (
        id: number,
        type: number,
        rotation: number,
        level: number,
        x: number,
        y: number,
    ) => {
        ground.grid.locs.push({ id, type, rotation: rotation & 3, level, x, y });
        ground.reserved[ground.tile(x, y)] = 1;
        if (level > 0) {
            shown(x, y);
        }
    };
    const solid = (x: number, y: number) => {
        const i = ground.tile(x, y);
        ground.level0.flags[i] |= TILE_BLOCKED;
        ground.reserved[i] = 1;
        shown(x, y);
        levelUp.overlays[i] = walk;
    };
    // Half a tile of walkway, on the walkway's side of a diagonal
    const halfDeck = (rotation: number, x: number, y: number) => {
        const i = ground.tile(x, y);
        levelUp.overlays[i] = walk;
        levelUp.shapes[i] = 1;
        levelUp.rotations[i] = (rotation + 1) & 3;
    };

    const sides = WALL_SIDES.map((_, turn) => getWallSide(rect, turn));
    // Which columns of each side stand. A column's the tiles across the wall at one along.
    const columns = sides.map((side, turn) => {
        const stands = new Uint8Array(side.length + 1);
        for (let along = chamfer; along <= side.length - chamfer; along++) {
            let clear = 1;
            for (let across = -1; across <= width; across++) {
                clear &= free(side.x(along, across), side.y(along, across)) ? 1 : 0;
            }
            stands[along] = clear;
        }
        for (const gate of gates) {
            if (WALL_SIDES.indexOf(gate.side) === turn) {
                const { start } = getGateColumns(kit, rect, gate);
                stands.fill(0, Math.max(start, 0), start + kit.gateSize);
            }
        }
        return stands;
    });

    // Whether each side's first corner has room
    const cornersClear = sides.map((side) => {
        for (let across = -1; across <= Math.max(chamfer, width) + 1; across++) {
            for (let along = -1; along <= Math.max(chamfer, width) + 1; along++) {
                if (!free(side.x(along, across), side.y(along, across))) {
                    return false;
                }
            }
        }
        return true;
    });

    sides.forEach((side, turn) => {
        const stands = columns[turn];
        const last = side.length - chamfer;
        const walkEnd = chamfer > 0 ? last : side.length - width;
        const innerFrom = chamfer > 0 ? chamfer + 1 : width + 1;
        const innerTo = chamfer > 0 ? last - 1 : side.length - width - 1;
        const x = side.x;
        const y = side.y;
        // Both of a face, the wall and its rail
        const face = (
            { wall, rail }: WallFace,
            type: number,
            rotation: number,
            along: number,
            across: number,
        ) => {
            const at = [x(along, across), y(along, across)] as const;
            put(wall, type, rotation + turn, 0, ...at);
            put(rail, type, rotation + turn, 1, ...at);
        };

        // A run of wall, and a cap at each end that isn't a corner
        let along = chamfer;
        while (along <= last) {
            if (!stands[along]) {
                along++;
                continue;
            }
            const start = along;
            while (along <= last && stands[along]) {
                along++;
            }
            const end = along - 1;
            // Anything shorter than this is only a lump
            if (end - start < 2) {
                continue;
            }
            for (let at = start; at <= end; at++) {
                face(outer, LOC_WALL, NORTH, at, -1);
                if (at >= innerFrom && at <= innerTo) {
                    face(inner, LOC_WALL, SOUTH, at, width);
                }
                if (at <= walkEnd) {
                    for (let across = 0; across < width; across++) {
                        solid(x(at, across), y(at, across));
                    }
                }
                if (pier && (at - start + 3) % pier.every === 0 && end - at > 1) {
                    const tile = [x(at, -1), y(at, -1)] as const;
                    put(pier.id, LOC_NORMAL, NORTH + turn, 0, ...tile);
                }
            }
            if (start > chamfer) {
                face(outer, LOC_POST, NORTH, start - 1, -1);
                face(inner, LOC_POST, EAST, start - 1, width);
                for (let across = 0; across < width; across++) {
                    face(outer, LOC_WALL, EAST, start - 1, across);
                }
            }
            if (end < last) {
                face(outer, LOC_POST, WEST, end + 1, -1);
                face(inner, LOC_POST, SOUTH, end + 1, width);
                for (let across = 0; across < width; across++) {
                    face(outer, LOC_WALL, WEST, end + 1, across);
                }
            }
        }

        // The corner at this side's start, where the side before it comes in
        const before = (turn + 1) % 4;
        const stood =
            cornersClear[turn] &&
            columns[before][sides[before].length - chamfer] &&
            stands[chamfer];
        if (stood && chamfer === 0) {
            face(outer, LOC_POST, NORTH, -1, -1);
            face(inner, LOC_INNER_CORNER, SOUTH, width, width);
        } else if (stood) {
            const c = chamfer;
            for (let i = 1; i < c; i++) {
                solid(x(i, c - i), y(i, c - i));
            }
            for (let i = 0; i < c; i++) {
                face(outer, LOC_DIAGONAL, NORTH, i, c - 1 - i);
                face(inner, LOC_DIAGONAL, SOUTH, i + 1, c - i);
                halfDeck(NORTH + turn, x(i, c - 1 - i), y(i, c - 1 - i));
                halfDeck(SOUTH + turn, x(i + 1, c - i), y(i + 1, c - i));
            }
            for (let i = 0; i <= c; i++) {
                face(outer, LOC_POST, NORTH, i - 1, c - 1 - i);
            }
            for (let i = 0; i < c - 1; i++) {
                face(inner, LOC_POST, SOUTH, i + 2, c - i);
            }
        }
    });

    for (const gate of gates) {
        const { turn, side, start } = getGateColumns(kit, rect, gate);
        for (const [along, across, level, id, type, rotation] of kit.gateParts ?? []) {
            const tileX = side.x(start + along, across);
            const tileY = side.y(start + along, across);
            put(id, type, rotation + turn, level, tileX, tileY);
        }
    }
}
