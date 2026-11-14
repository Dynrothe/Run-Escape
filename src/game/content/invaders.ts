import type { EnemyDef } from "./types";

// Awakened invasions (act-2-fallen-empire.md 8.6, content/invasions.ts): the four Act II maps' final
// bosses, each made into an invader of the older maps. This is only the enemies, so enemies.ts can
// add them without the rest of the invasions' imports.

// Which world's pocket an invader brings (core/rules/invasion.ts): the Stranglewood's roots, the
// realm through a puddle, Ghorrock's cold, the Scar's dark
export type PocketKind = "roots" | "realm" | "cold" | "dark";

export type InvaderDef = {
    // Its enemy id, and the Act II boss it's made from (and the map that's that boss's)
    id: string;
    bossId: string;
    mapId: string;
    pocket: PocketKind;
};

export const INVADERS: InvaderDef[] = [
    {
        id: "invading_vardorvis",
        bossId: "vardorvis",
        mapId: "stranglewood",
        pocket: "roots",
    },
    {
        id: "invading_whisperer",
        bossId: "whisperer",
        mapId: "lassar_undercity",
        pocket: "realm",
    },
    {
        id: "invading_duke",
        bossId: "duke_sucellus",
        mapId: "ghorrock",
        pocket: "cold",
    },
    {
        id: "invading_leviathan",
        bossId: "the_leviathan",
        mapId: "scar",
        pocket: "dark",
    },
];

export const INVADER_BY_ID: ReadonlyMap<string, InvaderDef> = new Map(
    INVADERS.map((invader) => [invader.id, invader]),
);

// An Act II final boss as an invader: a mid-run boss, so no entrance (an entrance sends the crowd
// and any other boss off), no summons (the Whisperer's siphon, the Leviathan's pathfinder and the
// dark, Vardorvis's head: each is its own map's), and none of the attacks that need its map's
// scenery (the Duke's vents and the pillars his gaze is hidden from). Its kill drops a master
// casket (Sim adds the coins). The Whisperer can only be hurt in her realm: the pocket's puddle is
// the way to her.
export function makeInvader(boss: EnemyDef, invader: InvaderDef): EnemyDef {
    const def = boss.boss!;
    return {
        ...boss,
        id: invader.id,
        spawnMessage: `${boss.name} invades!`,
        caskets: ["master"],
        ...(invader.pocket === "realm" && { hurtIn: 1 as const }),
        boss: {
            ...def,
            intro: undefined,
            summonsAt: undefined,
            fallSeconds: undefined,
            attacks: def.attacks.filter((attack) => !attack.rule?.vent && !attack.cover),
        },
    };
}

export function getInvaders(find: (id: string) => EnemyDef): EnemyDef[] {
    return INVADERS.map((invader) => makeInvader(find(invader.bossId), invader));
}
