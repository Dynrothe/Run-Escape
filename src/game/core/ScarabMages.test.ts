import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { getEnemy } from "../content/enemies";
import { MAP_BY_ID } from "../content/maps";
import { BossAttackDef, emptyStats } from "../content/types";
import { BENEATH_CURSED_SANDS } from "../scaperune/maps/tombsOfAmascut";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy } from "./entities";
import { makeGrid } from "./world/testGrid";

// The Scarab Mages (Beneath Cursed Sands' second part, content/cursedSands.ts): the elder's
// arrival in the square, the partner enrage (BossDef enrage.partner) and the sand tether
// (BossAttackDef.tether), on open ground where the quest's square is. The quest's a dev map,
// so it's put in the maps for these tests.

const MAP = BENEATH_CURSED_SANDS;
const SQUARE = MAP.bossArena!;
const MARGIN = 10;
const ROWS = Array.from({ length: SQUARE.size + MARGIN * 2 }, () =>
    ".".repeat(SQUARE.size + MARGIN * 2),
);
const MIDDLE = { x: SQUARE.baseX + SQUARE.size / 2, y: SQUARE.baseY + SQUARE.size / 2 };

let listed = false;
beforeAll(() => {
    listed = MAP_BY_ID.has(MAP.id);
    MAP_BY_ID.set(MAP.id, MAP);
});
afterAll(() => {
    if (!listed) {
        MAP_BY_ID.delete(MAP.id);
    }
});

function createSim(party?: number): Sim {
    const sim = new Sim({
        grid: makeGrid(ROWS, SQUARE.baseX - MARGIN, SQUARE.baseY - MARGIN),
        mapId: MAP.id,
        characterId: "sands_delver",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: MAP.spawn.x,
        spawnY: MAP.spawn.y,
        stage: 1,
        party:
            party === undefined
                ? undefined
                : Array.from({ length: party }, (_, i) => ({
                      name: "p" + i,
                      characterId: "sands_delver",
                      metaStats: emptyStats(),
                  })),
    });
    for (const hero of sim.heroes) {
        hero.weapons.length = 0;
    }
    return sim;
}

function run(sim: Sim, seconds: number): void {
    const ticks = Math.round(seconds * TICKS_PER_SECOND);
    for (let i = 0; i < ticks && !sim.runOver; i++) {
        sim.step(0, 0);
    }
}

const bosses = (sim: Sim) => sim.enemies.filter((e) => e.boss && !e.dead && !e.leaving);
const byId = (sim: Sim, id: string) => sim.enemies.find((e) => e.def.id === id && !e.dead)!;

// Nothing of theirs going, standing where they're put
function hush(sim: Sim, ...list: Enemy[]): void {
    for (const boss of list) {
        boss.attackCooldown = 1e9;
        boss.speed = 0;
        boss.vx = boss.vy = 0;
        const state = boss.bossState!;
        state.windup = undefined;
        state.chain = undefined;
        state.follow = undefined;
        if (state.phase) {
            state.phase.ambientsNext = [Infinity, Infinity, Infinity];
        }
    }
    sim.hazards = [];
    sim.bullets.clear();
    sim["emitters"] = [];
    sim.enemyProjectiles = [];
}

function place(
    entity: { x: number; y: number; prevX: number; prevY: number },
    x: number,
    y: number,
) {
    entity.x = entity.prevX = x;
    entity.y = entity.prevY = y;
}

// Both of them up (the elder brought on now), quiet, the first west of the middle and the elder
// east of it
function both(party?: number): { sim: Sim; mage: Enemy; elder: Enemy } {
    const sim = createSim(party);
    run(sim, getEnemy("scarab_mage").boss!.intro!.seconds + 0.1);
    const mage = byId(sim, "scarab_mage");
    const elder = sim["spawnBoss"](getEnemy("scarab_mage_elder"), "finalBoss", 3900, {
        x: MIDDLE.x + 4,
        y: MIDDLE.y,
    })!;
    hush(sim, mage, elder);
    place(mage, MIDDLE.x - 4, MIDDLE.y);
    place(elder, MIDDLE.x + 4, MIDDLE.y);
    for (const hero of sim.heroes) {
        hero.player.invulnerable = 0;
    }
    sim.takeEvents();
    return { sim, mage, elder };
}

// Down to nothing: through its threshold first (the elder kneels at it, untouchable), as a hit
// can't take it past one
function kill(sim: Sim, boss: Enemy): void {
    for (let i = 0; i < 3 && !boss.dead; i++) {
        sim.damageEnemy(boss, 1e6, 0, boss.x, boss.y, 0);
        if (!boss.dead) {
            run(sim, 2);
        }
    }
}

describe("the elder's arrival", () => {
    test("up inside the square twenty seconds in, with the first still there", () => {
        const sim = createSim();
        sim.player.invulnerable = 1e9;
        run(sim, 19);
        expect(bosses(sim).map((e) => e.def.id)).toEqual(["scarab_mage"]);
        run(sim, 1.5);
        expect(bosses(sim).map((e) => e.def.id)).toEqual(["scarab_mage", "scarab_mage_elder"]);
        const elder = byId(sim, "scarab_mage_elder");
        expect(elder.x).toBeGreaterThan(SQUARE.baseX);
        expect(elder.x).toBeLessThan(SQUARE.baseX + SQUARE.size);
        expect(elder.y).toBeGreaterThan(SQUARE.baseY);
        expect(elder.y).toBeLessThan(SQUARE.baseY + SQUARE.size);
        expect(elder.bossState!.phase).toBeDefined();
    });
});

describe("partner enrage", () => {
    test("one down, the other's furious at once: its shout, and quicker than enraged", () => {
        const { sim, mage, elder } = both();
        expect(elder.bossState!.enraged).toBe(false);
        kill(sim, mage);
        expect(mage.dead).toBe(true);
        // Both have to fall: one down isn't a win
        expect(sim.runOver).toBe(false);
        const partner = elder.def.boss!.enrage.partner!;
        expect(elder.bossState!.enraged).toBe(true);
        expect(elder.bossState!.furyTempo).toBe(partner.tempo);
        const events = sim.takeEvents();
        expect(
            events.some(
                (e) =>
                    e.type === "bossShout" && e.enemyUid === elder.uid && e.text === partner.shout,
            ),
        ).toBe(true);
        expect(events.some((e) => e.type === "bossEnraged" && e.enemyId === elder.def.id)).toBe(
            true,
        );
        // Its interval's the partner's tempo, not the usual enraged one
        const bolt = elder.def.boss!.attacks.find((a) => a.name === "Sand blast")!;
        sim["startBossAttack"](elder, bolt);
        expect(elder.attackCooldown).toBe(
            Math.round(elder.def.boss!.attackInterval * partner.tempo! * TICKS_PER_SECOND),
        );
        // The noose it has from its half is its now
        expect(elder.def.boss!.attacks.some((a) => a.enraged && a.phases?.includes(1))).toBe(true);
        kill(sim, elder);
        expect(sim.state).toBe("victory");
    });

    test("either way round", () => {
        const { sim, mage, elder } = both();
        kill(sim, elder);
        expect(sim.runOver).toBe(false);
        expect(mage.bossState!.enraged).toBe(true);
        expect(mage.bossState!.furyTempo).toBe(mage.def.boss!.enrage.partner!.tempo);
    });

    test("a boss that isn't its partner's leaves it as it was", () => {
        const { sim, mage, elder } = both();
        const other = sim["spawnBoss"](getEnemy("coenus"), "boss", 100, {
            x: MIDDLE.x,
            y: MIDDLE.y + 5,
        })!;
        hush(sim, other);
        kill(sim, other);
        expect(mage.bossState!.enraged).toBe(false);
        expect(elder.bossState!.enraged).toBe(false);
    });
});

describe("the sand tether", () => {
    const tether = (): BossAttackDef =>
        getEnemy("scarab_mage_elder").boss!.attacks.find((a) => a.tether)!;

    test("between the two: it hurts across it once it's armed, once an interval, and not beside it", () => {
        const { sim, elder } = both();
        const def = tether();
        place(sim.player, MIDDLE.x, MIDDLE.y);
        sim["startTether"](elder, def);
        const taken = () => sim.damageByAttack[def.name] ?? 0;
        // Its warning first
        run(sim, def.tether!.warn - 0.1);
        expect(taken()).toBe(0);
        run(sim, 0.2);
        const once = taken();
        expect(once).toBeGreaterThan(0);
        // Not again till its interval's gone, then again
        sim.player.invulnerable = 0;
        run(sim, def.tether!.interval - 0.3);
        expect(taken()).toBe(once);
        run(sim, 0.4);
        const twice = taken();
        expect(twice).toBeGreaterThan(once);
        // Beside it, never
        place(sim.player, MIDDLE.x, MIDDLE.y + 2);
        run(sim, def.tether!.interval * 2);
        expect(taken()).toBe(twice);
        // Past its end, by the far mage, neither
        place(sim.player, MIDDLE.x + 6, MIDDLE.y);
        run(sim, def.tether!.interval * 2);
        expect(taken()).toBe(twice);
    });

    test("it swings as they move, and it's gone with either of them", () => {
        const { sim, mage, elder } = both();
        const def = tether();
        place(sim.player, MIDDLE.x, MIDDLE.y + 3);
        sim["startTether"](elder, def);
        run(sim, def.tether!.warn + 0.1);
        expect(sim.damageByAttack[def.name] ?? 0).toBe(0);
        // The first steps through the sand: the beam's across them now
        place(mage, MIDDLE.x - 4, MIDDLE.y + 6);
        place(elder, MIDDLE.x + 4, MIDDLE.y);
        run(sim, 0.1);
        expect(sim.damageByAttack[def.name]).toBeGreaterThan(0);
        kill(sim, mage);
        expect(sim.tethers).toHaveLength(0);
    });

    test("co-op: whoever's across it, each of them", () => {
        const { sim, elder } = both(2);
        const def = tether();
        place(sim.heroes[0].player, MIDDLE.x - 1, MIDDLE.y);
        place(sim.heroes[1].player, MIDDLE.x + 1, MIDDLE.y + 3);
        sim["startTether"](elder, def);
        const taken = (hero: number) => sim.heroes[hero].damageByAttack[def.name] ?? 0;
        run(sim, def.tether!.warn + 0.1);
        expect(taken(0)).toBeGreaterThan(0);
        expect(taken(1)).toBe(0);
        place(sim.heroes[1].player, MIDDLE.x + 1, MIDDLE.y);
        sim.heroes[1].player.invulnerable = 0;
        run(sim, 0.1);
        expect(taken(1)).toBeGreaterThan(0);
    });
});

const attackOf = (boss: Enemy, name: string): BossAttackDef =>
    boss.def.boss!.attacks.find((a) => a.name === name)!;

describe("a channelled spell (BossAttackDef.channel)", () => {
    test("its guard's down while it channels; uninterrupted, the storm hits all but its feet", () => {
        const { sim, elder } = both();
        const storm = attackOf(elder, "Sands of Scabaras");
        sim["startBossAttack"](elder, storm);
        // At the middle, its guard down
        expect(Math.hypot(elder.x - MIDDLE.x, elder.y - MIDDLE.y)).toBeLessThan(1);
        expect(sim.isExposed(elder)).toBe(true);
        place(sim.player, elder.x + storm.outside! + 2, elder.y);
        run(sim, storm.windup + 0.1);
        expect(sim.damageByAttack[storm.name]).toBeGreaterThan(0);
        // Cast, its guard's back up
        run(sim, 0.2);
        expect(sim.isExposed(elder)).toBe(false);
    });

    test("at its feet, the storm passes over", () => {
        const { sim, elder } = both();
        const storm = attackOf(elder, "Sands of Scabaras");
        sim["startBossAttack"](elder, storm);
        place(sim.player, elder.x + storm.outside! - 1, elder.y);
        run(sim, storm.windup + 0.1);
        expect(sim.damageByAttack[storm.name] ?? 0).toBe(0);
    });

    test("Point-blank breaks it: no storm, and its guard stays down a while", () => {
        const { sim, elder } = both();
        const storm = attackOf(elder, "Sands of Scabaras");
        sim["startBossAttack"](elder, storm);
        place(sim.player, elder.x + 2, elder.y);
        run(sim, 1);
        expect(sim.useAbility()).toBe(true);
        expect(elder.bossState!.windup).toBeUndefined();
        // Its guard stays down for the stagger, then it's up
        expect(sim.isExposed(elder)).toBe(true);
        run(sim, storm.channel!.stagger - 0.2);
        expect(sim.isExposed(elder)).toBe(true);
        run(sim, 0.4);
        expect(sim.isExposed(elder)).toBe(false);
        const events = sim.takeEvents();
        expect(events.some((e) => e.type === "notice" && e.message === storm.channel!.broken)).toBe(
            true,
        );
        // Out in the storm's reach now: nothing comes
        place(sim.player, elder.x + 8, elder.y);
        run(sim, storm.windup);
        expect(sim.damageByAttack[storm.name] ?? 0).toBe(0);
    });

    test("the swarm: its guard's down while they walk in, and Point-blank scatters them", () => {
        const { sim, mage } = both();
        const swarm = attackOf(mage, "Swarm to me");
        place(sim.player, mage.x + 3, mage.y);
        sim["startBossAttack"](mage, swarm);
        run(sim, swarm.windup + 0.5);
        const walkers = mage.bossState!.walkers!;
        expect(walkers.enemies.filter((e) => !e.dead)).toHaveLength(swarm.summon!.count);
        expect(sim.isExposed(mage)).toBe(true);
        sim.takeEvents();
        expect(sim.useAbility()).toBe(true);
        expect(mage.bossState!.walkers).toBeUndefined();
        expect(walkers.enemies.every((e) => e.dead)).toBe(true);
        run(sim, 5);
        // No blast for what never got there
        expect(sim.takeEvents().some((e) => e.type === "bossAbsorbBlast")).toBe(false);
        expect(sim.damageByAttack[swarm.name] ?? 0).toBe(0);
    });
});

describe("Point-blank with two of them", () => {
    test("on the one with its guard down, else the nearer, either of them", () => {
        const { sim, mage, elder } = both();
        const ability = MAP.fight!.ability!;
        // Between them, nearer the elder: the elder
        place(sim.player, MIDDLE.x + 1, MIDDLE.y);
        expect(sim.abilityTarget()).toBe(elder);
        // The first's guard down: the first, though further
        sim["dropGuard"](mage, 2, false, "test");
        expect(sim.abilityTarget()).toBe(mage);
        // Out of reach of both, neither
        place(sim.player, MIDDLE.x, MIDDLE.y + ability.openReach! + 3);
        expect(sim.abilityTarget()).toBeUndefined();
        // The elder alone's still in reach once the first's down
        kill(sim, mage);
        place(sim.player, elder.x - 2, elder.y);
        expect(sim.abilityTarget()).toBe(elder);
    });
});

describe("the Crossfire (the elder's EnemyDef.echoes)", () => {
    test("the first's strip, and the elder's from where it stands a beat later", () => {
        const { sim, mage, elder } = both();
        place(sim.player, MIDDLE.x, MIDDLE.y + 3);
        sim["startBossAttack"](mage, attackOf(mage, "Crossfire"));
        const echo = elder.echo!;
        expect(echo).toBeDefined();
        expect(echo.landTick).toBeGreaterThan(mage.bossState!.windup!.landTick);
        // Aimed from the elder at the player
        expect(echo.dirX).toBeLessThan(0);
        expect(echo.dirY).toBeGreaterThan(0);
        // Stood still in both strips, both land
        run(sim, 1.5);
        expect(sim.damageByAttack["Crossfire"]).toBeGreaterThan(0);
        sim.player.invulnerable = 0;
        expect(sim.damageByAttack[elder.def.echoes!.name]).toBeGreaterThan(0);
    });

    test("not while the elder's busy with a spell of its own", () => {
        const { sim, mage, elder } = both();
        place(sim.player, MIDDLE.x, MIDDLE.y + 3);
        sim["startBossAttack"](elder, attackOf(elder, "Sand blast"));
        sim["startBossAttack"](mage, attackOf(mage, "Crossfire"));
        expect(elder.echo).toBeUndefined();
    });
});

describe("co-op", () => {
    test("the storm hits each player out of the shelter, and none in it", () => {
        const { sim, elder } = both(2);
        const storm = attackOf(elder, "Sands of Scabaras");
        sim["startBossAttack"](elder, storm);
        place(sim.heroes[0].player, elder.x + 1, elder.y);
        place(sim.heroes[1].player, elder.x - storm.outside! - 2, elder.y);
        run(sim, storm.windup + 0.1);
        expect(sim.heroes[0].damageByAttack[storm.name] ?? 0).toBe(0);
        expect(sim.heroes[1].damageByAttack[storm.name]).toBeGreaterThan(0);
    });
});
