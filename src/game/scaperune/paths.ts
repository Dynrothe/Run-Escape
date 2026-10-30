// The cheapest path from a tile to any tile a test accepts (Dijkstra, eight ways
// but never cutting a corner past a blocked tile). cost says what stepping onto
// a tile costs, Infinity if it can't be stepped on. Returns the tiles walked by
// index, the end tile included, or nothing if there's no way.
export function findPath(
    sizeX: number,
    sizeY: number,
    start: { x: number; y: number },
    cost: (x: number, y: number) => number,
    isEnd: (i: number) => boolean,
): number[] {
    const count = sizeX * sizeY;
    const best = new Float64Array(count).fill(Infinity);
    const from = new Int32Array(count).fill(-1);
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
                if (total < best[j]) {
                    best[j] = total;
                    from[j] = i;
                    push(total, j);
                }
            }
        }
    }
    return [];
}
