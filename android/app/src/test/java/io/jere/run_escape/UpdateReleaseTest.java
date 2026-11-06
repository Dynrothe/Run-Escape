package io.jere.run_escape;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.*;

public class UpdateReleaseTest {
    private JSONObject release(String version) throws JSONException {
        String name = "Run-Escape-" + version + "-android.apk";
        JSONObject asset = new JSONObject().put("name", name).put("size", 123456)
                .put("state", "uploaded").put("browser_download_url",
                        "https://github.com/Dynrothe/Run-Escape/releases/download/v" + version + "/" + name);
        return new JSONObject().put("tag_name", "v" + version).put("draft", false)
                .put("prerelease", false).put("assets", new JSONArray().put(asset));
    }

    @Test public void selectsTheMatchingAndroidApkFromANewerStableRelease() throws Exception {
        JSONObject release = release("0.28.0");
        release.getJSONArray("assets").put(new JSONObject().put("name", "game-0.28.0.zip"));
        UpdateRelease update = UpdateRelease.parse(release.toString(), 270000);
        assertNotNull(update);
        assertEquals("0.28.0", update.version);
        assertEquals("Run-Escape-0.28.0-android.apk", update.fileName());
        assertEquals(123456, update.size);
    }

    @Test public void comparesNumericVersionsAndKeepsTheInstalledRevision() throws Exception {
        assertNotNull(UpdateRelease.parse(release("0.10.0").toString(), 90009));
        assertNull(UpdateRelease.parse(release("0.27.0").toString(), 270000));
        assertNull(UpdateRelease.parse(release("0.27.0").toString(), 270009));
        assertNull(UpdateRelease.parse(release("0.26.9").toString(), 270000));
        assertEquals(10200340, UpdateRelease.versionCode("1.20.34"));
    }

    @Test public void ignoresDraftsPrereleasesAndNonVersionTags() throws Exception {
        assertNull(UpdateRelease.parse(release("0.28.0").put("draft", true).toString(), 270000));
        assertNull(UpdateRelease.parse(release("0.28.0").put("prerelease", true).toString(), 270000));
        for (String version : new String[]{"0.28.0-beta", "0.028.0", "0.1000.0", "999.0.0", "../other", ""}) {
            assertNull(version, UpdateRelease.parse(release(version).toString(), 270000));
        }
        assertNull(UpdateRelease.parse(release("0.28.0").put("tag_name", "latest").toString(), 270000));
    }

    @Test public void ignoresReleasesWithoutACompleteAndroidAsset() throws Exception {
        JSONObject release = release("0.28.0");
        release.getJSONArray("assets").getJSONObject(0).put("name", "Run-Escape-0.28.0-win-x64.zip");
        assertNull(UpdateRelease.parse(release.toString(), 270000));
        release = release("0.28.0");
        release.getJSONArray("assets").getJSONObject(0).put("state", "starter");
        assertNull(UpdateRelease.parse(release.toString(), 270000));
        release = release("0.28.0");
        release.getJSONArray("assets").getJSONObject(0).put("size", 0);
        assertNull(UpdateRelease.parse(release.toString(), 270000));
        assertNull(UpdateRelease.parse("{}", 270000));
        assertNull(UpdateRelease.parse(release("0.28.0").put("assets", new JSONArray()).toString(), 270000));
    }

    @Test public void rejectsDownloadsOutsideTheExactReleaseAsset() throws Exception {
        for (String url : new String[]{
                "http://github.com/Dynrothe/Run-Escape/releases/download/v0.28.0/Run-Escape-0.28.0-android.apk",
                "https://evil.example/update.apk",
                "https://github.com/other/Run-Escape/releases/download/v0.28.0/Run-Escape-0.28.0-android.apk",
                "https://github.com/Dynrothe/Run-Escape/releases/download/v0.28.0/Run-Escape-0.28.0-android.apk?redirect=other"
        }) {
            JSONObject release = release("0.28.0");
            release.getJSONArray("assets").getJSONObject(0).put("browser_download_url", url);
            assertNull(url, UpdateRelease.parse(release.toString(), 270000));
        }
    }

    @Test(expected = JSONException.class) public void malformedJsonFailsTheCheck() throws Exception {
        // AppUpdater catches this along with network failures, leaving the current game running.
        UpdateRelease.parse("<html>Service unavailable</html>", 270000);
    }

    @Test public void readsASuccessfulResponseAndHandlesNoPublishedRelease() throws Exception {
        assertNotNull(UpdateRelease.readResponse(response(200, release("0.28.0").toString()), 270000));
        assertNull(UpdateRelease.readResponse(response(404, "Not Found"), 270000));
    }

    @Test public void rateLimitsAndServerErrorsFailWithoutReadingAnApk() throws Exception {
        for (int status : new int[]{301, 403, 429, 500, 503}) {
            IOException failure = assertThrows(IOException.class,
                    () -> UpdateRelease.readResponse(response(status, "Unavailable"), 270000));
            assertTrue(failure.getMessage().contains(Integer.toString(status)));
        }
    }

    @Test public void offlineAndTimeoutErrorsReachTheQuietStartupFailureHandler() throws Exception {
        for (IOException error : new IOException[]{new IOException("Offline"), new SocketTimeoutException("Timed out")}) {
            HttpURLConnection request = new StubConnection(200, "") {
                @Override public int getResponseCode() throws IOException { throw error; }
            };
            assertSame(error, assertThrows(IOException.class, () -> UpdateRelease.readResponse(request, 270000)));
        }
    }

    @Test public void rejectsOversizedOrBrokenResponses() throws Exception {
        assertThrows(IOException.class,
                () -> UpdateRelease.readResponse(response(200, new String(new char[2 * 1024 * 1024 + 1])), 270000));
        assertThrows(JSONException.class,
                () -> UpdateRelease.readResponse(response(200, "<html>Unavailable</html>"), 270000));
        HttpURLConnection interrupted = new StubConnection(200, "") {
            @Override public InputStream getInputStream() {
                return new InputStream() {
                    @Override public int read() throws IOException { throw new IOException("Connection lost"); }
                };
            }
        };
        assertThrows(IOException.class, () -> UpdateRelease.readResponse(interrupted, 270000));
    }

    private HttpURLConnection response(int status, String body) throws Exception {
        return new StubConnection(status, body);
    }

    private static class StubConnection extends HttpURLConnection {
        private final int status;
        private final String body;

        StubConnection(int status, String body) throws Exception {
            super(new URL(UpdateRelease.LATEST_URL));
            this.status = status;
            this.body = body;
        }

        @Override public int getResponseCode() throws IOException { return status; }
        @Override public InputStream getInputStream() {
            return new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8));
        }
        @Override public void disconnect() { }
        @Override public boolean usingProxy() { return false; }
        @Override public void connect() { }
    }
}
