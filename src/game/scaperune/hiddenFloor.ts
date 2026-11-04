import { SOLID_FLAGS } from "../core/world/ArenaGrid";
import { getCollisionFlags } from "./collision";
import { TILE_BRIDGE, TILE_SHOWN, type TileGrid, cacheFloorId } from "./format";
import type { LocInfo } from "./recipe";

// Ground you can walk on that draws nothing: the cache's hidden overlay (magenta, 0xFF00FF, with no
// texture, which SceneBuilder leaves out), or no floor at all. In the world it's under something
// else that's drawn, so a cut can bring it in on its own and leave a hole in the ground.

// What an overlay type needs to say whether it's drawn
export type OverlayLook = { primaryRgb: number; textureId: number };

export const HIDDEN_RGB = 0xff00ff;

export function isHiddenOverlay(type: OverlayLook): boolean {
    return type.textureId === -1 && type.primaryRgb === HIDDEN_RGB;
}

// Whether a map file's overlay id (the cache's plus one) is hidden, from the cache's overlays
export function getHiddenOverlays(overlays: {
    load(id: number): OverlayLook;
}): (overlay: number) => boolean {
    const hidden = new Map<number, boolean>();
    return (overlay) => {
        if (overlay === 0) {
            return false;
        }
        let is = hidden.get(overlay);
        if (is === undefined) {
            is = isHiddenOverlay(overlays.load(cacheFloorId(overlay)));
            hidden.set(overlay, is);
        }
        return is;
    };
}

// Open tiles of the ground floor that draw no floor, by tile index, and why each is all right:
// drawn from level 1 instead (TILE_SHOWN), under a bridge, or covered by floor decoration (type
// 22, as the Theatre's patterned rooms are). Only the bare ones are holes.
export type HiddenFloor = { shown: number; bridge: number; covered: number; bare: number[] };

export function findHiddenFloor(
    grid: TileGrid,
    flags: Int32Array,
    isHidden: (overlay: number) => boolean,
    rect = { x0: 0, y0: 0, x1: grid.sizeX - 1, y1: grid.sizeY - 1 },
): HiddenFloor {
    const [ground, upstairs] = grid.levels;
    const decorated = new Set<number>();
    for (const loc of grid.locs) {
        if (loc.level === 0 && loc.type === 22) {
            decorated.add(loc.x + loc.y * grid.sizeX);
        }
    }
    const found: HiddenFloor = { shown: 0, bridge: 0, covered: 0, bare: [] };
    for (let y = rect.y0; y <= rect.y1; y++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
            const i = x + y * grid.sizeX;
            const overlay = ground.overlays[i];
            const underlay = ground.underlays[i];
            // A hidden overlay of part of a tile leaves the underlay showing round it
            const nothing =
                (overlay === 0 && underlay === 0) ||
                (isHidden(overlay) && (ground.shapes[i] === 0 || underlay === 0));
            if (!nothing || flags[i] & SOLID_FLAGS) {
                continue;
            }
            if (upstairs.flags[i] & TILE_SHOWN) {
                found.shown++;
            } else if (upstairs.flags[i] & TILE_BRIDGE) {
                found.bridge++;
            } else if (decorated.has(i)) {
                found.covered++;
            } else {
                found.bare.push(i);
            }
        }
    }
    return found;
}

// check-maps' warning line for holes in a built map's floor, or undefined if it has none
export function describeHiddenFloor(
    grid: TileGrid,
    locs: (id: number) => LocInfo,
    overlays: { load(id: number): OverlayLook },
    rect?: { x0: number; y0: number; x1: number; y1: number },
): string | undefined {
    const flags = getCollisionFlags(grid, locs);
    const { bare } = findHiddenFloor(grid, flags, getHiddenOverlays(overlays), rect);
    if (bare.length === 0) {
        return undefined;
    }
    const at = bare
        .slice(0, 4)
        .map((i) => `${i % grid.sizeX},${Math.floor(i / grid.sizeX)}`)
        .join(" ");
    return `warning: ${bare.length} open tiles draw no floor (hidden overlay or none), at ${at}`;
}
