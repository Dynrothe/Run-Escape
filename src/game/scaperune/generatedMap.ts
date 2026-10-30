import type { GameClient } from "../client/GameClient";
import { setGeneratedMap } from "../content/maps";
import { GeneratorSettings, generatedRecipe } from "./generator";
import { MapRecipe, getRecipeWorldTile } from "./recipe";
import { buildRecipeSquares, createBuildContext } from "./squares";

// The temporary map generator screen's one map, built again on every Generate.
// It always uses the same map squares, with room for the biggest arena.

export const GENERATED_MAP_ID = "scaperune_generated";
const SLOT_MAP_X = 84;
const SLOT_MAP_Y = 112;

const IMAGE_TILE_PIXELS = 4;
const MAP_SQUARE_SIZE = 64;

let installedIds: number[] = [];

// Builds a map and makes it the generated one, replacing the last everywhere it
// was kept: the squares here and in the workers, the renderer's copies, the map
// images, the collision. If the settings can't make a map this throws, with the
// old map still in place.
export async function installGeneratedMap(
    client: GameClient,
    settings: GeneratorSettings,
): Promise<MapRecipe> {
    const { mapViewer, renderer } = client;
    const recipe = generatedRecipe(GENERATED_MAP_ID, SLOT_MAP_X, SLOT_MAP_Y, settings);
    const context = createBuildContext(mapViewer.mapFileLoader, mapViewer.locTypeLoader);
    const squares = buildRecipeSquares(recipe, context);
    const removedIds = installedIds.filter((id) => !squares.has(id));
    await mapViewer.addCustomMapSquares(squares, removedIds);
    renderer.clearMaps();
    installedIds = [...squares.keys()];
    setGeneratedMap(recipe);
    client.forgetGrid(GENERATED_MAP_ID);
    return recipe;
}

// The map from above, as an image URL, drawn with the game's own minimap images:
// the arena marked in white and the spawn in red
export async function drawGeneratedMap(client: GameClient, recipe: MapRecipe): Promise<string> {
    const squarePixels = MAP_SQUARE_SIZE * IMAGE_TILE_PIXELS;
    const canvas = document.createElement("canvas");
    canvas.width = recipe.squaresX * squarePixels;
    canvas.height = recipe.squaresY * squarePixels;
    const ctx = canvas.getContext("2d")!;
    const draws: Promise<void>[] = [];
    for (let x = 0; x < recipe.squaresX; x++) {
        for (let y = 0; y < recipe.squaresY; y++) {
            const image = Promise.resolve(
                client.mapViewer.workerPool.queueMapImage(
                    recipe.mapX + x,
                    recipe.mapY + y,
                    0,
                    true,
                ),
            );
            draws.push(
                image.then(async (data) => {
                    if (!data) {
                        throw new Error("A map square didn't draw.");
                    }
                    const bitmap = await createImageBitmap(data.minimapBlob);
                    // The images have north at the top
                    ctx.drawImage(
                        bitmap,
                        x * squarePixels,
                        (recipe.squaresY - 1 - y) * squarePixels,
                    );
                    bitmap.close();
                }),
            );
        }
    }
    await Promise.all(draws);

    const margin = recipe.margin * squarePixels;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(margin, margin, canvas.width - margin * 2, canvas.height - margin * 2);
    const spawn = getRecipeWorldTile(recipe, recipe.spawn.x, recipe.spawn.y);
    const { x, y } = {
        x: (spawn.x - recipe.mapX * MAP_SQUARE_SIZE) * IMAGE_TILE_PIXELS,
        y: canvas.height - (spawn.y - recipe.mapY * MAP_SQUARE_SIZE) * IMAGE_TILE_PIXELS,
    };
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(x - 8, y - 8, 16, 16);
    return canvas.toDataURL("image/png");
}
