import { CinematicActorDef, CinematicCueDef, CinematicDef } from "../content/types";

// A map's opening cinematic (MapDef.cinematic) as it plays: its clock, and what the camera and
// its cast are doing at any moment, worked out from the def and the clock alone. GameClient
// advances it each frame and skips it on any input; CinematicView draws it. None of it touches
// the sim.

// The camera, as CameraRig has it: looking at x, y (world tiles), height (world tiles, up
// negative, as the grid's heights over 128), from distance tiles at pitch and yaw
export type CinematicCamera = {
    x: number;
    y: number;
    height: number;
    pitch: number;
    yaw: number;
    distance: number;
};

// An actor at a moment: the seq they're playing and the seconds it began at, and whether it
// loops; gone when they're no longer drawn
export type CinematicActorState = {
    seq: number;
    start: number;
    loop: boolean;
    gone: boolean;
};

// Seconds in before a press can skip it: the press that started the run isn't one
export const CINEMATIC_SKIP_AFTER = 0.3;
// How long overhead chat stays up, as the client's does
export const CINEMATIC_SAY_SECONDS = 3;

const CHANNELS = ["x", "y", "height", "pitch", "yaw", "distance"] as const;

// Where the camera is at seconds in. ground(x, y): the ground's height there (tiles, up
// negative); play: the run's own camera now, for the last shot.
export function getCinematicCamera(
    def: CinematicDef,
    seconds: number,
    ground: (x: number, y: number) => number,
    play: CinematicCamera,
): CinematicCamera {
    const keys: CinematicCamera[] = [];
    const times: number[] = [];
    const holds: boolean[] = [];
    for (const shot of def.shots) {
        times.push(shot.at);
        if ("player" in shot) {
            // The run's camera's yaw, the way round nearest the shot before it
            const before = keys[keys.length - 1]?.yaw ?? play.yaw;
            const yaw = play.yaw + Math.round((before - play.yaw) / 2048) * 2048;
            keys.push({ ...play, yaw });
            holds.push(true);
        } else {
            keys.push({
                x: shot.x,
                y: shot.y,
                height: ground(shot.x, shot.y) - shot.lift,
                pitch: shot.pitch,
                yaw: shot.yaw,
                distance: shot.distance,
            });
            holds.push(shot.hold === true);
        }
    }
    const out = { ...keys[0] };
    for (const channel of CHANNELS) {
        out[channel] = monotoneAt(
            times,
            keys.map((key) => key[channel]),
            holds,
            seconds,
        );
    }
    return out;
}

// A smooth curve through values at times, the value at t: cubic between each pair (Hermite),
// its slope at each the average of the two either side, cut back so it never overshoots (Fritsch
// and Carlson's), and flat at the ends, at a turn and at a hold, so it eases in and out there.
export function monotoneAt(times: number[], values: number[], holds: boolean[], t: number): number {
    const n = times.length;
    if (t <= times[0] || n === 1) {
        return values[0];
    }
    if (t >= times[n - 1]) {
        return values[n - 1];
    }
    let k = 0;
    while (k + 2 < n && times[k + 1] <= t) {
        k++;
    }
    const slope = (i: number) => (values[i + 1] - values[i]) / (times[i + 1] - times[i]);
    const tangent = (i: number): number => {
        if (i === 0 || i === n - 1 || holds[i]) {
            return 0;
        }
        const a = slope(i - 1);
        const b = slope(i);
        if (a * b <= 0) {
            return 0;
        }
        const m = (a + b) / 2;
        const limit = 3 * Math.min(Math.abs(a), Math.abs(b));
        return Math.sign(m) * Math.min(Math.abs(m), limit);
    };
    const h = times[k + 1] - times[k];
    const s = (t - times[k]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
        (2 * s3 - 3 * s2 + 1) * values[k] +
        (s3 - 2 * s2 + s) * h * tangent(k) +
        (-2 * s3 + 3 * s2) * values[k + 1] +
        (s3 - s2) * h * tangent(k + 1)
    );
}

function cuesOf(def: CinematicDef, actor: string): CinematicCueDef[] {
    return def.cues.filter((cue) => cue.actor === actor).sort((a, b) => a.at - b.at);
}

// What an actor's doing at seconds in
export function getActorState(
    def: CinematicDef,
    actor: CinematicActorDef,
    seconds: number,
): CinematicActorState {
    const state = { seq: actor.seq, start: 0, loop: true, gone: false };
    for (const cue of cuesOf(def, actor.id)) {
        if (cue.at > seconds) {
            break;
        }
        if (cue.seq !== undefined) {
            state.seq = cue.seq;
            state.start = cue.at;
            state.loop = cue.loop === true;
        }
        if (cue.gone) {
            state.gone = true;
        }
    }
    return state;
}

// What an actor's saying over their head at seconds in, if anything: the latest that's still up
export function getSaying(def: CinematicDef, actor: string, seconds: number): string | undefined {
    let saying: string | undefined;
    for (const cue of cuesOf(def, actor)) {
        if (cue.at > seconds) {
            break;
        }
        if (cue.say !== undefined && seconds < cue.at + (cue.sayFor ?? CINEMATIC_SAY_SECONDS)) {
            saying = cue.say;
        }
    }
    return saying;
}

// Every seq a cinematic's actor plays, by npc: its own and its cues', to bake
export function getCinematicSeqs(def: CinematicDef): Map<number, number[]> {
    const seqs = new Map<number, number[]>();
    for (const actor of def.cast) {
        const list = seqs.get(actor.npcId) ?? [];
        for (const seq of [actor.seq, ...cuesOf(def, actor.id).map((cue) => cue.seq)]) {
            if (seq !== undefined && !list.includes(seq)) {
                list.push(seq);
            }
        }
        seqs.set(actor.npcId, list);
    }
    return seqs;
}

// One playing: its clock, which GameClient moves on with each frame's time
export class CinematicPlayer {
    seconds = 0;
    skipped = false;
    // For screenshots (the dev console): the clock stands still
    held = false;

    constructor(readonly def: CinematicDef) {}

    get done(): boolean {
        return this.skipped || this.seconds >= this.def.seconds;
    }

    // Until then a solo run doesn't step: the start of the last shot, the camera on its way back
    // to the player
    get holdsRun(): boolean {
        const shots = this.def.shots;
        const release = shots.length > 1 ? shots[shots.length - 2].at : 0;
        return !this.done && this.seconds < release;
    }

    // On by deltaSeconds; the cues it went past, to be heard
    advance(deltaSeconds: number): CinematicCueDef[] {
        if (this.done || this.held) {
            return [];
        }
        const from = this.seconds;
        this.seconds = Math.min(this.def.seconds, from + Math.max(0, deltaSeconds));
        return this.def.cues.filter((cue) => cue.at >= from && cue.at < this.seconds);
    }

    // Any key, click, tap or button: true when that's skipped it
    skip(): boolean {
        if (this.done || this.seconds < CINEMATIC_SKIP_AFTER) {
            return false;
        }
        this.skipped = true;
        return true;
    }
}
