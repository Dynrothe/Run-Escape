// A build-time destination independent of the multiplayer relay. HTTP is only for local testing.
export function runAnalyticsUrl(value?: string): string | undefined {
    if (!value) return undefined;
    try {
        const url = new URL(value);
        const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if (
            (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            url.pathname !== "/v1/runs"
        ) {
            return undefined;
        }
        return url.href;
    } catch {
        return undefined;
    }
}
