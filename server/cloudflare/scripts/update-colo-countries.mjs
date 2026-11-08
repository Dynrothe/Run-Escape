import { writeFile } from "node:fs/promises";

import { countryCode } from "../src/shared.mjs";

// Cloudflare's own directory, rather than a third-party airport list. Keep
// this outside the room's request path: a directory outage mustn't hide flags.
const source = "https://www.cloudflarestatus.com/api/v2/components.json";
const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error("Cloudflare location directory: " + response.status);
const { components } = await response.json();
if (!Array.isArray(components)) throw new Error("Missing Cloudflare components");
const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = new Map();
for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
        const code = String.fromCharCode(first, second);
        // DisplayNames also accepts aliases: UK names the same country as GB.
        // Only canonical codes may populate the map, or later aliases win.
        if (
            countryCode(code) &&
            new Intl.Locale(`und-${code}`).region === code &&
            names.of(code) !== code
        ) {
            countries.set(names.of(code), code);
        }
    }
}
// The status page retains these older names; Intl uses their current names.
countries.set("Turkey", "TR");
countries.set("Macedonia", "MK");
// Data centres the status page names without a country
const places = new Map([
    ["Hong Kong", "HK"],
    ["Kaohsiung City", "TW"],
    ["Macau", "MO"],
    ["Ramallah", "PS"],
    ["Taipei", "TW"],
]);
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
const sorted = Object.fromEntries([...locations].sort(([a], [b]) => a.localeCompare(b)));
await writeFile(
    new URL("../src/colo-countries.json", import.meta.url),
    JSON.stringify(sorted, null, 4) + "\n",
);
console.log("Updated countries for " + locations.size + " Cloudflare colos from " + source);
