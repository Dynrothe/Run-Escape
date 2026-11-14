import type { Renderer } from "../../components/renderer/Renderer";
import { pixelRatio } from "../../util/DeviceUtil";
import type { GameAudio, SoundRecording } from "./GameAudio";

// Dev only: the shot editor's cinematic recorded as a trailer, frame by frame on a clock of its
// own, so it comes out smooth however long each frame takes to draw. The frames go to the dev
// server as they're drawn, where ffmpeg makes them an MP4 in trailers/ (scripts/dev/
// trailer-server.ts), and the sound's rendered after them (GameAudio.renderRecording).

export type TrailerOptions = {
    // Pixels, and frames a second
    width?: number;
    height?: number;
    fps?: number;
    // Seconds on the cinematic. Past its end, the camera rests where it ends.
    from?: number;
    to?: number;
    // The run plays on as it's recorded (the player stood still and kept alive), after warmup
    // seconds of it unseen; otherwise it's held where it stands
    live?: boolean;
    warmup?: number;
    // Sound, at these levels (0-1): the effects', and the music's
    sound?: boolean;
    volume?: number;
    music?: number;
    // Its file's name in trailers/, without .mp4
    name?: string;
};

export type TrailerSpec = Required<TrailerOptions> & { frames: number };

export type TrailerProgress = {
    stage: "loading" | "frames" | "sound" | "encoding";
    done: number;
    total: number;
};

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 60;
// The cinematic's clock moves at most 100 ms a frame (GameClient)
const MIN_FPS = 10;
const MAX_FPS = 240;
// How long to wait for what the camera will see to load
const LOAD_TIMEOUT_MS = 120_000;
// How often the panel's told how far it's got
const PROGRESS_MS = 200;

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

// H.264 wants even sides
function even(value: number, otherwise: number): number {
    const rounded = Math.round(Number.isFinite(value) ? value : otherwise);
    return clamp(rounded - (rounded % 2), 2, 7680);
}

function stamp(date: Date): string {
    const two = (n: number) => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-` +
        `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
    );
}

// The options filled in for a cinematic seconds long on mapId
export function getTrailerSpec(
    options: TrailerOptions,
    seconds: number,
    mapId: string,
    date = new Date(),
): TrailerSpec {
    const fps = clamp(Math.round(options.fps ?? DEFAULT_FPS), MIN_FPS, MAX_FPS);
    const from = clamp(options.from ?? 0, 0, seconds);
    const to = Math.max(from + 1 / fps, options.to ?? seconds);
    return {
        width: even(options.width ?? DEFAULT_WIDTH, DEFAULT_WIDTH),
        height: Math.min(even(options.height ?? DEFAULT_HEIGHT, DEFAULT_HEIGHT), 4320),
        fps,
        from,
        to,
        frames: Math.max(1, Math.round((to - from) * fps)),
        live: options.live ?? false,
        warmup: Math.max(0, options.warmup ?? 0),
        sound: options.sound ?? true,
        volume: clamp(options.volume ?? 0.6, 0, 1),
        music: clamp(options.music ?? 0.6, 0, 1),
        name: options.name || `${mapId}-${stamp(date)}`,
    };
}

// performance.now swapped for a clock that only moves when it's told to, so everything that goes
// by it (actors' animations, hitsplats, the camera's shake) sees each frame take exactly as long
export class VirtualClock {
    readonly real: () => number;
    private saved?: PropertyDescriptor;
    private installed = false;

    constructor(
        public time: number,
        private readonly target: Performance = performance,
    ) {
        this.real = target.now.bind(target);
    }

    install(): void {
        if (this.installed) {
            return;
        }
        this.saved = Object.getOwnPropertyDescriptor(this.target, "now");
        Object.defineProperty(this.target, "now", {
            value: () => this.time,
            configurable: true,
            writable: true,
        });
        this.installed = true;
    }

    restore(): void {
        if (!this.installed) {
            return;
        }
        if (this.saved) {
            Object.defineProperty(this.target, "now", this.saved);
        } else {
            delete (this.target as { now?: unknown }).now;
        }
        this.installed = false;
    }
}

// 16-bit PCM, the channels interleaved
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
    const count = channels.length;
    const length = channels[0]?.length ?? 0;
    const bytes = length * count * 2;
    const buffer = new ArrayBuffer(44 + bytes);
    const view = new DataView(buffer);
    const text = (at: number, value: string) => {
        for (let i = 0; i < value.length; i++) {
            view.setUint8(at + i, value.charCodeAt(i));
        }
    };
    text(0, "RIFF");
    view.setUint32(4, 36 + bytes, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, count, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * count * 2, true);
    view.setUint16(32, count * 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, bytes, true);
    let at = 44;
    for (let i = 0; i < length; i++) {
        for (const channel of channels) {
            const sample = clamp(channel[i], -1, 1);
            view.setInt16(at, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            at += 2;
        }
    }
    return buffer;
}

export type TrailerPost = (
    path: "start" | "frame" | "finish" | "cancel",
    body?: BodyInit,
    query?: Record<string, string | number>,
) => Promise<{ file?: string }>;

// The dev server's end of it (scripts/dev/trailer-server.ts)
export const postTrailer: TrailerPost = async (path, body, query) => {
    const search = query
        ? `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`
        : "";
    const response = await fetch(`/__trailer/${path}${search}`, { method: "POST", body });
    if (response.status === 204) {
        return {};
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(json.error ?? `The dev server said ${response.status} to ${path}`);
    }
    return json;
};

export type TrailerHost = {
    readonly renderer: Renderer;
    // The 2D canvas over the 3D view (Overlay), drawn into the trailer over it
    readonly overlay: HTMLCanvasElement;
    readonly audio: GameAudio;
    // How much of what the camera will see is still to load
    getLoading(): { total: number; left: number };
    // The cinematic playing from the trailer's start, and stopped at its end
    roll(): void;
    cut(): void;
    // Before each frame's drawn
    beforeFrame(): void;
    onProgress(progress: TrailerProgress): void;
};

// Lets the page see to clicks and paint between frames, with no timer to be held back in a tab
// that's out of sight
function yieldToPage(): Promise<void> {
    return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(0);
    });
}

// Both canvases drawn at the trailer's size, whatever the window's (the renderer and Overlay go
// by their size on the page), and shrunk on screen to fit where they were
function sizeCanvases(canvases: HTMLCanvasElement[], width: number, height: number): () => void {
    const saved = canvases.map((canvas) => canvas.style.cssText);
    const box = canvases[0].parentElement;
    const cssWidth = width / pixelRatio;
    const cssHeight = height / pixelRatio;
    const fit = box ? Math.min(1, box.clientWidth / cssWidth, box.clientHeight / cssHeight) : 1;
    for (const canvas of canvases) {
        Object.assign(canvas.style, {
            position: "absolute",
            left: "0",
            top: "0",
            width: `${cssWidth}px`,
            height: `${cssHeight}px`,
            transform: `scale(${fit})`,
            transformOrigin: "0 0",
        });
    }
    return () => canvases.forEach((canvas, i) => (canvas.style.cssText = saved[i]));
}

// The canvases drawn one over another, at width by height: a frame's pixels, as RGBA
export type FrameCapture = (layers: HTMLCanvasElement[]) => Uint8ClampedArray<ArrayBuffer>;

function canvasCapture(width: number, height: number): FrameCapture {
    const compose = document.createElement("canvas");
    compose.width = width;
    compose.height = height;
    const context = compose.getContext("2d", { willReadFrequently: true })!;
    return (layers) => {
        context.fillStyle = "#000";
        context.fillRect(0, 0, width, height);
        for (const layer of layers) {
            context.drawImage(layer, 0, 0, width, height);
        }
        return context.getImageData(0, 0, width, height).data;
    };
}

export class TrailerRecorder {
    cancelled = false;

    constructor(
        readonly spec: TrailerSpec,
        private readonly host: TrailerHost,
        private readonly post: TrailerPost = postTrailer,
        private readonly makeCapture: typeof canvasCapture = canvasCapture,
    ) {}

    cancel(): void {
        this.cancelled = true;
    }

    private check(): void {
        if (this.cancelled) {
            throw new Error("Cancelled");
        }
    }

    // Recorded and made into an MP4: where it is
    async record(): Promise<string> {
        const { spec, host } = this;
        const restoreSize = sizeCanvases(
            [host.renderer.canvas, host.overlay],
            spec.width,
            spec.height,
        );
        let started = false;
        try {
            await this.waitToLoad();
            const { file } = await this.post("start", undefined, {
                name: spec.name,
                width: spec.width,
                height: spec.height,
                fps: spec.fps,
            });
            started = true;
            const sound = await this.recordFrames(restoreSize);
            let wav: ArrayBuffer | undefined;
            if (spec.sound && sound) {
                host.onProgress({ stage: "sound", done: 0, total: 1 });
                const rendered = await host.audio.renderRecording(sound, spec.frames / spec.fps, {
                    volume: spec.volume,
                    music: spec.music,
                });
                const channels = [0, 1].map((i) => rendered.getChannelData(i));
                wav = encodeWav(channels, rendered.sampleRate);
            }
            this.check();
            host.onProgress({ stage: "encoding", done: 0, total: 1 });
            const finished = await this.post("finish", wav);
            started = false;
            return finished.file ?? file ?? spec.name;
        } catch (error) {
            if (started) {
                await this.post("cancel").catch(() => {});
            }
            throw error;
        } finally {
            restoreSize();
        }
    }

    // Real frames go on until what the camera will see has loaded
    private async waitToLoad(): Promise<void> {
        const start = performance.now();
        for (;;) {
            this.check();
            const { total, left } = this.host.getLoading();
            this.host.onProgress({ stage: "loading", done: total - left, total });
            if (left === 0 || performance.now() - start > LOAD_TIMEOUT_MS) {
                // A frame at the trailer's size, before the clock's taken over
                await new Promise((resolve) => setTimeout(resolve, 100));
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    // Every frame drawn on the trailer's clock and sent, and its sounds kept. The game's back on
    // its own loop and clock after, whatever happens.
    private async recordFrames(restoreSize: () => void): Promise<SoundRecording | undefined> {
        const { spec, host } = this;
        const { renderer, overlay, audio } = host;
        const { frames } = spec;
        const step = 1000 / spec.fps;
        // Read back in the same task as it's drawn: the 3D canvas isn't kept after it's shown
        const capture = this.makeCapture(spec.width, spec.height);

        const running = renderer.running;
        renderer.running = false;
        if (renderer.animationId !== undefined) {
            cancelAnimationFrame(renderer.animationId);
            renderer.animationId = undefined;
        }
        const clock = new VirtualClock(performance.now());
        clock.install();
        renderer.stats.lastFrameTime = clock.time;
        // A sound from the first frame's at the video's start
        audio.startRecording(clock.time + step);
        let sound: SoundRecording | undefined;
        try {
            host.roll();
            let sending: Promise<unknown> = Promise.resolve();
            let told = 0;
            for (let frame = 0; frame < frames; frame++) {
                this.check();
                clock.time += step;
                host.beforeFrame();
                renderer.fpsLimit = 0;
                renderer.frameCallback(clock.time);
                const pixels = capture([renderer.canvas, overlay]);
                // One frame on its way while the next is drawn, and in order
                await sending;
                sending = this.post("frame", pixels);
                // Its failure's thrown where it's awaited, not reported as unhandled meanwhile
                sending.catch(() => {});
                const now = clock.real();
                if (now - told > PROGRESS_MS || frame === frames - 1) {
                    told = now;
                    host.onProgress({ stage: "frames", done: frame + 1, total: frames });
                }
                await yieldToPage();
            }
            await sending;
        } finally {
            sound = audio.stopRecording();
            host.cut();
            clock.restore();
            // Its next frame's time is the real clock's again
            renderer.stats.lastFrameTime = undefined;
            restoreSize();
            if (running) {
                renderer.start();
            }
        }
        return sound;
    }
}
