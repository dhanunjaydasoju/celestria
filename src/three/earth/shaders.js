// Earth shaders for the homepage scene — owner: LEAD.
//
// Surface: NASA day/night imagery blended across a soft terminator, ocean sun
// glint, cloud shadows and a faint limb haze. Clouds: a separate shell.
// Atmosphere: single-scattering ray march (Rayleigh + Mie, after the standard
// O'Neil / Nishita approach) on high quality, a fresnel glow on low.
// Units: Earth radius = 1. Directions are world space unless named *Obj.

const common = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjNormal;
`

export const globeVertex = /* glsl */ `
${common}
void main() {
  vUv = uv;
  vObjNormal = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

export const surfaceFragment = /* glsl */ `
${common}
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform vec3 uSunDir;        // world
uniform vec3 uSunObj;        // globe object space (for cloud shadows)
uniform float uCloudOffset;  // u shift of the cloud layer (drift; texture uses RepeatWrapping, no seam)
uniform float uCloudShadow;  // 0 or 1
uniform float uHaze;         // limb haze strength (stronger when the scattering shell is off)

float cloudAt(vec2 uv) {
  float c = texture2D(uClouds, vec2(uv.x + uCloudOffset, uv.y)).r;
  return smoothstep(0.18, 0.75, c);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);
  float ndl = dot(N, L);

  vec3 day = texture2D(uDay, vUv).rgb;
  vec3 night = texture2D(uNight, vUv).rgb;

  // Deep ocean is one uniform colour in Blue Marble NG (sRGB 2,5,20: blue ≈ 4.7 × green).
  float water = smoothstep(1.8, 3.5, day.b / (day.g + 1e-4)) * (1.0 - smoothstep(0.02, 0.05, day.b));

  // Sunlight reddens near the terminator.
  vec3 sunCol = mix(vec3(1.0, 0.52, 0.28), vec3(1.0, 0.97, 0.93), smoothstep(0.0, 0.3, ndl));
  float dayLight = clamp((ndl + 0.04) / 1.04, 0.0, 1.0);

  // Cloud shadows: the cloud above a ground point sits slightly towards the Sun.
  float shadow = 1.0;
  if (uCloudShadow > 0.5 && ndl > 0.0) {
    vec3 n = normalize(vObjNormal);
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-5));
    vec3 north = cross(n, east);
    vec3 Lo = normalize(uSunObj);
    float h = 0.010 / max(dot(n, Lo), 0.25);
    float coslat = max(sqrt(1.0 - n.y * n.y), 0.08);
    vec2 offs = vec2(dot(Lo, east) * h / (6.2831853 * coslat), dot(Lo, north) * h / 3.1415927);
    shadow = 1.0 - 0.55 * cloudAt(vUv + offs);
  }

  vec3 color = day * 2.4 * sunCol * dayLight * shadow;

  // Ocean glint (Blinn-Phong: sharp core + broad sheen).
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float glint = (pow(nh, 260.0) * 1.1 + pow(nh, 28.0) * 0.06) * water * smoothstep(0.0, 0.15, ndl) * shadow;
  color += sunCol * glint;

  // Night: Black Marble lights on the dark side, dimmed under clouds.
  float nightSide = 1.0 - smoothstep(-0.22, 0.06, ndl);
  float lightsMask = smoothstep(0.10, 0.45, max(night.r, night.g));
  float overcast = 1.0 - 0.8 * cloudAt(vUv);
  vec3 cityLights = night * lightsMask * vec3(1.6, 1.25, 0.85) * overcast;
  vec3 moonlit = night * 0.06;
  color += (cityLights + moonlit) * nightSide;

  // Faint blue haze towards the limb on the day side.
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  color = mix(color, vec3(0.30, 0.55, 1.0) * dayLight, fres * uHaze);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export const cloudsFragment = /* glsl */ `
${common}
uniform sampler2D uClouds;
uniform vec3 uSunDir;
uniform float uCloudOffset;

void main() {
  vec3 N = normalize(vWorldNormal);
  float ndl = dot(N, normalize(uSunDir));
  float c = texture2D(uClouds, vec2(vUv.x + uCloudOffset, vUv.y)).r;
  float a = smoothstep(0.18, 0.75, c) * 0.94;
  float lit = smoothstep(-0.10, 0.30, ndl);
  vec3 tint = mix(vec3(1.0, 0.62, 0.42), vec3(1.0), smoothstep(0.0, 0.35, ndl));
  vec3 color = tint * (0.04 + 1.25 * lit);
  gl_FragColor = vec4(color, a * mix(0.55, 1.0, lit));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export const atmosphereVertex = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

/**
 * Single scattering, ray-marched through a spherical shell. Scale heights are
 * stretched (~6× real) for a visible rim at this size and the scattering
 * coefficients reduced by the same factor, keeping optical depths realistic.
 */
export const scatteringFragment = /* glsl */ `
varying vec3 vWorldPos;
uniform vec3 uCenter;
uniform float uRp;       // planet radius (world)
uniform float uRa;       // atmosphere radius (world)
uniform vec3 uSunDir;
uniform float uSunIntensity;

const int VIEW_STEPS = 12;
const int LIGHT_STEPS = 4;
const vec3 BETA_R = vec3(6.2, 14.3, 35.2);  // Rayleigh, per Earth radius (see note above)
const float BETA_M = 15.7;                  // Mie
const float H_R = 0.0075;                   // scale heights, Earth radii
const float H_M = 0.0016;
const float G = 0.76;                       // Mie asymmetry

vec2 sphere(vec3 ro, vec3 rd, float r) {
  vec3 oc = ro - uCenter;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - ro);
  vec3 L = normalize(uSunDir);
  vec2 ta = sphere(ro, rd, uRa);
  if (ta.x > ta.y) discard;
  float t0 = max(ta.x, 0.0);
  float t1 = ta.y;
  vec2 tp = sphere(ro, rd, uRp);
  if (tp.x > 0.0 && tp.x < t1) t1 = tp.x;

  float ds = (t1 - t0) / float(VIEW_STEPS);
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;
  for (int i = 0; i < VIEW_STEPS; i++) {
    vec3 p = ro + rd * (t0 + ds * (float(i) + 0.5));
    float h = (length(p - uCenter) - uRp) / uRp;
    float hr = exp(-h / H_R) * ds / uRp;
    float hm = exp(-h / H_M) * ds / uRp;
    odR += hr;
    odM += hm;
    // Skip samples in Earth's shadow.
    vec2 sp = sphere(p, L, uRp);
    if (sp.x > 0.0) continue;
    float tl = sphere(p, L, uRa).y;
    float dl = tl / float(LIGHT_STEPS);
    float odRl = 0.0;
    float odMl = 0.0;
    for (int j = 0; j < LIGHT_STEPS; j++) {
      vec3 q = p + L * (dl * (float(j) + 0.5));
      float hq = (length(q - uCenter) - uRp) / uRp;
      odRl += exp(-hq / H_R) * dl / uRp;
      odMl += exp(-hq / H_M) * dl / uRp;
    }
    vec3 tau = BETA_R * (odR + odRl) + BETA_M * 1.1 * (odM + odMl);
    vec3 att = exp(-tau);
    sumR += att * hr;
    sumM += att * hm;
  }
  float mu = dot(rd, L);
  float phaseR = 3.0 / (16.0 * 3.1415927) * (1.0 + mu * mu);
  float g2 = G * G;
  float phaseM = 3.0 / (8.0 * 3.1415927) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * G * mu, 1.5));
  vec3 color = uSunIntensity * (sumR * BETA_R * phaseR + sumM * BETA_M * phaseM);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** Low-quality fallback: a lit fresnel rim on the back faces of a larger shell. */
export const glowFragment = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
uniform vec3 uSunDir;
uniform float uLimb;
void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float d = -dot(N, V);
  float glow = pow(smoothstep(0.0, uLimb, d), 1.8);
  float lit = smoothstep(-0.35, 0.5, dot(N, normalize(uSunDir)));
  gl_FragColor = vec4(vec3(0.30, 0.58, 1.0) * glow * lit * 1.3, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
