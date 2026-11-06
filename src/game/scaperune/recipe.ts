import type { MapFileLoader } from "../../rs/map/MapFileLoader";
import type { MapDef } from "../content/types";
import type { TileRect } from "./collision";
import { MAP_SQUARE_SIZE, type TileGrid } from "./format";
import type { GeneratedMap } from "./generator";

// What a recipe needs to know about a loc
export type LocInfo = {
    name: string;
    sizeX: number;
    sizeY: number;
    // LocType.clipType: 0 blocks nothing
    clipType: number;
    blocksProjectile: boolean;
    // Locs with no model draw nothing, and the game lets you through them
    drawn: boolean;
    // A loc that changes with a var (a farming patch, a STASH, a seasonal bush): the loc it
    // shows, as the game draws it with every var at 0 (LocType.transform), or -1 for none
    shows?: number;
};

export type BuildContext = {
    // The real world, to cut prefabs out of
    maps: Pick<MapFileLoader, "getTerrainData" | "getLocData">;
    locs(id: number): LocInfo;
};

// A part of a map that's walked on its own, such as a raid's hall, a boss room or a sealed arena:
// its open tiles are those that can be walked to from `from` without leaving `rect`. Grid tiles.
export type MapRegion = {
    name: string;
    rect: TileRect;
    from: { x: number; y: number };
};

// A tile the game puts someone on, such as where a party's brought in or where a boss turns up,
// which has to be open and reachable: from its region's start if it names one, from the spawn if
// not. Grid tiles.
export type MapPoint = { name: string; x: number; y: number; region?: string };

// A map: where its squares go in the world and how to build them. Its grid
// starts at (mapX, mapY) and covers squaresX by squaresY map squares; the arena
// is what's left inside margin squares of scenery on each side.
export type MapRecipe = {
    id: string;
    // Squares the cache doesn't have, and no other recipe uses
    mapX: number;
    mapY: number;
    squaresX: number;
    squaresY: number;
    margin: number;
    // Where the player starts, in grid tiles. Known without building the map,
    // because the game needs it before it builds anything.
    spawn: { x: number; y: number };
    build(context: BuildContext): TileGrid;
    // A hand-made map's own build with what check-maps.ts holds it to, if it wants checking
    detail?(context: BuildContext): GeneratedMap;
    // A map of rooms that don't join up (a raid, a sealed arena): check-maps.ts then counts each
    // region's open and stranded tiles from its own start rather than the whole arena's from the
    // spawn, and fails on a region that leaks or anything open outside every region
    regions?: MapRegion[];
    // Tiles check-maps.ts holds to being open and reachable, beside the spawn
    points?: MapPoint[];
    // Banned locs (catalogue.ts) this map uses on purpose, as ranges of ids: a raid's or a boss
    // room's own, on a shipped map made of one. check-maps.ts holds it to the rest of the list.
    allowLocs?: [from: number, to: number][];
    // How a run here plays, if not like Lumbridge. Dev maps only.
    play?: {
        // The map to take waves and difficulty from
        waveSet: string;
        enemyDensity: number;
        brightness: number;
    };
    // A hand-made map's own name, waves and so on, over what createDevMap gives it
    mapDef?: Partial<
        Pick<
            MapDef,
            | "name"
            | "description"
            | "iconObjId"
            | "difficulty"
            | "waves"
            | "events"
            | "finalBossWarning"
            | "victoryText"
            | "fun"
            | "floor"
            | "lighting"
        >
    >;
};

// The rectangle the game plays on, in world tiles
export function getRecipeArena(recipe: MapRecipe): {
    baseX: number;
    baseY: number;
    sizeX: number;
    sizeY: number;
} {
    return {
        baseX: (recipe.mapX + recipe.margin) * MAP_SQUARE_SIZE,
        baseY: (recipe.mapY + recipe.margin) * MAP_SQUARE_SIZE,
        sizeX: (recipe.squaresX - recipe.margin * 2) * MAP_SQUARE_SIZE,
        sizeY: (recipe.squaresY - recipe.margin * 2) * MAP_SQUARE_SIZE,
    };
}

// The middle of a grid tile, in world tiles
export function getRecipeWorldTile(
    recipe: MapRecipe,
    x: number,
    y: number,
): { x: number; y: number } {
    return {
        x: recipe.mapX * MAP_SQUARE_SIZE + x + 0.5,
        y: recipe.mapY * MAP_SQUARE_SIZE + y + 0.5,
    };
}
