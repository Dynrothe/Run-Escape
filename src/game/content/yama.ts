import { BATTLE_FOR_VARROCK, LOW_FIRE } from "../scaperune/maps/battleForVarrock";
import { BossAttackDef, EnemyDef, FloorActionDef, ImpactDef } from "./types";

// Yama, woken on his throne in burnt Varrock's palace (the Battle for Varrock's lair, MapDef.lair):
// the player, as Justiciar Zachariah, steps onto the palace floor, he rises, and every way off it
// burns until he's dead. The floor is his weapon (MapDef.floor's patterns: his stomp's ripple, his
// shadow lanes), with his claw close in and fireballs at range. The Owl's gaze can't touch him: he
// raises pillars against it (BossDef.gazeWard). His meteor kills whoever it lands on, and only a
// gaze cast at him while he calls it down stops it (BossAttackDef.interruptedBy), leaving him open.
// The design and its numbers: docs/design/yama.md.

// His animations, all npc 14176's own (RuneLite's names in brackets)
const IDLE_SEQ = 12140;
const WALK_SEQ = 12141;
// Fire thrown from his hands (MAGIC01, 1.8 s): it leaves them about 1.1 s in, with its sound
const CAST_SEQ = 12144;
const CAST_AT = 1.1;
// Both arms raised (MAGIC02, 2.4 s): the meteor
const RAISE_SEQ = 12145;
// His claw (MELEE01, 1.8 s)
const CLAW_SEQ = 12146;
const CLAW_AT = 0.9;
// A stomp (STOMP01, 2.4 s): his foot comes down 1.16 s in, with its sound
const STOMP_SEQ = 12148;
const STOMP_AT = 1.16;
// A hand to the ground (SUMMON01, 2.4 s): his shadow lanes
const SUMMON_SEQ = 12156;
// Coming up through a portal (PORTAL02, 4.8 s), and going down through one (DESPAWN01, 3.6 s)
const RISE_SEQ = 12160;
const DEATH_SEQ = 12161;

// His spot animations: a fiery skull flying (3250) and bursting (3251), the meteor (3271) and
// the shadow of debris falling (3291)
const SKULL = 3250;
const SKULL_BURST = 3251;
const METEOR = 3271;
const DEBRIS_SHADOW = 3291;
// The Corporeal Beast's stomp ring, grey dust blown along the ground, and embers drifting up
const STOMP_RING = 318;
const BLOWN_DUST = 2184;
const EMBERS = 2246;
// The stars of a stunned head
const STARS = 80;

// His sounds, as his animations play them
const CAST_SOUND = 10251;
const CLAW_SOUND = 10247;
const STOMP_SOUND = 10260;
const RAISE_SOUND = 10266;
const PORTAL_SOUND = 10271;

// The Gielinor stone pillar the floor's skins use (floorSkins.ts stonePillar)
const STONE_PILLAR = 7016;

// What the fight's tuned to: his hitpoints (the lair's), and the hero's 38 hitpoints that his
// damage is out of (the floor's slabs take 6 of them: MapDef.floor's slam).
export const YAMA_HITPOINTS = 5400;
const RADIUS = 2;
// His claw reaches this far past his edge
const CLAW_REACH = 3;

// His guard (BossDef.guard): down this long after a claw that misses, doubling what he takes
const OPENS = 3;

const STOMPED: ImpactDef = {
    spots: [
        { spotAnim: STOMP_RING, fit: 4 },
        { spotAnim: BLOWN_DUST, fit: 3 },
    ],
    shake: 0.35,
};

// His claw: a wide swipe in front of him, from the arm drawn back. Step out of it, or round
// behind him; missed, his guard's down, and he won't claw again until it's back up.
const CLAW: BossAttackDef = {
    name: "Claw",
    kind: "swing",
    damage: 10,
    windup: 1.1,
    cooldown: 4.5,
    range: CLAW_REACH + RADIUS,
    weight: 5,
    seq: CLAW_SEQ,
    strikeAt: CLAW_AT,
    windupSound: CLAW_SOUND,
    radius: CLAW_REACH + RADIUS,
    cone: (Math.PI * 2) / 3,
    underRadius: RADIUS,
    opens: OPENS,
    impact: { spots: [{ spotAnim: BLOWN_DUST, fit: 2.5 }], shake: 0.3 },
};

// The floor rippling out from his stomp, a ring of slabs at a time out to radius tiles, with the
// diagonals (or the cross) left down: out of its reach before it gets there, or onto a spoke.
// Started so its first ring (under him) rises as his foot comes down.
const ripple = (
    ringSeconds: number,
    radius: number,
    spokes: "cross" | "diagonal",
): FloorActionDef => ({
    kind: "pattern",
    pattern: { kind: "ripple", at: "player", ringSeconds, radius, spokes },
    delay: STOMP_AT - 1,
});

const HELLSTOMP: BossAttackDef = {
    name: "Hellstomp",
    kind: "swing",
    // All the floor's: nothing of its own
    damage: 0,
    radius: 0,
    windup: STOMP_AT,
    cooldown: 6,
    range: 999,
    weight: 3,
    seq: STOMP_SEQ,
    strikeAt: STOMP_AT,
    sound: STOMP_SOUND,
    floor: ripple(0.3, 8, "diagonal"),
    floorAt: "boss",
    impact: STOMPED,
};

// Lanes of the floor rising one after another, a tile at a time from his end, through where the
// player stands: between two is safe. They cross from the second phase.
const lanes = (axis: "y" | "both"): FloorActionDef => ({
    kind: "pattern",
    pattern: { kind: "lanes", axis, at: "player", spacing: 5, width: 2, tileSeconds: 0.05 },
});

const SHADOW_LANES: BossAttackDef = {
    name: "Shadow lanes",
    kind: "swing",
    damage: 0,
    radius: 0,
    windup: 1,
    cooldown: 7,
    range: 999,
    weight: 3,
    phases: [1],
    seq: SUMMON_SEQ,
    floor: lanes("y"),
};

// Fireballs at where they stand, two (three in the last phase) under half a second apart, each
// aimed afresh, and each leaving a burning tile for three seconds
const VOLLEY: BossAttackDef = {
    name: "Hellfire volley",
    kind: "blast",
    damage: 5,
    windup: CAST_AT,
    cooldown: 5,
    range: 999,
    minRange: CLAW_REACH,
    weight: 4,
    seq: CAST_SEQ,
    strikeAt: CAST_AT,
    sound: CAST_SOUND,
    spotAnim: SKULL,
    impactSpotAnim: SKULL_BURST,
    radius: 0.9,
    count: 1,
    chain: { times: 1, windup: 0.45 },
    phases: [1, 2],
    pool: { seconds: 3, radius: 0.9, damage: 1, interval: 1, locId: LOW_FIRE },
    impact: { shake: 0.15 },
};

// The meteor: he calls it down on them, and it kills whoever it lands on, wherever they are. A
// gaze cast at him while he does breaks it in the sky and leaves him open. Never picked: it comes
// on its own clock (BossDef.critical).
const METEOR_ATTACK: BossAttackDef = {
    name: "Meteor",
    kind: "swing",
    damage: 999,
    ignoreArmor: true,
    radius: 999,
    windup: 4.5,
    cooldown: 0,
    range: 999,
    weight: 0,
    phases: [],
    seq: RAISE_SEQ,
    windupSound: RAISE_SOUND,
    sound: STOMP_SOUND,
    shout: "Kneel.",
    message: "Turn your gaze on him!",
    meteor: { spotAnim: METEOR, shadowSpotAnim: DEBRIS_SHADOW, height: 14, dark: 0.45 },
    // Its glow on the floor where it's coming down, growing as it falls: in the dark it calls
    // for, its shadow alone doesn't show on the burnt stone (and at 1.2 nor did this)
    light: { radius: 3, color: 0xff6a20, intensity: 3, flicker: 0.2 },
    interruptedBy: {
        ability: "owls_gaze",
        open: 6,
        stun: 2,
        broken: {
            spots: [
                { spotAnim: SKULL_BURST, fit: 3 },
                { spotAnim: EMBERS, fit: 3 },
            ],
            shake: 0.4,
            flash: "#ffd9a0",
        },
        shout: "Ngh... you dare?",
    },
    impact: {
        spots: [
            { spotAnim: SKULL_BURST, fit: 6 },
            { spotAnim: STOMP_RING, fit: 9 },
        ],
        shake: 1,
        flash: "#ffb070",
    },
};

const ATTACKS: BossAttackDef[] = [
    CLAW,
    HELLSTOMP,
    // Quicker rings from the second phase, the other way through them
    { ...HELLSTOMP, name: "Hellstomp (quick)", phases: [2, 3], floor: ripple(0.22, 10, "cross") },
    SHADOW_LANES,
    { ...SHADOW_LANES, name: "Crossed lanes", phases: [2, 3], floor: lanes("both") },
    VOLLEY,
    { ...VOLLEY, name: "Hellfire volley (three)", phases: [3], chain: { times: 2, windup: 0.45 } },
    // In the last phase lanes bring a volley straight after, into where they had to stand
    {
        ...SHADOW_LANES,
        name: "Lanes, then volley",
        phases: [3],
        weight: 2,
        follow: { attack: "Hellfire volley (following)", delay: 0.6 },
    },
    { ...VOLLEY, name: "Hellfire volley (following)", phases: [], weight: 0, minRange: 0 },
    METEOR_ATTACK,
];

export const YAMA_ENEMIES: EnemyDef[] = [
    {
        id: "yama",
        name: "Yama",
        npcId: 14176,
        idleSeq: IDLE_SEQ,
        walkSeq: WALK_SEQ,
        attackSeq: CLAW_SEQ,
        deathSeq: DEATH_SEQ,
        // The lair's (MapDef.lair.hp)
        hp: YAMA_HITPOINTS,
        damage: 0,
        speed: 1.6,
        // His npc is 5 tiles across: at 0.8, 4
        scale: 0.8,
        radius: RADIUS,
        xp: 0,
        knockbackResist: 1,
        solid: true,
        sounds: { attack: -1, hit: -1, death: -1 },
        boss: {
            attackInterval: 1.7,
            keepDistance: 2.5,
            // He keeps to the throne end: no further than this from where he rose
            home: 5,
            enrage: { message: "" },
            attacks: ATTACKS,
            // His going down through the floor (12161) is 3.6 s
            fallSeconds: 3.6,
            // Put off while their gaze is more than 2.4 s from ready: its 1.6 s windup and a moment
            // to turn still land inside the meteor's 4.5
            critical: { attack: "Meteor", from: 0.85, every: [35, 35, 28], ready: 2.4 },
            gazeWard: {
                reach: 12,
                count: 4,
                distance: RADIUS + 1.5,
                seconds: 5,
                rise: 0.4,
                locId: STONE_PILLAR,
                shouts: ["Your little light? Here, let me help.", "Judge me? With what?"],
                impact: { spots: [{ spotAnim: BLOWN_DUST, fit: 1.5 }], shake: 0.2 },
            },
            look: {
                title: "#ff9a3c",
                subtitle: "#d9b8ff",
                edge: null,
                vignette: null,
                lean: true,
                dark: [18, 4, 2],
            },
            intro: {
                seconds: 5.5,
                riseAt: 0.8,
                seq: RISE_SEQ,
                sound: PORTAL_SOUND,
                title: "Yama",
                subtitle: "Varrock Palace",
                distance: BATTLE_FOR_VARROCK.yamaRise.y - BATTLE_FOR_VARROCK.yamaStart.y,
                alone: true,
                // He rises before his throne (MapDef.lair.at), the player by the floor's middle
                atMiddle: true,
                holds: true,
                faces: true,
                pan: { from: 3, over: 1.6 },
                land: STOMPED,
                landAt: 3,
            },
            guard: {
                damage: 2,
                stun: 2,
                stunSpotAnim: STARS,
                stunHeight: 4,
            },
            phases: {
                phases: [
                    { until: 0.7, status: "The palace burns" },
                    {
                        until: 0.35,
                        status: "Shadow and fire",
                        message: "Yama's fury grows!",
                        tempo: 0.9,
                    },
                    {
                        status: "Ash",
                        message: "Yama burns brighter!",
                        tempo: 0.8,
                    },
                ],
                threshold: {
                    seconds: 1.6,
                    seq: STOMP_SEQ,
                    shout: "Burn!",
                    sound: STOMP_SOUND,
                    impact: STOMPED,
                },
                // The lair's seal keeps everyone on the floor
                confine: false,
                barPerPhase: true,
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
];
