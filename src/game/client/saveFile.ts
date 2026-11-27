// A download link's file is a stream of bytes to the browser, whatever's in it: one marked as JSON,
// iOS Safari can open as a page instead of downloading (on some phones, with no choice offered).
// The file's name keeps its .json, and its bytes are the same.
const DOWNLOAD_TYPE = "application/octet-stream";
// iOS asks before it downloads, and the link has to last until the player answers
const KEEP_LINK_MS = 60_000;

function download(file: File): void {
    const url = URL.createObjectURL(new Blob([file], { type: DOWNLOAD_TYPE }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), KEEP_LINK_MS);
}

// Only iOS has navigator.standalone, and it's true when opened from the home
// screen. A download there opens a sheet too small to use when held sideways.
function canUseShareSheet(file: File): boolean {
    const { standalone } = navigator as unknown as { standalone?: boolean };
    return standalone === true && !!navigator.canShare?.({ files: [file] });
}

// The Android app puts this in its page (android/, MainActivity.java): a WebView can't download a
// file itself, so the app asks the player where to keep it, and answers "saved" once it's written.
// importFile is the same idea the other way: GeckoView's own <input type=file> can't actually read
// what the player picks (a GeckoView bug - FilePickerDelegate.sys.mjs's _getDOMFile fails on
// Android's content:// document URIs with NS_ERROR_FILE_UNRECOGNIZED_PATH, confirmed against
// GeckoView 161 on a real device; not specific to one content provider, since even this app's own
// FileProvider URI hit the same error), so the app reads the picked file itself through Android's
// own APIs and hands the text straight over instead.
type AppDownloads = {
    postMessage(message: string): void;
    onmessage: ((event: { data: unknown }) => void) | null;
    importFile?(): Promise<string | null>;
};

// What to do once the app says the file it was given last is written. The app takes one at a time.
let appKept: (() => void) | undefined;

// Gives the player a file to keep. Has to be called from a tap. kept runs once it's kept, as far
// as the game can tell: the app and the share sheet say, but a browser's download doesn't, so
// that counts as soon as it starts.
export function saveFile(name: string, text: string, type: string, kept?: () => void): void {
    const app = (globalThis as { NativeDownloads?: AppDownloads }).NativeDownloads;
    if (app) {
        appKept = kept;
        app.onmessage = (event) => {
            if (event.data === "saved") {
                const done = appKept;
                appKept = undefined;
                done?.();
            }
        };
        app.postMessage(JSON.stringify({ name, text }));
        return;
    }
    const file = new File([text], name, { type });
    if (!canUseShareSheet(file)) {
        download(file);
        kept?.();
        return;
    }
    navigator.share({ files: [file] }).then(
        () => kept?.(),
        (error: Error) => {
            // That's only the player closing the sheet
            if (error.name !== "AbortError") {
                download(file);
                kept?.();
            }
        },
    );
}

// Undefined on every platform but the Android app (no bridge to ask): the setting that imports a
// save calls this first and only falls back to its own <input type=file> when it gets undefined
// back, rather than a promise.
export function importFromApp(): Promise<string | null> | undefined {
    return (globalThis as { NativeDownloads?: AppDownloads }).NativeDownloads?.importFile?.();
}
