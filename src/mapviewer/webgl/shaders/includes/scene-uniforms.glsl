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
    // Lights (MapDef.lighting, includes/lights.glsl), read only by a lit map's programs (their
    // LIGHTS): the ambient's colour times how bright it is; and where u_lightMap is, world tiles
    // x and z of its corner and one over its size in tiles
    vec4 u_ambient;
    vec4 u_lightMapArea;
};
