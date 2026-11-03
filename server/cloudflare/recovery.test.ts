import { Room } from "./src/room.mjs";

class Socket {
    static all: Socket[] = [];
    sent: any[] = [];
    closed?: number;
    constructor() {
        Socket.all.push(this);
    }
    accept() {}
    addEventListener() {}
    send(text: string) {
        this.sent.push(JSON.parse(text));
    }
    close(code: number) {
        this.closed = code;
    }
}

const env = {
    MULTIPLAYER_ANY_MAP: "on",
    LOBBY: {
        idFromName: (s: string) => s,
        get: () => ({ roomUpdate: async () => {}, roomGone: async () => {} }),
    },
};
const me = {
    characterId: "warrior",
    build: "original",
    recoveryVersion: 1,
    unlocks: { maps: ["lumbridge"] },
};
let data: any;
let failWrite = false;
let beforeWrite: (() => Promise<void>) | undefined;
let writes = 0;
async function loadRoom() {
    const ctx: any = {
        ready: Promise.resolve(),
        storage: {
            get: async () => structuredClone(data),
            put: async (_key: string, value: any) => {
                await beforeWrite?.();
                if (failWrite) throw new Error("storage unavailable");
                writes++;
                data = structuredClone(value);
            },
            setAlarm: async () => {},
            deleteAll: async () => {
                if (failWrite) throw new Error("storage unavailable");
                data = undefined;
            },
        },
        blockConcurrencyWhile: (f: () => Promise<unknown>) => {
            ctx.ready = ctx.ready.then(f);
            return ctx.ready;
        },
    };
    const room = new Room(ctx, env);
    await ctx.ready;
    return room;
}
async function party(capable = true) {
    const room = await loadRoom();
    room.code = "ABCDEFGH";
    const host = room.newMember({
        id: "p1",
        name: "Host",
        kind: "create",
        address: "a",
        roomName: "Room",
    });
    const guest = room.newMember({ id: "p2", name: "Guest", kind: "join", address: "b" });
    room.attach(host, new Socket());
    room.attach(guest, new Socket());
    await say(room, host, { t: "create", me });
    await say(room, guest, { t: "join", me: { ...me, recoveryVersion: capable ? 1 : undefined } });
    return { room, host, guest };
}
function say(room: any, member: any, message: object) {
    return room.receive(member, JSON.stringify(message));
}
function lost(room: any, member: any) {
    return room.atomic(() => room.lost(member, member.socket));
}
function resume(room: any, token: string, changes = {}) {
    const params = new URLSearchParams({
        protocol: "1",
        build: "original",
        runId: room.room?.recovery?.runId ?? "",
        ...changes,
    });
    return room.atomic(() => room.resume(token, params));
}
function control(room: any, member: any, fields: object) {
    return say(room, member, {
        runId: room.room.recovery.runId,
        epoch: room.recovery.epoch,
        ...fields,
    });
}
function resetObjectTimers() {
    const now = Date.now();
    vi.clearAllTimers();
    vi.setSystemTime(now);
}
async function started() {
    const p = await party();
    await say(p.room, p.host, { t: "start", game: {} });
    return p;
}

beforeEach(() => {
    data = undefined;
    failWrite = false;
    beforeWrite = undefined;
    writes = 0;
    Socket.all = [];
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    vi.stubGlobal(
        "WebSocketPair",
        class {
            0 = new Socket();
            1 = new Socket();
        },
    );
    vi.stubGlobal(
        "Response",
        class {
            constructor(
                _body: unknown,
                public init: any,
            ) {}
        },
    );
});
afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

test("saves issued seats, starts, kicks, ends and deletes without the cosmetic throttle", async () => {
    const { room, host, guest } = await party();
    expect(data.members).toHaveLength(2);
    expect(data.members[1].token).toBe(guest.token);
    await say(room, host, { t: "start", game: {} });
    expect(data.started).toBe(true);
    expect(data.recovery.protocol).toBe(1);
    await say(room, host, { t: "kick", id: guest.id });
    expect(data.members).toHaveLength(1);
    resetObjectTimers();
    const restored = await loadRoom();
    await resume(restored, guest.token);
    expect(Socket.all.at(-1)!.sent[0].t).toBe("error");
    await say(room, host, { t: "end" });
    expect(data.started).toBe(false);
    expect(data.recovery).toBeUndefined();
    await say(room, host, { t: "disband" });
    expect(data).toBeUndefined();
});

test("does not acknowledge a start before its durable write, or on a failed write", async () => {
    const { room, host } = await party();
    host.socket.sent = [];
    let release!: () => void;
    beforeWrite = () =>
        new Promise<void>((r) => {
            release = r;
        });
    const start = say(room, host, { t: "start", game: {} });
    await Promise.resolve();
    await Promise.resolve();
    expect(host.socket.sent).toEqual([]);
    expect(data.started).toBe(false);
    release();
    await start;
    expect(host.socket.sent.some((m: any) => m.t === "start")).toBe(true);
    beforeWrite = undefined;
    host.socket.sent = [];
    failWrite = true;
    await expect(say(room, host, { t: "end" })).rejects.toThrow("storage unavailable");
    expect(host.socket.sent).toEqual([]);
    expect(data.started).toBe(true);
});

test("legacy and mixed parties keep their original start and reconnect protocol", async () => {
    const { room, host, guest } = await party(false);
    await say(room, host, { t: "start", game: {} });
    expect(data.recovery).toBeUndefined();
    expect(host.socket.sent.find((m: any) => m.t === "start").recovery).toBeUndefined();
    await lost(room, guest);
    expect(host.socket.sent.some((m: any) => m.t === "recovering")).toBe(false);
    await room.atomic(() => room.resume(guest.token));
    expect(guest.socket.sent.at(-1).t).toBe("room");
});

test("legacy seat deadlines survive a reset too", async () => {
    const { room, guest } = await party(false);
    await lost(room, guest);
    const deadline = data.members[1].awayUntil;
    await vi.advanceTimersByTimeAsync(14_000);
    resetObjectTimers();
    const restored = await loadRoom();
    expect(data.members[1].awayUntil).toBe(deadline);
    await vi.advanceTimersByTimeAsync(1001);
    await resume(restored, guest.token);
    expect(Socket.all.at(-1)!.sent[0].t).toBe("error");
});

test("preserves the fixed 60 second deadline across retries and repeated resets", async () => {
    const { room, host, guest } = await started();
    await lost(room, host);
    expect(data.recovery.deadline).toBe(160_000);
    await vi.advanceTimersByTimeAsync(20_000);
    resetObjectTimers();
    let restored = await loadRoom();
    expect(data.recovery.deadline).toBe(160_000);
    await resume(restored, guest.token);
    expect(
        restored.room.members[1].socket.sent.find((m: any) => m.t === "recovering"),
    ).toMatchObject({
        t: "recovering",
        remainingMs: 40_000,
    });
    await vi.advanceTimersByTimeAsync(20_000);
    resetObjectTimers();
    restored = await loadRoom();
    expect(data.recovery.deadline).toBe(160_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(restored.room).toBeUndefined();
    expect(data).toBeUndefined();
});

test("an unannounced reset starts recovery and persists its deadline before accepting resumes", async () => {
    const { host, guest } = await started();
    resetObjectTimers();
    const restored = await loadRoom();
    expect(data.recovery.deadline).toBe(160_000);
    await resume(restored, guest.token);
    expect(restored.room.members[1].socket.sent.some((m: any) => m.t === "recoverySync")).toBe(
        true,
    );
    await control(restored, restored.room.members[1], { t: "recoveryState", frame: 10, hash: 1 });
    await resume(restored, host.token);
    expect(restored.room.members.every((m: any) => m.socket.sent.at(-1).t === "recoverySync")).toBe(
        true,
    );
});

test.each([{ build: "new-deployment" }, { protocol: "2" }, { runId: "other-run" }])(
    "rejects mismatched resume metadata %o without replacing the live socket",
    async (changes) => {
        const { room, host } = await started();
        const original = host.socket;
        await resume(room, host.token, changes);
        expect(Socket.all.at(-1)!.sent[0].t).toBe("error");
        expect(host.socket).toBe(original);
        expect(data.recovery.deadline).toBeUndefined();
    },
);

test("fences replaced sockets and ignores old recovery epochs", async () => {
    const { room, host, guest } = await started();
    const old = host.socket;
    await resume(room, host.token);
    const epoch = "stale-epoch";
    await resume(room, guest.token);
    await room.atomic(() => room.lost(host, old));
    expect(host.socket).toBeDefined();
    expect(old.closed).toBe(1000);
    await control(room, host, { t: "recoveryAbort", epoch });
    expect(room.room).toBeDefined();
});

test("pauses forwarding, waits for the host, replays with acknowledgements, then verifies hashes", async () => {
    const { room, host, guest } = await started();
    await lost(room, host);
    const guestSocket = guest.socket;
    expect(guestSocket.sent.slice(-2).map((m: any) => m.t)).toEqual(["recovering", "recoverySync"]);
    await say(room, guest, { t: "up", d: { action: { kind: "item", index: 0 }, actionSeq: 1 } });
    await resume(room, host.token);
    expect(host.socket.sent.some((m: any) => m.t === "up")).toBe(false);
    await control(room, guest, { t: "recoveryState", frame: 10, hash: 1 });
    await control(room, host, { t: "recoveryState", frame: 20, hash: 2 });
    expect(host.socket.sent.at(-1)).toMatchObject({ t: "recoveryReplay", frame: 10, target: 20 });
    const writesBefore = writes;
    await control(room, host, {
        t: "recoveryFrames",
        to: guest.id,
        from: 10,
        d: { upTo: 15, events: [] },
    });
    await control(room, guest, { t: "recoveryAck", frame: 15, hash: 3 });
    expect(writes).toBe(writesBefore);
    expect(host.socket.sent.at(-1)).toMatchObject({ t: "recoveryReplay", frame: 15 });
    await control(room, host, {
        t: "recoveryFrames",
        to: guest.id,
        from: 15,
        d: { upTo: 20, events: [] },
    });
    await control(room, guest, { t: "recoveryAck", frame: 20, hash: 2 });
    expect(host.socket.sent.at(-1).t).toBe("recoveryDone");
    expect(guestSocket.sent.at(-1).t).toBe("recoveryDone");
    expect(data.recovery.deadline).toBeUndefined();
    const persisted = writes;
    await say(room, host, { t: "down", d: { from: 20, upTo: 21, events: [] } });
    expect(guestSocket.sent.at(-1).t).toBe("down");
    expect(writes).toBe(persisted);
});

test.each(["hash", "ahead", "abort", "leave"])(
    "removes only the failing guest and resumes the host: %s",
    async (failure) => {
        const { room, host, guest } = await started();
        await resume(room, host.token);
        const socket = host.socket;
        await control(room, host, { t: "recoveryState", frame: 10, hash: 1 });
        if (failure === "leave") await say(room, guest, { t: "leave" });
        else if (failure === "abort") await control(room, guest, { t: "recoveryAbort" });
        else
            await control(room, guest, {
                t: "recoveryState",
                frame: failure === "ahead" ? 11 : 10,
                hash: 2,
            });
        expect(room.room.members).toEqual([host]);
        expect(data.members.map((m: any) => m.id)).toEqual([host.id]);
        expect(data.recovery.deadline).toBeUndefined();
        expect(socket.sent.at(-1).t).toBe("recoveryDone");
        expect(socket.sent.some((m: any) => m.t === "left" && m.id === guest.id)).toBe(true);
        expect(socket.sent.some((m: any) => m.t === "gone")).toBe(false);
    },
);

test("only the host can replay, only an outstanding chunk can be acknowledged", async () => {
    const { room, host, guest } = await started();
    await resume(room, host.token);
    await control(room, host, { t: "recoveryState", frame: 2, hash: 1 });
    await control(room, guest, { t: "recoveryState", frame: 0, hash: 0 });
    await control(room, guest, { t: "recoveryAck", frame: 2, hash: 1 });
    await control(room, guest, {
        t: "recoveryFrames",
        to: host.id,
        from: 0,
        d: { upTo: 2, events: [] },
    });
    expect(room.recovery.states.get(guest.id).frame).toBe(0);
    await control(room, host, {
        t: "recoveryFrames",
        to: guest.id,
        from: 0,
        d: { upTo: 2, events: [], padding: "x".repeat(20_000) },
    });
    expect(room.recovery.flights.size).toBe(0);
    expect(room.room.recovery.deadline).toBeDefined();
});

test("paces replay across its byte budget without tripping the socket limits or writing frames", async () => {
    const { room, host, guest } = await started();
    await resume(room, host.token);
    await control(room, host, { t: "recoveryState", frame: 40, hash: 1 });
    await control(room, guest, { t: "recoveryState", frame: 0, hash: 0 });
    const before = writes;
    let waits = 0;
    for (let from = 0; from < 40; from++) {
        const packet = {
            t: "recoveryFrames",
            to: guest.id,
            from,
            d: { upTo: from + 1, events: [], padding: "x".repeat(7500) },
        };
        await control(room, host, packet);
        while (!room.recovery.flights.has(guest.id)) {
            waits++;
            await vi.advanceTimersByTimeAsync(250);
            await control(room, host, packet);
        }
        await control(room, guest, {
            t: "recoveryAck",
            frame: from + 1,
            hash: from === 39 ? 1 : 0,
        });
    }
    expect(waits).toBeGreaterThan(0);
    expect(writes).toBe(before + 1); // Only the final recovery transition.
    expect(host.closed).not.toBe(true);
    expect(guest.closed).not.toBe(true);
    expect(host.socket.sent.at(-1).t).toBe("recoveryDone");
});

test("ignores unknown message shapes and does not start a run with an absent member", async () => {
    const { room, host, guest } = await party();
    await say(room, host, {});
    await say(room, host, { t: {} });
    await lost(room, guest);
    await say(room, host, { t: "start", game: {} });
    expect(data.started).toBe(false);
    expect(host.socket.sent.at(-1).t).toBe("error");
});

test("refuses stored recovery from an incompatible protocol", async () => {
    await started();
    data.recovery.protocol = 2;
    resetObjectTimers();
    const restored = await loadRoom();
    expect(restored.room).toBeUndefined();
    expect(data).toBeUndefined();
});

test("a long run's old persisted activity timestamp cannot shorten recovery", async () => {
    await started();
    // Frames do not write storage. An endless run can be hours past its last write.
    vi.setSystemTime(Date.now() + 2 * 60 * 60_000);
    resetObjectTimers();
    const restored = await loadRoom();
    await restored.alarm();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(restored.room).toBeDefined();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(restored.room).toBeUndefined();
});

test("an old cleanup alarm honors a legacy member's remaining seat hold", async () => {
    await party(false);
    resetObjectTimers();
    const restored = await loadRoom();
    await restored.alarm();
    expect(restored.room).toBeDefined();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(restored.room).toBeUndefined();
});

async function thirdGuest(room: any) {
    const guest = room.newMember({ id: "p3", name: "Third", kind: "join", address: "c" });
    room.attach(guest, new Socket());
    await say(room, guest, { t: "join", me });
    return guest;
}

test("drops a lost guest after 15 seconds and resumes the remaining party", async () => {
    const { room, host, guest } = await party();
    const third = await thirdGuest(room);
    await say(room, host, { t: "start", game: {} });
    await lost(room, guest);
    await control(room, host, { t: "recoveryState", frame: 20, hash: 42 });
    await control(room, third, { t: "recoveryState", frame: 20, hash: 42 });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(room.room.members).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(room.room.members).toEqual([host, third]);
    expect(data.recovery.deadline).toBeUndefined();
    for (const member of [host, third]) {
        expect(member.socket.sent.at(-1).t).toBe("recoveryDone");
        expect(member.socket.sent.findIndex((m: any) => m.t === "left")).toBeLessThan(
            member.socket.sent.findIndex((m: any) => m.t === "recoveryDone"),
        );
    }
    await resume(room, guest.token);
    expect(Socket.all.at(-1)!.sent[0].t).toBe("error");
});

test("a reset gives absent guests the recovery window, then lets the returned host continue", async () => {
    const { host } = await started();
    resetObjectTimers();
    const restored = await loadRoom();
    await vi.advanceTimersByTimeAsync(50_000);
    await resume(restored, host.token);
    const returned = restored.room.members[0];
    await control(restored, returned, { t: "recoveryState", frame: 20, hash: 42 });
    await vi.advanceTimersByTimeAsync(8_999);
    expect(restored.room.members).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(restored.room.members).toEqual([returned]);
    expect(returned.socket.sent.at(-1).t).toBe("recoveryDone");
    expect(data.recovery.deadline).toBeUndefined();
});

test.each(["abort", "targeted", "badAck"])(
    "preserves another guest's replay when a guest fails: %s",
    async (failure) => {
        const { room, host, guest } = await party();
        const third = await thirdGuest(room);
        await say(room, host, { t: "start", game: {} });
        await resume(room, host.token);
        await control(room, host, { t: "recoveryState", frame: 20, hash: 42 });
        for (const member of [guest, third]) {
            await control(room, member, { t: "recoveryState", frame: 0, hash: 1 });
            await control(room, host, {
                t: "recoveryFrames",
                to: member.id,
                from: 0,
                d: { upTo: 20, events: [] },
            });
        }
        const epoch = room.recovery.epoch;
        if (failure === "targeted") await control(room, host, { t: "recoveryAbort", to: guest.id });
        else if (failure === "badAck")
            await control(room, guest, { t: "recoveryAck", frame: 20, hash: 99 });
        else await control(room, guest, { t: "recoveryAbort" });
        expect(room.recovery.epoch).toBe(epoch);
        expect(room.recovery.flights.get(third.id)).toBe(20);
        expect(room.room.members).toEqual([host, third]);
        await control(room, third, { t: "recoveryAck", frame: 20, hash: 42 });
        expect(third.socket.sent.at(-1).t).toBe("recoveryDone");
        expect(host.socket.sent.at(-1).t).toBe("recoveryDone");
    },
);

test("a host abort still closes the room", async () => {
    const { room, host, guest } = await started();
    await resume(room, host.token);
    const socket = guest.socket;
    await control(room, host, { t: "recoveryAbort" });
    expect(room.room).toBeUndefined();
    expect(socket.sent.at(-1)).toEqual({ t: "gone", reason: "recoveryFailed" });
});

test.each([true, false])(
    "accepts results-screen gear and unlocks without changing run compatibility (capable=%s)",
    async (capable) => {
        const { room, host, guest } = await party(capable);
        await say(room, host, { t: "start", game: {} });
        const loadout = { weapon: "new-gear" };
        const unlocks = { maps: ["lumbridge", "desert"] };
        await say(room, guest, {
            t: "me",
            loadout,
            unlocks,
            build: "new-build",
            recoveryVersion: 1,
        });
        expect(guest.loadout).toEqual(loadout);
        expect(guest.unlocks.maps).toContain("desert");
        expect(guest.build).toBe("original");
        expect(guest.recoveryVersion).toBe(capable ? 1 : undefined);
        await vi.advanceTimersByTimeAsync(1000);
        expect(data.members[1].loadout).toEqual(loadout);
        expect(data.members[1].unlocks.maps).toContain("desert");
        await say(room, host, { t: "end" });
        room.anyMap = false;
        host.unlocks.maps.push("desert");
        await say(room, host, { t: "settings", mapId: "desert" });
        expect(room.room.mapId).toBe("desert");
        await say(room, host, { t: "start", game: {} });
        expect(data.members[1].loadout).toEqual(loadout);
    },
);

test("an invented gap cannot pause the party or write a recovery episode", async () => {
    const { room, host, guest } = await started();
    const before = writes;
    await say(room, host, { t: "down", d: { from: 0, upTo: 10, events: [] } });
    await control(room, guest, { t: "recoveryRequest", frame: 0, from: 5, upTo: 10 });
    expect(room.room.members).toEqual([host]);
    expect(data.recovery.episodes).toBe(0);
    expect(data.recovery.deadline).toBeUndefined();
    expect(writes).toBe(before + 1); // Only the offending seat's removal.
    expect(host.socket.sent.some((m: any) => m.t === "recovering")).toBe(false);
});

async function requestGap(room: any, host: any, guest: any, frame: number) {
    const from = frame + 1,
        upTo = frame + 2;
    await say(room, host, { t: "down", d: { from, upTo, events: [] } });
    await control(room, guest, { t: "recoveryRequest", frame, from, upTo });
}
async function agree(room: any, host: any, guest: any, frame: number) {
    await control(room, host, { t: "recoveryState", frame, hash: 1 });
    await control(room, guest, { t: "recoveryState", frame, hash: 1 });
}

test("bounds genuine gap episodes per seat and stores only the pause and completion", async () => {
    const { room, host, guest } = await started();
    const before = writes;
    for (let n = 0; n < 3; n++) {
        await requestGap(room, host, guest, n * 2);
        expect(data.recovery.episodes).toBe(n + 1);
        await agree(room, host, guest, (n + 1) * 2);
        await vi.advanceTimersByTimeAsync(30_000);
    }
    expect(writes).toBe(before + 6);
    await requestGap(room, host, guest, 6);
    expect(room.room.members).toEqual([host]);
    expect(data.recovery.episodes).toBe(3);
    expect(data.recovery.deadline).toBeUndefined();
});

test("cooldown rejects rapid repeated gaps; a new run resets that allowance", async () => {
    const { room, host, guest } = await started();
    await requestGap(room, host, guest, 0);
    await agree(room, host, guest, 2);
    await say(room, host, { t: "end" });
    await say(room, host, { t: "start", game: {} });
    await requestGap(room, host, guest, 0);
    expect(data.recovery.episodes).toBe(1);
    await agree(room, host, guest, 2);
    await requestGap(room, host, guest, 2);
    expect(room.room.members).toEqual([host]);
    expect(data.recovery.deadline).toBeUndefined();
});

test("limits persist through resets, while object resets do not consume the allowance", async () => {
    const { room, host, guest } = await started();
    await requestGap(room, host, guest, 0);
    await agree(room, host, guest, 2);
    data.recovery.episodes = 12;
    resetObjectTimers();
    const restored = await loadRoom();
    await resume(restored, host.token);
    await resume(restored, guest.token);
    const [h, g] = restored.room.members;
    await agree(restored, h, g, 2);
    expect(data.recovery.episodes).toBe(12);
    expect(data.members[1].recoveryEpisodes).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await requestGap(restored, h, g, 2);
    expect(restored.room.members).toEqual([h]);
    expect(data.recovery.deadline).toBeUndefined();
});

test("repeated resumes neither write per attempt nor restart another seat's replay", async () => {
    const { room, host, guest } = await started();
    await resume(room, host.token);
    await control(room, guest, { t: "recoveryState", frame: 0, hash: 1 });
    const before = writes;
    const socket = host.socket;
    const epoch = room.recovery.epoch;
    for (let i = 0; i < 20; i++) await resume(room, host.token);
    expect(writes).toBe(before);
    expect(Socket.all.at(-1)!.closed).toBe(1013);
    expect(host.socket).toBe(socket);
    await vi.advanceTimersByTimeAsync(1000);
    await resume(room, host.token);
    expect(room.recovery.epoch).toBe(epoch);
    expect(room.recovery.states.get(guest.id)).toEqual({ frame: 0, hash: 1 });
    expect(writes).toBe(before);
    await lost(room, host);
    const afterLoss = writes;
    for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1000);
        await resume(room, host.token);
        await lost(room, host);
    }
    expect(writes).toBe(afterLoss); // Repeated disconnects retain the same seat deadline too.
});

test.each(["me", "up", "down", "ping"])(
    "a %s handler error drops its sender without resetting the object",
    async (t) => {
        const { room, host, guest } = await started();
        const socket = guest.socket;
        const log = vi.spyOn(console, "warn").mockImplementation(() => {});
        const original = room.handle.bind(room);
        room.handle = (member: any, message: any, text: string) => {
            if (member === guest) throw new Error("bad handler");
            original(member, message, text);
        };
        await expect(Promise.resolve(say(room, guest, { t }))).resolves.toBeUndefined();
        expect(socket.closed).toBe(1011);
        expect(room.room.members).toEqual([host]);
        await say(room, host, { t: "ping" });
        expect(host.socket.sent.at(-1).t).toBe("pong");
        expect(data.members).toHaveLength(1);
        log.mockRestore();
    },
);
