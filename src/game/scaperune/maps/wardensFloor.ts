import {
    createAsciiFloor,
    createFireAndIce,
    createMosaicFloor,
    createPlatesAndPhases,
    createSepulchreCircle,
    createSlabIslands,
    createStoneHall,
    createTerraces,
} from "../../content/floorDemos";
import type { FloorDef, WaveDef } from "../../content/types";
import { createWardensFloor } from "../../content/wardensFloor";
import { Ground } from "../Ground";
import { SealRegion, assertReachable, sealFrom } from "../collision";
import { MAP_SQUARE_SIZE, TILE_BRIDGE } from "../format";
import type { GeneratedMap } from "../generator";
import { LOC_FLOOR_DECORATION } from "../mapBuild";
import { cutPrefab } from "../prefab";
import { BuildContext, MapPoint, MapRecipe } from "../recipe";

// A prototype, for trying out a floor that fights back (content/wardensFloor.ts): the Wardens'
// room in the Tombs of Amascut (map square 59,80, level 1), cut whole from the cache. Its own
// floor is left out, the hidden overlay under every tile of it, because the game draws that floor
// itself, tile by tile, as the slabs that rise out of it in the real fight (client/FloorView.ts):
// a tile that's dropped away then leaves the void's black. Everything else is the room as it is.
//
// Dev server only (maps/devMaps.ts). The same room, on squares of their own, has the floors that
// show what a floor can be (content/floorDemos.ts): FLOOR_DEMOS.

const SQUARES = 3;
const MARGIN = 1;
const SIZE = SQUARES * MAP_SQUARE_SIZE;
const A = MARGIN * MAP_SQUARE_SIZE;

// The cut, in world tiles: the room and the walls and passages round it
const CUT = { x: 3786, y: 5131, sizeX: 45, sizeY: 51 };
// Its south-west corner on the grid
const AT = { x: A + 9, y: A + 6 };
// The room's floor, in world tiles, both ends in
const ROOM = { x0: 3797, y0: 5142, x1: 3819, y1: 5166 };
// The floor stands this high, a bridge over the pit under it, whose bottom is PIT_HEIGHT: nine
// tiles down, far enough that the camera's fog dims it and it moves under the floor as you do
const FLOOR_HEIGHT = 200;
const PIT_HEIGHT = 56;
// The 3 by 3 hole in the middle of the room's floor
const BROKEN_PIT = 45747;
// The hidden floor (map file id): walked on, and draws nothing
const HIDDEN_OVERLAY = 359;

const toGrid = (worldX: number, worldY: number) => ({
    x: AT.x + worldX - CUT.x,
    y: AT.y + worldY - CUT.y,
});
const SW = toGrid(ROOM.x0, ROOM.y0);
const NE = toGrid(ROOM.x1, ROOM.y1);

// The floor the fight draws and moves, in grid tiles
export const WARDENS_FLOOR_RECT = { x0: SW.x, y0: SW.y, x1: NE.x, y1: NE.y };
const MIDDLE = {
    x: Math.floor((SW.x + NE.x) / 2),
    y: Math.floor((SW.y + NE.y) / 2),
};
// The player starts in the south third, in the middle column
const START = { x: MIDDLE.x, y: SW.y + 6 };

const REGION: SealRegion = {
    name: "the Wardens' floor",
    rect: WARDENS_FLOOR_RECT,
    from: START,
    min: (NE.x - SW.x + 1) * (NE.y - SW.y + 1),
    maxSealed: 0,
};

const POINTS: MapPoint[] = [
    { name: "the start", ...START, region: REGION.name },
    { name: "the middle", ...MIDDLE, region: REGION.name },
];

// Under the floor: the pit a fallen tile opens onto. The floor's tiles are a bridge (as a river's
// is, TILE_BRIDGE on level 1), each of the hidden floor that draws nothing, and under them the
// ground drops away nine tiles to nothing at all: no floor and nothing on it, the void's black,
// so a hole looks the same however big it is. What shows of a hole's edge is the floor's own
// thickness, going down into the dark (client/FloorView.ts). The pit's depth is room for a tile
// to fall into, and for anything that's ever put down there to sit far below.
function digPit(ground: Ground, inFloor: (x: number, y: number) => boolean): void {
    const grid = ground.grid;
    const [level0, level1, level2, level3] = grid.levels;
    // What the floor brought from upstairs goes
    grid.locs = grid.locs.filter((loc) => !inFloor(loc.x, loc.y));
    for (let y = SW.y; y <= NE.y; y++) {
        for (let x = SW.x; x <= NE.x; x++) {
            const to = ground.tile(x, y);
            level0.overlays[to] = 0;
            level0.underlays[to] = 0;
            level0.shapes[to] = 0;
            level0.rotations[to] = 0;
            level0.flags[to] = 0;
            level1.overlays[to] = HIDDEN_OVERLAY;
            level1.underlays[to] = 0;
            level1.flags[to] = TILE_BRIDGE;
            for (const level of [level2, level3]) {
                level.overlays[to] = level.underlays[to] = level.flags[to] = 0;
            }
        }
    }
    // The pit's bottom inside its edge, and the floor's corners over it all at the floor's height
    // (a level's heights are from the level under it)
    const corners = SIZE + 1;
    for (let y = SW.y; y <= NE.y + 1; y++) {
        for (let x = SW.x; x <= NE.x + 1; x++) {
            const edge = x === SW.x || x === NE.x + 1 || y === SW.y || y === NE.y + 1;
            const bottom = edge ? FLOOR_HEIGHT : PIT_HEIGHT;
            ground.setHeight(x, y, bottom);
            level1.heights[x + y * corners] = FLOOR_HEIGHT - bottom;
        }
    }
}

function buildDetail(context: BuildContext): GeneratedMap {
    const ground = new Ground(SIZE, SIZE);
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            ground.setHeight(x, y, FLOOR_HEIGHT);
        }
    }
    const room = cutPrefab(context.maps, CUT.x, CUT.y, CUT.sizeX, CUT.sizeY, { plane: 1 });
    const inFloor = (x: number, y: number) => x >= SW.x && x <= NE.x && y >= SW.y && y <= NE.y;
    ground.stamp(room, AT.x, AT.y, {
        floor: "all",
        feather: 0,
        flatten: true,
        height: FLOOR_HEIGHT,
        // The floor's own decoration goes with its floor, and so does the broken pit in its
        // middle: the fight's floor is whole to begin with
        skipLoc: (loc) =>
            loc.level === 0 &&
            (loc.type === LOC_FLOOR_DECORATION || loc.id === BROKEN_PIT) &&
            inFloor(AT.x + loc.x, AT.y + loc.y),
    });
    digPit(ground, inFloor);
    const sealed = sealFrom(ground.grid, context.locs, [REGION], {
        outside: "block",
        label: "Wardens' floor",
    });
    assertReachable(sealed, POINTS, "Wardens' floor");
    // No roads, buildings or landmarks of the generator's to hold it to
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
        // Cut from the real world, upstairs and all
        designed: [{ x0: AT.x, y0: AT.y, x1: AT.x + CUT.sizeX - 1, y1: AT.y + CUT.sizeY - 1 }],
    };
}

type FloorRoom = {
    id: string;
    mapX: number;
    mapY: number;
    name: string;
    description: string;
    // The floor, for its box in world tiles (the room's floor, 23 by 25 tiles)
    floor: (rect: FloorDef["rect"]) => FloorDef;
    // What comes at you (none when unset: only the floor)
    waves?: WaveDef[];
};

// A few small things to shoot, for a demo whose floor does something to shots
const FEW_ENEMIES: WaveDef[] = [
    {
        start: 0,
        enemies: [
            { id: "chicken", weight: 2 },
            { id: "goblin", weight: 1 },
        ],
        spawnRate: 0.5,
        minAlive: 4,
        maxAlive: 8,
    },
];

// The room with a floor of its own in it
function floorRoom({ id, mapX, mapY, name, description, floor, waves }: FloorRoom): MapRecipe {
    return {
        id,
        mapX,
        mapY,
        squaresX: SQUARES,
        squaresY: SQUARES,
        margin: MARGIN,
        spawn: START,
        build: (context) => buildDetail(context).grid,
        detail: buildDetail,
        regions: [REGION],
        points: POINTS,
        mapDef: {
            name,
            description,
            // Tumeken's shadow
            iconObjId: 27275,
            waves: waves ?? [],
            floor: floor({
                x0: mapX * MAP_SQUARE_SIZE + SW.x,
                y0: mapY * MAP_SQUARE_SIZE + SW.y,
                x1: mapX * MAP_SQUARE_SIZE + NE.x,
                y1: mapY * MAP_SQUARE_SIZE + NE.y,
            }),
        },
    };
}

export const WARDENS_FLOOR: MapRecipe = floorRoom({
    id: "scaperune_wardens_floor",
    mapX: 78,
    mapY: 76,
    name: "Wardens' floor (prototype)",
    description:
        "A prototype of the floor in the Wardens' third phase in the Tombs of Amascut, to try " +
        "before a fight's made of it: slabs rise under you in waves, and the floor falls " +
        "away behind you. No enemies, only the floor.",
    floor: createWardensFloor,
});

// Every floor's start, in floor tiles (each demo's floor has to have a tile there)
export const FLOOR_START = { x: START.x - SW.x, y: START.y - SW.y };

// What a floor can be, on squares of their own
export const FLOOR_DEMOS: MapRecipe[] = [
    floorRoom({
        id: "scaperune_floor_circle",
        mapX: 78,
        mapY: 80,
        name: "Floor demo: Sepulchre circle",
        description:
            "A floor demo: a circle of the Sepulchre's blue slabs, with glyphs that never rise.",
        floor: createSepulchreCircle,
    }),
    floorRoom({
        id: "scaperune_floor_islands",
        mapX: 81,
        mapY: 80,
        name: "Floor demo: slab islands",
        description:
            "A floor demo: a ring and an island of 2 by 2 slabs, joined by bridges of stone.",
        floor: createSlabIslands,
    }),
    floorRoom({
        id: "scaperune_floor_mosaic",
        mapX: 78,
        mapY: 83,
        name: "Floor demo: mosaic",
        description:
            "A floor demo: the Tombs' tiles and pressure plates in a checker, in a border that " +
            "never falls.",
        floor: createMosaicFloor,
    }),
    floorRoom({
        id: "scaperune_floor_ascii",
        mapX: 81,
        mapY: 83,
        name: "Floor demo: hand-drawn",
        description:
            "A floor demo, drawn by hand: islands on narrow paths, cracked tiles that give way, " +
            "pillars and glyphs.",
        floor: createAsciiFloor,
    }),
    floorRoom({
        id: "scaperune_floor_materials",
        mapX: 78,
        mapY: 86,
        name: "Floor demo: stone and pillars",
        description:
            "A floor demo: grey stone slabs and bands of brick, with pillars standing in the floor.",
        floor: createStoneHall,
    }),
    floorRoom({
        id: "scaperune_floor_effects",
        mapX: 81,
        mapY: 86,
        name: "Floor demo: fire and ice",
        description:
            "A floor demo: lava that burns, ice you slide on, mud, speed plates and healing " +
            "glyphs, and a floor that rebuilds itself.",
        floor: createFireAndIce,
    }),
    floorRoom({
        id: "scaperune_floor_plates",
        mapX: 78,
        mapY: 89,
        name: "Floor demo: plates and phases",
        description:
            "A floor demo: pressure plates that spring traps, a border that melts to lava now " +
            "and then, and cracked bricks that show their damage.",
        floor: createPlatesAndPhases,
    }),
    floorRoom({
        id: "scaperune_floor_terraces",
        mapX: 81,
        mapY: 89,
        name: "Floor demo: terraces",
        description:
            "A floor demo: raised and sunken tiles with ramps, and pillars that stop shots and " +
            "hide you, with a few chickens and goblins to shoot.",
        floor: createTerraces,
        waves: FEW_ENEMIES,
    }),
];
