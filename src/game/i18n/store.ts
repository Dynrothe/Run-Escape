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
    return (
        (key !== undefined ? getMessages(current)[key] : undefined) ??
        translateDynamic(text) ??
        text
    );
}

function translateDynamic(text: string): string | undefined {
    let m: RegExpExecArray | null;

    if ((m = /^Evolved:\s*(.+)!$/.exec(text))) {
        return current === "pt-BR" ? `Evoluído: ${tl(m[1])}!` : text;
    }

    if ((m = /^(.+?)\s+set bonus:\s*(.+)!$/.exec(text))) {
        return current === "pt-BR" ? `Bônus do conjunto ${tl(m[1])}: ${tl(m[2])}!` : text;
    }

    if ((m = /^(.+?)\s+has appeared!$/.exec(text))) {
        return current === "pt-BR" ? `${tl(m[1])} apareceu!` : text;
    }

    if ((m = /^Room\s+(\d+)\s+of\s+(\d+):\s*(.+)$/.exec(text))) {
        return current === "pt-BR" ? `Sala ${m[1]} de ${m[2]}: ${tl(m[3])}` : text;
    }

    if ((m = /^Teleported to\s+(.+?)\.\s*(\d+)\s+teleports?\s+left\.$/.exec(text))) {
        const teleWord = m[2] === "1" ? "teletransporte restante" : "teletransportes restantes";
        return current === "pt-BR" ? `Teleportado para ${tl(m[1])}. ${m[2]} ${teleWord}.` : text;
    }

    if (
        (m =
            /^Room cleared! Boss down in\s*(\d+:\d+):\s*\+(\d+)\s+raid points,\s*\+([0-9,.]+)\s+coins\.$/.exec(
                text,
            ))
    ) {
        return current === "pt-BR"
            ? `Sala concluída! Chefe derrotado em ${m[1]}: +${m[2]} pontos de incursão, +${m[3]} moedas.`
            : text;
    }

    if ((m = /^(.+?)\s+protects from\s+(.+)!$/.exec(text))) {
        const styles = m[2]
            .split(" and ")
            .map((s) => tl(s))
            .join(" e ");
        return current === "pt-BR" ? `${tl(m[1])} protege contra ${styles}!` : text;
    }

    if ((m = /^New item added to your collection log:\s*(.+)$/.exec(text))) {
        return current === "pt-BR"
            ? `Novo item adicionado ao seu registro de coleção: ${tl(m[1])}`
            : text;
    }

    if ((m = /^A purple chest!\s*(.+)$/.exec(text))) {
        return current === "pt-BR" ? `Um baú roxo! ${tl(m[1])}` : text;
    }

    if ((m = /^The chest holds no unique this time\s*\((\d+)%\s*chance\)\.$/.exec(text))) {
        return current === "pt-BR"
            ? `O baú não contém nenhum item único desta vez (${m[1]}% de chance).`
            : text;
    }

    if ((m = /^Bot nuke!\s*(\d+)\s+bots?\s+banned\.$/.exec(text))) {
        const botWord = m[1] === "1" ? "bot banido" : "bots banidos";
        return current === "pt-BR" ? `Bomba de bots! ${m[1]} ${botWord}.` : text;
    }

    if ((m = /^(.+?)\s+He'll face\s+(.+)!$/.exec(text))) {
        const sides: Record<string, string> = {
            north: "norte",
            south: "sul",
            east: "leste",
            west: "oeste",
        };
        const side = sides[m[2].toLowerCase()] ?? m[2];
        return current === "pt-BR" ? `${tl(m[1])} Ele ficará de frente para o ${side}!` : text;
    }

    if (
        (m =
            /^(.+?)\s+turns\s+(grey|green|blue)!\s*(Only|Mostly)\s+(melee|ranged|magic)\s+hurts it\.$/.exec(
                text,
            ))
    ) {
        const colors: Record<string, string> = { grey: "cinza", green: "verde", blue: "azul" };
        const color = colors[m[2]] ?? m[2];
        const onlyWord = m[3] === "Only" ? "Apenas" : "Principalmente";
        const style = tl(m[4]);
        return current === "pt-BR"
            ? `${tl(m[1])} fica ${color}! ${onlyWord} ${style} causa dano.`
            : text;
    }

    return undefined;
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
