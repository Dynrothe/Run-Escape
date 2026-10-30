import { describe, expect, test } from "vitest";

import { Scene } from "../../../rs/scene/Scene";
import { isTileDrawn } from "./SceneLocs";

const FLOORS_SHOWN = 0x2;
const UNDER_ROOF = 0x4;

function sceneWithGroundFlags(flags: number): Scene {
    const scene = new Scene(Scene.MAX_LEVELS, 4, 4);
    scene.tileRenderFlags[0][1][1] = flags;
    return scene;
}

describe("isTileDrawn", () => {
    test("what belongs to the floor stays under a roof, even stored a level up", () => {
        const scene = sceneWithGroundFlags(UNDER_ROOF);
        expect(isTileDrawn(scene, 0, 1, 1, 1, 0)).toBe(true);
    });

    test("upper floors only flagged to show are left out under a roof", () => {
        const roofed = sceneWithGroundFlags(FLOORS_SHOWN | UNDER_ROOF);
        expect(isTileDrawn(roofed, 1, 1, 1, 1, 0)).toBe(false);
        const open = sceneWithGroundFlags(FLOORS_SHOWN);
        expect(isTileDrawn(open, 1, 1, 1, 1, 0)).toBe(true);
    });

    test("upper floors aren't drawn otherwise", () => {
        const scene = sceneWithGroundFlags(0);
        expect(isTileDrawn(scene, 1, 1, 1, 1, 0)).toBe(false);
    });
});
