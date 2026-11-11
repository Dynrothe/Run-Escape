import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Server, ServerResponse, createServer } from "node:http";
import { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { GameFolder, chunkName, pickGameFolder } from "./gameFiles";
import { SITE_FILES_NAME, SiteFiles } from "./siteFiles";
import {
    checkSite,
    findBuild,
    installSiteBuild,
    readSiteGames,
    removeOldSiteGames,
} from "./siteUpdate";

// A stand-in for the website on localhost. Each test says what it serves.
type Route = (res: ServerResponse) => void;

let server: Server;
let base: string;
let dataDir: string;
let routes: Record<string, Route>;
let requested: string[];

const never = new AbortController().signal;
const BUILD = "0.30.0-19c7e9bd";
const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

const serve = (body: string | Buffer, code = 200): Route => {
    return (res) => {
        res.writeHead(code, { "Content-Length": Buffer.byteLength(body) });
        res.end(body);
    };
};

// Puts a build on the website: its files, game-files.json, and a slim cache of these chunks
function deploy(files: Record<string, string>, chunks: Buffer[] = [], build = BUILD): SiteFiles {
    const list: SiteFiles = {
        build,
        version: build.split("-")[0],
        minLauncher: "1.0.0",
        coopUrl: "",
        runAnalyticsUrl: "",
        cloudSaveUrl: "",
        files: Object.entries({ "build.json": JSON.stringify({ build }), ...files }).map(
            ([file, text]) => {
                routes[`/game/${file}`] = serve(text);
                return { path: file, sha256: sha256(text), size: Buffer.byteLength(text) };
            },
        ),
    };
    routes[`/game/${SITE_FILES_NAME}`] = serve(JSON.stringify(list));
    const listed = chunks.map((data) => {
        routes[`/game/caches/chunks/${chunkName(data)}`] = serve(data);
        return { file: chunkName(data), size: data.byteLength };
    });
    routes["/game/caches/caches.json"] = serve(
        JSON.stringify([{ slimOf: "osrs", build, chunks: listed }]),
    );
    return list;
}

const install = async (reuseFrom: string[] = []) => {
    const site = await checkSite(`${base}/game/`, never);
    return installSiteBuild(site, `${base}/game/`, dataDir, never, () => {}, reuseFrom);
};

beforeAll(async () => {
    server = createServer((req, res) => {
        requested.push(req.url!);
        const route = routes[decodeURIComponent(req.url!.split("?")[0])];
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
    dataDir = mkdtempSync(path.join(tmpdir(), "site-update-"));
});

afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
});

describe("checkSite", () => {
    test("reads the website's build and its chunks", async () => {
        const chunk = Buffer.from("chunk");
        const files = deploy({ "index.html": "<html>" }, [chunk]);
        const site = await checkSite(`${base}/game/`, never);
        expect(site.files).toEqual(files);
        expect(site.chunks).toEqual([{ file: chunkName(chunk), size: 5 }]);
    });

    test("fails on a website without game-files.json, as one from before it", async () => {
        routes["/game/caches/caches.json"] = serve("[]");
        await expect(checkSite(`${base}/game/`, never)).rejects.toThrow(/404/);
    });

    test("fails when the cache was made for another build", async () => {
        deploy({ "index.html": "<html>" });
        routes["/game/caches/caches.json"] = serve(
            JSON.stringify([{ slimOf: "osrs", build: "0.30.0-a6f7bcdc", chunks: [] }]),
        );
        await expect(checkSite(`${base}/game/`, never)).rejects.toThrow(/a6f7bcdc/);
    });

    test("won't follow a redirect", async () => {
        routes[`/game/${SITE_FILES_NAME}`] = (res) => {
            res.writeHead(302, { Location: `${base}/elsewhere/${SITE_FILES_NAME}` });
            res.end();
        };
        await expect(checkSite(`${base}/game/`, never)).rejects.toThrow();
        expect(requested).not.toContain(`/elsewhere/${SITE_FILES_NAME}`);
    });
});

describe("installSiteBuild", () => {
    test("installs the website's build where it can be found again", async () => {
        const chunk = Buffer.from("chunk");
        deploy({ "index.html": "<html>site</html>", "assets/a b.js": "js" }, [chunk]);
        const folder = await install();

        expect(folder).toMatchObject({ version: "0.30.0", fromSite: true });
        expect(readFileSync(path.join(folder.path, "index.html"), "utf8")).toBe(
            "<html>site</html>",
        );
        expect(readFileSync(path.join(folder.path, "assets", "a b.js"), "utf8")).toBe("js");
        const chunkFile = path.join(folder.path, "caches", "chunks", chunkName(chunk));
        expect(readFileSync(chunkFile)).toEqual(chunk);
        expect(await readSiteGames(dataDir)).toEqual([folder]);
        expect(await findBuild([folder], BUILD)).toBe(folder);
        expect(existsSync(path.join(dataDir, "site-update"))).toBe(false);
    });

    test("copies what the game being played has, and downloads the rest", async () => {
        const kept = Buffer.from("kept chunk");
        const changed = Buffer.from("new chunk");
        deploy({ "index.html": "<html>new</html>", "icons/a.png": "same png" }, [kept, changed]);
        const current = path.join(dataDir, "current");
        mkdirSync(path.join(current, "caches", "chunks"), { recursive: true });
        mkdirSync(path.join(current, "static"), { recursive: true });
        // The same bytes under another name count, as a build renames what it hashes
        writeFileSync(path.join(current, "static", "b.png"), "same png");
        writeFileSync(path.join(current, "caches", "chunks", chunkName(kept)), kept);

        const folder = await install([current]);
        expect(readFileSync(path.join(folder.path, "icons", "a.png"), "utf8")).toBe("same png");
        const downloads = requested.filter((url) => !url.endsWith(".json"));
        expect(downloads.sort()).toEqual([
            `/game/caches/chunks/${chunkName(changed)}`,
            "/game/index.html",
        ]);
    });

    test("installs nothing when a file isn't what the list says", async () => {
        deploy({ "index.html": "<html>", "assets/a.js": "js" });
        const site = await checkSite(`${base}/game/`, never);
        routes["/game/assets/a.js"] = serve("tampered");
        await expect(
            installSiteBuild(site, `${base}/game/`, dataDir, never, () => {}),
        ).rejects.toThrow(/downloaded as/);
        expect(await readSiteGames(dataDir)).toEqual([]);
        expect(existsSync(path.join(dataDir, "site-update"))).toBe(false);
    });

    test("installs nothing when a chunk's missing from the website", async () => {
        const chunk = Buffer.from("chunk");
        deploy({ "index.html": "<html>" }, [chunk]);
        delete routes[`/game/caches/chunks/${chunkName(chunk)}`];
        await expect(install()).rejects.toThrow(/404/);
        expect(await readSiteGames(dataDir)).toEqual([]);
    });

    test("stops when cancelled, leaving nothing behind", async () => {
        deploy({ "index.html": "<html>" });
        const site = await checkSite(`${base}/game/`, never);
        const cancel = new AbortController();
        cancel.abort(new Error("Cancelled"));
        await expect(
            installSiteBuild(site, `${base}/game/`, dataDir, cancel.signal, () => {}),
        ).rejects.toThrow();
        expect(await readSiteGames(dataDir)).toEqual([]);
    });
});

describe("findBuild", () => {
    test("finds a release or the bundled game that's the website's build already", async () => {
        const release = path.join(dataDir, "game", "0.30.0");
        mkdirSync(release, { recursive: true });
        writeFileSync(path.join(release, "build.json"), JSON.stringify({ build: BUILD }));
        const folders: GameFolder[] = [
            { version: "0.30.0", path: path.join(dataDir, "nothing") },
            { version: "0.30.0", path: release },
        ];
        expect(await findBuild(folders, BUILD)).toBe(folders[1]);
        expect(await findBuild(folders, "0.30.0-a6f7bcdc")).toBeUndefined();
    });
});

test("removeOldSiteGames keeps only the build being played", async () => {
    deploy({ "index.html": "<html>one</html>" }, [], "0.30.0-aaaaaaaa");
    const old = await install();
    deploy({ "index.html": "<html>two</html>" }, [], "0.30.0-bbbbbbbb");
    const current = await install();
    expect(await readSiteGames(dataDir)).toHaveLength(2);
    // Offline, the newest is the one played: the same version, so the last downloaded wins only
    // by being kept, which removeOldSiteGames sees to
    await removeOldSiteGames(dataDir, current);
    expect(await readSiteGames(dataDir)).toEqual([current]);
    expect(existsSync(old.path)).toBe(false);
    const bundled = { version: "0.30.0", path: "bundled" };
    expect(pickGameFolder(bundled, await readSiteGames(dataDir), "1.0.0")).toEqual(current);
});
