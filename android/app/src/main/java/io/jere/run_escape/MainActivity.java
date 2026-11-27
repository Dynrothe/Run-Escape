package io.jere.run_escape;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebRequestError;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;

/**
 * Runs the bundled game under GeckoView, served from a real loopback HTTP origin
 * (LoopbackServer) instead of WebView's intercepted appassets.androidplatform.net scheme.
 * GeckoView has no system-WebView dependency at all: it bundles its own browser engine, so a
 * device whose Android System WebView is missing, outdated, or not Google-certified (the
 * problem this replaces WebView to fix) plays the game exactly the same as any other device.
 */
public final class MainActivity extends Activity {
    private static final String RELEASES_URL = "https://github.com/Dynrothe/Run-Escape/releases";
    private static final String CHECK_PATH = "/game/offline-check.html";
    private static final String GAME_PATH = "/game/index.html";
    private static final int WEB_FILE_PICKER = 100;
    private static final int EXPORT_SAVE = 102;
    // The names the game gives its files (src/game/client/GameClient.ts), such as
    // run-escape-save-unreadable.json
    private static final Pattern SAVE_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,63}\\.json");
    private static final String DEFAULT_SAVE_NAME = "run-escape-save.json";
    private static final String PENDING_EXPORT = "pending-export.json";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final RelayPolicy relayPolicy =
            new RelayPolicy(BuildConfig.COOP_URL, BuildConfig.RUN_ANALYTICS_URL,
                    BuildConfig.CLOUD_SAVE_URL);
    private GeckoRuntime runtime;
    private GeckoSession session;
    private GeckoView geckoView;
    private LoopbackServer server;
    private FrameLayout root;
    private TextView loading;
    private Button menuButton;
    private GeckoSession.PromptDelegate.FilePrompt pendingFilePrompt;
    private GeckoResult<GeckoSession.PromptDelegate.PromptResponse> pendingFileResult;
    // The export waiting on the document picker's result, completed once it's written. Only
    // ever touched on the UI thread; exportSave() blocks a LoopbackServer worker thread on its
    // own CompletableFuture, which this field is not.
    private CompletableFuture<Boolean> pendingExportResult;
    private boolean gameReady;
    private boolean awaitingGameLoad;
    private boolean destroyed;
    private int diagnosticGeneration;
    private AppUpdater updater;
    private SiteUpdater siteUpdater;
    private File siteGame;
    private boolean siteReady;
    private String gameOrigin;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        hideSystemBars();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        try {
            updater = new AppUpdater(this, savedInstanceState == null);
        } catch (RuntimeException exception) {
            android.util.Log.i("AppUpdater", "Updates unavailable on this device", exception);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        buildGeckoView();

        try (InputStream ignored = getAssets().open("game/index.html")) {
            // All game files are packaged before making an installable release.
        } catch (Exception exception) {
            showMissingGameScreen();
            return;
        }

        try {
            GamePathHandler games;
            try {
                siteGame = SiteUpdater.pickGame(this);
                games = new GamePathHandler(this, siteGame);
            } catch (RuntimeException exception) {
                android.util.Log.w("SiteUpdater", "Playing the app's own game", exception);
                siteGame = null;
                games = new GamePathHandler(this, null);
            }

            server = new LoopbackServer(this, games, relayPolicy, this::exportSave);
            server.start();
            gameOrigin = server.origin();

            try {
                siteUpdater = new SiteUpdater(this, siteGame, this::onSiteGameReady);
            } catch (RuntimeException exception) {
                android.util.Log.w("SiteUpdater", "Not keeping to the website", exception);
            }

            loadGame();
        } catch (Exception exception) {
            android.util.Log.e("MainActivity", "Could not start the game server", exception);
            showCompatibilityScreen(true);
        }
    }

    private void buildGeckoView() {
        runtime = GeckoRuntime.create(this);
        session = new GeckoSession();
        session.open(runtime);
        session.setContentDelegate(new GameContentDelegate());
        session.setNavigationDelegate(new GameNavigationDelegate());
        session.setPromptDelegate(new GamePromptDelegate());
        session.setProgressDelegate(new GameProgressDelegate());

        geckoView = new GeckoView(this);
        geckoView.setSession(session);
        root.addView(geckoView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        loading = new TextView(this);
        loading.setText("Preparing your game…");
        loading.setTextColor(Color.WHITE);
        loading.setBackgroundColor(Color.BLACK);
        loading.setTextSize(18);
        loading.setGravity(Gravity.CENTER);
        root.addView(loading, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        menuButton = new Button(this);
        menuButton.setText("⋮");
        menuButton.setTextSize(24);
        menuButton.setTextColor(Color.WHITE);
        menuButton.setBackgroundColor(0x66000000);
        menuButton.setContentDescription("Game menu");
        menuButton.setPadding(0, 0, 0, 0);
        menuButton.setVisibility(View.GONE);
        menuButton.setOnClickListener(v -> showGameMenu());
        FrameLayout.LayoutParams buttonParams = new FrameLayout.LayoutParams(
                dp(40), dp(40), Gravity.TOP | Gravity.RIGHT);
        buttonParams.setMargins(dp(6), dp(6), dp(6), dp(6));
        root.addView(menuButton, buttonParams);
    }

    // Loads the diagnostic first (same check WebView used to run, now reporting through
    // document.title - see LoopbackServer.diagnosticHtml - since GeckoView has no public
    // generic evaluateJavascript to poll a JS variable the way WebView's did). The content
    // delegate's onTitleChange below advances to the real game, or shows the failure screen.
    private void loadGame() {
        if (destroyed || session == null || gameOrigin == null) return;
        gameReady = false;
        diagnosticGeneration++;
        if (loading != null) loading.setVisibility(View.VISIBLE);
        if (menuButton != null) menuButton.setVisibility(View.GONE);
        session.loadUri(gameOrigin + CHECK_PATH);
    }

    private void showMissingGameScreen() {
        loading.setText("The game files are missing from this copy.\nInstall the complete Run Escape release.");
        loading.setPadding(dp(24), dp(16), dp(24), dp(16));
    }

    private void showCompatibilityScreen(boolean retryAvailable) {
        diagnosticGeneration++;
        gameReady = false;
        if (destroyed || root == null) return;
        if (session != null) session.stop();
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(28), dp(16), dp(28), dp(16));
        panel.setBackgroundColor(Color.BLACK);
        TextView title = new TextView(this);
        title.setText("Run Escape could not start");
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        panel.addView(title);
        TextView message = new TextView(this);
        message.setText("Something on this device stopped the game from starting (its graphics "
                + "check failed, or its local server couldn't open). Trying again, or closing "
                + "other recently-opened apps first, sometimes fixes this.");
        message.setTextColor(0xffcccccc);
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        message.setPadding(0, dp(12), 0, dp(12));
        panel.addView(message);
        if (retryAvailable) {
            Button retry = new Button(this);
            retry.setText("Try again");
            retry.setOnClickListener(v -> recreate());
            panel.addView(retry);
        }
        Button close = new Button(this);
        close.setText("Close");
        close.setOnClickListener(v -> finish());
        panel.addView(close);
        root.addView(panel, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    }

    private void showGameMenu() {
        if (!gameReady || destroyed) return;
        String restart = siteReady ? "Restart on the latest version" : "Restart game";
        String[] options = {"Close menu", "Save help", restart, "About", "Exit"};
        new AlertDialog.Builder(this).setTitle("Run Escape")
                .setItems(options, (dialog, which) -> {
                    switch (which) {
                        case 1:
                            new AlertDialog.Builder(this).setTitle("Your progress")
                                    .setMessage("From the title screen, open Settings, then use Export "
                                            + "to save a copy or Import to restore one.\n\n"
                                            + "Progress is kept on this device, and updates keep it. "
                                            + "To update by hand, install the new version's APK over "
                                            + "this one: uninstalling first deletes your progress. "
                                            + "Export a copy before uninstalling or clearing the app's "
                                            + "data.")
                                    .setPositiveButton("Close", null).show();
                            break;
                        case 2:
                            // Made again, the activity serves the build that's ready
                            if (siteReady) recreate();
                            // The renderer can have gone while this menu was open
                            else if (session != null) loadGame();
                            break;
                        case 3:
                            new AlertDialog.Builder(this).setTitle("Run Escape " + BuildConfig.VERSION_NAME)
                                    .setMessage("Solo play works offline, including in airplane mode. "
                                            + "Co-op needs an internet connection and an available server.\n\nGame by Dynrothe.\n"
                                            + "Source: github.com/Dynrothe/Run-Escape\n\n"
                                            + "A fan project, not affiliated with Jagex. "
                                            + "Old School RuneScape assets belong to Jagex.\n\n"
                                            + "The app checks GitHub for updates when opened, and asks "
                                            + "before downloading one and before installing it. Co-op "
                                            + "needs everyone on the same version.\n\n"
                                            + siteAbout()
                                            + "Use Android's Back action to reopen this menu.")
                                    .setNeutralButton("Licenses", (about, action) -> showLicenses())
                                    .setNegativeButton("New versions", (about, action) -> openReleases())
                                    .setPositiveButton("Close", null).show();
                            break;
                        case 4: finish(); break;
                        default: break;
                    }
                    hideSystemBars();
                }).setOnDismissListener(dialog -> hideSystemBars()).show();
    }

    // What About says of the website's builds, when the app keeps to them
    private String siteAbout() {
        if (SiteUpdater.baseUrl() == null) return "";
        return "The app also keeps to the website's version of the game, so co-op matches it "
                + "between releases. On Wi-Fi, a new one downloads in the background, and plays "
                + "when you restart the game from this menu or reopen the app."
                + (siteGame == null ? "" : " Playing the website's " + siteGame.getName() + ".")
                + "\n\n";
    }

    // SiteUpdater's word that another build's ready. It never interrupts a run: Restart game plays it.
    private void onSiteGameReady() {
        if (destroyed || siteReady) return;
        siteReady = true;
        toast("The latest version is ready: restart the game from the menu (Back) to play it.");
    }

    // About's New versions button: the releases page, to install an APK by hand
    private void openReleases() {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(RELEASES_URL)));
        } catch (ActivityNotFoundException exception) {
            toast("No browser is available to open this link.");
        }
    }

    private void showLicenses() {
        String license;
        try (InputStream input = getAssets().open("archive/LICENSE-game.txt");
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            license = output.toString(StandardCharsets.UTF_8.name());
        } catch (Exception exception) {
            toast("The license text could not be opened.");
            return;
        }
        TextView text = new TextView(this);
        text.setText("Run Escape by Dynrothe\n"
                + "Source: github.com/Dynrothe/Run-Escape\n\n"
                + "Old School RuneScape assets belong to Jagex. "
                + "This fan project is not affiliated with or endorsed by Jagex.\n\n"
                + license);
        text.setTextSize(14);
        text.setTextIsSelectable(true);
        text.setPadding(dp(20), dp(12), dp(20), dp(12));
        ScrollView scroll = new ScrollView(this);
        scroll.addView(text);
        new AlertDialog.Builder(this).setTitle("Licenses and credits")
                .setView(scroll).setPositiveButton("Close", null)
                .setOnDismissListener(dialog -> hideSystemBars()).show();
    }

    // Called from LoopbackServer's per-request thread (never the UI thread): the game's
    // fetch('/__native/export') only resolves once this returns, matching the old
    // WebMessageListener reply contract (saveFile.ts's app.onmessage fires only once the file is
    // written). Blocks that one request thread while the document picker is open; every other
    // request (game assets) is served by its own thread, so nothing else stalls.
    private boolean exportSave(String name, String text) {
        if (destroyed || !gameReady) return false;
        CompletableFuture<Boolean> result = new CompletableFuture<>();
        handler.post(() -> startExport(name, text, result));
        try {
            return result.get();
        } catch (Exception exception) {
            return false;
        }
    }

    private void startExport(String name, String text, CompletableFuture<Boolean> result) {
        if (destroyed || isFinishing() || pendingExportResult != null) {
            result.complete(false);
            return;
        }
        try {
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            if (!SAVE_NAME.matcher(name).matches()) name = DEFAULT_SAVE_NAME;
            Files.write(pendingExportFile().toPath(), bytes);
            pendingExportResult = result;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(intent, EXPORT_SAVE);
        } catch (Exception exception) {
            pendingExportFile().delete();
            pendingExportResult = null;
            result.complete(false);
        }
    }

    private File pendingExportFile() {
        return new File(getCacheDir(), PENDING_EXPORT);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == WEB_FILE_PICKER) {
            if (pendingFileResult != null) {
                GeckoSession.PromptDelegate.FilePrompt prompt = pendingFilePrompt;
                GeckoResult<GeckoSession.PromptDelegate.PromptResponse> callback = pendingFileResult;
                pendingFilePrompt = null;
                pendingFileResult = null;
                if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null
                        && prompt != null) {
                    callback.complete(prompt.confirm(this, data.getData()));
                } else if (prompt != null) {
                    callback.complete(prompt.dismiss());
                } else {
                    callback.complete(null);
                }
            }
            return;
        }
        if (requestCode == EXPORT_SAVE) {
            CompletableFuture<Boolean> result = pendingExportResult;
            pendingExportResult = null;
            File file = pendingExportFile();
            boolean ok = false;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri document = data.getData();
                try {
                    byte[] save = Files.readAllBytes(file.toPath());
                    try (OutputStream stream = getContentResolver().openOutputStream(document, "wt")) {
                        if (stream == null) throw new IllegalStateException("No output stream");
                        stream.write(save);
                    }
                    ok = true;
                    toast("Save exported.");
                } catch (Exception exception) {
                    // The picker made the document already: don't leave an empty one that
                    // looks like a save
                    try {
                        DocumentsContract.deleteDocument(getContentResolver(), document);
                    } catch (Exception ignored) {
                    }
                    toast("The save could not be written. Please try again.");
                }
            }
            file.delete();
            if (result != null) result.complete(ok);
        }
    }

    private void reopenAfterContentProcessLoss() {
        if (destroyed) return;
        gameReady = false;
        diagnosticGeneration++;
        new AlertDialog.Builder(MainActivity.this).setTitle("The game stopped")
                .setMessage("Reopen the game to continue. Your saved progress is kept.")
                .setPositiveButton("Reopen", (dialog, which) -> recreate())
                .setNegativeButton("Close", (dialog, which) -> finish()).show();
    }

    private final class GameContentDelegate implements GeckoSession.ContentDelegate {
        // The diagnostic's verdict (LoopbackServer.diagnosticHtml), reported via document.title
        // since GeckoView has no generic evaluateJavascript to poll a variable the way WebView's
        // did - the same technique the feasibility spike proved out.
        @Override
        public void onTitleChange(GeckoSession session, String title) {
            if (destroyed || title == null || "pending".equals(title)) return;
            if ("passed".equals(title)) {
                diagnosticGeneration++;
                awaitingGameLoad = true;
                session.loadUri(gameOrigin + GAME_PATH);
            } else {
                showCompatibilityScreen(true);
            }
        }

        @Override
        public void onCrash(GeckoSession session) {
            reopenAfterContentProcessLoss();
        }

        @Override
        public void onKill(GeckoSession session) {
            reopenAfterContentProcessLoss();
        }
    }

    private final class GameProgressDelegate implements GeckoSession.ProgressDelegate {
        @Override
        public void onPageStart(GeckoSession session, String url) {
        }

        @Override
        public void onPageStop(GeckoSession session, boolean success) {
            if (destroyed || !awaitingGameLoad) return;
            awaitingGameLoad = false;
            if (!success) {
                showCompatibilityScreen(true);
                return;
            }
            gameReady = true;
            if (loading != null) loading.setVisibility(View.GONE);
            if (menuButton != null) menuButton.setVisibility(View.VISIBLE);
            handler.postDelayed(() -> {
                if (!destroyed && menuButton != null) menuButton.setVisibility(View.GONE);
            }, 6000);
            if (!getPreferences(MODE_PRIVATE).getBoolean("save-menu-hint", false)) {
                toast("Use Back to open the game menu.");
                getPreferences(MODE_PRIVATE).edit().putBoolean("save-menu-hint", true).apply();
            }
        }

        @Override
        public void onProgressChange(GeckoSession session, int progress) {
        }

        @Override
        public void onSecurityChange(GeckoSession session, SecurityInformation securityInfo) {
        }

        @Override
        public void onSessionStateChange(GeckoSession session, GeckoSession.SessionState state) {
        }
    }

    private final class GameNavigationDelegate implements GeckoSession.NavigationDelegate {
        @Override
        public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession session, LoadRequest request) {
            String url = request.uri;
            if (gameOrigin != null && url.startsWith(gameOrigin + "/")) {
                return GeckoResult.allow();
            }
            Uri uri = Uri.parse(url);
            if (request.hasUserGesture && "https".equals(uri.getScheme())
                    && ("github.com".equals(uri.getHost()) || "discord.gg".equals(uri.getHost())
                    || "discord.com".equals(uri.getHost()))) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    toast("No browser is available to open this link.");
                }
            }
            // Any other navigation away from the game's own origin is denied, not followed in
            // the app: the relay/analytics/cloud-save traffic goes out as fetch()/WebSocket
            // under this page's Content-Security-Policy, never as a page navigation.
            return GeckoResult.deny();
        }

        @Override
        public GeckoResult<GeckoSession> onNewSession(GeckoSession session, String uri) {
            return null;
        }

        @Override
        public void onCanGoBack(GeckoSession session, boolean canGoBack) {
        }

        @Override
        public void onCanGoForward(GeckoSession session, boolean canGoForward) {
        }

        @Override
        public GeckoResult<String> onLoadError(GeckoSession session, String uri, WebRequestError error) {
            if (gameOrigin != null && uri != null && uri.startsWith(gameOrigin)) {
                showCompatibilityScreen(true);
            }
            return null;
        }
    }

    // <input type=file> (save import): the GeckoView analog of WebChromeClient.onShowFileChooser.
    private final class GamePromptDelegate implements GeckoSession.PromptDelegate {
        @Override
        public GeckoResult<PromptResponse> onFilePrompt(GeckoSession session, FilePrompt prompt) {
            if (pendingFileResult != null) pendingFileResult.complete(prompt.dismiss());
            GeckoResult<PromptResponse> result = new GeckoResult<>();
            pendingFilePrompt = prompt;
            pendingFileResult = result;
            try {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivityForResult(intent, WEB_FILE_PICKER);
            } catch (ActivityNotFoundException exception) {
                pendingFilePrompt = null;
                pendingFileResult = null;
                toast("No file picker is available on this device.");
                result.complete(prompt.dismiss());
            }
            return result;
        }
    }

    private void handleBack() {
        if (gameReady) showGameMenu(); else finish();
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onPause() {
        if (updater != null) updater.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (updater != null) updater.onResume();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        if (updater != null) updater.close();
        if (siteUpdater != null) siteUpdater.close();
        diagnosticGeneration++;
        handler.removeCallbacksAndMessages(null);
        if (pendingFileResult != null) {
            GeckoSession.PromptDelegate.FilePrompt prompt = pendingFilePrompt;
            pendingFileResult.complete(prompt != null ? prompt.dismiss() : null);
            pendingFileResult = null;
        }
        if (pendingExportResult != null) {
            pendingExportResult.complete(false);
            pendingExportResult = null;
        }
        if (session != null) {
            session.close();
            session = null;
        }
        if (server != null) {
            server.shutdown();
            server = null;
        }
        super.onDestroy();
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
