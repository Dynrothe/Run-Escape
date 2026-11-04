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

// Gives the player a file to keep. Has to be called from a tap.
export function saveFile(name: string, text: string, type: string): void {
    const file = new File([text], name, { type });
    if (!canUseShareSheet(file)) {
        download(file);
        return;
    }
    navigator.share({ files: [file] }).catch((error: Error) => {
        // That's only the player closing the sheet
        if (error.name !== "AbortError") {
            download(file);
        }
    });
}
