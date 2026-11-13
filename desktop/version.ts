// The launcher's own version: Electron, this folder and the packaging, not the game. A release's
// manifest gives it as minLauncher. Only raise it when the launcher itself has to be replaced
// (see Desktop in docs/DEVELOPMENT.md): every player then has to download the new zip by hand.
export const LAUNCHER_VERSION = "1.0.0";

// The oldest Android app that can play the game this builds, by its own version (the game's
// version its APK was released with). game-files.json gives it as minAndroid, and an older app
// plays the game in its APK rather than the website's. Raise it when the game needs something
// from the app that apps already out there don't have, such as an address RelayPolicy.java lets
// out or a message the page sends the app, and deploy such a build only after its APK's released.
export const MIN_ANDROID_APP = "0.0.0";
