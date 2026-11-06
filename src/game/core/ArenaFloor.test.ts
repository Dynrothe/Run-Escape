import { MAP_BY_ID, getMap } from "../content/maps";
import { FloorDef, FloorPatternDef, MapDef, emptyStats } from "../content/types";
import { createWardensFloor } from "../content/wardensFloor";
import { ArenaFloor } from "./ArenaFloor";
import { Rng } from "./Rng";
import { FLOOR_SOURCE, Sim, TICKS_PER_SECOND } from "./Sim";
import { makeGrid } from "./world/testGrid";

// The floor that rises and falls away (MapDef.floor): its patterns, what a fallen tile does to
// the grid, and what it does to the player, on a field the floor's size with a wall round it

const BASE = 1000;
// The floor: 23 by 25 tiles, as the Wardens' room's is, a tile in from the wall
const SIZE_X = 23;
const SIZE_Y = 25;
const RECT = { x0: BASE + 1, y0: BASE + 1, x1: BASE + SIZE_X, y1: BASE + SIZE_Y };
const MIDDLE_X = Math.floor(SIZE_X / 2);
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

// The Wardens' floor's numbers with a script of one pattern, at 1 s, that never comes round again
function floorWith(pattern: FloorPatternDef, more: FloorDef["script"] = []): FloorDef {
    return {
        ...createWardensFloor(RECT),
        script: [{ at: 1, pattern }, ...more],
        loopSeconds: 1000,
    };
}

function makeFloor(def: FloorDef) {
    const grid = field();
    const floor = new ArenaFloor(def, grid, new Rng(7), T);
    let player = { x: RECT.x0 + 3.5, y: RECT.y0 + 3.5 };
    const run = (until: number, from = 0) => {
        for (let tick = from; tick <= until; tick++) {
            floor.step(tick, () => player);
        }
    };
    return { grid, floor, run, setPlayer: (x: number, y: number) => (player = { x, y }) };
}

// Floor tiles (from its south-west corner) and when each rises, from the floor's arrays
function riseTicks(floor: ArenaFloor): Map<string, number> {
    const rises = new Map<string, number>();
    for (let i = 0; i < floor.riseAt.length; i++) {
        if (floor.riseAt[i] !== -1) {
            rises.set(`${i % floor.sizeX},${Math.floor(i / floor.sizeX)}`, floor.riseAt[i]);
        }
    }
    return rises;
}

describe("its patterns", () => {
    test("a slam down the east half goes row by row from the front, warned a second ahead", () => {
        const { floor, run } = makeFloor(
            floorWith({ kind: "side", side: "east", rowSeconds: 0.1 }),
        );
        run(T);
        const rises = riseTicks(floor);
        for (let y = 0; y < SIZE_Y; y++) {
            for (let x = 0; x < SIZE_X; x++) {
                const at = rises.get(`${x},${y}`);
                if (x < MIDDLE_X) {
                    expect(at).toBeUndefined();
                } else {
                    // The front row first, a warning (1 s) after it starts
                    expect(at).toBe(T + T + (SIZE_Y - 1 - y) * 5);
                    expect(floor.warnAt[x + y * SIZE_X]).toBe(at! - T);
                }
            }
        }
    });

    test("both sides leave the middle three columns, and only them", () => {
        const { floor, run } = makeFloor(
            floorWith({ kind: "side", side: "both", rowSeconds: 0.1 }),
        );
        run(T);
        const rises = riseTicks(floor);
        for (let x = 0; x < SIZE_X; x++) {
            expect(rises.has(`${x},10`)).toBe(Math.abs(x - MIDDLE_X) > 1);
        }
    });

    test("a sweep leaves a gap in every row that moves a tile at most from row to row", () => {
        const { floor, run } = makeFloor(floorWith({ kind: "sweep", rowSeconds: 0.1, gap: 2 }));
        run(T);
        const rises = riseTicks(floor);
        let last = -1;
        for (let y = SIZE_Y - 1; y >= 0; y--) {
            const gap: number[] = [];
            for (let x = 0; x < SIZE_X; x++) {
                if (!rises.has(`${x},${y}`)) {
                    gap.push(x);
                }
            }
            expect(gap.length).toBe(2);
            expect(gap[1] - gap[0]).toBe(1);
            if (last >= 0) {
                expect(Math.abs(gap[0] - last)).toBeLessThanOrEqual(1);
            }
            last = gap[0];
        }
    });

    test("a ripple comes up under the player first, then out in rings, never on its spokes", () => {
        const { floor, run, setPlayer } = makeFloor(
            floorWith({
                kind: "ripple",
                at: "player",
                spokes: "cross",
                ringSeconds: 0.2,
                radius: 5,
            }),
        );
        setPlayer(RECT.x0 + 8.5, RECT.y0 + 9.5);
        run(T);
        const rises = riseTicks(floor);
        expect(rises.get("8,9")).toBe(2 * T);
        expect(rises.get("9,10")).toBe(2 * T + 10);
        expect(rises.get("11,12")).toBe(2 * T + 30);
        for (const spoke of ["8,10", "8,14", "9,9", "3,9", "8,4"]) {
            expect(rises.has(spoke)).toBe(false);
        }
        // Past its radius, nothing
        expect(rises.has("14,12")).toBe(false);
    });

    test("only a tile's slab while it's up hurts", () => {
        const { floor, run } = makeFloor(
            floorWith({ kind: "side", side: "east", rowSeconds: 0.1 }),
        );
        const at = 2 * T;
        const x = RECT.x1;
        const y = RECT.y1;
        run(at - 1);
        expect(floor.isHurting(x, y, at - 1)).toBe(false);
        run(at, at);
        expect(floor.isHurting(x, y, at)).toBe(false);
        expect(floor.isHurting(x, y, at + 2)).toBe(true);
        expect(floor.isHurting(x, y, at + 14)).toBe(true);
        expect(floor.isHurting(x, y, at + 15)).toBe(false);
        // A tile of the west half never came up
        expect(floor.isHurting(RECT.x0, y, at + 5)).toBe(false);
    });
});

// The tiles marked from a pattern's start (ArenaFloor.cueAt), as the client shows them
function marked(floor: ArenaFloor, tick: number): Set<string> {
    const tiles = new Set<string>();
    for (let i = 0; i < floor.cueAt.length; i++) {
        if (floor.isMarked(i, tick)) {
            tiles.add(`${i % floor.sizeX},${Math.floor(i / floor.sizeX)}`);
        }
    }
    return tiles;
}

describe("its whole shape, known as it starts", () => {
    test("every tile a wave will raise is marked as it starts, the far rows too, and no other", () => {
        const { floor, run } = makeFloor(
            floorWith({ kind: "side", side: "east", rowSeconds: 0.1 }),
        );
        run(T);
        const tiles = marked(floor, T);
        const rises = riseTicks(floor);
        expect(tiles).toEqual(new Set(rises.keys()));
        // The back row, rising long after its own warning starts, is marked from the start
        const back = MIDDLE_X; // row 0, the back
        expect(floor.cueAt[back]).toBe(T);
        expect(floor.warnAt[back]).toBeGreaterThan(T + 2 * T);
        expect(tiles.has(`${MIDDLE_X - 1},0`)).toBe(false);
        // Each is unmarked as it comes up
        run(2 * T, T + 1);
        expect(marked(floor, 2 * T).has(`${MIDDLE_X},${SIZE_Y - 1}`)).toBe(false);
        expect(marked(floor, 2 * T).has(`${MIDDLE_X},0`)).toBe(true);
    });

    test("a sweep's wandering gap and a ripple's spokes are unmarked from the start", () => {
        const sweep = makeFloor(floorWith({ kind: "sweep", rowSeconds: 0.1, gap: 2 }));
        sweep.run(T);
        const sweepTiles = marked(sweep.floor, T);
        let gaps = 0;
        for (let y = 0; y < SIZE_Y; y++) {
            for (let x = 0; x < SIZE_X; x++) {
                const rises = riseTicks(sweep.floor).has(`${x},${y}`);
                expect(sweepTiles.has(`${x},${y}`)).toBe(rises);
                gaps += rises ? 0 : 1;
            }
        }
        expect(gaps).toBe(2 * SIZE_Y);

        const ripple = makeFloor(
            floorWith({
                kind: "ripple",
                at: "player",
                spokes: "cross",
                ringSeconds: 0.2,
                radius: 5,
            }),
        );
        ripple.setPlayer(RECT.x0 + 8.5, RECT.y0 + 9.5);
        ripple.run(T);
        // Moving off doesn't move it: it's where they stood as it started
        ripple.setPlayer(RECT.x0 + 15.5, RECT.y0 + 15.5);
        ripple.run(T + 10, T + 1);
        const rippleTiles = marked(ripple.floor, T + 10);
        expect(rippleTiles.has("8,9")).toBe(true);
        expect(rippleTiles.has("11,12")).toBe(true);
        for (const spoke of ["8,10", "8,14", "9,9", "3,9", "14,12", "15,15"]) {
            expect(rippleTiles.has(spoke)).toBe(false);
        }
    });

    test("overlapping patterns mark every tile any of them will hit", () => {
        const { floor, run } = makeFloor(
            floorWith({ kind: "side", side: "east", rowSeconds: 0.1 }, [
                { at: 1.5, pattern: { kind: "side", side: "west", rowSeconds: 0.1 } },
            ]),
        );
        run(1.5 * T);
        const tiles = marked(floor, 1.5 * T);
        // Both are on their way: the east from the first, the west from its own start, and
        // between them every tile
        expect(tiles.size).toBe(SIZE_X * SIZE_Y);
        expect(floor.cueAt[SIZE_X - 1]).toBe(T);
        expect(floor.cueAt[0]).toBe(1.5 * T);
        // Once the east's front row's up, its tiles are unmarked, and the west's still are
        run(2 * T + 1, 1.5 * T + 1);
        const later = marked(floor, 2 * T + 1);
        expect(later.has(`${SIZE_X - 1},${SIZE_Y - 1}`)).toBe(false);
        expect(later.has(`0,${SIZE_Y - 1}`)).toBe(true);
    });

    test("rows to fall are marked from the start, the later rows too, until they're back", () => {
        const { floor, run } = makeFloor(
            floorWith({ kind: "dropRows", rows: 3, rowSeconds: 0.4 }, [
                { at: 6, pattern: { kind: "restore", rowSeconds: 0.05 } },
            ]),
        );
        run(T);
        const tiles = marked(floor, T);
        // The third row's warning starts 0.8 s in, and it's marked now
        expect(floor.dropWarnAt[2 * SIZE_X]).toBe(T + 0.8 * T);
        expect(tiles.has("4,2")).toBe(true);
        expect(tiles.has("4,3")).toBe(false);
        expect(tiles.size).toBe(3 * SIZE_X);
        // Gone isn't marked: there's nothing there to stand on
        run(5 * T, T + 1);
        expect(marked(floor, 5 * T).size).toBe(0);
        run(10 * T, 5 * T + 1);
        expect(floor.cueAt.every((at) => at === -1)).toBe(true);
    });

    test("each tile's shown as its pattern says, or as the floor does", () => {
        const { floor, run } = makeFloor({
            ...floorWith({ kind: "side", side: "east", rowSeconds: 0.1, cue: "bold" }, [
                { at: 1.5, pattern: { kind: "side", side: "west", rowSeconds: 0.1 } },
            ]),
            cue: "subtle",
        });
        run(1.5 * T);
        expect(floor.cueBold[SIZE_X - 1]).toBe(1);
        expect(floor.cueBold[0]).toBe(0);
        // Unset on the floor too, it's subtle
        const plain = makeFloor({
            ...floorWith({ kind: "side", side: "east", rowSeconds: 0.1 }),
            cue: undefined,
        });
        plain.run(T);
        expect(plain.floor.cueBold.every((bold) => bold === 0)).toBe(true);
    });

    test("the Wardens' floor shows its both-halves slams bold, and the rest subtle", () => {
        const def = createWardensFloor(RECT);
        expect(def.cue).toBe("subtle");
        const bold = def.script.filter((beat) => beat.pattern?.cue === "bold");
        expect(bold.length).toBeGreaterThan(0);
        for (const beat of bold) {
            expect(beat.pattern).toMatchObject({ kind: "side", side: "both" });
        }
    });
});

describe("falling away", () => {
    test("rows go from the back, are blocked once gone, and some are always left", () => {
        const { floor, grid, run } = makeFloor(
            floorWith({ kind: "dropRows", rows: 30, rowSeconds: 0.1 }),
        );
        run(T);
        const keep = createWardensFloor(RECT).drop.keepRows;
        expect(floor.rowsDropped).toBe(SIZE_Y - keep);
        // Warned for 2.4 s first, and walked on until it goes
        const goes = T + 120;
        run(goes - 1, T + 1);
        expect(grid.isSolid(RECT.x0, RECT.y0)).toBe(false);
        expect(floor.isFalling(RECT.x0, RECT.y0, goes - 1)).toBe(true);
        run(goes, goes);
        expect(grid.isSolid(RECT.x0, RECT.y0)).toBe(true);
        expect(grid.isDropped(RECT.x0 + 5, RECT.y0)).toBe(true);
        run(20 * T, goes + 1);
        for (let y = 0; y < SIZE_Y; y++) {
            expect(grid.isSolid(RECT.x0 + 4, RECT.y0 + y)).toBe(y < SIZE_Y - keep);
        }
    });

    test("no slab rises on a tile that's going", () => {
        const { floor, run } = makeFloor(
            floorWith({ kind: "dropRows", rows: 2, rowSeconds: 0.1 }, [
                { at: 1.5, pattern: { kind: "side", side: "both", rowSeconds: 0.05 } },
            ]),
        );
        run(2 * T);
        const rises = riseTicks(floor);
        expect(rises.has("0,0")).toBe(false);
        expect(rises.has("0,1")).toBe(false);
        expect(rises.has("0,2")).toBe(true);
    });

    test("holes are single tiles inside the edge, never beside each other", () => {
        const { floor, run } = makeFloor(floorWith({ kind: "holes", count: 40 }));
        run(T);
        const holes: [number, number][] = [];
        for (let i = 0; i < floor.dropAt.length; i++) {
            if (floor.dropAt[i] !== -1) {
                holes.push([i % SIZE_X, Math.floor(i / SIZE_X)]);
            }
        }
        expect(holes.length).toBeGreaterThan(10);
        for (const [x, y] of holes) {
            expect(x > 0 && y > 0 && x < SIZE_X - 1 && y < SIZE_Y - 1).toBe(true);
            for (const [ox, oy] of holes) {
                if (ox !== x || oy !== y) {
                    expect(Math.max(Math.abs(ox - x), Math.abs(oy - y))).toBeGreaterThan(1);
                }
            }
        }
    });

    test("restore puts every tile back, and the grid with it", () => {
        const { floor, grid, run } = makeFloor(
            floorWith({ kind: "dropRows", rows: 3, rowSeconds: 0.1 }, [
                { at: 6, pattern: { kind: "restore", rowSeconds: 0.05 } },
            ]),
        );
        run(5 * T);
        expect(grid.isSolid(RECT.x0 + 2, RECT.y0 + 1)).toBe(true);
        run(10 * T, 5 * T + 1);
        expect(grid.isSolid(RECT.x0 + 2, RECT.y0 + 1)).toBe(false);
        expect(floor.rowsDropped).toBe(0);
        expect(floor.dropAt.every((at) => at === -1)).toBe(true);
    });

    test("a grid kept from a run before has its floor back", () => {
        const grid = field();
        grid.dropTile(RECT.x0 + 3, RECT.y0 + 3);
        expect(grid.isSolid(RECT.x0 + 3, RECT.y0 + 3)).toBe(true);
        new ArenaFloor(floorWith({ kind: "holes", count: 1 }), grid, new Rng(1), T);
        expect(grid.isSolid(RECT.x0 + 3, RECT.y0 + 3)).toBe(false);
    });

    test("the way round a fallen tile is worked out again", () => {
        const grid = field();
        const version = grid.version;
        const x = RECT.x0 + 4;
        const y = RECT.y0 + 4;
        expect(grid.steps.can(x - 1, y, 1)).toBe(true);
        grid.dropTile(x, y);
        expect(grid.version).toBeGreaterThan(version);
        // Not into it from the west, nor diagonally past its corner from the south-west
        expect(grid.steps.can(x - 1, y, 1)).toBe(false);
        expect(grid.steps.can(x - 1, y - 1, 4)).toBe(false);
        grid.restoreTile(x, y);
        expect(grid.steps.can(x - 1, y, 1)).toBe(true);
        expect(grid.steps.can(x - 1, y - 1, 4)).toBe(true);
    });
});

describe("in a run", () => {
    const MAP_ID = "floor_test";
    let floorDef: FloorDef;

    function createSim(def: FloorDef): Sim {
        floorDef = def;
        const map: MapDef = {
            ...getMap("lumbridge"),
            id: MAP_ID,
            waves: [],
            events: [],
            floor: def,
        };
        MAP_BY_ID.set(MAP_ID, map);
        const sim = new Sim({
            grid: field(),
            mapId: MAP_ID,
            characterId: "wizard",
            metaStats: emptyStats(),
            seed: 1,
            spawnX: RECT.x0 + 11.5,
            spawnY: RECT.y0 + 12.5,
        });
        return sim;
    }

    function run(sim: Sim, seconds: number, moveX = 0, moveY = 0): void {
        for (let i = 0; i < Math.round(seconds * T) && !sim.runOver; i++) {
            if (sim.state === "levelUp") {
                sim.choose(0);
                continue;
            }
            sim.step(moveX, moveY);
        }
    }

    afterEach(() => {
        MAP_BY_ID.delete(MAP_ID);
    });

    test("a slab that comes up under the player hurts them once, a fifth of their hitpoints", () => {
        const sim = createSim(floorWith({ kind: "side", side: "east", rowSeconds: 0.05 }));
        sim.player.x = RECT.x0 + 15.5;
        const hits: number[] = [];
        for (let i = 0; i < 4 * T; i++) {
            sim.events.length = 0;
            sim.step(0, 0);
            for (const event of sim.events) {
                if (event.type === "playerHit" && event.enemyId === FLOOR_SOURCE) {
                    hits.push(event.amount);
                }
            }
        }
        expect(hits).toEqual([Math.round(sim.player.maxHp * floorDef.slam.damage)]);
    });

    test("standing on the other side, nothing", () => {
        const sim = createSim(floorWith({ kind: "side", side: "east", rowSeconds: 0.05 }));
        sim.player.x = RECT.x0 + 5.5;
        run(sim, 4);
        expect(sim.player.hp).toBe(sim.player.maxHp);
    });

    test("a tile that falls from under the player puts them on the nearest that stays, hurt", () => {
        const sim = createSim(floorWith({ kind: "dropRows", rows: 2, rowSeconds: 0 }));
        sim.player.x = RECT.x0 + 6.5;
        sim.player.y = RECT.y0 + 0.5;
        run(sim, 1 + floorDef.drop.warn + floorDef.drop.shove + 0.1);
        expect(sim.player.hp).toBe(sim.player.maxHp - Math.round(sim.player.maxHp * 0.15));
        expect(Math.floor(sim.player.y)).toBe(RECT.y0 + 2);
        expect(Math.floor(sim.player.x)).toBe(RECT.x0 + 6);
        // And can't walk back onto it
        run(sim, 1, 0, -1);
        expect(sim.player.y).toBeGreaterThanOrEqual(RECT.y0 + 2);
    });

    test("enemies find their way round a hole", () => {
        const sim = createSim(floorWith({ kind: "holes", count: 1 }));
        run(sim, 1 + floorDef.drop.warn + 0.1);
        const i = sim.floor!.dropAt.findIndex((at) => at !== -1);
        const x = sim.floor!.x0 + (i % SIZE_X);
        const y = sim.floor!.y0 + Math.floor(i / SIZE_X);
        expect(sim.grid.isSolid(x, y)).toBe(true);
        // Worked out again for the grid as it is now, and no step from beside it goes into it
        expect(sim.flowField.gridVersion).toBe(sim.grid.version);
        const step = { x: 0, y: 0 };
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if ((dx || dy) && sim.flowField.getStep(sim.grid, x + dx, y + dy, step)) {
                    expect([x + dx + step.x, y + dy + step.y]).not.toEqual([x, y]);
                }
            }
        }
    });
});
