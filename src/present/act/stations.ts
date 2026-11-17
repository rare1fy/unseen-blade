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
import { glyphIcon3D } from './cardBoard';
import type { Model3D } from '../ui3d/models3d';

export interface Station { id: string; label: string; sub: string; price: number; at: THREE.Vector3; fill: number; done: boolean; once: boolean;
  g: THREE.Group; ring: THREE.Mesh; sign: THREE.Group; poor: boolean;
  /** act-36 (用户：「牌子太小了，根本看不清楚文字，也缺乏特效和UI支撑让人知道那个是可以交互的」): a glowing edge round the mat that
   *  breathes, brighter in reach (red when the purse can't pay); a turning badge of what it gives over the mat; nearK 0..1 in reach */
  edge: THREE.Mesh; badge: Model3D | null; nearK: number }

const box = (w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(c)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m; };
const MAT_R = 0.75, FILL_T = 1.0, NEAR = 2.2, SIGN = { w: 2.2, h: 1.0, post: 1.25 };
/** what a station gives, as a 10 × 10 picture for its floating badge: a gourd of medicine, a blade over a whetstone, a scroll */
const GIVE: Record<string, { rows: string[]; col: number }> = {
  heal: { rows: ['....##....', '...#oo#...', '....##....', '...####...', '..#oooo#..', '.#oooooo#.', '.#oooooo#.', '.#oooooo#.', '..#oooo#..', '...####...'], col: 0xd0803a },
  sharpen: { rows: ['........#.', '.......##.', '......##..', '.....##...', '....##....', '...##.....', '..##......', '##########', '#oooooooo#', '##########'], col: 0xa8b4c4 },
  boon: { rows: ['##......##', '#o######o#', '##oooooo##', '.#oooooo#.', '.#o####o#.', '.#oooooo#.', '.#o####o#.', '##oooooo##', '#o######o#', '##......##'], col: 0xe0c890 },
};
const giveOf = (id: string) => (id.includes('heal') ? GIVE.heal : id.includes('sharpen') ? GIVE.sharpen : GIVE.boon);

/** a low wooden table under a cloth, the ware on top (scroll / gourd / whetstone) */
function stall(ware: 'scroll' | 'gourd' | 'stone') {
  const g = new THREE.Group();
  g.add(box(1.3, 0.62, 0.7, 0x6a4628)); g.add(box(1.36, 0.06, 0.76, 0x8a2a20, 0, 0.62));
  if (ware === 'scroll') { g.add(box(0.7, 0.16, 0.16, 0xe6d8b0, 0, 0.68)); g.add(box(0.06, 0.2, 0.2, 0x5a3a20, -0.37, 0.66)); g.add(box(0.06, 0.2, 0.2, 0x5a3a20, 0.37, 0.66)); g.add(box(0.08, 0.17, 0.17, 0xb8302a, 0, 0.675)); }
  if (ware === 'gourd') { g.add(box(0.3, 0.26, 0.3, 0xc07a3a, -0.2, 0.68)); g.add(box(0.2, 0.18, 0.2, 0xc07a3a, -0.2, 0.94)); g.add(box(0.06, 0.08, 0.06, 0x5a3a20, -0.2, 1.12)); g.add(box(0.22, 0.14, 0.22, 0xd8d0c0, 0.25, 0.68)); }
  if (ware === 'stone') { g.add(box(0.62, 0.12, 0.24, 0x6a7078, 0, 0.68)); g.add(box(0.5, 0.05, 0.2, 0x9aa2aa, 0, 0.8)); }
  return g;
}
/** an altar of stacked stone slabs, a scroll case on top */
function altar() {
  const g = new THREE.Group();
  g.add(box(1.4, 0.3, 1.0, 0x6a6660)); g.add(box(1.1, 0.4, 0.8, 0x7a766e, 0, 0.3)); g.add(box(0.8, 0.14, 0.24, 0xd8c890, 0, 0.7)); g.add(box(0.06, 0.18, 0.28, 0xb8302a, 0, 0.69));
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
    const sign = makeSign(label, { w: SIGN.w, h: SIGN.h, post: SIGN.post, sub }); sign.position.set(at.x + 1.25, 0, at.z - 1.05); this.root.add(sign);
    const gv = giveOf(id), badge = glyphIcon3D('st_' + (id.includes('heal') ? 'heal' : id.includes('sharpen') ? 'sharpen' : 'boon'), gv.rows, gv.col);
    badge.scale.setScalar(0.5); badge.position.set(at.x, 1.9, at.z - 0.3); this.root.add(badge);
    this.list.push({ id, label, sub, price, at, fill: 0, done: false, once, g: prop, ring: this.mat(at), sign, poor: false, edge: this.edge(at), badge, nearK: 0 });
  }
  /** 行商: 秘卷 (a boon), 金疮药 (heal), 青砥石 (sharpen a boon) */
  shop(prices: { boon: number; heal: number; sharpen: number }) {
    this.add('buy_boon', '秘卷', `${prices.boon} 钱`, prices.boon, V3(-3.2, 0, -0.6), stall('scroll'), true);
    this.add('buy_heal', '金疮药', `${prices.heal} 钱`, prices.heal, V3(0, 0, -1.4), stall('gourd'), true);
    this.add('buy_sharpen', '青砥石', `${prices.sharpen} 钱`, prices.sharpen, V3(3.2, 0, -0.6), stall('stone'), true);
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
      s.sign = makeSign(s.label, { w: SIGN.w, h: SIGN.h, post: SIGN.post, sub: s.sub, ink: poor ? '#8a2018' : undefined }); s.sign.position.copy(at); this.root.add(s.sign);
    }
  }
  /** one station is spent: its mat dims, its ring goes; `others` = put the rest out too (the rest room's either-or) */
  spend(s: Station, others = false) {
    s.done = true; s.ring.visible = false; s.edge.visible = false; if (s.badge) s.badge.visible = false; fxRing(s.at.clone().setY(0.08), 0xffe0a0, 1.4, { life: 0.5 } as never); fxSparks(s.at.clone().setY(0.6), 0xffe0a0, 16, 4);
    if (others) for (const o of this.list) if (o !== s && !o.done) { o.done = true; o.ring.visible = false; o.g.visible = false; o.sign.visible = false; o.edge.visible = false; if (o.badge) o.badge.visible = false; }
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
      // the affordance: the edge breathes (brighter in reach, red when it can't be paid), the badge turns and rises in reach
      const near = Math.hypot(hero.x - s.at.x, hero.z - s.at.z) < NEAR; s.nearK += ((near ? 1 : 0) - s.nearK) * Math.min(1, dt * 8);
      const em = s.edge.material as THREE.MeshBasicMaterial; em.color.setHex(s.poor ? 0xff5a40 : 0xffd070);
      em.opacity = (0.28 + 0.14 * Math.sin(this.t * 3 + s.at.x)) * (1 - s.nearK) + (0.75 + 0.15 * Math.sin(this.t * 6)) * s.nearK;
      if (s.badge) { s.badge.idle(this.t, 0.06, 0.6); s.badge.rotation.y += dt * 0.8; s.badge.position.y = 1.9 + 0.25 * s.nearK; s.badge.setGlow(1 + 0.6 * s.nearK); s.badge.setDim(s.poor ? 0.5 : 0); }
    }
    // the fire: a few flame blocks rising and shrinking
    for (const f of this.fires) if (Math.random() < dt * 22) addBlock(f.position.clone().add(V3((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4)), { size: 0.14 + Math.random() * 0.1, v: V3(0, 1.2 + Math.random(), 0), col: Math.random() < 0.5 ? 0xffb040 : 0xff6a20, bright: 1.6, life: 0.5, shrink: 0.5, drag: 1, grav: 0 });
    return fired;
  }
  /** the station in reach (for the floating name and price), the nearest one */
  near(hero: THREE.Vector3): Station | null { let b: Station | null = null, bd = NEAR; for (const s of this.list) { if (s.done) continue; const d = Math.hypot(hero.x - s.at.x, hero.z - s.at.z); if (d < bd) { bd = d; b = s; } } return b; }
  dispose() { for (const s of this.list) s.badge?.dispose(); this.root.parent?.remove(this.root); this.list = []; this.fires = []; }
}
