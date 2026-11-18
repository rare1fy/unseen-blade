import * as THREE from 'three';
import { finishBuild, loadInFrames, type BuildSteps } from '../engine/buildSteps';
import { wipeCover, type WipeLook } from './wipeCover';
import { cue } from '../../audio/cues';

const layer = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
camera.position.z = 8;
const shutter = new THREE.Group(),
  blade = new THREE.Group(),
  rotor = new THREE.Group();
const tassel = new THREE.Group();
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
let built = false;
function makeLayer() {
  if (built) return;
  built = true;
  layer.add(shutter, rotor, new THREE.HemisphereLight(0xfff4de, 0x506476, 1.45));
  const light = new THREE.DirectionalLight(0xfff1d8, 2.4);
  light.position.set(-2, 4, 5);
  layer.add(light);
  shutter.add(bamboo, pillar);
  rotor.add(blade);
  rotor.position.z = 1.4;
  rotor.scale.setScalar(0.55);
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
  tassel.position.set(-0.56, -0.035, 0);
  blade.add(tassel);
  block(tassel, 0xac3427, -0.02, -0.055, 0, 0.024, 0.13, 0.026);
  block(tassel, 0x923229, -0.05, -0.065, -0.008, 0.021, 0.1, 0.022);
}
const ARRIVAL = 225, APPROACH = 140, WINDUP = 96, DEPARTURE = 150;
const SETTLED = 0.30, AIM = 0.16;
type Phase = 'enter' | 'work' | 'ready' | 'windup' | 'exit';
type BladeState = { phase: Phase; since: number; start: number; frames: number; releaseAngle: number };
let active: BladeState | null = null;
let warmDestination: (() => Promise<void>) | undefined;
export function setLoadingWarmup(warm: () => Promise<void>) { warmDestination = warm; }
export const bladeBusy = () => active !== null;
export const bladeWorking = () => active?.phase === 'work';
export function runRoomBuild<T>(steps: BuildSteps<T>) {
  return bladeWorking() ? loadInFrames(steps) : finishBuild(steps);
}
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const idleAngle = (age: number) => SETTLED + Math.max(0, age - ARRIVAL) * 0.0038;

export async function withLoadingBlade(work: () => void | Promise<void>, cover: WipeLook = 'bamboo') {
  if (active) throw new Error('A scene transition is already running');
  makeLayer();
  bamboo.visible = cover === 'bamboo';
  pillar.visible = cover === 'pillar';
  const state: BladeState = { phase: 'enter', since: 0, start: 0, frames: 0, releaseAngle: 0 };
  active = state;
  try {
    while (!state.frames || performance.now() - state.start < ARRIVAL) await nextFrame();
    state.phase = 'work';
    await nextFrame();
    await work();
    try { await warmDestination?.(); }
    catch (error) { console.warn('[stage] shader warmup failed', error); }

    state.phase = 'ready';
    state.frames = 0;
    while (!state.frames) await nextFrame();
    state.phase = 'windup';
    state.since = performance.now();
    state.releaseAngle = idleAngle(state.since - state.start);
    while (performance.now() - state.since < WINDUP) await nextFrame();
    state.phase = 'exit';
    state.since = performance.now();
    cue('bladeFlyOut');
    do { await nextFrame(); } while (performance.now() - state.since < DEPARTURE);
  } finally { active = null; }
}

export function drawLoadingBlade(renderer: THREE.WebGLRenderer, aspect: number) {
  const state = active;
  if (!state) return;
  const now = performance.now();
  const firstFrame = state.phase === 'enter' && !state.frames;
  const age = firstFrame ? 0 : now - state.start;
  const elapsed = now - state.since;
  const reach = aspect + 0.46;
  let x = 0, y = 0, angle = idleAngle(age), coverX = 0;
  let roll = 0.26 + 0.30 * Math.sin(Math.max(0, age - ARRIVAL) * 0.004);
  let tasselAngle = -0.14;

  if (state.phase === 'enter') {
    coverX = -2.3 * aspect * (1 - Math.min(1, age / APPROACH)) ** 2;
    if (age < APPROACH) {
      const t = age / APPROACH;
      x = 0.085 - (reach + 0.085) * (1 - t);
      angle = AIM + 0.06 * t;
      tasselAngle = -1.05;
    } else {
      const t = Math.min(1, (age - APPROACH) / (ARRIVAL - APPROACH));
      const recoil = (1 - t) ** 2;
      x = 0.085 * recoil;
      angle = SETTLED + (AIM + 0.06 - SETTLED) * recoil + 0.22 * Math.sin(Math.PI * t) * (1 - t);
      tasselAngle = -0.14 - 0.91 * recoil + 0.58 * Math.sin(Math.PI * t);
    }
    y = x * Math.tan(AIM);
  } else if (state.phase === 'windup') {
    const t = Math.min(1, elapsed / WINDUP);
    const ease = t * t * (3 - 2 * t);
    const turn = Math.atan2(Math.sin(AIM - state.releaseAngle), Math.cos(AIM - state.releaseAngle));
    angle = state.releaseAngle + turn * ease;
    x = -0.09 * ease;
    y = x * Math.tan(AIM);
    roll *= 1 - ease;
    tasselAngle += 0.39 * ease;
  } else if (state.phase === 'exit') {
    const t = Math.min(1, elapsed / DEPARTURE);
    const thrust = t * (0.48 + 0.52 * t);
    x = -0.09 + (reach + 0.09) * thrust;
    y = x * Math.tan(AIM);
    angle = AIM;
    roll = -0.28 * t;
    tasselAngle = 0.25 - 1.40 * Math.min(1, t * 3);
    coverX = 2.3 * aspect * thrust;
  }

  camera.left = -aspect;
  camera.right = aspect;
  camera.updateProjectionMatrix();
  shutter.scale.x = aspect;
  shutter.position.x = coverX;
  rotor.position.set(x, y, 1.4);
  rotor.rotation.z = angle;
  blade.rotation.x = roll;
  tassel.rotation.z = tasselAngle;
  const clear = renderer.autoClear;
  renderer.autoClear = false;
  try {
    renderer.clearDepth();
    renderer.render(layer, camera);
  } finally { renderer.autoClear = clear; }
  // Time the launch from the first submitted frame, even on a cold GPU.
  if (firstFrame) { state.start = performance.now(); cue('bladeFlyIn'); }
  state.frames++;
}
