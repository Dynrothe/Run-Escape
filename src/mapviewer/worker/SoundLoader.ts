import { SAMPLE_RATE } from "../../rs/audio/Instrument";
import { SoundEffect } from "../../rs/audio/SoundEffect";
import { IndexType } from "../../rs/cache/IndexType";
import { RenderDataLoader, RenderDataResult } from "./RenderDataLoader";
import { WorkerState } from "./RenderDataWorker";

// Synthesizes cache sound effects (index 4) to PCM in a worker.

export type SoundLoaderInput = { ids: number[] };

export type SoundData = {
    id: number;
    sampleRate: number;
    // -1 to 1; empty when the sound is missing
    samples: Float32Array;
};

export class SoundLoader implements RenderDataLoader<SoundLoaderInput, SoundData[]> {
    __type = "soundLoader" as const;

    init(): void {}

    async load(
        state: WorkerState,
        input: SoundLoaderInput,
    ): Promise<RenderDataResult<SoundData[]>> {
        const index = state.cacheSystem.getIndex(IndexType.DAT2.soundEffects);
        const sounds: SoundData[] = input.ids.map((id) => {
            let samples = new Float32Array(0);
            try {
                const file = index.getFile(id, 0);
                if (file) {
                    const pcm = SoundEffect.decode(file.data).mix();
                    samples = new Float32Array(pcm.length);
                    for (let i = 0; i < pcm.length; i++) {
                        samples[i] = pcm[i] / 128;
                    }
                }
            } catch (e) {
                console.error("Failed synthesizing sound", id, e);
            }
            return { id, sampleRate: SAMPLE_RATE, samples };
        });
        return { data: sounds, transferables: sounds.map((s) => s.samples.buffer) };
    }

    reset(): void {}
}
