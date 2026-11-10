import { LANGS, Lang } from "./types";

// The language files, merged per language. Every file in locales/<lang>/ is a flat
// {"key": "text"} object; a language is all of its files together.

export type Messages = Record<string, string>;

// The files as the bundler read them, by language and then namespace (the file's name
// without .json). import.meta.glob only exists under Vite and Vitest: in a script run
// with tsx the catalog is empty, so t() and tp() give their keys and only tr() and tl() give
// the English in the code.
export const files = Object.fromEntries(LANGS.map((lang) => [lang.id, {}])) as Record<
    Lang,
    Record<string, Messages>
>;

function readFiles(): Record<string, Messages> {
    try {
        return import.meta.glob<Messages>("./locales/*/*.json", {
            eager: true,
            import: "default",
        });
    } catch (e) {
        return {};
    }
}

for (const [path, messages] of Object.entries(readFiles())) {
    const match = /^\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (match && match[1] in files) {
        files[match[1] as Lang][match[2]] = messages;
    }
}

function merge(lang: Lang): Messages {
    return Object.assign({}, ...Object.values(files[lang]));
}

let catalogs = Object.fromEntries(LANGS.map((lang) => [lang.id, merge(lang.id)])) as Record<
    Lang,
    Messages
>;

// English text to its key, for tl(). Built the first time it's asked for
let reverseEn: Map<string, string> | undefined;

export function getMessages(lang: Lang): Messages {
    return catalogs[lang];
}

// The key of an English text, the first one in the file's order when several share it
export function keyForEnglish(text: string): string | undefined {
    if (!reverseEn) {
        reverseEn = new Map();
        for (const [key, value] of Object.entries(catalogs.en)) {
            if (!reverseEn.has(value)) {
                reverseEn.set(value, key);
            }
        }
    }
    return reverseEn.get(text);
}

// A language's text back to the English it was written from, for what only knows the English
// (a stat icon found by wording). Built the first time it's asked for, for each language. A text
// two different English texts translate to has no single source: it gives undefined.
const reverseLang = new Map<Lang, Map<string, string | null>>();

export function englishForTranslation(lang: Lang, text: string): string | undefined {
    let reverse = reverseLang.get(lang);
    if (!reverse) {
        reverse = new Map();
        for (const [key, value] of Object.entries(catalogs[lang])) {
            const english = catalogs.en[key];
            if (english === undefined) {
                continue;
            }
            const known = reverse.get(value);
            if (known === undefined) {
                reverse.set(value, english);
            } else if (known !== english) {
                reverse.set(value, null);
            }
        }
        reverseLang.set(lang, reverse);
    }
    return reverse.get(text) ?? undefined;
}

// Every translation, in a language, of the keys whose English is this text (compared without
// case): "hitpoints a minute" is both a stat's label and a passive's effect, worded alike or not.
let keysByEnglish: Map<string, string[]> | undefined;

export function translationsOfEnglish(lang: Lang, english: string): string[] {
    if (!keysByEnglish) {
        keysByEnglish = new Map();
        for (const [key, value] of Object.entries(catalogs.en)) {
            const lower = value.toLowerCase();
            const keys = keysByEnglish.get(lower);
            if (keys) {
                keys.push(key);
            } else {
                keysByEnglish.set(lower, [key]);
            }
        }
    }
    const found = (keysByEnglish.get(english.toLowerCase()) ?? [])
        .map((key) => catalogs[lang][key])
        .filter((text): text is string => text !== undefined);
    return [...new Set(found)];
}

// Swaps in other messages (for tests, which can't lean on the real files being filled
// in). Languages not given keep theirs. Returns what puts them back.
export function overrideMessages(messages: Partial<Record<Lang, Messages>>): () => void {
    const before = catalogs;
    catalogs = { ...catalogs, ...messages } as Record<Lang, Messages>;
    reverseEn = undefined;
    reverseLang.clear();
    keysByEnglish = undefined;
    return () => {
        catalogs = before;
        reverseEn = undefined;
        reverseLang.clear();
        keysByEnglish = undefined;
    };
}
