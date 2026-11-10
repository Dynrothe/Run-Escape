import { t, tr } from "../i18n";
import { getPassive } from "./passives";
import { PassiveDef, WeaponDef } from "./types";
import { WEAPONS, getWeapon } from "./weapons";

// Every evolution as a recipe, for what the game shows of them. Each is one
// result, with every weapon that evolves into it (any of the hilted godswords).
export type EvolutionDef = {
    into: WeaponDef;
    passive: PassiveDef;
    weapons: WeaponDef[];
    // What's evolved, at the level it evolves from: "Dragon scimitar", or
    // "Any godsword" when it's a family
    name: string;
    iconObjId: number;
};

// The evolutions' words, for locales/en/gen.json: evo.any, and evo.family.<family> for the name
// of each family that a recipe takes any of (generated from EVOLUTIONS)
export const EVO_MESSAGES: Record<string, string> = {
    "evo.any": "Any {family}",
};

// What's evolved, in the active language: "Any godsword", or the weapon's name at the level
// it evolves from
function evolvedName(weapons: WeaponDef[]): string {
    const first = weapons[0];
    if (weapons.length > 1) {
        const family = first.family ?? "";
        return t("evo.any", { family: tr(`evo.family.${family}`, family) });
    }
    const top = first.levels[first.levels.length - 1];
    return top.name !== undefined
        ? tr(`weapon.${first.id}.level.${first.levels.length}.name`, top.name)
        : tr(`weapon.${first.id}.name`, first.name);
}

function describeWeapons(weapons: WeaponDef[]): { iconObjId: number } {
    const top = weapons[0].levels[weapons[0].levels.length - 1];
    return { iconObjId: top.objId ?? weapons[0].iconObjId };
}

export const EVOLUTIONS: EvolutionDef[] = [
    ...new Set(WEAPONS.flatMap((w) => w.evolution?.into ?? [])),
].map((into) => {
    const weapons = WEAPONS.filter((w) => w.evolution?.into === into);
    return {
        into: getWeapon(into),
        passive: getPassive(weapons[0].evolution!.requiresPassive),
        weapons,
        // Read when it's shown, so it follows the language
        get name() {
            return evolvedName(weapons);
        },
        ...describeWeapons(weapons),
    };
});

export function getEvolutionsWith(passiveId: string): EvolutionDef[] {
    return EVOLUTIONS.filter((e) => e.passive.id === passiveId);
}
