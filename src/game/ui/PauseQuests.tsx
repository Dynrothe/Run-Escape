import type { CSSProperties, JSX } from "react";

import type { CombatTrackView, QuestTrackView } from "../client/GameStore";
import { enemyName, getEnemy } from "../content/enemies";
import { SLAYER_SPRITE_ID } from "../content/questIcons";
import { COMBAT_ACHIEVEMENTS_OBJ, PAUSE_TAB_SPRITES } from "../content/titleIcons";
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
// yellow under way, green once done, as the client's. Under them, the Combat Achievements a solo
// run follows, in the same cards: plain while still to do, red once spoilt, with what spoilt it.
export function PauseQuests({
    quests,
    combatTasks,
}: {
    quests: QuestTrackView[];
    combatTasks: CombatTrackView[];
}): JSX.Element {
    const stone = useStoneSlot();
    const className = "ui-pq" + (stone ? " ui-pq-stone" : "");
    const style = stone ? ({ "--ui-stone": stone } as CSSProperties) : undefined;
    return (
        <>
            {quests.length > 0 && (
                <div className={className} style={style} role="list">
                    {quests.map((quest) => {
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
                                    <Bar label={name} done={quest.done} of={quest.of} />
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
            )}
            {combatTasks.length > 0 && (
                <>
                    <h3 className="ui-pause-heading">{t("pause.heading.combat_tasks")}</h3>
                    <div className={className} style={style} role="list">
                        {combatTasks.map((task) => (
                            <CombatCard key={task.id} task={task} />
                        ))}
                    </div>
                </>
            )}
        </>
    );
}

// How far a card's got, in its state's colour
function Bar({ label, done, of }: { label: string; done: number; of: number }): JSX.Element {
    const share = of > 0 ? Math.min(1, done / of) : 0;
    return (
        <span
            className="ui-pq-bar"
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={of}
            aria-valuenow={Math.min(done, of)}
        >
            <span style={{ width: `${share * 100}%` }} />
        </span>
    );
}

function combatState(task: CombatTrackView): "done" | "started" | "new" | "on" {
    return task.state === "done"
        ? "done"
        : task.state === "failed"
          ? "new"
          : task.progress && task.progress.done > 0
            ? "started"
            : "on";
}

// A Combat Achievement the run follows: the screen's icon, its name with its tier (and whether it's
// pinned), what it asks or what spoilt it, a bar for one that counts its way there, and its coins
function CombatCard({ task }: { task: CombatTrackView }): JSX.Element {
    const progress = task.progress;
    return (
        <div className={"ui-pq-card ui-pq-" + combatState(task)} role="listitem">
            <span className="ui-pq-icon">
                <ItemIcon objId={COMBAT_ACHIEVEMENTS_OBJ} size={32} />
            </span>
            <span className="ui-pq-body">
                <span className="ui-pq-name">
                    {task.name}
                    <span className="ui-pq-meta">
                        {task.pinned ? `${task.tier} · ${t("ca.pinned")}` : task.tier}
                    </span>
                </span>
                <span className="ui-pq-task">
                    {task.reason
                        ? t("ui.combat_tasks.failed_because", { reason: task.reason })
                        : task.description}
                </span>
                {progress && <Bar label={task.name} done={progress.done} of={progress.of} />}
            </span>
            <span className="ui-pq-progress">
                {task.state === "done"
                    ? t("ui.quest.done")
                    : task.state === "failed"
                      ? t("ui.combat_tasks.failed")
                      : progress
                        ? t("quest.progress", {
                              done: fmtNum(progress.done),
                              total: fmtNum(progress.of),
                          })
                        : ""}
            </span>
            <span className="ui-pq-reward">
                <span className="ui-pq-reward-label">{t("ui.quest.reward")}</span>
                <span className="ui-pq-reward-value">
                    <ItemIcon objId={995} size={22} count={task.coins} />
                    {fmtNum(task.coins)}
                </span>
            </span>
        </div>
    );
}
