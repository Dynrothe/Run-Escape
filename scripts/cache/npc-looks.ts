// Writes src/game/content/npcLooks.ts from the cache: the enemies' NPCs that bake the same model
// as another's, so GameAssets.mergeRequests bakes them once (a boss's forms that are ids of their
// own, as the Wardens' and Akkha's are). Run it again on a newer cache (see A newer cache in
// docs/DEVELOPMENT.md); with `check` it only says whether the file's up to date.
//
//   bun run tsx scripts/cache/npc-looks.ts
//   bun run tsx scripts/cache/npc-looks.ts check
import fs from "fs";

import { GAME_CACHE_NAME } from "../../src/game/cache";
import { GameAssets } from "../../src/game/client/GameAssets";
import { ENEMIES } from "../../src/game/content/enemies";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { NpcType } from "../../src/rs/config/npctype/NpcType";
import { loadCache, loadCacheInfos } from "./load-util";

const OUT = "src/game/content/npcLooks.ts";

// Everything NpcModelLoader and ActorBakeLoader read off the type to bake it: its models, their
// colours and textures, its scale and lighting, and its own idle and walk (a request's
// NPC_IDLE_SEQ and NPC_WALK_SEQ). One that transforms is left alone: it's what a var makes it.
function getLook(npc: NpcType): string | undefined {
    if (npc.transforms) {
        return undefined;
    }
    return JSON.stringify([
        npc.modelIds,
        npc.recolorFrom ?? null,
        npc.recolorTo ?? null,
        npc.retextureFrom ?? null,
        npc.retextureTo ?? null,
        npc.widthScale,
        npc.heightScale,
        npc.ambient,
        npc.contrast,
        npc.idleSeqId,
        npc.walkSeqId,
    ]);
}

const info = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME);
if (!info) {
    throw new Error(`Cache ${GAME_CACHE_NAME} isn't in caches/`);
}
const loaded = loadCache(info);
const factory = getCacheLoaderFactory(info, CacheSystem.fromFiles(loaded.type, loaded.files));
const npcTypes = factory.getNpcTypeLoader();

// The enemies each NPC bakes for, to name them in the file
const enemiesByNpc = new Map<number, string[]>();
for (const request of GameAssets.getEnemyRequests(ENEMIES)) {
    if (request.kind === "npc") {
        const keys = enemiesByNpc.get(request.npcId) ?? [];
        keys.push(request.key.replace(/^npc:/, ""));
        enemiesByNpc.set(request.npcId, keys);
    }
}

const byLook = new Map<string, number[]>();
for (const npcId of [...enemiesByNpc.keys()].sort((a, b) => a - b)) {
    const look = getLook(npcTypes.load(npcId));
    if (look !== undefined) {
        byLook.set(look, [...(byLook.get(look) ?? []), npcId]);
    }
}

const entries: string[] = [];
for (const ids of byLook.values()) {
    const [first, ...rest] = ids;
    for (const id of rest) {
        const names = (npcId: number) => [...new Set(enemiesByNpc.get(npcId))].join(", ");
        entries.push(`    ${id}: ${first}, // ${names(id)} as ${names(first)}`);
    }
}
entries.sort((a, b) => parseInt(a) - parseInt(b));

const text = [
    "// Generated from the game's cache by scripts/cache/npc-looks.ts: don't edit by hand.",
    "//",
    "// The enemies' NPCs that bake the same model as another's (the same models, colours, textures,",
    "// scale, lighting, idle and walk), each to the lowest id that looks the same, so",
    "// GameAssets.mergeRequests bakes them once: a boss's forms that are ids of their own.",
    "export const SAME_NPC_LOOK: Readonly<Record<number, number>> = {",
    ...entries,
    "};",
    "",
].join("\n");

if (process.argv[2] === "check") {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== text) {
        console.log(`${OUT} is out of date: run bun run tsx scripts/cache/npc-looks.ts`);
        process.exit(1);
    }
    console.log(`NPC looks are up to date (${entries.length} merged)`);
} else {
    fs.writeFileSync(OUT, text);
    console.log(`Wrote ${OUT}: ${entries.length} NPCs bake as another's`);
}
