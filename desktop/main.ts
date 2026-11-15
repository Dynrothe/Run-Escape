import { BrowserWindow, Menu, app, dialog, session, shell } from "electron";
import { existsSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import path from "node:path";

import { cloudSaveUrl, isCloudSaveRequest } from "../src/util/cloudSaveUrl";
import { runAnalyticsUrl } from "../src/util/runAnalyticsUrl";
import { GameFolder, canRun, pickGameFolder } from "./gameFiles";
import { GAME_ORIGIN, getRelayOrigin, serveGame } from "./gameServer";
import {
    UpdateCheck,
    checkForUpdate,
    installUpdate,
    readInstalledGames,
    removeOldGames,
} from "./gameUpdate";
import { GITHUB_SOURCE } from "./releaseSource";
import { siteBaseUrl, whyNotFollow } from "./siteFiles";
import {
    checkSite,
    findBuild,
    installSiteBuild,
    noteSiteBuild,
    readSiteGames,
    removeOldSiteGames,
    updateForLaunch,
} from "./siteUpdate";
import { LAUNCHER_VERSION } from "./version";

const isDev = !app.isPackaged;

// Saves and updates live here, not beside the exe, so they outlast the zip's folder being moved
// or deleted. The folder's name and the partition are part of where saves are, like GAME_ORIGIN:
// don't change them. A dev run gets its own, so it can't touch a real save.
app.setName("Run Escape");
app.setPath("userData", path.join(app.getPath("appData"), isDev ? "Run Escape Dev" : "Run Escape"));
const GAME_PARTITION = "persist:game";

// The game files bundled with this launcher. Their version is the app's, set by package.json.
const bundledGame: GameFolder = {
    version: app.getVersion(),
    path: isDev ? path.join(app.getAppPath(), "dist") : path.join(process.resourcesPath, "game"),
};

// The folder the game's served from. Nothing's loaded from it until the update's finished.
let gameRoot = bundledGame.path;
let gameWindow: BrowserWindow | undefined;

const log = (message: string) =>
    appendFile(
        path.join(app.getPath("userData"), "launcher.log"),
        `${new Date().toISOString()} ${message}\n`,
    ).catch(() => {});

// The relay, from the build (see build-main.ts). Empty for a build with none.
declare const __COOP_URL__: string;
declare const __RUN_ANALYTICS_URL__: string;
declare const __CLOUD_SAVE_URL__: string;
// The website whose build the app plays (GAME_SITE_URL, see build-main.ts). Without it, or when it
// can't be reached, the app takes GitHub's releases.
declare const __GAME_SITE_URL__: string;
const siteBase = siteBaseUrl(__GAME_SITE_URL__);

function openExternally(url: string): void {
    if (/^https?:\/\//.test(url)) {
        void shell.openExternal(url);
    }
}

function lockDownContents(): void {
    app.on("web-contents-created", (_event, contents) => {
        contents.setWindowOpenHandler(({ url }) => {
            openExternally(url);
            return { action: "deny" };
        });
        const stayInGame = (event: Electron.Event, url: string) => {
            if (!url.startsWith(GAME_ORIGIN + "/")) {
                event.preventDefault();
                openExternally(url);
            }
        };
        contents.on("will-navigate", stayInGame);
        contents.on("will-redirect", stayInGame);
    });
}

function createSplash(): BrowserWindow {
    const splash = new BrowserWindow({
        width: 360,
        height: 130,
        frame: false,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        backgroundColor: "#2b2319",
        title: "Run Escape",
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    void splash.loadFile(path.join(__dirname, "..", "splash.html"));
    return splash;
}

function showSplashStatus(
    splash: BrowserWindow,
    text: string,
    fraction?: number,
    canSkip = false,
): void {
    if (!splash.isDestroyed()) {
        const args = [text, fraction, canSkip].map((arg) => JSON.stringify(arg) ?? "undefined");
        splash.webContents.executeJavaScript(`showStatus(${args.join(",")})`).catch(() => {});
    }
}

// Takes what the release check found: a newer game, or a release that needs a new launcher.
// Throws whatever goes wrong, which is only logged: the player gets to play what they have.
async function takeRelease(
    splash: BrowserWindow,
    check: UpdateCheck,
    current: GameFolder,
    signal: AbortSignal,
): Promise<void> {
    if (check.kind === "launcher") {
        const { response } = await dialog.showMessageBox(splash, {
            type: "info",
            title: "Run Escape",
            message: `Run Escape ${check.version} needs a new download`,
            detail: "Your saves are safe, and you can keep playing this version for now.",
            buttons: check.releasePage ? ["Open download page", "Play now"] : ["Play now"],
            defaultId: 0,
        });
        if (check.releasePage && response === 0) {
            openExternally(check.releasePage);
        }
    } else if (check.kind === "update") {
        const { version } = check.manifest;
        const text = `Updating to ${version}...`;
        showSplashStatus(splash, text, 0, true);
        // Only the cache's chunks this game hasn't got are downloaded
        await installUpdate(
            check.manifest,
            check.zipUrl,
            GITHUB_SOURCE,
            app.getPath("userData"),
            signal,
            (fraction) => showSplashStatus(splash, text, fraction ?? 0, true),
            undefined,
            check.split,
            [current.path],
            (e) => void log(`The split update failed, so it's the whole zip: ${e}`),
        );
        await log(`Updated to ${version}`);
    }
}

// Brings the game to the website's build, so co-op can always join the website's players, and
// gives back its folder. Undefined when the website can't be followed: the release is taken
// instead. Whatever goes wrong is only logged.
async function followSite(
    splash: BrowserWindow,
    base: string,
    folders: GameFolder[],
    current: GameFolder,
    signal: AbortSignal,
): Promise<GameFolder | undefined> {
    const dataDir = app.getPath("userData");
    try {
        const site = await checkSite(base, signal);
        const why = whyNotFollow(site.files, LAUNCHER_VERSION, {
            coopUrl: __COOP_URL__,
            runAnalyticsUrl: __RUN_ANALYTICS_URL__,
            cloudSaveUrl: __CLOUD_SAVE_URL__,
        });
        if (why) {
            await log(`Not following the website: ${why}`);
            return undefined;
        }
        let folder = await findBuild(folders, site.files.build);
        if (!folder) {
            const text = `Updating to ${site.files.version}...`;
            showSplashStatus(splash, text, 0, true);
            folder = await installSiteBuild(
                site,
                base,
                dataDir,
                signal,
                (fraction) => showSplashStatus(splash, text, fraction, true),
                [current.path],
            );
            await log(`Updated to the website's ${site.files.build}`);
        }
        await noteSiteBuild(dataDir, site.files.build).catch(
            (e) => void log(`The website's build wasn't noted: ${e}`),
        );
        return folder;
    } catch (e) {
        await log(`The website's build skipped: ${e}`);
        showSplashStatus(splash, "Checking for updates...");
        return undefined;
    }
}

function openGame(): BrowserWindow {
    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: "#000000",
        title: "Run Escape",
        webPreferences: {
            partition: GAME_PARTITION,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,
        },
    });
    window.webContents.on("before-input-event", (event, input) => {
        if (input.type === "keyDown" && input.key === "F11") {
            event.preventDefault();
            window.setFullScreen(!window.isFullScreen());
        }
    });
    // Saves are in localStorage, which Chromium writes out a little later: don't leave that to
    // a shutdown going well
    window.on("close", () => session.fromPartition(GAME_PARTITION).flushStorageData());
    window.once("ready-to-show", () => window.show());
    void window.loadURL(GAME_ORIGIN + "/");
    return window;
}

async function start(): Promise<void> {
    Menu.setApplicationMenu(null);
    const gameSession = session.fromPartition(GAME_PARTITION);
    // Everything's the game's own but the relay, the run collector and cloud saves, the only things
    // let out. The collector only by POST (and its preflight) to its one URL, and cloud saves only
    // to the Worker's /v1/, both without cookies or redirects.
    const relayOrigin = getRelayOrigin(__COOP_URL__);
    const analytics = runAnalyticsUrl(__RUN_ANALYTICS_URL__);
    const cloudSaves = cloudSaveUrl(__CLOUD_SAVE_URL__);
    gameSession.protocol.handle("https", (request) => {
        if (
            (request.url === analytics && ["POST", "OPTIONS"].includes(request.method)) ||
            isCloudSaveRequest(request.method, request.url, cloudSaves)
        ) {
            return gameSession.fetch(request, {
                bypassCustomProtocolHandlers: true,
                redirect: "error",
                credentials: "omit",
            });
        }
        if (new URL(request.url).origin === relayOrigin) {
            return gameSession.fetch(request, { bypassCustomProtocolHandlers: true });
        }
        return serveGame(gameRoot, request, relayOrigin, analytics, cloudSaves);
    });
    // The game only ever asks for these two
    gameSession.setPermissionRequestHandler((_contents, permission, callback) => {
        callback(permission === "fullscreen" || permission === "pointerLock");
    });

    const dataDir = app.getPath("userData");
    const installed = async () => [
        ...(await readInstalledGames(dataDir)),
        ...(await readSiteGames(dataDir)),
    ];
    const pick = async () => pickGameFolder(bundledGame, await installed(), LAUNCHER_VERSION);

    // No update check in dev: it plays the build it's pointed at
    let splash: BrowserWindow | undefined;
    let siteGame: GameFolder | undefined;
    if (!isDev) {
        const shown = createSplash();
        splash = shown;
        // Closing the splash skips every update, the website's and the release's
        const cancel = new AbortController();
        shown.once("closed", () => cancel.abort(new Error("Cancelled by the player")));
        showSplashStatus(shown, "Checking for updates...");
        const games = await installed();
        const current = pickGameFolder(bundledGame, games, LAUNCHER_VERSION);
        const runnable = [bundledGame, ...games].filter((game) => canRun(game, LAUNCHER_VERSION));
        try {
            siteGame = await updateForLaunch(
                cancel.signal,
                () =>
                    checkForUpdate(GITHUB_SOURCE, current.version, LAUNCHER_VERSION, cancel.signal),
                (check) => takeRelease(shown, check, current, cancel.signal),
                siteBase
                    ? () => followSite(shown, siteBase, runnable, current, cancel.signal)
                    : undefined,
            );
        } catch (e) {
            await log(`Update skipped: ${e}`);
        }
    }

    const game = isDev ? bundledGame : (siteGame ?? (await pick()));
    if (!existsSync(path.join(game.path, "index.html"))) {
        dialog.showErrorBox("Run Escape", `The game files are missing from ${game.path}.`);
        app.quit();
        return;
    }
    gameRoot = game.path;
    gameWindow = openGame();
    gameWindow.once("show", () => {
        if (splash && !splash.isDestroyed()) {
            splash.destroy();
        }
    });
    if (!isDev) {
        await removeOldGames(dataDir, game);
        await removeOldSiteGames(dataDir, game);
    }
    await log(`Launcher ${LAUNCHER_VERSION}, playing ${game.version} from ${game.path}`);
}

// Two copies would fight over the update folder and localStorage's files
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    lockDownContents();
    app.on("second-instance", () => {
        if (gameWindow) {
            gameWindow.restore();
            gameWindow.focus();
        }
    });
    // Closing the splash skips the update, so the app only ends with the game's window
    app.on("window-all-closed", () => {
        if (gameWindow) {
            app.quit();
        }
    });
    app.whenReady()
        .then(start)
        .catch(async (e) => {
            await log(`Failed to start: ${e}`);
            dialog.showErrorBox("Run Escape", String(e));
            app.quit();
        });
}
