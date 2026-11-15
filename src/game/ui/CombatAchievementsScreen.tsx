import { useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import {
    COMBAT_TASKS,
    COMBAT_TASK_TYPES,
    COMBAT_TIERS,
    MAX_COMBAT_PINS,
    combatTaskDescription,
    combatTaskName,
    combatTierName,
    combatTypeName,
    getCombatPoints,
    getTaskTier,
    getTierThresholds,
} from "../content/combatTasks";
import { getMap, mapName } from "../content/maps";
import { TROPHIES, trophyName } from "../content/trophies";
import { CombatTaskDef, CombatTaskType, CombatTier } from "../content/types";
import { SaveData, getCombatProgress, isMapUnlocked } from "../core/save";
import { fmtNum, t, tp } from "../i18n";
import { Coins } from "./Coins";
import "./CombatAchievementsScreen.css";
import { ItemIcon } from "./ItemIcon";
import { useMenuKeys } from "./menuKeys";

// Combat Achievements, after the client's own interface: points and the next tier's reward at the
// top, an overview of the six tiers, and every task with filters. Solo runs only. A task still to
// do can be pinned, for a row on the run's HUD and a word when it's spoilt.

type Props = { ui: UiSnapshot; client: GameClient };

// The filters' choices, each button stepping to the next (a pad's buttons can work them)
const TYPES: (CombatTaskType | "all")[] = [
    "all",
    ...(Object.keys(COMBAT_TASK_TYPES) as CombatTaskType[]),
];
// "" for the tasks done all over
const PLACES: (string | undefined)[] = [
    undefined,
    "",
    ...new Set(COMBAT_TASKS.flatMap((t) => (t.mapId ? [t.mapId] : []))),
];

const HILTS = new Map(
    TROPHIES.flatMap((t) => (t.from.kind === "combatTier" ? [[t.from.tier, t] as const] : [])),
);

export function CombatAchievementsScreen({ ui, client }: Props): JSX.Element {
    const save = ui.save;
    const [tab, setTab] = useState<"overview" | "tasks">("overview");
    const [tier, setTier] = useState<CombatTier | "all">("all");
    const [type, setType] = useState(0);
    const [place, setPlace] = useState(0);
    const [hideDone, setHideDone] = useState(false);
    const [onlyPinned, setOnlyPinned] = useState(false);
    useMenuKeys({ onBack: () => client.showScreen("title") });
    const pinned = save.combatPinned ?? [];
    const points = getCombatPoints(save.combatTasks);
    const thresholds = getTierThresholds();
    const reached = COMBAT_TIERS.filter((t) => points >= thresholds[t.id]);
    const current = reached[reached.length - 1];
    const next = COMBAT_TIERS.find((t) => points < thresholds[t.id]);
    const from = current ? thresholds[current.id] : 0;
    const shownType = TYPES[type];
    const shownPlace = PLACES[place];
    const tasks = COMBAT_TASKS.filter(
        (t) =>
            (tier === "all" || t.tier === tier) &&
            (shownType === "all" || t.type === shownType) &&
            (shownPlace === undefined || (t.mapId ?? "") === shownPlace) &&
            !(hideDone && save.combatTasks.includes(t.id)) &&
            !(onlyPinned && !pinned.includes(t.id)),
    );
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-ca">
                <h2>{t("ca.title")}</h2>
                <div className="ui-ca-header">
                    <span>
                        {t("ca.points")} <span className="ui-ca-value">{fmtNum(points)}</span>
                    </span>
                    <span>
                        {t("ca.tier")}{" "}
                        <span className="ui-ca-value">
                            {current ? combatTierName(current.id) : t("ca.tier_none")}
                        </span>
                    </span>
                    <span className="ui-ca-next">
                        {next ? (
                            <Bar
                                done={points - from}
                                of={thresholds[next.id] - from}
                                label={t("ca.next_tier", {
                                    points: fmtNum(points),
                                    needed: fmtNum(thresholds[next.id]),
                                    tier: combatTierName(next.id),
                                })}
                            />
                        ) : (
                            t("ca.every_tier")
                        )}
                    </span>
                </div>
                <div className="ui-log-tabs">
                    <button
                        className={"ui-log-tab" + (tab === "overview" ? " ui-log-selected" : "")}
                        aria-pressed={tab === "overview"}
                        onClick={() => setTab("overview")}
                    >
                        {t("ca.tab.overview")}
                    </button>
                    <button
                        className={"ui-log-tab" + (tab === "tasks" ? " ui-log-selected" : "")}
                        aria-pressed={tab === "tasks"}
                        onClick={() => setTab("tasks")}
                    >
                        {t("ca.tab.tasks")}
                    </button>
                </div>
                {tab === "overview" ? (
                    <Overview save={save} thresholds={thresholds} points={points} />
                ) : (
                    <>
                        <div className="ui-ca-filters">
                            {(["all", ...COMBAT_TIERS.map((t) => t.id)] as const).map((id) => (
                                <button
                                    key={id}
                                    className={
                                        "ui-log-tab ui-ca-filter" +
                                        (tier === id ? " ui-log-selected" : "")
                                    }
                                    aria-pressed={tier === id}
                                    onClick={() => setTier(id)}
                                >
                                    {id === "all" ? t("ca.filter.all") : combatTierName(id)}
                                </button>
                            ))}
                            <button
                                className="ui-log-tab ui-ca-filter"
                                onClick={() => setType((type + 1) % TYPES.length)}
                            >
                                {t("ca.filter.type", {
                                    type:
                                        shownType === "all"
                                            ? t("ca.filter.all")
                                            : combatTypeName(shownType),
                                })}
                            </button>
                            <button
                                className="ui-log-tab ui-ca-filter"
                                onClick={() => setPlace((place + 1) % PLACES.length)}
                            >
                                {t("ca.filter.where", { place: describePlace(shownPlace) })}
                            </button>
                            <button
                                className={
                                    "ui-log-tab ui-ca-filter" + (hideDone ? " ui-log-selected" : "")
                                }
                                aria-pressed={hideDone}
                                onClick={() => setHideDone(!hideDone)}
                            >
                                {t("ca.filter.hide_done")}
                            </button>
                            <button
                                className={
                                    "ui-log-tab ui-ca-filter" +
                                    (onlyPinned ? " ui-log-selected" : "")
                                }
                                aria-pressed={onlyPinned}
                                onClick={() => setOnlyPinned(!onlyPinned)}
                            >
                                {t("ca.filter.pinned", {
                                    n: fmtNum(pinned.length),
                                    max: fmtNum(MAX_COMBAT_PINS),
                                })}
                            </button>
                        </div>
                        <div className="ui-ca-list">
                            {tasks.map((task) => (
                                <TaskRow
                                    key={task.id}
                                    save={save}
                                    task={task}
                                    onPin={() => client.toggleCombatPin(task.id)}
                                />
                            ))}
                            {tasks.length === 0 && (
                                <p className="ui-subtle">{t("ca.none_match")}</p>
                            )}
                        </div>
                    </>
                )}
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        {t("canvas.back")}
                    </button>
                    <span className="ui-ca-count">
                        {t("ca.completed", {
                            done: fmtNum(save.combatTasks.length),
                            total: fmtNum(COMBAT_TASKS.length),
                        })}
                    </span>
                    <Coins amount={save.coins} />
                </div>
            </div>
        </div>
    );
}

function Overview({
    save,
    thresholds,
    points,
}: {
    save: SaveData;
    thresholds: Readonly<Record<CombatTier, number>>;
    points: number;
}): JSX.Element {
    return (
        <div className="ui-ca-list">
            <p className="ui-subtle">{t("ca.intro")}</p>
            {COMBAT_TIERS.map((tier) => {
                const all = COMBAT_TASKS.filter((t) => t.tier === tier.id);
                const done = all.filter((t) => save.combatTasks.includes(t.id)).length;
                const hilt = HILTS.get(tier.id);
                const earned = hilt !== undefined && save.trophies.includes(hilt.id);
                return (
                    <div key={tier.id} className={"ui-ca-tier ui-ca-tier-" + tier.id}>
                        <span className="ui-ca-tier-icon">
                            {hilt && (
                                <span className={earned ? "" : "ui-ca-unearned"}>
                                    <ItemIcon objId={hilt.objId} size={30} />
                                </span>
                            )}
                        </span>
                        <span className="ui-ca-tier-name">{combatTierName(tier.id)}</span>
                        <Bar
                            done={done}
                            of={all.length}
                            label={t("ca.tier_tasks", {
                                done: fmtNum(done),
                                total: fmtNum(all.length),
                            })}
                        />
                        <span className="ui-ca-tier-reward">
                            {earned
                                ? t("ca.reward_yours", { name: trophyName(hilt) })
                                : t("ca.reward_at", {
                                      name: hilt ? trophyName(hilt) : t("ca.reward"),
                                      points: fmtNum(thresholds[tier.id]),
                                      left: fmtNum(Math.max(0, thresholds[tier.id] - points)),
                                  })}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function TaskRow({
    save,
    task,
    onPin,
}: {
    save: SaveData;
    task: CombatTaskDef;
    onPin: () => void;
}): JSX.Element {
    const done = save.combatTasks.includes(task.id);
    const pins = save.combatPinned ?? [];
    const pinned = pins.includes(task.id);
    const full = !pinned && pins.length >= MAX_COMBAT_PINS;
    const progress = done ? undefined : getCombatProgress(save, task);
    const state = done ? "done" : progress && progress.done > 0 ? "started" : "new";
    const tier = getTaskTier(task);
    const locked = task.mapId !== undefined && !isMapUnlocked(save, task.mapId);
    return (
        <div className={"ui-ca-task ui-ca-task-" + state + (locked ? " ui-ca-locked" : "")}>
            <span className={"ui-ca-task-tier ui-ca-tier-" + task.tier}>
                {combatTierName(task.tier)}
            </span>
            <span className="ui-ca-task-text">
                <span className="ui-ca-task-name">{combatTaskName(task)}</span>
                <span className="ui-ca-task-description">
                    {combatTaskDescription(task)}
                    {task.mapId && (
                        <span className="ui-ca-task-where">
                            {" "}
                            {t(locked ? "ca.where_locked" : "ca.where", {
                                place: describePlace(task.mapId),
                            })}
                        </span>
                    )}
                </span>
            </span>
            <span className="ui-ca-task-type">{combatTypeName(task.type)}</span>
            <span className="ui-ca-task-state">
                {done
                    ? t("quest.done")
                    : progress
                      ? t("quest.progress", {
                            done: fmtNum(progress.done),
                            total: fmtNum(progress.of),
                        })
                      : ""}
            </span>
            <span className="ui-ca-task-points">{tp("ca.task_points", tier.points)}</span>
            {done ? (
                <span />
            ) : (
                <button
                    className={"ui-log-tab ui-ca-pin" + (pinned ? " ui-log-selected" : "")}
                    disabled={full}
                    title={
                        pinned
                            ? t("ca.unpin_tooltip")
                            : full
                              ? t("ca.pins_full", { max: fmtNum(MAX_COMBAT_PINS) })
                              : t("ca.pin_tooltip")
                    }
                    aria-pressed={pinned}
                    onClick={onPin}
                >
                    {pinned ? t("ca.pinned") : t("ca.pin")}
                </button>
            )}
        </div>
    );
}

function Bar({ done, of, label }: { done: number; of: number; label: string }): JSX.Element {
    const fraction = of > 0 ? Math.min(1, done / of) : 1;
    return (
        <span className="ui-ca-bar">
            <span className="ui-ca-bar-fill" style={{ width: `${fraction * 100}%` }} />
            <span className="ui-ca-bar-text">{label}</span>
        </span>
    );
}

function describePlace(place: string | undefined): string {
    return place === undefined
        ? t("ca.filter.all")
        : place === ""
          ? t("ca.all_over")
          : mapName(getMap(place));
}
