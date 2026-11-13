import { tr } from "../i18n";
import { ACT_MAPS, CAMPAIGN_MAPS, takesRelics } from "./maps";
import type { MapDef, RunEventDef } from "./types";

// Remixes (docs/design/act-2-fallen-empire.md, 8.3): an Act II map's rule on an earlier map. Beating
// the Act II map opens its remix on every first-campaign map, and once all four Act II maps are
// beaten, on the other three of them too (not its own). Any of them can be on at once. What a remix
// puts on a run (its rule placed on the map, its enemies, its lights) is core/rules/remix.ts; this is
// what they are, which maps take them, their coins and their records' keys.

export const REMIX_IDS = ["overgrown", "shadow", "frozen", "dark"] as const;
export type RemixId = (typeof REMIX_IDS)[number];

export type RemixDef = {
    id: RemixId;
    // The Act II map whose rule it is, and whose win opens it
    from: string;
    // The word before a map's name ("Overgrown Lumbridge")
    name: string;
    // What it does, in a line, for its switch
    description: string;
    // Its switch's icon: the Act II map's
    iconObjId: number;
    // Elites it brings in besides its share of the crowd (RemixRun.waves), by the map's clock: what
    // its rule needs (a Strangled Bear's trail, the fire elites' embers, light leeches' light)
    events: RunEventDef[];
};

export const REMIXES: RemixDef[] = [
    {
        id: "overgrown",
        from: "stranglewood",
        name: "Overgrown",
        description: "Roots creep in from the edges. They slow and hurt you; your hits cut them.",
        iconObjId: 28319,
        events: [
            { at: 240, kind: "elite", enemyId: "strangled_bear" },
            { at: 520, kind: "elite", enemyId: "strangled_bear" },
            { at: 780, kind: "elite", enemyId: "strangled_bear" },
        ],
    },
    {
        id: "shadow",
        from: "lassar_undercity",
        name: "Shadow",
        description:
            "Black puddles open into the Shadow Realm: richer drops, other enemies, sanity draining.",
        iconObjId: 28323,
        // The realm brings its own (RealmRuleDef.elite, risers)
        events: [],
    },
    {
        id: "frozen",
        from: "ghorrock",
        name: "Frozen",
        description:
            "The cold rises all the time. Braziers, fire elites' embers and fire weapons keep it down.",
        iconObjId: 28321,
        events: [
            { at: 90, kind: "elite", enemyId: "ghorrock_pyrefiend" },
            { at: 230, kind: "elite", enemyId: "ghorrock_pyrefiend" },
            { at: 380, kind: "elite", enemyId: "ghorrock_pyrefiend" },
            { at: 500, kind: "elite", enemyId: "flaming_pyrelord" },
            { at: 660, kind: "elite", enemyId: "ghorrock_pyrefiend" },
            { at: 780, kind: "elite", enemyId: "flaming_pyrelord" },
        ],
    },
    {
        id: "dark",
        from: "scar",
        name: "Dark",
        description: "Darkness, with a light round you. Weapons only aim at what's lit.",
        iconObjId: 28325,
        events: [
            { at: 150, kind: "elite", enemyId: "light_leech" },
            { at: 480, kind: "elite", enemyId: "light_leech" },
            { at: 750, kind: "elite", enemyId: "light_leech" },
        ],
    },
];

export const REMIX_BY_ID: ReadonlyMap<string, RemixDef> = new Map(REMIXES.map((r) => [r.id, r]));

// Coins: +30% for one, +25% for each more (+105% with all four), added to the run's other bonuses
// under their cap (COIN_BONUS_CAP)
export const REMIX_COINS_FIRST = 0.3;
export const REMIX_COINS_MORE = 0.25;
export function getRemixCoins(count: number): number {
    return count <= 0 ? 0 : REMIX_COINS_FIRST + REMIX_COINS_MORE * (count - 1);
}

// The added enemies' share of the crowd, all the remixes on together: the crowd stays its size
export const REMIX_CROWD_SHARE = 0.25;

// Only known ids, each once, in REMIX_IDS' order
export function cleanRemixes(ids: readonly unknown[] | undefined): RemixId[] {
    if (!Array.isArray(ids)) {
        return [];
    }
    return REMIX_IDS.filter((id) => ids.includes(id));
}

// The maps that can take remixes: every first-campaign survival run, and the Act II maps (those
// once the act's four are beaten: isRemixOpen)
export function getMapRemixes(map: MapDef): RemixId[] {
    if (map.act) {
        return REMIXES.filter((remix) => remix.from !== map.id).map((remix) => remix.id);
    }
    return CAMPAIGN_MAPS.includes(map) && takesRelics(map) ? [...REMIX_IDS] : [];
}

// Whether a remix is open on a map, for a player who's beaten these maps
export function isRemixOpen(
    mapVictories: Readonly<Record<string, number>>,
    map: MapDef,
    id: RemixId,
): boolean {
    const remix = REMIX_BY_ID.get(id);
    if (!remix || !getMapRemixes(map).includes(id) || !(mapVictories[remix.from] > 0)) {
        return false;
    }
    return !map.act || ACT_MAPS.every((act) => (mapVictories[act.id] ?? 0) > 0);
}

// How hard a remix's rule is on a map: 0.7 of its Act II map's on Lumbridge, rising to all of it on
// the Inferno (and on the Act II maps)
export function getRemixToughness(map: MapDef): number {
    const index = CAMPAIGN_MAPS.indexOf(map);
    if (index < 0) {
        return 1;
    }
    return 0.7 + (0.3 * index) / Math.max(1, CAMPAIGN_MAPS.length - 1);
}

// A set of remixes' record key (SaveData.remixVictories): the map and its remixes in alphabetical
// order, "lumbridge:dark+frozen"
export function remixKey(mapId: string, remixes: readonly RemixId[]): string {
    return `${mapId}:${[...remixes].sort().join("+")}`;
}

// The remixes in a record key, or undefined for one that isn't
export function parseRemixKey(key: string): { mapId: string; remixes: RemixId[] } | undefined {
    const at = key.lastIndexOf(":");
    if (at <= 0) {
        return undefined;
    }
    const parts = key.slice(at + 1).split("+");
    const remixes = cleanRemixes(parts);
    if (remixes.length === 0 || remixes.length !== parts.length) {
        return undefined;
    }
    return { mapId: key.slice(0, at), remixes };
}

export function remixName(id: RemixId): string {
    return tr(`remix.${id}.name`, REMIX_BY_ID.get(id)!.name);
}

export function remixDescription(id: RemixId): string {
    return tr(`remix.${id}.description`, REMIX_BY_ID.get(id)!.description);
}

// The words before the map's name: each remix's, or "Fallen" for all four
export function remixPrefix(remixes: readonly RemixId[]): string {
    if (remixes.length === REMIX_IDS.length) {
        return tr("remix.fallen", "Fallen");
    }
    return cleanRemixes(remixes).map(remixName).join(" ");
}

// The Dark remix's fires (core/rules/remix.ts): a small fire on the ground, and its light, which
// weapons aim by (the Scar's fires')
export const REMIX_FIRE_LOC = 5249;
export const REMIX_FIRE_LIGHT = { radius: 3, color: 0xff9a4a, flicker: 0.15 };
// The Frozen remix's ice, a tile at a time over the map's own ground (the cache's slippery ice)
export const REMIX_ICE_LOC = 21148;
