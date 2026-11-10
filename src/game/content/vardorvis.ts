import { STRANGLEWOOD_CLEARING } from "../scaperune/maps/stranglewood";
import { STRANGLEWOOD_ROOTS } from "./stranglewood";
import {
    ArenaFeatures,
    BossAttackDef,
    EnemyDef,
    FightAbilityDef,
    ImpactDef,
    RootsRuleDef,
} from "./types";

// Awakened Vardorvis, Act II's first Awakened fight (MapDef.fight, maps.ts), fought on his own in
// his clearing in the Stranglewood, as the Forester. Zachariah's way of a fight: an attack about
// every 1.4 s by phase, his guard down when a dart or a strangle of his misses, a dart into one of
// his pillars sticking him there, and a button that rewards stepping in. The Stranglewood's roots
// are the thread through it: they creep in from the clearing's edge, his dart roots the ground it
// crosses, his tendrils erupt from them, his captors (root hearts) stand in them and heal him, and
// the Forester's sword and Chop cut them back.
// The design and its numbers: docs/design/awakened-vardorvis.md.

// His animations (npc 12223, skeleton 2151, as the Stranglewood's Vardorvis has them)
const IDLE_SEQ = 10337;
const WALK_SEQ = 10338;
const STRIKE_SEQ = 10341;
const DART_SEQ = 10342;
const ROOTS_SEQ = 10344;
const DEATH_SEQ = 10346;

// What his blows throw up, all the cache's own: grey dust (2699, 2184), the Corporeal Beast's
// stomp ring (318), his tendrils' bursts (2512, 2514), his head's shot (2520), stunned stars (80)
const DUST = 2699;
const BLOWN_DUST = 2184;
const STOMP = 318;
const TENDRIL_BURST = 2512;
const VINE_BURST = 2514;
const HEAD_SHOT = 2520;
const STARS = 80;
const SOUNDS = { attack: 7091, hit: 7119, death: 7052 };

export const AWAKENED_VARDORVIS_ID = "awakened_vardorvis";
export const VARDORVIS_CAPTOR_ID = "vardorvis_captor";

// The clearing: his ring of eight pillars round where he rises (locs 48419-48428, kept by the
// Stranglewood's recipe), in tiles off his spot, and the square the fight's kept in
const PILLARS: [number, number][] = [
    [-4, -1],
    [-4, 3],
    [-1, -4],
    [3, -4],
    [6, -1],
    [6, 3],
    [-1, 6],
    [3, 6],
];
const HALF = 10;
const SPOT = { x: Math.floor(STRANGLEWOOD_CLEARING.x), y: Math.floor(STRANGLEWOOD_CLEARING.y) };
export const VARDORVIS_BOSS_ARENA = { baseX: SPOT.x - HALF, baseY: SPOT.y - HALF, size: 2 * HALF };
// His axes are swung in from the square's corners
const CORNER = 1.5;
export const VARDORVIS_FEATURES: ArenaFeatures = {
    pillars: PILLARS.map(([dx, dy]) => ({ x: SPOT.x + dx, y: SPOT.y + dy, size: 1 })),
    knights: [
        { x: SPOT.x - HALF + CORNER, y: SPOT.y - HALF + CORNER },
        { x: SPOT.x + HALF - CORNER, y: SPOT.y - HALF + CORNER },
        { x: SPOT.x - HALF + CORNER, y: SPOT.y + HALF - CORNER },
        { x: SPOT.x + HALF - CORNER, y: SPOT.y + HALF - CORNER },
    ],
};

// What the fight's tuned to (maps.ts): his hitpoints, the Forester's 2h sword's level, and tiles
// south of him the player starts
export const VARDORVIS_HITPOINTS = 4400;
export const VARDORVIS_SWORD_LEVEL = 8;
export const VARDORVIS_START_DISTANCE = 6;

// Chop, the fight's button: the 2h sword brought down overhead, hard on him from close by, on a
// captor or his head in reach too, and it clears the roots round you whether he's there or not
export const VARDORVIS_CHOP: FightAbilityDef = {
    id: "chop",
    name: "Chop",
    damage: 60,
    reach: 3,
    // A dodged dart leaves him past you: a little further while his guard's down
    openReach: 4,
    cooldown: 4,
    cut: 3,
    // The Dragon 2h sword, his at level 8
    iconObjId: 7158,
    impact: {
        spots: [
            { spotAnim: DUST, fit: 2 },
            { spotAnim: STOMP, fit: 2 },
        ],
        shake: 0.25,
    },
    // A godsword's special, brought down overhead (the Armadyl godsword's Judgement), and the
    // sword's own sound
    playerSeq: 7644,
    sound: 2500,
};

// The Forester has 25 hitpoints: a big hit takes about a third
const OPENS = 2;
const RADIUS = 1;
const DART_LENGTH = 8;

// His axes swept across in front of him: a wedge a little short of the 2h sword's reach (2.75), so
// the place to stand is at its tip or off to his side; from beside him it's a step and a bit out
const STRIKE: BossAttackDef = {
    name: "Strike",
    kind: "swing",
    damage: 4,
    windup: 0.75,
    cooldown: 0,
    range: 2.5,
    radius: 2.5,
    cone: 2,
    underRadius: 1,
    weight: 5,
    seq: STRIKE_SEQ,
    sound: 7091,
    impact: { spots: [{ spotAnim: DUST, fit: 1.5 }], shake: 0.2 },
};

// His dart: a strip two wide and eight long, and he dashes down it to its end, stopping at whoever
// it hits or a pillar; the ground he crossed takes root behind him. Missed, his guard's down and
// he's past you; into a pillar, he's stuck there, stunned.
const DART: BossAttackDef = {
    name: "Dart",
    kind: "swing",
    damage: 6,
    windup: 0.9,
    cooldown: 3,
    range: 7,
    weight: 4,
    seq: DART_SEQ,
    sound: 7133,
    line: { width: 2, length: DART_LENGTH, dash: DART_LENGTH - RADIUS },
    opens: OPENS,
    rule: { lane: 1 },
    impact: {
        trail: { spotAnim: BLOWN_DUST, fit: 1 },
        spots: [{ spotAnim: DUST, fit: 2 }],
        shake: 0.35,
    },
    follow: { attack: "Bleeding vines", delay: 0.2 },
};

const VINES: BossAttackDef = {
    name: "Bleeding vines",
    kind: "ground",
    damage: 2,
    windup: 1.1,
    cooldown: 999,
    range: 0,
    weight: 0,
    phases: [],
    sound: 7101,
    ground: {
        spots: [{ shape: "ring", count: 6, distance: 2.5 }],
        radius: 1,
        spotAnim: VINE_BURST,
        alpha: 0.35,
    },
};

// His axes (npc 12227, spinning) thrown in from a corner of the square at where you stood, right
// across and back; severed, from two corners at once
const AXES: BossAttackDef = {
    name: "Swinging axes",
    kind: "projectile",
    damage: 3,
    windup: 1.1,
    cooldown: 7,
    range: 999,
    weight: 2,
    count: 1,
    phases: [1, 2],
    seq: DEATH_SEQ,
    sound: 7065,
    speed: 7,
    // The spinning axe's width
    radius: 0.9,
    from: "knights",
    lookId: "vardorvis_axe",
    boomerang: { reach: 2 * HALF, toEdge: true },
    message: "Vardorvis's axes swing across the ground!",
};

// A tendril whipped along the ground at you: caught, you're dragged to his feet, bound, and struck
// twice; dodged, his guard's down
const STRANGLE: BossAttackDef = {
    name: "Strangle",
    kind: "projectile",
    damage: 2,
    windup: 1,
    cooldown: 6,
    range: 10,
    minRange: 2.5,
    weight: 3,
    phases: [2, 3],
    seq: ROOTS_SEQ,
    spotAnim: VINE_BURST,
    speed: 7,
    radius: 0.6,
    impactSpotAnim: TENDRIL_BURST,
    wave: { reach: 11 },
    onHit: { pull: 2, pullSeconds: 0.3, bind: 1.5, attack: "Strangling blows" },
    shout: "Be still!",
    opens: OPENS,
    impact: { spots: [{ spotAnim: TENDRIL_BURST, fit: 1.5 }], shake: 0.3 },
};

const BLOWS: BossAttackDef = {
    name: "Strangling blows",
    kind: "swing",
    damage: 3,
    windup: 0.35,
    cooldown: 0,
    range: 999,
    weight: 0,
    phases: [],
    seq: STRIKE_SEQ,
    radius: 3,
    chain: { times: 1, windup: 0.4 },
    impact: { spots: [{ spotAnim: DUST, fit: 1.5 }], shake: 0.15 },
};

// The roots round you erupt: up to eight of the rooted cells within eight tiles
const ROOTS_RISE: BossAttackDef = {
    name: "The roots rise",
    kind: "ground",
    damage: 4,
    windup: 1.3,
    cooldown: 6,
    range: 999,
    weight: 3,
    phases: [2, 3],
    seq: ROOTS_SEQ,
    sound: 7101,
    ground: {
        spots: [{ shape: "rule", count: 8, within: 8 }],
        radius: 1.1,
        spotAnim: TENDRIL_BURST,
        alpha: 0.35,
    },
    message: "The roots round you stir...",
};

const ATTACKS: BossAttackDef[] = [
    STRIKE,
    DART,
    // Severed, he darts twice, the second aimed afresh and quicker
    { ...DART, name: "Darts", weight: 3, phases: [3], chain: { times: 1, windup: 0.65 } },
    VINES,
    AXES,
    { ...AXES, name: "Both axes", count: 2, phases: [3] },
    STRANGLE,
    BLOWS,
    ROOTS_RISE,
];

const LANDING: ImpactDef = {
    spots: [
        { spotAnim: DUST, fit: 3 },
        { spotAnim: BLOWN_DUST, fit: 2.5 },
    ],
    shake: 0.4,
};

export const VARDORVIS_ENEMIES: EnemyDef[] = [
    {
        id: AWAKENED_VARDORVIS_ID,
        name: "Awakened Vardorvis",
        npcId: 12223,
        idleSeq: IDLE_SEQ,
        walkSeq: WALK_SEQ,
        attackSeq: STRIKE_SEQ,
        deathSeq: DEATH_SEQ,
        hp: VARDORVIS_HITPOINTS,
        damage: 0,
        speed: 3,
        radius: RADIUS,
        xp: 0,
        knockbackResist: 1,
        solid: true,
        sounds: SOUNDS,
        spawnMessage: "Awakened Vardorvis rises in his clearing!",
        boss: {
            attackInterval: 1.4,
            keepDistance: 1.5,
            enrage: { message: "" },
            bulletGrace: 0.6,
            attacks: ATTACKS,
            fallSeconds: 2.4,
            summonsAt: [
                {
                    hp: 0.35,
                    enemyId: "awakened_vardorvis_head",
                    count: 1,
                    distance: 6,
                    message: "Vardorvis's head tears free, and gazes!",
                },
            ],
            look: {
                title: "#d0453a",
                subtitle: "#c9b8a0",
                edge: null,
                vignette: null,
                lean: true,
                dark: [14, 4, 4],
            },
            intro: {
                seconds: 4.5,
                riseAt: 1.2,
                title: "Awakened Vardorvis",
                subtitle: "The Stranglewood",
                distance: VARDORVIS_START_DISTANCE,
                alone: true,
                atMiddle: true,
                holds: true,
                faces: true,
                pan: { from: 2.4, over: 1.4 },
                land: LANDING,
                landAt: 0.2,
            },
            guard: {
                damage: 2,
                stun: 2.5,
                stunSpotAnim: STARS,
                stunHeight: 2.6,
                exposeSound: 1971,
                stunSound: 1141,
                stunGrace: 8,
                resisted: { spots: [{ spotAnim: DUST, fit: 1.8 }] },
                resistShout: "Not this time!",
                stuck: {
                    spots: [
                        { spotAnim: STOMP, fit: 2 },
                        { spotAnim: DUST, fit: 2 },
                    ],
                    shake: 0.6,
                },
            },
            phases: {
                phases: [
                    { until: 0.7, status: "The axes swing" },
                    {
                        until: 0.35,
                        status: "The wood wakes",
                        message: "The wood wakes!",
                        opener: "The roots rise",
                        tempo: 0.9,
                        speed: 1.1,
                    },
                    {
                        status: "Severed",
                        message: "Severed!",
                        opener: "Darts",
                        tempo: 0.8,
                        speed: 1.2,
                    },
                ],
                threshold: {
                    seconds: 2,
                    shout: "The wood is mine!",
                    sound: 7101,
                    impact: {
                        spots: [
                            { spotAnim: TENDRIL_BURST, fit: 3 },
                            { spotAnim: STOMP, fit: 3 },
                        ],
                        shake: 0.4,
                        flash: "#3a0a08",
                    },
                    riseImpact: {
                        spots: [
                            { spotAnim: STOMP, fit: 7 },
                            { spotAnim: BLOWN_DUST, fit: 3 },
                        ],
                        shake: 0.6,
                        flash: "#3a0a08",
                    },
                },
                barPerPhase: true,
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
    // At 35% his head tears free and floats at the clearing's edge, gazing: it can be cut down
    {
        id: "awakened_vardorvis_head",
        name: "Vardorvis' Head",
        npcId: 12226,
        idleSeq: 10348,
        walkSeq: 10348,
        attackSeq: 10348,
        deathSeq: -1,
        hp: 300,
        damage: 2,
        speed: 0,
        radius: 0.45,
        xp: 0,
        sounds: SOUNDS,
        stationary: true,
        healthBar: true,
        shot: { range: 16, interval: 3.5, speed: 9, spotAnim: HEAD_SHOT },
    },
    // His blood captors: drawn as the wood's root hearts (the Large Tendril), which heal him while
    // they stand
    {
        id: VARDORVIS_CAPTOR_ID,
        name: "Blood captor",
        npcId: 12225,
        idleSeq: 10363,
        walkSeq: 10363,
        attackSeq: 10365,
        deathSeq: -1,
        hp: 120,
        damage: 3,
        speed: 0,
        radius: 1.2,
        xp: 0,
        sounds: { attack: 7101, hit: 7119, death: 7052 },
        scale: 0.8,
        stationary: true,
        solid: true,
        healthBar: true,
        spawnMessage: "A blood captor pushes up through the roots!",
        heals: {
            fraction: 0.005,
            interval: 2,
            // Across most of the clearing: it stands where it came up (stationary), so its seek
            // is only how far it looks
            range: 16,
            targets: [AWAKENED_VARDORVIS_ID],
            seek: 16,
            spotAnim: TENDRIL_BURST,
        },
    },
];

// The roots of his clearing: the Stranglewood's, kept to a circle inside the square the fight's
// in and creeping in from its edge from 5 s, quicker over three minutes; his captors at the root
// front from 40 s, every 30 s, at most two
export const VARDORVIS_ROOTS: RootsRuleDef = {
    ...STRANGLEWOOD_ROOTS,
    start: 5,
    fronts: [2, 3],
    every: [3, 1.8],
    lateBy: 180,
    safe: undefined,
    ring: { x: SPOT.x + 1, y: SPOT.y + 1, radius: HALF - 0.5 },
    haste: 0,
    cut: { hit: 1, kill: 1.5, regrow: 10 },
    hearts: {
        enemyId: VARDORVIS_CAPTOR_ID,
        from: 40,
        every: 30,
        max: 2,
        reach: 6,
        clear: 5,
        calm: 10,
    },
};
