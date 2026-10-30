import { Ground } from "./Ground";
import { BIOMES } from "./biomes";
import { TileGrid } from "./format";
import { rotatePrefab } from "./prefab";
import { BRIDGE, PREFABS, loadPrefab } from "./prefabs";
import { BuildContext, MapRecipe } from "./recipe";

// Everything the generator can ask the cache for, on one map: each biome's
// floors and locs, and every prefab. The slim cache only keeps what a map reads,
// and a generated map's reads change with the seed, so shipping seeds means
// loading this map too (CLAUDE.md, scripts/scaperune/check-palette.ts).

const SQUARES = 3;
const SIZE = SQUARES * 64;
const PLOT = 20;

function build(context: BuildContext): TileGrid {
    const ground = new Ground(SIZE, SIZE);
    ground.level0.underlays.fill(BIOMES.meadow.ground[0]);
    ground.level0.heights.fill(40);

    // A plot each for the prefabs and bridge, then a strip per biome
    const defs = [...Object.values(PREFABS), BRIDGE];
    defs.forEach((def, i) => {
        const prefab = rotatePrefab(loadPrefab(context, def), 0, context.locs);
        ground.stamp(prefab, 1 + (i % 8) * (PLOT + 2), 1 + Math.floor(i / 8) * PLOT, {
            // Everything in the rectangle: the generator takes some of it for bridges
            // and some for buildings, and this has to cover both
            floor: "all",
            feather: 0,
            flatten: true,
        });
    });

    let y = PLOT * 2 + 2;
    for (const biome of Object.values(BIOMES)) {
        let x = 2;
        const put = (id: number, size: number, type: number) => {
            ground.place({ id, type, rotation: 0, level: 0, x, y }, size, size);
            x += size + 1;
        };
        for (const [id, size] of [...biome.trees, ...biome.rocks]) {
            put(id, size, 10);
        }
        for (const id of biome.decor) {
            put(id, 1, 22);
        }
        for (const underlay of [...biome.ground, biome.shore, biome.trail]) {
            ground.level0.underlays[ground.tile(x, y)] = underlay;
            x += 2;
        }
        // Blocks, because paintOverlay's smoothing takes off anything a tile across
        for (const [overlay, blocked] of [
            [biome.water, true],
            [biome.road, false],
        ] as const) {
            const block = new Uint8Array(SIZE * SIZE);
            for (let dy = 0; dy < 4; dy++) {
                for (let dx = 0; dx < 4; dx++) {
                    block[ground.tile(x + dx, y + dy)] = 1;
                }
            }
            ground.paintOverlay(block, overlay, blocked);
            x += 6;
        }
        y += 6;
    }
    return ground.grid;
}

export const PALETTE_RECIPE: MapRecipe = {
    id: "scaperune_palette",
    mapX: 92,
    mapY: 104,
    squaresX: SQUARES,
    squaresY: SQUARES,
    margin: 0,
    spawn: { x: SIZE - 20, y: SIZE - 20 },
    build,
};
