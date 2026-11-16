import { MAP_BY_ID } from "../../content/maps";
import { WardrobeLook } from "../../content/wardrobe";
import { t, tl } from "../../i18n";
import { GameStore } from "../GameStore";
import type { FriendsIdentity } from "./Friends";
import { cleanName } from "./FriendsStore";
import {
    ClientMessage,
    DownMessage,
    FriendRef,
    GameStart,
    GoneReason,
    Loadout,
    MAX_CHAT_LENGTH,
    Member,
    MissingMap,
    RoomListing,
    RoomView,
    ServerMessage,
    UpMessage,
} from "./protocol";

// What a player readies up with, as the relays compare it (pickOf in
// server/cloudflare/src/shared.mjs): not the host's invocations
function pickOf(me: Partial<Member>): string {
    return JSON.stringify([
        me.characterId,
        me.loadout && { ...me.loadout, invocations: undefined },
    ]);
}

// The co-op menus' view of things, for the UI
export type CoopView = {
    status: "offline" | "connecting" | "online";
    // Why the last thing didn't work, shown until the next try
    error?: string;
    // Open rooms to join, while not in one: a page of them, which one, of
    // how many, and how many rooms in all
    rooms: RoomListing[];
    roomsPage: number;
    roomsPages: number;
    roomsTotal: number;
    // No room for another one on the relay until one goes
    roomsFull: boolean;
    room?: RoomView;
    // This player's id in the room
    you?: string;
    // This player's name, given by the relay on connecting ("" till then)
    name: string;
    // Where the relay sees this player playing from, for their flag (see
    // MemberView), if it knows
    country?: string;
    // There's a relay to play co-op through (the game only offers it then);
    // undefined until it's been asked
    available?: boolean;
    // The relay lets players into rooms on maps they haven't unlocked
    anyMap: boolean;
    // The relay has friends (welcome.friends): invites, chat, picked names and rooms for friends.
    // Without it none of those are offered.
    friends: boolean;
    // This game's friend code, as the relay said after its hello
    myCode?: string;
    // The room's chat, oldest first, the last MAX_CHAT_LINES of it. Emptied on leaving the room
    // or losing the connection.
    chat: ChatLine[];
    // Friends invited into this room, by their code: the invite reached their game (sent), or
    // they said no (declined). Emptied on leaving the room.
    invited: Record<string, "sent" | "declined">;
};

// A line of the room's chat. id: to key it by, counting up. from: the member's id in the room.
// name: theirs when it came ("" if they'd gone by then). mine: this player said it. at:
// Date.now() when it came.
export type ChatLine = {
    id: number;
    from: string;
    name: string;
    text: string;
    mine: boolean;
    at: number;
};

export const MAX_CHAT_LINES = 50;

export const OFFLINE: CoopView = {
    status: "offline",
    rooms: [],
    roomsPage: 0,
    roomsPages: 1,
    roomsTotal: 0,
    roomsFull: false,
    name: "",
    anyMap: false,
    friends: false,
    chat: [],
    invited: {},
};

// How long to wait for the relay to say it's there
const AVAILABLE_TIMEOUT_MS = 4000;

// How often to ask for the open rooms, from a relay that doesn't send them as
// they change (listUpdates in its welcome)
const LIST_INTERVAL_MS = 5000;
const PING_INTERVAL_MS = 30_000;
// Out of a room with nothing done for this long, the connection's closed, so
// a tab left on the list doesn't keep the relay busy. A minute under the
// relays' own (IDLE_CONNECTION_MS), which check less often, so this message is
// the one the player sees.
export const LOBBY_IDLE_MS = 9 * 60_000;
const IDLE_TEXT = "Disconnected after a while with nothing happening.";

// A room's connection that drops (a network blip, or the relay restarting)
// is tried again for this long before the room's given up on. The relay
// holds the player's place a little longer (RESUME_GRACE_MS in
// server/cloudflare/src/room.mjs).
export const RESUME_WINDOW_MS = 10_000;
// Waits between tries, the last repeating
const RESUME_DELAYS_MS = [0, 250, 500, 1000, 2000];
// A single handshake that hangs must not consume the whole recovery window.
// The trade: one that always takes longer than this (a weak mobile signal)
// never gets through.
const RESUME_ATTEMPT_MS = 2500;
// What's said in the room meanwhile waits, up to this many messages
const MAX_WAITING_MESSAGES = 2000;
// A room's connection can die without closing (a network that went away, a
// laptop asleep), and then nothing says so. One that's sent nothing back for
// this long after a ping is taken as dropped, and made again as above.
const PONG_WAIT_MS = 8000;
// Local checks only: these do not send periodic application probes.
const ROOM_CHECK_MS = 500;
// A selection the room hasn't confirmed is sent again once per connection,
// after this long, with a ping: a dead connection is then found and made again
// (PONG_WAIT_MS), and the selection's sent again on the new one
const MEMBER_RETRY_MS = 1000;
// A room that answers the ping but still hasn't confirmed it this long after
// the retry: the player's told (UNCONFIRMED_TEXT)
const MEMBER_WAIT_MS = 3000;
const UNCONFIRMED_TEXT = "Couldn't confirm your selection. Please choose it again.";
// During a run, a room that's been quiet this long is pinged (keepAlive), so
// a dead connection's found while the host still has the frames to send
// again (RESEND_FRAMES in CoopRun). A guest hears the host's frames all the
// time, so it's mostly a host whose guests are standing still that sends
// these (and a guest while the host's quiet, as when maps are loading).
// keepAlive also pings a room it's sent nothing to for PING_INTERVAL_MS (a
// guest standing still), so the room hears from a hidden tab whose regular
// ping the browser has slowed (SILENT_MS in room.mjs).
const RUN_QUIET_MS = 5000;
// keepAlive called further apart than this means the page was frozen or
// asleep meanwhile, and what's come may not have been read yet: nothing's
// judged until a fresh ping's had its time
const KEEP_ALIVE_LATE_MS = 2000;
// The same for the regular ping, which Chrome can slow to once a minute in a
// hidden tab
const TICK_LATE_MS = PING_INTERVAL_MS * 2.5;
// As the Cloudflare relay answers it without waking the room (room.mjs)
const PING_TEXT = JSON.stringify({ t: "ping" });

const GONE_TEXT: Record<GoneReason, string> = {
    left: "",
    kicked: "The host removed you from the party.",
    disbanded: "The host disbanded the party.",
    hostLeft: "The host left, so the party's over.",
    idle: "The room closed after half an hour with nothing happening.",
};

// Where the relay is: VITE_COOP_URL when the build gives one, otherwise
// coop beside the page (the dev server's, or one a host puts there)
export function getRelayUrl(): string {
    const configured = import.meta.env.VITE_COOP_URL as string | undefined;
    if (configured) {
        return configured;
    }
    const url = new URL("coop", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.search = "";
    url.hash = "";
    return url.toString();
}

// A room's own connection, for a relay that keeps each room on its own (see
// "goto" in protocol.ts)
function getRoomUrl(code: string, ticket: string, param = "ticket"): string {
    const url = new URL(getRelayUrl());
    url.pathname = `${url.pathname.replace(/\/$/, "")}/room/${encodeURIComponent(code)}`;
    url.search = `?${param}=${encodeURIComponent(ticket)}`;
    return url.toString();
}

// What goes to the room's own connection, when there is one: everything said
// in a room. The rest (pings, the list, making or joining one) is the lobby's.
// The Cloudflare relay hasn't friends, so never gets name, invite or chat, but
// they're the room's all the same.
const ROOM_MESSAGES: ReadonlySet<ClientMessage["t"]> = new Set([
    "leave",
    "me",
    "rename",
    "name",
    "invite",
    "chat",
    "settings",
    "kick",
    "disband",
    "start",
    "end",
    "up",
    "down",
]);

// The relay's address over plain HTTP, which answers whether it's there
function getStatusUrl(): string {
    const url = new URL(getRelayUrl());
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    return url.toString();
}

// Who can join a room without its code: anyone (open, and listed), friends of
// anyone in it (friends), or no one (invite, by its code or a friend's invite)
export type RoomAccess = "invite" | "friends" | "open";

// A room's flags for an access (the create and settings messages')
export function accessFlags(access: RoomAccess): { open: boolean; friends: boolean } {
    return { open: access === "open", friends: access !== "invite" };
}

// A room's access, by its flags: an open room's for friends too, whatever it says
export function roomAccess(room: Pick<RoomView, "open" | "friends">): RoomAccess {
    return room.open ? "open" : room.friends ? "friends" : "invite";
}

// Room codes are this long (the relay makes them)
export const ROOM_CODE_LENGTH = 8;

// A room code from what was typed or pasted: the code, or an invite link
// with it (https://example.com/?room=ABCDEFGH)
export function parseRoomCode(text: string): string {
    const code = /[?&]room=([A-Za-z0-9]+)/.exec(text)?.[1] ?? text;
    return code
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase()
        .slice(0, ROOM_CODE_LENGTH);
}

// What's missing for a room's map, by the map's name
export function describeMissing(need: MissingMap): string {
    const map = MAP_BY_ID.get(need.mapId);
    const what = t("coop.missing_map", {
        map: map ? tl(map.name) : need.mapId,
        hard: need.hard ? t("coop.hard_suffix") : "",
        endless: need.endless ? t("coop.endless_suffix") : "",
    });
    return need.who
        ? t("coop.player_missing_unlock", { name: need.who, what })
        : t("coop.you_missing_unlock", { what });
}

// The connection to the co-op relay, and the room this player is in. What
// the room's run does goes to whoever's set the on* handlers (GameClient).
export class CoopLobby {
    private socket?: WebSocket;
    // With a relay that keeps rooms on their own connections: the room's,
    // and one being made or joined (which takes over once the room says
    // it's in)
    private roomSocket?: WebSocket;
    private enteringSocket?: WebSocket;
    // The create or join that's waiting on the relay's "goto"
    private entering?: ClientMessage;
    // To come back to the room with, from the relay, should its connection
    // drop
    private resume?: { code: string; token: string };
    // Coming back: since when, the try under way and the next one, and what's
    // been said in the room meanwhile
    private resuming?: {
        since: number;
        tries: number;
        socket?: WebSocket;
        timer?: number;
        // Closes a try still connecting when the window's up
        giveUp?: number;
        waiting: string[];
    };
    // The lobby's connection dropped while in a room, which carries on; it's
    // made again once out of the room
    private lobbyLost = false;
    private listTimer?: number;
    private pingTimer?: number;
    private roomTimer?: number;
    private roomCheckedAt = 0;
    private memberAcks = false;
    private meSequence = 0;
    // The latest selection the room hasn't confirmed (memberAcks), with every
    // change since the last it did
    private pendingMe?: {
        sequence: number;
        changes: Partial<Member>;
        sentAt: number;
        retried: boolean;
        // Told the player (UNCONFIRMED_TEXT): no more tries on this connection
        gaveUp: boolean;
    };
    // When this player last did anything here, for LOBBY_IDLE_MS
    private activeAt = 0;
    // The room's connection: when anything last came on it, when anything
    // was last sent on it, when it was last pinged, and when keepAlive and the
    // regular ping last ran
    private roomHeardAt = 0;
    private roomSentAt = 0;
    private roomPingAt?: number;
    private keptAliveAt = 0;
    private tickAt = 0;
    private view: CoopView;
    // What this player looks like to the room, sent on joining and on change
    private me: Partial<Member> = {};
    // The lobby's connection has had its welcome. Before then a create or join
    // waits (beforeWelcome), so that on a relay with friends nothing goes ahead
    // of the hello.
    private welcomed = false;
    private beforeWelcome?: ClientMessage;
    private chatId = 0;
    // The relay's HTTP check said it has friends too (checkAvailable): only
    // then is the friends' connection made. Its welcome still has the last word.
    probedFriends = false;

    onStart?: (game: GameStart) => void;
    onUp?: (from: string, message: UpMessage) => void;
    onDown?: (message: DownMessage) => void;
    onLeft?: (id: string) => void;
    onGone?: (reason: GoneReason) => void;
    onClosed?: () => void;
    onReconnecting?: () => void;
    onResumed?: () => void;
    onMapChanged?: () => void;
    // The host's tab changed between Cards only and the usual, or the room has a new host: each
    // player's loadout goes by it
    onRoomCardsOnlyChanged?: () => void;
    // The relay's given this player a name (named): New name's, or one they picked
    onNamed?: (name: string) => void;
    // A friend said no to this player's invite
    onDeclined?: (from: FriendRef) => void;

    // identity: who this game is, for a relay with friends (FriendsClient.identity)
    constructor(
        readonly store: GameStore,
        private readonly identity?: FriendsIdentity,
    ) {
        this.view = OFFLINE;
    }

    get room(): RoomView | undefined {
        return this.view.room;
    }

    get id(): string | undefined {
        return this.view.you;
    }

    // Cloudflare transfers the party to a room socket; Node keeps the lobby socket.
    get relayKind(): "node" | "cloudflare" {
        return this.roomSocket || this.resuming ? "cloudflare" : "node";
    }

    get isHost(): boolean {
        return this.view.room !== undefined && this.view.room.hostId === this.view.you;
    }

    get name(): string {
        return this.view.name;
    }

    private update(changes: Partial<CoopView>): void {
        const previousMap = this.view.room?.mapId;
        const previousCardsOnly = roomPlaysCardsOnly(this.view.room);
        const previousHost = this.view.room?.hostId;
        const previousCode = this.view.room?.code;
        this.view = { ...this.view, ...changes };
        // A room's chat and invites are that room's: gone with it, every way out
        if (
            this.view.room?.code !== previousCode &&
            (this.view.chat.length > 0 || Object.keys(this.view.invited).length > 0)
        ) {
            this.view = { ...this.view, chat: [], invited: {} };
        }
        this.store.set({ coop: this.view });
        if (this.view.room?.mapId !== previousMap) {
            this.onMapChanged?.();
        }
        if (
            this.view.room &&
            (roomPlaysCardsOnly(this.view.room) !== previousCardsOnly ||
                this.view.room.hostId !== previousHost)
        ) {
            this.onRoomCardsOnlyChanged?.();
        }
    }

    // Connects, if it isn't, and keeps the list of open rooms fresh while
    // this player's not in one
    connect(): Promise<void> {
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
            return Promise.resolve();
        }
        this.update({ status: "connecting", error: undefined });
        return new Promise((resolve) => {
            let socket: WebSocket;
            try {
                socket = new WebSocket(getRelayUrl());
            } catch (e) {
                this.update({ status: "offline", error: t("coop.couldnt_reach_server") });
                resolve();
                return;
            }
            this.socket = socket;
            this.welcomed = false;
            this.beforeWelcome = undefined;
            socket.onmessage = (event) => {
                let message: ServerMessage;
                try {
                    message = JSON.parse(String(event.data));
                } catch {
                    return;
                }
                this.receive(message);
                if (message.t === "welcome") {
                    resolve();
                }
            };
            socket.onclose = () => {
                if (this.socket !== socket) {
                    return;
                }
                const wasOnline = this.view.status === "online";
                this.socket = undefined;
                if (this.view.room && (this.roomSocket || this.resuming)) {
                    // The room has its own connection and carries on
                    this.lobbyLost = true;
                    resolve();
                    return;
                }
                this.stopTimers();
                this.closeRoomSockets();
                this.update({
                    status: "offline",
                    room: undefined,
                    you: undefined,
                    // A new one comes with the next connection
                    name: "",
                    friends: false,
                    myCode: undefined,
                    chat: [],
                    invited: {},
                    rooms: [],
                    roomsPage: 0,
                    error: wasOnline ? t("coop.lost_server") : t("coop.couldnt_reach_server"),
                });
                this.onClosed?.();
                resolve();
            };
        });
    }

    close(): void {
        const socket = this.socket;
        this.socket = undefined;
        this.stopTimers();
        this.closeRoomSockets();
        socket?.close();
        this.welcomed = false;
        this.beforeWelcome = undefined;
        this.update({
            status: "offline",
            room: undefined,
            you: undefined,
            name: "",
            friends: false,
            myCode: undefined,
            chat: [],
            invited: {},
            rooms: [],
            roomsPage: 0,
        });
    }

    private stopTimers(): void {
        window.clearInterval(this.listTimer);
        window.clearInterval(this.pingTimer);
        this.listTimer = this.pingTimer = undefined;
    }

    private send(message: ClientMessage): void {
        // A create or join before the welcome (an invite link's, as the page
        // opens) waits for it, and goes after the hello
        if (this.socket && !this.welcomed && (message.t === "create" || message.t === "join")) {
            this.beforeWelcome = message;
            return;
        }
        if (this.resuming && ROOM_MESSAGES.has(message.t)) {
            if (this.resuming.waiting.length < MAX_WAITING_MESSAGES) {
                this.resuming.waiting.push(JSON.stringify(message));
            }
            return;
        }
        const socket =
            this.roomSocket && ROOM_MESSAGES.has(message.t) ? this.roomSocket : this.socket;
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
            if (socket === this.roomSocket) {
                this.roomSentAt = Date.now();
            }
        }
        if (message.t === "ping" && this.roomSocket?.readyState === WebSocket.OPEN) {
            this.pingRoom(this.roomSocket);
        }
    }

    private pingRoom(socket: WebSocket): void {
        const now = Date.now();
        socket.send(PING_TEXT);
        this.roomSentAt = now;
        // A ping still unanswered keeps its time, so another can't put off
        // finding the connection dead
        if (!this.isRoomPingUnanswered()) {
            this.roomPingAt = now;
        }
    }

    private isRoomPingUnanswered(): boolean {
        return this.roomPingAt !== undefined;
    }

    // Whether the room's connection has gone PONG_WAIT_MS since a ping with
    // nothing at all back
    private isRoomSilent(now: number): boolean {
        return this.isRoomPingUnanswered() && now - this.roomPingAt! > PONG_WAIT_MS;
    }

    // Checks the room's connection, and makes it again if it's stopped
    // answering. Returns it if it's open and still in use: not while coming
    // back, and not after a gap (late), which starts the check again.
    private checkRoomSocket(late: boolean): WebSocket | undefined {
        const socket = this.roomSocket;
        if (!socket || this.resuming) {
            return undefined;
        }
        if (socket.readyState !== WebSocket.OPEN) {
            // Closing after a "gone" or a leave is the room's ordinary way
            // out, and its close comes next; shut while still in the room, it
            // may never say so
            if (this.view.room) {
                this.roomSocketDead(socket);
            }
            return undefined;
        }
        if (late) {
            this.roomPingAt = undefined;
            if (this.pendingMe) {
                this.pendingMe.sentAt = Date.now();
            }
            return undefined;
        }
        const now = Date.now();
        if (this.isRoomSilent(now)) {
            this.roomSocketDead(socket);
            return undefined;
        }
        return socket;
    }

    // A room connection that stopped answering: closed, and made again as if it
    // had dropped, since a dead one may never say it's closed
    private roomSocketDead(socket: WebSocket): void {
        console.warn("Co-op: the room's connection stopped answering, so it's being made again");
        socket.onclose = null;
        socket.onmessage = null;
        socket.close();
        this.roomSocketClosed(socket);
    }

    // Called on each step of a co-op run, in a hidden tab too: pings a room
    // that's been quiet for RUN_QUIET_MS, or that's heard nothing from this
    // game for PING_INTERVAL_MS, and finds a dead connection within seconds
    // rather than the regular ping's minute or so
    keepAlive(): void {
        const now = Date.now();
        const late = now - this.keptAliveAt > KEEP_ALIVE_LATE_MS;
        this.keptAliveAt = now;
        this.maintainRoom(late, true);
    }

    private maintainRoom(late: boolean, playing: boolean): void {
        const now = Date.now();
        const socket = this.checkRoomSocket(late);
        if (!socket) {
            return;
        }
        const pending = this.pendingMe;
        if (pending && !pending.gaveUp) {
            if (!pending.retried && now - pending.sentAt >= MEMBER_RETRY_MS) {
                pending.retried = true;
                this.sendPendingMe();
                this.pingRoom(socket);
            } else if (
                pending.retried &&
                now - pending.sentAt >= MEMBER_WAIT_MS &&
                !this.isRoomPingUnanswered()
            ) {
                pending.gaveUp = true;
                this.update({ error: UNCONFIRMED_TEXT });
            }
        }
        if (
            (playing &&
                !this.isRoomPingUnanswered() &&
                now - Math.max(this.roomHeardAt, this.roomPingAt ?? 0) >= RUN_QUIET_MS) ||
            now - this.roomSentAt >= PING_INTERVAL_MS
        ) {
            this.pingRoom(socket);
        }
    }

    // Makes or joins a room on its own connection, as the relay said to
    private enterRoom(code: string, ticket: string): void {
        const message = this.entering;
        this.entering = undefined;
        if (!message) {
            return;
        }
        this.enteringSocket?.close();
        let socket: WebSocket;
        try {
            socket = new WebSocket(getRoomUrl(code, ticket));
        } catch {
            this.update({ error: t("coop.couldnt_reach_room") });
            this.outOfRoom();
            return;
        }
        this.enteringSocket = socket;
        socket.onopen = () => socket.send(JSON.stringify(message));
        socket.onmessage = (event) => {
            let received: ServerMessage;
            try {
                received = JSON.parse(String(event.data));
            } catch {
                return;
            }
            if (socket !== this.enteringSocket) {
                return;
            }
            if (received.t === "room") {
                // In: the room before this (if any) is left by closing it
                const previous = this.roomSocket;
                this.stopResuming();
                this.pendingMe = undefined;
                this.useRoomSocket(socket);
                this.enteringSocket = undefined;
                previous?.close();
            } else if (received.t === "error") {
                this.enteringSocket = undefined;
                socket.close();
            }
            this.receive(received);
        };
        socket.onclose = () => {
            if (socket === this.enteringSocket) {
                this.enteringSocket = undefined;
                this.update({ error: t("coop.couldnt_reach_room") });
                this.outOfRoom();
            }
        };
    }

    // The room's connection, once it's in
    private useRoomSocket(socket: WebSocket): void {
        this.roomSocket = socket;
        // The room's just heard from it (the create, join or resume)
        this.roomHeardAt = this.roomSentAt = Date.now();
        this.roomPingAt = undefined;
        this.roomCheckedAt = Date.now();
        window.clearInterval(this.roomTimer);
        this.roomTimer = window.setInterval(() => {
            const now = Date.now();
            const late = now - this.roomCheckedAt > KEEP_ALIVE_LATE_MS;
            this.roomCheckedAt = now;
            // A running game checks every frame, even when the tab's regular
            // timers are throttled. Do not reset those checks here.
            if (now - this.keptAliveAt <= KEEP_ALIVE_LATE_MS) {
                return;
            }
            if (late) {
                // After a gap nothing's judged here (a reply may still be
                // unread), but the ping isn't forgotten either: in a hidden
                // tab, slowed to a minute, this would forget the regular
                // ping's every time, and tick() judges it (TICK_LATE_MS)
                if (this.pendingMe) {
                    this.pendingMe.sentAt = now;
                }
                return;
            }
            this.maintainRoom(false, false);
        }, ROOM_CHECK_MS);
        socket.onmessage = (event) => {
            if (socket !== this.roomSocket) {
                return;
            }
            let received: ServerMessage;
            try {
                received = JSON.parse(String(event.data));
            } catch {
                return;
            }
            this.roomHeardAt = Date.now();
            this.roomPingAt = undefined;
            this.receive(received);
        };
        socket.onclose = () => this.roomSocketClosed(socket);
    }

    private roomSocketClosed(socket: WebSocket): void {
        if (socket !== this.roomSocket) {
            return;
        }
        this.roomSocket = undefined;
        window.clearInterval(this.roomTimer);
        this.roomTimer = undefined;
        // Closed by the room after a "gone" (which said why), or lost
        if (!this.view.room) {
            this.outOfRoom();
        } else if (this.resume) {
            this.startResuming();
        } else {
            this.roomLost(t("coop.lost_room"));
        }
    }

    private startResuming(): void {
        this.resuming = { since: Date.now(), tries: 0, waiting: [] };
        this.onReconnecting?.();
        this.tryResuming();
    }

    private tryResuming(): void {
        const resuming = this.resuming;
        const resume = this.resume;
        if (!resuming || !resume) {
            return;
        }
        if (Date.now() - resuming.since > RESUME_WINDOW_MS) {
            this.roomLost(t("coop.lost_room"));
            return;
        }
        const delay = RESUME_DELAYS_MS[Math.min(resuming.tries, RESUME_DELAYS_MS.length - 1)];
        resuming.tries++;
        resuming.timer = window.setTimeout(() => {
            resuming.timer = undefined;
            if (this.resuming !== resuming) {
                return;
            }
            let socket: WebSocket;
            try {
                socket = new WebSocket(getRoomUrl(resume.code, resume.token, "resume"));
            } catch {
                this.tryResuming();
                return;
            }
            resuming.socket = socket;
            // A connection can hang while connecting (no signal, a captive
            // portal) for far longer than the room holds the place
            window.clearTimeout(resuming.giveUp);
            resuming.giveUp = window.setTimeout(
                () => {
                    if (this.resuming === resuming && resuming.socket === socket) {
                        resuming.socket = undefined;
                        socket.close();
                        this.tryResuming();
                    }
                },
                Math.min(
                    RESUME_ATTEMPT_MS,
                    Math.max(0, RESUME_WINDOW_MS - (Date.now() - resuming.since)) + 1,
                ),
            );
            socket.onmessage = (event) => {
                if (this.resuming !== resuming || resuming.socket !== socket) {
                    return;
                }
                let received: ServerMessage;
                try {
                    received = JSON.parse(String(event.data));
                } catch {
                    return;
                }
                if (received.t === "room") {
                    // Back: what waited goes now
                    window.clearTimeout(resuming.giveUp);
                    this.resuming = undefined;
                    this.useRoomSocket(socket);
                    for (const text of resuming.waiting) {
                        socket.send(text);
                    }
                    this.receive(received);
                    if (this.pendingMe) {
                        this.pendingMe.retried = false;
                        this.pendingMe.gaveUp = false;
                        this.sendPendingMe();
                    }
                    this.onResumed?.();
                } else if (received.t === "error") {
                    resuming.socket = undefined;
                    socket.close();
                    this.roomLost(received.message);
                }
            };
            socket.onclose = () => {
                if (this.resuming === resuming && resuming.socket === socket) {
                    resuming.socket = undefined;
                    this.tryResuming();
                }
            };
        }, delay);
    }

    private stopResuming(): void {
        const resuming = this.resuming;
        this.resuming = undefined;
        if (resuming) {
            window.clearTimeout(resuming.timer);
            window.clearTimeout(resuming.giveUp);
            resuming.socket?.close();
        }
    }

    // The room's gone without a word from it
    private roomLost(error: string): void {
        this.stopResuming();
        this.resume = undefined;
        this.update({ room: undefined, error });
        this.onClosed?.();
        this.outOfRoom();
    }

    // Out of a room, or not into one: back to the open rooms, which a relay
    // that sends them as they change (listUpdates) stops sending on a create
    // or join, until it's asked again. Every way out comes through here. The
    // lobby's connection again, if it dropped meanwhile (its welcome asks).
    private outOfRoom(): void {
        if (this.view.room) {
            return;
        }
        this.pendingMe = undefined;
        this.memberAcks = false;
        window.clearInterval(this.roomTimer);
        this.roomTimer = undefined;
        if (this.lobbyLost) {
            this.lobbyLost = false;
            void this.connect();
        } else {
            this.refresh();
        }
    }

    private closeRoomSockets(): void {
        this.stopResuming();
        this.resume = undefined;
        this.pendingMe = undefined;
        this.memberAcks = false;
        window.clearInterval(this.roomTimer);
        this.roomTimer = undefined;
        const sockets = [this.roomSocket, this.enteringSocket];
        this.roomSocket = this.enteringSocket = undefined;
        this.entering = undefined;
        for (const socket of sockets) {
            socket?.close();
        }
    }

    private receive(message: ServerMessage): void {
        switch (message.t) {
            case "welcome": {
                this.stopTimers();
                const friends = message.friends === true && this.identity !== undefined;
                this.welcomed = true;
                // Who this game is, before anything else on the connection
                if (friends) {
                    const name = this.identity!.name();
                    this.send({
                        t: "hello",
                        secret: this.identity!.secret(),
                        ...(name && { name }),
                    });
                }
                this.update({
                    status: "online",
                    you: message.id,
                    name: message.name,
                    country: message.country,
                    error: undefined,
                    available: true,
                    anyMap: message.anyMap === true,
                    friends,
                    myCode: undefined,
                });
                this.activeAt = Date.now();
                this.refresh();
                const waiting = this.beforeWelcome;
                this.beforeWelcome = undefined;
                if (waiting) {
                    this.send(waiting);
                }
                if (message.listUpdates !== true) {
                    this.listTimer = window.setInterval(() => {
                        if (!this.view.room) {
                            this.refresh();
                        }
                    }, LIST_INTERVAL_MS);
                }
                this.pingTimer = window.setInterval(() => this.tick(), PING_INTERVAL_MS);
                break;
            }
            case "named":
                this.update({ name: message.name });
                this.onNamed?.(message.name);
                break;
            case "identity":
                this.update({ myCode: message.friendId, name: message.name });
                break;
            case "chat":
                this.receiveChat(message.from, message.text);
                break;
            case "inviteSent":
                if (this.view.room && typeof message.to === "string") {
                    this.update({ invited: { ...this.view.invited, [message.to]: "sent" } });
                }
                break;
            case "declined":
                if (typeof message.from?.id === "string") {
                    if (this.view.room) {
                        this.update({
                            invited: { ...this.view.invited, [message.from.id]: "declined" },
                        });
                    }
                    this.onDeclined?.(message.from);
                }
                break;
            case "rooms":
                this.update({
                    rooms: message.rooms,
                    roomsPage: message.page,
                    roomsPages: message.pages,
                    roomsTotal: message.total,
                    roomsFull: message.full === true,
                });
                break;
            case "room": {
                if (message.token) {
                    this.resume = { code: message.room.code, token: message.token };
                }
                this.memberAcks = message.memberAcks === true;
                if (
                    message.room.started ||
                    (this.pendingMe && (message.meSeq ?? 0) >= this.pendingMe.sequence)
                ) {
                    this.pendingMe = undefined;
                }
                const runOver =
                    this.view.room?.code === message.room.code &&
                    this.view.room.started &&
                    !message.room.started;
                this.update({
                    room: message.room,
                    you: message.you,
                    // Until it's confirmed or chosen again, as others' updates come
                    error: this.pendingMe?.gaveUp ? UNCONFIRMED_TEXT : undefined,
                });
                if (runOver) {
                    this.sendNameAfterRun();
                }
                break;
            }
            case "goto":
                this.enterRoom(message.code, message.ticket);
                break;
            case "gone":
                this.resume = undefined;
                this.pendingMe = undefined;
                this.update({
                    room: undefined,
                    error: GONE_TEXT[message.reason] ? tl(GONE_TEXT[message.reason]) : undefined,
                });
                // A room on its own connection closes it next, which asks
                // (outOfRoom)
                if (!this.roomSocket) {
                    this.refresh();
                }
                this.onGone?.(message.reason);
                break;
            case "error":
                this.update({
                    error: message.need ? describeMissing(message.need) : message.message,
                });
                // A listed room that's filled up or started since: off the list
                if (!this.view.room) {
                    this.refresh();
                }
                break;
            case "start":
                this.pendingMe = undefined;
                this.onStart?.(message.game);
                break;
            case "up":
                this.onUp?.(message.from, message.d);
                break;
            case "down":
                this.onDown?.(message.d);
                break;
            case "left":
                this.onLeft?.(message.id);
                break;
        }
    }

    // Asks whether there's a relay, for whether to offer co-op at all: none
    // when the server runs without one or a host doesn't run it
    async checkAvailable(): Promise<boolean> {
        let available = false;
        try {
            const response = await fetch(getStatusUrl(), {
                cache: "no-store",
                signal: AbortSignal.timeout(AVAILABLE_TIMEOUT_MS),
            });
            const status = response.ok ? await response.json() : undefined;
            available = status?.coop === true;
            this.probedFriends = available && status?.friends === true;
        } catch {
            available = false;
        }
        this.update({ available });
        return available;
    }

    // Pings, or closes the connection if this player's left it be
    private tick(): void {
        const now = Date.now();
        const late = now - this.tickAt > TICK_LATE_MS;
        this.tickAt = now;
        // Outside a run: a room's connection that's stopped answering. During
        // one keepAlive checks it, more often, and a regular ping slowed in a
        // hidden tab mustn't start its check over.
        if (now - this.keptAliveAt > KEEP_ALIVE_LATE_MS) {
            this.checkRoomSocket(late);
        }
        // Not this.entering, which a refused join (or the Node relay, which
        // sends no goto) leaves set
        if (this.view.room || this.enteringSocket) {
            // In a room's not idle: the time starts again on leaving
            this.activeAt = now;
        } else if (now - this.activeAt > LOBBY_IDLE_MS) {
            this.close();
            this.update({ error: tl(IDLE_TEXT) });
            return;
        }
        this.send({ t: "ping" });
    }

    // The open rooms again: this page of them (the one shown, by default)
    refresh(page = this.view.roomsPage): void {
        this.send({ t: "list", page: Math.max(0, page) });
    }

    // Another page, picked by the player, which is doing something here
    showPage(page: number): void {
        this.activeAt = Date.now();
        this.refresh(page);
    }

    // Asks the relay for another name
    rename(): void {
        this.activeAt = Date.now();
        this.send({ t: "rename" });
    }

    // This player's adventurer and what they bring, kept up to date
    setMe(changes: Partial<Member>): void {
        const pick = pickOf(this.me);
        this.me = { ...this.me, ...changes };
        if (this.view.room) {
            if (this.memberAcks && !this.view.room.started) {
                if (this.view.error === UNCONFIRMED_TEXT) {
                    this.update({ error: undefined });
                }
                const carried = { ...this.pendingMe?.changes };
                // A new pick un-readies the player (the relays' setMember): a
                // Ready still waiting for its confirmation doesn't go along, or
                // it would ready them on a pick the host may not have yet
                if (changes.ready === undefined && pickOf(this.me) !== pick) {
                    delete carried.ready;
                }
                this.pendingMe = {
                    sequence: ++this.meSequence,
                    changes: { ...carried, ...changes },
                    sentAt: Date.now(),
                    retried: false,
                    gaveUp: false,
                };
                this.sendPendingMe();
            } else {
                this.send({ t: "me", ...changes });
            }
        }
    }

    private sendPendingMe(): void {
        const pending = this.pendingMe;
        if (!pending || this.resuming) {
            return;
        }
        // A relay rollback can remove acknowledgement support on resume.
        // Send the latest choice once, using that relay's original protocol.
        if (!this.memberAcks) {
            this.pendingMe = undefined;
            this.send({ t: "me", ...pending.changes });
            return;
        }
        pending.sentAt = Date.now();
        this.send({ t: "me", ...pending.changes, meSeq: pending.sequence });
    }

    // friends: for friends (RoomView.friends), on a relay that has them
    create(open: boolean, mapId: string, endless: boolean, hard: boolean, friends = false): void {
        this.activeAt = Date.now();
        this.update({ error: undefined });
        const message: ClientMessage = {
            t: "create",
            open,
            // Left out unless asked for, as before friends
            ...(friends && { friends: true }),
            mapId,
            endless,
            hard,
            me: this.joinAs(),
        };
        this.entering = message;
        this.send(message);
    }

    join(code: string): void {
        const clean = parseRoomCode(code);
        if (!clean) {
            return;
        }
        this.activeAt = Date.now();
        this.update({ error: undefined });
        const message: ClientMessage = { t: "join", code: clean, me: this.joinAs() };
        this.entering = message;
        this.send(message);
    }

    private joinAs(): Partial<Member> {
        return { ...this.me, ready: false, build: __BUILD_ID__ };
    }

    leave(): void {
        this.send({ t: "leave" });
        this.resume = undefined;
        this.pendingMe = undefined;
        this.update({ room: undefined });
        if (this.resuming) {
            // Nothing to come back to
            this.stopResuming();
            this.outOfRoom();
        }
    }

    // Ready with the pick this player sees, in the one message: one sent
    // before that never got there can't leave the room starting them on an
    // older one (the relays un-ready a player whose pick changes after)
    setReady(ready: boolean): void {
        const { characterId, loadout } = this.me;
        this.setMe(
            ready
                ? {
                      ready,
                      ...(characterId !== undefined && { characterId }),
                      ...(loadout !== undefined && { loadout }),
                  }
                : { ready },
        );
    }

    // The host's
    setOpen(open: boolean): void {
        this.send({ t: "settings", open });
    }

    // The host's: open (listed), for friends, or neither (invite only). A
    // relay without friends hears only open.
    setAccess(open: boolean, friends: boolean): void {
        this.send({ t: "settings", open, ...(this.view.friends && { friends }) });
    }

    // Asks a friend into this room, on a relay with friends. The relay
    // answers inviteSent (invited marks it), or an error.
    invite(friendId: string): boolean {
        if (!this.view.friends || !this.view.room) {
            return false;
        }
        this.activeAt = Date.now();
        // A no from before is forgotten: this is a new ask
        const invited = { ...this.view.invited };
        delete invited[friendId];
        this.update({ invited, error: undefined });
        this.send({ t: "invite", to: friendId });
        return true;
    }

    // A line for the room's chat. It shows when the relay sends it back, to
    // everyone at once. False for an empty one, or no room or chat to say it in.
    sendChat(text: string): boolean {
        const line = text.trim().slice(0, MAX_CHAT_LENGTH);
        if (!line || !this.view.friends || !this.view.room) {
            return false;
        }
        this.activeAt = Date.now();
        this.send({ t: "chat", text: line });
        return true;
    }

    // A name this player picked, on a relay with friends (it answers named, or
    // an error during a run). False for one that's empty once tidied.
    setName(text: string): boolean {
        const name = cleanName(text);
        if (!name || !this.view.friends) {
            return false;
        }
        this.activeAt = Date.now();
        this.send({ t: "name", name });
        return true;
    }

    // Back in the room after a run: a name picked during it, which only friends heard (the relay
    // takes no name in a run, and GameClient.setPlayerName sends none here then), goes to the
    // room now
    private sendNameAfterRun(): void {
        const picked = this.view.friends ? this.identity?.name() : undefined;
        const me = this.view.room?.members.find((m) => m.id === this.view.you);
        if (picked && me && me.name !== picked) {
            this.send({ t: "name", name: picked });
        }
    }

    private receiveChat(from: string, text: string): void {
        const room = this.view.room;
        if (!room || typeof from !== "string" || typeof text !== "string") {
            return;
        }
        const line: ChatLine = {
            id: ++this.chatId,
            from,
            name: room.members.find((m) => m.id === from)?.name ?? "",
            text: text.slice(0, MAX_CHAT_LENGTH),
            mine: from === this.view.you,
            at: Date.now(),
        };
        this.update({ chat: [...this.view.chat, line].slice(-MAX_CHAT_LINES) });
    }

    setMap(mapId: string, endless: boolean, hard: boolean): void {
        this.send({ t: "settings", mapId, endless, hard });
    }

    kick(id: string): void {
        this.send({ t: "kick", id });
    }

    disband(): void {
        this.send({ t: "disband" });
    }

    start(game: GameStart): void {
        this.send({ t: "start", game });
    }

    // Back in the lobby after a run
    end(): void {
        this.send({ t: "end" });
    }

    sendUp(message: UpMessage): void {
        this.send({ t: "up", d: message });
    }

    sendDown(message: DownMessage): void {
        this.send({ t: "down", d: message });
    }

    clearError(): void {
        this.update({ error: undefined });
    }
}

export function makeLoadout(
    metaStats: Record<string, number>,
    unlockedItems: string[],
    armoury: Record<string, number>,
    pet?: string,
    invocations?: string[],
    trophies?: string[],
    look?: WardrobeLook,
    relics?: string[],
    cardCaps?: string,
    cardsOnly?: boolean,
): Loadout {
    // Only what's been bought, so it stays small
    const bought = Object.fromEntries(Object.entries(metaStats).filter(([, value]) => value !== 0));
    return {
        metaStats: bought,
        unlockedItems,
        armoury,
        ...(pet && { pet }),
        ...(look && { look }),
        ...(invocations && { invocations }),
        ...(trophies && trophies.length > 0 && { trophies }),
        ...(relics && relics.length > 0 && { relics }),
        ...(cardCaps !== undefined && { cardCaps }),
        ...(cardsOnly && { cardsOnly: true as const }),
    };
}

// Whether a room plays Cards only: as its host's tab says (Loadout.cardsOnly), for everyone
export function roomPlaysCardsOnly(room: RoomView | undefined): boolean {
    const host = room?.members.find((m) => m.id === room.hostId);
    return host?.loadout?.cardsOnly === true;
}
