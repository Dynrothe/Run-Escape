// @vitest-environment jsdom
import { createSave } from "../../core/save";
import { GameStore } from "../GameStore";
import { CoopLobby } from "./CoopLobby";

class Socket {
    static OPEN = 1;
    static instances: Socket[] = [];
    readyState = 1;
    sent: any[] = [];
    onmessage?: (e: { data: string }) => void;
    onclose?: () => void;
    constructor() {
        Socket.instances.push(this);
    }
    send(data: string) {
        this.sent.push(JSON.parse(data));
    }
    close() {
        this.readyState = 3;
        this.onclose?.();
    }
    receive(message: object) {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

describe("browser relay recovery", () => {
    let lobby: CoopLobby, store: GameStore;
    const credentials = {
        protocol: 1,
        runId: "a".repeat(32),
        token: "b".repeat(64),
        windowMs: 120_000,
    };
    const room = {
        code: "ABCDEFGH",
        hostId: "p1",
        started: true,
        members: [
            { id: "p1", name: "Host" },
            { id: "p2", name: "Guest" },
        ],
    };
    const envelope = { runId: credentials.runId, epoch: "epoch" };
    async function start(capable = true) {
        const connected = lobby.connect();
        const socket = Socket.instances.at(-1)!;
        socket.receive({
            t: "welcome",
            id: "p1",
            name: "Host",
            ...(capable && { recoveryVersion: 1 }),
        });
        await connected;
        socket.receive({ t: "room", room, you: "p1" });
        socket.receive({ t: "start", game: {}, ...(capable && { recovery: credentials }) });
        return socket;
    }
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        Socket.instances = [];
        vi.stubGlobal("WebSocket", Socket);
        store = new GameStore(createSave());
        lobby = new CoopLobby(store);
    });
    afterEach(() => {
        lobby.close();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("preserves the run, authenticates again and waits for the verified resume barrier", async () => {
        const closed = vi.fn(),
            pause = vi.fn(),
            sync = vi.fn(),
            resumed = vi.fn();
        lobby.onClosed = closed;
        lobby.onRecovering = pause;
        lobby.onRecoverySync = sync;
        lobby.onRecovered = resumed;
        const original = await start();
        original.close();
        expect(store.getSnapshot().coop.recovering).toBe(true);
        expect(lobby.room?.code).toBe(room.code);
        expect(closed).not.toHaveBeenCalled();
        expect(pause).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(500);
        const fresh = Socket.instances.at(-1)!;
        fresh.receive({ t: "welcome", id: "new-id", recoveryVersion: 1 });
        expect(fresh.sent.at(-1)).toMatchObject({
            t: "resume",
            token: credentials.token,
            build: __BUILD_ID__,
        });
        fresh.receive({ t: "resumed", runId: credentials.runId, room, you: "p1" });
        fresh.receive({ t: "recovering", ...envelope, remainingMs: 120_000 });
        fresh.receive({ t: "recoverySync", ...envelope });
        expect(sync).toHaveBeenCalledOnce();
        lobby.sendDown({ upTo: 5, events: [] });
        expect(fresh.sent.some((m) => m.t === "down")).toBe(false);
        fresh.receive({ t: "recoveryDone", ...envelope, epoch: "old-epoch" });
        expect(resumed).not.toHaveBeenCalled();
        fresh.receive({ t: "recoveryDone", ...envelope });
        expect(resumed).toHaveBeenCalledOnce();
        expect(lobby.canRecover).toBe(true);
        expect(store.getSnapshot().coop.recovering).toBe(false);
        original.receive({ t: "gone", reason: "hostLeft" });
        expect(lobby.room?.code).toBe(room.code);
    });

    it("expires exactly 120 seconds after loss even with repeated reconnect attempts", async () => {
        const gone = vi.fn();
        lobby.onGone = gone;
        (await start()).close();
        await vi.advanceTimersByTimeAsync(119_999);
        expect(gone).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(gone).toHaveBeenCalledWith("recoveryFailed");
        expect(lobby.canRecover).toBe(false);
        expect(store.getSnapshot().coop.status).toBe("offline");
        const attempts = Socket.instances.length;
        await vi.advanceTimersByTimeAsync(10_000);
        expect(Socket.instances).toHaveLength(attempts);
    });

    it("keeps the legacy disconnect path and advertises recovery only to capable servers", async () => {
        const closed = vi.fn();
        lobby.onClosed = closed;
        const socket = await start(false);
        lobby.create(false, "lumbridge", false, false);
        expect(socket.sent.at(-1).me.recoveryVersion).toBeUndefined();
        socket.close();
        expect(closed).toHaveBeenCalledOnce();
        expect(lobby.canRecover).toBe(false);
        expect(store.getSnapshot().coop.recovering).toBe(false);
    });

    it("detects a silent socket without advancing the game for the full recovery window", async () => {
        const socket = await start();
        await vi.advanceTimersByTimeAsync(8000);
        expect(socket.readyState).toBe(3);
        expect(store.getSnapshot().coop.recovering).toBe(true);
    });

    it("leaves a paused run when returning from its results instead of abandoning a recoverable seat", async () => {
        const socket = await start();
        socket.receive({ t: "recovering", ...envelope, remainingMs: 120_000 });
        lobby.end();
        expect(socket.sent.at(-1)).toEqual({ t: "leave" });
        expect(lobby.room).toBeUndefined();
        expect(lobby.canRecover).toBe(false);
    });

    it("rejects a late resume even if a suspended tab has not run its deadline timer yet", async () => {
        const socket = await start(),
            resumed = vi.fn(),
            gone = vi.fn();
        lobby.onRecovered = resumed;
        lobby.onGone = gone;
        socket.receive({ t: "recovering", ...envelope, remainingMs: 120_000 });
        vi.setSystemTime(Date.now() + 120_001);
        socket.receive({ t: "recoveryDone", ...envelope });
        expect(resumed).not.toHaveBeenCalled();
        expect(gone).toHaveBeenCalledWith("recoveryFailed");
    });
});
