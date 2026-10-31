import { cleanName, isNameAllowed, playerName } from "../../../../server/names.mjs";
import { GameStore } from "../GameStore";
import {
    ClientMessage,
    DownMessage,
    GameStart,
    GoneReason,
    Loadout,
    MemberView,
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
    room?: RoomView;
    // This player's id in the room
    you?: string;
    name: string;
    // The name as it was typed isn't on the banned list (a digit for a letter
    // counts: it's checked before the digit's stripped)
    nameAllowed: boolean;
    // There's a relay to play co-op through (the game only offers it then);
    // undefined until it's been asked
    available?: boolean;
};

export const OFFLINE: CoopView = {
    status: "offline",
    rooms: [],
    roomsPage: 0,
    roomsPages: 1,
    roomsTotal: 0,
    name: "",
    nameAllowed: true,
};

// How long to wait for the relay to say it's there
const AVAILABLE_TIMEOUT_MS = 4000;

const NAME_KEY = "rune-survivors-coop-name";
const LIST_INTERVAL_MS = 5000;
const PING_INTERVAL_MS = 15_000;

const GONE_TEXT: Record<GoneReason, string> = {
    left: "",
    kicked: "The host removed you from the party.",
    disbanded: "The host disbanded the party.",
    hostLeft: "The host left, so the party's over.",
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
export const ROOM_CODE_LENGTH = 5;

// A room code from what was typed or pasted: the code, or an invite link
// with it (https://example.com/?room=ABCDE)
export function parseRoomCode(text: string): string {
    const code = /[?&]room=([A-Za-z0-9]+)/.exec(text)?.[1] ?? text;
    return code
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase()
        .slice(0, ROOM_CODE_LENGTH);
}

export function loadCoopName(): string {
    try {
        return cleanName(window.localStorage.getItem(NAME_KEY) ?? "");
    } catch (e) {
        return "";
    }
}

// The connection to the co-op relay, and the room this player is in. What
// the room's run does goes to whoever's set the on* handlers (GameClient).
export class CoopLobby {
    private socket?: WebSocket;
    private listTimer?: number;
    private pingTimer?: number;
    private view: CoopView;
    // What this player looks like to the room, sent on joining and on change
    private me: Partial<MemberView> = {};

    onStart?: (game: GameStart) => void;
    onUp?: (from: string, message: UpMessage) => void;
    onDown?: (message: DownMessage) => void;
    onLeft?: (id: string) => void;
    onGone?: (reason: GoneReason) => void;
    onClosed?: () => void;

    constructor(readonly store: GameStore) {
        const name = loadCoopName();
        this.view = { ...OFFLINE, name, nameAllowed: isNameAllowed(name) };
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
                this.stopTimers();
                this.update({
                    status: "offline",
                    room: undefined,
                    you: undefined,
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
        socket?.close();
        this.update({
            status: "offline",
            room: undefined,
            you: undefined,
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
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }

    private receive(message: ServerMessage): void {
        switch (message.t) {
            case "welcome":
                this.update({
                    status: "online",
                    you: message.id,
                    error: undefined,
                    available: true,
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
            case "rooms":
                this.update({
                    rooms: message.rooms,
                    roomsPage: message.page,
                    roomsPages: message.pages,
                    roomsTotal: message.total,
                });
                break;
            case "room":
                this.update({ room: message.room, you: message.you, error: undefined });
                break;
            case "gone":
                this.update({ room: undefined, error: GONE_TEXT[message.reason] || undefined });
                this.refresh();
                this.onGone?.(message.reason);
                break;
            case "error":
                this.update({ error: message.message });
                // A listed room that's filled up or started since: off the list
                if (!this.view.room) {
                    this.refresh();
                }
                break;
            case "start":
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

    // Kept as it can be (lowercase a-z), as it's typed
    setName(name: string): void {
        const clean = cleanName(name);
        try {
            window.localStorage.setItem(NAME_KEY, clean);
        } catch (e) {}
        const allowed = isNameAllowed(name) && isNameAllowed(clean);
        this.update({ name: clean, nameAllowed: allowed });
        if (allowed) {
            this.setMe({ name: playerName(clean) });
        }
    }

    // This player's adventurer and what they bring, kept up to date
    setMe(changes: Partial<Omit<MemberView, "id">>): void {
        this.me = { ...this.me, ...changes };
        if (this.view.room) {
            this.send({ t: "me", ...changes });
        }
    }

    create(open: boolean, mapId: string, endless: boolean): void {
        this.update({ error: undefined });
        this.send({ t: "create", open, mapId, endless, me: this.joinAs() });
    }

    join(code: string): void {
        const clean = parseRoomCode(code);
        if (!clean) {
            return;
        }
        this.update({ error: undefined });
        this.send({ t: "join", code: clean, me: this.joinAs() });
    }

    private joinAs(): Partial<MemberView> {
        return { ...this.me, name: playerName(this.view.name), ready: false };
    }

    leave(): void {
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

    setMap(mapId: string, endless: boolean): void {
        this.send({ t: "settings", mapId, endless });
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
): Loadout {
    // Only what's been bought, so it stays small
    const bought = Object.fromEntries(Object.entries(metaStats).filter(([, value]) => value !== 0));
    return { metaStats: bought, unlockedItems, armoury };
}
