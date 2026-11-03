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

async function makeLobby(): Promise<any> {
    let ready: Promise<unknown> = Promise.resolve();
    const ctx = {
        setWebSocketAutoResponse: () => {},
        blockConcurrencyWhile: (load: () => Promise<unknown>) => (ready = ready.then(load)),
        getWebSockets: () => sockets,
        storage: {
            list: async () => new Map(),
            put: async () => {},
            delete: async () => {},
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
        order: 1,
    };
}

describe("Cloudflare co-op lobby", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocketRequestResponsePair", class {});
        sockets = [];
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

        // Two changes close together go as one
        await lobby.roomUpdate(listing("AAAAAAAA"));
        await lobby.roomUpdate(listing("AAAAAAAA", 2));
        vi.advanceTimersByTime(1000);
        expect(rooms(browser)).toHaveLength(2);
        expect(rooms(browser)[1].rooms).toEqual([
            expect.objectContaining({ code: "AAAAAAAA", players: 2 }),
        ]);
        // Not to a connection that's never asked
        expect(rooms(elsewhere)).toEqual([]);

        // A change that doesn't show isn't sent
        await lobby.roomUpdate({ ...listing("BBBBBBBB"), open: false });
        vi.advanceTimersByTime(1000);
        expect(rooms(browser)).toHaveLength(2);
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
        vi.advanceTimersByTime(6 * 60_000);
        // Another page is doing something, as is anything but the list
        await say(lobby, paging, { t: "list", page: 1, size: 1 });
        await say(lobby, polling, { t: "list", size: 1 });
        vi.advanceTimersByTime(5 * 60_000);
        await say(lobby, paging, { t: "list", page: 1, size: 1 });
        expect(paging.closed).toBeUndefined();
        await say(lobby, polling, { t: "list", size: 1 });
        expect(polling.closed).toBe(1001);

        // Back from a room, the time starts again
        await say(lobby, paging, { t: "join", code: "ZZZZZZZZ" });
        vi.advanceTimersByTime(60 * 60_000);
        await say(lobby, paging, { t: "list", page: 1, size: 1 });
        await say(lobby, paging, { t: "list", page: 1, size: 1 });
        expect(paging.closed).toBeUndefined();
    });
});
