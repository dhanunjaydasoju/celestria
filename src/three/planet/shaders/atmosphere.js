// Atmospheric glow shell — owner: LEAD.
//
// Rendered on the back faces of a sphere slightly larger than the planet,
// with additive blending. Back faces outside the planet's silhouette form a
// ring whose brightness fades from the planet's limb (dot ≈ -uLimb) to the
// shell's edge (dot ≈ 0), lit only on the star-facing side.

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

export const atmosphereFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform float uStrength;
uniform float uLimb; // sqrt(1 - 1/shellScale²): |dot(N,V)| at the planet's limb

varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uLightPos - vWorldPos);

  float d = -dot(N, V);                       // 0 at shell edge → uLimb at planet limb
  float glow = smoothstep(0.0, uLimb, d);
  glow = pow(glow, 1.6);
  float lit = smoothstep(-0.45, 0.55, dot(N, L));

  vec3 color = uColor * uLightColor * glow * lit * uStrength;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
