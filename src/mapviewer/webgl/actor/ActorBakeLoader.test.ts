import { describe, expect, test } from "vitest";

import type { SeqType } from "../../../rs/config/seqtype/SeqType";
import type { Model } from "../../../rs/model/Model";
import type { FrameAdder } from "./ActorBakeFrames";
import { bakeRunPose, getMovementGroups } from "./ActorBakeLoader";

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
});
