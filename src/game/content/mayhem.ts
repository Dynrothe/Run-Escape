import { ENEMIES } from "./enemies";
import { ALL_MAPS, MAPS } from "./maps";
import { EnemyDef, MapDef, StatKey, Stats, WaveDef, emptyStats } from "./types";

// Mayhem: a run of its own, outside the campaign and the fun maps. Everything
// is open, the whole game's enemies and bosses come at you on a random map, and
// Modifiers bend how you play. It never ends: difficulty climbs with time until
// you fall, and nothing from it goes in the save.

// Modifiers in a run: one to start with, and one each for the bosses killed
export const MAYHEM_MODIFIERS = 12;
// Bones are worth this much, as there are so many more of them, and caskets,
// power-ups and food this much likelier
export const MAYHEM_XP = 0.5;
export const MAYHEM_CASKETS = 1.5;
export const MAYHEM_POWER_UPS = 2;
export const MAYHEM_FOOD = 2;
// Everyone has this much more hitpoints, and heals this many a minute, as
// there's no shop: hits count from the start, on a pool that can take a few
export const MAYHEM_HITPOINTS = 1;
export const MAYHEM_REGEN = 15;
// Slots everyone has here, as the shop's don't count
export const MAYHEM_WEAPON_SLOTS = 2;
export const MAYHEM_PASSIVE_SLOTS = 2;

// When the first boss comes, and how long between them
export const FIRST_BOSS_AT = 60;
export const BOSS_EVERY = 60;
// One that's due waits this long for those still up to be killed
export const BOSS_PATIENCE = 20;
// From these many seconds, bosses come in twos, then threes, each with this
// fraction of the hitpoints a boss alone would have
export const BOSS_PAIRS_AT = 6 * 60;
export const BOSS_TRIOS_AT = 10 * 60;
export const BOSS_GROUP_HP = 0.8;
// An elite turns up this often
export const ELITE_EVERY = 20;
// The enemies on the field change this often, for a new mix
export const ROSTER_EVERY = 45;
export const ROSTER_SIZE = 8;
// Seconds between Mayhem events, the first one this far in
export const FIRST_EVENT_AT = 30;
export const EVENT_EVERY = 60;

// A stream of enemies that grows with time, so a build that can keep up clears
// the screen and one that can't is swamped. minAlive only stops the screen
// emptying: refilling a high floor would make the stream as fast as you kill.
export function mayhemWave(seconds: number, enemies: WaveDef["enemies"]): WaveDef {
    const minutes = seconds / 60;
    return {
        start: 0,
        enemies,
        spawnRate: Math.min(1.5 + minutes * 2.5, 30),
        minAlive: Math.min(Math.round(12 + minutes * 10), 120),
        maxAlive: Math.min(Math.round(40 + minutes * 45), 380),
    };
}

// What enemies' hitpoints and damage are multiplied by, in place of a map's
// difficulty. Damage starts around what enemies are made to do, so a hit is
// always worth dodging, rather than nothing at first and everything later.
export function mayhemDifficulty(seconds: number): { hp: number; damage: number } {
    const minutes = seconds / 60;
    const cubed = minutes * minutes * minutes;
    return {
        hp: 1 + minutes * 0.3 + minutes * minutes * 0.1 + cubed * 0.008,
        damage: 0.6 + minutes * 0.05 + minutes * minutes * 0.012 + cubed * 0.0015,
    };
}

// Enemies speed up, so walking away stops being safe: the player moves about
// half as fast again as most of them to begin with
export function mayhemEnemySpeed(seconds: number): number {
    return Math.min(1 + (seconds / 60) * 0.03, 1.6);
}

// Bosses' hits, as they're made for players with a shop's worth of hitpoints
export const MAYHEM_BOSS_DAMAGE = 0.4;

// A boss's hitpoints: the same for every boss, as they're made for maps of very
// different strengths
export function mayhemBossHp(seconds: number): number {
    const minutes = seconds / 60;
    return Math.round(400 + minutes * 200 + minutes * minutes * 40);
}

// What a stat stops at in a run, whatever's been stacked on it: more does
// nothing or breaks the game (see endless.ts). Weapon speed has its own cap.
export const MAYHEM_STAT_CAPS: Partial<Record<StatKey, number>> = {
    amount: 4,
    luck: 2,
    moveSpeed: 1,
    duration: 2,
    greed: 3,
    healChance: 0.5,
};

export function getMayhemMetaStats(): Stats {
    return {
        ...emptyStats(),
        weaponSlots: MAYHEM_WEAPON_SLOTS,
        passiveSlots: MAYHEM_PASSIVE_SLOTS,
    };
}

export function pickMayhemMap(random: () => number): MapDef {
    return MAPS[Math.floor(random() * MAPS.length)];
}

// ---- Who can turn up ----

const WAVE_ENEMY_IDS: ReadonlySet<string> = new Set(
    ALL_MAPS.flatMap((map) => map.waves.flatMap((wave) => wave.enemies.map((e) => e.id))),
);

// The same boss as another one, there only for how its own map uses it
const DUPLICATE_BOSSES: ReadonlySet<string> = new Set(["jaltok_jad_finale"]);

// Why an enemy can't come in Mayhem, when it can't: these all need their own
// map or something else in the fight to make sense
export function getMayhemExclusion(def: EnemyDef): string | undefined {
    if (def.stationary) {
        return "never moves, so it only works where its map puts it";
    }
    if (def.spawnAt) {
        return "turns up at spots on its own map";
    }
    if (def.flees) {
        return "runs from you, so it needs its own map's objective";
    }
    if (DUPLICATE_BOSSES.has(def.id)) {
        return "the same boss as another one";
    }
    if (def.boss && !def.spawnMessage) {
        return "a later form of another boss, which it turns into";
    }
    if (!def.boss && !WAVE_ENEMY_IDS.has(def.id)) {
        return "only turns up with something else, like a boss's summons";
    }
    return undefined;
}

// Enemies of different factions fight each other (the God Wars Dungeon's
// armies). Nothing here has a side, so they all just come for the player.
const SIDELESS = new Map<string, EnemyDef>();

export function withoutFaction(def: EnemyDef): EnemyDef {
    if (def.faction === undefined) {
        return def;
    }
    let sideless = SIDELESS.get(def.id);
    if (!sideless) {
        sideless = { ...def, faction: undefined };
        SIDELESS.set(def.id, sideless);
    }
    return sideless;
}

export const MAYHEM_ENEMIES: EnemyDef[] = ENEMIES.filter(
    (def) => !def.boss && !getMayhemExclusion(def),
);

export const MAYHEM_BOSSES: EnemyDef[] = ENEMIES.filter(
    (def) => def.boss && !getMayhemExclusion(def),
);

// How tough an enemy is, from 0 to 4 (going by hitpoints, as maps' enemies
// are all made on the same scale)
const TIER_HP = [10, 20, 36, 56];
export const TOP_TIER = TIER_HP.length;
const EXPLODER_TIER = 2;

export function getEnemyTier(def: EnemyDef): number {
    const index = TIER_HP.findIndex((hp) => def.hp <= hp);
    const tier = index === -1 ? TOP_TIER : index;
    // Weak, but they can take a third of your hitpoints with them
    return def.explodes ? Math.max(tier, EXPLODER_TIER) : tier;
}

// How much of each tier comes at this point in a run: it starts with the
// weakest, and has moved on to the top ones by the twelfth minute
export function getTierWeights(seconds: number): number[] {
    const reached = Math.min(seconds / 180, TOP_TIER);
    return Array.from({ length: TOP_TIER + 1 }, (_, tier) =>
        Math.max(0, 1 - Math.abs(tier - reached) / 1.5),
    );
}

// ---- Modifiers ----

export type ModifierTier = "silver" | "gold" | "prismatic";

export const MODIFIER_TIERS: Record<ModifierTier, { name: string; color: string }> = {
    silver: { name: "Silver", color: "#c9d1d9" },
    gold: { name: "Gold", color: "#ffcb45" },
    prismatic: { name: "Prismatic", color: "#ee82ff" },
};

export type ModifierDef = {
    id: string;
    name: string;
    tier: ModifierTier;
    text: string;
    iconObjId: number;
    // Added to the player's stats for good. What else one does is in
    // MayhemRun, by its id.
    stats?: Partial<Stats>;
};

export const MODIFIERS: ModifierDef[] = [
    {
        id: "dharoks_set",
        name: "Dharok's set",
        tier: "silver",
        text: "The lower your hitpoints, the more damage you do, up to double.",
        iconObjId: 4716,
    },
    {
        id: "dragon_pickaxe",
        name: "Dragon pickaxe",
        tier: "silver",
        text: "Bones, coins and food fly to you from three times as far.",
        iconObjId: 11920,
        stats: { magnet: 2 },
    },
    {
        id: "prayer_flick",
        name: "Prayer flick",
        tier: "silver",
        text: "Every 10 seconds, the next hit you take is blocked.",
        iconObjId: 2434,
    },
    {
        id: "stamina_potion",
        name: "Stamina potion",
        tier: "silver",
        text: "Move 20% faster, and take 20% less damage while moving.",
        iconObjId: 12625,
        stats: { moveSpeed: 0.2 },
    },
    {
        id: "guthans_set",
        name: "Guthan's set",
        tier: "silver",
        text: "Every 25th kill heals 10% of your hitpoints.",
        iconObjId: 4724,
    },
    {
        id: "torags_set",
        name: "Torag's set",
        tier: "silver",
        text: "Take 25% less damage, but move 15% slower.",
        iconObjId: 4745,
        stats: { moveSpeed: -0.15 },
    },
    {
        id: "veracs_set",
        name: "Verac's set",
        tier: "silver",
        text: "Hits have a 25% chance to do double damage.",
        iconObjId: 4753,
    },
    {
        id: "bonecrusher",
        name: "Bonecrusher",
        tier: "silver",
        text: "Bones are worth 50% more.",
        iconObjId: 13116,
        stats: { growth: 0.5 },
    },
    {
        id: "super_antifire",
        name: "Super antifire",
        tier: "silver",
        text: "Bosses do 40% less damage to you.",
        iconObjId: 21978,
    },
    {
        id: "rune_pouch",
        name: "Rune pouch",
        tier: "silver",
        text: "Effects last 50% longer, and weapons cover 20% more area.",
        iconObjId: 12791,
        stats: { duration: 0.5, area: 0.2 },
    },
    {
        id: "dwarven_rock_cake",
        name: "Dwarven rock cake",
        tier: "silver",
        text: "Double your hitpoints, but do 20% less damage.",
        iconObjId: 7509,
        stats: { maxHp: 1, might: -0.2 },
    },
    {
        id: "karils_bolt_rack",
        name: "Karil's bolt rack",
        tier: "gold",
        text: "Weapons fire one more projectile, but do 20% less damage.",
        iconObjId: 4732,
        stats: { amount: 1, might: -0.2 },
    },
    {
        id: "ancient_magicks",
        name: "Ancient magicks",
        tier: "gold",
        text: "Kills have a 1 in 6 chance to freeze nearby enemies, except bosses, for 2 seconds.",
        iconObjId: 4675,
    },
    {
        id: "bandos_fury",
        name: "Bandos' fury",
        tier: "gold",
        text: "Melee hits also do 40% of their damage to nearby enemies.",
        iconObjId: 11832,
    },
    {
        id: "slayer_helmet",
        name: "Slayer helmet",
        tier: "gold",
        text: "Do 50% more damage to bosses and elites.",
        iconObjId: 11864,
        stats: { bossMight: 0.5 },
    },
    {
        id: "vengeance",
        name: "Vengeance",
        tier: "gold",
        text: "When you're hit, nearby enemies lose a third of their max hitpoints. Bosses lose far less.",
        iconObjId: 2550,
    },
    {
        id: "saradomins_wrath",
        name: "Saradomin's wrath",
        tier: "gold",
        text: "Every 3 seconds, lightning strikes the 3 nearest enemies for 20% of their max hitpoints. Bosses take far less.",
        iconObjId: 11838,
    },
    {
        id: "dwarf_cannon",
        name: "Dwarf multicannon",
        tier: "gold",
        text: "Every 45 seconds, a cannon is set up where you stand.",
        iconObjId: 6,
    },
    {
        id: "book_of_the_dead",
        name: "Book of the dead",
        tier: "gold",
        text: "Every 40 seconds, a thrall rises to fight for you.",
        iconObjId: 25818,
    },
    {
        id: "overload",
        name: "Overload",
        tier: "gold",
        text: "Every 30 seconds, lose 10% of your hitpoints to do 60% more damage for 10 seconds.",
        iconObjId: 11730,
    },
    {
        id: "blood_fury",
        name: "Amulet of blood fury",
        tier: "gold",
        text: "Hits have a 15% chance to heal you.",
        iconObjId: 24780,
        stats: { healChance: 0.15 },
    },
    {
        id: "pk_skull",
        name: "PK skull",
        tier: "gold",
        text: "Do 40% more damage, but take 40% more too.",
        iconObjId: 9013,
        stats: { might: 0.4 },
    },
    {
        id: "lure",
        name: "Lure",
        tier: "gold",
        text: "50% more enemies come at you, but bones are worth 50% more.",
        iconObjId: 2883,
        stats: { growth: 0.5 },
    },
    {
        id: "phoenix_necklace",
        name: "Phoenix necklace",
        tier: "gold",
        text: "Once a minute, a hit that would kill you leaves you at 50% hitpoints instead.",
        iconObjId: 11090,
    },
    {
        id: "max_cape",
        name: "Max cape",
        tier: "prismatic",
        text: "Every weapon and passive you own right now goes up a level.",
        iconObjId: 13280,
    },
    {
        id: "double_agent",
        name: "Double agent",
        tier: "prismatic",
        text: "Every weapon fires twice, but enemies hit 50% harder.",
        iconObjId: 12954,
    },
    {
        id: "blood_money",
        name: "Blood money",
        tier: "prismatic",
        text: "Coins drop more often and heal you, but you no longer regenerate.",
        iconObjId: 995,
    },
    {
        id: "power_surge",
        name: "Power surge",
        tier: "prismatic",
        text: "Every 30 seconds, weapons fire much faster for 8 seconds.",
        iconObjId: 5698,
    },
    {
        id: "evolution_chamber",
        name: "Evolution chamber",
        tier: "prismatic",
        text: "Weapons can evolve at any level, as long as you own their passive.",
        iconObjId: 1712,
    },
    {
        id: "infernal_cape",
        name: "Infernal cape",
        tier: "prismatic",
        text: "Enemies you kill explode, and enemies next to them lose 25% of their max hitpoints. Bosses lose far less.",
        iconObjId: 21295,
    },
    {
        id: "glass_cannon",
        name: "Berserker ring",
        tier: "prismatic",
        text: "Double your damage, but halve your hitpoints.",
        iconObjId: 6737,
        stats: { might: 1, maxHp: -0.5 },
    },
    {
        id: "clue_hunter",
        name: "Clue hunter",
        tier: "prismatic",
        text: "Every 40 seconds, a casket drops next to you.",
        iconObjId: 405,
    },
    {
        id: "time_stands_still",
        name: "Time stands still",
        tier: "prismatic",
        text: "Every 40 seconds, all enemies except bosses freeze for 8 seconds.",
        iconObjId: 2575,
    },
    {
        id: "ring_of_life",
        name: "Ring of life",
        tier: "prismatic",
        text: "Gain 2 extra lives, but have 30% fewer hitpoints.",
        iconObjId: 2570,
        stats: { maxHp: -0.3 },
    },
];

export const MODIFIER_BY_ID: Map<string, ModifierDef> = new Map(MODIFIERS.map((m) => [m.id, m]));

// How likely a card is to be Prismatic and Gold on each pick of a run (the
// rest are Silver): the later the pick, the wilder it gets
export function getTierChances(pick: number): { prismatic: number; gold: number } {
    return { prismatic: Math.min(0.08 + pick * 0.05, 0.35), gold: 0.4 };
}

// ---- Mayhem events ----

export type MayhemEventDef = {
    id: string;
    name: string;
    text: string;
    seconds: number;
};

export const MAYHEM_EVENTS: MayhemEventDef[] = [
    { id: "goblin_raid", name: "Goblin raid", text: "Goblins everywhere!", seconds: 15 },
    { id: "double_bones", name: "Double bones", text: "Bones are worth double.", seconds: 25 },
    { id: "rain_of_caskets", name: "Rain of caskets", text: "Caskets from above!", seconds: 15 },
    {
        id: "speedrun",
        name: "Speedrun",
        text: "Everything moves 50% faster, including you.",
        seconds: 20,
    },
    {
        id: "giant_mode",
        name: "Giant mode",
        text: "Huge, slow enemies with more hitpoints and bones.",
        seconds: 25,
    },
    { id: "boss_rush", name: "Boss rush", text: "The next boss is here early!", seconds: 15 },
    {
        id: "power_hour",
        name: "Power hour",
        text: "You and enemies hit twice as hard.",
        seconds: 15,
    },
];
