import { describe, expect, it } from "vitest";

import { CARDS } from "../content/cards";
import { getLogEntries, getLogTotal } from "../content/collectionLog";
import { CASKET_GEAR, CASKET_TIERS, getItem } from "../content/items";
import { Rarity } from "../content/rarity";
import { rollCasketItem } from "./Loot";
import { Rng } from "./Rng";
import { CardCaps } from "./Upgrades";
import {
    RunSummary,
    SaveData,
    createSave,
    exportSave,
    importSave,
    migrateSave,
    recordRun,
} from "./save";

// Many caskets' items, from one seed
function caskets(cards: CardCaps | undefined, seed = 11, rolls = 600): string[] {
    const rng = new Rng(seed);
    const ids: string[] = [];
    for (let i = 0; i < rolls; i++) {
        const tier = CASKET_TIERS[i % CASKET_TIERS.length];
        ids.push(
            rollCasketItem(
                rng,
                tier,
                0.5,
                {},
                false,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                false,
                undefined,
                cards,
            ),
        );
    }
    return ids;
}

const gearIds = new Set(CASKET_GEAR.map((gear) => gear.id));

describe("Card collection only caskets", () => {
    const owned = CASKET_GEAR.filter((_, i) => i % 9 === 0).slice(0, 6);
    const caps: CardCaps = new Map(owned.map((gear) => [`gear:${gear.id}`, gear.rarity as Rarity]));

    it("give only gear with a card, or a utility item", () => {
        const found = caskets(caps);
        const gear = found.filter((id) => gearIds.has(id));
        expect(gear.length).toBeGreaterThan(0);
        for (const id of gear) {
            expect(caps.has(`gear:${id}`), id).toBe(true);
        }
        // Without cards, far more gear turns up
        const usual = new Set(caskets(undefined).filter((id) => gearIds.has(id)));
        expect(usual.size).toBeGreaterThan(new Set(gear).size);
    });

    it("give only the carded gear there is, or utility items, whatever rarity's rolled", () => {
        // Only a Common piece: every roll that would be gear is that piece, or a utility item
        const common = CASKET_GEAR.find((gear) => gear.rarity === "common")!;
        const one: CardCaps = new Map([[`gear:${common.id}`, "veryRare" as Rarity]]);
        const found = caskets(one);
        expect(found).toContain(common.id);
        expect(found.every((id) => id === common.id || !gearIds.has(id))).toBe(true);
        // With no gear cards at all, only utility items
        expect(caskets(new Map()).every((id) => !gearIds.has(id))).toBe(true);
        expect(caskets(new Map()).every((id) => getItem(id).kind !== "gear")).toBe(true);
    });
});

describe("Card collection only caskets' rarities", () => {
    it("give carded gear at its own rarity, and a utility item at one with none", () => {
        const common = CASKET_GEAR.find((gear) => gear.rarity === "common")!;
        const rare = CASKET_GEAR.find((gear) => gear.rarity === "rare")!;
        const two: CardCaps = new Map([
            [`gear:${common.id}`, "common" as Rarity],
            [`gear:${rare.id}`, "rare" as Rarity],
        ]);
        // Many rolls: both pieces turn up and nothing else that's gear; an Uncommon or Very rare
        // roll, with no carded gear, gives a utility item of that rarity
        const found = caskets(two, 3, 2000);
        expect(new Set(found.filter((id) => gearIds.has(id)))).toEqual(
            new Set([common.id, rare.id]),
        );
        const utilities = found.filter((id) => !gearIds.has(id)).map((id) => getItem(id).rarity);
        expect(utilities).toContain("uncommon");
    });
});

describe("the Collection log's Cards tab", () => {
    it("lists a set for each kind of card and the raids' finds, each card at its best version", () => {
        const save = {
            ...createSave(),
            cards: { "weapon:scimitar": 2, "weapon:scimitar@rare": 1, "trophy:scythe": 1 },
        };
        const tab = getLogEntries(save).filter((entry) => entry.tab === "cards");
        expect(tab.map((entry) => entry.id)).toEqual([
            "cards_weapon",
            "cards_passive",
            "cards_gear",
            "cards_trophy",
            "cards_raids",
        ]);
        const weapons = tab.find((entry) => entry.id === "cards_weapon")!;
        const scimitar = weapons.items.find((item) => item.id === "weapon:scimitar")!;
        expect(scimitar.found).toBe(true);
        expect(scimitar.version).toBe("rare");
        expect(scimitar.how).toContain("Rare");
        expect(weapons.items.filter((item) => item.found)).toHaveLength(1);
        expect(tab.find((entry) => entry.id === "cards_raids")!.items.length).toBeGreaterThan(0);
    });

    it("keeps cards out of the log's title total, which counts the game's own finds", () => {
        const save = createSave();
        const before = getLogTotal(getLogEntries(save));
        const withCard = getLogTotal(
            getLogEntries({ ...save, cards: { "trophy:jar_of_dreams": 1 } }),
        );
        expect(withCard).toEqual(before);
        const items = getLogEntries(save)
            .filter((entry) => entry.tab !== "cards")
            .flatMap((entry) => entry.items.map((item) => item.key));
        expect(before.total).toBe(new Set(items).size);
        const cardKeys = getLogEntries(save)
            .filter((entry) => entry.tab === "cards")
            .flatMap((entry) => entry.items.map((item) => item.key));
        expect(new Set(cardKeys).size).toBe(CARDS.length);
    });
});

describe("trophies first found in a Card collection only run", () => {
    const run = (trophies: string[], cardsOnly?: boolean): RunSummary => ({
        mapId: "halloween",
        victory: false,
        seconds: 300,
        level: 20,
        kills: 900,
        coins: 0,
        bossesKilled: [],
        trophies,
        ...(cardsOnly && { cardsOnly }),
    });
    const logItem = (save: SaveData, id: string) =>
        getLogEntries(save)
            .flatMap((entry) => entry.items)
            .find((item) => item.id === id && item.key.startsWith("halloween:"))!;

    it("are marked in the log, and a normal run's aren't", () => {
        const save = createSave();
        recordRun(save, run(["jar_of_dreams"], true));
        recordRun(save, run(["little_nightmare"]));
        expect(save.cardsOnlyFinds).toEqual(["jar_of_dreams"]);
        expect(logItem(save, "jar_of_dreams").cardsOnly).toBe(true);
        expect(logItem(save, "little_nightmare").cardsOnly).toBeUndefined();
        // Both count in the one log, as any find does
        expect(logItem(save, "little_nightmare").found).toBe(true);
    });

    it("are only the run's own finds, not a quest's caught up as it's recorded", () => {
        const save = createSave();
        // A quest's trophy given in the same recordRun isn't the run's find
        recordRun(save, { ...run(["jar_of_dreams"], true), trophies: ["jar_of_dreams"] });
        save.trophies.push("little_nightmare");
        recordRun(save, run([], true));
        expect(save.cardsOnlyFinds).toEqual(["jar_of_dreams"]);
    });

    it("stay as they were when found again", () => {
        const save = createSave();
        recordRun(save, run(["little_nightmare"]));
        recordRun(save, run(["little_nightmare", "jar_of_dreams"], true));
        recordRun(save, run(["jar_of_dreams"], true));
        expect(save.cardsOnlyFinds).toEqual(["jar_of_dreams"]);
        expect(logItem(save, "little_nightmare").cardsOnly).toBeUndefined();
    });

    it("keep through an export and an import, only trophies the save has", () => {
        const save = createSave();
        recordRun(save, run(["jar_of_dreams"], true));
        const loaded = importSave(exportSave(save, "1.0.0"), "1.0.0");
        expect(loaded.cardsOnlyFinds).toEqual(["jar_of_dreams"]);
        const crafted = migrateSave({
            ...JSON.parse(JSON.stringify(save)),
            cardsOnlyFinds: ["jar_of_dreams", "jar_of_dreams", "little_nightmare", 7],
        });
        expect(crafted.cardsOnlyFinds).toEqual(["jar_of_dreams"]);
    });
});
