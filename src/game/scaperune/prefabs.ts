import type { Ground } from "./Ground";
import { Exit, findExits } from "./building";
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
// How high the river bed is under it. A bridge's bank stands this much over the water.
export const BRIDGE_BED_HEIGHT = 0;

const DOOR_NAME = /\b(door|gate|curtain)\b/i;
// Over this many tiles the ground eases back to its own heights round a building
const BUILDING_FEATHER = 4;

export function loadPrefab(context: BuildContext, def: PrefabDef): TileGrid {
    return cutPrefab(context.maps, def.worldX, def.worldY, def.sizeX, def.sizeY);
}

export function isDoor(context: Pick<BuildContext, "locs">, loc: PlacedLoc): boolean {
    return loc.type <= 3 && DOOR_NAME.test(context.locs(loc.id).name);
}

// What a building is, for the settings that turn them on and off
const BUILDING_KINDS: Record<string, "house" | "shop" | "church"> = {
    lumbridge_house: "house",
    lumbridge_church: "church",
    varrock_shop: "shop",
    al_kharid_house: "house",
    al_kharid_shop: "shop",
    canifis_house: "shop",
    rellekka_hut: "house",
    rellekka_house: "house",
};

export function isBuildingKind(
    name: string,
    allowed: { houses: boolean; shops: boolean; churches: boolean },
): boolean {
    const kind = BUILDING_KINDS[name];
    return kind === "house" ? allowed.houses : kind === "shop" ? allowed.shops : allowed.churches;
}

// Of a ruin's walls, this share still stands
const RUIN_WALLS = 0.45;

// Prefabs in each rotation, cut once: a big map has hundreds of buildings
export class PrefabKit {
    private readonly turned = new Map<string, { prefab: TileGrid; exits: Exit[] }>();

    constructor(readonly context: BuildContext) {}

    get(name: string, turns: number): { prefab: TileGrid; exits: Exit[] } {
        const key = `${name}:${turns}`;
        let entry = this.turned.get(key);
        if (!entry) {
            const prefab = rotatePrefab(
                loadPrefab(this.context, PREFABS[name]),
                turns,
                this.context.locs,
            );
            const exits = findExits(prefab, (loc) => isDoor(this.context, loc));
            entry = { prefab, exits };
            this.turned.set(key, entry);
        }
        return entry;
    }

    // Stands a building on the ground, with its doors off so that you can walk in.
    // keepHeights is for a map that pins its ground for itself.
    stamp(
        ground: Ground,
        name: string,
        turns: number,
        x: number,
        y: number,
        keepHeights = false,
    ): void {
        ground.stamp(this.get(name, turns).prefab, x, y, {
            floor: "footprint",
            feather: BUILDING_FEATHER,
            flatten: true,
            keepHeights,
            keepUnderlays: true,
            skipLoc: (loc) => isDoor(this.context, loc),
        });
    }

    // The same with most of it gone: no furniture, and some of its walls
    stampRuin(
        ground: Ground,
        name: string,
        turns: number,
        x: number,
        y: number,
        roll: () => number,
        keepHeights = false,
    ): void {
        ground.stamp(this.get(name, turns).prefab, x, y, {
            floor: "footprint",
            feather: BUILDING_FEATHER,
            flatten: true,
            keepHeights,
            keepUnderlays: true,
            skipLoc: (loc) => isDoor(this.context, loc) || loc.type > 3 || roll() > RUIN_WALLS,
        });
    }
}
