import { describe, expect, it } from "vitest";

import { VARROCK_OPENING } from "../content/fun/varrockOpening";
import { ALL_MAPS, getMap } from "../content/maps";
import { CinematicDef } from "../content/types";
import {
    CINEMATIC_SKIP_AFTER,
    CinematicCamera,
    CinematicPlayer,
    getActorState,
    getCinematicCamera,
    getCinematicSeqs,
    getCinematicSquares,
    getSaying,
    monotoneAt,
} from "./Cinematic";
import { GameAssets, getPropKey, getSpotAnimIds } from "./GameAssets";
import { getGameSoundIds } from "./GameSounds";

const PLAY: CinematicCamera = { x: 100, y: 50, height: -2, pitch: -400, yaw: 0, distance: 18 };
const flat = () => 0;

// A small one: two shots, then the run's camera
const DEF: CinematicDef = {
    seconds: 10,
    cast: [
        { id: "a", npcId: 1, seq: 10, x: 5, y: 5, prop: 0 },
        { id: "b", npcId: 2, seq: 20, x: 6, y: 5 },
    ],
    cues: [
        { at: 1, actor: "a", say: "Hello", sayFor: 2 },
        { at: 4, actor: "b", seq: 21 },
        { at: 5, actor: "b", spotAnim: 300, sound: 400 },
        { at: 6, actor: "a", seq: 11, loop: true },
        { at: 7, actor: "b", gone: true },
    ],
    shots: [
        { at: 0, x: 0, y: 0, lift: 1, pitch: -100, yaw: 0, distance: 5 },
        { at: 4, x: 10, y: 20, lift: 2, pitch: -300, yaw: 1024, distance: 20, hold: true },
        { at: 10, player: true },
    ],
};

describe("a cinematic's camera", () => {
    it("is on each shot at its time, and the run's camera at the end", () => {
        expect(getCinematicCamera(DEF, 0, flat, PLAY)).toEqual({
            x: 0,
            y: 0,
            height: -1,
            pitch: -100,
            yaw: 0,
            distance: 5,
        });
        const held = getCinematicCamera(DEF, 4, flat, PLAY);
        expect(held).toMatchObject({ x: 10, y: 20, height: -2, pitch: -300, distance: 20 });
        // The run's yaw (0) is the turn nearest the shot before (1024): 0 or 2048 are as near,
        // and either is the same way on the screen
        const end = getCinematicCamera(DEF, 10, flat, PLAY);
        expect({ ...end, yaw: end.yaw & 2047 }).toEqual(PLAY);
    });

    it("lifts its shots off the ground under them", () => {
        const ground = (x: number) => -x / 10;
        expect(getCinematicCamera(DEF, 4, ground, PLAY).height).toBeCloseTo(-1 - 2);
    });

    it("moves between them without going past either", () => {
        let last = -Infinity;
        for (let t = 0; t <= 4; t += 0.05) {
            const camera = getCinematicCamera(DEF, t, flat, PLAY);
            expect(camera.x).toBeGreaterThanOrEqual(last - 1e-9);
            expect(camera.x).toBeLessThanOrEqual(10 + 1e-9);
            last = camera.x;
        }
    });

    it("eases in and out of a hold, and doesn't overshoot a turn", () => {
        const times = [0, 1, 2, 3];
        const values = [0, 10, 0, 10];
        // A turn at 1: nothing past 10 either side of it
        for (let t = 0; t <= 3; t += 0.01) {
            const v = monotoneAt(times, values, [false, false, false, false], t);
            expect(v).toBeGreaterThanOrEqual(-1e-9);
            expect(v).toBeLessThanOrEqual(10 + 1e-9);
        }
        // Straight through a point on a steady line, but stopped on a hold
        const line = [0, 1, 2, 3];
        expect(monotoneAt(times, line, [false, false, false, false], 1.5)).toBeCloseTo(1.5);
        const step = 0.001;
        const at = (t: number) => monotoneAt(times, line, [false, true, false, false], t);
        expect((at(1 + step) - at(1)) / step).toBeCloseTo(0, 2);
        expect(monotoneAt(times, line, [], -1)).toBe(0);
        expect(monotoneAt(times, line, [], 5)).toBe(3);
    });
});

describe("a cinematic's cast", () => {
    it("plays their own seq until a cue, then the cue's from its time", () => {
        const b = DEF.cast[1];
        expect(getActorState(DEF, b, 3)).toEqual({ seq: 20, start: 0, loop: true, gone: false });
        expect(getActorState(DEF, b, 4.5)).toEqual({ seq: 21, start: 4, loop: false, gone: false });
        expect(getActorState(DEF, b, 7)).toMatchObject({ gone: true });
        expect(getActorState(DEF, DEF.cast[0], 8)).toEqual({
            seq: 11,
            start: 6,
            loop: true,
            gone: false,
        });
    });

    it("says each line for its time", () => {
        expect(getSaying(DEF, "a", 0.9)).toBeUndefined();
        expect(getSaying(DEF, "a", 1)).toBe("Hello");
        expect(getSaying(DEF, "a", 2.9)).toBe("Hello");
        expect(getSaying(DEF, "a", 3)).toBeUndefined();
    });

    it("bakes every seq each npc plays", () => {
        expect(getCinematicSeqs(DEF)).toEqual(
            new Map([
                [1, [10, 11]],
                [2, [20, 21]],
            ]),
        );
    });
});

describe("a cinematic playing", () => {
    it("goes by its cues once each, holds the solo run until the last shot, and ends", () => {
        const player = new CinematicPlayer(DEF);
        const heard: number[] = [];
        for (let i = 0; i < 120; i++) {
            if (i === 50) {
                // The last shot begins at 4: the run goes on from there
                expect(player.seconds).toBeCloseTo(5);
                expect(player.holdsRun).toBe(false);
            } else if (i === 30) {
                expect(player.holdsRun).toBe(true);
            }
            for (const cue of player.advance(0.1)) {
                heard.push(cue.at);
            }
        }
        expect(heard).toEqual([1, 4, 5, 6, 7]);
        expect(player.done).toBe(true);
        expect(player.holdsRun).toBe(false);
        expect(player.advance(1)).toEqual([]);
    });

    it("skips on a press, but not on one as it begins", () => {
        const player = new CinematicPlayer(DEF);
        player.advance(CINEMATIC_SKIP_AFTER / 2);
        expect(player.skip()).toBe(false);
        expect(player.done).toBe(false);
        player.advance(CINEMATIC_SKIP_AFTER);
        expect(player.skip()).toBe(true);
        expect(player.done).toBe(true);
        expect(player.holdsRun).toBe(false);
        // Nothing more is heard once it's skipped
        expect(player.advance(5)).toEqual([]);
        expect(player.skip()).toBe(false);
    });

    it("stands still when it's held", () => {
        const player = new CinematicPlayer(DEF);
        player.held = true;
        expect(player.advance(3)).toEqual([]);
        expect(player.seconds).toBe(0);
    });
});

// Every map's cinematic is one that can play
describe.each(ALL_MAPS.filter((map) => map.cinematic).map((map) => [map.id, map] as const))(
    "%s's cinematic",
    (_, map) => {
        const def = map.cinematic!;
        const ids = new Set(def.cast.map((actor) => actor.id));

        it("starts at 0, its shots in order, and ends on the run's camera", () => {
            const times = def.shots.map((shot) => shot.at);
            expect(times[0]).toBe(0);
            expect([...times].sort((a, b) => a - b)).toEqual(times);
            const last = def.shots[def.shots.length - 1];
            expect("player" in last && last.at).toBe(def.seconds);
            expect(def.shots.slice(0, -1).every((shot) => !("player" in shot))).toBe(true);
        });

        it("has cues for its cast alone, within its time", () => {
            expect(ids.size).toBe(def.cast.length);
            for (const cue of def.cues) {
                expect(ids.has(cue.actor)).toBe(true);
                expect(cue.at).toBeGreaterThanOrEqual(0);
                expect(cue.at).toBeLessThan(def.seconds);
            }
            for (const actor of def.cast) {
                if (actor.prop !== undefined) {
                    expect(map.props?.[actor.prop]?.npcId).toBe(actor.npcId);
                }
            }
        });

        it("bakes its cast with everything they play, its spot animations and sounds", () => {
            const requests = GameAssets.getPropRequests([map]);
            for (const [npcId, seqs] of getCinematicSeqs(def)) {
                const request = requests.find((r) => r.key === getPropKey(npcId));
                expect(request).toMatchObject({ kind: "npc", npcId });
                for (const seq of seqs) {
                    expect((request as { seqIds: number[] }).seqIds).toContain(seq);
                }
            }
            const spots = getSpotAnimIds();
            const sounds = getGameSoundIds();
            for (const cue of def.cues) {
                if (cue.spotAnim !== undefined) {
                    expect(spots).toContain(cue.spotAnim);
                }
                if (cue.sound !== undefined) {
                    expect(sounds).toContain(cue.sound);
                }
            }
        });
    },
);

describe("the Battle for Varrock's opening", () => {
    const def = VARROCK_OPENING;
    const map = getMap("battle_for_varrock");

    it("is the map's, and lasts 15 to 25 seconds", () => {
        expect(map.cinematic).toBe(def);
        expect(def.seconds).toBeGreaterThanOrEqual(15);
        expect(def.seconds).toBeLessThanOrEqual(25);
    });

    it("opens on Yama, in his throne's place, who says it's futile", () => {
        const yama = def.cast.find((actor) => actor.id === "yama")!;
        const prop = map.props![yama.prop!];
        expect(yama).toMatchObject({ npcId: prop.npcId, x: prop.x, y: prop.y, seq: prop.seq });
        const first = def.shots[0];
        expect("player" in first).toBe(false);
        if (!("player" in first)) {
            // Looking straight at him, close
            expect(first).toMatchObject({ x: yama.x, yaw: 0 });
            expect(Math.hypot(first.x - yama.x, first.y - yama.y)).toBeLessThan(1);
            expect(first.distance).toBeLessThan(8);
        }
        expect(getSaying(def, "yama", 1)).toMatch(/futile/i);
    });

    it("has Prysin defy him, Yama answer, snap his fingers, and everyone before him die", () => {
        const prysinSays = def.cues.find((cue) => cue.actor === "prysin" && cue.say)!;
        const pathetic = def.cues.find((cue) => cue.actor === "yama" && cue.say === "Pathetic.")!;
        const click = def.cues.find((cue) => cue.actor === "yama" && cue.seq === 12167)!;
        expect(prysinSays.at).toBeLessThan(pathetic.at);
        expect(pathetic.at).toBeLessThan(click.at);
        const challengers = def.cast.filter((actor) => actor.id !== "yama");
        expect(challengers.length).toBeGreaterThanOrEqual(4);
        const deaths = challengers.map(
            (actor) => def.cues.find((cue) => cue.actor === actor.id && cue.seq === 10629)!.at,
        );
        // All after the snap, not all at once
        expect(Math.min(...deaths)).toBeGreaterThan(click.at);
        expect(new Set(deaths).size).toBe(deaths.length);
        for (const actor of challengers) {
            expect(def.cues.some((cue) => cue.actor === actor.id && cue.spotAnim === 2610)).toBe(
                true,
            );
        }
    });

    it("ends behind the player, after the flight from the palace", () => {
        const shots = def.shots.filter((shot) => !("player" in shot));
        const last = shots[shots.length - 1];
        if (!("player" in last)) {
            expect(Math.abs(last.y - map.spawn.y)).toBeLessThan(40);
        }
    });
});

describe("what a cinematic's camera sees", () => {
    const square = (x: number, y: number) => (Math.floor(x / 64) << 8) + Math.floor(y / 64);

    it("is every map square along its way, from Yama's throne to the spawn, and not the world", () => {
        const map = getMap("battle_for_varrock");
        const def = map.cinematic!;
        const { x, y } = map.spawn;
        const play = { x, y, height: -0.6, pitch: -400, yaw: 0, distance: 18 };
        const squares = getCinematicSquares(def, () => 0, play);
        const yama = def.cast.find((actor) => actor.id === "yama")!;
        expect(squares).toContain(square(yama.x, yama.y));
        expect(squares).toContain(square(x, y));
        expect(squares).toContain(square(x, (y + yama.y) / 2));
        // Seen from close, but no further than the camera's render distance
        expect(squares.length).toBeLessThanOrEqual(25);
        for (const id of squares) {
            expect(Math.abs((id >> 8) - Math.floor(x / 64))).toBeLessThanOrEqual(3);
        }
    });

    it("looks along a level camera as far as it sees, and a camera looking down at what's below", () => {
        const level: CinematicDef = {
            seconds: 1,
            cast: [],
            cues: [],
            shots: [
                { at: 0, x: 640, y: 640, lift: 1, pitch: 0, yaw: 0, distance: 5 },
                { at: 1, player: true },
            ],
        };
        const down = { ...PLAY, x: 640, y: 640, pitch: -512, distance: 10 };
        const play = { ...down };
        const far = getCinematicSquares(level, () => 0, play);
        // Facing north: 128 tiles on, two squares further
        expect(far).toContain(square(640, 640 + 120));
        const below = getCinematicSquares({ ...level, shots: [level.shots[1]] }, () => 0, play);
        expect(below).toContain(square(640, 640));
        expect(below).not.toContain(square(640, 640 + 120));
    });
});
