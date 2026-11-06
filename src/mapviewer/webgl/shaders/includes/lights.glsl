// The dark (MapDef.darkness): what's in a light (a player's, a fire's, a lantern's) is drawn as it
// always is, warmed by it, and what's out of every light at u_lightInfo.y of its brightness, a
// little blue: shapes, not detail. Lights are circles on the ground, by world tiles x and z, so a
// tall thing in one is lit to its top.

// Of its radius squared, how far a light stays at full strength (0.2: under half its radius); it
// fades out smoothly from there to its edge, so its rim is soft. Squared, so there's no square root
// for each light on every pixel.
#define LIGHT_CORE_SQ 0.2
// What a warm light (warmth 1) tints what it lights, strongest in its middle
#define LIGHT_WARM vec3(1.06, 0.9, 0.7)
// The dark's own tint, over its brightness: moonlight rather than grey
#define DARK_TINT vec3(0.86, 0.94, 1.22)

// What to multiply a colour by at pos (world tiles x, z). unlit (0 to 1): how much of it's drawn
// as if it were in a light anyway (a warning, a spell, a hit's flash).
vec3 getLight(vec2 pos, float unlit) {
    float lit = 0.0;
    float warm = 0.0;
    int count = int(u_lightInfo.x);
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= count) {
            break;
        }
        vec4 light = u_lights[i];
        vec2 d = pos - light.xy;
        float f = 1.0 - smoothstep(LIGHT_CORE_SQ, 1.0, dot(d, d) * light.z);
        // Lights that overlap add up, but never past full
        lit = lit + f - lit * f;
        warm = max(warm, f * light.w);
    }
    vec3 inLight = mix(vec3(1.0), LIGHT_WARM, warm * (1.0 - unlit));
    return mix(vec3(u_lightInfo.y) * DARK_TINT, inLight, max(lit, unlit));
}
