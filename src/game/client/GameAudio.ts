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
    // When on the audio clock (GameAudio.clock) to start it, rather than now
    when?: number;
};

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
    private musicDuck = 1;

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
        if (this.music?.element.paused) {
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
            this.music.element.volume = this.settings.music * MUSIC_VOLUME * this.musicDuck;
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
            this.musicDuck = 1;
            this.applyVolume();
        }
        this.music.element.play().catch((e) => console.warn("No music", e));
    }

    // The recording playing now, for keeping it in time with a fight's beat (BeatAudio.MusicSync)
    get musicElement(): HTMLAudioElement | undefined {
        return this.music?.element;
    }

    // How loud the music is, before the settings: 1 normally, less while a fight ducks it
    setMusicDuck(duck: number): void {
        this.musicDuck = Math.min(Math.max(duck, 0), 1);
        if (this.music) {
            this.music.element.volume = this.settings.music * MUSIC_VOLUME * this.musicDuck;
        }
    }

    stopMusic(): void {
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
        const context = this.context;
        if (!context) {
            return undefined;
        }
        let buffer = this.buffers.get(id);
        if (!buffer) {
            const sound = this.sounds.get(id);
            if (!sound || sound.samples.length === 0) {
                return undefined;
            }
            buffer = context.createBuffer(1, sound.samples.length, sound.sampleRate);
            buffer.copyToChannel(sound.samples as Float32Array<ArrayBuffer>, 0);
            this.buffers.set(id, buffer);
            this.sounds.delete(id);
        }
        return buffer;
    }

    play(id: number, options: PlayOptions = {}): void {
        this.playAtTime(id, options.when ?? 0, options);
    }

    // The audio clock now, in seconds (AudioContext.currentTime), or undefined before the first
    // press has made one: what playAtTime's when is on
    get clock(): number | undefined {
        const context = this.context;
        return context && context.state === "running" ? context.currentTime : undefined;
    }

    // Seconds from a sound being started to its being heard, as far as the browser says:
    // outputLatency where it's reported (Chrome, Firefox), else baseLatency, else 0
    get outputLatency(): number {
        const context = this.context as (AudioContext & { outputLatency?: number }) | undefined;
        if (!context) {
            return 0;
        }
        const output = context.outputLatency;
        if (typeof output === "number" && Number.isFinite(output) && output > 0) {
            return output;
        }
        const base = context.baseLatency;
        return typeof base === "number" && Number.isFinite(base) ? base : 0;
    }

    // Whether the sound effects can be heard at all: unmuted, turned up, and the audio running
    get audible(): boolean {
        return this.clock !== undefined && !this.settings.muted && this.settings.volume > 0;
    }

    // A sound started at an exact time on the audio clock (clock): sample accurate, with no frame's
    // jitter, for a beat that's known ahead (BeatAudio). when 0, or in the past, is now.
    playAtTime(id: number, when: number, options: PlayOptions = {}): void {
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
        // Scheduled sounds are each meant: only what's played now is kept apart
        if (when <= 0 && now - last < (options.minGap ?? 50)) {
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
        source.start(Math.max(0, when));
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
