import type { PlayerResultView } from "../client/GameStore";
import { t, tl } from "../i18n";
import { Big } from "./results/shared";

export function PlayerStatsNav({
    players,
    playerIndex,
    changePlayer,
}: {
    players: PlayerResultView[];
    playerIndex: number;
    changePlayer: (direction: number) => void;
}): JSX.Element {
    const player = players[playerIndex];
    return (
        <div
            className="ui-result-player-nav"
            role="group"
            aria-label={t("ui.result.player_nav_aria")}
        >
            <button
                className="ui-button ui-result-arrow"
                aria-label={t("ui.result.prev_player_aria")}
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
                    {player.left ? t("ui.result.left_run") : player.down ? t("ui.result.down") : ""}
                </div>
            </div>
            <button
                className="ui-button ui-result-arrow"
                aria-label={t("ui.result.next_player_aria")}
                onClick={() => changePlayer(1)}
            >
                <span className="ui-result-arrow-right" aria-hidden="true" />
            </button>
        </div>
    );
}

export function PlayerStatsTable({ player }: { player: PlayerResultView }): JSX.Element {
    return (
        <table className="ui-result-table" aria-label={t("ui.result.individual_stats")}>
            <tbody>
                <tr>
                    <td>{t("ui.result.stat.adventurer")}</td>
                    <td>{tl(player.characterName)}</td>
                </tr>
                {(
                    [
                        ["ui.result.stat.kills", player.kills],
                        ["ui.result.stat.damage_dealt", player.damageDealt],
                        ["ui.result.stat.biggest_hit", player.highestHit],
                        ["ui.result.stat.damage_taken", player.damageTaken],
                        ["ui.result.stat.healed", player.healed],
                    ] as const
                ).map(([label, value]) => (
                    <tr key={label}>
                        <td>{t(label)}</td>
                        <td>
                            <Big value={value} />
                        </td>
                    </tr>
                ))}
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
    );
}
