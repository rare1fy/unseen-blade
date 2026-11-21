// act-136 统一硬边像素铁木铭牌体系（全分辨率 UiText 层渲染，横平竖直、零渐变雾感、兼容微信小游戏）：
// 用于全游戏场景头顶名牌、最近交互高亮牌、摊位货签、出口高札浮签、防遮挡秘藏浮标，以及选卡/据点界面的顶栏抬头、实体货币牌、页签与信物详情栏。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { makeCanvas } from '../../platform/index';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { bodyText, bodyW, BODY_FONT } from '../ui3d/bodyFont';
import { PAD, paintGlyph, glyphArt, GLYPH_H, paintKeyCap, keyCapWidth, KEYCAP_H, actKey, BIND } from './pad';
import { language, t as localize } from './i18n';

export type MiniIcon =
  | 'coin' | 'iron' | 'herb' | 'chest' | 'mythic' | 'scroll' | 'heal'
  | 'forge' | 'stele' | 'star' | 'starOff' | 'door' | 'leaf' | 'blade' | 'talk';

/** Draw crisp axis-aligned 9x9 pixel icon centered at (cx, cy) with block size u (device px). */
export function drawMiniIcon(g: CanvasRenderingContext2D, kind: MiniIcon, cx: number, cy: number, sz: number) {
  const u = Math.max(1, Math.round(sz / 9));
  const x0 = Math.round(cx - u * 4.5), y0 = Math.round(cy - u * 4.5);
  const R = (rx: number, ry: number, rw: number, rh: number, col: string) => {
    g.fillStyle = col; g.fillRect(x0 + rx * u, y0 + ry * u, rw * u, rh * u);
  };
  switch (kind) {
    case 'coin':
      R(1, 0, 7, 9, '#1a1008'); R(0, 1, 9, 7, '#1a1008');
      R(2, 1, 5, 7, '#e2a246'); R(1, 2, 7, 5, '#e2a246');
      R(2, 1, 5, 1, '#fff0a8');
      R(3, 3, 3, 3, '#3c240c');
      break;
    case 'iron':
      R(1, 4, 7, 4, '#14161c'); R(2, 2, 5, 3, '#14161c');
      R(1, 5, 7, 2, '#5a6274'); R(2, 3, 5, 2, '#a8b4c8');
      R(3, 2, 3, 1, '#dde6f4'); R(5, 3, 2, 2, '#ff9842');
      break;
    case 'herb':
      R(3, 5, 3, 4, '#0c2014'); R(1, 2, 7, 4, '#0c2014'); R(3, 0, 3, 3, '#0c2014');
      R(4, 5, 1, 3, '#2d7648');
      R(1, 3, 3, 2, '#66e494'); R(5, 3, 3, 2, '#66e494');
      R(3, 1, 3, 3, '#a8ffca'); R(4, 1, 1, 1, '#e8fff0');
      break;
    case 'chest':
    case 'mythic': {
      const body = kind === 'mythic' ? '#c83424' : '#8a3220';
      const rim = kind === 'mythic' ? '#ffe066' : '#e2b24a';
      const core = kind === 'mythic' ? '#fff4b8' : '#ffd878';
      R(0, 1, 9, 8, '#160d0a');
      R(1, 2, 7, 6, body);
      R(1, 2, 7, 1, rim); R(1, 4, 7, 1, rim); R(1, 2, 1, 6, rim); R(7, 2, 1, 6, rim);
      R(4, 4, 1, 2, core);
      break;
    }
    case 'scroll':
      R(0, 1, 9, 7, '#18110a');
      R(1, 2, 7, 5, '#d4b878'); R(1, 2, 7, 1, '#f2dfa8');
      R(0, 1, 1, 7, '#7a5224'); R(8, 1, 1, 7, '#7a5224');
      R(3, 2, 1, 5, '#a82c22'); R(6, 2, 1, 5, '#a82c22');
      break;
    case 'heal':
      R(2, 0, 5, 9, '#0c2416'); R(0, 2, 9, 5, '#0c2416');
      R(3, 1, 3, 7, '#66e494'); R(1, 3, 7, 3, '#66e494');
      R(3, 1, 3, 2, '#c8ffdc');
      break;
    case 'forge':
      R(1, 1, 5, 3, '#161418'); R(2, 2, 3, 1, '#e8b060');
      R(3, 4, 1, 3, '#9a6e38');
      R(0, 6, 9, 3, '#161418'); R(1, 7, 7, 1, '#9aa4b4');
      break;
    case 'stele':
      R(2, 0, 5, 2, '#14121c'); R(1, 2, 7, 7, '#14121c');
      R(2, 2, 5, 6, '#7a7e92'); R(3, 1, 3, 1, '#b8a0ff');
      R(4, 3, 1, 4, '#242030');
      break;
    case 'star':
      R(4, 0, 1, 9, '#ffe27a'); R(0, 4, 9, 1, '#ffe27a');
      R(3, 2, 3, 5, '#ffc848'); R(2, 3, 5, 3, '#ffc848');
      R(4, 3, 1, 2, '#fff8d4');
      break;
    case 'starOff':
      R(4, 1, 1, 7, '#5c5864'); R(1, 4, 7, 1, '#5c5864');
      R(3, 3, 3, 3, '#44404c');
      break;
    case 'door':
      R(1, 0, 7, 9, '#16110c');
      R(2, 1, 5, 7, '#7a542e'); R(3, 2, 3, 6, '#ffd27a');
      R(4, 3, 1, 4, '#fff6cc');
      break;
    case 'leaf':
      R(2, 1, 5, 6, '#122416'); R(3, 2, 3, 4, '#78e898');
      R(4, 1, 2, 2, '#c8ffd8'); R(4, 6, 1, 2, '#3c7a4c');
      break;
    case 'blade':
      R(4, 0, 1, 6, '#e8eef8'); R(3, 1, 1, 4, '#9aa6b8');
      R(2, 6, 5, 1, '#d8a248'); R(4, 7, 1, 2, '#b83228');
      break;
    case 'talk':
      R(1, 1, 7, 6, '#14121a'); R(2, 2, 5, 4, '#f2e8d6');
      R(3, 3, 1, 1, '#262028'); R(5, 3, 1, 1, '#262028');
      R(2, 7, 2, 1, '#f2e8d6');
      break;
  }
}

/** Paint a hard-stepped pixel iron/lacquer plaque (zero smooth gradients, strictly axis-aligned). */
export function drawPixelPlaque(
  g: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  p: number,
  o: { bg?: string; hi?: string; border?: string; inner?: string; accent?: string; rivets?: boolean; accentBar?: string } = {},
) {
  const X = Math.round(x), Y = Math.round(y), W = Math.round(w), H = Math.round(h), u = Math.max(1, Math.round(p));
  const outer = o.border ?? '#0a080d';
  const inner = o.inner ?? '#8c7248';
  const bg = o.bg ?? '#15121b';
  const hi = o.hi ?? '#252030';
  // outer silhouette with 1-step notched corners
  g.fillStyle = outer;
  g.fillRect(X + u, Y, W - 2 * u, H);
  g.fillRect(X, Y + u, W, H - 2 * u);
  // metal inner rim
  g.fillStyle = inner;
  g.fillRect(X + u * 2, Y + u, W - 4 * u, H - 2 * u);
  g.fillRect(X + u, Y + u * 2, W - 2 * u, H - 4 * u);
  // dark lacquer core
  g.fillStyle = bg;
  g.fillRect(X + u * 2, Y + u * 2, W - 4 * u, H - 4 * u);
  // crisp top highlight band (1 unit)
  if (H > u * 7) {
    g.fillStyle = hi;
    g.fillRect(X + u * 2, Y + u * 2, W - 4 * u, u);
  }
  // optional left vertical accent stripe
  if (o.accentBar) {
    g.fillStyle = o.accentBar;
    g.fillRect(X + u * 2, Y + u * 2, u * 2, H - 4 * u);
  }
  // optional 4 corner bronze rivets
  if (o.rivets && W > u * 12 && H > u * 10) {
    g.fillStyle = o.accent ?? '#d29e4c';
    for (const [rx, ry] of [
      [X + u * 3, Y + u * 3],
      [X + W - u * 4, Y + u * 3],
      [X + u * 3, Y + H - u * 4],
      [X + W - u * 4, Y + H - u * 4],
    ]) g.fillRect(rx, ry, u, u);
  }
}

/** Paint either a gamepad button glyph or a crisp keyboard keycap for an action, returning drawn width in device px. */
export function drawActionBadge(g: CanvasRenderingContext2D, kind: 'attack' | 'alt' | 'tab' | 'esc', x: number, cy: number, targetH: number): number {
  const dev = PAD.device;
  if (dev === 'touch') return 0;
  if (dev === 'pad') {
    const idx = kind === 'attack' ? BIND.pad.attack[0] : kind === 'alt' ? 3 : kind === 'tab' ? 4 : 1;
    const gs = Math.max(1, Math.round(targetH / GLYPH_H));
    const aw = glyphArt(idx).w * gs;
    paintGlyph(g, idx, Math.round(x), Math.round(cy - (GLYPH_H * gs) / 2), gs);
    return aw;
  }
  const label = kind === 'attack' ? actKey('attack') : kind === 'alt' ? 'Q' : kind === 'tab' ? 'TAB' : 'ESC';
  const ks = Math.max(1, Math.round(targetH / KEYCAP_H));
  const res = paintKeyCap(g, label, Math.round(x), Math.round(cy - (KEYCAP_H * ks) / 2), ks, kind === 'attack');
  return res.w;
}

export function measureActionBadge(kind: 'attack' | 'alt' | 'tab' | 'esc', targetH: number): number {
  const dev = PAD.device;
  if (dev === 'touch') return 0;
  if (dev === 'pad') {
    const idx = kind === 'attack' ? BIND.pad.attack[0] : kind === 'alt' ? 3 : kind === 'tab' ? 4 : 1;
    const gs = Math.max(1, Math.round(targetH / GLYPH_H));
    return glyphArt(idx).w * gs;
  }
  const label = kind === 'attack' ? actKey('attack') : kind === 'alt' ? 'Q' : kind === 'tab' ? 'TAB' : 'ESC';
  const ks = Math.max(1, Math.round(targetH / KEYCAP_H));
  return keyCapWidth(label) * ks;
}

interface PlateSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.CanvasTexture | null;
  key: string;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface TagSpec {
  x: number;
  y: number;
  text: string;
  sub?: string;
  color?: string;
  accent?: string;
  icon?: MiniIcon;
  price?: number;
  poor?: boolean;
  scale?: number;
  minY?: number;
  maxY?: number;
  visible?: boolean;
  order?: number;
}

export interface InteractSpec {
  x: number;
  y: number;
  title: string;
  sub?: string;
  action?: string;
  color?: string;
  accent?: string;
  icon?: MiniIcon;
  price?: number;
  poor?: boolean;
  disabled?: boolean;
  showKey?: boolean;
  minY?: number;
  visible?: boolean;
  order?: number;
}

export interface HeaderSpec {
  x: number;
  y: number;
  title: string;
  sub?: string;
  color?: string;
  accent?: string;
  visible?: boolean;
}

export interface WalletSpec {
  x: number;
  y: number;
  coins?: number;
  iron?: number;
  herb?: number;
  focus?: 'coins' | 'iron' | 'herb';
  visible?: boolean;
}

export interface DetailSpec {
  x: number;
  y: number;
  w: number;
  title: string;
  badge?: string;
  badgeCol?: string;
  stars?: number;
  starsMax?: number;
  line1: string;
  line2?: string;
  action?: string;
  accent?: string;
  visible?: boolean;
}

export interface TabRect { id: string; x: number; y: number; w: number; h: number }

export class UiPlatePool {
  private slots = new Map<string, PlateSlot>();
  constructor(private L: UiLayer) {}

  private slot(key: string, order = 48): PlateSlot {
    let s = this.slots.get(key);
    if (!s) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.renderOrder = order;
      mesh.visible = false;
      this.L.text.scene.add(mesh);
      s = { mesh, mat, tex: null, key: '', w: 1, h: 1, cx: 0, cy: 0 };
      this.slots.set(key, s);
    } else if (s.mesh.renderOrder !== order) {
      s.mesh.renderOrder = order;
    }
    return s;
  }

  private upload(s: PlateSlot, c: HTMLCanvasElement, dpr: number, linear = false) {
    s.tex?.dispose();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.magFilter = tex.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
    s.tex = tex;
    s.mat.map = tex;
    s.mat.needsUpdate = true;
    s.w = c.width / dpr;
    s.h = c.height / dpr;
  }

  private place(s: PlateSlot, cx: number, cy: number, visible: boolean, alpha = 1, clamp = true, minY = 6, maxY?: number) {
    const L = this.L;
    let x = cx, y = cy;
    if (clamp) {
      x = Math.min(L.w - s.w / 2 - 8, Math.max(s.w / 2 + 8, x));
      const lo = Math.max(6, minY) + s.h / 2;
      const hi = (maxY ?? (L.h - 8)) - s.h / 2;
      y = hi >= lo ? Math.min(hi, Math.max(lo, y)) : lo;
    }
    s.cx = x; s.cy = y;
    s.mesh.scale.set(s.w, s.h, 1);
    s.mesh.position.set(Math.round(x), -Math.round(y), 0);
    s.mat.opacity = alpha;
    s.mesh.visible = visible && alpha > 0.01 && !!s.tex;
  }

  /** Compact 1-line world-space pixel plaque (overhead NPC name, shop price tag, exit route board, occluded treasure marker). */
  setTag(key: string, spec: TagSpec) {
    const s = this.slot(key, spec.order ?? 46);
    if (spec.visible === false || !spec.text) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = Math.max(0.82, Math.min(1.18, this.L.h / 720)) * (spec.scale ?? 1);
    const title = localize(spec.text);
    const sub = spec.sub ? localize(spec.sub) : '';
    const hasPrice = (spec.price ?? 0) > 0;
    const pKey = `tag|${title}|${sub}|${spec.color ?? ''}|${spec.accent ?? ''}|${spec.icon ?? ''}|${spec.price ?? 0}|${spec.poor ? 1 : 0}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(1.5 * dpr));
      const pScale = Math.max(1, Math.round((15.5 * kk * dpr) / PIX_H));
      const txtH = PIX_H * pScale;
      const subPx = Math.round(13.5 * kk * dpr);
      const icoSz = spec.icon ? Math.round(txtH * 0.92) : 0;
      const padX = Math.round(9 * kk * dpr), padY = Math.round(5 * kk * dpr), gap = Math.round(6 * kk * dpr);
      const tw = pixW(title) * pScale;
      const sw = sub ? Math.ceil(bodyW(sub, subPx)) : 0;
      const priceTxt = hasPrice ? `${spec.price}` : '';
      const coinSz = hasPrice ? Math.round(txtH * 0.85) : 0;
      const pw = hasPrice ? coinSz + Math.round(3 * dpr) + pixW(priceTxt) * pScale : 0;
      let W = padX * 2 + u * 2 + tw;
      if (icoSz) W += icoSz + gap;
      if (sw) W += gap + Math.round(4 * dpr) + sw;
      if (pw) W += gap + Math.round(4 * dpr) + pw;
      const H = Math.max(txtH, subPx, icoSz) + padY * 2 + u * 2;
      const c = makeCanvas(Math.max(8, Math.ceil(W)), Math.max(8, Math.ceil(H))) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      const rimCol = spec.poor ? '#9c362c' : (spec.accent ?? '#9a7a4a');
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        bg: '#15121c', hi: '#262132', border: '#08060b', inner: rimCol, accentBar: spec.accent ?? rimCol,
      });
      let cx = padX + u * 3;
      const midY = c.height / 2;
      if (spec.icon) {
        drawMiniIcon(g, spec.icon, cx + icoSz / 2, midY, icoSz);
        cx += icoSz + gap;
      }
      drawPix(g, title, cx, Math.round(midY - txtH / 2), { scale: pScale, color: spec.color ?? '#f4ecd8', outline: '#09070c', align: 'left' });
      cx += tw;
      if (sub) {
        cx += gap;
        g.fillStyle = '#5c5266';
        g.fillRect(Math.round(cx), Math.round(midY - txtH * 0.34), Math.max(1, Math.round(1.5 * dpr)), Math.round(txtH * 0.68));
        cx += Math.round(5 * dpr);
        bodyText(g, sub, cx, Math.round(midY - subPx * 0.54), subPx, '#d4cab6', 'left', '#09070c');
        cx += sw;
      }
      if (hasPrice) {
        cx += gap;
        g.fillStyle = '#5c5266';
        g.fillRect(Math.round(cx), Math.round(midY - txtH * 0.34), Math.max(1, Math.round(1.5 * dpr)), Math.round(txtH * 0.68));
        cx += Math.round(5 * dpr);
        drawMiniIcon(g, 'coin', cx + coinSz / 2, midY, coinSz);
        cx += coinSz + Math.round(3 * dpr);
        drawPix(g, priceTxt, cx, Math.round(midY - txtH / 2), { scale: pScale, color: spec.poor ? '#ff7c6a' : '#ffd872', outline: '#09070c', align: 'left' });
      }
      this.upload(s, c, dpr, BODY_FONT.current !== 'pixel' && !!sub);
    }
    this.place(s, spec.x, spec.y, true, 1, true, spec.minY ?? 8, spec.maxY);
  }

  /** Highlighted interactive plaque for the nearest NPC / shop stall / campfire / garden / monument. */
  setInteract(key: string, spec: InteractSpec) {
    const s = this.slot(key, spec.order ?? 49);
    if (spec.visible === false || !spec.title) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = Math.max(0.84, Math.min(1.2, this.L.h / 720));
    const title = localize(spec.title);
    const sub = spec.sub ? localize(spec.sub) : '';
    const action = spec.action ? localize(spec.action) : '';
    const hasPrice = (spec.price ?? 0) > 0;
    const showKey = spec.showKey !== false && !spec.poor && !spec.disabled;
    const pKey = `int|${title}|${sub}|${action}|${spec.color ?? ''}|${spec.accent ?? ''}|${spec.icon ?? ''}|${spec.price ?? 0}|${spec.poor ? 1 : 0}|${spec.disabled ? 1 : 0}|${showKey ? 1 : 0}|${PAD.device}|${PAD.family}|${actKey('attack')}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(2 * dpr));
      const tScale = Math.max(1, Math.round((18 * kk * dpr) / PIX_H));
      const tH = PIX_H * tScale;
      const subPx = Math.round(15 * kk * dpr);
      const actScale = Math.max(1, Math.round((14.5 * kk * dpr) / PIX_H));
      const actH = PIX_H * actScale;
      const padX = Math.round(12 * kk * dpr), padY = Math.round(8 * kk * dpr), gap = Math.round(7 * kk * dpr);
      const icoSz = spec.icon ? Math.round(tH * 1.0) : 0;
      const tw = pixW(title) * tScale;
      const priceTxt = hasPrice ? `${spec.price}` : '';
      const coinSz = hasPrice ? Math.round(tH * 0.9) : 0;
      const priceW = hasPrice ? coinSz + Math.round(4 * dpr) + pixW(priceTxt) * tScale + Math.round(10 * dpr) : 0;
      const row1W = (icoSz ? icoSz + gap : 0) + tw + priceW;
      const row2W = sub ? Math.ceil(bodyW(sub, subPx)) : 0;
      const badgeH = Math.round(Math.max(actH * 1.15, 18 * kk * dpr));
      const keyW = showKey ? measureActionBadge('attack', badgeH) : 0;
      const actW = action ? (keyW ? keyW + Math.round(6 * dpr) : 0) + pixW(action) * actScale : 0;
      const innerW = Math.max(row1W, row2W, actW, Math.round(130 * kk * dpr));
      const W = innerW + padX * 2 + u * 2;
      let H = padY * 2 + u * 2 + Math.max(tH, icoSz);
      if (sub) H += Math.round(6 * kk * dpr) + Math.ceil(subPx * 1.25);
      if (action) H += Math.round(8 * kk * dpr) + Math.max(actH, badgeH) + Math.round(4 * dpr);
      const c = makeCanvas(Math.ceil(W), Math.ceil(H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      const rim = spec.poor ? '#c44032' : spec.disabled ? '#5c5a64' : (spec.accent ?? '#d8a64e');
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        bg: '#14111a', hi: '#2a2436', border: '#07050a', inner: rim, accent: rim, rivets: true,
      });
      // Row 1: Icon + Title (left) & Price (right)
      let cy = padY + u;
      let cx = padX + u;
      const r1H = Math.max(tH, icoSz);
      if (spec.icon) {
        drawMiniIcon(g, spec.icon, cx + icoSz / 2, cy + r1H / 2, icoSz);
        cx += icoSz + gap;
      }
      drawPix(g, title, cx, Math.round(cy + (r1H - tH) / 2), { scale: tScale, color: spec.disabled ? '#b0a8a0' : (spec.color ?? '#fff2cc'), outline: '#08060c', align: 'left' });
      if (hasPrice) {
        const pxEnd = c.width - padX - u;
        const pTxtW = pixW(priceTxt) * tScale;
        drawPix(g, priceTxt, pxEnd, Math.round(cy + (r1H - tH) / 2), { scale: tScale, color: spec.poor ? '#ff7c6a' : '#ffd872', outline: '#08060c', align: 'right' });
        drawMiniIcon(g, 'coin', pxEnd - pTxtW - Math.round(4 * dpr) - coinSz / 2, cy + r1H / 2, coinSz);
      }
      cy += r1H;
      // Row 2: Description / Effect
      if (sub) {
        cy += Math.round(6 * kk * dpr);
        bodyText(g, sub, padX + u, cy, subPx, spec.poor ? '#ffaba0' : spec.disabled ? '#a49ea8' : '#e6dcc8', 'left', '#08060c');
        cy += Math.ceil(subPx * 1.25);
      }
      // Row 3: Action bar with crisp divider & keycap
      if (action) {
        cy += Math.round(5 * kk * dpr);
        g.fillStyle = '#383044';
        g.fillRect(padX + u, cy, c.width - (padX + u) * 2, Math.max(1, Math.round(dpr)));
        cy += Math.round(5 * kk * dpr);
        const r3H = Math.max(actH, badgeH);
        const r3Mid = cy + r3H / 2;
        let ax = Math.round((c.width - actW) / 2);
        if (showKey && keyW > 0) {
          ax += drawActionBadge(g, 'attack', ax, r3Mid, badgeH) + Math.round(6 * dpr);
        }
        const actCol = spec.poor ? '#ff8272' : spec.disabled ? '#9c96a0' : '#ffe290';
        drawPix(g, action, ax, Math.round(r3Mid - actH / 2), { scale: actScale, color: actCol, outline: '#08060c', align: 'left' });
      }
      this.upload(s, c, dpr, BODY_FONT.current !== 'pixel' && !!sub);
    }
    this.place(s, spec.x, spec.y, true, 1, true, spec.minY ?? 10);
  }

  /** Dark-iron centered header plaque for CardPick3D screens (title + optional subtitle). */
  setHeader(key: string, spec: HeaderSpec) {
    const s = this.slot(key, 52);
    if (spec.visible === false || !spec.title) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = Math.max(0.8, Math.min(1.2, this.L.h / 720));
    const title = localize(spec.title);
    const sub = spec.sub ? localize(spec.sub) : '';
    const pKey = `hdr|${title}|${sub}|${spec.color ?? ''}|${spec.accent ?? ''}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(2 * dpr));
      const tScale = Math.max(1, Math.round((24 * kk * dpr) / PIX_H));
      const tH = PIX_H * tScale;
      const subPx = Math.round(14.5 * kk * dpr);
      const tw = pixW(title) * tScale;
      const sw = sub ? Math.ceil(bodyW(sub, subPx)) : 0;
      const padX = Math.round(22 * kk * dpr), padY = Math.round(9 * kk * dpr);
      const W = Math.max(tw, sw, Math.round(240 * kk * dpr)) + padX * 2 + u * 2;
      const H = padY * 2 + u * 2 + tH + (sub ? Math.round(6 * kk * dpr) + Math.ceil(subPx * 1.25) : 0);
      const c = makeCanvas(Math.ceil(W), Math.ceil(H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        bg: '#16131c', hi: '#2a2436', border: '#07050a', inner: spec.accent ?? '#b88e4a', accent: spec.color ?? '#ffd888', rivets: true,
      });
      const topY = padY + u;
      drawPix(g, title, c.width / 2, topY, { scale: tScale, color: spec.color ?? '#ffe6b0', outline: '#08060c', align: 'center' });
      if (sub) {
        bodyText(g, sub, c.width / 2, topY + tH + Math.round(6 * kk * dpr), subPx, '#d8ceb8', 'center', '#08060c');
      }
      this.upload(s, c, dpr, BODY_FONT.current !== 'pixel' && !!sub);
    }
    this.place(s, spec.x, spec.y, true, 1, true, 6);
  }

  /** Top-right dark-iron currency bar with crisp pixel icons (coins / iron / herb). */
  setWallet(key: string, spec: WalletSpec) {
    const s = this.slot(key, 52);
    if (spec.visible === false) { s.mesh.visible = false; return; }
    const items: Array<{ icon: MiniIcon; label: string; val: number; col: string; hot: boolean }> = [];
    if (spec.coins != null) items.push({ icon: 'coin', label: '铜钱', val: spec.coins, col: '#ffd872', hot: spec.focus === 'coins' });
    if (spec.iron != null) items.push({ icon: 'iron', label: '残铁', val: spec.iron, col: '#f2cc92', hot: spec.focus === 'iron' });
    if (spec.herb != null) items.push({ icon: 'herb', label: '药引', val: spec.herb, col: '#98f4b8', hot: spec.focus === 'herb' });
    if (!items.length) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = Math.max(0.8, Math.min(1.2, this.L.h / 720));
    const pKey = `wal|${items.map(i => `${i.icon}:${i.val}:${i.hot ? 1 : 0}`).join(',')}|${kk.toFixed(2)}|${dpr}|${language}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(2 * dpr));
      const pScale = Math.max(1, Math.round((16.5 * kk * dpr) / PIX_H));
      const tH = PIX_H * pScale;
      const icoSz = Math.round(tH * 1.02);
      const padX = Math.round(12 * kk * dpr), padY = Math.round(7 * kk * dpr), segGap = Math.round(16 * kk * dpr), iGap = Math.round(5 * kk * dpr);
      const segs = items.map(it => {
        const txt = `${localize(it.label)} ${it.val}`;
        return { ...it, txt, w: icoSz + iGap + pixW(txt) * pScale };
      });
      const totalW = segs.reduce((a, b, idx) => a + b.w + (idx ? segGap : 0), 0);
      const W = totalW + padX * 2 + u * 2;
      const H = Math.max(tH, icoSz) + padY * 2 + u * 2;
      const c = makeCanvas(Math.ceil(W), Math.ceil(H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        bg: '#15121b', hi: '#272233', border: '#07050a', inner: '#a48248', accent: '#ffd888', rivets: true,
      });
      let cx = padX + u;
      const midY = c.height / 2;
      segs.forEach((sg, idx) => {
        if (idx > 0) {
          g.fillStyle = '#40384e';
          g.fillRect(Math.round(cx - segGap / 2), Math.round(padY + u), Math.max(1, Math.round(dpr)), Math.round(c.height - (padY + u) * 2));
        }
        drawMiniIcon(g, sg.icon, cx + icoSz / 2, midY, icoSz);
        drawPix(g, sg.txt, cx + icoSz + iGap, Math.round(midY - tH / 2), { scale: pScale, color: sg.hot ? '#fff6c8' : sg.col, outline: '#08060c', align: 'left' });
        cx += sg.w + segGap;
      });
      this.upload(s, c, dpr, false);
    }
    // right-aligned anchor at spec.x
    this.place(s, spec.x - s.w / 2, spec.y, true, 1, true, 6);
  }

  /** Interactive horizontal tab bar (e.g. 铁炉强化 | 名刀淬炼). Returns hit rects in CSS px. */
  setTabs(key: string, tabs: Array<{ id: string; label: string; badge?: boolean }>, activeIdx: number, cx: number, cy: number): TabRect[] {
    const s = this.slot(key, 52);
    if (!tabs.length) { s.mesh.visible = false; return []; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = Math.max(0.8, Math.min(1.2, this.L.h / 720));
    const pKey = `tabs|${tabs.map(t => `${t.id}:${localize(t.label)}:${t.badge ? 1 : 0}`).join('|')}|${activeIdx}|${PAD.device}|${kk.toFixed(2)}|${dpr}|${language}`;
    const u = Math.max(1, Math.round(2 * dpr));
    const pScale = Math.max(1, Math.round((16.5 * kk * dpr) / PIX_H));
    const tH = PIX_H * pScale;
    const tabPadX = Math.round(18 * kk * dpr), tabGap = Math.round(10 * kk * dpr), padY = Math.round(7 * kk * dpr);
    const widths = tabs.map(t => Math.max(Math.round(124 * kk * dpr), pixW(localize(t.label)) * pScale + tabPadX * 2 + (t.badge ? Math.round(12 * dpr) : 0)));
    const totalW = widths.reduce((a, b, idx) => a + b + (idx ? tabGap : 0), 0);
    const H = tH + padY * 2 + u * 2;
    if (pKey !== s.key) {
      s.key = pKey;
      const c = makeCanvas(Math.ceil(totalW), Math.ceil(H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      let tx = 0;
      tabs.forEach((tb, i) => {
        const w = widths[i], on = i === activeIdx;
        drawPixelPlaque(g, tx, 0, w, H, u, {
          bg: on ? '#2c2116' : '#15121b',
          hi: on ? '#4a3620' : '#221d2b',
          border: '#07050a',
          inner: on ? '#f0be64' : '#585262',
          accent: on ? '#ffe28a' : '#7a7284',
          rivets: on,
        });
        const lbl = localize(tb.label);
        drawPix(g, lbl, tx + w / 2, Math.round((H - tH) / 2), { scale: pScale, color: on ? '#fff2c4' : '#b8b0a4', outline: '#08060c', align: 'center' });
        if (tb.badge) {
          const bx = Math.round(tx + w - u * 4 - 4 * dpr), by = Math.round(u * 3 + 2 * dpr), bs = Math.max(4, Math.round(5 * dpr));
          g.fillStyle = '#08060c'; g.fillRect(bx - dpr, by - dpr, bs + 2 * dpr, bs + 2 * dpr);
          g.fillStyle = '#ffd258'; g.fillRect(bx, by, bs, bs);
        }
        tx += w + tabGap;
      });
      this.upload(s, c, dpr, false);
    }
    this.place(s, cx, cy, true, 1, true, 6);
    const left0 = s.cx - s.w / 2;
    const rects: TabRect[] = [];
    let rx = 0;
    tabs.forEach((tb, i) => {
      const wCss = widths[i] / dpr;
      rects.push({ id: tb.id, x: left0 + rx, y: s.cy - s.h / 2, w: wCss, h: s.h });
      rx += wCss + tabGap / dpr;
    });
    return rects;
  }

  /** Large bottom iron-bronze detail plaque (used for the 4x2 Keepsake showcase). */
  setDetail(key: string, spec: DetailSpec) {
    const s = this.slot(key, 51);
    if (spec.visible === false || !spec.title) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = Math.max(0.8, Math.min(1.2, this.L.h / 720));
    const title = localize(spec.title);
    const badge = spec.badge ? localize(spec.badge) : '';
    const l1 = localize(spec.line1);
    const l2 = spec.line2 ? localize(spec.line2) : '';
    const act = spec.action ? localize(spec.action) : '';
    const pKey = `det|${Math.round(spec.w)}|${title}|${badge}|${spec.badgeCol ?? ''}|${spec.stars ?? 0}/${spec.starsMax ?? 0}|${l1}|${l2}|${act}|${spec.accent ?? ''}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(2 * dpr));
      const W = Math.round(spec.w * dpr);
      const tScale = Math.max(1, Math.round((20 * kk * dpr) / PIX_H));
      const tH = PIX_H * tScale;
      const bScale = Math.max(1, Math.round((13.5 * kk * dpr) / PIX_H));
      const bH = PIX_H * bScale;
      const f1 = Math.round(18 * kk * dpr), f2 = Math.round(14.5 * kk * dpr);
      const padX = Math.round(18 * kk * dpr), padY = Math.round(11 * kk * dpr);
      const H = padY * 2 + u * 2 + tH + Math.round(8 * kk * dpr) + Math.ceil(f1 * 1.35) + (l2 || act ? Math.round(4 * kk * dpr) + Math.ceil(f2 * 1.3) : 0);
      const c = makeCanvas(Math.max(16, W), Math.max(16, H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        bg: '#15121c', hi: '#2a2438', border: '#07050a', inner: spec.accent ?? '#c4984e', accent: spec.accent ?? '#ffd888', rivets: true,
      });
      const x0 = padX + u;
      let y = padY + u;
      // Row 1: Title + Badge + Stars on right
      drawPix(g, title, x0, y, { scale: tScale, color: '#fff2cc', outline: '#08060c', align: 'left' });
      let tx = x0 + pixW(title) * tScale + Math.round(12 * dpr);
      if (badge) {
        const bw = pixW(badge) * bScale + Math.round(12 * dpr), bh = bH + Math.round(6 * dpr);
        const by = Math.round(y + (tH - bh) / 2);
        const bc = spec.badgeCol ?? '#ffd878';
        g.fillStyle = bc; g.fillRect(tx, by, bw, bh);
        g.fillStyle = '#120e16'; g.fillRect(tx + dpr, by + dpr, bw - 2 * dpr, bh - 2 * dpr);
        drawPix(g, badge, tx + Math.round(6 * dpr), by + Math.round(3 * dpr), { scale: bScale, color: bc, outline: null, align: 'left' });
        tx += bw + Math.round(10 * dpr);
      }
      if ((spec.starsMax ?? 0) > 0) {
        const stSz = Math.round(tH * 0.9), stGap = Math.round(4 * dpr);
        let sx = c.width - padX - u - stSz / 2;
        for (let i = (spec.starsMax ?? 3) - 1; i >= 0; i--) {
          drawMiniIcon(g, i < (spec.stars ?? 0) ? 'star' : 'starOff', sx, y + tH / 2, stSz);
          sx -= stSz + stGap;
        }
      }
      // Row 2: Main Effect (auto-shrink if very long)
      y += tH + Math.round(8 * kk * dpr);
      const maxTextW = c.width - (padX + u) * 2;
      let p1 = f1;
      while (p1 > Math.round(11 * dpr) && bodyW(l1, p1) > maxTextW) p1 -= 1;
      bodyText(g, l1, x0, y, p1, '#f4ebd8', 'left', '#08060c');
      // Row 3: Progress / Source (left) & Action hint (right)
      if (l2 || act) {
        y += Math.ceil(f1 * 1.35) + Math.round(4 * kk * dpr);
        if (l2) bodyText(g, l2, x0, y, f2, '#bcb4a4', 'left', '#08060c');
        if (act) bodyText(g, act, c.width - padX - u, y, f2, '#ffe08a', 'right', '#08060c');
      }
      this.upload(s, c, dpr, BODY_FONT.current !== 'pixel');
    }
    this.place(s, spec.x, spec.y, true, 1, true, 6);
  }

  /** Compact dark-iron footer bar for navigation hints. */
  setFooter(key: string, text: string, cx: number, cy: number, visible = true) {
    const s = this.slot(key, 52);
    if (!visible || !text) { s.mesh.visible = false; return; }
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = Math.max(0.8, Math.min(1.2, this.L.h / 720));
    const txt = localize(text);
    const pKey = `ftr|${txt}|${kk.toFixed(2)}|${dpr}|${language}|${BODY_FONT.version}`;
    if (pKey !== s.key) {
      s.key = pKey;
      const u = Math.max(1, Math.round(1.5 * dpr));
      const fpx = Math.round(14 * kk * dpr);
      const tw = Math.ceil(bodyW(txt, fpx));
      const padX = Math.round(14 * kk * dpr), padY = Math.round(5 * kk * dpr);
      const W = tw + padX * 2 + u * 2;
      const H = Math.ceil(fpx * 1.3) + padY * 2 + u * 2;
      const c = makeCanvas(Math.max(8, W), Math.max(8, H)) as HTMLCanvasElement;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
      drawPixelPlaque(g, 0, 0, c.width, c.height, u, {
        bg: '#131018', hi: '#221d2c', border: '#07050a', inner: '#6e5c40',
      });
      bodyText(g, txt, c.width / 2, Math.round((c.height - fpx * 1.15) / 2), fpx, '#ded4c0', 'center', '#08060c');
      this.upload(s, c, dpr, BODY_FONT.current !== 'pixel');
    }
    this.place(s, cx, cy, true, 1, true, 6);
  }

  hide(key: string) {
    const s = this.slots.get(key);
    if (s) s.mesh.visible = false;
  }

  hidePrefix(prefix: string) {
    for (const [k, s] of this.slots) if (k.startsWith(prefix)) s.mesh.visible = false;
  }

  clear() {
    for (const s of this.slots.values()) {
      s.mesh.parent?.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.tex?.dispose();
      s.mat.dispose();
    }
    this.slots.clear();
  }
}
