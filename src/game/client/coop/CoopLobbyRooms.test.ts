import { GameStore } from "../GameStore";
import { CoopLobby, RESUME_WINDOW_MS } from "./CoopLobby";

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
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: () => void;

    constructor(readonly url: string) {
        FakeSocket.all.push(this);
        queueMicrotask(() => {
            this.readyState = FakeSocket.OPEN;
            this.onopen?.();
        });
    }

    send(data: string): void {
        this.sent.push(JSON.parse(data));
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

    const recovery = {
        protocol: 1,
        runId: "a".repeat(32),
        token: "b".repeat(32),
        windowMs: 60_000,
    };
    async function recoverable() {
        const party = await inRoom();
        party.room.receive({ t: "start", game: {}, recovery });
        party.room.receive({
            t: "room",
            room: { ...ROOM, started: true },
            you: "p1",
            token: recovery.token,
        });
        return party;
    }

    it("pauses a capable run and waits for the matching barrier after its room reconnects", async () => {
        const { lobby, room, onResumed, onClosed } = await recoverable();
        const pause = vi.fn(),
            sync = vi.fn(),
            done = vi.fn();
        lobby.onRecovering = pause;
        lobby.onRecoverySync = sync;
        lobby.onRecovered = done;
        room.close();
        expect(pause).toHaveBeenCalledOnce();
        for (let i = 0; i < 500; i++) lobby.sendDown({ upTo: i, events: [] });
        await vi.advanceTimersByTimeAsync(0);
        const again = FakeSocket.all.at(-1)!;
        const url = new URL(again.url);
        expect(url.searchParams.get("resume")).toBe(recovery.token);
        expect(url.searchParams.get("runId")).toBe(recovery.runId);
        expect(url.searchParams.get("build")).toBe(__BUILD_ID__);
        expect(url.searchParams.get("protocol")).toBe("1");
        again.receive({
            t: "room",
            room: { ...ROOM, started: true },
            you: "p1",
            token: recovery.token,
        });
        expect(again.sent).toEqual([]);
        expect(onResumed).not.toHaveBeenCalled();
        const envelope = { runId: recovery.runId, epoch: "new-epoch" };
        again.receive({ t: "recovering", ...envelope, remainingMs: 55_000 });
        again.receive({ t: "recoverySync", ...envelope });
        expect(sync).toHaveBeenCalledOnce();
        again.receive({ t: "recoveryDone", ...envelope, epoch: "old-epoch" });
        expect(done).not.toHaveBeenCalled();
        lobby.sendDown({ upTo: 500, events: [] });
        expect(again.sent).toEqual([]);
        again.receive({ t: "recoveryDone", ...envelope });
        expect(done).toHaveBeenCalledOnce();
        lobby.sendDown({ upTo: 501, events: [] });
        expect(again.sent.at(-1)?.t).toBe("down");
        expect(onClosed).not.toHaveBeenCalled();
        lobby.close();
    });

    it("does not extend the 60 second deadline when another attempt or epoch arrives", async () => {
        const { lobby, room, onClosed } = await recoverable();
        const gone = vi.fn();
        lobby.onGone = gone;
        room.close();
        await vi.advanceTimersByTimeAsync(45_000);
        const again = FakeSocket.all.at(-1)!;
        again.receive({
            t: "room",
            room: { ...ROOM, started: true },
            you: "p1",
            token: recovery.token,
        });
        again.receive({
            t: "recovering",
            runId: recovery.runId,
            epoch: "restart-again",
            remainingMs: 60_000,
        });
        await vi.advanceTimersByTimeAsync(14_999);
        expect(gone).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(gone).toHaveBeenCalledExactlyOnceWith("recoveryFailed");
        expect(onClosed).not.toHaveBeenCalled();
        expect(lobby.room).toBeUndefined();
        lobby.close();
    });

    it("ends a capable run safely when its identity is rejected or its run ended during the outage", async () => {
        for (const reply of [
            { t: "error", message: "The room closed while you were away." },
            { t: "room", room: ROOM, you: "p1", token: recovery.token },
        ]) {
            // Each scenario starts with a fresh lobby connection.
            vi.useRealTimers();
            FakeSocket.all = [];
            const { lobby, room, onClosed } = await recoverable();
            const gone = vi.fn();
            lobby.onGone = gone;
            room.close();
            await vi.advanceTimersByTimeAsync(0);
            FakeSocket.all.at(-1)!.receive(reply);
            expect(gone).toHaveBeenCalledExactlyOnceWith("recoveryFailed");
            expect(onClosed).not.toHaveBeenCalled();
            expect(lobby.room).toBeUndefined();
            lobby.close();
        }
    });

    it("reconciles departures missed while the host was disconnected", async () => {
        const { lobby, room } = await inRoom();
        const view = { ...ROOM, started: true, members: [{ id: "p1" }, { id: "p2" }] };
        room.receive({ t: "room", room: view, you: "p1", token: "secret" });
        const left = vi.fn();
        lobby.onLeft = left;
        room.close();
        await vi.advanceTimersByTimeAsync(0);
        FakeSocket.all.at(-1)!.receive({
            t: "room",
            room: { ...view, members: [{ id: "p1" }] },
            you: "p1",
            token: "secret",
        });
        expect(left).toHaveBeenCalledExactlyOnceWith("p2");
        lobby.close();
    });

    it("paces a legacy backlog instead of sending over 400 packets in one second", async () => {
        const { lobby, room } = await inRoom();
        room.close();
        await vi.advanceTimersByTimeAsync(0);
        for (let i = 0; i < 500; i++) lobby.sendDown({ from: i, upTo: i + 1, events: [] });
        const again = FakeSocket.all.at(-1)!;
        again.receive({ t: "room", room: { ...ROOM, started: true }, you: "p1", token: "secret" });
        expect(again.sent).toHaveLength(16);
        lobby.sendDown({ from: 500, upTo: 501, events: [] });
        await vi.advanceTimersByTimeAsync(1000);
        expect(again.sent.length).toBeLessThan(200);
        await vi.advanceTimersByTimeAsync(2500);
        expect(again.sent).toHaveLength(501);
        expect(again.sent.map((m) => (m.d as { upTo: number }).upTo)).toEqual(
            Array.from({ length: 501 }, (_, i) => i + 1),
        );
        lobby.close();
    });

    it("detects a silent room connection without relying on the lobby's pongs", async () => {
        const { lobby, relay, room } = await inRoom();
        // Install the watchdog timers after the fake clock; lobby timers stay stubbed.
        vi.stubGlobal("window", {
            location: { href: "https://example.com/game/" },
            setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
            clearTimeout: (id: number) => clearTimeout(id),
            setInterval: (f: () => void, ms: number) => setInterval(f, ms),
            clearInterval: (id: number) => clearInterval(id),
        });
        room.receive({ t: "start", game: {}, recovery });
        const pause = vi.fn();
        lobby.onRecovering = pause;
        for (let i = 0; i < 3; i++) {
            relay.receive({ t: "pong" });
            await vi.advanceTimersByTimeAsync(2000);
        }
        expect(room.readyState).toBe(FakeSocket.CLOSED);
        expect(pause).toHaveBeenCalledOnce();
        lobby.close();
    });

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

    it("ignores a goto it didn't ask for", async () => {
        const { relay } = await connected();
        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        expect(FakeSocket.all).toHaveLength(1);
    });
});
