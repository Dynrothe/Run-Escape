import { tr } from "../i18n";
import { ACT_MAPS } from "./maps";

// Relics (act-2-fallen-empire.md, 9.2), Leagues-style: each Act II map beaten opens the next tier,
// one relic is picked a tier on the adventurer screen (SaveData.relics) and stays picked across
// runs. Each is a small rule on its hero in the sim (Sim's relic rules), so in co-op each player's
// are their own. They're on campaign and Act II maps (maps.ts, takesRelics), off in boss fights,
// raids and the Tombs; and a run with one on sets no hard-mode record (save.ts, recordRun).

export type RelicTier = 1 | 2 | 3 | 4;

export type RelicDef = {
    id: string;
    tier: RelicTier;
    name: string;
    description: string;
    // Shown in its slot
    iconObjId: number;
};

export const RELIC_TIERS: RelicTier[] = [1, 2, 3, 4];

export const RELICS: RelicDef[] = [
    {
        id: "endless_harvest",
        tier: 1,
        name: "Endless Harvest",
        description: "Every 20 seconds, the bones within 10 tiles fly to you.",
        // Bones
        iconObjId: 526,
    },
    {
        id: "production_prodigy",
        tier: 1,
        name: "Production Prodigy",
        description:
            "Caskets never stop the run: their gear's worn if it's better and alched if not, " +
            "and alching pays 25% more.",
        // Casket
        iconObjId: 405,
    },
    {
        id: "trickster",
        tier: 1,
        name: "Trickster",
        description: "Every 15 seconds, the next hit on you misses.",
        // Rogue mask
        iconObjId: 5554,
    },
    {
        id: "globetrotter",
        tier: 2,
        name: "Globetrotter",
        description: "Power-ups drop 20% more often and wait twice as long to be picked up.",
        // Amulet of glory(4)
        iconObjId: 1712,
    },
    {
        id: "bankers_note",
        tier: 2,
        name: "Banker's Note",
        description: "Coins come to you from anywhere.",
        // Coins
        iconObjId: 995,
    },
    {
        id: "fairys_flight",
        tier: 2,
        name: "Fairy's Flight",
        description: "10% faster, and once every 10 seconds, walking into a crowd throws it aside.",
        // Dramen staff
        iconObjId: 772,
    },
    {
        id: "bloodthirsty",
        tier: 3,
        name: "Bloodthirsty",
        description: "Every 50 kills heal 5% of your hitpoints.",
        // Blood rune
        iconObjId: 565,
    },
    {
        id: "specialist",
        tier: 3,
        name: "Specialist",
        description: "One weapon slot fewer, and your weapons hit 25% harder.",
        // Dragon dagger
        iconObjId: 1215,
    },
    {
        id: "grimoire",
        tier: 3,
        name: "Grimoire",
        description: "Start with a second weapon, a Common one of your class.",
        // Tome of Fire
        iconObjId: 20714,
    },
    {
        id: "last_recall",
        tier: 4,
        name: "Last Recall",
        description:
            "Once a run, falling takes you back to the start with half your hitpoints, and " +
            "stuns everything near you there.",
        // Ectophial
        iconObjId: 4251,
    },
    {
        id: "reloaded",
        tier: 4,
        name: "Reloaded",
        description:
            "Twice a run, keep a level up's offer for later, and take it at a later level up.",
        // Rune arrow
        iconObjId: 892,
    },
];

export const RELIC_BY_ID: Map<string, RelicDef> = new Map(RELICS.map((relic) => [relic.id, relic]));

// The numbers each one goes by
export const ENDLESS_HARVEST = { every: 20, range: 10 };
export const PRODUCTION_PRODIGY = { alch: 1.25 };
export const TRICKSTER = { every: 15 };
export const GLOBETROTTER = { rate: 0.2, lasts: 2 };
// A push through: walking with this many enemies (not bosses) within reach throws them aside
export const FAIRYS_FLIGHT = { moveSpeed: 0.1, every: 10, reach: 1.5, crowd: 4, push: 0.5 };
export const BLOODTHIRSTY = { kills: 50, heal: 0.05 };
export const SPECIALIST = { might: 0.25, slots: 1 };
// Stunned: everything within radius of the start, for seconds (bosses aren't)
export const LAST_RECALL = { hp: 0.5, radius: 8, stun: 3 };
export const RELOADED = { keeps: 2 };

// How many tiers are open: one for each Act II map beaten
export function getOpenRelicTiers(mapVictories: Record<string, number>): number {
    const beaten = ACT_MAPS.filter((map) => (mapVictories[map.id] ?? 0) > 0).length;
    return Math.min(beaten, RELIC_TIERS.length);
}

// What a list of ids comes to: relics this game knows, one a tier (the last of each), in tiers up
// to `tiers`, in tier order. A save, or another player's game, could hold anything.
export function cleanRelics(ids: unknown, tiers: number = RELIC_TIERS.length): string[] {
    const byTier = new Map<number, string>();
    for (const id of Array.isArray(ids) ? ids : []) {
        const relic = typeof id === "string" ? RELIC_BY_ID.get(id) : undefined;
        if (relic && relic.tier <= tiers) {
            byTier.set(relic.tier, relic.id);
        }
    }
    return [...byTier.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id);
}

// The relics picked, with this one in its tier (or that tier empty for undefined)
export function pickRelic(ids: readonly string[], tier: RelicTier, id?: string): string[] {
    const others = ids.filter((other) => RELIC_BY_ID.get(other)?.tier !== tier);
    return cleanRelics(id && RELIC_BY_ID.get(id)?.tier === tier ? [...others, id] : others);
}

export function relicName(relic: RelicDef): string {
    return tr(`relic.${relic.id}.name`, relic.name);
}

export function relicDescription(relic: RelicDef): string {
    return tr(`relic.${relic.id}.desc`, relic.description);
}
