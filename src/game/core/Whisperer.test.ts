import { getEnemy } from "../content/enemies";
import { getMap } from "../content/maps";
import { TROPHY_BY_ID } from "../content/trophies";
import { emptyStats } from "../content/types";
import {
    AWAKENED_WHISPERER_ID,
    WHISPERER_BLACKSTONE,
    WHISPERER_REALM,
    WHISPERER_SOUL_ID,
} from "../content/whisperer";
import { Sim, SimOptions, TICKS_PER_SECOND } from "./Sim";
import type { Enemy } from "./entities";
import { RealmRule } from "./rules/RealmRule";
import { makeGrid } from "./world/testGrid";

// The Awakened Whisperer (content/whisperer.ts) and the Wisp, the second fighting pet (PetDef.power
// call). The map's own grid needs the cache, so the fight plays on an open field round her island;
// the rule and the fight read only the grid they're given.

const MAP = getMap("awakened_whisperer");
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
        characterId: "shadow_walker",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: MAP.spawn.x,
        spawnY: MAP.spawn.y,
        ...options,
    });
}

// Steps on, the hero kept whole and her attacks held back, so only what's tested happens
function steps(sim: Sim, seconds: number, calm = true): void {
    for (let i = 0; i < seconds * TICKS_PER_SECOND && sim.state === "playing"; i++) {
        sim.player.hp = sim.player.maxHp;
        const boss = whisperer(sim);
        if (calm && boss?.bossState) {
            boss.attackCooldown = Math.max(boss.attackCooldown, 10);
        }
        sim.step(0, 0);
    }
}

function whisperer(sim: Sim): Enemy | undefined {
    return sim.enemies.find((e) => e.def.id === AWAKENED_WHISPERER_ID && !e.dead);
}

// Past her rising, with no weapons, beside her
function ready(): { sim: Sim; boss: Enemy; realm: RealmRule } {
    const sim = createSim();
    steps(sim, 8);
    for (const hero of sim.heroes) {
        hero.weapons = [];
    }
    const boss = whisperer(sim)!;
    sim.player.x = boss.x + 2;
    sim.player.y = boss.y;
    return { sim, boss, realm: sim.realm! };
}

function press(sim: Sim): void {
    expect(sim.useAbility()).toBe(true);
    sim.step(0, 0);
}

describe("The Awakened Whisperer", () => {
    test("is the Shadow walker's fight, opened by the Lassar Undercity, with the Wisp for its win", () => {
        expect(MAP.fight).toMatchObject({
            requires: "lassar_undercity",
            character: "shadow_walker",
        });
        expect(MAP.fight?.ability).toBe(WHISPERER_BLACKSTONE);
        expect(MAP.rule).toBe(WHISPERER_REALM);
        expect(TROPHY_BY_ID.get("wisp")?.from).toMatchObject({
            enemyId: AWAKENED_WHISPERER_ID,
            chance: 1,
        });
    });

    test("Blackstone turns the party, she can't be hurt in the realm, and coming out shocks her", () => {
        const { sim, boss, realm } = ready();
        press(sim);
        expect(realm.layer).toBe(1);
        // Still there, but out of reach
        expect(whisperer(sim)).toBe(boss);
        const hp = boss.hp;
        sim.damageEnemy(boss, 50, 0, sim.player.x, sim.player.y);
        expect(boss.hp).toBe(hp);
        // Not again till it's ready
        expect(sim.useAbility()).toBe(false);
        steps(sim, WHISPERER_BLACKSTONE.cooldown);
        sim.player.x = boss.x + 2;
        sim.player.y = boss.y;
        press(sim);
        expect(realm.layer).toBe(0);
        expect(boss.hp).toBeLessThan(hp);
        expect(sim.damageBySource["ability:blackstone"]).toBeGreaterThan(0);
    });

    test("her sanity runs out in the realm, and throws you back hurt", () => {
        const { sim, realm } = ready();
        press(sim);
        const seconds = WHISPERER_REALM.sanity.max / WHISPERER_REALM.sanity.drain;
        for (let i = 0; i < (seconds + 1) * TICKS_PER_SECOND && realm.layer === 1; i++) {
            whisperer(sim)!.attackCooldown = 10;
            sim.step(0, 0);
        }
        expect(realm.layer).toBe(0);
        expect(sim.player.hp).toBeLessThan(sim.player.maxHp);
    });

    test("her siphon's souls go between the worlds, and are caught only in the realm", () => {
        const { sim, boss, realm } = ready();
        const soul = sim.spawnEnemy(getEnemy(WHISPERER_SOUL_ID), "normal", {
            x: sim.player.x,
            y: sim.player.y,
        })!;
        boss.hp = boss.maxHp * 0.9;
        sim.step(0, 0);
        expect(soul.dead).toBe(false);
        press(sim);
        expect(realm.layer).toBe(1);
        expect(sim.enemies).toContain(soul);
        soul.x = sim.player.x;
        soul.y = sim.player.y;
        sim.step(0, 0);
        expect(soul.dead).toBe(true);
    });

    test("a soul that reaches her heals her, and a siphon caught whole breaks her", () => {
        const { sim, boss } = ready();
        boss.hp = boss.maxHp * 0.9;
        const hurt = boss.hp;
        sim.player.x = boss.x + 8;
        const healer = sim.spawnEnemy(getEnemy(WHISPERER_SOUL_ID), "normal", {
            x: boss.x + 2,
            y: boss.y,
        })!;
        steps(sim, 3);
        expect(healer.dead).toBe(true);
        expect(boss.hp).toBeGreaterThan(hurt);
        // One lost: the next lot caught whole breaks her all the same
        expect(sim.isStunned(boss)).toBe(false);
        press(sim);
        const souls = [0, 1].map(
            (i) =>
                sim.spawnEnemy(getEnemy(WHISPERER_SOUL_ID), "normal", {
                    x: boss.x - 6,
                    y: boss.y + 3 * i,
                })!,
        );
        for (const soul of souls) {
            soul.x = sim.player.x;
            soul.y = sim.player.y;
            sim.step(0, 0);
            expect(soul.dead).toBe(true);
        }
        expect(sim.isStunned(boss)).toBe(true);
        expect(sim.isExposed(boss)).toBe(true);
    });

    test("her screech finds no one in the realm, and her guard's down", () => {
        const { sim, boss, realm } = ready();
        const screech = boss.def.boss!.attacks.find((a) => a.name === "Screech")!;
        expect(screech.world).toBe(0);
        // Begun as she would in the city, then left behind
        (sim as unknown as { startBossAttack(e: Enemy, a: unknown): void }).startBossAttack(
            boss,
            screech,
        );
        press(sim);
        expect(realm.layer).toBe(1);
        const hp = sim.player.hp;
        for (let i = 0; i < (screech.windup + 0.5) * TICKS_PER_SECOND; i++) {
            sim.step(0, 0);
        }
        expect(sim.player.hp).toBe(hp);
        expect(sim.isExposed(boss)).toBe(true);
    });
});

describe("The Wisp", () => {
    function lassar(pet?: string): Sim {
        return new Sim({
            grid: makeGrid(field(), BASE_X, BASE_Y),
            mapId: "lassar_undercity",
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 3,
            spawnX: MAP.spawn.x,
            spawnY: MAP.spawn.y,
            pet,
        });
    }

    test("calls the bones and coins near you every 10 s", () => {
        const sim = lassar("wisp");
        const { x, y } = sim.player;
        sim.dropPickup("bones", x + 6, y, 1);
        sim.dropPickup("coins", x - 6, y + 2, 1);
        // Too far
        sim.dropPickup("coins", x + 12, y, 1);
        const far = sim.pickups[sim.pickups.length - 1];
        for (let i = 0; i < 9 * TICKS_PER_SECOND; i++) {
            sim.step(0, 0);
        }
        expect(sim.pickups.filter((p) => p.attracted)).toHaveLength(0);
        for (let i = 0; i < 2 * TICKS_PER_SECOND; i++) {
            sim.step(0, 0);
        }
        expect(sim.pickups.some((p) => p.kind === "bones")).toBe(false);
        expect(far.attracted).toBe(false);
    });

    test("once a minute that you're hurt, sends a soul that heals you", () => {
        const sim = lassar("wisp");
        for (const hero of sim.heroes) {
            hero.weapons = [];
        }
        const heal = Math.round(sim.player.maxHp * 0.05);
        sim.player.invulnerable = 1e9;
        for (let i = 0; i < 59 * TICKS_PER_SECOND; i++) {
            sim.player.hp = sim.player.maxHp - 10;
            sim.step(0, 0);
        }
        expect(sim.player.hp).toBe(sim.player.maxHp - 10);
        for (let i = 0; i < 2.5 * TICKS_PER_SECOND; i++) {
            sim.step(0, 0);
        }
        expect(sim.player.hp).toBe(sim.player.maxHp - 10 + heal);
    });

    test("does nothing in a boss fight", () => {
        const fight = createSim({ pet: "wisp" });
        for (let i = 0; i < 70 * TICKS_PER_SECOND && fight.state === "playing"; i++) {
            fight.player.hp = fight.player.maxHp - 10;
            fight.step(0, 0);
        }
        expect(fight.healed).toBe(0);
    });
});
