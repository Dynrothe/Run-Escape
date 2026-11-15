import { useLayoutEffect, useRef } from "react";

import type { ToastLogEntry } from "../client/GameStore";
import { t } from "../i18n";
import "./PauseChat.css";

// The kinds of thing that say something in a run (GameClient's EVENT_TOAST_SOURCES); a teammate's
// own are "player:<their name>", and anything else is the game's
const KINDS = new Set([
    "game",
    "loot",
    "boss",
    "thief",
    "revive",
    "endless",
    "realm",
    "cold",
    "souls",
    "powerup",
    "visitor",
    "notice",
]);

// The run's clock as the HUD writes it: 3:07
function stamp(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// Who says it: a teammate by name, or what kind of thing it is
function sourceOf(source: string | undefined): { name: string; kind: string } {
    if (source?.startsWith("player:")) {
        return { name: source.slice("player:".length), kind: "player" };
    }
    const kind = source !== undefined && KINDS.has(source) ? source : "game";
    return { name: t(`toast.source.${kind}`), kind };
}

// The pause menu's recent messages, laid out as a chat box: oldest at the top and the newest at the
// bottom (where it's scrolled to), each line with the run's clock when it was said, who said it and
// what they said
export function PauseChat({ log }: { log: ToastLogEntry[] }): JSX.Element {
    const box = useRef<HTMLDivElement>(null);
    // The newest is at the end of the list, as in a chat: scrolled down to it as it opens
    useLayoutEffect(() => {
        if (box.current) {
            box.current.scrollTop = box.current.scrollHeight;
        }
    }, [log]);
    const lines = [...log].reverse();
    return (
        <div ref={box} className="ui-chat" role="log" aria-label={t("pause.heading.recent")}>
            {lines.map((entry, i) => {
                const source = sourceOf(entry.source);
                return (
                    <div key={i} className="ui-chat-line">
                        {entry.seconds !== undefined && (
                            <span className="ui-chat-time">[{stamp(entry.seconds)}]</span>
                        )}
                        <span className={`ui-chat-source ui-chat-source-${source.kind}`}>
                            {source.name}:
                        </span>
                        <span className="ui-chat-text">{entry.text}</span>
                    </div>
                );
            })}
        </div>
    );
}
