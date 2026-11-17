// 小铁盾（11-18）：右下角技能钮那面铁盾的缩小版，一整块合并网格（黑铁底盘、外圈八片甲片和铜钉、钮心凹槽），钮心上浮一个立体图标。
// 用在：三选一卡面左边那颗钮和「按法」那一排小钮、暂停菜单「已得」「招式」两页、右上角的暂停钮。
// 用户：「强化卡片也难以辨认都是干嘛的」→ 卡面 = 键位 + 招式图标 + 按法；按钮模型和右下角的同一套，玩家一眼认得是哪颗钮。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { customIcon3D, type Model3D } from '../ui3d/models3d';
import { Mask, pillow } from '../ui3d/models3dArt';
import { btnIcon3D } from './icons3d';
import type { UiLayer } from '../ui3d/layer';
import type { BtnName } from './input';

const IRON = 0x4a4f5a, IRON_D = 0x1e2026, IRON_L = 0x6c7380, RIM = 0x30333b, SOCK = 0x24272e, BRONZE = 0xb07a3a;
const octCyl = (r: number, d: number) => new THREE.CylinderGeometry(r, r, d, 8, 1, false, (5 * Math.PI) / 8).rotateX(Math.PI / 2);
interface Part { g: THREE.BufferGeometry; c: number }
/** parts merged into one geometry, a colour per part; each part's vertex range (to recolour the plates) */
function merge(parts: Part[]) {
  const col = new THREE.Color(), ranges: Array<[number, number]> = []; let at = 0;
  for (const p of parts) {
    const n = p.g.attributes.position.count, cs = new Float32Array(n * 3); col.setHex(p.c);
    for (let i = 0; i < n; i++) cs.set([col.r, col.g, col.b], i * 3);
    p.g.setAttribute('color', new THREE.BufferAttribute(cs, 3)); ranges.push([at, n]); at += n;
  }
  const geo = mergeGeometries(parts.map(p => p.g))!; for (const p of parts) p.g.dispose();
  return { geo, ranges };
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); return g.translate(x, y, z); };

/** the shield body (diameter 1, front toward +z) and the picture floating over its socket */
export class MiniShield extends THREE.Group {
  readonly mesh: THREE.Mesh; private ranges: Array<[number, number]>; private plateAt: number[] = []; private lipAt: number[] = [];
  private tint = new THREE.Color(); private cur = ''; readonly icon: Model3D;
  constructor(icon: Model3D, o: { tassel?: boolean } = {}) {
    super();
    const parts: Part[] = [{ g: octCyl(0.5, 0.12), c: IRON_D }, { g: octCyl(0.47, 0.14).translate(0, 0, 0.01), c: RIM }, { g: octCyl(0.3, 0.02).translate(0, 0, 0.08), c: SOCK }];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 2 - (i / 8) * Math.PI * 2, rz = a - Math.PI / 2, cx = Math.cos(a) * 0.39, cy = Math.sin(a) * 0.39;
      this.plateAt.push(parts.length); parts.push({ g: box(0.27, 0.13, 0.07, cx, cy, 0.09, rz), c: IRON });
      this.lipAt.push(parts.length); parts.push({ g: box(0.27, 0.03, 0.075, cx + Math.cos(a) * 0.05, cy + Math.sin(a) * 0.05, 0.092, rz), c: IRON_L });
      const ab = Math.PI / 2 - ((i + 0.5) / 8) * Math.PI * 2;
      parts.push({ g: box(0.06, 0.06, 0.06, Math.cos(ab) * 0.39, Math.sin(ab) * 0.39, 0.1), c: BRONZE });
    }
    // the cut button's red tassel (the one thing that tells it from the others at a glance)
    if (o.tassel) parts.push({ g: box(0.08, 0.08, 0.08, 0, -0.5, 0.04), c: BRONZE }, { g: box(0.045, 0.3, 0.03, -0.03, -0.68, 0.04), c: 0xb8302a }, { g: box(0.045, 0.3, 0.03, 0.03, -0.68, 0.04), c: 0xa02820 });
    const m = merge(parts); this.ranges = m.ranges;
    this.mesh = new THREE.Mesh(m.geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffb060, emissiveIntensity: 0 })); this.add(this.mesh);
    this.icon = icon; icon.scale.setScalar(0.58); icon.position.z = 0.2; this.add(icon);
  }
  /** the plates in a colour (k 0 = plain iron … 1 = the colour), e.g. a link's colour, the ember of 藏锋, the white of 「现在松手」 */
  setRim(col: number | null, k = 0.8) {
    const key = `${col}|${k.toFixed(2)}`; if (key === this.cur) return; this.cur = key;
    const a = this.mesh.geometry.attributes.color as THREE.BufferAttribute, put = (r: [number, number], c: THREE.Color) => { for (let i = r[0]; i < r[0] + r[1]; i++) a.setXYZ(i, c.r, c.g, c.b); };
    for (const i of this.plateAt) { this.tint.setHex(IRON); if (col != null) this.tint.lerp(new THREE.Color(col), k); put(this.ranges[i], this.tint); }
    for (const i of this.lipAt) { this.tint.setHex(IRON_L); if (col != null) this.tint.lerp(new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.3), k * 0.85); put(this.ranges[i], this.tint); }
    a.needsUpdate = true;
  }
  /** the whole thing fades (the card's flight, a page sliding in): materials go transparent below 1 */
  setOpacity(o: number) {
    const mm = this.mesh.material as THREE.MeshLambertMaterial; mm.transparent = o < 0.999; mm.opacity = o; mm.depthWrite = o >= 0.999;
    for (const l of this.icon.lit) { l.m.transparent = o < 0.999; l.m.opacity = o; }
    for (const g of this.icon.glows) { g.m.transparent = o < 0.999; g.m.opacity = o; }
  }
  setRenderOrder(n: number) { this.mesh.renderOrder = n; this.icon.traverse(x => { x.renderOrder = n + 1; }); }
  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.icon.dispose(); this.parent?.remove(this); }
}
/** a button of the HUD in small: its shield (the cut button with its tassel) and its own picture */
export function btnShield(n: BtnName) { return new MiniShield(btnIcon3D(n), { tassel: n === 'attack' }); }

// ---------------------------------------------------------------- the pause button (11-18 用户：「游戏里也没有一个可以呼出暂停窗口的按钮」)
/** two upright bronze bars, pillowed (no letters on a button) */
const pauseIcon = () => customIcon3D('ub:pause', set => {
  const m = new Mask().rect(-6, -8, -2, 8).rect(2, -8, 6, 8);
  pillow(set, m, -1, 1, 0x6a4214, 0xb07a2e, 0, 0xe0aa48, 0);
});
/** the small iron button at the top right that opens the pause menu: it sinks when pressed, a touch of warmth when the pointer is on it */
export class PauseBtn {
  readonly shield = new MiniShield(pauseIcon()); x = 0; y = 0; size = 44; down = false; on = true; private press = 0; private t = 0;
  constructor(private L: UiLayer) { this.shield.userData.noTilt = true; L.scene.add(this.shield); }
  hit(x: number, y: number) { return this.on && Math.abs(x - this.x) < this.size * 0.62 && Math.abs(y - this.y) < this.size * 0.62; }
  update(dt: number) {
    const L = this.L; this.t += dt; this.press += ((this.down ? 1 : 0) - this.press) * Math.min(1, dt * 30);
    this.shield.visible = this.on;
    L.at(this.x, this.y, -this.press * 3, this.shield.position); this.shield.scale.setScalar(L.px(this.size) * (1 - 0.1 * this.press));
    // turned a little toward the screen's centre (it sits in the corner) and swaying with the rest of the HUD
    this.shield.rotation.set(0.28 + Math.sin(this.t * 0.9) * 0.03, -0.32 + Math.sin(this.t * 0.7) * 0.03, 0);
    this.shield.icon.idle(this.t, 0.015, 0.12);
    (this.shield.mesh.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.12 * this.press;
  }
  dispose() { this.shield.dispose(); }
}
