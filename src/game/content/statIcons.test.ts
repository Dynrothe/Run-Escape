import { describeItem } from "../core/Loot";
import { LANGS, setLang, tl } from "../i18n";
import { getMessages } from "../i18n/catalog";
import { ITEMS } from "./items";
import { PASSIVES, formatPassiveValue } from "./passives";
import { RAID_SUPPLIES } from "./raids";
import { StatIconRef, statIconFor, statKeyIcon } from "./statIcons";
import { STAT_INFO, formatStat } from "./stats";
import { StatKey } from "./types";
import { formatWeaponBonus, formatWeaponStat, weaponStatChanges, weaponStats } from "./weaponStats";
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
        expectOneIcon("bonus", statIconFor(`${formatWeaponBonus(0.15)} damage`));
    });

    // Descriptions are written by hand: one that leads with a stat's number gets its icon
    test("item and raid supply descriptions that lead with a stat resolve", () => {
        const lines: [string, string][] = [
            ...ITEMS.flatMap((item) =>
                describeItem(item).map((line): [string, string] => [item.id, line]),
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
        expect(statIconFor("12")).toBeUndefined();
    });
});

// Every line the screens show, in the active language: the ones the game builds (stats, weapon
// lines, passives, in the language as it builds them) and the hand-written ones it translates
function everyLine(): string[] {
    const lines: string[] = [];
    for (const key of Object.keys(STAT_INFO) as StatKey[]) {
        for (const value of [0.1, 2, -1, 0.5]) {
            lines.push(formatStat(key, value));
        }
    }
    for (const def of WEAPONS) {
        for (let i = 0; i < def.levels.length; i++) {
            const level = def.levels[i];
            lines.push(...weaponStats(def, level).map(formatWeaponStat));
            if (i > 0) {
                lines.push(
                    ...weaponStatChanges(def, def.levels[i - 1], level).map(formatWeaponStat),
                );
            }
        }
    }
    lines.push(...PASSIVES.map((passive) => formatPassiveValue(passive, passive.perLevel)));
    lines.push(`${formatWeaponBonus(0.15)} damage`);
    lines.push(
        ...ITEMS.flatMap((item) => describeItem(item)),
        ...RAID_SUPPLIES.map((supply) => supply.description),
    );
    return lines.map(tl);
}

// A language needs no icon code of its own: whatever it translates gets the icon the English
// line has. This runs for every language the game has.
describe.each(LANGS.filter((lang) => lang.id !== "en"))("icons in $label", ({ id }) => {
    afterEach(() => setLang("en"));

    it("gives every translated line the icon of its English", () => {
        setLang("en");
        const english = everyLine();
        const icons = english.map((line) => statIconFor(line));
        setLang(id);
        const translated = everyLine();
        expect(translated.length).toBe(english.length);
        translated.forEach((line, i) => {
            expect(statIconFor(line), `${english[i]} -> ${line}`).toEqual(icons[i]);
        });
    });

    // The same for everything the language files hold: no text gains an icon its English
    // lacks ("Veneno mais forte" starts with a label only in Portuguese), none loses one
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

    it("finds a stat by its label and by the number around it", () => {
        setLang(id);
        for (const key of Object.keys(STAT_INFO) as StatKey[]) {
            for (const value of [1, 0.5, -2]) {
                const line = formatStat(key, value);
                expect(statIconFor(line), line).toEqual(statKeyIcon(key));
            }
        }
    });

    it("keeps a stat's key as the icon's source, whatever the language", () => {
        setLang(id);
        for (const key of Object.keys(STAT_INFO) as StatKey[]) {
            expectOneIcon(key, statKeyIcon(key));
        }
    });
});

describe("icons: how a line is read", () => {
    afterEach(() => setLang("en"));

    it("reads numbers the way a language writes them", () => {
        setLang("pt-BR");
        expect(statIconFor("+0,5 armadura")).toEqual(statIconFor("+0.5 armour"));
        expect(statIconFor("+1.000 de armadura")).toEqual(statIconFor("+1 armour"));
        expect(statIconFor("+٢ armadura")).toEqual(statIconFor("+1 armour"));
        expect(statIconFor("+10 % de dano")).toEqual(statIconFor("+10% damage"));
    });

    it("never reads a plain English line as a stat in another language", () => {
        setLang("pt-BR");
        expect(statIconFor("Get armour")).toBeUndefined();
        expect(statIconFor("12")).toBeUndefined();
        expect(statIconFor("")).toBeUndefined();
    });

    it("doesn't cut a long word into short ones to find a label", () => {
        setLang("pt-BR");
        expect(statIconFor("+1 xyzdano")).toBeUndefined();
        expect(statIconFor("+1 danos")).toBeUndefined();
    });
});
