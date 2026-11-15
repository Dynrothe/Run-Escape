import { CSSProperties, ReactNode, useState } from "react";

import type { DamageKindView, DamageView, KillView, RevivesView } from "../client/GameStore";
import {
    DAMAGE_KIND_COLORS,
    DAMAGE_KIND_ICONS,
    RANK_PLANK_OBJ,
    damageKindDescription,
    damageKindName,
} from "../content/damageKinds";
import { enemyName, getEnemy } from "../content/enemies";
import { SLAYER_SPRITE_ID } from "../content/questIcons";
import type { StatIconRef } from "../content/statIcons";
import { t, tl } from "../i18n";
import { BreakdownTip } from "./BreakdownTip";
import "./CombatBreakdown.css";
import { EnemyHead } from "./EnemyHead";
import { ItemIcon } from "./ItemIcon";
import { WeaponAboutTip } from "./PauseLoadout";
import { formatShare } from "./formatCompact";
import { Big, formatPerSecond } from "./results/shared";
import { useStoneSlot } from "./useStoneSlot";

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
                                            {!def.outfits && <EnemyHead enemy={def} size={52} />}
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

// The medals, best first: gold, silver, bronze
const RANK_MEDALS = ["gold", "silver", "bronze"] as const;

// Little lights over a ranked row: they rise from a medal's, and fall from the worst one's
function Sparks(): JSX.Element {
    return (
        <span className="ui-sparks" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
                <i key={i} />
            ))}
        </span>
    );
}

type CombatTotals = {
    damageDealt: number;
    highestHit: number;
    damageTaken: number;
    healed: number;
    damageBlocked?: number;
    revives?: RevivesView;
};

type Tile = {
    tone: string;
    name: string;
    value: ReactNode;
    icon: StatIconRef;
    sub?: string;
    // The last stand: no revive left
    alert?: boolean;
    // What the mouse over it says: what the number is
    hint: string;
};

// A ranked row's corner, the star's and the plank's: its name, and a line of what it is
const MVP_LINES = 4;
const PLANK_LINES = 5;

function RankTip({ name, text }: { name: string; text: string }): JSX.Element {
    return (
        <div className="ui-examine">
            <div className="ui-examine-name" style={{ color: "var(--ui-orange)" }}>
                {name}
            </div>
            <p className="ui-examine-text">{text}</p>
        </div>
    );
}

// How many medals: the top two, or three once there are more than four sources. With four
// exactly only the best wears one, so the ranking's ends stand out alone.
export function rankMedalCount(sources: number): number {
    return sources > 4 ? 3 : sources === 4 ? 1 : 2;
}

// The report's tiles: what the hero dealt, took, stopped and healed, and the revives they have left
// (the last stand once there are none)
function getTiles(totals: CombatTotals): Tile[] {
    const tiles: Tile[] = [
        {
            tone: "dealt",
            name: t("ui.result.stat.damage_dealt"),
            value: <Big value={totals.damageDealt} />,
            icon: { spriteId: 198 }, // Strength
            hint: t("combat.tip.damage_dealt"),
        },
        {
            tone: "hit",
            name: t("ui.result.stat.biggest_hit"),
            value: <Big value={totals.highestHit} />,
            icon: { objId: 1347 }, // Rune warhammer
            hint: t("combat.tip.biggest_hit"),
        },
        {
            tone: "taken",
            name: t("ui.result.stat.damage_taken"),
            value: <Big value={totals.damageTaken} />,
            icon: { spriteId: 203 }, // Hitpoints
            hint: t("combat.tip.damage_taken"),
        },
    ];
    if (totals.damageBlocked !== undefined) {
        tiles.push({
            tone: "blocked",
            name: t("combat.stat.blocked"),
            value: <Big value={totals.damageBlocked} />,
            icon: { spriteId: 199 }, // Defence
            hint: t("combat.tip.blocked"),
        });
    }
    tiles.push({
        tone: "healed",
        name: t("ui.result.stat.healed"),
        value: <Big value={totals.healed} />,
        icon: { objId: 385 }, // Shark
        hint: t("combat.tip.healed"),
    });
    const revives = totals.revives;
    if (revives) {
        const last = revives.left <= 0;
        const given =
            revives.coop && revives.given > 0
                ? t("combat.stat.revives_given", { n: revives.given })
                : undefined;
        tiles.push({
            tone: "revives",
            name: last ? t("combat.stat.last_stand") : t("combat.stat.revives"),
            value: last ? "0" : revives.left,
            // The skull, or a Ring of life
            icon: last ? { spriteId: SLAYER_SPRITE_ID } : { objId: 2570 },
            // The last stand says what it is: no revives left
            sub: last
                ? [t("combat.stat.last_stand_sub"), given].filter(Boolean).join(" · ")
                : given,
            hint: last ? t("pause.revives.last_stand_hint") : t("combat.tip.revives"),
            alert: last,
        });
    }
    return tiles;
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
    totals: CombatTotals;
}): JSX.Element {
    const portraitFrame = useStoneSlot();
    const dealt = kinds.reduce((sum, kind) => sum + kind.damage, 0);
    const killed = kills.reduce((sum, kill) => sum + kill.kills, 0);
    const top = Math.max(1, ...sources.map((row) => row.damage));
    const mostKilled = Math.max(1, ...kills.map((kill) => kill.kills));
    const tiles = getTiles(totals);
    // The best weapons wear a medal (rankMedalCount), and the worst one, if it isn't among them, a
    // plank in place of its number
    const medals = RANK_MEDALS.slice(0, rankMedalCount(sources.length));
    // The star's and the plank's line, a new one each time the tab's opened
    const [pick] = useState(() => Math.random());
    const mvpLine = t(`combat.rank.mvp.${1 + Math.floor(pick * MVP_LINES)}`);
    const plankLine = t(`combat.rank.plank.${1 + Math.floor(pick * PLANK_LINES)}`);
    return (
        <div
            className={`ui-cr${portraitFrame ? " ui-cr-portrait-frame" : ""}`}
            style={
                portraitFrame
                    ? ({ "--ui-portrait-frame": portraitFrame } as CSSProperties)
                    : undefined
            }
        >
            <div className="ui-cr-tiles">
                {tiles.map((tile) => (
                    <BreakdownTip
                        key={tile.tone}
                        className={`ui-cr-tile ui-cr-tile-${tile.tone}${tile.alert ? " ui-cr-tile-alert" : ""}`}
                        content={<RankTip name={tile.name} text={tile.hint} />}
                    >
                        <span className="ui-cr-tile-main">
                            <span className="ui-cr-tile-icon">
                                <ItemIcon
                                    objId={tile.icon.objId ?? -1}
                                    spriteId={tile.icon.spriteId}
                                    size={24}
                                />
                            </span>
                            <span className="ui-cr-tile-value">{tile.value}</span>
                        </span>
                        <span className="ui-cr-tile-name">{tile.name}</span>
                        {tile.sub && <span className="ui-cr-tile-sub">{tile.sub}</span>}
                    </BreakdownTip>
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
                                {sources.map((row, i) => {
                                    const medal = medals[i];
                                    const worst = !medal && i === sources.length - 1 && i > 0;
                                    return (
                                        <li
                                            key={i}
                                            className={
                                                medal
                                                    ? `ui-cr-rank-medal ui-cr-rank-${medal}`
                                                    : worst
                                                      ? "ui-cr-rank-worst"
                                                      : undefined
                                            }
                                        >
                                            {(medal || worst) && <Sparks />}
                                            {/* Its place: the best's a star (the MVP), the
                                                worst's a plank, each with a line on it */}
                                            <BreakdownTip
                                                className="ui-cr-rank-no"
                                                content={
                                                    i === 0 ? (
                                                        <RankTip
                                                            name={t("combat.rank.mvp")}
                                                            text={mvpLine}
                                                        />
                                                    ) : worst ? (
                                                        <RankTip
                                                            name={t("combat.rank.plank")}
                                                            text={plankLine}
                                                        />
                                                    ) : undefined
                                                }
                                            >
                                                {i === 0 ? (
                                                    "★"
                                                ) : worst ? (
                                                    <span className="ui-cr-rank-plank">
                                                        <ItemIcon
                                                            objId={RANK_PLANK_OBJ}
                                                            size={20}
                                                        />
                                                    </span>
                                                ) : (
                                                    i + 1
                                                )}
                                            </BreakdownTip>
                                            {/* A weapon's row says what it is and what it
                                                evolves into, as its square on the Loadout does */}
                                            <BreakdownTip
                                                className="ui-cr-rank-row"
                                                content={
                                                    row.about && (
                                                        <WeaponAboutTip
                                                            name={row.name}
                                                            color={row.color}
                                                            iconObjId={row.iconObjId}
                                                            about={row.about}
                                                        />
                                                    )
                                                }
                                            >
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
                                                        title={row.about ? undefined : tl(row.name)}
                                                    >
                                                        {tl(row.name)}
                                                    </span>
                                                    <span
                                                        className="ui-cr-rank-bar"
                                                        aria-hidden="true"
                                                    >
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
                                            </BreakdownTip>
                                        </li>
                                    );
                                })}
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
                                            {!def.outfits && <EnemyHead enemy={def} size={48} />}
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
