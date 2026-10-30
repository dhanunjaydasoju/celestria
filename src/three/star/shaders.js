// Host star shaders — owner: LEAD.
//
// Photosphere: blackbody colour, quadratic limb darkening (I/I₀ = 1 −
// u₁(1−μ) − u₂(1−μ)², solar-like coefficients), slow animated granulation
// and faint starspots. Corona: a camera-facing disc whose glow falls off with
// distance from the limb, with gentle angular structure. Both are artistic;
// stellar surfaces are not resolved by any telescope for these stars.

import { noiseGLSL } from '../planet/shaders/noise.js'

export const photosphereVertex = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vObjPos = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

export const photosphereFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

${noiseGLSL}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float om = 1.0 - mu;
  float limb = 1.0 - 0.56 * om - 0.22 * om * om;

  float t = uTime * 0.035;
  vec3 p = vObjPos * 5.0 + vec3(uSeed * 41.0);
  float gran = fbm(p + vec3(t, -t * 0.6, t * 0.4));
  float cells = 1.0 - abs(snoise(p * 3.1 + vec3(-t * 1.3, t, 0.0)));
  float spots = smoothstep(0.5, 0.72, fbm(vObjPos * 1.4 + vec3(uSeed * 9.0, t * 0.15, 3.0)));

  vec3 col = uColor * (0.82 + 0.22 * gran + 0.1 * cells);
  col *= 1.0 - spots * 0.45;
  col *= limb;
  // Hot centre reads slightly whiter, as in real photographs of the Sun.
  col = mix(col, vec3(1.0, 0.98, 0.95), pow(mu, 4.0) * 0.18);

  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export const coronaVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const coronaFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uSeed;
uniform float uStarFraction; // star radius / half plane size
uniform float uStrength;

varying vec2 vUv;

${noiseGLSL}

void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;
  float rs = uStarFraction;
  float angle = atan(c.y, c.x);

  // Inverse-square-like falloff from the limb, faded to zero at the edge.
  float x = max(d - rs, 0.0) / (1.0 - rs);
  float glow = exp(-x * 11.0) * 0.85 + exp(-x * 3.5) * 0.12;
  glow *= 1.0 - smoothstep(0.75, 1.0, d);

  // Subtle angular streamers; slow so they read as structure, not flicker.
  float rays = fbm(vec3(cos(angle) * 2.2, sin(angle) * 2.2, uTime * 0.02 + uSeed * 7.0) + vec3(x * 1.5));
  glow *= 0.82 + 0.35 * rays;

  vec3 col = mix(uColor, vec3(1.0), 0.15) * glow * uStrength;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
