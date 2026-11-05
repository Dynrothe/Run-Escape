import { moveFeatures } from "../core/arena";
import { SUNKEN_CATHEDRAL } from "../scaperune/maps/sunkenCathedral";
import {
    ArenaFeatures,
    EnemyDef,
    FightAbilityDef,
    ImpactDef,
    SongDef,
    SongPhraseDef,
} from "./types";

// The Bell Choir: the Whisperer in the sunken cathedral (maps.ts, scaperune/maps/sunkenCathedral.ts).
// The fight is a song (BossDef.song): a beat clock runs it all, every attack's counted in on that
// beat and lands on a beat or a counted half-beat, and the tempo steps up from 120 to 136 to 150
// beats a minute, a phase at a time. The player hurts her only by keeping time: Toll on the beat
// near her builds Resonance, ringing back a great bell spends it (and puts her out of tune for a
// bar), and stepping out of an attack on its last count is a Grace.
// The design and its numbers: docs/design/the-bell-choir.md.

// Her animations, all on her own skeleton (npc 12204)
const IDLE_SEQ = 10230;
const GLIDE_SEQ = 10232;
// Her arms raised, and a clap 1.72 s in
const CLAP_SEQ = 10254;
const CLAP_AT = 1.72;
// A hand raised: casting at the choir
const CAST_SEQ = 10241;
// Sinking into the water, and rising out of it (the Odd Figure's rise, on her skeleton too)
const SINK_SEQ = 10247;
const RISE_SEQ = 10227;
const DEATH_SEQ = 10260;

// The water's splashes, all her own (2447-2450 a cyan column of four sizes, 2451 a wide burst
// with a ring), and the stomp's ring that runs out along the floor
const SPLASH = 2448;
const SURGE = 2449;
const BURST = 2450;
const WIDE = 2451;
const STOMP_RING = 318;

const RISING: ImpactDef = {
    spots: [
        { spotAnim: WIDE, fit: 3 },
        { spotAnim: STOMP_RING, fit: 7 },
    ],
    shake: 0.3,
    flash: "#bfefff",
};

// The arena's features in world tiles: its bells (tuned treble to tenor: NE, NW, SE, SW), the
// tenor, the choir, the nave and its bands, and the axis the canon mirrors about
export const SUNKEN_CATHEDRAL_FEATURES: ArenaFeatures = moveFeatures(
    {
        bells: SUNKEN_CATHEDRAL.bells,
        tenor: SUNKEN_CATHEDRAL.tenor,
        choir: SUNKEN_CATHEDRAL.choir,
        nave: SUNKEN_CATHEDRAL.nave,
        bands: SUNKEN_CATHEDRAL.bands,
        axis: SUNKEN_CATHEDRAL.axis,
        rise: { x: SUNKEN_CATHEDRAL.rise.x + 0.5, y: SUNKEN_CATHEDRAL.rise.y + 0.5 },
    },
    SUNKEN_CATHEDRAL.origin.x,
    SUNKEN_CATHEDRAL.origin.y,
);

// MapDef.bossArena: the square round the nave
export const SUNKEN_CATHEDRAL_BOSS_ARENA = {
    baseX: SUNKEN_CATHEDRAL.origin.x + SUNKEN_CATHEDRAL.bossArena.x,
    baseY: SUNKEN_CATHEDRAL.origin.y + SUNKEN_CATHEDRAL.bossArena.y,
    size: SUNKEN_CATHEDRAL.bossArena.size,
};

// Tiles south of her the player stands as she rises, as the map starts them
export const BELL_CHOIR_START_DISTANCE = SUNKEN_CATHEDRAL.rise.y - SUNKEN_CATHEDRAL.start.y;

// Her hitpoints, each phase its own bar: 26% for the first verse, 37% each for the others
export const BELL_CHOIR_HITPOINTS = 4500;

// The great bells' notes, treble to tenor (the Tower of Voices' bells: high C, G, E, C)
export const BELL_NOTES = [4152, 4191, 4192, 4176];
// The tenor's toll on every downbeat
export const TENOR_SOUND = 2380;

// Toll, the fight's button (MapDef.fight.ability): on the beat, within reach of her middle
export const BELL_CHOIR_TOLL: FightAbilityDef = {
    id: "toll",
    name: "Toll",
    damage: 6,
    reach: 4.5,
    cooldown: 0,
    // The crier bell
    iconObjId: 20243,
};

// What the player has: 30 hitpoints at 4 tiles a second. The beat's warnings are at least twice
// what it takes to step out of each (docs/design/the-bell-choir.md, 4.3).
const CLAP: SongPhraseDef = {
    name: "The Clap",
    kind: "clap",
    phases: [1, 2],
    weight: 3,
    damage: 7,
    radius: 3.5,
    seq: CLAP_SEQ,
    strikeAt: CLAP_AT,
    // Her arm raise as it begins, and her clap on beat 4
    sound: 7289,
    landSound: 7361,
    spot: { spotAnim: STOMP_RING, fit: 3.5 },
};

const ECHO: SongPhraseDef = {
    name: "Echo",
    kind: "echo",
    phases: [1],
    weight: 2,
    damage: 4,
    radius: 1,
    seq: CAST_SEQ,
    sound: 7317,
    countSound: 7317,
    landSound: 7314,
    spot: { spotAnim: SPLASH, fit: 1 },
};

const BELLS: SongPhraseDef = {
    name: "Change ringing",
    kind: "bells",
    phases: [1],
    weight: 1,
    damage: 6,
    radius: 4.5,
    order: "fixed",
    spot: { spotAnim: BURST, fit: 4.5 },
};

const PSALM: SongPhraseDef = {
    name: "The Psalm",
    kind: "psalm",
    phases: [2],
    weight: 2,
    damage: 6,
    seq: CAST_SEQ,
    sound: 7299,
    landSound: 7270,
    spot: { spotAnim: SURGE, fit: 1.4 },
    gap: 3,
};

const SILENCE: SongPhraseDef = {
    name: "Silence",
    kind: "silence",
    phases: [2, 3],
    weight: 2,
    damage: 8,
    seq: CAST_SEQ,
    // The choir swells into the rest: sos_choir peaks about three beats in
    sound: 1246,
    still: { tolerance: 0.15, grace: 4 },
    shout: "Silence!",
};

const HARMONY: SongPhraseDef = {
    name: "Harmony",
    kind: "harmony",
    phases: [2],
    weight: 2,
    damage: 7,
    width: 1.5,
    lines: 1,
    seq: CAST_SEQ,
    sound: 7303,
    landSound: 7286,
    spot: { spotAnim: SPLASH, fit: 1 },
    gap: 2,
};

const PHRASES: SongPhraseDef[] = [
    CLAP,
    // The first verse's in order; the second's shuffled, and its melody with it; the requiem's
    // two at a time
    BELLS,
    { ...BELLS, name: "Changes", phases: [2], order: "shuffled" },
    { ...BELLS, name: "Change ringing in pairs", phases: [3], weight: 2, order: "pairs" },
    ECHO,
    { ...ECHO, name: "Echo (syncopated)", phases: [2, 3], offbeat: true },
    PSALM,
    { ...PSALM, name: "The Psalm from both ends", phases: [3], both: true },
    SILENCE,
    HARMONY,
    { ...HARMONY, name: "Harmony (a chord)", phases: [3], lines: 2 },
    {
        ...CLAP,
        name: "Double clap",
        phases: [3],
        double: { to: 5.5, damage: 5 },
    },
];

const SONG: SongDef = {
    phases: [
        // The first verse: her voice, and the bells every four bars
        { ticksPerBeat: 25, rest: { voice: 4, arena: 6 } },
        // The tempo quickens: the water and the choir join in
        { ticksPerBeat: 22, rest: { voice: 2, arena: 2 }, opener: "The Psalm" },
        // Requiem: her reflection sings a bar behind her
        {
            ticksPerBeat: 20,
            rest: { voice: 1, arena: 1 },
            opener: "Change ringing in pairs",
            canon: true,
        },
    ],
    // 100 ms before a beat to 140 ms after: late-leaning, as phones and headphones play late
    early: 5,
    late: 7,
    // A co-op guest's press, as far back as 300 ms
    lookBack: 15,
    phrases: PHRASES,
    toll: {
        reach: 4.5,
        damage: 6,
        perResonance: 2,
        maxResonance: 8,
        hitCost: 2,
        ringBack: { reach: 4.5, damage: 40, perResonance: 15, hum: 2 },
        discordBars: 1,
        grace: { resonance: 2, reach: 6.5, bars: 1 },
        // The hand bell, a dull clunk off the beat, and the peal of a bell rung back
        sound: 2192,
        offSound: 3817,
        ringSound: 3385,
        ringSpot: { spotAnim: WIDE, fit: 2 },
        // Ringing the crier bell
        playerSeq: 6865,
    },
    idleSeq: IDLE_SEQ,
};

export const BELL_CHOIR_ENEMIES: EnemyDef[] = [
    {
        id: "the_whisperer",
        name: "The Whisperer",
        npcId: 12204,
        idleSeq: IDLE_SEQ,
        walkSeq: GLIDE_SEQ,
        attackSeq: CLAP_SEQ,
        deathSeq: DEATH_SEQ,
        hp: BELL_CHOIR_HITPOINTS,
        damage: 0,
        // Five eighths of the player's pace, quicker by the phase
        speed: 2.5,
        radius: 1.5,
        xp: 0,
        knockbackResist: 1,
        solid: true,
        sounds: { attack: -1, hit: -1, death: -1 },
        spawnMessage: "The Whisperer rises!",
        boss: {
            attackInterval: 1,
            attacks: [],
            keepDistance: 2.5,
            enrage: { message: "" },
            // Far off, she sinks and rises by them
            leash: {
                distance: 14,
                keep: 5,
                jump: {
                    downSeq: SINK_SEQ,
                    upSeq: RISE_SEQ,
                    seconds: 0.8,
                    land: { spots: [{ spotAnim: WIDE, fit: 2.5 }], shake: 0.15 },
                    landAt: 0.2,
                },
            },
            // Her death is 3.6 s
            fallSeconds: 3.6,
            look: {
                title: "#9fe8ff",
                subtitle: "#c9b8ff",
                edge: null,
                vignette: null,
                lean: true,
                dark: [4, 6, 20],
                // Out of tune: a pale glow
                exposedTint: 0xd8f6ff,
            },
            intro: {
                seconds: 6,
                riseAt: 1.5,
                seq: RISE_SEQ,
                darkSound: 7310,
                sound: 7324,
                title: "The Whisperer",
                subtitle: "The Bell Choir",
                distance: BELL_CHOIR_START_DISTANCE,
                alone: true,
                atMiddle: true,
                holds: true,
                faces: true,
                pan: { from: 4, over: 1.6 },
                land: RISING,
                landAt: 1.2,
            },
            // Rung back, a bell puts her out of tune: everything does double for a bar. She never
            // stops singing (no stun).
            guard: { damage: 2, stun: 0, exposeSound: 3018 },
            song: SONG,
            phases: {
                phases: [
                    { until: 0.74, status: "The first verse" },
                    {
                        until: 0.37,
                        status: "The tempo quickens",
                        message: "The tempo quickens!",
                        speed: 1.1,
                    },
                    { status: "Requiem", message: "Requiem!", speed: 1.2 },
                ],
                // A key change, on the beat (Sim.songKeyChange): she sinks, the nave's quiet a
                // bar, the tenor counts in the new tempo, and she rises with the gong
                threshold: {
                    seconds: 3.5,
                    seq: SINK_SEQ,
                    riseSeq: RISE_SEQ,
                    sound: 3879,
                    impact: { spots: [{ spotAnim: WIDE, fit: 3 }], shake: 0.2 },
                    riseImpact: RISING,
                },
                confine: false,
                barPerPhase: true,
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
];
