import readme from "../../README.md?raw";
import { CacheInfo } from "../rs/cache/CacheInfo";
import {
    GAME_CACHE_NAME,
    deleteOtherGameCaches,
    getCacheMismatch,
    shouldReloadForCache,
} from "./cache";

describe("the game's cache", () => {
    test("is the one the README's Cache version section names", () => {
        const start = readme.indexOf("## Cache version");
        expect(start).not.toBe(-1);
        const section = readme.slice(start, readme.indexOf("\n## ", start + 1));
        expect(section).toContain("`" + GAME_CACHE_NAME + "`");
        // osrs-<revision>_<date>
        const [, revision, date] = /^osrs-(\d+)_(\d{4}-\d{2}-\d{2})$/.exec(GAME_CACHE_NAME)!;
        expect(section).toContain(`OSRS revision ${revision}`);
        const day = new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        });
        expect(section).toContain(day);
    });
});

describe("a slim cache made for another build", () => {
    const info = (build?: string): CacheInfo => ({
        name: GAME_CACHE_NAME + "-slim-12345678",
        game: "oldschool",
        environment: "live",
        revision: 242,
        timestamp: "2026-11-03T10:00:06Z",
        size: 1,
        slimOf: GAME_CACHE_NAME,
        build,
    });

    test("is caught before loading, naming both builds", () => {
        expect(getCacheMismatch(info("0.26.0-aaaa"), "0.26.0-aaaa")).toBeUndefined();
        // The full cache, and a slim one made without a build
        expect(getCacheMismatch(info(), "0.26.0-aaaa")).toBeUndefined();
        const mismatch = getCacheMismatch(info("0.25.0-bbbb"), "0.26.0-aaaa");
        expect(mismatch).toContain("0.25.0-bbbb");
        expect(mismatch).toContain("0.26.0-aaaa");
    });

    test("reloads the page once, then says so rather than reloading again", () => {
        const store = new Map<string, string>();
        vi.stubGlobal("sessionStorage", {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => store.set(key, value),
            removeItem: (key: string) => store.delete(key),
        });
        try {
            expect(shouldReloadForCache("old cache")).toBe(true);
            expect(shouldReloadForCache("old cache")).toBe(false);
            // Another mismatch, after another deploy, gets its own reload
            expect(shouldReloadForCache("older cache")).toBe(true);
            // Loading fine clears it, for the next time
            expect(shouldReloadForCache(undefined)).toBe(false);
            expect(shouldReloadForCache("older cache")).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe("the browser's copies of the game's cache", () => {
    test("keep only the one in use, dropping an older full cache", async () => {
        const names = new Set([
            GAME_CACHE_NAME,
            "osrs-240_2026-08-05",
            "osrs-241_2026-09-30-slim-0123abcd",
            "cache-chunks",
            "map-images",
        ]);
        vi.stubGlobal("caches", {
            keys: async () => [...names],
            delete: async (name: string) => names.delete(name),
        });
        try {
            await deleteOtherGameCaches(GAME_CACHE_NAME);
            expect([...names]).toEqual([GAME_CACHE_NAME, "cache-chunks", "map-images"]);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
