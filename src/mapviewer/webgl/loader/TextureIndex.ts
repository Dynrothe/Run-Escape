import { TextureLoader } from "../../../rs/texture/TextureLoader";

export const MAX_TEXTURES = 2048;

// The texture ids in the renderer's texture array, in order. Index 0 of the
// array is a white texture, so texture id textureIds[i] lives at layer i + 1.
// Everything that bakes geometry must use this same list.
export function getSdTextureIds(textureLoader: TextureLoader): number[] {
    return textureLoader
        .getTextureIds()
        .filter((id) => textureLoader.isSd(id))
        .slice(0, MAX_TEXTURES - 1);
}

export function createTextureIdIndexMap(textureIds: number[]): Map<number, number> {
    const textureIdIndexMap = new Map<number, number>();
    for (let i = 0; i < textureIds.length; i++) {
        textureIdIndexMap.set(textureIds[i], i);
    }
    return textureIdIndexMap;
}
