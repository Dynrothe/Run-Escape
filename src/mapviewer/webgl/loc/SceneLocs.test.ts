import { describe, expect, test } from "vitest";

import { LocModelType } from "../../../rs/config/loctype/LocModelType";
import { LocTypeLoader } from "../../../rs/config/loctype/LocTypeLoader";
import { Model } from "../../../rs/model/Model";
import { Loc } from "../../../rs/scene/Loc";
import { Scene } from "../../../rs/scene/Scene";
import { SceneTile } from "../../../rs/scene/SceneTile";
import { EntityType, calculateEntityTag } from "../../../rs/scene/entity/EntityTag";
import { getLocLeftOut, getSceneLocs } from "./SceneLocs";

const BORDER = 6;
const BUSH = 1124;
const STATUE = 5791;

// Only what isLowDetail and createSceneModel read
const locTypes = {
    load: () => ({ isInteractive: 0, clipType: 0, obstructsGround: false, contourGroundType: 0 }),
} as unknown as LocTypeLoader;

function placeLoc(scene: Scene, x: number, y: number, id: number): void {
    const tile = (scene.tiles[0][x][y] ??= new SceneTile(0, x, y));
    const tag = calculateEntityTag(x, y, EntityType.LOC, true, id);
    tile.locs.push(
        new Loc(
            tag,
            LocModelType.NORMAL,
            0,
            x * 128 + 64,
            y * 128 + 64,
            0,
            new Model(),
            0,
            x,
            y,
            x,
            y,
        ),
    );
}

describe("getSceneLocs", () => {
    test("leaves out a hidden loc, by the world tile it's on and its id", () => {
        const size = Scene.MAP_SQUARE_SIZE + BORDER * 2;
        const scene = new Scene(1, size, size);
        // The square's at world 3200, 3200 (Lumbridge's), its scene from 6 tiles before
        const baseX = 3200 - BORDER;
        const baseY = 3200 - BORDER;
        placeLoc(scene, 3218 - baseX, 3217 - baseY, BUSH);
        placeLoc(scene, 3218 - baseX, 3217 - baseY, STATUE);
        placeLoc(scene, 3219 - baseX, 3217 - baseY, BUSH);

        const drawn = (hidden?: number[]) =>
            getSceneLocs(
                locTypes,
                scene,
                BORDER,
                0,
                0,
                getLocLeftOut(hidden, baseX, baseY),
            ).locs.map((loc) => `${loc.interactId}@${loc.sceneX >> 7}`);
        const all = drawn();
        expect(all).toHaveLength(3);
        // Drawn by where they are in the square: the bush at 3218 is 18 tiles in
        expect(drawn([3218, 3217, BUSH])).toEqual(all.filter((loc) => loc !== `${BUSH}@18`));
        // Another id on its tile, or its id on another tile, isn't it
        expect(drawn([3218, 3217, BUSH + 1, 3220, 3217, BUSH])).toEqual(all);
    });

    test("leaves out nothing without hidden locs", () => {
        expect(getLocLeftOut(undefined, 0, 0)).toBeUndefined();
        expect(getLocLeftOut([], 0, 0)).toBeUndefined();
    });
});
