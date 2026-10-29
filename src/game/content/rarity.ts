// OSRS drop table rarities, with the wiki's colours for them.
//
// Every weapon and passive has a rarity that sets how often it turns up in
// level up offers. Every offer also rolls its own rarity, which sets how big
// the upgrade is: a Very rare Piety is worth several Common ones.

export type Rarity = "common" | "uncommon" | "rare" | "veryRare";

export type RarityDef = {
    name: string;
    color: string;
    // How often items of this rarity are offered, relative to each other
    weight: number;
    // Chance an offer rolls this quality, before luck
    chance: number;
    // Size of a passive upgrade of this quality, as a multiple of a Common one
    power: number;
    // Extra damage a weapon upgrade of this quality gives that weapon
    weaponBonus: number;
    // Coins for high alching an item of this rarity found in a casket
    alchValue: number;
};

export const RARITIES: Record<Rarity, RarityDef> = {
    common: {
        name: "Common",
        color: "#56e156",
        weight: 10,
        chance: 0.7,
        power: 1,
        weaponBonus: 0,
        alchValue: 10,
    },
    uncommon: {
        name: "Uncommon",
        color: "#ffed4c",
        weight: 5,
        chance: 0.22,
        power: 1.5,
        weaponBonus: 0.06,
        alchValue: 20,
    },
    rare: {
        name: "Rare",
        color: "#ff863c",
        weight: 2,
        chance: 0.07,
        power: 2.25,
        weaponBonus: 0.15,
        alchValue: 40,
    },
    veryRare: {
        name: "Very rare",
        color: "#ff6262",
        // The class weapons (Scythe of Vitur, Twisted bow, Tumeken's shadow)
        // are the only Very rare things offered: about one run in twenty
        weight: 0.25,
        chance: 0.01,
        power: 3.5,
        weaponBonus: 0.3,
        alchValue: 80,
    },
};

export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "veryRare"];

// The rarer of the two
export function atLeast(rarity: Rarity, floor: Rarity): Rarity {
    return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(floor) ? rarity : floor;
}

// Rolls an offer's quality. Luck makes everything above Common likelier.
export function rollRarity(random: () => number, luck: number): Rarity {
    const chances = {} as Record<Rarity, number>;
    for (const rarity of RARITY_ORDER) {
        chances[rarity] = RARITIES[rarity].chance;
    }
    return rollRarityFrom(chances, random, luck);
}

// Rolls a rarity from relative weights (a casket's odds, say), with luck
// making everything above Common likelier the same way.
export function rollRarityFrom(
    weights: Record<Rarity, number>,
    random: () => number,
    luck: number,
): Rarity {
    const boost = 1 + Math.max(luck, 0) * 2;
    const boosted = RARITY_ORDER.map((r, i) => weights[r] * (i === 0 ? 1 : boost));
    const total = boosted.reduce((a, b) => a + b, 0);
    let roll = random() * total;
    for (let i = 0; i < RARITY_ORDER.length; i++) {
        roll -= boosted[i];
        if (roll < 0) {
            return RARITY_ORDER[i];
        }
    }
    return "common";
}
