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

import androidx.core.content.FileProvider;
import androidx.core.content.ContextCompat;

import java.io.File;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Checks once on open. Android owns the download, its notification, and installation consent. */
final class AppUpdater {
    private final Activity activity;
    private final DownloadManager downloads;
    private final SharedPreferences pending;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile HttpURLConnection connection;
    private volatile boolean closed;
    private boolean resumed;
    private boolean verifying;
    private Runnable whenResumed;
    private AlertDialog dialog;

    private final BroadcastReceiver completed = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())
                    && intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) == downloadId()) {
                inspectDownload();
            }
        }
    };

    AppUpdater(Activity activity) {
        this.activity = activity;
        downloads = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        pending = activity.getSharedPreferences("app-update", Context.MODE_PRIVATE);
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        // DownloadManager runs outside this app. Always query our saved ID before acting on a broadcast.
        ContextCompat.registerReceiver(activity, completed, filter, ContextCompat.RECEIVER_EXPORTED);
        if (downloadId() != -1 && UpdateRelease.versionCode(pending.getString("version", "")) <= BuildConfig.VERSION_CODE) {
            // A completed install may have stopped the old process before it recorded the handoff.
            clearDownload();
        }
        if (downloadId() == -1 || pending.getBoolean("installer-opened", false)) checkOnOpen();
    }

    private long downloadId() { return pending.getLong("id", -1); }

    private void checkOnOpen() {
        worker.execute(() -> {
            try {
                UpdateRelease release = fetchRelease();
                if (release != null) main.post(() -> showWhenResumed(() -> offer(release)));
            } catch (Exception exception) {
                // Offline, rate-limited or unavailable: keep playing and try on the next launch.
                Log.i("AppUpdater", "Update check unavailable", exception);
            } finally {
                HttpURLConnection active = connection;
                if (active != null) active.disconnect();
                connection = null;
            }
        });
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

    private void offer(UpdateRelease release) {
        dialog = new AlertDialog.Builder(activity).setTitle("Run Escape " + release.version + " is available")
                .setMessage("You have " + BuildConfig.VERSION_NAME + ". Download the update ("
                        + Math.max(1, (release.size + 1048575) / 1048576) + " MB) from GitHub?\n\n"
                        + "Android will ask you to install it when it's ready. Installing closes the game, "
                        + "so finish your run first. Your saved progress is kept.")
                .setPositiveButton("Download update", (d, which) -> download(release))
                .setNegativeButton("Later", null).show();
    }

    private void download(UpdateRelease release) {
        try {
            if (downloads == null) throw new IOException("Download service unavailable");
            if (downloadId() != -1) downloads.remove(downloadId());
            pending.edit().clear().apply();
            File directory = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (directory == null) throw new IOException("Download storage unavailable");
            File apk = new File(directory, release.fileName());
            if (apk.exists() && !apk.delete()) throw new IOException("Old download could not be removed");
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(release.url))
                    .setTitle("Run Escape " + release.version)
                    .setDescription("Game update")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                    .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, release.fileName());
            long id = downloads.enqueue(request);
            pending.edit().putLong("id", id).putString("version", release.version)
                    .putLong("size", release.size).putBoolean("installer-opened", false).apply();
            Toast.makeText(activity, "Downloading update. See notifications for progress or to cancel.", Toast.LENGTH_LONG).show();
        } catch (Exception exception) {
            showError("The update could not be downloaded. Please check your connection and storage, then reopen the app to try again.");
        }
    }

    private void inspectDownload() {
        if (closed || !resumed || verifying || downloads == null || downloadId() == -1
                || pending.getBoolean("installer-opened", false)) return;
        try (Cursor cursor = downloads.query(new DownloadManager.Query().setFilterById(downloadId()))) {
            if (cursor == null || !cursor.moveToFirst()) {
                pending.edit().clear().apply(); // Cancelled through Android's download notification.
                return;
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status == DownloadManager.STATUS_FAILED) {
                clearDownload();
                showError("The download failed. Check your connection and storage, then reopen the app to try again.");
            } else if (status == DownloadManager.STATUS_SUCCESSFUL) {
                verifyAndInstall();
            }
        } catch (RuntimeException exception) {
            Log.w("AppUpdater", "Could not inspect update download", exception);
        }
    }

    private void verifyAndInstall() {
        verifying = true;
        String version = pending.getString("version", "");
        long expectedSize = pending.getLong("size", -1);
        worker.execute(() -> {
            try {
                File directory = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null || UpdateRelease.versionCode(version) <= BuildConfig.VERSION_CODE) {
                    throw new IOException("Update no longer needed");
                }
                File apk = new File(directory, "Run-Escape-" + version + "-android.apk");
                PackageInfo info = activity.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
                long code = info == null ? -1 : Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
                if (!apk.isFile() || apk.length() != expectedSize || info == null
                        || !activity.getPackageName().equals(info.packageName) || !version.equals(info.versionName)
                        || code <= BuildConfig.VERSION_CODE || info.applicationInfo == null
                        || info.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT) {
                    throw new IOException("APK does not match this update or device");
                }
                // Android's installer verifies the APK signature and its match to the installed app.
                main.post(() -> showWhenResumed(() -> install(apk)));
            } catch (Exception exception) {
                main.post(() -> showWhenResumed(() -> {
                    verifying = false;
                    clearDownload();
                    showError("This update could not be opened on your device. Reopen the app to try again, or get the APK from GitHub releases.");
                }));
            }
        });
    }

    private void install(File apk) {
        verifying = false;
        try {
            if (!activity.getPackageManager().canRequestPackageInstalls()) {
                // Do not repeat the dialog each time onResume is called after the player declines.
                pending.edit().putBoolean("installer-opened", true).apply();
                if (pending.getBoolean("permission-requested", false)) {
                    pending.edit().putBoolean("permission-requested", false).apply();
                    return; // Permission was declined; keep playing without another prompt.
                }
                dialog = new AlertDialog.Builder(activity).setTitle("Allow Run Escape to install updates")
                        .setMessage("In Android settings, enable Allow from this source, then return here to install the update.")
                        .setPositiveButton("Open settings", (d, which) -> {
                            try {
                                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                        Uri.parse("package:" + activity.getPackageName())));
                                pending.edit().putBoolean("installer-opened", false)
                                        .putBoolean("permission-requested", true).apply();
                            } catch (RuntimeException exception) {
                                showError("Android's install settings could not be opened. You can still install the APK from GitHub releases.");
                            }
                        }).setNegativeButton("Later", null).show();
                return;
            }
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(intent);
            pending.edit().putBoolean("installer-opened", true).putBoolean("permission-requested", false).apply();
        } catch (RuntimeException exception) {
            pending.edit().putBoolean("installer-opened", true).apply();
            showError("Android's installer could not be opened. You can still install the APK from GitHub releases.");
        }
    }

    void onResume() {
        resumed = true;
        if (whenResumed != null) {
            Runnable action = whenResumed;
            whenResumed = null;
            showWhenResumed(action);
        } else inspectDownload();
    }

    void onPause() { resumed = false; }

    private void showWhenResumed(Runnable action) {
        if (closed || activity.isFinishing()) return;
        if (!resumed) {
            whenResumed = action;
            return;
        }
        try { action.run(); }
        catch (RuntimeException exception) {
            verifying = false;
            Log.w("AppUpdater", "Could not show update", exception);
        }
    }

    private void clearDownload() {
        try { if (downloads != null && downloadId() != -1) downloads.remove(downloadId()); }
        catch (RuntimeException ignored) { }
        pending.edit().clear().apply();
    }

    private void showError(String message) {
        dialog = new AlertDialog.Builder(activity).setTitle("Update unavailable")
                .setMessage(message).setPositiveButton("Close", null).show();
    }

    void close() {
        closed = true;
        activity.unregisterReceiver(completed);
        if (dialog != null) dialog.dismiss();
        whenResumed = null;
        main.removeCallbacksAndMessages(null);
        worker.shutdownNow();
        HttpURLConnection active = connection;
        if (active != null) active.disconnect();
    }
}
