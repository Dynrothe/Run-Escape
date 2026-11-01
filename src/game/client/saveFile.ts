function download(file: File): void {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    // Once the download has its copy
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
