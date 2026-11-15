import { describe, expect, it } from "vitest";

import {
    BASIC_PACK,
    CARD_BY_ID,
    CARD_TIER_FACTORS,
    CARD_TOP_ITEMS,
    CardDef,
    MAX_CARD_COPIES,
    MAX_CARD_PACKS,
    MAX_PLATINUM,
    PACKS,
    PACK_BY_ID,
    PACK_SIZE,
    PackDef,
    STARTER_PACKS,
    cardTier,
    cardVersions,
    cardWeight,
    packCards,
    packFoilChance,
    parseVersionKey,
    weaponTiers,
} from "../content/cards";
import { RARITY_ORDER, atLeast } from "../content/rarity";
import { getWeapon } from "../content/weapons";
import { exactPackOdds } from "./cardOdds";
import { getStarterCards } from "./cardRuns";
import {
    buyCardPack,
    cantBuyCardPack,
    countCardsOwned,
    getBestVersion,
    getCardCopies,
    getCardFoils,
    getCardPacks,
    getOwnedVersions,
    giveLowerTiers,
    isCardUnlocked,
    lastCardRarities,
    migrateCards,
    openCardPack,
    packPool,
    packRoller,
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
    it("spends the pack's price in platinum tokens and opens it at once", () => {
        const raids = PACK_BY_ID.get("raids")!;
        const save = { ...createSave(), coins: 5000, platinum: raids.price + 7 };
        const cards = buyCardPack(save, raids, spread())!;
        expect(cards).toHaveLength(PACK_SIZE);
        expect(save.platinum).toBe(7);
        // Coins never pay for packs
        expect(save.coins).toBe(5000);
        expect(save.cardPacksOpened).toBe(1);
        // Bought packs aren't held: the free one's still there
        expect(getCardPacks(save)).toBe(STARTER_PACKS);
        const pool = packCards(raids);
        expect(cards.every(({ card }) => pool.includes(card))).toBe(true);
    });

    it("sells nothing without the platinum tokens, however many coins, and takes none", () => {
        for (const pack of PACKS) {
            const save = { ...createSave(), coins: 1e6, platinum: pack.price - 1 };
            expect(cantBuyCardPack(save, pack)).toBe("platinum");
            expect(buyCardPack(save, pack, Math.random)).toBeUndefined();
            expect(save.platinum).toBe(pack.price - 1);
            expect(save.coins).toBe(1e6);
            expect(save.cards).toBeUndefined();
        }
    });

    it("gives each pack only its own cards, at versions they come in and it has odds for", () => {
        for (const pack of PACKS) {
            const pool = packCards(pack);
            const save = { ...createSave(), platinum: pack.price * 60 };
            const random = spread(7);
            for (let i = 0; i < 60; i++) {
                for (const { card, rarity } of buyCardPack(save, pack, random)!) {
                    expect(pool, pack.id).toContain(card);
                    expect(cardVersions(card), `${pack.id} ${card.id}`).toContain(rarity);
                    expect(pack.odds[rarity], `${pack.id} ${card.id} ${rarity}`).toBeGreaterThan(0);
                }
            }
            expect(save.platinum).toBe(0);
        }
    });

    it("never makes a pack's last card its commonest version, with three rarities or more", () => {
        for (const pack of PACKS) {
            const save = { ...createSave(), platinum: pack.price };
            // The lowest roll every time
            const cards = buyCardPack(save, pack, () => 0)!;
            const rarities = RARITY_ORDER.filter((rarity) => pack.odds[rarity] > 0);
            // Its commonest version, or the card's own rarity where that's rarer
            const first = cards[0];
            expect(first.rarity, pack.id).toBe(atLeast(rarities[0], first.card.rarity));
            const last = cards[cards.length - 1];
            if (rarities.length < 3) {
                expect(last.rarity, pack.id).toBe(atLeast(rarities[0], last.card.rarity));
            } else {
                expect(last.rarity, pack.id).not.toBe(rarities[0]);
            }
        }
        // The Raider's pack has two: its last card can be Rare, as its odds say
        expect(lastCardRarities(PACK_BY_ID.get("raids")!.odds)).toEqual(["rare", "veryRare"]);
    });

    // 6,000 packs: about 1.5 s alone, past 5 s on a busy machine (its own timeout)
    it("comes out at the pack's odds of each version, never a card below its own rarity", () => {
        for (const pack of [BASIC_PACK, PACK_BY_ID.get("champion")!]) {
            const save = { ...createSave(), platinum: pack.price * 3000 };
            const counts: Record<string, number> = {};
            let total = 0;
            const random = spread();
            for (let i = 0; i < 3000; i++) {
                // The first four, which roll by the odds as they are (the last never the commonest)
                for (const { card, rarity } of buyCardPack(save, pack, random)!.slice(0, -1)) {
                    // A card picked for its version comes in it: its own rarity no rarer
                    expect(index(rarity)).toBeGreaterThanOrEqual(index(card.rarity));
                    counts[rarity] = (counts[rarity] ?? 0) + 1;
                    total++;
                }
            }
            for (const rarity of RARITY_ORDER) {
                expect(
                    Math.abs((counts[rarity] ?? 0) / total - pack.odds[rarity]),
                    `${pack.id} ${rarity}`,
                ).toBeLessThan(0.02);
            }
        }
    }, 30_000);

    it("picks a version's card only from those that come in it", () => {
        // A pool of a Common and a Very rare thing: a Common version roll can only be the Common
        const common = packCards(BASIC_PACK).find((c) => c.rarity === "common")!;
        const veryRare = packCards(BASIC_PACK).find((c) => c.rarity === "veryRare")!;
        const roll = packRoller(BASIC_PACK, [common, veryRare]);
        // Version roll 0 (Common), any pick, no foil: the Common thing as a Common
        const cards = roll(sequence(0, 0.999, 0.999), 4);
        expect(
            cards.slice(0, -1).every(({ card, rarity }) => card === common && rarity === "common"),
        ).toBe(true);
        // The last card's never the commonest version: still the Common thing, as an Uncommon
        expect(cards[3]).toEqual({ card: common, rarity: "uncommon", foil: false });
        // A pool of only Rare things: a Common roll comes as the commonest rarity there is
        const rare = packCards(BASIC_PACK).find((c) => c.rarity === "rare")!;
        const only = packRoller(BASIC_PACK, [rare])(sequence(0, 0, 0.999), 1);
        expect(only).toEqual([{ card: rare, rarity: "rare", foil: false }]);
    });

    it("holds only what the player's unlocked: a locked thing never comes", () => {
        const save = { ...createSave(), platinum: BASIC_PACK.price * 2000 };
        const random = spread(7);
        const seen = new Set<string>();
        for (let i = 0; i < 2000; i++) {
            for (const { card } of buyCardPack(save, BASIC_PACK, random)!) {
                seen.add(card.id);
            }
        }
        for (const id of seen) {
            expect(isCardUnlocked(createSave(), card(id)), id).toBe(true);
        }
        expect(seen.has("weapon:keris_partisan")).toBe(false);
        // A new save's pool is smaller than the whole pack's
        expect(packPool(createSave(), BASIC_PACK).length).toBeLessThan(
            packCards(BASIC_PACK).length,
        );
    });

    it("puts a thing in the pool once it's unlocked, as the game unlocks it", () => {
        const fresh = createSave();
        const pool = (save: typeof fresh) =>
            packPool(save, PACK_BY_ID.get("weapons")!).map((c) => c.id);
        expect(pool(fresh)).not.toContain("weapon:keris_partisan");
        // The Kalphite Queen beaten: the Keris partisan, but not the Sun's till its jewel
        const queen = { ...fresh, unlockedItems: ["keris_partisan"] };
        expect(pool(queen)).toContain("weapon:keris_partisan");
        expect(pool(queen)).not.toContain("weapon:keris_partisan_of_the_sun");
        const jewel = { ...fresh, unlockedItems: ["keris_partisan", "keris_partisan_of_the_sun"] };
        expect(pool(jewel)).toContain("weapon:keris_partisan_of_the_sun");
        // A trophy once its map's open: the Tombs' behind its quest
        const tombs = packPool(fresh, PACK_BY_ID.get("trophies")!).filter(
            (c) => c.mapId === "tombs_of_amascut",
        );
        expect(tombs).toEqual([]);
    });

    it("makes the strongest things rarer pulls than others of their rarity", () => {
        const infernal = card("gear:infernal_cape");
        const fire = card("gear:fire_cape");
        expect(infernal.rarity).toBe(fire.rarity);
        expect(cardTier(infernal)).toBeGreaterThan(cardTier(fire));
        expect(cardWeight(BASIC_PACK, infernal)).toBeLessThan(cardWeight(BASIC_PACK, fire));
        // The Harmonised nightmare staff, Rare in the game, against a lesser Rare weapon
        const staff = card("weapon:harmonised_nightmare_staff");
        const lesser = packCards(BASIC_PACK).find(
            (c) => c.kind === "weapon" && c.rarity === staff.rarity && cardTier(c) < 3,
        )!;
        expect(cardWeight(BASIC_PACK, staff)).toBeLessThan(cardWeight(BASIC_PACK, lesser));
        // Every top item's a card
        for (const id of CARD_TOP_ITEMS) {
            expect(CARD_BY_ID.has(id), id).toBe(true);
            expect(cardTier(card(id))).toBe(CARD_TIER_FACTORS.length - 1);
        }
    });

    it("makes the Champion's pack's Rare and Very rare cards likelier than a basic pack's", () => {
        // The share of each pack's cards whose item is each rarity, as the shop's odds say
        const items = (pack: PackDef) => exactPackOdds(pack, packCards(pack)).items;
        const basic = items(BASIC_PACK);
        const champion = items(PACK_BY_ID.get("champion")!);
        expect(champion.veryRare).toBeGreaterThan(basic.veryRare * 1.3);
        expect(champion.rare).toBeGreaterThan(basic.rare);
        // Shares of the pack: they add up to all of it
        const total = RARITY_ORDER.reduce((sum, r) => sum + champion[r], 0);
        expect(total).toBeCloseTo(1, 6);
    });

    it("gives runs no packs: they pay platinum tokens, apart from their coins", () => {
        const save = createSave();
        const run: RunSummary = {
            mapId: "lumbridge",
            victory: true,
            seconds: 900,
            level: 40,
            kills: 5000,
            coins: 900,
            platinum: 87,
            bossesKilled: ["wise_old_man"],
        };
        recordRun(save, run);
        expect(save.platinum).toBe(87);
        // Whole and in range from a co-op player's numbers
        recordRun(save, { ...run, coins: 0, platinum: 2.9 });
        recordRun(save, { ...run, coins: 0, platinum: -50 });
        expect(save.platinum).toBe(89);
        expect(save.cardPacks).toBeUndefined();
        expect(getCardPacks(save)).toBe(STARTER_PACKS);
        expect(save.coins).toBe(900);
        expect(importSave(exportSave(save, "1.0.0"), "1.0.0").platinum).toBe(89);
        expect(migrateSave({ version: 11, platinum: -3 }).platinum).toBeUndefined();
        expect(migrateSave({ version: 11, platinum: 1e12 }).platinum).toBe(MAX_PLATINUM);
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

describe("the starter cards", () => {
    it("come in the free pack, topped up with random cards to a pack's size", () => {
        const starter = getStarterCards("warrior");
        const save = createSave();
        const cards = openCardPack(save, spread(), undefined, starter)!;
        expect(cards).toHaveLength(PACK_SIZE);
        expect(cards.slice(0, starter.length).map((c) => c.card)).toEqual(starter);
        expect(cards[0].isNew).toBe(true);
        expect(save.cardStarterGiven).toBe(true);
        expect(save.cardPacksOpened).toBe(1);
        // Already owned (a Weapons pack bought first): the whole pack is random
        const owns = { ...createSave(), cards: { [starter[0].id]: 1 } };
        const again = openCardPack(
            owns,
            spread(),
            [CARD_BY_ID.get("trophy:jar_of_dreams")!],
            starter,
        )!;
        expect(again.every((c) => c.card.id === "trophy:jar_of_dreams")).toBe(true);
        expect(getCardCopies(owns, starter[0].id)).toBe(1);
        // Only the free pack: a later one is all random
        const later = { ...createSave(), cardPacks: 1, cardStarterGiven: true };
        const pool = [CARD_BY_ID.get("trophy:jar_of_dreams")!];
        expect(openCardPack(later, spread(), pool, starter)!.every((c) => c.card === pool[0])).toBe(
            true,
        );
    });

    it("are given once to a save that opened its free pack before it held them", () => {
        const start = getStarterCards("warrior")[0];
        const old = migrateSave({
            version: 11,
            cardPacks: 0,
            cardPacksOpened: 1,
            cards: { "trophy:scythe": 1 },
        });
        expect(getCardCopies(old, start.id)).toBe(1);
        expect(old.cardStarterGiven).toBe(true);
        // Not again, even once they're gone
        delete old.cards![start.id];
        expect(getCardCopies(migrateSave(JSON.parse(JSON.stringify(old))), start.id)).toBe(0);
        // Nor to a save that hasn't opened its free pack, which holds them
        expect(migrateSave({ version: 11 }).cards).toBeUndefined();
        expect(migrateSave({ version: 11, cardPacks: 1 }).cardStarterGiven).toBeUndefined();
        // Nor to one that bought a pack but still holds its free one
        expect(
            migrateSave({ version: 11, cardPacksOpened: 2, cards: { "trophy:scythe": 1 } })
                .cardStarterGiven,
        ).toBeUndefined();
        // Nor a second copy to one that has the card already
        const has = migrateSave({
            version: 11,
            cardPacks: 0,
            cardPacksOpened: 1,
            cards: { [start.id]: 3 },
        });
        expect(getCardCopies(has, start.id)).toBe(3);
    });
});

describe("versions owned", () => {
    it("keeps a foil as a copy of its version, counted apart, and cleans foils on loading", () => {
        const scimitar = card("weapon:scimitar");
        const save = { ...createSave(), platinum: BASIC_PACK.price };
        // The lowest roll every time: every card a foil
        const cards = buyCardPack(save, BASIC_PACK, () => 0, [scimitar])!;
        expect(cards.every((c) => c.foil)).toBe(true);
        const copies = getCardCopies(save, scimitar.id);
        expect(copies).toBe(PACK_SIZE);
        expect(getCardFoils(save, scimitar)).toBe(PACK_SIZE);
        // A crafted save can't hold more foils than copies, nor foils of no card
        const loaded = migrateCards({
            cards: { [scimitar.id]: 2 },
            cardFoils: { [scimitar.id]: 9, "weapon:nothing": 1 },
        });
        expect(loaded.cardFoils).toEqual({ [scimitar.id]: 2 });
        // Rarely, in a basic pack, and twice as often in the Champion's
        expect(packFoilChance(BASIC_PACK)).toBeLessThan(0.05);
        expect(packFoilChance(PACK_BY_ID.get("champion")!)).toBeCloseTo(
            packFoilChance(BASIC_PACK) * 2,
        );
    });

    it("adds a pack's cards as versions, new only the first time each is seen", () => {
        const scimitar = card("weapon:scimitar");
        const pool = [scimitar];
        const save = { ...createSave(), cards: { "weapon:scimitar": 2 } };
        // Its own version, then Very rare twice: each card a rarity, a pick and a foil roll (none)
        expect(scimitar.rarity).toBe("common");
        const own = 0;
        const plain = 0.999;
        const cards = openCardPack(
            save,
            sequence(
                ...[own, 0, plain],
                ...[0.999, 0, plain],
                ...[0.999, 0, plain],
                ...[own, 0, plain],
                ...[0.999, 0, plain],
            ),
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
        const save = {
            ...createSave(),
            cardPacks: 0,
            cardPacksOpened: 4,
            cardsOnly: true,
            cardStarterGiven: true,
        };
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
        expect(loaded.cardStarterGiven).toBe(true);
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

describe("a weapon's metals", () => {
    const scimitar = (n: number) => card(n === 1 ? "weapon:scimitar" : `weapon:scimitar.${n}`);

    it("are cards of their own, its first the card it always had, rarer up the metals", () => {
        const tiers = weaponTiers(getWeapon("scimitar"));
        expect(tiers.map((tier) => tier.toLevel)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(scimitar(1).name()).toBe("Bronze scimitar");
        expect(scimitar(8).name()).toBe("Dragon scimitar");
        expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => scimitar(n).rarity)).toEqual([
            "common",
            "common",
            "uncommon",
            "uncommon",
            "rare",
            "rare",
            "veryRare",
            "veryRare",
        ]);
        // A version key and a foil keep the same shape
        expect(parseVersionKey("weapon:scimitar.3@rare")).toEqual({
            card: scimitar(3),
            rarity: "rare",
        });
        // A weapon with one name for every level has one card
        expect(weaponTiers(getWeapon("dark_bow"))).toEqual([]);
    });

    it("unlocks the lower metals never owned, once, as their commonest version", () => {
        // A Very rare Steel scimitar pulled: Bronze and Iron come with it, as Commons
        const save = { ...createSave(), platinum: BASIC_PACK.price };
        const [pulled] = buyCardPack(save, BASIC_PACK, sequence(0.999, 0, 0.999), [scimitar(3)])!;
        expect(pulled.card).toBe(scimitar(3));
        expect(pulled.alsoUnlocks?.map((c) => c.id)).toEqual([scimitar(1).id, scimitar(2).id]);
        expect(getOwnedVersions(save, scimitar(1))).toEqual([{ rarity: "common", copies: 1 }]);
        expect(getOwnedVersions(save, scimitar(2))).toEqual([{ rarity: "common", copies: 1 }]);
    });

    it("leaves a lower metal already owned as it is, and a repeat pull adds only its own copy", () => {
        const cards: Record<string, number> = { "weapon:scimitar@rare": 2 };
        // Steel pulled: Iron's new, Bronze (a Rare owned) untouched
        expect(giveLowerTiers(cards, scimitar(3)).map((c) => c.id)).toEqual([scimitar(2).id]);
        expect(cards).toEqual({ "weapon:scimitar@rare": 2, "weapon:scimitar.2": 1 });
        // Steel again: nothing more below
        expect(giveLowerTiers(cards, scimitar(3))).toEqual([]);
        expect(cards).toEqual({ "weapon:scimitar@rare": 2, "weapon:scimitar.2": 1 });
        // A Dragon's missing lower metals come at their own commonest version (Steel's Uncommon)
        giveLowerTiers(cards, scimitar(8));
        expect(cards["weapon:scimitar.3"]).toBe(1);
        expect(scimitar(3).rarity).toBe("uncommon");
    });

    it("never brings a foil with it: the foil's the card pulled", () => {
        const save = { ...createSave(), platinum: BASIC_PACK.price };
        // Every roll lowest: each card a foil
        buyCardPack(save, BASIC_PACK, () => 0, [scimitar(3)]);
        expect(getCardFoils(save, scimitar(3))).toBe(PACK_SIZE);
        expect(getCardFoils(save, scimitar(1))).toBe(0);
        expect(getCardFoils(save, scimitar(2))).toBe(0);
    });

    it("gives an older save holding a higher metal the lower ones it's missing, on loading", () => {
        const loaded = migrateCards({
            cards: { "weapon:scimitar.4@rare": 1, "weapon:scimitar.2@veryRare": 1 },
        });
        expect(loaded.cards).toEqual({
            "weapon:scimitar.4@rare": 1,
            "weapon:scimitar.2@veryRare": 1,
            // Bronze and Steel were missing: their commonest versions; Iron kept as it was
            "weapon:scimitar": 1,
            "weapon:scimitar.3": 1,
        });
    });
});
