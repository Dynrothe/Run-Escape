import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { GameClient } from "../client/GameClient";
import { getCharacter } from "../content/characters";
import "./MapGeneratorScreen.css";
import { GENERATED_MAP_ID, drawGeneratedMap, installGeneratedMap } from "./generatedMap";
import {
    DEFAULT_SETTINGS,
    GeneratorSettings,
    SETTINGS,
    SETTING_PRESETS,
    SETTING_SECTIONS,
    SLOW_ARENA_SQUARES,
    SettingKey,
    formatSettings,
    getSettingsError,
    parseSettings,
} from "./settings";

// Temporary and dev-only: a screen to try the generator's settings. To remove it,
// delete this file, its CSS and generatedMap.ts, and the MapGeneratorButton line
// in GameUi.tsx. See CLAUDE.md.

const MAX_SEED = 999999;

function randomSeed(): number {
    return Math.floor(Math.random() * (MAX_SEED + 1));
}

// Kept while the screen's closed, for coming back to it after a run
let lastSettings: GeneratorSettings = { seed: 1, ...DEFAULT_SETTINGS };
let lastPreview: { url: string; settings: GeneratorSettings } | undefined;

function SettingField({
    name,
    settings,
    change,
}: {
    name: SettingKey;
    settings: GeneratorSettings;
    change: (changed: Partial<GeneratorSettings>) => void;
}): JSX.Element | null {
    const def = SETTINGS[name];
    if (def.when && !def.when(settings)) {
        return null;
    }
    const value = settings[name];
    let control: JSX.Element;
    if (def.kind === "number") {
        control = (
            <>
                <input
                    className="ui-volume"
                    type="range"
                    aria-label={def.label}
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={value as number}
                    onChange={(e) => change({ [name]: e.target.valueAsNumber })}
                />
                <span className="ui-mapgen-value">{Number((value as number).toFixed(2))}</span>
            </>
        );
    } else if (def.kind === "flag") {
        control = (
            <button
                className={"ui-button" + (value ? " ui-mapgen-picked" : "")}
                aria-pressed={value as boolean}
                aria-label={def.label}
                onClick={() => change({ [name]: !value })}
            >
                {value ? "On" : "Off"}
            </button>
        );
    } else if (def.options.length <= 5) {
        control = (
            <>
                {def.options.map((option) => (
                    <button
                        key={option}
                        className={"ui-button" + (option === value ? " ui-mapgen-picked" : "")}
                        onClick={() => change({ [name]: option })}
                    >
                        {option}
                    </button>
                ))}
            </>
        );
    } else {
        control = (
            <select
                className="ui-mapgen-select"
                aria-label={def.label}
                value={value as string}
                onChange={(e) => change({ [name]: e.target.value })}
            >
                {def.options.map((option) => (
                    <option key={option}>{option}</option>
                ))}
            </select>
        );
    }
    return (
        <div className="ui-setting">
            <span className="ui-setting-name">{def.label}</span>
            <span className="ui-setting-control">{control}</span>
        </div>
    );
}

function MapGeneratorScreen({
    client,
    onClose,
}: {
    client: GameClient;
    onClose: () => void;
}): JSX.Element {
    const [settings, setSettings] = useState(lastSettings);
    const [preview, setPreview] = useState(lastPreview);
    const [busy, setBusy] = useState<string>();
    const [error, setError] = useState<string>();
    const [json, setJson] = useState<string>();
    const panel = useRef<HTMLDivElement>(null);
    const jsonBox = useRef<HTMLTextAreaElement>(null);
    // Keys go to the fields here, not to the title screen behind
    useEffect(() => panel.current?.focus(), []);

    const change = (changed: Partial<GeneratorSettings>) => {
        const next = { ...settings, ...changed };
        lastSettings = next;
        setSettings(next);
        setJson(undefined);
    };

    const generate = async () => {
        const problem = getSettingsError(settings);
        setError(problem);
        if (problem) {
            return;
        }
        setBusy("Generating...");
        // A frame for the button to show it's busy before the main thread's taken
        await new Promise((resolve) => requestAnimationFrame(resolve));
        try {
            const recipe = await installGeneratedMap(client, settings);
            setBusy("Drawing the map...");
            const url = await drawGeneratedMap(client, recipe);
            lastPreview = { url, settings };
            setPreview(lastPreview);
        } catch (e) {
            console.error("Failed to generate a map", e);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(undefined);
        }
    };

    const loadJson = () => {
        try {
            const loaded = parseSettings(jsonBox.current?.value ?? "");
            lastSettings = loaded;
            setSettings(loaded);
            setJson(undefined);
            setError(undefined);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const copyJson = () => {
        const box = jsonBox.current;
        if (box) {
            box.select();
            // The clipboard API needs https, which a dev server often isn't
            void navigator.clipboard?.writeText(box.value).catch(() => {});
            document.execCommand("copy");
        }
    };

    const stale = preview !== undefined && preview.settings !== settings;
    const character = getCharacter(client.store.getSnapshot().characterId);
    const slow = Math.max(settings.squaresX, settings.squaresY) > SLOW_ARENA_SQUARES;

    return (
        <div
            ref={panel}
            className="ui-panel rs-border rs-background ui-mapgen"
            tabIndex={-1}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.code === "Escape" && !busy) {
                    onClose();
                }
            }}
        >
            <h2>Map generator</h2>
            <div className="ui-mapgen-presets">
                {Object.entries(SETTING_PRESETS).map(([name, preset]) => (
                    <button
                        key={name}
                        className="ui-button"
                        onClick={() =>
                            change({ seed: settings.seed, ...DEFAULT_SETTINGS, ...preset })
                        }
                    >
                        {name}
                    </button>
                ))}
                <button
                    className="ui-button"
                    onClick={() => change({ seed: settings.seed, ...DEFAULT_SETTINGS })}
                >
                    Reset to defaults
                </button>
            </div>
            <div className="ui-mapgen-body">
                <div className="ui-mapgen-settings">
                    <div className="ui-setting">
                        <span className="ui-setting-name">Seed</span>
                        <span className="ui-setting-control">
                            <input
                                className="ui-mapgen-seed"
                                type="number"
                                aria-label="Seed"
                                value={Number.isNaN(settings.seed) ? "" : settings.seed}
                                onChange={(e) => change({ seed: e.target.valueAsNumber })}
                            />
                            <button
                                className="ui-button"
                                onClick={() => change({ seed: randomSeed() })}
                            >
                                Random
                            </button>
                        </span>
                    </div>
                    {SETTING_SECTIONS.map((section) => (
                        <section key={section.name} className="ui-mapgen-section">
                            <h3>{section.name}</h3>
                            {section.keys.map((key) => (
                                <SettingField
                                    key={key}
                                    name={key}
                                    settings={settings}
                                    change={change}
                                />
                            ))}
                        </section>
                    ))}
                </div>
                <div className="ui-mapgen-preview">
                    {preview ? (
                        <img src={preview.url} alt="The generated map from above" />
                    ) : (
                        <div className="ui-mapgen-empty">Nothing generated yet</div>
                    )}
                    <textarea
                        ref={jsonBox}
                        className="ui-mapgen-json"
                        aria-label="Settings as JSON"
                        spellCheck={false}
                        value={json ?? formatSettings(settings)}
                        onChange={(e) => setJson(e.target.value)}
                    />
                    <div className="ui-row">
                        <button className="ui-button" onClick={copyJson}>
                            Copy
                        </button>
                        <button className="ui-button" onClick={loadJson}>
                            Load
                        </button>
                    </div>
                </div>
            </div>
            <div className="ui-mapgen-status">
                {error ? (
                    <span className="ui-mapgen-error" role="alert">
                        {error}
                    </span>
                ) : (
                    (busy ??
                    (stale
                        ? "Settings changed: Generate to see them. Play uses the map shown."
                        : preview
                          ? `Seed ${preview.settings.seed}, ${preview.settings.biome}. ` +
                            `Playing as the ${character.name}.`
                          : `Playing as the ${character.name}.`))
                )}
                {slow && !error && !busy && " A map this big takes a while."}
            </div>
            <div className="ui-row">
                <button className="ui-button" disabled={busy !== undefined} onClick={onClose}>
                    Back
                </button>
                <button className="ui-button" disabled={busy !== undefined} onClick={generate}>
                    Generate
                </button>
                <button
                    className="ui-button"
                    disabled={busy !== undefined || !preview}
                    onClick={() => client.startRun(GENERATED_MAP_ID)}
                >
                    Play
                </button>
            </div>
        </div>
    );
}

// The title screen's button, and the screen it opens, over the title screen
export function MapGeneratorButton({ client }: { client: GameClient }): JSX.Element {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    const title = button.current?.closest(".ui-title");
    return (
        <>
            <button ref={button} className="ui-button ui-button-big" onClick={() => setOpen(true)}>
                Map generator
            </button>
            {open &&
                title &&
                createPortal(
                    <div className="ui-fill ui-center ui-mapgen-back">
                        <MapGeneratorScreen client={client} onClose={() => setOpen(false)} />
                    </div>,
                    title,
                )}
        </>
    );
}
