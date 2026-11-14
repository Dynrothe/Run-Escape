// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

import type { Renderer } from "../../components/renderer/Renderer";
import type { GameAudio, SoundRecording } from "./GameAudio";
import {
    TrailerHost,
    TrailerPost,
    TrailerRecorder,
    VirtualClock,
    encodeWav,
    getTrailerSpec,
} from "./TrailerRecorder";

describe("a trailer's options", () => {
    const date = new Date(2026, 10, 8, 21, 5, 9);

    test("are the whole cinematic at 1080p and 60 frames a second, named for the map", () => {
        expect(getTrailerSpec({}, 24.3, "battle_for_varrock", date)).toEqual({
            width: 1920,
            height: 1080,
            fps: 60,
            from: 0,
            to: 24.3,
            frames: 1458,
            live: false,
            warmup: 0,
            sound: true,
            volume: 0.6,
            music: 0.6,
            name: "battle_for_varrock-20261108-210509",
        });
    });

    test("keep to even sides and frame rates the cinematic's clock can keep up with", () => {
        const spec = getTrailerSpec({ width: 1081, height: 721, fps: 2 }, 10, "map", date);
        expect([spec.width, spec.height, spec.fps]).toEqual([1080, 720, 10]);
        expect(getTrailerSpec({ fps: 1000 }, 10, "map", date).fps).toBe(240);
    });

    test("start within the cinematic, and can go on past its end", () => {
        const spec = getTrailerSpec({ from: 30, fps: 30 }, 10, "map", date);
        expect([spec.from, spec.frames]).toEqual([10, 1]);
        const longer = getTrailerSpec({ from: 8, to: 12, fps: 30 }, 10, "map", date);
        expect([longer.from, longer.to, longer.frames]).toEqual([8, 12, 120]);
    });
});

describe("the trailer's clock", () => {
    test("stands in for performance.now until it's put back", () => {
        const now = () => 123;
        const target = { now } as unknown as Performance;
        const clock = new VirtualClock(1000, target);
        clock.install();
        expect(target.now()).toBe(1000);
        clock.time += 16;
        expect(target.now()).toBe(1016);
        clock.restore();
        expect(target.now()).toBe(123);
        expect(clock.real()).toBe(123);
    });
});

describe("a trailer's sound file", () => {
    test("is 16-bit stereo PCM, its samples interleaved and kept to full scale", () => {
        const left = new Float32Array([0, 1, -1]);
        const right = new Float32Array([0.5, 2, -2]);
        const view = new DataView(encodeWav([left, right], 48000));
        const text = (at: number) =>
            String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(at + i)));
        expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
        expect(view.getUint16(22, true)).toBe(2);
        expect(view.getUint32(24, true)).toBe(48000);
        expect(view.getUint32(40, true)).toBe(12);
        const samples = [0, 1, 2, 3, 4, 5].map((i) => view.getInt16(44 + i * 2, true));
        expect(samples).toEqual([0, 16383, 32767, 32767, -32768, -32768]);
    });
});

describe("recording a trailer", () => {
    afterEach(() => vi.restoreAllMocks());

    function fakeCanvas(): HTMLCanvasElement {
        return { style: { cssText: "width: 100%;" }, parentElement: null } as never;
    }

    // A host whose frames are told by the clock they were drawn on
    function setup(options: { failFrame?: number; cancelAt?: number; sound?: boolean } = {}) {
        const spec = getTrailerSpec(
            { width: 4, height: 2, fps: 50, from: 1, to: 1.1, sound: options.sound },
            5,
            "map",
        );
        const drawn: { time: number; now: number }[] = [];
        const events: string[] = [];
        const renderer = {
            canvas: fakeCanvas(),
            running: true,
            animationId: undefined,
            fpsLimit: 60,
            stats: { lastFrameTime: 5 as number | undefined },
            frameCallback: vi.fn((time: number) => {
                drawn.push({ time, now: performance.now() });
                events.push("frame");
            }),
            start: vi.fn(() => events.push("start")),
        };
        const recording = { sounds: [] } as unknown as SoundRecording;
        const audio = {
            startRecording: vi.fn(),
            stopRecording: vi.fn(() => recording),
            renderRecording: vi.fn(async () => ({
                sampleRate: 48000,
                getChannelData: () => new Float32Array(2),
            })),
        };
        let recorder: TrailerRecorder | undefined = undefined;
        const host: TrailerHost = {
            renderer: renderer as unknown as Renderer,
            overlay: fakeCanvas(),
            audio: audio as unknown as GameAudio,
            getLoading: () => ({ total: 3, left: 0 }),
            roll: () => events.push("roll"),
            cut: () => events.push("cut"),
            beforeFrame: () => {
                if (drawn.length === options.cancelAt) {
                    recorder!.cancel();
                }
            },
            onProgress: () => {},
        };
        const posts: { path: string; body?: unknown; query?: unknown }[] = [];
        const post: TrailerPost = async (path, body, query) => {
            posts.push({ path, body, query });
            if (path === "frame" && posts.length - 1 === options.failFrame) {
                throw new Error("ffmpeg stopped");
            }
            return path === "start" || path === "finish" ? { file: "trailers/map.mp4" } : {};
        };
        let frame = 0;
        const capture = () => () => new Uint8ClampedArray(4 * 2 * 4).fill(frame++);
        recorder = new TrailerRecorder(spec, host, post, capture);
        return { recorder, renderer, audio, host, drawn, events, posts };
    }

    test("draws each frame a frame's time after the last, by the clock everything goes by", async () => {
        const realNow = performance.now;
        const { recorder, renderer, audio, host, drawn, events, posts } = setup();
        expect(await recorder.record()).toBe("trailers/map.mp4");

        expect(drawn.length).toBe(5);
        // The clock starts at the real time, so adding a frame's 20 ms can come out a hair off
        const start = drawn[0].time - 20;
        drawn.forEach(({ time }, i) => expect(time - start).toBeCloseTo(20 * (i + 1), 6));
        expect(drawn.every(({ time, now }) => time === now)).toBe(true);
        expect(audio.startRecording).toHaveBeenCalledWith(drawn[0].time);
        expect(events).toEqual([
            "roll",
            "frame",
            "frame",
            "frame",
            "frame",
            "frame",
            "cut",
            "start",
        ]);

        expect(posts.map(({ path }) => path)).toEqual([
            "start",
            ...new Array(5).fill("frame"),
            "finish",
        ]);
        expect(posts[0].query).toMatchObject({ width: 4, height: 2, fps: 50 });
        // In the order they were drawn
        expect(posts.slice(1, 6).map(({ body }) => (body as Uint8ClampedArray)[0])).toEqual([
            0, 1, 2, 3, 4,
        ]);
        expect(posts[6].body).toBeInstanceOf(ArrayBuffer);

        // The game's back as it was
        expect(performance.now).toBe(realNow);
        expect(renderer.stats.lastFrameTime).toBeUndefined();
        expect(renderer.canvas.style.cssText).toBe("width: 100%;");
        expect(host.overlay.style.cssText).toBe("width: 100%;");
    });

    test("without sound, finishes with none", async () => {
        const { recorder, audio, posts } = setup({ sound: false });
        await recorder.record();
        expect(audio.renderRecording).not.toHaveBeenCalled();
        expect(posts[posts.length - 1]).toEqual({
            path: "finish",
            body: undefined,
            query: undefined,
        });
    });

    test("stops when a frame can't be sent, and the game goes on as it was", async () => {
        const realNow = performance.now;
        const { recorder, renderer, events, posts } = setup({ failFrame: 3 });
        await expect(recorder.record()).rejects.toThrow("ffmpeg stopped");
        expect(posts.map(({ path }) => path)).toEqual([
            "start",
            "frame",
            "frame",
            "frame",
            "cancel",
        ]);
        expect(events.slice(-2)).toEqual(["cut", "start"]);
        expect(performance.now).toBe(realNow);
        expect(renderer.running).toBe(false);
        expect(renderer.start).toHaveBeenCalledOnce();
    });

    test("can be cancelled between frames, and nothing's kept", async () => {
        // Cancelled as the third frame's drawn: it's the last
        const { recorder, drawn, posts } = setup({ cancelAt: 2 });
        await expect(recorder.record()).rejects.toThrow("Cancelled");
        expect(drawn.length).toBe(3);
        expect(posts.map(({ path }) => path)).toEqual([
            "start",
            "frame",
            "frame",
            "frame",
            "cancel",
        ]);
    });
});
