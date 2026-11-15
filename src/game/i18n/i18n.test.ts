import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POWER_UPS } from "../content/powerups";
import { createVardhelmOpening } from "../scaperune/maps/vardhelmOpening";
import { files, overrideMessages } from "./catalog";
import {
    LANGS,
    dateLocale,
    fmtNum,
    getLang,
    list,
    setLang,
    subscribeLang,
    t,
    tl,
    tp,
    tr,
} from "./index";

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
        for (const lang of ["pt-BR"] as const) {
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

    // Text the code builds or holds in English reaches the screen through tl, so it needs a key
    it("has keys for the cinematic lines and the light power-ups' notice", () => {
        const english = new Set(Object.values(files.en["ui-misc"]));
        const { cinematic } = createVardhelmOpening(0, 0, { x: 0, y: 0 });
        for (const cue of cinematic.cues) {
            if (cue.say !== undefined) {
                expect(english, cue.say).toContain(cue.say);
            }
        }
        for (const powerUp of POWER_UPS) {
            if (powerUp.effect.kind === "light") {
                const notice = `Your ${powerUp.name.toLowerCase()} lights up the dark!`;
                expect(english, notice).toContain(notice);
            }
        }
    });

    // (c) every English file has its mirrors
    it("has a pt-BR file for every English one", () => {
        for (const ns of namespaces) {
            expect(files["pt-BR"], `pt-BR/${ns}.json`).toHaveProperty(ns);
        }
    });

    it("has no keys in pt-BR files that English lacks as a file", () => {
        for (const lang of ["pt-BR"] as const) {
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

    it("tp uses .zero for 0 when there is one, and falls back to English and the key", () => {
        expect(tp("item.zero", 0)).toBe("No gems");
        expect(tp("item.zero", 1)).toBe("1 gem");
        setLang("pt-BR");
        expect(tp("item.zero", 3)).toBe("3 gems");
        expect(tp("item.nowhere", 3)).toBe("item.nowhere");
    });

    it("tp lets params override {n}", () => {
        expect(tp("item.count", 1500, { n: "1,500" })).toBe("1,500 coins");
    });

    it("list joins with the language's conjunction, English's as the game always wrote it", () => {
        expect(list(["a", "b", "c"])).toBe("a, b and c");
        expect(list(["a", "b"])).toBe("a and b");
        expect(list(["a"])).toBe("a");
        expect(list([])).toBe("");
        setLang("pt-BR");
        expect(list(["a", "b", "c"])).toBe("a, b e c");
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
        expect(tl("Something never translated")).toBe("Something never translated");
    });

    it("tl keeps the English when the language has no translation of that key", () => {
        setLang("pt-BR");
        expect(tl("Only English")).toBe("Only English");
    });

    it("tl only knows the English values, not those of other languages", () => {
        setLang("pt-BR");
        expect(tl("Você não passará!")).toBe("Você não passará!");
    });

    it("dates are the browser's own in English, and the language's otherwise", () => {
        expect(dateLocale()).toBeUndefined();
        setLang("pt-BR");
        expect(dateLocale()).toBe("pt-BR");
    });
});

describe("the sim's sentences", () => {
    let restore: () => void;
    beforeEach(() => {
        setLang("en");
        restore = overrideMessages({
            en: {
                "room.maiden": "The Maiden of Sugadinti",
                "style.magic": "magic",
                "notice.teleported.one": "Teleported to {room}. {n} teleport left.",
                "notice.teleported.other": "Teleported to {room}. {n} teleports left.",
                "notice.akkha_turns": "Akkha turns to {style}, and protects from {protects}!",
                "notice.protects_from": "{boss} protects from {styles}!",
                "notice.face": "{first} He'll face {side}!",
                "notice.side.north": "north",
            },
            "pt-BR": {
                "room.maiden": "A Donzela de Sugadinti",
                "style.magic": "magia",
                "notice.teleported.one": "Teleportado para {room}. {n} teletransporte restante.",
                "notice.teleported.other":
                    "Teleportado para {room}. {n} teletransportes restantes.",
                "notice.protects_from": "{boss} protege contra {styles}!",
                "notice.face": "{first} Ele ficará de frente para o {side}!",
                "notice.side.north": "norte",
            },
        });
    });
    afterEach(() => {
        restore();
        setLang("en");
    });

    it("fills the language's sentence, with the plural and a name the sim put mid-sentence", () => {
        setLang("pt-BR");
        expect(tl("Teleported to the Maiden of Sugadinti. 1 teleport left.")).toBe(
            "Teleportado para A Donzela de Sugadinti. 1 teletransporte restante.",
        );
        expect(tl("Teleported to the Maiden of Sugadinti. 2 teleports left.")).toBe(
            "Teleportado para A Donzela de Sugadinti. 2 teletransportes restantes.",
        );
    });

    it("joins styles the language's way, and translates a word from its own keys", () => {
        setLang("pt-BR");
        expect(tl("Zebak protects from magic and missiles!")).toBe(
            "Zebak protege contra magia e missiles!",
        );
        expect(tl("The Wardens rise. He'll face north!")).toBe(
            "The Wardens rise. Ele ficará de frente para o norte!",
        );
    });

    // The "protects from" sentence would take "Akkha turns to magic, and" for his name
    it("keeps a sentence the language hasn't translated whole, in English", () => {
        setLang("pt-BR");
        const akkha = "Akkha turns to magic, and protects from magic!";
        expect(tl(akkha)).toBe(akkha);
    });

    it("leaves English as the sim wrote it", () => {
        const text = "Teleported to the Maiden of Sugadinti. 1 teleport left.";
        expect(tl(text)).toBe(text);
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

    it("lists the languages", () => {
        expect(LANGS.map((lang) => lang.id)).toEqual(["en", "pt-BR"]);
        expect(LANGS.map((lang) => lang.label)).toEqual(["English", "Português (BR)"]);
    });

    it("saves the choice, sets <html lang> and tells subscribers", () => {
        const seen: string[] = [];
        const unsubscribe = subscribeLang(() => seen.push(getLang()));
        setLang("pt-BR");
        expect(getLang()).toBe("pt-BR");
        expect(stored.get("rune-survivors-language")).toBe("pt-BR");
        expect(documentElement.lang).toBe("pt-BR");
        setLang("pt-BR");
        setLang("en");
        expect(seen).toEqual(["pt-BR", "en"]);
        unsubscribe();
        setLang("pt-BR");
        expect(seen).toEqual(["pt-BR", "en"]);
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
        expect(() => setLang("pt-BR")).not.toThrow();
        expect(getLang()).toBe("pt-BR");
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
        expect(await startsAs("es-MX")).toBe("en");
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
