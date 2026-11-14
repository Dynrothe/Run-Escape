// What a map's tiles do to whoever's on them, on any map's grid rather than a floor's box
// (MapDef.floor): one byte a tile over the arena, painted from shapes in world tiles. Ghorrock's
// ice is the first (ColdRuleDef.ice); the Frozen remix paints its own on an old map's grid.

export const MASK_ICE = 1;

export type MaskEllipse = { x: number; y: number; rx: number; ry: number };

export class EffectMask {
    private readonly tiles: Uint8Array;
    // Tiles painted, for the view and the tests
    count = 0;

    constructor(
        readonly baseX: number,
        readonly baseY: number,
        readonly sizeX: number,
        readonly sizeY: number,
    ) {
        this.tiles = new Uint8Array(sizeX * sizeY);
    }

    // Every tile whose middle is inside the ellipse, rx by ry tiles about x, y
    paintEllipse({ x, y, rx, ry }: MaskEllipse, effect: number): void {
        const x0 = Math.max(this.baseX, Math.floor(x - rx));
        const x1 = Math.min(this.baseX + this.sizeX - 1, Math.ceil(x + rx));
        const y0 = Math.max(this.baseY, Math.floor(y - ry));
        const y1 = Math.min(this.baseY + this.sizeY - 1, Math.ceil(y + ry));
        for (let ty = y0; ty <= y1; ty++) {
            for (let tx = x0; tx <= x1; tx++) {
                const dx = (tx + 0.5 - x) / rx;
                const dy = (ty + 0.5 - y) / ry;
                if (dx * dx + dy * dy <= 1) {
                    const i = tx - this.baseX + (ty - this.baseY) * this.sizeX;
                    if (this.tiles[i] !== effect) {
                        this.count += this.tiles[i] === 0 ? 1 : 0;
                        this.tiles[i] = effect;
                    }
                }
            }
        }
    }

    // The effect at world tile x, y (0 off the arena or where nothing's painted)
    at(x: number, y: number): number {
        const tx = Math.floor(x) - this.baseX;
        const ty = Math.floor(y) - this.baseY;
        if (tx < 0 || ty < 0 || tx >= this.sizeX || ty >= this.sizeY) {
            return 0;
        }
        return this.tiles[tx + ty * this.sizeX];
    }
}
