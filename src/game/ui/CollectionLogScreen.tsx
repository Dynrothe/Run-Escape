import { useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { EVOLUTIONS, EvolutionDef } from "../content/evolutions";
import { RARITIES } from "../content/rarity";
import { TROPHIES } from "../content/trophies";
import { describeUnlockTask } from "../content/unlocks";
import { formatWeaponStat, weaponStats } from "../content/weaponStats";
import { getWeapon } from "../content/weapons";
import { SaveData } from "../core/save";
import { Coins } from "./Coins";
import "./CollectionLogScreen.css";
import { ItemIcon } from "./ItemIcon";

// Every evolution, after the client's Collection log. What it takes is always
// shown; what it makes stays ??? until it's been made in a run. Another tab
// has the Halloween map's rewards, ??? until they're found.

type Props = { ui: UiSnapshot; client: GameClient };

export function CollectionLogScreen({ ui, client }: Props): JSX.Element {
    const save = ui.save;
    const made = EVOLUTIONS.filter((e) => save.evolutionsMade.includes(e.into.id)).length;
    const [shown, setShown] = useState(EVOLUTIONS[0]);
    const [tab, setTab] = useState<"evolutions" | "rewards">("evolutions");
    const rewards = getHalloweenRewards(save);
    const [reward, setReward] = useState(0);
    const found = rewards.filter((r) => r.found).length;
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-log">
                <h2>Collection log</h2>
                <div className="ui-log-tabs">
                    <button
                        className={"ui-log-tab" + (tab === "evolutions" ? " ui-log-selected" : "")}
                        onClick={() => setTab("evolutions")}
                    >
                        Evolutions
                    </button>
                    <button
                        className={"ui-log-tab" + (tab === "rewards" ? " ui-log-selected" : "")}
                        onClick={() => setTab("rewards")}
                    >
                        Hallowed Night
                    </button>
                </div>
                {tab === "evolutions" ? (
                    <>
                        <p className="ui-subtle">
                            Max a weapon and own its passive, and the next level up can evolve it.
                        </p>
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
                        <p className="ui-subtle">What the Hallowed Night has to find.</p>
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
                            <div>{rewards[reward].found ? rewards[reward].name : "???"}</div>
                            <div>{rewards[reward].how}</div>
                        </div>
                    </>
                )}
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        Back
                    </button>
                    <span className="ui-log-count">
                        {tab === "evolutions"
                            ? `Made ${made} / ${EVOLUTIONS.length}`
                            : `Found ${found} / ${rewards.length}`}
                    </span>
                    <Coins amount={save.coins} />
                </div>
            </div>
        </div>
    );
}

type RewardEntry = { id: string; name: string; objId: number; how: string; found: boolean };

// The weapons The Nightmare brings in, then the trophies
function getHalloweenRewards(save: SaveData): RewardEntry[] {
    const weapons = ["inquisitors_mace", "volatile_nightmare_staff"].map((id) => {
        const weapon = getWeapon(id);
        return {
            id,
            name: weapon.name,
            objId: weapon.iconObjId,
            how: `${describeUnlockTask(weapon.unlock!)} to bring it in.`,
            found: save.unlockedItems.includes(id),
        };
    });
    const trophies = TROPHIES.map(({ id, name, objId, how }) => ({
        id,
        name,
        objId,
        how,
        found: save.trophies.includes(id),
    }));
    return [...weapons, ...trophies];
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
                    {entry.found ? entry.name : "???"}
                </span>
                <span className="ui-log-parts">{entry.how}</span>
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
                        {into.name}
                    </span>
                ) : (
                    <span className="ui-log-name ui-log-hidden">???</span>
                )}
                <span className="ui-log-parts">
                    {evolution.name} + {passive.name}
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
                    <div style={{ color: RARITIES[into.rarity].color }}>{into.name}</div>
                    <div>{into.description}</div>
                    <div className="ui-log-stats">
                        {weaponStats(into, into.levels[0]).map(formatWeaponStat).join(", ")}
                    </div>
                </>
            ) : (
                <>
                    <div className="ui-log-hidden">???</div>
                    <div>
                        Max the {evolution.name} and own {passive.name} to find out what it makes.
                    </div>
                </>
            )}
        </div>
    );
}
