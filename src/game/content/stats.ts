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
    thorns: { label: "recoil damage", unit: "flat" },
    healChance: { label: "chance to heal on hit", unit: "percent" },
};

// The order stats are listed in
const STAT_ORDER = Object.keys(STAT_INFO) as StatKey[];

// "+10% damage", "-1 armour"
export function formatStat(key: StatKey, value: number): string {
    const info = STAT_INFO[key];
    const sign = value < 0 ? "-" : "+";
    const abs = Math.abs(value);
    if (info.unit === "percent") {
        return `${sign}${Math.round(abs * 100)}% ${info.label}`;
    }
    return `${sign}${Math.round(abs * 10) / 10} ${info.label}`;
}

export function formatStats(stats: Partial<Stats>): string[] {
    const lines: string[] = [];
    for (const key of STAT_ORDER) {
        const value = stats[key];
        if (value) {
            lines.push(formatStat(key, value));
        }
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
