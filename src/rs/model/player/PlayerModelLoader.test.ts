import { afterEach, describe, expect, it, vi } from "vitest";

import { IdkTypeLoader } from "../../config/idktype/IdkTypeLoader";
import { ObjType } from "../../config/objtype/ObjType";
import { ObjTypeLoader } from "../../config/objtype/ObjTypeLoader";
import { SeqTypeLoader } from "../../config/seqtype/SeqTypeLoader";
import { TextureLoader } from "../../texture/TextureLoader";
import { Model } from "../Model";
import { ModelData } from "../ModelData";
import { SeqModelAnimator } from "../seq/SeqModelAnimator";
import {
    EquipSlot,
    PlayerModelLoader,
    createAppearance,
    getBodyColorHsl,
} from "./PlayerModelLoader";

const SKIN = 4550;
const LEGS_COLOUR = 25238;
const SKIN_PART = 4;
const GREEN_SKIN = 8;

const KIT_MODEL = 1;
// Dragon plateskirt (cr)'s, on body type A, and the Zombie helmet's, on body type B
const PLATESKIRT_CR_A = 47964;
const ZOMBIE_HELMET_B = 55498;

// A model of one triangle per colour
function model(colors: number[]): ModelData {
    const data = new ModelData();
    data.verticesCount = 3;
    data.verticesX = Int32Array.from([0, 10, 0]);
    data.verticesY = Int32Array.from([0, 0, 10]);
    data.verticesZ = Int32Array.from([0, 0, 0]);
    data.faceCount = colors.length;
    data.indices1 = new Int32Array(colors.length);
    data.indices2 = new Int32Array(colors.length).fill(1);
    data.indices3 = new Int32Array(colors.length).fill(2);
    data.faceColors = Uint16Array.from(colors);
    data.textureFaceCount = 0;
    return data;
}

// An item that wears this model on body type A and that one on body type B
function item(male: number, female: number): ObjType {
    return {
        maleModel: male,
        maleModel1: -1,
        maleModel2: -1,
        femaleModel: female,
        femaleModel1: -1,
        femaleModel2: -1,
        maleOffset: 0,
        femaleOffset: 0,
        op14: -1,
        op27: -1,
    } as ObjType;
}

// Models in these colours, by id; every kit is KIT_MODEL, and every item the one given
function loader(colors: Record<number, number[]>, worn = item(-1, -1)): PlayerModelLoader {
    return new PlayerModelLoader(
        { load: () => ({ modelIds: [KIT_MODEL] }) } as unknown as IdkTypeLoader,
        { load: () => worn } as unknown as ObjTypeLoader,
        { getModel: (id) => model(colors[id] ?? []) },
        undefined as unknown as TextureLoader,
        undefined as unknown as SeqTypeLoader,
        undefined as unknown as SeqModelAnimator,
    );
}

// How many faces of each colour the model a look is built from has, before it's lit: body type
// A's six kits beside the legs, and the item on the legs
function mergedColors(players: PlayerModelLoader, skin: number): Record<number, number> {
    let merged: ModelData | undefined;
    vi.spyOn(ModelData.prototype, "light").mockImplementation(function (this: ModelData) {
        merged = this;
        return {} as Model;
    });
    const appearance = createAppearance({ [EquipSlot.LEGS]: 1 });
    appearance.colors[SKIN_PART] = skin;
    players.getBaseModel(appearance);
    const counts: Record<number, number> = {};
    for (const color of merged?.faceColors ?? []) {
        counts[color] = (counts[color] ?? 0) + 1;
    }
    return counts;
}

describe("PlayerModelLoader", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("gives the skin picked to skin a model paints a shade off (Dragon plateskirt (cr)'s legs)", () => {
        const players = loader(
            { [KIT_MODEL]: [SKIN], [PLATESKIRT_CR_A]: [4548, 4548, SKIN, LEGS_COLOUR] },
            item(PLATESKIRT_CR_A, -1),
        );
        expect(mergedColors(players, GREEN_SKIN)).toEqual({
            [getBodyColorHsl(SKIN_PART, GREEN_SKIN)]: 6 + 3,
            [LEGS_COLOUR]: 1,
        });
    });

    it("paints it the default skin with the default skin picked", () => {
        const players = loader(
            { [KIT_MODEL]: [SKIN], [PLATESKIRT_CR_A]: [4548] },
            item(PLATESKIRT_CR_A, -1),
        );
        expect(mergedColors(players, 0)).toEqual({ [SKIN]: 6 + 1 });
    });

    it("goes by the body's model", () => {
        const players = loader({ [ZOMBIE_HELMET_B]: [4544, 4548], [PLATESKIRT_CR_A]: [4544] });
        const helmet = item(PLATESKIRT_CR_A, ZOMBIE_HELMET_B);
        expect(Array.from(players.getWornModel(helmet, true)?.faceColors ?? [])).toEqual([
            SKIN,
            4548,
        ]);
        expect(Array.from(players.getWornModel(helmet, false)?.faceColors ?? [])).toEqual([4544]);
    });

    it("leaves the shade alone on any other model (the Camel mask's fur)", () => {
        const players = loader({ 2: [4544, 4548, 4678, SKIN] });
        expect(Array.from(players.getWornModel(item(2, 2), false)?.faceColors ?? [])).toEqual([
            4544,
            4548,
            4678,
            SKIN,
        ]);
    });
});
