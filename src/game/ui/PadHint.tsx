import { useSyncExternalStore } from "react";

import { PadButton, PadKind, padHints, padLabel } from "../client/GamePad";
import { t } from "../i18n";

// The controller in use, while the player's on it (and its buttons work)
export function usePadKind(): PadKind | undefined {
    return useSyncExternalStore(padHints.subscribe, padHints.get);
}

// A key's hint, or the controller button that does the same while one's in
// use. With no button (the numbered choices: the d-pad picks those), nothing;
// with no key (a button only a controller has a shortcut for), nothing until
// one's in use.
export function KeyHint({
    keyLabel,
    pad,
    className = "ui-choice-key",
}: {
    keyLabel?: string;
    pad?: PadButton;
    className?: string;
}): JSX.Element | null {
    const kind = usePadKind();
    if (!kind) {
        return keyLabel ? <span className={className}>{keyLabel}</span> : null;
    }
    if (!pad) {
        return null;
    }
    return (
        <span className={className + " ui-pad-key"} data-pad={kind}>
            <PadIcon kind={kind} icon={pad} label={padLabel(kind, pad)} />
        </span>
    );
}

// Kenney's Input Prompts (CC0, ./input-prompts), named by our buttons, and
// "move" for the left stick. A pad of another make has Xbox's, as it has
// Xbox's labels. They're in the bundle as data URLs rather than files beside
// it: the desktop app's launcher 1.0.0 serves .svg files with no image type, so
// an <img> of one draws nothing there, and players keep their launcher. Vite
// makes the data URLs (?inline), keyed here as "xbox/south".
const ICON_DIR = "./input-prompts/";
export const PAD_ICONS: Record<string, string> = Object.fromEntries(
    Object.entries(
        import.meta.glob<string>("./input-prompts/*/*.svg", {
            query: "?inline",
            import: "default",
            eager: true,
        }),
    ).map(([file, url]) => [file.slice(ICON_DIR.length, -".svg".length), url]),
);

export function PadIcon({
    kind,
    icon,
    label,
}: {
    kind: PadKind;
    icon: PadButton | "move";
    label: string;
}): JSX.Element {
    const folder = kind === "generic" ? "xbox" : kind;
    return (
        <img
            className="ui-pad-icon"
            src={PAD_ICONS[`${folder}/${icon}`]}
            alt={label}
            title={label}
            draggable={false}
        />
    );
}

// What each button does, for the pause menu and settings while a controller's
// in use. Keep it in step with RUN_KEYS and MENU_KEYS in GamePad.ts.
const PAD_CONTROLS: { icons: (PadButton | "move")[]; key: string }[] = [
    { icons: ["move"], key: "canvas.controls.move" },
    {
        icons: ["leftBumper", "rightBumper", "leftTrigger", "rightTrigger"],
        key: "canvas.controls.items",
    },
    { icons: ["start"], key: "canvas.controls.pause" },
    { icons: ["back"], key: "canvas.controls.damage" },
    { icons: ["leftStick"], key: "canvas.controls.quests" },
    { icons: ["up", "down", "left", "right"], key: "canvas.controls.highlight" },
    { icons: ["south"], key: "canvas.controls.press" },
    { icons: ["east"], key: "canvas.controls.back" },
    { icons: ["west"], key: "canvas.reroll_label" },
    { icons: ["north"], key: "canvas.skip_label" },
];

export function PadControls(): JSX.Element | null {
    const kind = usePadKind();
    if (!kind) {
        return null;
    }
    return (
        <div className="ui-pad-controls">
            {PAD_CONTROLS.map((row) => (
                <div key={row.key} className="ui-pad-control">
                    <span className="ui-pad-control-icons">
                        {row.icons.map((icon) => (
                            <PadIcon
                                key={icon}
                                kind={kind}
                                icon={icon}
                                label={
                                    icon === "move" ? t("canvas.left_stick") : padLabel(kind, icon)
                                }
                            />
                        ))}
                    </span>
                    <span className="ui-pad-control-text">{t(row.key)}</span>
                </div>
            ))}
        </div>
    );
}
