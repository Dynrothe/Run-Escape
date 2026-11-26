import type { SaveData } from "../core/save";
import { isMapOut } from "./acts";
import { ENEMIES, ENEMY_BY_ID } from "./enemies";
import { getMapEnemies, getTombsRooms } from "./mapEnemies";
import { ALL_MAPS } from "./maps";
import { MONSTER_DROPS, MONSTER_LORE, MonsterLore } from "./monsterLore";
import { EnemyDef, MapDef, RunEventDef, WaveDef } from "./types";

// The Monster diary: every monster in the game, with its model, stats, where and when it turns up
// and some of what the Old School RuneScape world says about it.
//
// Nothing about stats or spawns is written out by hand here: both are read from the same
// definitions the game runs on (ENEMIES, and each map's waves, events, stages, raid rooms and lairs),
// so the diary can't fall out of step with the game. Only the prose (monsterLore.ts) is written.

// How a monster comes to a map. "wave": on the clock, from `from` to `until` seconds into the run
// (no `until`: to its end). "elite", "ring", "boss" and "finalBoss" are events at `from`. "pool": one
// of the bosses a fun map picks at random. "lair": rises from a lair on an explore map. "other":
// brought in by something else (another enemy, a map rule, a random event).
export type AppearanceHow =
    | "wave"
    | "elite"
    | "ring"
    | "boss"
    | "finalBoss"
    | "pool"
    | "lair"
    | "other";

export type Appearance = {
    mapId: string;
    how: AppearanceHow;
    from?: number;
    until?: number;
    // A raid room's or a quest fight's part's name, when the time is from its start
    place?: string;
    // Tombs of Amascut: the path's room it's in
    room?: string;
};

export type DiaryVariant = {
    def: EnemyDef;
    appearances: Appearance[];
};

export type DiaryKind = "monster" | "boss" | "mechanic";

export type DiaryEntry = {
    // Stable id: the lead variant's enemy id
    id: string;
    // The English name, as the lore is keyed
    name: string;
    kind: DiaryKind;
    // One per EnemyDef sharing the name (a boss's phases, an enemy's look-alikes on other maps)
    variants: DiaryVariant[];
    // The map ids it appears on, in the map list's order
    mapIds: string[];
    // The earliest it can come on the clock, over all its maps; Infinity for those with no time
    earliest: number;
    lore?: MonsterLore;
    // Its notable unique drops in OSRS, if it has any worth a mention
    drops: string[];
};

// Things the fights are built from that are named like monsters but aren't creatures: the
// diary lists them apart, as the fight's mechanics
export const MECHANIC_NAMES: ReadonlySet<string> = new Set([
    "Totem",
    "Boulder",
    "Cracked boulder",
    "Rubble",
    "Het's Seal",
    "Orb of Darkness",
    "Orb of Lightning",
    "Burning Orb",
    "Frozen Orb",
    "Unstable Orb",
    "Palm of Resourcefulness",
    "Trap",
    "Obelisk",
    "Core",
    "Energy Siphon",
    "Energy",
    "Jug",
    "Blood Cloud",
    "Wave",
    "Egg",
    "Parasitic egg",
    "Sword",
    "Bolt",
    "Vardorvis' axe",
    "Corpse",
    "Large Tendril",
    "Tentacle",
    "Purple portal",
    "Blue portal",
    "Yellow portal",
    "Red portal",
    "Jal-Nib",
]);

const waveIds = (wave: WaveDef): string[] => wave.enemies.map((e) => e.id);

// Where each enemy id is on a list of waves: from the first wave it's in to the end of the last
function addWaves(
    found: Map<string, Appearance[]>,
    mapId: string,
    waves: WaveDef[],
    place?: string,
): void {
    const sorted = [...waves].sort((a, b) => a.start - b.start);
    const first = new Map<string, number>();
    const last = new Map<string, number>();
    sorted.forEach((wave, i) => {
        for (const id of waveIds(wave)) {
            if (!first.has(id)) {
                first.set(id, i);
            }
            last.set(id, i);
        }
    });
    for (const [id, i] of first) {
        const end = last.get(id)! + 1;
        push(found, id, {
            mapId,
            how: "wave",
            from: sorted[i].start,
            until: end < sorted.length ? sorted[end].start : undefined,
            place,
        });
    }
}

function addEvents(
    found: Map<string, Appearance[]>,
    mapId: string,
    events: RunEventDef[],
    place?: string,
): void {
    for (const event of events) {
        push(found, event.enemyId, { mapId, how: event.kind, from: event.at, place });
    }
}

function push(found: Map<string, Appearance[]>, id: string, appearance: Appearance): void {
    const list = found.get(id) ?? [];
    // One of each kind per place: an elite that comes every few minutes is one line, from its first
    const same = list.find(
        (a) =>
            a.how === appearance.how && a.place === appearance.place && a.room === appearance.room,
    );
    if (same) {
        if (
            appearance.from !== undefined &&
            (same.from === undefined || appearance.from < same.from)
        ) {
            same.from = appearance.from;
        }
        return;
    }
    list.push(appearance);
    found.set(id, list);
}

// Every enemy id a map can bring on, and how
export function mapAppearances(map: MapDef): Map<string, Appearance[]> {
    const found = new Map<string, Appearance[]>();
    addWaves(found, map.id, map.waves);
    addEvents(found, map.id, map.events);
    for (const stage of map.stages ?? []) {
        addEvents(found, map.id, stage.events, stage.name);
    }
    for (const room of map.raid?.rooms ?? []) {
        addWaves(found, map.id, room.waves, room.name);
        addEvents(found, map.id, room.events, room.name);
        push(found, room.boss, { mapId: map.id, how: "boss", from: room.at, place: room.name });
    }
    for (const id of map.fun?.bosses.pool ?? []) {
        push(found, id, { mapId: map.id, how: "pool", from: map.fun!.bosses.firstAt });
    }
    for (const lair of map.lairs ?? []) {
        push(found, lair.enemyId, { mapId: map.id, how: "lair" });
    }
    for (const [room, ids] of getTombsRooms(map)) {
        for (const id of ids) {
            push(found, id, { mapId: map.id, how: "other", room });
        }
    }
    // Whatever's left over comes by some other way: a summon, a split, a rule, a random event
    for (const enemy of getMapEnemies(map)) {
        if (!found.has(enemy.id)) {
            found.set(enemy.id, [{ mapId: map.id, how: "other" }]);
        }
    }
    return found;
}

// The maps the diary reads: those out for players, so an act that isn't released (isMapOut) keeps
// its monsters to itself, as the Collection log does, and not ScapeRune's dev maps
function diaryMapList(): MapDef[] {
    return ALL_MAPS.filter((map) => !map.dev && isMapOut(map));
}

function build(): DiaryEntry[] {
    const maps = diaryMapList();
    const perMap = maps.map((map) => ({ map, found: mapAppearances(map) }));
    // What the maps left out bring on: a monster only there isn't listed
    const elsewhere = new Set(
        ALL_MAPS.filter((map) => !maps.includes(map)).flatMap((map) => [
            ...mapAppearances(map).keys(),
        ]),
    );
    const byName = new Map<string, DiaryEntry>();
    for (const def of ENEMIES) {
        // An id that's listed twice is the one the game uses: the last (ENEMY_BY_ID's)
        if (ENEMY_BY_ID.get(def.id) !== def) {
            continue;
        }
        const appearances = perMap.flatMap(({ found }) => found.get(def.id) ?? []);
        if (appearances.length === 0 && elsewhere.has(def.id)) {
            continue;
        }
        let entry = byName.get(def.name);
        if (!entry) {
            entry = {
                id: def.id,
                name: def.name,
                kind: "monster",
                variants: [],
                mapIds: [],
                earliest: Infinity,
                lore: MONSTER_LORE[def.name],
                drops: MONSTER_DROPS[def.name] ?? [],
            };
            byName.set(def.name, entry);
        }
        entry.variants.push({ def, appearances });
    }
    const order = new Map(maps.map((map, i) => [map.id, i]));
    for (const entry of byName.values()) {
        const ids = new Set<string>();
        for (const variant of entry.variants) {
            for (const a of variant.appearances) {
                ids.add(a.mapId);
                if (a.from !== undefined) {
                    entry.earliest = Math.min(entry.earliest, a.from);
                }
            }
        }
        entry.mapIds = [...ids].sort((a, b) => order.get(a)! - order.get(b)!);
        entry.kind = MECHANIC_NAMES.has(entry.name)
            ? "mechanic"
            : entry.variants.some((v) => v.def.boss)
              ? "boss"
              : "monster";
    }
    return [...byName.values()];
}

let cached: DiaryEntry[] | undefined;

// Every entry, in the order monsters first meet the player: by the first map they're on, then
// ordinary monsters before bosses, then by name
export function getDiaryEntries(): DiaryEntry[] {
    if (!cached) {
        const order = new Map(diaryMapList().map((map, i) => [map.id, i]));
        const rank = (entry: DiaryEntry) =>
            entry.mapIds.length ? Math.min(...entry.mapIds.map((id) => order.get(id)!)) : 9999;
        const kind = { monster: 0, boss: 1, mechanic: 2 };
        cached = build().sort(
            (a, b) =>
                kind[a.kind] - kind[b.kind] || rank(a) - rank(b) || a.name.localeCompare(b.name),
        );
    }
    return cached;
}

// Ids of the maps a monster's on, for the diary's map filter: every map with someone in it
export function getDiaryMaps(): MapDef[] {
    const used = new Set(getDiaryEntries().flatMap((entry) => entry.mapIds));
    return diaryMapList().filter((map) => used.has(map.id));
}

// The diary's total kills of a monster from the save's counts: every variant that shares its name
export function diaryKills(entry: DiaryEntry, kills: Record<string, number>): number {
    return entry.variants.reduce((sum, v) => sum + (kills[v.def.id] ?? 0), 0);
}

// Whether the player knows a monster, so its page is filled in rather than "???": they've killed
// one of its forms, or, for a fight's mechanic (an orb, a portal: many can't be killed), beaten a
// map it's on. Nothing's given away before it's met: a lair's boss, an invader, an act's finale.
export function isDiaryKnown(
    entry: DiaryEntry,
    save: Pick<SaveData, "enemyKills" | "mapVictories">,
): boolean {
    if (diaryKills(entry, save.enemyKills) > 0) {
        return true;
    }
    return entry.kind === "mechanic" && entry.mapIds.some((id) => (save.mapVictories[id] ?? 0) > 0);
}
