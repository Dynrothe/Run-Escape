package io.jere.run_escape;

import android.content.Context;
import android.webkit.WebResourceResponse;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;

/**
 * Serves /assets/: the game at /assets/game/ from the website's build when one's installed
 * (SiteGames), and from the APK's assets otherwise. Either way it's the same address, which is
 * where saves are, so it must never move.
 */
final class GamePathHandler implements WebViewAssetLoader.PathHandler {
    private static final String GAME = "game/";

    private final WebViewAssetLoader.PathHandler assets;
    private final WebViewAssetLoader.PathHandler site;

    /** siteGame is an installed website build in the app's files, or null for the APK's game. */
    GamePathHandler(Context context, File siteGame) {
        assets = new WebViewAssetLoader.AssetsPathHandler(context);
        // Refuses a folder outside the app's own storage, and paths that climb out of it
        site = siteGame == null ? null : new WebViewAssetLoader.InternalStoragePathHandler(context, siteGame);
    }

    @Override
    public WebResourceResponse handle(String path) {
        if (site != null && path.startsWith(GAME)) return site.handle(path.substring(GAME.length()));
        return assets.handle(path);
    }
}
