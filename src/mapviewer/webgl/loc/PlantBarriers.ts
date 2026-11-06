import { LocModelLoader } from "../../../rs/config/loctype/LocModelLoader";
import { LocModelType } from "../../../rs/config/loctype/LocModelType";
import { Model } from "../../../rs/model/Model";
import { Scene } from "../../../rs/scene/Scene";
import { getModelBounds } from "../buffer/CullGrid";
import { ContourGroundType, SceneModel } from "../buffer/SceneBuffer";

const JUNGLE_PLANTS = new Set([1204, 1398, 1399, 1400, 1401, 1402]);
const WOODY_BASE = 1354;

// Only the render list gets roots: changing the cache models would also change collision.
export function addPlantBarrierBases(
    loader: Pick<LocModelLoader, "locTypeLoader" | "getModelAnimated">,
    sceneModels: SceneModel[],
    scene: Scene,
    borderSize: number,
): void {
    const bases: SceneModel[] = [];
    const variants = new Map<string, Model>();
    let roots: Model | undefined;
    for (const plant of sceneModels) {
        if (!JUNGLE_PLANTS.has(plant.interactId)) continue;
        const type = loader.locTypeLoader.load(plant.interactId);
        if (type.clipType === 0 || type.seqId !== -1 || type.transforms) continue;

        const bounds = getModelBounds(plant.model);
        const width = Math.min(128, Math.floor((bounds.maxX - bounds.minX) * 0.75));
        const depth = Math.min(128, Math.floor((bounds.maxZ - bounds.minZ) * 0.75));
        if (!(width > 0 && depth > 0)) {
            throw new Error(`Jungle plant ${plant.interactId} has no usable model bounds`);
        }
        const key = `${width},${depth}`;
        let model = variants.get(key);
        if (!model) {
            roots ??= loader.getModelAnimated(
                loader.locTypeLoader.load(WOODY_BASE),
                LocModelType.NORMAL,
                0,
                -1,
                -1,
            );
            if (!roots) {
                throw new Error(`Missing plant barrier Tree stump model (loc ${WOODY_BASE})`);
            }
            const rootBounds = getModelBounds(roots);
            model = Model.copyAnimated(roots, true, true);
            model.translate(
                -(rootBounds.minX + rootBounds.maxX) / 2,
                0,
                -(rootBounds.minZ + rootBounds.maxZ) / 2,
            );
            model.scale(
                (width * 128) / (rootBounds.maxX - rootBounds.minX),
                64,
                (depth * 128) / (rootBounds.maxZ - rootBounds.minZ),
            );
            variants.set(key, model);
        }
        bases.push({
            ...plant,
            model: model.contourGround(
                1,
                0,
                scene.tileHeights[plant.level],
                undefined,
                plant.sceneX + borderSize * 128,
                plant.sceneHeight,
                plant.sceneZ + borderSize * 128,
            ),
            forceMerge: false,
            contourGround: ContourGroundType.VERTEX,
        });
    }
    sceneModels.push(...bases);
}
