/**
 * TrackSystem: multiple particles per track, CPU-interpolated along stored paths.
 *
 * Each particle has a progress value in [0, 1) representing how far along
 * its track it is. Per frame, progress advances by dt * speedMultiplier / trackFrameSpan.
 * Position and velocity are interpolated from the track point data.
 */

import * as THREE from "three";
import vertexShader from "./shaders/track-render.vert?raw";
import fragmentShader from "./shaders/track-render.frag?raw";

export class TrackSystem {
  /**
   * @param {object} trackData - from TrackLoader
   * @param {number} particlesPerTrack - how many particles travel each track
   */
  constructor(trackData, particlesPerTrack = 1) {
    this.trackData = trackData;
    this.particlesPerTrack = particlesPerTrack;
    const { nTracks, tracks, pointData, floatsPerPoint: fpp = 5 } = trackData;
    this.fpp = fpp;
    const totalParticles = nTracks * particlesPerTrack;

    // Pre-compute frame span per track (last frame - first frame)
    this.frameSpans = new Float32Array(nTracks);
    this.frameStarts = new Float32Array(nTracks);
    for (let i = 0; i < nTracks; i++) {
      const off = tracks[i].pointOffset * fpp;
      const len = tracks[i].length;
      const firstFrame = pointData[off + 3];
      const lastFrame = pointData[off + (len - 1) * fpp + 3];
      this.frameSpans[i] = Math.max(lastFrame - firstFrame, 1);
      this.frameStarts[i] = firstFrame;
    }

    // Random initial progress per particle
    this.progress = new Float32Array(totalParticles);
    for (let i = 0; i < totalParticles; i++) {
      this.progress[i] = Math.random();
    }

    // Geometry buffers
    const positions = new Float32Array(totalParticles * 3);
    const speeds = new Float32Array(totalParticles);
    const randoms = new Float32Array(totalParticles);
    for (let i = 0; i < totalParticles; i++) {
      randoms[i] = Math.random();
    }

    this.positionAttr = new THREE.BufferAttribute(positions, 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    this.speedAttr = new THREE.BufferAttribute(speeds, 1);
    this.speedAttr.setUsage(THREE.DynamicDrawUsage);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", this.positionAttr);
    geometry.setAttribute("aSpeed", this.speedAttr);
    geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

    this.uniforms = {
      u_pointSize: { value: 0.3 },
      u_pixelRatio: { value: window.devicePixelRatio },
      u_maxSpeed: { value: trackData.maxSpeed * 0.5 },
      u_colormap: { value: 0 },
      u_jitter: { value: 0.0 },
      u_time: { value: 0.0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(geometry, material);

    // Initial interpolation
    this._interpolateAll();
  }

  getObject3D() {
    return this.points;
  }

  /**
   * Advance all particles along their tracks.
   * @param {number} dt - seconds since last frame
   * @param {number} speedMultiplier - frames per second of playback
   */
  update(dt, speedMultiplier) {
    this.uniforms.u_time.value += dt;
    const { nTracks } = this.trackData;
    const ppt = this.particlesPerTrack;
    const totalParticles = nTracks * ppt;
    for (let p = 0; p < totalParticles; p++) {
      const trackIdx = (p / ppt) | 0;
      this.progress[p] += (dt * speedMultiplier) / this.frameSpans[trackIdx];
      this.progress[p] -= Math.floor(this.progress[p]);
    }
    this._interpolateAll();
  }

  setRenderParams({ pointSize, maxSpeed, colormap, jitter }) {
    if (pointSize !== undefined) this.uniforms.u_pointSize.value = pointSize;
    if (maxSpeed !== undefined) this.uniforms.u_maxSpeed.value = maxSpeed;
    if (colormap !== undefined) this.uniforms.u_colormap.value = colormap;
    if (jitter !== undefined) this.uniforms.u_jitter.value = jitter;
  }

  /**
   * Interpolate positions and speeds for all particles from their progress values.
   */
  _interpolateAll() {
    const { nTracks, tracks, pointData } = this.trackData;
    const fpp = this.fpp;
    const ppt = this.particlesPerTrack;
    const posArr = this.positionAttr.array;
    const spdArr = this.speedAttr.array;

    for (let i = 0; i < nTracks; i++) {
      const track = tracks[i];
      const off = track.pointOffset * fpp;
      const len = track.length;

      for (let j = 0; j < ppt; j++) {
        const p = i * ppt + j;
        const progress = this.progress[p];

        // Map progress [0,1) to frame value
        const targetFrame =
          this.frameStarts[i] + progress * this.frameSpans[i];

        // Binary search for the segment containing targetFrame
        let lo = 0;
        let hi = len - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >>> 1;
          if (pointData[off + mid * fpp + 3] <= targetFrame) {
            lo = mid;
          } else {
            hi = mid;
          }
        }

        // Interpolation factor within segment [lo, hi]
        const f0 = pointData[off + lo * fpp + 3];
        const f1 = pointData[off + hi * fpp + 3];
        const segLen = f1 - f0;
        const t = segLen > 0 ? (targetFrame - f0) / segLen : 0;

        // Lerp position
        const x0 = pointData[off + lo * fpp];
        const y0 = pointData[off + lo * fpp + 1];
        const z0 = pointData[off + lo * fpp + 2];
        const x1 = pointData[off + hi * fpp];
        const y1 = pointData[off + hi * fpp + 1];
        const z1 = pointData[off + hi * fpp + 2];

        posArr[p * 3] = x0 + t * (x1 - x0);
        posArr[p * 3 + 1] = y0 + t * (y1 - y0);
        posArr[p * 3 + 2] = z0 + t * (z1 - z0);

        // Lerp pre-computed smoothed speed
        const s0 = pointData[off + lo * fpp + 4];
        const s1 = pointData[off + hi * fpp + 4];
        spdArr[p] = s0 + t * (s1 - s0);
      }
    }

    this.positionAttr.needsUpdate = true;
    this.speedAttr.needsUpdate = true;
  }
}
