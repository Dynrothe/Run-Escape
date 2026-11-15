import { useEffect, useMemo, useRef, useState } from "react";

import { FLOOR_SKINS } from "../content/floorSkins";
import type { FloorDef, FloorSkinDef } from "../content/types";
import { beat, createWardensFloor, side, sweep } from "../content/wardensFloor";
import { ArenaFloor, FRAGILE_HITS } from "../core/ArenaFloor";
import { Rng } from "../core/Rng";
import { FLOOR_EFFECTS, RAMP_NONE, TILE_TYPES, TYPE_PILLAR } from "../core/floorLayout";
import { RAMP_ARROWS, floorGrid, lintFloor } from "../core/floorLint";
import { FLOOR_DEMOS, FLOOR_START, WARDENS_FLOOR } from "../scaperune/maps/wardensFloor";

// The floor preview (dev server only: ?floorpreview): pick a floor, or paste one as JSON or an
// ascii map, and see its tiles from above, its script played on a timeline you can scrub, and
// what floorLint.ts finds wrong with it. Drawn flat on a canvas, a square a tile; the sim's own
// ArenaFloor plays it, with the player standing at the start.

const TPS = 50;
const CELL = 22;
// A colour for each skin, by index
const PALETTE = [
    "#7a7f88",
    "#b0623a",
    "#9cc8e8",
    "#6b5232",
    "#c9a64a",
    "#5aa86a",
    "#a08ccc",
    "#d0b48a",
    "#8a3a3a",
    "#4a6a8a",
];
const EFFECT_MARKS: Record<string, [string, string]> = {
    burn: ["L", "#ff7a30"],
    heal: ["+", "#6dff8e"],
    haste: ["»", "#7fd4ff"],
    slow: ["~", "#d8b070"],
    ice: ["*", "#e8f6ff"],
};

type Source = { name: string; def: FloorDef };

// The box every preview floor's in, as the demos' rooms have it
const RECT = { x0: 1, y0: 1, x1: 23, y1: 25 };

function sources(): Source[] {
    return [WARDENS_FLOOR, ...FLOOR_DEMOS].map((recipe) => ({
        name: recipe.mapDef!.name!,
        def: { ...recipe.mapDef!.floor!, rect: RECT },
    }));
}

// A pasted floor: a FloorDef as JSON (rect, slam, drop and the rest from the Wardens' floor when
// left out, skins by FLOOR_SKINS name as well), or an ascii map, a row a line
function parse(text: string): FloorDef {
    const trimmed = text.trim();
    const base = createWardensFloor(RECT);
    const fallback = {
        script: [beat(2, side("east", 0.14)), beat(7, sweep(0.12, 3))],
        loopSeconds: 14,
    };
    if (trimmed.startsWith("{")) {
        const json = JSON.parse(trimmed) as Partial<FloorDef> & {
            skins?: (FloorSkinDef | string)[];
        };
        const skins = json.skins?.map((skin) => {
            if (typeof skin !== "string") {
                return skin;
            }
            const preset = (FLOOR_SKINS as Record<string, FloorSkinDef>)[skin];
            if (!preset) {
                throw new Error(`No skin called ${skin} in FLOOR_SKINS`);
            }
            return preset;
        });
        return {
            ...base,
            ...fallback,
            ...json,
            rect: json.rect ?? RECT,
            slam: { ...base.slam, ...json.slam },
            drop: { ...base.drop, ...json.drop },
            skins,
        };
    }
    const ascii = trimmed.split("\n").map((row) => row.replace(/\r$/, ""));
    const width = Math.max(...ascii.map((row) => row.length));
    return {
        ...base,
        ...fallback,
        rect: { x0: 1, y0: 1, x1: width, y1: ascii.length },
        ascii: ascii.map((row) => row.padEnd(width, ".")),
    };
}

// Where the player starts, in floor tiles: the demos' start, or the floor tile nearest the middle
function startOf(def: FloorDef): { x: number; y: number } {
    const floor = new ArenaFloor(def, floorGrid(def), new Rng(1), TPS);
    const { sizeX, sizeY, layout } = floor;
    if (
        FLOOR_START.x < sizeX &&
        FLOOR_START.y < sizeY &&
        layout.mask[FLOOR_START.x + FLOOR_START.y * sizeX]
    ) {
        return FLOOR_START;
    }
    let best = { x: 0, y: 0 };
    let bestD = Infinity;
    for (let i = 0; i < sizeX * sizeY; i++) {
        const x = i % sizeX;
        const y = Math.floor(i / sizeX);
        const d = (x - sizeX / 2) ** 2 + (y - sizeY / 2) ** 2;
        if (layout.mask[i] && layout.type[i] !== TYPE_PILLAR && d < bestD) {
            best = { x, y };
            bestD = d;
        }
    }
    return best;
}

// The floor played from its start to a tick, the player at the start
function playTo(def: FloorDef, tick: number): { floor: ArenaFloor; messages: string[] } {
    const floor = new ArenaFloor(def, floorGrid(def), new Rng(1), TPS);
    const start = startOf(def);
    const at = { x: def.rect.x0 + start.x + 0.5, y: def.rect.y0 + start.y + 0.5 };
    const messages: string[] = [];
    for (let t = 0; t <= tick; t++) {
        for (const message of floor.step(t, () => at).messages) {
            messages.push(`${(t / TPS).toFixed(1)} s: ${message}`);
        }
    }
    return { floor, messages };
}

function draw(
    canvas: HTMLCanvasElement,
    floor: ArenaFloor,
    tick: number,
    start: { x: number; y: number },
): void {
    const { sizeX, sizeY, layout } = floor;
    canvas.width = sizeX * CELL;
    canvas.height = sizeY * CELL;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#050505";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${CELL * 0.55}px sans-serif`;
    const hurtTo = Math.round(floor.def.slam.hurt[1] * TPS);
    for (let i = 0; i < sizeX * sizeY; i++) {
        if (!layout.mask[i]) {
            continue;
        }
        const col = i % sizeX;
        const row = Math.floor(i / sizeX);
        // North up
        const px = col * CELL;
        const py = (sizeY - 1 - row) * CELL;
        const gone = floor.isGone(i, tick);
        const coming = floor.rebuilt[i] && floor.restoreAt[i] !== -1;
        if (gone) {
            g.fillStyle =
                coming && tick >= floor.restoreAt[i] - floor.rebuildWarnTicks ? "#203a5a" : "#000";
            g.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
            continue;
        }
        g.fillStyle = PALETTE[layout.skin[i] % PALETTE.length];
        g.globalAlpha = 0.7 + Math.max(-0.3, Math.min(0.3, layout.height[i] * 0.3));
        g.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        g.globalAlpha = 1;
        // What's happening to it now
        const up = floor.roseAt[i] !== -1 && tick - floor.roseAt[i] <= hurtTo;
        const warned = floor.warnAt[i] !== -1 && tick >= floor.warnAt[i];
        const sagging = floor.dropWarnAt[i] !== -1 && tick >= floor.dropWarnAt[i];
        const marked = floor.isMarked(i, tick);
        const state = up
            ? "#ff2a2a"
            : warned
              ? "#ff9a2a"
              : sagging
                ? "#a040ff"
                : marked
                  ? "#ffd070"
                  : undefined;
        if (state) {
            g.strokeStyle = state;
            g.lineWidth = up || warned || sagging ? 3 : 1.5;
            g.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
        }
        // What it is: a pillar, a type, an effect, a trigger, a ramp, a height
        const type = TILE_TYPES[layout.type[i]];
        if (layout.type[i] === TYPE_PILLAR) {
            g.fillStyle = "#222";
            g.beginPath();
            g.arc(px + CELL / 2, py + CELL / 2, CELL * 0.35, 0, Math.PI * 2);
            g.fill();
        } else if (type === "solid" || type === "safe" || type === "reinforced") {
            g.strokeStyle = type === "safe" ? "#6dff8e" : type === "solid" ? "#ddd" : "#888";
            g.lineWidth = 1;
            g.strokeRect(px + 4, py + 4, CELL - 8, CELL - 8);
        } else if (type === "fragile") {
            g.strokeStyle = floor.hits[i] > 0 ? "#ff5050" : "#333";
            g.beginPath();
            g.moveTo(px + 4, py + 5);
            g.lineTo(px + CELL / 2, py + CELL / 2);
            g.lineTo(px + CELL - 6, py + CELL - 4);
            g.stroke();
        }
        const effect = layout.effect[i] ? FLOOR_EFFECTS[layout.effect[i] - 1] : undefined;
        const ramp = layout.ramp[i];
        const mark =
            layout.trigger[i] >= 0
                ? ["T", floor.armed[layout.trigger[i]] ? "#fff" : "#777"]
                : ramp !== RAMP_NONE
                  ? [RAMP_ARROWS[ramp], "#fff"]
                  : effect
                    ? EFFECT_MARKS[effect]
                    : layout.height[i] !== 0
                      ? [layout.height[i] > 0 ? "▲" : "▼", "#ddd"]
                      : undefined;
        if (mark) {
            g.fillStyle = mark[1];
            g.fillText(mark[0], px + CELL / 2, py + CELL / 2 + 1);
        }
    }
    // The start
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.beginPath();
    g.arc((start.x + 0.5) * CELL, (sizeY - 0.5 - start.y) * CELL, CELL * 0.25, 0, Math.PI * 2);
    g.stroke();
}

export function FloorPreview() {
    const all = useMemo(sources, []);
    const [def, setDef] = useState<FloorDef>(all[0].def);
    const [text, setText] = useState("");
    const [error, setError] = useState("");
    const [seconds, setSeconds] = useState(0);
    const [playing, setPlaying] = useState(false);
    const canvas = useRef<HTMLCanvasElement>(null);
    const start = useMemo(() => {
        try {
            return startOf(def);
        } catch {
            return FLOOR_START;
        }
    }, [def]);
    const lint = useMemo(() => {
        try {
            return lintFloor(def, start);
        } catch (e) {
            return {
                warnings: [`Couldn't check it: ${(e as Error).message}`],
                notes: [],
                triangles: { rest: 0, busy: 0 },
            };
        }
    }, [def, start]);
    const tick = Math.round(seconds * TPS);
    const played = useMemo(() => {
        try {
            return playTo(def, tick);
        } catch (e) {
            return { error: (e as Error).message };
        }
    }, [def, tick]);
    useEffect(() => {
        if (canvas.current && "floor" in played) {
            draw(canvas.current, played.floor, tick, start);
        }
    }, [played, tick, start]);
    useEffect(() => {
        if (!playing) {
            return;
        }
        const timer = window.setInterval(() => {
            setSeconds((s) =>
                s + 0.1 > def.loopSeconds * 2 ? 0 : Math.round((s + 0.1) * 10) / 10,
            );
        }, 100);
        return () => window.clearInterval(timer);
    }, [playing, def]);
    const load = () => {
        try {
            setDef(parse(text));
            setError("");
            setSeconds(0);
        } catch (e) {
            setError((e as Error).message);
        }
    };
    const ok = "floor" in played ? played : undefined;
    const beats = ok ? def.script : [];
    return (
        <div
            style={{
                padding: 16,
                color: "#eee",
                background: "#181818",
                minHeight: "100vh",
                font: "14px sans-serif",
            }}
        >
            <h2 style={{ margin: "0 0 8px" }}>Floor preview</h2>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                    <select
                        data-testid="floor-pick"
                        onChange={(e) => {
                            setDef(all[Number(e.target.value)].def);
                            setSeconds(0);
                            setError("");
                        }}
                    >
                        {all.map((source, n) => (
                            <option key={source.name} value={n}>
                                {source.name}
                            </option>
                        ))}
                    </select>
                    <div style={{ margin: "8px 0" }}>
                        <canvas ref={canvas} style={{ border: "1px solid #444" }} />
                    </div>
                    <div>
                        <button onClick={() => setPlaying(!playing)}>
                            {playing ? "Pause" : "Play"}
                        </button>{" "}
                        <input
                            data-testid="floor-time"
                            type="range"
                            min={0}
                            max={def.loopSeconds * 2}
                            step={0.02}
                            value={seconds}
                            onChange={(e) => setSeconds(Number(e.target.value))}
                            style={{ width: 360, verticalAlign: "middle" }}
                        />{" "}
                        {seconds.toFixed(2)} s of a {def.loopSeconds} s loop
                    </div>
                    <div style={{ fontSize: 12, color: "#aaa", marginTop: 6, maxWidth: 520 }}>
                        Outlines: gold marked, orange warned, red up and hurting, purple about to
                        fall. Blue: rebuilding. Marks: T trigger (grey disarmed), arrows ramps, ▲▼
                        raised and sunken, L lava, * ice, + heal, » haste, ~ slow; circles pillars;
                        boxes solid, safe (green) and reinforced.
                    </div>
                </div>
                <div style={{ maxWidth: 520 }}>
                    <h3 style={{ margin: "0 0 4px" }}>Checks</h3>
                    <div data-testid="floor-triangles">
                        Phone triangles, roughly: {(lint.triangles.rest / 1000).toFixed(1)}k at
                        rest, {(lint.triangles.busy / 1000).toFixed(1)}k at its busiest (budget 69k)
                    </div>
                    <ul data-testid="floor-lint">
                        {lint.warnings.map((w) => (
                            <li key={w} style={{ color: "#ff9a6a" }}>
                                {w}
                            </li>
                        ))}
                        {lint.notes.map((w) => (
                            <li key={w} style={{ color: "#aaa" }}>
                                {w}
                            </li>
                        ))}
                        {lint.warnings.length === 0 && (
                            <li style={{ color: "#8f8" }}>No problems found.</li>
                        )}
                    </ul>
                    <h3 style={{ margin: "8px 0 4px" }}>Script</h3>
                    <ol style={{ margin: 0, paddingLeft: 20, maxHeight: 200, overflow: "auto" }}>
                        {beats.map((b, n) => {
                            const due = b.at <= seconds % def.loopSeconds;
                            return (
                                <li key={n} style={{ color: due ? "#fff" : "#888" }}>
                                    {b.at} s: {b.pattern ? b.pattern.kind : b.action?.kind}
                                    {b.pattern && "side" in b.pattern ? ` ${b.pattern.side}` : ""}
                                    {b.message ? ` "${b.message}"` : ""}
                                </li>
                            );
                        })}
                    </ol>
                    <h3 style={{ margin: "8px 0 4px" }}>Said</h3>
                    <div style={{ fontSize: 12, color: "#ccc", maxHeight: 120, overflow: "auto" }}>
                        {ok?.messages.slice(-8).map((m) => (
                            <div key={m}>{m}</div>
                        ))}
                        {ok?.floor.phase && <div>Phase: {ok.floor.phase}</div>}
                        {"error" in played && (
                            <div style={{ color: "#ff7a7a" }}>{played.error}</div>
                        )}
                        <div>
                            Fragile tiles give way after {def.drop.fragile?.hits ?? FRAGILE_HITS}{" "}
                            rises.
                        </div>
                    </div>
                    <h3 style={{ margin: "8px 0 4px" }}>Paste a floor</h3>
                    <textarea
                        data-testid="floor-text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={8}
                        cols={60}
                        placeholder={
                            'A FloorDef as JSON ({"shape": ..., "skins": ["lava", ...], "tiles": [...], "script": [...]}), or an ascii map, a row a line'
                        }
                    />
                    <div>
                        <button data-testid="floor-load" onClick={load}>
                            Load
                        </button>{" "}
                        <span style={{ color: "#ff7a7a" }}>{error}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default FloorPreview;
