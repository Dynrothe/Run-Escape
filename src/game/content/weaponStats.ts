import { fmtNum, t, tp } from "../i18n";
import { WEAPON_DAMAGE_BALANCE, WeaponDamageProfile } from "./balance";
import { StatText } from "./stats";
import { WeaponDef, WeaponLevel } from "./types";
import { weaponDamageProfileScale } from "./weaponBalance";

// A weapon stat as the level up cards, the pause menu and the HUD's tooltips
// show it: "Damage 13", or for a level up "Damage 10 → 13"
export type WeaponStatLine = {
    label: string;
    // The label in English, which its icon goes by
    english: string;
    value: string;
    // A level up's change: what it was before, and whether it's for the better
    from?: string;
    better?: boolean;
};

// A weapon's damage bonus (0.15 = +15%) as the HUD's tooltip and the level up
// cards show it: "+15%"
export function formatWeaponBonus(bonus: number): string {
    return t("weaponstat.bonus", {
        value: fmtNum(Math.round(bonus * 100), { useGrouping: false }),
    });
}

// The pause menu's line for a weapon's damage bonus: "+15% damage"
export function weaponBonusText(bonus: number): StatText {
    return {
        text: t("canvas.weapon_bonus_damage", { bonus: formatWeaponBonus(bonus) }),
        english: "damage",
    };
}

// The weapon stats' words, for locales/en/gen.json: weaponstat.<stat> is a stat's label (also the
// key of its StatField), and the rest are how a value reads, {value} being the number
export const WEAPON_STAT_MESSAGES: Record<string, string> = {
    "weaponstat.damage": "Damage",
    "weaponstat.attacks": "Attacks",
    "weaponstat.knockback": "Knockback",
    "weaponstat.projectiles": "Projectiles",
    "weaponstat.targets": "Targets",
    "weaponstat.pierces": "Pierces",
    "weaponstat.venom": "Venom",
    "weaponstat.venom_lasts": "Venom lasts",
    "weaponstat.freezes_for": "Freezes for",
    "weaponstat.burns_for": "Burns for",
    "weaponstat.weakens_for": "Weakens for",
    "weaponstat.sides": "Sides",
    "weaponstat.reach": "Reach",
    "weaponstat.arc": "Arc",
    "weaponstat.bounces": "Bounces",
    "weaponstat.splash": "Splash",
    "weaponstat.speed": "Speed",
    "weaponstat.radius": "Radius",
    "weaponstat.blast_radius": "Blast radius",
    "weaponstat.lasts": "Lasts",
    "weaponstat.spin_speed": "Spin speed",
    "weaponstat.bonus": "+{value}%",
    "weaponstat.value.per_second": "{value}/s",
    "weaponstat.value.seconds": "{value}s",
    "weaponstat.value.degrees": "{value}°",
    "weaponstat.value.tiles.one": "{value} tile",
    "weaponstat.value.tiles.other": "{value} tiles",
    "weaponstat.value.none": "none",
    "weaponstat.value.all": "all",
    "weaponstat.change": "{label} {from} → {value}",
    "weaponstat.line": "{label} {value}",
};

type StatField = {
    // The key of the label in WEAPON_STAT_MESSAGES
    label: string;
    // undefined when the stat means nothing for this weapon
    get: (level: WeaponLevel) => number | undefined;
    format: (value: number) => string;
    // Listed among the weapon's stats when this says so; otherwise it's only
    // shown when a level changes it
    listed?: (value: number) => boolean;
};

// The swing's arc when a level doesn't set one (Sim's SLASH_ARC)
const DEFAULT_ARC = 1.1;

// Rounds without trailing zeros: 2.2, 0.85, 13
function round(value: number, digits = 1): string {
    // (+ 0 turns a -0 into 0, as String did)
    return fmtNum(Number(value.toFixed(digits)) + 0, {
        useGrouping: false,
        maximumFractionDigits: digits,
    });
}

const always = () => true;
const positive = (value: number) => value > 0;

const damage: StatField = {
    label: "weaponstat.damage",
    get: (level) => level.damage,
    format: (value) => round(value),
    listed: always,
};

// Attacks a second rather than the cooldown, so bigger is better like the rest
const rate: StatField = {
    label: "weaponstat.attacks",
    get: (level) => 1 / level.cooldown,
    format: (value) =>
        t("weaponstat.value.per_second", {
            value: fmtNum(Number(value.toFixed(2)), {
                useGrouping: false,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }),
        }),
    listed: always,
};

const knockback: StatField = {
    label: "weaponstat.knockback",
    get: (level) => level.knockback,
    format: (value) => round(value, 2),
};

function tiles(label: string, listed?: StatField["listed"]): StatField {
    return {
        label,
        get: (level) => level.area,
        // "1 tile" when it rounds to one, whatever the exact size
        format: (value) =>
            value > 0
                ? tp("weaponstat.value.tiles", Number(value.toFixed(2)), { value: round(value, 2) })
                : t("weaponstat.value.none"),
        listed,
    };
}

function seconds(label: string, listed?: StatField["listed"]): StatField {
    return {
        label,
        get: (level) => level.duration,
        format: (value) => t("weaponstat.value.seconds", { value: round(value, 2) }),
        listed,
    };
}

const projectiles: StatField = {
    label: "weaponstat.projectiles",
    get: (level) => level.amount,
    format: (value) => round(value),
    listed: always,
};

// Toktz-xil-ul's 99 is everything in the way
const pierce: StatField = {
    label: "weaponstat.pierces",
    get: (level) => level.pierce,
    format: (value) => (value >= 99 ? t("weaponstat.value.all") : round(value)),
    listed: positive,
};

const venom: StatField = {
    label: "weaponstat.venom",
    get: (level) => level.venom,
    format: (value) => t("weaponstat.value.per_second", { value: round(value) }),
    listed: positive,
};

// What an aura's or a strike's duration is for: the freeze, the burning
// ground, the drain or the venom
function spellDuration(def: WeaponDef): StatField[] {
    if (def.freezes) {
        return [seconds("weaponstat.freezes_for", positive)];
    }
    if (def.burns) {
        return [seconds("weaponstat.burns_for", positive)];
    }
    if (def.drain) {
        return [seconds("weaponstat.weakens_for", positive)];
    }
    return [];
}

// Venom's length, for what poisons
function venomFields(damageScale: number): StatField[] {
    return [
        {
            ...venom,
            get: (level) => (level.venom === undefined ? undefined : level.venom * damageScale),
        },
        {
            ...seconds("weaponstat.venom_lasts", positive),
            get: (level) => (level.venom ? level.duration : undefined),
        },
    ];
}

// What each kind of weapon uses its level's numbers for (see Sim's fire*
// methods): amount is a slash's sides but a missile's projectiles, area a
// slash's reach but a missile's splash, and so on. Stats a kind ignores are
// left out.
function statFields(def: WeaponDef, profile: WeaponDamageProfile | undefined): StatField[] {
    const scale = weaponDamageProfileScale(profile, def);
    const tunedDamage = { ...damage, get: (level: WeaponLevel) => level.damage * scale };
    switch (def.kind) {
        case "slash":
        case "sweep":
            return [
                tunedDamage,
                rate,
                // Front, and behind too at 2
                {
                    label: "weaponstat.sides",
                    get: (level) => Math.min(level.amount, 2),
                    format: (value) => round(value),
                    listed: (value) => value > 1,
                },
                tiles("weaponstat.reach", always),
                ...(def.kind === "sweep"
                    ? [
                          {
                              label: "weaponstat.arc",
                              get: (level: WeaponLevel) => level.arc ?? DEFAULT_ARC,
                              format: (value: number) =>
                                  t("weaponstat.value.degrees", {
                                      value: fmtNum(Math.round((value * 2 * 180) / Math.PI), {
                                          useGrouping: false,
                                      }),
                                  }),
                          },
                      ]
                    : []),
                { ...knockback, listed: positive },
            ];
        case "missile":
        case "knives":
        case "axes":
            return [
                tunedDamage,
                rate,
                projectiles,
                ...(def.kind === "axes"
                    ? [
                          {
                              label: "weaponstat.bounces",
                              get: (level: WeaponLevel) => level.bounce ?? 0,
                              format: (value: number) => round(value),
                              listed: positive,
                          },
                      ]
                    : []),
                pierce,
                tiles("weaponstat.splash", positive),
                ...venomFields(scale),
                {
                    label: "weaponstat.speed",
                    get: (level) => level.speed,
                    format: (value) => round(value),
                },
                knockback,
            ];
        case "aura":
            return [
                tunedDamage,
                rate,
                tiles("weaponstat.radius", always),
                ...spellDuration(def),
                ...venomFields(scale),
                knockback,
            ];
        case "strike":
            return [
                tunedDamage,
                rate,
                { ...projectiles, label: "weaponstat.targets" },
                tiles("weaponstat.blast_radius", always),
                ...spellDuration(def),
                ...venomFields(scale),
                knockback,
            ];
        case "orbit":
            return [
                tunedDamage,
                rate,
                projectiles,
                seconds("weaponstat.lasts", always),
                tiles("weaponstat.radius"),
                {
                    label: "weaponstat.spin_speed",
                    get: (level) => level.speed,
                    format: (value) => round(value),
                },
                knockback,
            ];
    }
}

// A weapon's stats at a level, the ones worth listing for its kind
export function weaponStats(
    def: WeaponDef,
    level: WeaponLevel,
    profile: WeaponDamageProfile | undefined = WEAPON_DAMAGE_BALANCE.global,
): WeaponStatLine[] {
    const lines: WeaponStatLine[] = [];
    for (const field of statFields(def, profile)) {
        const value = field.get(level);
        if (value !== undefined && field.listed?.(value)) {
            lines.push({
                label: t(field.label),
                english: WEAPON_STAT_MESSAGES[field.label],
                value: field.format(value),
            });
        }
    }
    return lines;
}

// What changes from one level to the next, before and after. Changes too
// small to show once rounded are left out.
export function weaponStatChanges(
    def: WeaponDef,
    from: WeaponLevel,
    to: WeaponLevel,
    profile: WeaponDamageProfile | undefined = WEAPON_DAMAGE_BALANCE.global,
): WeaponStatLine[] {
    const lines: WeaponStatLine[] = [];
    for (const field of statFields(def, profile)) {
        // A stat that only means something at one of the levels (venom's
        // length once there's venom) counts as none at the other
        const before = field.get(from) ?? 0;
        const after = field.get(to) ?? 0;
        const value = field.format(after);
        const was = field.format(before);
        if (value !== was) {
            lines.push({
                label: t(field.label),
                english: WEAPON_STAT_MESSAGES[field.label],
                value,
                from: was,
                better: after > before,
            });
        }
    }
    return lines;
}

// "Damage 10 → 13", for plain text
export function formatWeaponStat(line: WeaponStatLine): string {
    return line.from === undefined
        ? t("weaponstat.line", { label: line.label, value: line.value })
        : t("weaponstat.change", { label: line.label, from: line.from, value: line.value });
}

// The same, with its English for the icon
export function weaponStatText(line: WeaponStatLine): StatText {
    return { text: formatWeaponStat(line), english: line.english };
}
