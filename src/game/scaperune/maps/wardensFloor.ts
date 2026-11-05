import { createWardensFloor } from "../../content/wardensFloor";
import { Ground } from "../Ground";
import { SealRegion, assertReachable, sealFrom } from "../collision";
import { MAP_SQUARE_SIZE, TILE_BRIDGE } from "../format";
import type { GeneratedMap } from "../generator";
import { LOC_FLOOR_DECORATION } from "../mapBuild";
import { createNoise, createRng } from "../noise";
import { cutPrefab } from "../prefab";
import { BuildContext, MapPoint, MapRecipe } from "../recipe";

// A prototype, for trying out a floor that fights back (content/wardensFloor.ts): the Wardens'
// room in the Tombs of Amascut (map square 59,80, level 1), cut whole from the cache. Its own
// floor is left out, the hidden overlay under every tile of it, because the game draws that floor
// itself, tile by tile, as the slabs that rise out of it in the real fight (client/FloorView.ts):
// a tile that's dropped away then leaves the void's black. Everything else is the room as it is.
//
// Dev server only (maps/devMaps.ts).

const MAP_X = 78;
const MAP_Y = 76;
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
// The pit's bottom: the void's black, with pools of lava (map file id) where the noise is over
// LAVA_ABOVE, the red light far below
const PIT_LAVA = 19;
const LAVA_ABOVE = 0.62;
// The red stone blocks the real room's level 0 is filled with: one in this many is kept, as fallen
// masonry, the rest gone so the pit's deep
const MASONRY = 45643;
const MASONRY_KEPT = 6;
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
// ground drops away nine tiles. At the bottom is what the cache has under the real room, level 0
// of the same square (the same room's shape, its middle ring and side alcoves, filled with red
// stone blocks), thinned to a few fallen blocks in the void's black, with pools of lava. Its
// edges are the pit's walls, one tile from the top to the bottom.
function digPit(
    context: BuildContext,
    ground: Ground,
    inFloor: (x: number, y: number) => boolean,
): void {
    const grid = ground.grid;
    const [level0, level1, level2, level3] = grid.levels;
    // What the floor brought from upstairs goes, and the floor's whole room under it comes in
    grid.locs = grid.locs.filter((loc) => !inFloor(loc.x, loc.y));
    const sizeX = ROOM.x1 - ROOM.x0 + 1;
    const sizeY = ROOM.y1 - ROOM.y0 + 1;
    const below = cutPrefab(context.maps, ROOM.x0, ROOM.y0, sizeX, sizeY, { plane: 0 });
    const lava = createNoise(3871);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const to = ground.tile(SW.x + x, SW.y + y);
            level0.overlays[to] = lava(x / 5, y / 5) > LAVA_ABOVE ? PIT_LAVA : 0;
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
    const rng = createRng(3872);
    for (const loc of below.locs) {
        if (loc.level !== 0 || (loc.id === MASONRY && rng() * MASONRY_KEPT >= 1)) {
            continue;
        }
        grid.locs.push({ ...loc, x: SW.x + loc.x, y: SW.y + loc.y });
        // Nothing burns under what's standing
        level0.overlays[ground.tile(SW.x + loc.x, SW.y + loc.y)] = 0;
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
    digPit(context, ground, inFloor);
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

export const WARDENS_FLOOR: MapRecipe = {
    id: "scaperune_wardens_floor",
    mapX: MAP_X,
    mapY: MAP_Y,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: MARGIN,
    spawn: START,
    build: (context) => buildDetail(context).grid,
    detail: buildDetail,
    regions: [REGION],
    points: POINTS,
    mapDef: {
        name: "Wardens' floor (prototype)",
        description:
            "A prototype of the floor in the Wardens' third phase in the Tombs of Amascut, to try " +
            "before a fight's made of it: slabs rise under you in waves, and the floor falls " +
            "away behind you. No enemies, only the floor.",
        // Tumeken's shadow
        iconObjId: 27275,
        waves: [],
        floor: createWardensFloor({
            x0: MAP_X * MAP_SQUARE_SIZE + SW.x,
            y0: MAP_Y * MAP_SQUARE_SIZE + SW.y,
            x1: MAP_X * MAP_SQUARE_SIZE + NE.x,
            y1: MAP_Y * MAP_SQUARE_SIZE + NE.y,
        }),
    },
};
