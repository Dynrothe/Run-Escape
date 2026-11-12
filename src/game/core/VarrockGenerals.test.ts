import { describe, expect, test } from "vitest";

import { getEnemy } from "../content/enemies";
import { JUSTICIAR_ABILITIES } from "../content/justiciarKit";
import { KRIL_BODYGUARDS, KRIL_HITPOINTS } from "../content/kril";
import { getMap, getMapCharacter, isPeaceful } from "../content/maps";
import { BossAttackDef, LairDef, PlayerEffectDef, emptyStats } from "../content/types";
import { XARTH_HITPOINTS } from "../content/xarth";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy } from "./entities";
import { makeGrid } from "./world/testGrid";

// Yama's two generals in burnt Varrock (MapDef.lairs, content/xarth.ts, content/kril.ts): each
// asleep in a ruin of its own, fought in either order, the one left empowered by the other's
// death, and a death in either fight ending the run, as any death does. On open
// ground round both ruins and the palace, from the map's own lairs (Yama's in Yama.test.ts).

const MAP = getMap("battle_for_varrock");
const lairDef = (id: string): LairDef => MAP.lairs!.find((lair) => lair.id === id)!;
const XARTH = lairDef("xarth");
const KRIL = lairDef("kril");
const BOXES = [XARTH.area!, KRIL.area!, MAP.floor!.rect];
const BASE_X = Math.min(...BOXES.map((box) => box.x0)) - 8;
const BASE_Y = Math.min(...BOXES.map((box) => box.y0)) - 12;
const TOP_X = Math.max(...BOXES.map((box) => box.x1)) + 8;
const TOP_Y = Math.max(...BOXES.map((box) => box.y1)) + 8;
const ROWS = Array.from({ length: TOP_Y - BASE_Y + 1 }, () => ".".repeat(TOP_X - BASE_X + 1));
const T = TICKS_PER_SECOND;

const slot = (id: string) => JUSTICIAR_ABILITIES.findIndex((a) => a.id === id);
const attackOf = (enemyId: string, name: string): BossAttackDef =>
    getEnemy(enemyId).boss!.attacks.find((a) => a.name === name)!;

function createSim(spawn: { x: number; y: number }): Sim {
    return new Sim({
        grid: makeGrid(ROWS, BASE_X, BASE_Y),
        mapId: MAP.id,
        characterId: getMapCharacter(MAP)!,
        metaStats: emptyStats(),
        seed: 1,
        spawnX: spawn.x,
        spawnY: spawn.y,
    });
}

function run(sim: Sim, seconds: number, moveX = 0, moveY = 0): void {
    const ticks = Math.round(seconds * T);
    for (let i = 0; i < ticks && !sim.runOver; i++) {
        sim.step(moveX, moveY);
    }
}

// Into its lair, through its intro, with nothing of its own going and nothing of the hero's
// hitting it: each test starts what it's about itself
function startFight(sim: Sim, def: LairDef): Enemy {
    sim.player.x = sim.player.prevX = def.start.x;
    sim.player.y = sim.player.prevY = def.start.y;
    sim.step(0, 0);
    run(sim, getEnemy(def.enemyId).boss!.intro!.seconds + 0.1);
    const boss = sim.lairById(def.id)!.boss!;
    boss.attackCooldown = 1e9;
    boss.speed = 0;
    boss.bossState!.windup = undefined;
    boss.bossState!.criticalAt = Infinity;
    sim.weapons.length = 0;
    return boss;
}

// Down through each of its phases and dead, by hits that take no bonus
function kill(sim: Sim, boss: Enemy): void {
    const phases = boss.def.boss!.phases!;
    for (const phase of phases.phases) {
        if (phase.until === undefined) {
            break;
        }
        boss.hp = Math.round(boss.maxHp * phase.until) + 1;
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        run(sim, (phases.threshold?.seconds ?? 0) + 0.1);
    }
    for (const enemy of sim.enemies) {
        if (KRIL_BODYGUARDS.includes(enemy.def.id)) {
            enemy.hp = 0;
            enemy.dead = true;
        }
    }
    boss.hp = 1;
    sim.damageEnemy(boss, 50, 0, boss.x, boss.y, 0);
    run(sim, 0.1);
}

// A hero this far south of a boss, turned to it
function stand(sim: Sim, x: number, y: number): void {
    const player = sim.player;
    player.x = player.prevX = x;
    player.y = player.prevY = y;
    player.facingX = 0;
    player.facingY = 1;
}

describe("the city's hordes", () => {
    test("come from the start, as on any map with waves, so it's no longer one to walk round", () => {
        expect(isPeaceful(MAP)).toBe(false);
        expect(MAP.waves.length).toBeGreaterThan(0);
        for (const wave of MAP.waves) {
            for (const { id } of wave.enemies) {
                expect(() => getEnemy(id)).not.toThrow();
                // None of them from one side only (EnemyDef.faction)
                expect(getEnemy(id).faction).toBeUndefined();
            }
        }
    });
});

describe.each([
    ["xarth", XARTH, XARTH_HITPOINTS],
    ["kril", KRIL, KRIL_HITPOINTS],
])("%s's lair", (_, def, hitpoints) => {
    test("wakes as a hero steps in, every way out burning, with its hitpoints", () => {
        const sim = createSim(MAP.spawn);
        const lair = sim.lairById(def.id)!;
        expect(lair.state).toBe("asleep");
        expect(lair.locked).toBe(false);
        const boss = startFight(sim, def);
        expect(sim.lair).toBe(lair);
        expect(lair.state).toBe("fighting");
        expect(boss.def.id).toBe(def.enemyId);
        expect(boss.maxHp).toBe(hitpoints);
        expect(lair.sealed.length).toBeGreaterThan(2 * 10);
        for (let k = 0; k < lair.sealed.length; k += 2) {
            expect(sim.grid.isDropped(lair.sealed[k], lair.sealed[k + 1])).toBe(true);
        }
        // and the other general sleeps on, whoever walks in
        const other = sim.lairs.find((one) => one !== lair && !one.locked)!;
        sim.player.x = other.def.start.x;
        sim.player.y = other.def.start.y;
        run(sim, 0.5);
        expect(other.state).toBe("asleep");
    });

    test("a death there ends the run, the hero dead where they fell", () => {
        const sim = createSim(MAP.spawn);
        const lair = sim.lairById(def.id)!;
        const boss = startFight(sim, def);
        boss.hp = Math.round(boss.maxHp * 0.8);
        sim.player.hp = 1;
        sim.player.invulnerable = 0;
        sim["damagePlayer"](100, "test", false, -1, true);
        expect(sim.runOver).toBe(true);
        expect(sim.state).toBe("dead");
        expect(sim.player.hp).toBe(0);
        expect(sim.player.deathTick).toBe(sim.tick);
        expect(sim.inLair(lair, sim.player)).toBe(true);
        expect(lair.state).toBe("fighting");
    });
});

describe("one general beaten", () => {
    test.each([
        ["Xarth", XARTH, KRIL],
        ["K'ril Tsutsaroth", KRIL, XARTH],
    ])("%s's death empowers the other", (_, first, second) => {
        const sim = createSim(MAP.spawn);
        const boss = startFight(sim, first);
        kill(sim, boss);
        const events = sim.takeEvents();
        expect(sim.lairById(first.id)!.state).toBe("beaten");
        const rival = sim.lairById(second.id)!;
        expect(rival.empowered).toBe(true);
        expect(events).toContainEqual(
            expect.objectContaining({ type: "notice", message: second.empowered!.message }),
        );
        // and it rises with more hitpoints, harder hits and less time between them
        const empowered = startFight(sim, second);
        expect(empowered.maxHp).toBe(Math.round(second.hp * second.empowered!.hp));
        expect(empowered.damageScale).toBeCloseTo(second.empowered!.damage, 5);
        expect(empowered.bossState!.tempo).toBe(second.empowered!.tempo);
        // Beaten too, Yama's palace opens
        kill(sim, empowered);
        expect(sim.lairById("yama")!.locked).toBe(false);
        expect(sim.runOver).toBe(false);
    });

    test("a general fought first has none of its empowered attacks", () => {
        const sim = createSim(MAP.spawn);
        const boss = startFight(sim, KRIL);
        expect(boss.bossState!.tempo).toBeUndefined();
        expect(boss.def.boss!.attacks.some((attack) => attack.empowered)).toBe(true);
    });
});

// Xarth's flames
const BURN = attackOf("xarth", "Searing bolt").effect as Extract<
    PlayerEffectDef,
    { kind: "debuff" }
>;

describe("Xarth", () => {
    test("his burn hits a hitpoint a second for each stack, through armour", () => {
        const sim = createSim(MAP.spawn);
        startFight(sim, XARTH);
        sim.player.maxHp = sim.player.hp = 500;
        sim.stats.armor = 50;
        for (let i = 0; i < 3; i++) {
            sim.applyPlayerEffect(BURN);
        }
        expect(sim.debuffs.find((d) => d.id === BURN.id)!.stacks).toBe(3);
        const before = sim.player.hp;
        run(sim, BURN.seconds + 0.5);
        expect(before - sim.player.hp).toBe(3 * (BURN.seconds - 1) * BURN.burn!);
        expect(sim.debuffs.some((d) => d.id === BURN.id && d.endTick > sim.tick)).toBe(false);
    });

    test("his conflagration spares only what's behind a pillar, which crumbles for it", () => {
        const conflagration = attackOf("xarth", "Conflagration");
        const sim = createSim(MAP.spawn);
        const boss = startFight(sim, XARTH);
        const lair = sim.lairById("xarth")!;
        expect(lair.pillars.every((pillar) => pillar.standing)).toBe(true);
        // The south-east pillar, between him and the hero
        const pillar = lair.pillars.find((p) => p.x > boss.x && p.y < boss.y)!;
        const size = XARTH.pillars!.size;
        const middle = { x: pillar.x + size / 2, y: pillar.y + size / 2 };
        stand(sim, boss.x + (middle.x - boss.x) * 1.3, boss.y + (middle.y - boss.y) * 1.3);
        expect(sim.inLair(lair, sim.player)).toBe(true);
        const before = sim.player.hp;
        sim["startBossAttack"](boss, conflagration);
        run(sim, conflagration.windup + 0.3);
        expect(sim.player.hp).toBe(before);
        expect(pillar.standing).toBe(false);
        expect(lair.pillars.filter((p) => p.standing).length).toBe(lair.pillars.length - 1);
        expect(sim.grid.isSolid(pillar.x, pillar.y)).toBe(false);
        // In the open, it hits through armour
        stand(sim, boss.x, boss.y - 5);
        sim.player.invulnerable = 0;
        sim["startBossAttack"](boss, conflagration);
        run(sim, conflagration.windup + 0.3);
        expect(sim.player.hp).toBeLessThan(before - conflagration.damage / 2);
    });

    test("halfway down, every pillar comes down", () => {
        const sim = createSim(MAP.spawn);
        const boss = startFight(sim, XARTH);
        const lair = sim.lairById("xarth")!;
        boss.hp = Math.round(boss.maxHp * XARTH.pillars!.crumbleAt!) + 1;
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        run(sim, 0.1);
        expect(lair.pillars.some((pillar) => pillar.standing)).toBe(false);
        for (const pillar of lair.pillars) {
            expect(sim.grid.isSolid(pillar.x, pillar.y)).toBe(false);
        }
    });

    test("fire on the floor spreads, and Shock wave puts it out along its way", () => {
        const ablaze = attackOf("xarth", "The Exchange burns");
        const sim = createSim(MAP.spawn);
        const boss = startFight(sim, XARTH);
        stand(sim, boss.x, boss.y - 6);
        sim.player.invulnerable = 1e9;
        sim["startBossAttack"](boss, ablaze);
        run(sim, ablaze.windup + 0.1);
        const lit = sim.pools.length;
        expect(lit).toBe(ablaze.count);
        run(sim, ablaze.pool!.spreads!.every * 2 + 0.1);
        expect(sim.pools.length).toBeGreaterThan(lit);
        expect(sim.pools.length).toBeLessThanOrEqual(ablaze.pool!.spreads!.most);
        const lair = sim.lairById("xarth")!;
        for (const pool of sim.pools) {
            expect(sim.inLair(lair, pool)).toBe(true);
        }
        // A pool three tiles north of the hero, the wave sent at it
        const pool = sim.pools[0];
        stand(sim, pool.x, pool.y - 3);
        expect(sim.useAbility(slot("shock_wave"))).toBe(true);
        run(sim, 1.5);
        expect(pool.endTick).toBeLessThanOrEqual(sim.tick);
    });

    test("his fire on the floor goes out when he dies, rather than spreading on", () => {
        const ablaze = attackOf("xarth", "The Exchange burns");
        const sim = createSim(MAP.spawn);
        const boss = startFight(sim, XARTH);
        stand(sim, boss.x, boss.y - 6);
        sim.player.invulnerable = 1e9;
        sim["startBossAttack"](boss, ablaze);
        run(sim, ablaze.windup + 0.1);
        expect(sim.pools.length).toBe(ablaze.count);
        kill(sim, boss);
        expect(sim.lairById("xarth")!.state).toBe("beaten");
        expect(sim.pools).toEqual([]);
        run(sim, ablaze.pool!.spreads!.every * 2);
        expect(sim.pools).toEqual([]);
    });

    test("the dead who reach him heal him", () => {
        const reanimate = attackOf("xarth", "Reanimate");
        const sim = createSim(MAP.spawn);
        const boss = startFight(sim, XARTH);
        sim.player.invulnerable = 1e9;
        stand(sim, boss.x, boss.y - 6);
        boss.hp = Math.round(boss.maxHp * 0.6);
        const before = boss.hp;
        sim["startBossAttack"](boss, reanimate);
        run(sim, reanimate.windup + 0.1);
        expect(boss.bossState!.walkers!.enemies.length).toBe(reanimate.summon!.count);
        run(sim, 20);
        const heals = reanimate.summon!.walkTo!.heals!;
        expect(boss.hp - before).toBeGreaterThan(boss.maxHp * heals * 2);
    });
});

describe("K'ril Tsutsaroth", () => {
    test("takes only half of each hit while a bodyguard stands", () => {
        const sim = createSim(MAP.spawn);
        const boss = startFight(sim, KRIL);
        const summons = boss.def.boss!.summonsAt!;
        boss.hp = Math.round(boss.maxHp * summons[0].hp) + 1;
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        run(sim, 0.1);
        const guard = sim.enemies.find((e) => !e.dead && e.def.id === summons[0].enemyId);
        expect(guard).toBeDefined();
        const guarded = sim.damageEnemy(boss, 100, 0, boss.x, boss.y, 0);
        expect(guarded).toBeLessThan(60);
        guard!.hp = 0;
        guard!.dead = true;
        const open = sim.damageEnemy(boss, 100, 0, boss.x, boss.y, 0);
        expect(open).toBeGreaterThan(80);
    });

    test("his desecration heals him unless he's hit hard enough to break it", () => {
        const desecration = attackOf("kril_general", "Desecration");
        const share = desecration.breakable!.share;
        for (const broken of [false, true]) {
            const sim = createSim(MAP.spawn);
            const boss = startFight(sim, KRIL);
            stand(sim, boss.x, boss.y - 9);
            // Above where his first bodyguard comes, who'd take half of it (BossDef.pact)
            boss.hp = Math.round(boss.maxHp * 0.75);
            sim["startBossAttack"](boss, desecration);
            run(sim, 1);
            if (broken) {
                sim.damageEnemy(boss, Math.ceil((boss.maxHp * share) / 0.8), 0, boss.x, boss.y, 0);
                // Stunned and open
                expect(boss.bossState!.windup).toBeUndefined();
                expect(sim.isExposed(boss)).toBe(true);
            }
            const before = boss.hp;
            run(sim, desecration.windup);
            if (broken) {
                expect(boss.hp).toBe(before);
            } else {
                expect(boss.hp - before).toBeCloseTo(boss.maxHp * desecration.heal!, -1);
            }
        }
    });
});
