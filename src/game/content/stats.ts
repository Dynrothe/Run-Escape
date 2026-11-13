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

// Every stat either of two pieces has, side by side: a casket's gear against
// the piece it would replace, for its table. worn or found is undefined where
// that piece hasn't got the stat, and change (found less worn) when the two
// show the same. change and better go by the values as shown, so the
// difference is always what the two columns say, never "-0%" (an upgraded
// piece's stats have fractions).
export type StatPair = {
    key: StatKey;
    label: string;
    worn?: string;
    found?: string;
    change?: string;
    better: boolean;
};

export function pairStats(worn: Partial<Stats>, found: Partial<Stats>): StatPair[] {
    const pairs: StatPair[] = [];
    for (const key of STAT_ORDER) {
        const was = worn[key] ?? 0;
        const now = found[key] ?? 0;
        if (!was && !now) {
            continue;
        }
        const label = statLabel(key);
        // In the steps the lines show (whole percent, or tenths), rounded as statNumber does
        const step = STAT_INFO[key].unit === "percent" ? 100 : 10;
        const shown = (value: number) => Math.sign(value) * Math.round(Math.abs(value) * step);
        const delta = shown(now) - shown(was);
        pairs.push({
            key,
            label: label[0].toUpperCase() + label.slice(1),
            ...(was !== 0 && { worn: formatStatValue(key, was) }),
            ...(now !== 0 && { found: formatStatValue(key, now) }),
            ...(delta !== 0 && { change: formatStatValue(key, delta / step) }),
            better: delta >= 0,
        });
    }
    return pairs;
}
