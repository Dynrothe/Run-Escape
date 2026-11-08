import { useSyncExternalStore } from "react";

import { getMessages, keyForEnglish } from "./catalog";
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
    if (language.startsWith("es")) {
        return "es";
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
        category = new Intl.PluralRules(current).select(n);
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
    return (key !== undefined ? getMessages(current)[key] : undefined) ?? text;
}

export function list(items: string[]): string {
    try {
        return new Intl.ListFormat(current, { style: "long", type: "conjunction" }).format(items);
    } catch (e) {
        return items.join(", ");
    }
}

export function fmtNum(n: number, opts?: Intl.NumberFormatOptions): string {
    try {
        return new Intl.NumberFormat(current, opts).format(n);
    } catch (e) {
        return String(n);
    }
}
