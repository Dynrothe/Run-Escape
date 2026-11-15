import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { CacheInfo } from "../../src/rs/cache/CacheInfo";
import { getChunkFileName } from "../../src/rs/cache/ChunkedCache";
import {
    findReusable,
    hashInputSets,
    hashInputs,
    pruneChunks,
    renameWithRetry,
    storeRun,
    writeChunks,
} from "./slim-files";

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

describe("renameWithRetry", () => {
    const failing = (codes: string[]) => {
        const calls: string[] = [];
        const rename = (from: fs.PathLike) => {
            calls.push(String(from));
            const code = codes.shift();
            if (code) {
                throw Object.assign(new Error(code), { code });
            }
        };
        return { calls, rename };
    };

    test("tries again while Windows holds the file", () => {
        const { calls, rename } = failing(["EPERM", "EBUSY"]);
        renameWithRetry("a.tmp", "a", rename);
        expect(calls).toHaveLength(3);
    });

    test("gives up straight away on any other error", () => {
        const { calls, rename } = failing(["ENOENT"]);
        expect(() => renameWithRetry("a.tmp", "a", rename)).toThrow("ENOENT");
        expect(calls).toHaveLength(1);
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
    const entries = ["src/entry.ts", "scripts/worker.ts", "scripts/boot.mjs"];
    const files = ["bun.lock", "tsconfig.json", "cache.json"];
    const hash = () => hashInputs(entries, files, "cache-1");
    const write = (file: string, text: string) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
    };
    const packageJson = (changes: Record<string, unknown> = {}) =>
        JSON.stringify({
            name: "game",
            version: "1",
            type: "module",
            dependencies: { pako: "1" },
            ...changes,
        });
    async function project(run: () => Promise<void>) {
        const cwd = process.cwd();
        process.chdir(dir);
        try {
            write("package.json", packageJson());
            write("bun.lock", "dependency resolutions");
            write("tsconfig.json", '{"compilerOptions":{"target":"ES2022"}}');
            write("cache.json", '{"name":"cache-1"}');
            write(
                "src/entry.ts",
                `export { asset } from "./assets";
                 export { default as data } from "./data.json?url";
                 export type { Shape } from "./types";
                 export const lazy = () => import("./lazy");
                 throw new Error("Tracing must not execute this module");`,
            );
            write("src/assets.ts", 'export { asset } from "./model";');
            write("src/model.ts", "export const asset = 2570;");
            write("src/data.json", '{"asset":2570}');
            write("src/lazy.ts", "export const sound = 1;");
            write("src/types.ts", "export type Shape = number;");
            write("scripts/worker.ts", 'import "pako"; export const worker = 1;');
            write(
                "scripts/boot.mjs",
                'import { workerData } from "node:worker_threads"; await import(workerData.entry);',
            );
            await run();
        } finally {
            process.chdir(cwd);
        }
    }

    test("is repeatable without executing modules or writing build output", async () => {
        await project(async () => {
            const first = await hash();
            expect(await hash()).toBe(first);
            expect(await hashInputs(entries, files, "cache-2")).not.toBe(first);
            expect(fs.existsSync("slim-inputs")).toBe(false);
        });
    });

    test("doesn't depend on the checkout's absolute path", async () => {
        await project(async () => {
            const first = await hash();
            const copy = fs.mkdtempSync(path.join(tmpdir(), "slim-files-copy-"));
            try {
                fs.cpSync(dir, copy, { recursive: true });
                process.chdir(copy);
                expect(await hash()).toBe(first);
            } finally {
                process.chdir(dir);
                fs.rmSync(copy, { recursive: true, force: true });
            }
        });
    });

    test.each([
        ["src/model.ts", "export const asset = 2571;"],
        ["src/lazy.ts", "export const sound = 2;"],
        ["src/data.json", '{"asset":2571}'],
        ["scripts/worker.ts", 'import "pako"; export const worker = 2;'],
        ["scripts/boot.mjs", 'import "./worker";'],
        ["bun.lock", "different dependency resolutions"],
        ["tsconfig.json", '{"compilerOptions":{"target":"ES2020"}}'],
        ["cache.json", '{"name":"cache-2"}'],
    ])("invalidates when runtime input %s changes", async (file, text) => {
        await project(async () => {
            const first = await hash();
            write(file, text);
            expect(await hash()).not.toBe(first);
        });
    });

    test("hashes several sets of entry points from one trace, each as on its own", async () => {
        await project(async () => {
            const sets = [["src/entry.ts"], ["scripts/worker.ts", "scripts/boot.mjs"], entries];
            const each = async () => Promise.all(sets.map((set) => hashInputs(set, files, "s")));
            const first = await hashInputSets(sets, files, "s");
            expect(first).toEqual(await each());
            expect(new Set(first).size).toBe(3);
            // Only the sets that run it change with it
            write("src/model.ts", "export const asset = 2571;");
            const changed = await hashInputSets(sets, files, "s");
            expect(changed[0]).not.toBe(first[0]);
            expect(changed[1]).toBe(first[1]);
            expect(changed[2]).not.toBe(first[2]);
        });
    });

    test("follows added imports and their dependencies", async () => {
        await project(async () => {
            const first = await hash();
            write("src/new.ts", "export const asset = 1;");
            expect(await hash()).toBe(first);
            write("src/assets.ts", 'export { asset } from "./new";');
            const added = await hash();
            expect(added).not.toBe(first);
            write("src/new.ts", "export const asset = 2;");
            expect(await hash()).not.toBe(added);
        });
    });

    test.each([
        "src/ui.tsx",
        "src/game.css",
        "src/model.test.ts",
        "src/types.ts",
        "scripts/find-items.ts",
        "README.md",
    ])("ignores unrelated or type-only file %s", async (file) => {
        await project(async () => {
            const first = await hash();
            write(file, "unrelated");
            expect(await hash()).toBe(first);
        });
    });

    test("ignores package release metadata but retains dependency and runtime settings", async () => {
        await project(async () => {
            const first = await hash();
            write(
                "package.json",
                packageJson({
                    version: "2",
                    description: "A new release",
                    author: "Contributor",
                    scripts: { build: "vite build" },
                }),
            );
            expect(await hash()).toBe(first);
            write("package.json", packageJson({ dependencies: { pako: "2" } }));
            expect(await hash()).not.toBe(first);
            write("package.json", packageJson({ packageManager: "bun@1.3.14" }));
            expect(await hash()).not.toBe(first);
            write("package.json", packageJson({ type: "commonjs" }));
            expect(await hash()).not.toBe(first);
        });
    });

    test("still hashes package metadata if the asset code actually imports it", async () => {
        await project(async () => {
            write(
                "src/assets.ts",
                'import pkg from "../package.json"; export const asset = pkg.version;',
            );
            const first = await hash();
            write("package.json", packageJson({ version: "2" }));
            expect(await hash()).not.toBe(first);
        });
    });

    test("captures transforms from inherited TypeScript configuration", async () => {
        await project(async () => {
            write("tsconfig.json", '{"extends":"./base.json"}');
            write("base.json", '{"compilerOptions":{"useDefineForClassFields":true}}');
            write("src/model.ts", "class Model { value = 1; } export const asset = new Model();");
            const first = await hash();
            write("base.json", '{"compilerOptions":{"useDefineForClassFields":false}}');
            expect(await hash()).not.toBe(first);
        });
    });

    test("follows TypeScript path aliases", async () => {
        await project(async () => {
            write("tsconfig.json", '{"compilerOptions":{"paths":{"@assets":["./src/model.ts"]}}}');
            write("src/assets.ts", 'export { asset } from "@assets";');
            const first = await hash();
            write("src/model.ts", "export const asset = 2571;");
            expect(await hash()).not.toBe(first);
        });
    });

    test("rejects incomplete configuration even if esbuild can continue with a warning", async () => {
        await project(async () => {
            write("tsconfig.json", '{"extends":"./missing.json"}');
            await expect(hash()).rejects.toThrow("Couldn't trace asset inputs reliably");
        });
    });

    test.each(["src/model.ts", "bun.lock", "package.json"])(
        "rejects missing required input %s instead of returning a reusable fingerprint",
        async (file) => {
            await project(async () => {
                fs.rmSync(file);
                await expect(hash()).rejects.toThrow();
            });
        },
    );

    test("a checked run survives a release bump, but not an asset change", async () => {
        await project(async () => {
            const { bytes, files } = await chunks("asset data");
            storeRun("checked", await hash(), info(files), files, bytes);
            write("package.json", packageJson({ version: "2" }));
            expect(await findReusable("checked", await hash())).toMatchObject({
                name: "slim",
            });
            write("src/model.ts", "export const asset = 2571;");
            expect(await findReusable("checked", await hash())).toBeUndefined();
        });
    });

    test("traces the shipped pipeline, including workers, loaders and content, not the UI", async () => {
        const read = vi.spyOn(fs, "readFileSync");
        try {
            const fingerprint = await hashInputs(
                [
                    "scripts/cache/slim-cache.ts",
                    "scripts/cache/slim-cache-worker.ts",
                    "scripts/cache/slim-cache-boot.mjs",
                ],
                ["bun.lock", "tsconfig.json"],
                "cache-1",
            );
            expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
            const inputs = read.mock.calls.map(([file]) => String(file));
            expect(inputs).toEqual(
                expect.arrayContaining([
                    "scripts/cache/slim-load.ts",
                    "scripts/cache/slim-cache-worker.ts",
                    "scripts/cache/slim-cache-boot.mjs",
                    "src/game/client/GameAssets.ts",
                    "src/game/client/GameSounds.ts",
                    "src/game/content/items.ts",
                    "src/rs/scene/SceneBuilder.ts",
                    "src/rs/cache/ChunkedCache.ts",
                ]),
            );
            expect(inputs).not.toContain("src/game/ui/GameUi.tsx");
            expect(inputs).not.toContain("src/game/ui/GameUi.css");
            expect(inputs).not.toContain("src/game/client/GameClient.test.ts");
            expect(inputs).not.toContain("scripts/cache/find-objs.ts");
        } finally {
            read.mockRestore();
        }
    }, 30000);
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
