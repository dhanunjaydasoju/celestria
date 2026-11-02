// SUNFALL Sun shaders — owner: LEAD (Stage S2). Artistic impression of our
// Sun, built on the shared simplex noise and the star vertex shaders. The
// existing host-star shaders (star/shaders.js) are reused for the corona and
// are not modified.
//
// Photosphere: stylised orange-yellow palette (the Sun's true colour is close
// to white), limb darkening that reddens towards the edge, two scales of
// convective granulation, supergranulation, faculae near the limb and a few
// sunspots with umbra and penumbra. Granule contrast fades where cells would
// be smaller than a pixel, so the disc does not shimmer when small.
// Chromosphere: a thin bright rim on the back faces of a slightly larger
// shell. Prominences: a few slow noise-shaped arcs just off the limb, drawn on
// a camera-facing disc that the photosphere occludes.

import { noiseGLSL } from '../planet/shaders/noise.js'

export { photosphereVertex as sunVertex, coronaVertex, coronaFragment } from '../star/shaders.js'

export const sunPhotosphereFragment = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uGranuleScale;
uniform vec3 uDeep;   // limb / cool lanes
uniform vec3 uMid;    // body
uniform vec3 uHot;    // granule tops
uniform vec3 uCore;   // disc centre

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

${noiseGLSL}

// Cellular (Worley) noise: distances to the nearest and second-nearest
// feature points. F2 − F1 is small along cell borders, which gives the
// polygonal lanes of real granulation. CELL_RANGE 1 searches 3×3×3 cells.
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

vec3 cellular(vec3 p, float t) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 h = hash33(i + g);
    vec3 o = 0.5 + 0.38 * sin(t + 6.2831 * h);   // slowly drifting feature points
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = h.x; }
    else if (d < f2) { f2 = d; }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}

// Granulation: bright convection cells separated by thin dark lanes, with
// brightness varying cell to cell and slowly evolving.
float granules(vec3 p, float t) {
  vec3 w = p + 0.3 * vec3(snoise(p * 0.35 + t * 0.2), snoise(p * 0.35 + 7.1), snoise(p * 0.35 - 3.3));
  vec3 c = cellular(w, t * 3.0);
  float edge = c.y - c.x;
  float lanes = 1.0 - smoothstep(0.015, 0.11, edge);
  float dome = 1.0 - smoothstep(0.0, 0.9, c.x);   // brighter cell centres
  return clamp(0.58 + 0.22 * dome + 0.2 * c.z - 0.42 * lanes, 0.0, 1.0);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float om = 1.0 - mu;

  float t = uTime * 0.02;
  vec3 p = vObjPos * uGranuleScale;

  // Fade granule contrast where cells approach pixel size (no shimmer).
  float cellPx = length(fwidth(p));
  float detail = 1.0 - smoothstep(0.35, 1.2, cellPx);

  float g = mix(0.66, granules(p, t), detail);
  float superg = fbm(vObjPos * 7.0 + vec3(t * 0.3, 2.0, -t * 0.2)) * 0.5 + 0.5;

  // Sunspots: rare, fixed to the surface; dark umbra inside a penumbra.
  float spotField = fbm(vObjPos * 2.4 + vec3(11.0, t * 0.05, 5.0));
  float penumbra = smoothstep(0.5, 0.56, spotField);
  float umbra = smoothstep(0.6, 0.64, spotField);

  // Faculae: bright patches that show up mostly near the limb.
  float faculae = smoothstep(0.2, 0.6, snoise(vObjPos * 9.0 + vec3(3.0, -t * 0.4, 1.0))) * smoothstep(0.25, 0.85, om);

  float heat = 0.4 + 0.55 * g + 0.22 * (superg - 0.5) + 0.2 * faculae;

  vec3 col = mix(uDeep, uMid, smoothstep(0.2, 0.65, heat));
  col = mix(col, uHot, smoothstep(0.62, 0.95, heat));

  // Limb darkening (quadratic, solar-like) that also reddens the limb.
  float limb = 1.0 - 0.6 * om - 0.25 * om * om;
  col = mix(col, uDeep, smoothstep(0.4, 1.0, om) * 0.6);
  col *= limb;
  col = mix(col, uCore, pow(mu, 3.0) * 0.22);
  col *= 1.0 - 0.45 * penumbra - 0.45 * umbra;

  // Own exposure curve (the material is not tone mapped): keeps the hue
  // saturated while compressing highlights.
  col = vec3(1.0) - exp(-col * uIntensity);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export const chromosphereFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uLimb;   // |dot(N,V)| at the photosphere limb
uniform float uTime;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

${noiseGLSL}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float d = -dot(N, V);                         // 0 at the shell edge → uLimb at the limb
  float ring = smoothstep(0.0, uLimb, d);
  ring = pow(ring, 6.0);                        // concentrated just outside the limb
  float spicules = 0.75 + 0.5 * snoise(vObjPos * 60.0 + vec3(0.0, uTime * 0.05, 0.0));
  vec3 col = uColor * ring * spicules * uStrength;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export const prominenceFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uStarFraction;  // photosphere radius / half plane size
uniform float uStrength;
uniform float uSeed;

varying vec2 vUv;

${noiseGLSL}

void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float d = length(c);
  float h = (d - uStarFraction) / uStarFraction;   // height above the limb, in solar radii
  if (h < 0.0 || h > 0.32) discard;
  float a = atan(c.y, c.x);
  vec2 dir = vec2(cos(a), sin(a));
  float t = uTime * 0.012;

  // A handful of active sectors around the limb.
  float sector = smoothstep(0.3, 0.55, snoise(vec3(dir * 1.6, uSeed)));
  // Flame-like tongues: noise sampled around the limb (narrow) and upward
  // (stretched), drifting outward so plasma appears to rise.
  float n = fbm(vec3(dir * 6.0, h * 2.6 - t * 1.5 + uSeed));
  float tongue = smoothstep(0.02, 0.42, n);
  float edge = smoothstep(0.0, 0.25, n) - smoothstep(0.25, 0.6, n) * 0.35; // brighter rims
  float height = exp(-h * 9.0) * (1.0 - smoothstep(0.2, 0.31, h));

  float glow = sector * (tongue * 0.75 + edge * 0.5) * height;
  glow += exp(-h * 70.0) * 0.18;               // faint even glow hugging the limb
  gl_FragColor = vec4(uColor * glow * uStrength, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
