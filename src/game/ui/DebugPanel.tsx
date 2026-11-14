import { JSX, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { DebugView, GameClient } from "../client/GameClient";
import { CHARACTERS } from "../content/characters";
import { GEAR, UTILITY } from "../content/items";
import { MAPS } from "../content/maps";
import { PASSIVES } from "../content/passives";
import { WEAPONS } from "../content/weapons";
import "./DebugPanel.css";

const byName = <T extends { name: string }>(list: T[]): T[] =>
    [...list].sort((a, b) => a.name.localeCompare(b.name));

const ALL_WEAPONS = byName(WEAPONS);
const ALL_PASSIVES = byName(PASSIVES);
const ALL_GEAR = byName(GEAR);
const ALL_UTILITY = byName(UTILITY);

// Cheats for a ?debug run on the dev server (see "Debug runs" in docs/DEVELOPMENT.md). It reads
// the run through GameClient.getDebugView and acts through its debug methods.
export function DebugPanel({ client }: { client: GameClient }): JSX.Element | null {
    const ui = useSyncExternalStore(client.store.subscribe, client.store.getSnapshot);
    // Closed to start with on a touch screen, where it would cover the game
    const [open, setOpen] = useState(() => !window.matchMedia?.("(pointer: coarse)").matches);
    const [view, setView] = useState<DebugView | undefined>(() => client.getDebugView());
    const [weapon, setWeapon] = useState(ALL_WEAPONS[0].id);
    const [passive, setPassive] = useState(ALL_PASSIVES[0].id);
    const [gear, setGear] = useState(ALL_GEAR[0].id);
    const [item, setItem] = useState(ALL_UTILITY[0].id);
    const [map, setMap] = useState<string | undefined>();
    const [character, setCharacter] = useState<string | undefined>();

    useEffect(() => {
        const refresh = () => setView(client.getDebugView());
        const timer = window.setInterval(refresh, 250);
        return () => window.clearInterval(timer);
    }, [client]);

    if (!view) {
        return null;
    }
    // Do something, then show the result at once
    const run = (cheat: Parameters<GameClient["debugDo"]>[0]) => () => {
        client.debugDo(cheat);
        setView(client.getDebugView());
    };
    const mapId = map ?? view.mapId;
    const characterId = character ?? ui.characterId;

    // On the page itself, outside the game's UI: a window there (the pause menu) makes everything
    // beside it inert, and the panel has to keep working over it
    return createPortal(
        <div className="debug-panel">
            <button className="debug-toggle" onClick={() => setOpen(!open)}>
                DEBUG {open ? "▾" : "▸"}
            </button>
            {open && (
                <div className="debug-body">
                    <div className="debug-stats">
                        Level {view.level} · {Math.floor(view.seconds / 60)}:
                        {String(view.seconds % 60).padStart(2, "0")} · {view.state}
                        {view.skipping && " · skipping..."}
                    </div>

                    <h4>Player</h4>
                    <div className="debug-row">
                        <label>
                            <input
                                type="checkbox"
                                checked={view.god}
                                onChange={(e) => client.setDebugGod(e.target.checked)}
                            />
                            God mode
                        </label>
                        <button onClick={run((sim) => sim.debugHeal())}>Heal</button>
                        <button onClick={run((sim) => sim.debugKillEnemies())}>Kill enemies</button>
                        <button onClick={run((sim) => sim.debugMaxEverything())}>Max all</button>
                        <button onClick={run((sim) => sim.debugGiveCoins(10000))}>
                            +10k coins
                        </button>
                    </div>

                    <h4>Time</h4>
                    <div className="debug-row">
                        {[30, 60, 300, 600].map((seconds) => (
                            <button key={seconds} onClick={() => client.debugSkip(seconds)}>
                                +{seconds >= 60 ? seconds / 60 + "m" : seconds + "s"}
                            </button>
                        ))}
                    </div>

                    <h4>Level</h4>
                    <div className="debug-row">
                        {[-5, -1, 1, 5, 10].map((delta) => (
                            <button key={delta} onClick={run((sim) => sim.debugChangeLevel(delta))}>
                                {delta > 0 ? "+" : ""}
                                {delta}
                            </button>
                        ))}
                    </div>

                    <h4>Run</h4>
                    <div className="debug-row">
                        <select value={mapId} onChange={(e) => setMap(e.target.value)}>
                            {MAPS.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.name}
                                </option>
                            ))}
                        </select>
                        <select value={characterId} onChange={(e) => setCharacter(e.target.value)}>
                            {CHARACTERS.filter((c) => !c.only).map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="debug-row">
                        <label>
                            <input
                                type="checkbox"
                                checked={ui.endless}
                                onChange={(e) => client.store.set({ endless: e.target.checked })}
                            />
                            Endless
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={ui.hard}
                                onChange={(e) => client.store.set({ hard: e.target.checked })}
                            />
                            Hard
                        </label>
                        <button onClick={() => void client.debugRestart(mapId, characterId)}>
                            Reset map
                        </button>
                    </div>

                    <h4>Weapons</h4>
                    <Picker
                        value={weapon}
                        onChange={setWeapon}
                        options={ALL_WEAPONS}
                        label="Add"
                        onPick={run((sim) => sim.debugAddWeapon(weapon))}
                    />
                    {view.weapons.map((w) => (
                        <div className="debug-row debug-entry" key={w.index}>
                            <span>
                                {w.name} {w.level}/{w.maxLevel}
                            </span>
                            <button onClick={run((sim) => sim.debugWeaponLevel(w.index, -1))}>
                                -
                            </button>
                            <button onClick={run((sim) => sim.debugWeaponLevel(w.index, 1))}>
                                +
                            </button>
                            <button onClick={run((sim) => sim.debugRemoveWeapon(w.index))}>
                                ✕
                            </button>
                        </div>
                    ))}

                    <h4>Passives</h4>
                    <Picker
                        value={passive}
                        onChange={setPassive}
                        options={ALL_PASSIVES}
                        label="Add / level"
                        onPick={run((sim) => sim.debugAddPassive(passive))}
                    />
                    {view.passives.map((p) => (
                        <div className="debug-row debug-entry" key={p.id}>
                            <span>
                                {p.name} {p.level}/{p.maxLevel}
                            </span>
                            <button onClick={run((sim) => sim.debugAddPassive(p.id))}>+</button>
                            <button onClick={run((sim) => sim.debugRemovePassive(p.id))}>✕</button>
                        </div>
                    ))}

                    <h4>Gear</h4>
                    <Picker
                        value={gear}
                        onChange={setGear}
                        options={ALL_GEAR}
                        label="Wear"
                        onPick={run((sim) => sim.debugEquip(gear))}
                    />
                    {view.gear.map((g) => (
                        <div className="debug-row debug-entry" key={g.slot}>
                            <span>
                                {g.slot}: {g.name}
                            </span>
                            <button onClick={run((sim) => sim.debugUnequip(g.slot))}>✕</button>
                        </div>
                    ))}

                    <h4>Items</h4>
                    <Picker
                        value={item}
                        onChange={setItem}
                        options={ALL_UTILITY}
                        label="Give"
                        onPick={run((sim) => sim.debugGiveItem(item))}
                    />
                    <div className="debug-row debug-entry">
                        <span>
                            {view.inventory.length > 0
                                ? view.inventory.map((i) => `${i.name} x${i.count}`).join(", ")
                                : "Inventory empty"}
                        </span>
                        <button onClick={run((sim) => sim.debugClearInventory())}>Clear</button>
                    </div>
                </div>
            )}
        </div>,
        document.body,
    );
}

function Picker({
    value,
    onChange,
    options,
    label,
    onPick,
}: {
    value: string;
    onChange: (id: string) => void;
    options: { id: string; name: string }[];
    label: string;
    onPick: () => void;
}): JSX.Element {
    return (
        <div className="debug-row">
            <select value={value} onChange={(e) => onChange(e.target.value)}>
                {options.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.name}
                    </option>
                ))}
            </select>
            <button onClick={onPick}>{label}</button>
        </div>
    );
}
