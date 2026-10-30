import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { GAME_CACHE_NAME } from "../cache";
import type { BiomeId } from "./biomes";
import { findReachable, findStranded, getCollisionFlags } from "./collision";
import { createTileGrid, writeLocs, writeTerrain } from "./format";
import {
    DEFAULT_SETTINGS,
    GeneratorSettings,
    SETTING_LIMITS,
    generateMap,
    getGeneratedArena,
    getGeneratedSpawn,
    getSettingsError,
} from "./generator";
import type { BuildContext } from "./recipe";

// A world with no cache behind it, where everything cut from it is walled rooms
// with no way in: the worst a prefab could be for reachability
const worldSquare = (() => {
    const grid = createTileGrid(64, 64);
    for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
            if (x % 5 === 0 || y % 5 === 0) {
                grid.locs.push({ id: 1, type: 10, rotation: 0, level: 0, x, y });
            }
        }
    }
    return { terrain: writeTerrain(grid, 0, 0), locs: writeLocs(grid, 0, 0) };
})();

const context: BuildContext = {
    maps: { getTerrainData: () => worldSquare.terrain, getLocData: () => worldSquare.locs },
    locs: () => ({
        name: "Crate",
        sizeX: 1,
        sizeY: 1,
        clipType: 2,
        blocksProjectile: true,
        drawn: true,
    }),
};

function settings(overrides: Partial<GeneratorSettings>): GeneratorSettings {
    return { seed: 1, ...DEFAULT_SETTINGS, ...overrides };
}

describe("generateMap", () => {
    it("makes the same map from the same seed and settings", () => {
        const a = generateMap(settings({ seed: 5, rivers: 1 }), context);
        const b = generateMap(settings({ seed: 5, rivers: 1 }), context);
        expect(writeTerrain(a, 64, 64)).toEqual(writeTerrain(b, 64, 64));
        expect(writeLocs(a, 64, 64)).toEqual(writeLocs(b, 64, 64));
    });

    it("makes a different map from another seed", () => {
        const a = generateMap(settings({ seed: 5 }), context);
        const b = generateMap(settings({ seed: 6 }), context);
        expect(writeTerrain(a, 64, 64)).not.toEqual(writeTerrain(b, 64, 64));
    });

    it("has limits for every number in the settings", () => {
        const numbers = Object.keys(DEFAULT_SETTINGS).filter((key) => key !== "biome");
        expect(Object.keys(SETTING_LIMITS).sort()).toEqual(numbers.sort());
    });

    it("says what's wrong with bad settings, and won't build them", () => {
        expect(getSettingsError(settings({}))).toBeUndefined();
        const bad: Partial<GeneratorSettings>[] = [
            { seed: NaN },
            { seed: -1 },
            { seed: 1.5 },
            { squares: 4 },
            { squares: 1.5 },
            { island: 2 },
            { ponds: NaN },
            { rivers: 3 },
            { biome: "moon" as BiomeId },
        ];
        for (const overrides of bad) {
            const full = settings(overrides);
            expect(getSettingsError(full)).toBeDefined();
            expect(() => generateMap(full, context)).toThrow();
        }
    });

    it("refuses to make a map with too little ground to play on", () => {
        const allPonds = settings({ squares: 1, island: 1, ponds: 12, buildings: 0, seed: 3 });
        expect(() => generateMap(allPonds, context)).toThrow(/too little ground/);
    });

    it("listens to its settings", () => {
        const count = (overrides: Partial<GeneratorSettings>) =>
            generateMap(settings(overrides), context).locs.filter((loc) => loc.type === 10).length;
        expect(count({ trees: 1, rocks: 1 })).toBeGreaterThan(count({ trees: 0, rocks: 0 }));
    });

    const CASES: Partial<GeneratorSettings>[] = [
        {},
        { squares: 1, island: 1 },
        { squares: 3, island: 0, rivers: 2 },
        { biome: "desert", island: 0, ponds: 6 },
        { biome: "swamp", island: 0.2, rivers: 2, ponds: 6, trees: 1 },
        { biome: "snow", island: 0.6, rivers: 1, buildings: 1, trees: 1, rocks: 1 },
        { island: 0, rivers: 2, buildings: 1, roads: 0 },
    ];
    const SEEDS = [1, 2, 3, 4, 5];

    it.each(CASES)("leaves no open tile cut off from the spawn: %o", (overrides) => {
        for (const seed of SEEDS) {
            const full = settings({ ...overrides, seed });
            const grid = generateMap(full, context);
            const arena = getGeneratedArena(full);
            const spawn = getGeneratedSpawn(full);
            const flags = getCollisionFlags(grid, context.locs);
            const reached = findReachable(flags, grid.sizeX, grid.sizeY, arena, spawn.x, spawn.y);
            expect(reached[spawn.x + spawn.y * grid.sizeX]).toBe(1);
            expect(findStranded(flags, grid.sizeX, arena, reached)).toEqual([]);
            // And it didn't get there by blocking the whole map
            expect(reached.reduce((sum, v) => sum + v, 0)).toBeGreaterThan(400);
        }
    });
});

// Against the game's real collision and the real prefabs, when there's a cache.
// In a script, because the cache's loaders don't load under vitest.
describe.skipIf(!existsSync(`caches/${GAME_CACHE_NAME}`))("generated maps", () => {
    it("reach everywhere with the game's own collision", () => {
        const output = execFileSync("npx", ["tsx", "scripts/scaperune/check-maps.ts"], {
            encoding: "utf8",
            timeout: 120000,
        });
        expect(output).toContain("All open tiles reach the spawn");
    }, 130000);

    it("have every prefab's floor, in every rotation", () => {
        const output = execFileSync("npx", ["tsx", "scripts/scaperune/check-prefabs.ts"], {
            encoding: "utf8",
            timeout: 60000,
        });
        expect(output).toContain("check out in all 4 rotations");
    }, 70000);
});
