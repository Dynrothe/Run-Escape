import {
    getArmouryCost,
    getNextUpgrade,
    getUpgradeLine,
    getUpgradedGear,
} from "../content/armoury";
import { CHARACTERS } from "../content/characters";
import { ENEMY_BY_ID } from "../content/enemies";
import { ITEM_BY_ID, getGear } from "../content/items";
import { ALL_MAPS, MAPS, isDevMap, isFunMap } from "../content/maps";
import { QUESTS, QUEST_BY_ID } from "../content/quests";
import { SHOP_UPGRADES, SHOP_UPGRADE_BY_ID, getUpgradeCost } from "../content/shop";
import { CharacterDef, QuestDef, Stats, UnlockTask, emptyStats } from "../content/types";
import { LOCKABLE_ITEMS, LOCKABLE_ITEM_BY_ID, LockableItem, isAvailable } from "../content/unlocks";
import { WEAPONS } from "../content/weapons";

// Progress kept between runs: banked coins, permanent upgrades, unlocks and
// records. Versioned so older saves can be upgraded when the format changes.

// 2: wins per map (maps unlock in order)
// 3: items unlocked by map tasks
// 4: endless records
// 5: gear found, and the Armoury's upgrades
// 6: quests, and the kills and caskets they count
// 7: evolutions made, for the Collection log
export const SAVE_VERSION = 7;

// Characters taken out of the game for now; saves keep them unlocked for when
// they're back
const RETIRED_CHARACTERS = ["dwarf"];

export type SaveData = {
    version: number;
    coins: number;
    totalCoins: number;
    // Shop upgrade id -> ranks bought
    upgrades: Record<string, number>;
    // Coins spent on upgrades, given back by a refund
    upgradesSpent: number;
    unlockedCharacters: string[];
    // Ids of the weapons, passives and casket items brought in by map tasks
    unlockedItems: string[];
    runs: number;
    victories: number;
    // Map id -> times beaten; beating a map unlocks the next
    mapVictories: Record<string, number>;
    totalKills: number;
    bestSeconds: number;
    bestLevel: number;
    // Map id -> the furthest an endless run there has got
    endlessBest: Record<string, EndlessRecord>;
    // Ids of the gear that's come out of caskets, which can be upgraded in
    // the Armoury
    foundGear: string[];
    // Piece id -> times it's been upgraded in the Armoury
    armoury: Record<string, number>;
    // For quests: enemy id -> times killed, and reward caskets opened, over
    // every run since quests came in
    enemyKills: Record<string, number>;
    casketsOpened: number;
    // Ids of the quests done (and paid out)
    questsDone: string[];
    // The weapons evolved into at least once
    evolutionsMade: string[];
};

// The round reached, and how long the run lasted
export type EndlessRecord = { round: number; seconds: number };

export function createSave(): SaveData {
    return {
        version: SAVE_VERSION,
        coins: 0,
        totalCoins: 0,
        upgrades: {},
        upgradesSpent: 0,
        unlockedCharacters: CHARACTERS.filter((c) => !c.unlock).map((c) => c.id),
        unlockedItems: [],
        runs: 0,
        victories: 0,
        mapVictories: {},
        totalKills: 0,
        bestSeconds: 0,
        bestLevel: 0,
        endlessBest: {},
        foundGear: [],
        armoury: {},
        enemyKills: {},
        casketsOpened: 0,
        questsDone: [],
        evolutionsMade: [],
    };
}

// Brings any older save up to the current version, filling in what's missing
export function migrateSave(raw: unknown): SaveData {
    const save = createSave();
    if (!raw || typeof raw !== "object") {
        return save;
    }
    const data = raw as Partial<SaveData>;
    const num = (value: unknown, fallback: number) =>
        typeof value === "number" && isFinite(value) ? value : fallback;
    save.coins = num(data.coins, 0);
    save.totalCoins = num(data.totalCoins, save.coins);
    if (data.upgrades && typeof data.upgrades === "object") {
        for (const [id, rank] of Object.entries(data.upgrades)) {
            const upgrade = SHOP_UPGRADE_BY_ID.get(id);
            if (upgrade) {
                save.upgrades[id] = Math.min(Math.max(num(rank, 0), 0), upgrade.maxRank);
            }
        }
    }
    save.upgradesSpent = num(data.upgradesSpent, estimateSpent(save.upgrades));
    if (Array.isArray(data.unlockedCharacters)) {
        for (const id of data.unlockedCharacters) {
            const known = CHARACTERS.some((c) => c.id === id) || RETIRED_CHARACTERS.includes(id);
            if (known && !save.unlockedCharacters.includes(id)) {
                save.unlockedCharacters.push(id);
            }
        }
    }
    if (Array.isArray(data.unlockedItems)) {
        for (const id of data.unlockedItems) {
            if (LOCKABLE_ITEM_BY_ID.has(id) && !save.unlockedItems.includes(id)) {
                save.unlockedItems.push(id);
            }
        }
    }
    save.runs = num(data.runs, 0);
    save.victories = num(data.victories, 0);
    if (data.mapVictories && typeof data.mapVictories === "object") {
        for (const [id, wins] of Object.entries(data.mapVictories)) {
            if (MAPS.some((m) => m.id === id) && num(wins, 0) > 0) {
                save.mapVictories[id] = num(wins, 0);
            }
        }
    } else if (save.victories > 0) {
        // From before there were maps: every win was in Lumbridge
        save.mapVictories[MAPS[0].id] = save.victories;
    }
    save.totalKills = num(data.totalKills, 0);
    save.bestSeconds = num(data.bestSeconds, 0);
    save.bestLevel = num(data.bestLevel, 0);
    if (data.endlessBest && typeof data.endlessBest === "object") {
        for (const [id, record] of Object.entries(data.endlessBest)) {
            const round = num(record?.round, 0);
            if (ALL_MAPS.some((m) => m.id === id) && round > 0) {
                save.endlessBest[id] = { round, seconds: num(record?.seconds, 0) };
            }
        }
    }
    if (Array.isArray(data.foundGear)) {
        for (const id of data.foundGear) {
            if (isCasketGear(id) && !save.foundGear.includes(id)) {
                save.foundGear.push(id);
            }
        }
    }
    if (data.armoury && typeof data.armoury === "object") {
        for (const [id, times] of Object.entries(data.armoury)) {
            const most = isCasketGear(id) ? getUpgradeLine(id).length - 1 : 0;
            const upgrades = Math.min(Math.max(Math.floor(num(times, 0)), 0), most);
            if (upgrades > 0) {
                save.armoury[id] = upgrades;
            }
        }
    }
    if (data.enemyKills && typeof data.enemyKills === "object") {
        for (const [id, kills] of Object.entries(data.enemyKills)) {
            const count = Math.floor(num(kills, 0));
            if (ENEMY_BY_ID.has(id) && count > 0) {
                save.enemyKills[id] = count;
            }
        }
    }
    save.casketsOpened = Math.max(Math.floor(num(data.casketsOpened, 0)), 0);
    if (Array.isArray(data.evolutionsMade)) {
        for (const id of data.evolutionsMade) {
            if (WEAPONS.some((w) => w.id === id) && !save.evolutionsMade.includes(id)) {
                save.evolutionsMade.push(id);
            }
        }
    }
    if (Array.isArray(data.questsDone)) {
        for (const id of data.questsDone) {
            if (QUEST_BY_ID.has(id) && !save.questsDone.includes(id)) {
                save.questsDone.push(id);
            }
        }
    }
    // Adventurers and items for maps beaten before they could be earned
    applyUnlocks(save);
    return save;
}

// Gear that can come out of a casket (not one of the Armoury's variants)
function isCasketGear(id: unknown): id is string {
    const item = typeof id === "string" ? ITEM_BY_ID.get(id) : undefined;
    return item?.kind === "gear" && !item.variantOf;
}

export function getMetaStats(save: SaveData): Stats {
    const stats = emptyStats();
    for (const upgrade of SHOP_UPGRADES) {
        const rank = save.upgrades[upgrade.id] ?? 0;
        stats[upgrade.stat] += upgrade.perRank * rank;
    }
    return stats;
}

export function getTotalUpgradesBought(save: SaveData): number {
    return Object.values(save.upgrades).reduce((sum, rank) => sum + rank, 0);
}

export function getNextUpgradeCost(save: SaveData, upgradeId: string): number | undefined {
    const upgrade = SHOP_UPGRADE_BY_ID.get(upgradeId);
    if (!upgrade) {
        return undefined;
    }
    const rank = save.upgrades[upgradeId] ?? 0;
    if (rank >= upgrade.maxRank) {
        return undefined;
    }
    return getUpgradeCost(upgrade, rank, getTotalUpgradesBought(save));
}

// Returns false when it can't be bought (maxed or too expensive)
export function buyUpgrade(save: SaveData, upgradeId: string): boolean {
    const cost = getNextUpgradeCost(save, upgradeId);
    if (cost === undefined || save.coins < cost) {
        return false;
    }
    save.coins -= cost;
    save.upgradesSpent += cost;
    save.upgrades[upgradeId] = (save.upgrades[upgradeId] ?? 0) + 1;
    return true;
}

// Sells every upgrade back for what it cost (VS lets you refund)
export function refundUpgrades(save: SaveData): void {
    save.coins += save.upgradesSpent;
    save.upgradesSpent = 0;
    save.upgrades = {};
}

// For saves from before spending was tracked: what buying these ranks one
// upgrade at a time would have cost
function estimateSpent(upgrades: Record<string, number>): number {
    const replay = createSave();
    replay.coins = Infinity;
    for (const [id, rank] of Object.entries(upgrades)) {
        for (let r = 0; r < rank; r++) {
            buyUpgrade(replay, id);
        }
    }
    return replay.upgradesSpent;
}

export type RunSummary = {
    mapId: string;
    // An endless run, and the round it got to
    endless?: boolean;
    round?: number;
    victory: boolean;
    seconds: number;
    level: number;
    kills: number;
    coins: number;
    // Enemy ids of the bosses killed, in order
    bossesKilled: string[];
    // The gear that came out of caskets, as found
    gearFound?: string[];
    evolutionsMade?: string[];
    // For quests: enemy id -> times killed, and reward caskets opened
    enemyKills?: Record<string, number>;
    caskets?: number;
};

// Banks the run, and pays out the quests it finished. Returns those quests.
export function recordRun(save: SaveData, run: RunSummary): QuestDef[] {
    // Nothing from a development map, or its id would stay in the save for good
    if (isDevMap(run.mapId)) {
        return [];
    }
    const quests = getFinishedQuests(save, run);
    save.coins += run.coins;
    save.totalCoins += run.coins;
    save.runs++;
    if (run.victory) {
        save.victories++;
        save.mapVictories[run.mapId] = (save.mapVictories[run.mapId] ?? 0) + 1;
    }
    save.totalKills += run.kills;
    save.bestSeconds = Math.max(save.bestSeconds, run.seconds);
    save.bestLevel = Math.max(save.bestLevel, run.level);
    if (run.endless && isEndlessRecord(save, run)) {
        save.endlessBest[run.mapId] = { round: run.round ?? 1, seconds: run.seconds };
    }
    for (const id of run.gearFound ?? []) {
        if (isCasketGear(id) && !save.foundGear.includes(id)) {
            save.foundGear.push(id);
        }
    }
    for (const id of run.evolutionsMade ?? []) {
        if (!save.evolutionsMade.includes(id)) {
            save.evolutionsMade.push(id);
        }
    }
    const tallies = getQuestTallies(run);
    for (const [id, kills] of Object.entries(tallies.enemyKills)) {
        save.enemyKills[id] = (save.enemyKills[id] ?? 0) + kills;
    }
    save.casketsOpened += tallies.caskets;
    for (const quest of quests) {
        save.questsDone.push(quest.id);
        save.coins += quest.coins;
        save.totalCoins += quest.coins;
    }
    applyUnlocks(save, run);
    return quests;
}

// What a run counts towards quests: its kills and caskets, except on the fun
// maps, where quests don't count at all
function getQuestTallies(run?: RunSummary): {
    enemyKills: Record<string, number>;
    caskets: number;
} {
    if (!run || isFunMap(run.mapId)) {
        return { enemyKills: {}, caskets: 0 };
    }
    return { enemyKills: run.enemyKills ?? {}, caskets: run.caskets ?? 0 };
}

// How far a quest has got: what's been done towards it, of what it needs
export type QuestProgress = { done: number; of: number };

// Counting the runs recorded so far, and a run not recorded yet (one still
// going)
export function getQuestProgress(save: SaveData, quest: QuestDef, run?: RunSummary): QuestProgress {
    const tallies = getQuestTallies(run);
    const kills = (id: string) => (save.enemyKills[id] ?? 0) + (tallies.enemyKills[id] ?? 0);
    const objective = quest.objective;
    switch (objective.kind) {
        case "kill": {
            const done = objective.enemyIds.reduce((sum, id) => sum + kills(id), 0);
            return { done: Math.min(done, objective.count), of: objective.count };
        }
        case "killEach":
            return {
                done: objective.enemyIds.filter((id) => kills(id) > 0).length,
                of: objective.enemyIds.length,
            };
        case "caskets": {
            const done = save.casketsOpened + tallies.caskets;
            return { done: Math.min(done, objective.count), of: objective.count };
        }
        case "beatMap": {
            const won =
                (save.mapVictories[objective.mapId] ?? 0) > 0 ||
                (run?.victory === true && run.mapId === objective.mapId);
            return { done: won ? 1 : 0, of: 1 };
        }
    }
}

// The quests not done yet that this run (still going, or not recorded yet)
// finishes, without paying them out
export function getFinishedQuests(save: SaveData, run?: RunSummary): QuestDef[] {
    return QUESTS.filter((quest) => {
        if (save.questsDone.includes(quest.id)) {
            return false;
        }
        const { done, of } = getQuestProgress(save, quest, run);
        return done >= of;
    });
}

// Whether an endless run got further than any before it on its map: a later
// round, or as far but longer
export function isEndlessRecord(save: SaveData, run: RunSummary): boolean {
    if (isDevMap(run.mapId)) {
        return false;
    }
    const best = save.endlessBest[run.mapId];
    const round = run.round ?? 1;
    return !best || round > best.round || (round === best.round && run.seconds > best.seconds);
}

// Beating a map counts from any run so far; the rest need doing in one run
function isTaskDone(save: SaveData, task: UnlockTask, run?: RunSummary): boolean {
    switch (task.kind) {
        case "beatMap":
            return (save.mapVictories[task.mapId] ?? 0) > 0;
        case "killBoss":
            return run?.mapId === task.mapId && run.bossesKilled.includes(task.enemyId);
        case "survive":
            return run?.mapId === task.mapId && run.seconds >= task.seconds;
    }
}

export type EarnedUnlocks = {
    characters: CharacterDef[];
    items: LockableItem[];
};

// The locked adventurers and items whose task is done (by this run, or for
// beating a map by any run so far), without unlocking them
export function getEarnedUnlocks(save: SaveData, run?: RunSummary): EarnedUnlocks {
    return {
        characters: CHARACTERS.filter(
            (c) =>
                c.unlock &&
                !save.unlockedCharacters.includes(c.id) &&
                isTaskDone(save, c.unlock, run),
        ),
        items: LOCKABLE_ITEMS.filter(
            (i) => !save.unlockedItems.includes(i.id) && isTaskDone(save, i.unlock, run),
        ),
    };
}

export function applyUnlocks(save: SaveData, run?: RunSummary): void {
    const earned = getEarnedUnlocks(save, run);
    save.unlockedCharacters.push(...earned.characters.map((c) => c.id));
    save.unlockedItems.push(...earned.items.map((i) => i.id));
}

// The first map is always open; each after it opens once the one before it
// has been beaten. The fun maps are open from the start.
export function isMapUnlocked(save: SaveData, mapId: string): boolean {
    if (isFunMap(mapId)) {
        return true;
    }
    const index = MAPS.findIndex((m) => m.id === mapId);
    return index === 0 || (index > 0 && (save.mapVictories[MAPS[index - 1].id] ?? 0) > 0);
}

// A map can be played endless once it's been beaten; the fun maps are only
// ever endless
export function isEndlessUnlocked(save: SaveData, mapId: string): boolean {
    return isFunMap(mapId) || (save.mapVictories[mapId] ?? 0) > 0;
}

// A piece's next upgrade in the Armoury: what it becomes, what that costs,
// and the map task that brings it in when that's still to do. Undefined once
// it's as good as it gets.
export type ArmouryStep = { into: string; cost: number; locked?: UnlockTask };

export function getArmouryStep(save: SaveData, itemId: string): ArmouryStep | undefined {
    const into = getNextUpgrade(getUpgradedGear(itemId, save.armoury));
    if (into === undefined) {
        return undefined;
    }
    const piece = getGear(into);
    const locked = isAvailable(piece, new Set(save.unlockedItems)) ? undefined : piece.unlock;
    return { into, cost: getArmouryCost(into), locked };
}

// Upgrades a piece one step. False when it can't be (not found yet, as good
// as it gets, what it'd become is still locked, or too expensive).
export function buyArmouryUpgrade(save: SaveData, itemId: string): boolean {
    const step = getArmouryStep(save, itemId);
    if (!save.foundGear.includes(itemId) || !step || step.locked || save.coins < step.cost) {
        return false;
    }
    save.coins -= step.cost;
    save.armoury[itemId] = (save.armoury[itemId] ?? 0) + 1;
    return true;
}

// A save as a file, to keep or to carry to another browser
export function exportSave(save: SaveData): string {
    return JSON.stringify(save, null, 2);
}

// Reads an exported save, brought up to the current version. Throws if the
// text isn't one.
export function importSave(text: string): SaveData {
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== "object" || typeof (raw as SaveData).version !== "number") {
        throw new Error("Not a save");
    }
    return migrateSave(raw);
}

export interface SaveStore {
    load(): SaveData;
    save(data: SaveData): void;
}

// From the game's old name, Rune Survivors; kept as it is, as it's where
// every player's save is
const STORAGE_KEY = "rune-survivors-save";

export class LocalSaveStore implements SaveStore {
    load(): SaveData {
        try {
            const json = window.localStorage.getItem(STORAGE_KEY);
            return migrateSave(json ? JSON.parse(json) : undefined);
        } catch (e) {
            console.error("Failed to load save", e);
            return createSave();
        }
    }

    save(data: SaveData): void {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error("Failed to save", e);
        }
    }
}
