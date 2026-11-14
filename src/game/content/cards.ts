import { t, tr } from "../i18n";
import { isMapOut } from "./acts";
import { MAP_BY_ID } from "./maps";
import { PASSIVES, passiveDescription, passiveName } from "./passives";
import { PET_BY_ID } from "./pets";
import { RARITY_ORDER, Rarity, rarityName } from "./rarity";
import { CARDS_ICON_OBJ } from "./titleIcons";
import { TROPHIES, TrophyDef, trophyName } from "./trophies";
import type { PassiveDef, WeaponDef } from "./types";
import { WEAPONS, weaponDescription, weaponName } from "./weapons";

// Cards: a card for each weapon, passive and Collection log trophy the game already has, with that
// thing's cache item as its picture. Packs are bought with the coins runs pay out and opened on the
// Cards screen (core/cards.ts, ui/CardsScreen.tsx). They only touch a run that's Card collection
// only (core/cardRuns.ts). No real money is ever involved: coins are only earned by playing.

export type CardKind = "weapon" | "passive" | "trophy";

export type CardDef = {
    // "<kind>:<the weapon's, passive's or trophy's id>". It's kept in SaveData.cards, so it's as
    // fixed as the ids it's made from.
    id: string;
    kind: CardKind;
    // Its own rarity, the commonest version it comes in (cardVersions)
    rarity: Rarity;
    // The picture: the item's icon, or an interface sprite in its place (Piety's)
    objId: number;
    spriteId?: number;
    // The map it comes from, when it isn't in from the start: its card's only out once the map is
    mapId?: string;
    name(): string;
    text(): string;
};

// Cards in each pack
export const PACK_SIZE = 5;
// Packs a save starts with, free, once: every save, old ones too, until SaveData.cardPacks is set
export const STARTER_PACKS = 1;
// The most a save holds, of packs and of copies of a card: a crafted save's numbers stop here
export const MAX_CARD_PACKS = 999;
export const MAX_CARD_COPIES = 9999;

// Versions: every card comes in a version for each rarity from its own up to Very rare (`rarity`
// is its own, the commonest it comes in). A weapon's and a passive's own rarity is the game's
// (WeaponDef.rarity, PassiveDef.rarity: so an evolution's only Very rare); a trophy's goes by how
// hard it is to find. A version is the quality its item can
// be offered at in a Card collection only run (core/cardRuns.ts), so a player only gets a Rare
// sword there once they've the Rare version of its card or better.
export function cardVersions(card: CardDef): Rarity[] {
    return RARITY_ORDER.slice(RARITY_ORDER.indexOf(card.rarity));
}

// A version's key in SaveData.cards: the card's id for its own rarity (as saves have always kept
// it), "<id>@<rarity>" for the rarer ones
export function versionKey(card: CardDef, rarity: Rarity): string {
    return rarity === card.rarity ? card.id : `${card.id}@${rarity}`;
}

// The card and version a saved key is, or undefined for one that isn't a version of any card
export function parseVersionKey(key: string): { card: CardDef; rarity: Rarity } | undefined {
    const [id, rarity, extra] = key.split("@");
    const card = CARD_BY_ID.get(id);
    if (!card || extra !== undefined) {
        return undefined;
    }
    if (rarity === undefined) {
        return { card, rarity: card.rarity };
    }
    const version = RARITY_ORDER.find((r) => r === rarity);
    return version && version !== card.rarity && cardVersions(card).includes(version)
        ? { card, rarity: version }
        : undefined;
}

function trophyRarity(trophy: TrophyDef): Rarity {
    if (PET_BY_ID.has(trophy.id)) return "veryRare";
    const from = trophy.from;
    if (from.kind === "raid" || from.kind === "tombs") return "rare";
    // A drop at 1 in 100 or rarer (a kill's, a pumpkin's, a turkey's)
    if ("chance" in from && from.chance !== undefined && from.chance <= 1 / 100) return "rare";
    return "uncommon";
}

function trophyMap(trophy: TrophyDef): string | undefined {
    const from = trophy.from;
    if (from.kind === "pumpkin") return "halloween";
    if (from.kind === "turkey") return "thanksgiving";
    if (from.kind === "tombs") return "tombs_of_amascut";
    return from.mapId;
}

function weaponCard(weapon: WeaponDef): CardDef {
    return {
        id: `weapon:${weapon.id}`,
        kind: "weapon",
        rarity: weapon.rarity,
        objId: weapon.iconObjId,
        mapId: weapon.unlock?.mapId,
        name: () => weaponName(weapon),
        text: () => weaponDescription(weapon),
    };
}

function passiveCard(passive: PassiveDef): CardDef {
    return {
        id: `passive:${passive.id}`,
        kind: "passive",
        rarity: passive.rarity,
        objId: passive.iconObjId,
        spriteId: passive.iconSpriteId,
        mapId: passive.unlock?.mapId,
        name: () => passiveName(passive),
        text: () => passiveDescription(passive),
    };
}

function trophyCard(trophy: TrophyDef): CardDef {
    return {
        id: `trophy:${trophy.id}`,
        kind: "trophy",
        rarity: trophyRarity(trophy),
        objId: trophy.objId,
        mapId: trophyMap(trophy),
        name: () => trophyName(trophy),
        text: () => tr(`trophy.${trophy.id}.how`, trophy.how),
    };
}

// Every card there is, out or not: a save keeps the ones it has (migrateSave), so a card from a
// map that isn't out yet isn't dropped from a tester's save
export const ALL_CARDS: CardDef[] = [
    ...WEAPONS.map(weaponCard),
    ...PASSIVES.map(passiveCard),
    ...TROPHIES.map(trophyCard),
];

export const CARD_BY_ID: Map<string, CardDef> = new Map(ALL_CARDS.map((c) => [c.id, c]));

// Whether a card's in the game: not one from a map that isn't out (isMapOut)
export function isCardOut(card: CardDef): boolean {
    const map = card.mapId === undefined ? undefined : MAP_BY_ID.get(card.mapId);
    return !map || isMapOut(map);
}

// The cards a pack can give and the album lists, in the album's order
export const CARDS: CardDef[] = ALL_CARDS.filter(isCardOut);

export const CARD_KINDS: CardKind[] = ["weapon", "passive", "trophy"];

// A card's number in the set, as its footer shows it ("12/148"): its place in the album
const CARD_NUMBERS = new Map(CARDS.map((card, i) => [card.id, i + 1]));

export function cardNumber(card: CardDef): string {
    return `${CARD_NUMBERS.get(card.id) ?? "?"}/${CARDS.length}`;
}

// The first sentence of a card's text, for a small card's one short line
export function cardLine(card: CardDef): string {
    const text = card.text();
    const end = text.search(/[.!?](\s|$)/);
    return end < 0 ? text : text.slice(0, end + 1);
}

// A kind's tab ("Weapons"), and what a card of it says it is ("Weapon")
export function cardKindName(kind: CardKind): string {
    return t(`cards.kind.${kind}`);
}

export function cardTypeName(kind: CardKind): string {
    return t(`cards.type.${kind}`);
}

export function cardRarityName(rarity: Rarity): string {
    return rarityName(rarity);
}

// The Card shop's packs. Each holds PACK_SIZE cards of its own pool (`holds`), each card rolling a
// version's rarity by its odds and then a card of the pool that comes in that version; its last
// card, in a pack with odds for three rarities or more, rolls only those above the lowest, so the
// pack has something better than its commonest (core/cards.ts, lastCardRarities). Prices are in
// the coins runs pay out, spent as the Armoury and the Wardrobe spend them.
export type PackDef = {
    id: string;
    name: string;
    // What it holds, for the shop
    description: string;
    // The item on its front, and its wrapper's colour
    objId: number;
    color: string;
    price: number;
    odds: Record<Rarity, number>;
    holds: (card: CardDef) => boolean;
};

const STANDARD_ODDS: Record<Rarity, number> = {
    common: 0.45,
    uncommon: 0.35,
    rare: 0.16,
    veryRare: 0.04,
};

// The raids' maps, for their pack
const RAID_PACK_MAPS = ["theatre_of_blood", "tombs_of_amascut"];

function iconOf(cardId: string): number {
    const card = CARD_BY_ID.get(cardId);
    if (!card) {
        throw new Error("No card " + cardId);
    }
    return card.objId;
}

export const PACKS: PackDef[] = [
    {
        id: "adventurer",
        name: "Adventurer's pack",
        description: "Any card in the game.",
        objId: iconOf("weapon:scimitar"),
        color: "#7a5a2e",
        price: 2500,
        odds: STANDARD_ODDS,
        holds: () => true,
    },
    {
        id: "weapons",
        name: "Armoury pack",
        description: "Weapons only.",
        objId: iconOf("weapon:dark_bow"),
        color: "#55606c",
        price: 3000,
        odds: STANDARD_ODDS,
        holds: (card) => card.kind === "weapon",
    },
    {
        id: "passives",
        name: "Prayer book pack",
        description: "Passives only: prayers, gear and spells.",
        objId: iconOf("passive:amulet_of_glory"),
        color: "#3d5a80",
        price: 3000,
        odds: STANDARD_ODDS,
        holds: (card) => card.kind === "passive",
    },
    {
        id: "trophies",
        name: "Collector's pack",
        description: "Collection log trophies and pets only.",
        objId: iconOf("trophy:jar_of_dreams"),
        color: "#8a6a1e",
        price: 3000,
        odds: { common: 0, uncommon: 0.55, rare: 0.35, veryRare: 0.1 },
        holds: (card) => card.kind === "trophy",
    },
    {
        id: "raids",
        name: "Raider's pack",
        description: "Only what the Theatre of Blood and the Tombs of Amascut bring.",
        objId: iconOf("weapon:scythe_of_vitur"),
        color: "#7a2420",
        price: 5000,
        odds: { common: 0, uncommon: 0, rare: 0.75, veryRare: 0.25 },
        holds: (card) => card.mapId !== undefined && RAID_PACK_MAPS.includes(card.mapId),
    },
    {
        id: "champion",
        name: "Champion's pack",
        description: "Any card, with better odds of the rarer versions.",
        objId: CARDS_ICON_OBJ,
        color: "#2f5e3e",
        price: 7500,
        odds: { common: 0, uncommon: 0.45, rare: 0.4, veryRare: 0.15 },
        holds: () => true,
    },
];

export const PACK_BY_ID: Map<string, PackDef> = new Map(PACKS.map((p) => [p.id, p]));

// The starter pack, and any pack a save holds unopened, is this one
export const BASIC_PACK = PACKS[0];

export function packName(pack: PackDef): string {
    return tr(`cards.pack.${pack.id}.name`, pack.name);
}

export function packDescription(pack: PackDef): string {
    return tr(`cards.pack.${pack.id}.desc`, pack.description);
}

// A pack's pool: the cards in the game it can give
export function packCards(pack: PackDef): CardDef[] {
    return CARDS.filter(pack.holds);
}
