import { EnemyDef, EnemyShotDef, WaveDef } from "./types";

// The Tombs of Amascut (in development: docs/design/tombs-of-amascut.md): its enemies, and what
// each path's room does. The map, with where things stand, is the dev map's
// (scaperune/maps/tombsOfAmascut.ts); this is the data the sim plays it by.

// ---- The baboons of the Path of Apmeken ----
//
// All on the baboon skeleton (2063): idle 9741, walk 9739, flinch 9746, death 9744 (1.8s, ending
// in the thud 5971). Attacks by kind: a swipe 9742, a throw 9743, a cast 9748, the shaman's call
// 9751. Their sounds are their animations' own (scripts/cache/sounds.ts seqs).

const IDLE = 9741;
const WALK = 9739;
const DEATH = 9744;

// The thrower's rock: a small one of the baboon's own (model 46350)
const THROWN_ROCK: EnemyShotDef = {
    range: 7,
    interval: 2.6,
    speed: 8,
    spotAnim: 2243,
    seq: 9743,
    sound: 5962,
};

// The mage's spell: an earth blast until the baboons' own is found
const BABOON_SPELL: EnemyShotDef = {
    range: 8,
    interval: 3,
    speed: 9,
    castSpotAnim: 138,
    spotAnim: 139,
    impactSpotAnim: 140,
    seq: 9748,
    sound: 5952,
};

function baboon(def: Omit<EnemyDef, "idleSeq" | "walkSeq" | "deathSeq" | "radius">): EnemyDef {
    return { idleSeq: IDLE, walkSeq: WALK, deathSeq: DEATH, radius: 0.35, ...def };
}

export const TOMBS_ENEMIES: EnemyDef[] = [
    baboon({
        id: "baboon_brawler",
        name: "Baboon Brawler",
        npcId: 11709,
        attackSeq: 9742,
        hp: 34,
        damage: 5,
        speed: 2.7,
        xp: 18,
        sounds: { attack: 5984, hit: 5998, death: 5971 },
    }),
    baboon({
        id: "baboon_thrower",
        name: "Baboon Thrower",
        npcId: 11710,
        attackSeq: 9743,
        hp: 26,
        damage: 4,
        speed: 2.4,
        xp: 18,
        shot: THROWN_ROCK,
        sounds: { attack: 5962, hit: 5998, death: 5971 },
    }),
    baboon({
        id: "baboon_mage",
        name: "Baboon Mage",
        npcId: 11711,
        attackSeq: 9748,
        hp: 26,
        damage: 4,
        speed: 2.4,
        xp: 18,
        shot: BABOON_SPELL,
        sounds: { attack: 5952, hit: 5998, death: 5971 },
    }),
    // Calls in thralls until it's dead: kill it first, as in OSRS
    baboon({
        id: "baboon_shaman",
        name: "Baboon Shaman",
        npcId: 11715,
        attackSeq: 9751,
        hp: 48,
        damage: 4,
        speed: 2.2,
        xp: 30,
        spawns: {
            enemies: [{ id: "baboon_thrall", weight: 1 }],
            interval: 5,
            count: 2,
            max: 8,
            radius: 1.5,
        },
        sounds: { attack: 5989, hit: 5998, death: 5971 },
    }),
    baboon({
        id: "baboon_thrall",
        name: "Baboon Thrall",
        npcId: 11718,
        attackSeq: 9742,
        hp: 10,
        damage: 3,
        speed: 3.1,
        xp: 4,
        sounds: { attack: 5984, hit: 5998, death: 5971 },
    }),
    // Blows up when it dies, hurting its own pack as well as you: lure them in together
    baboon({
        id: "volatile_baboon",
        name: "Volatile Baboon",
        npcId: 11716,
        attackSeq: 9742,
        hp: 22,
        damage: 4,
        speed: 3,
        xp: 22,
        explodes: { damage: 14, radius: 2.5, spotAnim: 157, sound: 2500, pack: 60 },
        sounds: { attack: 5984, hit: 5998, death: 5971 },
    }),
    // Its touch curses: weaker for a while, and more with each
    baboon({
        id: "cursed_baboon",
        name: "Cursed Baboon",
        npcId: 11717,
        attackSeq: 9742,
        hp: 40,
        damage: 5,
        speed: 2.6,
        xp: 26,
        touches: {
            kind: "debuff",
            id: "baboon_curse",
            name: "Cursed",
            // The Cursed phalanx
            iconObjId: 27248,
            stats: { meleeMight: -0.08, rangedMight: -0.08, magicMight: -0.08 },
            seconds: 10,
            stacks: 4,
        },
        sounds: { attack: 5984, hit: 5998, death: 5971 },
    }),
];

// ---- The Apmeken room ----

// The room's eight waves, as OSRS's go: each a group sent when the last is dead (or has been about
// long enough), getting meaner, the shamans and the specials (volatile, cursed) coming in later.
// Past the first path the raid's been through, each wave brings one more of its commonest.
export const APMEKEN_WAVES: string[][] = [
    ["baboon_brawler", "baboon_brawler", "baboon_shaman"],
    ["baboon_thrower", "baboon_thrower", "baboon_brawler"],
    ["baboon_mage", "baboon_mage", "baboon_shaman"],
    ["baboon_brawler", "baboon_thrower", "baboon_mage", "volatile_baboon"],
    ["cursed_baboon", "baboon_thrower", "baboon_mage", "baboon_shaman"],
    ["volatile_baboon", "volatile_baboon", "cursed_baboon", "baboon_brawler"],
    ["baboon_shaman", "baboon_shaman", "cursed_baboon", "baboon_mage", "baboon_thrower"],
    ["baboon_shaman", "volatile_baboon", "volatile_baboon", "cursed_baboon", "cursed_baboon"],
];

// The stream of baboons between the waves, what levels a run up there: how many at once and how
// often, rising with the wave the room's on
export function getApmekenTrickle(wave: number): WaveDef {
    return {
        start: 0,
        spawnRate: 1.2 + wave * 0.35,
        minAlive: 6 + wave * 2,
        maxAlive: 16 + wave * 4,
        enemies:
            wave < 2
                ? [
                      { id: "baboon_brawler", weight: 3 },
                      { id: "baboon_thrall", weight: 4 },
                  ]
                : [
                      { id: "baboon_brawler", weight: 3 },
                      { id: "baboon_thrower", weight: 2 },
                      { id: "baboon_mage", weight: 2 },
                      { id: "baboon_thrall", weight: 3 },
                  ],
    };
}

// What an issue looks like: falling debris at a pillar giving way (models of the room's own
// Debris, 45320 on), a vent's gas building, and each as it goes. Guesses from the cache's ids,
// to be looked at.
export const APMEKEN_SPOTANIMS = {
    pillar: 2114,
    pillarFalls: 2115,
    vent: 2122,
    ventBursts: 2123,
};

// What fails, and what that costs. Path levels (the invocations) make it all quicker.
export const APMEKEN = {
    // Seconds a wave can go on before the next comes anyway
    waveSeconds: 40,
    // Seconds between issues, from when the last was fixed or failed (less a second a path level)
    issueEvery: 9,
    // Seconds to fix one before it goes (less one and a half a path level)
    deadline: 12,
    // Seconds stood at it to fix it
    fixSeconds: 2,
    // Tiles from its middle that count as at it
    reach: 2,
    // What one left to go does to every player, before the enemies' scaling, and more for each
    // that's gone this wave: a pillar's falling rock, a vent's burst
    damage: 10,
    // And a share more for each that went before it this wave
    worse: 0.5,
};
