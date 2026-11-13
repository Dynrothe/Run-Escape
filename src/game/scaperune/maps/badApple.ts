import { FLOOR_SKINS } from "../../content/floorSkins";
import { LUMBRIDGE_WAVES } from "../../content/waves";
import { Ground } from "../Ground";
import { BAD_APPLE_HEIGHT, BAD_APPLE_WIDTH } from "../badApple";
import { TILE_BLOCKED } from "../format";
import { BuildContext, MapRecipe } from "../recipe";

const SQUARES = 2;
const SIZE = SQUARES * 64; // 128

export const BAD_APPLE_MAP_X = 85;
export const BAD_APPLE_MAP_Y = 100;

export const BAD_APPLE_OFFSET_X = 16;
export const BAD_APPLE_OFFSET_Y = 28;

export const BAD_APPLE_SCREEN_WORLD_RECT = {
    x0: BAD_APPLE_MAP_X * 64 + BAD_APPLE_OFFSET_X,
    y0: BAD_APPLE_MAP_Y * 64 + BAD_APPLE_OFFSET_Y,
    x1: BAD_APPLE_MAP_X * 64 + BAD_APPLE_OFFSET_X + BAD_APPLE_WIDTH - 1,
    y1: BAD_APPLE_MAP_Y * 64 + BAD_APPLE_OFFSET_Y + BAD_APPLE_HEIGHT - 1,
};

const UNDERLAY_GRASS = 48;
const UNDERLAY_ROAD = 22;
const UNDERLAY_DARK = 0;

export function buildBadAppleMap(_context: BuildContext) {
    const ground = new Ground(SIZE, SIZE);

    // 1. Initialise all tiles as dark void and blocked outside
    ground.level0.underlays.fill(UNDERLAY_DARK);
    ground.level0.heights.fill(20);

    const trackX0 = BAD_APPLE_OFFSET_X - 4; // 12
    const trackX1 = BAD_APPLE_OFFSET_X + BAD_APPLE_WIDTH + 3; // 115
    const trackY0 = BAD_APPLE_OFFSET_Y - 4; // 24
    const trackY1 = BAD_APPLE_OFFSET_Y + BAD_APPLE_HEIGHT + 3; // 103

    const videoX0 = BAD_APPLE_OFFSET_X;
    const videoX1 = BAD_APPLE_OFFSET_X + BAD_APPLE_WIDTH - 1;
    const videoY0 = BAD_APPLE_OFFSET_Y;
    const videoY1 = BAD_APPLE_OFFSET_Y + BAD_APPLE_HEIGHT - 1;

    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = ground.tile(x, y);

            const inVideo = x >= videoX0 && x <= videoX1 && y >= videoY0 && y <= videoY1;
            const inTrack = x >= trackX0 && x <= trackX1 && y >= trackY0 && y <= trackY1;

            if (inVideo) {
                // Video arena floor: starts unblocked in terrain so dropTile/restoreTile can toggle it!
                ground.level0.underlays[i] = UNDERLAY_GRASS;
                ground.level0.flags[i] &= ~TILE_BLOCKED;
            } else if (inTrack) {
                // Perimeter walkway surrounding the video screen
                ground.level0.underlays[i] = UNDERLAY_ROAD;
                ground.level0.flags[i] &= ~TILE_BLOCKED;
            } else {
                // Outer perimeter: impassable barrier
                ground.level0.flags[i] |= TILE_BLOCKED;
            }
        }
    }

    // Outer fence/scenery around perimeter
    for (let x = trackX0 - 1; x <= trackX1 + 1; x++) {
        ground.place({ id: 10793, type: 10, rotation: 0, level: 0, x, y: trackY0 - 1 }, 1, 1);
        ground.place({ id: 10793, type: 10, rotation: 0, level: 0, x, y: trackY1 + 1 }, 1, 1);
    }
    for (let y = trackY0; y <= trackY1; y++) {
        ground.place({ id: 10793, type: 10, rotation: 0, level: 0, x: trackX0 - 1, y }, 1, 1);
        ground.place({ id: 10793, type: 10, rotation: 0, level: 0, x: trackX1 + 1, y }, 1, 1);
    }

    return ground.grid;
}

export interface VideoMapConfig {
    id: string;
    name: string;
    binUrl: string;
    music?: string;
    description?: string;
    iconObjId?: number;
    width?: number;
    height?: number;
    fps?: number;
    mapX?: number;
    mapY?: number;
}

export function createVideoMapRecipe(config: VideoMapConfig): MapRecipe {
    const width = config.width ?? BAD_APPLE_WIDTH;
    const height = config.height ?? BAD_APPLE_HEIGHT;
    const mapX = config.mapX ?? BAD_APPLE_MAP_X;
    const mapY = config.mapY ?? BAD_APPLE_MAP_Y;
    const offsetX = Math.floor((SIZE - width) / 2);
    const offsetY = Math.floor((SIZE - height) / 2);
    const screenRect = {
        x0: mapX * 64 + offsetX,
        y0: mapY * 64 + offsetY,
        x1: mapX * 64 + offsetX + width - 1,
        y1: mapY * 64 + offsetY + height - 1,
    };

    return {
        id: config.id,
        mapX,
        mapY,
        squaresX: SQUARES,
        squaresY: SQUARES,
        margin: 0,
        spawn: { x: Math.floor(SIZE / 2), y: offsetY - 2 },
        build: (_context: BuildContext) => {
            const ground = new Ground(SIZE, SIZE);
            ground.level0.underlays.fill(UNDERLAY_DARK);
            ground.level0.heights.fill(20);

            const trackX0 = offsetX - 4;
            const trackX1 = offsetX + width + 3;
            const trackY0 = offsetY - 4;
            const trackY1 = offsetY + height + 3;

            const videoX0 = offsetX;
            const videoX1 = offsetX + width - 1;
            const videoY0 = offsetY;
            const videoY1 = offsetY + height - 1;

            for (let y = 0; y < SIZE; y++) {
                for (let x = 0; x < SIZE; x++) {
                    const i = ground.tile(x, y);
                    const inVideo = x >= videoX0 && x <= videoX1 && y >= videoY0 && y <= videoY1;
                    const inTrack = x >= trackX0 && x <= trackX1 && y >= trackY0 && y <= trackY1;

                    if (inVideo) {
                        ground.level0.underlays[i] = UNDERLAY_GRASS;
                        ground.level0.flags[i] &= ~TILE_BLOCKED;
                    } else if (inTrack) {
                        ground.level0.underlays[i] = UNDERLAY_ROAD;
                        ground.level0.flags[i] &= ~TILE_BLOCKED;
                    } else {
                        ground.level0.flags[i] |= TILE_BLOCKED;
                    }
                }
            }

            for (let x = trackX0 - 1; x <= trackX1 + 1; x++) {
                ground.place({ id: 10793, type: 10, rotation: 0, level: 0, x, y: trackY0 - 1 }, 1, 1);
                ground.place({ id: 10793, type: 10, rotation: 0, level: 0, x, y: trackY1 + 1 }, 1, 1);
            }
            for (let y = trackY0; y <= trackY1; y++) {
                ground.place({ id: 10793, type: 10, rotation: 0, level: 0, x: trackX0 - 1, y }, 1, 1);
                ground.place({ id: 10793, type: 10, rotation: 0, level: 0, x: trackX1 + 1, y }, 1, 1);
            }

            return ground.grid;
        },
        mapDef: {
            name: config.name,
            description:
                config.description ??
                `A dynamic arena driven by video frame data from ${config.binUrl}. ` +
                    "White pixels are playable floor; black pixels drop away into the void.",
            iconObjId: config.iconObjId ?? 1957,
            music: config.music,
            waves: LUMBRIDGE_WAVES,
            difficulty: { hp: 1, damage: 1 },
            video: {
                binUrl: config.binUrl,
                rect: screenRect,
                width,
                height,
                fps: config.fps ?? 30,
            },
            floor: {
                rect: screenRect,
                skins: [FLOOR_SKINS.sepulchreSlab],
                script: [],
                loopSeconds: 220,
                slam: {
                    warn: 0.1,
                    hurt: [-9999, -9998],
                    damage: 0,
                    grace: 0,
                    spotAnim: 0,
                    sound: -1,
                },
                drop: {
                    warn: 0.1,
                    damage: 0,
                    shove: 0,
                    spotAnim: 0,
                    fall: 0.4,
                    keepRows: 0,
                    sound: -1,
                    islands: true,
                },
            },
        },
    };
}

export const BAD_APPLE_MAP: MapRecipe = createVideoMapRecipe({
    id: "scaperune_bad_apple",
    name: "Bad Apple (Live Arena)",
    binUrl: "badapple.bin",
    music: "bad_apple",
    description:
        "A dynamic arena driven in real time by Bad Apple frame data from badapple.bin. " +
        "White pixels are playable floor; black pixels drop away into the void.",
    iconObjId: 1957,
    width: BAD_APPLE_WIDTH,
    height: BAD_APPLE_HEIGHT,
});

export const BAD_POSTMAN_MAP: MapRecipe = createVideoMapRecipe({
    id: "scaperune_bad_postman",
    name: "Bad Postman (Live Arena)",
    binUrl: "bad_postman.bin",
    music: "bad_postman",
    description:
        "A dynamic arena driven in real time by Bad Postman (Postman Pat) frame data from bad_postman.bin. " +
        "White pixels are playable floor; black pixels drop away into the void.",
    iconObjId: 6828,
    width: BAD_APPLE_WIDTH,
    height: BAD_APPLE_HEIGHT,
    mapX: 85,
    mapY: 104,
});
