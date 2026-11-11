import type { MapViewer } from "../../mapviewer/MapViewer";
import type { LocTypeLoader } from "../../rs/config/loctype/LocTypeLoader";
import type { CustomMapSquares } from "../../rs/map/CustomMapFileLoader";
import { addCustomMapSquares } from "../../rs/map/CustomMapFileLoader";
import { getMapSquareId } from "../../rs/map/MapFileIndex";
import type { MapFileLoader } from "../../rs/map/MapFileLoader";
import type { SceneBuilder } from "../../rs/scene/SceneBuilder";
import { MAP_SQUARE_SIZE, PlacedLoc, writeLocs, writeTerrain } from "./format";
import { SCAPERUNE_DEV_MAPS } from "./maps/devMaps";
import { SCAPERUNE_MAPS } from "./maps/shippedMaps";
import type { BuildContext, MapRecipe } from "./recipe";

// A map's recipe: its own, or the one a boss fight's fought on (MapRecipe.fights)
export function getRecipe(mapId: string): MapRecipe | undefined {
    return [...SCAPERUNE_MAPS, ...SCAPERUNE_DEV_MAPS].find(
        (recipe) => recipe.id === mapId || recipe.fights?.includes(mapId),
    );
}

export function createBuildContext(maps: MapFileLoader, locTypes: LocTypeLoader): BuildContext {
    return {
        maps,
        locs(id) {
            const type = locTypes.load(id);
            return {
                name: type.name,
                sizeX: type.sizeX,
                sizeY: type.sizeY,
                clipType: type.clipType,
                blocksProjectile: type.blocksProjectile,
                drawn: type.transforms !== undefined || (type.models?.length ?? 0) > 0,
            };
        },
    };
}

// Builds a recipe and writes it in the cache's formats, square by square
export function buildRecipeSquares(recipe: MapRecipe, context: BuildContext): CustomMapSquares {
    const grid = recipe.build(context);
    const bySquare = new Map<number, PlacedLoc[]>();
    for (const loc of grid.locs) {
        const key = (loc.x >> 6) * recipe.squaresY + (loc.y >> 6);
        const locs = bySquare.get(key);
        if (locs) {
            locs.push(loc);
        } else {
            bySquare.set(key, [loc]);
        }
    }
    const squares: CustomMapSquares = new Map();
    for (let x = 0; x < recipe.squaresX; x++) {
        for (let y = 0; y < recipe.squaresY; y++) {
            const offsetX = x * MAP_SQUARE_SIZE;
            const offsetY = y * MAP_SQUARE_SIZE;
            squares.set(getMapSquareId(recipe.mapX + x, recipe.mapY + y), {
                terrain: writeTerrain(grid, offsetX, offsetY),
                locs: writeLocs(
                    grid,
                    offsetX,
                    offsetY,
                    bySquare.get(x * recipe.squaresY + y) ?? [],
                ),
            });
        }
    }
    return squares;
}

const installed = new Set<string>();

// Makes a recipe's squares part of the world, for the renderer, the workers and
// the minimap. Built on the main thread, once, the first time it's played. Does
// nothing for a real map.
export async function installRecipe(mapViewer: MapViewer, mapId: string): Promise<void> {
    const recipe = getRecipe(mapId);
    // Once a recipe, whichever map it's for (a fight on another map's ground shares it)
    if (!recipe || installed.has(recipe.id)) {
        return;
    }
    const context = createBuildContext(mapViewer.mapFileLoader, mapViewer.locTypeLoader);
    const squares = buildRecipeSquares(recipe, context);
    // Its twin's squares too, drawn in its place (MapDef.twin)
    if (recipe.twin) {
        for (const [id, square] of buildRecipeSquares(recipe.twin, context)) {
            squares.set(id, square);
        }
    }
    await mapViewer.addCustomMapSquares(squares);
    installed.add(recipe.id);
}

// The same for a scene builder on its own, in a script. Does nothing for a real
// map.
export function installRecipeInSceneBuilder(sceneBuilder: SceneBuilder, mapId: string): void {
    const recipe = getRecipe(mapId);
    if (recipe) {
        const { mapFileLoader, locTypeLoader } = sceneBuilder;
        const context = createBuildContext(mapFileLoader, locTypeLoader);
        addCustomMapSquares(mapFileLoader, buildRecipeSquares(recipe, context));
        if (recipe.twin) {
            addCustomMapSquares(mapFileLoader, buildRecipeSquares(recipe.twin, context));
        }
    }
}
