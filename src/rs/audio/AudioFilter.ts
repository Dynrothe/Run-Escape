import { ByteBuffer } from "../io/ByteBuffer";
import { AudioEnvelope } from "./AudioEnvelope";

// The synth's IIR filter: up to 15 pole pairs (feedback) and 15 zero pairs
// (feed forward), each interpolated between a start and end setting by the
// filter envelope. Coefficients are worked out in floats and used as 16 bit
// fixed point, like the client.
export class AudioFilter {
    static readonly floatCoefficients: number[][] = [new Array(16).fill(0), new Array(16).fill(0)];
    static readonly coefficients: number[][] = [new Array(16).fill(0), new Array(16).fill(0)];
    static forwardMultiplierFloat = 0;
    static forwardMultiplier = 0;

    readonly pairs: number[] = [0, 0];
    readonly phases: number[][][] = [
        [new Array(16).fill(0), new Array(16).fill(0)],
        [new Array(16).fill(0), new Array(16).fill(0)],
    ];
    readonly magnitudes: number[][][] = [
        [new Array(16).fill(0), new Array(16).fill(0)],
        [new Array(16).fill(0), new Array(16).fill(0)],
    ];
    readonly unity: number[] = [0, 0];

    private adaptMagnitude(direction: number, pair: number, t: number): number {
        const m = this.magnitudes[direction];
        let magnitude = m[0][pair] + t * (m[1][pair] - m[0][pair]);
        magnitude *= 0.0015258789;
        return 1 - Math.pow(10, -magnitude / 20);
    }

    private adaptPhase(direction: number, pair: number, t: number): number {
        const p = this.phases[direction];
        let phase = p[0][pair] + t * (p[1][pair] - p[0][pair]);
        phase *= 1.2207031e-4;
        return AudioFilter.normalize(phase);
    }

    private static normalize(octaves: number): number {
        const frequency = 32.703197 * Math.pow(2, octaves);
        return (frequency * Math.PI) / 11025;
    }

    // Works out the coefficients for one direction (0 forward, 1 feedback) at
    // point t (0-1) of the filter envelope; returns how many there are.
    compute(direction: number, t: number): number {
        if (direction === 0) {
            let unity = this.unity[0] + (this.unity[1] - this.unity[0]) * t;
            unity *= 0.0030517578;
            AudioFilter.forwardMultiplierFloat = Math.pow(0.1, unity / 20);
            AudioFilter.forwardMultiplier = Math.trunc(AudioFilter.forwardMultiplierFloat * 65536);
        }
        const pairs = this.pairs[direction];
        if (pairs === 0) {
            return 0;
        }
        const fc = AudioFilter.floatCoefficients[direction];
        let magnitude = this.adaptMagnitude(direction, 0, t);
        fc[0] = -2 * magnitude * Math.cos(this.adaptPhase(direction, 0, t));
        fc[1] = magnitude * magnitude;
        for (let pair = 1; pair < pairs; pair++) {
            magnitude = this.adaptMagnitude(direction, pair, t);
            const a = -2 * magnitude * Math.cos(this.adaptPhase(direction, pair, t));
            const b = magnitude * magnitude;
            fc[pair * 2 + 1] = fc[pair * 2 - 1] * b;
            fc[pair * 2] = fc[pair * 2 - 1] * a + fc[pair * 2 - 2] * b;
            for (let i = pair * 2 - 1; i >= 2; i--) {
                fc[i] += fc[i - 1] * a + fc[i - 2] * b;
            }
            fc[1] += fc[0] * a + b;
            fc[0] += a;
        }
        if (direction === 0) {
            for (let i = 0; i < pairs * 2; i++) {
                fc[i] *= AudioFilter.forwardMultiplierFloat;
            }
        }
        const c = AudioFilter.coefficients[direction];
        for (let i = 0; i < pairs * 2; i++) {
            c[i] = Math.trunc(fc[i] * 65536);
        }
        return pairs * 2;
    }

    decode(buffer: ByteBuffer, envelope: AudioEnvelope): void {
        const count = buffer.readUnsignedByte();
        this.pairs[0] = count >> 4;
        this.pairs[1] = count & 0xf;
        if (count === 0) {
            this.unity[0] = this.unity[1] = 0;
            return;
        }
        this.unity[0] = buffer.readUnsignedShort();
        this.unity[1] = buffer.readUnsignedShort();
        const migrated = buffer.readUnsignedByte();
        for (let direction = 0; direction < 2; direction++) {
            for (let pair = 0; pair < this.pairs[direction]; pair++) {
                this.phases[direction][0][pair] = buffer.readUnsignedShort();
                this.magnitudes[direction][0][pair] = buffer.readUnsignedShort();
            }
        }
        for (let direction = 0; direction < 2; direction++) {
            for (let pair = 0; pair < this.pairs[direction]; pair++) {
                if ((migrated & ((1 << (direction * 4)) << pair)) !== 0) {
                    this.phases[direction][1][pair] = buffer.readUnsignedShort();
                    this.magnitudes[direction][1][pair] = buffer.readUnsignedShort();
                } else {
                    this.phases[direction][1][pair] = this.phases[direction][0][pair];
                    this.magnitudes[direction][1][pair] = this.magnitudes[direction][0][pair];
                }
            }
        }
        if (migrated !== 0 || this.unity[1] !== this.unity[0]) {
            envelope.decodeSegments(buffer);
        }
    }
}
