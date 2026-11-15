import { CoopTicker } from "./CoopTicker";

class TimerWorker {
    static all: TimerWorker[] = [];
    onmessage?: () => void;
    onerror?: () => void;
    terminated = false;
    constructor() {
        TimerWorker.all.push(this);
    }
    terminate() {
        this.terminated = true;
    }
}

describe("the co-op simulation clock", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        TimerWorker.all = [];
        vi.stubGlobal("Worker", TimerWorker);
        vi.stubGlobal("window", { setInterval, clearInterval });
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:clock");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("keeps host time advancing when rendering stops without a visibility event", () => {
        let time = 0;
        let simulated = 0;
        const clock = new CoopTicker(
            (ms) => (simulated += ms),
            20,
            () => time,
        );
        const worker = TimerWorker.all[0];
        // Visible and rendering, then covered for a minute; no document.hidden
        // change or callback is needed to start the fallback.
        for (time = 20; time <= 1000; time += 20) {
            clock.render();
            worker.onmessage?.();
        }
        for (time = 1020; time <= 61_000; time += 20) worker.onmessage?.();
        expect(simulated).toBe(61_000);
        time = 61_020;
        clock.render();
        worker.onmessage?.();
        expect(simulated).toBe(61_020);
        expect(TimerWorker.all).toHaveLength(1);
        clock.stop();
    });

    it("doesn't double-count time when drawing and worker callbacks interleave", () => {
        let time = 0;
        let simulated = 0;
        const clock = new CoopTicker(
            (ms) => (simulated += ms),
            20,
            () => time,
        );
        const worker = TimerWorker.all[0];
        for (time = 1; time <= 10_000; time++) {
            if (time % 20 === 0) worker.onmessage?.();
            // Render at 60 Hz, then 10 Hz, then briefly not at all.
            if (time < 3000 ? time % 16 === 0 : time < 6000 && time % 100 === 0) clock.render();
        }
        time = 10_000;
        clock.render();
        expect(simulated).toBe(10_000);
        clock.stop();
    });

    it("ignores queued ticks after leaving and does not create another worker on focus changes", () => {
        let time = 0;
        const step = vi.fn();
        const clock = new CoopTicker(step, 20, () => time);
        const worker = TimerWorker.all[0];
        clock.stop();
        time = 1000;
        worker.onmessage?.();
        worker.onerror?.();
        clock.render();
        expect(step).not.toHaveBeenCalled();
        expect(worker.terminated).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("falls back safely if the browser refuses to start a worker", async () => {
        vi.stubGlobal(
            "Worker",
            class {
                constructor() {
                    throw new Error("blocked");
                }
            },
        );
        const step = vi.fn();
        const clock = new CoopTicker(step, 20, () => Date.now());
        await vi.advanceTimersByTimeAsync(100);
        expect(step).toHaveBeenCalled();
        clock.stop();
        expect(vi.getTimerCount()).toBe(0);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clock");
    });
});
