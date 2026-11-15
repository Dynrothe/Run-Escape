// The cloud-save Worker's address (server/cloud-saves): an origin, with no path. The game adds
// /v1/... to it, and the desktop and Android apps let requests out to that origin's /v1/ alone.
// HTTP is only for local testing.
export function cloudSaveUrl(value?: string): string | undefined {
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
            url.pathname !== "/"
        ) {
            return undefined;
        }
        return url.origin;
    } catch {
        return undefined;
    }
}

// Whether a request is one the game makes to the cloud-save Worker at origin
export function isCloudSaveRequest(method: string, url: string, origin?: string): boolean {
    if (!origin) return false;
    try {
        const parsed = new URL(url);
        return (
            parsed.origin === origin &&
            parsed.pathname.startsWith("/v1/") &&
            !parsed.username &&
            !parsed.password &&
            !parsed.search &&
            ["GET", "PUT", "POST", "DELETE", "OPTIONS"].includes(method)
        );
    } catch {
        return false;
    }
}
