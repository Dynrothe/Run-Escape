import { GameStore } from "../GameStore";
import { CoopLobby, LOBBY_IDLE_MS, RESUME_WINDOW_MS } from "./CoopLobby";

// A WebSocket that's open at once and keeps what's sent, for driving the
// lobby as a relay would
class FakeSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static all: FakeSocket[] = [];

    readyState = FakeSocket.CONNECTING;
    sent: { t: string; [key: string]: unknown }[] = [];
    // As every relay does; false for a connection that's died without closing
    answersPings = true;
    onopen?: () => void;
    onmessage?: ((event: { data: string }) => void) | null;
    onclose?: (() => void) | null;

    constructor(readonly url: string) {
        FakeSocket.all.push(this);
        queueMicrotask(() => {
            this.readyState = FakeSocket.OPEN;
            this.onopen?.();
        });
    }

    send(data: string): void {
        const message = JSON.parse(data);
        this.sent.push(message);
        if (message.t === "ping" && this.answersPings) {
            queueMicrotask(() => this.receive({ t: "pong" }));
        }
    }

    close(): void {
        if (this.readyState === FakeSocket.CLOSED) {
            return;
        }
        this.readyState = FakeSocket.CLOSED;
        this.onclose?.();
    }

    // What the relay says
    receive(message: object): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

const ROOM = {
    code: "ABCDEFGH",
    name: "Amber Isle",
    open: true,
    hostId: "p1",
    mapId: "lumbridge",
    endless: false,
    hard: false,
    started: false,
    members: [],
};

function makeLobby(): CoopLobby {
    const store = { set: () => {}, get: () => ({}) } as unknown as GameStore;
    return new CoopLobby(store);
}

async function connected(): Promise<{ lobby: CoopLobby; relay: FakeSocket }> {
    const lobby = makeLobby();
    const connecting = lobby.connect();
    const relay = FakeSocket.all[0];
    await Promise.resolve();
    relay.receive({ t: "welcome", id: "p1", name: "Steady Chicken" });
    await connecting;
    return { lobby, relay };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a relay that keeps each room on its own connection", () => {
    beforeEach(() => {
        FakeSocket.all = [];
        vi.stubGlobal("WebSocket", FakeSocket);
        vi.stubGlobal("window", {
            location: { href: "https://example.com/game/" },
            setInterval: () => 0,
            clearInterval: () => {},
            setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
            clearTimeout: (id: number) => clearTimeout(id),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("makes the room on the room's connection, and talks to it there", async () => {
        const { lobby, relay } = await connected();
        lobby.create(true, "lumbridge", false, true);
        expect(relay.sent.at(-1)?.t).toBe("create");

        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        const room = FakeSocket.all[1];
        expect(room.url).toBe("wss://example.com/game/coop/room/ABCDEFGH?ticket=t1");
        await flush();
        // The same create, now to the room
        expect(room.sent).toEqual([
            expect.objectContaining({ t: "create", mapId: "lumbridge", hard: true }),
        ]);

        room.receive({ t: "room", room: ROOM, you: "p1" });
        expect(lobby.room?.code).toBe("ABCDEFGH");

        // What's said in a room goes to the room; the list and pings to the lobby
        lobby.setReady(true);
        lobby.sendDown({ upTo: 1, events: [] });
        expect(room.sent.map((m) => m.t)).toEqual(["create", "me", "down"]);
        lobby.refresh();
        expect(relay.sent.at(-1)?.t).toBe("list");
    });

    it("stays in the room it's in when joining another fails", async () => {
        const { lobby, relay } = await connected();
        lobby.create(false, "lumbridge", false, false);
        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        const first = FakeSocket.all[1];
        await flush();
        first.receive({ t: "room", room: ROOM, you: "p1" });

        lobby.join("ZZZZZZZZ");
        relay.receive({ t: "goto", code: "ZZZZZZZZ", ticket: "t2" });
        const second = FakeSocket.all[2];
        await flush();
        second.receive({ t: "error", message: "That room is full." });

        expect(second.readyState).toBe(FakeSocket.CLOSED);
        expect(first.readyState).toBe(FakeSocket.OPEN);
        expect(lobby.room?.code).toBe("ABCDEFGH");
    });

    it("leaves the old room once the new one has it", async () => {
        const { lobby, relay } = await connected();
        lobby.create(false, "lumbridge", false, false);
        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        const first = FakeSocket.all[1];
        await flush();
        first.receive({ t: "room", room: ROOM, you: "p1" });

        lobby.join("HGFEDCBA");
        relay.receive({ t: "goto", code: "HGFEDCBA", ticket: "t2" });
        const second = FakeSocket.all[2];
        await flush();
        second.receive({ t: "room", room: { ...ROOM, code: "HGFEDCBA" }, you: "p1" });

        expect(first.readyState).toBe(FakeSocket.CLOSED);
        expect(lobby.room?.code).toBe("HGFEDCBA");
    });

    it("tells the game when the room's connection drops, with no way back", async () => {
        const { lobby, relay } = await connected();
        const onClosed = vi.fn();
        lobby.onClosed = onClosed;
        lobby.create(false, "lumbridge", false, false);
        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        const room = FakeSocket.all[1];
        await flush();
        room.receive({ t: "room", room: ROOM, you: "p1" });

        room.close();
        expect(lobby.room).toBeUndefined();
        expect(onClosed).toHaveBeenCalledOnce();
    });

    // In a room, with the token the relay gives to come back with
    async function inRoom() {
        const { lobby, relay } = await connected();
        const onClosed = vi.fn();
        const onResumed = vi.fn();
        lobby.onClosed = onClosed;
        lobby.onResumed = onResumed;
        lobby.create(false, "lumbridge", false, false);
        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        const room = FakeSocket.all[1];
        await flush();
        room.receive({ t: "room", room: { ...ROOM, started: true }, you: "p1", token: "secret" });
        vi.useFakeTimers();
        return { lobby, relay, room, onClosed, onResumed };
    }

    it("comes back to the room after its connection drops, and sends what waited", async () => {
        const { lobby, room, onClosed, onResumed } = await inRoom();
        room.close();
        // Still in, meanwhile, with what's said kept
        expect(lobby.room?.code).toBe("ABCDEFGH");
        lobby.sendDown({ upTo: 5, events: [] });
        await vi.advanceTimersByTimeAsync(0);
        const again = FakeSocket.all[2];
        expect(again.url).toBe("wss://example.com/game/coop/room/ABCDEFGH?resume=secret");
        again.receive({ t: "room", room: { ...ROOM, started: true }, you: "p1", token: "secret" });
        expect(again.sent).toEqual([{ t: "down", d: { upTo: 5, events: [] } }]);
        expect(onResumed).toHaveBeenCalledOnce();
        expect(onClosed).not.toHaveBeenCalled();
        // And it's the room's connection now
        lobby.sendDown({ upTo: 6, events: [] });
        expect(again.sent).toHaveLength(2);
    });

    it("keeps trying for a while, then gives the room up", async () => {
        const { lobby, room, onClosed } = await inRoom();
        room.close();
        // Every try fails
        for (let ms = 0; ms <= RESUME_WINDOW_MS + 2000; ms += 50) {
            await vi.advanceTimersByTimeAsync(50);
            const last = FakeSocket.all.at(-1)!;
            if (last !== room && last.readyState !== FakeSocket.CLOSED) {
                last.close();
            }
        }
        const tries = FakeSocket.all.length - 2;
        expect(tries).toBeGreaterThan(3);
        expect(tries).toBeLessThan(15);
        expect(lobby.room).toBeUndefined();
        expect(onClosed).toHaveBeenCalledOnce();
    });

    it("gives up at once when the room's gone", async () => {
        const { lobby, room, onClosed } = await inRoom();
        room.close();
        await vi.advanceTimersByTimeAsync(0);
        FakeSocket.all[2].receive({ t: "error", message: "The room closed while you were away." });
        expect(lobby.room).toBeUndefined();
        expect(onClosed).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(RESUME_WINDOW_MS);
        expect(FakeSocket.all).toHaveLength(3);
    });

    it("doesn't come back to a room it left", async () => {
        const { lobby, room } = await inRoom();
        lobby.leave();
        room.close();
        await vi.advanceTimersByTimeAsync(RESUME_WINDOW_MS);
        expect(FakeSocket.all).toHaveLength(2);
    });

    it("carries on in the room when the lobby's connection drops, and makes it again after", async () => {
        const { lobby, relay, room, onClosed } = await inRoom();
        relay.close();
        expect(lobby.room?.code).toBe("ABCDEFGH");
        expect(onClosed).not.toHaveBeenCalled();
        expect(room.readyState).toBe(FakeSocket.OPEN);

        room.receive({ t: "gone", reason: "disbanded" });
        room.close();
        expect(FakeSocket.all.at(-1)?.url).toBe("wss://example.com/game/coop");
        expect(FakeSocket.all).toHaveLength(3);
    });

    // A run going: the game calls keepAlive on each step, here every 20 ms
    // for ms, with the host's frames coming every 40 ms when frames is set
    async function playFor(lobby: CoopLobby, room: FakeSocket, ms: number, frames = false) {
        for (let t = 0; t < ms; t += 20) {
            await vi.advanceTimersByTimeAsync(20);
            if (frames && t % 40 === 0 && room.readyState === FakeSocket.OPEN) {
                room.receive({ t: "down", d: { upTo: t, events: [] } });
            }
            lobby.keepAlive();
        }
    }
    const pings = (socket: FakeSocket) => socket.sent.filter((m) => m.t === "ping").length;

    // Steps the run until the room's connection is made again, or for 30 seconds
    async function playUntilResumed(lobby: CoopLobby, room: FakeSocket): Promise<number> {
        let ms = 0;
        while (FakeSocket.all.length === 2 && ms < 30_000) {
            await playFor(lobby, room, 100);
            ms += 100;
        }
        return ms;
    }

    it("finds a room connection that's died without closing, mid-run, and comes back", async () => {
        const { lobby, room, onClosed, onResumed } = await inRoom();
        room.answersPings = false;
        const ms = await playUntilResumed(lobby, room);
        // Within the 20 seconds the host keeps its frames for, with time to come back
        expect(ms).toBeGreaterThan(5000);
        expect(ms).toBeLessThan(15_000);
        expect(pings(room)).toBe(1);
        expect(room.readyState).toBe(FakeSocket.CLOSED);
        const again = FakeSocket.all[2];
        expect(again.url).toBe("wss://example.com/game/coop/room/ABCDEFGH?resume=secret");
        again.receive({ t: "room", room: { ...ROOM, started: true }, you: "p1", token: "secret" });
        expect(onResumed).toHaveBeenCalledOnce();
        expect(onClosed).not.toHaveBeenCalled();
        expect(lobby.room?.code).toBe("ABCDEFGH");
        // And checks the new one from here
        await playFor(lobby, again, 30_000);
        expect(FakeSocket.all).toHaveLength(3);
    });

    it("pings a room that's sending frames only to be heard from, and keeps it", async () => {
        const { lobby, room } = await inRoom();
        room.answersPings = false;
        // A guest standing still: nothing's sent but these, every 30 seconds,
        // whatever its regular ping's slowed to
        await playFor(lobby, room, 60_000, true);
        expect(pings(room)).toBe(2);
        expect(FakeSocket.all).toHaveLength(2);
    });

    it("doesn't ping a room it's talking to", async () => {
        const { lobby, room } = await inRoom();
        for (let s = 0; s < 60; s++) {
            lobby.sendUp({ move: [1, 0] });
            await playFor(lobby, room, 1000, true);
        }
        expect(pings(room)).toBe(0);
    });

    it("pings a quiet room every few seconds, and keeps it while it answers", async () => {
        const { lobby, room } = await inRoom();
        await playFor(lobby, room, 60_000);
        expect(pings(room)).toBeGreaterThanOrEqual(10);
        expect(pings(room)).toBeLessThanOrEqual(12);
        expect(FakeSocket.all).toHaveLength(2);
    });

    it("doesn't take the connection for dead straight after the page was frozen", async () => {
        const { lobby, room } = await inRoom();
        room.answersPings = false;
        await playFor(lobby, room, 6000);
        expect(pings(room)).toBe(1);
        // Frozen (asleep, or a hidden phone) with the ping unanswered
        await vi.advanceTimersByTimeAsync(60_000);
        lobby.keepAlive();
        expect(FakeSocket.all).toHaveLength(2);
        // Back, and what came meanwhile is read
        room.answersPings = true;
        room.receive({ t: "pong" });
        await playFor(lobby, room, 30_000);
        expect(FakeSocket.all).toHaveLength(2);
    });

    // A relay that sends the list as it changes stops on a create or join,
    // until it's asked again
    const lists = (relay: FakeSocket) => relay.sent.filter((m) => m.t === "list").length;

    it("asks for the open rooms again when it can't get into a room", async () => {
        const { lobby, relay } = await connected();
        lobby.join("ABCDEFGH");
        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        const before = lists(relay);
        // Turned away without a word (a used ticket, or too slow to get in)
        FakeSocket.all[1].close();
        expect(lobby.room).toBeUndefined();
        expect(lists(relay)).toBe(before + 1);
    });

    it("asks for the open rooms again, once, on leaving a room", async () => {
        const { lobby, relay, room } = await inRoom();
        const before = lists(relay);
        lobby.leave();
        room.receive({ t: "gone", reason: "left" });
        room.close();
        expect(lists(relay)).toBe(before + 1);
    });

    it("asks for the open rooms again on leaving a room it was coming back to", async () => {
        const { lobby, relay, room } = await inRoom();
        room.close();
        const before = lists(relay);
        // The room never hears, so never says "gone"
        lobby.leave();
        expect(lobby.room).toBeUndefined();
        expect(lists(relay)).toBe(before + 1);
    });

    it("ignores a goto it didn't ask for", async () => {
        const { relay } = await connected();
        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        expect(FakeSocket.all).toHaveLength(1);
    });
});

describe("the lobby's timers", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        FakeSocket.all = [];
        vi.stubGlobal("WebSocket", FakeSocket);
        vi.stubGlobal("window", {
            location: { href: "https://example.com/game/" },
            setInterval: (f: () => void, ms: number) => setInterval(f, ms),
            clearInterval: (id: number) => clearInterval(id),
            setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
            clearTimeout: (id: number) => clearTimeout(id),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    async function welcomed(welcome: object) {
        const lobby = makeLobby();
        const connecting = lobby.connect();
        const relay = FakeSocket.all[0];
        await vi.advanceTimersByTimeAsync(0);
        relay.receive({ t: "welcome", id: "p1", name: "Steady Chicken", ...welcome });
        await connecting;
        const lists = () => relay.sent.filter((m) => m.t === "list").length;
        return { lobby, relay, lists };
    }

    it("asks for the list only of a relay that doesn't send it", async () => {
        const pushing = await welcomed({ listUpdates: true });
        await vi.advanceTimersByTimeAsync(60_000);
        expect(pushing.lists()).toBe(1);

        FakeSocket.all = [];
        const older = await welcomed({});
        await vi.advanceTimersByTimeAsync(60_000);
        expect(older.lists()).toBeGreaterThan(10);
    });

    it("lets go of a list nobody's touched, but not of a room", async () => {
        const { lobby, relay } = await welcomed({ listUpdates: true });
        await vi.advanceTimersByTimeAsync(LOBBY_IDLE_MS - 60_000);
        // Looking at another page is doing something
        lobby.showPage(1);
        await vi.advanceTimersByTimeAsync(LOBBY_IDLE_MS - 60_000);
        expect(relay.readyState).toBe(FakeSocket.OPEN);
        await vi.advanceTimersByTimeAsync(2 * 60_000);
        expect(relay.readyState).toBe(FakeSocket.CLOSED);

        // In a room for longer, then out: the time starts on leaving
        FakeSocket.all = [];
        const again = await welcomed({ listUpdates: true });
        again.lobby.create(true, "lumbridge", false, false);
        again.relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        await vi.advanceTimersByTimeAsync(0);
        FakeSocket.all[1].receive({ t: "room", room: ROOM, you: "p1" });
        await vi.advanceTimersByTimeAsync(2 * LOBBY_IDLE_MS);
        again.lobby.leave();
        await vi.advanceTimersByTimeAsync(LOBBY_IDLE_MS - 60_000);
        expect(again.relay.readyState).toBe(FakeSocket.OPEN);
        // Pinged all the while
        expect(again.relay.sent.filter((m) => m.t === "ping").length).toBeGreaterThan(40);
    });

    it("finds a room's connection that's died, outside a run too, from its 30-second pings", async () => {
        const { lobby, relay } = await welcomed({ listUpdates: true });
        lobby.create(true, "lumbridge", false, false);
        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        await vi.advanceTimersByTimeAsync(0);
        const room = FakeSocket.all[1];
        room.receive({ t: "room", room: ROOM, you: "p1", token: "secret" });
        // Answering, it's kept
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(FakeSocket.all).toHaveLength(2);
        // Not, and it's made again within a couple of pings
        room.answersPings = false;
        await vi.advanceTimersByTimeAsync(90_000);
        expect(FakeSocket.all[2]?.url).toBe(
            "wss://example.com/game/coop/room/ABCDEFGH?resume=secret",
        );
    });

    it("still lets go after a join the relay turned down", async () => {
        const { lobby, relay } = await welcomed({ listUpdates: true });
        lobby.join("ZZZZZZZZ");
        relay.receive({ t: "error", message: "There's no room ZZZZZZZZ." });
        await vi.advanceTimersByTimeAsync(LOBBY_IDLE_MS + 60_000);
        expect(relay.readyState).toBe(FakeSocket.CLOSED);
    });
});
