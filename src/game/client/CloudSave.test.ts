import { SaveData, compareGameVersions, createSave } from "../core/save";
import {
    CLOUD_STATE_KEY,
    CloudHost,
    CloudSync,
    CloudView,
    UPLOAD_COOLDOWN_MS,
    fingerprint,
    normalizeCode,
} from "./CloudSave";

const URL = "https://saves.example";
const CODE = "K7Q2-M9XD-4TPA-W3RN-H8BE-6FZC";
const RESTORABLE_UNTIL = Date.parse("2026-11-13T12:00:00Z");

// The Worker's rules (server/cloud-saves/worker.mjs), kept in memory
class FakeWorker {
    accounts = new Map<string, { revision: number; text: string; at: number }[]>();
    // Codes deleted, whose saves are kept for restoring
    deleted = new Set<string>();
    requests: { method: string; path: string; body?: any }[] = [];
    down = false;

    fetch = async (url: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
        if (this.down) {
            throw new TypeError("Failed to fetch");
        }
        const path = String(url).slice(`${URL}/v1/`.length);
        const method = init.method ?? "GET";
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        this.requests.push({ method, path, body });
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
