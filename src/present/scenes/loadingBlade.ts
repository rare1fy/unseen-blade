import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { finishBuild, loadInFrames, type BuildSteps } from '../engine/buildSteps';
import type { WipeLook } from './wipeCover';
import { toon } from '../look/toon';
import { cue } from '../../audio/cues';

// 小刀转场（微信的加载 / 换场景）。11-18 用户：「codex怎么都做得不好，很呆板。」重做成一把真被甩出来的刀：
//   盖：九根竹子从上面一根接一根砸下来（从左往右错开 13 毫秒，落到位顿一下、弹一下），同时刀从左上方转着飞进来，
//       正好扎进右边那根最靠前的竹子里——刀尖没进竹子（藏在竹面后），刀身连同护手、刀柄斜着朝镜头翘出来，「笃」一声，
//       竹子被扎得一晃、迸几粒竹屑，刀身嗡地颤，红穗被甩起来再荡回去。约 0.2 秒盖满。
//   等：刀插在竹子上，颤动很快衰减到停，只有穗子被一点风吹着轻轻晃——等多久都行，不是转圈的「加载转轮」。
//   揭：加载完，刀被往外一拔（竹子跟着被拽一下），甩出去，边飞边转、越转越慢，从右上方离开画面；竹子从被扎的那根开始
//       往两边一根带一根地松脱、倒下去（越外面的越晚，往外歪）。加载很快时整段约 0.52 秒。
// 刀的转、穗子的甩都是按时间和受力算的（穗子是挂在刀环上的单摆，受刀环的加速度驱动），不是公式摆动。

const layer = new THREE.Scene();
// 11-19 (用户：「竹子没之前那个立体的竹子帅啊，而且我咋感觉这个刀和竹子是2d的，我要3D的，保持画面冲击力」): a perspective camera
// close in, a little below the middle and looking up a touch, so the stalks have sides, round shading and depth between the rows;
// the near stalks big, the far ones smaller and darker; cel shading with the game's rim light (look/toon.ts) like the old sweep's stalks
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 40);
const CAM_Z = 3.2, CAM_Y = -0.18;
camera.position.set(0, CAM_Y, CAM_Z); camera.lookAt(0, 0.05, 0);
const shutter = new THREE.Group(), rotor = new THREE.Group(), blade = new THREE.Group(), tassel = new THREE.Group();
const unit = new THREE.BoxGeometry();
const materials = new Map<number, THREE.Material>();
const matOf = (color: number) => { let m = materials.get(color); if (!m) { m = toon(color, { rim: 0.8 }); materials.set(color, m); } return m; };
function block(parent: THREE.Object3D, color: number, x: number, y: number, z: number, w: number, h: number, d: number) {
  const part = new THREE.Mesh(unit, matOf(color));
  part.position.set(x, y, z); part.scale.set(w, h, d); parent.add(part); return part;
}

/** one stalk (or the post): its own group so each moves on its own (x, z: where it stands; r: its radius; front: its near face's z) */
interface Stalk { g: THREE.Group; x: number; z: number; r: number; front: number }
const bamboo: Stalk[] = [], pillar: Stalk[] = [];
const bambooRoot = new THREE.Group(), pillarRoot = new THREE.Group();
const chips: THREE.Mesh[] = [];
const chipMat = toon(0xc8c08a);
/** the split the point opens in the stalk: a short dark slit along its length (bamboo splits along the grain), carried by the stalk */
const crack = new THREE.Mesh(unit, toon(0x141c10, { rim: 0 }));
const stalkMat = toon(0xffffff, { vertexColors: true, rim: 0.9 });

// ---------------------------------------------------------------- build (once)
function paint(g: THREE.BufferGeometry, color: number) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function box(list: THREE.BufferGeometry[], color: number, x: number, y: number, z: number, w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z); list.push(paint(g, color));
}
/** an eight-sided column (flat faces, so the cel shading steps across it: a stalk that reads round, not a slab) */
function column(list: THREE.BufferGeometry[], color: number, r: number, y0: number, y1: number) {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 8, 1, false, Math.PI / 8).toNonIndexed(); g.translate(0, (y0 + y1) / 2, 0);
  g.deleteAttribute('uv'); g.computeVertexNormals(); list.push(paint(g, color));
}
function piece(parent: THREE.Group, list: THREE.BufferGeometry[], x: number, z: number, r: number, front: number, into: Stalk[] | null) {
  for (const l of list) if (l.attributes.uv) l.deleteAttribute('uv');
  const g = new THREE.Group(), m = new THREE.Mesh(mergeGeometries(list), stalkMat);
  for (const p of list) p.dispose();
  m.frustumCulled = false; g.add(m); parent.add(g); g.position.set(x, 0, z); into?.push({ g, x, z, r, front });
}
/** nine stalks in three rows (the front row nearest the camera); x across the view */
const STALKS = 9, TALL = 3.6, HALF = TALL / 2, FAR_Z = -0.85, FAR_HALF = 2.3;
let farRow: THREE.Group | null = null;
const ROWS = [0.62, 0.18, -0.32];
const XS = [-1.55, -1.12, -0.74, -0.38, 0.0, 0.36, 0.74, 1.12, 1.55];
/** the stalk the blade sticks in: right of the middle, in the front row */
const HIT = 5;
const rowOf = (i: number) => (i === HIT ? 0 : (i + (i >> 1)) % 3);
const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
let built = false;
function makeLayer() {
  if (built) return;
  built = true;
  layer.add(shutter, rotor, new THREE.HemisphereLight(0xfff4de, 0x405060, 1.1));
  const light = new THREE.DirectionalLight(0xfff1d8, 2.6); light.position.set(-2.5, 3, 4); layer.add(light);
  const back = new THREE.DirectionalLight(0x9ab8ff, 0.9); back.position.set(3, 1, -2); layer.add(back);
  shutter.add(bambooRoot, pillarRoot);
  // the bamboo: round stalks with raised node rings and a pale band above each; the back rows darker so the three depths read;
  // behind them a dark wall so nothing of the old room shows through a gap
  const greens = [0x3a5a30, 0x46683a, 0x2e4a2a, 0x527440];
  for (let i = 0; i < STALKS; i++) {
    const row = rowOf(i), z = ROWS[row], dim = row === 0 ? 1 : row === 1 ? 0.84 : 0.68;
    const r = (row === 0 ? 0.17 : row === 1 ? 0.15 : 0.13) + ((i * 7) % 3) * 0.008, col = shade(greens[i % greens.length], dim), L: THREE.BufferGeometry[] = [];
    column(L, col, r, -HALF, HALF);
    for (let y = -HALF + 0.3 + (i % 3) * 0.17; y < HALF; y += 0.62 + (i % 2) * 0.06) {
      column(L, shade(0x7a9a58, dim), r * 1.12, y - 0.025, y + 0.025);
      column(L, shade(col, 1.25), r * 1.01, y + 0.025, y + 0.09);
    }
    piece(bambooRoot, L, XS[i], z, r, z + r, bamboo);
  }
  { const L: THREE.BufferGeometry[] = [];
    for (let k = 0, x = -4.6; x <= 4.6; x += 0.27, k++) { const r = 0.15 + (k % 3) * 0.012, c = shade(greens[k % greens.length], 0.42);
      const g0: THREE.BufferGeometry[] = []; column(g0, c, r, -FAR_HALF, FAR_HALF);
      for (let y = -FAR_HALF + 0.2 + (k % 4) * 0.15; y < FAR_HALF; y += 0.66) column(g0, shade(0x7a9a58, 0.42), r * 1.1, y - 0.02, y + 0.02);
      for (const g of g0) { g.translate(x, 0, (k % 2) * -0.12); L.push(g); } }
    piece(bambooRoot, L, 0, FAR_Z, 0, 0, null); farRow = bambooRoot.children[bambooRoot.children.length - 1] as THREE.Group; }
  // the post: one heavy dark timber, darker edges, a vermilion face strip and two iron bands with rivets
  { const L: THREE.BufferGeometry[] = [];
    // (wide enough that a 21:9 phone sees post from edge to edge; the dark seams split it into three planks)
    box(L, 0x3a2a1e, 0, 0, 0, 7.2, TALL, 0.7); for (const x of [-1.9, 1.9]) box(L, 0x2c2016, x, 0, 0.3, 0.12, TALL, 0.2);
    box(L, 0x7a2a1e, 0.8, 0, 0.36, 0.5, TALL, 0.04);
    for (const y of [-0.85, 0.7]) { box(L, 0x2a2a30, 0, y, 0.37, 7.26, 0.1, 0.06); for (let k = -7; k <= 7; k++) box(L, 0x6a6a72, k * 0.48, y, 0.41, 0.05, 0.05, 0.03); }
    piece(pillarRoot, L, 0, 0.3, 0.35, 0.65, pillar); }
  crack.visible = false;
  for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(unit, chipMat); c.visible = false; c.frustumCulled = false; shutter.add(c); chips.push(c); }
  // the game's ring-pommel dao: bright cutting edge, dark steel spine, wrapped grip, brass ring and a vermilion tassel — thick
  // enough to read as steel in this light (a small bevel on both plates)
  rotor.add(blade); rotor.scale.setScalar(BLADE_S); rotor.rotation.order = 'ZYX';
  const steel = (points: number[][], color: number, thickness: number, bevel: number) => {
    const profile = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(profile, { depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 1 });
    geometry.translate(0, 0, -thickness / 2);
    blade.add(new THREE.Mesh(geometry, toon(color, { rim: 1.2 })));
  };
  steel([[-.235, .052], [.28, .058], [.45, .086], [.555, .125], [.45, .017], [.31, -.025], [-.235, -.035]], 0xaebdc8, .06, .006);
  steel([[-.235, -.035], [.31, -.025], [.45, .017], [.555, .125], [.477, -.006], [.32, -.056], [-.235, -.059]], 0xf4efe3, .032, .004);
  block(blade, 0xd4ad68, -0.245, 0, 0, 0.045, 0.18, 0.12);
  block(blade, 0x493334, -0.385, 0, 0, 0.24, 0.085, 0.09);
  for (let i = 0; i < 4; i++) block(blade, 0x85513c, -0.3 - i * 0.053, 0, 0, 0.02, 0.094, 0.098);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.016, 6, 12), matOf(0xd4ad68));
  ring.position.x = RING; blade.add(ring);
  tassel.position.set(RING - 0.01, -0.035, 0); blade.add(tassel);
  block(tassel, 0xac3427, -0.02, -0.055, 0, 0.026, 0.13, 0.03);
  block(tassel, 0x923229, -0.05, -0.065, -0.01, 0.022, 0.1, 0.026);
  for (const o of [rotor, shutter, crack]) o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) m.frustumCulled = false; });
}

// ---------------------------------------------------------------- timing (ms) and the throw
const BLADE_S = 0.95, RING = -0.55;
/** points on the blade's axis (its local x): where it meets the stalk's face when stuck, its centre of mass (the handle is heavy) */
const ANCHOR = 0.40, CM = -0.08;
/** cover: stalk i starts falling at i·DROP_STAG, lands DROP later; the last lands at ~196 ms; the blade goes in at IMPACT */
const DROP_STAG = 13, DROP = 92, ARRIVAL = 205, IMPACT = 180;
/** the pull (blade tugged out of the stalk), then away: the blade off screen and every stalk fallen by EXIT */
const WINDUP = 80, EXIT = 240, EXIT_STAG = 14;
/** stuck pose: tip pointing right and a little down, the point driven into the screen so the stalk's face hides it */
const THETA = -0.32, PHI = 0.62, ROLL = 0.16;
/** the throw: spin before it bites (rad); the arc's bulge (screen units) */
const SPIN = Math.PI * 2 * 1.15, ARC = 0.1;
const DROP_FROM = 4.2;

type Phase = 'enter' | 'work' | 'ready' | 'windup' | 'exit';
interface BladeState {
  phase: Phase; cover: WipeLook; since: number; start: number; frames: number; hit: boolean;
  /** where the blade let go of the stalk (centre of mass, screen units) at the release */
  rx: number; ry: number;
  /** the tassel: a pendulum on the ring (angle from straight down, rad; its speed) and the ring's last position / speed */
  ta: number; tw: number; px: number; py: number; vx: number; vy: number; last: number; seen: number;
}
let active: BladeState | null = null;
let warmDestination: (() => Promise<void>) | undefined;
export function setLoadingWarmup(warm: () => Promise<void>) { warmDestination = warm; }
export const bladeBusy = () => active !== null;
export const bladeWorking = () => active?.phase === 'work';
export function runRoomBuild<T>(steps: BuildSteps<T>) {
  return bladeWorking() ? loadInFrames(steps) : finishBuild(steps);
}
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };

export async function withLoadingBlade(work: () => void | Promise<void>, cover: WipeLook = 'bamboo') {
  if (active) throw new Error('A scene transition is already running');
  makeLayer();
  bambooRoot.visible = cover === 'bamboo';
  pillarRoot.visible = cover === 'pillar';
  const state: BladeState = { phase: 'enter', cover, since: 0, start: 0, frames: 0, hit: false, rx: 0, ry: 0, ta: 0, tw: 0, px: 0, py: 0, vx: 0, vy: 0, last: 0, seen: 0 };
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
    while (performance.now() - state.since < WINDUP) await nextFrame();
    state.phase = 'exit';
    state.since = performance.now();
    cue('bladeFlyOut');
    do { await nextFrame(); } while (performance.now() - state.since < EXIT);
  } finally { active = null; }
}

// ---------------------------------------------------------------- per frame
/** the stalk's height while it falls in: from above the screen, already moving, faster and faster; then a short stiff bounce */
function dropY(u: number, D: number, A: number, w: number, lam: number) {
  if (u <= 0) return DROP_FROM;
  if (u < D) { const k = u / D; return DROP_FROM * (1 - k * (0.35 + 0.65 * k)); }
  const tau = (u - D) / 1000;
  return -A * Math.exp(-lam * tau) * Math.sin(w * tau);
}
function poseStalks(set: Stalk[], hit: number, age: number, pull: number, out: number, spread: number, post: boolean, lean: number) {
  for (let i = 0; i < set.length; i++) {
    const s = set[i], d = Math.abs(i - hit), side = i === hit ? 0 : Math.sign(i - hit);
    let y = post ? dropY(age, 110, 0.06, Math.PI * 2 * 7, 16) : dropY(age - i * DROP_STAG, DROP, 0.1, Math.PI * 2 * 8, 14);
    let dx = 0, tilt = 0;
    // the blade going in: the stalk it hits jumps along the blow and rings down; its neighbours a little
    const q = (age - IMPACT) / 1000;
    if (q > 0) dx += (d === 0 ? 0.03 : d === 1 ? 0.012 : 0) * (post ? 0.5 : 1) * Math.exp(-14 * q) * Math.sin(Math.PI * 2 * 11 * q);
    // the pull: dragged a hair after the blade as it comes out
    if (d === 0) dx -= 0.02 * smooth(pull);
    // let go: the hit stalk first, then outwards one after another, each falling away and leaning out
    if (out >= 0) {
      const tau = (out - d * EXIT_STAG) / 1000;
      if (tau > 0) { y -= 8 * tau + 0.5 * 240 * tau * tau; dx += side * 0.6 * tau; tilt = post ? -0.4 * tau * tau : -side * (0.6 * tau + 6 * tau * tau); }
    }
    s.g.position.set(s.x * spread + dx, y, s.z); s.g.rotation.z = tilt; s.g.rotation.x = post ? 0 : lean * (s.z - ROWS[2]);
  }
}
/** put the blade so the point `along` its axis (local x) is at (px, py, pz), turned theta in the screen plane, phi into it, roll about itself */
function poseBlade(px: number, py: number, pz: number, theta: number, phi: number, roll: number, along: number) {
  rotor.rotation.set(roll, phi, theta);
  const c = Math.cos(phi), k = along * BLADE_S;
  rotor.position.set(px - c * Math.cos(theta) * k, py - c * Math.sin(theta) * k, pz + Math.sin(phi) * k);
}
/** the screen point a point `along` the blade's axis is at, in the current pose */
const axisAt = (along: number, out: { x: number; y: number }) => {
  const r = rotor.rotation, c = Math.cos(r.y), k = along * BLADE_S;
  out.x = rotor.position.x + c * Math.cos(r.z) * k; out.y = rotor.position.y + c * Math.sin(r.z) * k; return out;
};
const ringP = { x: 0, y: 0 };

export function drawLoadingBlade(renderer: THREE.WebGLRenderer, aspect: number) {
  const s = active;
  if (!s) return;
  const now = performance.now();
  const first = s.phase === 'enter' && !s.frames;
  const age = first ? 0 : now - s.start;
  const post = s.cover === 'pillar', set = post ? pillar : bamboo, hit = post ? 0 : HIT;
  const pull = s.phase === 'windup' ? (now - s.since) / WINDUP : s.phase === 'exit' ? 1 : 0;
  const out = s.phase === 'exit' ? now - s.since : -1;
  // the view: a 46° vertical field; wider screens spread the stalks so the wall still runs edge to edge; a slow breath of a push-in
  // while it waits (the camera never stands quite still), a kick on the bite
  const spread = Math.max(1, aspect / 1.6), kick = age > IMPACT ? 0.05 * Math.exp(-(age - IMPACT) / 70) : 0;
  camera.aspect = aspect; camera.position.set(0.02 * Math.sin(now * 0.0007), CAM_Y, CAM_Z - 0.04 * smooth((age - ARRIVAL) / 1200) - kick); camera.lookAt(0, 0.05, 0); camera.updateProjectionMatrix();
  poseStalks(set, hit, age, pull, out, spread, post, 0.03);
  // the far row: in a beat ahead of the near stalks (it is what closes the gaps), out after the fourth ring of them has let go
  if (farRow) { let y = dropY(age + 18, DROP, 0.08, Math.PI * 2 * 7, 14);
    if (out >= 0) { const tau = (out - 3 * EXIT_STAG) / 1000; if (tau > 0) y -= 9 * tau + 0.5 * 260 * tau * tau; }
    farRow.position.set(0, y, FAR_Z); farRow.scale.x = spread; }

  // where it bites: the middle of the hit stalk (the post: left of the red strip), just behind the face
  const bx = post ? 0.15 : set[hit].x * spread, by = post ? 0.18 : 0.14, bz = set[hit].front - 0.02;
  if (age < IMPACT) {
    // the throw: the centre of mass flies a shallow arc from off the left edge, the blade turning about it, slowing a little,
    // a slight wobble of its own axis; it arrives tip first along the stuck heading
    const u = age / IMPACT, rest = (ANCHOR - CM) * BLADE_S * Math.cos(PHI);
    const ex = bx - Math.cos(THETA) * rest, ey = by - Math.sin(THETA) * rest;
    const sx = -1.9 * spread - 0.8, sy = 0.75;
    const x = sx + (ex - sx) * u, y = sy + (ey - sy) * u + ARC * 4 * u * (1 - u);
    const theta = THETA + SPIN * (1 - u) * (0.65 + 0.35 * (1 - u));
    poseBlade(x, y, bz + 0.9 * (1 - u) + 0.25, theta, PHI * u * u * u, 0.4 * Math.sin(Math.PI * 2 * 1.8 * u) * (1 - u) + ROLL * u, CM);
  } else if (out < 0) {
    // stuck: the blade hums and stills; on the pull it is drawn back out along itself, the handle lifting
    if (!s.hit) { s.hit = true; cue('dartHit', 1); }
    const q = (age - IMPACT) / 1000, ring = Math.exp(-7 * q), p = smooth(pull);
    const back = 0.07 * p;
    const theta = THETA + 0.14 * ring * Math.sin(Math.PI * 2 * 13 * q) + 0.08 * p;
    const phi = PHI + 0.05 * ring * Math.sin(Math.PI * 2 * 13 * q + 1.2);
    poseBlade(bx - Math.cos(THETA) * back, by - Math.sin(THETA) * back, bz + back * Math.tan(PHI), theta, phi, ROLL, ANCHOR);
    axisAt(CM, ringP); s.rx = ringP.x; s.ry = ringP.y;
  } else {
    // away: flung up and out to the right, fast and gathering speed, spinning hard at first and slowing
    const o = out / 1000, dist = 7 * o + 0.5 * 120 * o * o;
    const theta = THETA + 0.08 - (34 * o - 0.5 * 60 * o * o);
    poseBlade(s.rx + 0.8 * dist, s.ry + 0.5 * dist, bz + 0.25 + 0.6 * dist, theta, PHI * (1 - clamp01(o / 0.06)), ROLL + 0.3 * Math.sin(o * 38), CM);
  }

  // the tassel: a pendulum hanging off the ring, swung by the ring's acceleration (streams out in the spin, whips on the bite,
  // swings back and settles; a breath of wind keeps it moving while she waits)
  axisAt(RING, ringP);
  const dt = s.seen ? Math.min(1 / 30, Math.max(0, (now - s.last) / 1000)) : 0;
  // (the cord is cloth in air: only a twentieth of the ring's jolt reaches it, and never more than 250 units/s²)
  let ax = 0, ay = 0;
  if (s.seen >= 1 && dt > 0) {
    const vx = (ringP.x - s.px) / dt, vy = (ringP.y - s.py) / dt;
    if (s.seen >= 2) { ax = Math.max(-250, Math.min(250, 0.05 * (vx - s.vx) / dt)); ay = Math.max(-250, Math.min(250, 0.05 * (vy - s.vy) / dt)); }
    s.vx = vx; s.vy = vy;
  }
  const G = 6, LEN = 0.075, C = 3.5;
  const breeze = 6 * Math.sin(now * 0.0021) + 3.5 * Math.sin(now * 0.0037 + 1);
  for (let n = 0; n < 4; n++) {
    const h = dt / 4;
    const acc = -(ax * Math.cos(s.ta) + (G + ay) * Math.sin(s.ta)) / LEN - C * s.tw + breeze;
    s.tw = Math.max(-40, Math.min(40, s.tw + acc * h)); s.ta = Math.max(-2.6, Math.min(2.6, s.ta + s.tw * h));
  }
  s.px = ringP.x; s.py = ringP.y; s.last = now; s.seen++;
  tassel.rotation.z = s.ta - rotor.rotation.z;

  // the split: opens on the bite (a hair longer as the point drives in), rides the stalk as it falls away
  { const g = set[hit].g, open = clamp01((age - IMPACT) / 40);
    if (crack.parent !== g) g.add(crack);
    crack.visible = open > 0;
    crack.position.set(post ? 0.15 : 0, by + 0.02, set[hit].front - set[hit].z + 0.004);
    crack.scale.set(0.03, (post ? 0.18 : 0.3) * (0.6 + 0.4 * open), 0.02); }
  chipMat.color.setHex(post ? 0x8a6a44 : 0xc8c08a);
  // splinters off the bite: thrown back up and out to the left, falling, shrinking
  const t = (age - IMPACT) / 1000;
  for (let k = 0; k < chips.length; k++) {
    const c = chips[k], life = 0.26 + 0.04 * k;
    c.visible = t > 0 && t < life && out < 0;
    if (!c.visible) continue;
    const vx = -1.4 - 0.6 * k, vy = 1.1 + 0.5 * ((k * 3) % 4), vz = 1.2 + 0.4 * k, size = 0.045 * (1 - t / life) + 0.01;
    c.position.set(bx + vx * t, by + vy * t - 7 * t * t, bz + 0.05 + vz * t); c.scale.setScalar(size); c.rotation.set(k + t * 9, t * 7, 0);
  }

  const clear = renderer.autoClear;
  renderer.autoClear = false;
  try {
    renderer.clearDepth();
    renderer.render(layer, camera);
  } finally { renderer.autoClear = clear; }
  // Time the throw from the first submitted frame, even on a cold GPU.
  if (first) { s.start = performance.now(); cue('bladeFlyIn'); }
  s.frames++;
}
