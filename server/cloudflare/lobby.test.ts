import { Lobby } from "./src/lobby.mjs";

// A hibernatable connection, as the lobby sees one
class Socket {
    sent: any[] = [];
    closed?: number;
    private attachment: any;
    constructor(id: string) {
        this.attachment = { id, name: id, address: id };
    }
    serializeAttachment(value: unknown) {
        this.attachment = structuredClone(value);
    }
    deserializeAttachment() {
        return structuredClone(this.attachment);
    }
    send(text: string) {
        this.sent.push(JSON.parse(text));
    }
    close(code: number) {
        this.closed = code;
    }
}

let sockets: Socket[];
// The lobby's storage, kept through it waking again
let stored: Map<string, any>;

async function makeLobby(): Promise<any> {
    let ready: Promise<unknown> = Promise.resolve();
    const ctx = {
        setWebSocketAutoResponse: () => {},
        blockConcurrencyWhile: (load: () => Promise<unknown>) => (ready = ready.then(load)),
        getWebSockets: () => sockets,
        storage: {
            list: async () => new Map(stored),
            put: async (key: string, value: unknown) => {
                stored.set(key, structuredClone(value));
            },
            delete: async (key: string) => {
                stored.delete(key);
            },
        },
    };
    const lobby = new Lobby(ctx, {});
    await ready;
    return lobby;
}

function connect(id: string): Socket {
    const socket = new Socket(id);
    sockets.push(socket);
    return socket;
}

const say = (lobby: any, socket: Socket, message: object) =>
    lobby.webSocketMessage(socket, JSON.stringify(message));

const rooms = (socket: Socket) => socket.sent.filter((m) => m.t === "rooms");

// Time passing, with these rooms saying they're there every minute
async function wait(lobby: any, ms: number, codes: string[]) {
    for (let at = 0; at < ms; at += 60_000) {
        vi.advanceTimersByTime(Math.min(60_000, ms - at));
        for (const code of codes) {
            await lobby.roomUpdate(listing(code));
        }
    }
}

function listing(code: string, players = 1) {
    return {
        code,
        name: `Room ${code}`,
        open: true,
        started: false,
        players,
        mapId: "lumbridge",
        endless: false,
        hard: false,
        host: "Host",
        hostAddress: "host",
        order: Date.now(),
    };
}

describe("Cloudflare co-op lobby", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocketRequestResponsePair", class {});
        sockets = [];
        stored = new Map();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("sends the open rooms to everyone looking at them as they change", async () => {
        const lobby = await makeLobby();
        const browser = connect("browser");
        const elsewhere = connect("elsewhere");
        await say(lobby, browser, { t: "list" });
        expect(rooms(browser)).toHaveLength(1);

        // Straight away, with no timer holding the lobby awake
        await lobby.roomUpdate(listing("AAAAAAAA"));
        await lobby.roomUpdate(listing("AAAAAAAA", 2));
        expect(vi.getTimerCount()).toBe(0);
        expect(rooms(browser).at(-1).rooms).toEqual([
            expect.objectContaining({ code: "AAAAAAAA", players: 2 }),
        ]);
        // Not to a connection that's never asked
        expect(rooms(elsewhere)).toEqual([]);

        // A change that doesn't show isn't sent
        const sent = rooms(browser).length;
        await lobby.roomUpdate({ ...listing("BBBBBBBB"), open: false });
        expect(rooms(browser)).toHaveLength(sent);
    });

    it("shows only measured server flags, suppressing legacy host countries and unknown locations", async () => {
        const lobby = await makeLobby();
        const browser = connect("browser");
        await lobby.roomUpdate({ ...listing("AAAAAAAA"), country: "FI" });
        await say(lobby, browser, { t: "list" });
        expect(rooms(browser).at(-1).rooms[0].country).toBeUndefined();
        expect(rooms(browser).at(-1).rooms[0].countrySource).toBe("server");
        await lobby.roomUpdate({ ...listing("AAAAAAAA"), country: "FI", countrySource: "server" });
        await Promise.resolve();
        expect(rooms(browser).at(-1).rooms[0]).toMatchObject({
            country: "FI",
            countrySource: "server",
        });
        // A room measured with the old colo table saved an old code
        await lobby.roomUpdate({ ...listing("AAAAAAAA"), country: "UK", countrySource: "server" });
        await Promise.resolve();
        expect(rooms(browser).at(-1).rooms[0].country).toBe("GB");
        await lobby.roomUpdate({ ...listing("AAAAAAAA"), countrySource: "server" });
        await Promise.resolve();
        expect(rooms(browser).at(-1).rooms[0].country).toBeUndefined();
        expect(rooms(browser).at(-1).rooms[0].countrySource).toBe("server");
    });

    it("stops sending the list to someone in a room, until they ask again", async () => {
        const lobby = await makeLobby();
        const player = connect("player");
        await say(lobby, player, { t: "list" });
        await say(lobby, player, { t: "join", code: "ZZZZZZZZ" });
        const sent = rooms(player).length;
        await lobby.roomUpdate(listing("AAAAAAAA"));
        expect(rooms(player)).toHaveLength(sent);
        await say(lobby, player, { t: "list" });
        await lobby.roomUpdate(listing("AAAAAAAA", 2));
        expect(rooms(player).at(-1).rooms[0].players).toBe(2);
    });

    it("keeps the page someone's moved to when theirs has gone", async () => {
        const lobby = await makeLobby();
        await lobby.roomUpdate(listing("AAAAAAAA"));
        await lobby.roomUpdate(listing("BBBBBBBB"));
        const browser = connect("browser");
        await say(lobby, browser, { t: "list", page: 1, size: 1 });
        expect(rooms(browser).at(-1).page).toBe(1);
        // Down to one page: they're on page 0 now, and stay there
        await lobby.roomGone("BBBBBBBB");
        expect(rooms(browser).at(-1).page).toBe(0);
        await lobby.roomUpdate(listing("CCCCCCCC"));
        expect(rooms(browser).at(-1).page).toBe(0);
        // So Next is another page, which counts as doing something
        await wait(lobby, 11 * 60_000, ["AAAAAAAA", "CCCCCCCC"]);
        await say(lobby, browser, { t: "list", page: 1, size: 1 });
        expect(browser.closed).toBeUndefined();
    });

    it("lets a room that's never made go, however often the lobby wakes", async () => {
        let lobby = await makeLobby();
        const host = connect("host");
        await say(lobby, host, { t: "create", me: { unlocks: { maps: ["lumbridge"] } } });
        expect(host.sent.at(-1).t).toBe("goto");
        expect(lobby.liveRooms()).toHaveLength(1);
        // Woken over and over, as between heartbeats
        for (let i = 0; i < 4; i++) {
            vi.advanceTimersByTime(20_000);
            lobby = await makeLobby();
        }
        expect(lobby.liveRooms()).toEqual([]);
        await Promise.resolve();
        expect(stored.size).toBe(0);
    });

    it("lets a room that's stopped saying it's there go, however often the lobby wakes", async () => {
        let lobby = await makeLobby();
        await lobby.roomUpdate(listing("AAAAAAAA"));
        await lobby.roomUpdate(listing("BBBBBBBB"));
        // A ended without the lobby hearing; B's heartbeat wakes it every minute
        for (let minute = 0; minute < 40; minute++) {
            vi.advanceTimersByTime(60_000);
            lobby = await makeLobby();
            await lobby.roomUpdate(listing("BBBBBBBB"));
            if (minute === 20) {
                // Still there a while, as a room that's only quiet could be
                expect(lobby.liveRooms()).toHaveLength(2);
            }
        }
        expect(lobby.liveRooms().map((room: any) => room.code)).toEqual(["BBBBBBBB"]);
        await Promise.resolve();
        expect([...stored.keys()]).toEqual(["room:BBBBBBBB"]);
    });

    it("closes a connection that only asks for the same page, for ten minutes", async () => {
        const lobby = await makeLobby();
        // Two pages of one
        await lobby.roomUpdate(listing("AAAAAAAA"));
        await lobby.roomUpdate(listing("BBBBBBBB"));
        const polling = connect("polling");
        const paging = connect("paging");
        await say(lobby, polling, { t: "list", size: 1 });
        await say(lobby, paging, { t: "list", size: 1 });
        await wait(lobby, 6 * 60_000, ["AAAAAAAA", "BBBBBBBB"]);
        // Another page is doing something, as is anything but the list
        await say(lobby, paging, { t: "list", page: 1, size: 1 });
        await say(lobby, polling, { t: "list", size: 1 });
        await wait(lobby, 5 * 60_000, ["AAAAAAAA", "BBBBBBBB"]);
        await say(lobby, paging, { t: "list", page: 1, size: 1 });
        expect(paging.closed).toBeUndefined();
        await say(lobby, polling, { t: "list", size: 1 });
        expect(polling.closed).toBe(1001);

        // Back from a room, the time starts again
        await say(lobby, paging, { t: "join", code: "ZZZZZZZZ" });
        await wait(lobby, 60 * 60_000, ["AAAAAAAA", "BBBBBBBB"]);
        await say(lobby, paging, { t: "list", page: 1, size: 1 });
        await say(lobby, paging, { t: "list", page: 1, size: 1 });
        expect(paging.closed).toBeUndefined();
    });
});
