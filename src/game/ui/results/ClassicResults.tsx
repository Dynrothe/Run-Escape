import { useCallback, useEffect, useState } from "react";

import { formatTime } from "../../content/format";
import { getMap } from "../../content/maps";
import { RELIC_BY_ID, relicName } from "../../content/relics";
import { RESULT_TAB_SPRITES } from "../../content/titleIcons";
import { list, t, tl } from "../../i18n";
import { Coins } from "../Coins";
import { CombatBreakdown } from "../CombatBreakdown";
import { Platinum } from "../Platinum";
import { TabBar } from "../TabBar";
import { useMenuKeys } from "../menuKeys";
import { useDialog } from "../useDialog";
import {
    Big,
    RESULT_KEY_GUARD_MS,
    ResultButtons,
    ResultNotices,
    ScreenProps,
    stageVictoryText,
} from "./shared";

type ResultTab = "summary" | "combat";

// The results as a panel of tables: the page of each player, the run's totals and
// the damage breakdown
export function ClassicResults({ ui, client }: ScreenProps): JSX.Element {
    const result = ui.result;
    const victory = ui.overlay === "victory";
    const players = result?.players ?? [];
    // Your own page first (the modal is mounted afresh for each run's result)
    const [playerIndex, setPlayerIndex] = useState(() =>
        Math.max(
            0,
            players.findIndex((player) => player.isLocal),
        ),
    );
    const player = players[playerIndex];
    // Summary or Combat, kept as you go from one player's page to the next
    const [tab, setTab] = useState<ResultTab>("summary");
    const multiplayer = players.length > 1;
    const changePlayer = useCallback(
        (direction: number) =>
            setPlayerIndex((current) => (current + direction + players.length) % players.length),
        [players.length],
    );
    useEffect(() => {
        if (!multiplayer) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target;
            if (
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                (target instanceof HTMLElement &&
                    (target.isContentEditable || target.closest("input, textarea, select")))
            )
                return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                if (!event.repeat) changePlayer(event.key === "ArrowLeft" ? -1 : 1);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [changePlayer, multiplayer]);
    useMenuKeys({
        onBack: () => client.leaveRun(),
        onConfirm: () => (result?.coop ? client.leaveRun() : client.retry()),
        // Esc is the pause key: a run can end just as it's pressed
        guardMs: RESULT_KEY_GUARD_MS,
    });
    const { titleId, dialogProps } = useDialog<HTMLDivElement>();
    return (
        <div className="ui-modal">
            <div {...dialogProps} className="ui-panel rs-border rs-background ui-result">
                <h2 id={titleId} className={victory ? "ui-victory" : "ui-defeat"}>
                    {victory && result
                        ? tl(stageVictoryText(getMap(result.mapId), result.stage))
                        : (result?.endedEarly ?? t("ui.result.dead"))}
                </h2>
                <ResultNotices ui={ui} />
                {multiplayer && player && (
                    <div
                        className="ui-result-player-nav"
                        role="group"
                        aria-label={t("ui.result.player_nav_aria")}
                    >
                        <button
                            className="ui-button ui-result-arrow"
                            aria-label={t("ui.result.prev_player_aria")}
                            title={t("ui.result.prev_player_title")}
                            onClick={() => changePlayer(-1)}
                        >
                            <span className="ui-result-arrow-left" aria-hidden="true" />
                        </button>
                        <div className="ui-result-player" aria-live="polite" aria-atomic="true">
                            <div className="ui-result-player-name">
                                {player.name}
                                {player.isLocal && t("ui.result.you")}
                            </div>
                            <div className="ui-result-player-detail">
                                {t("ui.result.player_index", {
                                    current: playerIndex + 1,
                                    total: players.length,
                                })}
                                {player.left
                                    ? t("ui.result.left_run")
                                    : player.down
                                      ? t("ui.result.down")
                                      : ""}
                            </div>
                        </div>
                        <button
                            className="ui-button ui-result-arrow"
                            aria-label={t("ui.result.next_player_aria")}
                            title={t("ui.result.next_player_title")}
                            onClick={() => changePlayer(1)}
                        >
                            <span className="ui-result-arrow-right" aria-hidden="true" />
                        </button>
                    </div>
                )}
                {result && player && (
                    <>
                        <TabBar
                            tabs={[
                                {
                                    id: "summary",
                                    name: t("ui.result.tab.summary"),
                                    spriteId: RESULT_TAB_SPRITES.summary,
                                },
                                {
                                    id: "combat",
                                    name: t("ui.result.tab.combat"),
                                    spriteId: RESULT_TAB_SPRITES.combat,
                                },
                            ]}
                            open={tab}
                            onOpen={setTab}
                            idPrefix="result"
                            label={t("ui.result.tabs_aria")}
                        />
                        <div
                            className="ui-result-page"
                            id={`result-page-${tab}`}
                            role="tabpanel"
                            aria-labelledby={`result-tab-${tab}`}
                        >
                            {tab === "summary" ? (
                                <div className="ui-result-columns">
                                    <div className="ui-result-column">
                                        {multiplayer && (
                                            <h3 className="ui-pause-heading">
                                                {t("ui.result.individual_stats")}
                                            </h3>
                                        )}
                                        <table
                                            className="ui-result-table"
                                            aria-label={t("ui.result.individual_stats")}
                                        >
                                            <tbody>
                                                <tr>
                                                    <td>{t("ui.result.stat.adventurer")}</td>
                                                    <td>{tl(player.characterName)}</td>
                                                </tr>
                                                <tr>
                                                    <td>{t("ui.result.stat.kills")}</td>
                                                    <td>
                                                        <Big value={player.kills} />
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>{t("ui.result.stat.damage_dealt")}</td>
                                                    <td>
                                                        <Big value={player.damageDealt} />
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>{t("ui.result.stat.biggest_hit")}</td>
                                                    <td>
                                                        <Big value={player.highestHit} />
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>{t("ui.result.stat.damage_taken")}</td>
                                                    <td>
                                                        <Big value={player.damageTaken} />
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>{t("ui.result.stat.healed")}</td>
                                                    <td>
                                                        <Big value={player.healed} />
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>{t("ui.result.stat.caskets")}</td>
                                                    <td>{player.caskets}</td>
                                                </tr>
                                                {(player.rerollsUsed > 0 || player.skips > 0) && (
                                                    <tr>
                                                        <td>{t("ui.result.stat.rerolls_skips")}</td>
                                                        <td>
                                                            {player.rerollsUsed} / {player.skips}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="ui-result-column">
                                        <h3 className="ui-pause-heading">
                                            {multiplayer
                                                ? t("ui.result.party_totals")
                                                : t("ui.result.run_totals")}
                                        </h3>
                                        <table
                                            className="ui-result-table"
                                            aria-label={
                                                multiplayer
                                                    ? t("ui.result.party_totals_aria")
                                                    : t("ui.result.run_totals")
                                            }
                                        >
                                            <tbody>
                                                {result.hard && (
                                                    <tr>
                                                        <td>{t("ui.result.stat.difficulty")}</td>
                                                        <td>
                                                            {result.expert
                                                                ? t("ui.expert.name")
                                                                : t("ui.hard.name")}
                                                        </td>
                                                    </tr>
                                                )}
                                                {result.points !== undefined && (
                                                    <tr>
                                                        <td>{t("ui.result.stat.invocations")}</td>
                                                        <td>
                                                            {t("ui.invocations.points", {
                                                                points: result.points,
                                                            })}
                                                        </td>
                                                    </tr>
                                                )}
                                                {result.relics && (
                                                    <tr>
                                                        <td>{t("ui.result.stat.relics")}</td>
                                                        <td>
                                                            {list(
                                                                result.relics.flatMap((id) => {
                                                                    const relic =
                                                                        RELIC_BY_ID.get(id);
                                                                    return relic
                                                                        ? [relicName(relic)]
                                                                        : [];
                                                                }),
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                                {result.endless && (
                                                    <tr>
                                                        <td>{t("ui.result.stat.endless_round")}</td>
                                                        <td>{result.round}</td>
                                                    </tr>
                                                )}
                                                <tr>
                                                    <td>{t("ui.result.stat.run_time")}</td>
                                                    <td>{formatTime(result.seconds)}</td>
                                                </tr>
                                                <tr>
                                                    <td>{t("ui.result.stat.level")}</td>
                                                    <td>{result.level}</td>
                                                </tr>
                                                {multiplayer && (
                                                    <>
                                                        <tr>
                                                            <td>{t("ui.result.stat.kills")}</td>
                                                            <td>
                                                                <Big value={result.kills} />
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td>
                                                                {t("ui.result.stat.damage_dealt")}
                                                            </td>
                                                            <td>
                                                                <Big
                                                                    value={players.reduce(
                                                                        (total, entry) =>
                                                                            total +
                                                                            entry.damageDealt,
                                                                        0,
                                                                    )}
                                                                />
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td>{t("ui.result.stat.caskets")}</td>
                                                            <td>{result.caskets}</td>
                                                        </tr>
                                                    </>
                                                )}
                                                <tr>
                                                    <td>{t("ui.result.stat.coins_banked")}</td>
                                                    <td>
                                                        <Coins amount={result.coins} />
                                                    </td>
                                                </tr>
                                                {/* What card packs are bought with (content/cards.ts) */}
                                                <tr>
                                                    <td>{t("ui.result.stat.platinum")}</td>
                                                    <td>
                                                        <Platinum amount={result.platinum ?? 0} />
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        {result.bossKills.length > 0 && (
                                            <>
                                                <h3 className="ui-pause-heading">
                                                    {multiplayer
                                                        ? t("ui.result.party_bosses")
                                                        : t("ui.result.bosses")}
                                                </h3>
                                                <table className="ui-result-table">
                                                    <tbody>
                                                        {result.bossKills.map((boss, i) => (
                                                            <tr key={i}>
                                                                <td>{tl(boss.name)}</td>
                                                                <td>{formatTime(boss.seconds)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <CombatBreakdown
                                    kinds={player.kinds}
                                    sources={player.damage}
                                    kills={player.killsByEnemy}
                                />
                            )}
                        </div>
                    </>
                )}
                <ResultButtons ui={ui} client={client} />
            </div>
        </div>
    );
}
