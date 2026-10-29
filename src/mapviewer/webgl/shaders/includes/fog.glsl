float fogFactorLinear(float dist, float start, float end) {
    return 1.0 - clamp((dist - start) / (end - start), 0.0, 1.0);
}

float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// World tiles past the play area's edge over which the world fades out
#define PLAY_AREA_FADE 6.0

// How far a point (world tiles) has faded past the edge of the play area
float playAreaFog(vec2 pos) {
    vec2 centre = (u_playArea.xy + u_playArea.zw) * 0.5;
    vec2 halfSize = (u_playArea.zw - u_playArea.xy) * 0.5;
    return clamp(sdRoundedBox(pos - centre, halfSize, 0.0) / PLAY_AREA_FADE, 0.0, 1.0);
}
