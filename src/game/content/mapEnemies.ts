import { ENEMY_BY_ID } from "./enemies";
import { RANDOM_EVENTS } from "./randomEvents";
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
// bosses, random events' too, and whatever they summon, split into, rise as or
// spawn in turn.
export function getMapEnemies(map: MapDef): EnemyDef[] {
    const ids = new Set<string>();
    const seen = new Set<object>();
    // Random events go by their effects: the rest is names and lines of chat
    const randomEvents = RANDOM_EVENTS.map((event) => event.effect);
    collectEnemyIds([map.waves, map.events, map.fun?.bosses, randomEvents], ids, seen);
    // A Set visits what's added to it as it goes
    for (const id of ids) {
        collectEnemyIds(ENEMY_BY_ID.get(id), ids, seen);
    }
    return [...ids].map((id) => ENEMY_BY_ID.get(id)!);
}
