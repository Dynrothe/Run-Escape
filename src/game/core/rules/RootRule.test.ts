import { STRANGLEWOOD_ROOTS } from "../../content/stranglewood";
import type { RootsRuleDef } from "../../content/types";
import { makeGrid } from "../world/testGrid";
import { CELL, CELL_EMPTY, CELL_ROOTED, CELL_SPROUT, RootRule } from "./RootRule";
import type { RuleHost } from "./RunRule";

const TPS = 50;
const BASE_X = 1000;
const BASE_Y = 1000;

// An open glade 64 tiles a side with the wood round it, three tiles deep, and a thicket in it
function wood(): string[] {
    const size = 64;
    const rows: string[] = [];
    for (let row = 0; row < size; row++) {
        const y = size - 1 - row;
        let line = "";
        for (let x = 0; x < size; x++) {
            const edge = x < 3 || y < 3 || x >= size - 3 || y >= size - 3;
            const thicket = x >= 40 && x < 48 && y >= 40 && y < 48;
            line += edge || thicket ? "^" : ".";
        }
        rows.push(line);
    }
    return rows;
}

// The glade's middle, kept clear as the Stranglewood's clearing is
const SAFE = { x: BASE_X + 20, y: BASE_Y + 20, radius: 6 };

function def(over: Partial<RootsRuleDef> = {}): RootsRuleDef {
    return { ...STRANGLEWOOD_ROOTS, safe: SAFE, ...over };
}

// A run for the rule: the clock, heroes where they're put, and the enemies it brings in
class Host implements RuleHost {
    tick = 0;
    heroes: number[] = [BASE_X + 20.5, BASE_Y + 20.5];
    spawned: { enemyId: string; x: number; y: number; uid: number }[] = [];
    dead = new Set<number>();
    get mapSeconds() {
        return this.tick / TPS;
    }
    heroPositions(): number[] {
        return this.heroes;
    }
    spawnRuleEnemy(enemyId: string, x: number, y: number): number {
        const uid = 100 + this.spawned.length;
        this.spawned.push({ enemyId, x, y, uid });
        return uid;
    }
    isEnemyAlive(uid: number): boolean {
        return this.spawned.some((e) => e.uid === uid) && !this.dead.has(uid);
    }
    upHeroes(): number[] {
        return [0, ...this.heroes];
    }
    finalBossUp = false;
    turnWorld(): void {}
}

function run(rule: RootRule, host: Host, seconds: number): void {
    const end = host.tick + seconds * TPS;
    while (host.tick < end) {
        host.tick++;
        rule.step(host);
    }
}

function create(seed = 1, over: Partial<RootsRuleDef> = {}): { rule: RootRule; host: Host } {
    return {
        rule: new RootRule(def(over), makeGrid(wood(), BASE_X, BASE_Y), seed, TPS),
        host: new Host(),
    };
}

function rooted(rule: RootRule): number[] {
    const cells: number[] = [];
    rule.state.forEach((state, i) => state === CELL_ROOTED && cells.push(i));
    return cells;
}

describe("roots", () => {
    test("grow the same from the same seed, and differently from another", () => {
        const a = create(7);
        const b = create(7);
        const c = create(8);
        run(a.rule, a.host, 240);
        run(b.rule, b.host, 240);
        run(c.rule, c.host, 240);
        expect(rooted(a.rule).length).toBeGreaterThan(0);
        expect([...a.rule.state]).toEqual([...b.rule.state]);
        expect(a.rule.hash()).toBe(b.rule.hash());
        expect([...a.rule.state]).not.toEqual([...c.rule.state]);
    });

    test("wait for their start, then creep in from the wood", () => {
        const { rule, host } = create();
        run(rule, host, STRANGLEWOOD_ROOTS.start - 1);
        expect(rule.state.every((s) => s === CELL_EMPTY)).toBe(true);
        run(rule, host, 8);
        const grown = [...rule.state.keys()].filter((i) => rule.state[i] !== CELL_EMPTY);
        expect(grown.length).toBeGreaterThan(0);
        // Every one of the first is beside the wood: the edge or the thicket
        for (const i of grown) {
            const { x, y } = rule.cellMiddle(i);
            const tx = x - BASE_X;
            const ty = y - BASE_Y;
            const byEdge =
                tx < 3 + CELL * 3 || ty < 3 + CELL * 3 || tx > 61 - CELL * 3 || ty > 61 - CELL * 3;
            const byThicket =
                tx > 40 - CELL * 3 &&
                tx < 48 + CELL * 3 &&
                ty > 40 - CELL * 3 &&
                ty < 48 + CELL * 3;
            expect(byEdge || byThicket).toBe(true);
        }
    });

    test("sprout first, harmless, and take root once the warning's up", () => {
        const { rule, host } = create();
        run(rule, host, STRANGLEWOOD_ROOTS.start + 0.1);
        const sprouts = [...rule.state.keys()].filter((i) => rule.state[i] === CELL_SPROUT);
        expect(sprouts.length).toBeGreaterThan(0);
        const first = sprouts[0];
        const { x, y } = rule.cellMiddle(first);
        expect(rule.isRooted(x, y)).toBe(false);
        expect(rule.playerPace(x, y)).toBe(1);
        expect(rule.hurtsAt(x, y)).toBe(false);
        run(rule, host, STRANGLEWOOD_ROOTS.sprout);
        expect(rule.state[first]).toBe(CELL_ROOTED);
        expect(rule.playerPace(x, y)).toBeCloseTo(1 - STRANGLEWOOD_ROOTS.slow);
        expect(rule.enemyPace(x, y)).toBeCloseTo(1 + STRANGLEWOOD_ROOTS.haste);
        expect(rule.hurtsAt(x, y)).toBe(true);
    });

    test("never take the safe circle, however long they're left", () => {
        const { rule, host } = create(3, { every: [0.2, 0.1], fronts: [12, 12] });
        run(rule, host, 900);
        expect(rule.cover).toBeGreaterThan(0.6);
        for (const i of rooted(rule)) {
            const { x, y } = rule.cellMiddle(i);
            expect(Math.hypot(x - SAFE.x, y - SAFE.y)).toBeGreaterThanOrEqual(SAFE.radius);
        }
    });

    test("cover more and more of the ground left alone", () => {
        const { rule, host } = create(5);
        // A glade this small is taken in a few minutes: the Stranglewood's ground is about
        // three times as much, and the sims say how it goes there
        const covers: number[] = [];
        for (let minute = 1; minute <= 6; minute++) {
            run(rule, host, 60);
            covers.push(rule.cover);
        }
        for (let i = 1; i < covers.length; i++) {
            expect(covers[i]).toBeGreaterThanOrEqual(covers[i - 1]);
        }
        expect(covers[5]).toBeGreaterThan(covers[2]);
        expect(covers[2]).toBeGreaterThan(0);
    });

    test("are cut back by a hit on an enemy standing on them, and grow back later", () => {
        const { rule, host } = create();
        run(rule, host, 120);
        const cell = rooted(rule)[0];
        const { x, y } = rule.cellMiddle(cell);
        rule.onHit(x, y);
        expect(rule.state[cell]).toBe(CELL_EMPTY);
        expect(rule.isRooted(x, y)).toBe(false);
        // Not before its regrowth time, even beside roots
        run(rule, host, STRANGLEWOOD_ROOTS.cut.regrow - 1);
        expect(rule.state[cell]).toBe(CELL_EMPTY);
    });

    test("a swing cuts the cells in its arc, not those behind it", () => {
        const { rule, host } = create(2, { every: [0.2, 0.1], fronts: [12, 12] });
        run(rule, host, 300);
        // A spot with roots all round it
        const cell = rooted(rule).find((i) => {
            const { x, y } = rule.cellMiddle(i);
            return [-4, 4].every((d) => rule.isRooted(x + d, y));
        })!;
        const { x, y } = rule.cellMiddle(cell);
        rule.onSwing(x, y, 1, 0, 3, 0.6, 0);
        expect(rule.isRooted(x + 2, y)).toBe(false);
        expect(rule.isRooted(x - 4, y)).toBe(true);
    });

    test("a killed heart clears a patch that stays clear for its calm", () => {
        const { rule, host } = create(4, { every: [0.2, 0.1], fronts: [12, 12] });
        run(rule, host, 200);
        const at = rule.cellMiddle(
            rooted(rule).find((i) => {
                const { x, y } = rule.cellMiddle(i);
                return Math.hypot(x - SAFE.x, y - SAFE.y) > 14;
            })!,
        );
        rule.plantHeart(host, at.x, at.y);
        const heart = host.spawned[host.spawned.length - 1];
        expect(heart.enemyId).toBe(STRANGLEWOOD_ROOTS.hearts.enemyId);
        expect(rule.hearts.length).toBeGreaterThan(0);
        run(rule, host, 5);
        host.dead.add(heart.uid);
        rule.onKill(heart.uid, at.x, at.y);
        const clear = STRANGLEWOOD_ROOTS.hearts.clear - CELL;
        const inPatch = (i: number) => {
            const { x, y } = rule.cellMiddle(i);
            return Math.hypot(x - at.x, y - at.y) <= clear;
        };
        expect(rooted(rule).filter(inPatch)).toEqual([]);
        run(rule, host, STRANGLEWOOD_ROOTS.hearts.calm - 2);
        const grown = [...rule.state.keys()].filter(
            (i) => inPatch(i) && rule.state[i] !== CELL_EMPTY,
        );
        expect(grown).toEqual([]);
    });

    test("hearts come up at a front once their time comes, no more than the most", () => {
        const { rule, host } = create(6, { every: [0.5, 0.3], fronts: [8, 8] });
        run(rule, host, STRANGLEWOOD_ROOTS.hearts.from - 1);
        expect(host.spawned).toEqual([]);
        run(rule, host, STRANGLEWOOD_ROOTS.hearts.every * 6);
        expect(host.spawned.length).toBe(STRANGLEWOOD_ROOTS.hearts.max);
        for (const heart of host.spawned) {
            expect(rule.isRooted(heart.x, heart.y)).toBe(true);
        }
    });

    test("something laying roots lays them where it goes, not in the safe circle", () => {
        const { rule, host } = create();
        rule.plant(BASE_X + 40.5, BASE_Y + 20.5, 1.5);
        rule.plant(SAFE.x, SAFE.y, 1.5);
        expect(rule.state[rule.cellAt(BASE_X + 40.5, BASE_Y + 20.5)]).toBe(CELL_SPROUT);
        expect(rule.state[rule.cellAt(SAFE.x, SAFE.y)]).toBe(CELL_EMPTY);
        run(rule, host, STRANGLEWOOD_ROOTS.sprout + 0.1);
        expect(rule.isRooted(BASE_X + 40.5, BASE_Y + 20.5)).toBe(true);
    });

    test("picks erupting spots only among its roots near the player", () => {
        const { rule, host } = create(9, { every: [0.2, 0.1], fronts: [12, 12] });
        run(rule, host, 200);
        const spots = rule.pickSpots(BASE_X + 12, BASE_Y + 12, 8, 6);
        expect(spots.length).toBeGreaterThan(0);
        for (const spot of spots) {
            expect(rule.isRooted(spot.x, spot.y)).toBe(true);
            expect(Math.hypot(spot.x - BASE_X - 12, spot.y - BASE_Y - 12)).toBeLessThanOrEqual(
                8 + CELL,
            );
        }
    });
});
