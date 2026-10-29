import { Model } from "../../model/Model";
import { ModelLoader } from "../../model/ModelLoader";
import { SeqModelAnimator } from "../../model/seq/SeqModelAnimator";
import { TextureLoader } from "../../texture/TextureLoader";
import { SeqTypeLoader } from "../seqtype/SeqTypeLoader";
import { SpotAnimType } from "./SpotAnimType";
import { SpotAnimTypeLoader } from "./SpotAnimTypeLoader";

// Spot animation ("graphic") models: spell projectiles and impacts, level up
// fireworks, teleports. Built like the client does: recolour, light, pose,
// scale, then turn by the spot anim's orientation.
export class SpotAnimModelLoader {
    modelCache = new Map<number, Model>();

    constructor(
        readonly spotAnimTypeLoader: SpotAnimTypeLoader,
        readonly modelLoader: ModelLoader,
        readonly textureLoader: TextureLoader,
        readonly seqTypeLoader: SeqTypeLoader,
        readonly animator: SeqModelAnimator,
    ) {}

    getBaseModel(spotAnim: SpotAnimType): Model | undefined {
        const cached = this.modelCache.get(spotAnim.id);
        if (cached) {
            return cached;
        }
        if (spotAnim.modelId === undefined || spotAnim.modelId === -1) {
            return undefined;
        }
        const modelData = this.modelLoader.getModel(spotAnim.modelId);
        if (!modelData) {
            return undefined;
        }
        if (spotAnim.recolorFrom) {
            for (let i = 0; i < spotAnim.recolorFrom.length; i++) {
                modelData.recolor(spotAnim.recolorFrom[i], spotAnim.recolorTo[i]);
            }
        }
        if (spotAnim.retextureFrom) {
            for (let i = 0; i < spotAnim.retextureFrom.length; i++) {
                modelData.retexture(spotAnim.retextureFrom[i], spotAnim.retextureTo[i]);
            }
        }
        const model = modelData.light(
            this.textureLoader,
            spotAnim.ambient + 64,
            spotAnim.contrast + 850,
            -30,
            -50,
            -30,
        );
        this.modelCache.set(spotAnim.id, model);
        return model;
    }

    getModel(spotAnim: SpotAnimType, frame: number): Model | undefined {
        const base = this.getBaseModel(spotAnim);
        if (!base) {
            return undefined;
        }
        let model: Model;
        if (spotAnim.sequenceId !== -1 && frame !== -1) {
            model = this.animator.animate(
                base,
                this.seqTypeLoader.load(spotAnim.sequenceId),
                frame,
            );
        } else {
            model = Model.copyAnimated(base, true, true);
        }
        if (spotAnim.widthScale !== 128 || spotAnim.heightScale !== 128) {
            model.scale(spotAnim.widthScale, spotAnim.heightScale, spotAnim.widthScale);
        }
        if (spotAnim.orientation === 90) {
            model.rotate90();
        } else if (spotAnim.orientation === 180) {
            model.rotate180();
        } else if (spotAnim.orientation === 270) {
            model.rotate270();
        }
        return model;
    }

    clearCache(): void {
        this.modelCache.clear();
    }
}
