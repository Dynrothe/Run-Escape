import type { Ground } from "./Ground";
import { Exit, findExits, getNearestExit } from "./building";
import type { PlacedLoc, TileGrid } from "./format";
import { cutPrefab, rotatePrefab } from "./prefab";
import type { BuildContext } from "./recipe";

// A rectangle of the real world, in world tiles: its south-west corner and size
export type PrefabDef = { worldX: number; worldY: number; sizeX: number; sizeY: number };

// Rectangles that hold a whole building, every wall, and nothing else. Find more with
// scripts/scaperune/find-prefabs.ts, and check them with check-prefabs.ts.
export const PREFABS: Record<string, PrefabDef> = {
    lumbridge_house: { worldX: 3243, worldY: 3244, sizeX: 6, sizeY: 5 },
    lumbridge_church: { worldX: 3238, worldY: 3204, sizeX: 11, sizeY: 13 },
    varrock_shop: { worldX: 3245, worldY: 3402, sizeX: 8, sizeY: 10 },
    al_kharid_house: { worldX: 3311, worldY: 3172, sizeX: 9, sizeY: 16 },
    al_kharid_shop: { worldX: 3317, worldY: 3190, sizeX: 8, sizeY: 9 },
    canifis_house: { worldX: 3473, worldY: 3490, sizeX: 9, sizeY: 12 },
    rellekka_hut: { worldX: 2665, worldY: 3699, sizeX: 8, sizeY: 7 },
    rellekka_house: { worldX: 2677, worldY: 3686, sizeX: 9, sizeY: 9 },
};

// The bridge over the River Lum, 18 tiles east to west with its deck on level 1
// across a river 9 tiles wide (from x 5 to 13) running north to south. The deck and
// the gap between the fences at each end are the 2 rows either side of y = 3.
export const BRIDGE: PrefabDef = { worldX: 3236, worldY: 3223, sizeX: 18, sizeY: 6 };
export const BRIDGE_DECK_ROW = 3;
// Tile edges where the deck starts and stops, in x
export const BRIDGE_DECK_WEST = 4;
export const BRIDGE_DECK_EAST = 15;
// How high the bridge's own banks are, to set it on ours
export const BRIDGE_BANK_HEIGHT = 30;

const DOOR_NAME = /\b(door|gate|curtain)\b/i;
// Over this many tiles the ground eases back to its own heights round a building
const BUILDING_FEATHER = 4;

export function loadPrefab(context: BuildContext, def: PrefabDef): TileGrid {
    return cutPrefab(context.maps, def.worldX, def.worldY, def.sizeX, def.sizeY);
}

export function isDoor(context: Pick<BuildContext, "locs">, loc: PlacedLoc): boolean {
    return loc.type <= 3 && DOOR_NAME.test(context.locs(loc.id).name);
}

// Stands a building on the ground, turned, with its doors off so that you can walk
// in. Returns its way out nearest a tile, in ground tiles.
export function stampBuilding(
    ground: Ground,
    context: BuildContext,
    def: PrefabDef,
    turns: number,
    x: number,
    y: number,
    towardX: number,
    towardY: number,
): Exit | undefined {
    const prefab = rotatePrefab(loadPrefab(context, def), turns, context.locs);
    const skipLoc = (loc: PlacedLoc) => isDoor(context, loc);
    ground.stamp(prefab, x, y, {
        floor: "footprint",
        feather: BUILDING_FEATHER,
        flatten: true,
        keepUnderlays: true,
        skipLoc,
    });
    const exit = getNearestExit(findExits(prefab, skipLoc), towardX - x, towardY - y);
    return exit && { ...exit, x: exit.x + x, y: exit.y + y };
}
