import { useRef, useState, useSyncExternalStore } from "react";

import {
    CinematicDirector,
    DirectorSnapshot,
    ShotCamera,
    ShotField,
} from "../client/CinematicDirector";
import { GameClient } from "../client/GameClient";
import type { TrailerOptions, TrailerProgress } from "../client/TrailerRecorder";
import "./DirectorPanel.css";

// Dev only: the shot editor's panel (client/CinematicDirector.ts), over the run in place of the
// HUD. Dragging anywhere else turns the camera (right or Shift: moves it), and the wheel zooms.
// It's for a mouse and keyboard: it's never in a player's game.

const FIELDS: { field: ShotField; label: string; step: number }[] = [
    { field: "x", label: "x", step: 0.1 },
    { field: "y", label: "y", step: 0.1 },
    { field: "lift", label: "lift", step: 0.1 },
    { field: "pitch", label: "pitch", step: 8 },
    { field: "yaw", label: "yaw", step: 16 },
    { field: "distance", label: "distance", step: 0.5 },
];

const HELP =
    "Drag: turn · Right or Shift drag: move · Wheel: zoom · WASD, Q E: fly (Shift: faster) · " +
    "Arrows: turn · Space: play · Enter: add shot · U: set shot · H: hold · Delete · " +
    "[ ]: shots · , .: step · R: back on the path · V: hide this";

export function DirectorPanel({
    director,
    client,
    trailer,
}: {
    director: CinematicDirector;
    client: GameClient;
    trailer?: TrailerProgress;
}): JSX.Element {
    const snap = useSyncExternalStore(director.subscribe, director.getSnapshot);
    const [code, setCode] = useState<string>();
    const [note, setNote] = useState<string>();
    if (trailer) {
        return <Recording trailer={trailer} client={client} />;
    }
    const shot = snap.shots[snap.selected];

    const copy = async () => {
        const text = director.toCode();
        try {
            await navigator.clipboard.writeText(text);
            setNote(`Copied ${snap.shots.length} shots`);
        } catch {
            // No clipboard here: the code to copy by hand
            setCode(text);
        }
    };

    return (
        <>
            <Stage director={director} />
            {snap.panel && (
                <div className="director-panel">
                    <div className="director-row">
                        {snap.choices.length > 1 && (
                            <select
                                className="director-select"
                                value={snap.choice}
                                onChange={(e) => {
                                    e.currentTarget.blur();
                                    void client.direct(undefined, Number(e.currentTarget.value));
                                }}
                            >
                                {snap.choices.map((choice, i) => (
                                    <option key={choice.key} value={i}>
                                        {choice.label}
                                    </option>
                                ))}
                            </select>
                        )}
                        <Button
                            label="Prev"
                            title="The shot before ([)"
                            onClick={() => director.selectNext(-1)}
                        />
                        <Button
                            label={snap.playing ? "Pause" : "Play"}
                            title="Play or pause (Space)"
                            onClick={() => director.togglePlay()}
                        />
                        <Button
                            label="Next"
                            title="The shot after (])"
                            onClick={() => director.selectNext(1)}
                        />
                        <span className="director-time">
                            {snap.seconds.toFixed(2)} / {snap.duration.toFixed(1)} s
                        </span>
                        <span className="director-gap" />
                        <Button
                            label="Add shot"
                            title="A shot where the camera is, at the playhead (Enter)"
                            onClick={() => director.addShot()}
                        />
                        <Button
                            label="Set shot"
                            title="The selected shot to where the camera is (U)"
                            disabled={snap.selected >= snap.shots.length - 1}
                            onClick={() => director.setShot()}
                        />
                        <Button
                            label="Delete"
                            title="The selected shot taken out (Delete)"
                            disabled={snap.selected <= 0 || snap.selected >= snap.shots.length - 1}
                            onClick={() => director.removeShot()}
                        />
                        <Button
                            label="Back on path"
                            title="The camera back on the path (R)"
                            disabled={!snap.moved}
                            onClick={() => director.resetCamera()}
                        />
                        <span className="director-gap" />
                        <Button label="Copy code" onClick={copy} />
                        <Button
                            label={code === undefined ? "Show code" : "Hide code"}
                            onClick={() =>
                                setCode(code === undefined ? director.toCode() : undefined)
                            }
                        />
                        <Button
                            label="Revert"
                            title="Back to the shots in the file, and the draft dropped"
                            disabled={!snap.edited}
                            onClick={() => {
                                director.revert();
                                setCode(undefined);
                            }}
                        />
                        <Button
                            label="Exit"
                            title="Back to the title"
                            onClick={() => client.leaveRun()}
                        />
                    </div>
                    <Timeline director={director} snap={snap} />
                    <div className="director-row">
                        <span className="director-label">
                            Shot {snap.selected + 1} of {snap.shots.length}
                        </span>
                        {shot && (
                            <NumberField
                                label="at"
                                value={shot.at}
                                step={0.1}
                                disabled={snap.selected === 0}
                                onChange={(value) => director.retime(snap.selected, value)}
                            />
                        )}
                        {shot && "x" in shot ? (
                            <>
                                {FIELDS.map(({ field, label, step }) => (
                                    <NumberField
                                        key={field}
                                        label={label}
                                        value={shot[field]}
                                        step={step}
                                        onChange={(value) =>
                                            director.setField(snap.selected, field, value)
                                        }
                                    />
                                ))}
                                <label className="director-field">
                                    <input
                                        type="checkbox"
                                        checked={shot.hold === true}
                                        onChange={(e) => {
                                            e.currentTarget.blur();
                                            director.toggleHold(snap.selected);
                                        }}
                                    />
                                    <span>hold (H)</span>
                                </label>
                            </>
                        ) : (
                            <span className="director-label">
                                The run's camera, behind the player
                                {snap.selected < snap.shots.length - 1 &&
                                    ": Set shot makes it a shot of its own"}
                            </span>
                        )}
                    </div>
                    <div className="director-row">
                        <span className={snap.moved ? "director-moved" : "director-label"}>
                            {snap.moved
                                ? "Camera moved: Enter adds a shot here, U sets the selected one"
                                : "Camera on the path"}
                        </span>
                        <span className="director-label">{describeCamera(snap.camera)}</span>
                        <span className="director-gap" />
                        {snap.fromDraft && snap.edited && (
                            <span className="director-label">From this browser's draft</span>
                        )}
                        {snap.edited && !snap.fromDraft && (
                            <span className="director-label">Edited (kept as a draft)</span>
                        )}
                        {note && <span className="director-label">{note}</span>}
                    </div>
                    {code !== undefined && (
                        <textarea
                            className="director-code"
                            readOnly
                            value={code}
                            onFocus={(e) => e.currentTarget.select()}
                        />
                    )}
                    <TrailerRow client={client} duration={snap.duration} />
                    <div className="director-help">{HELP}</div>
                </div>
            )}
        </>
    );
}

const SIZES: { label: string; width: number; height: number }[] = [
    { label: "1080p", width: 1920, height: 1080 },
    { label: "1440p", width: 2560, height: 1440 },
    { label: "4K", width: 3840, height: 2160 },
    { label: "720p", width: 1280, height: 720 },
    { label: "Vertical 1080", width: 1080, height: 1920 },
];

const FRAME_RATES = [60, 30];

// A trailer from the cinematic (GameClient.recordTrailer): an MP4 in trailers/
function TrailerRow({ client, duration }: { client: GameClient; duration: number }): JSX.Element {
    const [size, setSize] = useState(0);
    const [fps, setFps] = useState(FRAME_RATES[0]);
    const [from, setFrom] = useState(0);
    const [to, setTo] = useState<number>();
    const [sound, setSound] = useState(true);
    const [live, setLive] = useState(false);
    const [warmup, setWarmup] = useState(10);
    const end = to ?? duration;
    const record = () => {
        const { width, height } = SIZES[size];
        const options: TrailerOptions = { width, height, fps, from, to: end, sound, live, warmup };
        void client.recordTrailer(options);
    };
    return (
        <div className="director-row">
            <span className="director-label">Trailer</span>
            <select
                className="director-select"
                value={size}
                onChange={(e) => {
                    e.currentTarget.blur();
                    setSize(Number(e.currentTarget.value));
                }}
            >
                {SIZES.map((choice, i) => (
                    <option key={choice.label} value={i}>
                        {choice.label}
                    </option>
                ))}
            </select>
            <select
                className="director-select"
                value={fps}
                onChange={(e) => {
                    e.currentTarget.blur();
                    setFps(Number(e.currentTarget.value));
                }}
            >
                {FRAME_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                        {rate} fps
                    </option>
                ))}
            </select>
            <NumberField label="from" value={from} step={0.5} onChange={setFrom} />
            <NumberField label="to" value={end} step={0.5} onChange={setTo} />
            <Check label="sound" checked={sound} onChange={setSound} />
            <Check label="run plays on" checked={live} onChange={setLive} />
            {live && <NumberField label="after (s)" value={warmup} step={5} onChange={setWarmup} />}
            <Button
                label="Record"
                title="Recorded frame by frame, then made an MP4 in trailers/ by the dev server's ffmpeg"
                disabled={end <= from}
                onClick={record}
            />
        </div>
    );
}

// While a trailer's recorded: how far it's got, and nothing else to touch
function Recording({
    trailer,
    client,
}: {
    trailer: TrailerProgress;
    client: GameClient;
}): JSX.Element {
    const share = trailer.total > 0 ? trailer.done / trailer.total : 0;
    const what = {
        loading: `Loading what the camera will see: ${trailer.done} of ${trailer.total}`,
        frames: `Recording frame ${trailer.done} of ${trailer.total}`,
        sound: "Rendering the sound",
        encoding: "ffmpeg's finishing the video",
    }[trailer.stage];
    return (
        <>
            <div className="director-stage director-stage-recording" />
            <div className="director-panel">
                <div className="director-row">
                    <span className="director-label">{what}</span>
                    <span className="director-gap" />
                    <Button
                        label="Cancel"
                        title="Stops recording, and keeps nothing (Escape)"
                        onClick={() => client.cancelTrailer()}
                    />
                </div>
                <div className="director-progress">
                    <div style={{ width: `${Math.round(share * 100)}%` }} />
                </div>
            </div>
        </>
    );
}

function Check({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}): JSX.Element {
    return (
        <label className="director-field">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                    e.currentTarget.blur();
                    onChange(e.currentTarget.checked);
                }}
            />
            <span>{label}</span>
        </label>
    );
}

// Behind the panel: dragging turns or moves the camera, and the wheel zooms
function Stage({ director }: { director: CinematicDirector }): JSX.Element {
    const drag = useRef<{ id: number; x: number; y: number; pan: boolean } | undefined>(undefined);
    const end = (e: React.PointerEvent) => {
        if (drag.current?.id === e.pointerId) {
            drag.current = undefined;
        }
    };
    return (
        <div
            className="director-stage"
            onPointerDown={(e) => {
                if (e.button !== 0 && e.button !== 2) {
                    return;
                }
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                    id: e.pointerId,
                    x: e.clientX,
                    y: e.clientY,
                    pan: e.button === 2 || e.shiftKey,
                };
            }}
            onPointerMove={(e) => {
                const at = drag.current;
                if (at?.id !== e.pointerId) {
                    return;
                }
                const dx = e.clientX - at.x;
                const dy = e.clientY - at.y;
                at.x = e.clientX;
                at.y = e.clientY;
                if (at.pan) {
                    director.pan(dx, dy);
                } else {
                    director.orbit(dx, dy);
                }
            }}
            onPointerUp={end}
            onPointerCancel={end}
            onWheel={(e) => director.zoom(Math.sign(e.deltaY))}
            onContextMenu={(e) => e.preventDefault()}
        />
    );
}

// The shots (diamonds, the run's camera a square at the end), the cues over them, and the
// playhead. Clicking or dragging on it moves the playhead; dragging a shot moves it in time.
function Timeline({
    director,
    snap,
}: {
    director: CinematicDirector;
    snap: DirectorSnapshot;
}): JSX.Element {
    const bar = useRef<HTMLDivElement>(null);
    // The seconds the bar's width stood for when the drag began, so a drag that lengthens it
    // doesn't run away from the pointer
    const drag = useRef<{ id: number; shot?: number; scale: number } | undefined>(undefined);
    const share = (seconds: number) => `${(seconds / snap.duration) * 100}%`;
    const timeAt = (clientX: number) => {
        const rect = bar.current!.getBoundingClientRect();
        return ((clientX - rect.left) / rect.width) * (drag.current?.scale ?? snap.duration);
    };
    const ticks: number[] = [];
    for (let t = 0; t <= snap.duration; t += 1) {
        ticks.push(t);
    }
    return (
        <div
            ref={bar}
            className="director-timeline"
            onPointerDown={(e) => {
                if (e.button !== 0) {
                    return;
                }
                e.currentTarget.setPointerCapture(e.pointerId);
                const target = e.target as HTMLElement;
                const shot =
                    target.dataset.shot === undefined ? undefined : Number(target.dataset.shot);
                drag.current = { id: e.pointerId, shot, scale: snap.duration };
                if (shot === undefined) {
                    director.seek(timeAt(e.clientX));
                } else {
                    director.select(shot);
                }
            }}
            onPointerMove={(e) => {
                const at = drag.current;
                if (at?.id !== e.pointerId) {
                    return;
                }
                if (at.shot === undefined) {
                    director.seek(timeAt(e.clientX));
                } else if (at.shot > 0) {
                    director.retime(at.shot, timeAt(e.clientX));
                }
            }}
            onPointerUp={(e) => {
                const at = drag.current;
                if (at?.id !== e.pointerId) {
                    return;
                }
                drag.current = undefined;
                // The playhead onto the shot where it was left
                if (at.shot !== undefined) {
                    director.select(at.shot);
                }
            }}
            onPointerCancel={() => (drag.current = undefined)}
        >
            {ticks.map((t) => (
                <div
                    key={t}
                    className={t % 5 === 0 ? "director-tick director-tick-major" : "director-tick"}
                    style={{ left: share(t) }}
                >
                    {t % 5 === 0 && <span>{t}</span>}
                </div>
            ))}
            {snap.cues.map((cue, i) => (
                <div
                    key={i}
                    className={`director-cue director-cue-${cue.kind}`}
                    style={{ left: share(cue.at) }}
                    title={`${cue.at.toFixed(2)} s: ${cue.text}`}
                />
            ))}
            {snap.shots.map((shot, i) => (
                <div
                    key={i}
                    data-shot={i}
                    className={
                        "director-shot" +
                        ("player" in shot ? " director-shot-player" : "") +
                        ("hold" in shot && shot.hold ? " director-shot-hold" : "") +
                        (i === snap.selected ? " director-shot-selected" : "")
                    }
                    style={{ left: share(shot.at) }}
                    title={
                        `Shot ${i + 1} at ${shot.at} s` +
                        ("player" in shot
                            ? ": the run's camera"
                            : "hold" in shot && shot.hold
                              ? ", held"
                              : "")
                    }
                />
            ))}
            <div className="director-playhead" style={{ left: share(snap.seconds) }} />
        </div>
    );
}

// A number to type in: it's taken as it's typed, whenever it reads as one, and the arrow keys
// step it (ten steps with Shift)
function NumberField({
    label,
    value,
    step,
    disabled,
    onChange,
}: {
    label: string;
    value: number;
    step: number;
    disabled?: boolean;
    onChange: (value: number) => void;
}): JSX.Element {
    // What's typed, while it has the focus
    const [text, setText] = useState<string>();
    return (
        <label className="director-field">
            <span>{label}</span>
            <input
                type="text"
                inputMode="decimal"
                disabled={disabled}
                value={text ?? String(value)}
                onFocus={() => setText(String(value))}
                onChange={(e) => {
                    const typed = e.currentTarget.value;
                    setText(typed);
                    if (/^-?\d+(\.\d+)?$/.test(typed.trim())) {
                        onChange(Number(typed));
                    }
                }}
                onBlur={() => setText(undefined)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") {
                        e.currentTarget.blur();
                    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                        e.preventDefault();
                        const by = (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1);
                        const next = Math.round((value + by) * 100) / 100;
                        setText(String(next));
                        onChange(next);
                    }
                }}
            />
        </label>
    );
}

// A button that never takes the focus, so Space and Enter stay the editor's keys
function Button({
    label,
    title,
    disabled,
    onClick,
}: {
    label: string;
    title?: string;
    disabled?: boolean;
    onClick: () => void;
}): JSX.Element {
    return (
        <button
            className="ui-button ui-button-small"
            title={title}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

function describeCamera(camera: ShotCamera): string {
    return (
        `x ${camera.x}, y ${camera.y}, lift ${camera.lift}, pitch ${camera.pitch}, ` +
        `yaw ${camera.yaw}, distance ${camera.distance}`
    );
}
