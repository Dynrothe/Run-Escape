// Lights (MapDef.lighting): every pixel is its colour times the ambient's (u_ambient: 1 as the
// map always is, about 0.2 in the dark) and the light where it stands, with a faint haze of the
// light's colour on top. The light is a texture over the ground round the view (u_lightMap, two
// texels a tile, GameWebGLRenderer's light map), which every light's been added into on the CPU,
// so a pixel costs one texture read however many lights there are.

uniform sampler2D u_lightMap;

// The light map's texels go up to this (stored over it, 0 to 1)
#define LIGHT_MAP_MAX 2.0
// Of the light's colour, what's added on top as well as multiplied in: a haze that tints even what's
// dark or white
#define LIGHT_HAZE 0.08

// A colour (rgb) at pos (world tiles x, z), lit. unlit (0 to 1): how much of it's drawn at full
// brightness anyway (a warning, a spell, a hit's flash).
vec3 applyLight(vec3 color, vec2 pos, float unlit) {
    vec3 added = texture(u_lightMap, (pos - u_lightMapArea.xy) * u_lightMapArea.z).rgb * LIGHT_MAP_MAX;
    vec3 light = max(min(u_ambient.rgb + added, vec3(LIGHT_MAP_MAX)), vec3(unlit));
    return color * light + added * LIGHT_HAZE;
}
