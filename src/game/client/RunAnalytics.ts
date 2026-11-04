import { runAnalyticsUrl } from "../../util/runAnalyticsUrl";
import type { Sim } from "../core/Sim";

type EarlyExit = "abandoned" | "disconnected";

// The build's collector, if it has one. Settings only offers the opt-out when there is.
export const RUN_ANALYTICS_URL = runAnalyticsUrl(
    import.meta.env.VITE_RUN_ANALYTICS_URL as string | undefined,
);

// The shape the collector reads (server/analytics/schema.mjs). Bump it, and teach the collector
// the new version alongside the old, when a field changes meaning or goes.
export const RUN_REPORT_VERSION = 1;

// Capture ownership and size while the run is intact. A host can lose its relay and continue
// alone; it's still the original multiplayer run. Guests never send a second copy.
// allowed: asked when the run ends, so turning the setting off mid-run keeps that run's report
export function startRunAnalytics(
    sim: Sim,
    coop: { isHost: boolean; relay: "node" | "cloudflare" } | undefined,
    endpoint = RUN_ANALYTICS_URL,
    allowed: () => boolean = () => true,
) {
    const url = runAnalyticsUrl(endpoint);
    if (!url || coop?.isHost === false || sim.map.dev || sim.testing) {
        return undefined;
    }
    const runId = globalThis.crypto?.randomUUID?.();
    if (!runId) {
        return undefined;
    }
    const playType = coop ? "multiplayer" : "singleplayer";
    const relay = coop?.relay ?? "none";
    const partySize = sim.heroes.length;
    // The starting party's adventurers, sorted so the same party always reads the same
    const characters = sim.heroes.map((hero) => hero.characterId).sort();
    let sent = false;
    return async (early: EarlyExit) => {
        if (sent) {
            return;
        }
        sent = true;
        if (!allowed()) {
            return;
        }
        try {
            // Shared kills and coins are already party totals. Damage, healing and highest hit
            // belong to individual heroes; aggregate those without copying names or loadouts.
            const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
            const damage = sum(sim.heroes.map((h) => sum(Object.values(h.damageBySource))));
            const report = {
                schemaVersion: RUN_REPORT_VERSION,
                runId,
                endedAt: Date.now(),
                version: __APP_VERSION__,
                build: __BUILD_ID__,
                playType,
                relay,
                partySize,
                characters,
                mapId: sim.map.id,
                mode: sim.expert ? "expert" : sim.hard ? "hard" : "normal",
                endless: sim.endless,
                round: sim.round,
                level: sim.level,
                // A party that fell is failed even if someone had left before; only the last
                // hero standing leaving makes it an early exit
                outcome:
                    sim.state === "victory"
                        ? "completed"
                        : sim.state === "dead" && !sim.endedByLeaving
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
            if (Object.values(report).some((v) => typeof v === "number" && !Number.isFinite(v))) {
                return;
            }
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
                    // A refusal is final: the same body would be refused again
                    if (response.status < 500) {
                        return;
                    }
                } catch {
                    /* offline, timeout, or an interrupted response */
                }
                if (attempt === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 750));
                }
            }
        } catch {
            /* Optional analytics must never prevent a result or save. */
        }
    };
}
