// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { GameAudio } from "./GameAudio";

// Sounds as the render workers synthesize them, seconds long
function withSounds(audio: GameAudio, sounds: Record<number, number>): void {
    const map = (audio as unknown as { sounds: Map<number, unknown> }).sounds;
    for (const [id, seconds] of Object.entries(sounds)) {
        const sampleRate = 22050;
        map.set(Number(id), {
            id: Number(id),
            samples: new Float32Array(seconds * sampleRate),
            sampleRate,
        });
    }
}

describe("a trailer's sound", () => {
    let now = 0;
    let audio: GameAudio;

    beforeEach(() => {
        now = 1000;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        // jsdom can't play anything
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
        vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
        vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
        audio = new GameAudio();
    });

    afterEach(() => {
        audio.dispose();
        vi.restoreAllMocks();
    });

    test("is kept, with when each sound played, though the browser hasn't let it play yet", () => {
        withSounds(audio, { 1: 0.5, 2: 0.5 });
        audio.startRecording(1000);
        audio.play(1, { volume: 0.5, pan: -2 });
        now = 1250;
        audio.play(2);
        audio.play(3);
        expect(audio.stopRecording()!.sounds).toEqual([
            { id: 1, at: 0, volume: 0.5, pan: -1 },
            { id: 2, at: 0.25, volume: 1, pan: 0 },
        ]);
        // And then nothing more's kept
        audio.play(1);
        expect(audio.stopRecording()).toBeUndefined();
    });

    test("keeps each sound's gap, and a few at once at most, by the trailer's clock", () => {
        withSounds(audio, { 1: 0.1, 2: 10 });
        audio.startRecording(1000);
        audio.play(1, { minGap: 100 });
        now = 1050;
        audio.play(1, { minGap: 100 });
        now = 1100;
        audio.play(1, { minGap: 100 });
        for (let i = 0; i < 30; i++) {
            now += 1;
            audio.play(2, { minGap: 0 });
        }
        const sounds = audio.stopRecording()!.sounds;
        expect(sounds.filter(({ id }) => id === 1).map(({ at }) => at)).toEqual([0, 0.1]);
        // The first 1 has ended by then, but the second's one of the 24
        expect(sounds.filter(({ id }) => id === 2).length).toBe(23);
    });

    test("follows the music from the start, and the game's music waits for it", () => {
        audio.playMusic("/a.ogg");
        const pause = vi.mocked(HTMLMediaElement.prototype.pause);
        pause.mockClear();
        audio.startRecording(1000);
        expect(pause).toHaveBeenCalled();
        const play = vi.mocked(HTMLMediaElement.prototype.play);
        play.mockClear();
        now = 3000;
        audio.playMusic("/b.ogg");
        now = 4000;
        audio.stopMusic();
        expect(play).not.toHaveBeenCalled();
        expect(audio.stopRecording()!.music).toEqual([
            { at: 0, url: "/a.ogg" },
            { at: 2, url: "/b.ogg" },
            { at: 3, url: undefined },
        ]);
    });
});
