#version 300 es

#include "../shaders/includes/multi-draw.glsl";

#define TEXTURE_ANIM_UNIT (1.0f / 128.0f)

// TAU / 2048.0
#define RS_TO_RADIANS 0.00306796157

#define FOG_CORNER_ROUNDING 8.0

// A player's layers (ActorRenderer's LAYER_DEPTH): the highest priority they go by, so
// MAX_LAYER * LAYER_DEPTH is the furthest a face is drawn nearer than where it is
#define MAX_LAYER 7.0
// Priorities 10 and 11 (arms, hands, what's held), which the client puts among the rest by depth.
// Behind a player they're over the body and under a cape.
#define LATE_PRIORITY 10.0
#define LATE_LAYER 4.0

#define ACTOR_DATA_WIDTH 512
#define TEXELS_PER_INSTANCE 5

// ActorBakeFrames.ts's POSITIONS_WIDTH
#define POSITIONS_WIDTH 2048

precision highp float;

layout(std140, column_major) uniform;

uniform highp isampler2D u_textureMaterials;

#include "../shaders/includes/scene-uniforms.glsl";

// First instance of this draw call in the actor data texture
uniform int u_instanceOffset;

// 5 texels per instance:
//  0: world x (tiles), world y (tiles, up is negative), world z (tiles), yaw (0-2047)
//  1: scale, flash (0-1, or -1-0 to glow in the tint's colour), tint (0xRRGGBB, 0xFFFFFF = none),
//     alpha
//  2: edge light (0-1), how far in it reaches (0-1 of the way to the middle), its colour
//     (0xRRGGBB), and how much it's drawn at full brightness whatever the light (0-1, lights.glsl)
//  3: stretch along x and z, tip about x and z (0-2047), before the yaw
//  4: where the frame's positions start in u_positions, -1 for a frame baked whole, and how
//     much nearer the camera each priority is drawn (tiles, 0 for none: a player's layers)
uniform highp sampler2D u_actorData;

// The page's frames that share a mesh: each vertex's position, in model units as decodeVertex
// gives them, a frame's after another's (ActorBakeFrames.ts)
uniform highp isampler2D u_positions;

layout(location = 0) in uvec3 a_vertex;

out vec4 v_color;
out vec2 v_texCoord;
flat out uint v_texId;
flat out float v_alphaCutOff;
out float v_fogAmount;
flat out vec4 v_interactId;
#ifdef LIGHTS
// World tiles x and z, and how much it's drawn as if it were lit (lights.glsl)
out vec3 v_lightPos;
#endif
// Edge light (ActorDrawOptions.edge): where in the model this is, -1 to 1 across a tile, and the
// light's colour and strength, and how far in it reaches
out vec2 v_edgePos;
flat out vec4 v_edge;
flat out float v_edgeWidth;
flat out vec2 v_edgeStretch;

#include "../shaders/includes/branchless-logic.glsl";
#include "../shaders/includes/hsl-to-rgb.glsl";
#include "../shaders/includes/unpack-float.glsl";
#include "../shaders/includes/fog.glsl";

#include "../shaders/includes/material.glsl";

#include "../shaders/includes/vertex.glsl";

vec4 fetchActorData(int index) {
    return texelFetch(u_actorData, ivec2(index % ACTOR_DATA_WIDTH, index / ACTOR_DATA_WIDTH), 0);
}

// A shared mesh's vertex has its index in the model where a position would be: the low 15 bits
// in x and the rest in z (ActorBakeFrames.ts's indexModel)
vec3 fetchPosition(int start, uvec3 packedVertex) {
    int index = int(((packedVertex.x >> 17u) & 0x7FFFu) | (((packedVertex.z >> 17u) & 0x7FFFu) << 15u));
    int texel = start + index;
    return vec3(texelFetch(u_positions, ivec2(texel % POSITIONS_WIDTH, texel / POSITIONS_WIDTH), 0).xyz);
}

mat4 rotationY( in float angle ) {
    return mat4(cos(angle),		0,		sin(angle),	0,
                         0,		1.0,			 0,	0,
                -sin(angle),	0,		cos(angle),	0,
                        0, 		0,				0,	1);
}

// A point of the model in the world, in tiles: scaled, stretched, tipped over about x, then z
// (y is down), and turned
vec3 modelToWorld(vec3 modelPos, vec4 data0, float scale, vec4 data3) {
    vec3 pos = modelPos * scale * vec3(data3.x, 1.0, data3.y);
    float pitch = data3.z * RS_TO_RADIANS;
    float roll = data3.w * RS_TO_RADIANS;
    pos = vec3(pos.x, pos.y * cos(pitch) - pos.z * sin(pitch), pos.y * sin(pitch) + pos.z * cos(pitch));
    pos = vec3(pos.x * cos(roll) - pos.y * sin(roll), pos.x * sin(roll) + pos.y * cos(roll), pos.z);
    vec4 localPos = vec4(pos, 1.0) * rotationY(data0.w * RS_TO_RADIANS);
    return localPos.xyz / 128.0 + data0.xyz;
}

// How far round behind a player the camera is: 0 from the front or side, 1 from behind (their
// back is +z), whatever the camera's pitch
float seenFromBehind(vec4 data0, float scale, vec4 data3) {
    vec3 origin = modelToWorld(vec3(0.0), data0, scale, data3);
    // How much each way points at the camera
    float back = (mat3(u_viewMatrix) * (modelToWorld(vec3(0.0, 0.0, 128.0), data0, scale, data3) - origin)).z;
    float side = (mat3(u_viewMatrix) * (modelToWorld(vec3(128.0, 0.0, 0.0), data0, scale, data3) - origin)).z;
    return smoothstep(0.0, 0.5, back / max(length(vec2(back, side)), 0.0001));
}

void main() {
    // Without multi draw, a run of instances of one frame is one instanced draw
    int dataIndex = (DRAW_ID + gl_InstanceID + u_instanceOffset) * TEXELS_PER_INSTANCE;
    vec4 data0 = fetchActorData(dataIndex);
    vec4 data1 = fetchActorData(dataIndex + 1);
    vec4 data2 = fetchActorData(dataIndex + 2);
    vec4 data3 = fetchActorData(dataIndex + 3);
    vec4 data4 = fetchActorData(dataIndex + 4);
    int positionStart = int(data4.x);
    float layerDepth = data4.y;

    Vertex vertex = decodeVertex(a_vertex.x, a_vertex.y, a_vertex.z, u_brightness);
    if (positionStart >= 0) {
        vertex.pos = fetchPosition(positionStart, a_vertex);
    }

    Material material = getMaterial(vertex.textureId);
    vec2 textureAnimation = vec2(material.animU, material.animV);

    if (u_isNewTextureAnim > 0.5) {
        v_texCoord = vertex.texCoord + mod(mod(u_currentTime, 128.0) * textureAnimation / 64.0, 1.0);
    } else {
        v_texCoord = vertex.texCoord + (u_currentTime / 0.02) * textureAnimation * TEXTURE_ANIM_UNIT;
    }
    v_texId = vertex.textureId;
    v_alphaCutOff = material.alphaCutOff;

    float scale = data1.x;
    float flash = data1.y;
    int tint = int(data1.z);
    float alpha = data1.w;

    vec3 tintColor = vec3(float((tint >> 16) & 0xFF), float((tint >> 8) & 0xFF), float(tint & 0xFF)) / 255.0;
    v_color = vertex.color;
    // A flash goes to white; a negative one goes to the tint's own colour, lit or not, so a
    // model can glow (the light under the Wardens' floor, client/FloorView.ts)
    vec3 flashColor = flash < 0.0 ? tintColor : vec3(1.0);
    v_color.rgb = mix(v_color.rgb * tintColor, flashColor, abs(flash));
    v_color.a *= alpha;

    int edgeColor = int(data2.z);
    v_edge = vec4(
        vec3(float((edgeColor >> 16) & 0xFF), float((edgeColor >> 8) & 0xFF), float(edgeColor & 0xFF)) / 255.0,
        data2.x
    );
    v_edgeWidth = max(data2.y, 0.001);
    v_edgePos = vertex.pos.xz / 64.0;
    v_edgeStretch = data3.xy;

    vec4 worldPos = vec4(modelToWorld(vertex.pos, data0, scale, data3), 1.0);

    float dist = -sdRoundedBox(
        vec2(worldPos.x - u_cameraPos.x, worldPos.z - u_cameraPos.y),
        vec2(u_renderDistance),
        FOG_CORNER_ROUNDING
    );
    float fogDepth = min(u_fogDepth, u_renderDistance);
    v_fogAmount = max(fogFactorLinear(dist, 0.0, fogDepth), playAreaFog(worldPos.xz));

    v_interactId = vec4(0.0);

#ifdef LIGHTS
    // A flash shows in the dark too, so a hit on something out of the light can be seen
    v_lightPos = vec3(worldPos.xz, max(data2.w, abs(flash)));
#endif

    gl_Position = u_viewMatrix * worldPos;
    gl_Position.z += (float(vertex.priority) + 20.0) * 0.0007;
    vec4 viewPos = gl_Position;
    gl_Position = u_projectionMatrix * viewPos;
    // A player's worn items in layers, as the client paints them, seen from behind: a cape over
    // the platebody poking through it. From the front, depth alone keeps the body over a cape's
    // sides, which layers would bring out over it. Past MAX_LAYER they're a helm's trims, which
    // liftDecals.ts brings out instead.
    if (layerDepth > 0.0) {
        float priority = float(vertex.priority) - 1.0;
        float layer = priority >= LATE_PRIORITY ? LATE_LAYER : min(priority, MAX_LAYER);
        float lift = layer * layerDepth * seenFromBehind(data0, scale, data3);
        // Nearer in depth only: moved nearer, a vertex would move on screen too, and open cracks
        // between faces of different layers
        vec4 lifted = u_projectionMatrix * (viewPos + vec4(0.0, 0.0, lift, 0.0));
        gl_Position.z = lifted.z / lifted.w * gl_Position.w;
    }
}
