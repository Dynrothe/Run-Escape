import { useEffect, useMemo, useRef, useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { enemyName } from "../content/enemies";
import { MAP_BY_ID, mapName } from "../content/maps";
import {
    Appearance,
    DiaryEntry,
    DiaryKind,
    DiaryVariant,
    diaryKills,
    getDiaryEntries,
    getDiaryMaps,
} from "../content/monsterDiary";
import { portraitRequest } from "../content/portraitConfig";
import { getPortrait } from "../content/portraits";
import { PAUSE_TAB_SPRITES } from "../content/titleIcons";
import { EnemyDef } from "../content/types";
import { fmtNum, list, t } from "../i18n";
import { ItemIcon, NpcHead } from "./ItemIcon";
import "./MonsterDiaryScreen.css";
import { useMenuKeys } from "./menuKeys";

// The Monster diary (content/monsterDiary.ts): every monster in the game, with its model, its stats,
// where and when it turns up on each map, and what Old School RuneScape says about it. The list is
// on the left, searched and filtered by kind or map; the page for the one chosen is on the right.

type Props = { ui: UiSnapshot; client: GameClient };

type KindFilter = "all" | DiaryKind;
const KINDS: KindFilter[] = ["all", "monster", "boss", "mechanic"];

// An eighth of a turn: the model turns by this much a press (client angle units, 2048 a turn)
const TURN = 256;

const clock = (seconds: number): string =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// One line on where it turns up
export function describeAppearance(a: Appearance): string {
    const from = a.from === undefined ? "" : clock(a.from);
    let how: string;
    if (a.room) {
        how = t("diary.how.room");
    } else if (a.how === "wave" && a.until !== undefined) {
        how = t("diary.how.wave_range", { from, until: clock(a.until) });
    } else {
        how = t(`diary.how.${a.how === "wave" ? "wave_from" : a.how}`, { from });
    }
    return a.place ? t("diary.place", { place: a.place, how }) : how;
}

// The appearances of all of an entry's forms, by map, each shown once
export function appearancesByMap(entry: DiaryEntry): { mapId: string; lines: string[] }[] {
    const byMap = new Map<string, Set<string>>();
    for (const variant of entry.variants) {
        for (const a of variant.appearances) {
            const lines = byMap.get(a.mapId) ?? new Set<string>();
            lines.add(describeAppearance(a));
            byMap.set(a.mapId, lines);
        }
    }
    return entry.mapIds.map((mapId) => ({ mapId, lines: [...(byMap.get(mapId) ?? [])] }));
}

// The traits worth listing, in words
export function traitsOf(def: EnemyDef): string[] {
    const traits: string[] = [];
    const add = (key: string) => traits.push(t(`diary.trait.${key}`));
    if (def.boss) add("boss");
    for (const tag of def.tags ?? []) add(tag);
    if (def.flies) add("flies");
    if (def.ghost) add("ghost");
    if (def.stationary) add("stationary");
    if (def.shot) add("shot");
    if (def.heals) add("heals");
    if (def.revives) add("revives");
    if (def.splits) add("splits");
    if (def.explodes) add("explodes");
    if (def.blinks) add("blinks");
    if (def.shield) add("shield");
    if (def.spawns) add("spawns");
    if (def.protects) add("protects");
    if (def.pounce) add("pounce");
    if (def.flees) add("flees");
    if (def.holds) add("holds");
    if (def.hatches) add("hatches");
    if (def.bursts) add("bursts");
    if (def.unhittable) add("unhittable");
    if (def.ashes) add("ashes");
    if (def.knockbackResist !== undefined && def.knockbackResist > 0) {
        add(def.knockbackResist >= 1 ? "knockback_immune" : "knockback");
    }
    return traits;
}

// The picture of a monster: its head as the game frames it, or its whole body turned by `turn`
// eighths. A monster drawn as a player has no model to show.
function Portrait({
    def,
    body,
    turn,
    size,
}: {
    def: EnemyDef;
    body: boolean;
    turn: number;
    size: number;
}): JSX.Element {
    if (def.outfits || def.npcId < 0) {
        return <ItemIcon objId={-1} spriteId={PAUSE_TAB_SPRITES.loadout} size={size / 2} />;
    }
    const request = body
        ? {
              npcId: def.npcId,
              portrait: { model: "body" as const, seqId: def.idleSeq, yaw: turn * TURN },
          }
        : portraitRequest(def, getPortrait(def.id));
    return <NpcHead {...request} size={size} />;
}

// A list row's little head, drawn only once the row has scrolled into view: there are hundreds
function LazyHead({ def }: { def: EnemyDef }): JSX.Element {
    const ref = useRef<HTMLSpanElement>(null);
    const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
    useEffect(() => {
        const node = ref.current;
        if (seen || !node) {
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                setSeen(true);
                observer.disconnect();
            }
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [seen]);
    return (
        <span ref={ref} className="ui-diary-row-head">
            {seen && !def.outfits && def.npcId >= 0 && (
                <NpcHead {...portraitRequest(def, getPortrait(def.id))} size={24} />
            )}
        </span>
    );
}

function StatRow({ name, value }: { name: string; value: string }): JSX.Element {
    return (
        <div className="ui-diary-stat">
            <span className="ui-diary-stat-name">{name}</span>
            <span className="ui-diary-stat-value">{value}</span>
        </div>
    );
}

function Stats({ variant }: { variant: DiaryVariant }): JSX.Element {
    const def = variant.def;
    const boss = def.boss;
    const dash = t("diary.dash");
    return (
        <div className="ui-diary-stats">
            <StatRow name={t("diary.stat.hp")} value={fmtNum(def.hp)} />
            <StatRow
                name={t("diary.stat.damage")}
                value={def.damage > 0 ? fmtNum(def.damage) : dash}
            />
            <StatRow
                name={t("diary.stat.speed")}
                value={t("diary.speed_value", { n: fmtNum(Math.round(def.speed * 10) / 10) })}
            />
            <StatRow
                name={t("diary.stat.size")}
                value={t("diary.size_value", { n: fmtNum(Math.round(def.radius * 20) / 10) })}
            />
            <StatRow name={t("diary.stat.xp")} value={fmtNum(def.xp)} />
            {boss && (
                <>
                    <StatRow
                        name={t("diary.stat.interval")}
                        value={t("diary.seconds_value", { n: fmtNum(boss.attackInterval) })}
                    />
                    <StatRow
                        name={t("diary.stat.enrage")}
                        value={t("diary.enrage_value", {
                            n: fmtNum(Math.round((boss.enrage.at ?? 0.5) * 100)),
                        })}
                    />
                    {boss.rises && (
                        <StatRow
                            name={t("diary.stat.rises")}
                            value={t("diary.rises_value", { n: fmtNum(boss.rises.times) })}
                        />
                    )}
                </>
            )}
            <p className="ui-diary-note">{t("diary.stat.hp_note")}</p>
        </div>
    );
}

export function MonsterDiaryScreen({ ui, client }: Props): JSX.Element {
    const all = useMemo(() => getDiaryEntries(), []);
    const maps = useMemo(() => getDiaryMaps(), []);
    const [kind, setKind] = useState<KindFilter>("all");
    const [mapId, setMapId] = useState("");
    const [query, setQuery] = useState("");
    const [openId, setOpenId] = useState<string | undefined>(undefined);
    const [form, setForm] = useState(0);
    const [body, setBody] = useState(false);
    const [turn, setTurn] = useState(0);
    const close = () => client.leaveMenu();
    useMenuKeys({ onBack: close });

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return all.filter(
            (entry) =>
                (kind === "all" || entry.kind === kind) &&
                (!mapId || entry.mapIds.includes(mapId)) &&
                (!q || enemyName(entry.variants[0].def).toLowerCase().includes(q)),
        );
    }, [all, kind, mapId, query]);

    const entry = shown.find((e) => e.id === openId) ?? shown[0];
    const variant = entry ? entry.variants[Math.min(form, entry.variants.length - 1)] : undefined;
    const kills = entry ? diaryKills(entry, ui.save.enemyKills) : 0;
    const where = useMemo(() => (entry ? appearancesByMap(entry) : []), [entry]);

    const open = (id: string) => {
        setOpenId(id);
        setForm(0);
        setTurn(0);
    };

    return (
        <div className="ui-fill ui-center">
            <div
                className="ui-panel rs-border rs-background ui-diary"
                role="dialog"
                aria-labelledby="ui-diary-title"
            >
                <div className="ui-diary-top">
                    <h2 id="ui-diary-title" className="ui-diary-title">
                        {t("diary.title")}
                    </h2>
                    <span className="ui-diary-count">
                        {t("diary.count", { n: fmtNum(shown.length), total: fmtNum(all.length) })}
                    </span>
                </div>
                <div className="ui-diary-filters">
                    <input
                        className="ui-diary-search"
                        type="search"
                        value={query}
                        placeholder={t("diary.search")}
                        aria-label={t("diary.search")}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    <div
                        className="ui-diary-kinds"
                        role="group"
                        aria-label={t("diary.filter_kind")}
                    >
                        {KINDS.map((k) => (
                            <button
                                key={k}
                                className={"ui-diary-kind" + (k === kind ? " ui-diary-on" : "")}
                                aria-pressed={k === kind}
                                onClick={() => setKind(k)}
                            >
                                {t(`diary.kind.${k}`)}
                            </button>
                        ))}
                    </div>
                    <select
                        className="ui-diary-map"
                        value={mapId}
                        aria-label={t("diary.filter_map")}
                        onChange={(event) => setMapId(event.target.value)}
                    >
                        <option value="">{t("diary.map_any")}</option>
                        {maps.map((map) => (
                            <option key={map.id} value={map.id}>
                                {mapName(map)}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="ui-diary-body">
                    <div
                        className="ui-diary-list ui-diary-inset"
                        role="group"
                        aria-label={t("diary.list")}
                    >
                        {shown.length === 0 && <p className="ui-diary-empty">{t("diary.empty")}</p>}
                        {shown.map((e) => (
                            <button
                                key={e.id}
                                className={
                                    "ui-diary-row" + (e === entry ? " ui-diary-row-open" : "")
                                }
                                aria-pressed={e === entry}
                                onClick={() => open(e.id)}
                            >
                                <LazyHead def={e.variants[0].def} />
                                <span className="ui-diary-row-name">
                                    {enemyName(e.variants[0].def)}
                                </span>
                                {e.kind === "boss" && <span className="ui-diary-tag">★</span>}
                            </button>
                        ))}
                    </div>
                    <div className="ui-diary-page ui-diary-inset">
                        {entry && variant && (
                            <>
                                <div className="ui-diary-head">
                                    <div className="ui-diary-model">
                                        <div className="ui-diary-portrait">
                                            <Portrait
                                                def={variant.def}
                                                body={body}
                                                turn={turn}
                                                size={112}
                                            />
                                        </div>
                                        <div
                                            className="ui-diary-model-buttons"
                                            role="group"
                                            aria-label={t("diary.model")}
                                        >
                                            <button
                                                className={
                                                    "ui-diary-kind" + (!body ? " ui-diary-on" : "")
                                                }
                                                aria-pressed={!body}
                                                onClick={() => setBody(false)}
                                            >
                                                {t("diary.view_head")}
                                            </button>
                                            <button
                                                className={
                                                    "ui-diary-kind" + (body ? " ui-diary-on" : "")
                                                }
                                                aria-pressed={body}
                                                onClick={() => setBody(true)}
                                            >
                                                {t("diary.view_body")}
                                            </button>
                                            <button
                                                className="ui-diary-kind"
                                                disabled={!body}
                                                aria-label={t("diary.turn_left")}
                                                title={t("diary.turn_left")}
                                                onClick={() => setTurn((n) => (n + 1) % 8)}
                                            >
                                                ⟲
                                            </button>
                                            <button
                                                className="ui-diary-kind"
                                                disabled={!body}
                                                aria-label={t("diary.turn_right")}
                                                title={t("diary.turn_right")}
                                                onClick={() => setTurn((n) => (n + 7) % 8)}
                                            >
                                                ⟳
                                            </button>
                                        </div>
                                        {(variant.def.outfits || variant.def.npcId < 0) && (
                                            <p className="ui-diary-note">{t("diary.no_model")}</p>
                                        )}
                                    </div>
                                    <div className="ui-diary-ident">
                                        <h3 className="ui-diary-name">{enemyName(variant.def)}</h3>
                                        <div className="ui-diary-kinds-line">
                                            {t(`diary.kind.${entry.kind}`)}
                                            {" · "}
                                            {kills > 0
                                                ? t("diary.killed", { n: fmtNum(kills) })
                                                : t("diary.not_killed")}
                                        </div>
                                        {entry.variants.length > 1 && (
                                            <div
                                                className="ui-diary-forms"
                                                role="group"
                                                aria-label={t("diary.forms")}
                                            >
                                                {entry.variants.map((v, i) => (
                                                    <button
                                                        key={v.def.id}
                                                        className={
                                                            "ui-diary-kind" +
                                                            (v === variant ? " ui-diary-on" : "")
                                                        }
                                                        aria-pressed={v === variant}
                                                        onClick={() => setForm(i)}
                                                    >
                                                        {t("diary.form", { n: i + 1 })}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {traitsOf(variant.def).length > 0 && (
                                            <ul
                                                className="ui-diary-traits"
                                                aria-label={t("diary.traits")}
                                            >
                                                {traitsOf(variant.def).map((trait) => (
                                                    <li key={trait}>{trait}</li>
                                                ))}
                                            </ul>
                                        )}
                                        <Stats variant={variant} />
                                        {variant.def.boss && (
                                            <p className="ui-diary-attacks">
                                                <b>{t("diary.stat.attacks")}: </b>
                                                {[
                                                    ...new Set(
                                                        variant.def.boss.attacks.map((a) => a.name),
                                                    ),
                                                ].join(", ")}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="ui-diary-scroll">
                                    {entry.drops.length > 0 && (
                                        <>
                                            <h4 className="ui-diary-h">{t("diary.drops")}</h4>
                                            <p className="ui-diary-drops">{list(entry.drops)}</p>
                                        </>
                                    )}
                                    <h4 className="ui-diary-h">{t("diary.where_when")}</h4>
                                    <ul className="ui-diary-where">
                                        {where.map((w) => {
                                            const map = MAP_BY_ID.get(w.mapId);
                                            return (
                                                <li key={w.mapId}>
                                                    <b>{map ? mapName(map) : w.mapId}</b>
                                                    {w.lines.map((line) => (
                                                        <div key={line}>{line}</div>
                                                    ))}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    {entry.lore ? (
                                        <>
                                            <h4 className="ui-diary-h">{t("diary.about")}</h4>
                                            <p>{entry.lore.about}</p>
                                            <h4 className="ui-diary-h">{t("diary.in_osrs")}</h4>
                                            <p>{entry.lore.where}</p>
                                            {entry.lore.trivia.length > 0 && (
                                                <>
                                                    <h4 className="ui-diary-h">
                                                        {t("diary.trivia")}
                                                    </h4>
                                                    <ul className="ui-diary-trivia">
                                                        {entry.lore.trivia.map((line) => (
                                                            <li key={line}>{line}</li>
                                                        ))}
                                                    </ul>
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <p className="ui-diary-note">{t("diary.no_lore")}</p>
                                    )}
                                    <p className="ui-diary-note">{t("diary.lore_english")}</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <div className="ui-row ui-diary-foot">
                    <button className="ui-button" onClick={close}>
                        {t("canvas.back")}
                    </button>
                </div>
            </div>
        </div>
    );
}
