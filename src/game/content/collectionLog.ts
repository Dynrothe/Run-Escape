import { SaveData } from "../core/save";
import { TROPHIES, TrophyDef } from "./trophies";
import { describeUnlockTask } from "./unlocks";
import { WEAPONS } from "./weapons";

// The Collection log's rewards: a tab for each map with trophies to find (the Hallowed Night's,
// the Theatre of Blood's), each listing the weapons it brings in and then its trophies.

export type RewardEntry = { id: string; name: string; objId: number; how: string; found: boolean };

// The map a trophy's from: a pumpkin's are the Hallowed Night's
function trophyMap(trophy: TrophyDef): string {
    return trophy.from.kind === "pumpkin" ? "halloween" : trophy.from.mapId;
}

// Every map with trophies to find, in the order they're listed, each a tab
export const REWARD_MAPS: string[] = [...new Set(TROPHIES.map(trophyMap))];

// A map's rewards: the weapons it brings in (its boss's drops, its chest's), then its trophies
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
    const trophies = TROPHIES.filter((trophy) => trophyMap(trophy) === mapId).map(
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
