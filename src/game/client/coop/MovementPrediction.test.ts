import { emptyStats } from "../../content/types";
import { PLAYER_SPEED, Sim } from "../../core/Sim";
import type { Enemy } from "../../core/entities";
import { usePortableMath } from "../../core/fmath";
import { cleanFrameEvent, syncHash } from "../../core/lockstep";
import { makeGrid } from "../../core/world/testGrid";
import { getPlayerPose } from "../PlayerPose";
import { CoopRun } from "./CoopRun";
import {
    MAX_INPUT_HISTORY,
    MOVE_REFRESH_MS,
    MovementPrediction,
    PREDICTION_MS,
} from "./MovementPrediction";

function makeSim(focus = 1, wall = false): Sim {
    const rows = Array.from({ length: 72 }, () =>
        Array.from({ length: 72 }, (_, x) => (wall && x === 35 ? "|" : ".")).join(""),
    );
    return new Sim({
        grid: makeGrid(rows, 1000, 1000),
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 3,
        spawnX: 1033.5,
        spawnY: 1036.5,
        focus,
        party: ["warrior", "wizard"].map((characterId, i) => ({
            name: `p${i}`,
            characterId,
            metaStats: emptyStats(),
        })),
    });
}

function setup(wall = false) {
    let now = 0;
    const sim = makeSim(1, wall);
    const prediction = new MovementPrediction(sim, () => now);
    prediction.confirm([]);
    return { sim, prediction, time: (ms: number) => (now = ms) };
}

afterEach(() => usePortableMath(false));

test("moves and turns immediately without writing any confirmed player state", () => {
    const { sim, prediction, time } = setup();
    const before = JSON.stringify(sim.heroes);
    const hash = syncHash(sim);
    prediction.sample([127, 0]);
    const initialX = sim.player.x;
    time(20);
    const pose = prediction.render()!;
    expect(pose.x).toBeCloseTo(initialX + PLAYER_SPEED);
    expect(pose.moving).toBe(true);
    expect(pose.yaw).not.toBe(sim.player.yaw);
    expect(JSON.stringify(sim.heroes)).toBe(before);
    expect(syncHash(sim)).toBe(hash);
    // A spectator or teammate always uses their own confirmed position.
    expect(getPlayerPose(sim, 0, 1, pose).x).toBe(sim.heroes[0].player.x);
    expect(getPlayerPose(sim, 1, 1, pose)).toBe(pose);
    expect(getPlayerPose(sim, 99, 1).x).toBe(sim.player.x);
});

test("input sent before the first host frame stays pending until its echo", () => {
    let now = 0;
    const sim = makeSim();
    const prediction = new MovementPrediction(sim, () => now);
    const initialX = sim.player.x;
    now = 100;
    const seq = prediction.sample([127, 0]);
    now = 110;
    expect(prediction.render()).toBeUndefined();
    now = 120;
    sim.tick = 1;
    prediction.confirm([]);
    expect(prediction.render()!.x).toBeCloseTo(initialX + PLAYER_SPEED, 8);
    now = 340;
    sim.tick = 2;
    sim.player.x += PLAYER_SPEED;
    prediction.confirm([{ frame: 2, hero: 1, move: [127, 0], moveSeq: seq }]);
    expect(prediction.render()!.x).toBeCloseTo(initialX + 12 * PLAYER_SPEED, 8);
});

test("a long wait for the first host frame doesn't hold the picture at a late frame", () => {
    let now = 0;
    const sim = makeSim();
    const prediction = new MovementPrediction(sim, () => now);
    // The run loading: drawn, but no frames come
    for (now = 0; now < 5000; now += 10) prediction.render();
    let tick = 0;
    let last = 0;
    for (now = 5000; now <= 5500; now += 10) {
        if (now === 5200) prediction.sample([127, 0]);
        // Frames stop for a moment, before the start's echo
        if (now % 20 === 0 && (now <= 5240 || now >= 5380)) {
            sim.tick = ++tick;
            prediction.confirm([]);
        }
        const pose = prediction.render()!;
        if (now > 5200) {
            expect(pose.moving).toBe(true);
            expect(pose.x).toBeGreaterThan(last);
        }
        last = pose.x;
    }
});

test("a stop whose echo never comes is waited for only so long", () => {
    const { sim, prediction, time } = setup();
    prediction.sample([127, 0]);
    time(100);
    prediction.render();
    prediction.sample([0, 0]);
    const stopped = prediction.render()!.x;
    expect(stopped).toBeGreaterThan(sim.player.x + 0.2);
    // Frames keep coming, but neither the tap's start nor its stop got there
    for (let now = 120; now <= 4000; now += 20) {
        time(now);
        prediction.confirm([]);
        const pose = prediction.render()!;
        if (now < 2000) expect(pose.x).toBe(stopped);
    }
    expect(prediction.render()!.x).toBeCloseTo(sim.player.x, 2);
});

test("replays terrain collision, movement speed and cursed controls", () => {
    const { sim, prediction, time } = setup(true);
    sim.heroes[1].stats.moveSpeed = 4;
    prediction.sample([127, 0]);
    time(300);
    expect(prediction.render()!.x).toBeLessThanOrEqual(1036 - sim.player.radius + 1e-9);

    const other = setup();
    other.sim.heroes[1].stats.moveSpeed = 1;
    other.sim.heroes[1].curse = { matrix: [-1, 0, 0, 1], attacksLeft: 3 };
    other.prediction.sample([127, 0]);
    other.time(20);
    expect(other.prediction.render()!.x).toBeCloseTo(other.sim.player.x - 2 * PLAYER_SPEED);
});

test("prediction applies the sled multiplier and the active boss arena", () => {
    const { sim, prediction, time } = setup();
    sim.heroes[1].sledEndTick = 100;
    sim.heroes[1].sledSpeed = 2;
    prediction.sample([127, 0]);
    time(20);
    expect(prediction.render()!.x).toBeCloseTo(sim.player.x + 2 * PLAYER_SPEED);

    const arena = setup();
    Object.defineProperty(arena.sim, "map", {
        value: {
            ...arena.sim.map,
            bossArena: { baseX: 1033, baseY: 1037, size: 1 },
        },
    });
    vi.spyOn(arena.sim, "shownBoss", "get").mockReturnValue({
        def: { boss: { phases: {} } },
    } as Enemy);
    arena.prediction.sample([127, 0]);
    arena.time(300);
    const pose = arena.prediction.render()!;
    expect(pose.x).toBeCloseTo(1034 - arena.sim.player.radius);
    expect(pose.y).toBeCloseTo(1038 - arena.sim.player.radius);
});

test("bounds prediction time and history during a stalled connection", () => {
    const { sim, prediction, time } = setup();
    prediction.sample([127, 0]);
    time(PREDICTION_MS);
    const maximum = sim.player.x + (PREDICTION_MS / 20) * PLAYER_SPEED;
    expect(prediction.render()!.x).toBeCloseTo(maximum);
    time(480);
    // The picture stops at the budget rather than walking on past it.
    const last = prediction.render()!.x;
    expect(last).toBeLessThan(maximum + 0.01);
    expect(prediction.render()!.moving).toBe(false);
    // Stale: it stands where it is, rather than walking back to the
    // confirmed spot and rushing forward again when frames come back.
    for (const now of [501, 900, 1500]) {
        time(now);
        expect(prediction.render()!.x).toBe(last);
        expect(prediction.render()!.moving).toBe(false);
    }

    for (let i = 0; i < 1000; i++) {
        time(1600 + i);
        prediction.sample([i % 2 ? 127 : -127, 0]);
    }
    expect((prediction as unknown as { inputs: unknown[] }).inputs.length).toBeLessThanOrEqual(
        MAX_INPUT_HISTORY,
    );
});

test.each(["frozen", "hold", "down", "left", "menu", "casket", "over"])(
    "eases back to confirmed presentation when %s",
    (reason) => {
        const { sim, prediction, time } = setup();
        prediction.sample([127, 0]);
        time(300);
        const before = prediction.render()!.x;
        if (reason === "frozen") sim.player.frozen = 30;
        if (reason === "hold") {
            sim.player.frozen = 30;
            sim.heroes[1].hold = {} as NonNullable<(typeof sim.heroes)[1]["hold"]>;
        }
        if (reason === "down") sim.heroes[1].down = true;
        if (reason === "left") sim.heroes[1].left = true;
        if (reason === "menu") sim.state = "levelUp";
        if (reason === "casket") sim.state = "chest";
        if (reason === "over") sim.state = "dead";
        time(316);
        const easing = prediction.render()!;
        expect(easing.x).toBeGreaterThan(sim.player.x);
        expect(easing.x).toBeLessThan(before);
        expect(before - easing.x).toBeLessThan(0.25);
        for (let now = 332; now <= 1200; now += 16) {
            time(now);
            prediction.render();
        }
        expect(prediction.render()).toBeUndefined();
    },
);

test("correction crosses a wall when the confirmed position is on its other side", () => {
    const { sim, prediction, time } = setup(true);
    sim.player.x = sim.player.prevX = 1035.6;
    prediction.confirm([]);
    prediction.render();
    // Less than SNAP_DISTANCE, with a thin wall between the two valid positions.
    sim.player.x = sim.player.prevX = 1036.4;
    for (let now = 20; now <= 600; now += 20) {
        time(now);
        prediction.confirm([]);
        prediction.render();
    }
    expect(prediction.render()!.x).toBeCloseTo(sim.player.x, 4);
});

test("100ms frames keep their movement and animation time", () => {
    const { sim, prediction, time } = setup();
    prediction.sample([127, 0]);
    prediction.render();
    time(100);
    const pose = prediction.render()!;
    expect(pose.x).toBeCloseTo(sim.player.x + 5 * PLAYER_SPEED);
    expect(pose.moveTicks).toBeCloseTo(5);
});

test("the newest stop is replayed even when the confirmation lead exceeds the budget", () => {
    const { sim, prediction, time } = setup();
    prediction.sample([127, 0]);
    time(300);
    const before = prediction.render()!.x;
    time(350);
    prediction.sample([0, 0]);
    const stopped = prediction.render()!.x;
    for (let now = 360; now <= 480; now += 20) {
        time(now);
        // Frames keep coming from a host that hasn't moved us yet
        prediction.confirm([]);
        prediction.render();
    }
    expect(stopped).toBeGreaterThanOrEqual(before);
    expect(prediction.render()!.x).toBe(stopped);
    expect(prediction.render()!.moving).toBe(false);
    expect(sim.player.moving).toBe(false);
});

test("periodic input acknowledgments bound clock drift when the host runs slowly", () => {
    let now = 0;
    const heroes = new Map([
        ["p0", 0],
        ["p1", 1],
    ]);
    const host = new CoopRun(
        makeSim(0),
        true,
        {
            sendUp() {},
            sendDown: (message) => guest.receiveDown(message),
        },
        heroes,
        "p0",
        () => now,
    );
    const guest = new CoopRun(
        makeSim(1),
        false,
        {
            sendUp: (message) => host.receiveUp("p1", message),
            sendDown() {},
        },
        heroes,
        "p0",
        () => now,
    );
    host.receiveUp("p1", { loaded: true });
    for (now = 0; now <= 4200; now += 20) {
        guest.setMove(now < 3800 ? 1 : 0, 0);
        // Host simulates at half the real-time rate.
        if (now % 40 === 0) {
            host.stepFrame();
            host.flush(true);
        }
        while (guest.canStep()) guest.stepFrame();
        guest.prediction!.render();
        if (now === 3600) {
            const clock = guest.prediction as unknown as { confirmedAt: number };
            expect(now - clock.confirmedAt).toBeLessThan(MOVE_REFRESH_MS + 40);
        }
    }
    expect(guest.prediction!.render()!.x).toBeCloseTo(guest.sim.player.x, 2);
    expect(syncHash(guest.sim)).toBe(syncHash(host.sim));
});

test("teleports reset prediction instead of smoothing through scenery", () => {
    const { sim, prediction, time } = setup();
    prediction.sample([127, 0]);
    time(100);
    prediction.render();
    sim.player.x += 8;
    sim.player.prevX = sim.player.x;
    prediction.confirm([]);
    expect(prediction.render()!.x).toBe(sim.player.x);
});

test("host echoes the newest coalesced sequence and drops malformed metadata", () => {
    const sim = makeSim(0);
    const host = new CoopRun(
        sim,
        true,
        { sendUp() {}, sendDown() {} },
        new Map([
            ["p0", 0],
            ["p1", 1],
        ]),
        "p0",
    );
    host.receiveUp("p1", { move: [127, 0], moveSeq: 1 });
    host.receiveUp("p1", { move: [0, 127], moveSeq: 3 });
    expect(host.stepFrame()[0]).toMatchObject({ hero: 1, move: [0, 127], moveSeq: 3 });
    expect(host.prediction).toBeUndefined();
    expect(
        cleanFrameEvent({ frame: 1, hero: 1, move: [127, 0], moveSeq: Infinity }, 2),
    ).not.toHaveProperty("moveSeq");
    expect(
        cleanFrameEvent({ frame: 1, hero: 1, move: [127, 0], moveSeq: -1 }, 2),
    ).not.toHaveProperty("moveSeq");
});

test("a direction changed back inside the send throttle still gets acknowledged", () => {
    let now = 0;
    const messages: { move?: [number, number]; moveSeq?: number }[] = [];
    const guest = new CoopRun(
        makeSim(),
        false,
        {
            sendUp: (message) => messages.push(message as (typeof messages)[number]),
            sendDown() {},
        },
        new Map([
            ["p0", 0],
            ["p1", 1],
        ]),
        "p0",
        () => now,
    );
    guest.setMove(1, 0);
    now = 20;
    // A stick eased off the same way is still coalesced by the ordinary throttle
    guest.setMove(0.5, 0);
    now = 40;
    guest.setMove(1, 0);
    expect(messages).toHaveLength(1);
    now = 80;
    guest.setMove(1, 0);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ move: [127, 0], moveSeq: 3 });
});

test.each([true, false])("short taps and reversals send promptly (prediction: %s)", (on) => {
    let now = 0;
    const messages: { at: number; move?: [number, number] }[] = [];
    const guest = new CoopRun(
        makeSim(),
        false,
        { sendUp: (message) => messages.push({ at: now, ...message }), sendDown() {} },
        new Map([
            ["p0", 0],
            ["p1", 1],
        ]),
        "p0",
        () => now,
    );
    guest.setPrediction(on);
    guest.setMove(1, 0);
    now = 20;
    guest.setMove(0, 0);
    now = 30;
    guest.setMove(-1, 0);
    now = 40;
    guest.setMove(0, 0);
    expect(messages.map(({ at, move }) => [at, move])).toEqual([
        [0, [127, 0]],
        [20, [0, 0]],
        [30, [-127, 0]],
        [40, [0, 0]],
    ]);
    now = 300;
    guest.setMove(1, 0);
    now = 320;
    guest.setMove(-1, 0);
    expect(messages.at(-1)).toMatchObject({ at: 320, move: [-127, 0] });
    now = 500;
    guest.setMove(1, 0);
    now = 520;
    guest.setMove(0, 1);
    expect(messages.at(-1)).toMatchObject({ at: 520, move: [0, 127] });
    now = 700;
    guest.setMove(0.6, 0.8);
    now = 720;
    guest.setMove(-0.6, 0.8);
    expect(messages.at(-1)).toMatchObject({ at: 720, move: [-76, 102] });
    // Pressing a second key while running (east to northeast)
    now = 900;
    guest.setMove(1, 0);
    now = 920;
    guest.setMove(Math.SQRT1_2, Math.SQRT1_2);
    expect(messages.at(-1)).toMatchObject({ at: 920, move: [90, 90] });
});

test.each([true, false])(
    "rapid taps and reversals stay below the relay limit (prediction: %s)",
    (on) => {
        let now = 0;
        const messages: number[] = [];
        const guest = new CoopRun(
            makeSim(),
            false,
            { sendUp: () => messages.push(now), sendDown() {} },
            new Map([
                ["p0", 0],
                ["p1", 1],
            ]),
            "p0",
            () => now,
        );
        guest.setPrediction(on);
        const turns = [
            [1, 0],
            [0, 1],
            [-1, 0],
            [0, -1],
        ];
        // A second key pressed and let go, then everything let go
        const keys = [
            [1, 0],
            [Math.SQRT1_2, Math.SQRT1_2],
            [0, 0],
        ];
        for (now = 0; now < 9000; now++) {
            if (now < 3000) guest.setMove([1, 0, -1, 0][now % 4], 0);
            else if (now < 6000) guest.setMove(turns[now % 4][0], turns[now % 4][1]);
            else guest.setMove(keys[now % 3][0], keys[now % 3][1]);
        }
        for (const at of messages) {
            expect(
                messages.filter((time) => time >= at && time < at + 1000).length,
            ).toBeLessThanOrEqual(36);
        }
        now = 9000;
        guest.setMove(0, 0);
        guest.resumed();
        guest.setMove(0, 0);
        expect(messages.at(-1)).toBe(9000);
    },
);

test.each([false, true])(
    "delayed starts, stops and reversals preserve confirmed hashes (jitter: %s)",
    (jitter) => {
        usePortableMath(true);
        let now = 0;
        const deliveries: { at: number; fn: () => void }[] = [];
        const lastDelivery = [0, 0];
        let sent = 0;
        const send = (channel: number, fn: () => void) => {
            const delay = jitter ? 80 + ((sent++ * 17) % 5) * 20 : 120;
            const at = Math.max(now + delay, lastDelivery[channel]);
            lastDelivery[channel] = at;
            deliveries.push({ at, fn });
        };
        const heroes = new Map([
            ["p0", 0],
            ["p1", 1],
        ]);
        const host = new CoopRun(
            makeSim(0),
            true,
            {
                sendUp() {},
                sendDown: (message) => send(0, () => guest.receiveDown(message)),
            },
            heroes,
            "p0",
            () => now,
        );
        const guest = new CoopRun(
            makeSim(1),
            false,
            {
                sendUp: (message) => send(1, () => host.receiveUp("p1", message)),
                sendDown() {},
            },
            heroes,
            "p0",
            () => now,
        );
        host.receiveUp("p1", { loaded: true });
        const hashes = new Map<number, number>();
        let firstPose = 0;
        let stoppedPose = 0;
        let beforeReverse = 0;
        for (now = 0; now <= 2000; now += 20) {
            for (let i = 0; i < deliveries.length; ) {
                if (deliveries[i].at <= now) deliveries.splice(i, 1)[0].fn();
                else i++;
            }
            const move = now >= 300 && now < 700 ? 1 : now >= 1100 && now < 1400 ? -1 : 0;
            guest.setMove(move, 0);
            host.stepFrame();
            hashes.set(host.frame, syncHash(host.sim));
            host.flush();
            while (guest.canStep()) {
                guest.stepFrame();
                expect(syncHash(guest.sim)).toBe(hashes.get(guest.frame));
            }
            const state = JSON.stringify(guest.sim.heroes.map((hero) => hero.player));
            const pose = guest.prediction!.render();
            expect(JSON.stringify(guest.sim.heroes.map((hero) => hero.player))).toBe(state);
            if (now === 300) firstPose = pose!.x;
            if (now === 340) {
                expect(pose!.x).toBeGreaterThan(firstPose + PLAYER_SPEED);
                expect(guest.sim.player.x).toBeCloseTo(firstPose);
            }
            if (now === 700) stoppedPose = pose!.x;
            if (now === 800)
                expect(Math.abs(pose!.x - stoppedPose)).toBeLessThan(jitter ? 0.2 : 0.05);
            if (now === 1100) beforeReverse = pose!.x;
            if (now === 1140) expect(pose!.x).toBeLessThan(beforeReverse - PLAYER_SPEED);
            if (now === 2000) expect(pose!.x).toBeCloseTo(guest.sim.player.x, 2);
        }
        expect(guest.desynced).toBe(false);
    },
);

// A host and guest whose messages each take delay(up) ms, in order on each
// side, with nothing getting through while cut() is true.
function link(delay: (up: boolean) => number, cut = () => false) {
    let now = 0;
    const deliveries: { at: number; fn: () => void }[] = [];
    const lastDelivery = [0, 0];
    const send = (channel: number, fn: () => void) => {
        if (cut()) return;
        const at = Math.max(now + delay(channel === 1), lastDelivery[channel]);
        lastDelivery[channel] = at;
        if (at <= now) fn();
        else deliveries.push({ at, fn });
    };
    const heroes = new Map([
        ["p0", 0],
        ["p1", 1],
    ]);
    const host: CoopRun = new CoopRun(
        makeSim(0),
        true,
        { sendUp() {}, sendDown: (message) => send(0, () => guest.receiveDown(message)) },
        heroes,
        "p0",
        () => now,
    );
    const guest: CoopRun = new CoopRun(
        makeSim(1),
        false,
        { sendUp: (message) => send(1, () => host.receiveUp("p1", message)), sendDown() {} },
        heroes,
        "p0",
        () => now,
    );
    host.receiveUp("p1", { loaded: true });
    // One render: deliveries, the guest's input, host ticks, then guest catch-up
    const frame = (at: number, move: number | [number, number], hostSteps = 1) => {
        now = at;
        for (let i = 0; i < deliveries.length; ) {
            if (deliveries[i].at <= now) deliveries.splice(i, 1)[0].fn();
            else i++;
        }
        if (typeof move === "number") guest.setMove(move, 0);
        else guest.setMove(...move);
        for (let i = 0; i < hostSteps; i++) host.stepFrame();
        host.flush();
        while (guest.canStep()) guest.stepFrame();
        return getPlayerPose(guest.sim, 1, 1, guest.prediction!.render());
    };
    return { host, guest, frame };
}

test.each(
    [0, 60, 120].flatMap((delay) =>
        [0, 10].flatMap((phase) =>
            [
                { from: [0, 1], to: [1, 0] },
                { from: [1, 0], to: [0, 1] },
                { from: [0, -1], to: [-1, 0] },
                { from: [-1, 0], to: [0, -1] },
                { from: [Math.SQRT1_2, Math.SQRT1_2], to: [1, 0] },
                { from: [-Math.SQRT1_2, -Math.SQRT1_2], to: [0, -1] },
                // A second key pressed while running
                { from: [1, 0], to: [Math.SQRT1_2, Math.SQRT1_2] },
                { from: [0, -1], to: [-Math.SQRT1_2, -Math.SQRT1_2] },
            ].map(({ from, to }) => ({ delay, phase, from, to })),
        ),
    ),
)(
    "a continuous turn after a held refresh avoids sideways drift ($from -> $to, delay $delay, phase $phase)",
    ({ delay, phase, from, to }) => {
        const { guest, frame } = link(() => delay);
        let across = 0;
        let lastAcross = 0;
        let maxDrift = 0;
        for (let now = 0; now <= 1200; now += 10) {
            // The held input refresh goes at 300 + phase. Turning just after it
            // mustn't keep the old axis moving on the host until the throttle ends.
            const move = now < 100 + phase ? [0, 0] : now < 320 + phase ? from : to;
            const pose = frame(now, move as [number, number], now % 20 === 0 ? 1 : 0);
            const perpendicular = pose.x * -to[1] + pose.y * to[0];
            lastAcross = perpendicular;
            if (now === 320 + phase) across = perpendicular;
            if (now > 320 + phase) maxDrift = Math.max(maxDrift, Math.abs(perpendicular - across));
        }
        // Host tick quantization can differ by half a tick; the send throttle
        // mustn't add several ticks of movement on the released axis.
        expect(maxDrift).toBeLessThanOrEqual(PLAYER_SPEED / 2 + 1e-6);
        // Still converge to the host's line, rather than hiding a lasting offset.
        const confirmedAcross = guest.sim.player.x * -to[1] + guest.sim.player.y * to[0];
        expect(Math.abs(lastAcross - confirmedAcross)).toBeLessThan(0.001);
        expect(guest.desynced).toBe(false);
    },
);

test.each([0, 60, 120, 250].flatMap((delay) => [0, 10].map((phase) => ({ delay, phase }))))(
    "a short tap has no idle slide (delay: $delay ms, input phase: $phase ms)",
    ({ delay, phase }) => {
        const { guest, frame } = link(() => delay);
        let stopped = 0;
        for (let now = 0; now <= 1000; now += 10) {
            const pose = frame(
                now,
                now >= 300 + phase && now < 320 + phase ? 1 : 0,
                now % 20 === 0 ? 1 : 0,
            );
            if (now === 320 + phase) stopped = pose.x;
            if (now > 320 + phase) {
                expect(pose.moving).toBe(false);
                expect(pose.x).toBeCloseTo(stopped, 8);
            }
        }
        expect(Math.abs(stopped - guest.sim.player.x)).toBeLessThan(0.1);
        expect(guest.desynced).toBe(false);
    },
);

test.each([0, 60, 120].flatMap((delay) => [0, 10].map((phase) => ({ delay, phase }))))(
    "a quick reversal settles without idle sliding (delay: $delay ms, input phase: $phase ms)",
    ({ delay, phase }) => {
        const { guest, frame } = link(() => delay);
        let stopped = 0;
        let turned = 0;
        for (let now = 0; now <= 1000; now += 10) {
            const move =
                now >= 300 + phase && now < 320 + phase
                    ? 1
                    : now >= 320 + phase && now < 400 + phase
                      ? -1
                      : 0;
            const pose = frame(now, move, now % 20 === 0 ? 1 : 0);
            if (now === 320 + phase) turned = pose.x;
            if (now === 360 + phase) expect(pose.x).toBeLessThan(turned);
            if (now === 400 + phase) stopped = pose.x;
            if (now > 400 + phase) expect(pose.x).toBeCloseTo(stopped, 8);
        }
        expect(Math.abs(stopped - guest.sim.player.x)).toBeLessThan(0.1);
        expect(guest.desynced).toBe(false);
    },
);

test("diagnostics separate send delay from confirmation delay, counting each echo once", () => {
    const { prediction, time } = setup();
    expect(prediction.getDiagnostics()).toBeUndefined();
    prediction.setDiagnostics(true);
    const seq = prediction.sample([127, 0]);
    time(50);
    prediction.sent(seq);
    time(70);
    prediction.sent(seq);
    time(150);
    const echo = { frame: 1, hero: 1, move: [127, 0] as [number, number], moveSeq: seq };
    prediction.confirm([echo]);
    prediction.confirm([echo]);
    const capture = prediction.getDiagnostics()!;
    expect(capture.inputToSendMs).toEqual({ count: 1, mean: 50, max: 50 });
    expect(capture.sendToConfirmMs).toEqual({ count: 1, mean: 100, max: 100 });
    expect(capture.inputToConfirmMs).toEqual({ count: 1, mean: 150, max: 150 });
    prediction.setDiagnostics(true);
    expect(prediction.getDiagnostics()!.inputToSendMs.count).toBe(0);
    prediction.setDiagnostics(false);
    expect(prediction.getDiagnostics()).toBeUndefined();
});

test("diagnostic capture is bounded and changes neither poses nor confirmed state", () => {
    usePortableMath(true);
    const measured = link(() => 60);
    const plain = link(() => 60);
    measured.guest.prediction!.setDiagnostics(true);
    let first = measured.guest.prediction!.getDiagnostics()!;
    for (let now = 0; now <= 8000; now += 20) {
        const move = now % 800 < 200 ? 1 : now % 800 < 400 ? -1 : 0;
        const pose = measured.frame(now, move);
        expect(pose).toEqual(plain.frame(now, move));
        expect(syncHash(measured.guest.sim)).toBe(syncHash(plain.guest.sim));
        expect(syncHash(measured.host.sim)).toBe(syncHash(plain.host.sim));
        if (now === 1000) first = measured.guest.prediction!.getDiagnostics()!;
    }
    const capture = measured.guest.prediction!.getDiagnostics()!;
    expect(capture.samples).toHaveLength(64);
    expect(capture.samples[0].atMs).toBeGreaterThan(1000);
    // Taken a sample interval apart, from the first host frame
    expect(first.samples.at(-1)!.atMs).toBeGreaterThan(900);
    expect(first.samples.at(-1)!.atMs).toBeLessThanOrEqual(1000);
    expect(capture.inputToSendMs.max).toBe(0);
    expect(capture.sendToConfirmMs.mean).toBe(120);
    expect(capture.pendingStopFrames).toBeGreaterThan(0);
    expect(capture.idleCorrectionTiles).toBe(0);
    expect(capture.longRenderFrames).toBe(0);
});

test("diagnostics measure actual stationary corrections and render stalls", () => {
    const { sim, prediction, time } = setup();
    prediction.setDiagnostics(true);
    prediction.render();
    sim.player.x += 0.5;
    prediction.confirm([]);
    time(100);
    const pose = prediction.render()!;
    const capture = prediction.getDiagnostics()!;
    expect(capture.errorTiles.max).toBeCloseTo(0.5);
    expect(capture.idleCorrectionTiles).toBeCloseTo(pose.x - 1033.5);
    expect(capture.longRenderFrames).toBe(1);
    time(700);
    prediction.render();
    expect(prediction.getDiagnostics()!.stalledFrames).toBe(1);
});

test("diagnostics leave out the wait for the first host frame", () => {
    let now = 0;
    const sim = makeSim();
    const prediction = new MovementPrediction(sim, () => now);
    prediction.setDiagnostics(true);
    for (now = 0; now < 5000; now += 10) prediction.render();
    for (now = 5000; now < 6000; now += 20) {
        sim.tick++;
        prediction.confirm([]);
        prediction.render();
    }
    const capture = prediction.getDiagnostics()!;
    expect(capture.renderGapMs.count).toBe(50);
    expect(capture.leadMs.max).toBeLessThanOrEqual(20);
    expect(capture.confirmedAgeMs.max).toBe(0);
});

test("diagnostics don't count a reconnect's resend as send delay", () => {
    let now = 0;
    const guest = new CoopRun(
        makeSim(),
        false,
        { sendUp() {}, sendDown() {} },
        new Map([
            ["p0", 0],
            ["p1", 1],
        ]),
        "p0",
        () => now,
    );
    guest.setMove(1, 0);
    now = 20;
    guest.setMove(0, 0);
    now = 5000;
    guest.prediction!.setDiagnostics(true);
    // The stop goes again, but it was sampled and sent before the capture
    guest.resumed();
    guest.setMove(0, 0);
    now = 5100;
    guest.setMove(1, 0);
    expect(guest.prediction!.getDiagnostics()!.inputToSendMs).toEqual({
        count: 1,
        mean: 0,
        max: 0,
    });
});

test("echoes of a held move a tick early or late leave the walk steady", () => {
    let sent = 0;
    // Each refresh's echo comes back a tick sooner or later than the last.
    const { frame } = link((up) => (up && sent++ % 2 ? 80 : 60));
    let last = 0;
    for (let now = 0; now <= 2000; now += 20) {
        const x = frame(now, now >= 200 ? 1 : 0).x;
        if (now > 1000) expect(Math.abs(x - last - PLAYER_SPEED)).toBeLessThan(PLAYER_SPEED * 0.05);
        last = x;
    }
});

test("standing still, a small error stays rather than creeping, and walking takes it out", () => {
    let late = false;
    // The stop takes a tick longer to reach the host than the start did.
    const { guest, frame } = link(() => (late ? 80 : 60));
    let stopped = 0;
    for (let now = 0; now <= 1400; now += 20) {
        late = now >= 500;
        const pose = frame(now, now >= 100 && now < 500 ? 1 : 0);
        if (now === 500) stopped = pose.x;
        if (now > 500) expect(pose.x).toBe(stopped);
    }
    const error = Math.abs(stopped - guest.sim.player.x);
    expect(error).toBeGreaterThan(PLAYER_SPEED / 2);
    expect(error).toBeLessThan(0.1);
    for (let now = 1420; now <= 2000; now += 20) frame(now, now < 1800 ? 1 : 0);
    expect(frame(2020, 0).x).toBeCloseTo(guest.sim.player.x, 2);
});

test("after a dropped connection, the hero stands, then glides to the resent frames", () => {
    let now = 0;
    const { guest, frame } = link(
        () => 60,
        () => now >= 1000 && now < 2000,
    );
    let last = 0;
    let largest = 0;
    let stopped = 0;
    let resumed = false;
    for (now = 0; now <= 3000; now += 20) {
        if (now >= 2000 && !resumed) {
            resumed = true;
            guest.resumed();
        }
        const pose = frame(now, now >= 100 && now < 2600 ? 1 : 0);
        // Never back towards the last confirmed spot, then forward again
        if (now > 100) expect(pose.x).toBeGreaterThanOrEqual(last - 1e-9);
        if (now >= 1700 && now < 2000) {
            expect(pose.x).toBe(last);
            expect(pose.moving).toBe(false);
        }
        if (now === 2600) stopped = pose.x;
        // And no sliding on after the stop
        if (now > 2600) expect(pose.x).toBe(stopped);
        if (now > 100) largest = Math.max(largest, pose.x - last);
        last = pose.x;
    }
    // The host walked the hero on meanwhile: well past a snap, but glided
    // over several frames
    expect(guest.sim.player.x - 1033.5).toBeGreaterThan(5);
    expect(largest).toBeLessThan(1);
    // Walking, the picture can trail the host by a tick or two (an echo only
    // re-times it past DRIFT_MS). Standing, that stays inside DEAD_ZONE.
    expect(Math.abs(last - guest.sim.player.x)).toBeLessThan(0.1);
    expect(guest.desynced).toBe(false);
});

test("frames pausing before a stop reaches the host don't pull the hero back", () => {
    // Slow enough that the lead passes PREDICTION_MS while walking
    const { guest, frame } = link(() => 250);
    let last = 0;
    for (let now = 0; now <= 3000; now += 20) {
        // The host stops for a moment, as a busy machine's can, then makes up
        // the frames it missed
        const steps = now >= 1500 && now < 1900 ? 0 : now === 1900 ? 21 : 1;
        const x = frame(now, now >= 200 && now < 1500 ? 1 : 0, steps).x;
        // Until the host's frames have the stop. Then where it left us is
        // known, and settling there is right, back or not.
        if (now > 1500 && guest.sim.player.moving) {
            expect(x).toBeGreaterThanOrEqual(last - 1e-9);
        }
        last = x;
    }
    expect(last).toBeCloseTo(guest.sim.player.x, 2);
});
