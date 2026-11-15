import { fm } from "../core/fmath";
import { tr } from "../i18n";
import { TROPHIES } from "./trophies";

// The Tombs of Amascut's invocations (docs/design/tombs-of-amascut.md): picked before the raid,
// each one makes it harder in its own way and adds to the raid level, which makes every enemy
// tougher and the loot better, as OSRS's do. They take hard and expert mode's place there.
//
// Only one invocation of a group with `one` can be on: picking another takes the first off.
// What each does is said in the run's terms. The raid level's scaling works for all of them now;
// the rest of what they do comes with the parts of the raid they're about (`comes`).

export type InvocationGroup =
    | "attempts"
    | "time"
    | "helpfulSpirit"
    | "pathLevel"
    | "paths"
    | "prayer"
    | "restoration"
    | "baba"
    | "akkha"
    | "kephri"
    | "zebak"
    | "wardens"
    // A run's (RUN_INVOCATIONS): Act II's, and hard mode's
    | "run"
    | "hard";

export type InvocationDef = {
    id: string;
    // Its icon on the board, lit (an interface sprite); OFF_SPRITE later is the same, dark
    icon: number;
    name: string;
    group: InvocationGroup;
    // What it adds to the raid level
    level: number;
    description: string;
};

export type InvocationGroupDef = {
    id: InvocationGroup;
    name: string;
    // Only one of its invocations at a time
    one?: boolean;
};

export const INVOCATION_GROUPS: InvocationGroupDef[] = [
    { id: "attempts", name: "Attempts", one: true },
    { id: "time", name: "Time limit", one: true },
    { id: "helpfulSpirit", name: "Helpful Spirit", one: true },
    { id: "paths", name: "Paths" },
    { id: "pathLevel", name: "Path level", one: true },
    { id: "prayer", name: "Prayer" },
    { id: "restoration", name: "Restoration" },
    { id: "kephri", name: "Kephri" },
    { id: "zebak", name: "Zebak" },
    { id: "akkha", name: "Akkha" },
    { id: "baba", name: "Ba-Ba" },
    { id: "wardens", name: "The Wardens" },
];

// In the OSRS Wiki's order (its Invocations and Raid Level table), each boss's with its own icon
// (Kephri's scarab, Zebak's crocodile, Akkha's head, Ba-Ba's baboon, the Warden's face)
export const INVOCATIONS: InvocationDef[] = [
    // Attempts: how many times the party can go down and be brought back
    {
        id: "try_again",
        icon: 8731,
        name: "Try Again",
        group: "attempts",
        level: 5,
        description: "Die 10 times and the raid's over (otherwise there's no limit).",
    },
    {
        id: "persistence",
        icon: 8731,
        name: "Persistence",
        group: "attempts",
        level: 10,
        description: "Die 5 times and the raid's over.",
    },
    {
        id: "softcore_run",
        icon: 8731,
        name: "Softcore Run",
        group: "attempts",
        level: 15,
        description: "Die 3 times and the raid's over.",
    },
    {
        id: "hardcore_run",
        icon: 8731,
        name: "Hardcore Run",
        group: "attempts",
        level: 25,
        description: "Die once and the raid's over.",
    },
    // Time limit: a clock for the whole raid. Running out lowers the loot; it doesn't end the run
    {
        id: "walk_for_it",
        icon: 8732,
        name: "Walk for It",
        group: "time",
        level: 10,
        description: "Finish within 40 minutes, or the raid level drops by 20.",
    },
    {
        id: "jog_for_it",
        icon: 8732,
        name: "Jog for It",
        group: "time",
        level: 15,
        description: "Finish within 35 minutes, or the raid level drops by 30.",
    },
    {
        id: "run_for_it",
        icon: 8732,
        name: "Run for It",
        group: "time",
        level: 20,
        description: "Finish within 30 minutes, or the raid level drops by 40.",
    },
    {
        id: "sprint_for_it",
        icon: 8732,
        name: "Sprint for It",
        group: "time",
        level: 25,
        description: "Finish within 25 minutes, or the raid level drops by 50.",
    },
    // The Helpful Spirit's supplies in the Nexus, after two paths and after all four
    {
        id: "need_some_help",
        icon: 8733,
        name: "Need Some Help?",
        group: "helpfulSpirit",
        level: 15,
        description: "The Helpful Spirit's supplies are two thirds as many.",
    },
    {
        id: "need_less_help",
        icon: 8733,
        name: "Need Less Help?",
        group: "helpfulSpirit",
        level: 25,
        description: "The Helpful Spirit's supplies are a third as many.",
    },
    {
        id: "no_help_needed",
        icon: 8733,
        name: "No Help Needed",
        group: "helpfulSpirit",
        level: 40,
        description: "The Helpful Spirit has almost nothing for you.",
    },
    {
        id: "walk_the_path",
        icon: 8737,
        name: "Walk the Path",
        group: "paths",
        level: 50,
        description: "Finishing a path levels up the rest twice as much.",
    },
    // Path levels: every room harder, with more to its puzzle and faster, denser bullets
    {
        id: "pathseeker",
        icon: 8738,
        name: "Pathseeker",
        group: "pathLevel",
        level: 15,
        description: "Every path starts a level up: more puzzle, faster hazards, more bullets.",
    },
    {
        id: "pathfinder",
        icon: 8739,
        name: "Pathfinder",
        group: "pathLevel",
        level: 40,
        description: "Every path starts two levels up.",
    },
    {
        id: "pathmaster",
        icon: 8740,
        name: "Pathmaster",
        group: "pathLevel",
        level: 50,
        description: "Every path starts three levels up.",
    },
    // Prayer: the bosses' protection, and what a hit costs
    {
        id: "quiet_prayers",
        icon: 8723,
        name: "Quiet Prayers",
        group: "prayer",
        level: 20,
        description: "Your armour stops 10% less of every hit.",
    },
    {
        id: "deadly_prayers",
        icon: 8744,
        name: "Deadly Prayers",
        group: "prayer",
        level: 20,
        description: "A hit leaves you open: the next within a second does 20% more.",
    },
    // Restoration
    {
        id: "on_a_diet",
        icon: 8742,
        name: "On a Diet",
        group: "restoration",
        level: 15,
        description: "No food drops.",
    },
    {
        id: "dehydration",
        icon: 8736,
        name: "Dehydration",
        group: "restoration",
        level: 30,
        description: "No regeneration, and no healing supplies.",
    },
    {
        id: "overly_draining",
        icon: 8735,
        name: "Overly Draining",
        group: "restoration",
        level: 15,
        description: "Weapons' special attacks come half as often.",
    },
    {
        id: "lively_larvae",
        icon: 8726,
        name: "Lively Larvae",
        group: "kephri",
        level: 5,
        description: "Her Mass Incubation throws two more eggs that hatch.",
    },
    {
        id: "more_overlords",
        icon: 8726,
        name: "More Overlords",
        group: "kephri",
        level: 15,
        description: "Another of her overlords comes in each time her shield breaks.",
    },
    {
        id: "blowing_mud",
        icon: 8726,
        name: "Blowing Mud",
        group: "kephri",
        level: 10,
        description: "Her Dung Strike throws two of the party back.",
    },
    {
        id: "medic",
        icon: 8726,
        name: "Medic!",
        group: "kephri",
        level: 15,
        description:
            "Her swarms keep coming to heal her between her shield's breaks, at half speed.",
    },
    {
        id: "aerial_assault",
        icon: 8726,
        name: "Aerial Assault",
        group: "kephri",
        level: 10,
        description: "Her fireballs land harder and further across.",
    },
    {
        id: "not_just_a_head",
        icon: 8729,
        name: "Not Just a Head",
        group: "zebak",
        level: 15,
        description:
            "Blood clouds rise from the water now and then, and heal him if they reach you.",
    },
    {
        id: "arterial_spray",
        icon: 8729,
        name: "Arterial Spray",
        group: "zebak",
        level: 10,
        description: "His blood clouds heal him more.",
    },
    {
        id: "blood_thinners",
        icon: 8729,
        name: "Blood Thinners",
        group: "zebak",
        level: 5,
        description: "Three blood clouds rise at a time.",
    },
    {
        id: "upset_stomach",
        icon: 8729,
        name: "Upset Stomach",
        group: "zebak",
        level: 15,
        description: "His acid spreads 5 by 5, and a jug's water clears less of it.",
    },
    // Akkha
    {
        id: "double_trouble",
        icon: 8727,
        name: "Double Trouble",
        group: "akkha",
        level: 20,
        description: "His specials come two at once: Memory Blast with his trailing orbs.",
    },
    {
        id: "keep_back",
        icon: 8727,
        name: "Keep Back",
        group: "akkha",
        level: 10,
        description: "Beside him, his ranged and magic come with an unseen melee hit first.",
    },
    {
        id: "stay_vigilant",
        icon: 8727,
        name: "Stay Vigilant",
        group: "akkha",
        level: 15,
        description: "His specials come an attack sooner.",
    },
    {
        id: "feeling_special",
        icon: 8727,
        name: "Feeling Special?",
        group: "akkha",
        level: 20,
        description:
            "Memory Blast gives you half the time between bursts, and his orbs land ahead of you too.",
    },
    // Ba-Ba
    {
        id: "mind_the_gap",
        icon: 8728,
        name: "Mind the Gap!",
        group: "baba",
        level: 10,
        description: "The gap at the foot of her arena is open. Get knocked into it and you die.",
    },
    {
        id: "gotta_have_faith",
        icon: 8728,
        name: "Gotta Have Faith",
        group: "baba",
        level: 10,
        description: "The sarcophagi's blasts hit harder.",
    },
    {
        id: "jungle_japes",
        icon: 8728,
        name: "Jungle Japes",
        group: "baba",
        level: 5,
        description: "Her baboons drop banana peels that stun you.",
    },
    {
        id: "shaking_things_up",
        icon: 8728,
        name: "Shaking Things Up",
        group: "baba",
        level: 10,
        description: "Her shockwave is bigger.",
    },
    {
        id: "boulderdash",
        icon: 8728,
        name: "Boulderdash",
        group: "baba",
        level: 10,
        description: "Her rolling boulders come twice as fast.",
    },
    // The Wardens
    {
        id: "ancient_haste",
        icon: 8730,
        name: "Ancient Haste",
        group: "wardens",
        level: 10,
        description: "In their first phase, the Wardens charge their attacks faster.",
    },
    {
        id: "acceleration",
        icon: 8730,
        name: "Acceleration",
        group: "wardens",
        level: 10,
        description:
            "In the second phase, the Warden attacks faster and the obelisk charges faster.",
    },
    {
        id: "penetration",
        icon: 8730,
        name: "Penetration",
        group: "wardens",
        level: 10,
        description: "In the second phase, the obelisk's specials hit harder.",
    },
    {
        id: "overclocked",
        icon: 8730,
        name: "Overclocked",
        group: "wardens",
        level: 10,
        description: "In the last phase, the Warden slams the floor faster.",
    },
    {
        id: "overclocked_2",
        icon: 8730,
        name: "Overclocked 2",
        group: "wardens",
        level: 10,
        description: "In the last phase, the Warden slams the floor faster still.",
    },
    {
        id: "insanity",
        icon: 8730,
        name: "Insanity",
        group: "wardens",
        level: 50,
        description:
            "In the last phase, the Warden slams the floor as fast as it can, its siphons go off " +
            "far sooner, and its slams carry on where they left off.",
    },
];

// The invocation board's icons: each lit one's dark version is this many sprites on
// (scripts/cache/sprite-sheet.ts 8719 8769)
export const OFF_SPRITE = 24;

// Amascut's face on the board, by the raid level's band
export const RAID_BAND_SPRITES: Record<RaidBand, number> = {
    Entry: 8799,
    Normal: 8800,
    Expert: 8801,
};

// What the raid's chest can hold, shown on the board, each with the raid level it comes from
// (trophies.ts): below it, it's greyed out there
export const TOMBS_UNIQUES: { name: string; objId: number; minLevel: number }[] = TROPHIES.flatMap(
    (trophy) =>
        trophy.from.kind === "tombs"
            ? [{ name: trophy.name, objId: trophy.objId, minLevel: trophy.from.level }]
            : [],
);

// The Tombs' Attempts invocations: how many times the party can die before the raid's over
export const TOMBS_ATTEMPTS: [id: string, deaths: number][] = [
    ["hardcore_run", 0],
    ["softcore_run", 3],
    ["persistence", 5],
    ["try_again", 10],
];
// The Tombs' invocations: what armour stops with Quiet Prayers, and what a hit within a second of
// the last does with Deadly Prayers
export const QUIET_PRAYERS = 0.9;
export const DEADLY_PRAYERS = 1.2;
// Acceleration in the Wardens: the obelisk's specials a quarter sooner (OSRS's 22 ticks to 30),
// and its first sooner too (28 to 36)
export const ACCELERATION = { obeliskEvery: 0.75, firstOpen: 0.78 };

// The highest raid level the board's reward bar goes to
export const MAX_RAID_LEVEL = 600;

export const INVOCATION_BY_ID: Map<string, InvocationDef> = new Map(
    INVOCATIONS.map((invocation) => [invocation.id, invocation]),
);

function groupOf(id: string, set: InvocationSet): InvocationGroupDef | undefined {
    const invocation = set.byId.get(id);
    return set.groups.find((group) => group.id === invocation?.group);
}

// What a list of ids comes to: only invocations this game knows (of the board's set: the Tombs' by
// default), each once, and the last picked of a group that allows one. Another player's game, or
// an old save, could send anything.
export function cleanInvocations(
    ids: readonly unknown[],
    set: InvocationSet = TOMBS_SET,
): string[] {
    const out: string[] = [];
    for (const id of ids) {
        if (typeof id !== "string" || !set.byId.has(id) || out.includes(id)) {
            continue;
        }
        const group = groupOf(id, set);
        if (group?.one) {
            for (let i = out.length - 1; i >= 0; i--) {
                if (groupOf(out[i], set)?.id === group.id) {
                    out.splice(i, 1);
                }
            }
        }
        out.push(id);
    }
    return out;
}

// On if it was off, taking off anything it can't be on with; off if it was on
export function toggleInvocation(
    ids: readonly string[],
    id: string,
    set: InvocationSet = TOMBS_SET,
): string[] {
    if (ids.includes(id)) {
        return ids.filter((other) => other !== id);
    }
    return cleanInvocations([...ids, id], set);
}

export function getRaidLevel(ids: readonly string[]): number {
    return getInvocationPoints(ids, TOMBS_SET);
}

// OSRS's bands: Entry under 150, Normal under 300, Expert from there
export type RaidBand = "Entry" | "Normal" | "Expert";

export function getRaidBand(level: number): RaidBand {
    return level < 150 ? "Entry" : level < 300 ? "Normal" : "Expert";
}

// What the raid level makes enemies' hitpoints and damage, through these points (and on past the
// last at its rate). Entry's for a run started with nothing bought: slow, but there to be won.
// Normal wants the shop's upgrades and better gear; Expert more of both; past it, the best of
// everything, each band harder than the last by more. Between points the scale grows by the same
// share each level, so it climbs quicker the higher it goes. Bosses' hitpoints (bossHp) go further
// both ways: a run that's bought nothing does little damage, and the best of everything a lot.
// bullets is how many a boss's patterns and shards fire (as hard mode's are, Sim.volleyShape).
export type RaidLevelScale = { hp: number; damage: number; bossHp: number; bullets: number };

export const RAID_LEVEL_SCALE: ({ level: number } & RaidLevelScale)[] = [
    { level: 0, hp: 0.6, damage: 0.25, bossHp: 0.35, bullets: 0.6 },
    { level: 150, hp: 1.1, damage: 1, bossHp: 1, bullets: 1 },
    { level: 300, hp: 1.4, damage: 1.4, bossHp: 1.6, bullets: 1.15 },
    { level: 500, hp: 2, damage: 2, bossHp: 3, bullets: 1.35 },
];

export function getRaidLevelScale(level: number): RaidLevelScale {
    const points = RAID_LEVEL_SCALE;
    const at = Math.max(0, level);
    let i = 0;
    while (i < points.length - 2 && at > points[i + 1].level) {
        i++;
    }
    const a = points[i];
    const b = points[i + 1];
    const t = (at - a.level) / (b.level - a.level);
    return {
        hp: a.hp * fm.pow(b.hp / a.hp, t),
        damage: a.damage * fm.pow(b.damage / a.damage, t),
        bossHp: a.bossHp * fm.pow(b.bossHp / a.bossHp, t),
        bullets: a.bullets * fm.pow(b.bullets / a.bullets, t),
    };
}

// Saved setups of the invocation board, as OSRS's presets: a name and its invocations, loaded in one
// go (SaveData.invocationPresets)
export type InvocationPreset = { name: string; invocations: string[] };

export const MAX_INVOCATION_PRESETS = 5;
export const MAX_PRESET_NAME = 24;

// A preset's name as typed, or its raid level's when left blank. Saving goes by the name, so a
// blank save goes over the one named by that level (the board's button says Replace)
export function presetName(name: string, level: number): string {
    const typed = name.trim().slice(0, MAX_PRESET_NAME);
    return typed || `Raid level ${level}`;
}

// The name presetName gives one left blank
const LEVEL_NAME = /^Raid level \d+$/;

// The current setup saved as a preset: over the one of that name if there is one, else added while
// there's room. Undefined when it's full, as nothing changes.
export function saveInvocationPreset(
    presets: readonly InvocationPreset[],
    name: string,
    invocations: readonly string[],
): InvocationPreset[] | undefined {
    const preset = {
        name: presetName(name, getRaidLevel(invocations)),
        invocations: [...invocations],
    };
    const at = presets.findIndex((p) => p.name === preset.name);
    if (at >= 0) {
        return presets.map((p, i) => (i === at ? preset : p));
    }
    return presets.length < MAX_INVOCATION_PRESETS ? [...presets, preset] : undefined;
}

// What a save holds, as presets: anything odd left out, each one's invocations cleaned
export function cleanInvocationPresets(data: unknown): InvocationPreset[] {
    if (!Array.isArray(data)) {
        return [];
    }
    const out: InvocationPreset[] = [];
    for (const item of data) {
        if (out.length >= MAX_INVOCATION_PRESETS || typeof item !== "object" || item === null) {
            continue;
        }
        const { name, invocations } = item as { name?: unknown; invocations?: unknown };
        if (typeof name !== "string" || !Array.isArray(invocations)) {
            continue;
        }
        const ids = cleanInvocations(invocations);
        const named = presetName(name, getRaidLevel(ids));
        if (!out.some((p) => p.name === named)) {
            out.push({ name: named, invocations: ids });
        }
    }
    // One named by its raid level goes by what it comes to now (an update can change an
    // invocation's level, or take one away), unless another has that name. Again until none
    // moves, as one moving can free the name another wants; each moves once at most.
    for (let moved = true; moved; ) {
        moved = false;
        for (const preset of out) {
            const now = presetName("", getRaidLevel(preset.invocations));
            if (LEVEL_NAME.test(preset.name) && !out.some((p) => p.name === now)) {
                preset.name = now;
                moved = true;
            }
        }
    }
    return out;
}

// ---- Runs' invocations (act-2-fallen-empire.md, 9.1) ----
// The same board on a survival run: opt-in handicaps on any map from the Desert on (maps.ts,
// takesInvocations), each worth points. The points add coins (RUN_INVOCATION_COINS a point, with the
// run's other bonuses, up to COIN_BONUS_CAP) and badges on the map's card (INVOCATION_BADGES), and
// a record shows the points it was set at. The Tombs keep their own board and raid level above:
// an invocation set is the board a map has, so the same cleaning, toggling and points work for
// both. Hard mode on these maps is HARD_PRESET, so a hard run plays as it always has.

export type InvocationSet = {
    invocations: InvocationDef[];
    groups: InvocationGroupDef[];
    byId: Map<string, InvocationDef>;
};

export const TOMBS_SET: InvocationSet = {
    invocations: INVOCATIONS,
    groups: INVOCATION_GROUPS,
    byId: INVOCATION_BY_ID,
};

// A run's invocation: its coins when they aren't RUN_INVOCATION_COINS a point (hard mode's), and
// whether it's one of hard mode's (HARD_PRESET), which the Hard switch turns on together
export type RunInvocationDef = InvocationDef & { coins?: number; hard?: true };

// What each point adds to a run's coins
export const RUN_INVOCATION_COINS = 0.015;
// All of a run's coin bonuses together (invocations, hard mode, an act's steps and, later, remixes)
// go up to this: +300%
export const COIN_BONUS_CAP = 3;
// The points a map's card gives a badge for, beaten at as many or more
export const INVOCATION_BADGES = [100, 200, 300];

// The names and what they do are Act II's (9.1); what they're made of is the run's. The icons are
// the Tombs' board's, as the boards are one idea.
export const RUN_INVOCATIONS: RunInvocationDef[] = [
    {
        id: "run_walk_the_path",
        icon: 8737,
        name: "Walk the Path",
        group: "run",
        level: 10,
        description: "Enemies move 15% faster.",
    },
    {
        id: "run_upset_stomach",
        icon: 8742,
        name: "Upset Stomach",
        group: "run",
        level: 15,
        description: "No food drops, and the Sandwich lady doesn't come.",
    },
    {
        id: "run_overly_draining",
        icon: 8735,
        name: "Overly Draining",
        group: "run",
        level: 10,
        description: "No rerolls and no banishes.",
    },
    {
        id: "run_glass_cannon",
        icon: 8736,
        name: "Glass Cannon",
        group: "run",
        level: 20,
        description: "Half your hitpoints.",
    },
    {
        id: "run_hardcore",
        icon: 8731,
        name: "Hardcore",
        group: "run",
        level: 15,
        description: "No Ring of life, and in co-op no getting back up.",
    },
    {
        id: "run_feeling_special",
        icon: 8727,
        name: "Feeling Special?",
        group: "run",
        level: 10,
        description: "Bosses enrage at 75% of their hitpoints, not 50%.",
    },
    {
        id: "run_aerial_assault",
        icon: 8726,
        name: "Aerial Assault",
        group: "run",
        level: 15,
        description: "Bosses' patterns fire half as many bullets again.",
    },
    {
        id: "run_ancient_haste",
        icon: 8732,
        name: "Ancient Haste",
        group: "run",
        level: 10,
        description: "The run's clock goes 25% faster: the final boss comes at 12:00.",
    },
    {
        id: "run_blood_moon",
        icon: 8730,
        name: "Blood Moon",
        group: "run",
        level: 15,
        description: "Every boss comes a minute early.",
    },
    // Hard mode, in four: together they're what hard mode has always been (hard.ts), and pay its
    // +25% coins between them. The Hard switch turns them on and off together.
    {
        id: "run_hard_foes",
        icon: 8723,
        name: "Hardened Foes",
        group: "hard",
        level: 90,
        coins: 0.0625,
        hard: true,
        description: "Enemies have the map's hard-mode hitpoints and damage.",
    },
    {
        id: "run_hard_crowd",
        icon: 8738,
        name: "Thronging",
        group: "hard",
        level: 40,
        coins: 0.0625,
        hard: true,
        description: "A quarter more enemies about, for a little less experience each.",
    },
    {
        id: "run_hard_elites",
        icon: 8739,
        name: "Elite Guard",
        group: "hard",
        level: 25,
        coins: 0.0625,
        hard: true,
        description: "Two elites come where there'd be one.",
    },
    {
        id: "run_hard_bosses",
        icon: 8744,
        name: "Short Fuse",
        group: "hard",
        level: 25,
        coins: 0.0625,
        hard: true,
        description: "Bosses enrage at 65% and attack 15% faster, and co-op brings more of them.",
    },
];

export const RUN_INVOCATION_GROUPS: InvocationGroupDef[] = [
    { id: "run", name: "Invocations" },
    { id: "hard", name: "Hard mode" },
];

export const RUN_SET: InvocationSet = {
    invocations: RUN_INVOCATIONS,
    groups: RUN_INVOCATION_GROUPS,
    byId: new Map(RUN_INVOCATIONS.map((invocation) => [invocation.id, invocation])),
};

// Hard mode on a map that takes invocations: these on together
export const HARD_PRESET: string[] = RUN_INVOCATIONS.filter((i) => i.hard).map((i) => i.id);

export function isHardInvocation(id: string): boolean {
    return (RUN_SET.byId.get(id) as RunInvocationDef | undefined)?.hard === true;
}

// Whether a run's invocations have all of hard mode's: a hard run, for its records
export function hasHardPreset(ids: readonly string[]): boolean {
    return HARD_PRESET.every((id) => ids.includes(id));
}

// What a run's invocations come to: points (as the Tombs' raid level), and what they add to coins
export function getInvocationPoints(ids: readonly string[], set: InvocationSet = RUN_SET): number {
    return cleanInvocations(ids, set).reduce((sum, id) => sum + (set.byId.get(id)?.level ?? 0), 0);
}

export function getInvocationCoins(ids: readonly string[]): number {
    return cleanInvocations(ids, RUN_SET).reduce((sum, id) => {
        const def = RUN_SET.byId.get(id) as RunInvocationDef;
        return sum + (def.coins ?? def.level * RUN_INVOCATION_COINS);
    }, 0);
}

// The highest badge a win at these points earns (0 for none)
export function getInvocationBadge(points: number): number {
    return INVOCATION_BADGES.filter((badge) => points >= badge).pop() ?? 0;
}

// The board's: an invocation's name and what it does, in the player's language (the sim and the
// Tombs' board read the English)
export function invocationName(def: InvocationDef): string {
    return tr(`invocation.${def.id}.name`, def.name);
}

export function invocationDescription(def: InvocationDef): string {
    return tr(`invocation.${def.id}.desc`, def.description);
}

// What the runs' invocations go by
// Walk the Path: enemies' pace
export const WALK_THE_PATH = 1.15;
// Feeling Special?: bosses enrage below this share of their hitpoints
export const FEELING_SPECIAL_ENRAGE = 0.75;
// Aerial Assault: bosses' patterns' bullets
export const AERIAL_ASSAULT = 1.5;
// Ancient Haste: the run's clock (Sim.mapSeconds)
export const ANCIENT_HASTE = 1.25;
// Blood Moon: how many seconds early every boss comes
export const BLOOD_MOON = 60;
// Glass Cannon: hitpoints
export const GLASS_CANNON_HP = 0.5;
