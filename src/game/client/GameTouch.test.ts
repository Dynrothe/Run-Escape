import { describe, expect, test } from "vitest";

import { STICK_DEAD_ZONE, STICK_RADIUS, SharedTaps, TouchStick, stickToMove } from "./GameTouch";

const move = () => ({ x: 0, y: 0 });
const DEAD_ZONE_PIXELS = STICK_RADIUS * STICK_DEAD_ZONE;

describe("stickToMove", () => {
    test("up on screen is north and right is east", () => {
        expect(stickToMove(0, -40, move())).toEqual({ x: 0, y: 1 });
        expect(stickToMove(40, 0, move()).x).toBe(1);
        expect(stickToMove(-40, 0, move()).x).toBe(-1);
        expect(stickToMove(0, 40, move()).y).toBe(-1);
    });

    test("is always length 1 outside the dead zone, however far the thumb", () => {
        for (const [dx, dy] of [
            [12, 5],
            [40, 40],
            [-300, 120],
            [DEAD_ZONE_PIXELS + 0.01, 0],
        ]) {
            const { x, y } = stickToMove(dx, dy, move());
            expect(Math.hypot(x, y)).toBeCloseTo(1, 10);
        }
    });

    test("keeps the thumb's direction, not just eight of them", () => {
        const { x, y } = stickToMove(30, -10, move());
        expect(y / x).toBeCloseTo(10 / 30, 10);
    });

    test("stands still inside the dead zone", () => {
        expect(stickToMove(0, 0, move())).toEqual({ x: 0, y: 0 });
        expect(stickToMove(DEAD_ZONE_PIXELS, 0, move())).toEqual({ x: 0, y: 0 });
        expect(stickToMove(3, -3, move())).toEqual({ x: 0, y: 0 });
    });

    test("writes to the vector it's given", () => {
        const out = move();
        expect(stickToMove(20, 0, out)).toBe(out);
    });
});

describe("TouchStick", () => {
    test("does nothing until a finger's down", () => {
        const stick = new TouchStick();
        expect(stick.active).toBe(false);
        expect(stick.getMove(move())).toEqual({ x: 0, y: 0 });
    });

    test("appears where the finger lands and stands still until it moves", () => {
        const stick = new TouchStick();
        stick.down(1, 200, 300);
        expect(stick.active).toBe(true);
        expect([stick.centerX, stick.centerY]).toEqual([200, 300]);
        expect(stick.getMove(move())).toEqual({ x: 0, y: 0 });
        stick.move(1, 240, 300);
        expect(stick.getMove(move()).x).toBeCloseTo(1, 10);
    });

    test("stops when the finger lifts", () => {
        const stick = new TouchStick();
        stick.down(1, 200, 300);
        stick.move(1, 240, 300);
        stick.up(1);
        expect(stick.active).toBe(false);
        expect(stick.getMove(move())).toEqual({ x: 0, y: 0 });
    });

    test("a thumb past the rim pulls the centre along, so turning back is short", () => {
        const stick = new TouchStick();
        stick.down(1, 100, 100);
        stick.move(1, 100 + STICK_RADIUS + 60, 100);
        expect(stick.centerX).toBeCloseTo(160, 10);
        expect(stick.centerY).toBe(100);
        // Back past the centre: a stick that stayed put would still be east
        stick.move(1, 150, 100);
        expect(stick.getMove(move()).x).toBeCloseTo(-1, 10);
    });

    test("a second finger doesn't steer", () => {
        const stick = new TouchStick();
        stick.down(1, 100, 100);
        stick.move(1, 140, 100);
        stick.down(2, 700, 300);
        stick.move(2, 600, 200);
        expect(stick.getMove(move()).x).toBeCloseTo(1, 10);
        expect([stick.centerX, stick.centerY]).toEqual([100, 100]);
    });

    test("the second finger lifting changes nothing", () => {
        const stick = new TouchStick();
        stick.down(1, 100, 100);
        stick.move(1, 140, 100);
        stick.down(2, 700, 300);
        stick.up(2);
        expect(stick.getMove(move()).x).toBeCloseTo(1, 10);
    });

    test("the next finger takes over from where it is when the first lifts", () => {
        const stick = new TouchStick();
        stick.down(1, 100, 100);
        stick.move(1, 140, 100);
        stick.down(2, 700, 300);
        stick.move(2, 690, 290);
        stick.up(1);
        expect(stick.active).toBe(true);
        expect([stick.centerX, stick.centerY]).toEqual([690, 290]);
        expect(stick.getMove(move())).toEqual({ x: 0, y: 0 });
        stick.move(2, 690, 250);
        expect(stick.getMove(move()).y).toBeCloseTo(1, 10);
    });

    test("ignores fingers it doesn't know", () => {
        const stick = new TouchStick();
        stick.down(1, 100, 100);
        stick.move(9, 500, 500);
        stick.up(9);
        expect(stick.active).toBe(true);
        expect(stick.thumbX).toBe(100);
    });

    test("a finger reported down twice counts once", () => {
        const stick = new TouchStick();
        stick.down(1, 100, 100);
        stick.down(1, 110, 110);
        stick.up(1);
        expect(stick.active).toBe(false);
    });

    test("clear forgets every finger, and later moves from them do nothing", () => {
        const stick = new TouchStick();
        stick.down(1, 100, 100);
        stick.down(2, 300, 100);
        stick.clear();
        expect(stick.active).toBe(false);
        stick.move(1, 200, 100);
        expect(stick.getMove(move())).toEqual({ x: 0, y: 0 });
    });
});

describe("SharedTaps", () => {
    test("leaves a finger on its own to the browser", () => {
        const taps = new SharedTaps<string>();
        taps.down(1, "card", 100, 100);
        expect(taps.up(1, "card", 100, 100)).toBeUndefined();
    });

    test("a tap while the thumb's down is one to click", () => {
        const taps = new SharedTaps<string>();
        taps.down(1, "zone", 100, 300);
        taps.down(2, "card", 500, 100);
        expect(taps.up(2, "card", 500, 100)).toBe("card");
    });

    test("so is one where the other finger came down second", () => {
        const taps = new SharedTaps<string>();
        taps.down(1, "card", 500, 100);
        taps.down(2, "zone", 100, 300);
        taps.up(2, "zone", 100, 300);
        expect(taps.up(1, "card", 500, 100)).toBe("card");
    });

    test("still counts if the thumb lifted first", () => {
        const taps = new SharedTaps<string>();
        taps.down(1, "zone", 100, 300);
        taps.down(2, "card", 500, 100);
        taps.up(1, "zone", 100, 300);
        expect(taps.up(2, "card", 500, 100)).toBe("card");
    });

    test("not if the finger lifts somewhere else", () => {
        const taps = new SharedTaps<string>();
        taps.down(1, "zone", 100, 300);
        taps.down(2, "card", 500, 100);
        expect(taps.up(2, "other card", 500, 100)).toBeUndefined();
    });

    test("not if the finger dragged, like a swipe down a list", () => {
        const taps = new SharedTaps<string>();
        taps.down(1, "zone", 100, 300);
        taps.down(2, "card", 500, 100);
        expect(taps.up(2, "card", 500, 180)).toBeUndefined();
    });

    test("a small wobble is still a tap", () => {
        const taps = new SharedTaps<string>();
        taps.down(1, "zone", 100, 300);
        taps.down(2, "card", 500, 100);
        expect(taps.up(2, "card", 503, 104)).toBe("card");
    });

    test("a finger the browser cancelled clicks nothing, and is forgotten", () => {
        const taps = new SharedTaps<string>();
        taps.down(1, "zone", 100, 300);
        taps.cancel(1);
        taps.down(2, "card", 500, 100);
        expect(taps.up(2, "card", 500, 100)).toBeUndefined();
    });

    test("a finger it never saw go down clicks nothing", () => {
        const taps = new SharedTaps<string>();
        expect(taps.up(7, "card", 0, 0)).toBeUndefined();
    });
});
