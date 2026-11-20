import {
    BASIC_PACK,
    CARDS,
    CARD_BY_ID,
    CardDef,
    MAX_CARD_COPIES,
    MAX_CARD_PACKS,
    MAX_PLATINUM,
    PACK_SIZE,
    PackDef,
    STARTER_PACKS,
    cardDefId,
    cardVersions,
    cardWeight,
    lowerTierCards,
    packCards,
    packFoilChance,
    parseVersionKey,
    tierCardId,
    versionKey,
    weaponTiers,
} from "../content/cards";
import { getGear } from "../content/items";
import { PASSIVES } from "../content/passives";
import { RARITY_ORDER, Rarity } from "../content/rarity";
import { isAvailable } from "../content/unlocks";
import { WEAPONS, getWeapon } from "../content/weapons";
import { type SaveData, isMapUnlocked } from "./save";

// Cards in the save (content/cards.ts has what they are): the packs held unopened (only ever the
// free starter pack, a basic one: bought packs open as they're bought) and the copies of each
// card owned. Opening a pack isn't part of a run, so it takes the client's random numbers rather
// than a seeded Rng.

// The packs held: a save that's never had any, old ones too, starts with STARTER_PACKS
export function getCardPacks(save: SaveData): number {
    return save.cardPacks ?? STARTER_PACKS;
}

// The platinum tokens held (none till a run's earned some)
export function getPlatinum(save: SaveData): number {
    return save.platinum ?? 0;
}

// Adds a run's platinum tokens (RunResult.platinum), whole and in range
export function addPlatinum(save: SaveData, points: number | undefined): void {
    const earned = typeof points === "number" && isFinite(points) ? Math.floor(points) : 0;
    if (earned > 0) {
        save.platinum = Math.min(getPlatinum(save) + earned, MAX_PLATINUM);
    }
}

// Whether a card's thing is unlocked for this player, as the game's own rules have it: a weapon,
// passive or casket gear once its map task's done (isAvailable: the Keris partisan once the
// Kalphite Queen's beaten, the Sun one only with the Jewel of the sun), an evolution once what it
// evolves from and the passive it takes are, and a trophy once the map it's found on is open. A
// pack only holds these.
export function isCardUnlocked(save: SaveData, card: CardDef): boolean {
    const unlocked = new Set(save.unlockedItems);
    return cardUnlocked(save, card, unlocked);
}

function cardUnlocked(save: SaveData, card: CardDef, unlocked: ReadonlySet<string>): boolean {
    // A weapon's tiers are unlocked with it
    const id = cardDefId(card);
    switch (card.kind) {
        case "weapon": {
            const weapon = getWeapon(id);
            return (
                isAvailable(weapon, unlocked) &&
                (!weapon.evolved ||
                    WEAPONS.some(
                        (from) =>
                            from.evolution?.into === weapon.id &&
                            !from.evolved &&
                            isAvailable(from, unlocked) &&
                            isAvailable(
                                PASSIVES.find((p) => p.id === from.evolution!.requiresPassive) ?? {
                                    id: "",
                                },
                                unlocked,
                            ),
                    ))
            );
        }
        case "passive":
            return isAvailable(PASSIVES.find((p) => p.id === id)!, unlocked);
        case "gear":
            return isAvailable(getGear(id), unlocked);
        case "trophy":
            return card.mapId === undefined || isMapUnlocked(save, card.mapId);
    }
}

// A pack's pool for this player: its cards whose things they've unlocked (isCardUnlocked), worked
// out from the save as it's opened
export function packPool(save: SaveData, pack: PackDef): CardDef[] {
    const unlocked = new Set(save.unlockedItems);
    return packCards(pack).filter((card) => cardUnlocked(save, card, unlocked));
}

// Why a pack can't be bought, or undefined if it can: only platinum tokens buy them, never coins,
// and not one with nothing in it the player's unlocked ("locked")
export function cantBuyCardPack(save: SaveData, pack: PackDef): "platinum" | "locked" | undefined {
    if (packPool(save, pack).length === 0) {
        return "locked";
    }
    return getPlatinum(save) < pack.price ? "platinum" : undefined;
}

// The copies of one version of a card
export function getVersionCopies(save: SaveData, card: CardDef, rarity: Rarity): number {
    return save.cards?.[versionKey(card, rarity)] ?? 0;
}

// The versions of a card owned, commonest first, with their copies
export function getOwnedVersions(
    save: SaveData,
    card: CardDef,
): { rarity: Rarity; copies: number }[] {
    return cardVersions(card)
        .map((rarity) => ({ rarity, copies: getVersionCopies(save, card, rarity) }))
        .filter(({ copies }) => copies > 0);
}

// The foil copies of one version of a card
export function getFoilCopies(save: SaveData, card: CardDef, rarity: Rarity): number {
    return save.cardFoils?.[versionKey(card, rarity)] ?? 0;
}

// The foil copies of a card, every version together
export function getCardFoils(save: SaveData, card: CardDef): number {
    return cardVersions(card).reduce((sum, rarity) => sum + getFoilCopies(save, card, rarity), 0);
}

// The rarest version of a card that's a foil, or undefined with none
export function getBestFoil(save: SaveData, card: CardDef): Rarity | undefined {
    return [...cardVersions(card)].reverse().find((r) => getFoilCopies(save, card, r) > 0);
}

// The rarest version of a card owned, or undefined with none
export function getBestVersion(save: SaveData, card: CardDef): Rarity | undefined {
    return getOwnedVersions(save, card).pop()?.rarity;
}

// The copies of a card owned, every version together
export function getCardCopies(save: SaveData, cardId: string): number {
    const card = CARD_BY_ID.get(cardId);
    return card ? getOwnedVersions(save, card).reduce((sum, { copies }) => sum + copies, 0) : 0;
}

// The different cards owned (any version of each), of those in the game
export function countCardsOwned(save: SaveData, cards: readonly CardDef[] = CARDS): number {
    return cards.filter((card) => getCardCopies(save, card.id) > 0).length;
}

// A pack's rarities with odds, and those its last card rolls from: above the lowest, in a pack
// with three or more (a pack of two only would always end on its rarer)
export function lastCardRarities(odds: Record<Rarity, number>): Rarity[] {
    const rarities = RARITY_ORDER.filter((rarity) => odds[rarity] > 0);
    return rarities.length >= 3 ? rarities.slice(1) : rarities;
}

// The rarities a card of a pack rolls from, with their odds added up (packRoller makes them once)
type RarityRoll = { odds: Record<Rarity, number>; rarities: Rarity[]; total: number };

function rarityRoll(odds: Record<Rarity, number>, rarities: Rarity[]): RarityRoll {
    return { odds, rarities, total: rarities.reduce((sum, rarity) => sum + odds[rarity], 0) };
}

// A rarity for one card of a pack, by its odds
function rollRarity({ odds, rarities, total }: RarityRoll, random: () => number): Rarity {
    let roll = random() * total;
    for (const rarity of rarities) {
        roll -= odds[rarity];
        if (roll < 0) {
            return rarity;
        }
    }
    return rarities[rarities.length - 1];
}

// A pack's cards, without the save: each rolls its version's rarity by the pack's odds first, then
// a card of the pool that comes in that version (its own rarity no rarer than it), picked by its
// weight (cardWeight: its rarity's and its tier's, so the strongest things are the rarest pulls),
// then whether it's a foil. So a pack's versions come out at its odds. Where no card of the pool
// comes in the version rolled (all its things rarer), it's the commonest rarity that has some. Made
// once for a pool, so a preview's many packs (core/cardOdds.ts) roll as a bought one does.
export function packRoller(
    pack: PackDef,
    pool: readonly CardDef[],
): (random: () => number, size?: number) => { card: CardDef; rarity: Rarity; foil: boolean }[] {
    // For each version, the cards that come in it and their weights added up, to search a roll in
    const byVersion = RARITY_ORDER.map((version) => {
        const cards = pool.filter(
            (card) => RARITY_ORDER.indexOf(card.rarity) <= RARITY_ORDER.indexOf(version),
        );
        const upTo: number[] = [];
        let total = 0;
        for (const card of cards) {
            total += cardWeight(pack, card);
            upTo.push(total);
        }
        return { version, cards, upTo, total };
    });
    const commonest = byVersion.find((v) => v.cards.length > 0);
    const pick = (rolled: Rarity, random: () => number): { card: CardDef; rarity: Rarity } => {
        const chosen = byVersion[RARITY_ORDER.indexOf(rolled)];
        const from = chosen.cards.length > 0 ? chosen : commonest!;
        const roll = random() * from.total;
        let lo = 0;
        let hi = from.cards.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (from.upTo[mid] > roll) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return { card: from.cards[lo], rarity: from.version };
    };
    // Every card's rarities but the last's, which rolls from lastCardRarities
    const anyCard = rarityRoll(
        pack.odds,
        RARITY_ORDER.filter((rarity) => pack.odds[rarity] > 0),
    );
    const lastCard = rarityRoll(pack.odds, lastCardRarities(pack.odds));
    const foilChance = packFoilChance(pack);
    return (random, size = PACK_SIZE) => {
        const cards: { card: CardDef; rarity: Rarity; foil: boolean }[] = [];
        for (let i = 0; i < size; i++) {
            const rolled = rollRarity(i === size - 1 ? lastCard : anyCard, random);
            const { card, rarity } = pick(rolled, random);
            // Then whether it's a foil, on the same numbers
            const foil = random() < foilChance;
            cards.push({ card, rarity, foil });
        }
        return cards;
    };
}

// A card from a pack, at its version; new: that version wasn't owned before; foil: a foil copy;
// alsoUnlocks: the lower tiers of its weapon it brought with it (giveLowerTiers)
export type PackCard = {
    card: CardDef;
    rarity: Rarity;
    isNew: boolean;
    foil?: boolean;
    alsoUnlocks?: CardDef[];
};

// A weapon tier's card brings its lower tiers with it (a Steel scimitar, the Bronze and Iron): each
// never owned, in any version, is given a copy at its own rarity, the commonest version it comes in
// (Common for most; a Steel scimitar's own is Uncommon), whatever the version pulled. One already
// owned is left as it is. Not foils: the foil's the card pulled. The lower cards given, into
// `cards` (SaveData.cards' shape).
export function giveLowerTiers(cards: Record<string, number>, card: CardDef): CardDef[] {
    const given: CardDef[] = [];
    for (const lower of lowerTierCards(card)) {
        if (!cardVersions(lower).some((r) => (cards[versionKey(lower, r)] ?? 0) > 0)) {
            cards[versionKey(lower, lower.rarity)] = 1;
            given.push(lower);
        }
    }
    return given;
}

// A pack's PACK_SIZE cards, added to the save's copies. A version counts as new only the first
// time it's in a pack, not again later in the same one.
function rollPack(
    save: SaveData,
    pack: PackDef,
    random: () => number,
    pool: readonly CardDef[],
    size = PACK_SIZE,
): PackCard[] {
    const cards: PackCard[] = [];
    const owned = { ...save.cards };
    const foils = { ...save.cardFoils };
    for (const { card, rarity, foil } of packRoller(pack, pool)(random, size)) {
        const key = versionKey(card, rarity);
        const copies = owned[key] ?? 0;
        owned[key] = Math.min(copies + 1, MAX_CARD_COPIES);
        const lower = giveLowerTiers(owned, card);
        cards.push({
            card,
            rarity,
            isNew: copies === 0,
            ...(foil && { foil }),
            ...(lower.length > 0 && { alsoUnlocks: lower }),
        });
        // A foil's a copy of its version too, counted apart as well
        if (foil) {
            foils[key] = Math.min((foils[key] ?? 0) + 1, owned[key]);
        }
    }
    save.cards = owned;
    if (Object.keys(foils).length > 0) {
        save.cardFoils = foils;
    }
    save.cardPacksOpened = (save.cardPacksOpened ?? 0) + 1;
    return cards;
}

// Opens one of the packs the save holds (a basic one): undefined with none to open. The free
// starter pack (the first, while SaveData.cardStarterGiven is unset) holds `starter` (the starting
// adventurer's starter cards, core/cardRuns.ts), at their own versions, then random cards to
// PACK_SIZE; more than PACK_SIZE of them would make it that many, with none random.
export function openCardPack(
    save: SaveData,
    random: () => number,
    pool: readonly CardDef[] = packPool(save, BASIC_PACK),
    starter: readonly CardDef[] = [],
): PackCard[] | undefined {
    const packs = getCardPacks(save);
    if (packs <= 0 || pool.length === 0) {
        return undefined;
    }
    // Only the starter cards not owned yet (a Weapons pack bought first could have one)
    const given =
        save.cardStarterGiven || starter.length === 0
            ? []
            : starter.filter((card) => getOwnedVersions(save, card).length === 0);
    const first = given.map((card) => {
        const isNew = getVersionCopies(save, card, card.rarity) === 0;
        save.cards = {
            ...save.cards,
            [card.id]: Math.min(getVersionCopies(save, card, card.rarity) + 1, MAX_CARD_COPIES),
        };
        return { card, rarity: card.rarity, isNew };
    });
    const rest = rollPack(save, BASIC_PACK, random, pool, Math.max(0, PACK_SIZE - first.length));
    save.cardPacks = packs - 1;
    if (starter.length > 0) {
        save.cardStarterGiven = true;
    }
    return [...first, ...rest];
}

// A save that opened its free pack before it held the starter cards gets the ones it's missing,
// once (SaveData.cardStarterGiven): their own versions, a copy each
export function giveStarterCards(save: SaveData, starter: readonly CardDef[]): void {
    // Not while the free pack's held: it holds them
    if (save.cardStarterGiven || getCardPacks(save) > 0) {
        return;
    }
    for (const card of starter) {
        if (getOwnedVersions(save, card).length === 0) {
            save.cards = { ...save.cards, [card.id]: 1 };
        }
    }
    save.cardStarterGiven = true;
}

// Buys a pack in the Card shop with platinum tokens and opens it at once: undefined, and nothing spent, if
// it can't be bought
export function buyCardPack(
    save: SaveData,
    pack: PackDef,
    random: () => number,
    pool: readonly CardDef[] = packPool(save, pack),
): PackCard[] | undefined {
    if (cantBuyCardPack(save, pack) || pool.length === 0) {
        return undefined;
    }
    save.platinum = getPlatinum(save) - pack.price;
    return rollPack(save, pack, random, pool);
}

// A save's cards, as loaded (migrateSave): versions of known cards only (a card's own id is its
// own rarity's version, as saves before versions kept it), with whole counts in range, so a crafted
// save can't break the album
type CardFields = Pick<
    SaveData,
    | "cards"
    | "cardFoils"
    | "cardPacks"
    | "cardPacksOpened"
    | "cardsOnly"
    | "cardStarterGiven"
    | "platinum"
>;

export function migrateCards(data: Partial<CardFields>): CardFields {
    const out: CardFields = {};
    const whole = (value: unknown, max: number): number | undefined =>
        typeof value === "number" && isFinite(value)
            ? Math.min(Math.max(Math.floor(value), 0), max)
            : undefined;
    if (data.cards && typeof data.cards === "object" && !Array.isArray(data.cards)) {
        const cards: Record<string, number> = {};
        for (const [id, count] of Object.entries(data.cards)) {
            const copies = whole(count, MAX_CARD_COPIES);
            if (parseVersionKey(id) && copies) {
                cards[id] = copies;
            }
        }
        // A save from before tiers had cards of their own, or one that lost a lower tier's: each
        // tier owned brings its missing lower ones (giveLowerTiers)
        for (const id of Object.keys({ ...cards })) {
            const parsed = parseVersionKey(id);
            if (parsed && parsed.card.tier) {
                giveLowerTiers(cards, parsed.card);
            }
        }
        if (Object.keys(cards).length > 0) {
            out.cards = cards;
        }
    }
    // Foils: of versions owned, never more than their copies
    if (data.cardFoils && typeof data.cardFoils === "object" && !Array.isArray(data.cardFoils)) {
        const foils: Record<string, number> = {};
        for (const [id, count] of Object.entries(data.cardFoils)) {
            const copies = Math.min(whole(count, MAX_CARD_COPIES) ?? 0, out.cards?.[id] ?? 0);
            if (copies > 0) {
                foils[id] = copies;
            }
        }
        if (Object.keys(foils).length > 0) {
            out.cardFoils = foils;
        }
    }
    const packs = whole(data.cardPacks, MAX_CARD_PACKS);
    if (packs !== undefined) {
        out.cardPacks = packs;
    }
    const opened = whole(data.cardPacksOpened, Number.MAX_SAFE_INTEGER);
    if (opened) {
        out.cardPacksOpened = opened;
    }
    if (data.cardsOnly === true) {
        out.cardsOnly = true;
    }
    if (data.cardStarterGiven === true) {
        out.cardStarterGiven = true;
    }
    const points = whole(data.platinum, MAX_PLATINUM);
    if (points) {
        out.platinum = points;
    }
    return out;
}

// Until save version 13 the Kodai wand had one card, for all its levels. Its id is now the
// Beginner wand's, the first of the wand's tiers, so a save that had it is given the Master wand's
// (and the tiers between), to keep the wand to its top in a Cards only run.
export function migrateKodaiCard(cards: Record<string, number>): void {
    const owns = (card: CardDef) =>
        cardVersions(card).some((rarity) => (cards[versionKey(card, rarity)] ?? 0) > 0);
    const wand = getWeapon("kodai_wand");
    const master = CARD_BY_ID.get(tierCardId(wand.id, weaponTiers(wand).length - 1))!;
    if (!owns(CARD_BY_ID.get(tierCardId(wand.id, 0))!) || owns(master)) {
        return;
    }
    cards[versionKey(master, master.rarity)] = 1;
    giveLowerTiers(cards, master);
}
