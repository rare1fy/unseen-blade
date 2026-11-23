// 微信游戏圈硬边像素牌匾（UiLayer 渲染 + 原生 wx.createGameClubButton 透明热区精准贴合）
// 仅在微信环境（wx.createGameClubButton 可用）显示；严格适配铁器 / 漆器 / 竹简三套皮肤，
// 并在开始画面（避开标题菜单列）、据点和平态（精准避让右上胶囊）、暂停主界面（右下角）三处零打断呈现。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { makeCanvas } from '../../platform/index';
import {
  GAME_CLUB_CONFIG, gameClubSupported, syncGameClubButton, destroyGameClubButton,
  wxMenuButtonRect, wxWindowSafeArea, type GameClubRect,
} from '../../platform/gameClub';
import { drawPixelPlaque } from './uiPlate';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { SKIN } from './skin';
import { language, t as localize } from './i18n';
import { uiScale } from './uiScale';
import { cue } from '../../audio/cues';

export type GameClubPlacement =
  | { kind: 'none' }
  | { kind: 'title'; menuSide: 'left' | 'right' }
  | { kind: 'yard' }
  | { kind: 'pause' };

/** 9×9 硬边像素「江湖令旗 / 茶坊游戏圈」徽标（纯离散像素方块，零平滑矢量） */
const CLUB_GLYPH = [
  '..11111..',
  '.1222221.',
  '121121121',
  '122222221',
  '121222121',
  '.1222221.',
  '..11111..',
  '...121...',
  '..11111..',
];

function drawClubGlyph(g: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = Math.max(1, Math.floor(size / 9));
  const ox = Math.round(cx - (9 * s) / 2);
  const oy = Math.round(cy - (9 * s) / 2);
  const outline = '#09070c';
  const fill = SKIN.id === 'bamboo' ? '#e8d8a0' : SKIN.id === 'lacquer' ? '#ffdfa0' : '#ffe28a';
  const hi = '#fff8dc';
  for (let r = 0; r < 9; r++) {
    const row = CLUB_GLYPH[r];
    for (let c = 0; c < 9; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      g.fillStyle = ch === '1' ? outline : r <= 2 ? hi : fill;
      g.fillRect(ox + c * s, oy + r * s, s, s);
    }
  }
}

/** 计算给定场景模式下游戏圈按钮的逻辑像素矩形（自动避让安全区与微信右上胶囊） */
export function computeGameClubRect(
  placement: GameClubPlacement,
  W: number,
  H: number,
  badgeW: number,
  badgeH: number,
): GameClubRect | null {
  if (placement.kind === 'none' || W <= 0 || H <= 0) return null;
  const sa = wxWindowSafeArea(W, H);
  const padX = Math.max(12, Math.round(W * 0.016));
  const padY = Math.max(10, Math.round(H * 0.026));
  const w = Math.max(44, Math.round(badgeW));
  const h = Math.max(26, Math.round(badgeH));

  if (placement.kind === 'title') {
    // 开始画面：放在远离菜单列的左下角（默认雪夜破庙 ui='right'）或右下角（ui='left'）
    const left = placement.menuSide === 'right'
      ? Math.round(sa.left + padX)
      : Math.round(sa.right - padX - w);
    const top = Math.round(sa.bottom - padY - h);
    return { left, top, width: w, height: h };
  }

  if (placement.kind === 'pause') {
    // 暂停菜单主界面：牌匾列偏左，右下角完全空旷
    return {
      left: Math.round(sa.right - padX - w),
      top: Math.round(sa.bottom - padY - h),
      width: w,
      height: h,
    };
  }

  // 据点和平态：放在右上角，并智能避让微信原生胶囊（优先胶囊左侧垂直居中，空间紧时放胶囊正下方）
  const menu = wxMenuButtonRect();
  if (menu) {
    const leftOfCapsule = Math.round(menu.left - w - 10);
    if (leftOfCapsule > W * 0.55) {
      const cy = menu.top + menu.height / 2;
      const top = Math.max(Math.round(sa.top + 6), Math.round(cy - h / 2));
      return { left: leftOfCapsule, top, width: w, height: h };
    }
    return {
      left: Math.round(Math.min(sa.right - padX - w, menu.left + menu.width - w)),
      top: Math.round(menu.top + menu.height + 8),
      width: w,
      height: h,
    };
  }

  return {
    left: Math.round(sa.right - padX - w),
    top: Math.round(sa.top + padY),
    width: w,
    height: h,
  };
}

export class GameClubBadge {
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private tex: THREE.CanvasTexture | null = null;
  private key = '';
  private cssW = 92;
  private cssH = 40;
  private visible = false;

  constructor(private L: UiLayer) {
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 66;
    this.mesh.visible = false;
    L.text.scene.add(this.mesh);
  }

  private ensureVisual() {
    const dpr = Math.max(1, Math.round(this.L.dpr || 1));
    const kk = uiScale(this.L.w, this.L.h, 0.78, 2.2);
    const label = localize('游戏圈');
    const nextKey = `gc|${SKIN.id}|${label}|${kk.toFixed(2)}|${dpr}|${language}`;
    if (nextKey === this.key && this.tex) return;
    this.key = nextKey;

    const u = Math.max(1, Math.round(1.5 * kk * dpr));
    const pScale = Math.max(1, Math.round((17 * kk * dpr) / PIX_H));
    const tH = PIX_H * pScale;
    const tW = pixW(label) * pScale;
    const icoSz = Math.round(Math.max(15 * kk * dpr, tH * 1.05));
    const padX = Math.round(10 * kk * dpr);
    const padY = Math.round(7 * kk * dpr);
    const gap = Math.round(6 * kk * dpr);
    const minW = Math.round(Math.max(78 * kk, 64) * dpr);
    const minH = Math.round(Math.max(28 * kk, 26) * dpr);
    const W = Math.max(minW, padX * 2 + u * 2 + icoSz + gap + tW);
    const H = Math.max(minH, tH + padY * 2 + u * 2);

    const c = makeCanvas(W, H) as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;

    const accent = SKIN.id === 'lacquer' ? '#f0be58' : SKIN.id === 'bamboo' ? '#d8c07a' : '#d8a64c';
    drawPixelPlaque(g, 0, 0, W, H, u, { accent, rivets: true });

    const midY = Math.round(H / 2);
    const contentW = icoSz + gap + tW;
    let cx = Math.round((W - contentW) / 2);
    drawClubGlyph(g, cx + icoSz / 2, midY, icoSz);
    cx += icoSz + gap;
    drawPix(g, label, cx, Math.round(midY - tH / 2), {
      scale: pScale,
      color: '#fff2cc',
      outline: '#08060c',
      align: 'left',
    });

    this.tex?.dispose();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.tex = tex;
    this.mat.map = tex;
    this.mat.needsUpdate = true;
    this.cssW = W / dpr;
    this.cssH = H / dpr;
  }

  /** 每帧同步：决定显示/隐藏，并将原生 wx.createGameClubButton 严丝合缝盖在像素牌匾之上 */
  sync(placement: GameClubPlacement) {
    if (!gameClubSupported() || placement.kind === 'none') {
      this.hide();
      return;
    }

    if (GAME_CLUB_CONFIG.useNativeIcon) {
      this.mesh.visible = false;
      this.visible = false;
      const sz = Math.max(40, Math.round(42 * uiScale(this.L.w, this.L.h, 0.85, 1.5)));
      const rect = computeGameClubRect(placement, this.L.w, this.L.h, sz, sz);
      syncGameClubButton(rect, () => cue('select', 0.45));
      return;
    }

    this.ensureVisual();
    const rect = computeGameClubRect(placement, this.L.w, this.L.h, this.cssW, this.cssH);
    if (!rect) {
      this.hide();
      return;
    }

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // 保证微信原生按钮热区 ≥ 44×40 逻辑像素且以视觉牌匾为中心，绝不越界
    const hitW = Math.max(44, rect.width);
    const hitH = Math.max(40, rect.height);
    const hitRect: GameClubRect = {
      left: Math.max(0, Math.min(Math.round(this.L.w - hitW), Math.round(cx - hitW / 2))),
      top: Math.max(0, Math.min(Math.round(this.L.h - hitH), Math.round(cy - hitH / 2))),
      width: hitW,
      height: hitH,
    };
    const ok = syncGameClubButton(hitRect, () => cue('select', 0.45));
    if (!ok) {
      this.hide();
      return;
    }

    // L.text.scene orthographic camera maps x in [0, W], y in [-H, 0] (matching uiPlate.ts)
    this.mesh.position.set(Math.round(cx), -Math.round(cy), 0);
    this.mesh.scale.set(this.cssW, this.cssH, 1);
    this.mesh.visible = true;
    this.visible = true;
  }

  hide() {
    if (this.visible || this.mesh.visible) {
      this.mesh.visible = false;
      this.visible = false;
    }
    syncGameClubButton(null);
  }

  dispose() {
    this.hide();
    destroyGameClubButton();
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.tex?.dispose();
    this.mat.dispose();
  }
}
