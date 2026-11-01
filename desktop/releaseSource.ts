// Where game updates come from. Kept apart so a test build can point it at a local server,
// without the shipped launcher having any way to be pointed elsewhere.
export type ReleaseSource = {
    latestReleaseUrl: string;
    // A URL the launcher may start a download from
    isAssetUrl(url: string): boolean;
    // A URL such a download may redirect to
    isRedirectUrl(url: string): boolean;
    // A URL worth opening in the player's browser
    isReleasePage(url: string): boolean;
};

const REPOSITORY = "Dynrothe/Run-Escape";

function parseHttps(url: string): URL | undefined {
    try {
        const parsed = new URL(url);
        const plain = parsed.protocol === "https:" && !parsed.username && !parsed.password;
        return plain && (parsed.port === "" || parsed.port === "443") ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function isOnGitHub(url: string, path: string): boolean {
    const parsed = parseHttps(url);
    return parsed?.hostname === "github.com" && parsed.pathname.startsWith(path);
}

export const GITHUB_SOURCE: ReleaseSource = {
    latestReleaseUrl: `https://api.github.com/repos/${REPOSITORY}/releases/latest`,
    isAssetUrl: (url) => isOnGitHub(url, `/${REPOSITORY}/releases/download/`),
    // GitHub hands a release asset's download over to its storage host
    isRedirectUrl(url) {
        const host = parseHttps(url)?.hostname;
        return host === "github.com" || !!host?.endsWith(".githubusercontent.com");
    },
    isReleasePage: (url) => isOnGitHub(url, `/${REPOSITORY}/releases/`),
};
