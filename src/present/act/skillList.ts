// 暂停菜单「已得」「招式」两页的单子（11-18，用户：「选了强化后根本看不到自己选的强化是啥，在哪儿、如何释放，如何释放的教学不能是纯文字哈」
// 「游戏里也没有一个可以呼出暂停窗口的按钮」+ 主会话：「暂停菜单再加一页技能一览」）。
// 和暂停菜单同一套铁框漆面牌匾，一条一块，一块块从右边滑进来；每块 = 左边深色铁槽里的立体图标 + 名字和品阶 +
// 按法（右下角那几颗钮的小号，按顺序，中间画箭头）+ 一句会出什么（关键词带小图标）+ 数值小字。分组的小标题（身手 / 刀谱 / 秘传）用像素字。
// 选中的那块往前凸、按法那几颗钮一颗颗按下去（和卡面一样）。条目多时：十字键 / 摇杆 / 方向键 / 滚轮 / 手指拖上下翻，选中的那块总在视野里。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { mergeBoxes, IRON_D, IRON, LACQ, LACQ_L, BRONZE, BRONZE_D } from './title';
import { paintTitle } from './opening';
import { PIX_H } from '../v2/pix';
import { makeCanvas } from '../../platform/index';
import type { Model3D } from '../ui3d/models3d';
import type { MiniShield } from './btnBadge';
import { layoutPresses, paintSeps, pressShields, paintName, paintEffect, paintNum, type SkillEntry, type PressItem } from './skillFace';
import { language, t } from './i18n';
import { skillIcon3D } from './skillIcons';
export type { SkillEntry } from './skillFace';

export interface Section { title: string; list: SkillEntry[]; empty?: string }
/** the slab in px (w × h), front toward +z — the pause menu's own make */
function slab(w: number, h: number, slotX: number, slot: number) {
  const d = Math.max(8, h * 0.14), cap = Math.max(6, Math.round(h * 0.12)), b: Parameters<typeof mergeBoxes>[0] = [];
  b.push({ w, h, d, x: 0, y: 0, z: 0, c: IRON_D });
  b.push({ w: w - 4, h: Math.max(2, h * 0.05), d: d + 1, x: 0, y: h / 2 - Math.max(1, h * 0.03), z: 0.4, c: IRON });
  // Break the lacquer around the slot so the dark floor sits behind its four walls.
  const panelW = w - cap * 1.6, panelH = h - Math.max(5, h * 0.12), left = slotX - slot / 2, right = slotX + slot / 2;
  const lacquer = { d: d + 1.2, z: 0.6, c: LACQ }, band = (panelH - slot) / 2;
  b.push({ ...lacquer, w: left + panelW / 2, h: panelH, x: (left - panelW / 2) / 2, y: 0 });
  b.push({ ...lacquer, w: panelW / 2 - right, h: panelH, x: (right + panelW / 2) / 2, y: 0 });
  for (const s of [-1, 1]) b.push({ ...lacquer, w: slot, h: band, x: slotX, y: s * (slot + band) / 2 });
  b.push({ w: slot, h: slot, d: d + 0.5, x: slotX, y: 0, z: 0, c: 0x111217 });
  b.push({ w: w - cap * 1.6, h: Math.max(2, h * 0.045), d: d + 1.3, x: 0, y: h / 2 - Math.max(4, h * 0.1), z: 0.6, c: LACQ_L });
  for (const s of [-1, 1]) {
    b.push({ w: cap, h: h + 4, d: d + 2, x: s * (w / 2 + 0.5), y: 0, z: 0.4, c: BRONZE_D });
    b.push({ w: cap, h: 2, d: d + 2.2, x: s * (w / 2 + 0.5), y: (h + 4) / 2 - 1, z: 0.4, c: BRONZE });
  }
  return new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xff7a2a, emissiveIntensity: 0 }));
}
const tex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };

interface Item {
  e: SkillEntry | null; title: string; root: THREE.Group; body: THREE.Mesh | null; face: THREE.Mesh; picture: Model3D | null; presses: MiniShield[]; items: PressItem[];
  x: number; y: number; w: number; h: number; inK: number; selK: number; faceKey: string; t: number; delay: number;
}
export class SkillList {
  on = false; private items: Item[] = []; sel = 0; private seen = -1; private scroll = 0; private scrollT = 0; private t = 0; private openT = 0;
  private lay = { x: 0, top: 0, bottom: 0, w: 0, h: 0, gap: 0, headH: 0 };
  constructor(private L: UiLayer) {}
  open(sections: Section[]) {
    this.close(); this.on = true; this.t = 0; this.openT = 0; this.scroll = this.scrollT = 0; this.seen = -1;
    let n = 0;
    for (const s of sections) {
      this.items.push(this.make(null, s.title, n++));
      if (!s.list.length && s.empty) this.items.push(this.make(null, '\u0000' + s.empty, n++));
      for (const e of s.list) this.items.push(this.make(e, '', n++));
    }
    this.sel = Math.max(0, this.items.findIndex(i => !!i.e));
  }
  private make(e: SkillEntry | null, title: string, i: number): Item {
    const root = new THREE.Group(); root.userData.noTilt = true; root.renderOrder = 60; this.L.scene.add(root);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })); face.renderOrder = 62; root.add(face);
    return { e, title, root, body: null, face, picture: null, presses: [], items: [], x: 0, y: 0, w: 0, h: 0, inK: 0, selK: 0, faceKey: '', t: 0, delay: Math.min(0.4, i * 0.04) };
  }
  close() {
    for (const it of this.items) {
      it.root.parent?.remove(it.root); it.face.geometry.dispose(); const fm = it.face.material as THREE.MeshBasicMaterial; fm.map?.dispose(); fm.dispose();
      if (it.body) { it.body.geometry.dispose(); (it.body.material as THREE.Material).dispose(); }
      it.picture?.dispose(); for (const p of it.presses) p.dispose();
    }
    this.items = []; this.on = false;
  }
  /** the rows that can be selected */
  private picks() { return this.items.map((it, i) => (it.e ? i : -1)).filter(i => i >= 0); }
  move(d: number) { const p = this.picks(); if (!p.length) return; const k = p.indexOf(this.sel); this.sel = p[(Math.max(0, k) + d + p.length) % p.length]; }
  /** a drag / a wheel: scroll by px */
  scrollBy(px: number) { this.scrollT = Math.max(0, Math.min(this.maxScroll(), this.scrollT + px)); }
  private maxScroll() { const last = this.items[this.items.length - 1]; return last ? Math.max(0, last.y + last.h / 2 + this.scroll - this.lay.bottom) : 0; }
  hit(x: number, y: number) { return this.items.findIndex(it => !!it.e && it.inK > 0.6 && Math.abs(x - it.x) < it.w / 2 && Math.abs(y - it.y) < it.h / 2); }
  /** place the column: x = its centre, from top to bottom (px) */
  layout(x: number, top: number, bottom: number, w: number) {
    const h = Math.max(52, Math.min(96, w * 0.16, (bottom - top) / 3.4)), headH = Math.max(26, h * 0.42), gap = Math.max(6, h * 0.12);
    Object.assign(this.lay, { x, top, bottom, w, h, gap, headH });
    let y = top - this.scroll;
    for (const it of this.items) {
      const ih = it.e ? h : headH; it.w = w; it.h = ih; it.x = x; it.y = y + ih / 2; y += ih + gap;
      if (it.e && !it.body) {
        const s = h * 0.74, x = -w / 2 + h * 0.18 + s / 2;
        it.body = slab(w, h, x, s); it.body.renderOrder = 60; it.root.add(it.body);
        const p = it.picture = skillIcon3D(it.e.icon);
        p.scale.setScalar(s * 0.94); p.position.set(x, 0, this.zf() + p.size[2] * p.scale.x / 2);
        p.traverse(o => { o.renderOrder = 61; }); it.root.add(p);
        if (it.e.steps) { const ps = h * 0.3, lp = layoutPresses(it.e.steps, ps, it.e.lit); it.items = lp.items; it.presses = pressShields(lp.items, ps, it.root, this.textX(), 0, this.zf() + ps * 0.07, 63); }
      }
    }
  }
  /** the face's depth over the slab (its lacquer front is at about d / 2) */
  private zf() { return Math.max(8, this.lay.h * 0.14) / 2 + 2; }
  /** the text's left edge in the slab (px from its centre) */
  private textX() { const { w, h } = this.lay; return -w / 2 + h * 0.18 + h * 0.74 + h * 0.2; }
  update(dt: number, rel: number) {
    const L = this.L; this.t += dt; this.openT += dt;
    // keep the selected one in view (when the selection moves; a finger's scroll is left alone)
    const s = this.items[this.sel];
    if (s && this.sel !== this.seen) {
      this.seen = this.sel; const yy = s.y + this.scroll - this.scrollT;
      if (yy + s.h / 2 > this.lay.bottom) this.scrollT += yy + s.h / 2 - this.lay.bottom;
      if (yy - s.h / 2 < this.lay.top) this.scrollT -= this.lay.top - (yy - s.h / 2);
      this.scrollT = Math.max(0, this.scrollT);
    }
    this.scroll += (this.scrollT - this.scroll) * Math.min(1, dt * 14);
    for (const [i, it] of this.items.entries()) {
      it.inK = Math.min(1, Math.max(it.inK, (this.openT - it.delay) / 0.28)); it.selK += ((i === this.sel ? 1 : 0) - it.selK) * Math.min(1, dt * 12);
      const e = it.inK * it.inK * (3 - 2 * it.inK), off = (1 - e) * (it.w + 80);
      // past the list's top / bottom a slab fades out over most of its height (the next one peeks in: there is more to scroll to)
      const over = Math.max(0, it.y + it.h / 2 - this.lay.bottom, this.lay.top - (it.y - it.h / 2)), edge = Math.max(0, 1 - over / (it.h * 0.85));
      const a = e * rel * edge;
      it.root.visible = a > 0.01;
      // (the column's slabs come forward 3 units when selected; these are twice as wide — a third of that, or they grow off the screen)
      L.at(it.x + off, it.y, it.selK * 1, it.root.position); it.root.scale.setScalar(L.px(1));
      it.root.rotation.set(-0.04 + Math.sin(this.t * 0.8 + it.y * 0.02) * 0.01, -0.08 * (1 - 0.7 * it.selK), 0);
      if (it.body) { const bm = it.body.material as THREE.MeshLambertMaterial; bm.emissiveIntensity = it.selK * 0.05; bm.transparent = a < 0.999; bm.opacity = a; bm.depthWrite = a >= 0.999; }
      (it.face.material as THREE.MeshBasicMaterial).opacity = a;
      it.picture?.setOpacity(a); for (const p of it.presses) p.setOpacity(a);
      this.paint(it);
      if (it.picture) { it.picture.idle(this.t, 0.02, 0.16 + 0.1 * it.selK); it.picture.setDim(0.15 * (1 - it.selK)); }
      // the selected one presses its buttons through, one after another (as on the card)
      if (it.presses.length) {
        it.t = i === this.sel ? it.t + dt : 0;
        const beat = 0.32, cyc = it.presses.length * beat + 0.9, u = it.t > 0 ? it.t % cyc : -1;
        it.presses.forEach((p, j) => { const lo = u - j * beat, on = lo >= 0 && lo < beat * 0.85 ? Math.sin(Math.min(1, lo / (beat * 0.85)) * Math.PI) : 0; p.position.z = this.zf() + this.lay.h * 0.021 - 2.5 * on; p.icon.setGlow(1 + 1.1 * on); (p.mesh.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.35 * on; });
      }
    }
  }
  private paint(it: Item) {
    const dpr = this.L.dpr || 1, { h } = this.lay;
    if (!it.e) {
      // a section's title (or the line for an empty one): pixel type on nothing, at the column's left
      const empty = it.title.startsWith('\u0000'), txt = t(empty ? it.title.slice(1) : it.title), S = Math.max(1, Math.round(it.h * (empty ? 0.6 : 0.8) * dpr / PIX_H)), key = `${txt}|${S}|${dpr}`;
      if (key === it.faceKey) return; it.faceKey = key;
      const W = Math.round(it.w * dpr), H = Math.round(it.h * dpr), c = makeCanvas(W, H), g = c.getContext('2d') as CanvasRenderingContext2D; g.imageSmoothingEnabled = false;
      paintTitle(g, txt, empty ? Math.round(h * 0.2 * dpr) : 0, Math.round((H - PIX_H * S) / 2), S, 1, empty ? '#a89c8a' : '#e0c890', '#0a0708', Math.max(1, Math.round(S * 0.25)));
      const m = it.face.material as THREE.MeshBasicMaterial; m.map?.dispose(); m.map = tex(c as HTMLCanvasElement); m.needsUpdate = true; it.face.scale.set(it.w, it.h, 1); it.face.position.z = 1;
      return;
    }
    const tx = this.textX(), fw = it.w / 2 - tx - h * 0.12, fh = it.h * 0.9, key = `${Math.round(fw)}x${Math.round(fh)}@${dpr}`;
    if (key === it.faceKey) return; it.faceKey = key;
    const W = Math.max(8, Math.round(fw * dpr)), H = Math.max(8, Math.round(fh * dpr)), c = makeCanvas(W, H), g = c.getContext('2d') as CanvasRenderingContext2D; g.imageSmoothingEnabled = false;
    // three rows as on the card: the name and tier (numbers at the right), the presses (marks between them), the effect
    const e = it.e, S = Math.max(1, Math.round(H * 0.22 / PIX_H)), nameW = paintName(g, e, 0, Math.round(H * 0.05), S, dpr);
    const english = language === 'en';
    if (e.num && english) paintNum(g, e.num, 0, Math.round(H * 0.84), Math.round(H * 0.135), W - 4 * dpr);
    else if (e.num) paintNum(g, e.num, W - Math.round(2 * dpr), Math.round(H * 0.05 + (PIX_H * S - H * 0.13) / 2), Math.round(H * 0.13), W - nameW - 16 * dpr, 'right');
    paintSeps(g, it.items.map(x => ({ ...x, x: x.x * dpr, ...(x.kind === 'sep' ? { w: x.w * dpr } : {}) }) as PressItem), 0, Math.round(fh / 2 * dpr), h * 0.3 * dpr);
    paintEffect(g, e.effect, 0, Math.round(H * (english ? 0.68 : 0.76)), Math.round(H * (english ? 0.15 : 0.18)), W - 4 * dpr);
    const m = it.face.material as THREE.MeshBasicMaterial; m.map?.dispose(); m.map = tex(c as HTMLCanvasElement); m.needsUpdate = true;
    it.face.scale.set(fw, fh, 1); it.face.position.set(tx + fw / 2, 0, this.zf());
  }
}
