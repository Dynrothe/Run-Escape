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
    chunkAssetName,
    gameZipName,
    installUpdate,
    liteZipName,
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
// Every path asked for, in order
let requested: string[];
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
        requested.push(req.url!);
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
    requested = [];
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

describe("split updates", () => {
    const chunkFile = (data: Buffer) => sha256(data).slice(0, 32) + ".bin";

    // A release of 0.21.0 with these chunks: the whole zip, the lite zip and each chunk
    async function publishSplit(texts: string[], cachesJson?: string) {
        const chunks = texts.map((text) => Buffer.from(text));
        const listed = chunks.map((data) => ({ file: chunkFile(data), size: data.byteLength }));
        const caches = cachesJson ?? JSON.stringify([{ name: "slim", chunks: listed }]);
        const lite = await gameZip({ "caches/caches.json": caches });
        const whole = new JSZip();
        whole.file("index.html", "<html>new</html>").file("caches/caches.json", caches);
        listed.forEach(({ file }, i) => whole.file(`caches/chunks/${file}`, chunks[i]));
        const zip = await whole.generateAsync({ type: "nodebuffer" });
        const manifest: GameManifest = {
            ...manifestFor(zip),
            lite: { sha256: sha256(lite), size: lite.byteLength },
            chunks: listed,
        };
        const assets: [string, Buffer][] = [
            [MANIFEST_NAME, Buffer.from(JSON.stringify(manifest))],
            [gameZipName("0.21.0"), zip],
            [liteZipName("0.21.0"), lite],
            ...listed.map(({ file }, i): [string, Buffer] => [chunkAssetName(file), chunks[i]]),
        ];
        for (const [name, body] of assets) {
            routes[`/assets/${name}`] = bytes(body);
        }
        const release = (names: string[]) =>
            json({
                tag_name: "v0.21.0",
                assets: names.map((name) => ({
                    name,
                    browser_download_url: `${base}/assets/${name}`,
                })),
            });
        routes["/api/latest"] = release(assets.map(([name]) => name));
        return { manifest, chunks, files: listed.map(({ file }) => file), assets, release };
    }

    // A game folder with these chunks in it
    function gameWithChunks(version: string, chunks: Record<string, Buffer>): string {
        const folder = installedGame(version);
        mkdirSync(path.join(folder, "caches", "chunks"), { recursive: true });
        for (const [file, data] of Object.entries(chunks)) {
            writeFileSync(path.join(folder, "caches", "chunks", file), data);
        }
        return folder;
    }

    async function installSplit(reuseFrom: string[], signal = never) {
        const update = await check();
        if (update.kind !== "update") {
            throw new Error("No update");
        }
        requested = [];
        const fractions: (number | undefined)[] = [];
        const failures: unknown[] = [];
        const folder = await installUpdate(
            update.manifest,
            update.zipUrl,
            source,
            dataDir,
            signal,
            (fraction) => fractions.push(fraction),
            undefined,
            update.split,
            reuseFrom,
            (e) => failures.push(e),
        );
        return { folder, fractions, failures };
    }

    const readChunk = (folder: string, file: string) =>
        readFileSync(path.join(folder, "caches", "chunks", file), "utf8");

    const rising = (fractions: (number | undefined)[]) =>
        fractions.every((fraction, i) => i === 0 || fraction! >= fractions[i - 1]!);

    test("the check finds the lite zip and every chunk", async () => {
        const { files } = await publishSplit(["one", "two"]);
        const update = await check();
        expect(update.kind === "update" && update.split).toEqual({
            liteUrl: `${base}/assets/${liteZipName("0.21.0")}`,
            chunkUrls: Object.fromEntries(
                files.map((file) => [file, `${base}/assets/${chunkAssetName(file)}`]),
            ),
        });
    });

    test("the check leaves it out when a chunk isn't in the release", async () => {
        const { files, assets, release } = await publishSplit(["one", "two"]);
        const names = assets.map(([name]) => name);
        routes["/api/latest"] = release(names.filter((name) => name !== chunkAssetName(files[1])));
        const update = await check();
        expect(update.kind).toBe("update");
        expect(update.kind === "update" && update.split).toBeUndefined();
    });

    test("copies the chunks the game has and downloads only the rest", async () => {
        const { chunks, files } = await publishSplit(["kept from the old game", "changed"]);
        const old = gameWithChunks("0.20.0", { [files[0]]: chunks[0] });
        const { folder, fractions, failures } = await installSplit([old]);

        expect(requested).toEqual([
            `/assets/${liteZipName("0.21.0")}`,
            `/assets/${chunkAssetName(files[1])}`,
        ]);
        expect(readChunk(folder.path, files[0])).toBe("kept from the old game");
        expect(readChunk(folder.path, files[1])).toBe("changed");
        expect(rising(fractions)).toBe(true);
        expect(fractions[fractions.length - 1]).toBe(1);
        expect(failures).toEqual([]);
        expect(workLeftBehind()).toBe(false);
    });

    test("downloads a chunk the game has a damaged copy of", async () => {
        const { chunks, files } = await publishSplit(["small", "the same in the old game"]);
        const old = gameWithChunks("0.20.0", {
            [files[0]]: Buffer.from("damaged"),
            [files[1]]: chunks[1],
        });
        const { folder } = await installSplit([old]);
        expect(requested).toEqual([
            `/assets/${liteZipName("0.21.0")}`,
            `/assets/${chunkAssetName(files[0])}`,
        ]);
        expect(readChunk(folder.path, files[0])).toBe("small");
    });

    test("downloads the chunks a few at a time", async () => {
        const texts = ["the old game has this one, the biggest", "1", "2", "3", "4", "5", "6"];
        const { chunks, files } = await publishSplit(texts);
        const old = gameWithChunks("0.20.0", { [files[0]]: chunks[0] });
        let downloading = 0;
        let most = 0;
        files.slice(1).forEach((file, i) => {
            routes[`/assets/${chunkAssetName(file)}`] = (res) => {
                most = Math.max(most, ++downloading);
                setTimeout(() => {
                    downloading--;
                    bytes(chunks[i + 1])(res);
                }, 30);
            };
        });
        const { folder, fractions } = await installSplit([old]);
        expect(most).toBeGreaterThan(1);
        expect(most).toBeLessThanOrEqual(4);
        expect(files.map((file) => readChunk(folder.path, file))).toEqual(texts);
        expect(rising(fractions)).toBe(true);
        expect(fractions[fractions.length - 1]).toBe(1);
    });

    test("downloads the whole zip when the game has none of the chunks", async () => {
        const { files } = await publishSplit(["one", "two"]);
        const { folder } = await installSplit([installedGame("0.20.0")]);
        expect(requested).toEqual([`/assets/${gameZipName("0.21.0")}`]);
        expect(readChunk(folder.path, files[1])).toBe("two");
    });

    test("downloads the whole zip when most of the chunks have changed", async () => {
        const { chunks, files } = await publishSplit(["kept", "changed, and much bigger"]);
        const old = gameWithChunks("0.20.0", { [files[0]]: chunks[0] });
        const { folder } = await installSplit([old]);
        expect(requested).toEqual([`/assets/${gameZipName("0.21.0")}`]);
        expect(readChunk(folder.path, files[1])).toBe("changed, and much bigger");
    });

    test("downloads the whole zip when a chunk downloads as something else", async () => {
        const { chunks, files } = await publishSplit(["kept from the old game", "changed"]);
        const old = gameWithChunks("0.20.0", { [files[0]]: chunks[0] });
        routes[`/assets/${chunkAssetName(files[1])}`] = bytes(Buffer.from("tampered"));
        const { folder, failures } = await installSplit([old]);
        expect(requested[requested.length - 1]).toBe(`/assets/${gameZipName("0.21.0")}`);
        expect(readChunk(folder.path, files[1])).toBe("changed");
        expect(String(failures)).toContain(files[1]);
        expect(workLeftBehind()).toBe(false);
    });

    test("leaves the old game alone when the split update and the whole zip both fail", async () => {
        const { chunks, files } = await publishSplit(["kept from the old game", "changed"]);
        const old = gameWithChunks("0.20.0", { [files[0]]: chunks[0] });
        routes[`/assets/${chunkAssetName(files[1])}`] = bytes(Buffer.from("tampered"));
        routes[`/assets/${gameZipName("0.21.0")}`] = bytes(Buffer.from("not a zip"));
        await expect(installSplit([old])).rejects.toThrow();
        expect(existsSync(path.join(dataDir, "game", "0.21.0"))).toBe(false);
        expect(existsSync(path.join(old, "index.html"))).toBe(true);
        expect(workLeftBehind()).toBe(false);
    });

    test("doesn't fall back to the whole zip when cancelled", async () => {
        const { chunks, files } = await publishSplit(["kept from the old game", "changed"]);
        const old = gameWithChunks("0.20.0", { [files[0]]: chunks[0] });
        const cancel = new AbortController();
        routes[`/assets/${chunkAssetName(files[1])}`] = (res) => {
            cancel.abort(new Error("Cancelled"));
            bytes(chunks[1])(res);
        };
        await expect(installSplit([old], cancel.signal)).rejects.toThrow("Cancelled");
        expect(requested).not.toContain(`/assets/${gameZipName("0.21.0")}`);
        expect(existsSync(path.join(dataDir, "game", "0.21.0"))).toBe(false);
        expect(workLeftBehind()).toBe(false);
    });

    test("rejects a game whose caches.json lists a chunk it hasn't got", async () => {
        const missing = [{ name: "slim", chunks: [{ file: "f".repeat(32) + ".bin", size: 1 }] }];
        await publishSplit(["one"], JSON.stringify(missing));
        await expect(installSplit([])).rejects.toThrow();
        expect(existsSync(path.join(dataDir, "game", "0.21.0"))).toBe(false);
    });
});
