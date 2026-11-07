// @vitest-environment jsdom
import {
    ActorAnim,
    ActorModel,
    ActorPage,
    ActorRenderer,
} from "../../mapviewer/webgl/actor/ActorRenderer";
import { POWER_UP_LIFETIME } from "../content/powerups";
import { emptyStats } from "../content/types";
import { PROJECTILE_ITEM_LOOKS, getProjectileObjId, getWeapon } from "../content/weapons";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { Pickup } from "../core/entities";
import { makeGrid } from "../core/world/testGrid";
import type { GameAssets } from "./GameAssets";
import { GameView, RUN_POSE_TICKS, getRunPoseFrame } from "./GameView";
import type { Overlay } from "./Overlay";

vi.hoisted(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
});

// Bolts, knives and the atlatl's darts are items with a look, and the blowpipe's darts spot
// animations without one
test.each([
    "armadyl_crossbow",
    "dragon_hunter_crossbow",
    "eclipse_atlatl",
    "throwing_knives",
    "toxic_blowpipe",
])("%s draws every projectile tier without changing its movement or hit size", (weaponId) => {
    const sim = new Sim({
        grid: makeGrid(Array(8).fill("........")),
        characterId: "ranger",
        metaStats: emptyStats(),
        seed: 3,
        spawnX: 103.5,
        spawnY: 203.5,
    });
    const anim = new ActorAnim(
        -1,
        new Int32Array(4),
        new Uint16Array(1),
        new Uint16Array([1]),
        false,
    );
    const model = { anims: [anim] } as ActorModel;
    const assets = {
        get: vi.fn(() => model),
        getPlayer: () => undefined,
    } as unknown as GameAssets;
    const view = new GameView(assets);
    const draw = vi.fn<ActorRenderer["draw"]>();
    const actors = { draw } as unknown as ActorRenderer;
    const weapon = getWeapon(weaponId);
    for (const level of weapon.levels) {
        for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
            sim.projectiles.length = 0;
            sim["addProjectile"]("spell", weapon, level, undefined, angle);
            const projectile = sim.projectiles[0];
            const before = { ...projectile };
            view.submitActors(actors, sim, 1);
            const objId = getProjectileObjId(weapon, level);
            expect(assets.get).toHaveBeenLastCalledWith(
                objId !== undefined ? "obj:" + objId : "spot:" + level.projectileSpotAnim,
            );
            const look = objId !== undefined ? PROJECTILE_ITEM_LOOKS[objId] : undefined;
            expect(look === undefined).toBe(weaponId === "toxic_blowpipe");
            expect(draw).toHaveBeenLastCalledWith(
                model,
                anim,
                0,
                projectile.x,
                expect.any(Number),
                projectile.y,
                (projectile.yaw + (look?.yawOffset ?? 0)) & 2047,
                // Seen in the dark on a map with lighting (ActorDrawOptions.unlit)
                { scale: look?.scale ?? 1, unlit: 1 },
            );
            expect(projectile).toEqual(before);
            expect(projectile.radius).toBe(0.4);
        }
    }
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

describe("a weapon's run pose", () => {
    const anim = (seqId: number, lengths: number[], runPose = false) =>
        new ActorAnim(
            seqId,
            new Int32Array(lengths.length * 4),
            new Uint16Array(lengths.length),
            Uint16Array.from(lengths),
            true,
            runPose,
        );
    // The Armadyl crossbow's swing, posed over its stance's run
    const runLengths = [5, 4, 4, 4, 5, 4, 4, 4];
    const run = anim(4228, runLengths);
    const runPose = anim(4230, runLengths, true);

    test("is kept apart from the swing it's a frame of", () => {
        const swing = anim(4230, [3, 3, 3]);
        for (const anims of [
            [swing, run, runPose],
            [runPose, run, swing],
        ]) {
            const model = new ActorModel({} as ActorPage, "player", 0, 0, 0, anims);
            expect(model.getAnim(4230)).toBe(swing);
            expect(model.getAnim(4228)).toBe(run);
            expect(model.runPoses.get(4230)).toBe(runPose);
            expect(model.runPoses.size).toBe(1);
        }
    });

    test("keeps the run's legs going as they were, whenever the shot was", () => {
        for (const moveTicks of [0, 7, 13, 33, 50, 101]) {
            for (const attackTicks of [0, 9, RUN_POSE_TICKS - 1]) {
                expect(getRunPoseFrame(runPose, run, attackTicks, moveTicks)).toBe(
                    run.getFrame(moveTicks),
                );
            }
        }
    });

    test("lasts a moment after the shot", () => {
        expect(getRunPoseFrame(runPose, run, RUN_POSE_TICKS, 3)).toBe(-1);
        expect(getRunPoseFrame(runPose, run, -1, 3)).toBe(-1);
    });

    test("isn't played over another run", () => {
        expect(getRunPoseFrame(runPose, anim(824, [4, 4, 4]), 0, 0)).toBe(-1);
    });
});
