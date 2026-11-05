import { describe, expect, it } from "vitest";

import { createSave } from "../core/save";
import { REWARD_MAPS, getRewards } from "./collectionLog";
import { TROPHIES } from "./trophies";

describe("the Collection log's rewards", () => {
    it("has a tab for each map with trophies, the Theatre of Blood's as well as the Hallowed Night's", () => {
        expect(REWARD_MAPS).toContain("halloween");
        expect(REWARD_MAPS).toContain("theatre_of_blood");
    });

    it("lists every trophy once, under its own map", () => {
        const save = createSave();
        const listed = REWARD_MAPS.flatMap((mapId) => getRewards(save, mapId).map((r) => r.id));
        for (const trophy of TROPHIES) {
            expect(listed.filter((id) => id === trophy.id)).toHaveLength(1);
        }
        // The Theatre's aren't under the Hallowed Night
        const halloween = getRewards(save, "halloween").map((r) => r.id);
        expect(halloween).not.toContain("ghrazi_rapier");
        expect(halloween).not.toContain("lil_zik");
    });

    it("lists the weapons a map brings in: the Theatre's chest's, the Nightmare's", () => {
        const save = createSave();
        const theatre = getRewards(save, "theatre_of_blood").map((r) => r.id);
        expect(theatre).toContain("holy_scythe_of_vitur");
        // The rapier's its own trophy: there once
        expect(theatre.filter((id) => id === "ghrazi_rapier")).toHaveLength(1);
        const halloween = getRewards(save, "halloween").map((r) => r.id);
        expect(halloween).toEqual(
            expect.arrayContaining(["inquisitors_mace", "volatile_nightmare_staff"]),
        );
    });
});
