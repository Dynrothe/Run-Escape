import { createSave } from "../core/save";
import {
    dismissExportReminder,
    loadExportReminderDismissed,
    localDay,
    shouldRemindToExport,
} from "./exportReminder";

// Times on the player's own clock, whatever the test machine's time zone
const at = (day: number, hour: number, minute = 0) =>
    new Date(2026, 10, day, hour, minute).getTime();
const NOW = at(5, 12);

function played(lastExported?: number) {
    return { ...createSave(), runs: 3, lastExported };
}

// localStorage, as far as the reminder uses it
function useStorage(storage: Pick<Storage, "getItem" | "setItem">): void {
    vi.stubGlobal("window", { localStorage: storage });
}

describe("export reminder", () => {
    beforeEach(() => {
        const items = new Map<string, string>();
        useStorage({
            getItem: (key) => items.get(key) ?? null,
            setItem: (key, value) => void items.set(key, value),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("isn't shown to a new player, with nothing to lose", () => {
        expect(shouldRemindToExport(createSave(), NOW)).toBe(false);
    });

    test("is shown once a run's been played, if it's never been exported", () => {
        expect(shouldRemindToExport(played(), NOW)).toBe(true);
    });

    test("goes by the player's day, not 24 hours", () => {
        // Exported late yesterday: under an hour ago, but another day
        expect(shouldRemindToExport(played(at(4, 23, 30)), at(5, 0, 15))).toBe(true);
        // Exported first thing today, and it's late the same day
        expect(shouldRemindToExport(played(at(5, 0, 5)), at(5, 23, 55))).toBe(false);
        expect(shouldRemindToExport(played(at(1, 9)), NOW)).toBe(true);
    });

    test("is shown for an export dated ahead of the clock", () => {
        expect(shouldRemindToExport(played(at(9, 12)), NOW)).toBe(true);
    });

    test("put off, it's gone for the rest of the day and back the next", () => {
        const dismissed = dismissExportReminder(at(5, 8));
        expect(loadExportReminderDismissed()).toBe(dismissed);
        expect(shouldRemindToExport(played(), NOW, loadExportReminderDismissed())).toBe(false);
        expect(shouldRemindToExport(played(), at(6, 8), loadExportReminderDismissed())).toBe(true);
    });

    test("can be put off without localStorage, for as long as the title keeps the day", () => {
        useStorage({
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("no room");
            },
        });
        const dismissed = dismissExportReminder(NOW);
        expect(dismissed).toBe(localDay(NOW));
        expect(loadExportReminderDismissed()).toBeUndefined();
        expect(shouldRemindToExport(played(), NOW, dismissed)).toBe(false);
    });
});
