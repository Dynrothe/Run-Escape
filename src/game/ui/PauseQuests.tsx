import type { CSSProperties, JSX } from "react";

import type { QuestTrackView } from "../client/GameStore";
import { enemyName, getEnemy } from "../content/enemies";
import { SLAYER_SPRITE_ID } from "../content/questIcons";
import { PAUSE_TAB_SPRITES } from "../content/titleIcons";
import { fmtNum, t, tl } from "../i18n";
import { ItemIcon } from "./ItemIcon";
import "./PauseQuests.css";
import { useStoneSlot } from "./useStoneSlot";

function state(quest: QuestTrackView): "done" | "started" | "new" {
    return quest.finished ? "done" : quest.done > 0 ? "started" : "new";
}

// The Slayer skill's skull, for a quest that's after creatures: what they are is in its tooltip
function Skull({ enemyIds }: { enemyIds: string[] }): JSX.Element | null {
    if (enemyIds.length === 0) {
        return null;
    }
    const names = enemyIds.map((id) => enemyName(getEnemy(id))).join(", ");
    return (
        <span className="ui-pq-skull" title={names} aria-label={names}>
            <ItemIcon objId={-1} spriteId={SLAYER_SPRITE_ID} size={32} />
        </span>
    );
}

// What the quest pays, in a stone square at the right: "Reward" on top, the Slayer skull when it's
// after creatures (their names in its tooltip), and below, the coins it pays or the item it
// unlocks with "Unlock" beside it.
function Reward({ quest }: { quest: QuestTrackView }): JSX.Element {
    return (
        <span className="ui-pq-reward">
            <span className="ui-pq-reward-label">{t("ui.quest.reward")}</span>
            <Skull enemyIds={quest.enemyIds} />
            <span className="ui-pq-reward-value">
                {quest.unlockObjId !== undefined ? (
                    <>
                        <ItemIcon objId={quest.unlockObjId} size={22} />
                        {t("ui.quest.unlock")}
                    </>
                ) : (
                    <>
                        <ItemIcon objId={995} size={22} count={quest.coins} />
                        {fmtNum(quest.coins)}
                    </>
                )}
            </span>
        </span>
    );
}

// The pause menu's Quests tab: a card for each quest the map has, with the quest's own icon in a
// stone square, its name and what it asks, a bar of how far it's got, and at the right a stone
// square with its reward (and the Slayer skull when it's after creatures). Red until started,
// yellow under way, green once done, as the client's.
export function PauseQuests({ quests }: { quests: QuestTrackView[] }): JSX.Element {
    const stone = useStoneSlot();
    return (
        <div
            className={"ui-pq" + (stone ? " ui-pq-stone" : "")}
            style={stone ? ({ "--ui-stone": stone } as CSSProperties) : undefined}
            role="list"
        >
            {quests.map((quest) => {
                const share = quest.of > 0 ? Math.min(1, quest.done / quest.of) : 0;
                const name = tl(quest.name);
                return (
                    <div
                        key={quest.id}
                        className={"ui-pq-card ui-pq-" + state(quest)}
                        role="listitem"
                    >
                        <span className="ui-pq-icon">
                            {quest.iconObjId !== undefined ? (
                                <ItemIcon objId={quest.iconObjId} size={32} />
                            ) : (
                                <ItemIcon
                                    objId={-1}
                                    spriteId={PAUSE_TAB_SPRITES.quests}
                                    size={32}
                                />
                            )}
                        </span>
                        <span className="ui-pq-body">
                            <span className="ui-pq-name">{name}</span>
                            <span className="ui-pq-task">{tl(quest.task)}</span>
                            <span
                                className="ui-pq-bar"
                                role="progressbar"
                                aria-label={name}
                                aria-valuemin={0}
                                aria-valuemax={quest.of}
                                aria-valuenow={Math.min(quest.done, quest.of)}
                            >
                                <span style={{ width: `${share * 100}%` }} />
                            </span>
                        </span>
                        <span className="ui-pq-progress">
                            {quest.finished
                                ? t("ui.quest.done")
                                : t("quest.progress", {
                                      done: fmtNum(quest.done),
                                      total: fmtNum(quest.of),
                                  })}
                        </span>
                        <Reward quest={quest} />
                    </div>
                );
            })}
        </div>
    );
}
