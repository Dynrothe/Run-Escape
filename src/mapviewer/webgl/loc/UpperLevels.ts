import { LocModelType } from "../../../rs/config/loctype/LocModelType";
import { Model } from "../../../rs/model/Model";
import { Scene } from "../../../rs/scene/Scene";
import { SceneLoc } from "../../../rs/scene/SceneLoc";
import { getIdFromTag } from "../../../rs/scene/entity/EntityTag";

// Prifddinas's roofs are plain scenery, not the roof loc types. No field of these
// locs tells them from the city's walkways, and they run on under the walkways
// and past the tiles marked as under a roof, so they have to be listed: the
// buildings' roofs with the rooftop agility course on them, then the domes of the
// central tower and of the eight towers on the walkways. You walk under the towers,
// and a dome that tall fills the screen from there.
const PRIFDDINAS_ROOF_LOCS = [
    [36222, 36325],
    [36403, 36426],
    [36474, 36489],
];

export function isRoofLoc(loc: SceneLoc): boolean {
    const type = loc.flags & 0x3f;
    if (
        type >= LocModelType.ROOF_SLOPED &&
        type <= LocModelType.ROOF_SLOPED_OVERHANG_HARD_OUTER_CORNER
    ) {
        return true;
    }
    const id = getIdFromTag(loc.tag);
    return PRIFDDINAS_ROOF_LOCS.some(([first, last]) => id >= first && id <= last);
}

// Whether a walkway runs over the tile or right beside it, two levels or more
// above plane: its railings stand on the tile next to its floor, and a roof sits
// straight on its building, one level up. Some maps have floor decorations with
// no faces on the upper levels, which aren't floors.
function hasWalkwayAbove(scene: Scene, plane: number, tileX: number, tileY: number): boolean {
    for (let level = plane + 2; level < scene.levels; level++) {
        for (let x = tileX - 1; x <= tileX + 1; x++) {
            for (let y = tileY - 1; y <= tileY + 1; y++) {
                const floor = scene.tiles[level][x][y]?.floorDecoration;
                if (
                    floor?.entity instanceof Model &&
                    floor.entity.faceCount > 0 &&
                    !isRoofLoc(floor)
                ) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Whether a tile is drawn when looking at floors up to maxLevel. What belongs to
// those floors always is, even stored a level up (the Grand Exchange's walls
// are). Upper floors only there because the ground floor is flagged to show them
// (Prifddinas) are left out over a tile that's under a roof, so you can see into
// buildings. Walkways aren't: the cache marks the ground under them as under a
// roof too, so that the real client hides them while you walk beneath.
export function isTileDrawn(
    scene: Scene,
    tileMinLevel: number,
    level: number,
    tileX: number,
    tileY: number,
    maxLevel: number,
): boolean {
    if (tileMinLevel <= maxLevel) {
        return true;
    }
    return (
        scene.isPlayerLevel(level, tileX, tileY, maxLevel) &&
        (!scene.isInside(maxLevel, tileX, tileY) || hasWalkwayAbove(scene, maxLevel, tileX, tileY))
    );
}
