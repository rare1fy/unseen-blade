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

export interface Station { id: string; label: string; sub: string; price: number; at: THREE.Vector3; fill: number; done: boolean; once: boolean;
  g: THREE.Group; ring: THREE.Mesh; sign: THREE.Group; poor: boolean }

const box = (w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(c)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m; };
const MAT_R = 0.75, FILL_T = 1.0;

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
  private mat(at: THREE.Vector3) {
    const mat = box(1.3, 0.04, 1.0, 0x8a7448, at.x, 0, at.z); this.root.add(mat); this.root.add(box(1.1, 0.045, 0.8, 0x9a8250, at.x, 0, at.z));
    const ring = new THREE.Mesh(new THREE.RingGeometry(MAT_R - 0.08, MAT_R, 40, 1, 0, 0.001).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.position.set(at.x, 0.07, at.z); ring.renderOrder = 3; this.root.add(ring); return ring;
  }
  private add(id: string, label: string, sub: string, price: number, at: THREE.Vector3, prop: THREE.Group, once: boolean) {
    prop.position.set(at.x, 0, at.z - 1.15); this.root.add(prop);
    const sign = makeSign(label, { w: 1.2, h: 0.55, post: 1.0, sub }); sign.position.set(at.x + 0.95, 0, at.z - 1.0); this.root.add(sign);
    this.list.push({ id, label, sub, price, at, fill: 0, done: false, once, g: prop, ring: this.mat(at), sign, poor: false });
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
      s.sign = makeSign(s.label, { w: 1.2, h: 0.55, post: 1.0, sub: s.sub, ink: poor ? '#8a2018' : undefined }); s.sign.position.copy(at); this.root.add(s.sign);
    }
  }
  /** one station is spent: its mat dims, its ring goes; `others` = put the rest out too (the rest room's either-or) */
  spend(s: Station, others = false) {
    s.done = true; s.ring.visible = false; fxRing(s.at.clone().setY(0.08), 0xffe0a0, 1.4, { life: 0.5 } as never); fxSparks(s.at.clone().setY(0.6), 0xffe0a0, 16, 4);
    if (others) for (const o of this.list) if (o !== s && !o.done) { o.done = true; o.ring.visible = false; o.g.visible = false; o.sign.visible = false; }
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
    }
    // the fire: a few flame blocks rising and shrinking
    for (const f of this.fires) if (Math.random() < dt * 22) addBlock(f.position.clone().add(V3((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4)), { size: 0.14 + Math.random() * 0.1, v: V3(0, 1.2 + Math.random(), 0), col: Math.random() < 0.5 ? 0xffb040 : 0xff6a20, bright: 1.6, life: 0.5, shrink: 0.5, drag: 1, grav: 0 });
    return fired;
  }
  dispose() { this.root.parent?.remove(this.root); this.list = []; this.fires = []; }
}
