import { fmtNum } from "../i18n";

// A volume as a percentage: whole, or to a tenth once Shift's set one finer ("60%", "60.5%")
export function formatVolume(value: number): string {
    return fmtNum(Math.round(value * 1000) / 10, { maximumFractionDigits: 1 }) + "%";
}

// Where a volume goes from a slider's position (0 to 100) and how the drag's gone: whole percents
// as it follows the pointer, and with Shift held a tenth of the way the pointer moves, from where
// Shift took over (anchor), to a tenth of a percent. Kept to 0 to 1, as GameAudio reads it.
export function volumeFromDrag(
    position: number,
    fine: { position: number; value: number } | undefined,
): number {
    const percent = fine
        ? fine.value * 100 + (position - fine.position) / 10
        : Math.round(position);
    return Math.min(1, Math.max(0, Math.round(percent * 10) / 1000));
}

// A volume slider's keys, in percent
export const VOLUME_KEY_STEPS: Record<string, number> = {
    ArrowRight: 1,
    ArrowUp: 1,
    ArrowLeft: -1,
    ArrowDown: -1,
    PageUp: 10,
    PageDown: -10,
};

// A key's step from a volume: a whole step lands on a whole percent (from a level in between too),
// and with Shift an arrow's is a tenth of one
export function volumeFromKey(value: number, step: number, shift: boolean): number {
    const by = shift && Math.abs(step) === 1 ? step / 10 : step;
    const percent = Math.round(value * 1000) / 10 + by;
    const landed =
        Math.abs(by) < 1
            ? percent
            : by > 0
              ? Math.floor(percent + 1e-6)
              : Math.ceil(percent - 1e-6);
    return Math.min(1, Math.max(0, Math.round(landed * 10) / 1000));
}
