import pako from "pako";

import type { ArenaFloor } from "../core/ArenaFloor";
import { TICKS_PER_SECOND } from "../core/Sim";
import type { ArenaGrid } from "../core/world/ArenaGrid";

export const BAD_APPLE_WIDTH = 96;
export const BAD_APPLE_HEIGHT = 72;
export const BAD_APPLE_FPS = 30;
export const BAD_APPLE_FRAMES = 6584;
export const BAD_APPLE_PIXELS = BAD_APPLE_WIDTH * BAD_APPLE_HEIGHT;

export interface VideoPlayerOptions {
    width?: number;
    height?: number;
    fps?: number;
    totalFrames?: number;
}

/**
 * Decodes 1-bit RLE video frames from raw or deflate-compressed binary.
 *
 * Mapping convention:
 * - 0 = White pixel (Playable floor area)
 * - 1 = Black pixel (Blocked / hole / pit)
 */
export class VideoPlayer {
    readonly raw: Uint8Array;
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly totalFrames: number;
    readonly pixels: number;
    readonly frameOffsets: Uint32Array;

    constructor(data: Uint8Array, options?: VideoPlayerOptions) {
        this.width = options?.width ?? BAD_APPLE_WIDTH;
        this.height = options?.height ?? BAD_APPLE_HEIGHT;
        this.fps = options?.fps ?? BAD_APPLE_FPS;
        this.pixels = this.width * this.height;

        // Raw-deflate compressed if size < uncompressed threshold
        if (data.length < 1000000) {
            try {
                this.raw = pako.inflateRaw(data);
            } catch {
                this.raw = data;
            }
        } else {
            this.raw = data;
        }

        const total = this.pixels;
        const offsets: number[] = [];
        let ptr = 0;
        const maxFrames = options?.totalFrames;

        while (ptr < this.raw.length && (maxFrames === undefined || offsets.length < maxFrames)) {
            offsets.push(ptr);
            let pos = 0;
            while (pos < total && ptr < this.raw.length) {
                let run = 0;
                let shift = 0;
                while (ptr < this.raw.length) {
                    const b = this.raw[ptr++];
                    run |= (b & 0x7f) << shift;
                    if ((b & 0x80) === 0) break;
                    shift += 7;
                }
                pos += run;
            }
        }

        this.frameOffsets = new Uint32Array(offsets);
        this.totalFrames = offsets.length;
    }

    /**
     * Decodes frame `frameIndex` into a Uint8Array of length width*height.
     * Values: 0 = White (Playable), 1 = Black (Blocked).
     */
    decodeFrame(frameIndex: number, out?: Uint8Array): Uint8Array {
        const frame = out ?? new Uint8Array(this.pixels);
        const total = this.pixels;
        const clampedIndex = Math.max(0, Math.min(frameIndex, this.totalFrames - 1));
        let ptr = this.frameOffsets[clampedIndex];
        let pos = 0;
        let currentBit = 0; // Alternating runs always start with bit 0 (bright/white)

        while (pos < total && ptr < this.raw.length) {
            let run = 0;
            let shift = 0;
            while (ptr < this.raw.length) {
                const b = this.raw[ptr++];
                run |= (b & 0x7f) << shift;
                if ((b & 0x80) === 0) break;
                shift += 7;
            }
            const end = Math.min(pos + run, total);
            if (currentBit === 1) {
                frame.fill(1, pos, end);
            } else {
                frame.fill(0, pos, end);
            }
            pos = end;
            currentBit ^= 1;
        }
        return frame;
    }

    /**
     * Finds which pixels changed between two frames.
     * - `rose`: pixels that became 0 (White / Playable)
     * - `fell`: pixels that became 1 (Black / Blocked)
     */
    diff(
        prev: Uint8Array,
        next: Uint8Array,
    ): { rose: [number, number][]; fell: [number, number][] } {
        const rose: [number, number][] = [];
        const fell: [number, number][] = [];
        const w = this.width;
        const h = this.height;
        for (let y = 0; y < h; y++) {
            const rowOffset = y * w;
            for (let x = 0; x < w; x++) {
                const idx = rowOffset + x;
                const p = prev[idx];
                const n = next[idx];
                if (p === 1 && n === 0) {
                    rose.push([x, y]);
                } else if (p === 0 && n === 1) {
                    fell.push([x, y]);
                }
            }
        }
        return { rose, fell };
    }
}

export { VideoPlayer as BadApplePlayer };

const playerCache = new Map<string, VideoPlayer>();

export async function getVideoPlayer(
    binName = "badapple.bin",
    options?: VideoPlayerOptions,
): Promise<VideoPlayer> {
    const cached = playerCache.get(binName);
    if (cached) {
        return cached;
    }
    let data: Uint8Array;
    if (typeof process !== "undefined" && process.versions?.node) {
        const fs = await import("fs");
        const path = await import("path");
        const filePath = path.resolve(process.cwd(), "public", binName);
        data = new Uint8Array(fs.readFileSync(filePath));
    } else {
        const resp = await fetch(binName);
        const buf = await resp.arrayBuffer();
        data = new Uint8Array(buf);
    }
    const player = new VideoPlayer(data, options);
    playerCache.set(binName, player);
    return player;
}

export async function getBadApplePlayer(): Promise<VideoPlayer> {
    return getVideoPlayer("badapple.bin");
}

export function setBadApplePlayer(player: VideoPlayer): void {
    playerCache.set("badapple.bin", player);
}

/**
 * Drives live dynamic arena updates in real time tick-by-tick based on video frame data.
 */
export class VideoController {
    readonly player: VideoPlayer;
    readonly rect: { x0: number; y0: number; x1: number; y1: number };
    currentFrameIndex = -1;
    readonly currentPixels: Uint8Array;
    private readonly nextPixels: Uint8Array;
    musicSeconds?: number;

    constructor(player: VideoPlayer, rect: { x0: number; y0: number; x1: number; y1: number }) {
        this.player = player;
        this.rect = rect;
        this.currentPixels = new Uint8Array(player.pixels);
        this.nextPixels = new Uint8Array(player.pixels);
        // Start with assumption that everything inside the video frame is currently open/0
        // so that the first frame correctly drops all initial black pixels
        this.currentPixels.fill(0);
    }

    /**
     * Steps video playback to match the given game tick or music time.
     * Updates ArenaGrid collision and optionally ArenaFloor visual state.
     */
    step(
        tick: number,
        grid: ArenaGrid,
        floor?: ArenaFloor,
    ): { rose: [number, number][]; fell: [number, number][] } {
        const totalFrames = this.player.totalFrames;
        const fps = this.player.fps;
        const frameIndex =
            this.musicSeconds !== undefined
                ? Math.floor(this.musicSeconds * fps) % totalFrames
                : Math.floor((tick * fps) / TICKS_PER_SECOND) % totalFrames;
        if (frameIndex === this.currentFrameIndex) {
            return { rose: [], fell: [] };
        }

        this.player.decodeFrame(frameIndex, this.nextPixels);
        const { rose, fell } = this.player.diff(this.currentPixels, this.nextPixels);
        const h = this.player.height;

        // Process fallen tiles (turned black -> blocked)
        for (const [px, py] of fell) {
            const gx = this.rect.x0 + px;
            const gy = this.rect.y0 + (h - 1 - py);
            grid.dropTile(gx, gy);
            if (floor) {
                const localX = gx - floor.x0;
                const localY = gy - floor.y0;
                if (localX >= 0 && localX < floor.sizeX && localY >= 0 && localY < floor.sizeY) {
                    const idx = localX + localY * floor.sizeX;
                    floor.dropAt[idx] = tick;
                    floor.roseAt[idx] = -1;
                }
            }
        }

        // Process risen tiles (turned white -> playable floor)
        for (const [px, py] of rose) {
            const gx = this.rect.x0 + px;
            const gy = this.rect.y0 + (h - 1 - py);
            grid.restoreTile(gx, gy);
            if (floor) {
                const localX = gx - floor.x0;
                const localY = gy - floor.y0;
                if (localX >= 0 && localX < floor.sizeX && localY >= 0 && localY < floor.sizeY) {
                    const idx = localX + localY * floor.sizeX;
                    floor.dropAt[idx] = -1;
                    floor.roseAt[idx] = tick;
                    floor.restoreAt[idx] = -1;
                    floor.restoredAt[idx] = -1;
                }
            }
        }

        this.currentPixels.set(this.nextPixels);
        this.currentFrameIndex = frameIndex;
        return { rose, fell };
    }
}

export { VideoController as BadAppleController };
