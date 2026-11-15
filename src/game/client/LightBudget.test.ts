import { LightBudget, lightKey } from "./LightBudget";

type Drawn = { x: number; y: number; radius: number; r: number };

function frame(budget: LightBudget, seconds = 1): Drawn[] {
    const drawn: Drawn[] = [];
    budget.end(0, 0, seconds, (x, y, radius, r) => drawn.push({ x, y, radius, r }));
    return drawn;
}

describe("LightBudget", () => {
    test("more lights than slots: the nearest and brightest, and the player's own always", () => {
        const budget = new LightBudget(3);
        budget.begin();
        for (let i = 0; i < 10; i++) {
            budget.add(lightKey(2, i), i * 3, 0, 3, 1, 1, 1);
        }
        // Far off, but the shown player's
        budget.add(lightKey(1, 0), 18, 0, 5, 1, 1, 1, true);
        const drawn = frame(budget);
        expect(drawn.map((d) => d.x).sort((a, b) => a - b)).toEqual([0, 3, 18]);
    });

    test("lights fade in and out rather than pop", () => {
        const budget = new LightBudget(2);
        budget.begin();
        budget.add(lightKey(2, 1), 0, 0, 3, 1, 1, 1);
        expect(frame(budget, 0.1).map((d) => d.r)).toEqual([0.4]);
        budget.begin();
        budget.add(lightKey(2, 1), 0, 0, 3, 1, 1, 1);
        expect(frame(budget, 0.1)[0].r).toBeCloseTo(0.8);
        // Gone (a spell that's landed): fading out where it was last
        budget.begin();
        const out = frame(budget, 0.1);
        expect(out).toHaveLength(1);
        expect(out[0].r).toBeCloseTo(0.4);
        budget.begin();
        expect(frame(budget, 0.2)).toEqual([]);
    });

    test("a newcomer waits for a slot to fade out, and holders aren't swapped for a near tie", () => {
        const budget = new LightBudget(1);
        budget.begin();
        budget.add(lightKey(2, 1), 2, 0, 3, 1, 1, 1);
        frame(budget, 1);
        // A little better, not enough to take the slot
        budget.begin();
        budget.add(lightKey(2, 1), 2, 0, 3, 1, 1, 1);
        budget.add(lightKey(2, 2), 1.9, 0, 3, 1, 1, 1);
        expect(frame(budget, 1).map((d) => d.x)).toEqual([2]);
        // Far better: the holder fades out first, then the newcomer fades in
        budget.begin();
        budget.add(lightKey(2, 1), 2, 0, 3, 1, 1, 1);
        budget.add(lightKey(2, 2), 0, 0, 6, 1, 1, 1);
        const handing = frame(budget, 0.1);
        expect(handing).toEqual([expect.objectContaining({ x: 2 })]);
        expect(handing[0].r).toBeCloseTo(0.6);
        for (let i = 0; i < 3; i++) {
            budget.begin();
            budget.add(lightKey(2, 1), 2, 0, 3, 1, 1, 1);
            budget.add(lightKey(2, 2), 0, 0, 6, 1, 1, 1);
            frame(budget, 0.1);
        }
        budget.begin();
        budget.add(lightKey(2, 1), 2, 0, 3, 1, 1, 1);
        budget.add(lightKey(2, 2), 0, 0, 6, 1, 1, 1);
        const after = frame(budget, 0.1);
        expect(after).toEqual([expect.objectContaining({ x: 0, radius: 6 })]);
    });

    test("nothing too far off the view is drawn", () => {
        const budget = new LightBudget(4);
        budget.begin();
        budget.add(lightKey(2, 1), 60, 0, 3, 1, 1, 1);
        expect(frame(budget)).toEqual([]);
    });
});
