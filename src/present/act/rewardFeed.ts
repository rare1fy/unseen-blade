// 获得提示（11-19 用户：「获得道具和奖励也要有一个信息上浮的列表」「放在头像下面，每条别太重，一块带透明度的深色托底就行，参考主机游戏」）。
// 头像（铜钱牌）下面一列：每条一行像素字垫一块往右淡掉的半透明深色底；新的从下面浮上来接在最后，同类的并成一条（铜钱、回复加数），
// 最多 4 条，约 2.5 秒淡出、后面的往上补位；刀谱、秘传这类重要的带一道细金边、字偏金。在文字层里（清楚、在最上面）。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { canvasOf } from '../hud/paint';
import { drawPix, pixW, PIX_H } from '../v2/pix';

export type FeedKind = 'coins' | 'heal' | 'manual' | 'boon' | 'item';
interface Entry { kind: FeedKind; key: string; n: number; label: (n: number) => string; gold: boolean; t: number; y: number; in: number;
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; texKey: string; w: number; h: number }

const LIFE = 2.5, FADE = 0.45, MAX = 4;

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
  private paint(e: Entry, pk: number, dpr: number) {
    const text = e.label(e.n), key = `${text}|${pk}|${e.gold}`; if (key === e.texKey) return; e.texKey = key;
    const tw = pixW(text) * pk, padX = 7 * pk, padY = 3 * pk, W = tw + padX * 2 + 24 * pk, H = PIX_H * pk + padY * 2;
    const { c, g } = canvasOf(W, H);
    // the dark under it: solid behind the words, fading out to the right (no box end)
    const grad = g.createLinearGradient(0, 0, W, 0); const solid = (padX + tw) / W;
    grad.addColorStop(0, 'rgba(10,8,12,0.62)'); grad.addColorStop(Math.min(0.95, solid), 'rgba(10,8,12,0.5)'); grad.addColorStop(1, 'rgba(10,8,12,0)');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    if (e.gold) {
      // a thin gold edge, top and bottom, fading out with the dark; a short bar at the left
      const gg = g.createLinearGradient(0, 0, W, 0); gg.addColorStop(0, 'rgba(232,192,112,0.9)'); gg.addColorStop(Math.min(0.95, solid), 'rgba(232,192,112,0.55)'); gg.addColorStop(1, 'rgba(232,192,112,0)');
      g.fillStyle = gg; g.fillRect(0, 0, W, pk); g.fillRect(0, H - pk, W, pk);
      g.fillStyle = 'rgba(240,206,128,0.95)'; g.fillRect(0, pk, 2 * pk, H - 2 * pk);
    }
    drawPix(g, text, padX, padY, { scale: pk, color: e.gold ? '#ffe2a0' : '#efe6d4', outline: '#0c0a0c' });
    e.mat.map?.dispose(); const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    e.mat.map = t; e.mat.needsUpdate = true; e.w = W / dpr; e.h = H / dpr;
  }
  /** every frame (real time): `at` the top-left of the column (under the portrait's purse), `k` the HUD's scale */
  update(dt: number, at: { x: number; y: number }, k: number, on: boolean) {
    const dpr = this.L.dpr || 1, pk = Math.max(1, Math.round(15 * k * dpr / PIX_H));
    for (const e of [...this.list]) if ((e.t += dt) >= LIFE) this.drop(e);
    let y = at.y;
    for (const e of this.list) {
      this.paint(e, pk, dpr);
      // slides to its place (the ones under move up when one above leaves); a new one rises in from below
      if (e.y < 0) e.y = y + e.h * 0.8; e.y += (y - e.y) * Math.min(1, dt * 14);
      e.in = Math.min(1, e.in + dt / 0.18);
      const a = Math.min(e.in, Math.min(1, (LIFE - e.t) / FADE)), r = (v: number) => Math.round(v * dpr) / dpr;
      e.mesh.scale.set(e.w, e.h, 1); e.mesh.position.set(r(at.x + (1 - e.in) * -6) + e.w / 2, -(r(e.y) + e.h / 2), 0);
      e.mat.opacity = a; e.mesh.visible = on && a > 0.01;
      y += e.h + 2;
    }
  }
}
