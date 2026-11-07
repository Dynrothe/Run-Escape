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
        if (countryCode(code) && names.of(code) !== code) countries.set(names.of(code), code);
    }
}
// The status page retains these older names; Intl uses their current names.
countries.set("Turkey", "TR");
countries.set("Macedonia", "MK");
const locations = new Map();
for (const { name } of components) {
    if (typeof name !== "string" || !/\([A-Z]{3}\)$/.test(name)) continue;
    const match = /^.+, (.+) - \(([A-Z]{3})\)$/.exec(name);
    // Some entries omit their country. Leave those unmapped rather than guess.
    if (!match) continue;
    const [, countryName, colo] = match;
    const country = countries.get(countryName);
    if (!country) throw new Error("Unrecognized Cloudflare country: " + countryName);
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
