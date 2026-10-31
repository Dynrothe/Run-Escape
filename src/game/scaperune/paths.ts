// Finds cheapest paths on one grid, again and again without clearing it each time:
// a big map has hundreds of roads to lay.
export class PathFinder {
    private readonly best: Float64Array;
    private readonly from: Int32Array;
    private readonly seen: Uint32Array;
    private stamp = 0;

    constructor(
        readonly sizeX: number,
        readonly sizeY: number,
    ) {
        const count = sizeX * sizeY;
        this.best = new Float64Array(count);
        this.from = new Int32Array(count);
        this.seen = new Uint32Array(count);
    }

    // The cheapest path from a tile to any tile a test accepts (Dijkstra, eight ways
    // but never cutting a corner past a blocked tile). cost says what stepping onto a
    // tile costs, Infinity if it can't be stepped on. Returns the tiles walked by index,
    // the end tile first, or nothing if there's no way.
    find(
        start: { x: number; y: number },
        cost: (x: number, y: number) => number,
        isEnd: (i: number) => boolean,
    ): number[] {
        const { sizeX, sizeY, best, from, seen } = this;
        const stamp = ++this.stamp;
        const heap: [number, number][] = [];
        const push = (priority: number, i: number) => {
            heap.push([priority, i]);
            let at = heap.length - 1;
            while (at > 0) {
                const up = (at - 1) >> 1;
                if (heap[up][0] <= heap[at][0]) {
                    break;
                }
                [heap[up], heap[at]] = [heap[at], heap[up]];
                at = up;
            }
        };
        const pop = (): [number, number] => {
            const top = heap[0];
            const last = heap.pop()!;
            if (heap.length > 0) {
                heap[0] = last;
                let at = 0;
                for (;;) {
                    let child = at * 2 + 1;
                    if (child >= heap.length) {
                        break;
                    }
                    if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) {
                        child++;
                    }
                    if (heap[at][0] <= heap[child][0]) {
                        break;
                    }
                    [heap[at], heap[child]] = [heap[child], heap[at]];
                    at = child;
                }
            }
            return top;
        };

        const first = start.x + start.y * sizeX;
        best[first] = 0;
        from[first] = -1;
        seen[first] = stamp;
        push(0, first);
        while (heap.length > 0) {
            const [priority, i] = pop();
            if (priority > best[i]) {
                continue;
            }
            if (isEnd(i)) {
                const path: number[] = [];
                for (let at = i; at !== -1; at = from[at]) {
                    path.push(at);
                }
                return path;
            }
            const x = i % sizeX;
            const y = Math.floor(i / sizeX);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= sizeX || ny >= sizeY) {
                        continue;
                    }
                    if (
                        dx !== 0 &&
                        dy !== 0 &&
                        (cost(nx, y) === Infinity || cost(x, ny) === Infinity)
                    ) {
                        continue;
                    }
                    const step = cost(nx, ny) * (dx !== 0 && dy !== 0 ? 1.41 : 1);
                    const total = priority + step;
                    const j = nx + ny * sizeX;
                    if (total !== Infinity && (seen[j] !== stamp || total < best[j])) {
                        seen[j] = stamp;
                        best[j] = total;
                        from[j] = i;
                        push(total, j);
                    }
                }
            }
        }
        return [];
    }
}

export type Point = { x: number; y: number };

// Rounds a path off: each point moves to the average of those around it, a few
// times over. The end stays where it is, and so do the first pinned points, a stretch
// that has to stay straight, which the rest then curves away from.
export function smoothPath(path: Point[], reach: number, passes: number, pinned = 1): Point[] {
    let points = path;
    for (let pass = 0; pass < passes; pass++) {
        points = points.map((point, i) => {
            if (i < pinned || i === points.length - 1) {
                return point;
            }
            const span = Math.min(reach, i, points.length - 1 - i);
            let x = 0;
            let y = 0;
            for (let j = i - span; j <= i + span; j++) {
                x += points[j].x;
                y += points[j].y;
            }
            return { x: x / (span * 2 + 1), y: y / (span * 2 + 1) };
        });
    }
    return points;
}

// Raises a corner field along a path: above 0 within halfWidth of it, as a band of
// steady width, or one that changes along the path
export function addPathToField(
    field: Float32Array,
    sizeX: number,
    sizeY: number,
    path: Point[],
    width: number | ((point: number) => number),
): void {
    for (let i = 0; i + 1 < path.length; i++) {
        const halfWidth = typeof width === "number" ? width : width(i);
        const reach = Math.ceil(halfWidth) + 2;
        const a = path[i];
        const b = path[i + 1];
        const steps = Math.max(Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2), 1);
        for (let step = 0; step <= steps; step++) {
            const x = a.x + ((b.x - a.x) * step) / steps;
            const y = a.y + ((b.y - a.y) * step) / steps;
            const x0 = Math.max(Math.floor(x) - reach, 0);
            const y0 = Math.max(Math.floor(y) - reach, 0);
            const x1 = Math.min(Math.ceil(x) + reach, sizeX - 1);
            const y1 = Math.min(Math.ceil(y) + reach, sizeY - 1);
            for (let cy = y0; cy <= y1; cy++) {
                for (let cx = x0; cx <= x1; cx++) {
                    const value = halfWidth - Math.hypot(cx - x, cy - y);
                    field[cx + cy * sizeX] = Math.max(field[cx + cy * sizeX], value);
                }
            }
        }
    }
}
