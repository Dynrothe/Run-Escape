import { getMapEnemyIds } from "./mapEnemies";
import { CAMPAIGN_MAPS, MAP_BY_ID, isDevMap, isFunMap } from "./maps";
import { CombatGoal, CombatTaskDef, CombatTaskType, CombatTier, MapDef } from "./types";

// Combat Achievements: challenges done in solo runs, apart from quests. Each pays its tier's coins
// once, when the run it's done in ends, and its points count towards the tiers' rewards (Ghommal's
// hilts, in the Collection log). Co-op runs don't count. The tracker that follows a run is
// core/CombatTracker.ts; it only watches the sim, never changes it.

export type CombatTierDef = {
    id: CombatTier;
    name: string;
    // Each task's
    points: number;
    coins: number;
};

export const COMBAT_TIERS: CombatTierDef[] = [
    { id: "easy", name: "Easy", points: 1, coins: 100 },
    { id: "medium", name: "Medium", points: 2, coins: 250 },
    { id: "hard", name: "Hard", points: 3, coins: 500 },
    { id: "elite", name: "Elite", points: 4, coins: 1000 },
    { id: "master", name: "Master", points: 5, coins: 2000 },
    { id: "grandmaster", name: "Grandmaster", points: 6, coins: 3000 },
];

export const COMBAT_TIER_BY_ID: Map<CombatTier, CombatTierDef> = new Map(
    COMBAT_TIERS.map((t) => [t.id, t]),
);

export const COMBAT_TASK_TYPES: Record<CombatTaskType, string> = {
    killCount: "Kill count",
    speed: "Speed",
    perfection: "Perfection",
    restriction: "Restriction",
    mechanical: "Mechanical",
    stamina: "Stamina",
};

// Speed tasks' times, in seconds. Guesses for now, to be set from playtests.
export const COMBAT_SPEED_SECONDS = {
    wiseOldMan: 60,
    dagannothKings: 60,
    tripleJads: 10,
    phosani: 270,
    zachariah: 180,
};

const NEX = ["nex", "nex_shadow", "nex_blood", "nex_ice"];
const TOB_VERZIK = ["tob_verzik_vitur", "tob_verzik_vitur_risen", "tob_verzik_vitur_spider"];
const ZACHARIAH = ["justiciar_zachariah"];
const PHOSANI = ["phosanis_nightmare"];
const TOB = "theatre_of_blood";

// In the list's order: all over first, then map by map
export const COMBAT_TASKS: CombatTaskDef[] = [
    // All over
    {
        id: "first_blood",
        name: "First Blood",
        description: "Beat any campaign map.",
        tier: "easy",
        type: "killCount",
        goal: { kind: "beatMap", maps: "campaign" },
    },
    {
        id: "stand_and_deliver",
        name: "Stand and Deliver",
        description: "Kill the Highwayman before he gets away with your coins.",
        tier: "easy",
        type: "mechanical",
        goal: { kind: "coinsBack", enemyId: "highwayman" },
    },
    {
        id: "one_track_mind",
        name: "One-Track Mind",
        description: "Beat a campaign map holding only one weapon.",
        tier: "medium",
        type: "restriction",
        goal: { kind: "win", maps: { campaignFrom: "lumbridge" }, rules: { oneWeapon: true } },
    },
    {
        id: "no_take_backs",
        name: "No Take-Backs",
        description: "Beat a campaign map without a reroll, a skip or a banish.",
        tier: "medium",
        type: "restriction",
        goal: { kind: "win", maps: { campaignFrom: "lumbridge" }, rules: { noTakeBacks: true } },
    },
    {
        id: "evolutionary",
        name: "Evolutionary",
        description: "Evolve three weapons in one run.",
        tier: "medium",
        type: "mechanical",
        goal: { kind: "evolve", count: 3 },
    },
    {
        id: "hardened",
        name: "Hardened",
        description: "Beat any map on hard mode.",
        tier: "medium",
        type: "killCount",
        goal: { kind: "beatMap", maps: "any", hard: true },
    },
    {
        id: "round_two",
        name: "Round Two",
        description: "Reach round 2 of an endless run.",
        tier: "medium",
        type: "stamina",
        goal: { kind: "endlessRound", round: 2 },
    },
    {
        id: "purist",
        name: "Purist",
        description: "Beat a campaign map without a single passive.",
        tier: "hard",
        type: "restriction",
        goal: { kind: "win", maps: { campaignFrom: "lumbridge" }, rules: { noPassives: true } },
    },
    {
        id: "naked_ambition",
        name: "Naked Ambition",
        description: "Beat a campaign map without putting on any casket gear.",
        tier: "hard",
        type: "restriction",
        goal: { kind: "win", maps: { campaignFrom: "lumbridge" }, rules: { noGear: true } },
    },
    {
        id: "third_times_the_charm",
        name: "Third Time's the Charm",
        description: "Reach round 3 of an endless run.",
        tier: "hard",
        type: "stamina",
        goal: { kind: "endlessRound", round: 3 },
    },
    {
        id: "bare_essentials",
        name: "Bare Essentials",
        description:
            "Beat Fremennik or a later campaign map with no Skills upgrades on your " +
            "adventurer's page and nothing upgraded in the Armoury.",
        tier: "elite",
        type: "restriction",
        goal: { kind: "win", maps: { campaignFrom: "fremennik" }, rules: { noUpgrades: true } },
    },
    {
        id: "hard_graft",
        name: "Hard Graft",
        description: "Beat every campaign map on hard mode.",
        tier: "elite",
        type: "killCount",
        goal: { kind: "beatMap", maps: "campaign", all: true, hard: true },
    },
    {
        id: "hard_times",
        name: "Hard Times",
        description: "Reach round 3 of an endless run on hard mode.",
        tier: "master",
        type: "stamina",
        goal: { kind: "endlessRound", round: 3, hard: true },
    },

    // The campaign
    {
        id: "bite_proof",
        name: "Bite-Proof",
        description: "Kill Count Draynor without him hitting you.",
        tier: "easy",
        type: "perfection",
        mapId: "lumbridge",
        goal: { kind: "kill", bossIds: ["count_draynor"], without: ["hits"] },
    },
    {
        id: "wise_guy",
        name: "Wise Guy",
        description: `Kill the Wise Old Man within ${COMBAT_SPEED_SECONDS.wiseOldMan} seconds of his arrival.`,
        tier: "easy",
        type: "speed",
        mapId: "lumbridge",
        goal: { kind: "kill", bossIds: ["wise_old_man"], within: COMBAT_SPEED_SECONDS.wiseOldMan },
    },
    {
        id: "brotherly_haste",
        name: "Brotherly Haste",
        description: "Kill each Barrows brother before the next one rises.",
        tier: "medium",
        type: "speed",
        mapId: "barrows",
        goal: { kind: "killBeforeNext", mapId: "barrows" },
    },
    {
        id: "kings_ransom",
        name: "Kings' Ransom",
        description:
            "Kill all three Dagannoth Kings in one run, each within " +
            `${COMBAT_SPEED_SECONDS.dagannothKings} seconds of its arrival.`,
        tier: "hard",
        type: "speed",
        mapId: "fremennik",
        goal: {
            kind: "killEachWithin",
            bossIds: ["dagannoth_rex", "dagannoth_supreme", "dagannoth_prime"],
            seconds: COMBAT_SPEED_SECONDS.dagannothKings,
        },
    },
    {
        id: "undead_dragonslayer",
        name: "Undead Dragonslayer",
        description: "Kill Vorkath without it hitting you.",
        tier: "hard",
        type: "perfection",
        mapId: "fremennik",
        goal: { kind: "kill", bossIds: ["vorkath"], without: ["hits"] },
    },
    {
        id: "jads_nemesis",
        name: "Jad's Nemesis",
        description: "Kill TzTok-Jad without it hitting you.",
        tier: "hard",
        type: "perfection",
        mapId: "karamja",
        goal: { kind: "kill", bossIds: ["tztok_jad"], without: ["hits"] },
    },
    {
        id: "glory_seeker",
        name: "Glory Seeker",
        description: "Kill Sol Heredit without him hitting you.",
        tier: "elite",
        type: "perfection",
        mapId: "varlamore",
        goal: { kind: "kill", bossIds: ["sol_heredit"], without: ["hits"] },
    },
    {
        id: "frozen_solid",
        name: "Frozen Solid",
        description: "Kill Nex, every one of her forms, without her hitting you.",
        tier: "elite",
        type: "perfection",
        mapId: "god_wars",
        goal: { kind: "kill", bossIds: NEX, without: ["hits"] },
    },
    {
        id: "crystal_clear",
        name: "Crystal Clear",
        description: "Kill the Corrupted Hunllef without it hitting you.",
        tier: "master",
        type: "perfection",
        mapId: "prifddinas",
        goal: { kind: "kill", bossIds: ["corrupted_hunllef"], without: ["hits"] },
    },
    {
        id: "triple_jeopardy",
        name: "Triple Jeopardy",
        description:
            "Kill the Inferno's three JalTok-Jads within " +
            `${COMBAT_SPEED_SECONDS.tripleJads} seconds of each other.`,
        tier: "master",
        type: "mechanical",
        mapId: "inferno",
        goal: {
            kind: "killTogether",
            bossId: "jaltok_jad_finale",
            count: 3,
            seconds: COMBAT_SPEED_SECONDS.tripleJads,
        },
    },
    {
        id: "fire_in_the_hole",
        name: "Fire in the Hole",
        description: "Beat the Inferno on hard mode without ever dropping below half hitpoints.",
        tier: "grandmaster",
        type: "perfection",
        mapId: "inferno",
        goal: { kind: "win", maps: ["inferno"], hard: true, hpAbove: 0.5 },
    },

    // Hallowed Night
    {
        id: "sweet_dreams",
        name: "Sweet Dreams",
        description: "Kill The Nightmare without a sleepwalker reaching her.",
        tier: "medium",
        type: "mechanical",
        mapId: "halloween",
        goal: { kind: "kill", bossIds: ["the_nightmare"], without: ["sleepwalkers"] },
    },
    {
        id: "insomniac",
        name: "Insomniac",
        description: "Kill The Nightmare without being cursed.",
        tier: "hard",
        type: "mechanical",
        mapId: "halloween",
        goal: { kind: "kill", bossIds: ["the_nightmare"], without: ["curse"] },
    },

    // Phosani's Nightmare
    {
        id: "bad_dream",
        name: "Bad Dream",
        description: "Reach Phosani's Nightmare's second phase.",
        tier: "easy",
        type: "mechanical",
        mapId: "phosani",
        goal: { kind: "reachPhase", bossId: "phosanis_nightmare", phase: 2 },
    },
    {
        id: "recurring_nightmare",
        name: "Recurring Nightmare",
        description: "Kill Phosani's Nightmare 5 times.",
        tier: "medium",
        type: "killCount",
        mapId: "phosani",
        goal: { kind: "killCount", enemyIds: PHOSANI, count: 5 },
    },
    {
        id: "parasite_free",
        name: "Parasite-Free",
        description: "Kill Phosani's Nightmare without a parasite ever taking hold.",
        tier: "hard",
        type: "mechanical",
        mapId: "phosani",
        goal: { kind: "kill", bossIds: PHOSANI, without: ["parasite"] },
    },
    {
        id: "lucid_dreamer",
        name: "Lucid Dreamer",
        description:
            "Kill Phosani's Nightmare without being cursed or letting a sleepwalker reach her.",
        tier: "elite",
        type: "mechanical",
        mapId: "phosani",
        goal: { kind: "kill", bossIds: PHOSANI, without: ["curse", "sleepwalkers"] },
    },
    {
        id: "wide_awake",
        name: "Wide Awake",
        description: "Take no damage in Phosani's Nightmare's last stand, and kill her.",
        tier: "elite",
        type: "perfection",
        mapId: "phosani",
        goal: { kind: "kill", bossIds: PHOSANI, without: ["damage"], from: "finale" },
    },
    {
        id: "speedy_slumber",
        name: "Speedy Slumber",
        description: `Kill Phosani's Nightmare in under ${formatSeconds(COMBAT_SPEED_SECONDS.phosani)}.`,
        tier: "master",
        type: "speed",
        mapId: "phosani",
        goal: { kind: "win", maps: ["phosani"], within: COMBAT_SPEED_SECONDS.phosani },
    },
    {
        id: "dreamless",
        name: "Dreamless",
        description: "Kill Phosani's Nightmare on hard mode without taking any damage.",
        tier: "grandmaster",
        type: "perfection",
        mapId: "phosani",
        goal: { kind: "win", maps: ["phosani"], hard: true, damage: 0 },
    },

    // Justiciar Zachariah
    {
        id: "court_in_session",
        name: "Court in Session",
        description: "Reach Justiciar Zachariah's second phase.",
        tier: "easy",
        type: "mechanical",
        mapId: "zachariah",
        goal: { kind: "reachPhase", bossId: "justiciar_zachariah", phase: 2 },
    },
    {
        id: "awaiting_the_verdict",
        name: "Awaiting the Verdict",
        description: "Reach Justiciar Zachariah's third phase, the verdict.",
        tier: "medium",
        type: "mechanical",
        mapId: "zachariah",
        goal: { kind: "reachPhase", bossId: "justiciar_zachariah", phase: 3 },
    },
    {
        id: "objection",
        name: "Objection!",
        description: "Kill Justiciar Zachariah without being hit by a lunge.",
        tier: "hard",
        type: "perfection",
        mapId: "zachariah",
        goal: {
            kind: "kill",
            bossIds: ZACHARIAH,
            without: [
                { attacks: ["Lunge", "Lunges", "Lunge (following)", "Ice barrage, then lunge"] },
            ],
        },
    },
    {
        id: "unbound",
        name: "Unbound",
        description: "Kill Justiciar Zachariah without ever being bound by his shock wave.",
        tier: "hard",
        type: "mechanical",
        mapId: "zachariah",
        goal: {
            kind: "kill",
            bossIds: ZACHARIAH,
            without: [{ attacks: ["Shock wave", "Flurry"] }],
        },
    },
    {
        id: "stuck_in_the_stone",
        name: "Stuck in the Stone",
        description: "Make Justiciar Zachariah lunge into a pillar.",
        tier: "medium",
        type: "mechanical",
        mapId: "zachariah",
        goal: {
            kind: "guardDown",
            bossId: "justiciar_zachariah",
            causes: ["Pillar"],
            count: 1,
            stunned: true,
        },
    },
    {
        id: "contempt_of_court",
        name: "Contempt of Court",
        description:
            "In one fight, stun Justiciar Zachariah with his own court three times: his " +
            "lightning struck under him, or a knight's sword through him.",
        tier: "elite",
        type: "mechanical",
        mapId: "zachariah",
        goal: {
            kind: "guardDown",
            bossId: "justiciar_zachariah",
            causes: [
                "Lightning",
                "Lightning round you",
                "Knight's sword",
                "Knight's swords",
                "Knight's sword (following)",
            ],
            count: 3,
            stunned: true,
        },
    },
    {
        id: "in_the_owls_shadow",
        name: "In the Owl's Shadow",
        description: "Kill Justiciar Zachariah taking no damage from the Owl's gaze.",
        tier: "elite",
        type: "mechanical",
        mapId: "zachariah",
        goal: { kind: "kill", bossIds: ZACHARIAH, without: [{ attacks: ["The Owl's gaze"] }] },
    },
    {
        id: "checkmate",
        name: "Checkmate",
        description: "Kill Justiciar Zachariah taking no damage from his lightning.",
        tier: "elite",
        type: "mechanical",
        mapId: "zachariah",
        goal: {
            kind: "kill",
            bossIds: ZACHARIAH,
            without: [{ attacks: ["Lightning", "Lightning round you"] }],
        },
    },
    {
        id: "close_counsel",
        name: "Close Counsel",
        description:
            "From Justiciar Zachariah's descent to his fall, never be out of Saradomin Strike's " +
            "reach for more than 3 seconds at a time (his kneels and leaps don't count).",
        tier: "elite",
        type: "mechanical",
        mapId: "zachariah",
        goal: { kind: "stayInReach", bossId: "justiciar_zachariah", seconds: 3 },
    },
    {
        id: "swift_justice",
        name: "Swift Justice",
        description: `Kill Justiciar Zachariah in under ${formatSeconds(COMBAT_SPEED_SECONDS.zachariah)}.`,
        tier: "master",
        type: "speed",
        mapId: "zachariah",
        goal: { kind: "win", maps: ["zachariah"], within: COMBAT_SPEED_SECONDS.zachariah },
    },
    {
        id: "beyond_reproach",
        name: "Beyond Reproach",
        description: "Kill Justiciar Zachariah on hard mode taking 10 damage or less.",
        tier: "master",
        type: "perfection",
        mapId: "zachariah",
        goal: { kind: "win", maps: ["zachariah"], hard: true, damage: 10 },
    },
    {
        id: "flawless_verdict",
        name: "Flawless Verdict",
        description: "Kill Justiciar Zachariah on hard mode without taking any damage.",
        tier: "grandmaster",
        type: "perfection",
        mapId: "zachariah",
        goal: { kind: "win", maps: ["zachariah"], hard: true, damage: 0 },
    },

    // The Theatre of Blood
    {
        id: "opening_night",
        name: "Opening Night",
        description: "Clear the Maiden of Sugadinti's room in the Theatre of Blood.",
        tier: "easy",
        type: "killCount",
        mapId: TOB,
        goal: { kind: "clearRoom", room: 0 },
    },
    {
        id: "the_long_walk",
        name: "The Long Walk",
        description: "Beat the Theatre of Blood without using a teleporter.",
        tier: "medium",
        type: "restriction",
        mapId: TOB,
        goal: { kind: "win", maps: [TOB], rules: { noTeleports: true } },
    },
    {
        id: "self_sufficient",
        name: "Self-Sufficient",
        description: "Beat the Theatre of Blood without spending raid points at the supply chest.",
        tier: "hard",
        type: "restriction",
        mapId: TOB,
        goal: { kind: "win", maps: [TOB], rules: { noSupplies: true } },
    },
    {
        id: "rain_check",
        name: "Rain Check",
        description: "Kill the Pestilent Bloat in the Theatre without being hit by falling flesh.",
        tier: "hard",
        type: "mechanical",
        mapId: TOB,
        goal: {
            kind: "kill",
            bossIds: ["tob_pestilent_bloat"],
            without: [{ attacks: ["Falling flesh", "Rain of flesh"] }],
        },
    },
    {
        id: "mazemaster",
        name: "Mazemaster",
        description:
            "Kill Sotetseg in the Theatre without being hit by the maze or a ball of death.",
        tier: "elite",
        type: "mechanical",
        mapId: TOB,
        goal: {
            kind: "kill",
            bossIds: ["tob_sotetseg"],
            without: [{ attacks: ["The maze", "The maze (faster)", "Ball of death"] }],
        },
    },
    {
        id: "dry_feet",
        name: "Dry Feet",
        description: "Kill Xarpus without taking any acid damage.",
        tier: "elite",
        type: "mechanical",
        mapId: TOB,
        goal: { kind: "kill", bossIds: ["xarpus"], without: [{ attacks: ["Acid"] }] },
    },
    {
        id: "green_light",
        name: "Green Light",
        description: "Kill Verzik Vitur in the Theatre without being hit by a green ball.",
        tier: "elite",
        type: "mechanical",
        mapId: TOB,
        goal: {
            kind: "kill",
            bossIds: TOB_VERZIK,
            without: [{ attacks: ["Green balls", "Green balls close in", "Doom ball"] }],
        },
    },
    {
        id: "expert_witness",
        name: "Expert Witness",
        description: "Beat the Theatre of Blood on expert mode.",
        tier: "master",
        type: "killCount",
        mapId: TOB,
        goal: { kind: "beatMap", maps: [TOB], expert: true },
    },
];

export const COMBAT_TASK_BY_ID: Map<string, CombatTaskDef> = new Map(
    COMBAT_TASKS.map((t) => [t.id, t]),
);

export function getTaskTier(task: CombatTaskDef): CombatTierDef {
    return COMBAT_TIER_BY_ID.get(task.tier)!;
}

// Points from the tasks with these ids
export function getCombatPoints(done: readonly string[]): number {
    let points = 0;
    for (const id of done) {
        const task = COMBAT_TASK_BY_ID.get(id);
        if (task) {
            points += getTaskTier(task).points;
        }
    }
    return points;
}

// The points each tier's reward needs: about 80% of every task's points up to and including that
// tier's, so a few can be skipped, and all of them for Grandmaster. They come from the tasks, so
// new ones move them (a reward already had stays).
export function getTierThresholds(): Record<CombatTier, number> {
    const thresholds = {} as Record<CombatTier, number>;
    let total = 0;
    for (const tier of COMBAT_TIERS) {
        total += COMBAT_TASKS.filter((t) => t.tier === tier.id).length * tier.points;
        thresholds[tier.id] = tier.id === "grandmaster" ? total : Math.ceil(total * 0.8);
    }
    return thresholds;
}

// The tiers whose reward these points have earned
export function getTiersReached(points: number): CombatTier[] {
    const thresholds = getTierThresholds();
    return COMBAT_TIERS.filter((t) => points >= thresholds[t.id]).map((t) => t.id);
}

// The maps a "campaign" or "any" goal covers
export function getGoalMaps(
    maps: string[] | "campaign" | "any" | { campaignFrom: string },
): string[] {
    if (maps === "campaign") {
        return CAMPAIGN_MAPS.map((m) => m.id);
    }
    if (maps === "any") {
        // Anything a run can win: not the fun maps (always endless) or the dev ones
        return [...MAP_BY_ID.values()]
            .filter((m) => !isFunMap(m.id) && !isDevMap(m.id))
            .map((m) => m.id);
    }
    if (Array.isArray(maps)) {
        return maps;
    }
    const from = CAMPAIGN_MAPS.findIndex((m) => m.id === maps.campaignFrom);
    return CAMPAIGN_MAPS.slice(Math.max(0, from)).map((m) => m.id);
}

// Whether a run on this map follows the task. Fun and dev maps never do.
export function canTrackOn(task: CombatTaskDef, map: MapDef): boolean {
    if (isFunMap(map.id) || isDevMap(map.id)) {
        return false;
    }
    if (task.mapId !== undefined) {
        return task.mapId === map.id;
    }
    const goal = task.goal;
    switch (goal.kind) {
        case "beatMap":
        case "win":
            return getGoalMaps(goal.maps).includes(map.id);
        case "killCount": {
            const here = getMapEnemyIds(map);
            return goal.enemyIds.some((id) => here.has(id));
        }
        case "endlessRound":
            return !map.fight && !map.raid;
        case "evolve":
            // A boss fight has no picks
            return !map.fight;
        default:
            return true;
    }
}

// Whether a goal is counted over every run so far, rather than done in one
export function isMultiRunGoal(goal: CombatGoal): boolean {
    return goal.kind === "killCount" || (goal.kind === "beatMap" && goal.all === true);
}

function formatSeconds(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
