import { useRef, useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import {
    INVOCATIONS,
    INVOCATION_BY_ID,
    INVOCATION_GROUPS,
    MAX_RAID_LEVEL,
    OFF_SPRITE,
    RAID_BAND_SPRITES,
    TOMBS_UNIQUES,
    getRaidBand,
    getRaidLevel,
    getRaidLevelScale,
} from "../content/invocations";
import { ItemIcon } from "./ItemIcon";

// The Tombs of Amascut's raid level, and the way to its invocation board
export function InvocationsButton({
    ui,
    onOpen,
}: {
    ui: UiSnapshot;
    onOpen: () => void;
}): JSX.Element {
    const level = getRaidLevel(ui.save.invocations ?? []);
    return (
        <button className="ui-button ui-invocations-button" onClick={onOpen}>
            Invocations
            <span className="ui-invocations-level">
                Raid level {level} ({getRaidBand(level)})
            </span>
        </button>
    );
}

// The invocation board, as OSRS's: every invocation's icon in a grid, lit while it's on, and beside
// it the reward potential (the raid level, its band's Amascut and what the chest can hold). Pointing
// at an icon says what it is below; clicking turns it on or off, and one of a group that allows only
// one takes the last off.
// A scale as a change: 0.6 is "-40%", 1.1 "+10%"
function signedPercent(scale: number): string {
    const percent = Math.round((scale - 1) * 100);
    return `${percent >= 0 ? "+" : ""}${percent}%`;
}

export function InvocationBoard({
    ui,
    client,
    onClose,
}: {
    ui: UiSnapshot;
    client: GameClient;
    onClose: () => void;
}): JSX.Element {
    const on = ui.save.invocations ?? [];
    const level = getRaidLevel(on);
    const band = getRaidBand(level);
    const scale = getRaidLevelScale(level);
    const [shown, setShown] = useState<string>();
    const pointed = shown === undefined ? undefined : INVOCATION_BY_ID.get(shown);
    // A touch screen has no pointing: a tap shows one, and a tap on the one shown switches it.
    // Decided as it's pressed, before the press focuses it (which shows it)
    const readOnly = useRef(false);
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return (
        <div className="ui-modal">
            <div className="ui-panel rs-border rs-background ui-invocations">
                <h2 className="ui-invocations-title">Invocations</h2>
                <div className="ui-invocations-body">
                    <div className="ui-invocations-grid" onMouseLeave={() => setShown(undefined)}>
                        {INVOCATIONS.map((invocation) => {
                            const picked = on.includes(invocation.id);
                            return (
                                <button
                                    key={invocation.id}
                                    className={
                                        "ui-invocation" + (picked ? " ui-invocation-on" : "")
                                    }
                                    aria-label={invocation.name}
                                    aria-pressed={picked}
                                    title={invocation.name}
                                    onMouseEnter={() => setShown(invocation.id)}
                                    onFocus={() => setShown(invocation.id)}
                                    onPointerDown={(e) => {
                                        readOnly.current =
                                            e.pointerType === "touch" && shown !== invocation.id;
                                    }}
                                    onClick={() => {
                                        const read = readOnly.current;
                                        readOnly.current = false;
                                        setShown(invocation.id);
                                        if (!read) {
                                            client.toggleInvocation(invocation.id);
                                        }
                                    }}
                                >
                                    <ItemIcon
                                        objId={-1}
                                        spriteId={
                                            picked ? invocation.icon : invocation.icon + OFF_SPRITE
                                        }
                                        size={36}
                                    />
                                </button>
                            );
                        })}
                    </div>
                    <div className="ui-invocations-reward">
                        <div className="ui-invocations-reward-title">Reward Potential</div>
                        <div className="ui-invocations-level-row">
                            <span className="ui-invocations-number">{level}</span>
                            <ItemIcon objId={-1} spriteId={RAID_BAND_SPRITES[band]} size={40} />
                            <span className="ui-invocations-band">{band}</span>
                        </div>
                        <div className="ui-invocations-bar" aria-hidden>
                            <div
                                className="ui-invocations-bar-fill"
                                style={{
                                    width: `${Math.min(100, (level / MAX_RAID_LEVEL) * 100)}%`,
                                }}
                            />
                        </div>
                        <div className="ui-invocations-scale">
                            Enemies {signedPercent(scale.hp)} hitpoints,{" "}
                            {signedPercent(scale.damage)} damage
                        </div>
                        <div className="ui-invocations-uniques">
                            {TOMBS_UNIQUES.map((unique) => {
                                const out = level < unique.minLevel;
                                return (
                                    <span
                                        key={unique.objId}
                                        className={
                                            "ui-invocations-unique" +
                                            (out ? " ui-invocations-unique-out" : "")
                                        }
                                        title={
                                            out
                                                ? `${unique.name}: from raid level ${unique.minLevel}`
                                                : unique.name
                                        }
                                    >
                                        <ItemIcon objId={unique.objId} size={32} />
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="ui-invocations-detail">
                    {pointed ? (
                        <>
                            <span className="ui-invocations-detail-name">
                                {pointed.name}{" "}
                                <span className="ui-invocations-detail-level">
                                    +{pointed.level}
                                </span>
                            </span>
                            <span>
                                {pointed.description}
                                {INVOCATION_GROUPS.find((g) => g.id === pointed.group)?.one &&
                                    " Only one of its kind can be on."}
                            </span>
                        </>
                    ) : (
                        <span className="ui-subtle">
                            {touch
                                ? "Tap an invocation to see what it does, and again to switch it."
                                : "Point at an invocation to see what it does."}
                        </span>
                    )}
                </div>
                <div className="ui-invocations-buttons">
                    <button className="ui-button" onClick={() => client.clearInvocations()}>
                        Reset All
                    </button>
                    <button className="ui-button ui-button-go" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
