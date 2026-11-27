//!PARAM cx
//!TYPE DYNAMIC float
//!MINIMUM 0
//!MAXIMUM 1
0.5
//!PARAM cy
//!TYPE DYNAMIC float
//!MINIMUM 0
//!MAXIMUM 1
0.5
//!PARAM sx
//!TYPE DYNAMIC float
//!MINIMUM 0
//!MAXIMUM 1
0.5
//!PARAM sy
//!TYPE DYNAMIC float
//!MINIMUM 0
//!MAXIMUM 1
0.5
//!PARAM zoom
//!TYPE DYNAMIC float
//!MINIMUM 1.5
//!MAXIMUM 5
2.0
//!PARAM radius
//!TYPE DYNAMIC float
//!MINIMUM 0
//!MAXIMUM 0.5
0.0
//!HOOK OUTPUT
//!BIND HOOKED
//!DESC Video loupe
vec4 hook() {
    vec2 uv = HOOKED_pos;
    vec2 delta = uv - vec2(cx, cy);
    float edge = radius * HOOKED_size.x;
    vec2 pixels = abs(delta * HOOKED_size);
    float distance = max(pixels.x, pixels.y);
    if (distance >= edge) return HOOKED_tex(uv);
    vec2 limit = HOOKED_pt * 0.5;
    vec2 sample_at = clamp(vec2(sx, sy) + delta / zoom, limit, vec2(1.0) - limit);
    vec4 detail = HOOKED_tex(sample_at);
    float rim = smoothstep(edge - 2.0, edge - 0.5, distance);
    return mix(detail, vec4(1.0, 1.0, 1.0, detail.a), rim);
}
