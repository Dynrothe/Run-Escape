// Friends end to end: the real relay (server/coop-relay.mjs) in this process, and the game's own
// FriendsClient and CoopLobby talking to it over real WebSockets, a few players at once. Each
// half's other tests only ever meet a fake of the other; these are where they meet each other.
//
// Each player has a browser of their own: their own storage (FriendsStore takes it), their own
// store for the UI's views, and their lobby given their friends' identity, as GameClient does.
// What they share is only what a page has anyway: window (its timers, and a location that points
// getRelayUrl at this relay) and the WebSocket Node has.
//
// A relay without friends isn't here: it would mean writing a WebSocket server. The fake-socket
// tests cover it: Friends.test.ts ("stays dormant for good on a relay without friends") and
// CoopLobbyRooms.test.ts ("says hello first, and only to a relay that has friends").
import { Server, createServer } from "node:http";
import { AddressInfo, Socket } from "node:net";

import { RELAY_PATH, createRelay } from "../../../../server/coop-relay.mjs";
import type { GameStore } from "../GameStore";
import { CoopLobby, CoopView, OFFLINE } from "./CoopLobby";
import { FriendView, FriendsClient, FriendsView } from "./Friends";
import { FRIENDS_KEY, FriendsStore } from "./FriendsStore";
import { GameStart, MAX_CHAT_LENGTH, formatFriendCode } from "./protocol";

// Generous: the release machine is slow, and every step here is real sockets and timers
const WAIT_MS = 20_000;
const TEST_MS = 120_000;

// Waits till check stops throwing (its expects hold), on real timers
function until<T>(check: () => T): Promise<T> {
    return vi.waitFor(check, { timeout: WAIT_MS, interval: 10 });
}

// One browser's localStorage
function memoryStorage() {
    const items = new Map<string, string>();
    return {
        items,
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
    };
}

// What the UI reads of a player (UiSnapshot's friends and coop)
type Views = { friends: FriendsView; coop: CoopView };

// Every connection made to the relay, its side of it, in order
const upgraded: Socket[] = [];
const players: Player[] = [];

class Player {
    readonly storage = memoryStorage();
    readonly views = { coop: OFFLINE } as Views;
    friends!: FriendsClient;
    lobby?: CoopLobby;
    // Their friend code, once the relay's said it
    code = "";
    // Their presence connection, on the relay's side
    relaySocket?: Socket;
    private readonly store = {
        set: (changes: Partial<Views>) => Object.assign(this.views, changes),
    } as unknown as GameStore;

    constructor(readonly label: string) {
        players.push(this);
    }

    // The friends' client, as the page opens (or opens again, on the same storage), not connected
    makeFriends(): FriendsClient {
        this.friends?.close();
        this.friends = new FriendsClient(this.store, new FriendsStore(this.storage));
        return this.friends;
    }

    // And connected, as once the relay's known to have friends. made: the one makeFriends made
    async start(made = false): Promise<this> {
        const before = upgraded.length;
        if (!made) {
            this.makeFriends();
        }
        this.friends.start();
        await until(() =>
            expect(this.views.friends).toMatchObject({
                supported: true,
                status: "online",
                myCode: expect.any(String),
            }),
        );
        this.code = this.views.friends.myCode!;
        this.relaySocket = upgraded[before];
        return this;
    }

    get name(): string {
        return this.views.friends.name;
    }

    get coop(): CoopView {
        return this.views.coop;
    }

    // Another player, as this one's friends list shows them
    sees(other: Player): FriendView | undefined {
        return this.views.friends.friends.find((f) => f.id === other.code);
    }

    popups(): string[] {
        return this.views.friends.popups.map((p) => `${p.kind} ${p.from.id}`);
    }

    // The co-op screen, as GameClient wires it
    async openLobby(): Promise<CoopLobby> {
        const lobby = new CoopLobby(this.store, this.friends.identity);
        lobby.onNamed = (name) => this.friends.rememberName(name);
        lobby.onDeclined = (from) => this.friends.noteDeclined(from);
        this.lobby = lobby;
        await lobby.connect();
        await until(() =>
            expect(this.coop).toMatchObject({
                status: "online",
                friends: true,
                myCode: this.code || expect.any(String),
            }),
        );
        return lobby;
    }

    // As GameClient.setPlayerName does it
    setName(text: string): boolean {
        if (!this.friends.setName(text)) {
            return false;
        }
        if (!this.lobby?.room?.started) {
            this.lobby?.setName(text);
        }
        return true;
    }

    // Everything closed, as when the page goes
    close(): void {
        this.lobby?.close();
        this.friends?.close();
    }
}

async function started(...labels: string[]): Promise<Player[]> {
    const made: Player[] = [];
    // One at a time, so each one's relay socket is known
    for (const label of labels) {
        made.push(await new Player(label).start());
    }
    return made;
}

// a adds b, b accepts the request: friends both ways
async function befriend(a: Player, b: Player): Promise<void> {
    expect(a.friends.addFriend(b.code)).toBe("added");
    await until(() => expect(b.views.friends.requests.map((r) => r.id)).toContain(a.code));
    expect(b.friends.acceptRequest(a.code)).toBe("added");
    await until(() => {
        expect(a.sees(b)).toMatchObject({ online: true, pending: false });
        expect(b.sees(a)).toMatchObject({ online: true, pending: false });
    });
}

// host makes a room (access as CoopLobby.create takes it), guest gets in by its code
async function roomOf(host: Player, friends = true): Promise<string> {
    const lobby = host.lobby ?? (await host.openLobby());
    lobby.create(false, "lumbridge", false, false, friends);
    await until(() => expect(host.coop.room).toBeDefined());
    return host.coop.room!.code;
}

async function join(guest: Player, code: string, host: Player): Promise<void> {
    const lobby = guest.lobby ?? (await guest.openLobby());
    lobby.join(code);
    await until(() => {
        expect(guest.coop.room?.code).toBe(code);
        expect(host.coop.room?.members).toHaveLength(2);
    });
}

// The smallest start the host's game would send: everyone in the room, as they are
function gameOf(lobby: CoopLobby): GameStart {
    const room = lobby.room!;
    return {
        seed: 1,
        mapId: room.mapId,
        endless: room.endless,
        hard: room.hard,
        heroes: room.members.map((m) => ({
            id: m.id,
            name: m.name,
            characterId: m.characterId || "warrior",
            loadout: { metaStats: {}, unlockedItems: [], armoury: {} },
        })),
    };
}

describe("friends, the game against the real relay", () => {
    let relay: ReturnType<typeof createRelay>;
    let server: Server;

    // Out of the way of what's tested: every player's on one address, maps are anyone's, and
    // presence and rooms go out at once
    const LIMITS = {
        connectionsPerAddress: 1000,
        roomsPerAddress: 1000,
        connectionsPerNetwork: 1000,
        roomsPerNetwork: 1000,
        createsPerMinute: 1000,
        joinsPerMinute: 1000,
        roomUpdateMs: 5,
        presenceMs: 20,
        listPushMs: 20,
        anyMap: true,
        metrics: false,
        metricsPort: 0,
    };

    beforeEach(async () => {
        relay = createRelay(LIMITS);
        server = createServer((req, res) => {
            if (!relay.handleRequest(req, res)) {
                res.writeHead(404);
                res.end();
            }
        });
        relay.attach(server, RELAY_PATH, { closeOthers: true });
        server.on("upgrade", (_req, socket) => upgraded.push(socket as Socket));
        await new Promise<void>((resolve) => server.listen(0, resolve));
        const { port } = server.address() as AddressInfo;
        vi.stubEnv("VITE_COOP_URL", "");
        vi.stubGlobal("window", {
            // coop beside the page: the relay's path
            location: { href: `http://localhost:${port}/` },
            setTimeout: (f: () => void, ms?: number) => setTimeout(f, ms),
            clearTimeout: (id?: ReturnType<typeof setTimeout>) => clearTimeout(id),
            setInterval: (f: () => void, ms?: number) => setInterval(f, ms),
            clearInterval: (id?: ReturnType<typeof setInterval>) => clearInterval(id),
            addEventListener: () => {},
            removeEventListener: () => {},
        });
    });

    afterEach(async () => {
        for (const player of players.splice(0)) {
            player.close();
        }
        relay.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        upgraded.length = 0;
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it(
        "gives each player a code of their own, the same after a dropped connection or a reload",
        async () => {
            const [a, b] = await started("a", "b");
            expect(a.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{12}$/);
            expect(b.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{12}$/);
            expect(a.code).not.toBe(b.code);
            // The relay's name for them, kept for the next hello
            expect(a.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
            expect(a.views.friends.pickedName).toBe(a.name);
            const secret = JSON.parse(a.storage.items.get(FRIENDS_KEY)!).secret;

            // The relay's HTTP check says it has friends, which is how GameClient starts them
            const lobby = new CoopLobby({ set: () => {} } as unknown as GameStore);
            expect(await lobby.checkAvailable()).toBe(true);
            expect(lobby.probedFriends).toBe(true);

            // Dropped on the relay's side: back after a while, the same code and name
            const name = a.name;
            a.relaySocket!.destroy();
            await until(() => expect(a.views.friends.status).toBe("connecting"));
            await until(() => expect(a.views.friends.status).toBe("online"));
            expect(a.views.friends).toMatchObject({ myCode: a.code, name });

            // The page again, on the same storage
            const code = a.code;
            await a.start();
            expect(a.code).toBe(code);
            expect(a.name).toBe(name);
            expect(JSON.parse(a.storage.items.get(FRIENDS_KEY)!).secret).toBe(secret);
        },
        TEST_MS,
    );

    it(
        "makes friends of two players once each has the other's code, popping up each thing once",
        async () => {
            const [a, b] = await started("a", "b");
            expect(a.friends.addFriend(formatFriendCode(b.code).toLowerCase())).toBe("added");
            expect(a.sees(b)).toEqual({
                id: b.code,
                name: formatFriendCode(b.code),
                online: false,
                pending: true,
            });
            await until(() =>
                expect(b.views.friends.requests).toEqual([{ id: a.code, name: a.name }]),
            );
            expect(b.popups()).toEqual([`request ${a.code}`]);
            // Still nothing of b for a
            expect(a.sees(b)).toMatchObject({ online: false, pending: true });

            expect(b.friends.acceptRequest(a.code)).toBe("added");
            await until(() => {
                expect(a.sees(b)).toEqual({
                    id: b.code,
                    name: b.name,
                    online: true,
                    state: "menu",
                    pending: false,
                });
                expect(b.sees(a)).toEqual({
                    id: a.code,
                    name: a.name,
                    online: true,
                    state: "menu",
                    pending: false,
                });
            });
            expect(b.views.friends.requests).toEqual([]);
            // Something else for each to hear, so anything still on its way has come
            a.friends.setSolo(true);
            b.friends.setSolo(true);
            await until(() => {
                expect(a.sees(b)?.state).toBe("solo");
                expect(b.sees(a)?.state).toBe("solo");
            });
            // Each has the other come online, once; the request's gone with its answer
            expect(a.popups()).toEqual([`online ${b.code}`]);
            expect(b.popups()).toEqual([`online ${a.code}`]);
            // Kept: they're mutual, by name
            expect(a.friends.data.data.friends).toEqual([
                expect.objectContaining({ id: b.code, name: b.name, seen: true }),
            ]);
        },
        TEST_MS,
    );

    it(
        "tells someone who lists a player, and isn't listed back, nothing of them",
        async () => {
            const [a, b, c] = await started("a", "b", "c");
            await befriend(a, b);
            expect(c.friends.addFriend(a.code)).toBe("added");
            // a hears c's asked: that's all
            await until(() =>
                expect(a.views.friends.requests).toEqual([{ id: c.code, name: c.name }]),
            );

            // a in an open room, a friend sees it
            await roomOf(a);
            a.lobby!.setAccess(true, true);
            await until(() => expect(b.sees(a)?.room?.code).toBe(a.coop.room!.code));
            // a's invite to c can't go: c's not a friend of a's
            a.lobby!.invite(c.code);
            await until(() => expect(a.coop.error).toBe("You can only invite your friends."));
            // c's to a can't either, and says only what it would of someone off
            await roomOf(c);
            c.lobby!.invite(a.code);
            await until(() => expect(c.coop.error).toBe("That friend isn't online."));
            // Something new of a's that a friend hears, so anything c was due has come too
            a.lobby!.setMap("draynor", false, false);
            await until(() => expect(b.sees(a)?.room?.mapId).toBe("draynor"));

            expect(a.views.friends.friends.map((f) => f.id)).toEqual([b.code]);
            expect(a.views.friends.invites).toEqual([]);
            expect(c.sees(a)).toEqual({
                id: a.code,
                name: formatFriendCode(a.code),
                online: false,
                pending: true,
            });
            expect(c.friends.friendRoom(a.code)).toBeUndefined();
            expect(c.views.friends).toMatchObject({ requests: [], invites: [], popups: [] });
            expect(c.friends.data.data.friends).toEqual([
                { id: a.code, name: "", addedAt: expect.any(Number) },
            ]);
        },
        TEST_MS,
    );

    it(
        "shows a friend's room, with its code only while it's for friends or open",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            await roomOf(a, false);
            const room = a.coop.room!;
            expect(room).toMatchObject({ open: false, friends: false });
            const shown = {
                name: room.name,
                mapId: "lumbridge",
                endless: false,
                hard: false,
                players: 1,
                max: 4,
            };
            await until(() =>
                expect(b.sees(a)).toMatchObject({ online: true, state: "room", room: shown }),
            );
            expect(b.sees(a)!.room).not.toHaveProperty("code");
            expect(b.friends.friendRoom(a.code)).toBeUndefined();

            a.lobby!.setAccess(false, true);
            await until(() => expect(b.sees(a)?.room).toEqual({ ...shown, code: room.code }));
            expect(a.coop.room).toMatchObject({ open: false, friends: true });
            expect(b.friends.friendRoom(a.code)).toBe(room.code);

            // Open: still its code. The map after, so b's heard of both once it has the map.
            a.lobby!.setAccess(true, true);
            a.lobby!.setMap("draynor", false, false);
            await until(() =>
                expect(b.sees(a)?.room).toEqual({ ...shown, mapId: "draynor", code: room.code }),
            );
            expect(a.coop.room).toMatchObject({ open: true, friends: true });

            a.lobby!.setAccess(false, false);
            await until(() => expect(b.sees(a)?.room).toEqual({ ...shown, mapId: "draynor" }));
            expect(b.sees(a)?.state).toBe("room");
            expect(b.friends.friendRoom(a.code)).toBeUndefined();
        },
        TEST_MS,
    );

    it(
        "invites a friend, hears their no thanks, and says when it's too soon to ask again",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            await roomOf(a, false);
            const room = a.coop.room!;
            expect(a.lobby!.invite(b.code)).toBe(true);
            await until(() => expect(a.coop.invited).toEqual({ [b.code]: "sent" }));
            await until(() => expect(b.views.friends.invites).toHaveLength(1));
            expect(b.views.friends.invites[0]).toMatchObject({
                from: { id: a.code, name: a.name },
                room: { code: room.code, name: room.name, players: 1, max: 4 },
            });
            expect(b.views.friends.popups.filter((p) => p.kind === "invite")).toEqual([
                expect.objectContaining({
                    from: { id: a.code, name: a.name },
                    room: expect.objectContaining({ code: room.code }),
                }),
            ]);

            b.friends.declineInvite(a.code);
            expect(b.views.friends.invites).toEqual([]);
            expect(b.popups()).not.toContain(`invite ${a.code}`);
            await until(() => expect(a.coop.invited).toEqual({ [b.code]: "declined" }));
            expect(a.popups()).toContain(`declined ${b.code}`);

            // Again at once: the relay's own words
            a.lobby!.invite(b.code);
            await until(() =>
                expect(a.coop.error).toBe("You've just invited them. Give them a few seconds."),
            );
            expect(a.coop.invited).toEqual({});
            expect(b.views.friends.invites).toEqual([]);
        },
        TEST_MS,
    );

    it(
        "takes a friend into the room by an invite, with who they are, and no invite to it after",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            await roomOf(a, false);
            a.lobby!.invite(b.code);
            await until(() => expect(b.views.friends.invites).toHaveLength(1));
            const code = b.friends.takeInvite(a.code);
            expect(code).toBe(a.coop.room!.code);
            expect(b.views.friends.invites).toEqual([]);
            await join(b, code!, a);

            for (const player of [a, b]) {
                expect(player.coop.room!.members.map((m) => [m.friendId, m.name])).toEqual([
                    [a.code, a.name],
                    [b.code, b.name],
                ]);
            }
            const shown = { name: a.coop.room!.name, players: 2, max: 4 };
            await until(() => {
                expect(a.sees(b)).toMatchObject({ state: "room", room: shown });
                expect(b.sees(a)).toMatchObject({ state: "room", room: shown });
            });
            // Invite only: no code for friends, even those in it
            expect(a.sees(b)!.room).not.toHaveProperty("code");

            a.lobby!.invite(b.code);
            await until(() => expect(a.coop.error).toBe("That friend's already in your room."));
        },
        TEST_MS,
    );

    it(
        "takes a friend into a room for friends by its code in their presence",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            await roomOf(a, true);
            await until(() => expect(b.friends.friendRoom(a.code)).toBe(a.coop.room!.code));
            await join(b, b.friends.friendRoom(a.code)!, a);
            await until(() =>
                expect(b.sees(a)?.room).toMatchObject({ code: a.coop.room!.code, players: 2 }),
            );
        },
        TEST_MS,
    );

    it(
        "takes a picked name everywhere, cleaned as the relay keeps it",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            await join(b, await roomOf(a), a);

            // Each is the relay's, and what a's game keeps for its next hello
            const named = async (text: string, name: string) => {
                expect(a.setName(text)).toBe(true);
                await until(() => {
                    expect(a.friends.data.data.name).toBe(name);
                    expect(a.views.friends).toMatchObject({ name, pickedName: name });
                    expect(a.coop.name).toBe(name);
                    expect(b.sees(a)?.name).toBe(name);
                    for (const player of [a, b]) {
                        expect(player.coop.room!.members[0]).toMatchObject({
                            friendId: a.code,
                            name,
                        });
                    }
                });
                expect(JSON.parse(a.storage.items.get(FRIENDS_KEY)!).name).toBe(name);
            };
            await named("  Zed\u0007 the\u0000  Great ", "Zed the Great");
            await named("W".repeat(30), "W".repeat(20));
            // Twenty characters, as protocol.ts counts them: an emoji's one
            await named("a".repeat(19) + "\u{1F600}\u{1F600}", "a".repeat(19) + "\u{1F600}");
            // Nothing a name can be made of: refused here, as the relay would ignore it
            expect(a.setName("\u0000​\u0007")).toBe(false);
            expect(a.friends.data.data.name).toBe("a".repeat(19) + "\u{1F600}");
        },
        TEST_MS,
    );

    it(
        "gives a first visit by an invite link one name, though its lobby says hello first",
        async () => {
            const [b] = await started("b");
            // A page opened on ?room=: the co-op screen connects before friends do, and nothing's
            // kept yet, so the lobby's hello has no name
            const a = new Player("a");
            a.makeFriends();
            await a.openLobby();
            await a.start(true);
            expect(a.code).toBe(a.coop.myCode);
            await roomOf(a);
            expect(a.friends.addFriend(b.code)).toBe("added");
            await until(() => expect(b.views.friends.requests).toHaveLength(1));
            // One name, whoever's asking
            const name = a.views.friends.name;
            expect(a.coop.name).toBe(name);
            expect(a.coop.room!.members[0].name).toBe(name);
            expect(b.views.friends.requests[0]).toEqual({ id: a.code, name });
            b.friends.acceptRequest(a.code);
            await until(() => expect(b.sees(a)).toMatchObject({ online: true, name }));
        },
        TEST_MS,
    );

    it(
        "has a request wait for a player who's off till they're on",
        async () => {
            const [a] = await started("a");
            const b = new Player("b");
            // b's code, from b's game before: their storage, with nobody on
            await b.start();
            const code = b.code;
            b.friends.close();
            expect(a.friends.addFriend(code)).toBe("added");
            await b.start();
            await until(() =>
                expect(b.views.friends.requests).toEqual([{ id: a.code, name: a.name }]),
            );
            expect(b.popups()).toEqual([`request ${a.code}`]);
            expect(a.sees(b)).toMatchObject({ online: false, pending: true });
        },
        TEST_MS,
    );

    it(
        "passes a room's chat round, whose and in order, cut short, and slows a flood",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            await join(b, await roomOf(a), a);

            expect(a.lobby!.sendChat("hello from a")).toBe(true);
            await until(() => expect(b.coop.chat).toHaveLength(1));
            expect(b.lobby!.sendChat("  hi a  ")).toBe(true);
            await until(() => expect(a.coop.chat).toHaveLength(2));
            await until(() => expect(b.coop.chat).toHaveLength(2));
            const lines = (player: Player) =>
                player.coop.chat.map((line) => [line.name, line.text, line.mine]);
            expect(lines(a)).toEqual([
                [a.name, "hello from a", true],
                [b.name, "hi a", false],
            ]);
            expect(lines(b)).toEqual([
                [a.name, "hello from a", false],
                [b.name, "hi a", true],
            ]);

            a.lobby!.sendChat("x".repeat(MAX_CHAT_LENGTH + 50));
            await until(() => expect(b.coop.chat).toHaveLength(3));
            expect(b.coop.chat[2].text).toBe("x".repeat(MAX_CHAT_LENGTH));

            // A flood: the relay takes so many in ten seconds, and drops the rest without a word
            for (let i = 0; i < 10; i++) {
                a.lobby!.sendChat(`line ${i}`);
            }
            // Said after them on a's connection, so they've all come by the time it has
            a.lobby!.setMap("draynor", false, false);
            await until(() => expect(a.coop.room?.mapId).toBe("draynor"));
            const fromA = a.coop.chat.filter((line) => line.mine);
            expect(fromA).toHaveLength(8);
            expect(fromA.at(-1)!.text).toBe("line 5");
            // Still connected, and still talking
            b.lobby!.sendChat("still here?");
            await until(() => expect(a.coop.chat.at(-1)?.text).toBe("still here?"));
            expect(a.coop.status).toBe("online");
            expect(a.coop.chat.map((line) => line.id)).toEqual(
                [...a.coop.chat.map((line) => line.id)].sort((x, y) => x - y),
            );
        },
        TEST_MS,
    );

    it(
        "shows a friend's run, with no code, and back to the room and the menus after",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            const code = await roomOf(a, true);
            await join(b, code, a);
            const starts: GameStart[] = [];
            b.lobby!.onStart = (game) => starts.push(game);

            a.lobby!.start(gameOf(a.lobby!));
            await until(() => {
                expect(b.sees(a)).toMatchObject({ state: "run", room: { players: 2 } });
                expect(a.sees(b)).toMatchObject({ state: "run", room: { players: 2 } });
            });
            expect(b.sees(a)!.room).not.toHaveProperty("code");
            expect(b.friends.friendRoom(a.code)).toBeUndefined();
            expect(starts).toHaveLength(1);
            // A name picked mid-run: friends hear it now, the room once the run's over
            const before = a.name;
            expect(a.setName("Mid Run")).toBe(true);
            await until(() => expect(b.sees(a)?.name).toBe("Mid Run"));
            expect(b.coop.room!.members[0].name).toBe(before);

            a.lobby!.end();
            await until(() =>
                expect(b.sees(a)).toMatchObject({ state: "room", room: { code, players: 2 } }),
            );
            await until(() => {
                expect(a.coop.name).toBe("Mid Run");
                for (const player of [a, b]) {
                    expect(player.coop.room!.members[0].name).toBe("Mid Run");
                }
            });
            expect(a.views.friends).toMatchObject({ name: "Mid Run", pickedName: "Mid Run" });
            b.lobby!.leave();
            await until(() => expect(a.sees(b)).toMatchObject({ state: "menu" }));
            expect(a.sees(b)).not.toHaveProperty("room");

            // Again, and the host goes mid-run: the room's over for both
            await join(b, code, a);
            a.lobby!.start(gameOf(a.lobby!));
            await until(() => expect(b.sees(a)?.state).toBe("run"));
            a.lobby!.leave();
            await until(() => {
                expect(b.sees(a)).toMatchObject({ state: "menu" });
                expect(a.sees(b)).toMatchObject({ state: "menu" });
                expect(b.coop.room).toBeUndefined();
            });
        },
        TEST_MS,
    );

    it(
        "shows a friend on a run of their own",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            a.friends.setSolo(true);
            await until(() => expect(b.sees(a)?.state).toBe("solo"));
            a.friends.setSolo(false);
            await until(() => expect(b.sees(a)?.state).toBe("menu"));
        },
        TEST_MS,
    );

    it(
        "shows a friend going offline, drops their invite, and pops up their return once",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            await roomOf(b, false);
            b.lobby!.invite(a.code);
            await until(() => expect(a.views.friends.invites).toHaveLength(1));
            expect(a.popups()).toContain(`invite ${b.code}`);
            const online = () => a.popups().filter((p) => p === `online ${b.code}`).length;
            const before = online();

            b.close();
            await until(() => expect(a.sees(b)).toMatchObject({ online: false, pending: false }));
            expect(a.sees(b)).not.toHaveProperty("state");
            expect(a.views.friends.invites).toEqual([]);
            expect(a.popups()).not.toContain(`invite ${b.code}`);

            await b.start();
            await until(() => expect(a.sees(b)).toMatchObject({ online: true, state: "menu" }));
            b.friends.setSolo(true);
            await until(() => expect(a.sees(b)?.state).toBe("solo"));
            expect(online()).toBe(before + 1);
        },
        TEST_MS,
    );

    it(
        "unfriends both ways when one removes the other, and friends again when they add back",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            a.friends.removeFriend(b.code);
            expect(a.sees(b)).toBeUndefined();
            await until(() => expect(b.sees(a)).toMatchObject({ online: false, pending: false }));
            expect(b.sees(a)).not.toHaveProperty("state");

            // Added back: a's list goes after the relay's request from b (b still lists a), on
            // the same connection, so that's been and gone by the time a hears b's on
            expect(a.friends.addFriend(b.code)).toBe("added");
            await until(() => {
                expect(a.sees(b)).toMatchObject({ online: true, state: "menu" });
                expect(b.sees(a)).toMatchObject({ online: true, state: "menu" });
            });
            expect(a.views.friends.requests).toEqual([]);
            expect(a.popups()).not.toContain(`request ${b.code}`);
            expect(a.friends.data.data.ignored).toEqual([]);
        },
        TEST_MS,
    );

    it(
        "keeps a presence connection open however long it idles, and not a lobby's in no room",
        async () => {
            const [a, b] = await started("a", "b");
            await befriend(a, b);
            await a.openLobby();
            relay.sweep(Date.now() + 24 * 60 * 60_000);
            await until(() => expect(a.coop.status).toBe("offline"));
            expect(a.views.friends.status).toBe("online");
            // Still hearing, and heard of
            b.friends.setSolo(true);
            await until(() => expect(a.sees(b)?.state).toBe("solo"));
            a.friends.setSolo(true);
            await until(() => expect(b.sees(a)?.state).toBe("solo"));
        },
        TEST_MS,
    );
});
