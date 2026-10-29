import { CacheInfo } from "../../cache/CacheInfo";
import { CacheSystem } from "../../cache/CacheSystem";
import { ConfigType } from "../../cache/ConfigType";
import { IndexType } from "../../cache/IndexType";
import { ArchiveTypeLoader, TypeLoader } from "../TypeLoader";
import { SpotAnimType } from "./SpotAnimType";

export type SpotAnimTypeLoader = TypeLoader<SpotAnimType>;

export function createSpotAnimTypeLoader(
    cacheInfo: CacheInfo,
    cacheSystem: CacheSystem,
): SpotAnimTypeLoader {
    const configIndex = cacheSystem.getIndex(IndexType.DAT2.configs);
    return new ArchiveTypeLoader(
        SpotAnimType,
        cacheInfo,
        configIndex.getArchive(ConfigType.DAT2.spotAnims),
    );
}
