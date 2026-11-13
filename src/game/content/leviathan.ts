import { SCAR_BOSS_ARENA, SCAR_POOL, scarWorld } from "../scaperune/maps/scar";
import { WARM_LIGHT } from "./lights";
import { ABYSSAL_LEECH_ID, PATHFINDER_ID } from "./scar";
import type {
    ArenaFeatures,
    BossAttackDef,
    EnemyDef,
    FightAbilityDef,
    ImpactDef,
    LightingDef,
} from "./types";

// The Awakened Leviathan, Act II's fourth Awakened fight (MapDef.fight, maps.ts), fought on its own
// in its pool in the Scar, as the Lantern-bearer. Zachariah's way of a fight: an attack about every
// 1.2 s, quicker by phase, its guard down when its torrent finds no one, and a button that rewards
// stepping in. The Scar's dark is the thread through it, turned on the player: from the second
// phase its glow's out and your weapon only aims at what your light reaches, so the dark pulls you
// in to its tail; its torrent can only be hidden from behind debris, and the piece that hid you is
// smashed; and in its last phase the Abyssal pathfinder's circle is the only light. Shadow, the
// button, stuns it from close by, its back bared.
// The design and its numbers: docs/design/awakened-leviathan.md.

// Its animations (npc 12214, as the Scar's Leviathan has them)
const IDLE_SEQ = 10276;
const RANGED_SEQ = 10278;
const MAGIC_SEQ = 10279;
const MELEE_SEQ = 10280;
const ROAR_SEQ = 10282;
const TAIL_SEQ = 10283;

// Its orbs, by style (beside its model in the cache), and their splash; dust thrown up, rocks
// coming down; Shadow Barrage's burst, and stunned stars (80)
const ORB_RANGED = 2487;
const ORB_MAGIC = 2488;
const ORB_MELEE = 2489;
const ORB_SPLASH = 2490;
const DUST = 2699;
const ROCKS = 2584;
const SHADOW_BARRAGE = 383;
// Akkha's lightning, for the abyss's
const LIGHTNING_SPOT = 2256;
const STARS = 80;
// None of its animations name a sound of their own here: the Duke's stand in, as on the Scar
const SOUNDS = { attack: 4000, hit: 513, death: 512 };
const FLASH = "#9fe8dc";

export const AWAKENED_LEVIATHAN_ID = "awakened_leviathan";

// What the fight's tuned to (maps.ts): its hitpoints, Fire spells' level (their top), and tiles
// south of its pool's middle the player starts
export const LEVIATHAN_HITPOINTS = 11000;
export const LEVIATHAN_FIRE_LEVEL = 8;
export const LEVIATHAN_START_DISTANCE = 10;

// In world tiles: its pool's middle, and the Scar's square round it the party's held in
export const LEVIATHAN_SPOT_WORLD = scarWorld(SCAR_POOL);
const SQUARE_WORLD = scarWorld(SCAR_BOSS_ARENA);
export const LEVIATHAN_BOSS_ARENA = {
    baseX: SQUARE_WORLD.x - 0.5,
    baseY: SQUARE_WORLD.y - 0.5,
    size: SCAR_BOSS_ARENA.size,
};

// The wreck round its pool, the Scar's own broken boats and pillars, standing from the start: its
// orbs break on them, and they hide you from its torrent, but they're out where your light doesn't
// reach it in the dark. Tiles from its pool's middle, all on the Scar's open floor.
const BROKEN_BOATS = [49244, 49245, 49246];
const BROKEN_PILLARS = [49239, 49240];
const WRECK: { dx: number; dy: number; locId: number; rotation: number }[] = [
    { dx: -10, dy: -5, locId: BROKEN_BOATS[0], rotation: 1 },
    { dx: 9, dy: -6, locId: BROKEN_PILLARS[0], rotation: 0 },
    { dx: -8, dy: 5, locId: BROKEN_PILLARS[1], rotation: 2 },
    { dx: 10, dy: 5, locId: BROKEN_BOATS[1], rotation: 3 },
    { dx: -4, dy: -11, locId: BROKEN_PILLARS[1], rotation: 1 },
    { dx: 6, dy: 10, locId: BROKEN_BOATS[2], rotation: 0 },
];

// Two of the Scar's fires burning in the wreck, far out: lights of 3 (LEVIATHAN_LIGHTING), so the
// arena's edge is seen
const SCAR_FIRE = 49342;
const FIRES: { dx: number; dy: number }[] = [
    { dx: -12, dy: -7 },
    { dx: 11, dy: 7 },
];
const FIRE_LIGHT = { radius: 3, color: 0xff9a4a, flicker: 0.15 };

export const LEVIATHAN_FEATURES: ArenaFeatures = {
    rise: LEVIATHAN_SPOT_WORLD,
    wreckage: [
        ...WRECK.map(({ dx, dy, locId, rotation }) => ({
            x: LEVIATHAN_SPOT_WORLD.x + dx,
            y: LEVIATHAN_SPOT_WORLD.y + dy,
            locId,
            rotation,
        })),
        ...FIRES.map(({ dx, dy }) => ({
            x: LEVIATHAN_SPOT_WORLD.x + dx,
            y: LEVIATHAN_SPOT_WORLD.y + dy,
            locId: SCAR_FIRE,
            glows: true,
        })),
    ],
};

// The dark: the Scar's, darker, and a small light round each player (the Lantern-bearer's is twice
// it), and the fires in the wreck. Weapons only aim at what's lit; its own glow lights it in its
// first phase.
export const LEVIATHAN_PLAYER_LIGHT = 2.5;
export const LEVIATHAN_LIGHTING: LightingDef = {
    ambient: 0.2,
    ambientColor: 0xc0ccff,
    player: { radius: LEVIATHAN_PLAYER_LIGHT, color: WARM_LIGHT, intensity: 0.95 },
    lights: FIRES.map(({ dx, dy }) => ({
        x: LEVIATHAN_SPOT_WORLD.x + dx,
        y: LEVIATHAN_SPOT_WORLD.y + dy,
        ...FIRE_LIGHT,
    })),
    litTargetsOnly: true,
};

// Shadow, the fight's button: a shadow spell that stuns it, its back bared for big hits. Only from
// close by, inside its tail's sweep.
export const LEVIATHAN_SHADOW: FightAbilityDef = {
    id: "shadow",
    name: "Shadow",
    damage: 40,
    reach: 6.5,
    cooldown: 15,
    stun: 3,
    // Shadow Barrage's rune
    iconObjId: 25492,
    // (Shadow Barrage's shards fly out about six times as far as its first frame: fitted small)
    impact: { spots: [{ spotAnim: SHADOW_BARRAGE, fit: 0.6 }], shake: 0.3, flash: "#2a1840" },
    // An Ancient cast, and Shadow Barrage's sound
    playerSeq: 1979,
    sound: 168,
};

// Its volleys, each a style's orbs, and after each the roof comes down round you. Ranged: three
// along lines fanned at where you stood as it began (a wave's, drawn on the floor: there to be
// stepped off). Magic: two slow ones that turn after you, broken on debris. Melee: one heavy one,
// quick, straight at you.
const RANGED: BossAttackDef = {
    name: "Ranged orbs",
    kind: "projectile",
    damage: 3,
    windup: 0.85,
    cooldown: 0,
    range: 30,
    radius: 0.8,
    speed: 11,
    count: 4,
    spread: 0.3,
    wave: { reach: 22 },
    weight: 4,
    seq: RANGED_SEQ,
    sound: 4000,
    spotAnim: ORB_RANGED,
    impactSpotAnim: ORB_SPLASH,
    follow: { attack: "Debris", delay: 0.8 },
};

const MAGIC: BossAttackDef = {
    name: "Magic orbs",
    kind: "projectile",
    damage: 4,
    windup: 0.85,
    cooldown: 2,
    range: 30,
    radius: 0.8,
    speed: 6,
    count: 2,
    spread: 0.6,
    homing: 0.065,
    weight: 3,
    seq: MAGIC_SEQ,
    sound: 4000,
    spotAnim: ORB_MAGIC,
    impactSpotAnim: ORB_SPLASH,
    follow: { attack: "Debris", delay: 0.8 },
};

const MELEE: BossAttackDef = {
    name: "Melee orbs",
    kind: "projectile",
    damage: 10,
    windup: 0.85,
    cooldown: 3,
    range: 30,
    radius: 1,
    speed: 13,
    count: 1,
    weight: 3,
    seq: MELEE_SEQ,
    sound: 4000,
    spotAnim: ORB_MELEE,
    impactSpotAnim: ORB_SPLASH,
    follow: { attack: "Debris", delay: 0.8 },
};

// After each volley (follow): a roar, and four pieces of the roof round you. Each stays as cover
// its orbs break on, and that hides you from its torrent (BossAttackDef.debris)
const DEBRIS: BossAttackDef = {
    name: "Debris",
    kind: "ground",
    damage: 5,
    windup: 1.15,
    cooldown: 999,
    range: 99,
    weight: 0,
    seq: ROAR_SEQ,
    sound: 4000,
    ground: {
        spots: [{ shape: "scatter", count: 4, spread: 5, awayFrom: 5 }],
        radius: 1,
        shadow: true,
        locId: ROCKS,
        alpha: 0.35,
    },
    debris: { locId: 49343, seconds: 14, most: 10 },
    impact: { shake: 0.2 },
    message: "Debris falls: it stops its orbs, and hides you from its torrent.",
};

// In the dark, the roof keeps coming down round you on its own (BossPhasesDef ambients), each
// piece more cover, and more to step out from under
const FALLING: BossAttackDef = {
    ...DEBRIS,
    name: "Falling debris",
    ground: { ...DEBRIS.ground!, spots: [{ shape: "scatter", count: 2, spread: 4, awayFrom: 5 }] },
    message: undefined,
};

// In the pathfinder's circle, the abyss's lightning, on where you stand: keep moving with the
// circle (BossPhasesDef ambients)
const LIGHTNING: BossAttackDef = {
    name: "Lightning",
    kind: "ground",
    damage: 6,
    windup: 0.85,
    cooldown: 999,
    range: 99,
    weight: 0,
    sound: 4000,
    ground: {
        spots: [{ shape: "player" }],
        radius: 1.2,
        shadow: true,
        alpha: 0.5,
        light: { radius: 1.6, color: 0xbfe0ff, intensity: 0.8 },
    },
    impactSpotAnim: LIGHTNING_SPOT,
    impact: { shake: 0.15 },
};

// Too close to its pool: a sweep of its tail
const TAIL: BossAttackDef = {
    name: "Tail",
    kind: "swing",
    damage: 8,
    windup: 0.85,
    cooldown: 0,
    range: 7,
    radius: 7,
    weight: 5,
    seq: TAIL_SEQ,
    sound: 4000,
    impact: { spots: [{ spotAnim: DUST, fit: 3 }], shake: 0.4 },
};

// Its torrent: everything it can see. Only debris (and the wreck) hides you, and finding no one its
// guard's down; the debris that hid someone is smashed
const TORRENT: BossAttackDef = {
    name: "Torrent",
    kind: "swing",
    damage: 13,
    windup: 2.2,
    cooldown: 9,
    range: 999,
    radius: 40,
    weight: 12,
    phases: [2],
    seq: ROAR_SEQ,
    sound: 4000,
    cover: true,
    // A pale teal wash over the dark, for the shadows to show against
    coverWash: { rgb: "150, 225, 215", alpha: 0.32 },
    opens: 3,
    smashes: { impact: { spots: [{ spotAnim: DUST, fit: 2 }], shake: 0.15 } },
    message: "Its torrent! Hide behind the debris.",
    impact: { spots: [{ spotAnim: DUST, fit: 4 }], shake: 0.5, flash: FLASH },
};

// In the dark, leeches come for your light
const LEECHES: BossAttackDef = {
    name: "Leeches",
    kind: "summon",
    damage: 0,
    windup: 1,
    cooldown: 14,
    range: 30,
    weight: 3,
    phases: [2],
    seq: ROAR_SEQ,
    sound: 4000,
    summon: { enemyId: ABYSSAL_LEECH_ID, count: 3, beside: true, distance: 4 },
    message: "Leeches crawl out of the dark for your light...",
};

const ATTACKS: BossAttackDef[] = [
    RANGED,
    MAGIC,
    MELEE,
    DEBRIS,
    FALLING,
    LIGHTNING,
    TAIL,
    TORRENT,
    // In the pathfinder's circle, quicker and oftener
    { ...TORRENT, name: "Deep torrent", windup: 1.85, cooldown: 7.5, phases: [3] },
    LEECHES,
];

// Dust thrown up round it as it rises
const RISING: ImpactDef = { spots: [{ spotAnim: DUST, fit: 4 }], shake: 0.5 };

export const LEVIATHAN_ENEMIES: EnemyDef[] = [
    {
        id: AWAKENED_LEVIATHAN_ID,
        name: "The Awakened Leviathan",
        npcId: 12214,
        idleSeq: IDLE_SEQ,
        walkSeq: IDLE_SEQ,
        attackSeq: RANGED_SEQ,
        deathSeq: -1,
        hp: LEVIATHAN_HITPOINTS,
        damage: 0,
        speed: 0,
        radius: 2.6,
        xp: 0,
        knockbackResist: 1,
        stationary: true,
        solid: true,
        sounds: SOUNDS,
        // Seven tiles across in OSRS: drawn smaller, to be whole on the screen
        scale: 0.7,
        // The abyss's glow, while it has it: from the second phase it's out, and only your light
        // finds it
        light: {
            radius: 5,
            color: 0x7fe0d0,
            intensity: 0.6,
            pulse: { amount: 0.2, seconds: 3 },
            phases: [1],
        },
        spawnMessage: "The Leviathan rises from its pool, awakened!",
        boss: {
            attackInterval: 1.2,
            enrage: { message: "" },
            attacks: ATTACKS,
            fallSeconds: 2.4,
            summonsAt: [
                {
                    hp: 0.3,
                    enemyId: PATHFINDER_ID,
                    count: 1,
                    distance: 7,
                    message: "The dark swallows everything... follow the pathfinder's light!",
                },
            ],
            look: {
                title: "#7fe0d0",
                subtitle: "#c8e8e4",
                edge: null,
                vignette: null,
                // Over half-way to it, so it's whole below the bar from where it's fought (on a
                // phone too: the player's then just above the HUD from 9 tiles out)
                lean: { share: 0.6, max: 5.5, phone: 5.5 },
                // Its glow out, it's still faintly seen (only drawn)
                darkGlow: { radius: 4, color: 0x5fb8a8, intensity: 0.3 },
                // Its back, bared: lit while its guard's down
                exposedLight: {
                    radius: 3,
                    color: 0xc8a8ff,
                    intensity: 0.8,
                    pulse: { amount: 0.3, seconds: 1 },
                },
            },
            intro: {
                seconds: 4.5,
                riseAt: 1.2,
                title: "The Awakened Leviathan",
                subtitle: "The Scar",
                distance: LEVIATHAN_START_DISTANCE,
                alone: true,
                atMiddle: true,
                holds: true,
                faces: true,
                pan: { from: 2.4, over: 1.4 },
                land: RISING,
                landAt: 0.2,
            },
            guard: {
                damage: 2,
                stun: 3,
                stunSpotAnim: STARS,
                stunHeight: 4,
                exposeSound: 1971,
                stunSound: 1141,
                // Shadow can't chain it: within 4 s of a stun's end only its guard drops
                stunGrace: 4,
            },
            phases: {
                phases: [
                    { until: 0.65, status: "The deep" },
                    {
                        until: 0.3,
                        status: "The dark",
                        message: "Its glow goes out... bring your light to it!",
                        opener: "Torrent",
                        tempo: 0.9,
                        light: 0.12,
                        ambients: [{ attack: "Falling debris", interval: 4, delay: 3 }],
                    },
                    {
                        status: "The pathfinder",
                        message: "Only the pathfinder's light is left!",
                        opener: "Ranged orbs",
                        tempo: 0.8,
                        light: 0.1,
                        ambients: [
                            { attack: "Falling debris", interval: 4, delay: 2 },
                            { attack: "Lightning", interval: 1.7, delay: 1 },
                        ],
                    },
                ],
                threshold: {
                    seconds: 2,
                    sound: 4000,
                    seq: ROAR_SEQ,
                    impact: {
                        spots: [
                            { spotAnim: DUST, fit: 4 },
                            { spotAnim: ORB_SPLASH, fit: 3 },
                        ],
                        shake: 0.5,
                        flash: FLASH,
                    },
                    riseImpact: {
                        spots: [{ spotAnim: DUST, fit: 4.5 }],
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
