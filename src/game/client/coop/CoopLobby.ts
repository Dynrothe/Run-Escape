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

const GONE_TEXT: Record<GoneReason, string> = {
    left: "",
    kicked: "The host removed you from the party.",
    disbanded: "The host disbanded the party.",
    hostLeft: "The host left, so the party's over.",
    idle: "The room closed after half an hour with nothing happening.",
    recoveryFailed: "The party couldn't reconnect safely. Your run has ended.",
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
    private socket?: WebSocket;
    private listTimer?: number;
    private pingTimer?: number;
    private view: CoopView;
    // What this player looks like to the room, sent on joining and on change
    private me: Partial<Member> = {};
    private credentials?: RecoveryCredentials;
    private recoverySupported = false;
    private epoch?: string;
    private recoveryDeadline = 0;
    private retryTimer?: number;
    private deadlineTimer?: number;
    private connectTimer?: number;
    private retryAttempt = 0;
    private lastReceived = 0;

    onStart?: (game: GameStart) => void;
    onUp?: (from: string, message: UpMessage) => void;
    onDown?: (message: DownMessage) => void;
    onLeft?: (id: string) => void;
    onGone?: (reason: GoneReason) => void;
    onClosed?: () => void;
    onRecovering?: () => void;
    onRecoverySync?: () => void;
    onRecoveryReplay?: (to: string, frame: number, target: number) => void;
    onRecoveryFrames?: (from: number, message: DownMessage) => void;
    onRecovered?: () => void;

    get canRecover(): boolean {
        return this.credentials !== undefined;
    }

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
    connect(retry = false): Promise<void> {
        if (this.retryTimer !== undefined && !retry) return Promise.resolve();
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
            return Promise.resolve();
        }
        this.update({ status: "connecting", error: undefined });
        return new Promise((resolve) => {
            let socket: WebSocket;
            try {
                socket = new WebSocket(getRelayUrl());
            } catch (e) {
                if (this.credentials) {
                    this.beginRecovery();
                    this.scheduleRetry();
                    resolve();
                    return;
                }
                this.update({ status: "offline", error: "Couldn't reach the co-op server." });
                resolve();
                return;
            }
            this.socket = socket;
            socket.onmessage = (event) => {
                if (this.socket !== socket) return;
                let message: ServerMessage;
                try {
                    message = JSON.parse(String(event.data));
                } catch {
                    return;
                }
                this.lastReceived = Date.now();
                this.receive(message);
                if (message.t === "welcome") {
                    resolve();
                }
            };
            socket.onclose = () => {
                this.lost(socket);
                resolve();
            };
            this.connectTimer = window.setTimeout(() => {
                this.lost(socket);
                resolve();
            }, 5000);
        });
    }

    private lost(socket: WebSocket): void {
        if (this.socket !== socket) return;
        this.socket = undefined;
        this.stopTimers();
        socket.close();
        if (this.credentials) {
            this.beginRecovery();
            this.update({ status: "connecting" });
            this.scheduleRetry();
        } else {
            this.update({
                status: "offline",
                room: undefined,
                you: undefined,
                name: "",
                rooms: [],
                roomsPage: 0,
                error: "Lost the connection to the co-op server.",
            });
            this.onClosed?.();
        }
    }

    private scheduleRetry(): void {
        if (!this.credentials || this.retryTimer !== undefined) return;
        if (Date.now() >= this.recoveryDeadline) {
            this.failRecovery();
            return;
        }
        const delay =
            Math.min(2000, 250 * 2 ** Math.min(this.retryAttempt++, 3)) + Math.random() * 250;
        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = undefined;
            if (Date.now() >= this.recoveryDeadline) this.failRecovery();
            else void this.connect(true);
        }, delay);
    }

    private beginRecovery(remainingMs?: number, epoch?: string): void {
        if (!this.credentials) return;
        this.recoveryDeadline ||= Date.now() + 120_000;
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
        this.epoch = undefined;
        this.recoveryDeadline = 0;
        this.retryAttempt = 0;
        window.clearTimeout(this.retryTimer);
        window.clearTimeout(this.deadlineTimer);
        this.retryTimer = this.deadlineTimer = undefined;
        this.update({ recovering: false, recoveryDeadline: undefined });
    }

    private failRecovery(): void {
        this.send({ t: "leave" });
        this.close();
        this.update({ error: "Couldn't recover the co-op connection within 120 seconds." });
        this.onGone?.("recoveryFailed");
    }

    private startTimers(): void {
        this.stopTimers();
        this.lastReceived = Date.now();
        this.listTimer = window.setInterval(() => {
            if (!this.view.room) this.refresh();
        }, LIST_INTERVAL_MS);
        // Only recoverable runs need fast liveness detection. No game-state sampling.
        this.pingTimer = window.setInterval(() => {
            if (this.credentials && Date.now() - this.lastReceived > 6000 && this.socket)
                this.lost(this.socket);
            else if (this.credentials || Date.now() - this.lastReceived >= PING_INTERVAL_MS)
                this.send({ t: "ping" });
        }, 2000);
    }

    close(): void {
        this.clearRecovery();
        const socket = this.socket;
        this.socket = undefined;
        this.stopTimers();
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
        window.clearTimeout(this.connectTimer);
        this.listTimer = this.pingTimer = undefined;
    }

    private send(message: ClientMessage): void {
        if (
            this.view.recovering &&
            !message.t.startsWith("recovery") &&
            !["ping", "resume", "leave"].includes(message.t)
        )
            return;
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }

    private receive(message: ServerMessage): void {
        switch (message.t) {
            case "welcome":
                this.startTimers();
                this.recoverySupported = message.recoveryVersion === 1;
                if (this.credentials && this.view.recovering) {
                    if (!this.recoverySupported) {
                        this.failRecovery();
                        return;
                    }
                    this.send({
                        t: "resume",
                        protocol: 1,
                        runId: this.credentials.runId,
                        token: this.credentials.token,
                        build: __BUILD_ID__,
                    });
                    return;
                }
                this.update({
                    status: "online",
                    you: message.id,
                    name: message.name,
                    error: undefined,
                    available: true,
                    anyMap: message.anyMap === true,
                });
                this.refresh();
                break;
            case "resumed":
                if (this.credentials?.runId !== message.runId || !this.view.recovering) return;
                // A departure notification may have been lost with the previous socket.
                for (const member of this.view.room?.members ?? []) {
                    if (!message.room.members.some((m) => m.id === member.id))
                        this.onLeft?.(member.id);
                }
                this.update({
                    status: "online",
                    room: message.room,
                    you: message.you,
                    name:
                        message.room.members.find((m) => m.id === message.you)?.name ??
                        this.view.name,
                });
                break;
            case "resumeRejected":
                if (this.credentials) this.failRecovery();
                break;
            case "recoveryOff":
                this.clearRecovery();
                break;
            case "recovering":
                if (this.credentials?.runId === message.runId)
                    this.beginRecovery(message.remainingMs, message.epoch);
                break;
            case "recoverySync":
                if (this.matchesRecovery(message)) this.onRecoverySync?.();
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
                this.retryAttempt = 0;
                this.epoch = undefined;
                this.update({ recovering: false, recoveryDeadline: undefined });
                this.onRecovered?.();
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
                this.update({ room: message.room, you: message.you, error: undefined });
                break;
            case "gone":
                this.clearRecovery();
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
                    message.recovery?.protocol === 1 &&
                    message.recovery.windowMs === 120_000 &&
                    /^[a-f0-9]{64}$/.test(message.recovery.token) &&
                    /^[a-f0-9]{32}$/.test(message.recovery.runId)
                ) {
                    this.credentials = message.recovery;
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
            this.send({ t: "me", ...changes });
        }
    }

    create(open: boolean, mapId: string, endless: boolean, hard: boolean): void {
        this.update({ error: undefined });
        this.send({ t: "create", open, mapId, endless, hard, me: this.joinAs() });
    }

    join(code: string): void {
        const clean = parseRoomCode(code);
        if (!clean) {
            return;
        }
        this.update({ error: undefined });
        this.send({ t: "join", code: clean, me: this.joinAs() });
    }

    private joinAs(): Partial<Member> {
        return {
            ...this.me,
            ready: false,
            build: __BUILD_ID__,
            ...(this.recoverySupported && { recoveryVersion: 1 }),
        };
    }

    leave(): void {
        this.clearRecovery();
        this.send({ t: "leave" });
        this.update({ room: undefined });
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
        this.clearRecovery();
        this.send({ t: "end" });
    }

    sendUp(message: UpMessage): void {
        this.send({ t: "up", d: message });
    }

    sendDown(message: DownMessage): void {
        this.send({ t: "down", d: message });
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
    recoveryAbort(): void {
        if (this.credentials && this.epoch)
            this.send({ t: "recoveryAbort", runId: this.credentials.runId, epoch: this.epoch });
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
