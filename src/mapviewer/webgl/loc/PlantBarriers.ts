import { LocModelLoader } from "../../../rs/config/loctype/LocModelLoader";
import { LocModelType } from "../../../rs/config/loctype/LocModelType";
import { Model } from "../../../rs/model/Model";
import { Scene } from "../../../rs/scene/Scene";
import { getModelBounds } from "../buffer/CullGrid";
import { ContourGroundType, SceneModel } from "../buffer/SceneBuffer";

const JUNGLE_PLANTS = new Set([1204, 1398, 1399, 1400, 1401, 1402]);
const TREE_STUMP = 1354;

// Only the render list gets bases: changing the cache models would also change collision.
// Animated and transforming plants never reach it (getSceneLocs keeps them as entities). A base
// that can't be made is left out rather than failing the map square.
export function addPlantBarrierBases(
    loader: Pick<LocModelLoader, "locTypeLoader" | "getModelAnimated">,
    sceneModels: SceneModel[],
    scene: Pick<Scene, "tileHeights">,
    borderSize: number,
): void {
    const bases: SceneModel[] = [];
    const sizes = new Map<string, Model>();
    let stump: Model | undefined;
    for (const plant of sceneModels) {
        if (!JUNGLE_PLANTS.has(plant.interactId)) continue;
        if (loader.locTypeLoader.load(plant.interactId).clipType === 0) continue;

        const bounds = getModelBounds(plant.model);
        const width = Math.min(128, Math.floor((bounds.maxX - bounds.minX) * 0.75));
        const depth = Math.min(128, Math.floor((bounds.maxZ - bounds.minZ) * 0.75));
        if (!(width > 0 && depth > 0)) continue;
        const key = `${width},${depth}`;
        let model = sizes.get(key);
        if (!model) {
            stump ??= loader.getModelAnimated(
                loader.locTypeLoader.load(TREE_STUMP),
                LocModelType.NORMAL,
                0,
                -1,
                -1,
            );
            if (!stump) {
                console.error("Missing the plant bases' Tree stump model, loc", TREE_STUMP);
                return;
            }
            const stumpBounds = getModelBounds(stump);
            model = Model.copyAnimated(stump, true, true);
            model.translate(
                -(stumpBounds.minX + stumpBounds.maxX) / 2,
                0,
                -(stumpBounds.minZ + stumpBounds.maxZ) / 2,
            );
            model.scale(
                (width * 128) / (stumpBounds.maxX - stumpBounds.minX),
                64,
                (depth * 128) / (stumpBounds.maxZ - stumpBounds.minZ),
            );
            sizes.set(key, model);
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
