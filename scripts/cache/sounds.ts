// Sound effect tools.
//
//   npx tsx scripts/cache/sounds.ts validate          decode every sound effect, report failures
//   npx tsx scripts/cache/sounds.ts seqs 390 711      sounds an animation plays, by frame
//   npx tsx scripts/cache/sounds.ts info 2266 510     length and loudness of sounds
//   npx tsx scripts/cache/sounds.ts wav out 2266 510  write sounds to out/<id>.wav to listen to
import fs from "fs";
import path from "path";

import { SAMPLE_RATE } from "../../src/rs/audio/Instrument";
import { SoundEffect } from "../../src/rs/audio/SoundEffect";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { IndexType } from "../../src/rs/cache/IndexType";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { loadGameCache } from "./scene-util";

const [command, ...args] = process.argv.slice(2);

const loaded = loadGameCache();
const cacheSystem = CacheSystem.fromFiles(loaded.type, loaded.files);
const soundIndex = cacheSystem.getIndex(IndexType.DAT2.soundEffects);

function loadSound(id: number): SoundEffect | undefined {
    const file = soundIndex.getFile(id, 0);
    return file ? SoundEffect.decode(file.data) : undefined;
}

function describe(id: number): string {
    const sound = loadSound(id);
    if (!sound) {
        return `${id}: missing`;
    }
    const samples = sound.mix();
    let peak = 0;
    let energy = 0;
    for (const s of samples) {
        peak = Math.max(peak, Math.abs(s));
        energy += s * s;
    }
    const rms = samples.length > 0 ? Math.sqrt(energy / samples.length) : 0;
    const instruments = sound.instruments.filter((i) => i).length;
    return `${id}: ${sound.getDuration()}ms, ${instruments} instruments, peak ${peak}, rms ${rms.toFixed(1)}`;
}

function writeWav(file: string, samples: Int8Array): void {
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + samples.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(SAMPLE_RATE, 28);
    header.writeUInt16LE(1, 32);
    header.writeUInt16LE(8, 34);
    header.write("data", 36);
    header.writeUInt32LE(samples.length, 40);
    // WAV 8 bit is unsigned
    const data = Buffer.alloc(samples.length);
    for (let i = 0; i < samples.length; i++) {
        data[i] = samples[i] + 128;
    }
    fs.writeFileSync(file, Buffer.concat([header, data]));
}

switch (command) {
    case "validate": {
        const ids = soundIndex.getArchiveIds();
        const errors = new Map<string, number[]>();
        for (const id of ids) {
            const file = soundIndex.getFile(id, 0);
            if (!file) {
                continue;
            }
            let error: string | undefined;
            try {
                const sound = SoundEffect.decode(file.data);
                if (sound.decodedLength !== file.data.length) {
                    error = "leftover bytes";
                }
                sound.mix();
            } catch (e) {
                error = e instanceof Error ? e.message : String(e);
            }
            if (error) {
                errors.set(error, [...(errors.get(error) ?? []), id]);
            }
        }
        const failed = [...errors.values()].reduce((sum, list) => sum + list.length, 0);
        console.log(`${ids.length} sound effects, ${failed} failed`);
        for (const [error, list] of errors) {
            console.log(`  ${error}: ${list.length} (e.g. ${list.slice(0, 8).join(", ")})`);
        }
        if (failed > 0) {
            process.exitCode = 1;
        }
        break;
    }
    case "seqs": {
        const factory = getCacheLoaderFactory(loaded.info, cacheSystem);
        const seqTypeLoader = factory.getSeqTypeLoader();
        for (const id of args.map((a) => parseInt(a))) {
            const seq = seqTypeLoader.load(id);
            const sounds = [...(seq.frameSounds?.entries() ?? [])]
                .map(([frame, effects]) => `frame ${frame}: ${effects.map((e) => e.id).join(",")}`)
                .join("; ");
            console.log(`seq ${id}: ${sounds || "no sounds"}`);
        }
        break;
    }
    case "info":
        for (const id of args.map((a) => parseInt(a))) {
            console.log(describe(id));
        }
        break;
    case "wav": {
        const [outDir, ...ids] = args;
        fs.mkdirSync(outDir, { recursive: true });
        for (const id of ids.map((a) => parseInt(a))) {
            const sound = loadSound(id);
            if (sound) {
                writeWav(path.join(outDir, `${id}.wav`), sound.mix());
                console.log(describe(id));
            }
        }
        break;
    }
    default:
        console.log("usage: sounds.ts validate | seqs <id...> | info <id...> | wav <dir> <id...>");
}
