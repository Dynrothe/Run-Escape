import { useSyncExternalStore } from "react";

import {
    englishForTranslation,
    getMessages,
    keyForEnglish,
    translationsOfEnglish,
} from "./catalog";
import { LANGS, Lang, Params } from "./types";

// The language the game is shown in: kept in localStorage beside the save, and read by
// React through useSyncExternalStore.

const STORAGE_KEY = "rune-survivors-language";

function isLang(value: unknown): value is Lang {
    return LANGS.some((lang) => lang.id === value);
}

function loadLang(): Lang | undefined {
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        return isLang(saved) ? saved : undefined;
    } catch (e) {
        return undefined;
    }
}

function saveLang(lang: Lang) {
    try {
        window.localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {}
}

// What the browser asks for, when nothing is saved
function browserLang(): Lang {
    let language = "";
    try {
        language = navigator.language ?? "";
    } catch (e) {}
    language = language.toLowerCase();
    if (language.startsWith("pt")) {
        return "pt-BR";
    }
    return "en";
}

function applyToDocument(lang: Lang) {
    try {
        document.documentElement.lang = lang;
    } catch (e) {}
}

let current: Lang = loadLang() ?? browserLang();
applyToDocument(current);

const listeners = new Set<() => void>();

export function getLang(): Lang {
    return current;
}

export function setLang(lang: Lang): void {
    if (!isLang(lang)) {
        return;
    }
    saveLang(lang);
    if (lang === current) {
        return;
    }
    const apply = () => {
        current = lang;
        formatters.clear();
        applyToDocument(lang);
        for (const fn of [...listeners]) {
            fn();
        }
    };

    if (
        typeof document !== "undefined" &&
        "startViewTransition" in document &&
        typeof (document as any).startViewTransition === "function"
    ) {
        (document as any).startViewTransition(apply);
    } else {
        apply();
    }
}

export function subscribeLang(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function useLang(): Lang {
    return useSyncExternalStore(subscribeLang, getLang, getLang);
}

// {name} in the text, from params. One without a param stays as it is.
function fill(text: string, params?: Params): string {
    if (!params) {
        return text;
    }
    return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
    );
}

// The text for a key in the active language, else in English, else undefined
function lookup(key: string): string | undefined {
    return getMessages(current)[key] ?? getMessages("en")[key];
}

export function t(key: string, params?: Params): string {
    return fill(lookup(key) ?? key, params);
}

// Like t, but with the English from the code to fall back on rather than the key
export function tr(key: string, fallback: string, params?: Params): string {
    return fill(lookup(key) ?? fallback, params);
}

// The plural form of a key for n: key.one, key.other, and key.zero, key.two, key.few,
// key.many where there are any. n is {n}, unless params has one of its own (a number
// already formatted, say).
export function tp(key: string, n: number, params?: Params): string {
    let category: string = "other";
    try {
        category = pluralRules().select(n);
    } catch (e) {}
    const candidates = n === 0 ? ["zero", category, "other"] : [category, "other"];
    const messages = [getMessages(current), getMessages("en")];
    let text: string | undefined;
    for (const found of messages) {
        text = candidates.map((form) => found[`${key}.${form}`]).find((it) => it !== undefined);
        if (text !== undefined) {
            break;
        }
    }
    return fill(text ?? key, { n, ...params });
}

// Given English text as the game emitted it, the same text in the active language
export function tl(text: string): string {
    if (current === "en") {
        return text;
    }
    const key = keyForEnglish(text);
    const found = key !== undefined ? getMessages(current)[key] : undefined;
    return found ?? translateSentence(text) ?? text;
}

// Every way the active language words a text that is English in the files
export function translationsOf(english: string): string[] {
    return current === "en" ? [] : translationsOfEnglish(current, english);
}

// The reverse of tl(): the English a translated text was written from, or undefined
export function englishOf(text: string): string | undefined {
    return current === "en" ? undefined : englishForTranslation(current, text);
}

// A name as the sim put it in a sentence. "the Maiden of Sugadinti" is "The Maiden of
// Sugadinti" in the files (Sim's midSentence).
function tlName(name: string): string {
    const translated = tl(name);
    if (translated === name && name.startsWith("the ")) {
        const capital = "T" + name.slice(1);
        const found = tl(capital);
        return found === capital ? name : found;
    }
    return translated;
}

// The sentences the sim builds round names and numbers, as it writes them in English. A
// sentence's groups fill its key's {params} (notice.* in ui-misc.json). A language without the
// key keeps the whole sentence in English, rather than English round translated names. The
// first pattern that matches is the one.
interface Sentence {
    pattern: RegExp;
    key: string;
    // A param for each group. n picks the plural form (key.one, key.other).
    params: string[];
    // Params that are names, translated with tl()
    names?: string[];
    // Params that are one of a few words, each a key of its own: notice.<param>.<word>
    words?: string[];
}

const SENTENCES: Sentence[] = [
    { pattern: /^Evolved: (.+)!$/, key: "notice.evolved", params: ["name"], names: ["name"] },
    {
        pattern: /^(.+?) set bonus: (.+)!$/,
        key: "notice.set_bonus",
        params: ["set", "bonus"],
        names: ["set", "bonus"],
    },
    { pattern: /^(.+?) has appeared!$/, key: "notice.appeared", params: ["name"], names: ["name"] },
    {
        pattern: /^Room (\d+) of (\d+): (.+)$/,
        key: "notice.room_of",
        params: ["room_n", "total", "room"],
        names: ["room"],
    },
    {
        pattern: /^Teleported to (.+?)\. (\d+) teleports? left\.$/,
        key: "notice.teleported",
        params: ["room", "n"],
        names: ["room"],
    },
    {
        pattern:
            /^Room cleared! Boss down in (\d+:\d+): \+(\d+) raid points, \+([0-9,.]+) coins\.$/,
        key: "notice.room_cleared",
        params: ["time", "points", "coins"],
    },
    // Before "protects from", which matches it too
    {
        pattern: /^Akkha turns to (\w+), and protects from (\w+)!$/,
        key: "notice.akkha_turns",
        params: ["style", "protects"],
        names: ["style", "protects"],
    },
    {
        pattern: /^(.+?) protects from (.+)!$/,
        key: "notice.protects_from",
        params: ["boss", "styles"],
    },
    {
        pattern: /^New item added to your collection log: (.+)$/,
        key: "notice.collection_log",
        params: ["item"],
        names: ["item"],
    },
    {
        pattern: /^A purple chest! (.+)$/,
        key: "notice.purple_chest",
        params: ["rest"],
        names: ["rest"],
    },
    {
        pattern: /^The chest holds no unique this time \((\d+)% chance\)\.$/,
        key: "notice.no_unique",
        params: ["percent"],
    },
    { pattern: /^Bot nuke! (\d+) bots? banned\.$/, key: "notice.bot_nuke", params: ["n"] },
    {
        pattern: /^(.+?) He'll face (north|south|east|west)!$/,
        key: "notice.face",
        params: ["first", "side"],
        names: ["first"],
        words: ["side"],
    },
    {
        pattern: /^(.+?) turns (grey|green|blue)! Only (melee|ranged|magic) hurts it\.$/,
        key: "notice.turns_only",
        params: ["name", "colour", "style"],
        names: ["name", "style"],
        words: ["colour"],
    },
    {
        pattern: /^(.+?) turns (grey|green|blue)! Mostly (melee|ranged|magic) hurts it\.$/,
        key: "notice.turns_mostly",
        params: ["name", "colour", "style"],
        names: ["name", "style"],
        words: ["colour"],
    },
];

function translateSentence(text: string): string | undefined {
    for (const sentence of SENTENCES) {
        const match = sentence.pattern.exec(text);
        if (!match) {
            continue;
        }
        const messages = getMessages(current);
        const plural = sentence.params.includes("n");
        if (!(plural ? `${sentence.key}.other` in messages : sentence.key in messages)) {
            return text;
        }
        const params: Params = {};
        sentence.params.forEach((name, i) => {
            const value = match[i + 1];
            params[name] = sentence.names?.includes(name)
                ? tlName(value)
                : sentence.words?.includes(name)
                  ? tr(`notice.${name}.${value}`, value)
                  : value;
        });
        // "magic and missiles": each style on its own, joined the language's way
        if (sentence.key === "notice.protects_from") {
            params.boss = tlName(match[1]);
            params.styles = list(match[2].split(" and ").map(tlName));
        }
        return plural ? tp(sentence.key, Number(params.n), params) : t(sentence.key, params);
    }
    return undefined;
}

// Intl's formatters, kept: making one costs far more than using it, and numbers are formatted
// every frame (hitsplats). Cleared when the language changes.
const formatters = new Map<string, Intl.NumberFormat | Intl.ListFormat | Intl.PluralRules>();

function cached<T extends Intl.NumberFormat | Intl.ListFormat | Intl.PluralRules>(
    id: string,
    make: () => T,
): T {
    let formatter = formatters.get(id) as T | undefined;
    if (!formatter) {
        formatter = make();
        formatters.set(id, formatter);
    }
    return formatter;
}

function pluralRules(): Intl.PluralRules {
    return cached("plural", () => new Intl.PluralRules(current));
}

// English lists as the game wrote them before there were languages: "a, b and c"
export function list(items: string[]): string {
    try {
        const locale = current === "en" ? "en-GB" : current;
        const format = cached(
            "list",
            () => new Intl.ListFormat(locale, { style: "long", type: "conjunction" }),
        );
        return format.format(items);
    } catch (e) {
        return items.join(", ");
    }
}

export function fmtNum(n: number, opts?: Intl.NumberFormatOptions): string {
    try {
        const id = opts ? "number" + JSON.stringify(opts) : "number";
        return cached(id, () => new Intl.NumberFormat(current, opts)).format(n);
    } catch (e) {
        return String(n);
    }
}

// The locale for dates and times: in English the browser's own, as before there were languages
export function dateLocale(): string | undefined {
    return current === "en" ? undefined : current;
}
