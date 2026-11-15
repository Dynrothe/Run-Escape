import { PASSIVE_EXAMINE, WEAPON_EXAMINE, passiveExamine, weaponExamine } from "./examine";
import { PASSIVES } from "./passives";
import { WEAPONS } from "./weapons";

// Four lines of a tooltip at about thirty-six characters a line
const MAX_LENGTH = 140;

test("every weapon and passive has something to say when looked at, and it fits a tooltip", () => {
    for (const weapon of WEAPONS) {
        const text = WEAPON_EXAMINE[weapon.id];
        expect(text, weapon.id).toBeTruthy();
        expect(text.length, weapon.id).toBeLessThanOrEqual(MAX_LENGTH);
        expect(text.endsWith("."), weapon.id).toBe(true);
        expect(weaponExamine(weapon)).toBe(text);
    }
    for (const passive of PASSIVES) {
        const text = PASSIVE_EXAMINE[passive.id];
        expect(text, passive.id).toBeTruthy();
        expect(text.length, passive.id).toBeLessThanOrEqual(MAX_LENGTH);
        expect(passiveExamine(passive)).toBe(text);
    }
});

test("there's no text for what doesn't exist", () => {
    const weapons = new Set(WEAPONS.map((weapon) => weapon.id));
    const passives = new Set(PASSIVES.map((passive) => passive.id));
    for (const id of Object.keys(WEAPON_EXAMINE)) {
        expect(weapons.has(id), id).toBe(true);
    }
    for (const id of Object.keys(PASSIVE_EXAMINE)) {
        expect(passives.has(id), id).toBe(true);
    }
});
