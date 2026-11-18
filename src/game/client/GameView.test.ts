// @vitest-environment jsdom
import {
    ActorAnim,
    ActorModel,
    ActorPage,
    ActorRenderer,
} from "../../mapviewer/webgl/actor/ActorRenderer";
import { getEnemy } from "../content/enemies";
import { POWER_UP_LIFETIME } from "../content/powerups";
import { emptyStats } from "../content/types";
import {
    PROJECTILE_ITEM_LOOKS,
    PROJECTILE_SPOT_LOOKS,
    WEAPONS,
    getProjectileObjId,
    getWeapon,
} from "../content/weapons";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { Pickup, SimEvent } from "../core/entities";
import { makeGrid } from "../core/world/testGrid";
import { GameAssets } from "./GameAssets";
import { GameView, RUN_POSE_TICKS, getRunPoseFrame } from "./GameView";
import { Overlay } from "./Overlay";

vi.hoisted(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
});

describe("hitsplat groups", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function setup() {
        let now = 100;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        vi.spyOn(Math, "random").mockReturnValue(0);
        const sim = new Sim({
            grid: makeGrid(Array(8).fill("........")),
            characterId: "warrior",
            metaStats: emptyStats(),
            seed: 3,
            spawnX: 103.5,
            spawnY: 203.5,
            party: ["warrior", "ranger"].map((characterId) => ({
                name: characterId,
                characterId,
                metaStats: emptyStats(),
            })),
        });
        const assets = {
            get: () => undefined,
            getPlayer: () => undefined,
            getSprite: () => undefined,
        } as unknown as GameAssets;
        const view = new GameView(assets);
        const enemyHit: SimEvent = {
            type: "damage",
            enemyUid: 1,
            enemyId: "goblin",
            amount: 18,
            x: 104.5,
            y: 203.5,
        };
        const playerHit: SimEvent = {
            type: "playerHit",
            amount: 10,
            enemyId: "goblin",
            elite: false,
            hero: 0,
        };
        const emit = (...events: SimEvent[]) => view.onEvents(sim, events);
        return { sim, view, enemyHit, playerHit, emit, setNow: (value: number) => (now = value) };
    }

    test("reserves four slots per enemy and per co-op hero, including poison and blocks", () => {
        const { view, enemyHit, playerHit, emit } = setup();
        emit(enemyHit, { ...enemyHit, poison: true }, { ...enemyHit, blocked: true }, enemyHit);
        emit(
            playerHit,
            { type: "playerPoisoned", amount: 3 },
            { ...playerHit, missed: true },
            playerHit,
        );
        expect(view["hitsplats"]).toHaveLength(8);
        expect(view["hitsplats"].map((hit) => hit.slot)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
        expect(view["hitsplats"].map((hit) => hit.kind)).toEqual([
            "damage",
            "poison",
            "block",
            "damage",
            "damage",
            "poison",
            "block",
            "damage",
        ]);
        emit({ ...enemyHit, enemyUid: 2 }, { ...playerHit, hero: 1 });
        expect(view["hitsplats"].slice(-2).map((hit) => hit.slot)).toEqual([0, 0]);
    });

    test("reuses expired slots without moving active hits, and clears reservations on reset", () => {
        const { view, enemyHit, emit, setNow } = setup();
        emit(enemyHit);
        setNow(200);
        emit(enemyHit, enemyHit, enemyHit);
        setNow(1000);
        emit({ ...enemyHit, amount: 36 });
        expect(view["hitsplats"].at(-1)).toMatchObject({ amount: 36, slot: 0 });
        expect(view["hitsplats"].slice(1, 4).map((hit) => hit.slot)).toEqual([1, 2, 3]);
        view.reset();
        emit(enemyHit);
        expect(view["hitsplats"]).toHaveLength(1);
        expect(view["hitsplats"][0].slot).toBe(0);
    });

    test.each(["enemy", "player"] as const)(
        "replaces the oldest %s hit in its slot without disturbing other targets",
        (target) => {
            const { view, enemyHit, playerHit, emit, setNow } = setup();
            const hit = target === "enemy" ? enemyHit : playerHit;
            const other = target === "enemy" ? playerHit : enemyHit;
            emit(other);
            for (let amount = 1; amount <= 4; amount++) {
                setNow(100 + amount * 10);
                emit({ ...hit, amount });
            }
            const untouched = view["hitsplats"].slice(0, 1).concat(view["hitsplats"].slice(2));
            setNow(150);
            emit({ ...hit, amount: 5 });
            expect(view["hitsplats"]).toHaveLength(5);
            expect(view["hitsplats"].at(-1)).toMatchObject({ amount: 5, slot: 0, start: 150 });
            expect(view["hitsplats"].slice(0, 4)).toEqual(untouched);
            emit({ ...hit, amount: 6 });
            expect(view["hitsplats"].map((active) => active.amount)).toEqual([
                other.amount,
                3,
                4,
                5,
                6,
            ]);
            expect(view["hitsplats"].at(-1)).toMatchObject({ amount: 6, slot: 1 });
        },
    );

    test.each(["enemy", "player"] as const)(
        "draws %s hits in four scaled screen positions",
        (target) => {
            const { sim, view, enemyHit, playerHit, emit } = setup();
            const hit = target === "enemy" ? enemyHit : playerHit;
            emit(hit, hit, hit, hit);
            const ctx = {
                measureText: () => ({
                    actualBoundingBoxLeft: 4,
                    actualBoundingBoxRight: 4,
                    actualBoundingBoxAscent: 4,
                    actualBoundingBoxDescent: 4,
                }),
                fillText: vi.fn(),
                beginPath() {},
                moveTo() {},
                lineTo() {},
                closePath() {},
                fill() {},
                stroke() {},
            };
            const overlay = {
                ctx,
                project: () => ({ x: 100, y: 100, visible: true }),
            } as unknown as Overlay;
            for (const scale of [1, 2]) {
                ctx.fillText.mockClear();
                view["drawHitsplats"](overlay, sim, 1, 100, scale);
                const textPositions = ctx.fillText.mock.calls.filter((_, i) => i % 2 === 1);
                expect(textPositions.map(([, x, y]) => [x, y])).toEqual([
                    [100, 100],
                    [100, 100 - 20 * scale],
                    [100 - 15 * scale, 100 - 10 * scale],
                    [100 + 15 * scale, 100 - 10 * scale],
                ]);
            }
            view["drawHitsplats"](overlay, sim, 1, 1000, 1);
            expect(view["hitsplats"]).toHaveLength(0);
        },
    );
});

test("Avian's birds follow the rendered hero and loop without changing the sim", () => {
    const sim = new Sim({
        grid: makeGrid(Array(8).fill("........")),
        mapId: "thanksgiving",
        characterId: "avian_assaulter",
        metaStats: emptyStats(),
        seed: 3,
        spawnX: 103.5,
        spawnY: 203.5,
        party: ["avian_assaulter", "warrior"].map((characterId) => ({
            name: characterId,
            characterId,
            metaStats: emptyStats(),
        })),
    });
    const anim = new ActorAnim(
        -1,
        new Int32Array(8),
        new Uint16Array(2),
        new Uint16Array([2, 2]),
        true,
    );
    const playerModel = {
        height: 192,
        getAnim: () => anim,
        runPoses: new Map(),
    } as unknown as ActorModel;
    const effectModel = { anims: [anim] } as ActorModel;
    const assets = {
        get: vi.fn((key: string) => (key === "spot:254" ? effectModel : undefined)),
        getPlayer: () => playerModel,
        getPlayerStance: () => ({ idle: 0, run: 1 }),
    } as unknown as GameAssets;
    const view = new GameView(assets);
    view.localPlayerPose = { hero: 0, x: 104, y: 204, yaw: 512, moving: false, moveTicks: 0 };
    const draw = vi.fn<ActorRenderer["draw"]>();
    const actors = { draw } as unknown as ActorRenderer;
    const before = structuredClone(sim.heroes.map((hero) => hero.player));
    sim.tick = 3;
    view["drawPlayer"](actors, sim, 0, 0.5);
    expect(draw.mock.lastCall![0]).toBe(effectModel);
    expect(draw.mock.lastCall![2]).toBe(1);
    expect(draw.mock.lastCall![4]).toBeCloseTo(-2.025);
    sim.tick = 5;
    view["drawPlayer"](actors, sim, 0, 0.5);
    expect(draw.mock.lastCall![2]).toBe(0);
    expect(draw.mock.lastCall![4]).toBeCloseTo(-2.025);
    expect(draw.mock.lastCall![7]).toEqual({ unlit: 1 });
    // The Avian is drawn 35% bigger on this map; the warrior beside them isn't
    expect(draw).toHaveBeenCalledWith(
        playerModel,
        anim,
        expect.anything(),
        104,
        expect.anything(),
        204,
        512,
        expect.objectContaining({ scale: 1.35 }),
    );
    draw.mockClear();
    view["drawPlayer"](actors, sim, 1, 0.5);
    expect(draw).toHaveBeenCalledOnce();
    expect(draw.mock.calls[0][7]).not.toHaveProperty("scale");
    expect(sim.heroes.map((hero) => hero.player)).toEqual(before);
});

// Bolts, knives and the atlatl's darts are items with a look, the thrownaxes spot animations
// with one (laid on their side), and the blowpipe's darts spot animations without one
test.each([
    "armadyl_crossbow",
    "dragon_hunter_crossbow",
    "eclipse_atlatl",
    "throwing_knives",
    "toxic_blowpipe",
    "throwing_axes",
    "chain_hit_axes",
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
            const look =
                objId !== undefined
                    ? PROJECTILE_ITEM_LOOKS[objId]
                    : PROJECTILE_SPOT_LOOKS[projectile.spotAnim];
            expect(look === undefined).toBe(weaponId === "toxic_blowpipe");
            expect(look?.roll).toBe(weaponId.endsWith("_axes") ? 512 : undefined);
            expect(draw).toHaveBeenLastCalledWith(
                model,
                anim,
                0,
                projectile.x,
                expect.any(Number),
                projectile.y,
                (projectile.yaw + (look?.yawOffset ?? 0)) & 2047,
                // Seen in the dark on a map with lighting (ActorDrawOptions.unlit)
                { scale: look?.scale ?? 1, roll: look?.roll, unlit: 1 },
            );
            expect(projectile).toEqual(before);
            expect(projectile.radius).toBe(0.4);
        }
    }
});

// The Dagannoth Supreme throws the rune thrownaxe's spin, so his axes lie on their side as the
// player's do
test("an enemy's thrown axes are drawn on their side", () => {
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
    const model = { anims: [anim], radius: 20, height: 40 } as ActorModel;
    const assets = {
        get: vi.fn(() => model),
        getPlayer: () => undefined,
    } as unknown as GameAssets;
    const view = new GameView(assets);
    const draw = vi.fn<ActorRenderer["draw"]>();
    const actors = { draw } as unknown as ActorRenderer;
    const attack = getEnemy("dagannoth_supreme").boss!.attacks[0];
    expect(attack.spotAnim).toBe(41);
    sim.enemyProjectiles.push({
        uid: 1,
        enemyUid: 1,
        enemyId: "dagannoth_supreme",
        attack,
        x: 105,
        y: 203.5,
        prevX: 105,
        prevY: 203.5,
        vx: 0,
        vy: 0,
        speed: 0,
        homing: 0,
        life: 10,
        radius: 0.4,
        damage: 3,
        yaw: 512,
        startTick: sim.tick,
    });
    view.submitActors(actors, sim, 1);
    expect(assets.get).toHaveBeenCalledWith("spot:41");
    const call = draw.mock.calls.find((c) => c[3] === 105 && c[5] === 203.5);
    expect(call?.[7]).toMatchObject({ roll: 512, unlit: 1 });
});

describe("dropped power-up timers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // An item's model, in model units (1/128 tile)
    const model = {
        key: "obj:1",
        height: 32,
        radius: 0,
        anims: [
            new ActorAnim(-1, new Int32Array(4), new Uint16Array(1), new Uint16Array([1]), false),
        ],
    };

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
        const assets = {
            get: vi.fn((): typeof model | undefined => model),
            getPlayer: () => undefined,
        };
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

    test.each(["giant_essence", "drill_demon"])(
        "%s is drawn bigger, and its timer rises with it",
        (powerUp) => {
            const { sim, pickup, assets, view, ctx, project, draw } = setup();
            assets.get.mockReturnValue({ ...model, radius: 64 });
            project.mockImplementation((x, height) => ({
                x: 100 + (x - pickup.x) * 32,
                y: 100 + height * 32,
                visible: true,
            }));
            const actorDraw = vi.fn<ActorRenderer["draw"]>();
            const actors = { draw: actorDraw } as unknown as ActorRenderer;
            view.submitActors(actors, sim, 1);
            const normalScale = actorDraw.mock.lastCall![7]!.scale!;
            draw();
            const normalTimerY = ctx.arc.mock.lastCall![1];

            pickup.powerUp = powerUp;
            view.submitActors(actors, sim, 1);
            const enlarged = actorDraw.mock.lastCall!;
            const enlargedScale = enlarged[7]!.scale!;
            expect(enlargedScale).toBeGreaterThan(normalScale);
            expect(enlargedScale).toBeLessThanOrEqual(normalScale * 2);
            expect(enlarged[7]!.unlit).toBe(1);
            draw();
            expect(ctx.arc.mock.lastCall![1]).toBeLessThan(normalTimerY);
        },
    );

    test("scales on small screens and stays visible during the final blinking seconds", () => {
        const { sim, pickup, ctx, draw } = setup();
        sim.tick = pickup.spawnTick + (POWER_UP_LIFETIME - 2) * TICKS_PER_SECOND;
        draw(1, 0.75);
        expect(ctx.arc.mock.lastCall![2]).toBe(8.25);
        expect(ctx.stroke).toHaveBeenCalledOnce();
    });
});

describe("slash swooshes", () => {
    afterEach(() => vi.restoreAllMocks());

    function setup(area = 0, weaponId = "rubber_chicken") {
        vi.spyOn(performance, "now").mockReturnValue(1000);
        const sim = new Sim({
            grid: makeGrid(Array(24).fill("........................")),
            mapId: "thanksgiving",
            characterId: "avian_assaulter",
            metaStats: { ...emptyStats(), area },
            seed: 3,
            spawnX: 112.5,
            spawnY: 212.5,
        });
        sim.weapons = [];
        sim.addWeapon(weaponId);
        const assets: GameAssets = Object.create(GameAssets.prototype);
        const view = new GameView(assets);
        const overlay: Overlay = Object.create(Overlay.prototype);
        Object.defineProperty(overlay, "ctx", {
            value: { beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} },
        });
        const project = vi.spyOn(overlay, "project").mockImplementation((x, _height, y, out) => {
            out.x = x;
            out.y = y;
            out.visible = true;
            return out;
        });
        return { sim, view, overlay, project };
    }

    const swings = WEAPONS.filter(
        (weapon) => weapon.kind === "slash" || weapon.kind === "sweep",
    ).flatMap((weapon) => [
        { weapon, level: 1, area: 0, angle: 0, special: false },
        { weapon, level: weapon.levels.length, area: 0.6, angle: Math.PI / 4, special: false },
    ]);

    test.each(swings.filter(({ weapon }) => weapon.kind === "slash"))(
        "$weapon.name hits across its full visible arcs (level $level, area $area)",
        ({ weapon, level, area, angle }) => {
            const { sim, view, overlay, project } = setup(area, weapon.id);
            sim.weapons[0].level = level;
            const effective = sim["getEffectiveLevel"](sim.weapons[0]);
            const reach = effective.area * (1 + sim.stats.area);
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            const sides = Math.min(effective.amount, 2);
            const arcTargets = Array.from({ length: sides }, (_, side) =>
                [-1.1, -0.55, 0, 0.55, 1.1].map((offset) => {
                    const a = angle + offset + side * Math.PI;
                    return [Math.cos(a) * reach * 0.8, Math.sin(a) * reach * 0.8];
                }),
            ).flat();
            const targets = [
                [dirX * reach * 0.5, dirY * reach * 0.5],
                [-dirX * reach * 0.6, -dirY * reach * 0.6],
                [-dirY * reach, dirX * reach],
                ...arcTargets,
            ].map(([dx, dy]) => {
                const enemy = sim.spawnEnemy(getEnemy("goblin"), "normal", {
                    x: sim.player.x + dx,
                    y: sim.player.y + dy,
                })!;
                enemy.hp = enemy.maxHp = 1e6;
                enemy.frozen = 1e6;
                return enemy;
            });
            sim.weapons[0].cooldown = 0;
            sim.step(0, 0);
            const events = sim.takeEvents();
            const slashes = events.filter((event) => event.type === "slash");
            expect(slashes).toHaveLength(sides);
            for (const [index, target] of targets.entries()) {
                expect(
                    events.some(
                        (event) => event.type === "damage" && event.enemyUid === target.uid,
                    ),
                ).toBe(index !== 2 && (index !== 1 || sides === 2));
            }
            for (const slash of slashes) {
                view.reset();
                view.onEvents(sim, [slash]);
                for (const elapsed of [20, 90, 160]) {
                    project.mockClear();
                    view["drawSlashes"](overlay, sim, 1, 1000 + elapsed, 1);
                    expect(project).toHaveBeenCalled();
                    const points = project.mock.calls;
                    const base = Math.atan2(slash.dirY, slash.dirX);
                    for (const [index, [x, _height, y]] of points.entries()) {
                        const a =
                            base -
                            slash.arc +
                            ((2 * slash.arc * index) / (points.length - 1)) *
                                Math.min(elapsed / 90, 1);
                        expect(x - sim.player.x).toBeCloseTo(Math.cos(a) * reach * 0.8);
                        expect(y - sim.player.y).toBeCloseTo(Math.sin(a) * reach * 0.8);
                    }
                }
            }
        },
    );

    test.each([
        ...swings.filter(({ weapon }) => weapon.kind === "sweep"),
        ...swings
            .filter(({ weapon, level }) => weapon.special?.aoe && level > 1)
            .map((swing) => ({ ...swing, special: true })),
    ])(
        "$weapon.name keeps its full arc (level $level, area $area, special $special)",
        ({ weapon, level, area, angle, special }) => {
            const { sim, view, overlay, project } = setup(area, weapon.id);
            sim.weapons[0].level = level;
            if (special) {
                sim.weapons[0].uses = weapon.special!.every - 1;
            }
            const reach = sim["getEffectiveLevel"](sim.weapons[0]).area * (1 + sim.stats.area);
            const target = sim.spawnEnemy(getEnemy("goblin"), "normal", {
                x: sim.player.x + Math.cos(angle) * reach * 0.5,
                y: sim.player.y + Math.sin(angle) * reach * 0.5,
            })!;
            target.hp = target.maxHp = 1e6;
            target.frozen = 1e6;
            sim.weapons[0].cooldown = 0;
            sim.step(0, 0);
            const events = sim.takeEvents();
            expect(
                events.some((event) => event.type === "damage" && event.enemyUid === target.uid),
            ).toBe(true);
            const slashes = events.filter((event) => event.type === "slash");
            expect(slashes.length).toBeGreaterThan(0);
            for (const slash of slashes) {
                expect(slash.width).toBe(0);
                if (special) {
                    expect(slash.arc).toBe(Math.PI);
                }
                view.reset();
                view.onEvents(sim, [slash]);
                project.mockClear();
                view["drawSlashes"](overlay, sim, 1, 1090, 1);
                const points = project.mock.calls;
                expect(points.length).toBeGreaterThan(10);
                const base = Math.atan2(slash.dirY, slash.dirX);
                for (const [index, [x, _height, y]] of points.entries()) {
                    const angle = base - slash.arc + (2 * slash.arc * index) / (points.length - 1);
                    expect(x - sim.player.x).toBeCloseTo(Math.cos(angle) * slash.reach * 0.8);
                    expect(y - sim.player.y).toBeCloseTo(Math.sin(angle) * slash.reach * 0.8);
                }
            }
        },
    );
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
