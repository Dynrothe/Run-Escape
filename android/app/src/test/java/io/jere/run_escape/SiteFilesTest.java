package io.jere.run_escape;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public final class SiteFilesTest {
    private static final String SHA = repeat("a", 64);
    private static final String BUILD = "0.30.0-19c7e9bd";
    private static final String COOP = "wss://relay.example/coop";

    private static String repeat(String text, int times) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < times; i++) out.append(text);
        return out.toString();
    }

    private static JSONObject file(String path) throws JSONException {
        return new JSONObject().put("path", path).put("sha256", SHA).put("size", 10);
    }

    private static JSONObject site() throws JSONException {
        return new JSONObject().put("build", BUILD).put("version", "0.30.0").put("minLauncher", "1.0.0")
                .put("coopUrl", COOP).put("runAnalyticsUrl", "").put("cloudSaveUrl", "")
                .put("files", new JSONArray().put(file("index.html")));
    }

    private static void assertRefused(String text) {
        try {
            SiteFiles.parse(text);
            fail("Took " + text);
        } catch (JSONException expected) {
            // Refused
        }
    }

    @Test
    public void readsAGoodOneAndLeavesOutAnythingElse() throws JSONException {
        SiteFiles files = SiteFiles.parse(site().put("extra", true).toString());
        assertEquals(BUILD, files.build);
        assertEquals("0.30.0", files.version);
        assertEquals(COOP, files.coopUrl);
        assertEquals("", files.cloudSaveUrl);
        assertEquals(1, files.files.size());
        assertEquals("index.html", files.files.get(0).path);
        assertEquals(SHA, files.files.get(0).sha256);
        assertEquals(10, files.files.get(0).size);
    }

    @Test
    public void refusesAnythingElse() throws JSONException {
        assertRefused("<html>");
        assertRefused("null");
        assertRefused("[]");
        assertRefused(site().put("version", "0.29.0").toString());
        assertRefused(site().put("build", "0.30.0").toString());
        assertRefused(site().put("build", "0.30.0-ABC").toString());
        assertRefused(site().put("minLauncher", 1).toString());
        assertRefused(site().put("coopUrl", 5).toString());
        assertRefused(site().put("files", new JSONArray().put(file("a.js"))).toString());
        for (String path : new String[]{"../x", "caches/a", "verified.json", "game-files.json", "INDEX.html"}) {
            assertRefused(site().put("files", new JSONArray().put(file("index.html")).put(file(path))).toString());
        }
        assertRefused(site().put("files", new JSONArray().put(file("index.html").put("sha256", "x"))).toString());
        assertRefused(site().put("files", new JSONArray().put(file("index.html").put("sha256", SHA.toUpperCase()))).toString());
        assertRefused(site().put("files", new JSONArray().put(file("index.html").put("size", -1))).toString());
        assertRefused(site().put("files", new JSONArray().put(file("index.html").put("size", 1.5))).toString());
        assertRefused(site().put("files", new JSONArray().put(file("index.html").put("size", "10"))).toString());
        assertRefused(site().put("files", new JSONArray().put(file("index.html").put("size", 1L << 53))).toString());
        assertRefused(site().put("files", "index.html").toString());
    }

    @Test
    public void takesPathsInsideTheGame() {
        for (String path : new String[]{"index.html", "assets/index-CjI-souU.js", "static/.htaccess", "icons/a b.png"}) {
            assertTrue(path, SiteFiles.isSitePath(path));
        }
    }

    @Test
    public void refusesPathsThatCouldLeaveTheGameOrAreTheAppsOwn() {
        for (String path : new String[]{"", "/index.html", "a\\b.js", "a/../b", "a/./b", "..", "c:x",
                "assets/", "a//b", "x.", "x ", "caches/caches.json", "verified.json", "game-files.json", "a\0b"}) {
            assertFalse(path, SiteFiles.isSitePath(path));
        }
        assertFalse(SiteFiles.isSitePath(null));
        assertFalse(SiteFiles.isSitePath(5));
    }

    private static JSONObject chunk() throws JSONException {
        return new JSONObject().put("file", repeat("0", 32) + ".bin").put("size", 5);
    }

    private static JSONObject cache() throws JSONException {
        return new JSONObject().put("slimOf", "osrs").put("build", BUILD).put("chunks", new JSONArray().put(chunk()));
    }

    private static void assertCachesRefused(JSONArray caches) {
        try {
            SiteFiles.parseCaches(caches.toString(), BUILD);
            fail("Took " + caches);
        } catch (JSONException expected) {
            // Refused
        }
    }

    @Test
    public void givesTheChunksOfASlimCacheForTheBuild() throws JSONException {
        List<SiteFiles.Chunk> chunks = SiteFiles.parseCaches(new JSONArray().put(cache()).toString(), BUILD);
        assertEquals(1, chunks.size());
        assertEquals(repeat("0", 32) + ".bin", chunks.get(0).file);
        assertEquals(5, chunks.get(0).size);
        assertEquals("caches/chunks/" + repeat("0", 32) + ".bin", chunks.get(0).path());
    }

    @Test
    public void refusesAnyOtherCache() throws JSONException {
        assertCachesRefused(new JSONArray().put(cache().put("build", "0.30.0-a6f7bcdc")));
        assertCachesRefused(new JSONArray().put(cache().put("build", JSONObject.NULL)));
        assertCachesRefused(new JSONArray().put(cache().put("slimOf", JSONObject.NULL)));
        assertCachesRefused(new JSONArray().put(cache().put("slimOf", "")));
        assertCachesRefused(new JSONArray().put(cache()).put(cache()));
        assertCachesRefused(new JSONArray());
        assertCachesRefused(new JSONArray().put(cache().put("chunks",
                new JSONArray().put(new JSONObject().put("file", "../x.bin").put("size", 1)))));
        assertCachesRefused(new JSONArray().put(cache().put("chunks", new JSONArray().put(chunk()).put(chunk()))));
        assertCachesRefused(new JSONArray().put(cache().put("chunks",
                new JSONArray().put(chunk().put("size", JSONObject.NULL)))));
    }

    @Test
    public void followsABuildWithTheAppsAddresses() throws JSONException {
        SiteFiles files = SiteFiles.parse(site().toString());
        assertNull(files.whyNotFollow("0.30.0", COOP, "", ""));
        assertNull(files.whyNotFollow("0.29.9", COOP, null, null));
    }

    @Test
    public void wontFollowABuildReachingSomewhereTheAppDoesntLetOut() throws JSONException {
        SiteFiles files = SiteFiles.parse(site().toString());
        assertTrue(files.whyNotFollow("0.30.0", "wss://other.example/coop", "", "").contains("coopUrl"));
        assertTrue(files.whyNotFollow("0.30.0", COOP, "", "https://saves.example").contains("cloudSaveUrl"));
        assertTrue(files.whyNotFollow("0.30.0", COOP, "https://c.example/v1/runs", "").contains("runAnalyticsUrl"));
        assertTrue(files.whyNotFollow("0.30.0", "", "", "").contains("coopUrl"));
    }

    @Test
    public void wontGoBelowTheApksOwnVersion() throws JSONException {
        SiteFiles files = SiteFiles.parse(site().toString());
        assertTrue(files.whyNotFollow("0.30.1", COOP, "", "").contains("older"));
        assertTrue(files.whyNotFollow("0.31.0", COOP, "", "").contains("older"));
        assertTrue(files.whyNotFollow("1.0.0", COOP, "", "").contains("older"));
        // The same version, built from a later commit, is what the website's ahead with
        assertNull(files.whyNotFollow("0.30.0", COOP, "", ""));
    }

    @Test
    public void comparesVersionsByNumber() {
        assertTrue(SiteFiles.compareVersions("0.10.0", "0.9.0") > 0);
        assertTrue(SiteFiles.compareVersions("0.9.10", "0.9.9") > 0);
        assertTrue(SiteFiles.compareVersions("1.0.0", "0.99.99") > 0);
        assertEquals(0, SiteFiles.compareVersions("0.30.0", "0.30.0"));
        assertTrue(SiteFiles.compareVersions("0.29.0", "0.30.0") < 0);
    }

    @Test
    public void endsTheWebsitesPathInASlash() {
        assertEquals("https://jere.io/run-escape/", SiteFiles.baseUrl("https://jere.io/run-escape"));
        assertEquals("https://jere.io/run-escape/", SiteFiles.baseUrl(" https://jere.io/run-escape/ "));
        assertEquals("https://example.com/", SiteFiles.baseUrl("https://example.com"));
        assertEquals("https://example.com:8443/game/", SiteFiles.baseUrl("https://example.com:8443/game"));
    }

    @Test
    public void refusesAWebsiteThatIsntPlainHttps() {
        for (String raw : new String[]{null, "", "  ", "http://jere.io/run-escape/", "https://user:pass@jere.io/",
                "https://jere.io/?x=1", "https://jere.io/#x", "not a url", "file:///game/", "https:///x"}) {
            assertNull(String.valueOf(raw), SiteFiles.baseUrl(raw));
        }
    }

    @Test
    public void keepsAFileInsideTheWebsite() {
        String base = "https://jere.io/run-escape/";
        assertEquals(base + "assets/a%20b.js", SiteFiles.fileUrl(base, "assets/a b.js"));
        assertEquals(base + "a%3Fb%23c", SiteFiles.fileUrl(base, "a?b#c"));
        assertEquals(base + "caf%C3%A9.png", SiteFiles.fileUrl(base, "café.png"));
        assertEquals(base + "a-b_c.d~e!f*g'h(i)", SiteFiles.fileUrl(base, "a-b_c.d~e!f*g'h(i)"));
        assertEquals(base + "a%25b", SiteFiles.fileUrl(base, "a%b"));
    }
}
