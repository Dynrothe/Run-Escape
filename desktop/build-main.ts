import { build } from "esbuild";

// The launcher, with the relay's address built in, as the game's is (VITE_COOP_URL)
await build({
    entryPoints: ["desktop/main.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    outfile: "desktop/out/main.cjs",
    logLevel: "warning",
    define: { __COOP_URL__: JSON.stringify(process.env.VITE_COOP_URL ?? "") },
});
