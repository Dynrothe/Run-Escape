import { Ground } from "../Ground";
import { TileGrid } from "../format";
import { PREFABS, PrefabKit } from "../prefabs";
import { BuildContext, MapRecipe } from "../recipe";

// Every prefab in every rotation, to look them over: one row each, a turn more each
// column, running west to east, at CELL tiles apart.
const CELL = 22;
const SQUARES_X = 5;
const SQUARES_Y = 5;

export const PREFAB_GALLERY_START = { x: 66, y: 66 };

function build(context: BuildContext): TileGrid {
    const ground = new Ground(SQUARES_X * 64, SQUARES_Y * 64);
    ground.level0.underlays.fill(48);
    ground.level0.heights.fill(40);
    const kit = new PrefabKit(context);
    Object.keys(PREFABS).forEach((name, row) => {
        for (let turns = 0; turns < 4; turns++) {
            const x = PREFAB_GALLERY_START.x + turns * CELL;
            const y = PREFAB_GALLERY_START.y + row * CELL;
            kit.stamp(ground, name, turns, x, y);
        }
    });
    return ground.grid;
}

export const PREFAB_GALLERY: MapRecipe = {
    id: "scaperune_prefabs",
    mapX: 90,
    mapY: 118,
    squaresX: SQUARES_X,
    squaresY: SQUARES_Y,
    margin: 1,
    spawn: { x: 64 + 3, y: 64 + 3 },
    build,
};
