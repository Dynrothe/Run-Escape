import { weaponExamine } from "../content/examine";
import { getPassive, passiveName } from "../content/passives";
import { STAT_INFO, formatStatValue, statLabel } from "../content/stats";
import { StatKey, Stats } from "../content/types";
import { isAvailable } from "../content/unlocks";
import { getWeapon, weaponName } from "../content/weapons";
import type { Sim } from "../core/Sim";
import { CardCaps, canEvolve, cardsAllowEvolution } from "../core/Upgrades";
import type { StatSource, WeaponState } from "../core/entities";
import { t, tl } from "../i18n";
import { getStatBreakdown } from "./BreakdownViews";
import type { DamageView, FormView, RevivesView, SlotView, StatRowView } from "./GameStore";

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

// The hero's revives: what's left (the ring's and, in co-op, what teammates can still do) and the
// teammates they've revived. None left is the last stand.
export function getRevivesView(sim: Sim): RevivesView {
    const hero = sim.heroes[sim.focus];
    const coop = sim.heroes.length > 1;
    return {
        left: Math.max(0, hero.revivesLeft) + (coop ? sim.revivesLeftFor(hero) : 0),
        given: hero.revivesGiven,
        coop,
    };
}

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
                ...(sources && {
                    breakdown: getStatBreakdown(key, label, text, sources[key], {
                        value,
                        maxHp: key === "maxHp" ? maxHp : undefined,
                    }),
                }),
            });
        }
    }
    return rows;
}

// Where a weapon stands, for the end of its tooltip: ready to evolve, able to once it has the
// passive (and its last level), not known how to evolve yet (what it evolves into isn't unlocked),
// at its best (it's at its last level and has nothing to evolve into; in an endless run it keeps
// growing past it), or still to level up. A Card collection only run without the cards for its
// evolution treats it as having none.
export function getWeaponForm(
    weapon: WeaponState,
    ownedPassives: ReadonlySet<string>,
    unlocked: ReadonlySet<string> | undefined,
    endless: boolean,
    cards?: CardCaps,
): FormView {
    const evolution = weapon.def.evolution;
    if (
        evolution &&
        cardsAllowEvolution(cards, weapon.def.id, evolution.requiresPassive, evolution.into)
    ) {
        const into = getWeapon(evolution.into);
        if (!isAvailable(into, unlocked)) {
            return { kind: "unknown", text: t("pause.form.unknown") };
        }
        const name = tl(weaponName(into));
        return canEvolve(weapon, ownedPassives, unlocked, cards)
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

// How far a weapon has got towards its evolution, for the HUD, the pause menu's Loadout and the
// Combat tab's tooltips. Nothing when it has none, the player doesn't know it yet, or a Card
// collection only run hasn't the cards for it.
export function getEvolutionView(sim: Sim, weapon: WeaponState): SlotView["evolution"] {
    const evolution = weapon.def.evolution;
    if (
        !evolution ||
        !isAvailable(getWeapon(evolution.into), sim.unlockedItems) ||
        // A Card collection only run without the cards it takes: it won't come
        !cardsAllowEvolution(sim.cardCaps, weapon.def.id, evolution.requiresPassive, evolution.into)
    ) {
        return undefined;
    }
    const owned = new Set(sim.passives.map((p) => p.id));
    const passive = getPassive(evolution.requiresPassive);
    const into = getWeapon(evolution.into);
    const top = into.levels[into.levels.length - 1];
    return {
        passive: passive.name,
        passiveIconObjId: passive.iconObjId,
        passiveIconSpriteId: passive.iconSpriteId,
        into: top.name ?? into.name,
        intoIconObjId: top.objId ?? into.iconObjId,
        maxed: weapon.level >= weapon.def.levels.length,
        hasPassive: owned.has(evolution.requiresPassive),
        ready: canEvolve(weapon, owned, sim.unlockedItems, sim.cardCaps),
    };
}

// What the mouse over a weapon's row on the Combat tab says, as its square on the Loadout does: what
// it is and how it fights, where it stands, and the recipe of what it evolves into (when the player
// knows it). A weapon the hero no longer has (evolved away) says what it became.
export function getWeaponAbout(sim: Sim, weaponId: string): DamageView["about"] {
    const def = getWeapon(weaponId);
    const owned = sim.weapons.find((w) => w.def.id === weaponId);
    if (!owned) {
        const became = sim.weapons.find((w) => w.def.id === def.evolution?.into);
        return {
            examine: weaponExamine(def),
            ...(def.evolved && { evolved: true }),
            ...(became && {
                form: {
                    kind: "best",
                    text: t("pause.form.evolved_into", { into: tl(weaponName(became.def)) }),
                },
            }),
        };
    }
    return {
        examine: weaponExamine(def),
        ...(def.evolved && { evolved: true }),
        form: getWeaponForm(
            owned,
            new Set(sim.passives.map((p) => p.id)),
            sim.unlockedItems,
            sim.endless,
            sim.cardCaps,
        ),
        level: owned.level,
        maxLevel: def.levels.length,
        evolution: getEvolutionView(sim, owned),
    };
}
