import { ACTS, ACT_BY_ID, FALLEN_EMPIRE, isActEnded, isMapOut } from "../content/acts";
import {
    getArmouryCost,
    getNextUpgrade,
    getUpgradeLine,
    getUpgradedGear,
} from "../content/armoury";
import { CHARACTERS } from "../content/characters";
import { ENEMY_BY_ID } from "../content/enemies";
import {
    FIRST_CLEAR_ORBS,
    GAUNTLET_FIGHTS,
    gauntletOrderKey,
    isGauntletOrder,
} from "../content/gauntlet";
import { INVADER_BY_ID } from "../content/invaders";
import {
    InvocationPreset,
    RUN_SET,
    cleanInvocationPresets,
    cleanInvocations,
    isHardInvocation,
} from "../content/invocations";
import { ITEM_BY_ID, getGear } from "../content/items";
import {
    ALL_MAPS,
    CAMPAIGN_MAPS,
    MAPS,
    MAP_BY_ID,
    RAID_MAPS,
    getMap,
    isDevMap,
    isFunMap,
    isRaidMap,
    isSeasonalMap,
    takesRelics,
} from "../content/maps";
import { isPetFound } from "../content/pets";
import { QUESTS, QUEST_BY_ID } from "../content/quests";
import { cleanRelics } from "../content/relics";
import { cleanRemixes, parseRemixKey, remixKey } from "../content/remixes";
import { SHOP_UPGRADES, SHOP_UPGRADE_BY_ID, getPageCost, getUpgradeCost } from "../content/shop";
import { TROPHIES, TROPHY_BY_ID } from "../content/trophies";
import {
    CharacterDef,
    CombatStyle,
    QuestDef,
    Stats,
    UnlockTask,
    emptyStats,
} from "../content/types";
import { LOCKABLE_ITEMS, LOCKABLE_ITEM_BY_ID, LockableItem, isAvailable } from "../content/unlocks";
import { VAULT_WEEKS_KEPT, VaultRecord, isBetterVault, parseWeekKey } from "../content/vault";
import {
    COSMETIC_BY_ID,
    SavedOutfit,
    WardrobeLook,
    cleanLook,
    cleanSavedOutfits,
    getCosmeticPrice,
    getPieceTrophy,
    ownsCosmetic,
} from "../content/wardrobe";
import { WEAPONS } from "../content/weapons";

// Progress kept between runs: banked coins, permanent upgrades, unlocks and
// records. Versioned so older saves can be upgraded when the format changes.

// 2: wins per map (maps unlock in order)
// 3: items unlocked by map tasks
// 4: endless records
// 5: gear found, and the Armoury's upgrades
// 6: quests, and the kills and caskets they count
// 7: evolutions made, for the Collection log
// 8: trophies found, for the Collection log
// 9: hard mode's wins and endless records
export const SAVE_VERSION = 11;

export type SkillPage = {
    upgrades: Record<string, number>;
    // What was paid for the page's ranks, which Refund all gives back. It's
    // getPageCost(upgrades) unless prices have changed since.
    upgradesSpent: number;
};

function createSkillPage(): SkillPage {
    return { upgrades: {}, upgradesSpent: 0 };
}

// Characters taken out of the game for now; saves keep them unlocked for when
// they're back
const RETIRED_CHARACTERS = ["dwarf"];

export type SaveData = {
    version: number;
    // The version of the game that last wrote it, put on as it's written. An
    // older game won't write over it: it would drop the maps, upgrades and
    // items it doesn't know.
    gameVersion?: string;
    coins: number;
    totalCoins: number;
    skillPages: Record<CombatStyle, SkillPage>;
    unlockedCharacters: string[];
    // Ids of the weapons, passives and casket items brought in by map tasks
    unlockedItems: string[];
    runs: number;
    victories: number;
    // Map id -> times beaten; beating a map unlocks the next
    mapVictories: Record<string, number>;
    // A fight in parts (MapDef.stages): how many of its parts have been beaten, kept between runs
    // as OSRS keeps a quest's progress
    fightStages?: Record<string, number>;
    // Map id -> the times of those that were on hard mode
    hardVictories: Record<string, number>;
    // A raid's expert mode wins, which also count as hard ones
    expertVictories: Record<string, number>;
    totalKills: number;
    bestSeconds: number;
    bestLevel: number;
    // Map id -> the furthest an endless run there has got
    endlessBest: Record<string, EndlessRecord>;
    // The same, on hard mode
    hardEndlessBest: Record<string, EndlessRecord>;
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
    // The Collection log's trophies found (see trophies.ts)
    trophies: string[];
    // The Tombs of Amascut's invocations, as last picked (content/invocations.ts)
    invocations?: string[];
    // Saved setups of the invocation board, to load in one go (content/invocations.ts)
    invocationPresets?: InvocationPreset[];
    // A run's invocations, as last picked on a map's card (content/invocations.ts, RUN_SET): not
    // hard mode's, which the Hard switch is
    runInvocations?: string[];
    // Map id -> its win at the most invocation points (as many and quicker, of those), with the
    // relics it was set with
    invocationBest?: Record<string, InvocationRecord>;
    // The relics picked, one a tier (content/relics.ts); only the open tiers' go on a run
    relics?: string[];
    // The Scabaras room's been beaten once: its puzzle helper's unlocked (DisplaySettings.puzzleHelper)
    scabarasBeaten?: boolean;
    // The pet taken along on runs (pets.ts), one of the trophies found
    pet?: string;
    // An act's map id -> its best win (content/acts.ts): the quickest at the highest step it's
    // been won at, so an easier one's kept, with its step, until it's beaten at a harder one
    actBest?: Record<string, ActRecord>;
    // A set of remixes on a map (content/remixes.ts, remixKey: "lumbridge:dark+frozen") -> its
    // records, relic-free (act-2-fallen-empire.md, 8.3)
    remixVictories?: Record<string, RemixRecord>;
    // The acts (content/acts.ts) whose ending has been told: it's told once, as the last of the
    // act's Awakened fights falls, and again only from its card
    actEndings?: string[];
    // The act's Awakened fights in the order they were first beaten: the Forgotten Four's order to
    // start with (content/gauntlet.ts), and the order last picked for it
    awakenedOrder?: string[];
    gauntletOrder?: string[];
    // The Forgotten Four's clears and records, on normal and on hard
    gauntlet?: { normal?: GauntletModeRecord; hard?: GauntletModeRecord };
    // Awakener's orbs held (act-2-fallen-empire.md 8.6): each Awakened fight won gives one, and the
    // gauntlet's first clears two; one's spent awakening a campaign map's final boss for a run
    // (spent once it comes: a run left before it keeps the orb)
    awakenerOrbs?: number;
    // A campaign map's id -> the times its final boss was beaten awakened (its card's mark)
    awakenedWins?: Record<string, number>;
    // Awakened invasions (content/invasions.ts): invader id -> the times one's been killed, for
    // the Collection log
    invasions?: Record<string, number>;
    // The weekly Vault (content/vault.ts): a week's key ("2026-W46") -> its best run, the latest
    // VAULT_WEEKS_KEPT weeks
    vault?: Record<string, VaultRecord>;
    // The adventurer the game starts on, picked as a favourite
    favouriteCharacter?: string;
    // The Wardrobe (content/wardrobe.ts): the pieces bought in its store, by item id, and the body
    // and outfit worn on every adventurer
    cosmetics?: number[];
    look?: WardrobeLook;
    // Outfits kept under a name, to put on again in one go
    outfits?: SavedOutfit[];
    // When the player last exported it (Date.now()), so an exported file says
    // when it was made, and the title screen can remind them to keep a copy
    lastExported?: number;
};

// What a record was set with: its run's invocation points and the relics on (content/relics.ts),
// when there were any
export type RecordSetup = { points?: number; relics?: string[] };

// The round reached, and how long the run lasted (on an act's map, at which step)
export type EndlessRecord = { round: number; seconds: number; step?: number } & RecordSetup;

// A win on an act's map: how long it took, at which step
export type ActRecord = { seconds: number; step: number } & RecordSetup;

// A set of remixes' records on a map (SaveData.remixVictories): wins, the quickest, wins on hard (its
// gold tick), and the furthest endless run
export type RemixRecord = {
    wins: number;
    seconds?: number;
    hard?: number;
    endless?: { round: number; seconds: number };
};

// A clear of the Forgotten Four: the fights' time (the camps left out), whether no fight was
// retried, its order and its retries
export type GauntletRecord = { seconds: number; clean: boolean; order: string[]; retries: number };

// The gauntlet's clears on a mode, and the best of each order it's been run in (13.2: times
// compare within an order; a clean clear beats one with retries, then the quicker)
export type GauntletModeRecord = {
    clears: number;
    cleanClears: number;
    best: Record<string, GauntletRecord>;
};

// A win at invocation points (SaveData.invocationBest)
export type InvocationRecord = { points: number; seconds: number; relics?: string[] };

export function createSave(): SaveData {
    return {
        version: SAVE_VERSION,
        coins: 0,
        totalCoins: 0,
        skillPages: {
            melee: createSkillPage(),
            ranged: createSkillPage(),
            magic: createSkillPage(),
        },
        unlockedCharacters: CHARACTERS.filter((c) => !c.unlock && !c.only).map((c) => c.id),
        unlockedItems: [],
        runs: 0,
        victories: 0,
        mapVictories: {},
        hardVictories: {},
        expertVictories: {},
        totalKills: 0,
        bestSeconds: 0,
        bestLevel: 0,
        endlessBest: {},
        hardEndlessBest: {},
        foundGear: [],
        armoury: {},
        enemyKills: {},
        casketsOpened: 0,
        questsDone: [],
        evolutionsMade: [],
        trophies: [],
    };
}

// Brings any older save up to the current version, filling in what's missing
// A run's invocations as the card keeps them: the board's own, not hard mode's (the Hard switch's)
export function cleanRunInvocations(ids: readonly unknown[]): string[] {
    return cleanInvocations(ids, RUN_SET).filter((id) => !isHardInvocation(id));
}

// What a record was set with, from a save: points a whole number above 0, relics this game knows
function cleanSetup(record: unknown): RecordSetup {
    const { points, relics } = (record ?? {}) as { points?: unknown; relics?: unknown };
    const kept = cleanRelics(relics);
    return {
        ...(typeof points === "number" && Number.isFinite(points) && points > 0
            ? { points: Math.floor(points) }
            : {}),
        ...(kept.length > 0 && { relics: kept }),
    };
}

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
    if (data.skillPages && typeof data.skillPages === "object") {
        for (const style of ["melee", "ranged", "magic"] as const) {
            save.skillPages[style] = migrateSkillPage(data.skillPages[style]);
        }
        if ((data.version ?? 0) < 11) {
            const spent = Object.values(save.skillPages).reduce(
                (sum, page) => sum + page.upgradesSpent,
                0,
            );
            save.coins += spent - getMaxSkillSpending(save);
        }
    } else {
        save.skillPages.melee = migrateSkillPage(raw);
    }
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
    // The maps that can be won: the campaign's and seasonal ones, and the raids
    const winnable = (id: string) =>
        MAPS.some((m) => m.id === id) || RAID_MAPS.some((m) => m.id === id);
    save.runs = num(data.runs, 0);
    save.victories = num(data.victories, 0);
    if (data.mapVictories && typeof data.mapVictories === "object") {
        for (const [id, wins] of Object.entries(data.mapVictories)) {
            if (winnable(id) && num(wins, 0) > 0) {
                save.mapVictories[id] = num(wins, 0);
            }
        }
    } else if (save.victories > 0) {
        // From before there were maps: every win was in Lumbridge
        save.mapVictories[MAPS[0].id] = save.victories;
    }
    if (data.hardVictories && typeof data.hardVictories === "object") {
        for (const [id, wins] of Object.entries(data.hardVictories)) {
            if (winnable(id) && num(wins, 0) > 0) {
                save.hardVictories[id] = num(wins, 0);
            }
        }
    }
    if (data.fightStages && typeof data.fightStages === "object") {
        save.fightStages = {};
        for (const [id, parts] of Object.entries(data.fightStages)) {
            const stages = MAP_BY_ID.get(id)?.stages;
            const part = Math.floor(num(parts, 0));
            if (winnable(id) && stages && part > 0 && part < stages.length) {
                save.fightStages[id] = part;
            }
        }
    }
    if (data.expertVictories && typeof data.expertVictories === "object") {
        for (const [id, wins] of Object.entries(data.expertVictories)) {
            if (isRaidMap(id) && num(wins, 0) > 0) {
                save.expertVictories[id] = num(wins, 0);
            }
        }
    }
    save.totalKills = num(data.totalKills, 0);
    save.bestSeconds = num(data.bestSeconds, 0);
    save.bestLevel = num(data.bestLevel, 0);
    const copyEndlessBest = (
        from: Record<string, EndlessRecord> | undefined,
        to: Record<string, EndlessRecord>,
    ) => {
        if (from && typeof from === "object") {
            for (const [id, record] of Object.entries(from)) {
                const round = num(record?.round, 0);
                if (ALL_MAPS.some((m) => m.id === id) && round > 0) {
                    to[id] = { round, seconds: num(record?.seconds, 0), ...cleanSetup(record) };
                    if (typeof record.step === "number" && record.step >= 0) {
                        to[id].step = Math.floor(record.step);
                    }
                }
            }
        }
    };
    copyEndlessBest(data.endlessBest, save.endlessBest);
    copyEndlessBest(data.hardEndlessBest, save.hardEndlessBest);
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
    if (Array.isArray(data.trophies)) {
        for (const id of data.trophies) {
            if (TROPHY_BY_ID.has(id) && !save.trophies.includes(id)) {
                save.trophies.push(id);
            }
        }
    }
    if (data.actBest && typeof data.actBest === "object") {
        for (const [id, record] of Object.entries(data.actBest)) {
            const seconds = num(record?.seconds, 0);
            if (MAP_BY_ID.get(id)?.act && seconds > 0) {
                save.actBest ??= {};
                save.actBest[id] = {
                    seconds,
                    step: Math.max(0, Math.floor(num(record?.step, 0))),
                    ...cleanSetup(record),
                };
            }
        }
    }
    if (data.remixVictories && typeof data.remixVictories === "object") {
        for (const [key, record] of Object.entries(data.remixVictories)) {
            const parsed = parseRemixKey(key);
            if (!parsed || !MAP_BY_ID.has(parsed.mapId) || !record || typeof record !== "object") {
                continue;
            }
            const clean: RemixRecord = { wins: Math.max(0, Math.floor(num(record.wins, 0))) };
            const seconds = num(record.seconds, 0);
            if (seconds > 0) {
                clean.seconds = seconds;
            }
            const hard = Math.floor(num(record.hard, 0));
            if (hard > 0) {
                clean.hard = hard;
            }
            const round = Math.floor(num(record.endless?.round, 0));
            if (round > 0) {
                clean.endless = { round, seconds: num(record.endless?.seconds, 0) };
            }
            save.remixVictories ??= {};
            save.remixVictories[remixKey(parsed.mapId, parsed.remixes)] = clean;
        }
    }
    if (data.invocationBest && typeof data.invocationBest === "object") {
        for (const [id, record] of Object.entries(data.invocationBest)) {
            const points = Math.floor(num(record?.points, 0));
            const seconds = num(record?.seconds, 0);
            if (MAP_BY_ID.has(id) && points > 0 && seconds > 0) {
                save.invocationBest ??= {};
                save.invocationBest[id] = { points, seconds, ...cleanSetup(record) };
            }
        }
    }
    if (Array.isArray(data.invocations)) {
        save.invocations = cleanInvocations(data.invocations);
    }
    const presets = cleanInvocationPresets(data.invocationPresets);
    if (presets.length > 0) {
        save.invocationPresets = presets;
    }
    if (Array.isArray(data.runInvocations)) {
        save.runInvocations = cleanRunInvocations(data.runInvocations);
    }
    const relics = cleanRelics(data.relics);
    if (relics.length > 0) {
        save.relics = relics;
    }
    if (data.scabarasBeaten === true) {
        save.scabarasBeaten = true;
    }
    if (Array.isArray(data.actEndings)) {
        for (const id of data.actEndings) {
            if (typeof id === "string" && ACT_BY_ID.has(id) && !save.actEndings?.includes(id)) {
                save.actEndings ??= [];
                save.actEndings.push(id);
            }
        }
    }
    if (isGauntletOrder(data.gauntletOrder)) {
        save.gauntletOrder = [...data.gauntletOrder];
    }
    if (Array.isArray(data.awakenedOrder)) {
        const order = data.awakenedOrder.filter(
            (id, i, all) => GAUNTLET_FIGHTS.includes(id) && all.indexOf(id) === i,
        );
        if (order.length > 0) {
            save.awakenedOrder = order;
        }
    }
    for (const mode of ["normal", "hard"] as const) {
        const record = migrateGauntletMode(data.gauntlet?.[mode], num);
        if (record) {
            save.gauntlet = { ...save.gauntlet, [mode]: record };
        }
    }
    const orbs = Math.floor(num(data.awakenerOrbs, 0));
    if (orbs > 0) {
        save.awakenerOrbs = orbs;
    }
    for (const [id, wins] of Object.entries(data.awakenedWins ?? {})) {
        const count = Math.floor(num(wins, 0));
        if (MAP_BY_ID.has(id) && count > 0) {
            save.awakenedWins = { ...save.awakenedWins, [id]: count };
        }
    }
    for (const [id, kills] of Object.entries(data.invasions ?? {})) {
        const count = Math.floor(num(kills, 0));
        if (INVADER_BY_ID.has(id) && count > 0) {
            save.invasions = { ...save.invasions, [id]: count };
        }
    }
    for (const [key, record] of Object.entries(data.vault ?? {})) {
        const seconds = num(record?.seconds, 0);
        if (parseWeekKey(key) && seconds > 0) {
            save.vault = {
                ...save.vault,
                [key]: {
                    seconds,
                    kills: Math.max(0, Math.floor(num(record.kills, 0))),
                    victory: record.victory === true,
                    runs: Math.max(1, Math.floor(num(record.runs, 1))),
                },
            };
        }
    }
    if (
        typeof data.favouriteCharacter === "string" &&
        CHARACTERS.some((c) => c.id === data.favouriteCharacter && !c.only)
    ) {
        save.favouriteCharacter = data.favouriteCharacter;
    }
    if (Array.isArray(data.cosmetics)) {
        // A found piece is the trophy's, never bought
        const owned = new Set(
            data.cosmetics.filter((id) => COSMETIC_BY_ID.has(id) && !getPieceTrophy(id)),
        );
        if (owned.size > 0) {
            save.cosmetics = [...owned];
        }
    }
    // A time a Date can hold, or the reminder couldn't tell its day
    const exported = data.lastExported;
    if (typeof exported === "number" && exported > 0 && !isNaN(new Date(exported).getTime())) {
        save.lastExported = exported;
    }
    if (Array.isArray(data.questsDone)) {
        for (const id of data.questsDone) {
            if (QUEST_BY_ID.has(id) && !save.questsDone.includes(id)) {
                save.questsDone.push(id);
            }
        }
    }
    // A quest done before its trophy was one, and before the pet that trophy brings is checked
    applyQuestTrophies(save);
    if (typeof data.pet === "string" && isPetFound(save.trophies, data.pet)) {
        save.pet = data.pet;
    }
    // Adventurers and items for maps beaten before they could be earned
    applyUnlocks(save);
    // After the adventurers, whose own pieces can be worn for nothing
    const look = cleanLook(data.look, (objId) => canWearCosmetic(save, objId));
    if (look) {
        save.look = look;
    }
    const outfits = cleanSavedOutfits(data.outfits, (objId) => canWearCosmetic(save, objId));
    if (outfits.length > 0) {
        save.outfits = outfits;
    }
    return save;
}

// The Wardrobe's pieces this save can wear: bought, an unlocked adventurer's, or found
export function canWearCosmetic(save: SaveData, objId: number): boolean {
    return ownsCosmetic(save, objId);
}

// Buys a piece in the Wardrobe's store. False when it can't be (owned already, not in the store,
// only ever found, or too expensive).
export function buyCosmetic(save: SaveData, objId: number): boolean {
    const cosmetic = COSMETIC_BY_ID.get(objId);
    if (
        !cosmetic ||
        getPieceTrophy(objId) ||
        canWearCosmetic(save, objId) ||
        save.coins < getCosmeticPrice(cosmetic)
    ) {
        return false;
    }
    save.coins -= getCosmeticPrice(cosmetic);
    save.cosmetics = [...(save.cosmetics ?? []), objId];
    return true;
}

// The adventurer the game starts on: the favourite, if it's open, or else the first that is
export function getStartingCharacter(save: SaveData): string {
    const favourite = save.favouriteCharacter;
    if (favourite && save.unlockedCharacters.includes(favourite)) {
        return favourite;
    }
    return save.unlockedCharacters[0] ?? "warrior";
}

// Gear that can come out of a casket (not one of the Armoury's variants)
function isCasketGear(id: unknown): id is string {
    const item = typeof id === "string" ? ITEM_BY_ID.get(id) : undefined;
    return item?.kind === "gear" && !item.variantOf;
}

function migrateSkillPage(raw: unknown): SkillPage {
    const page = createSkillPage();
    if (!raw || typeof raw !== "object") {
        return page;
    }
    const data = raw as Partial<SkillPage>;
    if (data.upgrades && typeof data.upgrades === "object") {
        for (const [id, rank] of Object.entries(data.upgrades)) {
            const upgrade = SHOP_UPGRADE_BY_ID.get(id);
            if (upgrade && typeof rank === "number" && Number.isFinite(rank)) {
                const bought = Math.min(Math.max(Math.floor(rank), 0), upgrade.maxRank);
                if (bought > 0) {
                    page.upgrades[id] = bought;
                }
            }
        }
    }
    page.upgradesSpent =
        Object.keys(page.upgrades).length === 0
            ? 0
            : Number.isSafeInteger(data.upgradesSpent) && data.upgradesSpent! >= 0
              ? data.upgradesSpent!
              : getPageCost(page.upgrades);
    return page;
}

export function getMetaStats(save: SaveData, style: CombatStyle = "melee"): Stats {
    const stats = emptyStats();
    for (const upgrade of SHOP_UPGRADES) {
        const rank = save.skillPages[style].upgrades[upgrade.id] ?? 0;
        stats[upgrade.stat] += upgrade.perRank * rank;
    }
    return stats;
}

function getMaxSkillSpending(save: SaveData): number {
    return Math.max(...Object.values(save.skillPages).map((page) => page.upgradesSpent));
}

export function getSkillCoins(save: SaveData, style: CombatStyle = "melee"): number {
    return save.coins + getMaxSkillSpending(save) - save.skillPages[style].upgradesSpent;
}

export function getNextUpgradeCost(
    save: SaveData,
    upgradeId: string,
    style: CombatStyle = "melee",
): number | undefined {
    const upgrade = SHOP_UPGRADE_BY_ID.get(upgradeId);
    if (!upgrade) {
        return undefined;
    }
    const rank = save.skillPages[style].upgrades[upgradeId] ?? 0;
    if (rank >= upgrade.maxRank) {
        return undefined;
    }
    return getUpgradeCost(upgradeId, save.skillPages[style].upgrades);
}

// Returns false when it can't be bought (maxed or too expensive)
export function buyUpgrade(
    save: SaveData,
    upgradeId: string,
    style: CombatStyle = "melee",
): boolean {
    const cost = getNextUpgradeCost(save, upgradeId, style);
    if (cost === undefined || getSkillCoins(save, style) < cost) {
        return false;
    }
    const reserved = getMaxSkillSpending(save);
    const page = save.skillPages[style];
    page.upgradesSpent += cost;
    save.coins -= getMaxSkillSpending(save) - reserved;
    page.upgrades[upgradeId] = (page.upgrades[upgradeId] ?? 0) + 1;
    return true;
}

// Takes back one rank of the skill for its share of what the page paid: what
// it adds to the page's cost today, times what the page paid over that cost.
// The two are the same unless prices have changed since, and then each rank
// gives back its part of the difference rather than one rank all of it, or
// nothing. The last rank gives back the rest, so a page returns exactly what
// it cost.
export function refundUpgrade(
    save: SaveData,
    upgradeId: string,
    style: CombatStyle = "melee",
): boolean {
    const page = save.skillPages[style];
    const rank = page.upgrades[upgradeId] ?? 0;
    if (rank <= 0) {
        return false;
    }
    const reserved = getMaxSkillSpending(save);
    const upgrades = { ...page.upgrades, [upgradeId]: rank - 1 };
    if (rank === 1) {
        delete upgrades[upgradeId];
    }
    if (Object.keys(upgrades).length === 0) {
        save.skillPages[style] = createSkillPage();
    } else {
        const cost = getPageCost(page.upgrades);
        const saved = cost - getPageCost(upgrades);
        const refund = cost > 0 ? Math.round((saved * page.upgradesSpent) / cost) : 0;
        page.upgradesSpent -= Math.min(refund, page.upgradesSpent);
        page.upgrades = upgrades;
    }
    save.coins += reserved - getMaxSkillSpending(save);
    return true;
}

// Sells every upgrade back for what it cost (VS lets you refund)
export function refundUpgrades(save: SaveData, style: CombatStyle = "melee"): void {
    const reserved = getMaxSkillSpending(save);
    save.skillPages[style] = createSkillPage();
    save.coins += reserved - getMaxSkillSpending(save);
}

export type RunSummary = {
    mapId: string;
    // A fight in parts: which this run was (MapDef.stages)
    stage?: number;
    // An endless run, and the round it got to
    endless?: boolean;
    round?: number;
    hard?: boolean;
    // A raid's expert mode (hard as well)
    expert?: boolean;
    // An act's map: the step it was played at (content/acts.ts)
    actStep?: number;
    // A run's invocation points, and the player's relics (Sim's RunResult)
    points?: number;
    relics?: string[];
    // Its remixes (content/remixes.ts): it sets their records (SaveData.remixVictories), not the
    // map's own hard, act, invocation and endless ones
    remixes?: string[];
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
    trophies?: string[];
    // For quests: enemy id -> times killed, and reward caskets opened
    enemyKills?: Record<string, number>;
    caskets?: number;
    // Of those, the ones opened in a map's Shadow Realm (RealmRuleDef)
    realmCaskets?: number;
    // The Scabaras room was beaten: its puzzle helper's unlocked
    scabarasBeaten?: boolean;
    // An Awakened invasion (Sim's RunResult): its invader and whether it fell
    invasion?: { id: string; came: boolean; killed: boolean };
    // The final boss awakened by an orb: whether it came, so the orb's spent
    awakened?: { seen: boolean };
    // The weekly Vault's run: its week's key (content/vault.ts)
    vault?: string;
};

function migrateGauntletMode(
    data: unknown,
    num: (value: unknown, fallback: number) => number,
): GauntletModeRecord | undefined {
    if (!data || typeof data !== "object") {
        return undefined;
    }
    const raw = data as Partial<GauntletModeRecord>;
    const clears = Math.max(0, Math.floor(num(raw.clears, 0)));
    if (clears === 0) {
        return undefined;
    }
    const best: Record<string, GauntletRecord> = {};
    for (const record of Object.values(raw.best ?? {})) {
        const seconds = num(record?.seconds, 0);
        if (isGauntletOrder(record?.order) && seconds > 0) {
            best[gauntletOrderKey(record.order)] = {
                seconds,
                clean: record.clean === true,
                order: [...record.order],
                retries: Math.max(0, Math.floor(num(record.retries, 0))),
            };
        }
    }
    return {
        clears,
        cleanClears: Math.min(clears, Math.max(0, Math.floor(num(raw.cleanClears, 0)))),
        best,
    };
}

// The Forgotten Four opens once every Awakened fight of the act's is beaten (act-2-fallen-empire.md,
// 7.3), its hard mode with its first clean clear on normal
export function isGauntletOpen(save: SaveData): boolean {
    return isActEnded(FALLEN_EMPIRE, save.mapVictories);
}

export function isGauntletHardOpen(save: SaveData): boolean {
    return (save.gauntlet?.normal?.cleanClears ?? 0) > 0;
}

// The first clean clear's looks (on either mode): the blood-touched Soulreaper axe and fighting
// pets, and the act's middle card's gold border
export function hasGauntletLooks(save: SaveData): boolean {
    return (
        (save.gauntlet?.normal?.cleanClears ?? 0) > 0 || (save.gauntlet?.hard?.cleanClears ?? 0) > 0
    );
}

// The order the gauntlet's screen starts on: the one last picked, or the fights in the order they
// were first beaten (those beaten before that was kept, in the act's order after)
export function getGauntletOrder(save: SaveData): string[] {
    if (isGauntletOrder(save.gauntletOrder)) {
        return [...save.gauntletOrder];
    }
    const first = (save.awakenedOrder ?? []).filter((id) => GAUNTLET_FIGHTS.includes(id));
    return [...first, ...GAUNTLET_FIGHTS.filter((id) => !first.includes(id))];
}

// A gauntlet clear just done, and what it gave: its first clear (on that mode) gives Awakener's
// orbs, its first clean clear on normal the looks and hard mode, and a record for its order
export type GauntletClear = {
    order: string[];
    hard: boolean;
    seconds: number;
    retries: number;
};

export type GauntletRewards = {
    firstClear: boolean;
    firstCleanClear: boolean;
    orbs: number;
    // The looks, the gold border and hard mode, just now
    looks: boolean;
    hardOpened: boolean;
    record: boolean;
    // The order's best before this one
    previous?: GauntletRecord;
};

function isBetterGauntlet(record: GauntletRecord, than: GauntletRecord | undefined): boolean {
    if (!than) {
        return true;
    }
    if (record.clean !== than.clean) {
        return record.clean;
    }
    return record.seconds < than.seconds;
}

export function recordGauntlet(save: SaveData, clear: GauntletClear): GauntletRewards {
    const mode = clear.hard ? "hard" : "normal";
    const hadLooks = hasGauntletLooks(save);
    const hadHard = isGauntletHardOpen(save);
    const before = save.gauntlet?.[mode] ?? { clears: 0, cleanClears: 0, best: {} };
    const clean = clear.retries === 0;
    const record: GauntletRecord = {
        seconds: clear.seconds,
        clean,
        order: [...clear.order],
        retries: clear.retries,
    };
    const key = gauntletOrderKey(clear.order);
    const previous = before.best[key];
    const better = isBetterGauntlet(record, previous);
    const after: GauntletModeRecord = {
        clears: before.clears + 1,
        cleanClears: before.cleanClears + (clean ? 1 : 0),
        best: better ? { ...before.best, [key]: record } : before.best,
    };
    save.gauntlet = { ...save.gauntlet, [mode]: after };
    const firstClear = before.clears === 0;
    const orbs = firstClear ? FIRST_CLEAR_ORBS : 0;
    if (orbs > 0) {
        save.awakenerOrbs = (save.awakenerOrbs ?? 0) + orbs;
    }
    return {
        firstClear,
        firstCleanClear: clean && before.cleanClears === 0,
        orbs,
        looks: !hadLooks && hasGauntletLooks(save),
        hardOpened: !hadHard && isGauntletHardOpen(save),
        record: better,
        ...(previous && { previous }),
    };
}

// An act whose ending's due (every one of its Awakened fights beaten, its ending not told yet),
// marked told: it's told once (SaveData.actEndings). Undefined if none is.
export function takeActEnding(save: SaveData): string | undefined {
    const act = ACTS.find(
        (act) =>
            act.ending &&
            isActEnded(act, save.mapVictories) &&
            !(save.actEndings ?? []).includes(act.id),
    );
    if (!act) {
        return undefined;
    }
    save.actEndings = [...(save.actEndings ?? []), act.id];
    return act.id;
}

// Awakener's orbs an Awakened fight's win gives (act-2-fallen-empire.md 7.2)
export const AWAKENED_WIN_ORBS = 1;

// Whether an orb can awaken this map's final boss: one held, on a campaign map's survival run
export function canAwaken(save: SaveData, mapId: string): boolean {
    const map = MAP_BY_ID.get(mapId);
    return (
        (save.awakenerOrbs ?? 0) > 0 &&
        map !== undefined &&
        CAMPAIGN_MAPS.includes(map) &&
        takesRelics(map)
    );
}

// A Vault run's week, its best kept if it's better, and only the latest weeks
export function recordVault(
    save: SaveData,
    key: string,
    run: { seconds: number; kills: number; victory: boolean },
): boolean {
    if (!parseWeekKey(key)) {
        return false;
    }
    const best = save.vault?.[key];
    const better = isBetterVault(run, best);
    const runs = (best?.runs ?? 0) + 1;
    const record: VaultRecord = better
        ? { seconds: run.seconds, kills: run.kills, victory: run.victory, runs }
        : { ...best!, runs };
    const weeks = { ...save.vault, [key]: record };
    // Keys sort as their weeks do ("2026-W46")
    const kept = Object.keys(weeks).sort().slice(-VAULT_WEEKS_KEPT);
    save.vault = Object.fromEntries(kept.map((week) => [week, weeks[week]]));
    return better;
}

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
    // A fight in parts: a part beaten is kept, the next to play; past the last, from the first
    // again (the map's beaten for good). Only the last beats the map.
    const stages = MAP_BY_ID.get(run.mapId)?.stages;
    if (run.victory && stages && (run.stage ?? 0) === getFightStage(save, run.mapId)) {
        const next = (run.stage ?? 0) + 1;
        save.fightStages = { ...save.fightStages, [run.mapId]: next >= stages.length ? 0 : next };
    }
    // An Awakener's orb on the final boss is spent once it's come, won or not
    if (run.awakened?.seen) {
        save.awakenerOrbs = Math.max(0, (save.awakenerOrbs ?? 0) - 1) || undefined;
        if (run.victory) {
            save.awakenedWins = {
                ...save.awakenedWins,
                [run.mapId]: (save.awakenedWins?.[run.mapId] ?? 0) + 1,
            };
        }
    }
    if (run.invasion?.killed && INVADER_BY_ID.has(run.invasion.id)) {
        const id = run.invasion.id;
        save.invasions = { ...save.invasions, [id]: (save.invasions?.[id] ?? 0) + 1 };
    }
    // The Vault's records are the same for everyone: relic-free
    if (run.vault && isRelicFree(run)) {
        recordVault(save, run.vault, run);
    }
    if (run.victory && beatsMap(run)) {
        if (GAUNTLET_FIGHTS.includes(run.mapId) && !save.awakenedOrder?.includes(run.mapId)) {
            save.awakenedOrder = [...(save.awakenedOrder ?? []), run.mapId];
        }
        // Each Awakened fight won gives an Awakener's orb (the gauntlet's fights don't come here)
        if (GAUNTLET_FIGHTS.includes(run.mapId)) {
            save.awakenerOrbs = (save.awakenerOrbs ?? 0) + AWAKENED_WIN_ORBS;
        }
        save.victories++;
        save.mapVictories[run.mapId] = (save.mapVictories[run.mapId] ?? 0) + 1;
        // A win with relics on still counts, but sets only the map's ordinary records
        // (act-2-fallen-empire.md, 13.2): not hard mode's. A remixed win sets its remixes' instead.
        const remixed = isRemixed(run);
        if (remixed) {
            // An endless one's recorded as it ends, below
            if (!run.endless) {
                recordRemix(save, run);
            }
        } else if (isHardRecord(run)) {
            save.hardVictories[run.mapId] = (save.hardVictories[run.mapId] ?? 0) + 1;
        }
        if (run.expert && isRelicFree(run)) {
            save.expertVictories[run.mapId] = (save.expertVictories[run.mapId] ?? 0) + 1;
        }
        if (!remixed && !run.endless && isActRecord(save, run)) {
            save.actBest ??= {};
            save.actBest[run.mapId] = {
                seconds: run.seconds,
                step: run.actStep ?? 0,
                ...runSetup(run),
            };
        }
        if (!remixed && !run.endless && isInvocationRecord(save, run)) {
            save.invocationBest ??= {};
            save.invocationBest[run.mapId] = {
                points: run.points!,
                seconds: run.seconds,
                ...(run.relics && run.relics.length > 0 && { relics: [...run.relics] }),
            };
        }
    }
    save.totalKills += run.kills;
    save.bestSeconds = Math.max(save.bestSeconds, run.seconds);
    save.bestLevel = Math.max(save.bestLevel, run.level);
    if (run.endless && isRemixed(run)) {
        recordRemix(save, run);
    } else if (run.endless && isEndlessRecord(save, run)) {
        const records = isHardRecord(run) ? save.hardEndlessBest : save.endlessBest;
        records[run.mapId] = { round: run.round ?? 1, seconds: run.seconds, ...runSetup(run) };
        if (MAP_BY_ID.get(run.mapId)?.act) {
            records[run.mapId].step = run.actStep ?? 0;
        }
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
    for (const id of run.trophies ?? []) {
        if (!save.trophies.includes(id)) {
            save.trophies.push(id);
        }
    }
    // Won or not, the room was beaten
    if (run.scabarasBeaten) {
        save.scabarasBeaten = true;
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
    applyQuestTrophies(save);
    applyUnlocks(save, run);
    return quests;
}

function applyQuestTrophies(save: SaveData): void {
    for (const trophy of TROPHIES) {
        if (
            trophy.from.kind === "quest" &&
            save.questsDone.includes(trophy.from.questId) &&
            !save.trophies.includes(trophy.id)
        ) {
            save.trophies.push(trophy.id);
        }
    }
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
            // A fight in parts is beaten by its last part only (as recordRun counts it)
            const won =
                (save.mapVictories[objective.mapId] ?? 0) > 0 ||
                (run?.victory === true && run.mapId === objective.mapId && beatsMap(run));
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

// Whether an endless run got further than any before it on its map (hard mode
// keeps its own records): a later round, or as far but longer
export function isEndlessRecord(save: SaveData, run: RunSummary): boolean {
    if (isDevMap(run.mapId)) {
        return false;
    }
    const best = (isHardRecord(run) ? save.hardEndlessBest : save.endlessBest)[run.mapId];
    const round = run.round ?? 1;
    return !best || round > best.round || (round === best.round && run.seconds > best.seconds);
}

// A run with remixes on (content/remixes.ts)
export function isRemixed(run: RunSummary): boolean {
    return (run.remixes?.length ?? 0) > 0;
}

// A remixed run's records (SaveData.remixVictories): only a relic-free run's. A win counts once
// (an endless run is recorded as it ends, won or not).
function recordRemix(save: SaveData, run: RunSummary): void {
    if (!isRelicFree(run) || isDevMap(run.mapId)) {
        return;
    }
    const key = remixKey(run.mapId, cleanRemixes(run.remixes));
    const record: RemixRecord = save.remixVictories?.[key] ?? { wins: 0 };
    if (run.victory) {
        record.wins++;
        if (run.hard) {
            record.hard = (record.hard ?? 0) + 1;
        }
        if (!run.endless && (record.seconds === undefined || run.seconds < record.seconds)) {
            record.seconds = run.seconds;
        }
    }
    if (run.endless) {
        const round = run.round ?? 1;
        const best = record.endless;
        if (!best || round > best.round || (round === best.round && run.seconds > best.seconds)) {
            record.endless = { round, seconds: run.seconds };
        }
    }
    save.remixVictories ??= {};
    save.remixVictories[key] = record;
}

// The most remixes a map's been beaten with at once (its card's badge), relic-free
export function getRemixBest(save: SaveData, mapId: string): number {
    let most = 0;
    for (const [key, record] of Object.entries(save.remixVictories ?? {})) {
        const parsed = parseRemixKey(key);
        if (parsed?.mapId === mapId && record.wins > 0) {
            most = Math.max(most, parsed.remixes.length);
        }
    }
    return most;
}

// No relics on (content/relics.ts): hard mode's records are relic-free
export function isRelicFree(run: RunSummary): boolean {
    return !run.relics || run.relics.length === 0;
}

// A hard run that sets hard mode's records: one with no relics on
export function isHardRecord(run: RunSummary): boolean {
    return run.hard === true && isRelicFree(run);
}

// What a record keeps of the run that set it
function runSetup(run: RunSummary): RecordSetup {
    return {
        ...(run.points !== undefined && run.points > 0 && { points: run.points }),
        ...(run.relics && run.relics.length > 0 && { relics: [...run.relics] }),
    };
}

// Whether a win is its map's best at invocations (SaveData.invocationBest): at more points than the
// one kept, or as many and quicker
export function isInvocationRecord(save: SaveData, run: RunSummary): boolean {
    const points = run.points ?? 0;
    if (!run.victory || points <= 0 || isDevMap(run.mapId)) {
        return false;
    }
    const best = save.invocationBest?.[run.mapId];
    return !best || points > best.points || (points === best.points && run.seconds < best.seconds);
}

// Whether a win on an act's map is its best (SaveData.actBest): at a higher step than the one
// kept, or as high and quicker
export function isActRecord(save: SaveData, run: RunSummary): boolean {
    if (!run.victory || !MAP_BY_ID.get(run.mapId)?.act || isDevMap(run.mapId)) {
        return false;
    }
    const best = save.actBest?.[run.mapId];
    const step = run.actStep ?? 0;
    return !best || step > best.step || (step === best.step && run.seconds < best.seconds);
}

// Beating a map counts from any run so far; the rest need doing in one run
export function isTaskDone(save: SaveData, task: UnlockTask, run?: RunSummary): boolean {
    switch (task.kind) {
        case "beatMap":
            return ((task.hard ? save.hardVictories : save.mapVictories)[task.mapId] ?? 0) > 0;
        case "killBoss":
            return run?.mapId === task.mapId && run.bossesKilled.includes(task.enemyId);
        case "survive":
            return run?.mapId === task.mapId && run.seconds >= task.seconds;
        case "raidChest":
            return (
                save.trophies.includes(task.trophyId) ||
                (run?.trophies ?? []).includes(task.trophyId)
            );
        case "realmCaskets":
            return run?.mapId === task.mapId && (run.realmCaskets ?? 0) >= task.count;
        case "pieces":
            return task.trophyIds.every(
                (id) => save.trophies.includes(id) || (run?.trophies ?? []).includes(id),
            );
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

// Whether a won run beats its map: any win, but in a fight in parts only the last part's
function beatsMap(run: RunSummary): boolean {
    const stages = MAP_BY_ID.get(run.mapId)?.stages;
    return !stages || (run.stage ?? 0) + 1 >= stages.length;
}

// The part of a fight in parts a run plays next (MapDef.stages): the first not beaten (from the
// first again once the last has been)
export function getFightStage(save: SaveData, mapId: string): number {
    const stages = MAP_BY_ID.get(mapId)?.stages;
    const next = save.fightStages?.[mapId] ?? 0;
    return stages && Number.isInteger(next) && next > 0 && next < stages.length ? next : 0;
}

// How many of a fight in parts' parts can be played (MapDef.stages): all of them once it's been
// beaten, or each up to the next not beaten yet, to be fought again
export function getReachedStages(save: SaveData, mapId: string): number {
    const stages = MAP_BY_ID.get(mapId)?.stages;
    if (!stages) {
        return 0;
    }
    return (save.mapVictories[mapId] ?? 0) > 0 ? stages.length : getFightStage(save, mapId) + 1;
}

// The first map is always open; each after it opens once the one before it
// has been beaten, or once it's been beaten itself (a co-op guest can win on
// a map the host had open). The fun and seasonal maps are open from the start.
export function isMapUnlocked(save: SaveData, mapId: string): boolean {
    // Behind another map, whatever this one is (MapDef.requires)
    const requires = MAP_BY_ID.get(mapId)?.requires;
    if (requires) {
        return (save.mapVictories[requires] ?? 0) > 0 || (save.mapVictories[mapId] ?? 0) > 0;
    }
    if (isFunMap(mapId) || isSeasonalMap(mapId) || isRaidMap(mapId) || isDevMap(mapId)) {
        return true;
    }
    // An act's maps open together once the map it requires has been beaten, in any order, and
    // not at all while the act isn't out (isMapOut)
    const map = MAP_BY_ID.get(mapId);
    const act = map?.act;
    if (map && act) {
        return (
            isMapOut(map) &&
            ((save.mapVictories[act.requires] ?? 0) > 0 || (save.mapVictories[mapId] ?? 0) > 0)
        );
    }
    // A boss fight opens once the map it's the hard mode of has been beaten
    const fight = MAP_BY_ID.get(mapId)?.fight;
    if (fight) {
        return (save.mapVictories[fight.requires] ?? 0) > 0 || (save.mapVictories[mapId] ?? 0) > 0;
    }
    const index = MAPS.findIndex((m) => m.id === mapId);
    return (
        index === 0 ||
        (index > 0 && (save.mapVictories[MAPS[index - 1].id] ?? 0) > 0) ||
        (save.mapVictories[mapId] ?? 0) > 0
    );
}

// A map can be played endless once it's been beaten; the fun maps are only
// ever endless, and a boss fight never is (there's nothing after its boss)
export function isEndlessUnlocked(save: SaveData, mapId: string): boolean {
    // A raid ends with its last room: there's no round after it to come round again. The Tombs of
    // Amascut go by their invocations instead.
    const map = MAP_BY_ID.get(mapId);
    if (map?.fight || map?.tombs || isRaidMap(mapId)) {
        return false;
    }
    return isFunMap(mapId) || (save.mapVictories[mapId] ?? 0) > 0;
}

// Hard mode opens the same way: once the map's been beaten, and from the start
// on the fun maps, which can't be
export function isHardUnlocked(save: SaveData, mapId: string): boolean {
    // The Tombs of Amascut's invocations take hard mode's place
    if (MAP_BY_ID.get(mapId)?.tombs) {
        return false;
    }
    return isFunMap(mapId) || (save.mapVictories[mapId] ?? 0) > 0;
}

// A raid's expert mode, once it's been beaten on hard
export function isExpertUnlocked(save: SaveData, mapId: string): boolean {
    return isRaidMap(mapId) && (save.hardVictories[mapId] ?? 0) > 0;
}

// Which of a raid's halls have a teleporter: the rooms whose boss has been killed before, in any
// of its forms (Nylocas Vasilias's colours, what Verzik rises into)
export function getRaidPortals(save: SaveData, mapId: string): boolean[] {
    const raid = getMap(mapId).raid;
    if (!raid) {
        return [];
    }
    return raid.rooms.map((room) => {
        const seen = new Set<string>();
        const ids = [room.boss];
        while (ids.length > 0) {
            const id = ids.pop()!;
            if (seen.has(id)) {
                continue;
            }
            seen.add(id);
            const boss = ENEMY_BY_ID.get(id)?.boss;
            ids.push(...(boss?.colours?.forms ?? []));
            if (boss?.rises?.into) {
                ids.push(boss.rises.into);
            }
        }
        return [...seen].some((id) => (save.enemyKills[id] ?? 0) > 0);
    });
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

// A save as a file, to keep or to carry to another browser, marked with the
// game that made it
export function exportSave(save: SaveData, gameVersion: string): string {
    return JSON.stringify({ ...save, gameVersion }, null, 2);
}

// An exported save from a newer game than this one, which can't come in until
// this one's updated
export class NewerSaveError extends Error {
    constructor(readonly gameVersion?: string) {
        super("The save is from a newer version of the game");
    }
}

// Reads an exported save, brought up to the current version. Throws if the
// text isn't one, or it's from a newer game.
export function importSave(text: string, gameVersion: string): SaveData {
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== "object" || typeof (raw as SaveData).version !== "number") {
        throw new Error("Not a save");
    }
    const newer = newerGame(raw, gameVersion);
    if (newer) {
        throw new NewerSaveError(newer.gameVersion);
    }
    return migrateSave(raw);
}

// A save written by a newer game than this one: which (if it says), and
// whether its format is newer too (a version above SAVE_VERSION), which this
// game can't read, let alone write
export type NewerSave = { gameVersion?: string; format?: boolean };

// Whether a save was written by a newer game than this one, and how: a newer
// format, or a later release, which can have ids this one doesn't know and
// would drop. Saves from before they were marked count as older.
export function newerGame(raw: object, gameVersion: string): NewerSave | undefined {
    const data = raw as Partial<SaveData>;
    const written = getGameVersion(raw);
    if (typeof data.version === "number" && data.version > SAVE_VERSION) {
        return { gameVersion: written, format: true };
    }
    if (written !== undefined && compareGameVersions(written, gameVersion) > 0) {
        return { gameVersion: written };
    }
    return undefined;
}

function getGameVersion(raw: object): string | undefined {
    const { gameVersion } = raw as Partial<SaveData>;
    return typeof gameVersion === "string" ? gameVersion : undefined;
}

// Below 0 when a is older than b, above 0 when it's newer. Numeric, so 0.10.0
// is after 0.9.0.
export function compareGameVersions(a: string, b: string): number {
    const [partsA, partsB] = [a, b].map((v) => v.split(".").map((part) => parseInt(part) || 0));
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

// What loading the save found
export type LoadedSave = {
    save: SaveData;
    // It couldn't be read, so this is a fresh one: the key its text is kept
    // under
    unreadable?: string;
    // There was no room to keep a copy of it, so it stays where it is (that's
    // the key above) and nothing's written over it
    noRoom?: boolean;
    // It's from a newer game than this one, so it isn't written over
    newer?: NewerSave;
};

// A save that couldn't be read, kept so it can be got back
export type UnreadableSave = { key: string; time: number };

export interface SaveStore {
    // This game's version, marked on what it saves
    readonly gameVersion: string;
    load(): LoadedSave;
    save(data: SaveData): void;
    // The save's text as it's stored, for exporting a newer game's as it is
    read(): string | undefined;
    // Writes over a newer game's save after all, as the player's chosen to
    writeOver(): void;
    // Newest first
    getUnreadable(): UnreadableSave[];
    readUnreadable(key: string): string | undefined;
    deleteUnreadable(key: string): void;
}

// From the game's old name, Rune Survivors; kept as it is, as it's where
// every player's save is
const STORAGE_KEY = "rune-survivors-save";
// Saves that couldn't be read, kept under this and when (Date.now())
const UNREADABLE_KEY = `${STORAGE_KEY}-unreadable-`;
// The one that went wrong, even if the fresh save after it goes wrong too
const UNREADABLE_KEPT = 2;

export class LocalSaveStore implements SaveStore {
    // What's stored mustn't be written over: it's from a newer game, or it
    // couldn't be read and there wasn't room to keep a copy
    private keep = false;

    constructor(readonly gameVersion: string) {}

    load(): LoadedSave {
        this.keep = false;
        let text: string | null = null;
        try {
            text = window.localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            console.error("Failed to load save", e);
        }
        if (!text) {
            return { save: createSave() };
        }
        let newer: NewerSave | undefined;
        try {
            const raw: unknown = JSON.parse(text);
            // Anything that isn't a save (every save has had a version or
            // coins) is kept rather than migrated into a fresh one
            if (!raw || typeof raw !== "object" || !("version" in raw || "coins" in raw)) {
                throw new Error("Not a save");
            }
            // Before it's migrated: a newer game's save might not migrate,
            // and it mustn't be written over for that
            newer = newerGame(raw, this.gameVersion);
            const save = migrateSave(raw);
            if (newer) {
                this.keep = true;
                return { save, newer };
            }
            return { save };
        } catch (e) {
            console.error("Failed to load save", e);
            if (newer) {
                this.keep = true;
                return { save: createSave(), newer };
            }
            const key = this.keepUnreadable(text);
            if (key === undefined) {
                this.keep = true;
                return { save: createSave(), unreadable: STORAGE_KEY, noRoom: true };
            }
            return { save: createSave(), unreadable: key };
        }
    }

    save(data: SaveData): void {
        if (this.keep) {
            return;
        }
        try {
            const marked: SaveData = { ...data, gameVersion: this.gameVersion };
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(marked));
        } catch (e) {
            console.error("Failed to save", e);
        }
    }

    read(): string | undefined {
        try {
            return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
        } catch (e) {
            return undefined;
        }
    }

    writeOver(): void {
        this.keep = false;
    }

    // Keeps a save that couldn't be read, before a fresh one's written over
    // it, and returns where. The same text is only kept once (it's read again
    // whenever the tab gets the save back). Nowhere with no room for a copy.
    private keepUnreadable(text: string): string | undefined {
        try {
            const kept = this.getUnreadable();
            const same = kept.find(({ key }) => window.localStorage.getItem(key) === text);
            if (same) {
                return same.key;
            }
            const key = UNREADABLE_KEY + Date.now();
            window.localStorage.setItem(key, text);
            for (const old of kept.slice(UNREADABLE_KEPT - 1)) {
                window.localStorage.removeItem(old.key);
            }
            return key;
        } catch (e) {
            console.error("Failed to keep the save that couldn't be read", e);
            return undefined;
        }
    }

    getUnreadable(): UnreadableSave[] {
        const kept: UnreadableSave[] = [];
        try {
            const storage = window.localStorage;
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (key?.startsWith(UNREADABLE_KEY)) {
                    kept.push({ key, time: Number(key.slice(UNREADABLE_KEY.length)) || 0 });
                }
            }
        } catch (e) {
            console.error("Failed to list the unreadable saves", e);
        }
        return kept.sort((a, b) => b.time - a.time);
    }

    readUnreadable(key: string): string | undefined {
        try {
            return window.localStorage.getItem(key) ?? undefined;
        } catch (e) {
            return undefined;
        }
    }

    deleteUnreadable(key: string): void {
        // Never the save itself
        if (!key.startsWith(UNREADABLE_KEY)) {
            return;
        }
        try {
            window.localStorage.removeItem(key);
        } catch (e) {
            console.error("Failed to delete an unreadable save", e);
        }
    }
}
