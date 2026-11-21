// 获得提示（11-19 / act-127）：头像下方获得道具与货币浮层列表。
// 采用清晰大号像素/文楷字体（22–24 CSS px）+ 左侧像素图标徽章 + 向右渐隐的深色托底，兼顾主机克制感与一眼辨识度；
// 同类奖励（铜钱、生命等）合并累加，最多 4 条，约 3.2 秒淡出补位；刀谱、秘传带细金边与金色字样。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { canvasOf } from '../hud/paint';
import { bodyText, bodyW, BODY_FONT } from '../ui3d/bodyFont';

export type FeedKind = 'coins' | 'heal' | 'manual' | 'boon' | 'item';
interface Entry { kind: FeedKind; key: string; n: number; label: (n: number) => string; gold: boolean; t: number; y: number; in: number;
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; texKey: string; w: number; h: number }

const LIFE = 3.2, FADE = 0.5, MAX = 4;

/** Paint a crisp pixel-art emblem on the left side of the toast ribbon (coin / jade herb-cross / golden manual diamond). */
function drawIcon(g: CanvasRenderingContext2D, kind: FeedKind, cx: number, cy: number, sz: number) {
  const u = Math.max(1, Math.round(sz / 9));
  const x0 = Math.round(cx - u * 4.5), y0 = Math.round(cy - u * 4.5);
  const R = (rx: number, ry: number, rw: number, rh: number, col: string) => {
    g.fillStyle = col; g.fillRect(x0 + rx * u, y0 + ry * u, rw * u, rh * u);
  };
  if (kind === 'coins') {
    R(1, 0, 7, 9, '#1a1008'); R(0, 1, 9, 7, '#1a1008');
    R(2, 1, 5, 7, '#e2a246'); R(1, 2, 7, 5, '#e2a246');
    R(2, 1, 5, 1, '#fff0a8');
    R(3, 3, 3, 3, '#3c240c');
  } else if (kind === 'heal') {
    R(2, 0, 5, 9, '#0c2416'); R(0, 2, 9, 5, '#0c2416');
    R(3, 1, 3, 7, '#66e494'); R(1, 3, 7, 3, '#66e494');
    R(3, 1, 3, 2, '#c8ffdc');
  } else {
    const hi = kind === 'manual' ? '#fff4b8' : '#ffd87a';
    const mid = kind === 'manual' ? '#e8b648' : kind === 'boon' ? '#d89a3a' : '#c8d0e0';
    R(3, 0, 3, 9, '#140c0a'); R(0, 3, 9, 3, '#140c0a'); R(1, 1, 7, 7, '#140c0a');
    R(4, 1, 1, 7, mid); R(1, 4, 7, 1, mid); R(2, 2, 5, 5, mid);
    R(3, 2, 3, 2, hi); R(3, 4, 2, 1, hi);
  }
}

export class RewardFeed {
  private list: Entry[] = [];
  constructor(private L: UiLayer) {}
  /** a reward taken: `key` merges (the same key while it is still up adds `n` to it and starts its clock again) */
  push(kind: FeedKind, label: (n: number) => string, n = 0, key: string = kind) {
    const old = this.list.find(e => e.key === key && e.t < LIFE - FADE);
    if (old) { old.n += n; old.t = Math.min(old.t, 0.2); return; }
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.renderOrder = 50; mesh.visible = false; this.L.text.scene.add(mesh);
    this.list.push({ kind, key, n, label, gold: kind === 'manual' || kind === 'boon', t: 0, y: -1, in: 0, mesh, mat, texKey: '', w: 1, h: 1 });
    while (this.list.length > MAX) this.drop(this.list[0]);
  }
  clear() { for (const e of [...this.list]) this.drop(e); }
  private drop(e: Entry) { e.mesh.parent?.remove(e.mesh); e.mesh.geometry.dispose(); e.mat.map?.dispose(); e.mat.dispose(); this.list.splice(this.list.indexOf(e), 1); }
  private paint(e: Entry, fontPx: number, dpr: number, k: number) {
    const kk = Math.max(0.72, k);
    const text = e.label(e.n), key = `${text}|${fontPx}|${kk.toFixed(2)}|${e.gold}|${e.kind}|${BODY_FONT.version}`;
    if (key === e.texKey) return; e.texKey = key;
    const tw = Math.ceil(bodyW(text, fontPx));
    const iconSz = Math.round(fontPx * 0.88), barW = Math.max(2, Math.round(3 * kk * dpr));
    const padL = barW + Math.round(8 * kk * dpr), iconGap = Math.round(8 * kk * dpr), padR = Math.round(34 * kk * dpr);
    const padY = Math.round(7 * kk * dpr);
    const W = Math.max(8, padL + iconSz + iconGap + tw + padR);
    const textH = Math.ceil(fontPx * 1.22);
    const H = Math.max(10, textH + padY * 2);
    const { c, g } = canvasOf(W, H);
    // dark translucent ribbon fading cleanly to the right (console-grade readability without heavy box chrome)
    const grad = g.createLinearGradient(0, 0, W, 0);
    const solid = Math.min(0.88, (padL + iconSz + iconGap + tw + 10 * kk * dpr) / W);
    grad.addColorStop(0, 'rgba(10,8,14,0.80)');
    grad.addColorStop(solid, 'rgba(10,8,14,0.62)');
    grad.addColorStop(1, 'rgba(10,8,14,0)');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const accent = e.gold ? 'rgba(244,210,126,0.96)' : e.kind === 'coins' ? 'rgba(232,174,82,0.94)' : e.kind === 'heal' ? 'rgba(108,232,152,0.92)' : 'rgba(218,224,238,0.88)';
    g.fillStyle = accent; g.fillRect(0, 0, barW, H);
    if (e.gold) {
      const edgeH = Math.max(1, Math.round(1.5 * kk * dpr));
      const gg = g.createLinearGradient(0, 0, W, 0);
      gg.addColorStop(0, 'rgba(236,196,114,0.92)'); gg.addColorStop(solid, 'rgba(236,196,114,0.52)'); gg.addColorStop(1, 'rgba(236,196,114,0)');
      g.fillStyle = gg; g.fillRect(0, 0, W, edgeH); g.fillRect(0, H - edgeH, W, edgeH);
    }
    drawIcon(g, e.kind, padL + iconSz / 2, H / 2, iconSz);
    const txtCol = e.gold ? '#ffe6a4' : e.kind === 'coins' ? '#ffdfa0' : e.kind === 'heal' ? '#b8ffd0' : '#f4ecd8';
    bodyText(g, text, padL + iconSz + iconGap, Math.round((H - fontPx * 1.12) / 2), fontPx, txtCol, 'left', '#0b080c');
    e.mat.map?.dispose(); const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
    t.magFilter = t.minFilter = BODY_FONT.current === 'pixel' ? THREE.NearestFilter : THREE.LinearFilter;
    t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    e.mat.map = t; e.mat.needsUpdate = true; e.w = W / dpr; e.h = H / dpr;
  }
  /** every frame (real time): `at` the top-left of the column (under the portrait's purse), `k` the HUD's scale */
  update(dt: number, at: { x: number; y: number }, k: number, on: boolean) {
    const dpr = this.L.dpr || 1, fontPx = Math.round(Math.max(20, 23 * k) * dpr);
    for (const e of [...this.list]) if ((e.t += dt) >= LIFE) this.drop(e);
    let y = at.y;
    for (const e of this.list) {
      this.paint(e, fontPx, dpr, k);
      // slides to its place (the ones under move up when one above leaves); a new one rises in from below
      if (e.y < 0) e.y = y + e.h * 0.7; e.y += (y - e.y) * Math.min(1, dt * 14);
      e.in = Math.min(1, e.in + dt / 0.18);
      const a = Math.min(e.in, Math.min(1, (LIFE - e.t) / FADE)), r = (v: number) => Math.round(v * dpr) / dpr;
      e.mesh.scale.set(e.w, e.h, 1); e.mesh.position.set(r(at.x + (1 - e.in) * -8) + e.w / 2, -(r(e.y) + e.h / 2), 0);
      e.mat.opacity = a; e.mesh.visible = on && a > 0.01;
      y += e.h + Math.round(5 * k);
    }
  }
}
