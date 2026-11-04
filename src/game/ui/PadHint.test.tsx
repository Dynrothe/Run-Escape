import { describe, expect, it } from "vitest";

import { PAD } from "../client/GamePad";
import { PAD_ICONS } from "./PadHint";

describe("PAD_ICONS", () => {
    it("has every button and the stick for each make, in the bundle", () => {
        for (const make of ["xbox", "playstation", "nintendo"]) {
            for (const icon of [...Object.keys(PAD), "move"]) {
                expect(PAD_ICONS[`${make}/${icon}`], `${make}/${icon}`).toMatch(
                    /^data:image\/svg\+xml,/,
                );
            }
        }
    });
});
