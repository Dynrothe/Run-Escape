import { SaveData, compareGameVersions, createSave } from "../core/save";
import {
    CLOUD_STATE_KEY,
    CloudHost,
    CloudSync,
    CloudView,
    UPLOAD_DELAY_MS,
    normalizeCode,
} from "./CloudSave";

const URL = "https://saves.example";
const CODE = "K7Q2-M9XD-4TPA-W3RN-H8BE-6FZC";

// The Worker's rules (server/cloud-saves/worker.mjs), kept in memory
class FakeWorker {
    accounts = new Map<string, { revision: number; text: string; at: number }[]>();
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
        const latest = saves.at(-1);
        const meta = latest
            ? { revision: latest.revision, summary: summaryOf(latest.text), updatedAt: latest.at }
            : { revision: 0 };
        if (path === "account" && method === "DELETE") {
            this.accounts.delete(code!);
            return reply({ deleted: true });
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
        // As GameClient.replaceSave does: the save's written, which tells cloud save it changed
        apply: (next) => {
            current = next;
            sync.changed();
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
const link = (revision: number, dirty: boolean) =>
    storage.set(CLOUD_STATE_KEY, JSON.stringify({ code: CODE, revision, dirty }));

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
    expect(state()).toMatchObject({ code: CODE, revision: 1, dirty: false });
    expect(view()).toMatchObject({ code: CODE, problem: undefined });
    expect(JSON.stringify(current)).not.toContain(CODE);
});

it("uploads a while after the game saves, and keeps a change made meanwhile", async () => {
    vi.useFakeTimers();
    await start(withRuns(1)).turnOn();
    current = withRuns(2);
    sync.changed();
    current = withRuns(3);
    sync.changed();
    expect(state().dirty).toBe(true);
    expect(worker.uploads()).toBe(1);
    await vi.advanceTimersByTimeAsync(UPLOAD_DELAY_MS);
    await sync.idle();
    expect(worker.uploads()).toBe(2);
    expect(worker.latest?.runs).toBe(3);
    expect(state()).toMatchObject({ revision: 2, dirty: false });
});

it("sends a waiting upload when the tab's left", async () => {
    vi.useFakeTimers();
    await start(withRuns(1)).turnOn();
    current = withRuns(2);
    sync.changed();
    sync.onVisibility(true);
    await sync.idle();
    expect(worker.latest?.runs).toBe(2);
});

it("gives a fresh device the cloud's save: the player who cleared their browser", async () => {
    worker.put(withRuns(40));
    const linked = await start(createSave()).useCode(CODE.toLowerCase());
    expect(linked).toBe(true);
    expect(current.runs).toBe(40);
    expect(state()).toMatchObject({ revision: 1, dirty: false });
    // Its own write of the download isn't news to upload
    expect(worker.uploads()).toBe(0);
});

it("asks before a code's save replaces one with progress, either way", async () => {
    worker.put(withRuns(40));
    await start(withRuns(5)).useCode(CODE);
    expect(current.runs).toBe(5);
    expect(view()?.choice).toMatchObject({ newer: false, cloud: { revision: 1 } });
    // Nothing goes up meanwhile
    vi.useFakeTimers();
    sync.changed();
    await vi.advanceTimersByTimeAsync(UPLOAD_DELAY_MS);
    expect(worker.uploads()).toBe(0);
    await sync.keepLocal();
    expect(worker.latest?.runs).toBe(5);
    expect(view()?.choice).toBeUndefined();

    worker.put(withRuns(60));
    current = withRuns(6);
    sync.changed();
    await sync.check();
    expect(view()?.choice).toBeDefined();
    await sync.useCloud();
    expect(current.runs).toBe(60);
    expect(state()).toMatchObject({ revision: 3, dirty: false });
});

it("takes another device's newer save on coming back, if nothing changed here", async () => {
    link(1, false);
    worker.put(withRuns(1));
    worker.put(withRuns(9));
    await start(withRuns(1)).check();
    expect(current.runs).toBe(9);
    expect(view()?.choice).toBeUndefined();
});

it("asks when both devices played since they synced, and a stale upload asks too", async () => {
    link(1, true);
    worker.put(withRuns(1));
    worker.put(withRuns(9));
    await start(withRuns(4)).check();
    expect(current.runs).toBe(4);
    expect(view()?.choice?.cloud.revision).toBe(2);
    sync.later();
    expect(view()?.choice?.closed).toBe(true);

    // In step, then another device gets there first
    link(2, false);
    start(withRuns(4));
    worker.put(withRuns(12));
    current = withRuns(5);
    sync.changed();
    sync.onVisibility(true);
    await sync.idle();
    expect(view()?.choice).toMatchObject({ cloud: { revision: 3 } });
    expect(worker.latest?.runs).toBe(12);
});

it("never loads a newer game's save, and only writes over it when the player says", async () => {
    link(1, false);
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
    link(1, true);
    worker.put(withRuns(9));
    writable = false;
    await start(withRuns(1)).check();
    await sync.turnOn();
    expect(worker.requests).toEqual([]);
    expect(current.runs).toBe(1);
});

it("keeps playing offline, and catches up once it can", async () => {
    await start(withRuns(1)).turnOn();
    worker.down = true;
    current = withRuns(2);
    sync.changed();
    sync.onVisibility(true);
    await sync.idle();
    expect(view()?.problem).toBe("offline");
    expect(state().dirty).toBe(true);
    worker.down = false;
    await sync.check();
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
    expect(worker.accounts.has(CODE)).toBe(false);
    expect(storage.has(CLOUD_STATE_KEY)).toBe(false);
    await sync.useCode(CODE);
    expect(view()).toMatchObject({ code: undefined, problem: "unknownCode" });
});
