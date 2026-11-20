import { CSSProperties, Fragment, useEffect, useRef, useState } from "react";

import { GameClient } from "../client/GameClient";
import { ChestView, ItemView } from "../client/GameStore";
import { StatPair } from "../content/stats";
import { CHANGE_SPRITES } from "../content/titleIcons";
import { ChestAction } from "../core/Loot";
import { fmtNum, list, t, tl, tp } from "../i18n";
import { BanishButton } from "./BanishButton";
import { CentredIcon, StatGlyph } from "./CentredIcon";
import "./ChestModal.css";
import { Coins } from "./Coins";
import { ItemLines } from "./DescriptionButton";
import { ItemIcon } from "./ItemIcon";
import { KeyHint } from "./PadHint";
import { RerollButton } from "./RerollButton";
import { StatLine } from "./StatLine";
import { useDialog } from "./useDialog";
import { useSpriteFrame } from "./useSpriteFrame";

// Opening a reward casket: it drops in, rattles harder and harder while it
// glows its tier's colour, then bursts open in the item's rarity colour (rays,
// sparks, coins) and the item floats out. Then the player decides what to do
// with it. Space or a click skips ahead.
//
// The phases are timed here (ms after the casket appears) and drive the CSS
// animations through data-phase.

type Phase = "drop" | "shake" | "burst" | "reveal";

const LAND_MS = 380;
const SHAKE_MS = 520;
// The rattles come faster and faster
const RATTLE_MS = [620, 840, 1020, 1170, 1290, 1390, 1470, 1540, 1600];
const BURST_MS = 1650;
const COINS_MS = 1800;
const REVEAL_MS = 2200;
// Skipping still shows the burst, briefly
const SKIP_REVEAL_MS = 380;

// Fixed scatters, so re-renders don't move anything
function scatter(count: number, seed: number, make: (random: () => number, i: number) => object) {
    let state = seed;
    const random = () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
    return Array.from({ length: count }, (_, i) => make(random, i) as CSSProperties);
}

const SPARKS = scatter(30, 7, (random, i) => ({
    "--a": `${(i / 30) * 360 + random() * 10}deg`,
    "--d": `${110 + random() * 150}px`,
    "--s": `${4 + random() * 5}px`,
    "--delay": `${Math.round(random() * 90)}ms`,
}));

// The rays behind the opened casket, as wedges from the centre of a 640 box.
// Their fade outwards is in their fill (RaySet), not a mask: a mask over
// turning layers is drawn again offscreen every frame, a big surface on a
// phone.
const RAY_BOX = 640;

// One path of wedges `width` degrees wide, every `step` from `from`, clockwise
// from the top
function rayPath(width: number, step: number, from: number): string {
    const c = RAY_BOX / 2;
    const point = (deg: number) => {
        const rad = (deg * Math.PI) / 180;
        return `${(c + c * Math.sin(rad)).toFixed(1)} ${(c - c * Math.cos(rad)).toFixed(1)}`;
    };
    let d = "";
    for (let a = from; a < from + 360; a += step) {
        d += `M${c} ${c}L${point(a)}A${c} ${c} 0 0 1 ${point(a + width)}Z`;
    }
    return d;
}

const RAYS = rayPath(6, 22.5, 0);
// Rarer items get a second, finer set turning the other way
const FINE_RAYS = rayPath(2, 30, 11);

function RaySet({ id, path, className }: { id: string; path: string; className: string }) {
    const c = RAY_BOX / 2;
    return (
        <svg className={className} viewBox={`0 0 ${RAY_BOX} ${RAY_BOX}`} aria-hidden>
            <defs>
                {/* Solid to 12% of the way to the box's corner, gone by 68% */}
                <radialGradient
                    id={id}
                    gradientUnits="userSpaceOnUse"
                    cx={c}
                    cy={c}
                    r={c * Math.SQRT2}
                >
                    <stop offset="0.12" />
                    <stop offset="0.68" stopOpacity="0" />
                </radialGradient>
            </defs>
            <path d={path} fill={`url(#${id})`} />
        </svg>
    );
}

const COIN_ARCS = scatter(10, 3, (random, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    return {
        "--x": `${side * (50 + random() * 150)}px`,
        "--peak": `${-90 - random() * 80}px`,
        "--fall": `${70 + random() * 70}px`,
        "--r": `${side * (180 + random() * 360)}deg`,
        "--delay": `${80 + Math.round(random() * 160)}ms`,
    };
});

type ActionButton = { action: ChestAction; label: string; disabled?: boolean };

function getActions(chest: ChestView): ActionButton[] {
    const alch = {
        action: "alch" as const,
        label: t("chest.high_alch", { coins: fmtNum(chest.alchCoins) }),
    };
    if (chest.isGear) {
        return [{ action: "take", label: t("chest.equip") }, alch];
    }
    if (chest.instant) {
        return [{ action: "use", label: t("chest.take") }, alch];
    }
    return [
        {
            action: "take",
            label: chest.canStash ? t("chest.keep") : t("chest.inventory_full"),
            disabled: !chest.canStash,
        },
        { action: "use", label: t("chest.use_now") },
        alch,
    ];
}

type Props = { chest: ChestView; rerolls: number; banishes: number; client: GameClient };

// Mount with key={chest.uid} so every casket gets its own animation
export function ChestModal({ chest, rerolls, banishes, client }: Props): JSX.Element {
    const [phase, setPhase] = useState<Phase>("drop");
    // Bumped by each reroll, so the new item bursts out like the first
    const [rolls, setRolls] = useState(0);
    const timers = useRef<number[]>([]);
    const opened = useRef(false);
    const actions = getActions(chest);

    const schedule = (ms: number, fn: () => void) => {
        timers.current.push(window.setTimeout(fn, ms));
    };
    const clearTimers = () => {
        timers.current.forEach((t) => window.clearTimeout(t));
        timers.current = [];
    };
    const open = () => {
        if (!opened.current) {
            opened.current = true;
            client.playChestSound("open", chest.rarity);
            setPhase("burst");
        }
    };

    useEffect(() => {
        schedule(LAND_MS, () => client.playChestSound("land", chest.rarity));
        for (const ms of RATTLE_MS) {
            schedule(ms, () => client.playChestSound("rattle", chest.rarity));
        }
        schedule(SHAKE_MS, () => setPhase("shake"));
        schedule(BURST_MS, open);
        schedule(COINS_MS, () => client.playChestSound("coins", chest.rarity));
        schedule(REVEAL_MS, () => setPhase("reveal"));
        return clearTimers;
        // Once per casket (the component is keyed by it)
    }, []);

    // Straight to the burst, then the item
    const skip = () => {
        if (phase === "reveal") {
            return;
        }
        clearTimers();
        if (opened.current) {
            setPhase("reveal");
            return;
        }
        open();
        schedule(SKIP_REVEAL_MS, () => setPhase("reveal"));
    };

    const act = (action: ChestAction) => {
        clearTimers();
        client.resolveChest(action);
    };

    // A banished item is alched, which is the casket done
    const banish = () => {
        clearTimers();
        client.banish();
    };

    // Another item from the same casket (the client plays the burst's sound)
    const reroll = () => {
        if (client.reroll()) {
            setRolls((n) => n + 1);
            setPhase("burst");
            schedule(SKIP_REVEAL_MS, () => setPhase("reveal"));
        }
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            // Nor what's typed in a box (co-op's chat, open as the casket came)
            if (
                event.repeat ||
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement
            ) {
                return;
            }
            const confirm = event.code === "Space" || event.code === "Enter";
            // A focused button answers Enter and Space with its own click,
            // so taking the recommended action too would answer twice (and
            // the second would land on the next casket)
            if (confirm && event.target instanceof HTMLButtonElement) {
                return;
            }
            if (phase !== "reveal") {
                if (confirm) {
                    skip();
                }
                return;
            }
            if (confirm) {
                act(chest.recommended);
            } else if (event.code === "KeyR") {
                reroll();
            } else if (event.code.startsWith("Digit")) {
                const button = actions[parseInt(event.code.slice(5)) - 1];
                if (button && !button.disabled) {
                    act(button.action);
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    const opening = phase === "burst" || phase === "reveal";
    const style = {
        "--tier": chest.tierColor,
        "--rarity": chest.item.rarity.color,
    } as CSSProperties;
    const { dialogProps } = useDialog<HTMLDivElement>();
    return (
        <div
            {...dialogProps}
            aria-labelledby={undefined}
            aria-label={tl(chest.casketName)}
            className="ui-modal ui-chest"
            data-phase={phase}
            data-rarity={chest.rarity}
            style={style}
            onClick={skip}
        >
            <div className="ui-chest-flash" />
            <div className="ui-chest-scene">
                <div className="ui-chest-rays">
                    <RaySet id="ui-chest-rays-fade" path={RAYS} className="ui-chest-rays-main" />
                    <RaySet
                        id="ui-chest-rays-fine-fade"
                        path={FINE_RAYS}
                        className="ui-chest-rays-fine"
                    />
                </div>
                <div className="ui-chest-halo" />
                <div className="ui-chest-shockwave" />
                <div className="ui-chest-casket">
                    <div className="ui-chest-casket-inner">
                        <ItemIcon objId={chest.casketObjId} size={110} />
                    </div>
                </div>
                {opening && (
                    <>
                        <div key={`sparks-${rolls}`} className="ui-chest-sparks">
                            {SPARKS.map((style, i) => (
                                <span key={i} style={style} />
                            ))}
                        </div>
                        {/* The coins only spill the once: a reroll doesn't add any */}
                        <div className="ui-chest-coins">
                            {COIN_ARCS.map((style, i) => (
                                <span key={i} style={style}>
                                    <ItemIcon objId={995} size={22} />
                                </span>
                            ))}
                        </div>
                        <div key={`item-${rolls}`} className="ui-chest-item">
                            <ItemIcon objId={chest.item.objId} size={92} />
                        </div>
                    </>
                )}
                {/* Drawn ahead of time so it's there when the casket opens */}
                <div className="ui-chest-preload">
                    <ItemIcon objId={chest.item.objId} size={92} />
                    <ItemIcon objId={995} size={22} />
                </div>
            </div>
            <div className="ui-chest-caption">
                {opening ? (
                    <Fragment key={rolls}>
                        <div className="ui-chest-name">{tl(chest.item.name)}</div>
                        <div className="ui-chest-rarity">
                            {t("chest.rarity_exclaim", { rarity: tl(chest.item.rarity.name) })}
                        </div>
                    </Fragment>
                ) : (
                    <div className="ui-chest-casket-name">{tl(chest.casketName)}</div>
                )}
            </div>
            {phase === "reveal" && (
                <ChestCard
                    chest={chest}
                    actions={actions}
                    onAction={act}
                    rerolls={rerolls}
                    onReroll={reroll}
                    banishes={banishes}
                    onBanish={banish}
                />
            )}
            {!opening && <div className="ui-chest-hint">{t("chest.open_hint")}</div>}
        </div>
    );
}

function ChestCard({
    chest,
    actions,
    onAction,
    rerolls,
    onReroll,
    banishes,
    onBanish,
}: {
    chest: ChestView;
    actions: ActionButton[];
    onAction: (action: ChestAction) => void;
    rerolls: number;
    onReroll: () => void;
    banishes: number;
    onBanish: () => void;
}): JSX.Element {
    const item = chest.item;
    const replaces = chest.replaces;
    return (
        <div
            className={
                "ui-panel rs-border rs-background ui-chest-card" +
                (replaces ? " ui-chest-card-compare" : "")
            }
            onClick={(e) => e.stopPropagation()}
        >
            {/* What it is: in a short window this scrolls, and the buttons under it stay */}
            <div className="ui-chest-card-body">
                <div className="ui-chest-card-head">
                    <ItemIcon objId={item.objId} size={40} />
                    <div className="ui-card-body">
                        <div
                            className="ui-card-title ui-chest-title"
                            style={{ color: item.rarity.color }}
                        >
                            <span>{tl(item.name)}</span>
                            {replaces && <ChangeSummary stats={replaces.stats} />}
                        </div>
                        <div className="ui-chest-kind">
                            {t("chest.kind", {
                                rarity: tl(item.rarity.name),
                                kind: item.kindLabel,
                            })}
                        </div>
                        {chest.upgradedFrom && (
                            <div className="ui-chest-upgraded">
                                {t("chest.upgraded_from", { name: tl(chest.upgradedFrom) })}
                            </div>
                        )}
                    </div>
                    <div className="ui-chest-found">
                        {t("chest.found")} <Coins amount={chest.coins} />
                    </div>
                </div>
                {/* Against a worn piece its stats are in the table */}
                {!replaces && (
                    <ul className="ui-chest-lines">
                        <ItemLines item={item} wrap={(line, key) => <li key={key}>{line}</li>} />
                    </ul>
                )}
                <SetLine item={item} />
                {replaces && <GearCompare chest={chest} replaces={replaces} />}
                {chest.isGear && !replaces && (
                    <div className="ui-chest-compare">
                        {t("chest.nothing_equipped", { kind: item.kindLabel.toLowerCase() })}
                    </div>
                )}
                {!chest.isGear && (
                    <div className="ui-chest-compare">
                        {chest.instant
                            ? t("chest.instant")
                            : chest.carried > 0
                              ? t("chest.carried", { n: fmtNum(chest.carried) })
                              : t("chest.kept_items")}
                    </div>
                )}
            </div>
            <div className="ui-chest-actions">
                {actions.map((button, i) => (
                    <button
                        key={button.action}
                        data-silent
                        className={
                            "ui-button" +
                            (button.action === chest.recommended ? " ui-button-go" : "")
                        }
                        disabled={button.disabled}
                        onClick={() => onAction(button.action)}
                    >
                        <KeyHint keyLabel={String(i + 1)} /> {button.label}
                    </button>
                ))}
            </div>
            <div className="ui-chest-rolls">
                <RerollButton rerolls={rerolls} onReroll={onReroll} />
                {chest.banish && (
                    <BanishButton
                        label={t("chest.banish", { n: fmtNum(banishes) })}
                        title={
                            chest.banish.set
                                ? t("chest.banish_set_hint", { set: tl(chest.banish.set) })
                                : t("chest.banish_hint")
                        }
                        onBanish={onBanish}
                    />
                )}
            </div>
            {chest.queued > 0 && (
                <div className="ui-subtle ui-chest-queued">{tp("chest.queued", chest.queued)}</div>
            )}
        </div>
    );
}

// A set piece: how its set's coming along, green once its bonus is
function SetLine({ item }: { item: ItemView }): JSX.Element | null {
    return item.set ? (
        <div className={"ui-chest-set" + (item.set.active ? " ui-chest-set-on" : "")}>
            <StatLine text={item.set.text} />
        </div>
    ) : null;
}

// Gear against the piece it would replace: that piece, its set, and a row for each stat either
// has. The difference comes first, with a chevron and coloured by whether it's better, then the
// stat, then what's worn and what's new, each under its piece's icon. The rows are in bands, so
// the eye follows one across.
function GearCompare({
    chest,
    replaces,
}: {
    chest: ChestView;
    replaces: NonNullable<ChestView["replaces"]>;
}): JSX.Element {
    const worn = replaces.item;
    return (
        <div className="ui-chest-compare">
            <div className="ui-chest-replaces">
                {t("chest.replaces")}
                <ItemIcon objId={worn.objId} size={22} />
                <span style={{ color: worn.rarity.color }}>{tl(worn.name)}</span>
                <span>{t("chest.worn_rarity", { rarity: tl(worn.rarity.name) })}</span>
                {t("chest.alched_for", { coins: fmtNum(replaces.alchCoins) })}
            </div>
            <SetLine item={worn} />
            <table className="ui-chest-diff">
                <thead>
                    <tr>
                        <td />
                        {/* Named for screen readers; the chevrons and colours say it on screen */}
                        <th scope="col" aria-label={t("chest.difference")} />
                        <td colSpan={2} />
                        <th scope="col" className="ui-chest-diff-was">
                            <CentredIcon icon={{ objId: worn.objId }} box={18} />
                            <span className="ui-chest-diff-label">{t("chest.wearing")}</span>
                        </th>
                        <th scope="col" className="ui-chest-diff-now">
                            <CentredIcon icon={{ objId: chest.item.objId }} box={18} />
                            <span className="ui-chest-diff-label">{t("chest.new")}</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {replaces.stats.map((pair) => {
                        const changed = pair.change !== undefined;
                        const tone = !changed
                            ? "ui-chest-same"
                            : pair.better
                              ? "ui-good"
                              : "ui-bad";
                        return (
                            <tr key={pair.key}>
                                <td className="ui-chest-diff-arrow">
                                    {changed && <Chevron better={pair.better} />}
                                </td>
                                <td className={"ui-chest-diff-change " + tone}>
                                    {pair.change ?? "="}
                                </td>
                                <td className="ui-chest-diff-glyph">
                                    <StatGlyph statKey={pair.key} />
                                </td>
                                <th scope="row" className="ui-chest-diff-name">
                                    {pair.label}
                                </th>
                                <td className="ui-chest-diff-was">{pair.worn ?? "—"}</td>
                                <td className="ui-chest-diff-now">{pair.found ?? "—"}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// The client's chevron, green up or red down, at its own size
function Chevron({ better }: { better: boolean }): JSX.Element {
    const url = useSpriteFrame(better ? CHANGE_SPRITES.better : CHANGE_SPRITES.worse, 0);
    return url ? (
        <img className="ui-chest-chevron" src={url} width={16} height={16} alt="" />
    ) : (
        <span className="ui-chest-chevron" aria-hidden="true" />
    );
}

// Better and worse, each a group of what changes
function changeGroups(stats: StatPair[]): { better: boolean; pairs: StatPair[] }[] {
    return [true, false]
        .map((better) => ({
            better,
            pairs: stats.filter((pair) => pair.change !== undefined && pair.better === better),
        }))
        .filter((group) => group.pairs.length > 0);
}

// Beside the found piece's name, against a worn one: a chevron and the icon of each stat it
// does better, then worse
function ChangeSummary({ stats }: { stats: StatPair[] }): JSX.Element | null {
    const groups = changeGroups(stats);
    if (groups.length === 0) {
        return null;
    }
    // What the icons say, for a tooltip and screen readers
    const said = groups
        .map((group) =>
            t(group.better ? "chest.better" : "chest.worse", {
                list: list(group.pairs.map((pair) => pair.label)),
            }),
        )
        .join(". ");
    return (
        <span className="ui-chest-summary" title={said} aria-label={said}>
            {groups.map((group) => (
                <span key={String(group.better)} className="ui-chest-summary-group">
                    <Chevron better={group.better} />
                    {group.pairs.map((pair) => (
                        <StatGlyph key={pair.key} statKey={pair.key} />
                    ))}
                </span>
            ))}
        </span>
    );
}
