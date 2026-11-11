import { describe, expect, test } from "vitest";

import { FALLEN_EMPIRE, getActFightIds } from "../content/acts";
import { AWAKENED_DUKE_ID, DUKE_HITPOINTS } from "../content/duke";
import {
    ANCIENT_FOCUS,
    BLESSING_BY_ID,
    FIRST_CLEAR_ORBS,
    GAUNTLET_CLIMB,
    GAUNTLET_FIGHTS,
    GauntletFightOptions,
    MAX_GUARD_POINTS,
    SECOND_WIND_HP,
    WOUND_SHARE,
    getFightPoints,
} from "../content/gauntlet";
import { getMap } from "../content/maps";
import { emptyStats } from "../content/types";
import { Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import type { Enemy } from "./entities";
import {
    GauntletOutcome,
    chooseBlessing,
    gauntletFightId,
    gauntletFightOptions,
    gauntletRetries,
    gauntletSeconds,
    isGauntletClean,
    leaveGauntletCamp,
    loseGauntletFight,
    retryGauntletFight,
    startGauntlet,
    winGauntletFight,
} from "./gauntlet";
import {
    createSave,
    getGauntletOrder,
    hasGauntletLooks,
    isGauntletHardOpen,
    isGauntletOpen,
    migrateSave,
    recordGauntlet,
    recordRun,
} from "./save";
import { makeGrid } from "./world/testGrid";

// The Forgotten Four (content/gauntlet.ts, core/gauntlet.ts): the run's chain of fights, its
// points, wounds, blessings and retries, its records and rewards, and what a fight of it changes
// in the Sim. The Duke's room needs the cache, so his fight plays on an open field, as in
// Duke.test.ts.

const ORDER = [...GAUNTLET_FIGHTS];

const outcome = (o: Partial<GauntletOutcome> = {}): GauntletOutcome => ({
    seconds: 100,
    hp: 50,
    maxHp: 100,
    damageTaken: 100,
    guardDowns: 4,
    ...o,
});

describe("the gauntlet's run", () => {
    test("is the act's four Awakened fights, climbing 1, 1.05, 1.1 and 1.15", () => {
        expect(GAUNTLET_FIGHTS).toEqual(getActFightIds(FALLEN_EMPIRE));
        expect(GAUNTLET_FIGHTS).toHaveLength(4);
        expect(GAUNTLET_CLIMB).toEqual([1, 1.05, 1.1, 1.15]);
        let run = startGauntlet(ORDER, false);
        const climbs: number[] = [];
        for (let i = 0; i < 4; i++) {
            expect(gauntletFightId(run)).toBe(ORDER[i]);
            climbs.push(gauntletFightOptions(run).climb);
            run = winGauntletFight(run, outcome());
            run = leaveGauntletCamp(run);
        }
        expect(climbs).toEqual(GAUNTLET_CLIMB);
        expect(run.phase).toBe("cleared");
        expect(gauntletSeconds(run)).toBe(400);
        expect(isGauntletClean(run)).toBe(true);
    });

    test("pays a raid room's points for a win, and carries a fifth of the hitpoints lost", () => {
        // Within par, no damage, ten guard drops: everything
        expect(getFightPoints(60, 0, 100, 10).total).toBe(50 + 100 + 50 + MAX_GUARD_POINTS);
        // Slow, a whole bar taken, no guard drops: the clear alone
        expect(getFightPoints(400, 200, 100, 0).total).toBe(50);
        let run = startGauntlet(ORDER, false);
        run = winGauntletFight(run, outcome({ hp: 40, maxHp: 100 }));
        expect(run.phase).toBe("camp");
        expect(run.wound).toBeCloseTo(WOUND_SHARE * 0.6);
        expect(run.points).toBe(getFightPoints(100, 100, 100, 4).total);
        run = leaveGauntletCamp(run);
        // At most a fifth down, even from a fight won on a sliver
        expect(gauntletFightOptions(run).hp).toBeCloseTo(1 - 0.12);
        run = winGauntletFight(run, outcome({ hp: 1, maxHp: 100 }));
        expect(run.wound).toBeLessThanOrEqual(WOUND_SHARE);
    });

    test("the camp's blessing is paid for, given back if changed, and Rest clears the wounds", () => {
        let run = winGauntletFight(
            startGauntlet(ORDER, false),
            outcome({ hp: 0, seconds: 30, damageTaken: 0, guardDowns: 20 }),
        );
        const points = run.points;
        expect(points).toBe(250);
        expect(run.wound).toBeCloseTo(WOUND_SHARE);
        run = chooseBlessing(run, "rest");
        expect(run.wound).toBe(0);
        expect(run.points).toBe(points - BLESSING_BY_ID.get("rest")!.price);
        run = chooseBlessing(run, "second_wind");
        expect(run.blessing).toBe("second_wind");
        expect(run.wound).toBeCloseTo(WOUND_SHARE);
        expect(run.points).toBe(points - BLESSING_BY_ID.get("second_wind")!.price);
        // Too dear once the points are short: nothing changes
        const poor = chooseBlessing({ ...run, points: 0, blessing: undefined }, "second_wind");
        expect(poor.blessing).toBeUndefined();
        run = chooseBlessing(run, undefined);
        expect(run.points).toBe(points);
        run = leaveGauntletCamp(chooseBlessing(run, "ancient_focus"));
        expect(gauntletFightOptions(run)).toEqual({
            climb: 1.05,
            hp: 1 - WOUND_SHARE,
            blessing: "ancient_focus",
        });
    });

    test("Retry this fight starts it again as it was come into; a retry isn't a clean run", () => {
        let run = winGauntletFight(startGauntlet(ORDER, false), outcome());
        run = leaveGauntletCamp(chooseBlessing(run, "steady_hands"));
        const into = { wound: run.wound, points: run.points, blessing: run.blessing };
        run = loseGauntletFight(run);
        expect(run.phase).toBe("fallen");
        run = retryGauntletFight(run);
        expect(run.phase).toBe("fight");
        expect({ wound: run.wound, points: run.points, blessing: run.blessing }).toEqual(into);
        expect(gauntletRetries(run)).toBe(1);
        run = winGauntletFight(run, outcome());
        expect(run.done[1].retries).toBe(1);
        expect(run.blessing).toBeUndefined();
        expect(isGauntletClean(run)).toBe(false);
    });
});

const win = (mapId: string) => ({
    mapId,
    victory: true,
    seconds: 60,
    level: 1,
    kills: 1,
    coins: 0,
    bossesKilled: [],
});

describe("the gauntlet's records and rewards", () => {
    const beatAll = () => {
        const save = createSave();
        for (const id of ["awakened_duke", "awakened_vardorvis"]) {
            recordRun(save, win(id));
        }
        return save;
    };

    test("opens once all four are beaten, ordered as they first fell", () => {
        const save = beatAll();
        expect(isGauntletOpen(save)).toBe(false);
        expect(getGauntletOrder(save)).toEqual([
            "awakened_duke",
            "awakened_vardorvis",
            "awakened_whisperer",
            "awakened_leviathan",
        ]);
        for (const id of ["awakened_whisperer", "awakened_leviathan", "awakened_duke"]) {
            recordRun(save, win(id));
        }
        expect(isGauntletOpen(save)).toBe(true);
        expect(save.awakenedOrder).toEqual([
            "awakened_duke",
            "awakened_vardorvis",
            "awakened_whisperer",
            "awakened_leviathan",
        ]);
    });

    test("any first clear gives two Awakener's orbs, saved; only a clean one the looks", () => {
        const save = beatAll();
        const retried = recordGauntlet(save, {
            order: ORDER,
            hard: false,
            seconds: 500,
            retries: 2,
        });
        expect(retried).toMatchObject({ firstClear: true, orbs: FIRST_CLEAR_ORBS, looks: false });
        expect(save.awakenerOrbs).toBe(2);
        expect(isGauntletHardOpen(save)).toBe(false);
        expect(hasGauntletLooks(save)).toBe(false);
        const clean = recordGauntlet(save, { order: ORDER, hard: false, seconds: 600, retries: 0 });
        expect(clean).toMatchObject({
            firstClear: false,
            firstCleanClear: true,
            orbs: 0,
            looks: true,
            hardOpened: true,
            // Clean beats quicker with retries
            record: true,
        });
        expect(save.awakenerOrbs).toBe(2);
        expect(isGauntletHardOpen(save)).toBe(true);
        // Hard's own first clear gives its own
        recordGauntlet(save, { order: ORDER, hard: true, seconds: 700, retries: 0 });
        expect(save.awakenerOrbs).toBe(4);
        // Kept through a save's reload
        const loaded = migrateSave(JSON.parse(JSON.stringify(save)));
        expect(loaded.awakenerOrbs).toBe(4);
        expect(loaded.gauntlet).toEqual(save.gauntlet);
        expect(hasGauntletLooks(loaded)).toBe(true);
    });

    test("times are kept for each order, a quicker clean clear the order's best", () => {
        const save = beatAll();
        const other = [...ORDER].reverse();
        recordGauntlet(save, { order: ORDER, hard: false, seconds: 600, retries: 0 });
        expect(
            recordGauntlet(save, { order: other, hard: false, seconds: 900, retries: 0 }).record,
        ).toBe(true);
        expect(
            recordGauntlet(save, { order: ORDER, hard: false, seconds: 650, retries: 0 }).record,
        ).toBe(false);
        expect(
            recordGauntlet(save, { order: ORDER, hard: false, seconds: 550, retries: 0 }).record,
        ).toBe(true);
        expect(Object.keys(save.gauntlet!.normal!.best)).toHaveLength(2);
        expect(save.gauntlet!.normal!.clears).toBe(4);
    });

    test("a save's made-up orders, orbs and records are dropped", () => {
        const loaded = migrateSave({
            gauntletOrder: ["awakened_duke", "awakened_duke", "x", "y"],
            awakenerOrbs: "lots",
            gauntlet: { normal: { clears: 0 }, hard: "no" },
        });
        expect(loaded.gauntletOrder).toBeUndefined();
        expect(loaded.awakenerOrbs).toBeUndefined();
        expect(loaded.gauntlet).toBeUndefined();
    });
});

// The Duke's fight on an open field
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

function createSim(gauntlet?: GauntletFightOptions, options: Partial<SimOptions> = {}): Sim {
    return new Sim({
        grid: makeGrid(field(), BASE_X, BASE_Y),
        mapId: MAP.id,
        characterId: "snow_ranger",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: MAP.spawn.x,
        spawnY: MAP.spawn.y,
        gauntlet,
        ...options,
    });
}

function duke(sim: Sim): Enemy | undefined {
    return sim.enemies.find((e) => e.def.id === AWAKENED_DUKE_ID && !e.dead);
}

// Past his waking, the hero kept whole
function ready(gauntlet?: GauntletFightOptions): { sim: Sim; boss: Enemy } {
    const sim = createSim(gauntlet);
    for (let i = 0; i < 8 * TICKS_PER_SECOND; i++) {
        sim.player.hp = sim.player.maxHp;
        const boss = duke(sim);
        if (boss?.bossState) {
            boss.attackCooldown = Math.max(boss.attackCooldown, 10);
        }
        sim.step(0, 0);
    }
    return { sim, boss: duke(sim)! };
}

type Private = {
    startBossAttack(e: Enemy, a: unknown): void;
    dropGuard(boss: Enemy, seconds: number, stunned: boolean, cause: string): void;
    playerDied(): void;
};

describe("a fight of the gauntlet's", () => {
    test("climbs: the boss's hitpoints and tempo times the climb", () => {
        const plain = ready();
        const climbed = ready({ climb: 1.15, hp: 1 });
        expect(plain.boss.maxHp).toBe(DUKE_HITPOINTS);
        expect(climbed.boss.maxHp).toBe(Math.round(DUKE_HITPOINTS * 1.15));
        const attack = plain.boss.def.boss!.attacks[0];
        (plain.sim as unknown as Private).startBossAttack(plain.boss, attack);
        (climbed.sim as unknown as Private).startBossAttack(climbed.boss, attack);
        expect(climbed.boss.attackCooldown).toBeLessThan(plain.boss.attackCooldown);
        expect(climbed.boss.attackCooldown).toBeCloseTo(plain.boss.attackCooldown / 1.15, -1);
    });

    test("starts wounded, and Saradomin's blessing has more hitpoints", () => {
        const plain = createSim();
        const wounded = createSim({ climb: 1, hp: 0.85 });
        expect(wounded.player.maxHp).toBe(plain.player.maxHp);
        expect(wounded.player.hp).toBe(Math.round(plain.player.maxHp * 0.85));
        const blessed = createSim({ climb: 1, hp: 1, blessing: "saradomin" });
        expect(blessed.player.maxHp).toBe(Math.round(plain.player.maxHp * 1.2));
        expect(blessed.player.hp).toBe(blessed.player.maxHp);
    });

    test("Second wind stands you back up once, at 30% and untouchable", () => {
        const { sim } = ready({ climb: 1, hp: 1, blessing: "second_wind" });
        sim.player.hp = 0;
        (sim as unknown as Private).playerDied();
        expect(sim.state).toBe("playing");
        expect(sim.player.hp).toBe(Math.round(sim.player.maxHp * SECOND_WIND_HP));
        expect(sim.player.invulnerable).toBe(3 * TICKS_PER_SECOND);
        sim.player.hp = 0;
        (sim as unknown as Private).playerDied();
        expect(sim.state).toBe("dead");
    });

    test("Ancient focus charges the button quicker; Steady hands holds the guard down", () => {
        const focused = createSim({ climb: 1, hp: 1, blessing: "ancient_focus" });
        expect(focused.ability!.cooldown).toBeCloseTo(MAP.fight!.ability!.cooldown * ANCIENT_FOCUS);
        expect(createSim().ability).toBe(MAP.fight!.ability);
        const plain = ready();
        const steady = ready({ climb: 1, hp: 1, blessing: "steady_hands" });
        for (const { sim, boss } of [plain, steady]) {
            (sim as unknown as Private).dropGuard(boss, 2, false, "test");
        }
        const open = ({ boss }: { boss: Enemy }) => boss.bossState!.exposedEnd!;
        expect(open(steady) - steady.sim.tick - (open(plain) - plain.sim.tick)).toBe(
            0.5 * TICKS_PER_SECOND,
        );
        expect(steady.sim.guardDowns).toBe(1);
        expect(steady.sim.getResult().gauntlet).toMatchObject({ guardDowns: 1 });
        expect(plain.sim.getResult().gauntlet).toBeUndefined();
    });

    test("is ignored off a boss fight", () => {
        const sim = new Sim({
            grid: makeGrid(field(), BASE_X, BASE_Y),
            mapId: "lumbridge",
            characterId: "snow_ranger",
            metaStats: emptyStats(),
            seed: 1,
            spawnX: MAP.spawn.x,
            spawnY: MAP.spawn.y,
            gauntlet: { climb: 2, hp: 0.1 },
        });
        expect(sim.gauntlet).toBeUndefined();
        expect(sim.player.hp).toBe(sim.player.maxHp);
    });
});
