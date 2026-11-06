// slim-cache.ts's files: writing chunks so a stopped run can't leave a broken
// one, and keeping a checked run to reuse while nothing it read has changed
import { build } from "esbuild";
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
        renameWithRetry(temporary, target);
    });
}

const RENAME_ATTEMPTS = 10;
const pause = new Int32Array(new SharedArrayBuffer(4));

// Windows refuses a rename for a moment while a virus scanner or the indexer
// has the new file open, so a refused one is tried again, for a few seconds
export function renameWithRetry(from: string, to: string, rename = fs.renameSync): void {
    for (let attempt = 1; ; attempt++) {
        try {
            rename(from, to);
            return;
        } catch (e) {
            const code = (e as NodeJS.ErrnoException).code ?? "";
            if (attempt === RENAME_ATTEMPTS || !["EPERM", "EACCES", "EBUSY"].includes(code)) {
                throw e;
            }
            Atomics.wait(pause, 0, 0, 100 * attempt);
        }
    }
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

// Trace runtime imports without executing the loaders or writing a bundle.
// The lockfile covers external packages; release metadata doesn't decide which assets they read.
export async function hashInputs(
    entryPoints: string[],
    files: string[],
    salt: string,
): Promise<string> {
    const result = await build({
        absWorkingDir: process.cwd(),
        entryPoints,
        bundle: true,
        write: false,
        metafile: true,
        platform: "node",
        format: "esm",
        packages: "external",
        treeShaking: false,
        outdir: "slim-inputs",
        logLevel: "silent",
    });
    if (result.warnings.length > 0) {
        throw new Error(
            `Couldn't trace asset inputs reliably: ${result.warnings.map((warning) => warning.text).join("; ")}`,
        );
    }
    const manifest: Record<string, unknown> = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const packageInputs = Object.fromEntries(
        [
            "type",
            "imports",
            "exports",
            "packageManager",
            "engines",
            "dependencies",
            "devDependencies",
            "optionalDependencies",
            "peerDependencies",
            "overrides",
            "resolutions",
        ].map((key) => [key, manifest[key]]),
    );
    const relative = (file: string) =>
        path.relative(process.cwd(), path.resolve(file)).split(path.sep).join("/");
    // esbuild keeps URL suffixes in its input names, but they're not part of the file on disk.
    const all = new Set(
        [...files, ...Object.keys(result.metafile.inputs).map((file) => file.split(/[?#]/)[0])].map(
            relative,
        ),
    );
    const hash = createHash("sha256").update(JSON.stringify({ salt, packageInputs }));
    for (const file of [...all].sort()) {
        hash.update(file).update("\0").update(fs.readFileSync(file)).update("\0");
    }
    // Also capture transforms from inherited/nested tsconfigs, which aren't metafile inputs.
    for (const output of result.outputFiles.sort((a, b) => a.path.localeCompare(b.path))) {
        hash.update(relative(output.path)).update("\0").update(output.contents).update("\0");
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
