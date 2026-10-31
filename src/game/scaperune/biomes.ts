// What each kind of ground is made of, taken from the real squares that kind of
// ground is on (see CLAUDE.md for how to survey one). Floor ids are as the map
// files store them: the cache's id plus one.

export type BiomeId = "meadow" | "desert" | "swamp" | "snow";

// What mountains are made of. See CLAUDE.md for how these were picked.
export type RockDef = {
    // Underlay on the mountains, and overlay on what's too steep to walk
    ground: number;
    overlay: number;
    // Locs with a model that fills their tile and follows the ground (contour): [id, type]
    faces: [number, number][];
    // Heaps of rock, [loc id, tiles a side], that block
    rubble: [number, number][];
    // Stones on the ground (loc type 22)
    stones: number[];
    // Underlay and cliff overlay above the snow line
    snowGround: number;
    snowOverlay: number;
    // What fills a volcano's crater, blocked
    lava: number;
    // A cave's mouth, 3 by 2 tiles, turned to face south at rotation 0
    cave: number;
};

export type BiomeDef = {
    // Underlays, picked in patches
    ground: number[];
    // Underlay by the sea and on fords
    shore: number;
    // Underlay where the ground rises into boundary hills
    hillGround: number;
    // Underlay under a road, which the renderer blends softly into the ground. Real
    // roads have one under them too.
    trail: number;
    // Overlays
    road: number;
    water: number;
    // [loc id, tiles a side], smallest first
    trees: [number, number][];
    rocks: [number, number][];
    // Small floor decorations (loc type 22)
    decor: number[];
    // Small things in a splash of colour (loc type 10)
    flowers: number[];
    // Keys of PREFABS
    buildings: string[];
    rock: RockDef;
};

const LOC_NORMAL = 10;

// Lava, as in Karamja's volcano
const LAVA = 19;
// Snow on any mountain, from Ice Mountain and Trollweiss
const SNOW = { snowGround: 58, snowOverlay: 1 };

function rock(def: Omit<RockDef, "snowGround" | "snowOverlay" | "lava">): RockDef {
    return { ...def, ...SNOW, lava: LAVA };
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
    // Around Lumbridge
    meadow: {
        ground: [48, 50, 49],
        shore: 62,
        hillGround: 64,
        trail: 63,
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
        flowers: [1187, 1188, 1189],
        buildings: ["lumbridge_house", "lumbridge_church", "varrock_shop"],
        // Trollheim's rock, Karuulm's faces
        rock: rock({
            ground: 92,
            overlay: 83,
            faces: [
                [34384, LOC_NORMAL],
                [34372, LOC_NORMAL],
            ],
            rubble: [
                [11434, 2],
                [3718, 2],
            ],
            stones: [3614, 11439],
            cave: 2123,
        }),
    },
    // The Kharidian Desert
    desert: {
        ground: [62, 61],
        shore: 129,
        hillGround: 68,
        trail: 68,
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
        flowers: [2670],
        buildings: ["al_kharid_house", "al_kharid_shop"],
        // The cliffs round the Bandit Camp
        rock: rock({
            ground: 68,
            overlay: 26,
            faces: [[34372, LOC_NORMAL]],
            rubble: [
                [18894, 2],
                [18893, 2],
            ],
            stones: [321, 3171],
            cave: 30180,
        }),
    },
    // Lumbridge Swamp's ground: Mort Myre's is too dark to see enemies on. The
    // water and trees are Morytania's.
    swamp: {
        ground: [54, 64, 49],
        shore: 64,
        hillGround: 72,
        trail: 63,
        road: 81,
        water: 7,
        trees: [
            [12896, 1],
            [1365, 1],
            [1301, 2],
            [1304, 2],
        ],
        rocks: [
            [5605, 1],
            [10790, 2],
        ],
        decor: [5335, 5336, 5337, 5338, 3549],
        flowers: [1299, 1300, 4055, 4056, 4057],
        buildings: ["canifis_house"],
        rock: rock({
            ground: 72,
            overlay: 222,
            faces: [
                [42352, LOC_NORMAL],
                [34384, LOC_NORMAL],
            ],
            rubble: [
                [11933, 2],
                [4605, 2],
            ],
            stones: [185, 3703],
            cave: 17209,
        }),
    },
    // Trollweiss
    snow: {
        ground: [58],
        shore: 59,
        hillGround: 55,
        // The snow itself: any tint in it shows as a coloured halo round the road
        trail: 58,
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
        flowers: [6476, 6477],
        buildings: ["rellekka_hut", "rellekka_house"],
        rock: rock({
            ground: 92,
            overlay: 3,
            faces: [[34384, LOC_NORMAL]],
            rubble: [
                [11922, 2],
                [11434, 2],
            ],
            stones: [11439, 3614],
            cave: 2123,
        }),
    },
};
