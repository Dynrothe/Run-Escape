import { CARDS, CARD_BY_ID } from "../content/cards";
import { getCharacter } from "../content/characters";
import { PASSIVES } from "../content/passives";
import { RARITY_ORDER, Rarity } from "../content/rarity";
import { isAvailable } from "../content/unlocks";
import { WEAPONS, getWeapon } from "../content/weapons";
import { CardCaps, isOfferable } from "./Upgrades";
import { getBestVersion } from "./cards";
import type { SaveData } from "./save";

// Card collection only runs (SaveData.cardsOnly): level ups offer only the weapons and passives
// the player owns a card of, no rarer than the rarest version owned (Upgrades.CardCaps). The caps
// are worked out from the save when the run starts and go into the run's setup (SimOptions.cardCaps,
// or each co-op player's loadout), so the run plays the same on every copy of it and from the same
// seed. An item still has to be in the game for them too (isAvailable): a card never brings in
// what a map task hasn't.

// What a run needs at least, so a level up always has something to offer: the adventurer's
// starting weapon's card, and cards of this many more weapons and passives they could be offered
export const CARD_RUN_WEAPONS = 2;
export const CARD_RUN_PASSIVES = 3;

// A save's caps: each weapon and passive card owned -> its rarest version owned
export function getCardCaps(save: SaveData): Map<string, Rarity> {
    const caps = new Map<string, Rarity>();
    for (const card of CARDS) {
        if (card.kind !== "trophy") {
            const best = getBestVersion(save, card);
            if (best) {
                caps.set(card.id, best);
            }
        }
    }
    return caps;
}

// What a save's collection is short of, for a run as this adventurer: undefined when it can play
// one. Items count, not versions: any version of a card will do.
export type CardRunShortfall = {
    // The starting weapon's card, when it isn't owned (its weapon's id)
    startingWeapon?: string;
    weapons: number;
    passives: number;
};

export function getCardRunShortfall(
    save: SaveData,
    characterId: string,
    caps: CardCaps = getCardCaps(save),
): CardRunShortfall | undefined {
    const character = getCharacter(characterId);
    const unlocked = new Set(save.unlockedItems);
    const startingWeapon = character.startingWeapon;
    const family = getWeapon(startingWeapon).family;
    // As rollChoices offers them: not the starting weapon's family (one godsword's enough)
    const weapons = WEAPONS.filter(
        (weapon) =>
            weapon.id !== startingWeapon &&
            (!family || weapon.family !== family) &&
            !weapon.evolved &&
            !weapon.pickOnly &&
            (!weapon.style || weapon.style === character.style) &&
            isOfferable(weapon, unlocked) &&
            caps.has(`weapon:${weapon.id}`),
    ).length;
    const passives = PASSIVES.filter(
        (passive) => isAvailable(passive, unlocked) && caps.has(`passive:${passive.id}`),
    ).length;
    // An adventurer who finds no items, or carries only the one weapon, needs no more cards
    const more = !character.noItems && (character.maxWeapons ?? 2) > 1;
    const shortfall: CardRunShortfall = {
        ...(!caps.has(`weapon:${startingWeapon}`) && { startingWeapon }),
        weapons: more ? Math.max(0, CARD_RUN_WEAPONS - weapons) : 0,
        passives: more && !character.noItems ? Math.max(0, CARD_RUN_PASSIVES - passives) : 0,
    };
    return shortfall.startingWeapon || shortfall.weapons > 0 || shortfall.passives > 0
        ? shortfall
        : undefined;
}

// The caps as a co-op loadout carries them, kept small for the relay's cap: a card's id, and
// "@<n>" (RARITY_ORDER's index) when its rarest version is rarer than its own
export function encodeCardCaps(caps: CardCaps): string[] {
    return [...caps].map(([id, rarity]) => {
        const card = CARD_BY_ID.get(id);
        return card && rarity !== card.rarity ? `${id}@${RARITY_ORDER.indexOf(rarity)}` : id;
    });
}

// A co-op player's caps from their loadout (another player's game could send anything): weapon
// and passive cards that exist, at versions they come in
export function decodeCardCaps(raw: unknown): Map<string, Rarity> | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const caps = new Map<string, Rarity>();
    for (const entry of raw.slice(0, 1000)) {
        if (typeof entry !== "string") {
            continue;
        }
        const [id, index, extra] = entry.split("@");
        const card = CARD_BY_ID.get(id);
        const version = index === undefined ? card?.rarity : RARITY_ORDER[Number(index)];
        if (
            card &&
            card.kind !== "trophy" &&
            extra === undefined &&
            (index === undefined || /^[0-3]$/.test(index)) &&
            version &&
            RARITY_ORDER.indexOf(version) >= RARITY_ORDER.indexOf(card.rarity)
        ) {
            caps.set(id, version);
        }
    }
    return caps;
}
