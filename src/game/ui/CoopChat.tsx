import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";

import { isCoarsePointer } from "../../util/DeviceUtil";
import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { ChatLine, MAX_CHAT_CHARS, QUICK_CHAT, showsLine } from "../client/coop/chat";
import { t } from "../i18n";
import "./CoopChat.css";

// Co-op chat (client/coop/chat.ts). In the room it's a panel of its own, always
// open. In a run it's a few lines over the world that fade, and a box to type
// in that Enter opens (or the chat button, on a touch screen).

type Props = { ui: UiSnapshot; client: GameClient };

// How long a line stays over the world in a run, and how many show at once
const RUN_LINE_MS = 10_000;
// (fewer on a phone, where they're over the middle of the screen)
const RUN_LINES = isCoarsePointer ? 3 : 5;

// framed: a panel of its own (the room's middle column), or part of the one it's in (a phone's
// party panel)
export function CoopChatPanel({
    ui,
    client,
    framed = true,
}: Props & { framed?: boolean }): JSX.Element | null {
    const { coop, display } = ui;
    // In view whenever it's there, so what comes is read
    useUnreadChat(ui, client, true);
    if (!coop.chat || !coop.room || display.coopChat === "off") {
        return null;
    }
    const lines = coop.chatLines.filter((line) => showsLine(line, display.coopChat, coop.muted));
    return (
        <div
            className={
                "ui-coopchat " +
                (framed
                    ? "ui-coopchat-room ui-panel rs-border rs-background"
                    : "ui-coopchat-inline")
            }
        >
            <ChatLog lines={lines} you={coop.you} />
            <QuickChat client={client} />
            {display.coopChat === "all" && <ChatInput client={client} />}
        </div>
    );
}

export function CoopChatRun({ ui, client }: Props): JSX.Element | null {
    const { coop, display, chatOpen } = ui;
    const lines = coop.chatLines.filter((line) => showsLine(line, display.coopChat, coop.muted));
    // Lines over the world go when they're old, so something has to look again
    // while the newest is still up
    const lastAt = lines.length > 0 ? lines[lines.length - 1].at : undefined;
    useTicking(!chatOpen && lastAt !== undefined && Date.now() - lastAt < RUN_LINE_MS);
    // Shut the box if the chat goes (the run's over, the room's gone)
    const shown = coop.chat && coop.room !== undefined && display.coopChat !== "off";
    useEffect(() => {
        if (!shown) {
            client.closeChat();
        }
    }, [shown, client]);
    const unread = useUnreadChat(ui, client, chatOpen);
    if (!shown) {
        return null;
    }
    if (chatOpen) {
        return (
            <div className="ui-coopchat ui-coopchat-run ui-coopchat-open rs-border rs-background">
                <ChatLog lines={lines} you={coop.you} />
                <QuickChat client={client} onSaid={() => client.closeChat()} />
                {display.coopChat === "all" ? (
                    <ChatInput
                        client={client}
                        // A phone's keyboard comes up only when its box is tapped: its
                        // quick chat is the quicker way
                        autoFocus={!isCoarsePointer}
                        onDone={() => client.closeChat()}
                        // Escape's on a keyboard only
                        closeButton={isCoarsePointer}
                    />
                ) : (
                    <button
                        className="ui-button ui-button-small ui-coopchat-close"
                        onClick={() => client.closeChat()}
                    >
                        {t("chat.close")}
                    </button>
                )}
            </div>
        );
    }
    const now = Date.now();
    const recent = lines.filter((line) => now - line.at < RUN_LINE_MS).slice(-RUN_LINES);
    return (
        <>
            {recent.length > 0 && (
                <div className="ui-coopchat ui-coopchat-run ui-coopchat-faded" aria-live="polite">
                    {recent.map((line) => (
                        <ChatLineView key={line.seq} line={line} you={coop.you} />
                    ))}
                </div>
            )}
            {isCoarsePointer && (
                <button
                    className="ui-button ui-coopchat-button"
                    aria-label={t("chat.open")}
                    onClick={() => client.openChat()}
                >
                    {t("chat.button")}
                    {unread && <span className="ui-coopchat-unread" />}
                </button>
            )}
        </>
    );
}

// Whether someone else has said something shown since the chat was last open; open, it's all read
export function useUnreadChat(ui: UiSnapshot, client: GameClient, open: boolean): boolean {
    const { coop, display } = ui;
    const lastSeq = coop.chatLines.length > 0 ? coop.chatLines[coop.chatLines.length - 1].seq : 0;
    useEffect(() => {
        if (open && coop.chat) {
            client.markChatRead();
        }
    }, [open, coop.chat, lastSeq, client]);
    return (
        !open &&
        coop.chatLines.some(
            (line) =>
                line.seq > coop.chatReadSeq &&
                line.from !== coop.you &&
                showsLine(line, display.coopChat, coop.muted),
        )
    );
}

function ChatLog({ lines, you }: { lines: ChatLine[]; you?: string }): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    // Kept at the newest line, unless the player's scrolled up to read
    const stuck = useRef(true);
    useLayoutEffect(() => {
        const log = ref.current;
        if (log && stuck.current) {
            log.scrollTop = log.scrollHeight;
        }
    }, [lines]);
    return (
        <div
            ref={ref}
            className="ui-coopchat-log"
            role="log"
            aria-label={t("chat.log")}
            onScroll={(e) => {
                const log = e.currentTarget;
                stuck.current = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
            }}
        >
            {lines.length === 0 ? (
                <div className="ui-coopchat-empty">{t("chat.empty")}</div>
            ) : (
                lines.map((line) => <ChatLineView key={line.seq} line={line} you={you} />)
            )}
        </div>
    );
}

function ChatLineView({ line, you }: { line: ChatLine; you?: string }): JSX.Element {
    return (
        <div className="ui-coopchat-line">
            <span
                className={"ui-coopchat-name" + (line.from === you ? " ui-coopchat-name-you" : "")}
            >
                {line.name}:
            </span>{" "}
            <span className={line.quick ? "ui-coopchat-quick-text" : "ui-coopchat-text"}>
                {line.quick ? t(`chat.quick.${line.quick}`) : line.text}
            </span>
        </div>
    );
}

function QuickChat({ client, onSaid }: { client: GameClient; onSaid?: () => void }) {
    return (
        <div className="ui-coopchat-quick" role="group" aria-label={t("chat.quick_label")}>
            {QUICK_CHAT.map((id) => (
                <button
                    key={id}
                    className="ui-button ui-button-small"
                    onClick={() => {
                        if (client.sayQuickChat(id)) {
                            onSaid?.();
                        }
                    }}
                >
                    {t(`chat.quick.${id}`)}
                </button>
            ))}
        </div>
    );
}

function ChatInput({
    client,
    autoFocus = false,
    onDone,
    closeButton = false,
}: {
    client: GameClient;
    autoFocus?: boolean;
    onDone?: () => void;
    closeButton?: boolean;
}): JSX.Element {
    const [text, setText] = useState("");
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (autoFocus) {
            input.current?.focus();
        }
    }, [autoFocus]);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!text.trim()) {
            onDone?.();
            return;
        }
        // Kept if the relay wouldn't take it yet, to send again
        if (client.sayChat(text)) {
            setText("");
            onDone?.();
        }
    };
    return (
        <form className="ui-coopchat-form" onSubmit={submit}>
            <input
                ref={input}
                className="ui-coop-input ui-coopchat-input"
                type="text"
                value={text}
                maxLength={MAX_CHAT_CHARS}
                placeholder={t("chat.placeholder")}
                aria-label={t("chat.placeholder")}
                enterKeyHint="send"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setText(e.target.value)}
                onBlur={(e) => {
                    // A click back on the world shuts a run's box, as Escape does; one on
                    // the chat's own buttons doesn't
                    if (autoFocus && !e.relatedTarget?.closest(".ui-coopchat")) {
                        onDone?.();
                    }
                }}
                onKeyDown={(e) => {
                    // A held Enter would send, shut the box, and open it again with the next
                    if (e.key === "Enter" && e.repeat) {
                        e.preventDefault();
                        return;
                    }
                    if (e.key === "Escape") {
                        e.preventDefault();
                        // Not the pause menu's Escape too
                        e.stopPropagation();
                        input.current?.blur();
                        onDone?.();
                    }
                }}
            />
            <button className="ui-button ui-button-small" type="submit">
                {t("chat.send")}
            </button>
            {closeButton && (
                <button className="ui-button ui-button-small" type="button" onClick={onDone}>
                    {t("chat.close")}
                </button>
            )}
        </form>
    );
}

// Draws again each second while asked to, for lines that go when they're old
function useTicking(ticking: boolean): void {
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!ticking) {
            return;
        }
        const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
        return () => window.clearInterval(timer);
    }, [ticking]);
}
