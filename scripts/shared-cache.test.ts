import { execFileSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureSharedCache } from "./shared-cache.cjs";

describe("worktree cache sharing", () => {
    let directory: string;
    let main: string;
    let worktree: string;

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), "shared-cache-"));
        main = join(directory, "main");
        worktree = join(directory, "nested", "worktree");
        mkdirSync(main);
        const git = (args: string[]) => execFileSync("git", args, { cwd: main, stdio: "pipe" });
        git(["init"]);
        git([
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "--allow-empty",
            "-m",
            "Initial",
        ]);
        git(["worktree", "add", "--detach", worktree]);
    });

    afterEach(() => {
        // Remove the link before deleting the fixture, never its shared contents.
        const cache = join(worktree, "caches");
        if (existsSync(cache)) {
            rmSync(cache, { recursive: true });
        }
        rmSync(directory, { recursive: true, force: true });
    });

    it("links a nested worktree to the main cache and can be called again", () => {
        const shared = join(main, "caches");
        mkdirSync(shared);
        writeFileSync(join(shared, "caches.json"), "cache manifest");

        const cache = ensureSharedCache(worktree);

        expect(realpathSync.native(cache)).toBe(realpathSync.native(shared));
        expect(readFileSync(join(cache, "caches.json"), "utf8")).toBe("cache manifest");
        expect(ensureSharedCache(worktree)).toBe(cache);
    });

    it("preserves a worktree's own cache", () => {
        mkdirSync(join(main, "caches"));
        const cache = join(worktree, "caches");
        mkdirSync(cache);
        writeFileSync(join(cache, "local"), "own cache");

        expect(ensureSharedCache(worktree)).toBe(cache);
        expect(realpathSync.native(cache)).not.toBe(realpathSync.native(join(main, "caches")));
        expect(readFileSync(join(cache, "local"), "utf8")).toBe("own cache");
    });

    it("leaves cache setup local when the main repository has no cache", () => {
        expect(ensureSharedCache(worktree)).toBe(join(worktree, "caches"));
        expect(existsSync(join(worktree, "caches"))).toBe(false);
        expect(ensureSharedCache(main)).toBe(join(main, "caches"));
    });

    it("does not require Git for a checkout without Git metadata", () => {
        const checkout = join(directory, "export");
        mkdirSync(checkout);
        expect(ensureSharedCache(checkout)).toBe(join(checkout, "caches"));
        expect(existsSync(join(checkout, "caches"))).toBe(false);
    });
});
