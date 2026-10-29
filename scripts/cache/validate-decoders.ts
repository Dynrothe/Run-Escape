// Decodes every config type the game uses and checks that each decoder consumed
// its whole buffer. A new cache revision that adds opcodes shows up here as
// "not implemented" or "leftover bytes" instead of silently desynced types.
//
//   npx tsx scripts/cache/validate-decoders.ts
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { ConfigType } from "../../src/rs/cache/ConfigType";
import { IndexType } from "../../src/rs/cache/IndexType";
import { Type } from "../../src/rs/config/Type";
import { TypeConstructor } from "../../src/rs/config/TypeLoader";
import { IdkType } from "../../src/rs/config/idktype/IdkType";
import { LocType } from "../../src/rs/config/loctype/LocType";
import { NpcType } from "../../src/rs/config/npctype/NpcType";
import { ObjType } from "../../src/rs/config/objtype/ObjType";
import { SeqType } from "../../src/rs/config/seqtype/SeqType";
import { SpotAnimType } from "../../src/rs/config/spotanimtype/SpotAnimType";
import { loadCache, loadCacheInfos } from "./load-util";

const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME);
if (!cacheInfo) {
    throw new Error(`Cache ${GAME_CACHE_NAME} not found in caches/caches.json`);
}
const loaded = loadCache(cacheInfo);
const cacheSystem = CacheSystem.fromFiles(loaded.type, loaded.files);
const configIndex = cacheSystem.getIndex(IndexType.DAT2.configs);

const checks: [string, number, TypeConstructor<Type>][] = [
    ["npc", ConfigType.DAT2.npcs, NpcType],
    ["obj", ConfigType.DAT2.objs, ObjType],
    ["seq", ConfigType.DAT2.seqs, SeqType],
    ["loc", ConfigType.DAT2.locs, LocType],
    ["idk", ConfigType.DAT2.identkits, IdkType],
    ["spotanim", ConfigType.DAT2.spotAnims, SpotAnimType],
];

let failures = 0;
for (const [name, archiveId, typeConstructor] of checks) {
    const archive = configIndex.getArchive(archiveId);
    const errors = new Map<string, number[]>();
    for (const id of archive.fileIds) {
        const buffer = archive.getFile(id)?.getDataAsBuffer();
        if (!buffer) {
            continue;
        }
        let error: string | undefined;
        try {
            new typeConstructor(id, cacheInfo).decode(buffer);
            if (buffer.offset !== buffer.length) {
                error = "leftover bytes";
            }
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
        if (error) {
            const ids = errors.get(error) ?? [];
            ids.push(id);
            errors.set(error, ids);
        }
    }
    const failed = [...errors.values()].reduce((sum, ids) => sum + ids.length, 0);
    failures += failed;
    console.log(`${name}: ${archive.fileIds.length} types, ${failed} failed`);
    for (const [error, ids] of errors) {
        console.log(`  ${error}: ${ids.length} (e.g. ${ids.slice(0, 8).join(", ")})`);
    }
}

if (failures > 0) {
    process.exitCode = 1;
}
