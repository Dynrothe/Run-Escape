import { XteaMap } from "../../mapviewer/Caches";
import { MapFileIndex, getMapSquareId } from "./MapFileIndex";
import { MapFileLoader } from "./MapFileLoader";

// A map square that isn't in the cache, in its file formats
export type CustomMapSquare = { terrain: Int8Array; locs: Int8Array };
// By map square id
export type CustomMapSquares = Map<number, CustomMapSquare>;

class CustomMapFileIndex implements MapFileIndex {
    constructor(
        readonly index: MapFileIndex,
        readonly squares: CustomMapSquares,
    ) {}

    // Anything but -1 tells the map manager a square exists; nothing reads the
    // archive of a custom one
    getTerrainArchiveId(mapX: number, mapY: number): number {
        return this.squares.has(getMapSquareId(mapX, mapY))
            ? 0
            : this.index.getTerrainArchiveId(mapX, mapY);
    }

    getLocArchiveId(mapX: number, mapY: number): number {
        return this.squares.has(getMapSquareId(mapX, mapY))
            ? 0
            : this.index.getLocArchiveId(mapX, mapY);
    }
}

// Every map read goes through a MapFileLoader (the scene builder, so the
// renderer, collision and the minimap), so this is all it takes to add a map
// square: nothing past here can tell it from a real one. The squares are plain
// data, handed in from outside (src/game/scaperune).
export class CustomMapFileLoader extends MapFileLoader {
    readonly squares: CustomMapSquares;

    constructor(readonly base: MapFileLoader) {
        const squares: CustomMapSquares = new Map();
        super(base.mapIndex, new CustomMapFileIndex(base.mapFileIndex, squares));
        this.squares = squares;
    }

    // Adds squares, or replaces those it has, and takes out the removed ones
    addSquares(squares: CustomMapSquares, removedIds: number[] = []): void {
        for (const id of removedIds) {
            this.squares.delete(id);
        }
        for (const [id, square] of squares) {
            this.squares.set(id, square);
        }
    }

    override getTerrainData(mapX: number, mapY: number): Int8Array | undefined {
        const square = this.squares.get(getMapSquareId(mapX, mapY));
        return square ? square.terrain : this.base.getTerrainData(mapX, mapY);
    }

    override getLocData(mapX: number, mapY: number, xteasMap: XteaMap): Int8Array | undefined {
        const square = this.squares.get(getMapSquareId(mapX, mapY));
        return square ? square.locs : this.base.getLocData(mapX, mapY, xteasMap);
    }

    override getNpcSpawnData(mapX: number, mapY: number, xteasMap: XteaMap): Int8Array | undefined {
        return this.squares.has(getMapSquareId(mapX, mapY))
            ? undefined
            : this.base.getNpcSpawnData(mapX, mapY, xteasMap);
    }
}

export function addCustomMapSquares(
    loader: MapFileLoader,
    squares: CustomMapSquares,
    removedIds: number[] = [],
): void {
    if (!(loader instanceof CustomMapFileLoader)) {
        throw new Error("This cache's map loader can't take custom map squares");
    }
    loader.addSquares(squares, removedIds);
}
