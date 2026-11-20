// 剧情演出的时间线（act-20，用户：「剧情演出用timeline，镜头要好好设计……timeline只交代剧情和氛围」）：
// 一串镜头，每个镜头有起止机位（位置、看向、视角）和缓动，镜头之间直接切；镜头内可以在指定时刻触发事件（人物走位、动作、特效、
// 声音），每帧还能跑一段自己的逻辑；字幕卡只写地名、年份、人名（像素标题字，淡入淡出）。不在这里演对话（对话走 dialogue.ts）。
// 只用远景 / 全景 / 中景——体素人物拍太近不好看。长按屏幕约 0.8 秒跳过（右下角像素方环填满），不放字。
// act-114：修复 Esc 缺少 keyup 与 holding 残留导致连跳；增加 onEnd 兜底确保跳过时状态完整落位；跳过环改为像素方环（零每帧重建几何）。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { shot } from '../director';
import { V3 } from '../engine/world';
import { text, textW } from '../v2/overlay';
import { PIX_H } from '../v2/pix';
import { makeCanvas } from '../../platform/index';

export type V = [number, number, number];
export interface CamKey { pos: V; look: V; fov: number }
export interface Caption { text: string; at?: number; hold?: number; big?: boolean }
export interface CineShot {
  /** seconds */ dur: number;
  from: CamKey | (() => CamKey); to?: CamKey | (() => CamKey);
  ease?: 'inOut' | 'out' | 'in' | 'linear';
  /** a title card: a place, a year, a name (centre when big, else bottom right) */ caption?: Caption;
  /** events at times into the shot */ at?: Array<[number, () => void]>;
  /** every frame of the shot: t = seconds into it, dt = real seconds */ tick?: (t: number, dt: number) => void;
}
const EASE = { inOut: (k: number) => k * k * (3 - 2 * k), out: (k: number) => 1 - (1 - k) ** 3, in: (k: number) => k * k * k, linear: (k: number) => k };
const key = (c: CamKey | (() => CamKey)) => typeof c === 'function' ? c() : c;

/** act-114: 16-step pixel-art square perimeter progress ring (replaces smooth 32-seg RingGeometry + per-frame dispose) */
const RING_CELLS: Array<[number, number]> = [
  // clockwise around a 16x16 pixel grid (2px thick border, 16 discrete segments)
  [8, 1], [11, 1], [13, 2], [14, 5], [14, 8], [14, 11], [13, 13], [10, 14],
  [7, 14], [4, 14], [2, 13], [1, 10], [1, 7], [1, 4], [2, 2], [5, 1],
];
export function paintPixelSkipRing(c: HTMLCanvasElement, steps: number) {
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  // dark pixel backing frame (stepped corners, no smooth circle)
  g.fillStyle = '#14121c';
  g.fillRect(2, 0, 12, 16); g.fillRect(0, 2, 16, 12);
  g.clearRect(4, 4, 8, 8);
  // unlit track
  g.fillStyle = '#3c3640';
  g.fillRect(3, 1, 10, 2); g.fillRect(3, 13, 10, 2);
  g.fillRect(1, 3, 2, 10); g.fillRect(13, 3, 2, 10);
  // lit progress pixels (antique gold → cream)
  for (let i = 0; i < steps && i < RING_CELLS.length; i++) {
    const [x, y] = RING_CELLS[i];
    g.fillStyle = i === steps - 1 ? '#fff4d8' : '#e6c37a';
    g.fillRect(x, y, 2, 2);
  }
}

export class Timeline {
  on = false; private shots: CineShot[] = []; private i = 0; private t = 0; private fired = 0;
  private done: ((skipped: boolean) => void) | null = null;
  private onEnd: ((skipped: boolean) => void) | null = null;
  private cap: THREE.Mesh | null = null; private capT = 0; private capSpec: Caption | null = null;
  private hold = 0; private holding = false;
  private ring: THREE.Mesh; private ringCanvas: HTMLCanvasElement; private ringTex: THREE.CanvasTexture; private ringStep = -1;
  /** act-36 (用户：「播timeline的时候给个上下电影那种黑边」): two black bars slide in (0.4 s) while a cutscene plays, out after */
  private bars: THREE.Mesh[] = []; private barK = 0;
  constructor(private L: UiLayer) {
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false }));
      m.renderOrder = 60; m.visible = false; L.scene.add(m); this.bars.push(m);
    }
    this.ringCanvas = makeCanvas(16, 16) as HTMLCanvasElement;
    this.ringCanvas.width = 16; this.ringCanvas.height = 16;
    this.ringTex = new THREE.CanvasTexture(this.ringCanvas);
    this.ringTex.magFilter = this.ringTex.minFilter = THREE.NearestFilter;
    this.ringTex.generateMipmaps = false; this.ringTex.colorSpace = THREE.SRGBColorSpace;
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.ringTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.ring.renderOrder = 70; this.ring.visible = false; L.scene.add(this.ring);
  }
  /** play shots; resolves true when skipped, false when played out. onEnd always fires before resolve so skipped cutscenes land cleanly. */
  play(shots: CineShot[], onEnd?: (skipped: boolean) => void): Promise<boolean> {
    this.shots = shots; this.i = -1; this.on = true; this.hold = 0; this.holding = false; this.ringStep = -1;
    this.onEnd = onEnd ?? null;
    this.next();
    return new Promise(res => { this.done = res; });
  }
  /** pointer: a long press skips */
  pointer(type: string) {
    if (!this.on) return false;
    if (type === 'down') this.holding = true;
    else if (type === 'up' || type === 'cancel') this.holding = false;
    return true;
  }
  key(down: boolean) { if (this.on || !down) this.holding = down; }
  private next() {
    this.i++; this.t = 0; this.fired = 0;
    const s = this.shots[this.i]; if (!s) { this.finish(false); return; }
    const ease = EASE[s.ease ?? 'inOut'];
    shot('cine' + this.i, tt => {
      const k = ease(Math.min(1, tt / Math.max(0.01, s.dur))), a = key(s.from), b = s.to ? key(s.to) : a;
      const lerp = (p: V, q: V) => V3(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k);
      return { base: lerp(a.pos, b.pos), look: lerp(a.look, b.look), fov: a.fov + (b.fov - a.fov) * k };
    }, { cut: true, speed: 40 });
    if (s.caption) this.showCaption(s.caption);
  }
  private finish(skipped: boolean) {
    this.on = false; this.holding = false; this.hold = 0; this.ring.visible = false; this.clearCaption();
    const end = this.onEnd; this.onEnd = null;
    try { end?.(skipped); } catch (e) { console.warn('[timeline] onEnd failed', e); }
    const d = this.done; this.done = null; d?.(skipped);
  }
  private showCaption(c: Caption) { this.clearCaption(); this.capSpec = c; this.capT = -(c.at ?? 0.4); }
  private clearCaption() {
    if (this.cap) {
      this.L.scene.remove(this.cap);
      (this.cap.material as THREE.MeshBasicMaterial).map?.dispose();
      (this.cap.material as THREE.Material).dispose();
      this.cap.geometry.dispose(); this.cap = null;
    }
    this.capSpec = null;
  }
  private paintCaption(c: Caption) {
    // (act-37: a long line steps the scale down until it fits 88% of the width)
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    let S = (c.big ? (this.L.h >= 600 ? 5 : 3) : (this.L.h >= 600 ? 3 : 2)) * dpr;
    while (S > dpr && textW(c.text, S) > this.L.w * dpr * 0.88) S -= dpr;
    const w = textW(c.text, S) + 8 * dpr, h = PIX_H * S + 8 * dpr;
    const cv = makeCanvas(w, h) as HTMLCanvasElement; cv.width = w; cv.height = h;
    const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false;
    text(g, c.text, 4 * dpr, 4 * dpr, S, '#f2ece2', 'left', '#0a0710');
    const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, opacity: 0, toneMapped: false }));
    m.renderOrder = 65; this.L.scene.add(m); this.cap = m;
    (m as unknown as { _wh: [number, number] })._wh = [w / dpr, h / dpr];
  }
  /** the bars' height (CSS px, each) — the bottom one carries the small captions */
  private get barH() { return Math.round(this.L.h * 0.11); }
  private updateBars(dt: number) {
    const want = this.on ? 1 : 0; this.barK += (want - this.barK) * Math.min(1, dt / 0.12);
    if (Math.abs(want - this.barK) < 0.002) this.barK = want;
    const L = this.L, bh = this.barH, e = this.barK * this.barK * (3 - 2 * this.barK), w = L.w + 40;
    this.bars.forEach((m, i) => {
      m.visible = this.barK > 0.002;
      const y = i === 0 ? e * bh - bh / 2 : L.h - e * bh + bh / 2;
      L.at(L.w / 2, y, 0, m.position); m.scale.set(L.px(w), L.px(bh + 2), 1);
    });
  }
  update(dt: number) {
    this.updateBars(dt);
    if (!this.on) return;
    const s = this.shots[this.i]; if (!s) return;
    this.t += dt;
    if (s.at) while (this.fired < s.at.length && this.t >= s.at[this.fired][0]) { s.at[this.fired][1](); this.fired++; }
    s.tick?.(this.t, dt);
    // the caption: fades in, holds, fades out
    if (this.capSpec) {
      this.capT += dt; const c = this.capSpec, hold = c.hold ?? 2.4;
      if (this.capT >= 0 && !this.cap) this.paintCaption(c);
      if (this.cap) {
        const a = Math.min(1, this.capT / 0.5) * Math.max(0, Math.min(1, (hold + 0.5 - this.capT) / 0.6));
        (this.cap.material as THREE.MeshBasicMaterial).opacity = a;
        const [w, h] = (this.cap as unknown as { _wh: [number, number] })._wh, L = this.L;
        const x = c.big ? L.w / 2 : L.w - w / 2 - L.w * 0.05, y = c.big ? L.h * 0.38 : L.h - this.barH / 2;
        L.at(x, y, 0, this.cap.position); this.cap.scale.set(L.px(w), L.px(h), 1);
        if (this.capT > hold + 1.2) this.clearCaption();
      }
    }
    // the long press to skip: a pixel square ring fills at the bottom right
    this.hold = this.holding ? this.hold + dt : Math.max(0, this.hold - dt * 3);
    this.ring.visible = this.hold > 0.08;
    if (this.ring.visible) {
      const L = this.L, step = Math.max(1, Math.min(16, Math.ceil((this.hold / 0.8) * 16)));
      if (step !== this.ringStep) { this.ringStep = step; paintPixelSkipRing(this.ringCanvas, step); this.ringTex.needsUpdate = true; }
      L.at(L.w - 34, L.h - 34, 0, this.ring.position); this.ring.scale.setScalar(L.px(32));
    }
    if (this.hold >= 0.8) { this.finish(true); return; }
    if (this.t >= s.dur) this.next();
  }
}
