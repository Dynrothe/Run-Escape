import { LASSAR_CATHEDRAL } from "../scaperune/maps/lassarUndercity";
import { LASSAR_REALM } from "./lassar";
import { BossAttackDef, EnemyDef, FightAbilityDef, ImpactDef, RealmRuleDef } from "./types";

// The Awakened Whisperer, Act II's second Awakened fight (MapDef.fight, maps.ts), fought on her own
// on her island in the Lassar Undercity, as the Shadow walker. Zachariah's way of a fight: an attack
// about every 1.4 s by phase, her guard down when her screech finds no one, and a button that
// rewards stepping in. Lassar's two worlds are the thread through it: she can only be hurt in the
// city, her Soul Siphon can only be stopped in the realm (her souls go with the party, but can be
// caught only there), and sanity's the clock in there. Blackstone, the button, turns the party
// between the two, and coming out beside her it shocks her.
// The design and its numbers: docs/design/awakened-whisperer.md.

// Her animations (npc 12204, as the Lassar Undercity's Whisperer has them)
const IDLE_SEQ = 10230;
const WALK_SEQ = 10232;
const VOLLEY_SEQ = 10234;
const TENTACLES_SEQ = 10235;
const BURST_SEQ = 10236;

// Her own spot animations (as lassar.ts): a soul's glow, her shots and their bursts, the dark that
// ripples out as the world turns, the tentacles' lash; dust, and stunned stars (80)
const SOUL_FLASH = 2447;
const WHISPER_SHOT = 2451;
const WHISPER_BURST = 2452;
const SHADOW_RIPPLE = 2450;
const TENTACLE_LASH = 2460;
const BLOWN_DUST = 2184;
const STARS = 80;
const SOUNDS = { attack: 7284, hit: 7389, death: 7408 };
const FLASH = "#1c0c30";

export const AWAKENED_WHISPERER_ID = "awakened_whisperer";
export const WHISPERER_SOUL_ID = "whisperer_soul";

// Her island before the cathedral: the square the Lassar Undercity's Whisperer fights in, round her
// spot
const HALF = 10;
const SPOT = { x: Math.floor(LASSAR_CATHEDRAL.x), y: Math.floor(LASSAR_CATHEDRAL.y) };
export const WHISPERER_BOSS_ARENA = { baseX: SPOT.x - HALF, baseY: SPOT.y - HALF, size: 2 * HALF };

// What the fight's tuned to (maps.ts): her hitpoints, Shadow Burst's level (its top), its reach
// there, and tiles south of her the player starts
export const WHISPERER_HITPOINTS = 560;
export const WHISPERER_BURST_LEVEL = 8;
export const WHISPERER_BURST_REACH = 2.9;
export const WHISPERER_START_DISTANCE = 6;

// Blackstone, the fight's button: the fragment turns the party between the city and the realm, and
// coming out into the city beside her its shock hits her (she can't be hurt in the realm)
export const WHISPERER_BLACKSTONE: FightAbilityDef = {
    id: "blackstone",
    name: "Blackstone",
    damage: 30,
    reach: 3,
    openReach: 4,
    cooldown: 3,
    turn: true,
    // The blackstone fragment
    iconObjId: 28356,
    impact: {
        spots: [
            { spotAnim: SHADOW_RIPPLE, fit: 2 },
            { spotAnim: WHISPER_BURST, fit: 2 },
        ],
        shake: 0.25,
    },
    // A cast, as the Lassar Undercity's Shadow Burst's, and the realm's ripple's sound
    playerSeq: 1979,
    sound: 436,
};

// Three shots fanned along where you stood as she began (a wave's lines, there to be stepped
// off: at her side, a fan aimed where you are is too close to dodge); five, drowned
const VOLLEY: BossAttackDef = {
    name: "Volley",
    kind: "projectile",
    damage: 3,
    windup: 0.8,
    cooldown: 0,
    range: 16,
    radius: 0.5,
    speed: 10,
    count: 3,
    spread: 0.3,
    wave: { reach: 12 },
    weight: 5,
    phases: [1, 2],
    seq: VOLLEY_SEQ,
    sound: 7284,
    spotAnim: WHISPER_SHOT,
    impactSpotAnim: WHISPER_BURST,
};

// Her tentacles burst up in a cross round where you stood. Marked by the realm's ripple on each
// spot (the lash itself is dark on her island's near-black floor, and can't be seen coming), and
// the lash as they burst
const TENTACLES: BossAttackDef = {
    name: "Tentacles",
    kind: "ground",
    damage: 4,
    windup: 1.3,
    cooldown: 5,
    range: 20,
    weight: 3,
    seq: TENTACLES_SEQ,
    sound: 7101,
    ground: {
        spots: [{ shape: "cross", reach: 6 }],
        radius: 1,
        spotAnim: SHADOW_RIPPLE,
        alpha: 0.55,
    },
    impactSpotAnim: TENTACLE_LASH,
    impact: { shake: 0.2 },
    message: "Tentacles stir under the ground...",
};

const BURST: BossAttackDef = {
    name: "Shadow burst",
    kind: "blast",
    damage: 5,
    windup: 1.2,
    cooldown: 6,
    range: 14,
    radius: 1.8,
    weight: 3,
    seq: BURST_SEQ,
    sound: 436,
    impactSpotAnim: WHISPER_BURST,
    impact: { spots: [{ spotAnim: WHISPER_BURST, fit: 1.5 }], shake: 0.3 },
};

// Her screech: the whole city, wherever you stand in it. Only the realm's out of it, and finding no
// one her guard's down
const SCREECH: BossAttackDef = {
    name: "Screech",
    kind: "swing",
    damage: 8,
    windup: 2.2,
    cooldown: 11,
    range: 999,
    radius: 40,
    weight: 3,
    phases: [2, 3],
    world: 0,
    opens: 3,
    seq: TENTACLES_SEQ,
    sound: 7408,
    message: "The Whisperer draws breath... Blackstone, into the realm!",
    impact: {
        spots: [{ spotAnim: SHADOW_RIPPLE, fit: 4 }],
        shake: 0.6,
        flash: FLASH,
    },
};

const ATTACKS: BossAttackDef[] = [
    VOLLEY,
    // Drowned, five shots, fanned wider
    { ...VOLLEY, name: "Drowning volley", count: 5, spread: 0.26, phases: [3] },
    TENTACLES,
    // Drowned, the cross twice, the second aimed afresh
    {
        ...TENTACLES,
        name: "Tentacles twice",
        weight: 2,
        phases: [3],
        chain: { times: 1, windup: 0.9 },
    },
    BURST,
    SCREECH,
    // Quicker drowned
    { ...SCREECH, name: "Drowning screech", cooldown: 8, phases: [3] },
];

const RISING: ImpactDef = {
    spots: [
        { spotAnim: SHADOW_RIPPLE, fit: 3 },
        { spotAnim: BLOWN_DUST, fit: 2.5 },
    ],
    shake: 0.4,
};

// Her siphons, one a phase: half the souls from nearer, half from further, so they come in a
// stream rather than all at once
const SIPHONS: { hp: number; near: number; far: number }[] = [
    { hp: 0.82, near: 3, far: 3 },
    { hp: 0.48, near: 4, far: 3 },
    { hp: 0.14, near: 4, far: 4 },
];

export const WHISPERER_ENEMIES: EnemyDef[] = [
    {
        id: AWAKENED_WHISPERER_ID,
        name: "The Awakened Whisperer",
        npcId: 12204,
        idleSeq: IDLE_SEQ,
        walkSeq: WALK_SEQ,
        attackSeq: VOLLEY_SEQ,
        deathSeq: -1,
        hp: WHISPERER_HITPOINTS,
        damage: 0,
        speed: 1.6,
        radius: 0.9,
        xp: 0,
        knockbackResist: 1,
        solid: true,
        sounds: SOUNDS,
        // Three tiles across in OSRS, and towering, as the Lassar Undercity's
        scale: 1.3,
        // In both worlds, but hurt only in the city
        realm: "both",
        hurtIn: 0,
        spawnMessage: "The Awakened Whisperer rises before her cathedral!",
        boss: {
            attackInterval: 1.3,
            keepDistance: 2,
            enrage: { message: "" },
            bulletGrace: 0.6,
            attacks: ATTACKS,
            fallSeconds: 2.4,
            summonsAt: SIPHONS.flatMap(({ hp, near, far }) => [
                {
                    hp,
                    enemyId: WHISPERER_SOUL_ID,
                    count: near,
                    distance: 6,
                    message: "Soul Siphon! Her souls drift to her through the realm.",
                },
                { hp, enemyId: WHISPERER_SOUL_ID, count: far, distance: 9 },
            ]),
            siphon: {
                enemyId: WHISPERER_SOUL_ID,
                stun: 3.5,
                message: "Every soul caught: the siphon breaks, and she reels!",
            },
            look: {
                title: "#a58ae0",
                subtitle: "#c4bcd8",
                edge: null,
                vignette: null,
                lean: true,
                dark: [6, 4, 14],
            },
            intro: {
                seconds: 4.5,
                riseAt: 1.2,
                title: "The Awakened Whisperer",
                subtitle: "The Lassar Undercity",
                distance: WHISPERER_START_DISTANCE,
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
                stun: 3.5,
                stunSpotAnim: STARS,
                stunHeight: 3.4,
                exposeSound: 1971,
                stunSound: 1141,
            },
            phases: {
                phases: [
                    { until: 0.65, status: "The song" },
                    {
                        until: 0.3,
                        status: "The realm bleeds",
                        message: "The realm bleeds into the city!",
                        opener: "Tentacles",
                        tempo: 0.9,
                        speed: 1.1,
                    },
                    {
                        status: "Drowned",
                        message: "Drowned!",
                        opener: "Drowning volley",
                        tempo: 0.8,
                        speed: 1.2,
                    },
                ],
                threshold: {
                    seconds: 2,
                    shout: "Listen...",
                    sound: 7408,
                    impact: {
                        spots: [
                            { spotAnim: SHADOW_RIPPLE, fit: 3 },
                            { spotAnim: BLOWN_DUST, fit: 3 },
                        ],
                        shake: 0.4,
                        flash: FLASH,
                    },
                    riseImpact: {
                        spots: [
                            { spotAnim: SHADOW_RIPPLE, fit: 4.5 },
                            { spotAnim: BLOWN_DUST, fit: 3 },
                        ],
                        shake: 0.6,
                        flash: FLASH,
                    },
                },
                barPerPhase: true,
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
    // Her Soul Siphon's souls: they come with the party between the worlds, drifting in to her, and
    // each that reaches her heals her. Caught only in the realm, walking into them.
    {
        id: WHISPERER_SOUL_ID,
        name: "Siphoned Soul",
        npcId: 12212,
        idleSeq: 5538,
        walkSeq: 5539,
        attackSeq: 5538,
        deathSeq: -1,
        hp: 1,
        damage: 0,
        speed: 1.2,
        radius: 0.4,
        xp: 0,
        sounds: { attack: -1, hit: -1, death: -1 },
        unhittable: true,
        caught: true,
        caughtIn: 1,
        realm: "both",
        hintArrow: true,
        heals: {
            fraction: 0.025,
            interval: 0.5,
            range: 1.2,
            targets: [AWAKENED_WHISPERER_ID],
            seek: 30,
            once: true,
            spotAnim: SOUL_FLASH,
        },
        spawnSpotAnim: SOUL_FLASH,
    },
];

// Her realm: Lassar's, without its puddles, souls or portal (Blackstone's the way in and out), its
// sanity draining faster, its tentacles rising near you, and her fight's music throughout
export const WHISPERER_REALM: RealmRuleDef = {
    ...LASSAR_REALM,
    puddles: { ...LASSAR_REALM.puddles, from: 1e9 },
    sanity: { max: 100, refill: 20, drain: 6, hit: 8, low: 30, lapse: 0.2 },
    souls: { ...LASSAR_REALM.souls, count: 0 },
    waves: [],
    risers: { enemyId: "lassar_tentacle", every: 6, max: 2, distance: [3, 6] },
    elite: undefined,
    look: { ...LASSAR_REALM.look, music: undefined },
};
