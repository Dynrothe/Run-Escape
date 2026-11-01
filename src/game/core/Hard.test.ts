import { endlessCoinScale } from "../content/endless";
import { getEnemy } from "../content/enemies";
import { FUN_MAPS } from "../content/fun/maps";
import {
    HARD_BOSS_INTERVAL,
    HARD_COINS,
    HARD_CROWD,
    HARD_ELITES,
    HARD_ENRAGE_AT,
    HARD_XP,
    getHardScale,
} from "../content/hard";
import { MAPS, getMap } from "../content/maps";
import { emptyStats } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy } from "./entities";
import { makeGrid } from "./world/testGrid";

function openField(): string[] {
    const size = 72;
    const rows: string[] = [];
    for (let y = 0; y < size; y++) {
        const edge = y === 0 || y === size - 1;
        rows.push(edge ? "#".repeat(size) : "#" + ".".repeat(size - 2) + "#");
    }
    return rows;
}

// With no weapons, so nothing dies and no level up stops the clock
function createSim(hard: boolean, mapId = "barrows", endless = false): Sim {
    const sim = new Sim({
        grid: makeGrid(openField(), 1000, 1000),
        mapId,
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1036.5,
        spawnY: 1036.5,
        hard,
        endless,
    });
    sim.weapons = [];
    return sim;
}

// Private methods, as the game would call them
type Hooks = {
    powerUpDamageScale(): number;
};
const hooks = (sim: Sim) => sim as unknown as Hooks;

// Steps the sim for so many seconds, keeping the player alive
function run(sim: Sim, seconds: number): void {
    for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
        sim.player.hp = sim.player.maxHp;
        sim.step(0, 0);
    }
}

function spawnBoss(sim: Sim): Enemy {
    return sim.spawnEnemy(getEnemy("torag"), "boss", { x: 1040.5, y: 1036.5 })!;
}

describe("hard mode", () => {
    test("every map has it tougher", () => {
        for (const map of [...MAPS, ...FUN_MAPS]) {
            const scale = getHardScale(map);
            expect(scale.hp).toBeGreaterThan(1);
            expect(scale.damage).toBeGreaterThan(1);
        }
    });

    test("is off unless asked for, and says so in the result", () => {
        const normal = new Sim({
            grid: makeGrid(openField(), 1000, 1000),
            mapId: "barrows",
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 1,
            spawnX: 1036.5,
            spawnY: 1036.5,
        });
        expect(normal.hard).toBe(false);
        expect(normal.getResult().hard).toBe(false);
        expect(createSim(true).getResult().hard).toBe(true);
    });

    test("enemies have the map's hard hitpoints and damage, and less experience", () => {
        const scale = getHardScale(getMap("barrows"));
        const spot = { x: 1040.5, y: 1036.5 };
        const goblin = getEnemy("goblin");
        const normal = createSim(false).spawnEnemy(goblin, "normal", spot)!;
        const hard = createSim(true).spawnEnemy(goblin, "normal", spot)!;
        expect(hard.maxHp).toBeCloseTo(normal.maxHp * scale.hp, -1);
        expect(hard.damageScale).toBeCloseTo(normal.damageScale * scale.damage);
        expect(hard.xp).toBeCloseTo(normal.xp * HARD_XP);
    });

    test("bosses with hitpoints set by the map are tougher too", () => {
        const scale = getHardScale(getMap("barrows"));
        const event = getMap("barrows").events.find((e) => e.kind === "boss")!;
        const sim = createSim(true);
        sim.tick = event.at * TICKS_PER_SECOND;
        sim.step(0, 0);
        const boss = sim.enemies.find((e) => e.def.id === event.enemyId)!;
        expect(boss.maxHp).toBe(Math.round((event.kind === "boss" ? event.hp! : 0) * scale.hp));
        expect(boss.damageScale).toBeCloseTo(getMap("barrows").difficulty.damage * scale.damage);
    });

    test("power-ups keep up with the hitpoints", () => {
        const scale = getHardScale(getMap("barrows"));
        expect(hooks(createSim(true)).powerUpDamageScale()).toBeCloseTo(
            hooks(createSim(false)).powerUpDamageScale() * scale.hp,
        );
    });

    test("the crowd is bigger", () => {
        const peak = (sim: Sim) => {
            let most = 0;
            for (let i = 0; i < 90 * TICKS_PER_SECOND; i++) {
                sim.player.hp = sim.player.maxHp;
                sim.step(0, 0);
                most = Math.max(most, sim.enemies.length);
            }
            return most;
        };
        const normal = peak(createSim(false, "lumbridge"));
        const hard = peak(createSim(true, "lumbridge"));
        expect(hard).toBeGreaterThanOrEqual(Math.floor(normal * HARD_CROWD) - 1);
    });

    test("each elite event brings more than one", () => {
        const event = getMap("lumbridge").events.find((e) => e.kind === "elite")!;
        const elites = (sim: Sim) => {
            run(sim, event.at + 1);
            return sim.enemies.filter((e) => e.elite).length;
        };
        expect(elites(createSim(false, "lumbridge"))).toBe(1);
        expect(elites(createSim(true, "lumbridge"))).toBe(HARD_ELITES);
    });

    test("bosses enrage sooner", () => {
        const health = (HARD_ENRAGE_AT + 0.5) / 2;
        const enragedAt = (sim: Sim) => {
            const boss = spawnBoss(sim);
            boss.hp = Math.round(boss.maxHp * health);
            sim.step(0, 0);
            return boss.bossState!.enraged;
        };
        expect(enragedAt(createSim(false))).toBe(false);
        expect(enragedAt(createSim(true))).toBe(true);
    });

    test("bosses attack faster", () => {
        const def = getEnemy("torag").boss!;
        const longestWait = (sim: Sim) => {
            const boss = spawnBoss(sim);
            let longest = 0;
            for (let i = 0; i < 30 * TICKS_PER_SECOND; i++) {
                sim.player.hp = sim.player.maxHp;
                sim.step(0, 0);
                longest = Math.max(longest, boss.attackCooldown);
            }
            return longest;
        };
        const ticks = def.attackInterval * TICKS_PER_SECOND;
        expect(longestWait(createSim(false))).toBe(Math.round(ticks));
        expect(longestWait(createSim(true))).toBe(Math.round(ticks * HARD_BOSS_INTERVAL));
    });

    test("coins are worth more, in endless runs too", () => {
        expect(createSim(false).coinScale).toBe(1);
        expect(createSim(true).coinScale).toBe(HARD_COINS);
        expect(createSim(true, "barrows", true).coinScale).toBeCloseTo(
            endlessCoinScale(1) * HARD_COINS,
        );
    });

    test("fun maps can be hard too", () => {
        const map = FUN_MAPS[0];
        const sim = createSim(true, map.id);
        expect(sim.hard).toBe(true);
        expect(sim.endless).toBe(true);
    });
});
