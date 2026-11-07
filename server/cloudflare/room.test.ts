import { roomLocation } from "./src/location.mjs";
import { Room } from "./src/room.mjs";

vi.mock("./src/location.mjs", () => ({ roomLocation: vi.fn() }));

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
// Whether Cloudflare says when it last answered a socket's ping
let pingTimes: boolean;

// A hibernatable connection, as the room sees one
class Socket {
    sent: any[] = [];
    // The codes the room's closed it with
    closes: number[] = [];
    // Listed by getWebSockets: still so once the room's closed it, until
    // the other end answers (playerCloses), which a dead one never does
    connected = true;
    // When Cloudflare last answered its ping without waking the room
    pingedAt: Date | null = null;
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

const env: Record<string, any> = {
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
        waitUntil: (_promise: Promise<unknown>) => {},
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
        ...(pingTimes && {
            getWebSocketAutoResponseTimestamp: (socket: Socket) => socket.pingedAt,
        }),
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
        pingTimes = true;
        saved = undefined;
        writes = 0;
        listings = [];
        gone = [];
        vi.mocked(roomLocation).mockReset();
        vi.mocked(roomLocation).mockResolvedValue({ colo: "EWR", country: "US" });
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
        expect(listings.at(-1).country).toBe("US");
        // Kept after a restart
        expect(saved.members[0].hideCountry).toBe(true);

        say(room, host, { t: "settings", open: false });
        await wait(room, 2000);
        expect(shown()).toEqual([undefined, undefined]);
    });

    it("keeps the server flag on host handoff while player flags follow the players", async () => {
        const { room, host, guest } = await party();
        host.country = "FI";
        guest.country = "SE";
        say(room, host, { t: "settings", open: true });
        await wait(room, 2000);
        expect(listings.at(-1)).toMatchObject({ country: "US", countrySource: "server" });
        const original = room.room;

        say(room, host, { t: "leave" });
        await wait(room, 2000);
        expect(room.room).toBe(original);
        expect(room.room.hostId).toBe(guest.id);
        expect(listings.at(-1)).toMatchObject({ code: "ABCDEFGH", country: "US" });
        expect(gone).toEqual([]);
        const awake = await loadRoom();
        expect(awake.room.hostId).toBe(guest.id);
        expect(awake.roomView().members[0].country).toBe("SE");
    });

    it("keeps the initial country when a player resumes from a different country", async () => {
        const { room, host } = await party();
        host.country = "FI";
        say(room, host, { t: "settings", open: true });
        await wait(room, 2000);
        const request = new Request(`https://relay/coop/room/ABCDEFGH?resume=${host.token}`, {
            headers: { "x-country": "SE" },
        });
        const back = new Socket("back");
        vi.stubGlobal(
            "WebSocketPair",
            class {
                0 = new Socket("game");
                1 = back;
            },
        );
        vi.stubGlobal("Response", class {});

        await room.fetch(request);
        expect(host.country).toBe("FI");
        expect(back.sent.at(-1).room.members[0].country).toBe("FI");
        expect(listings.at(-1).country).toBe("US");
    });

    it("can create another game room inside the same object before it shuts down", async () => {
        const { room, host } = await party();
        say(room, host, { t: "settings", open: true });
        await wait(room, 2000);
        expect(saved.serverCountry).toBe("US");
        const oldGameRoom = room.room;
        room.disband("closed");
        vi.mocked(roomLocation).mockResolvedValue({ colo: "ARN", country: "SE" });
        const nextHost = enter(room, "nextHost", "create");
        nextHost.country = "SE";
        say(room, nextHost, { t: "create", open: true, me });
        await room.locationLookup;

        // Routing a reused code reaches this same object ID. If the object
        // is still alive, create accepts a new game room inside it.
        expect(room.room).not.toBe(oldGameRoom);
        expect(room.room.code).toBe("ABCDEFGH");
        expect(room.room.hostId).toBe("nextHost");
        expect(listings.at(-1)).toMatchObject({ code: "ABCDEFGH", country: "SE" });
        expect(saved.hostId).toBe("nextHost");
        expect(saved.serverCountry).toBe("SE");
        expect(roomLocation).toHaveBeenCalledTimes(2);
    });

    it("leaves the server flag unknown until measured and discards late results after closing", async () => {
        let finish!: (location: { colo: string; country: string }) => void;
        vi.mocked(roomLocation).mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        const { room, host } = await party();
        host.country = "FI";
        say(room, host, { t: "settings", open: true });
        await wait(room, 2000);
        expect(listings.at(-1)).toMatchObject({ countrySource: "server" });
        expect(listings.at(-1).country).toBeUndefined();
        room.tellLobby(true);
        room.tellLobby(true);
        expect(roomLocation).toHaveBeenCalledOnce();
        const pending = room.locationLookup;
        room.disband("closed");
        const count = listings.length;
        finish({ colo: "EWR", country: "US" });
        await pending;
        expect(listings).toHaveLength(count);
        expect(saved).toBeUndefined();
    });

    it("keeps the first country through later heartbeats, hibernation and restarts", async () => {
        const { room, host } = await party();
        host.country = "FI";
        say(room, host, { t: "settings", open: true });
        await wait(room, 2000);
        await room.locationLookup;
        expect(listings.at(-1).country).toBe("US");
        expect(saved.serverCountry).toBe("US");
        expect(saved.locationRetryAt).toBeUndefined();

        vi.mocked(roomLocation).mockClear();
        await wait(room, 65_000);
        const awake = await loadRoom();
        awake.tellLobby(true);
        expect(listings.at(-1).country).toBe("US");
        expect(awake.roomView().members[0].country).toBe("FI");
        const restarted = await restart();
        vi.setSystemTime(Date.now() + 2 * 60 * 60_000);
        restarted.tellLobby(true);
        expect(listings.at(-1).country).toBe("US");
        expect(roomLocation).not.toHaveBeenCalled();
    });

    it("doesn't save an old room's late measurement into a replacement room", async () => {
        let finish!: (location: { colo: string; country: string }) => void;
        vi.mocked(roomLocation).mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        const { room, host } = await party();
        say(room, host, { t: "settings", open: true });
        await wait(room, 2000);
        const pending = room.locationLookup;
        room.disband("closed");
        vi.mocked(roomLocation).mockResolvedValue({ colo: "ARN", country: "SE" });
        const nextHost = enter(room, "nextHost", "create");
        say(room, nextHost, { t: "create", open: true, me });
        await room.locationLookup;
        expect(saved.serverCountry).toBe("SE");

        finish({ colo: "EWR", country: "US" });
        await pending;
        expect(saved.hostId).toBe("nextHost");
        expect(saved.serverCountry).toBe("SE");
        expect(listings.at(-1).country).toBe("SE");
        expect(roomLocation).toHaveBeenCalledTimes(2);
    });

    it("keeps a failed lookup's cooldown through waking, then saves the first success", async () => {
        vi.mocked(roomLocation).mockResolvedValueOnce(undefined);
        const { room, host } = await party();
        say(room, host, { t: "settings", open: true });
        await wait(room, 2000);
        expect(roomLocation).toHaveBeenCalledOnce();
        expect(saved.serverCountry).toBeUndefined();
        expect(saved.locationRetryAt).toBeGreaterThan(Date.now());
        const retryAt = saved.locationRetryAt;

        const awake = await loadRoom();
        awake.tellLobby(true);
        expect(roomLocation).toHaveBeenCalledOnce();
        const restarted = await restart();
        restarted.tellLobby(true);
        expect(roomLocation).toHaveBeenCalledOnce();
        vi.setSystemTime(retryAt);
        restarted.tellLobby(true);
        await restarted.locationLookup;
        expect(roomLocation).toHaveBeenCalledTimes(2);
        expect(listings.at(-1).country).toBe("US");
        expect(saved.serverCountry).toBe("US");
        expect(saved.locationRetryAt).toBeUndefined();

        restarted.tellLobby(true);
        expect(roomLocation).toHaveBeenCalledTimes(2);
    });

    it("doesn't measure private rooms or started runs", async () => {
        const { room, host } = await party();
        expect(roomLocation).not.toHaveBeenCalled();
        say(room, host, { t: "settings", open: true });
        await wait(room, 2000);
        await room.locationLookup;
        expect(roomLocation).toHaveBeenCalled();
        vi.mocked(roomLocation).mockClear();
        room.room.started = true;
        room.tellLobby(true);
        expect(roomLocation).not.toHaveBeenCalled();
    });

    it("clears a closed room's storage and lets its remaining alarm drain", async () => {
        const { room } = await party();
        expect(saved).toBeDefined();
        expect(alarmAt).toBeDefined();
        room.disband("closed");
        expect(saved).toBeUndefined();
        expect(gone).toEqual(["ABCDEFGH"]);
        // deleteAll does not delete alarms at wrangler.toml's compatibility date.
        await wait(room, 65_000);
        expect(alarmAt).toBeUndefined();
        expect(room.due.size).toBe(0);
        const awake = await loadRoom();
        expect(awake.room).toBeUndefined();
        expect(saved).toBeUndefined();
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

    // Time passing with some players' games pinging (answered without waking
    // the room) every `every` ms, as a hidden tab's can slow to
    async function pinging(room: any, ms: number, players: any[], every = 30_000) {
        for (let t = 0; t < ms; t += every) {
            for (const player of players) {
                player.socket && (player.socket.pingedAt = new Date());
            }
            await wait(room, Math.min(every, ms - t));
        }
    }

    it("lets go of a player it's heard nothing from for five minutes, as if they'd dropped", async () => {
        const { room, host, guest } = await party();
        say(room, host, { t: "start", game: {} });
        const guestSocket = guest.socket;
        // Their connection died without closing; the host's game pings
        await pinging(room, 5 * 60_000, [host]);
        expect(guestSocket.closes).toEqual([]);
        await pinging(room, 61_000, [host]);
        expect(guestSocket.closes).toEqual([1001]);
        // Held for a moment, as for a closed connection, then out
        expect(room.room.members).toHaveLength(2);
        await pinging(room, 16_000, [host], 4000);
        expect(room.room.members.map((m: any) => m.id)).toEqual(["host"]);
        expect(host.socket.sent.at(-1)).toMatchObject({ t: "room" });
        expect(host.socket.closes).toEqual([]);
        // Coming back after that, they're told why, by the room made again too
        const late = new Socket("guest");
        resume(await loadRoom(), guest.token, late);
        expect(late.sent.at(-1).message).toBe("You were away too long, so you're out of the room.");
    });

    it("doesn't tell a player let go for something else that they were away", async () => {
        const { room, guest } = await party();
        const guestSocket = guest.socket;
        // Far more than the rate limit allows in a second
        for (let i = 0; i < 500 && guest.socket; i++) {
            say(room, guest, { t: "me" });
        }
        expect(guestSocket.closes).toEqual([1008]);
        const back = new Socket("guest");
        resume(room, guest.token, back);
        expect(back.sent.at(-1).message).toBe("You're no longer in that room.");
    });

    it("ends the run for everyone when the host's gone quiet, not half an hour later", async () => {
        const { room, guest } = await party();
        const guestSocket = guest.socket;
        await say(room, room.room.members[0], { t: "start", game: {} });
        await pinging(room, 6 * 60_000 + 16_000, [guest]);
        expect(guestSocket.sent.at(-1)).toMatchObject({ t: "gone", reason: "hostLeft" });
        expect(room.room).toBeUndefined();
    });

    it("keeps players whose games only ping, once a minute, for as long as the room's going", async () => {
        const { room, host, guest } = await party();
        say(room, host, { t: "start", game: {} });
        // A run with nothing sent but pings (only possible from a frozen
        // host, which then pings too), until just before it's idle
        await pinging(room, 29 * 60_000, [host, guest], 60_000);
        expect(room.room.members).toHaveLength(2);
        expect(host.socket.closes).toEqual([]);
        expect(guest.socket.closes).toEqual([]);
    });

    it("counts what players say as hearing from them", async () => {
        const { room, host, guest } = await party();
        say(room, host, { t: "start", game: {} });
        for (let i = 0; i < 12 * 10; i++) {
            say(room, host, { t: "down", f: i });
            say(room, guest, { t: "up", i });
            await wait(room, 5000);
        }
        expect(room.room.members).toHaveLength(2);
        expect(guest.socket.closes).toEqual([]);
    });

    it("remembers when it last heard from someone through being out of memory", async () => {
        const { room, host, guest } = await party();
        const guestSocket = guest.socket;
        await pinging(room, 3 * 60_000, [host]);
        // Made again, which mustn't start their quiet over
        const again = await loadRoom();
        const [h] = again.room.members;
        await pinging(again, 2 * 60_000 + 61_000, [h]);
        expect(guestSocket.closes).toEqual([1001]);
    });

    it("lets go of nobody for silence when it can't tell when their pings came", async () => {
        pingTimes = false;
        const { room, host, guest } = await party();
        await pinging(room, 20 * 60_000, [host, guest]);
        expect(room.room.members).toHaveLength(2);
        expect(guest.socket.closes).toEqual([]);
    });

    it("keeps when it last heard from a player through being out of memory", async () => {
        const { room, host, guest } = await party();
        const guestSocket = guest.socket;
        // The guest says something, then goes quiet; a heartbeat passes, and
        // the room's made again
        await pinging(room, 100_000, [host], 10_000);
        await say(room, guest, { t: "me", ready: true });
        await pinging(room, 30_000, [host], 10_000);
        const again = await loadRoom();
        const [h] = again.room.members;
        // Five minutes from when it last heard them, not from when they joined
        await pinging(again, 280_000, [h], 10_000);
        expect(guestSocket.closes).toEqual([]);
        await pinging(again, 20_000, [h], 10_000);
        expect(guestSocket.closes).toEqual([1001]);
    });

    describe("its log", () => {
        // What the room's logged, in order
        function logged() {
            return vi
                .mocked(console.warn)
                .mock.calls.map(([entry]) => entry)
                .filter((entry: any) => entry?.event === "coop_room");
        }
        beforeEach(() => {
            vi.spyOn(console, "warn").mockImplementation(() => {});
        });
        afterEach(() => {
            vi.mocked(console.warn).mockRestore();
        });

        it("logs one line when it closes a room as idle, with what it knew", async () => {
            const { room, host, guest } = await party();
            say(room, host, { t: "start", game: {} });
            room.room.endless = true;
            // Thrown away: unreadable, and from a connection it's done with
            await room.webSocketMessage(host.socket, "not json");
            await room.webSocketMessage(host.socket, "not json either");
            const old = guest.socket;
            const back = new Socket("guest");
            resume(room, guest.token, back);
            await room.webSocketMessage(old, JSON.stringify({ t: "up", i: 1 }));
            // Saved within a second, so the room made again still has them
            await wait(room, 1000);
            const again = await loadRoom();
            // Everyone's games ping, and nothing else
            await pinging(again, 31 * 60_000, [host, guest]);
            const entries = logged();
            expect(entries).toHaveLength(1);
            const [entry] = entries;
            expect(entry).toMatchObject({
                kind: "idle",
                room: "ABCDEFGH",
                started: true,
                endless: true,
                strays: 1,
            });
            expect(entry.quietFor).toBeGreaterThan(30 * 60_000);
            expect(entry.players).toEqual([
                expect.objectContaining({
                    id: "host",
                    host: true,
                    connected: true,
                    discarded: { unreadable: 2 },
                }),
                expect.objectContaining({ id: "guest", host: false, discarded: null }),
            ]);
            expect(entry.players[0].pingedAgo).toBeLessThanOrEqual(30_000);
            expect(entry.players[0].heardAgo).toBeGreaterThan(30 * 60_000);
            expect(back.sent.at(-1)).toMatchObject({ t: "gone", reason: "idle" });
        });

        it("logs nothing for a player let go for silence, nor a busy run", async () => {
            const { room, host } = await party();
            say(room, host, { t: "start", game: {} });
            await pinging(room, 7 * 60_000, [host]);
            expect(room.room.members).toHaveLength(1);
            expect(logged()).toEqual([]);
        });
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

    describe("run checks", () => {
        let warn: any;
        beforeEach(() => {
            warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        });
        afterEach(() => {
            warn.mockRestore();
            delete env.MULTIPLAYER_RUN_CHECKS;
        });
        // What the run checks logged: an object each, which Workers Logs keeps
        // field by field
        const checked = () =>
            warn.mock.calls
                .map(([entry]: [any]) => entry)
                .filter((entry: any) => entry?.event === "coop_run_check");
        const heroes = [{ id: "host" }, { id: "guest" }];
        // Frames giving the guest a move they never sent
        const forged = (room: any, host: any, frame: number) =>
            say(room, host, {
                t: "down",
                d: { upTo: frame, events: [{ frame, hero: 1, move: [127, 0] }] },
            });

        it("logs a host's frames giving a guest moves they didn't send, and goes on", async () => {
            const { room, host, guest } = await party();
            say(room, host, { t: "start", game: { heroes } });
            say(room, guest, { t: "up", d: { move: [0, 127] } });
            say(room, host, {
                t: "down",
                d: { upTo: 1, events: [{ frame: 1, hero: 1, move: [0, 127] }] },
            });
            expect(checked()).toEqual([]);
            for (let frame = 2; frame <= 5; frame++) {
                forged(room, host, frame);
            }
            expect(checked()[0]).toMatchObject({
                kind: "move",
                room: "ABCDEFGH",
                host: "host",
                guest: "guest",
                hero: 1,
                frame: 2,
                move: [127, 0],
                sent: [[0, 127]],
            });
            expect(guest.socket.sent.at(-1)).toMatchObject({ t: "down", d: { upTo: 5 } });
            expect(room.room.started).toBe(true);
            // And sums it up when the run's over
            say(room, host, { t: "end" });
            expect(checked().at(-1)).toMatchObject({
                kind: "summary",
                counts: { move: 4 },
                caught: "move",
            });
        });

        it("sends the collector a row for the run, through its binding, after a restart too", async () => {
            const sent: any[] = [];
            env.RUN_CHECKS_TOKEN = "a-relay-token-that-is-long-enough-to-use";
            env.RUN_CHECKS = {
                fetch: async (url: string, init: any) => {
                    sent.push({ url, auth: init.headers.Authorization, ...JSON.parse(init.body) });
                    return { ok: true, status: 200 };
                },
            };
            try {
                const { room, host } = await party();
                room.room.mapId = "barrows";
                room.room.hard = true;
                // The room's map and mode go in the row, whatever the start says
                const game = {
                    mapId: "lumbridge",
                    hard: false,
                    endless: false,
                    heroes: [
                        { id: "host", characterId: "wizard" },
                        { id: "guest", characterId: "ranger" },
                    ],
                };
                say(room, host, { t: "start", game });
                // An honest run sends nothing
                say(room, host, { t: "end" });
                expect(sent).toEqual([]);
                say(room, host, { t: "start", game });
                // Found before the restart as well as after it
                forged(room, host, 40);
                await wait(room, 1000);
                const again = await restart();
                const [h, g] = again.room.members;
                resume(again, h.token, new Socket("host"));
                resume(again, g.token, new Socket("guest"));
                // Checked again once the frames since the restart can be
                say(again, h, { t: "down", d: { upTo: 60, events: [] } });
                await wait(again, 26_000);
                forged(again, h, 1360);
                say(again, h, { t: "end" });
                await Promise.resolve();
                expect(sent).toEqual([
                    expect.objectContaining({
                        url: expect.stringMatching(/\/v1\/run-checks$/),
                        auth: `Bearer ${env.RUN_CHECKS_TOKEN}`,
                        relay: "cloudflare",
                        mapId: "barrows",
                        mode: "hard",
                        partySize: 2,
                        characters: ["ranger", "wizard"],
                        counts: { move: 2 },
                        caught: null,
                        ended: false,
                    }),
                ]);
                // Neither names nor the room
                expect(JSON.stringify(sent)).not.toMatch(/ABCDEFGH|"host"|"guest"/);
            } finally {
                delete env.RUN_CHECKS;
                delete env.RUN_CHECKS_TOKEN;
            }
        });

        it("ends the run when it's set to", async () => {
            env.MULTIPLAYER_RUN_CHECKS = "end";
            const { room, host, guest } = await party();
            const guestSocket = guest.socket;
            say(room, host, { t: "start", game: { heroes } });
            for (let frame = 1; frame <= 3; frame++) {
                forged(room, host, frame);
            }
            expect(guestSocket.sent.at(-1)).toMatchObject({ t: "gone", reason: "hostLeft" });
        });

        it("doesn't take what it can't know after a restart for the host's word", async () => {
            const { room, host } = await party();
            say(room, host, { t: "start", game: { heroes } });
            await wait(room, 1000);
            // Cloudflare restarting it, as a deploy does: everyone comes back
            const again = await restart();
            const [h, g] = again.room.members;
            resume(again, h.token, new Socket("host"));
            resume(again, g.token, new Socket("guest"));
            // Frames the host held through it carry a move from before
            forged(again, h, 100);
            await wait(again, 20_000);
            forged(again, h, 1100);
            expect(checked()).toEqual([]);
            // Then it checks again, as it kept who the heroes are
            await wait(again, 6000);
            forged(again, h, 1500);
            expect(checked()).toHaveLength(1);
        });

        it("leaves a run that began before the room kept its heroes alone", async () => {
            const { room, host } = await party();
            say(room, host, { t: "start", game: { heroes } });
            // As one saved by the relay before this one was deployed
            delete saved.heroIds;
            const again = await loadRoom();
            const [h, g] = again.room.members;
            await wait(again, 30_000);
            for (let frame = 1; frame <= 5; frame++) {
                forged(again, h, frame);
            }
            expect(checked()).toEqual([]);
            expect(g.socket.sent.at(-1)).toMatchObject({ t: "down", d: { upTo: 5 } });
        });
    });
});
