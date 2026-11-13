import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

import { GAME_CACHE_NAME } from "../cache";

// Against the real cache, when there's one: a stale table would bake one form's look for another.
// In a script, because the cache's loaders don't load under vitest.
describe.skipIf(!existsSync(`caches/${GAME_CACHE_NAME}`))("NPCs that look the same", () => {
    it("are what the cache says", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "scripts/cache/npc-looks.ts", "check"],
            { encoding: "utf8", timeout: 60000 },
        );
        expect(stdout).toContain("NPC looks are up to date");
    }, 70000);
});
