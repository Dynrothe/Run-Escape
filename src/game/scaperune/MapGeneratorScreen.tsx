import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { GameClient } from "../client/GameClient";
import { getCharacter } from "../content/characters";
import "./MapGeneratorScreen.css";
import { BIOMES, BiomeId } from "./biomes";
import { GENERATED_MAP_ID, drawGeneratedMap, installGeneratedMap } from "./generatedMap";
import { DEFAULT_SETTINGS, GeneratorSettings, SETTING_LIMITS, getSettingsError } from "./generator";

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

function MapGeneratorScreen({
    client,
    onClose,
}: {
    client: GameClient;
    onClose: () => void;
}): JSX.Element {
    const [settings, setSettings] = useState(lastSettings);
    const [preview, setPreview] = useState(lastPreview);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const panel = useRef<HTMLDivElement>(null);
    // Keys go to the fields here, not to the title screen behind
    useEffect(() => panel.current?.focus(), []);

    const change = (changed: Partial<GeneratorSettings>) => {
        const next = { ...settings, ...changed };
        lastSettings = next;
        setSettings(next);
    };

    const generate = async () => {
        const problem = getSettingsError(settings);
        setError(problem);
        if (problem) {
            return;
        }
        setBusy(true);
        // A frame for the button to show it's busy before the main thread's taken
        await new Promise((resolve) => requestAnimationFrame(resolve));
        try {
            const recipe = await installGeneratedMap(client, settings);
            const url = await drawGeneratedMap(client, recipe);
            lastPreview = { url, settings };
            setPreview(lastPreview);
        } catch (e) {
            console.error("Failed to generate a map", e);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const stale = preview !== undefined && preview.settings !== settings;
    const character = getCharacter(client.store.getSnapshot().characterId);

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
                    <div className="ui-setting">
                        <span className="ui-setting-name">Biome</span>
                        <span className="ui-setting-control">
                            {Object.keys(BIOMES).map((biome) => (
                                <button
                                    key={biome}
                                    className={
                                        "ui-button" +
                                        (biome === settings.biome ? " ui-mapgen-picked" : "")
                                    }
                                    onClick={() => change({ biome: biome as BiomeId })}
                                >
                                    {biome}
                                </button>
                            ))}
                        </span>
                    </div>
                    {Object.entries(SETTING_LIMITS).map(([name, limits]) => {
                        const key = name as keyof typeof SETTING_LIMITS;
                        return (
                            <div className="ui-setting" key={name}>
                                <span className="ui-setting-name">{limits.label}</span>
                                <span className="ui-setting-control">
                                    <input
                                        className="ui-volume"
                                        type="range"
                                        aria-label={limits.label}
                                        min={limits.min}
                                        max={limits.max}
                                        step={limits.step}
                                        value={settings[key]}
                                        onChange={(e) => change({ [key]: e.target.valueAsNumber })}
                                    />
                                    <span className="ui-mapgen-value">{settings[key]}</span>
                                </span>
                            </div>
                        );
                    })}
                    <div className="ui-row">
                        <button
                            className="ui-button"
                            onClick={() => change({ ...DEFAULT_SETTINGS })}
                        >
                            Reset to defaults
                        </button>
                    </div>
                </div>
                <div className="ui-mapgen-preview">
                    {preview ? (
                        <img src={preview.url} alt="The generated map from above" />
                    ) : (
                        <div className="ui-mapgen-empty">Nothing generated yet</div>
                    )}
                    <div className="ui-mapgen-status">
                        {error ? (
                            <span className="ui-mapgen-error" role="alert">
                                {error}
                            </span>
                        ) : busy ? (
                            "Generating..."
                        ) : stale ? (
                            "Settings changed: Generate to see them. Play uses the map shown."
                        ) : preview ? (
                            `Seed ${preview.settings.seed}, ${preview.settings.biome}. ` +
                            `Playing as the ${character.name}.`
                        ) : (
                            `Playing as the ${character.name}.`
                        )}
                    </div>
                </div>
            </div>
            <div className="ui-row">
                <button className="ui-button" disabled={busy} onClick={onClose}>
                    Back
                </button>
                <button className="ui-button" disabled={busy} onClick={generate}>
                    Generate
                </button>
                <button
                    className="ui-button"
                    disabled={busy || !preview}
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
