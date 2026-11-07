import { SaveData } from "../core/save";
import { t, tr } from "../i18n";
import { FIGHT_MAPS } from "./maps";
import { TROPHIES, TrophyDef } from "./trophies";
import { describeUnlockTask } from "./unlocks";
import { WEAPONS } from "./weapons";

// The Collection log's rewards: a tab for each map a trophy comes from (TrophyDef.from), and each
// boss fight map (MapDef.fight) whose boss brings in a weapon, each listing the weapons it brings
// in and then its trophies. A new trophy map or boss fight gets its tab by itself; a campaign
// map's boss drops aren't listed.

// The log's sentences, for locales/en/gen.json: {task} is describeUnlockTask's
export const LOG_MESSAGES: Record<string, string> = {
    "log.bring_in": "{task} to bring it in.",
};

export type RewardEntry = { id: string; name: string; objId: number; how: string; found: boolean };

// The map a trophy's from: a pumpkin's are the Hallowed Night's
function trophyMap(trophy: TrophyDef): string {
    return trophy.from.kind === "pumpkin" ? "halloween" : trophy.from.mapId;
}

// Whether a weapon's brought in on a map: its boss's drops, its chest's
function bringsIn(mapId: string): boolean {
    return WEAPONS.some(
        (weapon) => weapon.unlock && "mapId" in weapon.unlock && weapon.unlock.mapId === mapId,
    );
}

// Every map with trophies or a boss fight's weapon to find, in the order they're listed, each a
// tab
export const REWARD_MAPS: string[] = [
    ...new Set([
        ...TROPHIES.map(trophyMap),
        ...FIGHT_MAPS.filter((map) => bringsIn(map.id)).map((map) => map.id),
    ]),
];

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
        name: tr(`weapon.${weapon.id}.name`, weapon.name),
        objId: weapon.iconObjId,
        how: t("log.bring_in", { task: describeUnlockTask(weapon.unlock!) }),
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
