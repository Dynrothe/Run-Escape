import { describe, expect, test } from "vitest";

import { getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { JUSTICIAR_ABILITIES, OWLS_GAZE_COOLDOWN } from "../content/justiciarKit";
import { MAP_BY_ID, getMap, getMapCharacter } from "../content/maps";
import { MapDef, emptyStats } from "../content/types";
import { VARROCK_LEVEL_XP } from "../content/varrockHordes";
import { WEAPONS, getWeapon } from "../content/weapons";
import { BURN_SOURCE, Sim, TICKS_PER_SECOND } from "./Sim";
import { makeGrid } from "./world/testGrid";
import { endlessXpForLevel, stretchedXp } from "./xp";

// The Battle for Varrock as a run (content/fun/maps.ts): fires that burn whoever walks into them
// (MapDef.burns), levels that need more experience (MapDef.levelXp), the hordes running from a
// lair's boss as it wakes rather than off the map, the Justiciar's Saradomin sword, and Yama's
// meteor never back before the Owl's gaze is. Its generals are in VarrockGenerals.test.ts, Yama
// in Yama.test.ts and the blessings in blessings.test.ts.

const MAP = getMap("battle_for_varrock");
// With its hordes kept from coming, so nothing gets in the way: its waves, of nobody (with no
// waves at all it would be a map to walk round, where nothing hurts)
const CALM: MapDef = {
    ...MAP,
    id: "battle_for_varrock_calm",
    waves: MAP.waves.map((wave) => ({ ...wave, spawnRate: 0, minAlive: 0, maxAlive: 0 })),
    events: [],
};
MAP_BY_ID.set(CALM.id, CALM);
const HERO = getMapCharacter(MAP)!;
const T = TICKS_PER_SECOND;

const SIZE = 48;
const ROWS = Array.from({ length: SIZE }, () => ".".repeat(SIZE));
const BASE_X = Math.floor(MAP.spawn.x) - SIZE / 2;
const BASE_Y = Math.floor(MAP.spawn.y) - SIZE / 2;

// Open ground round the spawn, a fire on the tile east of it
function createSim(mapId = CALM.id, characterId = HERO): Sim {
    const grid = makeGrid(ROWS, BASE_X, BASE_Y);
    const burnTiles = new Uint8Array(SIZE * SIZE);
    burnTiles[SIZE / 2 + 1 + (SIZE / 2) * SIZE] = 1;
    grid.data.burnTiles = burnTiles;
    return new Sim({
        grid,
        mapId,
        characterId,
        metaStats: emptyStats(),
        seed: 1,
        spawnX: MAP.spawn.x,
        spawnY: MAP.spawn.y,
    });
}

const FIRE = { x: BASE_X + SIZE / 2 + 1.5, y: BASE_Y + SIZE / 2 + 0.5 };

function run(sim: Sim, seconds: number): void {
    for (let i = 0; i < Math.round(seconds * T); i++) {
        sim.step(0, 0);
    }
}

function standAt(sim: Sim, { x, y }: { x: number; y: number }): void {
    sim.player.x = sim.player.prevX = x;
    sim.player.y = sim.player.prevY = y;
}

describe("the Battle for Varrock's fires", () => {
    test("burn whoever walks into one at once, then every so often, through armour", () => {
        const burns = MAP.burns!;
        const sim = createSim();
        expect(sim.grid.burnsAt(Math.floor(FIRE.x), Math.floor(FIRE.y))).toBe(true);
        run(sim, 1);
        const hp = sim.player.hp;
        expect(hp).toBe(sim.player.maxHp);
        standAt(sim, FIRE);
        sim.step(0, 0);
        const burn = Math.max(1, Math.round(sim.player.maxHp * burns.share));
        expect(sim.player.hp).toBe(hp - burn);
        expect(sim.events.some((e) => e.type === "playerHit" && e.enemyId === BURN_SOURCE)).toBe(
            true,
        );
        // Not again until it's been long enough, then again
        run(sim, burns.every - 2 / T);
        expect(sim.player.hp).toBe(hp - burn);
        run(sim, 2 / T);
        expect(sim.player.hp).toBe(hp - 2 * burn);
        // Nothing beside it
        standAt(sim, { x: FIRE.x - 1, y: FIRE.y });
        run(sim, 2);
        expect(sim.player.hp).toBeGreaterThanOrEqual(hp - 2 * burn);
    });

    test("block nothing, and don't hurt the enemies in them", () => {
        const sim = createSim();
        expect(sim.grid.isSolid(Math.floor(FIRE.x), Math.floor(FIRE.y))).toBe(false);
        // Nothing of the hero's to hit it
        sim.weapons.length = 0;
        const imp = sim.spawnEnemy(getEnemy("imp"), "normal", FIRE)!;
        imp.speed = 0;
        run(sim, 2);
        expect(imp.hp).toBe(imp.maxHp);
    });

    test("only burn on a map whose fires do (MapDef.burns)", () => {
        const sim = createSim("lumbridge", "wizard");
        expect(getMap("lumbridge").burns).toBeUndefined();
        run(sim, 1);
        sim.player.hp = sim.player.maxHp;
        standAt(sim, FIRE);
        run(sim, 1);
        expect(sim.player.hp).toBe(sim.player.maxHp);
    });
});

describe("the Battle for Varrock's levels", () => {
    test("come as fast as anywhere at first, then need more and more experience", () => {
        const stretch = MAP.levelXp!;
        expect(stretch).toBe(VARROCK_LEVEL_XP);
        expect(stretch.times).toBeGreaterThan(1);
        const sim = createSim();
        // Each level's blessing taken, so the next can come
        const reach = (xp: number) => {
            sim.xp = xp;
            sim.step(0, 0);
            while (sim.state === "levelUp") {
                sim.choose(0);
            }
        };
        // The first few as an endless run's
        for (let level = 2; level <= stretch.from; level++) {
            reach(endlessXpForLevel(level));
            expect(sim.level).toBe(level);
        }
        // Then what would be the next level elsewhere isn't here
        reach(endlessXpForLevel(stretch.from + 1));
        expect(sim.level).toBe(stretch.from);
        expect(sim.xpForNextLevel).toBe(
            stretchedXp(endlessXpForLevel(stretch.from + 1), stretch.from + 1, stretch),
        );
        // and from level to on, times as much
        const level = stretch.to + 2;
        const xp = Math.ceil(endlessXpForLevel(level) * stretch.times);
        expect(stretchedXp(endlessXpForLevel(level), level, stretch)).toBe(xp);
        reach(xp);
        expect(sim.level).toBe(level);
        expect(sim.xpForThisLevel).toBeLessThanOrEqual(sim.xp);
        expect(sim.xpForNextLevel).toBeGreaterThan(sim.xp);
    });
});

describe("the Justiciar's Saradomin sword", () => {
    test("is the 2h sword's sweep as a Saradomin sword, heavier, his alone", () => {
        expect(getCharacter(HERO).startingWeapon).toBe("saradomin_sword");
        const sword = getWeapon("saradomin_sword");
        const twoHanded = getWeapon("two_handed_sword");
        expect(sword.kind).toBe(twoHanded.kind);
        expect(sword.iconObjId).toBe(11838);
        // Never a level up's pick on any other map
        expect(sword.pickOnly).toBe(true);
        expect(sword.levels.length).toBe(twoHanded.levels.length);
        // knocking back further (half as far again, before every other level's step), and its
        // blows land heavy
        sword.levels.forEach((level, i) => {
            expect(level).toEqual({
                ...twoHanded.levels[i],
                name: "Saradomin sword",
                objId: 11838,
                knockback: expect.any(Number),
            });
            expect(level.knockback).toBeGreaterThan(twoHanded.levels[i].knockback);
        });
        expect(sword.heavy).toBeDefined();
        expect(twoHanded.heavy).toBeUndefined();
        expect(WEAPONS.filter((weapon) => weapon.id === "saradomin_sword")).toHaveLength(1);
    });
});

describe("Yama's meteor and the Owl's gaze", () => {
    test("the meteor never comes round again sooner than the gaze, the one thing that stops it", () => {
        const gaze = JUSTICIAR_ABILITIES.find((ability) => ability.id === "owls_gaze")!;
        expect(gaze.cooldown).toBe(OWLS_GAZE_COOLDOWN);
        // An ultimate: the longest of his buttons by far
        for (const ability of JUSTICIAR_ABILITIES) {
            if (ability !== gaze) {
                expect(ability.cooldown * 2).toBeLessThanOrEqual(gaze.cooldown);
            }
        }
        const critical = getEnemy("yama").boss!.critical!;
        expect(critical.attack).toBe("Meteor");
        for (const every of [critical.every].flat()) {
            expect(every).toBeGreaterThanOrEqual(OWLS_GAZE_COOLDOWN);
        }
    });
});

describe("a lair's boss waking", () => {
    test("sends the hordes running from where it rises, every way, not to the map's edge", () => {
        const xarth = MAP.lairs!.find((lair) => lair.id === "xarth")!;
        const box = xarth.area!;
        const baseX = box.x0 - 30;
        const baseY = box.y0 - 30;
        const sizeX = box.x1 - box.x0 + 61;
        const sizeY = box.y1 - box.y0 + 61;
        const rows = Array.from({ length: sizeY }, () => ".".repeat(sizeX));
        const sim = new Sim({
            grid: makeGrid(rows, baseX, baseY),
            mapId: CALM.id,
            characterId: HERO,
            metaStats: emptyStats(),
            seed: 1,
            // Just south of the pad
            spawnX: xarth.at.x,
            spawnY: box.y0 - 2.5,
        });
        run(sim, 0.5);
        const { at } = xarth;
        const spots = [
            { x: at.x, y: at.y + 18 },
            { x: at.x, y: at.y - 18 },
            { x: at.x + 18, y: at.y },
            { x: at.x - 18, y: at.y },
            { x: at.x + 6, y: at.y + 6 },
        ];
        const imps = spots.map((spot) => sim.spawnEnemy(getEnemy("imp"), "normal", spot)!);
        standAt(sim, xarth.start);
        sim.step(0, 0);
        for (const imp of imps) {
            const leaving = imp.leaving!;
            expect(leaving).toBeDefined();
            const away = Math.hypot(imp.x - at.x, imp.y - at.y);
            const speed = Math.hypot(leaving.vx, leaving.vy);
            expect(speed).toBeGreaterThan(0);
            // Straight away from it
            expect((leaving.vx * (imp.x - at.x) + leaving.vy * (imp.y - at.y)) / speed).toBeCloseTo(
                away,
                3,
            );
        }
        // Gone before the boss is up, a good way off and out of sight
        run(sim, getEnemy(xarth.enemyId).boss!.intro!.seconds);
        for (const imp of imps) {
            expect(sim.enemies.includes(imp) && !imp.dead).toBe(false);
        }
    });
});
