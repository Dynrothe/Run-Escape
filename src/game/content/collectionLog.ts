import { getBestVersion, getOwnedVersions } from "../core/cards";
import { SaveData } from "../core/save";
import { fmtNum, list, t, tp, tr } from "../i18n";
import { isMapOut } from "./acts";
import { CARDS, CARD_KINDS, CardDef, PACK_BY_ID, packCards } from "./cards";
import { EVOLUTIONS, EvolutionDef } from "./evolutions";
import { INVADERS } from "./invaders";
import { invaderName } from "./invasions";
import { CASKETS, CASKET_GEAR, CASKET_TIERS } from "./items";
import { FIGHT_MAPS, MAP_BY_ID, RAID_MAPS, getMap } from "./maps";
import { Rarity, rarityName } from "./rarity";
import { TROPHIES, TROPHY_BY_ID, TrophyDef } from "./trophies";
import { GearDef } from "./types";
import { describeUnlockTask } from "./unlocks";
import { WEAPONS } from "./weapons";

// The Collection log's rewards: a tab for each map a trophy comes from (TrophyDef.from), and each
// boss fight map (MapDef.fight) whose boss brings in a weapon, each listing the weapons it brings
// in and then its trophies. A new trophy map or boss fight gets its tab by itself; a campaign
// map's boss drops aren't listed.

// The log's sentences, for locales/en/gen.json: {task} is describeUnlockTask's
export const LOG_MESSAGES: Record<string, string> = {
    "log.bring_in": "{task} to bring it in.",
    "log.invasion": "Kill it when it invades an older map, from the Desert on.",
    "log.invasion_kills.one": "Killed invading an older map once.",
    "log.invasion_kills.other": "Killed invading an older map {n} times.",
    "log.caskets": "Found in {tiers} reward caskets.",
    "log.tier.easy": "easy",
    "log.tier.medium": "medium",
    "log.tier.hard": "hard",
    "log.tier.elite": "elite",
    "log.tier.master": "master",
};

export type RewardEntry = { id: string; name: string; objId: number; how: string; found: boolean };

// The map a trophy's from: a pumpkin's are the Hallowed Night's, a turkey's Thanksgiving, the
// Tombs' chest the raid.
export function getTrophyMap(trophy: TrophyDef): string {
    if (trophy.from.kind === "pumpkin") return "halloween";
    if (trophy.from.kind === "turkey") return "thanksgiving";
    if (trophy.from.kind === "tombs") return "tombs_of_amascut";
    return trophy.from.mapId;
}

// Whether a weapon's brought in on a map: its boss's drops, its chest's
function bringsIn(mapId: string): boolean {
    return WEAPONS.some(
        (weapon) => weapon.unlock && "mapId" in weapon.unlock && weapon.unlock.mapId === mapId,
    );
}

// Every map with trophies or a boss fight's weapon to find, each an entry in the log, but for a
// map that isn't out yet (isMapOut)
export const REWARD_MAPS: string[] = [
    ...new Set([
        ...TROPHIES.map(getTrophyMap),
        ...FIGHT_MAPS.filter((map) => bringsIn(map.id)).map((map) => map.id),
    ]),
].filter((mapId) => {
    const map = MAP_BY_ID.get(mapId);
    return !map || isMapOut(map);
});

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
    const trophies = TROPHIES.filter((trophy) => getTrophyMap(trophy) === mapId).map(
        ({ id, name, objId, how }) => ({
            id,
            name,
            objId,
            how,
            found: save.trophies.includes(id),
        }),
    );
    // An Act II map's boss as an Awakened invader (content/invasions.ts): a line counting each kill
    const invasions = INVADERS.filter((invader) => invader.mapId === mapId).map((invader) => {
        const kills = save.invasions?.[invader.id] ?? 0;
        return {
            id: invader.id,
            name: invaderName(invader.id),
            objId: getMap(mapId).iconObjId,
            how: kills > 0 ? tp("log.invasion_kills", kills) : t("log.invasion"),
            found: kills > 0,
        };
    });
    return [...weapons, ...trophies, ...invasions];
}

// The log as OSRS's client lays it out: tabs along the top, each a list of entries, each entry a
// page of items. Nothing here is saved: it's all read from what the save already keeps.
export type LogTab = "bosses" | "raids" | "clues" | "minigames" | "other" | "cards";

export const LOG_TABS: LogTab[] = ["bosses", "raids", "clues", "minigames", "other", "cards"];

export type LogItem = {
    // Unique in the whole log (a casket's Justiciar faceguard isn't the Theatre's trophy)
    key: string;
    id: string;
    name: string;
    objId: number;
    how: string;
    found: boolean;
    // How many, where the save counts them (an invader's kills)
    count?: number;
    // An evolution's: what it makes stays hidden until it's been made
    evolution?: EvolutionDef;
    // A card's (the Cards tab): its rarest version owned, shown on its slot and said in words
    version?: Rarity;
    // A trophy first found in a Card collection only run (SaveData.cardsOnlyFinds): a badge on
    // its slot, and a line in its description
    cardsOnly?: boolean;
};

export type LogEntry = {
    id: string;
    tab: LogTab;
    // English, for tl(); a Clues entry's and Evolutions' are keys for t() (nameKey)
    name: string;
    nameKey?: boolean;
    items: LogItem[];
    // The count shown under the title, OSRS's kill count line
    tally?: { key: string; n: number };
};

// A map's tab: a raid's under Raids (RAID_MAPS: the Tombs have no MapDef.raid), a seasonal
// event's under Minigames (it's played for its own goals, as a minigame is), a boss fight's and an
// act's under Bosses (an act map's rewards are its final boss's), and anything else under Other
export function getMapTab(mapId: string): LogTab {
    const map = MAP_BY_ID.get(mapId);
    if (!map) return "other";
    if (RAID_MAPS.includes(map)) return "raids";
    if (map.seasonal) return "minigames";
    if (map.fight || map.act) return "bosses";
    return "other";
}

// A casket gear's sentence: which reward caskets can hold it, and its task first if it has one
function casketHow(gear: GearDef): string {
    const tiers = CASKET_TIERS.filter((tier) => CASKETS[tier].rarityWeights[gear.rarity] > 0);
    const caskets = t("log.caskets", { tiers: list(tiers.map((tier) => t(`log.tier.${tier}`))) });
    return gear.unlock
        ? `${t("log.bring_in", { task: describeUnlockTask(gear.unlock) })} ${caskets}`
        : caskets;
}

const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "veryRare"];

// Every entry, tab by tab: the maps' (REWARD_MAPS; the screen puts them in order by name in the
// player's language), Clues' by rarity, then Other's Evolutions
export function getLogEntries(save: SaveData): LogEntry[] {
    const maps: LogEntry[] = REWARD_MAPS.map((mapId) => ({
        id: mapId,
        tab: getMapTab(mapId),
        name: getMap(mapId).name,
        items: getRewards(save, mapId).map((reward) => ({
            key: `${mapId}:${reward.id}`,
            id: reward.id,
            name: reward.name,
            objId: reward.objId,
            how: reward.how,
            found: reward.found,
            count: INVADERS.some((invader) => invader.id === reward.id)
                ? (save.invasions?.[reward.id] ?? 0)
                : undefined,
            ...(reward.found &&
                TROPHY_BY_ID.has(reward.id) &&
                save.cardsOnlyFinds?.includes(reward.id) && { cardsOnly: true }),
        })),
        tally: { key: "collection.wins", n: save.mapVictories[mapId] ?? 0 },
    }));
    const clues: LogEntry[] = RARITY_ORDER.map((rarity) => ({
        id: `clues_${rarity}`,
        tab: "clues" as const,
        name: `collection.clues.${rarity}`,
        nameKey: true,
        items: CASKET_GEAR.filter((gear) => gear.rarity === rarity).map((gear) => ({
            key: `gear:${gear.id}`,
            id: gear.id,
            name: gear.name,
            objId: gear.objId,
            how: casketHow(gear),
            found: save.foundGear.includes(gear.id),
        })),
        tally: { key: "collection.caskets_opened", n: save.casketsOpened },
    })).filter((entry) => entry.items.length > 0);
    const evolutions: LogEntry = {
        id: "evolutions",
        tab: "other",
        name: "collection.evolutions",
        nameKey: true,
        items: EVOLUTIONS.map((evolution) => ({
            key: `evolution:${evolution.into.id}`,
            id: evolution.into.id,
            name: evolution.into.name,
            objId: evolution.into.iconObjId,
            how: "",
            found: save.evolutionsMade.includes(evolution.into.id),
            evolution,
        })),
    };
    const entries = [...maps, ...clues, evolutions, ...getCardEntries(save)];
    return LOG_TABS.flatMap((tab) => entries.filter((entry) => entry.tab === tab));
}

// The Cards tab (content/cards.ts): a set for each kind of card, then the raids' finds (the Raider's
// pack's), each card at its rarest version owned. Its keys are the cards' own; the log's title
// total leaves the tab out (getLogTotal), as its entries count themselves.
export function getCardEntries(save: SaveData): LogEntry[] {
    const item = (card: CardDef): LogItem => {
        const best = getBestVersion(save, card);
        return {
            key: `card:${card.id}`,
            id: card.id,
            name: card.name(),
            objId: card.objId,
            how: best
                ? t("collection.cards.owned", {
                      rarity: rarityName(best),
                      list: list(
                          getOwnedVersions(save, card).map(({ rarity, copies }) =>
                              t("cards.version_copies", {
                                  rarity: rarityName(rarity),
                                  n: fmtNum(copies),
                              }),
                          ),
                      ),
                  })
                : t("cards.not_found"),
            found: best !== undefined,
            ...(best && { version: best }),
        };
    };
    const tally = { key: "collection.cards.packs_opened", n: save.cardPacksOpened ?? 0 };
    return [
        ...CARD_KINDS.map((kind) => ({
            id: `cards_${kind}`,
            tab: "cards" as const,
            name: `cards.kind.${kind}`,
            nameKey: true,
            items: CARDS.filter((card) => card.kind === kind).map(item),
            tally,
        })),
        {
            id: "cards_raids",
            tab: "cards" as const,
            name: "collection.cards.raids",
            nameKey: true,
            items: packCards(PACK_BY_ID.get("raids")!).map(item),
            tally,
        },
    ];
}

// The log's whole count, each item once: obtained over total. Cards (the Cards tab) are kept apart,
// each of its entries with its own count: the total is the game's own finds.
export function getLogTotal(entries: LogEntry[]): { found: number; total: number } {
    const items = new Map<string, boolean>();
    for (const entry of entries.filter((e) => e.tab !== "cards")) {
        for (const item of entry.items) {
            items.set(item.key, (items.get(item.key) ?? false) || item.found);
        }
    }
    return {
        found: [...items.values()].filter(Boolean).length,
        total: items.size,
    };
}
