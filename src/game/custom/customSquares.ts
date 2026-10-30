import { LocTypeLoader } from "../../rs/config/loctype/LocTypeLoader";
import { CustomMapSquares } from "../../rs/map/CustomMapFileLoader";
import { MapFileLoader } from "../../rs/map/MapFileLoader";
import { MAP_SQUARE_SIZE, TileGrid, writeLocs, writeTerrain } from "./mapFormat";
import { LocSizes } from "./prefab";
import { TERRAIN_TEST_MAP, buildTerrainTest } from "./terrainTest";

export type CustomMapBuildContext = { maps: MapFileLoader; locSizes: LocSizes };

// A custom map's ground, in map squares: where it goes in the world (squares
// the cache doesn't have, so it stands on its own) and what builds it
export type CustomMapDef = {
    mapX: number;
    mapY: number;
    squaresX: number;
    squaresY: number;
    build(context: CustomMapBuildContext): TileGrid;
};

const CUSTOM_MAPS: CustomMapDef[] = [{ ...TERRAIN_TEST_MAP, build: buildTerrainTest }];

function findMap(mapX: number, mapY: number): CustomMapDef | undefined {
    return CUSTOM_MAPS.find(
        (map) =>
            mapX >= map.mapX &&
            mapY >= map.mapY &&
            mapX < map.mapX + map.squaresX &&
            mapY < map.mapY + map.squaresY,
    );
}

// Built the first time a square's asked for, once per worker: the main thread
// only ever asks whether a square exists.
export function createCustomMapSquares(
    maps: MapFileLoader,
    locTypes: LocTypeLoader,
): CustomMapSquares {
    const grids = new Map<CustomMapDef, TileGrid>();
    const locSizes: LocSizes = (id) => {
        const type = locTypes.load(id);
        return [type.sizeX, type.sizeY];
    };
    const getGrid = (map: CustomMapDef): TileGrid => {
        let grid = grids.get(map);
        if (!grid) {
            const started = performance.now();
            grid = map.build({ maps, locSizes });
            console.log(`Built custom map in ${(performance.now() - started).toFixed(0)} ms`);
            grids.set(map, grid);
        }
        return grid;
    };
    return {
        contains: (mapX, mapY) => findMap(mapX, mapY) !== undefined,
        getTerrainData(mapX, mapY) {
            const map = findMap(mapX, mapY)!;
            return writeTerrain(
                getGrid(map),
                (mapX - map.mapX) * MAP_SQUARE_SIZE,
                (mapY - map.mapY) * MAP_SQUARE_SIZE,
            );
        },
        getLocData(mapX, mapY) {
            const map = findMap(mapX, mapY)!;
            return writeLocs(
                getGrid(map),
                (mapX - map.mapX) * MAP_SQUARE_SIZE,
                (mapY - map.mapY) * MAP_SQUARE_SIZE,
            );
        },
    };
}
