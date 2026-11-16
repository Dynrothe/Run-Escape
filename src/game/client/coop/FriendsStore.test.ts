import { FRIENDS_KEY, FriendsStore, MAX_RECENT, makeSecret, readFriendsData } from "./FriendsStore";
import { MAX_FRIENDS } from "./protocol";

// localStorage as one browser has it, for every tab
function memory(initial?: string) {
    const items = new Map<string, string>();
    if (initial !== undefined) {
        items.set(FRIENDS_KEY, initial);
    }
    return {
        items,
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
    };
}

const SECRET = "a".repeat(43);
const code = (n: number) => `FRIEND${String(n).padStart(6, "0")}`;

describe("the friends record", () => {
    it("makes a secret once, and keeps it", () => {
        const storage = memory();
        const first = new FriendsStore(storage);
        expect(first.data.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(new FriendsStore(storage).data.secret).toBe(first.data.secret);
        // Never the same twice
        expect(makeSecret()).not.toBe(makeSecret());
    });

    it("comes back as it was kept", () => {
        const storage = memory();
        const store = new FriendsStore(storage);
        expect(store.add(code(1), "Steady Chicken")).toBe("added");
        store.setName("  Zezima  ");
        store.ignore(code(2));
        store.noteRecent([{ id: code(3), name: "Lucky Cow" }]);
        const again = new FriendsStore(storage);
        expect(again.data).toEqual(store.data);
        expect(again.data).toMatchObject({
            name: "Zezima",
            friends: [{ id: code(1), name: "Steady Chicken" }],
            ignored: [code(2)],
            recent: [{ id: code(3), name: "Lucky Cow" }],
        });
    });

    it("loads what it can of a broken record, and starts again from garbage", () => {
        expect(new FriendsStore(memory("{not json")).data.friends).toEqual([]);
        expect(readFriendsData(null)).toBeUndefined();
        expect(readFriendsData({ secret: "short" })).toBeUndefined();
        const data = readFriendsData({
            secret: SECRET,
            name: 42,
            friends: [
                { id: code(1), name: "Good", addedAt: 5, seen: true },
                { id: code(1), name: "Twice" },
                { id: "nope", name: "Bad code" },
                null,
                { id: code(2), name: { x: 1 }, addedAt: "soon", seen: "yes" },
            ],
            ignored: [code(3), code(3), 7, "bad"],
            recent: "everyone",
        })!;
        expect(data.secret).toBe(SECRET);
        expect(data.name).toBeUndefined();
        expect(data.friends).toEqual([
            { id: code(1), name: "Good", addedAt: 5, seen: true },
            { id: code(2), name: "", addedAt: 0 },
        ]);
        expect(data.ignored).toEqual([code(3)]);
        expect(data.recent).toEqual([]);
        // A secret that won't do makes a new one
        const store = new FriendsStore(memory(JSON.stringify({ secret: "!!" })));
        expect(store.data.secret).not.toBe("!!");
    });

    it("keeps no more friends than the relay takes", () => {
        const friends = Array.from({ length: MAX_FRIENDS + 50 }, (_, i) => ({
            id: code(i),
            name: "x",
            addedAt: 1,
        }));
        const store = new FriendsStore(memory(JSON.stringify({ secret: SECRET, friends })));
        expect(store.data.friends).toHaveLength(MAX_FRIENDS);
        expect(store.add(code(99_999), "One more")).toBe("full");
    });

    it("says why a code wasn't added", () => {
        const store = new FriendsStore(memory());
        expect(store.add("short", "")).toBe("invalid");
        expect(store.add(code(1), "", code(1))).toBe("self");
        expect(store.add(code(1), "")).toBe("added");
        expect(store.add(code(1), "")).toBe("already");
    });

    it("lets an ignored player through again once they're added", () => {
        const store = new FriendsStore(memory());
        store.ignore(code(1));
        expect(store.data.ignored).toEqual([code(1)]);
        store.add(code(1), "Back again");
        expect(store.data.ignored).toEqual([]);
    });

    it("keeps recent players newest first, without friends or this game, up to its cap", () => {
        const store = new FriendsStore(memory());
        store.add(code(1), "Friend");
        let now = 1000;
        for (let i = 0; i < MAX_RECENT + 5; i++) {
            store.noteRecent([{ id: code(100 + i), name: `P${i}` }], undefined, now++);
        }
        store.noteRecent(
            [
                { id: code(1), name: "Friend" },
                { id: code(2), name: "Me" },
                { id: code(100), name: "P0 again" },
            ],
            code(2),
            now++,
        );
        const recent = store.data.recent;
        expect(recent).toHaveLength(MAX_RECENT);
        expect(recent[0]).toMatchObject({ id: code(100), name: "P0 again" });
        expect(recent.some((p) => p.id === code(1) || p.id === code(2))).toBe(false);
        expect(recent[1].name).toBe(`P${MAX_RECENT + 4}`);
        // Added as a friend: out of recent
        store.add(code(100), "P0");
        expect(store.data.recent.some((p) => p.id === code(100))).toBe(false);
    });

    it("notes a friend's name and that they're mutual, writing only on a change", () => {
        const storage = memory();
        const store = new FriendsStore(storage);
        store.add(code(1), "");
        const write = vi.spyOn(storage, "setItem");
        store.noteFriend(code(1), "Named Now", true);
        store.noteFriend(code(1), "Named Now", true);
        expect(write).toHaveBeenCalledTimes(1);
        expect(store.data.friends[0]).toMatchObject({ name: "Named Now", seen: true });
    });

    it("doesn't undo another tab's changes, and hears of them", () => {
        const listeners: ((event: { key: string | null }) => void)[] = [];
        vi.stubGlobal("window", {
            addEventListener: (_: string, f: (event: { key: string | null }) => void) =>
                listeners.push(f),
            removeEventListener: () => {},
        });
        try {
            const storage = memory();
            const one = new FriendsStore(storage);
            const two = new FriendsStore(storage);
            expect(two.data.secret).toBe(one.data.secret);
            const heard = vi.fn();
            one.listen(heard);
            two.add(code(1), "From two");
            // The storage event, as the browser sends it to the other tab
            for (const listener of listeners) {
                listener({ key: FRIENDS_KEY });
            }
            expect(heard).toHaveBeenCalledOnce();
            expect(one.data.friends.map((f) => f.id)).toEqual([code(1)]);
            // Even unheard, a change is made on what's kept
            two.add(code(2), "Also two");
            one.add(code(3), "From one");
            expect(new FriendsStore(storage).data.friends.map((f) => f.id)).toEqual([
                code(1),
                code(2),
                code(3),
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("works with no storage at all", () => {
        const store = new FriendsStore(undefined);
        expect(store.data.secret.length).toBeGreaterThanOrEqual(32);
        expect(store.add(code(1), "x")).toBe("added");
        const throwing = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("blocked");
            },
        };
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        const blocked = new FriendsStore(throwing);
        expect(blocked.add(code(1), "x")).toBe("added");
        errors.mockRestore();
    });
});
