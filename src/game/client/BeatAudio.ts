// A fight on a beat (BossDef.song, the Bell Choir): its sounds started on the audio clock exactly
// when the beat they're on is shown, and its music kept in time with the sim's beat. Nothing here
// changes the run: muted, or with the music off, the fight plays the same.
//
// - Sounds: a beat is known a little ahead (the sim's clock), so each is started with
//   AudioContext's start(when) a few ticks early, rather than as the tick that has it is handled
//   (a frame late, and jittery). when is moved earlier by the output latency the browser reports,
//   so it's heard as the picture shows it.
// - Music: the track is at 120 beats a minute from its first sample (Song of the Silent Choir), so
//   where it should be is the sim's beats times half a second. Faster tempos play it faster
//   (playbackRate, with the pitch held where the browser can), and MusicSync nudges the rate by up
//   to MAX_NUDGE to stay with the beat, or jumps when it's more than JUMP_SECONDS out.

// Seconds a beat lasts in the track at its own speed (120 beats a minute)
export const TRACK_BEAT_SECONDS = 0.5;
// The most the rate's nudged either way to catch up with the beat, and how hard
const MAX_NUDGE = 0.03;
const NUDGE_PER_SECOND = 0.5;
// Further out than this, it jumps to where it should be
export const JUMP_SECONDS = 0.25;
// The rate's only set again when it's moved this much (each set can click)
const RATE_STEP = 0.002;

// What MusicSync works on: the game's music element, or the dev page's
export type MusicElement = Pick<
    HTMLAudioElement,
    "currentTime" | "duration" | "playbackRate" | "paused" | "readyState"
> & { preservesPitch?: boolean; webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean };

// How far apart two places in a looping track are, the short way round, positive when at is
// ahead of target
export function loopDrift(at: number, target: number, duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) {
        return at - target;
    }
    let drift = (at - target) % duration;
    if (drift > duration / 2) {
        drift -= duration;
    } else if (drift < -duration / 2) {
        drift += duration;
    }
    return drift;
}

// The rate that catches the track up with the beat: the tempo's own, a little faster when behind
// and slower when ahead
export function nudgedRate(rate: number, drift: number): number {
    const nudge = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, drift * NUDGE_PER_SECOND));
    return rate * (1 - nudge);
}

// Holds the pitch as the rate goes up, where the browser can (all three names it's had)
export function holdPitch(element: MusicElement): boolean {
    element.preservesPitch = true;
    element.webkitPreservesPitch = true;
    element.mozPreservesPitch = true;
    return (
        element.preservesPitch === true ||
        element.webkitPreservesPitch === true ||
        element.mozPreservesPitch === true
    );
}

// Keeps a looping track on the beat
export class MusicSync {
    // How far out it was when last looked at (seconds, positive ahead), for the dev page
    drift = 0;
    jumps = 0;
    pitchHeld = false;
    private element?: MusicElement;

    // beats: where the beat is now, as heard (the sim's beats since its clock began, fractional),
    // and rate: the tempo's speed against the track's own 120 (1, 1.136, 1.25)
    update(element: MusicElement | undefined, beats: number, rate: number): void {
        if (!element) {
            return;
        }
        if (element !== this.element) {
            this.element = element;
            this.pitchHeld = holdPitch(element);
        }
        if (element.paused || element.readyState < 2) {
            return;
        }
        const target = beats * TRACK_BEAT_SECONDS;
        const duration = element.duration;
        const drift = loopDrift(element.currentTime, target, duration);
        this.drift = drift;
        if (Math.abs(drift) > JUMP_SECONDS) {
            const at = Number.isFinite(duration) && duration > 0 ? target % duration : target;
            element.currentTime = Math.max(0, at);
            this.jumps++;
            this.setRate(element, rate);
            return;
        }
        this.setRate(element, nudgedRate(rate, drift));
    }

    private setRate(element: MusicElement, rate: number): void {
        if (Math.abs(element.playbackRate - rate) >= RATE_STEP) {
            element.playbackRate = rate;
        }
    }
}

// When to start a sound on the audio clock so it's heard as the picture shows tick: shownTick is
// the tick being shown now (fractional), clockNow the audio clock now, latency the output's
export function whenForTick(
    tick: number,
    shownTick: number,
    clockNow: number,
    latency: number,
    ticksPerSecond: number,
): number {
    return clockNow + (tick - shownTick) / ticksPerSecond - latency;
}
