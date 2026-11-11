package io.jere.run_escape;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.ConnectivityManager;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.util.Log;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;

/**
 * Keeps the app on the website's build (GAME_SITE_URL), so co-op can join the website's players
 * between releases. Checks each time the activity starts, off the game's thread, and downloads a
 * new build for the next time the game starts over (SiteGames). Offline, on mobile data, or with a
 * website it can't follow, the game in front doesn't change.
 */
final class SiteUpdater {
    private static final String TAG = "SiteUpdater";
    private static final String GAME = "game/";

    // One for the whole app, so two updates never run at once: a new activity's (Restart game, a
    // relaunch after Exit) waits for the last one's to stop
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "SiteUpdater");
        thread.setDaemon(true);
        return thread;
    });

    private final Set<HttpURLConnection> connections = ConcurrentHashMap.newKeySet();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean closed;
    private volatile Runnable onReady;
    private Future<?> task;

    static File sitesDir(Context context) {
        return new File(context.getFilesDir(), "site");
    }

    static String baseUrl() {
        return SiteFiles.baseUrl(BuildConfig.GAME_SITE_URL);
    }

    // The slim cache's chunks in the APK's game, which an installed build is served rather than copying
    private static Set<String> apkChunks(AssetManager assets) {
        try {
            String[] names = assets.list(GAME + "caches/chunks");
            return names == null ? Collections.emptySet() : new HashSet<>(Arrays.asList(names));
        } catch (IOException exception) {
            return Collections.emptySet();
        }
    }

    /** The website build to serve, decided before the game loads: null for the APK's game. */
    static File pickGame(Context context) {
        if (baseUrl() == null) return null;
        return SiteGames.pick(sitesDir(context), BuildConfig.VERSION_NAME, apkChunks(context.getAssets()));
    }

    /**
     * inUse is the folder being played (pickGame), null for the APK's game. onReady runs on the main
     * thread when a different build's ready for the game's next start.
     */
    SiteUpdater(Context context, File inUse, Runnable onReady) {
        this.onReady = onReady;
        Context app = context.getApplicationContext();
        AssetManager assets = app.getAssets();
        File sitesDir = sitesDir(app);
        ConnectivityManager network = app.getSystemService(ConnectivityManager.class);
        SiteGames.Addresses addresses = new SiteGames.Addresses(BuildConfig.COOP_URL,
                BuildConfig.RUN_ANALYTICS_URL, BuildConfig.CLOUD_SAVE_URL);
        SiteGames.Device device = new SiteGames.Device() {
            @Override public boolean cancelled() { return closed; }

            // Mobile data, or a phone that can't say: the APK's own download asks first, and this
            // one isn't asked, so it waits for Wi-Fi
            @Override public boolean metered() {
                try {
                    return network == null || network.isActiveNetworkMetered();
                } catch (RuntimeException exception) {
                    return true;
                }
            }

            @Override public long usableSpace() { return app.getFilesDir().getUsableSpace(); }
        };
        try {
            task = WORKER.submit(() -> {
                Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
                if (closed) return;
                try {
                    String base = baseUrl();
                    if (base == null) {
                        // Only clears what an app built with a website left
                        SiteGames.removeOthers(sitesDir, null, false);
                        return;
                    }
                    SiteGames.Source apk = path -> {
                        try {
                            return assets.open(GAME + path);
                        } catch (FileNotFoundException exception) {
                            return null;
                        }
                    };
                    Set<String> chunks = apkChunks(assets);
                    SiteGames.Apk game = new SiteGames.Apk(new SiteGames.Game(apk, readList(apk)),
                            SiteGames.readBuild(apk.open("build.json")), BuildConfig.VERSION_NAME, chunks);
                    Log.i(TAG, SiteGames.update(base, this::fetch, sitesDir, game, inUse, addresses, device));
                    if (closed) return;
                    File next = SiteGames.pick(sitesDir, BuildConfig.VERSION_NAME, chunks);
                    if (!Objects.equals(next, inUse)) {
                        main.post(() -> {
                            Runnable ready = this.onReady;
                            if (!closed && ready != null) ready.run();
                        });
                    }
                } catch (Exception exception) {
                    Log.w(TAG, "The website's build skipped", exception);
                }
            });
        } catch (RejectedExecutionException ignored) {
            // Never shut down, so not expected
        }
    }

    // The APK's own game-files.json, so its files are found by sha256 without reading them all
    private static SiteFiles readList(SiteGames.Source apk) {
        try {
            InputStream input = apk.open(SiteFiles.NAME);
            return input == null ? null : SiteFiles.parse(LimitedText.read(input, SiteGames.MAX_LIST_BYTES));
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
            // Closed meanwhile, after close() cut the connections it knew of
            if (closed) throw new SiteGames.CancelledException();
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

    /**
     * Stops a check or download. What's downloaded is kept, and the next update goes on from it.
     */
    void close() {
        closed = true;
        onReady = null;
        main.removeCallbacksAndMessages(null);
        if (task != null) task.cancel(true);
        for (HttpURLConnection request : connections) {
            try {
                request.disconnect();
            } catch (RuntimeException ignored) { }
        }
    }
}
