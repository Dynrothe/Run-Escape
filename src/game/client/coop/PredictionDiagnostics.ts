// Opt-in, local measurements. No logging, timers, uploads or per-frame allocations.
// Summary counters cover every frame; the last 64 detail samples are capped at 10Hz.
class Measure {
    count = 0;
    total = 0;
    max = 0;

    add(value: number): void {
        this.count++;
        this.total += value;
        this.max = Math.max(this.max, value);
    }

    snapshot() {
        return { count: this.count, mean: this.count ? this.total / this.count : 0, max: this.max };
    }
}

type Mode = "moving" | "idle" | "pending-stop" | "halted" | "stalled" | "fallback";
type Sample = {
    atMs: number;
    renderGapMs: number;
    leadMs: number;
    confirmedAgeMs: number;
    errorTiles: number;
    correctionTiles: number;
    mode: Mode;
};

export class PredictionDiagnostics {
    readonly inputToSendMs = new Measure();
    // Includes relay/host scheduling and the guest's frame buffer, NOT just ping.
    readonly sendToConfirmMs = new Measure();
    readonly inputToConfirmMs = new Measure();
    readonly renderGapMs = new Measure();
    readonly leadMs = new Measure();
    readonly confirmedAgeMs = new Measure();
    readonly errorTiles = new Measure();
    correctionTiles = 0;
    idleCorrectionTiles = 0;
    fallbackCorrectionTiles = 0;
    correctedFrames = 0;
    longRenderFrames = 0;
    haltedFrames = 0;
    stalledFrames = 0;
    pendingStopFrames = 0;
    distanceSnaps = 0;
    wallSnaps = 0;
    teleports = 0;
    private readonly samples: Sample[] = Array.from({ length: 64 }, () => ({
        atMs: 0,
        renderGapMs: 0,
        leadMs: 0,
        confirmedAgeMs: 0,
        errorTiles: 0,
        correctionTiles: 0,
        mode: "idle",
    }));
    private sampleCount = 0;
    private sampledAt = -Infinity;

    constructor(private readonly startedAt: number) {}

    frame(
        time: number,
        dt: number,
        lead: number,
        age: number,
        error: number,
        correction: number,
        mode: Mode,
    ): void {
        this.renderGapMs.add(dt);
        this.leadMs.add(Math.max(0, lead));
        this.confirmedAgeMs.add(age);
        if (dt > 50) this.longRenderFrames++;
        if (mode === "halted") this.haltedFrames++;
        if (mode === "stalled") this.stalledFrames++;
        if (mode === "pending-stop") this.pendingStopFrames++;
        if (mode === "fallback") this.fallbackCorrectionTiles += correction;
        else if (mode === "moving" || mode === "idle" || mode === "pending-stop") {
            this.errorTiles.add(error);
            this.correctionTiles += correction;
            if (mode === "idle" || mode === "pending-stop") this.idleCorrectionTiles += correction;
        }
        if (correction > 1e-9) this.correctedFrames++;
        if (time - this.sampledAt < 100) return;
        this.sampledAt = time;
        const sample = this.samples[this.sampleCount++ % this.samples.length];
        sample.atMs = time - this.startedAt;
        sample.renderGapMs = dt;
        sample.leadMs = lead;
        sample.confirmedAgeMs = age;
        sample.errorTiles = error;
        sample.correctionTiles = correction;
        sample.mode = mode;
    }

    snapshot(time: number) {
        const count = Math.min(this.sampleCount, this.samples.length);
        return {
            durationMs: Math.max(0, time - this.startedAt),
            inputToSendMs: this.inputToSendMs.snapshot(),
            sendToConfirmMs: this.sendToConfirmMs.snapshot(),
            inputToConfirmMs: this.inputToConfirmMs.snapshot(),
            renderGapMs: this.renderGapMs.snapshot(),
            leadMs: this.leadMs.snapshot(),
            confirmedAgeMs: this.confirmedAgeMs.snapshot(),
            errorTiles: this.errorTiles.snapshot(),
            correctionTiles: this.correctionTiles,
            idleCorrectionTiles: this.idleCorrectionTiles,
            fallbackCorrectionTiles: this.fallbackCorrectionTiles,
            correctedFrames: this.correctedFrames,
            longRenderFrames: this.longRenderFrames,
            haltedFrames: this.haltedFrames,
            stalledFrames: this.stalledFrames,
            pendingStopFrames: this.pendingStopFrames,
            distanceSnaps: this.distanceSnaps,
            wallSnaps: this.wallSnaps,
            teleports: this.teleports,
            samples: Array.from({ length: count }, (_, i) => ({
                ...this.samples[(this.sampleCount - count + i) % this.samples.length],
            })),
        };
    }
}
