import type { GameClient } from "../../client/GameClient";
import type { UiSnapshot } from "../../client/GameStore";
import { formatTime } from "../../client/GameView";
import { invaderName } from "../../content/invasions";
import {
    INVOCATION_BY_ID,
    RAID_BAND_SPRITES,
    getRaidBand,
    invocationName,
} from "../../content/invocations";
import { getMap, mapName } from "../../content/maps";
import { TROPHY_BY_ID, trophyName } from "../../content/trophies";
import type { MapDef } from "../../content/types";
import { parseWeekKey } from "../../content/vault";
import type { RaidChest, TombsSummary } from "../../core/Sim";
import { fmtNum, list, t, tl, tp } from "../../i18n";
import { Coins } from "../Coins";
import { ItemIcon } from "../ItemIcon";
import { KeyHint } from "../PadHint";
import { Platinum } from "../Platinum";
import { formatCompact } from "../formatCompact";

export type ScreenProps = { ui: UiSnapshot; client: GameClient };

// Co-op's results name everyone else
export const MAX_LISTED_TEAMMATES = 3;

// How long the results ignore Escape and Enter after they come up
export const RESULT_KEY_GUARD_MS = 600;

// "Coif, Rune boots and Seers ring", or the first few "and 5 more"
export function listNames(names: string[], most = 3): string {
    if (names.length === 0) {
        return "";
    }
    if (names.length === 1) {
        return names[0];
    }
    const shown = names.length > most ? names.slice(0, most - 1) : names;
    if (names.length > most) {
        const rest = tp("ui.result.and_more", names.length - shown.length);
        return list([...shown, rest]);
    }
    return list(names);
}

// Damage a second, with a decimal while it's small
export function formatPerSecond(perSecond: number): string {
    return perSecond < 100_000
        ? perSecond.toLocaleString(undefined, { maximumFractionDigits: perSecond < 10 ? 1 : 0 })
        : formatBig(perSecond);
}

// Big numbers the way OSRS shows a stack: in full up to 99,999, then 100K,
// then 10M, so an endless run's totals still fit. Past what a stack can hold
// (10,000M), the damage panel's short form: 12B, 4.6Qa.
export function formatBig(value: number): string {
    const n = Math.round(value);
    if (n < 100_000) {
        return n.toLocaleString();
    }
    if (n < 10_000_000) {
        return `${Math.floor(n / 1000).toLocaleString()}K`;
    }
    if (n < 10_000_000_000) {
        return `${Math.floor(n / 1_000_000).toLocaleString()}M`;
    }
    return formatCompact(n);
}

// A stat's number, shortened when it's big, in full when pointed at
export function Big({ value }: { value: number }): JSX.Element {
    const n = Math.round(value);
    return <span title={n >= 100_000 ? n.toLocaleString() : undefined}>{formatBig(n)}</span>;
}

// The chest at the end of a raid: what it was rolled with, and what came out
export function RaidChestView({ chest }: { chest: RaidChest }): JSX.Element {
    const found = chest.found.map((id) => TROPHY_BY_ID.get(id)!).filter(Boolean);
    // The Tombs' pet, Thread and jewels aren't purples
    const purple = found.some((t) => t.from.kind !== "tombs" || t.from.weight !== undefined);
    return (
        <div className="ui-raid-chest">
            <div className="ui-raid-chest-title">
                {purple ? t("ui.raid.chest.purple") : t("ui.raid.chest.regular")}
            </div>
            <div className="ui-subtle">
                {/* No purple left to find: no chance to show (a roll of its own can still give
                    something, the Tombs' jewels or expert's looks) */}
                {t(
                    chest.level !== undefined
                        ? chest.purpleLeft
                            ? "ui.raid.chest.points_level"
                            : "ui.raid.chest.points_level_none"
                        : chest.purpleLeft
                          ? "ui.raid.chest.points"
                          : "ui.raid.chest.points_none",
                    {
                        points: fmtNum(chest.points),
                        level: chest.level ?? 0,
                        chance: Math.round(chest.chance * 100),
                    },
                )}
            </div>
            {found.length > 0 ? (
                <div className="ui-raid-chest-items">
                    {found.map((trophy) => (
                        <span key={trophy.id} className="ui-raid-chest-item">
                            <ItemIcon objId={trophy.objId} size={36} />
                            {trophyName(trophy)}
                        </span>
                    ))}
                </div>
            ) : (
                <div className="ui-subtle">{t("ui.raid.chest.no_unique")}</div>
            )}
        </div>
    );
}

// The Tombs of Amascut's board at the end, as OSRS's raid summary has it: the raid level and the
// invocations that made it, each path's time and the Wardens', and the party's points and deaths
export function TombsBoardView({ tombs }: { tombs: TombsSummary }): JSX.Element {
    const band = getRaidBand(tombs.level);
    const total =
        tombs.paths.reduce((sum, path) => sum + path.seconds, 0) + (tombs.wardensSeconds ?? 0);
    const party = tombs.party.reduce((sum, player) => sum + player.points, 0);
    return (
        <div className="ui-tombs-board">
            <div className="ui-tombs-board-level">
                <ItemIcon objId={-1} spriteId={RAID_BAND_SPRITES[band]} size={32} />
                <span>
                    {t("ui.invocations.raid_level_band", {
                        level: tombs.level,
                        band: t(`ui.invocations.band.${band.toLowerCase()}`),
                    })}
                </span>
            </div>
            {tombs.invocations.length > 0 && (
                <div className="ui-tombs-board-invocations" aria-label={t("ui.invocations.title")}>
                    {tombs.invocations.map((id) => {
                        const invocation = INVOCATION_BY_ID.get(id);
                        return invocation ? (
                            <span key={id} title={invocationName(invocation)}>
                                <ItemIcon objId={-1} spriteId={invocation.icon} size={24} />
                            </span>
                        ) : null;
                    })}
                </div>
            )}
            <div className="ui-tombs-board-columns">
                <table className="ui-tombs-board-table">
                    <thead>
                        <tr>
                            <th>{t("ui.tombs.board.room")}</th>
                            <th>{t("ui.tombs.board.time")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tombs.paths.map((path) => (
                            <tr key={path.id}>
                                <td>{tl(path.name)}</td>
                                <td>{formatTime(path.seconds)}</td>
                            </tr>
                        ))}
                        {tombs.wardensSeconds !== undefined && (
                            <tr>
                                <td>{t("ui.tombs.board.wardens")}</td>
                                <td>{formatTime(tombs.wardensSeconds)}</td>
                            </tr>
                        )}
                        <tr className="ui-tombs-board-total">
                            <td>{t("ui.tombs.board.total")}</td>
                            <td>{formatTime(total)}</td>
                        </tr>
                    </tbody>
                </table>
                <table className="ui-tombs-board-table">
                    <thead>
                        <tr>
                            <th>{t("ui.tombs.board.player")}</th>
                            <th>{t("ui.tombs.board.points")}</th>
                            <th>{t("ui.tombs.board.deaths")}</th>
                            <th>{t("ui.tombs.board.purple")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tombs.party.map((player, i) => (
                            <tr key={i} className={player.you ? "ui-tombs-board-you" : undefined}>
                                <td>{player.name || t("ui.tombs.board.you")}</td>
                                <td>{player.points.toLocaleString("en-GB")}</td>
                                <td>{player.deaths}</td>
                                {/* None with no purple left to find, as their chest's line */}
                                <td>
                                    {player.chance === undefined
                                        ? "–"
                                        : `${Math.round(player.chance * 100)}%`}
                                </td>
                            </tr>
                        ))}
                        {tombs.party.length > 1 && (
                            <tr className="ui-tombs-board-total">
                                <td>{t("ui.tombs.board.party")}</td>
                                <td>{party.toLocaleString("en-GB")}</td>
                                <td>{tombs.party.reduce((sum, p) => sum + p.deaths, 0)}</td>
                                <td />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {tombs.timeLimit && (
                <div className="ui-subtle">
                    {tombs.timeLimit.met
                        ? t("ui.tombs.board.in_time", { minutes: tombs.timeLimit.minutes })
                        : t("ui.tombs.board.past_time", {
                              minutes: tombs.timeLimit.minutes,
                              level: Math.max(0, tombs.level - tombs.timeLimit.drop),
                          })}
                </div>
            )}
            {tombs.wipes > 0 && (
                <div className="ui-subtle">{tp("ui.tombs.board.wipes", tombs.wipes)}</div>
            )}
        </div>
    );
}

// A raid's expert mode, once it's been beaten on hard: hard mode, and the Nylocas only hurt by
// their own style

// The result screen's button back into a boss fight: a fight in parts (MapDef.stages) goes on to
// its next part once one's won ("Next fight"), or from the first again once the last has been;
// anything else is tried again
export function nextFightLabel(map: MapDef, victory: boolean, stage: number | undefined): string {
    if (!victory || !map.stages) {
        return t("ui.result.retry");
    }
    return (stage ?? 0) + 1 < map.stages.length
        ? t("ui.result.next_fight")
        : t("ui.result.fight_again");
}

// What a win says: the part's own words in a fight in parts (MapDef.stages), else the map's
export function stageVictoryText(map: MapDef, stage: number | undefined): string {
    return map.stages?.[stage ?? 0]?.victoryText ?? map.victoryText;
}

// The party line and the notices of what the run unlocked or earned: records,
// the raid chest, maps, characters, items, trophies, gear and quests
export function ResultNotices({ ui }: { ui: UiSnapshot }): JSX.Element {
    const result = ui.result;
    return (
        <>
            {result?.party && (
                <p className="ui-subtle">
                    {t("ui.result.with_party", {
                        party: listNames(result.party, MAX_LISTED_TEAMMATES),
                    })}
                </p>
            )}
            {result?.endlessRecord && (
                <p className="ui-unlocked">
                    {result.hard
                        ? t("ui.result.endless_record_hard", {
                              map: mapName(getMap(result.mapId)),
                          })
                        : t("ui.result.endless_record", { map: mapName(getMap(result.mapId)) })}
                </p>
            )}
            {result?.tombs && <TombsBoardView tombs={result.tombs} />}
            {result?.raidChest && <RaidChestView chest={result.raidChest} />}
            {result?.hard && result.victory && result.relics && (
                <p className="ui-subtle">{t("ui.result.relics_no_hard")}</p>
            )}
            {result?.cardsOnly && <p className="ui-subtle">{t("ui.result.cards_only")}</p>}
            {/* What packs are bought with, apart from the coins (content/cards.ts) */}
            {result !== undefined && (result.platinum ?? 0) > 0 && (
                <p className="ui-unlocked">
                    {t("ui.result.platinum")} <Platinum amount={result.platinum!} />
                </p>
            )}
            {result?.firstHardWin && (
                <p className="ui-unlocked">
                    {t("ui.result.first_hard_win", { map: mapName(getMap(result.mapId)) })}
                </p>
            )}
            {/* Act II's extras (act-2-fallen-empire.md 8.6): an invader felled, an orb spent
                or won, the Vault's week */}
            {result?.invasion?.killed && (
                <p className="ui-unlocked">
                    {t("ui.result.invader_killed", { name: invaderName(result.invasion.id) })}
                </p>
            )}
            {result?.invasion?.came && !result.invasion.killed && (
                <p className="ui-subtle">
                    {t("ui.result.invader_lived", { name: invaderName(result.invasion.id) })}
                </p>
            )}
            {result?.awakened?.seen && (
                <p className={result.victory ? "ui-unlocked" : "ui-subtle"}>
                    {result.victory
                        ? t("ui.result.awakened_won", {
                              coins: fmtNum(result.awakened.casketCoins ?? 0),
                          })
                        : t("ui.result.awakened_spent")}
                </p>
            )}
            {result?.orbWon && <p className="ui-unlocked">{t("ui.result.orb_won")}</p>}
            {result?.vault && (
                <p className={result.vault.best ? "ui-unlocked" : "ui-subtle"}>
                    {result.vault.best
                        ? t("ui.result.vault_best", {
                              week: parseWeekKey(result.vault.key)?.week ?? 0,
                          })
                        : t("ui.result.vault_not_best")}
                </p>
            )}
            {result?.unlockedMap && (
                <p className="ui-unlocked">
                    {t("ui.result.unlocked_map", { map: tl(result.unlockedMap) })}
                </p>
            )}
            {result?.unlockedCharacters.map((name) => (
                <p key={name} className="ui-unlocked">
                    {t("ui.result.unlocked_character", { name: tl(name) })}
                </p>
            ))}
            {result?.unlockedItems.map((name) => (
                <p key={name} className="ui-unlocked">
                    {t("ui.result.unlocked_item", { name: tl(name) })}
                </p>
            ))}
            {result && result.newTrophies.length > 0 && (
                <p className="ui-unlocked">
                    {t("ui.result.new_trophies", {
                        trophies: listNames(result.newTrophies.map(tl)),
                    })}
                </p>
            )}
            {result && result.newGear.length > 0 && (
                <p className="ui-unlocked">
                    {t("ui.result.new_gear", {
                        gear: listNames(result.newGear.map(tl)),
                    })}
                </p>
            )}
            {result?.quests.map((quest) => (
                <p key={quest.name} className="ui-unlocked">
                    {t("ui.result.quest_complete", { name: tl(quest.name) })}{" "}
                    <Coins amount={quest.coins} />
                </p>
            ))}
        </>
    );
}

// Play again or retry on your own, and back to the title or the party
export function ResultButtons({ ui, client }: ScreenProps): JSX.Element {
    const result = ui.result;
    // The map just played: a win can have moved the pick on to the one it opened
    const played = getMap(result?.mapId ?? ui.mapId);
    const canRetry = !result?.coop;
    return (
        <div className="ui-row">
            {/* On your own: straight into the same map again */}
            {canRetry && (
                <button className="ui-button ui-button-go" onClick={() => client.retry()}>
                    <KeyHint keyLabel="Enter" className="ui-choice-key ui-word-key" />{" "}
                    {played.fight
                        ? nextFightLabel(played, ui.overlay === "victory", result?.stage)
                        : t("ui.result.play_again")}
                </button>
            )}
            <button
                className={canRetry ? "ui-button" : "ui-button ui-button-go"}
                onClick={() => client.leaveRun()}
            >
                {ui.coop.room ? t("ui.result.back_party") : t("ui.result.back_title")}
            </button>
        </div>
    );
}
