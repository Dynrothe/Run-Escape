import { FLOOR_LIGHTS, SPOT_LIGHTS, lightColor } from "../content/lights";
import { FloorEffect, LightLook, LightingDef } from "../content/types";
import { Sim } from "../core/Sim";
import { EFFECT_BURN, EFFECT_ICE } from "../core/floorLayout";
import { gazeOccluders } from "../core/gazeSight";
import type { CinematicSpot } from "./CinematicView";
import { GazeShade } from "./GazeLight";
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
    addLight(
        x: number,
        z: number,
        radius: number,
        r: number,
        g: number,
        b: number,
        shade?: (x: number, z: number) => number,
    ): void;
    endLights(): void;
};

// A hero's gaze (HeroAbilityDef kind "gaze", the Owl's gaze): a blue-white light out to its
// length, with everything in its way casting a shadow (GazeShade), brought up as it winds up and
// let down over GAZE_FADE seconds after it strikes; the rest of the map's dimmed by up to
// GAZE_DIM meanwhile, so what's lit and what isn't reads at a glance
const GAZE_COLOR = [0.75, 0.88, 1.1];
const GAZE_DIM = 0.45;
const GAZE_FADE = 0.5;

export class SceneLights {
    private readonly color = new Float32Array(3);
    private seconds = 0;
    private readonly gazeShade = new GazeShade();
    // The last gaze, kept a moment past its strike as its light fades: whose, how far it reached,
    // its strength then, and when it struck (this.seconds)
    private gaze?: { hero: number; length: number; strength: number; struck?: number };
    // Ms the last frame's gaze shadows took (for frameProbe-style checks)
    gazeMs = 0;

    constructor(private readonly budget: LightBudget) {}

    reset(): void {
        this.budget.reset();
        this.gaze = undefined;
    }

    // This frame's ambient and lights, into target. px, py: the shown player as drawn (the
    // view's middle); glowLocs: the map's glowing scenery, if it has any; spots: an opening
    // cinematic's spot animations playing now (CinematicView.getSpots)
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
        spots?: readonly CinematicSpot[],
    ): void {
        this.seconds += deltaSeconds;
        const budget = this.budget;
        const tick = sim.tick + alpha;
        const gaze = this.updateGaze(sim, tick);
        target.setAmbient(
            sim.ambientAt(tick) * (1 - GAZE_DIM * (gaze?.strength ?? 0)),
            lighting.ambientColor ?? 0xffffff,
        );
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
        spots?.forEach((spot, i) => {
            const look = SPOT_LIGHTS.get(spot.spotAnim);
            if (look) {
                this.offer(lightKey(KIND_CINEMATIC, i), spot.x, spot.y, look.radius, look);
            }
        });

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
            if (exposed && sim.isExposed(enemy)) {
                const x = enemy.prevX + (enemy.x - enemy.prevX) * alpha;
                const y = enemy.prevY + (enemy.y - enemy.prevY) * alpha;
                this.offer(lightKey(KIND_EXPOSED, enemy.uid), x, y, exposed.radius, exposed);
            }
        }
        for (const hazard of sim.hazards) {
            const look = hazard.attack.ground?.light;
            if (look && sim.tick < hazard.endTick) {
                const key = lightKey(KIND_HAZARD, hazard.uid);
                this.offer(key, hazard.x, hazard.y, look.radius, look);
            }
        }

        target.beginLights(px, py);
        budget.end(px, py, deltaSeconds, (x, y, radius, r, g, b) => {
            target.addLight(x, y, radius, r, g, b);
        });
        if (gaze && gaze.strength > 0) {
            const started = performance.now();
            const at = getPlayerPose(sim, gaze.hero, alpha, localPose);
            const occluders = gazeOccluders(sim.grid, at.x, at.y, gaze.length + 1);
            const shade = this.gazeShade;
            shade.set(occluders, at.x, at.y, gaze.length);
            const s = gaze.strength;
            target.addLight(
                at.x,
                at.y,
                gaze.length,
                GAZE_COLOR[0] * s,
                GAZE_COLOR[1] * s,
                GAZE_COLOR[2] * s,
                (x, y) => shade.at(x, y),
            );
            this.gazeMs = performance.now() - started;
        }
        target.endLights();
    }

    // The gaze to light now, if any: the one winding up (strongest as it strikes), or the last
    // fading out
    private updateGaze(
        sim: Sim,
        tick: number,
    ): { hero: number; length: number; strength: number } | undefined {
        const winding = sim.getKitGazes()[0];
        if (winding) {
            const t =
                (tick - winding.startTick) / Math.max(1, winding.landTick - winding.startTick);
            this.gaze = {
                hero: winding.hero,
                length: winding.length,
                strength: 0.4 + 0.6 * Math.min(1, Math.max(0, t)),
            };
            return this.gaze;
        }
        const last = this.gaze;
        if (!last) {
            return undefined;
        }
        last.struck ??= this.seconds;
        const fade = 1 - (this.seconds - last.struck) / GAZE_FADE;
        if (fade <= 0) {
            this.gaze = undefined;
            return undefined;
        }
        return { ...last, strength: last.strength * fade };
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
