// The launcher's own version: Electron, this folder and the packaging, not the game. A release's
// manifest gives it as minLauncher. Only raise it when the launcher itself has to be replaced
// (see Desktop in docs/DEVELOPMENT.md): every player then has to download the new zip by hand.
export const LAUNCHER_VERSION = "1.0.0";
