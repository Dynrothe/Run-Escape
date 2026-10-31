import {
    DEFAULT_SETTINGS,
    GeneratorSettings,
    SETTING_PRESETS,
    generatedRecipe,
} from "../generator";
import { PALETTE_RECIPE } from "../palette";
import { MapRecipe } from "../recipe";
import { CLIFF_GALLERY } from "./cliffGallery";
import { PREFAB_GALLERY } from "./prefabGallery";
import { TERRAIN_TEST } from "./terrainTest";

// Maps for development, shown on the dev server only (content/maps.ts). Each
// needs its own squares: nothing in the cache lives at x 70-99, y 66-199, and the
// map generator's screen has x 70-99 from y 134 on.
const GENERATED: [id: string, mapX: number, settings: Partial<GeneratorSettings>, mapY?: number][] =
    [
        ["scaperune_meadow", 71, { seed: 1, biome: "meadow", island: 0.35, rivers: 1, ponds: 2 }],
        [
            "scaperune_desert",
            76,
            {
                seed: 2,
                biome: "desert",
                boundary: "hills",
                ponds: 1,
                hills: 0.3,
                trees: 0.25,
                rocks: 0.6,
            },
        ],
        [
            "scaperune_swamp",
            81,
            {
                seed: 3,
                biome: "swamp",
                island: 0.15,
                rivers: 2,
                ponds: 6,
                hills: 0.1,
                trees: 0.7,
                buildings: 0.3,
            },
        ],
        [
            "scaperune_snow",
            86,
            {
                seed: 4,
                biome: "snow",
                squaresX: 3,
                squaresY: 3,
                island: 0.5,
                rivers: 1,
                ponds: 1,
                hills: 0.8,
            },
        ],
        [
            "scaperune_alpine",
            71,
            {
                seed: 3,
                squaresX: 3,
                squaresY: 3,
                mountains: 0.7,
                peakHeight: 240,
                boundary: "mountains",
                boundaryDepth: 8,
                rivers: 1,
                snow: 0.5,
                roads: 1,
                buildings: 0.3,
                trees: 0.7,
            },
            110,
        ],
        [
            "scaperune_canyon",
            76,
            { seed: 5, ...SETTING_PRESETS.Canyon, squaresX: 3, squaresY: 3 },
            110,
        ],
        ["scaperune_volcano", 81, { seed: 6, ...SETTING_PRESETS.Volcano }, 110],
    ];

export const DEV_MAP_SETTINGS: Record<string, GeneratorSettings> = Object.fromEntries(
    GENERATED.map(([id, , settings]) => [
        id,
        { seed: 1, ...DEFAULT_SETTINGS, ...settings } as GeneratorSettings,
    ]),
);

export const SCAPERUNE_DEV_MAPS: MapRecipe[] = [
    TERRAIN_TEST,
    ...GENERATED.map(([id, mapX, , mapY]) =>
        generatedRecipe(id, mapX, mapY ?? 104, DEV_MAP_SETTINGS[id]),
    ),
    PALETTE_RECIPE,
    PREFAB_GALLERY,
    CLIFF_GALLERY,
];
