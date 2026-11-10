import { countryCode, currentCountry } from "../src/shared.mjs";

// Countries by the English names the status page uses
function countriesByName() {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    const countries = new Map();
    for (let first = 65; first <= 90; first++) {
        for (let second = 65; second <= 90; second++) {
            const code = String.fromCharCode(first, second);
            // DisplayNames names old codes too (UK is "United Kingdom", like
            // GB), and the later one would win, so only current codes
            if (countryCode(code) && currentCountry(code) === code && names.of(code) !== code) {
                countries.set(names.of(code), code);
            }
        }
    }
    // The status page retains these older names; Intl uses their current names.
    countries.set("Turkey", "TR");
    countries.set("Macedonia", "MK");
    return countries;
}

// Data centres the status page names without a country
const places = new Map([
    ["Hong Kong", "HK"],
    ["Kaohsiung City", "TW"],
    ["Macau", "MO"],
    ["Ramallah", "PS"],
    ["Taipei", "TW"],
]);

// Each data centre's country by its code ({ LHR: "GB" }), sorted, from the
// status page's components
export function coloCountries(components) {
    const countries = countriesByName();
    const locations = new Map();
    for (const { name } of components) {
        // "City, Country - (ABC)" or "Place - (ABC)". Products, like "Data Loss
        // Prevention (DLP)", have no " - ".
        const match = typeof name === "string" && /^(.+) - \(([A-Z]{3})\)$/.exec(name);
        if (!match) continue;
        const [, place, colo] = match;
        const comma = place.lastIndexOf(", ");
        const country = comma >= 0 ? countries.get(place.slice(comma + 2)) : places.get(place);
        if (!country) throw new Error("Unrecognized Cloudflare location (add it here): " + place);
        if (locations.has(colo) && locations.get(colo) !== country) {
            throw new Error("Conflicting countries for " + colo);
        }
        locations.set(colo, country);
    }
    if (locations.size === 0) throw new Error("Empty Cloudflare location directory");
    return Object.fromEntries([...locations].sort(([a], [b]) => a.localeCompare(b)));
}
