// Friends: a connection of its own to the co-op relay, open for the life of the page (the
// title, the menus, solo and co-op runs alike), that hears which friends are on and where, their
// requests and their invites. Only a relay that says it has friends (welcome.friends) gets
// any of it; with any other this stays dormant and the game is as it was. See "Friends" in
// protocol.ts for what's said.
import type { GameStore } from "../GameStore";
import { getRelayUrl } from "./CoopLobby";
import { AddResult, FriendsStore, RecentPlayer, cleanName } from "./FriendsStore";
import {
    ClientMessage,
    FriendPresence,
    FriendRef,
    FriendRoom,
    FriendState,
    ServerMessage,
    formatFriendCode,
    parseFriendCode,
} from "./protocol";

// A friend as the friends list shows them: the list kept in the browser, with what the relay
// says of those who are on.
// name: their name when last heard of, or their code (formatted) until it's been heard.
// state, room: where they are, while online (room.code: only while it can be joined without
// asking). pending: the relay's never shown them online, so they may not have added this
// game back yet (and until they do, the relay says nothing of them).
export type FriendView = {
    id: string;
    name: string;
    online: boolean;
    state?: FriendState;
    room?: FriendRoom;
    pending: boolean;
};

// A friend asking this player into their room. at: when it came (Date.now()).
export type FriendInvite = { from: FriendRef; room: FriendRoom & { code: string }; at: number };

// Something to pop up for, newest last: an invite, a friend request, a friend come online, or a
// friend saying no to this player's invite. Each comes once (not again on a reconnect), and
// stays till dismissed (GameClient.dismissFriendPopup), or till what it's about is gone (an
// invite taken, declined or expired; a request answered). Only the last MAX_POPUPS are kept.
export type FriendPopup = {
    id: number;
    kind: "invite" | "request" | "online" | "declined";
    from: FriendRef;
    at: number;
    // An invite's room
    room?: FriendRoom & { code: string };
};

// The friends' view of things, for the UI (UiSnapshot.friends)
export type FriendsView = {
    // The relay has friends (its welcome said so). False until one has, and for good after one
    // that hasn't: the UI shows nothing of friends then.
    supported: boolean;
    // The connection: off (none, or dormant), connecting (or waiting to try again), online
    status: "off" | "connecting" | "online";
    // This game's friend code (formatFriendCode to show it), once the relay's said it
    myCode?: string;
    // This player's name as the relay has it, or the one kept till it's said
    name: string;
    // The name this player picked (or kept from New name), if any, for a name field
    pickedName?: string;
    // Online first (and those in a room that can be joined first of those), then by name
    friends: FriendView[];
    // Players who've added this game and it hasn't added back, not ignored, oldest first
    requests: FriendRef[];
    // One per friend, newest first. Gone after INVITE_MS, or when taken or declined, or when
    // the friend goes offline or out of that room.
    invites: FriendInvite[];
    // Played a co-op run with, newest first, never a friend
    recent: RecentPlayer[];
    popups: FriendPopup[];
    // The relay's last error on this connection (its own English text, as coop.error), till the
    // next change asked for
    notice?: string;
};

export const NO_FRIENDS: FriendsView = {
    supported: false,
    status: "off",
    name: "",
    friends: [],
    requests: [],
    invites: [],
    recent: [],
    popups: [],
};

// An invite's good for this long
export const INVITE_MS = 2 * 60_000;
// Waits before connecting again, doubling from the first to the last
export const RECONNECT_FIRST_MS = 2000;
export const RECONNECT_MAX_MS = 60_000;
export const PING_INTERVAL_MS = 30_000;
// A ping with nothing back for this long: the connection's taken for dead
export const PONG_WAIT_MS = 10_000;
// Changes to the list in a burst go to the relay once: it takes 30 lists a minute and drops
// the rest without a word
const FRIENDS_DEBOUNCE_MS = 1000;
export const MAX_POPUPS = 5;
const MAX_REQUESTS = 50;

// What CoopLobby needs to say who this game is
export type FriendsIdentity = { secret(): string; name(): string | undefined };

export class FriendsClient {
    private socket?: WebSocket;
    private started = false;
    private closed = false;
    // The relay hasn't friends: nothing more's tried
    private dormant = false;
    private supported = false;
    private status: FriendsView["status"] = "off";
    private relayName = "";
    private myCode?: string;
    private notice?: string;
    private solo = false;
    // Those online, as the relay last said
    private presence = new Map<string, FriendPresence>();
    // A full presence has come since the page opened: until then nobody's "come online"
    private primed = false;
    private requests: FriendRef[] = [];
    // Requests already popped up for, so a reconnect's repeat doesn't again
    private requested = new Set<string>();
    private invites: FriendInvite[] = [];
    private popups: FriendPopup[] = [];
    private nextPopup = 1;
    private reconnectDelay = RECONNECT_FIRST_MS;
    private reconnectTimer?: number;
    private pingTimer?: number;
    private pongTimer?: number;
    private friendsTimer?: number;
    private inviteTimer?: number;
    private heardAt = 0;
    private stopListening?: () => void;

    // Fired once for each new one, after the store has it
    onInvite?: (invite: FriendInvite) => void;
    onRequest?: (from: FriendRef) => void;
    onFriendOnline?: (friend: FriendRef) => void;

    constructor(
        private readonly store: Pick<GameStore, "set">,
        readonly data: FriendsStore = new FriendsStore(),
    ) {
        this.stopListening = this.data.listen(() => {
            // Another tab's change: the relay hears this one's list too
            this.sendFriendsSoon();
            this.publish();
        });
        this.publish();
    }

    // For CoopLobby's hello
    readonly identity: FriendsIdentity = {
        secret: () => this.data.data.secret,
        name: () => this.data.data.name,
    };

    get view(): FriendsView {
        return this.makeView();
    }

    // Connects, once co-op's known to be there. Again does nothing.
    start(): void {
        if (this.started || this.closed) {
            return;
        }
        this.started = true;
        this.connect();
    }

    // For good: the page is going
    close(): void {
        this.closed = true;
        this.stopTimers();
        window.clearTimeout(this.reconnectTimer);
        window.clearTimeout(this.inviteTimer);
        this.reconnectTimer = this.inviteTimer = undefined;
        this.stopListening?.();
        this.stopListening = undefined;
        const socket = this.socket;
        this.socket = undefined;
        if (socket) {
            socket.onclose = null;
            socket.onmessage = null;
            try {
                socket.close();
            } catch {}
        }
        this.status = "off";
        this.publish();
    }

    private connect(): void {
        if (this.closed || this.dormant || this.socket) {
            return;
        }
        this.status = "connecting";
        this.publish();
        let socket: WebSocket;
        try {
            socket = new WebSocket(getRelayUrl());
        } catch {
            // No WebSocket, or an address it won't take
            this.scheduleReconnect();
            return;
        }
        this.socket = socket;
        socket.onmessage = (event) => {
            if (socket !== this.socket) {
                return;
            }
            this.heardAt = Date.now();
            let message: ServerMessage;
            try {
                message = JSON.parse(String(event.data));
            } catch {
                return;
            }
            this.receive(message);
        };
        socket.onclose = () => {
            if (socket === this.socket) {
                this.lost();
            }
        };
    }

    // The connection's gone: tried again after a while, unless it's dormant or closed
    private lost(): void {
        const socket = this.socket;
        this.socket = undefined;
        if (socket) {
            socket.onclose = null;
            socket.onmessage = null;
            try {
                socket.close();
            } catch {}
        }
        this.stopTimers();
        if (this.dormant || this.closed) {
            this.status = "off";
            this.publish();
            return;
        }
        this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        if (this.closed || this.dormant || this.reconnectTimer !== undefined) {
            return;
        }
        // Waiting to try again counts as connecting, so the UI doesn't flicker to off
        this.status = "connecting";
        this.publish();
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect();
        }, delay);
    }

    private stopTimers(): void {
        window.clearInterval(this.pingTimer);
        window.clearTimeout(this.pongTimer);
        window.clearTimeout(this.friendsTimer);
        this.pingTimer = this.pongTimer = this.friendsTimer = undefined;
    }

    private send(message: ClientMessage): void {
        if (this.socket?.readyState === WebSocket.OPEN && this.status === "online") {
            this.socket.send(JSON.stringify(message));
        }
    }

    private ping(): void {
        const sentAt = Date.now();
        this.send({ t: "ping" });
        window.clearTimeout(this.pongTimer);
        this.pongTimer = window.setTimeout(() => {
            this.pongTimer = undefined;
            // Nothing at all since the ping (a pong, or anything else, says it's alive)
            if (this.heardAt < sentAt) {
                this.lost();
            }
        }, PONG_WAIT_MS);
    }

    private receive(message: ServerMessage): void {
        switch (message.t) {
            case "welcome":
                if (message.friends !== true) {
                    // Not this relay: nothing more, ever
                    this.dormant = true;
                    this.supported = false;
                    this.lost();
                    return;
                }
                this.supported = true;
                this.status = "online";
                this.reconnectDelay = RECONNECT_FIRST_MS;
                this.relayName = message.name;
                this.send({
                    t: "hello",
                    secret: this.data.data.secret,
                    ...(this.data.data.name && { name: this.data.data.name }),
                    presence: true,
                });
                this.sendFriends();
                this.send({ t: "status", solo: this.solo });
                window.clearInterval(this.pingTimer);
                this.pingTimer = window.setInterval(() => this.ping(), PING_INTERVAL_MS);
                this.publish();
                break;
            case "identity":
                this.myCode = message.friendId;
                this.relayName = message.name;
                // No name picked: the one the relay gave is kept, so it's the same next time and
                // on the co-op lobby's connection too
                if (!this.data.data.name) {
                    this.data.setName(message.name);
                }
                // Someone who'd added this game themselves, by its code
                this.removeFriendLocally(message.friendId);
                this.publish();
                break;
            case "named":
                this.relayName = message.name;
                this.data.setName(message.name);
                this.publish();
                break;
            case "presence":
                this.receivePresence(message.friends, message.full === true);
                break;
            case "friendRequest":
                this.receiveRequest(message.from);
                break;
            case "invited":
                this.receiveInvite(message.from, message.room);
                break;
            case "error":
                this.notice = typeof message.message === "string" ? message.message : undefined;
                this.publish();
                break;
        }
    }

    // This game's own code in its own list would be a friend of itself
    private removeFriendLocally(id: string): void {
        if (this.data.data.friends.some((f) => f.id === id)) {
            this.data.remove(id);
            this.sendFriendsSoon();
        }
    }

    private isFriend(id: string): boolean {
        return this.data.data.friends.some((f) => f.id === id);
    }

    private receivePresence(list: FriendPresence[], full: boolean): void {
        if (!Array.isArray(list)) {
            return;
        }
        const cameOnline: FriendRef[] = [];
        // Kept through a reconnect, so its full presence pops up only those who are new
        const wasOnline = new Set(this.presence.keys());
        const told = new Set<string>();
        // A full one is everyone on, whenever it comes (another tab's list sent brings one too)
        if (full) {
            this.presence.clear();
        }
        for (const entry of list) {
            // Only friends in this game's list
            if (!entry || typeof entry.id !== "string" || !this.isFriend(entry.id)) {
                continue;
            }
            told.add(entry.id);
            if (entry.online) {
                // Each is all there is of them now (a room that's gone is left out)
                const name =
                    typeof entry.name === "string" ? entry.name : this.presence.get(entry.id)?.name;
                this.presence.set(entry.id, { ...entry, name });
                this.data.noteFriend(entry.id, name, true);
                if (!wasOnline.has(entry.id) && (this.primed || !full)) {
                    cameOnline.push({ id: entry.id, name: this.nameOf(entry.id) });
                }
            } else {
                this.presence.delete(entry.id);
            }
        }
        if (full) {
            this.primed = true;
        }
        const offline = new Set([...wasOnline].filter((id) => !this.presence.has(id)));
        for (const id of offline) {
            told.add(id);
        }
        this.dropStaleInvites(told);
        this.publish();
        for (const friend of cameOnline) {
            this.popup("online", friend);
            this.onFriendOnline?.(friend);
        }
    }

    private nameOf(id: string): string {
        return (
            this.presence.get(id)?.name ||
            this.data.data.friends.find((f) => f.id === id)?.name ||
            formatFriendCode(id)
        );
    }

    private receiveRequest(from: FriendRef): void {
        if (!from || typeof from.id !== "string" || parseFriendCode(from.id) !== from.id) {
            return;
        }
        const name = typeof from.name === "string" ? from.name : "";
        if (
            this.isFriend(from.id) ||
            from.id === this.myCode ||
            this.data.data.ignored.includes(from.id)
        ) {
            return;
        }
        const index = this.requests.findIndex((r) => r.id === from.id);
        if (index >= 0) {
            this.requests[index] = { id: from.id, name };
        } else if (this.requests.length < MAX_REQUESTS) {
            this.requests.push({ id: from.id, name });
        }
        const fresh = !this.requested.has(from.id);
        this.requested.add(from.id);
        this.publish();
        if (fresh) {
            this.popup("request", { id: from.id, name });
            this.onRequest?.({ id: from.id, name });
        }
    }

    private receiveInvite(from: FriendRef, room: FriendRoom & { code: string }): void {
        if (
            !from ||
            typeof from.id !== "string" ||
            !this.isFriend(from.id) ||
            !room ||
            typeof room.code !== "string"
        ) {
            return;
        }
        const ref = { id: from.id, name: typeof from.name === "string" ? from.name : "" };
        const held = this.invites.find((i) => i.from.id === from.id);
        // The same invite again (a reconnect's) changes nothing
        const fresh = held?.room.code !== room.code;
        const invite: FriendInvite = { from: ref, room, at: !fresh && held ? held.at : Date.now() };
        this.invites = [invite, ...this.invites.filter((i) => i.from.id !== from.id)];
        if (fresh) {
            this.popups = this.popups.filter(
                (p) => !(p.kind === "invite" && p.from.id === from.id),
            );
        }
        this.scheduleInviteExpiry();
        this.publish();
        if (fresh) {
            this.popup("invite", ref, room);
            this.onInvite?.(invite);
        }
    }

    // Invites past INVITE_MS, or from a friend the relay's just told of (told) who's gone offline
    // or out of that room. Only what's just been told: what's held of others may be older than
    // their invite.
    private dropStaleInvites(told: ReadonlySet<string> = new Set()): void {
        const now = Date.now();
        const kept = this.invites.filter((invite) => {
            if (now - invite.at >= INVITE_MS) {
                return false;
            }
            if (!told.has(invite.from.id)) {
                return true;
            }
            const friend = this.presence.get(invite.from.id);
            if (!friend) {
                return false;
            }
            const room = friend.room;
            // In the menus, on their own or on a run: out of the room. In another: its code or
            // name says so (an invite-only room's code isn't shown, but its name is).
            return (
                friend.state === "room" &&
                !!room &&
                (room.code === undefined || room.code === invite.room.code) &&
                room.name === invite.room.name
            );
        });
        if (kept.length !== this.invites.length) {
            this.setInvites(kept);
        }
    }

    private setInvites(invites: FriendInvite[]): void {
        this.invites = invites;
        const from = new Set(invites.map((i) => i.from.id));
        this.popups = this.popups.filter((p) => p.kind !== "invite" || from.has(p.from.id));
        this.scheduleInviteExpiry();
    }

    // One timer, for the invite that's next to expire
    private scheduleInviteExpiry(): void {
        window.clearTimeout(this.inviteTimer);
        this.inviteTimer = undefined;
        if (this.invites.length === 0 || this.closed) {
            return;
        }
        const next = Math.min(...this.invites.map((i) => i.at + INVITE_MS));
        this.inviteTimer = window.setTimeout(
            () => {
                this.inviteTimer = undefined;
                this.dropStaleInvites();
                this.publish();
            },
            Math.max(0, next - Date.now()),
        );
    }

    private popup(kind: FriendPopup["kind"], from: FriendRef, room?: FriendPopup["room"]): void {
        this.popups = [
            ...this.popups,
            { id: this.nextPopup++, kind, from, at: Date.now(), ...(room && { room }) },
        ].slice(-MAX_POPUPS);
        this.publish();
    }

    // The list to the relay, after a moment, so a burst of changes goes once
    private sendFriendsSoon(): void {
        if (this.friendsTimer !== undefined || this.status !== "online") {
            return;
        }
        this.friendsTimer = window.setTimeout(() => {
            this.friendsTimer = undefined;
            this.sendFriends();
        }, FRIENDS_DEBOUNCE_MS);
    }

    private sendFriends(): void {
        window.clearTimeout(this.friendsTimer);
        this.friendsTimer = undefined;
        this.send({ t: "friends", ids: this.data.data.friends.map((f) => f.id) });
    }

    private publish(): void {
        this.store.set({ friends: this.makeView() });
    }

    private makeView(): FriendsView {
        const data = this.data.data;
        const friends: FriendView[] = data.friends.map((friend) => {
            // Kept through a reconnect, but not shown meanwhile
            const presence = this.status === "online" ? this.presence.get(friend.id) : undefined;
            return {
                id: friend.id,
                name: presence?.name || friend.name || formatFriendCode(friend.id),
                online: presence !== undefined,
                ...(presence?.state && { state: presence.state }),
                ...(presence?.room && { room: presence.room }),
                pending: friend.seen !== true && presence === undefined,
            };
        });
        const rank = (f: FriendView) => (f.online ? (f.room?.code ? 0 : 1) : 2);
        friends.sort(
            (a, b) =>
                rank(a) - rank(b) ||
                a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
                a.id.localeCompare(b.id),
        );
        const ignored = new Set(data.ignored);
        return {
            supported: this.supported,
            status: this.status,
            ...(this.myCode && { myCode: this.myCode }),
            name: this.relayName || data.name || "",
            ...(data.name && { pickedName: data.name }),
            friends,
            requests: this.requests.filter(
                (r) => !ignored.has(r.id) && !data.friends.some((f) => f.id === r.id),
            ),
            invites: this.invites,
            recent: data.recent,
            popups: this.popups,
            ...(this.notice && { notice: this.notice }),
        };
    }

    // ---- What the UI does (through GameClient) ----

    // A friend by their code, typed or pasted. Adding someone who's asked is accepting them.
    addFriend(codeOrText: string): AddResult {
        const id = parseFriendCode(codeOrText);
        if (!id) {
            return "invalid";
        }
        const name =
            this.requests.find((r) => r.id === id)?.name ??
            this.data.data.recent.find((p) => p.id === id)?.name ??
            "";
        const result = this.data.add(id, name, this.myCode);
        if (result === "added") {
            this.notice = undefined;
            this.requests = this.requests.filter((r) => r.id !== id);
            this.popups = this.popups.filter((p) => !(p.kind === "request" && p.from.id === id));
            this.sendFriendsSoon();
            this.publish();
        }
        return result;
    }

    removeFriend(id: string): void {
        if (!this.isFriend(id)) {
            return;
        }
        this.data.remove(id);
        // Still listing this game, they'd come straight back as a request (the relay sends one
        // at once): ignored, till they're added again
        this.data.ignore(id);
        this.requests = this.requests.filter((r) => r.id !== id);
        this.presence.delete(id);
        this.setInvites(this.invites.filter((i) => i.from.id !== id));
        this.popups = this.popups.filter((p) => p.from.id !== id);
        this.sendFriendsSoon();
        this.publish();
    }

    acceptRequest(id: string): AddResult {
        return this.addFriend(id);
    }

    // Hidden from now on, until they're added by their code
    ignoreRequest(id: string): void {
        this.data.ignore(id);
        this.requests = this.requests.filter((r) => r.id !== id);
        this.popups = this.popups.filter((p) => !(p.kind === "request" && p.from.id === id));
        this.publish();
    }

    // The name this player picked: kept for every hello after, and told to the relay now (which
    // answers with the name as it cleaned it). False for one that's empty once tidied.
    setName(text: string): boolean {
        const name = cleanName(text);
        if (!name) {
            return false;
        }
        this.data.setName(name);
        this.notice = undefined;
        if (name !== this.relayName) {
            this.send({ t: "name", name });
        }
        this.publish();
        return true;
    }

    // A name the relay gave on the co-op lobby's connection (New name, or one picked there):
    // kept, and this connection's made to match
    rememberName(name: string): void {
        const clean = cleanName(name);
        if (!clean) {
            return;
        }
        this.data.setName(clean);
        if (clean !== this.relayName) {
            this.send({ t: "name", name: clean });
        }
        this.publish();
    }

    // On a run of this player's own, or back from it. Told to the relay on change, and on every
    // connection.
    setSolo(solo: boolean): void {
        if (solo === this.solo) {
            return;
        }
        this.solo = solo;
        this.send({ t: "status", solo });
    }

    // No thanks to a friend's invite
    declineInvite(friendId: string): void {
        const invite = this.invites.find((i) => i.from.id === friendId);
        if (!invite) {
            return;
        }
        this.send({ t: "decline", to: friendId, code: invite.room.code });
        this.setInvites(this.invites.filter((i) => i !== invite));
        this.publish();
    }

    // A friend's invite taken up: gone from the list, and its room's code to join
    takeInvite(friendId: string): string | undefined {
        this.dropStaleInvites();
        const invite = this.invites.find((i) => i.from.id === friendId);
        if (!invite) {
            this.publish();
            return undefined;
        }
        this.setInvites(this.invites.filter((i) => i !== invite));
        this.publish();
        return invite.room.code;
    }

    // A friend's room's code, while it can be joined without asking
    friendRoom(friendId: string): string | undefined {
        return this.status === "online" ? this.presence.get(friendId)?.room?.code : undefined;
    }

    // A friend said no to this player's invite (CoopLobby hears it, in the room)
    noteDeclined(from: FriendRef): void {
        if (from && typeof from.id === "string") {
            this.popup("declined", { id: from.id, name: from.name || this.nameOf(from.id) });
        }
    }

    // A co-op run's other players, for Recent: those whose game said who it is
    noteRecent(members: { friendId?: string; name: string }[]): void {
        const players = members.flatMap((m) =>
            m.friendId && !this.isFriend(m.friendId) ? [{ id: m.friendId, name: m.name }] : [],
        );
        if (players.length > 0) {
            this.data.noteRecent(players, this.myCode);
            this.publish();
        }
    }

    dismissPopup(id: number): void {
        if (this.popups.some((p) => p.id === id)) {
            this.popups = this.popups.filter((p) => p.id !== id);
            this.publish();
        }
    }

    clearNotice(): void {
        if (this.notice) {
            this.notice = undefined;
            this.publish();
        }
    }
}
