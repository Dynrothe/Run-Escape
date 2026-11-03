import { MAP_BY_ID } from "../../content/maps";
import { GameStore } from "../GameStore";
import {
    ClientMessage,
    DownMessage,
    GameStart,
    GoneReason,
    Loadout,
    Member,
    MissingMap,
    RecoveryCredentials,
    RoomListing,
    RoomView,
    ServerMessage,
    UpMessage,
} from "./protocol";

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
    // There's a relay to play co-op through (the game only offers it then);
    // undefined until it's been asked
    available?: boolean;
    // The relay lets players into rooms on maps they haven't unlocked
    anyMap: boolean;
    recovering?: boolean;
    recoveryDeadline?: number;
};

export const OFFLINE: CoopView = {
    status: "offline",
    rooms: [],
    roomsPage: 0,
    roomsPages: 1,
    roomsTotal: 0,
    roomsFull: false,
    name: "",
    anyMap: false,
};

// How long to wait for the relay to say it's there
const AVAILABLE_TIMEOUT_MS = 4000;

const LIST_INTERVAL_MS = 5000;
const PING_INTERVAL_MS = 15_000;

// A room's connection that drops (a network blip, or the relay restarting)
// is tried again for this long before the room's given up on. The relay
// holds the player's place a little longer (RESUME_GRACE_MS in
// server/cloudflare/src/room.mjs).
export const RESUME_WINDOW_MS = 10_000;
// Waits between tries, the last repeating
const RESUME_DELAYS_MS = [0, 250, 500, 1000, 2000];
// What's said in the room meanwhile waits, up to this many messages
const MAX_WAITING_MESSAGES = 2000;

const GONE_TEXT: Record<GoneReason, string> = {
    recoveryFailed: "The party couldn't reconnect safely. Your run has ended.",
    left: "",
    kicked: "The host removed you from the party.",
    disbanded: "The host disbanded the party.",
    hostLeft: "The host left, so the party's over.",
    idle: "The room closed after half an hour with nothing happening.",
};

// Where the relay is: VITE_COOP_URL when the build gives one, otherwise
// coop beside the page (the dev server's, or one a host puts there)
function getRelayUrl(): string {
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
const ROOM_MESSAGES: ReadonlySet<ClientMessage["t"]> = new Set([
    "leave",
    "me",
    "rename",
    "settings",
    "kick",
    "disband",
    "start",
    "end",
    "up",
    "down",
    "recoveryRequest",
    "recoveryState",
    "recoveryFrames",
    "recoveryAck",
    "recoveryAbort",
]);

// The relay's address over plain HTTP, which answers whether it's there
function getStatusUrl(): string {
    const url = new URL(getRelayUrl());
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    return url.toString();
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
    const what =
        `${map?.name ?? need.mapId}` +
        `${need.hard ? " hard" : ""}${need.endless ? " endless" : ""}`;
    return need.who
        ? `${need.who} hasn't got ${what} unlocked.`
        : `You need ${what} unlocked to join this room.`;
}

// The connection to the co-op relay, and the room this player is in. What
// the room's run does goes to whoever's set the on* handlers (GameClient).
export class CoopLobby {
    private credentials?: RecoveryCredentials;
    private completedState?: { frame: number; hash: number };
    private recoveryMePending = false;
    private epoch?: string;
    private recoveryDeadline = 0;
    private deadlineTimer?: number;
    private healthTimer?: number;
    private lastRoomMessage = 0;
    private backlog: string[] = [];
    private backlogTimer?: number;
    private backlogBytes = 0;
    private backlogAt = 0;
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
    private view: CoopView;
    // What this player looks like to the room, sent on joining and on change
    private me: Partial<Member> = {};

    onRecovering?: () => void;
    onRecoverySync?: () => void;
    onRecoveryReplay?: (to: string, frame: number, target: number) => void;
    onRecoveryFrames?: (from: number, message: DownMessage) => void;
    onRecovered?: () => void;

    get canRecover(): boolean {
        return !!this.credentials;
    }

    onStart?: (game: GameStart) => void;
    onUp?: (from: string, message: UpMessage) => void;
    onDown?: (message: DownMessage) => void;
    onLeft?: (id: string) => void;
    onGone?: (reason: GoneReason) => void;
    onClosed?: () => void;
    onReconnecting?: () => void;
    onResumed?: () => void;

    constructor(readonly store: GameStore) {
        this.view = OFFLINE;
    }

    get room(): RoomView | undefined {
        return this.view.room;
    }

    get id(): string | undefined {
        return this.view.you;
    }

    get isHost(): boolean {
        return this.view.room !== undefined && this.view.room.hostId === this.view.you;
    }

    get name(): string {
        return this.view.name;
    }

    private update(changes: Partial<CoopView>): void {
        this.view = { ...this.view, ...changes };
        this.store.set({ coop: this.view });
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
                this.update({ status: "offline", error: "Couldn't reach the co-op server." });
                resolve();
                return;
            }
            this.socket = socket;
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
                    rooms: [],
                    roomsPage: 0,
                    error: wasOnline
                        ? "Lost the connection to the co-op server."
                        : "Couldn't reach the co-op server.",
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
        this.update({
            status: "offline",
            room: undefined,
            you: undefined,
            name: "",
            rooms: [],
            roomsPage: 0,
        });
    }

    private stopTimers(): void {
        window.clearInterval(this.listTimer);
        window.clearInterval(this.pingTimer);
        this.listTimer = this.pingTimer = undefined;
    }

    private send(message: ClientMessage, serialized?: string): void {
        if (
            this.view.recovering &&
            !message.t.startsWith("recovery") &&
            !["ping", "leave"].includes(message.t)
        )
            return;
        if (this.backlog.length && ROOM_MESSAGES.has(message.t) && message.t !== "leave") {
            if (this.backlog.length >= MAX_WAITING_MESSAGES)
                this.roomLost("The room connection fell too far behind.");
            else this.backlog.push(serialized ?? JSON.stringify(message));
            return;
        }
        if (this.resuming && ROOM_MESSAGES.has(message.t)) {
            if (this.credentials) return;
            if (this.resuming.waiting.length < MAX_WAITING_MESSAGES) {
                this.resuming.waiting.push(serialized ?? JSON.stringify(message));
            }
            return;
        }
        const socket =
            this.roomSocket && ROOM_MESSAGES.has(message.t) ? this.roomSocket : this.socket;
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(serialized ?? JSON.stringify(message));
        }
        if (message.t === "ping" && this.roomSocket?.readyState === WebSocket.OPEN) {
            this.roomSocket.send(serialized ?? JSON.stringify(message));
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
            this.update({ error: "Couldn't reach that room." });
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
                this.update({ error: "Couldn't reach that room." });
            }
        };
    }

    // The room's connection, once it's in
    private useRoomSocket(socket: WebSocket): void {
        this.roomSocket = socket;
        this.lastRoomMessage = Date.now();
        socket.onmessage = (event) => {
            if (socket !== this.roomSocket) {
                return;
            }
            this.lastRoomMessage = Date.now();
            let received: ServerMessage;
            try {
                received = JSON.parse(String(event.data));
            } catch {
                return;
            }
            this.receive(received);
        };
        socket.onclose = () => {
            if (socket !== this.roomSocket) {
                return;
            }
            this.roomSocket = undefined;
            // Closed by the room after a "gone" (which said why), or lost
            if (!this.view.room) {
                this.outOfRoom();
            } else if (this.resume) {
                this.startResuming();
            } else {
                this.roomLost("Lost the connection to the room.");
            }
        };
    }

    private startResuming(): void {
        if (this.resuming) return;
        const waiting = this.backlog;
        this.backlog = [];
        window.clearTimeout(this.backlogTimer);
        this.resuming = { since: Date.now(), tries: 0, waiting };
        if (this.credentials) this.beginRecovery();
        else this.onReconnecting?.();
        this.tryResuming();
    }

    private tryResuming(): void {
        const resuming = this.resuming;
        const resume = this.resume;
        if (!resuming || !resume) {
            return;
        }
        const deadline = this.credentials
            ? this.recoveryDeadline
            : resuming.since + RESUME_WINDOW_MS;
        if (Date.now() >= deadline) {
            this.roomLost("Lost the connection to the room.");
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
                const url = new URL(getRoomUrl(resume.code, resume.token, "resume"));
                if (this.credentials) {
                    url.searchParams.set("runId", this.credentials.runId);
                    url.searchParams.set("protocol", "1");
                    url.searchParams.set("build", __BUILD_ID__);
                }
                socket = new WebSocket(url.toString());
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
                Math.min(4000, Math.max(0, deadline - Date.now())) + 1,
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
                    this.receive(received);
                    if (this.roomSocket !== socket || !this.view.room) return;
                    if (!this.credentials) {
                        this.backlog = resuming.waiting;
                        this.backlogBytes = 128 * 1024;
                        this.backlogAt = Date.now();
                        this.drainBacklog();
                        this.onResumed?.();
                    }
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

    private beginRecovery(remainingMs?: number, epoch?: string): void {
        if (!this.credentials) return;
        this.recoveryDeadline ||= Date.now() + this.credentials.windowMs;
        // The VM and browser clocks need not agree.
        if (remainingMs !== undefined && Number.isFinite(remainingMs))
            this.recoveryDeadline = Math.min(
                this.recoveryDeadline,
                Date.now() + Math.max(0, remainingMs),
            );
        this.epoch = epoch;
        window.clearTimeout(this.deadlineTimer);
        this.deadlineTimer = window.setTimeout(
            () => this.failRecovery(),
            Math.max(0, this.recoveryDeadline - Date.now()),
        );
        this.update({
            recovering: true,
            recoveryDeadline: this.recoveryDeadline,
            error: undefined,
        });
        this.onRecovering?.();
    }

    private clearRecovery(): void {
        this.credentials = undefined;
        this.completedState = undefined;
        this.recoveryMePending = false;
        this.epoch = undefined;
        this.recoveryDeadline = 0;
        window.clearTimeout(this.deadlineTimer);
        window.clearInterval(this.healthTimer);
        this.update({ recovering: false, recoveryDeadline: undefined });
    }

    private failRecovery(): void {
        this.send({ t: "leave" });
        this.closeRoomSockets();
        this.update({ room: undefined, error: GONE_TEXT.recoveryFailed });
        this.refresh();
        this.onGone?.("recoveryFailed");
        this.outOfRoom();
    }

    // Older runs still queue messages. Pace their backlog below the room's
    // frame/byte limits, preserving order while new messages arrive.
    private drainBacklog(): void {
        const socket = this.roomSocket;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const now = Date.now();
        this.backlogBytes = Math.min(
            256 * 1024,
            this.backlogBytes + ((now - this.backlogAt) * 128 * 1024) / 1000,
        );
        this.backlogAt = now;
        for (let i = 0; i < 16 && this.backlog.length; i++) {
            const text = this.backlog[0];
            if (text.length > this.backlogBytes) break;
            this.backlogBytes -= text.length;
            this.backlog.shift();
            socket.send(text);
        }
        if (this.backlog.length)
            this.backlogTimer = window.setTimeout(() => this.drainBacklog(), 100);
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
        if (this.credentials) {
            this.failRecovery();
            return;
        }
        this.stopResuming();
        this.resume = undefined;
        this.update({ room: undefined, error });
        this.refresh();
        this.onClosed?.();
        this.outOfRoom();
    }

    // Out of a room: the lobby's connection again, if it dropped meanwhile
    private outOfRoom(): void {
        if (this.lobbyLost) {
            this.lobbyLost = false;
            void this.connect();
        }
    }

    private closeRoomSockets(): void {
        this.clearRecovery();
        window.clearTimeout(this.backlogTimer);
        this.backlog = [];
        this.stopResuming();
        this.resume = undefined;
        const sockets = [this.roomSocket, this.enteringSocket];
        this.roomSocket = this.enteringSocket = undefined;
        this.entering = undefined;
        for (const socket of sockets) {
            socket?.close();
        }
    }

    private receive(message: ServerMessage): void {
        switch (message.t) {
            case "recovering":
                if (this.credentials?.runId === message.runId)
                    this.beginRecovery(message.remainingMs, message.epoch);
                break;
            case "recoverySync":
                if (this.matchesRecovery(message)) {
                    if (this.completedState)
                        this.recoveryState(this.completedState.frame, this.completedState.hash);
                    else this.onRecoverySync?.();
                }
                break;
            case "recoveryReplay":
                if (this.matchesRecovery(message))
                    this.onRecoveryReplay?.(message.to, message.frame, message.target);
                break;
            case "recoveryFrames":
                if (this.matchesRecovery(message)) this.onRecoveryFrames?.(message.from, message.d);
                break;
            case "recoveryDone":
                if (!this.matchesRecovery(message)) return;
                window.clearTimeout(this.deadlineTimer);
                this.recoveryDeadline = 0;
                this.epoch = undefined;
                this.update({ recovering: false, recoveryDeadline: undefined });
                this.onRecovered?.();
                if (this.recoveryMePending) {
                    this.recoveryMePending = false;
                    this.send({ t: "me", ...this.me });
                }
                break;

            case "welcome":
                this.stopTimers();
                this.update({
                    status: "online",
                    you: message.id,
                    name: message.name,
                    error: undefined,
                    available: true,
                    anyMap: message.anyMap === true,
                });
                this.refresh();
                this.listTimer = window.setInterval(() => {
                    if (!this.view.room) {
                        this.refresh();
                    }
                }, LIST_INTERVAL_MS);
                this.pingTimer = window.setInterval(
                    () => this.send({ t: "ping" }),
                    PING_INTERVAL_MS,
                );
                break;
            case "named":
                this.update({ name: message.name });
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
            case "room":
                if (this.view.room?.started && message.room.started) {
                    for (const member of this.view.room.members)
                        if (!message.room.members.some((m) => m.id === member.id))
                            this.onLeft?.(member.id);
                }
                if (this.credentials && !message.room.started) {
                    if (this.view.recovering) {
                        this.failRecovery();
                        return;
                    }
                    this.clearRecovery();
                }
                if (message.token) {
                    this.resume = { code: message.room.code, token: message.token };
                }
                this.update({ room: message.room, you: message.you, error: undefined });
                break;
            case "goto":
                this.enterRoom(message.code, message.ticket);
                break;
            case "gone":
                this.clearRecovery();
                this.resume = undefined;
                this.update({ room: undefined, error: GONE_TEXT[message.reason] || undefined });
                this.refresh();
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
                this.clearRecovery();
                if (
                    this.roomSocket &&
                    message.recovery?.protocol === 1 &&
                    Number.isSafeInteger(message.recovery.windowMs) &&
                    message.recovery.windowMs >= 1000 &&
                    message.recovery.windowMs <= 120_000 &&
                    /^[a-f0-9]{32}$/.test(message.recovery.token) &&
                    /^[a-f0-9]{32}$/.test(message.recovery.runId)
                ) {
                    this.credentials = message.recovery;
                    this.healthTimer = window.setInterval(() => {
                        const socket = this.roomSocket;
                        if (socket && Date.now() - this.lastRoomMessage >= 6000) {
                            this.roomSocket = undefined;
                            socket.close();
                            this.startResuming();
                        } else if (socket?.readyState === WebSocket.OPEN)
                            socket.send(JSON.stringify({ t: "ping" }));
                    }, 2000);
                }
                if (message.recovery && !this.credentials) {
                    this.failRecovery();
                    this.update({
                        error: "This server uses an unsupported reconnect protocol. Reload before joining again.",
                    });
                    return;
                }
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
        } catch {
            available = false;
        }
        this.update({ available });
        return available;
    }

    // The open rooms again: this page of them (the one shown, by default)
    refresh(page = this.view.roomsPage): void {
        this.send({ t: "list", page: Math.max(0, page) });
    }

    // Asks the relay for another name
    rename(): void {
        this.send({ t: "rename" });
    }

    // This player's adventurer and what they bring, kept up to date
    setMe(changes: Partial<Member>): void {
        this.me = { ...this.me, ...changes };
        if (this.view.room) {
            if (this.view.recovering) this.recoveryMePending = true;
            else this.send({ t: "me", ...changes });
        }
    }

    create(open: boolean, mapId: string, endless: boolean, hard: boolean): void {
        this.update({ error: undefined });
        const message: ClientMessage = {
            t: "create",
            open,
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
        this.update({ error: undefined });
        const message: ClientMessage = { t: "join", code: clean, me: this.joinAs() };
        this.entering = message;
        this.send(message);
    }

    private joinAs(): Partial<Member> {
        return { ...this.me, ready: false, build: __BUILD_ID__, recoveryVersion: 1 };
    }

    leave(): void {
        this.send({ t: "leave" });
        this.clearRecovery();
        this.backlog = [];
        window.clearTimeout(this.backlogTimer);
        this.resume = undefined;
        this.update({ room: undefined });
        if (this.resuming) {
            // Nothing to come back to
            this.stopResuming();
            this.outOfRoom();
        }
    }

    setReady(ready: boolean): void {
        this.setMe({ ready });
    }

    // The host's
    setOpen(open: boolean): void {
        this.send({ t: "settings", open });
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
        if (this.view.recovering) {
            this.leave();
            return;
        }
        this.send({ t: "end" });
        this.clearRecovery();
    }

    sendUp(message: UpMessage): void {
        this.send({ t: "up", d: message });
    }

    sendDown(message: DownMessage, serialized?: string): void {
        this.send(
            { t: "down", d: message },
            serialized === undefined ? undefined : `{ "t": "down", "d": ${serialized} }`,
        );
    }

    private matchesRecovery(message: { runId: string; epoch: string }): boolean {
        if (this.credentials && this.view.recovering && Date.now() >= this.recoveryDeadline) {
            this.failRecovery();
            return false;
        }
        return (
            this.view.recovering === true &&
            message.runId === this.credentials?.runId &&
            message.epoch === this.epoch
        );
    }

    recoveryState(frame: number, hash: number): void {
        if (this.credentials && this.epoch)
            this.send({
                t: "recoveryState",
                runId: this.credentials.runId,
                epoch: this.epoch,
                frame,
                hash,
            });
    }
    recoveryFrames(to: string, from: number, d: DownMessage): void {
        if (this.credentials && this.epoch)
            this.send({
                t: "recoveryFrames",
                runId: this.credentials.runId,
                epoch: this.epoch,
                to,
                from,
                d,
            });
    }
    recoveryAck(frame: number, hash: number): void {
        if (this.credentials && this.epoch)
            this.send({
                t: "recoveryAck",
                runId: this.credentials.runId,
                epoch: this.epoch,
                frame,
                hash,
            });
    }
    recoveryAbort(to?: string): void {
        if (this.credentials && this.epoch)
            this.send({
                t: "recoveryAbort",
                runId: this.credentials.runId,
                epoch: this.epoch,
                ...(to && { to }),
            });
    }

    completedRun(frame: number, hash: number): void {
        if (this.credentials) this.completedState = { frame, hash };
    }

    recoveryRequest(frame: number, from: number, upTo: number): void {
        if (!this.credentials || this.view.recovering) return;
        this.send({ t: "recoveryRequest", runId: this.credentials.runId, frame, from, upTo });
        this.beginRecovery();
    }

    clearError(): void {
        this.update({ error: undefined });
    }
}

export function makeLoadout(
    metaStats: Record<string, number>,
    unlockedItems: string[],
    armoury: Record<string, number>,
): Loadout {
    // Only what's been bought, so it stays small
    const bought = Object.fromEntries(Object.entries(metaStats).filter(([, value]) => value !== 0));
    return { metaStats: bought, unlockedItems, armoury };
}
