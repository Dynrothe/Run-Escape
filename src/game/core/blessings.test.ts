import { describe, expect, it } from "vitest";

import { SARADOMIN_BLESSINGS, getBlessing } from "../content/blessings";
import { getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { MAP_BY_ID, getMap, getMapCharacter } from "../content/maps";
import { RANDOM_EVENTS, givesItems } from "../content/randomEvents";
import { MapDef, RandomEventDef, emptyStats } from "../content/types";
import { getWeapon } from "../content/weapons";
import { Sim, TICKS_PER_SECOND } from "./Sim";
import { Enemy } from "./entities";
import { syncHash } from "./lockstep";
import { makeGrid } from "./world/testGrid";
import { runXpForLevel } from "./xp";

// The Battle for Varrock's blessings of Saradomin (MapDef.blessings, content/blessings.ts): no
// items, and a blessing at random on each level up, at once. On the map with its hordes taken
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

// Up to a level, as experience picked up would bring it
function levelTo(sim: Sim, level: number): void {
    sim.xp = runXpForLevel(level);
    sim.step(0, 0);
}

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
    kitCasts: unknown[];
};
const hooks = (sim: Sim) => sim as unknown as Hooks;

describe("the Battle for Varrock's blessings of Saradomin", () => {
    it("blesses a level up at once, with no level up screen and no picks", () => {
        const sim = createSim();
        levelTo(sim, 2);
        expect(sim.level).toBe(2);
        expect(sim.state).toBe("playing");
        expect(sim.heroes[0].pendingLevelUps).toBe(0);
        expect(count(sim)).toBe(1);
        // One for each level, when several come at once
        levelTo(sim, 5);
        expect(sim.state).toBe("playing");
        expect(count(sim)).toBe(4);
        expect(sim.passives).toEqual([]);
        // The sword, and a weapon only as a blessing brings it
        const given = SARADOMIN_BLESSINGS.pool.map((blessing) => blessing.weapon);
        expect(sim.weapons[0].def.id).toBe(getCharacter(HERO).startingWeapon);
        for (const weapon of sim.weapons.slice(1)) {
            expect(given).toContain(weapon.def.id);
        }
    });

    it("brings Saradomin Strike with the Saradomin staff, and a level of it each time after", () => {
        const sim = createSim();
        // Every other blessing had already, so the staff's the one left
        sim.heroes[0].blessings.push(
            ...SARADOMIN_BLESSINGS.pool
                .filter((blessing) => blessing.id !== "staff")
                .map((blessing) => ({ id: blessing.id, count: blessing.max })),
        );
        levelTo(sim, 2);
        const strike = () => sim.weapons.find((w) => w.def.id === "saradomin_strike");
        expect(strike()?.level).toBe(1);
        levelTo(sim, 4);
        expect(strike()?.level).toBe(3);
        expect(sim.weapons).toHaveLength(2);
    });

    it("adds what each blessing gives to the hero's stats", () => {
        const sim = createSim();
        const before = { ...sim.stats };
        sim.heroes[0].blessings.push({ id: "strength", count: 2 }, { id: "ward", count: 1 });
        // A level up's blessing brings the stats up to date (whatever it is)
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
        // Every one of them as often as it goes, and the rest of the levels tears
        expect(sim.level).toBeGreaterThan(total + 1);
        const pool = sim.blessings.filter((b) => b.id !== "tear");
        expect(pool.reduce((sum, b) => sum + b.count, 0)).toBe(total);
        expect(sim.blessings.find((b) => b.id === "tear")?.count).toBe(sim.level - 1 - total);
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
        sim.heroes[0].blessings.push(
            ...SARADOMIN_BLESSINGS.pool
                .filter((blessing) => blessing.id !== "brew")
                .map((blessing) => ({ id: blessing.id, count: blessing.max })),
        );
        sim.player.hp = 1;
        levelTo(sim, 2);
        expect(sim.blessings.find((b) => b.id === "brew")?.count).toBe(1);
        expect(sim.player.hp).toBeGreaterThan(sim.player.maxHp * 0.3);
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

    it("blesses each co-op hero on their own, the same on every copy", () => {
        const a = createSim(3, 2);
        const b = createSim(3, 2);
        for (const sim of [a, b]) {
            sim.setInput(1, 1, 0);
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
        expect(sim.blessings).toEqual([]);
    });
});
