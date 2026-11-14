import { RenderDataWorkerPool } from "../../mapviewer/worker/RenderDataWorkerPool";
import { SoundData, SoundLoader, SoundLoaderInput } from "../../mapviewer/worker/SoundLoader";

export type AudioSettings = {
    muted: boolean;
    // 0-1: the sound effects', and the music's (maps with music)
    volume: number;
    music: number;
};

const SETTINGS_KEY = "rune-survivors-audio";

// A horde makes hundreds of sounds a second; keep it to a few at once
const MAX_VOICES = 24;
// Sounds this far from the player (tiles) are at their quietest
const HEARING_DISTANCE = 22;
// Music plays this much quieter than the sound effects, under the fighting
const MUSIC_VOLUME = 0.7;

export type PlayOptions = {
    // 0-1 before the master volume
    volume?: number;
    // -1 (left) to 1 (right)
    pan?: number;
    // Milliseconds before the same sound can play again
    minGap?: number;
};

// A trailer's sound (TrailerRecorder): what was asked to play while it was recorded, kept rather
// than played, to be rendered after (renderRecording). Times are seconds from its start.
export type SoundRecording = {
    // When it started (performance.now)
    start: number;
    sounds: { id: number; at: number; volume: number; pan: number }[];
    // The music from then on, or none
    music: { at: number; url?: string }[];
    lastPlayed: Map<number, number>;
    // When the sounds playing now end, for MAX_VOICES
    ends: number[];
};

export type RecordingLevels = { volume: number; music: number };

const RECORDING_RATE = 48000;

function loadSettings(): AudioSettings {
    try {
        const json = window.localStorage.getItem(SETTINGS_KEY);
        if (json) {
            const data = JSON.parse(json);
            const volume = readVolume(data.volume, 0.6);
            return {
                muted: !!data.muted,
                volume,
                // Saved before music had its own: as loud as it was
                music: readVolume(data.music, volume),
            };
        }
    } catch (e) {}
    return { muted: false, volume: 0.6, music: 0.6 };
}

function readVolume(value: unknown, otherwise: number): number {
    return typeof value === "number" ? Math.min(Math.max(value, 0), 1) : otherwise;
}

// Plays the client's synthesized sound effects with Web Audio. Browsers only
// allow audio after the page is interacted with, so the context is made on the
// first click or key press; sounds asked for before then are skipped. On a touch
// screen a press doesn't count until the finger lifts, hence the two ends of one.
export class GameAudio {
    settings: AudioSettings = loadSettings();

    private context?: AudioContext;
    private master?: GainNode;
    // Synthesized, waiting for their first play: each one moves into an
    // AudioBuffer then, so a sound is only held once
    private readonly sounds = new Map<number, SoundData>();
    private readonly buffers = new Map<number, AudioBuffer>();
    private readonly lastPlayed = new Map<number, number>();
    private voices = 0;
    // The recording looping now, streamed rather than decoded up front
    private music?: { url: string; element: HTMLAudioElement };
    private recording?: SoundRecording;

    constructor() {
        window.addEventListener("pointerdown", this.unlock);
        window.addEventListener("pointerup", this.unlock);
        window.addEventListener("touchend", this.unlock);
        window.addEventListener("keydown", this.unlock);
        document.addEventListener("visibilitychange", this.onVisibilityChange);
    }

    dispose(): void {
        window.removeEventListener("pointerdown", this.unlock);
        window.removeEventListener("pointerup", this.unlock);
        window.removeEventListener("touchend", this.unlock);
        window.removeEventListener("keydown", this.unlock);
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
        this.stopMusic();
        this.context?.close();
    }

    // Synthesizes the sounds in the render workers
    async load(workerPool: RenderDataWorkerPool, ids: number[]): Promise<void> {
        const unique = [...new Set(ids.filter((id) => id >= 0))];
        const sounds = await workerPool.queueLoad<SoundLoaderInput, SoundData[], SoundLoader>(
            new SoundLoader(),
            { ids: unique },
        );
        for (const sound of sounds) {
            this.sounds.set(sound.id, sound);
        }
    }

    private unlock = (): void => {
        if (!this.context) {
            try {
                this.context = new AudioContext();
                this.master = this.context.createGain();
                this.master.connect(this.context.destination);
                this.applyVolume();
            } catch (e) {
                console.error("No audio", e);
                return;
            }
        }
        // iOS also has "interrupted", for after a call or going to another app
        if (this.context.state !== "running") {
            this.context.resume();
        }
        // Started away from a press, it can be refused (a run has loading first)
        if (this.music?.element.paused && !this.recording) {
            this.music.element.play().catch(() => {});
        }
    };

    private onVisibilityChange = (): void => {
        if (!document.hidden && this.context && this.context.state !== "running") {
            this.context.resume().catch(() => {});
        }
    };

    private applyVolume(): void {
        if (this.master) {
            this.master.gain.value = this.settings.muted ? 0 : this.settings.volume;
        }
        if (this.music) {
            this.music.element.volume = this.settings.music * MUSIC_VOLUME;
            this.music.element.muted = this.settings.muted;
        }
    }

    // Loops a recording quietly until it's stopped (a run's map music). Runs
    // start with a click, so the browser lets it play.
    playMusic(url: string): void {
        if (this.music?.url !== url) {
            this.stopMusic();
            const element = new Audio(url);
            element.loop = true;
            this.music = { url, element };
            this.applyVolume();
        }
        if (this.recording) {
            this.recordMusic(this.recording, url);
            return;
        }
        this.music.element.play().catch((e) => console.warn("No music", e));
    }

    stopMusic(): void {
        if (this.recording) {
            this.recordMusic(this.recording, undefined);
        }
        if (this.music) {
            this.music.element.pause();
            // Lets go of the stream
            this.music.element.removeAttribute("src");
            this.music.element.load();
            this.music = undefined;
        }
    }

    setSettings(settings: Partial<AudioSettings>): void {
        this.settings = { ...this.settings, ...settings };
        this.applyVolume();
        try {
            window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
        } catch (e) {}
    }

    private getBuffer(id: number): AudioBuffer | undefined {
        let buffer = this.buffers.get(id);
        if (!buffer) {
            const sound = this.sounds.get(id);
            if (!sound || sound.samples.length === 0) {
                return undefined;
            }
            buffer = new AudioBuffer({
                length: sound.samples.length,
                numberOfChannels: 1,
                sampleRate: sound.sampleRate,
            });
            buffer.copyToChannel(sound.samples as Float32Array<ArrayBuffer>, 0);
            this.buffers.set(id, buffer);
            this.sounds.delete(id);
        }
        return buffer;
    }

    // How long a sound is, or undefined for one that isn't loaded
    private getSeconds(id: number): number | undefined {
        const buffer = this.buffers.get(id);
        if (buffer) {
            return buffer.duration;
        }
        const sound = this.sounds.get(id);
        return sound && sound.samples.length > 0
            ? sound.samples.length / sound.sampleRate
            : undefined;
    }

    // ---- Trailers ----

    // From now, sounds and music are kept for a trailer rather than played (and the music's
    // paused), start being its first frame's time
    startRecording(start: number): void {
        this.recording = {
            start,
            sounds: [],
            music: [{ at: 0, url: this.music?.url }],
            lastPlayed: new Map(),
            ends: [],
        };
        this.music?.element.pause();
    }

    // What was kept, and the music playing again
    stopRecording(): SoundRecording | undefined {
        const recording = this.recording;
        this.recording = undefined;
        if (recording && this.music && this.context) {
            this.music.element.play().catch(() => {});
        }
        return recording;
    }

    // As play() would have played it then, but whether or not the browser's let it play yet
    private record(recording: SoundRecording, id: number, options: PlayOptions): void {
        const now = performance.now();
        const last = recording.lastPlayed.get(id) ?? -Infinity;
        const length = this.getSeconds(id);
        if (now - last < (options.minGap ?? 50) || length === undefined) {
            return;
        }
        const at = Math.max(0, (now - recording.start) / 1000);
        recording.ends = recording.ends.filter((end) => end > at);
        if (recording.ends.length >= MAX_VOICES) {
            return;
        }
        recording.lastPlayed.set(id, now);
        recording.ends.push(at + length);
        recording.sounds.push({
            id,
            at,
            volume: options.volume ?? 1,
            pan: Math.min(Math.max(options.pan ?? 0, -1), 1),
        });
    }

    private recordMusic(recording: SoundRecording, url: string | undefined): void {
        const at = Math.max(0, (performance.now() - recording.start) / 1000);
        const last = recording.music[recording.music.length - 1];
        if (last.url === url) {
            return;
        }
        if (last.at === at) {
            last.url = url;
        } else {
            recording.music.push({ at, url });
        }
    }

    // A recording's sound, seconds long, at fixed levels (not the player's settings): stereo at
    // 48 kHz, the music looped from its start
    async renderRecording(
        recording: SoundRecording,
        seconds: number,
        levels: RecordingLevels,
    ): Promise<AudioBuffer> {
        const length = Math.max(1, Math.ceil(seconds * RECORDING_RATE));
        const context = new OfflineAudioContext(2, length, RECORDING_RATE);
        const effects = new GainNode(context, { gain: levels.volume });
        effects.connect(context.destination);
        for (const sound of recording.sounds) {
            const buffer = this.getBuffer(sound.id);
            if (!buffer || sound.at >= seconds) {
                continue;
            }
            const source = new AudioBufferSourceNode(context, { buffer });
            const gain = new GainNode(context, { gain: sound.volume });
            source.connect(gain);
            if (sound.pan) {
                const panner = new StereoPannerNode(context, { pan: sound.pan });
                gain.connect(panner);
                panner.connect(effects);
            } else {
                gain.connect(effects);
            }
            source.start(sound.at);
        }
        const decoded = new Map<string, AudioBuffer>();
        for (let i = 0; i < recording.music.length; i++) {
            const { at, url } = recording.music[i];
            const end = Math.min(seconds, recording.music[i + 1]?.at ?? seconds);
            if (!url || end <= at) {
                continue;
            }
            let buffer = decoded.get(url);
            if (!buffer) {
                const response = await fetch(url);
                buffer = await context.decodeAudioData(await response.arrayBuffer());
                decoded.set(url, buffer);
            }
            const source = new AudioBufferSourceNode(context, { buffer, loop: true });
            const gain = new GainNode(context, { gain: levels.music * MUSIC_VOLUME });
            source.connect(gain);
            gain.connect(context.destination);
            source.start(at);
            source.stop(end);
        }
        return context.startRendering();
    }

    play(id: number, options: PlayOptions = {}): void {
        if (id >= 0 && this.recording) {
            this.record(this.recording, id, options);
            return;
        }
        const context = this.context;
        const master = this.master;
        if (
            id < 0 ||
            !context ||
            !master ||
            context.state !== "running" ||
            this.settings.muted ||
            this.voices >= MAX_VOICES
        ) {
            return;
        }
        const now = performance.now();
        const last = this.lastPlayed.get(id) ?? -Infinity;
        if (now - last < (options.minGap ?? 50)) {
            return;
        }
        const buffer = this.getBuffer(id);
        if (!buffer) {
            return;
        }
        this.lastPlayed.set(id, now);

        const source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        gain.gain.value = options.volume ?? 1;
        let node: AudioNode = gain;
        if (options.pan) {
            const panner = context.createStereoPanner();
            panner.pan.value = Math.min(Math.max(options.pan, -1), 1);
            gain.connect(panner);
            node = panner;
        }
        source.connect(gain);
        node.connect(master);
        this.voices++;
        source.onended = () => {
            this.voices--;
            source.disconnect();
            node.disconnect();
        };
        source.start();
    }

    // A sound at a world position, quieter and panned by where it is from the
    // listener (the camera faces north, so east is to the right)
    playAt(
        id: number,
        x: number,
        y: number,
        listenerX: number,
        listenerY: number,
        options: PlayOptions = {},
    ): void {
        const dx = x - listenerX;
        const dy = y - listenerY;
        const distance = Math.hypot(dx, dy);
        const falloff = Math.max(0.2, 1 - distance / HEARING_DISTANCE);
        this.play(id, {
            ...options,
            volume: (options.volume ?? 1) * falloff,
            pan: Math.min(Math.max(dx / 14, -0.8), 0.8),
        });
    }
}
