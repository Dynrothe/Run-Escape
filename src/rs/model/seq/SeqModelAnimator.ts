import { SeqType } from "../../config/seqtype/SeqType";
import { Model } from "../Model";
import { SkeletalSeqLoader } from "../skeletal/SkeletalSeqLoader";
import { SeqFrameLoader } from "./SeqFrameLoader";

// Poses a lit model with one frame of a sequence. Returns a copy; the input
// model is left untouched so it can be cached and posed again.
export class SeqModelAnimator {
    constructor(
        readonly seqFrameLoader: SeqFrameLoader,
        readonly skeletalSeqLoader: SkeletalSeqLoader | undefined,
    ) {}

    animate(model: Model, seqType: SeqType, frame: number): Model {
        if (seqType.isSkeletalSeq()) {
            const skeletalSeq = this.skeletalSeqLoader?.load(seqType.skeletalId);
            if (!skeletalSeq) {
                return Model.copyAnimated(model, true, true);
            }
            model = Model.copyAnimated(model, !skeletalSeq.hasAlphaTransform, true);

            model.animateSkeletal(skeletalSeq, frame);
        } else {
            if (!seqType.frameIds || seqType.frameIds.length === 0) {
                return Model.copyAnimated(model, true, true);
            }

            const seqFrame = this.seqFrameLoader.load(seqType.frameIds[frame]);

            if (seqFrame) {
                model = Model.copyAnimated(
                    model,
                    !seqFrame.hasAlphaTransform,
                    !seqFrame.hasColorTransform,
                );

                model.animate(seqFrame, undefined, seqType.op14);
            }
        }

        return model;
    }

    // An action's frame over a movement's, split by the groups the movement
    // keeps (`movementGroups`, a seq's interleave order). Undefined when the
    // two can't be put together: a skeletal one, or frames on other bases.
    animateInterleaved(
        model: Model,
        seqType: SeqType,
        frame: number,
        movementType: SeqType,
        movementFrame: number,
        movementGroups: number[],
    ): Model | undefined {
        if (seqType.isSkeletalSeq() || movementType.isSkeletalSeq()) {
            return undefined;
        }
        const frameId = seqType.frameIds?.[frame];
        const movementFrameId = movementType.frameIds?.[movementFrame];
        if (frameId === undefined || movementFrameId === undefined) {
            return undefined;
        }
        const seqFrame = this.seqFrameLoader.load(frameId);
        const moveFrame = this.seqFrameLoader.load(movementFrameId);
        if (!seqFrame || !moveFrame) {
            return undefined;
        }
        const base = seqFrame.base;
        if (base !== moveFrame.base && (base.id === -1 || base.id !== moveFrame.base.id)) {
            return undefined;
        }
        const groups = new Array<boolean>(seqFrame.base.types.length).fill(false);
        for (const group of movementGroups) {
            if (group < groups.length) {
                groups[group] = true;
            }
        }
        model = Model.copyAnimated(
            model,
            !seqFrame.hasAlphaTransform && !moveFrame.hasAlphaTransform,
            !seqFrame.hasColorTransform && !moveFrame.hasColorTransform,
        );
        model.animateInterleaved(seqFrame, moveFrame, groups, seqType.op14);
        return model;
    }
}
