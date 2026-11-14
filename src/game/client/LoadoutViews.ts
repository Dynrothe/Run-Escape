import { getPassive, passiveName } from "../content/passives";
import { STAT_INFO, formatStatValue, statLabel } from "../content/stats";
import { StatKey, Stats } from "../content/types";
import { isAvailable } from "../content/unlocks";
import { getWeapon, weaponName } from "../content/weapons";
import { canEvolve } from "../core/Upgrades";
import type { StatSource, WeaponState } from "../core/entities";
import { t, tl } from "../i18n";
import { getStatBreakdown } from "./BreakdownViews";
import type { FormView, StatRowView } from "./GameStore";

// The pause menu's Loadout lists a hero's stats in three groups. Each stat is in one, and the
// first few of each are always shown (even at zero, so a player can see what they've none of);
// the rest only once something gives them.
const STAT_GROUPS: {
    group: StatRowView["group"];
    always: StatKey[];
    sometimes: StatKey[];
}[] = [
    {
        group: "offense",
        always: ["might", "cooldown", "area", "amount"],
        sometimes: [
            "meleeMight",
            "rangedMight",
            "magicMight",
            "bossMight",
            "levelMight",
            "auraArea",
            "speed",
            "meleeSpeed",
            "duration",
            "meleeKnockback",
            "thorns",
        ],
    },
    {
        group: "defense",
        always: ["maxHp", "armor", "regen"],
        sometimes: ["healChance", "revival"],
    },
    {
        group: "utility",
        always: ["moveSpeed", "magnet", "growth", "greed", "luck"],
        sometimes: ["powerUpRate", "reroll", "banish", "weaponSlots", "passiveSlots"],
    },
];

function capitalise(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatZero(key: StatKey): string {
    return STAT_INFO[key].unit === "percent" ? "0%" : "0";
}

// The hero's stats as rows, grouped: what each is called, its size now, and whether it's nothing.
// Max hitpoints show the hitpoints themselves, with what's added to them in brackets.
export function getStatRows(
    stats: Partial<Stats>,
    maxHp: number,
    sources?: Partial<Record<StatKey, StatSource[]>>,
): StatRowView[] {
    const rows: StatRowView[] = [];
    for (const { group, always, sometimes } of STAT_GROUPS) {
        for (const key of [...always, ...sometimes]) {
            const value = stats[key] ?? 0;
            if (!value && !always.includes(key)) {
                continue;
            }
            let text = value ? formatStatValue(key, value) : formatZero(key);
            if (key === "maxHp") {
                text = value ? `${Math.round(maxHp)} (${text})` : `${Math.round(maxHp)}`;
            }
            const label = capitalise(statLabel(key));
            rows.push({
                key,
                group,
                label,
                value: text,
                zero: !value && key !== "maxHp",
                ...(sources && { breakdown: getStatBreakdown(key, label, text, sources[key]) }),
            });
        }
    }
    return rows;
}

// Where a weapon stands, for the end of its tooltip: ready to evolve, able to once it has the
// passive (and its last level), not known how to evolve yet (what it evolves into isn't unlocked),
// at its best (it's at its last level and has nothing to evolve into; in an endless run it keeps
// growing past it), or still to level up
export function getWeaponForm(
    weapon: WeaponState,
    ownedPassives: ReadonlySet<string>,
    unlocked: ReadonlySet<string> | undefined,
    endless: boolean,
): FormView {
    const evolution = weapon.def.evolution;
    if (evolution) {
        const into = getWeapon(evolution.into);
        if (!isAvailable(into, unlocked)) {
            return { kind: "unknown", text: t("pause.form.unknown") };
        }
        const name = tl(weaponName(into));
        return canEvolve(weapon, ownedPassives, unlocked)
            ? { kind: "ready", text: t("pause.form.ready", { into: name }) }
            : {
                  kind: "evolve",
                  text: t("pause.form.evolve", {
                      into: name,
                      passive: tl(passiveName(getPassive(evolution.requiresPassive))),
                  }),
              };
    }
    return getLevellingForm(weapon.level, weapon.def.levels.length, endless);
}

// A passive has no evolution: it's at its best at its last level
export function getLevellingForm(level: number, maxLevel: number, endless: boolean): FormView {
    return level >= maxLevel
        ? { kind: "best", text: t(endless ? "pause.form.best_endless" : "pause.form.best") }
        : { kind: "levelling", text: t("pause.form.levelling", { level, max: maxLevel }) };
}
