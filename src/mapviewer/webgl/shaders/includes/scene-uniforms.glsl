// Lights a dark map can have on at once (GameWebGLRenderer.setLights)
#define MAX_LIGHTS 8

// Per frame
uniform SceneUniforms {
    mat4 u_viewProjMatrix;
    mat4 u_viewMatrix;
    mat4 u_projectionMatrix;
    vec4 u_skyColor;
    vec2 u_cameraPos;
    float u_renderDistance;
    float u_fogDepth;
    float u_currentTime;
    float u_brightness;
    float u_colorBanding;
    float u_isNewTextureAnim;
    // World tiles (x0, y0, x1, y1) to keep clear: the world fades into the sky past them
    vec4 u_playArea;
    // Multiplied over what main.frag draws (a raid hall's colour wash): white changes nothing
    vec4 u_wash;
    // The dark (MapDef.darkness, includes/lights.glsl), read only by a dark map's programs (their
    // LIGHTS): x, how many of u_lights are on; y, how bright what's out of them is (0 to 1)
    vec4 u_lightInfo;
    // World tiles x and z, one over the radius squared (tiles), warmth (0 to 1)
    vec4 u_lights[MAX_LIGHTS];
};
