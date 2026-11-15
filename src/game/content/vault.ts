import { Rng } from "../core/Rng";
import { CHARACTERS } from "./characters";
import { GAUNTLET_FIGHTS } from "./gauntlet";
import { RUN_SET, RunInvocationDef } from "./invocations";
import { CAMPAIGN_MAPS, takesInvocations } from "./maps";
import { REMIX_IDS, RemixId } from "./remixes";

// The weekly Vault (act-2-fallen-empire.md 8.6, item 3): one seeded run a week, the same for
// everyone. The ISO week (in UTC, so it turns at the same moment everywhere: Monday 00:00 UTC) is
// the seed, and the seed picks the map (a campaign map from the Desert on), one or two remixes,
// three invocations and an adventurer. The sim's deterministic, so the run is the same run for
// everyone who plays it (but for what each player's bought). Its records are kept by week.

export type VaultWeek = { year: number; week: number };

export type VaultRun = {
    // "2026-W46"
    key: string;
    seed: number;
    mapId: string;
    remixes: RemixId[];
    invocations: string[];
    characterId: string;
};

const DAY = 24 * 60 * 60 * 1000;

// Its seed off the week's own hash, so this game's other seeds never line up with it
const VAULT_SEED = 0x7a017ed5;
// How many invocations, and the remixes (from, to)
const VAULT_INVOCATIONS = 3;
const VAULT_REMIXES: [number, number] = [1, 2];

// The ISO 8601 week a moment (ms since 1970, UTC) is in: weeks start on Monday, and the first of a
// year is the one with its first Thursday in it, so the days round New Year can be the year
// before's week 52 or 53, or the next year's week 1
export function isoWeek(time: number): VaultWeek {
    const date = new Date(time);
    const day = Math.floor(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY,
    );
    // Monday 0 to Sunday 6 (1970-01-01, day 0, was a Thursday)
    const weekday = (((day + 3) % 7) + 7) % 7;
    const thursday = day - weekday + 3;
    const year = new Date(thursday * DAY).getUTCFullYear();
    const firstThursday = Math.floor(Date.UTC(year, 0, 4) / DAY);
    const firstMonday = firstThursday - ((((firstThursday + 3) % 7) + 7) % 7);
    return { year, week: Math.floor((thursday - 3 - firstMonday) / 7) + 1 };
}

// When a week starts (Monday 00:00 UTC), ms since 1970
export function weekStart({ year, week }: VaultWeek): number {
    const jan4 = Math.floor(Date.UTC(year, 0, 4) / DAY);
    const firstMonday = jan4 - ((((jan4 + 3) % 7) + 7) % 7);
    return (firstMonday + (week - 1) * 7) * DAY;
}

export function weekKey({ year, week }: VaultWeek): string {
    return `${year}-W${String(week).padStart(2, "0")}`;
}

export function parseWeekKey(key: string): VaultWeek | undefined {
    const match = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!match) {
        return undefined;
    }
    const week = { year: Number(match[1]), week: Number(match[2]) };
    // Not one that doesn't exist (week 53 of a year of 52)
    return week.week >= 1 && weekKey(isoWeek(weekStart(week))) === key ? week : undefined;
}

// A week's seed: its key's FNV-1a hash
export function vaultSeed(key: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
    }
    return ((hash ^ VAULT_SEED) >>> 0) & 0x7fffffff;
}

// The maps it can be: campaign survival runs from the Desert on
export const VAULT_MAPS = CAMPAIGN_MAPS.filter((map) => takesInvocations(map)).map((m) => m.id);

// The invocations it can pick: a run's own, not hard mode's (the Vault's never on hard)
const VAULT_INVOCATION_IDS = RUN_SET.invocations
    .filter((invocation) => !(invocation as RunInvocationDef).hard)
    .map((invocation) => invocation.id);

// Adventurers it can be: anyone a run can be played as (not a fun map's own)
const VAULT_CHARACTERS = CHARACTERS.filter((c) => !c.only).map((c) => c.id);

// A week's Vault, by its key
export function getVault(key: string): VaultRun {
    const seed = vaultSeed(key);
    const rng = new Rng(seed);
    const mapId = rng.pick(VAULT_MAPS);
    const remixes = pickSome(rng, REMIX_IDS, VAULT_REMIXES[0] + rng.int(VAULT_REMIXES[1]));
    const invocations = pickSome(rng, VAULT_INVOCATION_IDS, VAULT_INVOCATIONS);
    const characterId = rng.pick(VAULT_CHARACTERS);
    return {
        key,
        seed,
        mapId,
        // In their usual order
        remixes: REMIX_IDS.filter((id) => remixes.includes(id)),
        invocations: VAULT_INVOCATION_IDS.filter((id) => invocations.includes(id)),
        characterId,
    };
}

export function getVaultAt(time: number): VaultRun {
    return getVault(weekKey(isoWeek(time)));
}

// count different ones, by the Rng
function pickSome<T>(rng: Rng, from: readonly T[], count: number): T[] {
    const left = [...from];
    const out: T[] = [];
    while (out.length < count && left.length > 0) {
        out.push(left.splice(rng.int(left.length), 1)[0]);
    }
    return out;
}

// Open once the act's four Awakened fights are beaten (8.6, the act's rewards)
export function isVaultOpen(mapVictories: Readonly<Record<string, number>>): boolean {
    return GAUNTLET_FIGHTS.every((id) => (mapVictories[id] ?? 0) > 0);
}

// A week's best (SaveData.vault): a win beats a fall; then the quicker win, or the longer fall;
// then more kills
export type VaultRecord = { seconds: number; kills: number; victory: boolean; runs: number };

export function isBetterVault(
    run: { seconds: number; kills: number; victory: boolean },
    best: VaultRecord | undefined,
): boolean {
    if (!best) {
        return true;
    }
    if (run.victory !== best.victory) {
        return run.victory;
    }
    if (run.seconds !== best.seconds) {
        return run.victory ? run.seconds < best.seconds : run.seconds > best.seconds;
    }
    return run.kills > best.kills;
}

// The weeks kept: this many, the latest
export const VAULT_WEEKS_KEPT = 12;
