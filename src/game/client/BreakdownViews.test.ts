import { GEAR } from "../content/items";
import { getPassive } from "../content/passives";
import { RARITIES } from "../content/rarity";
import { emptyStats } from "../content/types";
import { weaponStatSteps } from "../content/weaponStats";
import { WEAPONS, getWeapon } from "../content/weapons";
import { Sim, SimOptions } from "../core/Sim";
import { makeGrid } from "../core/world/testGrid";
import {
    getBonusLine,
    getGearBreakdowns,
    getHealChanceLines,
    getLifestealStat,
    getOrbitObjIds,
    getPassiveBreakdown,
    getRealDamageLines,
    getStatBreakdown,
    getWeaponStatLines,
} from "./BreakdownViews";
import { getStatRows } from "./LoadoutViews";

function createSim(options: Partial<SimOptions> = {}): Sim {
    const rows = Array.from({ length: 72 }, (_, y) =>
        Array.from({ length: 72 }, (_, x) =>
            x === 0 || y === 0 || x === 71 || y === 71 ? "#" : ".",
        ).join(""),
    );
    return new Sim({
        grid: makeGrid(rows, 1000, 1000),
        mapId: "lumbridge",
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 1,
        spawnX: 1036.5,
        spawnY: 1036.5,
        endless: false,
        ...options,
    });
}

const WEAPON_ID = "throwing_knives";

test("a weapon's stat steps start at level 1 and add what each level changed", () => {
    const def = getWeapon(WEAPON_ID);
    const steps = weaponStatSteps(def, 3);
    const damage = steps.find((stat) => stat.label === "Damage")!;
    expect(damage.steps[0]).toEqual({ level: 1, text: String(def.levels[0].damage) });
    // The levels that changed it, each a signed change on the level it came with
    for (const step of damage.steps.slice(1)) {
        expect(step.text.startsWith("+")).toBe(true);
        expect(step.level).toBeGreaterThan(1);
        expect(step.level).toBeLessThanOrEqual(3);
    }
    // The same stats as the plain list shows
    expect(steps.every((stat) => stat.value.length > 0)).toBe(true);
});

test("every weapon's steps add up to its stat at the level", () => {
    for (const def of WEAPONS) {
        const top = def.levels.length;
        const damage = weaponStatSteps(def, top).find((stat) => stat.label === "Damage");
        if (!damage) {
            continue;
        }
        const sum =
            Number(damage.steps[0].text) +
            damage.steps.slice(1).reduce((total, step) => total + Number(step.text), 0);
        // Steps are written rounded to a tenth, so they can be a little off
        expect(Math.abs(sum - Number(damage.value))).toBeLessThan(0.1 * top);
    }
});

test("picks are recorded by quality: a new weapon, its levels, and a passive's picks", () => {
    const sim = createSim();
    sim.apply({ kind: "newWeapon", weaponId: WEAPON_ID, quality: "uncommon" });
    sim.apply({ kind: "weaponLevel", weaponId: WEAPON_ID, level: 2, quality: "rare" });
    sim.apply({ kind: "weaponLevel", weaponId: WEAPON_ID, level: 3, quality: "common" });
    expect(sim.upgradeQualities.weapons[WEAPON_ID]).toEqual(["uncommon", "rare", "common"]);
    const weapon = sim.weapons.find((w) => w.def.id === WEAPON_ID)!;
    expect(weapon.bonus).toBeCloseTo(
        RARITIES.uncommon.weaponBonus + RARITIES.rare.weaponBonus + RARITIES.common.weaponBonus,
    );

    const passive = getPassive("tome_of_fire");
    sim.apply({ kind: "newPassive", passiveId: passive.id, quality: "common" });
    sim.apply({
        kind: "passiveLevel",
        passiveId: passive.id,
        level: 2,
        quality: "veryRare",
        currentValue: 0,
    });
    expect(sim.upgradeQualities.passives[passive.id]).toEqual(["common", "veryRare"]);
});

test("a weapon's damage tooltip lists its steps in the colours of the picks, and its bonus", () => {
    const sim = createSim();
    sim.apply({ kind: "newWeapon", weaponId: WEAPON_ID, quality: "common" });
    sim.apply({ kind: "weaponLevel", weaponId: WEAPON_ID, level: 2, quality: "rare" });
    const weapon = sim.weapons.find((w) => w.def.id === WEAPON_ID)!;
    const lines = getWeaponStatLines(
        weapon.def,
        weapon.level,
        weapon.bonus,
        sim.upgradeQualities.weapons[WEAPON_ID],
    );
    const damage = lines.find((line) => line.label === "Damage")!;
    const parts = damage.breakdown!.lines[0].parts;
    // The start is the first row, then a row for each level that changed it
    expect(parts[0].label).toBe("Base");
    expect(parts[0].text).toBe(String(weapon.def.levels[0].damage));
    expect(parts[0].color).toBe(RARITIES.common.color);
    // Whichever stat level 2 changed has that level's step, in the colour of the rare pick
    const changed = lines.find((line) => line.breakdown!.lines[0].parts.length > 1)!;
    expect(changed.breakdown!.lines[0].parts[1].color).toBe(RARITIES.rare.color);
    expect(changed.breakdown!.lines[0].parts[1].label).toBe("Level 2");
    expect(damage.breakdown!.lines[0].total).toBe(damage.value);
    const bonus = damage.breakdown!.lines[1];
    expect(bonus.label).toBe("Bonus");
    expect(bonus.parts).toEqual([{ label: "Level 2", text: "+15%", color: RARITIES.rare.color }]);
    expect(bonus.total).toBe("+15%");
});

test("a passive's tooltip has a number for each pick, in its rarity's colour", () => {
    const def = getPassive("tome_of_fire");
    const view = getPassiveBreakdown(def, 0.2, ["common", "rare"], 2);
    expect(view.lines[0].parts).toHaveLength(2);
    expect(view.lines[0].parts[0].color).toBe(RARITIES.common.color);
    expect(view.lines[0].parts[1].color).toBe(RARITIES.rare.color);
    // With picks that weren't recorded it's the one number
    const lump = getPassiveBreakdown(def, 0.2, [], 2);
    expect(lump.lines[0].parts).toHaveLength(1);
});

test("a stat's sources add up to its size: the adventurer, the shop, passives and gear", () => {
    const sim = createSim();
    const passive = getPassive("tome_of_fire");
    sim.apply({ kind: "newPassive", passiveId: passive.id, quality: "rare" });
    sim.apply({
        kind: "passiveLevel",
        passiveId: passive.id,
        level: 2,
        quality: "common",
        currentValue: 0,
    });
    const gear = GEAR.find((g) => g.stats.might && g.stats.might > 0)!;
    sim.equip(gear.id);
    const sources = sim.getStatSources();
    for (const [key, list] of Object.entries(sources)) {
        const total = list!
            .filter((source) => !source.multiplier)
            .reduce((sum, source) => sum + source.value, 0);
        expect(total).toBeCloseTo(sim.stats[key as keyof typeof sim.stats], 6);
    }
    // The passive's two picks are one line with two numbers
    const rows = getStatRows(sim.stats, sim.player.maxHp, sources);
    const row = rows.find((r) => r.key === passive.stat)!;
    const line = row.breakdown!.lines.find((l) => l.label === passive.name)!;
    expect(line.parts).toHaveLength(2);
    expect(line.parts[0].color).toBe(RARITIES.rare.color);
    expect(line.parts[1].color).toBe(RARITIES.common.color);
    // A source of the hero's has the sum's head
    expect(getStatBreakdown("might", "Damage", "+1%", []).total).toBe("+1%");
});

test("stat sources include relics and multiplicative invocation hitpoints", () => {
    const sim = createSim({
        mapId: "desert",
        relics: ["fairys_flight"],
        invocations: ["run_glass_cannon"],
    });
    const sources = sim.getStatSources();
    expect(sources.moveSpeed).toContainEqual(
        expect.objectContaining({ kind: "relic", name: "Fairy's Flight", value: 0.1 }),
    );
    const glass = sources.maxHp?.find((source) => source.kind === "invocation");
    expect(glass).toMatchObject({ name: "Glass Cannon", value: -0.5, multiplier: true });
    const breakdown = getStatBreakdown("maxHp", "Max hitpoints", String(sim.player.maxHp), [
        glass!,
    ]);
    expect(breakdown.lines.some((line) => line.parts.some((part) => part.text === "×0.5"))).toBe(
        true,
    );
});

test("worn gear's lines come with a make-up each: its own size, and an upgrade's half again", () => {
    const gear = GEAR.find((g) => g.stats.might && g.stats.might > 0)!;
    const plain = getGearBreakdowns(gear, 0);
    expect(plain.length).toBeGreaterThan(0);
    expect(plain[0].lines[0].parts).toHaveLength(1);
    const upgraded = getGearBreakdowns(gear, 2);
    const might = upgraded.find((view) => view.title === "Damage")!;
    // Base, and two upgrades of half of it
    expect(might.lines[0].parts).toHaveLength(3);
    expect(might.lines[0].parts[0].color).toBe(RARITIES[gear.rarity].color);
});

test("runes circling the hero: as many as are in the circle, going round the weapon's list", () => {
    const def = getWeapon("elemental_runes");
    const ids = getOrbitObjIds(def, 5)!;
    expect(ids).toHaveLength(5);
    expect(ids.slice(0, 3)).toEqual(def.orbitObjIds!.slice(0, 3));
    expect(getOrbitObjIds(getWeapon(WEAPON_ID), 3)).toBeUndefined();
    // Past the list it starts again, and the icon takes no more than eight
    expect(getOrbitObjIds(getWeapon("astral_runes"), 9)).toHaveLength(8);
    expect(getOrbitObjIds(getWeapon("astral_runes"), 4)![3]).toBe(
        getWeapon("astral_runes").orbitObjIds![0],
    );
});

test("a heal chance says when it comes up, what it heals and what limits it", () => {
    const lines = getHealChanceLines(0.2);
    const text = lines.map((line) => line.label + " " + line.parts.map((p) => p.text).join(" "));
    expect(text).toEqual([
        "Chance 20% on each hit",
        "Heals 2 hitpoints",
        "Only once a second, when hurt",
    ]);
    // The same in the amulet's tooltip, and the stat's
    const amulet = GEAR.find((g) => g.stats.healChance)!;
    const view = getGearBreakdowns(amulet, 0).find((v) => v.title.startsWith("Chance to heal"))!;
    expect(view.lines.slice(1)).toEqual(lines);
    const stat = getStatBreakdown("healChance", "Chance to heal on hit", "+20%", [
        { kind: "gear", name: amulet.name, value: 0.2 },
    ]);
    expect(stat.lines.slice(-3)).toEqual(lines);
});

test("a weapon that steals life says how often, how much of what it dealt, and the most", () => {
    const def = WEAPONS.find((w) => w.lifesteal)!;
    const stat = getLifestealStat(def)!;
    expect(stat.label).toBe("Chance to heal on hit");
    expect(stat.value).toBe(`${Math.round(def.lifesteal!.chance * 100)}%`);
    const text = stat.breakdown!.lines.map((line) => line.parts.map((p) => p.text).join(" "));
    expect(text[1]).toContain(`${Math.round(def.lifesteal!.fraction * 100)}% of the damage dealt`);
    expect(text[1]).toContain(`up to ${def.lifesteal!.max}`);
    expect(getLifestealStat(getWeapon(WEAPON_ID))).toBeUndefined();
});

test("max hitpoints start from the hero's own, and a stat with no source says so", () => {
    const hp = getStatBreakdown("maxHp", "Max hitpoints", "25", []);
    expect(hp.lines[0]).toEqual({ label: "Base", parts: [{ text: "25" }] });
    const none = getStatBreakdown("growth", "Experience", "0%", []);
    expect(none.lines).toEqual([{ parts: [{ text: "Nothing adds to this yet" }] }]);
});

test("every level up of an endless run is its own entry: none are joined up", () => {
    const def = getWeapon(WEAPON_ID);
    const last = def.levels.length;
    const qualities: ("common" | "rare")[] = [];
    for (let l = 1; l <= last + 40; l++) {
        qualities.push(l % 2 ? "common" : "rare");
    }
    const line = getBonusLine(def, last + 40, 5, qualities);
    // The picks past the last level each multiply the damage: forty of them, forty rows, in order
    const past = line.parts.filter((part) => part.text.startsWith("×"));
    expect(past).toHaveLength(40);
    expect(past[0].label).toBe(`Level ${last + 1}`);
    expect(past[39].label).toBe(`Level ${last + 40}`);
    // A passive's forty picks the same
    const view = getPassiveBreakdown(getPassive("tome_of_fire"), 1, Array(40).fill("common"), 40);
    expect(view.lines[0].parts).toHaveLength(40);
    expect(view.lines[0].parts[39].label).toBe("Level 40");
});

test("a weapon's stat lines keep their English, so their icons show in any language", () => {
    const def = getWeapon(WEAPON_ID);
    const lines = getWeaponStatLines(def, 1, 0, []);
    const damage = lines.find((line) => line.label === "Damage")!;
    expect(damage.english).toBe(`Damage ${damage.value}`);
    expect(lines.every((line) => line.english?.endsWith(line.value))).toBe(true);
});

test("a weapon's real damage: each thing on top of its damage as one line with its total, then the hit", () => {
    const lines = getRealDamageLines(10, {
        balance: 1,
        bonus: 0.12,
        style: "magic",
        styleMight: 0.34,
        sets: 1,
        setSources: [],
        might: 0.1,
        bossMight: 0.2,
        bossBonus: 0,
    });
    expect(lines.map((line) => [line.label, line.parts[0].text, line.total])).toEqual([
        ["Magic damage", "+34%", undefined],
        ["Damage", "+10%", undefined],
        // 10 x 1.12 x 1.34 x 1.1, and a hit rolls 85% to 115% of it
        ["Each hit", "14–19", "17"],
        ["Against bosses", "17–23", "20"],
    ]);
});

test("a weapon with nothing on top of its damage says only what a hit does", () => {
    const lines = getRealDamageLines(10, {
        balance: 1,
        bonus: 0,
        style: "melee",
        styleMight: 0,
        sets: 1,
        setSources: [],
        might: 0,
        bossMight: 0,
        bossBonus: 0,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].total).toBe("10");
});

test("the sim hands over what multiplies a weapon, and a hit is what the factors say", () => {
    const sim = createSim();
    sim.apply({ kind: "newWeapon", weaponId: WEAPON_ID, quality: "common" });
    const weapon = sim.weapons.find((w) => w.def.id === WEAPON_ID)!;
    sim.stats.might = 0.25;
    const factors = sim.weaponDamageFactors(weapon);
    expect(factors.might).toBe(0.25);
    expect(factors.bonus).toBe(weapon.bonus);
    expect(factors.sets).toBe(1);
});

test("each bonus on a weapon's damage wears the icons of what gives it, once each", () => {
    const lines = getRealDamageLines(
        10,
        {
            balance: 1,
            bonus: 0,
            style: "magic",
            styleMight: 0.34,
            sets: 1.1,
            setSources: [{ name: "Ahrim's", iconObjId: 4708 }],
            might: 0.1,
            bossMight: 0.2,
            bossBonus: 0.1,
        },
        {
            magicMight: [
                { kind: "passive", name: "Augury", value: 0.2, iconSpriteId: 99 },
                { kind: "passive", name: "Augury", value: 0.14, iconSpriteId: 99 },
                { kind: "buff", name: "Magic potion", value: 0.1, iconObjId: 3040 },
                { kind: "adventurer", name: "Wizard", value: 0.05 },
            ],
            might: [{ kind: "shop", name: "Shop upgrades", value: 0.1, iconObjId: 995 }],
            bossMight: [{ kind: "gear", name: "Slayer helmet", value: 0.2, iconObjId: 11864 }],
        },
        { name: "Fire Strike", objId: 1 },
    );
    const icons = (label: string) =>
        lines.find((line) => line.label === label)?.icons?.map((icon) => icon.name);
    // A passive with a pick for each level is one icon, and a source with no icon has none
    expect(icons("Magic damage")).toEqual(["Augury", "Magic potion"]);
    expect(icons("Set bonus")).toEqual(["Ahrim's"]);
    expect(icons("Damage")).toEqual(["Shop upgrades"]);
    expect(icons("Against bosses")).toEqual(["Slayer helmet", "Fire Strike"]);
    expect(icons("Each hit")).toBeUndefined();
});
