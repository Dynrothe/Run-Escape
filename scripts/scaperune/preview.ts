// Draws a map from above with the game's own minimap renderer, with the arena
// marked in white and the spawn in red, and checks it with the game's real
// collision: every open tile must reach the spawn.
//
//   npx tsx scripts/scaperune/preview.ts out.png seed=7 biome=desert boundary=forest rivers=1
//   npx tsx scripts/scaperune/preview.ts out.png map=terrain_test
//
// Takes any GeneratorSettings as name=value. Heavy on memory: it loads the cache.
import fs from "node:fs";

import { ArenaGrid } from "../../src/game/core/world/ArenaGrid";
import { countStranded } from "../../src/game/scaperune/collision";
import { generatedRecipe } from "../../src/game/scaperune/generator";
import { SCAPERUNE_DEV_MAPS } from "../../src/game/scaperune/maps/devMaps";
import { MapRecipe, getRecipeArena, getRecipeWorldTile } from "../../src/game/scaperune/recipe";
import {
    SETTINGS,
    SettingKey,
    formatSettings,
    parseSettings,
} from "../../src/game/scaperune/settings";
import { buildRecipeSquares, createBuildContext } from "../../src/game/scaperune/squares";
import { buildRegionData } from "../../src/mapviewer/worker/RegionDataLoader";
import { createWorkerState } from "../../src/mapviewer/worker/WorkerState";
import { addCustomMapSquares } from "../../src/rs/map/CustomMapFileLoader";
import { LocLoadType } from "../../src/rs/scene/SceneBuilder";
import { loadGameCache } from "../cache/scene-util";
import { encodePng } from "./png";

const TILE_PIXELS = 4;
const BORDER = 6;

function parseRecipe(args: string[]): MapRecipe {
    const values = args.map((arg) => arg.split("=") as [string, string]);
    const mapId = new Map(values).get("map");
    if (mapId) {
        const recipe = SCAPERUNE_DEV_MAPS.find((map) => map.id === mapId);
        if (!recipe) {
            throw new Error(`No map ${mapId}`);
        }
        return recipe;
    }
    const given: Record<string, unknown> = {};
    for (const [name, value] of values) {
        const def = SETTINGS[name as SettingKey];
        given[name] =
            name !== "seed" && def?.kind === "choice"
                ? value
                : def?.kind === "flag"
                  ? value === "true"
                  : Number(value);
    }
    // Checks them, too
    const settings = parseSettings(JSON.stringify(given));
    console.log(formatSettings(settings));
    return generatedRecipe("preview", 70, 134, settings);
}

async function main(): Promise<void> {
    const [out, ...args] = process.argv.slice(2);
    if (!out) {
        throw new Error("Usage: preview.ts out.png [map=id] [name=value ...]");
    }
    const recipe = parseRecipe(args);
    const cache = loadGameCache();
    const state = createWorkerState(cache, [], [], undefined as unknown as Cache);
    const { sceneBuilder, mapImageRenderer, varManager, locTypeLoader } = state;
    const context = createBuildContext(sceneBuilder.mapFileLoader, locTypeLoader);

    const started = performance.now();
    const squares = buildRecipeSquares(recipe, context);
    console.log(`Built in ${(performance.now() - started).toFixed(0)} ms`);
    addCustomMapSquares(sceneBuilder.mapFileLoader, squares);

    // The check, with the game's own collision
    const arena = getRecipeArena(recipe);
    const grid = new ArenaGrid(buildRegionData(sceneBuilder, varManager, { ...arena, plane: 0 }));
    const spawn = getRecipeWorldTile(recipe, recipe.spawn.x, recipe.spawn.y);
    const { open, stranded } = countStranded(grid, spawn.x, spawn.y);
    console.log(`Open ${open} of ${arena.sizeX * arena.sizeY} arena tiles, ${stranded} stranded`);

    // The picture: each square's minimap image, north at the top
    const sizeX = recipe.squaresX * 64;
    const sizeY = recipe.squaresY * 64;
    const width = sizeX * TILE_PIXELS;
    const height = sizeY * TILE_PIXELS;
    const rgb = new Uint8Array(width * height * 3);
    for (let squareX = 0; squareX < recipe.squaresX; squareX++) {
        for (let squareY = 0; squareY < recipe.squaresY; squareY++) {
            const baseX = (recipe.mapX + squareX) * 64 - BORDER;
            const baseY = (recipe.mapY + squareY) * 64 - BORDER;
            const size = 64 + BORDER * 2;
            const scene = sceneBuilder.buildScene(
                baseX,
                baseY,
                size,
                size,
                false,
                LocLoadType.NO_MODELS,
            );
            const pixels = mapImageRenderer.renderMinimapHd(scene, 0, true);
            const sourceSize = size * TILE_PIXELS;
            const squarePixels = 64 * TILE_PIXELS;
            for (let py = 0; py < squarePixels; py++) {
                for (let px = 0; px < squarePixels; px++) {
                    const source =
                        pixels[
                            px + BORDER * TILE_PIXELS + (py + BORDER * TILE_PIXELS) * sourceSize
                        ];
                    const tx = squareX * squarePixels + px;
                    const ty = (recipe.squaresY - 1 - squareY) * squarePixels + py;
                    const at = (tx + ty * width) * 3;
                    rgb[at] = (source >> 16) & 0xff;
                    rgb[at + 1] = (source >> 8) & 0xff;
                    rgb[at + 2] = source & 0xff;
                }
            }
        }
    }
    const mark = (x: number, y: number, r: number, g: number, b: number) => {
        if (x >= 0 && y >= 0 && x < width && y < height) {
            rgb.set([r, g, b], (x + y * width) * 3);
        }
    };
    const edge = recipe.margin * 64 * TILE_PIXELS;
    for (let i = edge; i < width - edge; i++) {
        mark(i, edge, 255, 255, 255);
        mark(i, height - edge - 1, 255, 255, 255);
    }
    for (let i = edge; i < height - edge; i++) {
        mark(edge, i, 255, 255, 255);
        mark(width - edge - 1, i, 255, 255, 255);
    }
    const spawnX = recipe.spawn.x * TILE_PIXELS;
    const spawnY = height - recipe.spawn.y * TILE_PIXELS;
    for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
            mark(spawnX + dx, spawnY + dy, 255, 0, 0);
        }
    }
    fs.writeFileSync(out, encodePng(width, height, rgb));
    console.log(`Wrote ${out}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
