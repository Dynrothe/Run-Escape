import { CHARACTERS } from "../../../src/game/content/characters";
import { CASKETS, CASKET_TIERS, GEAR, GEAR_SLOTS, UTILITY } from "../../../src/game/content/items";
import { PASSIVES } from "../../../src/game/content/passives";
import { POWER_UPS, THRALLS } from "../../../src/game/content/powerups";
import { RARITIES, RARITY_ORDER } from "../../../src/game/content/rarity";
import { SETS } from "../../../src/game/content/sets";
import { SHOP_UPGRADES } from "../../../src/game/content/shop";
import { TROPHIES } from "../../../src/game/content/trophies";
import { WEAPONS } from "../../../src/game/content/weapons";

export default function extract(): Record<string, string> {
    const strings: Record<string, string> = {};

    for (const weapon of WEAPONS) {
        const prefix = `weapon.${weapon.id}`;
        strings[`${prefix}.name`] = weapon.name;
        strings[`${prefix}.desc`] = weapon.description;
        weapon.levels.forEach((level, index) => {
            if (level.name !== undefined) {
                strings[`${prefix}.level.${index + 1}.name`] = level.name;
            }
            if (level.description !== "") {
                strings[`${prefix}.level.${index + 1}.desc`] = level.description;
            }
        });
        if (weapon.special !== undefined) {
            strings[`${prefix}.special.name`] = weapon.special.name;
        }
    }

    for (const item of GEAR) strings[`gear.${item.id}.name`] = item.name;
    for (const item of UTILITY) {
        strings[`util.${item.id}.name`] = item.name;
        strings[`util.${item.id}.desc`] = item.description;
    }
    for (const slot of GEAR_SLOTS) strings[`slot.${slot.id}.name`] = slot.name;
    for (const tier of CASKET_TIERS) strings[`casket.${tier}.name`] = CASKETS[tier].name;

    for (const character of CHARACTERS) {
        strings[`char.${character.id}.name`] = character.name;
        strings[`char.${character.id}.desc`] = character.description;
    }
    for (const set of SETS) {
        strings[`set.${set.id}.name`] = set.name;
        strings[`set.${set.id}.bonus`] = set.bonus;
    }
    strings["set.progress.requirement"] =
        "Part of the {name} set: {needed} of its {total} pieces worn give {bonus}.";
    strings["set.progress.active"] = "{name} {worn}/{total}: set bonus on, {bonus}.";
    strings["set.progress.inactive"] = "{name} {worn}/{total}: {needed} worn give {bonus}.";

    for (const rarity of RARITY_ORDER) strings[`rarity.${rarity}.name`] = RARITIES[rarity].name;
    for (const passive of PASSIVES) {
        strings[`passive.${passive.id}.name`] = passive.name;
        strings[`passive.${passive.id}.desc`] = passive.description;
        strings[`passive.${passive.id}.effect`] = passive.effect;
    }
    for (const powerUp of POWER_UPS) {
        strings[`powerup.${powerUp.id}.name`] = powerUp.name;
        strings[`powerup.${powerUp.id}.desc`] = powerUp.description;
        if (powerUp.effect.kind === "laps") {
            strings[`powerup.${powerUp.id}.shout`] = powerUp.effect.shout;
        }
    }
    for (const thrall of THRALLS) strings[`thrall.${thrall.id}.name`] = thrall.name;
    for (const upgrade of SHOP_UPGRADES) {
        strings[`shop.${upgrade.id}.name`] = upgrade.name;
        strings[`shop.${upgrade.id}.desc`] = upgrade.description;
    }
    for (const trophy of TROPHIES) {
        strings[`trophy.${trophy.id}.name`] = trophy.name;
        strings[`trophy.${trophy.id}.how`] = trophy.how;
    }

    return strings;
}
