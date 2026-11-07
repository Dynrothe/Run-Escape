import { CacheInfo } from "../rs/cache/CacheInfo";

// The game only runs on this cache: content ids (npcs, seqs, objs, spotanims)
// and the decoder fixes were checked against it. Download it into caches/ with
// bun run download-caches (or copy it in) before starting. The README's Cache
// version section says which it is; change it there too (a test checks).
export const GAME_CACHE_NAME = "osrs-242_2026-11-03";

// The full cache when it's listed (development), or else its slim copy (a
// hosted build, see scripts/cache/slim-cache.ts)
export function findGameCache(caches: CacheInfo[]): CacheInfo | undefined {
    return (
        caches.find((cache) => cache.name === GAME_CACHE_NAME) ??
        caches.find((cache) => cache.slimOf === GAME_CACHE_NAME)
    );
}

// The browser keeps a copy of each cache it loads. A full cache is kept under
// its own name, and slim caches used to be too, each with a new name (a slim
// cache's chunks now share one, which keeps itself tidy). Drops the copies
// other than the one in use, from this cache or an older one: a full cache the
// game ran on before is osrs-<revision>_<date>.
export async function deleteOtherGameCaches(inUse: string): Promise<void> {
    for (const name of await caches.keys()) {
        const isGameCache =
            name.startsWith(GAME_CACHE_NAME) ||
            /^osrs-\d+_\d{4}-\d{2}-\d{2}$/.test(name) ||
            /^osrs-.*-slim-[0-9a-f]+$/.test(name);
        if (name !== inUse && isGameCache) {
            await caches.delete(name);
        }
    }
}

// A slim cache is made for one build (slim-cache reads dist/build.json), as
// that's what knows which groups it reads. Another build's cache stops
// partway through loading, on a group it hasn't got. Undefined when they match.
export function getCacheMismatch(info: CacheInfo, build: string): string | undefined {
    if (info.build === undefined || info.build === build) {
        return undefined;
    }
    return (
        `The game (build ${build}) and its cache (made for build ${info.build}) are from ` +
        "different versions. If reloading the page doesn't fix it, the site needs " +
        "bun run slim-cache run again after bun run build."
    );
}

const RELOAD_KEY = "run-escape-cache-reload";

// Whether to reload the page for this mismatch: once, as the page may be an old
// copy and its cache new. Again for the same one would only go round in circles.
export function shouldReloadForCache(mismatch: string | undefined): boolean {
    try {
        if (mismatch === undefined) {
            sessionStorage.removeItem(RELOAD_KEY);
            return false;
        }
        if (sessionStorage.getItem(RELOAD_KEY) === mismatch) {
            return false;
        }
        sessionStorage.setItem(RELOAD_KEY, mismatch);
        return true;
    } catch {
        return false;
    }
}
