import { describe, expect, it } from "vitest";

import { getCharacter } from "../content/characters";
import { RARITY_ORDER, Rarity } from "../content/rarity";
import { emptyStats } from "../content/types";
import { getWeapon } from "../content/weapons";
import { Rng } from "./Rng";
import { HeroOptions, Sim } from "./Sim";
import {
    CardCaps,
    UpgradeChoice,
    canEvolve,
    getEvolutionHint,
    hiltChoices,
    rollChoices,
} from "./Upgrades";
import {
    CARD_RUN_PASSIVES,
    CARD_RUN_WEAPONS,
    decodeCardCaps,
    encodeCardCaps,
    getCardCaps,
    getCardRunShortfall,
} from "./cardRuns";
import { WeaponState } from "./entities";
import { createSave } from "./save";
import { makeGrid } from "./world/testGrid";

const at = (rarity: Rarity) => RARITY_ORDER.indexOf(rarity);

// The id of a level up choice's weapon or passive, as its card's
function cardOf(choice: UpgradeChoice): string | undefined {
    if (choice.kind === "newWeapon" || choice.kind === "weaponLevel") {
        return `weapon:${choice.weaponId}`;
    }
    if (choice.kind === "newPassive" || choice.kind === "passiveLevel") {
        return `passive:${choice.passiveId}`;
    }
    return undefined;
}

function weapon(id: string, level = 1): WeaponState {
    return { def: getWeapon(id), level, cooldown: 0, bonus: 0, uses: 0 };
}

// Many level ups' offers, from one seed
function offers(cards: CardCaps | undefined, seed = 3, rolls = 300): UpgradeChoice[] {
    const rng = new Rng(seed);
    const all: UpgradeChoice[] = [];
    for (let i = 0; i < rolls; i++) {
        all.push(
            ...rollChoices(
                rng,
                [weapon("scimitar")],
                [],
                2,
                "melee",
                undefined,
                false,
                6,
                6,
                undefined,
                cards,
            ),
        );
    }
    return all;
}

const CAPS: CardCaps = new Map<string, Rarity>([
    ["weapon:scimitar", "uncommon"],
    ["weapon:two_handed_sword", "common"],
    ["weapon:throwing_knives", "rare"],
    ["passive:rapid_heal", "common"],
    ["passive:graceful", "veryRare"],
    ["passive:amulet_of_glory", "uncommon"],
]);

describe("Card collection only offers", () => {
    it("offers only what has a card", () => {
        const offered = offers(CAPS)
            .map(cardOf)
            .filter((id) => id !== undefined);
        expect(offered.length).toBeGreaterThan(0);
        expect(new Set(offered).size).toBeGreaterThan(2);
        for (const id of offered) {
            expect(CAPS.has(id!), id).toBe(true);
        }
        // Without cards, far more turns up
        const usual = new Set(offers(undefined).map(cardOf));
        expect(usual.size).toBeGreaterThan(new Set(offered).size);
    });

    it("offers nothing rarer than the rarest version owned", () => {
        const seen = new Set<Rarity>();
        for (const choice of offers(CAPS)) {
            const id = cardOf(choice);
            if (id && "quality" in choice && choice.quality) {
                expect(at(choice.quality), `${id} ${choice.quality}`).toBeLessThanOrEqual(
                    at(CAPS.get(id)!),
                );
                seen.add(choice.quality);
            }
        }
        // The Very rare Graceful card lets its offers roll up to Very rare
        expect(seen.has("veryRare")).toBe(true);
    });

    it("gives a player with only a card's Common version Common offers of it", () => {
        const commonOnly: CardCaps = new Map([...CAPS].map(([id]) => [id, "common" as Rarity]));
        for (const choice of offers(commonOnly)) {
            if ("quality" in choice && choice.quality && cardOf(choice)) {
                // A new weapon's at least its own rarity, which its commonest card is
                const floor =
                    choice.kind === "newWeapon" ? getWeapon(choice.weaponId).rarity : "common";
                expect(choice.quality).toBe(floor);
            }
        }
    });

    it("rolls the same offers from the same seed and cards", () => {
        expect(offers(CAPS, 9)).toEqual(offers(CAPS, 9));
    });

    it("hints, picks and evolves only into weapons with a card", () => {
        // With one hilt's card only, the usual picks: a blade can't be held without a hilt
        expect(
            hiltChoices(
                weapon("godsword", 2),
                undefined,
                new Map<string, Rarity>([["weapon:bandos_godsword", "rare"]]),
            ),
        ).toEqual(hiltChoices(weapon("godsword", 2)));
        const godsword = { ...weapon("godsword", 2) };
        const all = hiltChoices(godsword);
        expect(all.length).toBeGreaterThan(2);
        const withCards = hiltChoices(
            godsword,
            undefined,
            new Map<string, Rarity>([
                ["weapon:godsword", "rare"],
                ["weapon:bandos_godsword", "rare"],
                ["weapon:zamorak_godsword", "rare"],
            ]),
        );
        expect(withCards.map((c) => (c.kind === "hilt" ? c.into : ""))).toEqual([
            "bandos_godsword",
            "zamorak_godsword",
        ]);
        // A maxed weapon with its passive evolves only with its evolution's card
        const bow = weapon("twisted_bow", getWeapon("twisted_bow").levels.length);
        const owned = new Set([getWeapon("twisted_bow").evolution!.requiresPassive]);
        const into = `weapon:${getWeapon("twisted_bow").evolution!.into}`;
        expect(canEvolve(bow, owned)).toBe(true);
        expect(
            canEvolve(bow, owned, undefined, new Map([["weapon:twisted_bow", "veryRare"]])),
        ).toBe(false);
        expect(
            canEvolve(
                bow,
                owned,
                undefined,
                new Map<string, Rarity>([
                    ["weapon:twisted_bow", "veryRare"],
                    [into, "veryRare"],
                ]),
            ),
        ).toBe(true);
        const choice: UpgradeChoice = {
            kind: "weaponLevel",
            weaponId: "twisted_bow",
            level: 2,
            quality: "common",
        };
        expect(getEvolutionHint(choice, [bow], [], "ranged")).toBeDefined();
        expect(
            getEvolutionHint(
                choice,
                [bow],
                [],
                "ranged",
                undefined,
                new Map([["weapon:twisted_bow", "veryRare"]]),
            ),
        ).toBeUndefined();
    });
});

describe("whether a collection can play one", () => {
    it("says what's missing: the starting weapon's card, and how many more cards", () => {
        const warrior = getCharacter("warrior");
        expect(getCardRunShortfall(createSave(), "warrior")).toEqual({
            startingWeapon: warrior.startingWeapon,
            weapons: CARD_RUN_WEAPONS,
            passives: CARD_RUN_PASSIVES,
        });
        const save = { ...createSave(), cards: { [`weapon:${warrior.startingWeapon}`]: 1 } };
        expect(getCardRunShortfall(save, "warrior")).toEqual({
            weapons: CARD_RUN_WEAPONS,
            passives: CARD_RUN_PASSIVES,
        });
    });

    it("counts cards, not versions, and only what the adventurer could be offered", () => {
        const warrior = getCharacter("warrior");
        const save = {
            ...createSave(),
            cards: {
                [`weapon:${warrior.startingWeapon}`]: 1,
                "weapon:two_handed_sword": 1,
                "weapon:two_handed_sword@veryRare": 3,
                "weapon:throwing_knives": 1,
                // A ranger's bow: no use to a warrior
                "weapon:twisted_bow": 1,
                "passive:rapid_heal": 1,
                "passive:graceful": 1,
                "passive:graceful@rare": 1,
                "passive:amulet_of_glory": 1,
            },
        };
        expect(getCardRunShortfall(save, "warrior")).toBeUndefined();
        expect(getCardCaps(save).get("weapon:two_handed_sword")).toBe("veryRare");
        delete (save.cards as Record<string, number>)["passive:amulet_of_glory"];
        expect(getCardRunShortfall(save, "warrior")).toEqual({ weapons: 0, passives: 1 });
    });

    it("doesn't count the starting weapon's family, nor ask more of who can't be offered it", () => {
        const knight = getCharacter("godsword_knight");
        const godswords = {
            [`weapon:${knight.startingWeapon}`]: 1,
            "weapon:armadyl_godsword": 1,
            "weapon:bandos_godsword": 1,
            "passive:rapid_heal": 1,
            "passive:graceful": 1,
            "passive:amulet_of_glory": 1,
        };
        const save = { ...createSave(), cards: godswords, unlockedItems: ["godsword"] };
        expect(getCardRunShortfall(save, "godsword_knight")?.weapons).toBe(CARD_RUN_WEAPONS);
        // The Avian Assaulter finds no items and carries one weapon: only his own card's needed
        const avian = getCharacter("avian_assaulter");
        expect(
            getCardRunShortfall(
                { ...createSave(), cards: { [`weapon:${avian.startingWeapon}`]: 1 } },
                "avian_assaulter",
            ),
        ).toBeUndefined();
    });

    it("sends a co-op player's caps small, and keeps them to cards and versions there are", () => {
        const caps = new Map<string, Rarity>([
            ["weapon:scimitar", getWeapon("scimitar").rarity],
            ["weapon:throwing_knives", "veryRare"],
            ["passive:graceful", "rare"],
        ]);
        const sent = encodeCardCaps(caps);
        expect(sent).toContain("weapon:scimitar");
        expect(sent).toContain("weapon:throwing_knives@3");
        expect(decodeCardCaps(JSON.parse(JSON.stringify(sent)))).toEqual(caps);
        expect(
            decodeCardCaps([
                "weapon:twisted_bow@0",
                "trophy:jar_of_dreams",
                "weapon:nothing",
                "passive:graceful@9",
                "passive:graceful@1@1",
                7,
                "weapon:scimitar@2",
            ]),
        ).toEqual(new Map([["weapon:scimitar", "rare"]]));
        expect(decodeCardCaps({ "weapon:scimitar": "rare" })).toBeUndefined();
        expect(decodeCardCaps("rare")).toBeUndefined();
    });
});

describe("in co-op", () => {
    function party(caps: (CardCaps | undefined)[], seed = 4): Sim {
        const rows: string[] = [];
        for (let y = 0; y < 72; y++) {
            let row = "";
            for (let x = 0; x < 72; x++) {
                row += x === 0 || y === 0 || x === 71 || y === 71 ? "#" : ".";
            }
            rows.push(row);
        }
        const heroes: HeroOptions[] = caps.map((cardCaps, i) => ({
            name: `p${i}`,
            characterId: "warrior",
            metaStats: emptyStats(),
            ...(cardCaps && { cardCaps }),
        }));
        return new Sim({
            grid: makeGrid(rows, 1000, 1000),
            characterId: "",
            metaStats: emptyStats(),
            seed,
            spawnX: 1036.5,
            spawnY: 1036.5,
            party: heroes,
            focus: 0,
        });
    }

    // Each hero's offers over a few level ups, taking the first each time
    function levelUps(sim: Sim): UpgradeChoice[][] {
        const seen: UpgradeChoice[][] = sim.heroes.map(() => []);
        sim.xp = 1e5;
        for (let i = 0; i < 400 && sim.heroes.some((h) => h.pendingLevelUps > 0 || i === 0); i++) {
            sim.step();
            for (const hero of sim.heroes) {
                if (hero.pendingLevelUps > 0) {
                    seen[hero.index].push(...hero.choices);
                    sim.as(hero.index, () => sim.choose(0));
                }
            }
        }
        return seen;
    }

    it("keeps each player to their own cards and versions, the same on every copy", () => {
        const warrior = getCharacter("warrior");
        const a: CardCaps = new Map<string, Rarity>([
            [`weapon:${warrior.startingWeapon}`, "veryRare"],
            ["passive:rapid_heal", "veryRare"],
            ["passive:graceful", "veryRare"],
        ]);
        const b: CardCaps = new Map<string, Rarity>([
            [`weapon:${warrior.startingWeapon}`, "common"],
            ["passive:amulet_of_glory", "common"],
            ["passive:tome_of_fire", "common"],
        ]);
        const [aOffers, bOffers] = levelUps(party([a, b]));
        expect(aOffers.length).toBeGreaterThan(0);
        expect(bOffers.length).toBeGreaterThan(0);
        for (const [offers, caps] of [
            [aOffers, a],
            [bOffers, b],
        ] as const) {
            for (const choice of offers) {
                const id = cardOf(choice);
                if (id) {
                    expect(caps.has(id), id).toBe(true);
                    if ("quality" in choice && choice.quality) {
                        expect(at(choice.quality)).toBeLessThanOrEqual(at(caps.get(id)!));
                    }
                }
            }
        }
        // Player B's are all Common: their only versions
        expect(
            bOffers.every((c) => !("quality" in c) || !c.quality || c.quality === "common"),
        ).toBe(true);
        // The same run again offers the same
        expect(levelUps(party([a, b]))).toEqual([aOffers, bOffers]);
    });
});
