// Which lights are drawn each frame (MapDef.lighting): a few at once (MAX_SHOWN_LIGHTS), and a map
// can have any number. Each frame every light that could be drawn is
// offered (add), and the most telling ones get a slot: the shown player's own first, then by how
// bright and big each is for how near the middle of the view. A light coming into a slot fades in
// and one leaving fades out, both over FADE_SECONDS, so nothing pops; one that's gone (a spell
// that's landed) fades out where it was last seen. A slot's holder keeps it unless another beats
// it by KEEP, so two that are nearly as good don't swap back and forth.

const FADE_SECONDS = 0.25;
// Lights drawn at once: each is added into the light map on the CPU (render/LightMap.ts), so this
// is what bounds that work, not the shaders
export const MAX_SHOWN_LIGHTS = 24;
const KEEP = 1.3;
// Tiles past its edge from the middle of the view beyond which a light's never wanted
const VIEW_REACH = 22;

export type LightSink = (
    x: number,
    y: number,
    radius: number,
    r: number,
    g: number,
    b: number,
) => void;

type Candidate = {
    key: number;
    x: number;
    y: number;
    radius: number;
    r: number;
    g: number;
    b: number;
    first: boolean;
    score: number;
};

type Slot = {
    key: number;
    x: number;
    y: number;
    radius: number;
    r: number;
    g: number;
    b: number;
    fade: number;
    wanted: boolean;
};

export class LightBudget {
    // Reused frame to frame, to keep a phone's garbage collector quiet
    private readonly candidates: Candidate[] = [];
    private count = 0;
    private readonly slots: (Slot | undefined)[];
    private readonly byKey = new Map<number, Candidate>();
    private readonly order: Candidate[] = [];

    constructor(readonly size: number) {
        this.slots = new Array(size).fill(undefined);
    }

    begin(): void {
        this.count = 0;
    }

    // A light that could be drawn this frame. key: the same number for the same light every frame
    // (LIGHT_KEY). Colour times strength. first: the shown player's own, always wanted.
    add(
        key: number,
        x: number,
        y: number,
        radius: number,
        r: number,
        g: number,
        b: number,
        first = false,
    ): void {
        if (radius <= 0) {
            return;
        }
        const c = (this.candidates[this.count++] ??= {
            key: 0,
            x: 0,
            y: 0,
            radius: 0,
            r: 0,
            g: 0,
            b: 0,
            first: false,
            score: 0,
        });
        c.key = key;
        c.x = x;
        c.y = y;
        c.radius = radius;
        c.r = r;
        c.g = g;
        c.b = b;
        c.first = first;
    }

    // Picks this frame's lights round the middle of the view and hands each to sink, faded
    // in or out as it comes and goes
    end(viewX: number, viewY: number, seconds: number, sink: LightSink): void {
        const byKey = this.byKey;
        byKey.clear();
        const order = this.order;
        order.length = 0;
        const held = new Set<number>();
        for (const slot of this.slots) {
            if (slot) {
                held.add(slot.key);
            }
        }
        for (let i = 0; i < this.count; i++) {
            const c = this.candidates[i];
            const past = Math.max(0, Math.hypot(c.x - viewX, c.y - viewY) - c.radius);
            if (past > VIEW_REACH) {
                continue;
            }
            c.score = c.first ? Infinity : ((c.r + c.g + c.b) * c.radius) / (1 + past * past * 0.1);
            if (held.has(c.key)) {
                c.score *= KEEP;
            }
            byKey.set(c.key, c);
            order.push(c);
        }
        order.sort((a, b) => b.score - a.score);
        const wanted = new Set<number>();
        for (let i = 0; i < order.length && wanted.size < this.size; i++) {
            if (order[i].score > 0) {
                wanted.add(order[i].key);
            }
        }
        // Slots kept or let go
        for (const slot of this.slots) {
            if (!slot) {
                continue;
            }
            const c = byKey.get(slot.key);
            if (c) {
                copy(c, slot);
            }
            slot.wanted = c !== undefined && wanted.has(slot.key);
            wanted.delete(slot.key);
        }
        // Newcomers into the slots that are free
        for (const key of wanted) {
            const free = this.slots.findIndex((slot) => !slot || (slot.fade <= 0 && !slot.wanted));
            if (free < 0) {
                break;
            }
            const slot = (this.slots[free] ??= {
                key: 0,
                x: 0,
                y: 0,
                radius: 0,
                r: 0,
                g: 0,
                b: 0,
                fade: 0,
                wanted: true,
            });
            copy(byKey.get(key)!, slot);
            slot.key = key;
            slot.fade = 0;
            slot.wanted = true;
        }
        const step = seconds / FADE_SECONDS;
        for (const slot of this.slots) {
            if (!slot) {
                continue;
            }
            slot.fade = Math.min(1, Math.max(0, slot.fade + (slot.wanted ? step : -step)));
            if (slot.fade > 0) {
                const f = slot.fade;
                sink(slot.x, slot.y, slot.radius, slot.r * f, slot.g * f, slot.b * f);
            }
        }
    }

    // Forgets every light at once (another map)
    reset(): void {
        this.slots.fill(undefined);
        this.count = 0;
    }
}

function copy(from: Candidate, to: Slot): void {
    to.x = from.x;
    to.y = from.y;
    to.radius = from.radius;
    to.r = from.r;
    to.g = from.g;
    to.b = from.b;
}

// A light's key, the same every frame: what kind of thing it's from, and which (a uid, an index)
export function lightKey(kind: number, id: number): number {
    return kind * 0x100000000 + id;
}
