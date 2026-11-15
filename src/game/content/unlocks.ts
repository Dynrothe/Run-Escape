import { list, t, tp, tr } from "../i18n";
import { CHARACTERS } from "./characters";
import { getEnemy } from "./enemies";
import { ITEMS } from "./items";
import { getMap } from "./maps";
import { PASSIVES } from "./passives";
import { TROPHY_BY_ID } from "./trophies";
import { UnlockTask } from "./types";
import { WEAPONS, getWeapon } from "./weapons";

// Weapons, passives and casket items that a task on a map brings in, the way
// adventurers come in. Everything without an unlock is there from the start.
export type LockableItem = {
    id: string;
    name: string;
    kind: "weapon" | "passive" | "item";
    iconObjId: number;
    // A passive's interface sprite, shown instead of the item (PassiveDef.iconSpriteId)
    iconSpriteId?: number;
    unlock: UnlockTask;
};

export const LOCKABLE_ITEMS: LockableItem[] = [
    ...WEAPONS.flatMap((w): LockableItem[] =>
        w.unlock
            ? [{ id: w.id, name: w.name, kind: "weapon", iconObjId: w.iconObjId, unlock: w.unlock }]
            : [],
    ),
    ...PASSIVES.flatMap((p): LockableItem[] =>
        p.unlock
            ? [
                  {
                      id: p.id,
                      name: p.name,
                      kind: "passive",
                      iconObjId: p.iconObjId,
                      iconSpriteId: p.iconSpriteId,
                      unlock: p.unlock,
                  },
              ]
            : [],
    ),
    ...ITEMS.flatMap((i): LockableItem[] =>
        i.unlock
            ? [{ id: i.id, name: i.name, kind: "item", iconObjId: i.objId, unlock: i.unlock }]
            : [],
    ),
];

export const LOCKABLE_ITEM_BY_ID: Map<string, LockableItem> = new Map(
    LOCKABLE_ITEMS.map((i) => [i.id, i]),
);

// Whether a weapon, passive or casket item can turn up in a run: always when
// it has no unlock, otherwise once it's been unlocked. Everything can when
// there's no unlocked set (tests, and the balancing bot by default).
export function isAvailable(
    def: { id: string; unlock?: UnlockTask },
    unlocked: ReadonlySet<string> | undefined,
): boolean {
    return !def.unlock || !unlocked || unlocked.has(def.id);
}

// The tasks' sentences, for locales/en/gen.json. Each whole, with the names as {placeholders}
// (and the "a" of "Find a ..." in it), so a language can reorder it. The "In" ones are for a
// task shown with its map, the others for where the map is clear.
export const UNLOCK_MESSAGES: Record<string, string> = {
    "unlock.beat_map": "Beat {map}",
    "unlock.beat_map.hard": "Beat {map} on hard",
    "unlock.kill_boss": "Kill {enemy}",
    "unlock.kill_boss.in": "Kill {enemy} in {map}",
    "unlock.survive": "Survive {time}",
    "unlock.survive.in": "Survive {time} in {map}",
    "unlock.realm_caskets": "Open {count} caskets in the Shadow Realm in one run",
    "unlock.realm_caskets.in": "Open {count} caskets in the Shadow Realm in one run in {map}",
    "unlock.pieces": "Find {pieces}",
    "unlock.survive.minutes.other": "{n} minutes",
    "unlock.survive.clock": "{minutes}:{seconds}",
    "unlock.raid_chest": "Find a {trophy} in its chest",
    "unlock.raid_chest.hard": "Find a {trophy} in its chest on hard or expert",
    "unlock.raid_chest.in": "Find a {trophy} in the {map} chest",
    "unlock.raid_chest.in.hard": "Find a {trophy} in the {map} chest on hard or expert",
};

// "10 minutes", or "6:06" when rounding would promise an unlock too soon
function describeSurvival(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest === 0
        ? tp("unlock.survive.minutes", minutes)
        : t("unlock.survive.clock", { minutes, seconds: String(rest).padStart(2, "0") });
}

// "Beat Barrows", "Kill Count Draynor in Lumbridge" (or just "Kill Count
// Draynor" where it's clear which map it's on)
export function describeUnlockTask(task: UnlockTask, withMap = true): string {
    const map = tr(`map.${task.mapId}.name`, getMap(task.mapId).name);
    const suffix = withMap ? ".in" : "";
    switch (task.kind) {
        case "beatMap":
            return t(task.hard ? "unlock.beat_map.hard" : "unlock.beat_map", { map });
        case "killBoss": {
            const enemy = getEnemy(task.enemyId);
            return t(`unlock.kill_boss${suffix}`, {
                enemy: tr(`enemy.${enemy.id}.name`, enemy.name),
                map,
            });
        }
        case "survive":
            return t(`unlock.survive${suffix}`, { time: describeSurvival(task.seconds), map });
        case "realmCaskets":
            return t(`unlock.realm_caskets${suffix}`, { count: task.count, map });
        case "pieces":
            return t("unlock.pieces", {
                pieces: list(
                    task.trophyIds.map((id) => {
                        const trophy = TROPHY_BY_ID.get(id)!;
                        return tr(`trophy.${trophy.id}.name`, trophy.name);
                    }),
                ),
            });
        case "raidChest": {
            // A thing to do, as the rest are: callers build sentences on it ("... to unlock")
            const trophy = TROPHY_BY_ID.get(task.trophyId)!;
            const hard = trophy.from.kind === "raid" && trophy.from.hard;
            return t(`unlock.raid_chest${withMap ? ".in" : ""}${hard ? ".hard" : ""}`, {
                trophy: tr(`trophy.${trophy.id}.name`, trophy.name),
                map,
            });
        }
    }
}

// What a task on a map brings in, for its card: adventurers (shown with their
// starting weapon) and items
export type MapReward = {
    kind: "character" | LockableItem["kind"];
    id: string;
    name: string;
    iconObjId: number;
    iconSpriteId?: number;
    unlock: UnlockTask;
};

export function getMapRewards(mapId: string): MapReward[] {
    const characters = CHARACTERS.flatMap((c): MapReward[] => {
        if (c.unlock?.mapId !== mapId) {
            return [];
        }
        const weapon = getWeapon(c.startingWeapon);
        return [
            {
                kind: "character",
                id: c.id,
                name: c.name,
                iconObjId: weapon.levels[0].objId ?? weapon.iconObjId,
                unlock: c.unlock,
            },
        ];
    });
    const items = LOCKABLE_ITEMS.filter((i) => i.unlock.mapId === mapId);
    return [...characters, ...items];
}
