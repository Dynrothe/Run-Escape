// Player names, which the open rooms list shows to anyone: lowercase a-z only
// (no spaces, digits or symbols), and nothing on the banned list. The game
// and the relay both use this, so a name the game lets through the relay
// takes as it is, and one sent round the game is cleaned up all the same.

export const NAME_LENGTH = 16;
export const DEFAULT_NAME = "adventurer";

// Found anywhere in a name: slurs and the worst words, which aren't inside
// ordinary ones
const BANNED_ANYWHERE = [
    "nigger",
    "nigga",
    "nigg",
    // A letter left out (typed as a digit, which the name field doesn't take)
    "ngger",
    "ngga",
    "nggr",
    "faggot",
    "fagot",
    "fggot",
    "retard",
    "rtard",
    "tranny",
    "chink",
    "kike",
    "wetback",
    "beaner",
    "raghead",
    "towelhead",
    "dyke",
    "nazi",
    "hitler",
    "kkk",
    "molest",
    "paedo",
    "pedophile",
    "fuck",
    "fuk",
    "fck",
    "shit",
    "cunt",
    "bitch",
    "whore",
    "slut",
    "pussy",
    "penis",
    "vagina",
    "porn",
    "jizz",
    "wank",
    "twat",
    "bastard",
    "asshole",
    "dickhead",
    "cocksucker",
    "killyourself",
];

// At the start of a name: words inside ordinary ones further in (therapist,
// torpedo, basement, scoundrel, peacock)
const BANNED_STARTS = [
    "rape",
    "pedo",
    "spic",
    "coon",
    "gook",
    "paki",
    "semen",
    "cock",
    "dick",
    "anal",
    "anus",
    "nude",
    "sex",
    "cum",
    "homo",
    "sht",
    "btch",
    "fggt",
];

// Only as the whole name: short ones that start ordinary names (assassin,
// titan, fagin's, crappy, hoedown, jewel)
const BANNED_WHOLE = ["ass", "tit", "tits", "fag", "crap", "hoe", "jew", "kys", "cnt"];

// What digits and symbols stand in for, to catch them before they're
// stripped out
const LOOKALIKES = {
    0: "o",
    1: "i",
    3: "e",
    4: "a",
    5: "s",
    7: "t",
    8: "b",
    9: "g",
    "@": "a",
    $: "s",
    "!": "i",
    "|": "i",
};

// A name as it can be: lowercase a-z, no longer than NAME_LENGTH
export function cleanName(text) {
    return (typeof text === "string" ? text : "")
        .toLowerCase()
        .replace(/[^a-z]/g, "")
        .slice(0, NAME_LENGTH);
}

// Whether a name (as typed, or cleaned) is all right to show: not on the
// banned list, with stand-in digits and symbols read as letters too
export function isNameAllowed(text) {
    const raw = (typeof text === "string" ? text : "").toLowerCase();
    const readings = [
        cleanName(raw),
        raw
            .split("")
            .map((c) => LOOKALIKES[c] ?? c)
            .join("")
            .replace(/[^a-z]/g, ""),
    ];
    return readings.every(
        (name) =>
            !BANNED_ANYWHERE.some((word) => name.includes(word)) &&
            !BANNED_STARTS.some((word) => name.startsWith(word)) &&
            !BANNED_WHOLE.includes(name),
    );
}

// The name to use: cleaned, or the default for one that's empty or banned
export function playerName(text) {
    const name = cleanName(text);
    return name && isNameAllowed(text) ? name : DEFAULT_NAME;
}
