import { IdkTypeLoader } from "../../config/idktype/IdkTypeLoader";
import { ObjType } from "../../config/objtype/ObjType";
import { ObjTypeLoader } from "../../config/objtype/ObjTypeLoader";
import { SeqTypeLoader } from "../../config/seqtype/SeqTypeLoader";
import { TextureLoader } from "../../texture/TextureLoader";
import { Model } from "../Model";
import { ModelData } from "../ModelData";
import { ModelLoader } from "../ModelLoader";
import { SeqModelAnimator } from "../seq/SeqModelAnimator";

// Equipment slots, as the client numbers them
export enum EquipSlot {
    HEAD = 0,
    CAPE = 1,
    AMULET = 2,
    WEAPON = 3,
    TORSO = 4,
    SHIELD = 5,
    ARMS = 6,
    LEGS = 7,
    HAIR = 8,
    HANDS = 9,
    FEET = 10,
    JAW = 11,
}

export const EQUIP_SLOT_COUNT = 12;

// Identity kit body parts (hair, jaw, torso, arms, hands, legs, feet) and the
// slot each one fills when nothing is worn over it
const BODY_PART_SLOTS = [
    EquipSlot.HAIR,
    EquipSlot.JAW,
    EquipSlot.TORSO,
    EquipSlot.ARMS,
    EquipSlot.HANDS,
    EquipSlot.LEGS,
    EquipSlot.FEET,
];

// The default male look from character creation
export const DEFAULT_MALE_KITS = [0, 10, 18, 26, 33, 36, 42];

// Body colours: hair, torso, legs, feet, skin. Each player colour index picks a
// replacement for the first colour in its row (index 0 keeps the original).
// From the client's player appearance tables.
const BODY_COLOR_SOURCE = [6798, 8741, 25238, 4626, 4550];
const BODY_COLORS: number[][] = [
    [
        6798, 107, 10283, 16, 4797, 7744, 5799, 4634, -31839, 22433, 2983, -11343, 8, 5281, 10438,
        3650, -27322, -21845, 200, 571, 908, 21830, 28946, -15701, -14010,
    ],
    [
        8741, 12, -1506, -22374, 7735, 8404, 1701, -27106, 24094, 10153, -8915, 4783, 1341, 16578,
        -30533, 25239, 8, 5281, 10438, 3650, -27322, -21845, 200, 571, 908, 21830, 28946, -15701,
        -14010,
    ],
    [
        25238, 8742, 12, -1506, -22374, 7735, 8404, 1701, -27106, 24094, 10153, -8915, 4783, 1341,
        16578, -30533, 8, 5281, 10438, 3650, -27322, -21845, 200, 571, 908, 21830, 28946, -15701,
        -14010,
    ],
    [4626, 11146, 6439, 12, 4758, 10270],
    [4550, 4537, 5681, 5673, 5790, 6806, 8076, 4574, 17050, 0, 127, -31821, -17991],
];

export type PlayerAppearance = {
    female: boolean;
    // Kit per body part (7), -1 for none
    kits: number[];
    // Colour index per body colour (5)
    colors: number[];
    // Worn item per equipment slot (12), -1 for none
    equipment: number[];
};

export function getAppearanceKey(appearance: PlayerAppearance): string {
    return [
        appearance.female ? 1 : 0,
        appearance.kits.join(","),
        appearance.colors.join(","),
        appearance.equipment.join(","),
    ].join("|");
}

export function createAppearance(
    equipment: Partial<Record<EquipSlot, number>> = {},
): PlayerAppearance {
    const slots = new Array<number>(EQUIP_SLOT_COUNT).fill(-1);
    for (const [slot, objId] of Object.entries(equipment)) {
        slots[Number(slot)] = objId as number;
    }
    return {
        female: false,
        kits: DEFAULT_MALE_KITS.slice(),
        colors: [0, 0, 0, 0, 0],
        equipment: slots,
    };
}

// Builds player models the way the client does: worn items replace the body
// parts in their slot, items that cover other slots (a platebody's arms, a
// full helm's hair and jaw) hide those parts, and the merged model is
// recoloured with the player's body colours and lit like any player.
export class PlayerModelLoader {
    modelCache = new Map<string, Model>();

    constructor(
        readonly idkTypeLoader: IdkTypeLoader,
        readonly objTypeLoader: ObjTypeLoader,
        readonly modelLoader: ModelLoader,
        readonly textureLoader: TextureLoader,
        readonly seqTypeLoader: SeqTypeLoader,
        readonly animator: SeqModelAnimator,
    ) {}

    getWornModel(objType: ObjType, female: boolean): ModelData | undefined {
        const ids = female
            ? [objType.femaleModel, objType.femaleModel1, objType.femaleModel2]
            : [objType.maleModel, objType.maleModel1, objType.maleModel2];
        if (ids[0] === -1) {
            return undefined;
        }
        const parts: ModelData[] = [];
        for (const id of ids) {
            if (id === -1) {
                continue;
            }
            const part = this.modelLoader.getModel(id);
            if (part) {
                parts.push(part);
            }
        }
        if (parts.length === 0) {
            return undefined;
        }
        const model = parts.length === 1 ? parts[0] : ModelData.merge(parts, parts.length);
        const offset = female ? objType.femaleOffset : objType.maleOffset;
        if (offset !== 0) {
            model.translate(0, offset, 0);
        }
        if (objType.recolorFrom) {
            for (let i = 0; i < objType.recolorFrom.length; i++) {
                model.recolor(objType.recolorFrom[i], objType.recolorTo[i]);
            }
        }
        if (objType.retextureFrom) {
            for (let i = 0; i < objType.retextureFrom.length; i++) {
                model.retexture(objType.retextureFrom[i], objType.retextureTo[i]);
            }
        }
        return model;
    }

    getKitModel(kitId: number): ModelData | undefined {
        const kit = this.idkTypeLoader.load(kitId);
        if (!kit.modelIds || kit.modelIds.length === 0) {
            return undefined;
        }
        const parts: ModelData[] = [];
        for (const id of kit.modelIds) {
            const part = this.modelLoader.getModel(id);
            if (part) {
                parts.push(part);
            }
        }
        if (parts.length === 0) {
            return undefined;
        }
        const model = parts.length === 1 ? parts[0] : ModelData.merge(parts, parts.length);
        if (kit.recolorFrom) {
            for (let i = 0; i < kit.recolorFrom.length; i++) {
                model.recolor(kit.recolorFrom[i], kit.recolorTo[i]);
            }
        }
        if (kit.retextureFrom) {
            for (let i = 0; i < kit.retextureFrom.length; i++) {
                model.retexture(kit.retextureFrom[i], kit.retextureTo[i]);
            }
        }
        return model;
    }

    getBaseModel(appearance: PlayerAppearance): Model | undefined {
        const key = getAppearanceKey(appearance);
        const cached = this.modelCache.get(key);
        if (cached) {
            return cached;
        }

        const hidden = new Set<number>();
        const worn: (ObjType | undefined)[] = appearance.equipment.map((objId) =>
            objId !== -1 ? this.objTypeLoader.load(objId) : undefined,
        );
        for (const objType of worn) {
            if (!objType) {
                continue;
            }
            if (objType.op14 !== -1) {
                hidden.add(objType.op14);
            }
            if (objType.op27 !== -1) {
                hidden.add(objType.op27);
            }
        }

        const kitBySlot = new Map<number, number>();
        appearance.kits.forEach((kitId, bodyPart) => {
            if (kitId !== -1) {
                kitBySlot.set(BODY_PART_SLOTS[bodyPart], kitId);
            }
        });

        const parts: ModelData[] = [];
        for (let slot = 0; slot < EQUIP_SLOT_COUNT; slot++) {
            // A two-handed weapon leaves no hand for a shield. OSRS takes the
            // shield off when you wield one, but a look here can have both.
            if (slot === EquipSlot.SHIELD && hidden.has(slot)) {
                continue;
            }
            const objType = worn[slot];
            let part: ModelData | undefined;
            if (objType) {
                part = this.getWornModel(objType, appearance.female);
            } else if (!hidden.has(slot)) {
                const kitId = kitBySlot.get(slot);
                if (kitId !== undefined) {
                    part = this.getKitModel(kitId);
                }
            }
            if (part) {
                parts.push(part);
            }
        }
        if (parts.length === 0) {
            return undefined;
        }

        const merged = ModelData.merge(parts, parts.length);
        for (let i = 0; i < BODY_COLOR_SOURCE.length; i++) {
            const choices = BODY_COLORS[i];
            const color = appearance.colors[i] ?? 0;
            if (color > 0 && color < choices.length) {
                merged.recolor(BODY_COLOR_SOURCE[i], choices[color] & 0xffff);
            }
        }

        const model = merged.light(this.textureLoader, 64, 850, -30, -50, -30);
        this.modelCache.set(key, model);
        return model;
    }

    getModel(appearance: PlayerAppearance, seqId: number, frame: number): Model | undefined {
        const model = this.getBaseModel(appearance);
        if (!model) {
            return undefined;
        }
        if (seqId === -1 || frame === -1) {
            return model;
        }
        const seqType = this.seqTypeLoader.load(seqId);
        return this.animator.animate(model, seqType, frame);
    }

    clearCache(): void {
        this.modelCache.clear();
    }
}
