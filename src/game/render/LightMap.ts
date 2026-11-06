// A lit map's light (MapDef.lighting), as a texture over the ground round the view that the
// shaders read (lights.glsl): every light this frame is added into it here, so a pixel costs one
// texture read however many lights there are. TEXELS_PER_TILE texels a tile, SIZE a side; its
// corner moves a whole texel at a time with the view, so the light doesn't swim as the player
// walks.

export const LIGHT_MAP_SIZE = 128;
const TEXELS_PER_TILE = 2;
export const LIGHT_MAP_TILES = LIGHT_MAP_SIZE / TEXELS_PER_TILE;
// What a texel holds at most (LIGHT_MAP_MAX in lights.glsl)
const MAX = 2;
// Of a light's radius squared, how far it stays at full strength (under half its radius); it
// fades out smoothly from there to its edge, so its rim is soft
const CORE_SQ = 0.2;

export class LightMap {
    // Colour a texel, and the bytes it's uploaded as
    readonly light = new Float32Array(LIGHT_MAP_SIZE * LIGHT_MAP_SIZE * 3);
    readonly bytes = new Uint8Array(LIGHT_MAP_SIZE * LIGHT_MAP_SIZE * 4);
    // World tiles of its south-west corner
    x0 = 0;
    y0 = 0;
    // The texels written to since it was last cleared, to clear and convert only those
    private dirty = { x0: LIGHT_MAP_SIZE, y0: LIGHT_MAP_SIZE, x1: -1, y1: -1 };
    private written = { x0: LIGHT_MAP_SIZE, y0: LIGHT_MAP_SIZE, x1: -1, y1: -1 };

    // A new frame, centred on (x, y) in world tiles
    begin(x: number, y: number): void {
        const half = LIGHT_MAP_TILES / 2;
        this.x0 = Math.floor((x - half) * TEXELS_PER_TILE) / TEXELS_PER_TILE;
        this.y0 = Math.floor((y - half) * TEXELS_PER_TILE) / TEXELS_PER_TILE;
        // Last frame's texels are cleared as this frame's are converted (end)
        this.written = this.dirty;
        this.dirty = { x0: LIGHT_MAP_SIZE, y0: LIGHT_MAP_SIZE, x1: -1, y1: -1 };
        const w = this.written;
        for (let ty = w.y0; ty <= w.y1; ty++) {
            this.light.fill(
                0,
                (ty * LIGHT_MAP_SIZE + w.x0) * 3,
                (ty * LIGHT_MAP_SIZE + w.x1 + 1) * 3,
            );
        }
    }

    // A light at (x, y), world tiles: colour times strength, a channel
    add(x: number, y: number, radius: number, r: number, g: number, b: number): void {
        if (radius <= 0 || r + g + b <= 0) {
            return;
        }
        const scale = TEXELS_PER_TILE;
        // Its middle in texels, and the texels it reaches (the edge row and column left clear, so
        // the texture's clamped edge stays dark)
        const cx = (x - this.x0) * scale - 0.5;
        const cy = (y - this.y0) * scale - 0.5;
        const reach = radius * scale;
        const tx0 = Math.max(1, Math.ceil(cx - reach));
        const ty0 = Math.max(1, Math.ceil(cy - reach));
        const tx1 = Math.min(LIGHT_MAP_SIZE - 2, Math.floor(cx + reach));
        const ty1 = Math.min(LIGHT_MAP_SIZE - 2, Math.floor(cy + reach));
        if (tx0 > tx1 || ty0 > ty1) {
            return;
        }
        const d = this.dirty;
        d.x0 = Math.min(d.x0, tx0);
        d.y0 = Math.min(d.y0, ty0);
        d.x1 = Math.max(d.x1, tx1);
        d.y1 = Math.max(d.y1, ty1);
        const inv = 1 / (reach * reach);
        const light = this.light;
        for (let ty = ty0; ty <= ty1; ty++) {
            const dy = ty - cy;
            for (let tx = tx0; tx <= tx1; tx++) {
                const dx = tx - cx;
                const q = (dx * dx + dy * dy) * inv;
                if (q >= 1) {
                    continue;
                }
                // 1 - smoothstep(CORE_SQ, 1, q)
                const t = q <= CORE_SQ ? 0 : (q - CORE_SQ) / (1 - CORE_SQ);
                const f = 1 - t * t * (3 - 2 * t);
                const i = (ty * LIGHT_MAP_SIZE + tx) * 3;
                light[i] += r * f;
                light[i + 1] += g * f;
                light[i + 2] += b * f;
            }
        }
    }

    // The bytes to upload, last frame's and this frame's texels both brought up to date. False if
    // nothing's changed (no light then or now).
    end(): boolean {
        const a = this.written;
        const b = this.dirty;
        const x0 = Math.min(a.x0, b.x0);
        const y0 = Math.min(a.y0, b.y0);
        const x1 = Math.max(a.x1, b.x1);
        const y1 = Math.max(a.y1, b.y1);
        if (x0 > x1) {
            return false;
        }
        const light = this.light;
        const bytes = this.bytes;
        const k = 255 / MAX;
        for (let ty = y0; ty <= y1; ty++) {
            for (let tx = x0; tx <= x1; tx++) {
                const i = ty * LIGHT_MAP_SIZE + tx;
                bytes[i * 4] = Math.min(255, light[i * 3] * k + 0.5);
                bytes[i * 4 + 1] = Math.min(255, light[i * 3 + 1] * k + 0.5);
                bytes[i * 4 + 2] = Math.min(255, light[i * 3 + 2] * k + 0.5);
            }
        }
        return true;
    }
}
