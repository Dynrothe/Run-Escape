import { PlacedLoc, TILE_BLOCKED, TileGrid, TileLevel, createTileGrid } from "./mapFormat";

// Overlay shapes, as the shores in the cache use them: a triangle whose rotation
// is the corner it fills (south-west, north-west, north-east, south-east), and
// a sliver along one side (west, north, east, south)
const SHAPE_CORNER = 1;
const SHAPE_SLIVER = 6;

export type StampOptions = {
    // "all" takes the prefab's floor too, the whole rectangle. "footprint"
    // keeps our ground and takes only the tiles with an overlay (the building's
    // floor), so there's no edge to see.
    floor: "all" | "footprint";
    // Over how many tiles the ground eases into it
    feather: number;
    // Ignore the prefab's own heights and stand it on flat ground
    flatten: boolean;
    // Height of the prefab's edge; the ground's there when unset
    height?: number;
};

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

    // Sets the overlay on every tile of the mask, and rounds the mask's edge
    // off with the shapes the cache's own shores and paths use. Blocked also
    // blocks those edge tiles, as shores do.
    paintOverlay(mask: Uint8Array, overlay: number, blocked: boolean): void {
        const { overlays, shapes, rotations, flags } = this.level0;
        const on = (x: number, y: number) => this.inside(x, y) && mask[this.tile(x, y)] !== 0;
        for (let y = 0; y < this.sizeY; y++) {
            for (let x = 0; x < this.sizeX; x++) {
                const i = this.tile(x, y);
                let shape = -1;
                let rotation = 0;
                if (mask[i]) {
                    shape = 0;
                } else {
                    const n = on(x, y + 1);
                    const e = on(x + 1, y);
                    const s = on(x, y - 1);
                    const w = on(x - 1, y);
                    const count = Number(n) + Number(e) + Number(s) + Number(w);
                    if (count >= 3 || (n && s) || (e && w)) {
                        shape = 0;
                    } else if (count === 2) {
                        shape = SHAPE_CORNER;
                        rotation = s && w ? 0 : n && w ? 1 : n && e ? 2 : 3;
                    } else if (count === 1) {
                        shape = SHAPE_SLIVER;
                        rotation = w ? 0 : n ? 1 : e ? 2 : 3;
                    }
                }
                if (shape === -1) {
                    continue;
                }
                overlays[i] = overlay;
                shapes[i] = shape;
                rotations[i] = rotation;
                this.reserved[i] = 1;
                if (blocked) {
                    flags[i] |= TILE_BLOCKED;
                }
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
        const prefabEdge = edgeSum / edgeCount;

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
        for (let level = 0; level < prefab.levels.length; level++) {
            const from = prefab.levels[level];
            const to = this.grid.levels[level];
            for (let ty = 0; ty < sizeY; ty++) {
                for (let tx = 0; tx < sizeX; tx++) {
                    const i = tx + ty * sizeX;
                    const j = this.tile(x + tx, y + ty);
                    this.reserved[j] = 1;
                    if (options.floor === "footprint" && from.overlays[i] === 0) {
                        // Our ground stays, but a bridge's flags are needed
                        // whatever's on the tile
                        to.flags[j] |= from.flags[i] & ~TILE_BLOCKED;
                        continue;
                    }
                    to.underlays[j] = from.underlays[i] || to.underlays[j];
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
            if (
                options.floor === "footprint" &&
                loc.type === 22 &&
                from0.overlays[loc.x + loc.y * sizeX] === 0
            ) {
                continue;
            }
            this.grid.locs.push({ ...loc, x: loc.x + x, y: loc.y + y });
        }
    }
}
