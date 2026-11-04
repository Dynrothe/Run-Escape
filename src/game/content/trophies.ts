import { CombatTier } from "./types";

// Trophies: rare finds, kept in the Collection log, and in the save once they're
// found. They do nothing in a run, but a few bring a weapon into the game (the
// Theatre of Blood's rapier and Holy Scythe: UnlockTask "raidChest").
export type TrophySource =
    // This chance on each kill of the boss on the map, or hardChance on hard mode
    | { kind: "boss"; enemyId: string; mapId: string; chance: number; hardChance?: number }
    // This chance on each trick or treat pumpkin opened
    | { kind: "pumpkin"; chance: number }
    // A raid's chest, once its last boss is down: a purple's one of these by weight (Sim's
    // openRaidChest has the chance), and a hard raid's own are a roll of their own. An expert
    // raid's own: one of them each time it's beaten.
    | { kind: "raid"; mapId: string; weight: number; hard?: boolean; expert?: boolean }
    // Combat Achievements: a tier's reward, once enough points are had (combatTasks.ts)
    | { kind: "combatTier"; tier: CombatTier };

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
        how: "One each time the Theatre of Blood's beaten on expert mode.",
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

// Combat Achievements' tier rewards, as in OSRS. Last, so nothing that rolls for a trophy meets
// them first.
TROPHIES.push(
    ...(
        [
            ["easy", "Easy", 1, 25926],
            ["medium", "Medium", 2, 25928],
            ["hard", "Hard", 3, 25930],
            ["elite", "Elite", 4, 25932],
            ["master", "Master", 5, 25934],
            ["grandmaster", "Grandmaster", 6, 25936],
        ] as const
    ).map(([tier, name, n, objId]) => ({
        id: `ghommals_hilt_${n}`,
        name: `Ghommal's hilt ${n}`,
        objId,
        how: `The ${name} tier's reward in Combat Achievements.`,
        from: { kind: "combatTier", tier } as const,
    })),
);

export const TROPHY_BY_ID: Map<string, TrophyDef> = new Map(TROPHIES.map((t) => [t.id, t]));
