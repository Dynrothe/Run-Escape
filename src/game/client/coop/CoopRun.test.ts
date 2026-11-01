import { emptyStats } from "../../content/types";
import { Sim, TICKS_PER_SECOND } from "../../core/Sim";
import { fm, usePortableMath } from "../../core/fmath";
import { syncHash } from "../../core/lockstep";
import { makeGrid } from "../../core/world/testGrid";
import { CoopLink, CoopRun, DECIDE_AFTER_MS } from "./CoopRun";
import { DownMessage, UpMessage } from "./protocol";

function openField(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 72; y++) {
        let row = "";
        for (let x = 0; x < 72; x++) {
            row += x === 0 || y === 0 || x === 71 || y === 71 ? "#" : ".";
        }
        rows.push(row);
    }
    return rows;
}

const IDS = ["host", "guest1", "guest2"];

function createSim(focus: number): Sim {
    return new Sim({
        grid: makeGrid(openField(), 1000, 1000),
        characterId: "",
        metaStats: emptyStats(),
        seed: 3,
        spawnX: 1036.5,
        spawnY: 1036.5,
        party: ["warrior", "wizard", "ranger"].map((characterId, i) => ({
            name: IDS[i],
            characterId,
            metaStats: emptyStats(),
        })),
        focus,
    });
}

// Messages arrive a few ticks late, some later than others, but in the order
// they were sent (a WebSocket keeps them in order)
type Delivery = { at: number; order: number; deliver: () => void };

describe("co-op lockstep", () => {
    afterEach(() => usePortableMath(false));

    it("keeps everyone's run the same through a lagging network", () => {
        usePortableMath(true);
        let now = 0;
        let seed = 1;
        const lag = () => {
            seed = (seed * 16807) % 2147483647;
            return 1 + (seed % 6);
        };
        const queue: Delivery[] = [];
        let order = 0;
        // When each connection's last message arrives
        const lastAt = new Map<string, number>();
        const send = (channel: string, deliver: () => void) => {
            const at = Math.max(lastAt.get(channel) ?? 0, now + lag());
            lastAt.set(channel, at);
            queue.push({ at, order: order++, deliver });
        };
        const runs: CoopRun[] = [];
        const heroes = new Map(IDS.map((id, i) => [id, i]));
        IDS.forEach((id, i) => {
            const link: CoopLink = {
                sendUp: (message: UpMessage) =>
                    send(`up:${id}`, () => runs[0].receiveUp(id, message)),
                sendDown: (message: DownMessage) => {
                    runs.slice(1).forEach((run, guest) =>
                        send(`down:${guest}`, () => run.receiveDown(message)),
                    );
                },
            };
            // A clock that goes with the ticks, so it plays the same every time
            const clock = () => now * (1000 / TICKS_PER_SECOND);
            runs.push(new CoopRun(createSim(i), i === 0, link, heroes, "host", clock));
            if (i > 0) {
                link.sendUp({ loaded: true });
            }
        });

        for (now = 0; now < 60 * TICKS_PER_SECOND; now++) {
            queue.sort((a, b) => a.at - b.at || a.order - b.order);
            while (queue.length > 0 && queue[0].at <= now) {
                queue.shift()!.deliver();
            }
            runs.forEach((run, i) => {
                const sim = run.sim;
                const angle = now / 40 + i * 2;
                run.setMove(fm.cos(angle), fm.sin(angle));
                if (sim.state === "levelUp" && sim.pendingLevelUps > 0 && now % 7 === i) {
                    run.act({ kind: "choose", index: 0 });
                }
                if (sim.state === "chest" && sim.chest && now % 7 === i) {
                    run.act({ kind: "chest", action: "take" });
                }
                // A guest steps only what it has
                while (run.canStep() && (run.isHost || run.behind > 0)) {
                    run.stepFrame();
                    sim.takeEvents();
                    if (run.isHost) {
                        break;
                    }
                }
                run.flush();
            });
        }
        // Everything still on its way arrives, and the guests catch up
        runs[0].flush(true);
        for (const delivery of queue.sort((a, b) => a.at - b.at || a.order - b.order)) {
            delivery.deliver();
        }
        for (const run of runs.slice(1)) {
            while (run.canStep()) {
                run.stepFrame();
            }
        }
        const [host, ...guests] = runs;
        expect(host.sim.level).toBeGreaterThan(1);
        for (const guest of guests) {
            expect(guest.frame).toBe(host.frame);
            expect(guest.desynced).toBe(false);
            expect(syncHash(guest.sim)).toBe(syncHash(host.sim));
        }
    });

    // A host's run, on a clock the test moves, with what it sends kept
    function hostRun(clock: { now: number }) {
        const sent: DownMessage[] = [];
        const link: CoopLink = { sendUp: () => {}, sendDown: (m) => sent.push(m) };
        const heroes = new Map(IDS.map((id, i) => [id, i]));
        const run = new CoopRun(createSim(0), true, link, heroes, "host", () => clock.now);
        run.receiveUp("guest1", { loaded: true });
        run.receiveUp("guest2", { loaded: true });
        return { run, sent };
    }

    it("turns away a guest's input that isn't what the game sends", () => {
        const { run } = hostRun({ now: 0 });
        const bad: unknown[] = [
            null,
            { move: [NaN, 1] },
            { move: ["a", 1] },
            { move: [1, 2, 3] },
            { action: { kind: "choose", index: -1 } },
            { action: { kind: "choose", index: 1.5 } },
            { action: { kind: "nope" } },
            { action: { kind: "chest", action: "burn" } },
        ];
        for (const message of bad) {
            run.receiveUp("guest1", message as UpMessage);
        }
        expect(run.stepFrame()).toEqual([]);
        run.receiveUp("guest1", { move: [127, 0], action: { kind: "skip", extra: 1 } } as never);
        expect(run.stepFrame()).toEqual([{ frame: 2, hero: 1, move: [127, 0] }]);
    });

    it("decides for whoever keeps the run waiting", () => {
        const clock = { now: 0 };
        const { run } = hostRun(clock);
        const sim = run.sim;
        sim.xp = 100;
        run.stepFrame();
        expect(sim.state).toBe("levelUp");
        run.act({ kind: "choose", index: 0 });
        run.receiveUp("guest1", { action: { kind: "choose", index: 0 } });
        run.stepFrame();
        expect(sim.waitingOn.map((hero) => hero.index)).toEqual([2]);
        clock.now += DECIDE_AFTER_MS - 1;
        expect(run.stepFrame()).toEqual([]);
        clock.now += 2;
        const pending = sim.heroes[2].pendingLevelUps;
        expect(run.stepFrame()).toEqual([
            expect.objectContaining({ hero: 2, action: { kind: "choose", index: 0 }, auto: true }),
        ]);
        expect(sim.heroes[2].pendingLevelUps).toBe(pending - 1);
    });

    it("sends a move a touch stick keeps changing no more than about 15 times a second", () => {
        const clock = { now: 0 };
        const ups: UpMessage[] = [];
        const link: CoopLink = { sendUp: (m) => ups.push(m), sendDown: () => {} };
        const heroes = new Map(IDS.map((id, i) => [id, i]));
        const run = new CoopRun(createSim(1), false, link, heroes, "host", () => clock.now);
        for (let i = 0; i < 10; i++) {
            run.setMove(i / 10, 0.5);
            clock.now += 16;
        }
        expect(ups.length).toBeLessThanOrEqual(3);
        // Where it ended up gets there
        clock.now += 100;
        run.setMove(0.9, 0.5);
        expect(ups.at(-1)).toEqual({ move: [114, 64] });
    });
});
