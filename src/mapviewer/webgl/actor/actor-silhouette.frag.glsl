#version 300 es

precision highp float;

// Drawn with depth test GREATER before the actor itself, so only the parts
// hidden behind the world (tree canopies, walls) get the flat colour.

uniform vec4 u_silhouetteColor;

in vec4 v_color;
in vec2 v_texCoord;
flat in uint v_texId;
flat in float v_alphaCutOff;
in float v_fogAmount;
flat in vec4 v_interactId;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 interactId;

void main() {
    fragColor = u_silhouetteColor;
    interactId = vec4(0.0);
}
