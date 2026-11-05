import type { Plugin } from "vite";

import config from "../vite.config";

// The game refuses a slim cache made for another build, by comparing caches.json's build (from
// build.json) with __BUILD_ID__, so the two have to be the same
test("build.json has the build the game is built with", () => {
    const plugin = (config.plugins as Plugin[]).find((p) => p?.name === "build-id-file")!;
    const emitted: { fileName?: string; source?: unknown }[] = [];
    const generateBundle = plugin.generateBundle as (this: unknown) => void;
    generateBundle.call({ emitFile: (file: (typeof emitted)[0]) => emitted.push(file) });

    expect(emitted.map((file) => file.fileName)).toEqual(["build.json"]);
    const { build } = JSON.parse(String(emitted[0].source));
    expect(build).toBe(JSON.parse(String(config.define!.__BUILD_ID__)));
    expect(build).toMatch(/^\d+\.\d+\.\d+-/);
});
