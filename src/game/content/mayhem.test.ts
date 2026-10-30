import { CAPPED_STATS } from "./endless";
import { ENEMIES, getEnemy } from "./enemies";
import { MAPS } from "./maps";
import {
    MAYHEM_BOSSES,
    MAYHEM_ENEMIES,
    MAYHEM_EVENTS,
    MAYHEM_STAT_CAPS,
    MODIFIERS,
    TOP_TIER,
    getEnemyTier,
    getMayhemExclusion,
    getTierChances,
    getTierWeights,
    pickMayhemMap,
} from "./mayhem";

describe("Mayhem's enemies", () => {
    test("everything's in unless it can't work away from its own map", () => {
        for (const def of ENEMIES) {
            const excluded = getMayhemExclusion(def) !== undefined;
            const pool = def.boss ? MAYHEM_BOSSES : MAYHEM_ENEMIES;
            expect(pool.includes(def), def.id).toBe(!excluded);
        }
    });

    test("what's left out says why", () => {
        // Portals and Zulrah stay where their map puts them
        expect(getMayhemExclusion(getEnemy("purple_portal"))).toMatch(/never moves/);
        expect(getMayhemExclusion(getEnemy("zulrah"))).toMatch(/never moves/);
        expect(getMayhemExclusion(getEnemy("catapult_crew"))).toMatch(/never moves/);
        // The flag carrier only runs away
        expect(getMayhemExclusion(getEnemy("flag_carrier"))).toMatch(/runs from you/);
        // Later forms come from the boss before them
        expect(getMayhemExclusion(getEnemy("nex_shadow"))).toMatch(/later form/);
        expect(getMayhemExclusion(getEnemy("damis_risen"))).toMatch(/later form/);
        // A boss's own helpers and elites only come with it
        expect(getMayhemExclusion(getEnemy("yt_hurkot"))).toMatch(/only turns up/);
    });

    test("no two left-out rules leave out a normal map's main enemies", () => {
        expect(MAYHEM_BOSSES.length).toBeGreaterThan(50);
        expect(MAYHEM_ENEMIES.length).toBeGreaterThan(150);
    });

    test("every tier has enemies, and the top ones take over", () => {
        for (let tier = 0; tier <= TOP_TIER; tier++) {
            expect(MAYHEM_ENEMIES.some((def) => getEnemyTier(def) === tier)).toBe(true);
        }
        expect(getTierWeights(0)[0]).toBe(1);
        expect(getTierWeights(0)[TOP_TIER]).toBe(0);
        expect(getTierWeights(3600)[TOP_TIER]).toBe(1);
        expect(getTierWeights(3600)[0]).toBe(0);
    });
});

describe("Mayhem's rules", () => {
    test("any campaign map can come up, whatever's unlocked", () => {
        expect(pickMayhemMap(() => 0)).toBe(MAPS[0]);
        expect(pickMayhemMap(() => 0.999)).toBe(MAPS[MAPS.length - 1]);
    });

    test("Modifiers have unique ids, and there are enough of every tier", () => {
        expect(new Set(MODIFIERS.map((m) => m.id)).size).toBe(MODIFIERS.length);
        for (const tier of ["silver", "gold", "prismatic"]) {
            expect(MODIFIERS.filter((m) => m.tier === tier).length).toBeGreaterThanOrEqual(6);
        }
    });

    test("the later the pick, the wilder it gets", () => {
        expect(getTierChances(5).prismatic).toBeGreaterThan(getTierChances(0).prismatic);
    });

    test("events last 15 to 30 seconds", () => {
        for (const event of MAYHEM_EVENTS) {
            expect(event.seconds).toBeGreaterThanOrEqual(15);
            expect(event.seconds).toBeLessThanOrEqual(30);
        }
    });

    test("what's capped in endless runs is capped here too", () => {
        // Weapon speed has its own cap, in the sim
        for (const stat of CAPPED_STATS) {
            if (stat !== "cooldown") {
                expect(MAYHEM_STAT_CAPS[stat], stat).toBeDefined();
            }
        }
    });
});
