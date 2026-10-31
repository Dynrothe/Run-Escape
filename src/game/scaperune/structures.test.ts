import { describe, expect, it } from "vitest";

import { BIOMES } from "./biomes";
import { findReachable, findStranded, getCollisionFlags } from "./collision";
import { TILE_BLOCKED, createTileGrid, writeLocs, writeTerrain } from "./format";
import {
    DEFAULT_SETTINGS,
    GeneratorSettings,
    SETTING_PRESETS,
    generateMapDetail,
    getGeneratedArena,
    getGeneratedSpawn,
} from "./generator";
import { BRIDGES, PREFABS } from "./prefabs";
import type { BuildContext } from "./recipe";
import { SET_PIECES, getPieceLocs } from "./structures";

// A world with no cache behind it: everything cut from it is one small walled room
const worldSquare = (() => {
    const grid = createTileGrid(64, 64);
    for (let at = 1; at < 8; at++) {
        grid.locs.push({ id: 1, type: 0, rotation: 3, level: 0, x: at, y: 1 });
        grid.locs.push({ id: 1, type: 0, rotation: 1, level: 0, x: at, y: 7 });
        grid.locs.push({ id: 1, type: 0, rotation: 0, level: 0, x: 1, y: at });
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

function expectAllReachable(full: GeneratorSettings): void {
    const { grid } = generateMapDetail(full, context);
    const arena = getGeneratedArena(full);
    const spawn = getGeneratedSpawn(full);
    const flags = getCollisionFlags(grid, context.locs);
    const reached = findReachable(flags, grid.sizeX, grid.sizeY, arena, spawn.x, spawn.y);
    expect(findStranded(flags, grid.sizeX, arena, reached)).toEqual([]);
}

describe("biomes", () => {
    it.each(Object.keys(BIOMES))("%s only names what's there", (id) => {
        const biome = BIOMES[id as keyof typeof BIOMES];
        for (const name of [...biome.buildings, ...(biome.ruins ?? [])]) {
            expect(PREFABS[name], name).toBeDefined();
        }
        for (const name of biome.landmarks) {
            expect(SET_PIECES[name], name).toBeDefined();
        }
        expect(BRIDGES[biome.bridge]).toBeDefined();
        expect(biome.rock.boulders.length).toBeGreaterThan(0);
        expect(biome.ruins ?? biome.buildings).not.toEqual([]);
    });

    it("has a preset for each that starts from it", () => {
        const shown = Object.values(SETTING_PRESETS).map((preset) => preset.biome ?? "meadow");
        expect(new Set(shown)).toEqual(new Set(Object.keys(BIOMES)));
    });

    it("keeps each piece of water one kind on a mixed map", () => {
        const full = settings({
            biome: "ash",
            secondBiome: "meadow",
            biomeMix: 0.5,
            squaresX: 3,
            squaresY: 3,
            rivers: 2,
            lakes: 3,
            buildings: 0,
        });
        const { grid } = generateMapDetail(full, context);
        const { flags, overlays } = grid.levels[0];
        const water = new Set([BIOMES.ash.water, BIOMES.meadow.water]);
        const { sizeX } = grid;
        const steps = overlays.reduce((count, overlay, i) => {
            const other = overlays[i + 1];
            const beside = flags[i] & TILE_BLOCKED && flags[i + 1] & TILE_BLOCKED;
            return beside && water.has(overlay) && water.has(other) && overlay !== other
                ? count + 1
                : count;
        }, 0);
        expect(sizeX).toBeGreaterThan(0);
        expect(steps).toBe(0);
    });

    it("paints each biome's own road on a mixed map", () => {
        const full = settings({
            biome: "desert",
            secondBiome: "snow",
            biomeMix: 0.5,
            squaresX: 4,
            squaresY: 4,
            roads: 1,
            roadStyle: "ring",
        });
        const { grid, roadTiles } = generateMapDetail(full, context);
        const used = new Set(
            grid.levels[0].overlays.filter((overlay, i) => roadTiles[i] && overlay !== 0),
        );
        expect(used).toEqual(new Set([BIOMES.desert.road, BIOMES.snow.road]));
    });
});

describe("set pieces", () => {
    it("has a size for every loc", () => {
        for (const piece of Object.values(SET_PIECES)) {
            for (const [id, across, deep] of getPieceLocs(piece)) {
                expect(id).toBeGreaterThan(0);
                expect(across * deep).toBeGreaterThan(0);
            }
        }
    });

    it.each(Object.keys(BIOMES))("leaves all of %s reachable with its set pieces", (id) => {
        expectAllReachable(
            settings({
                biome: id as keyof typeof BIOMES,
                landmarks: 1,
                hills: 0.1,
                squaresX: 3,
                squaresY: 3,
                lakes: 3,
                ruins: 0.5,
                seed: 4,
            }),
        );
    });

    it("leaves a way into a walled town", () => {
        for (const seed of [1, 2, 3]) {
            expectAllReachable(
                settings({
                    seed,
                    towns: 2,
                    townSize: 20,
                    townWalls: 1,
                    buildings: 1,
                    squaresX: 3,
                    squaresY: 3,
                    waymarkers: 1,
                }),
            );
        }
    });
});
