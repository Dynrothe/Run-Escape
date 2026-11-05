import { SaveData } from "../core/save";
import { FIGHT_MAPS, getMap } from "./maps";
import { TROPHIES, TrophyDef } from "./trophies";
import { describeUnlockTask } from "./unlocks";
import { WEAPONS } from "./weapons";

// The Collection log's rewards: a tab for each map a trophy comes from (TrophyDef.from), and each
// boss fight map (MapDef.fight) whose boss brings in a weapon, each listing the weapons it brings
// in and then its trophies. A new trophy map or boss fight gets its tab by itself; a campaign
// map's boss drops aren't listed. Combat Achievements' tier rewards have a tab of their own, last.

export type RewardEntry = { id: string; name: string; objId: number; how: string; found: boolean };

// The Combat Achievements tab's id, in place of a map's
export const COMBAT_TAB = "combat";

// The tab a trophy's in: its map's (a pumpkin's are the Hallowed Night's), or Combat Achievements'
function trophyTab(trophy: TrophyDef): string {
    switch (trophy.from.kind) {
        case "pumpkin":
            return "halloween";
        case "combatTier":
            return COMBAT_TAB;
        default:
            return trophy.from.mapId;
    }
}

// Whether a weapon's brought in on a map: its boss's drops, its chest's
function bringsIn(mapId: string): boolean {
    return WEAPONS.some(
        (weapon) => weapon.unlock && "mapId" in weapon.unlock && weapon.unlock.mapId === mapId,
    );
}

// Every map with trophies or a boss fight's weapon to find, in the order they're listed, each a
// tab, then Combat Achievements'
export const REWARD_TABS: string[] = [
    ...new Set([
        ...TROPHIES.map(trophyTab).filter((tab) => tab !== COMBAT_TAB),
        ...FIGHT_MAPS.filter((map) => bringsIn(map.id)).map((map) => map.id),
        COMBAT_TAB,
    ]),
];

// A tab's name: its map's
export function rewardTabName(tab: string): string {
    return tab === COMBAT_TAB ? "Combat Achievements" : getMap(tab).name;
}

// A tab's rewards: the weapons its map brings in (its boss's drops, its chest's), then its
// trophies
export function getRewards(save: SaveData, mapId: string): RewardEntry[] {
    // (not one that's its trophy: the rapier's is the Ghrazi rapier, and says it brings it in)
    const weapons = WEAPONS.filter((weapon) => {
        const unlock = weapon.unlock;
        return (
            unlock !== undefined &&
            "mapId" in unlock &&
            unlock.mapId === mapId &&
            !(unlock.kind === "raidChest" && unlock.trophyId === weapon.id)
        );
    }).map((weapon) => ({
        id: weapon.id,
        name: weapon.name,
        objId: weapon.iconObjId,
        how: `${describeUnlockTask(weapon.unlock!)} to bring it in.`,
        found: save.unlockedItems.includes(weapon.id),
    }));
    const trophies = TROPHIES.filter((trophy) => trophyTab(trophy) === mapId).map(
        ({ id, name, objId, how }) => ({
            id,
            name,
            objId,
            how,
            found: save.trophies.includes(id),
        }),
    );
    return [...weapons, ...trophies];
}
