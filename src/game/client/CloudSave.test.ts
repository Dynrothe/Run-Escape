import { SaveData, compareGameVersions, createSave } from "../core/save";
import {
    CLOUD_STATE_KEY,
    CloudHost,
    CloudSync,
    CloudView,
    REQUEST_TIMEOUT_MS,
    UPLOAD_COOLDOWN_MS,
    cloudKeepsCopy,
    fingerprint,
    normalizeCode,
    readMeta,
} from "./CloudSave";

const URL = "https://saves.example";
const CODE = "K7Q2-M9XD-4TPA-W3RN-H8BE-6FZC";
const RESTORABLE_UNTIL = Date.parse("2026-11-13T12:00:00Z");
const NEW_CODE = "P2Q3-R4S5-T6V7-W8X9-YZ01-2345";

// The Worker's rules (server/cloud-saves/worker.mjs), kept in memory
class FakeWorker {
    accounts = new Map<string, { revision: number; text: string; at: number }[]>();
    // Codes deleted, whose saves are kept for restoring
    deleted = new Set<string>();
    requests: { method: string; path: string; body?: any; keepalive?: boolean }[] = [];
    down = false;
    // Takes the request and never answers, till it's given up on
    hang = false;
    // Something else answering these requests with a page (a captive portal, a proxy)
    garbage?: { method: string; status: number };

    fetch = async (url: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
        if (this.down) {
            throw new TypeError("Failed to fetch");
        }
        if (this.hang) {
            return new Promise((_resolve, reject) =>
                init.signal?.addEventListener("abort", () =>
                    reject(new DOMException("The operation was aborted", "AbortError")),
                ),
            );
        }
        const path = String(url).slice(`${URL}/v1/`.length);
        if (this.garbage && this.garbage.method === (init.method ?? "GET")) {
            return new Response("<html>Sign in to the wifi</html>", {
                status: this.garbage.status,
            });
        }
        const method = init.method ?? "GET";
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        this.requests.push({ method, path, body, keepalive: init.keepalive });
        const auth = (init.headers as Record<string, string>)?.Authorization;
        const code = auth && normalizeCode(auth.slice(7));
        const reply = (value: unknown, status = 200) => Response.json(value, { status });
        if (path === "health") return reply({ service: "run-escape-cloud-saves" });
        if (path === "account" && method === "POST") {
            this.accounts.set(CODE, []);
            return reply({ code: CODE });
        }
        const saves = code ? this.accounts.get(code) : undefined;
        if (!saves) return reply({ error: "Unknown sync code" }, 401);
        // Deleted: kept, and only restoring works
        if (this.deleted.has(code!)) {
            if (path === "account/restore") {
                this.deleted.delete(code!);
                return reply({ restored: true });
            }
            return reply({ error: "Deleted", restorableUntil: RESTORABLE_UNTIL }, 410);
        }
        const latest = saves.at(-1);
        const meta = latest
            ? { revision: latest.revision, summary: summaryOf(latest.text), updatedAt: latest.at }
            : { revision: 0 };
        if (path === "account" && method === "DELETE") {
            this.deleted.add(code!);
            return reply({ deleted: true, restorableUntil: RESTORABLE_UNTIL });
        }
        if (path === "account/code") {
            this.accounts.set(NEW_CODE, saves);
            this.accounts.delete(code!);
            return reply({ code: NEW_CODE });
        }
        if (path === "save/meta") return reply(meta);
        if (method === "GET") return reply(latest ? { ...meta, save: latest.text } : meta);
        if (body.baseRevision !== meta.revision) return reply({ reason: "stale", ...meta }, 409);
        const incoming = JSON.parse(body.save);
        if (
            latest &&
            !body.force &&
            compareGameVersions(incoming.gameVersion, JSON.parse(latest.text).gameVersion) < 0
        ) {
            return reply({ reason: "newer", ...meta }, 409);
        }
        saves.push({ revision: meta.revision + 1, text: body.save, at: 1000 + saves.length });
        return reply({ revision: meta.revision + 1, updatedAt: 0 });
    };

    // Another device's upload
    put(save: SaveData, gameVersion = "0.28.0"): void {
        const saves = this.accounts.get(CODE) ?? [];
        this.accounts.set(CODE, saves);
        const revision = (saves.at(-1)?.revision ?? 0) + 1;
        saves.push({ revision, text: JSON.stringify({ ...save, gameVersion }), at: revision });
    }

    get latest(): SaveData | undefined {
        const text = this.accounts.get(CODE)?.at(-1)?.text;
        return text ? JSON.parse(text) : undefined;
    }

    uploads(): number {
        return this.requests.filter((r) => r.method === "PUT").length;
    }
}

function summaryOf(text: string) {
    const save = JSON.parse(text);
    return {
        gameVersion: save.gameVersion,
        runs: save.runs,
        victories: save.victories,
        totalCoins: save.totalCoins,
        mapsBeaten: 0,
    };
}

const withRuns = (runs: number): SaveData => ({ ...createSave(), runs, totalCoins: runs * 10 });

let worker: FakeWorker;
let storage: Map<string, string>;
let views: (CloudView | undefined)[];
let current: SaveData;
let writable: boolean;
let sync: CloudSync;

function start(save: SaveData, gameVersion = "0.28.0"): CloudSync {
    current = save;
    const host: CloudHost = {
        gameVersion,
        save: () => current,
        canWrite: () => writable,
        // As GameClient.replaceSave does: it's a save point, which mustn't send the download back
        apply: (next) => {
            current = next;
            sync.savePoint();
        },
        onView: (view) => views.push(view),
    };
    const store = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
        removeItem: (key: string) => void storage.delete(key),
    };
    sync = new CloudSync(URL, host, store, worker.fetch as typeof fetch);
    return sync;
}

const view = () => views.at(-1);
const state = () => JSON.parse(storage.get(CLOUD_STATE_KEY) ?? "null");
// Linked, and in step at that revision with this save (or never in step, with none)
const link = (revision: number, inStepWith?: SaveData) =>
    storage.set(
        CLOUD_STATE_KEY,
        JSON.stringify({ code: CODE, revision, hash: inStepWith && fingerprint(inStepWith) }),
    );

beforeEach(() => {
    worker = new FakeWorker();
    storage = new Map();
    views = [];
    writable = true;
});
afterEach(() => {
    sync?.stop();
    vi.useRealTimers();
});

it("reads codes as they're typed", () => {
    expect(normalizeCode("k7q2 m9xd 4tpa w3rn h8be 6fzc")).toBe(CODE);
    expect(normalizeCode("nope")).toBeUndefined();
});

it("is offered only once the Worker answers", async () => {
    worker.down = true;
    await start(createSave()).start();
    expect(view()).toBeUndefined();
    worker.down = false;
    await start(createSave()).start();
    expect(view()).toMatchObject({ working: false, code: undefined });
});

it("turns on with this device's save as the code's first, kept apart from the save", async () => {
    await start(withRuns(3)).turnOn();
    expect(worker.latest).toMatchObject({ runs: 3, gameVersion: "0.28.0" });
    expect(state()).toMatchObject({ code: CODE, revision: 1, hash: fingerprint(current) });
    expect(view()).toMatchObject({ code: CODE, problem: undefined });
    expect(JSON.stringify(current)).not.toContain(CODE);
});

it("tells saves apart by their progress, not their stamps or key order", () => {
    const save = withRuns(3);
    const reordered = Object.fromEntries(Object.entries(save).reverse()) as SaveData;
    expect(fingerprint({ ...reordered, gameVersion: "9.9.9", lastExported: 1 })).toBe(
        fingerprint(save),
    );
    expect(fingerprint(withRuns(4))).not.toBe(fingerprint(save));
    expect(fingerprint({ ...save, mapVictories: { lumbridge: 1 } })).not.toBe(fingerprint(save));
});

it("uploads at a save point only when the progress changed, at most once a cooldown", async () => {
    vi.useFakeTimers();
    await start(withRuns(1)).turnOn();
    // Written again, nothing new: nothing goes up
    current = { ...withRuns(1), lastExported: 5 };
    sync.savePoint();
    await vi.advanceTimersByTimeAsync(UPLOAD_COOLDOWN_MS);
    expect(worker.uploads()).toBe(1);

    current = withRuns(2);
    sync.savePoint();
    await sync.idle();
    expect(worker.uploads()).toBe(2);
    // Save points back to back wait out the cooldown, and go up once, as they are by then
    current = withRuns(3);
    sync.savePoint();
    current = withRuns(4);
    sync.savePoint();
    await vi.advanceTimersByTimeAsync(UPLOAD_COOLDOWN_MS - 1000);
    expect(worker.uploads()).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    await sync.idle();
    expect(worker.uploads()).toBe(3);
    expect(worker.latest?.runs).toBe(4);
    expect(state()).toMatchObject({ revision: 3, hash: fingerprint(current) });
});

it("takes leaving the tab as a save point", async () => {
    vi.useFakeTimers();
    await start(withRuns(1)).turnOn();
    await vi.advanceTimersByTimeAsync(UPLOAD_COOLDOWN_MS);
    current = withRuns(2);
    sync.onVisibility(true);
    await sync.idle();
    expect(worker.latest?.runs).toBe(2);
});

it("sends what's changed on leaving the tab at once, cooldown or not, to outlive the page", async () => {
    vi.useFakeTimers();
    await start(withRuns(1)).turnOn();
    // Skills left half a minute after a run went up: it waits out the cooldown
    await vi.advanceTimersByTimeAsync(30_000);
    current = withRuns(2);
    sync.savePoint();
    await sync.idle();
    expect(worker.uploads()).toBe(1);
    // The app's closed before then, so a timer would never fire
    sync.onVisibility(true);
    await sync.idle();
    expect(worker.latest?.runs).toBe(2);
    expect(worker.requests.at(-1)).toMatchObject({ method: "PUT", keepalive: true });
    // The timer's gone with it: nothing goes up twice
    await vi.advanceTimersByTimeAsync(UPLOAD_COOLDOWN_MS);
    expect(worker.uploads()).toBe(2);
    // Nothing new, nothing sent
    sync.onVisibility(true);
    await sync.idle();
    expect(worker.uploads()).toBe(2);
});

it("takes the cloud's save over a fresh one put in its place, and never sends that up", async () => {
    // The save couldn't be read, so the game made a fresh one: the cloud's is the player's
    worker.put(withRuns(40));
    link(1, withRuns(40));
    await start(createSave()).check();
    expect(current.runs).toBe(40);
    expect(worker.uploads()).toBe(0);
    expect(view()?.choice).toBeUndefined();
    // However a save with no runs gets to a save point, it doesn't go up over the cloud's
    current = createSave();
    sync.savePoint();
    await sync.idle();
    expect(worker.uploads()).toBe(0);
    expect(worker.latest?.runs).toBe(40);
    expect(current.runs).toBe(40);
    // A code with no save yet still takes a fresh device's first one
    worker = new FakeWorker();
    storage.clear();
    await start(createSave()).turnOn();
    expect(worker.latest?.runs).toBe(0);
});

it("asks before a cloud save with fewer runs replaces this one, even with nothing new here", async () => {
    worker.put(withRuns(9));
    worker.put(withRuns(9));
    link(2, withRuns(9));
    // Another device lost its progress and sent that up
    worker.put(withRuns(3));
    await start(withRuns(9)).check();
    expect(current.runs).toBe(9);
    expect(view()?.choice).toMatchObject({ newer: false, cloud: { revision: 3 } });
});

it("keeps a choice put off till the player makes it, though the tab comes back", async () => {
    vi.useFakeTimers();
    link(1, withRuns(1));
    worker.put(withRuns(1));
    worker.put(withRuns(9));
    await start(withRuns(4)).check();
    sync.later();
    const downloads = () => worker.requests.filter((r) => r.path === "save" && r.method === "GET");
    expect(downloads()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(61_000);
    sync.onVisibility(false);
    await sync.idle();
    expect(view()?.choice).toMatchObject({ closed: true, cloud: { revision: 2 } });
    expect(downloads()).toHaveLength(1);
    // The cloud's moved on meanwhile: the choice is about the newest, still put off
    worker.put(withRuns(12));
    await vi.advanceTimersByTimeAsync(61_000);
    sync.onVisibility(false);
    await sync.idle();
    expect(view()?.choice).toMatchObject({ closed: true, cloud: { revision: 3 } });
    sync.reopenChoice();
    await sync.useCloud();
    expect(current.runs).toBe(12);
    expect(view()?.choice).toBeUndefined();
});

it("gives up on a request that doesn't answer, so the rest aren't held up", async () => {
    vi.useFakeTimers();
    link(1, withRuns(1));
    worker.put(withRuns(1));
    worker.hang = true;
    const checking = start(withRuns(1)).check();
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1000);
    expect(view()?.working).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    await checking;
    expect(view()).toMatchObject({ working: false, problem: "offline" });
    await sync.turnOff();
    expect(view()?.code).toBeUndefined();
});

it("says the cloud has a copy only while it's on, synced, and nothing's wrong or waiting", () => {
    const synced = { code: CODE, syncedAt: 5, working: false };
    expect(cloudKeepsCopy(synced)).toBe(true);
    expect(cloudKeepsCopy(undefined)).toBe(false);
    expect(cloudKeepsCopy({ working: false })).toBe(false);
    expect(cloudKeepsCopy({ code: CODE, working: false })).toBe(false);
    expect(cloudKeepsCopy({ ...synced, problem: "unknownCode" })).toBe(false);
    expect(cloudKeepsCopy({ ...synced, problem: "offline" })).toBe(false);
    const choice = { cloud: { revision: 2 }, newer: false, closed: true };
    expect(cloudKeepsCopy({ ...synced, choice })).toBe(false);
});

it("gives a fresh device the cloud's save: the player who cleared their browser", async () => {
    worker.put(withRuns(40));
    const linked = await start(createSave()).useCode(CODE.toLowerCase());
    expect(linked).toBe(true);
    expect(current.runs).toBe(40);
    expect(state()).toMatchObject({ revision: 1, hash: fingerprint(current) });
    // Going in isn't news to upload
    expect(worker.uploads()).toBe(0);
});

it("asks before a code's save replaces one with progress, either way", async () => {
    worker.put(withRuns(40));
    await start(withRuns(5)).useCode(CODE);
    expect(current.runs).toBe(5);
    expect(view()?.choice).toMatchObject({ newer: false, cloud: { revision: 1 } });
    // Nothing goes up meanwhile
    sync.savePoint();
    sync.onVisibility(true);
    await sync.idle();
    expect(worker.uploads()).toBe(0);
    await sync.keepLocal();
    expect(worker.latest?.runs).toBe(5);
    expect(view()?.choice).toBeUndefined();

    worker.put(withRuns(60));
    current = withRuns(6);
    await sync.check();
    expect(view()?.choice).toBeDefined();
    await sync.useCloud();
    expect(current.runs).toBe(60);
    expect(state()).toMatchObject({ revision: 3, hash: fingerprint(current) });
});

it("doesn't ask when a code's save is the same as this device's", async () => {
    worker.put({ ...withRuns(8), lastExported: 5 });
    await start({ ...withRuns(8), lastExported: 9 }).useCode(CODE);
    expect(view()?.choice).toBeUndefined();
    expect(state()).toMatchObject({ revision: 1, hash: fingerprint(current) });
    expect(current.lastExported).toBe(9);
    expect(worker.uploads()).toBe(0);
});

it("takes another device's newer save on coming back, if nothing changed here", async () => {
    link(1, withRuns(1));
    worker.put(withRuns(1));
    worker.put(withRuns(9));
    await start(withRuns(1)).check();
    expect(current.runs).toBe(9);
    expect(view()?.choice).toBeUndefined();
});

it("asks when both devices played since they synced, and a stale upload asks too", async () => {
    link(1, withRuns(1));
    worker.put(withRuns(1));
    worker.put(withRuns(9));
    await start(withRuns(4)).check();
    expect(current.runs).toBe(4);
    expect(view()?.choice?.cloud.revision).toBe(2);
    sync.later();
    expect(view()?.choice?.closed).toBe(true);

    // In step, then another device gets there first
    link(2, withRuns(4));
    start(withRuns(4));
    worker.put(withRuns(12));
    current = withRuns(5);
    sync.savePoint();
    await sync.idle();
    expect(view()?.choice).toMatchObject({ cloud: { revision: 3 } });
    expect(worker.latest?.runs).toBe(12);
});

it("never loads a newer game's save, and only writes over it when the player says", async () => {
    link(1, withRuns(1));
    worker.put(withRuns(1));
    worker.put(withRuns(30), "0.29.0");
    await start(withRuns(1)).check();
    expect(current.runs).toBe(1);
    expect(view()?.choice).toMatchObject({ newer: true });
    await sync.useCloud();
    expect(current.runs).toBe(1);
    expect(view()?.choice?.newer).toBe(true);
    await sync.keepLocal();
    expect(worker.latest).toMatchObject({ runs: 1, gameVersion: "0.28.0" });
});

it("does nothing in a tab that isn't saving", async () => {
    link(1);
    worker.put(withRuns(9));
    writable = false;
    await start(withRuns(1)).check();
    await sync.turnOn();
    expect(worker.requests).toEqual([]);
    expect(current.runs).toBe(1);
});

it("keeps playing offline, and catches up once it can", async () => {
    vi.useFakeTimers();
    await start(withRuns(1)).turnOn();
    worker.down = true;
    current = withRuns(2);
    sync.savePoint();
    await vi.advanceTimersByTimeAsync(UPLOAD_COOLDOWN_MS);
    await sync.idle();
    expect(view()?.problem).toBe("offline");
    expect(state().hash).not.toBe(fingerprint(current));
    worker.down = false;
    // A check within the cooldown leaves it for later; Sync now sends it at once
    await sync.check();
    expect(worker.latest?.runs).toBe(1);
    await sync.check(true);
    expect(worker.latest?.runs).toBe(2);
    expect(view()?.problem).toBeUndefined();
});

it("turns off, or deletes the cloud's copy", async () => {
    await start(withRuns(1)).turnOn();
    await sync.turnOff();
    expect(storage.has(CLOUD_STATE_KEY)).toBe(false);
    expect(worker.accounts.has(CODE)).toBe(true);
    expect(view()).toMatchObject({ code: undefined });
    await sync.useCode(CODE);
    expect(view()?.code).toBe(CODE);
    await sync.deleteCloud();
    expect(worker.deleted.has(CODE)).toBe(true);
    expect(storage.has(CLOUD_STATE_KEY)).toBe(false);
    // Undoable straight away
    expect(view()).toMatchObject({
        code: undefined,
        problem: "deleted",
        deletedUntil: RESTORABLE_UNTIL,
    });
    await sync.restore();
    expect(worker.deleted.has(CODE)).toBe(false);
    expect(view()).toMatchObject({ code: CODE, problem: undefined });
    expect(state()).toMatchObject({ code: CODE, revision: 1 });

    await sync.deleteCloud();
    await sync.useCode("nope");
    expect(view()?.problem).toBe("unknownCode");
});

it("restores a deleted code typed in on another device, and its saves with it", async () => {
    worker.put(withRuns(30));
    worker.deleted.add(CODE);
    await start(createSave()).start();
    await sync.useCode(CODE);
    expect(view()).toMatchObject({ code: undefined, problem: "deleted" });
    expect(current.runs).toBe(0);
    await sync.restore();
    expect(current.runs).toBe(30);
    expect(view()).toMatchObject({ code: CODE, problem: undefined });

    // A linked device finding its code deleted elsewhere can restore it too
    worker.deleted.add(CODE);
    await sync.check();
    expect(view()).toMatchObject({ code: CODE, problem: "deleted" });
    await sync.restore();
    expect(view()?.problem).toBeUndefined();
});

it("gets a new code for the same save, and the old one stops working", async () => {
    await start(withRuns(3)).turnOn();
    await sync.newCode();
    expect(view()).toMatchObject({ code: NEW_CODE, problem: undefined });
    expect(state()).toMatchObject({ code: NEW_CODE, revision: 1 });
    expect(worker.accounts.has(CODE)).toBe(false);
    current = withRuns(4);
    await sync.check(true);
    expect(JSON.parse(worker.accounts.get(NEW_CODE)!.at(-1)!.text).runs).toBe(4);
    expect(view()?.problem).toBeUndefined();
});

it("doesn't act on an answer that isn't the Worker's", async () => {
    link(1, withRuns(1));
    worker.put(withRuns(1));
    worker.put(withRuns(9));
    start(withRuns(1));
    // A page where the cloud's save should be: not taken, nothing to choose between
    worker.garbage = { method: "GET", status: 200 };
    await sync.check();
    expect(current.runs).toBe(1);
    expect(view()).toMatchObject({ problem: "offline", choice: undefined });
    // A page with a 409 for an upload: not taken as another device's save
    worker.garbage = { method: "PUT", status: 409 };
    link(2, withRuns(9));
    start(withRuns(10));
    await sync.check(true);
    expect(view()).toMatchObject({ problem: "offline", choice: undefined });
    worker.garbage = undefined;
    await sync.check(true);
    expect(worker.latest?.runs).toBe(10);
});

it("reads the Worker's answers field by field", () => {
    expect(readMeta({ revision: 3, summary: { gameVersion: "0.28.0", runs: 5 } })).toEqual({
        revision: 3,
        summary: { gameVersion: "0.28.0", runs: 5, victories: 0, totalCoins: 0, mapsBeaten: 0 },
        updatedAt: undefined,
    });
    expect(readMeta({ revision: 2, summary: { runs: "lots" } })).toEqual({
        revision: 2,
        summary: undefined,
        updatedAt: undefined,
    });
    for (const bad of [undefined, null, "page", {}, { revision: -1 }, { revision: 1.5 }]) {
        expect(readMeta(bad), JSON.stringify(bad)).toBeUndefined();
    }
});
