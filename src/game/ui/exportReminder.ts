import { SaveData } from "../core/save";

// The title screen's reminder to export the save: it lives only in this
// browser, and clearing the browser's data loses it for good.

// The day it was put off till tomorrow. In localStorage beside the save rather
// than in it: it's this browser's reminder, not progress to carry in an
// exported file, and it can be put off while another tab holds the save.
const DISMISSED_KEY = "rune-survivors-export-reminder-dismissed";

// A day by the player's own clock, so the reminder comes round at their midnight
export function localDay(time: number): string {
    const date = new Date(time);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// Whether to remind them: once there's something to lose (a run played), and
// it hasn't been exported or put off today. Any other day counts, one ahead of
// the clock too, so a clock that was wrong when they exported can't hide it.
export function shouldRemindToExport(save: SaveData, now: number, dismissedDay?: string): boolean {
    const today = localDay(now);
    if (save.runs <= 0 || dismissedDay === today) {
        return false;
    }
    return save.lastExported === undefined || localDay(save.lastExported) !== today;
}

export function loadExportReminderDismissed(): string | undefined {
    try {
        return window.localStorage.getItem(DISMISSED_KEY) ?? undefined;
    } catch (e) {
        return undefined;
    }
}

// Puts it off till tomorrow. Returns the day, which the title keeps as well in
// case localStorage can't.
export function dismissExportReminder(now: number): string {
    const day = localDay(now);
    try {
        window.localStorage.setItem(DISMISSED_KEY, day);
    } catch (e) {}
    return day;
}
