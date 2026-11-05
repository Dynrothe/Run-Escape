import {
    AkkhaDef,
    AkkhaElementDef,
    BossAttackDef,
    EnemyDef,
    EnemyShotDef,
    KephriDef,
    PlayerEffectDef,
    WaveDef,
} from "./types";

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
    hp: 6000,
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
export const TOMBS_BOSSES = { levelHp: 0.35, levelDamage: 0.15 };

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
    levelHp: 0.5,
    levelDamage: 0.3,
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
    // (11707) for a while, when weapons can hurt it (Sim.stepHet)
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
// casket each time (so the room always gives at least sealSteps of them)
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
// each opening taking at most a sealSteps'th of its hitpoints, so it always takes that many.
// Orbs of Darkness cross the floor every orbEvery seconds at orbSpeed tiles a second, hitting
// for orbDamage, more and quicker with the path level; one that crosses a mirror dirties it.
// Mirrors: 4 on the beam's way round the seal, and decoys more. Everything a room's enemies
// are scaled by (tombsRoomScale) scales the hurt too.
export const HET = {
    beamEvery: 5.4,
    beamShow: 0.8,
    beamDamage: 3,
    beamEnemyDamage: 30,
    open: 9,
    sealSteps: 3,
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
// trailing orbs. At 80, 60, 40 and 20% his shadows come and he can't be hurt; at 0 he makes his
// final stand in a corner, out of reach of everything but melee, sending Unstable Orbs across.

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
        corner: 5.5,
        flood: 20,
        warn: 3,
        damage: 0.5,
        message: "Shadows appear throughout the room! Kill one and draw Akkha into its quarter.",
        warnMessage: "The shadows raise their spears! Get to a quarter whose shadow is dead!",
        floodMessage: "The shadows slam their spears, flooding their quarters!",
        endMessage: "Akkha's shadows are gone. He can be hurt anywhere again!",
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
    hp: 6000,
    damage: 0,
    speed: 1.5,
    radius: 1.3,
    xp: 1200,
    knockbackResist: 1,
    solid: true,
    protects: { styles: [style], damage: 0.25 },
    sounds: AKKHA_SOUNDS,
    spawnMessage: "Akkha rises to guard the path of Het!",
    boss: {
        attackInterval: 1.8,
        enrage: { message: "Akkha's armour glows: he's furious!" },
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
const akkhaLook = (id: string, name: string, npcId: number): EnemyDef => ({
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
        hp: 900,
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

// The Scabaras room's puzzles, all four to solve (OSRS's solo takes one a side and the last):
//  - Sequence, Simon says: the plates light up in an order (steps, one more each path level, up
//    to most), each for flash seconds with gap after, and you step on them in it. A wrong plate
//    brings the roof down on you, and a new order's shown retry seconds later.
//  - Lights out: a ring of eight plates, each toggling itself and its two neighbours when stepped
//    on, scrambled by scramble presses (more with path levels). Light them all. Every darken
//    seconds (less with path levels) one goes dark again: a scarab's knocked it.
//  - Addition: symbol plates worth 1 to 9 (Line to Foot), and the Ancient tablet's number to make
//    exactly by stepping on them, each once. Over it, the roof comes down and they reset.
//  - Matching, last, once the others are done: two boards of nine hidden symbols, the same nine
//    on each. Step on one on each board: the same, they stay; not, the roof comes down and they
//    hide again. preSolved pairs (fewer with path levels) are done as it starts.
// A mistake's rock takes wrongShare of your hitpoints and breaks into shards. Rocks fall on
// everyone meanwhile, every rockEvery seconds (less with path levels), for rockDamage within
// rockRadius once they land (rockWarn after they start, as 302's roof falls), breaking into
// shards: bullets out all round.
export const SCABARAS = {
    sequenceSteps: 5,
    sequenceMost: 9,
    flash: 0.6,
    gap: 0.25,
    showAfter: 1.5,
    retry: 2.5,
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
    // Tiles from a plate's middle that count as standing on it
    plateReach: 0.55,
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
    intermissions: {
        // At these shares of her hitpoints her shield breaks: dazed, she can't be hurt while
        // swarms (swarms of them) rush in to restore it, and her overlords come (moreOverlords
        // too, with More Overlords). It's over once the swarms are all in or dead and the
        // overlords are dead.
        at: [0.66, 0.33],
        swarms: [28, 24],
        overlords: [["kephri_spitting"], ["kephri_soldier", "kephri_arcane"]],
        moreOverlords: [["kephri_soldier"], ["kephri_spitting"]],
        message: "Kephri's shield breaks! She's dazed, and her swarms rush in to restore it!",
        endMessage: "Kephri's swarm shield reforms around her!",
    },
    swarm: {
        enemyId: "kephri_swarm",
        // A share of her hitpoints each heals her by, reaching her, and how near is reaching
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
        knock: 6,
        stun: 2,
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
        spots: [
            [4, -5],
            [-4, -5],
            [0, -8],
            [5, -2],
        ],
        message: "The Arcane Scarab charges its swarm!",
    },
    // Where her overlords come in, in tiles from her
    overlordAt: {
        kephri_spitting: [5, -3],
        kephri_soldier: [-5, -3],
        kephri_arcane: [4, -5],
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
        windup: 1,
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
    kephriForm("kephri", 11719, 7000, true),
    kephriForm("kephri_final", 11721, 7000, false),
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
    cloudEveryLeast: 4,
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
