import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { GAME_CACHE_NAME } from "../../cache";
import { SUNKEN_CATHEDRAL, SUNKEN_CATHEDRAL_RECIPE } from "./sunkenCathedral";

// The sunken cathedral is cut from the real map, so it only builds with the cache. What the fight
// reads off it is pinned here; that it's sealed, and every point the fight uses open and reached,
// is check-maps.ts's (run below when the cache is there). BellChoir.test.ts plays the fight on its
// nave.
describe("the sunken cathedral", () => {
    it("is a nave with its bells, choir and bands inside it", () => {
        const { nave, bells, tenor, choir, bands, rise, start } = SUNKEN_CATHEDRAL;
        const inNave = (x: number, y: number) =>
            x >= nave.x0 && x <= nave.x1 && y >= nave.y0 && y <= nave.y1;
        for (const bell of bells) {
            expect(inNave(bell.x, bell.y) && inNave(bell.x + 3, bell.y + 3)).toBe(true);
        }
        // The tenor stands in the north doorway, its back to the lake
        expect(tenor.y + tenor.size - 1).toBeGreaterThan(nave.y1 - 4);
        expect(choir.filter((soul) => soul.side < 0)).toHaveLength(3);
        expect(inNave(rise.x, rise.y) && inNave(start.x, start.y)).toBe(true);
        // She rises north of the start, near enough to be on the screen
        expect(rise.y - start.y).toBeGreaterThanOrEqual(9);
        expect(rise.y - start.y).toBeLessThanOrEqual(12);
        expect(bands[0].y1).toBe(nave.y1);
        expect(bands[bands.length - 1].y0).toBe(nave.y0);
        expect(SUNKEN_CATHEDRAL_RECIPE.spawn).toEqual({ x: 64 + start.x, y: 64 + start.y });
    });
});

describe.skipIf(!existsSync(`caches/${GAME_CACHE_NAME}`))("the sunken cathedral, built", () => {
    it("passes check-maps: sealed, with every point open and reached", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "scripts/scaperune/check-maps.ts"],
            { encoding: "utf8", timeout: 240000, env: { ...process.env, ONLY: "bellchoir" } },
        );
        expect(stdout).toContain("bellchoir:");
        expect(stdout).toContain("the ground's right");
    }, 250000);
});
