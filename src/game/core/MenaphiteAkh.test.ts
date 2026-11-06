import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { getEnemy } from "../content/enemies";
import { MAP_BY_ID } from "../content/maps";
import { emptyStats } from "../content/types";
import { BENEATH_CURSED_SANDS } from "../scaperune/maps/tombsOfAmascut";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy } from "./entities";
import { makeGrid } from "./world/testGrid";

// The Menaphite Akh (Beneath Cursed Sands' last part, content/cursedSands.ts): her shadow
// copying her dives in her last phase (EnemyDef.echoes), on open ground where the quest's square
// is. The quest's a dev map, so it's put in the maps for these tests.

const MAP = BENEATH_CURSED_SANDS;
const SQUARE = MAP.bossArena!;
const MARGIN = 10;
const ROWS = Array.from({ length: SQUARE.size + MARGIN * 2 }, () =>
    ".".repeat(SQUARE.size + MARGIN * 2),
);
const MIDDLE = { x: SQUARE.baseX + SQUARE.size / 2, y: SQUARE.baseY + SQUARE.size / 2 };
const AKH = getEnemy("menaphite_akh");
const SHADOW = getEnemy("menaphite_shadow");
const ECHOES = SHADOW.echoes!;
const attack = (name: string) => AKH.boss!.attacks.find((a) => a.name === name)!;

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
        stage: 3,
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
        sim.step();
    }
}

function place(
    entity: { x: number; y: number; prevX: number; prevY: number },
    x: number,
    y: number,
) {
    entity.x = entity.prevX = x;
    entity.y = entity.prevY = y;
}

// Her up after her rise in the phase asked for (counting from 1), quiet, north of the middle,
// with a shadow of hers to the east; the player south of the middle, still
function risen(phase: number, party?: number): { sim: Sim; boss: Enemy; shadow: Enemy } {
    const sim = createSim(party);
    run(sim, AKH.boss!.intro!.seconds + 0.1);
    const boss = sim.enemies.find((e) => e.def.id === AKH.id && !e.dead)!;
    boss.attackCooldown = 1e9;
    boss.speed = 0;
    const state = boss.bossState!;
    state.windup = undefined;
    state.chain = undefined;
    state.follow = undefined;
    state.phase!.index = phase - 1;
    state.phase!.opener = undefined;
    state.phase!.ambientsNext = [Infinity, Infinity];
    place(boss, MIDDLE.x, MIDDLE.y + 6);
    sim.hazards = [];
    const shadow = sim.spawnEnemy(SHADOW, "normal", { x: MIDDLE.x + 7, y: MIDDLE.y })!;
    shadow.risingEnd = 0;
    shadow.speed = 0;
    shadow.attackCooldown = 1e9;
    for (const hero of sim.heroes) {
        hero.moveX = hero.moveY = 0;
        hero.player.invulnerable = 0;
    }
    place(sim.player, MIDDLE.x, MIDDLE.y - 2);
    return { sim, boss, shadow };
}

// She starts it, and her own's taken away again, so only her shadow's can land
function sheStarts(sim: Sim, boss: Enemy, name: string): void {
    sim["startBossAttack"](boss, attack(name));
    boss.bossState!.windup = undefined;
}

const shadowHit = (sim: Sim, hero = 0) => sim.heroes[hero].damageByAttack[ECHOES.name] ?? 0;

describe("her shadow's dive (EnemyDef.echoes)", () => {
    test("names only her phase 3 dives, and its seq is one her shadow can play", () => {
        for (const name of ECHOES.attacks) {
            const dive = attack(name);
            expect(dive.kind).toBe("swing");
            expect(dive.line).toBeDefined();
            expect(dive.phases ?? []).not.toContain(1);
            expect(dive.phases ?? []).not.toContain(2);
        }
        expect(ECHOES.boss).toBe(AKH.id);
        // Her last stand's dives are copied too, and her first phase's aren't
        const finale = AKH.boss!.phases!.finale!.attacks;
        expect(finale.some((name) => ECHOES.attacks.includes(name))).toBe(true);
        expect(ECHOES.attacks).not.toContain("Dive");
    });

    test("in her last stand it dives with her", () => {
        const { sim, boss, shadow } = risen(3);
        boss.hp = 10;
        sim.damageEnemy(boss, 1e6, 0, boss.x, boss.y, 0);
        expect(boss.bossState!.phase!.stage).toBe("finale");
        sheStarts(sim, boss, "Dive (last stand)");
        expect(shadow.echo?.attack.name).toBe(ECHOES.name);
    });

    test("in phase 3, it copies her dive from where it stands, at the player, and lands it", () => {
        const { sim, boss, shadow } = risen(3);
        sim["startBossAttack"](boss, attack("Dive flurry"));
        const hers = boss.bossState!.windup!;
        const echo = shadow.echo!;
        expect(echo.attack.name).toBe(ECHOES.name);
        expect(echo.attack.damage).toBe(ECHOES.damage);
        expect(echo.attack.opens).toBeUndefined();
        expect(echo.landTick - hers.landTick).toBe(
            Math.round((ECHOES.later ?? 0) * TICKS_PER_SECOND),
        );
        // From the east, at them: a second strip at an angle to hers
        expect(echo.dirX).toBeLessThan(-0.9);
        expect(hers.dirY).toBeLessThan(-0.9);
        expect(shadow.attackSeq).toBe(ECHOES.seq);
        boss.bossState!.windup = undefined;
        run(sim, (echo.landTick - sim.tick) / TICKS_PER_SECOND + 0.05);
        expect(shadowHit(sim)).toBeGreaterThan(0);
        // And it's gone down its strip, stopping short of them
        run(sim, 1);
        expect(shadow.x).toBeLessThan(MIDDLE.x + 7 - 4);
        expect(shadow.echo).toBeUndefined();
        expect(shadow.echoDash).toBeUndefined();
        expect(shadow.attackSeq).toBe(SHADOW.attackSeq);
    });

    test("it hits only on its own strip: stepped off once it's locked, nothing", () => {
        const { sim, boss, shadow } = risen(3);
        sheStarts(sim, boss, "Dive flurry");
        const echo = shadow.echo!;
        // Past its tracking, then off its strip (north of it), still on hers had she gone on
        run(sim, 0.3);
        place(sim.player, sim.player.x, sim.player.y + 3);
        run(sim, (echo.landTick - sim.tick) / TICKS_PER_SECOND + 0.05);
        expect(shadow.echo).toBeUndefined();
        expect(shadowHit(sim)).toBe(0);
    });

    test("nothing outside phase 3, nor for her other attacks", () => {
        for (const [phase, name] of [
            [1, "Dive"],
            [2, "Dives"],
            [3, "Spear"],
            [3, "Lightning cage"],
        ] as const) {
            const { sim, boss, shadow } = risen(phase);
            sheStarts(sim, boss, name);
            expect(shadow.echo).toBeUndefined();
            run(sim, 1.5);
            expect(shadowHit(sim)).toBe(0);
        }
    });

    test("nothing from a dead shadow, and nothing once it's killed mid-windup", () => {
        const dead = risen(3);
        dead.sim.damageEnemy(dead.shadow, 1e6, 0, dead.shadow.x, dead.shadow.y, 0);
        expect(dead.shadow.dead).toBe(true);
        sheStarts(dead.sim, dead.boss, "Dive flurry");
        expect(dead.shadow.echo).toBeUndefined();

        const { sim, boss, shadow } = risen(3);
        sheStarts(sim, boss, "Dive flurry");
        expect(shadow.echo).toBeDefined();
        run(sim, 0.2);
        sim.damageEnemy(shadow, 1e6, 0, shadow.x, shadow.y, 0);
        run(sim, 1.5);
        expect(shadowHit(sim)).toBe(0);
    });

    test("two shadows up: only the nearer copies her (most)", () => {
        const { sim, boss, shadow } = risen(3);
        const far = sim.spawnEnemy(SHADOW, "normal", { x: MIDDLE.x - 9, y: MIDDLE.y })!;
        far.risingEnd = 0;
        sheStarts(sim, boss, "Dive flurry");
        expect(shadow.echo).toBeDefined();
        expect(far.echo).toBeUndefined();
    });

    test("a shadow still diving doesn't start another", () => {
        const { sim, boss, shadow } = risen(3);
        sheStarts(sim, boss, "Dive flurry");
        const first = shadow.echo!;
        sheStarts(sim, boss, "Dive flurry");
        expect(shadow.echo).toBe(first);
    });

    test("co-op: at whoever's nearest it, and only they're hit", () => {
        const { sim, boss, shadow } = risen(3, 2);
        place(sim.heroes[0].player, MIDDLE.x - 6, MIDDLE.y - 2);
        place(sim.heroes[1].player, MIDDLE.x + 2, MIDDLE.y);
        sheStarts(sim, boss, "Dive flurry");
        const echo = shadow.echo!;
        // Straight west, at the second
        expect(echo.dirX).toBeCloseTo(-1, 5);
        run(sim, (echo.landTick - sim.tick) / TICKS_PER_SECOND + 0.05);
        expect(shadowHit(sim, 1)).toBeGreaterThan(0);
        expect(shadowHit(sim, 0)).toBe(0);
    });
});
