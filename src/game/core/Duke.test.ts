import { AWAKENED_DUKE_ID, DUKE_COLD, DUKE_KINDLE } from "../content/duke";
import { getEnemy } from "../content/enemies";
import { getMap } from "../content/maps";
import { PET_BY_ID } from "../content/pets";
import { TROPHY_BY_ID } from "../content/trophies";
import { emptyStats } from "../content/types";
import { Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import type { Enemy } from "./entities";
import { makeGrid } from "./world/testGrid";

// The Awakened Duke Sucellus (content/duke.ts) and Baron, the third fighting pet (PetDef.power
// gas). His room's grid needs the cache, so the fight plays on an open field round it; the rule
// and the fight read only the grid they're given (his statues are the map's features).

const MAP = getMap("awakened_duke");
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
        characterId: "snow_ranger",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: MAP.spawn.x,
        spawnY: MAP.spawn.y,
        ...options,
    });
}

function duke(sim: Sim): Enemy | undefined {
    return sim.enemies.find((e) => e.def.id === AWAKENED_DUKE_ID && !e.dead);
}

// Steps on, the hero kept whole and his attacks held back, so only what's tested happens
function steps(sim: Sim, seconds: number): void {
    for (let i = 0; i < seconds * TICKS_PER_SECOND && sim.state === "playing"; i++) {
        sim.player.hp = sim.player.maxHp;
        const boss = duke(sim);
        if (boss?.bossState) {
            boss.attackCooldown = Math.max(boss.attackCooldown, 10);
        }
        sim.step(0, 0);
    }
}

// Past his waking, with no weapons
function ready(): { sim: Sim; boss: Enemy } {
    const sim = createSim();
    steps(sim, 8);
    for (const hero of sim.heroes) {
        hero.weapons = [];
    }
    return { sim, boss: duke(sim)! };
}

function startAttack(sim: Sim, boss: Enemy, name: string): void {
    const attack = boss.def.boss!.attacks.find((a) => a.name === name)!;
    (sim as unknown as { startBossAttack(e: Enemy, a: unknown): void }).startBossAttack(
        boss,
        attack,
    );
}

function stepFor(sim: Sim, seconds: number): void {
    for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
        sim.step(0, 0);
    }
}

describe("The Awakened Duke Sucellus", () => {
    test("is opened by Ghorrock, as the Snow ranger with Kindle, and drops Baron", () => {
        expect(MAP.fight).toMatchObject({
            requires: "ghorrock",
            character: "snow_ranger",
            ability: DUKE_KINDLE,
        });
        expect(MAP.rule).toBe(DUKE_COLD);
        expect(getEnemy(AWAKENED_DUKE_ID).stationary).toBe(true);
        expect(TROPHY_BY_ID.get("baron")?.from).toMatchObject({
            enemyId: AWAKENED_DUKE_ID,
            mapId: "awakened_duke",
            chance: 1,
        });
        expect(PET_BY_ID.get("baron")?.power?.kind).toBe("gas");
    });

    test("the braziers stay lit as he wakes, and the cold still rises", () => {
        const { sim } = ready();
        const cold = sim.cold!;
        expect(cold.braziers.some((b) => cold.isLit(b, sim.tick))).toBe(true);
        sim.player.x = MAP.spawn.x;
        sim.player.y = MAP.spawn.y;
        cold.setCold(0, 0);
        steps(sim, 2);
        expect(cold.coldOf(0)).toBeGreaterThan(0);
    });

    test("his gaze puts out the braziers it sees, not those behind a statue", () => {
        const { sim, boss } = ready();
        const cold = sim.cold!;
        for (const brazier of cold.braziers) {
            cold.kindle(brazier, sim.tick);
        }
        startAttack(sim, boss, "Freezing gaze");
        stepFor(sim, 3);
        const lit = cold.braziers.map((b) => cold.isLit(b, sim.tick));
        // The two by his alcove are in his sight; the two in the south corners behind statues
        expect(lit).toEqual([false, false, true, true]);
    });

    test("in the open his gaze freezes and chills; hidden, his guard drops", () => {
        const { sim, boss } = ready();
        const cold = sim.cold!;
        // In the open between the vents' rows
        const at = { x: boss.x + 4.5, y: boss.y - 11 };
        sim.player.x = at.x;
        sim.player.y = at.y;
        cold.setCold(0, 0);
        startAttack(sim, boss, "Freezing gaze");
        const hp = sim.player.hp;
        for (let i = 0; i < 2.6 * TICKS_PER_SECOND; i++) {
            sim.player.x = at.x;
            sim.player.y = at.y;
            sim.step(0, 0);
        }
        expect(sim.player.hp).toBeLessThan(hp);
        expect(cold.coldOf(0)).toBeGreaterThanOrEqual(20);
        expect(sim.isExposed(boss)).toBe(false);

        const hidden = ready();
        // Straight behind the south statue, from him
        const statue = MAP.features!.pillars![4];
        hidden.sim.player.x = statue.x + 1;
        hidden.sim.player.y = statue.y - 1.5;
        startAttack(hidden.sim, hidden.boss, "Freezing gaze");
        const before = hidden.sim.player.hp;
        stepFor(hidden.sim, 2.6);
        expect(hidden.sim.player.hp).toBe(before);
        expect(hidden.sim.isExposed(hidden.boss)).toBe(true);
    });

    test("Kindle lights the brazier beside you, and one by him flares into him", () => {
        const { sim, boss } = ready();
        const cold = sim.cold!;
        // Away from every brazier: not taken
        sim.player.x = boss.x;
        sim.player.y = boss.y - 11;
        expect(sim.useAbility()).toBe(false);
        // Beside the north-west one, out
        const near = cold.braziers[0];
        near.litUntil = -1;
        sim.player.x = near.midX - 1.6;
        sim.player.y = near.midY;
        const hp = boss.hp;
        expect(sim.useAbility()).toBe(true);
        expect(cold.isLit(near, sim.tick)).toBe(true);
        expect(boss.hp).toBeLessThan(hp - DUKE_KINDLE.damage / 2);
        const flared = boss.hp;
        // Lit already, it lights again but doesn't flare
        sim.heroes[0].abilityReadyTick = 0;
        expect(sim.useAbility()).toBe(true);
        expect(boss.hp).toBe(flared);
        // A south one, out: lit, too far from him to flare
        const far = cold.braziers[2];
        far.litUntil = -1;
        sim.heroes[0].abilityReadyTick = 0;
        sim.player.x = far.midX + 1.6;
        sim.player.y = far.midY;
        expect(sim.useAbility()).toBe(true);
        expect(cold.isLit(far, sim.tick)).toBe(true);
        expect(boss.hp).toBe(flared);
    });
});

describe("Baron", () => {
    function ghorrock(pet?: string): Sim {
        const map = getMap("ghorrock");
        return new Sim({
            grid: makeGrid(
                field(),
                Math.floor(map.spawn.x) - SIZE / 2,
                Math.floor(map.spawn.y) - SIZE / 2,
            ),
            mapId: "ghorrock",
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 3,
            spawnX: map.spawn.x,
            spawnY: map.spawn.y,
            pet,
        });
    }

    // A crowd of count ice warriors round the player, held in place
    function crowd(sim: Sim, count: number): Enemy[] {
        const def = getEnemy("ghorrock_ice_warrior");
        const out: Enemy[] = [];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const enemy = sim.spawnEnemy(def, "normal", {
                x: sim.player.x + Math.cos(angle) * 1.2,
                y: sim.player.y + Math.sin(angle) * 1.2,
            })!;
            enemy.hp = enemy.maxHp = 1e6;
            out.push(enemy);
        }
        return out;
    }

    function quiet(sim: Sim): void {
        for (const hero of sim.heroes) {
            hero.weapons = [];
        }
        sim.player.invulnerable = 1e9;
    }

    test("spits his gas when six are round you: slowed and poisoned", () => {
        const sim = ghorrock("baron");
        quiet(sim);
        const enemies = crowd(sim, 6);
        sim.step(0, 0);
        expect(sim.heroes[0].petCloud).toBeDefined();
        sim.step(0, 0);
        expect(enemies.every((e) => (e.slowed ?? -1) >= sim.tick)).toBe(true);
        expect(enemies.every((e) => e.venomEnd > sim.tick)).toBe(true);
    });

    test("sleeps through five, and doesn't fight in a boss fight", () => {
        const sim = ghorrock("baron");
        quiet(sim);
        crowd(sim, 5);
        stepFor(sim, 2);
        expect(sim.heroes[0].petCloud).toBeUndefined();

        const fight = createSim({ pet: "baron" });
        steps(fight, 8);
        crowd(fight, 8);
        fight.step(0, 0);
        expect(fight.heroes[0].petCloud).toBeUndefined();
    });

    test("a run without him plays as before", () => {
        const a = ghorrock();
        const b = ghorrock("little_nightmare");
        for (let i = 0; i < 20 * TICKS_PER_SECOND; i++) {
            a.step(1, 0);
            b.step(1, 0);
        }
        expect(a.player.x).toBe(b.player.x);
        expect(a.enemies.length).toBe(b.enemies.length);
    });
});
