import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Plugin } from "vite";

import config, { getBuildId } from "../vite.config";

// The game refuses a slim cache made for another build, by comparing caches.json's build (from
// build.json) with __BUILD_ID__, so the two have to be the same
test("build.json has the build the game is built with", () => {
    const plugin = (config.plugins as Plugin[]).find((p) => p?.name === "build-id-file")!;
    const emitted: { fileName?: string; source?: unknown }[] = [];
    const generateBundle = plugin.generateBundle as (this: unknown) => void;
    generateBundle.call({ emitFile: (file: (typeof emitted)[0]) => emitted.push(file) });

    expect(emitted.map((file) => file.fileName)).toEqual(["build.json"]);
    const { build } = JSON.parse(String(emitted[0].source));
    expect(build).toBe(JSON.parse(String(config.define!.__BUILD_ID__)));
    expect(build).toMatch(/^\d+\.\d+\.\d+-/);
});

// Co-op only puts players on the same build in a room, and the slim cache is made for one. Each
// test runs git a few times, which is slow on a busy machine.
describe("getBuildId", { timeout: 30_000 }, () => {
    const folders: string[] = [];
    const gitIn =
        (dir: string) =>
        (...args: string[]) =>
            execFileSync("git", ["-C", dir, ...args], { stdio: ["ignore", "pipe", "ignore"] });

    // Two checkouts of the same commit
    function twoCheckouts(): [string, string] {
        const origin = mkdtempSync(path.join(tmpdir(), "build-id-"));
        folders.push(origin);
        const git = gitIn(origin);
        git("init", "-q");
        git("config", "core.autocrlf", "false");
        writeFileSync(path.join(origin, "game.ts"), "export const speed = 1;\n");
        git("add", "game.ts");
        git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "first");
        const copy = origin + "-copy";
        folders.push(copy);
        execFileSync("git", ["clone", "-q", "-c", "core.autocrlf=false", origin, copy], {
            stdio: "ignore",
        });
        return [origin, copy];
    }

    afterAll(() => folders.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

    test("is the version and commit when nothing's changed", () => {
        const [dir] = twoCheckouts();
        const commit = gitIn(dir)("rev-parse", "--short=8", "HEAD").toString().trim();
        expect(getBuildId("1.2.3", gitIn(dir))).toBe(`1.2.3-${commit}`);
    });

    test("is the same for the same uncommitted changes, and not for different ones", () => {
        const [a, b] = twoCheckouts();
        const clean = getBuildId("1.2.3", gitIn(a));
        writeFileSync(path.join(a, "game.ts"), "export const speed = 2;\n");
        writeFileSync(path.join(b, "game.ts"), "export const speed = 2;\n");
        const changed = getBuildId("1.2.3", gitIn(a));
        expect(changed).toMatch(new RegExp(`^${clean}-dirty-[0-9a-f]{8}$`));
        expect(getBuildId("1.2.3", gitIn(b))).toBe(changed);
        // Asked again, as a restarted dev server would
        expect(getBuildId("1.2.3", gitIn(a))).toBe(changed);

        writeFileSync(path.join(b, "game.ts"), "export const speed = 3;\n");
        expect(getBuildId("1.2.3", gitIn(b))).not.toBe(changed);
    });

    test("fits what the co-op relay and run stats keep of it", () => {
        const [dir] = twoCheckouts();
        writeFileSync(path.join(dir, "game.ts"), "changed\n");
        const id = getBuildId("10.20.30", gitIn(dir));
        expect(id.length).toBeLessThanOrEqual(64);
        expect(id).toMatch(/^[a-zA-Z0-9._-]{1,80}$/);
    });

    test("falls back to the time without git", () => {
        const id = getBuildId("1.2.3", () => {
            throw new Error("not a git repository");
        });
        expect(id).toMatch(/^1\.2\.3-[0-9a-z]+$/);
    });
});
