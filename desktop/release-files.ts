// Everything a release carries besides the launcher's zip, written to release/:
// game-<version>.zip, game-manifest.json and notes.md, and the same game split in two for
// launchers that can reuse what they have: game-<version>-lite.zip, without the cache's chunks,
// and each chunk as cache-<chunk>. Stops if dist/ isn't ready to ship.
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
    CHUNK_FILE_PATTERN,
    GameManifest,
    ManifestChunk,
    changelogSection,
    chunkName,
    isShipped,
    listFiles,
} from "./gameFiles";
import { MANIFEST_NAME, chunkAssetName, gameZipName, liteZipName } from "./gameUpdate";
import { LAUNCHER_VERSION } from "./version";

const DIST = "dist";
const OUT = "release";

const CHUNK_DIR = path.join(DIST, "caches", "chunks");

// The game can't start without a cache, and caches/ is 227 MB where the slim one's 26. Gives
// back the slim cache's chunks.
function checkDist(): ManifestChunk[] {
    let caches: { slimOf?: string; build?: string; chunks?: ManifestChunk[] }[];
    try {
        caches = JSON.parse(readFileSync(path.join(DIST, "caches", "caches.json"), "utf8"));
    } catch {
        throw new Error("No dist/caches: run bun run build, then bun run slim-cache");
    }
    if (caches.length !== 1 || !caches[0].slimOf || !caches[0].chunks) {
        throw new Error("dist/caches isn't only the slim cache: run bun run slim-cache");
    }
    // The game won't load a cache made for another build
    let build: string | undefined;
    try {
        build = JSON.parse(readFileSync(path.join(DIST, "build.json"), "utf8")).build;
    } catch {
        throw new Error("No dist/build.json: run bun run build, then bun run slim-cache");
    }
    if (caches[0].build !== build) {
        throw new Error("dist/caches was made for another build: run bun run slim-cache");
    }
    const chunks = caches[0].chunks.map(({ file, size }) => ({ file, size }));
    for (const { file, size } of chunks) {
        const data = CHUNK_FILE_PATTERN.test(file)
            ? readFileSync(path.join(CHUNK_DIR, file))
            : undefined;
        if (!data || chunkName(data) !== file || data.byteLength !== size) {
            throw new Error(`dist/caches/chunks/${file} isn't the chunk caches.json lists`);
        }
    }
    return chunks;
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

async function writeZip(files: string[], name: string): Promise<Buffer> {
    const zip = new JSZip();
    // Zip entries always use forward slashes, as listFiles gives them
    for (const entry of files) {
        zip.file(entry, readFileSync(path.join(DIST, entry)));
    }
    const zipBytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    writeFileSync(path.join(OUT, name), zipBytes);
    console.log(`${name}: ${(zipBytes.byteLength / 1e6).toFixed(1)} MB`);
    return zipBytes;
}

async function main(): Promise<void> {
    const { version } = JSON.parse(readFileSync("package.json", "utf8"));
    const chunks = checkDist();
    mkdirSync(OUT, { recursive: true });

    const files = listFiles(DIST).filter(isShipped);
    const zipBytes = await writeZip(files, gameZipName(version));
    const isChunkFile = (file: string) => path.posix.dirname(file) === "caches/chunks";
    const liteBytes = await writeZip(
        files.filter((file) => !isChunkFile(file)),
        liteZipName(version),
    );
    // Chunks from an earlier run here would go up with this release
    for (const entry of readdirSync(OUT)) {
        if (entry.startsWith(chunkAssetName(""))) {
            rmSync(path.join(OUT, entry));
        }
    }
    for (const { file } of chunks) {
        copyFileSync(path.join(CHUNK_DIR, file), path.join(OUT, chunkAssetName(file)));
    }

    const manifest: GameManifest = {
        version,
        sha256: sha256(zipBytes),
        minLauncher: LAUNCHER_VERSION,
        lite: { sha256: sha256(liteBytes), size: liteBytes.byteLength },
        chunks,
    };
    writeFileSync(path.join(OUT, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n");

    const notes = changelogSection(readFileSync("CHANGELOG.md", "utf8"), version);
    writeFileSync(path.join(OUT, "notes.md"), notes + "\n");

    console.log(`${chunks.length} chunks, as ${chunkAssetName("<chunk>")}`);
}

main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
