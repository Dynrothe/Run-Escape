import { build } from "esbuild";

// Build the launcher with the same relay, analytics and cloud-save addresses as the game.
await build({
    entryPoints: ["desktop/main.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    outfile: "desktop/out/main.cjs",
    logLevel: "warning",
    define: {
        __COOP_URL__: JSON.stringify(process.env.VITE_COOP_URL ?? ""),
        __RUN_ANALYTICS_URL__: JSON.stringify(process.env.VITE_RUN_ANALYTICS_URL ?? ""),
        __CLOUD_SAVE_URL__: JSON.stringify(process.env.VITE_CLOUD_SAVE_URL ?? ""),
        // The website whose build the app keeps to (desktop/siteFiles.ts)
        __GAME_SITE_URL__: JSON.stringify(process.env.GAME_SITE_URL ?? ""),
    },
});
