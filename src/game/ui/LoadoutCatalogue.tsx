import { useState } from "react";

import { CHARACTERS, characterName } from "../content/characters";
import { EVOLUTIONS, getEvolutionsWith } from "../content/evolutions";
import { getMap, mapName } from "../content/maps";
import {
    PASSIVES,
    formatPassiveValue,
    getPassive,
    getPassiveGain,
    passiveDescription,
    passiveName,
} from "../content/passives";
import { RARITIES } from "../content/rarity";
import { CombatStyle, PassiveDef, WeaponDef } from "../content/types";
import { describeUnlockTask, isAvailable } from "../content/unlocks";
import { formatWeaponStat, weaponStats } from "../content/weaponStats";
import {
    WEAPONS,
    getWeaponStyle,
    weaponDescription,
    weaponLevelDescription,
    weaponLevelName,
    weaponName,
} from "../content/weapons";
import { SaveData } from "../core/save";
import { fmtNum, t, tl } from "../i18n";
import { DescriptionButton } from "./DescriptionButton";
import { ItemIcon } from "./ItemIcon";
import { StatLine } from "./StatLine";

type CatalogueItem = WeaponDef | PassiveDef;
type Kind = "weapons" | "passives";
const STYLES: CombatStyle[] = ["melee", "ranged", "magic"];
const BASE_WEAPONS = WEAPONS.filter((weapon) => !weapon.evolved);

function itemName(item: CatalogueItem): string {
    return "levels" in item ? weaponName(item) : passiveName(item);
}

function itemDescription(item: CatalogueItem): string {
    return "levels" in item ? weaponDescription(item) : passiveDescription(item);
}

export function LoadoutCatalogue({ kind, save }: { kind: Kind; save: SaveData }): JSX.Element {
    const [selected, setSelected] = useState<Record<Kind, string>>({
        weapons: "scimitar",
        passives: PASSIVES[0].id,
    });
    const unlocked = new Set(save.unlockedItems);
    const weapons = WEAPONS.filter(
        (weapon) => !weapon.evolved || save.evolutionsMade.includes(weapon.id),
    );
    const items: CatalogueItem[] = kind === "weapons" ? weapons : PASSIVES;
    const item = items.find((entry) => entry.id === selected[kind]) ?? items[0];
    const groups =
        kind === "weapons"
            ? STYLES.map((style) => ({
                  id: style,
                  label: t(`ui.combat.${style}`),
                  items: weapons.filter((weapon) => getWeaponStyle(weapon) === style),
              }))
            : [{ id: "all", label: t("armoury.catalogue.all_styles"), items: PASSIVES }];

    // The Armoury above it says what the tab is, and what the tiles' borders mean
    return (
        <div className="ui-armoury-body">
            <div className="ui-armoury-slots">
                {groups.map((group) => (
                    <div className="ui-catalogue-group" key={group.id}>
                        <div className="ui-armoury-slot-name">{group.label}</div>
                        <div className="ui-armoury-pieces">
                            {group.items.map((entry) => {
                                const available = isAvailable(entry, unlocked);
                                const name = itemName(entry);
                                return (
                                    <DescriptionButton
                                        key={entry.id}
                                        itemId={entry.id}
                                        className={
                                            "ui-card ui-armoury-tile" +
                                            (entry.id === item.id ? " ui-card-selected" : "") +
                                            (available ? "" : " ui-card-locked")
                                        }
                                        style={
                                            available
                                                ? { borderColor: RARITIES[entry.rarity].color }
                                                : undefined
                                        }
                                        aria-label={name}
                                        aria-pressed={entry.id === item.id}
                                        onUse={() =>
                                            setSelected((previous) => ({
                                                ...previous,
                                                [kind]: entry.id,
                                            }))
                                        }
                                        silent={false}
                                        description={
                                            <>
                                                <strong>{name}</strong>
                                                <span>{itemDescription(entry)}</span>
                                                {entry.unlock && (
                                                    <span>{describeUnlockTask(entry.unlock)}</span>
                                                )}
                                            </>
                                        }
                                    >
                                        <ItemIcon
                                            objId={entry.iconObjId}
                                            spriteId={
                                                "iconSpriteId" in entry
                                                    ? entry.iconSpriteId
                                                    : undefined
                                            }
                                            size={30}
                                        />
                                    </DescriptionButton>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <div className="ui-select-details ui-armoury-details">
                <div className="ui-select-details-head">
                    <ItemIcon
                        objId={item.iconObjId}
                        spriteId={"iconSpriteId" in item ? item.iconSpriteId : undefined}
                        size={36}
                    />
                    <div>
                        <div
                            className="ui-card-title"
                            style={{ color: RARITIES[item.rarity].color }}
                        >
                            {itemName(item)}
                        </div>
                        <div className="ui-card-style">{tl(RARITIES[item.rarity].name)}</div>
                    </div>
                </div>
                <div>{itemDescription(item)}</div>
                <div className="ui-card-cost">
                    {item.unlock
                        ? t(
                              isAvailable(item, unlocked)
                                  ? "armoury.catalogue.unlocked_by"
                                  : "armoury.catalogue.locked_by",
                              { task: describeUnlockTask(item.unlock) },
                          )
                        : "levels" in item && (item.pickOnly || item.evolved)
                          ? null
                          : t("armoury.catalogue.from_start")}
                </div>
                {"levels" in item ? (
                    <WeaponDetails weapon={item} save={save} />
                ) : (
                    <PassiveDetails passive={item} save={save} />
                )}
            </div>
        </div>
    );
}

function WeaponDetails({ weapon, save }: { weapon: WeaponDef; save: SaveData }): JSX.Element {
    const sources = CHARACTERS.filter((character) => character.startingWeapon === weapon.id);
    const picks = BASE_WEAPONS.filter(
        (base) =>
            base.id !== weapon.id && base.hilts?.into.some((pick) => pick.weaponId === weapon.id),
    );
    const evolution = EVOLUTIONS.find((entry) =>
        entry.weapons.some((base) => base.id === weapon.id),
    );
    const recipe = EVOLUTIONS.find((entry) => entry.into.id === weapon.id);
    const resultVisible = evolution && save.evolutionsMade.includes(evolution.into.id);
    return (
        <>
            {!weapon.evolved && !weapon.pickOnly && (
                <div className="ui-card-style">
                    {t(
                        weapon.style
                            ? "armoury.catalogue.class_weapon"
                            : "armoury.catalogue.shared_weapon",
                    )}
                </div>
            )}
            {weapon.pickOnly && <div>{t("armoury.catalogue.pick_only")}</div>}
            {recipe && (
                <div>
                    {t("armoury.catalogue.evolved_from", {
                        weapon: recipe.name,
                        passive: passiveName(recipe.passive),
                    })}
                </div>
            )}
            {sources.map((character) => (
                <div key={character.id}>
                    {t("armoury.catalogue.starts_with", { name: characterName(character) })}
                    {/* One map's own (the Avian Assaulter, a boss fight's) */}
                    {character.only && (
                        <>
                            {" "}
                            {t("armoury.catalogue.map_only", {
                                map: mapName(getMap(character.only)),
                            })}
                        </>
                    )}
                    {character.unlock && <> {describeUnlockTask(character.unlock)}.</>}
                </div>
            ))}
            {weapon.pickOnly &&
                picks.map((base) => (
                    <div key={base.id}>
                        {t("armoury.catalogue.pick_from", {
                            name: weaponName(base),
                            level: fmtNum(base.hilts!.level),
                        })}
                    </div>
                ))}
            <div className="ui-catalogue-section">
                <strong>{t("armoury.catalogue.levels")}</strong>
                {weapon.levels.map((level, index) => (
                    <div key={index} className="ui-catalogue-level">
                        <span>
                            {t("armoury.catalogue.level", { level: fmtNum(index + 1) })}
                            {weaponLevelName(weapon, index)
                                ? `: ${weaponLevelName(weapon, index)}`
                                : ""}
                        </span>
                        {index === 0 ? (
                            weaponStats(weapon, level).map((stat) => (
                                <StatLine key={stat.label} text={formatWeaponStat(stat)} />
                            ))
                        ) : (
                            <div>{weaponLevelDescription(weapon, index)}</div>
                        )}
                    </div>
                ))}
            </div>
            {evolution && (
                <div className="ui-catalogue-section">
                    <strong>{t("armoury.catalogue.evolution")}</strong>
                    <div>
                        {t("armoury.catalogue.evolves_with", {
                            passive: passiveName(getPassive(weapon.evolution!.requiresPassive)),
                            result: resultVisible ? weaponName(evolution.into) : "???",
                        })}
                    </div>
                    {evolution.passive.unlock && (
                        <div>
                            {t("armoury.catalogue.passive_unlock", {
                                passive: passiveName(evolution.passive),
                                task: describeUnlockTask(evolution.passive.unlock),
                            })}
                        </div>
                    )}
                    {evolution.into.unlock && (
                        <div>{describeUnlockTask(evolution.into.unlock)}</div>
                    )}
                </div>
            )}
        </>
    );
}

function PassiveDetails({ passive, save }: { passive: PassiveDef; save: SaveData }): JSX.Element {
    const evolutions = getEvolutionsWith(passive.id);
    return (
        <>
            <StatLine
                text={formatPassiveValue(passive, getPassiveGain(passive, passive.rarity))}
                statKey={passive.stat}
            />
            <div>
                {t(
                    passive.whole
                        ? "armoury.catalogue.passive_gain_fixed"
                        : "armoury.catalogue.passive_gain",
                )}
            </div>
            <div>{t("armoury.catalogue.max_level", { level: fmtNum(passive.maxLevel) })}</div>
            {evolutions.length > 0 && (
                <div className="ui-catalogue-section">
                    <strong>{t("armoury.catalogue.evolution")}</strong>
                    {evolutions.map((evolution) => (
                        <div key={evolution.into.id}>
                            {t("armoury.catalogue.passive_evolves", {
                                weapon: evolution.name,
                                result: save.evolutionsMade.includes(evolution.into.id)
                                    ? weaponName(evolution.into)
                                    : "???",
                            })}
                            {evolution.into.unlock && (
                                <> {describeUnlockTask(evolution.into.unlock)}.</>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
