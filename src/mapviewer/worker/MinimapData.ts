import { CacheInfo } from "../../rs/cache/CacheInfo";
import { MapImageRenderer } from "../../rs/map/MapImageRenderer";
import { Scene } from "../../rs/scene/Scene";
import { LocLoadType } from "../../rs/scene/SceneBuilder";
import { WorkerState } from "./WorkerState";

export type MinimapData = {
    mapX: number;
    mapY: number;
    level: number;
    cacheInfo: CacheInfo;

    minimapBlob: Blob;
};

export async function loadMinimapBlob(
    mapImageRenderer: MapImageRenderer,
    scene: Scene,
    level: number,
    borderSize: number,
    drawMapFunctions: boolean,
): Promise<Blob> {
    const minimapPixels = mapImageRenderer.renderMinimapHd(scene, level, drawMapFunctions);

    const minimapView = new DataView(minimapPixels.buffer);
    for (let i = 0; i < minimapPixels.length; i++) {
        minimapView.setUint32(i * 4, (minimapPixels[i] << 8) | 0xff);
    }

    const widthExclBorder = (scene.sizeX - borderSize * 2) * 4;
    const heightExclBorder = (scene.sizeY - borderSize * 2) * 4;
    const canvas = new OffscreenCanvas(widthExclBorder, heightExclBorder);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Could not get canvas context");
    }

    const pixelWidth = scene.sizeX * 4;
    const pixelHeight = scene.sizeY * 4;
    const imageData = new ImageData(pixelWidth, pixelHeight);
    imageData.data.set(new Uint8ClampedArray(minimapPixels.buffer));

    ctx.putImageData(imageData, -borderSize * 4, -borderSize * 4);

    return canvas.convertToBlob();
}

// A map square's image, as seen from above
export async function loadMinimapData(
    state: WorkerState,
    mapX: number,
    mapY: number,
    level: number,
    drawMapFunctions: boolean,
): Promise<MinimapData> {
    const borderSize = 6;

    const baseX = mapX * Scene.MAP_SQUARE_SIZE - borderSize;
    const baseY = mapY * Scene.MAP_SQUARE_SIZE - borderSize;
    const mapSize = Scene.MAP_SQUARE_SIZE + borderSize * 2;

    const scene = state.sceneBuilder.buildScene(
        baseX,
        baseY,
        mapSize,
        mapSize,
        false,
        LocLoadType.NO_MODELS,
    );

    const minimapBlob = await loadMinimapBlob(
        state.mapImageRenderer,
        scene,
        level,
        borderSize,
        drawMapFunctions,
    );

    return {
        mapX,
        mapY,
        level,
        cacheInfo: state.cache.info,
        minimapBlob,
    };
}
