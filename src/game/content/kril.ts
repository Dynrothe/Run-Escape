import { BATTLE_FOR_VARROCK, LOW_FIRE } from "../scaperune/maps/battleForVarrock";
import { BossAttackDef, EnemyDef, PlayerEffectDef } from "./types";

// K'ril Tsutsaroth, Zamorak's general, the second of Yama's two in the Battle for Varrock
// (MapDef.lairs): asleep before the altar of the church in the north-east of the city until a
// player steps into its nave. Where Xarth stands and burns, K'ril comes at you down the aisle:
// poison claws, Zamorak's flames where you stand, a bloodrush onto where you were (missed, his
// guard's down) and his "YARRRRRRR!" smash through armour. Every so often he begins a desecration
// of the church, which heals him unless he's hit hard enough to break it, and as he's hurt his
// three bodyguards come, each taking half of what's meant for him while any of them stands. His
// fight's design and its numbers: docs/design/varrock-generals.md.

// His animations, npc 3129's: standing, walking, a claw, Zamorak's flames (both hands up) and his
// death
const IDLE_SEQ = 6935;
const WALK_SEQ = 4070;
const CLAW_SEQ = 6948;
const CAST_SEQ = 6950;
const DEATH_SEQ = 6949;

// Flames of Zamorak (78), the stars of a stunned head (80), the Corporeal Beast's stomp ring and
// grey dust blown along the ground
const ZAMORAK_FLAMES = 78;
const STARS = 80;
const STOMP_RING = 318;
const BLOWN_DUST = 2184;
// His sounds, as the God Wars' K'ril has them
const ATTACK_SOUND = 534;
const SMASH_SOUND = 2500;
const FLAMES_SOUND = 1659;
// Xarth's fire on the floor, his once Xarth's fallen: the map's low fire (LOW_FIRE)
// Xarth's bolt bursting
const BOLT_BURST = 4375;

// What his fight's tuned to: his hitpoints (the lair's), and the hero's 38 hitpoints that his
// damage is out of
export const KRIL_HITPOINTS = 4200;
const RADIUS = 1.6;
const CLAW_REACH = 2.2;

const POISON: PlayerEffectDef = { kind: "poison", damage: 1, seconds: 6 };
// Xarth's burn (content/xarth.ts), his claws' once Xarth's fallen
const BURN: PlayerEffectDef = {
    kind: "debuff",
    id: "xarth_burn",
    name: "Burning",
    // Fire rune
    iconObjId: 554,
    stats: {},
    seconds: 4,
    stacks: 5,
    burn: 1,
};

// A swipe in front of him that poisons: step out
const POISON_CLAWS: BossAttackDef = {
    name: "Poison claws",
    kind: "swing",
    damage: 7,
    windup: 0.8,
    cooldown: 1.2,
    range: CLAW_REACH + RADIUS,
    weight: 6,
    seq: CLAW_SEQ,
    windupSound: ATTACK_SOUND,
    radius: CLAW_REACH + RADIUS,
    cone: (Math.PI * 2) / 3,
    underRadius: RADIUS,
    effect: POISON,
    impact: { spots: [{ spotAnim: BLOWN_DUST, fit: 2 }], shake: 0.2 },
};

// Zamorak's flames, where you stand and round it: move off the spot
const FLAMES_OF_ZAMORAK: BossAttackDef = {
    name: "Flames of Zamorak",
    kind: "blast",
    damage: 6,
    windup: 1.1,
    cooldown: 4,
    range: 999,
    weight: 4,
    seq: CAST_SEQ,
    sound: FLAMES_SOUND,
    radius: 1.6,
    count: 3,
    spread: 2.5,
    impactSpotAnim: ZAMORAK_FLAMES,
};

// He leaps onto where you stood; missed, his guard's down
const BLOODRUSH: BossAttackDef = {
    name: "Bloodrush",
    kind: "blast",
    damage: 10,
    windup: 1.2,
    cooldown: 6,
    range: 16,
    minRange: 5,
    weight: 4,
    seq: CLAW_SEQ,
    windupSound: ATTACK_SOUND,
    radius: 2.2,
    leap: true,
    opens: 3,
    impact: {
        spots: [
            { spotAnim: STOMP_RING, fit: 4 },
            { spotAnim: BLOWN_DUST, fit: 3 },
        ],
        shake: 0.4,
    },
};

// A long windup, then a smash round him that hits through armour: get out of reach
const SMASH: BossAttackDef = {
    name: "YARRRRRRR!",
    kind: "swing",
    damage: 15,
    windup: 1.8,
    cooldown: 10,
    range: 6,
    weight: 3,
    seq: CLAW_SEQ,
    sound: SMASH_SOUND,
    radius: 4.6,
    ignoreArmor: true,
    shout: "YARRRRRRR!",
    message: "K'ril Tsutsaroth winds up a smash! Get out of reach!",
    impact: {
        spots: [
            { spotAnim: STOMP_RING, fit: 9 },
            { spotAnim: BLOWN_DUST, fit: 6 },
        ],
        shake: 0.55,
    },
};

// The church desecrated: five seconds of it, and he heals unless he's hit for his share in that
// time, which leaves him stunned and open. On a clock of its own (BossDef.critical).
const DESECRATION: BossAttackDef = {
    name: "Desecration",
    kind: "swing",
    damage: 8,
    windup: 5,
    cooldown: 0,
    range: 999,
    weight: 0,
    seq: CAST_SEQ,
    sound: FLAMES_SOUND,
    radius: 5,
    heal: 0.12,
    breakable: {
        share: 0.06,
        open: 3,
        stun: 3,
        shout: "Gah! You dare?",
        broken: { spots: [{ spotAnim: BLOWN_DUST, fit: 3 }], shake: 0.3 },
    },
    shout: "Zamorak, take this house!",
    message: "K'ril Tsutsaroth desecrates the church! Hit him hard to break it!",
    impact: {
        spots: [
            { spotAnim: ZAMORAK_FLAMES, fit: 6 },
            { spotAnim: STOMP_RING, fit: 10 },
        ],
        shake: 0.45,
    },
};

// Xarth's fallen first: his claws burn, and his bloodrush leaves the ground burning
const BURNING_CLAWS: BossAttackDef = {
    ...POISON_CLAWS,
    name: "Burning claws",
    empowered: true,
    effect: BURN,
    impact: { spots: [{ spotAnim: BOLT_BURST, fit: 2 }], shake: 0.2 },
};

const BURNING_RUSH: BossAttackDef = {
    ...BLOODRUSH,
    name: "Burning rush",
    empowered: true,
    pool: {
        seconds: 12,
        radius: 1.6,
        damage: 2,
        interval: 1,
        effect: BURN,
        locId: LOW_FIRE,
        dousedBy: "shock_wave",
    },
};

export const KRIL_BODYGUARDS = ["tstanon_karlak", "zakln_gritch", "balfrug_kreeyath"];

export const KRIL_ENEMIES: EnemyDef[] = [
    {
        id: "kril_general",
        name: "K'ril Tsutsaroth",
        faction: "zamorak",
        npcId: 3129,
        idleSeq: IDLE_SEQ,
        walkSeq: WALK_SEQ,
        attackSeq: CLAW_SEQ,
        deathSeq: DEATH_SEQ,
        // The lair's (LairDef.hp)
        hp: KRIL_HITPOINTS,
        damage: 0,
        speed: 2,
        // Five tiles across in OSRS: at 0.7, three and a half
        scale: 0.7,
        radius: RADIUS,
        xp: 0,
        knockbackResist: 1,
        solid: true,
        sounds: { attack: ATTACK_SOUND, hit: 536, death: 535 },
        boss: {
            attackInterval: 1.5,
            keepDistance: 1.4,
            enrage: { message: "" },
            attacks: [
                POISON_CLAWS,
                FLAMES_OF_ZAMORAK,
                BLOODRUSH,
                SMASH,
                DESECRATION,
                BURNING_CLAWS,
                BURNING_RUSH,
            ],
            critical: { attack: "Desecration", from: 0.9, every: [24, 20, 16], ready: 0 },
            summonsAt: [
                {
                    hp: 0.7,
                    enemyId: "tstanon_karlak",
                    count: 1,
                    shout: "Attack them, you dogs!",
                },
                {
                    hp: 0.45,
                    enemyId: "zakln_gritch",
                    count: 1,
                    shout: "Rend them limb from limb!",
                },
                { hp: 0.2, enemyId: "balfrug_kreeyath", count: 1, shout: "No retreat!" },
            ],
            pact: { enemyIds: KRIL_BODYGUARDS, taken: 0.5 },
            look: {
                title: "#ff5a3a",
                subtitle: "#ffb0a0",
                edge: null,
                vignette: null,
                lean: true,
                dark: [24, 2, 2],
            },
            intro: {
                seconds: 3.5,
                riseAt: 0.2,
                seq: CAST_SEQ,
                title: "K'ril Tsutsaroth",
                subtitle: "The church of Saradomin",
                distance: BATTLE_FOR_VARROCK.kril.at.y - BATTLE_FOR_VARROCK.kril.start.y,
                alone: true,
                // Before the altar (LairDef.at), the player down the aisle from him
                atMiddle: true,
                holds: true,
                faces: true,
            },
            guard: {
                damage: 1.6,
                stun: 2.5,
                stunSpotAnim: STARS,
                stunHeight: 3.5,
            },
            phases: {
                phases: [
                    { until: 0.66, status: "Zamorak's general" },
                    {
                        until: 0.33,
                        status: "Bloodlust",
                        message: "K'ril Tsutsaroth's bloodlust grows!",
                        tempo: 0.9,
                    },
                    {
                        status: "No retreat",
                        message: "K'ril Tsutsaroth fights on, burning!",
                        tempo: 0.8,
                    },
                ],
                confine: false,
                barPerPhase: true,
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
];
