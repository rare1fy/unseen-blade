// 剧情演出的时间线（act-20，用户：「剧情演出用timeline，镜头要好好设计……timeline只交代剧情和氛围」）：
// 一串镜头，每个镜头有起止机位（位置、看向、视角）和缓动，镜头之间直接切；镜头内可以在指定时刻触发事件（人物走位、动作、特效、
// 声音），每帧还能跑一段自己的逻辑；字幕卡只写地名、年份、人名（像素标题字，淡入淡出）。不在这里演对话（对话走 dialogue.ts）。
// 只用远景 / 全景 / 中景——体素人物拍太近不好看。长按屏幕约 0.8 秒跳过（右下角一圈填满），不放字。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { shot } from '../director';
import { V3 } from '../engine/world';
import { text, textW } from '../v2/overlay';
import { PIX_H } from '../v2/pix';

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

export class Timeline {
  on = false; private shots: CineShot[] = []; private i = 0; private t = 0; private fired = 0; private done: ((skipped: boolean) => void) | null = null;
  private cap: THREE.Mesh | null = null; private capT = 0; private capSpec: Caption | null = null;
  private hold = 0; private holding = false; private ring: THREE.Mesh;
  constructor(private L: UiLayer) {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 32, 1, Math.PI / 2, -0.001), new THREE.MeshBasicMaterial({ color: 0xf2e8d6, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }));
    this.ring.renderOrder = 70; this.ring.visible = false; L.scene.add(this.ring);
  }
  /** play shots; resolves true when skipped, false when played out */
  play(shots: CineShot[]): Promise<boolean> {
    this.shots = shots; this.i = -1; this.on = true; this.hold = 0; this.next();
    return new Promise(res => { this.done = res; });
  }
  /** pointer: a long press skips */
  pointer(type: string) { if (!this.on) return false; if (type === 'down') this.holding = true; else if (type === 'up') { this.holding = false; } return true; }
  key(down: boolean) { if (this.on) this.holding = down; }
  private next() {
    this.i++; this.t = 0; this.fired = 0;
    const s = this.shots[this.i]; if (!s) { this.finish(false); return; }
    const ease = EASE[s.ease ?? 'inOut'];
    shot('cine' + this.i, tt => {
      const k = ease(Math.min(1, tt / s.dur)), a = key(s.from), b = s.to ? key(s.to) : a;
      const lerp = (p: V, q: V) => V3(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k);
      return { base: lerp(a.pos, b.pos), look: lerp(a.look, b.look), fov: a.fov + (b.fov - a.fov) * k };
    }, { cut: true, speed: 40 });
    if (s.caption) this.showCaption(s.caption);
  }
  private finish(skipped: boolean) {
    this.on = false; this.ring.visible = false; this.clearCaption();
    const d = this.done; this.done = null; d?.(skipped);
  }
  private showCaption(c: Caption) { this.clearCaption(); this.capSpec = c; this.capT = -(c.at ?? 0.4); }
  private clearCaption() { if (this.cap) { this.L.scene.remove(this.cap); (this.cap.material as THREE.MeshBasicMaterial).map?.dispose(); (this.cap.material as THREE.Material).dispose(); this.cap.geometry.dispose(); this.cap = null; } this.capSpec = null; }
  private paintCaption(c: Caption) {
    const dpr = Math.max(1, Math.round(this.L.dpr || 1)), S = (c.big ? (this.L.h >= 600 ? 5 : 3) : (this.L.h >= 600 ? 3 : 2)) * dpr;
    const w = textW(c.text, S) + 8 * dpr, h = PIX_H * S + 8 * dpr, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false; text(g, c.text, 4 * dpr, 4 * dpr, S, '#f2ece2', 'left', '#0a0710');
    const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    m.renderOrder = 65; this.L.scene.add(m); this.cap = m; (m as unknown as { _wh: [number, number] })._wh = [w / dpr, h / dpr];
  }
  update(dt: number) {
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
        const x = c.big ? L.w / 2 : L.w - w / 2 - L.w * 0.05, y = c.big ? L.h * 0.38 : L.h - h / 2 - L.h * 0.08;
        L.at(x, y, 0, this.cap.position); this.cap.scale.set(L.px(w), L.px(h), 1);
        if (this.capT > hold + 1.2) this.clearCaption();
      }
    }
    // the long press to skip: a ring fills at the bottom right
    this.hold = this.holding ? this.hold + dt : Math.max(0, this.hold - dt * 3);
    this.ring.visible = this.hold > 0.08;
    if (this.ring.visible) {
      const L = this.L, k = Math.min(1, this.hold / 0.8); this.ring.geometry.dispose(); this.ring.geometry = new THREE.RingGeometry(0.62, 1, 32, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.01, k));
      L.at(L.w - 34, L.h - 34, 0, this.ring.position); this.ring.scale.setScalar(L.px(16));
    }
    if (this.hold >= 0.8) { this.holding = false; this.finish(true); return; }
    if (this.t >= s.dur) this.next();
  }
}
