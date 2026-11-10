import { useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { REWARD_MAPS, RewardEntry, getRewards } from "../content/collectionLog";
import { EVOLUTIONS, EvolutionDef } from "../content/evolutions";
import { getMap } from "../content/maps";
import { RARITIES } from "../content/rarity";
import { formatWeaponStat, weaponStats } from "../content/weaponStats";
import { fmtNum, t, tl } from "../i18n";
import { Coins } from "./Coins";
import "./CollectionLogScreen.css";
import { ItemIcon } from "./ItemIcon";

// Every evolution, after the client's Collection log. What it takes is always
// shown; what it makes stays ??? until it's been made in a run. Then a tab for
// each map with trophies to find (content/collectionLog.ts), ??? until they're
// found: the weapons it brings in, then its trophies.

type Props = { ui: UiSnapshot; client: GameClient };

export function CollectionLogScreen({ ui, client }: Props): JSX.Element {
    const save = ui.save;
    const made = EVOLUTIONS.filter((e) => save.evolutionsMade.includes(e.into.id)).length;
    const [shown, setShown] = useState(EVOLUTIONS[0]);
    // "evolutions", or a reward map's id
    const [tab, setTab] = useState("evolutions");
    const rewards = tab === "evolutions" ? [] : getRewards(save, tab);
    const [reward, setReward] = useState(0);
    const open = (id: string) => {
        setTab(id);
        setReward(0);
    };
    const found = rewards.filter((r) => r.found).length;
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-log">
                <h2>{t("collection.title")}</h2>
                <div className="ui-log-tabs">
                    <button
                        className={"ui-log-tab" + (tab === "evolutions" ? " ui-log-selected" : "")}
                        onClick={() => open("evolutions")}
                    >
                        {t("collection.evolutions")}
                    </button>
                    {REWARD_MAPS.map((mapId) => (
                        <button
                            key={mapId}
                            className={"ui-log-tab" + (tab === mapId ? " ui-log-selected" : "")}
                            onClick={() => open(mapId)}
                        >
                            {tl(getMap(mapId).name)}
                        </button>
                    ))}
                </div>
                {tab === "evolutions" ? (
                    <>
                        <p className="ui-subtle">{t("collection.evolution_intro")}</p>
                        <div className="ui-log-list">
                            {EVOLUTIONS.map((evolution) => (
                                <EvolutionCard
                                    key={evolution.into.id}
                                    evolution={evolution}
                                    made={save.evolutionsMade.includes(evolution.into.id)}
                                    selected={evolution === shown}
                                    onShow={() => setShown(evolution)}
                                />
                            ))}
                        </div>
                        <EvolutionDetail
                            evolution={shown}
                            made={save.evolutionsMade.includes(shown.into.id)}
                        />
                    </>
                ) : (
                    <>
                        <p className="ui-subtle">
                            {t("collection.map_intro", { name: tl(getMap(tab).name) })}
                        </p>
                        <div className="ui-log-list">
                            {rewards.map((entry, i) => (
                                <RewardCard
                                    key={entry.id}
                                    entry={entry}
                                    selected={i === reward}
                                    onShow={() => setReward(i)}
                                />
                            ))}
                        </div>
                        <div className="ui-log-detail">
                            <div>{rewards[reward].found ? tl(rewards[reward].name) : "???"}</div>
                            <div>{tl(rewards[reward].how)}</div>
                        </div>
                    </>
                )}
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        {t("canvas.back")}
                    </button>
                    <span className="ui-log-count">
                        {tab === "evolutions"
                            ? t("collection.made", {
                                  n: fmtNum(made),
                                  total: fmtNum(EVOLUTIONS.length),
                              })
                            : t("collection.found", {
                                  n: fmtNum(found),
                                  total: fmtNum(rewards.length),
                              })}
                    </span>
                    <Coins amount={save.coins} />
                </div>
            </div>
        </div>
    );
}

function RewardCard({
    entry,
    selected,
    onShow,
}: {
    entry: RewardEntry;
    selected: boolean;
    onShow: () => void;
}): JSX.Element {
    return (
        <button
            className={"ui-log-card" + (selected ? " ui-log-selected" : "")}
            onMouseEnter={onShow}
            onFocus={onShow}
            onClick={onShow}
        >
            <span className="ui-log-recipe">
                {entry.found ? (
                    <ItemIcon objId={entry.objId} size={30} />
                ) : (
                    <span className="ui-log-unknown">?</span>
                )}
            </span>
            <span className="ui-log-text">
                <span className={"ui-log-name" + (entry.found ? "" : " ui-log-hidden")}>
                    {entry.found ? tl(entry.name) : "???"}
                </span>
                <span className="ui-log-parts">{tl(entry.how)}</span>
            </span>
        </button>
    );
}

function EvolutionCard({
    evolution,
    made,
    selected,
    onShow,
}: {
    evolution: EvolutionDef;
    made: boolean;
    selected: boolean;
    onShow: () => void;
}): JSX.Element {
    const { into, passive } = evolution;
    return (
        <button
            className={"ui-log-card" + (selected ? " ui-log-selected" : "")}
            onMouseEnter={onShow}
            onFocus={onShow}
            onClick={onShow}
        >
            <span className="ui-log-recipe">
                <ItemIcon objId={evolution.iconObjId} size={30} />
                <span className="ui-log-sign">+</span>
                <ItemIcon objId={passive.iconObjId} spriteId={passive.iconSpriteId} size={30} />
                <span className="ui-log-sign">=</span>
                {made ? (
                    <ItemIcon objId={into.iconObjId} size={30} />
                ) : (
                    <span className="ui-log-unknown">?</span>
                )}
            </span>
            <span className="ui-log-text">
                {made ? (
                    <span className="ui-log-name" style={{ color: RARITIES[into.rarity].color }}>
                        {tl(into.name)}
                    </span>
                ) : (
                    <span className="ui-log-name ui-log-hidden">???</span>
                )}
                <span className="ui-log-parts">
                    {tl(evolution.name)} + {tl(passive.name)}
                </span>
            </span>
        </button>
    );
}

// The card pointed at, pinned under the list so reading it doesn't move anything
function EvolutionDetail({
    evolution,
    made,
}: {
    evolution: EvolutionDef;
    made: boolean;
}): JSX.Element {
    const { into, passive } = evolution;
    return (
        <div className="ui-log-detail">
            {made ? (
                <>
                    <div style={{ color: RARITIES[into.rarity].color }}>{tl(into.name)}</div>
                    <div>{tl(into.description)}</div>
                    <div className="ui-log-stats">
                        {weaponStats(into, into.levels[0]).map(formatWeaponStat).join(", ")}
                    </div>
                </>
            ) : (
                <>
                    <div className="ui-log-hidden">???</div>
                    <div>
                        {t("collection.locked_hint", {
                            weapon: tl(evolution.name),
                            passive: tl(passive.name),
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
