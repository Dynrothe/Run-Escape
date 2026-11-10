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
// (a stat icon found by wording). Built the first time it's asked for, for each language.
const reverseLang = new Map<Lang, Map<string, string>>();

export function englishForTranslation(lang: Lang, text: string): string | undefined {
    let reverse = reverseLang.get(lang);
    if (!reverse) {
        reverse = new Map();
        for (const [key, value] of Object.entries(catalogs[lang])) {
            const english = catalogs.en[key];
            if (english !== undefined && !reverse.has(value)) {
                reverse.set(value, english);
            }
        }
        reverseLang.set(lang, reverse);
    }
    return reverse.get(text);
}

// Swaps in other messages (for tests, which can't lean on the real files being filled
// in). Languages not given keep theirs. Returns what puts them back.
export function overrideMessages(messages: Partial<Record<Lang, Messages>>): () => void {
    const before = catalogs;
    catalogs = { ...catalogs, ...messages } as Record<Lang, Messages>;
    reverseEn = undefined;
    reverseLang.clear();
    return () => {
        catalogs = before;
        reverseEn = undefined;
        reverseLang.clear();
    };
}
