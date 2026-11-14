import { useEffect, useRef, useState } from "react";

import { GameClient } from "../client/GameClient";
import { GauntletView, UiSnapshot } from "../client/GameStore";
import { formatTime } from "../client/GameView";
import { characterName, getCharacter } from "../content/characters";
import {
    AWAKENERS_ORB_OBJ,
    BLESSINGS,
    BLESSING_BY_ID,
    BLOOD_KIT_OBJ,
    BLOOD_SOULREAPER_AXE_OBJ,
    CAMP_SECONDS,
    GauntletPoints,
    blessingDescription,
    blessingName,
    gauntletOrderKey,
} from "../content/gauntlet";
import { getMap, mapName } from "../content/maps";
import {
    GauntletRun,
    gauntletClimb,
    gauntletFightId,
    gauntletRetries,
    gauntletSeconds,
} from "../core/gauntlet";
import { SaveData, isGauntletHardOpen } from "../core/save";
import { fmtNum, t } from "../i18n";
import "./Gauntlet.css";
import { ItemIcon } from "./ItemIcon";

// The Forgotten Four's screens (content/gauntlet.ts): its order before the start, the camp between
// fights, the climb on the run's HUD, and its results (a fight won, a fall, the clear).

type Props = { ui: UiSnapshot; client: GameClient };

// The climb as it reads: "×1", "×1.05"
function climbText(index: number): string {
    return "×" + String(Number(gauntletClimb(index).toFixed(2)));
}

// A fight's card: its boss, its adventurer and where it comes in the climb
function FightFace({ fightId, index }: { fightId: string; index: number }): JSX.Element {
    const map = getMap(fightId);
    const character = map.fight && getCharacter(map.fight.character);
    return (
        <>
            <span className="ui-gauntlet-place">{index + 1}</span>
            <ItemIcon objId={map.iconObjId} size={32} />
            <span className="ui-gauntlet-fight-name">{mapName(map)}</span>
            <span className="ui-gauntlet-fight-line">
                {character ? characterName(character) : ""}
            </span>
            <span className="ui-gauntlet-climb">
                {t("ui.gauntlet.climb", { climb: climbText(index) })}
            </span>
        </>
    );
}

// The order screen: the four cards in a row, dragged into order (a mouse, a finger or a pen), or
// moved with their arrows or the arrow keys
export function GauntletScreen({ ui, client }: Props): JSX.Element | null {
    const view = ui.gauntlet;
    const row = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<string | undefined>();
    if (!view) {
        return null;
    }
    const order = view.order;
    const move = (id: string, to: number) => {
        const from = order.indexOf(id);
        if (from === -1 || to < 0 || to >= order.length || to === from) {
            return;
        }
        const next = order.filter((other) => other !== id);
        next.splice(to, 0, id);
        client.setGauntletOrder(next);
    };
    // The place under the pointer: the card whose middle it's nearest, along the row
    const placeAt = (x: number, y: number): number => {
        const cards = [...(row.current?.querySelectorAll<HTMLElement>(".ui-gauntlet-card") ?? [])];
        let best = -1;
        let nearest = Infinity;
        cards.forEach((card, i) => {
            const r = card.getBoundingClientRect();
            const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
            if (d < nearest) {
                nearest = d;
                best = i;
            }
        });
        return best;
    };
    const best = ui.save.gauntlet?.[view.hard ? "hard" : "normal"]?.best[gauntletOrderKey(order)];
    const hardOpen = isGauntletHardOpen(ui.save);
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-gauntlet">
                <h2>{t("ui.gauntlet.title")}</h2>
                <p className="ui-subtle ui-gauntlet-help">{t("ui.gauntlet.order_help")}</p>
                <div
                    ref={row}
                    className="ui-gauntlet-row"
                    role="list"
                    aria-label={t("ui.gauntlet.order_aria")}
                >
                    {order.map((id, i) => (
                        <div
                            key={id}
                            role="listitem"
                            tabIndex={0}
                            className={
                                "ui-card ui-gauntlet-card" +
                                (dragging === id ? " ui-gauntlet-dragging" : "")
                            }
                            aria-label={t("ui.gauntlet.card_aria", {
                                place: i + 1,
                                name: mapName(getMap(id)),
                            })}
                            onKeyDown={(event) => {
                                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                                    event.preventDefault();
                                    move(id, i - 1);
                                } else if (
                                    event.key === "ArrowRight" ||
                                    event.key === "ArrowDown"
                                ) {
                                    event.preventDefault();
                                    move(id, i + 1);
                                }
                            }}
                            onPointerDown={(event) => {
                                if ((event.target as HTMLElement).closest("button")) {
                                    return;
                                }
                                event.currentTarget.setPointerCapture(event.pointerId);
                                setDragging(id);
                            }}
                            onPointerMove={(event) => {
                                if (dragging === id) {
                                    move(id, placeAt(event.clientX, event.clientY));
                                }
                            }}
                            onPointerUp={() => setDragging(undefined)}
                            onPointerCancel={() => setDragging(undefined)}
                        >
                            <FightFace fightId={id} index={i} />
                            <span className="ui-gauntlet-arrows">
                                <button
                                    className="ui-button ui-button-small"
                                    aria-label={t("ui.gauntlet.earlier")}
                                    disabled={i === 0}
                                    onClick={() => move(id, i - 1)}
                                >
                                    ◀
                                </button>
                                <button
                                    className="ui-button ui-button-small"
                                    aria-label={t("ui.gauntlet.later")}
                                    disabled={i === order.length - 1}
                                    onClick={() => move(id, i + 1)}
                                >
                                    ▶
                                </button>
                            </span>
                        </div>
                    ))}
                </div>
                <p className="ui-subtle ui-gauntlet-rules">{t("ui.gauntlet.rules")}</p>
                <p className="ui-gauntlet-record">
                    {best
                        ? t(best.clean ? "ui.gauntlet.best_clean" : "ui.gauntlet.best_retried", {
                              time: formatTime(best.seconds),
                              retries: best.retries,
                          })
                        : t("ui.gauntlet.no_best")}
                </p>
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.leaveGauntlet()}>
                        {t("ui.gauntlet.back")}
                    </button>
                    <button
                        className={"ui-button" + (view.hard ? " ui-toggle-on" : "")}
                        aria-pressed={view.hard}
                        disabled={!hardOpen}
                        title={hardOpen ? undefined : t("ui.gauntlet.hard_locked")}
                        onClick={() => client.setGauntletHard(!view.hard)}
                    >
                        {hardOpen
                            ? t(view.hard ? "ui.gauntlet.hard_on" : "ui.gauntlet.hard_off")
                            : t("ui.gauntlet.hard_locked_short")}
                    </button>
                    <button
                        className="ui-button ui-button-go"
                        onClick={() => client.beginGauntlet()}
                    >
                        {t("ui.gauntlet.start")}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PointsLines({ points }: { points: GauntletPoints }): JSX.Element {
    return (
        <table className="ui-gauntlet-points">
            <tbody>
                {(["clear", "speed", "safe", "guard"] as const).map((part) => (
                    <tr key={part}>
                        <td>{t(`ui.gauntlet.points_${part}`)}</td>
                        <td>{fmtNum(points[part])}</td>
                    </tr>
                ))}
                <tr className="ui-gauntlet-points-total">
                    <td>{t("ui.gauntlet.points_total")}</td>
                    <td>{fmtNum(points.total)}</td>
                </tr>
            </tbody>
        </table>
    );
}

// Seconds left in the camp, ticking
function useCountdown(ends: number | undefined): number {
    const [now, setNow] = useState(() => performance.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(performance.now()), 250);
        return () => window.clearInterval(timer);
    }, []);
    return ends === undefined ? CAMP_SECONDS : Math.max(0, Math.ceil((ends - now) / 1000));
}

// The camp between fights: the last fight's points, the next fight, and a blessing for it
export function CampScreen({ ui, client }: Props): JSX.Element | null {
    const view = ui.gauntlet;
    const run = view?.run;
    const left = useCountdown(view?.campEnds);
    if (!view || !run || run.phase !== "camp") {
        return null;
    }
    const last = run.done[run.done.length - 1];
    const next = gauntletFightId(run);
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-gauntlet ui-camp">
                <h2>
                    {t("ui.gauntlet.camp_title", { n: run.index + 1, total: run.order.length })}
                </h2>
                <div className="ui-camp-body">
                    <div className="ui-camp-side">
                        <span className="ui-gauntlet-heading">
                            {t("ui.gauntlet.camp_won", {
                                name: mapName(getMap(last.fightId)),
                                time: formatTime(last.seconds),
                            })}
                        </span>
                        <PointsLines points={last.points} />
                        <span className="ui-gauntlet-heading">{t("ui.gauntlet.camp_next")}</span>
                        <div className="ui-card ui-gauntlet-card ui-gauntlet-card-static">
                            <FightFace fightId={next} index={run.index} />
                        </div>
                        <span className="ui-gauntlet-wounds">
                            {run.wound > 0
                                ? t("ui.gauntlet.wounds", {
                                      hp: Math.round((1 - run.wound) * 100),
                                  })
                                : t("ui.gauntlet.no_wounds")}
                        </span>
                    </div>
                    <div className="ui-camp-shop">
                        <div className="ui-camp-points">
                            <span>
                                {t("ui.gauntlet.points_left", { points: fmtNum(run.points) })}
                            </span>
                            <span className="ui-camp-timer">
                                {t("ui.gauntlet.camp_left", { seconds: left })}
                            </span>
                        </div>
                        <div
                            className="ui-camp-blessings"
                            role="group"
                            aria-label={t("ui.gauntlet.blessings")}
                        >
                            {BLESSINGS.map((blessing) => {
                                const picked = run.blessing === blessing.id;
                                const refund = run.blessing
                                    ? (BLESSING_BY_ID.get(run.blessing)?.price ?? 0)
                                    : 0;
                                const affordable = run.points + refund >= blessing.price;
                                return (
                                    <button
                                        key={blessing.id}
                                        className={
                                            "ui-card ui-camp-blessing" +
                                            (picked ? " ui-card-selected" : "")
                                        }
                                        aria-pressed={picked}
                                        disabled={!picked && !affordable}
                                        onClick={() =>
                                            client.chooseGauntletBlessing(
                                                picked ? undefined : blessing.id,
                                            )
                                        }
                                    >
                                        <ItemIcon objId={blessing.iconObjId} size={28} />
                                        <span className="ui-camp-blessing-text">
                                            <span className="ui-camp-blessing-name">
                                                {blessingName(blessing)}
                                            </span>
                                            <span className="ui-camp-blessing-line">
                                                {blessingDescription(blessing)}
                                            </span>
                                        </span>
                                        <span className="ui-camp-price">
                                            {fmtNum(blessing.price)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.leaveGauntlet()}>
                        {t("ui.gauntlet.give_up")}
                    </button>
                    <button
                        className="ui-button ui-button-go"
                        onClick={() => client.leaveGauntletCamp()}
                    >
                        {t("ui.gauntlet.ready")}
                    </button>
                </div>
            </div>
        </div>
    );
}

// On the run's HUD: which fight, its climb, the wounds it started with, its blessing
export function GauntletBadge({ run }: { run: GauntletRun }): JSX.Element | null {
    if (run.phase !== "fight") {
        return null;
    }
    const blessing = run.blessing && BLESSING_BY_ID.get(run.blessing);
    return (
        <div className="ui-gauntlet-badge">
            <span>
                {t("ui.gauntlet.badge", {
                    n: run.index + 1,
                    total: run.order.length,
                    climb: climbText(run.index),
                })}
            </span>
            {run.wound > 0 && (
                <span className="ui-gauntlet-badge-wounds">
                    {t("ui.gauntlet.badge_wounds", { hp: Math.round((1 - run.wound) * 100) })}
                </span>
            )}
            {blessing && (
                <span className="ui-gauntlet-badge-blessing">
                    <ItemIcon objId={blessing.iconObjId} size={16} />
                    {blessingName(blessing)}
                </span>
            )}
            {run.tries > 0 && (
                <span className="ui-gauntlet-badge-wounds">
                    {t("ui.gauntlet.badge_retry", { n: run.tries })}
                </span>
            )}
        </div>
    );
}

// The order the run went in, as icons
function OrderIcons({ order }: { order: string[] }): JSX.Element {
    return (
        <span className="ui-gauntlet-order">
            {order.map((id) => (
                <ItemIcon key={id} objId={getMap(id).iconObjId} size={24} />
            ))}
        </span>
    );
}

// A fight's end in the gauntlet, in place of the usual results
export function GauntletResultModal({
    view,
    save,
    client,
}: {
    view: GauntletView;
    save: SaveData;
    client: GameClient;
}): JSX.Element | null {
    const run = view.run;
    if (!run) {
        return null;
    }
    const fight = getMap(gauntletFightId(run));
    if (run.phase === "fallen") {
        return (
            <div className="ui-modal">
                <div className="ui-panel rs-border rs-background ui-gauntlet ui-gauntlet-result">
                    <h2 className="ui-defeat">
                        {t("ui.gauntlet.fallen", {
                            name: mapName(fight),
                            n: run.index + 1,
                            total: run.order.length,
                        })}
                    </h2>
                    <p className="ui-subtle">{t("ui.gauntlet.fallen_help")}</p>
                    <div className="ui-row">
                        <button className="ui-button" onClick={() => client.leaveGauntlet()}>
                            {t("ui.gauntlet.give_up")}
                        </button>
                        <button className="ui-button" onClick={() => client.restartGauntlet()}>
                            {t("ui.gauntlet.start_over")}
                        </button>
                        <button
                            className="ui-button ui-button-go"
                            onClick={() => client.retryGauntletFight()}
                        >
                            {t("ui.gauntlet.retry")}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    if (run.phase === "camp") {
        const last = run.done[run.done.length - 1];
        return (
            <div className="ui-modal">
                <div className="ui-panel rs-border rs-background ui-gauntlet ui-gauntlet-result">
                    <h2 className="ui-victory">
                        {t("ui.gauntlet.won", {
                            name: mapName(getMap(last.fightId)),
                            n: run.index,
                            total: run.order.length,
                        })}
                    </h2>
                    <p className="ui-subtle">
                        {t("ui.gauntlet.won_time", {
                            time: formatTime(last.seconds),
                            total: formatTime(gauntletSeconds(run)),
                        })}
                    </p>
                    <PointsLines points={last.points} />
                    <div className="ui-row">
                        <button className="ui-button" onClick={() => client.leaveGauntlet()}>
                            {t("ui.gauntlet.give_up")}
                        </button>
                        <button
                            className="ui-button ui-button-go"
                            onClick={() => client.toGauntletCamp()}
                        >
                            {t("ui.gauntlet.to_camp")}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    if (run.phase !== "cleared") {
        return null;
    }
    const rewards = view.rewards;
    const retries = gauntletRetries(run);
    const record = save.gauntlet?.[run.hard ? "hard" : "normal"]?.best[gauntletOrderKey(run.order)];
    return (
        <div className="ui-modal">
            <div className="ui-panel rs-border rs-background ui-gauntlet ui-gauntlet-result">
                <h2 className="ui-victory">
                    {t(run.hard ? "ui.gauntlet.cleared_hard" : "ui.gauntlet.cleared")}
                </h2>
                <p className="ui-subtle">
                    {retries === 0
                        ? t("ui.gauntlet.cleared_clean", { time: formatTime(gauntletSeconds(run)) })
                        : t("ui.gauntlet.cleared_retried", {
                              time: formatTime(gauntletSeconds(run)),
                              retries,
                          })}
                </p>
                <table className="ui-gauntlet-points ui-gauntlet-fights">
                    <tbody>
                        {run.done.map((done, i) => (
                            <tr key={done.fightId}>
                                <td>
                                    <ItemIcon objId={getMap(done.fightId).iconObjId} size={20} />
                                </td>
                                <td>{mapName(getMap(done.fightId))}</td>
                                <td>{climbText(i)}</td>
                                <td>{formatTime(done.seconds)}</td>
                                <td>
                                    {done.retries > 0
                                        ? t("ui.gauntlet.fight_retries", { n: done.retries })
                                        : ""}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="ui-gauntlet-record">
                    <OrderIcons order={run.order} />
                    {rewards?.record
                        ? t("ui.gauntlet.new_record")
                        : record &&
                          t(record.clean ? "ui.gauntlet.best_clean" : "ui.gauntlet.best_retried", {
                              time: formatTime(record.seconds),
                              retries: record.retries,
                          })}
                </p>
                {rewards && (rewards.orbs > 0 || rewards.looks || rewards.hardOpened) && (
                    <div className="ui-gauntlet-rewards">
                        <span className="ui-gauntlet-heading">{t("ui.gauntlet.rewards")}</span>
                        {rewards.orbs > 0 && (
                            <span className="ui-gauntlet-reward">
                                <ItemIcon
                                    objId={AWAKENERS_ORB_OBJ}
                                    size={28}
                                    count={rewards.orbs}
                                />
                                {t("ui.gauntlet.reward_orbs", { n: rewards.orbs })}
                            </span>
                        )}
                        {rewards.looks && (
                            <>
                                <span className="ui-gauntlet-reward">
                                    <ItemIcon objId={BLOOD_KIT_OBJ} size={28} />
                                    <ItemIcon objId={BLOOD_SOULREAPER_AXE_OBJ} size={28} />
                                    {t("ui.gauntlet.reward_looks")}
                                </span>
                                <span className="ui-gauntlet-reward">
                                    <span className="ui-gauntlet-gold-swatch" />
                                    {t("ui.gauntlet.reward_border")}
                                </span>
                            </>
                        )}
                        {rewards.hardOpened && (
                            <span className="ui-gauntlet-reward">
                                {t("ui.gauntlet.reward_hard")}
                            </span>
                        )}
                    </div>
                )}
                {retries > 0 && !save.gauntlet?.normal?.cleanClears && (
                    <p className="ui-subtle">{t("ui.gauntlet.clean_for_reward")}</p>
                )}
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.restartGauntlet()}>
                        {t("ui.gauntlet.again")}
                    </button>
                    <button
                        className="ui-button ui-button-go"
                        onClick={() => client.leaveGauntlet()}
                    >
                        {t("ui.gauntlet.done")}
                    </button>
                </div>
            </div>
        </div>
    );
}
