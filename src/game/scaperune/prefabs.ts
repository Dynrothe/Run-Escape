import { TileGrid } from "./format";
import { cutPrefab } from "./prefab";
import type { BuildContext } from "./recipe";

// A rectangle of the real world, in world tiles: its south-west corner and size
export type PrefabDef = { worldX: number; worldY: number; sizeX: number; sizeY: number };

// Rectangles that hold a whole building and nothing else. Find more with
// scripts/scaperune/find-prefabs.ts.
export const PREFABS: Record<string, PrefabDef> = {
    lumbridge_house: { worldX: 3242, worldY: 3243, sizeX: 9, sizeY: 7 },
    lumbridge_church: { worldX: 3238, worldY: 3203, sizeX: 12, sizeY: 14 },
    varrock_shop: { worldX: 3245, worldY: 3402, sizeX: 9, sizeY: 10 },
    al_kharid_house: { worldX: 3311, worldY: 3177, sizeX: 9, sizeY: 11 },
    al_kharid_shop: { worldX: 3317, worldY: 3190, sizeX: 8, sizeY: 9 },
    canifis_house: { worldX: 3473, worldY: 3490, sizeX: 9, sizeY: 11 },
    rellekka_hut: { worldX: 2665, worldY: 3699, sizeX: 8, sizeY: 7 },
    rellekka_house: { worldX: 2677, worldY: 3686, sizeX: 9, sizeY: 9 },
};

// The bridge over the River Lum, 18 tiles east to west with its deck on level 1
// across a river 9 tiles wide (from x 5 to 13) running north to south
export const BRIDGE: PrefabDef = { worldX: 3236, worldY: 3223, sizeX: 18, sizeY: 6 };
// How high the bridge's own banks are, to set it on ours
export const BRIDGE_BANK_HEIGHT = 30;

export function loadPrefab(context: BuildContext, def: PrefabDef): TileGrid {
    return cutPrefab(context.maps, def.worldX, def.worldY, def.sizeX, def.sizeY);
}
