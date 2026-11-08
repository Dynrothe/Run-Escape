import { BATTLE_FOR_VARROCK, FLAMES } from "../scaperune/maps/battleForVarrock";
import { BossAttackDef, EnemyDef, ImpactDef, PlayerEffectDef } from "./types";

// Xarth, the tormented demon who mastered his flames, the first of Yama's two generals in the
// Battle for Varrock (MapDef.lairs): asleep in the middle of the Grand Exchange's pad, where its
// counter stood, until a player steps onto it. The whole pad's his, its walls gone, ringed with
// fire once he wakes. He stands where he is and burns: his bolts leave you burning, a stack a
// bolt, and every so often he gathers his flames and they burst over the whole pad, sparing only
// what's behind one of the eight pillars round him, which crumbles for it. Halfway down, the
// pillars that are left come down and the Exchange burns: fire takes the floor and spreads (Shock
// wave puts it out along its way), and the dead get up out by the pad's rim and walk in to him,
// healing him as they reach him; let a few through and the Pyre's the worse for it. His fight's
// design and its numbers: docs/design/varrock-generals.md.

// His own animations, npc 16684's (classify-npc-seqs.ts): standing and walking, a hand thrown
// forward (the bolts), the long gathering of his flames (3 s), both hands to the ground (the
// floor and the dead), a swipe, and his death
const IDLE_SEQ = 14979;
const WALK_SEQ = 14980;
const CAST_SEQ = 14991;
const GATHER_SEQ = 14989;
const RAISE_SEQ = 14992;
const SWIPE_SEQ = 15018;
const SWIPE_AT = 0.9;
const DEATH_SEQ = 14995;
// Getting up, for his intro (4.8 s)
const WAKE_SEQ = 15017;

// His spot animations, next to his animations in the cache: the flame in his hand, a bolt in
// flight and bursting, an arrow and its hit, and the burst of his gathered flames
const HAND_FLAME = 4373;
const BOLT = 4374;
const BOLT_BURST = 4375;
const ARROW = 4376;
const ARROW_HIT = 4377;
const FLAMES_BURST = 4381;
// Flames of Zamorak (K'ril's, his once K'ril's fallen), and the stars of a stunned head
const ZAMORAK_FLAMES = 78;
const STARS = 80;
// Grey dust blown along the ground, and the Corporeal Beast's stomp ring
const BLOWN_DUST = 2184;
const STOMP_RING = 318;

// The fire on the floor: the map's flames, which block nothing (FLAMES)
const FLOOR_FIRE = FLAMES;
// His dead: the Fractured Archive's corpse, npc 16687, getting up out of the floor as it comes
const CORPSE_NPC = 16687;
const CORPSE_IDLE = 14999;
const CORPSE_WALK = 15000;
const CORPSE_DEATH = 15003;

// What his fight's tuned to: his hitpoints (the lair's), and the hero's 38 hitpoints that his
// damage is out of
export const XARTH_HITPOINTS = 3800;
const RADIUS = 1.4;
const LASH_REACH = 3;

// A burn: a stack a hit, up to three, each a hitpoint a second through armour, for three seconds
// from the last
const BURN: PlayerEffectDef = {
    kind: "debuff",
    id: "xarth_burn",
    name: "Burning",
    // Fire rune
    iconObjId: 554,
    stats: {},
    seconds: 3,
    stacks: 3,
    burn: 1,
};

const FLARED: ImpactDef = {
    spots: [
        { spotAnim: FLAMES_BURST, fit: 8 },
        { spotAnim: STOMP_RING, fit: 10 },
    ],
    shake: 0.5,
};

// A bolt at you, burning: keep moving
const SEARING_BOLT: BossAttackDef = {
    name: "Searing bolt",
    kind: "projectile",
    damage: 3,
    windup: 0.8,
    cooldown: 1.2,
    range: 24,
    weight: 5,
    speed: 9,
    radius: 0.5,
    seq: CAST_SEQ,
    castSpotAnim: HAND_FLAME,
    spotAnim: BOLT,
    impactSpotAnim: BOLT_BURST,
    effect: BURN,
};

// Up close, a sweep of fire in front of him; missed, his guard's down
const FLAME_LASH: BossAttackDef = {
    name: "Flame lash",
    kind: "swing",
    damage: 9,
    windup: 1,
    cooldown: 3,
    range: LASH_REACH + RADIUS,
    weight: 6,
    seq: SWIPE_SEQ,
    strikeAt: SWIPE_AT,
    radius: LASH_REACH + RADIUS,
    cone: (Math.PI * 2) / 3,
    underRadius: RADIUS,
    opens: 2.5,
    effect: BURN,
    impact: { spots: [{ spotAnim: BLOWN_DUST, fit: 2.5 }], shake: 0.3 },
};

// He gathers his flames and they burst over the whole pad: only what's behind a pillar's spared,
// and the pillar crumbles for it
const CONFLAGRATION: BossAttackDef = {
    name: "Conflagration",
    kind: "swing",
    damage: 16,
    windup: 3,
    cooldown: 12,
    range: 999,
    weight: 4,
    phases: [1],
    seq: GATHER_SEQ,
    radius: 999,
    cover: true,
    crumbles: true,
    ignoreArmor: true,
    effect: BURN,
    message: "Xarth gathers his flames! Get behind a pillar!",
    shout: "Burn!",
    impact: FLARED,
};

// Fires take the floor and spread from there; Shock wave puts them out along its way
const FLOOR_ABLAZE: BossAttackDef = {
    name: "The Exchange burns",
    kind: "blast",
    damage: 4,
    windup: 1.2,
    cooldown: 6,
    range: 999,
    weight: 4,
    phases: [2],
    seq: RAISE_SEQ,
    radius: 1.2,
    count: 3,
    spread: 6,
    impactSpotAnim: BOLT_BURST,
    pool: {
        seconds: 40,
        radius: 1.2,
        damage: 2,
        interval: 1,
        effect: BURN,
        locId: FLOOR_FIRE,
        spreads: { every: 5, most: 12 },
        dousedBy: "shock_wave",
    },
};

// The dead get up all round him, out by the pad's rim, and walk in to him, each that gets there
// healing him; when the last's dead or there, what got there goes up as the Pyre, over the whole
// pad. Six from fourteen tiles out: on the old inner ring it was four from nine, so they're
// longer on their way and there's more of them, a run round the pad to cut them all down, and
// all six through is no worse than four was.
const REANIMATE: BossAttackDef = {
    name: "Reanimate",
    kind: "summon",
    damage: 0,
    windup: 1.5,
    cooldown: 18,
    range: 999,
    weight: 3,
    phases: [2],
    seq: RAISE_SEQ,
    ignoreArmor: true,
    effect: BURN,
    message: "Xarth raises the dead! Don't let them reach him!",
    shout: "Rise, and feed the fire.",
    summon: {
        enemyId: "xarth_corpse",
        count: 6,
        walkTo: { distance: 14, perAbsorbed: 6, heals: 0.04 },
    },
    // As one gets to him
    impact: { spots: [{ spotAnim: BOLT_BURST, fit: 3 }] },
};

// A fan of arrows at you: step across them
const HELLFIRE_ARROWS: BossAttackDef = {
    name: "Hellfire arrows",
    kind: "projectile",
    damage: 5,
    windup: 1,
    cooldown: 3,
    range: 24,
    weight: 4,
    phases: [2],
    speed: 11,
    count: 5,
    spread: 0.35,
    radius: 0.45,
    seq: CAST_SEQ,
    spotAnim: ARROW,
    impactSpotAnim: ARROW_HIT,
};

// K'ril's fallen first: Zamorak's flames, his own now, where you stand and round it
const ZAMORAKS_FLAMES: BossAttackDef = {
    name: "Flames of Zamorak",
    kind: "blast",
    damage: 6,
    windup: 1.1,
    cooldown: 5,
    range: 999,
    weight: 3,
    empowered: true,
    seq: CAST_SEQ,
    radius: 1.6,
    count: 3,
    spread: 2.5,
    impactSpotAnim: ZAMORAK_FLAMES,
    effect: BURN,
};

export const XARTH_ENEMIES: EnemyDef[] = [
    {
        id: "xarth",
        name: "Xarth",
        npcId: 16684,
        idleSeq: IDLE_SEQ,
        walkSeq: WALK_SEQ,
        attackSeq: SWIPE_SEQ,
        deathSeq: DEATH_SEQ,
        // The lair's (LairDef.hp)
        hp: XARTH_HITPOINTS,
        damage: 0,
        // He stands where he is
        speed: 0,
        stationary: true,
        radius: RADIUS,
        xp: 0,
        knockbackResist: 1,
        solid: true,
        sounds: { attack: -1, hit: -1, death: -1 },
        boss: {
            attackInterval: 1.3,
            keepDistance: 0,
            enrage: { message: "" },
            attacks: [
                SEARING_BOLT,
                FLAME_LASH,
                CONFLAGRATION,
                FLOOR_ABLAZE,
                REANIMATE,
                HELLFIRE_ARROWS,
                ZAMORAKS_FLAMES,
            ],
            fallSeconds: 3,
            look: {
                title: "#ff8a3a",
                subtitle: "#ffd0a0",
                edge: null,
                vignette: null,
                lean: true,
                dark: [20, 6, 2],
            },
            intro: {
                seconds: 4,
                riseAt: 0.2,
                seq: WAKE_SEQ,
                title: "Xarth",
                subtitle: "The Grand Exchange",
                distance: BATTLE_FOR_VARROCK.xarth.at.y - BATTLE_FOR_VARROCK.xarth.start.y,
                alone: true,
                // Where he stood (LairDef.at), the player south of him
                atMiddle: true,
                holds: true,
                faces: true,
            },
            guard: {
                damage: 1.5,
                stun: 2,
                stunSpotAnim: STARS,
                stunHeight: 3,
            },
            phases: {
                phases: [
                    { until: 0.5, status: "Mastered flame" },
                    {
                        status: "The Exchange burns",
                        message: "The pillars fall, and the Exchange burns!",
                        tempo: 0.9,
                        opener: "The Exchange burns",
                    },
                ],
                threshold: {
                    seconds: 1.6,
                    seq: GATHER_SEQ,
                    shout: "Let it all burn!",
                    impact: FLARED,
                },
                // The lair's seal keeps everyone in the ring
                confine: false,
                barPerPhase: true,
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
    // The Exchange's dead, walking to him (REANIMATE)
    {
        id: "xarth_corpse",
        name: "Corpse",
        npcId: CORPSE_NPC,
        idleSeq: CORPSE_IDLE,
        walkSeq: CORPSE_WALK,
        attackSeq: -1,
        deathSeq: CORPSE_DEATH,
        hp: 45,
        damage: 0,
        speed: 1,
        radius: 0.45,
        xp: 0,
        knockbackResist: 1,
        sounds: { attack: -1, hit: -1, death: -1 },
    },
];
