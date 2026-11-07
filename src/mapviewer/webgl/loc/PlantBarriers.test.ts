import { describe, expect, test, vi } from "vitest";

import { CacheInfo } from "../../../rs/cache/CacheInfo";
import { LocType } from "../../../rs/config/loctype/LocType";
import { Model } from "../../../rs/model/Model";
import { Scene } from "../../../rs/scene/Scene";
import { InteractType } from "../InteractType";
import { getModelBounds } from "../buffer/CullGrid";
import { ContourGroundType, SceneModel } from "../buffer/SceneBuffer";
import { addPlantBarrierBases } from "./PlantBarriers";

const CACHE: CacheInfo = {
    name: "test",
    game: "oldschool",
    environment: "live",
    revision: 241,
    timestamp: "",
    size: 0,
};
const BORDER = 6;

function model(width = 200, depth = 200, height = 100): Model {
    const result = new Model();
    result.verticesCount = result.usedVertexCount = 2;
    result.verticesX = new Int32Array([-width / 2, width / 2]);
    result.verticesY = new Int32Array([-height, 0]);
    result.verticesZ = new Int32Array([-depth / 2, depth / 2]);
    result.faceColors1 = new Int32Array([6474]);
    result.faceColors2 = new Int32Array([6474]);
    result.faceColors3 = new Int32Array([-1]);
    return result;
}

function plant(id = 1399, mesh = model()): SceneModel {
    return {
        model: mesh,
        sceneX: 320,
        sceneZ: 320,
        sceneHeight: 0,
        heightOffset: 0,
        level: 0,
        priority: 2,
        lowDetail: false,
        forceMerge: false,
        contourGround: ContourGroundType.CENTER_TILE,
        interactType: InteractType.LOC,
        interactId: id,
    };
}

function fixture() {
    const types = new Map<number, LocType>();
    const load = (id: number) => {
        let type = types.get(id);
        if (!type) {
            type = new LocType(id, CACHE);
            types.set(id, type);
        }
        return type;
    };
    const roots = model(254, 246, 45);
    const getModelAnimated = vi.fn((): Model | undefined => roots);
    const loader = {
        locTypeLoader: { load, getCount: () => 0, clearCache: () => types.clear() },
        getModelAnimated,
    };
    const scene = new Scene(4, 76, 76);
    return { loader, roots, scene };
}

describe("plant barrier bases", () => {
    test("adds bases to the selected jungle plants, not similar passable plants or other scenery", () => {
        const { loader, scene } = fixture();
        const ids = [1204, 1398, 1399, 1400, 1401, 1402, 1390, 1314, 9010];
        const models = ids.map((id) => plant(id));
        addPlantBarrierBases(loader, models, scene, BORDER);
        expect(models.slice(ids.length).map((p) => p.interactId)).toEqual(ids.slice(0, 6));
    });

    test("a nonblocking variant never gets a base", () => {
        const { loader, scene } = fixture();
        loader.locTypeLoader.load(1399).clipType = 0;
        const models = [plant()];
        addPlantBarrierBases(loader, models, scene, BORDER);
        expect(models).toHaveLength(1);
        expect(loader.getModelAnimated).not.toHaveBeenCalled();
    });

    test("animated plants stay on their own rendering path", () => {
        const { loader, scene } = fixture();
        loader.locTypeLoader.load(1399).seqId = 2380;
        const models = [plant()];
        addPlantBarrierBases(loader, models, scene, BORDER);
        expect(models).toHaveLength(1);
    });

    test("transforming plants do not leave a permanent base behind", () => {
        const { loader, scene } = fixture();
        loader.locTypeLoader.load(1399).transforms = [1390, -1];
        const models = [plant()];
        addPlantBarrierBases(loader, models, scene, BORDER);
        expect(models).toHaveLength(1);
    });

    test("does not add scene locs or change collision maps", () => {
        const { loader, scene } = fixture();
        const before = JSON.stringify({ tiles: scene.tiles, collision: scene.collisionMaps });
        addPlantBarrierBases(loader, [plant()], scene, BORDER);
        expect(JSON.stringify({ tiles: scene.tiles, collision: scene.collisionMaps })).toBe(before);
    });

    test("copies the base without changing cached geometry, colors or plant models", () => {
        const { loader, roots, scene } = fixture();
        const original = plant();
        const models = [original];
        const before = Array.from(roots.verticesX);
        addPlantBarrierBases(loader, models, scene, BORDER);
        expect(models[0]).toBe(original);
        expect(models[1].model).not.toBe(roots);
        expect(Array.from(roots.verticesX)).toEqual(before);
        expect(Array.from(roots.verticesY)).toEqual([-45, 0]);
        expect(Array.from(roots.faceColors3)).toEqual([-1]);
        expect(getModelBounds(original.model).maxX).toBe(100);
    });

    test("reuses the same scaled mesh and loads the cache asset only once per square", () => {
        const { loader, scene } = fixture();
        const models = [plant(), plant()];
        addPlantBarrierBases(loader, models, scene, BORDER);
        expect(models[2].model).toBe(models[3].model);
        expect(loader.getModelAnimated).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ id: 1354 }),
            10,
            0,
            -1,
            -1,
        );
    });

    test.each([
        [200, 200],
        [90, 200],
        [200, 90],
        [98, 78],
    ])("keeps a low base inside the plant's %i by %i silhouette", (width, depth) => {
        const { loader, scene } = fixture();
        const models = [plant(1398, model(width, depth))];
        addPlantBarrierBases(loader, models, scene, BORDER);
        const bounds = getModelBounds(models[1].model);
        expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(Math.min(128, width * 0.75));
        expect(bounds.maxZ - bounds.minZ).toBeLessThanOrEqual(Math.min(128, depth * 0.75));
        expect(bounds.minY).toBe(-22);
        expect(bounds.maxY).toBe(0);
    });

    test("inherits the plant's location, picking and visibility", () => {
        const { loader, scene } = fixture();
        const original = { ...plant(), lowDetail: true, level: 1, heightOffset: 3 };
        const models = [original];
        addPlantBarrierBases(loader, models, scene, BORDER);
        expect(models[1]).toMatchObject({
            ...original,
            model: expect.any(Model),
            contourGround: ContourGroundType.VERTEX,
        });
    });

    test("fits sloping ground for merged draws without changing the reusable mesh or terrain", () => {
        const { loader, scene } = fixture();
        for (let x = 0; x < scene.tileHeights[0].length; x++) {
            scene.tileHeights[0][x].fill(-16 * x);
        }
        const heights = scene.tileHeights[0].map((row) => Array.from(row));
        const models = [{ ...plant(), sceneHeight: -136 }];
        addPlantBarrierBases(loader, models, scene, BORDER);
        const base = models[1].model;
        expect(base.contourVerticesY).toBeDefined();
        expect(base.contourVerticesY).not.toEqual(base.verticesY);
        expect(Array.from(base.verticesY)).toEqual([-22, 0]);
        expect(scene.tileHeights[0].map((row) => Array.from(row))).toEqual(heights);
    });

    test("reports a missing cache asset instead of silently losing the indicator", () => {
        const { loader, scene } = fixture();
        loader.getModelAnimated.mockReturnValue(undefined);
        expect(() => addPlantBarrierBases(loader, [plant()], scene, BORDER)).toThrow(
            "Missing plant barrier Tree stump model (loc 1354)",
        );
    });
});
