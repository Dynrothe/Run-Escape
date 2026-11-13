import { describe, expect, it } from "vitest";

import { emptyStats } from "../content/types";
import { Sim } from "../core/Sim";
import { makeGrid } from "../core/world/testGrid";
import { getChestView } from "./ItemViews";

function createSim(): Sim {
    const rows = Array.from({ length: 20 }, () => ".".repeat(20));
    return new Sim({
        grid: makeGrid(rows, 1000, 1000),
        mapId: "lumbridge",
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1010.5,
        spawnY: 1010.5,
    });
}

// A casket with this item in it, at the front of the queue
function offer(sim: Sim, itemId: string): void {
    sim.openCasket("elite");
    sim.chests[0].itemId = itemId;
    sim.chests[0].upgradedFrom = undefined;
    sim.chests[0].upgrades = 0;
}

describe("getChestView", () => {
    it("shows the worn piece, its set as it's worn now, and a row for each stat", () => {
        const sim = createSim();
        sim.equip("crystal_helm");
        sim.equip("crystal_legs");
        sim.equip("crystal_body");
        offer(sim, "torva_platebody");
        const chest = getChestView(sim)!;
        const worn = chest.replaces!;
        expect(worn.item.id).toBe("crystal_body");
        expect(worn.item.set).toMatchObject({ active: true });
        expect(worn.item.set!.text).toContain("3/3");
        // The found piece's set, counted as it would be with it on
        expect(chest.item.set!.text).toContain("1/3");
        expect(worn.alchCoins).toBe(sim.alchValue("crystal_body", 0));
        // Crystal body: damage, projectile speed, movement speed. Torva: armour, hitpoints.
        expect(worn.stats.map((pair) => [pair.key, pair.worn, pair.found])).toEqual([
            ["might", "+5%", undefined],
            ["armor", undefined, "+1.5"],
            ["maxHp", undefined, "+10%"],
            ["speed", "+15%", undefined],
            ["moveSpeed", "+3%", undefined],
        ]);
    });

    it("has nothing to compare against an empty slot or a utility item", () => {
        const sim = createSim();
        offer(sim, "dharoks_platebody");
        expect(getChestView(sim)!.replaces).toBeUndefined();
        sim.resolveChest("alch");
        offer(sim, "shark");
        expect(getChestView(sim)!.replaces).toBeUndefined();
    });
});
