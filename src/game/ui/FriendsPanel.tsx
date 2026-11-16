import { useEffect, useId, useReducer, useRef, useState } from "react";

import type { FriendJoinResult, GameClient } from "../client/GameClient";
import type { UiSnapshot } from "../client/GameStore";
import type { FriendView, FriendsView } from "../client/coop/Friends";
import type { AddResult } from "../client/coop/FriendsStore";
import {
    FRIEND_CODE_LENGTH,
    FriendRoom,
    MAX_FRIENDS,
    MAX_NAME_LENGTH,
    formatFriendCode,
    parseFriendCode,
} from "../client/coop/protocol";
import { MAP_BY_ID } from "../content/maps";
import { fmtNum, list, t, tl, tp, useLang } from "../i18n";
import { useConfirm } from "./ConfirmDialog";
import "./CoopScreen.css";
import "./FriendsPanel.css";
import { releaseFocus } from "./menuKeys";
import { useDialog } from "./useDialog";

// Friends (client/coop/Friends.ts): the window opened from the title, the co-op menu and a room,
// and the button that opens it. Only shown on a relay that has friends.

type Props = { ui: UiSnapshot; client: GameClient };

// After inviting a friend, how long before they can be asked again: the relay turns a second
// invite to the same friend away for a while
const REASK_MS = 10_000;

// What a friend's room is on: its map, and hard or endless as the open rooms list says it
export function roomMapText(room: Pick<FriendRoom, "mapId" | "hard" | "endless">): string {
    const map = MAP_BY_ID.get(room.mapId);
    // A newer game's map: its id is all there is
    if (!map) {
        return room.mapId;
    }
    return (
        tl(map.name) +
        (room.hard ? t("coop.room_hard") : "") +
        (room.endless && !map.fun ? t("coop.room_endless") : "")
    );
}

// A friend's name, or their code while it's all there is
export function friendName(friend: { id: string; name: string }): string {
    return friend.name || formatFriendCode(friend.id);
}

// What's waiting on the player: friend requests and invites
export function friendsWaiting(view: FriendsView): number {
    return view.requests.length + view.invites.length;
}

// Where a friend is, in a line
function friendStatus(friend: FriendView, inYourRoom: boolean): string {
    if (friend.pending) {
        return t("friends.status.pending", { code: formatFriendCode(friend.id) });
    }
    if (!friend.online) {
        return t("friends.status.offline");
    }
    if (inYourRoom) {
        return t("friends.status.in_your_room");
    }
    const room = friend.room;
    switch (friend.state) {
        case "menu":
            return t("friends.status.menu");
        case "solo":
            return t("friends.status.solo");
        case "run":
            return room
                ? t("friends.status.run_map", { map: roomMapText(room) })
                : t("friends.status.run");
        case "room":
            if (room) {
                return t(
                    room.players >= room.max ? "friends.status.room_full" : "friends.status.room",
                    {
                        room: room.name,
                        map: roomMapText(room),
                        n: fmtNum(room.players),
                        max: fmtNum(room.max),
                    },
                );
            }
    }
    return t("friends.status.online");
}

// What adding someone came to, as a line. asked: they'd asked first, so it makes them friends.
export function describeAdd(result: AddResult, name: string, asked: boolean): string {
    switch (result) {
        case "added":
            return asked
                ? t("friends.add.friends_now", { name })
                : t("friends.add.added", { name });
        case "invalid":
            return t("friends.add.invalid", { n: fmtNum(FRIEND_CODE_LENGTH) });
        case "self":
            return t("friends.add.self");
        case "already":
            return t("friends.add.already");
        case "full":
            return t("friends.add.full", { n: fmtNum(MAX_FRIENDS) });
    }
}

// Joining a friend's room, when it didn't happen: why
export function describeJoin(result: FriendJoinResult): string | undefined {
    return result === "inRun"
        ? t("friends.join.in_run")
        : result === "gone"
          ? t("friends.join.gone")
          : undefined;
}

// Copies text, and says so for a moment
export function useCopy(): [boolean, (text: string) => void] {
    const [copied, setCopied] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const copy = (text: string) => {
        navigator.clipboard
            ?.writeText(text)
            .then(() => {
                setCopied(true);
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {});
    };
    return [copied, copy];
}

// The friends button: what's waiting in a badge, and how many are online in its name (and on the
// title, under it)
export function FriendsButton({
    view,
    label,
    showOnline = false,
    className = "",
    onOpen,
}: {
    view: FriendsView;
    label: string;
    showOnline?: boolean;
    className?: string;
    onOpen: () => void;
}): JSX.Element {
    const waiting = friendsWaiting(view);
    const online = view.friends.filter((f) => f.online).length;
    const parts = [
        ...(online > 0 ? [tp("friends.button.online", online, { n: fmtNum(online) })] : []),
        ...(waiting > 0 ? [tp("friends.button.waiting", waiting, { n: fmtNum(waiting) })] : []),
    ];
    const name =
        parts.length > 0 ? t("friends.button.label", { name: label, status: list(parts) }) : label;
    return (
        <button
            className={"ui-button ui-friends-button " + className}
            aria-label={name}
            title={name}
            onClick={(e) => {
                releaseFocus(e);
                onOpen();
            }}
        >
            <span className="ui-friends-button-name">{label}</span>
            {showOnline && online > 0 && (
                <span className="ui-friends-button-online" aria-hidden="true">
                    {tp("friends.button.online", online, { n: fmtNum(online) })}
                </span>
            )}
            {waiting > 0 && (
                <span className="ui-friends-badge" aria-hidden="true">
                    {fmtNum(waiting)}
                </span>
            )}
        </button>
    );
}

// The name this player goes by, to type: kept by GameClient.setPlayerName. Saved with Enter or
// Save; onCancel adds Cancel (and Escape) for one shown in place of the name.
export function NameForm({
    id,
    current,
    client,
    autoFocus = false,
    onSaved,
    onEmpty,
    onCancel,
}: {
    id?: string;
    current: string;
    client: GameClient;
    autoFocus?: boolean;
    onSaved?: () => void;
    onEmpty?: () => void;
    onCancel?: () => void;
}): JSX.Element {
    // What's typed, until it's saved: the name as it is otherwise, which New name can change
    const [draft, setDraft] = useState<string>();
    return (
        <form
            className="ui-friends-name"
            onSubmit={(e) => {
                e.preventDefault();
                if (client.setPlayerName(draft ?? current)) {
                    setDraft(undefined);
                    onSaved?.();
                } else {
                    onEmpty?.();
                }
            }}
        >
            <input
                id={id}
                className="ui-coop-input"
                value={draft ?? current}
                maxLength={MAX_NAME_LENGTH}
                spellCheck={false}
                autoComplete="off"
                autoFocus={autoFocus}
                aria-label={id ? undefined : t("coop.your_name")}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    // The co-op menu's own keys are left out of what's typed here
                    e.stopPropagation();
                    if (e.key === "Escape" && onCancel) {
                        onCancel();
                    }
                }}
            />
            <button
                type="submit"
                className="ui-button ui-button-small"
                disabled={draft === undefined || draft === current}
            >
                {t("friends.save")}
            </button>
            {onCancel && (
                <button type="button" className="ui-button ui-button-small" onClick={onCancel}>
                    {t("ui.common.cancel")}
                </button>
            )}
        </form>
    );
}

// While the window's open, no key reaches what's behind it (the title starts a run on Space,
// the co-op menu leaves on Escape, a room readies): it listens first, as ConfirmDialog does, and
// Escape closes only the window. A confirmation over it has the keys to itself.
function useWindowKeys(onClose: () => void): void {
    const latest = useRef(onClose);
    latest.current = onClose;
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (document.querySelector(".ui-confirm")) {
                return;
            }
            event.stopPropagation();
            if (event.code === "Escape" && !event.repeat) {
                latest.current();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);
}

// Draws again at a time to come (undefined: none), for a button that comes back after a while
function useWakeAt(at: number | undefined): void {
    const [, wake] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        if (at === undefined) {
            return;
        }
        const timer = window.setTimeout(wake, Math.max(0, at - Date.now()));
        return () => window.clearTimeout(timer);
    }, [at]);
}

export function FriendsWindow({ ui, client, onClose }: Props & { onClose: () => void }) {
    useLang();
    const friends = ui.friends;
    const coop = ui.coop;
    const { titleId, dialogProps } = useDialog<HTMLDivElement>();
    useWindowKeys(onClose);
    const [confirm, confirmDialog] = useConfirm();
    // What the last thing done came to (an add, a join), in a line under the title
    const [note, setNote] = useState<{ text: string; bad: boolean }>();
    const [code, setCode] = useState("");
    const [copied, copy] = useCopy();
    // When each friend was last invited from here, so Invite waits before asking again
    const [askedAt, setAskedAt] = useState<Record<string, number>>({});
    const now = Date.now();
    const waits = Object.values(askedAt)
        .map((at) => at + REASK_MS)
        .filter((at) => at > now);
    useWakeAt(waits.length > 0 ? Math.min(...waits) : undefined);
    // The relay's last word on this connection is for this window
    useEffect(() => () => client.friends?.clearNotice(), [client]);
    const nameId = useId();
    const codeId = useId();
    const myCode = friends.myCode ?? coop.myCode;
    const room = coop.room;
    // Invites go from a room that's waiting, on a relay with friends
    const canInvite = coop.friends && room !== undefined && !room.started;
    const members = new Set(room?.members.flatMap((m) => (m.friendId ? [m.friendId] : [])));
    const inYourRoom = (friend: FriendView) =>
        !!room &&
        (members.has(friend.id) ||
            (friend.room?.code !== undefined && friend.room.code === room.code));
    const online = friends.friends.filter((f) => f.online).length;

    const add = (text: string): AddResult => {
        const id = parseFriendCode(text);
        const request = friends.requests.find((r) => r.id === id);
        const known = request ?? friends.recent.find((p) => p.id === id);
        const name = id ? friendName(known ?? { id, name: "" }) : "";
        const result = client.addFriend(text);
        setNote({ text: describeAdd(result, name, !!request), bad: result !== "added" });
        return result;
    };
    const joined = (result: FriendJoinResult) => {
        const why = describeJoin(result);
        if (why) {
            setNote({ text: why, bad: true });
        } else {
            onClose();
        }
    };
    const remove = async (friend: FriendView) => {
        const name = friendName(friend);
        if (
            await confirm({
                title: t("friends.remove.title", { name }),
                body: t("friends.remove.body"),
                confirm: t("friends.remove"),
                cancel: t("ui.common.cancel"),
            })
        ) {
            client.removeFriend(friend.id);
        }
    };
    const invite = (friend: FriendView) => {
        if (client.inviteFriend(friend.id)) {
            setAskedAt((at) => ({ ...at, [friend.id]: Date.now() }));
            setNote(undefined);
        }
    };
    const current = friends.pickedName || friends.name || coop.name;
    // The relay's word on an invite (coop.error) while in a room, or on this connection
    const relayError = (room && coop.error) || friends.notice;

    return (
        <div className="ui-modal" onClick={onClose}>
            <div
                {...dialogProps}
                className="ui-panel rs-border rs-background ui-friends"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 id={titleId}>{t("friends.title")}</h2>
                <div className="ui-friends-note" role="status">
                    {note && (
                        <span className={note.bad ? "ui-friends-bad" : undefined}>{note.text}</span>
                    )}
                    {!note && relayError && (
                        <span className="ui-friends-bad">{tl(relayError)}</span>
                    )}
                </div>
                <div className="ui-friends-body">
                    <section className="ui-coop-rows" aria-label={t("friends.you")}>
                        <div className="ui-coop-row">
                            <label className="ui-coop-label" htmlFor={nameId}>
                                {t("coop.your_name")}
                            </label>
                            <NameForm
                                id={nameId}
                                current={current}
                                client={client}
                                onSaved={() =>
                                    setNote({ text: t("friends.name_saved"), bad: false })
                                }
                                onEmpty={() =>
                                    setNote({ text: t("friends.name_empty"), bad: true })
                                }
                            />
                            {/* Only the co-op menu's connection can ask the relay for one */}
                            {coop.status === "online" && (
                                <button
                                    className="ui-button ui-button-small"
                                    onClick={() => client.renameCoop()}
                                >
                                    {t("coop.new_name")}
                                </button>
                            )}
                        </div>
                        <div className="ui-coop-row">
                            <span className="ui-coop-label">{t("friends.your_code")}</span>
                            <span className="ui-friends-code">
                                {myCode ? formatFriendCode(myCode) : "..."}
                            </span>
                            <button
                                className="ui-button ui-button-small"
                                disabled={!myCode}
                                onClick={() => myCode && copy(formatFriendCode(myCode))}
                            >
                                {copied ? t("coop.copied") : t("friends.copy")}
                            </button>
                        </div>
                        {friends.status !== "online" && (
                            <p className="ui-friends-quiet">
                                {friends.status === "connecting"
                                    ? t("friends.connecting")
                                    : t("friends.offline")}
                            </p>
                        )}
                        <form
                            className="ui-coop-row"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (add(code) === "added") {
                                    setCode("");
                                }
                            }}
                        >
                            <label className="ui-coop-label" htmlFor={codeId}>
                                {t("friends.add_label")}
                            </label>
                            <input
                                id={codeId}
                                className="ui-coop-input ui-coop-code-input"
                                value={code}
                                placeholder={t("friends.code_placeholder")}
                                spellCheck={false}
                                autoComplete="off"
                                autoCapitalize="characters"
                                maxLength={40}
                                onChange={(e) => setCode(e.target.value)}
                            />
                            <button
                                className="ui-button ui-button-small"
                                type="submit"
                                disabled={code.trim().length === 0}
                            >
                                {t("friends.add")}
                            </button>
                        </form>
                    </section>

                    {friends.requests.length > 0 && (
                        <section aria-labelledby={`${titleId}-requests`}>
                            <h3 id={`${titleId}-requests`} className="ui-coop-heading">
                                {t("friends.requests")}
                                <span className="ui-select-count">
                                    {fmtNum(friends.requests.length)}
                                </span>
                            </h3>
                            <div className="ui-friends-list">
                                {friends.requests.map((request) => (
                                    <div key={request.id} className="ui-coop-room ui-friend">
                                        <span className="ui-friend-text">
                                            <span className="ui-friend-name">
                                                {friendName(request)}
                                            </span>
                                            <span className="ui-friend-status">
                                                {formatFriendCode(request.id)}
                                            </span>
                                        </span>
                                        <span className="ui-friend-actions">
                                            <button
                                                className="ui-button ui-button-small"
                                                onClick={() => {
                                                    const result = client.acceptFriendRequest(
                                                        request.id,
                                                    );
                                                    setNote({
                                                        text: describeAdd(
                                                            result,
                                                            friendName(request),
                                                            true,
                                                        ),
                                                        bad: result !== "added",
                                                    });
                                                }}
                                            >
                                                {t("friends.accept")}
                                            </button>
                                            <button
                                                className="ui-button ui-button-small"
                                                onClick={() =>
                                                    client.ignoreFriendRequest(request.id)
                                                }
                                            >
                                                {t("friends.ignore")}
                                            </button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {friends.invites.length > 0 && (
                        <section aria-labelledby={`${titleId}-invites`}>
                            <h3 id={`${titleId}-invites`} className="ui-coop-heading">
                                {t("friends.invites")}
                                <span className="ui-select-count">
                                    {fmtNum(friends.invites.length)}
                                </span>
                            </h3>
                            <div className="ui-friends-list">
                                {friends.invites.map((invite) => (
                                    <div key={invite.from.id} className="ui-coop-room ui-friend">
                                        <span className="ui-friend-text">
                                            <span className="ui-friend-name">
                                                {friendName(invite.from)}
                                            </span>
                                            <span className="ui-friend-status">
                                                {t("friends.room_line", {
                                                    room: invite.room.name,
                                                    map: roomMapText(invite.room),
                                                    n: fmtNum(invite.room.players),
                                                    max: fmtNum(invite.room.max),
                                                })}
                                            </span>
                                        </span>
                                        <span className="ui-friend-actions">
                                            <button
                                                className="ui-button ui-button-small"
                                                onClick={() =>
                                                    joined(client.acceptInvite(invite.from.id))
                                                }
                                            >
                                                {t("coop.join")}
                                            </button>
                                            <button
                                                className="ui-button ui-button-small"
                                                onClick={() => client.declineInvite(invite.from.id)}
                                            >
                                                {t("friends.decline")}
                                            </button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section aria-labelledby={`${titleId}-friends`}>
                        <h3 id={`${titleId}-friends`} className="ui-coop-heading">
                            {t("friends.list")}
                            {friends.friends.length > 0 && (
                                <span className="ui-select-count">
                                    {tp("friends.button.online", online, { n: fmtNum(online) })}
                                </span>
                            )}
                        </h3>
                        <div className="ui-friends-list">
                            {friends.friends.length === 0 && (
                                <div className="ui-coop-empty ui-friends-empty">
                                    <p>{t("friends.empty_share")}</p>
                                    <p>{t("friends.empty_mutual")}</p>
                                </div>
                            )}
                            {friends.friends.map((friend) => {
                                const here = inYourRoom(friend);
                                const room = friend.room;
                                const canJoin =
                                    friend.online &&
                                    !here &&
                                    room?.code !== undefined &&
                                    room.players < room.max;
                                const invited = coop.invited[friend.id];
                                const waiting = (askedAt[friend.id] ?? -Infinity) + REASK_MS > now;
                                const name = friendName(friend);
                                return (
                                    <div
                                        key={friend.id}
                                        className={
                                            "ui-coop-room ui-friend" +
                                            (friend.online ? " ui-friend-online" : "")
                                        }
                                    >
                                        <span className="ui-friend-text">
                                            <span className="ui-friend-name">{name}</span>
                                            <span className="ui-friend-status">
                                                {friendStatus(friend, here)}
                                            </span>
                                        </span>
                                        <span className="ui-friend-actions">
                                            {canInvite && invited && !here && (
                                                <span className="ui-friend-tag">
                                                    {invited === "declined"
                                                        ? t("friends.declined")
                                                        : t("friends.invited")}
                                                </span>
                                            )}
                                            {canJoin && (
                                                <button
                                                    className="ui-button ui-button-small"
                                                    aria-label={t("friends.join_label", { name })}
                                                    onClick={() =>
                                                        joined(client.joinFriend(friend.id))
                                                    }
                                                >
                                                    {t("coop.join")}
                                                </button>
                                            )}
                                            {canInvite && friend.online && !here && (
                                                <button
                                                    className="ui-button ui-button-small"
                                                    aria-label={t("friends.invite_label", { name })}
                                                    disabled={waiting}
                                                    onClick={() => invite(friend)}
                                                >
                                                    {invited
                                                        ? t("friends.invite_again")
                                                        : t("friends.invite")}
                                                </button>
                                            )}
                                            <button
                                                className="ui-button ui-button-small ui-coop-kick"
                                                aria-label={t("friends.remove_label", { name })}
                                                onClick={() => void remove(friend)}
                                            >
                                                {t("friends.remove")}
                                            </button>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {friends.recent.length > 0 && (
                        <section aria-labelledby={`${titleId}-recent`}>
                            <h3 id={`${titleId}-recent`} className="ui-coop-heading">
                                {t("friends.recent")}
                            </h3>
                            <div className="ui-friends-list">
                                {friends.recent.map((player) => (
                                    <div key={player.id} className="ui-coop-room ui-friend">
                                        <span className="ui-friend-text">
                                            <span className="ui-friend-name">
                                                {friendName(player)}
                                            </span>
                                        </span>
                                        <span className="ui-friend-actions">
                                            <button
                                                className="ui-button ui-button-small"
                                                aria-label={t("friends.add_label_name", {
                                                    name: friendName(player),
                                                })}
                                                onClick={() => add(player.id)}
                                            >
                                                {t("friends.add")}
                                            </button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
                <div className="ui-row">
                    <button className="ui-button" onClick={onClose}>
                        {t("friends.close")}
                    </button>
                </div>
                {/* In the panel, whose click stops there, so the confirmation's (portaled, but
                    React's events go by the tree) don't close the window */}
                {confirmDialog}
            </div>
        </div>
    );
}
