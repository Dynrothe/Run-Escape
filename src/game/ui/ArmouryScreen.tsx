import { Fragment, useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { getItemView } from "../client/ItemViews";
import { getUpgradeLine, getUpgradedGear } from "../content/armoury";
import { CASKET_GEAR, GEAR_SLOTS, GEAR_SLOT_BY_ID, getGear } from "../content/items";
import { RARITIES } from "../content/rarity";
import { describeSetProgress, getItemSet } from "../content/sets";
import { compareStats, formatStats } from "../content/stats";
import { describeUnlockTask, isAvailable } from "../content/unlocks";
import { SaveData, getArmouryStep } from "../core/save";
import { fmtNum, t, tl } from "../i18n";
import "./ArmouryScreen.css";
import { Coins } from "./Coins";
import { DescriptionButton, ItemDescription } from "./DescriptionButton";
import { ItemIcon } from "./ItemIcon";
import { LoadoutCatalogue } from "./LoadoutCatalogue";
import { StatLine } from "./StatLine";

// The Armoury: every piece of gear caskets give, slot by slot, as the
// upgrades have made it (faded until it's been found). Beside them, the piece
// picked: what it is now, its line of upgrades, and the next one's cost.

type Props = { ui: UiSnapshot; client: GameClient };

export function ArmouryScreen({ ui, client }: Props): JSX.Element {
    const save = ui.save;
    const [tab, setTab] = useState<"gear" | "weapons" | "passives">("gear");
    const [selected, setSelected] = useState(
        () => CASKET_GEAR.find((g) => save.foundGear.includes(g.id))?.id ?? CASKET_GEAR[0].id,
    );
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-armoury">
                <h2>{t("armoury.title")}</h2>
                <p className="ui-subtle">{t("armoury.intro")}</p>
                <div className="ui-armoury-body">
                    <div className="ui-armoury-slots">
                        {GEAR_SLOTS.map((slot) => (
                            <div key={slot.id} className="ui-armoury-slot">
                                <div className="ui-armoury-slot-name">{tl(slot.name)}</div>
                                <div className="ui-armoury-pieces">
                                    {CASKET_GEAR.filter((g) => g.slot === slot.id).map((g) => (
                                        <ArmouryTile
                                            key={g.id}
                                            save={save}
                                            itemId={g.id}
                                            selected={g.id === selected}
                                            onSelect={() => setSelected(g.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <ArmouryDetails save={save} itemId={selected} client={client} />
                </div>
                {tab === "gear" ? (
                    <>
                        <p className="ui-subtle">{t("armoury.intro")}</p>
                        <div className="ui-armoury-body">
                            <div className="ui-armoury-slots">
                                {GEAR_SLOTS.map((slot) => (
                                    <div key={slot.id} className="ui-armoury-slot">
                                        <div className="ui-armoury-slot-name">{tl(slot.name)}</div>
                                        <div className="ui-armoury-pieces">
                                            {CASKET_GEAR.filter((g) => g.slot === slot.id).map(
                                                (g) => (
                                                    <ArmouryTile
                                                        key={g.id}
                                                        save={save}
                                                        itemId={g.id}
                                                        selected={g.id === selected}
                                                        onSelect={() => setSelected(g.id)}
                                                    />
                                                ),
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <ArmouryDetails save={save} itemId={selected} client={client} />
                        </div>
                    </>
                ) : (
                    <LoadoutCatalogue kind={tab} save={save} />
                )}
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        {t("canvas.back")}
                    </button>
                    {tab === "gear" && (
                        <span className="ui-armoury-count">
                            {t("armoury.found", {
                                n: fmtNum(save.foundGear.length),
                                total: fmtNum(CASKET_GEAR.length),
                            })}
                        </span>
                    )}
                    <Coins amount={save.coins} />
                </div>
            </div>
        </div>
    );
}

// A piece as it is now, with a pip for each upgrade along its line
function ArmouryTile({
    save,
    itemId,
    selected,
    onSelect,
}: {
    save: SaveData;
    itemId: string;
    selected: boolean;
    onSelect: () => void;
}): JSX.Element {
    const found = save.foundGear.includes(itemId);
    const piece = getGear(getUpgradedGear(itemId, save.armoury));
    const steps = getUpgradeLine(itemId).length - 1;
    const upgrades = save.armoury[itemId] ?? 0;
    return (
        <DescriptionButton
            itemId={piece.id}
            className={
                "ui-card ui-armoury-tile" +
                (selected ? " ui-card-selected" : "") +
                (found ? "" : " ui-card-locked")
            }
            style={found ? { borderColor: RARITIES[piece.rarity].color } : undefined}
            aria-label={
                found ? tl(piece.name) : t("armoury.not_found_title", { name: tl(piece.name) })
            }
            aria-pressed={selected}
            onUse={onSelect}
            silent={false}
            description={
                <ArmouryDescription
                    itemId={piece.id}
                    notFound={found ? undefined : describeNotFound(save, itemId)}
                />
            }
        >
            <ItemIcon objId={piece.objId} size={30} />
            {found && steps > 0 && (
                <span className="ui-armoury-pips">
                    {Array.from({ length: steps }, (_, i) => (
                        <span
                            key={i}
                            className={i < upgrades ? "ui-armoury-pip ui-pip-on" : "ui-armoury-pip"}
                        />
                    ))}
                </span>
            )}
        </DescriptionButton>
    );
}

// notFound: what it takes to find it, for a piece not found yet
function ArmouryDescription({
    itemId,
    notFound,
}: {
    itemId: string;
    notFound?: string;
}): JSX.Element {
    return (
        <ItemDescription item={getItemView(getGear(itemId))} setClassName="ui-armoury-set">
            {notFound && <span>{notFound}</span>}
        </ItemDescription>
    );
}

// A map task can still keep a piece out of caskets
function describeNotFound(save: SaveData, itemId: string): string {
    const base = getGear(itemId);
    return base.unlock && !isAvailable(base, new Set(save.unlockedItems))
        ? t("armoury.unlock_to_find", { task: describeUnlockTask(base.unlock) })
        : t("armoury.not_found");
}

function ArmouryDetails({
    save,
    itemId,
    client,
}: {
    save: SaveData;
    itemId: string;
    client: GameClient;
}): JSX.Element {
    const found = save.foundGear.includes(itemId);
    const line = getUpgradeLine(itemId);
    const upgrades = save.armoury[itemId] ?? 0;
    const piece = getGear(getUpgradedGear(itemId, save.armoury));
    const step = getArmouryStep(save, itemId);
    const next = step && getGear(step.into);
    const base = getGear(itemId);
    const set = getItemSet(base);
    let action: JSX.Element;
    if (!found) {
        action = <div className="ui-card-cost">{describeNotFound(save, itemId)}</div>;
    } else if (!step || !next) {
        action = (
            <div className="ui-card-style">
                {line.length > 1 ? t("armoury.fully_upgraded") : t("armoury.no_upgrade")}
            </div>
        );
    } else {
        action = (
            <div className="ui-armoury-next">
                <div className="ui-armoury-into">
                    {t("armoury.upgrade_into")}
                    <ItemIcon objId={next.objId} size={22} />
                    <span style={{ color: RARITIES[next.rarity].color }}>{tl(next.name)}</span>
                </div>
                {/* Its stats once upgraded, with what they are now */}
                <ul className="ui-armoury-changes">
                    {compareStats(piece.stats, next.stats).map((line) => (
                        <li key={line.key}>
                            <span className="ui-armoury-stat-label">
                                <StatLine text={line.label} statKey={line.key} />
                            </span>
                            <span>
                                {line.from !== undefined && <>{line.from} → </>}
                                <span
                                    className={
                                        line.from === undefined
                                            ? undefined
                                            : line.better
                                              ? "ui-good"
                                              : "ui-bad"
                                    }
                                >
                                    {line.to}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
                {step.locked ? (
                    <div className="ui-card-cost">
                        {t("armoury.to_unlock", { task: describeUnlockTask(step.locked) })}
                    </div>
                ) : (
                    <button
                        className="ui-button ui-button-go ui-armoury-buy"
                        data-silent
                        disabled={save.coins < step.cost}
                        onClick={() => client.upgradeGear(itemId)}
                    >
                        {t("armoury.upgrade")} <Coins amount={step.cost} />
                    </button>
                )}
            </div>
        );
    }
    return (
        <div className="ui-select-details ui-armoury-details">
            <div className="ui-select-details-head">
                <ItemIcon objId={piece.objId} size={36} />
                <div>
                    <div className="ui-card-title" style={{ color: RARITIES[piece.rarity].color }}>
                        {tl(piece.name)}
                    </div>
                    <div className="ui-card-style">
                        {t("armoury.style", {
                            rarity: tl(RARITIES[piece.rarity].name),
                            slot: tl(GEAR_SLOT_BY_ID.get(piece.slot)!.name),
                        })}
                    </div>
                </div>
            </div>
            <ul className="ui-armoury-stats">
                {formatStats(piece.stats).map((text) => (
                    <li key={text}>
                        <StatLine text={text} />
                    </li>
                ))}
                {set && (
                    <li className="ui-armoury-set">
                        <StatLine text={describeSetProgress(set)} />
                    </li>
                )}
            </ul>
            {line.length > 1 && (
                <div className="ui-armoury-line">
                    {line.map((id, i) => {
                        const form = getGear(id);
                        return (
                            <Fragment key={id}>
                                {i > 0 && <span className="ui-armoury-arrow">›</span>}
                                <DescriptionButton
                                    itemId={id}
                                    className={
                                        "ui-armoury-step" +
                                        (found && i <= upgrades ? " ui-armoury-step-done" : "") +
                                        (found && i === upgrades ? " ui-armoury-step-now" : "")
                                    }
                                    aria-label={tl(form.name)}
                                    description={<ArmouryDescription itemId={id} />}
                                >
                                    <ItemIcon objId={form.objId} size={28} />
                                </DescriptionButton>
                            </Fragment>
                        );
                    })}
                </div>
            )}
            {action}
        </div>
    );
}
