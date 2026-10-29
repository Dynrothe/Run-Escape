// Settings for how the game looks and behaves, kept in the browser like the
// sound ones
export type DisplaySettings = {
    // The camera circles the character on the title screen and the menus
    menuSpin: boolean;
    // A run pauses when the window loses focus or the tab is hidden
    pauseOnBlur: boolean;
    // The quest tracker on the HUD is open (Q, or its title, opens and shuts it)
    questTracker: boolean;
};

const SETTINGS_KEY = "rune-survivors-display";

// The menu camera stands still for anyone who's asked for less motion
function getDefaults(): DisplaySettings {
    let reducedMotion = false;
    try {
        reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}
    return { menuSpin: !reducedMotion, pauseOnBlur: true, questTracker: true };
}

export function loadDisplaySettings(): DisplaySettings {
    const settings = getDefaults();
    try {
        const json = window.localStorage.getItem(SETTINGS_KEY);
        if (json) {
            const data = JSON.parse(json);
            if (typeof data.menuSpin === "boolean") {
                settings.menuSpin = data.menuSpin;
            }
            if (typeof data.pauseOnBlur === "boolean") {
                settings.pauseOnBlur = data.pauseOnBlur;
            }
            if (typeof data.questTracker === "boolean") {
                settings.questTracker = data.questTracker;
            }
        }
    } catch (e) {}
    return settings;
}

export function saveDisplaySettings(settings: DisplaySettings): void {
    try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
}
