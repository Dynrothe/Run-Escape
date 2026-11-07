package io.jere.run_escape;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * Checks GitHub once when the app opens, and offers a newer APK. Android's DownloadManager
 * downloads it, and Android's installer checks its signature and asks for consent. What's kept
 * between launches, and what that leads to, is UpdatePlan's.
 */
final class AppUpdater {
    private static final String TAG = "AppUpdater";
    // Kept between launches: the download (its DownloadManager id, version and expected size), the
    // version the player put off and when, and a version whose APK can't be installed here
    private static final String ID = "id", VERSION = "version", SIZE = "size";
    private static final String SNOOZED = "snoozed", SNOOZED_AT = "snoozed-at", UNUSABLE = "unusable";

    private enum Apk { READY, INCOMPLETE, UNUSABLE }

    private final Activity activity;
    private final DownloadManager downloads;
    private final SharedPreferences saved;
    private final Handler main = new Handler(Looper.getMainLooper());
    // The check, the downloads' queries and the files, one at a time, off the game's thread
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile HttpURLConnection connection;
    private volatile boolean closed;
    // The worker's: the download already offered for installing (or found broken) on this visit
    private String handled = "";
    // The UI thread's
    private boolean resumed;
    private Runnable whenResumed;
    private AlertDialog dialog;
    // An APK waiting for the player to allow installs in Android's settings
    private File awaitingPermission;

    private final BroadcastReceiver completed = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())
                    && intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) == saved.getLong(ID, -1)) {
                inBackground(AppUpdater.this::inspectDownload);
            }
        }
    };

    /** opened is false when the activity is only made again (Try again, Reopen): no second check. */
    AppUpdater(Activity activity, boolean opened) {
        this.activity = activity;
        downloads = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        if (downloads == null) throw new IllegalStateException("No download service");
        saved = activity.getSharedPreferences("app-update", Context.MODE_PRIVATE);
        // DownloadManager is another app, so this is exported. A broadcast only leads to a query of
        // our own saved download, so a forged one changes nothing.
        ContextCompat.registerReceiver(activity, completed,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
        if (opened) inBackground(this::checkOnOpen);
    }

    private void checkOnOpen() {
        UpdateRelease latest = null;
        try {
            latest = fetchRelease();
        } catch (Exception exception) {
            // Offline, rate-limited or unavailable: keep playing and try on the next launch.
            Log.i(TAG, "Update check unavailable", exception);
        } finally {
            HttpURLConnection active = connection;
            if (active != null) active.disconnect();
            connection = null;
        }
        if (closed) return;
        String latestVersion = latest == null ? null : latest.version;
        if (saved.getLong(ID, -1) != -1 && UpdatePlan.downloadOutdated(
                saved.getString(VERSION, ""), latestVersion, BuildConfig.VERSION_CODE)) {
            clearDownload();
        }
        if (saved.getLong(ID, -1) != -1) {
            inspectDownload();
        } else if (UpdatePlan.shouldOffer(latestVersion, saved.getString(SNOOZED, ""),
                saved.getLong(SNOOZED_AT, 0), saved.getString(UNUSABLE, ""), System.currentTimeMillis())) {
            UpdateRelease release = latest;
            prompt(() -> offerDownload(release));
        }
    }

    private UpdateRelease fetchRelease() throws Exception {
        HttpURLConnection request = (HttpURLConnection) new URL(UpdateRelease.LATEST_URL).openConnection();
        connection = request;
        request.setConnectTimeout(10000);
        request.setReadTimeout(10000);
        request.setInstanceFollowRedirects(false);
        request.setRequestProperty("Accept", "application/vnd.github+json");
        request.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
        request.setRequestProperty("User-Agent", "Run-Escape-Android/" + BuildConfig.VERSION_NAME);
        if (closed) throw new IOException("Closed");
        return UpdateRelease.readResponse(request, BuildConfig.VERSION_CODE);
    }

    private void offerDownload(UpdateRelease release) {
        show(new AlertDialog.Builder(activity).setTitle("Run Escape " + release.version + " is available")
                .setMessage("You have " + BuildConfig.VERSION_NAME + ". Download the update ("
                        + Math.max(1, (release.size + 1048575) / 1048576) + " MB) from GitHub?\n\n"
                        + "Once it's downloaded, you can install it straight away or the next time you "
                        + "open the game. Your saved progress is kept.")
                .setPositiveButton("Download update", (d, which) -> inBackground(() -> download(release)))
                .setNegativeButton("Later", (d, which) -> snooze(release.version))
                .setOnCancelListener(d -> snooze(release.version)));
    }

    private void snooze(String version) {
        saved.edit().putString(SNOOZED, version).putLong(SNOOZED_AT, System.currentTimeMillis()).apply();
    }

    private void download(UpdateRelease release) {
        try {
            clearDownload();
            File apk = apkFile(release.version);
            if (apk == null) throw new IOException("Download storage unavailable");
            if (apk.exists() && !apk.delete()) throw new IOException("Old download could not be removed");
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(release.url))
                    .setTitle("Run Escape " + release.version)
                    .setDescription("Game update")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                    .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS,
                            UpdateRelease.fileName(release.version));
            long id = downloads.enqueue(request);
            saved.edit().putLong(ID, id).putString(VERSION, release.version).putLong(SIZE, release.size).apply();
            main.post(() -> {
                if (!closed) {
                    Toast.makeText(activity, "Downloading update. See notifications for progress or to cancel.",
                            Toast.LENGTH_LONG).show();
                }
            });
        } catch (Exception exception) {
            Log.w(TAG, "Could not start the update's download", exception);
            prompt(() -> showError("The update could not be downloaded. Please check your connection and "
                    + "storage, then reopen the app to try again."));
        }
    }

    // A saved download that has finished is checked, then offered for installing once each visit
    private void inspectDownload() {
        long id = saved.getLong(ID, -1);
        String version = saved.getString(VERSION, "");
        if (closed || id == -1 || version.equals(handled)) return;
        int status = -1;
        try (Cursor cursor = downloads.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor != null && cursor.moveToFirst()) {
                status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            }
        }
        if (status == -1) {
            // Cancelled from its notification, which is the same as Later
            clearDownload();
            snooze(version);
        } else if (status == DownloadManager.STATUS_FAILED) {
            clearDownload();
            prompt(() -> showError("The download failed. Check your connection and storage, then reopen "
                    + "the app to try again."));
        } else if (status == DownloadManager.STATUS_SUCCESSFUL) {
            handled = version;
            File apk = apkFile(version);
            if (apk == null) return; // Storage unavailable for now: the next visit tries again
            Apk result = check(apk, version);
            if (result == Apk.READY) {
                prompt(() -> offerInstall(version, apk));
                return;
            }
            clearDownload();
            if (result == Apk.UNUSABLE) {
                // Never offered again, so it isn't downloaded on every launch. A newer release is.
                saved.edit().putString(UNUSABLE, version).apply();
                prompt(() -> showError("Run Escape " + version + " can't be installed on this device, so "
                        + "it won't be offered again. You can keep playing this version."));
            } else {
                prompt(() -> showError("The update didn't download completely. Reopen the app to try again."));
            }
        }
        // Otherwise it's still downloading, or waiting for a network, as its notification says
    }

    private File apkFile(String version) {
        File directory = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        return directory == null ? null : new File(directory, UpdateRelease.fileName(version));
    }

    // Android's installer checks the signature against the installed app. This makes sure the file is
    // the whole of the update it should be, and that this phone can install it.
    @SuppressWarnings("deprecation")
    private Apk check(File apk, String version) {
        if (!apk.isFile() || apk.length() != saved.getLong(SIZE, -1)) return Apk.INCOMPLETE;
        PackageInfo info = activity.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (info == null || info.applicationInfo == null) return Apk.UNUSABLE;
        long code = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
        boolean matches = activity.getPackageName().equals(info.packageName) && version.equals(info.versionName)
                && code > BuildConfig.VERSION_CODE && info.applicationInfo.minSdkVersion <= Build.VERSION.SDK_INT;
        return matches ? Apk.READY : Apk.UNUSABLE;
    }

    // Asked, never opened by itself: the download often ends mid-run, and installing closes the game
    private void offerInstall(String version, File apk) {
        show(new AlertDialog.Builder(activity).setTitle("Run Escape " + version + " is ready to install")
                .setMessage("Installing closes the game, so finish your run first. Your saved progress is "
                        + "kept.\n\nIf you choose Later, it's offered again the next time you open the game.")
                .setPositiveButton("Install now", (d, which) -> install(apk))
                .setNegativeButton("Later", null));
    }

    private void install(File apk) {
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            show(new AlertDialog.Builder(activity).setTitle("Allow Run Escape to install updates")
                    .setMessage("In Android settings, enable Allow from this source, then return here to "
                            + "install the update.")
                    .setPositiveButton("Open settings", (d, which) -> {
                        try {
                            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + activity.getPackageName())));
                            awaitingPermission = apk;
                        } catch (RuntimeException exception) {
                            showError("Android's install settings could not be opened. You can still "
                                    + "install the APK from GitHub releases.");
                        }
                    }).setNegativeButton("Later", null));
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", apk);
            activity.startActivity(new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
        } catch (RuntimeException exception) {
            Log.w(TAG, "Could not open the installer", exception);
            showError("Android's installer could not be opened. You can still install the APK from GitHub "
                    + "releases.");
        }
    }

    void onResume() {
        resumed = true;
        if (awaitingPermission != null) {
            // Back from Android's settings. Declined, the update waits for the next visit.
            File apk = awaitingPermission;
            awaitingPermission = null;
            if (activity.getPackageManager().canRequestPackageInstalls()) {
                install(apk);
                return;
            }
        }
        if (whenResumed != null) {
            Runnable action = whenResumed;
            whenResumed = null;
            showWhenResumed(action);
        }
        // A download that finished while the app was away
        inBackground(this::inspectDownload);
    }

    void onPause() { resumed = false; }

    // From the worker: shown once the game is in front
    private void prompt(Runnable action) {
        main.post(() -> showWhenResumed(action));
    }

    private void showWhenResumed(Runnable action) {
        if (closed || activity.isFinishing()) return;
        if (!resumed) {
            whenResumed = action;
            return;
        }
        try { action.run(); }
        catch (RuntimeException exception) { Log.w(TAG, "Could not show update", exception); }
    }

    private void show(AlertDialog.Builder builder) {
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
        dialog = builder.show();
    }

    private void showError(String message) {
        show(new AlertDialog.Builder(activity).setTitle("Update unavailable")
                .setMessage(message).setPositiveButton("Close", null));
    }

    // The worker's. Removing it from DownloadManager deletes its file too.
    private void clearDownload() {
        long id = saved.getLong(ID, -1);
        if (id != -1) {
            try { downloads.remove(id); }
            catch (RuntimeException exception) { Log.w(TAG, "Could not remove the old download", exception); }
        }
        saved.edit().remove(ID).remove(VERSION).remove(SIZE).apply();
    }

    private void inBackground(Runnable task) {
        if (closed) return;
        try {
            worker.execute(() -> {
                try {
                    if (!closed) task.run();
                } catch (RuntimeException exception) {
                    Log.w(TAG, "Update step failed", exception);
                }
            });
        } catch (RejectedExecutionException ignored) {
            // Closed meanwhile
        }
    }

    void close() {
        closed = true;
        activity.unregisterReceiver(completed);
        if (dialog != null) dialog.dismiss();
        whenResumed = null;
        awaitingPermission = null;
        main.removeCallbacksAndMessages(null);
        worker.shutdownNow();
        HttpURLConnection active = connection;
        if (active != null) active.disconnect();
    }
}
