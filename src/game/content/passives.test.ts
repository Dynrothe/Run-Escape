import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

import { GAME_CACHE_NAME } from "../cache";

// Against the real cache, when there's one. In a script, because the cache's
// loaders don't load under vitest.
describe.skipIf(!existsSync(`caches/${GAME_CACHE_NAME}`))("passive icons", () => {
    // With every other sprite the game shows (GameAssets' getGameSpriteIds)
    it("are sprites the cache has", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            ["--import", "tsx", "scripts/cache/sprites.ts", "check"],
            { encoding: "utf8", timeout: 60000 },
        );
        expect(stdout).toContain(
            "Every sprite the game shows is in the cache, overhead prayers too",
        );
    }, 70000);
});
