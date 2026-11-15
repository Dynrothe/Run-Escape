import { LightLook } from "../../content/types";
import { SETTING_PRESETS, generatedRecipe } from "../generator";
import { MapRecipe, getRecipeWorldTile } from "../recipe";

// Lights on a map that isn't dark (MapDef.lighting at its usual brightness): scenery that glows by
// loc id (LightingDef.locs), a coloured light of the map's own, and the wizard's fire spells, which
// light up what they pass (SPOT_LIGHTS). Weapons aim as they always do: no litTargetsOnly.

const SETTINGS = { seed: 42, ...SETTING_PRESETS.Ashlands, squaresX: 2, squaresY: 2 };
const BASE = generatedRecipe("scaperune_glow", 91, 128, SETTINGS);

const LOC_NORMAL = 10;
// A fire (animation 475), a firepit, and a lava forge (3 by 3)
const FIRE = 43475;
const FIREPIT = 13528;
const LAVA_FORGE = 11978;

const GLOWS: Record<number, LightLook> = {
    [FIRE]: { radius: 3.5, color: 0xff9a4a, intensity: 0.55, flicker: 0.3 },
    [FIREPIT]: { radius: 3, color: 0xff8a3a, intensity: 0.5, flicker: 0.25 },
    [LAVA_FORGE]: {
        radius: 4.5,
        color: 0xff5a1a,
        intensity: 0.6,
        pulse: { amount: 0.3, seconds: 2.5 },
    },
};

// From the spawn, in tiles: each loc's south-west tile
const PLACED = [
    { id: FIRE, x: 3, y: 5, size: 1 },
    { id: FIRE, x: -6, y: 8, size: 1 },
    { id: FIREPIT, x: 8, y: -2, size: 2 },
    { id: LAVA_FORGE, x: -10, y: -3, size: 3 },
    { id: FIRE, x: 1, y: 14, size: 1 },
];

const spawn = BASE.spawn;
const placed = PLACED.map((p) => ({ ...p, x: spawn.x + p.x, y: spawn.y + p.y }));

export const GLOW_TEST: MapRecipe = {
    ...BASE,
    build(context) {
        const grid = BASE.build(context);
        for (const p of placed) {
            // On clear ground: nothing else within a tile of it
            grid.locs = grid.locs.filter(
                (loc) =>
                    loc.level !== 0 ||
                    loc.x < p.x - 1 ||
                    loc.x > p.x + p.size ||
                    loc.y < p.y - 1 ||
                    loc.y > p.y + p.size,
            );
            grid.locs.push({ id: p.id, type: LOC_NORMAL, rotation: 0, level: 0, x: p.x, y: p.y });
        }
        return grid;
    },
    mapDef: {
        name: "scaperune_glow",
        description:
            "ScapeRune test map for lights at the usual brightness: glowing scenery and spells.",
        lighting: {
            locs: GLOWS,
            // A cold blue light of the map's own, by itself south of the start
            lights: [
                {
                    ...getRecipeWorldTile(BASE, spawn.x - 3, spawn.y - 8),
                    radius: 4,
                    color: 0x4a8cff,
                    intensity: 1.2,
                    pulse: { amount: 0.25, seconds: 3 },
                },
            ],
        },
    },
};
