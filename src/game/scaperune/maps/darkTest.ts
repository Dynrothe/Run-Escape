import { WARM_LIGHT } from "../../content/lights";
import { LightLook } from "../../content/types";
import { SETTING_PRESETS, generatedRecipe } from "../generator";
import { MapRecipe, getRecipeWorldTile } from "../recipe";

// A dark map (MapDef.lighting with a low ambient and litTargetsOnly), to see the lights from the play camera: the Dead lands, dark but
// for the player's light, a few fires that stay lit and lanterns to pick up. The Scar's own
// enemies and bosses aren't here; it plays Morytania's waves.

const SETTINGS = { seed: 41, ...SETTING_PRESETS["Dead lands"], squaresX: 2, squaresY: 2 };
const BASE = generatedRecipe("scaperune_dark", 87, 128, SETTINGS);

// The Scar's fire (2 by 2, its animation 475), and its light: a sim light (LightingDef.lights), so
// weapons aim by it
const FIRE_LOC = 49342;
const FIRE_LIGHT: LightLook = { radius: 3, color: 0xff9a4a, flicker: 0.15 };
const LOC_NORMAL = 10;

// From the spawn, in tiles: a fire just north of where the run starts, two either side further
// out, and one well to the north to walk to; a lantern on the way to the first
const FIRES = [
    { x: 2, y: 7 },
    { x: -12, y: 4 },
    { x: 13, y: -3 },
    { x: -3, y: 22 },
];
const LANTERNS = [{ x: 4, y: 3 }];

const spawn = BASE.spawn;
// A fire's south-west tile, in the grid; its light is in the middle of its 2 by 2
const fireTiles = FIRES.map((at) => ({ x: spawn.x + at.x, y: spawn.y + at.y }));

export const DARK_TEST: MapRecipe = {
    ...BASE,
    build(context) {
        const grid = BASE.build(context);
        // Each fire on clear ground: nothing else within a tile of it
        for (const fire of fireTiles) {
            grid.locs = grid.locs.filter(
                (loc) =>
                    loc.level !== 0 ||
                    loc.x < fire.x - 1 ||
                    loc.x > fire.x + 2 ||
                    loc.y < fire.y - 1 ||
                    loc.y > fire.y + 2,
            );
            grid.locs.push({ id: FIRE_LOC, type: LOC_NORMAL, rotation: 0, level: 0, ...fire });
        }
        return grid;
    },
    mapDef: {
        name: "scaperune_dark",
        description: "ScapeRune test map for the dark: lights, fires and lanterns.",
        lighting: {
            // The dark, a little blue: shapes, not detail
            ambient: 0.19,
            ambientColor: 0xb0c4ff,
            player: { radius: 5, color: WARM_LIGHT, intensity: 0.95 },
            lights: fireTiles.map((fire) => ({
                ...getRecipeWorldTile(BASE, fire.x + 0.5, fire.y + 0.5),
                ...FIRE_LIGHT,
            })),
            litTargetsOnly: true,
            lanternWeight: 6,
            lanterns: LANTERNS.map((at) =>
                getRecipeWorldTile(BASE, spawn.x + at.x, spawn.y + at.y),
            ),
        },
    },
};
