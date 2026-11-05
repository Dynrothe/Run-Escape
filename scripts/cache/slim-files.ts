// slim-cache.ts's files: writing chunks so a stopped run can't leave a broken
// one, and keeping a checked run to reuse while nothing it read has changed
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CacheInfo } from "../../src/rs/cache/CacheInfo";
import { CHUNK_DIR, CHUNK_FILE_PATTERN, isChunk } from "../../src/rs/cache/ChunkedCache";

// Writes each chunk under a temporary name and renames it into place, so a run
// that stops partway never leaves a cut-off file under a chunk's name. One
// that's there already with the same bytes is left alone.
export function writeChunks(dir: string, files: string[], chunks: Uint8Array[]): void {
    fs.mkdirSync(dir, { recursive: true });
    files.forEach((file, i) => {
        const target = path.join(dir, file);
        if (fs.existsSync(target) && Buffer.compare(fs.readFileSync(target), chunks[i]) === 0) {
            return;
        }
        const temporary = `${target}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, chunks[i]);
        fs.renameSync(temporary, target);
    });
}

// Leaves only these chunks in dir, and none of what a stopped run left
export function pruneChunks(dir: string, files: string[]): void {
    for (const entry of fs.readdirSync(dir)) {
        const stale = CHUNK_FILE_PATTERN.test(entry) && !files.includes(entry);
        if (stale || entry.endsWith(".tmp")) {
            fs.rmSync(path.join(dir, entry));
        }
    }
}

// A hash of every file in these folders and these files, by path and contents
export function hashInputs(dirs: string[], files: string[], salt: string): string {
    const all = [...files];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.posix.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(file);
            } else {
                all.push(file);
            }
        }
    };
    dirs.forEach(walk);
    const hash = createHash("sha256").update(salt);
    for (const file of all.sort()) {
        hash.update(file).update("\0").update(fs.readFileSync(file)).update("\0");
    }
    return hash.digest("hex");
}

type Stored = { inputs: string; info: CacheInfo };

const storeFile = (storeDir: string) => path.join(storeDir, "slim.json");

// The run kept in storeDir, if it was made from these inputs and its chunks are
// all there as they should be
export async function findReusable(
    storeDir: string,
    inputs: string,
): Promise<CacheInfo | undefined> {
    let stored: Stored;
    try {
        stored = JSON.parse(fs.readFileSync(storeFile(storeDir), "utf8"));
    } catch {
        return undefined;
    }
    if (stored.inputs !== inputs || !stored.info?.chunks) {
        return undefined;
    }
    for (const { file } of stored.info.chunks) {
        const chunk = path.join(storeDir, CHUNK_DIR, file);
        const data = fs.existsSync(chunk) ? new Uint8Array(fs.readFileSync(chunk)) : undefined;
        if (!data || !(await isChunk(file, data))) {
            return undefined;
        }
    }
    return stored.info;
}

// Keeps a checked run in storeDir, for the next one to reuse. Not its build: a
// reuse is for the build that runs it.
export function storeRun(
    storeDir: string,
    inputs: string,
    info: CacheInfo,
    files: string[],
    chunks: Uint8Array[],
): void {
    const chunkDir = path.join(storeDir, CHUNK_DIR);
    writeChunks(chunkDir, files, chunks);
    pruneChunks(chunkDir, files);
    const { build: _build, ...withoutBuild } = info;
    const stored: Stored = { inputs, info: withoutBuild };
    fs.writeFileSync(storeFile(storeDir), JSON.stringify(stored), "utf8");
}
