import {
    FriendsClient,
    INVITE_MS,
    PING_INTERVAL_MS,
    PONG_WAIT_MS,
    RECONNECT_FIRST_MS,
    RECONNECT_MAX_MS,
} from "./Friends";
import { FRIENDS_KEY, FriendsStore } from "./FriendsStore";

// A WebSocket that's open at once and keeps what's sent, for driving the
// friends' connection as a relay would (as in CoopLobbyRooms.test.ts)
class FakeSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static all: FakeSocket[] = [];

    readyState = FakeSocket.CONNECTING;
    sent: { t: string; [key: string]: unknown }[] = [];
    answersPings = true;
    onmessage?: ((event: { data: string }) => void) | null;
    onclose?: (() => void) | null;

    constructor(readonly url: string) {
        FakeSocket.all.push(this);
        queueMicrotask(() => {
            if (this.readyState === FakeSocket.CONNECTING) {
                this.readyState = FakeSocket.OPEN;
            }
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

    receive(message: object): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

const SECRET = "s".repeat(43);
const A = "AAAAAAAAAAAA";
const B = "BBBBBBBBBBBB";
const C = "CCCCCCCCCCCC";
const X = "XXXXXXXXXXXX";
const ME = "MMMMMMMMMMMM";
const ROOM = {
    code: "ROOMCODE",
    name: "Amber Isle",
    mapId: "lumbridge",
    endless: false,
    hard: false,
    players: 1,
    max: 4,
};

function memory(data?: object) {
    const items = new Map<string, string>();
    if (data) {
        items.set(FRIENDS_KEY, JSON.stringify({ secret: SECRET, ...data }));
    }
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
    };
}

const friend = (id: string, name = "") => ({ id, name, addedAt: 1 });

function makeClient(data: object = { friends: [friend(A, "Alice"), friend(B, "Bob")] }) {
    const store = { set: vi.fn() };
    const client = new FriendsClient(store, new FriendsStore(memory(data)));
    const onInvite = vi.fn();
    const onRequest = vi.fn();
    const onFriendOnline = vi.fn();
    client.onInvite = onInvite;
    client.onRequest = onRequest;
    client.onFriendOnline = onFriendOnline;
    return { client, store, onInvite, onRequest, onFriendOnline };
}

// The relay's welcome on the latest connection, once it's open
async function welcome(extra: object = { friends: true }) {
    await vi.advanceTimersByTimeAsync(0);
    const relay = FakeSocket.all.at(-1)!;
    relay.receive({ t: "welcome", id: "c1", name: "Random Name", ...extra });
    return relay;
}

async function online(data?: object) {
    const made = makeClient(data);
    made.client.start();
    const relay = await welcome();
    relay.receive({ t: "identity", friendId: ME, name: "Random Name" });
    return { ...made, relay };
}

const presence = (friends: object[], full = false) => ({
    t: "presence",
    friends,
    ...(full && { full: true }),
});

describe("the friends' connection", () => {
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
            addEventListener: () => {},
            removeEventListener: () => {},
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("stays dormant for good on a relay without friends", async () => {
        const { client } = makeClient();
        client.start();
        const relay = await welcome({});
        expect(relay.readyState).toBe(FakeSocket.CLOSED);
        expect(relay.sent).toEqual([]);
        expect(client.view).toMatchObject({ supported: false, status: "off" });
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(FakeSocket.all).toHaveLength(1);
    });

    it("doesn't connect until started, and survives no WebSocket at all", async () => {
        const { client } = makeClient();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(FakeSocket.all).toHaveLength(0);
        vi.stubGlobal("WebSocket", undefined);
        expect(() => client.start()).not.toThrow();
        expect(client.view.status).toBe("connecting");
        client.close();
        expect(client.view.status).toBe("off");
    });

    it("says hello, then the list, then where this player is", async () => {
        const { client } = makeClient({ name: "Zezima", friends: [friend(A)] });
        client.setSolo(true);
        client.start();
        const relay = await welcome();
        expect(relay.sent).toEqual([
            { t: "hello", secret: SECRET, name: "Zezima", presence: true },
            { t: "friends", ids: [A] },
            { t: "status", solo: true },
        ]);
        expect(client.view).toMatchObject({ supported: true, status: "online" });
    });

    it("tells the relay where this player is only when it changes", async () => {
        const { client, relay } = await online();
        client.setSolo(false);
        client.setSolo(true);
        client.setSolo(true);
        client.setSolo(false);
        expect(relay.sent.filter((m) => m.t === "status").map((m) => m.solo)).toEqual([
            false,
            true,
            false,
        ]);
    });

    it("merges presence into the list: full, then changes", async () => {
        const { client, relay, onFriendOnline } = await online({
            friends: [friend(A, "Alice"), friend(B, "Bob"), friend(C)],
        });
        relay.receive(
            presence(
                [
                    { id: B, online: true, name: "Bob", state: "menu" },
                    { id: A, online: true, name: "Alicia", state: "room", room: ROOM },
                    // Not on the list: nothing of them
                    { id: X, online: true, name: "Stranger", state: "menu" },
                ],
                true,
            ),
        );
        let view = client.view;
        // A joinable room first, then online, then the rest
        expect(view.friends.map((f) => [f.id, f.online, f.pending])).toEqual([
            [A, true, false],
            [B, true, false],
            [C, false, true],
        ]);
        expect(view.friends[0]).toMatchObject({ name: "Alicia", room: ROOM, state: "room" });
        // Unknown name: the code, as shown
        expect(view.friends[2].name).toBe("CCCC-CCCC-CCCC");
        // The page's first full presence pops up nobody
        expect(onFriendOnline).not.toHaveBeenCalled();
        // Seen and their name, kept
        expect(client.data.data.friends.find((f) => f.id === A)).toMatchObject({
            name: "Alicia",
            seen: true,
        });

        relay.receive(presence([{ id: A, online: false }]));
        view = client.view;
        expect(view.friends.map((f) => [f.id, f.online, f.pending])).toEqual([
            [B, true, false],
            // Offline, but they've added this game: not pending
            [A, false, false],
            [C, false, true],
        ]);
        relay.receive(presence([{ id: C, online: true, name: "Carol", state: "solo" }]));
        expect(onFriendOnline).toHaveBeenCalledExactlyOnceWith({ id: C, name: "Carol" });
        expect(client.view.friends.find((f) => f.id === C)).toMatchObject({
            online: true,
            pending: false,
            state: "solo",
        });
        // A full one without B: B's off
        relay.receive(presence([{ id: C, online: true, name: "Carol", state: "menu" }], true));
        expect(client.view.friends.filter((f) => f.online).map((f) => f.id)).toEqual([C]);
        expect(client.view.popups.map((p) => [p.kind, p.from.id])).toEqual([["online", C]]);
    });

    it("keeps requests once each, hides ignored ones, and adding is accepting", async () => {
        const { client, relay, onRequest } = await online({
            friends: [friend(A)],
            ignored: [C],
        });
        relay.receive({ t: "friendRequest", from: { id: X, name: "Xena" } });
        relay.receive({ t: "friendRequest", from: { id: X, name: "Xena" } });
        relay.receive({ t: "friendRequest", from: { id: C, name: "Ignored" } });
        relay.receive({ t: "friendRequest", from: { id: A, name: "Already" } });
        expect(client.view.requests).toEqual([{ id: X, name: "Xena" }]);
        expect(onRequest).toHaveBeenCalledOnce();

        expect(client.acceptRequest(X)).toBe("added");
        expect(client.view.requests).toEqual([]);
        expect(client.view.friends.find((f) => f.id === X)).toMatchObject({
            name: "Xena",
            pending: true,
        });
        expect(client.view.popups).toEqual([]);
        // The list goes to the relay a moment later, once for a burst
        client.addFriend(B);
        await vi.advanceTimersByTimeAsync(1500);
        expect(relay.sent.filter((m) => m.t === "friends").at(-1)).toEqual({
            t: "friends",
            ids: [A, X, B],
        });
        expect(relay.sent.filter((m) => m.t === "friends")).toHaveLength(2);

        relay.receive({ t: "friendRequest", from: { id: "YYYYYYYYYYYY", name: "Yan" } });
        client.ignoreRequest("YYYYYYYYYYYY");
        expect(client.view.requests).toEqual([]);
        expect(client.data.data.ignored).toContain("YYYYYYYYYYYY");
        // Added later by their code, they're let through again
        expect(client.addFriend("yyyy-yyyy-yyyy")).toBe("added");
        expect(client.data.data.ignored).not.toContain("YYYYYYYYYYYY");
    });

    it("doesn't take a removed friend's request back, till they're added again", async () => {
        const { client, relay, onRequest } = await online();
        relay.receive(presence([{ id: A, online: true, name: "Alice", state: "menu" }], true));
        client.removeFriend(A);
        // The relay's at once, as Alice still lists this game
        relay.receive({ t: "friendRequest", from: { id: A, name: "Alice" } });
        expect(client.view.requests).toEqual([]);
        expect(client.view.friends.map((f) => f.id)).toEqual([B]);
        expect(onRequest).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1500);
        expect(relay.sent.filter((m) => m.t === "friends").at(-1)).toEqual({
            t: "friends",
            ids: [B],
        });
        expect(client.addFriend(A)).toBe("added");
        expect(client.data.data.ignored).toEqual([]);
    });

    it("says why a code wasn't added", async () => {
        const { client } = await online();
        expect(client.addFriend("not a code")).toBe("invalid");
        expect(client.addFriend("mmmm mmmm mmmm")).toBe("self");
        expect(client.addFriend(A)).toBe("already");
    });

    it("keeps one invite per friend, till it's taken, declined or too old", async () => {
        const { client, relay, onInvite } = await online();
        relay.receive(
            presence([{ id: A, online: true, name: "Alice", state: "room", room: ROOM }], true),
        );
        const invited = { t: "invited", from: { id: A, name: "Alice" }, room: ROOM };
        relay.receive(invited);
        relay.receive(invited);
        // Not from a stranger
        relay.receive({ ...invited, from: { id: X, name: "Xena" } });
        expect(client.view.invites).toHaveLength(1);
        expect(onInvite).toHaveBeenCalledOnce();
        expect(client.view.popups.map((p) => p.kind)).toEqual(["invite"]);

        // Another room of theirs replaces it
        const other = { ...ROOM, code: "OTHERONE", name: "Brass Bay" };
        relay.receive({ ...invited, room: other });
        expect(client.view.invites.map((i) => i.room.code)).toEqual(["OTHERONE"]);
        expect(onInvite).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(INVITE_MS);
        expect(client.view.invites).toEqual([]);
        expect(client.view.popups).toEqual([]);

        relay.receive(invited);
        client.declineInvite(A);
        expect(relay.sent.at(-1)).toEqual({ t: "decline", to: A, code: "ROOMCODE" });
        expect(client.view.invites).toEqual([]);

        relay.receive(invited);
        expect(client.takeInvite(A)).toBe("ROOMCODE");
        expect(client.takeInvite(A)).toBeUndefined();
        expect(client.view.invites).toEqual([]);
    });

    it("drops an invite when its friend goes offline or leaves the room", async () => {
        const { client, relay } = await online();
        const inRoom = { id: A, online: true, name: "Alice", state: "room", room: ROOM };
        relay.receive(presence([inRoom], true));
        const invited = { t: "invited", from: { id: A, name: "Alice" }, room: ROOM };
        relay.receive(invited);
        // Someone else's news, or theirs still in that room, keeps it
        relay.receive(presence([{ id: B, online: true, name: "Bob", state: "menu" }]));
        relay.receive(presence([{ ...inRoom, room: { ...ROOM, players: 2 } }]));
        expect(client.view.invites).toHaveLength(1);
        relay.receive(presence([{ id: A, online: false }]));
        expect(client.view.invites).toEqual([]);

        relay.receive(presence([inRoom]));
        relay.receive(invited);
        relay.receive(presence([{ ...inRoom, state: "run", room: { ...ROOM, code: undefined } }]));
        expect(client.view.invites).toEqual([]);

        // An invite-only room shows no code, but its name says it's the same
        relay.receive(presence([{ ...inRoom, room: { ...ROOM, code: undefined } }]));
        relay.receive(invited);
        relay.receive(presence([{ ...inRoom, room: { ...ROOM, code: undefined, players: 3 } }]));
        expect(client.view.invites).toHaveLength(1);
        relay.receive(presence([{ ...inRoom, state: "menu", room: undefined }]));
        expect(client.view.invites).toEqual([]);
    });

    it("comes back with backoff, says it all again, and pops nothing up twice", async () => {
        const { client, relay, onFriendOnline, onRequest, onInvite } = await online();
        relay.receive(presence([{ id: A, online: true, name: "Alice", state: "menu" }], true));
        relay.receive(presence([{ id: B, online: true, name: "Bob", state: "room", room: ROOM }]));
        relay.receive({ t: "friendRequest", from: { id: X, name: "Xena" } });
        relay.receive({ t: "invited", from: { id: B, name: "Bob" }, room: ROOM });
        expect(onFriendOnline).toHaveBeenCalledOnce();
        client.setSolo(true);

        relay.close();
        expect(client.view.status).toBe("connecting");
        // Shown offline meanwhile
        expect(client.view.friends.every((f) => !f.online)).toBe(true);
        await vi.advanceTimersByTimeAsync(RECONNECT_FIRST_MS);
        const again = await welcome();
        expect(again.sent).toEqual([
            { t: "hello", secret: SECRET, name: "Random Name", presence: true },
            { t: "friends", ids: [A, B] },
            { t: "status", solo: true },
        ]);
        again.receive(
            presence(
                [
                    { id: A, online: true, name: "Alice", state: "menu" },
                    { id: B, online: true, name: "Bob", state: "room", room: ROOM },
                ],
                true,
            ),
        );
        again.receive({ t: "friendRequest", from: { id: X, name: "Xena" } });
        again.receive({ t: "invited", from: { id: B, name: "Bob" }, room: ROOM });
        expect(onFriendOnline).toHaveBeenCalledOnce();
        expect(onRequest).toHaveBeenCalledOnce();
        expect(onInvite).toHaveBeenCalledOnce();
        expect(client.view.friends.every((f) => f.online)).toBe(true);
        expect(client.view.invites).toHaveLength(1);
    });

    it("waits longer after each try that fails, and starts again after one that works", async () => {
        const { relay } = await online();
        relay.close();
        const waits: number[] = [];
        for (let i = 0; i < 7; i++) {
            const before = FakeSocket.all.length;
            let waited = 0;
            while (FakeSocket.all.length === before) {
                await vi.advanceTimersByTimeAsync(1000);
                waited += 1000;
            }
            waits.push(waited);
            FakeSocket.all.at(-1)!.close();
        }
        expect(waits).toEqual([
            RECONNECT_FIRST_MS,
            4000,
            8000,
            16_000,
            32_000,
            RECONNECT_MAX_MS,
            RECONNECT_MAX_MS,
        ]);
        await vi.advanceTimersByTimeAsync(RECONNECT_MAX_MS);
        const again = await welcome();
        again.close();
        const before = FakeSocket.all.length;
        await vi.advanceTimersByTimeAsync(RECONNECT_FIRST_MS);
        expect(FakeSocket.all).toHaveLength(before + 1);
    });

    it("takes a connection with no answer to its ping for dead", async () => {
        const { relay } = await online();
        await vi.advanceTimersByTimeAsync(3 * PING_INTERVAL_MS);
        expect(relay.sent.filter((m) => m.t === "ping")).toHaveLength(3);
        expect(relay.readyState).not.toBe(FakeSocket.CLOSED);
        relay.answersPings = false;
        await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS + PONG_WAIT_MS);
        expect(relay.readyState).toBe(FakeSocket.CLOSED);
        await vi.advanceTimersByTimeAsync(RECONNECT_FIRST_MS);
        expect(FakeSocket.all).toHaveLength(2);
    });

    it("stops for good on close, timers and all", async () => {
        const { client, relay } = await online();
        relay.receive({ t: "invited", from: { id: A, name: "Alice" }, room: ROOM });
        client.close();
        expect(relay.readyState).toBe(FakeSocket.CLOSED);
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(FakeSocket.all).toHaveLength(1);
        expect(relay.sent.filter((m) => m.t === "ping")).toHaveLength(0);
    });

    it("keeps the name the relay gives, and one picked or made anew", async () => {
        const { client, relay } = await online({ friends: [] });
        // No name picked: the relay's is kept, for the next hello
        expect(client.data.data.name).toBe("Random Name");
        expect(client.view.name).toBe("Random Name");

        expect(client.setName("   ")).toBe(false);
        expect(client.setName("  Big   Bad  ")).toBe(true);
        expect(relay.sent.at(-1)).toEqual({ t: "name", name: "Big Bad" });
        relay.receive({ t: "named", name: "Big Bad" });
        expect(client.view).toMatchObject({ name: "Big Bad", pickedName: "Big Bad" });

        // New name, on the lobby's connection
        client.rememberName("Lucky Cow");
        expect(relay.sent.at(-1)).toEqual({ t: "name", name: "Lucky Cow" });
        expect(client.data.data.name).toBe("Lucky Cow");
        relay.receive({ t: "named", name: "Lucky Cow" });
        const sent = relay.sent.length;
        client.rememberName("Lucky Cow");
        expect(relay.sent).toHaveLength(sent);

        relay.receive({ t: "error", message: "That name isn't allowed." });
        expect(client.view.notice).toBe("That name isn't allowed.");
    });

    it("notes recent players, never friends or itself", async () => {
        const { client } = await online();
        client.noteRecent([
            { friendId: A, name: "Alice" },
            { friendId: ME, name: "Me" },
            { friendId: X, name: "Xena" },
            { name: "No code" },
        ]);
        expect(client.view.recent.map((p) => p.id)).toEqual([X]);
    });

    it("drops this game's own code from its list", async () => {
        const { client } = await online({ friends: [friend(ME), friend(A)] });
        expect(client.view.friends.map((f) => f.id)).toEqual([A]);
    });
});
