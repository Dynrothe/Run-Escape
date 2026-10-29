import { ByteBuffer } from "../io/ByteBuffer";
import { Instrument, SAMPLE_RATE } from "./Instrument";

// A synthesized sound effect from cache index 4: up to ten instruments mixed
// into 8 bit samples at 22050 Hz, like the client does.
export class SoundEffect {
    readonly instruments: (Instrument | undefined)[] = new Array(10);
    loopStart = 0;
    loopEnd = 0;
    // Bytes the decoder read, to check the format against the data's length
    decodedLength = 0;

    static decode(data: Int8Array): SoundEffect {
        const effect = new SoundEffect();
        const buffer = new ByteBuffer(data);
        for (let i = 0; i < 10; i++) {
            if (buffer.readUnsignedByte() !== 0) {
                buffer.offset--;
                const instrument = new Instrument();
                instrument.decode(buffer);
                effect.instruments[i] = instrument;
            }
        }
        effect.loopStart = buffer.readUnsignedShort();
        effect.loopEnd = buffer.readUnsignedShort();
        effect.decodedLength = buffer.offset;
        return effect;
    }

    // Length in milliseconds
    getDuration(): number {
        let duration = 0;
        for (const instrument of this.instruments) {
            if (instrument && instrument.duration + instrument.offset > duration) {
                duration = instrument.duration + instrument.offset;
            }
        }
        return duration;
    }

    // Signed 8 bit samples at SAMPLE_RATE
    mix(): Int8Array {
        const duration = this.getDuration();
        if (duration === 0) {
            return new Int8Array(0);
        }
        const output = new Int8Array(Math.trunc((duration * SAMPLE_RATE) / 1000));
        for (const instrument of this.instruments) {
            if (!instrument) {
                continue;
            }
            const steps = Math.trunc((instrument.duration * SAMPLE_RATE) / 1000);
            const offset = Math.trunc((instrument.offset * SAMPLE_RATE) / 1000);
            const samples = instrument.synthesize(steps, instrument.duration);
            for (let i = 0; i < steps; i++) {
                let value = (samples[i] >> 8) + output[i + offset];
                if (((value + 128) & -256) !== 0) {
                    value = (value >> 31) ^ 127;
                }
                output[i + offset] = value;
            }
        }
        return output;
    }
}
