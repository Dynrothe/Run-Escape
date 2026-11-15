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
    async function inRoom(memberAcks = false) {
        const { lobby, relay } = await connected();
        const onClosed = vi.fn();
        const onResumed = vi.fn();
        lobby.onClosed = onClosed;
        lobby.onResumed = onResumed;
        lobby.create(false, "lumbridge", false, false);
        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        const room = FakeSocket.all[1];
        await flush();
        room.receive({
            t: "room",
            room: { ...ROOM, started: true },
            you: "p1",
            token: "secret",
            memberAcks,
        });
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

    it("retries a hanging resume handshake after 2.5 seconds and ignores its late response", async () => {
        const { lobby, room, onResumed } = await inRoom();
        room.close();
        await vi.advanceTimersByTimeAsync(0);
        const hanging = FakeSocket.all[2];
        await vi.advanceTimersByTimeAsync(2750);
        const again = FakeSocket.all[3];
        expect(hanging.readyState).toBe(FakeSocket.CLOSED);
        expect(again.url).toContain("resume=secret");
        hanging.receive({ t: "room", room: { ...ROOM, code: "STALE" }, you: "p1" });
        expect(lobby.room?.code).toBe("ABCDEFGH");
        expect(onResumed).not.toHaveBeenCalled();
        again.receive({ t: "room", room: { ...ROOM, started: true }, you: "p1" });
        expect(onResumed).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(RESUME_WINDOW_MS);
        expect(FakeSocket.all).toHaveLength(4);
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
        // Five seconds of quiet, then eight for the ping's answer: within the
        // 20 seconds the host keeps its frames for, with time to come back
        expect(ms).toBeGreaterThanOrEqual(13_000);
        expect(ms).toBeLessThanOrEqual(13_200);
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

    it("pings a quiet legacy room every five seconds, and keeps it while it answers", async () => {
        const { lobby, room } = await inRoom();
        await playFor(lobby, room, 60_000);
        expect(pings(room)).toBeGreaterThanOrEqual(11);
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

    it("keeps the existing ping cadence without application probes when frames stop", async () => {
        const { lobby, room } = await inRoom(true);
        await playFor(lobby, room, 60_000);
        expect(room.sent.filter((m) => m.t !== "create" && m.t !== "ping")).toHaveLength(0);
        expect(pings(room)).toBeGreaterThanOrEqual(11);
        expect(pings(room)).toBeLessThanOrEqual(12);
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

    async function selecting() {
        const { lobby, relay } = await welcomed({ listUpdates: true });
        lobby.create(true, "lumbridge", false, false);
        relay.receive({ t: "goto", code: "ABCDEFGH", ticket: "t1" });
        await vi.advanceTimersByTimeAsync(0);
        const room = FakeSocket.all[1];
        room.receive({ t: "room", room: ROOM, you: "p1", token: "secret", memberAcks: true });
        return { lobby, relay, room };
    }

    it("keeps an idle lobby at two automatic pings per minute with no application probes or retries", async () => {
        const { room } = await selecting();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(room.sent.filter((m) => m.t === "ping")).toHaveLength(2);
        expect(room.sent.filter((m) => m.t === "sync" || m.t === "me")).toHaveLength(0);
    });

    it("adds no requests when the normal room update acknowledges a selection", async () => {
        const { lobby, room } = await selecting();
        lobby.setMe({ characterId: "ranger" });
        const selection = room.sent.at(-1)!;
        await vi.advanceTimersByTimeAsync(250);
        room.receive({
            t: "room",
            room: ROOM,
            you: "p1",
            memberAcks: true,
            meSeq: selection.meSeq,
        });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(room.sent).toEqual([expect.objectContaining({ t: "create" }), selection]);
        expect(FakeSocket.all).toHaveLength(2);
    });

    it("retries the latest selection once after one second and accepts only its acknowledgement", async () => {
        const { lobby, room } = await selecting();
        lobby.setMe({ characterId: "wizard" });
        const first = room.sent.at(-1)!;
        await vi.advanceTimersByTimeAsync(500);
        lobby.setMe({ characterId: "ranger", ready: true });
        const latest = room.sent.at(-1)!;
        // The old selection's confirmation must not discard the new one.
        room.receive({ t: "room", room: ROOM, you: "p1", memberAcks: true, meSeq: first.meSeq });
        await vi.advanceTimersByTimeAsync(1000);
        expect(room.sent.filter((m) => m.t === "me").at(-1)).toEqual(latest);
        room.receive({ t: "room", room: ROOM, you: "p1", memberAcks: true, meSeq: latest.meSeq });
        const sent = room.sent.filter((m) => m.t === "me").length;
        await vi.advanceTimersByTimeAsync(10_000);
        expect(room.sent.filter((m) => m.t === "me")).toHaveLength(sent);
        expect(FakeSocket.all).toHaveLength(2);
    });

    it("retries a stuck selection once with a ping, and tells the player if the room answers", async () => {
        const { lobby, room } = await selecting();
        const updates = vi.spyOn(lobby.store, "set");
        lobby.setMe({ characterId: "wizard" });
        const selection = room.sent.at(-1)!;
        await vi.advanceTimersByTimeAsync(1000);
        // Sent again, and the connection checked with it
        expect(room.sent.filter((m) => m.t === "me")).toEqual([selection, selection]);
        expect(room.sent.at(-1)).toEqual({ t: "ping" });
        await vi.advanceTimersByTimeAsync(3000);
        // The room answers pings but not this: the player's told, and the
        // connection's kept
        expect(updates.mock.calls.at(-1)?.[0].coop?.error).toBe(
            "Couldn't confirm your selection. Please choose it again.",
        );
        expect(FakeSocket.all).toHaveLength(2);
        // Another player's update doesn't hide it
        room.receive({ t: "room", room: ROOM, you: "p1", memberAcks: true });
        expect(updates.mock.calls.at(-1)?.[0].coop?.error).toBe(
            "Couldn't confirm your selection. Please choose it again.",
        );
        await vi.advanceTimersByTimeAsync(60_000);
        expect(room.sent.filter((m) => m.t === "me")).toHaveLength(2);
        expect(FakeSocket.all).toHaveLength(2);
        // A late confirmation clears it
        room.receive({
            t: "room",
            room: ROOM,
            you: "p1",
            memberAcks: true,
            meSeq: selection.meSeq,
        });
        expect(updates.mock.calls.at(-1)?.[0].coop?.error).toBeUndefined();
        updates.mockRestore();
    });

    it("comes back on a new connection when the retry's ping goes unanswered", async () => {
        const { lobby, room } = await selecting();
        room.answersPings = false;
        lobby.setMe({ characterId: "wizard" });
        const selection = room.sent.at(-1)!;
        await vi.advanceTimersByTimeAsync(1000);
        expect(FakeSocket.all).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(8501);
        const again = FakeSocket.all[2];
        expect(again.url).toContain("resume=secret");
        again.receive({ t: "room", room: ROOM, you: "p1", memberAcks: true });
        expect(again.sent).toContainEqual(selection);
        again.receive({
            t: "room",
            room: ROOM,
            you: "p1",
            memberAcks: true,
            meSeq: selection.meSeq,
        });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(FakeSocket.all).toHaveLength(3);
    });

    it("keeps the latest selection made while reconnecting and never replays ready after start", async () => {
        const { lobby, room } = await selecting();
        lobby.setMe({ characterId: "wizard" });
        room.close();
        lobby.setMe({ characterId: "ranger", ready: true });
        await vi.advanceTimersByTimeAsync(0);
        const again = FakeSocket.all[2];
        again.receive({ t: "room", room: ROOM, you: "p1", memberAcks: true });
        expect(again.sent).toEqual([
            expect.objectContaining({ t: "me", characterId: "ranger", ready: true }),
        ]);
        again.receive({ t: "start", game: {} });
        await vi.advanceTimersByTimeAsync(5000);
        expect(again.sent.filter((m) => m.t === "me")).toHaveLength(1);
        expect(FakeSocket.all).toHaveLength(3);
    });

    it("tries a choice it gave up on again with the next one, ignoring the old confirmation", async () => {
        const { lobby, room } = await selecting();
        const updates = vi.spyOn(lobby.store, "set");
        lobby.setMe({ characterId: "wizard" });
        const original = room.sent.at(-1)!;
        await vi.advanceTimersByTimeAsync(4001);
        expect(updates.mock.calls.at(-1)?.[0].coop?.error).toBe(
            "Couldn't confirm your selection. Please choose it again.",
        );

        lobby.setReady(true);
        const latest = room.sent.at(-1)!;
        // Ready carries the pick, and what wasn't confirmed before
        expect(latest).toMatchObject({ t: "me", characterId: "wizard", ready: true });
        expect(updates.mock.calls.at(-1)?.[0].coop?.error).toBeUndefined();
        // A delayed confirmation of the older one doesn't count for this
        room.receive({
            t: "room",
            room: ROOM,
            you: "p1",
            memberAcks: true,
            meSeq: original.meSeq,
        });
        await vi.advanceTimersByTimeAsync(1000);
        expect(room.sent.filter((m) => m.t === "me").at(-1)).toEqual(latest);
        room.receive({ t: "room", room: ROOM, you: "p1", memberAcks: true, meSeq: latest.meSeq });
        const sent = room.sent.filter((m) => m.t === "me").length;
        await vi.advanceTimersByTimeAsync(10_000);
        expect(room.sent.filter((m) => m.t === "me")).toHaveLength(sent);
        expect(FakeSocket.all).toHaveLength(2);
        updates.mockRestore();
    });

    it("readies up with the adventurer and loadout it last chose", async () => {
        const { lobby, room } = await selecting();
        const loadout = { metaStats: {}, unlockedItems: [], armoury: {} };
        lobby.setMe({ characterId: "ranger", loadout });
        room.receive({
            t: "room",
            room: ROOM,
            you: "p1",
            memberAcks: true,
            meSeq: room.sent.at(-1)!.meSeq,
        });
        lobby.setReady(true);
        expect(room.sent.at(-1)).toMatchObject({
            t: "me",
            ready: true,
            characterId: "ranger",
            loadout,
        });
        room.receive({
            t: "room",
            room: ROOM,
            you: "p1",
            memberAcks: true,
            meSeq: room.sent.at(-1)!.meSeq,
        });
        lobby.setReady(false);
        expect(room.sent.at(-1)).toEqual({ t: "me", ready: false, meSeq: expect.any(Number) });
    });

    it("does not replay a selection already acknowledged by the resumed room", async () => {
        const { lobby, room } = await selecting();
        lobby.setMe({ characterId: "wizard" });
        const selection = room.sent.at(-1)!;
        room.close();
        await vi.advanceTimersByTimeAsync(0);
        const again = FakeSocket.all[2];
        again.receive({
            t: "room",
            room: ROOM,
            you: "p1",
            memberAcks: true,
            meSeq: selection.meSeq,
        });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(again.sent.filter((m) => m.t === "me")).toHaveLength(0);
        expect(FakeSocket.all).toHaveLength(3);
    });

    it("uses the legacy selection protocol if acknowledgement support disappears on resume", async () => {
        const { lobby, room } = await selecting();
        lobby.setMe({ characterId: "wizard" });
        room.close();
        await vi.advanceTimersByTimeAsync(0);
        const again = FakeSocket.all[2];
        again.receive({ t: "room", room: ROOM, you: "p1" });
        expect(again.sent).toEqual([{ t: "me", characterId: "wizard" }]);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(again.sent.filter((m) => m.t === "me")).toHaveLength(1);
        expect(FakeSocket.all).toHaveLength(3);
    });

    it("does not mistake a suspended lobby tab for a broken connection or keep retries after leaving", async () => {
        const { lobby, room } = await selecting();
        lobby.setMe({ characterId: "wizard" });
        await vi.advanceTimersByTimeAsync(1000);
        // Jump wall time without running the timers, as a suspended tab does.
        vi.setSystemTime(Date.now() + 60_000);
        await vi.advanceTimersByTimeAsync(500);
        expect(FakeSocket.all).toHaveLength(2);
        lobby.leave();
        const sent = room.sent.filter((m) => m.t === "me").length;
        await vi.advanceTimersByTimeAsync(10_000);
        expect(room.sent.filter((m) => m.t === "me")).toHaveLength(sent);
        expect(FakeSocket.all).toHaveLength(2);
    });

    it("finds a dead room connection in a hidden tab whose timers run once a minute", async () => {
        // Chrome's intensive throttling: each timer runs once a minute at most
        const intervals: (() => void)[] = [];
        vi.stubGlobal("window", {
            location: { href: "https://example.com/game/" },
            setInterval: (f: () => void) => intervals.push(f),
            clearInterval: (id: number | undefined) => {
                if (id) {
                    intervals[id - 1] = () => {};
                }
            },
            setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
            clearTimeout: (id: number) => clearTimeout(id),
        });
        const { room } = await selecting();
        room.answersPings = false;
        for (let minute = 0; minute < 3 && FakeSocket.all.length === 2; minute++) {
            vi.setSystemTime(Date.now() + 60_000);
            // The room's check has been due longest, so it runs first, then
            // the regular ping
            for (const run of [...intervals].reverse()) {
                run();
            }
            await vi.advanceTimersByTimeAsync(0);
        }
        expect(FakeSocket.all).toHaveLength(3);
        expect(FakeSocket.all[2].url).toContain("resume=secret");
    });

    it("doesn't carry an unconfirmed Ready over to a new pick", async () => {
        const { lobby, room } = await selecting();
        const loadout = { metaStats: {}, unlockedItems: [], armoury: {} };
        lobby.setMe({ characterId: "wizard", loadout });
        lobby.setReady(true);
        // The same pick again (as on a map change) keeps it
        lobby.setMe({ loadout: { ...loadout } });
        expect(room.sent.at(-1)).toMatchObject({ t: "me", ready: true, characterId: "wizard" });
        // Another, before the Ready's confirmed, goes without it: the relays
        // un-ready a player whose pick changes, so the host, which may still
        // see them ready on wizard, can't start them on it
        lobby.setMe({ characterId: "ranger", loadout });
        expect(room.sent.at(-1)).toEqual({
            t: "me",
            characterId: "ranger",
            loadout,
            meSeq: expect.any(Number),
        });
    });

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
