import { describe, expect, test } from "vitest";

import { WEAPONS, getWeaponDamageKinds, getWeaponStyle } from "./weapons";

describe("a weapon's kinds of damage", () => {
    test("start with its style", () => {
        for (const weapon of WEAPONS) {
            expect(getWeaponDamageKinds(weapon)[0], weapon.id).toBe(getWeaponStyle(weapon));
        }
    });

    test("add poison for venom and burning for fire ground", () => {
        const venom = WEAPONS.find((w) => w.levels.some((level) => (level.venom ?? 0) > 0));
        const burns = WEAPONS.find((w) => w.burns);
        expect(venom && getWeaponDamageKinds(venom)).toContain("poison");
        expect(burns && getWeaponDamageKinds(burns)).toContain("burn");
    });
});
