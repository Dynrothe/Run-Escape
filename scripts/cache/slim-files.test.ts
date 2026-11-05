import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { CacheInfo } from "../../src/rs/cache/CacheInfo";
import { getChunkFileName } from "../../src/rs/cache/ChunkedCache";
import { findReusable, hashInputs, pruneChunks, storeRun, writeChunks } from "./slim-files";

let dir: string;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(tmpdir(), "slim-files-"));
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

async function chunks(...texts: string[]) {
    const bytes = texts.map((text) => new TextEncoder().encode(text));
    return { bytes, files: await Promise.all(bytes.map(getChunkFileName)) };
}

const info = (files: string[]): CacheInfo => ({
    name: "slim",
    game: "oldschool",
    environment: "live",
    revision: 241,
    timestamp: "2026-09-30T12:30:05Z",
    size: 0,
    build: "0.26.0-aaaa",
    chunks: files.map((file) => ({ file, size: 1 })),
});

describe("writeChunks", () => {
    test("writes each chunk, and leaves no temporary file", async () => {
        const { bytes, files } = await chunks("one", "two");
        writeChunks(dir, files, bytes);
        expect(fs.readdirSync(dir).sort()).toEqual([...files].sort());
        expect(fs.readFileSync(path.join(dir, files[1]), "utf8")).toBe("two");
    });

    test("replaces a cut-off copy, and leaves a whole one alone", async () => {
        const { bytes, files } = await chunks("one", "two");
        fs.writeFileSync(path.join(dir, files[0]), "on");
        fs.writeFileSync(path.join(dir, files[1]), "two");
        fs.utimesSync(path.join(dir, files[1]), new Date(0), new Date(0));
        writeChunks(dir, files, bytes);
        expect(fs.readFileSync(path.join(dir, files[0]), "utf8")).toBe("one");
        // Not written again
        expect(fs.statSync(path.join(dir, files[1])).mtimeMs).toBe(0);
    });
});

describe("pruneChunks", () => {
    test("drops chunks it's not given and what a stopped run left", async () => {
        const { bytes, files } = await chunks("kept", "stale");
        writeChunks(dir, files, bytes);
        fs.writeFileSync(path.join(dir, `${files[0]}.123.tmp`), "half");
        fs.writeFileSync(path.join(dir, "notes.txt"), "not a chunk");
        pruneChunks(dir, [files[0]]);
        expect(fs.readdirSync(dir).sort()).toEqual([files[0], "notes.txt"].sort());
    });
});

describe("hashInputs", () => {
    test("changes with any file's contents or name, and nothing else", () => {
        fs.mkdirSync(path.join(dir, "src", "deep"), { recursive: true });
        fs.writeFileSync(path.join(dir, "src", "deep", "a.ts"), "a");
        fs.writeFileSync(path.join(dir, "lock"), "1");
        const cwd = process.cwd();
        process.chdir(dir);
        try {
            const hash = () => hashInputs(["src"], ["lock"], "cache-1");
            const first = hash();
            expect(hash()).toBe(first);
            expect(hashInputs(["src"], ["lock"], "cache-2")).not.toBe(first);

            fs.writeFileSync(path.join("src", "deep", "a.ts"), "b");
            const changed = hash();
            expect(changed).not.toBe(first);

            fs.renameSync(path.join("src", "deep", "a.ts"), path.join("src", "deep", "c.ts"));
            expect(hash()).not.toBe(changed);

            fs.writeFileSync("lock", "2");
            const locked = hash();
            fs.writeFileSync(path.join("src", "new.ts"), "");
            expect(hash()).not.toBe(locked);
        } finally {
            process.chdir(cwd);
        }
    });
});

describe("storeRun and findReusable", () => {
    test("reuse what was stored for the same inputs, without its build", async () => {
        const { bytes, files } = await chunks("one", "two");
        storeRun(dir, "inputs-1", info(files), files, bytes);
        const found = await findReusable(dir, "inputs-1");
        expect(found?.chunks?.map((chunk) => chunk.file)).toEqual(files);
        expect(found?.build).toBeUndefined();
        expect(await findReusable(dir, "inputs-2")).toBeUndefined();
    });

    test("won't reuse a run with a chunk missing or damaged", async () => {
        const { bytes, files } = await chunks("one", "two");
        storeRun(dir, "inputs", info(files), files, bytes);
        fs.writeFileSync(path.join(dir, "chunks", files[0]), "damaged");
        expect(await findReusable(dir, "inputs")).toBeUndefined();
        storeRun(dir, "inputs", info(files), files, bytes);
        fs.rmSync(path.join(dir, "chunks", files[1]));
        expect(await findReusable(dir, "inputs")).toBeUndefined();
    });

    test("finds nothing before a run's been stored", async () => {
        expect(await findReusable(dir, "inputs")).toBeUndefined();
    });
});
