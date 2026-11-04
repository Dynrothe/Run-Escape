import { runAnalyticsUrl } from "../../util/runAnalyticsUrl";
import type { Sim } from "../core/Sim";

type EarlyExit = "abandoned" | "disconnected";

// Capture ownership and size while the run is intact. A host can lose its relay and continue
// alone; it's still the original multiplayer run. Guests never send a second copy.
export function startRunAnalytics(
    sim: Sim,
    coop: { isHost: boolean; relay: "node" | "cloudflare" } | undefined,
    endpoint = import.meta.env.VITE_RUN_ANALYTICS_URL as string | undefined,
) {
    const url = runAnalyticsUrl(endpoint);
    if (!url || coop?.isHost === false || sim.map.dev || sim.testing) return undefined;
    const runId = globalThis.crypto?.randomUUID?.();
    if (!runId) return undefined;
    const playType = coop ? "multiplayer" : "singleplayer";
    const relay = coop?.relay ?? "none";
    const partySize = sim.heroes.length;
    let sent = false;
    return async (early: EarlyExit) => {
        if (sent) return;
        sent = true;
        try {
            // Shared kills and coins are already party totals. Damage, healing and highest hit
            // belong to individual heroes; aggregate those without copying names or loadouts.
            const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
            const damage = sum(sim.heroes.map((h) => sum(Object.values(h.damageBySource))));
            const report = {
                schemaVersion: 1,
                runId,
                endedAt: Date.now(),
                version: __APP_VERSION__,
                build: __BUILD_ID__,
                playType,
                relay,
                partySize,
                mapId: sim.map.id,
                mode: sim.expert ? "expert" : sim.hard ? "hard" : "normal",
                endless: sim.endless,
                round: sim.round,
                level: sim.level,
                outcome:
                    sim.state === "victory"
                        ? "completed"
                        : sim.state === "dead" && sim.heroes.every((h) => h.down)
                          ? "failed"
                          : early,
                // Simulation time at the end, unaffected by pause/result screens.
                durationSeconds: sim.seconds,
                kills: sim.kills,
                coins: sim.coinsGained,
                damageDealt: damage,
                damageTaken: sum(sim.heroes.map((h) => h.damageTaken)),
                healed: sum(sim.heroes.map((h) => h.healed)),
                highestHit: Math.max(...sim.heroes.map((h) => h.highestHit)),
                caskets: sim.casketsOpened,
                playersLeft: sim.heroes.filter((h) => h.left).length,
            };
            if (Object.values(report).some((v) => typeof v === "number" && !Number.isFinite(v)))
                return;
            // One bounded retry with the identical ID/body. Gameplay and saving never wait on this.
            const body = JSON.stringify(report);
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const response = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body,
                        mode: "cors",
                        credentials: "omit",
                        referrerPolicy: "no-referrer",
                        redirect: "error",
                        keepalive: true,
                        signal: AbortSignal.timeout(5000),
                    });
                    if (response.status < 500) return;
                } catch {
                    /* offline, timeout, or an interrupted response */
                }
                if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 750));
            }
        } catch {
            /* Optional analytics must never prevent a result or save. */
        }
    };
}
