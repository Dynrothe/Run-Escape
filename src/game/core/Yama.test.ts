import { describe, expect, test } from "vitest";

import { getEnemy } from "../content/enemies";
import { JUSTICIAR_ABILITIES } from "../content/justiciarKit";
import { canRetry, getMap, getMapCharacter } from "../content/maps";
import { BossAttackDef, emptyStats } from "../content/types";
import { YAMA_HITPOINTS } from "../content/yama";
import { METEOR_FIT, PLAYER_SPEED, Sim, TICKS_PER_SECOND } from "./Sim";
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

// The meteor breaking up, its own spot animation played on from where it cracks
const burst = (sim: Sim) =>
    sim.effects.find((e) => e.spotAnim === attackNamed("Meteor").meteor!.spotAnim);

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
        // North, onto the floor: his opening first, then his fight
        for (let i = 0; i < 4 * T && sim.lair!.state === "asleep"; i++) {
            sim.step(0, 1);
        }
        expect(sim.lair!.state).toBe("waking");
        run(sim, LAIR.opening!.introAt);
        expect(sim.lair!.state).toBe("fighting");
        expect(events(sim)).toContainEqual(
            expect.objectContaining({ type: "notice", message: LAIR.message }),
        );
    });

    test("his opening holds everyone where they stand, turned to where he'll rise, until his intro", () => {
        const sim = createSim(OUTSIDE, 2);
        // The first player north onto the floor; the second presses south throughout
        for (let i = 0; i < 4 * T && sim.lair!.state === "asleep"; i++) {
            sim.setInput(0, 0, 1);
            sim.setInput(1, 0, -1);
            sim.step();
        }
        const lair = sim.lair!;
        expect(lair.state).toBe("waking");
        expect(lair.introTick - lair.wakeTick).toBe(Math.round(LAIR.opening!.introAt * T));
        const at = sim.heroes.map((hero) => ({ x: hero.player.x, y: hero.player.y }));
        while (sim.tick < lair.introTick - 1) {
            sim.setInput(0, 1, 0);
            sim.setInput(1, 0, -1);
            sim.step();
            // Nothing sealed, nothing risen and nothing hurts while he speaks
            expect(lair.sealed.length).toBe(0);
            expect(sim.intro).toBeUndefined();
        }
        sim.heroes.forEach((hero, i) => {
            expect(hero.player.x).toBeCloseTo(at[i].x, 5);
            expect(hero.player.y).toBeCloseTo(at[i].y, 5);
        });
        expect(sim.introFacing).toEqual(LAIR.at);
        expect(sim["damagePlayer"](10, "test", false)).toBe(0);
        run(sim, 0.1);
        expect(lair.state).toBe("fighting");
        expect(lair.sealed.length).toBeGreaterThan(0);
        expect(sim.intro?.def.id).toBe("yama");
    });

    test("a player on their own who skips it brings him on at the next tick", () => {
        const sim = createSim();
        for (let i = 0; i < 4 * T && sim.lair!.state === "asleep"; i++) {
            sim.step(0, 1);
        }
        run(sim, 1);
        expect(sim.lair!.state).toBe("waking");
        sim.skipLairOpening();
        sim.step(0, 0);
        expect(sim.lair!.state).toBe("fighting");
        expect(sim.intro).toBeDefined();
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

    test("a retry starts on his floor, so his fight's on again at once, without his opening", () => {
        expect(canRetry(MAP)).toBe(true);
        const sim = createSim(LAIR.start);
        sim.step(0, 0);
        expect(sim.lair!.state).toBe("fighting");
        expect(sim.lair!.wakeTick).toBe(-1);
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

    test("falls whole and breaks up where it lands, on its animation from where it cracks", () => {
        const meteor = attackNamed("Meteor");
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 6);
        sim["startBossAttack"](boss, meteor);
        const windup = boss.bossState!.windup!;
        const at = windup.targets[0];
        run(sim, meteor.windup - 0.1);
        expect(burst(sim)).toBeUndefined();
        run(sim, 0.2);
        expect(burst(sim)).toMatchObject({
            x: at.x,
            y: at.y,
            height: 0,
            once: true,
            fitRadius: METEOR_FIT,
        });
        const breaks = Math.round(meteor.meteor!.breaksAt! * T);
        expect(burst(sim)!.startTick).toBe(windup.landTick - breaks);
    });

    test("the gaze cast at him while he calls it down stops it, and drops his guard", () => {
        const meteor = attackNamed("Meteor");
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 6);
        sim["startBossAttack"](boss, meteor);
        run(sim, 1);
        expect(sim.useAbility(slot("owls_gaze"))).toBe(true);
        for (let i = 0; i < 3 * T && windingUp(boss) === "Meteor"; i++) {
            sim.step(0, 0);
        }
        // Broken up in the sky, where it had got to
        const height = burst(sim)!.height;
        expect(height).toBeGreaterThan(1);
        expect(height).toBeLessThan(meteor.meteor!.height);
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

// Every slab of the floor west of beforeX up and hurting this tick, halfway through its hurt
function slam(sim: Sim, beforeX = Infinity): void {
    const floor = sim.floor!;
    const [from, to] = MAP.floor!.slam.hurt;
    const since = Math.round(((from + to) / 2) * T);
    for (let i = 0; i < floor.roseAt.length; i++) {
        if (floor.x0 + (i % floor.sizeX) < beforeX) {
            floor.roseAt[i] = sim.tick - since;
        }
    }
}

describe("his floor", () => {
    test("a lunge goes over its rising slabs unharmed, and standing on one hurts", () => {
        const lunge = JUSTICIAR_ABILITIES[slot("lunge")];
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 9);
        sim.player.facingX = 1;
        sim.player.facingY = 0;
        const hp = sim.player.hp;
        const fromX = sim.player.x;
        expect(sim.useAbility(slot("lunge"))).toBe(true);
        run(sim, lunge.windup);
        // The slabs come up under them all the way along, short of where it ends
        const before = fromX + lunge.length - 1.5;
        for (let i = 0; i < T && sim.player.x < fromX + lunge.length - 0.1; i++) {
            slam(sim, before);
            sim.step(0, 0);
        }
        expect(sim.player.x).toBeCloseTo(fromX + lunge.length, 1);
        expect(sim.player.hp).toBe(hp);
        run(sim, 0.1);
        slam(sim);
        sim.step(0, 0);
        expect(sim.player.hp).toBeLessThan(hp);
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

// One of his Voidflares, called in now, held where it's put (its drifting is its own test's)
function callFlare(sim: Sim, boss: Enemy, at?: { x: number; y: number }): Enemy {
    sim["summonAround"](boss, attackNamed("Voidflare"));
    const flare = sim.enemies.find((e) => e.def.id === "voidflare" && !e.dead)!;
    if (at) {
        flare.x = flare.prevX = at.x;
        flare.y = flare.prevY = at.y;
    }
    flare.speed = 0;
    return flare;
}

// The middle of the 3 by 3 lightning cell east of the hero's, which is the other colour, so their
// Lightning strikes it (HeroAbilityDef kind "checker")
function nextCell(sim: Sim): { x: number; y: number } {
    const { x, y } = sim.player;
    return { x: (Math.floor(x / 3) + 1) * 3 + 1.5, y: Math.floor(y / 3) * 3 + 1.5 };
}

// Whether a floor tile (world tiles) is to rise
const rising = (sim: Sim, x: number, y: number) => {
    const floor = sim.floor!;
    return floor.riseAt[floor.index(Math.floor(x), Math.floor(y))] !== -1;
};

describe("his Voidflare", () => {
    test("is his from the second phase, drifts after them slower than they walk, and nothing hurts it", () => {
        expect(attackNamed("Voidflare").phases).toEqual([2, 3]);
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 9);
        const flare = callFlare(sim, boss);
        // Out of his hands, on their side of him
        const reach = attackNamed("Voidflare").summon!.distance!;
        expect(flare.y).toBeLessThan(boss.y - reach * 0.8);
        expect(Math.hypot(flare.x - boss.x, flare.y - boss.y)).toBeCloseTo(reach, 1);
        flare.speed = getEnemy("voidflare").speed / T;
        expect(getEnemy("voidflare").speed).toBeLessThan(PLAYER_SPEED * T);
        const away = () => Math.hypot(flare.x - sim.player.x, flare.y - sim.player.y);
        const before = away();
        run(sim, 1);
        expect(away()).toBeLessThan(before - 1);
        expect(sim.damageEnemy(flare, 500, 0, sim.player.x, sim.player.y)).toBe(0);
        expect(flare.dead).toBe(false);
    });

    test("bursts in its time where it is, with a plus of the floor from there", () => {
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 9);
        const at = { x: sim.player.x + 4, y: sim.player.y + 0.5 };
        const flare = callFlare(sim, boss, at);
        const hp = sim.player.hp;
        run(sim, getEnemy("voidflare").bursts!.fuse - 0.2);
        expect(flare.dead).toBe(false);
        run(sim, 0.3);
        expect(flare.dead).toBe(true);
        // Out of its reach: nothing, but the floor's coming up along its row and column
        expect(sim.player.hp).toBe(hp);
        expect(rising(sim, at.x, at.y)).toBe(true);
        expect(rising(sim, at.x + 3, at.y)).toBe(true);
        expect(rising(sim, at.x, at.y - 3)).toBe(true);
        expect(rising(sim, at.x + 1, at.y + 1)).toBe(false);
        // and it drops nothing
        expect(sim.pickups).toEqual([]);
    });

    test("bursts on whoever it touches once it's formed, for 10", () => {
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 9);
        const flare = callFlare(sim, boss, { x: sim.player.x + 0.8, y: sim.player.y });
        const hp = sim.player.hp;
        // Its first second, they can step away
        const arm = getEnemy("voidflare").bursts!.arm!;
        run(sim, arm - 0.1);
        expect(flare.dead).toBe(false);
        run(sim, 0.2);
        expect(flare.dead).toBe(true);
        expect(sim.player.hp).toBe(hp - getEnemy("voidflare").bursts!.damage);
    });

    test("Ice barrage goes for it before him, and holds it and its fuse", () => {
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 4);
        const flare = callFlare(sim, boss, nextCell(sim));
        expect(sim.useAbility(slot("ice_barrage"))).toBe(true);
        const cast = sim["kitCasts"][0];
        expect([cast.x, cast.y]).toEqual([flare.x, flare.y]);
        run(sim, 1);
        expect(flare.frozen).toBeGreaterThan(0);
        expect(boss.hp).toBe(YAMA_HITPOINTS);
        // Held past its fuse, and then it goes on
        run(sim, getEnemy("voidflare").bursts!.fuse);
        expect(flare.dead).toBe(false);
        run(sim, getEnemy("voidflare").bursts!.shatter!.frozen);
        expect(flare.dead).toBe(true);
    });

    test("Lightning shatters it only while it's held, leaving 6 hitpoints to pick up", () => {
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 9);
        const flare = callFlare(sim, boss, nextCell(sim));
        const lightning = slot("lightning");
        expect(sim.useAbility(lightning)).toBe(true);
        run(sim, 1.5);
        expect(flare.dead).toBe(false);
        sim.useAbility(slot("ice_barrage"));
        run(sim, 1);
        sim.heroes[0].kitReadyTicks[lightning] = 0;
        expect(sim.useAbility(lightning)).toBe(true);
        run(sim, 1.5);
        expect(flare.dead).toBe(true);
        expect(sim.pickups).toEqual([
            expect.objectContaining({
                kind: "food",
                value: getEnemy("voidflare").bursts!.shatter!.heal,
            }),
        ]);
        // No burst, and nothing counted
        expect(rising(sim, flare.x, flare.y)).toBe(false);
        expect(sim.kills).toBe(0);
        // Hurt, they walk over it and have 6 back
        sim.player.hp -= 10;
        const hp = sim.player.hp;
        const heal = sim.pickups[0];
        sim.player.x = sim.player.prevX = heal.x + 1;
        sim.player.y = sim.player.prevY = heal.y;
        run(sim, 1);
        expect(sim.player.hp).toBe(hp + 6);
    });

    test("goes with him when he dies", () => {
        const sim = createSim(LAIR.start);
        const boss = startFight(sim);
        stand(sim, boss, 9);
        const flare = callFlare(sim, boss, { x: sim.player.x + 4, y: sim.player.y });
        kill(sim, boss);
        expect(flare.dead).toBe(true);
        run(sim, getEnemy("voidflare").bursts!.fuse);
        expect(rising(sim, flare.x, flare.y)).toBe(false);
    });
});

describe("in co-op", () => {
    test("a Voidflare's burst hits every player it reaches", () => {
        const sim = createSim(LAIR.start, 2);
        const boss = startFight(sim);
        stand(sim, boss, 9, 0);
        stand(sim, boss, 9, 1);
        const [one, two] = sim.heroes.map((hero) => hero.player);
        two.x = two.prevX = one.x + 1.6;
        const flare = callFlare(sim, boss, { x: one.x + 0.8, y: one.y });
        const hp = [one.hp, two.hp];
        run(sim, getEnemy("voidflare").bursts!.arm! + 0.1);
        expect(flare.dead).toBe(true);
        // Each as his own attacks hit, harder for a party
        const hit = Math.round(getEnemy("voidflare").bursts!.damage * boss.damageScale);
        expect(hit).toBeGreaterThanOrEqual(10);
        expect([one.hp, two.hp]).toEqual([hp[0] - hit, hp[1] - hit]);
    });

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
