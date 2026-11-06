#version 300 es

precision highp float;

layout(std140, column_major) uniform;

#include "./includes/scene-uniforms.glsl";

uniform highp sampler2DArray u_textures;

in vec4 v_color;
in vec2 v_texCoord;
flat in uint v_texId;
flat in float v_alphaCutOff;
in float v_fogAmount;
flat in vec4 v_interactId;
#ifdef ACTOR_EDGE
in vec2 v_edgePos;
flat in vec4 v_edge;
flat in float v_edgeWidth;
flat in vec2 v_edgeStretch;
#endif

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 interactId;

void main() {
    vec4 textureColor = texture(u_textures, vec3(v_texCoord, v_texId)).bgra;
    fragColor = pow(textureColor, vec4(vec3(u_brightness), 1.0)) *
        vec4(round(v_color.rgb * u_colorBanding) / u_colorBanding, v_color.a);
#ifdef DISCARD_ALPHA
    if ((v_texId == 0u && fragColor.a < 0.01) || (textureColor.a < v_alphaCutOff)) {
        discard;
    }
#endif
#ifdef ACTOR_EDGE
    // Light along a tile-sized actor's edges, strongest at the edge and fading in towards the
    // middle (the Wardens' floor's light from under its tiles)
    if (v_edge.a > 0.0) {
        // How far in from its nearest edge, in half tiles (a stretched slab's edge light is as
        // wide as a tile's)
        vec2 fromEdge = (1.0 - abs(v_edgePos)) * v_edgeStretch;
        float light = 1.0 - smoothstep(0.0, v_edgeWidth, min(fromEdge.x, fromEdge.y));
        fragColor.rgb = mix(fragColor.rgb, v_edge.rgb, v_edge.a * light * light);
    }
#endif
    fragColor = mix(fragColor, u_skyColor, v_fogAmount);
    fragColor.rgb *= u_wash.rgb;
    interactId = v_interactId;
}
