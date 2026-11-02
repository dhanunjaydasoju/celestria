// SUNFALL swarm shaders — owner: LEAD (Stage S3).
//
// swarmVertex drives one instanced draw call of planet copies on the GPU:
// each copy's position comes from its Bézier path and uTime, so no matrices
// are updated per frame. It feeds the existing planet surface fragment shader
// (planet/shaders/surface.js) the varyings it expects, so copies look exactly
// like the planet's procedural impression and are lit by the Sun at the origin.

export const swarmVertex = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aCtrl;
attribute vec3 aEnd;
attribute vec2 aTime;   // launch, arrival (s)
attribute vec3 aSpin;   // rate (rad/s), phase, tilt

uniform float uTime;
uniform float uScale;   // copy radius, scene units

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vScale;

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

void main() {
  float u = clamp((uTime - aTime.x) / max(aTime.y - aTime.x, 1e-3), 0.0, 1.0);
  float alive = step(aTime.x, uTime) * (1.0 - step(aTime.y, uTime));
  float s = pow(u, 1.45);                                   // accelerates towards the Sun
  vec3 p = mix(mix(aStart, aCtrl, s), mix(aCtrl, aEnd, s), s);
  float sc = uScale * alive * smoothstep(0.0, 0.06, u);     // grows in at launch

  mat3 R = rotZ(aSpin.z) * rotY(aSpin.x * uTime + aSpin.y);
  vObjPos = normalize(position);
  vWorldNormal = normalize(R * normal);
  vec3 wp = p + R * position * sc;
  vWorldPos = wp;
  vScale = sc;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`

// Arrival flashes: one point per copy at its entry point, flaring briefly.
export const flashVertex = /* glsl */ `
attribute float aArrive;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
varying float vGlow;

void main() {
  float dt = uTime - aArrive;
  vGlow = dt >= 0.0 ? exp(-dt * 3.2) : 0.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = vGlow > 0.02 ? uSize * uPixelRatio * (0.6 + vGlow) / max(-mv.z, 0.001) : 0.0;
  gl_Position = projectionMatrix * mv;
}
`

export const flashFragment = /* glsl */ `
uniform vec3 uColor;
varying float vGlow;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  gl_FragColor = vec4(uColor * exp(-d * 4.0) * vGlow, 1.0);
}
`
