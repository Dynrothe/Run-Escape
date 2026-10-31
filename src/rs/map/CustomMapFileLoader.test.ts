import { describe, expect, it } from "vitest";

import { CustomMapFileLoader } from "./CustomMapFileLoader";
import { getMapSquareId } from "./MapFileIndex";
import { MapFileLoader } from "./MapFileLoader";

const square = (value: number) => ({
    terrain: Int8Array.of(value),
    locs: Int8Array.of(value),
});

function createLoader(): CustomMapFileLoader {
    const base = {
        mapIndex: undefined,
        mapFileIndex: { getTerrainArchiveId: () => -1, getLocArchiveId: () => -1 },
        getTerrainData: () => undefined,
        getLocData: () => undefined,
    };
    return new CustomMapFileLoader(base as unknown as MapFileLoader);
}

describe("CustomMapFileLoader", () => {
    it("serves squares it's given, and says they exist", () => {
        const loader = createLoader();
        expect(loader.getTerrainData(80, 120)).toBeUndefined();
        expect(loader.mapFileIndex.getTerrainArchiveId(80, 120)).toBe(-1);
        loader.addSquares(new Map([[getMapSquareId(80, 120), square(1)]]));
        expect(loader.getTerrainData(80, 120)).toEqual(Int8Array.of(1));
        expect(loader.mapFileIndex.getTerrainArchiveId(80, 120)).not.toBe(-1);
    });

    it("replaces squares, and takes out removed ones", () => {
        const loader = createLoader();
        const kept = getMapSquareId(80, 120);
        const removed = getMapSquareId(81, 120);
        loader.addSquares(
            new Map([
                [kept, square(1)],
                [removed, square(2)],
            ]),
        );
        loader.addSquares(new Map([[kept, square(3)]]), [removed]);
        expect(loader.getLocData(80, 120, new Map())).toEqual(Int8Array.of(3));
        expect(loader.getTerrainData(81, 120)).toBeUndefined();
        expect(loader.mapFileIndex.getLocArchiveId(81, 120)).toBe(-1);
    });
});
