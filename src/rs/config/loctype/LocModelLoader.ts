import { getModelFaces, isModelFaceTransparent } from "../../../mapviewer/webgl/buffer/SceneBuffer";
import { Model } from "../../model/Model";
import { ModelData } from "../../model/ModelData";
import { ModelLoader } from "../../model/ModelLoader";
import { SeqFrameLoader } from "../../model/seq/SeqFrameLoader";
import { SkeletalSeqLoader } from "../../model/skeletal/SkeletalSeqLoader";
import { TextureLoader } from "../../texture/TextureLoader";
import { SeqType } from "../seqtype/SeqType";
import { SeqTypeLoader } from "../seqtype/SeqTypeLoader";
import { LocModelType } from "./LocModelType";
import { MODEL_SIMPLIFY } from "./LocOverrides";
import { LocType } from "./LocType";
import { LocTypeLoader } from "./LocTypeLoader";

export type ContourGroundInfo = {
    type: number;
    param: number;
    heightMap: Int32Array[];
    heightMapAbove: Int32Array[] | undefined;
    entityX: number;
    entityY: number;
    entityZ: number;
};

// A burnt loc's colours (LocType.charred): each face's lightness to CHAR_LIGHT of what it was and
// its colour gone (saturation 0), so wood goes near black, stone a dark grey and paint (a
// stall's awning) soot. Textured faces are lit, not coloured: see charColours.
const CHAR_LIGHT = 0.42;

export function charColour(hsl: number, light = CHAR_LIGHT): number {
    const hue = (hsl >> 10) & 63;
    const saturation = (hsl >> 7) & 7;
    const lightness = hsl & 127;
    return (hue << 10) | ((saturation >> 3) << 7) | Math.max(2, Math.round(lightness * light));
}

// A textured face is lit, not coloured, so a burnt one takes a dark texture instead: wood and
// anything coloured the darkest planks (5), stone and anything grey a dark cobbled rock (119).
// See-through textures keep their holes, so they'd go solid if swapped for one of those: green
// leaves are swapped for scorched brown ones (33) instead, and the rest (bars, shingles) kept.
const CHAR_WOOD_TEXTURE = 5;
const CHAR_STONE_TEXTURE = 119;
const CHAR_LEAVES_TEXTURE = 33;
// Hues from yellow-green to green (HSL hue 0 to 63)
const isGreen = (hsl: number) => {
    const hue = (hsl >> 10) & 63;
    return hue >= 8 && hue <= 22 && ((hsl >> 7) & 7) >= 1;
};

function charColours(model: ModelData, textures: TextureLoader, light?: number): void {
    const colours = model.faceColors;
    for (let i = 0; i < model.faceCount; i++) {
        colours[i] = charColour(colours[i], light);
    }
    const faceTextures = model.faceTextures;
    if (!faceTextures) {
        return;
    }
    for (let i = 0; i < model.faceCount; i++) {
        const texture = faceTextures[i];
        if (texture === -1) {
            continue;
        }
        if (textures.isTransparent(texture)) {
            if (isGreen(textures.getAverageHsl(texture))) {
                faceTextures[i] = CHAR_LEAVES_TEXTURE;
            }
            continue;
        }
        const saturation = (textures.getAverageHsl(texture) >> 7) & 7;
        faceTextures[i] = saturation >= 2 ? CHAR_WOOD_TEXTURE : CHAR_STONE_TEXTURE;
    }
}

export class LocModelLoader {
    static mergeLocModelsCache: ModelData[] = new Array(4);

    modelDataCache: Map<number, ModelData>;
    entityCache: Map<number, Model | ModelData>;
    modelCache: Map<number, Model>;

    constructor(
        readonly locTypeLoader: LocTypeLoader,
        readonly modelLoader: ModelLoader,
        readonly textureLoader: TextureLoader,
        readonly seqTypeLoader: SeqTypeLoader,
        readonly seqFrameLoader: SeqFrameLoader,
        readonly skeletalSeqLoader: SkeletalSeqLoader | undefined,
    ) {
        this.modelDataCache = new Map();
        this.entityCache = new Map();
        this.modelCache = new Map();
    }

    getModelData(id: number, mirrored: boolean): ModelData | undefined {
        let key = id;
        if (mirrored) {
            key += 0x10000;
        }
        let model = this.modelDataCache.get(key);
        if (!model) {
            model = this.modelLoader.getModel(id);
            if (model) {
                const simplify = MODEL_SIMPLIFY.get(id);
                if (simplify) {
                    model.simplify(simplify.keep, simplify.seams);
                }
                if (mirrored) {
                    model.mirror();
                }
                this.modelDataCache.set(key, model);
            }
        }

        return model;
    }

    getLocModelData(locType: LocType, type: LocModelType, rotation: number): ModelData | undefined {
        let model: ModelData | undefined;
        const isMirrored = locType.isRotated || (type === LocModelType.WALL_CORNER && rotation > 3);
        if (!locType.types) {
            if (type !== LocModelType.NORMAL) {
                return undefined;
            }

            if (!locType.models || locType.models.length === 0) {
                return undefined;
            }

            // const isMirrored = locType.isRotated;

            const modelCount = locType.models[0].length;

            for (let i = 0; i < modelCount; i++) {
                const modelId = locType.models[0][i];

                model = this.getModelData(modelId, isMirrored);
                if (!model) {
                    return undefined;
                }

                if (modelCount > 1) {
                    LocModelLoader.mergeLocModelsCache[i] = model;
                }
            }

            if (modelCount > 1) {
                model = ModelData.merge(LocModelLoader.mergeLocModelsCache, modelCount);
            }
        } else {
            let index = -1;

            for (let i = 0; i < locType.types.length; i++) {
                if (locType.types[i] === type) {
                    index = i;
                    break;
                }
            }

            if (index === -1) {
                return undefined;
            }

            // const isMirrored = locType.isRotated !== rotation > 3;

            const modelIds = locType.models[index];
            const modelCount = modelIds.length;
            for (let i = 0; i < modelCount; i++) {
                const modelId = modelIds[i];

                model = this.getModelData(modelId, isMirrored);
                if (!model) {
                    return undefined;
                }

                if (modelCount > 1) {
                    LocModelLoader.mergeLocModelsCache[i] = model;
                }
            }

            if (modelCount > 1) {
                model = ModelData.merge(LocModelLoader.mergeLocModelsCache, modelCount);
            }
        }

        if (!model) {
            return undefined;
        }

        const hasResize =
            locType.modelSizeX !== 128 ||
            locType.modelSizeHeight !== 128 ||
            locType.modelSizeY !== 128;

        const hasOffset =
            locType.offsetX !== 0 || locType.offsetHeight !== 0 || locType.offsetY !== 0;

        const copy = ModelData.copyFrom(
            model,
            true,
            rotation === 0 && !hasResize && !hasOffset,
            !locType.recolorFrom && !locType.charred,
            false,
        );

        if (type === LocModelType.WALL_DECORATION_INSIDE && rotation > 3) {
            copy.rotate(256);
            copy.translate(45, 0, -45);
        }

        rotation &= 3;
        if (rotation === 1) {
            copy.rotate90();
        } else if (rotation === 2) {
            copy.rotate180();
        } else if (rotation === 3) {
            copy.rotate270();
        }

        if (locType.recolorFrom) {
            const retexture =
                locType.cacheInfo.game === "runescape" && locType.cacheInfo.revision <= 464;
            for (let i = 0; i < locType.recolorFrom.length; i++) {
                copy.recolor(locType.recolorFrom[i], locType.recolorTo[i]);
                if (retexture) {
                    copy.retexture(locType.recolorFrom[i], locType.recolorTo[i]);
                }
            }
        }

        if (locType.retextureFrom) {
            for (let i = 0; i < locType.retextureFrom.length; i++) {
                copy.retexture(locType.retextureFrom[i], locType.retextureTo[i]);
            }
        }

        if (locType.charred) {
            charColours(copy, this.textureLoader, locType.charLight);
        }

        if (hasResize) {
            copy.resize(locType.modelSizeX, locType.modelSizeHeight, locType.modelSizeY);
        }

        if (hasOffset) {
            copy.translate(locType.offsetX, locType.offsetHeight, locType.offsetY);
        }

        return copy;
    }

    getModel(
        locType: LocType,
        type: LocModelType,
        rotation: number,
        contourGroundInfo?: ContourGroundInfo,
    ): Model | ModelData | undefined {
        let key: number;
        if (locType.types) {
            key = rotation + (type << 3) + (locType.id << 10);
        } else {
            key = rotation + (locType.id << 10);
        }

        let model = this.entityCache.get(key);
        if (!model) {
            const modelData = this.getLocModelData(locType, type, rotation);
            if (!modelData) {
                return undefined;
            }

            const isDiagonal = type === LocModelType.NORMAL && rotation > 3;
            if (isDiagonal) {
                modelData.rotate(256);
            }

            if (!locType.mergeNormals) {
                model = modelData.light(
                    this.textureLoader,
                    locType.ambient + 64,
                    locType.contrast + 768,
                    -50,
                    -10,
                    -50,
                );
            } else {
                let ambient = 64;
                let constrast = 768;
                const ignoreLocLighting =
                    locType.cacheInfo.game === "runescape" && locType.cacheInfo.revision <= 445;
                if (!ignoreLocLighting) {
                    ambient += locType.ambient;
                    constrast += locType.contrast;
                }
                modelData.ambient = ambient;
                modelData.contrast = constrast;
                modelData.calculateVertexNormals();

                model = modelData;
            }

            this.entityCache.set(key, model);
        }

        if (locType.mergeNormals) {
            model = (model as ModelData).copy();
        }

        if (locType.contourGroundType !== 0 && contourGroundInfo) {
            model = model.contourGround(
                contourGroundInfo.type,
                contourGroundInfo.param,
                contourGroundInfo.heightMap,
                contourGroundInfo.heightMapAbove,
                contourGroundInfo.entityX,
                contourGroundInfo.entityY,
                contourGroundInfo.entityZ,
            );
        }

        return model;
    }

    getModelAnimated(
        locType: LocType,
        type: LocModelType,
        rotation: number,
        seqId: number,
        frame: number,
        contourGroundInfo?: ContourGroundInfo,
    ): Model | undefined {
        let key: number;
        if (locType.types) {
            key = rotation + (type << 3) + (locType.id << 10);
        } else {
            key = rotation + (locType.id << 10);
        }

        let model = this.modelCache.get(key);
        if (!model) {
            const modelData = this.getLocModelData(locType, type, rotation);
            if (!modelData) {
                return undefined;
            }

            model = modelData.light(
                this.textureLoader,
                locType.ambient + 64,
                locType.contrast + 768,
                -50,
                -10,
                -50,
            );

            this.modelCache.set(key, model);
        }

        if (seqId !== -1 && frame !== -1) {
            const seqType = this.seqTypeLoader.load(seqId);
            model = this.transformModel(model, seqType, frame, rotation);
        }

        const isDiagonal = type === LocModelType.NORMAL && rotation > 3;
        if (isDiagonal) {
            model.rotate(256);
        }

        if (locType.contourGroundType !== 0 && contourGroundInfo) {
            model = model.contourGround(
                contourGroundInfo.type,
                contourGroundInfo.param,
                contourGroundInfo.heightMap,
                contourGroundInfo.heightMapAbove,
                contourGroundInfo.entityX,
                contourGroundInfo.entityY,
                contourGroundInfo.entityZ,
            );
        }

        return model;
    }

    transformModel(model: Model, seqType: SeqType, frame: number, rotation: number): Model {
        if (seqType.isSkeletalSeq()) {
            const skeletalSeq = this.skeletalSeqLoader?.load(seqType.skeletalId);
            if (!skeletalSeq) {
                return Model.copyAnimated(model, true, true);
            }
            model = Model.copyAnimated(model, !skeletalSeq.hasAlphaTransform, true);

            rotation &= 3;
            if (rotation === 1) {
                model.rotate270();
            } else if (rotation === 2) {
                model.rotate180();
            } else if (rotation === 3) {
                model.rotate90();
            }

            model.animateSkeletal(skeletalSeq, frame);

            if (rotation === 1) {
                model.rotate90();
            } else if (rotation === 2) {
                model.rotate180();
            } else if (rotation === 3) {
                model.rotate270();
            }

            return model;
        } else {
            if (!seqType.frameIds || seqType.frameIds.length === 0) {
                return model;
            }

            const seqFrame = this.seqFrameLoader.load(seqType.frameIds[frame]);

            if (seqFrame) {
                model = Model.copyAnimated(
                    model,
                    !seqFrame.hasAlphaTransform,
                    !seqFrame.hasColorTransform,
                );

                rotation &= 3;
                if (rotation === 1) {
                    model.rotate270();
                } else if (rotation === 2) {
                    model.rotate180();
                } else if (rotation === 3) {
                    model.rotate90();
                }

                model.animate(seqFrame, undefined, seqType.op14);

                if (rotation === 1) {
                    model.rotate90();
                } else if (rotation === 2) {
                    model.rotate180();
                } else if (rotation === 3) {
                    model.rotate270();
                }
            }

            return model;
        }
    }

    clearCache() {
        this.modelDataCache.clear();
        this.entityCache.clear();
        this.modelCache.clear();
    }
}
