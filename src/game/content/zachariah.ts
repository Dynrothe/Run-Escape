import { moveFeatures } from "../core/arena";
import { OWLS_COURT } from "../scaperune/maps/owlsCourt";
import { ArenaFeatures, BossAttackDef, EnemyDef } from "./types";

// Justiciar Zachariah, the Justiciar of the Owl, fought on his own in the Owl's Court
// (maps.ts, scaperune/maps/owlsCourt.ts): Phosani's Nightmare's way of a run that's one fight,
// but nothing like her fight. She throws patterns at you; his court is the weapon. The statues
// round it fire bolts down their rows, throw their swords and burn the bridge, his lightning
// strikes the floor's checker a colour at a time, and he hides nothing behind a shield: his
// hitpoints are the bar, a phase at each threshold (no totems). Only Saradomin Strike hurts him,
// as in OSRS, and only from close by (MapDef.fight.strikeReach), so the player has to stay near
// him while they read the room. Everything's warned on the ground or by a statue first.
// The design and its numbers: docs/design/justiciar-zachariah.md.

// His animations, all on his own skeleton (1756), as the cache has them for npc 7858
const IDLE_SEQ = 7851;
const WALK_SEQ = 7852;
// A wide sword slash, and the same again
const SLASH_SEQ = 7853;
// His sword raised overhead and brought down: his shock wave, and his casts
const RAISE_SEQ = 7962;
// Coming down from above (it starts two and a half times his height up)
const DESCEND_SEQ = 7964;
// His guard up: down on one knee at a threshold, and before a leap
const BLOCK_SEQ = 7965;
const DEATH_SEQ = 7854;

// The Sepulchre's statues the fight draws and animates (the map leaves their models out)
const CROSSBOWMAN = 38445;
const KNIGHT = 38432;
const FIRE_JET = 38427;

// The arena's features, in world tiles. Each crossbowman fires down its own row, so a lane (three
// statues side by side) is three rows of bolts, rows 3i to 3i + 2 of lane i.
const LANES = OWLS_COURT.bolts;
export const OWLS_COURT_FEATURES: ArenaFeatures = moveFeatures(
    {
        checker: OWLS_COURT.checker,
        pillars: OWLS_COURT.pillars,
        bolts: LANES.flatMap((lane) =>
            lane.statues.map((statue) => ({
                y: statue.y,
                fromX: lane.fromX,
                toX: lane.toX,
                dir: lane.dir,
                statues: [statue],
            })),
        ),
        knights: OWLS_COURT.knights,
        fires: OWLS_COURT.fires,
        dais: OWLS_COURT.dais,
        rise: { x: OWLS_COURT.rise.x + 0.5, y: OWLS_COURT.rise.y + 0.5 },
    },
    OWLS_COURT.origin.x,
    OWLS_COURT.origin.y,
);
// The rows of lane i
const lane = (i: number) => [i * 3, i * 3 + 1, i * 3 + 2];

// What the fight's tuned to (maps.ts): his hitpoints, the Saradominist's Saradomin Strike's level,
// and how near him they have to be for it to reach him, in tiles from his middle
export const ZACHARIAH_HITPOINTS = 2000;
export const ZACHARIAH_STRIKE_LEVEL = 7;
export const ZACHARIAH_STRIKE_REACH = 8.5;

// Tiles south of him the player stands as he comes down, as the map starts them
export const ZACHARIAH_START_DISTANCE = OWLS_COURT.rise.y - OWLS_COURT.start.y;

// What the player has: the Saradominist's 30 hitpoints, at 4 tiles a second. His big hits take
// about half; a bolt or the fire a tenth, so standing in a lane or the fire is what costs.
const BOLT = 3;
const FIRE = 4;
// How far off the player can be for his own attacks; further than that he walks after them, and
// from well off (the terrace) he leaps to them
const REACH = 16;

// A bolt: hit no wider than the arrow's drawn, at about twice the player's speed. Three volleys
// half a second apart down each row of two lanes (one from each side), the next two lanes the next
// time: from the middle of a lane it's two and a bit tiles to be clear of it, half a second's walk,
// against the second and more the statues take to draw.
const BOLT_HIT = 0.3;
const BOLT_SPEED = 9.5;

const CROSSBOW_ROWS: BossAttackDef = {
    name: "Crossbow rows",
    kind: "pattern",
    damage: BOLT,
    windup: 0,
    cooldown: 0,
    range: 999,
    weight: 0,
    phases: [],
    seq: RAISE_SEQ,
    lookId: "zachariah_bolt",
    sound: 4346,
    statues: { locId: CROSSBOWMAN, windupSeq: 8682, seq: 8684 },
    pattern: {
        shape: "rows",
        count: 1,
        volleys: 3,
        interval: 0.5,
        speed: BOLT_SPEED,
        range: 30,
        radius: BOLT_HIT,
        delay: 1.2,
        pillars: true,
        rows: {
            sets: [
                [...lane(0), ...lane(3)],
                [...lane(1), ...lane(4)],
                [...lane(2), ...lane(5)],
            ],
        },
    },
};

// His lunge: a strip two wide and seven long the way he faced as it began. A step of a tile and a
// third (a third of a second) takes the player off it; behind or beside him is safe.
const LUNGE: BossAttackDef = {
    name: "Lunge",
    kind: "swing",
    damage: 13,
    windup: 1.1,
    cooldown: 2,
    range: 6.5,
    weight: 4,
    seq: SLASH_SEQ,
    sound: 3876,
    line: { width: 2, length: 7 },
};

// The ice: a 3 by 3 square on the tile they stood on, small damage and frozen for a second and a
// half. From its middle it's 1.85 tiles to be clear, under half a second.
const ICE: BossAttackDef = {
    name: "Ice barrage",
    kind: "blast",
    damage: 4,
    windup: 1.3,
    cooldown: 5,
    range: 14,
    weight: 3,
    phases: [1, 2],
    seq: RAISE_SEQ,
    windupSound: 3856,
    sound: 168,
    impactSpotAnim: 369,
    square: 3,
    effect: { kind: "freeze", seconds: 1.5 },
};

// The knights' swords: thrown from a statue's middle at where the player stood, across the court
// and back the same way, hitting each way. Its hit's the spinning sword's width.
const SWORD: BossAttackDef = {
    name: "Knight's sword",
    kind: "projectile",
    damage: 8,
    windup: 1.3,
    cooldown: 9,
    range: 999,
    weight: 2,
    phases: [2],
    seq: RAISE_SEQ,
    windupSound: 4410,
    sound: 4411,
    speed: 9,
    radius: 1.3,
    from: "knights",
    lookId: "zachariah_sword",
    boomerang: { reach: 27, catchSeq: 8668, catchSound: 4442 },
    statues: { locId: KNIGHT, windupSeq: 8667 },
};

// The lightning: every cell of one colour of the court's floor, then the other's. From a struck
// cell's middle it's 1.85 tiles into the other colour's, under half a second, against 1.6.
const LIGHTNING: BossAttackDef = {
    name: "Lightning",
    kind: "ground",
    damage: 9,
    windup: 1.6,
    cooldown: 8,
    range: 999,
    weight: 3,
    phases: [2],
    seq: RAISE_SEQ,
    windupSound: 4364,
    sound: 4428,
    impactSpotAnim: 1796,
    // The cells about to be struck glow red and gold, as the Sepulchre's strange tiles do
    ground: {
        spots: [{ shape: "checker", then: 1.6 }],
        radius: 1.5,
        locId: 56669,
        // Its star inside the cell, and plain to see: it's the warning of a big hit everywhere
        fit: 0.85,
        alpha: 0.55,
    },
};

const ATTACKS: BossAttackDef[] = [
    LUNGE,
    // His signature: the blue wave along the ground at where they stood. A sidestep of a tile
    // (a quarter of a second) clears it; it's seen for over a second first. Whoever it reaches is
    // dragged to his feet and bound, then he slashes three times (half their hitpoints in all, the
    // wave's share with it).
    {
        name: "Shock wave",
        kind: "projectile",
        damage: 3,
        windup: 1.2,
        cooldown: 7,
        range: 11,
        minRange: 2.5,
        weight: 3,
        seq: RAISE_SEQ,
        windupSound: 3883,
        spotAnim: 1515,
        speed: 6.5,
        radius: 0.75,
        // The justiciars' blue impact, on whoever it binds for as long as it does
        impactSpotAnim: 1458,
        wave: { reach: 12 },
        onHit: { pull: 2.4, pullSeconds: 0.3, bind: 1.7, attack: "Flurry" },
        shout: "Kneel!",
    },
    {
        name: "Flurry",
        kind: "swing",
        damage: 4,
        windup: 0.35,
        cooldown: 0,
        range: 999,
        weight: 0,
        phases: [],
        seq: SLASH_SEQ,
        radius: 3.2,
        chain: { times: 2, windup: 0.4 },
    },
    ICE,
    // In the verdict the ice is quicker to let go, and the lunge follows it at where they're
    // stuck: a second to be free, then half a second to step off the strip
    {
        ...ICE,
        name: "Ice barrage, then lunge",
        phases: [3],
        effect: { kind: "freeze", seconds: 1 },
        follow: { attack: "Lunge (following)", delay: 0.4 },
    },
    { ...LUNGE, name: "Lunge (following)", weight: 0, phases: [], range: 999, windup: 1.15 },
    LIGHTNING,
    // The verdict's: only the cells round theirs, quicker, and a sword thrown through it
    {
        ...LIGHTNING,
        name: "Lightning round you",
        phases: [3],
        windup: 1.3,
        ground: { ...LIGHTNING.ground!, spots: [{ shape: "checker", then: 1.3, cross: 1 }] },
        follow: { attack: "Knight's sword (following)", delay: 0.3 },
    },
    SWORD,
    { ...SWORD, name: "Knight's swords", phases: [3], count: 2 },
    { ...SWORD, name: "Knight's sword (following)", phases: [], weight: 0 },
    // The verdict: he leaps to the court's middle and raises his sword, and everything in his sight
    // takes over half its hitpoints. The pillars' shadows are shown as he winds up: from anywhere in
    // the court a pillar's no more than eight tiles off, two seconds at a walk.
    {
        name: "The Owl's gaze",
        kind: "swing",
        damage: 16,
        windup: 2.6,
        cooldown: 14,
        range: 999,
        weight: 2,
        phases: [3],
        seq: RAISE_SEQ,
        windupSound: 3883,
        sound: 3887,
        impactSpotAnim: 1458,
        radius: 40,
        toMiddle: true,
        // The safe tiles glow blue, as the strange tiles do
        cover: { locId: 56670 },
        message: "Hide from his gaze!",
        shout: "Face judgement!",
    },
    CROSSBOW_ROWS,
    {
        ...CROSSBOW_ROWS,
        name: "Crossbow rows (verdict)",
        pattern: { ...CROSSBOW_ROWS.pattern!, delay: 1 },
    },
    // The bridge's fire, from the second phase on, as the real Sepulchre's: each row lights a half
    // second behind the last, and they're all out together for 1.8 seconds a cycle, time to walk
    // the bridge's four rows
    {
        name: "Bridge fire",
        kind: "ground",
        damage: FIRE,
        windup: 0,
        cooldown: 0,
        range: 999,
        weight: 0,
        phases: [],
        sound: 4450,
        cycle: {
            period: 4.5,
            stagger: 0.5,
            warn: 0.8,
            burn: 1.2,
            out: 0.6,
            interval: 0.5,
            locId: FIRE_JET,
            seqs: { warn: 8661, burn: 8662, out: 8663 },
        },
    },
];

// Never spawned: what the statues throw and fire, drawn as the Sepulchre's own NPCs
const PROP = {
    walkSeq: -1,
    attackSeq: -1,
    deathSeq: -1,
    hp: 1,
    damage: 0,
    speed: 0,
    xp: 0,
    knockbackResist: 1,
    sounds: { attack: -1, hit: -1, death: -1 },
};

export const ZACHARIAH_ENEMIES: EnemyDef[] = [
    {
        id: "justiciar_zachariah",
        name: "Justiciar Zachariah",
        npcId: 7858,
        idleSeq: IDLE_SEQ,
        walkSeq: WALK_SEQ,
        attackSeq: SLASH_SEQ,
        deathSeq: DEATH_SEQ,
        hp: 3000,
        damage: 0,
        // Three quarters of the player's pace, quicker by the phase: he chases
        speed: 3,
        radius: 1.2,
        xp: 0,
        knockbackResist: 1,
        solid: true,
        sounds: { attack: -1, hit: -1, death: -1 },
        spawnMessage: "Justiciar Zachariah descends!",
        boss: {
            attackInterval: 2.4,
            keepDistance: 2.5,
            enrage: { message: "" },
            bulletGrace: 0.6,
            // Down on one knee, then he comes down by them, rather than just being there
            leash: {
                distance: REACH,
                keep: 5,
                jump: { downSeq: BLOCK_SEQ, upSeq: DESCEND_SEQ, seconds: 0.7 },
            },
            attacks: ATTACKS,
            // His death (7854) is a second and a half
            fallSeconds: 1.5,
            look: {
                title: "#efc657",
                subtitle: "#9cc0ee",
                edge: null,
                vignette: null,
                lean: true,
                dark: [2, 6, 18],
            },
            intro: {
                seconds: 5,
                riseAt: 1,
                seq: DESCEND_SEQ,
                darkSound: 4448,
                sound: 3856,
                title: "Justiciar Zachariah",
                subtitle: "The Owl's Court",
                distance: ZACHARIAH_START_DISTANCE,
                alone: true,
                // He comes down in the court's middle (ArenaFeatures.rise), the player by its south
                // edge, and the camera comes back to them once he's down (7964 is 1.3 s)
                atMiddle: true,
                holds: true,
                pan: { from: 2.6, over: 1.6 },
            },
            phases: {
                phases: [
                    {
                        until: 0.7,
                        status: "The trial begins",
                        ambients: [{ attack: "Crossbow rows", interval: 5, delay: 1.5 }],
                    },
                    {
                        until: 0.35,
                        status: "The Sepulchre wakes",
                        message: "The Sepulchre wakes!",
                        opener: "Lightning",
                        tempo: 0.85,
                        speed: 1.1,
                        ambients: [
                            { attack: "Crossbow rows", interval: 4.5, delay: 2 },
                            { attack: "Bridge fire", interval: 0 },
                        ],
                    },
                    {
                        status: "The verdict",
                        message: "The verdict!",
                        opener: "The Owl's gaze",
                        tempo: 0.7,
                        speed: 1.2,
                        ambients: [
                            { attack: "Crossbow rows (verdict)", interval: 4, delay: 4 },
                            { attack: "Bridge fire", interval: 0 },
                        ],
                    },
                ],
                // Down on one knee, and up again with his sword raised
                threshold: {
                    seconds: 2.4,
                    seq: BLOCK_SEQ,
                    riseSeq: RAISE_SEQ,
                    riseSeconds: 1.2,
                    shout: "You will be judged!",
                    sound: 3856,
                },
                // The court's edges are drops: the bridge and the terrace are the player's to use
                confine: false,
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
    // The knights' spinning gold sword, size 3
    { ...PROP, id: "zachariah_sword", name: "Sword", npcId: 9670, idleSeq: 8671, radius: 1.3 },
    // The crossbowmen's gold bolt
    { ...PROP, id: "zachariah_bolt", name: "Bolt", npcId: 9674, idleSeq: 8687, radius: 0.3 },
];
