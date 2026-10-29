export type Positioned = { x: number; y: number };

// Buckets things by grid cell for "what's near here" queries. Rebuilt every
// tick: clear() keeps the bucket arrays around so it doesn't allocate.
export class SpatialHash<T extends Positioned> {
    private readonly cells = new Map<number, T[]>();
    private readonly used: T[][] = [];

    constructor(readonly cellSize: number) {}

    private key(cellX: number, cellY: number): number {
        return ((cellX & 0xffff) << 16) | (cellY & 0xffff);
    }

    clear(): void {
        for (const bucket of this.used) {
            bucket.length = 0;
        }
        this.used.length = 0;
    }

    insert(item: T): void {
        const key = this.key(
            Math.floor(item.x / this.cellSize),
            Math.floor(item.y / this.cellSize),
        );
        let bucket = this.cells.get(key);
        if (!bucket) {
            bucket = [];
            this.cells.set(key, bucket);
        }
        if (bucket.length === 0) {
            this.used.push(bucket);
        }
        bucket.push(item);
    }

    // Calls back for everything in the cells overlapping the circle; callers
    // check the exact distance themselves.
    query(x: number, y: number, radius: number, callback: (item: T) => void): void {
        const minX = Math.floor((x - radius) / this.cellSize);
        const maxX = Math.floor((x + radius) / this.cellSize);
        const minY = Math.floor((y - radius) / this.cellSize);
        const maxY = Math.floor((y + radius) / this.cellSize);
        for (let cellY = minY; cellY <= maxY; cellY++) {
            for (let cellX = minX; cellX <= maxX; cellX++) {
                const bucket = this.cells.get(this.key(cellX, cellY));
                if (bucket) {
                    for (let i = 0; i < bucket.length; i++) {
                        callback(bucket[i]);
                    }
                }
            }
        }
    }
}
