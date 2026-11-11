import { FLOOR_LIGHTS, SPOT_LIGHTS, lightColor } from "../content/lights";
import { WARDENS } from "../content/tombs";
import { FloorEffect, LightLook, LightingDef } from "../content/types";
import { Sim, TICKS_PER_SECOND } from "../core/Sim";
import { EFFECT_BURN, EFFECT_ICE } from "../core/floorLayout";
import type { CinematicLight } from "./CinematicView";
import { LightBudget, lightKey } from "./LightBudget";
import { getPlayerPose } from "./PlayerPose";
import type { PlayerPose } from "./PlayerPose";

// Every light on a map with lighting (MapDef.lighting), gathered each frame where what gives it
// off is drawn, and handed to the LightBudget to pick what's drawn. The sim's lights (players,
// the map's, enemies') are what weapons aim by; the rest are only drawn and never touch the sim:
// glowing scenery, spells and effects (SPOT_LIGHTS), a floor's tiles (FLOOR_LIGHTS), bosses'
// windups and marks, and a boss's exposed core. Flicker and pulse are drawn only, too.

// What kind of thing a light's from, for its key (lightKey)
const KIND_PLAYER = 1;
const KIND_MAP = 2;
const KIND_ENEMY = 3;
const KIND_LEFT = 4;
const KIND_LOC = 5;
const KIND_PROJECTILE = 6;
const KIND_ENEMY_PROJECTILE = 7;
const KIND_EFFECT = 8;
const KIND_FLOOR = 9;
const KIND_WINDUP = 10;
const KIND_HAZARD = 11;
const KIND_EXPOSED = 12;
const KIND_CINEMATIC = 13;
const KIND_BULLET = 14;
const KIND_WARDENS = 15;
const SIM_KINDS = { player: KIND_PLAYER, map: KIND_MAP, enemy: KIND_ENEMY, left: KIND_LEFT };

// A floor's tiles further than this from the view's middle aren't offered (tiles)
const FLOOR_REACH = 14;
const FLOOR_EFFECTS: Partial<Record<number, FloorEffect>> = {
    [EFFECT_BURN]: "burn",
    [EFFECT_ICE]: "ice",
};

// Where a lit map's glowing scenery stands (RegionData.glowLocs): loc id, x, y in world tiles
export type GlowLocs = Float32Array;
export const GLOW_LOC_STRIDE = 3;

export type LightTarget = {
    setAmbient(level: number, color: number): void;
    beginLights(x: number, y: number): void;
    addLight(x: number, z: number, radius: number, r: number, g: number, b: number): void;
    endLights(): void;
};

export class SceneLights {
    private readonly color = new Float32Array(3);
    private seconds = 0;

    constructor(private readonly budget: LightBudget) {}

    reset(): void {
        this.budget.reset();
    }

    // This frame's ambient and lights, into target. px, py: the shown player as drawn (the
    // view's middle); glowLocs: the map's glowing scenery, if it has any; cinematic: a playing
    // cinematic's lights (CinematicView.getLights)
    update(
        target: LightTarget,
        sim: Sim,
        lighting: LightingDef,
        alpha: number,
        viewHero: number,
        localPose: PlayerPose | undefined,
        px: number,
        py: number,
        deltaSeconds: number,
        glowLocs: GlowLocs | undefined,
        cinematic?: readonly CinematicLight[],
    ): void {
        this.seconds += deltaSeconds;
        const budget = this.budget;
        const tick = sim.tick + alpha;
        target.setAmbient(sim.ambientAt(tick), lighting.ambientColor ?? 0xffffff);
        budget.begin();

        for (const light of sim.lights) {
            let { x, y } = light;
            if (light.hero !== undefined) {
                const pose = getPlayerPose(sim, light.hero, alpha, localPose);
                x = pose.x;
                y = pose.y;
            } else if (light.enemy) {
                x = light.enemy.prevX + (light.enemy.x - light.enemy.prevX) * alpha;
                y = light.enemy.prevY + (light.enemy.y - light.enemy.prevY) * alpha;
            }
            const key = lightKey(SIM_KINDS[light.kind], light.id);
            this.offer(key, x, y, light.radius, light.look, light.hero === viewHero);
        }

        if (glowLocs && lighting.locs) {
            for (let i = 0; i < glowLocs.length; i += GLOW_LOC_STRIDE) {
                const look = lighting.locs[glowLocs[i]];
                if (look) {
                    const key = lightKey(KIND_LOC, i);
                    this.offer(key, glowLocs[i + 1], glowLocs[i + 2], look.radius, look);
                }
            }
        }

        for (const p of sim.projectiles) {
            const look = SPOT_LIGHTS.get(p.spotAnim);
            if (look) {
                const x = p.prevX + (p.x - p.prevX) * alpha;
                const y = p.prevY + (p.y - p.prevY) * alpha;
                this.offer(lightKey(KIND_PROJECTILE, p.uid), x, y, look.radius, look);
            }
        }
        for (const p of sim.enemyProjectiles) {
            const look = p.attack.spotAnim !== undefined && SPOT_LIGHTS.get(p.attack.spotAnim);
            if (look) {
                const x = p.prevX + (p.x - p.prevX) * alpha;
                const y = p.prevY + (p.y - p.prevY) * alpha;
                this.offer(lightKey(KIND_ENEMY_PROJECTILE, p.uid), x, y, look.radius, look);
            }
        }
        for (const effect of sim.effects) {
            const look = SPOT_LIGHTS.get(effect.spotAnim);
            if (look) {
                const key = lightKey(KIND_EFFECT, effect.uid);
                this.offer(key, effect.x, effect.y, look.radius, look);
            }
        }

        const floor = sim.floor;
        if (floor) {
            const x0 = Math.max(floor.x0, Math.floor(px - FLOOR_REACH));
            const x1 = Math.min(floor.x0 + floor.sizeX - 1, Math.floor(px + FLOOR_REACH));
            const y0 = Math.max(floor.y0, Math.floor(py - FLOOR_REACH));
            const y1 = Math.min(floor.y0 + floor.sizeY - 1, Math.floor(py + FLOOR_REACH));
            for (let ty = y0; ty <= y1; ty++) {
                for (let tx = x0; tx <= x1; tx++) {
                    const effect = FLOOR_EFFECTS[floor.effectAt(tx, ty, sim.tick)];
                    const look = effect && FLOOR_LIGHTS[effect];
                    if (look) {
                        const key = lightKey(
                            KIND_FLOOR,
                            (ty - floor.y0) * floor.sizeX + tx - floor.x0,
                        );
                        this.offer(key, tx + 0.5, ty + 0.5, look.radius, look);
                    }
                }
            }
        }

        for (const enemy of sim.enemies) {
            if (enemy.dead || !enemy.boss) {
                continue;
            }
            const windup = enemy.bossState?.windup;
            const look = windup?.attack.light;
            if (windup && look) {
                // Growing as the hit comes
                const t = Math.min(
                    1,
                    Math.max(
                        0,
                        (tick - windup.startTick) / Math.max(1, windup.landTick - windup.startTick),
                    ),
                );
                const spots = windup.targets.length > 0 ? windup.targets : [enemy];
                spots.forEach((spot, i) => {
                    const key = lightKey(KIND_WINDUP, enemy.uid * 64 + (i % 64));
                    this.offer(key, spot.x, spot.y, look.radius, look, false, 0.3 + 0.7 * t);
                });
            }
            const exposed = enemy.def.boss?.look?.exposedLight;
            const dark = enemy.def.boss?.look?.darkGlow;
            const phases = enemy.def.light?.phases;
            const x = enemy.prevX + (enemy.x - enemy.prevX) * alpha;
            const y = enemy.prevY + (enemy.y - enemy.prevY) * alpha;
            if (exposed && sim.isExposed(enemy)) {
                this.offer(lightKey(KIND_EXPOSED, enemy.uid), x, y, exposed.radius, exposed);
            } else if (
                dark &&
                phases &&
                !phases.includes((enemy.bossState?.phase?.index ?? 0) + 1)
            ) {
                // Its own light's out: faintly seen all the same (BossLookDef.darkGlow)
                this.offer(lightKey(KIND_EXPOSED, enemy.uid), x, y, dark.radius, dark);
            }
        }
        // The Wardens: the obelisk flickering open, pyramids about to hit, the enrage's
        // lightning's shadows
        const wardens = sim.tombsWardens;
        if (wardens) {
            const obelisk = sim.enemies.find((e) => e.uid === wardens.obeliskUid);
            const flicker = WARDENS.flicker;
            if (flicker && obelisk && !obelisk.dead && sim.obeliskFlickers(obelisk)) {
                const key = lightKey(KIND_EXPOSED, obelisk.uid);
                this.offer(key, obelisk.x, obelisk.y, flicker.light.radius, flicker.light);
            }
            const pyramids = WARDENS.pyramids;
            const cell = pyramids.light;
            if (cell) {
                const first = pyramids.firstHit * TICKS_PER_SECOND;
                wardens.pyramids.forEach((pyramid, i) => {
                    const since = tick - pyramid.startTick;
                    if (since >= 0 && since < first) {
                        const half = pyramids.cell / 2;
                        const key = lightKey(KIND_WARDENS, i);
                        this.offer(key, pyramid.x + half, pyramid.y + half, cell.radius, cell);
                    }
                });
            }
            wardens.marks.forEach((mark, i) => {
                if (mark.light && tick >= mark.from && tick < mark.to) {
                    const key = lightKey(KIND_WARDENS, 1_000_000 + i);
                    this.offer(key, mark.x, mark.y, mark.light.radius, mark.light);
                }
            });
        }
        for (const hazard of sim.hazards) {
            const look = hazard.light ?? hazard.attack.ground?.light;
            if (look && sim.tick < hazard.endTick) {
                const key = lightKey(KIND_HAZARD, hazard.uid);
                this.offer(key, hazard.x, hazard.y, look.radius, look);
            }
        }
        // A glow under each of a pattern's bullets that has one (BulletPatternDef.glow)
        const bullets = sim.bullets;
        for (let i = 0; i < bullets.count; i++) {
            const slot = bullets.order[i];
            const glow = sim.bulletSources[bullets.source[slot]]?.attack.pattern?.glow;
            if (glow) {
                const x = bullets.prevX[slot] + (bullets.x[slot] - bullets.prevX[slot]) * alpha;
                const y = bullets.prevY[slot] + (bullets.y[slot] - bullets.prevY[slot]) * alpha;
                this.offer(lightKey(KIND_BULLET, slot), x, y, glow.radius, glow);
            }
        }
        // A cinematic's, while it plays (CinematicView.getLights)
        cinematic?.forEach((light, i) => {
            this.offer(
                lightKey(KIND_CINEMATIC, i),
                light.x,
                light.y,
                light.look.radius,
                light.look,
            );
        });

        target.beginLights(px, py);
        budget.end(px, py, deltaSeconds, (x, y, radius, r, g, b) => {
            target.addLight(x, y, radius, r, g, b);
        });
        target.endLights();
    }

    // One light, its flicker and pulse on its strength
    private offer(
        key: number,
        x: number,
        y: number,
        radius: number,
        look: LightLook,
        first = false,
        strength = 1,
    ): void {
        const color = this.color;
        lightColor(look, color);
        const s = strength * this.waver(look, key);
        this.budget.add(key, x, y, radius, color[0] * s, color[1] * s, color[2] * s, first);
    }

    // How much of its strength a light has now, with its flicker and pulse: a few sines out of
    // step, each light its own way (by its key), so fires don't flicker as one
    private waver(look: LightLook, key: number): number {
        let s = 1;
        const t = this.seconds;
        const flicker = look.flicker;
        if (flicker) {
            const k = (key % 997) * 0.37;
            const n =
                0.5 +
                0.25 * Math.sin(t * 9.1 + k) +
                0.15 * Math.sin(t * 17.3 + k * 2.1) +
                0.1 * Math.sin(t * 31.7 + k * 3.3);
            s *= 1 - flicker * n;
        }
        const pulse = look.pulse;
        if (pulse) {
            s *= 1 - pulse.amount * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / pulse.seconds));
        }
        return s;
    }
}
