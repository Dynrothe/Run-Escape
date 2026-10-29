// The OSRS experience table: the XP needed for each level, from level 1.
const MAX_LEVEL = 126;

const XP_FOR_LEVEL: number[] = (() => {
    const table = [0, 0];
    let points = 0;
    for (let level = 1; level < MAX_LEVEL; level++) {
        points += Math.floor(level + 300 * Math.pow(2, level / 7));
        table.push(Math.floor(points / 4));
    }
    return table;
})();

export function xpForLevel(level: number): number {
    return XP_FOR_LEVEL[Math.min(Math.max(level, 1), MAX_LEVEL)];
}

export function levelForXp(xp: number): number {
    let level = 1;
    while (level < MAX_LEVEL && XP_FOR_LEVEL[level + 1] <= xp) {
        level++;
    }
    return level;
}

// A run's levels: the OSRS table, stretched more the higher you go, so the
// first levels come about as fast and the later ones slow down (level 40 needs
// about twice the OSRS XP).
const RUN_STRETCH_PER_LEVEL = 1 / 40;

export function runXpForLevel(level: number): number {
    return Math.floor(xpForLevel(level) * (1 + (level - 1) * RUN_STRETCH_PER_LEVEL));
}

export function runLevelForXp(xp: number): number {
    let level = 1;
    while (level < MAX_LEVEL && runXpForLevel(level + 1) <= xp) {
        level++;
    }
    return level;
}

// Endless runs' levels: the run's table up to level 40 (about where the first
// round ends), then each level needs only a little more XP than the one
// before, so levels keep coming as the rounds go by (the OSRS table triples
// every ten levels and would stop them)
const ENDLESS_STEEP_LEVELS = 40;
const ENDLESS_LATE_GROWTH = 1.06;
const MAX_ENDLESS_LEVEL = 9999;

export function endlessXpForLevel(level: number): number {
    if (level <= ENDLESS_STEEP_LEVELS) {
        return runXpForLevel(level);
    }
    const top = runXpForLevel(ENDLESS_STEEP_LEVELS);
    const step = top - runXpForLevel(ENDLESS_STEEP_LEVELS - 1);
    const g = ENDLESS_LATE_GROWTH;
    const levels = Math.min(level, MAX_ENDLESS_LEVEL) - ENDLESS_STEEP_LEVELS;
    return Math.floor(top + (step * g * (Math.pow(g, levels) - 1)) / (g - 1));
}

// Counts up from the level the player is at (endless levels have no top to
// stop at, so it's quicker than from 1)
export function endlessLevelForXp(xp: number, from = 1): number {
    let level = Math.max(1, from);
    while (level > 1 && endlessXpForLevel(level) > xp) {
        level--;
    }
    while (level < MAX_ENDLESS_LEVEL && endlessXpForLevel(level + 1) <= xp) {
        level++;
    }
    return level;
}
