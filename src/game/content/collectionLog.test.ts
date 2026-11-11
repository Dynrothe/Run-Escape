import { describe, expect, it } from "vitest";

import { createSave } from "../core/save";
import { REWARD_MAPS, getRewards } from "./collectionLog";
import { TROPHIES } from "./trophies";

describe("the Collection log's rewards", () => {
    it("has a tab for each map with trophies, the Theatre of Blood's as well as the Hallowed Night's", () => {
        expect(REWARD_MAPS).toContain("halloween");
        expect(REWARD_MAPS).toContain("theatre_of_blood");
        expect(REWARD_MAPS).toContain("thanksgiving");
    });

    it("lists every trophy once, under its own map", () => {
        const save = createSave();
        const listed = REWARD_MAPS.flatMap((mapId) => getRewards(save, mapId).map((r) => r.id));
        for (const trophy of TROPHIES) {
            expect(listed.filter((id) => id === trophy.id)).toHaveLength(1);
        }
        // The Tombs of Amascut's chest's, under the raid
        expect(getRewards(save, "tombs_of_amascut").map((r) => r.id)).toContain("tumekens_shadow");
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

    it("has a tab for a boss fight that brings in a weapon, with no trophy: Phosani's staff", () => {
        expect(REWARD_MAPS).toContain("phosani");
        expect(getRewards(createSave(), "phosani").map((r) => r.id)).toContain("nightmare_staff");
    });

    it("lists Thanksgiving's collection rewards with accurate sources", () => {
        const rewards = getRewards(createSave(), "thanksgiving");
        const ids = rewards.map(({ id }) => id);
        const trophy = (id: string) => TROPHIES.find((entry) => entry.id === id)!;

        expect(ids).toHaveLength(8);
        expect(ids).toEqual(
            expect.arrayContaining([
                "rubber_chicken",
                "chompy_bird_bow",
                "magic_secateurs",
                "golden_feather",
                "chompy_hat",
                "ledger_of_the_harvest",
                "chompy_chick",
                "golden_egg",
            ]),
        );
        expect(trophy("rubber_chicken").from).toMatchObject({
            kind: "enemy",
            enemyId: "chompy_bird",
            mapId: "thanksgiving",
            chance: 1 / 200,
        });
        expect(trophy("chompy_bird_bow").from).toMatchObject({
            kind: "enemy",
            enemyId: "chompy_bird",
            mapId: "thanksgiving",
            chance: 1 / 400,
        });
        expect(trophy("magic_secateurs").from).toEqual({ kind: "turkey", chance: 1 / 5 });
        expect(trophy("golden_feather").from).toMatchObject({
            kind: "enemy",
            enemyId: "chompy_bird",
            mapId: "thanksgiving",
            chance: 1 / 1000,
        });
        expect(trophy("chompy_chick").from).toMatchObject({
            kind: "quest",
            questId: "thanksgiving_chompy_hunt",
            mapId: "thanksgiving",
        });
        expect(trophy("chompy_chick").how).toBe("Chompy Slayer - Completion required to unlock");
        expect(trophy("golden_egg")).toMatchObject({
            name: "Golden Egg",
            objId: 28663,
            from: {
                kind: "map",
                mapId: "thanksgiving",
                requiresBoss: "freaky_forester_final",
                hard: true,
            },
        });
        expect(trophy("chompy_hat").from).toMatchObject({
            kind: "map",
            mapId: "thanksgiving",
            requiresBoss: "evil_chicken",
        });
        expect(trophy("ledger_of_the_harvest").from).toMatchObject({
            kind: "map",
            mapId: "thanksgiving",
            requiresBoss: "freaky_forester_final",
        });
        expect(trophy("chompy_bird_bow")).toMatchObject({
            name: "Turkey hat",
            objId: 28620,
            how: "A rare drop from a Chompy Bird.",
        });
        for (const reward of rewards) {
            expect(reward.how).not.toMatch(/\b1 in\b/);
        }
    });
});
