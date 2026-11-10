import { englishOf, getLang, tr, translationsOf } from "../i18n";
import { getMessages } from "../i18n/catalog";
import { STAT_INFO } from "./stats";
import { StatKey } from "./types";

// An OSRS cache icon: an item (objId, and a stack size for coins) or an interface
// sprite (spriteId), never both
export type StatIconRef =
    | { objId: number; count?: number; spriteId?: undefined }
    | { spriteId: number; objId?: undefined; count?: undefined };

const sprite = (spriteId: number): StatIconRef => ({ spriteId });
const obj = (objId: number): StatIconRef => ({ objId });

// The skill tab's icons
const ATTACK = sprite(197); // Attack
const STRENGTH = sprite(198); // Strength
const DEFENCE = sprite(199); // Defence
const RANGED = sprite(200); // Ranged
const MAGIC = sprite(202); // Magic
const HITPOINTS = sprite(203); // Hitpoints

const STOPWATCH = obj(27414); // Giant stopwatch
const HOURGLASS = obj(5610); // Hourglass
const AREA = obj(9977); // Red chinchompa
const ARROWS = obj(892); // Rune arrow
const DART = obj(811); // Rune dart
const JAVELIN = obj(830); // Rune javelin
const SCIMITAR = obj(1333); // Rune scimitar
const VENOM = obj(12934); // Zulrah's scales

// Labels as the player reads them (lower case, without the number or sign in front),
// from STAT_INFO, weaponStats and the passives' effects
const ICONS: Record<string, StatIconRef> = {
    // STAT_INFO
    damage: STRENGTH,
    "melee damage": ATTACK,
    "ranged damage": RANGED,
    "magic damage": MAGIC,
    "damage to bosses": obj(22978), // Dragon hunter lance
    "damage a level": STRENGTH,
    armour: DEFENCE,
    "max hitpoints": HITPOINTS,
    "hitpoints a minute": obj(385), // Shark
    "weapon speed": STOPWATCH,
    area: AREA,
    "aura area": obj(4675), // Ancient staff
    "projectile speed": DART,
    "effect duration": HOURGLASS,
    projectiles: ARROWS,
    // A potion's "+1 projectile and ..."
    projectile: ARROWS,
    "movement speed": obj(88), // Boots of lightness
    "pickup range": obj(11941), // Looting bag
    luck: obj(28181), // Clover insignia
    experience: obj(2528), // Lamp
    // A pile of coins: one coin is a speck at a line's size
    coins: { objId: 995, count: 100 },
    revivals: obj(2570), // Ring of life
    rerolls: obj(562), // Chaos rune
    banishes: obj(560), // Death rune
    "recoil damage": obj(2550), // Ring of recoil
    "chance to heal on hit": obj(11090), // Phoenix necklace
    "melee knockback": obj(1347), // Rune warhammer
    "weapon slots": SCIMITAR,
    "magic weapon slot": obj(27281), // Divine rune pouch
    "passive slots": obj(8850), // Rune defender
    "power-up drops": obj(13393), // Xeric's talisman

    // weaponStats
    attacks: STOPWATCH,
    sides: ATTACK,
    reach: SCIMITAR,
    arc: SCIMITAR,
    knockback: obj(1347), // Rune warhammer
    targets: MAGIC,
    pierces: JAVELIN,
    bounces: obj(868), // Rune knife
    splash: AREA,
    radius: AREA,
    "blast radius": AREA,
    venom: VENOM,
    "venom lasts": HOURGLASS,
    speed: DART,
    "spin speed": DART,
    lasts: HOURGLASS,
    "freezes for": HOURGLASS,
    "burns for": HOURGLASS,
    "weakens for": HOURGLASS,
};

// Longest first, so "ranged damage" wins over "damage"
const LABELS = Object.keys(ICONS).sort((a, b) => b.length - a.length);

// The labels in the active language, each with its icon: the lines the game shows are
// translated, so the English labels above alone match nothing there. Built once a language.
let localized: { messages: object; labels: [string, StatIconRef][] } | undefined;

function localizedLabels(): [string, StatIconRef][] {
    // Keyed by the language's messages themselves, so swapped-in messages (tests) rebuild it too
    const messages = getMessages(getLang());
    if (localized?.messages === messages) {
        return localized.labels;
    }
    const found = new Map<string, StatIconRef>();
    for (const label of LABELS) {
        // A stat's label is stat.<key>.label, a weapon stat's weaponstat.<label_with_underscores>
        const keys = (Object.keys(STAT_INFO) as StatKey[]).filter(
            (key) => STAT_INFO[key].label === label,
        );
        const names = [
            ...keys.map((key) => tr(`stat.${key}.label`, label)),
            tr(`weaponstat.${label.replace(/ /g, "_")}`, label),
            // Any other key worded as the label in English (a passive's effect, say)
            ...translationsOf(label),
        ];
        for (const name of names) {
            const lower = name.toLowerCase();
            if (lower !== label && !found.has(lower)) {
                found.set(lower, ICONS[label]);
            }
        }
    }
    const labels = [...found].sort((a, b) => b[0].length - a[0].length);
    localized = { messages, labels };
    return labels;
}

// "+24% ranged damage" -> "ranged damage", "Damage 10 → 13" -> "damage 10 → 13". The number is
// any language's: digits of any script, "," or "." between them, "%" with or without a space.
function stripLead(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/^[+\-−]?\s*\p{Nd}[\p{Nd}.,]*\s*[%٪]?\s*/u, "");
}

// Where a label ends, as a whole word. Scripts written without spaces (Chinese, Japanese, Thai)
// run words together, so a letter after the label there doesn't make it part of a longer word.
const UNSPACED =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

function endsWord(text: string, at: number): boolean {
    const next = text[at];
    return next === undefined || !/\p{L}/u.test(next) || UNSPACED.test(next);
}

// The icon for a stat by its key, for a menu that knows which stat it's showing. The key's label
// is English, so it goes straight to the English labels, whatever the active language.
export function statKeyIcon(key: StatKey): StatIconRef | undefined {
    return matchLabel(stripLead(STAT_INFO[key].label), englishLabels());
}

function englishLabels(): [string, StatIconRef][] {
    return LABELS.map((label) => [label, ICONS[label]]);
}

// The icon for a stat line as shown to the player, by the label it starts with.
// undefined when it isn't a stat.
export function statIconFor(text: string): StatIconRef | undefined {
    // A line the language files translate whole is best found by the English it came from:
    // that goes by the file's key, whatever the language words it with
    const english = englishOf(text);
    if (english !== undefined && english !== text) {
        // The English decides, even when it has no icon: "Veneno mais forte" starts with a
        // label in Portuguese only because the words are the other way round in English
        return matchLabel(stripLead(english), englishLabels());
    }
    const rest = stripLead(text);
    return (
        matchLabel(rest, englishLabels()) ??
        (getLang() === "en" ? undefined : matchLabel(rest, localizedLabels(), true))
    );
}

// The icon of the first label the text starts with, as a whole word. Labels go longest first.
// Other languages often put a short word between the number and what it counts ("+2 de
// armadura", "+2 d'armure"), so with skipShort, words of up to three letters are skipped when
// nothing matches. English keeps to its labels: "Get armour" isn't a stat line.
function matchLabel(
    rest: string,
    labels: readonly (readonly [string, StatIconRef])[],
    skipShort = false,
): StatIconRef | undefined {
    // A short word counts only when set off by a space or an apostrophe: never a slice of a word
    const attempts = skipShort ? [rest, rest.replace(/^(\p{L}{1,3}(?:['’]|\s+))+/u, "")] : [rest];
    for (const attempt of attempts) {
        for (const [label, icon] of labels) {
            if (attempt.startsWith(label) && endsWord(attempt, label.length)) {
                return { ...icon };
            }
        }
    }
    return undefined;
}

// Everything above that the slim cache has to keep: the item icons and the interface
// sprites, which it keeps only if the game's lists name them
export const STAT_ICON_OBJ_IDS: number[] = [
    ...new Set(
        Object.values(ICONS).flatMap((icon) => (icon.objId !== undefined ? [icon.objId] : [])),
    ),
];
export const STAT_ICON_SPRITE_IDS: number[] = [
    ...new Set(
        Object.values(ICONS).flatMap((icon) =>
            icon.spriteId !== undefined ? [icon.spriteId] : [],
        ),
    ),
];
