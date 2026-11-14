import { Archive } from "../../cache/Archive";
import { CacheIndex } from "../../cache/CacheIndex";
import { CacheInfo } from "../../cache/CacheInfo";
import { ByteBuffer } from "../../io/ByteBuffer";
import {
    ArchiveTypeLoader,
    IndexTypeLoader,
    IndexedDatTypeLoader,
    TypeLoader,
} from "../TypeLoader";
import { getLocBase } from "./LocOverrides";
import { LocType } from "./LocType";

export type LocTypeLoader = TypeLoader<LocType>;

export class DatLocTypeLoader {
    static load(cacheInfo: CacheInfo, configArchive: Archive): LocTypeLoader {
        return IndexedDatTypeLoader.load(LocType, cacheInfo, configArchive, "loc");
    }
}

export class ArchiveLocTypeLoader extends ArchiveTypeLoader<LocType> implements LocTypeLoader {
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(LocType, cacheInfo, archive);
    }

    // A loc of our own is read from the cache loc it's made from (LocOverrides.ts)
    override getDataBuffer(id: number): ByteBuffer | undefined {
        return super.getDataBuffer(getLocBase(id));
    }
}

export class IndexLocTypeLoader extends IndexTypeLoader<LocType> implements LocTypeLoader {
    constructor(cacheInfo: CacheInfo, index: CacheIndex) {
        super(LocType, cacheInfo, index);
    }

    override getDataBuffer(id: number): ByteBuffer | undefined {
        return super.getDataBuffer(getLocBase(id));
    }
}
