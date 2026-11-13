import { fmtNum, t, tr } from "../i18n";
import { StatKey, Stats } from "./types";

// How each stat reads to the player, for gear, potions and comparisons
export const STAT_INFO: Record<StatKey, { label: string; unit: "percent" | "flat" }> = {
    might: { label: "damage", unit: "percent" },
    meleeMight: { label: "melee damage", unit: "percent" },
    rangedMight: { label: "ranged damage", unit: "percent" },
    magicMight: { label: "magic damage", unit: "percent" },
    bossMight: { label: "damage to bosses", unit: "percent" },
    levelMight: { label: "damage a level", unit: "percent" },
    armor: { label: "armour", unit: "flat" },
    maxHp: { label: "max hitpoints", unit: "percent" },
    regen: { label: "hitpoints a minute", unit: "flat" },
    cooldown: { label: "weapon speed", unit: "percent" },
    area: { label: "area", unit: "percent" },
    auraArea: { label: "aura area", unit: "percent" },
    speed: { label: "projectile speed", unit: "percent" },
    duration: { label: "effect duration", unit: "percent" },
    amount: { label: "projectiles", unit: "flat" },
    moveSpeed: { label: "movement speed", unit: "percent" },
    magnet: { label: "pickup range", unit: "percent" },
    luck: { label: "luck", unit: "percent" },
    growth: { label: "experience", unit: "percent" },
    greed: { label: "coins", unit: "percent" },
    revival: { label: "revivals", unit: "flat" },
    reroll: { label: "rerolls", unit: "flat" },
    banish: { label: "banishes", unit: "flat" },
    thorns: { label: "recoil damage", unit: "flat" },
    healChance: { label: "chance to heal on hit", unit: "percent" },
    meleeKnockback: { label: "melee knockback", unit: "percent" },
    meleeSpeed: { label: "melee attack speed", unit: "percent" },
    weaponSlots: { label: "weapon slots", unit: "flat" },
    passiveSlots: { label: "passive slots", unit: "flat" },
    powerUpRate: { label: "power-up drops", unit: "percent" },
};

// The order stats are listed in
const STAT_ORDER = Object.keys(STAT_INFO) as StatKey[];

// The sentences stats are shown in, for locales/en/gen.json (stat.<key>.label for each stat's
// label, then statline.*): {sign} is "+" or "-", so a language can put the number after the label
export const STAT_MESSAGES: Record<string, string> = {
    ...Object.fromEntries(STAT_ORDER.map((key) => [`stat.${key}.label`, STAT_INFO[key].label])),
    "statline.percent": "{sign}{value}% {label}",
    "statline.flat": "{sign}{value} {label}",
    "statline.value.percent": "{sign}{value}%",
    "statline.value.flat": "{sign}{value}",
};

// What a stat is called: "damage", "armour"
export function statLabel(key: StatKey): string {
    return tr(`stat.${key}.label`, STAT_INFO[key].label);
}

// A stat's size as a number: whole percent, or flat to a tenth
function statNumber(key: StatKey, abs: number): string {
    const noGroups = { useGrouping: false };
    return STAT_INFO[key].unit === "percent"
        ? fmtNum(Math.round(abs * 100), noGroups)
        : fmtNum(Math.round(abs * 10) / 10, noGroups);
}

// "+10% damage", "-1 armour"
export function formatStat(key: StatKey, value: number): string {
    return t(`statline.${STAT_INFO[key].unit}`, {
        sign: value < 0 ? "-" : "+",
        value: statNumber(key, Math.abs(value)),
        label: statLabel(key),
    });
}

// A line as a screen shows it, in the player's language. english is what the line says in
// English, or the label it starts with ("damage", "Venom lasts"), when the game built the line
// itself: its icon goes by the English (statLineIcon), as no language file holds the line.
export type StatText = { text: string; english?: string };

// Each stat that isn't zero, a line each: "+10% damage", "-1 armour"
export function formatStats(stats: Partial<Stats>): StatText[] {
    const lines: StatText[] = [];
    for (const key of STAT_ORDER) {
        const value = stats[key];
        if (value) {
            lines.push({ text: formatStat(key, value), english: STAT_INFO[key].label });
        }
    }
    return lines;
}

// A stat's value on its own: "+10%", "-1"
export function formatStatValue(key: StatKey, value: number): string {
    return t(`statline.value.${STAT_INFO[key].unit}`, {
        sign: value < 0 ? "-" : "+",
        value: statNumber(key, Math.abs(value)),
    });
}

// Every stat a piece has after an upgrade, with what it had before: for the
// Armoury's "Damage +10% → +15%". from is undefined when it's unchanged, and
// "+0" for a stat the upgrade adds.
export function compareStats(
    before: Partial<Stats>,
    after: Partial<Stats>,
): { key: StatKey; label: string; from?: string; to: string; better: boolean }[] {
    const lines: { key: StatKey; label: string; from?: string; to: string; better: boolean }[] = [];
    for (const key of STAT_ORDER) {
        const was = before[key] ?? 0;
        const now = after[key] ?? 0;
        if (!was && !now) {
            continue;
        }
        const label = statLabel(key);
        lines.push({
            key,
            label: label[0].toUpperCase() + label.slice(1),
            ...(Math.abs(now - was) > 1e-9 && { from: formatStatValue(key, was) }),
            to: formatStatValue(key, now),
            better: now >= was,
        });
    }
    return lines;
}

// What changes going from one set of stats to another: for comparing a new
// piece of gear with the one it replaces
export function diffStats(
    from: Partial<Stats>,
    to: Partial<Stats>,
): { key: StatKey; delta: number; text: string }[] {
    const diffs: { key: StatKey; delta: number; text: string }[] = [];
    for (const key of STAT_ORDER) {
        const delta = (to[key] ?? 0) - (from[key] ?? 0);
        if (Math.abs(delta) > 1e-9) {
            diffs.push({ key, delta, text: formatStat(key, delta) });
        }
    }
    return diffs;
}
