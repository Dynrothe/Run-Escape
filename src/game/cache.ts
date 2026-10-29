import { CacheInfo } from "../rs/cache/CacheInfo";

// The game only runs on this cache: content ids (npcs, seqs, objs, spotanims)
// and the decoder fixes were checked against it. Download it into caches/ with
// npm run download-caches (or copy it in) before starting. The README's Cache
// version section says which it is; change it there too (a test checks).
export const GAME_CACHE_NAME = "osrs-241_2026-09-30";

// The full cache when it's listed (development), or else its slim copy (a
// hosted build, see scripts/cache/slim-cache.ts)
export function findGameCache(caches: CacheInfo[]): CacheInfo | undefined {
    return (
        caches.find((cache) => cache.name === GAME_CACHE_NAME) ??
        caches.find((cache) => cache.slimOf === GAME_CACHE_NAME)
    );
}

// The browser keeps a copy of each cache it loads, under the cache's name, and
// every slim cache has a new name. Drops the copies other than the one in use.
export async function deleteOtherGameCaches(inUse: string): Promise<void> {
    for (const name of await caches.keys()) {
        if (name !== inUse && name.startsWith(GAME_CACHE_NAME)) {
            await caches.delete(name);
        }
    }
}
