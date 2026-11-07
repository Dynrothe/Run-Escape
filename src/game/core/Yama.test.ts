import { describe, expect, test } from "vitest";

import { getEnemy } from "../content/enemies";
import { JUSTICIAR_ABILITIES } from "../content/justiciarKit";
import { canRetry, getMap, getMapCharacter } from "../content/maps";
import { BossAttackDef, emptyStats } from "../content/types";
import { YAMA_HITPOINTS } from "../content/yama";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy, SimEvent } from "./entities";
import { makeGrid } from "./world/testGrid";

// Yama in burnt Varrock's palace (content/yama.ts, MapDef.lair): asleep on his throne until the
// Justiciar steps onto the palace floor, then fought there with every way off it burning, and
// his meteor, which only the Owl's gaze stops (docs/design/yama.md). On open ground round the
// palace floor, which the floor itself lays out.

const MAP = getMap("battle_for_varrock");
const LAIR = MAP.lair!;
const RECT = MAP.floor!.rect;
const MARGIN = 6;
const BASE_X = RECT.x0 - MARGIN;
const BASE_Y = RECT.y0 - MARGIN;
const ROWS = Array.from({ length: RECT.y1 - RECT.y0 + 1 + 2 * MARGIN }, () =>
    ".".repeat(RECT.x1 - RECT.x0 + 1 + 2 * MARGIN),
);
// Off the floor, south of where his fight starts
const OUTSIDE = { x: LAIR.start!.x, y: RECT.y0 - 2.5 };
const T = TICKS_PER_SECOND;

const yama = () => getEnemy("yama");
const slot = (id: string) => JUSTICIAR_ABILITIES.findIndex((a) => a.id === id);
const attackNamed = (name: string): BossAttackDef =>
    yama().boss!.attacks.find((a) => a.name === name)!;

function createSim(spawn = OUTSIDE, party?: number): Sim {
    const characterId = getMapCharacter(MAP)!;
    return new Sim({
        grid: makeGrid(ROWS, BASE_X, BASE_Y),
        mapId: MAP.id,
        characterId,
        metaStats: emptyStats(),
        seed: 1,
        spawnX: spawn.x,
        spawnY: spawn.y,
        party:
            party === undefined
                ? undefined
                : Array.from({ length: party }, (_, i) => ({
                      name: "p" + i,
                      characterId,
                      metaStats: emptyStats(),
                  })),
    });
}

function run(sim: Sim, seconds: number, moveX = 0, moveY = 0): void {
    const ticks = Math.round(seconds * T);
    for (let i = 0; i < ticks && !sim.runOver; i++) {
        sim.step(moveX, moveY);
    }
}

// Woken where his fight starts, through his rise, with nothing of his going and nothing of the
// Justiciar's hitting him: each test starts what it's about itself
function startFight(sim: Sim): Enemy {
    run(sim, yama().boss!.intro!.seconds + 0.1);
    const boss = sim.lair!.boss!;
    boss.attackCooldown = 1e9;
    boss.speed = 0;
    boss.bossState!.windup = undefined;
    boss.bossState!.chain = undefined;
    for (const hero of sim.heroes) {
        hero.weapons.length = 0;
    }
    return boss;
}

// A hero this far south of him, turned to him
function stand(sim: Sim, boss: Enemy, south: number, hero = 0): void {
    const player = sim.heroes[hero].player;
    player.x = player.prevX = boss.x;
    player.y = player.prevY = boss.y - south;
    player.facingX = 0;
    player.facingY = 1;
}

// Down through each of his phases (his kneel between them), and then dead
function kill(sim: Sim, boss: Enemy): void {
    const phases = yama().boss!.phases!;
    for (const phase of phases.phases) {
        if (phase.until === undefined) {
            break;
        }
        boss.hp = Math.round(boss.maxHp * phase.until) + 1;
        sim.damageEnemy(boss, 5, 0, boss.x, boss.y, 0);
        run(sim, phases.threshold!.seconds + 0.1);
    }
    boss.hp = 1;
    sim.damageEnemy(boss, 50, 0, boss.x, boss.y, 0);
}

// What he's winding up, if anything
const windingUp = (boss: Enemy) => boss.bossState!.windup?.attack.name;

// Whether his meteor came down on a hero
const struck = (sim: Sim, hero = 0) => sim.heroes[hero].damageByAttack["Meteor"] !== undefined;

function events(sim: Sim): SimEvent[] {
    return sim.takeEvents();
}

describe("his lair", () => {
    test("he sleeps until someone steps onto the palace floor, and nothing hurts till then", () => {
        const sim = createSim();
        run(sim, 1);
        expect(sim.lair!.state).toBe("asleep");
        expect(sim.enemies.some((e) => e.def.id === "yama")).toBe(false);
        const before = sim.player.hp;
        expect(sim["damagePlayer"](10, "test", false)).toBe(0);
        expect(sim.player.hp).toBe(before);
        // North, onto the floor
        for (let i = 0; i < 4 * T && sim.lair!.state === "asleep"; i++) {
            sim.step(0, 1);
        }
        expect(sim.lair!.state).toBe("fighting");
        expect(events(sim)).toContainEqual(
            expect.objectContaining({ type: "notice", message: LAIR.message }),
        );
    });

    test("every way off the floor burns while he's up, and he rises with his hitpoints", () => {
        const sim = createSim(LAIR.start);
        run(sim, 0.1);
        const { sealed } = sim.lair!;
        // The whole edge of the floor, on open ground all round
        expect(sealed.length).toBeGreaterThan(2 * 40);
        for (let k = 0; k < sealed.length; k += 2) {
            expect(sim.grid.isDropped(sealed[k], sealed[k + 1])).toBe(true);
        }
        const boss = startFight(sim);
        expect(boss.hp).toBe(YAMA_HITPOINTS);
        expect(boss.x).toBeCloseTo(LAIR.at.x, 1);
        expect(boss.y).toBeCloseTo(LAIR.at.y, 1);
        // Walking south for a while leaves them on the floor
        boss.x = boss.prevX = LAIR.at.x + 50;
        run(sim, 8, 0, -1);
        const floor = sim.floor!;
        const i = floor.index(Math.floor(sim.player.x), Math.floor(sim.player.y));
        expect(floor.layout.mask[i]).toBe(1);
    });

    test("once he's dead the fires go out, and he says his last", () => {
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        kill(sim, boss);
        expect(boss.dead).toBe(true);
        events(sim);
        run(sim, 0.1);
        expect(sim.lair!.state).toBe("beaten");
        const { sealed } = sim.lair!;
        for (let k = 0; k < sealed.length; k += 2) {
            expect(sim.grid.isDropped(sealed[k], sealed[k + 1])).toBe(false);
        }
        const said = events(sim);
        expect(said).toContainEqual(
            expect.objectContaining({ type: "notice", message: LAIR.victory }),
        );
        expect(sim.lair!.liftTick).toBeGreaterThan(sim.lair!.sealTick);
        expect(said).toContainEqual(
            expect.objectContaining({ type: "bossShout", text: LAIR.shout }),
        );
        // and the map's one to walk round again, not won
        expect(sim.runOver).toBe(false);
        expect(sim["damagePlayer"](10, "test", false)).toBe(0);
    });

    test("a retry starts on his floor, so his fight's on again at once", () => {
        expect(canRetry(MAP)).toBe(true);
        const sim = createSim(LAIR.start);
        sim.step(0, 0);
        expect(sim.lair!.state).toBe("fighting");
    });
});

describe("his meteor", () => {
    test("comes on its own clock, never picked, and kills whoever's up", () => {
        const meteor = attackNamed("Meteor");
        expect(meteor.weight).toBe(0);
        expect(yama().boss!.critical!.attack).toBe("Meteor");
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 6);
        sim["startBossAttack"](boss, meteor);
        run(sim, meteor.windup + 0.5);
        expect(struck(sim)).toBe(true);
        expect(sim.runOver).toBe(true);
    });

    test("the gaze cast at him while he calls it down stops it, and drops his guard", () => {
        const meteor = attackNamed("Meteor");
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 6);
        sim["startBossAttack"](boss, meteor);
        run(sim, 1);
        expect(sim.useAbility(slot("owls_gaze"))).toBe(true);
        run(sim, meteor.windup);
        expect(struck(sim)).toBe(false);
        expect(sim.runOver).toBe(false);
        expect(windingUp(boss)).not.toBe("Meteor");
        expect(sim.isExposed(boss)).toBe(true);
        // It hits him, his guard already down, and raises no pillars mid-cast
        expect(boss.hp).toBeLessThan(YAMA_HITPOINTS);
        expect(sim.wardPillars).toEqual([]);
    });

    test("he never starts one while their gaze is too far from ready to stop it", () => {
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 6);
        boss.attackCooldown = 0;
        sim.heroes[0].kitReadyTicks[slot("owls_gaze")] = sim.tick + 10 * T;
        boss.bossState!.criticalAt = sim.tick;
        run(sim, 0.2);
        expect(windingUp(boss)).not.toBe("Meteor");
        boss.bossState!.windup = undefined;
        boss.attackCooldown = 0;
        sim.heroes[0].kitReadyTicks[slot("owls_gaze")] = sim.tick + 2 * T;
        run(sim, 0.1);
        expect(windingUp(boss)).toBe("Meteor");
    });
});

describe("the gaze otherwise", () => {
    test("raises pillars between him and the Justiciar, which hide him, and sink again", () => {
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 7);
        events(sim);
        expect(sim.useAbility(slot("owls_gaze"))).toBe(true);
        run(sim, 2);
        const ward = yama().boss!.gazeWard!;
        expect(sim.wardPillars).toHaveLength(1);
        const { tiles } = sim.wardPillars[0];
        expect(tiles.length).toBe(2 * ward.count);
        for (let k = 0; k < tiles.length; k += 2) {
            // Between them, and blocking the way
            expect(tiles[k + 1] + 0.5).toBeLessThan(boss.y);
            expect(tiles[k + 1] + 0.5).toBeGreaterThan(sim.player.y);
            expect(sim.grid.isPillar(tiles[k], tiles[k + 1])).toBe(true);
        }
        expect(boss.hp).toBe(YAMA_HITPOINTS);
        const shouts = events(sim).filter((e) => e.type === "bossShout");
        expect(shouts.some((e) => ward.shouts.includes((e as { text: string }).text))).toBe(true);
        run(sim, ward.seconds + ward.rise + 0.5);
        expect(sim.wardPillars.every((p) => p.sunk)).toBe(true);
        for (let k = 0; k < tiles.length; k += 2) {
            expect(sim.grid.isPillar(tiles[k], tiles[k + 1])).toBe(false);
        }
    });
});

describe("in co-op", () => {
    test("either player's gaze stops the meteor for both", () => {
        const meteor = attackNamed("Meteor");
        const sim = createSim(LAIR.start, 2);
        const boss = startFight(sim);
        stand(sim, boss, 6, 0);
        stand(sim, boss, 7, 1);
        sim.heroes[1].player.x += 2;
        sim.heroes[1].player.prevX = sim.heroes[1].player.x;
        sim["startBossAttack"](boss, meteor);
        run(sim, 1);
        expect(sim.as(1, () => sim.useAbility(slot("owls_gaze")))).toBe(true);
        run(sim, meteor.windup);
        expect(sim.runOver).toBe(false);
        expect(struck(sim, 0)).toBe(false);
        expect(struck(sim, 1)).toBe(false);
        expect(sim.isExposed(boss)).toBe(true);
    });
});
