import { Server, createServer } from "node:http";
import { AddressInfo } from "node:net";

import { RELAY_PATH, createRelay, isMultiplayerOn } from "./coop-relay.mjs";

type Message = { t: string; [key: string]: any };

// A player's connection, with what's come in waiting to be taken
class TestClient {
    readonly messages: Message[] = [];
    private waiters: { type: string; resolve: (m: Message) => void }[] = [];
    readonly socket: WebSocket;

    constructor(url: string) {
        this.socket = new WebSocket(url);
        this.socket.onmessage = (event) => {
            const message = JSON.parse(String(event.data)) as Message;
            const waiter = this.waiters.find((w) => w.type === message.t);
            if (waiter) {
                this.waiters = this.waiters.filter((w) => w !== waiter);
                waiter.resolve(message);
            } else {
                this.messages.push(message);
            }
        };
    }

    send(message: Message): void {
        this.socket.send(JSON.stringify(message));
    }

    // The next message of this type (one that came already, or the next in)
    next(type: string): Promise<Message> {
        const index = this.messages.findIndex((m) => m.t === type);
        if (index !== -1) {
            return Promise.resolve(this.messages.splice(index, 1)[0]);
        }
        return new Promise((resolve) => this.waiters.push({ type, resolve }));
    }

    // The first room update that's like this, dropping the ones before it
    async roomWhere(test: (room: any) => boolean): Promise<Message> {
        for (;;) {
            const update = await this.next("room");
            if (test(update.room)) {
                return update;
            }
        }
    }

    // The latest room update, after dropping older ones
    async room(): Promise<Message> {
        let room = await this.next("room");
        for (;;) {
            const index = this.messages.findIndex((m) => m.t === "room");
            if (index === -1) {
                return room;
            }
            room = this.messages.splice(index, 1)[0];
        }
    }
}

describe("multiplayer toggle", () => {
    it("is off unless it's turned on", () => {
        expect(isMultiplayerOn({}, [])).toBe(false);
        expect(isMultiplayerOn({ MULTIPLAYER: "off" }, [])).toBe(false);
        expect(isMultiplayerOn({ MULTIPLAYER: "on" }, [])).toBe(true);
        expect(isMultiplayerOn({ MULTIPLAYER: "1" }, [])).toBe(true);
        expect(isMultiplayerOn({ npm_lifecycle_event: "serve:multiplayer" }, [])).toBe(true);
        expect(isMultiplayerOn({ npm_lifecycle_event: "serve" }, [])).toBe(false);
        expect(isMultiplayerOn({}, ["node", "serve.mjs", "--multiplayer"])).toBe(true);
    });
});

describe("co-op relay", () => {
    let server: Server;
    let relay: ReturnType<typeof createRelay>;
    let url: string;
    const clients: TestClient[] = [];

    // Everyone here connects from the same address, so the limits on each
    // address are out of the way unless a test sets them
    const LOOSE = { connectionsPerAddress: 1000, roomsPerAddress: 1000, createsPerMinute: 1000 };

    async function start(limits: Parameters<typeof createRelay>[0] = LOOSE): Promise<void> {
        relay = createRelay(limits);
        server = createServer((req, res) => {
            if (!relay.handleRequest(req, res)) {
                res.writeHead(404);
                res.end();
            }
        });
        relay.attach(server);
        await new Promise<void>((resolve) => server.listen(0, resolve));
        url = `ws://localhost:${(server.address() as AddressInfo).port}${RELAY_PATH}`;
    }

    async function stop(): Promise<void> {
        for (const client of clients.splice(0)) {
            client.socket.close();
        }
        relay.close();
        await new Promise((resolve) => server.close(resolve));
    }

    // Starts again with these limits
    async function restart(limits: Parameters<typeof createRelay>[0]): Promise<void> {
        await stop();
        await start({ ...LOOSE, ...limits });
    }

    beforeEach(() => start());
    afterEach(() => stop());

    // Names are a-z only and nobody in a room shares one: each gets its own
    let named = 0;
    const nextName = (base: string) => base + "abcdefghijklmnopqrstuvwxyz"[named++ % 26];

    async function connect(): Promise<TestClient> {
        const client = new TestClient(url);
        clients.push(client);
        await client.next("welcome");
        return client;
    }

    // A host with a room, and guests in it
    async function party(guests: number, open = false) {
        const host = await connect();
        host.send({ t: "create", open, me: { name: nextName("host"), characterId: "warrior" } });
        const { room } = await host.room();
        const others: TestClient[] = [];
        for (let i = 0; i < guests; i++) {
            const guest = await connect();
            guest.send({ t: "join", code: room.code, me: { name: nextName("guest") } });
            await guest.room();
            others.push(guest);
        }
        return { host, guests: others, code: room.code as string };
    }

    it("puts players in a room by its code", async () => {
        const { host, code } = await party(1);
        const { room, you } = await host.room();
        expect(room.code).toBe(code);
        expect(room.members.map((m: { name: string }) => m.name)).toEqual([
            expect.stringMatching(/^host[a-z]$/),
            expect.stringMatching(/^guest[a-z]$/),
        ]);
        expect(room.hostId).toBe(you);
    });

    it("lists open rooms and not invite-only ones", async () => {
        const open = await party(0, true);
        await party(0, false);
        const browser = await connect();
        browser.send({ t: "list" });
        const { rooms } = await browser.next("rooms");
        expect(rooms.map((r: { code: string }) => r.code)).toEqual([open.code]);
        expect(rooms[0].host).toMatch(/^host[a-z]$/);
    });

    it("cleans up names, and won't show a banned one", async () => {
        const client = await connect();
        client.send({ t: "create", open: true, me: { name: "Sh1t Lord" } });
        expect((await client.room()).room.members[0].name).toBe("adventurer");
        client.send({ t: "me", name: "Lumby Lad 99" });
        const { room } = await client.roomWhere((r) => r.members[0].name !== "adventurer");
        expect(room.members[0].name).toBe("lumbylad");
    });

    it("lists the open rooms a page at a time, fullest first", async () => {
        const codes: string[] = [];
        for (let i = 0; i < 5; i++) {
            codes.push((await party(0, true)).code);
        }
        // One more player in the last one: it goes to the top
        const busy = await party(1, true);
        const browser = await connect();
        const page = async (n: number) => {
            browser.send({ t: "list", page: n, size: 2 });
            return browser.next("rooms");
        };
        const first = await page(0);
        expect(first).toMatchObject({ page: 0, pages: 3, total: 6 });
        expect(first.rooms.map((r: { code: string }) => r.code)).toEqual([busy.code, codes[0]]);
        expect((await page(2)).rooms.map((r: { code: string }) => r.code)).toEqual([
            codes[3],
            codes[4],
        ]);
        // Past the end (rooms went while browsing): the last page
        expect(await page(9)).toMatchObject({ page: 2, pages: 3 });
        // A room that's started or filled up comes off the list
        busy.host.send({ t: "start", game: {} });
        await busy.guests[0].next("start");
        browser.send({ t: "list", size: 20 });
        const after = await browser.next("rooms");
        expect(after.total).toBe(5);
        expect(after.rooms.map((r: { code: string }) => r.code)).not.toContain(busy.code);
    });

    it("lists nothing past what's there, and copes with nonsense", async () => {
        const browser = await connect();
        browser.send({ t: "list", page: -3, size: 1e9 });
        expect(await browser.next("rooms")).toMatchObject({
            rooms: [],
            page: 0,
            pages: 1,
            total: 0,
        });
    });

    it("says when a code's wrong or a room's full", async () => {
        const client = await connect();
        client.send({ t: "join", code: "ZZZZZ" });
        expect((await client.next("error")).message).toMatch(/no room/);
        const { code } = await party(3);
        client.send({ t: "join", code });
        expect((await client.next("error")).message).toMatch(/full/);
    });

    it("lets the host kick someone and disband the room", async () => {
        const { host, guests } = await party(2);
        const { room } = await host.room();
        host.send({ t: "kick", id: room.members[1].id });
        expect((await guests[0].next("gone")).reason).toBe("kicked");
        await host.roomWhere((r) => r.members.length === 2);
        host.send({ t: "disband" });
        expect((await guests[1].next("gone")).reason).toBe("disbanded");
        expect((await host.next("gone")).reason).toBe("disbanded");
        expect(relay.roomCount).toBe(0);
    });

    it("only lets the host change the room", async () => {
        const { host, guests } = await party(1);
        guests[0].send({ t: "settings", mapId: "barrows" });
        guests[0].send({ t: "kick", id: "p1" });
        host.send({ t: "settings", mapId: "draynor", open: true });
        const { room } = await guests[0].roomWhere((r) => r.mapId === "draynor");
        expect(room.mapId).toBe("draynor");
        expect(room.open).toBe(true);
        expect(room.members).toHaveLength(2);
    });

    it("hands the room on when the host leaves the lobby", async () => {
        const { host, guests } = await party(2);
        host.send({ t: "leave" });
        await host.next("gone");
        const { room } = await guests[0].roomWhere((r) => r.members.length === 2);
        expect(room.hostId).toBe(room.members[0].id);
    });

    it("keeps players' readiness and passes the game between host and guests", async () => {
        const { host, guests } = await party(1);
        guests[0].send({ t: "me", ready: true, characterId: "wizard" });
        const { room } = await host.roomWhere((r) => r.members[1].ready);
        expect(room.members[1]).toMatchObject({ ready: true, characterId: "wizard" });
        host.send({ t: "start", game: { seed: 5 } });
        expect((await guests[0].next("start")).game).toEqual({ seed: 5 });
        guests[0].send({ t: "up", d: { m: [1, 0] } });
        const up = await host.next("up");
        expect(up.d).toEqual({ m: [1, 0] });
        expect(up.from).toBe(room.members[1].id);
        host.send({ t: "down", d: { n: 3 } });
        expect((await guests[0].next("down")).d).toEqual({ n: 3 });
    });

    it("ends the run for everyone if the host goes mid-run", async () => {
        const { host, guests } = await party(2);
        host.send({ t: "start", game: {} });
        await guests[0].next("start");
        host.socket.close();
        expect((await guests[0].next("gone")).reason).toBe("hostLeft");
        expect((await guests[1].next("gone")).reason).toBe("hostLeft");
    });

    it("tells the host when a guest goes mid-run", async () => {
        const { host, guests } = await party(2);
        host.send({ t: "start", game: {} });
        await guests[1].next("start");
        const { room } = await host.room();
        guests[0].socket.close();
        expect((await host.next("left")).id).toBe(room.members[1].id);
    });

    it("takes big messages in one piece", async () => {
        const { host, guests } = await party(1);
        const loadout = { items: "x".repeat(70_000) };
        host.send({ t: "start", game: { loadout } });
        expect((await guests[0].next("start")).game.loadout.items).toHaveLength(70_000);
    });

    it("says it's there to a plain request, for the game to offer co-op", async () => {
        await party(1);
        const response = await fetch(url.replace("ws:", "http:"));
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
        expect(await response.json()).toEqual({ coop: true, players: 2, rooms: 1, full: false });
        expect((await fetch(url.replace("ws:", "http:") + "/nope")).status).toBe(404);
    });

    it("keeps names to one player at a time", async () => {
        const host = await connect();
        host.send({ t: "create", open: true, me: { name: "zezima" } });
        const { room } = await host.room();
        const other = await connect();
        other.send({ t: "create", open: true, me: { name: "Zezima" } });
        expect((await other.next("error")).message).toMatch(/already using zezima/);
        other.send({ t: "join", code: room.code, me: { name: "zezima" } });
        expect((await other.next("error")).message).toMatch(/already using zezima/);
        // Free again once they've gone
        host.send({ t: "leave" });
        await host.next("gone");
        other.send({ t: "create", open: true, me: { name: "zezima" } });
        expect((await other.room()).room.members[0].name).toBe("zezima");
    });

    it("tells you when every room's taken", async () => {
        await restart({ maxRooms: 2 });
        await party(0, true);
        await party(0, true);
        const late = await connect();
        late.send({ t: "list" });
        expect((await late.next("rooms")).full).toBe(true);
        late.send({ t: "create", open: true, me: { name: "latecomer" } });
        expect((await late.next("error")).message).toMatch(/All rooms are taken/);
    });

    it("limits the connections and rooms from one address", async () => {
        await restart({ connectionsPerAddress: 3, roomsPerAddress: 2 });
        await party(0);
        await party(0);
        const third = await connect();
        third.send({ t: "create", me: { name: "thirdroom" } });
        expect((await third.next("error")).message).toMatch(/too many rooms/);
        // A fourth connection isn't let in at all
        const refused = new WebSocket(url);
        const closed = await new Promise<boolean>((resolve) => {
            refused.onopen = () => resolve(false);
            refused.onerror = () => resolve(true);
        });
        expect(closed).toBe(true);
    });

    it("slows down making room after room", async () => {
        await restart({ createsPerMinute: 2 });
        const client = await connect();
        for (let i = 0; i < 2; i++) {
            client.send({ t: "create", me: { name: "maker" } });
            await client.room();
        }
        client.send({ t: "create", me: { name: "maker" } });
        expect((await client.next("error")).message).toMatch(/Wait a minute/);
    });

    it("closes a room nobody's done anything in for a while", async () => {
        const { host, guests } = await party(1);
        relay.sweep(Date.now() + 29 * 60_000);
        expect(relay.roomCount).toBe(1);
        relay.sweep(Date.now() + 31 * 60_000);
        expect((await guests[0].next("gone")).reason).toBe("idle");
        expect((await host.next("gone")).reason).toBe("idle");
        expect(relay.roomCount).toBe(0);
    });

    it("drops a loadout too big to be real", async () => {
        const { host } = await party(0);
        host.send({ t: "me", loadout: { unlockedItems: ["x".repeat(20_000)] } });
        const { room } = await host.roomWhere(() => true);
        expect(room.members[0].loadout).toBeUndefined();
    });
});
