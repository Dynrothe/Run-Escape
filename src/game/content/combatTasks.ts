import { list, tl, tr } from "../i18n";
import { ENEMY_BY_ID, enemyName } from "./enemies";
import { formatTime } from "./format";
import { INVADERS, INVADER_BY_ID } from "./invaders";
import { takesInvasions } from "./invasions";
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

// How many tasks can be pinned at once: their rows on the HUD, and a word when one's spoilt
export const MAX_COMBAT_PINS = 5;

// Speed tasks' times, in seconds. Guesses for now, to be set from playtests.
export const COMBAT_SPEED_SECONDS = {
    wiseOldMan: 60,
    dagannothKings: 60,
    tripleJads: 10,
    phosani: 300,
    zachariah: 180,
    awakenedVardorvis: 60,
    awakenedWhisperer: 45,
    awakenedDuke: 110,
    awakenedLeviathan: 150,
};

const ACT_II = ["stranglewood", "lassar_undercity", "ghorrock", "scar"];
const INVADER_IDS = INVADERS.map((invader) => invader.id);
const NEX = ["nex", "nex_shadow", "nex_blood", "nex_ice"];
const TOB_VERZIK = ["tob_verzik_vitur", "tob_verzik_vitur_risen", "tob_verzik_vitur_spider"];
const ZACHARIAH = ["justiciar_zachariah"];
const PHOSANI = ["phosanis_nightmare"];
// The Nightmare's and Phosani's that no one can dodge, which tasks that avoid damage leave out: the
// blast as her last sleepwalker goes (even with none let through) and a parasite bursting (a
// mark, on them wherever they are)
const UNDODGEABLE = ["Sleepwalkers", "Sleepwalkers (more)", "Parasites"];
// Phosani's last stand (her finale): its claws, and its dream
const PHOSANI_LAST_STAND = [
    "Grasping Claws (on you)",
    "Grasping Claws (random)",
    "The dream's lattice",
];
const TOB = "theatre_of_blood";
const TOMBS = "tombs_of_amascut";
const SANDS = "beneath_cursed_sands";

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
        id: "jack_of_all_styles",
        name: "Jack of All Styles",
        description: "Beat a campaign map with a melee, a ranged and a magic adventurer.",
        tier: "medium",
        type: "killCount",
        goal: { kind: "beatWithEach", maps: "campaign", styles: ["melee", "ranged", "magic"] },
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
    {
        id: "remixed",
        name: "Remixed",
        description: "Beat a map with a remix on.",
        tier: "medium",
        type: "restriction",
        goal: { kind: "win", maps: "any", remixes: 1 },
    },
    {
        id: "uninvited_guest",
        name: "Uninvited Guest",
        description: "Kill an Awakened invader.",
        tier: "medium",
        type: "killCount",
        goal: { kind: "killCount", enemyIds: INVADER_IDS, count: 1 },
    },
    {
        id: "invoker",
        name: "Invoker",
        description: "Beat a map with 100 or more invocation points.",
        tier: "hard",
        type: "restriction",
        goal: { kind: "win", maps: "any", points: 100 },
    },
    {
        id: "four_on_the_floor",
        name: "Four on the Floor",
        description: "Beat a map with all four remixes on at once.",
        tier: "elite",
        type: "restriction",
        goal: { kind: "win", maps: "any", remixes: 4 },
    },
    {
        id: "raising_the_stakes",
        name: "Raising the Stakes",
        description: "Beat a map with 200 or more invocation points.",
        tier: "elite",
        type: "restriction",
        goal: { kind: "win", maps: "any", points: 200 },
    },
    {
        id: "rude_awakening",
        name: "Rude Awakening",
        description: "Beat a campaign map with its final boss awakened by an Awakener's orb.",
        tier: "elite",
        type: "killCount",
        goal: { kind: "win", maps: { campaignFrom: "lumbridge" }, awakened: true },
    },
    {
        id: "home_guard",
        name: "Home Guard",
        description: "Kill each of the four Awakened invaders.",
        tier: "elite",
        type: "killCount",
        goal: { kind: "killCount", enemyIds: INVADER_IDS, count: INVADER_IDS.length, each: true },
    },
    {
        id: "all_in",
        name: "All In",
        description: "Beat a map with 300 invocation points: every one of them on.",
        tier: "master",
        type: "restriction",
        goal: { kind: "win", maps: "any", points: 300 },
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

    // Act II, the Fallen Empire
    {
        id: "empire_breaker",
        name: "Empire Breaker",
        description: "Beat every map of Act II, the Fallen Empire.",
        tier: "hard",
        type: "killCount",
        goal: { kind: "beatMap", maps: ACT_II, all: true },
    },
    {
        id: "imperial_grit",
        name: "Imperial Grit",
        description: "Beat every map of Act II on hard mode.",
        tier: "elite",
        type: "killCount",
        goal: { kind: "beatMap", maps: ACT_II, all: true, hard: true },
    },
    {
        id: "nowhere_to_run",
        name: "Nowhere to Run",
        description: "Kill Kasonde the Craven without him hitting you.",
        tier: "medium",
        type: "perfection",
        mapId: "stranglewood",
        goal: { kind: "kill", bossIds: ["kasonde"], without: ["hits"] },
    },
    {
        id: "axe_dodger",
        name: "Axe Dodger",
        description: "Kill Vardorvis in the Stranglewood without being hit by his swinging axes.",
        tier: "hard",
        type: "mechanical",
        mapId: "stranglewood",
        goal: { kind: "kill", bossIds: ["vardorvis"], without: [{ attacks: ["Swinging axes"] }] },
    },
    {
        id: "out_of_the_shadows",
        name: "Out of the Shadows",
        description: "Kill the Shadow Keeper without it hitting you.",
        tier: "medium",
        type: "perfection",
        mapId: "lassar_undercity",
        goal: { kind: "kill", bossIds: ["shadow_keeper_boss"], without: ["hits"] },
    },
    {
        id: "arms_length",
        name: "Arm's Length",
        description:
            "Kill the Whisperer in the Lassar Undercity without being hit by her tentacles.",
        tier: "hard",
        type: "mechanical",
        mapId: "lassar_undercity",
        goal: { kind: "kill", bossIds: ["whisperer"], without: [{ attacks: ["Tentacles"] }] },
    },
    {
        id: "unworthy_opponent",
        name: "Unworthy Opponent",
        description: "Kill Ketla the Unworthy without a single hit landing on you.",
        tier: "medium",
        type: "perfection",
        mapId: "ghorrock",
        goal: { kind: "kill", bossIds: ["ketla"], without: ["hits"] },
    },
    {
        id: "averted_eyes",
        name: "Averted Eyes",
        description: "Kill Duke Sucellus in Ghorrock without being caught by his freezing gaze.",
        tier: "hard",
        type: "mechanical",
        mapId: "ghorrock",
        goal: {
            kind: "kill",
            bossIds: ["duke_sucellus"],
            without: [{ attacks: ["Freezing gaze"] }],
        },
    },
    {
        id: "warm_blooded",
        name: "Warm Blooded",
        description: "Beat Ghorrock without ever freezing solid.",
        tier: "elite",
        type: "restriction",
        mapId: "ghorrock",
        goal: { kind: "win", maps: ["ghorrock"], rules: { noFreezing: true } },
    },
    {
        id: "unscarred",
        name: "Unscarred",
        description: "Kill the Scarred black demon without it hitting you.",
        tier: "medium",
        type: "perfection",
        mapId: "scar",
        goal: { kind: "kill", bossIds: ["scarred_black_demon"], without: ["hits"] },
    },
    {
        id: "watch_your_head",
        name: "Watch Your Head",
        description: "Kill the Leviathan in the Scar without being hit by its debris.",
        tier: "hard",
        type: "mechanical",
        mapId: "scar",
        goal: { kind: "kill", bossIds: ["the_leviathan"], without: [{ attacks: ["Debris"] }] },
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
        description:
            "Kill The Nightmare without being hurt while cursed, apart from her sleepwalkers' " +
            "blast and parasites.",
        tier: "hard",
        type: "mechanical",
        mapId: "halloween",
        goal: {
            kind: "kill",
            bossIds: ["the_nightmare"],
            without: ["hurtCursed"],
            except: UNDODGEABLE,
        },
    },

    // Thanksgiving Harvest
    {
        id: "lab_safety",
        name: "Lab Safety",
        description: "Kill Professor Oddenstein without being hit by a chemical splash.",
        tier: "medium",
        type: "mechanical",
        mapId: "thanksgiving",
        goal: {
            kind: "kill",
            bossIds: ["professor_oddenstein"],
            without: [{ attacks: ["Chemical Splash"] }],
        },
    },
    {
        id: "plucked",
        name: "Plucked",
        description:
            "Kill the Freaky Forester, his last stand too, without being hit by the Feathered " +
            "Apocalypse.",
        tier: "hard",
        type: "mechanical",
        mapId: "thanksgiving",
        goal: {
            kind: "kill",
            bossIds: ["freaky_forester", "freaky_forester_final"],
            without: [{ attacks: ["Feathered Apocalypse"] }],
        },
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
        description: "Kill Phosani's Nightmare without a parasite healing her.",
        tier: "hard",
        type: "mechanical",
        mapId: "phosani",
        goal: { kind: "kill", bossIds: PHOSANI, without: ["heals"] },
    },
    {
        id: "lucid_dreamer",
        name: "Lucid Dreamer",
        description:
            "Kill Phosani's Nightmare without letting a sleepwalker reach her or being hurt while " +
            "cursed, apart from her sleepwalkers' blast and parasites.",
        tier: "elite",
        type: "mechanical",
        mapId: "phosani",
        goal: {
            kind: "kill",
            bossIds: PHOSANI,
            without: ["hurtCursed", "sleepwalkers"],
            except: UNDODGEABLE,
        },
    },
    {
        id: "wide_awake",
        name: "Wide Awake",
        description:
            "Take no damage from her claws or the dream in Phosani's Nightmare's last stand, and " +
            "kill her.",
        tier: "elite",
        type: "perfection",
        mapId: "phosani",
        goal: {
            kind: "kill",
            bossIds: PHOSANI,
            without: [{ attacks: PHOSANI_LAST_STAND }],
            from: "finale",
        },
    },
    {
        id: "speedy_slumber",
        name: "Speedy Slumber",
        description: `Kill Phosani's Nightmare in under ${formatTime(COMBAT_SPEED_SECONDS.phosani)}.`,
        tier: "master",
        type: "speed",
        mapId: "phosani",
        goal: { kind: "win", maps: ["phosani"], within: COMBAT_SPEED_SECONDS.phosani },
    },
    {
        id: "dreamless",
        name: "Dreamless",
        description:
            "Kill Phosani's Nightmare on hard mode without letting a sleepwalker reach her or " +
            "taking any damage, apart from her sleepwalkers' blast and parasites.",
        tier: "grandmaster",
        type: "perfection",
        mapId: "phosani",
        goal: {
            kind: "win",
            maps: ["phosani"],
            hard: true,
            damage: 0,
            except: UNDODGEABLE,
            rules: { noSleepwalkers: true },
        },
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
            // Not "Ice barrage, then lunge": that's the ice, and its lunge is "Lunge (following)"
            without: [{ attacks: ["Lunge", "Lunges", "Lunge (following)"] }],
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
        description: "In one fight, Smite Justiciar Zachariah three times while his guard's down.",
        tier: "hard",
        type: "mechanical",
        mapId: "zachariah",
        goal: { kind: "abilityHits", abilityId: "smite", count: 3, opened: true },
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
        description: `Kill Justiciar Zachariah in under ${formatTime(COMBAT_SPEED_SECONDS.zachariah)}.`,
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
        id: "perfect_maiden",
        name: "Perfect Maiden",
        description: "Kill the Maiden of Sugadinti in the Theatre without taking any damage.",
        tier: "elite",
        type: "perfection",
        mapId: TOB,
        goal: { kind: "kill", bossIds: ["maiden_of_sugadinti"], without: ["damage"] },
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
        goal: { kind: "kill", bossIds: ["xarpus"], without: [{ attacks: ["Acid", "Acid burst"] }] },
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
            without: [
                { attacks: ["Green balls", "Green balls close in", "Green ball", "Doom ball"] },
            ],
        },
    },
    {
        id: "theatre_perfectionist",
        name: "Theatre Perfectionist",
        description:
            "Beat the Theatre of Blood doing Perfect Maiden, Rain Check, Mazemaster, Dry Feet and " +
            "Green Light, all in the same run.",
        tier: "grandmaster",
        type: "perfection",
        mapId: TOB,
        goal: {
            kind: "allOf",
            taskIds: ["perfect_maiden", "rain_check", "mazemaster", "dry_feet", "green_light"],
            win: true,
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

    // Beneath Cursed Sands
    {
        id: "below_the_sands",
        name: "Below the Sands",
        description: "Kill the Menaphite Akh, Beneath Cursed Sands' last fight.",
        tier: "medium",
        type: "killCount",
        mapId: SANDS,
        goal: { kind: "killCount", enemyIds: ["menaphite_akh"], count: 1 },
    },
    {
        id: "off_the_hook",
        name: "Off the Hook",
        description: "Kill Coenus without being caught by his harpoon.",
        tier: "medium",
        type: "mechanical",
        mapId: SANDS,
        goal: { kind: "kill", bossIds: ["coenus"], without: [{ attacks: ["Harpoon"] }] },
    },
    {
        id: "shadow_boxer",
        name: "Shadow Boxer",
        description: "Kill the Champion of Scabaras without your shadow betraying you.",
        tier: "hard",
        type: "mechanical",
        mapId: SANDS,
        goal: {
            kind: "kill",
            bossIds: ["champion_of_scabaras"],
            without: [{ attacks: ["Your shadow betrays you", "Your shadow betrays you (first)"] }],
        },
    },
    {
        id: "no_diving",
        name: "No Diving",
        description: "Kill the Menaphite Akh without being hit by a dive.",
        tier: "hard",
        type: "mechanical",
        mapId: SANDS,
        goal: {
            kind: "kill",
            bossIds: ["menaphite_akh"],
            without: [
                {
                    attacks: [
                        "Dive",
                        "Dives",
                        "Dive flurry",
                        "Dive (following)",
                        "Dive (last stand)",
                    ],
                },
            ],
        },
    },

    // The Tombs of Amascut
    {
        id: "pathfinder",
        name: "Pathfinder",
        description: "Clear a path of the Tombs of Amascut: its room and its boss.",
        tier: "easy",
        type: "killCount",
        mapId: TOMBS,
        goal: { kind: "clearPath" },
    },
    {
        id: "tomb_explorer",
        name: "Tomb Explorer",
        description: "Beat the Tombs of Amascut.",
        tier: "hard",
        type: "killCount",
        mapId: TOMBS,
        goal: { kind: "beatMap", maps: [TOMBS] },
    },
    {
        id: "movin_on_up",
        name: "Movin' on up",
        description: "Beat the Tombs of Amascut at raid level 150 or above.",
        tier: "hard",
        type: "restriction",
        mapId: TOMBS,
        goal: { kind: "win", maps: [TOMBS], raidLevel: 150 },
    },
    {
        id: "spiritless",
        name: "Spiritless",
        description:
            "Beat the Tombs of Amascut without using any of the Helpful Spirit's supplies.",
        tier: "hard",
        type: "restriction",
        mapId: TOMBS,
        goal: { kind: "win", maps: [TOMBS], rules: { noSupplies: true } },
    },
    {
        id: "roll_with_it",
        name: "Roll With It",
        description: "Kill Ba-Ba without being hit by a rolling boulder.",
        tier: "hard",
        type: "mechanical",
        mapId: TOMBS,
        goal: { kind: "kill", bossIds: ["ba_ba"], without: [{ attacks: ["Rolling boulders"] }] },
    },
    {
        id: "stable_footing",
        name: "Stable Footing",
        description: "Kill Akkha without being hit by his unstable orbs.",
        tier: "hard",
        type: "mechanical",
        mapId: TOMBS,
        goal: {
            kind: "kill",
            bossIds: ["akkha", "akkha_enraged"],
            without: [{ attacks: ["Unstable orbs"] }],
        },
    },
    {
        id: "stampede_survivor",
        name: "Stampede Survivor",
        description: "Kill Kephri without being caught in a scarab stampede.",
        tier: "hard",
        type: "mechanical",
        mapId: TOMBS,
        goal: {
            kind: "kill",
            bossIds: ["kephri", "kephri_final"],
            without: [{ attacks: ["Scarab stampede", "Scarab stampedes"] }],
        },
    },
    {
        id: "acid_test",
        name: "Acid Test",
        description: "Kill Zebak without being hit by his acid spray.",
        tier: "hard",
        type: "mechanical",
        mapId: TOMBS,
        goal: { kind: "kill", bossIds: ["zebak"], without: [{ attacks: ["Acid spray"] }] },
    },
    {
        id: "hardcore_tombs",
        name: "Hardcore Tombs",
        description: "Beat the Tombs of Amascut without dying.",
        tier: "elite",
        type: "perfection",
        mapId: TOMBS,
        goal: { kind: "win", maps: [TOMBS], rules: { noDeaths: true } },
    },
    {
        id: "confident_raider",
        name: "Confident Raider",
        description: "Beat the Tombs of Amascut at raid level 300 or above.",
        tier: "elite",
        type: "restriction",
        mapId: TOMBS,
        goal: { kind: "win", maps: [TOMBS], raidLevel: 300 },
    },
    {
        id: "perfect_apmeken",
        name: "Perfect Apmeken",
        description: "Beat the Apmeken room without letting a pillar fall or a vent burst.",
        tier: "elite",
        type: "perfection",
        mapId: TOMBS,
        goal: { kind: "perfectRoom", path: "apmeken" },
    },
    {
        id: "perfect_crondis",
        name: "Perfect Crondis",
        description: "Beat the Crondis room without a trap or a crocodile catching you.",
        tier: "elite",
        type: "perfection",
        mapId: TOMBS,
        goal: { kind: "perfectRoom", path: "crondis" },
    },
    {
        id: "perfect_het",
        name: "Perfect Het",
        description: "Beat the Het room without being hurt by its beam or an Orb of Darkness.",
        tier: "elite",
        type: "perfection",
        mapId: TOMBS,
        goal: { kind: "perfectRoom", path: "het" },
    },
    {
        id: "perfect_scabaras",
        name: "Perfect Scabaras",
        description: "Beat the Scabaras room without a wrong step bringing the ceiling down.",
        tier: "elite",
        type: "perfection",
        mapId: TOMBS,
        goal: { kind: "perfectRoom", path: "scabaras" },
    },
    {
        id: "something_of_an_expert_myself",
        name: "Something of an expert myself",
        description: "Beat the Tombs of Amascut at raid level 350 or above without dying.",
        tier: "master",
        type: "mechanical",
        mapId: TOMBS,
        goal: { kind: "win", maps: [TOMBS], raidLevel: 350, rules: { noDeaths: true } },
    },
    {
        id: "amascuts_remnant",
        name: "Amascut's Remnant",
        description: "Beat the Tombs of Amascut at raid level 500 or above without dying.",
        tier: "grandmaster",
        type: "mechanical",
        mapId: TOMBS,
        goal: { kind: "win", maps: [TOMBS], raidLevel: 500, rules: { noDeaths: true } },
    },

    // Awakened Vardorvis
    {
        id: "deeper_cuts",
        name: "Deeper Cuts",
        description: "Reach Awakened Vardorvis's third phase.",
        tier: "medium",
        type: "mechanical",
        mapId: "awakened_vardorvis",
        goal: { kind: "reachPhase", bossId: "awakened_vardorvis", phase: 3 },
    },
    {
        id: "vardorvis_sleeper",
        name: "Vardorvis Sleeper",
        description: "Kill Awakened Vardorvis.",
        tier: "hard",
        type: "killCount",
        mapId: "awakened_vardorvis",
        goal: { kind: "beatMap", maps: ["awakened_vardorvis"] },
    },
    {
        id: "pillar_talk",
        name: "Pillar Talk",
        description: "In one fight, make Awakened Vardorvis dart into his pillars three times.",
        tier: "medium",
        type: "mechanical",
        mapId: "awakened_vardorvis",
        goal: { kind: "guardDown", bossId: "awakened_vardorvis", causes: ["Pillar"], count: 3 },
    },
    {
        id: "bloodless",
        name: "Bloodless",
        description: "Kill Awakened Vardorvis without a blood captor healing him.",
        tier: "elite",
        type: "mechanical",
        mapId: "awakened_vardorvis",
        goal: { kind: "kill", bossIds: ["awakened_vardorvis"], without: ["heals"] },
    },
    {
        id: "breathing_room",
        name: "Breathing Room",
        description: "Kill Awakened Vardorvis without being caught by his strangle.",
        tier: "elite",
        type: "mechanical",
        mapId: "awakened_vardorvis",
        goal: {
            kind: "kill",
            bossIds: ["awakened_vardorvis"],
            without: [{ attacks: ["Strangle", "Strangling blows"] }],
        },
    },
    {
        id: "clean_cut",
        name: "Clean Cut",
        description: `Kill Awakened Vardorvis in under ${formatTime(COMBAT_SPEED_SECONDS.awakenedVardorvis)}.`,
        tier: "master",
        type: "speed",
        mapId: "awakened_vardorvis",
        goal: {
            kind: "win",
            maps: ["awakened_vardorvis"],
            within: COMBAT_SPEED_SECONDS.awakenedVardorvis,
        },
    },

    // The Awakened Whisperer
    {
        id: "the_third_verse",
        name: "The Third Verse",
        description: "Reach the Awakened Whisperer's third phase.",
        tier: "medium",
        type: "mechanical",
        mapId: "awakened_whisperer",
        goal: { kind: "reachPhase", bossId: "awakened_whisperer", phase: 3 },
    },
    {
        id: "whispered",
        name: "Whispered",
        description: "Kill the Awakened Whisperer.",
        tier: "hard",
        type: "killCount",
        mapId: "awakened_whisperer",
        goal: { kind: "beatMap", maps: ["awakened_whisperer"] },
    },
    {
        id: "unlashed",
        name: "Unlashed",
        description: "Kill the Awakened Whisperer without being hit by her lash.",
        tier: "hard",
        type: "mechanical",
        mapId: "awakened_whisperer",
        goal: { kind: "kill", bossIds: ["awakened_whisperer"], without: [{ attacks: ["Lash"] }] },
    },
    {
        id: "soul_saver",
        name: "Soul Saver",
        description: "In one fight, break all three of the Awakened Whisperer's Soul Siphons.",
        tier: "elite",
        type: "mechanical",
        mapId: "awakened_whisperer",
        // Not only stunned: one caught whole soon after a stun only drops her guard
        goal: {
            kind: "guardDown",
            bossId: "awakened_whisperer",
            causes: ["Soul Siphon"],
            count: 3,
        },
    },
    {
        id: "hush",
        name: "Hush",
        description: "Kill the Awakened Whisperer without being hit by her screech.",
        tier: "elite",
        type: "mechanical",
        mapId: "awakened_whisperer",
        goal: {
            kind: "kill",
            bossIds: ["awakened_whisperer"],
            without: [{ attacks: ["Screech", "Drowning screech"] }],
        },
    },
    {
        id: "short_song",
        name: "Short Song",
        description: `Kill the Awakened Whisperer in under ${formatTime(COMBAT_SPEED_SECONDS.awakenedWhisperer)}.`,
        tier: "master",
        type: "speed",
        mapId: "awakened_whisperer",
        goal: {
            kind: "win",
            maps: ["awakened_whisperer"],
            within: COMBAT_SPEED_SECONDS.awakenedWhisperer,
        },
    },

    // Awakened Duke Sucellus
    {
        id: "deep_freeze",
        name: "Deep Freeze",
        description: "Reach Awakened Duke Sucellus's third phase.",
        tier: "medium",
        type: "mechanical",
        mapId: "awakened_duke",
        goal: { kind: "reachPhase", bossId: "awakened_duke", phase: 3 },
    },
    {
        id: "duke_sucellus_sleeper",
        name: "Duke Sucellus Sleeper",
        description: "Kill Awakened Duke Sucellus.",
        tier: "hard",
        type: "killCount",
        mapId: "awakened_duke",
        goal: { kind: "beatMap", maps: ["awakened_duke"] },
    },
    {
        id: "look_away",
        name: "Look Away",
        description: "Kill Awakened Duke Sucellus without being caught by his gaze.",
        tier: "hard",
        type: "mechanical",
        mapId: "awakened_duke",
        goal: {
            kind: "kill",
            bossIds: ["awakened_duke"],
            without: [{ attacks: ["Freezing gaze", "Awakened gaze"] }],
        },
    },
    {
        id: "fresh_air",
        name: "Fresh Air",
        description: "Kill Awakened Duke Sucellus without being hurt by his gas.",
        tier: "elite",
        type: "mechanical",
        mapId: "awakened_duke",
        goal: { kind: "kill", bossIds: ["awakened_duke"], without: [{ attacks: ["Gas"] }] },
    },
    {
        id: "kindled_spirit",
        name: "Kindled Spirit",
        description:
            "In one fight, catch Awakened Duke Sucellus in Kindle's flare three times while his " +
            "guard's down.",
        tier: "elite",
        type: "mechanical",
        mapId: "awakened_duke",
        goal: { kind: "abilityHits", abilityId: "kindle", count: 3, opened: true },
    },
    {
        id: "cold_snap",
        name: "Cold Snap",
        description: `Kill Awakened Duke Sucellus in under ${formatTime(COMBAT_SPEED_SECONDS.awakenedDuke)}.`,
        tier: "master",
        type: "speed",
        mapId: "awakened_duke",
        goal: { kind: "win", maps: ["awakened_duke"], within: COMBAT_SPEED_SECONDS.awakenedDuke },
    },

    // The Awakened Leviathan
    {
        id: "out_of_the_depths",
        name: "Out of the Depths",
        description: "Reach the Awakened Leviathan's third phase.",
        tier: "medium",
        type: "mechanical",
        mapId: "awakened_leviathan",
        goal: { kind: "reachPhase", bossId: "awakened_leviathan", phase: 3 },
    },
    {
        id: "leviathan_sleeper",
        name: "Leviathan Sleeper",
        description: "Kill the Awakened Leviathan.",
        tier: "hard",
        type: "killCount",
        mapId: "awakened_leviathan",
        goal: { kind: "beatMap", maps: ["awakened_leviathan"] },
    },
    {
        id: "tail_dodger",
        name: "Tail Dodger",
        description: "Kill the Awakened Leviathan without being hit by its tail.",
        tier: "hard",
        type: "mechanical",
        mapId: "awakened_leviathan",
        goal: { kind: "kill", bossIds: ["awakened_leviathan"], without: [{ attacks: ["Tail"] }] },
    },
    {
        id: "high_and_dry",
        name: "High and Dry",
        description: "Kill the Awakened Leviathan without being caught in its torrent.",
        tier: "elite",
        type: "mechanical",
        mapId: "awakened_leviathan",
        goal: {
            kind: "kill",
            bossIds: ["awakened_leviathan"],
            without: [{ attacks: ["Torrent", "Deep torrent"] }],
        },
    },
    {
        id: "grounded",
        name: "Grounded",
        description: "Kill the Awakened Leviathan without being struck by its lightning.",
        tier: "elite",
        type: "mechanical",
        mapId: "awakened_leviathan",
        goal: {
            kind: "kill",
            bossIds: ["awakened_leviathan"],
            without: [{ attacks: ["Lightning"] }],
        },
    },
    {
        id: "shallow_waters",
        name: "Shallow Waters",
        description: `Kill the Awakened Leviathan in under ${formatTime(COMBAT_SPEED_SECONDS.awakenedLeviathan)}.`,
        tier: "master",
        type: "speed",
        mapId: "awakened_leviathan",
        goal: {
            kind: "win",
            maps: ["awakened_leviathan"],
            within: COMBAT_SPEED_SECONDS.awakenedLeviathan,
        },
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
// new ones move them (a reward already had stays). Worked out once: the tasks don't change.
let tierThresholds: Readonly<Record<CombatTier, number>> | undefined;
export function getTierThresholds(): Readonly<Record<CombatTier, number>> {
    if (!tierThresholds) {
        const thresholds = {} as Record<CombatTier, number>;
        let total = 0;
        for (const tier of COMBAT_TIERS) {
            total += COMBAT_TASKS.filter((t) => t.tier === tier.id).length * tier.points;
            thresholds[tier.id] = tier.id === "grandmaster" ? total : Math.ceil(total * 0.8);
        }
        tierThresholds = Object.freeze(thresholds);
    }
    return tierThresholds;
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
    // None for a map that isn't the campaign's, so a wrong id fails the tests rather than
    // quietly meaning every campaign map
    const from = CAMPAIGN_MAPS.findIndex((m) => m.id === maps.campaignFrom);
    return from < 0 ? [] : CAMPAIGN_MAPS.slice(from).map((m) => m.id);
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
        case "beatWithEach":
        case "win":
            return getGoalMaps(goal.maps).includes(map.id);
        case "killCount": {
            // An Awakened invader isn't one of its map's own, but comes to any map invaded
            const here = getMapEnemyIds(map);
            return goal.enemyIds.some(
                (id) => here.has(id) || (INVADER_BY_ID.has(id) && takesInvasions(map)),
            );
        }
        case "endlessRound":
            return !map.fight && !map.raid;
        case "evolve":
            // A boss fight has no picks
            return !map.fight;
        case "coinsBack":
            // Nor visitors: no one drops by while a phased boss is up
            return !map.fight;
        default:
            return true;
    }
}

// Whether a goal is counted over every run so far, rather than done in one
export function isMultiRunGoal(goal: CombatGoal): boolean {
    return (
        goal.kind === "killCount" ||
        goal.kind === "beatWithEach" ||
        (goal.kind === "beatMap" && goal.all === true)
    );
}

// A task's name and what it asks, a tier's name and a type's, in the player's language
export function combatTaskName(task: CombatTaskDef): string {
    return tr(`combat.task.${task.id}.name`, task.name);
}

export function combatTaskDescription(task: CombatTaskDef): string {
    return tr(`combat.task.${task.id}.desc`, task.description);
}

export function combatTierName(tier: CombatTier): string {
    return tr(`combat.tier.${tier}`, COMBAT_TIER_BY_ID.get(tier)!.name);
}

export function combatTypeName(type: CombatTaskType): string {
    return tr(`combat.type.${type}`, COMBAT_TASK_TYPES[type]);
}

// Why a task's out of reach, as the tracker (core/CombatTracker.ts) finds it: what happened, by
// ids and numbers, put in words where it's shown (describeCombatReason). A boss attack's name is
// its BossAttackDef.name; an enemy's is its id.
export type CombatReason =
    | { kind: "hitBy"; attack?: string; enemyId: string }
    // Hurt by one of these attacks, with no hit in the events to name which
    | { kind: "hitByOneOf"; attacks: readonly string[] }
    | { kind: "tookDamage" }
    | { kind: "tookOver"; damage: number }
    | { kind: "hpBelow"; percent: number }
    | { kind: "over"; seconds: number }
    | { kind: "notWithin"; seconds: number }
    // killEachWithin: these took longer than that
    | { kind: "tookTooLong"; enemyIds: readonly string[]; seconds: number }
    // killBeforeNext: this one rose before that one was down
    | { kind: "roseBefore"; enemyId: string; before: string }
    | { kind: "healed"; enemyId: string }
    | { kind: "outOfReach"; seconds: number }
    // allOf: one of its tasks, and why
    | { kind: "part"; taskId: string; reason: CombatReason }
    | {
          kind:
              | "sleepwalker"
              | "hurtCursed"
              | "gear"
              | "secondWeapon"
              | "passive"
              | "takeBacks"
              | "teleporter"
              | "supplies"
              | "usedSupply"
              | "died"
              | "frozen"
              | "puzzleMistake";
      };

// Combat Achievements' sentences, for locales/en/gen.json (scripts/i18n/extractors/gen.ts)
export const COMBAT_MESSAGES: Record<string, string> = {
    "combat.reason.hit_by": "hit by {what}",
    "combat.reason.one_of": "{rest} or {last}",
    "combat.reason.took_damage": "took damage",
    "combat.reason.took_over": "took over {damage} damage",
    "combat.reason.hp_below": "fell below {percent}% hitpoints",
    "combat.reason.over": "over {time}",
    "combat.reason.not_within": "not down within {time}",
    "combat.reason.took_too_long": "{names} took over {time}",
    "combat.reason.rose_before": "{name} rose before {before} was down",
    "combat.reason.healed": "{name} was healed",
    "combat.reason.out_of_reach": "out of reach for {seconds} seconds",
    "combat.reason.part": "{task}: {reason}",
    "combat.reason.sleepwalker": "a sleepwalker reached her",
    "combat.reason.hurtCursed": "hurt while cursed",
    "combat.reason.gear": "put on casket gear",
    "combat.reason.secondWeapon": "took a second weapon",
    "combat.reason.passive": "took a passive",
    "combat.reason.takeBacks": "rerolled, skipped or banished",
    "combat.reason.teleporter": "used a teleporter",
    "combat.reason.supplies": "spent raid points",
    "combat.reason.usedSupply": "used a supply",
    "combat.reason.died": "died",
    "combat.reason.frozen": "froze solid",
    "combat.reason.puzzleMistake": "made a mistake in the room",
};

function message(key: string, params?: Record<string, string | number>): string {
    return tr(key, COMBAT_MESSAGES[key], params);
}

function nameOf(enemyId: string): string {
    const def = ENEMY_BY_ID.get(enemyId);
    return def ? enemyName(def) : enemyId;
}

// "A", or "A, B or C"
function oneOf(names: readonly string[]): string {
    return names.length < 2
        ? names[0]
        : message("combat.reason.one_of", {
              rest: names.slice(0, -1).join(", "),
              last: names[names.length - 1],
          });
}

// A reason in the player's language (English under tsx, as the bot prints it)
export function describeCombatReason(reason: CombatReason): string {
    switch (reason.kind) {
        case "hitBy":
            return message("combat.reason.hit_by", {
                what: reason.attack !== undefined ? tl(reason.attack) : nameOf(reason.enemyId),
            });
        case "hitByOneOf":
            return message("combat.reason.hit_by", { what: oneOf(reason.attacks.map(tl)) });
        case "tookDamage":
            return message("combat.reason.took_damage");
        case "tookOver":
            return message("combat.reason.took_over", { damage: reason.damage });
        case "hpBelow":
            return message("combat.reason.hp_below", { percent: reason.percent });
        case "over":
            return message("combat.reason.over", { time: formatTime(reason.seconds) });
        case "notWithin":
            return message("combat.reason.not_within", { time: formatTime(reason.seconds) });
        case "tookTooLong":
            return message("combat.reason.took_too_long", {
                names: list(reason.enemyIds.map(nameOf)),
                time: formatTime(reason.seconds),
            });
        case "roseBefore":
            return message("combat.reason.rose_before", {
                name: nameOf(reason.enemyId),
                before: nameOf(reason.before),
            });
        case "healed":
            return message("combat.reason.healed", { name: nameOf(reason.enemyId) });
        case "outOfReach":
            return message("combat.reason.out_of_reach", { seconds: reason.seconds });
        case "part":
            return message("combat.reason.part", {
                task: combatTaskName(COMBAT_TASK_BY_ID.get(reason.taskId)!),
                reason: describeCombatReason(reason.reason),
            });
        default:
            return message(`combat.reason.${reason.kind}`);
    }
}

// combat.* for gen.json: each task's name and what it asks, each tier's and type's name, and the
// sentences above
export function getCombatMessages(): Record<string, string> {
    const messages: Record<string, string> = {};
    for (const task of COMBAT_TASKS) {
        messages[`combat.task.${task.id}.name`] = task.name;
        messages[`combat.task.${task.id}.desc`] = task.description;
    }
    for (const tier of COMBAT_TIERS) {
        messages[`combat.tier.${tier.id}`] = tier.name;
    }
    for (const [type, name] of Object.entries(COMBAT_TASK_TYPES)) {
        messages[`combat.type.${type}`] = name;
    }
    return { ...messages, ...COMBAT_MESSAGES };
}
