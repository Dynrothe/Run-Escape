import { getEnemy } from "../content/enemies";
import { getMap } from "../content/maps";
import { TROPHY_BY_ID } from "../content/trophies";
import { emptyStats } from "../content/types";
import {
    AWAKENED_VARDORVIS_ID,
    VARDORVIS_CAPTOR_ID,
    VARDORVIS_CHOP,
    VARDORVIS_ROOTS,
} from "../content/vardorvis";
import { Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import { syncHash } from "./lockstep";
import { CELL_ROOTED, RootRule } from "./rules/RootRule";
import { makeGrid } from "./world/testGrid";

// Awakened Vardorvis (content/vardorvis.ts) and Butch, the first fighting pet (PetDef.power). The
// map's own grid needs the cache, so the fight plays on an open field round his clearing, with a
// wood at its edge; the rule and the fight read only the grid they're given.

const MAP = getMap("awakened_vardorvis");
const SIZE = 80;
const BASE_X = Math.floor(MAP.spawn.x) - SIZE / 2;
const BASE_Y = Math.floor(MAP.spawn.y) - SIZE / 2;

function field(): string[] {
    const rows: string[] = [];
    for (let row = 0; row < SIZE; row++) {
        const y = SIZE - 1 - row;
        let line = "";
        for (let x = 0; x < SIZE; x++) {
            line += x < 3 || y < 3 || x >= SIZE - 3 || y >= SIZE - 3 ? "^" : ".";
        }
        rows.push(line);
    }
    return rows;
}

function createSim(options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(field(), BASE_X, BASE_Y),
        mapId: MAP.id,
        characterId: "forester",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: MAP.spawn.x,
        spawnY: MAP.spawn.y,
        ...options,
    });
}

function steps(sim: Sim, seconds: number): void {
    for (let i = 0; i < seconds * TICKS_PER_SECOND && sim.state === "playing"; i++) {
        sim.player.hp = sim.player.maxHp;
        sim.step(0, 0);
    }
}

function rootAt(rule: RootRule, x: number, y: number, tick: number): void {
    const i = rule.cellAt(x, y);
    if (rule.state[i] !== CELL_ROOTED) {
        rule.state[i] = CELL_ROOTED;
        rule.changedAt[i] = tick;
        rule.rootedCount++;
    }
}

describe("Awakened Vardorvis", () => {
    test("is the Forester's fight, opened by the Stranglewood, with Butch for its win", () => {
        expect(MAP.fight).toMatchObject({ requires: "stranglewood", character: "forester" });
        expect(MAP.fight?.ability).toBe(VARDORVIS_CHOP);
        expect(TROPHY_BY_ID.get("butch")?.from).toMatchObject({
            enemyId: AWAKENED_VARDORVIS_ID,
            chance: 1,
        });
    });

    test("his roots creep in from his clearing's edge and stay inside it", () => {
        const sim = createSim();
        expect(sim.rule?.def).toBe(VARDORVIS_ROOTS);
        steps(sim, 50);
        const rule = sim.rule as RootRule;
        const ring = VARDORVIS_ROOTS.ring!;
        let inside = 0;
        for (let i = 0; i < rule.state.length; i++) {
            if (rule.state[i] === 0) {
                continue;
            }
            const { x, y } = rule.cellMiddle(i);
            expect(Math.hypot(x - ring.x, y - ring.y)).toBeLessThan(ring.radius);
            inside++;
        }
        expect(inside).toBeGreaterThan(5);
    });

    test("Chop clears the roots round you with him out of reach, and hits a captor in reach", () => {
        const sim = createSim();
        // Past his rising
        steps(sim, 12);
        const rule = sim.rule as RootRule;
        const { x, y } = sim.player;
        for (let dx = -2; dx <= 2; dx += 2) {
            for (let dy = -2; dy <= 2; dy += 2) {
                rootAt(rule, x + dx, y + dy, sim.tick);
            }
        }
        const captor = sim.spawnEnemy(getEnemy(VARDORVIS_CAPTOR_ID), "normal", { x: x + 2, y })!;
        const before = captor.hp;
        // He's off across the clearing
        const boss = sim.enemies.find((e) => e.def.id === AWAKENED_VARDORVIS_ID)!;
        boss.x = x - 7;
        boss.y = y + 7;
        sim.player.hp = sim.player.maxHp;
        expect(sim.useAbility()).toBe(true);
        expect(rule.isRooted(x, y)).toBe(false);
        // Every cell whose middle's in Chop's reach
        for (let i = 0; i < rule.state.length; i++) {
            const middle = rule.cellMiddle(i);
            if (Math.hypot(middle.x - x, middle.y - y) <= VARDORVIS_CHOP.cut!) {
                expect(rule.state[i]).toBe(0);
            }
        }
        expect(captor.hp).toBeLessThan(before);
        expect(sim.damageBySource["ability:chop"]).toBeGreaterThan(0);
    });

    test("a captor heals him while it stands", () => {
        const sim = createSim();
        // Past his rising
        steps(sim, 12);
        const boss = sim.enemies.find((e) => e.def.id === AWAKENED_VARDORVIS_ID)!;
        boss.hp = boss.maxHp * 0.8;
        const hurt = boss.hp;
        sim.spawnEnemy(getEnemy(VARDORVIS_CAPTOR_ID), "normal", {
            x: boss.x + 4,
            y: boss.y + 4,
        });
        for (const hero of sim.heroes) {
            hero.weapons = [];
        }
        steps(sim, 4);
        expect(boss.hp).toBeGreaterThan(hurt);
    });
});

describe("Butch", () => {
    function stranglewood(pet?: string): Sim {
        return new Sim({
            grid: makeGrid(field(), BASE_X, BASE_Y),
            mapId: "stranglewood",
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 3,
            spawnX: MAP.spawn.x,
            spawnY: MAP.spawn.y,
            pet,
        });
    }

    test("leaps on what's near you every 6 s and cleaves round where he lands", () => {
        const sim = stranglewood("butch");
        for (const hero of sim.heroes) {
            hero.weapons = [];
        }
        const { x, y } = sim.player;
        const near = sim.spawnEnemy(getEnemy("strangled"), "normal", { x: x + 3, y })!;
        const beside = sim.spawnEnemy(getEnemy("strangled"), "normal", { x: x + 3, y: y + 1 })!;
        near.hp = beside.hp = 1e6;
        near.maxHp = beside.maxHp = 1e6;
        const leaps: number[] = [];
        for (let i = 0; i < 13 * TICKS_PER_SECOND; i++) {
            sim.player.hp = sim.player.maxHp;
            near.x = beside.x = x + 3;
            near.y = y;
            beside.y = y + 1;
            sim.step(0, 0);
            if (sim.takeEvents().some((e) => e.type === "petLeap")) {
                leaps.push(sim.tick);
            }
        }
        expect(leaps.length).toBe(2);
        expect(leaps[1] - leaps[0]).toBe(6 * TICKS_PER_SECOND);
        expect(near.hp).toBeLessThan(1e6);
        expect(beside.hp).toBeLessThan(1e6);
        expect(sim.damageBySource["pet:butch"]).toBeGreaterThan(0);
    });

    test("does nothing in a boss fight, and a looks-only pet changes nothing", () => {
        const fight = createSim({ pet: "butch" });
        steps(fight, 20);
        expect(fight.damageBySource["pet:butch"]).toBeUndefined();
        const plain = stranglewood();
        const looks = stranglewood("little_nightmare");
        for (let i = 0; i < 30 * TICKS_PER_SECOND; i++) {
            plain.step(1, 0);
            looks.step(1, 0);
        }
        expect(syncHash(looks)).toBe(syncHash(plain));
    });
});
