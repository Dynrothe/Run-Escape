import { describe, expect, it } from "vitest";

import { CAMPAIGN_MAPS, isCoopMap } from "../../content/maps";
import { BENEATH_CURSED_SANDS } from "./tombsOfAmascut";

// The quest's fights are played on your own, as OSRS's quest is
describe("Beneath Cursed Sands", () => {
    it("is never a co-op room's map", () => {
        expect(isCoopMap(BENEATH_CURSED_SANDS)).toBe(false);
    });

    it("leaves every campaign map open to co-op", () => {
        expect(CAMPAIGN_MAPS.every(isCoopMap)).toBe(true);
    });
});
