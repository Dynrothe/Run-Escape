package io.jere.run_escape;

import android.content.Context;
import android.content.res.AssetManager;
import android.os.Process;
import android.util.Log;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * Keeps the app on the website's build (GAME_SITE_URL), so co-op can always join the website's
 * players. Checks once when the app opens, off the game's thread, and downloads a new build for the
 * next launch (SiteGames). Offline, or with a website it can't follow, nothing changes.
 */
final class SiteUpdater {
    private static final String TAG = "SiteUpdater";
    private static final String GAME = "game/";

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Set<HttpURLConnection> connections = ConcurrentHashMap.newKeySet();
    private volatile boolean closed;

    static File sitesDir(Context context) {
        return new File(context.getFilesDir(), "site");
    }

    static String baseUrl() {
        return SiteFiles.baseUrl(BuildConfig.GAME_SITE_URL);
    }

    /** The website build to serve, decided before the game loads: null for the APK's game. */
    static File pickGame(Context context) {
        if (baseUrl() == null) return null;
        return SiteGames.pick(sitesDir(context), BuildConfig.VERSION_NAME);
    }

    /** inUse is the folder being played (pickGame), null for the APK's game. */
    SiteUpdater(Context context, File inUse) {
        AssetManager assets = context.getApplicationContext().getAssets();
        File sitesDir = sitesDir(context);
        SiteGames.Addresses addresses = new SiteGames.Addresses(BuildConfig.COOP_URL,
                BuildConfig.RUN_ANALYTICS_URL, BuildConfig.CLOUD_SAVE_URL);
        try {
            worker.execute(() -> {
                Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
                try {
                    SiteGames.Source apk = path -> {
                        try {
                            return assets.open(GAME + path);
                        } catch (FileNotFoundException exception) {
                            return null;
                        }
                    };
                    String apkBuild = SiteGames.readBuild(apk.open("build.json"));
                    String result = SiteGames.update(baseUrl(), this::fetch, sitesDir,
                            new SiteGames.Game(apk, readList(apk)), apkBuild, BuildConfig.VERSION_NAME,
                            inUse, addresses, () -> closed);
                    Log.i(TAG, result);
                } catch (Exception exception) {
                    Log.w(TAG, "The website's build skipped", exception);
                }
            });
        } catch (RejectedExecutionException ignored) {
            // Closed meanwhile
        }
    }

    // The APK's own game-files.json, so its files are found by sha256 without reading them all
    private static SiteFiles readList(SiteGames.Source apk) {
        try {
            InputStream input = apk.open(SiteFiles.NAME);
            return input == null ? null : SiteFiles.parse(SiteGames.readText(input, SiteGames.MAX_LIST_BYTES));
        } catch (Exception exception) {
            return null;
        }
    }

    // Only a 200 from the website itself: no redirects, nothing cached
    private InputStream fetch(String url) throws IOException {
        if (closed) throw new SiteGames.CancelledException();
        HttpURLConnection request = (HttpURLConnection) new URL(url).openConnection();
        connections.add(request);
        try {
            request.setConnectTimeout(10000);
            request.setReadTimeout(30000);
            request.setInstanceFollowRedirects(false);
            request.setUseCaches(false);
            request.setRequestProperty("Cache-Control", "no-cache");
            request.setRequestProperty("User-Agent", "Run-Escape-Android/" + BuildConfig.VERSION_NAME);
            int status = request.getResponseCode();
            if (status != 200) throw new IOException(url + " answered " + status);
            return new FilterInputStream(request.getInputStream()) {
                @Override public void close() throws IOException {
                    try {
                        super.close();
                    } finally {
                        request.disconnect();
                        connections.remove(request);
                    }
                }
            };
        } catch (IOException | RuntimeException exception) {
            request.disconnect();
            connections.remove(request);
            throw exception;
        }
    }

    /** Stops a check or download: an unfinished one's thrown away, and tried again next launch. */
    void close() {
        closed = true;
        worker.shutdownNow();
        for (HttpURLConnection request : connections) {
            try {
                request.disconnect();
            } catch (RuntimeException ignored) { }
        }
    }
}
