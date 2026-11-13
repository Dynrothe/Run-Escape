import type { EnemyDef, RealmRuleDef, RunEventDef, WaveDef } from "./types";
import { RUN_LENGTH, paced } from "./waves";

// The Lassar Undercity, Act II's second map (docs/design/act-2-fallen-empire.md, section 4): the
// drowned city's crawling hands, ghosts, leeches and guardians, its Shadow Realm's shadows and
// keepers, the Shadow Keeper, the Forsaken Assassin and the Whisperer, and the rule (MapDef.rule)
// that turns the party between the two. Every id is the cache's (scripts/cache/find-npcs.ts,
// find-npc-seqs.ts and classify-npc-seqs.ts for the animations no NPC lists).

// None of the city's own animations play a sound (scripts/cache/sounds.ts seqs): the game's other
// ghosts', bats' and zombies' stand in. The Whisperer's volley plays hers.
const HAND_SOUNDS = { attack: 918, hit: 923, death: 922 };
const GHOST_SOUNDS = { attack: 436, hit: 439, death: 438 };
const LEECH_SOUNDS = { attack: 292, hit: 294, death: 293 };
const GUARDIAN_SOUNDS = HAND_SOUNDS;
const SHADOW_SOUNDS = GHOST_SOUNDS;
const HUMAN_SOUNDS = { attack: 2564, hit: 513, death: 512 };
const WHISPERER_SOUNDS = { attack: 7284, hit: 7389, death: 7408 };

// The Whisperer's own spot animations (her models' neighbours in the cache): a soul's glow, her
// shots and their bursts, the dark that ripples out as the world turns
const SOUL_FLASH = 2447;
const WHISPER_SHOT = 2451;
const WHISPER_BURST = 2452;
const SHADOW_RIPPLE = 2450;
const TENTACLE_LASH = 2460;
// Dust thrown up (the Sepulchre's dust, as the floors use)
const DUST = 2699;
const BLOWN_DUST = 2184;

export const CRAWLING_HAND_ID = "lassar_hand";
export const LOST_SOUL_ID = "lost_soul";
export const SHADOW_ID = "lassar_shadow";

export const LASSAR_ENEMIES: EnemyDef[] = [
    // The city's crowd: Lassar's own crawling hands (an NPC that never fights in OSRS, so its
    // numbers are ours)
    {
        id: CRAWLING_HAND_ID,
        name: "Crawling Hand",
        npcId: 12249,
        idleSeq: 1588,
        walkSeq: 1589,
        attackSeq: 1592,
        deathSeq: 1590,
        hp: 6,
        damage: 1,
        speed: 2,
        radius: 0.35,
        xp: 6,
        sounds: HAND_SOUNDS,
        knockbackResist: 0.15,
    },
    // Fast, and their bite drains a while after
    {
        id: "lassar_leech",
        name: "Wighted Leech",
        npcId: 12335,
        idleSeq: 2180,
        walkSeq: 2179,
        attackSeq: 2181,
        deathSeq: -1,
        hp: 12,
        damage: 2,
        speed: 3.1,
        radius: 0.35,
        xp: 10,
        sounds: LEECH_SOUNDS,
        touches: { kind: "poison", damage: 1, seconds: 3 },
    },
    // Through walls, as ghosts go here
    {
        id: "lassar_ghost",
        name: "Ghost",
        npcId: 12254,
        idleSeq: 5530,
        walkSeq: 5531,
        attackSeq: 5532,
        deathSeq: 5534,
        hp: 26,
        damage: 3,
        speed: 2.2,
        radius: 0.4,
        xp: 18,
        sounds: GHOST_SOUNDS,
        ghost: true,
    },
    // Slow and hard, and the elite
    {
        id: "ancient_guardian",
        name: "Ancient Guardian",
        npcId: 12336,
        idleSeq: 10401,
        walkSeq: 10399,
        attackSeq: 10402,
        deathSeq: 10404,
        hp: 40,
        damage: 4,
        speed: 1.8,
        radius: 0.45,
        xp: 26,
        sounds: GUARDIAN_SOUNDS,
        // Three tiles across in OSRS
        scale: 0.6,
        knockbackResist: 0.6,
    },
    // The realm's crowd
    {
        id: SHADOW_ID,
        name: "Shadow",
        npcId: 4004,
        idleSeq: 2740,
        walkSeq: 2737,
        attackSeq: 2738,
        deathSeq: 2735,
        hp: 10,
        damage: 2,
        speed: 2.4,
        radius: 0.35,
        xp: 8,
        sounds: SHADOW_SOUNDS,
        knockbackResist: 0.15,
    },
    // The realm's elite, and its later crowd
    {
        id: "shadow_keeper",
        name: "Shadow Keeper",
        npcId: 12248,
        idleSeq: 66,
        walkSeq: 63,
        attackSeq: 64,
        deathSeq: 4623,
        hp: 40,
        damage: 4,
        speed: 1.8,
        radius: 0.45,
        xp: 26,
        sounds: SHADOW_SOUNDS,
        // Two tiles across in OSRS
        scale: 0.75,
        knockbackResist: 0.5,
    },
    // Rises in the realm near the party (RealmRuleDef.risers) and lashes out from where it stands
    {
        id: "lassar_tentacle",
        name: "Tentacle",
        npcId: 12208,
        idleSeq: 10264,
        walkSeq: 10264,
        attackSeq: 10266,
        deathSeq: -1,
        hp: 60,
        damage: 3,
        speed: 0,
        radius: 0.8,
        xp: 20,
        sounds: { attack: 7101, hit: 7119, death: 7052 },
        // Three tiles across in OSRS
        scale: 0.6,
        stationary: true,
        solid: true,
        shot: { range: 5, interval: 2.6, speed: 10, spotAnim: TENTACLE_LASH, seq: 10266 },
        spawnSpotAnim: BLOWN_DUST,
    },
    // Not an enemy: the way back (RealmRuleDef.souls). They flee at about four fifths of a player's
    // pace, and walking into one catches it.
    {
        id: LOST_SOUL_ID,
        name: "Lost Soul",
        npcId: 12212,
        idleSeq: 5538,
        walkSeq: 5539,
        attackSeq: 5538,
        deathSeq: -1,
        hp: 1,
        damage: 0,
        speed: 2.6,
        radius: 0.4,
        xp: 0,
        sounds: { attack: -1, hit: -1, death: -1 },
        unhittable: true,
        caught: true,
        flees: { range: 7 },
        hintArrow: true,
        spawnSpotAnim: SOUL_FLASH,
    },
    // The Whisperer's Soul Siphon: souls drawn to her, each healing her as it reaches her. Caught on
    // the way, it's one of the way back's.
    {
        id: "siphoned_soul",
        name: "Lost Soul",
        npcId: 12212,
        idleSeq: 5538,
        walkSeq: 5539,
        attackSeq: 5538,
        deathSeq: -1,
        hp: 1,
        damage: 0,
        speed: 1.5,
        radius: 0.4,
        xp: 0,
        sounds: { attack: -1, hit: -1, death: -1 },
        unhittable: true,
        caught: true,
        heals: {
            fraction: 0.025,
            interval: 0.5,
            range: 1.2,
            targets: ["whisperer"],
            seek: 30,
            once: true,
            spotAnim: SOUL_FLASH,
        },
        spawnSpotAnim: SOUL_FLASH,
    },
    // 5:00. He drags the party into the realm with him, and stays there: he's killed in his world
    {
        id: "shadow_keeper_boss",
        name: "Shadow Keeper",
        npcId: 12248,
        idleSeq: 66,
        walkSeq: 63,
        attackSeq: 64,
        deathSeq: 4623,
        hp: 4000,
        damage: 0,
        speed: 2.1,
        radius: 0.6,
        xp: 1500,
        sounds: SHADOW_SOUNDS,
        scale: 0.75 * 1.6,
        knockbackResist: 1,
        realm: "drags",
        spawnMessage: "The Shadow Keeper drags you into the Shadow Realm!",
        boss: {
            attackInterval: 2.8,
            enrage: { message: "The Shadow Keeper is enraged!" },
            attacks: [
                {
                    name: "Grasp",
                    kind: "swing",
                    damage: 4,
                    windup: 0.7,
                    cooldown: 0,
                    range: 3,
                    radius: 2.4,
                    cone: 2.2,
                    weight: 4,
                    seq: 64,
                    sound: 436,
                },
                {
                    name: "Shadow burst",
                    kind: "blast",
                    damage: 5,
                    windup: 1.1,
                    cooldown: 5,
                    range: 10,
                    radius: 2.2,
                    weight: 4,
                    seq: 65,
                    sound: 436,
                    impactSpotAnim: WHISPER_BURST,
                    impact: { spots: [{ spotAnim: WHISPER_BURST }], shake: 0.25 },
                },
                {
                    name: "Call the shadows",
                    kind: "summon",
                    damage: 0,
                    windup: 1,
                    cooldown: 16,
                    range: 16,
                    weight: 2,
                    summon: { enemyId: SHADOW_ID, count: 5 },
                },
            ],
        },
    },
    // 10:00. He fades between the worlds, and goes with the party: his strikes come out of the
    // other world, a shadow on the ground first
    {
        id: "forsaken_assassin",
        name: "The Forsaken Assassin",
        npcId: 12328,
        idleSeq: 813,
        walkSeq: 1205,
        attackSeq: 810,
        deathSeq: 836,
        hp: 7000,
        damage: 0,
        speed: 2.4,
        radius: 0.45,
        xp: 1800,
        sounds: HUMAN_SOUNDS,
        scale: 1.3,
        knockbackResist: 1,
        realm: "both",
        spawnMessage: "The Forsaken Assassin steps out of the shadows!",
        boss: {
            attackInterval: 2.6,
            enrage: { message: "The Forsaken Assassin is enraged!" },
            attacks: [
                {
                    name: "Stab",
                    kind: "swing",
                    damage: 5,
                    windup: 0.6,
                    cooldown: 0,
                    range: 2.6,
                    radius: 2.2,
                    cone: 1.8,
                    weight: 4,
                    seq: 810,
                    sound: 2564,
                },
                {
                    name: "From the other side",
                    kind: "blast",
                    damage: 6,
                    windup: 1.2,
                    cooldown: 4,
                    range: 14,
                    minRange: 3,
                    radius: 1.8,
                    weight: 5,
                    leap: true,
                    seq: 1203,
                    sound: 2564,
                    impactSpotAnim: DUST,
                    impact: { spots: [{ spotAnim: DUST }], shake: 0.3 },
                    message: "A shadow falls across the ground...",
                },
                {
                    name: "Fade",
                    kind: "teleport",
                    damage: 0,
                    windup: 0.5,
                    cooldown: 8,
                    range: 3,
                    radius: 7,
                    weight: 2,
                    castSpotAnim: SHADOW_RIPPLE,
                    impactSpotAnim: SHADOW_RIPPLE,
                },
            ],
        },
    },
    // 15:00. She rises in the cathedral, and is in both worlds. Three-shot volleys and her
    // tentacles across the ground, as in OSRS; at 80%, 55% and 30% she pulls everyone into the realm
    // and siphons its souls: each that reaches her heals her, so catch them first.
    {
        id: "whisperer",
        name: "The Whisperer",
        npcId: 12206,
        idleSeq: 10230,
        walkSeq: 10232,
        attackSeq: 10234,
        deathSeq: -1,
        hp: 24000,
        damage: 0,
        speed: 1.6,
        radius: 0.9,
        xp: 3000,
        sounds: WHISPERER_SOUNDS,
        // Three tiles across in OSRS, and towering: drawn bigger, so she reads as the boss she is
        scale: 1.3,
        knockbackResist: 1,
        realm: "both",
        spawnMessage: "The Whisperer rises in the cathedral!",
        boss: {
            attackInterval: 2.2,
            fallSeconds: 2.4,
            enrage: { message: "The Whisperer is enraged!" },
            intro: {
                seconds: 4,
                riseAt: 1.2,
                title: "The Whisperer",
                subtitle: "Siren of the Shadow Realm",
                distance: 6,
                atMiddle: true,
                pan: { from: 2.4, over: 1.2 },
                land: { spots: [{ spotAnim: SHADOW_RIPPLE, fit: 3 }], shake: 0.4 },
                landAt: 0.2,
            },
            summonsAt: [0.8, 0.55, 0.3].map((hp) => ({
                hp,
                enemyId: "siphoned_soul",
                count: 6,
                distance: 12,
                realm: true,
                message: "The Whisperer siphons the realm's lost souls!",
            })),
            attacks: [
                {
                    name: "Volley",
                    kind: "projectile",
                    damage: 4,
                    windup: 0.9,
                    cooldown: 0,
                    range: 16,
                    radius: 0.8,
                    speed: 8,
                    count: 3,
                    spread: 0.35,
                    weight: 5,
                    seq: 10234,
                    sound: 7284,
                    spotAnim: WHISPER_SHOT,
                    impactSpotAnim: WHISPER_BURST,
                },
                {
                    name: "Tentacles",
                    kind: "ground",
                    damage: 5,
                    windup: 1.4,
                    cooldown: 6,
                    range: 20,
                    weight: 4,
                    seq: 10235,
                    sound: 7101,
                    ground: {
                        spots: [{ shape: "cross", reach: 5 }],
                        radius: 0.9,
                        spotAnim: TENTACLE_LASH,
                        alpha: 0.35,
                    },
                    message: "Tentacles stir under the ground...",
                },
                {
                    name: "Shadow burst",
                    kind: "blast",
                    damage: 5,
                    windup: 1.1,
                    cooldown: 7,
                    range: 14,
                    radius: 2.4,
                    weight: 3,
                    seq: 10236,
                    sound: 436,
                    impactSpotAnim: WHISPER_BURST,
                    impact: { spots: [{ spotAnim: WHISPER_BURST, fit: 1.5 }], shake: 0.3 },
                },
            ],
        },
    },
];

// Lumbridge's pace, the city's own: hands throughout, leeches from 2:00, ghosts from 4:00
export const LASSAR_WAVES: WaveDef[] = paced([
    [{ id: CRAWLING_HAND_ID, weight: 1 }],
    [{ id: CRAWLING_HAND_ID, weight: 1 }],
    [
        { id: CRAWLING_HAND_ID, weight: 3 },
        { id: "lassar_leech", weight: 1 },
    ],
    [
        { id: CRAWLING_HAND_ID, weight: 3 },
        { id: "lassar_leech", weight: 2 },
    ],
    [
        { id: CRAWLING_HAND_ID, weight: 3 },
        { id: "lassar_ghost", weight: 1 },
        { id: "lassar_leech", weight: 1 },
    ],
    [
        { id: CRAWLING_HAND_ID, weight: 2 },
        { id: "ancient_guardian", weight: 1 },
        { id: "lassar_ghost", weight: 1 },
    ],
    [
        { id: "ancient_guardian", weight: 2 },
        { id: CRAWLING_HAND_ID, weight: 2 },
        { id: "lassar_leech", weight: 2 },
    ],
    [
        { id: "lassar_ghost", weight: 2 },
        { id: "ancient_guardian", weight: 2 },
        { id: CRAWLING_HAND_ID, weight: 1 },
    ],
    [
        { id: "ancient_guardian", weight: 3 },
        { id: "lassar_ghost", weight: 2 },
        { id: "lassar_leech", weight: 1 },
    ],
    [
        { id: "ancient_guardian", weight: 2 },
        { id: CRAWLING_HAND_ID, weight: 2 },
        { id: "lassar_ghost", weight: 2 },
    ],
    [
        { id: "ancient_guardian", weight: 3 },
        { id: "lassar_leech", weight: 2 },
        { id: "lassar_ghost", weight: 2 },
    ],
    [
        { id: "ancient_guardian", weight: 3 },
        { id: "lassar_ghost", weight: 3 },
        { id: CRAWLING_HAND_ID, weight: 1 },
    ],
    [
        { id: "ancient_guardian", weight: 3 },
        { id: "lassar_ghost", weight: 2 },
        { id: "lassar_leech", weight: 2 },
    ],
    [
        { id: "ancient_guardian", weight: 3 },
        { id: "lassar_ghost", weight: 3 },
        { id: "lassar_leech", weight: 2 },
    ],
    [
        { id: "ancient_guardian", weight: 3 },
        { id: "lassar_ghost", weight: 3 },
        { id: "lassar_leech", weight: 2 },
        { id: CRAWLING_HAND_ID, weight: 2 },
    ],
]);

// The realm's, on the same clock: shadows, and its keepers as the run goes on
export const LASSAR_REALM_WAVES: WaveDef[] = paced(
    Array.from({ length: 15 }, (_, minute) =>
        minute < 4
            ? [{ id: SHADOW_ID, weight: 1 }]
            : [
                  { id: SHADOW_ID, weight: Math.max(1, 4 - Math.floor(minute / 4)) },
                  { id: "shadow_keeper", weight: 1 + Math.floor(minute / 5) },
              ],
    ),
);

export const LASSAR_EVENTS: RunEventDef[] = [
    { at: 120, kind: "elite", enemyId: "lassar_leech" },
    { at: 200, kind: "elite", enemyId: "ancient_guardian" },
    { at: 260, kind: "elite", enemyId: "lassar_ghost" },
    { at: 300, kind: "boss", enemyId: "shadow_keeper_boss", hp: 4200 },
    { at: 330, kind: "ring", enemyId: CRAWLING_HAND_ID, count: 30 },
    { at: 400, kind: "elite", enemyId: "ancient_guardian" },
    { at: 480, kind: "elite", enemyId: "lassar_ghost" },
    { at: 540, kind: "elite", enemyId: "lassar_leech" },
    { at: 600, kind: "boss", enemyId: "forsaken_assassin", hp: 8000 },
    { at: 630, kind: "ring", enemyId: "lassar_leech", count: 40 },
    { at: 690, kind: "elite", enemyId: "ancient_guardian" },
    { at: 750, kind: "elite", enemyId: "lassar_ghost" },
    { at: 810, kind: "elite", enemyId: "ancient_guardian" },
    { at: 840, kind: "ring", enemyId: CRAWLING_HAND_ID, count: 60 },
    { at: 870, kind: "elite", enemyId: "lassar_ghost" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "whisperer", hp: 28000 },
];

// The city and its realm (core/rules/RealmRule.ts)
export const LASSAR_REALM: RealmRuleDef = {
    kind: "realm",
    puddles: { from: 90, every: 60, distance: [8, 12], open: 15, blink: 3, radius: 1.2, pull: 1.5 },
    sanity: { max: 100, refill: 10, drain: 4, hit: 5, low: 30, lapse: 0.25 },
    souls: { enemyId: LOST_SOUL_ID, count: 3, distance: [6, 12] },
    portal: { seconds: 5, radius: 1.2 },
    drops: { bones: 2, coins: 2, caskets: 1.5 },
    waves: LASSAR_REALM_WAVES,
    risers: { enemyId: "lassar_tentacle", every: 8, max: 2, distance: [3, 6] },
    // A Shadow Keeper with each dive from 4:00, and its casket: the Treasure hunter's way in
    elite: { enemyId: "shadow_keeper", from: 240, distance: [6, 10] },
    look: {
        brightness: 0.75,
        wash: "#a898d8",
        music: "Lassar Silence",
        // Lassar's own dark puddle, and the Anima Portal
        puddleLocId: 48199,
        portalLocId: 48218,
        flipSpotAnim: SHADOW_RIPPLE,
    },
};
