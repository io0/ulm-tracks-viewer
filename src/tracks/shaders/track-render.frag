// Track particle fragment shader: velocity colormap
precision highp float;

varying float vSpeed;

uniform float u_maxSpeed;
uniform int u_colormap;

// 0: Jet (blue -> cyan -> green -> yellow -> red)
vec3 cmapJet(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.25) return mix(vec3(0.1, 0.2, 0.8), vec3(0.0, 0.7, 0.9), t / 0.25);
  if (t < 0.5)  return mix(vec3(0.0, 0.7, 0.9), vec3(0.1, 0.9, 0.2), (t - 0.25) / 0.25);
  if (t < 0.75) return mix(vec3(0.1, 0.9, 0.2), vec3(0.95, 0.85, 0.1), (t - 0.5) / 0.25);
  return mix(vec3(0.95, 0.85, 0.1), vec3(0.9, 0.1, 0.1), (t - 0.75) / 0.25);
}

// 1: Inferno (black -> purple -> orange -> yellow)
vec3 cmapInferno(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(vec3(0.0, 0.0, 0.04), vec3(0.55, 0.1, 0.52), t / 0.33);
  if (t < 0.66) return mix(vec3(0.55, 0.1, 0.52), vec3(0.93, 0.47, 0.1), (t - 0.33) / 0.33);
  return mix(vec3(0.93, 0.47, 0.1), vec3(0.99, 0.96, 0.64), (t - 0.66) / 0.34);
}

// 2: Viridis (purple -> teal -> green -> yellow)
vec3 cmapViridis(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(vec3(0.27, 0.0, 0.33), vec3(0.17, 0.32, 0.54), t / 0.33);
  if (t < 0.66) return mix(vec3(0.17, 0.32, 0.54), vec3(0.13, 0.66, 0.47), (t - 0.33) / 0.33);
  return mix(vec3(0.13, 0.66, 0.47), vec3(0.99, 0.91, 0.14), (t - 0.66) / 0.34);
}

// 3: Plasma (blue -> purple -> orange -> yellow)
vec3 cmapPlasma(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(vec3(0.05, 0.03, 0.53), vec3(0.56, 0.07, 0.55), t / 0.33);
  if (t < 0.66) return mix(vec3(0.56, 0.07, 0.55), vec3(0.92, 0.42, 0.18), (t - 0.33) / 0.33);
  return mix(vec3(0.92, 0.42, 0.18), vec3(0.94, 0.97, 0.13), (t - 0.66) / 0.34);
}

// 4: Coolwarm (blue -> white -> red)
vec3 cmapCoolwarm(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.5) return mix(vec3(0.23, 0.30, 0.75), vec3(0.87, 0.87, 0.87), t / 0.5);
  return mix(vec3(0.87, 0.87, 0.87), vec3(0.71, 0.02, 0.15), (t - 0.5) / 0.5);
}

// 5: Hot (black -> red -> yellow -> white)
vec3 cmapHot(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(vec3(0.0, 0.0, 0.0), vec3(0.9, 0.0, 0.0), t / 0.33);
  if (t < 0.66) return mix(vec3(0.9, 0.0, 0.0), vec3(1.0, 0.9, 0.0), (t - 0.33) / 0.33);
  return mix(vec3(1.0, 0.9, 0.0), vec3(1.0, 1.0, 1.0), (t - 0.66) / 0.34);
}

// 6: Turbo (dark indigo -> blue -> cyan -> green -> yellow -> red)
vec3 cmapTurbo(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.2)  return mix(vec3(0.19, 0.07, 0.23), vec3(0.16, 0.34, 0.85), t / 0.2);
  if (t < 0.4)  return mix(vec3(0.16, 0.34, 0.85), vec3(0.06, 0.72, 0.65), (t - 0.2) / 0.2);
  if (t < 0.6)  return mix(vec3(0.06, 0.72, 0.65), vec3(0.44, 0.88, 0.12), (t - 0.4) / 0.2);
  if (t < 0.8)  return mix(vec3(0.44, 0.88, 0.12), vec3(0.95, 0.65, 0.04), (t - 0.6) / 0.2);
  return mix(vec3(0.95, 0.65, 0.04), vec3(0.76, 0.15, 0.11), (t - 0.8) / 0.2);
}

vec3 applyColormap(float t) {
  if (u_colormap == 1) return cmapInferno(t);
  if (u_colormap == 2) return cmapViridis(t);
  if (u_colormap == 3) return cmapPlasma(t);
  if (u_colormap == 4) return cmapCoolwarm(t);
  if (u_colormap == 5) return cmapHot(t);
  if (u_colormap == 6) return cmapTurbo(t);
  return cmapJet(t);
}

void main() {
  // Circle mask
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r2 = dot(cxy, cxy);
  if (r2 > 1.0) discard;

  // Velocity -> color
  float speedNorm = vSpeed / max(u_maxSpeed, 0.001);
  vec3 color = applyColormap(speedNorm);

  // Soft edge
  float alpha = 1.0 - smoothstep(0.7, 1.0, sqrt(r2));

  gl_FragColor = vec4(color, alpha);
}
