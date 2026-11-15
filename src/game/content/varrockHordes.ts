import { EnemyDef, LevelXpDef, RunEventDef, WaveDef } from "./types";
import { paced } from "./waves";

// Yama's demons in burnt Varrock (the Battle for Varrock, fun/maps.ts): the hordes a hero farms
// for levels before taking on a general (content/xarth.ts, content/kril.ts). Hell's hordes: from
// the eighth minute twice Lumbridge's crowd, coming twice as fast (HORDE), with imps first, then
// reanimated demons and hellhounds, lesser demons, the Wilderness's revenant demons, greater
// demons and at last black demons. The map has no clock, so the last wave goes on, getting
// tougher by the minute as everywhere (Sim.enemyHpScale): farming forever isn't free.

// Greater and black demons, as the lesser demon is (enemies.ts): their own npcs, on the demons'
// shared animations
const DEMON_IDLE = 66;
const DEMON_WALK = 63;
const DEMON_ATTACK = 64;
const DEMON_DEATH = 67;
// An imp's
const DEMON_SOUNDS = { attack: 534, hit: 536, death: 535 };

// None of them has a faction (EnemyDef.faction), so they come from every side, the God Wars
// hellhound's copy too

export const VARROCK_ENEMIES: EnemyDef[] = [
    {
        id: "greater_demon",
        name: "Greater demon",
        npcId: 2025,
        idleSeq: DEMON_IDLE,
        walkSeq: DEMON_WALK,
        attackSeq: DEMON_ATTACK,
        deathSeq: DEMON_DEATH,
        hp: 62,
        damage: 7,
        speed: 1.9,
        radius: 0.5,
        xp: 36,
        sounds: DEMON_SOUNDS,
        // Three tiles across in OSRS
        scale: 0.7,
        knockbackResist: 0.6,
    },
    {
        id: "black_demon",
        name: "Black demon",
        npcId: 240,
        idleSeq: DEMON_IDLE,
        walkSeq: DEMON_WALK,
        attackSeq: DEMON_ATTACK,
        deathSeq: DEMON_DEATH,
        hp: 76,
        damage: 8,
        speed: 1.8,
        radius: 0.5,
        xp: 44,
        sounds: DEMON_SOUNDS,
        scale: 0.75,
        knockbackResist: 0.7,
    },
    {
        id: "varrock_hellhound",
        name: "Hellhound",
        npcId: 3133,
        idleSeq: 6580,
        walkSeq: 6582,
        attackSeq: 6581,
        deathSeq: 6576,
        hp: 36,
        damage: 5,
        speed: 2.3,
        radius: 0.4,
        xp: 22,
        sounds: { attack: 710, hit: 713, death: 711 },
        scale: 0.8,
        knockbackResist: 0.3,
    },
];

// How many more of them there are than Lumbridge's pace (paced) brings, and how much faster they
// come: the battle's against the hordes of hell. The first wave's imps come at Lumbridge's pace,
// while the hero has next to no blessings, and the crowd grows to HORDE times that by wave
// HORDE_BY (the eighth minute). Its levels need more experience to match (MapDef.levelXp).
export const HORDE = 2;
const HORDE_BY = 7;

// The experience its levels need (MapDef.levelXp): the first few as anywhere, as the hero has
// nothing else to start with, then more for each, to six times as much from level 14 on. A blessing
// is worth more than a pick, and twice the crowd brings in about twice the experience.
export const VARROCK_LEVEL_XP: LevelXpDef = { times: 6, from: 4, to: 14 };

export const VARROCK_WAVES: WaveDef[] = paced([
    [{ id: "imp", weight: 1 }],
    [{ id: "imp", weight: 1 }],
    [
        { id: "imp", weight: 2 },
        { id: "reanimated_demon", weight: 1 },
    ],
    [
        { id: "reanimated_demon", weight: 3 },
        { id: "imp", weight: 1 },
    ],
    [
        { id: "reanimated_demon", weight: 2 },
        { id: "varrock_hellhound", weight: 1 },
    ],
    [
        { id: "varrock_hellhound", weight: 2 },
        { id: "reanimated_demon", weight: 2 },
    ],
    [
        { id: "varrock_hellhound", weight: 2 },
        { id: "lesser_demon", weight: 1 },
    ],
    [
        { id: "lesser_demon", weight: 2 },
        { id: "varrock_hellhound", weight: 2 },
    ],
    [
        { id: "lesser_demon", weight: 3 },
        { id: "revenant_demon", weight: 1 },
    ],
    [
        { id: "greater_demon", weight: 2 },
        { id: "lesser_demon", weight: 2 },
    ],
    [
        { id: "greater_demon", weight: 2 },
        { id: "revenant_demon", weight: 2 },
    ],
    [
        { id: "greater_demon", weight: 3 },
        { id: "varrock_hellhound", weight: 1 },
    ],
    [
        { id: "black_demon", weight: 2 },
        { id: "greater_demon", weight: 2 },
    ],
    [
        { id: "black_demon", weight: 3 },
        { id: "revenant_demon", weight: 1 },
    ],
    [
        { id: "black_demon", weight: 3 },
        { id: "greater_demon", weight: 2 },
    ],
]).map((wave, i) => {
    const horde = 1 + (HORDE - 1) * Math.min(1, i / HORDE_BY);
    return {
        ...wave,
        spawnRate: wave.spawnRate * horde,
        minAlive: Math.round(wave.minAlive * horde),
        maxAlive: Math.round(wave.maxAlive * horde),
    };
});

// An elite a minute from 100 seconds (five times its kind's experience, to level on), and rings of
// imps, hellhounds and lesser demons closing in now and then
const ELITES = [
    "imp",
    "reanimated_demon",
    "reanimated_demon",
    "varrock_hellhound",
    "varrock_hellhound",
    "lesser_demon",
    "lesser_demon",
    "revenant_demon",
    "greater_demon",
    "greater_demon",
    "black_demon",
    "greater_demon",
    "black_demon",
];

const RINGS: RunEventDef[] = [
    { at: 360, kind: "ring", enemyId: "imp", count: 30 * HORDE },
    { at: 600, kind: "ring", enemyId: "varrock_hellhound", count: 36 * HORDE },
    { at: 840, kind: "ring", enemyId: "lesser_demon", count: 40 * HORDE },
];

export const VARROCK_EVENTS: RunEventDef[] = [
    ...ELITES.map((enemyId, i): RunEventDef => ({ at: 100 + i * 60, kind: "elite", enemyId })),
    ...RINGS,
].sort((a, b) => a.at - b.at);
