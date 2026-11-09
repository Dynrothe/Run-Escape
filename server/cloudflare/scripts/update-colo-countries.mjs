import { writeFile } from "node:fs/promises";

import { coloCountries } from "./colo-countries.mjs";

// Cloudflare's own directory, rather than a third-party airport list. Keep
// this outside the room's request path: a directory outage mustn't hide flags.
const source = "https://www.cloudflarestatus.com/api/v2/components.json";
const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error("Cloudflare location directory: " + response.status);
const { components } = await response.json();
if (!Array.isArray(components)) throw new Error("Missing Cloudflare components");
const sorted = coloCountries(components);
await writeFile(
    new URL("../src/colo-countries.json", import.meta.url),
    JSON.stringify(sorted, null, 4) + "\n",
);
console.log(
    "Updated countries for " + Object.keys(sorted).length + " Cloudflare colos from " + source,
);
