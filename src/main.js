import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { loadTracks } from "./tracks/TrackLoader.js";
import { TrackSystem } from "./tracks/TrackSystem.js";
import { createControls } from "./ui/Controls.js";

// --- Parameters ---
const params = {
  speedMultiplier: 10.755,
  pointSize: 0.25,
  maxSpeed: 0.17,
  colormap: 0,
  jitter: 0.02,
  particlesPerTrack: 21,
  paused: false,
};

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x010104);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// Orthographic camera looking down Y axis at the X-Z plane
const frustumSize = 70;
const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(
  (-frustumSize * aspect) / 2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  -frustumSize / 2,
  -100,
  100
);
// Look down -Y so X goes right, Z goes up in screen space
camera.position.set(0, 10, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);

// Post-processing (tone mapping + color space)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());

// --- Pan & Zoom ---
let panStart = null;
let panOffset = { x: 0, z: 0 };

renderer.domElement.addEventListener("wheel", (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
  camera.left *= zoomFactor;
  camera.right *= zoomFactor;
  camera.top *= zoomFactor;
  camera.bottom *= zoomFactor;
  camera.updateProjectionMatrix();
  updateDepthMarkers();
}, { passive: false });

renderer.domElement.addEventListener("mousedown", (e) => {
  if (e.button === 0) panStart = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener("mousemove", (e) => {
  if (!panStart) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  panStart = { x: e.clientX, y: e.clientY };

  // Convert pixel drag to world units
  const viewWidth = camera.right - camera.left;
  const viewHeight = camera.top - camera.bottom;
  const worldDx = (-dx / window.innerWidth) * viewWidth;
  const worldDz = (-dy / window.innerHeight) * viewHeight;

  // Move camera position in world space
  camera.position.x += worldDx;
  camera.position.z += worldDz;
  camera.updateProjectionMatrix();
  updateDepthMarkers();
});

renderer.domElement.addEventListener("mouseup", () => { panStart = null; });
renderer.domElement.addEventListener("mouseleave", () => { panStart = null; });

// --- Depth markers ---
const depthContainer = document.getElementById("depth-markers");

const _proj = new THREE.Vector3();

function worldZToScreenY(z) {
  _proj.set(0, 0, z);
  _proj.project(camera);
  return (1 - _proj.y) * 0.5 * window.innerHeight;
}

function updateDepthMarkers() {
  depthContainer.innerHTML = "";
  // Find visible Z range by unprojecting screen top/bottom
  const topZ = new THREE.Vector3(0, 1, 0).unproject(camera).z;
  const botZ = new THREE.Vector3(0, -1, 0).unproject(camera).z;
  const zMin = Math.min(topZ, botZ);
  const zMax = Math.max(topZ, botZ);

  const startCm = Math.ceil(zMin / 10);
  const endCm = Math.floor(zMax / 10);

  for (let cm = startCm; cm <= endCm; cm++) {
    const zMm = cm * 10;
    const screenY = worldZToScreenY(zMm);

    const line = document.createElement("div");
    line.className = "depth-line";
    line.style.top = `${screenY}px`;
    depthContainer.appendChild(line);

    const label = document.createElement("div");
    label.className = "depth-label";
    label.style.top = `${screenY}px`;
    label.textContent = `${cm} cm`;
    depthContainer.appendChild(label);
  }
}

// --- Load data ---
const info = document.getElementById("info");
info.textContent = "Loading tracks...";

let trackSystem = null;
let trackData = null;

function rebuildTrackSystem() {
  if (!trackData) return;
  if (trackSystem) {
    scene.remove(trackSystem.getObject3D());
    trackSystem.getObject3D().geometry.dispose();
    trackSystem.getObject3D().material.dispose();
  }
  trackSystem = new TrackSystem(trackData, params.particlesPerTrack);
  scene.add(trackSystem.getObject3D());
  applyParams();
  const total = trackData.nTracks * params.particlesPerTrack;
  info.textContent = `${trackData.nTracks.toLocaleString()} tracks, ${total.toLocaleString()} particles | drag to pan, scroll to zoom`;
}

async function init() {
  try {
    trackData = await loadTracks("data/tracks.bin");

    info.textContent = `Loaded ${trackData.nTracks.toLocaleString()} tracks (${trackData.totalPoints.toLocaleString()} points)`;

    trackSystem = new TrackSystem(trackData, params.particlesPerTrack);
    scene.add(trackSystem.getObject3D());

    // Center camera on data
    const bmin = new THREE.Vector3(...trackData.boundsMin);
    const bmax = new THREE.Vector3(...trackData.boundsMax);
    const size = bmax.clone().sub(bmin);
    const center = bmin.clone().add(size.clone().multiplyScalar(0.5));

    // Bounding box: from 1cm depth to max reconstruction depth
    const boxMinZ = 10; // 1 cm
    const boxMaxZ = bmax.z;
    const boxCenterZ = (boxMinZ + boxMaxZ) / 2;
    const boxHeight = boxMaxZ - boxMinZ;
    const boxGeo = new THREE.PlaneGeometry(size.x, boxHeight);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    const boxLine = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: 0x333355 })
    );
    // Plane is in XY by default; rotate to XZ plane
    boxLine.rotation.x = -Math.PI / 2;
    boxLine.position.set(center.x, 0, boxCenterZ);
    scene.add(boxLine);

    // Set orthographic bounds (in camera-local coords, centered on camera)
    const padding = 1.1;
    const halfH = (size.z * padding) / 2;
    const halfW = halfH * aspect;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.left = -halfW;
    camera.right = halfW;
    camera.position.set(center.x, 10, center.z);
    camera.lookAt(center.x, 0, center.z);
    camera.updateProjectionMatrix();
    updateDepthMarkers();

    // GUI
    createControls(params, { onUpdate: applyParams, onRebuild: rebuildTrackSystem });
    applyParams();

    info.textContent = `${trackData.nTracks.toLocaleString()} tracks | drag to pan, scroll to zoom`;
  } catch (err) {
    console.error(err);
    info.textContent = `Error: ${err.message}`;
  }
}

function applyParams() {
  if (!trackSystem) return;
  trackSystem.setRenderParams({
    pointSize: params.pointSize,
    maxSpeed: params.maxSpeed,
    colormap: params.colormap,
    jitter: params.jitter,
  });
}

// --- Animation loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  if (trackSystem && !params.paused) {
    trackSystem.update(dt, params.speedMultiplier);
  }

  composer.render();
}

// --- Resize ---
window.addEventListener("resize", () => {
  const newAspect = window.innerWidth / window.innerHeight;
  const halfH = (camera.top - camera.bottom) / 2;
  camera.left = -halfH * newAspect;
  camera.right = halfH * newAspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  updateDepthMarkers();
});

init();
animate();
