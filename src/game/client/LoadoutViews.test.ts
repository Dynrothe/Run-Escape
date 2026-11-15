import { expect, test } from "vitest";

import { tierCardId, weaponTiers } from "../content/cards";
import { STAT_INFO } from "../content/stats";
import { StatKey, WeaponDef, emptyStats } from "../content/types";
import { WEAPONS, getWeapon } from "../content/weapons";
import type { WeaponState } from "../core/entities";
import { getLevellingForm, getStatRows, getWeaponForm } from "./LoadoutViews";

test("every stat is in a group, once", () => {
    const keys = Object.keys(STAT_INFO) as StatKey[];
    const stats = emptyStats();
    for (const key of keys) {
        stats[key] = 1;
    }
    const rows = getStatRows(stats, 30);
    expect(rows.map((row) => row.key).sort()).toEqual([...keys].sort());
});

test("the stats that always show do so at zero, dim, and the rest wait until something gives them", () => {
    const rows = getStatRows(emptyStats(), 25);
    const damage = rows.find((row) => row.key === "might");
    expect(damage).toMatchObject({ value: "0%", zero: true, group: "offense" });
    expect(rows.find((row) => row.key === "armor")).toMatchObject({ value: "0", zero: true });
    expect(rows.find((row) => row.key === "luck")).toBeDefined();
    expect(rows.find((row) => row.key === "thorns")).toBeUndefined();
    expect(rows.find((row) => row.key === "reroll")).toBeUndefined();
});

test("a stat that's something shows its size with its sign", () => {
    const rows = getStatRows({ ...emptyStats(), cooldown: 0.69, thorns: 2, armor: -1 }, 25);
    expect(rows.find((row) => row.key === "cooldown")).toMatchObject({
        value: "+69%",
        label: "Weapon speed",
        zero: false,
    });
    expect(rows.find((row) => row.key === "thorns")).toMatchObject({ value: "+2" });
    expect(rows.find((row) => row.key === "armor")?.value).toBe("-1");
});

test("max hitpoints show the hitpoints, with what's added to them", () => {
    const plain = getStatRows(emptyStats(), 25.4).find((row) => row.key === "maxHp");
    expect(plain).toMatchObject({ value: "25", zero: false });
    const more = getStatRows({ ...emptyStats(), maxHp: 0.2 }, 30).find(
        (row) => row.key === "maxHp",
    );
    expect(more?.value).toBe("30 (+20%)");
});

// Where a weapon stands, at each point of its life
const EVOLVER = WEAPONS.find((w) => w.evolution && getWeapon(w.evolution.into).unlock)!;
const NO_EVOLUTION = WEAPONS.find((w) => !w.evolution && w.levels.length > 3)!;

function state(def: WeaponDef, level: number): WeaponState {
    return { def, level, cooldown: 0, bonus: 0, uses: 0 };
}

test("a weapon whose evolution isn't unlocked says you don't know how to evolve it yet", () => {
    const form = getWeaponForm(state(EVOLVER, 3), new Set(), new Set(), false);
    expect(form).toEqual({ kind: "unknown", text: "You don't yet know how to evolve this item." });
});

test("a weapon that can evolve says into what and with which passive, and when it's ready", () => {
    const into = EVOLVER.evolution!.into;
    const unlocked = new Set([into]);
    const wait = getWeaponForm(state(EVOLVER, 3), new Set(), unlocked, false);
    expect(wait.kind).toBe("evolve");
    expect(wait.text).toContain("Can evolve into");
    // Its last level but not the passive, and the passive but not its last level: not yet
    const last = EVOLVER.levels.length;
    const needs = new Set([EVOLVER.evolution!.requiresPassive]);
    expect(getWeaponForm(state(EVOLVER, last), new Set(), unlocked, false).kind).toBe("evolve");
    expect(getWeaponForm(state(EVOLVER, 3), needs, unlocked, false).kind).toBe("evolve");
    const ready = getWeaponForm(state(EVOLVER, last), needs, unlocked, false);
    expect(ready.kind).toBe("ready");
    expect(ready.text).toMatch(/^Ready to evolve into .+!$/);
});

test("a Card collection only run without the cards for an evolution treats the weapon as having none", () => {
    const evolution = EVOLVER.evolution!;
    const unlocked = new Set([evolution.into]);
    const needs = new Set([evolution.requiresPassive]);
    const last = EVOLVER.levels.length;
    // A weapon whose levels are metals evolves only with its top metal's card too
    const tiers = weaponTiers(EVOLVER).length;
    const all = new Map<string, "common">([
        [`weapon:${EVOLVER.id}`, "common"],
        ...(tiers > 0 ? [[tierCardId(EVOLVER.id, tiers - 1), "common"] as const] : []),
        [`passive:${evolution.requiresPassive}`, "common"],
        [`weapon:${evolution.into}`, "common"],
    ]);
    expect(getWeaponForm(state(EVOLVER, last), needs, unlocked, false, all).kind).toBe("ready");
    const noInto = new Map([...all].filter(([key]) => key !== `weapon:${evolution.into}`));
    expect(getWeaponForm(state(EVOLVER, last), needs, unlocked, false, noInto).kind).toBe("best");
});

test("one with nothing to evolve into is at its best at its last level, and levelling before", () => {
    const last = NO_EVOLUTION.levels.length;
    expect(getWeaponForm(state(NO_EVOLUTION, last), new Set(), undefined, false)).toEqual({
        kind: "best",
        text: "At its best form.",
    });
    expect(getWeaponForm(state(NO_EVOLUTION, last), new Set(), undefined, true).text).toBe(
        "At its best form, and still growing in endless.",
    );
    expect(getWeaponForm(state(NO_EVOLUTION, 2), new Set(), undefined, false)).toEqual({
        kind: "levelling",
        text: `Still levelling up: 2 of ${last}.`,
    });
});

test("a passive is at its best at its last level", () => {
    expect(getLevellingForm(5, 5, false).kind).toBe("best");
    expect(getLevellingForm(2, 5, false).text).toBe("Still levelling up: 2 of 5.");
});
