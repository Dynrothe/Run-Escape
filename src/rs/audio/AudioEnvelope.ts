import { ByteBuffer } from "../io/ByteBuffer";

// A piecewise linear curve over a sound's length, used for pitch, volume and
// the modulators. Values are 16 bit fixed point; `form` is the wave shape when
// the envelope drives an oscillator (1 square, 2 sine, 3 saw, 4 noise).
export class AudioEnvelope {
    segments = 2;
    durations: number[] = [0, 65535];
    phases: number[] = [0, 65535];
    start = 0;
    end = 0;
    form = 0;

    private ticks = 0;
    private phaseIndex = 0;
    private step = 0;
    private amplitude = 0;
    private max = 0;

    decode(buffer: ByteBuffer): void {
        this.form = buffer.readUnsignedByte();
        this.start = buffer.readInt();
        this.end = buffer.readInt();
        this.decodeSegments(buffer);
    }

    decodeSegments(buffer: ByteBuffer): void {
        this.segments = buffer.readUnsignedByte();
        this.durations = new Array(this.segments);
        this.phases = new Array(this.segments);
        for (let i = 0; i < this.segments; i++) {
            this.durations[i] = buffer.readUnsignedShort();
            this.phases[i] = buffer.readUnsignedShort();
        }
    }

    reset(): void {
        this.ticks = 0;
        this.phaseIndex = 0;
        this.step = 0;
        this.amplitude = 0;
        this.max = 0;
    }

    // The next value, for a sound `length` samples long
    doStep(length: number): number {
        if (this.max >= this.ticks) {
            this.amplitude = this.phases[this.phaseIndex++] << 15;
            if (this.phaseIndex >= this.segments) {
                this.phaseIndex = this.segments - 1;
            }
            this.ticks = Math.trunc((this.durations[this.phaseIndex] / 65536) * length);
            if (this.ticks > this.max) {
                this.step = Math.trunc(
                    ((this.phases[this.phaseIndex] << 15) - this.amplitude) /
                        (this.ticks - this.max),
                );
            }
        }
        this.amplitude += this.step;
        this.max++;
        return (this.amplitude - this.step) >> 15;
    }
}
