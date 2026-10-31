import { EnemyDef, MapDef } from "./types";

// TEMPORARY, hw-content branch only: stand-ins for what the other Halloween
// branches bring (map `halloween`, The Nightmare, her Sleepwalkers), so what
// refers to them can be tested here. Each steps aside as soon as the real one
// exists, and this file and its two uses (enemies.ts, maps.ts) go at the merge.
const STUB_SOUNDS = { attack: 2564, hit: 513, death: 512 };

export const HALLOWEEN_STUB_ENEMIES: EnemyDef[] = [
    {
        id: "the_nightmare",
        name: "The Nightmare",
        npcId: 9425,
        idleSeq: 808,
        walkSeq: 819,
        attackSeq: 422,
        deathSeq: 836,
        hp: 1500,
        damage: 0,
        speed: 1.5,
        radius: 0.45,
        xp: 2500,
        sounds: STUB_SOUNDS,
        knockbackResist: 1,
        boss: {
            attackInterval: 3,
            enrage: { message: "The Nightmare stirs." },
            attacks: [
                {
                    name: "Claw",
                    kind: "swing",
                    damage: 3,
                    windup: 1,
                    cooldown: 0,
                    range: 3,
                    radius: 2.5,
                    weight: 1,
                },
            ],
        },
    },
    {
        id: "sleepwalker",
        name: "Sleepwalker",
        npcId: 9446,
        idleSeq: 808,
        walkSeq: 819,
        attackSeq: 422,
        deathSeq: 836,
        hp: 10,
        damage: 1,
        speed: 1,
        radius: 0.45,
        xp: 1,
        sounds: STUB_SOUNDS,
    },
];

// On Lumbridge's ground, with the bosses a minute apart for trying them out.
// Not a dev map, so its runs reach the save and the results screen as the real
// one's will; it's on no map screen, only `game.store.set({ mapId: "halloween" })`.
export function getHalloweenStubMap(maps: MapDef[]): MapDef[] {
    if (maps.some((map) => map.id === "halloween")) {
        return [];
    }
    return [
        {
            ...maps[0],
            id: "halloween",
            name: "Hallowed Night",
            waves: [
                {
                    start: 0,
                    enemies: [
                        { id: "goblin", weight: 3 },
                        { id: "ghost", weight: 2 },
                    ],
                    spawnRate: 3,
                    minAlive: 20,
                    maxAlive: 60,
                },
            ],
            events: [
                { at: 30, kind: "boss", enemyId: "slash_bash" },
                { at: 90, kind: "boss", enemyId: "the_mimic" },
                { at: 150, kind: "finalBoss", enemyId: "the_nightmare" },
            ],
        },
    ];
}
