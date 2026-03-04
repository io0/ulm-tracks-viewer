// Track particle vertex shader: point sprites colored by velocity (2D ortho)
precision highp float;

attribute float aSpeed;
attribute float aRandom;

uniform float u_pointSize;
uniform float u_pixelRatio;
uniform float u_jitter;
uniform float u_time;

varying float vSpeed;

void main() {
  vSpeed = aSpeed;

  float seed = aRandom * 6.2831;
  vec3 pos = position + u_jitter * vec3(
    sin(seed * 13.7 + u_time * 2.1),
    0.0,
    sin(seed * 11.1 + u_time * 2.5)
  );

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = u_pointSize * u_pixelRatio;
  gl_Position = projectionMatrix * mvPosition;
}
