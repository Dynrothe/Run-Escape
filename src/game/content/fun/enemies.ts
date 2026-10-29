import { DEFAULT_MALE_KITS, EquipSlot } from "../../../rs/model/player/PlayerModelLoader";
import { BossAttackDef, EnemyDef, EnemyOutfit, EnemyShotDef, EnemySpawnsDef } from "../types";

// The fun maps' enemies: other players. They're drawn as players in outfits
// (EnemyDef.outfits, one picked at random for each), fight with player
// animations, and say things (EnemyDef.chat). Item ids are checked against the
// cache by name (scripts/cache/check-fun-outfits.ts).

// Player animations: stand 808, walk 819, death 836, the ditch jump 6132, and
// an attack per weapon
const STAND = 808;
const WALK = 819;
const DEATH = 836;
// Over the Wilderness Ditch
const DITCH_JUMP = 6132;
const PUNCH = 422;
const SCIMITAR_SLASH = 390;
const TWO_HANDED_SLASH = 7045;
const WHIP_LASH = 1658;
const BOW_SHOT = 426;
const CROSSBOW_SHOT = 4230;
const CAST = 711;
const BURST_CAST = 1979;
const STAB = 386;
const AGS_SPEC = 7644;
const HUMAN_SOUNDS = { attack: 2564, hit: 513, death: 512 };

// Items, by name in the cache
const ITEM = {
    // Gear anyone has
    bronzeSword: 1277,
    bronzePlatebody: 1117,
    bronzePlatelegs: 1075,
    woodenShield: 1171,
    ironScimitar: 1323,
    ironFullHelm: 1153,
    ironPlatebody: 1115,
    ironPlatelegs: 1067,
    leatherBody: 1129,
    leatherChaps: 1095,
    leatherBoots: 1061,
    leatherVambraces: 1063,
    coif: 1169,
    studdedBody: 1133,
    studdedChaps: 1097,
    wizardHat: 1017,
    blueWizardRobe: 577,
    blueSkirt: 1011,
    wizardBoots: 2579,
    staffOfAir: 1381,
    staffOfFire: 1387,
    monkRobeTop: 544,
    monkRobe: 542,
    zamorakMonkTop: 1035,
    zamorakMonkBottom: 1033,
    // Rune, and the F2P pker's kit
    runeFullHelm: 1163,
    runeMedHelm: 1147,
    runePlatebody: 1127,
    runePlatelegs: 1079,
    runeKiteshield: 1201,
    runeScimitar: 1333,
    rune2hSword: 1319,
    runeWarhammer: 1347,
    runeBattleaxe: 1373,
    runeBoots: 4131,
    runePickaxe: 1275,
    greenDhideBody: 1135,
    greenDhideChaps: 1099,
    greenDhideVambraces: 1065,
    mapleShortbow: 853,
    magicShortbow: 861,
    amuletOfPower: 1731,
    amuletOfStrength: 1725,
    amuletOfGlory: 1704,
    teamCapes: [4315, 4333, 4357, 4379],
    // Riches
    partyhats: [1038, 1040, 1042, 1044, 1046, 1048],
    greenPartyhat: 1044,
    halloweenMasks: [1053, 1055, 1057],
    santaHat: 1050,
    gildedPlatebody: 3481,
    gildedPlatelegs: 3483,
    gildedFullHelm: 3486,
    gildedKiteshield: 3488,
    runePlatebodyG: 2615,
    runePlatelegsG: 2617,
    runeFullHelmG: 2619,
    runeKiteshieldG: 2621,
    mimeMask: 3057,
    mimeTop: 3058,
    mimeLegs: 3059,
    constructionCapeT: 9790,
    // Obsidian, and Durial's kit
    abyssalWhip: 4151,
    fireCape: 6570,
    toktzKetXil: 6524,
    obsidianCape: 6568,
    tzhaarKetOm: 6528,
    berserkerNecklace: 11128,
    dragonScimitar: 4587,
    robinHoodHat: 2581,
    rangerBoots: 2577,
    blackDhideBody: 2503,
    blackDhideChaps: 2497,
    // Last Man Standing's loadouts and loot
    helmOfNeitiznot: 10828,
    imbuedGuthixCape: 21793,
    karilsLeathertop: 4736,
    toragsPlatelegs: 4751,
    dragonDefender: 12954,
    barrowsGloves: 7462,
    dragonClaws: 13652,
    armadylGodsword: 11802,
    ahrimsRobetop: 4712,
    ahrimsRobeskirt: 4714,
    ahrimsStaff: 4710,
    dharoksHelm: 4716,
    dharoksPlatebody: 4720,
    dharoksPlatelegs: 4722,
    dharoksGreataxe: 4718,
    berserkerHelm: 3751,
    runeDefender: 8850,
    climbingBoots: 3105,
    dragonDagger: 1215,
    runeCrossbow: 9185,
    mysticRobeTop: 4091,
    mysticRobeBottom: 4093,
    ghostlyHood: 6109,
    ghostlyRobe: 6107,
    ghostlyRobeBottom: 6108,
    ancientStaff: 4675,
    unholyBook: 3842,
    mithrilGloves: 7458,
    amuletOfFury: 6585,
    infernalCape: 21295,
    // Castle Wars: the teams' hoods and cloaks, the decorative armour bought
    // with tickets (red, then white, then gold), the flags, and Zamorak's
    // d'hide for the team's rangers
    saradominHood: 4513,
    saradominCloak: 4514,
    zamorakHood: 4515,
    zamorakCloak: 4516,
    redDecorativeSword: 4068,
    redDecorativeArmourTop: 4069,
    redDecorativeArmourLegs: 4070,
    redDecorativeHelm: 4071,
    redDecorativeShield: 4072,
    whiteDecorativeSword: 4503,
    whiteDecorativeArmourTop: 4504,
    whiteDecorativeArmourLegs: 4505,
    whiteDecorativeHelm: 4506,
    whiteDecorativeShield: 4507,
    goldDecorativeSword: 4508,
    goldDecorativeArmourTop: 4509,
    goldDecorativeArmourLegs: 4510,
    goldDecorativeHelm: 4511,
    goldDecorativeShield: 4512,
    saradominBanner: 4037,
    zamorakBanner: 4039,
    zamorakDhideBody: 10370,
    zamorakChaps: 10372,
} as const;

// Ids every outfit checks against the cache, with the name they're under
export const FUN_OUTFIT_ITEMS: Record<number, string> = {};

const S = EquipSlot;

// Body colours (hair, torso, legs, feet, skin) for the outfits that leave
// clothes showing, so a crowd isn't all one look
const COLOUR_SETS = [
    [0, 0, 0, 0, 0],
    [3, 7, 5, 2, 1],
    [7, 11, 9, 4, 2],
    [12, 3, 13, 1, 3],
    [5, 15, 2, 3, 0],
];

function outfit(equipment: Partial<Record<number, number>>, colors?: number[]): EnemyOutfit {
    return colors ? { equipment, colors } : { equipment };
}

// A male hair kit and a hair colour from character creation
const LONG_HAIR = 2;
const WHITE_HAIR = 1;

// One outfit per colour set, for the plain ones
function coloured(equipment: Partial<Record<number, number>>, sets = 3): EnemyOutfit[] {
    return COLOUR_SETS.slice(0, sets).map((colors) => outfit(equipment, colors));
}

// A player enemy: player animations and sounds, a person's size
function player(
    def: Omit<EnemyDef, "npcId" | "idleSeq" | "walkSeq" | "deathSeq" | "sounds" | "radius"> & {
        radius?: number;
    },
): EnemyDef {
    return {
        npcId: -1,
        idleSeq: STAND,
        walkSeq: WALK,
        deathSeq: DEATH,
        jumpSeq: DITCH_JUMP,
        sounds: HUMAN_SOUNDS,
        radius: 0.35,
        ...def,
    };
}

// Spells and arrows, from the cache's spot animations
const FIRE_STRIKE: EnemyShotDef = {
    range: 7,
    interval: 3,
    speed: 9,
    castSpotAnim: 99,
    spotAnim: 100,
    impactSpotAnim: 101,
    seq: CAST,
    sound: 160,
};
const FIRE_BLAST: EnemyShotDef = {
    range: 8,
    interval: 3.2,
    speed: 10,
    castSpotAnim: 129,
    spotAnim: 130,
    impactSpotAnim: 131,
    seq: CAST,
    sound: 160,
};
const FIRE_WAVE: EnemyShotDef = {
    range: 8,
    interval: 3.2,
    speed: 10,
    castSpotAnim: 155,
    spotAnim: 156,
    impactSpotAnim: 157,
    seq: CAST,
    sound: 160,
};
// Adamant (13) and rune (15) arrows in flight, and a crossbow bolt (27). They
// fly slower than spells, so there's time to step out of the way.
function arrows(spotAnim: number, range = 8): EnemyShotDef {
    return { range, interval: 2.6, speed: 7, spotAnim, seq: BOW_SHOT, sound: 2707 };
}
const BOLTS: EnemyShotDef = {
    range: 8,
    interval: 2.8,
    speed: 8,
    spotAnim: 27,
    seq: CROSSBOW_SHOT,
    sound: 2707,
};

// ---------------------------------------------------------------- Grand Exchange

const SPAM_LINES = [
    "Selling gf 10k",
    "Buying gf",
    "Trimming armour free!",
    "Doubling money!",
    "Join cc for giveaway",
    "Selling lobbies 150 ea",
    "Dice 55x2 hosting",
    "Anti-lure guaranteed",
    "Free stuff at fally, follow me",
    "Drop party at edge!!",
    "Check site for free bonds",
    "Selling 1k nats cheap",
];

const SCAM_LINES = [
    "Doubling money! Trust trade",
    "Trimming armour free!",
    "Give me 1gp and I'll double it",
    "Trust me",
    "Wanna see a magic trick?",
    "I'm doing a giveaway, just trade",
    "Trade me your phat, get 2 back",
    "Test trade first, then the big one",
];

const LURE_LINES = [
    "Free stuff in the wildy, follow me",
    "Need your tabs, buy limit",
    "Clan pk trip, bring gear",
    "Come to edge, I'll pay you 1m",
    "There's an anti-lure, trust me",
    "Help, a guy is killing me in wildy!",
    "Be in my video?",
];

const MERCH_LINES = [
    "Margins!",
    "Buying rune ess 5gp",
    "Merching phats",
    "Crash the market!",
    "Buying all logs",
    "Selling at mid",
];

const FAKE_MOD_LINES = [
    "This is a Jagex moderator",
    "Tell me your pass to verify your account",
    "Your account will be banned",
    "Jagex staff will never ask for... ok I will",
    "Type ::bank to keep your items",
];

const GE_ENEMIES: EnemyDef[] = [
    player({
        id: "spam_bot",
        name: "Spam bot",
        attackSeq: PUNCH,
        hp: 5,
        damage: 1,
        speed: 1.8,
        xp: 5,
        // Bots all look alike: fresh accounts, or the same starter armour
        outfits: [
            outfit({}),
            outfit({}),
            outfit({
                [S.HEAD]: ITEM.ironFullHelm,
                [S.TORSO]: ITEM.ironPlatebody,
                [S.LEGS]: ITEM.ironPlatelegs,
            }),
        ],
        chat: SPAM_LINES,
    }),
    player({
        id: "scammer",
        name: "Scammer",
        attackSeq: PUNCH,
        hp: 16,
        damage: 3,
        speed: 2,
        xp: 10,
        // Rich-looking, to be trusted
        outfits: [
            outfit({
                [S.HEAD]: ITEM.partyhats[0],
                [S.TORSO]: ITEM.gildedPlatebody,
                [S.LEGS]: ITEM.gildedPlatelegs,
            }),
            outfit({
                [S.HEAD]: ITEM.partyhats[2],
                [S.TORSO]: ITEM.runePlatebodyG,
                [S.LEGS]: ITEM.runePlatelegsG,
            }),
            outfit({
                [S.HEAD]: ITEM.halloweenMasks[0],
                [S.TORSO]: ITEM.gildedPlatebody,
                [S.LEGS]: ITEM.gildedPlatelegs,
            }),
            outfit({ [S.HEAD]: ITEM.santaHat, [S.TORSO]: ITEM.mimeTop, [S.LEGS]: ITEM.mimeLegs }),
            outfit(
                { [S.HEAD]: ITEM.partyhats[4], [S.AMULET]: ITEM.amuletOfGlory },
                [4, 9, 6, 1, 1],
            ),
        ],
        chat: SCAM_LINES,
    }),
    player({
        id: "lurer",
        name: "Lurer",
        attackSeq: SCIMITAR_SLASH,
        hp: 26,
        damage: 3,
        speed: 2.2,
        xp: 14,
        // Team capes and full rune, dressed for the trip
        outfits: ITEM.teamCapes.map((cape) =>
            outfit({
                [S.CAPE]: cape,
                [S.HEAD]: ITEM.runeFullHelm,
                [S.TORSO]: ITEM.runePlatebody,
                [S.LEGS]: ITEM.runePlatelegs,
                [S.WEAPON]: ITEM.runeScimitar,
            }),
        ),
        chat: LURE_LINES,
    }),
    player({
        id: "gold_farmer",
        name: "Gold farmer",
        attackSeq: PUNCH,
        hp: 40,
        damage: 4,
        speed: 1.6,
        xp: 22,
        knockbackResist: 0.3,
        outfits: coloured(
            {
                [S.HEAD]: ITEM.ironFullHelm,
                [S.TORSO]: ITEM.ironPlatebody,
                [S.LEGS]: ITEM.ironPlatelegs,
                [S.WEAPON]: ITEM.runePickaxe,
            },
            1,
        ),
        chat: ["...", "selling 1k ess", "mining 1-99", "afk", "bot? no"],
    }),
    player({
        id: "fake_mod",
        name: "Fake moderator",
        attackSeq: CAST,
        hp: 44,
        damage: 4,
        speed: 1.9,
        xp: 28,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.wizardHat,
                [S.TORSO]: ITEM.blueWizardRobe,
                [S.LEGS]: ITEM.blueSkirt,
                [S.WEAPON]: ITEM.staffOfAir,
            }),
        ],
        shot: FIRE_STRIKE,
        chat: FAKE_MOD_LINES,
    }),
    player({
        id: "merchant",
        name: "Merchant",
        attackSeq: PUNCH,
        hp: 60,
        damage: 6,
        speed: 2,
        xp: 34,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.gildedFullHelm,
                [S.TORSO]: ITEM.gildedPlatebody,
                [S.LEGS]: ITEM.gildedPlatelegs,
                [S.SHIELD]: ITEM.gildedKiteshield,
            }),
            outfit({
                [S.HEAD]: ITEM.runeFullHelmG,
                [S.TORSO]: ITEM.runePlatebodyG,
                [S.LEGS]: ITEM.runePlatelegsG,
                [S.SHIELD]: ITEM.runeKiteshieldG,
            }),
            outfit({
                [S.HEAD]: ITEM.partyhats[5],
                [S.AMULET]: ITEM.amuletOfGlory,
                [S.TORSO]: ITEM.gildedPlatebody,
                [S.LEGS]: ITEM.gildedPlatelegs,
            }),
        ],
        chat: MERCH_LINES,
    }),
];

// The Grand Exchange's bosses
const GE_BOSSES: EnemyDef[] = [
    player({
        id: "the_doubler",
        name: "The Doubler",
        attackSeq: PUNCH,
        hp: 1800,
        damage: 0,
        speed: 2.2,
        radius: 0.45,
        xp: 600,
        scale: 1.25,
        knockbackResist: 0.9,
        spawnMessage: "The Doubler is taking trades!",
        outfits: [
            outfit({
                [S.HEAD]: ITEM.partyhats[0],
                [S.TORSO]: ITEM.gildedPlatebody,
                [S.LEGS]: ITEM.gildedPlatelegs,
                [S.AMULET]: ITEM.amuletOfGlory,
                [S.CAPE]: ITEM.teamCapes[0],
            }),
        ],
        boss: {
            attackInterval: 2,
            enrage: { message: "The Doubler wants it all now!", shout: "Last chance to double!" },
            attacks: [
                {
                    name: "Trust trade",
                    kind: "projectile",
                    damage: 3,
                    windup: 0.6,
                    cooldown: 4,
                    range: 10,
                    weight: 3,
                    speed: 10,
                    spotAnim: 130,
                    impactSpotAnim: 131,
                    // Takes some coins; they come back when he's dealt with
                    effect: { kind: "steal", fraction: 0.15 },
                    shout: "Trust trade! I'll double it!",
                    sound: 160,
                },
                {
                    name: "Swindle",
                    kind: "swing",
                    damage: 5,
                    windup: 0.8,
                    cooldown: 0,
                    range: 2.5,
                    radius: 2.2,
                    weight: 3,
                    seq: PUNCH,
                    sound: 2500,
                },
                {
                    name: "Vanish",
                    kind: "teleport",
                    damage: 0,
                    windup: 0.5,
                    cooldown: 8,
                    range: 3,
                    radius: 7,
                    weight: 1,
                    shout: "Sorry, lag!",
                },
            ],
        },
    }),
    player({
        id: "lure_master",
        name: "Lure master",
        attackSeq: SCIMITAR_SLASH,
        hp: 2200,
        damage: 0,
        speed: 2.4,
        radius: 0.45,
        xp: 700,
        scale: 1.25,
        knockbackResist: 0.9,
        spawnMessage: "The Lure master has free stuff, just follow him!",
        outfits: [
            outfit({
                [S.CAPE]: ITEM.teamCapes[2],
                [S.HEAD]: ITEM.runeFullHelmG,
                [S.TORSO]: ITEM.runePlatebodyG,
                [S.LEGS]: ITEM.runePlatelegsG,
                [S.WEAPON]: ITEM.dragonScimitar,
                [S.AMULET]: ITEM.amuletOfGlory,
            }),
        ],
        boss: {
            attackInterval: 1.8,
            enrage: { message: "The Lure master calls in his clan!", shout: "Now, clan! Get him!" },
            attacks: [
                {
                    name: "Slash",
                    kind: "swing",
                    damage: 5,
                    windup: 0.7,
                    cooldown: 0,
                    range: 2.5,
                    radius: 2.2,
                    weight: 3,
                    seq: SCIMITAR_SLASH,
                    sound: 2500,
                },
                {
                    name: "Bring friends",
                    kind: "summon",
                    damage: 0,
                    windup: 1,
                    cooldown: 10,
                    range: 14,
                    weight: 2,
                    summon: { enemyId: "lurer", count: 6 },
                    shout: "Follow me, free stuff!",
                },
                {
                    name: "Tele-block",
                    kind: "projectile",
                    damage: 2,
                    windup: 0.5,
                    cooldown: 6,
                    range: 10,
                    weight: 2,
                    speed: 9,
                    spotAnim: 156,
                    impactSpotAnim: 157,
                    // Lured: stuck in place a moment
                    effect: { kind: "freeze", seconds: 1.5 },
                    shout: "No escape!",
                    seq: CAST,
                    sound: 160,
                },
            ],
        },
    }),
    player({
        id: "bot_farm",
        name: "Bot farmer",
        attackSeq: PUNCH,
        hp: 2600,
        damage: 0,
        speed: 1.8,
        radius: 0.45,
        xp: 800,
        scale: 1.4,
        knockbackResist: 0.95,
        spawnMessage: "A Bot farmer logs in a hundred accounts!",
        outfits: [
            outfit({
                [S.HEAD]: ITEM.ironFullHelm,
                [S.TORSO]: ITEM.ironPlatebody,
                [S.LEGS]: ITEM.ironPlatelegs,
                [S.WEAPON]: ITEM.runePickaxe,
            }),
        ],
        boss: {
            attackInterval: 2,
            enrage: { message: "The Bot farmer runs the script faster!", shout: "script.exe" },
            attacks: [
                {
                    name: "Log in bots",
                    kind: "summon",
                    damage: 0,
                    windup: 0.8,
                    cooldown: 6,
                    range: 16,
                    weight: 3,
                    summon: { enemyId: "spam_bot", count: 10 },
                    shout: "Selling gf 10k",
                },
                {
                    name: "Pickaxe",
                    kind: "swing",
                    damage: 6,
                    windup: 0.9,
                    cooldown: 0,
                    range: 2.5,
                    radius: 2.4,
                    weight: 2,
                    seq: PUNCH,
                    sound: 2500,
                },
            ],
        },
    }),
    // A noob at the Grand Exchange, and everyone there knows it
    player({
        id: "melodox",
        name: "Melodox",
        attackSeq: PUNCH,
        hp: 2600,
        damage: 0,
        speed: 1.8,
        radius: 0.45,
        xp: 800,
        scale: 1.4,
        knockbackResist: 0.95,
        spawnMessage: "Melodox has arrived at the Grand Exchange. Lvl 3 btw.",
        outfits: [
            outfit({
                [S.TORSO]: ITEM.bronzePlatebody,
                [S.LEGS]: ITEM.bronzePlatelegs,
                [S.WEAPON]: ITEM.bronzeSword,
                [S.SHIELD]: ITEM.woodenShield,
            }),
        ],
        chat: [
            "can i have free stuff",
            "buying gf 1k",
            "pls 10k",
            "how do i trade",
            "get scammed",
            "trade me to get scammed",
        ],
        boss: {
            attackInterval: 2,
            enrage: { message: "Melodox got scammed, and he's furious!", shout: "I GOT SCAMMED" },
            attacks: [
                {
                    name: "Free stuff pls",
                    kind: "summon",
                    damage: 0,
                    windup: 0.8,
                    cooldown: 7,
                    range: 16,
                    weight: 3,
                    // Scammers can smell a noob
                    summon: { enemyId: "scammer", count: 6 },
                    shout: "can i have free stuff pls",
                },
                {
                    name: "Noob punch",
                    kind: "swing",
                    damage: 6,
                    windup: 0.9,
                    cooldown: 0,
                    range: 2.5,
                    radius: 2.4,
                    weight: 2,
                    seq: PUNCH,
                    sound: 2500,
                },
                {
                    name: "Fire Strike",
                    kind: "projectile",
                    damage: 3,
                    windup: 0.6,
                    cooldown: 4,
                    range: 10,
                    weight: 2,
                    speed: 9,
                    castSpotAnim: 99,
                    spotAnim: 100,
                    impactSpotAnim: 101,
                    seq: CAST,
                    sound: 160,
                    shout: "i learned magic!!",
                },
                {
                    name: "Tantrum",
                    kind: "swing",
                    damage: 8,
                    windup: 0.7,
                    cooldown: 3,
                    range: 2.8,
                    radius: 2.8,
                    weight: 2,
                    seq: PUNCH,
                    sound: 2500,
                    shout: "MOM!!",
                    enraged: true,
                },
            ],
        },
    }),
];

// ---------------------------------------------------------------- East Varrock

const PK_LINES = [
    "sit",
    "1v1 me",
    "ez",
    "u risk?",
    "no arm",
    "gf",
    "noob",
    "gfg",
    "lol",
    "hop",
    "LOL",
    "sit kid",
];
const RAG_LINES = ["rag", "lol", "hop", "pjed", "lure?", "no food lol"];
const MAGE_LINES = ["freeze", "bye", "pjed", "ez", "splash lol"];
const TANK_LINES = ["multi pls", "cant hit me", "tank mode", "lol 0s", "no ko"];

// F2P only: no members' gear
const RUNE_PKER_LOOKS: EnemyOutfit[] = [
    outfit({
        [S.HEAD]: ITEM.runeFullHelm,
        [S.TORSO]: ITEM.runePlatebody,
        [S.LEGS]: ITEM.runePlatelegs,
        [S.WEAPON]: ITEM.runeScimitar,
        [S.AMULET]: ITEM.amuletOfStrength,
    }),
    outfit({
        [S.HEAD]: ITEM.runeMedHelm,
        [S.TORSO]: ITEM.greenDhideBody,
        [S.LEGS]: ITEM.runePlatelegs,
        [S.WEAPON]: ITEM.runeScimitar,
        [S.AMULET]: ITEM.amuletOfPower,
        [S.CAPE]: ITEM.teamCapes[1],
    }),
    outfit({
        [S.HEAD]: ITEM.runeFullHelm,
        [S.TORSO]: ITEM.runePlatebody,
        [S.LEGS]: ITEM.runePlatelegs,
        [S.SHIELD]: ITEM.runeKiteshield,
        [S.WEAPON]: ITEM.runeScimitar,
        [S.CAPE]: ITEM.teamCapes[3],
    }),
];

const EAST_VARROCK_ENEMIES: EnemyDef[] = [
    player({
        id: "clan_noob",
        name: "Clan noob",
        attackSeq: SCIMITAR_SLASH,
        hp: 8,
        damage: 2,
        speed: 1.9,
        xp: 6,
        outfits: ITEM.teamCapes.map((cape, i) =>
            outfit(
                {
                    [S.CAPE]: cape,
                    [S.WEAPON]: ITEM.ironScimitar,
                    [S.HEAD]: i % 2 ? ITEM.ironFullHelm : -1,
                },
                COLOUR_SETS[i],
            ),
        ),
        chat: ["noob", "sit", "where r we going", "multi?", "follow leader"],
    }),
    player({
        id: "f2p_ranger",
        name: "Ranger",
        attackSeq: BOW_SHOT,
        hp: 16,
        damage: 2,
        speed: 2,
        xp: 10,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.coif,
                [S.TORSO]: ITEM.greenDhideBody,
                [S.LEGS]: ITEM.greenDhideChaps,
                [S.HANDS]: ITEM.greenDhideVambraces,
                [S.WEAPON]: ITEM.mapleShortbow,
                [S.AMULET]: ITEM.amuletOfPower,
            }),
            outfit({
                [S.HEAD]: ITEM.coif,
                [S.TORSO]: ITEM.leatherBody,
                [S.LEGS]: ITEM.greenDhideChaps,
                [S.HANDS]: ITEM.leatherVambraces,
                [S.WEAPON]: ITEM.mapleShortbow,
                [S.CAPE]: ITEM.teamCapes[0],
            }),
        ],
        shot: arrows(13),
        chat: RAG_LINES,
    }),
    player({
        id: "rune_pker",
        name: "Pker",
        attackSeq: SCIMITAR_SLASH,
        hp: 26,
        damage: 3,
        speed: 2.1,
        xp: 14,
        outfits: RUNE_PKER_LOOKS,
        chat: PK_LINES,
    }),
    player({
        id: "f2p_mage",
        name: "Mage",
        attackSeq: CAST,
        hp: 38,
        damage: 3,
        speed: 1.9,
        xp: 22,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.wizardHat,
                [S.TORSO]: ITEM.zamorakMonkTop,
                [S.LEGS]: ITEM.zamorakMonkBottom,
                [S.WEAPON]: ITEM.staffOfFire,
            }),
            outfit({
                [S.HEAD]: ITEM.wizardHat,
                [S.TORSO]: ITEM.blueWizardRobe,
                [S.LEGS]: ITEM.blueSkirt,
                [S.WEAPON]: ITEM.staffOfFire,
                [S.AMULET]: ITEM.amuletOfPower,
            }),
        ],
        shot: FIRE_BLAST,
        chat: MAGE_LINES,
    }),
    player({
        id: "pure",
        name: "Pure",
        attackSeq: TWO_HANDED_SLASH,
        hp: 40,
        damage: 5,
        speed: 2.6,
        xp: 24,
        // One defence, two-hander, amulet of strength
        outfits: [
            outfit({
                [S.HEAD]: ITEM.coif,
                [S.TORSO]: ITEM.leatherBody,
                [S.LEGS]: ITEM.leatherChaps,
                [S.WEAPON]: ITEM.rune2hSword,
                [S.AMULET]: ITEM.amuletOfStrength,
            }),
            outfit({
                [S.TORSO]: ITEM.monkRobeTop,
                [S.LEGS]: ITEM.monkRobe,
                [S.WEAPON]: ITEM.rune2hSword,
                [S.AMULET]: ITEM.amuletOfStrength,
                [S.CAPE]: ITEM.teamCapes[2],
            }),
        ],
        chat: ["ko", "2h ko lol", "gfg", "rush", "sit"],
    }),
    player({
        id: "tank",
        name: "Tank",
        attackSeq: PUNCH,
        hp: 64,
        damage: 5,
        speed: 1.6,
        xp: 34,
        knockbackResist: 0.5,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.runeFullHelm,
                [S.TORSO]: ITEM.runePlatebody,
                [S.LEGS]: ITEM.runePlatelegs,
                [S.SHIELD]: ITEM.runeKiteshield,
                [S.WEAPON]: ITEM.runeWarhammer,
                [S.FEET]: ITEM.runeBoots,
            }),
            outfit({
                [S.HEAD]: ITEM.runeFullHelm,
                [S.TORSO]: ITEM.runePlatebody,
                [S.LEGS]: ITEM.runePlatelegs,
                [S.SHIELD]: ITEM.runeKiteshield,
                [S.WEAPON]: ITEM.runeBattleaxe,
                [S.CAPE]: ITEM.teamCapes[1],
            }),
        ],
        chat: TANK_LINES,
    }),
];

const EAST_VARROCK_BOSSES: EnemyDef[] = [
    player({
        id: "clan_leader",
        name: "Clan leader",
        attackSeq: SCIMITAR_SLASH,
        hp: 1800,
        damage: 0,
        speed: 2.3,
        radius: 0.45,
        xp: 600,
        scale: 1.25,
        knockbackResist: 0.9,
        spawnMessage: "A Clan leader calls the pile!",
        outfits: [
            outfit({
                [S.CAPE]: ITEM.teamCapes[3],
                [S.HEAD]: ITEM.runeFullHelm,
                [S.TORSO]: ITEM.runePlatebody,
                [S.LEGS]: ITEM.runePlatelegs,
                [S.WEAPON]: ITEM.runeScimitar,
                [S.AMULET]: ITEM.amuletOfPower,
            }),
        ],
        boss: {
            attackInterval: 1.8,
            enrage: { message: "The Clan leader calls everyone in!", shout: "EVERYONE PILE!" },
            attacks: [
                {
                    name: "Call the pile",
                    kind: "summon",
                    damage: 0,
                    windup: 0.8,
                    cooldown: 8,
                    range: 16,
                    weight: 3,
                    summon: { enemyId: "clan_noob", count: 8 },
                    shout: "Pile him!",
                },
                {
                    name: "Slash",
                    kind: "swing",
                    damage: 5,
                    windup: 0.7,
                    cooldown: 0,
                    range: 2.5,
                    radius: 2.2,
                    weight: 3,
                    seq: SCIMITAR_SLASH,
                    sound: 2500,
                },
                {
                    name: "Bring the rangers",
                    kind: "summon",
                    damage: 0,
                    windup: 0.8,
                    cooldown: 14,
                    range: 16,
                    weight: 1,
                    enraged: true,
                    summon: { enemyId: "f2p_ranger", count: 4 },
                    shout: "Rangers, rag him!",
                },
            ],
        },
    }),
    player({
        id: "rune_2h_pure",
        name: "Rune 2h pure",
        attackSeq: TWO_HANDED_SLASH,
        hp: 1500,
        damage: 0,
        speed: 2.8,
        radius: 0.45,
        xp: 600,
        scale: 1.25,
        knockbackResist: 0.8,
        spawnMessage: "A Rune 2h pure is looking for a KO!",
        outfits: [
            outfit({
                [S.HEAD]: ITEM.coif,
                [S.TORSO]: ITEM.leatherBody,
                [S.LEGS]: ITEM.leatherChaps,
                [S.WEAPON]: ITEM.rune2hSword,
                [S.AMULET]: ITEM.amuletOfStrength,
                [S.CAPE]: ITEM.teamCapes[0],
            }),
        ],
        boss: {
            attackInterval: 2.2,
            enrage: { message: "The pure eats a strength potion!", shout: "KO KO KO" },
            attacks: [
                {
                    name: "Two-hander",
                    kind: "swing",
                    damage: 9,
                    windup: 1,
                    cooldown: 0,
                    range: 2.8,
                    radius: 2.6,
                    weight: 3,
                    seq: TWO_HANDED_SLASH,
                    sound: 2500,
                    shout: "KO!",
                },
                {
                    name: "Rush",
                    kind: "blast",
                    damage: 6,
                    windup: 0.9,
                    cooldown: 5,
                    range: 10,
                    minRange: 3.5,
                    radius: 2,
                    weight: 2,
                    leap: true,
                    seq: TWO_HANDED_SLASH,
                    sound: 2500,
                },
            ],
        },
    }),
    player({
        id: "wildy_mage",
        name: "Wildy mage",
        attackSeq: CAST,
        hp: 1600,
        damage: 0,
        speed: 2.2,
        radius: 0.45,
        xp: 600,
        scale: 1.25,
        knockbackResist: 0.9,
        spawnMessage: "A Wildy mage is binding everyone!",
        outfits: [
            outfit({
                [S.HEAD]: ITEM.wizardHat,
                [S.TORSO]: ITEM.zamorakMonkTop,
                [S.LEGS]: ITEM.zamorakMonkBottom,
                [S.WEAPON]: ITEM.staffOfFire,
                [S.AMULET]: ITEM.amuletOfPower,
                [S.CAPE]: ITEM.teamCapes[2],
            }),
        ],
        boss: {
            attackInterval: 1.8,
            keepDistance: 7,
            enrage: { message: "The Wildy mage casts faster!", shout: "Splash splash" },
            attacks: [
                {
                    name: "Fire Blast",
                    kind: "projectile",
                    damage: 4,
                    windup: 0.5,
                    cooldown: 0,
                    range: 12,
                    weight: 3,
                    speed: 11,
                    castSpotAnim: 129,
                    spotAnim: 130,
                    impactSpotAnim: 131,
                    seq: CAST,
                    sound: 160,
                },
                {
                    name: "Bind",
                    kind: "projectile",
                    damage: 1,
                    windup: 0.5,
                    cooldown: 7,
                    range: 12,
                    weight: 1,
                    speed: 10,
                    spotAnim: 156,
                    impactSpotAnim: 157,
                    effect: { kind: "freeze", seconds: 1.5 },
                    shout: "freeze",
                    seq: CAST,
                    sound: 160,
                },
                {
                    name: "Fire Blast barrage",
                    kind: "projectile",
                    damage: 3,
                    windup: 0.6,
                    cooldown: 5,
                    range: 12,
                    weight: 2,
                    speed: 10,
                    count: 3,
                    spread: 0.3,
                    spotAnim: 130,
                    impactSpotAnim: 131,
                    seq: CAST,
                    sound: 160,
                    enraged: true,
                },
            ],
        },
    }),
];

// ---------------------------------------------------------------- Falador

// What the crowd said while Durial321 killed them. No transcript survives, so
// these are in the spirit of the descriptions (begging to be killed, telling
// everyone to bank, hoping to make history); Durial's own lines are his, from
// his 2006 interview (FALADOR_PLAYER_LINES in maps). Everyone there says the
// crowd's lines as well as their own.
const CROWD_LINES = [
    "LMAO",
    "ROFL",
    "LOL",
    "Run",
    "Tele!",
    ":D:D:D:D",
    "W00T",
    "He's dead",
    "Haha",
    "This is a frekain crusade",
    "Some1 gettin owned!!",
];
const NOOB_LINES = [
    ...CROWD_LINES,
    "kill me durial!!",
    "attack me plz",
    "omg hes killing every1",
    "BANK UR STUFF",
    "run to edge",
    "durial ur a legend",
    "where r the mods",
    "w111 crashing lol",
    "hes in fally bank!!",
    "report him",
    "im gonna be famous",
    "6/6/06 lol",
];
const PARTY_LINES = [
    ...CROWD_LINES,
    "pls give my phat back",
    "it was a party!!",
    "cursed you whats going on",
    "BANK UR STUFF",
    "we were in the ring...",
    "nice party lol",
];

const FALADOR_ENEMIES: EnemyDef[] = [
    player({
        id: "noob",
        name: "Noob",
        attackSeq: PUNCH,
        hp: 4,
        damage: 1,
        speed: 1.6,
        xp: 4,
        outfits: [...coloured({}, 5), outfit({ [S.WEAPON]: ITEM.bronzeSword }, COLOUR_SETS[2])],
        chat: NOOB_LINES,
    }),
    player({
        id: "party_guest",
        name: "Party guest",
        attackSeq: PUNCH,
        hp: 16,
        damage: 3,
        speed: 1.9,
        xp: 10,
        // Partyhats and Santa hats: the rich were there too
        outfits: [
            ...ITEM.partyhats.map((hat, i) =>
                outfit({ [S.HEAD]: hat }, COLOUR_SETS[i % COLOUR_SETS.length]),
            ),
            outfit({ [S.HEAD]: ITEM.santaHat }, COLOUR_SETS[3]),
            outfit(
                { [S.HEAD]: ITEM.halloweenMasks[1], [S.AMULET]: ITEM.amuletOfGlory },
                COLOUR_SETS[4],
            ),
        ],
        chat: PARTY_LINES,
    }),
    player({
        id: "obby_noob",
        name: "Obby noob",
        attackSeq: PUNCH,
        hp: 26,
        damage: 3,
        speed: 1.8,
        xp: 14,
        outfits: [
            outfit({
                [S.CAPE]: ITEM.obsidianCape,
                [S.SHIELD]: ITEM.toktzKetXil,
                [S.WEAPON]: ITEM.tzhaarKetOm,
                [S.AMULET]: ITEM.berserkerNecklace,
                [S.HEAD]: ITEM.runeFullHelm,
            }),
            outfit(
                {
                    [S.CAPE]: ITEM.obsidianCape,
                    [S.WEAPON]: ITEM.tzhaarKetOm,
                    [S.AMULET]: ITEM.berserkerNecklace,
                },
                COLOUR_SETS[1],
            ),
        ],
        chat: [
            ...CROWD_LINES,
            "obby set ftw",
            "kill me durial!!",
            "im maxed (not)",
            "BANK UR STUFF",
        ],
    }),
    player({
        id: "ranger_noob",
        name: "Ranger noob",
        attackSeq: BOW_SHOT,
        hp: 30,
        damage: 3,
        speed: 2,
        xp: 18,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.robinHoodHat,
                [S.TORSO]: ITEM.blackDhideBody,
                [S.LEGS]: ITEM.blackDhideChaps,
                [S.FEET]: ITEM.rangerBoots,
                [S.WEAPON]: ITEM.magicShortbow,
            }),
            outfit({
                [S.HEAD]: ITEM.coif,
                [S.TORSO]: ITEM.greenDhideBody,
                [S.LEGS]: ITEM.greenDhideChaps,
                [S.WEAPON]: ITEM.magicShortbow,
            }),
        ],
        shot: arrows(15),
        chat: [
            ...CROWD_LINES,
            "ranging him!!",
            "everyone range him",
            "he cant get me here",
            "kill me durial!!",
        ],
    }),
    player({
        id: "alcher",
        name: "Alcher",
        attackSeq: CAST,
        hp: 40,
        damage: 4,
        speed: 1.8,
        xp: 24,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.wizardHat,
                [S.TORSO]: ITEM.blueWizardRobe,
                [S.LEGS]: ITEM.blueSkirt,
                [S.WEAPON]: ITEM.staffOfFire,
                [S.FEET]: ITEM.wizardBoots,
            }),
        ],
        shot: FIRE_STRIKE,
        chat: [
            ...CROWD_LINES,
            "alching lol",
            "i was just alching",
            "hes in fally bank!!",
            "where r the mods",
        ],
    }),
    player({
        id: "pk_wannabe",
        name: "Pk wannabe",
        attackSeq: SCIMITAR_SLASH,
        hp: 60,
        damage: 6,
        speed: 2.1,
        xp: 34,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.runeFullHelm,
                [S.TORSO]: ITEM.runePlatebody,
                [S.LEGS]: ITEM.runePlatelegs,
                [S.WEAPON]: ITEM.dragonScimitar,
                [S.AMULET]: ITEM.amuletOfGlory,
            }),
            outfit({
                [S.HEAD]: ITEM.runeFullHelmG,
                [S.TORSO]: ITEM.runePlatebodyG,
                [S.LEGS]: ITEM.runePlatelegsG,
                [S.WEAPON]: ITEM.dragonScimitar,
                [S.CAPE]: ITEM.obsidianCape,
            }),
        ],
        chat: [
            ...CROWD_LINES,
            "i can take him",
            "durial 1v1",
            "lets go to edge",
            "durial ur a legend",
        ],
    }),
];

const FALADOR_BOSSES: EnemyDef[] = [
    player({
        id: "player_moderator",
        name: "Player moderator",
        attackSeq: CAST,
        hp: 1600,
        damage: 0,
        speed: 2.2,
        radius: 0.45,
        xp: 600,
        scale: 1.25,
        knockbackResist: 0.9,
        spawnMessage: "A Player moderator is telling everyone to bank!",
        outfits: [
            outfit({
                [S.HEAD]: ITEM.helmOfNeitiznot,
                [S.TORSO]: ITEM.runePlatebody,
                [S.LEGS]: ITEM.runePlatelegs,
                [S.AMULET]: ITEM.amuletOfGlory,
                [S.WEAPON]: ITEM.staffOfAir,
            }),
        ],
        boss: {
            attackInterval: 1.8,
            keepDistance: 6,
            enrage: { message: "The Player moderator reports you!", shout: "Reported!" },
            attacks: [
                {
                    name: "Bank your items!",
                    kind: "projectile",
                    damage: 4,
                    windup: 0.5,
                    cooldown: 0,
                    range: 12,
                    weight: 3,
                    speed: 11,
                    castSpotAnim: 129,
                    spotAnim: 130,
                    impactSpotAnim: 131,
                    seq: CAST,
                    sound: 160,
                    shout: "Bank your items!",
                },
                {
                    name: "Leave Falador!",
                    kind: "blast",
                    damage: 4,
                    windup: 1.2,
                    cooldown: 5,
                    range: 12,
                    radius: 1.6,
                    weight: 2,
                    count: 4,
                    spread: 3,
                    impactSpotAnim: 157,
                    seq: CAST,
                    sound: 160,
                    shout: "Leave Falador!",
                },
            ],
        },
    }),
    player({
        id: "cursed_you",
        name: "Cursed You",
        attackSeq: PUNCH,
        hp: 2000,
        damage: 0,
        speed: 2.2,
        radius: 0.45,
        xp: 700,
        scale: 1.3,
        knockbackResist: 0.9,
        spawnMessage: "Cursed You wants his party back!",
        // The party host, the first to 99 Construction, in its cape
        outfits: [
            outfit(
                {
                    [S.HEAD]: ITEM.partyhats[1],
                    [S.AMULET]: ITEM.amuletOfGlory,
                    [S.CAPE]: ITEM.constructionCapeT,
                },
                [6, 14, 8, 3, 1],
            ),
        ],
        boss: {
            attackInterval: 2,
            enrage: {
                message: "Cursed You throws everyone out!",
                shout: "Everyone get out of my house!",
            },
            attacks: [
                {
                    name: "House party",
                    kind: "summon",
                    damage: 0,
                    windup: 0.8,
                    cooldown: 8,
                    range: 16,
                    weight: 3,
                    summon: { enemyId: "party_guest", count: 8 },
                    shout: "Party at my house!",
                },
                {
                    name: "Kick out",
                    kind: "swing",
                    damage: 6,
                    windup: 0.8,
                    cooldown: 0,
                    range: 2.5,
                    radius: 2.4,
                    weight: 3,
                    seq: PUNCH,
                    sound: 2500,
                },
            ],
        },
    }),
    player({
        id: "mod_murdoch",
        name: "Mod Murdoch",
        attackSeq: CAST,
        hp: 3000,
        damage: 0,
        speed: 2.4,
        radius: 0.45,
        xp: 1000,
        scale: 1.35,
        knockbackResist: 0.95,
        spawnMessage: "Mod Murdoch has logged in. Uh oh.",
        outfits: [
            outfit({
                [S.HEAD]: ITEM.wizardHat,
                [S.TORSO]: ITEM.blueWizardRobe,
                [S.LEGS]: ITEM.blueSkirt,
                [S.WEAPON]: ITEM.staffOfAir,
                [S.CAPE]: ITEM.imbuedGuthixCape,
                [S.AMULET]: ITEM.amuletOfGlory,
            }),
        ],
        boss: {
            attackInterval: 1.6,
            enrage: { message: "Mod Murdoch opens the ban hammer!", shout: "Account disabled." },
            attacks: [
                {
                    name: "Disconnect",
                    kind: "projectile",
                    damage: 3,
                    windup: 0.6,
                    cooldown: 6,
                    range: 12,
                    weight: 2,
                    speed: 11,
                    spotAnim: 156,
                    impactSpotAnim: 157,
                    // Logged out for a moment
                    effect: { kind: "freeze", seconds: 2 },
                    shout: "Disconnected.",
                    seq: CAST,
                    sound: 160,
                },
                {
                    name: "Ban hammer",
                    kind: "blast",
                    damage: 7,
                    windup: 1.1,
                    cooldown: 4,
                    range: 12,
                    radius: 2,
                    weight: 2,
                    leap: true,
                    seq: 811,
                    sound: 2500,
                    shout: "Rule 7.",
                },
                {
                    name: "Teleport",
                    kind: "teleport",
                    damage: 0,
                    windup: 0.4,
                    cooldown: 7,
                    range: 3,
                    radius: 6,
                    weight: 1,
                    castSpotAnim: 111,
                },
            ],
        },
    }),
];

// ---------------------------------------------------------------- Last Man Standing

const LMS_LINES = [
    "gf",
    "rush me",
    "camping the chest lol",
    "safe zone south",
    "sit",
    "1 left?",
    "no loot rip",
    "fog's coming",
    "spec'd lol",
    "gl",
];

const LMS_ENEMIES: EnemyDef[] = [
    player({
        id: "lms_pure",
        name: "Pure",
        attackSeq: STAB,
        hp: 7,
        damage: 2,
        speed: 2.4,
        xp: 7,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.ghostlyHood,
                [S.TORSO]: ITEM.ghostlyRobe,
                [S.LEGS]: ITEM.ghostlyRobeBottom,
                [S.WEAPON]: ITEM.dragonDagger,
                [S.HANDS]: ITEM.mithrilGloves,
                [S.FEET]: ITEM.climbingBoots,
            }),
            outfit({
                [S.HEAD]: ITEM.ghostlyHood,
                [S.TORSO]: ITEM.ghostlyRobe,
                [S.LEGS]: ITEM.ghostlyRobeBottom,
                [S.WEAPON]: ITEM.ancientStaff,
                [S.SHIELD]: ITEM.unholyBook,
                [S.FEET]: ITEM.climbingBoots,
            }),
        ],
        chat: LMS_LINES,
    }),
    player({
        id: "lms_zerker",
        name: "Zerker",
        attackSeq: STAB,
        hp: 26,
        damage: 3,
        speed: 2.1,
        xp: 14,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.berserkerHelm,
                [S.TORSO]: ITEM.blackDhideBody,
                [S.LEGS]: ITEM.runePlatelegs,
                [S.SHIELD]: ITEM.runeDefender,
                [S.WEAPON]: ITEM.dragonDagger,
                [S.FEET]: ITEM.climbingBoots,
                [S.AMULET]: ITEM.amuletOfGlory,
            }),
        ],
        chat: LMS_LINES,
    }),
    player({
        id: "lms_ranger",
        name: "Crossbow sweat",
        attackSeq: CROSSBOW_SHOT,
        hp: 30,
        damage: 3,
        speed: 2,
        xp: 18,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.berserkerHelm,
                [S.TORSO]: ITEM.blackDhideBody,
                [S.LEGS]: ITEM.blackDhideChaps,
                [S.WEAPON]: ITEM.runeCrossbow,
                [S.FEET]: ITEM.climbingBoots,
            }),
        ],
        shot: BOLTS,
        chat: LMS_LINES,
    }),
    player({
        id: "lms_mage",
        name: "Mystic sweat",
        attackSeq: BURST_CAST,
        hp: 40,
        damage: 4,
        speed: 1.9,
        xp: 24,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.helmOfNeitiznot,
                [S.TORSO]: ITEM.mysticRobeTop,
                [S.LEGS]: ITEM.mysticRobeBottom,
                [S.WEAPON]: ITEM.ahrimsStaff,
                [S.HANDS]: ITEM.barrowsGloves,
                [S.CAPE]: ITEM.imbuedGuthixCape,
            }),
            outfit({
                [S.HEAD]: ITEM.helmOfNeitiznot,
                [S.TORSO]: ITEM.ahrimsRobetop,
                [S.LEGS]: ITEM.ahrimsRobeskirt,
                [S.WEAPON]: ITEM.ancientStaff,
                [S.SHIELD]: ITEM.unholyBook,
            }),
        ],
        shot: FIRE_WAVE,
        chat: LMS_LINES,
    }),
    player({
        id: "lms_med",
        name: "Med",
        attackSeq: WHIP_LASH,
        hp: 48,
        damage: 5,
        speed: 2.1,
        xp: 28,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.helmOfNeitiznot,
                [S.CAPE]: ITEM.imbuedGuthixCape,
                [S.AMULET]: ITEM.amuletOfGlory,
                [S.TORSO]: ITEM.karilsLeathertop,
                [S.LEGS]: ITEM.toragsPlatelegs,
                [S.SHIELD]: ITEM.dragonDefender,
                [S.HANDS]: ITEM.barrowsGloves,
                [S.WEAPON]: ITEM.abyssalWhip,
                [S.FEET]: ITEM.climbingBoots,
            }),
        ],
        chat: LMS_LINES,
    }),
    player({
        id: "lms_maxed",
        name: "Maxed sweat",
        attackSeq: SCIMITAR_SLASH,
        hp: 64,
        damage: 6,
        speed: 2,
        xp: 34,
        knockbackResist: 0.4,
        // Loot from the chests: Dharok's, fury, infernal cape, claws
        outfits: [
            outfit({
                [S.HEAD]: ITEM.dharoksHelm,
                [S.TORSO]: ITEM.dharoksPlatebody,
                [S.LEGS]: ITEM.dharoksPlatelegs,
                [S.WEAPON]: ITEM.dragonClaws,
                [S.AMULET]: ITEM.amuletOfFury,
                [S.CAPE]: ITEM.infernalCape,
            }),
            outfit({
                [S.HEAD]: ITEM.helmOfNeitiznot,
                [S.TORSO]: ITEM.karilsLeathertop,
                [S.LEGS]: ITEM.toragsPlatelegs,
                [S.WEAPON]: ITEM.armadylGodsword,
                [S.AMULET]: ITEM.amuletOfFury,
                [S.CAPE]: ITEM.infernalCape,
            }),
        ],
        chat: LMS_LINES,
    }),
];

// The godsword's The Judgement, for the AGS specer
const JUDGEMENT: BossAttackDef = {
    name: "The Judgement",
    kind: "swing",
    damage: 11,
    windup: 1.2,
    cooldown: 5,
    range: 3,
    radius: 2.8,
    weight: 2,
    seq: AGS_SPEC,
    castSpotAnim: 1211,
    sound: 2500,
    shout: "AGS spec!",
};

const LMS_BOSSES: EnemyDef[] = [
    player({
        id: "ags_specer",
        name: "AGS specer",
        attackSeq: TWO_HANDED_SLASH,
        hp: 1800,
        damage: 0,
        speed: 2.4,
        radius: 0.45,
        xp: 650,
        scale: 1.3,
        knockbackResist: 0.9,
        spawnMessage: "An AGS specer found a bloody key!",
        outfits: [
            outfit({
                [S.HEAD]: ITEM.helmOfNeitiznot,
                [S.TORSO]: ITEM.karilsLeathertop,
                [S.LEGS]: ITEM.toragsPlatelegs,
                [S.WEAPON]: ITEM.armadylGodsword,
                [S.AMULET]: ITEM.amuletOfFury,
                [S.CAPE]: ITEM.infernalCape,
                [S.HANDS]: ITEM.barrowsGloves,
            }),
        ],
        boss: {
            attackInterval: 2,
            enrage: { message: "The AGS specer is out of food and all in!", shout: "dds then ags" },
            attacks: [
                JUDGEMENT,
                {
                    name: "Slash",
                    kind: "swing",
                    damage: 5,
                    windup: 0.8,
                    cooldown: 0,
                    range: 2.6,
                    radius: 2.3,
                    weight: 3,
                    seq: TWO_HANDED_SLASH,
                    sound: 2500,
                },
                {
                    name: "Rush",
                    kind: "blast",
                    damage: 5,
                    windup: 0.9,
                    cooldown: 5,
                    range: 10,
                    minRange: 3.5,
                    radius: 2,
                    weight: 1,
                    leap: true,
                    seq: TWO_HANDED_SLASH,
                    sound: 2500,
                },
            ],
        },
    }),
    player({
        id: "claws_specer",
        name: "Claws specer",
        attackSeq: SCIMITAR_SLASH,
        hp: 1600,
        damage: 0,
        speed: 2.7,
        radius: 0.45,
        xp: 600,
        scale: 1.25,
        knockbackResist: 0.85,
        spawnMessage: "A Claws specer is rushing everyone!",
        outfits: [
            outfit({
                [S.HEAD]: ITEM.berserkerHelm,
                [S.TORSO]: ITEM.blackDhideBody,
                [S.LEGS]: ITEM.runePlatelegs,
                [S.WEAPON]: ITEM.dragonClaws,
                [S.AMULET]: ITEM.amuletOfFury,
                [S.FEET]: ITEM.climbingBoots,
            }),
        ],
        boss: {
            attackInterval: 1.4,
            enrage: { message: "The Claws specer has spec again!", shout: "claw spec!!" },
            attacks: [
                {
                    name: "Slash",
                    kind: "swing",
                    damage: 4,
                    windup: 0.5,
                    cooldown: 0,
                    range: 2.4,
                    radius: 2.1,
                    weight: 3,
                    seq: SCIMITAR_SLASH,
                    sound: 2500,
                },
                {
                    name: "Slice and Dice",
                    kind: "swing",
                    damage: 10,
                    windup: 0.9,
                    cooldown: 6,
                    range: 2.6,
                    radius: 2.4,
                    weight: 2,
                    seq: SCIMITAR_SLASH,
                    sound: 2500,
                    shout: "claw spec!",
                },
            ],
        },
    }),
    player({
        id: "lms_dharok",
        name: "Dharok's sweat",
        attackSeq: TWO_HANDED_SLASH,
        hp: 2400,
        damage: 0,
        speed: 2.1,
        radius: 0.45,
        xp: 750,
        scale: 1.35,
        knockbackResist: 0.95,
        spawnMessage: "A Dharok's sweat is low on hitpoints. Careful.",
        outfits: [
            outfit({
                [S.HEAD]: ITEM.dharoksHelm,
                [S.TORSO]: ITEM.dharoksPlatebody,
                [S.LEGS]: ITEM.dharoksPlatelegs,
                [S.WEAPON]: ITEM.dharoksGreataxe,
                [S.AMULET]: ITEM.amuletOfFury,
                [S.CAPE]: ITEM.infernalCape,
            }),
        ],
        boss: {
            attackInterval: 2.2,
            // Hits harder the lower he gets, like Dharok
            wretched: 1,
            enrage: {
                message: "The Dharok's sweat is at 1 hitpoint and swinging!",
                shout: "1 hp dh lol",
            },
            attacks: [
                {
                    name: "Greataxe",
                    kind: "swing",
                    damage: 7,
                    windup: 1,
                    cooldown: 0,
                    range: 2.8,
                    radius: 2.6,
                    weight: 3,
                    seq: TWO_HANDED_SLASH,
                    sound: 2500,
                },
            ],
        },
    }),
];

// ---------------------------------------------------------------- Castle Wars

// The Zamorak team, mid-game. Everyone on it says the team's lines.
const ZAMORAK_LINES = [
    "bandage pls",
    "FLAG IS HERE",
    "barricade at stairs",
    "who has explosive potion",
    "tele back gg",
    "zammy ftw",
    "flag in our base!!",
    "get their flag",
    "def flag",
    "sara noobs",
    "mid!!",
    "rocks in tunnel",
    "bandages at table",
    "gg",
];
const SARADOMIN_LINES = [
    "sara ftw",
    "zammy noobs",
    "FLAG IS HERE",
    "bandage pls",
    "go go go",
    "def flag",
    "barricade at stairs",
    "theyre in our base!!",
    "tunnels!!",
];

// In the team's hood and cloak, and whatever else they came in
function zamorakTeam(equipment: Partial<Record<number, number>>, colors?: number[]): EnemyOutfit {
    return outfit(
        { [S.HEAD]: ITEM.zamorakHood, [S.CAPE]: ITEM.zamorakCloak, ...equipment },
        colors,
    );
}

// An explosive potion going off
const EXPLOSION_SPOTANIM = 157;

// The Zamorak team fights the Saradomin team as much as it fights you
// (EnemyDef.faction): Saradomin's players come from the other side, and they
// don't like you much either, they just like Zamorak less
const CASTLE_WARS_ENEMIES: EnemyDef[] = [
    player({
        id: "zamorak_noob",
        name: "Zamorak noob",
        faction: "zamorak",
        attackSeq: PUNCH,
        hp: 8,
        damage: 2,
        speed: 1.9,
        xp: 6,
        // Just the hood and cloak, and the odd iron scimitar
        outfits: COLOUR_SETS.slice(0, 4).map((colors, i) =>
            zamorakTeam({ [S.WEAPON]: i % 2 ? ITEM.ironScimitar : -1 }, colors),
        ),
        chat: ZAMORAK_LINES,
    }),
    player({
        id: "zamorak_ranger",
        name: "Zamorak ranger",
        faction: "zamorak",
        attackSeq: BOW_SHOT,
        hp: 16,
        damage: 2,
        speed: 2,
        xp: 10,
        outfits: [
            zamorakTeam({
                [S.TORSO]: ITEM.zamorakDhideBody,
                [S.LEGS]: ITEM.zamorakChaps,
                [S.WEAPON]: ITEM.mapleShortbow,
            }),
            zamorakTeam({
                [S.TORSO]: ITEM.greenDhideBody,
                [S.LEGS]: ITEM.greenDhideChaps,
                [S.WEAPON]: ITEM.magicShortbow,
            }),
        ],
        shot: arrows(13),
        chat: ZAMORAK_LINES,
    }),
    player({
        id: "zamorak_warrior",
        name: "Zamorak warrior",
        faction: "zamorak",
        attackSeq: SCIMITAR_SLASH,
        hp: 26,
        damage: 3,
        speed: 2.1,
        xp: 14,
        // Red decorative armour, the first the tickets buy
        outfits: [
            zamorakTeam({
                [S.TORSO]: ITEM.redDecorativeArmourTop,
                [S.LEGS]: ITEM.redDecorativeArmourLegs,
                [S.WEAPON]: ITEM.redDecorativeSword,
            }),
            zamorakTeam({
                [S.TORSO]: ITEM.redDecorativeArmourTop,
                [S.LEGS]: ITEM.runePlatelegs,
                [S.SHIELD]: ITEM.redDecorativeShield,
                [S.WEAPON]: ITEM.runeScimitar,
            }),
            zamorakTeam({
                [S.TORSO]: ITEM.runePlatebody,
                [S.LEGS]: ITEM.redDecorativeArmourLegs,
                [S.WEAPON]: ITEM.redDecorativeSword,
            }),
        ],
        chat: ZAMORAK_LINES,
    }),
    player({
        id: "zamorak_mage",
        name: "Zamorak mage",
        faction: "zamorak",
        attackSeq: CAST,
        hp: 34,
        damage: 3,
        speed: 1.9,
        xp: 20,
        outfits: [
            zamorakTeam({
                [S.TORSO]: ITEM.zamorakMonkTop,
                [S.LEGS]: ITEM.zamorakMonkBottom,
                [S.WEAPON]: ITEM.staffOfFire,
            }),
        ],
        shot: FIRE_BLAST,
        chat: ZAMORAK_LINES,
    }),
    // Carries explosive potions for the other team's barricades, and goes up
    // with them
    player({
        id: "zamorak_bomber",
        name: "Potion runner",
        faction: "zamorak",
        attackSeq: PUNCH,
        hp: 22,
        damage: 3,
        speed: 2.4,
        xp: 16,
        outfits: COLOUR_SETS.slice(1, 4).map((colors) =>
            zamorakTeam({ [S.TORSO]: ITEM.leatherBody, [S.LEGS]: ITEM.leatherChaps }, colors),
        ),
        explodes: { damage: 4, radius: 1.6, spotAnim: EXPLOSION_SPOTANIM },
        chat: ["who has explosive potion", "got pots", "barricade at stairs", "boom", "brb"],
    }),
    player({
        id: "zamorak_tank",
        name: "Zamorak defender",
        faction: "zamorak",
        attackSeq: SCIMITAR_SLASH,
        hp: 64,
        damage: 5,
        speed: 1.6,
        xp: 34,
        knockbackResist: 0.5,
        // Decorative armour, white and gold: the long-time players
        outfits: [
            zamorakTeam({
                [S.TORSO]: ITEM.whiteDecorativeArmourTop,
                [S.LEGS]: ITEM.whiteDecorativeArmourLegs,
                [S.SHIELD]: ITEM.whiteDecorativeShield,
                [S.WEAPON]: ITEM.whiteDecorativeSword,
            }),
            zamorakTeam({
                [S.TORSO]: ITEM.goldDecorativeArmourTop,
                [S.LEGS]: ITEM.goldDecorativeArmourLegs,
                [S.SHIELD]: ITEM.goldDecorativeShield,
                [S.WEAPON]: ITEM.goldDecorativeSword,
            }),
            zamorakTeam({
                [S.TORSO]: ITEM.goldDecorativeArmourTop,
                [S.LEGS]: ITEM.whiteDecorativeArmourLegs,
                [S.SHIELD]: ITEM.redDecorativeShield,
                [S.WEAPON]: ITEM.runeBattleaxe,
            }),
        ],
        chat: ZAMORAK_LINES,
    }),
    player({
        id: "saradomin_player",
        name: "Saradomin player",
        faction: "saradomin",
        attackSeq: SCIMITAR_SLASH,
        hp: 40,
        damage: 3,
        speed: 2.1,
        xp: 20,
        outfits: [
            outfit({
                [S.HEAD]: ITEM.saradominHood,
                [S.CAPE]: ITEM.saradominCloak,
                [S.TORSO]: ITEM.whiteDecorativeArmourTop,
                [S.LEGS]: ITEM.whiteDecorativeArmourLegs,
                [S.WEAPON]: ITEM.whiteDecorativeSword,
            }),
            outfit({
                [S.HEAD]: ITEM.saradominHood,
                [S.CAPE]: ITEM.saradominCloak,
                [S.TORSO]: ITEM.runePlatebody,
                [S.LEGS]: ITEM.runePlatelegs,
                [S.WEAPON]: ITEM.runeScimitar,
            }),
            outfit(
                {
                    [S.HEAD]: ITEM.saradominHood,
                    [S.CAPE]: ITEM.saradominCloak,
                    [S.WEAPON]: ITEM.ironScimitar,
                },
                COLOUR_SETS[2],
            ),
        ],
        chat: SARADOMIN_LINES,
    }),
];

const CASTLE_WARS_BOSSES: EnemyDef[] = [
    // Off home with your flag: he runs rather than fights, and teleports out
    // when he's caught. The flag's worth a second casket.
    player({
        id: "flag_carrier",
        name: "Flag carrier",
        faction: "zamorak",
        attackSeq: PUNCH,
        hp: 1400,
        damage: 0,
        // Slower than the player, even enraged, so he can be run down
        speed: 2.3,
        radius: 0.45,
        xp: 650,
        scale: 1.25,
        knockbackResist: 0.9,
        flees: { range: 7 },
        caskets: ["elite", "elite"],
        spawnMessage: "A Zamorak player has your flag! Catch the Flag carrier!",
        outfits: [
            zamorakTeam({
                [S.TORSO]: ITEM.redDecorativeArmourTop,
                [S.LEGS]: ITEM.redDecorativeArmourLegs,
                [S.WEAPON]: ITEM.saradominBanner,
                [S.AMULET]: ITEM.amuletOfGlory,
            }),
        ],
        chat: ["FLAG IS HERE", "flag in our base!!", "cant catch me", "running it home", "lol"],
        boss: {
            attackInterval: 2,
            enrage: {
                message: "The Flag carrier is nearly home with your flag!",
                shout: "almost there!!",
            },
            attacks: [
                {
                    name: "Banner bash",
                    kind: "swing",
                    damage: 4,
                    windup: 0.6,
                    cooldown: 0,
                    range: 2.2,
                    radius: 2,
                    weight: 2,
                    seq: PUNCH,
                    sound: 2500,
                },
                {
                    name: "Tele back",
                    kind: "teleport",
                    damage: 0,
                    windup: 0.8,
                    cooldown: 9,
                    range: 3,
                    radius: 11,
                    weight: 3,
                    castSpotAnim: 111,
                    impactSpotAnim: 111,
                    shout: "tele back gg",
                },
            ],
        },
    }),
    // Never moves from the catapult, and its rocks come down wherever you
    // stood, unless you're well out of its reach
    player({
        id: "catapult_crew",
        name: "Catapult crew",
        faction: "zamorak",
        attackSeq: TWO_HANDED_SLASH,
        hp: 2000,
        damage: 0,
        speed: 1,
        radius: 0.45,
        xp: 650,
        scale: 1.3,
        knockbackResist: 1,
        stationary: true,
        spawnMessage: "The Zamorak catapult crew has you in its sights!",
        outfits: [
            zamorakTeam({
                [S.HEAD]: ITEM.redDecorativeHelm,
                [S.TORSO]: ITEM.redDecorativeArmourTop,
                [S.LEGS]: ITEM.redDecorativeArmourLegs,
                [S.WEAPON]: ITEM.runeWarhammer,
            }),
        ],
        chat: ["fire!!", "reload", "aim mid", "rocks pls"],
        boss: {
            attackInterval: 3,
            enrage: { message: "The catapult crew fires faster!", shout: "FIRE FIRE FIRE" },
            attacks: [
                {
                    name: "Catapult",
                    kind: "blast",
                    damage: 5,
                    windup: 1.6,
                    cooldown: 0,
                    range: 20,
                    minRange: 2.5,
                    radius: 1.8,
                    weight: 4,
                    impactSpotAnim: 451,
                    seq: TWO_HANDED_SLASH,
                    sound: 2500,
                    shout: "fire!",
                },
                {
                    name: "Rock barrage",
                    kind: "blast",
                    damage: 4,
                    windup: 1.8,
                    cooldown: 6,
                    range: 20,
                    minRange: 2.5,
                    radius: 1.6,
                    count: 3,
                    spread: 3,
                    weight: 2,
                    impactSpotAnim: 451,
                    seq: TWO_HANDED_SLASH,
                    sound: 2500,
                    enraged: true,
                },
                {
                    name: "Defend the catapult",
                    kind: "summon",
                    damage: 0,
                    windup: 0.8,
                    cooldown: 14,
                    range: 20,
                    weight: 1,
                    summon: { enemyId: "zamorak_warrior", count: 4 },
                    shout: "def cata!!",
                },
                {
                    name: "Hammer",
                    kind: "swing",
                    damage: 5,
                    windup: 0.8,
                    cooldown: 0,
                    range: 2.5,
                    radius: 2.2,
                    weight: 4,
                    seq: SCIMITAR_SLASH,
                    sound: 2500,
                },
            ],
        },
    }),
    // Full gold decorative armour, and a lot of bandages
    player({
        id: "zamorak_tank_boss",
        name: "Zamorak tank",
        faction: "zamorak",
        attackSeq: SCIMITAR_SLASH,
        hp: 3200,
        damage: 0,
        speed: 1.8,
        radius: 0.45,
        xp: 800,
        scale: 1.45,
        knockbackResist: 0.95,
        spawnMessage: "A Zamorak tank in full decorative armour walks out of the castle!",
        outfits: [
            zamorakTeam({
                [S.HEAD]: ITEM.goldDecorativeHelm,
                [S.TORSO]: ITEM.goldDecorativeArmourTop,
                [S.LEGS]: ITEM.goldDecorativeArmourLegs,
                [S.SHIELD]: ITEM.goldDecorativeShield,
                [S.WEAPON]: ITEM.goldDecorativeSword,
            }),
        ],
        chat: ["cant hit me", "bandage pls", "tank mode", "10 hp lol"],
        boss: {
            attackInterval: 2.2,
            enrage: {
                message: "The Zamorak tank is out of bandages and swinging!",
                shout: "BANDAGE PLS",
            },
            attacks: [
                {
                    name: "Decorative sword",
                    kind: "swing",
                    damage: 7,
                    windup: 0.9,
                    cooldown: 0,
                    range: 2.6,
                    radius: 2.4,
                    weight: 3,
                    seq: SCIMITAR_SLASH,
                    sound: 2500,
                },
                {
                    name: "Explosive potion",
                    kind: "blast",
                    damage: 5,
                    windup: 1.2,
                    cooldown: 5,
                    range: 9,
                    minRange: 3,
                    radius: 1.8,
                    weight: 2,
                    impactSpotAnim: EXPLOSION_SPOTANIM,
                    seq: PUNCH,
                    sound: 2500,
                    shout: "who has explosive potion",
                },
                {
                    name: "Shield bash",
                    kind: "swing",
                    damage: 9,
                    windup: 1.1,
                    cooldown: 5,
                    range: 2.8,
                    radius: 2.8,
                    weight: 2,
                    seq: SCIMITAR_SLASH,
                    sound: 2500,
                    enraged: true,
                },
            ],
        },
    }),
];

// ---------------------------------------------------------------- Pest Control

// The pests are NPCs, not players. Their own sounds aren't known, so they make
// a monster's. Spot animations from the cache: the torcher's fireball
// (646-648), the defiler's spike (655-657), a splatter going off (649), a
// spinner's heal (658).
const PEST_SOUNDS = { attack: 4787, hit: 4492, death: 4479 };

// Rangers and mages pick you off from a distance, so the pests' are weak and
// slow to fire, and few
const TORCHER_FIRE: EnemyShotDef = {
    range: 7,
    interval: 4.5,
    speed: 8,
    castSpotAnim: 646,
    spotAnim: 647,
    impactSpotAnim: 648,
    sound: 160,
};
const DEFILER_SPIKE: EnemyShotDef = {
    range: 7,
    interval: 4.5,
    speed: 7,
    castSpotAnim: 655,
    spotAnim: 656,
    impactSpotAnim: 657,
    sound: 2707,
};

// The portals, by colour, and where they stand on the island (in the middle of
// the spot each one takes up there)
const PORTAL_IDS = ["purple_portal", "blue_portal", "yellow_portal", "red_portal"];

const PEST_CONTROL_ENEMIES: EnemyDef[] = [
    {
        id: "brawler",
        name: "Brawler",
        npcId: 1734,
        idleSeq: 3893,
        walkSeq: 3892,
        attackSeq: 3896,
        deathSeq: 3894,
        // Big and slow, and hard to push: they block the way in Pest Control
        hp: 80,
        damage: 6,
        speed: 1.5,
        radius: 0.45,
        xp: 40,
        scale: 0.8,
        knockbackResist: 0.8,
        sounds: PEST_SOUNDS,
    },
    {
        id: "ravager",
        name: "Ravager",
        npcId: 1704,
        idleSeq: 3913,
        walkSeq: 3914,
        attackSeq: 3915,
        deathSeq: 3917,
        hp: 30,
        damage: 4,
        speed: 2.4,
        radius: 0.35,
        xp: 14,
        sounds: PEST_SOUNDS,
    },
    {
        id: "defiler",
        name: "Defiler",
        npcId: 1724,
        idleSeq: 3918,
        walkSeq: 3919,
        attackSeq: 3920,
        deathSeq: 3922,
        hp: 16,
        damage: 2,
        speed: 2,
        radius: 0.35,
        xp: 10,
        shot: DEFILER_SPIKE,
        sounds: PEST_SOUNDS,
    },
    {
        id: "torcher",
        name: "Torcher",
        npcId: 1714,
        idleSeq: 3878,
        walkSeq: 3879,
        attackSeq: 3882,
        deathSeq: 3881,
        hp: 18,
        damage: 2,
        speed: 1.9,
        radius: 0.35,
        xp: 12,
        shot: TORCHER_FIRE,
        sounds: PEST_SOUNDS,
    },
    // Goes off when it dies: step back from the one you're about to kill
    {
        id: "splatter",
        name: "Splatter",
        npcId: 1689,
        idleSeq: 3886,
        walkSeq: 3887,
        attackSeq: 3891,
        deathSeq: 3888,
        hp: 12,
        damage: 2,
        speed: 2,
        radius: 0.35,
        xp: 8,
        explodes: { damage: 6, radius: 1.6, spotAnim: 649 },
        sounds: PEST_SOUNDS,
    },
    // Teleports over to you when you're too far away
    {
        id: "shifter",
        name: "Shifter",
        npcId: 1694,
        idleSeq: 3899,
        walkSeq: 3898,
        attackSeq: 3901,
        deathSeq: 3903,
        hp: 36,
        damage: 5,
        speed: 2,
        radius: 0.35,
        xp: 22,
        blinks: { interval: 5, minRange: 6, distance: 1.6, windup: 0.6 },
        sounds: PEST_SOUNDS,
    },
    // Keeps the portals going: heals whichever is hurt, and only comes for you
    // when there's none to heal
    {
        id: "spinner",
        name: "Spinner",
        npcId: 1709,
        idleSeq: 3906,
        walkSeq: 3907,
        attackSeq: 3908,
        deathSeq: 3910,
        hp: 14,
        damage: 1,
        speed: 2.2,
        radius: 0.35,
        xp: 10,
        heals: {
            fraction: 0.015,
            interval: 2,
            range: 2.5,
            targets: PORTAL_IDS,
            seek: 30,
            spotAnim: 658,
        },
        sounds: PEST_SOUNDS,
    },
];

// What comes out of a portal, a spinner or two among them to keep it healed.
// Only their bones drop: a portal left standing isn't a casket farm.
const PORTAL_SPAWNS: EnemySpawnsDef = {
    enemies: [
        { id: "ravager", weight: 3 },
        { id: "splatter", weight: 3 },
        { id: "shifter", weight: 2 },
        { id: "brawler", weight: 1 },
        { id: "spinner", weight: 2 },
    ],
    interval: 6,
    count: 2,
    max: 8,
    radius: 2.8,
    bonesOnly: true,
};

// A portal: it stands where it does, its shield takes a while to drop, and
// pests come out of it until it's destroyed. Shielded, it's drawn as the
// game's shielded portal (the same portal inside a shimmering shell).
function portal(
    id: string,
    colour: string,
    npcId: number,
    idleSeq: number,
    shielded: { npcId: number; idleSeq: number },
    spot: { x: number; y: number },
    shieldSeconds: number,
): EnemyDef {
    const name = `${colour[0].toUpperCase()}${colour.slice(1)} portal`;
    return {
        id,
        name,
        npcId,
        idleSeq,
        walkSeq: idleSeq,
        attackSeq: -1,
        deathSeq: -1,
        hp: 900,
        damage: 0,
        speed: 1,
        radius: 0.45,
        xp: 300,
        // Three tiles across in OSRS
        scale: 0.8,
        knockbackResist: 1,
        sounds: PEST_SOUNDS,
        stationary: true,
        spawnAt: [spot],
        spawns: PORTAL_SPAWNS,
        shield: {
            seconds: shieldSeconds,
            message: `The ${colour} portal's shield has dropped!`,
            look: shielded,
        },
        caskets: ["medium"],
        // The purple's says so for all four, as they open together
        spawnMessage:
            colour === "purple"
                ? "The portals open! Their shields drop one by one: purple, blue, yellow, red."
                : "",
        boss: {
            attackInterval: 3,
            attacks: [],
            enrage: { message: `The ${colour} portal is flickering!` },
        },
    };
}

// The novice lander's island: purple to the west, blue to the east, yellow to
// the south-east and red to the south-west, their shields dropping fifteen
// seconds apart
const PEST_CONTROL_BOSSES: EnemyDef[] = [
    portal(
        "purple_portal",
        "purple",
        1739,
        3933,
        { npcId: 1743, idleSeq: 6879 },
        { x: 2629.5, y: 2592.5 },
        15,
    ),
    portal(
        "blue_portal",
        "blue",
        1740,
        3936,
        { npcId: 1744, idleSeq: 6880 },
        { x: 2681.5, y: 2589.5 },
        30,
    ),
    portal(
        "yellow_portal",
        "yellow",
        1741,
        3928,
        { npcId: 1745, idleSeq: 6878 },
        { x: 2670.5, y: 2571.5 },
        45,
    ),
    portal(
        "red_portal",
        "red",
        1742,
        3928,
        { npcId: 1746, idleSeq: 6878 },
        { x: 2646.5, y: 2570.5 },
        60,
    ),
];

export const FUN_ENEMIES: EnemyDef[] = [
    ...GE_ENEMIES,
    ...GE_BOSSES,
    ...EAST_VARROCK_ENEMIES,
    ...EAST_VARROCK_BOSSES,
    ...FALADOR_ENEMIES,
    ...FALADOR_BOSSES,
    ...LMS_ENEMIES,
    ...LMS_BOSSES,
    ...CASTLE_WARS_ENEMIES,
    ...CASTLE_WARS_BOSSES,
    ...PEST_CONTROL_ENEMIES,
    ...PEST_CONTROL_BOSSES,
];

// Durial321's look in Falador and as an adventurer: the green partyhat he
// picked up that day, Ahrim's robes, the fire cape and obsidian shield from
// the screenshots, and his long white hair
export const DURIAL_EQUIPMENT: Partial<Record<number, number>> = {
    [S.HEAD]: ITEM.greenPartyhat,
    [S.CAPE]: ITEM.fireCape,
    [S.SHIELD]: ITEM.toktzKetXil,
    [S.AMULET]: ITEM.amuletOfGlory,
    [S.TORSO]: ITEM.ahrimsRobetop,
    [S.LEGS]: ITEM.ahrimsRobeskirt,
};
// The "Long" hairstyle, in white
export const DURIAL_KITS = [LONG_HAIR, ...DEFAULT_MALE_KITS.slice(1)];
export const DURIAL_COLORS = [WHITE_HAIR, 0, 0, 0, 0];

// For the fun adventurers' looks
export const FUN_ITEMS = ITEM;

// Every item id an outfit uses, by its key in ITEM (for the cache check)
for (const [key, value] of Object.entries(ITEM)) {
    for (const id of Array.isArray(value) ? value : [value]) {
        FUN_OUTFIT_ITEMS[id] = key;
    }
}
