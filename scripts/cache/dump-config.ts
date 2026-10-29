// Prints the raw bytes of config entries, to work out new opcodes.
//
//   npx tsx scripts/cache/dump-config.ts <archive> <id> [id...]
import { GAME_CACHE_NAME } from "../../src/game/cache";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { IndexType } from "../../src/rs/cache/IndexType";
import { loadCache, loadCacheInfos } from "./load-util";

const [archiveArg, ...idArgs] = process.argv.slice(2);
const cacheInfo = loadCacheInfos().find((c) => c.name === GAME_CACHE_NAME)!;
const loaded = loadCache(cacheInfo);
const configIndex = CacheSystem.fromFiles(loaded.type, loaded.files).getIndex(
    IndexType.DAT2.configs,
);
const archive = configIndex.getArchive(parseInt(archiveArg));
for (const id of idArgs.map((a) => parseInt(a))) {
    const data = archive.getFile(id)?.data;
    if (!data) {
        console.log(id, "missing");
        continue;
    }
    const hex = Array.from(data, (b) => (b & 0xff).toString(16).padStart(2, "0")).join(" ");
    console.log(`${id} (${data.length} bytes): ${hex}`);
}
