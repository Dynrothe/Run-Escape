import JSZip from "jszip";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Server, ServerResponse, createServer } from "node:http";
import { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { GameManifest } from "./gameFiles";
import {
    MANIFEST_NAME,
    UpdateCheck,
    checkForUpdate,
    gameZipName,
    installUpdate,
    readInstalledGames,
    removeOldGames,
} from "./gameUpdate";
import { ReleaseSource } from "./releaseSource";

// A stand-in for GitHub on localhost: the releases API, assets, and the storage host they
// redirect to. Each test says what it answers.
type Route = (res: ServerResponse) => void;

let server: Server;
let base: string;
let dataDir: string;
let routes: Record<string, Route>;
let source: ReleaseSource;

const never = new AbortController().signal;

const json = (body: unknown, code = 200): Route => {
    return (res) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
    };
};
const bytes = (body: Buffer): Route => {
    return (res) => {
        res.writeHead(200, { "Content-Length": body.byteLength });
        res.end(body);
    };
};
const redirectTo = (location: string): Route => {
    return (res) => {
        res.writeHead(302, { Location: location });
        res.end();
    };
};

function publish(manifest: GameManifest, zip?: Buffer, tag = `v${manifest.version}`): void {
    const zipName = gameZipName(manifest.version);
    const assets = [
        { name: MANIFEST_NAME, browser_download_url: `${base}/assets/${MANIFEST_NAME}` },
    ];
    if (zip) {
        assets.push({ name: zipName, browser_download_url: `${base}/assets/${zipName}` });
        routes[`/assets/${zipName}`] = bytes(zip);
    }
    routes["/api/latest"] = json({
        tag_name: tag,
        html_url: `${base}/releases/tag/${tag}`,
        assets,
    });
    routes[`/assets/${MANIFEST_NAME}`] = json(manifest);
}

async function gameZip(files: Record<string, string> = {}): Promise<Buffer> {
    const zip = new JSZip();
    zip.file("index.html", "<html>new</html>");
    zip.file("caches/caches.json", "[]");
    // No implied folders: each entry should be judged on its own name
    for (const [name, text] of Object.entries(files)) {
        zip.file(name, text, { createFolders: false });
    }
    return zip.generateAsync({ type: "nodebuffer" });
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

function manifestFor(zip: Buffer, version = "0.21.0", minLauncher = "1.0.0"): GameManifest {
    return { version, sha256: sha256(zip), minLauncher };
}

const check = (
    installed = "0.20.0",
    launcher = "1.0.0",
    timeoutMs?: number,
): Promise<UpdateCheck> => checkForUpdate(source, installed, launcher, never, timeoutMs);

function install(manifest: GameManifest, signal = never, stallMs?: number) {
    const zipUrl = `${base}/assets/${gameZipName(manifest.version)}`;
    return installUpdate(manifest, zipUrl, source, dataDir, signal, () => {}, stallMs);
}

function installedGame(version: string, minLauncher = "1.0.0"): string {
    const folder = path.join(dataDir, "game", version);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "index.html"), `<html>${version}</html>`);
    const marker = { version, sha256: "a".repeat(64), minLauncher };
    writeFileSync(path.join(folder, "verified.json"), JSON.stringify(marker));
    return folder;
}

const workLeftBehind = () => existsSync(path.join(dataDir, "game-update"));

beforeAll(async () => {
    server = createServer((req, res) => {
        const route = routes[req.url!.split("?")[0]];
        if (route) {
            route(res);
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
    server.closeAllConnections();
    server.close();
});

beforeEach(() => {
    routes = {};
    dataDir = mkdtempSync(path.join(tmpdir(), "game-update-"));
    source = {
        latestReleaseUrl: `${base}/api/latest`,
        isAssetUrl: (url) => url.startsWith(`${base}/assets/`),
        isRedirectUrl: (url) => url.startsWith(`${base}/storage/`),
        isReleasePage: (url) => url.startsWith(`${base}/releases/`),
    };
});

afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
});

describe("checkForUpdate", () => {
    test("finds a newer release", async () => {
        const zip = await gameZip();
        const manifest = manifestFor(zip);
        publish(manifest, zip);
        expect(await check()).toEqual({
            kind: "update",
            manifest,
            zipUrl: `${base}/assets/game-0.21.0.zip`,
        });
    });

    test("has nothing to do when the release isn't newer", async () => {
        const zip = await gameZip();
        publish(manifestFor(zip), zip);
        expect((await check("0.21.0")).kind).toBe("none");
        expect((await check("0.22.0")).kind).toBe("none");
    });

    test("has nothing to do before there's a published release", async () => {
        expect((await check()).kind).toBe("none");
    });

    test("has nothing to do with a release that has no manifest", async () => {
        routes["/api/latest"] = json({ tag_name: "v0.21.0", assets: [] });
        expect((await check()).kind).toBe("none");
    });

    test("asks for a new launcher rather than updating past it", async () => {
        const zip = await gameZip();
        publish(manifestFor(zip, "0.21.0", "2.0.0"), zip);
        expect(await check()).toEqual({
            kind: "launcher",
            version: "0.21.0",
            releasePage: `${base}/releases/tag/v0.21.0`,
        });
    });

    test("doesn't ask for a new launcher when the game's already up to date", async () => {
        const zip = await gameZip();
        publish(manifestFor(zip, "0.21.0", "2.0.0"), zip);
        expect((await check("0.21.0")).kind).toBe("none");
    });

    test("fails when rate limited", async () => {
        routes["/api/latest"] = json({ message: "API rate limit exceeded" }, 403);
        await expect(check()).rejects.toThrow(/403/);
    });

    test("fails when offline", async () => {
        source.latestReleaseUrl = "http://127.0.0.1:1/api/latest";
        await expect(check()).rejects.toThrow();
    });

    test("doesn't wait for a server that never answers", async () => {
        routes["/api/latest"] = () => {};
        const started = Date.now();
        await expect(check("0.20.0", "1.0.0", 200)).rejects.toThrow();
        expect(Date.now() - started).toBeLessThan(2000);
    });

    test("refuses a manifest from somewhere else", async () => {
        const zip = await gameZip();
        publish(manifestFor(zip), zip);
        source.isAssetUrl = () => false;
        await expect(check()).rejects.toThrow(/Won't download/);
    });

    test("refuses a broken manifest, and one that doesn't match its release", async () => {
        const zip = await gameZip();
        publish(manifestFor(zip), zip, "v0.21.1");
        await expect(check()).rejects.toThrow(/release/);
        publish(manifestFor(zip), zip);
        routes[`/assets/${MANIFEST_NAME}`] = json({ version: "nope" });
        await expect(check()).rejects.toThrow(/valid/);
    });
});

describe("installUpdate", () => {
    test("installs a verified update as game/<version>", async () => {
        const zip = await gameZip({ "assets/app.js": "code" });
        const manifest = manifestFor(zip);
        routes["/assets/game-0.21.0.zip"] = bytes(zip);
        const fractions: (number | undefined)[] = [];
        const folder = await installUpdate(
            manifest,
            `${base}/assets/game-0.21.0.zip`,
            source,
            dataDir,
            never,
            (fraction) => fractions.push(fraction),
        );

        expect(folder.path).toBe(path.join(dataDir, "game", "0.21.0"));
        expect(readFileSync(path.join(folder.path, "assets", "app.js"), "utf8")).toBe("code");
        expect(fractions[fractions.length - 1]).toBe(1);
        expect(workLeftBehind()).toBe(false);
        expect(await readInstalledGames(dataDir)).toEqual([
            { version: "0.21.0", path: folder.path, minLauncher: "1.0.0" },
        ]);
    });

    test("follows a redirect to the storage host", async () => {
        const zip = await gameZip();
        routes["/assets/game-0.21.0.zip"] = redirectTo(`${base}/storage/blob`);
        routes["/storage/blob"] = bytes(zip);
        const folder = await install(manifestFor(zip));
        expect(existsSync(path.join(folder.path, "index.html"))).toBe(true);
    });

    test("won't follow a redirect anywhere else", async () => {
        const zip = await gameZip();
        routes["/assets/game-0.21.0.zip"] = redirectTo(`${base}/elsewhere/blob`);
        routes["/elsewhere/blob"] = bytes(zip);
        await expect(install(manifestFor(zip))).rejects.toThrow(/redirect/);
    });

    test("won't start from anywhere else", async () => {
        const zip = await gameZip();
        routes["/assets/game-0.21.0.zip"] = bytes(zip);
        source.isAssetUrl = () => false;
        await expect(install(manifestFor(zip))).rejects.toThrow(/Won't download/);
    });

    test("leaves the old game alone when the sha256 doesn't match", async () => {
        const old = installedGame("0.20.5");
        const zip = await gameZip();
        routes["/assets/game-0.21.0.zip"] = bytes(zip);
        const manifest = { ...manifestFor(zip), sha256: "b".repeat(64) };

        await expect(install(manifest)).rejects.toThrow(/sha256/);
        expect(existsSync(path.join(dataDir, "game", "0.21.0"))).toBe(false);
        expect(existsSync(path.join(old, "index.html"))).toBe(true);
        expect(workLeftBehind()).toBe(false);
    });

    test("leaves the old game alone when the download's cut off", async () => {
        const old = installedGame("0.20.5");
        const zip = await gameZip();
        routes["/assets/game-0.21.0.zip"] = (res) => {
            res.writeHead(200, { "Content-Length": zip.byteLength });
            res.write(zip.subarray(0, 10), () => res.destroy());
        };
        await expect(install(manifestFor(zip))).rejects.toThrow();
        expect(existsSync(path.join(dataDir, "game", "0.21.0"))).toBe(false);
        expect(existsSync(path.join(old, "index.html"))).toBe(true);
    });

    test("leaves the old game alone when cancelled partway", async () => {
        const old = installedGame("0.20.5");
        const zip = await gameZip();
        const cancel = new AbortController();
        routes["/assets/game-0.21.0.zip"] = (res) => {
            res.writeHead(200, { "Content-Length": zip.byteLength });
            res.write(zip.subarray(0, 10), () => cancel.abort(new Error("Cancelled")));
        };
        await expect(install(manifestFor(zip), cancel.signal)).rejects.toThrow(/Cancelled/);
        expect(existsSync(path.join(dataDir, "game", "0.21.0"))).toBe(false);
        expect(existsSync(path.join(old, "index.html"))).toBe(true);
        expect(workLeftBehind()).toBe(false);
    });

    test("gives up on a download that stalls", async () => {
        const zip = await gameZip();
        routes["/assets/game-0.21.0.zip"] = (res) => {
            res.writeHead(200, { "Content-Length": zip.byteLength });
            res.write(zip.subarray(0, 10));
        };
        await expect(install(manifestFor(zip), never, 150)).rejects.toThrow(/stalled/);
    });

    test.each([
        ["a relative climb", "../evil.txt"],
        ["a deeper climb", "assets/../../evil.txt"],
        ["backslashes", "..\\evil.txt"],
        ["an absolute path", "/evil.txt"],
    ])("rejects a zip with %s, and writes none of it", async (_name, entry) => {
        const zip = await gameZip({ [entry]: "evil" });
        routes["/assets/game-0.21.0.zip"] = bytes(zip);
        await expect(install(manifestFor(zip))).rejects.toThrow(/Unsafe path.*evil\.txt/);
        expect(existsSync(path.join(dataDir, "evil.txt"))).toBe(false);
        expect(existsSync(path.join(dataDir, "game-update", "evil.txt"))).toBe(false);
        expect(existsSync(path.join(dataDir, "game", "0.21.0"))).toBe(false);
    });

    test("rejects a zip that isn't a whole game", async () => {
        const zip = await new JSZip()
            .file("index.html", "<html></html>")
            .generateAsync({ type: "nodebuffer" });
        routes["/assets/game-0.21.0.zip"] = bytes(zip);
        await expect(install(manifestFor(zip))).rejects.toThrow();
        expect(existsSync(path.join(dataDir, "game", "0.21.0"))).toBe(false);
    });

    test("rejects a file that isn't a zip", async () => {
        const notZip = Buffer.from("<html>not found</html>");
        routes["/assets/game-0.21.0.zip"] = bytes(notZip);
        await expect(install(manifestFor(notZip))).rejects.toThrow();
    });

    test("replaces a folder that never finished", async () => {
        const unfinished = path.join(dataDir, "game", "0.21.0");
        mkdirSync(unfinished, { recursive: true });
        writeFileSync(path.join(unfinished, "stale.txt"), "stale");
        const zip = await gameZip();
        routes["/assets/game-0.21.0.zip"] = bytes(zip);
        await install(manifestFor(zip));
        expect(existsSync(path.join(unfinished, "stale.txt"))).toBe(false);
        expect(existsSync(path.join(unfinished, "index.html"))).toBe(true);
    });
});

describe("readInstalledGames", () => {
    test("is empty before there are updates", async () => {
        expect(await readInstalledGames(dataDir)).toEqual([]);
    });

    test("counts only finished installs", async () => {
        const good = installedGame("0.21.0", "1.2.0");
        rmSync(path.join(installedGame("0.22.0"), "verified.json"));
        rmSync(path.join(installedGame("0.23.0"), "index.html"));
        writeFileSync(path.join(installedGame("0.24.0"), "verified.json"), "broken");
        installedGame("not-a-version");
        // A marker that's been copied to the wrong folder
        const moved = installedGame("0.25.0");
        writeFileSync(
            path.join(moved, "verified.json"),
            readFileSync(path.join(good, "verified.json")),
        );

        expect(await readInstalledGames(dataDir)).toEqual([
            { version: "0.21.0", path: good, minLauncher: "1.2.0" },
        ]);
    });
});

describe("removeOldGames", () => {
    test("removes what's older and what's left over, and keeps the rest", async () => {
        const old = installedGame("0.20.0");
        const inUse = installedGame("0.21.0");
        const newer = installedGame("0.22.0", "2.0.0");
        const leftovers = path.join(dataDir, "game-update");
        mkdirSync(leftovers);

        await removeOldGames(dataDir, { version: "0.21.0", path: inUse });

        expect(existsSync(old)).toBe(false);
        expect(existsSync(leftovers)).toBe(false);
        expect(existsSync(inUse)).toBe(true);
        // Needs a newer launcher, which the player may well get
        expect(existsSync(newer)).toBe(true);
    });

    test("does nothing before there are updates", async () => {
        await removeOldGames(dataDir, { version: "0.20.0", path: "bundled" });
        expect(existsSync(path.join(dataDir, "game"))).toBe(false);
    });
});
