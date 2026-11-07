import countries from "./colo-countries.json" with { type: "json" };

// Called only inside a room, never from the incoming edge Worker. This is
// the diagnostic used by where.durableobjects.live (linked in CF's docs):
// https://github.com/helloimalastair/where-durableobjects-live/blob/main/apps/worker/src/DO.ts
// Map colo, not trace's loc (the source IP's geolocation), to its country.
const TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";

export async function roomLocation() {
    // Bound the whole lookup, including bodies; it mustn't keep a room
    // awake indefinitely or delay creating/joining/playing in it.
    try {
        const signal = AbortSignal.timeout(3000);
        const trace = await fetch(TRACE_URL, { signal, redirect: "error", cache: "no-store" });
        if (!trace.ok) return undefined;
        const text = await trace.text();
        const colo = /^colo=([A-Z]{3})\r?$/m.exec(text)?.[1];
        const country = colo && Object.hasOwn(countries, colo) ? countries[colo] : undefined;
        return country ? { colo, country } : undefined;
    } catch {
        return undefined;
    }
}
