import { generatedRecipe } from "../generator";
import { PALETTE_RECIPE } from "../palette";
import { MapRecipe } from "../recipe";
import { TERRAIN_TEST } from "./terrainTest";

// Maps for development, shown on the dev server only (content/maps.ts). Each
// needs its own squares: nothing in the cache lives at x 70-99, y 100-130.
export const SCAPERUNE_DEV_MAPS: MapRecipe[] = [
    TERRAIN_TEST,
    generatedRecipe("scaperune_meadow", 71, 104, {
        seed: 1,
        biome: "meadow",
        island: 0.35,
        rivers: 1,
        ponds: 2,
    }),
    generatedRecipe("scaperune_desert", 76, 104, {
        seed: 2,
        biome: "desert",
        island: 0,
        ponds: 1,
        hills: 0.3,
        trees: 0.25,
        rocks: 0.6,
    }),
    generatedRecipe("scaperune_swamp", 81, 104, {
        seed: 3,
        biome: "swamp",
        island: 0.15,
        rivers: 2,
        ponds: 6,
        hills: 0.1,
        trees: 0.7,
        buildings: 0.3,
    }),
    generatedRecipe("scaperune_snow", 86, 104, {
        seed: 4,
        biome: "snow",
        squares: 3,
        island: 0.5,
        rivers: 1,
        ponds: 1,
        hills: 0.8,
    }),
    PALETTE_RECIPE,
];
