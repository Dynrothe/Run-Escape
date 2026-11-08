// Build an offline browser check with the real simulation and guest protocol:
// node scripts/check-coop-background.mjs
// Open the printed file URL, start either clock, switch tabs, then return.
// "Stop drawing" also exercises occlusion without a visibility event.
// No production room, network connection, save, or account is used.
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "hints", "coop-background-check");
const source = `
import { Sim } from "./src/game/core/Sim";
import { emptyStats } from "./src/game/content/types";
import { makeGrid } from "./src/game/core/world/testGrid";
import { syncHash } from "./src/game/core/lockstep";
import { usePortableMath } from "./src/game/core/fmath";
import { CoopRun } from "./src/game/client/coop/CoopRun";
import { CoopTicker } from "./src/game/client/coop/CoopTicker";

usePortableMath(true);
let current;
let drawing = true;
const result = document.querySelector("pre");
function makeSim(focus) {
  return new Sim({ grid: makeGrid(Array(72).fill(".".repeat(72)), 1000, 1000),
    mapId: "lumbridge", characterId: "warrior", metaStats: emptyStats(), seed: 5,
    spawnX: 1036.5, spawnY: 1036.5,
    party: ["warrior", "wizard"].map(characterId => ({name: characterId, characterId, metaStats: emptyStats()})), focus });
}
function start(mode) {
  current?.stop();
  drawing = true;
  const ids = new Map([["host", 0], ["guest", 1]]);
  let host;
  let matching = true;
  let lastDelivery = performance.now();
  let largestGap = 0;
  const guest = new CoopRun(makeSim(1), false, {sendUp: m => host.receiveUp("guest", m), sendDown() {}}, ids, "host");
  host = new CoopRun(makeSim(0), true, {sendUp() {}, sendDown(m) {
    const now = performance.now();
    largestGap = Math.max(largestGap, now - lastDelivery);
    lastDelivery = now;
    guest.receiveDown(m);
    while (guest.canStep()) { guest.stepFrame(); guest.sim.takeEvents(); }
    matching = matching && syncHash(host.sim) === syncHash(guest.sim);
  }}, ids, "host");
  host.receiveUp("guest", {loaded: true});
  let accumulator = 0;
  const advance = ms => {
    accumulator += Math.min(ms, 200);
    while (accumulator >= 20) {
      accumulator -= 20;
      host.stepFrame(); host.sim.takeEvents();
    }
    host.flush();
  };
  let ticker;
  let worker;
  let backgroundAt = performance.now();
  let renderAt = performance.now();
  // The prior implementation starts its worker only when hidden and uses
  // separate elapsed-time clocks for rendering and worker notifications.
  const oldVisibility = () => {
    worker?.terminate(); worker = undefined;
    if (document.hidden) {
      backgroundAt = performance.now();
      const url = URL.createObjectURL(new Blob(["setInterval(() => postMessage(0), 20)"]));
      worker = new Worker(url); URL.revokeObjectURL(url);
      worker.onmessage = () => {
        const now = performance.now();
        if (document.hidden) advance(now - backgroundAt);
        backgroundAt = now;
      };
    }
  };
  if (mode === "fixed") ticker = new CoopTicker(advance, 20);
  else { document.addEventListener("visibilitychange", oldVisibility); oldVisibility(); }
  const phases = [];
  let phaseAt = performance.now();
  let phaseFrame = host.frame;
  let phase = document.hidden ? "hidden" : "visible";
  function mark(next) {
    const now = performance.now();
    const seconds = (now - phaseAt) / 1000;
    phases.push({phase, seconds: +seconds.toFixed(2), frames: host.frame - phaseFrame,
      fps: +((host.frame - phaseFrame) / seconds).toFixed(1), maxDeliveryGapMs: +largestGap.toFixed(1)});
    phaseAt = now; phaseFrame = host.frame; phase = next; largestGap = 0;
    show();
  }
  const visibility = () => mark(document.hidden ? "hidden" : drawing ? "visible" : "drawing stopped");
  document.addEventListener("visibilitychange", visibility);
  function show() {
    result.textContent = JSON.stringify({ mode, visible: !document.hidden, drawing,
      hostFrame: host.frame, guestFrame: guest.frame, matching,
      currentPhase: phase, maxDeliveryGapMs: +largestGap.toFixed(1), phases }, null, 2);
  }
  const display = setInterval(show, 500);
  current = {mark, render() {
    const now = performance.now();
    if (ticker) ticker.render(); else advance(now - renderAt);
    renderAt = now;
  }, stop() {
    mark("stopped"); clearInterval(display); ticker?.stop(); worker?.terminate();
    document.removeEventListener("visibilitychange", oldVisibility);
    document.removeEventListener("visibilitychange", visibility);
    current = undefined;
  }};
  show();
}
function draw() {
  if (drawing) current?.render();
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
document.querySelector("#fixed").onclick = () => start("fixed");
document.querySelector("#previous").onclick = () => start("previous");
document.querySelector("#pause").onclick = () => { drawing = false; current?.mark("drawing stopped"); };
document.querySelector("#resume").onclick = () => { drawing = true; current?.mark("visible"); };
document.querySelector("#stop").onclick = () => current?.stop();
`;
const bundle = await build({
    stdin: { contents: source, resolveDir: root, loader: "js" },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    define: { "import.meta.env.DEV": "false", "import.meta.env.MODE": '"test"' },
});
await mkdir(output, { recursive: true });
await writeFile(
    path.join(output, "index.html"),
    `<!doctype html>
<meta charset="utf-8"><title>Co-op background check</title>
<style>body{font:16px system-ui;margin:32px}button{font:inherit;margin:4px;padding:8px}pre{font-size:15px}</style>
<h1>Co-op background check</h1><p>Offline host and guest simulations. Target: 50 frames/second with matching state.</p>
<button id="previous">Start previous clock</button><button id="fixed">Start fixed clock</button>
<button id="pause">Stop drawing</button><button id="resume">Resume drawing</button><button id="stop">Stop test</button>
<p><a href="away.html" target="_blank">Open away tab</a></p><pre>Ready</pre>
<script>${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`,
);
await writeFile(
    path.join(output, "away.html"),
    "<!doctype html><title>Away tab</title><h1>Away tab</h1><p>Keep this tab active for at least 10 seconds, then return to the co-op background check.</p>",
);
console.log(pathToFileURL(path.join(output, "index.html")).href);
