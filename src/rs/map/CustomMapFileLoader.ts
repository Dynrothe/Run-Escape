import { XteaMap } from "../../mapviewer/Caches";
import { MapFileIndex } from "./MapFileIndex";
import { MapFileLoader } from "./MapFileLoader";

// Map squares that aren't in the cache, in its file formats.
export interface CustomMapSquares {
    contains(mapX: number, mapY: number): boolean;
    getTerrainData(mapX: number, mapY: number): Int8Array;
    getLocData(mapX: number, mapY: number): Int8Array;
}

class CustomMapFileIndex implements MapFileIndex {
    constructor(
        readonly index: MapFileIndex,
        readonly custom: CustomMapSquares,
    ) {}

    // Anything but -1 tells the map manager a square exists; nothing reads the
    // archive of a custom one
    getTerrainArchiveId(mapX: number, mapY: number): number {
        return this.custom.contains(mapX, mapY) ? 0 : this.index.getTerrainArchiveId(mapX, mapY);
    }

    getLocArchiveId(mapX: number, mapY: number): number {
        return this.custom.contains(mapX, mapY) ? 0 : this.index.getLocArchiveId(mapX, mapY);
    }
}

// Every map read goes through a MapFileLoader (the scene builder, so the
// renderer, collision and the minimap), so this is all it takes to add a map
// square: nothing past here can tell it from a real one.
export class CustomMapFileLoader extends MapFileLoader {
    constructor(
        readonly base: MapFileLoader,
        readonly custom: CustomMapSquares,
    ) {
        super(base.mapIndex, new CustomMapFileIndex(base.mapFileIndex, custom));
    }

    override getTerrainData(mapX: number, mapY: number): Int8Array | undefined {
        return this.custom.contains(mapX, mapY)
            ? this.custom.getTerrainData(mapX, mapY)
            : this.base.getTerrainData(mapX, mapY);
    }

    override getLocData(mapX: number, mapY: number, xteasMap: XteaMap): Int8Array | undefined {
        return this.custom.contains(mapX, mapY)
            ? this.custom.getLocData(mapX, mapY)
            : this.base.getLocData(mapX, mapY, xteasMap);
    }

    override getNpcSpawnData(mapX: number, mapY: number, xteasMap: XteaMap): Int8Array | undefined {
        return this.custom.contains(mapX, mapY)
            ? undefined
            : this.base.getNpcSpawnData(mapX, mapY, xteasMap);
    }
}
