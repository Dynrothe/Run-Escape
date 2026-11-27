package io.jere.run_escape;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.util.Log;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONTokener;

/**
 * One-time, best-effort transfer of a save from the app's previous WebView-based releases into
 * the GeckoView build's own storage.
 *
 * Before this build, the game ran in android.webkit.WebView under a fixed intercepted origin
 * (https://appassets.androidplatform.net), and its save lived in that engine's own
 * window.localStorage under that origin - Chromium's own on-disk format, scoped to that one
 * origin. GeckoView is a different browser engine with its own separate storage implementation,
 * and LoopbackServer serves the game from a different origin (a real http://127.0.0.1 socket,
 * not that intercepted scheme), so an upgrading player's save is invisible to the new build on
 * both counts, not reachable by copying bytes, and not something either engine's own storage
 * migration (there is none across engines) would ever bridge on its own.
 *
 * This queries the OLD origin's save through a real, temporary android.webkit.WebView (the one
 * engine that can actually read Chromium's localStorage for that origin), using the exact same
 * WebViewAssetLoader + GamePathHandler setup the old MainActivity used, then hands the text off
 * for LoopbackServer to inject into the new origin's localStorage the next time the real game
 * page loads (see LoopbackServer.injectNativeBridge). The injected script only ever *sets* the
 * key if the new origin doesn't already have a save, so this is safe to retry or to run again on
 * a later launch without ever overwriting progress already made under the new engine.
 *
 * The one real risk this must not reintroduce is the WebView dependency this app's GeckoView
 * port exists to remove: a device with no usable system WebView (this project's whole reason for
 * being) must never crash or hang trying to construct one just to check for an old save. Guarded
 * three ways: WebView.getCurrentWebViewPackage() must report an installed provider before any
 * WebView is even constructed (null means there is nothing to migrate from in the first place,
 * since the old build could never have run there either); every step after that is wrapped in
 * try/catch; and a capped attempt counter stops retrying forever on a device where this
 * repeatedly fails or never calls back.
 */
final class LegacySaveMigrator {
    private static final String TAG = "LegacySaveMigrator";
    private static final String PREFS = "legacy-save-migration";
    private static final String KEY_ATTEMPTS = "attempts";
    private static final String KEY_SAVE = "migrated-save";
    private static final String KEY_DONE = "done";
    private static final int MAX_ATTEMPTS = 3;
    private static final long TIMEOUT_MS = 8000;

    private static final String OLD_ORIGIN = "https://appassets.androidplatform.net";
    private static final String OLD_GAME_URL = OLD_ORIGIN + "/assets/game/index.html";
    static final String SAVE_KEY = "rune-survivors-save";

    private LegacySaveMigrator() {
    }

    /** The save text migrated on a previous launch, if any is waiting to be injected. */
    static String pendingSave(Context context) {
        return prefs(context).getString(KEY_SAVE, null);
    }

    /** Clears the pending save once LoopbackServer has injected it into a served page. */
    static void clearPending(Context context) {
        prefs(context).edit().remove(KEY_SAVE).apply();
    }

    /**
     * Fires off a best-effort attempt in the background if one hasn't already succeeded or run
     * out of retries. Never throws; any failure here just means the player keeps whichever save
     * (if any) the new engine already has.
     */
    static void attemptIfNeeded(Context context, GamePathHandler games, Handler handler) {
        try {
            SharedPreferences prefs = prefs(context);
            if (prefs.getBoolean(KEY_DONE, false)) return;
            int attempts = prefs.getInt(KEY_ATTEMPTS, 0);
            if (attempts >= MAX_ATTEMPTS) return;
            if (WebViewUnavailable.check()) {
                // No WebView provider at all: nothing could have saved under the old engine on
                // this device either, so there is nothing to migrate from.
                prefs.edit().putBoolean(KEY_DONE, true).apply();
                return;
            }
            prefs.edit().putInt(KEY_ATTEMPTS, attempts + 1).apply();
            handler.post(() -> runAttempt(context, games, prefs));
        } catch (Exception e) {
            Log.w(TAG, "could not start migration attempt", e);
        }
    }

    private static void runAttempt(Context context, GamePathHandler games, SharedPreferences prefs) {
        WebView webView;
        try {
            webView = new WebView(context);
        } catch (Throwable e) {
            // A device can report a WebView package yet still fail to actually construct one
            // (corrupt/incompatible provider); this is exactly the failure mode the GeckoView
            // port exists to not depend on, so it must not take the rest of the app down with it.
            Log.w(TAG, "could not construct a WebView for migration", e);
            return;
        }
        Handler timeoutHandler = new Handler(context.getMainLooper());
        boolean[] finished = {false};
        Runnable giveUp = () -> {
            if (finished[0]) return;
            finished[0] = true;
            Log.w(TAG, "migration attempt timed out");
            destroy(webView);
        };
        try {
            webView.getSettings().setJavaScriptEnabled(true);
            webView.getSettings().setDomStorageEnabled(true);
            WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                    .addPathHandler("/assets/", games)
                    .build();
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public android.webkit.WebResourceResponse shouldInterceptRequest(
                        WebView view, android.webkit.WebResourceRequest request) {
                    return assetLoader.shouldInterceptRequest(request.getUrl());
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (finished[0]) return;
                    view.evaluateJavascript(
                            "window.localStorage.getItem(" + org.json.JSONObject.quote(SAVE_KEY) + ")",
                            value -> onResult(context, prefs, value, finished, timeoutHandler, giveUp, view));
                }
            });
            webView.setWebChromeClient(new WebChromeClient());
            timeoutHandler.postDelayed(giveUp, TIMEOUT_MS);
            webView.loadUrl(OLD_GAME_URL);
        } catch (Exception e) {
            Log.w(TAG, "migration attempt failed", e);
            finished[0] = true;
            timeoutHandler.removeCallbacks(giveUp);
            destroy(webView);
        }
    }

    private static void onResult(Context context, SharedPreferences prefs, String rawResult,
                                  boolean[] finished, Handler timeoutHandler, Runnable giveUp, WebView view) {
        if (finished[0]) return;
        finished[0] = true;
        timeoutHandler.removeCallbacks(giveUp);
        try {
            // evaluateJavascript's callback value is a JSON-encoded representation of the JS
            // value, so a string result arrives as a JSON string literal (quoted, escaped) and
            // needs one more decode to get the actual save text back out - "null" (unquoted, the
            // literal JS value) means there was nothing saved under the old origin.
            if (rawResult != null && !"null".equals(rawResult)) {
                Object decoded = new JSONTokener(rawResult).nextValue();
                if (decoded instanceof String && !((String) decoded).isEmpty()) {
                    prefs.edit().putString(KEY_SAVE, (String) decoded).apply();
                    Log.i(TAG, "migrated a save from the old WebView build");
                }
            }
            prefs.edit().putBoolean(KEY_DONE, true).apply();
        } catch (Exception e) {
            Log.w(TAG, "could not read the migration result", e);
        } finally {
            destroy(view);
        }
    }

    private static void destroy(WebView webView) {
        try {
            webView.stopLoading();
            webView.destroy();
        } catch (Exception ignored) {
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Isolated so a missing WebView class entirely (not just a missing provider) can't crash. */
    private static final class WebViewUnavailable {
        static boolean check() {
            try {
                return android.webkit.WebView.getCurrentWebViewPackage() == null;
            } catch (Throwable e) {
                return true;
            }
        }
    }
}
