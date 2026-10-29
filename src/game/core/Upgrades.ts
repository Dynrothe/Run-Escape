import { OVERLEVEL_DAMAGE, upgradedName } from "../content/endless";
import {
    PASSIVES,
    canLevelPassive,
    formatPassiveValue,
    getPassive,
    getPassiveGain,
} from "../content/passives";
import { RARITIES, Rarity, atLeast, rollRarity } from "../content/rarity";
import { CombatStyle } from "../content/types";
import { isAvailable } from "../content/unlocks";
import { WEAPONS, getWeapon } from "../content/weapons";
import { Rng } from "./Rng";
import { PassiveState, WeaponState } from "./entities";

// Slots for a run's build. Kept small so a run is about what you choose, not
// collecting everything.
export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;

// Every weapon and passive offer carries its own rolled rarity ("quality"),
// which sets how big it is.
export type UpgradeChoice =
    | { kind: "newWeapon"; weaponId: string; quality: Rarity }
    | { kind: "weaponLevel"; weaponId: string; level: number; quality: Rarity }
    | { kind: "evolve"; weaponId: string; into: string }
    // The godsword's blade becomes the weapon of the hilt picked (see
    // WeaponDef.hilts), at the same level
    | { kind: "hilt"; weaponId: string; into: string; hiltObjId: number }
    | { kind: "newPassive"; passiveId: string; quality: Rarity }
    | {
          kind: "passiveLevel";
          passiveId: string;
          level: number;
          quality: Rarity;
          // What the passive adds up to before this pick
          currentValue: number;
      }
    | { kind: "coins"; amount: number }
    | { kind: "food"; amount: number };

export type ChoiceDescription = {
    title: string;
    text: string;
    iconObjId: number;
    // Shown instead of iconObjId's item when set (PassiveDef.iconSpriteId)
    iconSpriteId?: number;
    // undefined for evolutions and fallbacks
    quality?: Rarity;
};

// The extra damage text for a weapon pick of this quality, if any
function weaponBonusText(quality: Rarity): string {
    const bonus = RARITIES[quality].weaponBonus;
    return bonus > 0 ? ` +${Math.round(bonus * 100)}% damage to this weapon.` : "";
}

// How much more damage a weapon level past the last brings, by quality
// (endless runs; it multiplies what the weapon had)
export function getOverlevelDamage(quality: Rarity): number {
    return OVERLEVEL_DAMAGE * RARITIES[quality].power;
}

export function describeChoice(choice: UpgradeChoice): ChoiceDescription {
    switch (choice.kind) {
        case "newWeapon": {
            const weapon = getWeapon(choice.weaponId);
            return {
                title: weapon.levels[0].name ?? weapon.name,
                text: weapon.description + weaponBonusText(choice.quality),
                iconObjId: weapon.iconObjId,
                quality: choice.quality,
            };
        }
        case "weaponLevel": {
            const weapon = getWeapon(choice.weaponId);
            const last = weapon.levels.length;
            if (choice.level > last) {
                // Past its last level: Dragon scimitar +3
                const top = weapon.levels[last - 1];
                const damage = Math.round(getOverlevelDamage(choice.quality) * 100);
                return {
                    title: upgradedName(top.name ?? weapon.name, choice.level - last),
                    text: `This weapon does ${damage}% more damage.`,
                    iconObjId: top.objId ?? weapon.iconObjId,
                    quality: choice.quality,
                };
            }
            const level = weapon.levels[choice.level - 1];
            return {
                title: `${level.name ?? weapon.name} (level ${choice.level})`,
                text: level.description + weaponBonusText(choice.quality),
                iconObjId: level.objId ?? weapon.iconObjId,
                quality: choice.quality,
            };
        }
        case "evolve": {
            const into = getWeapon(choice.into);
            return { title: into.name, text: into.description, iconObjId: into.iconObjId };
        }
        case "hilt": {
            // The hilted weapon's description, without the sweep it shares
            // with the blade: "Every third swing is The Judgement..."
            const into = getWeapon(choice.into);
            return {
                title: into.name,
                text: into.description.replace(/^A heavy two-handed sweep\. /, ""),
                iconObjId: choice.hiltObjId,
            };
        }
        case "newPassive": {
            const passive = getPassive(choice.passiveId);
            const gain = getPassiveGain(passive, choice.quality);
            return {
                title: passive.name,
                text: `${passive.description} ${formatPassiveValue(passive, gain)}.`,
                iconObjId: passive.iconObjId,
                iconSpriteId: passive.iconSpriteId,
                quality: choice.quality,
            };
        }
        case "passiveLevel": {
            const passive = getPassive(choice.passiveId);
            const gain = getPassiveGain(passive, choice.quality);
            const total = formatPassiveValue(passive, choice.currentValue + gain);
            const past = choice.level - passive.maxLevel;
            return {
                title:
                    past > 0
                        ? upgradedName(passive.name, past)
                        : `${passive.name} (level ${choice.level})`,
                text: `${formatPassiveValue(passive, gain)}, ${total} in all.`,
                iconObjId: passive.iconObjId,
                iconSpriteId: passive.iconSpriteId,
                quality: choice.quality,
            };
        }
        case "coins":
            return {
                title: `${choice.amount} coins`,
                text: "Banked when the run ends.",
                iconObjId: 995,
            };
        case "food":
            return { title: "Shark", text: `Heals ${choice.amount} hitpoints.`, iconObjId: 385 };
    }
}

// Relative chances of each kind of offer. Owned things that can still level
// are likelier than new ones; new things are weighted by their rarity.
const WEAPON_LEVEL_WEIGHT = 9;
const PASSIVE_LEVEL_WEIGHT = 6;
const NEW_WEAPON_WEIGHT = 1;
const NEW_PASSIVE_WEIGHT = 0.5;

// Rolls the options offered on a level up: VS rules, roughly. An evolution is
// always offered when it's ready, and luck can add a fourth option and makes
// rarer rolls likelier. Class weapons are only offered to their own style.
// Weapons, passives and evolutions still locked behind a map task are left
// out; with no unlocked set everything is in. In endless runs weapons and
// most passives level on past their last level, so there's always something.
// The hilts to pick from when a weapon has just reached its hilt level (the
// godsword's blade), none otherwise
export function hiltChoices(weapon: WeaponState): UpgradeChoice[] {
    const hilts = weapon.def.hilts;
    if (!hilts || weapon.level < hilts.level) {
        return [];
    }
    return hilts.into.map(({ weaponId, hiltObjId }) => ({
        kind: "hilt",
        weaponId: weapon.def.id,
        into: weaponId,
        hiltObjId,
    }));
}

export function rollChoices(
    rng: Rng,
    weapons: readonly WeaponState[],
    passives: readonly PassiveState[],
    luck: number,
    style: CombatStyle,
    unlocked?: ReadonlySet<string>,
    endless = false,
): UpgradeChoice[] {
    const random = () => rng.next();
    const pool: { choice: () => UpgradeChoice; weight: number }[] = [];
    const evolutions: UpgradeChoice[] = [];

    // A family shares one weapon's offer chance among the members that are in
    // (evolutions are never offered, so they don't count)
    const familySizes = new Map<string, number>();
    for (const weapon of WEAPONS) {
        if (weapon.family && !weapon.evolved && isAvailable(weapon, unlocked)) {
            familySizes.set(weapon.family, (familySizes.get(weapon.family) ?? 0) + 1);
        }
    }

    const ownedWeapons = new Set(weapons.map((w) => w.def.id));
    const ownedFamilies = new Set(weapons.flatMap((w) => w.def.family ?? []));
    const ownedPassives = new Set(passives.map((p) => p.id));

    for (const weapon of weapons) {
        if (weapon.level < weapon.def.levels.length || endless) {
            pool.push({
                choice: () => ({
                    kind: "weaponLevel",
                    weaponId: weapon.def.id,
                    level: weapon.level + 1,
                    quality: rollRarity(random, luck),
                }),
                weight: WEAPON_LEVEL_WEIGHT,
            });
        }
        if (
            weapon.level >= weapon.def.levels.length &&
            weapon.def.evolution &&
            ownedPassives.has(weapon.def.evolution.requiresPassive) &&
            isAvailable(getWeapon(weapon.def.evolution.into), unlocked)
        ) {
            evolutions.push({
                kind: "evolve",
                weaponId: weapon.def.id,
                into: weapon.def.evolution.into,
            });
        }
    }
    if (weapons.length < MAX_WEAPONS) {
        for (const weapon of WEAPONS) {
            if (weapon.evolved || ownedWeapons.has(weapon.id) || !isAvailable(weapon, unlocked)) {
                continue;
            }
            // Another class's weapon, or a second of a family (one godsword
            // is enough)
            if (
                (weapon.style && weapon.style !== style) ||
                (weapon.family && ownedFamilies.has(weapon.family))
            ) {
                continue;
            }
            // Evolutions replace their base weapon, so don't offer the base again
            const evolvedOwned = !!weapon.evolution && ownedWeapons.has(weapon.evolution.into);
            if (!evolvedOwned) {
                const familySize = weapon.family ? familySizes.get(weapon.family)! : 1;
                pool.push({
                    // A new weapon is offered at its own rarity or better
                    choice: () => ({
                        kind: "newWeapon",
                        weaponId: weapon.id,
                        quality: atLeast(rollRarity(random, luck), weapon.rarity),
                    }),
                    weight: (RARITIES[weapon.rarity].weight * NEW_WEAPON_WEIGHT) / familySize,
                });
            }
        }
    }
    for (const passive of passives) {
        const def = getPassive(passive.id);
        if (canLevelPassive(def, passive.level, endless)) {
            pool.push({
                choice: () => ({
                    kind: "passiveLevel",
                    passiveId: passive.id,
                    level: passive.level + 1,
                    quality: rollRarity(random, luck),
                    currentValue: passive.value,
                }),
                weight: PASSIVE_LEVEL_WEIGHT,
            });
        }
    }
    if (passives.length < MAX_PASSIVES) {
        for (const passive of PASSIVES) {
            if (!ownedPassives.has(passive.id) && isAvailable(passive, unlocked)) {
                pool.push({
                    choice: () => ({
                        kind: "newPassive",
                        passiveId: passive.id,
                        quality: rollRarity(random, luck),
                    }),
                    weight: RARITIES[passive.rarity].weight * NEW_PASSIVE_WEIGHT,
                });
            }
        }
    }

    const count = rng.chance(Math.min(luck * 0.3, 0.6)) ? 4 : 3;
    const choices: UpgradeChoice[] = evolutions.slice(0, count);
    while (choices.length < count && pool.length > 0) {
        const index = rng.weightedIndex(pool.map((p) => p.weight));
        choices.push(pool[index].choice());
        pool.splice(index, 1);
    }
    if (choices.length === 0) {
        choices.push({ kind: "coins", amount: 25 }, { kind: "food", amount: 10 });
    }
    return choices;
}
