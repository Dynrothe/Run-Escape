import { getCollisionFlags } from "../collision";
import { MAP_SQUARE_SIZE, TILE_BLOCKED, createTileGrid, writeLocs, writeTerrain } from "../format";
import { BuildContext } from "../recipe";
import { QUARRY, QUARRY_LOC_SIZES, QUARRY_RECIPE, buildQuarry } from "./quarryColossus";

// The Sunken Quarry builds without the cache (it stamps nothing, and everything it places stands
// on blocked rock): its shelves are open, flat and a level apart, a face between each, and the
// rest is sealed.

const sizes = new Map(QUARRY_LOC_SIZES.map(([id, sizeX, sizeY]) => [id, { sizeX, sizeY }]));
const emptySquare = (() => {
    const grid = createTileGrid(64, 64);
    return { terrain: writeTerrain(grid, 0, 0), locs: writeLocs(grid, 0, 0) };
})();
const context: BuildContext = {
    maps: { getTerrainData: () => emptySquare.terrain, getLocData: () => emptySquare.locs },
    locs: (id) => ({
        name: String(id),
        ...(sizes.get(id) ?? { sizeX: 1, sizeY: 1 }),
        clipType: 2,
        blocksProjectile: true,
        drawn: true,
    }),
};

const A = QUARRY_RECIPE.margin * MAP_SQUARE_SIZE;
const map = buildQuarry(context);
const ground = map.grid.levels[0];
const corners = QUARRY_RECIPE.squaresX * MAP_SQUARE_SIZE + 1;
const size = QUARRY_RECIPE.squaresX * MAP_SQUARE_SIZE;
const heightAt = (x: number, y: number) => ground.heights[A + x + (A + y) * corners];
const flags = getCollisionFlags(map.grid, context.locs);
const blocked = (x: number, y: number) =>
    (ground.flags[A + x + (A + y) * size] & TILE_BLOCKED) !== 0 ||
    flags[A + x + (A + y) * size] !== 0;

describe("the Sunken Quarry", () => {
    test("each shelf is open and flat at its height, a level (65) under the last", () => {
        QUARRY.shelves.forEach((s, i) => {
            for (let y = s.y0; y <= s.y1; y++) {
                for (let x = s.x0; x <= s.x1; x++) {
                    expect(blocked(x, y)).toBe(false);
                    expect(heightAt(x, y)).toBe(s.height);
                    expect(heightAt(x + 1, y + 1)).toBe(s.height);
                }
            }
            if (i > 0) {
                expect(QUARRY.shelves[i - 1].height - s.height).toBe(65);
            }
        });
    });

    test("between each shelf and the next a face a tile deep, looking south at the camera", () => {
        for (let i = 1; i < QUARRY.shelves.length; i++) {
            const upper = QUARRY.shelves[i - 1];
            const lower = QUARRY.shelves[i];
            expect(upper.y0 - lower.y1).toBe(2);
            const x = (lower.x0 + lower.x1) >> 1;
            expect(blocked(x, lower.y1 + 1)).toBe(true);
            expect(heightAt(x, upper.y0)).toBe(upper.height);
            expect(heightAt(x, lower.y1 + 1)).toBe(lower.height);
        }
    });

    test("everything off the shelves is blocked, so nothing turns up stranded", () => {
        let open = 0;
        for (let y = 0; y < MAP_SQUARE_SIZE; y++) {
            for (let x = 0; x < MAP_SQUARE_SIZE; x++) {
                if (!blocked(x, y)) {
                    open++;
                    expect(
                        QUARRY.shelves.some(
                            (s) => x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1,
                        ),
                    ).toBe(true);
                }
            }
        }
        expect(open).toBe(
            QUARRY.shelves.reduce((n, s) => n + (s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1), 0),
        );
    });

    test("the cut face north climbs off the top shelf to the byte's top", () => {
        const top = QUARRY.shelves[0];
        const x = (top.x0 + top.x1) >> 1;
        expect(heightAt(x, top.y1 + 5)).toBe(255);
    });

    test("each shelf's rise, start, pillars, faults and plates are on it", () => {
        QUARRY.shelves.forEach((s, i) => {
            const on = ({ x, y }: { x: number; y: number }) =>
                x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1;
            expect(on(QUARRY.rises[i])).toBe(true);
            expect(on(QUARRY.starts[i])).toBe(true);
            for (const p of QUARRY.pillars[i]) {
                expect(on(p) && on({ x: p.x + 1, y: p.y + 1 })).toBe(true);
            }
            for (const seam of QUARRY.faults[i]) {
                expect(seam.every(on)).toBe(true);
            }
            expect(QUARRY.plates[i].every(on)).toBe(true);
        });
    });

    test("no fault runs under a pillar, and no plate's on a fault", () => {
        QUARRY.shelves.forEach((_, i) => {
            const pillarTiles = QUARRY.pillars[i].flatMap((p) => [
                `${p.x},${p.y}`,
                `${p.x + 1},${p.y}`,
                `${p.x},${p.y + 1}`,
                `${p.x + 1},${p.y + 1}`,
            ]);
            const faultTiles = QUARRY.faults[i].flat().map((t) => `${t.x},${t.y}`);
            expect(faultTiles.filter((t) => pillarTiles.includes(t))).toEqual([]);
            expect(QUARRY.plates[i].filter((p) => faultTiles.includes(`${p.x},${p.y}`))).toEqual(
                [],
            );
        });
    });

    test("builds the same every time", () => {
        expect(buildQuarry(context).grid.locs).toEqual(map.grid.locs);
    });
});
