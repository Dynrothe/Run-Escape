import { describeItem } from "../core/Loot";
import { describeChoice } from "../core/Upgrades";
import { LANGS, setLang, tr } from "../i18n";
import { getMessages } from "../i18n/catalog";
import { ITEMS } from "./items";
import { PASSIVES, formatPassiveValue, passiveValueText } from "./passives";
import { RAID_SUPPLIES } from "./raids";
import { SETS, describeSetProgress } from "./sets";
import { StatIconRef, statIconFor, statKeyIcon } from "./statIcons";
import { STAT_INFO, StatText, formatStat, formatStats } from "./stats";
import { StatKey } from "./types";
import {
    formatWeaponStat,
    weaponBonusText,
    weaponStatChanges,
    weaponStatText,
    weaponStats,
} from "./weaponStats";
import { WEAPONS } from "./weapons";

function expectOneIcon(text: string, icon: StatIconRef | undefined) {
    expect(icon, text).toBeDefined();
    expect(Number(icon?.objId !== undefined) + Number(icon?.spriteId !== undefined), text).toBe(1);
}

describe("stat icons", () => {
    test("every stat label resolves, positive or negative", () => {
        for (const key of Object.keys(STAT_INFO) as StatKey[]) {
            for (const value of [0.1, 2, -1]) {
                const text = formatStat(key, value);
                expectOneIcon(text, statIconFor(text));
            }
        }
    });

    test("every stat line of every weapon resolves", () => {
        for (const def of WEAPONS) {
            for (let i = 0; i < def.levels.length; i++) {
                const level = def.levels[i];
                const lines = weaponStats(def, level).map(formatWeaponStat);
                if (i > 0) {
                    lines.push(
                        ...weaponStatChanges(def, def.levels[i - 1], level).map(formatWeaponStat),
                    );
                }
                for (const text of lines) {
                    expectOneIcon(`${def.id}: ${text}`, statIconFor(text));
                }
            }
        }
    });

    test("passive details and weapon bonuses resolve", () => {
        for (const passive of PASSIVES) {
            const text = formatPassiveValue(passive, passive.perLevel);
            expectOneIcon(text, statIconFor(text));
        }
        const bonus = weaponBonusText(0.15);
        expectOneIcon(bonus.text, statIconFor(bonus.text, bonus.english));
    });

    // Descriptions are written by hand: one that leads with a stat's number gets its icon
    test("item and raid supply descriptions that lead with a stat resolve", () => {
        const lines: [string, string][] = [
            ...ITEMS.flatMap((item) =>
                describeItem(item).map((line): [string, string] => [item.id, line.text]),
            ),
            ...RAID_SUPPLIES.map((supply): [string, string] => [supply.id, supply.description]),
        ];
        for (const [id, line] of lines) {
            if (/^[+\-−]?\d/.test(line)) {
                expectOneIcon(`${id}: ${line}`, statIconFor(line));
            }
        }
        expect(statIconFor("+1 projectile and +20% projectile speed")).toEqual(
            statIconFor("+2 projectiles"),
        );
        expect(statIconFor("+20% projectile speed")).not.toEqual(statIconFor("+2 projectiles"));
    });

    test("the most specific label wins", () => {
        expect(statIconFor("+24% ranged damage")).toEqual(statIconFor("Ranged damage"));
        expect(statIconFor("+24% ranged damage")).not.toEqual(statIconFor("+24% damage"));
        expect(statIconFor("+10% damage to bosses")).not.toEqual(statIconFor("+10% damage"));
        expect(statIconFor("+34% luck")).toEqual({ objId: 28181 });
        expect(statIconFor("+5% coins")).toEqual({ objId: 995, count: 100 });
    });

    test("a stat's key gives its icon, whatever the wording around it", () => {
        for (const key of Object.keys(STAT_INFO) as StatKey[]) {
            expectOneIcon(key, statKeyIcon(key));
        }
        expect(statKeyIcon("armor")).toEqual(statIconFor("+1 armour"));
    });

    test("anything else has no icon", () => {
        expect(statIconFor("")).toBeUndefined();
        expect(statIconFor("Rune scimitar")).toBeUndefined();
        expect(statIconFor("+5% luckiness")).toBeUndefined();
        // An accent written as its own character still makes a longer word
        expect(statIconFor("+5% lucḱ")).toBeUndefined();
        expect(statIconFor("12")).toBeUndefined();
    });

    // A line the game builds carries its English, which must say what its text says
    test("a built line's English gives the icon its English text has", () => {
        for (const line of everyLine()) {
            expect(statIconFor(line.text, line.english), line.text).toEqual(statIconFor(line.text));
        }
    });
});

// Every line the screens show, in the active language: the ones the game builds, with the
// English they bring, and the ones the language files translate
function everyLine(): StatText[] {
    const lines: StatText[] = [];
    for (const key of Object.keys(STAT_INFO) as StatKey[]) {
        for (const value of [0.1, 2, -1, 0.5]) {
            lines.push(...formatStats({ [key]: value }));
        }
    }
    for (const def of WEAPONS) {
        for (let i = 0; i < def.levels.length; i++) {
            const level = def.levels[i];
            lines.push(...weaponStats(def, level).map(weaponStatText));
            if (i > 0) {
                lines.push(...weaponStatChanges(def, def.levels[i - 1], level).map(weaponStatText));
            }
        }
        // A level up card past the last level: its damage bonus, before and after
        const past = {
            kind: "weaponLevel",
            weaponId: def.id,
            quality: "rare",
            bonus: 0.15,
        } as const;
        const card = describeChoice({ ...past, level: def.levels.length + 1 });
        lines.push(...(card.stats ?? []).map(weaponStatText));
    }
    for (const passive of PASSIVES) {
        lines.push(passiveValueText(passive, passive.perLevel));
        const card = describeChoice({
            kind: "newPassive",
            passiveId: passive.id,
            quality: "common",
        });
        lines.push(...(card.stats ?? []).map(weaponStatText));
    }
    lines.push(weaponBonusText(0.15));
    lines.push(
        ...ITEMS.flatMap((item) => describeItem(item)),
        ...RAID_SUPPLIES.map((supply) => ({
            text: tr(`raid.supply.${supply.id}.desc`, supply.description),
        })),
    );
    // A set's line starts with the set's name: "Armadura de cristal 2/3: ..." in Portuguese
    // starts with a stat's word, but it isn't a stat
    for (const set of SETS) {
        for (const worn of [undefined, 0, set.needed]) {
            lines.push({ text: describeSetProgress(set, worn) });
        }
    }
    return lines;
}

// A language needs no icon code of its own: every line gets the icon its English has. This
// runs for every language the game has.
describe.each(LANGS.filter((lang) => lang.id !== "en"))("icons in $label", ({ id }) => {
    afterEach(() => setLang("en"));

    it("gives every line the icon it has in English", () => {
        setLang("en");
        const english = everyLine();
        const icons = english.map((line) => statIconFor(line.text, line.english));
        setLang(id);
        const translated = everyLine();
        expect(translated.length).toBe(english.length);
        translated.forEach((line, i) => {
            const icon = statIconFor(line.text, line.english);
            expect(icon, `${english[i].text} -> ${line.text}`).toEqual(icons[i]);
        });
    });

    // The same for everything the language files hold: no text gains an icon its English
    // lacks, none loses one. A text two English texts translate to has no single English, so
    // the language must word them apart when only one of them has an icon.
    it("gives each text in the language files the icon of its English, no more", () => {
        const english = getMessages("en");
        const messages = getMessages(id);
        setLang("en");
        const icons = Object.fromEntries(
            Object.keys(messages).map((key) => [key, statIconFor(english[key] ?? "")]),
        );
        setLang(id);
        for (const [key, text] of Object.entries(messages)) {
            if (english[key] !== undefined) {
                expect(statIconFor(text), `${key}: ${english[key]} -> ${text}`).toEqual(icons[key]);
            }
        }
    });

    it("never reads a plain English line as a stat in another language", () => {
        setLang(id);
        expect(statIconFor("Get armour")).toBeUndefined();
        expect(statIconFor("12")).toBeUndefined();
        expect(statIconFor("")).toBeUndefined();
    });
});
