import { vec4 } from "gl-matrix";
import { describe, expect, it } from "vitest";

import { getMapSquareId } from "../rs/map/MapFileIndex";
import { Camera } from "./Camera";
import { MapManager, MapSquare } from "./MapManager";

// A camera at (x, z) world tiles that sees nothing (its frustum's never asked of a pinned square)
function cameraAt(x: number, z: number): Camera {
    return {
        getPosX: () => x,
        getPosZ: () => z,
        updatedPosition: false,
        frustum: { intersectsBox: () => false },
    } as unknown as Camera;
}

function square(mapX: number, mapY: number): MapSquare {
    return { mapX, mapY, canRender: () => true, delete() {} };
}

describe("pinned map squares", () => {
    it("load wherever the camera is, stay loaded, and go back to streaming once unpinned", () => {
        const asked: number[] = [];
        const manager = new MapManager<MapSquare>(10, (mapX, mapY) =>
            asked.push(getMapSquareId(mapX, mapY)),
        );
        manager.loadArea = vec4.fromValues(0, 0, 64 * 10, 64 * 10);
        const far = getMapSquareId(8, 8);
        const outside = getMapSquareId(20, 20);
        manager.setPinned([far, outside]);
        expect(manager.getPinnedProgress()).toEqual({ total: 1, left: 1 });

        // The camera at the other corner, nowhere near it: it's asked for all the same
        manager.update(cameraAt(32, 32), 0, 128, 2);
        expect(asked).toContain(far);
        expect(asked).not.toContain(outside);
        manager.addMap(8, 8, square(8, 8));
        expect(manager.getPinnedProgress()).toEqual({ total: 1, left: 0 });

        // Kept as the camera moves on, then let go
        manager.update(cameraAt(96, 32), 1, 128, 2);
        expect(manager.getMap(8, 8)).toBeDefined();
        manager.setPinned([]);
        manager.update(cameraAt(32, 100), 2, 128, 2);
        expect(manager.getMap(8, 8)).toBeUndefined();
    });
});
