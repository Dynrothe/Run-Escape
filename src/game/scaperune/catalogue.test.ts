import { describe, expect, it } from "vitest";

import { Ground, isStamped } from "./Ground";
import {
    BANNED_LOCS,
    KIT_PIECES,
    KitPiece,
    LocRange,
    findLoneKitPieces,
    findRule,
} from "./catalogue";
import { PlacedLoc, createTileGrid } from "./format";

function loc(id: number, x: number, y: number, level = 0): PlacedLoc {
    return { id, type: 10, rotation: 0, level, x, y };
}

function grid(...locs: PlacedLoc[]) {
    const out = createTileGrid(16, 16);
    out.locs.push(...locs);
    return out;
}

// A made-up kit: a pillar that needs its wall, and a wall section with no known set
const PIECES: KitPiece[] = [
    { ids: [100, 101], why: "a pillar", set: [[200, 200]] },
    { ids: [300, 300], why: "a wall section" },
    { ids: [400, 409], why: "flags", set: [[400, 409]], reach: 1 },
];

describe("kit pieces", () => {
    it("flags a piece placed without its set", () => {
        const found = findLoneKitPieces(grid(loc(100, 5, 5)), undefined, PIECES);
        expect(found.map(({ loc: { id }, why }) => [id, why])).toEqual([[100, "a pillar"]]);
    });

    it("passes a piece with its set in reach, on any level", () => {
        expect(findLoneKitPieces(grid(loc(101, 5, 5), loc(200, 7, 3)), undefined, PIECES)).toEqual(
            [],
        );
        expect(
            findLoneKitPieces(grid(loc(101, 5, 5), loc(200, 5, 5, 1)), undefined, PIECES),
        ).toEqual([]);
    });

    it("flags a piece whose set is out of reach", () => {
        expect(
            findLoneKitPieces(grid(loc(100, 5, 5), loc(200, 8, 5)), undefined, PIECES),
        ).toHaveLength(1);
    });

    it("needs another of a set that's its own kind", () => {
        expect(findLoneKitPieces(grid(loc(400, 5, 5)), undefined, PIECES)).toHaveLength(1);
        expect(findLoneKitPieces(grid(loc(400, 5, 5), loc(409, 6, 6)), undefined, PIECES)).toEqual(
            [],
        );
        expect(
            findLoneKitPieces(grid(loc(400, 5, 5), loc(409, 7, 5)), undefined, PIECES),
        ).toHaveLength(2);
    });

    it("passes a piece with no known set only when it's intact", () => {
        const piece = loc(300, 5, 5);
        expect(findLoneKitPieces(grid(piece), undefined, PIECES)).toHaveLength(1);
        expect(findLoneKitPieces(grid(piece), (l) => l === piece, PIECES)).toEqual([]);
    });

    it("leaves other locs alone", () => {
        expect(findLoneKitPieces(grid(loc(1276, 5, 5), loc(200, 5, 5)), undefined, PIECES)).toEqual(
            [],
        );
    });

    it("knows a stamped prefab's locs from placed ones", () => {
        const ground = new Ground(16, 16);
        const prefab = createTileGrid(4, 4);
        prefab.locs.push(loc(32763, 1, 1));
        ground.stamp(prefab, 4, 4, { floor: "all", feather: 0, flatten: true });
        const placed = loc(32763, 10, 10);
        ground.grid.locs.push(placed);
        const [stamped] = ground.grid.locs;
        expect(isStamped(stamped)).toBe(true);
        expect(isStamped(placed)).toBe(false);
        expect(isStamped(prefab.locs[0])).toBe(false);
        // The real list: the stamped pillar is whole, the placed one isn't
        const found = findLoneKitPieces(ground.grid, isStamped);
        expect(found.map(({ loc }) => loc)).toEqual([placed]);
    });

    it("flags the pieces the Theatre and the Sanctuary were broken by", () => {
        for (const id of [32763, 32764, 32974, 32866, 32697, 37646, 37657, 37865, 37709, 37637]) {
            expect(findLoneKitPieces(grid(loc(id, 5, 5)))).toHaveLength(1);
        }
        // A spike with its level 1 piece over it is the stack as built
        expect(findLoneKitPieces(grid(loc(37646, 5, 5), loc(37659, 5, 5, 1)))).toEqual([]);
    });
});

describe("the lists", () => {
    it.each([
        ["BANNED_LOCS", BANNED_LOCS.map(({ ids }) => ids)],
        ["KIT_PIECES", KIT_PIECES.map(({ ids }) => ids)],
    ])("%s has ranges in order", (_, ranges: LocRange[]) => {
        for (const [from, to] of ranges) {
            expect(from).toBeLessThanOrEqual(to);
        }
    });

    it("finds an id's rule", () => {
        expect(findRule(PIECES, 405)?.why).toBe("flags");
        expect(findRule(PIECES, 102)).toBeUndefined();
    });
});
