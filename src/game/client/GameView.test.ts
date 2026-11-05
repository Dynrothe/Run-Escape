// @vitest-environment jsdom
import { POWER_UP_LIFETIME } from "../content/powerups";
import { emptyStats } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { Pickup } from "../core/entities";
import { makeGrid } from "../core/world/testGrid";
import type { GameAssets } from "./GameAssets";
import { GameView } from "./GameView";
import type { Overlay } from "./Overlay";

vi.hoisted(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
});

describe("dropped power-up timers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // An item's model, in model units (1/128 tile)
    const model = { key: "obj:1", height: 32, radius: 0 };

    function setup() {
        const sim = new Sim({
            grid: makeGrid(Array(8).fill("........")),
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 3,
            spawnX: 103.5,
            spawnY: 203.5,
        });
        const pickup: Pickup = {
            uid: 1,
            kind: "powerUp",
            powerUp: "magnet",
            x: 104.5,
            y: 203.5,
            prevX: 104.5,
            prevY: 203.5,
            spawnTick: 10,
            value: 1,
            attracted: false,
            speed: 0,
            pileUid: 0,
        };
        sim.pickups = [pickup];
        sim.tick = pickup.spawnTick;
        const assets = { get: vi.fn((): typeof model | undefined => model) };
        const view = new GameView(assets as unknown as GameAssets);
        const ctx = {
            beginPath: vi.fn(),
            arc: vi.fn(),
            moveTo: vi.fn(),
            closePath: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 0,
        };
        const project = vi
            .fn<Overlay["project"]>()
            .mockReturnValue({ x: 100, y: 100, visible: true });
        const overlay = { ctx, project } as unknown as Overlay;
        const draw = (alpha = 1, scale = 1) => view["drawPickupTimers"](overlay, sim, alpha, scale);
        return { sim, pickup, assets, view, ctx, project, draw };
    }

    test("starts full, drains clockwise with sim ticks, and ends at expiry", () => {
        const { sim, pickup, ctx, draw } = setup();
        const lifetime = POWER_UP_LIFETIME * TICKS_PER_SECOND;
        for (const fraction of [0, 0.25, 0.5, 0.99]) {
            sim.tick = pickup.spawnTick + lifetime * fraction;
            draw();
            expect(ctx.arc).toHaveBeenLastCalledWith(
                100,
                85,
                11,
                -Math.PI / 2 + fraction * Math.PI * 2,
                Math.PI * 1.5,
            );
        }
        expect(ctx.stroke).toHaveBeenCalledTimes(4);
        sim.tick = pickup.spawnTick + lifetime;
        draw();
        sim.pickups = [];
        draw();
        expect(ctx.stroke).toHaveBeenCalledTimes(4);
    });

    test.each([
        [1, "#00ff00"],
        [0.5001, "#00ff00"],
        [0.5, "#ffc800"],
        [0.2501, "#ffc800"],
        [0.25, "#ff0000"],
        [0.001, "#ff0000"],
    ] as const)("uses the warning colour for %s of the lifetime remaining", (remaining, color) => {
        const { sim, pickup, ctx, draw } = setup();
        sim.tick = pickup.spawnTick + (1 - remaining) * POWER_UP_LIFETIME * TICKS_PER_SECOND;
        draw();
        expect(ctx.fillStyle).toBe(color);
        expect(ctx.strokeStyle).toBe(color);
    });

    test("interpolates within a tick, goes by the sim's ticks and never changes the drop", () => {
        const { sim, pickup, ctx, draw } = setup();
        const before = { ...pickup };
        sim.tick += 100;
        draw(0.25);
        const first = ctx.arc.mock.lastCall!;
        draw(0.75);
        expect(ctx.arc.mock.lastCall![3]).toBeGreaterThan(first[3]);
        // A paused run (GameClient.getAlpha gives 1, and the tick stands still):
        // a minute on the clock changes nothing
        draw(1);
        const still = ctx.arc.mock.lastCall;
        const later = performance.now() + 60_000;
        vi.spyOn(performance, "now").mockReturnValue(later);
        draw(1);
        expect(ctx.arc.mock.lastCall).toEqual(still);
        expect(pickup).toEqual(before);
    });

    test.each(["bones", "coins", "food", "casket"] as const)(
        "does not invent an expiry for %s",
        (kind) => {
            const { pickup, ctx, draw } = setup();
            pickup.kind = kind;
            draw();
            expect(ctx.stroke).not.toHaveBeenCalled();
        },
    );

    test("hides attracted and off-screen drops, and ones whose model isn't drawn yet", () => {
        const { pickup, assets, ctx, project, draw } = setup();
        pickup.attracted = true;
        draw();
        pickup.attracted = false;
        assets.get.mockReturnValueOnce(undefined);
        draw();
        project.mockReturnValue({ x: 0, y: 0, visible: false, behind: true });
        draw();
        expect(ctx.stroke).not.toHaveBeenCalled();
    });

    test("go once the run's over, and with the setting off", () => {
        const { sim, view, ctx, draw } = setup();
        view.pickupTimers = false;
        draw();
        view.pickupTimers = true;
        sim.state = "dead";
        draw();
        expect(ctx.stroke).not.toHaveBeenCalled();
    });

    test("sits over as far as the item reaches on the screen, not on it", () => {
        const { assets, ctx, project, draw } = setup();
        // 32 pixels a tile across the screen, from the drop
        project.mockImplementation((x) => ({ x: 100 + (x - 104.5) * 32, y: 100, visible: true }));
        draw();
        const flat = ctx.arc.mock.lastCall![1];
        // Half a tile from its middle, or more as power-ups are drawn bigger
        assets.get.mockReturnValue({ ...model, radius: 64 });
        draw();
        expect(flat - ctx.arc.mock.lastCall![1]).toBeGreaterThanOrEqual(16);
    });

    test("scales on small screens and stays visible during the final blinking seconds", () => {
        const { sim, pickup, ctx, draw } = setup();
        sim.tick = pickup.spawnTick + (POWER_UP_LIFETIME - 2) * TICKS_PER_SECOND;
        draw(1, 0.75);
        expect(ctx.arc.mock.lastCall![2]).toBe(8.25);
        expect(ctx.stroke).toHaveBeenCalledOnce();
    });
});

test("slashes and auras follow the displayed body without moving confirmed effects", () => {
    const sim = new Sim({
        grid: makeGrid(Array(8).fill("........")),
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 3,
        spawnX: 103.5,
        spawnY: 203.5,
    });
    const view = new GameView({} as GameAssets);
    const confirmed = { x: sim.player.x, y: sim.player.y };
    const pose = {
        hero: 0,
        x: confirmed.x + 1,
        y: confirmed.y + 0.5,
        yaw: 0,
        moving: true,
        moveTicks: 0,
    };
    view.localPlayerPose = pose;
    view.onEvents(sim, [
        {
            type: "slash",
            ...confirmed,
            dirX: 1,
            dirY: 0,
            reach: 2,
            width: 1,
            arc: 0,
            weaponId: "scimitar",
        },
        { type: "aura", ...confirmed, radius: 2 },
    ]);
    const points: { x: number; y: number }[] = [];
    const overlay = {
        ctx: { beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {} },
        project(x: number, _height: number, y: number) {
            points.push({ x, y });
            return { x, y, visible: true };
        },
    } as unknown as Overlay;
    const draw = view as unknown as {
        drawSlashes(overlay: Overlay, sim: Sim, alpha: number, now: number, scale: number): void;
        drawAuras(overlay: Overlay, sim: Sim, alpha: number, now: number): void;
    };
    draw.drawSlashes(overlay, sim, 1, performance.now(), 1);
    expect(points[0].x).toBeCloseTo(pose.x + 1.6);
    expect(points[0].y).toBe(pose.y);
    points.length = 0;
    draw.drawAuras(overlay, sim, 1, performance.now());
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(pose.x);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(pose.y);
    expect(sim.player.x).toBe(confirmed.x);
    expect(sim.player.y).toBe(confirmed.y);
});
