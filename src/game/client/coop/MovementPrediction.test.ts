import { emptyStats } from "../../content/types";
import { PLAYER_SPEED, Sim } from "../../core/Sim";
import { usePortableMath } from "../../core/fmath";
import { cleanFrameEvent, syncHash } from "../../core/lockstep";
import { makeGrid } from "../../core/world/testGrid";
import { getPlayerPose } from "../PlayerPose";
import { CoopRun } from "./CoopRun";
import { MAX_INPUT_HISTORY, MovementPrediction, PREDICTION_MS } from "./MovementPrediction";

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

test("bounds prediction time and history during a stalled connection", () => {
    const { sim, prediction, time } = setup();
    prediction.sample([127, 0]);
    time(PREDICTION_MS);
    const maximum = sim.player.x + (PREDICTION_MS / 20) * PLAYER_SPEED;
    expect(prediction.render()!.x).toBeCloseTo(maximum);
    time(480);
    expect(prediction.render()!.x).toBeCloseTo(maximum);
    time(501);
    expect(prediction.render()).toBeUndefined();

    for (let i = 0; i < 1000; i++) {
        time(600 + i);
        prediction.sample([i % 2 ? 127 : -127, 0]);
    }
    expect((prediction as unknown as { inputs: unknown[] }).inputs.length).toBeLessThanOrEqual(
        MAX_INPUT_HISTORY,
    );
});

test.each(["frozen", "down", "left", "menu", "over"])(
    "falls back to confirmed presentation when %s",
    (reason) => {
        const { sim, prediction, time } = setup();
        prediction.sample([127, 0]);
        time(100);
        expect(prediction.render()).toBeDefined();
        if (reason === "frozen") sim.player.frozen = 30;
        if (reason === "down") sim.heroes[1].down = true;
        if (reason === "left") sim.heroes[1].left = true;
        if (reason === "menu") sim.state = "levelUp";
        if (reason === "over") sim.state = "dead";
        expect(prediction.render()).toBeUndefined();
    },
);

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
    guest.setMove(0, 1);
    now = 40;
    guest.setMove(1, 0);
    expect(messages).toHaveLength(1);
    now = 80;
    guest.setMove(1, 0);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ move: [127, 0], moveSeq: 3 });
});

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
