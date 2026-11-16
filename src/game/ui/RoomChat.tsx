import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { GameClient } from "../client/GameClient";
import type { UiSnapshot } from "../client/GameStore";
import { MAX_CHAT_LENGTH } from "../client/coop/protocol";
import { fmtNum, t, useLang } from "../i18n";
import "./FriendsPanel.css";
import "./PauseChat.css";

// A room's chat (CoopView.chat), on a relay with friends: its last lines, newest at the bottom,
// and a line to type. On a phone it starts folded under its heading, so the party stays in view.

type Props = { ui: UiSnapshot; client: GameClient; phone: boolean };

export function RoomChat({ ui, client, phone }: Props): JSX.Element {
    useLang();
    const lines = ui.coop.chat;
    const [open, setOpen] = useState(!phone);
    const [text, setText] = useState("");
    const log = useRef<HTMLDivElement>(null);
    // Kept at the newest line unless the player's scrolled up to read
    const atEnd = useRef(true);
    const last = lines.length > 0 ? lines[lines.length - 1].id : 0;
    // The last line seen open, for how many came while it was folded
    const [seen, setSeen] = useState(last);
    const shown = open || !phone;
    useEffect(() => {
        if (shown) {
            setSeen(last);
        }
    }, [shown, last]);
    const unread = lines.filter((line) => line.id > seen && !line.mine).length;
    useLayoutEffect(() => {
        const box = log.current;
        if (box && atEnd.current) {
            box.scrollTop = box.scrollHeight;
        }
    }, [lines, shown]);
    const inputId = useId();
    const logId = useId();
    const heading = phone ? (
        <button
            className="ui-button ui-button-small ui-room-chat-toggle"
            aria-expanded={open}
            aria-controls={logId}
            onClick={() => setOpen(!open)}
        >
            {unread > 0 ? t("coop.chat.title_unread", { n: fmtNum(unread) }) : t("coop.chat.title")}
        </button>
    ) : (
        <div className="ui-style-name">{t("coop.chat.title")}</div>
    );
    return (
        <div className="ui-room-chat">
            {heading}
            {shown && (
                <>
                    <div
                        ref={log}
                        id={logId}
                        className="ui-chat ui-room-chat-log"
                        role="log"
                        aria-label={t("coop.chat.title")}
                        onScroll={(e) => {
                            const box = e.currentTarget;
                            atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < 8;
                        }}
                    >
                        {lines.length === 0 && (
                            <div className="ui-room-chat-empty">{t("coop.chat.empty")}</div>
                        )}
                        {lines.map((line) => (
                            <div
                                key={line.id}
                                className={"ui-chat-line" + (line.mine ? " ui-room-chat-mine" : "")}
                            >
                                <span className="ui-chat-source ui-chat-source-player">
                                    {line.name
                                        ? line.mine
                                            ? t("coop.chat.name_you", { name: line.name })
                                            : t("coop.chat.name", { name: line.name })
                                        : t("coop.chat.name_gone")}
                                </span>
                                <span className="ui-chat-text">{line.text}</span>
                            </div>
                        ))}
                    </div>
                    <form
                        className="ui-room-chat-say"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (client.sendChat(text)) {
                                setText("");
                                // What's said shows as it comes back: keep up with it
                                atEnd.current = true;
                            }
                        }}
                    >
                        <input
                            id={inputId}
                            className="ui-coop-input"
                            value={text}
                            maxLength={MAX_CHAT_LENGTH}
                            placeholder={t("coop.chat.placeholder")}
                            aria-label={t("coop.chat.say")}
                            autoComplete="off"
                            enterKeyHint="send"
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                // What's typed is the chat's: the room's keys (Escape, Enter) and
                                // the game's (M mutes) never hear it
                                e.stopPropagation();
                                if (e.key === "Escape") {
                                    e.currentTarget.blur();
                                }
                            }}
                        />
                        <button
                            className="ui-button ui-button-small"
                            type="submit"
                            disabled={text.trim().length === 0}
                        >
                            {t("coop.chat.send")}
                        </button>
                    </form>
                </>
            )}
        </div>
    );
}
