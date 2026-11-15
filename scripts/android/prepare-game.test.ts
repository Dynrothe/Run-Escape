import JSZip from "jszip";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { chunkName } from "../../desktop/gameFiles";
import { prepareGame } from "./prepare-game";

const temporary: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

const CHUNK = Buffer.from("game data");
const CHUNK_FILE = chunkName(CHUNK);

// A slim cache as bun run slim-cache leaves it: chunks named after their contents, listed in
// caches.json with the build they were made for
function slimCache(extra: Record<string, unknown> = {}) {
    return JSON.stringify([
        {
            name: "osrs-1-slim-abc",
            slimOf: "osrs-1",
            build: "build-1",
            chunks: [{ file: CHUNK_FILE, size: CHUNK.byteLength }],
            ...extra,
        },
    ]);
}

async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), "run-escape-android-"));
    temporary.push(root);
    const source = path.join(root, "release");
    const destination = path.join(root, "assets/game");
    await mkdir(source);
    const zip = new JSZip();
    zip.file("index.html", "<script src='./assets/game.js'></script>");
    zip.file("assets/game.js", "window.build='same-as-desktop'");
    zip.file("assets/game.js.map", "source map");
    zip.file("build.json", JSON.stringify({ build: "build-1" }));
    zip.file("caches/caches.json", slimCache());
    zip.file(`caches/chunks/${CHUNK_FILE}`, CHUNK);
    async function save() {
        const bytes = await zip.generateAsync({ type: "nodebuffer" });
        await writeFile(path.join(source, "game-1.2.3.zip"), bytes);
        await writeFile(
            path.join(source, "game-manifest.json"),
            JSON.stringify({
                version: "1.2.3",
                sha256: createHash("sha256").update(bytes).digest("hex"),
                minLauncher: "0.1.0",
            }),
        );
    }
    await save();
    return { root, source, destination, zip, save };
}

describe("Android game staging", () => {
    it("uses the verified desktop build and ships its cache for offline play", async () => {
        const { source, destination } = await fixture();
        await prepareGame(source, destination, { version: "1.2.3" });
        expect(await readFile(path.join(destination, "assets/game.js"), "utf8")).toBe(
            "window.build='same-as-desktop'",
        );
        expect(await readFile(path.join(destination, "caches/chunks", CHUNK_FILE), "utf8")).toBe(
            "game data",
        );
        await expect(readFile(path.join(destination, "assets/game.js.map"))).rejects.toThrow();
    });

    it("leaves a staged game intact when a release checksum or version is wrong", async () => {
        const { source, destination } = await fixture();
        await prepareGame(source, destination, { version: "1.2.3" });
        await writeFile(path.join(source, "game-1.2.3.zip"), "broken ZIP");
        await expect(prepareGame(source, destination, { version: "1.2.3" })).rejects.toThrow(
            "SHA-256",
        );
        await expect(prepareGame(source, destination, { version: "9.9.9" })).rejects.toThrow(
            "does not match",
        );
        expect(await readFile(path.join(destination, "index.html"), "utf8")).toContain("game.js");
    });

    it("rejects a full cache, another build's cache and a missing or wrong chunk", async () => {
        const f = await fixture();
        const refused = async (message: string) => {
            await f.save();
            await expect(
                prepareGame(f.source, f.destination, { version: "1.2.3" }),
            ).rejects.toThrow(message);
        };
        f.zip.file("caches/caches.json", JSON.stringify([{ name: "osrs-1" }]));
        await refused("slim cache");
        f.zip.file("caches/caches.json", slimCache({ build: "build-0" }));
        await refused("another build");
        f.zip.file("caches/caches.json", slimCache());
        f.zip.file(`caches/chunks/${CHUNK_FILE}`, "other data");
        await refused(CHUNK_FILE);
        f.zip.remove(`caches/chunks/${CHUNK_FILE}`);
        await refused(CHUNK_FILE);
    });

    it("rejects a ZIP path that escapes the bundled game", async () => {
        const f = await fixture();
        f.zip.file("../outside.txt", "outside");
        await f.save();
        await expect(prepareGame(f.source, f.destination, { version: "1.2.3" })).rejects.toThrow(
            "Unsafe path",
        );
        await expect(readFile(path.join(f.root, "outside.txt"))).rejects.toThrow();
    });

    it("also stages a local build, with the same slim cache requirement", async () => {
        const f = await fixture();
        await prepareGame(f.source, f.destination, { version: "1.2.3" });
        const destination = path.join(f.root, "local/game");
        await prepareGame(f.destination, destination, { dist: true });
        expect(await readFile(path.join(destination, "assets/game.js"), "utf8")).toContain(
            "same-as-desktop",
        );
    });

    it("leaves nothing in its staging folder, even when it fails", async () => {
        const f = await fixture();
        const build = path.join(f.root, "build");
        await prepareGame(f.source, f.destination, {
            version: "1.2.3",
            staging: path.join(build, "staging-1"),
        });
        await expect(
            prepareGame(f.source, f.destination, {
                version: "9.9.9",
                staging: path.join(build, "staging-2"),
            }),
        ).rejects.toThrow();
        expect(await readdir(build)).toEqual([]);
        expect(await readdir(path.dirname(f.destination))).toEqual(["game"]);
    });
});
