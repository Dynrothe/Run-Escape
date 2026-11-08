import { describe, expect, it } from "vitest";

import { getCharredLoc } from "../../rs/config/loctype/LocOverrides";
import { TILE_SHOWN, createTileGrid } from "./format";
import { type RuinRules, ruinGrid } from "./ruins";

// A breach's broken ends (RuinRules.breachEnds): each jagged end's whole end against the straight
// wall still standing beside it, or against its mirror's where none does, its own bricks in front
// of it, and always a way through between them.

const FACE = 500;
// Whole at the end its rotation turns north to (east, at rotation 1), and the mirror
const WALLS: [number, number] = [901, 902];
const BRICKS: [number, number] = [903, 904];
const SIZE = 24;
const ROW = 4;

const RULES: RuinRules = {
    seed: 1,
    wallScale: 7,
    // Nothing falls or breaks: only the city wall's tiles come down, every one of them
    fallen: Infinity,
    broken: Infinity,
    crumbled: { high: {}, low: {} },
    breaches: -Infinity,
    breachEnds: { walls: WALLS, bricks: BRICKS },
    furnitureKept: 1,
    underlays: (underlay) => underlay,
    overlays: {},
    burntTrees: { 1: [1] },
    tree: /tree/,
    plant: /plant/,
    gone: /door/,
    landmark: /fountain/,
};

// A wall's face along x (turned 1: on its tiles' north sides) on `walls`, a city wall's on
// `breached`, which comes down. Each tile of the line after: # a wall standing, / a jagged end
// whole at its east end, \ whole at its west, , bricks alone, . nothing
function breach(walls: number[], breached: number[]): string {
    const grid = createTileGrid(SIZE, 8);
    for (const x of walls) {
        grid.locs.push({ id: FACE, type: 0, rotation: 1, level: 0, x, y: ROW });
    }
    for (const x of breached) {
        grid.levels[1].flags[x + ROW * SIZE] |= TILE_SHOWN;
    }
    ruinGrid(
        grid,
        () => ({
            name: "Wall",
            sizeX: 1,
            sizeY: 1,
            clipType: 2,
            blocksProjectile: true,
            drawn: true,
        }),
        RULES,
    );
    let line = "";
    for (let x = 0; x < SIZE; x++) {
        const ids = grid.locs.filter((loc) => loc.x === x && loc.y === ROW).map((loc) => loc.id);
        const end = WALLS.findIndex((id) => ids.includes(id));
        const bricks = BRICKS.findIndex((id) => ids.includes(id));
        if (end !== -1) {
            // with its own bricks
            expect(bricks).toBe(end);
            expect(ids).toHaveLength(2);
        }
        line +=
            ids.length === 0
                ? "."
                : ids.includes(getCharredLoc(FACE))
                  ? "#"
                  : end === 0
                    ? "/"
                    : end === 1
                      ? "\\"
                      : ",";
    }
    return line;
}

const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("a breach's broken ends", () => {
    it("are whole against the wall standing either side", () => {
        expect(breach(range(2, 17), range(6, 13))).toBe("..####\\....../####......");
    });

    it("stand back to back where no straight wall's beside them, as at a corner that came down", () => {
        expect(breach(range(2, 13), range(6, 13))).toBe("..####\\...../\\..........");
        expect(breach(range(6, 13), range(6, 13))).toBe("....../\\..../\\..........");
        expect(breach(range(6, 13), range(6, 12))).toBe("....../\\..../#..........");
    });

    it("leave a way through, losing their pairs first, then the rest, to bricks alone", () => {
        // Five tiles: a pair and two between, but not two pairs; four: an end, but not a pair
        expect(breach(range(6, 10), range(6, 10))).toBe("......,../\\.............");
        expect(breach(range(6, 10), range(6, 9))).toBe("......,../#.............");
        expect(breach(range(2, 17), range(6, 8))).toBe("..####,./#########......");
        expect(breach(range(2, 17), range(6, 7))).toBe("..####,,##########......");
        expect(breach(range(2, 17), range(6, 6))).toBe("..####,###########......");
    });
});
