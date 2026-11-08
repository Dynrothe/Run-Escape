import { describe, expect, it } from "vitest";

import { SARADOMIN_BLESSINGS, getBlessing } from "../content/blessings";
import { getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { MAP_BY_ID, getMap, getMapCharacter } from "../content/maps";
import { RANDOM_EVENTS, givesItems } from "../content/randomEvents";
import { MapDef, RandomEventDef, WeaponDef, emptyStats } from "../content/types";
import { getWeapon } from "../content/weapons";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { UpgradeChoice } from "./Upgrades";
import { Enemy } from "./entities";
import { syncHash } from "./lockstep";
import { makeGrid } from "./world/testGrid";
import { endlessXpForLevel, runXpForLevel, stretchedXp } from "./xp";

// The Battle for Varrock's blessings of Saradomin (MapDef.blessings, content/blessings.ts): no
// items, and three blessings to choose from on each level up. On the map with its hordes taken
// out, so nothing gets in the way.

const MAP = getMap("battle_for_varrock");
const CALM: MapDef = { ...MAP, id: "battle_for_varrock_blessed", waves: [], events: [] };
MAP_BY_ID.set(CALM.id, CALM);
const SIZE = 48;
const ROWS = Array.from({ length: SIZE }, () => ".".repeat(SIZE));
const BASE_X = Math.floor(MAP.spawn.x) - SIZE / 2;
const BASE_Y = Math.floor(MAP.spawn.y) - SIZE / 2;
const HERO = getMapCharacter(MAP)!;
const KIT = getCharacter(HERO).abilities!;
const slot = (id: string) => KIT.findIndex((ability) => ability.id === id);
const SWORD = getWeapon(getCharacter(HERO).startingWeapon);

function createSim(seed = 1, party = 1): Sim {
    return new Sim({
        grid: makeGrid(ROWS, BASE_X, BASE_Y),
        mapId: CALM.id,
        characterId: HERO,
        metaStats: emptyStats(),
        seed,
        spawnX: MAP.spawn.x,
        spawnY: MAP.spawn.y,
        ...(party > 1 && {
            party: Array.from({ length: party }, (_, i) => ({
                name: `hero ${i}`,
                characterId: HERO,
                metaStats: emptyStats(),
            })),
        }),
    });
}

// Up to a level, as experience picked up would bring it: the map's own table, an endless run's
// stretched by its levelXp. Its blessings wait to be chosen.
function reach(sim: Sim, level: number): void {
    sim.xp = stretchedXp(endlessXpForLevel(level), level, MAP.levelXp);
    sim.step(0, 0);
}

// Takes every level up waiting, each hero's: what pick says of what's on offer, or the first
function chooseAll(sim: Sim, pick: (choices: UpgradeChoice[]) => number = () => 0): void {
    for (let i = 0; i < 1000 && sim.state === "levelUp"; i++) {
        for (const hero of sim.heroes) {
            sim.as(hero.index, () => {
                if (sim.isChoosing()) {
                    sim.choose(pick(sim.choices));
                }
            });
        }
    }
}

// Up to a level, with each of its blessings chosen
function levelTo(sim: Sim, level: number, pick?: (choices: UpgradeChoice[]) => number): void {
    reach(sim, level);
    chooseAll(sim, pick);
}

// The blessing on offer with this id
const offered = (id: string) => (choices: UpgradeChoice[]) =>
    choices.findIndex((choice) => choice.kind === "blessing" && choice.blessingId === id);

const ids = (choices: UpgradeChoice[]) =>
    choices.map((choice) => (choice.kind === "blessing" ? choice.blessingId : choice.kind));

function run(sim: Sim, seconds: number): void {
    for (let i = 0; i < Math.round(seconds * TICKS_PER_SECOND); i++) {
        sim.step(0, 0);
    }
}

const count = (sim: Sim) => sim.blessings.reduce((total, had) => total + had.count, 0);

// Private methods, as a kill would call them
type Hooks = {
    dropLoot(enemy: Enemy): void;
    rollRandomEvent(): RandomEventDef | undefined;
    updateStats(): void;
    weaponSpeed(def: WeaponDef): number;
    kitCasts: unknown[];
};
const hooks = (sim: Sim) => sim as unknown as Hooks;

// Blessings had (hero 0's), with the stats they give
function bless(sim: Sim, ...had: { id: string; count: number }[]): void {
    sim.heroes[0].blessings.push(...had);
    hooks(sim).updateStats();
}

// Every blessing had as often as it goes, but these
function allBut(sim: Sim, ...left: string[]): void {
    sim.heroes[0].blessings.push(
        ...SARADOMIN_BLESSINGS.pool
            .filter((blessing) => !left.includes(blessing.id))
            .map((blessing) => ({ id: blessing.id, count: blessing.max })),
    );
}

describe("the Battle for Varrock's blessings of Saradomin", () => {
    it("offers three blessings to choose from on a level up, in place of picks", () => {
        const sim = createSim();
        reach(sim, 2);
        expect(sim.level).toBe(2);
        expect(sim.state).toBe("levelUp");
        const choices = sim.choices;
        expect(choices).toHaveLength(3);
        for (const choice of choices) {
            expect(choice).toMatchObject({ kind: "blessing", count: 1 });
        }
        const on = ids(choices);
        expect(new Set(on).size).toBe(3);
        expect(on).not.toContain(SARADOMIN_BLESSINGS.fallback.id);
        sim.choose(1);
        expect(sim.state).toBe("playing");
        expect(sim.blessings).toEqual([{ id: on[1], count: 1 }]);
        // One to choose for each level, when several come at once
        reach(sim, 5);
        expect(sim.heroes[0].pendingLevelUps).toBe(3);
        chooseAll(sim);
        expect(sim.state).toBe("playing");
        expect(count(sim)).toBe(4);
        expect(sim.passives).toEqual([]);
        // The sword, and a weapon only as a blessing brings it
        const given = SARADOMIN_BLESSINGS.pool.map((blessing) => blessing.weapon);
        expect(sim.weapons[0].def.id).toBe(SWORD.id);
        for (const weapon of sim.weapons.slice(1)) {
            expect(given).toContain(weapon.def.id);
        }
    });

    it("never offers one twice at once, or one had its most", () => {
        const sim = createSim(7);
        const most = (id: string) => getBlessing(SARADOMIN_BLESSINGS, id).max;
        sim.heroes[0].blessings.push(
            { id: "crossbow", count: most("crossbow") },
            { id: "strength", count: most("strength") },
        );
        for (let level = 2; level < 30; level++) {
            reach(sim, level);
            const on = ids(sim.choices);
            expect(new Set(on).size, on.join()).toBe(on.length);
            expect(on).not.toContain("crossbow");
            expect(on).not.toContain("strength");
            for (const choice of sim.choices) {
                if (choice.kind === "blessing") {
                    expect(choice.count).toBeLessThanOrEqual(most(choice.blessingId));
                }
            }
            sim.choose(Math.min(level % 3, sim.choices.length - 1));
        }
    });

    it("brings Saradomin Strike with the Saradomin staff, and a level of it each time after", () => {
        const sim = createSim();
        allBut(sim, "staff");
        // The staff's the one left, and a tear beside it
        reach(sim, 2);
        expect(ids(sim.choices)).toEqual(["staff", SARADOMIN_BLESSINGS.fallback.id]);
        chooseAll(sim, offered("staff"));
        const strike = () => sim.weapons.find((w) => w.def.id === "saradomin_strike");
        expect(strike()?.level).toBe(1);
        levelTo(sim, 4, offered("staff"));
        expect(strike()?.level).toBe(3);
        expect(sim.weapons).toHaveLength(2);
    });

    it("adds what each blessing gives to the hero's stats", () => {
        const sim = createSim();
        const before = { ...sim.stats };
        sim.heroes[0].blessings.push({ id: "strength", count: 2 }, { id: "ward", count: 1 });
        // A blessing taken brings the stats up to date (whichever it is)
        levelTo(sim, 2);
        const strength = getBlessing(SARADOMIN_BLESSINGS, "strength").stats!.might!;
        const had = (id: string) => sim.blessings.find((b) => b.id === id)?.count ?? 0;
        expect(sim.stats.might).toBeCloseTo(before.might + strength * had("strength"));
        expect(sim.stats.armor).toBeCloseTo(before.armor + had("ward"));
    });

    it("never blesses past a blessing's most, and then a tear, as often as it comes", () => {
        const sim = createSim();
        const weapon = sim.weapons[0];
        const from = weapon.level;
        const total = SARADOMIN_BLESSINGS.pool.reduce((sum, blessing) => sum + blessing.max, 0);
        levelTo(sim, total + 6);
        for (const { id, count } of sim.blessings) {
            expect(count, id).toBeLessThanOrEqual(getBlessing(SARADOMIN_BLESSINGS, id).max);
        }
        // Every one of them as often as it goes, and the rest of the levels tears, offered alone
        expect(sim.level).toBeGreaterThan(total + 1);
        const pool = sim.blessings.filter((b) => b.id !== "tear");
        expect(pool.reduce((sum, b) => sum + b.count, 0)).toBe(total);
        expect(sim.blessings.find((b) => b.id === "tear")?.count).toBe(sim.level - 1 - total);
        reach(sim, total + 7);
        expect(ids(sim.choices)).toEqual(["tear"]);
        // The blessed blade's levels on the sword, as far as it goes, and each weapon a blessing
        // brings to its last
        expect(weapon.level).toBe(Math.min(from + 7, getWeapon(weapon.def.id).levels.length));
        for (const blessing of SARADOMIN_BLESSINGS.pool.filter((b) => b.weapon)) {
            const given = sim.weapons.find((w) => w.def.id === blessing.weapon)!;
            expect(given.level).toBe(getWeapon(blessing.weapon!).levels.length);
            expect(blessing.max, blessing.id).toBe(given.level);
        }
    });

    it("heals with Saradomin brew and its tears", () => {
        const sim = createSim();
        allBut(sim, "brew");
        sim.player.hp = 1;
        levelTo(sim, 2, offered("brew"));
        expect(sim.blessings.find((b) => b.id === "brew")?.count).toBe(1);
        expect(sim.player.hp).toBeGreaterThan(sim.player.maxHp * 0.3);
        sim.player.hp = 1;
        levelTo(sim, 3, offered("tear"));
        expect(sim.player.hp).toBeGreaterThan(sim.player.maxHp * 0.45);
    });

    it("makes the hero's own buttons longer, bigger and sooner", () => {
        const sim = createSim();
        sim.heroes[0].blessings.push(
            { id: "zeal", count: 2 },
            { id: "holy_water", count: 1 },
            { id: "will", count: 1 },
        );
        const lunge = KIT[slot("lunge")];
        const blessed = sim.kitAbility(slot("lunge"))!;
        expect(blessed.ability.length).toBeCloseTo(lunge.length + 3);
        expect(blessed.ability.damage).toBeCloseTo(lunge.damage * 2);
        expect(blessed.ability.cooldown).toBeCloseTo(lunge.cooldown * 0.92);
        expect(blessed.by.map((b) => b.id)).toEqual(["zeal", "will"]);
        const ice = KIT[slot("ice_barrage")];
        expect(sim.kitAbility(slot("ice_barrage"))!.ability.size).toBe(ice.size! + 2);
        // Untouched but for the will
        const gaze = sim.kitAbility(slot("owls_gaze"))!;
        expect(gaze.ability.length).toBe(KIT[slot("owls_gaze")].length);
        // Its cooldown as blessed
        run(sim, 0.2);
        expect(sim.useAbility(slot("lunge"))).toBe(true);
        expect(sim.kitSecondsLeft(slot("lunge"))).toBeCloseTo(lunge.cooldown * 0.92, 1);
    });

    it("fans the shock wave out with Saradomin's crozier", () => {
        const sim = createSim();
        run(sim, 0.2);
        expect(sim.useAbility(slot("shock_wave"))).toBe(true);
        expect(hooks(sim).kitCasts).toHaveLength(1);
        const blessed = createSim();
        blessed.heroes[0].blessings.push({ id: "crozier", count: 2 });
        run(blessed, 0.2);
        expect(blessed.useAbility(slot("shock_wave"))).toBe(true);
        expect(hooks(blessed).kitCasts).toHaveLength(5);
    });

    it("drops no caskets or power-ups, from elites or bosses either", () => {
        const sim = createSim();
        for (let i = 0; i < 200; i++) {
            const elite = sim.spawnEnemy(getEnemy("lesser_demon"), "elite", {
                x: MAP.spawn.x + 3,
                y: MAP.spawn.y,
            })!;
            hooks(sim).dropLoot(elite);
            const boss = sim.spawnEnemy(getEnemy("black_demon"), "boss", {
                x: MAP.spawn.x - 3,
                y: MAP.spawn.y,
            })!;
            hooks(sim).dropLoot(boss);
            sim.enemies = [];
        }
        const kinds = new Set(sim.pickups.map((pickup) => pickup.kind));
        expect(kinds.has("bones")).toBe(true);
        expect(kinds.has("casket")).toBe(false);
        expect(kinds.has("powerUp")).toBe(false);
    });

    it("has no visitor who gives an item", () => {
        const kinds = RANDOM_EVENTS.filter(givesItems).map((event) => event.effect.kind);
        expect(kinds.sort()).toEqual(["casket", "quiz", "shop"]);
        const sim = createSim();
        const met = new Set<string>();
        for (let i = 0; i < 300; i++) {
            met.add(hooks(sim).rollRandomEvent()!.id);
        }
        expect(met.size).toBeGreaterThan(2);
        for (const id of met) {
            expect(givesItems(RANDOM_EVENTS.find((event) => event.id === id)!), id).toBe(false);
        }
    });

    it("offers each co-op hero their own, the same on every copy", () => {
        const a = createSim(3, 2);
        const b = createSim(3, 2);
        for (const sim of [a, b]) {
            sim.setInput(1, 1, 0);
            reach(sim, 2);
            // Each chooses from their own three
            for (const hero of sim.heroes) {
                expect(sim.as(hero.index, () => sim.choices)).toHaveLength(3);
            }
            chooseAll(sim);
            levelTo(sim, 8);
        }
        expect(a.heroes.map((hero) => hero.blessings)).toEqual(
            b.heroes.map((hero) => hero.blessings),
        );
        for (const hero of a.heroes) {
            expect(hero.blessings.reduce((total, had) => total + had.count, 0)).toBe(7);
            expect(hero.pendingLevelUps).toBe(0);
        }
        expect(syncHash(a)).toBe(syncHash(b));
    });

    it("leaves every other map's level ups as they were", () => {
        const lumbridge = getMap("lumbridge");
        expect(lumbridge.blessings).toBeUndefined();
        const sim = new Sim({
            grid: makeGrid(ROWS, BASE_X, BASE_Y),
            mapId: lumbridge.id,
            characterId: "wizard",
            metaStats: emptyStats(),
            seed: 1,
            spawnX: MAP.spawn.x,
            spawnY: MAP.spawn.y,
        });
        sim.xp = runXpForLevel(2);
        sim.step(0, 0);
        expect(sim.state).toBe("levelUp");
        expect(sim.choices.some((choice) => choice.kind === "blessing")).toBe(false);
        expect(sim.blessings).toEqual([]);
    });
});

describe("the Saradomin sword's heavy blows", () => {
    const heavy = SWORD.heavy!;

    // A demon in reach of the sword that won't die of it, and a swing at it
    function swingAt(sim: Sim): Enemy {
        const enemy = sim.spawnEnemy(getEnemy("lesser_demon"), "normal", {
            x: sim.player.x + 1.5,
            y: sim.player.y,
        })!;
        enemy.hp = 1e6;
        sim.takeEvents();
        for (let i = 0; i < 3 * TICKS_PER_SECOND && !enemy.staggered; i++) {
            sim.step(0, 0);
        }
        return enemy;
    }

    it("staggers what it hits, with his impact on it and the camera shaking", () => {
        const sim = createSim();
        const enemy = swingAt(sim);
        const ticks = Math.round(heavy.stagger * TICKS_PER_SECOND);
        // This tick's taken off already, if enemies moved after the swing
        expect(enemy.staggered).toBeGreaterThanOrEqual(ticks - 1);
        expect(enemy.staggered).toBeLessThanOrEqual(ticks);
        const shakes = sim.takeEvents().filter((event) => event.type === "bossImpact");
        expect(shakes).toEqual([expect.objectContaining({ shake: heavy.shake })]);
        expect(
            sim.effects.some(
                (effect) => effect.spotAnim === heavy.hit.spotAnim && effect.enemyUid === enemy.uid,
            ),
        ).toBe(true);
    });

    it("holds a staggered enemy where the knockback leaves it, while the rest walk on", () => {
        const sim = createSim();
        sim.weapons = [];
        const at = (dx: number) => ({ x: sim.player.x + dx, y: sim.player.y + 6 });
        const held = sim.spawnEnemy(getEnemy("lesser_demon"), "normal", at(-2))!;
        const free = sim.spawnEnemy(getEnemy("lesser_demon"), "normal", at(2))!;
        held.staggered = 30;
        const from = { held: { x: held.x, y: held.y }, free: { x: free.x, y: free.y } };
        run(sim, 0.5);
        expect(held.staggered).toBeLessThan(30);
        expect(Math.hypot(held.x - from.held.x, held.y - from.held.y)).toBeLessThan(0.01);
        expect(Math.hypot(free.x - from.free.x, free.y - from.free.y)).toBeGreaterThan(0.3);
    });

    it("staggers longer with the Saradomin platebody", () => {
        const plain = swingAt(createSim()).staggered!;
        const sim = createSim();
        bless(sim, { id: "platebody", count: 3 });
        expect(sim.stats.meleeKnockback).toBeCloseTo(1.2);
        expect(swingAt(sim).staggered).toBeGreaterThan(plain * 2);
    });

    it("swings faster with Saradomin bracers, a melee weapon only", () => {
        const plain = createSim();
        const fast = createSim();
        bless(fast, { id: "bracers", count: 4 });
        expect(fast.stats.meleeSpeed).toBeCloseTo(0.48);
        const crossbow = getWeapon("armadyl_crossbow");
        expect(hooks(fast).weaponSpeed(SWORD)).toBeCloseTo(0.48);
        expect(hooks(fast).weaponSpeed(crossbow)).toBe(hooks(plain).weaponSpeed(crossbow));
        // The wait after a swing
        swingAt(plain);
        swingAt(fast);
        expect(fast.weapons[0].cooldown).toBeLessThan(plain.weapons[0].cooldown * 0.6);
    });
});
