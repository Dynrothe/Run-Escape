// Rendering can stop when a browser window is covered, before (or without)
// a visibilitychange. Keep the co-op timer ready from the start of the run.
// Both sources use the same clock: returning to the tab must not count time
// that the background timer already simulated.
export class CoopTicker {
    private worker?: Worker;
    private fallback?: number;
    private stopped = false;
    private steppedAt: number;
    private renderedAt: number;

    constructor(
        private readonly step: (elapsed: number) => void,
        private readonly interval: number,
        private readonly now: () => number = () => performance.now(),
    ) {
        this.steppedAt = this.renderedAt = now();
        let url: string | undefined;
        try {
            url = URL.createObjectURL(
                new Blob([`setInterval(() => postMessage(0), ${interval});`], {
                    type: "text/javascript",
                }),
            );
            const worker = new Worker(url);
            this.worker = worker;
            worker.onmessage = () => this.background();
            worker.onerror = () => {
                if (!this.stopped && this.worker === worker) {
                    this.useFallback();
                }
            };
        } catch {
            this.useFallback();
        } finally {
            if (url !== undefined) {
                URL.revokeObjectURL(url);
            }
        }
    }

    // Called by rendering, but its elapsed time comes from this clock rather
    // than the renderer's last frame (which can be seconds or minutes old).
    render(): void {
        const now = this.now();
        this.renderedAt = now;
        this.advance(now);
    }

    private background(): void {
        const now = this.now();
        // No extra game updates while rendering is keeping up. A covered or
        // hidden window starts using the worker after two simulation ticks.
        if (now - this.renderedAt >= this.interval * 2) {
            this.advance(now);
        }
    }

    private advance(now: number): void {
        if (this.stopped || now <= this.steppedAt) {
            return;
        }
        const elapsed = now - this.steppedAt;
        this.steppedAt = now;
        this.step(elapsed);
    }

    private useFallback(): void {
        this.worker?.terminate();
        this.worker = undefined;
        // A blocked worker must not prevent starting the run. Rendering
        // remains the primary clock; this timer is a best-effort backup.
        this.fallback ??= window.setInterval(() => this.background(), this.interval);
    }

    stop(): void {
        this.stopped = true;
        this.worker?.terminate();
        this.worker = undefined;
        window.clearInterval(this.fallback);
        this.fallback = undefined;
    }
}
