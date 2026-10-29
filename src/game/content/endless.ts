import { GearDef, StatKey, Stats } from "./types";

// Endless runs: a beaten map's fifteen minutes over and over until the player
// falls. Killing the final boss starts the next round, its waves and bosses
// from the top, everything in it tougher than the round before. The player
// keeps up for a while: weapons and passives level on past their last level,
// and gear comes out of caskets upgraded.

// Each round multiplies enemies' hitpoints, their damage and their bones' XP
// by these (round 3 has about 11x the hitpoints of round 1)
export const ROUND_HP = 3.3;
export const ROUND_DAMAGE = 1.7;
export const ROUND_XP = 4;

// Rounds after the first pick up five minutes into the map's waves and events
// (the start is a warm-up that a build by then doesn't need), so they last ten
// minutes
export const LATER_ROUND_START = 5 * 60;

// Each round after the first brings this many more enemies at once (half as
// many again in round 2, twice as many in round 3), up to what the game can
// take, so the start of a round isn't a handful of chickens
export const ROUND_CROWD = 0.5;

// A weapon level past the last: the weapon does this much more damage, times
// the pick's quality power (a Common pick 15% more, a Rare one 34% more). It
// compounds, so a weapon keeps up with the rounds for a while.
export const OVERLEVEL_DAMAGE = 0.15;

// Gear found in round N comes N - 1 upgrades up; each upgrade adds half the
// piece's stats again (a Slayer helmet +2 has twice its damage and armour)
export const GEAR_UPGRADE = 0.5;

// Stats that stop where a normal run would have them, however far an endless
// run goes: passives for them stop at their max level, and gear upgrades
// leave them be. More would do nothing (weapon speed has a cap) or break the
// game: luck past a point drops caskets and coins from everything, and there's
// only so much speed, projectiles and effect time it can take.
export const CAPPED_STATS: ReadonlySet<StatKey> = new Set<StatKey>([
    "cooldown",
    "moveSpeed",
    "amount",
    "luck",
    "greed",
    "duration",
]);

// What a round multiplies a base value by
export function roundScale(base: number, round: number): number {
    return Math.pow(base, round - 1);
}

// What a round multiplies its waves' crowds and spawn rates by
export function roundCrowd(round: number): number {
    return 1 + ROUND_CROWD * (round - 1);
}

// Endless runs pay this much of what coins are worth in a normal run, and
// their later rounds less again by how much bigger their crowds are, so a long
// run doesn't buy out the shop (more enemies, more caskets and upgraded gear
// to alch would otherwise make round 5 alone worth a few dozen normal runs)
export const ENDLESS_COINS = 0.5;

// What a round of an endless run multiplies the coins it finds by
export function endlessCoinScale(round: number): number {
    return ENDLESS_COINS / roundCrowd(round);
}

// A piece of gear's stats with its upgrades
export function getGearStats(item: GearDef, upgrades: number): Partial<Stats> {
    if (upgrades <= 0) {
        return item.stats;
    }
    const stats: Partial<Stats> = {};
    for (const [key, value] of Object.entries(item.stats) as [StatKey, number][]) {
        stats[key] = CAPPED_STATS.has(key) ? value : value * (1 + upgrades * GEAR_UPGRADE);
    }
    return stats;
}

// "Slayer helmet +2", and weapons and passives past their last level the
// same way
export function upgradedName(name: string, upgrades: number): string {
    return upgrades > 0 ? `${name} +${upgrades}` : name;
}
