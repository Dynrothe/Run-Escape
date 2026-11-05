// @vitest-environment jsdom
import { saveFile } from "./saveFile";

const NAME = "run-escape-save.json";

function setNavigator(values: { standalone?: boolean; canShare?: unknown; share?: unknown }): void {
    for (const key of ["standalone", "canShare", "share"] as const) {
        Object.defineProperty(navigator, key, { configurable: true, value: values[key] });
    }
}

// jsdom's Blob has no text(), but its FileReader reads one
function readText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

describe("saveFile", () => {
    let click: ReturnType<typeof vi.spyOn>;
    let downloaded: string[];

    beforeEach(() => {
        downloaded = [];
        click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            downloaded.push(this.download);
        });
        URL.createObjectURL = vi.fn(() => "blob:save");
        URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        click.mockRestore();
        setNavigator({});
    });

    function installedOnIos(share: () => Promise<void>) {
        const shareSpy = vi.fn((_data: { files: File[] }) => share());
        setNavigator({ standalone: true, canShare: () => true, share: shareSpy });
        return shareSpy;
    }

    test("downloads the save as it is, typed as bytes rather than JSON", async () => {
        setNavigator({});
        saveFile(NAME, '{"coins":5}', "application/json");
        expect(downloaded).toEqual([NAME]);
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blob.type).toBe("application/octet-stream");
        expect(await readText(blob)).toBe('{"coins":5}');
    });

    test("keeps the download's link while iOS asks whether to download", () => {
        vi.useFakeTimers();
        try {
            setNavigator({});
            saveFile(NAME, "{}", "application/json");
            vi.advanceTimersByTime(30_000);
            expect(URL.revokeObjectURL).not.toHaveBeenCalled();
            vi.advanceTimersByTime(30_000);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:save");
        } finally {
            vi.useRealTimers();
        }
    });

    test("downloads in a browser that isn't an installed game on iOS", () => {
        const share = vi.fn(async () => {});
        setNavigator({ canShare: () => true, share });
        saveFile(NAME, "{}", "application/json");
        expect(downloaded).toEqual([NAME]);
        expect(share).not.toHaveBeenCalled();
    });

    test("counts a download as kept as soon as it starts, as the browser can't say", () => {
        const kept = vi.fn();
        saveFile(NAME, "{}", "application/json", kept);
        expect(downloaded).toEqual([NAME]);
        expect(kept).toHaveBeenCalledTimes(1);
    });

    test("uses the share sheet when installed on iOS", async () => {
        const share = installedOnIos(async () => {});
        const kept = vi.fn();
        saveFile(NAME, "{}", "application/json", kept);
        await new Promise((resolve) => setTimeout(resolve));
        expect(share).toHaveBeenCalledTimes(1);
        const [file] = share.mock.calls[0][0].files;
        expect(file.name).toBe(NAME);
        expect(file.type).toBe("application/json");
        expect(downloaded).toEqual([]);
        expect(kept).toHaveBeenCalledTimes(1);
    });

    test("closing the share sheet doesn't start a download, or count as kept", async () => {
        installedOnIos(() => Promise.reject(new DOMException("Closed", "AbortError")));
        const kept = vi.fn();
        saveFile(NAME, "{}", "application/json", kept);
        await new Promise((resolve) => setTimeout(resolve));
        expect(downloaded).toEqual([]);
        expect(kept).not.toHaveBeenCalled();
    });

    test("falls back to a download when sharing fails", async () => {
        installedOnIos(() => Promise.reject(new DOMException("No", "NotAllowedError")));
        const kept = vi.fn();
        saveFile(NAME, "{}", "application/json", kept);
        await new Promise((resolve) => setTimeout(resolve));
        expect(downloaded).toEqual([NAME]);
        expect(kept).toHaveBeenCalledTimes(1);
    });

    test("falls back to a download when the file can't be shared", () => {
        const share = vi.fn(async () => {});
        setNavigator({ standalone: true, canShare: () => false, share });
        saveFile(NAME, "{}", "application/json");
        expect(downloaded).toEqual([NAME]);
        expect(share).not.toHaveBeenCalled();
    });

    test("downloads when the browser has no canShare", () => {
        setNavigator({ standalone: true });
        saveFile(NAME, "{}", "application/json");
        expect(downloaded).toEqual([NAME]);
    });

    test("hands the file, with its name, to the Android app", () => {
        const postMessage = vi.fn();
        vi.stubGlobal("NativeDownloads", { postMessage });
        try {
            saveFile("run-escape-save-unreadable.json", '{"coins":5}', "application/json");
            expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
                name: "run-escape-save-unreadable.json",
                text: '{"coins":5}',
            });
            expect(downloaded).toEqual([]);
            expect(URL.createObjectURL).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    test("counts the app's file as kept only once the app says it's written", () => {
        const app = {
            postMessage: vi.fn(),
            onmessage: null as ((e: { data: unknown }) => void) | null,
        };
        vi.stubGlobal("NativeDownloads", app);
        try {
            const kept = vi.fn();
            saveFile(NAME, "{}", "application/json", kept);
            // Picked nowhere yet, or cancelled: the app says nothing
            expect(kept).not.toHaveBeenCalled();
            app.onmessage!({ data: "something else" });
            expect(kept).not.toHaveBeenCalled();
            app.onmessage!({ data: "saved" });
            expect(kept).toHaveBeenCalledTimes(1);
            // Only the once
            app.onmessage!({ data: "saved" });
            expect(kept).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
