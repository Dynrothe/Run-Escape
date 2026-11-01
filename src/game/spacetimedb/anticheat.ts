import { CHARACTER_BY_ID } from "../content/characters";
import { isFunMap, MAP_BY_ID } from "../content/maps";
import { SHOP_UPGRADE_BY_ID } from "../content/shop";
import { LATER_ROUND_START } from "../content/endless";
import { RUN_LENGTH } from "../content/waves";
import { RunResult, TICKS_PER_SECOND } from "../core/Sim";
import { SaveData } from "../core/save";
import { endlessLevelForXp, runLevelForXp } from "../core/xp";

const MAX_RUN_SECONDS = 24 * 60 * 60;
const MAX_STANDARD_LEVEL = 126;
const MAX_ENDLESS_LEVEL = 9999;

const FINAL_BOSS_BY_MAP: Readonly<Record<string, string>> = {
    lumbridge: "wise_old_man",
    barrows: "dharok",
    wilderness: "king_black_dragon",
    desert: "kalphite_queen",
    fremennik: "vorkath",
    karamja: "tztok_jad",
    kourend: "alchemical_hydra",
    varlamore: "sol_heredit",
};

const BOSS_EARLIEST_SPAWN_SECONDS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    lumbridge: { count_draynor: 450, wise_old_man: 900 },
    barrows: { torag: 150, karil: 300, guthan: 450, ahrim: 600, verac: 750, dharok: 900 },
    wilderness: { crazy_archaeologist: 300, chaos_fanatic: 600, king_black_dragon: 900 },
    desert: { fareed: 300, dessous: 450, damis: 600, damis_risen: 600, kalphite_queen: 900 },
    fremennik: {
        dagannoth_rex: 300,
        dagannoth_supreme: 450,
        dagannoth_prime: 600,
        vorkath: 900,
    },
    karamja: { elvarg: 300, nezikchened: 450, ket_zek: 600, tztok_jad: 900 },
    kourend: {
        lizardman_shaman: 300,
        sarachnis: 450,
        skotizo: 600,
        alchemical_hydra: 900,
    },
    varlamore: {
        manticore: 300,
        shockwave_colossus: 450,
        javelin_colossus: 600,
        sol_heredit: 900,
    },
    grand_exchange: { the_doubler: 240, lure_master: 240, bot_farm: 240, melodox: 240 },
    east_varrock: { clan_leader: 240, rune_2h_pure: 240, wildy_mage: 240 },
    falador: { player_moderator: 240, cursed_you: 240, mod_murdoch: 240 },
    last_man_standing: { ags_specer: 240, claws_specer: 240, lms_dharok: 240 },
};

export type VerificationResult = { valid: true } | { valid: false; reason: string };

export function validateDisplayName(raw: string): VerificationResult {
    const trimmed = raw.trim();
    if (trimmed.length < 1 || trimmed.length > 12) {
        return { valid: false, reason: "Display name must be between 1 and 12 characters." };
    }
    if (!/^[A-Za-z0-9 _-]+$/.test(trimmed)) {
        return {
            valid: false,
            reason: "Display name can only contain letters, numbers, spaces, hyphens and underscores.",
        };
    }
    if (trimmed.includes("  ")) {
        return { valid: false, reason: "Display name cannot have consecutive spaces." };
    }
    return { valid: true };
}

/**
 * Mirrors the SpacetimeDB Rust module's `verify_run` heuristic and timeline checks.
 */
export function verifyRunResult(run: RunResult): VerificationResult {
    if (!MAP_BY_ID.has(run.mapId)) {
        return { valid: false, reason: `Unknown map '${run.mapId}'.` };
    }
    if (!CHARACTER_BY_ID.has(run.characterId) && run.characterId !== "dwarf") {
        return { valid: false, reason: `Unknown adventurer '${run.characterId}'.` };
    }
    if (run.mapId === "falador" && run.characterId !== "durial321") {
        return { valid: false, reason: "Falador runs must be played as Durial321." };
    }
    if (isFunMap(run.mapId)) {
        if (!run.endless) {
            return { valid: false, reason: "Fun maps are always endless." };
        }
        if (run.victory) {
            return { valid: false, reason: "Fun maps have no victory state." };
        }
    }

    if (!Number.isFinite(run.seconds) || run.seconds < 0 || run.seconds > MAX_RUN_SECONDS) {
        return { valid: false, reason: "Invalid run duration." };
    }
    const expectedSeconds = run.ticks / TICKS_PER_SECOND;
    if (Math.abs(expectedSeconds - run.seconds) > 0.2) {
        return { valid: false, reason: "Run tick count does not match elapsed seconds." };
    }

    if (!run.endless) {
        if (run.round !== 1) {
            return { valid: false, reason: "Standard runs only have 1 round." };
        }
        if (run.seconds > 905.0) {
            return { valid: false, reason: "Non-endless run exceeds standard duration (15:05 limit)." };
        }
        if (run.victory) {
            if (run.ticks < RUN_LENGTH * TICKS_PER_SECOND || run.seconds < RUN_LENGTH) {
                return {
                    valid: false,
                    reason: "Standard run cannot be won before the 15:00 final boss spawns.",
                };
            }
            const finalBoss = FINAL_BOSS_BY_MAP[run.mapId];
            if (finalBoss && !run.bossesKilled.includes(finalBoss)) {
                return {
                    valid: false,
                    reason: `Victory on ${run.mapId} requires defeating ${finalBoss}.`,
                };
            }
        }
    } else {
        if (run.victory) {
            return { valid: false, reason: "Endless runs do not end in a campaign victory." };
        }
        if (run.round < 1 || run.round > 200) {
            return { valid: false, reason: "Invalid endless round number." };
        }
        if (run.round > 1) {
            const laterRoundLength = RUN_LENGTH - LATER_ROUND_START;
            const minSeconds = RUN_LENGTH + (run.round - 2) * laterRoundLength;
            if (run.seconds + 0.5 < minSeconds) {
                return {
                    valid: false,
                    reason: `Elapsed time (${run.seconds.toFixed(1)}s) is too short to reach round ${run.round}.`,
                };
            }
        }
    }

    if (run.bossesKilled.length !== run.bossKillTicks.length) {
        return {
            valid: false,
            reason: "Boss kill list and boss kill timestamps must match in length.",
        };
    }
    if (run.kills < run.bossesKilled.length) {
        return { valid: false, reason: "Total kills cannot be fewer than bosses killed." };
    }

    const mapBosses = BOSS_EARLIEST_SPAWN_SECONDS[run.mapId] ?? {};
    let prevTick = 0;
    for (let i = 0; i < run.bossesKilled.length; i++) {
        const bossId = run.bossesKilled[i];
        const killTick = run.bossKillTicks[i];
        if (killTick < prevTick || killTick > run.ticks) {
            return {
                valid: false,
                reason: "Boss kill timestamps are out of order or exceed run duration.",
            };
        }
        prevTick = killTick;
        const earliestSec = mapBosses[bossId];
        if (earliestSec === undefined) {
            return {
                valid: false,
                reason: `Boss '${bossId}' does not spawn on map '${run.mapId}'.`,
            };
        }
        if (killTick < earliestSec * TICKS_PER_SECOND) {
            return {
                valid: false,
                reason: `Boss '${bossId}' was killed at ${(killTick / TICKS_PER_SECOND).toFixed(1)}s before its earliest spawn at ${earliestSec}s.`,
            };
        }
    }

    const roundCrowd = 1 + 0.5 * (run.round - 1);
    const maxKills = Math.ceil(run.seconds * 25 * roundCrowd + 150);
    if (run.kills > maxKills) {
        return {
            valid: false,
            reason: `Kill count (${run.kills}) exceeds plausible spawn limit (${maxKills}) for ${run.seconds.toFixed(1)}s.`,
        };
    }

    const maxCaskets = run.bossesKilled.length + Math.ceil(run.seconds / 10) + 25;
    if (run.casketsOpened > maxCaskets) {
        return { valid: false, reason: "Caskets opened exceeds plausible drop rate." };
    }
    if (run.gearFound.length > run.casketsOpened + 5) {
        return { valid: false, reason: "Gear found exceeds caskets opened." };
    }

    const maxLevelBound = run.endless ? MAX_ENDLESS_LEVEL : MAX_STANDARD_LEVEL;
    if (run.level < 1 || run.level > maxLevelBound) {
        return { valid: false, reason: "Invalid player level." };
    }
    const xpLevel = run.endless ? endlessLevelForXp(run.xp) : runLevelForXp(run.xp);
    if (run.level > xpLevel + run.casketsOpened + 2) {
        return {
            valid: false,
            reason: `Player level (${run.level}) is inconsistent with XP (${run.xp}) and caskets opened (${run.casketsOpened}).`,
        };
    }

    if (run.kills === 0 && run.casketsOpened === 0 && run.coins > 0) {
        return { valid: false, reason: "Cannot bank coins with 0 kills and 0 caskets." };
    }
    const maxCoins = run.kills * 60 + run.casketsOpened * 1500 + 2500;
    if (run.coins > maxCoins) {
        return {
            valid: false,
            reason: `Coins banked (${run.coins}) exceeds plausible maximum (${maxCoins}) for this run.`,
        };
    }

    return { valid: true };
}

export function verifySaveData(save: SaveData): VerificationResult {
    if (save.coins > save.totalCoins) {
        return { valid: false, reason: "Current coins cannot exceed total coins earned." };
    }
    if (save.victories > save.runs) {
        return { valid: false, reason: "Victories cannot exceed total runs." };
    }
    for (const [id, rank] of Object.entries(save.upgrades)) {
        const def = SHOP_UPGRADE_BY_ID.get(id);
        if (!def || rank < 0 || rank > def.maxRank) {
            return { valid: false, reason: `Invalid shop upgrade '${id}'.` };
        }
    }
    return { valid: true };
}

export function computeStandardScore(run: {
    victory: boolean;
    kills: number;
    coins: number;
    level: number;
    seconds: number;
}): number {
    const winBonus = run.victory ? 1_000_000 : 0;
    return winBonus + run.kills * 10 + run.coins + run.level * 100 + Math.round(run.seconds);
}
