// VHS look for mpv (vo=gpu-next).
//
// Single-pass imitation: luma bandwidth loss, chroma bleed, line wobble,
// head switching noise and tape grain. It is not an NTSC signal model,
// unlike ntsc-rs; it only borrows the visible artifacts.

//!PARAM noise
//!DESC Tape grain
//!TYPE float
//!MINIMUM 0.0
//!MAXIMUM 1.0
0.12

//!PARAM chroma
//!DESC Chroma bleed
//!TYPE float
//!MINIMUM 0.0
//!MAXIMUM 6.0
1.6

//!PARAM smear
//!DESC Luma smear
//!TYPE float
//!MINIMUM 0.0
//!MAXIMUM 1.0
0.7

//!PARAM tracking
//!DESC Head switching band
//!TYPE float
//!MINIMUM 0.0
//!MAXIMUM 1.0
0.5

//!PARAM wobble
//!DESC Line wobble
//!TYPE float
//!MINIMUM 0.0
//!MAXIMUM 1.0
0.35

//!PARAM tint
//!DESC Warm tint
//!TYPE float
//!MINIMUM 0.0
//!MAXIMUM 1.0
0.5

//!HOOK MAIN
//!BIND HOOKED
//!WIDTH OUTPUT.w
//!HEIGHT OUTPUT.h
//!DESC VHS

#define LUMA vec3(0.2126, 0.7152, 0.0722)

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 sample_at(vec2 pos) {
    vec2 limit = HOOKED_pt * 0.5;
    return HOOKED_tex(clamp(pos, limit, vec2(1.0) - limit)).rgb;
}

vec4 hook() {
    vec2 pos = HOOKED_pos;
    float t = float(frame) + random;

    float wave = sin(pos.y * 31.0 + t * 0.7) * 0.5 + sin(pos.y * 7.0 + t * 0.31) * 0.5;
    pos.x += wave * wobble * 1.6 * HOOKED_pt.x;

    float band = smoothstep(0.955, 0.99, pos.y) * (1.0 - smoothstep(0.99, 1.0, pos.y));
    pos.x += band * tracking * (hash(vec2(pos.y * 640.0, t)) - 0.5) * 0.06;

    vec3 center = sample_at(pos);
    float y = dot(center, LUMA);

    vec3 left = sample_at(pos - vec2(HOOKED_pt.x * 2.0, 0.0));
    vec3 right = sample_at(pos + vec2(HOOKED_pt.x * 2.0, 0.0));
    float y_smeared = mix(y, (dot(left, LUMA) + y + dot(right, LUMA)) / 3.0, smear);

    vec3 shifted_left = sample_at(pos - vec2(HOOKED_pt.x * chroma, 0.0));
    vec3 shifted_right = sample_at(pos + vec2(HOOKED_pt.x * chroma, 0.0));
    vec3 chroma_rgb = vec3(
        shifted_left.r - dot(shifted_left, LUMA),
        center.g - dot(center, LUMA),
        shifted_right.b - dot(shifted_right, LUMA)
    );

    vec3 color = vec3(y_smeared) + chroma_rgb;
    color *= 0.94;

    float grain = hash(pos * HOOKED_size + vec2(t * 17.0, t * 7.0)) - 0.5;
    color += grain * noise * (0.35 + 0.65 * (1.0 - clamp(y, 0.0, 1.0)));

    float sparkle = hash(floor(pos * HOOKED_size) + vec2(t, t * 3.0));
    color += band * tracking * step(0.82, sparkle) * 0.5;

    color *= mix(vec3(1.0), vec3(1.06, 1.0, 0.92), tint);

    vec2 inside = step(vec2(0.0), pos) * step(pos, vec2(1.0));
    return vec4(color * inside.x * inside.y, 1.0);
}
