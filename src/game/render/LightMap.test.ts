import { LIGHT_MAP_SIZE, LightMap } from "./LightMap";

// The light map the shaders read (lights.glsl): lights added on the CPU, cleared frame to frame

// A texel's red, by world tiles
function red(map: LightMap, x: number, y: number): number {
    const tx = Math.floor((x - map.x0) * 2);
    const ty = Math.floor((y - map.y0) * 2);
    return map.bytes[(ty * LIGHT_MAP_SIZE + tx) * 4];
}

describe("LightMap", () => {
    test("full in the middle, soft to nothing at the edge, adding up where lights meet", () => {
        const map = new LightMap();
        map.begin(100, 100);
        map.add(100, 100, 4, 1, 0, 0);
        map.add(104, 100, 4, 0.5, 0, 0);
        expect(map.end()).toBe(true);
        // Stored over 2 (LIGHT_MAP_MAX), so 1 is about 128, and a little of the other's edge
        expect(red(map, 100, 100)).toBeGreaterThanOrEqual(128);
        expect(red(map, 100, 100)).toBeLessThan(136);
        expect(red(map, 101.5, 100)).toBeGreaterThan(100);
        expect(red(map, 100, 103.5)).toBeLessThan(30);
        expect(red(map, 100, 104.6)).toBe(0);
        // Both, between them
        expect(red(map, 102.25, 100)).toBeGreaterThan(red(map, 100, 102.25));
    });

    test("the next frame clears what the last wrote, and nothing left is nothing to send", () => {
        const map = new LightMap();
        map.begin(100, 100);
        map.add(100, 100, 3, 1, 1, 1);
        map.end();
        map.begin(100, 100);
        expect(map.end()).toBe(true);
        expect(red(map, 100, 100)).toBe(0);
        map.begin(100, 100);
        expect(map.end()).toBe(false);
    });

    test("the corner keeps to whole texels as the view moves", () => {
        const map = new LightMap();
        map.begin(100.3, 200.8);
        expect(map.x0 * 2).toBe(Math.round(map.x0 * 2));
        expect(map.y0 * 2).toBe(Math.round(map.y0 * 2));
    });
});
