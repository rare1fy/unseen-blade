// The rooms without a fight (act-17): 行商 (three stalls), 歇脚 (a campfire with two mats), 遗卷 (a scroll on a stone altar).
// Everything is a thing in the scene: a straw mat in front of each station; standing on it without moving fills a ring at the
// feet in 1 s and the station acts (buys, heals, sharpens, gives the scroll). A stall the purse can't pay for shows its price red
// and its ring doesn't fill. Names are agy's (docs/DESIGN.md 第十七轮).
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { toon } from '../look/toon';
import { makeSign } from './yard';
import { fxSparks, fxRing } from '../fx/fx';
import { addBlock } from '../fx/blocks';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';

export interface Station { id: string; label: string; sub: string; price: number; at: THREE.Vector3; fill: number; done: boolean; once: boolean;
  g: THREE.Group; ring: THREE.Mesh; sign: THREE.Group; poor: boolean;
  /** act-36 (用户：「牌子太小了，根本看不清楚文字，也缺乏特效和UI支撑让人知道那个是可以交互的」): a glowing edge round the mat that
   *  breathes, brighter in reach (red when the purse can't pay); nearK 0..1 in reach.
   *  act-37 (用户：「商店里的选项……好丑，还过曝了」): no glowing card badge over it any more — the ware itself (a voxel model on the
   *  counter, lit like the scene) lifts a little and turns slowly in reach */
  edge: THREE.Mesh; ware: THREE.Object3D | null; wareY: number; nearK: number }

const box = (w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(c)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m; };
const MAT_R = 0.75, FILL_T = 1.0, NEAR = 2.2, SIGN = { w: 2.2, h: 1.0, post: 1.25 };

// ---------------------------------------------------------------- the stalls and their wares, voxel models in the scene's 7 cm cells
// act-37 (用户：「商店里的选项……好丑，还过曝了」): the old ones were plain boxes under a bright red cloth with small white wares on
// top. Now: a dark wooden trestle counter under an undyed hemp runner; the wares big enough to read from the game camera — a roll
// of bamboo slips on a cradle (秘卷), a glazed medicine gourd with a red label (金疮药), a whetstone with a sabre across it (青砥石).
// Big axis-aligned masses, two or three tones a material, lit like everything else (nothing glows).
type Ware = 'scroll' | 'gourd' | 'stone';
const WD = 0x3e2a1a, WM = 0x5a3c24, WL = 0x74503a;                     // dark wood: shade, body, lit top
const HEMP = 0x8c7656, HEMP_D = 0x6e5c44;
const BAM = 0xc4a058, BAM_D = 0xa8873e, BAM_E = 0xdcc282, CORD = 0x34261a, TAG = 0x9a3024;
const GOURD = 0x7a4220, GOURD_L = 0x965428, GOURD_D = 0x5a2e16, LABEL = 0xa8322a, INK = 0x3a1a10, CORK = 0x9a7a4a;
const POT = 0xc8bea8, POT_D = 0x8e8676, HERB = 0x5e7034, HERB_D = 0x44522a;
const STONE = 0x4c5a62, STONE_L = 0x6a7a82, STEEL = 0x8e98a2, STEEL_L = 0xc8d0d8, GUARD = 0x26262c, GRIP = 0x8a2a20, BRONZE = 0xb08040;
const built = new Map<string, THREE.Mesh[]>();
function voxModel(key: string, draw: (w: VoxWorld) => void) {
  let ms = built.get(key);
  if (!ms) { const w = new VoxWorld(CELL); draw(w); ms = w.build({ rim: 0.25, edge: 0.14 }); built.set(key, ms); }
  const g = new THREE.Group(); for (const m of ms) { const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = true; c.receiveShadow = true; g.add(c); } return g;
}
/** the counter: two slab trestles, a thick plank top (y 7..8), a lower shelf, the hemp runner over the middle and down the front */
const COUNTER_TOP = 10 * CELL;
function counter() {
  return voxModel('counter', w => {
    for (const x of [-8, 7]) { w.box(x, 0, -3, x + 1, 6, 3, WM); w.box(x, 0, -3, x + 1, 0, 3, WD); }
    w.box(-7, 2, -3, 6, 2, 3, WD);
    w.box(-9, 7, -4, 8, 8, 4, WM); w.box(-9, 8, -4, 8, 8, 4, WL); w.box(-9, 7, 4, 8, 7, 4, WD);
    w.box(-5, 9, -4, 4, 9, 4, HEMP); w.box(-5, 7, 5, 4, 9, 5, HEMP); w.box(-5, 7, 5, 4, 7, 5, HEMP_D);
  });
}
/** the wares, standing on the counter (their y 0 = the runner's top) */
function wareModel(k: Ware) {
  if (k === 'scroll') return voxModel('w_scroll', w => {
    // two cradles, a roll of slips lying along x (slips run along it, two cords round it, the cut ends lighter with a dark core)
    for (const x of [-3, 2]) w.box(x, 0, -2, x + 1, 1, 1, WM);
    w.box(-4, 2, -2, 3, 5, 1, BAM);
    for (let y = 2; y <= 5; y++) if (y % 2) w.box(-4, y, 1, 3, y, 1, BAM_D);
    w.box(-4, 6, -1, 3, 6, 0, BAM);                                       // the roll's rounded top, two rows narrower
    for (const x of [-4, 3]) { w.box(x, 2, -2, x, 5, 1, BAM_E); w.box(x, 3, -1, x, 4, 0, BAM_D); }
    for (const x of [-2, 1]) w.box(x, 2, -2, x, 6, 1, CORD);
    w.box(-2, 1, 2, -2, 3, 2, TAG);                                       // a red tag hanging off the near cord
  });
  if (k === 'gourd') return voxModel('w_gourd', w => {
    // the gourd: a big bulb, a corded waist, a small bulb, the cork; a red paper label on its front; a lidded pot and herbs beside it
    w.box(-3, 0, -3, 2, 5, 2, GOURD); w.box(-3, 0, -3, 2, 0, 2, GOURD_D); w.box(-3, 5, -3, 2, 5, 2, GOURD_L);
    w.box(-2, 6, -2, 1, 6, 1, LABEL);
    w.box(-2, 7, -2, 1, 10, 1, GOURD); w.box(-2, 10, -2, 1, 10, 1, GOURD_L);
    w.box(-1, 11, -1, 0, 12, 0, CORK);
    w.box(-1, 1, 3, 0, 4, 3, LABEL); w.box(-1, 3, 3, 0, 3, 3, INK);
    w.box(4, 0, -1, 7, 2, 2, POT); w.box(4, 0, -1, 7, 0, 2, POT_D); w.box(5, 3, 0, 6, 3, 1, POT_D);
    w.box(-7, 0, -1, -5, 1, 2, HERB); w.box(-7, 2, 0, -6, 2, 1, HERB_D);
  });
  return voxModel('w_stone', w => {
    // a wooden block, the blue-grey whetstone, a sabre lying along it (blade, dark guard, red-bound grip, bronze ring)
    w.box(-6, 0, -2, 5, 1, 2, WM); w.box(-6, 1, -2, 5, 1, 2, WL);
    w.box(-5, 2, -2, 4, 3, 1, STONE); w.box(-5, 3, -2, 4, 3, 1, STONE_L);
    w.box(-7, 4, 0, 4, 4, 0, STEEL); w.box(-7, 5, 0, 4, 5, 0, STEEL_L);
    w.box(5, 3, -1, 5, 5, 2, GUARD); w.box(6, 4, 0, 8, 4, 1, GRIP); w.box(9, 4, -1, 10, 5, 2, BRONZE); w.box(9, 4, 0, 10, 4, 1, null);
  });
}
/** a counter with its ware on top; the ware is userData.ware (it lifts and turns in reach) */
function stall(ware: Ware) {
  const g = counter(), wm = wareModel(ware); wm.scale.setScalar(1.3); wm.position.y = COUNTER_TOP;   // (a little larger than life: read from the game camera)
  g.add(wm); g.userData.ware = wm; g.userData.wareY = COUNTER_TOP; return g;
}
/** an altar of stacked stone slabs, the roll of slips on top */
function altar() {
  const g = new THREE.Group();
  g.add(box(1.4, 0.3, 1.0, 0x6a6660)); g.add(box(1.1, 0.4, 0.8, 0x7a766e, 0, 0.3));
  const wm = wareModel('scroll'); wm.position.y = 0.7; g.add(wm); g.userData.ware = wm; g.userData.wareY = 0.7;
  return g;
}
/** a campfire: a ring of stones, crossed logs, a flame that flickers (blocks) and a warm light */
function campfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(box(0.22, 0.16, 0.22, i % 2 ? 0x5a5650 : 0x6a6660, Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55)); }
  g.add(box(0.9, 0.12, 0.14, 0x4a3020, 0, 0.05)); g.add(box(0.14, 0.12, 0.9, 0x4a3020, 0, 0.12));
  const light = new THREE.PointLight(0xffa050, 2.2, 7, 1.6); light.position.set(0, 0.9, 0); g.add(light);
  g.userData.fire = true; return g;
}

export class Stations {
  list: Station[] = []; root = new THREE.Group(); private fires: THREE.Group[] = []; private t = 0;
  constructor(parent: THREE.Object3D) { parent.add(this.root); }
  /** the mat's glowing edge: four flat gold bars just outside the straw (one mesh, additive) */
  private edge(at: THREE.Vector3) {
    const W = 1.5, D = 1.2, T = 0.08, g: THREE.BufferGeometry[] = [];
    for (const [w, d, x, z] of [[W, T, 0, -D / 2], [W, T, 0, D / 2], [T, D, -W / 2, 0], [T, D, W / 2, 0]] as Array<[number, number, number, number]>) g.push(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, 0, z));
    const merged = new THREE.BufferGeometry(), P: number[] = [], I: number[] = []; let o = 0;
    for (const q of g) { const pa = q.attributes.position.array as ArrayLike<number>; for (let i = 0; i < pa.length; i++) P.push(pa[i]); const ia = q.index!.array; for (let i = 0; i < ia.length; i++) I.push(ia[i] + o); o += q.attributes.position.count; q.dispose(); }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); merged.setIndex(I);
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(at.x, 0.06, at.z); m.renderOrder = 3; this.root.add(m); return m;
  }
  private mat(at: THREE.Vector3) {
    const mat = box(1.3, 0.04, 1.0, 0x8a7448, at.x, 0, at.z); this.root.add(mat); this.root.add(box(1.1, 0.045, 0.8, 0x9a8250, at.x, 0, at.z));
    const ring = new THREE.Mesh(new THREE.RingGeometry(MAT_R - 0.08, MAT_R, 40, 1, 0, 0.001).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.position.set(at.x, 0.07, at.z); ring.renderOrder = 3; this.root.add(ring); return ring;
  }
  private add(id: string, label: string, sub: string, price: number, at: THREE.Vector3, prop: THREE.Group, once: boolean) {
    prop.position.set(at.x, 0, at.z - 1.15); this.root.add(prop);
    // (act-36: the board twice as big and on a taller post — readable from the game camera)
    const sign = makeSign(label, { w: SIGN.w, h: SIGN.h, post: SIGN.post, sub, price }); sign.position.set(at.x + 1.25, 0, at.z - 1.05); this.root.add(sign);
    this.list.push({ id, label, sub, price, at, fill: 0, done: false, once, g: prop, ring: this.mat(at), sign, poor: false, edge: this.edge(at), ware: (prop.userData.ware as THREE.Object3D) ?? null, wareY: (prop.userData.wareY as number) ?? 0, nearK: 0 });
  }
  /** 行商: 秘卷 (a boon), 金疮药 (heal), 青砥石 (sharpen a boon) */
  shop(prices: { boon: number; heal: number; sharpen: number }) {
    this.add('buy_boon', '秘卷', '', prices.boon, V3(-3.2, 0, -0.6), stall('scroll'), true);
    this.add('buy_heal', '金疮药', '', prices.heal, V3(0, 0, -1.4), stall('gourd'), true);
    this.add('buy_sharpen', '青砥石', '', prices.sharpen, V3(3.2, 0, -0.6), stall('stone'), true);
  }
  /** 歇脚: a campfire, 裹伤调息 (heal) or 寒石砺刃 (sharpen) — taking one puts the other out */
  rest() {
    const f = campfire(); f.position.set(0, 0, -2.6); this.root.add(f); this.fires.push(f);
    this.add('rest_heal', '裹伤调息', '回血', 0, V3(-2.4, 0, -0.4), new THREE.Group(), true);
    this.add('rest_sharpen', '寒石砺刃', '磨刀', 0, V3(2.4, 0, -0.4), stall('stone'), true);
  }
  /** 遗卷: one scroll on an altar */
  scroll() { this.add('scroll', '遗卷', '秘传', 0, V3(0, 0, -1.0), altar(), true); }
  /** mark stalls the purse can't pay for (their sign is rebuilt with a red price) */
  setPurse(coins: number) {
    for (const s of this.list) {
      const poor = s.price > coins && !s.done; if (poor === s.poor) continue; s.poor = poor;
      const at = s.sign.position.clone(); this.root.remove(s.sign);
      s.sign = makeSign(s.label, { w: SIGN.w, h: SIGN.h, post: SIGN.post, sub: s.sub, price: s.price, ink: poor ? '#8a2018' : undefined }); s.sign.position.copy(at); this.root.add(s.sign);
    }
  }
  /** one station is spent: its mat dims, its ring goes; `others` = put the rest out too (the rest room's either-or) */
  spend(s: Station, others = false) {
    s.done = true; s.ring.visible = false; s.edge.visible = false; fxRing(s.at.clone().setY(0.08), 0xffe0a0, 1.4, { life: 0.5 } as never); fxSparks(s.at.clone().setY(0.6), 0xffe0a0, 16, 4);
    if (others) for (const o of this.list) if (o !== s && !o.done) { o.done = true; o.ring.visible = false; o.g.visible = false; o.sign.visible = false; o.edge.visible = false; }
  }
  /** the hero stands on a mat (still enough): fill its ring; returns the station whose ring just filled */
  update(dt: number, hero: THREE.Vector3, moving: boolean, canPay: (s: Station) => boolean): Station | null {
    this.t += dt; let fired: Station | null = null;
    for (const s of this.list) {
      if (s.done) continue;
      const on = Math.hypot(hero.x - s.at.x, hero.z - s.at.z) < MAT_R && !moving && canPay(s);
      const was = s.fill; s.fill = on ? Math.min(1, s.fill + dt / FILL_T) : Math.max(0, s.fill - dt * 2);
      if (Math.abs(s.fill - was) > 1e-4) { s.ring.geometry.dispose(); s.ring.geometry = new THREE.RingGeometry(MAT_R - 0.08, MAT_R, 40, 1, Math.PI / 2, Math.max(0.001, s.fill * Math.PI * 2)).rotateX(-Math.PI / 2); }
      if (s.fill >= 1 && was < 1) fired = s;
      // the affordance: the edge breathes (brighter in reach, red when it can't be paid), the ware lifts and swings round in reach
      const near = Math.hypot(hero.x - s.at.x, hero.z - s.at.z) < NEAR; s.nearK += ((near ? 1 : 0) - s.nearK) * Math.min(1, dt * 8);
      const em = s.edge.material as THREE.MeshBasicMaterial; em.color.setHex(s.poor ? 0xff5a40 : 0xffd070);
      em.opacity = (0.28 + 0.14 * Math.sin(this.t * 3 + s.at.x)) * (1 - s.nearK) + (0.75 + 0.15 * Math.sin(this.t * 6)) * s.nearK;
      if (s.ware) { s.ware.position.y = s.wareY + s.nearK * (0.12 + 0.025 * Math.sin(this.t * 2.4)); s.ware.rotation.y = Math.sin(this.t * 0.9 + s.at.x) * 0.6 * s.nearK; }
    }
    // the fire: a few flame blocks rising and shrinking
    for (const f of this.fires) if (Math.random() < dt * 22) addBlock(f.position.clone().add(V3((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4)), { size: 0.14 + Math.random() * 0.1, v: V3(0, 1.2 + Math.random(), 0), col: Math.random() < 0.5 ? 0xffb040 : 0xff6a20, bright: 1.6, life: 0.5, shrink: 0.5, drag: 1, grav: 0 });
    return fired;
  }
  /** the station in reach (for the floating name and price), the nearest one */
  near(hero: THREE.Vector3): Station | null { let b: Station | null = null, bd = NEAR; for (const s of this.list) { if (s.done) continue; const d = Math.hypot(hero.x - s.at.x, hero.z - s.at.z); if (d < bd) { bd = d; b = s; } } return b; }
  dispose() { this.root.parent?.remove(this.root); this.list = []; this.fires = []; }
}
