import { MapDef, RunEventDef } from "../types";
import { paced } from "../waves";

// The fun maps: open from the start, endless from the start, and full of other
// players (Pest Control's are pests). Their rounds turn over every fifteen
// minutes on their own (there's no final boss), and their bosses turn up at
// random, the first at four minutes and then every three to five (Pest
// Control's portals all come at once). Waves follow Lumbridge's pace, like
// every map's. Rangers are rare, about one in eight of a wave at most (a crowd
// of them is all arrows), and never elites. Arenas are whole map squares (64
// tiles), in world tiles.

// Elites about once a minute and a ring now and then, the same rhythm as the
// campaign's maps (minus the bosses, which come from the pool)
function events(
    elites: string[],
    rings: { at: number; enemyId: string; count: number }[],
): RunEventDef[] {
    const list: RunEventDef[] = elites.map((enemyId, i) => ({
        at: 100 + i * 60,
        kind: "elite",
        enemyId,
    }));
    for (const ring of rings) {
        list.push({ at: ring.at, kind: "ring", enemyId: ring.enemyId, count: ring.count });
    }
    return list.sort((a, b) => a.at - b.at);
}

// Every three to five minutes, after the first at four
function bossPool(pool: string[]): NonNullable<MapDef["fun"]>["bosses"] {
    return { pool, firstAt: 240, every: [180, 300] };
}

// Durial321's own words, from his 2006 interview ("omg", he says, "about a
// million times"), and the line everyone remembers him for
export const DURIAL_LINES = [
    "Ur fault",
    "Ur fault",
    "omg",
    "omg",
    "I am god omg",
    "greatest day of my RS life!!!",
    "Cool huh",
    "lol",
];

// What the other players on the boat and the island say, in the game and in
// the lander before it
export const PEST_CONTROL_PLAYER_LINES = [
    "W344 PC",
    "afk",
    "zeal pls",
    "purple shield down",
    "everyone purple!!",
    "def knight",
    "go blue",
    "who's at red?",
    "ty for points",
    "gl",
    "lander full?",
    "250 pts!",
];

export const FUN_MAPS: MapDef[] = [
    {
        id: "grand_exchange",
        name: "Grand Exchange",
        description:
            "Spam bots, scammers, lurers, gold farmers, fake moderators and merchants. The Doubler, " +
            "the Lure master and the Bot farmer turn up at random. Endless.",
        // Red partyhat
        iconObjId: 1038,
        // The Grand Exchange in the middle, Edgeville to the west, Varrock's
        // west side to the east, the Wilderness ditch along the top (map
        // squares 48-50 x 53-55)
        arena: { baseX: 48 * 64, baseY: 53 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // By the booths
        spawn: { x: 3164.5, y: 3480.5 },
        difficulty: { hp: 1, damage: 1 },
        waves: paced([
            [{ id: "spam_bot", weight: 1 }],
            [
                { id: "spam_bot", weight: 3 },
                { id: "scammer", weight: 1 },
            ],
            [
                { id: "scammer", weight: 2 },
                { id: "spam_bot", weight: 2 },
            ],
            [
                { id: "scammer", weight: 2 },
                { id: "lurer", weight: 1 },
                { id: "spam_bot", weight: 2 },
            ],
            [
                { id: "lurer", weight: 2 },
                { id: "scammer", weight: 2 },
            ],
            [
                { id: "lurer", weight: 2 },
                { id: "gold_farmer", weight: 1 },
            ],
            [
                { id: "gold_farmer", weight: 2 },
                { id: "lurer", weight: 2 },
            ],
            [
                { id: "gold_farmer", weight: 2 },
                { id: "fake_mod", weight: 1 },
            ],
            [
                { id: "fake_mod", weight: 2 },
                { id: "lurer", weight: 2 },
            ],
            [
                { id: "fake_mod", weight: 2 },
                { id: "gold_farmer", weight: 2 },
            ],
            [
                { id: "merchant", weight: 2 },
                { id: "fake_mod", weight: 1 },
            ],
            [
                { id: "merchant", weight: 2 },
                { id: "gold_farmer", weight: 2 },
            ],
            [
                { id: "merchant", weight: 2 },
                { id: "fake_mod", weight: 2 },
            ],
            [
                { id: "merchant", weight: 3 },
                { id: "lurer", weight: 1 },
                { id: "fake_mod", weight: 1 },
            ],
            [
                { id: "merchant", weight: 3 },
                { id: "fake_mod", weight: 2 },
            ],
        ]),
        events: events(
            [
                "scammer",
                "scammer",
                "lurer",
                "lurer",
                "gold_farmer",
                "gold_farmer",
                "fake_mod",
                "fake_mod",
                "merchant",
                "fake_mod",
                "merchant",
                "merchant",
                "merchant",
            ],
            [
                { at: 360, enemyId: "spam_bot", count: 40 },
                { at: 600, enemyId: "lurer", count: 40 },
                { at: 840, enemyId: "merchant", count: 48 },
            ],
        ),
        finalBossWarning: "",
        victoryText: "",
        fun: {
            bosses: bossPool(["the_doubler", "lure_master", "bot_farm", "melodox"]),
            chatEvery: 4,
        },
    },
    {
        id: "east_varrock",
        name: "East Varrock",
        description:
            "The Wilderness, just past the ditch: free-to-play pkers in multi, clan noobs, rangers, " +
            "mages, pures and tanks, in nothing members get, and more jumping the ditch behind you. " +
            "A Clan leader, a Rune 2h pure and a Wildy mage turn up at random. Endless.",
        // Rune 2h sword
        iconObjId: 1319,
        // The Wilderness north of Varrock's east side, and Varrock's north edge
        // behind the ditch (map squares 50-52 x 54-56)
        arena: { baseX: 50 * 64, baseY: 54 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // Just over the ditch
        spawn: { x: 3254.5, y: 3530.5 },
        // The Wilderness Ditch, which anyone coming from Varrock jumps
        ditch: { y: 3521 },
        difficulty: { hp: 1, damage: 1 },
        waves: paced([
            [{ id: "clan_noob", weight: 1 }],
            [
                { id: "clan_noob", weight: 7 },
                { id: "f2p_ranger", weight: 1 },
            ],
            [
                { id: "clan_noob", weight: 4 },
                { id: "rune_pker", weight: 3 },
                { id: "f2p_ranger", weight: 1 },
            ],
            [
                { id: "rune_pker", weight: 2 },
                { id: "clan_noob", weight: 2 },
            ],
            [
                { id: "rune_pker", weight: 5 },
                { id: "clan_noob", weight: 2 },
                { id: "f2p_ranger", weight: 1 },
            ],
            [
                { id: "rune_pker", weight: 2 },
                { id: "f2p_mage", weight: 1 },
            ],
            [
                { id: "f2p_mage", weight: 2 },
                { id: "rune_pker", weight: 2 },
            ],
            [
                { id: "pure", weight: 2 },
                { id: "f2p_mage", weight: 1 },
            ],
            [
                { id: "pure", weight: 2 },
                { id: "rune_pker", weight: 2 },
            ],
            [
                { id: "pure", weight: 2 },
                { id: "f2p_mage", weight: 2 },
            ],
            [
                { id: "tank", weight: 2 },
                { id: "pure", weight: 1 },
            ],
            [
                { id: "tank", weight: 2 },
                { id: "f2p_mage", weight: 2 },
            ],
            [
                { id: "tank", weight: 2 },
                { id: "pure", weight: 2 },
            ],
            [
                { id: "tank", weight: 3 },
                { id: "f2p_mage", weight: 1 },
                { id: "pure", weight: 1 },
            ],
            [
                { id: "tank", weight: 3 },
                { id: "pure", weight: 2 },
            ],
        ]),
        events: events(
            [
                "rune_pker",
                "rune_pker",
                "rune_pker",
                "rune_pker",
                "f2p_mage",
                "f2p_mage",
                "pure",
                "pure",
                "tank",
                "pure",
                "tank",
                "tank",
                "tank",
            ],
            [
                { at: 360, enemyId: "clan_noob", count: 40 },
                { at: 600, enemyId: "rune_pker", count: 40 },
                { at: 840, enemyId: "pure", count: 48 },
            ],
        ),
        finalBossWarning: "",
        victoryText: "",
        fun: {
            bosses: bossPool(["clan_leader", "rune_2h_pure", "wildy_mage"]),
            chatEvery: 3.5,
        },
    },
    {
        id: "falador",
        name: "Falador",
        description:
            "6 June 2006, world 111. You're Durial321, a house party has gone wrong, and all of " +
            "Falador wants to be killed. A Player moderator, Cursed You and Mod Murdoch turn up at " +
            "random. Endless.",
        // Green partyhat
        iconObjId: 1044,
        // Falador, its park and the farms around it (map squares 45-47 x
        // 51-53)
        arena: { baseX: 45 * 64, baseY: 51 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // In the middle of town, between the banks
        spawn: { x: 2965.5, y: 3378.5 },
        difficulty: { hp: 1, damage: 1 },
        waves: paced([
            [{ id: "noob", weight: 1 }],
            [
                { id: "noob", weight: 3 },
                { id: "party_guest", weight: 1 },
            ],
            [
                { id: "party_guest", weight: 2 },
                { id: "noob", weight: 2 },
            ],
            [
                { id: "party_guest", weight: 2 },
                { id: "obby_noob", weight: 1 },
                { id: "noob", weight: 2 },
            ],
            [
                { id: "obby_noob", weight: 2 },
                { id: "party_guest", weight: 2 },
            ],
            [
                { id: "obby_noob", weight: 5 },
                { id: "party_guest", weight: 2 },
                { id: "ranger_noob", weight: 1 },
            ],
            [
                { id: "obby_noob", weight: 6 },
                { id: "alcher", weight: 1 },
                { id: "ranger_noob", weight: 1 },
            ],
            [
                { id: "noob", weight: 3 },
                { id: "alcher", weight: 2 },
                { id: "obby_noob", weight: 2 },
                { id: "ranger_noob", weight: 1 },
            ],
            [
                { id: "alcher", weight: 4 },
                { id: "obby_noob", weight: 3 },
            ],
            [
                { id: "alcher", weight: 2 },
                { id: "party_guest", weight: 2 },
            ],
            [
                { id: "pk_wannabe", weight: 2 },
                { id: "alcher", weight: 1 },
            ],
            [
                { id: "pk_wannabe", weight: 3 },
                { id: "alcher", weight: 3 },
                { id: "obby_noob", weight: 1 },
                { id: "ranger_noob", weight: 1 },
            ],
            [
                { id: "pk_wannabe", weight: 2 },
                { id: "alcher", weight: 2 },
            ],
            [
                { id: "pk_wannabe", weight: 3 },
                { id: "noob", weight: 2 },
            ],
            [
                { id: "pk_wannabe", weight: 3 },
                { id: "alcher", weight: 2 },
            ],
        ]),
        events: events(
            [
                "party_guest",
                "party_guest",
                "obby_noob",
                "obby_noob",
                "obby_noob",
                "alcher",
                "alcher",
                "alcher",
                "pk_wannabe",
                "alcher",
                "pk_wannabe",
                "pk_wannabe",
                "pk_wannabe",
            ],
            [
                { at: 300, enemyId: "noob", count: 48 },
                { at: 540, enemyId: "party_guest", count: 48 },
                { at: 780, enemyId: "noob", count: 64 },
            ],
        ),
        finalBossWarning: "",
        victoryText: "",
        music: "Massacre",
        fun: {
            bosses: bossPool(["player_moderator", "cursed_you", "mod_murdoch"]),
            character: "durial321",
            chatEvery: 3,
            playerChat: { lines: DURIAL_LINES, every: [8, 16] },
        },
    },
    {
        id: "last_man_standing",
        name: "Last Man Standing",
        description:
            "The Desert Island, and everyone else on it in LMS loadouts and chest loot. An AGS " +
            "specer, a Claws specer and a Dharok's sweat turn up at random. No fog. Endless.",
        // Dragon claws
        iconObjId: 13652,
        // The Desert Island (map squares 53-54 x 90-91, where the loot
        // chests are)
        arena: { baseX: 53 * 64, baseY: 90 * 64, sizeX: 2 * 64, sizeY: 2 * 64 },
        spawn: { x: 3456.5, y: 5824.5 },
        difficulty: { hp: 1, damage: 1 },
        waves: paced([
            [{ id: "lms_pure", weight: 1 }],
            [
                { id: "lms_pure", weight: 3 },
                { id: "lms_zerker", weight: 1 },
            ],
            [
                { id: "lms_zerker", weight: 2 },
                { id: "lms_pure", weight: 2 },
            ],
            [
                { id: "lms_pure", weight: 4 },
                { id: "lms_zerker", weight: 3 },
                { id: "lms_ranger", weight: 1 },
            ],
            [
                { id: "lms_zerker", weight: 6 },
                { id: "lms_mage", weight: 1 },
                { id: "lms_ranger", weight: 1 },
            ],
            [
                { id: "lms_zerker", weight: 4 },
                { id: "lms_mage", weight: 3 },
                { id: "lms_ranger", weight: 1 },
            ],
            [
                { id: "lms_mage", weight: 2 },
                { id: "lms_zerker", weight: 2 },
            ],
            [
                { id: "lms_med", weight: 5 },
                { id: "lms_zerker", weight: 2 },
                { id: "lms_ranger", weight: 1 },
            ],
            [
                { id: "lms_med", weight: 2 },
                { id: "lms_mage", weight: 2 },
            ],
            [
                { id: "lms_med", weight: 3 },
                { id: "lms_mage", weight: 2 },
                { id: "lms_zerker", weight: 2 },
            ],
            [
                { id: "lms_maxed", weight: 2 },
                { id: "lms_med", weight: 1 },
            ],
            [
                { id: "lms_maxed", weight: 2 },
                { id: "lms_mage", weight: 2 },
            ],
            [
                { id: "lms_maxed", weight: 2 },
                { id: "lms_med", weight: 2 },
            ],
            [
                { id: "lms_maxed", weight: 5 },
                { id: "lms_mage", weight: 2 },
                { id: "lms_ranger", weight: 1 },
            ],
            [
                { id: "lms_maxed", weight: 3 },
                { id: "lms_med", weight: 2 },
            ],
        ]),
        events: events(
            [
                "lms_zerker",
                "lms_zerker",
                "lms_zerker",
                "lms_zerker",
                "lms_mage",
                "lms_mage",
                "lms_med",
                "lms_med",
                "lms_maxed",
                "lms_med",
                "lms_maxed",
                "lms_maxed",
                "lms_maxed",
            ],
            [
                { at: 360, enemyId: "lms_pure", count: 40 },
                { at: 600, enemyId: "lms_zerker", count: 40 },
                { at: 840, enemyId: "lms_med", count: 48 },
            ],
        ),
        finalBossWarning: "",
        victoryText: "",
        fun: {
            bosses: bossPool(["ags_specer", "claws_specer", "lms_dharok"]),
            chatEvery: 3.5,
        },
    },
    {
        id: "castle_wars",
        name: "Castle Wars",
        description:
            "Mid-game in the arena: the Zamorak team in hooded cloaks and decorative armour, and " +
            "the Saradomin team, who hate them even more than they hate you. A Flag carrier (two " +
            "caskets, if you can catch him), a Catapult crew and a Zamorak tank turn up at " +
            "random. Endless.",
        // Saradomin's flag, which the Flag carrier has run off with
        iconObjId: 4037,
        // The arena: both castles' grounds, the middle and its rocks (map
        // square 37 x 48), and the lobby and the coast around it
        arena: { baseX: 36 * 64, baseY: 47 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // In the middle, between the castles
        spawn: { x: 2400.5, y: 3103.5 },
        difficulty: { hp: 1, damage: 1 },
        waves: paced([
            [{ id: "zamorak_noob", weight: 1 }],
            [
                { id: "zamorak_noob", weight: 7 },
                { id: "zamorak_ranger", weight: 1 },
            ],
            [
                { id: "zamorak_noob", weight: 4 },
                { id: "zamorak_warrior", weight: 3 },
                { id: "saradomin_player", weight: 1 },
            ],
            [
                { id: "zamorak_warrior", weight: 2 },
                { id: "zamorak_noob", weight: 2 },
            ],
            [
                { id: "zamorak_warrior", weight: 5 },
                { id: "zamorak_noob", weight: 2 },
                { id: "zamorak_ranger", weight: 1 },
            ],
            [
                { id: "zamorak_warrior", weight: 3 },
                { id: "zamorak_bomber", weight: 2 },
                { id: "saradomin_player", weight: 1 },
            ],
            [
                { id: "zamorak_warrior", weight: 4 },
                { id: "zamorak_bomber", weight: 3 },
                { id: "zamorak_mage", weight: 1 },
            ],
            [
                { id: "zamorak_warrior", weight: 3 },
                { id: "zamorak_bomber", weight: 3 },
                { id: "saradomin_player", weight: 1 },
                { id: "zamorak_ranger", weight: 1 },
            ],
            [
                { id: "zamorak_tank", weight: 2 },
                { id: "zamorak_warrior", weight: 2 },
                { id: "zamorak_bomber", weight: 2 },
            ],
            [
                { id: "zamorak_tank", weight: 3 },
                { id: "zamorak_bomber", weight: 3 },
                { id: "saradomin_player", weight: 1 },
                { id: "zamorak_mage", weight: 1 },
            ],
            [
                { id: "zamorak_tank", weight: 2 },
                { id: "zamorak_warrior", weight: 2 },
            ],
            [
                { id: "zamorak_tank", weight: 4 },
                { id: "zamorak_bomber", weight: 2 },
                { id: "saradomin_player", weight: 1 },
                { id: "zamorak_ranger", weight: 1 },
            ],
            [
                { id: "zamorak_tank", weight: 2 },
                { id: "zamorak_bomber", weight: 2 },
                { id: "saradomin_player", weight: 1 },
            ],
            [
                { id: "zamorak_tank", weight: 5 },
                { id: "zamorak_warrior", weight: 2 },
                { id: "zamorak_mage", weight: 1 },
            ],
            [
                { id: "zamorak_tank", weight: 3 },
                { id: "zamorak_bomber", weight: 2 },
                { id: "saradomin_player", weight: 1 },
            ],
        ]),
        events: events(
            [
                "zamorak_warrior",
                "zamorak_warrior",
                "zamorak_warrior",
                "zamorak_warrior",
                "zamorak_bomber",
                "zamorak_bomber",
                "saradomin_player",
                "zamorak_tank",
                "zamorak_tank",
                "saradomin_player",
                "zamorak_tank",
                "zamorak_tank",
                "zamorak_tank",
            ],
            [
                { at: 360, enemyId: "zamorak_noob", count: 40 },
                { at: 600, enemyId: "zamorak_warrior", count: 40 },
                { at: 840, enemyId: "zamorak_tank", count: 48 },
            ],
        ),
        finalBossWarning: "",
        victoryText: "",
        fun: {
            bosses: bossPool(["flag_carrier", "catapult_crew", "zamorak_tank_boss"]),
            chatEvery: 3,
        },
    },
    {
        id: "pest_control",
        name: "Pest Control",
        description:
            "The Void Knight's island, overrun: brawlers, ravagers, splatters that go off when they " +
            "die, shifters that teleport to you, and spinners that heal the portals. All four " +
            "portals open every few minutes, shielded at first; destroy them all for a master " +
            "casket. Endless.",
        // A Void knight top
        iconObjId: 8839,
        // The novice lander's island (map square 41 x 40), with the Void
        // Knights' Outpost to the north. The knight's walled middle is shut;
        // the fight's around it, where the portals are.
        arena: { baseX: 40 * 64, baseY: 39 * 64, sizeX: 3 * 64, sizeY: 3 * 64 },
        // Outside the south gate
        spawn: { x: 2656.5, y: 2580.5 },
        // The pests come in close (few of them shoot), which is easier going
        // than the other fun maps' crowds, so they're a little tougher
        difficulty: { hp: 1.15, damage: 1.1 },
        waves: paced([
            [{ id: "ravager", weight: 1 }],
            [
                { id: "ravager", weight: 3 },
                { id: "splatter", weight: 1 },
            ],
            [
                { id: "splatter", weight: 2 },
                { id: "ravager", weight: 2 },
            ],
            [
                { id: "ravager", weight: 4 },
                { id: "splatter", weight: 3 },
                { id: "defiler", weight: 1 },
            ],
            [
                { id: "shifter", weight: 2 },
                { id: "ravager", weight: 2 },
            ],
            [
                { id: "shifter", weight: 2 },
                { id: "splatter", weight: 2 },
            ],
            [
                { id: "brawler", weight: 1 },
                { id: "shifter", weight: 2 },
                { id: "ravager", weight: 2 },
            ],
            [
                { id: "brawler", weight: 2 },
                { id: "splatter", weight: 3 },
                { id: "shifter", weight: 2 },
                { id: "torcher", weight: 1 },
            ],
            [
                { id: "brawler", weight: 2 },
                { id: "shifter", weight: 3 },
            ],
            [
                { id: "brawler", weight: 2 },
                { id: "ravager", weight: 3 },
                { id: "splatter", weight: 2 },
                { id: "defiler", weight: 1 },
            ],
            [
                { id: "brawler", weight: 3 },
                { id: "shifter", weight: 3 },
            ],
            [
                { id: "brawler", weight: 3 },
                { id: "splatter", weight: 2 },
                { id: "shifter", weight: 2 },
                { id: "torcher", weight: 1 },
            ],
            [
                { id: "brawler", weight: 3 },
                { id: "ravager", weight: 2 },
                { id: "shifter", weight: 2 },
            ],
            [
                { id: "brawler", weight: 4 },
                { id: "shifter", weight: 3 },
                { id: "defiler", weight: 1 },
            ],
            [
                { id: "brawler", weight: 3 },
                { id: "splatter", weight: 2 },
                { id: "shifter", weight: 3 },
            ],
        ]),
        events: events(
            [
                "ravager",
                "ravager",
                "ravager",
                "shifter",
                "shifter",
                "shifter",
                "brawler",
                "brawler",
                "shifter",
                "brawler",
                "brawler",
                "brawler",
                "brawler",
            ],
            [
                { at: 360, enemyId: "splatter", count: 40 },
                { at: 600, enemyId: "shifter", count: 40 },
                { at: 840, enemyId: "brawler", count: 48 },
            ],
        ),
        finalBossWarning: "",
        victoryText: "",
        fun: {
            // All four portals at three minutes, and again a few minutes after
            // the last of them is destroyed
            bosses: {
                pool: ["purple_portal", "blue_portal", "yellow_portal", "red_portal"],
                firstAt: 180,
                every: [150, 210],
                together: {
                    casket: "master",
                    message:
                        "All four portals are destroyed! The Void Knight leaves you a master casket.",
                },
            },
            playerChat: { lines: PEST_CONTROL_PLAYER_LINES, every: [10, 18] },
        },
    },
];
