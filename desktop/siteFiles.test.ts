import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
    SITE_FILES_NAME,
    SiteFiles,
    isSiteFilePath,
    makeSiteFiles,
    parseSiteCaches,
    parseSiteFiles,
    siteBaseUrl,
    siteFileUrl,
    whyNotFollow,
} from "./siteFiles";

const SHA = "a".repeat(64);
const ADDRESSES = { coopUrl: "wss://relay.example/coop", runAnalyticsUrl: "", cloudSaveUrl: "" };
const site: SiteFiles = {
    build: "0.30.0-19c7e9bd",
    version: "0.30.0",
    minLauncher: "1.0.0",
    minAndroid: "0.0.0",
    ...ADDRESSES,
    files: [{ path: "index.html", sha256: SHA, size: 10 }],
};
const MINIMUMS = { minLauncher: site.minLauncher, minAndroid: site.minAndroid };

// The cases Android's SiteFiles.java has to agree with (its SiteFilesTest runs the same)
type Case = { name: string; change?: Record<string, unknown>; text?: string };
type Cases = { good: Record<string, unknown>; take: Case[]; refuse: Case[] };
type Strings = { take: string[]; refuse: string[] };
const cases: { files: Cases; caches: Cases & { build: string }; sizes: Strings; paths: Strings } =
    JSON.parse(readFileSync(path.join(__dirname, "siteFiles.cases.json"), "utf8"));

// A case as it's sent: its text, or good with its change merged in (null takes a key out)
function caseText({ change, text }: Case, good: Record<string, unknown>, wrap = false) {
    if (text !== undefined) {
        return text;
    }
    const merged: Record<string, unknown> = { ...good, ...change };
    for (const [key, value] of Object.entries(change ?? {})) {
        if (value === null) {
            delete merged[key];
        }
    }
    return JSON.stringify(wrap ? [merged] : merged);
}

describe("parseSiteFiles", () => {
    test("reads a good one, and leaves out anything else", () => {
        expect(parseSiteFiles(JSON.stringify({ ...site, extra: true }))).toEqual(site);
    });

    const { files, sizes } = cases;
    test.each(files.take.map((c) => [c.name, caseText(c, files.good)]))("takes %s", (_, text) => {
        expect(parseSiteFiles(text).build).toBe(site.build);
    });
    test.each(files.refuse.map((c) => [c.name, caseText(c, files.good)]))(
        "refuses %s",
        (_, text) => {
            expect(() => parseSiteFiles(text)).toThrow();
        },
    );

    // A size as JSON has it, in place of the first file's
    const withSize = (size: string) =>
        JSON.stringify({ ...files.good, files: [{ ...site.files[0], size: "SIZE" }] }).replace(
            '"SIZE"',
            size,
        );
    test.each(sizes.take)("takes a size of %s", (size) => {
        expect(() => parseSiteFiles(withSize(size))).not.toThrow();
    });
    test.each(sizes.refuse)("refuses a size of %s", (size) => {
        expect(() => parseSiteFiles(withSize(size))).toThrow();
    });
});

describe("isSiteFilePath", () => {
    test.each(cases.paths.take)("takes %j", (file) => expect(isSiteFilePath(file)).toBe(true));
    test.each(cases.paths.refuse)("refuses %j", (file) => expect(isSiteFilePath(file)).toBe(false));
});

describe("parseSiteCaches", () => {
    const chunk = { file: "0".repeat(32) + ".bin", size: 5 };
    const cache = { slimOf: "osrs", build: site.build, chunks: [chunk] };
    const { caches } = cases;

    test("gives the chunks of a slim cache for the build", () => {
        expect(parseSiteCaches(JSON.stringify([cache]), site.build)).toEqual([chunk]);
    });

    test.each(caches.take.map((c) => [c.name, caseText(c, caches.good, true)]))(
        "takes %s",
        (_, text) => {
            expect(() => parseSiteCaches(text, caches.build)).not.toThrow();
        },
    );
    test.each([
        ...caches.refuse.map((c) => [c.name, caseText(c, caches.good, true)]),
        ["two caches", JSON.stringify([cache, cache])],
    ])("refuses %s", (_, text) => {
        expect(() => parseSiteCaches(text, caches.build)).toThrow();
    });
});

describe("whyNotFollow", () => {
    test("follows a build with the launcher's addresses", () => {
        expect(whyNotFollow(site, "1.0.0", ADDRESSES)).toBeUndefined();
    });

    test("won't follow a build that needs a newer launcher", () => {
        expect(whyNotFollow({ ...site, minLauncher: "1.1.0" }, "1.0.0", ADDRESSES)).toMatch(
            /launcher 1.1.0/,
        );
    });

    test("won't follow a build that reaches somewhere the app doesn't let out", () => {
        const other = { ...ADDRESSES, coopUrl: "wss://other.example/coop" };
        expect(whyNotFollow(site, "1.0.0", other)).toMatch(/coopUrl/);
        expect(whyNotFollow(site, "1.0.0", { ...ADDRESSES, cloudSaveUrl: "https://x" })).toMatch(
            /cloudSaveUrl/,
        );
    });
});

describe("siteBaseUrl", () => {
    test("ends the path in a slash", () => {
        expect(siteBaseUrl("https://jere.io/run-escape")).toBe("https://jere.io/run-escape/");
        expect(siteBaseUrl("https://jere.io/run-escape/")).toBe("https://jere.io/run-escape/");
        expect(siteBaseUrl("https://example.com")).toBe("https://example.com/");
    });

    test.each([
        undefined,
        "",
        "http://jere.io/run-escape/",
        "https://user:pass@jere.io/",
        "https://jere.io/?x=1",
        "not a url",
    ])("refuses %s", (raw) => {
        expect(siteBaseUrl(raw)).toBeUndefined();
    });
});

test("siteFileUrl keeps a file inside the website", () => {
    const base = "https://jere.io/run-escape/";
    expect(siteFileUrl(base, "assets/a b.js")).toBe("https://jere.io/run-escape/assets/a%20b.js");
    expect(siteFileUrl(base, "a?b#c")).toBe("https://jere.io/run-escape/a%3Fb%23c");
});

describe("makeSiteFiles", () => {
    let dist: string;
    beforeEach(() => {
        dist = mkdtempSync(path.join(tmpdir(), "site-files-"));
    });
    afterEach(() => rmSync(dist, { recursive: true, force: true }));

    test("lists the build's files but the cache, maps, .htaccess and itself", () => {
        const write = (file: string, text: string) => {
            mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
            writeFileSync(path.join(dist, file), text);
        };
        write("index.html", "<html>");
        write("assets/index-1.js", "js");
        write("assets/index-1.js.map", "map");
        write(".htaccess", "Header");
        write("caches/caches.json", "[]");
        write("caches/chunks/x.bin", "x");
        write(SITE_FILES_NAME, "{}");

        const files = makeSiteFiles(dist, site.build, MINIMUMS, ADDRESSES);
        expect(files.files.map((file) => file.path)).toEqual(["assets/index-1.js", "index.html"]);
        expect(files.files[1]).toEqual({
            path: "index.html",
            sha256: createHash("sha256").update("<html>").digest("hex"),
            size: 6,
        });
        expect(files).toMatchObject({
            build: site.build,
            version: "0.30.0",
            ...MINIMUMS,
            ...ADDRESSES,
        });
        // What it writes, it reads back
        expect(parseSiteFiles(JSON.stringify(files))).toEqual(files);
    });
});
