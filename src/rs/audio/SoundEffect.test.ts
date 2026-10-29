import { SAMPLE_RATE } from "./Instrument";
import { SoundEffect } from "./SoundEffect";

// Builds a sound effect in the cache format: one instrument with a single
// oscillator, constant pitch and full volume.
function makeSound(form: number, pitch: number, durationMs: number): Int8Array {
    const bytes: number[] = [];
    const u8 = (v: number) => bytes.push(v & 0xff);
    const u16 = (v: number) => bytes.push((v >> 8) & 0xff, v & 0xff);
    const i32 = (v: number) =>
        bytes.push((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
    const envelope = (envelopeForm: number, start: number, end: number) => {
        u8(envelopeForm);
        i32(start);
        i32(end);
        // Two segments: full from the start to the end
        u8(2);
        u16(0);
        u16(65535);
        u16(65535);
        u16(65535);
    };
    // Pitch, then volume
    envelope(form, pitch, pitch);
    envelope(0, 0, 0);
    // No pitch modifier, volume multiplier or gating
    u8(0);
    u8(0);
    u8(0);
    // One oscillator: volume 100, no semitone offset (smart 64 = 0), no delay
    u8(100);
    u8(64);
    u8(0);
    u8(0);
    // No echo
    u8(0);
    u8(0);
    u16(durationMs);
    // Offset
    u16(0);
    // No filter
    u8(0);
    // The other nine instruments are empty
    for (let i = 0; i < 9; i++) {
        u8(0);
    }
    // Loop start and end
    u16(0);
    u16(0);
    return new Int8Array(bytes);
}

function zeroCrossings(samples: Int8Array): number {
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
        if (samples[i - 1] < 0 !== samples[i] < 0) {
            crossings++;
        }
    }
    return crossings;
}

describe("SoundEffect", () => {
    test("decodes the whole sound", () => {
        const data = makeSound(2, 440, 500);
        const sound = SoundEffect.decode(data);
        expect(sound.decodedLength).toBe(data.length);
        expect(sound.instruments.filter((i) => i).length).toBe(1);
        expect(sound.getDuration()).toBe(500);
    });

    test("renders a sine at the pitch asked for", () => {
        const samples = SoundEffect.decode(makeSound(2, 440, 500)).mix();
        expect(samples.length).toBe((500 * SAMPLE_RATE) / 1000);
        const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
        expect(peak).toBeGreaterThan(100);
        // A 440 Hz tone crosses zero twice per cycle: about 440 times in 0.5s
        expect(zeroCrossings(samples)).toBeGreaterThan(400);
        expect(zeroCrossings(samples)).toBeLessThan(480);
    });

    test("a higher pitch value gives a higher tone", () => {
        const low = zeroCrossings(SoundEffect.decode(makeSound(1, 220, 500)).mix());
        const high = zeroCrossings(SoundEffect.decode(makeSound(1, 880, 500)).mix());
        expect(high).toBeGreaterThan(low * 3.5);
    });

    test("noise is noisy", () => {
        const samples = SoundEffect.decode(makeSound(4, 4000, 300)).mix();
        expect(zeroCrossings(samples)).toBeGreaterThan(300);
    });
});
