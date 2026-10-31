import { Scene } from "../../../rs/scene/Scene";
import { ContourGroundType, ModelInfo } from "./SceneBuffer";

// Margin added round every box, in model units, so a rounding error can't cost a
// sliver at the edge of the screen
const BOX_MARGIN = 16;

export const FLOATS_PER_BOX = 6;

// A model's extent around its own origin, in model units
export type ModelBounds = {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
};

export function getModelBounds(model: {
    verticesCount: number;
    verticesX: ArrayLike<number>;
    verticesY: ArrayLike<number>;
    verticesZ: ArrayLike<number>;
}): ModelBounds {
    const bounds = newBounds();
    addModelBounds(bounds, model);
    return bounds;
}

export function newBounds(): ModelBounds {
    return {
        minX: Infinity,
        minY: Infinity,
        minZ: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        maxZ: -Infinity,
    };
}

export function addModelBounds(
    bounds: ModelBounds,
    model: {
        verticesCount: number;
        verticesX: ArrayLike<number>;
        verticesY: ArrayLike<number>;
        verticesZ: ArrayLike<number>;
    },
): void {
    for (let i = 0; i < model.verticesCount; i++) {
        const x = model.verticesX[i];
        const y = model.verticesY[i];
        const z = model.verticesZ[i];
        if (x < bounds.minX) bounds.minX = x;
        if (y < bounds.minY) bounds.minY = y;
        if (z < bounds.minZ) bounds.minZ = z;
        if (x > bounds.maxX) bounds.maxX = x;
        if (y > bounds.maxY) bounds.maxY = y;
        if (z > bounds.maxZ) bounds.maxZ = z;
    }
}

// Cuts a map square into cells of cellSize tiles, each with the bounding box of
// what's in it, so that what's off screen can be left out of a draw. Model units
// (128 a tile), local to the square, y down like the rest of the scene.
//
// A cell's box only ever grows to fit what's added, so it can stick out of the
// cell: geometry isn't clipped, and a tall tree's box is as tall as the tree.
export class CullGrid {
    readonly perSide: number;

    private readonly boxes: number[] = [];
    private readonly cellBoxes = new Map<number, number>();

    constructor(
        readonly cellSize: number,
        readonly scene: Scene,
        readonly borderSize: number,
    ) {
        this.perSide = Math.ceil(Scene.MAP_SQUARE_SIZE / cellSize);
    }

    get boxCount(): number {
        return this.boxes.length / FLOATS_PER_BOX;
    }

    // The box of the cell a point (model units) is in. Points outside the square
    // go to the nearest cell.
    cellBox(x: number, z: number): number {
        const units = this.cellSize * 128;
        const cellX = Math.min(Math.max(Math.floor(x / units), 0), this.perSide - 1);
        const cellZ = Math.min(Math.max(Math.floor(z / units), 0), this.perSide - 1);
        const cell = cellX * this.perSide + cellZ;
        const box = this.cellBoxes.get(cell);
        if (box !== undefined) {
            return box;
        }
        const added = this.newBox();
        this.cellBoxes.set(cell, added);
        return added;
    }

    // A box of its own, for something too big to share a cell's
    newBox(): number {
        const box = this.boxCount;
        this.boxes.push(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity);
        return box;
    }

    extend(
        box: number,
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): void {
        const boxes = this.boxes;
        const o = box * FLOATS_PER_BOX;
        if (minX < boxes[o]) boxes[o] = minX;
        if (minY < boxes[o + 1]) boxes[o + 1] = minY;
        if (minZ < boxes[o + 2]) boxes[o + 2] = minZ;
        if (maxX > boxes[o + 3]) boxes[o + 3] = maxX;
        if (maxY > boxes[o + 4]) boxes[o + 4] = maxY;
        if (maxZ > boxes[o + 5]) boxes[o + 5] = maxZ;
    }

    // The box for a model placed by the shader (instanced and animated models).
    // Something wider than a cell gets a box of its own, so that it doesn't
    // stretch its cell's over everything else in there.
    addInstance(info: ModelInfo, bounds: ModelBounds): number {
        const { sceneX: x, sceneZ: z } = info;
        const minX = x + bounds.minX;
        const minZ = z + bounds.minZ;
        const maxX = x + bounds.maxX;
        const maxZ = z + bounds.maxZ;
        // The shader lifts it off the ground by this, then follows the terrain
        // at the tile (CENTER_TILE) or at each vertex (VERTEX)
        let minY = bounds.minY - info.heightOffset;
        let maxY = bounds.maxY - info.heightOffset;
        if (info.contourGround !== ContourGroundType.NONE) {
            const range = this.getHeightRange(
                info.level,
                Math.min(minX, x),
                Math.min(minZ, z),
                Math.max(maxX, x),
                Math.max(maxZ, z),
            );
            minY += range[0];
            maxY += range[1];
        }
        const units = this.cellSize * 128;
        const big = bounds.maxX - bounds.minX > units || bounds.maxZ - bounds.minZ > units;
        const box = big ? this.newBox() : this.cellBox(x, z);
        this.extend(box, minX, minY, minZ, maxX, maxY, maxZ);
        return box;
    }

    // The lowest and highest terrain over a stretch of the square
    private getHeightRange(
        level: number,
        minX: number,
        minZ: number,
        maxX: number,
        maxZ: number,
    ): [number, number] {
        const { scene, borderSize } = this;
        const heights = scene.tileHeights[Math.min(level, scene.levels - 1)];
        const clamp = (tile: number, size: number) => Math.min(Math.max(tile, 0), size);
        const startX = clamp(Math.floor(minX / 128) + borderSize, scene.sizeX);
        const startZ = clamp(Math.floor(minZ / 128) + borderSize, scene.sizeY);
        const endX = clamp(Math.floor(maxX / 128) + 1 + borderSize, scene.sizeX);
        const endZ = clamp(Math.floor(maxZ / 128) + 1 + borderSize, scene.sizeY);
        let low = Infinity;
        let high = -Infinity;
        for (let tileX = startX; tileX <= endX; tileX++) {
            for (let tileZ = startZ; tileZ <= endZ; tileZ++) {
                const height = heights[tileX][tileZ];
                if (height < low) low = height;
                if (height > high) high = height;
            }
        }
        return [low, high];
    }

    // World tiles, for testing against the camera's frustum
    toWorldBoxes(mapX: number, mapY: number): Float32Array {
        const out = new Float32Array(this.boxes.length);
        const baseX = mapX * 64;
        const baseZ = mapY * 64;
        for (let o = 0; o < out.length; o += FLOATS_PER_BOX) {
            out[o] = (this.boxes[o] - BOX_MARGIN) / 128 + baseX;
            out[o + 1] = (this.boxes[o + 1] - BOX_MARGIN) / 128;
            out[o + 2] = (this.boxes[o + 2] - BOX_MARGIN) / 128 + baseZ;
            out[o + 3] = (this.boxes[o + 3] + BOX_MARGIN) / 128 + baseX;
            out[o + 4] = (this.boxes[o + 4] + BOX_MARGIN) / 128;
            out[o + 5] = (this.boxes[o + 5] + BOX_MARGIN) / 128 + baseZ;
        }
        return out;
    }
}
