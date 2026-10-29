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
}
