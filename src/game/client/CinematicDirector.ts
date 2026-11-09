import { CinematicCueDef, CinematicDef, CinematicShotDef, MapDef } from "../content/types";
import { CinematicCamera, CinematicPlayer, getCinematicCamera } from "./Cinematic";

// Dev only: the shot editor (GameClient.direct, ?director=<map id>). It holds one of a map's
// cinematics (getDirectorChoices) at any moment you pick, plays it from there, and lets you fly a
// camera of your own round the map: a shot added or set is where that camera is, at the moment
// the playhead's at. The shots come out as code (toCode) to paste over the def's own. Its cast and
// cues are the def's, untouched, so shots can be timed against them. Nothing of it reaches the
// sim, and the shots are kept as a draft in this browser (DraftStore) so a reload doesn't lose
// them.

// A shot's camera: looking at x, y (world tiles), lift tiles above the ground there, from
// distance tiles at pitch and yaw (CinematicShotDef's)
export type ShotCamera = {
    x: number;
    y: number;
    lift: number;
    pitch: number;
    yaw: number;
    distance: number;
};

export type CameraShotDef = Extract<CinematicShotDef, { x: number }>;
export type ShotField = keyof ShotCamera;

// One of a map's cinematics to edit. key names its draft; fresh: the map hasn't one yet, so it
// comes out as a whole def to put on the MapDef
export type DirectorChoice = { key: string; label: string; def: CinematicDef; fresh: boolean };

// Where drafts are kept: window.localStorage in the game
export type DraftStore = Pick<Storage, "getItem" | "setItem">;
const DRAFTS_KEY = "run-escape-director-drafts";

// The least time between two shots, and how far on the run's camera moves when a shot's added
// at the end (seconds)
const MIN_GAP = 0.1;
const END_GAP = 2;
// A new opening's length, from its one shot over the spawn to the run's camera
const NEW_SECONDS = 6;

// The camera of your own: angle units turned per pixel dragged, tiles moved per pixel dragged for
// each tile it's out, tiles a second flown for each tile out (at least FLY_MIN), lift and angle
// units a second, Shift's speed up, and how far in and out it goes
const ORBIT_YAW = 4;
const ORBIT_PITCH = 3;
const PAN_PER_PIXEL = 1 / 400;
const FLY_PER_DISTANCE = 0.8;
const FLY_MIN = 4;
const LIFT_SPEED = 2;
const TURN_SPEED = 600;
const TILT_SPEED = 300;
const FAST = 4;
const MIN_PITCH = -511;
const MAX_PITCH = 256;
const MIN_DISTANCE = 1;
const MAX_DISTANCE = 80;

// Held keys, for flying: each -1, 0 or 1
export type FlyInput = {
    forward: number;
    right: number;
    up: number;
    turn: number;
    tilt: number;
    fast: boolean;
};

// Something on the timeline: a cue, said in a few words
export type DirectorCue = {
    at: number;
    kind: "say" | "seq" | "spot" | "sound" | "gone";
    text: string;
};

// The panel's view of it, replaced on every change
export type DirectorSnapshot = {
    choices: { key: string; label: string }[];
    choice: number;
    fresh: boolean;
    shots: readonly CinematicShotDef[];
    cues: DirectorCue[];
    seconds: number;
    duration: number;
    playing: boolean;
    selected: number;
    // The camera's been moved off the path since the playhead last moved
    moved: boolean;
    camera: ShotCamera;
    // The shots aren't the def's, and they came from a draft
    edited: boolean;
    fromDraft: boolean;
    panel: boolean;
};

// A map's cinematics to edit: its opening (a new one if it hasn't one) and its lairs'
export function getDirectorChoices(map: MapDef): DirectorChoice[] {
    const choices: DirectorChoice[] = [
        map.cinematic
            ? { key: map.id + ":opening", label: "Opening", def: map.cinematic, fresh: false }
            : {
                  key: map.id + ":opening",
                  label: "Opening (new)",
                  def: newOpening(map),
                  fresh: true,
              },
    ];
    for (const lair of map.lairs ?? []) {
        if (lair.opening) {
            choices.push({
                key: `${map.id}:lair:${lair.id}`,
                label: `Lair: ${lair.id}`,
                def: lair.opening.cinematic,
                fresh: false,
            });
        }
    }
    return choices;
}

// One shot over the spawn, as the run's camera has it, then the run's camera
function newOpening(map: MapDef): CinematicDef {
    const { x, y } = map.spawn;
    return {
        seconds: NEW_SECONDS,
        cast: [],
        cues: [],
        shots: [
            { at: 0, x, y, lift: 0.6, pitch: -400, yaw: 0, distance: 18 },
            { at: NEW_SECONDS, player: true },
        ],
    };
}

export class CinematicDirector {
    // Its own copy of the def: the shots and seconds change, the cast and cues are the def's
    readonly def: CinematicDef;
    // What GameView draws: the def at the playhead, its clock held (the director moves it)
    readonly player: CinematicPlayer;
    // Bumped whenever the shots change, for what's loaded along the way (GameClient)
    shotsVersion = 0;
    private playing = false;
    private selected = 0;
    private moved = false;
    private free: ShotCamera;
    private fromDraft: boolean;
    private panel = true;
    private play: CinematicCamera;
    private readonly cues: DirectorCue[];
    private snapshot: DirectorSnapshot;
    private readonly listeners = new Set<() => void>();

    // ground(x, y): the ground's height there (tiles, up negative); play: the run's camera now
    constructor(
        readonly choices: DirectorChoice[],
        readonly choice: number,
        readonly ground: (x: number, y: number) => number,
        play: CinematicCamera,
        private readonly drafts?: DraftStore,
    ) {
        const source = choices[choice].def;
        const draft = readDrafts(drafts)[choices[choice].key];
        this.fromDraft = draft !== undefined && !sameShots(draft, source.shots);
        const shots = (this.fromDraft ? draft! : source.shots).map((shot) => ({ ...shot }));
        this.def = { ...source, shots, seconds: shots[shots.length - 1].at };
        this.player = new CinematicPlayer(this.def);
        this.player.held = true;
        this.play = play;
        this.free = this.pathCamera();
        this.cues = describeCues(source);
        this.snapshot = this.makeSnapshot();
    }

    get seconds(): number {
        return this.player.seconds;
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = (): DirectorSnapshot => this.snapshot;

    // On by a frame: flown by the keys held, and played on if it's playing. The camera to draw,
    // and the cues it went past (to be heard).
    frame(
        deltaSeconds: number,
        play: CinematicCamera,
        fly?: FlyInput,
    ): { camera: CinematicCamera; cues: CinematicCueDef[] } {
        this.play = play;
        let changed = false;
        if (fly && (fly.forward || fly.right || fly.up || fly.turn || fly.tilt)) {
            this.fly(fly, deltaSeconds);
            changed = true;
        }
        let cues: CinematicCueDef[] = [];
        if (this.playing) {
            const from = this.seconds;
            const to = Math.min(this.def.seconds, from + Math.max(0, deltaSeconds));
            cues = this.def.cues.filter((cue) => cue.at >= from && cue.at < to);
            this.player.seconds = to;
            if (to >= this.def.seconds) {
                this.playing = false;
            }
            changed = true;
        }
        if (changed) {
            this.emit();
        }
        return { camera: this.getCamera(), cues };
    }

    // The camera to draw: yours once it's moved, or else the path's at the playhead
    getCamera(): CinematicCamera {
        if (!this.moved) {
            return getCinematicCamera(this.def, this.seconds, this.ground, this.play);
        }
        const { x, y, lift, pitch, yaw, distance } = this.free;
        return { x, y, height: this.ground(x, y) - lift, pitch, yaw, distance };
    }

    // ---- The playhead ----

    seek(seconds: number): void {
        this.player.seconds = clamp(seconds, 0, this.def.seconds);
        this.moved = false;
        this.emit();
    }

    // Playing from seconds, on the path (a trailer's recording)
    playFrom(seconds: number): void {
        this.player.seconds = clamp(seconds, 0, this.def.seconds);
        this.moved = false;
        this.playing = true;
        this.emit();
    }

    pause(): void {
        if (this.playing) {
            this.playing = false;
            this.emit();
        }
    }

    togglePlay(): void {
        if (this.playing) {
            this.playing = false;
        } else {
            if (this.seconds >= this.def.seconds) {
                this.player.seconds = 0;
            }
            this.playing = true;
            this.moved = false;
        }
        this.emit();
    }

    // The shot at index, and the playhead on it
    select(index: number): void {
        const shot = this.def.shots[index];
        if (!shot) {
            return;
        }
        this.selected = index;
        this.playing = false;
        this.seek(shot.at);
    }

    // The shot before or after the playhead (-1 or 1)
    selectNext(direction: number): void {
        const shots = this.def.shots;
        const t = this.seconds;
        const index =
            direction > 0
                ? shots.findIndex((shot) => shot.at > t + 1e-6)
                : findLastIndex(shots, (shot) => shot.at < t - 1e-6);
        if (index >= 0) {
            this.select(index);
        }
    }

    // The camera back on the path
    resetCamera(): void {
        this.moved = false;
        this.emit();
    }

    togglePanel(): void {
        this.panel = !this.panel;
        this.emit();
    }

    // ---- Your camera ----

    // Dragged: turned round what it looks at
    orbit(dx: number, dy: number): void {
        const free = this.takeCamera();
        free.yaw -= dx * ORBIT_YAW;
        free.pitch = clamp(free.pitch + dy * ORBIT_PITCH, MIN_PITCH, MAX_PITCH);
        this.emit();
    }

    // Dragged: what it looks at moved over the ground, the ground held under the pointer
    pan(dx: number, dy: number): void {
        const free = this.takeCamera();
        const { forward, right } = getAxes(free.yaw);
        const tiles = free.distance * PAN_PER_PIXEL;
        free.x += (-right.x * dx + forward.x * dy) * tiles;
        free.y += (-right.y * dx + forward.y * dy) * tiles;
        this.emit();
    }

    // Wheel steps, positive out
    zoom(steps: number): void {
        const free = this.takeCamera();
        free.distance = clamp(free.distance * Math.pow(1.1, steps), MIN_DISTANCE, MAX_DISTANCE);
        this.emit();
    }

    private fly(input: FlyInput, seconds: number): void {
        const free = this.takeCamera();
        const fast = input.fast ? FAST : 1;
        const { forward, right } = getAxes(free.yaw);
        const tiles = Math.max(FLY_MIN, free.distance * FLY_PER_DISTANCE) * fast * seconds;
        free.x += (forward.x * input.forward + right.x * input.right) * tiles;
        free.y += (forward.y * input.forward + right.y * input.right) * tiles;
        free.lift += input.up * LIFT_SPEED * fast * seconds;
        free.yaw += input.turn * TURN_SPEED * seconds;
        free.pitch = clamp(free.pitch + input.tilt * TILT_SPEED * seconds, MIN_PITCH, MAX_PITCH);
    }

    // The camera's yours from where it is now, and the playing stopped
    private takeCamera(): ShotCamera {
        if (!this.moved) {
            this.free = this.pathCamera();
            this.moved = true;
        }
        this.playing = false;
        return this.free;
    }

    private pathCamera(): ShotCamera {
        const camera = getCinematicCamera(this.def, this.seconds, this.ground, this.play);
        const { x, y, pitch, yaw, distance } = camera;
        return { x, y, lift: this.ground(x, y) - camera.height, pitch, yaw, distance };
    }

    // ---- The shots ----

    // A shot where the camera is, at the playhead: the shot there if there's one already (but the
    // run's camera at the end), or else a new one. One at the end comes before the run's camera,
    // which moves on to make room.
    addShot(): void {
        const shots = [...this.def.shots];
        const t = round(this.seconds, 1);
        const same = shots.findIndex((shot) => Math.abs(shot.at - t) < MIN_GAP - 1e-6);
        let index: number;
        if (same >= 0 && same < shots.length - 1) {
            index = same;
            shots[index] = withCamera(shots[index], this.captureCamera(index));
        } else {
            const last = shots[shots.length - 1];
            if (last.at < t + MIN_GAP) {
                shots[shots.length - 1] = { ...last, at: round(t + END_GAP, 1) };
            }
            index = shots.findIndex((shot) => shot.at > t);
            shots.splice(index, 0, { at: t, ...this.captureCamera(index) });
        }
        this.selected = index;
        this.setShots(shots);
        this.player.seconds = shots[index].at;
        this.moved = false;
        this.emit();
    }

    // The selected shot moved to where the camera is, at its own time (the run's camera made a
    // shot of its own, if it was that); false for the run's camera at the end
    setShot(): boolean {
        const index = this.selected;
        const shot = this.def.shots[index];
        if (!shot || index >= this.def.shots.length - 1) {
            return false;
        }
        const shots = [...this.def.shots];
        shots[index] = withCamera(shot, this.captureCamera(index));
        this.setShots(shots);
        this.player.seconds = shot.at;
        this.moved = false;
        this.emit();
        return true;
    }

    // The selected shot taken out: never the first, nor the run's camera at the end
    removeShot(): boolean {
        const index = this.selected;
        const shots = this.def.shots;
        if (index <= 0 || index >= shots.length - 1) {
            return false;
        }
        this.setShots(shots.filter((_, i) => i !== index));
        this.selected = index - 1;
        this.emit();
        return true;
    }

    // A shot moved in time, kept between the ones either side (the first stays at 0)
    retime(index: number, at: number): void {
        const shots = [...this.def.shots];
        if (index <= 0 || index >= shots.length || !Number.isFinite(at)) {
            return;
        }
        const before = shots[index - 1].at + MIN_GAP;
        const after = index + 1 < shots.length ? shots[index + 1].at - MIN_GAP : Infinity;
        shots[index] = { ...shots[index], at: clamp(round(at, 1), before, after) };
        this.setShots(shots);
        this.emit();
    }

    // One of a shot's numbers, typed in
    setField(index: number, field: ShotField, value: number): void {
        const shot = this.def.shots[index];
        if (!shot || !("x" in shot) || !Number.isFinite(value)) {
            return;
        }
        const shots = [...this.def.shots];
        shots[index] = { ...shot, [field]: clampField(field, value) };
        this.setShots(shots);
        this.emit();
    }

    toggleHold(index: number = this.selected): void {
        const shot = this.def.shots[index];
        if (!shot || !("x" in shot)) {
            return;
        }
        const shots = [...this.def.shots];
        const { hold, ...rest } = shot;
        shots[index] = hold ? rest : { ...rest, hold: true };
        this.setShots(shots);
        this.emit();
    }

    // Back to the def's own shots, and the draft dropped
    revert(): void {
        this.setShots(this.choices[this.choice].def.shots.map((shot) => ({ ...shot })));
        this.selected = Math.min(this.selected, this.def.shots.length - 1);
        this.fromDraft = false;
        this.moved = false;
        this.emit();
    }

    // The shots as code, to paste over the def's seconds and shots (or onto the MapDef as its
    // cinematic, for a new one)
    toCode(): string {
        const shots = this.def.shots.map((shot) => `    ${shotCode(shot)},`);
        const lines = [`seconds: ${num(this.def.seconds)},`, "shots: [", ...shots, "],"];
        if (!this.choices[this.choice].fresh) {
            return lines.join("\n");
        }
        return [
            "cinematic: {",
            ...[...lines.slice(0, 1), "cast: [],", "cues: [],", ...lines.slice(1)].map(
                (line) => "    " + line,
            ),
            "},",
        ].join("\n");
    }

    // A key pressed (GameClient.pressKey): true when it's one of the editor's
    press(code: string): boolean {
        switch (code) {
            case "Space":
                this.togglePlay();
                return true;
            case "Enter":
            case "NumpadEnter":
                this.addShot();
                return true;
            case "KeyU":
                this.setShot();
                return true;
            case "Delete":
            case "Backspace":
                this.removeShot();
                return true;
            case "KeyH":
                this.toggleHold();
                return true;
            case "BracketLeft":
                this.selectNext(-1);
                return true;
            case "BracketRight":
                this.selectNext(1);
                return true;
            case "Comma":
                this.playing = false;
                this.seek(round(this.seconds - MIN_GAP, 1));
                return true;
            case "Period":
                this.playing = false;
                this.seek(round(this.seconds + MIN_GAP, 1));
                return true;
            case "Home":
                this.seek(0);
                return true;
            case "End":
                this.seek(this.def.seconds);
                return true;
            case "KeyR":
                this.resetCamera();
                return true;
            case "KeyV":
                this.togglePanel();
                return true;
        }
        // Flying: read as they're held (FlyInput)
        return FLY_KEYS.has(code);
    }

    // The camera as a shot would have it, rounded, its yaw the way round nearest the shot before
    // index (so the camera doesn't spin the long way to it)
    private captureCamera(index: number): ShotCamera {
        const camera = this.moved ? this.free : this.pathCamera();
        let yaw = Math.round(camera.yaw);
        const before = this.def.shots
            .slice(0, index)
            .reverse()
            .find((shot): shot is CameraShotDef => "x" in shot);
        if (before) {
            yaw += Math.round((before.yaw - yaw) / 2048) * 2048;
        }
        return {
            x: round(camera.x, 1),
            y: round(camera.y, 1),
            lift: round(camera.lift, 1),
            pitch: Math.round(camera.pitch),
            yaw,
            distance: round(camera.distance, 1),
        };
    }

    private setShots(shots: CinematicShotDef[]): void {
        this.def.shots = shots;
        this.def.seconds = shots[shots.length - 1].at;
        this.player.seconds = Math.min(this.player.seconds, this.def.seconds);
        this.shotsVersion++;
        this.writeDraft();
    }

    private writeDraft(): void {
        const key = this.choices[this.choice].key;
        const drafts = readDrafts(this.drafts);
        if (sameShots(this.def.shots, this.choices[this.choice].def.shots)) {
            delete drafts[key];
        } else {
            drafts[key] = this.def.shots;
        }
        try {
            this.drafts?.setItem(DRAFTS_KEY, JSON.stringify(drafts));
        } catch {
            // Storage full or blocked: the draft's lost on a reload, nothing else
        }
    }

    private emit(): void {
        this.snapshot = this.makeSnapshot();
        for (const listener of this.listeners) {
            listener();
        }
    }

    private makeSnapshot(): DirectorSnapshot {
        const shown = this.moved ? this.free : this.pathCamera();
        return {
            choices: this.choices.map(({ key, label }) => ({ key, label })),
            choice: this.choice,
            fresh: this.choices[this.choice].fresh,
            shots: this.def.shots,
            cues: this.cues,
            seconds: this.seconds,
            duration: this.def.seconds,
            playing: this.playing,
            selected: this.selected,
            moved: this.moved,
            camera: {
                x: round(shown.x, 1),
                y: round(shown.y, 1),
                lift: round(shown.lift, 1),
                pitch: Math.round(shown.pitch),
                yaw: Math.round(shown.yaw),
                distance: round(shown.distance, 1),
            },
            edited: !sameShots(this.def.shots, this.choices[this.choice].def.shots),
            fromDraft: this.fromDraft,
            panel: this.panel,
        };
    }
}

const FLY_KEYS = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyQ",
    "KeyE",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ShiftLeft",
    "ShiftRight",
]);

// Which way the camera faces along the ground, and its right, for a yaw (x east, y north)
function getAxes(yaw: number): {
    forward: { x: number; y: number };
    right: { x: number; y: number };
} {
    const angle = ((yaw - 1024) * Math.PI) / 1024;
    const forward = { x: -Math.sin(angle), y: -Math.cos(angle) };
    return { forward, right: { x: forward.y, y: -forward.x } };
}

// A shot at its own time where camera is, held if it was
function withCamera(shot: CinematicShotDef, camera: ShotCamera): CameraShotDef {
    return "x" in shot && shot.hold
        ? { at: shot.at, ...camera, hold: true }
        : { at: shot.at, ...camera };
}

function clampField(field: ShotField, value: number): number {
    switch (field) {
        case "pitch":
            return clamp(Math.round(value), MIN_PITCH, MAX_PITCH);
        case "yaw":
            return Math.round(value);
        case "distance":
            return clamp(value, MIN_DISTANCE, MAX_DISTANCE);
        default:
            return value;
    }
}

function describeCues(def: CinematicDef): DirectorCue[] {
    const cues: DirectorCue[] = [];
    for (const cue of def.cues) {
        const who = cue.actor + ": ";
        if (cue.say !== undefined) {
            cues.push({ at: cue.at, kind: "say", text: `${who}"${cue.say}"` });
        }
        if (cue.seq !== undefined) {
            cues.push({ at: cue.at, kind: "seq", text: `${who}seq ${cue.seq}` });
        }
        if (cue.spotAnim !== undefined) {
            cues.push({ at: cue.at, kind: "spot", text: `${who}spot animation ${cue.spotAnim}` });
        }
        if (cue.sound !== undefined) {
            cues.push({ at: cue.at, kind: "sound", text: `${who}sound ${cue.sound}` });
        }
        if (cue.gone) {
            cues.push({ at: cue.at, kind: "gone", text: `${who}gone` });
        }
    }
    return cues.sort((a, b) => a.at - b.at);
}

function shotCode(shot: CinematicShotDef): string {
    if ("player" in shot) {
        return `{ at: ${num(shot.at)}, player: true }`;
    }
    const hold = shot.hold ? ", hold: true" : "";
    return (
        `{ at: ${num(shot.at)}, x: ${num(shot.x)}, y: ${num(shot.y)}, lift: ${num(shot.lift)}, ` +
        `pitch: ${Math.round(shot.pitch)}, yaw: ${Math.round(shot.yaw)}, ` +
        `distance: ${num(shot.distance)}${hold} }`
    );
}

// A number as code: two places at most, and no -0
function num(value: number): string {
    return String(round(value, 2) || 0);
}

function round(value: number, places: number): number {
    const scale = Math.pow(10, places);
    return Math.round(value * scale) / scale;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function findLastIndex<T>(items: readonly T[], test: (item: T) => boolean): number {
    for (let i = items.length - 1; i >= 0; i--) {
        if (test(items[i])) {
            return i;
        }
    }
    return -1;
}

function sameShots(a: readonly CinematicShotDef[], b: readonly CinematicShotDef[]): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function readDrafts(drafts?: DraftStore): Record<string, CinematicShotDef[]> {
    try {
        const parsed: unknown = JSON.parse(drafts?.getItem(DRAFTS_KEY) ?? "{}");
        if (!parsed || typeof parsed !== "object") {
            return {};
        }
        const valid: Record<string, CinematicShotDef[]> = {};
        for (const [key, shots] of Object.entries(parsed)) {
            if (isShots(shots)) {
                valid[key] = shots;
            }
        }
        return valid;
    } catch {
        return {};
    }
}

// A draft that can be played: shots in order, the first at 0, each a camera or the run's
// camera, the last the run's
function isShots(value: unknown): value is CinematicShotDef[] {
    if (!Array.isArray(value) || value.length < 2) {
        return false;
    }
    const numbers = ["x", "y", "lift", "pitch", "yaw", "distance"];
    return value.every((shot, i) => {
        if (
            !shot ||
            typeof shot.at !== "number" ||
            (i === 0 ? shot.at !== 0 : shot.at <= value[i - 1].at)
        ) {
            return false;
        }
        if (shot.player === true) {
            return true;
        }
        return i < value.length - 1 && numbers.every((key) => typeof shot[key] === "number");
    });
}
