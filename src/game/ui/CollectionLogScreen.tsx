import { useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { EVOLUTIONS, EvolutionDef } from "../content/evolutions";
import { RARITIES } from "../content/rarity";
import { formatWeaponStat, weaponStats } from "../content/weaponStats";
import { Coins } from "./Coins";
import "./CollectionLogScreen.css";
import { ItemIcon } from "./ItemIcon";

// Every evolution, after the client's Collection log. What it takes is always
// shown; what it makes stays ??? until it's been made in a run.

type Props = { ui: UiSnapshot; client: GameClient };

export function CollectionLogScreen({ ui, client }: Props): JSX.Element {
    const save = ui.save;
    const made = EVOLUTIONS.filter((e) => save.evolutionsMade.includes(e.into.id)).length;
    const [shown, setShown] = useState(EVOLUTIONS[0]);
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-log">
                <h2>Collection log</h2>
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
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        Back
                    </button>
                    <span className="ui-log-count">
                        Made {made} / {EVOLUTIONS.length}
                    </span>
                    <Coins amount={save.coins} />
                </div>
            </div>
        </div>
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
