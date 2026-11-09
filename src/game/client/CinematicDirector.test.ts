import { describe, expect, it } from "vitest";

import { VARROCK_OPENING } from "../content/fun/varrockOpening";
import { getMap } from "../content/maps";
import { CinematicDef, MapDef } from "../content/types";
import { CinematicCamera, getCinematicCamera } from "./Cinematic";
import {
    CinematicDirector,
    DirectorChoice,
    DraftStore,
    getDirectorChoices,
} from "./CinematicDirector";

const PLAY: CinematicCamera = { x: 100, y: 50, height: -2, pitch: -400, yaw: 0, distance: 18 };
// The ground a tile up (heights are up negative), so lift and height differ
const ground = () => -1;

const DEF: CinematicDef = {
    seconds: 10,
    cast: [{ id: "a", npcId: 1, seq: 10, x: 5, y: 5 }],
    cues: [
        { at: 1, actor: "a", say: "Hello" },
        { at: 5, actor: "a", seq: 11, sound: 400 },
    ],
    shots: [
        { at: 0, x: 0, y: 0, lift: 1, pitch: -100, yaw: 0, distance: 5 },
        { at: 4, x: 10, y: 20, lift: 2, pitch: -300, yaw: 1024, distance: 20, hold: true },
        { at: 10, player: true },
    ],
};

const CHOICE: DirectorChoice = { key: "test:opening", label: "Opening", def: DEF, fresh: false };

function memoryStore(): DraftStore & { items: Map<string, string> } {
    const items = new Map<string, string>();
    return {
        items,
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => void items.set(key, value),
    };
}

function director(drafts?: DraftStore, choice = CHOICE): CinematicDirector {
    return new CinematicDirector([choice], 0, ground, PLAY, drafts);
}

describe("the shot editor", () => {
    it("starts on the def's shots, at the start, the camera on the path", () => {
        const d = director();
        const snap = d.getSnapshot();
        expect(snap.shots).toEqual(DEF.shots);
        expect(snap.seconds).toBe(0);
        expect(snap.duration).toBe(10);
        expect(snap.moved).toBe(false);
        expect(snap.edited).toBe(false);
        expect(d.getCamera()).toEqual(getCinematicCamera(DEF, 0, ground, PLAY));
        // What it draws is its own copy, held: the def itself is never touched
        expect(d.player.def).not.toBe(DEF);
        expect(d.player.held).toBe(true);
    });

    it("lists the cues on its timeline, a line for each thing they do", () => {
        expect(director().getSnapshot().cues).toEqual([
            { at: 1, kind: "say", text: 'a: "Hello"' },
            { at: 5, kind: "seq", text: "a: seq 11" },
            { at: 5, kind: "sound", text: "a: sound 400" },
        ]);
    });

    it("plays on from the playhead, the cues it passes heard, and stops at the end", () => {
        const d = director();
        d.seek(0.5);
        d.togglePlay();
        expect(d.frame(1, PLAY).cues.map((cue) => cue.at)).toEqual([1]);
        expect(d.seconds).toBeCloseTo(1.5);
        for (let i = 0; i < 20; i++) {
            d.frame(1, PLAY);
        }
        expect(d.seconds).toBe(10);
        expect(d.getSnapshot().playing).toBe(false);
        // Played again from the end, it starts over
        d.togglePlay();
        expect(d.seconds).toBe(0);
        expect(d.getSnapshot().playing).toBe(true);
    });

    it("never moves the playhead past either end", () => {
        const d = director();
        d.seek(-3);
        expect(d.seconds).toBe(0);
        d.seek(99);
        expect(d.seconds).toBe(10);
    });

    it("steps from shot to shot", () => {
        const d = director();
        d.seek(2);
        d.selectNext(1);
        expect(d.seconds).toBe(4);
        expect(d.getSnapshot().selected).toBe(1);
        d.selectNext(1);
        expect(d.seconds).toBe(10);
        d.selectNext(-1);
        d.selectNext(-1);
        expect(d.seconds).toBe(0);
        expect(d.getSnapshot().selected).toBe(0);
    });

    it("takes the camera off the path from where it was, and puts it back", () => {
        const d = director();
        d.seek(4);
        const before = d.getCamera();
        d.zoom(1);
        const after = d.getCamera();
        expect(d.getSnapshot().moved).toBe(true);
        expect(after.x).toBeCloseTo(before.x);
        expect(after.height).toBeCloseTo(before.height);
        expect(after.distance).toBeCloseTo(before.distance * 1.1);
        d.resetCamera();
        expect(d.getCamera()).toEqual(before);
    });

    it("turns, moves and flies the camera the way it faces", () => {
        const d = director();
        d.seek(4);
        // Facing south (1024): flying forward goes south, right goes west
        d.frame(1, PLAY, { forward: 1, right: 0, up: 1, turn: 0, tilt: 0, fast: false });
        const flown = d.getCamera();
        expect(flown.x).toBeCloseTo(10);
        expect(flown.y).toBeCloseTo(20 - 20 * 0.8);
        // Lifted 2 tiles a second: the ground's -1, so 2 + 2 up is a height of -5
        expect(flown.height).toBeCloseTo(-5);
        d.frame(0.5, PLAY, { forward: 0, right: 1, up: 0, turn: 0, tilt: 0, fast: false });
        expect(d.getCamera().x).toBeCloseTo(10 - 8);
        d.orbit(10, -10);
        expect(d.getCamera().yaw).toBe(1024 - 40);
        expect(d.getCamera().pitch).toBe(-300 - 30);
        // Pitch stops short of straight down
        d.orbit(0, -1000);
        expect(d.getCamera().pitch).toBe(-511);
    });

    it("stops playing when the camera's taken", () => {
        const d = director();
        d.togglePlay();
        d.orbit(5, 0);
        expect(d.getSnapshot().playing).toBe(false);
    });

    it("adds a shot where the camera is, at the playhead, rounded", () => {
        const d = director();
        d.seek(6.04);
        d.zoom(-1);
        d.orbit(-2.3, 0);
        d.addShot();
        const snap = d.getSnapshot();
        expect(snap.shots).toHaveLength(4);
        expect(snap.selected).toBe(2);
        const shot = snap.shots[2];
        expect(shot.at).toBe(6);
        expect(snap.seconds).toBe(6);
        expect(snap.moved).toBe(false);
        // The camera's where it was, now on the path
        expect(d.getCamera().distance).toBeCloseTo(round1(snap.camera.distance));
        expect(shot).toMatchObject({ pitch: expect.any(Number), yaw: expect.any(Number) });
        if ("x" in shot) {
            expect(Number.isInteger(shot.pitch)).toBe(true);
            expect(Number.isInteger(shot.yaw)).toBe(true);
            expect(shot.x).toBe(round1(shot.x));
        }
        expect(snap.edited).toBe(true);
    });

    it("sets the shot already at the playhead rather than adding one", () => {
        const d = director();
        d.seek(4.03);
        d.zoom(2);
        d.addShot();
        const shots = d.getSnapshot().shots;
        expect(shots).toHaveLength(3);
        // Its time and hold kept
        expect(shots[1]).toMatchObject({ at: 4, hold: true, distance: 24.2 });
    });

    it("makes room at the end: the run's camera moves on", () => {
        const d = director();
        d.seek(10);
        d.addShot();
        const shots = d.getSnapshot().shots;
        expect(shots.map((shot) => shot.at)).toEqual([0, 4, 10, 12]);
        expect(shots[3]).toEqual({ at: 12, player: true });
        expect(d.getSnapshot().duration).toBe(12);
    });

    it("turns a new shot's yaw the way round nearest the one before", () => {
        const d = director();
        d.seek(6);
        const start = d.getCamera().yaw;
        // Turned nearly a whole turn the other way, which is just 40 short of where it was
        d.orbit(-(2048 - 40) / 4, 0);
        d.addShot();
        const shot = d.getSnapshot().shots[2];
        expect("x" in shot && Math.abs(shot.yaw - (start - 40))).toBeLessThanOrEqual(1);
    });

    it("sets the selected shot to the camera, but not the run's", () => {
        const d = director();
        d.select(1);
        d.seek(8);
        d.zoom(1);
        expect(d.setShot()).toBe(true);
        expect(d.getSnapshot().shots[1]).toMatchObject({ at: 4, hold: true });
        expect(d.seconds).toBe(4);
        d.select(2);
        expect(d.setShot()).toBe(false);
    });

    it("removes a shot, but never the first or the run's camera", () => {
        const d = director();
        d.select(0);
        expect(d.removeShot()).toBe(false);
        d.select(2);
        expect(d.removeShot()).toBe(false);
        d.select(1);
        expect(d.removeShot()).toBe(true);
        expect(d.getSnapshot().shots.map((shot) => shot.at)).toEqual([0, 10]);
    });

    it("keeps a retimed shot between its neighbours, and the first at 0", () => {
        const d = director();
        d.retime(1, 12);
        expect(d.getSnapshot().shots[1].at).toBe(9.9);
        d.retime(1, -5);
        expect(d.getSnapshot().shots[1].at).toBe(0.1);
        d.retime(0, 3);
        expect(d.getSnapshot().shots[0].at).toBe(0);
        // The run's camera's time is how long it lasts
        d.retime(2, 14.04);
        expect(d.getSnapshot().duration).toBe(14);
    });

    it("takes typed numbers, kept in range, and toggles hold", () => {
        const d = director();
        d.setField(1, "pitch", -900);
        d.setField(1, "distance", 0);
        d.setField(1, "x", 12.25);
        d.setField(1, "y", Number.NaN);
        d.toggleHold(1);
        expect(d.getSnapshot().shots[1]).toEqual({
            at: 4,
            x: 12.25,
            y: 20,
            lift: 2,
            pitch: -511,
            yaw: 1024,
            distance: 1,
        });
        d.toggleHold(1);
        expect(d.getSnapshot().shots[1]).toMatchObject({ hold: true });
    });

    it("writes its shots as code to paste over the def's", () => {
        const d = director();
        d.setField(1, "x", 10.123);
        expect(d.toCode()).toBe(
            [
                "seconds: 10,",
                "shots: [",
                "    { at: 0, x: 0, y: 0, lift: 1, pitch: -100, yaw: 0, distance: 5 },",
                "    { at: 4, x: 10.12, y: 20, lift: 2, pitch: -300, yaw: 1024, distance: 20, hold: true },",
                "    { at: 10, player: true },",
                "],",
            ].join("\n"),
        );
    });

    it("writes a new opening as a whole cinematic for the map", () => {
        const map = { ...getMap("lumbridge"), cinematic: undefined, lairs: undefined };
        const [choice] = getDirectorChoices(map);
        expect(choice.fresh).toBe(true);
        const code = director(undefined, choice).toCode();
        expect(
            code.startsWith("cinematic: {\n    seconds: 6,\n    cast: [],\n    cues: [],\n"),
        ).toBe(true);
        expect(code.endsWith("        { at: 6, player: true },\n    ],\n},")).toBe(true);
    });

    it("keeps a draft, back again on opening it, until it's reverted", () => {
        const drafts = memoryStore();
        const d = director(drafts);
        d.retime(1, 5);
        const again = director(drafts);
        expect(again.getSnapshot().fromDraft).toBe(true);
        expect(again.getSnapshot().shots[1].at).toBe(5);
        again.revert();
        expect(again.getSnapshot().shots).toEqual(DEF.shots);
        expect(director(drafts).getSnapshot().fromDraft).toBe(false);
        expect(JSON.parse(drafts.items.get("run-escape-director-drafts")!)).toEqual({});
    });

    it("ignores a draft it can't play", () => {
        const drafts = memoryStore();
        drafts.setItem(
            "run-escape-director-drafts",
            JSON.stringify({
                "test:opening": [
                    { at: 0, x: 0, y: 0, lift: 1, pitch: -100, yaw: 0, distance: 5 },
                    { at: 3, x: 1 },
                ],
            }),
        );
        expect(director(drafts).getSnapshot().shots).toEqual(DEF.shots);
        drafts.setItem("run-escape-director-drafts", "not json");
        expect(director(drafts).getSnapshot().shots).toEqual(DEF.shots);
    });

    it("answers its own keys and the flying ones, and leaves the rest", () => {
        const d = director();
        expect(d.press("Space")).toBe(true);
        expect(d.getSnapshot().playing).toBe(true);
        expect(d.press("KeyW")).toBe(true);
        expect(d.press("KeyV")).toBe(true);
        expect(d.getSnapshot().panel).toBe(false);
        expect(d.press("F3")).toBe(false);
        expect(d.press("KeyM")).toBe(false);
    });
});

describe("the shot editor on one that starts on the run's camera", () => {
    // As Yama's waking does: from behind the player as they step onto the floor
    const FROM_RUN: CinematicDef = {
        ...DEF,
        shots: [{ at: 0, player: true }, ...DEF.shots.slice(1)],
    };
    const choice = { ...CHOICE, def: FROM_RUN };

    it("makes the run's camera there a shot of its own, rather than adding one", () => {
        const d = director(undefined, choice);
        d.zoom(1);
        d.addShot();
        const shots = d.getSnapshot().shots;
        expect(shots).toHaveLength(3);
        expect(shots[0]).toMatchObject({ at: 0, x: expect.any(Number), distance: 19.8 });
    });

    it("sets it to the camera, but never the run's camera at the end", () => {
        const d = director(undefined, choice);
        d.select(0);
        d.zoom(1);
        expect(d.setShot()).toBe(true);
        expect("x" in d.getSnapshot().shots[0]).toBe(true);
        d.select(2);
        expect(d.setShot()).toBe(false);
    });

    it("keeps its draft", () => {
        const drafts = memoryStore();
        director(drafts, choice).retime(1, 5);
        const again = director(drafts, choice).getSnapshot();
        expect(again.fromDraft).toBe(true);
        expect(again.shots[0]).toEqual({ at: 0, player: true });
    });
});

describe("a map's cinematics to edit", () => {
    it("are its opening and each of its lairs' wakings", () => {
        const varrock = getMap("battle_for_varrock");
        const choices = getDirectorChoices(varrock);
        expect(choices[0]).toMatchObject({ label: "Opening", def: VARROCK_OPENING, fresh: false });
        const lairs = (varrock.lairs ?? []).filter((lair) => lair.opening);
        expect(choices.slice(1).map((choice) => choice.def)).toEqual(
            lairs.map((lair) => lair.opening!.cinematic),
        );
        expect(new Set(choices.map((choice) => choice.key)).size).toBe(choices.length);
    });

    it("start a map without an opening on one over its spawn", () => {
        const map: MapDef = { ...getMap("lumbridge"), cinematic: undefined, lairs: undefined };
        const [choice] = getDirectorChoices(map);
        expect(choice.def.shots[0]).toMatchObject({ at: 0, x: map.spawn.x, y: map.spawn.y });
        expect(choice.def.shots[1]).toEqual({ at: choice.def.seconds, player: true });
    });
});

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}
