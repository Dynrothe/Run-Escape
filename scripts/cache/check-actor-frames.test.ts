import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

import { GAME_CACHE_NAME } from "../../src/game/cache";

// Against the real cache, when there's one: the heroes and a few enemies, a big one and one whose
// animations fade faces in and out among them, draw just as their frames would baked whole. In
// a script, because the cache's loaders don't load under vitest. The whole game's actors take a
// few minutes: run the script without a pattern for those.
describe.skipIf(!existsSync(`caches/${GAME_CACHE_NAME}`))("actor frames that share a mesh", () => {
    it("draw what a fully posed model would", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            [
                "--import",
                "tsx",
                "scripts/cache/check-actor-frames.ts",
                "^hero:|^npc:goblin$|^npc:tumeken_warden_magic$|^npc:sol_heredit$",
            ],
            { encoding: "utf8", timeout: 170000 },
        );
        expect(stdout).toMatch(/ [1-9]\d* sharing a mesh, 0 drawn differently/);
    }, 180000);
});
