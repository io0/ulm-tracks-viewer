import GUI from "lil-gui";

const COLORMAPS = {
  Jet: 0,
  Inferno: 1,
  Viridis: 2,
  Plasma: 3,
  Coolwarm: 4,
  Hot: 5,
  Turbo: 6,
};

export function createControls(params, callbacks = {}) {
  const gui = new GUI({ title: "ULM Tracks" });

  gui
    .add(params, "speedMultiplier", 1, 240)
    .name("Speed (frames/s)")
    .onChange(callbacks.onUpdate);
  gui
    .add(params, "pointSize", 0.05, 5)
    .name("Point Size")
    .onChange(callbacks.onUpdate);
  gui
    .add(params, "maxSpeed", 0.001, 1)
    .name("Max Speed (color)")
    .onChange(callbacks.onUpdate);
  gui
    .add(params, "colormap", COLORMAPS)
    .name("Colormap")
    .onChange(callbacks.onUpdate);
  gui
    .add(params, "jitter", 0, 1, 0.01)
    .name("Jitter")
    .onChange(callbacks.onUpdate);
  gui
    .add(params, "particlesPerTrack", 1, 100, 1)
    .name("Particles/Track")
    .onChange(callbacks.onRebuild);
  gui.add(params, "paused").name("Pause");

  return gui;
}
