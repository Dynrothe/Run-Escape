import { useEffect, useRef, useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { formatTime } from "../client/GameView";
import {
    COIN_BONUS_CAP,
    HARD_PRESET,
    INVOCATIONS,
    INVOCATION_BADGES,
    INVOCATION_BY_ID,
    INVOCATION_GROUPS,
    MAX_INVOCATION_PRESETS,
    MAX_PRESET_NAME,
    MAX_RAID_LEVEL,
    OFF_SPRITE,
    RAID_BAND_SPRITES,
    RUN_INVOCATIONS,
    RUN_SET,
    RunInvocationDef,
    TOMBS_UNIQUES,
    getInvocationCoins,
    getInvocationPoints,
    getRaidBand,
    getRaidLevel,
    getRaidLevelScale,
    invocationDescription,
    invocationName,
    presetName,
} from "../content/invocations";
import { getMap, mapName } from "../content/maps";
import { isHardUnlocked } from "../core/save";
import { t } from "../i18n";
import { ItemIcon } from "./ItemIcon";
import { useMenuKeys } from "./menuKeys";
import { useDialog } from "./useDialog";

// The Tombs of Amascut's raid level, and the way to its invocation board
export function InvocationsButton({
    ui,
    onOpen,
}: {
    ui: UiSnapshot;
    onOpen: () => void;
}): JSX.Element {
    const level = getRaidLevel(ui.save.invocations ?? []);
    return (
        <button className="ui-button ui-invocations-button" onClick={onOpen}>
            Invocations
            <span className="ui-invocations-level">
                Raid level {level} ({getRaidBand(level)})
            </span>
        </button>
    );
}

// The invocation board, as OSRS's: every invocation's icon in a grid, lit while it's on, and beside
// it the reward potential (the raid level, its band's Amascut and what the chest can hold). Pointing
// at an icon says what it is below; clicking turns it on or off, and one of a group that allows only
// one takes the last off.
// A scale as a change: 0.6 is "-40%", 1.1 "+10%"
function signedPercent(scale: number): string {
    const percent = Math.round((scale - 1) * 100);
    return `${percent >= 0 ? "+" : ""}${percent}%`;
}

export function InvocationBoard({
    ui,
    client,
    onClose,
}: {
    ui: UiSnapshot;
    client: GameClient;
    onClose: () => void;
}): JSX.Element {
    const on = ui.save.invocations ?? [];
    const level = getRaidLevel(on);
    const band = getRaidBand(level);
    const scale = getRaidLevelScale(level);
    const [shown, setShown] = useState<string>();
    const pointed = shown === undefined ? undefined : INVOCATION_BY_ID.get(shown);
    // A touch screen has no pointing: a tap shows one, and a tap on the one shown switches it.
    // Decided as it's pressed, before the press focuses it (which shows it)
    const readOnly = useRef(false);
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    useMenuKeys({ onBack: onClose, onConfirm: onClose });
    const { titleId, dialogProps } = useDialog<HTMLDivElement>();
    return (
        <div className="ui-modal">
            <div {...dialogProps} className="ui-panel rs-border rs-background ui-invocations">
                <h2 id={titleId} className="ui-invocations-title">
                    Invocations
                </h2>
                {/* What scrolls on a short screen, so Reset All and Done stay in view */}
                <div className="ui-invocations-scroll">
                    <div className="ui-invocations-body">
                        <div
                            className="ui-invocations-grid"
                            onMouseLeave={() => setShown(undefined)}
                        >
                            {INVOCATIONS.map((invocation) => {
                                const picked = on.includes(invocation.id);
                                return (
                                    <button
                                        key={invocation.id}
                                        className={
                                            "ui-invocation" + (picked ? " ui-invocation-on" : "")
                                        }
                                        aria-label={invocation.name}
                                        aria-pressed={picked}
                                        title={invocation.name}
                                        onMouseEnter={() => setShown(invocation.id)}
                                        onFocus={() => setShown(invocation.id)}
                                        onPointerDown={(e) => {
                                            readOnly.current =
                                                e.pointerType === "touch" &&
                                                shown !== invocation.id;
                                        }}
                                        onClick={() => {
                                            const read = readOnly.current;
                                            readOnly.current = false;
                                            setShown(invocation.id);
                                            if (!read) {
                                                client.toggleInvocation(invocation.id);
                                            }
                                        }}
                                    >
                                        <ItemIcon
                                            objId={-1}
                                            spriteId={
                                                picked
                                                    ? invocation.icon
                                                    : invocation.icon + OFF_SPRITE
                                            }
                                            size={36}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                        <div className="ui-invocations-reward">
                            <div className="ui-invocations-reward-title">Reward Potential</div>
                            <div className="ui-invocations-level-row">
                                <span className="ui-invocations-number">{level}</span>
                                <ItemIcon objId={-1} spriteId={RAID_BAND_SPRITES[band]} size={40} />
                                <span className="ui-invocations-band">{band}</span>
                            </div>
                            <div className="ui-invocations-bar" aria-hidden>
                                <div
                                    className="ui-invocations-bar-fill"
                                    style={{
                                        width: `${Math.min(100, (level / MAX_RAID_LEVEL) * 100)}%`,
                                    }}
                                />
                            </div>
                            <div className="ui-invocations-scale">
                                Enemies {signedPercent(scale.hp)} hitpoints,{" "}
                                {signedPercent(scale.damage)} damage
                            </div>
                            <div className="ui-invocations-uniques">
                                {TOMBS_UNIQUES.map((unique) => {
                                    const out = level < unique.minLevel;
                                    return (
                                        <span
                                            key={unique.objId}
                                            className={
                                                "ui-invocations-unique" +
                                                (out ? " ui-invocations-unique-out" : "")
                                            }
                                            title={
                                                out
                                                    ? `${unique.name}: from raid level ${unique.minLevel}`
                                                    : unique.name
                                            }
                                        >
                                            <ItemIcon objId={unique.objId} size={32} />
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="ui-invocations-detail">
                        {pointed ? (
                            <>
                                <span className="ui-invocations-detail-name">
                                    {pointed.name}{" "}
                                    <span className="ui-invocations-detail-level">
                                        +{pointed.level}
                                    </span>
                                </span>
                                <span>
                                    {pointed.description}
                                    {INVOCATION_GROUPS.find((g) => g.id === pointed.group)?.one &&
                                        " Only one of its kind can be on."}
                                </span>
                            </>
                        ) : (
                            <span className="ui-subtle">
                                {touch
                                    ? "Tap an invocation to see what it does, and again to switch it."
                                    : "Point at an invocation to see what it does."}
                            </span>
                        )}
                    </div>
                    <InvocationPresets ui={ui} client={client} on={on} level={level} />
                </div>
                <div className="ui-invocations-buttons">
                    <button className="ui-button" onClick={() => client.clearInvocations()}>
                        Reset All
                    </button>
                    <button className="ui-button ui-button-go" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

// The board's saved setups (SaveData.invocationPresets): each loads in one go, and the board as it
// is (on, coming to level) saves as one, named or by its raid level, over one of the same name
export function InvocationPresets({
    ui,
    client,
    on,
    level: boardLevel,
}: {
    ui: UiSnapshot;
    client: GameClient;
    on: readonly string[];
    level: number;
}): JSX.Element {
    const presets = ui.save.invocationPresets ?? [];
    const [name, setName] = useState("");
    // The preset whose Delete was pressed once: a second press deletes it, so a slip beside its
    // load button doesn't
    const [deleting, setDeleting] = useState<string>();
    const saveButton = useRef<HTMLButtonElement>(null);
    // Set as a preset's deleted: its button's gone, so the focus goes on to Save once it's drawn
    // (Save can't take it before then while the list was full). Not to the name box, which would
    // bring up a phone's keyboard.
    const refocus = useRef(false);
    useEffect(() => {
        if (refocus.current) {
            refocus.current = false;
            saveButton.current?.focus();
        }
    });
    // Any other press takes the second press back, as moving the focus off it does: Safari gives
    // a pressed button no focus, so it never blurs
    useEffect(() => {
        if (deleting === undefined) {
            return;
        }
        const disarm = (e: PointerEvent) => {
            if (!(e.target instanceof Element && e.target.closest(".ui-invocations-preset-sure"))) {
                setDeleting(undefined);
            }
        };
        window.addEventListener("pointerdown", disarm, true);
        return () => window.removeEventListener("pointerdown", disarm, true);
    }, [deleting]);
    const named = presetName(name, boardLevel);
    const replaces = presets.some((p) => p.name === named);
    const full = presets.length >= MAX_INVOCATION_PRESETS && !replaces;
    const same = (ids: readonly string[]) =>
        ids.length === on.length && ids.every((id) => on.includes(id));
    return (
        <div className="ui-invocations-presets">
            <div className="ui-invocations-presets-title">Presets</div>
            {presets.length === 0 ? (
                <span className="ui-subtle">None saved yet.</span>
            ) : (
                <div className="ui-invocations-preset-list">
                    {presets.map((preset) => {
                        const level = getRaidLevel(preset.invocations);
                        // Named by its level already, it isn't said twice
                        const byLevel = preset.name === presetName("", level);
                        const current = same(preset.invocations);
                        const sure = deleting === preset.name;
                        return (
                            <div key={preset.name} className="ui-invocations-preset">
                                <button
                                    className={
                                        "ui-button ui-invocations-preset-load" +
                                        (current ? " ui-invocations-preset-on" : "")
                                    }
                                    aria-label={
                                        byLevel
                                            ? `Load ${preset.name}`
                                            : `Load ${preset.name}, raid level ${level}`
                                    }
                                    aria-current={current || undefined}
                                    onClick={() => client.loadInvocationPreset(preset.name)}
                                >
                                    {preset.name}
                                    {!byLevel && (
                                        <span className="ui-invocations-preset-level">
                                            level {level}
                                        </span>
                                    )}
                                </button>
                                {/* Smaller than what it's beside: it's not the button to reach for */}
                                <button
                                    className={
                                        "ui-button ui-button-small" +
                                        (sure ? " ui-invocations-preset-sure" : "")
                                    }
                                    aria-label={
                                        sure
                                            ? `Press again to delete ${preset.name}`
                                            : `Delete ${preset.name}`
                                    }
                                    onBlur={() => sure && setDeleting(undefined)}
                                    onClick={() => {
                                        if (!sure) {
                                            setDeleting(preset.name);
                                            return;
                                        }
                                        setDeleting(undefined);
                                        refocus.current = true;
                                        client.deleteInvocationPreset(preset.name);
                                    }}
                                >
                                    {sure ? "Sure?" : "Delete"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            <form
                className="ui-invocations-preset-save"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!full) {
                        client.saveInvocationPreset(name);
                        setName("");
                    }
                }}
            >
                <input
                    className="ui-coop-input"
                    value={name}
                    maxLength={MAX_PRESET_NAME}
                    placeholder={presetName("", boardLevel)}
                    aria-label="Preset name"
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => setName(e.target.value)}
                />
                <button ref={saveButton} className="ui-button" type="submit" disabled={full}>
                    {replaces ? "Replace" : "Save"}
                </button>
            </form>
            {full && (
                <span className="ui-subtle">
                    All {MAX_INVOCATION_PRESETS} are used: delete one, or save over one by its name.
                </span>
            )}
        </div>
    );
}

// ---- A run's invocations (content/invocations.ts, RUN_SET) ----

// On a map from the Desert on: the points the card's invocations come to (hard mode's preset with
// them when the Hard switch is on), and the way to the board
// A co-op room's board goes by its map and its Hard (room)
type RoomSetup = { mapId: string; hard: boolean };

export function RunInvocationsButton({
    ui,
    room,
    onOpen,
}: {
    ui: UiSnapshot;
    room?: RoomSetup;
    onOpen: () => void;
}): JSX.Element {
    const points = getInvocationPoints(runBoardOn(ui, room));
    return (
        <button className="ui-button ui-invocations-button" onClick={onOpen}>
            {t("ui.invocations.title")}
            <span className="ui-invocations-level">{t("ui.invocations.points", { points })}</span>
        </button>
    );
}

// What's on the run's board: the card's picks, and hard mode's preset while the Hard switch is on
// (and open)
function runBoardOn(ui: UiSnapshot, room?: RoomSetup): string[] {
    const hard = room ? room.hard : ui.hard && isHardUnlocked(ui.save, ui.mapId);
    return [...(ui.save.runInvocations ?? []), ...(hard ? HARD_PRESET : [])];
}

// The run's board, as the Tombs' is: each invocation's icon lit while it's on, what one does below
// it, and beside it the points, the coins they add and the badges they're worth. Hard mode's four
// are a row of their own, which the Hard switch turns on and off together.
export function RunInvocationBoard({
    ui,
    client,
    room,
    onClose,
}: {
    ui: UiSnapshot;
    client: GameClient;
    room?: RoomSetup;
    onClose: () => void;
}): JSX.Element {
    const mapId = room?.mapId ?? ui.mapId;
    const map = getMap(mapId);
    const on = runBoardOn(ui, room);
    const points = getInvocationPoints(on);
    const coins = Math.round(Math.min(COIN_BONUS_CAP, getInvocationCoins(on)) * 100);
    const hardOpen = isHardUnlocked(ui.save, mapId);
    const best = ui.save.invocationBest?.[mapId];
    const [shown, setShown] = useState<string>();
    const pointed = shown === undefined ? undefined : RUN_SET.byId.get(shown);
    const readOnly = useRef(false);
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const icon = (invocation: RunInvocationDef) => {
        const picked = on.includes(invocation.id);
        const locked = invocation.hard && !hardOpen;
        const name = invocationName(invocation);
        return (
            <button
                key={invocation.id}
                className={
                    "ui-invocation" +
                    (picked ? " ui-invocation-on" : "") +
                    (locked ? " ui-invocation-locked" : "")
                }
                aria-label={name}
                aria-pressed={picked}
                title={name}
                onMouseEnter={() => setShown(invocation.id)}
                onFocus={() => setShown(invocation.id)}
                onPointerDown={(e) => {
                    readOnly.current = e.pointerType === "touch" && shown !== invocation.id;
                }}
                onClick={() => {
                    const read = readOnly.current;
                    readOnly.current = false;
                    setShown(invocation.id);
                    if (!read && !locked) {
                        client.toggleRunInvocation(invocation.id);
                    }
                }}
            >
                <ItemIcon
                    objId={-1}
                    spriteId={picked ? invocation.icon : invocation.icon + OFF_SPRITE}
                    size={36}
                />
            </button>
        );
    };
    return (
        <div className="ui-modal">
            <div className="ui-panel rs-border rs-background ui-invocations">
                <h2 className="ui-invocations-title">{t("ui.invocations.title")}</h2>
                <div className="ui-invocations-scroll">
                    <div className="ui-invocations-body">
                        <div
                            className="ui-invocations-groups"
                            onMouseLeave={() => setShown(undefined)}
                        >
                            <div className="ui-invocations-grid">
                                {RUN_INVOCATIONS.filter((i) => !i.hard).map(icon)}
                            </div>
                            <div className="ui-invocations-group-title">
                                {hardOpen
                                    ? t("ui.invocations.hard_group")
                                    : t("ui.hard.tooltip.locked", { map: mapName(map) })}
                            </div>
                            <div className="ui-invocations-grid ui-invocations-grid-hard">
                                {RUN_INVOCATIONS.filter((i) => i.hard).map(icon)}
                            </div>
                        </div>
                        <div className="ui-invocations-reward">
                            <div className="ui-invocations-reward-title">
                                {t("ui.invocations.total")}
                            </div>
                            <div className="ui-invocations-level-row">
                                <span className="ui-invocations-number">{points}</span>
                            </div>
                            <div className="ui-invocations-bar" aria-hidden>
                                <div
                                    className="ui-invocations-bar-fill"
                                    style={{
                                        width: `${Math.min(100, (points / INVOCATION_BADGES[INVOCATION_BADGES.length - 1]) * 100)}%`,
                                    }}
                                />
                            </div>
                            <div className="ui-invocations-scale">
                                {t("ui.invocations.coins", { percent: coins })}
                            </div>
                            <InvocationBadges points={points} best={best?.points ?? 0} />
                            {best && (
                                <div className="ui-invocations-scale">
                                    {t("ui.invocations.best", {
                                        points: best.points,
                                        time: formatTime(best.seconds),
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="ui-invocations-detail">
                        {pointed ? (
                            <>
                                <span className="ui-invocations-detail-name">
                                    {invocationName(pointed)}{" "}
                                    <span className="ui-invocations-detail-level">
                                        {t("ui.invocations.detail_points", {
                                            points: pointed.level,
                                        })}
                                    </span>
                                </span>
                                <span>{invocationDescription(pointed)}</span>
                            </>
                        ) : (
                            <span className="ui-subtle">
                                {touch
                                    ? t("ui.invocations.tap_hint")
                                    : t("ui.invocations.point_hint")}
                            </span>
                        )}
                    </div>
                    <span className="ui-subtle">{t("ui.invocations.coin_cap")}</span>
                </div>
                <div className="ui-invocations-buttons">
                    <button className="ui-button" onClick={() => client.clearRunInvocations()}>
                        {t("ui.invocations.reset")}
                    </button>
                    <button className="ui-button ui-button-go" onClick={onClose}>
                        {t("ui.invocations.done")}
                    </button>
                </div>
            </div>
        </div>
    );
}

// The card's badges at 100, 200 and 300 points: lit once beaten at as many (best), and the next the
// board's points would earn marked
export function InvocationBadges({ points, best }: { points?: number; best: number }): JSX.Element {
    return (
        <div className="ui-invocation-badges">
            {INVOCATION_BADGES.map((badge) => (
                <span
                    key={badge}
                    className={
                        "ui-invocation-badge" +
                        (best >= badge ? " ui-invocation-badge-won" : "") +
                        (points !== undefined && points >= badge ? " ui-invocation-badge-on" : "")
                    }
                    title={t("ui.invocations.badge_aria", { points: badge })}
                >
                    {badge}
                </span>
            ))}
        </div>
    );
}
