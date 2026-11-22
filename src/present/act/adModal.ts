// act-139: 纯 UiLayer 像素硬边激励观影模拟弹板（网页试玩 / 开发验收专用，不直接碰 DOM，兼容微信模拟器）
// 正式上微信小游戏 / CrazyGames 且配置真实广告位后自动走原生激励视频 SDK，本弹板作为回退演示层。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { onRealUpdate } from '../engine/world';
import { makeCanvas } from '../../platform/index';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { bodyText, bodyW } from '../ui3d/bodyFont';
import { drawPixelPlaque } from './uiPlate';
import { SKIN } from './skin';
import { language, msg, t as localize } from './i18n';
import { cue } from '../../audio/cues';
import type { AdRequestInfo } from '../../platform/ads';

const SIM_DUR = 3.0; // seconds for simulated rewarded ad watch

export class AdSimModal {
  on = false;
  private mesh: THREE.Mesh;
  private tex: THREE.CanvasTexture | null = null;
  private info: AdRequestInfo | null = null;
  private resolve: ((ok: boolean) => void) | null = null;
  private elapsed = 0;
  private lastKey = '';
  private cancelRect = { x: 0, y: 0, w: 0, h: 0 };
  private skipRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private L: UiLayer) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.mesh.renderOrder = 95;
    this.mesh.visible = false;
    L.text.scene.add(this.mesh);
    onRealUpdate(rdt => this.update(rdt));
  }

  open(info: AdRequestInfo): Promise<boolean> {
    if (this.resolve) { this.resolve(false); this.resolve = null; }
    this.info = info;
    this.elapsed = 0;
    this.on = true;
    this.lastKey = '';
    this.mesh.visible = true;
    return new Promise<boolean>(res => {
      this.resolve = res;
      this.repaint();
    });
  }

  private finish(ok: boolean) {
    if (!this.on) return;
    this.on = false;
    this.mesh.visible = false;
    const r = this.resolve;
    this.resolve = null;
    this.info = null;
    if (ok) cue('coin', 0.7); else cue('deselect', 0.45);
    r?.(ok);
  }

  pointer(type: string, x: number, y: number): boolean {
    if (!this.on) return false;
    if (type !== 'down') return true;
    const hit = (r: { x: number; y: number; w: number; h: number }) =>
      r.w > 0 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (hit(this.cancelRect)) { this.finish(false); return true; }
    if (__DEBUG_UI__ && hit(this.skipRect)) { this.finish(true); return true; }
    return true;
  }

  key(e: KeyboardEvent): boolean {
    if (!this.on) return false;
    if (e.key === 'Escape') { e.preventDefault(); this.finish(false); return true; }
    if (__DEBUG_UI__ && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.finish(true); return true; }
    return true;
  }

  private update(rdt: number) {
    if (!this.on) return;
    this.elapsed += Math.min(0.1, Math.max(0, rdt));
    if (this.elapsed >= SIM_DUR) {
      this.finish(true);
      return;
    }
    this.repaint();
  }

  private repaint() {
    const info = this.info;
    if (!info) return;
    const L = this.L, dpr = L.dpr || 1;
    const kk = Math.max(0.8, Math.min(1.25, L.h / 720));
    const W = Math.min(Math.round(L.w * 0.86), Math.round(520 * kk));
    const H = Math.round(238 * kk);
    const left = Math.max(1, Math.ceil(SIM_DUR - this.elapsed));
    const progStep = Math.floor((this.elapsed / SIM_DUR) * 40);
    const key = `${SKIN.id}|${W}x${H}|${dpr}|${left}|${progStep}|${info.title}|${info.rewardText}|${language}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const cw = Math.max(1, Math.round(W * dpr)), ch = Math.max(1, Math.round(H * dpr));
    const c = makeCanvas(cw, ch) as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;

    const u = Math.max(2, Math.round(2 * dpr));
    drawPixelPlaque(g, 0, 0, cw, ch, u, { inner: '#d4a048', rivets: true, accent: '#ffe088' });

    const titleTxt = localize(info.title);
    const rewardTxt = localize(info.rewardText);
    const countTxt = msg`正在观影添油 · 尚余 ${left} 秒`;

    const ts = Math.max(1, Math.round((20 * kk * dpr) / PIX_H));
    const tw = pixW(titleTxt) * ts;
    drawPix(g, titleTxt, Math.round((cw - tw) / 2), Math.round(26 * kk * dpr), { scale: ts, color: '#ffe28a', outline: '#0a0708' });

    const bPx = Math.round(16 * kk * dpr);
    bodyText(g, rewardTxt, cw / 2, Math.round(70 * kk * dpr), bPx, '#f4ead6', 'center');

    // Stepped pixel progress trough
    const bx = Math.round(44 * kk * dpr), by = Math.round(114 * kk * dpr);
    const bw = cw - bx * 2, bh = Math.round(22 * kk * dpr);
    g.fillStyle = '#0c090e'; g.fillRect(bx - u, by - u, bw + 2 * u, bh + 2 * u);
    g.fillStyle = '#241c24'; g.fillRect(bx, by, bw, bh);
    const frac = Math.min(1, this.elapsed / SIM_DUR);
    const fw = Math.max(u, Math.round(bw * frac));
    g.fillStyle = '#d89a38'; g.fillRect(bx, by, fw, bh);
    g.fillStyle = '#ffe698'; g.fillRect(bx, by, fw, Math.max(u, Math.round(bh * 0.3)));

    const subPx = Math.round(14 * kk * dpr);
    bodyText(g, countTxt, cw / 2, Math.round(146 * kk * dpr), subPx, '#d8ccb4', 'center');

    // Bottom buttons: Cancel (and instant Skip in dev build)
    const btnH = Math.round(36 * kk * dpr);
    const btnY = ch - btnH - Math.round(22 * kk * dpr);
    const cx0 = L.w / 2 - W / 2, cy0 = L.h / 2 - H / 2;

    const cancelLbl = localize('放弃观影');
    const cBtnW = Math.max(Math.round(126 * kk * dpr), Math.round(bodyW(cancelLbl, subPx) + 36 * kk * dpr));
    if (__DEBUG_UI__) {
      const skipLbl = localize('测试跳过');
      const sBtnW = Math.max(Math.round(126 * kk * dpr), Math.round(bodyW(skipLbl, subPx) + 36 * kk * dpr));
      const gap = Math.round(24 * kk * dpr);
      const tot = cBtnW + gap + sBtnW;
      const x1 = Math.round((cw - tot) / 2), x2 = x1 + cBtnW + gap;
      drawPixelPlaque(g, x1, btnY, cBtnW, btnH, Math.max(1, Math.round(1.5 * dpr)), { bg: '#20181d', inner: '#7a645a' });
      bodyText(g, cancelLbl, x1 + cBtnW / 2, btnY + Math.round((btnH - subPx) / 2) - u, subPx, '#c8bcb0', 'center');
      drawPixelPlaque(g, x2, btnY, sBtnW, btnH, Math.max(1, Math.round(1.5 * dpr)), { bg: '#261e12', inner: '#d8a648' });
      bodyText(g, skipLbl, x2 + sBtnW / 2, btnY + Math.round((btnH - subPx) / 2) - u, subPx, '#ffe698', 'center');
      this.cancelRect = { x: cx0 + x1 / dpr, y: cy0 + btnY / dpr, w: cBtnW / dpr, h: btnH / dpr };
      this.skipRect = { x: cx0 + x2 / dpr, y: cy0 + btnY / dpr, w: sBtnW / dpr, h: btnH / dpr };
    } else {
      const x1 = Math.round((cw - cBtnW) / 2);
      drawPixelPlaque(g, x1, btnY, cBtnW, btnH, Math.max(1, Math.round(1.5 * dpr)), { bg: '#20181d', inner: '#7a645a' });
      bodyText(g, cancelLbl, x1 + cBtnW / 2, btnY + Math.round((btnH - subPx) / 2) - u, subPx, '#c8bcb0', 'center');
      this.cancelRect = { x: cx0 + x1 / dpr, y: cy0 + btnY / dpr, w: cBtnW / dpr, h: btnH / dpr };
      this.skipRect = { x: 0, y: 0, w: 0, h: 0 };
    }

    this.tex?.dispose();
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.map = this.tex;
    mat.needsUpdate = true;
    this.mesh.scale.set(W, H, 1);
    this.mesh.position.set(L.w / 2, -L.h / 2, 2);
  }
}
