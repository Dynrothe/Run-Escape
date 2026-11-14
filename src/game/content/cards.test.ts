import { describe, expect, it } from "vitest";

import {
    ALL_CARDS,
    BASIC_PACK,
    CARDS,
    CARD_BY_ID,
    CARD_KINDS,
    PACKS,
    PACK_BY_ID,
    cardLine,
    cardNumber,
    cardVersions,
    isCardOut,
    packCards,
    parseVersionKey,
    versionKey,
} from "./cards";
import { CASKET_GEAR } from "./items";
import { PASSIVES } from "./passives";
import { RARITY_ORDER } from "./rarity";
import { TROPHIES } from "./trophies";
import { WEAPONS, getWeapon } from "./weapons";

const card = (id: string) => {
    const found = CARD_BY_ID.get(id);
    if (!found) {
        throw new Error("No card " + id);
    }
    return found;
};

describe("cards", () => {
    it("has one for each weapon, passive, casket gear and trophy, under an id that won't change", () => {
        const ids = ALL_CARDS.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual([
            ...WEAPONS.map((w) => `weapon:${w.id}`),
            ...PASSIVES.map((p) => `passive:${p.id}`),
            ...CASKET_GEAR.map((g) => `gear:${g.id}`),
            ...TROPHIES.map((t) => `trophy:${t.id}`),
        ]);
    });

    it("gives every card a picture, a name, a text and a short line", () => {
        for (const c of ALL_CARDS) {
            expect(c.objId, c.id).toBeGreaterThan(0);
            expect(c.name(), c.id).not.toBe("");
            expect(c.text(), c.id).not.toBe("");
            expect(c.text().startsWith(cardLine(c)), c.id).toBe(true);
        }
    });

    it("has cards of every kind", () => {
        for (const kind of CARD_KINDS) {
            expect(CARDS.some((c) => c.kind === kind)).toBe(true);
        }
    });

    it("numbers each card in the set", () => {
        expect(cardNumber(CARDS[0])).toBe(`1/${CARDS.length}`);
        expect(cardNumber(CARDS[CARDS.length - 1])).toBe(`${CARDS.length}/${CARDS.length}`);
    });

    it("leaves out only cards from maps that aren't out", () => {
        expect(CARDS).toEqual(ALL_CARDS.filter(isCardOut));
    });
});

describe("versions", () => {
    it("comes in each rarity from a card's own up to Very rare", () => {
        // A weapon's own rarity is the game's: a level up offers it at that or better
        const scimitar = card("weapon:scimitar");
        expect(scimitar.rarity).toBe(getWeapon("scimitar").rarity);
        expect(cardVersions(scimitar)).toEqual(
            RARITY_ORDER.slice(RARITY_ORDER.indexOf(scimitar.rarity)),
        );
        expect(cardVersions(card("weapon:twisted_bow"))).toEqual(["veryRare"]);
        expect(cardVersions(card("trophy:little_nightmare"))).toEqual(["veryRare"]);
    });

    it("keeps a card's own version under its id, as saves always have, and the rest apart", () => {
        const c = card("passive:rapid_heal");
        expect(versionKey(c, c.rarity)).toBe("passive:rapid_heal");
        expect(versionKey(c, "veryRare")).toBe("passive:rapid_heal@veryRare");
        expect(parseVersionKey("passive:rapid_heal")).toEqual({ card: c, rarity: c.rarity });
        expect(parseVersionKey("passive:rapid_heal@veryRare")).toEqual({
            card: c,
            rarity: "veryRare",
        });
        // Its own rarity spelled out, a version it doesn't come in, junk
        expect(parseVersionKey(`passive:rapid_heal@${c.rarity}`)).toBeUndefined();
        expect(parseVersionKey("weapon:twisted_bow@common")).toBeUndefined();
        expect(parseVersionKey("passive:rapid_heal@shiny")).toBeUndefined();
        expect(parseVersionKey("passive:rapid_heal@rare@rare")).toBeUndefined();
        expect(parseVersionKey("weapon:nothing")).toBeUndefined();
    });
});

describe("the Card shop's packs", () => {
    it("can give every version its odds roll, and has odds that add up to one", () => {
        for (const pack of PACKS) {
            const pool = packCards(pack);
            expect(pool.length, pack.id).toBeGreaterThan(0);
            const lowest = Math.min(...pool.map((c) => RARITY_ORDER.indexOf(c.rarity)));
            for (const rarity of RARITY_ORDER) {
                // A rarity rolled has a card that comes in it
                expect(
                    pack.odds[rarity] === 0 || RARITY_ORDER.indexOf(rarity) >= lowest,
                    `${pack.id} ${rarity}`,
                ).toBe(true);
            }
            const total = RARITY_ORDER.reduce((sum, rarity) => sum + pack.odds[rarity], 0);
            expect(total, pack.id).toBeCloseTo(1);
        }
    });

    it("keeps the themed packs to their theme", () => {
        const pool = (id: string) => packCards(PACK_BY_ID.get(id)!);
        expect(pool("weapons").every((c) => c.kind === "weapon")).toBe(true);
        expect(pool("gear").every((c) => c.kind === "gear")).toBe(true);
        expect(pool("gear").length).toBeGreaterThan(0);
        expect(pool("passives").every((c) => c.kind === "passive")).toBe(true);
        expect(pool("trophies").every((c) => c.kind === "trophy")).toBe(true);
        expect(pool("raids")).toContain(card("trophy:avernic_defender_hilt"));
        expect(pool("raids")).not.toContain(card("weapon:scimitar"));
        expect(pool("adventurer")).toEqual(CARDS);
    });

    it("prices the premium pack above the basic one, with better odds", () => {
        const champion = PACK_BY_ID.get("champion")!;
        expect(BASIC_PACK).toBe(PACK_BY_ID.get("adventurer"));
        expect(champion.price).toBeGreaterThan(BASIC_PACK.price);
        expect(champion.odds.veryRare).toBeGreaterThan(BASIC_PACK.odds.veryRare);
        expect(champion.odds.common).toBeLessThan(BASIC_PACK.odds.common);
        expect(new Set(PACKS.map((p) => p.id)).size).toBe(PACKS.length);
    });
});
