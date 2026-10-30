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

function describeWeapons(weapons: WeaponDef[]): { name: string; iconObjId: number } {
    const top = weapons[0].levels[weapons[0].levels.length - 1];
    return {
        name: weapons.length > 1 ? `Any ${weapons[0].family}` : (top.name ?? weapons[0].name),
        iconObjId: top.objId ?? weapons[0].iconObjId,
    };
}

export const EVOLUTIONS: EvolutionDef[] = [
    ...new Set(WEAPONS.flatMap((w) => w.evolution?.into ?? [])),
].map((into) => {
    const weapons = WEAPONS.filter((w) => w.evolution?.into === into);
    return {
        into: getWeapon(into),
        passive: getPassive(weapons[0].evolution!.requiresPassive),
        weapons,
        ...describeWeapons(weapons),
    };
});

export function getEvolutionsWith(passiveId: string): EvolutionDef[] {
    return EVOLUTIONS.filter((e) => e.passive.id === passiveId);
}
