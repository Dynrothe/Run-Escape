// @vitest-environment jsdom
import { saveFile } from "./saveFile";

const NAME = "run-escape-save.json";

function setNavigator(values: { standalone?: boolean; canShare?: unknown; share?: unknown }): void {
    for (const key of ["standalone", "canShare", "share"] as const) {
        Object.defineProperty(navigator, key, { configurable: true, value: values[key] });
    }
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

    test("downloads in a browser that isn't an installed game on iOS", () => {
        const share = vi.fn(async () => {});
        setNavigator({ canShare: () => true, share });
        saveFile(NAME, "{}", "application/json");
        expect(downloaded).toEqual([NAME]);
        expect(share).not.toHaveBeenCalled();
    });

    test("uses the share sheet when installed on iOS", async () => {
        const share = installedOnIos(async () => {});
        saveFile(NAME, "{}", "application/json");
        await Promise.resolve();
        expect(share).toHaveBeenCalledTimes(1);
        const [file] = share.mock.calls[0][0].files;
        expect(file.name).toBe(NAME);
        expect(file.type).toBe("application/json");
        expect(downloaded).toEqual([]);
    });

    test("closing the share sheet doesn't start a download", async () => {
        installedOnIos(() => Promise.reject(new DOMException("Closed", "AbortError")));
        saveFile(NAME, "{}", "application/json");
        await new Promise((resolve) => setTimeout(resolve));
        expect(downloaded).toEqual([]);
    });

    test("falls back to a download when sharing fails", async () => {
        installedOnIos(() => Promise.reject(new DOMException("No", "NotAllowedError")));
        saveFile(NAME, "{}", "application/json");
        await new Promise((resolve) => setTimeout(resolve));
        expect(downloaded).toEqual([NAME]);
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
});
