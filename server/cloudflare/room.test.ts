import { Room } from "./src/room.mjs";

// What the room says and saves, in order, as Cloudflare would see it
let log: string[];
let saved: any;
let writes: number;
// What the room's told the lobby, newest last
let listings: any[];
let gone: string[];
// The connections Cloudflare holds open, through the room being out of memory
let sockets: Socket[];
// When the room's alarm goes off
let alarmAt: number | undefined;
// How many of the next setAlarm calls fail
let alarmFails: number;

// A hibernatable connection, as the room sees one
class Socket {
    sent: any[] = [];
    // The codes the room's closed it with
    closes: number[] = [];
    // Listed by getWebSockets: still so once the room's closed it, until
    // the other end answers (playerCloses), which a dead one never does
    connected = true;
    private attachment: any;
    constructor(private readonly who: string) {}
    serializeAttachment(value: unknown) {
        this.attachment = structuredClone(value);
    }
    deserializeAttachment() {
        return structuredClone(this.attachment);
    }
    send(text: string) {
        const message = JSON.parse(text);
        this.sent.push(message);
        log.push(`${this.who} ${message.t}`);
    }
    close(code: number) {
        this.closes.push(code);
    }
}

const env = {
    MULTIPLAYER_ANY_MAP: "on",
    LOBBY: {
        idFromName: (name: string) => name,
        get: () => ({
            roomUpdate: async (listing: any) => {
                listings.push(listing);
            },
            roomGone: async (code: string) => {
                gone.push(code);
            },
        }),
    },
};

// The room, made again from storage and the open connections: after a
// restart (with none), or after it was out of memory
async function loadRoom(): Promise<any> {
    let ready: Promise<unknown> = Promise.resolve();
    const ctx = {
        storage: {
            get: async () => structuredClone(saved),
            put: async (_key: string, value: unknown) => {
                writes++;
                log.push("save");
                saved = structuredClone(value);
            },
            setAlarm: async (at: number) => {
                if (alarmFails > 0) {
                    alarmFails--;
                    throw new Error("storage");
                }
                alarmAt = at;
            },
            deleteAll: async () => {
                saved = undefined;
            },
        },
        acceptWebSocket: (socket: Socket) => sockets.push(socket),
        getWebSockets: () => sockets.filter((socket) => socket.connected),
        setWebSocketAutoResponse: () => {},
        blockConcurrencyWhile: (load: () => Promise<unknown>) => (ready = ready.then(load)),
    };
    const room = new Room(ctx, env);
    await ready;
    return room;
}

// Time passing, with the room's alarm going off when it's due
async function wait(room: any, ms: number) {
    const until = Date.now() + ms;
    while (alarmAt !== undefined && alarmAt <= until) {
        vi.setSystemTime(Math.max(Date.now(), alarmAt));
        alarmAt = undefined;
        await room.alarm();
    }
    vi.setSystemTime(until);
}

function enter(room: any, id: string, kind: "create" | "join") {
    const member = room.newMember({
        id,
        name: id,
        kind,
        address: id,
        roomName: "Room",
        at: Date.now(),
    });
    const socket = new Socket(id);
    sockets.push(socket);
    room.attach(member, socket);
    return member;
}

function say(room: any, member: any, message: object) {
    return room.webSocketMessage(member.socket, JSON.stringify(message));
}

// The player's game closing its connection
function playerCloses(room: any, socket: Socket, code: number) {
    socket.connected = false;
    return room.webSocketClose(socket, code);
}

// A player's game coming back on a new connection
function resume(room: any, token: string, socket: Socket) {
    vi.stubGlobal(
        "WebSocketPair",
        class {
            0 = new Socket("game");
            1 = socket;
        },
    );
    vi.stubGlobal("Response", class {});
    room.resume(token);
}

// Cloudflare restarting it, which drops every connection
function restart() {
    for (const socket of sockets) {
        socket.connected = false;
    }
    return loadRoom();
}

const me = { characterId: "warrior", build: "a" };

async function party() {
    const room = await loadRoom();
    room.code = "ABCDEFGH";
    const host = enter(room, "host", "create");
    say(room, host, { t: "create", me });
    const guest = enter(room, "guest", "join");
    say(room, guest, { t: "join", me });
    return { room, host, guest };
}

describe("Cloudflare co-op room", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocketRequestResponsePair", class {});
        log = [];
        sockets = [];
        alarmAt = undefined;
        alarmFails = 0;
        saved = undefined;
        writes = 0;
        listings = [];
        gone = [];
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("saves someone joining at once, even straight after another save", async () => {
        const { room } = await party();
        expect(saved.members.map((m: any) => m.id)).toEqual(["host", "guest"]);
        // After a restart, the guest's token still brings them back
        const restarted = await loadRoom();
        expect(restarted.room.members[1].token).toBe(room.room.members[1].token);
    });

    it("saves the run starting before anyone's told", async () => {
        const { room, host } = await party();
        log = [];
        say(room, host, { t: "start", game: {} });
        expect(log[0]).toBe("save");
        expect(log).toContain("guest start");
        expect(saved.started).toBe(true);
        expect((await loadRoom()).room.started).toBe(true);
    });

    it("doesn't bring back someone who left just before a restart", async () => {
        const { room, host, guest } = await party();
        say(room, host, { t: "start", game: {} });
        log = [];
        say(room, guest, { t: "leave" });
        // Saved before the host hears of it
        expect(log.indexOf("save")).toBeGreaterThan(-1);
        expect(log.indexOf("save")).toBeLessThan(log.indexOf("host left"));
        const restarted = await loadRoom();
        expect(restarted.room.members.map((m: any) => m.id)).toEqual(["host"]);
        expect(restarted.room.started).toBe(true);
    });

    it("still saves what players pick no more than once a second", async () => {
        const { room, guest } = await party();
        const before = writes;
        for (let i = 0; i < 5; i++) {
            say(room, guest, { t: "me", ready: i % 2 === 0 });
            await wait(room, 100);
        }
        expect(writes - before).toBeLessThanOrEqual(1);
        await wait(room, 2000);
        expect(saved.members[1].ready).toBe(true);
    });

    it("tells the lobby only what it lists, and that it's there now and then", async () => {
        const { room, guest } = await party();
        await wait(room, 2000);
        const told = listings.length;
        // A loadout or ready isn't on the list: no request to the lobby
        say(room, guest, { t: "me", ready: true });
        await wait(room, 2000);
        expect(listings.length).toBe(told);
        // The heartbeat says it anyway
        await wait(room, 60_000);
        expect(listings.length).toBe(told + 1);
        // As does someone leaving
        say(room, guest, { t: "leave" });
        expect(listings.at(-1).players).toBe(1);
    });

    it("takes a room that's gone off the lobby's list when someone tries to join it", async () => {
        const room = await loadRoom();
        room.code = "ABCDEFGH";
        const guest = enter(room, "guest", "join");
        // Closed after the error, which lets go of it
        const socket = guest.socket;
        say(room, guest, { t: "join", me });
        expect(socket.sent.at(-1).t).toBe("error");
        expect(gone).toEqual(["ABCDEFGH"]);
    });

    it("hides a hidden flag, but not an open room's host's", async () => {
        const room = await loadRoom();
        room.code = "ABCDEFGH";
        const host = enter(room, "host", "create");
        host.country = "FI";
        say(room, host, { t: "create", me: { ...me, hideCountry: true } });
        const guest = enter(room, "guest", "join");
        guest.country = "SE";
        say(room, guest, { t: "join", me: { ...me, hideCountry: true } });
        await wait(room, 2000);
        const shown = () => {
            const view = guest.socket.sent.filter((m: any) => m.t === "room").at(-1).room;
            return view.members.map((m: any) => m.country);
        };
        expect(shown()).toEqual([undefined, undefined]);
        expect(listings.at(-1).country).toBeUndefined();

        say(room, host, { t: "settings", open: true });
        await wait(room, 2000);
        expect(shown()).toEqual(["FI", undefined]);
        expect(listings.at(-1).country).toBe("FI");
        // Kept after a restart
        expect(saved.members[0].hideCountry).toBe(true);

        say(room, host, { t: "settings", open: false });
        await wait(room, 2000);
        expect(shown()).toEqual([undefined, undefined]);
    });

    it("answers a player's game closing its connection", async () => {
        const { room, host, guest } = await party();
        const guestSocket = guest.socket;
        await playerCloses(room, guestSocket, 1001);
        expect(guestSocket.closes).toEqual([1001]);
        // Still held for their game to come back
        expect(room.room.members).toContain(guest);
        // No code given, which can't be sent back
        const hostSocket = host.socket;
        await playerCloses(room, hostSocket, 1005);
        expect(hostSocket.closes).toEqual([1000]);
    });

    it("waits with its alarm, not a timer, which would keep it billed", async () => {
        const { room, host, guest } = await party();
        say(room, guest, { t: "me", ready: true });
        say(room, host, { t: "start", game: {} });
        say(room, host, { t: "down", f: 1 });
        await playerCloses(room, guest.socket, 1001);
        expect(vi.getTimerCount()).toBe(0);
        expect(alarmAt).toBeDefined();
    });

    it("carries on a run after it's been out of memory", async () => {
        const { room, host, guest } = await party();
        say(room, host, { t: "start", game: {} });
        await wait(room, 5000);
        const again = await loadRoom();
        // Back to the same connections, with nobody held as away
        expect(again.room.members.map((m: any) => m.socket)).toEqual([host.socket, guest.socket]);
        await say(again, again.room.members[0], { t: "down", f: 1 });
        expect(guest.socket.sent.at(-1).t).toBe("down");
        await say(again, again.room.members[1], { t: "up", i: 1 });
        expect(host.socket.sent.at(-1)).toMatchObject({ t: "up", from: "guest" });
        // Says it's there when it was due, a minute after it was made, and
        // not again for being made again
        const told = listings.length;
        await wait(again, 54_000);
        expect(listings.length).toBe(told);
        await wait(again, 2000);
        expect(listings.length).toBe(told + 1);
        await wait(again, 60_000);
        expect(listings.length).toBe(told + 2);
        expect(again.room.members).toHaveLength(2);
    });

    it("keeps its heartbeat when it was due, however often it's made again", async () => {
        const { room } = await party();
        await wait(room, 1000);
        const told = listings.length;
        // Made again every 20 seconds, for a minute and a half
        let again = room;
        for (let i = 0; i < 4; i++) {
            await wait(again, 20_000);
            again = await loadRoom();
        }
        await wait(again, 10_000);
        // Once at 60 seconds, as it would have
        expect(listings.length).toBe(told + 1);
    });

    it("lets go of someone who doesn't come back, though it's out of memory meanwhile", async () => {
        const { room, guest } = await party();
        await playerCloses(room, guest.socket, 1001);
        expect(saved.members[1].awayAt).toBeDefined();
        await wait(room, 10_000);
        // Made again by its alarm: their 15 seconds go on from when they went
        const again = await loadRoom();
        await wait(again, 4000);
        expect(again.room.members).toHaveLength(2);
        await wait(again, 2000);
        expect(again.room.members.map((m: any) => m.id)).toEqual(["host"]);
    });

    it("forgets someone was away once they're back", async () => {
        const { room, guest } = await party();
        await playerCloses(room, guest.socket, 1001);
        await wait(room, 3000);
        resume(room, guest.token, new Socket("guest"));
        expect(guest.socket.sent.at(-1).t).toBe("room");
        expect(saved.members[1].awayAt).toBeUndefined();
        const again = await loadRoom();
        await wait(again, 20_000);
        expect(again.room.members).toHaveLength(2);
    });

    it("still closes a connection that never makes or joins the room", async () => {
        const room = await loadRoom();
        room.code = "ABCDEFGH";
        const pending = enter(room, "guest", "join");
        room.awaitEntry(pending, 10_000);
        const socket = pending.socket;
        await wait(room, 5000);
        const again = await loadRoom();
        await wait(again, 4000);
        expect(socket.closes).toEqual([]);
        await wait(again, 2000);
        expect(socket.closes).toEqual([1008]);
    });

    it("isn't let go as idle when Cloudflare restarts it late in a long run", async () => {
        const { room, host, guest } = await party();
        say(room, host, { t: "start", game: {} });
        // 35 minutes of a busy run, with nobody joining, leaving or dropping
        for (let i = 0; i < 35 * 12; i++) {
            say(room, host, { t: "down", f: i });
            say(room, guest, { t: "up", i });
            await wait(room, 5000);
        }
        const again = await restart();
        const back = new Socket("host");
        resume(again, host.token, back);
        await wait(again, 1000);
        expect(again.room?.started).toBe(true);
        expect(back.sent.map((m: any) => m.t)).not.toContain("gone");
    });

    it("doesn't take a connection it's closed for its player's, once it's made again", async () => {
        const { room, guest } = await party();
        // Their game comes back while the old connection's open but dead
        const old = guest.socket;
        const back = new Socket("guest");
        resume(room, guest.token, back);
        expect(old.closes).toEqual([1000]);
        await wait(room, 15_000);
        // Cloudflare lists it still (and first), as the far end never answers
        expect(old.connected).toBe(true);
        const again = await loadRoom();
        const member = again.room.members.find((m: any) => m.id === "guest");
        expect(member.socket).toBe(back);
        expect(back.closes).toEqual([]);
        await say(again, member, { t: "rename" });
        expect(back.sent.map((m: any) => m.t)).toContain("named");
    });

    it("keeps its code for a connection still to make the room, once it's made again", async () => {
        const room = await loadRoom();
        room.code = "ABCDEFGH";
        const host = enter(room, "host", "create");
        room.awaitEntry(host, 10_000);
        const socket = host.socket;
        await wait(room, 3000);
        const again = await loadRoom();
        await again.webSocketMessage(socket, JSON.stringify({ t: "create", me }));
        expect(again.room.code).toBe("ABCDEFGH");
        expect(listings.at(-1).code).toBe("ABCDEFGH");
    });

    it("sets its alarm again after it couldn't", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const room = await loadRoom();
        room.code = "ABCDEFGH";
        alarmFails = 1;
        const pending = enter(room, "guest", "join");
        room.awaitEntry(pending, 10_000);
        const socket = pending.socket;
        await Promise.resolve();
        await Promise.resolve();
        expect(alarmAt).toBeUndefined();
        // The next message sets it
        await say(room, pending, { t: "me" });
        expect(alarmAt).toBeDefined();
        await wait(room, 10_000);
        expect(socket.closes).toEqual([1008]);
        warn.mockRestore();
    });
});
