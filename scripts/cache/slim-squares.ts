// Which map squares a map unit loads, for the planner (slim-plan.ts) and the
// loaders (slim-load.ts) alike
import type { RegionDataInput } from "../../src/mapviewer/worker/RegionData";
import { Scene } from "../../src/rs/scene/Scene";

// Map squares loaded around each arena. The camera can be up to ~15 tiles
// outside the arena and sees 72 tiles (GameApp's RENDER_DISTANCE), so the
// renderer asks for at most two squares past the edge.
export const MAP_MARGIN = 2;

// The arena's own squares, without the margin
export function getMapSquares({ baseX, baseY, sizeX, sizeY, plane = 0 }: RegionDataInput) {
    return {
        plane,
        firstX: Math.floor(baseX / Scene.MAP_SQUARE_SIZE),
        firstY: Math.floor(baseY / Scene.MAP_SQUARE_SIZE),
        lastX: Math.ceil((baseX + sizeX) / Scene.MAP_SQUARE_SIZE) - 1,
        lastY: Math.ceil((baseY + sizeY) / Scene.MAP_SQUARE_SIZE) - 1,
    };
}
