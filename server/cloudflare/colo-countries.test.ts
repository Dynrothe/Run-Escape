import { coloCountries } from "./scripts/colo-countries.mjs";
import committed from "./src/colo-countries.json";
import { currentCountry } from "./src/shared.mjs";

describe("Cloudflare colo countries", () => {
    it("generates current country codes, not the old codes DisplayNames also names", () => {
        const components = [
            "London, United Kingdom - (LHR)",
            "Manchester, United Kingdom - (MAN)",
            "Paris, France - (CDG)",
            "Belgrade, Serbia - (BEG)",
            "Moscow, Russia - (DME)",
            "Ouagadougou, Burkina Faso - (OUA)",
            "Kinshasa, Congo - Kinshasa - (FIH)",
            "Hong Kong - (HKG)",
            "Data Loss Prevention (DLP)",
        ].map((name) => ({ name }));
        expect(coloCountries(components)).toEqual({
            BEG: "RS",
            CDG: "FR",
            DME: "RU",
            FIH: "CD",
            HKG: "HK",
            LHR: "GB",
            MAN: "GB",
            OUA: "BF",
        });
    });

    it("stops at a place it can't name", () => {
        expect(() => coloCountries([{ name: "Atlantis - (ATL)" }])).toThrow(/Atlantis/);
    });

    it("has only current codes in the committed table", () => {
        const old = Object.entries(committed).filter(([, code]) => currentCountry(code) !== code);
        expect(old).toEqual([]);
    });

    it("names a country by its current code", () => {
        expect(currentCountry("UK")).toBe("GB");
        expect(currentCountry("FX")).toBe("FR");
        expect(currentCountry("SU")).toBe("RU");
        expect(currentCountry("GB")).toBe("GB");
        expect(currentCountry("?")).toBe("?");
        expect(currentCountry(undefined)).toBeUndefined();
    });
});
