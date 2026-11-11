import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { formatTime } from "../client/GameView";
import { characterName, getCharacter } from "../content/characters";
import { getEnemy } from "../content/enemies";
import { AWAKENERS_ORB_OBJ } from "../content/gauntlet";
import { RUN_SET, invocationName } from "../content/invocations";
import { getMap, mapName } from "../content/maps";
import { REMIX_BY_ID, remixName } from "../content/remixes";
import type { MapDef } from "../content/types";
import { getVault, isoWeek, parseWeekKey, weekKey, weekStart } from "../content/vault";
import { getWeapon } from "../content/weapons";
import { AWAKENED } from "../core/Sim";
import { SaveData, canAwaken } from "../core/save";
import { fmtNum, t, tp } from "../i18n";
import { ItemIcon } from "./ItemIcon";
import "./Vault.css";

// The weekly Vault's screen (content/vault.ts), and an Awakener's orb's row on a campaign map's card
// (act-2-fallen-empire.md 8.6).

type Props = { ui: UiSnapshot; client: GameClient };

const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;

// The map's final boss, by name ("Tztok-Jad"), for the orb's switch
function finalBossName(map: MapDef): string {
    const event = map.events.find((e) => e.kind === "finalBoss");
    return event ? getEnemy(event.enemyId).name : "";
}

// An orb's switch on the map's card, the orbs held, and the card's mark once its awakened boss has
// fallen. Shown once there's an orb or a mark.
export function AwakenRow({
    save,
    map,
    on,
    onToggle,
}: {
    save: SaveData;
    map: MapDef;
    on?: boolean;
    onToggle?: () => void;
}): JSX.Element | null {
    const orbs = save.awakenerOrbs ?? 0;
    const wins = save.awakenedWins?.[map.id] ?? 0;
    if (orbs === 0 && wins === 0) {
        return null;
    }
    const usable = canAwaken(save, map.id) && onToggle !== undefined;
    const boss = finalBossName(map);
    return (
        <div className="ui-awaken">
            <button
                className={
                    "ui-button ui-button-small ui-awaken-button" + (on ? " ui-awaken-on" : "")
                }
                disabled={!usable}
                aria-pressed={on === true}
                title={t("ui.awaken.tooltip", {
                    boss,
                    hp: AWAKENED.hp,
                    enraged: Math.round(AWAKENED.enrageAt * 100),
                    faster: Math.round((AWAKENED.tempo - 1) * 100),
                })}
                onClick={(e) => {
                    onToggle?.();
                    e.currentTarget.blur();
                }}
            >
                <ItemIcon objId={AWAKENERS_ORB_OBJ} size={18} />
                {on ? t("ui.awaken.on", { boss }) : t("ui.awaken.off", { boss })}
            </button>
            <span className="ui-awaken-orbs">{t("ui.awaken.orbs", { n: fmtNum(orbs) })}</span>
            {wins > 0 && (
                <span className="ui-awaken-won">
                    {t("ui.awaken.beaten", { times: tp("ui.map.beaten_times", wins) })}
                </span>
            )}
        </div>
    );
}

// This week's Vault: its map, remixes, invocations and adventurer, the week's best and those of
// the weeks before, when it turns, and the way in (solo, or as the room's next run hosting one)
export function VaultScreen({ ui, client }: Props): JSX.Element {
    const now = Date.now();
    const week = isoWeek(now);
    const key = weekKey(week);
    const vault = getVault(key);
    const map = getMap(vault.mapId);
    const character = getCharacter(vault.characterId);
    const best = ui.save.vault?.[key];
    const left = Math.max(0, weekStart(week) + WEEK - now);
    const days = Math.floor(left / (24 * HOUR));
    const hours = Math.floor((left % (24 * HOUR)) / HOUR);
    const room = ui.coop.room;
    const hosting = room !== undefined && room.hostId === ui.coop.you;
    const past = Object.entries(ui.save.vault ?? {})
        .filter(([week]) => week !== key && parseWeekKey(week))
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .slice(0, 4);
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-vault">
                <h2>{t("ui.vault.title")}</h2>
                <p className="ui-subtle ui-vault-help">
                    {t("ui.vault.week", { week: week.week, year: week.year })}{" "}
                    {t("ui.vault.turns", { days, hours })}
                </p>
                <div className="ui-vault-run">
                    <div className="ui-card ui-vault-card">
                        <ItemIcon objId={map.iconObjId} size={32} />
                        <span className="ui-vault-label">{t("ui.vault.map")}</span>
                        <span className="ui-vault-value">{mapName(map)}</span>
                    </div>
                    <div className="ui-card ui-vault-card">
                        <ItemIcon objId={getWeapon(character.startingWeapon).iconObjId} size={32} />
                        <span className="ui-vault-label">{t("ui.vault.adventurer")}</span>
                        <span className="ui-vault-value">{characterName(character)}</span>
                    </div>
                    <div className="ui-card ui-vault-card ui-vault-wide">
                        <span className="ui-vault-label">{t("ui.vault.remixes")}</span>
                        <span className="ui-vault-chips">
                            {vault.remixes.map((id) => (
                                <span key={id} className="ui-vault-chip">
                                    <ItemIcon objId={REMIX_BY_ID.get(id)!.iconObjId} size={18} />
                                    {remixName(id)}
                                </span>
                            ))}
                        </span>
                    </div>
                    <div className="ui-card ui-vault-card ui-vault-wide">
                        <span className="ui-vault-label">{t("ui.vault.invocations")}</span>
                        <span className="ui-vault-chips">
                            {vault.invocations.map((id) => (
                                <span key={id} className="ui-vault-chip">
                                    {invocationName(RUN_SET.byId.get(id)!)}
                                </span>
                            ))}
                        </span>
                    </div>
                </div>
                <div className="ui-vault-best">
                    {best
                        ? t(best.victory ? "ui.vault.best_win" : "ui.vault.best_fall", {
                              time: formatTime(best.seconds),
                              kills: fmtNum(best.kills),
                              runs: tp("ui.vault.runs", best.runs),
                          })
                        : t("ui.vault.no_best")}
                </div>
                {past.length > 0 && (
                    <div className="ui-vault-past">
                        {past.map(([week, record]) => (
                            <span key={week} className="ui-vault-past-week">
                                {t("ui.vault.past", {
                                    week: parseWeekKey(week)!.week,
                                    result: record.victory
                                        ? t("ui.vault.won_in", { time: formatTime(record.seconds) })
                                        : t("ui.vault.fell_at", {
                                              time: formatTime(record.seconds),
                                          }),
                                    kills: fmtNum(record.kills),
                                })}
                            </span>
                        ))}
                    </div>
                )}
                <p className="ui-subtle ui-vault-help">{t("ui.vault.same_for_all")}</p>
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        {t("canvas.back")}
                    </button>
                    {hosting ? (
                        <button
                            className="ui-button ui-button-go"
                            onClick={() => client.vaultForRoom()}
                        >
                            {t("ui.vault.for_room")}
                        </button>
                    ) : (
                        <button
                            className="ui-button ui-button-go"
                            disabled={room !== undefined}
                            title={room ? t("ui.vault.host_only") : undefined}
                            onClick={() => client.startVault()}
                        >
                            {t("ui.vault.enter")}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
