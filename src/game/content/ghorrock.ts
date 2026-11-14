import {
    GHORROCK_BRAZIERS,
    GHORROCK_POOLS,
    GHORROCK_VENTS,
    ghorrockWorld,
} from "../scaperune/maps/ghorrock";
import type { ColdRuleDef, EnemyDef, RunEventDef, WaveDef } from "./types";
import { RUN_LENGTH, paced } from "./waves";

// Ghorrock, Act II's third map (docs/design/act-2-fallen-empire.md, section 5): the frozen prison
// yard's ice warriors, spiders, giants, icefiends and wolves, its fire elites (pyrefiends and the
// flaming pyrelord, whose deaths relight the braziers), Ketla the Unworthy, Jhallan and Duke
// Sucellus, and the rule (MapDef.rule) that's the cold. Every id is the cache's
// (scripts/cache/find-npcs.ts, find-npc-seqs.ts, classify-npc-seqs.ts and spotanims.ts).

const HUMAN_SOUNDS = { attack: 2564, hit: 513, death: 512 };
const SPIDER_SOUNDS = { attack: 3605, hit: 3607, death: 3606 };
const WOLF_SOUNDS = { attack: 710, hit: 713, death: 711 };
const FIEND_SOUNDS = { attack: 534, hit: 536, death: 535 };
// None of the Duke's animations name a sound of their own here: an ice giant's roar and the
// Phantom Muspah's ice's crack stand in
const DUKE_SOUNDS = { attack: 4000, hit: 513, death: 512 };

// The Duke's own spot animations (beside his model in the cache): the ice falling, and his gas
const ICICLES = 2434;
const DUKE_GAS = 2431;
// The King Black Dragon's ice breath, for what's spat and thrown
const ICE_BREATH = 396;
// A fire's burst, as a brazier flares and a fire elite comes
const FLARE = 157;
// Snow thrown up, and the shards of a shattered enemy (Ice Barrage's)
const SNOW_DUST = 2699;
const SHARDS = 369;

export const ICE_WARRIOR_ID = "ghorrock_ice_warrior";

export const GHORROCK_ENEMIES: EnemyDef[] = [
    // The crowd: the new ice warriors
    {
        id: ICE_WARRIOR_ID,
        name: "Ice warrior",
        npcId: 13802,
        idleSeq: 808,
        walkSeq: 819,
        attackSeq: 390,
        deathSeq: 836,
        hp: 6,
        damage: 1,
        speed: 2,
        radius: 0.35,
        xp: 6,
        sounds: HUMAN_SOUNDS,
        knockbackResist: 0.15,
    },
    // Fast, in packs
    {
        id: "ghorrock_ice_spider",
        name: "Ice spider",
        npcId: 13798,
        idleSeq: 5326,
        walkSeq: 5325,
        attackSeq: 5327,
        deathSeq: 5329,
        hp: 10,
        damage: 2,
        speed: 3.1,
        radius: 0.35,
        xp: 9,
        sounds: SPIDER_SOUNDS,
    },
    // A hit takes the warmth out of you (ColdRuleDef: EnemyDef.chills)
    {
        id: "ghorrock_icefiend",
        name: "Icefiend",
        npcId: 3140,
        idleSeq: 1578,
        walkSeq: 1579,
        attackSeq: 1582,
        deathSeq: 1580,
        hp: 14,
        damage: 2,
        speed: 2.3,
        radius: 0.35,
        xp: 11,
        sounds: FIEND_SOUNDS,
        chills: 5,
    },
    // Running packs, sure-footed on the ice (enemies never slide)
    {
        id: "ghorrock_ice_wolf",
        name: "Ice wolf",
        npcId: 645,
        idleSeq: 6580,
        walkSeq: 6556,
        attackSeq: 6579,
        deathSeq: 6558,
        hp: 26,
        damage: 3,
        speed: 2.6,
        radius: 0.45,
        xp: 18,
        sounds: WOLF_SOUNDS,
        // Two tiles across in OSRS
        scale: 0.8,
    },
    // Slow and heavy
    {
        id: "ghorrock_ice_giant",
        name: "Ice giant",
        npcId: 13796,
        idleSeq: 4670,
        walkSeq: 4669,
        attackSeq: 4672,
        deathSeq: 4673,
        hp: 40,
        damage: 3,
        speed: 1.5,
        radius: 0.5,
        xp: 28,
        sounds: HUMAN_SOUNDS,
        scale: 0.8,
        knockbackResist: 0.6,
    },
    // The fire elites: killed, they leave embers and relight the braziers near them
    {
        id: "ghorrock_pyrefiend",
        name: "Pyrefiend",
        npcId: 433,
        idleSeq: 1578,
        walkSeq: 1579,
        attackSeq: 1582,
        deathSeq: 1580,
        hp: 30,
        damage: 3,
        speed: 2.2,
        radius: 0.4,
        xp: 20,
        sounds: FIEND_SOUNDS,
        embers: true,
        spawnSpotAnim: FLARE,
    },
    {
        id: "flaming_pyrelord",
        name: "Flaming pyrelord",
        npcId: 12453,
        idleSeq: 1578,
        walkSeq: 1579,
        attackSeq: 1582,
        deathSeq: 1580,
        hp: 60,
        damage: 5,
        speed: 1.8,
        radius: 0.6,
        xp: 40,
        sounds: FIEND_SOUNDS,
        // Three tiles across in OSRS
        scale: 0.6,
        knockbackResist: 0.7,
        embers: true,
        spawnSpotAnim: FLARE,
    },
    // 5:00. She snuffs the braziers she passes (EnemyDef.plants, under the cold)
    {
        id: "ketla",
        name: "Ketla the Unworthy",
        npcId: 12329,
        idleSeq: 7861,
        walkSeq: 7862,
        attackSeq: 10161,
        deathSeq: -1,
        hp: 4000,
        damage: 0,
        speed: 2.3,
        radius: 0.45,
        xp: 1500,
        sounds: HUMAN_SOUNDS,
        scale: 1.4,
        knockbackResist: 1,
        plants: 3,
        spawnMessage: "Ketla the Unworthy drifts into the yard, and the braziers gutter!",
        boss: {
            attackInterval: 2.6,
            enrage: { message: "Ketla is enraged!" },
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
                    seq: 10161,
                    sound: 2564,
                },
                {
                    name: "Frost bolt",
                    kind: "projectile",
                    damage: 3,
                    windup: 0.9,
                    cooldown: 4,
                    range: 14,
                    radius: 0.8,
                    speed: 8,
                    count: 2,
                    spread: 0.3,
                    weight: 4,
                    seq: 10163,
                    sound: 4000,
                    spotAnim: ICE_BREATH,
                    impactSpotAnim: ICICLES,
                },
                {
                    name: "Call the cold",
                    kind: "summon",
                    damage: 0,
                    windup: 1,
                    cooldown: 16,
                    range: 16,
                    weight: 2,
                    summon: { enemyId: "ghorrock_icefiend", count: 3 },
                },
            ],
        },
    },
    // 10:00. He hunts you, as he hunts the player through Ghorrock in OSRS: slow, and never giving
    // up. At half his hitpoints his shadows come in.
    {
        id: "jhallan",
        name: "Jhallan",
        npcId: 12353,
        idleSeq: 9883,
        walkSeq: 9884,
        attackSeq: 9877,
        deathSeq: -1,
        hp: 7000,
        damage: 0,
        speed: 1.7,
        radius: 0.6,
        xp: 1800,
        sounds: HUMAN_SOUNDS,
        scale: 1.2,
        knockbackResist: 1,
        spawnMessage: "Jhallan has found you. He won't stop.",
        boss: {
            attackInterval: 2.4,
            enrage: { message: "Jhallan is enraged!" },
            summonsAt: [
                {
                    hp: 0.5,
                    enemyId: "jhallan_shadow",
                    count: 3,
                    distance: 6,
                    message: "Jhallan's shadows step out of the cold!",
                },
            ],
            attacks: [
                {
                    name: "Claw",
                    kind: "swing",
                    damage: 5,
                    windup: 0.7,
                    cooldown: 0,
                    range: 3,
                    radius: 2.8,
                    cone: 2.4,
                    weight: 5,
                    seq: 9877,
                    sound: 2564,
                    impact: { spots: [{ spotAnim: SNOW_DUST }], shake: 0.25 },
                },
                {
                    name: "Pounce",
                    kind: "blast",
                    damage: 6,
                    windup: 1.1,
                    cooldown: 5,
                    range: 12,
                    minRange: 4,
                    radius: 1.8,
                    weight: 4,
                    leap: true,
                    seq: 9878,
                    sound: 2564,
                    impactSpotAnim: SNOW_DUST,
                    impact: { spots: [{ spotAnim: SNOW_DUST, fit: 1.5 }], shake: 0.35 },
                },
            ],
        },
    },
    // His shadows: quick, and after you as he is
    {
        id: "jhallan_shadow",
        name: "Jhallan's shadow",
        npcId: 12355,
        idleSeq: 9883,
        walkSeq: 9884,
        attackSeq: 9877,
        deathSeq: -1,
        hp: 300,
        damage: 4,
        speed: 2.4,
        radius: 0.5,
        xp: 60,
        sounds: HUMAN_SOUNDS,
        knockbackResist: 0.8,
    },
    // 15:00. He wakes in the prison's mouth, 7 tiles across and never moving, as in OSRS. Every
    // brazier goes out as he wakes. Icicles, a slam up close, his spit from range, gas at the vent
    // nearest you, and about every fifth attack his freezing gaze: behind an Ice Column, or frozen.
    {
        id: "duke_sucellus",
        name: "Duke Sucellus",
        npcId: 12195,
        idleSeq: 10175,
        walkSeq: 10175,
        attackSeq: 10176,
        deathSeq: -1,
        hp: 24000,
        damage: 0,
        speed: 0,
        radius: 2.2,
        xp: 3000,
        sounds: DUKE_SOUNDS,
        knockbackResist: 1,
        stationary: true,
        solid: true,
        // Seven tiles across in OSRS, his arms out across his room: drawn smaller, so the yard
        // in front of him is still a yard
        scale: 0.55,
        spawnMessage: "Duke Sucellus wakes, and the braziers die!",
        boss: {
            attackInterval: 2.2,
            fallSeconds: 2.4,
            enrage: { message: "Duke Sucellus is enraged!" },
            intro: {
                seconds: 4,
                riseAt: 1.2,
                title: "Duke Sucellus",
                subtitle: "the Ghorrock prisoner",
                distance: 9,
                atMiddle: true,
                pan: { from: 2.4, over: 1.2 },
                land: { spots: [{ spotAnim: SNOW_DUST, fit: 4 }], shake: 0.5 },
                landAt: 0.2,
            },
            attacks: [
                {
                    name: "Slam",
                    kind: "swing",
                    damage: 6,
                    windup: 0.9,
                    cooldown: 0,
                    range: 7,
                    radius: 6.5,
                    weight: 5,
                    seq: 10176,
                    sound: 4000,
                    impact: { spots: [{ spotAnim: SNOW_DUST, fit: 3 }], shake: 0.4 },
                },
                {
                    name: "Icicles",
                    kind: "ground",
                    damage: 5,
                    windup: 1.4,
                    cooldown: 5,
                    range: 24,
                    weight: 4,
                    seq: 10177,
                    sound: 4000,
                    ground: {
                        spots: [{ shape: "ring", count: 5, distance: 2.5 }, { shape: "player" }],
                        radius: 1.1,
                        spotAnim: ICICLES,
                        alpha: 0.35,
                    },
                    message: "Icicles crack overhead...",
                },
                {
                    name: "Spit",
                    kind: "projectile",
                    damage: 5,
                    windup: 0.9,
                    cooldown: 3,
                    range: 24,
                    minRange: 6,
                    radius: 0.9,
                    speed: 8,
                    count: 3,
                    spread: 0.3,
                    weight: 4,
                    seq: 10178,
                    sound: 4000,
                    spotAnim: ICE_BREATH,
                    impactSpotAnim: ICICLES,
                },
                // Spat at the vent nearest you: it puffs as it lands (BossAttackDef.rule vent)
                {
                    name: "Gas",
                    kind: "blast",
                    damage: 4,
                    windup: 1.2,
                    cooldown: 6,
                    range: 24,
                    radius: 1.6,
                    weight: 3,
                    seq: 10179,
                    sound: 4000,
                    impactSpotAnim: DUKE_GAS,
                    rule: { vent: true },
                },
                // His freezing gaze: hide behind an Ice Column (MapDef.features pillars)
                {
                    name: "Freezing gaze",
                    kind: "swing",
                    damage: 12,
                    windup: 2.4,
                    cooldown: 9,
                    range: 999,
                    radius: 40,
                    weight: 12,
                    seq: 10180,
                    sound: 4000,
                    impactSpotAnim: SHARDS,
                    cover: true,
                    effect: { kind: "freeze", seconds: 2 },
                    message: "Hide from his freezing gaze!",
                    impact: { spots: [{ spotAnim: SNOW_DUST, fit: 4 }], shake: 0.5 },
                },
            ],
        },
    },
];

// Lumbridge's pace, the yard's own: warriors throughout, spiders from 2:00, icefiends from 3:00,
// wolves from 4:00, giants from 5:00, and now and then a pyrefiend in the crowd
export const GHORROCK_WAVES: WaveDef[] = paced([
    [{ id: ICE_WARRIOR_ID, weight: 1 }],
    [{ id: ICE_WARRIOR_ID, weight: 1 }],
    [
        { id: ICE_WARRIOR_ID, weight: 3 },
        { id: "ghorrock_ice_spider", weight: 2 },
    ],
    [
        { id: ICE_WARRIOR_ID, weight: 3 },
        { id: "ghorrock_ice_spider", weight: 2 },
        { id: "ghorrock_icefiend", weight: 1 },
    ],
    [
        { id: ICE_WARRIOR_ID, weight: 3 },
        { id: "ghorrock_ice_wolf", weight: 1 },
        { id: "ghorrock_icefiend", weight: 1 },
    ],
    [
        { id: ICE_WARRIOR_ID, weight: 2 },
        { id: "ghorrock_ice_giant", weight: 1 },
        { id: "ghorrock_ice_wolf", weight: 1 },
        { id: "ghorrock_pyrefiend", weight: 0.2 },
    ],
    [
        { id: "ghorrock_ice_giant", weight: 1 },
        { id: ICE_WARRIOR_ID, weight: 2 },
        { id: "ghorrock_ice_spider", weight: 2 },
        { id: "ghorrock_pyrefiend", weight: 0.2 },
    ],
    [
        { id: "ghorrock_ice_wolf", weight: 2 },
        { id: "ghorrock_ice_giant", weight: 2 },
        { id: "ghorrock_icefiend", weight: 1 },
        { id: "ghorrock_pyrefiend", weight: 0.2 },
    ],
    [
        { id: "ghorrock_ice_giant", weight: 3 },
        { id: "ghorrock_ice_wolf", weight: 2 },
        { id: "ghorrock_ice_spider", weight: 1 },
        { id: "ghorrock_pyrefiend", weight: 0.2 },
    ],
    [
        { id: "ghorrock_ice_giant", weight: 2 },
        { id: ICE_WARRIOR_ID, weight: 2 },
        { id: "ghorrock_icefiend", weight: 2 },
        { id: "ghorrock_pyrefiend", weight: 0.2 },
    ],
    [
        { id: "ghorrock_ice_giant", weight: 3 },
        { id: "ghorrock_ice_spider", weight: 2 },
        { id: "ghorrock_ice_wolf", weight: 2 },
        { id: "ghorrock_pyrefiend", weight: 0.2 },
    ],
    [
        { id: "ghorrock_ice_giant", weight: 3 },
        { id: "ghorrock_ice_wolf", weight: 3 },
        { id: ICE_WARRIOR_ID, weight: 1 },
        { id: "ghorrock_pyrefiend", weight: 0.2 },
    ],
    [
        { id: "ghorrock_ice_giant", weight: 3 },
        { id: "ghorrock_ice_wolf", weight: 2 },
        { id: "ghorrock_icefiend", weight: 2 },
        { id: "ghorrock_pyrefiend", weight: 0.2 },
    ],
    [
        { id: "ghorrock_ice_giant", weight: 3 },
        { id: "ghorrock_ice_wolf", weight: 3 },
        { id: "ghorrock_ice_spider", weight: 2 },
        { id: "ghorrock_pyrefiend", weight: 0.2 },
    ],
    [
        { id: "ghorrock_ice_giant", weight: 3 },
        { id: "ghorrock_ice_wolf", weight: 3 },
        { id: "ghorrock_icefiend", weight: 2 },
        { id: ICE_WARRIOR_ID, weight: 2 },
        { id: "ghorrock_pyrefiend", weight: 0.2 },
    ],
]);

export const GHORROCK_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "ghorrock_pyrefiend" },
    { at: 150, kind: "elite", enemyId: "ghorrock_ice_spider" },
    { at: 200, kind: "elite", enemyId: "ghorrock_ice_wolf" },
    { at: 250, kind: "elite", enemyId: "ghorrock_pyrefiend" },
    { at: 300, kind: "boss", enemyId: "ketla", hp: 4200 },
    { at: 330, kind: "ring", enemyId: ICE_WARRIOR_ID, count: 30 },
    { at: 400, kind: "elite", enemyId: "ghorrock_ice_giant" },
    { at: 480, kind: "elite", enemyId: "flaming_pyrelord" },
    { at: 540, kind: "elite", enemyId: "ghorrock_pyrefiend" },
    { at: 600, kind: "boss", enemyId: "jhallan", hp: 8000 },
    { at: 630, kind: "ring", enemyId: "ghorrock_ice_spider", count: 40 },
    { at: 690, kind: "elite", enemyId: "flaming_pyrelord" },
    { at: 750, kind: "elite", enemyId: "ghorrock_ice_giant" },
    { at: 810, kind: "elite", enemyId: "flaming_pyrelord" },
    { at: 840, kind: "ring", enemyId: ICE_WARRIOR_ID, count: 60 },
    { at: 870, kind: "elite", enemyId: "ghorrock_pyrefiend" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "duke_sucellus", hp: 28000 },
];

// The cold (core/rules/ColdRule.ts), on the yard's braziers, vents and pools
export const GHORROCK_COLD: ColdRuleDef = {
    kind: "cold",
    cold: {
        max: 100,
        rise: 2,
        fast: 5,
        slows: [
            { at: 50, pace: 0.15 },
            { at: 80, pace: 0.3, weapons: 0.15 },
        ],
        freeze: { seconds: 1.5, share: 0.1, after: 70 },
    },
    braziers: {
        at: GHORROCK_BRAZIERS.map((tile) => ghorrockWorld(tile)),
        size: 2,
        reach: 3.5,
        warm: 15,
        burn: 40,
        gutter: 10,
        relight: { reach: 2.5, seconds: 1.5, kill: 6 },
    },
    embers: { size: 3, seconds: 12, reach: 2, warm: 20, share: 0.02, every: 0.5 },
    fire: {
        weapons: ["fire_spells", "flames_of_zamorak", "burning_claws", "toktz_mej_tal"],
        perHit: 0.4,
    },
    vents: {
        at: GHORROCK_VENTS.map((tile) => ghorrockWorld(tile, true)),
        size: 3,
        every: 7,
        warn: 1,
        puff: 1.5,
        share: 0.02,
        hurtEvery: 0.6,
    },
    ice: {
        pools: GHORROCK_POOLS.map(({ x, y, rx, ry }) => ({ ...ghorrockWorld({ x, y }), rx, ry })),
        grip: 0.06,
    },
    look: {
        // An iron brazier, made big enough for its square, with a fire's orange flames in it
        // while it's lit (the prison's own burn violet, which doesn't read as warm)
        brazierLocId: 46614,
        fireLocId: 25155,
        brazierScale: 1.8,
        fireScale: 0.7,
        gasLocId: 49761,
        puffSpotAnim: DUKE_GAS,
        iceBlockLocId: 49144,
        // A small fire, a few of them over the embers
        embersLocId: 5249,
        // Cold light over the snow
        wash: "#dce8ff",
        relightSpotAnim: FLARE,
    },
};
