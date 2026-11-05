import { describe, expect, it } from "vitest";

import { MusicSync, holdPitch, loopDrift, nudgedRate, whenForTick } from "./BeatAudio";

describe("BeatAudio", () => {
    it("measures drift the short way round a loop", () => {
        expect(loopDrift(10.1, 10, 462)).toBeCloseTo(0.1);
        expect(loopDrift(9.9, 10, 462)).toBeCloseTo(-0.1);
        // The track's looped and the beat hasn't: just past its start is just ahead
        expect(loopDrift(0.05, 462, 462)).toBeCloseTo(0.05);
        expect(loopDrift(461.95, 462.02, 462)).toBeCloseTo(-0.07);
    });

    it("nudges the rate by at most 3% towards the beat", () => {
        expect(nudgedRate(1.25, 0)).toBe(1.25);
        expect(nudgedRate(1, 0.02)).toBeCloseTo(0.99);
        expect(nudgedRate(1, -0.02)).toBeCloseTo(1.01);
        expect(nudgedRate(1, 1)).toBeCloseTo(0.97);
        expect(nudgedRate(1, -1)).toBeCloseTo(1.03);
    });

    it("jumps when it's far out, and plays at the tempo's rate", () => {
        const element = {
            currentTime: 3,
            duration: 462,
            playbackRate: 1,
            paused: false,
            readyState: 4,
        };
        const sync = new MusicSync();
        // 20 beats in is 10 s into the track
        sync.update(element, 20, 1.25);
        expect(element.currentTime).toBe(10);
        expect(element.playbackRate).toBe(1.25);
        expect(sync.jumps).toBe(1);
        expect(holdPitch(element)).toBe(true);
        // Close: only the rate moves
        element.currentTime = 10.05;
        sync.update(element, 20, 1.25);
        expect(element.currentTime).toBe(10.05);
        expect(element.playbackRate).toBeLessThan(1.25);
    });

    it("starts a sound as the picture shows its tick, less the output's latency", () => {
        // Three ticks ahead at 50 a second, 20 ms of latency
        expect(whenForTick(103, 100, 5, 0.02, 50)).toBeCloseTo(5.04);
    });
});
