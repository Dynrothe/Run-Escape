import { CacheInfo } from "../../cache/CacheInfo";
import { CacheSystem } from "../../cache/CacheSystem";
import { ConfigType } from "../../cache/ConfigType";
import { IndexType } from "../../cache/IndexType";
import { ArchiveTypeLoader, TypeLoader } from "../TypeLoader";
import { IdkType } from "./IdkType";

export type IdkTypeLoader = TypeLoader<IdkType>;

export function createIdkTypeLoader(cacheInfo: CacheInfo, cacheSystem: CacheSystem): IdkTypeLoader {
    const configIndex = cacheSystem.getIndex(IndexType.DAT2.configs);
    return new ArchiveTypeLoader(
        IdkType,
        cacheInfo,
        configIndex.getArchive(ConfigType.DAT2.identkits),
    );
}
