// Who this game is to the co-op relay, and its friends, kept in the browser. Apart from the
// save on purpose, like the cloud save's sync code: the secret is this game's identity, so it
// must never go out in an exported or cloud save. Never rename the key, as with the save's.
import { MAX_FRIENDS, MAX_NAME_LENGTH, parseFriendCode } from "./protocol";

export const FRIENDS_KEY = "rune-survivors-friends";
const FRIENDS_VERSION = 1;

// The people played with that are kept, newest first
export const MAX_RECENT = 20;
// Codes whose requests are hidden
const MAX_IGNORED = 200;
// A name as the relay gave it is cleaned there; this only keeps a bad one small
const MAX_KEPT_NAME = 64;
// As the relay takes it in hello
const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

// A friend: their code, their name when last heard of, when they were added, and seen once the
// relay's shown them online (which it only does once they've added this game back)
export type StoredFriend = { id: string; name: string; addedAt: number; seen?: true };

// Someone played a co-op run with
export type RecentPlayer = { id: string; name: string; at: number };

export type FriendsData = {
    version: number;
    secret: string;
    // The name this player picked (or kept from "New name"), which hello carries
    name?: string;
    friends: StoredFriend[];
    ignored: string[];
    recent: RecentPlayer[];
};

export type AddResult = "added" | "invalid" | "self" | "already" | "full";

type Store = Pick<Storage, "getItem" | "setItem">;

function localStore(): Store | undefined {
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}

// 32 random bytes, base64url. getRandomValues and not crypto.subtle, which a page served over
// plain http (a LAN's) doesn't get.
export function makeSecret(): string {
    const bytes = new Uint8Array(32);
    try {
        globalThis.crypto.getRandomValues(bytes);
    } catch {
        // A browser too old to have it: weaker, but still a secret of its own
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    let text = "";
    for (const byte of bytes) {
        text += String.fromCharCode(byte);
    }
    return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A name as typed: one line, spaces tidied, no longer than the relay takes. Empty if nothing's
// left.
export function cleanName(text: string): string {
    return text.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
}

function isCode(id: unknown): id is string {
    return typeof id === "string" && parseFriendCode(id) === id;
}

function keptName(name: unknown): string {
    return typeof name === "string" ? name.slice(0, MAX_KEPT_NAME) : "";
}

function isTime(at: unknown): at is number {
    return typeof at === "number" && Number.isFinite(at) && at >= 0;
}

// What was kept, every field checked: anything that isn't right is left out, so a broken or
// tampered record loads as much as it can. undefined without a secret.
export function readFriendsData(raw: unknown): FriendsData | undefined {
    const data = raw as Partial<Record<keyof FriendsData, unknown>> | null;
    if (!data || typeof data !== "object" || typeof data.secret !== "string") {
        return undefined;
    }
    if (!SECRET_PATTERN.test(data.secret)) {
        return undefined;
    }
    const friends: StoredFriend[] = [];
    if (Array.isArray(data.friends)) {
        for (const friend of data.friends as Partial<StoredFriend>[]) {
            if (
                friend &&
                isCode(friend.id) &&
                !friends.some((f) => f.id === friend.id) &&
                friends.length < MAX_FRIENDS
            ) {
                friends.push({
                    id: friend.id,
                    name: keptName(friend.name),
                    addedAt: isTime(friend.addedAt) ? friend.addedAt : 0,
                    ...(friend.seen === true && { seen: true as const }),
                });
            }
        }
    }
    const ignored = Array.isArray(data.ignored)
        ? [...new Set(data.ignored.filter(isCode))].slice(0, MAX_IGNORED)
        : [];
    const recent: RecentPlayer[] = [];
    if (Array.isArray(data.recent)) {
        for (const player of data.recent as Partial<RecentPlayer>[]) {
            if (player && isCode(player.id) && !recent.some((p) => p.id === player.id)) {
                recent.push({
                    id: player.id,
                    name: keptName(player.name),
                    at: isTime(player.at) ? player.at : 0,
                });
            }
        }
    }
    const name = typeof data.name === "string" ? cleanName(data.name) : "";
    return tidy({
        version: FRIENDS_VERSION,
        secret: data.secret,
        ...(name && { name }),
        friends,
        ignored,
        recent,
    });
}

// The rules every write keeps: friends aren't ignored or in recent, and recent is newest first
// and capped
function tidy(data: FriendsData): FriendsData {
    const friends = new Set(data.friends.map((f) => f.id));
    return {
        ...data,
        ignored: data.ignored.filter((id) => !friends.has(id)),
        recent: data.recent
            .filter((p) => !friends.has(p.id))
            .sort((a, b) => b.at - a.at)
            .slice(0, MAX_RECENT),
    };
}

// The record in the browser. Two tabs share it, so every change reads it again first and is
// made on what's there, and a change from another tab comes in by the storage event (listen).
export class FriendsStore {
    private current: FriendsData;

    constructor(private readonly storage: Store | undefined = localStore()) {
        const kept = this.read();
        if (kept) {
            this.current = kept;
        } else {
            this.current = {
                version: FRIENDS_VERSION,
                secret: makeSecret(),
                friends: [],
                ignored: [],
                recent: [],
            };
            this.write();
            // Another tab that made one at the same moment wins, so both have the same
            this.current = this.read() ?? this.current;
        }
    }

    get data(): Readonly<FriendsData> {
        return this.current;
    }

    private read(): FriendsData | undefined {
        try {
            return readFriendsData(JSON.parse(this.storage?.getItem(FRIENDS_KEY) ?? "null"));
        } catch {
            return undefined;
        }
    }

    private write(): void {
        try {
            this.storage?.setItem(FRIENDS_KEY, JSON.stringify(this.current));
        } catch (e) {
            console.error("Failed to keep the friends list", e);
        }
    }

    // Reads it again (another tab may have changed it). Whether it's different now.
    reload(): boolean {
        const kept = this.read();
        if (!kept || JSON.stringify(kept) === JSON.stringify(this.current)) {
            return false;
        }
        this.current = kept;
        return true;
    }

    // A change, made on what's kept now (another tab's changes too), and kept
    private change(edit: (data: FriendsData) => void): void {
        const data = structuredClone(this.read() ?? this.current);
        edit(data);
        this.current = tidy(data);
        this.write();
    }

    // Calls back when another tab changes the record. Returns what stops it.
    listen(onChange: () => void): () => void {
        const listener = (event: StorageEvent) => {
            if ((event.key === FRIENDS_KEY || event.key === null) && this.reload()) {
                onChange();
            }
        };
        try {
            window.addEventListener("storage", listener);
            return () => window.removeEventListener("storage", listener);
        } catch {
            return () => {};
        }
    }

    // self: this game's own code, if known
    add(id: string, name: string, self?: string, now = Date.now()): AddResult {
        if (!isCode(id)) {
            return "invalid";
        }
        if (id === self) {
            return "self";
        }
        this.reload();
        if (this.current.friends.some((f) => f.id === id)) {
            return "already";
        }
        if (this.current.friends.length >= MAX_FRIENDS) {
            return "full";
        }
        this.change((data) => {
            if (!data.friends.some((f) => f.id === id) && data.friends.length < MAX_FRIENDS) {
                data.friends.push({ id, name: keptName(name), addedAt: now });
            }
            // Adding someone ignored lets their requests through again
            data.ignored = data.ignored.filter((code) => code !== id);
        });
        return "added";
    }

    remove(id: string): void {
        this.change((data) => {
            data.friends = data.friends.filter((f) => f.id !== id);
        });
    }

    // What the relay's said about a friend: they're mutual (seen), and their name now
    noteFriend(id: string, name: string | undefined, seen: boolean): void {
        const friend = this.current.friends.find((f) => f.id === id);
        if (
            !friend ||
            ((name === undefined || keptName(name) === friend.name) && (!seen || friend.seen))
        ) {
            return;
        }
        this.change((data) => {
            const kept = data.friends.find((f) => f.id === id);
            if (kept) {
                if (name !== undefined) {
                    kept.name = keptName(name);
                }
                if (seen) {
                    kept.seen = true;
                }
            }
        });
    }

    ignore(id: string): void {
        if (!isCode(id)) {
            return;
        }
        this.change((data) => {
            if (!data.ignored.includes(id)) {
                data.ignored = [id, ...data.ignored].slice(0, MAX_IGNORED);
            }
        });
    }

    // The name to carry in hello; empty for none
    setName(name: string): void {
        const clean = cleanName(name);
        if (clean === (this.current.name ?? "")) {
            return;
        }
        this.change((data) => {
            if (clean) {
                data.name = clean;
            } else {
                delete data.name;
            }
        });
    }

    // People just played with: newest first, never friends (tidy) or this game itself
    noteRecent(players: { id: string; name: string }[], self?: string, now = Date.now()): void {
        const fresh = players.filter((p) => isCode(p.id) && p.id !== self);
        if (fresh.length === 0) {
            return;
        }
        this.change((data) => {
            const ids = new Set(fresh.map((p) => p.id));
            data.recent = [
                ...fresh.map((p) => ({ id: p.id, name: keptName(p.name), at: now })),
                ...data.recent.filter((p) => !ids.has(p.id)),
            ];
        });
    }
}
