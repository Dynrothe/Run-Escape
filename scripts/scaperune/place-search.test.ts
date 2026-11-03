import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { IndexLevel, WorldIndex, findPlaces, groupPlaces, nameColour } from "./place-search";

const level = (underlays: Record<string, number>, overlays: Record<string, number> = {}) => ({
    locs: {},
    underlays,
    overlays,
});

// A red place of three squares with a green one beside it, a red square on its own far off on
// the surface, and a square with a room upstairs
const INDEX: WorldIndex = {
    squares: [
        { x: 40, y: 120, ...level({ 1: 4096 }) },
        { x: 41, y: 120, ...level({ 1: 3000, 2: 1096 }) },
        { x: 41, y: 121, ...level({ 1: 4096 }, { 3: 3000 }) },
        { x: 42, y: 120, ...level({ 2: 4096 }) },
        { x: 50, y: 50, ...level({ 1: 4096 }) },
        {
            x: 51,
            y: 50,
            ...level({ 2: 4096 }),
            locs: { "100:10": 3 },
            upper: { 1: { ...level({ 1: 100 }), locs: { "200:10": 5 } } as IndexLevel },
        },
    ],
    locs: {
        "100:10": { id: 100, name: "Crate" },
        "200:10": { id: 200, name: "Bloody table" },
    },
    underlays: { 1: { rgb: "8a1010" }, 2: { rgb: "3c8a28" } },
    // A red overlay with a texture: what colour it draws isn't known
    overlays: { 3: { rgb: "8a1010", texture: 4 } },
};

describe("find-place", () => {
    it("names colours", () => {
        expect(nameColour(0x8a1010)).toBe("red");
        expect(nameColour(0x3c8a28)).toBe("green");
        expect(nameColour(0x808080)).toBe("grey");
        expect(nameColour(0x2040c0)).toBe("blue");
    });

    it("finds squares that are mostly a colour, and groups those that touch", () => {
        const matches = findPlaces(INDEX, { colour: "red" });
        // 41,121's floor is mostly a textured overlay, so it's not counted as red
        expect(matches.map((match) => [match.x, match.y])).toEqual([
            [40, 120],
            [41, 120],
            [50, 50],
        ]);
        const places = groupPlaces(matches);
        expect(places[0]).toMatchObject({ x0: 40 * 64, y0: 120 * 64, x1: 42 * 64 - 1 });
        expect(places[0].squares).toHaveLength(2);
        expect(places[1].squares).toHaveLength(1);
    });

    it("keeps to the surface, or off it", () => {
        expect(findPlaces(INDEX, { colour: "red", surface: true })).toHaveLength(1);
        expect(findPlaces(INDEX, { colour: "red", surface: false })).toHaveLength(2);
    });

    it("takes a colour by RGB and how far off it can be", () => {
        const near = { rgb: 0x881111, within: 10 };
        expect(findPlaces(INDEX, { colour: near, share: 0.9 })).toHaveLength(2);
    });

    it("finds locs by id or name, on a level", () => {
        expect(findPlaces(INDEX, { locIds: [100] }).map((match) => match.locs)).toEqual([3]);
        expect(findPlaces(INDEX, { locName: /bloody/i })).toHaveLength(0);
        const upstairs = findPlaces(INDEX, { locName: /bloody/i, plane: 1, minLocs: 5 });
        expect(upstairs.map((match) => [match.x, match.y, match.locs])).toEqual([[51, 50, 5]]);
        expect(findPlaces(INDEX, { colour: "red", plane: 1 })).toHaveLength(1);
    });
});

// With a world index made by world-index.ts at the repository's root
describe.skipIf(!fs.existsSync("world.json"))("find-place on the real world", () => {
    it("finds Vampyrium by its red ground", () => {
        const index = JSON.parse(fs.readFileSync("world.json", "utf8"));
        const [place] = groupPlaces(findPlaces(index, { colour: "red", surface: false }));
        // Where Vampyrium was found by hand
        expect(place.x0).toBeLessThanOrEqual(2496);
        expect(place.x1).toBeGreaterThanOrEqual(2690);
        expect(place.y0).toBeLessThanOrEqual(7680);
        expect(place.y1).toBeGreaterThanOrEqual(7935);
    });
});
