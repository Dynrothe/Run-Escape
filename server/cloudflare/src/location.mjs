import countries from "./colo-countries.json" with { type: "json" };

// Called only inside a room, never from the incoming edge Worker. This is
// the diagnostic used by where.durableobjects.live (linked in CF's docs):
// https://github.com/helloimalastair/where-durableobjects-live/blob/main/apps/worker/src/DO.ts
// Map colo, not trace's loc (the source IP's geolocation), to its country.
const TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";
const CACHE_MS = 60 * 60_000;
const RETRY_MS = 60_000;

// An isolate runs in one location. Share this bounded lookup across its
// rooms and hibernations; a new isolate measures again. Never persist the
// result in room storage, where it could survive a move to another location.
let cached;
let expires = 0;
let pending;

export function roomLocation() {
    if (pending) return pending;
    if (Date.now() < expires) return Promise.resolve(cached);
    pending = measure()
        .catch(() => undefined)
        .then((location) => {
            cached = location;
            expires = Date.now() + (location ? CACHE_MS : RETRY_MS);
            pending = undefined;
            return location;
        });
    return pending;
}

async function measure() {
    // Bound the whole lookup, including bodies; it mustn't keep a room
    // awake indefinitely or delay creating/joining/playing in it.
    const signal = AbortSignal.timeout(3000);
    const trace = await fetch(TRACE_URL, { signal, redirect: "error", cache: "no-store" });
    if (!trace.ok) return undefined;
    const text = await trace.text();
    const colo = /^colo=([A-Z]{3})\r?$/m.exec(text)?.[1];
    const country = colo && Object.hasOwn(countries, colo) ? countries[colo] : undefined;
    return country ? { colo, country } : undefined;
}
