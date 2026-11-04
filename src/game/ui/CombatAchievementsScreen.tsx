import { useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import {
    COMBAT_TASKS,
    COMBAT_TASK_TYPES,
    COMBAT_TIERS,
    getCombatPoints,
    getTaskTier,
    getTierThresholds,
} from "../content/combatTasks";
import { getMap } from "../content/maps";
import { TROPHIES } from "../content/trophies";
import { CombatTaskDef, CombatTaskType, CombatTier } from "../content/types";
import { SaveData, getCombatProgress, isMapUnlocked } from "../core/save";
import { Coins } from "./Coins";
import "./CombatAchievementsScreen.css";
import { ItemIcon } from "./ItemIcon";

// Combat Achievements, after the client's own interface: points and the next tier's reward at the
// top, an overview of the six tiers, and every task with filters. Solo runs only.

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
            !(hideDone && save.combatTasks.includes(t.id)),
    );
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-ca">
                <h2>Combat Achievements</h2>
                <div className="ui-ca-header">
                    <span>
                        Points <span className="ui-ca-value">{points}</span>
                    </span>
                    <span>
                        Tier <span className="ui-ca-value">{current?.name ?? "None"}</span>
                    </span>
                    <span className="ui-ca-next">
                        {next ? (
                            <Bar
                                done={points - from}
                                of={thresholds[next.id] - from}
                                label={`${points} / ${thresholds[next.id]} for ${next.name}`}
                            />
                        ) : (
                            "Every tier's reward is yours!"
                        )}
                    </span>
                </div>
                <div className="ui-log-tabs">
                    <button
                        className={"ui-log-tab" + (tab === "overview" ? " ui-log-selected" : "")}
                        onClick={() => setTab("overview")}
                    >
                        Overview
                    </button>
                    <button
                        className={"ui-log-tab" + (tab === "tasks" ? " ui-log-selected" : "")}
                        onClick={() => setTab("tasks")}
                    >
                        Tasks
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
                                    onClick={() => setTier(id)}
                                >
                                    {id === "all" ? "All" : getTierName(id)}
                                </button>
                            ))}
                            <button
                                className="ui-log-tab ui-ca-filter"
                                onClick={() => setType((type + 1) % TYPES.length)}
                            >
                                Type: {shownType === "all" ? "All" : COMBAT_TASK_TYPES[shownType]}
                            </button>
                            <button
                                className="ui-log-tab ui-ca-filter"
                                onClick={() => setPlace((place + 1) % PLACES.length)}
                            >
                                Where: {describePlace(shownPlace)}
                            </button>
                            <button
                                className={
                                    "ui-log-tab ui-ca-filter" + (hideDone ? " ui-log-selected" : "")
                                }
                                onClick={() => setHideDone(!hideDone)}
                            >
                                Hide completed
                            </button>
                        </div>
                        <div className="ui-ca-list">
                            {tasks.map((task) => (
                                <TaskRow key={task.id} save={save} task={task} />
                            ))}
                            {tasks.length === 0 && (
                                <p className="ui-subtle">No tasks match those filters.</p>
                            )}
                        </div>
                    </>
                )}
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        Back
                    </button>
                    <span className="ui-ca-count">
                        Completed {save.combatTasks.length} / {COMBAT_TASKS.length}
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
    thresholds: Record<CombatTier, number>;
    points: number;
}): JSX.Element {
    return (
        <div className="ui-ca-list">
            <p className="ui-subtle">
                Challenges for solo runs: each pays its coins once, when the run it's done in ends.
                Points earn each tier's reward for the Collection log. Co-op runs don't count.
            </p>
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
                        <span className="ui-ca-tier-name">{tier.name}</span>
                        <Bar done={done} of={all.length} label={`${done} / ${all.length} tasks`} />
                        <span className="ui-ca-tier-reward">
                            {earned
                                ? `${hilt.name}: yours`
                                : `${hilt?.name ?? "Reward"} at ${thresholds[tier.id]} points ` +
                                  `(${Math.max(0, thresholds[tier.id] - points)} to go)`}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function TaskRow({ save, task }: { save: SaveData; task: CombatTaskDef }): JSX.Element {
    const done = save.combatTasks.includes(task.id);
    const progress = done ? undefined : getCombatProgress(save, task);
    const state = done ? "done" : progress && progress.done > 0 ? "started" : "new";
    const tier = getTaskTier(task);
    const locked = task.mapId !== undefined && !isMapUnlocked(save, task.mapId);
    return (
        <div className={"ui-ca-task ui-ca-task-" + state + (locked ? " ui-ca-locked" : "")}>
            <span className={"ui-ca-task-tier ui-ca-tier-" + task.tier}>{tier.name}</span>
            <span className="ui-ca-task-text">
                <span className="ui-ca-task-name">{task.name}</span>
                <span className="ui-ca-task-description">
                    {task.description}
                    {task.mapId && (
                        <span className="ui-ca-task-where">
                            {` (${describePlace(task.mapId)}${locked ? ", not open yet" : ""})`}
                        </span>
                    )}
                </span>
            </span>
            <span className="ui-ca-task-type">{COMBAT_TASK_TYPES[task.type]}</span>
            <span className="ui-ca-task-state">
                {done
                    ? "Done"
                    : progress
                      ? `${progress.done.toLocaleString()} / ${progress.of.toLocaleString()}`
                      : ""}
            </span>
            <span className="ui-ca-task-points">
                {tier.points} pt{tier.points === 1 ? "" : "s"}
            </span>
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

function getTierName(id: CombatTier): string {
    return COMBAT_TIERS.find((t) => t.id === id)!.name;
}

function describePlace(place: string | undefined): string {
    return place === undefined ? "All" : place === "" ? "All over" : getMap(place).name;
}
