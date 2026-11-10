import { FloorEffect, LightLook } from "./types";

// Lights that aren't any one map's (docs/DEVELOPMENT.md, Lights): what spells and effects give off,
// and floor tiles. Only drawn, and only on a map with lighting (MapDef.lighting), so every other
// map looks as it always has.

// A lantern's or a fire's colour: what a light is when it doesn't say
export const WARM_LIGHT = 0xffd49e;

// The fire spells' orange, the ice spells' blue and so on
const FIRE: LightLook = { radius: 2.5, color: 0xff8a3a, intensity: 0.9, flicker: 0.25 };
const FIRE_HIT: LightLook = { radius: 3.5, color: 0xff7a2a, intensity: 1, flicker: 0.3 };
const ICE: LightLook = { radius: 3, color: 0x8fd8ff, intensity: 0.8 };
const BLOOD: LightLook = { radius: 3, color: 0xff3a3a, intensity: 0.8 };
const SHADOW: LightLook = { radius: 3, color: 0xa070ff, intensity: 0.7 };
const HOLY: LightLook = { radius: 3, color: 0xe6f0ff, intensity: 0.8 };

// By spot animation id: projectiles, impacts and any other effect that plays it (weapons.ts has
// what each is)
export const SPOT_LIGHTS: ReadonlyMap<number, LightLook> = new Map<number, LightLook>([
    // Fire Strike, Bolt, Blast, Wave and Surge: projectiles, then impacts
    ...[100, 127, 130, 156, 1465].map((id): [number, LightLook] => [id, FIRE]),
    ...[101, 128, 131, 157, 1466].map((id): [number, LightLook] => [id, FIRE_HIT]),
    // Ice Burst and Barrage
    [363, ICE],
    [369, ICE],
    // Blood Burst and Barrage
    [376, BLOOD],
    [377, BLOOD],
    // Shadow Burst and Barrage
    [382, SHADOW],
    [383, SHADOW],
    // Saradomin Strike
    [76, HOLY],
    // The Tombs of Amascut: Het's beam and where it lands, the glowing circles to stand in (Verzik's
    // safe circle), Akkha's elements and his sands, Kephri's fireballs, the Wardens' pyramids and
    // shots, and their red lightning
    [2114, { radius: 1.6, color: 0xfff0b0, intensity: 0.7 }],
    [2064, { radius: 1.6, color: 0xfff0b0, intensity: 0.7 }],
    [2120, { radius: 3, color: 0xfff4c0, intensity: 1, flicker: 0.2 }],
    [
        1581,
        { radius: 1.4, color: 0x7fffd8, intensity: 0.45, pulse: { amount: 0.25, seconds: 1.5 } },
    ],
    [2257, { radius: 3, color: 0xa070ff, intensity: 0.8 }],
    [2256, { radius: 3, color: 0xa8dcff, intensity: 0.9, flicker: 0.35 }],
    [2259, { radius: 3, color: 0xc8f4ff, intensity: 0.7 }],
    [2258, { radius: 3, color: 0xff7a2a, intensity: 0.9, flicker: 0.3 }],
    [2260, { radius: 2, color: 0xff5a3a, intensity: 0.7 }],
    [2167, FIRE],
    [2157, FIRE_HIT],
    [2214, { radius: 2, color: 0xffd060, intensity: 0.6 }],
    [2237, { radius: 2.5, color: 0xffb040, intensity: 0.8 }],
    [2238, { radius: 2.5, color: 0x8fd8ff, intensity: 0.8 }],
    [2199, { radius: 1.6, color: 0xff3a2a, intensity: 0.5 }],
    [2200, { radius: 1.6, color: 0xff3a2a, intensity: 0.5 }],
    [2236, { radius: 3, color: 0xff3a2a, intensity: 1, flicker: 0.4 }],
]);

// A floor's tiles (FloorDef), by their effect: lava glows, ice faintly
export const FLOOR_LIGHTS: Partial<Record<FloorEffect, LightLook>> = {
    burn: { radius: 2, color: 0xff6a1a, intensity: 0.7, flicker: 0.2 },
    ice: { radius: 1.6, color: 0xa8e4ff, intensity: 0.25 },
};

// A look's colour times its intensity, 0 to 1 a channel before the intensity, into out
export function lightColor(look: LightLook, out: Float32Array | number[]): void {
    const color = look.color ?? WARM_LIGHT;
    const intensity = look.intensity ?? 1;
    out[0] = (((color >> 16) & 0xff) / 255) * intensity;
    out[1] = (((color >> 8) & 0xff) / 255) * intensity;
    out[2] = ((color & 0xff) / 255) * intensity;
}
