import {
    ALL_CARDS,
    CARDS,
    CardDef,
    cardLine,
    cardNumber,
    cardTypeName,
} from "../../src/game/content/cards";
import { ITEMS } from "../../src/game/content/items";
import { RARITIES, Rarity } from "../../src/game/content/rarity";
import { STAT_INFO } from "../../src/game/content/stats";
import { StatKey } from "../../src/game/content/types";

export type CardSpec = {
    itemId: number;
    /** Select a definition when multiple game entries share a cache model. */
    key?: string;
    title?: string;
    type?: string;
    rarity?: Rarity;
    description?: string;
    setName?: string;
    number?: number;
    total?: number;
    foil?: boolean;
    isNew?: boolean;
};
export type CardFace = {
    title: string;
    type: string;
    rarity?: Rarity;
    description: string;
    setName: string;
    footer: string;
    foil: boolean;
    isNew: boolean;
};
type Entry = Pick<CardFace, "title" | "type" | "rarity" | "description"> & {
    key: string;
    itemId: number;
    // The game's own card, whose number in the set it prints
    card?: CardDef;
};

// The game's cards (content/cards.ts), as its album shows them: the same names, rarities, texts
// and numbers, so a printed card matches the one in the game
const entries: Entry[] = ALL_CARDS.map((card) => ({
    key: card.id,
    itemId: card.objId,
    type: cardTypeName(card.kind),
    title: card.name(),
    rarity: card.rarity,
    // The approved Shortbow example prints only its first sentence
    description: card.id === "weapon:shortbow" ? cardLine(card) : card.text(),
    card,
}));

// The game's other items, which have no card (utility items, and gear outside the reward caskets)
const cardKeys = new Set(entries.map((entry) => entry.key));
for (const item of ITEMS) {
    const key = item.kind + ":" + item.id;
    if (cardKeys.has(key)) continue;
    let description: string;
    if (item.kind === "gear") {
        description = Object.entries(item.stats)
            .map(([key, value]) => {
                const stat = STAT_INFO[key as StatKey];
                const percent = stat.unit === "percent";
                const number = Number((value * (percent ? 100 : 1)).toFixed(2));
                return `${number > 0 ? "+" : ""}${number}${percent ? "%" : ""} ${stat.label}`;
            })
            .join(", ");
    } else {
        description = item.description ?? "";
    }
    entries.push({
        key,
        itemId: item.objId,
        type: item.kind === "gear" ? "Gear" : "Utility",
        title: item.name,
        rarity: item.rarity,
        description,
    });
}

export function positiveInteger(value: unknown, field: string): asserts value is number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${field} must be a positive integer`);
    }
}

export function validateCard(spec: CardSpec): void {
    if (!Number.isSafeInteger(spec.itemId) || spec.itemId < 0)
        throw new Error("itemId must be a non-negative integer");
    for (const field of ["foil", "isNew"] as const) {
        if (spec[field] !== undefined && typeof spec[field] !== "boolean")
            throw new Error(`${field} must be a boolean`);
    }
    for (const field of ["title", "type", "description", "setName", "key"] as const) {
        if (spec[field] !== undefined && typeof spec[field] !== "string")
            throw new Error(`${field} must be text`);
    }
    if (spec.rarity !== undefined && !Object.hasOwn(RARITIES, spec.rarity))
        throw new Error("Unknown rarity: " + spec.rarity);
    if (spec.number !== undefined || spec.total !== undefined) {
        positiveInteger(spec.number, "number");
        positiveInteger(spec.total, "total");
        if (spec.number > spec.total) throw new Error("Card number exceeds set total");
    }
}

export function resolveFace(spec: CardSpec, item: { name: string; examine?: string }): CardFace {
    validateCard(spec);
    const matches = entries.filter(
        (e) => e.itemId === spec.itemId && (spec.key === undefined || spec.key === e.key),
    );
    if (matches.length > 1)
        throw new Error(
            `Item ${spec.itemId} has multiple card entries. Select a key: ${matches.map((e) => e.key).join(", ")}`,
        );
    const entry = matches[0];
    if (spec.key !== undefined && !entry)
        throw new Error(`No entry ${spec.key} for item ${spec.itemId}`);
    // Its number in the game's set (a card that's out), unless the spec gives one
    const number =
        spec.number !== undefined
            ? `${spec.number}/${spec.total}`
            : entry?.card && CARDS.includes(entry.card)
              ? cardNumber(entry.card)
              : undefined;
    return {
        title: spec.title ?? entry?.title ?? item.name,
        type: spec.type ?? entry?.type ?? "Item",
        rarity: spec.rarity ?? entry?.rarity,
        description: spec.description ?? entry?.description ?? item.examine ?? "",
        setName: spec.setName ?? "Run Escape",
        footer: number ?? `Item ${spec.itemId}`,
        foil: spec.foil ?? false,
        isNew: spec.isNew ?? false,
    };
}
