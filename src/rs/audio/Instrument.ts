import JavaRandom from "java-random";

import { ByteBuffer } from "../io/ByteBuffer";
import { AudioEnvelope } from "./AudioEnvelope";
import { AudioFilter } from "./AudioFilter";

export const SAMPLE_RATE = 22050;

const MAX_OSCILLATORS = 10;

// The client's tables: a noise table from java.util.Random(0) and a sine table
const NOISE = new Int32Array(32768);
const SINE = new Int32Array(32768);
{
    const random = new JavaRandom(0);
    for (let i = 0; i < 32768; i++) {
        NOISE[i] = (random.nextInt() & 2) - 1;
    }
    for (let i = 0; i < 32768; i++) {
        SINE[i] = Math.trunc(Math.sin(i / 5215.1903) * 16384);
    }
}

// Java's (int) cast: truncates and saturates
function toInt(x: number): number {
    if (x >= 2147483647) {
        return 2147483647;
    }
    if (x <= -2147483648) {
        return -2147483648;
    }
    return Math.trunc(x);
}

// (long) a * b >> 16, which overflows 32 bits in between
function mulShift16(a: number, b: number): number {
    return Math.floor((a * b) / 65536) | 0;
}

let samples = new Int32Array(SAMPLE_RATE * 10);
const phases = new Int32Array(MAX_OSCILLATORS);
const delays = new Int32Array(MAX_OSCILLATORS);
const volumeSteps = new Int32Array(MAX_OSCILLATORS);
const pitchSteps = new Int32Array(MAX_OSCILLATORS);
const pitchBaseSteps = new Int32Array(MAX_OSCILLATORS);

// One voice of a sound effect: up to ten oscillators sharing pitch and volume
// envelopes, with optional vibrato (pitch modifier), tremolo (volume
// multiplier), gating (release/attack), echo and a filter. A port of the
// client's synthesizer; integer maths wraps exactly as the client's does.
export class Instrument {
    pitch!: AudioEnvelope;
    volume!: AudioEnvelope;
    pitchModifier?: AudioEnvelope;
    pitchModifierAmplitude?: AudioEnvelope;
    volumeMultiplier?: AudioEnvelope;
    volumeMultiplierAmplitude?: AudioEnvelope;
    release?: AudioEnvelope;
    attack?: AudioEnvelope;
    readonly oscillatorVolume = new Int32Array(MAX_OSCILLATORS);
    readonly oscillatorPitch = new Int32Array(MAX_OSCILLATORS);
    readonly oscillatorDelays = new Int32Array(MAX_OSCILLATORS);
    delayTime = 0;
    delayDecay = 100;
    filter!: AudioFilter;
    filterEnvelope!: AudioEnvelope;
    // Milliseconds
    duration = 500;
    offset = 0;

    decode(buffer: ByteBuffer): void {
        this.pitch = new AudioEnvelope();
        this.pitch.decode(buffer);
        this.volume = new AudioEnvelope();
        this.volume.decode(buffer);
        if (buffer.readUnsignedByte() !== 0) {
            buffer.offset--;
            this.pitchModifier = new AudioEnvelope();
            this.pitchModifier.decode(buffer);
            this.pitchModifierAmplitude = new AudioEnvelope();
            this.pitchModifierAmplitude.decode(buffer);
        }
        if (buffer.readUnsignedByte() !== 0) {
            buffer.offset--;
            this.volumeMultiplier = new AudioEnvelope();
            this.volumeMultiplier.decode(buffer);
            this.volumeMultiplierAmplitude = new AudioEnvelope();
            this.volumeMultiplierAmplitude.decode(buffer);
        }
        if (buffer.readUnsignedByte() !== 0) {
            buffer.offset--;
            this.release = new AudioEnvelope();
            this.release.decode(buffer);
            this.attack = new AudioEnvelope();
            this.attack.decode(buffer);
        }
        for (let i = 0; i < MAX_OSCILLATORS; i++) {
            const volume = buffer.readUnsignedSmart();
            if (volume === 0) {
                break;
            }
            this.oscillatorVolume[i] = volume;
            this.oscillatorPitch[i] = buffer.readSmart2();
            this.oscillatorDelays[i] = buffer.readUnsignedSmart();
        }
        this.delayTime = buffer.readUnsignedSmart();
        this.delayDecay = buffer.readUnsignedSmart();
        this.duration = buffer.readUnsignedShort();
        this.offset = buffer.readUnsignedShort();
        this.filter = new AudioFilter();
        this.filterEnvelope = new AudioEnvelope();
        this.filter.decode(buffer, this.filterEnvelope);
    }

    private static evaluateWave(phase: number, amplitude: number, form: number): number {
        if (form === 1) {
            return (phase & 32767) < 16384 ? amplitude : -amplitude;
        } else if (form === 2) {
            return Math.imul(SINE[phase & 32767], amplitude) >> 14;
        } else if (form === 3) {
            return (Math.imul(amplitude, phase & 32767) >> 14) - amplitude;
        } else if (form === 4) {
            return Math.imul(amplitude, NOISE[Math.trunc(phase / 2607) & 32767]);
        }
        return 0;
    }

    // Renders `steps` samples covering `duration` milliseconds. The result is
    // a shared buffer, valid until the next call.
    synthesize(steps: number, duration: number): Int32Array {
        if (samples.length < steps) {
            samples = new Int32Array(steps);
        }
        samples.fill(0, 0, steps);
        if (duration < 10) {
            return samples;
        }
        const samplesPerMs = steps / duration;
        const pitch = this.pitch;
        const volume = this.volume;
        pitch.reset();
        volume.reset();

        let pitchModStep = 0;
        let pitchModBase = 0;
        let pitchModPhase = 0;
        const pitchModifier = this.pitchModifier;
        const pitchModifierAmplitude = this.pitchModifierAmplitude;
        if (pitchModifier && pitchModifierAmplitude) {
            pitchModifier.reset();
            pitchModifierAmplitude.reset();
            pitchModStep = toInt(
                ((pitchModifier.end - pitchModifier.start) * 32.768) / samplesPerMs,
            );
            pitchModBase = toInt((pitchModifier.start * 32.768) / samplesPerMs);
        }

        let volumeModStep = 0;
        let volumeModBase = 0;
        let volumeModPhase = 0;
        const volumeMultiplier = this.volumeMultiplier;
        const volumeMultiplierAmplitude = this.volumeMultiplierAmplitude;
        if (volumeMultiplier && volumeMultiplierAmplitude) {
            volumeMultiplier.reset();
            volumeMultiplierAmplitude.reset();
            volumeModStep = toInt(
                ((volumeMultiplier.end - volumeMultiplier.start) * 32.768) / samplesPerMs,
            );
            volumeModBase = toInt((volumeMultiplier.start * 32.768) / samplesPerMs);
        }

        for (let i = 0; i < MAX_OSCILLATORS; i++) {
            if (this.oscillatorVolume[i] !== 0) {
                phases[i] = 0;
                delays[i] = toInt(this.oscillatorDelays[i] * samplesPerMs);
                volumeSteps[i] = (this.oscillatorVolume[i] << 14) / 100;
                pitchSteps[i] = toInt(
                    ((pitch.end - pitch.start) *
                        32.768 *
                        Math.pow(1.0057929410678534, this.oscillatorPitch[i])) /
                        samplesPerMs,
                );
                pitchBaseSteps[i] = toInt((pitch.start * 32.768) / samplesPerMs);
            }
        }

        for (let step = 0; step < steps; step++) {
            let pitchValue = pitch.doStep(steps);
            let volumeValue = volume.doStep(steps);
            if (pitchModifier && pitchModifierAmplitude) {
                const mod = pitchModifier.doStep(steps);
                const amp = pitchModifierAmplitude.doStep(steps);
                pitchValue += Instrument.evaluateWave(pitchModPhase, amp, pitchModifier.form) >> 1;
                pitchModPhase =
                    (pitchModPhase + pitchModBase + (Math.imul(mod, pitchModStep) >> 16)) | 0;
            }
            if (volumeMultiplier && volumeMultiplierAmplitude) {
                const mod = volumeMultiplier.doStep(steps);
                const amp = volumeMultiplierAmplitude.doStep(steps);
                volumeValue =
                    Math.imul(
                        volumeValue,
                        (Instrument.evaluateWave(volumeModPhase, amp, volumeMultiplier.form) >> 1) +
                            32768,
                    ) >> 15;
                volumeModPhase =
                    (volumeModPhase + volumeModBase + (Math.imul(mod, volumeModStep) >> 16)) | 0;
            }
            for (let i = 0; i < MAX_OSCILLATORS; i++) {
                if (this.oscillatorVolume[i] === 0) {
                    continue;
                }
                const at = delays[i] + step;
                if (at < steps) {
                    samples[at] += Instrument.evaluateWave(
                        phases[i],
                        Math.imul(volumeValue, volumeSteps[i]) >> 15,
                        pitch.form,
                    );
                    phases[i] =
                        (phases[i] +
                            (Math.imul(pitchValue, pitchSteps[i]) >> 16) +
                            pitchBaseSteps[i]) |
                        0;
                }
            }
        }

        const release = this.release;
        const attack = this.attack;
        if (release && attack) {
            release.reset();
            attack.reset();
            let counter = 0;
            let muted = true;
            for (let step = 0; step < steps; step++) {
                const releaseValue = release.doStep(steps);
                const attackValue = attack.doStep(steps);
                const threshold = muted
                    ? (Math.imul(releaseValue, release.end - release.start) >> 8) + release.start
                    : (Math.imul(attackValue, release.end - release.start) >> 8) + release.start;
                counter += 256;
                if (counter >= threshold) {
                    counter = 0;
                    muted = !muted;
                }
                if (muted) {
                    samples[step] = 0;
                }
            }
        }

        if (this.delayTime > 0 && this.delayDecay > 0) {
            const delay = toInt(this.delayTime * samplesPerMs);
            for (let step = delay; step < steps; step++) {
                samples[step] += Math.trunc(
                    Math.imul(samples[step - delay], this.delayDecay) / 100,
                );
            }
        }

        this.applyFilter(steps);

        for (let step = 0; step < steps; step++) {
            if (samples[step] < -32768) {
                samples[step] = -32768;
            }
            if (samples[step] > 32767) {
                samples[step] = 32767;
            }
        }
        return samples;
    }

    private applyFilter(steps: number): void {
        const filter = this.filter;
        if (filter.pairs[0] <= 0 && filter.pairs[1] <= 0) {
            return;
        }
        const envelope = this.filterEnvelope;
        const forward = AudioFilter.coefficients[0];
        const feedback = AudioFilter.coefficients[1];
        envelope.reset();
        let t = envelope.doStep(steps + 1);
        let forwardCount = filter.compute(0, t / 65536);
        let feedbackCount = filter.compute(1, t / 65536);
        if (steps < forwardCount + feedbackCount) {
            return;
        }
        let step = 0;
        let end = Math.min(feedbackCount, steps - forwardCount);
        while (step < end) {
            let value = mulShift16(samples[step + forwardCount], AudioFilter.forwardMultiplier);
            for (let i = 0; i < forwardCount; i++) {
                value += mulShift16(samples[step + forwardCount - 1 - i], forward[i]);
            }
            for (let i = 0; i < step; i++) {
                value -= mulShift16(samples[step - 1 - i], feedback[i]);
            }
            samples[step] = value;
            t = envelope.doStep(steps + 1);
            step++;
        }
        // The coefficients are recomputed every 128 samples as the envelope moves
        end = 128;
        for (;;) {
            if (end > steps - forwardCount) {
                end = steps - forwardCount;
            }
            while (step < end) {
                let value = mulShift16(samples[step + forwardCount], AudioFilter.forwardMultiplier);
                for (let i = 0; i < forwardCount; i++) {
                    value += mulShift16(samples[step + forwardCount - 1 - i], forward[i]);
                }
                for (let i = 0; i < feedbackCount; i++) {
                    value -= mulShift16(samples[step - 1 - i], feedback[i]);
                }
                samples[step] = value;
                t = envelope.doStep(steps + 1);
                step++;
            }
            if (step >= steps - forwardCount) {
                while (step < steps) {
                    let value = 0;
                    for (let i = step + forwardCount - steps; i < forwardCount; i++) {
                        value += mulShift16(samples[step + forwardCount - 1 - i], forward[i]);
                    }
                    for (let i = 0; i < feedbackCount; i++) {
                        value -= mulShift16(samples[step - 1 - i], feedback[i]);
                    }
                    samples[step] = value;
                    envelope.doStep(steps + 1);
                    step++;
                }
                return;
            }
            forwardCount = filter.compute(0, t / 65536);
            feedbackCount = filter.compute(1, t / 65536);
            end += 128;
        }
    }
}
