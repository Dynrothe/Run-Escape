// What each kind of ground is made of, taken from the real squares that kind of
// ground is on (see CLAUDE.md for how to survey one). Floor ids are as the map
// files store them: the cache's id plus one.

export type BiomeId = "meadow" | "desert" | "swamp" | "snow";

export type BiomeDef = {
    // Underlays, picked in patches
    ground: number[];
    // Underlay by the sea and on fords
    shore: number;
    // Overlays
    road: number;
    water: number;
    // [loc id, tiles a side]
    trees: [number, number][];
    rocks: [number, number][];
    // Small floor decorations (loc type 22)
    decor: number[];
    // Keys of PREFABS
    buildings: string[];
};

export const BIOMES: Record<BiomeId, BiomeDef> = {
    // Around Lumbridge
    meadow: {
        ground: [48, 50, 49],
        shore: 62,
        road: 22,
        water: 6,
        trees: [
            [1276, 2],
            [1278, 2],
            [10820, 3],
        ],
        rocks: [
            [5605, 1],
            [10790, 2],
        ],
        decor: [4735, 4736, 4737, 4738],
        buildings: ["lumbridge_house", "lumbridge_church", "varrock_shop"],
    },
    // The Kharidian Desert
    desert: {
        ground: [62, 61],
        shore: 129,
        road: 25,
        water: 442,
        trees: [
            [1405, 2],
            [1406, 2],
            [2670, 1],
            [1123, 2],
        ],
        rocks: [
            [18895, 2],
            [18893, 2],
        ],
        decor: [729, 730, 341, 342],
        buildings: ["al_kharid_house", "al_kharid_shop"],
    },
    // Lumbridge Swamp's ground: Mort Myre's is too dark to see enemies on. The
    // water and trees are Morytania's.
    swamp: {
        ground: [54, 64, 49],
        shore: 64,
        road: 81,
        water: 7,
        trees: [
            [12896, 1],
            [1365, 1],
            [1301, 2],
            [1304, 2],
        ],
        rocks: [[5605, 1]],
        decor: [5335, 5336, 5337, 5338, 3549],
        buildings: ["canifis_house"],
    },
    // Trollweiss
    snow: {
        ground: [58],
        shore: 59,
        road: 82,
        water: 6,
        trees: [
            [1330, 3],
            [1331, 3],
            [1332, 3],
        ],
        rocks: [
            [5039, 1],
            [19686, 2],
        ],
        decor: [561, 560, 559],
        buildings: ["rellekka_hut", "rellekka_house"],
    },
};
