import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { deserialize, serialize } from "v8";

import { GAME_CACHE_NAME } from "../../src/game/cache";
import { getArenaRegion } from "../../src/game/content/maps";
import { MapDef } from "../../src/game/content/types";
import { RegionData } from "../../src/mapviewer/worker/RegionData";
import { buildRegionData } from "../../src/mapviewer/worker/RegionDataLoader";
import { createSceneBuilder, createVarManager, loadGameCache } from "../cache/scene-util";

// The code that decides what a snapshot holds, so changing it builds new ones
const SOURCES = ["src/mapviewer/worker/RegionDataLoader.ts", "src/rs/scene/SceneBuilder.ts"];

function getSnapshotPath(map: MapDef): string {
    const hash = createHash("sha256").update(JSON.stringify(getArenaRegion(map)));
    for (const source of SOURCES) {
        hash.update(readFileSync(source));
    }
    const name = `${map.id}-${hash.digest("hex").slice(0, 12)}.bin`;
    return join("caches", "collision", GAME_CACHE_NAME, name);
}

// A sim only needs one map's collision and heights, but building them loads the
// whole game cache, about 600 MB of memory. So the first run on a map saves them
// to a small file, which every later run starts from. It's Node's format, so a
// snapshot won't read in Bun.
export function loadRegionData(map: MapDef): RegionData {
    const path = getSnapshotPath(map);
    if (existsSync(path)) {
        return deserialize(readFileSync(path));
    }
    const cache = loadGameCache();
    const data = buildRegionData(
        createSceneBuilder(cache),
        createVarManager(cache),
        getArenaRegion(map),
    );
    mkdirSync(dirname(path), { recursive: true });
    // Moved into place, as another sim may be starting on the same map
    const partial = `${path}.${process.pid}`;
    writeFileSync(partial, serialize(data));
    renameSync(partial, path);
    return data;
}
