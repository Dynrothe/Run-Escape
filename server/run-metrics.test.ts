import { MAPS, RAID_MAPS } from "../src/game/content/maps";
import { RUN_METRIC_MAPS, startRunMetrics, takeRunResult } from "./run-metrics.mjs";

const game = { mapId: "lumbridge", endless: false, hard: false };
const room = (size = 2) => ({ ...game, started: true, members: Array(size).fill({}) });

describe("run metric dimensions", () => {
    it("names every non-endless map, including seasonal, boss fights and raids", () => {
        expect([...RUN_METRIC_MAPS].sort()).toEqual(
            [...MAPS, ...RAID_MAPS].map((m) => m.id).sort(),
        );
    });

    it.each([2, 3, 4])("freezes the starting party of %i", (size) => {
        const current = room(size);
        const run = startRunMetrics(current, game);
        current.members.pop();
        current.mapId = "barrows";
        expect(run).toEqual({ map: "lumbridge", partySize: size, difficulty: "normal" });
    });

    it("excludes solo, endless and mismatched or missing start settings", () => {
        expect(startRunMetrics(room(1), game)).toBeUndefined();
        expect(startRunMetrics(room(5), game)).toBeUndefined();
        expect(
            startRunMetrics({ ...room(), endless: true }, { ...game, endless: true }),
        ).toBeUndefined();
        for (const value of [
            undefined,
            {},
            { ...game, endless: true },
            { ...game, hard: true },
            { ...game, mapId: "barrows" },
        ]) {
            expect(startRunMetrics(room(), value)).toBeUndefined();
        }
    });

    it("folds arbitrary map ids into one bounded label", () => {
        for (const mapId of ['bad"\\\nmap', "__proto__", "custom-123"]) {
            expect(startRunMetrics({ ...room(), mapId }, { ...game, mapId })?.map).toBe("unknown");
        }
    });

    it("consumes only a valid terminal result in an active run, once", () => {
        const current = { ...room(), runMetrics: startRunMetrics(room(), game) };
        for (const value of [undefined, "dead", "give_up", {}, true]) {
            expect(takeRunResult(current, value)).toBeUndefined();
        }
        current.started = false;
        expect(takeRunResult(current, "failed")).toBeUndefined();
        current.started = true;
        expect(takeRunResult(current, "completed")?.outcome).toBe("completed");
        expect(takeRunResult(current, "failed")).toBeUndefined();
        expect(takeRunResult(current, "completed")).toBeUndefined();
    });
});
