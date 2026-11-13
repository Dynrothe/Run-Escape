import {
    DUKE_BRAZIERS,
    DUKE_MIDDLE,
    DUKE_ROOM,
    DUKE_STATUES,
    DUKE_VENTS,
    dukesRoomWorld,
} from "../scaperune/maps/dukesRoom";
import { GHORROCK_COLD } from "./ghorrock";
import type {
    ArenaFeatures,
    BossAttackDef,
    ColdRuleDef,
    EnemyDef,
    FightAbilityDef,
    ImpactDef,
} from "./types";

// The Awakened Duke Sucellus, Act II's third Awakened fight (MapDef.fight, maps.ts), fought on his
// own in his room in Ghorrock Prison, as the Snow ranger. Zachariah's way of a fight: an attack
// about every 1.3 s, quicker by phase, his guard down when his gaze finds no one, and a button
// that rewards stepping in. Ghorrock's cold is the thread through it, compressed into his room: it
// rises all the time and only the braziers hold it off, his gaze puts out every brazier it can see,
// and his gas finds the vent by you. Kindle, the button, lights the brazier you're beside, and lit
// by his alcove it flares into him.
// The design and its numbers: docs/design/awakened-duke.md.

// His animations (npc 12191, as Ghorrock's Duke has them: picked by length, as they're skeletal)
const IDLE_SEQ = 10175;
const SLAM_SEQ = 10176;
const ICICLES_SEQ = 10177;
const SPIT_SEQ = 10178;
const GAS_SEQ = 10179;
const GAZE_SEQ = 10180;

// His own spot animations (beside his model in the cache): the ice falling, his gas. The King
// Black Dragon's ice breath for what he spits; snow thrown up; Ice Barrage's shards; a fire's burst
const ICICLES = 2434;
const DUKE_GAS = 2431;
const ICE_BREATH = 396;
const SNOW_DUST = 2699;
const SHARDS = 369;
const FLARE = 157;
const STARS = 80;
// None of his animations name a sound of their own here: an ice giant's roar stands in
const SOUNDS = { attack: 4000, hit: 513, death: 512 };
const FLASH = "#cfe4ff";

export const AWAKENED_DUKE_ID = "awakened_duke";

// What the fight's tuned to (maps.ts): his hitpoints, the shortbow's level (its top), and tiles
// south of him the player starts
export const DUKE_HITPOINTS = 13000;
export const DUKE_BOW_LEVEL = 8;
export const DUKE_START_DISTANCE = 11;

// In world tiles
const world = (tile: { x: number; y: number }) => dukesRoomWorld(tile);
export const DUKE_SPOT_WORLD = world(DUKE_MIDDLE);
const ROOM_WORLD = world(DUKE_ROOM);
export const DUKE_BOSS_ARENA = { baseX: ROOM_WORLD.x, baseY: ROOM_WORLD.y, size: DUKE_ROOM.size };

// His gaze can't see through the prison's statues (and nor can it the braziers behind them)
export const DUKE_FEATURES: ArenaFeatures = {
    rise: DUKE_SPOT_WORLD,
    pillars: DUKE_STATUES.map((tile) => ({ ...world(tile), size: 2 })),
};

// Kindle, the fight's button: lights the brazier you're beside at once, and lit near enough him
// it flares into him
export const DUKE_KINDLE: FightAbilityDef = {
    id: "kindle",
    name: "Kindle",
    damage: 150,
    reach: 2.5,
    cooldown: 6,
    kindle: { reach: 2.5, flare: 11 },
    // A tinderbox
    iconObjId: 590,
    impact: { spots: [{ spotAnim: FLARE, fit: 1.5 }], shake: 0.25 },
    // Lighting a fire, and its sound
    playerSeq: 733,
    sound: 2597,
};

// Three ice breaths fanned along where you stood as he began (five, awakened)
// Round him, his arms: only when you're near
const SLAM: BossAttackDef = {
    name: "Slam",
    kind: "swing",
    damage: 8,
    windup: 0.9,
    cooldown: 0,
    range: 7.5,
    radius: 6,
    weight: 5,
    seq: SLAM_SEQ,
    sound: 4000,
    impact: { spots: [{ spotAnim: SNOW_DUST, fit: 3 }], shake: 0.4 },
};

// A ring of five round where you stood, and one on it
const ICICLES_ATTACK: BossAttackDef = {
    name: "Icicles",
    kind: "ground",
    damage: 5,
    windup: 1.15,
    cooldown: 4,
    range: 30,
    weight: 4,
    seq: ICICLES_SEQ,
    sound: 4000,
    ground: {
        spots: [{ shape: "ring", count: 5, distance: 2.5 }, { shape: "player" }],
        radius: 1.1,
        spotAnim: ICICLES,
        alpha: 0.35,
    },
    impact: { shake: 0.2 },
    message: "Icicles crack overhead...",
};

const SPIT: BossAttackDef = {
    name: "Spit",
    kind: "projectile",
    damage: 3,
    windup: 0.8,
    cooldown: 3,
    range: 30,
    radius: 0.8,
    speed: 10,
    count: 3,
    spread: 0.3,
    // Along lines aimed as he begins (a wave's), drawn on the floor: there to be stepped off
    wave: { reach: 20 },
    weight: 4,
    phases: [1, 2],
    seq: SPIT_SEQ,
    sound: 4000,
    spotAnim: ICE_BREATH,
    impactSpotAnim: ICICLES,
};

// Spat at you, and the vent nearest where it lands puffs
const GAS: BossAttackDef = {
    name: "Gas",
    kind: "blast",
    damage: 6,
    windup: 1.05,
    cooldown: 5,
    range: 30,
    radius: 1.6,
    weight: 3,
    seq: GAS_SEQ,
    sound: 4000,
    impactSpotAnim: DUKE_GAS,
    rule: { vent: true },
};

// His freezing gaze: the whole room he can see. Behind a statue it finds no one, and his guard's
// down; every lit brazier it sees goes out
const GAZE: BossAttackDef = {
    name: "Freezing gaze",
    kind: "swing",
    damage: 13,
    windup: 2.2,
    cooldown: 9,
    range: 999,
    radius: 40,
    weight: 12,
    phases: [2],
    seq: GAZE_SEQ,
    sound: 4000,
    impactSpotAnim: SHARDS,
    cover: true,
    opens: 3,
    effect: { kind: "freeze", seconds: 2 },
    rule: { snuff: true, chills: 25 },
    message: "Hide from his freezing gaze!",
    impact: { spots: [{ spotAnim: SNOW_DUST, fit: 4 }], shake: 0.5, flash: FLASH },
};

const ATTACKS: BossAttackDef[] = [
    SLAM,
    ICICLES_ATTACK,
    // Awakened, the ring twice, the second aimed afresh
    {
        ...ICICLES_ATTACK,
        name: "Icicles twice",
        weight: 2,
        phases: [3],
        chain: { times: 1, windup: 0.85 },
    },
    SPIT,
    { ...SPIT, name: "Awakened spit", count: 5, spread: 0.26, phases: [3] },
    GAS,
    GAZE,
    // Awakened, more often
    { ...GAZE, name: "Awakened gaze", cooldown: 7, phases: [3] },
];

// Snow thrown up round him (his gas over him would hide him as he wakes)
const WAKING: ImpactDef = { spots: [{ spotAnim: SNOW_DUST, fit: 4 }], shake: 0.5 };

export const DUKE_ENEMIES: EnemyDef[] = [
    {
        id: AWAKENED_DUKE_ID,
        name: "Awakened Duke Sucellus",
        npcId: 12191,
        idleSeq: IDLE_SEQ,
        walkSeq: IDLE_SEQ,
        attackSeq: SLAM_SEQ,
        deathSeq: -1,
        hp: DUKE_HITPOINTS,
        damage: 0,
        speed: 0,
        radius: 3,
        xp: 0,
        knockbackResist: 1,
        stationary: true,
        solid: true,
        sounds: SOUNDS,
        // Seven tiles across, his arms out across his alcove
        scale: 0.65,
        spawnMessage: "Duke Sucellus wakes, awakened!",
        boss: {
            attackInterval: 1.3,
            enrage: { message: "" },
            attacks: ATTACKS,
            fallSeconds: 2.4,
            look: {
                title: "#a8d4ff",
                subtitle: "#d6e4f0",
                edge: null,
                vignette: null,
                // Half-way to him, so he's on the screen from most of his room (less on a phone,
                // or you'd be under the HUD)
                lean: { share: 0.5, max: 4.5, phone: 2.5 },
            },
            intro: {
                seconds: 4.5,
                riseAt: 1.2,
                title: "Awakened Duke Sucellus",
                subtitle: "Ghorrock Prison",
                distance: DUKE_START_DISTANCE,
                alone: true,
                atMiddle: true,
                holds: true,
                faces: true,
                pan: { from: 2.4, over: 1.4 },
                land: WAKING,
                landAt: 0.2,
            },
            guard: {
                damage: 2,
                stun: 3.5,
                stunSpotAnim: STARS,
                stunHeight: 4,
                exposeSound: 1971,
                stunSound: 1141,
            },
            phases: {
                phases: [
                    { until: 0.6, status: "The prisoner" },
                    {
                        until: 0.25,
                        status: "Freezing gaze",
                        message: "His eyes open... hide from his gaze!",
                        opener: "Freezing gaze",
                        tempo: 0.9,
                    },
                    {
                        status: "Awakened",
                        message: "Awakened!",
                        opener: "Awakened gaze",
                        tempo: 0.8,
                    },
                ],
                threshold: {
                    seconds: 2,
                    shout: "Freeze!",
                    sound: 4000,
                    impact: {
                        spots: [
                            { spotAnim: SNOW_DUST, fit: 4 },
                            { spotAnim: DUKE_GAS, fit: 3 },
                        ],
                        shake: 0.5,
                        flash: FLASH,
                    },
                    riseImpact: {
                        spots: [{ spotAnim: SNOW_DUST, fit: 4.5 }],
                        shake: 0.5,
                        flash: FLASH,
                    },
                },
                barPerPhase: true,
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
];

// His room's cold: Ghorrock's, compressed. It rises faster, the braziers burn shorter and are slow
// to relight by standing (Kindle's quick), they stay lit as he wakes (he's up from the start), and
// the vents are the room's nine. No ice, no fire elites.
export const DUKE_COLD: ColdRuleDef = {
    ...GHORROCK_COLD,
    cold: { ...GHORROCK_COLD.cold, rise: 3, fast: 6 },
    braziers: {
        at: DUKE_BRAZIERS.map(world),
        size: 2,
        reach: 3,
        warm: 15,
        burn: 24,
        gutter: 8,
        relight: { reach: 2.5, seconds: 3, kill: 6 },
        stayLit: true,
    },
    vents: {
        ...GHORROCK_COLD.vents,
        at: DUKE_VENTS.map(world),
        every: 6,
    },
    ice: { pools: [], grip: GHORROCK_COLD.ice.grip },
    // His room's grey stone isn't the yard's snow: no wash over it
    look: { ...GHORROCK_COLD.look, wash: undefined, puffOne: 1.7 },
};
