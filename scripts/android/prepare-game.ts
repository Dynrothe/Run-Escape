// Android carries the same web build and slim cache as the desktop app.
import JSZip from "jszip";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    CHUNK_FILE_PATTERN,
    chunkName,
    chunkPath,
    isShipped,
    parseManifest,
    zipEntryPath,
} from "../../desktop/gameFiles";
import { MANIFEST_NAME, gameZipName } from "../../desktop/gameUpdate";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_GAME_BYTES = 256 * 1024 * 1024;

// The same checks as desktop/release-files.ts makes of dist/: one slim cache, made for this
// build, with every chunk it lists
async function validateGame(directory: string): Promise<void> {
    if (!(await stat(path.join(directory, "index.html"))).isFile()) {
        throw new Error("The game build has no index.html");
    }
    const caches = JSON.parse(await readFile(path.join(directory, "caches/caches.json"), "utf8"));
    if (!Array.isArray(caches) || caches.length !== 1 || !caches[0].slimOf) {
        throw new Error("Android needs the build's slim cache: run bun run slim-cache first");
    }
    const { build } = JSON.parse(await readFile(path.join(directory, "build.json"), "utf8"));
    if (caches[0].build !== build) {
        throw new Error("The slim cache was made for another build: run bun run slim-cache");
    }
    const chunks: unknown = caches[0].chunks;
    if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error("The slim cache has no chunks");
    }
    for (const { file, size } of chunks) {
        const data = CHUNK_FILE_PATTERN.test(file)
            ? await readFile(chunkPath(directory, file)).catch(() => undefined)
            : undefined;
        if (!data || data.byteLength !== size || chunkName(data) !== file) {
            throw new Error(`caches/chunks/${file} isn't the chunk caches.json lists`);
        }
    }
}

// A release directory has game-manifest.json and its matching game-<version>.zip. A local build
// (dist) already has the files, including dist/caches. staging is where the game's put together
// before it replaces destination: on the same drive, and somewhere nothing packages or commits.
export async function prepareGame(
    source: string,
    destination: string,
    {
        version = "",
        dist = false,
        staging = `${destination}.staging-${randomUUID()}`,
    }: { version?: string; dist?: boolean; staging?: string } = {},
): Promise<void> {
    await mkdir(path.dirname(destination), { recursive: true });
    await mkdir(path.dirname(staging), { recursive: true });
    try {
        if (dist) {
            await validateGame(source);
            await cp(source, staging, { recursive: true, filter: isShipped });
        } else {
            const manifest = parseManifest(
                await readFile(path.join(source, MANIFEST_NAME), "utf8"),
            );
            if (manifest.version !== version) {
                throw new Error("The desktop game's version or checksum manifest does not match");
            }
            const bytes = await readFile(path.join(source, gameZipName(version)));
            if (
                bytes.length > MAX_GAME_BYTES ||
                createHash("sha256").update(bytes).digest("hex") !== manifest.sha256
            ) {
                throw new Error("The desktop game ZIP failed its SHA-256 check");
            }
            const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
            // JSZip tidies names as it reads them, which would hide a "../" from the check
            const entries = Object.values(zip.files).map((entry) => {
                const name = entry.unsafeOriginalName ?? entry.name;
                return { entry, name, file: zipEntryPath(staging, name) };
            });
            let total = 0;
            await mkdir(staging, { recursive: true });
            for (const { entry, name, file } of entries) {
                if (entry.dir || !isShipped(name)) {
                    continue;
                }
                const content = await entry.async("nodebuffer");
                total += content.length;
                if (total > MAX_GAME_BYTES) {
                    throw new Error("The game ZIP expands beyond the Android asset limit");
                }
                await mkdir(path.dirname(file), { recursive: true });
                await writeFile(file, content);
            }
        }
        await validateGame(staging);
        await rm(destination, { recursive: true, force: true });
        await rename(staging, destination);
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const dist = args[0] === "--dist";
    const source = args[dist ? 1 : 0];
    if (!source || args.length !== (dist ? 2 : 1)) {
        console.error(
            "Usage: bun run tsx scripts/android/prepare-game.ts <release directory> | --dist <dist directory>",
        );
        process.exitCode = 1;
    } else {
        const { version } = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
        await prepareGame(
            path.resolve(source),
            path.join(ROOT, "android/app/src/main/assets/game"),
            {
                version,
                dist,
                // In the app's build folder, which Gradle doesn't package and Git ignores
                staging: path.join(ROOT, "android/app/build", `game-staging-${randomUUID()}`),
            },
        );
        console.log(`Android game assets ready (${version})`);
    }
}
