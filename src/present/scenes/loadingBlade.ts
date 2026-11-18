import * as THREE from 'three';
import { finishBuild, loadInFrames, type BuildSteps } from '../engine/buildSteps';

import { wipeCover, type WipeLook } from './wipeCover';

type Cover = WipeLook | { texture: THREE.Texture; cut: number };
const layer = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
camera.position.z = 8;
const shutter = new THREE.Group(),
  blade = new THREE.Group(),
  rotor = new THREE.Group();
const unit = new THREE.BoxGeometry();
const materials = new Map<number, THREE.MeshLambertMaterial>();
function block(parent: THREE.Group, color: number, x: number, y: number, z: number, w: number, h: number, d: number) {
  let mat = materials.get(color);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color });
    materials.set(color, mat);
  }
  const part = new THREE.Mesh(unit, mat);
  part.position.set(x, y, z);
  part.scale.set(w, h, d);
  parent.add(part);
}
const bamboo = new THREE.Group(),
  pillar = new THREE.Group();
const pictureMat = new THREE.MeshBasicMaterial({ toneMapped: false });
const picture = new THREE.Group();
const halves = [0, 1].map(() => new THREE.Mesh(new THREE.PlaneGeometry(2, 1), pictureMat));
function placePicture(cut: number, open: number) {
  const heights = [2 * cut, 2 * (1 - cut)];
  for (let i = 0; i < halves.length; i++) {
    const half = halves[i],
      h = heights[i],
      direction = i === 0 ? 1 : -1;
    half.scale.y = h;
    half.position.y = direction * (1 - h / 2 + open * (h + 0.03));
  }
}
function splitPicture(cut: number) {
  const boundary = 1 - cut;
  halves.forEach((half, i) => {
    const uv = half.geometry.getAttribute('uv');
    for (let j = 0; j < 4; j++) uv.setY(j, i === 0 ? (j < 2 ? 1 : boundary) : j < 2 ? boundary : 0);
    uv.needsUpdate = true;
  });
}
let built = false;
function makeLayer() {
  if (built) return;
  built = true;
  layer.add(shutter, rotor, new THREE.HemisphereLight(0xfff4de, 0x506476, 1.45));
  const light = new THREE.DirectionalLight(0xfff1d8, 2.4);
  light.position.set(-2, 4, 5);
  layer.add(light);
  shutter.add(bamboo, pillar, picture);
  rotor.add(blade);
  rotor.position.z = 1.4;
  picture.add(...halves);
  for (const [holder, look] of [
    [bamboo, 'bamboo'],
    [pillar, 'pillar'],
  ] as const) {
    const model = wipeCover(look);
    model.scale.set(0.91, 0.36, 0.7);
    holder.add(model);
  }
  // Under the stalks so the old room never shows between them while it is being replaced.
  block(bamboo, 0x243725, 0, 0, -0.45, 2.12, 2.2, 0.05);
  // The game's ring-pommel dao: bright cutting edge, dark steel spine,
  // wrapped grip, brass ring with an open centre and a vermilion tassel.
  const steel = (points: number[][], color: number, thickness: number) => {
    const profile = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(profile, { depth: thickness, bevelEnabled: false });
    geometry.translate(0, 0, -thickness / 2);
    blade.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color })));
  };
  steel([[-.235, .052], [.28, .058], [.45, .086], [.555, .125], [.45, .017], [.31, -.025], [-.235, -.035]], 0xaebdc8, .056);
  steel([[-.235, -.035], [.31, -.025], [.45, .017], [.555, .125], [.477, -.006], [.32, -.056], [-.235, -.059]], 0xf4efe3, .035);
  block(blade, 0xd4ad68, -0.245, 0, 0, 0.041, 0.17, 0.105);
  block(blade, 0x493334, -0.385, 0, 0, 0.24, 0.079, 0.08);
  for (let i = 0; i < 4; i++) block(blade, 0x85513c, -0.3 - i * 0.053, 0, 0.002, 0.019, 0.087, 0.085);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 5, 10), materials.get(0xd4ad68)!);
  ring.position.x = -0.55;
  blade.add(ring);
  block(blade, 0xac3427, -0.58, -0.09, 0, 0.024, 0.13, 0.026);
  block(blade, 0x923229, -0.61, -0.1, -0.008, 0.021, 0.1, 0.022);
}
type Phase = 'enter' | 'work' | 'ready' | 'exit';
type BladeState = { phase: Phase; since: number; start: number; frames: number; cut: number };
let active: BladeState | null = null;
export const bladeBusy = () => active !== null;
export const bladeWorking = () => active?.phase === 'work';
export function runRoomBuild<T>(steps: BuildSteps<T>) {
  return bladeWorking() ? loadInFrames(steps) : finishBuild(steps);
}
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
export async function withLoadingBlade(work: () => void | Promise<void>, cover: Cover = 'bamboo') {
  if (active) throw new Error('A scene transition is already running');
  makeLayer();
  bamboo.visible = cover === 'bamboo';
  pillar.visible = cover === 'pillar';
  picture.visible = typeof cover !== 'string';
  const cut = typeof cover === 'string' ? 0.5 : Math.max(0, Math.min(1, cover.cut));
  if (typeof cover !== 'string') splitPicture(cut);
  pictureMat.map = typeof cover === 'string' ? null : cover.texture;
  pictureMat.needsUpdate = true;
  const now = performance.now();
  const state: BladeState = { phase: 'enter', since: now, start: now, frames: 0, cut };
  active = state;
  try {
    while (performance.now() - state.since < 240 || state.frames === 0) await nextFrame();
    state.phase = 'work';
    await nextFrame();
    await work();
    // The normal world pass now draws the destination under the cover. Wait
    // for a submitted frame before revealing it, including GPU buffer uploads.
    state.phase = 'ready';
    state.frames = 0;
    while (state.frames === 0) await nextFrame();
    state.phase = 'exit';
    state.since = performance.now();
    while (performance.now() - state.since < 260) await nextFrame();
  } finally {
    active = null;
    pictureMat.map = null;
  }
}
export function drawLoadingBlade(renderer: THREE.WebGLRenderer, aspect: number) {
  const s = active;
  if (!s) return;
  const now = performance.now(),
    enter = Math.min(1, (now - s.since) / 240),
    exit = Math.min(1, (now - s.since) / 260);
  const x = s.phase === 'enter' ? -((1 - enter) ** 3) : s.phase === 'exit' ? exit ** 2 : 0;
  camera.left = -aspect;
  camera.right = aspect;
  camera.updateProjectionMatrix();
  shutter.scale.x = aspect;
  shutter.position.x = picture.visible ? 0 : x * aspect * 2.3;
  if (picture.visible) placePicture(s.cut, s.phase === 'exit' ? exit ** 2 : 0);
  rotor.position.x = x * (aspect + 1);
  rotor.rotation.z = 0.4 + (now - s.start) * 0.0028;
  blade.rotation.x = 0.42 + Math.sin((now - s.start) * 0.003) * 0.58;
  const clear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(layer, camera);
  renderer.autoClear = clear;
  s.frames++;
}
