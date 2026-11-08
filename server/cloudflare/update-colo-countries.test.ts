import { writeFile } from "node:fs/promises";

vi.mock("node:fs/promises", () => ({ writeFile: vi.fn(async () => {}) }));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it("generates canonical country codes instead of later DisplayNames aliases", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
            Response.json({
                components: [
                    { name: "London, United Kingdom - (LHR)" },
                    { name: "Manchester, United Kingdom - (MAN)" },
                    { name: "Paris, France - (CDG)" },
                    { name: "Belgrade, Serbia - (BEG)" },
                    { name: "Moscow, Russia - (DME)" },
                    { name: "Ouagadougou, Burkina Faso - (OUA)" },
                ],
            }),
        ),
    );

    await import("./scripts/update-colo-countries.mjs");

    expect(writeFile).toHaveBeenCalledOnce();
    const [, data] = vi.mocked(writeFile).mock.calls[0];
    expect(JSON.parse(data as string)).toEqual({
        BEG: "RS",
        CDG: "FR",
        DME: "RU",
        LHR: "GB",
        MAN: "GB",
        OUA: "BF",
    });
});
