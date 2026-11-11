package io.jere.run_escape;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.HttpURLConnection;

/** The APK published alongside a stable game release. No Android dependencies, for local tests. */
final class UpdateRelease {
    static final String REPOSITORY = "Dynrothe/Run-Escape";
    static final String LATEST_URL = "https://api.github.com/repos/" + REPOSITORY + "/releases/latest";

    final String version;
    final String url;
    final long size;

    private UpdateRelease(String version, String url, long size) {
        this.version = version;
        this.url = url;
        this.size = size;
    }

    // The APK's name on a release (.github/workflows/release.yml), and in the download folder
    static String fileName(String version) { return "Run-Escape-" + version + "-android.apk"; }

    static UpdateRelease readResponse(HttpURLConnection request, int installedVersionCode)
            throws IOException, JSONException {
        int status = request.getResponseCode();
        if (status == 404) return null;
        if (status != 200) throw new IOException("GitHub returned " + status);
        return parse(LimitedText.read(request.getInputStream(), 2 * 1024 * 1024), installedVersionCode);
    }

    static UpdateRelease parse(String json, int installedVersionCode) throws JSONException {
        JSONObject release = new JSONObject(json);
        if (release.optBoolean("draft") || release.optBoolean("prerelease")) return null;
        String tag = release.optString("tag_name");
        if (!tag.startsWith("v")) return null;
        String version = tag.substring(1);
        if (versionCode(version) <= installedVersionCode) return null;
        String name = fileName(version);
        String url = "https://github.com/" + REPOSITORY + "/releases/download/" + tag + "/" + name;
        JSONArray assets = release.optJSONArray("assets");
        if (assets == null) return null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            long size = asset.optLong("size");
            if (name.equals(asset.optString("name")) && url.equals(asset.optString("browser_download_url"))
                    && "uploaded".equals(asset.optString("state")) && size > 0) {
                return new UpdateRelease(version, url, size);
            }
        }
        return null;
    }

    // Matches app/build.gradle; the last digit is reserved for Android-only rebuilds.
    static long versionCode(String version) {
        if (!version.matches("(0|[1-9][0-9]{0,2})\\.(0|[1-9][0-9]{0,2})\\.(0|[1-9][0-9]{0,2})")) return -1;
        String[] parts = version.split("\\.");
        long code = Long.parseLong(parts[0]) * 10000000L
                + Long.parseLong(parts[1]) * 10000L + Long.parseLong(parts[2]) * 10L;
        return code > 0 && code <= 2100000000L ? code : -1;
    }
}
