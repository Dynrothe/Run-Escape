import { tr } from "../i18n";

// Trophies: rare finds, kept in the Collection log, and in the save once they're
// found. They do nothing in a run, but a few bring a weapon or a passive into the game (the
// Theatre of Blood's rapier and Holy Scythe, the Tombs' jewels and Thread: UnlockTask "raidChest").
export type TrophySource =
    // This chance on each kill of a regular enemy on the map
    | { kind: "enemy"; enemyId: string; mapId: string; chance: number }
    // This chance on each kill of the boss on the map, or hardChance on hard mode
    | { kind: "boss"; enemyId: string; mapId: string; chance: number; hardChance?: number }
    // This chance on each trick or treat pumpkin opened
    | { kind: "pumpkin"; chance: number }
    // This chance on each cooked turkey carved
    | { kind: "turkey"; chance: number }
    // Rewards granted after winning an event map, optionally requiring a boss kill
    | { kind: "map"; mapId: string; requiresBoss?: string; hard?: boolean }
    // A quest's completion, recorded with its other rewards
    | { kind: "quest"; mapId: string; questId: string }
    // A raid's chest, once its last boss is down: a purple's one of these by weight (Sim's
    // openRaidChest has the chance), and a hard raid's own are a roll of their own. An expert
    // raid's own: one of them each time it's beaten, till they're all found. A chest only gives
    // ones the player hasn't found (isRaidChestTrophy).
    | { kind: "raid"; mapId: string; weight: number; hard?: boolean; expert?: boolean }
    // The Tombs of Amascut's chest (Sim's openTombsChest), from raid level `level` up: a purple's
    // one of those with a weight, its chance going by the raid level; the rest (`chance`) a roll
    // of their own
    | { kind: "tombs"; level: number; weight?: number; chance?: number };

export type TrophyDef = {
    id: string;
    name: string;
    objId: number;
    // Where it's from, for the Collection log
    how: string;
    from: TrophySource;
};

const NIGHTMARE = { kind: "boss", enemyId: "the_nightmare", mapId: "halloween" } as const;
const TOB = { kind: "raid", mapId: "theatre_of_blood" } as const;
const PURPLE = "From the Theatre of Blood's chest, more often the more raid points you earned.";
const HARD_PURPLE = "From the Theatre of Blood's chest, on hard mode only.";

export const TROPHIES: TrophyDef[] = [
    {
        id: "jar_of_dreams",
        name: "Jar of Dreams",
        objId: 24495,
        how: "A rare drop from The Nightmare.",
        from: { ...NIGHTMARE, chance: 1 / 20 },
    },
    {
        id: "little_nightmare",
        name: "Little Nightmare",
        objId: 24491,
        how: "A very rare drop from The Nightmare.",
        from: { ...NIGHTMARE, chance: 1 / 50 },
    },
    {
        id: "red_halloween_mask",
        name: "Red halloween mask",
        objId: 1057,
        how: "Sometimes found in a trick or treat pumpkin.",
        from: { kind: "pumpkin", chance: 1 / 100 },
    },
    {
        id: "blue_halloween_mask",
        name: "Blue halloween mask",
        objId: 1055,
        how: "Sometimes found in a trick or treat pumpkin.",
        from: { kind: "pumpkin", chance: 1 / 100 },
    },
    {
        id: "green_halloween_mask",
        name: "Green halloween mask",
        objId: 1053,
        how: "Sometimes found in a trick or treat pumpkin.",
        from: { kind: "pumpkin", chance: 1 / 100 },
    },
    {
        id: "scythe",
        name: "Scythe",
        objId: 1419,
        how: "Rarely found in a trick or treat pumpkin.",
        from: { kind: "pumpkin", chance: 1 / 200 },
    },
    // Act II's: a piece of the Soulreaper axe from each of its final bosses, the first time
    // they're beaten (the axe itself is made once all four are in)
    {
        id: "executioners_axe_head",
        name: "Executioner's axe head",
        objId: 28319,
        how: "From Vardorvis, the first time he's beaten in the Stranglewood.",
        from: { kind: "boss", enemyId: "vardorvis", mapId: "stranglewood", chance: 1 },
    },
    {
        id: "sirens_staff",
        name: "Siren's staff",
        objId: 28323,
        how: "From the Whisperer, the first time she's beaten in the Lassar Undercity.",
        from: { kind: "boss", enemyId: "whisperer", mapId: "lassar_undercity", chance: 1 },
    },
    {
        id: "eye_of_the_duke",
        name: "Eye of the Duke",
        objId: 28321,
        how: "From Duke Sucellus, the first time he's beaten in Ghorrock.",
        from: { kind: "boss", enemyId: "duke_sucellus", mapId: "ghorrock", chance: 1 },
    },
    {
        id: "leviathans_lure",
        name: "Leviathan's lure",
        objId: 28325,
        how: "From the Leviathan, the first time it's beaten in the Scar.",
        from: { kind: "boss", enemyId: "the_leviathan", mapId: "scar", chance: 1 },
    },
    // Awakened Vardorvis's pet, certain: the fight's the gate (act-2-fallen-empire.md, 7.2)
    {
        id: "butch",
        name: "Butch",
        objId: 28248,
        how: "From Awakened Vardorvis, the first time he's beaten.",
        from: {
            kind: "boss",
            enemyId: "awakened_vardorvis",
            mapId: "awakened_vardorvis",
            chance: 1,
        },
    },
    // The Awakened Whisperer's, certain, as Butch is
    {
        id: "wisp",
        name: "Wisp",
        objId: 28246,
        how: "From the Awakened Whisperer, the first time she's beaten.",
        from: {
            kind: "boss",
            enemyId: "awakened_whisperer",
            mapId: "awakened_whisperer",
            chance: 1,
        },
    },
    // The Awakened Duke's, certain, as Butch and the Wisp are
    {
        id: "baron",
        name: "Baron",
        objId: 28250,
        how: "From the Awakened Duke Sucellus, the first time he's beaten.",
        from: {
            kind: "boss",
            enemyId: "awakened_duke",
            mapId: "awakened_duke",
            chance: 1,
        },
    },
    // The Awakened Leviathan's, certain, as the other three are
    {
        id: "lilviathan",
        name: "Lil'viathan",
        objId: 28252,
        how: "From the Awakened Leviathan, the first time it's beaten.",
        from: {
            kind: "boss",
            enemyId: "awakened_leviathan",
            mapId: "awakened_leviathan",
            chance: 1,
        },
    },
    {
        id: "black_hween_mask",
        name: "Black h'ween mask",
        objId: 11847,
        how: "Rarely found in a trick or treat pumpkin.",
        from: { kind: "pumpkin", chance: 1 / 200 },
    },
    {
        id: "jack_lantern_mask",
        name: "Jack lantern mask",
        objId: 9920,
        how: "Sometimes found in a trick or treat pumpkin.",
        from: { kind: "pumpkin", chance: 1 / 100 },
    },
    {
        id: "skeleton_mask",
        name: "Skeleton mask",
        objId: 9925,
        how: "Sometimes found in a trick or treat pumpkin.",
        from: { kind: "pumpkin", chance: 1 / 100 },
    },
];

// The Theatre of Blood's uniques, weighted as the real raid's are, and its pet off Verzik
TROPHIES.push(
    {
        id: "avernic_defender_hilt",
        name: "Avernic defender hilt",
        objId: 22477,
        how: PURPLE,
        from: { ...TOB, weight: 8 },
    },
    {
        id: "ghrazi_rapier",
        name: "Ghrazi rapier",
        objId: 22324,
        how: `${PURPLE} Unlocks the rapier as a weapon.`,
        from: { ...TOB, weight: 2 },
    },
    {
        id: "sanguinesti_staff_uncharged",
        name: "Sanguinesti staff (uncharged)",
        objId: 22481,
        how: PURPLE,
        from: { ...TOB, weight: 2 },
    },
    {
        id: "justiciar_faceguard",
        name: "Justiciar faceguard",
        objId: 22326,
        how: PURPLE,
        from: { ...TOB, weight: 2 },
    },
    {
        id: "justiciar_chestguard",
        name: "Justiciar chestguard",
        objId: 22327,
        how: PURPLE,
        from: { ...TOB, weight: 2 },
    },
    {
        id: "justiciar_legguards",
        name: "Justiciar legguards",
        objId: 22328,
        how: PURPLE,
        from: { ...TOB, weight: 2 },
    },
    {
        id: "scythe_of_vitur_uncharged",
        name: "Scythe of Vitur (uncharged)",
        objId: 22486,
        how: PURPLE,
        from: { ...TOB, weight: 1 },
    },
    {
        id: "holy_scythe_of_vitur_uncharged",
        name: "Holy Scythe of Vitur (uncharged)",
        objId: 25738,
        how: `${HARD_PURPLE} Unlocks the Holy Scythe as a weapon.`,
        from: { ...TOB, weight: 1, hard: true },
    },
    {
        id: "holy_ornament_kit",
        name: "Holy ornament kit",
        objId: 25742,
        how: HARD_PURPLE,
        from: { ...TOB, weight: 1, hard: true },
    },
    {
        id: "sanguine_ornament_kit",
        name: "Sanguine ornament kit",
        objId: 25744,
        how: HARD_PURPLE,
        from: { ...TOB, weight: 1, hard: true },
    },
    {
        id: "sanguine_dust",
        name: "Sanguine dust",
        objId: 25746,
        how: HARD_PURPLE,
        from: { ...TOB, weight: 1, hard: true },
    },
    // Lil' Zik's looks, from the expert mode's chest
    ...(
        [
            ["lil_maiden", "Lil' Maiden", 25748],
            ["lil_bloat", "Lil' Bloat", 25749],
            ["lil_nylo", "Lil' Nylo", 25750],
            ["lil_sot", "Lil' Sot", 25751],
            ["lil_xarp", "Lil' Xarp", 25752],
        ] as const
    ).map(([id, name, objId]) => ({
        id,
        name,
        objId,
        how: "One each time the Theatre of Blood's beaten on expert mode, until you have them all.",
        from: { ...TOB, weight: 1, expert: true },
    })),
    {
        id: "lil_zik",
        name: "Lil' Zik",
        objId: 22473,
        how: "A very rare drop from Verzik Vitur in the Theatre of Blood.",
        from: {
            kind: "boss",
            enemyId: "tob_verzik_vitur_spider",
            mapId: "theatre_of_blood",
            chance: 1 / 50,
        },
    },
    // The Hallowed Sepulchre's pet (pets.ts), shown as the Dark acorn, its item in OSRS
    {
        id: "dark_squirrel",
        name: "Dark squirrel",
        objId: 24733,
        how: "1 in 10 for defeating Justiciar Zachariah; always on hard mode.",
        from: {
            kind: "boss",
            enemyId: "justiciar_zachariah",
            mapId: "zachariah",
            chance: 1 / 10,
            hardChance: 1,
        },
    },
);

// The Tombs of Amascut's uniques, weighted as OSRS's are, its pet, the Thread and the jewels
const TOMBS_PURPLE = "From the Tombs of Amascut's chest, more often the higher the raid level.";
TROPHIES.push(
    ...(
        [
            // OSRS's: under 150, only the fang and the Lightbearer
            ["osmumtens_fang", "Osmumten's fang", 26219, 7, 50],
            ["lightbearer", "Lightbearer", 25975, 7, 50],
            ["elidinis_ward", "Elidinis' ward", 25985, 3, 150],
            ["masori_mask", "Masori mask", 27226, 2, 150],
            ["masori_body", "Masori body", 27229, 2, 150],
            ["masori_chaps", "Masori chaps", 27232, 2, 150],
            ["tumekens_shadow", "Tumeken's shadow", 27277, 1, 150],
        ] as const
    ).map(([id, name, objId, weight, level]) => ({
        id,
        name,
        objId,
        how: level > 50 ? `${TOMBS_PURPLE} From raid level ${level}.` : TOMBS_PURPLE,
        from: { kind: "tombs", level, weight } as const,
    })),
    {
        id: "tumekens_guardian",
        name: "Tumeken's guardian",
        objId: 27352,
        how: "A very rare find in the Tombs of Amascut's chest, at any raid level.",
        from: { kind: "tombs", level: 0, chance: 1 / 40 },
    },
    {
        id: "thread_of_elidinis",
        name: "Thread of Elidinis",
        objId: 27279,
        how: "Sometimes in the Tombs of Amascut's chest, at any raid level. Unlocks the Divine rune pouch as a passive.",
        from: { kind: "tombs", level: 0, chance: 1 / 10 },
    },
    {
        id: "breach_of_the_scarab",
        name: "Breach of the Scarab",
        objId: 27283,
        how: "Rarely in the Tombs of Amascut's chest, from raid level 150. Unlocks the Keris partisan of breaching as a weapon.",
        from: { kind: "tombs", level: 150, chance: 1 / 25 },
    },
    {
        id: "eye_of_the_corruptor",
        name: "Eye of the Corruptor",
        objId: 27285,
        how: "Rarely in the Tombs of Amascut's chest, from raid level 300. Unlocks the Keris partisan of corruption as a weapon.",
        from: { kind: "tombs", level: 300, chance: 1 / 25 },
    },
    {
        id: "jewel_of_the_sun",
        name: "Jewel of the Sun",
        objId: 27289,
        how: "Rarely in the Tombs of Amascut's chest, from raid level 400. Unlocks the Keris partisan of the sun as a weapon.",
        from: { kind: "tombs", level: 400, chance: 1 / 25 },
    },
    {
        id: "jewel_of_amascut",
        name: "Jewel of Amascut",
        objId: 30893,
        how: "Very rarely in the Tombs of Amascut's chest, at raid level 500. Unlocks the Keris partisan of amascut as a weapon.",
        from: { kind: "tombs", level: 500, chance: 1 / 50 },
    },
);

// Thanksgiving Harvest's: Chompy bird drops, the turkey's secateurs, its victories' rewards
// and its quest's pet. The Turkey hat and Golden egg are the cache's Pheasant hat and
// Golden pheasant egg
TROPHIES.push(
    {
        id: "rubber_chicken",
        name: "Rubber chicken",
        objId: 4566,
        how: "A rare drop from a Chompy bird.",
        from: { kind: "enemy", enemyId: "chompy_bird", mapId: "thanksgiving", chance: 1 / 200 },
    },
    {
        id: "turkey_hat",
        name: "Turkey hat",
        objId: 28620,
        how: "A rare drop from a Chompy bird.",
        from: { kind: "enemy", enemyId: "chompy_bird", mapId: "thanksgiving", chance: 1 / 400 },
    },
    {
        id: "magic_secateurs",
        name: "Magic secateurs",
        objId: 7409,
        how: "Sometimes found when carving a roasted turkey.",
        from: { kind: "turkey", chance: 1 / 5 },
    },
    {
        id: "golden_feather",
        name: "Golden feather",
        objId: 10175,
        how: "A very rare drop from a Chompy bird.",
        from: { kind: "enemy", enemyId: "chompy_bird", mapId: "thanksgiving", chance: 1 / 1000 },
    },
    {
        id: "chompy_hat",
        name: "Chompy bird hat",
        objId: 2978,
        how: "Reward for defeating the Evil Chicken and completing Thanksgiving Harvest.",
        from: { kind: "map", mapId: "thanksgiving", requiresBoss: "evil_chicken" },
    },
    {
        id: "ledger_of_the_harvest",
        name: "Ledger of the Harvest",
        objId: 25688,
        how: "Reward for defeating the Freaky Forester and completing Thanksgiving Harvest.",
        from: {
            kind: "map",
            mapId: "thanksgiving",
            requiresBoss: "freaky_forester_final",
        },
    },
    {
        id: "chompy_chick",
        name: "Chompy chick",
        objId: 13071,
        how: "Complete the Chompy Slayer quest.",
        from: { kind: "quest", questId: "thanksgiving_chompy_hunt", mapId: "thanksgiving" },
    },
    {
        id: "golden_egg",
        name: "Golden egg",
        objId: 28663,
        how: "Complete Thanksgiving Harvest on hard mode.",
        from: {
            kind: "map",
            mapId: "thanksgiving",
            requiresBoss: "freaky_forester_final",
            hard: true,
        },
    },
);

export const TROPHY_BY_ID: Map<string, TrophyDef> = new Map(TROPHIES.map((t) => [t.id, t]));

export function trophyName(trophy: TrophyDef): string {
    return tr(`trophy.${trophy.id}.name`, trophy.name);
}

// A trophy a raid's chest gives one of every time (expert mode's Lil' Zik looks), one not found
// yet till they're all found (Sim.openRaidChest)
export function isEveryTimeTrophy(trophy: TrophyDef): boolean {
    return trophy.from.kind === "raid" && (trophy.from.expert ?? false);
}

// A trophy from a raid's chest, the Theatre's or the Tombs'. They're unlocks, so a chest never
// gives one the player has already (Sim.openRaidChest, Sim.openTombsChest)
export function isRaidChestTrophy(trophy: TrophyDef): boolean {
    return trophy.from.kind === "raid" || trophy.from.kind === "tombs";
}

// Those of them a save has found, for the chests to go by
export function getRaidChestTrophiesFound(trophies: readonly string[]): string[] {
    return trophies.filter((id) => {
        const trophy = TROPHY_BY_ID.get(id);
        return trophy !== undefined && isRaidChestTrophy(trophy);
    });
}
