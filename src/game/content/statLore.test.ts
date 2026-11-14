import { LORE_MESSAGES, bonusAbout, passiveAbout, statAbout, weaponStatAbout } from "./statLore";
import { STAT_INFO } from "./stats";
import { StatKey } from "./types";
import { WEAPON_STAT_MESSAGES } from "./weaponStats";

test("every stat says what it means, and where more of it comes from if anything gives it", () => {
    for (const key of Object.keys(STAT_INFO) as StatKey[]) {
        const about = statAbout(key);
        expect(about.what.length, key).toBeGreaterThan(10);
        expect(about.calc, key).toBeTruthy();
        expect(LORE_MESSAGES[`lore.stat.${key}.what`], key).toBe(about.what);
    }
    expect(statAbout("might").from).toContain("worn gear");
    expect(statAbout("might").from).toContain("passives (");
});

test("how far past the base a stat is, in a multiple of it and a word", () => {
    expect(statAbout("might", 0).power).toContain("Right at the base");
    expect(statAbout("might", 0.5).power).toBe("1.5× the base: properly above base.");
    expect(statAbout("might", 2).power).toContain("absurdly strong");
    expect(statAbout("might", -0.2).power).toContain("weaker than the base");
    // Hitpoints go by the hitpoints themselves, a chance or a count by what it is
    expect(statAbout("maxHp", 0.24, 31 / 25).power).toBe("1.24× the base: a pinch of spice.");
    expect(statAbout("armor", 3).power).toBe("A fresh hero has none. You have 3.");
    expect(statAbout("healChance", 0.1).power).toBeUndefined();
});

test("a weapon's stat says what it is, and how it's grown from its level 1 size", () => {
    // Every stat label (not the sentences and values beside them) has its words
    const sentences = /^weaponstat.(bonus|change|line|value..*)$/;
    for (const key of Object.keys(WEAPON_STAT_MESSAGES).filter((k) => !sentences.test(k))) {
        expect(weaponStatAbout(key)?.what, key).toBeTruthy();
    }
    expect(weaponStatAbout("weaponstat.damage", 10, 16)?.power).toBe(
        "1.6× its level 1 size: properly above base.",
    );
    expect(weaponStatAbout("weaponstat.damage", 10, 10)?.power).toBe("Still at its level 1 size.");
    expect(weaponStatAbout("weaponstat.nope")).toBeUndefined();
});

test("the damage bonus and a passive have their lines", () => {
    expect(bonusAbout().what).toContain("rarer pick");
    expect(passiveAbout("might").calc).toContain("adds again");
});
