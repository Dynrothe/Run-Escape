import { describe, expect, it } from "vitest";

import { CollisionFlag } from "../../rs/pathfinder/flag/CollisionFlag";
import { TILE_BRIDGE, TILE_SHOWN, createTileGrid } from "./format";
import {
    HIDDEN_RGB,
    describeHiddenFloor,
    findHiddenFloor,
    getHiddenOverlays,
    isHiddenOverlay,
} from "./hiddenFloor";

// Cache overlays: 0 is grass, 1 the hidden one, 2 magenta with a texture (drawn)
const OVERLAYS = [
    { primaryRgb: 0x00ff00, textureId: -1 },
    { primaryRgb: HIDDEN_RGB, textureId: -1 },
    { primaryRgb: HIDDEN_RGB, textureId: 5 },
];
const overlayTypes = { load: (id: number) => OVERLAYS[id] };
// As the map files store them
const GRASS = 1;
const HIDDEN = 2;
const TEXTURED = 3;

describe("hidden floor", () => {
    it("knows the hidden overlay by its colour, unless it has a texture", () => {
        expect(OVERLAYS.map(isHiddenOverlay)).toEqual([false, true, false]);
        const hidden = getHiddenOverlays(overlayTypes);
        expect([0, GRASS, HIDDEN, TEXTURED].map(hidden)).toEqual([false, false, true, false]);
    });

    // 8 tiles in a row: each one a case
    function row() {
        const grid = createTileGrid(8, 1);
        const ground = grid.levels[0];
        ground.underlays.fill(5);
        ground.overlays.set([GRASS, HIDDEN, HIDDEN, HIDDEN, HIDDEN, HIDDEN, HIDDEN, 0]);
        // 2 is drawn from level 1, 3 is under a bridge, 4 has a pattern of floor decoration on it
        grid.levels[1].flags[2] = TILE_SHOWN;
        grid.levels[1].flags[3] = TILE_BRIDGE;
        grid.locs.push({ id: 9, type: 22, rotation: 0, level: 0, x: 4, y: 0 });
        // 5 covers only half the tile, so the underlay shows
        ground.shapes[5] = 1;
        // 6 is blocked; 7 has no overlay, and no underlay either
        ground.underlays[7] = 0;
        const flags = new Int32Array(8);
        flags[6] = CollisionFlag.FLOOR;
        return { grid, flags };
    }

    it("finds open tiles that draw no floor, and why each is all right", () => {
        const { grid, flags } = row();
        const found = findHiddenFloor(grid, flags, getHiddenOverlays(overlayTypes));
        expect(found).toEqual({ shown: 1, bridge: 1, covered: 1, bare: [1, 7] });
    });

    it("keeps to a rectangle", () => {
        const { grid, flags } = row();
        const rect = { x0: 0, y0: 0, x1: 5, y1: 0 };
        expect(findHiddenFloor(grid, flags, getHiddenOverlays(overlayTypes), rect).bare).toEqual([
            1,
        ]);
    });

    it("warns about the bare ones", () => {
        const { grid } = row();
        const locs = () => ({
            name: "pattern",
            sizeX: 1,
            sizeY: 1,
            clipType: 0,
            blocksProjectile: false,
            drawn: true,
        });
        // Nothing blocks without collision flags, so 6 counts too
        expect(describeHiddenFloor(grid, locs, overlayTypes)).toEqual([
            "warning: 3 open tiles draw no floor (hidden overlay or none), at 1,0 6,0 7,0",
            "warning: 1 open tiles are floor decoration over a hidden floor, so the void shows " +
                "in the seams between them: put a plain overlay of their colour under them",
        ]);
        grid.levels[0].overlays.fill(GRASS);
        expect(describeHiddenFloor(grid, locs, overlayTypes)).toEqual([]);
    });

    // The Owl's Court's walkways were the hidden floor under stone tiles: drawn, but with the
    // black showing through the hairlines between the tiles
    it("warns about floor decoration over a hidden floor, and not over a plain one", () => {
        const grid = createTileGrid(3, 1);
        grid.levels[0].overlays.fill(HIDDEN);
        for (let x = 0; x < 3; x++) {
            grid.locs.push({ id: 9, type: 22, rotation: 0, level: 0, x, y: 0 });
        }
        const locs = () => ({
            name: "stone",
            sizeX: 1,
            sizeY: 1,
            clipType: 0,
            blocksProjectile: false,
            drawn: true,
        });
        expect(describeHiddenFloor(grid, locs, overlayTypes)).toEqual([
            "warning: 3 open tiles are floor decoration over a hidden floor, so the void shows " +
                "in the seams between them: put a plain overlay of their colour under them",
        ]);
        grid.levels[0].overlays.fill(GRASS);
        expect(describeHiddenFloor(grid, locs, overlayTypes)).toEqual([]);
    });
});
