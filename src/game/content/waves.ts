import { RunEventDef, WaveDef } from "./types";

// What comes at you on each map, and when. Waves set the steady stream of
// enemies; events add elites, rings and bosses at set times.

// Seconds in a run; the final boss comes at the end
export const RUN_LENGTH = 15 * 60;

// Lumbridge: from the farm animals around Lumbridge out to the undead and
// bats of Draynor Manor.
export const LUMBRIDGE_WAVES: WaveDef[] = [
    {
        start: 0,
        enemies: [
            { id: "chicken", weight: 3 },
            { id: "rat", weight: 2 },
        ],
        spawnRate: 1.2,
        minAlive: 8,
        maxAlive: 35,
    },
    {
        start: 45,
        enemies: [
            { id: "rat", weight: 2 },
            { id: "goblin", weight: 3 },
        ],
        spawnRate: 1.8,
        minAlive: 15,
        maxAlive: 50,
    },
    {
        start: 90,
        enemies: [
            { id: "goblin", weight: 3 },
            { id: "cow", weight: 1 },
        ],
        spawnRate: 2.2,
        minAlive: 20,
        maxAlive: 70,
    },
    {
        start: 150,
        enemies: [
            { id: "imp", weight: 3 },
            { id: "goblin", weight: 2 },
        ],
        spawnRate: 3.0,
        minAlive: 30,
        maxAlive: 90,
    },
    {
        start: 210,
        enemies: [
            { id: "man", weight: 3 },
            { id: "imp", weight: 1 },
            { id: "cow", weight: 1 },
        ],
        spawnRate: 3.2,
        minAlive: 35,
        maxAlive: 100,
    },
    {
        start: 270,
        enemies: [
            { id: "giant_rat", weight: 2 },
            { id: "big_frog", weight: 2 },
        ],
        spawnRate: 3.4,
        minAlive: 40,
        maxAlive: 110,
    },
    {
        start: 330,
        enemies: [
            { id: "zombie", weight: 3 },
            { id: "big_frog", weight: 1 },
        ],
        spawnRate: 3.4,
        minAlive: 50,
        maxAlive: 117,
    },
    {
        start: 390,
        enemies: [
            { id: "zombie", weight: 2 },
            { id: "skeleton", weight: 2 },
        ],
        spawnRate: 3.8,
        minAlive: 60,
        maxAlive: 135,
    },
    {
        start: 450,
        enemies: [
            { id: "dark_wizard", weight: 2 },
            { id: "skeleton", weight: 2 },
        ],
        spawnRate: 4.1,
        minAlive: 70,
        maxAlive: 153,
    },
    {
        start: 510,
        enemies: [
            { id: "giant_spider", weight: 3 },
            { id: "zombie", weight: 1 },
        ],
        spawnRate: 4.3,
        minAlive: 80,
        maxAlive: 171,
    },
    {
        start: 570,
        enemies: [
            { id: "ghost", weight: 3 },
            { id: "skeleton", weight: 1 },
        ],
        spawnRate: 4.7,
        minAlive: 90,
        maxAlive: 189,
    },
    {
        start: 630,
        enemies: [
            { id: "giant_bat", weight: 3 },
            { id: "ghost", weight: 1 },
        ],
        spawnRate: 5,
        minAlive: 100,
        maxAlive: 207,
    },
    {
        start: 690,
        enemies: [
            { id: "zombie", weight: 2 },
            { id: "skeleton", weight: 2 },
            { id: "ghost", weight: 2 },
        ],
        spawnRate: 5.4,
        minAlive: 120,
        maxAlive: 234,
    },
    {
        start: 750,
        enemies: [
            { id: "giant_spider", weight: 2 },
            { id: "giant_bat", weight: 2 },
            { id: "dark_wizard", weight: 1 },
        ],
        spawnRate: 5.9,
        minAlive: 140,
        maxAlive: 261,
    },
    {
        start: 810,
        enemies: [
            { id: "giant_spider", weight: 2 },
            { id: "ghost", weight: 2 },
            { id: "giant_bat", weight: 2 },
            { id: "skeleton", weight: 2 },
        ],
        spawnRate: 6.3,
        minAlive: 160,
        maxAlive: 288,
    },
];

// Elites drop reward caskets, so they come about once a minute. Count Draynor
// wakes halfway through and drops an elite casket (now and then a master one).
export const LUMBRIDGE_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "goblin" },
    { at: 150, kind: "elite", enemyId: "cow" },
    { at: 200, kind: "elite", enemyId: "goblin" },
    { at: 250, kind: "elite", enemyId: "man" },
    { at: 300, kind: "elite", enemyId: "giant_rat" },
    { at: 360, kind: "ring", enemyId: "zombie", count: 28 },
    { at: 420, kind: "elite", enemyId: "zombie" },
    { at: 450, kind: "boss", enemyId: "count_draynor" },
    { at: 480, kind: "elite", enemyId: "skeleton" },
    { at: 540, kind: "elite", enemyId: "giant_spider" },
    { at: 600, kind: "ring", enemyId: "ghost", count: 48 },
    { at: 660, kind: "elite", enemyId: "ghost" },
    { at: 720, kind: "elite", enemyId: "dark_wizard" },
    { at: 780, kind: "elite", enemyId: "giant_spider" },
    { at: 840, kind: "ring", enemyId: "giant_bat", count: 60 },
    { at: 870, kind: "elite", enemyId: "giant_bat" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "wise_old_man" },
];

// The waves on the later maps keep Lumbridge's pace (how many, how fast);
// what changes is who comes
export function paced(enemies: WaveDef["enemies"][]): WaveDef[] {
    return LUMBRIDGE_WAVES.map((wave, i) => ({ ...wave, enemies: enemies[i] }));
}

// Every run starts at level 1, so the later maps follow Lumbridge's curve of
// enemy hitpoints, wave by wave, with their own kinds of enemy (and the map's
// difficulty on top).

// Barrows: crypt rats and bloodworms from the tunnels under the mounds, the
// afflicted of Mort'ton, then crypt spiders, ghouls, the crypts' skeletons,
// Mort'ton's shades and feral vampyres
export const BARROWS_WAVES: WaveDef[] = paced([
    [
        { id: "crypt_rat", weight: 3 },
        { id: "bloodworm", weight: 1 },
    ],
    [
        { id: "crypt_rat", weight: 2 },
        { id: "bloodworm", weight: 2 },
    ],
    [
        { id: "bloodworm", weight: 3 },
        { id: "afflicted", weight: 1 },
    ],
    [
        { id: "bloodworm", weight: 3 },
        { id: "crypt_rat", weight: 2 },
    ],
    [
        { id: "afflicted", weight: 3 },
        { id: "bloodworm", weight: 1 },
        { id: "giant_crypt_rat", weight: 1 },
    ],
    [
        { id: "giant_crypt_rat", weight: 2 },
        { id: "crypt_spider", weight: 2 },
    ],
    [
        { id: "ghoul", weight: 3 },
        { id: "crypt_spider", weight: 1 },
    ],
    [
        { id: "ghoul", weight: 2 },
        { id: "skeleton", weight: 2 },
    ],
    [
        { id: "shade", weight: 2 },
        { id: "skeleton", weight: 2 },
    ],
    [
        { id: "giant_crypt_spider", weight: 3 },
        { id: "ghoul", weight: 1 },
    ],
    [
        { id: "shade", weight: 3 },
        { id: "skeleton", weight: 1 },
    ],
    [
        { id: "feral_vampyre", weight: 3 },
        { id: "shade", weight: 1 },
    ],
    [
        { id: "ghoul", weight: 2 },
        { id: "skeleton", weight: 2 },
        { id: "shade", weight: 2 },
    ],
    [
        { id: "giant_crypt_spider", weight: 2 },
        { id: "feral_vampyre", weight: 2 },
        { id: "shade", weight: 1 },
    ],
    [
        { id: "giant_crypt_spider", weight: 2 },
        { id: "shade", weight: 2 },
        { id: "feral_vampyre", weight: 2 },
        { id: "skeleton", weight: 2 },
    ],
]);

// A brother climbs out of his crypt every two and a half minutes, and Dharok
// comes last. Their hitpoints are set for when they come here.
export const BARROWS_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "afflicted" },
    { at: 150, kind: "boss", enemyId: "torag", hp: 1000 },
    { at: 200, kind: "elite", enemyId: "giant_crypt_rat" },
    { at: 250, kind: "elite", enemyId: "crypt_spider" },
    { at: 300, kind: "boss", enemyId: "karil", hp: 1900 },
    { at: 360, kind: "ring", enemyId: "ghoul", count: 30 },
    { at: 420, kind: "elite", enemyId: "ghoul" },
    { at: 450, kind: "boss", enemyId: "guthan", hp: 2800 },
    { at: 480, kind: "elite", enemyId: "skeleton" },
    { at: 540, kind: "elite", enemyId: "shade" },
    { at: 600, kind: "boss", enemyId: "ahrim", hp: 3800 },
    { at: 620, kind: "ring", enemyId: "shade", count: 48 },
    { at: 660, kind: "elite", enemyId: "giant_crypt_spider" },
    { at: 720, kind: "elite", enemyId: "feral_vampyre" },
    { at: 750, kind: "boss", enemyId: "verac", hp: 5600 },
    { at: 780, kind: "elite", enemyId: "shade" },
    { at: 840, kind: "ring", enemyId: "feral_vampyre", count: 60 },
    { at: 870, kind: "elite", enemyId: "giant_crypt_spider" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "dharok", hp: 10000 },
];

// The Wilderness: revenant imps and goblins, bandits, then the Graveyard of
// Shadows's zombies and skeletons, revenant hobgoblins and pyrefiends, dark
// warriors and chaos druids, poison spiders, the Ankou, hill giants and
// revenant demons
export const WILDERNESS_WAVES: WaveDef[] = paced([
    [
        { id: "revenant_imp", weight: 3 },
        { id: "revenant_goblin", weight: 1 },
    ],
    [
        { id: "revenant_imp", weight: 2 },
        { id: "revenant_goblin", weight: 3 },
    ],
    [
        { id: "revenant_goblin", weight: 3 },
        { id: "bandit", weight: 1 },
    ],
    [
        { id: "revenant_imp", weight: 3 },
        { id: "revenant_goblin", weight: 2 },
    ],
    [
        { id: "bandit", weight: 3 },
        { id: "revenant_imp", weight: 1 },
        { id: "revenant_goblin", weight: 1 },
    ],
    [
        { id: "revenant_hobgoblin", weight: 2 },
        { id: "revenant_pyrefiend", weight: 2 },
    ],
    [
        { id: "zombie", weight: 3 },
        { id: "revenant_pyrefiend", weight: 1 },
    ],
    [
        { id: "zombie", weight: 2 },
        { id: "skeleton", weight: 2 },
    ],
    [
        { id: "dark_warrior", weight: 2 },
        { id: "chaos_druid", weight: 2 },
    ],
    [
        { id: "poison_spider", weight: 3 },
        { id: "zombie", weight: 1 },
    ],
    [
        { id: "ankou", weight: 3 },
        { id: "skeleton", weight: 1 },
    ],
    [
        { id: "dark_warrior", weight: 3 },
        { id: "ankou", weight: 1 },
    ],
    [
        { id: "zombie", weight: 2 },
        { id: "skeleton", weight: 2 },
        { id: "ankou", weight: 2 },
    ],
    [
        { id: "poison_spider", weight: 2 },
        { id: "hill_giant", weight: 2 },
        { id: "chaos_druid", weight: 1 },
    ],
    [
        { id: "poison_spider", weight: 2 },
        { id: "ankou", weight: 2 },
        { id: "revenant_demon", weight: 2 },
        { id: "hill_giant", weight: 2 },
    ],
]);

// Two of the Wilderness's own bosses, then the King Black Dragon
export const WILDERNESS_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "revenant_goblin" },
    { at: 150, kind: "elite", enemyId: "revenant_imp" },
    { at: 200, kind: "elite", enemyId: "bandit" },
    { at: 250, kind: "elite", enemyId: "revenant_hobgoblin" },
    { at: 300, kind: "boss", enemyId: "crazy_archaeologist", hp: 2300 },
    { at: 360, kind: "ring", enemyId: "zombie", count: 30 },
    { at: 420, kind: "elite", enemyId: "zombie" },
    { at: 480, kind: "elite", enemyId: "skeleton" },
    { at: 540, kind: "elite", enemyId: "chaos_druid" },
    { at: 600, kind: "boss", enemyId: "chaos_fanatic", hp: 4500 },
    { at: 620, kind: "ring", enemyId: "ankou", count: 48 },
    { at: 660, kind: "elite", enemyId: "poison_spider" },
    { at: 720, kind: "elite", enemyId: "hill_giant" },
    { at: 780, kind: "elite", enemyId: "dark_warrior" },
    { at: 840, kind: "ring", enemyId: "revenant_pyrefiend", count: 60 },
    { at: 870, kind: "elite", enemyId: "revenant_demon" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "king_black_dragon", hp: 11000 },
];

// The Kharidian Desert: lizards, scorpions and jackals on the sand, desert
// bandits, ugthanki and kalphite workers, crocodiles, mummies, kalphite
// soldiers and guardians, and the locust riders of the pyramids
export const DESERT_WAVES: WaveDef[] = paced([
    [
        { id: "desert_lizard", weight: 3 },
        { id: "scorpion", weight: 1 },
    ],
    [
        { id: "desert_lizard", weight: 2 },
        { id: "scorpion", weight: 3 },
    ],
    [
        { id: "scorpion", weight: 3 },
        { id: "jackal", weight: 1 },
    ],
    [
        { id: "jackal", weight: 3 },
        { id: "desert_lizard", weight: 2 },
    ],
    [
        { id: "desert_bandit", weight: 3 },
        { id: "jackal", weight: 1 },
        { id: "scorpion", weight: 1 },
    ],
    [
        { id: "ugthanki", weight: 2 },
        { id: "kalphite_worker", weight: 2 },
    ],
    [
        { id: "kalphite_worker", weight: 3 },
        { id: "desert_bandit", weight: 1 },
    ],
    [
        { id: "crocodile", weight: 2 },
        { id: "kalphite_worker", weight: 2 },
    ],
    [
        { id: "desert_bandit", weight: 2 },
        { id: "mummy", weight: 2 },
    ],
    [
        { id: "kalphite_soldier", weight: 3 },
        { id: "kalphite_worker", weight: 1 },
    ],
    [
        { id: "mummy", weight: 3 },
        { id: "crocodile", weight: 1 },
    ],
    [
        { id: "crocodile", weight: 2 },
        { id: "kalphite_soldier", weight: 2 },
    ],
    [
        { id: "mummy", weight: 2 },
        { id: "locust_rider", weight: 2 },
        { id: "kalphite_soldier", weight: 2 },
    ],
    [
        { id: "kalphite_guardian", weight: 2 },
        { id: "locust_rider", weight: 2 },
        { id: "mummy", weight: 1 },
    ],
    [
        { id: "kalphite_guardian", weight: 2 },
        { id: "kalphite_soldier", weight: 2 },
        { id: "locust_rider", weight: 2 },
        { id: "mummy", weight: 2 },
    ],
]);

// Desert Treasure's three guardians of the diamonds, then the Kalphite Queen
export const DESERT_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "scorpion" },
    { at: 150, kind: "elite", enemyId: "jackal" },
    { at: 200, kind: "elite", enemyId: "desert_bandit" },
    { at: 250, kind: "elite", enemyId: "ugthanki" },
    { at: 300, kind: "boss", enemyId: "fareed", hp: 2600 },
    { at: 330, kind: "ring", enemyId: "scarab_swarm", count: 30 },
    { at: 390, kind: "elite", enemyId: "kalphite_worker" },
    { at: 450, kind: "boss", enemyId: "dessous", hp: 3800 },
    { at: 480, kind: "elite", enemyId: "mummy" },
    { at: 540, kind: "elite", enemyId: "crocodile" },
    { at: 600, kind: "boss", enemyId: "damis", hp: 2700 },
    { at: 620, kind: "ring", enemyId: "mummy", count: 40 },
    { at: 660, kind: "elite", enemyId: "kalphite_soldier" },
    { at: 720, kind: "elite", enemyId: "locust_rider" },
    { at: 780, kind: "elite", enemyId: "mummy" },
    { at: 840, kind: "ring", enemyId: "kalphite_worker", count: 60 },
    { at: 870, kind: "elite", enemyId: "kalphite_guardian" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "kalphite_queen", hp: 7000 },
];

// Fremennik Province: rock crabs and wolves, cockatrices and yaks, mountain
// trolls, basilisks and jellies, dagannoths and wallasalki, kurasks, ice
// trolls and rock lobsters
export const FREMENNIK_WAVES: WaveDef[] = paced([
    [
        { id: "rock_crab", weight: 3 },
        { id: "wolf", weight: 1 },
    ],
    [
        { id: "rock_crab", weight: 2 },
        { id: "wolf", weight: 3 },
    ],
    [
        { id: "wolf", weight: 3 },
        { id: "cockatrice", weight: 1 },
    ],
    [
        { id: "cockatrice", weight: 3 },
        { id: "rock_crab", weight: 2 },
    ],
    [
        { id: "cockatrice", weight: 3 },
        { id: "wolf", weight: 1 },
        { id: "yak", weight: 1 },
    ],
    [
        { id: "mountain_troll", weight: 2 },
        { id: "basilisk", weight: 2 },
    ],
    [
        { id: "basilisk", weight: 3 },
        { id: "yak", weight: 1 },
    ],
    [
        { id: "jelly", weight: 2 },
        { id: "mountain_troll", weight: 2 },
    ],
    [
        { id: "dagannoth", weight: 2 },
        { id: "wallasalki", weight: 2 },
    ],
    [
        { id: "jelly", weight: 3 },
        { id: "basilisk", weight: 1 },
    ],
    [
        { id: "kurask", weight: 3 },
        { id: "dagannoth", weight: 1 },
    ],
    [
        { id: "ice_troll", weight: 3 },
        { id: "wallasalki", weight: 1 },
    ],
    [
        { id: "dagannoth", weight: 2 },
        { id: "kurask", weight: 2 },
        { id: "ice_troll", weight: 2 },
    ],
    [
        { id: "rock_lobster", weight: 2 },
        { id: "kurask", weight: 2 },
        { id: "wallasalki", weight: 1 },
    ],
    [
        { id: "rock_lobster", weight: 2 },
        { id: "ice_troll", weight: 2 },
        { id: "kurask", weight: 2 },
        { id: "dagannoth", weight: 2 },
    ],
]);

// The three Dagannoth Kings, then Vorkath
export const FREMENNIK_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "wolf" },
    { at: 150, kind: "elite", enemyId: "cockatrice" },
    { at: 200, kind: "elite", enemyId: "yak" },
    { at: 250, kind: "elite", enemyId: "mountain_troll" },
    { at: 300, kind: "boss", enemyId: "dagannoth_rex", hp: 3000 },
    { at: 330, kind: "ring", enemyId: "sea_snake", count: 30 },
    { at: 390, kind: "elite", enemyId: "basilisk" },
    { at: 450, kind: "boss", enemyId: "dagannoth_supreme", hp: 4200 },
    { at: 480, kind: "elite", enemyId: "jelly" },
    { at: 540, kind: "elite", enemyId: "wallasalki" },
    { at: 600, kind: "boss", enemyId: "dagannoth_prime", hp: 5000 },
    { at: 620, kind: "ring", enemyId: "dagannoth", count: 40 },
    { at: 660, kind: "elite", enemyId: "kurask" },
    { at: 720, kind: "elite", enemyId: "ice_troll" },
    { at: 780, kind: "elite", enemyId: "dagannoth" },
    { at: 840, kind: "ring", enemyId: "sea_snake", count: 60 },
    { at: 870, kind: "elite", enemyId: "rock_lobster" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "vorkath", hp: 14000 },
];

// Karamja: monkeys, snakes and jungle spiders, tribesmen, jogres and moss
// giants, lesser demons, and the TzHaar out of the volcano
export const KARAMJA_WAVES: WaveDef[] = paced([
    [
        { id: "monkey", weight: 3 },
        { id: "snake", weight: 1 },
    ],
    [
        { id: "monkey", weight: 2 },
        { id: "snake", weight: 3 },
    ],
    [
        { id: "snake", weight: 3 },
        { id: "jungle_spider", weight: 1 },
    ],
    [
        { id: "jungle_spider", weight: 3 },
        { id: "monkey", weight: 2 },
    ],
    [
        { id: "tribesman", weight: 3 },
        { id: "jungle_spider", weight: 1 },
        { id: "snake", weight: 1 },
    ],
    [
        { id: "jogre", weight: 2 },
        { id: "tribesman", weight: 2 },
    ],
    [
        { id: "moss_giant", weight: 3 },
        { id: "jungle_spider", weight: 1 },
    ],
    [
        { id: "tz_kek", weight: 2 },
        { id: "jogre", weight: 2 },
    ],
    [
        { id: "lesser_demon", weight: 2 },
        { id: "moss_giant", weight: 2 },
    ],
    [
        { id: "tz_kek", weight: 3 },
        { id: "tz_kih", weight: 1 },
    ],
    [
        { id: "lesser_demon", weight: 3 },
        { id: "tribesman", weight: 1 },
    ],
    [
        { id: "tok_xil", weight: 3 },
        { id: "tz_kek", weight: 1 },
    ],
    [
        { id: "lesser_demon", weight: 2 },
        { id: "tok_xil", weight: 2 },
        { id: "moss_giant", weight: 2 },
    ],
    [
        { id: "yt_mejkot", weight: 2 },
        { id: "tok_xil", weight: 2 },
        { id: "tz_kek", weight: 1 },
    ],
    [
        { id: "yt_mejkot", weight: 2 },
        { id: "tok_xil", weight: 2 },
        { id: "lesser_demon", weight: 2 },
        { id: "tz_kek", weight: 2 },
    ],
]);

// Elvarg, Nezikchened and Ket-Zek, then TzTok-Jad
export const KARAMJA_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "snake" },
    { at: 150, kind: "elite", enemyId: "jungle_spider" },
    { at: 200, kind: "elite", enemyId: "tribesman" },
    { at: 250, kind: "elite", enemyId: "jogre" },
    { at: 300, kind: "boss", enemyId: "elvarg", hp: 3200 },
    { at: 330, kind: "ring", enemyId: "tz_kih", count: 30 },
    { at: 390, kind: "elite", enemyId: "moss_giant" },
    { at: 450, kind: "boss", enemyId: "nezikchened", hp: 4400 },
    { at: 480, kind: "elite", enemyId: "tz_kek" },
    { at: 540, kind: "elite", enemyId: "lesser_demon" },
    { at: 600, kind: "boss", enemyId: "ket_zek", hp: 5600 },
    { at: 620, kind: "ring", enemyId: "tz_kek", count: 40 },
    { at: 660, kind: "elite", enemyId: "tok_xil" },
    { at: 720, kind: "elite", enemyId: "lesser_demon" },
    { at: 780, kind: "elite", enemyId: "yt_mejkot" },
    { at: 840, kind: "ring", enemyId: "tz_kih", count: 60 },
    { at: 870, kind: "elite", enemyId: "yt_mejkot" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "tztok_jad", hp: 15500 },
];

// Kourend: guanic bats and swamp crabs, lizards, lizardmen and their brutes,
// bloodvelds, Xeric's deathly rangers, mages and skeletal mystics, and hydras
export const KOUREND_WAVES: WaveDef[] = paced([
    [
        { id: "guanic_bat", weight: 3 },
        { id: "swamp_crab", weight: 1 },
    ],
    [
        { id: "guanic_bat", weight: 2 },
        { id: "swamp_crab", weight: 3 },
    ],
    [
        { id: "swamp_crab", weight: 3 },
        { id: "lizard", weight: 1 },
    ],
    [
        { id: "lizard", weight: 3 },
        { id: "guanic_bat", weight: 2 },
    ],
    [
        { id: "sulphur_lizard", weight: 3 },
        { id: "lizard", weight: 1 },
        { id: "swamp_crab", weight: 1 },
    ],
    [
        { id: "lizardman", weight: 2 },
        { id: "sulphur_lizard", weight: 2 },
    ],
    [
        { id: "lizardman", weight: 3 },
        { id: "bloodveld", weight: 1 },
    ],
    [
        { id: "bloodveld", weight: 2 },
        { id: "deathly_ranger", weight: 2 },
    ],
    [
        { id: "deathly_ranger", weight: 2 },
        { id: "deathly_mage", weight: 2 },
    ],
    [
        { id: "lizardman_brute", weight: 3 },
        { id: "lizardman", weight: 1 },
    ],
    [
        { id: "skeletal_mystic", weight: 3 },
        { id: "deathly_mage", weight: 1 },
    ],
    [
        { id: "lizardman_brute", weight: 2 },
        { id: "bloodveld", weight: 2 },
    ],
    [
        { id: "skeletal_mystic", weight: 2 },
        { id: "deathly_ranger", weight: 2 },
        { id: "lizardman_brute", weight: 2 },
    ],
    [
        { id: "hydra", weight: 2 },
        { id: "skeletal_mystic", weight: 2 },
        { id: "deathly_mage", weight: 1 },
    ],
    [
        { id: "hydra", weight: 2 },
        { id: "lizardman_brute", weight: 2 },
        { id: "skeletal_mystic", weight: 2 },
        { id: "bloodveld", weight: 2 },
    ],
]);

// The Lizardman shaman, Sarachnis and Skotizo, then the Alchemical Hydra
export const KOUREND_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "swamp_crab" },
    { at: 150, kind: "elite", enemyId: "lizard" },
    { at: 200, kind: "elite", enemyId: "sulphur_lizard" },
    { at: 250, kind: "elite", enemyId: "lizardman" },
    { at: 300, kind: "boss", enemyId: "lizardman_shaman", hp: 3400 },
    { at: 330, kind: "ring", enemyId: "guanic_bat", count: 30 },
    { at: 390, kind: "elite", enemyId: "bloodveld" },
    { at: 450, kind: "boss", enemyId: "sarachnis", hp: 4600 },
    { at: 480, kind: "elite", enemyId: "deathly_ranger" },
    { at: 540, kind: "elite", enemyId: "deathly_mage" },
    { at: 600, kind: "boss", enemyId: "skotizo", hp: 6000 },
    { at: 620, kind: "ring", enemyId: "lizardman", count: 40 },
    { at: 660, kind: "elite", enemyId: "lizardman_brute" },
    { at: 720, kind: "elite", enemyId: "skeletal_mystic" },
    { at: 780, kind: "elite", enemyId: "hydra" },
    { at: 840, kind: "ring", enemyId: "guanic_bat", count: 60 },
    { at: 870, kind: "elite", enemyId: "hydra" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "alchemical_hydra", hp: 17000 },
];

// Varlamore: jerboas, pyre foxes and antelopes, blood jaguars, serpent
// shamans and jaguar warriors, naguas, the Fremennik warband, gryphons and
// minotaurs
export const VARLAMORE_WAVES: WaveDef[] = paced([
    [
        { id: "embertailed_jerboa", weight: 3 },
        { id: "pyre_fox", weight: 1 },
    ],
    [
        { id: "embertailed_jerboa", weight: 2 },
        { id: "pyre_fox", weight: 3 },
    ],
    [
        { id: "pyre_fox", weight: 3 },
        { id: "sunlight_antelope", weight: 1 },
    ],
    [
        { id: "sunlight_antelope", weight: 2 },
        { id: "moonlight_antelope", weight: 2 },
        { id: "embertailed_jerboa", weight: 1 },
    ],
    [
        { id: "blood_jaguar", weight: 3 },
        { id: "pyre_fox", weight: 1 },
        { id: "moonlight_antelope", weight: 1 },
    ],
    [
        { id: "serpent_shaman", weight: 2 },
        { id: "blood_jaguar", weight: 2 },
    ],
    [
        { id: "jaguar_warrior", weight: 3 },
        { id: "serpent_shaman", weight: 1 },
    ],
    [
        { id: "sulphur_nagua", weight: 2 },
        { id: "jaguar_warrior", weight: 2 },
    ],
    [
        { id: "fremennik_archer", weight: 2 },
        { id: "fremennik_seer", weight: 2 },
    ],
    [
        { id: "frost_nagua", weight: 3 },
        { id: "sulphur_nagua", weight: 1 },
    ],
    [
        { id: "fremennik_berserker", weight: 3 },
        { id: "fremennik_archer", weight: 1 },
    ],
    [
        { id: "gryphon", weight: 3 },
        { id: "frost_nagua", weight: 1 },
    ],
    [
        { id: "minotaur", weight: 2 },
        { id: "fremennik_berserker", weight: 2 },
        { id: "gryphon", weight: 2 },
    ],
    [
        { id: "minotaur", weight: 2 },
        { id: "gryphon", weight: 2 },
        { id: "fremennik_seer", weight: 1 },
    ],
    [
        { id: "minotaur", weight: 2 },
        { id: "gryphon", weight: 2 },
        { id: "frost_nagua", weight: 2 },
        { id: "fremennik_berserker", weight: 2 },
    ],
]);

// The Colosseum's Manticore and Shockwave and Javelin Colossi, then Sol
// Heredit
export const VARLAMORE_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "pyre_fox" },
    { at: 150, kind: "elite", enemyId: "sunlight_antelope" },
    { at: 200, kind: "elite", enemyId: "blood_jaguar" },
    { at: 250, kind: "elite", enemyId: "serpent_shaman" },
    { at: 300, kind: "boss", enemyId: "manticore", hp: 3600 },
    { at: 330, kind: "ring", enemyId: "embertailed_jerboa", count: 30 },
    { at: 390, kind: "elite", enemyId: "jaguar_warrior" },
    { at: 450, kind: "boss", enemyId: "shockwave_colossus", hp: 4800 },
    { at: 480, kind: "elite", enemyId: "sulphur_nagua" },
    { at: 540, kind: "elite", enemyId: "fremennik_berserker" },
    { at: 600, kind: "boss", enemyId: "javelin_colossus", hp: 6200 },
    { at: 620, kind: "ring", enemyId: "jaguar_warrior", count: 40 },
    { at: 660, kind: "elite", enemyId: "frost_nagua" },
    { at: 720, kind: "elite", enemyId: "gryphon" },
    { at: 780, kind: "elite", enemyId: "minotaur" },
    { at: 840, kind: "ring", enemyId: "blood_jaguar", count: 60 },
    { at: 870, kind: "elite", enemyId: "minotaur" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "sol_heredit", hp: 18500 },
];

// Morytania: the ghasts, zombies and shades of Mort Myre, vampyre juveniles
// and juvinates, Canifis's werewolves, nail beasts and mutated bloodvelds,
// then the Theatre of Blood's Nylocas and Darkmeyer's vyrewatch
export const MORYTANIA_WAVES: WaveDef[] = paced([
    [
        { id: "ghast", weight: 3 },
        { id: "vampyre_juvenile", weight: 1 },
    ],
    [
        { id: "ghast", weight: 2 },
        { id: "vampyre_juvenile", weight: 3 },
    ],
    [
        { id: "vampyre_juvenile", weight: 3 },
        { id: "myre_zombie", weight: 1 },
    ],
    [
        { id: "myre_zombie", weight: 2 },
        { id: "fiyr_shade", weight: 2 },
        { id: "ghast", weight: 1 },
    ],
    [
        { id: "werewolf", weight: 3 },
        { id: "vampyre_juvenile", weight: 1 },
        { id: "fiyr_shade", weight: 1 },
    ],
    [
        { id: "vampyre_juvinate", weight: 2 },
        { id: "werewolf", weight: 2 },
    ],
    [
        { id: "nail_beast", weight: 3 },
        { id: "vampyre_juvinate", weight: 1 },
    ],
    [
        { id: "mutated_bloodveld", weight: 2 },
        { id: "nail_beast", weight: 2 },
    ],
    // The Nylocas come in, all three colours at once
    [
        { id: "nylocas_ischyros", weight: 3 },
        { id: "nylocas_toxobolos", weight: 1 },
        { id: "nylocas_hagios", weight: 1 },
        { id: "mutated_bloodveld", weight: 1 },
    ],
    [
        { id: "vyrewatch", weight: 2 },
        { id: "mutated_bloodveld", weight: 2 },
    ],
    [
        { id: "big_nylocas_ischyros", weight: 2 },
        { id: "big_nylocas_toxobolos", weight: 1 },
        { id: "big_nylocas_hagios", weight: 1 },
    ],
    [
        { id: "vyrewatch_sentinel", weight: 3 },
        { id: "vyrewatch", weight: 1 },
    ],
    [
        { id: "vyrewatch_sentinel", weight: 2 },
        { id: "big_nylocas_ischyros", weight: 2 },
        { id: "vyrewatch", weight: 2 },
    ],
    [
        { id: "vyrewatch_sentinel", weight: 2 },
        { id: "vyrewatch", weight: 2 },
        { id: "big_nylocas_toxobolos", weight: 1 },
        { id: "big_nylocas_hagios", weight: 1 },
    ],
    [
        { id: "vyrewatch_sentinel", weight: 2 },
        { id: "vyrewatch", weight: 2 },
        { id: "big_nylocas_ischyros", weight: 1 },
        { id: "big_nylocas_toxobolos", weight: 1 },
        { id: "big_nylocas_hagios", weight: 1 },
        { id: "mutated_bloodveld", weight: 1 },
    ],
]);

// Vanstrom Klause, then the Theatre of Blood's Pestilent Bloat and Sotetseg,
// and Verzik Vitur at the end
export const MORYTANIA_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "vampyre_juvenile" },
    { at: 150, kind: "elite", enemyId: "fiyr_shade" },
    { at: 200, kind: "elite", enemyId: "werewolf" },
    { at: 250, kind: "elite", enemyId: "vampyre_juvinate" },
    { at: 300, kind: "boss", enemyId: "vanstrom_klause", hp: 3600 },
    { at: 330, kind: "ring", enemyId: "ghast", count: 30 },
    { at: 390, kind: "elite", enemyId: "nail_beast" },
    { at: 450, kind: "boss", enemyId: "pestilent_bloat", hp: 5200 },
    { at: 480, kind: "elite", enemyId: "mutated_bloodveld" },
    { at: 540, kind: "elite", enemyId: "vyrewatch" },
    { at: 600, kind: "boss", enemyId: "sotetseg", hp: 6700 },
    { at: 620, kind: "ring", enemyId: "werewolf", count: 40 },
    { at: 660, kind: "elite", enemyId: "big_nylocas_ischyros" },
    { at: 720, kind: "elite", enemyId: "vyrewatch_sentinel" },
    { at: 780, kind: "elite", enemyId: "vyrewatch" },
    { at: 840, kind: "ring", enemyId: "nylocas_ischyros", count: 60 },
    { at: 870, kind: "elite", enemyId: "vyrewatch_sentinel" },
    // Each of her three forms has this many hitpoints
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "verzik_vitur", hp: 7000 },
];

// God Wars Dungeon: the four gods' armies, marching in from their own sides
// and fighting each other as much as you. Every wave has two or more of
// them, so there's always a battle going on around you: Bandos's goblins and
// Zamorak's imps first, then the hobgoblins, aviansies, Saradomin's knights,
// fiends and werewolves, orks and priests, up to the spiritual warriors, the
// cyclopes and the goraks, who fight everyone.
export const GOD_WARS_WAVES: WaveDef[] = paced([
    [
        { id: "gwd_goblin", weight: 3 },
        { id: "gwd_imp", weight: 2 },
    ],
    [
        { id: "gwd_goblin", weight: 2 },
        { id: "icefiend", weight: 2 },
        { id: "gwd_imp", weight: 1 },
    ],
    [
        { id: "gwd_hobgoblin", weight: 2 },
        { id: "aviansie", weight: 2 },
        { id: "icefiend", weight: 1 },
    ],
    [
        { id: "knight_of_saradomin", weight: 2 },
        { id: "aviansie", weight: 2 },
        { id: "pyrefiend", weight: 1 },
        { id: "gwd_hobgoblin", weight: 1 },
    ],
    [
        { id: "gwd_werewolf", weight: 2 },
        { id: "knight_of_saradomin", weight: 2 },
        { id: "aviansie", weight: 1 },
    ],
    [
        { id: "gwd_ork", weight: 2 },
        { id: "saradomin_priest", weight: 2 },
        { id: "gwd_werewolf", weight: 1 },
    ],
    [
        { id: "hellhound", weight: 2 },
        { id: "armadyl_spiritual_ranger", weight: 2 },
        { id: "gwd_ork", weight: 1 },
    ],
    [
        { id: "gwd_bloodveld", weight: 2 },
        { id: "gwd_ogre", weight: 2 },
        { id: "saradomin_priest", weight: 1 },
        { id: "armadyl_spiritual_ranger", weight: 1 },
    ],
    [
        { id: "gwd_jogre", weight: 2 },
        { id: "saradomin_spiritual_warrior", weight: 2 },
        { id: "hellhound", weight: 1 },
        { id: "armadyl_spiritual_ranger", weight: 1 },
    ],
    [
        { id: "gorak", weight: 2 },
        { id: "aviansie_veteran", weight: 2 },
        { id: "gwd_bloodveld", weight: 1 },
        { id: "gwd_jogre", weight: 1 },
    ],
    [
        { id: "gwd_cyclops", weight: 2 },
        { id: "saradomin_spiritual_warrior", weight: 2 },
        { id: "gwd_bloodveld", weight: 2 },
        { id: "aviansie_veteran", weight: 1 },
    ],
    [
        { id: "saradomin_spiritual_mage", weight: 2 },
        { id: "zamorak_spiritual_warrior", weight: 2 },
        { id: "gwd_cyclops", weight: 1 },
        { id: "gorak", weight: 1 },
    ],
    [
        { id: "bandos_spiritual_warrior", weight: 2 },
        { id: "armadyl_spiritual_warrior", weight: 2 },
        { id: "saradomin_spiritual_mage", weight: 1 },
        { id: "zamorak_spiritual_warrior", weight: 1 },
    ],
    [
        { id: "zamorak_spiritual_warrior", weight: 2 },
        { id: "bandos_spiritual_warrior", weight: 2 },
        { id: "aviansie_veteran", weight: 2 },
        { id: "saradomin_spiritual_mage", weight: 2 },
        { id: "gorak", weight: 1 },
    ],
    [
        { id: "bandos_spiritual_warrior", weight: 2 },
        { id: "armadyl_spiritual_warrior", weight: 2 },
        { id: "saradomin_spiritual_mage", weight: 2 },
        { id: "zamorak_spiritual_warrior", weight: 2 },
        { id: "gwd_cyclops", weight: 1 },
        { id: "gorak", weight: 1 },
    ],
]);

// Commander Zilyana, Kree'arra and K'ril Tsutsaroth, General Graardor at the
// head of an ork charge, then Nex
export const GOD_WARS_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "gwd_hobgoblin" },
    { at: 150, kind: "elite", enemyId: "aviansie" },
    { at: 200, kind: "elite", enemyId: "knight_of_saradomin" },
    { at: 250, kind: "elite", enemyId: "gwd_werewolf" },
    { at: 300, kind: "boss", enemyId: "commander_zilyana", hp: 4000 },
    { at: 330, kind: "ring", enemyId: "gwd_imp", count: 30 },
    { at: 390, kind: "elite", enemyId: "hellhound" },
    { at: 450, kind: "boss", enemyId: "kreearra", hp: 5500 },
    { at: 480, kind: "elite", enemyId: "gwd_ogre" },
    { at: 540, kind: "elite", enemyId: "saradomin_spiritual_warrior" },
    { at: 600, kind: "boss", enemyId: "kril_tsutsaroth", hp: 7000 },
    { at: 620, kind: "ring", enemyId: "gwd_werewolf", count: 40 },
    { at: 660, kind: "elite", enemyId: "gorak" },
    { at: 720, kind: "ring", enemyId: "gwd_ork", count: 40 },
    { at: 720, kind: "elite", enemyId: "general_graardor" },
    { at: 780, kind: "elite", enemyId: "aviansie_veteran" },
    { at: 840, kind: "ring", enemyId: "gwd_hobgoblin", count: 60 },
    { at: 870, kind: "elite", enemyId: "zamorak_spiritual_warrior" },
    // Each of her four forms has this many hitpoints
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "nex", hp: 5500 },
];

// Prifddinas: the Gauntlet's crystalline rats, bats, spiders, scorpions and
// wolves, the city's guards and the Iorwerth's warriors and archers,
// crystalline bears and dark beasts and Zulrah's snakelings, then from ten
// minutes the corrupted creatures of the Corrupted Gauntlet
export const PRIFDDINAS_WAVES: WaveDef[] = paced([
    [
        { id: "crystalline_rat", weight: 3 },
        { id: "crystalline_bat", weight: 1 },
    ],
    [
        { id: "crystalline_rat", weight: 2 },
        { id: "crystalline_bat", weight: 3 },
    ],
    [
        { id: "crystalline_bat", weight: 3 },
        { id: "crystalline_spider", weight: 1 },
    ],
    [
        { id: "crystalline_spider", weight: 2 },
        { id: "crystalline_scorpion", weight: 2 },
        { id: "crystalline_rat", weight: 1 },
    ],
    [
        { id: "crystalline_wolf", weight: 3 },
        { id: "crystalline_bat", weight: 1 },
        { id: "crystalline_scorpion", weight: 1 },
    ],
    [
        { id: "elf_guard", weight: 2 },
        { id: "crystalline_wolf", weight: 2 },
    ],
    [
        { id: "iorwerth_warrior", weight: 3 },
        { id: "elf_guard", weight: 1 },
    ],
    [
        { id: "iorwerth_archer", weight: 2 },
        { id: "iorwerth_warrior", weight: 2 },
    ],
    [
        { id: "crystalline_bear", weight: 2 },
        { id: "snakeling", weight: 2 },
    ],
    [
        { id: "crystalline_dark_beast", weight: 3 },
        { id: "crystalline_bear", weight: 1 },
    ],
    // The corrupted ones come out
    [
        { id: "corrupted_wolf", weight: 4 },
        { id: "corrupted_scorpion", weight: 2 },
        { id: "iorwerth_archer", weight: 1 },
    ],
    [
        { id: "corrupted_scorpion", weight: 2 },
        { id: "corrupted_bear", weight: 2 },
    ],
    [
        { id: "corrupted_bear", weight: 2 },
        { id: "corrupted_dark_beast", weight: 2 },
        { id: "corrupted_wolf", weight: 2 },
    ],
    [
        { id: "corrupted_dark_beast", weight: 3 },
        { id: "corrupted_bear", weight: 3 },
        { id: "iorwerth_archer", weight: 1 },
    ],
    [
        { id: "corrupted_dark_beast", weight: 2 },
        { id: "corrupted_bear", weight: 2 },
        { id: "corrupted_wolf", weight: 2 },
        { id: "iorwerth_warrior", weight: 2 },
    ],
]);

// Zulrah, Zalcano and the Crystalline Hunllef, then the Corrupted Hunllef
export const PRIFDDINAS_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "crystalline_bat" },
    { at: 150, kind: "elite", enemyId: "crystalline_scorpion" },
    { at: 200, kind: "elite", enemyId: "crystalline_wolf" },
    { at: 250, kind: "elite", enemyId: "elf_guard" },
    // Each of its three forms has this many hitpoints
    { at: 300, kind: "boss", enemyId: "zulrah", hp: 1400 },
    { at: 330, kind: "ring", enemyId: "crystalline_rat", count: 30 },
    { at: 390, kind: "elite", enemyId: "iorwerth_warrior" },
    { at: 450, kind: "boss", enemyId: "zalcano", hp: 5600 },
    { at: 480, kind: "elite", enemyId: "crystalline_bear" },
    { at: 540, kind: "elite", enemyId: "crystalline_dark_beast" },
    { at: 600, kind: "boss", enemyId: "crystalline_hunllef", hp: 7200 },
    { at: 620, kind: "ring", enemyId: "snakeling", count: 40 },
    { at: 660, kind: "elite", enemyId: "corrupted_wolf" },
    { at: 720, kind: "elite", enemyId: "corrupted_bear" },
    { at: 780, kind: "elite", enemyId: "corrupted_dark_beast" },
    { at: 840, kind: "ring", enemyId: "corrupted_wolf", count: 60 },
    { at: 870, kind: "elite", enemyId: "corrupted_dark_beast" },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "corrupted_hunllef", hp: 23000 },
];

// The Inferno: Mor Ul Rek's TzHaar and the Inferno's creatures. Nibblers and
// the TzHaar castes first, then the Jal-MejRah bats, the Jal-Ak blobs (which
// split when they die) and the Jal-ImKot (which dig in and come up by you),
// and the Jal-Xil and Jal-Zek (which raise the dead) at the end
export const INFERNO_WAVES: WaveDef[] = paced([
    [
        { id: "jal_nib", weight: 3 },
        { id: "tzhaar_hur", weight: 1 },
    ],
    [
        { id: "jal_nib", weight: 2 },
        { id: "jal_mejrah", weight: 3 },
    ],
    [
        { id: "jal_mejrah", weight: 3 },
        { id: "tzhaar_xil", weight: 1 },
    ],
    [
        { id: "tzhaar_xil", weight: 2 },
        { id: "tzhaar_mej", weight: 2 },
        { id: "jal_nib", weight: 1 },
    ],
    [
        { id: "tzhaar_ket", weight: 3 },
        { id: "jal_mejrah", weight: 1 },
        { id: "tzhaar_mej", weight: 1 },
    ],
    [
        { id: "jal_ak", weight: 2 },
        { id: "tzhaar_ket", weight: 2 },
    ],
    [
        { id: "jal_ak", weight: 2 },
        { id: "tzhaar_ket", weight: 1 },
        { id: "tzhaar_mej", weight: 1 },
    ],
    [
        { id: "jal_imkot", weight: 2 },
        { id: "jal_ak", weight: 2 },
    ],
    [
        { id: "jal_xil", weight: 1 },
        { id: "jal_imkot", weight: 2 },
        { id: "jal_mejrah", weight: 2 },
    ],
    [
        { id: "jal_xil", weight: 2 },
        { id: "jal_ak", weight: 2 },
        { id: "tzhaar_ket", weight: 1 },
    ],
    // The Jal-Zek come, and what dies near them gets back up
    [
        { id: "jal_zek", weight: 1 },
        { id: "jal_xil", weight: 2 },
        { id: "jal_imkot", weight: 1 },
        { id: "jal_nib", weight: 2 },
    ],
    [
        { id: "jal_zek", weight: 2 },
        { id: "jal_ak", weight: 2 },
        { id: "jal_imkot", weight: 2 },
    ],
    [
        { id: "jal_zek", weight: 2 },
        { id: "jal_xil", weight: 2 },
        { id: "jal_imkot", weight: 2 },
    ],
    [
        { id: "jal_zek", weight: 3 },
        { id: "jal_xil", weight: 2 },
        { id: "jal_ak", weight: 2 },
        { id: "jal_nib", weight: 2 },
    ],
    [
        { id: "jal_zek", weight: 2 },
        { id: "jal_xil", weight: 2 },
        { id: "jal_imkot", weight: 2 },
        { id: "jal_ak", weight: 2 },
        { id: "jal_mejrah", weight: 2 },
    ],
]);

// JalTok-Jad and his healers, the Jal-Zek champion and the TzHaar-Ket
// champion, then three JalTok-Jads at once
export const INFERNO_EVENTS: RunEventDef[] = [
    { at: 100, kind: "elite", enemyId: "jal_mejrah" },
    { at: 150, kind: "elite", enemyId: "tzhaar_mej" },
    { at: 200, kind: "elite", enemyId: "tzhaar_ket" },
    { at: 250, kind: "elite", enemyId: "jal_ak" },
    { at: 300, kind: "boss", enemyId: "jaltok_jad", hp: 3400 },
    { at: 330, kind: "ring", enemyId: "jal_nib", count: 30 },
    { at: 390, kind: "elite", enemyId: "jal_imkot" },
    { at: 450, kind: "boss", enemyId: "jal_zek_champion", hp: 6200 },
    { at: 480, kind: "elite", enemyId: "jal_ak" },
    { at: 540, kind: "elite", enemyId: "jal_xil" },
    { at: 600, kind: "boss", enemyId: "tzhaar_ket_champion", hp: 7400 },
    { at: 620, kind: "ring", enemyId: "jal_mejrah", count: 40 },
    { at: 660, kind: "elite", enemyId: "jal_imkot" },
    { at: 720, kind: "elite", enemyId: "jal_xil" },
    { at: 780, kind: "elite", enemyId: "jal_zek" },
    { at: 840, kind: "ring", enemyId: "jal_nib", count: 60 },
    { at: 870, kind: "elite", enemyId: "jal_zek" },
    // Each of the three has this many hitpoints; the run's won when the last
    // of them falls
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "jaltok_jad_finale", hp: 8800 },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "jaltok_jad_finale", hp: 8800 },
    { at: RUN_LENGTH, kind: "finalBoss", enemyId: "jaltok_jad_finale", hp: 8800 },
];
