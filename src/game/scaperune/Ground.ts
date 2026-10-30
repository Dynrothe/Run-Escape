import { PlacedLoc, TILE_BLOCKED, TileGrid, TileLevel, createTileGrid } from "./format";
import { smoothField } from "./noise";
import { getCoveredShare, getCoveredSides, getOverlayShape } from "./shapes";

export type StampOptions = {
    // "all" takes the prefab's floor too, the whole rectangle. "footprint"
    // keeps our ground and takes only the floor inside the walls, so there's no
    // edge to see and the ground runs right up to them. A function says which
    // overlays to take, and keeps our ground everywhere else (a bridge, over our
    // own river).
    floor: "all" | "footprint" | ((overlay: number) => boolean);
    // Over how many tiles the ground eases into it
    feather: number;
    // Ignore the prefab's own heights and stand it on flat ground
    flatten: boolean;
    // The height to stand it at; the ground's around it when unset
    height?: number;
    // Which of the prefab's own heights that means; its edge's when unset
    anchor?: number;
    // Leaves a loc out (doors, so you can walk in)
    skipLoc?: (loc: PlacedLoc) => boolean;
    // Keeps our underlays under the prefab, for one from other ground: a Lumbridge
    // bridge's grass would show as a green halo in the snow
    keepUnderlays?: boolean;
};

// Gives lines with no span the span of the nearest ones on both sides, if they
// have them both
function fillGaps(low: Int32Array, high: Int32Array): void {
    const spanned = (i: number) => low[i] < high[i];
    for (let i = 0; i < low.length; i++) {
        if (spanned(i)) {
            continue;
        }
        let before = i - 1;
        let after = i + 1;
        while (before >= 0 && !spanned(before)) {
            before--;
        }
        while (after < low.length && !spanned(after)) {
            after++;
        }
        if (before >= 0 && after < low.length) {
            low[i] = Math.max(low[before], low[after]);
            high[i] = Math.min(high[before], high[after]);
        }
    }
}

// A building's tiles: those inside its walls, going by the side of each tile the
// walls stand on. Row by row and column by column, so a doorway doesn't let the
// outside in. All of a prefab's tiles if it has no walls.
export function getInsideTiles(prefab: TileGrid): Uint8Array {
    const { sizeX, sizeY } = prefab;
    const west = new Int32Array(sizeY).fill(sizeX);
    const east = new Int32Array(sizeY).fill(0);
    const south = new Int32Array(sizeX).fill(sizeY);
    const north = new Int32Array(sizeX).fill(0);
    let walled = false;
    const addColumnEdge = (y: number, x: number) => {
        west[y] = Math.min(west[y], x);
        east[y] = Math.max(east[y], x);
    };
    const addRowEdge = (x: number, y: number) => {
        south[x] = Math.min(south[x], y);
        north[x] = Math.max(north[x], y);
    };
    for (const loc of prefab.locs) {
        if (loc.level !== 0) {
            continue;
        }
        // Rotation is the side: west, north, east, south. An L corner takes the
        // next side too.
        const sides =
            loc.type === 0
                ? [loc.rotation]
                : loc.type === 2
                  ? [loc.rotation, (loc.rotation + 1) & 3]
                  : [];
        for (const side of sides) {
            walled = true;
            if (side === 0) {
                addColumnEdge(loc.y, loc.x);
            } else if (side === 2) {
                addColumnEdge(loc.y, loc.x + 1);
            } else if (side === 1) {
                addRowEdge(loc.x, loc.y + 1);
            } else {
                addRowEdge(loc.x, loc.y);
            }
        }
        if (loc.type === 9) {
            walled = true;
            addColumnEdge(loc.y, loc.x);
            addColumnEdge(loc.y, loc.x + 1);
            addRowEdge(loc.x, loc.y);
            addRowEdge(loc.x, loc.y + 1);
        }
    }
    // A doorway with no door leaves a row or column with one wall, or none: it
    // spans what the ones either side of it span
    fillGaps(west, east);
    fillGaps(south, north);
    const inside = new Uint8Array(sizeX * sizeY);
    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            const within = x >= west[y] && x < east[y] && y >= south[x] && y < north[x];
            inside[x + y * sizeX] = !walled || within ? 1 : 0;
        }
    }
    return inside;
}

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

// A map being built: our own ground, in plain tile terms, with prefabs stamped
// on it.
export class Ground {
    readonly grid: TileGrid;
    readonly level0: TileLevel;
    readonly sizeX: number;
    readonly sizeY: number;
    // Tiles nothing gets scattered on
    readonly reserved: Uint8Array;

    constructor(sizeX: number, sizeY: number) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.grid = createTileGrid(sizeX, sizeY);
        this.level0 = this.grid.levels[0];
        this.reserved = new Uint8Array(sizeX * sizeY);
    }

    inside(x: number, y: number): boolean {
        return x >= 0 && y >= 0 && x < this.sizeX && y < this.sizeY;
    }

    tile(x: number, y: number): number {
        return x + y * this.sizeX;
    }

    getHeight(x: number, y: number): number {
        return this.level0.heights[x + y * (this.sizeX + 1)];
    }

    setHeight(x: number, y: number, height: number): void {
        const clamped = Math.min(Math.max(Math.round(height), 0), 255);
        this.level0.heights[x + y * (this.sizeX + 1)] = clamped;
    }

    // Paints an overlay where a field is above 0. The field's per tile corner,
    // x + y * (sizeX + 1), so edges come out as lines rather than steps of whole
    // tiles (shapes.ts). Blocked also blocks tiles at least half covered, so that
    // collision follows what's drawn. skip leaves tiles alone. Returns the tiles
    // it touched.
    paintField(
        field: Float32Array,
        overlay: number,
        blocked: boolean,
        skip?: Uint8Array,
    ): Uint8Array {
        const { overlays, shapes, rotations, flags } = this.level0;
        const cornersX = this.sizeX + 1;
        const touched = new Uint8Array(this.sizeX * this.sizeY);
        for (let y = 0; y < this.sizeY; y++) {
            for (let x = 0; x < this.sizeX; x++) {
                const i = this.tile(x, y);
                const at = x + y * cornersX;
                const sw = field[at];
                const se = field[at + 1];
                const ne = field[at + cornersX + 1];
                const nw = field[at + cornersX];
                const sides = getCoveredSides(sw, se, ne, nw);
                const shape = getOverlayShape(sides, sw + se + ne + nw);
                if (!shape || skip?.[i]) {
                    continue;
                }
                overlays[i] = overlay;
                shapes[i] = shape[0];
                rotations[i] = shape[1];
                touched[i] = 1;
                this.reserved[i] = 1;
                if (blocked && getCoveredShare(sides) >= 0.5) {
                    flags[i] |= TILE_BLOCKED;
                }
            }
        }
        return touched;
    }

    // Paints an overlay on the tiles of a mask, for hand-made maps. Its corners
    // are smoothed, so a mask of whole tiles gets edges like a real shore's.
    paintOverlay(mask: Uint8Array, overlay: number, blocked: boolean): Uint8Array {
        const cornersX = this.sizeX + 1;
        const field = new Float32Array(cornersX * (this.sizeY + 1));
        for (let y = 0; y <= this.sizeY; y++) {
            for (let x = 0; x <= this.sizeX; x++) {
                let count = 0;
                for (const [tx, ty] of [
                    [x - 1, y - 1],
                    [x, y - 1],
                    [x - 1, y],
                    [x, y],
                ]) {
                    if (this.inside(tx, ty) && mask[this.tile(tx, ty)]) {
                        count++;
                    }
                }
                field[x + y * cornersX] = count / 4 - 0.4;
            }
        }
        return this.paintField(smoothField(field, cornersX, this.sizeY + 1, 1), overlay, blocked);
    }

    // Takes an overlay off tiles, and what blocked them
    clearOverlay(tiles: Uint8Array): void {
        const { overlays, shapes, rotations, flags } = this.level0;
        for (let i = 0; i < tiles.length; i++) {
            if (tiles[i]) {
                overlays[i] = 0;
                shapes[i] = 0;
                rotations[i] = 0;
                flags[i] &= ~TILE_BLOCKED;
            }
        }
    }

    // Whether a loc of this many tiles fits with nothing else there
    isClear(x: number, y: number, sizeX: number, sizeY: number): boolean {
        for (let ty = y; ty < y + sizeY; ty++) {
            for (let tx = x; tx < x + sizeX; tx++) {
                if (!this.inside(tx, ty) || this.reserved[this.tile(tx, ty)]) {
                    return false;
                }
            }
        }
        return true;
    }

    place(loc: PlacedLoc, sizeX: number, sizeY: number): void {
        this.grid.locs.push(loc);
        for (let ty = loc.y; ty < loc.y + sizeY; ty++) {
            for (let tx = loc.x; tx < loc.x + sizeX; tx++) {
                if (this.inside(tx, ty)) {
                    this.reserved[this.tile(tx, ty)] = 1;
                }
            }
        }
    }

    // Average height along a rectangle's edge
    edgeHeight(x: number, y: number, sizeX: number, sizeY: number): number {
        let sum = 0;
        let count = 0;
        for (let cy = y; cy <= y + sizeY; cy++) {
            for (let cx = x; cx <= x + sizeX; cx++) {
                if (cx === x || cy === y || cx === x + sizeX || cy === y + sizeY) {
                    sum += this.getHeight(cx, cy);
                    count++;
                }
            }
        }
        return sum / count;
    }

    // Pastes a prefab with its south-west corner at (x, y)
    stamp(prefab: TileGrid, x: number, y: number, options: StampOptions): void {
        const { sizeX, sizeY } = prefab;
        const base = options.height ?? this.edgeHeight(x, y, sizeX, sizeY);
        const from0 = prefab.levels[0];

        // The prefab's height along its own edge is what meets the ground
        let edgeSum = 0;
        let edgeCount = 0;
        for (let cy = 0; cy <= sizeY; cy++) {
            for (let cx = 0; cx <= sizeX; cx++) {
                if (cx === 0 || cy === 0 || cx === sizeX || cy === sizeY) {
                    edgeSum += from0.heights[cx + cy * (sizeX + 1)];
                    edgeCount++;
                }
            }
        }
        const prefabEdge = options.anchor ?? edgeSum / edgeCount;

        // Heights: the corners under it, then a ring easing back to the ground
        for (let cy = 0; cy <= sizeY; cy++) {
            for (let cx = 0; cx <= sizeX; cx++) {
                const own = from0.heights[cx + cy * (sizeX + 1)];
                this.setHeight(x + cx, y + cy, options.flatten ? base : base + own - prefabEdge);
            }
        }
        const feather = options.feather;
        for (let cy = -feather; cy <= sizeY + feather; cy++) {
            for (let cx = -feather; cx <= sizeX + feather; cx++) {
                const nearX = Math.min(Math.max(cx, 0), sizeX);
                const nearY = Math.min(Math.max(cy, 0), sizeY);
                const distance = Math.hypot(cx - nearX, cy - nearY);
                if (distance === 0 || distance >= feather) {
                    continue;
                }
                const gx = x + cx;
                const gy = y + cy;
                if (gx < 0 || gy < 0 || gx > this.sizeX || gy > this.sizeY) {
                    continue;
                }
                const edge = this.getHeight(x + nearX, y + nearY);
                const t = smoothstep(distance / feather);
                this.setHeight(gx, gy, edge + (this.getHeight(gx, gy) - edge) * t);
            }
        }

        // Floors
        const inside = options.floor === "footprint" ? getInsideTiles(prefab) : undefined;
        for (let level = 0; level < prefab.levels.length; level++) {
            const from = prefab.levels[level];
            const to = this.grid.levels[level];
            for (let ty = 0; ty < sizeY; ty++) {
                for (let tx = 0; tx < sizeX; tx++) {
                    const i = tx + ty * sizeX;
                    const j = this.tile(x + tx, y + ty);
                    if (!inside || inside[i]) {
                        this.reserved[j] = 1;
                    }
                    const take =
                        level > 0
                            ? !inside || inside[i]
                            : typeof options.floor === "function"
                              ? options.floor(from.overlays[i])
                              : options.floor === "all" || (inside![i] && from.overlays[i] !== 0);
                    if (!take) {
                        continue;
                    }
                    if (!options.keepUnderlays) {
                        to.underlays[j] = from.underlays[i] || to.underlays[j];
                    }
                    to.overlays[j] = from.overlays[i];
                    to.shapes[j] = from.shapes[i];
                    to.rotations[j] = from.rotations[i];
                    to.flags[j] = from.flags[i];
                }
            }
            if (level > 0) {
                for (let cy = 0; cy <= sizeY; cy++) {
                    for (let cx = 0; cx <= sizeX; cx++) {
                        to.heights[x + cx + (y + cy) * (this.sizeX + 1)] =
                            from.heights[cx + cy * (sizeX + 1)];
                    }
                }
            }
        }

        // Locs, but in footprint mode not the ground's own bits around it
        for (const loc of prefab.locs) {
            if (options.skipLoc?.(loc)) {
                continue;
            }
            // Nor the ground's own bits outside the walls
            const at = loc.x + loc.y * sizeX;
            if (
                loc.type === 22 &&
                ((inside && !inside[at]) || (options.floor !== "all" && from0.overlays[at] === 0))
            ) {
                continue;
            }
            this.grid.locs.push({ ...loc, x: loc.x + x, y: loc.y + y });
        }
    }
}
