import { getEnemy } from "../content/enemies";
import { MAP_BY_ID, getMap } from "../content/maps";
import { FloorDef, MapDef, emptyStats } from "../content/types";
import { createWardensFloor } from "../content/wardensFloor";
import { FLOOR_DEMOS, FLOOR_START } from "../scaperune/maps/wardensFloor";
import { ArenaFloor } from "./ArenaFloor";
import { Rng } from "./Rng";
import { FLOOR_SOURCE, Sim, TICKS_PER_SECOND } from "./Sim";
import { EFFECT_BURN, FLOOR_EFFECTS } from "./floorLayout";
import { PHONE_TRIANGLES, lintFloor } from "./floorLint";
import { makeGrid } from "./world/testGrid";

// What a floor's tiles can do besides rising and falling (FloorDef): effects on whoever's on them,
// tiles that rebuild themselves, pressure plates, actions from outside (a boss's), phases, pillars
// that stop shots and sight, and raised tiles with ledges and ramps

const BASE = 1000;
const SIZE_X = 23;
const SIZE_Y = 25;
const RECT = { x0: BASE + 1, y0: BASE + 1, x1: BASE + SIZE_X, y1: BASE + SIZE_Y };
const T = TICKS_PER_SECOND;
const MAP_ID = "floor_features_test";

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

// The Wardens' numbers with nothing in its script
function quiet(more: Partial<FloorDef> = {}): FloorDef {
    return { ...createWardensFloor(RECT), script: [], loopSeconds: 1000, ...more };
}

const at = (x: number, y: number) => ({ kind: "rect", x0: x, y0: y, x1: x, y1: y }) as const;
const box = (x0: number, y0: number, x1: number, y1: number) =>
    ({ kind: "rect", x0, y0, x1, y1 }) as const;
const tile = (x: number, y: number) => x + y * SIZE_X;

function createSim(def: FloorDef, x = 11.5, y = 12.5): Sim {
    const map: MapDef = { ...getMap("lumbridge"), id: MAP_ID, waves: [], events: [], floor: def };
    MAP_BY_ID.set(MAP_ID, map);
    return new Sim({
        grid: field(),
        mapId: MAP_ID,
        characterId: "wizard",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: RECT.x0 + x,
        spawnY: RECT.y0 + y,
    });
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

describe("effect tiles", () => {
    test("a rule or a skin gives tiles their effect, and a rule's none takes a skin's away", () => {
        const floor = new ArenaFloor(
            quiet({
                skins: [{ spotAnim: 2220 }, { spotAnim: 2220, effect: "burn" }],
                tiles: [
                    { where: box(0, 0, 4, 4), skin: 1 },
                    { where: at(2, 2), effect: "none" },
                    { where: at(10, 10), effect: "ice" },
                ],
            }),
            field(),
            new Rng(1),
            T,
        );
        expect(floor.layout.effect[tile(0, 0)]).toBe(EFFECT_BURN);
        expect(floor.layout.effect[tile(2, 2)]).toBe(0);
        expect(FLOOR_EFFECTS[floor.layout.effect[tile(10, 10)] - 1]).toBe("ice");
        expect(floor.hasEffects).toBe(true);
    });

    test("lava burns a share of the player's hitpoints every half second, and lets them be hit", () => {
        const sim = createSim(quiet({ tiles: [{ where: box(9, 10, 13, 14), effect: "burn" }] }));
        const hits: number[] = [];
        for (let i = 0; i < 2 * T; i++) {
            sim.events.length = 0;
            sim.step(0, 0);
            for (const event of sim.events) {
                if (event.type === "playerHit" && event.enemyId === FLOOR_SOURCE) {
                    hits.push(event.amount);
                }
            }
        }
        expect(hits).toEqual(Array(4).fill(Math.round(sim.player.maxHp * 0.04)));
        // A burn's no shield from the next hit
        expect(sim.player.invulnerable).toBe(0);
    });

    test("a heal glyph heals the player on it", () => {
        const sim = createSim(quiet({ tiles: [{ where: at(11, 12), effect: "heal" }] }));
        sim.player.hp = 10;
        run(sim, 1.01);
        expect(sim.player.hp).toBe(10 + 3 * Math.max(1, Math.round(sim.player.maxHp * 0.03)));
    });

    test("speed plates and mud change how far a step goes", () => {
        const distance = (effect?: "haste" | "slow") => {
            const sim = createSim(
                quiet(effect ? { tiles: [{ where: box(0, 0, 22, 24), effect }] } : {}),
                3.5,
                12.5,
            );
            run(sim, 1, 1, 0);
            return sim.player.x - (RECT.x0 + 3.5);
        };
        const plain = distance();
        expect(distance("haste")).toBeCloseTo(plain * 1.4, 5);
        expect(distance("slow")).toBeCloseTo(plain * 0.55, 5);
    });

    test("on ice you keep sliding after you let go, and turn only slowly", () => {
        const def = quiet({ tiles: [{ where: box(0, 0, 22, 24), effect: "ice" }] });
        const sim = createSim(def, 3.5, 12.5);
        run(sim, 1, 1, 0);
        const moving = sim.player.x;
        run(sim, 0.2);
        // Still going, with nothing pressed
        expect(sim.player.x).toBeGreaterThan(moving + 0.1);
        // And it's the same every time
        const again = createSim(def, 3.5, 12.5);
        run(again, 1, 1, 0);
        run(again, 0.2);
        expect(again.player.x).toBe(sim.player.x);
    });

    test("enemies burn on lava", () => {
        const sim = createSim(
            quiet({
                tiles: [
                    { where: box(15, 10, 22, 14), effect: "burn" },
                    { where: box(0, 0, 8, 24), effect: "slow" },
                ],
            }),
        );
        const burnt = sim.spawnEnemy(getEnemy("goblin"), "normal", {
            x: RECT.x0 + 20.5,
            y: RECT.y0 + 12.5,
        })!;
        burnt.speed = 0;
        const hp = burnt.hp;
        run(sim, 1);
        expect(burnt.hp).toBeLessThan(hp);
    });
});

describe("a floor that rebuilds itself", () => {
    test("a hole comes back by itself after its seconds, warned, and the grid with it", () => {
        const def = quiet({
            rebuild: { after: 3, warn: 1, rise: 0.5 },
            script: [{ at: 1, pattern: { kind: "holes", count: 1 } }],
        });
        const grid = field();
        const floor = new ArenaFloor(def, grid, new Rng(3), T);
        const player = () => ({ x: RECT.x0 + 3.5, y: RECT.y0 + 3.5 });
        const back: number[] = [];
        for (let tick = 0; tick <= (1 + def.drop.warn + 3 + 0.6) * T; tick++) {
            back.push(...floor.step(tick, player).back);
            if (tick === Math.round((1 + def.drop.warn + 1) * T)) {
                const i = floor.dropAt.findIndex((v) => v !== -1);
                expect(floor.rebuilt[i]).toBe(1);
                expect(
                    grid.isDropped(floor.x0 + (i % SIZE_X), floor.y0 + Math.floor(i / SIZE_X)),
                ).toBe(true);
                expect(floor.restoreAt[i] - floor.dropAt[i]).toBe(3 * T);
            }
        }
        expect(back.length).toBe(2);
        expect(grid.isDropped(back[0], back[1])).toBe(false);
        expect(floor.dropAt.every((v) => v === -1)).toBe(true);
    });

    test("a rule can keep its tiles from coming back, or bring them back on its own time", () => {
        const def = quiet({
            rebuild: { after: 2 },
            tiles: [
                { where: box(0, 0, 22, 2), rebuild: 0 },
                { where: box(0, 3, 22, 5), rebuild: 5 },
            ],
            script: [{ at: 1, pattern: { kind: "dropRows", rows: 5, rowSeconds: 0 } }],
        });
        const floor = new ArenaFloor(def, field(), new Rng(3), T);
        for (let tick = 0; tick <= (1 + def.drop.warn + 3) * T; tick++) {
            floor.step(tick, () => ({ x: RECT.x0 + 3.5, y: RECT.y0 + 12.5 }));
        }
        expect(floor.restoreAt[tile(4, 1)]).toBe(-1);
        expect(floor.restoreAt[tile(4, 4)] - floor.dropAt[tile(4, 4)]).toBe(5 * T);
    });

    test("pathing goes through a tile again once it's back", () => {
        const sim = createSim(
            quiet({
                rebuild: { after: 1 },
                script: [{ at: 1, pattern: { kind: "holes", count: 1 } }],
            }),
        );
        run(sim, 1 + 2.4 + 0.1);
        const i = sim.floor!.dropAt.findIndex((v) => v !== -1);
        const x = sim.floor!.x0 + (i % SIZE_X);
        const y = sim.floor!.y0 + Math.floor(i / SIZE_X);
        expect(sim.grid.isSolid(x, y)).toBe(true);
        run(sim, 2);
        expect(sim.grid.isSolid(x, y)).toBe(false);
        expect(sim.flowField.gridVersion).toBe(sim.grid.version);
    });
});

describe("pressure plates", () => {
    const plate = (more: Partial<FloorDef> = {}) =>
        quiet({
            tiles: [
                { where: at(11, 12), trigger: "plate" },
                { where: box(3, 3, 5, 5), group: "pit" },
            ],
            triggers: { plate: { actions: [{ kind: "drop", group: "pit" }], cooldown: 2 } },
            ...more,
        });

    test("stepping on one drops its group, once until it's rested", () => {
        const floor = new ArenaFloor(plate(), field(), new Rng(1), T);
        const on = [RECT.x0 + 11, RECT.y0 + 12];
        const origin = () => ({ x: 0, y: 0 });
        floor.press(on, 0, origin);
        expect(floor.dropWarnAt[tile(4, 4)]).toBe(0);
        // Standing on it does nothing more; off and on again before it's rested, nothing
        floor.press(on, 1, origin);
        floor.press([], 2, origin);
        floor.press(on, 3, origin);
        expect(floor.readyAt[0]).toBe(2 * T);
    });

    test("one that starts disarmed does nothing until armed, and can start a pattern by name later", () => {
        const def = plate({
            patterns: { slam: { kind: "side", side: "east", rowSeconds: 0.1 } },
            triggers: {
                plate: {
                    actions: [{ kind: "pattern", pattern: "slam", delay: 0.5 }],
                    armed: false,
                },
                key: { actions: [{ kind: "arm", trigger: "plate" }], message: "Click." },
            },
            tiles: [
                { where: at(11, 12), trigger: "plate" },
                { where: at(2, 2), trigger: "key" },
            ],
        });
        const floor = new ArenaFloor(def, field(), new Rng(1), T);
        const origin = () => ({ x: 0, y: 0 });
        const plateTile = [RECT.x0 + 11, RECT.y0 + 12];
        floor.press(plateTile, 0, origin);
        floor.press([], 1, origin);
        expect(floor.riseAt.every((v) => v === -1)).toBe(true);
        expect(floor.press([RECT.x0 + 2, RECT.y0 + 2], 2, origin)).toEqual(["Click."]);
        floor.press(plateTile, 3, origin);
        for (let tick = 3; tick <= 3 + T; tick++) {
            floor.step(tick, origin);
        }
        // Queued half a second, then the east half's coming
        expect(floor.warnAt[tile(20, 24)]).toBe(3 + T / 2);
    });

    test("in a run, walking onto one sets it off", () => {
        const sim = createSim(plate(), 9.5, 12.5);
        run(sim, 1, 1, 0);
        expect(sim.floor!.dropWarnAt[tile(4, 4)]).not.toBe(-1);
    });
});

describe("a floor bosses and phases act on", () => {
    test("floorAct drops the tile under whoever it's aimed at", () => {
        const sim = createSim(quiet());
        sim.floorAct({ kind: "dropUnder" });
        const i = tile(11, 12);
        expect(sim.floor!.dropWarnAt[i]).toBe(sim.tick);
        run(sim, 3);
        expect(sim.grid.isDropped(RECT.x0 + 11, RECT.y0 + 12)).toBe(true);
        // and the player's been moved off it
        expect(
            Math.floor(sim.player.x) !== RECT.x0 + 11 || Math.floor(sim.player.y) !== RECT.y0 + 12,
        ).toBe(true);
    });

    test("a boss's attack can act on the floor as it starts", () => {
        const sim = createSim(quiet());
        const boss = sim.spawnEnemy(getEnemy("dharok"), "boss", {
            x: RECT.x0 + 3.5,
            y: RECT.y0 + 20.5,
        })!;
        const attack = { ...boss.def.boss!.attacks[0], floor: { kind: "dropUnder" } as const };
        (sim as unknown as { startBossAttack(e: unknown, a: unknown): void }).startBossAttack(
            boss,
            attack,
        );
        expect(sim.floor!.dropWarnAt[tile(11, 12)]).toBe(sim.tick);
    });

    test("a phase swaps the script and the skins, effects going with the skins", () => {
        const def = quiet({
            skins: [{ spotAnim: 2220 }, { spotAnim: 2220, effect: "burn" }],
            phases: {
                angry: {
                    skins: [[0, 1]],
                    script: [{ at: 0.5, pattern: { kind: "holes", count: 2 } }],
                    loopSeconds: 10,
                    message: "The floor melts!",
                },
            },
            script: [{ at: 1, action: { kind: "phase", phase: "angry" } }],
        });
        const floor = new ArenaFloor(def, field(), new Rng(1), T);
        const messages: string[] = [];
        for (let tick = 0; tick <= 2 * T; tick++) {
            messages.push(
                ...floor.step(tick, () => ({ x: RECT.x0 + 3.5, y: RECT.y0 + 3.5 })).messages,
            );
        }
        expect(messages).toEqual(["The floor melts!"]);
        expect(floor.phase).toBe("angry");
        expect(floor.layout.skin[tile(5, 5)]).toBe(1);
        expect(floor.layout.effect[tile(5, 5)]).toBe(EFFECT_BURN);
        expect(floor.dropAt.filter((v) => v !== -1).length).toBe(2);
    });
});

describe("pillars", () => {
    const pillars = () =>
        quiet({
            skins: [{ spotAnim: 2220 }, { loc: 7016, under: 0 }],
            tiles: [{ where: box(11, 15, 11, 16), skin: 1, type: "pillar" }],
        });

    test("block sight through them, not past them", () => {
        const floor = new ArenaFloor(pillars(), field(), new Rng(1), T);
        const x = RECT.x0 + 11.5;
        expect(floor.blocksSight(x, RECT.y0 + 12.5, x, RECT.y0 + 20.5)).toBe(true);
        expect(floor.blocksSight(x + 2, RECT.y0 + 12.5, x + 2, RECT.y0 + 20.5)).toBe(false);
        expect(floor.blocksSight(x - 3, RECT.y0 + 12.5, x + 3, RECT.y0 + 19.5)).toBe(true);
        expect(floor.blocksSight(x, RECT.y0 + 12.5, x, RECT.y0 + 14.5)).toBe(false);
    });

    test("the player's shots don't go for an enemy behind one, and stop at it", () => {
        const hurt = (def: FloorDef) => {
            const sim = createSim(def);
            const goblin = sim.spawnEnemy(getEnemy("goblin"), "normal", {
                x: RECT.x0 + 11.5,
                y: RECT.y0 + 19.5,
            })!;
            goblin.speed = 0;
            goblin.hp = goblin.maxHp = 10000;
            run(sim, 4);
            return goblin.maxHp - goblin.hp;
        };
        expect(hurt(quiet())).toBeGreaterThan(0);
        expect(hurt(pillars())).toBe(0);
    });
});

describe("raised tiles and ramps", () => {
    const platform = () =>
        quiet({
            tiles: [
                { where: box(10, 14, 14, 18), height: 0.5 },
                { where: at(12, 13), ramp: "north" },
            ],
        });

    test("a platform has ledges round it but where its ramp comes up", () => {
        const floor = new ArenaFloor(platform(), field(), new Rng(1), T);
        const grid = floor["grid"];
        const steps = grid.steps;
        const x = RECT.x0;
        const y = RECT.y0;
        // Up the side: no
        expect(steps.can(x + 9, y + 15, 1)).toBe(false);
        // Up the ramp, and onto it from the floor: yes; off its sides: no
        expect(steps.can(x + 12, y + 13, 0)).toBe(true);
        expect(steps.can(x + 12, y + 12, 0)).toBe(true);
        expect(steps.can(x + 12, y + 13, 1)).toBe(false);
        // Halfway up the ramp is halfway up
        expect(floor.liftAt(x + 12.5, y + 13.5)).toBeCloseTo(0.25, 5);
        expect(floor.liftAt(x + 12.5, y + 15.5)).toBe(0.5);
    });

    test("in a run, walking into its side stops you, and up its ramp you're on it", () => {
        const sim = createSim(platform(), 12.5, 10.5);
        run(sim, 2, 0, 1);
        expect(sim.floor!.liftAt(sim.player.x, sim.player.y)).toBe(0.5);
        const side = createSim(platform(), 7.5, 16.5);
        run(side, 2, 1, 0);
        expect(side.player.x).toBeLessThan(RECT.x0 + 10);
    });

    test("a run on another map starts with no ledges left over", () => {
        const grid = field();
        new ArenaFloor(platform(), grid, new Rng(1), T);
        const before = grid.version;
        new ArenaFloor(quiet(), grid, new Rng(1), T);
        expect(grid.version).toBeGreaterThan(before);
        expect(grid.steps.can(RECT.x0 + 9, RECT.y0 + 15, 1)).toBe(true);
    });
});

describe("materials", () => {
    test("each skin's material sounds as it rises and falls, and the floor's for the rest", () => {
        const sim = createSim(
            quiet({
                skins: [
                    { spotAnim: 2220 },
                    { spotAnim: 2220, material: { rise: { sound: 170 }, fall: { sound: 168 } } },
                ],
                tiles: [{ where: box(12, 0, 22, 24), skin: 1 }],
                script: [{ at: 1, pattern: { kind: "side", side: "both", rowSeconds: 0 } }],
            }),
            1.5,
            1.5,
        );
        const sounds = new Set<number>();
        for (let i = 0; i < 2.5 * T; i++) {
            sim.events.length = 0;
            sim.step(0, 0);
            for (const event of sim.events) {
                if (event.type === "impact") {
                    sounds.add(event.sound!);
                }
            }
        }
        expect([...sounds].sort()).toEqual([170, sim.floor!.def.slam.sound].sort());
    });
});

describe("the preview's checks", () => {
    test("every demo is in one piece, reachable from its start and within a phone's budget", () => {
        for (const recipe of FLOOR_DEMOS) {
            const lint = lintFloor(recipe.mapDef!.floor!, FLOOR_START);
            expect(lint.warnings).toEqual([]);
            expect(lint.triangles.busy).toBeLessThanOrEqual(PHONE_TRIANGLES);
        }
    });

    test("it finds islands, tiles behind ledges, see-through skins and level ramps", () => {
        const lint = lintFloor(
            quiet({
                // A lone tile between two empty rows, cut off from the rest
                ascii: Array.from({ length: 25 }, (_, y) =>
                    y === 2 || y === 4
                        ? ".".repeat(23)
                        : y === 3
                          ? "#" + ".".repeat(22)
                          : "#".repeat(23),
                ),
                skins: [{ spotAnim: 2220 }, { loc: 45356 }],
                tiles: [
                    { where: box(2, 15, 6, 19), height: 1 },
                    { where: at(15, 15), ramp: "east" },
                ],
            }),
            FLOOR_START,
        );
        expect(lint.warnings.some((w) => w.includes("pieces"))).toBe(true);
        expect(lint.warnings.some((w) => w.includes("can't be reached"))).toBe(true);
        expect(lint.warnings.some((w) => w.includes("see-through"))).toBe(true);
        expect(lint.warnings.some((w) => w.includes("is level"))).toBe(true);
    });
});
