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
    | "baba";

export type InvocationDef = {
    id: string;
    // Its icon on the board, lit (an interface sprite); OFF_SPRITE later is the same, dark
    icon: number;
    name: string;
    group: InvocationGroup;
    // What it adds to the raid level
    level: number;
    description: string;
    // Not in yet: what it does besides the raid level comes with this part of the raid
    comes?: string;
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
    { id: "pathLevel", name: "Path level", one: true },
    { id: "paths", name: "Paths" },
    { id: "prayer", name: "Prayer" },
    { id: "restoration", name: "Restoration" },
    { id: "baba", name: "Ba-Ba" },
];

const RAID = "the raid's rooms";
const SPIRIT = "the Helpful Spirit";

export const INVOCATIONS: InvocationDef[] = [
    // Attempts: how many times the party can go down and be brought back
    {
        id: "try_again",
        icon: 4592,
        name: "Try Again",
        group: "attempts",
        level: 5,
        description: "Die 10 times and the raid's over (otherwise there's no limit).",
    },
    {
        id: "persistence",
        icon: 4592,
        name: "Persistence",
        group: "attempts",
        level: 10,
        description: "Die 5 times and the raid's over.",
    },
    {
        id: "softcore_run",
        icon: 4592,
        name: "Softcore Run",
        group: "attempts",
        level: 15,
        description: "Die 3 times and the raid's over.",
    },
    {
        id: "hardcore_run",
        icon: 4592,
        name: "Hardcore Run",
        group: "attempts",
        level: 25,
        description: "Die once and the raid's over.",
    },
    // Time limit: a clock for the whole raid. Running out lowers the loot; it doesn't end the run
    {
        id: "walk_for_it",
        icon: 4593,
        name: "Walk for It",
        group: "time",
        level: 10,
        description: "Finish within 40 minutes, or the raid level drops by 20.",
        comes: RAID,
    },
    {
        id: "jog_for_it",
        icon: 4593,
        name: "Jog for It",
        group: "time",
        level: 15,
        description: "Finish within 35 minutes, or the raid level drops by 30.",
        comes: RAID,
    },
    {
        id: "run_for_it",
        icon: 4593,
        name: "Run for It",
        group: "time",
        level: 20,
        description: "Finish within 30 minutes, or the raid level drops by 40.",
        comes: RAID,
    },
    {
        id: "sprint_for_it",
        icon: 4593,
        name: "Sprint for It",
        group: "time",
        level: 25,
        description: "Finish within 25 minutes, or the raid level drops by 50.",
        comes: RAID,
    },
    // The Helpful Spirit's supplies in the Nexus, after two paths and after all four
    {
        id: "need_some_help",
        icon: 4594,
        name: "Need Some Help?",
        group: "helpfulSpirit",
        level: 15,
        description: "The Helpful Spirit's supplies are two thirds as many.",
        comes: SPIRIT,
    },
    {
        id: "need_less_help",
        icon: 4594,
        name: "Need Less Help?",
        group: "helpfulSpirit",
        level: 25,
        description: "The Helpful Spirit's supplies are a third as many.",
        comes: SPIRIT,
    },
    {
        id: "no_help_needed",
        icon: 4594,
        name: "No Help Needed",
        group: "helpfulSpirit",
        level: 40,
        description: "The Helpful Spirit has almost nothing for you.",
        comes: SPIRIT,
    },
    // Path levels: every room harder, with more to its puzzle and faster, denser bullets
    {
        id: "pathseeker",
        icon: 4599,
        name: "Pathseeker",
        group: "pathLevel",
        level: 15,
        description: "Every path starts a level up: more puzzle, faster hazards, more bullets.",
    },
    {
        id: "pathfinder",
        icon: 4600,
        name: "Pathfinder",
        group: "pathLevel",
        level: 40,
        description: "Every path starts two levels up.",
    },
    {
        id: "pathmaster",
        icon: 4601,
        name: "Pathmaster",
        group: "pathLevel",
        level: 50,
        description: "Every path starts three levels up.",
    },
    {
        id: "walk_the_path",
        icon: 4598,
        name: "Walk the Path",
        group: "paths",
        level: 50,
        description: "Finishing a path levels up the rest twice as much.",
    },
    // Prayer: the bosses' protection, and what a hit costs
    {
        id: "quiet_prayers",
        icon: 4584,
        name: "Quiet Prayers",
        group: "prayer",
        level: 20,
        description: "Your armour stops 10% less of every hit.",
    },
    {
        id: "deadly_prayers",
        icon: 4605,
        name: "Deadly Prayers",
        group: "prayer",
        level: 20,
        description: "A hit leaves you open: the next within a second does 20% more.",
    },
    // Restoration
    {
        id: "on_a_diet",
        icon: 4603,
        name: "On a Diet",
        group: "restoration",
        level: 15,
        description: "No food drops.",
    },
    {
        id: "dehydration",
        icon: 4597,
        name: "Dehydration",
        group: "restoration",
        level: 30,
        description: "No regeneration, and no healing supplies.",
        comes: "the Helpful Spirit (its healing supplies)",
    },
    {
        id: "overly_draining",
        icon: 4596,
        name: "Overly Draining",
        group: "restoration",
        level: 15,
        description: "Weapons' special attacks come half as often.",
    },
    // Ba-Ba
    {
        id: "mind_the_gap",
        icon: 4588,
        name: "Mind the Gap!",
        group: "baba",
        level: 10,
        description: "The gap at the foot of her arena is open. Get knocked into it and you die.",
    },
    {
        id: "gotta_have_faith",
        icon: 4588,
        name: "Gotta Have Faith",
        group: "baba",
        level: 10,
        description: "The sarcophagi's blasts hit harder.",
        comes: "Ba-Ba",
    },
    {
        id: "jungle_japes",
        icon: 4588,
        name: "Jungle Japes",
        group: "baba",
        level: 5,
        description: "Her baboons drop banana peels that stun you.",
    },
    {
        id: "shaking_things_up",
        icon: 4588,
        name: "Shaking Things Up",
        group: "baba",
        level: 10,
        description: "Her shockwave is bigger.",
        comes: "Ba-Ba",
    },
    {
        id: "boulderdash",
        icon: 4588,
        name: "Boulderdash",
        group: "baba",
        level: 10,
        description: "Her rolling boulders come twice as fast.",
        comes: "Ba-Ba",
    },
];

// The invocation board's icons: each lit one's dark version is this many sprites on
// (scripts/cache/sprite-sheet.ts 4580 4630)
export const OFF_SPRITE = 24;

// Amascut's face on the board, by the raid level's band
export const RAID_BAND_SPRITES: Record<RaidBand, number> = {
    Entry: 4660,
    Normal: 4661,
    Expert: 4662,
};

// What the raid's chest can hold, shown on the board: its purples, the pet, and the jewels. Below
// a unique's minLevel it's greyed out there, as OSRS's are: it only comes with an extra 1 in 50 roll
// (fang and Lightbearer from raid level 50, the ward, Masori and the shadow from 150; the pet, the
// thread and the jewels at any level, more often the more raids you've done)
export const TOMBS_UNIQUES: { name: string; objId: number; minLevel: number }[] = [
    { name: "Osmumten's fang", objId: 26219, minLevel: 50 },
    { name: "Lightbearer", objId: 25975, minLevel: 50 },
    { name: "Elidinis' ward", objId: 25985, minLevel: 150 },
    { name: "Masori mask", objId: 27226, minLevel: 150 },
    { name: "Masori body", objId: 27229, minLevel: 150 },
    { name: "Masori chaps", objId: 27232, minLevel: 150 },
    { name: "Tumeken's shadow (uncharged)", objId: 27277, minLevel: 150 },
    { name: "Tumeken's guardian", objId: 27352, minLevel: 0 },
    { name: "Thread of Elidinis", objId: 27279, minLevel: 0 },
    { name: "Breach of the Scarab", objId: 27283, minLevel: 0 },
    { name: "Eye of the Corruptor", objId: 27285, minLevel: 0 },
    { name: "Jewel of the Sun", objId: 27289, minLevel: 0 },
];

// The highest raid level the board's reward bar goes to
export const MAX_RAID_LEVEL = 600;

export const INVOCATION_BY_ID: Map<string, InvocationDef> = new Map(
    INVOCATIONS.map((invocation) => [invocation.id, invocation]),
);

function groupOf(id: string): InvocationGroupDef | undefined {
    const invocation = INVOCATION_BY_ID.get(id);
    return INVOCATION_GROUPS.find((group) => group.id === invocation?.group);
}

// What a list of ids comes to: only invocations this game knows, each once, and the last picked
// of a group that allows one. Another player's game, or an old save, could send anything.
export function cleanInvocations(ids: readonly unknown[]): string[] {
    const out: string[] = [];
    for (const id of ids) {
        if (typeof id !== "string" || !INVOCATION_BY_ID.has(id) || out.includes(id)) {
            continue;
        }
        const group = groupOf(id);
        if (group?.one) {
            for (let i = out.length - 1; i >= 0; i--) {
                if (groupOf(out[i])?.id === group.id) {
                    out.splice(i, 1);
                }
            }
        }
        out.push(id);
    }
    return out;
}

// On if it was off, taking off anything it can't be on with; off if it was on
export function toggleInvocation(ids: readonly string[], id: string): string[] {
    if (ids.includes(id)) {
        return ids.filter((other) => other !== id);
    }
    return cleanInvocations([...ids, id]);
}

export function getRaidLevel(ids: readonly string[]): number {
    return cleanInvocations(ids).reduce(
        (sum, id) => sum + (INVOCATION_BY_ID.get(id)?.level ?? 0),
        0,
    );
}

// OSRS's bands: Entry under 150, Normal under 300, Expert from there
export type RaidBand = "Entry" | "Normal" | "Expert";

export function getRaidBand(level: number): RaidBand {
    return level < 150 ? "Entry" : level < 300 ? "Normal" : "Expert";
}

// Every 5 levels make enemies 2% tougher, as OSRS's do: their hitpoints all the way, their
// damage up to 150% more
const PER_FIVE_LEVELS = 0.02;
const MAX_DAMAGE = 2.5;

export function getRaidLevelScale(level: number): { hp: number; damage: number } {
    const steps = Math.floor(Math.max(0, level) / 5);
    const scale = 1 + steps * PER_FIVE_LEVELS;
    return { hp: scale, damage: Math.min(scale, MAX_DAMAGE) };
}
