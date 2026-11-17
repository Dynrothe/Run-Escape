import { describe, expect, test } from "vitest";

import type { SeqType } from "../../../rs/config/seqtype/SeqType";
import type { Model } from "../../../rs/model/Model";
import type { FrameAdder } from "./ActorBakeFrames";
import {
    bakeAnim,
    bakeRunCast,
    bakeRunPose,
    centerGroundModel,
    getMovementGroups,
} from "./ActorBakeLoader";

test("centres offset ground models without changing their cached vertices or height", () => {
    const model = {
        verticesCount: 3,
        verticesX: new Int32Array([10, 30, 20]),
        verticesY: new Int32Array([-8, -4, 0]),
        verticesZ: new Int32Array([-30, -10, -20]),
        invalidateBounds: () => {},
    } as Model;
    const centered = centerGroundModel(model);
    expect([...centered.verticesX]).toEqual([-10, 10, 0]);
    expect([...centered.verticesZ]).toEqual([-10, 10, 0]);
    expect(centered.verticesY).toBe(model.verticesY);
    expect([...model.verticesX]).toEqual([10, 30, 20]);
    expect([...model.verticesZ]).toEqual([-30, -10, -20]);
    const again = centerGroundModel(centered);
    expect(again.verticesX).toEqual(centered.verticesX);
    expect(again.verticesZ).toEqual(centered.verticesZ);
});

describe("a weapon's run pose", () => {
    // A run of three frames, the last with no length of its own
    const state = {
        seqTypeLoader: {
            load: () => ({ frameIds: [1, 2, 3], frameLengths: [5, 4, 0] }) as unknown as SeqType,
        },
    } as unknown as Parameters<typeof bakeRunPose>[0];
    const segments = () => {
        const added: number[] = [];
        return {
            added,
            segments: {
                add(_model: Model, framesAhead: number) {
                    added.push(framesAhead);
                    return { ranges: [0, 3, 0, 0], segment: 0, positionStart: -1 };
                },
            } as FrameAdder,
        };
    };
    const model = { verticesCount: 0 } as Model;

    test("is baked over each of the run's frames, timed as the run", () => {
        const { added, segments: into } = segments();
        const baked = bakeRunPose(state, into, () => model, 4230, 4228)!;
        expect(baked.anim.seqId).toBe(4230);
        expect(baked.anim.runPose).toBe(true);
        expect(baked.anim.looping).toBe(true);
        expect([...baked.anim.frameLengths]).toEqual([5, 4, 1]);
        expect(added).toEqual([3, 2, 1]);
    });

    test("isn't baked at all if any of the run's frames can't be put together", () => {
        for (const missing of [0, 2]) {
            const { added, segments: into } = segments();
            const posed = (frame: number) => (frame === missing ? undefined : model);
            expect(bakeRunPose(state, into, posed, 4230, 4228)).toBeUndefined();
            // Nothing half-baked left in the buffer
            expect(added).toEqual([]);
        }
    });

    test("splits the body by the interleave order's groups, without its end marker", () => {
        expect(getMovementGroups([0, 1, 7, 9999999])).toEqual([0, 1, 7]);
        expect(getMovementGroups([9999999])).toEqual([]);
        expect(getMovementGroups(undefined)).toEqual([]);
    });

    test("bakes only the requested cast prefix over the stride, without posing later frames", () => {
        const { segments: into } = segments();
        const castState = {
            seqTypeLoader: {
                ...state.seqTypeLoader,
                load: (id: number) =>
                    id === 713
                        ? ({ frameIds: [4, 5, 6, 7, 8], isSkeletalSeq: () => false } as SeqType)
                        : state.seqTypeLoader.load(id),
            },
        };
        const posed: number[][] = [];
        const baked = bakeRunCast(
            castState,
            into,
            (cast, run) => {
                posed.push([cast, run]);
                return model;
            },
            713,
            824,
            2,
        )!;
        expect(posed).toEqual([
            [0, 0],
            [0, 1],
            [0, 2],
            [1, 0],
            [1, 1],
            [1, 2],
        ]);
        expect(baked.anims.map((anim) => anim.runCastFrame)).toEqual([0, 1]);
        expect(baked.anims.map((anim) => [...anim.frameLengths])).toEqual([
            [5, 4, 1],
            [5, 4, 1],
        ]);
    });

    test("also omits the unused stationary frames while keeping the prefix's original timing", () => {
        const { added, segments: into } = segments();
        const posed: number[] = [];
        const seq = {
            frameIds: [4, 5, 6, 7, 8],
            frameLengths: [8, 8, 8, 7, 4],
            frameStep: -1,
            isSkeletalSeq: () => false,
        } as SeqType;
        const castState = {
            seqTypeLoader: {
                load: () => seq,
                getCount: () => 1,
                clearCache: () => {},
            },
        };
        const before = seq.frameIds.slice();
        const { anim } = bakeAnim(
            castState,
            into,
            (_seq, frame) => {
                posed.push(frame);
                return model;
            },
            713,
            3,
        );
        expect(posed).toEqual([0, 1, 2]);
        expect(added).toEqual([3, 2, 1]);
        expect([...anim.frameLengths]).toEqual([8, 8, 8]);
        expect(seq.frameIds).toEqual(before);
    });
});
