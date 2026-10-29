export type SdMapLoaderInput = {
    mapX: number;
    mapY: number;

    // Planes below minLevel aren't drawn (the game draws only its arena's
    // plane, so a dungeon's lower floors don't show through), and the minimap
    // image is of minLevel
    minLevel: number;
    maxLevel: number;
    loadObjs: boolean;
    loadNpcs: boolean;

    smoothTerrain: boolean;

    minimizeDrawCalls: boolean;

    loadedTextureIds: Set<number>;
};
