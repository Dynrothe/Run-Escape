import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    ...ADDRESSES,
    files: [{ path: "index.html", sha256: SHA, size: 10 }],
};

describe("parseSiteFiles", () => {
    test("reads a good one, and leaves out anything else", () => {
        expect(parseSiteFiles(JSON.stringify({ ...site, extra: true }))).toEqual(site);
    });

    const file = (path: string) => ({ path, sha256: SHA, size: 1 });
    test.each([
        ["not JSON", "<html>"],
        ["null", "null"],
        ["a build of another version", JSON.stringify({ ...site, version: "0.29.0" })],
        ["a build that isn't one", JSON.stringify({ ...site, build: "0.30.0" })],
        ["no addresses", JSON.stringify({ ...site, coopUrl: undefined })],
        ["no index.html", JSON.stringify({ ...site, files: [file("a.js")] })],
        ["a climb out", JSON.stringify({ ...site, files: [...site.files, file("../x")] })],
        ["a cache file", JSON.stringify({ ...site, files: [...site.files, file("caches/a")] })],
        ["the marker", JSON.stringify({ ...site, files: [...site.files, file("verified.json")] })],
        [
            "the same file twice",
            JSON.stringify({ ...site, files: [...site.files, file("INDEX.html")] }),
        ],
        [
            "a bad sha256",
            JSON.stringify({ ...site, files: [{ ...file("index.html"), sha256: "x" }] }),
        ],
    ])("refuses %s", (_name, text) => {
        expect(() => parseSiteFiles(text)).toThrow();
    });
});

describe("isSiteFilePath", () => {
    test.each(["index.html", "assets/index-CjI-souU.js", "static/.htaccess", "icons/a b.png"])(
        "takes %s",
        (file) => expect(isSiteFilePath(file)).toBe(true),
    );
    test.each([
        "",
        "/index.html",
        "a\\b.js",
        "a/../b",
        "c:x",
        "assets/",
        "x.",
        "caches/caches.json",
    ])("refuses %s", (file) => expect(isSiteFilePath(file)).toBe(false));
});

describe("parseSiteCaches", () => {
    const chunk = { file: "0".repeat(32) + ".bin", size: 5 };
    const cache = { slimOf: "osrs", build: site.build, chunks: [chunk] };

    test("gives the chunks of a slim cache for the build", () => {
        expect(parseSiteCaches(JSON.stringify([cache]), site.build)).toEqual([chunk]);
    });

    test.each([
        ["another build's", [{ ...cache, build: "0.30.0-a6f7bcdc" }]],
        ["a full cache", [{ ...cache, slimOf: undefined }]],
        ["two caches", [cache, cache]],
        ["a badly named chunk", [{ ...cache, chunks: [{ file: "../x.bin", size: 1 }] }]],
        ["a chunk twice", [{ ...cache, chunks: [chunk, chunk] }]],
    ])("refuses %s", (_name, caches) => {
        expect(() => parseSiteCaches(JSON.stringify(caches), site.build)).toThrow();
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

        const files = makeSiteFiles(dist, site.build, "1.0.0", ADDRESSES);
        expect(files.files.map((file) => file.path)).toEqual(["assets/index-1.js", "index.html"]);
        expect(files.files[1]).toEqual({
            path: "index.html",
            sha256: createHash("sha256").update("<html>").digest("hex"),
            size: 6,
        });
        expect(files).toMatchObject({ build: site.build, version: "0.30.0", ...ADDRESSES });
        // What it writes, it reads back
        expect(parseSiteFiles(JSON.stringify(files))).toEqual(files);
    });
});
