import { AkkhaDef, AkkhaElementDef, BossAttackDef, EnemyDef, EnemyShotDef, WaveDef } from "./types";

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
