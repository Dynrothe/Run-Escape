let lookup: typeof import("./src/location.mjs").roomLocation;
let fetching: ReturnType<typeof vi.fn>;

function responses(colo = "EWR") {
    fetching.mockResolvedValue(new Response(`loc=FI\ncolo=${colo}\n`));
}

describe("Cloudflare room location measurement", () => {
    beforeEach(async () => {
        vi.resetModules();
        vi.useFakeTimers();
        fetching = vi.fn();
        vi.stubGlobal("fetch", fetching);
        lookup = (await import("./src/location.mjs")).roomLocation;
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("maps the measured colo to country instead of using trace IP country", async () => {
        responses();
        expect(await lookup()).toEqual({ colo: "EWR", country: "US" });
        expect(fetching.mock.calls.map(([url]) => url)).toEqual([
            "https://www.cloudflare.com/cdn-cgi/trace",
        ]);
        for (const [, options] of fetching.mock.calls) {
            expect(options.signal).toBeInstanceOf(AbortSignal);
            expect(options.redirect).toBe("error");
        }
    });

    it("shares concurrent and cached lookups, then refreshes after an hour", async () => {
        responses();
        expect(await Promise.all([lookup(), lookup(), lookup()])).toEqual(
            Array(3).fill({ colo: "EWR", country: "US" }),
        );
        expect(fetching).toHaveBeenCalledTimes(1);
        await lookup();
        expect(fetching).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(60 * 60_000);
        responses("ARN");
        expect(await lookup()).toEqual({ colo: "ARN", country: "SE" });
        expect(fetching).toHaveBeenCalledTimes(2);
    });

    it("returns unknown for failures and limits retries", async () => {
        fetching.mockRejectedValue(new Error("offline"));
        expect(await lookup()).toBeUndefined();
        responses();
        expect(await lookup()).toBeUndefined();
        expect(fetching).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(60_000);
        expect(await lookup()).toEqual({ colo: "EWR", country: "US" });
    });

    it.each(["loc=FI\n", "colo=ZZZ\n", "colo=ewr\n", "colo=EWR extra\n"])(
        "leaves malformed or unmapped locations blank: %s",
        async (trace) => {
            fetching.mockResolvedValue(new Response(trace));
            expect(await lookup()).toBeUndefined();
        },
    );

    it("aborts stalled lookups with a three-second deadline and returns unknown", async () => {
        const controller = new AbortController();
        const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
        fetching.mockImplementation(
            (_url: string, { signal }: RequestInit) =>
                new Promise((_resolve, reject) => {
                    signal?.addEventListener("abort", () => reject(new Error("timeout")), {
                        once: true,
                    });
                }),
        );
        const pending = lookup();
        expect(timeout).toHaveBeenCalledWith(3000);
        controller.abort();
        expect(await pending).toBeUndefined();
    });

    it("doesn't use an HTTP error response as a location", async () => {
        fetching.mockResolvedValue(new Response("colo=EWR\nloc=US\n", { status: 403 }));
        expect(await lookup()).toBeUndefined();
    });
});
