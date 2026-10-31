// Draws a generated map's height as shaded relief, without the cache: quick, for working on
// the shape of the land. Fake prefabs stand in for the real ones, so buildings don't come out
// right, and water, rock and roads are only marked in colour. Prints what's walkable.
//
//   npx tsx scripts/scaperune/relief.ts out.png seed=7 mountains=0.6 peakHeight=240
//   npx tsx scripts/scaperune/relief.ts out.png preset=Alpine seed=3
import { writeFileSync } from "node:fs";

import { findReachable, findStranded, getCollisionFlags } from "../../src/game/scaperune/collision";
import {
    TILE_BLOCKED,
    createTileGrid,
    writeLocs,
    writeTerrain,
} from "../../src/game/scaperune/format";
import {
    SETTINGS,
    SETTING_PRESETS,
    SettingKey,
    generateMapDetail,
    getGeneratedArena,
    getGeneratedSpawn,
    parseSettings,
} from "../../src/game/scaperune/generator";
import type { BuildContext } from "../../src/game/scaperune/recipe";
import { getTileSlope } from "../../src/game/scaperune/terrain";
import { encodePng } from "./png";

const emptySquare = (() => {
    const grid = createTileGrid(64, 64);
    return { terrain: writeTerrain(grid, 0, 0), locs: writeLocs(grid, 0, 0) };
})();

export const STUB_CONTEXT: BuildContext = {
    maps: { getTerrainData: () => emptySquare.terrain, getLocData: () => emptySquare.locs },
    locs: () => ({
        name: "Rock",
        sizeX: 1,
        sizeY: 1,
        clipType: 2,
        blocksProjectile: true,
        drawn: true,
    }),
};

const PIXELS = 3;

function main(): void {
    const [out, ...args] = process.argv.slice(2);
    if (!out) {
        throw new Error("Usage: relief.ts out.png [preset=name] [name=value ...]");
    }
    const given: Record<string, unknown> = {};
    for (const arg of args) {
        const [name, value] = arg.split("=");
        if (name === "preset") {
            Object.assign(given, SETTING_PRESETS[value]);
            continue;
        }
        const def = SETTINGS[name as SettingKey];
        given[name] =
            name !== "seed" && def?.kind === "choice"
                ? value
                : def?.kind === "flag"
                  ? value === "true"
                  : Number(value);
    }
    const settings = parseSettings(JSON.stringify(given));
    const started = performance.now();
    const map = generateMapDetail(settings, STUB_CONTEXT);
    const took = performance.now() - started;
    const { grid } = map;
    const { sizeX, sizeY } = grid;
    const arena = getGeneratedArena(settings);
    const tiles = grid.levels[0];
    const corners = sizeX + 1;
    const heightAt = (x: number, y: number) => tiles.heights[x + y * corners];

    const width = sizeX * PIXELS;
    const height = sizeY * PIXELS;
    const rgb = new Uint8Array(width * height * 3);
    let steep = 0;
    let open = 0;
    let top = 0;
    let bottom = 255;
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const i = x + y * sizeX;
            const slope = getTileSlope(tiles.heights, corners, x, y);
            const blocked = (tiles.flags[i] & TILE_BLOCKED) !== 0;
            const h = heightAt(x, y);
            top = Math.max(top, h);
            bottom = Math.min(bottom, h);
            const inArena = x >= arena.x0 && y >= arena.y0 && x <= arena.x1 && y <= arena.y1;
            if (inArena) {
                steep += slope > map.walkSlope ? 1 : 0;
                open += blocked ? 0 : 1;
            }
            // Lit from the south-west, as the game's lit, on a colour for its height
            const dx = heightAt(x + 1, y) - heightAt(x, y);
            const dy = heightAt(x, y + 1) - heightAt(x, y);
            const light = Math.min(Math.max(0.72 - (dx + dy) * 0.03, 0.25), 1.3);
            let r = 80 + h * 0.75;
            let g = 110 + h * 0.5;
            let b = 60 + h * 0.6;
            if (tiles.overlays[i] && blocked && slope < 4) {
                [r, g, b] = [70, 110, 190];
            } else if (blocked) {
                [r, g, b] = [120 + h * 0.5, 104 + h * 0.5, 96 + h * 0.5];
            }
            if (map.roadTiles[i]) {
                [r, g, b] = [205, 170, 90];
            }
            const fill = [r * light, g * light, b * light].map((v) =>
                Math.min(Math.max(v, 0), 255),
            );
            for (let py = 0; py < PIXELS; py++) {
                for (let px = 0; px < PIXELS; px++) {
                    const at = (x * PIXELS + px + (height - 1 - (y * PIXELS + py)) * width) * 3;
                    rgb.set(fill, at);
                }
            }
        }
    }
    const mark = (x: number, y: number, r: number, g: number, b: number) => {
        rgb.set([r, g, b], (x + (height - 1 - y) * width) * 3);
    };
    for (let x = arena.x0 * PIXELS; x < (arena.x1 + 1) * PIXELS; x += 2) {
        mark(x, arena.y0 * PIXELS, 255, 255, 255);
        mark(x, (arena.y1 + 1) * PIXELS, 255, 255, 255);
    }
    for (let y = arena.y0 * PIXELS; y < (arena.y1 + 1) * PIXELS; y += 2) {
        mark(arena.x0 * PIXELS, y, 255, 255, 255);
        mark((arena.x1 + 1) * PIXELS, y, 255, 255, 255);
    }
    const spawn = getGeneratedSpawn(settings);
    for (let d = -5; d <= 5; d++) {
        mark(spawn.x * PIXELS + d, spawn.y * PIXELS, 255, 0, 0);
        mark(spawn.x * PIXELS, spawn.y * PIXELS + d, 255, 0, 0);
    }
    writeFileSync(out, encodePng(width, height, rgb));
    const bands = new Array(6).fill(0);
    for (let y = arena.y0; y <= arena.y1; y++) {
        for (let x = arena.x0; x <= arena.x1; x++) {
            bands[Math.min(Math.floor(heightAt(x, y) / 50), 5)]++;
        }
    }
    const share = bands.map((count) =>
        Math.round((count * 100) / ((arena.x1 - arena.x0 + 1) * (arena.y1 - arena.y0 + 1))),
    );
    console.log(`heights by 50: ${share.join(" ")}%`);

    const flags = getCollisionFlags(grid, STUB_CONTEXT.locs);
    const reached = findReachable(flags, sizeX, sizeY, arena, spawn.x, spawn.y);
    const stranded = findStranded(flags, sizeX, arena, reached).length;
    const area = (arena.x1 - arena.x0 + 1) * (arena.y1 - arena.y0 + 1);
    console.log(
        `${took.toFixed(0)} ms, heights ${bottom} to ${top}, ${((open / area) * 100).toFixed(0)}% ` +
            `open, ${((steep / area) * 100).toFixed(0)}% steep, ${stranded} stranded, ` +
            `${map.passes.length} passes, ${map.lines.length} roads`,
    );
}

main();
