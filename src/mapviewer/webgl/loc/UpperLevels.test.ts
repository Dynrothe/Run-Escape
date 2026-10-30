import { describe, expect, test } from "vitest";

import { LocModelType } from "../../../rs/config/loctype/LocModelType";
import { Model } from "../../../rs/model/Model";
import { FloorDecoration } from "../../../rs/scene/FloorDecoration";
import { Scene } from "../../../rs/scene/Scene";
import { SceneTile } from "../../../rs/scene/SceneTile";
import { EntityType, calculateEntityTag } from "../../../rs/scene/entity/EntityTag";
import { isRoofLoc, isTileDrawn } from "./UpperLevels";

const FLOORS_SHOWN = 0x2;
const UNDER_ROOF = 0x4;

const WALKWAY_FLOOR_LOC = 36363;
const PRIFDDINAS_ROOF_LOC = 36270;
const PRIFDDINAS_DOME_LOC = 36411;

function sceneWithGroundFlags(flags: number): Scene {
    const scene = new Scene(Scene.MAX_LEVELS, 4, 4);
    scene.tileRenderFlags[0][1][1] = flags;
    return scene;
}

function loc(id: number, type: number, faceCount = 2): FloorDecoration {
    const model = new Model();
    model.faceCount = faceCount;
    const tag = calculateEntityTag(0, 0, EntityType.LOC, true, id);
    return new FloorDecoration(model, 0, 0, 0, tag, type);
}

function addFloor(scene: Scene, level: number, x: number, y: number, floor: FloorDecoration) {
    const tile = new SceneTile(level, x, y);
    tile.floorDecoration = floor;
    scene.tiles[level][x][y] = tile;
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

    test("a walkway two levels up and what's beside it stay over roofed ground", () => {
        const scene = sceneWithGroundFlags(FLOORS_SHOWN | UNDER_ROOF);
        addFloor(scene, 2, 2, 1, loc(WALKWAY_FLOOR_LOC, LocModelType.FLOOR_DECORATION));
        expect(isTileDrawn(scene, 2, 2, 1, 1, 0)).toBe(true);
        expect(isTileDrawn(scene, 1, 1, 1, 1, 0)).toBe(true);
    });

    test("a floor doesn't count as a walkway if it's on the next level up", () => {
        const scene = sceneWithGroundFlags(FLOORS_SHOWN | UNDER_ROOF);
        addFloor(scene, 1, 1, 1, loc(WALKWAY_FLOOR_LOC, LocModelType.FLOOR_DECORATION));
        expect(isTileDrawn(scene, 1, 1, 1, 1, 0)).toBe(false);
    });

    test("nor if it has no faces, or is part of a roof", () => {
        const empty = sceneWithGroundFlags(FLOORS_SHOWN | UNDER_ROOF);
        addFloor(empty, 2, 1, 1, loc(WALKWAY_FLOOR_LOC, LocModelType.FLOOR_DECORATION, 0));
        expect(isTileDrawn(empty, 1, 1, 1, 1, 0)).toBe(false);

        const roof = sceneWithGroundFlags(FLOORS_SHOWN | UNDER_ROOF);
        addFloor(roof, 2, 1, 1, loc(PRIFDDINAS_ROOF_LOC, LocModelType.FLOOR_DECORATION));
        expect(isTileDrawn(roof, 1, 1, 1, 1, 0)).toBe(false);
    });
});

describe("isRoofLoc", () => {
    test("every roof loc type is a roof", () => {
        expect(isRoofLoc(loc(1, LocModelType.ROOF_SLOPED))).toBe(true);
        expect(isRoofLoc(loc(1, LocModelType.ROOF_SLOPED_OVERHANG_HARD_OUTER_CORNER))).toBe(true);
    });

    test("Prifddinas's roofs are, for all that they're plain scenery", () => {
        expect(isRoofLoc(loc(PRIFDDINAS_ROOF_LOC, LocModelType.NORMAL))).toBe(true);
        expect(isRoofLoc(loc(PRIFDDINAS_DOME_LOC, LocModelType.NORMAL))).toBe(true);
    });

    test("its walkways and other scenery aren't", () => {
        expect(isRoofLoc(loc(WALKWAY_FLOOR_LOC, LocModelType.FLOOR_DECORATION))).toBe(false);
        expect(isRoofLoc(loc(1, LocModelType.NORMAL))).toBe(false);
    });
});
