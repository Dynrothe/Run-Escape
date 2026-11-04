import { runAnalyticsUrl } from "../../util/runAnalyticsUrl";
import { getEnemy } from "../content/enemies";
import { emptyStats } from "../content/types";
import { Sim } from "../core/Sim";
import { makeGrid } from "../core/world/testGrid";
import { startRunAnalytics } from "./RunAnalytics";

const endpoint = "https://collector.example/v1/runs";
const makeSim = (size = 1, extra: Partial<ConstructorParameters<typeof Sim>[0]> = {}) =>
    new Sim({
        grid: makeGrid(Array(30).fill(".".repeat(30)), 1000, 1000),
        spawnX: 1015,
        spawnY: 1015,
        seed: 1,
        characterId: "warrior",
        metaStats: emptyStats(),
        party: Array.from({ length: size }, (_, i) => ({
            name: `Private name ${i}`,
            characterId: "warrior",
            metaStats: emptyStats(),
        })),
        ...extra,
    });
const mockFetch = () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", send);
    return send;
};
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

it("accepts only explicit collector endpoints, with HTTP restricted to local development", () => {
    expect(runAnalyticsUrl(endpoint)).toBe(endpoint);
    expect(runAnalyticsUrl("http://localhost:8787/v1/runs")).toBe("http://localhost:8787/v1/runs");
    for (const url of [
        "",
        "not a url",
        "http://example.org/v1/runs",
        "https://user:secret@example.org/v1/runs",
        endpoint + "?token=x",
        endpoint + "/other",
    ]) {
        expect(runAnalyticsUrl(url)).toBeUndefined();
    }
});

it.each(["node", "cloudflare"] as const)(
    "the %s host sends one anonymous party result, including all heroes' damage",
    async (relay) => {
        const send = mockFetch();
        const sim = makeSim(3);
        const finish = startRunAnalytics(sim, { isHost: true, relay }, endpoint)!;
        expect(startRunAnalytics(sim, { isHost: false, relay }, endpoint)).toBeUndefined();
        sim.tick = 1000;
        sim.kills = 7;
        sim["apply"]({ kind: "coins", amount: 50 });
        for (const hero of sim.heroes) {
            hero.damageBySource.other = 100;
            hero.revivesLeft = 0;
            sim.as(hero.index, () => sim["damagePlayer"](99999, "goblin", false));
        }
        await finish("abandoned");
        await finish("abandoned");
        expect(send).toHaveBeenCalledTimes(1);
        const [url, init] = send.mock.calls[0];
        expect(url).toBe(endpoint);
        expect(init).toMatchObject({
            credentials: "omit",
            referrerPolicy: "no-referrer",
            redirect: "error",
        });
        expect(init!.body).not.toContain("Private name");
        expect(JSON.parse(init!.body as string)).toMatchObject({
            playType: "multiplayer",
            relay,
            partySize: 3,
            outcome: "failed",
            kills: 7,
            coins: 50,
            damageDealt: 300,
            durationSeconds: 20,
            playersLeft: 0,
        });
    },
);

it("separates voluntary exits and departures from actual deaths and keeps the starting size", async () => {
    const send = mockFetch();
    const sim = makeSim(2);
    const finish = startRunAnalytics(sim, { isHost: true, relay: "node" }, endpoint)!;
    sim.heroes[0].revivesLeft = 0;
    sim.as(0, () => sim["damagePlayer"](99999, "goblin", false));
    sim.leave(1);
    expect(sim.state).toBe("dead");
    await finish("abandoned");
    expect(JSON.parse(send.mock.calls[0][1]!.body as string)).toMatchObject({
        outcome: "abandoned",
        partySize: 2,
        playersLeft: 1,
    });
});

it("counts coins earned even when the party spends them before reporting", async () => {
    const send = mockFetch();
    const sim = makeSim();
    const finish = startRunAnalytics(sim, undefined, endpoint)!;
    sim["apply"]({ kind: "coins", amount: 50 });
    sim.stash("antique_lamp");
    sim.useItem(0);
    expect(sim.skip()).toBe(true);
    expect(sim.coins).toBe(25);
    await finish("abandoned");
    expect(JSON.parse(send.mock.calls[0][1]!.body as string).coins).toBe(50);
});

it("records a final boss victory, and singleplayer endless and expert stats", async () => {
    const send = mockFetch();
    const win = makeSim();
    const boss = win.spawnEnemy(getEnemy("wise_old_man"), "finalBoss", { x: 1016, y: 1015 })!;
    win.damageEnemy(boss, 1e9, 0, boss.x, boss.y);
    await startRunAnalytics(win, undefined, endpoint)!("abandoned");
    await startRunAnalytics(makeSim(1, { endless: true, hard: true }), undefined, endpoint)!(
        "abandoned",
    );
    await startRunAnalytics(
        makeSim(1, { mapId: "theatre_of_blood", expert: true, hard: true }),
        undefined,
        endpoint,
    )!("disconnected");
    const reports = send.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(new Set(reports.map((report) => report.runId)).size).toBe(3);
    expect(reports[0]).toMatchObject({
        outcome: "completed",
        playType: "singleplayer",
        relay: "none",
        partySize: 1,
    });
    expect(reports[1]).toMatchObject({ outcome: "abandoned", endless: true, mode: "hard" });
    expect(reports[2]).toMatchObject({
        outcome: "disconnected",
        mode: "expert",
        mapId: "theatre_of_blood",
    });
});

it("retries a transient failure with the identical body and UUID", async () => {
    vi.useFakeTimers();
    const send = mockFetch().mockRejectedValueOnce(new Error("response lost"));
    const pending = startRunAnalytics(makeSim(), undefined, endpoint)!("abandoned");
    await vi.advanceTimersByTimeAsync(750);
    await pending;
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1]!.body).toEqual(send.mock.calls[1][1]!.body);
    expect(startRunAnalytics(makeSim(), undefined, "")).toBeUndefined();
    expect(
        startRunAnalytics(makeSim(1, { testing: { maxLevelUps: true } }), undefined, endpoint),
    ).toBeUndefined();
});
