import { cloudSaveUrl } from "../../util/cloudSaveUrl";
import {
    NewerSaveError,
    SaveData,
    compareGameVersions,
    exportSave,
    importSave,
} from "../core/save";

// The build's cloud-save Worker (server/cloud-saves), if it has one
export const CLOUD_SAVE_URL = cloudSaveUrl(
    import.meta.env.VITE_CLOUD_SAVE_URL as string | undefined,
);

// The sync code and how far this device has synced, kept apart from the save so it never goes
// out in an export. Never rename it, as with the save's own key.
export const CLOUD_STATE_KEY = "rune-survivors-cloud";
// Uploads are this far apart at least. A save point within it (runs ended back to back, say)
// waits for it to pass, and whatever's changed by then goes up once.
export const UPLOAD_COOLDOWN_MS = 120_000;
// Coming back to the tab checks for a save from another device, this often at most
const CHECK_EVERY_MS = 60_000;

// What the Worker says about a save (readSave in server/cloud-saves/worker.mjs)
export type CloudSummary = {
    gameVersion: string;
    runs: number;
    victories: number;
    totalCoins: number;
    mapsBeaten: number;
};

// The cloud's save: none is revision 0
export type CloudMeta = { revision: number; summary?: CloudSummary; updatedAt?: number };

type CloudState = {
    code: string;
    // The cloud's revision this device's save came from, or last went up as
    revision: number;
    // The save's fingerprint then: a save that still has it hasn't changed. None when this
    // device's save has never been in step with the cloud's.
    hash?: string;
    syncedAt?: number;
};

// offline: the Worker can't be reached or is busy, and it'll try again; unknownCode: the code
// isn't one (or its save was deleted); refused: the Worker wouldn't take the save
export type CloudProblem = "offline" | "unknownCode" | "refused";

// The cloud has a different save from this device's, and the player picks which to keep. newer:
// it's from a newer game, which this one can't load.
export type CloudChoice = { cloud: CloudMeta; newer: boolean; closed: boolean };

// What the UI shows. Undefined in the store when cloud save isn't offered.
export type CloudView = {
    code?: string;
    syncedAt?: number;
    working: boolean;
    problem?: CloudProblem;
    choice?: CloudChoice;
};

export interface CloudHost {
    readonly gameVersion: string;
    save(): SaveData;
    // Whether this tab can save at all (it has the save lock, and the save isn't a newer game's)
    canWrite(): boolean;
    // Puts a downloaded save in place of this one
    apply(save: SaveData): void;
    onView(view: CloudView | undefined): void;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function summarize(save: SaveData, gameVersion: string): CloudSummary {
    return {
        gameVersion,
        runs: save.runs,
        victories: save.victories,
        totalCoins: save.totalCoins,
        mapsBeaten: Object.values(save.mapVictories).filter((n) => n > 0).length,
    };
}

// A sync code as a player might type it, as the Worker reads it: K7Q2-M9XD-4TPA-W3RN-H8BE-6FZC
export function normalizeCode(text: string): string | undefined {
    const code = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
    return /^[0-9A-HJKMNP-TV-Z]{24}$/.test(code) ? code.match(/.{4}/g)!.join("-") : undefined;
}

// What a save's progress comes to, as a short hash: two saves with the same progress have the
// same one. What's marked on a save when it's written or exported doesn't count, and nor does
// the order of its keys.
export function fingerprint(save: SaveData): string {
    const text = JSON.stringify(
        { ...save, gameVersion: undefined, lastExported: undefined },
        (_key, value) =>
            value && typeof value === "object" && !Array.isArray(value)
                ? Object.fromEntries(Object.entries(value).sort(([x], [y]) => (x < y ? -1 : 1)))
                : value,
    );
    // cyrb53: 53 bits is plenty to tell one save from the last
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 & 0x1fffff).toString(16) + (h1 >>> 0).toString(16).padStart(8, "0");
}

function readState(storage: Store | undefined): CloudState | undefined {
    try {
        const raw = JSON.parse(storage?.getItem(CLOUD_STATE_KEY) ?? "null");
        if (
            raw &&
            typeof raw.code === "string" &&
            Number.isInteger(raw.revision) &&
            (raw.hash === undefined || typeof raw.hash === "string")
        ) {
            return raw;
        }
    } catch {
        // Nothing kept, or unreadable: not linked
    }
    return undefined;
}

function localStore(): Store | undefined {
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}

// Keeps the save in step with the cloud's. The local save stays the main copy: uploads happen at
// save points, when the progress has changed, and a download goes in through importSave, as a
// file would.
export class CloudSync {
    private state?: CloudState;
    // The Worker answered, so cloud save can be offered
    private available = false;
    private working = false;
    private problem?: CloudProblem;
    private choice?: CloudChoice;
    // One request at a time
    private queue: Promise<void> = Promise.resolve();
    // An upload waiting out the cooldown
    private uploadTimer?: ReturnType<typeof setTimeout>;
    private lastUpload = -Infinity;
    private lastCheck = -Infinity;

    constructor(
        readonly url: string,
        private readonly host: CloudHost,
        private readonly storage: Store | undefined = localStore(),
        private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    ) {
        this.state = readState(storage);
    }

    // Finds out whether the Worker's reachable. An app that doesn't let requests out to it
    // answers with something else, and then cloud save isn't offered (unless this device is
    // already linked, when it's shown as offline).
    async start(): Promise<void> {
        this.emit();
        if (this.state) {
            return;
        }
        try {
            const { data } = await this.call("GET", "health");
            this.available = data?.service === "run-escape-cloud-saves";
        } catch {
            this.available = false;
        }
        this.emit();
    }

    stop(): void {
        clearTimeout(this.uploadTimer);
    }

    get linked(): boolean {
        return this.state !== undefined;
    }

    // Once everything asked for so far is done
    idle(): Promise<void> {
        return this.queue;
    }

    // Looks for a newer save from another device, and uploads this one's if it's changed: at
    // once when the player asked (Sync now), or as a save point would
    check(now = false): Promise<void> {
        return this.run(async () => {
            // Another tab may have linked or synced since
            this.state = readState(this.storage);
            if (!this.state || !this.host.canWrite()) {
                return;
            }
            this.lastCheck = Date.now();
            const meta = await this.request("GET", "save/meta");
            if (meta) {
                await this.settle(meta, now);
            }
        });
    }

    // A save point (a run's results, leaving Skills or the Armoury, an import, leaving the tab):
    // uploads if the progress has changed. Within the cooldown it waits, and whatever's changed
    // by then goes up once. Nothing goes up while the player's deciding which save to keep.
    savePoint(): void {
        if (!this.state || this.choice || this.uploadTimer !== undefined || !this.changedHere()) {
            return;
        }
        const wait = this.lastUpload + UPLOAD_COOLDOWN_MS - Date.now();
        if (wait > 0) {
            this.uploadTimer = setTimeout(() => this.upload(), wait);
        } else {
            this.upload();
        }
    }

    // Leaving the tab is a save point, and coming back looks for a save from elsewhere
    onVisibility(hidden: boolean): void {
        if (hidden) {
            this.savePoint();
        } else if (Date.now() - this.lastCheck > CHECK_EVERY_MS) {
            this.check();
        }
    }

    // A new sync code, with this device's save as its first
    turnOn(): Promise<void> {
        return this.run(async () => {
            if (this.state || !this.host.canWrite()) {
                return;
            }
            const created = await this.request("POST", "account");
            if (typeof created?.code !== "string") {
                return;
            }
            this.state = { code: created.code, revision: 0 };
            this.write();
            await this.put(false);
        });
    }

    // Links this device to another's code. What happens to this device's save is the same as
    // coming back to a changed cloud: a fresh one takes the cloud's, one with progress asks.
    useCode(text: string): Promise<boolean> {
        const code = normalizeCode(text);
        if (!code) {
            this.problem = "unknownCode";
            this.emit();
            return Promise.resolve(false);
        }
        let linked = false;
        return this.run(async () => {
            if (!this.host.canWrite()) {
                return;
            }
            const response = await this.call("GET", "save/meta", code);
            if (response.status === 401) {
                this.problem = "unknownCode";
                return;
            }
            if (response.status !== 200) {
                this.problem = "offline";
                return;
            }
            this.state = { code, revision: 0 };
            this.problem = undefined;
            this.write();
            linked = true;
            await this.settle(response.data);
        }).then(() => linked);
    }

    // The player's pick: the cloud's save in place of this one
    useCloud(): Promise<void> {
        return this.run(async () => {
            if (this.state && this.host.canWrite()) {
                await this.download();
            }
        });
    }

    // The player's pick: this device's save over the cloud's, even if it's a newer game's
    keepLocal(): Promise<void> {
        return this.run(async () => {
            if (!this.state || !this.choice || !this.host.canWrite()) {
                return;
            }
            this.state.revision = this.choice.cloud.revision;
            this.write();
            await this.put(true);
        });
    }

    // Puts the choice off: nothing syncs until it's made, from Settings
    later(): void {
        if (this.choice) {
            this.choice = { ...this.choice, closed: true };
            this.emit();
        }
    }

    reopenChoice(): void {
        if (this.choice) {
            this.choice = { ...this.choice, closed: false };
            this.emit();
        }
    }

    // Stops syncing here. The cloud's copy stays, for the code's other devices.
    turnOff(): Promise<void> {
        return this.run(async () => this.forget());
    }

    // Deletes the cloud's copy, every version of it, and the code with it
    deleteCloud(): Promise<void> {
        return this.run(async () => {
            if (!this.state) {
                return;
            }
            const response = await this.call("DELETE", "account", this.state.code);
            if (response.status === 200 || response.status === 401) {
                this.forget();
            } else {
                this.problem = "offline";
            }
        });
    }

    private forget(): void {
        clearTimeout(this.uploadTimer);
        this.uploadTimer = undefined;
        this.state = undefined;
        this.choice = undefined;
        this.problem = undefined;
        // It answered before, so it's still offered
        this.available = true;
        try {
            this.storage?.removeItem(CLOUD_STATE_KEY);
        } catch (e) {
            console.error("Failed to forget the cloud save", e);
        }
    }

    private upload(): Promise<void> {
        clearTimeout(this.uploadTimer);
        this.uploadTimer = undefined;
        return this.run(async () => {
            this.state = readState(this.storage);
            if (this.state && !this.choice && this.host.canWrite() && this.changedHere()) {
                await this.put(false);
            }
        });
    }

    // Whether the save's progress has changed since it was last in step with the cloud's
    private changedHere(): boolean {
        return this.state !== undefined && fingerprint(this.host.save()) !== this.state.hash;
    }

    // What to do once the cloud's revision is known
    private async settle(meta: CloudMeta, now = false): Promise<void> {
        const state = this.state!;
        if (meta.revision === state.revision || meta.revision === 0) {
            // In step (or the cloud has nothing), so only this device's changes are news
            state.revision = meta.revision;
            this.choice = undefined;
            if (now && this.changedHere()) {
                await this.put(false);
            } else {
                this.savePoint();
            }
            return;
        }
        const newer =
            meta.summary !== undefined &&
            compareGameVersions(meta.summary.gameVersion, this.host.gameVersion) > 0;
        // The player who cleared their browser's data: an untouched save takes the cloud's
        const fresh = this.host.save().runs === 0;
        if (newer) {
            this.choice = { cloud: meta, newer, closed: false };
            return;
        }
        // Both changed: ask, unless they're the same save after all (a code linked again, say)
        await this.download(this.changedHere() && !fresh);
    }

    // ifSame: only if it's the same as this device's, and if not, ask which to keep
    private async download(ifSame = false): Promise<void> {
        const state = this.state!;
        const got = await this.request("GET", "save");
        if (!got) {
            return;
        }
        if (got.revision === 0) {
            state.revision = 0;
            this.choice = undefined;
            await this.put(false);
            return;
        }
        let save: SaveData;
        try {
            save = importSave(got.save, this.host.gameVersion);
        } catch (e) {
            if (e instanceof NewerSaveError) {
                this.choice = { cloud: got, newer: true, closed: false };
            } else {
                console.error("The cloud's save couldn't be read", e);
                this.problem = "refused";
            }
            return;
        }
        const hash = fingerprint(save);
        if (ifSame && hash !== fingerprint(this.host.save())) {
            const { revision, summary, updatedAt } = got;
            this.choice = { cloud: { revision, summary, updatedAt }, newer: false, closed: false };
            return;
        }
        // In step before it goes in, so going in isn't a change to upload
        Object.assign(state, { revision: got.revision, hash, syncedAt: Date.now() });
        this.write();
        this.choice = undefined;
        // The same save needn't go in again
        if (!ifSame) {
            this.host.apply(save);
        }
    }

    private async put(force: boolean): Promise<void> {
        const state = this.state!;
        const save = this.host.save();
        // What goes up: a change made while it's on its way is left for the next save point
        const hash = fingerprint(save);
        this.lastUpload = Date.now();
        const response = await this.call("PUT", "save", state.code, {
            baseRevision: state.revision,
            save: exportSave(save, this.host.gameVersion),
            ...(force && { force }),
        });
        const { status, data } = response;
        if (status === 200) {
            Object.assign(state, { revision: data.revision, hash, syncedAt: Date.now() });
            this.write();
            this.choice = undefined;
            this.problem = undefined;
        } else if (status === 409) {
            const newer =
                data?.reason === "newer" ||
                (data?.summary !== undefined &&
                    compareGameVersions(data.summary.gameVersion, this.host.gameVersion) > 0);
            this.choice = { cloud: data, newer, closed: false };
        } else {
            this.problem = this.problemOf(status);
        }
    }

    // A request whose answer's only wanted when it worked: otherwise it's noted as a problem
    private async request(method: string, path: string): Promise<any> {
        const { status, data } = await this.call(method, path, this.state?.code);
        if (status === 200) {
            this.problem = undefined;
            return data;
        }
        this.problem = this.problemOf(status);
        return undefined;
    }

    private problemOf(status: number): CloudProblem {
        return status === 401 ? "unknownCode" : [400, 413].includes(status) ? "refused" : "offline";
    }

    private async call(
        method: string,
        path: string,
        code?: string,
        body?: unknown,
    ): Promise<{ status: number; data: any }> {
        const response = await this.fetcher(`${this.url}/v1/${path}`, {
            method,
            cache: "no-store",
            credentials: "omit",
            headers: {
                ...(code && { Authorization: `Bearer ${code}` }),
                ...(body !== undefined && { "Content-Type": "application/json" }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        let data: any;
        try {
            data = await response.json();
        } catch {
            data = undefined;
        }
        return { status: response.status, data };
    }

    // Runs after whatever's already going. A request that can't get through is a problem, not
    // an error: the save's still here, and it tries again on the next change or check.
    private run(task: () => Promise<void>): Promise<void> {
        const next = this.queue.then(async () => {
            this.working = true;
            this.emit();
            try {
                await task();
            } catch (e) {
                console.warn("Cloud save couldn't reach its server", e);
                this.problem = "offline";
            } finally {
                this.working = false;
                this.emit();
            }
        });
        this.queue = next;
        return next;
    }

    private write(): void {
        try {
            this.storage?.setItem(CLOUD_STATE_KEY, JSON.stringify(this.state));
        } catch (e) {
            console.error("Failed to keep the cloud save's state", e);
        }
    }

    private emit(): void {
        if (!this.state && !this.available) {
            this.host.onView(undefined);
            return;
        }
        this.host.onView({
            code: this.state?.code,
            syncedAt: this.state?.syncedAt,
            working: this.working,
            problem: this.problem,
            choice: this.choice,
        });
    }
}
