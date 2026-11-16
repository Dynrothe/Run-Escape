import { MouseEvent, useEffect, useState } from "react";

import type { GameClient } from "../client/GameClient";
import type { UiSnapshot } from "../client/GameStore";
import type { FriendPopup } from "../client/coop/Friends";
import { fmtNum, t, useLang } from "../i18n";
import { describeAdd, friendName, roomMapText } from "./FriendsPanel";
import "./FriendsPanel.css";

// Friends' popups (FriendsView.popups), over every screen: an invite, a friend request, a friend
// come online, a friend saying no to an invite. They're no window: nothing behind them is made
// inert, they never take the focus or the controller's highlight, and they hear no keys. In a
// run they keep to the side, small, and stay out of the way of a level up or a casket.

type Props = { ui: UiSnapshot; client: GameClient };

// A friend online, or saying no, goes by itself after this long
export const POPUP_MS = 5000;
// An invite that's gone says so this long first
const GONE_MS = 3000;

// A click on a popup's button leaves the focus where it was (a run's keys, a menu's highlight)
function keepFocus(event: MouseEvent): void {
    event.preventDefault();
}

export function FriendPopups({ ui, client }: Props): JSX.Element {
    useLang();
    // What came of a popup's button, by its id, while it's still up
    const [notes, setNotes] = useState<Record<number, { text: string; gone?: boolean }>>({});
    const shown = ui.friends.popups;
    useEffect(() => {
        const ids = new Set(shown.map((p) => p.id));
        if (Object.keys(notes).some((id) => !ids.has(Number(id)))) {
            setNotes((all) =>
                Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(Number(id)))),
            );
        }
    }, [shown, notes]);
    const run = ui.screen === "run";
    // A run's windows (a level up, a casket, the pause menu) come first: the popups wait under
    // them, and come back as they close
    const popups = run && ui.overlay !== "none" ? [] : ui.friends.popups;
    return (
        <div
            className={"ui-friend-popups" + (run ? " ui-friend-popups-run" : "")}
            role="status"
            aria-relevant="additions"
        >
            {popups.map((popup) => (
                <PopupCard
                    key={popup.id}
                    popup={popup}
                    note={notes[popup.id]}
                    client={client}
                    onNote={(note) => setNotes((all) => ({ ...all, [popup.id]: note }))}
                />
            ))}
        </div>
    );
}

function PopupCard({
    popup,
    note,
    client,
    onNote,
}: {
    popup: FriendPopup;
    note?: { text: string; gone?: boolean };
    client: GameClient;
    onNote: (note: { text: string; gone?: boolean }) => void;
}): JSX.Element {
    const { id, kind, at } = popup;
    const name = friendName(popup.from);
    // A friend online or saying no goes by itself (the store keeps them till they're dismissed),
    // timed from when it came, so one that waited under a run's window doesn't stay longer
    const timed = kind === "online" || kind === "declined";
    useEffect(() => {
        if (!timed && !note?.gone) {
            return;
        }
        const until = note?.gone ? GONE_MS : Math.max(0, at + POPUP_MS - Date.now());
        const timer = window.setTimeout(() => client.dismissFriendPopup(id), until);
        return () => window.clearTimeout(timer);
    }, [timed, note?.gone, at, id, client]);
    const room = popup.room;
    const text = t(`friends.popup.${kind}`, { name, room: room?.name ?? "" });
    const button = (label: string, onClick: () => void, aria?: string) => (
        <button
            className="ui-button ui-button-small"
            aria-label={aria}
            onMouseDown={keepFocus}
            onClick={onClick}
        >
            {label}
        </button>
    );
    return (
        <div className={"ui-friend-popup rs-border rs-background ui-friend-popup-" + kind}>
            <div className="ui-friend-popup-text">
                <span className="ui-friend-popup-line">{text}</span>
                {kind === "invite" && room && (
                    <span className="ui-friend-popup-detail">
                        {t("friends.popup.room", {
                            map: roomMapText(room),
                            n: fmtNum(room.players),
                            max: fmtNum(room.max),
                        })}
                    </span>
                )}
                {note && <span className="ui-friend-popup-note">{note.text}</span>}
            </div>
            <div className="ui-friend-popup-actions">
                {kind === "invite" &&
                    !note?.gone &&
                    button(t("coop.join"), () => {
                        // In a run the invite's kept (it's in the Friends window too), and a gone
                        // one goes in a moment
                        const result = client.acceptInvite(popup.from.id);
                        if (result !== "joining") {
                            onNote({
                                text: t(
                                    result === "inRun"
                                        ? "friends.popup.in_run"
                                        : "friends.popup.gone",
                                ),
                                gone: result === "gone",
                            });
                        }
                    })}
                {kind === "invite" &&
                    !note?.gone &&
                    button(t("friends.decline"), () => client.declineInvite(popup.from.id))}
                {kind === "request" &&
                    button(t("friends.accept"), () => {
                        const result = client.acceptFriendRequest(popup.from.id);
                        if (result !== "added") {
                            onNote({ text: describeAdd(result, name, true) });
                        }
                    })}
                {kind === "request" &&
                    button(t("friends.ignore"), () => client.ignoreFriendRequest(popup.from.id))}
                {button("X", () => client.dismissFriendPopup(id), t("friends.popup.dismiss"))}
            </div>
        </div>
    );
}
