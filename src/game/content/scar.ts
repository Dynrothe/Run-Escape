import { SCAR_FIRES, SCAR_POOL, SCAR_START, scarWorld } from "../scaperune/maps/scar";
import { WARM_LIGHT } from "./lights";
import type { EnemyDef, LightingDef, PlayerEffectDef, RunEventDef, WaveDef } from "./types";
import { RUN_LENGTH, paced } from "./waves";

// The Scar, Act II's fourth map (docs/design/act-2-fallen-empire.md, section 6): its imps,
// leeches, walkers, antibodies, demons and hellhounds, the light leeches that carry the light,
// the Scarred black demon, Persten the Deceitful and the Leviathan, and the dark (MapDef.lighting):
// a light round each player, the Scar's fires, lanterns to pick up, and weapons only aiming at
// what's lit. Every id is the cache's (scripts/cache/find-npcs.ts, find-npc-seqs.ts,
// classify-npc-seqs.ts and spotanims.ts).

const IMP_SOUNDS = { attack: 534, hit: 536, death: 535 };
const DEMON_SOUNDS = IMP_SOUNDS;
const HOUND_SOUNDS = { attack: 710, hit: 713, death: 711 };
const LEECH_SOUNDS = { attack: 292, hit: 294, death: 293 };
const WALKER_SOUNDS = { attack: 436, hit: 439, death: 438 };
const HUMAN_SOUNDS = { attack: 2564, hit: 513, death: 512 };
// None of the Leviathan's animations name a sound of their own here: the Duke's stand in
const LEVIATHAN_SOUNDS = { attack: 4000, hit: 513, death: 512 };

// The Leviathan's orbs, by style (beside his model in the cache), each with its splash
const ORB_RANGED = 2487;
const ORB_MAGIC = 2488;
const ORB_MELEE = 2489;
const ORB_SPLASH = 2490;
// Fire, for the demons' breath and Persten's spells
const FIRE_BOLT = 130;
const FIRE_HIT = 131;
const FIRE_WAVE = 156;
const FIRE_WAVE_HIT = 157;
// Dust thrown up, and the debris that falls (rocks)
const DUST = 2699;
const DEBRIS = 2584;

// The light (LightingDef): a lantern's warm glow round each player
export const SCAR_PLAYER_LIGHT = 5;
const FIRE_LIGHT = { radius: 3, color: 0xff9a4a, flicker: 0.15 };

export const SCAR_IMP_ID = "scarred_imp";
export const ABYSSAL_LEECH_ID = "abyssal_leech";
export const LIGHT_LEECH_ID = "light_leech";
export const FALSE_LANTERN_ID = "false_lantern";
export const PATHFINDER_ID = "abyssal_pathfinder";
export const LEVIATHAN_ID = "the_leviathan";

// An Abyssal leech's hit: a tile off your light for 8 seconds, up to three at once
export const LEECHED: PlayerEffectDef = {
    kind: "dim",
    id: "leeched",
    name: "Leeched",
    // The Abyssal lantern, dimmed
    iconObjId: 26822,
    tiles: 1,
    seconds: 8,
    stacks: 3,
};

// The Scarred black demon's roar: your light down to 2 tiles for 6 seconds
export const SNUFFED: PlayerEffectDef = {
    kind: "dim",
    id: "snuffed",
    name: "Snuffed",
    iconObjId: 26822,
    to: 2,
    seconds: 6,
};

export const SCAR_ENEMIES: EnemyDef[] = [
    // The crowd
    {
        id: SCAR_IMP_ID,
        name: "Scarred imp",
        npcId: 12377,
        idleSeq: 171,
        walkSeq: 10107,
        attackSeq: 169,
        deathSeq: 172,
        hp: 6,
        damage: 1,
        speed: 2.2,
        radius: 0.35,
        xp: 6,
        sounds: IMP_SOUNDS,
    },
    // Quick, and a hit dims your light (LEECHED)
    {
        id: ABYSSAL_LEECH_ID,
        name: "Abyssal leech",
        npcId: 12366,
        idleSeq: 2180,
        walkSeq: 2179,
        attackSeq: 2181,
        deathSeq: 2183,
        hp: 9,
        damage: 1,
        speed: 3,
        radius: 0.35,
        xp: 8,
        sounds: LEECH_SOUNDS,
        touches: LEECHED,
    },
    // The light: it wanders off from you with its own glow, and killed, its light stays where it
    // fell for 20 seconds
    {
        id: LIGHT_LEECH_ID,
        name: "Light leech",
        npcId: 12367,
        idleSeq: 2180,
        walkSeq: 2179,
        attackSeq: 2181,
        deathSeq: 2183,
        hp: 12,
        damage: 0,
        speed: 1.6,
        radius: 0.35,
        xp: 12,
        sounds: LEECH_SOUNDS,
        flees: { range: 4 },
        light: {
            radius: 2.5,
            color: 0xd8ffb8,
            intensity: 0.9,
            pulse: { amount: 0.2, seconds: 1.2 },
            left: { radius: 4, color: 0xe8ffd0, intensity: 0.95, seconds: 20 },
        },
    },
    // Slow and tough
    {
        id: "abyssal_walker",
        name: "Abyssal walker",
        npcId: 12392,
        idleSeq: 2191,
        walkSeq: 2190,
        attackSeq: 2192,
        deathSeq: 2194,
        hp: 44,
        damage: 3,
        speed: 1.4,
        radius: 0.45,
        xp: 26,
        sounds: WALKER_SOUNDS,
        knockbackResist: 0.5,
    },
    // Swarms out of the Scar's walls late on
    {
        id: "abyssal_antibody",
        name: "Abyssal antibody",
        npcId: 12372,
        idleSeq: 2185,
        walkSeq: 2184,
        attackSeq: 2186,
        deathSeq: 2189,
        hp: 10,
        damage: 2,
        speed: 2.9,
        radius: 0.35,
        xp: 9,
        sounds: LEECH_SOUNDS,
    },
    // The main threat
    {
        id: "scarred_lesser_demon",
        name: "Scarred lesser demon",
        npcId: 12360,
        idleSeq: 66,
        walkSeq: 63,
        attackSeq: 64,
        deathSeq: 67,
        hp: 30,
        damage: 4,
        speed: 2,
        radius: 0.45,
        xp: 18,
        sounds: DEMON_SOUNDS,
        // Two tiles across in OSRS
        scale: 0.75,
        knockbackResist: 0.3,
    },
    // Fast
    {
        id: "scarred_hellhound",
        name: "Scarred hellhound",
        npcId: 12374,
        idleSeq: 6561,
        walkSeq: 6583,
        attackSeq: 6559,
        deathSeq: 6558,
        hp: 26,
        damage: 4,
        speed: 2.9,
        radius: 0.45,
        xp: 16,
        sounds: HOUND_SOUNDS,
        scale: 0.75,
    },
    // The elite: three tiles across in OSRS
    {
        id: "scarred_greater_demon",
        name: "Scarred greater demon",
        npcId: 12373,
        idleSeq: 66,
        walkSeq: 63,
        attackSeq: 64,
        deathSeq: 67,
        hp: 60,
        damage: 5,
        speed: 1.8,
        radius: 0.6,
        xp: 40,
        sounds: DEMON_SOUNDS,
        scale: 0.6,
        knockbackResist: 0.7,
    },
    // Persten's: a lantern lying there, lit, as a real one does but for its beam. Walked into, it
    // bursts; left, it's gone after 20 seconds
    {
        id: FALSE_LANTERN_ID,
        name: "False lantern",
        npcId: 12367,
        objId: 26822,
        idleSeq: -1,
        walkSeq: -1,
        attackSeq: -1,
        deathSeq: -1,
        hp: 1,
        damage: 0,
        speed: 0,
        radius: 0.4,
        xp: 0,
        sounds: HUMAN_SOUNDS,
        stationary: true,
        unhittable: true,
        caught: true,
        explodes: { damage: 6, radius: 2, spotAnim: FIRE_WAVE_HIT, sound: 4000 },
        hatches: { seconds: 20, into: FALSE_LANTERN_ID, count: 0 },
        light: { radius: 2.2, color: WARM_LIGHT, intensity: 0.85, flicker: 0.2 },
    },
    // 5:00. Its roar snuffs your light to 2 tiles for 6 seconds
    {
        id: "scarred_black_demon",
        name: "Scarred black demon",
        npcId: 12386,
        idleSeq: 66,
        walkSeq: 63,
        attackSeq: 64,
        deathSeq: -1,
        hp: 4000,
        damage: 0,
        speed: 2.1,
        radius: 0.7,
        xp: 1500,
        sounds: DEMON_SOUNDS,
        scale: 0.7,
        knockbackResist: 1,
        spawnMessage: "A Scarred black demon climbs out of the dark!",
        boss: {
            attackInterval: 2.5,
            enrage: { message: "The Scarred black demon is enraged!" },
            attacks: [
                {
                    name: "Claw",
                    kind: "swing",
                    damage: 5,
                    windup: 0.7,
                    cooldown: 0,
                    range: 3,
                    radius: 2.6,
                    cone: 2.2,
                    weight: 5,
                    seq: 64,
                    sound: 534,
                },
                {
                    name: "Fire breath",
                    kind: "projectile",
                    damage: 3,
                    windup: 0.9,
                    cooldown: 4,
                    range: 14,
                    radius: 0.8,
                    speed: 8,
                    count: 3,
                    spread: 0.25,
                    weight: 3,
                    seq: 64,
                    sound: 534,
                    spotAnim: FIRE_BOLT,
                    impactSpotAnim: FIRE_HIT,
                },
                // Whoever's near when it roars has their light snuffed
                {
                    name: "Roar",
                    kind: "swing",
                    damage: 3,
                    windup: 1.2,
                    cooldown: 12,
                    range: 10,
                    radius: 10,
                    weight: 4,
                    seq: 4070,
                    sound: 534,
                    effect: SNUFFED,
                    message: "The demon roars, and the dark closes in!",
                    impact: { spots: [{ spotAnim: DUST, fit: 3 }], shake: 0.3 },
                },
            ],
        },
    },
    // 10:00. She lights false lanterns round you that burst when they're picked up, and burns
    {
        id: "persten",
        name: "Persten the Deceitful",
        npcId: 12333,
        idleSeq: 813,
        walkSeq: 1205,
        attackSeq: 811,
        deathSeq: -1,
        hp: 7000,
        damage: 0,
        speed: 1.9,
        radius: 0.45,
        xp: 1800,
        sounds: HUMAN_SOUNDS,
        scale: 1.2,
        knockbackResist: 1,
        spawnMessage: "Persten the Deceitful steps out of the dark, a lantern in her hand...",
        boss: {
            attackInterval: 2.8,
            enrage: { message: "Persten is enraged!" },
            attacks: [
                {
                    name: "Fire wave",
                    kind: "projectile",
                    damage: 4,
                    windup: 1,
                    cooldown: 2,
                    range: 16,
                    radius: 0.9,
                    speed: 9,
                    weight: 5,
                    seq: 811,
                    sound: 155,
                    spotAnim: FIRE_WAVE,
                    impactSpotAnim: FIRE_WAVE_HIT,
                },
                {
                    name: "Flames",
                    kind: "blast",
                    damage: 4,
                    windup: 1.2,
                    cooldown: 5,
                    range: 14,
                    radius: 1.8,
                    weight: 3,
                    seq: 811,
                    sound: 155,
                    impactSpotAnim: FIRE_WAVE_HIT,
                },
                // Lanterns lit round you: they look like the real ones, but for the beam
                {
                    name: "False lanterns",
                    kind: "summon",
                    damage: 0,
                    windup: 1,
                    cooldown: 14,
                    range: 20,
                    weight: 3,
                    seq: 1162,
                    summon: { enemyId: FALSE_LANTERN_ID, count: 3, beside: true, distance: 5 },
                    message: "Persten lights lanterns in the dark...",
                },
            ],
        },
    },
    // His enrage: the only light there is, going round his pool a tile a second (LEVIATHAN)
    {
        id: PATHFINDER_ID,
        name: "Abyssal pathfinder",
        npcId: 12220,
        idleSeq: 10295,
        walkSeq: 10295,
        attackSeq: -1,
        deathSeq: -1,
        hp: 1,
        damage: 0,
        speed: 1,
        radius: 0.6,
        xp: 0,
        sounds: HUMAN_SOUNDS,
        scale: 0.6,
        stationary: true,
        unhittable: true,
        circles: { radius: 7, speed: 1 },
        onlyLight: { inside: 1.5, outside: 2 },
        light: { radius: 4, color: 0xbfe0ff, intensity: 1, pulse: { amount: 0.15, seconds: 2 } },
    },
    // 15:00. He rises in his pool, 7 tiles across, and never leaves it. Volleys of orbs by style,
    // and after each roar, debris falls round you: it stays a while, and his orbs break on it.
    // In his last third the dark takes everything but the Abyssal pathfinder's circle.
    {
        id: LEVIATHAN_ID,
        name: "The Leviathan",
        npcId: 12215,
        idleSeq: 10276,
        walkSeq: 10276,
        attackSeq: 10278,
        deathSeq: -1,
        hp: 24000,
        damage: 0,
        speed: 0,
        radius: 2.6,
        xp: 3000,
        sounds: LEVIATHAN_SOUNDS,
        knockbackResist: 1,
        stationary: true,
        solid: true,
        scale: 0.8,
        // The abyss's glow on him, so he's seen (and can be aimed at) from round his pool
        light: { radius: 5, color: 0x7fe0d0, intensity: 0.6, pulse: { amount: 0.2, seconds: 3 } },
        spawnMessage: "The Leviathan rises from its pool!",
        boss: {
            attackInterval: 2.2,
            fallSeconds: 2.4,
            enrage: { message: "The Leviathan is enraged!" },
            // He's north of his square's middle, and big: the camera leans to keep him in view
            look: { lean: true },
            intro: {
                seconds: 4,
                riseAt: 1.2,
                title: "The Leviathan",
                subtitle: "the Scar's sleeper",
                // Just south of his pool, so he's in view
                distance: 6,
                atMiddle: true,
                pan: { from: 2.4, over: 1.2 },
                land: { spots: [{ spotAnim: DUST, fit: 4 }], shake: 0.5 },
                landAt: 0.2,
            },
            summonsAt: [
                {
                    hp: 1 / 3,
                    enemyId: PATHFINDER_ID,
                    count: 1,
                    distance: 7,
                    message: "The dark swallows everything... follow the pathfinder's light!",
                },
            ],
            attacks: [
                {
                    name: "Ranged orbs",
                    kind: "projectile",
                    damage: 4,
                    windup: 0.9,
                    cooldown: 0,
                    range: 26,
                    radius: 0.8,
                    speed: 8,
                    count: 4,
                    spread: 0.22,
                    weight: 4,
                    seq: 10278,
                    sound: 4000,
                    spotAnim: ORB_RANGED,
                    impactSpotAnim: ORB_SPLASH,
                    follow: { attack: "Debris", delay: 0.8 },
                },
                {
                    name: "Magic orbs",
                    kind: "projectile",
                    damage: 4,
                    windup: 0.9,
                    cooldown: 0,
                    range: 26,
                    radius: 0.8,
                    speed: 7,
                    count: 3,
                    spread: 0.35,
                    homing: 0.03,
                    weight: 4,
                    seq: 10279,
                    sound: 4000,
                    spotAnim: ORB_MAGIC,
                    impactSpotAnim: ORB_SPLASH,
                    follow: { attack: "Debris", delay: 0.8 },
                },
                {
                    name: "Melee orbs",
                    kind: "projectile",
                    damage: 6,
                    windup: 0.9,
                    cooldown: 3,
                    range: 26,
                    radius: 0.9,
                    speed: 9,
                    count: 2,
                    spread: 0.15,
                    weight: 3,
                    seq: 10280,
                    sound: 4000,
                    spotAnim: ORB_MELEE,
                    impactSpotAnim: ORB_SPLASH,
                    follow: { attack: "Debris", delay: 0.8 },
                },
                // After each volley (follow): a roar, and the roof comes down round you. Each
                // piece stays as cover his orbs break on (BossAttackDef.debris)
                {
                    name: "Debris",
                    kind: "ground",
                    damage: 5,
                    windup: 1.3,
                    cooldown: 999,
                    range: 99,
                    weight: 0,
                    seq: 10282,
                    sound: 4000,
                    ground: {
                        spots: [{ shape: "scatter", count: 4, spread: 5, awayFrom: 6 }],
                        radius: 1,
                        shadow: true,
                        locId: DEBRIS,
                        alpha: 0.35,
                    },
                    debris: { locId: DEBRIS, seconds: 14, most: 10 },
                    message: "The Leviathan roars, and debris falls!",
                },
                // Too close to his pool: a sweep of his tail
                {
                    name: "Tail",
                    kind: "swing",
                    damage: 6,
                    windup: 0.9,
                    cooldown: 0,
                    range: 7,
                    radius: 7,
                    weight: 4,
                    seq: 10283,
                    sound: 4000,
                    impact: { spots: [{ spotAnim: DUST, fit: 3 }], shake: 0.4 },
                },
            ],
        },
    },
];

// Lumbridge's pace, the Scar's own: imps throughout, leeches from 1:00, light leeches now and
// then all run long, walkers from 3:00, demons from 4:00, hellhounds from 6:00, antibodies late
const LIGHT = { id: LIGHT_LEECH_ID, weight: 0.2 };
export const SCAR_WAVES: WaveDef[] = paced([
    [{ id: SCAR_IMP_ID, weight: 1 }, LIGHT],
    [{ id: SCAR_IMP_ID, weight: 3 }, { id: ABYSSAL_LEECH_ID, weight: 1 }, LIGHT],
    [{ id: SCAR_IMP_ID, weight: 3 }, { id: ABYSSAL_LEECH_ID, weight: 2 }, LIGHT],
    [
        { id: SCAR_IMP_ID, weight: 3 },
        { id: ABYSSAL_LEECH_ID, weight: 2 },
        { id: "abyssal_walker", weight: 1 },
        LIGHT,
    ],
    [
        { id: SCAR_IMP_ID, weight: 2 },
        { id: "scarred_lesser_demon", weight: 1 },
        { id: ABYSSAL_LEECH_ID, weight: 2 },
        LIGHT,
    ],
    [
        { id: "scarred_lesser_demon", weight: 2 },
        { id: "abyssal_walker", weight: 1 },
        { id: ABYSSAL_LEECH_ID, weight: 2 },
        LIGHT,
    ],
    [
        { id: "scarred_lesser_demon", weight: 2 },
        { id: "scarred_hellhound", weight: 1 },
        { id: SCAR_IMP_ID, weight: 2 },
        LIGHT,
    ],
    [
        { id: "scarred_hellhound", weight: 2 },
        { id: "abyssal_walker", weight: 2 },
        { id: ABYSSAL_LEECH_ID, weight: 1 },
        LIGHT,
    ],
    [
        { id: "scarred_lesser_demon", weight: 3 },
        { id: "scarred_hellhound", weight: 2 },
        { id: ABYSSAL_LEECH_ID, weight: 1 },
        LIGHT,
    ],
    [
        { id: "abyssal_walker", weight: 2 },
        { id: "scarred_lesser_demon", weight: 2 },
        { id: "abyssal_antibody", weight: 2 },
        LIGHT,
    ],
    [
        { id: "scarred_lesser_demon", weight: 3 },
        { id: "scarred_hellhound", weight: 2 },
        { id: "abyssal_antibody", weight: 2 },
        LIGHT,
    ],
    [
        { id: "scarred_hellhound", weight: 3 },
        { id: "abyssal_walker", weight: 3 },
        { id: ABYSSAL_LEECH_ID, weight: 1 },
        LIGHT,
    ],
    [
        { id: "scarred_lesser_demon", weight: 3 },
        { id: "abyssal_walker", weight: 2 },
        { id: "abyssal_antibody", weight: 2 },
        LIGHT,
    ],
    [
        { id: "scarred_lesser_demon", weight: 3 },
        { id: "scarred_hellhound", weight: 3 },
        { id: ABYSSAL_LEECH_ID, weight: 2 },
        LIGHT,
    ],
    [
        { id: "scarred_lesser_demon", weight: 3 },
        { id: "scarred_hellhound", weight: 3 },
        { id: "abyssal_antibody", weight: 2 },
        { id: "abyssal_walker", weight: 2 },
        LIGHT,
    ],
]);

export const SCAR_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "abyssal_walker" },
    { at: 150, kind: "elite", enemyId: LIGHT_LEECH_ID },
    { at: 200, kind: "elite", enemyId: "scarred_hellhound" },
    { at: 250, kind: "elite", enemyId: "scarred_lesser_demon" },
    { at: 300, kind: "boss", enemyId: "scarred_black_demon", hp: 4400 },
    { at: 330, kind: "ring", enemyId: SCAR_IMP_ID, count: 30 },
    { at: 400, kind: "elite", enemyId: "scarred_greater_demon" },
    { at: 450, kind: "ring", enemyId: "scarred_hellhound", count: 16 },
    { at: 480, kind: "elite", enemyId: LIGHT_LEECH_ID },
    { at: 540, kind: "elite", enemyId: "scarred_greater_demon" },
    { at: 600, kind: "boss", enemyId: "persten", hp: 8000 },
    { at: 630, kind: "ring", enemyId: ABYSSAL_LEECH_ID, count: 40 },
    { at: 690, kind: "elite", enemyId: "scarred_greater_demon" },
    { at: 720, kind: "ring", enemyId: "abyssal_antibody", count: 40 },
    { at: 750, kind: "elite", enemyId: LIGHT_LEECH_ID },
    { at: 810, kind: "elite", enemyId: "scarred_greater_demon" },
    { at: 840, kind: "ring", enemyId: "abyssal_antibody", count: 60 },
    { at: 870, kind: "elite", enemyId: "scarred_greater_demon" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: LEVIATHAN_ID, hp: 28000 },
];

// The dark (docs/DEVELOPMENT.md, Lights): a lantern's light round each player, the fires that
// stay lit, lanterns dropping now and then and two by the start, and weapons only aiming at
// what's lit
export const SCAR_LIGHTING: LightingDef = {
    // The dark, a little blue: shapes, not detail
    ambient: 0.3,
    ambientColor: 0xc0ccff,
    player: { radius: SCAR_PLAYER_LIGHT, color: WARM_LIGHT, intensity: 0.95 },
    lights: SCAR_FIRES.map((fire) => ({ ...scarWorld(fire, true), ...FIRE_LIGHT })),
    litTargetsOnly: true,
    lanternWeight: 6,
    lanterns: [
        { x: 4, y: 3 },
        { x: -5, y: -4 },
    ].map(({ x, y }) => scarWorld({ x: SCAR_START.x + x, y: SCAR_START.y + y })),
};

// The pool he rises in, in world tiles
export const SCAR_POOL_WORLD = scarWorld(SCAR_POOL);
