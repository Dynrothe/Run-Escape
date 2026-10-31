import path from "node:path";

import {
    GameFolder,
    changelogSection,
    compareVersions,
    parseManifest,
    pickGameFolder,
    zipEntryPath,
} from "./gameFiles";
import { GITHUB_SOURCE } from "./releaseSource";

const SHA = "a".repeat(64);

describe("compareVersions", () => {
    test("compares numbers, not text", () => {
        expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
        expect(compareVersions("0.9.9", "0.10.0")).toBeLessThan(0);
        expect(compareVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
        expect(compareVersions("0.20.1", "0.20.0")).toBeGreaterThan(0);
        expect(compareVersions("0.20.0", "0.20.0")).toBe(0);
    });

    test("refuses what isn't a version", () => {
        expect(() => compareVersions("v1.0.0", "1.0.0")).toThrow();
        expect(() => compareVersions("1.0.0", "1.0")).toThrow();
        expect(() => compareVersions("1.0.0-beta", "1.0.0")).toThrow();
    });
});

describe("parseManifest", () => {
    const manifest = { version: "0.21.0", sha256: SHA, minLauncher: "1.0.0" };

    test("reads a good one, and leaves out anything else", () => {
        const text = JSON.stringify({ ...manifest, extra: true });
        expect(parseManifest(text)).toEqual(manifest);
    });

    test.each([
        ["not JSON", "<html>"],
        ["null", "null"],
        ["a list", "[]"],
        ["no version", JSON.stringify({ ...manifest, version: undefined })],
        ["a tag for a version", JSON.stringify({ ...manifest, version: "v0.21.0" })],
        ["a number for a version", JSON.stringify({ ...manifest, version: 21 })],
        ["no minLauncher", JSON.stringify({ ...manifest, minLauncher: undefined })],
        ["a short sha256", JSON.stringify({ ...manifest, sha256: "abc" })],
        ["an uppercase sha256", JSON.stringify({ ...manifest, sha256: "A".repeat(64) })],
    ])("refuses %s", (_name, text) => {
        expect(() => parseManifest(text)).toThrow();
    });
});

describe("pickGameFolder", () => {
    const bundled: GameFolder = { version: "0.20.0", path: "bundled" };
    const folder = (version: string, minLauncher = "1.0.0"): GameFolder => ({
        version,
        path: version,
        minLauncher,
    });

    test("falls back on the bundled files", () => {
        expect(pickGameFolder(bundled, [], "1.0.0")).toBe(bundled);
    });

    test("takes the newest update", () => {
        const newest = folder("0.22.0");
        const installed = [folder("0.21.0"), newest, folder("0.20.5")];
        expect(pickGameFolder(bundled, installed, "1.0.0")).toBe(newest);
    });

    test("compares versions as numbers", () => {
        const newest = folder("0.100.0");
        expect(pickGameFolder(bundled, [folder("0.99.0"), newest], "1.0.0")).toBe(newest);
    });

    test("prefers the bundled files over an older or equal update", () => {
        expect(pickGameFolder(bundled, [folder("0.19.0")], "1.0.0")).toBe(bundled);
        expect(pickGameFolder(bundled, [folder("0.20.0")], "1.0.0")).toBe(bundled);
    });

    test("leaves out an update that needs a newer launcher", () => {
        const usable = folder("0.21.0");
        const installed = [usable, folder("0.22.0", "2.0.0")];
        expect(pickGameFolder(bundled, installed, "1.0.0")).toBe(usable);
        expect(pickGameFolder(bundled, installed, "2.0.0").version).toBe("0.22.0");
    });
});

describe("zipEntryPath", () => {
    test("places ordinary entries inside the target", () => {
        expect(zipEntryPath("/data/x", "index.html", path.posix)).toBe("/data/x/index.html");
        expect(zipEntryPath("/data/x", "assets/a-1.js", path.posix)).toBe("/data/x/assets/a-1.js");
        expect(zipEntryPath("/data/x", "assets/", path.posix)).toBe("/data/x/assets");
        expect(zipEntryPath("/data/x", "static/.htaccess", path.posix)).toBe(
            "/data/x/static/.htaccess",
        );
    });

    test.each([
        ["../evil"],
        ["a/../../evil"],
        ["..\\evil"],
        ["a\\..\\..\\evil"],
        ["/etc/passwd"],
        ["\\Windows\\evil"],
        ["\\\\server\\share\\evil"],
        ["C:\\evil"],
        ["C:evil"],
        ["a/.. /evil"],
        ["a/... /evil"],
        ["a/..."],
        ["file.txt:stream"],
        ["a\0b"],
        ["a//b"],
        [""],
        ["./"],
    ])("rejects %j", (name) => {
        expect(() => zipEntryPath("/data/x", name)).toThrow(/Unsafe/);
    });

    test("holds on Windows paths too", () => {
        const target = "C:\\Users\\p\\AppData\\Roaming\\Run Escape\\x";
        expect(zipEntryPath(target, "assets/a.js", path.win32)).toBe(target + "\\assets\\a.js");
        for (const name of ["..\\evil", "C:\\evil", "../evil", "\\evil"]) {
            expect(() => zipEntryPath(target, name, path.win32)).toThrow(/Unsafe/);
        }
    });

    test("doesn't take a sibling folder with the same prefix for the target", () => {
        expect(() => zipEntryPath("/data/x", "../x-evil/file")).toThrow(/Unsafe/);
    });
});

describe("GITHUB_SOURCE", () => {
    const asset =
        "https://github.com/Dynrothe/Run-Escape/releases/download/v0.21.0/game-0.21.0.zip";

    test("downloads only from the repository's release assets, over https", () => {
        expect(GITHUB_SOURCE.isAssetUrl(asset)).toBe(true);
        for (const url of [
            asset.replace("https:", "http:"),
            asset.replace("github.com", "github.com.evil.example"),
            asset.replace("github.com", "evil.example"),
            asset.replace("github.com", "github.com:8443"),
            asset.replace("https://", "https://user:pass@"),
            asset.replace("Dynrothe/Run-Escape", "someone/else"),
            "https://github.com/Dynrothe/Run-Escape/archive/main.zip",
            "not a url",
        ]) {
            expect(GITHUB_SOURCE.isAssetUrl(url)).toBe(false);
        }
    });

    test("only follows redirects to GitHub's hosts, over https", () => {
        const storage = "https://release-assets.githubusercontent.com/x/game.zip?sig=1";
        expect(GITHUB_SOURCE.isRedirectUrl(storage)).toBe(true);
        expect(GITHUB_SOURCE.isRedirectUrl(asset)).toBe(true);
        for (const url of [
            storage.replace("https:", "http:"),
            "https://githubusercontent.com.evil.example/x",
            "https://evilgithubusercontent.com/x",
            "https://evil.example/x",
        ]) {
            expect(GITHUB_SOURCE.isRedirectUrl(url)).toBe(false);
        }
    });

    test("opens only the repository's release pages", () => {
        const page = "https://github.com/Dynrothe/Run-Escape/releases/tag/v0.21.0";
        expect(GITHUB_SOURCE.isReleasePage(page)).toBe(true);
        expect(GITHUB_SOURCE.isReleasePage("https://evil.example/releases/")).toBe(false);
    });
});

describe("changelogSection", () => {
    const changelog = [
        "# Changelog",
        "",
        "## Unreleased",
        "",
        "## 0.20.1 - 2026-11-01",
        "",
        "### Fixed",
        "",
        "- One thing.",
        "",
        "## 0.20.0 - 2026-10-31",
        "",
        "### Added",
        "",
        "- Another.",
    ];

    test("takes one version's section", () => {
        const text = changelog.join("\n");
        expect(changelogSection(text, "0.20.1")).toBe("### Fixed\n\n- One thing.");
        expect(changelogSection(text, "0.20.0")).toBe("### Added\n\n- Another.");
    });

    test("reads a file checked out with Windows line endings", () => {
        const text = changelog.join("\r\n");
        expect(changelogSection(text, "0.20.1")).toBe("### Fixed\n\n- One thing.");
    });

    test("doesn't take a version that only starts the same", () => {
        expect(() => changelogSection("## 0.20.10 - x\n\n- a", "0.20.1")).toThrow();
    });

    test("stops a release with no section", () => {
        expect(() => changelogSection(changelog.join("\n"), "0.99.0")).toThrow(/no section/);
    });
});
