// Collision, heights and tile flags for a rectangle of the world, built by
// RegionDataLoader. Kept free of loader imports so game code (and tests) can
// use it without pulling in the scene builder.

export const REGION_TILE_BRIDGE = 0x1;
export const REGION_TILE_INSIDE = 0x2;

export type RegionDataInput = {
    // World tile coordinates
    baseX: number;
    baseY: number;
    sizeX: number;
    sizeY: number;
    // The plane (level) to build it for: 0 for the surface, higher upstairs
    // and in some dungeons (the God Wars Dungeon's main cave is on plane 2).
    // 0 when unset.
    plane?: number;
};

export type RegionData = {
    baseX: number;
    baseY: number;
    sizeX: number;
    sizeY: number;
    // The plane everything below is for
    plane: number;
    // The plane's collision flags (bridges already folded in), x + y * sizeX
    collisionFlags: Int32Array;
    // Tile corner heights in scene units (negative is up), x + y * (sizeX + 1):
    // the plane's ground, and the plane above's, which is the ground on a
    // bridge (REGION_TILE_BRIDGE)
    heights: Int32Array;
    bridgeHeights: Int32Array;
    // REGION_TILE_* bits, x + y * sizeX
    tileFlags: Uint8Array;
    // Overlay id per tile on the plane (0 = none), x + y * sizeX
    overlays: Uint16Array;
    // The locs that block on the plane, COLLISION_LOC_STRIDE numbers each: the
    // tiles they block (x, y, sizeX, sizeY in world tiles), then the ground
    // their model stands on (x0, y0, x1, y1 in world tiles; NaN if not known,
    // an empty box with x1 < x0 if they draw nothing)
    collisionLocs: Float32Array;
};

export const COLLISION_LOC_STRIDE = 8;
