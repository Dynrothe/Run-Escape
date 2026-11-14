import { CAPPED_STATS, GEAR_UPGRADE, getGearStats } from "../content/endless";
import { formatPassiveNumber, getPassiveGain } from "../content/passives";
import { RARITIES, Rarity } from "../content/rarity";
import { passiveAbout, statAbout, weaponStatAbout } from "../content/statLore";
import { STAT_INFO, formatStatValue, statLabel } from "../content/stats";
import { GearDef, StatKey } from "../content/types";
import type { PassiveDef, WeaponDef } from "../content/types";
import { weaponStatSteps } from "../content/weaponStats";
import {
    BLOOD_FURY_HEAL,
    BLOOD_FURY_ROLL_INTERVAL,
    PLAYER_BASE_HP,
    TICKS_PER_SECOND,
} from "../core/Sim";
import type { Sim } from "../core/Sim";
import { getOverlevelDamage } from "../core/Upgrades";
import type { StatSource } from "../core/entities";
import { fmtNum, t, tl } from "../i18n";
import { formatCompact } from "../ui/formatCompact";
import type { BreakdownIcon, BreakdownLine, BreakdownView, SlotStatView } from "./GameStore";

// What the pause menu's tooltips show of where a number comes from: its starting size and what
// each upgrade added to it, each number in the colour of the rarity it was taken at

function colour(quality: Rarity | undefined): string | undefined {
    return quality ? RARITIES[quality].color : undefined;
}

function percent(value: number): string {
    return `${fmtNum(Math.round(value * 100), { useGrouping: false })}%`;
}

// A weapon's stats with how each got to its size: level 1's value, and each level's change (the
// damage's also the bonus its upgrades' rarities gave it)
export function getWeaponStatLines(
    def: WeaponDef,
    level: number,
    bonus: number,
    qualities: readonly (Rarity | undefined)[],
    // What multiplies its damage into a real hit (Sim.weaponDamageFactors), and what gives each of
    // those (Sim.getStatSources), for the damage's tooltip
    factors?: WeaponDamageFactors,
    sources?: Partial<Record<StatKey, readonly StatSource[]>>,
): SlotStatView[] {
    const damage = t("weaponstat.damage");
    return weaponStatSteps(def, level).map((stat) => {
        const lines: BreakdownLine[] = [
            {
                parts: stat.steps.map((step, i) => ({
                    label:
                        i === 0
                            ? t("pause.breakdown.base_label")
                            : t("pause.breakdown.level", { level: step.level }),
                    text: step.text,
                    color: colour(qualities[step.level - 1]),
                })),
                total: stat.value,
            },
        ];
        if (stat.label === damage && bonus > 0) {
            lines.push(getBonusLine(def, level, bonus, qualities));
        }
        if (stat.label === damage && factors) {
            lines.push(
                ...getRealDamageLines(stat.now, factors, sources, {
                    name: tl(def.name),
                    objId: def.iconObjId,
                }),
            );
        }
        return {
            label: stat.label,
            value: stat.value,
            english: `${stat.english} ${stat.value}`,
            breakdown: {
                title: stat.label,
                lines,
                about: weaponStatAbout(stat.key, stat.base, stat.now),
            },
        };
    });
}

export type WeaponDamageFactors = ReturnType<Sim["weaponDamageFactors"]>;

const STYLE_MIGHT = { melee: "meleeMight", ranged: "rangedMight", magic: "magicMight" } as const;

// What the damage comes to once everything is on it: the weapon's damage at its level (and its
// bonus, shown above) times each thing that multiplies it, one line each with only its total (what
// gives it is on that stat's own tooltip), then what a hit really does (a hit rolls 85% to 115% of
// it) and, if anything adds to it, what it does to a boss
// Each line wears the icons of what gives it (a passive, a worn piece, a potion, the shop...): the
// stat's sources, once each, from Sim.getStatSources
export function getRealDamageLines(
    base: number,
    factors: WeaponDamageFactors,
    sources: Partial<Record<StatKey, readonly StatSource[]>> = {},
    // The weapon itself, which gives what a boss takes on top of it (WeaponDef.bossDamage)
    weapon?: BreakdownIcon,
): BreakdownLine[] {
    const lines: BreakdownLine[] = [];
    let real = base * (1 + factors.bonus);
    const add = (label: string, scale: number, text: string, icons: BreakdownIcon[]) => {
        real *= scale;
        lines.push({ label, parts: [{ text }], ...(icons.length > 0 && { icons }) });
    };
    const key = STYLE_MIGHT[factors.style];
    if (factors.styleMight) {
        add(
            capitalise(statLabel(key)),
            1 + factors.styleMight,
            formatStatValue(key, factors.styleMight),
            iconsOf(sources[key]),
        );
    }
    if (factors.sets !== 1) {
        add(
            t("pause.real.sets"),
            factors.sets,
            `+${percent(factors.sets - 1)}`,
            uniqueIcons(
                factors.setSources.map((set) => ({ name: tl(set.name), objId: set.iconObjId })),
            ),
        );
    }
    if (factors.might) {
        add(
            capitalise(statLabel("might")),
            1 + factors.might,
            formatStatValue("might", factors.might),
            iconsOf(sources.might),
        );
    }
    if (Math.abs(factors.balance - 1) > 0.004) {
        add(
            t("pause.real.balance"),
            factors.balance,
            `×${fmtNum(Number(factors.balance.toFixed(2)))}`,
            [],
        );
    }
    const range = (value: number) =>
        t("pause.real.range", { low: Math.round(value * 0.85), high: Math.round(value * 1.15) });
    lines.push({
        label: t("pause.real.hit"),
        parts: [{ text: range(real) }],
        total: String(Math.round(real)),
    });
    const boss = (1 + factors.bossMight) * (1 + factors.bossBonus);
    if (boss !== 1) {
        const icons = uniqueIcons([
            ...iconsOf(factors.bossMight ? sources.bossMight : undefined),
            ...(factors.bossBonus && weapon ? [weapon] : []),
        ]);
        lines.push({
            label: t("pause.real.boss"),
            parts: [{ text: range(real * boss) }],
            total: String(Math.round(real * boss)),
            ...(icons.length > 0 && { icons }),
        });
    }
    return lines;
}

// A bonus's sources as icons, once each (a passive with a pick for each level is one icon), the
// ones that have one
function iconsOf(sources: readonly StatSource[] | undefined): BreakdownIcon[] {
    return uniqueIcons(
        (sources ?? []).flatMap((source) =>
            source.iconObjId !== undefined || source.iconSpriteId !== undefined
                ? [
                      {
                          name:
                              source.kind === "shop" ? t("pause.breakdown.shop") : tl(source.name),
                          objId: source.iconObjId,
                          spriteId: source.iconSpriteId,
                      },
                  ]
                : [],
        ),
    );
}

function uniqueIcons(icons: BreakdownIcon[]): BreakdownIcon[] {
    const seen = new Set<string>();
    return icons.filter((icon) => !seen.has(icon.name) && !!seen.add(icon.name));
}

// A weapon's damage bonus as written ("+57%"). An endless run's compounds into billions, which
// is written short ("+5.2B%") so it fits where it's shown.
export function formatBonusText(bonus: number): string {
    const value = bonus * 100;
    return t("weaponstat.bonus", {
        value:
            value >= 100000
                ? formatCompact(value)
                : fmtNum(Math.round(value), { useGrouping: false }),
    });
}

// A weapon's damage bonus: each pick's share of it (a rarer one's bigger), and past the last level
// the damage it multiplies by
export function getBonusLine(
    def: WeaponDef,
    level: number,
    bonus: number,
    qualities: readonly (Rarity | undefined)[],
): BreakdownLine {
    const last = def.levels.length;
    const parts: BreakdownLine["parts"] = [];
    let known = 1;
    for (let l = 1; l <= level; l++) {
        const quality = qualities[l - 1];
        if (!quality) {
            continue;
        }
        if (l > last) {
            const factor = 1 + getOverlevelDamage(quality);
            known *= factor;
            parts.push({
                label: t("pause.breakdown.level", { level: l }),
                text: `×${fmtNum(Number(factor.toFixed(2)))}`,
                color: colour(quality),
            });
        } else if (RARITIES[quality].weaponBonus > 0) {
            // Shares add up until the weapon goes past its last level
            known += RARITIES[quality].weaponBonus;
            parts.push({
                label: t("pause.breakdown.level", { level: l }),
                text: `+${percent(RARITIES[quality].weaponBonus)}`,
                color: colour(quality),
            });
        }
    }
    // Bonus carried over from what a weapon evolved from, or otherwise not recorded
    const missing = bonus - (known - 1);
    if (parts.length === 0 || (level <= last && missing > 0.004)) {
        parts.unshift({
            label: t("pause.breakdown.carried"),
            text: `+${percent(Math.max(0, level <= last ? missing : bonus))}`,
        });
    }
    return {
        label: t("pause.breakdown.bonus"),
        parts,
        total: formatBonusText(bonus),
    };
}

// When a chance to heal on a hit comes up and what it gives, for the tooltips on it (the stat,
// and the piece that has it): the chance, what it heals, and what keeps it from healing always
export function getHealChanceLines(chance: number): BreakdownLine[] {
    const seconds = BLOOD_FURY_ROLL_INTERVAL / TICKS_PER_SECOND;
    return [
        {
            label: t("pause.heal.chance"),
            parts: [{ text: t("pause.heal.per_hit", { chance: percent(chance) }) }],
        },
        {
            label: t("pause.heal.heals"),
            parts: [{ text: t("pause.heal.hitpoints", { n: BLOOD_FURY_HEAL }) }],
        },
        {
            label: t("pause.heal.limit"),
            parts: [{ text: t("pause.heal.once_a_second", { n: seconds }) }],
        },
    ];
}

// A weapon that heals on a hit (the Sanguinesti staff's): its chance on each hit, how much of the
// damage it gives back and the most it can, shown as a stat of the weapon with that in its tooltip
export function getLifestealStat(def: WeaponDef): SlotStatView | undefined {
    const lifesteal = def.lifesteal;
    if (!lifesteal) {
        return undefined;
    }
    const label = capitalise(statLabel("healChance"));
    const value = percent(lifesteal.chance);
    return {
        label,
        value,
        english: `${STAT_INFO.healChance.label} ${value}`,
        breakdown: {
            title: label,
            total: value,
            about: statAbout("healChance"),
            lines: [
                {
                    label: t("pause.heal.chance"),
                    parts: [{ text: t("pause.heal.per_hit", { chance: value }) }],
                },
                {
                    label: t("pause.heal.heals"),
                    parts: [
                        {
                            text: t("pause.heal.fraction", {
                                fraction: percent(lifesteal.fraction),
                                max: lifesteal.max,
                            }),
                        },
                    ],
                },
                {
                    label: t("pause.heal.limit"),
                    parts: [{ text: t("pause.heal.when_hurt") }],
                },
            ],
        },
    };
}

// The runes circling the hero with this many in the circle, in the order the sim hands them out
// (it goes round the weapon's list), for the icon that shows them all. Only weapons that circle.
export function getOrbitObjIds(def: WeaponDef, amount: number): number[] | undefined {
    const ids = def.orbitObjIds;
    if (!ids || ids.length === 0) {
        return undefined;
    }
    const count = Math.max(1, Math.min(8, Math.round(amount)));
    return Array.from({ length: count }, (_, i) => ids[i % ids.length]);
}

// A passive's picks, each as big as its rarity made it
export function getPassiveBreakdown(
    def: PassiveDef,
    value: number,
    qualities: readonly Rarity[],
    level: number,
): BreakdownView {
    const known = qualities.length === level && level > 0;
    return {
        title: tl(def.name),
        about: passiveAbout(def.stat),
        lines: [
            {
                parts: known
                    ? qualities.map((quality, i) => ({
                          label: t("pause.breakdown.level", { level: i + 1 }),
                          text: formatPassiveNumber(def, getPassiveGain(def, quality)),
                          color: colour(quality),
                      }))
                    : [{ text: formatPassiveNumber(def, value) }],
                total: formatPassiveNumber(def, value),
            },
        ],
    };
}

// A stat as the sum of what gives it: a line for each source, with a passive's picks in the colour
// of the rarity they were taken at and a worn piece's in its own
export function getStatBreakdown(
    key: StatKey,
    label: string,
    total: string,
    sources: readonly StatSource[] | undefined,
    // Its size, and for max hitpoints the hitpoints themselves, to say how far past the base it is
    size?: { value: number; maxHp?: number },
): BreakdownView {
    const lines: BreakdownLine[] = [];
    for (const source of sources ?? []) {
        const part = {
            text: formatStatValue(key, source.value),
            color: colour(source.quality ?? source.rarity),
        };
        // Names the sim writes in English, for what isn't an item, passive or adventurer
        const name =
            source.kind === "shop"
                ? t("pause.breakdown.shop")
                : source.kind === "level"
                  ? t("pause.breakdown.hero_level")
                  : tl(source.name);
        const same = lines.find((line) => line.label === name && source.kind === "passive");
        if (same) {
            // A passive with a pick for each level is a list: a row for each
            same.parts[0].label ??= t("pause.breakdown.level", { level: 1 });
            same.parts.push({
                ...part,
                label: t("pause.breakdown.level", { level: same.parts.length + 1 }),
            });
        } else {
            lines.push({ label: name, parts: [part] });
        }
    }
    // Hitpoints start from the hero's own
    if (key === "maxHp") {
        lines.unshift({
            label: t("pause.breakdown.base_label"),
            parts: [{ text: String(PLAYER_BASE_HP) }],
        });
    }
    // Nothing gives it: said, so the tooltip isn't just its name
    if (lines.length === 0 && key !== "healChance") {
        lines.push({ parts: [{ text: t("pause.breakdown.none") }] });
    }
    // A chance to heal says when it does as well as how often
    if (key === "healChance") {
        const chance = (sources ?? []).reduce((sum, source) => sum + source.value, 0);
        lines.push(...getHealChanceLines(chance));
    }
    return {
        title: label,
        total,
        lines,
        about: statAbout(
            key,
            size?.value,
            size?.maxHp === undefined ? undefined : size.maxHp / PLAYER_BASE_HP,
        ),
    };
}

// What a worn piece's stats are: its own, and what each endless upgrade added (half of it again)
export function getGearBreakdowns(item: GearDef, upgrades: number): BreakdownView[] {
    const shown = getGearStats(item, upgrades);
    const colorOf = RARITIES[item.rarity].color;
    const views: BreakdownView[] = [];
    for (const key of Object.keys(STAT_INFO) as StatKey[]) {
        if (!shown[key]) {
            continue;
        }
        const base = item.stats[key] ?? 0;
        const parts = [
            {
                label: t("pause.breakdown.base_label"),
                text: formatStatValue(key, base),
                color: colorOf,
            },
        ];
        if (upgrades > 0 && !CAPPED_STATS.has(key)) {
            for (let i = 0; i < upgrades; i++) {
                parts.push({
                    label: t("pause.breakdown.upgrade", { n: i + 1 }),
                    text: formatStatValue(key, base * GEAR_UPGRADE),
                    color: colorOf,
                });
            }
        }
        views.push({
            title: capitalise(statLabel(key)),
            about: { what: statAbout(key).what },
            lines: [
                { parts, total: formatStatValue(key, shown[key] as number) },
                ...(key === "healChance" ? getHealChanceLines(shown[key] as number) : []),
            ],
        });
    }
    return views;
}

function capitalise(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
