package io.jere.run_escape;

/**
 * What AppUpdater does with what it remembers between launches: a download in progress or waiting
 * to be installed, a version the player put off, and one whose APK can't be installed here. No
 * Android dependencies, for local tests.
 */
final class UpdatePlan {
    // How long Later puts off offering the same version
    static final long SNOOZE_MS = 24L * 60 * 60 * 1000;

    private UpdatePlan() { }

    /**
     * A saved download that's no use any more: its version is installed already (an update stops
     * the app before it can tidy up), or a newer release has replaced it. latestVersion is null
     * when the check failed or found nothing newer than what's installed.
     */
    static boolean downloadOutdated(String downloadVersion, String latestVersion, long installedCode) {
        long code = UpdateRelease.versionCode(downloadVersion);
        return code <= installedCode
                || latestVersion != null && UpdateRelease.versionCode(latestVersion) > code;
    }

    /** Whether to offer to download the latest release, with no download saved. */
    static boolean shouldOffer(String latestVersion, String snoozedVersion, long snoozedAt,
                               String unusableVersion, long now) {
        if (latestVersion == null || latestVersion.equals(unusableVersion)) return false;
        // A clock set back ends the wait rather than stretching it
        return !latestVersion.equals(snoozedVersion) || now < snoozedAt || now - snoozedAt >= SNOOZE_MS;
    }
}
