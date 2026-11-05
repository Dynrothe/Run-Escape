import { cleanAction, cleanMove as gameCleanMove } from "../src/game/core/lockstep";
import { RunWatch, actionKey, cleanMove, endsCaughtRuns, heroIdsOf } from "./coop-checks.mjs";

describe("the relay's copy of the host's checks", () => {
    it("cleans a move and an action as the game does", () => {
        for (const move of [
            [127, 0],
            [127, 127],
            [-300, 40],
            [0.4, -0.6],
            [90, 90],
            [Infinity, 0],
            [1],
        ]) {
            expect(cleanMove(move)).toEqual(gameCleanMove(move));
        }
        for (const action of [
            { kind: "choose", index: 2 },
            { kind: "choose", index: 64 },
            { kind: "chest", action: "alch" },
            { kind: "chest", action: "steal" },
            { kind: "reroll", index: 3 },
            { kind: "nope" },
        ]) {
            const clean = cleanAction(action);
            expect(actionKey(action)).toBe(clean && actionKey(clean));
            expect(actionKey(action) === undefined).toBe(clean === undefined);
        }
    });

    it("takes the heroes from a start any game would play", () => {
        expect(heroIdsOf({ heroes: [{ id: "a" }, { id: "b" }] }, 4)).toEqual(["a", "b"]);
        expect(heroIdsOf({ heroes: [] }, 4)).toBeUndefined();
        expect(heroIdsOf({ heroes: [{ id: "a" }, { id: 2 }] }, 4)).toBeUndefined();
        expect(heroIdsOf({ heroes: Array(5).fill({ id: "a" }) }, 4)).toBeUndefined();
        expect(heroIdsOf(null, 4)).toBeUndefined();
    });

    it("ends runs only when it's set to", () => {
        expect(endsCaughtRuns({})).toBe(false);
        expect(endsCaughtRuns({ MULTIPLAYER_RUN_CHECKS: "log" })).toBe(false);
        expect(endsCaughtRuns({ MULTIPLAYER_RUN_CHECKS: "End" })).toBe(true);
    });
});

describe("watching a run", () => {
    const TICK = 20;
    let reports: [string, any][];
    let caught: string[];
    let now: number;
    let frame: number;
    let watch: RunWatch;

    const make = (resumed = false) =>
        new RunWatch(["host", "guest"], "host", {
            now,
            resumed,
            report: (kind, detail) => reports.push([kind, detail]),
            caught: (kind) => caught.push(kind),
        });

    beforeEach(() => {
        reports = [];
        caught = [];
        now = 1_000_000;
        frame = 0;
        watch = make();
    });

    // Time passing, with the host's frames on time, and these events in the
    // last of them
    const pass = (ms: number, events: object[] = []) => {
        const until = now + ms;
        while (now + TICK * 2 <= until) {
            now += TICK * 2;
            frame += 2;
            watch.down({ from: frame - 2, upTo: frame, events: [] }, now);
        }
        now = until;
        frame = Math.max(frame + 1, Math.floor((now - 1_000_000) / TICK));
        watch.down({ upTo: frame, events: events.map((e) => ({ frame, ...e })) }, now);
    };
    const kinds = () => reports.map(([kind]) => kind);

    it("finds nothing in an honest run", () => {
        pass(4000);
        watch.up("guest", { move: [127, 0], moveSeq: 1 }, now);
        pass(100, [
            { hero: 1, move: [127, 0], moveSeq: 1 },
            { hero: 0, move: [0, 127] },
        ]);
        // Held, and sent again each time it's refreshed
        watch.up("guest", { move: [127, 0], moveSeq: 2 }, now);
        pass(200, [{ hero: 1, move: [127, 0], moveSeq: 2 }]);
        watch.up("guest", { action: { kind: "ability" }, actionSeq: 1 }, now);
        // Sent again after a dropped connection, which the host takes once
        watch.up("guest", { action: { kind: "ability" }, actionSeq: 1 }, now);
        pass(60, [{ hero: 1, action: { kind: "ability" }, actionSeq: 1 }]);
        watch.up("guest", { action: { kind: "choose", index: 1 } }, now);
        pass(60, [{ hero: 1, action: { kind: "choose", index: 1 } }]);
        // Kept everyone waiting, then decided for, and again after that
        pass(20_000, [{ hero: 1, action: { kind: "choose", index: 0 }, auto: true }]);
        pass(20_000, [{ hero: 1, action: { kind: "chest", action: "take" }, auto: true }]);
        // A banish leaves the host waiting, so it can decide just after one
        pass(19_900);
        watch.up("guest", { action: { kind: "banish", index: 2 } }, now);
        pass(60, [{ hero: 1, action: { kind: "banish", index: 2 } }]);
        pass(40, [{ hero: 1, action: { kind: "choose", index: 0 }, auto: true }]);
        // And an answer can cross the host deciding, landing after it
        pass(19_900);
        watch.up("guest", { action: { kind: "event", index: 0 } }, now);
        pass(100, [{ hero: 1, action: { kind: "leaveEvent" }, auto: true }]);
        pass(40, [{ hero: 1, action: { kind: "event", index: 0 } }]);
        // The host's own and a guest leaving aren't theirs to check
        pass(100, [
            { hero: 0, action: { kind: "reroll" } },
            { hero: 1, leave: true },
        ]);
        expect(reports).toEqual([]);
    });

    it("takes lag, a stall and a dropped connection", () => {
        pass(12_000);
        // The host's connection stalls 8 seconds, its frames held, then
        // they all come at once, the oldest first
        for (let i = 400; i >= 0; i -= 40) {
            watch.down({ upTo: frame + 400 - i, events: [] }, now + 8000);
        }
        now += 8000;
        frame += 400;
        pass(1000);
        // A guest's move on a connection that's slow today
        watch.up("guest", { move: [0, -127] }, now);
        pass(3000, [{ hero: 1, move: [0, -127] }]);
        // A host that can't keep up loses time, and never makes it up
        for (let i = 0; i < 500; i++) {
            now += 40;
            frame += 1;
            watch.down({ upTo: frame, events: [] }, now);
        }
        // A guest further behind asks for the last few again
        watch.down(
            {
                from: frame - 40,
                upTo: frame,
                events: [{ frame: frame - 10, hero: 1, move: [1, 2] }],
            },
            now,
        );
        expect(reports).toEqual([]);
    });

    it("takes the first frames coming late, then catching up", () => {
        // Two seconds of them six seconds late, then the rest at once
        for (let t = 0; t <= 2000; t += 40) {
            watch.down({ upTo: t / TICK, events: [] }, now + 6000 + t);
        }
        for (frame = 102; frame <= 400; frame += 2) {
            watch.down({ upTo: frame, events: [] }, now + 8000);
        }
        now += 8000;
        pass(30_000);
        expect(reports).toEqual([]);
    });

    it("waits on a watch made again mid-run, which doesn't know what came before", () => {
        pass(2000);
        watch = make(true);
        // The host's frames held through the restart, with a move the guest
        // sent before it, and the host deciding for a guest it waited on
        pass(1000, [{ hero: 1, move: [127, 0] }]);
        pass(1000, [{ hero: 1, action: { kind: "choose", index: 0 }, auto: true }]);
        pass(20_000);
        expect(reports).toEqual([]);
        pass(5000, [{ hero: 1, move: [127, 0] }]);
        expect(kinds()).toEqual(["move"]);
    });

    it("finds moves and actions a guest never sent", () => {
        pass(4000);
        watch.up("guest", { move: [0, 127] }, now);
        pass(100, [{ hero: 1, move: [127, 0] }]);
        watch.up("guest", { action: { kind: "choose", index: 1 } }, now);
        pass(100, [{ hero: 1, action: { kind: "choose", index: 2 } }]);
        expect(kinds()).toEqual(["move", "action"]);
        // Each one sent goes in once
        reports = [];
        watch.up("guest", { action: { kind: "reroll" }, actionSeq: 4 }, now);
        pass(100, [{ hero: 1, action: { kind: "reroll" }, actionSeq: 4 }]);
        pass(61_000, [{ hero: 1, action: { kind: "reroll" }, actionSeq: 4 }]);
        expect(reports).toEqual([["action", { hero: 1, frame, count: 2 }]]);
    });

    it("finds a guest decided for before they could have kept anyone waiting", () => {
        pass(4000);
        pass(1000, [{ hero: 1, action: { kind: "choose", index: 0 }, auto: true }]);
        expect(kinds()).toEqual(["auto"]);
        reports = [];
        pass(61_000, [{ hero: 1, action: { kind: "choose", index: 1 }, auto: true }]);
        pass(5000, [{ hero: 1, action: { kind: "chest", action: "take" }, auto: true }]);
        expect(kinds()).toEqual(["auto"]);
    });

    it("finds frames running ahead of real time", () => {
        pass(12_000);
        // A tenth as fast again, then half
        for (let i = 0; i < 25 * 30; i++) {
            now += 40;
            frame += i < 25 * 20 ? 2.2 : 3;
            watch.down({ upTo: Math.floor(frame), events: [] }, now);
        }
        expect(kinds()).toEqual(["ahead"]);
        expect(caught).toEqual(["ahead"]);
    });

    it("logs each kind once a minute, and says when a host's caught, once", () => {
        pass(4000);
        for (let i = 0; i < 5; i++) {
            pass(1000, [{ hero: 1, move: [127, 0] }]);
        }
        expect(reports).toEqual([["move", { hero: 1, frame: expect.any(Number), count: 1 }]]);
        expect(caught).toEqual(["move"]);
        pass(60_000, [{ hero: 1, action: { kind: "skip" } }]);
        pass(1000, [{ hero: 1, move: [127, 0] }]);
        expect(kinds()).toEqual(["move", "action", "move"]);
        expect(reports.at(-1)).toEqual(["move", { hero: 1, frame, count: 6 }]);
        expect(caught).toEqual(["move"]);
    });

    it("copes with nonsense", () => {
        for (const d of [
            undefined,
            null,
            "x",
            { upTo: "x" },
            { upTo: 5, events: [null, 4, { frame: 6, hero: 9 }, { frame: 6, hero: -1 }] },
        ]) {
            watch.down(d, now);
        }
        for (const d of [undefined, { move: "x" }, { action: null }, { action: { kind: "x" } }]) {
            watch.up("guest", d, now);
            watch.up("stranger", d, now);
        }
        expect(reports).toEqual([]);
    });
});
