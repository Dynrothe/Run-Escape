package io.jere.run_escape;

import org.junit.Test;

import static org.junit.Assert.*;

public class UpdatePlanTest {
    private static final long NOW = 1_800_000_000_000L;

    @Test public void aDownloadIsDroppedOnceItsVersionIsInstalled() {
        // The update stopped the old app before it could tidy up, check or no check
        assertTrue(UpdatePlan.downloadOutdated("0.28.0", null, 280000));
        assertTrue(UpdatePlan.downloadOutdated("0.28.0", null, 280001));
        assertTrue(UpdatePlan.downloadOutdated("0.28.0", null, 290000));
        assertTrue(UpdatePlan.downloadOutdated("", null, 270000));
    }

    @Test public void aDownloadIsKeptUntilANewerReleaseReplacesIt() {
        // Offline, or the same release: the downloaded APK is still the one to install
        assertFalse(UpdatePlan.downloadOutdated("0.28.0", null, 270000));
        assertFalse(UpdatePlan.downloadOutdated("0.28.0", "0.28.0", 270000));
        // A newer release since: the old download isn't installed first
        assertTrue(UpdatePlan.downloadOutdated("0.28.0", "0.29.0", 270000));
        assertTrue(UpdatePlan.downloadOutdated("0.28.0", "0.28.1", 270000));
    }

    @Test public void offersTheLatestReleaseWhenNothingStandsInTheWay() {
        assertTrue(UpdatePlan.shouldOffer("0.28.0", "", 0, "", NOW));
        assertFalse(UpdatePlan.shouldOffer(null, "", 0, "", NOW));
    }

    @Test public void laterPutsOffThatVersionForAWhile() {
        long justNow = NOW - 60_000;
        assertFalse(UpdatePlan.shouldOffer("0.28.0", "0.28.0", justNow, "", NOW));
        assertFalse(UpdatePlan.shouldOffer("0.28.0", "0.28.0", NOW - UpdatePlan.SNOOZE_MS + 1, "", NOW));
        assertTrue(UpdatePlan.shouldOffer("0.28.0", "0.28.0", NOW - UpdatePlan.SNOOZE_MS, "", NOW));
        // A newer version than the one put off is offered straight away
        assertTrue(UpdatePlan.shouldOffer("0.29.0", "0.28.0", justNow, "", NOW));
        // A clock set back doesn't stretch the wait
        assertTrue(UpdatePlan.shouldOffer("0.28.0", "0.28.0", NOW + 60_000, "", NOW));
    }

    @Test public void anApkThatCantBeInstalledIsNeverOfferedAgain() {
        assertFalse(UpdatePlan.shouldOffer("0.28.0", "", 0, "0.28.0", NOW));
        assertFalse(UpdatePlan.shouldOffer("0.28.0", "", 0, "0.28.0", NOW + 365L * UpdatePlan.SNOOZE_MS));
        assertTrue(UpdatePlan.shouldOffer("0.29.0", "", 0, "0.28.0", NOW));
    }
}
