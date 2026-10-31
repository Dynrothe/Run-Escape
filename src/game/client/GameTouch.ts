// The touch joystick. Nothing here knows about the DOM: the fingers come from
// TouchControls.tsx, and GameInput hands the move on to the sim like a key's.

// How far from its centre the stick goes, in CSS pixels
export const STICK_RADIUS = 56;
// Inside this share of the radius the player stands still, so a resting thumb's
// wobble doesn't walk them
export const STICK_DEAD_ZONE = 0.16;

// A finger that moves further than this isn't tapping, in CSS pixels
const TAP_SLOP = 12;

export type MoveVector = { x: number; y: number };

// A thumb's offset on screen (y down) to a move like the keys': length 0 or 1, x
// east and y north. Any direction, but always full speed, so the sim sees
// nothing it couldn't from a keyboard.
export function stickToMove(
    dx: number,
    dy: number,
    out: MoveVector,
    radius = STICK_RADIUS,
    deadZone = STICK_DEAD_ZONE,
): MoveVector {
    const distance = Math.hypot(dx, dy);
    if (distance <= radius * deadZone) {
        out.x = 0;
        out.y = 0;
    } else {
        out.x = dx / distance;
        out.y = -dy / distance;
    }
    return out;
}

type Finger = { id: number; x: number; y: number };

// The stick appears wherever a finger lands. The first finger down steers, and
// a thumb dragged past the rim pulls the centre along, so turning back is always
// one short move. Any other finger waits, and takes over if the first lifts.
export class TouchStick {
    // Oldest first
    private readonly fingers: Finger[] = [];

    centerX = 0;
    centerY = 0;

    get active(): boolean {
        return this.fingers.length > 0;
    }

    // Where the thumb is, on screen
    get thumbX(): number {
        return this.fingers.length > 0 ? this.fingers[0].x : this.centerX;
    }

    get thumbY(): number {
        return this.fingers.length > 0 ? this.fingers[0].y : this.centerY;
    }

    down(id: number, x: number, y: number): void {
        if (this.fingers.some((finger) => finger.id === id)) {
            return;
        }
        this.fingers.push({ id, x, y });
        if (this.fingers.length === 1) {
            this.centerOn(x, y);
        }
    }

    move(id: number, x: number, y: number): void {
        const index = this.fingers.findIndex((finger) => finger.id === id);
        if (index === -1) {
            return;
        }
        this.fingers[index].x = x;
        this.fingers[index].y = y;
        if (index === 0) {
            this.followThumb();
        }
    }

    up(id: number): void {
        const index = this.fingers.findIndex((finger) => finger.id === id);
        if (index === -1) {
            return;
        }
        this.fingers.splice(index, 1);
        if (index === 0 && this.fingers.length > 0) {
            this.centerOn(this.fingers[0].x, this.fingers[0].y);
        }
    }

    // Every finger forgotten (the window lost focus, say)
    clear(): void {
        this.fingers.length = 0;
    }

    getMove(out: MoveVector): MoveVector {
        if (this.fingers.length === 0) {
            out.x = 0;
            out.y = 0;
            return out;
        }
        return stickToMove(this.thumbX - this.centerX, this.thumbY - this.centerY, out);
    }

    private centerOn(x: number, y: number): void {
        this.centerX = x;
        this.centerY = y;
    }

    private followThumb(): void {
        const dx = this.thumbX - this.centerX;
        const dy = this.thumbY - this.centerY;
        const distance = Math.hypot(dx, dy);
        if (distance > STICK_RADIUS) {
            const over = (distance - STICK_RADIUS) / distance;
            this.centerX += dx * over;
            this.centerY += dy * over;
        }
    }
}

type Press<T> = { target: T; x: number; y: number; shared: boolean };

// A browser only makes a click from a tap when it's the only finger on the
// screen, and the thumb's usually on the stick when a level up or casket comes
// up. This picks out the taps it'll have left alone, for clicking by hand.
export class SharedTaps<T> {
    private readonly presses = new Map<number, Press<T>>();

    down(id: number, target: T, x: number, y: number): void {
        for (const press of this.presses.values()) {
            press.shared = true;
        }
        this.presses.set(id, { target, x, y, shared: this.presses.size > 0 });
    }

    // What the lifted finger tapped, if another finger was on the screen for
    // any of it and it stayed where it was
    up(id: number, target: T, x: number, y: number): T | undefined {
        const press = this.presses.get(id);
        this.presses.delete(id);
        if (
            press &&
            press.shared &&
            press.target === target &&
            Math.hypot(x - press.x, y - press.y) <= TAP_SLOP
        ) {
            return target;
        }
        return undefined;
    }

    cancel(id: number): void {
        this.presses.delete(id);
    }
}
