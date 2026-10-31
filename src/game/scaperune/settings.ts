import { BIOMES, BiomeId } from "./biomes";

// Everything the generator can be told, in one place: the map generator's screen,
// the checks and the error messages are all built from SETTINGS.

export type BoundaryStyle = "sea" | "forest" | "hills" | "fence";
export type RoadStyle = "branching" | "ring" | "spine";
export type WaveSet =
    | "lumbridge"
    | "barrows"
    | "wilderness"
    | "desert"
    | "fremennik"
    | "karamja"
    | "kourend"
    | "varlamore"
    | "morytania";

export type GeneratorSettings = {
    seed: number;

    // World. Arena size in map squares (64 tiles).
    squaresX: number;
    squaresY: number;
    biome: BiomeId;
    // Another biome sharing the map, biomeMix of it
    secondBiome: BiomeId | "none";
    biomeMix: number;
    // What stops you at the arena's edge. Only "sea" is an island.
    boundary: BoundaryStyle;
    // With a sea: 0 is land to the arena's edge, 1 a small island
    island: number;
    // Tiles the boundary comes into the arena
    boundaryDepth: number;
    shoreRoughness: number;

    // Terrain
    // 0 is flat; 1 is big rolling hills
    hills: number;
    // Tiles from one hill to the next
    hillScale: number;
    // Floods the low ground: 0 is none, 1 drowns most of the map
    waterLevel: number;
    groundPatches: number;

    // Water
    rivers: number;
    riverWidth: number;
    lakes: number;
    ponds: number;

    // Scenery. 0 to 1, from none to crowded.
    trees: number;
    // 0 is spread evenly; 1 is thick woods with clearings
    treeClumping: number;
    // 0 is small trees only; 1 is big trees only
    treeMix: number;
    rocks: number;
    rockMix: number;
    grass: number;
    flowers: number;

    // Roads
    // 0 is none; 1 is a road to every building and bridge
    roads: number;
    roadStyle: RoadStyle;
    roadWidth: number;
    roadCurviness: number;

    // Settlements
    buildings: number;
    // How many places buildings gather; 0 spreads them all over
    towns: number;
    // Tiles from a town's middle to its edge
    townSize: number;
    houses: boolean;
    shops: boolean;
    churches: boolean;
    // Buildings from any biome, not only this one's
    anyBuildings: boolean;
    // Fenced yards round buildings
    gardens: number;
    ruins: number;

    // Play
    // Where you start, across and up the arena, 0 to 1
    spawnX: number;
    spawnY: number;
    waveSet: WaveSet;
    enemyDensity: number;
    // 1 is as the game is; lower is darker
    brightness: number;
};

export type SettingKey = Exclude<keyof GeneratorSettings, "seed">;

type Shown = { when?: (settings: GeneratorSettings) => boolean };
export type NumberSettingDef = Shown & {
    kind: "number";
    label: string;
    min: number;
    max: number;
    step: number;
};
export type ChoiceSettingDef = Shown & { kind: "choice"; label: string; options: string[] };
export type FlagSettingDef = Shown & { kind: "flag"; label: string };
export type SettingDef = NumberSettingDef | ChoiceSettingDef | FlagSettingDef;

function number(label: string, min: number, max: number, step: number, more?: Shown) {
    return { kind: "number", label, min, max, step, ...more } as const;
}

function share(label: string, more?: Shown) {
    return number(label, 0, 1, 0.05, more);
}

function choice(label: string, options: string[], more?: Shown) {
    return { kind: "choice", label, options, ...more } as const;
}

function flag(label: string, more?: Shown) {
    return { kind: "flag", label, ...more } as const;
}

// The biggest arena: with a square of scenery each side, that's map squares x 70 to 99,
// and nothing past x 100 loads (MapManager). Bigger than SLOW takes a while to build.
export const MAX_ARENA_SQUARES = 28;
export const SLOW_ARENA_SQUARES = 16;

const hasBuildings = (settings: GeneratorSettings) => settings.buildings > 0;
const hasRoads = (settings: GeneratorSettings) => settings.roads > 0;
const notSea = (settings: GeneratorSettings) => settings.boundary !== "sea";

const BIOME_IDS = Object.keys(BIOMES);

export const SETTINGS: Record<SettingKey, SettingDef> = {
    squaresX: number("Width (map squares)", 1, MAX_ARENA_SQUARES, 1),
    squaresY: number("Height (map squares)", 1, MAX_ARENA_SQUARES, 1),
    biome: choice("Biome", BIOME_IDS),
    secondBiome: choice("Second biome", ["none", ...BIOME_IDS]),
    biomeMix: share("Second biome's share", { when: (s) => s.secondBiome !== "none" }),
    boundary: choice("Boundary", ["sea", "forest", "hills", "fence"]),
    island: share("Sea coming in", { when: (s) => s.boundary === "sea" }),
    boundaryDepth: number("Boundary depth", 2, 32, 1, { when: notSea }),
    shoreRoughness: share("Shore roughness"),

    hills: share("Hills"),
    hillScale: number("Hill spacing", 10, 80, 2),
    waterLevel: share("Water level"),
    groundPatches: number("Ground patch size", 5, 40, 1),

    rivers: number("Rivers", 0, 4, 1),
    riverWidth: number("River width", 4, 20, 1, { when: (s) => s.rivers > 0 }),
    lakes: number("Lakes", 0, 8, 1),
    ponds: number("Ponds", 0, 16, 1),

    trees: share("Trees"),
    treeClumping: share("Tree clumping", { when: (s) => s.trees > 0 }),
    treeMix: share("Tree size", { when: (s) => s.trees > 0 }),
    rocks: share("Rocks"),
    rockMix: share("Rock size", { when: (s) => s.rocks > 0 }),
    grass: share("Grass"),
    flowers: share("Flowers"),

    roads: share("Roads"),
    roadStyle: choice("Road network", ["branching", "ring", "spine"], { when: hasRoads }),
    roadWidth: number("Road width", 2, 6, 0.2, { when: hasRoads }),
    roadCurviness: share("Road curviness", { when: hasRoads }),

    buildings: share("Buildings"),
    towns: number("Towns", 0, 8, 1, { when: hasBuildings }),
    townSize: number("Town size", 10, 60, 2, { when: (s) => s.buildings > 0 && s.towns > 0 }),
    houses: flag("Houses", { when: hasBuildings }),
    shops: flag("Shops", { when: hasBuildings }),
    churches: flag("Churches", { when: hasBuildings }),
    anyBuildings: flag("Buildings from any biome", { when: hasBuildings }),
    gardens: share("Fenced yards", { when: hasBuildings }),
    ruins: share("Ruins"),

    spawnX: share("Start, west to east"),
    spawnY: share("Start, south to north"),
    waveSet: choice("Waves from", [
        "lumbridge",
        "barrows",
        "wilderness",
        "desert",
        "fremennik",
        "karamja",
        "kourend",
        "varlamore",
        "morytania",
    ]),
    enemyDensity: number("Enemy density", 0.25, 3, 0.25),
    brightness: number("Brightness", 0.5, 1.2, 0.05),
};

// In the order the screen shows them
export const SETTING_SECTIONS: { name: string; keys: SettingKey[] }[] = [
    {
        name: "World",
        keys: [
            "squaresX",
            "squaresY",
            "biome",
            "secondBiome",
            "biomeMix",
            "boundary",
            "island",
            "boundaryDepth",
            "shoreRoughness",
        ],
    },
    { name: "Terrain", keys: ["hills", "hillScale", "waterLevel", "groundPatches"] },
    { name: "Water", keys: ["rivers", "riverWidth", "lakes", "ponds"] },
    {
        name: "Scenery",
        keys: ["trees", "treeClumping", "treeMix", "rocks", "rockMix", "grass", "flowers"],
    },
    { name: "Roads", keys: ["roads", "roadStyle", "roadWidth", "roadCurviness"] },
    {
        name: "Settlements",
        keys: [
            "buildings",
            "towns",
            "townSize",
            "houses",
            "shops",
            "churches",
            "anyBuildings",
            "gardens",
            "ruins",
        ],
    },
    { name: "Play", keys: ["spawnX", "spawnY", "waveSet", "enemyDensity", "brightness"] },
];

export const DEFAULT_SETTINGS: Omit<GeneratorSettings, "seed"> = {
    squaresX: 2,
    squaresY: 2,
    biome: "meadow",
    secondBiome: "none",
    biomeMix: 0.4,
    boundary: "sea",
    island: 0.3,
    boundaryDepth: 10,
    shoreRoughness: 0.4,

    hills: 0.5,
    hillScale: 28,
    waterLevel: 0,
    groundPatches: 14,

    rivers: 0,
    riverWidth: 9,
    lakes: 0,
    ponds: 1,

    trees: 0.5,
    treeClumping: 0.6,
    treeMix: 0.5,
    rocks: 0.4,
    rockMix: 0.5,
    grass: 0.5,
    flowers: 0.2,

    roads: 0.8,
    roadStyle: "branching",
    roadWidth: 2.4,
    roadCurviness: 0.4,

    buildings: 0.5,
    towns: 0,
    townSize: 30,
    houses: true,
    shops: true,
    churches: true,
    anyBuildings: false,
    gardens: 0,
    ruins: 0,

    spawnX: 0.5,
    spawnY: 0.5,
    waveSet: "lumbridge",
    enemyDensity: 1,
    brightness: 1,
};

// Starting points, laid over the defaults: the seed stays what it was
export const SETTING_PRESETS: Record<string, Partial<GeneratorSettings>> = {
    Forest: {
        squaresX: 3,
        squaresY: 3,
        boundary: "forest",
        trees: 1,
        treeClumping: 0.8,
        treeMix: 0.7,
        buildings: 0.2,
        roads: 0.5,
        roadCurviness: 0.8,
        hills: 0.4,
        ponds: 3,
        brightness: 0.85,
    },
    Archipelago: {
        squaresX: 4,
        squaresY: 4,
        boundary: "sea",
        island: 0.1,
        waterLevel: 0.55,
        hills: 0.7,
        hillScale: 44,
        shoreRoughness: 0.7,
        trees: 0.5,
        buildings: 0.3,
        ponds: 0,
    },
    Mountains: {
        squaresX: 3,
        squaresY: 3,
        biome: "snow",
        boundary: "hills",
        boundaryDepth: 20,
        hills: 1,
        hillScale: 34,
        rocks: 1,
        rockMix: 0.8,
        trees: 0.4,
        buildings: 0.15,
        rivers: 1,
    },
    Town: {
        squaresX: 3,
        squaresY: 3,
        boundary: "fence",
        buildings: 1,
        towns: 2,
        townSize: 34,
        roads: 1,
        roadStyle: "ring",
        gardens: 0.6,
        hills: 0.15,
        trees: 0.25,
        flowers: 0.6,
    },
};

// What's wrong with some settings, or undefined
export function getSettingsError(settings: GeneratorSettings): string | undefined {
    if (!Number.isInteger(settings.seed) || settings.seed < 0) {
        return "The seed must be a whole number, 0 or more.";
    }
    for (const [key, def] of Object.entries(SETTINGS)) {
        const value = settings[key as SettingKey];
        if (def.kind === "flag") {
            if (typeof value !== "boolean") {
                return `${def.label} must be on or off.`;
            }
        } else if (def.kind === "choice") {
            if (!def.options.includes(String(value))) {
                return `${def.label} can't be ${String(value)}.`;
            }
        } else {
            if (typeof value !== "number" || !Number.isFinite(value)) {
                return `${def.label} must be a number.`;
            }
            if (value < def.min || value > def.max) {
                return `${def.label} must be from ${def.min} to ${def.max}.`;
            }
            if (def.step === 1 && !Number.isInteger(value)) {
                return `${def.label} must be a whole number.`;
            }
        }
    }
    return undefined;
}

// Settings as text, to save and share a map
export function formatSettings(settings: GeneratorSettings): string {
    return JSON.stringify(settings);
}

// Settings from text: anything left out is the default. Throws, with something to
// show, if they're not settings.
export function parseSettings(text: string): GeneratorSettings {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("That isn't valid JSON.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Those aren't map settings.");
    }
    for (const key of Object.keys(parsed)) {
        if (key !== "seed" && !(key in SETTINGS)) {
            throw new Error(`There's no setting called ${key}.`);
        }
    }
    const settings = { seed: 1, ...DEFAULT_SETTINGS, ...parsed } as GeneratorSettings;
    const error = getSettingsError(settings);
    if (error) {
        throw new Error(error);
    }
    return settings;
}
