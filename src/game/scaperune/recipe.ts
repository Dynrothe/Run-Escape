import type { MapFileLoader } from "../../rs/map/MapFileLoader";
import { MAP_SQUARE_SIZE, type TileGrid } from "./format";

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
};

export type BuildContext = {
    // The real world, to cut prefabs out of
    maps: Pick<MapFileLoader, "getTerrainData" | "getLocData">;
    locs(id: number): LocInfo;
};

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
    // How a run here plays, if not like Lumbridge. Dev maps only.
    play?: {
        // The map to take waves and difficulty from
        waveSet: string;
        enemyDensity: number;
        brightness: number;
    };
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
