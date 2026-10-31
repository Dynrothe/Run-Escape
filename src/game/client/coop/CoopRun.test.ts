import { emptyStats } from "../../content/types";
import { Sim, TICKS_PER_SECOND } from "../../core/Sim";
import { fm, usePortableMath } from "../../core/fmath";
import { syncHash } from "../../core/lockstep";
import { makeGrid } from "../../core/world/testGrid";
import { CoopLink, CoopRun } from "./CoopRun";
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
            runs.push(new CoopRun(createSim(i), i === 0, link, heroes, "host"));
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
});
