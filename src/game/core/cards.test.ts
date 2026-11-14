import { describe, expect, it } from "vitest";

import {
    BASIC_PACK,
    CARD_BY_ID,
    CardDef,
    MAX_CARD_COPIES,
    MAX_CARD_PACKS,
    PACKS,
    PACK_BY_ID,
    PACK_SIZE,
    STARTER_PACKS,
    cardVersions,
    packCards,
} from "../content/cards";
import { RARITY_ORDER } from "../content/rarity";
import {
    buyCardPack,
    cantBuyCardPack,
    countCardsOwned,
    getBestVersion,
    getCardCopies,
    getCardPacks,
    getOwnedVersions,
    lastCardRarities,
    migrateCards,
    openCardPack,
} from "./cards";
import { RunSummary, createSave, exportSave, importSave, migrateSave, recordRun } from "./save";

// The same numbers over and over, from a list
function sequence(...values: number[]): () => number {
    let i = 0;
    return () => values[i++ % values.length];
}

// A spread of numbers in [0, 1), the same every time
function spread(seed = 42): () => number {
    let x = seed;
    return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
}

function card(id: string): CardDef {
    const found = CARD_BY_ID.get(id);
    if (!found) {
        throw new Error("No card " + id);
    }
    return found;
}

const index = (rarity: string) => RARITY_ORDER.indexOf(rarity as never);

describe("buying packs", () => {
    it("spends the pack's price in coins and opens it at once", () => {
        const raids = PACK_BY_ID.get("raids")!;
        const save = { ...createSave(), coins: raids.price + 7 };
        const cards = buyCardPack(save, raids, spread())!;
        expect(cards).toHaveLength(PACK_SIZE);
        expect(save.coins).toBe(7);
        expect(save.cardPacksOpened).toBe(1);
        // Bought packs aren't held: the free one's still there
        expect(getCardPacks(save)).toBe(STARTER_PACKS);
        const pool = packCards(raids);
        expect(cards.every(({ card }) => pool.includes(card))).toBe(true);
    });

    it("sells nothing without the coins, and takes none", () => {
        for (const pack of PACKS) {
            const save = { ...createSave(), coins: pack.price - 1 };
            expect(cantBuyCardPack(save, pack)).toBe("coins");
            expect(buyCardPack(save, pack, Math.random)).toBeUndefined();
            expect(save.coins).toBe(pack.price - 1);
            expect(save.cards).toBeUndefined();
        }
    });

    it("gives each pack only its own cards, at versions they come in and it has odds for", () => {
        for (const pack of PACKS) {
            const pool = packCards(pack);
            const save = { ...createSave(), coins: pack.price * 60 };
            const random = spread(7);
            for (let i = 0; i < 60; i++) {
                for (const { card, rarity } of buyCardPack(save, pack, random)!) {
                    expect(pool, pack.id).toContain(card);
                    expect(cardVersions(card), `${pack.id} ${card.id}`).toContain(rarity);
                    expect(pack.odds[rarity], `${pack.id} ${card.id} ${rarity}`).toBeGreaterThan(0);
                }
            }
            expect(save.coins).toBe(0);
        }
    });

    it("never makes a pack's last card its commonest version, with three rarities or more", () => {
        for (const pack of PACKS) {
            const save = { ...createSave(), coins: pack.price };
            // The lowest roll every time
            const cards = buyCardPack(save, pack, () => 0)!;
            const rarities = RARITY_ORDER.filter((rarity) => pack.odds[rarity] > 0);
            expect(cards[0].rarity, pack.id).toBe(rarities[0]);
            expect(cards[cards.length - 1].rarity === rarities[0], pack.id).toBe(
                rarities.length < 3,
            );
        }
        // The Raider's pack has two: its last card can be Rare, as its odds say
        expect(lastCardRarities(PACK_BY_ID.get("raids")!.odds)).toEqual(["rare", "veryRare"]);
    });

    it("rolls versions in proportion to the pack's odds", () => {
        const pack = PACK_BY_ID.get("champion")!;
        const save = { ...createSave(), coins: pack.price * 3000 };
        const counts: Record<string, number> = {};
        const random = spread();
        for (let i = 0; i < 3000; i++) {
            // The first four, which roll by the odds as they are
            for (const { rarity } of buyCardPack(save, pack, random)!.slice(0, -1)) {
                counts[rarity] = (counts[rarity] ?? 0) + 1;
            }
        }
        const total = 3000 * (PACK_SIZE - 1);
        expect(counts.common ?? 0).toBe(0);
        for (const rarity of ["uncommon", "rare", "veryRare"] as const) {
            expect(Math.abs(counts[rarity] / total - pack.odds[rarity]), rarity).toBeLessThan(0.02);
        }
    });

    it("gives runs no packs: they pay coins, which buy them", () => {
        const save = createSave();
        const run: RunSummary = {
            mapId: "lumbridge",
            victory: true,
            seconds: 900,
            level: 40,
            kills: 5000,
            coins: 900,
            bossesKilled: ["wise_old_man"],
        };
        recordRun(save, run);
        expect(save.cardPacks).toBeUndefined();
        expect(getCardPacks(save)).toBe(STARTER_PACKS);
        expect(save.coins).toBe(900);
    });
});

describe("the free pack", () => {
    it("is every save's once, old ones too, and opens as a basic pack", () => {
        const old = migrateSave({ version: 11, coins: 5, runs: 40 });
        expect(getCardPacks(old)).toBe(STARTER_PACKS);
        const cards = openCardPack(old, spread())!;
        expect(cards).toHaveLength(PACK_SIZE);
        expect(getCardPacks(old)).toBe(STARTER_PACKS - 1);
        expect(cards.every(({ card }) => packCards(BASIC_PACK).includes(card))).toBe(true);
        // Gone for good: loading again doesn't bring it back
        expect(getCardPacks(migrateSave(JSON.parse(JSON.stringify(old))))).toBe(0);
        expect(openCardPack(old, spread())).toBeUndefined();
    });

    it("never makes its last card Common", () => {
        const cards = openCardPack(createSave(), () => 0)!;
        expect(cards.slice(0, -1).every(({ rarity }) => rarity === "common")).toBe(true);
        expect(cards[cards.length - 1].rarity).toBe("uncommon");
    });
});

describe("versions owned", () => {
    it("adds a pack's cards as versions, new only the first time each is seen", () => {
        const scimitar = card("weapon:scimitar");
        const pool = [scimitar];
        const save = { ...createSave(), cards: { "weapon:scimitar": 2 } };
        // Its own version, then Very rare twice
        expect(scimitar.rarity).toBe("common");
        const own = 0;
        const cards = openCardPack(
            save,
            sequence(own, 0, 0.999, 0, 0.999, 0, own, 0, 0.999),
            pool,
        )!;
        expect(cards.map((c) => [c.rarity, c.isNew])).toEqual([
            [scimitar.rarity, false],
            ["veryRare", true],
            ["veryRare", false],
            [scimitar.rarity, false],
            ["veryRare", false],
        ]);
        expect(getOwnedVersions(save, scimitar)).toEqual([
            { rarity: scimitar.rarity, copies: 4 },
            { rarity: "veryRare", copies: 3 },
        ]);
        expect(getBestVersion(save, scimitar)).toBe("veryRare");
        expect(getCardCopies(save, "weapon:scimitar")).toBe(7);
        expect(countCardsOwned(save)).toBe(1);
    });

    it("raises a roll below every card's own rarity to the commonest one there is", () => {
        const bow = card("weapon:twisted_bow");
        // The lowest roll every time: Common, which the bow doesn't come in
        const cards = openCardPack(createSave(), () => 0, [bow])!;
        expect(cards.every(({ card, rarity }) => card === bow && rarity === "veryRare")).toBe(true);
    });
});

describe("cards in the save", () => {
    it("keeps them through an export and an import", () => {
        const save = { ...createSave(), cardPacks: 0, cardPacksOpened: 4, cardsOnly: true };
        save.cards = {
            "weapon:scimitar": 2,
            "weapon:scimitar@veryRare": 1,
            "trophy:jar_of_dreams": 1,
        };
        const loaded = importSave(exportSave(save, "1.0.0"), "1.0.0");
        expect(loaded.cards).toEqual(save.cards);
        expect(loaded.cardPacks).toBe(0);
        expect(loaded.cardPacksOpened).toBe(4);
        expect(loaded.cardsOnly).toBe(true);
    });

    it("drops what a crafted save can't have", () => {
        expect(
            migrateCards(
                // As a crafted file parses: __proto__ an own key, not the prototype
                JSON.parse(
                    `{"cards": {"weapon:scimitar": 2.7, "weapon:not_a_weapon": 3,
                    "trophy:jar_of_dreams": -1, "passive:rapid_heal": "1",
                    "weapon:twisted_bow@common": 2, "weapon:scimitar@shiny": 2,
                    "trophy:little_nightmare": 1e12, "__proto__": 4},
                    "cardPacks": -5, "cardPacksOpened": "many", "cardsOnly": "yes"}`,
                ),
            ),
        ).toEqual({
            cards: { "weapon:scimitar": 2, "trophy:little_nightmare": MAX_CARD_COPIES },
            cardPacks: 0,
        });
        expect(
            migrateCards({ cards: ["weapon:scimitar"] as unknown as Record<string, number> }),
        ).toEqual({});
        expect(migrateCards({ cardPacks: 1e9 })).toEqual({ cardPacks: MAX_CARD_PACKS });
    });
});
