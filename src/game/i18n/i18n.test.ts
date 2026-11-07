import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { files, overrideMessages } from "./catalog";
import { LANGS, fmtNum, getLang, list, setLang, subscribeLang, t, tl, tp, tr } from "./index";

// The extractors for the generated namespaces (items, world, gen), if they're written yet
const extractors = import.meta.glob<{ default: () => Record<string, string> }>(
    "../../../scripts/i18n/extractors/*.ts",
    { eager: true },
);

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("language files", () => {
    const namespaces = Object.keys(files.en);

    it("has every namespace of the contract in English", () => {
        for (const ns of ["ui", "ui-misc", "gen", "items", "world"]) {
            expect(namespaces).toContain(ns);
        }
    });

    // (a) the generated English files are what their extractors give
    it("keeps en/<ns>.json equal to what its extractor gives", () => {
        for (const [path, module] of Object.entries(extractors)) {
            const ns = path.replace(/^.*\//, "").replace(/\.ts$/, "");
            const extracted = module.default();
            expect(files.en[ns], `${ns}.json`).toEqual(extracted);
            expect(Object.keys(files.en[ns]), `${ns}.json key order`).toEqual(
                Object.keys(extracted),
            );
        }
    });

    // (b) a translation is of a key that exists, with the placeholders it has
    it("only translates keys that exist in English, with the same placeholders", () => {
        const english: Record<string, string> = Object.assign({}, ...Object.values(files.en));
        for (const lang of ["pt-BR", "es"] as const) {
            for (const [ns, messages] of Object.entries(files[lang])) {
                for (const [key, text] of Object.entries(messages)) {
                    expect(english, `${lang}/${ns}: ${key}`).toHaveProperty(key);
                    expect(placeholders(text), `${lang}/${ns}: ${key}`).toEqual(
                        placeholders(english[key]),
                    );
                }
            }
        }
    });

    // (c) every English file has its mirrors
    it("has a pt-BR and an es file for every English one", () => {
        for (const ns of namespaces) {
            expect(files["pt-BR"], `pt-BR/${ns}.json`).toHaveProperty(ns);
            expect(files.es, `es/${ns}.json`).toHaveProperty(ns);
        }
    });

    it("has no keys in pt-BR or es files that English lacks as a file", () => {
        for (const lang of ["pt-BR", "es"] as const) {
            for (const ns of Object.keys(files[lang])) {
                expect(namespaces, `${lang}/${ns}.json`).toContain(ns);
            }
        }
    });
});

describe("translating", () => {
    let restore: () => void;
    beforeEach(() => {
        setLang("en");
        restore = overrideMessages({
            en: {
                "a.hello": "Hello, {name}!",
                "a.twice": "{x} and {x}",
                "a.only_en": "Only English",
                "boss.shout": "You will not pass!",
                "boss.dupe": "You will not pass!",
                "item.count.one": "{n} coin",
                "item.count.other": "{n} coins",
                "item.zero.one": "{n} gem",
                "item.zero.other": "{n} gems",
                "item.zero.zero": "No gems",
            },
            "pt-BR": {
                "a.hello": "Olá, {name}!",
                "boss.shout": "Você não passará!",
                "item.count.one": "{n} moeda",
                "item.count.other": "{n} moedas",
            },
            es: {
                "a.hello": "¡Hola, {name}!",
                "boss.shout": "¡No pasarás!",
                "item.count.one": "{n} moneda",
                "item.count.other": "{n} monedas",
            },
        });
    });
    afterEach(() => {
        restore();
        setLang("en");
    });

    it("starts in English under test", () => {
        expect(getLang()).toBe("en");
    });

    it("t fills {placeholders}, numbers too, and leaves unknown ones", () => {
        expect(t("a.hello", { name: "Zezima" })).toBe("Hello, Zezima!");
        expect(t("a.twice", { x: 3 })).toBe("3 and 3");
        expect(t("a.hello")).toBe("Hello, {name}!");
        expect(t("a.hello", { other: 1 })).toBe("Hello, {name}!");
    });

    it("t uses the active language, then English, then the key", () => {
        setLang("pt-BR");
        expect(t("a.hello", { name: "Zezima" })).toBe("Olá, Zezima!");
        expect(t("a.only_en")).toBe("Only English");
        expect(t("a.missing.entirely")).toBe("a.missing.entirely");
        setLang("es");
        expect(t("a.hello", { name: "Zezima" })).toBe("¡Hola, Zezima!");
        expect(t("a.only_en")).toBe("Only English");
    });

    it("tr falls back to the English in the code, not the key", () => {
        expect(tr("a.missing", "Fallback {x}", { x: 1 })).toBe("Fallback 1");
        expect(tr("a.hello", "Fallback", { name: "Bob" })).toBe("Hello, Bob!");
        setLang("pt-BR");
        expect(tr("a.hello", "Fallback", { name: "Bob" })).toBe("Olá, Bob!");
        expect(tr("a.only_en", "Fallback")).toBe("Only English");
        expect(tr("a.nowhere", "Fallback")).toBe("Fallback");
    });

    it("tp picks the plural form in en", () => {
        expect(tp("item.count", 1)).toBe("1 coin");
        expect(tp("item.count", 0)).toBe("0 coins");
        expect(tp("item.count", 2)).toBe("2 coins");
    });

    it("tp picks the plural form in pt-BR, where 0 is singular", () => {
        setLang("pt-BR");
        expect(tp("item.count", 1)).toBe("1 moeda");
        expect(tp("item.count", 0)).toBe("0 moeda");
        expect(tp("item.count", 2)).toBe("2 moedas");
    });

    it("tp picks the plural form in es", () => {
        setLang("es");
        expect(tp("item.count", 1)).toBe("1 moneda");
        expect(tp("item.count", 0)).toBe("0 monedas");
        expect(tp("item.count", 5)).toBe("5 monedas");
        // es has a "many" category for millions, which falls to "other" when there's no .many
        expect(tp("item.count", 1_000_000)).toBe("1000000 monedas");
    });

    it("tp uses .zero for 0 when there is one, and falls back to English and the key", () => {
        expect(tp("item.zero", 0)).toBe("No gems");
        expect(tp("item.zero", 1)).toBe("1 gem");
        setLang("es");
        expect(tp("item.zero", 3)).toBe("3 gems");
        expect(tp("item.nowhere", 3)).toBe("item.nowhere");
    });

    it("tp lets params override {n}", () => {
        expect(tp("item.count", 1500, { n: "1,500" })).toBe("1,500 coins");
    });

    it("list joins with the language's conjunction", () => {
        expect(list(["a", "b", "c"])).toBe("a, b, and c");
        expect(list(["a", "b"])).toBe("a and b");
        expect(list(["a"])).toBe("a");
        expect(list([])).toBe("");
        setLang("pt-BR");
        expect(list(["a", "b", "c"])).toBe("a, b e c");
        setLang("es");
        expect(list(["a", "b", "c"])).toBe("a, b y c");
    });

    it("fmtNum uses the language's locale", () => {
        expect(fmtNum(1234567.5)).toBe("1,234,567.5");
        setLang("pt-BR");
        expect(fmtNum(1234567.5)).toBe("1.234.567,5");
        expect(fmtNum(0.5, { style: "percent" })).toBe("50%");
    });

    it("tl turns an English text into the active language, or leaves it", () => {
        expect(tl("You will not pass!")).toBe("You will not pass!");
        setLang("pt-BR");
        expect(tl("You will not pass!")).toBe("Você não passará!");
        setLang("es");
        expect(tl("You will not pass!")).toBe("¡No pasarás!");
        expect(tl("Something never translated")).toBe("Something never translated");
    });

    it("tl keeps the English when the language has no translation of that key", () => {
        setLang("pt-BR");
        expect(tl("Only English")).toBe("Only English");
    });

    it("tl only knows the English values, not those of other languages", () => {
        setLang("es");
        expect(tl("Você não passará!")).toBe("Você não passará!");
    });
});

describe("the active language", () => {
    const stored = new Map<string, string>();
    const documentElement = { lang: "" };

    beforeEach(() => {
        stored.clear();
        documentElement.lang = "";
        vi.stubGlobal("window", {
            localStorage: {
                getItem: (key: string) => stored.get(key) ?? null,
                setItem: (key: string, value: string) => void stored.set(key, value),
            },
        });
        vi.stubGlobal("document", { documentElement });
    });
    afterEach(() => {
        setLang("en");
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it("lists the three languages", () => {
        expect(LANGS.map((lang) => lang.id)).toEqual(["en", "pt-BR", "es"]);
        expect(LANGS.map((lang) => lang.label)).toEqual(["English", "Português (BR)", "Español"]);
    });

    it("saves the choice, sets <html lang> and tells subscribers", () => {
        const seen: string[] = [];
        const unsubscribe = subscribeLang(() => seen.push(getLang()));
        setLang("es");
        expect(getLang()).toBe("es");
        expect(stored.get("rune-survivors-language")).toBe("es");
        expect(documentElement.lang).toBe("es");
        setLang("es");
        setLang("pt-BR");
        expect(seen).toEqual(["es", "pt-BR"]);
        unsubscribe();
        setLang("en");
        expect(seen).toEqual(["es", "pt-BR"]);
    });

    it("ignores a language it doesn't have", () => {
        setLang("fr" as never);
        expect(getLang()).toBe("en");
        expect(stored.has("rune-survivors-language")).toBe(false);
    });

    it("works when localStorage throws", () => {
        vi.stubGlobal("window", {
            localStorage: {
                getItem: () => {
                    throw new Error("denied");
                },
                setItem: () => {
                    throw new Error("denied");
                },
            },
        });
        expect(() => setLang("es")).not.toThrow();
        expect(getLang()).toBe("es");
    });

    it("starts from the saved language", async () => {
        stored.set("rune-survivors-language", "pt-BR");
        vi.resetModules();
        const fresh = await import("./index");
        expect(fresh.getLang()).toBe("pt-BR");
        expect(documentElement.lang).toBe("pt-BR");
    });

    it("starts from the browser's language when nothing is saved", async () => {
        const startsAs = async (language: string) => {
            vi.stubGlobal("navigator", { language });
            vi.resetModules();
            return (await import("./index")).getLang();
        };
        expect(await startsAs("pt-PT")).toBe("pt-BR");
        expect(await startsAs("es-MX")).toBe("es");
        expect(await startsAs("de-DE")).toBe("en");
        expect(await startsAs("en-US")).toBe("en");
    });

    it("ignores a saved language it doesn't have", async () => {
        stored.set("rune-survivors-language", "fr");
        vi.stubGlobal("navigator", { language: "en-US" });
        vi.resetModules();
        expect((await import("./index")).getLang()).toBe("en");
    });
});
