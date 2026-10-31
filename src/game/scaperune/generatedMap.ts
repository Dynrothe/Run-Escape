import { HSL_RGB_MAP, packHsl } from "../../rs/util/ColorUtil";
import type { GameClient } from "../client/GameClient";
import { setGeneratedMap } from "../content/maps";
import type { TileGrid } from "./format";
import { generatedRecipe } from "./generator";
import { MapRecipe, getRecipeWorldTile } from "./recipe";
import type { GeneratorSettings } from "./settings";
import { buildRecipeSquares, createBuildContext } from "./squares";

// The temporary map generator screen's one map, built again on every Generate.
// It always uses the same map squares, with room for the biggest arena.

export const GENERATED_MAP_ID = "scaperune_generated";
const SLOT_MAP_X = 70;
const SLOT_MAP_Y = 134;

const IMAGE_TILE_PIXELS = 4;
const MAX_PREVIEW_PIXELS = 1024;
const MAP_SQUARE_SIZE = 64;

let installedIds: number[] = [];
let lastGrid: TileGrid | undefined;

// The minimap's images take a worker a tenth of a second a square, so a bigger map gets
// a quick picture of its tiles
const MAX_IMAGED_SQUARES = 25;
const WATER_RGB = 0x5b78a8;
const WALL_RGB = 0xeeeeee;
const TREE_RGB = 0x1e3a12;

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
    // Built once, and kept for its picture
    const grid = recipe.build(context);
    lastGrid = grid;
    const squares = buildRecipeSquares({ ...recipe, build: () => grid }, context);
    const removedIds = installedIds.filter((id) => !squares.has(id));
    await mapViewer.addCustomMapSquares(squares, removedIds);
    renderer.clearMaps();
    installedIds = [...squares.keys()];
    setGeneratedMap(recipe);
    client.forgetGrid(GENERATED_MAP_ID);
    return recipe;
}

// The map from above, one pixel a tile or less, from its grid
function drawGridPicture(client: GameClient, grid: TileGrid, canvas: HTMLCanvasElement): void {
    const loaders = client.mapViewer.loaderFactory;
    const underlays = loaders.getUnderlayTypeLoader();
    const overlays = loaders.getOverlayTypeLoader();
    const colours = new Map<number, number>();
    const getUnderlayRgb = (id: number) => {
        let rgb = colours.get(id);
        if (rgb === undefined) {
            const type = underlays.load(id - 1);
            // As SceneBuilder.blendUnderlays works it out, for one tile
            const hue = ((type.getHueBlend() * 256) / type.getHueMultiplier()) | 0;
            rgb = HSL_RGB_MAP[packHsl(hue, type.saturation, type.lightness)];
            colours.set(id, rgb);
        }
        return rgb;
    };
    const { sizeX, sizeY } = grid;
    const tiles = grid.levels[0];
    const rgb = new Int32Array(sizeX * sizeY);
    for (let i = 0; i < rgb.length; i++) {
        const overlay = tiles.overlays[i];
        if (overlay !== 0) {
            const type = overlays.load(overlay - 1);
            rgb[i] =
                type.textureId !== -1
                    ? WATER_RGB
                    : HSL_RGB_MAP[packHsl(type.hue, type.saturation, type.lightness)];
        } else {
            rgb[i] = tiles.underlays[i] !== 0 ? getUnderlayRgb(tiles.underlays[i]) : 0;
        }
    }
    for (const loc of grid.locs) {
        if (loc.level === 0 && loc.type === 10) {
            rgb[loc.x + loc.y * sizeX] = TREE_RGB;
        } else if (loc.level === 0 && loc.type <= 3) {
            rgb[loc.x + loc.y * sizeX] = WALL_RGB;
        }
    }
    const { width, height } = canvas;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(width, height);
    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            const x = Math.floor((px * sizeX) / width);
            const y = Math.floor(((height - 1 - py) * sizeY) / height);
            const colour = rgb[x + y * sizeX];
            const at = (px + py * width) * 4;
            image.data[at] = (colour >> 16) & 0xff;
            image.data[at + 1] = (colour >> 8) & 0xff;
            image.data[at + 2] = colour & 0xff;
            image.data[at + 3] = 0xff;
        }
    }
    ctx.putImageData(image, 0, 0);
}

// The map from above, as an image URL: the game's own minimap images if there aren't too
// many, with the arena marked in white and the spawn in red
export async function drawGeneratedMap(client: GameClient, recipe: MapRecipe): Promise<string> {
    const squarePixels = Math.min(
        MAP_SQUARE_SIZE * IMAGE_TILE_PIXELS,
        Math.floor(MAX_PREVIEW_PIXELS / Math.max(recipe.squaresX, recipe.squaresY)),
    );
    const tilePixels = squarePixels / MAP_SQUARE_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = recipe.squaresX * squarePixels;
    canvas.height = recipe.squaresY * squarePixels;
    const ctx = canvas.getContext("2d")!;
    if (recipe.squaresX * recipe.squaresY > MAX_IMAGED_SQUARES && lastGrid) {
        drawGridPicture(client, lastGrid, canvas);
    } else {
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
                            squarePixels,
                            squarePixels,
                        );
                        bitmap.close();
                    }),
                );
            }
        }
        await Promise.all(draws);
    }

    const margin = recipe.margin * squarePixels;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(margin, margin, canvas.width - margin * 2, canvas.height - margin * 2);
    const spawn = getRecipeWorldTile(recipe, recipe.spawn.x, recipe.spawn.y);
    const { x, y } = {
        x: (spawn.x - recipe.mapX * MAP_SQUARE_SIZE) * tilePixels,
        y: canvas.height - (spawn.y - recipe.mapY * MAP_SQUARE_SIZE) * tilePixels,
    };
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(x - 8, y - 8, 16, 16);
    return canvas.toDataURL("image/png");
}
