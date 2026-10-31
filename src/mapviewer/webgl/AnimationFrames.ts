import { DrawRange } from "./DrawRange";
import type { ModelBounds } from "./buffer/CullGrid";

export type AnimationFrames = {
    frames: DrawRange[];
    framesAlpha: DrawRange[] | undefined;
    // Of every frame, for loading with a CullGrid
    bounds?: ModelBounds;
};
