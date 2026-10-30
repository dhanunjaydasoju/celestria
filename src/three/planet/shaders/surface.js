// Procedural planet surface shader — owner: LEAD.
//
// One program serves every archetype (uType branches on a uniform, which is
// coherent per draw call), so three.js compiles it once per octave count.
// The sphere is a unit sphere; noise is sampled on object-space position so
// patterns stay fixed to the surface as the planet spins.
//
// uType: 0 unclassified · 1 rocky · 2 sub-Neptune · 3 Neptune-like · 4 giant

import { noiseGLSL } from './noise.js'

export const surfaceVertex = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vScale;

void main() {
  vObjPos = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vScale = length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

export const surfaceFragment = /* glsl */ `
uniform int uType;
uniform float uSeed;
uniform vec3 uColorLow;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;
uniform vec3 uGlowColor;
uniform float uGlow;
uniform float uIce;
uniform float uBandFreq;
uniform float uBandContrast;
uniform float uTurbulence;
uniform float uNoiseScale;
uniform float uWrap;
uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform float uAmbient;
uniform float uTime;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vScale;

${noiseGLSL}

vec3 seedOffset() {
  return vec3(uSeed * 137.0, uSeed * 71.0, uSeed * 313.0);
}

// Bump mapping from a scalar height field using screen-space derivatives
// (Mikkelsen 2010, "Bump Mapping Unparametrized Surfaces on the GPU").
vec3 perturbNormal(vec3 N, vec3 pos, float h) {
  vec3 dpdx = dFdx(pos);
  vec3 dpdy = dFdy(pos);
  float dhdx = dFdx(h);
  float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, N);
  vec3 r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * N - grad);
}

// ── Rocky ──────────────────────────────────────────────────────────────────
vec3 rockyAlbedo(vec3 p, out float height, out float lava) {
  vec3 q = p * uNoiseScale + seedOffset();
  float continents = fbm(q * 0.55);
  float detail = fbm(q * 2.4);
  float ridges = ridged(q * 1.25);
  height = continents * 0.7 + detail * 0.3 + (ridges - 0.6) * 0.18;

  float t = smoothstep(-0.5, 0.55, height);
  vec3 col = mix(uColorLow, uColorMid, smoothstep(0.0, 0.55, t));
  col = mix(col, uColorHigh, smoothstep(0.5, 1.0, t) * 0.85);
  col *= 0.86 + 0.28 * (snoise(q * 11.0) * 0.5 + 0.5);

  // Impact-like pocks: soft dark rims from cellular-ish noise.
  float pocks = smoothstep(0.62, 0.78, snoise(q * 4.3 + 7.0));
  col *= 1.0 - pocks * 0.18;

  if (uIce > 0.0) {
    float lat = abs(p.y) + detail * 0.12;
    float caps = smoothstep(1.0 - uIce * 0.6, 1.08 - uIce * 0.6, lat);
    float frost = smoothstep(0.05, -0.35, height) * uIce * 0.7;
    col = mix(col, vec3(0.84, 0.88, 0.92), clamp(caps + frost, 0.0, 1.0));
  }

  float cracks = smoothstep(0.93, 0.995, ridged(q * 2.2 + vec3(3.0)));
  float basins = smoothstep(-0.2, -0.55, height);
  lava = uGlow * clamp(cracks * 0.8 + basins * 0.85, 0.0, 1.0);
  col = mix(col, col * 0.55, uGlow * 0.6); // scorched, darkened crust
  return col;
}

// ── Gas and ice envelopes ──────────────────────────────────────────────────
vec3 gasAlbedo(vec3 p, out float bandValue) {
  float t = uTime * 0.012;
  vec3 wq = p * vec3(1.4, 4.2, 1.4) * uNoiseScale * 0.55 + seedOffset();
  float warp = fbm(wq + vec3(t, 0.0, -t)) * uTurbulence;
  float lat = p.y + warp * 0.11;

  float b1 = sin(lat * uBandFreq + uSeed * 6.2831) * 0.5 + 0.5;
  float b2 = sin(lat * uBandFreq * 2.27 + 1.7 + uSeed * 12.0) * 0.5 + 0.5;
  float b = mix(b1, b2, 0.32);
  b = mix(0.5, b, uBandContrast);
  bandValue = b;

  vec3 col = mix(uColorLow, uColorMid, smoothstep(0.12, 0.6, b));
  col = mix(col, uColorHigh, smoothstep(0.55, 0.95, b));

  float streak = fbm(p * vec3(2.6, 15.0, 2.6) * uNoiseScale * 0.6 + seedOffset() + vec3(t * 2.0, 0.0, 0.0));
  col *= 0.93 + 0.2 * streak * (0.35 + uBandContrast);

  // Haze softens contrast toward the poles.
  col = mix(col, uColorMid, smoothstep(0.75, 1.0, abs(p.y)) * 0.5);
  return col;
}

// ── Unclassified: neutral schematic with a faint graticule ────────────────
vec3 unclassifiedAlbedo(vec3 p) {
  float n = fbm(p * 2.0 + seedOffset());
  vec3 col = mix(uColorLow, uColorMid, n * 0.5 + 0.5);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float lon = atan(p.z, p.x);
  vec2 g = vec2(lat, lon) / radians(15.0);
  vec2 fw = max(fwidth(g), vec2(1e-4));
  vec2 d = abs(fract(g - 0.5) - 0.5) / fw;
  float line = 1.0 - min(min(d.x, d.y), 1.0);
  return mix(col, uColorHigh, line * 0.5);
}

void main() {
  vec3 p = normalize(vObjPos);
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);

  vec3 albedo;
  vec3 emission = vec3(0.0);
  float ndlRaw = dot(N, L);
  float night = 1.0 - smoothstep(-0.12, 0.25, ndlRaw);

  if (uType == 1) {
    float h;
    float lava;
    albedo = rockyAlbedo(p, h, lava);
    N = perturbNormal(N, vWorldPos, h * 0.018 * vScale);
    emission = uGlowColor * lava * (0.35 + 1.2 * night) * 1.5;
  } else if (uType >= 2) {
    float b;
    albedo = gasAlbedo(p, b);
    // Thermal emission of very hot envelopes, most visible on the night side.
    emission = uGlowColor * uGlow * (0.005 + 0.4 * night) * (0.45 + 0.7 * b) * 0.6;
  } else {
    albedo = unclassifiedAlbedo(p);
  }

  float ndl = dot(N, L);
  float diffuse = clamp((ndl + uWrap) / (1.0 + uWrap), 0.0, 1.0);
  vec3 color = albedo * uLightColor * uLightIntensity * diffuse + albedo * uAmbient;

  if (uType >= 2) {
    // Forward-scattering haze brightens the lit limb.
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    color += uColorHigh * uLightColor * rim * 0.22 * smoothstep(-0.25, 0.6, ndlRaw);
  }

  gl_FragColor = vec4(color + emission, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
