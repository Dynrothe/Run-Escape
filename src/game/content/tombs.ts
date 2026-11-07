import {
    AkkhaDef,
    AkkhaElementDef,
    BossAttackDef,
    EnemyDef,
    EnemyShotDef,
    FightAbilityDef,
    KephriDef,
    LightLook,
    LightingDef,
    PlayerEffectDef,
    RaidSupplyDef,
    RandomEventDef,
    TombsBundleDef,
    WardensDef,
    WaveDef,
    ZebakDef,
} from "./types";

// The raid's light (MapDef.lighting; docs/DEVELOPMENT.md, Lights): a tomb lit by its fires, a
// little dim and warm, with a lantern's glow round each player, its braziers and fires and the
// paths' teleport crystals lighting themselves. Not the Scar's rule: weapons aim at everything.
const TORCHLIGHT = 0xffb060;

// Every boss's guard (BossDef.guard): down a moment after a miss of its own (an attack's opens),
// or while it channels a spell (BossAttackDef.channel), when it takes twice from everything,
// the raid's button (TombsDef.ability) too. Not stunned: nothing in the Tombs stuns a boss yet.
export const TOMBS_GUARD: NonNullable<NonNullable<EnemyDef["boss"]>["guard"]> = {
    damage: 2,
    stun: 0,
};
// And lit up gold while it's down, as the quest's bosses are (BossLookDef.exposedLight)
export const TOMBS_EXPOSED = {
    exposedLight: { radius: 2.5, color: 0xffc040, intensity: 0.6 },
};

// The raid's fight button (TombsDef.ability), played with your own character: a share of the
// boss's hitpoints, so it's worth the same at every raid level and party size, doubled while
// its guard's down, and it breaks a spell being channelled. Osmumten's fang is its button, the
// raid's own weapon; the hero swings whatever they're holding (Sim.fireAbility).
export const TOMBS_STRIKE: FightAbilityDef = {
    id: "tombs_strike",
    name: "Amascut's bane",
    damage: 0,
    damageShare: 0.004,
    reach: 4,
    openReach: 5.5,
    cooldown: 5,
    iconObjId: 26219,
    // Dust thrown up off the boss, as the quest's button does
    impact: { spots: [{ spotAnim: 2184, fit: 1.5 }], shake: 0.2 },
};
export const TOMBS_LIGHTING: LightingDef = {
    ambient: 0.72,
    ambientColor: 0xffe6c4,
    player: { radius: 5, color: 0xffd8a8, intensity: 0.45 },
    locs: {
        // The Nexus's braziers and the fires either side of the Wardens' steps
        ...Object.fromEntries(
            [45244, 45245, 45246, 45247, 45248].map((id) => [
                id,
                { radius: 4, color: TORCHLIGHT, intensity: 0.8, flicker: 0.25 },
            ]),
        ),
        45334: { radius: 4.5, color: TORCHLIGHT, intensity: 0.9, flicker: 0.3 },
        // Each path's teleport crystal, a cool glow
        ...Object.fromEntries(
            [45505, 45506, 45579, 45754, 45866].map((id) => [
                id,
                {
                    radius: 3.5,
                    color: 0x9fd8ff,
                    intensity: 0.6,
                    pulse: { amount: 0.2, seconds: 3 },
                },
            ]),
        ),
    },
};

// The Tombs of Amascut (in development: docs/design/tombs-of-amascut.md): its enemies, and what
// each path's room does. The map, with where things stand, is the dev map's
// (scaperune/maps/tombsOfAmascut.ts); this is the data the sim plays it by.

// ---- The baboons of the Path of Apmeken ----
//
// All on the baboon skeleton (2063): idle 9741, walk 9739, flinch 9746, death 9744 (1.8s, ending
// in the thud 5971). Attacks by kind: a swipe 9742, a throw 9743, a cast 9748, the shaman's call
// 9751. Their sounds are their animations' own (scripts/cache/sounds.ts seqs). All are slower than
// a player (3.3 tiles a second), about as the Theatre's halls' are: the room's small, so a fresh run
// needs to be able to get away.

const IDLE = 9741;
const WALK = 9739;
const DEATH = 9744;

// The thrower's rock: a thrown rock (1727, a boss's elsewhere). 2242 to 2244 are the baboon's own
// model 46350, which looks like a chest in flight.
const THROWN_ROCK: EnemyShotDef = {
    range: 7,
    interval: 3.2,
    speed: 8,
    spotAnim: 1727,
    seq: 9743,
    sound: 5962,
};

// The mage's spell: an earth blast until the baboons' own is found
const BABOON_SPELL: EnemyShotDef = {
    range: 8,
    interval: 3.4,
    speed: 9,
    castSpotAnim: 138,
    spotAnim: 139,
    impactSpotAnim: 140,
    seq: 9748,
    sound: 5952,
};

function baboon(def: Omit<EnemyDef, "idleSeq" | "walkSeq" | "deathSeq" | "radius">): EnemyDef {
    return { idleSeq: IDLE, walkSeq: WALK, deathSeq: DEATH, radius: 0.35, ...def };
}

// Spot animations the Tombs show that are no attack's: Kephri's shield (up, and taking a swarm),
// the Arcane Scarab's charge, and the Warden that loses the first phase blowing up
export const TOMBS_SPOTANIMS = {
    kephriShield: 2141,
    kephriShieldSwarm: 2144,
    arcaneCharge: 2150,
    wardenBlowsUp: 2216,
};

export const TOMBS_ENEMIES: EnemyDef[] = [
    // Never spawned: what Ba-Ba's boulders are drawn as (BulletPatternDef.look, falls), her
    // Boulder NPC rolling (9518)
    {
        id: "rolling_boulder",
        name: "Boulder",
        npcId: 11782,
        idleSeq: 9518,
        walkSeq: 9518,
        attackSeq: 9518,
        deathSeq: 9518,
        hp: 1,
        damage: 0,
        speed: 0,
        radius: 1.3,
        xp: 0,
        sounds: { attack: -1, hit: -1, death: -1 },
    },
    // Never spawned: the rock Ba-Ba's boulder leaves to take cover by (BossAttackDef.leavesCover),
    // the four Rubble NPCs
    ...[11784, 11785, 11786, 11787].map(
        (npcId, i): EnemyDef => ({
            id: "ba_ba_rubble_" + i,
            name: "Rubble",
            npcId,
            idleSeq: -1,
            walkSeq: -1,
            attackSeq: -1,
            deathSeq: -1,
            hp: 1,
            damage: 0,
            speed: 0,
            radius: 1.4,
            xp: 0,
            sounds: { attack: -1, hit: -1, death: -1 },
        }),
    ),
    // One in each row of Ba-Ba's rolling boulders (BulletPatternDef.cracked): break it to get
    // through. It rolls on its own (Enemy.rolls), so its speed and touch are the row's.
    {
        id: "cracked_boulder",
        name: "Cracked boulder",
        npcId: 11783,
        idleSeq: 9518,
        walkSeq: 9518,
        attackSeq: 9518,
        deathSeq: 9518,
        hp: 15,
        damage: 0,
        speed: 0,
        radius: 1.3,
        // As big as the rest of its row
        scale: 1.15,
        xp: 0,
        knockbackResist: 1,
        sounds: { attack: -1, hit: 5998, death: 5962 },
    },
    baboon({
        id: "baboon_brawler",
        name: "Baboon Brawler",
        npcId: 11709,
        attackSeq: 9742,
        hp: 12,
        damage: 2,
        speed: 2.3,
        xp: 10,
        sounds: { attack: 5984, hit: 5998, death: 5971 },
    }),
    baboon({
        id: "baboon_thrower",
        name: "Baboon Thrower",
        npcId: 11710,
        attackSeq: 9743,
        hp: 9,
        damage: 2,
        speed: 2.0,
        xp: 10,
        shot: THROWN_ROCK,
        sounds: { attack: 5962, hit: 5998, death: 5971 },
    }),
    baboon({
        id: "baboon_mage",
        name: "Baboon Mage",
        npcId: 11711,
        attackSeq: 9748,
        hp: 9,
        damage: 2,
        speed: 2.0,
        xp: 10,
        shot: BABOON_SPELL,
        sounds: { attack: 5952, hit: 5998, death: 5971 },
    }),
    // Calls in thralls until it's dead: kill it first, as in OSRS. It casts too, slower than a mage
    baboon({
        id: "baboon_shaman",
        name: "Baboon Shaman",
        npcId: 11715,
        attackSeq: 9751,
        hp: 20,
        damage: 2,
        speed: 1.9,
        xp: 18,
        shot: { ...BABOON_SPELL, interval: 4.5 },
        spawns: {
            enemies: [{ id: "baboon_thrall", weight: 1 }],
            interval: 5,
            count: 2,
            max: 8,
            radius: 1.5,
        },
        sounds: { attack: 5989, hit: 5998, death: 5971 },
    }),
    baboon({
        id: "baboon_thrall",
        name: "Baboon Thrall",
        npcId: 11718,
        attackSeq: 9742,
        hp: 6,
        damage: 1,
        speed: 2.4,
        xp: 4,
        sounds: { attack: 5984, hit: 5998, death: 5971 },
    }),
    // Blows up when it dies, hurting its own pack as well as you: lure them in together
    baboon({
        id: "volatile_baboon",
        name: "Volatile Baboon",
        npcId: 11716,
        attackSeq: 9742,
        hp: 10,
        damage: 2,
        speed: 2.5,
        xp: 12,
        explodes: { damage: 6, radius: 2.5, spotAnim: 157, sound: 2500, pack: 30 },
        sounds: { attack: 5984, hit: 5998, death: 5971 },
    }),
    // Its touch curses: weaker for a while, and more with each
    baboon({
        id: "cursed_baboon",
        name: "Cursed Baboon",
        npcId: 11717,
        attackSeq: 9742,
        hp: 16,
        damage: 2,
        speed: 2.2,
        xp: 14,
        touches: {
            kind: "debuff",
            id: "baboon_curse",
            name: "Cursed",
            // The Cursed phalanx
            iconObjId: 27248,
            stats: { meleeMight: -0.08, rangedMight: -0.08, magicMight: -0.08 },
            seconds: 10,
            stacks: 4,
        },
        sounds: { attack: 5984, hit: 5998, death: 5971 },
    }),
    // Ba-Ba's below
];

// ---- Ba-Ba, the Path of Apmeken's boss ----
//
// On the baboons' skeleton too (NPC 11778, size 5: idle 9741, walk 9737). Her attacks are her
// OSRS ones as bullets: a shockwave in front of her (and a stomp under her for whoever camps
// there), rockfall where you stand, a boulder that bursts where it lands, her baboons, and at 66%
// and 33% her rolling stones, rows of boulders across the arena with a way through each.

// A rolling boulder (model 46414, the rolling boulders' own), and a thrown rock
const BOULDER = 2245;
// Where a rock lands (a Rockfall's, as the game's others use)
const ROCK_IMPACT = 451;

export const BA_BA: EnemyDef = {
    id: "ba_ba",
    name: "Ba-Ba",
    npcId: 11778,
    idleSeq: IDLE,
    walkSeq: 9737,
    attackSeq: 9745,
    deathSeq: DEATH,
    // Up from 6,000 with her guard (Shockwave's opens) and the raid's button: no easier for them
    hp: 7800,
    damage: 0,
    speed: 1.3,
    radius: 1.2,
    xp: 1200,
    knockbackResist: 1,
    solid: true,
    sounds: { attack: 5967, hit: 5998, death: 5971 },
    spawnMessage: "Ba-Ba rises from her throne!",
    boss: {
        attackInterval: 2.2,
        enrage: { message: "Ba-Ba's fur stands on end: she's furious!" },
        // Her shockwave pounded into empty floor leaves her open (opens)
        guard: TOMBS_GUARD,
        look: TOMBS_EXPOSED,
        // Camp under her and she stomps, quicker the longer you stay
        stomp: { radius: 1.6, interval: 0.6, damage: 2, max: 8, sound: 5971 },
        rollingStones: {
            at: [0.66, 0.33],
            // Over sooner if someone gets back up to her (TombsPathDef boss.boulders)
            seconds: 20,
            attacks: ["Rolling boulders"],
            // A row every this many seconds, each with its way through somewhere new
            interval: 1.3,
            message: "Ba-Ba flees to her altar and boulders come rolling! Get back up to her!",
            endMessage: "The boulders stop rolling. Ba-Ba can be hurt again!",
        },
        attacks: [
            {
                // Marked on the ground round her before it lands, so it's plain where to step to
                name: "Shockwave",
                kind: "ground",
                damage: 6,
                windup: 1.3,
                cooldown: 2,
                range: 5,
                weight: 8,
                seq: 9742,
                sound: 5984,
                ground: { spots: [{ shape: "under" }], radius: 3.6, spotAnim: ROCK_IMPACT },
                invoked: { id: "shaking_things_up", radius: 1.4 },
                opens: 1,
            },
            {
                // Shadows on the floor in a cross on you, a rock coming down into each, as OSRS's
                name: "Rockfall",
                kind: "ground",
                damage: 5,
                windup: 1.8,
                cooldown: 4,
                range: 30,
                weight: 5,
                impactSpotAnim: ROCK_IMPACT,
                falls: { look: "rolling_boulder", height: 12, scale: 0.35 },
                ground: { spots: [{ shape: "cross", reach: 3 }], radius: 0.5, shadow: true },
                seq: 9743,
                sound: 5962,
                message: "Rocks fall from above! Move off the shadows!",
            },
            {
                // Comes down near you (never on you) under its shadow and the debris falling
                // ahead of it, breaks into shards, and stays: the rock to take cover by from the
                // avalanche that follows
                name: "Boulder",
                kind: "blast",
                damage: 6,
                windup: 2,
                cooldown: 12,
                range: 30,
                weight: 4,
                radius: 1.5,
                beside: { min: 2.5, max: 4.5 },
                shadow: { debrisSpotAnim: 1727 },
                leavesCover: {
                    seconds: 25,
                    radius: 1.4,
                    looks: ["ba_ba_rubble_0", "ba_ba_rubble_1", "ba_ba_rubble_2", "ba_ba_rubble_3"],
                },
                follow: { attack: "Avalanche", delay: 0.6 },
                impactSpotAnim: ROCK_IMPACT,
                // Her dark boulder, not the pale rock, so its shards stand out on the floor
                spotAnim: BOULDER,
                falls: { look: "rolling_boulder", height: 12, scale: 1 },
                shards: {
                    look: "rolling_boulder",
                    count: 16,
                    speed: 4,
                    range: 9,
                    radius: 0.45,
                    damage: 3,
                    scale: 1.4,
                },
                seq: 9748,
                sound: 5962,
                message: "Ba-Ba hurls a boulder! Mind its shards, then get beside it!",
            },
            {
                // Only after her boulder (its follow): rocks everywhere but beside a boulder,
                // nearly all your hitpoints
                name: "Avalanche",
                kind: "swing",
                damage: 0,
                windup: 2.4,
                cooldown: 0,
                range: 60,
                weight: 0,
                takeCover: { reach: 1.6, share: 0.8 },
                ignoreArmor: true,
                impactSpotAnim: ROCK_IMPACT,
                seq: 9743,
                sound: 5962,
                message: "Ba-Ba shakes the ceiling loose! Take cover beside a boulder!",
            },
            {
                name: "Call baboons",
                kind: "summon",
                damage: 0,
                windup: 1.2,
                cooldown: 14,
                range: 30,
                weight: 2,
                seq: 9751,
                sound: 5989,
                // They make for her sarcophagi: kill them before they open one
                summon: { enemyId: "baboon_thrower", count: 2, distance: 4, sarcophagi: true },
                message: "Ba-Ba calls her baboons! Stop them reaching the sarcophagi!",
            },
            {
                name: "Rolling boulders",
                kind: "pattern",
                ordeal: true,
                damage: 4,
                windup: 0.6,
                cooldown: 0,
                range: 60,
                weight: 1,
                spotAnim: BOULDER,
                sound: 5971,
                invoked: { id: "boulderdash", speed: 2 },
                pattern: {
                    shape: "wall",
                    // Five lanes across her arena's floor (15 tiles): four boulders and a cracked
                    // one to break, at most two lanes from the last row's, as in OSRS
                    count: 5,
                    volleys: 1,
                    interval: 1,
                    speed: 3.2,
                    // From her altar to the arena's foot, and no further: not into the safe room
                    range: 19,
                    radius: 1.3,
                    gap: 1,
                    gapStep: 2,
                    cracked: "cracked_boulder",
                    look: "rolling_boulder",
                    spacing: 3,
                    scale: 3,
                    heading: "south",
                    knockback: 4,
                },
            },
        ],
    },
};

TOMBS_ENEMIES.push(BA_BA);

// A path's boss, by its path level (Sim.tombsPathLevel: paths done, and Pathseeker and on): its
// hitpoints and damage go up by these shares a level, so one left till last holds up to a party
// that's levelled through the rest of the raid
// (gently, as OSRS's do: the raid level's scale does the heavy lifting, and Pathmaster with Walk
// the Path takes the last path to level 9)
export const TOMBS_BOSSES = { levelHp: 0.12, levelDamage: 0.05 };

// The levels a puzzle room's worth as it's done, on top of its waves' experience (Sim.enterTombsBoss)
export const TOMBS_PUZZLE_LEVELS = 2;

// A boss's adds drop food this often at raid level 0, less the higher it goes (a third of that
// at Expert, where a boss's unavoidable hits alone outrun a run's hitpoints without it), none from
// untilLevel (Sim.tombsBossFood). The Wardens have no adds to speak of, so as each of their
// phases ends this much food spills round the party (Sim.wardensFood), as few at the same rate.
export const TOMBS_BOSS_FOOD = { chance: 0.06, untilLevel: 450, phase: 3 };

// Jungle Japes: each of Ba-Ba's baboons drops a banana peel as it dies, there for `seconds`.
// Stepping within `radius` of one roots you for `stun` seconds. Drawn as the Banana (1963).
// Ba-Ba's sarcophagi: a baboon that reaches one (within reach tiles) spends `prying` seconds
// opening it, time to kill it in. Then it's open for seconds, the Open
// Sarcophagus drawn over it, firing a fan of count blasts arc radians wide across the arena every
// so many seconds. Gotta Have Faith makes them hit harder.
export const SARCOPHAGI = {
    seconds: 10,
    every: 1.2,
    count: 5,
    arc: 0.9,
    speed: 4,
    range: 16,
    radius: 0.4,
    reach: 2.2,
    prying: 3,
    loc: 45753,
};
export const SARCOPHAGUS_BLAST: BossAttackDef = {
    name: "Sarcophagus blast",
    kind: "blast",
    damage: 3,
    windup: 0,
    cooldown: 0,
    range: 0,
    weight: 0,
    // Red bolts with trails, as OSRS's
    spotAnim: 2246,
    invoked: { id: "gotta_have_faith", damage: 1.5 },
};

export const JUNGLE_JAPES = { seconds: 20, radius: 0.5, stun: 1.5, objId: 1963 };

// ---- The Apmeken room ----

// The room's eight waves, as OSRS's go: each a group sent when the last is dead (or has been about
// long enough), getting meaner, the shamans and the specials (volatile, cursed) coming in later.
// Past the first path the raid's been through, each wave brings one more of its commonest.
export const APMEKEN_WAVES: string[][] = [
    ["baboon_brawler", "baboon_brawler", "baboon_shaman"],
    ["baboon_thrower", "baboon_thrower", "baboon_brawler"],
    ["baboon_mage", "baboon_mage", "baboon_shaman"],
    ["baboon_brawler", "baboon_thrower", "baboon_mage", "volatile_baboon"],
    ["cursed_baboon", "baboon_thrower", "baboon_mage", "baboon_shaman"],
    ["volatile_baboon", "volatile_baboon", "cursed_baboon", "baboon_brawler"],
    ["baboon_shaman", "baboon_shaman", "cursed_baboon", "baboon_mage", "baboon_thrower"],
    ["baboon_shaman", "volatile_baboon", "volatile_baboon", "cursed_baboon", "cursed_baboon"],
];

// The stream of baboons alongside the waves, for experience: a few at a time and slowly, rising a
// little with the wave the room's on. No minimum, so nothing comes out all at once.
export function getApmekenTrickle(wave: number): WaveDef {
    return {
        start: 0,
        spawnRate: 0.35 + wave * 0.08,
        minAlive: 0,
        maxAlive: 4 + wave,
        enemies:
            wave < 2
                ? [
                      { id: "baboon_brawler", weight: 3 },
                      { id: "baboon_thrall", weight: 4 },
                  ]
                : [
                      { id: "baboon_brawler", weight: 3 },
                      // Few shooters in the stream: a crowd of them is a wall of shots
                      { id: "baboon_thrower", weight: 1 },
                      { id: "baboon_mage", weight: 1 },
                      { id: "baboon_thrall", weight: 3 },
                  ],
    };
}

// The barrier between the room and its safe corridor, drawn by the game (it isn't in the map: the
// sim holds its line), animated on its own seq (9495)
export const APMEKEN_BARRIER_LOC = 45135;

// What an issue looks like: falling debris at a pillar giving way (models of the room's own
// Debris, 45320 on), a vent's gas building, and each as it goes. Guesses from the cache's ids,
// to be looked at.
export const APMEKEN_SPOTANIMS = {
    pillar: 2114,
    pillarFalls: 2115,
    vent: 2122,
    ventBursts: 2123,
};

// What fails, and what that costs. Path levels (the invocations) make it all quicker.
export const APMEKEN = {
    // Seconds a wave can go on before the next comes anyway
    waveSeconds: 60,
    // Seconds between a wave's baboons coming out of the walls, one at a time, as OSRS's do
    stagger: 1.5,
    // Seconds between issues, from when the last was fixed or failed (less a second a path level)
    issueEvery: 9,
    // Seconds to fix one before it goes (less one and a half a path level)
    deadline: 12,
    // Seconds stood at one to fix it, as quick as OSRS's: a vent the moment you're on it (a potion
    // dropped in), a pillar about a second (a hammer's hit)
    fixSeconds: { vent: 0, pillar: 1 },
    // Tiles from its middle that count as at it
    reach: 2,
    // What one left to go does to every player, before the enemies' scaling (and the room's), and
    // more for each that's gone this wave: a pillar's falling rock, a vent's burst
    damage: 4,
    // And a share more for each that went before it this wave
    worse: 0.5,
    // The room's enemies start as the Theatre's first hall's do (a run comes in at level one),
    // and get this much tougher with each wave, and with each path level
    waveHp: 0.15,
    waveDamage: 0.08,
    levelHp: 0.15,
    levelDamage: 0.08,
};

// ---- The Het room ----

// Scarabs, for the Het room's waves (the room has none in OSRS, but a run's levels and gear come
// from waves): Kephri's swarms and the scarabs of her path, the swarms die to anything
export const HET_ENEMIES: EnemyDef[] = [
    {
        id: "scarab_swarm",
        name: "Scarab Swarm",
        npcId: 11723,
        idleSeq: 9606,
        walkSeq: 9606,
        attackSeq: 9605,
        deathSeq: 9608,
        hp: 4,
        damage: 1,
        speed: 2.4,
        radius: 0.4,
        xp: 6,
        sounds: { attack: -1, hit: -1, death: -1 },
    },
    {
        id: "agile_scarab",
        name: "Agile Scarab",
        npcId: 11727,
        idleSeq: 9592,
        walkSeq: 9592,
        attackSeq: 9593,
        deathSeq: 9590,
        hp: 10,
        damage: 2,
        speed: 2.6,
        radius: 0.4,
        xp: 12,
        shot: {
            range: 6,
            interval: 2.6,
            speed: 9,
            spotAnim: 2152,
            impactSpotAnim: 2154,
            sound: -1,
        },
        sounds: { attack: -1, hit: -1, death: -1 },
    },
    {
        id: "spitting_scarab",
        name: "Spitting Scarab",
        npcId: 11725,
        idleSeq: 9586,
        walkSeq: 9584,
        attackSeq: 9585,
        deathSeq: 9598,
        hp: 40,
        damage: 3,
        speed: 1.6,
        radius: 1.2,
        xp: 40,
        shot: { range: 8, interval: 3, speed: 7, spotAnim: 2153, impactSpotAnim: 2155, sound: -1 },
        sounds: { attack: -1, hit: -1, death: -1 },
    },
    // The room's goal: shielded (11706) until the beam reaches the Shielded statue, then weakened
    // (11707) for a while, when it's mined (Sim.stepHetMining): weapons never touch it
    {
        id: "hets_seal",
        name: "Het's Seal",
        npcId: 11707,
        idleSeq: -1,
        walkSeq: -1,
        attackSeq: -1,
        deathSeq: -1,
        hp: 250,
        damage: 0,
        speed: 0,
        radius: 1.5,
        xp: 200,
        knockbackResist: 1,
        stationary: true,
        unhittable: true,
        healthBar: true,
        shield: { seconds: 0, look: { npcId: 11706, idleSeq: -1 } },
        sounds: { attack: -1, hit: -1, death: -1 },
    },
    // Never spawned: what an Orb of Darkness is drawn as (Sim's Het room's orbs aren't enemies)
    {
        id: "het_orb",
        name: "Orb of Darkness",
        npcId: 11708,
        idleSeq: 9542,
        walkSeq: 9542,
        attackSeq: 9542,
        deathSeq: 9542,
        hp: 1,
        damage: 0,
        speed: 0,
        radius: 0.5,
        xp: 0,
        sounds: { attack: -1, hit: -1, death: -1 },
    },
];
TOMBS_ENEMIES.push(...HET_ENEMIES);

// The Het room's waves: one as it starts, and one each time the beam opens the seal, with a
// casket each time (one to three of them, by how hard the party mines: HET.mine)
export const HET_WAVES: string[][] = [
    [
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
    ],
    [
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "agile_scarab",
        "agile_scarab",
    ],
    [
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "agile_scarab",
        "agile_scarab",
        "agile_scarab",
        "spitting_scarab",
    ],
    [
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "scarab_swarm",
        "agile_scarab",
        "agile_scarab",
        "agile_scarab",
        "agile_scarab",
        "spitting_scarab",
        "spitting_scarab",
    ],
];

// The swarms streaming in meanwhile, more with each wave
export function getHetTrickle(wave: number): WaveDef {
    return {
        start: 0,
        spawnRate: 0.45 + wave * 0.1,
        minAlive: 0,
        maxAlive: 6 + wave * 2,
        enemies: [
            { id: "scarab_swarm", weight: 4 },
            ...(wave >= 1 ? [{ id: "agile_scarab", weight: 1 }] : []),
        ],
    };
}

// The Het room's numbers (OSRS's where it has them). The beam pulses every beamEvery seconds
// (9 ticks), shown for beamShow, burning whoever stands in it for beamDamage and enemies for
// beamEnemyDamage; reaching the Shielded statue opens the seal for `open` seconds (15 ticks),
// when it's mined, nothing else hurting it. Orbs of Darkness cross the floor every orbEvery
// seconds at orbSpeed tiles a second, hitting for orbDamage, more and quicker with the path
// level; one that crosses a mirror dirties it. Everything a room's enemies are scaled by
// (tombsRoomScale) scales the hurt too.
//  - The way round the seal turns four times: some turns have a fixed mirror, turned right, the
//    rest (placedLeast to placedMost, one more from path level 2) a spot for one of as many loose
//    mirrors, which glow. walls whole barriers (more with the path level); wornLeast or one more
//    worn ones stand on the way, each with a glowing circle beside it.
//  - Walk into a loose mirror to pick it up (as many as you like; the HUD counts them), stop on
//    an empty spot (placeReach of it) to set one down (facing "/"), for good, and walk into it to
//    turn it, as often as you like.
//  - Mining, by standing in a circle (mine.circle of its middle): a worn barrier's breaks after
//    mine.barrier seconds; the seal's ring, round its mound while it's open, takes a swing every
//    mine.every seconds for a hit in mine.hits by the hero's Mining (the shop's ranks): OSRS's
//    damage by level and pickaxe, so the seal (sealHp, more for each of the party) takes three
//    openings with none, one with the best (eight swings an opening).
export const HET = {
    beamEvery: 5.4,
    beamShow: 0.8,
    beamDamage: 3,
    beamEnemyDamage: 30,
    open: 9,
    sealHp: 119,
    placedLeast: 1,
    placedMost: 3,
    wornLeast: 1,
    walls: 3,
    placeReach: 0.6,
    mine: {
        every: 1.1,
        circle: 0.6,
        barrier: 3,
        hits: [
            [5, 7],
            [8, 10],
            [10, 12],
            [12, 15],
            [15, 17],
            [17, 19],
        ] as [number, number][],
    },
    orbEvery: 3.6,
    orbEveryLeast: 1.1,
    orbQuicker: 0.35,
    orbSpeed: 2.6,
    orbFaster: 0.3,
    orbDamage: 4,
    orbRadius: 0.55,
    decoys: 3,
    // Tiles from a mirror's middle that count as walking into it (once, till you step off)
    touchReach: 1,
    // A set-down spot's mark, a fixed mirror (the loose ones are mirrorLoc), the barriers (whole,
    // and worn), and the glowing circle (Verzik's, round the safe spot from her Doom ball) to stand
    // in, under a loose mirror too
    circleSpotAnim: 1581,
    // How bright the room is while it's on (TOMBS_LIGHTING's ambient elsewhere): dark, so the
    // beam, the caster's charge and the circles are what light it
    ambient: 0.4,
    spotLoc: 45340,
    fixedLoc: 45455,
    barrierLoc: 45458,
    wornLoc: 45462,
    // The beam's spot animations: each tile it crosses, and where it stops (2120)
    beamSpotAnims: { across: 2114, along: 2064, impact: 2120 },
    mirrorLoc: 45456,
    dirtyLoc: 45457,
};

// ---- Akkha, the Path of Het's boss ----
//
// The Guardian of Het (NPCs 11789 to 11796, size 3: idle 9760, walk 9764, his spear's animations).
// He fights one style at a time and prays against it (a form for each: melee, ranged, magic), and
// every few attacks does a special instead and changes style: Memory Blast, Simon says, or his
// trailing orbs. His prayer blocks his style's hits whole, as OSRS's overheads do (the wiki: "Akkha
// makes use of overhead protection prayers, protecting him from attacks of that style"), so one
// weapon can't do it all. At 80, 60, 40 and 20% his shadows come (hits stop there, none carried
// past) and he can't be hurt till one's dispelled and he's drawn into its quarter: only one at a
// time, the rest shielded once one's struck; at 0 he makes his final stand in a corner, out of
// reach of everything but melee, sending Unstable Orbs across.

const AKKHA_IDLE = 9760;
const AKKHA_WALK = 9764;
const AKKHA_DEATH = 9792;
// His sand, and his glowing red sand (magic)
const AKKHA_SAND = 2255;
const AKKHA_RED_SAND = 2253;
const AKKHA_SOUNDS = { attack: 5749, hit: 5639, death: 5674 };

// By quadrant, as the floor's own symbols lie once the arena's turned (OSRS's north-west fire is
// south-west here, and so on round)
export const AKKHA_ELEMENTS: AkkhaElementDef[] = [
    {
        // North-west
        name: "darkness",
        effect: {
            kind: "debuff",
            id: "akkha_darkness",
            name: "Darkness: stats drained",
            // Ahrim's staff
            iconObjId: 4710,
            stats: { might: -0.2, cooldown: -0.1 },
            seconds: 6,
        },
        spotAnim: 2257,
        orb: "akkha_orb_darkness",
        symbolLoc: 45871,
    },
    {
        // North-east
        name: "lightning",
        effect: {
            kind: "debuff",
            id: "akkha_lightning",
            name: "Lightning: your guard's down",
            // Anti-dragon shield
            iconObjId: 1540,
            stats: { armor: -8 },
            seconds: 6,
        },
        spotAnim: 2256,
        orb: "akkha_orb_lightning",
        symbolLoc: 45869,
    },
    {
        // South-east
        name: "ice",
        effect: {
            kind: "debuff",
            id: "akkha_ice",
            name: "Frozen: weapons slowed",
            // Ahrim's hood
            iconObjId: 4708,
            stats: { cooldown: -0.3 },
            seconds: 5,
        },
        spotAnim: 2259,
        orb: "akkha_orb_frozen",
        symbolLoc: 45870,
    },
    {
        // South-west
        name: "fire",
        effect: { kind: "poison", damage: 2, seconds: 5 },
        spotAnim: 2258,
        orb: "akkha_orb_burning",
        symbolLoc: 45868,
    },
];

export const AKKHA: AkkhaDef = {
    forms: ["akkha", "akkha_ranged", "akkha_magic"],
    specialEvery: 7,
    elements: AKKHA_ELEMENTS,
    memory: {
        steps: 4,
        perLevels: 2,
        most: 7,
        flash: 0.9,
        gap: 0.3,
        burst: 2.4,
        quick: 1.2,
        damage: 0.45,
        message: "Sections of the room start to glow... Remember the order!",
    },
    detonate: {
        seconds: 3,
        damage: 0.35,
        // The volatile baboon's burst
        spotAnim: 157,
        message: "You have been marked for detonation! Keep out of each other's rows and columns.",
    },
    orbs: {
        seconds: 9,
        arm: 0.6,
        radius: 0.55,
        damage: 7,
        linger: 1.2,
        message: "Magical orbs begin to materialise around you! Every step leaves one.",
    },
    shadows: {
        at: [0.8, 0.6, 0.4, 0.2],
        enemyId: "akkha_shadow",
        // Tiles his middle must be from the lines between the quarters to be in one
        inside: 1,
        // Each shadow's hitpoints, of his: OSRS's 70 to his 400
        hpShare: 70 / 400,
        corner: 5.5,
        flood: 20,
        warn: 3,
        damage: 0.5,
        message:
            "Shadows appear throughout the room! Kill one, the others are shielded once it's " +
            "struck, and draw Akkha into its quarter.",
        warnMessage: "The shadows raise their spears! Get to a quarter whose shadow is dead!",
        floodMessage: "The shadows slam their spears, flooding their quarters!",
        endMessage: "Akkha's shadows are gone. He can be hurt anywhere again!",
        struckMessage: "The other shadows shimmer, out of reach: finish this one.",
    },
};

const akkhaForm = (
    id: string,
    npcId: number,
    style: "melee" | "ranged" | "magic",
    attackSeq: number,
    attacks: BossAttackDef[],
): EnemyDef => ({
    id,
    name: "Akkha",
    npcId,
    idleSeq: AKKHA_IDLE,
    walkSeq: AKKHA_WALK,
    attackSeq,
    deathSeq: AKKHA_DEATH,
    // Up from 6,000 with his guard (Spear thrust's opens) and the raid's button
    hp: 9000,
    damage: 0,
    speed: 1.5,
    radius: 1.3,
    xp: 1200,
    knockbackResist: 1,
    solid: true,
    // His overhead: that style's hits do nothing
    protects: { styles: [style], damage: 0 },
    sounds: AKKHA_SOUNDS,
    spawnMessage: "Akkha rises to guard the path of Het!",
    boss: {
        attackInterval: 1.8,
        enrage: { message: "Akkha's armour glows: he's furious!" },
        // A spear thrust that finds no one leaves him open (opens). His prayer still holds
        // against weapons of its style; the button gets through it
        guard: TOMBS_GUARD,
        look: TOMBS_EXPOSED,
        rises: {
            times: 1,
            hp: 0.2,
            message: "Akkha merges with his shadow and makes his final stand!",
            into: "akkha_enraged",
        },
        akkha: AKKHA,
        attacks,
    },
});

// His melee swings and stamps; his ranged's sand comes in fans, his magic's red sand in rings
const AKKHA_MELEE: BossAttackDef[] = [
    {
        name: "Spear thrust",
        kind: "swing",
        damage: 8,
        windup: 0.9,
        cooldown: 0,
        range: 3.2,
        weight: 6,
        radius: 3,
        opens: 1.5,
        seq: 9770,
        sound: 5749,
    },
    {
        // A stamp that rings out from him: step through its gap or keep your distance
        name: "Stamp",
        kind: "pattern",
        damage: 5,
        windup: 0.8,
        cooldown: 5,
        range: 12,
        weight: 3,
        seq: 9788,
        sound: 5787,
        spotAnim: AKKHA_SAND,
        elemental: true,
        pattern: {
            shape: "ring",
            count: 16,
            volleys: 2,
            interval: 0.45,
            speed: 5,
            range: 12,
            radius: 0.4,
            gap: 0.7,
            gapAt: "player",
            turn: 0.2,
        },
    },
];

const AKKHA_RANGED: BossAttackDef[] = [
    {
        name: "Sand shot",
        kind: "pattern",
        damage: 5,
        windup: 0.7,
        cooldown: 0,
        range: 30,
        weight: 5,
        seq: 9772,
        sound: 5783,
        spotAnim: AKKHA_SAND,
        pattern: {
            shape: "spread",
            count: 5,
            arc: 0.9,
            volleys: 3,
            interval: 0.35,
            speed: 7,
            range: 24,
            radius: 0.4,
            track: true,
        },
    },
    {
        name: "Sandstorm",
        kind: "pattern",
        damage: 4,
        windup: 0.9,
        cooldown: 6,
        range: 30,
        weight: 3,
        seq: 9772,
        sound: 5783,
        spotAnim: AKKHA_SAND,
        pattern: {
            shape: "spiral",
            count: 6,
            volleys: 10,
            interval: 0.25,
            speed: 5,
            range: 22,
            radius: 0.4,
            turn: 0.3,
            mirror: true,
        },
    },
];

const AKKHA_MAGIC: BossAttackDef[] = [
    {
        // Rings of glowing red sand, each bringing its quadrant's element
        name: "Glowing sand",
        kind: "pattern",
        damage: 5,
        windup: 0.8,
        cooldown: 0,
        range: 30,
        weight: 5,
        seq: 9774,
        sound: 5723,
        spotAnim: AKKHA_RED_SAND,
        impactSpotAnim: 2254,
        elemental: true,
        pattern: {
            shape: "ring",
            count: 14,
            volleys: 3,
            interval: 0.5,
            speed: 5.5,
            range: 24,
            radius: 0.45,
            gap: 0.7,
            gapAt: "player",
            turn: 0.25,
        },
    },
    {
        name: "Red sand",
        kind: "pattern",
        damage: 5,
        windup: 0.8,
        cooldown: 5,
        range: 30,
        weight: 3,
        seq: 9774,
        sound: 5723,
        spotAnim: AKKHA_RED_SAND,
        impactSpotAnim: 2254,
        elemental: true,
        pattern: {
            shape: "spread",
            count: 3,
            arc: 0.5,
            volleys: 7,
            interval: 0.22,
            speed: 8,
            range: 24,
            radius: 0.45,
            track: true,
        },
    },
];

// What his final stand sends across the floor: fired by the sim (AkkhaDef.unstable), each orb
// straight on the way its arrow points, never picked as an attack
const UNSTABLE_ORBS: BossAttackDef = {
    name: "Unstable orbs",
    kind: "pattern",
    ordeal: true,
    damage: 5,
    windup: 0,
    cooldown: 0,
    range: 60,
    weight: 1,
    spotAnim: 2260,
    impactSpotAnim: 2260,
    pattern: {
        shape: "ring",
        count: 1,
        volleys: 1,
        interval: 1,
        speed: 3.2,
        range: 30,
        radius: 0.5,
        look: "akkha_unstable_orb",
    },
};

const AKKHA_FORMS: EnemyDef[] = [
    akkhaForm("akkha", 11790, "melee", 9770, AKKHA_MELEE),
    akkhaForm("akkha_ranged", 11791, "ranged", 9772, AKKHA_RANGED),
    akkhaForm("akkha_magic", 11792, "magic", 9774, AKKHA_MAGIC),
];

// His final stand: in a corner, praying against ranged and magic both, so melee's what gets him
const enragedForm = akkhaForm("akkha_enraged", 11795, "magic", 9774, [UNSTABLE_ORBS]);
const AKKHA_ENRAGED: EnemyDef = {
    ...enragedForm,
    // Mostly, not whole as OSRS's: a hero here keeps to one style, and a wizard with no melee
    // weapon would never finish him (his forms' prayers block whole: they change)
    protects: { styles: ["ranged", "magic"], damage: 0.15 },
    stationary: true,
    speed: 0,
    spawnMessage: undefined,
    boss: {
        ...enragedForm.boss!,
        rises: undefined,
        akkha: {
            ...AKKHA,
            unstable: {
                every: 0.55,
                least: 0.25,
                speed: 3.2,
                moveAfter: 0.04,
                moveSeconds: 9,
            },
        },
    },
};

// Never spawned: what his orbs are drawn as
// Each element's light, for his orbs and what's lit by them
const AKKHA_LIGHTS: Record<string, LightLook> = {
    akkha_orb_darkness: { radius: 2, color: 0xa070ff, intensity: 0.7 },
    akkha_orb_lightning: { radius: 2, color: 0xa8dcff, intensity: 0.8, flicker: 0.3 },
    akkha_orb_frozen: { radius: 2, color: 0xc8f4ff, intensity: 0.6 },
    akkha_orb_burning: { radius: 2, color: 0xff7a2a, intensity: 0.8, flicker: 0.25 },
    akkha_unstable_orb: { radius: 2, color: 0xffffff, intensity: 0.7 },
};

const akkhaLook = (id: string, name: string, npcId: number): EnemyDef => ({
    light: AKKHA_LIGHTS[id],
    id,
    name,
    npcId,
    idleSeq: 9794,
    walkSeq: 9794,
    attackSeq: 9794,
    deathSeq: 9794,
    hp: 1,
    damage: 0,
    speed: 0,
    radius: 0.5,
    xp: 0,
    sounds: { attack: -1, hit: -1, death: -1 },
});

TOMBS_ENEMIES.push(
    ...AKKHA_FORMS,
    AKKHA_ENRAGED,
    {
        // Can't fight back: it charges up to flood its quarter (AkkhaDef.shadows)
        id: "akkha_shadow",
        name: "Akkha's Shadow",
        npcId: 11797,
        idleSeq: AKKHA_IDLE,
        walkSeq: AKKHA_WALK,
        attackSeq: 9788,
        deathSeq: AKKHA_DEATH,
        // Set as it comes, a share of his (AkkhaDef.shadows.hpShare)
        hp: 150,
        damage: 0,
        speed: 0,
        radius: 1.3,
        xp: 60,
        stationary: true,
        solid: true,
        healthBar: true,
        knockbackResist: 1,
        sounds: AKKHA_SOUNDS,
    },
    akkhaLook("akkha_orb_lightning", "Orb of Lightning", 11800),
    akkhaLook("akkha_orb_darkness", "Orb of Darkness", 11801),
    akkhaLook("akkha_orb_burning", "Burning Orb", 11802),
    akkhaLook("akkha_orb_frozen", "Frozen Orb", 11803),
    akkhaLook("akkha_unstable_orb", "Unstable Orb", 11804),
);

// ---- The Scabaras room ----

// Its scarabs (11697, out of the passages in the walls, ranged as in OSRS), with Kephri's
// swarms and agile scarabs from the Het room
export const SCABARAS_ENEMIES: EnemyDef[] = [
    {
        id: "scabaras_scarab",
        name: "Scarab",
        npcId: 11697,
        idleSeq: 9586,
        walkSeq: 9584,
        attackSeq: 9585,
        deathSeq: 9598,
        hp: 12,
        damage: 2,
        speed: 2,
        radius: 0.5,
        xp: 14,
        shot: {
            range: 7,
            interval: 2.4,
            speed: 8,
            spotAnim: 2152,
            impactSpotAnim: 2154,
            sound: -1,
        },
        sounds: { attack: -1, hit: -1, death: -1 },
    },
];
TOMBS_ENEMIES.push(...SCABARAS_ENEMIES);

// Its waves: one as it starts and one for each puzzle solved, with a casket for each
export const SCABARAS_WAVES: string[][] = [
    ["scarab_swarm", "scarab_swarm", "scarab_swarm", "scarab_swarm", "scabaras_scarab"],
    [
        ...Array<string>(6).fill("scarab_swarm"),
        "scabaras_scarab",
        "scabaras_scarab",
        "agile_scarab",
    ],
    [
        ...Array<string>(6).fill("scarab_swarm"),
        "scabaras_scarab",
        "scabaras_scarab",
        "scabaras_scarab",
        "agile_scarab",
        "agile_scarab",
    ],
    [
        ...Array<string>(8).fill("scarab_swarm"),
        ...Array<string>(4).fill("scabaras_scarab"),
        "agile_scarab",
        "agile_scarab",
        "spitting_scarab",
    ],
    [
        ...Array<string>(8).fill("scarab_swarm"),
        ...Array<string>(5).fill("scabaras_scarab"),
        ...Array<string>(3).fill("agile_scarab"),
        "spitting_scarab",
        "spitting_scarab",
    ],
];

// The scarabs streaming in meanwhile, more with each wave
export function getScabarasTrickle(wave: number): WaveDef {
    return {
        start: 0,
        spawnRate: 0.4 + wave * 0.1,
        minAlive: 0,
        maxAlive: 5 + wave * 2,
        enemies: [
            { id: "scarab_swarm", weight: 3 },
            { id: "scabaras_scarab", weight: 1 + wave },
            ...(wave >= 2 ? [{ id: "agile_scarab", weight: 1 }] : []),
        ],
    };
}

// The Scabaras room's puzzles, all four to solve (OSRS's solo takes one a side and the last), as
// the wiki's strategy page has them (Tombs of Amascut/Strategies, Path of Scabaras):
//  - Sequence, Simon says: nine plates in a diamond. Push the Ancient button beside them and they
//    light up in an order (steps, one more each path level, up to most), each for flash seconds
//    with gap after; step on them in it. Push it again for another order. A wrong plate brings
//    the roof down on you, and the button's to be pushed again.
//  - Lights out: a ring of eight plates, each toggling itself and its two neighbours when stepped
//    on, scrambled by scramble presses (more with path levels). Light them all. Every darken
//    seconds (less with path levels) one goes dark again: a scarab's knocked it.
//  - Addition, once Sequence and Lights out are solved: OSRS's own board of 25 symbols
//    (additionBoard, the exit at its top), each worth 1 to 9 (Line to Foot: the slates by the way
//    in say which), and the Ancient tablet's number, targetLeast to targetMost, to make exactly by
//    walking over them, each once. Over it, the roof comes down and they reset. The wiki's chart
//    of a way across for every number works on it as it does in OSRS.
//  - Matching, last, once the others are done: two boards of nine hidden symbols, the same nine
//    on each. Step on one on each board: the same, they stay; not, the roof comes down and they
//    hide again. Solo, preSolved pairs (fewer with path levels) are done as it starts, as OSRS's
//    four are; in a party none.
// A mistake's rock takes wrongShare of your hitpoints and breaks into shards. Rocks fall on
// everyone meanwhile, every rockEvery seconds (less with path levels), for rockDamage within
// rockRadius once they land (rockWarn after they start, as 302's roof falls), breaking into
// shards: bullets out all round.
export const SCABARAS = {
    // Four plates, one more every two path levels, up to six (nine at a plate a level was more
    // than anyone could hold), each lit a little longer
    sequenceSteps: 4,
    sequenceEvery: 2,
    sequenceMost: 6,
    flash: 0.8,
    gap: 0.25,
    // From the button's push to the first plate lighting
    showAfter: 0.8,
    scramble: 3,
    darken: 14,
    darkenLeast: 6,
    targetLeast: 20,
    targetMost: 45,
    preSolved: 4,
    reveal: 1.5,
    wrongShare: 0.25,
    rockEvery: 4.5,
    rockEveryLeast: 1.8,
    rockWarn: 1.1,
    rockRadius: 1,
    rockDamage: 6,
    shards: 6,
    shardSpeed: 3.5,
    shardRange: 6,
    shardRadius: 0.4,
    shardDamage: 3,
    shardLook: "rolling_boulder",
    shardScale: 0.35,
    // Tiles from a slate's, the tablet's or the button's middle that's near enough to read or push
    // it (a plate's stood on by standing on its tile)
    slateReach: 2,
    buttonReach: 1.2,
    // A plate's stepped onto within this of its middle (each way), and off by leaving its tile
    plateInside: 0.35,
    // Seconds between the same reminder ("push the button", "solve the others first")
    hintEvery: 4,
    // Addition's board, row by row from the exit's side, west to east: each symbol's index in
    // symbolNames (its worth less one). Read off OSRS's (the wiki's screenshot), and checked
    // against its chart of solutions.
    additionBoard: [
        [8, 0, 4, 3, 2],
        [1, 0, 7, 1, 3],
        [6, 3, 2, 6, 4],
        [2, 5, 5, 1, 8],
        [8, 6, 7, 5, 0],
    ].flat(),
    rockSpotAnim: 302,
    locs: {
        // Sequence: as it stands, lit by the game, stepped on
        plate: 45340,
        plateLit: 45341,
        platePressed: 45342,
        // Lights out: the plate, and its light
        lightsPlate: 45344,
        lightsOn: 45384,
        // Addition's symbols, Line (1) to Foot (9), and the glow on one stepped on
        symbols: [45345, 45346, 45347, 45348, 45349, 45350, 45351, 45352, 45353],
        stepped: 45386,
        // Matching: a hidden tile, the nine symbols shown, and a matched pair's glow
        hidden: 45356,
        shown: [45365, 45366, 45367, 45368, 45369, 45370, 45371, 45372, 45373],
        matched: 45387,
        tablet: 45339,
        // Sequence's Ancient button
        button: 45338,
    },
    symbolNames: [
        "Line",
        "Knives",
        "Triangle",
        "Diamond",
        "Hand",
        "Bird",
        "Crook",
        "Wiggle",
        "Foot",
    ],
};

// ---- Kephri, the Path of Scabaras's boss ----

// The giant dawn scarab (NPCs 11719 to 11722, size 5, model 46417): 11719 behind her swarm's
// shield, 11720 dazed while it's down, 11721 once it's gone for good. She never moves. Her
// fireball is Vorkath's firebomb (2167), her eggs her own projectiles (2164, 2165).
const KEPHRI_IDLE = 9572;
const KEPHRI_DEATH = 9582;
const KEPHRI_SOUNDS = { attack: -1, hit: -1, death: -1 };
// Her scarabs' green spit (the Spitting Scarab's projectile, 2152)
const SCARAB_SPIT = 2152;

export const KEPHRI: KephriDef = {
    // Three shields, as OSRS has her: each takes share of her hitpoints in hits, and her own
    // hitpoints aren't touched till the third's gone and she rises for her last. A swarm that
    // reaches her overcharges the next (swarm.shield of it, overcharge at most)
    // The Soldier Scarab's heals feed her shield this much of one each, before her last
    shields: { count: 3, share: 1 / 3, overcharge: 0.15, soldierFeed: 0.06 },
    intermissions: {
        // After the first two shields break: dazed, she can't be hurt while swarms (swarms of
        // them) rush in to restore it, and her overlords come (moreOverlords too, with More
        // Overlords). It's over once the swarms are all in or dead and the overlords are dead.
        swarms: [28, 24],
        overlords: [["kephri_spitting"], ["kephri_soldier", "kephri_arcane"]],
        moreOverlords: [["kephri_soldier"], ["kephri_spitting"]],
        message: "Kephri's shield breaks! She's dazed, and her swarms rush in to restore it!",
        endMessage: "Kephri's swarm shield reforms around her!",
    },
    swarm: {
        enemyId: "kephri_swarm",
        // A share of her shield each adds, reaching her (of her hitpoints, on her last), and how
        // near is reaching. A tenth: with Medic!, sending them between her intermissions too,
        // that's hard, as OSRS's Medic! is
        shield: 0.1,
        heal: 0.015,
        reach: 1.2,
        // Seconds between each one (the first four, then the next, and so on: 4 game ticks, then
        // 3, 2, then 1 for the rest)
        cadence: [2.4, 1.8, 1.2, 0.6],
        // From this path level, now and then three at once (more often two levels on)
        trios: 2,
        // Medic!: one this often outside her intermissions too, at half speed
        medic: 4,
    },
    dung: {
        every: 11,
        least: 6,
        // The flies round you for warn seconds (2146), then you're thrown back from her up to
        // knock tiles, stunned stun seconds, for damage, with dung dropped every gap tiles along
        // the way: solid, radius across, for seconds
        warn: 1.8,
        // Her arena's small: six tiles put you against a wall nearly every time, where the throw
        // moved you nowhere and her next Fireball landed on you still stunned
        knock: 3,
        // Shorter than a Fireball's windup, so one begun while you're down can still be stepped
        // out of (two seconds made the pair a hit nobody could help)
        stun: 0.8,
        damage: 6,
        gap: 1.4,
        radius: 0.65,
        seconds: 10,
        spotAnim: 2146,
        dropSpotAnim: 2145,
        pileLoc: 45504,
        message: "Flies swarm round you: Kephri's about to throw you back!",
        thrownMessage: "Kephri throws you back!",
    },
    eggs: {
        // The light egg goes off fuse seconds after it lands unless it's broken, in a 3 by 3,
        // breaking into shards (the dark one hatches an Agile Scarab: EnemyDef.hatches)
        explodeId: "kephri_egg_explode",
        fuse: 5,
        radius: 1.5,
        damage: 8,
        spotAnim: 2166,
    },
    arcane: {
        enemyId: "kephri_arcane",
        // Charging its red swarm for charge seconds (2149), then a ring of it out all round. Hit
        // for disperse of its hitpoints meanwhile, it flies off to the next of spots (tiles from
        // Kephri) and starts again.
        charge: 7,
        disperse: 0.2,
        spotAnim: 2149,
        // South-east of her, then north-west, the middle of the south, north-east, as OSRS's
        spots: [
            [5, -5],
            [-5, 5],
            [0, -6],
            [5, 5],
        ],
        message: "The Arcane Scarab charges its swarm!",
    },
    // Where her overlords come in, in tiles from her (she's in the middle of her arena): the
    // Spitting Scarab north-east, the Soldier east, the Arcane south-east, as OSRS's
    overlordAt: {
        kephri_spitting: [5, 5],
        kephri_soldier: [6, 0],
        kephri_arcane: [5, -5],
    },
    finalMessage: "Kephri's swarm is gone: she's open to attack, and throws everyone back!",
};

// Her specials as attacks, which no boss uses but which fire bullets as hers: the Arcane
// Scarab's swarm going off, and an egg going off
export const KEPHRI_ARCANE_BLAST: BossAttackDef = {
    name: "Arcane swarm",
    kind: "blast",
    damage: 6,
    windup: 0,
    cooldown: 0,
    range: 30,
    weight: 0,
    spotAnim: 2153,
    shards: { count: 24, speed: 3.5, range: 12, radius: 0.45, damage: 6, spotAnim: 2153 },
};
export const KEPHRI_EGG_BLAST: BossAttackDef = {
    name: "Egg",
    kind: "blast",
    damage: 4,
    windup: 0,
    cooldown: 0,
    range: 30,
    weight: 0,
    spotAnim: SCARAB_SPIT,
    shards: { count: 8, speed: 4, range: 7, radius: 0.4, damage: 3, spotAnim: SCARAB_SPIT },
};

const KEPHRI_ATTACKS: BossAttackDef[] = [
    {
        // Into the air and down on where you stood, under its shadow, breaking up (Aerial
        // Assault: bigger and harder), twice over
        name: "Fireball",
        kind: "blast",
        damage: 7,
        windup: 1.8,
        cooldown: 0,
        range: 30,
        weight: 6,
        radius: 1,
        shadow: {},
        spotAnim: 2167,
        impactSpotAnim: 2157,
        chain: { times: 1, windup: 0.9 },
        shards: {
            count: 8,
            speed: 4,
            range: 7,
            radius: 0.4,
            damage: 3,
            spotAnim: 2167,
            scale: 0.5,
        },
        invoked: { id: "aerial_assault", radius: 1.5, damage: 1.3 },
        seq: 9575,
    },
    {
        // Spit all round from her, a way through each ring
        name: "Scarab spit",
        kind: "pattern",
        damage: 4,
        windup: 0.8,
        cooldown: 3,
        range: 30,
        weight: 4,
        seq: 9576,
        spotAnim: SCARAB_SPIT,
        pattern: {
            shape: "ring",
            count: 18,
            volleys: 3,
            interval: 0.55,
            speed: 5,
            range: 16,
            radius: 0.4,
            gap: 0.6,
            gapAt: "player",
            turn: 0.15,
        },
    },
    {
        // Her swarm wheeling out from her both ways
        name: "Swarm spiral",
        kind: "pattern",
        damage: 4,
        windup: 0.8,
        cooldown: 6,
        range: 30,
        weight: 3,
        seq: 9577,
        spotAnim: 2153,
        pattern: {
            shape: "spiral",
            count: 5,
            volleys: 12,
            interval: 0.25,
            speed: 4.5,
            range: 16,
            radius: 0.4,
            turn: 0.28,
            mirror: true,
        },
    },
    {
        // Eggs splattered round the arena: dark ones hatch, the light one goes off (Lively
        // Larvae: more dark ones)
        name: "Mass Incubation",
        kind: "summon",
        damage: 0,
        // Rearing up to lay, her guard down the while: the button stops the eggs
        windup: 3,
        channel: { stagger: 2.5, broken: "The eggs go cold!" },
        cooldown: 12,
        range: 30,
        weight: 2,
        seq: 9578,
        summon: {
            enemyId: "kephri_egg_hatch",
            count: 2,
            alsoId: "kephri_egg_explode",
            thrown: { seconds: 1 },
            distance: 5,
        },
        invoked: { id: "lively_larvae", count: 2 },
        message: "Kephri splatters eggs round the arena: break them!",
    },
];

const kephriForm = (id: string, npcId: number, hp: number, rises: boolean): EnemyDef => ({
    id,
    name: "Kephri",
    npcId,
    idleSeq: KEPHRI_IDLE,
    walkSeq: KEPHRI_IDLE,
    attackSeq: 9575,
    deathSeq: KEPHRI_DEATH,
    hp,
    damage: 0,
    speed: 0,
    radius: 2.5,
    xp: 1500,
    knockbackResist: 1,
    stationary: true,
    solid: true,
    // Dazed (11720) while her shield's down and she can't be hurt (Sim.stepKephri)
    shield: { seconds: 0, look: { npcId: 11720, idleSeq: 9580 } },
    sounds: KEPHRI_SOUNDS,
    spawnMessage: "Kephri rises to guard the path of Scabaras!",
    boss: {
        attackInterval: 2.2,
        enrage: { message: "Kephri buzzes in a fury!" },
        // Open while she rears up to lay (Mass Incubation's channel), and the button breaks it
        guard: TOMBS_GUARD,
        look: TOMBS_EXPOSED,
        ...(rises && {
            rises: {
                times: 1,
                hp: 0.25,
                message: "Kephri's swarm is spent... but she isn't!",
                into: "kephri_final",
            },
        }),
        kephri: KEPHRI,
        attacks: KEPHRI_ATTACKS,
    },
});

const scarab = (id: string, name: string, npcId: number, more: Partial<EnemyDef>): EnemyDef => ({
    id,
    name,
    npcId,
    idleSeq: 9586,
    walkSeq: 9584,
    attackSeq: 9585,
    deathSeq: 9598,
    hp: 260,
    damage: 4,
    speed: 1.4,
    radius: 1.3,
    xp: 120,
    knockbackResist: 0.8,
    healthBar: true,
    sounds: { attack: -1, hit: -1, death: -1 },
    ...more,
});

TOMBS_ENEMIES.push(
    // Up from 7,000 with her guard (Mass Incubation's channel) and the raid's button
    kephriForm("kephri", 11719, 8400, true),
    kephriForm("kephri_final", 11721, 8400, false),
    {
        // Walks to her and restores her shield if it gets there (Sim.stepKephri): anything kills it
        id: "kephri_swarm",
        name: "Scarab Swarm",
        npcId: 11723,
        idleSeq: 9606,
        walkSeq: 9606,
        attackSeq: 9605,
        deathSeq: 9608,
        hp: 4,
        damage: 0,
        speed: 2.2,
        radius: 0.4,
        xp: 4,
        heals: {
            fraction: 0,
            interval: 99,
            range: 1,
            targets: ["kephri", "kephri_final"],
            seek: 40,
        },
        sounds: { attack: -1, hit: -1, death: -1 },
    },
    // Her overlords: the Spitting Scarab's poison spit, the Soldier's slashes and the swarm it
    // sends her every few seconds, and the Arcane Scarab, which only charges (Sim.stepKephri)
    scarab("kephri_spitting", "Spitting Scarab", 11725, {
        stationary: true,
        shot: {
            range: 10,
            interval: 1.8,
            speed: 7,
            spotAnim: 2153,
            impactSpotAnim: 2155,
            sound: -1,
        },
        touches: { kind: "poison", damage: 2, seconds: 6 },
    }),
    scarab("kephri_soldier", "Soldier Scarab", 11724, {
        damage: 9,
        speed: 1.8,
        heals: {
            fraction: 0.02,
            interval: 5,
            range: 40,
            targets: ["kephri", "kephri_final"],
            seek: 0.1,
            spotAnim: 2150,
        },
    }),
    scarab("kephri_arcane", "Arcane Scarab", 11726, {
        idleSeq: 9594,
        walkSeq: 9592,
        attackSeq: 9594,
        damage: 0,
        speed: 0,
        stationary: true,
    }),
    {
        id: "kephri_egg_hatch",
        name: "Egg",
        npcId: 11729,
        idleSeq: -1,
        walkSeq: -1,
        attackSeq: -1,
        deathSeq: -1,
        hp: 10,
        damage: 0,
        speed: 0,
        radius: 0.5,
        xp: 6,
        stationary: true,
        hatches: { seconds: 6, into: "agile_scarab", count: 1, spotAnim: 2166 },
        sounds: { attack: -1, hit: -1, death: -1 },
    },
    {
        // Goes off as it would hatch (Sim.stepKephri), unless it's broken first
        id: "kephri_egg_explode",
        name: "Egg",
        npcId: 11728,
        idleSeq: -1,
        walkSeq: -1,
        attackSeq: -1,
        deathSeq: -1,
        hp: 10,
        damage: 0,
        speed: 0,
        radius: 0.4,
        xp: 6,
        stationary: true,
        healthBar: true,
        hatches: { seconds: KEPHRI.eggs.fuse, into: "kephri_swarm", count: 0 },
        sounds: { attack: -1, hit: -1, death: -1 },
    },
);

// ---- The Crondis room ----

// The Palm of Resourcefulness, one form for each stage of its growth (11700 to 11704): never
// hurt, its bar its growth (Sim.stepCrondis), and what the hungry crocodiles go for
export const CRONDIS_PALMS = [11700, 11701, 11702, 11703, 11704].map(
    (npcId, stage): EnemyDef => ({
        id: "crondis_palm_" + stage,
        name: "Palm of Resourcefulness",
        npcId,
        idleSeq: -1,
        walkSeq: -1,
        attackSeq: -1,
        deathSeq: -1,
        hp: 1000,
        damage: 0,
        speed: 0,
        radius: 2.2,
        xp: 0,
        knockbackResist: 1,
        stationary: true,
        solid: true,
        healthBar: true,
        shield: { seconds: 0 },
        sounds: { attack: -1, hit: -1, death: -1 },
    }),
);

const crocodile = (id: string, more: Partial<EnemyDef>): EnemyDef => ({
    id,
    name: "Crocodile",
    npcId: 11705,
    idleSeq: 2037,
    walkSeq: 2036,
    attackSeq: 2039,
    deathSeq: 2038,
    hp: 30,
    damage: 4,
    speed: 1.9,
    radius: 0.9,
    xp: 22,
    sounds: { attack: -1, hit: -1, death: -1 },
    ...more,
});

export const CRONDIS_ENEMIES: EnemyDef[] = [
    ...CRONDIS_PALMS,
    // Never spawned: what the room's spears and poison hit as
    {
        id: "crondis_trap",
        name: "Trap",
        npcId: 11705,
        idleSeq: -1,
        walkSeq: -1,
        attackSeq: -1,
        deathSeq: -1,
        hp: 1,
        damage: 0,
        speed: 0,
        radius: 0.5,
        xp: 0,
        sounds: { attack: -1, hit: -1, death: -1 },
    },
    // Its bite spills half your water (Sim.crondisSpill)
    crocodile("crondis_crocodile", {}),
    // Makes for the palm, and eats its growth there (heals' walk, Sim.stepCrondis)
    crocodile("crondis_crocodile_hungry", {
        speed: 1.6,
        heals: {
            fraction: 0,
            interval: 99,
            range: 1,
            targets: CRONDIS_PALMS.map((palm) => palm.id),
            seek: 60,
        },
    }),
];
TOMBS_ENEMIES.push(...CRONDIS_ENEMIES);

// Its waves: one as it starts, and one each time the palm grows a stage, with a casket for each
export const CRONDIS_WAVES: string[][] = [
    ["crondis_crocodile", "crondis_crocodile", "crondis_crocodile_hungry"],
    [
        "crondis_crocodile",
        "crondis_crocodile",
        "crondis_crocodile",
        "crondis_crocodile_hungry",
        "crondis_crocodile_hungry",
    ],
    [
        ...Array<string>(5).fill("crondis_crocodile"),
        "crondis_crocodile_hungry",
        "crondis_crocodile_hungry",
        "agile_scarab",
    ],
    [
        ...Array<string>(6).fill("crondis_crocodile"),
        ...Array<string>(3).fill("crondis_crocodile_hungry"),
        "agile_scarab",
        "agile_scarab",
    ],
    [
        ...Array<string>(7).fill("crondis_crocodile"),
        ...Array<string>(4).fill("crondis_crocodile_hungry"),
        "agile_scarab",
        "agile_scarab",
    ],
];

// The crocodiles crawling in meanwhile, more with each wave
export function getCrondisTrickle(wave: number): WaveDef {
    return {
        start: 0,
        spawnRate: 0.3 + wave * 0.08,
        minAlive: 0,
        maxAlive: 4 + wave * 2,
        enemies: [
            { id: "crondis_crocodile", weight: 3 },
            { id: "crondis_crocodile_hungry", weight: 1 },
        ],
    };
}

// The Crondis room's numbers. The palm needs goal water (perHero more for each of the party
// after the first, perLevel more each path level), and grows a stage each quarter of it: each a
// casket and the next wave. You carry up to carry water; standing fill seconds at a waterfall
// fills it, and it's dry refill seconds after. Within pour tiles of the palm's edge you pour.
// Its corridors' spear statues thrust out across their rows one pair at a time down the
// corridor, every spearStep seconds, sides turn about, then rest spearRest: a tell (the statue
// flashing) spearTell before, out for spearHold, for spearDamage. Poison clouds come down a
// corridor from its waterfall's end every cloudEvery seconds (less with path levels), cloudSpeed
// tiles a second: the pale ones first, the dark ones cloudBehind seconds after, cloudLength tiles
// of them, for cloudDamage. Any trap's hit, or a crocodile's bite, spills spill of your water,
// and a trap weakens you (weakened). Hungry crocodiles at the palm eat eat water a second.
export const CRONDIS = {
    goal: 300,
    perHero: 120,
    perLevel: 40,
    carry: 100,
    fill: 1,
    refill: 10,
    pour: 1.8,
    spearStep: 0.45,
    spearRest: 1.4,
    spearTell: 0.5,
    spearHold: 0.5,
    spearDamage: 5,
    cloudEvery: 9,
    // No closer than this: a cloud fills its corridor and comes faster than you walk, so a trip
    // in to the waterfall has to fit between two (meeting them head on, the gap's about half
    // this), with time to fill
    cloudEveryLeast: 7,
    cloudSpeed: 3.5,
    cloudBehind: 1.1,
    cloudLength: 3,
    cloudDamage: 4,
    spill: 0.5,
    eat: 6,
    weakened: {
        kind: "debuff",
        id: "crondis_trap",
        name: "Hit by a trap",
        iconObjId: 27295,
        stats: { armor: -3, moveSpeed: -0.1 },
        seconds: 8,
    } as PlayerEffectDef,
    // The waterfall, as it runs and dry; the spear statues' spear; the poison, the Spitting
    // Scarab's green splash (2155: the room's own, 2129 to 2131, draw nothing as spot
    // animations), faint while it's the warning; the water as it's poured (Water Wave's splash)
    locs: { waterfall: 45398, dry: 45399, spear: 45416, statue: 45415 },
    spotAnims: { pale: 2155, dark: 2155, pour: 163 },
    paleAlpha: 0.35,
    // The water container, for the HUD
    containerObjId: 27295,
};

// ---- Zebak, the Path of Crondis's boss ----

// The great crocodile (11730, size 9, model 46399), lying in the water north of his island:
// he never moves. His magic is a pot that splits into red orbs (2176, 2181), his ranged a rock
// that splinters (2178, 2182), and he sprays acid (2194). At 85, 70, 55 and 40% he does a special,
// turn about: his Great Roar or his Tidal Waves, each with acid and jugs spat over the island
// (ZebakDef; Sim.stepZebak). Over all of it: his jaws down a strip of the island, open when they
// miss, his swells rolling down it with a gap, and in three phases, each quicker and with more
// (his crocodiles from the second, his enraged roar and a flurry of jaws in the dark of the last).
const ZEBAK_SOUNDS = { attack: -1, hit: -1, death: -1 };

export const ZEBAK: ZebakDef = {
    specials: [0.85, 0.7, 0.55, 0.4],
    acid: {
        // Pools spat over the island (more with path levels), each 3 by 3 (5 by 5 with Upset
        // Stomach), there till a jug's water or a wave clears it; standing in one hurts, more
        // the longer you stand, and poisons
        count: 6,
        half: 1,
        upsetHalf: 2,
        damage: 2,
        ramp: 0.6,
        poison: { kind: "poison", damage: 2, seconds: 4 },
        loc: 45570,
    },
    jugs: {
        enemyId: "zebak_jug",
        count: 3,
        // Walk into one and it rolls off the way you pushed it, speed tiles a second, up to
        // reach tiles, breaking on a boulder or the island's edge: its water clears acid within
        // water tiles each way (less with Upset Stomach). Weapons pass it by.
        speed: 6,
        reach: 6,
        water: 2,
        upsetWater: 1,
        breakSpotAnim: 2192,
        splashSpotAnim: 2193,
    },
    roar: {
        // Boulders across the island, then after seconds the roar: hits times, each hit share of
        // your hitpoints and a knock back from him, unless a boulder's between you and him within
        // shelter tiles
        boulders: 3,
        seconds: 9,
        hits: 3,
        share: 0.2,
        knock: 2.5,
        shelter: 3,
        look: "zebak_boulder",
        radius: 0.8,
        spotAnim: 2184,
        seq: 9628,
        message: "Zebak spits boulders onto the island: get behind one before he roars!",
        roarMessage: "Zebak roars!",
    },
    waves: {
        // Waves across the island, the first up from the south and the second down from the
        // north, each with a gap (tiles wide, a tile narrower each two path levels, least
        // leastGap) to stand in; speed tiles a second, damage, and a shove the way it's going
        count: 2,
        gap: 4,
        leastGap: 2,
        speed: 3,
        delay: 2.5,
        damage: 6,
        shove: 2,
        look: "zebak_wave",
        seq: 9630,
        message: "Zebak slams his tail: tidal waves! Find the gap!",
    },
    clouds: {
        // Not Just a Head: blood clouds up the Rock steps every every seconds, after a hero,
        // losing drain hitpoints a tile they go; a hit from one heals him heal times it (more
        // with Arterial Spray). Blood Thinners: three.
        enemyId: "zebak_blood_cloud",
        every: 16,
        drain: 3,
        heal: 2,
        arterial: 3.5,
        message: "Blood clouds rise from the water!",
    },
};

// A danger mark's glow, cool against the tomb's warm floor (a red one loses itself on it)
const MARK_LIGHT: LightLook = { radius: 1.6, color: 0x9fd0ff, intensity: 0.55 };
// His jaws: a strip from his head down the island (a line counts from his middle, so 12 is about
// 9 tiles onto it past his body). A miss leaves his head on the island's edge, open (opens).
// No bite of his own in the cache (find-npc-seqs 11730): his rock spit's head forward is it.
const ZEBAK_JAWS: BossAttackDef = {
    name: "Jaws",
    kind: "swing",
    damage: 7,
    windup: 1.2,
    cooldown: 5,
    range: 40,
    weight: 4,
    line: { width: 3, length: 12 },
    opens: 2,
    light: MARK_LIGHT,
    seq: 9620,
    // The water thrown up down his strip, his jug's splash where his jaws come down
    impact: { trail: { spotAnim: 2184, fit: 1 }, spots: [{ spotAnim: 2193 }], shake: 0.3 },
    phases: [1],
};
const ZEBAK_POT: BossAttackDef = {
    // A pot up into the air and down on where you stood, splitting into red orbs
    name: "Magic pot",
    kind: "blast",
    damage: 5,
    windup: 1.6,
    cooldown: 0,
    range: 40,
    weight: 4,
    radius: 1.1,
    shadow: {},
    light: MARK_LIGHT,
    spotAnim: 2176,
    impactSpotAnim: 2186,
    shards: { count: 6, speed: 4, range: 8, radius: 0.4, damage: 3, spotAnim: 2181, bright: 0.5 },
    seq: 9624,
    phases: [1],
};
// The Swell: a wall of his waves down the island from its top edge, with a way through, rolling
// on through everything (an ambient: BossPhasesDef ambients). Its crest rises a moment first.
const ZEBAK_SWELL: BossAttackDef = {
    name: "Swell",
    kind: "pattern",
    damage: 4,
    windup: 0.6,
    cooldown: 0,
    range: 40,
    weight: 0,
    seq: 9630,
    invoked: { id: "upset_stomach", speed: 1.25 },
    pattern: {
        shape: "wall",
        heading: "south",
        count: 11,
        spacing: 1.8,
        gap: 1,
        volleys: 1,
        interval: 2,
        speed: 3,
        range: 22,
        radius: 0.7,
        from: 2.5,
        look: "zebak_wave",
        knockback: 1.5,
        bright: 0.5,
        delay: 1.2,
    },
};

const ZEBAK_ATTACKS: BossAttackDef[] = [
    ZEBAK_JAWS,
    // Then (his second phase on): a shadow where you stepped to
    { ...ZEBAK_JAWS, follow: { attack: "Rock spit", delay: 0.4 }, phases: [2, 3] },
    // His second phase's opener: twice, aimed again for the second
    {
        ...ZEBAK_JAWS,
        name: "Twin jaws",
        cooldown: 6,
        weight: 3,
        chain: { times: 1, windup: 1.0 },
        phases: [2, 3],
    },
    // His last phase's: three, each strip turning after you a moment, then locked
    {
        ...ZEBAK_JAWS,
        name: "Jaw flurry",
        cooldown: 7,
        weight: 3,
        line: { width: 3, length: 12, track: 0.3 },
        chain: { times: 2, windup: 0.9 },
        phases: [3],
    },
    ZEBAK_POT,
    // Then (his second phase on): his acid at where you went
    { ...ZEBAK_POT, follow: { attack: "Acid spray", delay: 0.6 }, phases: [2, 3] },
    {
        // A rock spat at you that splinters where it lands
        name: "Rock spit",
        kind: "blast",
        damage: 5,
        windup: 1.4,
        cooldown: 0,
        range: 40,
        weight: 4,
        radius: 1.2,
        shadow: {},
        light: MARK_LIGHT,
        spotAnim: 2178,
        impactSpotAnim: 2185,
        shards: {
            count: 6,
            speed: 4.5,
            range: 8,
            radius: 0.4,
            damage: 3,
            spotAnim: 2182,
            scale: 3,
            bright: 0.6,
        },
        seq: 9620,
    },
    {
        // Acid sprayed across the island in a fan, aimed where you are: two volleys, the same way
        name: "Acid spray",
        kind: "pattern",
        damage: 3,
        windup: 0.9,
        cooldown: 4,
        range: 40,
        weight: 3,
        seq: 9622,
        spotAnim: 2194,
        pattern: {
            shape: "spread",
            count: 7,
            volleys: 2,
            interval: 0.4,
            speed: 6,
            range: 30,
            radius: 0.45,
            arc: 1.2,
            bright: 0.5,
        },
    },
    {
        // His second phase on: crocodiles up out of the water onto the island (ringed round him,
        // so only where it's dry), each snapping down a strip of its own as his jaws come
        name: "Crocodiles",
        kind: "summon",
        damage: 0,
        windup: 1.2,
        cooldown: 22,
        range: 40,
        weight: 2,
        seq: 9622,
        summon: { enemyId: "zebak_croc", count: 2, distance: 7 },
        message: "Crocodiles climb onto the island!",
        phases: [2, 3],
    },
    {
        // His last phase: his roar's dust all round, a way through
        name: "Roar",
        kind: "pattern",
        damage: 3,
        windup: 0.8,
        cooldown: 3,
        range: 40,
        weight: 3,
        seq: 9628,
        spotAnim: 2181,
        pattern: {
            shape: "ring",
            count: 26,
            volleys: 2,
            interval: 0.5,
            speed: 5,
            range: 30,
            radius: 0.45,
            gap: 0.8,
            gapAt: "player",
            bright: 0.5,
        },
        phases: [3],
    },
    ZEBAK_SWELL,
    // His last phase's swell, two ranks a gap each
    {
        ...ZEBAK_SWELL,
        name: "Twin swell",
        pattern: { ...ZEBAK_SWELL.pattern!, volleys: 2 },
    },
];

// What draws, but never fights: a boulder to shelter behind, and a tidal wave's crest
// ---- The Wardens ----

// Phase one (WardensDef; Sim.stepWardens): the obelisk in the middle of their room is what's
// fought, while it charges the two Wardens either side through the troughs, and they take turns at
// pyramids over half the floor and a slow shot that finds you. When it breaks, the Warden with the
// more charge is the one that wakes. Timings from OSRS (a tick is 0.6 seconds).
export const WARDENS: WardensDef = {
    obeliskId: "wardens_obelisk",
    wardens: {
        elidinis: {
            enemyId: "elidinis_warden_dormant",
            name: "Elidinis' Warden",
            pyramid: 45750,
            pyramidsSpotAnim: 2214,
            shotSeal: 2215,
            shotSpotAnim: 2238,
            // Its shot hits harder than Tumeken's (45 and 30 at most, solo, in OSRS)
            shotShare: 0.3,
        },
        tumeken: {
            enemyId: "tumeken_warden_dormant",
            name: "Tumeken's Warden",
            pyramid: 45751,
            pyramidsSpotAnim: 2214,
            shotSeal: 2215,
            shotSpotAnim: 2237,
            shotShare: 0.2,
        },
    },
    orbs: {
        lookId: "wardens_energy",
        every: 1.2,
        stepSeconds: 0.6,
        steps: 8,
        soak: { reach: 0.9, max: 5, bonus: 0.2, fade: 4, overShare: 0.1 },
    },
    charge: {
        // Each starts this far charged, so the first attacks come early: Elidinis' ahead, so the
        // two never discharge together (both sets of pyramids at once leave no cell clear, and
        // both shots at once are half a bar), unless a player's soaking brings them level
        start: { elidinis: 50, tumeken: 0 },
        full: 125,
        perSecond: 2 / 0.6,
        perOrb: 4,
        haste: { perSecond: 3 / 0.6, perOrb: 6 },
        platforms: Array.from({ length: 21 }, (_, i) => 45606 + i),
    },
    discharge: { seq: 9667, pause: 1.8 },
    pyramids: {
        cell: 3,
        cols: 7,
        rows: 9,
        from: { x: 1, y: -1 },
        appear: 1.8,
        firstHit: 3.6,
        lastHit: 6,
        every: 0.6,
        leave: 6.6,
        damage: 4,
    },
    shot: { flight: 8, impactSpotAnim: 1605 },
    // The obelisk won't go below this share of its hitpoints till a Warden's pyramids have come
    // and gone: OSRS's lasts long enough that they always do, and a run with little to hit it
    // with at Entry, where it's weakest, broke it before either Warden had charged
    holdShare: 0.25,
    startDelay: 3,
    message: "The obelisk ignites! Soak a Warden's orbs for power against it, and break it.",
    endMessage: "The obelisk shatters!",
    two: {
        wake: 4,
        wakeSeq: 9663,
        // Its real hitpoints, which only its core's hits (five times over) take: down three or
        // four times with the best of everything at Expert, many more for a run that's bought
        // nothing at Entry (the raid level's boss scale does the rest)
        hp: 50000,
        forms: {
            // Elidinis' wakes open to magic, Tumeken's to ranged
            elidinis: {
                styles: ["magic", "ranged"],
                forms: ["elidinis_warden_magic", "elidinis_warden_ranged"],
                exposed: "elidinis_warden_exposed",
                core: "elidinis_warden_core",
                wreck: "tumeken_warden_wreck",
            },
            tumeken: {
                styles: ["ranged", "magic"],
                forms: ["tumeken_warden_ranged", "tumeken_warden_magic"],
                exposed: "tumeken_warden_exposed",
                core: "tumeken_warden_core",
                wreck: "elidinis_warden_wreck",
            },
        },
        obeliskId: "wardens_obelisk_charged",
        // Up from 0.035 with its guard (Tumeken's slash), which fills it twice as fast
        shield: 0.045,
        coreMultiplier: 5,
        distance: 3.5,
        // OSRS's 21, 29 and 37 ticks, at 100 to 80%, 80 to 60% and under
        seconds: [12.6, 17.4, 22.2],
        below: [0.8, 0.6],
        kneelSeq: 9670,
        standSeq: 9672,
        kneel: 3,
        stand: 2.4,
        deathSeq: 9662,
        toLast: 5,
        obelisk: {
            // Sooner than OSRS's 36 ticks from the Warden's up and 30 after each special: it
            // keeps on while the core's out here, and its shield fills quicker than OSRS's
            firstOpen: 9,
            every: 9,
            warn: 2.4,
            openSeq: 9728,
            closeSeq: 9729,
            damage: 0.14,
        },
        // Drawn as the tiles glowing red, as the video of it shows (its own spot animations,
        // 2234 and 2235, barely show from this camera), and the windmill's strike as the
        // Wardens' red lightning
        beam: { warnSpotAnim: 2199, spotAnim: 2236, step: 0.6, rings: 12, wide: 10, pause: 3.6 },
        windmill: {
            warnSpotAnim: 2200,
            glowSpotAnim: 2236,
            spotAnim: 2197,
            every: 1.8,
            strikeAfter: 1.8,
            rounds: 12,
        },
        skulls: {
            warnSpotAnim: 2198,
            projectile: 2225,
            shadowSpotAnim: 1447,
            spotAnim: 2198,
            count: 10,
            every: 1.2,
            flight: 2.4,
            strikeAfter: 2.4,
            half: 3,
        },
        message:
            "The obelisk crackles with power. Fill the Warden's shield with the style it's open to, then hit its core!",
        kneelMessage: "The Warden's core is exposed! Hit the core!",
        standMessage: "The Warden takes its core back, and its defences shift!",
        endMessage: "uses the last of its power to restore",
    },
    three: {
        // Up from 25,000 with its guard down for the restart after every siphon's stopped
        hp: 30000,
        forms: {
            // The Warden that comes back is the one that fell in the first phase, with the
            // phantoms of its own two paths' bosses
            elidinis: {
                form: "elidinis_warden_last",
                charging: "elidinis_warden_charging",
                phantoms: ["akkhas_phantom", "kephris_phantom"],
            },
            tumeken: {
                form: "tumeken_warden_last",
                charging: "tumeken_warden_charging",
                phantoms: ["zebaks_phantom", "babas_phantom"],
            },
        },
        amascut: {
            enemyId: "amascuts_phantom",
            enragedId: "amascuts_phantom_enraged",
            offset: 9,
        },
        // 7 ticks, and 6 under half its hitpoints; Overclocked 5, Overclocked 2 4, Insanity 3
        every: 4.2,
        quicker: 3.6,
        invoked: { overclocked: 3, overclocked2: 2.4, insanity: 1.8 },
        rowSeconds: 0.1,
        slamSeqs: { east: 9674, west: 9676, both: 9678 },
        at: [0.8, 0.6, 0.4, 0.2],
        // Siphons for one player (one more each for every other): seven for one, four tiles
        // apart on a floor this size, couldn't be reached in the window, so every fourth charge
        // was a ripple nobody could help
        count: [3, 4, 4, 5],
        // The shapes they land in, a different one each charge and mirrored at random: each a
        // set of lines, in tiles from the middle of the row in front of the Warden (x east, y
        // north, so in front's below 0), the siphons spread evenly along them. A line slanting
        // across, a V pointing at it, a row, and two staggered lines, as the OSRS Wiki's
        // screenshot of them has them
        formations: [
            [
                [
                    [-9, -2],
                    [9, -10],
                ],
            ],
            [
                [
                    [-9, -9],
                    [0, -2],
                    [9, -9],
                ],
            ],
            [
                [
                    [-11, -6],
                    [11, -6],
                ],
            ],
            [
                [
                    [-11, -9],
                    [-3, -3],
                ],
                [
                    [1, -10],
                    [9, -4],
                ],
            ],
        ],
        window: 10.8,
        insanityWindow: 4.8,
        siphon: {
            enemyId: "wardens_siphon",
            reversed: "wardens_siphon_reversed",
            reach: 0.9,
            beamSpotAnim: 2227,
            skull: 2226,
        },
        chargeSeq: 9682,
        staggerSeq: 9680,
        releaseSeq: 9681,
        // Of its hitpoints, all the siphons stopped
        stagger: 0.05,
        restart: 5.4,
        phantomSpotAnim: 2219,
        // Either side of it, at the floor's edges (it's in the floor's middle)
        phantomOffset: 15,
        // Enraged, as OSRS has it: the slams stop, red lightning strikes the floor instead (a
        // shadow on each tile first), Amascut tears the floor away row by row from the back till
        // there's a row left at its feet, and the phantoms keep on, quicker: stay calm or die
        enrage: {
            at: 0.05,
            heal: 0.2,
            seq: 9684,
            // A row every 3 s from the back, down to the one in front of it: you're in its reach
            // or you're off (Sim.stepWardenEnrage)
            rowEvery: 3,
            firstRow: 3.6,
            lightning: {
                // The first walk this soon after it's enraged
                first: 1.2,
                every: 2.4,
                warn: 1.8,
                count: 10,
                shadowSpotAnim: 1446,
                spotAnim: 2197,
                damage: 0.12,
            },
            message: "The Warden is enraged! Amascut tears the floor away!",
        },
        message: "rises again! Keep off the half of the floor it slams.",
        siphonMessage:
            "The Warden is charging, and nothing can hurt it! Step on the energy siphons to stop them!",
        staggerMessage: "The siphons reverse, and the Warden staggers!",
        releaseMessage: "The Warden releases its stored energy!",
        phantomMessage: "A phantom of a path's boss joins the fight!",
    },
};

const WARDENS_SOUNDS = { attack: -1, hit: 6595, death: -1 };

// The obelisk's windmill (WardensPhaseTwoDef windmill): which of its five patterns, A to E, strikes
// each tile round it, read off the OSRS Wiki's diagram of it, west to east and north to south as
// OSRS has the room; F is the obelisk. The middle column's struck by both C and D.
export const WARDENS_WINDMILL = [
    "AAABBBBCCCCDDDEEEEAAA",
    "AAABBBBCCCCDDDEEEEAAA",
    "AAAABBBBCCCDDEEEEAAAA",
    "AAAAABBBCCCDDEEEAAAAA",
    "EAAAABBBCCCDDEEEAAAAB",
    "EEAAAABBBCCDEEEAAAABB",
    "EEEEAAABBCCDEEAAABBBB",
    "EEEEEAAABCCDEAAABBBBB",
    "DEEEEEAABBCEEAABBBBBC",
    "DDDDEEEEABCEABBBBCCCC",
    "DDDDDDDEEFFFBBCCCCCCC",
    "CCCCCCCCCFFFCCCCCCCCC",
    "CCCCCCCBBFFFEEDDDDDDD",
    "CCCCBBBBAECBAEEEEDDDD",
    "CBBBBBAAEECBBAAEEEEED",
    "BBBBBAAAEDCCBAAAEEEEE",
    "BBBBAAAEEDCCBBAAAEEEE",
    "BBAAAAEEEDCCBBBAAAAEE",
    "BAAAAEEEDDCCCBBBAAAAE",
    "AAAAAEEEDDCCCBBBAAAAA",
    "AAAAEEEEDDCCCBBBBAAAA",
    "AAAEEEEDDDCCCCBBBBAAA",
    "AAAEEEEDDDCCCCBBBBAAA",
];

// Set by the fight (Sim.wakeWarden and the rest), never read
const WARDENS_HP_UNSET = 1;

// The Warden's attacks in its second phase, whichever form: skulls (its magic's red, its ranged's
// plain) at whoever it's after, a fan of them, and stone dropped where you stand
const RED_SKULL = 2224;
const PLAIN_SKULL = 2241;
const WARDEN_ATTACKS: BossAttackDef[] = [
    {
        name: "Red skull",
        kind: "projectile",
        damage: 7,
        windup: 1.2,
        cooldown: 0,
        range: 40,
        weight: 4,
        speed: 7,
        count: 1,
        homing: 1.4,
        radius: 0.5,
        seq: 9661,
        sound: 6236,
        spotAnim: RED_SKULL,
        impactSpotAnim: 2213,
    },
    {
        name: "Plain skull",
        kind: "projectile",
        damage: 6,
        windup: 1.2,
        cooldown: 0,
        range: 40,
        weight: 4,
        speed: 9,
        count: 3,
        spread: 0.35,
        radius: 0.45,
        seq: 9660,
        sound: 6224,
        spotAnim: PLAIN_SKULL,
    },
    {
        name: "Skull storm",
        kind: "pattern",
        damage: 5,
        windup: 1.2,
        cooldown: 6,
        range: 40,
        weight: 2,
        seq: 9661,
        sound: 6236,
        spotAnim: RED_SKULL,
        pattern: {
            shape: "spread",
            count: 5,
            arc: 0.8,
            volleys: 3,
            interval: 0.5,
            speed: 6,
            range: 26,
            radius: 0.45,
            track: true,
        },
    },
    {
        // Stone dropped on where you stand: still there, and you're held in it
        name: "Entomb",
        kind: "blast",
        damage: 4,
        windup: 1.8,
        cooldown: 9,
        range: 40,
        weight: 2,
        radius: 1.1,
        shadow: {},
        seq: 9661,
        spotAnim: 2210,
        impactSpotAnim: 2212,
        effect: { kind: "freeze", seconds: 2.4 },
        message: "Stone falls from above! Step off the shadow!",
    },
];
// Tumeken's walks up to you, and hits beside it
const WARDEN_SLASH: BossAttackDef = {
    name: "Slash",
    kind: "swing",
    damage: 8,
    windup: 0.9,
    cooldown: 0,
    range: 4.5,
    weight: 6,
    radius: 3.6,
    seq: 9659,
    sound: 6111,
    opens: 1.2,
};

// A Warden form of the second phase: only `open` hurts it, filling its shield (Sim.wardenTakes)
const wardenForm = (
    id: string,
    name: string,
    npcId: number,
    open: "magic" | "ranged",
    chases: boolean,
): EnemyDef => ({
    id,
    name,
    npcId,
    idleSeq: 9653,
    walkSeq: 9649,
    attackSeq: 9661,
    deathSeq: 9662,
    hp: WARDENS_HP_UNSET,
    damage: 0,
    speed: chases ? 1.2 : 0.7,
    radius: 2.5,
    xp: 0,
    scale: 1.7,
    knockbackResist: 1,
    solid: true,
    onlyStyle: open,
    sounds: WARDENS_SOUNDS,
    boss: {
        attackInterval: chases ? 4.8 : 4.2,
        keepDistance: chases ? undefined : 5,
        // Each hit on it fills its shield twice over while it's down
        guard: TOMBS_GUARD,
        look: TOMBS_EXPOSED,
        enrage: { message: `${name} is enraged!` },
        attacks: chases ? [...WARDEN_ATTACKS, WARDEN_SLASH] : WARDEN_ATTACKS,
    },
});

// Still, a form with nothing to do of its own: kneeling, charging, a wreck
const stillWarden = (
    id: string,
    name: string,
    npcId: number,
    idleSeq: number,
    more: Partial<EnemyDef> = {},
): EnemyDef => ({
    id,
    name,
    npcId,
    idleSeq,
    walkSeq: idleSeq,
    attackSeq: idleSeq,
    deathSeq: 9662,
    hp: WARDENS_HP_UNSET,
    damage: 0,
    speed: 0,
    radius: 2.5,
    xp: 0,
    scale: 1.7,
    knockbackResist: 1,
    stationary: true,
    solid: true,
    sounds: WARDENS_SOUNDS,
    ...more,
});
// Its attacks are the fight's, not its own (Sim.stepWardens)
const QUIET: NonNullable<EnemyDef["boss"]> = {
    attackInterval: 600,
    enrage: { message: "", at: 0 },
    attacks: [],
};

const WARDENS_PHASE_TWO: EnemyDef[] = [
    wardenForm("elidinis_warden_magic", "Elidinis' Warden", 11753, "magic", false),
    wardenForm("elidinis_warden_ranged", "Elidinis' Warden", 11754, "ranged", false),
    wardenForm("tumeken_warden_magic", "Tumeken's Warden", 11756, "magic", true),
    wardenForm("tumeken_warden_ranged", "Tumeken's Warden", 11757, "ranged", true),
    // Kneeling, its core out: the core's what's hit
    stillWarden("elidinis_warden_exposed", "Elidinis' Warden", 11755, 9671, {
        unhittable: true,
        boss: QUIET,
    }),
    stillWarden("tumeken_warden_exposed", "Tumeken's Warden", 11758, 9671, {
        unhittable: true,
        boss: QUIET,
    }),
    // The one that fell, smouldering
    stillWarden("elidinis_warden_wreck", "Elidinis' Warden", 11759, 9654, { unhittable: true }),
    stillWarden("tumeken_warden_wreck", "Tumeken's Warden", 11760, 9654, { unhittable: true }),
    // Its core, thrown out: what it's hit for comes off the Warden, five times over
    ...(
        [
            ["elidinis_warden_core", 11771],
            ["tumeken_warden_core", 11770],
        ] as const
    ).map(
        ([id, npcId]): EnemyDef => ({
            id,
            name: "Core",
            npcId,
            idleSeq: 9704,
            walkSeq: 9704,
            attackSeq: 9704,
            deathSeq: 9704,
            hp: WARDENS_HP_UNSET,
            damage: 0,
            speed: 0,
            radius: 0.7,
            xp: 0,
            scale: 1.5,
            knockbackResist: 1,
            stationary: true,
            hintArrow: true,
            sounds: { attack: -1, hit: 6591, death: -1 },
        }),
    ),
    {
        // The obelisk, charged: it can't be hit, and its specials are the fight's
        id: "wardens_obelisk_charged",
        name: "Obelisk",
        npcId: 11752,
        idleSeq: 9723,
        walkSeq: 9723,
        attackSeq: 9728,
        deathSeq: 9734,
        hp: 1,
        damage: 0,
        speed: 0,
        radius: 1.5,
        xp: 0,
        stationary: true,
        solid: true,
        unhittable: true,
        sounds: WARDENS_SOUNDS,
    },
];

// The phantoms of the last phase: they can't be hit, and attack every 4.8 seconds (quicker once
// the Warden's enraged) from beside it
const phantom = (
    id: string,
    name: string,
    npcId: number,
    idleSeq: number,
    attacks: BossAttackDef[],
    scale: number,
): EnemyDef => ({
    id,
    name,
    npcId,
    idleSeq,
    walkSeq: idleSeq,
    attackSeq: attacks[0].seq ?? idleSeq,
    deathSeq: idleSeq,
    hp: 1,
    damage: 0,
    speed: 0,
    radius: 2.5,
    xp: 0,
    scale,
    stationary: true,
    unhittable: true,
    sounds: { attack: -1, hit: -1, death: -1 },
    boss: {
        attackInterval: 4.8,
        enrage: { message: "", at: 0 },
        attacks,
    },
});
const phantomShot = (
    name: string,
    seq: number,
    spotAnim: number,
    more: Partial<BossAttackDef> = {},
): BossAttackDef => ({
    name,
    kind: "pattern",
    damage: 6,
    windup: 1.2,
    cooldown: 0,
    range: 60,
    weight: 1,
    seq,
    spotAnim,
    pattern: {
        shape: "spread",
        count: 5,
        arc: 1,
        volleys: 1,
        interval: 0.4,
        speed: 7,
        range: 30,
        radius: 0.45,
        track: true,
    },
    ...more,
});
const phantomDrop = (
    name: string,
    seq: number,
    windup: number,
    spotAnim: number,
    impactSpotAnim: number,
    more: Partial<BossAttackDef> = {},
): BossAttackDef => ({
    name,
    kind: "blast",
    damage: 7,
    windup,
    cooldown: 0,
    range: 60,
    weight: 1,
    radius: 1,
    shadow: {},
    seq,
    spotAnim,
    impactSpotAnim,
    ...more,
});

// The last phase's Warden: open for the slams' restart once every siphon's stopped
const WARDEN_LAST: NonNullable<EnemyDef["boss"]> = {
    ...QUIET,
    fallSeconds: 5,
    guard: TOMBS_GUARD,
    look: TOMBS_EXPOSED,
};

const WARDENS_PHASE_THREE: EnemyDef[] = [
    stillWarden("elidinis_warden_last", "Elidinis' Warden", 11761, 9657, {
        boss: WARDEN_LAST,
    }),
    stillWarden("tumeken_warden_last", "Tumeken's Warden", 11762, 9657, {
        boss: WARDEN_LAST,
    }),
    stillWarden("elidinis_warden_charging", "Elidinis' Warden", 11763, 9683, {
        boss: WARDEN_LAST,
    }),
    stillWarden("tumeken_warden_charging", "Tumeken's Warden", 11764, 9683, {
        boss: WARDEN_LAST,
    }),
    {
        // An energy siphon, landed: stepped on, it's reversed (Sim.stepWardens)
        id: "wardens_siphon",
        name: "Energy Siphon",
        npcId: 11772,
        idleSeq: 9736,
        walkSeq: 9736,
        attackSeq: 9736,
        deathSeq: 9735,
        hp: 1,
        damage: 0,
        speed: 0,
        radius: 0.5,
        xp: 0,
        scale: 1.4,
        stationary: true,
        unhittable: true,
        hintArrow: true,
        sounds: { attack: -1, hit: -1, death: -1 },
    },
    {
        id: "wardens_siphon_reversed",
        name: "Energy Siphon",
        npcId: 11773,
        idleSeq: 9736,
        walkSeq: 9736,
        attackSeq: 9736,
        deathSeq: 9735,
        hp: 1,
        damage: 0,
        speed: 0,
        radius: 0.5,
        xp: 0,
        scale: 1.4,
        stationary: true,
        unhittable: true,
        sounds: { attack: -1, hit: -1, death: -1 },
    },
    // Zebak's: a fan of his magic, or of his ranged (his usual attacks, as OSRS has the phantoms:
    // no acid, no jugs, that's his room)
    phantom(
        "zebaks_phantom",
        "Zebak's Phantom",
        11774,
        9618,
        [
            phantomShot("Phantom magic", 9626, 2176),
            phantomShot("Phantom ranged", 9626, 2178, { damage: 5 }),
        ],
        0.8,
    ),
    // Ba-Ba's: a rock on where you stand, quickly
    phantom(
        "babas_phantom",
        "Ba-Ba's Phantom",
        11775,
        9741,
        [phantomDrop("Phantom rockfall", 9743, 1.2, 2250, 2250)],
        1.3,
    ),
    // Akkha's: three of his ranged, or three of his magic
    phantom(
        "akkhas_phantom",
        "Akkha's Phantom",
        11777,
        9760,
        [
            phantomShot("Phantom sand", 9772, 2255, {
                kind: "projectile",
                pattern: undefined,
                speed: 8,
                count: 1,
                homing: 0.8,
                damage: 5,
                chain: { times: 2, windup: 0.5 },
            }),
            phantomShot("Phantom red sand", 9774, 2253, {
                kind: "projectile",
                pattern: undefined,
                speed: 8,
                count: 1,
                homing: 0.8,
                damage: 5,
                impactSpotAnim: 2254,
                chain: { times: 2, windup: 0.5 },
            }),
        ],
        1.4,
    ),
    // Kephri's: a fireball lobbed onto where you stand (wider with Aerial Assault)
    phantom(
        "kephris_phantom",
        "Kephri's Phantom",
        11776,
        9572,
        [
            phantomDrop("Phantom fireball", 9577, 2.4, 2266, 2157, {
                damage: 8,
                invoked: { id: "aerial_assault", radius: 1.5, damage: 1.3 },
            }),
        ],
        1.3,
    ),
    // Amascut, watching from behind the Warden
    stillWarden("amascuts_phantom", "Phantom", 11767, 9716, {
        unhittable: true,
        solid: false,
        radius: 4,
        scale: 1,
    }),
    // Her mouth open, pulling the floor in
    stillWarden("amascuts_phantom_enraged", "Phantom", 11768, 9717, {
        unhittable: true,
        solid: false,
        radius: 4,
        scale: 1,
    }),
];

TOMBS_ENEMIES.push(
    {
        // What's fought in the first phase (11751): it never moves or hits back (Sim.stepWardens)
        id: "wardens_obelisk",
        name: "Obelisk",
        npcId: 11751,
        idleSeq: 9720,
        walkSeq: 9720,
        attackSeq: 9721,
        deathSeq: 9734,
        // Tougher with the path level as a path's boss is (Sim.startWardens), and enough of it
        // that the Wardens get their attacks in: the phase is about them, not a race to break it
        hp: 9000,
        damage: 0,
        speed: 0,
        radius: 1.5,
        xp: 0,
        stationary: true,
        solid: true,
        sounds: WARDENS_SOUNDS,
    },
    ...(
        [
            ["elidinis_warden_dormant", "Elidinis' Warden", 11748],
            ["tumeken_warden_dormant", "Tumeken's Warden", 11749],
        ] as const
    ).map(
        ([id, name, npcId]): EnemyDef => ({
            // A Warden charging on its platform: nothing hurts it yet
            id,
            name,
            npcId,
            idleSeq: 9665,
            walkSeq: 9649,
            attackSeq: 9667,
            deathSeq: 9669,
            hp: 1000,
            damage: 0,
            speed: 0,
            radius: 2.5,
            xp: 0,
            // Towering over its platform, as in OSRS
            scale: 1.7,
            stationary: true,
            unhittable: true,
            sounds: WARDENS_SOUNDS,
        }),
    ),
    ...WARDENS_PHASE_TWO,
    ...WARDENS_PHASE_THREE,
    {
        // An energy orb down a trough: only drawn (Sim.stepWardens moves them)
        id: "wardens_energy",
        name: "Energy",
        npcId: 11769,
        idleSeq: 7571,
        walkSeq: 7571,
        attackSeq: 7571,
        deathSeq: 9735,
        hp: 1,
        damage: 0,
        speed: 0,
        radius: 0.4,
        xp: 0,
        sounds: WARDENS_SOUNDS,
    },
);

const zebakLook = (id: string, name: string, npcId: number, seq: number): EnemyDef => ({
    id,
    name,
    npcId,
    idleSeq: seq,
    walkSeq: seq,
    attackSeq: seq,
    deathSeq: seq,
    hp: 1,
    damage: 0,
    speed: 0,
    radius: 0.5,
    xp: 0,
    sounds: ZEBAK_SOUNDS,
});

TOMBS_ENEMIES.push(
    {
        id: "zebak",
        name: "Zebak",
        npcId: 11730,
        idleSeq: 9618,
        walkSeq: 9618,
        attackSeq: 9624,
        deathSeq: 9634,
        // Up from 7,000 with his guard (his jaws' opens) and the raid's button
        hp: 8400,
        damage: 0,
        speed: 0,
        radius: 4,
        xp: 1500,
        knockbackResist: 1,
        stationary: true,
        solid: true,
        sounds: ZEBAK_SOUNDS,
        spawnMessage: "Zebak rises from the water to guard the path of Crondis!",
        boss: {
            attackInterval: 1.8,
            // His phases are his enrage (a fight in phases has no other): this is only where his
            // specials stop
            enrage: { message: "Zebak is enraged!", at: 0.25 },
            // Jaws that miss leave his head down at the island's edge (opens)
            guard: TOMBS_GUARD,
            look: TOMBS_EXPOSED,
            zebak: ZEBAK,
            attacks: ZEBAK_ATTACKS,
            // Quicker by the phase, each opening on what it adds, the swell from the first
            phases: {
                phases: [
                    { until: 0.7, ambients: [{ attack: "Swell", interval: 14, delay: 6 }] },
                    {
                        until: 0.4,
                        tempo: 0.85,
                        opener: "Twin jaws",
                        ambients: [{ attack: "Swell", interval: 11, delay: 4 }],
                    },
                    {
                        tempo: 0.7,
                        light: 0.6,
                        opener: "Twin swell",
                        message: "Zebak is enraged!",
                        ambients: [
                            { attack: "Twin swell", interval: 8, delay: 8 },
                            { attack: "Acid spray", interval: 10, delay: 5 },
                        ],
                    },
                ],
                shieldMessage: "",
                blastMessage: "",
            },
        },
    },
    {
        // Up out of the water in his second phase: snaps a strip of its own at the nearest hero as
        // his jaws come down (EnemyDef.echoes), and bites as a crocodile does between
        id: "zebak_croc",
        name: "Crocodile",
        npcId: 11705,
        idleSeq: 2037,
        walkSeq: 2036,
        attackSeq: 2039,
        deathSeq: 2038,
        hp: 150,
        damage: 4,
        speed: 1.9,
        radius: 0.9,
        xp: 22,
        sounds: { attack: -1, hit: -1, death: -1 },
        echoes: {
            boss: "zebak",
            attacks: ["Jaws", "Twin jaws", "Jaw flurry"],
            name: "Crocodile's snap",
            damage: 4,
            seq: 2039,
            later: 0.25,
            most: 2,
            length: 6,
            impact: { trail: { spotAnim: 2184, fit: 0.8 }, shake: 0.1 },
        },
    },
    {
        // Rolls when walked into (Sim.stepZebakJugs): weapons pass it by
        id: "zebak_jug",
        name: "Jug",
        npcId: 11736,
        idleSeq: -1,
        walkSeq: -1,
        attackSeq: -1,
        deathSeq: -1,
        hp: 5,
        damage: 0,
        speed: 0,
        radius: 0.5,
        xp: 0,
        stationary: true,
        unhittable: true,
        sounds: ZEBAK_SOUNDS,
    },
    {
        // Chases a hero, wasting away as it goes (Sim.stepZebak); its touch heals him
        id: "zebak_blood_cloud",
        name: "Blood Cloud",
        npcId: 11742,
        idleSeq: 8102,
        walkSeq: 8101,
        attackSeq: 8102,
        deathSeq: 8102,
        hp: 60,
        damage: 5,
        speed: 2.6,
        radius: 0.9,
        xp: 10,
        flies: true,
        sounds: ZEBAK_SOUNDS,
    },
    zebakLook("zebak_boulder", "Boulder", 11737, -1),
    zebakLook("zebak_wave", "Wave", 11738, 7877),
);

// The Tombs' points, each player's own, for the chest (Sim.tombsChance): a puzzle room's done
// for everyone in the raid, a boss's whole hitpoints for each (shared by damage in co-op, a fair
// share its whole worth), and a death costs a fifth of what you've got, as OSRS's does. A whole
// raid's worth is `full`, which gives the raid level's whole chance of a purple.
export const TOMBS_POINTS = {
    room: 500,
    boss: 1000,
    obelisk: 500,
    wardenTwo: 1000,
    wardenThree: 1500,
    deathLoss: 0.2,
    full: 4 * (500 + 1000) + 500 + 1000 + 1500,
};

// The Helpful Spirit, standing in the Nexus (Sim's stepTombsSpirit): walked up to, it gives each
// player a bundle of supplies, free, as OSRS's does: once after any two paths, and once more after
// the other two, before the Wardens. One not taken by the time they go through the next door is
// gone. The supplies go in the inventory (TOMBS_SUPPLY_ITEMS, items.ts), as many as there's room
// for; the rest are used at once.
export const TOMBS_SPIRIT: RandomEventDef = {
    id: "helpful_spirit",
    name: "Helpful Spirit",
    weight: 0,
    npcId: 11694,
    idleSeq: 2906,
    speech: "Take what you need for the way ahead. Choose one.",
    effect: { kind: "shop", leaveLabel: "Back to the Nexus" },
};

// Its three bundles, OSRS's Life, Chaos and Power, cut to the inventory's four slots (Life's silk
// dressings are left out). Need Some Help and the rest leave fewer of each (TOMBS_SPIRIT_SHARE,
// never an empty bundle), and Dehydration none that heal.
export const TOMBS_SPIRIT_BUNDLES: TombsBundleDef[] = [
    {
        id: "life",
        name: "Life",
        description: "Survival: healing, cures and protection.",
        objId: 27347,
        contents: [
            { supplyId: "nectar", count: [3, 3] },
            { supplyId: "tears_of_elidinis", count: [2, 2] },
            { supplyId: "blessed_crystal_scarab", count: [1, 2] },
            { supplyId: "ambrosia", count: [1, 1] },
        ],
    },
    {
        id: "chaos",
        name: "Chaos",
        description: "A gamble between Life and Power.",
        objId: 27339,
        contents: [
            { supplyId: "nectar", count: [1, 4] },
            { supplyId: "tears_of_elidinis", count: [0, 3] },
            { supplyId: "smelling_salts", count: [0, 1] },
            { supplyId: "ambrosia", count: [1, 1], chance: 0.15 },
            { supplyId: "liquid_adrenaline", count: [1, 1], chance: 0.15 },
        ],
    },
    {
        id: "power",
        name: "Power",
        description: "Pure damage, and speed.",
        objId: 27343,
        contents: [
            { supplyId: "smelling_salts", count: [2, 2] },
            { supplyId: "liquid_adrenaline", count: [1, 1] },
        ],
    },
];

export const TOMBS_SUPPLIES: RaidSupplyDef[] = [
    {
        id: "nectar",
        name: "Nectar",
        description: "Heals 25% of your hitpoints.",
        objId: 27315,
        price: 300,
        effect: { kind: "heal", fraction: 0.25 },
    },
    {
        id: "silk_dressing",
        name: "Silk dressing",
        description: "Heals 40% of your hitpoints.",
        objId: 27323,
        price: 450,
        effect: { kind: "heal", fraction: 0.4 },
    },
    {
        id: "ambrosia",
        name: "Ambrosia",
        description: "Heals you in full.",
        objId: 27347,
        price: 1000,
        effect: { kind: "heal", fraction: 1 },
    },
    {
        id: "tears_of_elidinis",
        name: "Tears of Elidinis",
        description: "Cures poison and drains, and keeps them off for 2 minutes.",
        objId: 27327,
        price: 400,
        effect: { kind: "buff", stats: {}, seconds: 120, cures: true },
    },
    {
        id: "liquid_adrenaline",
        name: "Liquid adrenaline",
        description: "+20% movement speed for 3 minutes.",
        objId: 27339,
        price: 500,
        effect: { kind: "buff", stats: { moveSpeed: 0.2 }, seconds: 180 },
    },
    {
        id: "smelling_salts",
        name: "Smelling salts",
        description: "+15% damage with every style for 3 minutes.",
        objId: 27343,
        price: 800,
        effect: { kind: "buff", stats: { might: 0.15 }, seconds: 180 },
    },
    {
        id: "blessed_crystal_scarab",
        name: "Blessed crystal scarab",
        description: "Every hit 2 less for 3 minutes.",
        objId: 27335,
        price: 600,
        effect: { kind: "buff", stats: { armor: 2 }, seconds: 180 },
    },
];

// How much of each of the Spirit's bundles each of its invocations leaves
export const TOMBS_SPIRIT_SHARE: Record<string, number> = {
    need_some_help: 0.66,
    need_less_help: 0.33,
    no_help_needed: 0.1,
};

// The time limit invocations: the raid's clock past this many minutes, and the chest goes by a
// raid level this much lower
export const TOMBS_TIME_LIMITS: Record<string, { minutes: number; drop: number }> = {
    walk_for_it: { minutes: 40, drop: 20 },
    jog_for_it: { minutes: 35, drop: 30 },
    run_for_it: { minutes: 30, drop: 40 },
    sprint_for_it: { minutes: 25, drop: 50 },
};
