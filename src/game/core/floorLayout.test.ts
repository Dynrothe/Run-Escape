import { FLOOR_SKINS } from "../content/floorSkins";
import { FloorDef, FloorPatternDef, FloorShapeDef, FloorSkinDef } from "../content/types";
import { createWardensFloor } from "../content/wardensFloor";
import { FLOOR_DEMOS, FLOOR_START } from "../scaperune/maps/wardensFloor";
import { ArenaFloor } from "./ArenaFloor";
import { Rng } from "./Rng";
import { TICKS_PER_SECOND } from "./Sim";
import {
    TYPE_FRAGILE,
    TYPE_PILLAR,
    TYPE_REINFORCED,
    TYPE_SAFE,
    inShape,
    layoutFloor,
} from "./floorLayout";
import { makeGrid } from "./world/testGrid";

// Floors of any shape, skin, type and slab size (FloorDef's shape, ascii, skins and tiles):
// how they're laid out, and how the patterns play on them

const BASE = 1000;
const SIZE_X = 23;
const SIZE_Y = 25;
const RECT = { x0: BASE + 1, y0: BASE + 1, x1: BASE + SIZE_X, y1: BASE + SIZE_Y };
const T = TICKS_PER_SECOND;

function field() {
    const rows: string[] = [];
    for (let y = 0; y < SIZE_Y + 2; y++) {
        let row = "";
        for (let x = 0; x < SIZE_X + 2; x++) {
            row += x === 0 || y === 0 || x === SIZE_X + 1 || y === SIZE_Y + 1 ? "#" : ".";
        }
        rows.push(row);
    }
    return makeGrid(rows, BASE, BASE);
}

// A floor with a script of these patterns, the first at 1 s and the rest every half second (or
// every gap seconds)
function floorOf(more: Partial<FloorDef>, script: FloorPatternDef[] = [], gap = 0.5): FloorDef {
    return {
        ...createWardensFloor(RECT),
        script: script.map((pattern, n) => ({ at: 1 + n * gap, pattern })),
        loopSeconds: 1000,
        ...more,
    };
}

function makeFloor(def: FloorDef, player = { x: RECT.x0 + 11.5, y: RECT.y0 + 12.5 }) {
    const grid = field();
    const floor = new ArenaFloor(def, grid, new Rng(7), T);
    const run = (until: number, from = 0) => {
        for (let tick = from; tick <= until; tick++) {
            floor.step(tick, () => player);
        }
    };
    return { grid, floor, run };
}

const tile = (x: number, y: number) => x + y * SIZE_X;

describe("its shape", () => {
    test("shapes are where they say, and unions and cuts of them", () => {
        const circle = { kind: "ellipse", rx: 5, ry: 5 } as const;
        expect(inShape(circle, 11, 12, SIZE_X, SIZE_Y)).toBe(true);
        expect(inShape(circle, 16, 12, SIZE_X, SIZE_Y)).toBe(true);
        expect(inShape(circle, 17, 12, SIZE_X, SIZE_Y)).toBe(false);
        expect(inShape(circle, 15, 16, SIZE_X, SIZE_Y)).toBe(false);
        const ring = { kind: "ring", inner: 3, outer: 5, square: true } as const;
        expect(inShape(ring, 11, 12, SIZE_X, SIZE_Y)).toBe(false);
        expect(inShape(ring, 14, 12, SIZE_X, SIZE_Y)).toBe(true);
        expect(inShape(ring, 16, 17, SIZE_X, SIZE_Y)).toBe(true);
        const diamond = { kind: "diamond", r: 4 } as const;
        expect(inShape(diamond, 13, 14, SIZE_X, SIZE_Y)).toBe(true);
        expect(inShape(diamond, 14, 15, SIZE_X, SIZE_Y)).toBe(false);
        const cross = { kind: "cross", width: 3 } as const;
        expect(inShape(cross, 12, 0, SIZE_X, SIZE_Y)).toBe(true);
        expect(inShape(cross, 13, 0, SIZE_X, SIZE_Y)).toBe(false);
        const cut = { kind: "minus", from: circle, cut: cross } as const;
        expect(inShape(cut, 11, 12, SIZE_X, SIZE_Y)).toBe(false);
        expect(inShape(cut, 14, 15, SIZE_X, SIZE_Y)).toBe(true);
        const both: FloorShapeDef = { kind: "union", of: [ring, cross] };
        expect(inShape(both, 11, 0, SIZE_X, SIZE_Y)).toBe(true);
        expect(inShape(both, 14, 12, SIZE_X, SIZE_Y)).toBe(true);
        expect(inShape(both, 2, 2, SIZE_X, SIZE_Y)).toBe(false);
    });

    test("an ascii map draws the floor, north row first, and anywhere else is the pit", () => {
        const { floor, grid } = makeFloor(
            floorOf({
                ascii: ["##.", "#..", "###"],
            }),
        );
        expect(Array.from(floor.layout.mask.slice(0, 3))).toEqual([1, 1, 1]);
        expect(floor.layout.mask[tile(1, 1)]).toBe(0);
        expect(floor.layout.mask[tile(2, 2)]).toBe(0);
        expect(floor.layout.mask[tile(0, 2)]).toBe(1);
        expect(floor.layout.mask[tile(5, 5)]).toBe(0);
        // Not floor: blocked from the start, and gone
        expect(grid.isSolid(RECT.x0 + 1, RECT.y0 + 1)).toBe(true);
        expect(grid.isSolid(RECT.x0, RECT.y0)).toBe(false);
        expect(floor.isGone(tile(1, 1), 0)).toBe(true);
    });

    test("every pattern keeps to the floor, and rows fall from its own back", () => {
        const circle = { kind: "ellipse", rx: 8, ry: 8 } as const;
        const { floor, run } = makeFloor(
            floorOf({ shape: circle, drop: { ...createWardensFloor(RECT).drop, keepRows: 3 } }, [
                { kind: "side", side: "east", rowSeconds: 0.1 },
                { kind: "ripple", at: "middle", spokes: "cross", ringSeconds: 0.1, radius: 20 },
                { kind: "dropRows", rows: 2, rowSeconds: 0.1 },
                { kind: "holes", count: 5 },
            ]),
        );
        run(1.6 * T);
        let marked = 0;
        for (let i = 0; i < floor.cueAt.length; i++) {
            if (floor.cueAt[i] !== -1) {
                marked++;
                expect(floor.layout.mask[i]).toBe(1);
            }
        }
        expect(marked).toBeGreaterThan(100);
        run(3 * T, 1.6 * T + 1);
        // The circle's back row is its own, four rows up the box
        expect(floor.layout.minY).toBe(4);
        expect(floor.dropWarnAt[tile(11, 4)]).not.toBe(-1);
        expect(floor.dropWarnAt[tile(11, 6)]).toBe(-1);
    });

    test("a sweep's gap is always on the floor, even on a ring", () => {
        const ring = { kind: "ring", inner: 5, outer: 9 } as const;
        const { floor, run } = makeFloor(
            floorOf({ shape: ring }, [{ kind: "sweep", rowSeconds: 0.1, gap: 2 }]),
        );
        run(T);
        const { minY, maxY, mask } = floor.layout;
        for (let y = minY; y <= maxY; y++) {
            let floorTiles = 0;
            let safe = 0;
            for (let x = 0; x < SIZE_X; x++) {
                if (mask[tile(x, y)]) {
                    floorTiles++;
                    safe += floor.riseAt[tile(x, y)] === -1 ? 1 : 0;
                }
            }
            // Two safe tiles side by side, or the whole row where there's no room for them
            expect(safe === 2 || safe === floorTiles).toBe(true);
        }
    });
});

describe("its tiles", () => {
    test("rules lay out skins, types and turns, the same every time, and each skin by weight", () => {
        const def = floorOf({
            seed: 3,
            tiles: [
                {
                    skin: [
                        { skin: 1, weight: 3 },
                        { skin: 2, weight: 1 },
                    ],
                    turn: "random",
                },
                { where: { kind: "border" }, type: "reinforced", skin: 0 },
                { where: { kind: "checker" }, share: 0.5, type: "fragile" },
                { where: { kind: "stripes", axis: "x", every: 6, offset: 3 }, type: "safe" },
            ],
        });
        const a = layoutFloor(def, SIZE_X, SIZE_Y);
        const b = layoutFloor(def, SIZE_X, SIZE_Y);
        expect(a).toEqual(b);
        expect(a.type[tile(0, 5)]).toBe(TYPE_REINFORCED);
        expect(a.skin[tile(0, 5)]).toBe(0);
        expect(a.type[tile(9, 7)]).toBe(TYPE_SAFE);
        const inside = [];
        for (let y = 1; y < SIZE_Y - 1; y++) {
            for (let x = 1; x < SIZE_X - 1; x++) {
                inside.push(tile(x, y));
            }
        }
        const ones = inside.filter((i) => a.skin[i] === 1).length;
        const twos = inside.filter((i) => a.skin[i] === 2).length;
        expect(ones / (ones + twos)).toBeGreaterThan(0.65);
        expect(ones / (ones + twos)).toBeLessThan(0.85);
        expect(new Set(inside.map((i) => a.turn[i])).size).toBe(4);
        const fragile = inside.filter((i) => a.type[i] === TYPE_FRAGILE).length;
        expect(fragile).toBeGreaterThan(40);
        expect(fragile).toBeLessThan(200);
        // Another seed lays it out another way
        expect(layoutFloor({ ...def, seed: 4 }, SIZE_X, SIZE_Y).skin).not.toEqual(a.skin);
    });

    test("solid and safe tiles never rise or fall, and reinforced ones never fall", () => {
        const column = (x: number) => ({ kind: "rect", x0: x, y0: 0, x1: x, y1: 24 }) as const;
        const { floor } = makeFloor(
            floorOf(
                {
                    tiles: [
                        { where: column(0), type: "solid" },
                        { where: column(1), type: "safe" },
                        { where: column(2), type: "reinforced" },
                    ],
                },
                [
                    { kind: "side", side: "both", rowSeconds: 0.02 },
                    { kind: "dropRows", rows: 2, rowSeconds: 0.02 },
                ],
            ),
        );
        const roseOn = new Set<number>();
        for (let tick = 0; tick <= 6 * T; tick++) {
            const { rose } = floor.step(tick, () => ({ x: RECT.x0 + 3, y: RECT.y0 + 3 }));
            for (let n = 0; n < rose.length; n += 2) {
                roseOn.add(rose[n] - RECT.x0);
            }
        }
        expect(roseOn.has(0)).toBe(false);
        expect(roseOn.has(1)).toBe(false);
        expect(roseOn.has(2)).toBe(true);
        expect(roseOn.has(3)).toBe(true);
        // The back rows go, but not those three columns of them
        for (let x = 0; x <= 2; x++) {
            expect(floor.dropAt[tile(x, 0)]).toBe(-1);
        }
        expect(floor.dropAt[tile(3, 0)]).not.toBe(-1);
    });

    test("fragile tiles fall faster, and by themselves after rising twice", () => {
        const fragile = { where: { kind: "rect", x0: 0, y0: 0, x1: 22, y1: 1 }, type: "fragile" };
        const { floor, run } = makeFloor(
            floorOf(
                { tiles: [fragile as never] },
                [
                    { kind: "dropRows", rows: 1, rowSeconds: 0.1 },
                    { kind: "side", side: "east", rowSeconds: 0.02 },
                    { kind: "side", side: "east", rowSeconds: 0.02 },
                ],
                2,
            ),
        );
        run(T);
        // Half the warning
        expect(floor.dropAt[tile(0, 0)] - floor.dropWarnAt[tile(0, 0)]).toBe(60);
        run(9 * T, T + 1);
        // Row 1's east half rose twice and went; its west half rose never and stays
        expect(floor.hits[tile(20, 1)]).toBe(2);
        expect(floor.dropAt[tile(20, 1)]).not.toBe(-1);
        expect(floor.dropAt[tile(2, 1)]).toBe(-1);
    });

    test("nothing falls that would leave part of the floor cut off", () => {
        // A dumbbell: two rooms and a one-tile path between them
        const ascii = [
            "#####...#####",
            "#####...#####",
            "#############",
            "#####...#####",
            "#####...#####",
        ];
        const { floor, run } = makeFloor(
            floorOf({ ascii }, [
                { kind: "holes", count: 30 },
                { kind: "dropRows", rows: 5, rowSeconds: 0.02 },
            ]),
        );
        run(3 * T);
        // The path's tiles are never holes, and no row falls that'd split it
        for (let x = 5; x <= 7; x++) {
            expect(floor.dropWarnAt[tile(x, 2)]).toBe(-1);
        }
        expect(floor.wouldSplit([])).toBe(false);
        // Unless the floor allows islands
        const islands = makeFloor(
            floorOf(
                { ascii, drop: { ...createWardensFloor(RECT).drop, keepRows: 1, islands: true } },
                [{ kind: "dropRows", rows: 4, rowSeconds: 0.02 }],
            ),
        );
        islands.run(T);
        expect(islands.floor.dropWarnAt[tile(6, 2)]).not.toBe(-1);
    });
});

describe("pillars", () => {
    test("stand in the floor: never rise or fall, block the way, and count as no way through", () => {
        // A pillar across the middle of a corridor, but for one tile
        const { floor, grid, run } = makeFloor(
            floorOf(
                {
                    ascii: ["#####", "#####", "#####"],
                    tiles: [
                        { where: { kind: "rect", x0: 0, y0: 1, x1: 3, y1: 1 }, type: "pillar" },
                    ],
                },
                [
                    { kind: "side", side: "both", rowSeconds: 0.02 },
                    { kind: "holes", count: 5 },
                ],
            ),
        );
        expect(floor.layout.type[tile(0, 1)]).toBe(TYPE_PILLAR);
        expect(grid.isSolid(RECT.x0, RECT.y0 + 1)).toBe(true);
        expect(grid.isPillar(RECT.x0, RECT.y0 + 1)).toBe(true);
        expect(grid.isDropped(RECT.x0, RECT.y0 + 1)).toBe(false);
        expect(grid.isSolid(RECT.x0 + 4, RECT.y0 + 1)).toBe(false);
        // The one tile past it is all that joins the two halves
        expect(floor.wouldSplit([tile(4, 1)])).toBe(true);
        expect(floor.wouldSplit([tile(0, 0)])).toBe(false);
        run(3 * T);
        for (let x = 0; x <= 3; x++) {
            expect(floor.roseAt[tile(x, 1)]).toBe(-1);
            expect(floor.dropAt[tile(x, 1)]).toBe(-1);
        }
        expect(floor.dropAt[tile(4, 1)]).toBe(-1);
    });
});

test("every ready-made skin is one model, a tile across or as big as it says", () => {
    for (const skin of Object.values(FLOOR_SKINS) as FloorSkinDef[]) {
        const sources = [skin.spotAnim, skin.loc, skin.model].filter((v) => v !== undefined);
        expect(sources.length).toBe(1);
        expect(skin.size ?? 1).toBeGreaterThanOrEqual(1);
    }
});

describe("slabs of several tiles", () => {
    const slabs = floorOf({ tiles: [{ slab: [2, 2] }] }, [
        { kind: "side", side: "east", rowSeconds: 0.1 },
    ]);

    test("are laid from the south-west wherever one fits, and rise as one", () => {
        const { floor, run } = makeFloor(slabs);
        const { anchor, slabX } = floor.layout;
        expect(anchor[tile(1, 1)]).toBe(tile(0, 0));
        expect(anchor[tile(3, 2)]).toBe(tile(2, 2));
        expect(slabX[tile(2, 2)]).toBe(2);
        // The odd column and row left over are tiles of their own
        expect(anchor[tile(22, 3)]).toBe(tile(22, 3));
        run(T);
        // The slab across the middle (columns 10 and 11, rows 22 and 23) rises with the east
        // half, all of it at once, when its first row would
        const at = floor.riseAt[tile(10, 22)];
        expect(at).toBe(2 * T + 5);
        expect(floor.riseAt[tile(10, 23)]).toBe(at);
        expect(floor.riseAt[tile(11, 22)]).toBe(at);
        expect(floor.riseAt[tile(9, 23)]).toBe(-1);
    });

    test("hurt all over while up, and fall whole", () => {
        const { floor, run } = makeFloor(
            floorOf({ tiles: [{ slab: [2, 2] }] }, [
                { kind: "side", side: "east", rowSeconds: 0.1 },
                { kind: "holes", count: 1 },
            ]),
        );
        const at = 2 * T + 5;
        run(at + 2);
        // A slab at the front, rows 22 and 23: all four tiles hurt
        for (const [x, y] of [
            [12, 22],
            [13, 22],
            [12, 23],
            [13, 23],
        ]) {
            expect(floor.isHurting(RECT.x0 + x, RECT.y0 + y, at + 2)).toBe(true);
        }
        let holes = 0;
        for (let i = 0; i < floor.dropAt.length; i++) {
            if (floor.dropAt[i] !== -1) {
                holes++;
                for (const j of [i, floor.layout.anchor[i]]) {
                    expect(floor.dropAt[j]).toBe(floor.dropAt[i]);
                }
            }
        }
        expect(holes).toBe(4);
    });
});

test("the Wardens' floor plays exactly as it did before floors had shapes", () => {
    const grid = field();
    const floor = new ArenaFloor(createWardensFloor(RECT), grid, new Rng(7), T);
    let h = 0;
    for (let tick = 0; tick < 2 * 145 * T; tick++) {
        const { rose, fell } = floor.step(tick, () => ({
            x: 1005.5 + (tick % 97) / 10,
            y: 1008.5 + (tick % 61) / 8,
        }));
        for (const v of [...rose, -1, ...fell, -2]) {
            h = (Math.imul(h, 31) + v + tick) | 0;
        }
    }
    expect(h).toBe(1994081359);
});

describe("the demo floors", () => {
    for (const recipe of FLOOR_DEMOS) {
        test(`${recipe.id} starts you on it, whole, and plays a loop and more without cutting it in two`, () => {
            const def = recipe.mapDef!.floor!;
            const floor = new ArenaFloor({ ...def, rect: RECT }, field(), new Rng(3), T);
            const { x, y } = FLOOR_START;
            expect(floor.layout.mask[tile(x, y)]).toBe(1);
            for (const row of def.ascii ?? []) {
                expect(row.length).toBe(SIZE_X);
            }
            expect(floor.wouldSplit([])).toBe(false);
            let player = { x: RECT.x0 + x + 0.5, y: RECT.y0 + y + 0.5 };
            for (let tick = 0; tick < def.loopSeconds * 1.5 * T; tick++) {
                floor.step(tick, () => player);
                if (tick % 97 === 0) {
                    player = { x: RECT.x0 + 2 + (tick % 19), y: RECT.y0 + 3 + (tick % 17) };
                }
                if (tick % 25 === 0) {
                    expect(floor.wouldSplit([])).toBe(false);
                }
            }
        });
    }
});
