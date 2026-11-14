import type { DamageKindView, DamageView, KillView } from "../client/GameStore";
import {
    DAMAGE_KIND_COLORS,
    DAMAGE_KIND_ICONS,
    damageKindDescription,
    damageKindName,
} from "../content/damageKinds";
import { enemyName, getEnemy } from "../content/enemies";
import { t, tl } from "../i18n";
import "./CombatBreakdown.css";
import { ItemIcon, NpcHead } from "./ItemIcon";
import { formatShare } from "./formatCompact";
import { Big, formatPerSecond } from "./results/shared";

// The run's fighting, the pause menu's Combat tab and the results' alike: what the hero's damage
// was (melee, ranged, magic, poison, recoil...), what dealt it, and what they killed
export function CombatBreakdown({
    kinds,
    sources,
    kills,
    totals,
}: {
    kinds: DamageKindView[];
    sources: DamageView[];
    kills: KillView[];
    // The pause menu's: the run's numbers so far, which the results have on their Summary tab
    totals?: { damageDealt: number; highestHit: number; damageTaken: number; healed: number };
}): JSX.Element {
    const dealt = kinds.reduce((sum, kind) => sum + kind.damage, 0);
    const killed = kills.reduce((sum, kill) => sum + kill.kills, 0);
    return (
        <>
            {totals && (
                <div className="ui-combat-totals">
                    {[
                        ["ui.result.stat.damage_dealt", totals.damageDealt],
                        ["ui.result.stat.biggest_hit", totals.highestHit],
                        ["ui.result.stat.damage_taken", totals.damageTaken],
                        ["ui.result.stat.healed", totals.healed],
                    ].map(([key, value]) => (
                        <div key={key} className="ui-combat-total">
                            <span className="ui-combat-total-value">
                                <Big value={value as number} />
                            </span>
                            <span className="ui-combat-total-name">{t(key as string)}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="ui-combat">
                <div className="ui-combat-column">
                    <h3 className="ui-pause-heading">{t("combat.heading.by_kind")}</h3>
                    {kinds.length === 0 ? (
                        <p className="ui-subtle ui-combat-empty">{t("combat.none_dealt")}</p>
                    ) : (
                        <ul className="ui-combat-kinds" aria-label={t("combat.heading.by_kind")}>
                            {kinds.map(({ kind, damage }) => {
                                const icon = DAMAGE_KIND_ICONS[kind];
                                const share = dealt > 0 ? damage / dealt : 0;
                                return (
                                    <li
                                        key={kind}
                                        className="ui-combat-kind"
                                        title={damageKindDescription(kind)}
                                    >
                                        <span className="ui-combat-kind-icon">
                                            {icon && (
                                                <ItemIcon
                                                    objId={icon.objId ?? -1}
                                                    spriteId={icon.spriteId}
                                                    size={24}
                                                />
                                            )}
                                        </span>
                                        <span className="ui-combat-kind-name">
                                            {damageKindName(kind)}
                                            <span className="ui-damage-bar" aria-hidden="true">
                                                <span style={{ width: `${share * 100}%` }} />
                                            </span>
                                        </span>
                                        <span className="ui-combat-kind-damage">
                                            <Big value={damage} />
                                        </span>
                                        <span className="ui-combat-kind-share">
                                            {formatShare(damage, dealt)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {sources.length > 0 && (
                        <>
                            <h3 className="ui-pause-heading">{t("combat.heading.by_source")}</h3>
                            <DamageSourceTable sources={sources} />
                        </>
                    )}
                </div>
                <div className="ui-combat-column">
                    <h3 className="ui-pause-heading">
                        {t("combat.heading.kills")}
                        {killed > 0 && (
                            <span className="ui-combat-count">{killed.toLocaleString()}</span>
                        )}
                    </h3>
                    {kills.length === 0 ? (
                        <p className="ui-subtle ui-combat-empty">{t("combat.none_killed")}</p>
                    ) : (
                        <ul className="ui-combat-kills" aria-label={t("combat.heading.kills")}>
                            {kills.map((kill) => {
                                const def = getEnemy(kill.enemyId);
                                const name = enemyName(def);
                                return (
                                    <li
                                        key={kill.enemyId}
                                        className={
                                            "ui-combat-kill" +
                                            (kill.boss ? " ui-combat-kill-boss" : "")
                                        }
                                        title={`${name}: ${kill.kills.toLocaleString()}`}
                                    >
                                        <span className="ui-combat-kill-head">
                                            {!def.outfits && (
                                                <NpcHead npcId={def.npcId} size={52} />
                                            )}
                                        </span>
                                        <span className="ui-combat-kill-count">
                                            {kill.kills.toLocaleString()}
                                        </span>
                                        <span className="ui-combat-kill-name">{name}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </>
    );
}

// The pause menu's Combat tab, laid out as a fight report: the run's totals as tiles, the damage's
// mix as one bar cut by kind, a ranking of what dealt it (the best one crowned, the rest in bars
// against it), and the bestiary of what's been killed, its commonest first
export function CombatReport({
    kinds,
    sources,
    kills,
    totals,
}: {
    kinds: DamageKindView[];
    sources: DamageView[];
    kills: KillView[];
    totals: { damageDealt: number; highestHit: number; damageTaken: number; healed: number };
}): JSX.Element {
    const dealt = kinds.reduce((sum, kind) => sum + kind.damage, 0);
    const killed = kills.reduce((sum, kill) => sum + kill.kills, 0);
    const top = Math.max(1, ...sources.map((row) => row.damage));
    const mostKilled = Math.max(1, ...kills.map((kill) => kill.kills));
    const tiles: [string, number, string][] = [
        ["ui.result.stat.damage_dealt", totals.damageDealt, "dealt"],
        ["ui.result.stat.biggest_hit", totals.highestHit, "hit"],
        ["ui.result.stat.damage_taken", totals.damageTaken, "taken"],
        ["ui.result.stat.healed", totals.healed, "healed"],
    ];
    return (
        <div className="ui-cr">
            <div className="ui-cr-tiles">
                {tiles.map(([key, value, tone]) => (
                    <div key={key} className={`ui-cr-tile ui-cr-tile-${tone}`}>
                        <span className="ui-cr-tile-value">
                            <Big value={value} />
                        </span>
                        <span className="ui-cr-tile-name">{t(key)}</span>
                    </div>
                ))}
            </div>
            <div className="ui-cr-body">
                <div className="ui-cr-col">
                    <h3 className="ui-loadout-heading">
                        <span>{t("combat.heading.by_kind")}</span>
                    </h3>
                    {kinds.length === 0 ? (
                        <p className="ui-subtle ui-combat-empty">{t("combat.none_dealt")}</p>
                    ) : (
                        <>
                            <div className="ui-cr-mix" aria-hidden="true">
                                {kinds.map(({ kind, damage }) => (
                                    <span
                                        key={kind}
                                        style={{
                                            flexGrow: damage,
                                            background: DAMAGE_KIND_COLORS[kind],
                                        }}
                                    />
                                ))}
                            </div>
                            <ul className="ui-cr-legend" aria-label={t("combat.heading.by_kind")}>
                                {kinds.map(({ kind, damage }) => {
                                    const icon = DAMAGE_KIND_ICONS[kind];
                                    return (
                                        <li key={kind} title={damageKindDescription(kind)}>
                                            <i style={{ background: DAMAGE_KIND_COLORS[kind] }} />
                                            <span className="ui-cr-legend-icon">
                                                {icon && (
                                                    <ItemIcon
                                                        objId={icon.objId ?? -1}
                                                        spriteId={icon.spriteId}
                                                        size={20}
                                                    />
                                                )}
                                            </span>
                                            <span className="ui-cr-legend-name">
                                                {damageKindName(kind)}
                                            </span>
                                            <span className="ui-cr-legend-damage">
                                                <Big value={damage} />
                                            </span>
                                            <span className="ui-cr-legend-share">
                                                {formatShare(damage, dealt)}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                    {sources.length > 0 && (
                        <>
                            <h3 className="ui-loadout-heading ui-cr-gap">
                                <span>{t("combat.heading.by_source")}</span>
                            </h3>
                            <ol className="ui-cr-rank" aria-label={t("combat.heading.by_source")}>
                                {sources.map((row, i) => (
                                    <li key={i} className={i === 0 ? "ui-cr-rank-top" : undefined}>
                                        <span className="ui-cr-rank-no">
                                            {i === 0 ? "★" : i + 1}
                                        </span>
                                        <span className="ui-cr-rank-icon">
                                            {(row.iconObjId !== undefined ||
                                                row.iconSpriteId !== undefined) && (
                                                <ItemIcon
                                                    objId={row.iconObjId ?? -1}
                                                    spriteId={row.iconSpriteId}
                                                    size={i === 0 ? 32 : 24}
                                                />
                                            )}
                                        </span>
                                        <span className="ui-cr-rank-main">
                                            <span
                                                className="ui-cr-rank-name"
                                                style={{ color: row.color }}
                                                title={tl(row.name)}
                                            >
                                                {tl(row.name)}
                                            </span>
                                            <span className="ui-cr-rank-bar" aria-hidden="true">
                                                <span
                                                    style={{
                                                        width: `${(row.damage / top) * 100}%`,
                                                    }}
                                                />
                                            </span>
                                        </span>
                                        <span className="ui-cr-rank-nums">
                                            <Big value={row.damage} />
                                            {row.perSecond !== undefined && (
                                                <small>
                                                    {formatPerSecond(row.perSecond)}{" "}
                                                    {t("ui.damage.dps")}
                                                </small>
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </>
                    )}
                </div>
                <div className="ui-cr-col ui-cr-col-kills">
                    <h3 className="ui-loadout-heading">
                        <span>{t("combat.heading.kills")}</span>
                        {killed > 0 && (
                            <span className="ui-loadout-count">{killed.toLocaleString()}</span>
                        )}
                    </h3>
                    {kills.length === 0 ? (
                        <p className="ui-subtle ui-combat-empty">{t("combat.none_killed")}</p>
                    ) : (
                        <ul className="ui-cr-kills" aria-label={t("combat.heading.kills")}>
                            {kills.map((kill) => {
                                const def = getEnemy(kill.enemyId);
                                const name = enemyName(def);
                                return (
                                    <li
                                        key={kill.enemyId}
                                        className={
                                            "ui-cr-kill" + (kill.boss ? " ui-cr-kill-boss" : "")
                                        }
                                        title={`${name}: ${kill.kills.toLocaleString()}`}
                                    >
                                        <span className="ui-cr-kill-head">
                                            {!def.outfits && (
                                                <NpcHead npcId={def.npcId} size={48} />
                                            )}
                                        </span>
                                        <span className="ui-cr-kill-main">
                                            <span className="ui-cr-kill-name">{name}</span>
                                            <span className="ui-cr-kill-bar" aria-hidden="true">
                                                <span
                                                    style={{
                                                        width: `${(kill.kills / mostKilled) * 100}%`,
                                                    }}
                                                />
                                            </span>
                                        </span>
                                        <span className="ui-cr-kill-count">
                                            {kill.kills.toLocaleString()}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

// What dealt the run's damage, most first: its damage, kills and damage a second
export function DamageSourceTable({ sources }: { sources: DamageView[] }): JSX.Element {
    return (
        <table className="ui-result-damage" aria-label={t("combat.heading.by_source")}>
            <thead>
                <tr>
                    <th />
                    <th>{t("ui.result.damage")}</th>
                    <th>{t("ui.result.stat.kills")}</th>
                    <th>{t("ui.damage.dps")}</th>
                </tr>
            </thead>
            <tbody>
                {sources.map((row, i) => (
                    <tr key={i}>
                        <td>
                            <span className="ui-result-source">
                                {row.iconObjId !== undefined && (
                                    <ItemIcon
                                        objId={row.iconObjId}
                                        spriteId={row.iconSpriteId}
                                        size={24}
                                    />
                                )}
                                <span
                                    className="ui-result-name"
                                    style={{ color: row.color }}
                                    title={tl(row.name)}
                                >
                                    {tl(row.name)}
                                </span>
                            </span>
                        </td>
                        <td>
                            <Big value={row.damage} />
                        </td>
                        <td>
                            <Big value={row.kills} />
                        </td>
                        <td>{row.perSecond !== undefined ? formatPerSecond(row.perSecond) : ""}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
