import { CardDef, PACK_SIZE, PackDef, cardDefId, cardWeight } from "../content/cards";
import { RARITY_ORDER, Rarity } from "../content/rarity";
import { LOCKABLE_ITEM_BY_ID } from "../content/unlocks";
import { WEAPONS } from "../content/weapons";
import { lastCardRarities, packRoller } from "./cards";

// A pack's odds for one player (the Card shop's preview): how often each card of their pool turns
// up, and how its cards' item rarities and versions come out. Worked out by opening
// PREVIEW_PACKS packs of it, rolled as a bought one is (packRoller), on a seeded generator, so
// the same save always gets the same figures; exactPackOdds has the figures they come close to.

export const PREVIEW_PACKS = 100_000;

export type PackOdds = {
    packs: number;
    // Card id -> the share of packs it's in, at least once
    perCard: Map<string, number>;
    // The share of cards whose item is each rarity, and whose version is
    items: Record<Rarity, number>;
    versions: Record<Rarity, number>;
    // The share of packs with at least one Very rare item
    veryRarePack: number;
};

const none = (): Record<Rarity, number> => ({ common: 0, uncommon: 0, rare: 0, veryRare: 0 });

// Mulberry32: small and seeded, for the preview's packs (never a run's, which has its own Rng)
function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A string's hash, for the seed: the same pack and pool, the same figures
function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}

// What the odds depend on: the pack and the cards in its pool (the save's unlocks)
export function packOddsKey(pack: PackDef, pool: readonly CardDef[]): string {
    return `${pack.id}|${pool.map((card) => card.id).join(",")}`;
}

// Opens a pack's packs a chunk at a time, so a phone's page never stalls on all of them at once:
// step(n) opens n more, done says when PREVIEW_PACKS (or `packs`) are, result() gives the odds
export function simulatePackOdds(
    pack: PackDef,
    pool: readonly CardDef[],
    packs = PREVIEW_PACKS,
): { step(n: number): void; readonly done: boolean; result(): PackOdds } {
    const roll = packRoller(pack, pool);
    const random = seeded(hash(packOddsKey(pack, pool)));
    const hits = new Map<string, number>();
    const items = none();
    const versions = none();
    let veryRare = 0;
    let opened = 0;
    const seen = new Set<string>();
    return {
        step(n) {
            for (let i = 0; i < n && opened < packs && pool.length > 0; i++, opened++) {
                seen.clear();
                let hasVeryRare = false;
                for (const { card, rarity } of roll(random)) {
                    items[card.rarity]++;
                    versions[rarity]++;
                    hasVeryRare ||= card.rarity === "veryRare";
                    if (!seen.has(card.id)) {
                        seen.add(card.id);
                        hits.set(card.id, (hits.get(card.id) ?? 0) + 1);
                    }
                }
                if (hasVeryRare) {
                    veryRare++;
                }
            }
        },
        get done() {
            return opened >= packs || pool.length === 0;
        },
        result() {
            const cards = Math.max(opened * PACK_SIZE, 1);
            const share = (counts: Record<Rarity, number>) => {
                const out = none();
                for (const rarity of RARITY_ORDER) {
                    out[rarity] = counts[rarity] / cards;
                }
                return out;
            };
            return {
                packs: opened,
                perCard: new Map(
                    pool.map((card) => [card.id, (hits.get(card.id) ?? 0) / Math.max(opened, 1)]),
                ),
                items: share(items),
                versions: share(versions),
                veryRarePack: veryRare / Math.max(opened, 1),
            };
        },
    };
}

// Each card of a pack: the chance it rolls each version (its last one only lastCardRarities)
function slotRolls(pack: PackDef): Record<Rarity, number>[] {
    return Array.from({ length: PACK_SIZE }, (_, i) => {
        const rolls = i === PACK_SIZE - 1 ? lastCardRarities(pack.odds) : RARITY_ORDER;
        const rolled = rolls.filter((r) => pack.odds[r] > 0);
        const sum = rolled.reduce((s, r) => s + pack.odds[r], 0);
        const out = none();
        for (const r of rolled) {
            out[r] = pack.odds[r] / sum;
        }
        return out;
    });
}

// For each version rolled, the version a card comes in and each card's chance, as packRoller
// picks: among the cards that come in it, by weight, else the commonest rarity that has some
function versionPicks(
    pack: PackDef,
    pool: readonly CardDef[],
): Record<Rarity, { version: Rarity; chance: Map<CardDef, number> }> {
    const sets = RARITY_ORDER.map((version) => ({
        version,
        cards: pool.filter((c) => RARITY_ORDER.indexOf(c.rarity) <= RARITY_ORDER.indexOf(version)),
    }));
    const commonest = sets.find((set) => set.cards.length > 0);
    const out = {} as Record<Rarity, { version: Rarity; chance: Map<CardDef, number> }>;
    for (const set of sets) {
        const from = set.cards.length > 0 ? set : (commonest ?? set);
        const total = from.cards.reduce((sum, c) => sum + cardWeight(pack, c), 0);
        out[set.version] = {
            version: from.version,
            chance: new Map(
                from.cards.map((c) => [c, total > 0 ? cardWeight(pack, c) / total : 0]),
            ),
        };
    }
    return out;
}

// The same odds worked out exactly, which the simulated ones come close to (a test checks)
export function exactPackOdds(pack: PackDef, pool: readonly CardDef[]): PackOdds {
    const picks = versionPicks(pack, pool);
    const items = none();
    const versions = none();
    const missed = new Map<CardDef, number>(pool.map((c) => [c, 1]));
    let noVeryRare = 1;
    for (const slot of slotRolls(pack)) {
        const here = new Map<CardDef, number>();
        let veryRare = 0;
        for (const rolled of RARITY_ORDER) {
            if (slot[rolled] === 0 || pool.length === 0) {
                continue;
            }
            const { version, chance } = picks[rolled];
            versions[version] += slot[rolled] / PACK_SIZE;
            for (const [card, p] of chance) {
                const q = slot[rolled] * p;
                here.set(card, (here.get(card) ?? 0) + q);
                items[card.rarity] += q / PACK_SIZE;
                if (card.rarity === "veryRare") {
                    veryRare += q;
                }
            }
        }
        for (const [card, q] of here) {
            missed.set(card, missed.get(card)! * (1 - q));
        }
        noVeryRare *= 1 - veryRare;
    }
    return {
        packs: Infinity,
        perCard: new Map(pool.map((card) => [card.id, 1 - missed.get(card)!])),
        items,
        versions,
        veryRarePack: 1 - noVeryRare,
    };
}

// The chance a card of this rarity from a pack comes in that version: for the preview's example
// of one card
export function versionChanceFor(
    pack: PackDef,
    pool: readonly CardDef[],
    cardRarity: Rarity,
    version: Rarity,
): number {
    const picks = versionPicks(pack, pool);
    let ofRarity = 0;
    let inVersion = 0;
    for (const slot of slotRolls(pack)) {
        for (const rolled of RARITY_ORDER) {
            for (const [card, p] of picks[rolled].chance) {
                if (card.rarity === cardRarity) {
                    const q = slot[rolled] * p;
                    ofRarity += q;
                    if (picks[rolled].version === version) {
                        inVersion += q;
                    }
                }
            }
        }
    }
    return ofRarity > 0 ? inVersion / ofRarity : 0;
}

// A player's pack odds, simulated once for their pool and kept till it changes
const cache = new Map<string, PackOdds>();

export function getCachedPackOdds(pack: PackDef, pool: readonly CardDef[]): PackOdds | undefined {
    return cache.get(packOddsKey(pack, pool));
}

export function cachePackOdds(pack: PackDef, pool: readonly CardDef[], odds: PackOdds): void {
    cache.set(packOddsKey(pack, pool), odds);
}

// The map whose task unlocks a locked card's thing, for the preview's "Unlock in" (the game's own
// unlock data: a weapon's, passive's or gear's task, an evolution's from what it evolves from, a
// trophy's map), or undefined for one there from the start
export function cardUnlockMap(card: CardDef): string | undefined {
    const id = cardDefId(card);
    if (card.kind === "trophy") {
        return card.mapId;
    }
    const own = LOCKABLE_ITEM_BY_ID.get(id)?.unlock.mapId;
    if (own !== undefined || card.kind !== "weapon") {
        return own;
    }
    // An evolution: what it evolves from that a map brings in
    const from = WEAPONS.find((w) => w.evolution?.into === id && w.unlock);
    return from?.unlock?.mapId;
}
