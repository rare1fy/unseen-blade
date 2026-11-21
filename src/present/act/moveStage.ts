// act-151: 统一「招式谱」右侧实时像素演武示意窗（MoveStage）
// 严格遵循像素/体素硬边风（零平滑渐变、零模糊），以 30fps 驱动离屏像素画布贴于 3D 铁框展龛：
//   · 上半：实时循环演示当前选中招式 / 4柄名刀独门技 / 12本刀谱 / 秘传特效 / 悟性与信物，底部按键提示与动作帧精准同步亮灭；
//   · 下半：哈迪斯 2 式图标化图文详析（含该按键槽当前挂载的本局秘传一览；刀谱保留一键触发 3D 实景残影演武）。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { makeCanvas } from '../../platform/index';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { BODY_FONT } from '../ui3d/bodyFont';
import { drawPixelPlaque, drawMiniIcon, richLine } from './uiPlate';
import { PAD, actKey, BIND, paintGlyph, glyphArt, GLYPH_H, paintKeyCap, keyCapWidth, KEYCAP_H } from './pad';
import { language, t as localize } from './i18n';
import { uiScale } from './uiScale';
import type { SkillEntry } from './skillFace';
import type { BtnName } from './input';
import type { WeaponId } from './weapons';

const WEAPON_BLADE_COL: Record<WeaponId, { main: string; hi: string; fx: string }> = {
  hanshan: { main: '#cfdbe8', hi: '#ffffff', fx: '#ffe498' },
  thunder: { main: '#4c5266', hi: '#ffe066', fx: '#ffd048' },
  frost:   { main: '#7ce4ff', hi: '#f0feff', fx: '#74e8ff' },
  blunt:   { main: '#585260', hi: '#ff9668', fx: '#ff7848' },
};

const ACTION_BTN_KEY: Record<BtnName, string> = {
  attack: 'attack', dash: 'dash', jump: 'jump', special: 'special', ult: 'attack',
};

interface BeatState {
  phase: string;
  activeBtns: BtnName[];
  holdBtn?: BtnName;
  holdFill?: number;
}

export class MoveStage {
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private tex: THREE.CanvasTexture | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private stageCv: HTMLCanvasElement;
  private stageG: CanvasRenderingContext2D;
  private entry: SkillEntry | null = null;
  private t = 0;
  private accum = 0;
  private lastW = 0;
  private lastH = 0;
  private lastEntryKey = '';
  private rect = { cx: 0, cy: 0, w: 0, h: 0 };
  private demoBtnRect: { x: number; y: number; w: number; h: number } | null = null;
  demoBtnHot = false;
  canPlay3d = false;

  constructor(private L: UiLayer) {
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 62;
    this.mesh.visible = false;
    L.text.scene.add(this.mesh);
    this.stageCv = makeCanvas(184, 92) as HTMLCanvasElement;
    this.stageG = this.stageCv.getContext('2d')!;
    this.stageG.imageSmoothingEnabled = false;
  }

  setEntry(e: SkillEntry | null, canPlay3d = false) {
    const key = e ? `${e.kind}:${e.id}:${e.weaponId ?? ''}:${e.attached?.length ?? 0}:${canPlay3d ? 1 : 0}` : '';
    if (key !== this.lastEntryKey) {
      this.lastEntryKey = key;
      this.entry = e;
      this.canPlay3d = canPlay3d;
      this.t = 0;
      this.accum = 1; // force immediate repaint
    }
  }

  layout(cx: number, cy: number, w: number, h: number) {
    this.rect = { cx, cy, w, h };
  }

  hitDemoBtn(x: number, y: number): boolean {
    const r = this.demoBtnRect;
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  update(dt: number, alpha: number) {
    if (!this.entry || alpha <= 0.02 || this.rect.w < 40 || this.rect.h < 40) {
      this.mesh.visible = false;
      this.demoBtnRect = null;
      return;
    }
    this.t += dt;
    this.accum += dt;
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const W = Math.max(64, Math.round(this.rect.w * dpr));
    const H = Math.max(64, Math.round(this.rect.h * dpr));
    if (W !== this.lastW || H !== this.lastH || !this.canvas) {
      this.lastW = W; this.lastH = H;
      this.canvas = makeCanvas(W, H) as HTMLCanvasElement;
      this.ctx = this.canvas.getContext('2d')!;
      this.ctx.imageSmoothingEnabled = false;
      this.tex?.dispose();
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.magFilter = THREE.NearestFilter;
      this.tex.minFilter = THREE.LinearFilter;
      this.tex.generateMipmaps = false;
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.mat.map = this.tex;
      this.mat.needsUpdate = true;
      this.accum = 1;
    }
    if (this.accum >= 1 / 30) {
      this.accum = 0;
      this.paint(this.ctx!, W, H, dpr);
      if (this.tex) this.tex.needsUpdate = true;
    }
    this.mat.opacity = alpha;
    this.mesh.visible = true;
    this.mesh.scale.set(this.rect.w, this.rect.h, 1);
    this.mesh.position.set(Math.round(this.rect.cx), -Math.round(this.rect.cy), 0);
  }

  hide() {
    this.mesh.visible = false;
    this.demoBtnRect = null;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.tex?.dispose();
    this.mat.dispose();
  }

  private paint(g: CanvasRenderingContext2D, W: number, H: number, dpr: number) {
    const e = this.entry!;
    const kk = uiScale(this.L.w, this.L.h, 0.78, 2.8);
    const u = Math.max(1, Math.round(2 * kk * dpr));
    const padX = Math.round(14 * kk * dpr);
    const padY = Math.round(11 * kk * dpr);
    const innerCol = e.kind === 'arcana' ? '#58c088' : e.kind === 'keepsake' ? '#d8b058' : e.kind === 'manual' ? '#d8a64c' : e.kind === 'boon' ? '#c88c48' : '#967c52';

    g.clearRect(0, 0, W, H);
    drawPixelPlaque(g, 0, 0, W, H, u, {
      bg: '#131018', hi: '#241e2e', border: '#07050a', inner: innerCol, accent: '#ffd884', rivets: true,
    });

    const boxX = padX + u, boxW = W - (padX + u) * 2;
    const compact = this.rect.h < 320;
    const stageH = Math.round(H * (compact ? 0.44 : 0.48));
    const stageY = padY + u;
    const bdr = Math.max(1, Math.round(1.5 * kk * dpr));

    // 1. Live Animated Pixel Dojo Stage
    const beat = this.paintPixelStage(e, this.t);
    g.fillStyle = '#09070c';
    g.fillRect(boxX - bdr, stageY - bdr, boxW + 2 * bdr, stageH + 2 * bdr);
    g.fillStyle = innerCol;
    g.fillRect(boxX, stageY, boxW, stageH);
    const ix = boxX + bdr, iy = stageY + bdr, iw = boxW - 2 * bdr, ih = stageH - 2 * bdr;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.stageCv, 0, 0, this.stageCv.width, this.stageCv.height, ix, iy, iw, ih);

    // Subtle "示意演武" corner stamp at top-left of viewport
    const lblS = Math.max(1, Math.round((11 * kk * dpr) / PIX_H));
    const stampTxt = localize('动作示意');
    const stW = pixW(stampTxt) * lblS + Math.round(10 * kk * dpr);
    const stH = PIX_H * lblS + Math.round(5 * kk * dpr);
    g.fillStyle = 'rgba(10,8,14,0.84)';
    g.fillRect(ix + bdr, iy + bdr, stW, stH);
    g.fillStyle = innerCol;
    g.fillRect(ix + bdr, iy + bdr, Math.max(1, Math.round(2 * dpr)), stH);
    drawPix(g, stampTxt, ix + bdr + Math.round(6 * kk * dpr), iy + bdr + Math.round(2.5 * kk * dpr), {
      scale: lblS, color: '#e6d6b0', outline: null, align: 'left',
    });

    // Bottom HUD strip inside stage viewport: synchronized keycap beat + live phase label
    const barH = Math.max(Math.round(24 * kk * dpr), Math.round(ih * 0.24));
    const barY = iy + ih - barH;
    g.fillStyle = 'rgba(9,8,14,0.88)';
    g.fillRect(ix, barY, iw, barH);
    g.fillStyle = '#3a3242';
    g.fillRect(ix, barY, iw, Math.max(1, Math.round(dpr)));
    this.paintBeatBar(g, e, beat, ix + Math.round(8 * kk * dpr), barY, iw - Math.round(16 * kk * dpr), barH, kk, dpr);

    // 2. Lower Inspector Section: Title + Badge + Icon-Rich Effect + Stat Pill + Attached Boons
    let curY = stageY + stageH + Math.round((compact ? 8 : 11) * kk * dpr);
    const title = localize(e.name);
    let tScale = Math.max(1, Math.round(((compact ? 18 : 21) * kk * dpr) / PIX_H));
    while (tScale > 1 && pixW(title) * tScale > boxW * 0.65) tScale--;
    const tH = PIX_H * tScale;
    const titleCol = e.kind === 'arcana' ? '#a4ffd0' : e.kind === 'keepsake' ? '#ffe68c' : e.kind === 'manual' ? '#fff0c0' : '#fff4dc';
    drawPix(g, title, boxX, curY, { scale: tScale, color: titleCol, outline: '#08060c', align: 'left' });

    // Kind / Tier / School tag pills right of title
    let tx = boxX + pixW(title) * tScale + Math.round(10 * kk * dpr);
    const pScale = Math.max(1, Math.round((12.5 * kk * dpr) / PIX_H));
    const drawPill = (txt: string, col: string, fill: string) => {
      if (!txt) return;
      const loc = localize(txt);
      const pw = pixW(loc) * pScale + Math.round(10 * kk * dpr);
      if (tx + pw > boxX + boxW) return;
      const ph = PIX_H * pScale + Math.round(5 * kk * dpr);
      const py = Math.round(curY + (tH - ph) / 2);
      g.fillStyle = col; g.fillRect(tx, py, pw, ph);
      g.fillStyle = fill; g.fillRect(tx + bdr, py + bdr, pw - 2 * bdr, ph - 2 * bdr);
      drawPix(g, loc, tx + Math.round(5 * kk * dpr), py + Math.round(2.5 * kk * dpr), { scale: pScale, color: col, outline: null, align: 'left' });
      tx += pw + Math.round(6 * kk * dpr);
    };
    const kindTag = e.tag || (e.kind === 'base' ? '佩刀招式' : e.kind === 'arcana' ? '悟性牌' : e.kind === 'keepsake' ? '随身信物' : '');
    if (kindTag) drawPill(kindTag, innerCol, '#14111a');
    if (e.badge) drawPill(e.badge.text, e.badge.col, e.badge.hot ? '#322010' : '#14111a');

    curY += tH + Math.round(7 * kk * dpr);
    g.fillStyle = '#383042';
    g.fillRect(boxX, curY, boxW, Math.max(1, Math.round(dpr)));
    curY += Math.round(8 * kk * dpr);

    // Effect description (wrapped up to 2 lines) with full Hades-2 inline pixel icons!
    const effPx = Math.round((compact ? 14.5 : 16.5) * kk * dpr);
    const effStr = localize(e.effect);
    const lines = this.wrapRich(effStr, effPx, boxW);
    for (const ln of lines.slice(0, 2)) {
      let p = effPx;
      while (p > Math.round(10 * kk * dpr) && richLine(null, ln, 0, 0, p, '#f0e6d2', '#fff6b8', true, true) > boxW) p -= 1;
      richLine(g, ln, boxX, curY, p, '#f0e6d2', '#fff6b8', true, true);
      curY += Math.ceil(p * 1.32);
    }

    // Stat / Cost / Timing pill (icon-rich!)
    if (e.num) {
      curY += Math.round(3 * kk * dpr);
      const numPx = Math.round((compact ? 13 : 14.5) * kk * dpr);
      const numStr = localize(e.num);
      let np = numPx;
      const maxNumW = boxW - Math.round(16 * kk * dpr);
      while (np > Math.round(9.5 * kk * dpr) && richLine(null, numStr, 0, 0, np, '#ffe8aa', '#fff8c8', true, true) > maxNumW) np -= 1;
      const nw = richLine(null, numStr, 0, 0, np, '#ffe8aa', '#fff8c8', true, true);
      const pillH = Math.ceil(np * 1.28) + Math.round(6 * kk * dpr);
      const pillW = Math.min(boxW, Math.ceil(nw) + Math.round(16 * kk * dpr));
      g.fillStyle = '#241d18'; g.fillRect(boxX, curY, pillW, pillH);
      g.fillStyle = '#9a7842'; g.fillRect(boxX, curY, pillW, Math.max(1, Math.round(dpr)));
      g.fillStyle = '#9a7842'; g.fillRect(boxX, curY, Math.max(2, Math.round(2 * dpr)), pillH);
      richLine(g, numStr, boxX + Math.round(8 * kk * dpr), curY + Math.round(3 * kk * dpr), np, '#f2e4c4', '#fff8c0', true, true);
      curY += pillH + Math.round(6 * kk * dpr);
    }

    // Hades-2 Integration: Attached Boons currently augmenting this base move slot!
    const bottomLimit = H - padY - u;
    if (e.attached && e.attached.length && curY + Math.round(24 * kk * dpr) < bottomLimit) {
      const hdrS = Math.max(1, Math.round((11.5 * kk * dpr) / PIX_H));
      drawPix(g, localize('本局已挂载秘传'), boxX, curY, { scale: hdrS, color: '#ffd878', outline: '#08060c', align: 'left' });
      curY += PIX_H * hdrS + Math.round(5 * kk * dpr);
      const bPx = Math.round((compact ? 12.5 : 14) * kk * dpr);
      for (const ab of e.attached.slice(0, 2)) {
        if (curY + Math.ceil(bPx * 1.35) > bottomLimit) break;
        const rowH = Math.ceil(bPx * 1.32) + Math.round(4 * kk * dpr);
        g.fillStyle = '#1b1622'; g.fillRect(boxX, curY, boxW, rowH);
        g.fillStyle = ab.col; g.fillRect(boxX, curY, Math.max(2, Math.round(2.5 * dpr)), rowH);
        const lineTxt = `${localize(ab.name)} · ${localize(ab.eff)}`;
        let lp = bPx;
        while (lp > Math.round(9.5 * kk * dpr) && richLine(null, lineTxt, 0, 0, lp, '#e8dec8', '#fff4b0', true, true) > boxW - Math.round(14 * kk * dpr)) lp -= 1;
        richLine(g, lineTxt, boxX + Math.round(8 * kk * dpr), curY + Math.round(2 * kk * dpr), lp, '#e8dec8', '#fff4b0', true, true);
        curY += rowH + Math.round(4 * kk * dpr);
      }
    }

    // Optional clickable 「实景演武」 button at bottom-right for learned manuals (triggers 3D ghost demo)
    if (e.kind === 'manual' && this.canPlay3d) {
      const btnTxt = localize('实景演武');
      const bs = Math.max(1, Math.round((13.5 * kk * dpr) / PIX_H));
      const bw = pixW(btnTxt) * bs + Math.round(24 * kk * dpr);
      const bh = PIX_H * bs + Math.round(12 * kk * dpr);
      const bx = boxX + boxW - bw;
      const by = bottomLimit - bh;
      const hot = this.demoBtnHot;
      drawPixelPlaque(g, bx, by, bw, bh, Math.max(1, Math.round(1.5 * kk * dpr)), {
        bg: hot ? '#483016' : '#2e2012', hi: hot ? '#6a4822' : '#46321c', border: '#07050a',
        inner: hot ? '#fff098' : '#e0aa4e', rivets: true,
      });
      drawPix(g, btnTxt, bx + bw / 2, Math.round(by + (bh - PIX_H * bs) / 2), {
        scale: bs, color: hot ? '#fffce0' : '#ffe6a0', outline: '#08060c', align: 'center',
      });
      const left0 = this.rect.cx - this.rect.w / 2, top0 = this.rect.cy - this.rect.h / 2;
      this.demoBtnRect = { x: left0 + bx / dpr, y: top0 + by / dpr, w: bw / dpr, h: bh / dpr };
    } else {
      this.demoBtnRect = null;
    }
  }

  private wrapRich(txt: string, px: number, maxW: number): string[] {
    if (richLine(null, txt, 0, 0, px, '#fff', '#fff', true, true) <= maxW) return [txt];
    const sep = txt.search(/[，。；、·]/);
    if (sep > 2 && sep < txt.length - 2) {
      return [txt.slice(0, sep + 1), txt.slice(sep + 1).trim()];
    }
    const mid = Math.ceil(txt.length / 2);
    return [txt.slice(0, mid), txt.slice(mid)];
  }

  private paintBeatBar(
    g: CanvasRenderingContext2D, e: SkillEntry, beat: BeatState,
    x: number, y: number, w: number, h: number, kk: number, dpr: number,
  ) {
    const mid = Math.round(y + h / 2);
    const dev = PAD.device;
    let cx = x;
    const drawBtnChip = (btn: BtnName, lit: boolean, isHold: boolean) => {
      const aKey = ACTION_BTN_KEY[btn] as 'attack' | 'dash' | 'jump' | 'special';
      if (dev === 'pad') {
        const idx = btn === 'ult' ? 3 : BIND.pad[aKey][0];
        const gs = Math.max(1, Math.round((h * 0.66) / GLYPH_H));
        const gw = glyphArt(idx).w * gs;
        if (lit) {
          g.fillStyle = '#ffe078';
          g.fillRect(Math.round(cx - 2 * dpr), Math.round(mid - (GLYPH_H * gs) / 2 - 2 * dpr), gw + Math.round(4 * dpr), GLYPH_H * gs + Math.round(4 * dpr));
        }
        paintGlyph(g, idx, Math.round(cx), Math.round(mid - (GLYPH_H * gs) / 2), gs);
        cx += gw + Math.round(6 * kk * dpr);
      } else {
        const keyTxt = btn === 'ult' ? 'F' : dev === 'touch' ? ({ attack: '斩', dash: '闪', jump: '跳', special: '镖', ult: '绝' }[btn]) : actKey(aKey);
        const label = isHold ? `${localize('长按')} ${keyTxt}` : keyTxt;
        const ks = Math.max(1, Math.round((h * 0.64) / KEYCAP_H));
        const kw = keyCapWidth(label) * ks;
        paintKeyCap(g, label, Math.round(cx), Math.round(mid - (KEYCAP_H * ks) / 2), ks, lit);
        cx += kw + Math.round(6 * kk * dpr);
      }
      if (isHold && beat.holdFill != null) {
        const bw = Math.round(28 * kk * dpr), bh = Math.round(6 * kk * dpr);
        const by = Math.round(mid - bh / 2);
        g.fillStyle = '#18141c'; g.fillRect(Math.round(cx), by, bw, bh);
        g.fillStyle = beat.holdFill >= 0.95 ? '#fff088' : '#ff9a3c';
        g.fillRect(Math.round(cx + dpr), by + Math.round(dpr), Math.round((bw - 2 * dpr) * Math.min(1, beat.holdFill)), bh - Math.round(2 * dpr));
        cx += bw + Math.round(6 * kk * dpr);
      }
    };

    // Derive which button chip(s) to display for this entry
    if (e.kind === 'arcana') {
      const ico = Math.round(h * 0.62);
      drawMiniIcon(g, 'grasp', cx + ico / 2, mid, ico);
      cx += ico + Math.round(6 * kk * dpr);
    } else if (e.kind === 'keepsake') {
      const ico = Math.round(h * 0.62);
      drawMiniIcon(g, 'star', cx + ico / 2, mid, ico);
      cx += ico + Math.round(6 * kk * dpr);
    } else if (beat.holdBtn) {
      drawBtnChip(beat.holdBtn, beat.activeBtns.includes(beat.holdBtn), true);
    } else {
      const unique: BtnName[] = [];
      for (const st of e.steps ?? []) {
        const b: BtnName | null = st === 'attack' || st === 'hold' || st === 'release' ? 'attack'
          : st === 'dash' ? 'dash' : st === 'jump' ? 'jump' : st === 'dart' ? 'special' : st === 'intent' ? 'ult' : null;
        if (b && !unique.includes(b)) unique.push(b);
      }
      if (!unique.length) unique.push('attack');
      for (let i = 0; i < Math.min(3, unique.length); i++) {
        if (i > 0) {
          const ps = Math.max(1, Math.round((11 * kk * dpr) / PIX_H));
          drawPix(g, '>', Math.round(cx), Math.round(mid - (PIX_H * ps) / 2), { scale: ps, color: '#a89c88', outline: null, align: 'left' });
          cx += pixW('>') * ps + Math.round(5 * kk * dpr);
        }
        drawBtnChip(unique[i], beat.activeBtns.includes(unique[i]), false);
      }
    }

    // Right-aligned live animated phase caption
    if (beat.phase) {
      const ps = Math.max(1, Math.round((13 * kk * dpr) / PIX_H));
      const pTxt = localize(beat.phase);
      const pCol = beat.activeBtns.length ? '#ffe688' : '#cfc6b6';
      drawPix(g, pTxt, x + w, Math.round(mid - (PIX_H * ps) / 2), { scale: ps, color: pCol, outline: '#08060c', align: 'right' });
    }
  }

  // ---------------------------------------------------------------- Live 184×92 Hard-Edge Pixel Martial-Arts Animator
  private paintPixelStage(e: SkillEntry, time: number): BeatState {
    const g = this.stageG;
    const W = this.stageCv.width, H = this.stageCv.height;
    const groundY = 64;
    const wid: WeaponId = e.weaponId ?? 'hanshan';
    const bPal = WEAPON_BLADE_COL[wid];

    const R = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    };

    // 1. Crisp Pixel Dojo Backdrop (ink night sky, wooden roof beams, two swaying warm lanterns, plank floor)
    R(0, 0, W, H, '#12101a');
    R(0, 0, W, 16, '#1a1524');
    // Roof beam & eaves
    R(0, 14, W, 4, '#2d221c');
    R(0, 17, W, 1, '#543c2c');
    // Pillars
    for (const px of [12, W - 18]) {
      R(px, 18, 6, groundY - 18, '#281e1a');
      R(px + 1, 18, 1, groundY - 18, '#46342a');
    }
    // Distant lattice window in center
    R(56, 22, 72, 26, '#191624');
    for (let x = 64; x < 128; x += 12) R(x, 22, 1, 26, '#2b2438');
    for (let y = 30; y < 48; y += 9) R(56, y, 72, 1, '#2b2438');
    // Two warm lanterns
    const glow = Math.sin(time * 4) > 0 ? '#ffd878' : '#f0b854';
    for (const lx of [34, W - 40]) {
      R(lx + 2, 18, 1, 4, '#6e5034');
      R(lx, 22, 5, 7, '#a83628');
      R(lx + 1, 23, 3, 5, glow);
    }
    // Courtyard flagstone floor
    R(0, groundY, W, H - groundY, '#221e28');
    R(0, groundY, W, 2, '#4a4052');
    for (let fx = 16; fx < W; fx += 24) R(fx, groundY + 2, 1, H - groundY - 2, '#181520');
    R(0, groundY + 12, W, 1, '#181520');

    // Helper: draw our blindfolded straw-hat heroine (16×24 px footprint anchored at bottom-center (x, y))
    const drawHero = (
      x: number, y: number,
      o: { dir?: 1 | -1; crouch?: boolean; sheath?: boolean; swing?: number; bladeLen?: number; ghost?: boolean; alpha?: number; aura?: string } = {},
    ) => {
      const dir = o.dir ?? 1;
      const prevA = g.globalAlpha;
      if (o.alpha != null) g.globalAlpha = o.alpha;
      const cy = o.crouch ? y + 2 : y;
      // Ground shadow
      if (!o.ghost) R(x - 7, groundY - 1, 14, 3, '#0b0910');
      if (o.aura) {
        R(x - 10, cy - 22, 20, 2, o.aura); R(x - 10, cy - 2, 20, 2, o.aura);
        R(x - 10, cy - 20, 2, 18, o.aura); R(x + 8, cy - 20, 2, 18, o.aura);
      }
      const coat = o.ghost ? '#5cb4e6' : '#262838';
      const trim = o.ghost ? '#a8e4ff' : '#4a4e68';
      const sash = o.ghost ? '#7ce0ff' : '#c83a32';
      const hat  = o.ghost ? '#98dcff' : '#c49c5c';
      const rib  = o.ghost ? '#e0f8ff' : '#f2eee4';
      // Legs
      R(x - 4, cy - 6, 3, 6, o.ghost ? '#4288b8' : '#1c1a24');
      R(x + 1, cy - 6, 3, 6, o.ghost ? '#4288b8' : '#1c1a24');
      // Torso & crimson sash
      R(x - 5, cy - 15, 10, 9, coat);
      R(x - 4, cy - 14, 8, 2, trim);
      R(x - 5, cy - 9, 10, 2, sash);
      // Fluttering scarf tail
      const wave = Math.round(Math.sin(time * 10) * 1.5);
      R(x - dir * 8, cy - 10 + wave, 4, 2, sash);
      R(x - dir * 11, cy - 9 + wave, 3, 2, sash);
      // Head + white blindfold + fluttering ribbon
      R(x - 3, cy - 20, 6, 5, o.ghost ? '#c0ecff' : '#e6ccb0');
      R(x - 3, cy - 19, 6, 2, rib);
      R(x - dir * 7, cy - 19 - wave, 4, 1, rib);
      // Wide straw hat (斗笠)
      R(x - 9, cy - 22, 18, 2, hat);
      R(x - 6, cy - 24, 12, 2, hat);
      R(x - 3, cy - 25, 6, 1, '#e4c280');
      // Blade
      const len = o.bladeLen ?? (wid === 'thunder' ? 18 : wid === 'frost' ? 11 : wid === 'blunt' ? 13 : 14);
      if (o.sheath) {
        R(x - dir * 7, cy - 9, 10, 2, '#3c3028');
        R(x + dir * 2, cy - 10, 3, 3, '#ffe478');
      } else {
        const ang = o.swing ?? 0; // 0 = ready low, 1 = high raised, 2 = forward horizontal slash, 3 = thrust
        if (ang === 1) {
          R(x + dir * 4, cy - 26, 2, len, bPal.main);
          R(x + dir * 4, cy - 26, 1, len - 2, bPal.hi);
        } else if (ang === 2) {
          R(x + (dir > 0 ? 4 : -4 - len), cy - 13, len, 2, bPal.main);
          R(x + (dir > 0 ? 4 : -4 - len), cy - 13, len, 1, bPal.hi);
        } else if (ang === 3) {
          R(x + (dir > 0 ? 5 : -5 - len - 3), cy - 12, len + 3, 2, bPal.hi);
        } else {
          R(x + (dir > 0 ? 4 : -4 - Math.round(len * 0.7)), cy - 10, Math.round(len * 0.7), 2, bPal.main);
        }
      }
      g.globalAlpha = prevA;
    };

    // Helper: draw sparring bandit / dummy on right
    const drawFoe = (
      x: number, y: number,
      o: { hurt?: boolean; flash?: boolean; atk?: boolean; pins?: number; frost?: boolean; bleed?: boolean; stun?: boolean } = {},
    ) => {
      R(x - 6, groundY - 1, 12, 3, '#0b0910');
      const body = o.hurt ? '#ffffff' : o.frost ? '#68c8ee' : '#5e3630';
      const armor = o.hurt ? '#ffe8d8' : o.frost ? '#9ee8ff' : '#3a2c32';
      // Legs & torso
      R(x - 4, y - 6, 3, 6, '#241c20'); R(x + 1, y - 6, 3, 6, '#241c20');
      R(x - 5, y - 16, 10, 10, body);
      R(x - 5, y - 15, 10, 4, armor);
      // Head + yellow turban
      R(x - 3, y - 21, 6, 5, o.hurt ? '#ffffff' : '#d8b494');
      R(x - 4, y - 22, 8, 2, '#d8a642');
      // Enemy weapon
      if (o.atk) {
        R(x - 16, y - 14, 12, 2, '#e6d8c8');
        R(x - 18, y - 16, 10, 6, 'rgba(255,68,56,0.55)');
      } else {
        R(x - 8, y - 18, 2, 12, '#8c8894');
      }
      // Telegraph flash (!)
      if (o.flash) {
        R(x - 2, y - 33, 4, 4, '#ff4c3c');
        R(x - 1, y - 32, 2, 2, '#fff4a8');
        R(x - 10, y - 15, 4, 2, '#ff5442');
      }
      // Stuck willow darts / ice pins
      for (let i = 0; i < (o.pins ?? 0); i++) {
        R(x - 8 + i * 2, y - 15 + i * 3, 6, 1, '#8ef0ff');
        R(x - 9 + i * 2, y - 15 + i * 3, 2, 1, '#e84852');
      }
      // Bleed drops
      if (o.bleed) {
        const dy = Math.floor((time * 18) % 8);
        R(x - 3, y - 10 + dy, 2, 3, '#ff4848');
        R(x + 3, y - 13 + ((dy + 4) % 8), 2, 3, '#ff4848');
      }
      // Stun stars
      if (o.stun) {
        const sx = Math.round(Math.sin(time * 12) * 5);
        R(x + sx - 1, y - 27, 2, 2, '#ffe878');
        R(x - sx - 1, y - 26, 2, 2, '#fff8d0');
      }
    };

    // Helper: hard-edge pixel slash arc
    const drawSlash = (cx: number, cy: number, r: number, col: string, hi = '#ffffff', vert = false) => {
      if (vert) {
        R(cx - 2, cy - r, 4, r * 2, col);
        R(cx - 1, cy - r + 2, 2, r * 2 - 4, hi);
        R(cx + 2, cy - Math.round(r * 0.7), 2, Math.round(r * 1.4), col);
      } else {
        R(cx - r, cy - 3, r * 2, 6, col);
        R(cx - r + 2, cy - 1, r * 2 - 4, 2, hi);
        R(cx - Math.round(r * 0.6), cy - 5, Math.round(r * 1.2), 2, col);
      }
    };

    const drawSparks = (cx: number, cy: number, col: string, spread: number) => {
      const s = Math.max(2, Math.round(spread));
      R(cx - s, cy - 1, 2, 2, col); R(cx + s - 2, cy - 1, 2, 2, col);
      R(cx - 1, cy - s, 2, 2, col); R(cx - 1, cy + s - 2, 2, 2, col);
      R(cx - Math.round(s * 0.7), cy - Math.round(s * 0.7), 2, 2, '#ffffff');
      R(cx + Math.round(s * 0.6), cy + Math.round(s * 0.6), 2, 2, '#ffffff');
    };

    const id = e.id;
    const cyc = 2.6;
    const u = (time % cyc) / cyc; // 0..1

    // ------------------------------------------------------------ Specific Move / Boon / Meta Animations
    if (id === 'lianhuan') {
      const hits = wid === 'thunder' ? 3 : wid === 'frost' ? 6 : wid === 'blunt' ? 2 : 5;
      const seg = Math.min(hits - 1, Math.floor(u * (hits + 1)));
      const inHit = u < hits / (hits + 1);
      const local = (u * (hits + 1)) % 1;
      const fx = 122 + (inHit && local < 0.4 ? (seg === hits - 1 ? 6 : 2) : 0);
      const hx = 68 + seg * (wid === 'blunt' ? 12 : 7);
      const jumpY = wid === 'hanshan' && seg === 4 && inHit ? Math.round(Math.sin(local * Math.PI) * 14) : 0;
      drawFoe(fx, groundY, { hurt: inHit && local > 0.15 && local < 0.45, pins: wid === 'frost' ? Math.min(3, Math.floor((seg + 1) / 2)) : 0 });
      drawHero(hx, groundY - jumpY, {
        swing: !inHit ? 0 : local < 0.25 ? 1 : 2,
        sheath: wid === 'blunt' && !inHit,
        aura: wid === 'thunder' && seg === 2 && inHit ? '#ffd860' : undefined,
      });
      if (inHit && local > 0.15 && local < 0.52) {
        drawSlash(hx + 22, groundY - 12 - jumpY, seg === hits - 1 ? 18 : 13, bPal.fx, '#ffffff', seg === hits - 1 && wid !== 'frost');
        drawSparks(fx - 2, groundY - 12, bPal.fx, 8 + local * 10);
      }
      return {
        phase: inHit ? `第 ${seg + 1}/${hits} 段` : wid === 'blunt' ? '零帧接藏锋' : '收刀回势',
        activeBtns: inHit && local < 0.35 ? ['attack'] : [],
      };
    }

    if (id === 'iai') {
      if (u < 0.46) {
        const fill = u / 0.46;
        drawFoe(128, groundY, { pins: wid === 'frost' ? 3 : 0 });
        drawHero(52, groundY, { sheath: true, crouch: true });
        // Expanding golden charge ring under feet
        const rw = Math.round(8 + fill * 18);
        R(52 - rw, groundY + 1, rw * 2, 2, fill > 0.85 ? '#fff288' : '#ff9a38');
        if (fill > 0.85) drawSparks(54, groundY - 10, '#fff288', 9);
        return { phase: fill > 0.85 ? '蓄满！松手斩' : '长按蓄力…', activeBtns: ['attack'], holdBtn: 'attack', holdFill: fill };
      }
      const p = (u - 0.46) / 0.54;
      if (wid === 'thunder') {
        // 裂阵斩: huge 6m golden lightning shockwave + vertical thunder pillars
        drawFoe(134 + (p < 0.4 ? 6 : 0), groundY, { hurt: p < 0.45, stun: p >= 0.3 });
        drawHero(58, groundY, { swing: 2, aura: '#ffd860' });
        if (p < 0.65) {
          const waveX = 68 + Math.round(p * 95);
          R(64, groundY - 10, Math.min(96, waveX - 64), 6, '#ffd248');
          R(64, groundY - 8, Math.min(96, waveX - 64), 2, '#fffbe0');
          // Voxel thunder pillar
          if (p > 0.22 && p < 0.58) {
            R(130, 12, 8, groundY - 12, '#ffe468');
            R(132, 12, 4, groundY - 12, '#ffffff');
          }
        }
        return { phase: '裂阵斩 · 雷柱破盾！', activeBtns: [] };
      }
      if (wid === 'frost') {
        // 追霜: flash-dash detonating stuck ice pins
        const hx = Math.round(52 + Math.min(1, p * 2.5) * 102);
        drawFoe(118, groundY, { hurt: p > 0.25 && p < 0.65, frost: p > 0.3, pins: p < 0.3 ? 3 : 0 });
        if (p < 0.4) R(52, groundY - 12, hx - 52, 3, '#7ce8ff');
        drawHero(hx, groundY, { swing: 2 });
        if (p > 0.28 && p < 0.72) {
          drawSparks(118, groundY - 12, '#84f0ff', 10 + (p - 0.28) * 18);
          R(106, groundY - 22, 24, 2, '#b8f8ff'); R(106, groundY - 4, 24, 2, '#b8f8ff');
        }
        return { phase: '追霜 · 引爆影针！', activeBtns: [] };
      }
      if (wid === 'blunt') {
        // 听声一闪: crimson-gold bisecting slash
        drawFoe(126, groundY, { hurt: p < 0.55 });
        drawHero(146, groundY, { dir: -1, sheath: p > 0.5, swing: 2 });
        if (p < 0.55) {
          R(30, groundY - 13, 134, 4, '#ff7842');
          R(30, groundY - 12, 134, 2, '#fff4cc');
          drawSparks(126, groundY - 12, '#ff9852', 14);
        }
        return { phase: '听声一闪！', activeBtns: [] };
      }
      // 寒山 箭步斩: dash through + delayed cuts
      const hx = Math.round(52 + Math.min(1, p * 3) * 98);
      drawFoe(114, groundY, { hurt: p > 0.35 && p < 0.72 });
      if (p < 0.35) R(52, groundY - 12, hx - 52, 2, '#ffe89c');
      drawHero(hx, groundY, { sheath: p > 0.45, swing: 2 });
      if (p > 0.32 && p < 0.78) {
        drawSlash(114, groundY - 13, 18, '#ffe078', '#ffffff');
        drawSparks(114, groundY - 13, '#ffe078', 12);
      }
      return { phase: '松手！箭步穿斩', activeBtns: [] };
    }

    if (id === 'parry') {
      if (u < 0.42) {
        drawHero(64, groundY, { sheath: true, crouch: true });
        drawFoe(114 - Math.round(u * 26), groundY, { flash: u > 0.24, atk: u > 0.34 });
        return { phase: u > 0.24 ? '红光来袭 · 准备松手！' : '长按蓄势听招', activeBtns: ['attack'], holdBtn: 'attack', holdFill: u / 0.42 };
      }
      const p = (u - 0.42) / 0.58;
      const knock = Math.min(34, Math.round(p * 70));
      drawFoe(104 + knock, groundY, { hurt: p < 0.4, stun: p > 0.2 });
      drawHero(64, groundY, { swing: 2, aura: p < 0.35 ? '#fff4b8' : undefined });
      if (p < 0.45) {
        const rr = Math.round(8 + p * 36);
        R(80 - rr, groundY - 13 - rr, rr * 2, 2, '#fff4b8');
        R(80 - rr, groundY - 13 + rr, rr * 2, 2, '#fff4b8');
        R(80 - rr, groundY - 13 - rr, 2, rr * 2, '#ffe078');
        R(80 + rr, groundY - 13 - rr, 2, rr * 2, '#ffe078');
        drawSparks(82, groundY - 13, '#ffe478', 12 + p * 14);
      }
      return { phase: '破势成功！震退弹反', activeBtns: [] };
    }

    if (id === 'dash' || id === 'dcut' || id === 'counter') {
      const isCounter = id === 'counter', isDcut = id === 'dcut';
      if (u < 0.38) {
        drawHero(56, groundY, {});
        drawFoe(112, groundY, { flash: isCounter && u > 0.18, atk: u > 0.26 });
        return { phase: isCounter ? '敌招临身 · 闪避！' : '准备冲刺', activeBtns: [] };
      }
      if (u < 0.68) {
        const p = (u - 0.38) / 0.30;
        const hx = Math.round(56 + p * (isDcut ? 86 : 64));
        drawHero(56 + Math.round(p * 26), groundY, { ghost: true, alpha: 0.35 });
        drawHero(56 + Math.round(p * 48), groundY, { ghost: true, alpha: 0.6 });
        drawFoe(112, groundY, { atk: p < 0.45, hurt: isDcut && p > 0.45 });
        drawHero(hx, groundY, { swing: isDcut ? 2 : 0 });
        if (isDcut) R(56, groundY - 12, hx - 56, 3, '#68d4ff');
        if (isCounter && p < 0.5) {
          R(hx - 14, groundY - 26, 28, 2, '#82dcff'); R(hx - 14, groundY - 2, 28, 2, '#82dcff');
        }
        return { phase: isDcut ? '冲刺接斩 · 穿风！' : isCounter ? '完美闪避！' : '无敌疾冲', activeBtns: isDcut ? ['dash', 'attack'] : ['dash'] };
      }
      const p = (u - 0.68) / 0.32;
      drawFoe(112 + (isCounter && p > 0.2 ? 12 : 0), groundY, { hurt: isCounter && p > 0.18 && p < 0.7 });
      drawHero(isDcut ? 142 : 120, groundY, { dir: isCounter ? -1 : 1, swing: isCounter ? 2 : 0 });
      if (isCounter && p > 0.15 && p < 0.75) {
        drawSlash(112, groundY - 13, 20, '#ffd858', '#ffffff');
        drawSparks(112, groundY - 13, '#ffd858', 13);
      }
      return { phase: isCounter ? '回锋斩 · 伤害翻倍！' : isDcut ? '穿敌收刀' : '闪避脱身', activeBtns: isCounter && p < 0.45 ? ['attack'] : [] };
    }

    if (id === 'jump' || id === 'plunge' || id === 'dbl' || id === 'swoop' || id === 'stomp') {
      const isPlunge = id === 'plunge', isDbl = id === 'dbl', isSwoop = id === 'swoop', isStomp = id === 'stomp';
      const arc = isDbl
        ? (u < 0.42 ? Math.sin((u / 0.42) * Math.PI) * 20 : u < 0.85 ? 12 + Math.sin(((u - 0.42) / 0.43) * Math.PI) * 24 : 0)
        : (u < 0.72 ? Math.sin((u / 0.72) * Math.PI) * 30 : 0);
      const hx = isSwoop && u > 0.45 ? Math.round(62 + Math.min(1, (u - 0.45) / 0.3) * 56) : isStomp ? Math.round(64 + u * 64) : 64 + Math.round(u * 46);
      const hy = groundY - Math.round(arc);
      drawFoe(112, groundY, {
        atk: id === 'jump' && u > 0.25 && u < 0.55,
        hurt: ((isPlunge || isSwoop) && u > 0.65 && u < 0.88) || (isStomp && u > 0.42 && u < 0.65),
      });
      if (id === 'jump' && u > 0.25 && u < 0.6) R(48, groundY - 4, 66, 3, '#ff5442');
      drawHero(hx, hy, { swing: (isPlunge || isSwoop) && u > 0.48 ? 1 : 0 });
      if (isDbl && u > 0.4 && u < 0.6) R(hx - 12, hy + 1, 24, 2, '#78c8ff');
      if (isStomp && u > 0.42 && u < 0.62) { R(100, groundY - 22, 24, 3, '#b8f048'); drawSparks(112, groundY - 20, '#b8f048', 10); }
      if ((isPlunge || isSwoop) && u > 0.66 && u < 0.92) {
        const sw = Math.round((u - 0.66) * 110);
        R(hx - sw, groundY - 3, sw * 2, 4, isSwoop ? '#58e898' : '#ff7842');
        drawSparks(hx, groundY - 6, '#ffd878', 12);
      }
      return {
        phase: isPlunge ? (u > 0.48 ? '空中下劈 · 震地！' : '起跳滞空')
          : isDbl ? (u > 0.42 ? '空中二段跳！' : '一段起跳')
          : isSwoop ? (u > 0.45 ? '空中冲刺掠地！' : '起跳滞空')
          : isStomp ? (u > 0.42 ? '凌空踏顶弹起！' : '跃向敌顶')
          : '跃过贴地横扫',
        activeBtns: u < 0.25 ? ['jump'] : (isDbl || isStomp) && u > 0.4 && u < 0.58 ? ['jump'] : (isPlunge && u > 0.48 && u < 0.7) ? ['attack'] : (isSwoop && u > 0.44 && u < 0.66) ? ['dash'] : [],
      };
    }

    if (id === 'dart' || id === 'backDart' || id === 'cutDart' || id === 'chase' || id === 'reel') {
      const p1 = u < 0.45;
      const hx = id === 'backDart' && !p1 ? Math.round(78 - ((u - 0.45) / 0.55) * 32)
        : id === 'chase' && !p1 ? Math.round(52 + Math.min(1, (u - 0.45) / 0.22) * 70)
        : 52;
      const fx = id === 'reel' && !p1 ? Math.round(134 - Math.min(1, (u - 0.45) / 0.35) * 60) : 134;
      drawFoe(fx, groundY, {
        pins: !p1 ? (id === 'dart' ? 3 : 1) : (u > 0.28 ? 1 : 0),
        hurt: (u > 0.32 && u < 0.48) || (!p1 && (id === 'chase' || id === 'reel' || id === 'cutDart') && u < 0.78),
      });
      drawHero(hx, groundY, { swing: (id === 'chase' || id === 'cutDart') && !p1 ? 2 : 0 });
      if (p1 && u > 0.14) {
        const dx = Math.round(58 + ((u - 0.14) / 0.31) * 72);
        R(dx, groundY - 14, 7, 2, '#eef6ff'); R(dx - 2, groundY - 14, 2, 2, '#e84852');
      }
      if (id === 'reel' && !p1 && u < 0.8) {
        R(hx + 6, groundY - 13, Math.max(4, fx - hx - 10), 2, '#e83848');
      }
      if (id === 'chase' && !p1 && u < 0.75) {
        R(52, groundY - 14, hx - 52, 2, '#a884ff');
        drawSlash(fx, groundY - 13, 15, '#b494ff', '#ffffff');
      }
      if (id === 'backDart' && !p1) {
        const dx = Math.round(hx + 12 + ((u - 0.45) / 0.55) * 64);
        for (const dy of [-4, 0, 4]) R(dx, groundY - 13 + dy, 6, 1, '#ffe082');
      }
      return {
        phase: id === 'chase' ? (p1 ? '先掷镖钉住' : '按斩瞬移追影！')
          : id === 'reel' ? (p1 ? '先掷镖钉住' : '再按镖拉回身前！')
          : id === 'backDart' ? (p1 ? '后撤冲刺' : '反手连掷三镖！')
          : id === 'cutDart' ? (p1 ? '出刀命中' : '瞬接断影镖！')
          : '掷出柳叶镖钉住敌人',
        activeBtns: p1 ? (id === 'backDart' ? ['dash'] : ['special']) : (id === 'chase' ? ['attack'] : ['special']),
      };
    }

    if (id === 'launch' || id === 'acut' || id === 'kick' || id === 'keep' || id === 'pause') {
      if (id === 'launch' || id === 'acut') {
        const loft = u > 0.3 ? Math.round(Math.sin(Math.min(1, (u - 0.3) / 0.62) * Math.PI) * 32) : 0;
        const hy = id === 'acut' && u > 0.42 ? groundY - Math.round(loft * 0.9) : groundY;
        drawFoe(116, groundY - loft, { hurt: u > 0.28 && u < 0.82 });
        drawHero(84, hy, { swing: u > 0.26 ? 2 : 0 });
        if (u > 0.28 && u < 0.48) drawSlash(112, groundY - 16, 18, '#ffe066', '#ffffff', true);
        if (id === 'acut' && u > 0.48 && u < 0.85) drawSlash(116, hy - 12, 16, '#ff68cc', '#ffffff');
        return { phase: id === 'acut' ? (u > 0.45 ? '空中连斩接劈落！' : '挑云挑空') : '斩后按跳 · 挑上半空！', activeBtns: u < 0.3 ? ['attack'] : u < 0.5 ? ['jump'] : id === 'acut' ? ['attack'] : [] };
      }
      if (id === 'kick') {
        const fly = u > 0.45 ? Math.min(48, Math.round(((u - 0.45) / 0.4) * 56)) : 0;
        drawFoe(108 + fly, groundY - (fly > 4 && fly < 42 ? 8 : 0), { hurt: u > 0.44 && u < 0.85 });
        drawHero(u < 0.45 ? Math.round(52 + (u / 0.45) * 44) : 96, groundY, { swing: 0 });
        if (u > 0.44 && u < 0.68) drawSparks(108, groundY - 12, '#ffaa60', 12);
        return { phase: u > 0.44 ? '穿心飞踢 · 踹飞撞墙！' : '贴身冲刺', activeBtns: u < 0.4 ? ['dash'] : u < 0.6 ? ['jump'] : [] };
      }
      // keep / pause
      const isPause = id === 'pause';
      drawFoe(116, groundY, { hurt: (u > 0.12 && u < 0.28) || (u > 0.62 && u < 0.88) });
      drawHero(isPause ? 82 : (u > 0.3 && u < 0.55 ? 74 : 84), groundY, { swing: u > 0.62 ? 2 : u < 0.28 ? 2 : 0 });
      if (isPause && u >= 0.3 && u <= 0.6) {
        for (let i = 0; i < 3; i++) if (u > 0.3 + i * 0.09) R(74 + i * 8, groundY - 30, 4, 4, '#ffb248');
      }
      if (u > 0.62 && u < 0.88) drawSlash(112, groundY - 13, 20, isPause ? '#ff9a38' : '#48e8b8', '#ffffff');
      return { phase: isPause ? (u < 0.3 ? '先斩一刀' : u < 0.6 ? '稍停半拍…' : '爆发重顿斩！') : (u < 0.55 ? '斩中侧闪不破连段' : '续接重收尾！'), activeBtns: u < 0.25 || u > 0.62 ? ['attack'] : isPause ? [] : ['dash'] };
    }

    if (id === 'ult') {
      // 不见刀: 3 ingots -> dark domain -> 3 crisscross phantom slashes -> sheath glint -> 8 gold bursts!
      const dark = u > 0.22 && u < 0.85;
      if (dark) R(0, 0, W, H, 'rgba(6,5,12,0.72)');
      for (let i = 0; i < 3; i++) {
        R(74 + i * 14, 10, 10, 5, (u > i * 0.07 || dark) ? '#ffd858' : '#3a3438');
        R(75 + i * 14, 11, 8, 2, (u > i * 0.07 || dark) ? '#fff8c8' : '#4a4448');
      }
      drawFoe(114, groundY, { hurt: u > 0.32 && u < 0.9 });
      if (u < 0.25) {
        drawHero(58, groundY, { sheath: true });
        return { phase: '三格杀气蓄满！', activeBtns: ['ult'] };
      }
      if (u < 0.66) {
        drawHero(82, groundY, { ghost: true, alpha: 0.65, swing: 2 });
        drawHero(138, groundY, { dir: -1, ghost: true, alpha: 0.65, swing: 2 });
        drawHero(146, groundY, { dir: -1, swing: 2 });
        drawSlash(114, groundY - 16, 26, '#ffd248', '#ffffff');
        drawSlash(114, groundY - 10, 22, '#fff098', '#ffffff', true);
        return { phase: '不见刀 · 分身齐斩！', activeBtns: ['ult'] };
      }
      drawHero(146, groundY, { dir: -1, sheath: true });
      if (u < 0.92) {
        for (let k = 0; k < 4; k++) {
          const sx = 98 + ((k * 13) % 32), sy = groundY - 6 - ((k * 9) % 18);
          drawSlash(sx, sy, 10, '#ffd858', '#ffffff', k % 2 === 1);
          drawSparks(sx, sy, '#fff4a8', 8);
        }
      }
      return { phase: '归鞘连爆八刀！', activeBtns: [] };
    }

    // Boons, Arcana, Keepsakes — stylized trigger / elemental / altar demonstration!
    if (e.kind === 'boon') {
      const colHex = `#${(e.accentHex ?? 0xffc864).toString(16).padStart(6, '0')}`;
      const isBlood = /血|出血|流血/.test(e.effect + e.name);
      const isFrost = /寒|霜|冻/.test(e.effect + e.name);
      const isBolt = /雷|电/.test(e.effect + e.name);
      const isDart = e.target === 'special' || /镖|针/.test(e.effect);
      const hit = u > 0.36 && u < 0.82;
      drawFoe(124, groundY, { hurt: hit, bleed: isBlood && hit, frost: isFrost && hit, pins: isDart && hit ? 2 : 0 });
      drawHero(isDart ? 58 : 88, groundY, { swing: hit ? 2 : 0, aura: hit ? colHex : undefined });
      if (hit) {
        if (isBolt) { R(122, 8, 5, groundY - 8, '#ffe458'); R(123, 8, 3, groundY - 8, '#ffffff'); }
        else if (isDart) { R(68 + Math.round((u - 0.36) * 110), groundY - 14, 8, 2, colHex); }
        else drawSlash(116, groundY - 13, 18, colHex, '#ffffff');
        drawSparks(124, groundY - 13, colHex, 11);
      }
      return { phase: hit ? '秘传效果触发！' : '出招触发秘传', activeBtns: hit ? [e.target === 'hp' ? 'attack' : e.target] : [] };
    }

    // Arcana & Keepsakes: mystical jade/gold circle swirling around heroine
    const isArc = e.kind === 'arcana';
    const auraCol = isArc ? '#7cf0aa' : '#ffd868';
    const pulse = Math.round(Math.sin(time * 5) * 4);
    R(92 - 22 - pulse, groundY - 2, (22 + pulse) * 2, 3, auraCol);
    drawHero(92, groundY, { sheath: true, aura: auraCol });
    for (let i = 0; i < 4; i++) {
      const a = time * 2.4 + i * Math.PI * 0.5;
      const px = Math.round(92 + Math.cos(a) * 24), py = Math.round(groundY - 14 + Math.sin(a) * 10);
      R(px, py, 3, 3, i % 2 === 0 ? auraCol : '#ffffff');
    }
    return { phase: isArc ? '悟性牌入阵常驻生效' : '随身信物全程生效', activeBtns: [] };
  }
}
