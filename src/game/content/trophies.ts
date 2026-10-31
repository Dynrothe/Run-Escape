// Trophies: rare finds that do nothing in a run. They're kept in the Collection
// log, and in the save once they're found.
export type TrophySource =
    // This chance on each kill of the boss on the map
    | { kind: "boss"; enemyId: string; mapId: string; chance: number }
    // This chance on each trick or treat pumpkin opened
    | { kind: "pumpkin"; chance: number };

export type TrophyDef = {
    id: string;
    name: string;
    objId: number;
    // Where it's from, for the Collection log
    how: string;
    from: TrophySource;
};

const NIGHTMARE = { kind: "boss", enemyId: "the_nightmare", mapId: "halloween" } as const;

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

export const TROPHY_BY_ID: Map<string, TrophyDef> = new Map(TROPHIES.map((t) => [t.id, t]));
