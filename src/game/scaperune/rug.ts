import { getLocBlocking } from "./collision";
import { LEVELS, TILE_BRIDGE, TILE_SHOWN, type TileGrid, createTileGrid } from "./format";
import { cutPrefab } from "./prefab";
import type { BuildContext } from "./recipe";

// A rug: a patch of the real world's floor, its overlays and the floor decoration on it (a
// patterned floor is type 22 locs, not an overlay), and nothing else, to lay over a painted hall
// so it isn't bare. No walls, no props, nothing that blocks, and no flags: it's walked on.

export type RugOptions = {
    // The level to take it from; it comes out on the ground level
    plane?: number;
    // How far, in height units, a tile's corners can stand off the rug's own level (the middle
    // of its corners' heights). Tiles past it are left out, so a raised pad or a slope doesn't
    // come with the rug.
    maxStep: number;
};

// Cuts a rug out of the real world, worldX, worldY its south-west tile. A tile is left out (no
// floor, nothing on it) if it steps over maxStep, or if its floor belongs to another level: under
// a bridge (the level above has TILE_BRIDGE, so that's the ground floor there), or under something
// drawn from another level whatever floor you're on (TILE_SHOWN). Stamp it with floor "all" to
// lay its floor and its underlays, or `floor: (overlay) => overlay !== 0` to keep ours where it has
// no overlay.
export function cutRug(
    context: Pick<BuildContext, "maps" | "locs">,
    rect: { worldX: number; worldY: number; sizeX: number; sizeY: number },
    options: RugOptions,
): TileGrid {
    const { plane = 0, maxStep } = options;
    const { sizeX, sizeY } = rect;
    const cut = cutPrefab(context.maps, rect.worldX, rect.worldY, sizeX, sizeY);
    const from = cut.levels[plane];
    const rug = createTileGrid(sizeX, sizeY);
    const to = rug.levels[0];
    to.heights.set(from.heights);
    const sorted = [...from.heights].sort((a, b) => a - b);
    const level = sorted[Math.floor(sorted.length / 2)];
    const cornersX = sizeX + 1;

    const kept = new Uint8Array(sizeX * sizeY);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const i = x + y * sizeX;
            const corners = [
                x + y * cornersX,
                x + 1 + y * cornersX,
                x + (y + 1) * cornersX,
                x + 1 + (y + 1) * cornersX,
            ];
            if (corners.some((c) => Math.abs(from.heights[c] - level) > maxStep)) {
                continue;
            }
            if (plane + 1 < LEVELS && cut.levels[plane + 1].flags[i] & TILE_BRIDGE) {
                continue;
            }
            if (cut.levels.some((other, l) => l !== plane && other.flags[i] & TILE_SHOWN)) {
                continue;
            }
            kept[i] = 1;
            to.underlays[i] = from.underlays[i];
            to.overlays[i] = from.overlays[i];
            to.shapes[i] = from.shapes[i];
            to.rotations[i] = from.rotations[i];
        }
    }
    rug.locs = cut.locs
        .filter(
            (loc) =>
                loc.level === plane &&
                loc.type === 22 &&
                kept[loc.x + loc.y * sizeX] &&
                !getLocBlocking(loc.type, context.locs(loc.id)),
        )
        .map((loc) => ({ ...loc, level: 0 }));
    return rug;
}
