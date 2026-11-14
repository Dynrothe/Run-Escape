import { TURKEY_MAPS, TURKEY_OUTCOMES } from "./TurkeyDay";
import { ENEMY_BY_ID } from "./enemies";
import { RANDOM_EVENTS } from "./randomEvents";
import { TOMBS_ENEMIES, TOMBS_ROOM_CONTENT } from "./tombs";
import { PUMPKIN_MAPS, PUMPKIN_OUTCOMES } from "./trickOrTreat";
import { EnemyDef, MapDef } from "./types";

// Every enemy id anywhere in a piece of content. It goes by the values, not by
// what the fields are called, so a new way for one enemy to bring on another
// is picked up without touching this.
function collectEnemyIds(value: unknown, found: Set<string>, seen: Set<object>): void {
    if (typeof value === "string") {
        if (ENEMY_BY_ID.has(value)) {
            found.add(value);
        }
    } else if (value && typeof value === "object" && !seen.has(value)) {
        seen.add(value);
        for (const child of Object.values(value)) {
            collectEnemyIds(child, found, seen);
        }
    }
}

// The enemies a run on the map can bring on screen: its waves, events and
// bosses, what its rule brings in (a root heart), random events' too, and whatever they summon,
// split into, rise as or spawn in turn.
// remix: what the run's remixes bring in too (core/rules/remix.ts, remixContent)
export function getMapEnemies(map: MapDef, remix: unknown[] = []): EnemyDef[] {
    // The Tombs' rooms aren't waves, so their enemies are listed as they are
    const tombs = map.tombs ? TOMBS_ENEMIES.map((enemy) => enemy.id) : [];
    return [...reachEnemyIds(getMapContent(map, remix, tombs))].map((id) => ENEMY_BY_ID.get(id)!);
}

// What a run on the map can bring enemies on with, the Tombs' list (tombs) among it
function getMapContent(map: MapDef, remix: unknown[], tombs: string[]): unknown[] {
    const pumpkins = PUMPKIN_MAPS.includes(map.id) ? PUMPKIN_OUTCOMES : [];
    const turkeys = TURKEY_MAPS.includes(map.id) ? TURKEY_OUTCOMES : []; // Add turkeys to the list of outcomes to check for enemies
    // Random events go by their effects: the rest is names and lines of chat
    const randomEvents = RANDOM_EVENTS.map((event) => event.effect);
    return [
        map.waves,
        map.events,
        map.stages,
        map.fun?.bosses,
        map.raid,
        map.rule,
        map.lairs,
        pumpkins,
        turkeys,
        randomEvents,
        tombs,
        remix,
    ];
}

// Every enemy id in the content, and whatever they summon, split into, rise as or spawn in turn
function reachEnemyIds(content: unknown[]): Set<string> {
    const ids = new Set<string>();
    const seen = new Set<object>();
    collectEnemyIds(content, ids, seen);
    // A Set visits what's added to it as it goes
    for (const id of ids) {
        collectEnemyIds(ENEMY_BY_ID.get(id), ids, seen);
    }
    return ids;
}

// The Tombs of Amascut's rooms' own enemies, by room (a path's id, or "wardens"): each path's
// room and boss, and the Wardens', each without what another room or the rest of the map brings
// on too. What isn't any room's own is baked the whole raid (getTombsStageEnemies).
export function getTombsRooms(map: MapDef, remix: unknown[] = []): Map<string, Set<string>> {
    const rooms = new Map<string, Set<string>>();
    if (!map.tombs) {
        return rooms;
    }
    for (const path of map.tombs.paths) {
        const room = path.room;
        if (room) {
            const puzzle = room.puzzle ? TOMBS_ROOM_CONTENT[room.puzzle] : [];
            rooms.set(path.id, reachEnemyIds([puzzle, room.boss?.enemyId]));
        }
    }
    if (map.tombs.wardens) {
        rooms.set("wardens", reachEnemyIds(TOMBS_ROOM_CONTENT.wardens));
    }
    const elsewhere = reachEnemyIds(getMapContent(map, remix, []));
    const counts = new Map<string, number>();
    for (const ids of rooms.values()) {
        for (const id of ids) {
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }
    }
    for (const ids of rooms.values()) {
        for (const id of ids) {
            if (counts.get(id)! > 1 || elsewhere.has(id)) {
                ids.delete(id);
            }
        }
    }
    return rooms;
}

// The enemies to have baked at a point in a raid through the Tombs (GameClient bakes them as it
// gets there): everything but the rooms' own, each path's room till the path's done, and the
// Wardens' once at most one path's left, so they're baked while it's played and in by the time
// the party gets to them, or once they're being fought (the devtools' way straight there).
export function getTombsStageEnemies(
    map: MapDef,
    pathsDone: readonly string[],
    wardens: boolean,
    remix: unknown[] = [],
): EnemyDef[] {
    const paths = map.tombs?.paths.filter((path) => path.room) ?? [];
    const left = paths.filter((path) => !pathsDone.includes(path.id)).length;
    const unwanted = new Set<string>();
    for (const [room, ids] of getTombsRooms(map, remix)) {
        const wanted = room === "wardens" ? wardens || left <= 1 : !pathsDone.includes(room);
        if (!wanted) {
            for (const id of ids) {
                unwanted.add(id);
            }
        }
    }
    return getMapEnemies(map, remix).filter((enemy) => !unwanted.has(enemy.id));
}

const enemyIdsByMap = new WeakMap<MapDef, Set<string>>();

// getMapEnemies' ids, kept per map for what asks often (the HUD's quests)
export function getMapEnemyIds(map: MapDef): Set<string> {
    let ids = enemyIdsByMap.get(map);
    if (!ids) {
        ids = new Set(getMapEnemies(map).map((def) => def.id));
        enemyIdsByMap.set(map, ids);
    }
    return ids;
}
