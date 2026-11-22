// act-36 / act-136: 3D iron plaques, bamboo scrolls, carved steles, and 4×2 keepsake trays in the UI layer,
// paired with full-resolution hard-edged pixel plaques (uiPlate.ts) for header, wallet, tabs, detail panel, and footer.
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { clock } from '../engine/clock';
import { cue } from '../../audio/cues';
import { TIER_NAMES, type Archetype, type Boon, type BoonPick } from './boons';
import {
  cardBoard, glyphIcon3D, weaponUiModel,
  paintFace, paintKeepsakeFace, paintWeaponStandFace, paintShopTagFace, paintWorkRowFace, paintSteleFace, paintArcanaFace,
  boardLayout, scrollLayout, steleLayout, keepsakeLayout, weaponLayout, shopLayout, workRowLayout, arcanaLayout,
  CARD_H, SKILL_H, type CardStyle,
} from './cardBoard';
import { UiPlatePool, type DetailSpec, type WorkbenchSpec, type GraspBarSpec, type TabRect } from './uiPlate';
import type { WeaponId } from './weapons';
import { onBodyFontChange } from '../ui3d/bodyFont';
import { language, msg, t as localize } from './i18n';
import { fillVals } from './cards';
import { itemModel, itemForCard } from './itemModels';
import type { Model3D } from '../ui3d/models3d';
import { makeCanvas } from '../../platform/index';
import { drawPix, pixW, PIX_H } from '../v2/pix';
import { backShield, type MiniShield } from './btnBadge';
import { entryOfCard, layoutPresses, paintSeps, pressShields, paintName, paintEffect, paintNum, type SkillEntry, type PressItem } from './skillFace';
import { skillIcon3D } from './skillIcons';
import type { MarkTarget } from './skillInfo';
import { PAD, padName } from './pad';
import { uiScale } from './uiScale';

export type CardBoon = Boon & {
  tag?: string;
  locked?: boolean;
  altBadge?: string;
  ksInfo?: { shortName: string; stars: number; unlocked: boolean; equipped: boolean };
  wepInfo?: { id: WeaponId; name: string; lv: number; unlocked: boolean; equipped: boolean };
  shopInfo?: { name: string; effect: string; price: number; poor: boolean; disabled?: boolean; note?: string };
  workInfo?: { name: string; lv: number; maxLv: number; cost: number | null; have?: number; cur: 'iron' | 'herb'; canAfford: boolean; unlocked?: boolean; theme: 'forge' | 'medic'; weaponId?: WeaponId };
  steleInfo?: { name: string; yin: boolean; lv: number; effect: string; cost: number | null; have: number; cur: 'iron' | 'herb'; altName: string; altBadge: string };
  arcanaInfo?: { short: string; grasp: number; rank: number; active: boolean; unlockCost: number; have?: number; canUnlock: boolean; awakening?: boolean };
};

export interface CardOpenOpts {
  leave?: boolean;
  layout?: 'auto' | 'grid2' | 'keepsake' | 'weapons' | 'workbench' | 'shop' | 'arcana';
  instant?: boolean;
  initialFocus?: number;
  header?: { title: string; sub?: string; col?: string; accent?: string };
  wallet?: { coins?: number; iron?: number; herb?: number; focus?: 'coins' | 'iron' | 'herb' };
  tabs?: { items: Array<{ id: string; label: string; badge?: boolean }>; active: number; onSwitch: (idx: number) => void };
  graspBar?: Omit<GraspBarSpec, 'x' | 'y' | 'btnHot' | 'visible'> & { onExpand: () => void };
  footer?: string;
  archHave?: Partial<Record<Archetype, number>>;
  onAlt?: (idx: number) => void;
  onSub?: (idx: number) => void;
  keepsakeDetail?: (idx: number) => Omit<DetailSpec, 'x' | 'y' | 'w'>;
  detail?: (idx: number) => Omit<DetailSpec, 'x' | 'y' | 'w'>;
  workbench?: (idx: number) => Omit<WorkbenchSpec, 'x' | 'y' | 'w' | 'h'>;
}

const styleOf = (b: Boon, layout?: CardOpenOpts['layout']): CardStyle => {
  if (layout === 'keepsake') return 'keepsake';
  if (layout === 'weapons') return 'weapon';
  if (layout === 'shop') return 'shop';
  if (layout === 'workbench') return 'workRow';
  if (layout === 'arcana') return 'arcana';
  const s = b.school as string;
  if (s === 'fg') return 'forge';
  if (s === 'md') return 'medic';
  if (s === 'mr') return 'mirror';
  if (s === 'ms') return b.id.startsWith('meal_') || b.id === 'leave' ? 'meal' : 'manual';
  return 'boon';
};

const tagOf = (b: CardBoon, tier: number, st: CardStyle) => {
  if (language === 'en' && (b.id === 'again' || b.id === 'retry')) return '';
  return b.tag ?? (st === 'boon' ? TIER_NAMES[tier] ?? '' : st === 'manual' ? '刀谱' : '');
};

/** the description with its {v} / {v2} for this tier (boons.ts vals / unit, cards.ts fillVals) */
export const descOf = (b: Boon, tier: number): string[] => b.desc.map(l => fillVals(l, b, tier));
const hexOf = (c: string) => parseInt(c.replace('#', ''), 16) || 0xd8d2c6;

/** the skill face's rows, as shares of the face's height: the name's top and size, the presses' centre and size, the effect's top and size */
const ROW = { nameY: 0.05, nameH: 0.22, pressY: 0.46, press: 0.32, effY: 0.72, eff: 0.19, num: 0.145 };
const EN_ROW = { ...ROW, pressY: 0.40, press: 0.25, effY: 0.65, eff: 0.16, num: 0.135 };

/** where a taken card goes (show.ts): the HUD button's place and size, the HUD back on as it flies, its landing */
export interface CardFlight { at(t: MarkTarget): { x: number; y: number; size: number }; start(e: SkillEntry): void; land(e: SkillEntry): void }

type AnyLayout =
  | ReturnType<typeof boardLayout>
  | ReturnType<typeof scrollLayout>
  | ReturnType<typeof steleLayout>
  | ReturnType<typeof keepsakeLayout>
  | ReturnType<typeof weaponLayout>
  | ReturnType<typeof shopLayout>
  | ReturnType<typeof workRowLayout>
  | ReturnType<typeof arcanaLayout>;

interface Card {
  b: CardBoon; tier: number; st: CardStyle; locked: boolean; e: SkillEntry | null;
  root: THREE.Group; board: THREE.Mesh; face: THREE.Mesh; rim: THREE.Mesh;
  badge: Model3D | null; picture: Model3D | null; presses: MiniShield[]; items: PressItem[]; L: AnyLayout;
  x: number; y: number; w: number; h: number; lift: number; t0: number; landed: boolean; unfurled: boolean; faceKey: string; focusT: number;
}

export class CardPick3D {
  on = false; focus = 0; private openedAt = 0; private instantOpen = false;
  /** set by show.ts: a taken 秘传 / 刀谱 flies to its HUD button */
  flight: CardFlight | null = null;
  /** act-165: input isolation hooks so opening / closing any card UI latches all held keys & gamepad buttons */
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;
  private get settling() { return !this.instantOpen && clock.rtime - this.openedAt < 0.32; }
  private cards: Card[] = [];
  private done: ((i: number) => void) | null = null;
  private leaving = -1; private leaveT = 0; private flyStarted = false;
  private gridCols = 1;
  private isHorizontalRow = false;
  private layoutMode: NonNullable<CardOpenOpts['layout']> = 'auto';

  private plates: UiPlatePool;
  private back: MiniShield | null = null; private backK = 0; private backHot = 0; private backDown = false; private backAt = { x: 0, y: 0, r: 0 }; private canLeave = false;
  private header: CardOpenOpts['header'] | null = null;
  private wallet: CardOpenOpts['wallet'] | null = null;
  private tabsOpt: CardOpenOpts['tabs'] | null = null;
  private tabRects: TabRect[] = [];
  private graspBarOpt: CardOpenOpts['graspBar'] | null = null;
  private graspBtnRect: { x: number; y: number; w: number; h: number } | null = null;
  private graspBtnHot = false;
  private footer: string | null = null;
  private onAltOpt: CardOpenOpts['onAlt'] | null = null;
  private onSubOpt: CardOpenOpts['onSub'] | null = null;
  private detailOpt: CardOpenOpts['detail'] | null = null;
  private detailBtnRect: { x: number; y: number; w: number; h: number } | null = null;
  private detailBtnHot = false;
  private workbenchOpt: CardOpenOpts['workbench'] | null = null;
  private workbenchBox = { x: 0, y: 0, w: 0, h: 0 };
  private workbenchBtnRect: { x: number; y: number; w: number; h: number } | null = null;
  private workbenchBtnHot = false;
  private workbenchSubBtnRect: { x: number; y: number; w: number; h: number } | null = null;
  private workbenchSubBtnHot = false;
  private workbenchPreview: { key: string; model: Model3D; root: THREE.Group; back: THREE.Mesh } | null = null;
  private lastOpenOpts: CardOpenOpts = {};

  constructor(private L: UiLayer) {
    this.plates = new UiPlatePool(L);
    onBodyFontChange(() => { for (const c of this.cards) c.faceKey = ''; });
  }

  open(boons: BoonPick[], o: CardOpenOpts = {}): Promise<number> {
    this.lastOpenOpts = o;
    return new Promise(res => {
      this.done = res;
      this.buildCards(boons, o);
    });
  }

  private disposeWorkbenchPreview() {
    if (!this.workbenchPreview) return;
    this.workbenchPreview.model.dispose();
    this.workbenchPreview.back.geometry.dispose();
    (this.workbenchPreview.back.material as THREE.Material).dispose();
    this.workbenchPreview.root.parent?.remove(this.workbenchPreview.root);
    this.workbenchPreview = null;
  }

  private buildCards(boons: BoonPick[], o: CardOpenOpts) {
    const keepDone = this.done;
    this.close();
    this.done = keepDone;
    this.canLeave = !!o.leave;
    this.instantOpen = !!o.instant;
    this.backK = o.instant ? 1 : 0;
    this.header = o.header ?? null;
    this.wallet = o.wallet ?? null;
    this.tabsOpt = o.tabs ?? null;
    this.tabRects = [];
    this.graspBarOpt = o.graspBar ?? null;
    this.graspBtnRect = null; this.graspBtnHot = false;
    this.footer = o.footer ?? null;
    this.onAltOpt = o.onAlt ?? null;
    this.onSubOpt = o.onSub ?? null;
    this.detailOpt = o.detail ?? o.keepsakeDetail ?? null;
    this.detailBtnRect = null; this.detailBtnHot = false;
    this.workbenchOpt = o.workbench ?? null;
    this.workbenchBtnRect = null; this.workbenchBtnHot = false;
    this.workbenchSubBtnRect = null; this.workbenchSubBtnHot = false;

    const L = this.L;
    const mode = o.layout ?? 'auto';
    this.layoutMode = mode;
    const isKeepsake = mode === 'keepsake';
    const isWeapons = mode === 'weapons';
    const isWorkbench = mode === 'workbench';
    const isShop = mode === 'shop';
    const isArcana = mode === 'arcana';
    const isSpecial = isKeepsake || isWeapons || isWorkbench || isShop || isArcana;
    const entries = isSpecial ? boons.map(() => null) : boons.map(({ boon, tier }) => entryOfCard(boon, tier, o.archHave));
    const skill = entries.some(e => !!e);
    const isScrollRow = !isSpecial && boons.length > 0 && boons.every(({ boon }) => styleOf(boon) === 'manual');
    const isMirrorGrid = !isSpecial && boons.length === 4 && boons.every(({ boon }) => styleOf(boon) === 'mirror');
    const isGrid2 = !isSpecial && !isScrollRow && !isMirrorGrid && !skill && (mode === 'grid2' || boons.length >= 4);

    this.isHorizontalRow = isScrollRow || isWeapons || isShop;
    const kk = uiScale(L.w, L.h, 0.8, 2.8), n = boons.length;

    const headerH = this.header ? (this.header.sub ? (L.h < 460 && isArcana ? 64 : 78) : 54) * kk : 0;
    const tabsH = this.tabsOpt ? 44 * kk : this.graspBarOpt ? (L.h < 460 ? 38 : 46) * kk : 0;
    const crownPad = isMirrorGrid ? 34 * kk : isShop ? 26 * kk : (isWeapons && L.h < 460 ? 14 * kk : 0);
    const topPad = (this.header || this.wallet ? Math.max(headerH, 52 * kk) : 16 * kk) + tabsH + crownPad + 14 * kk;
    const detailH = (isKeepsake || isWeapons) && this.detailOpt ? 128 * kk : 0;
    const footH = 42 * kk;
    const botPad = detailH + footH + 10 * kk;
    const room = Math.max(160 * kk, L.h - topPad - botPad);
    const centerY = topPad + room * 0.5;

    let w: number, h: number, gap: number, gapY = 0, Hh: number;
    let cols = 1;
    let wbLeftX = L.w / 2;
    let arcGridLeftX = L.w / 2;

    if (isKeepsake) {
      cols = Math.min(4, Math.max(1, n));
      const rows = Math.ceil(n / cols);
      gap = Math.max(16 * kk, Math.min(28 * kk, L.w * 0.02));
      gapY = Math.max(14 * kk, Math.min(24 * kk, L.h * 0.025));
      w = Math.min((L.w - 130 * kk - (cols - 1) * gap) / cols, 178 * kk);
      h = Math.min((room - (rows - 1) * gapY) / rows, w * 1.12);
      Hh = Math.max(0.86, Math.min(1.16, h / Math.max(1, w)));
      h = w * Hh;
    } else if (isArcana) {
      cols = 3;
      const rows = Math.ceil(n / 3);
      const totalAvail = Math.min(L.w - 64 * kk, 990 * kk);
      const midGap = Math.max(20 * kk, Math.min(34 * kk, totalAvail * 0.034));
      const rightW = Math.min(Math.round(totalAvail * 0.49), 476 * kk);
      const leftW = Math.max(240 * kk, totalAvail - rightW - midGap);
      gap = Math.max(10 * kk, Math.min(18 * kk, leftW * 0.04));
      gapY = Math.max(10 * kk, Math.min(16 * kk, room * 0.034));
      const maxCardW = (leftW - 2 * gap) / 3;
      const maxCardH = (room - (rows - 1) * gapY) / rows;
      w = Math.min(maxCardW, maxCardH / 1.12, 134 * kk);
      h = Math.min(maxCardH, w * 1.24);
      Hh = Math.max(0.96, Math.min(1.28, h / Math.max(1, w)));
      h = w * Hh;
      const actualLeftW = cols * w + (cols - 1) * gap;
      const startX = L.w / 2 - (actualLeftW + midGap + rightW) / 2;
      arcGridLeftX = startX + actualLeftW / 2;
      const panelH = Math.min(room * 0.98, Math.max(rows * h + (rows - 1) * gapY, 310 * kk));
      this.workbenchBox = { x: startX + actualLeftW + midGap + rightW / 2, y: centerY, w: rightW, h: panelH };
    } else if (isWeapons) {
      cols = Math.max(1, n);
      gap = Math.max(16 * kk, Math.min(34 * kk, L.w * 0.025));
      w = Math.min((L.w - 104 * kk - (n - 1) * gap) / n, 224 * kk);
      h = Math.min(room * 0.94, w * 1.44);
      Hh = Math.max(1.18, Math.min(1.52, h / Math.max(1, w)));
      h = w * Hh;
    } else if (isShop) {
      cols = Math.max(1, n);
      gap = Math.max(16 * kk, Math.min(34 * kk, L.w * 0.024));
      w = Math.min((L.w - 96 * kk - (n - 1) * gap) / n, 232 * kk);
      h = Math.min(room * 0.92, w * 1.50);
      Hh = Math.max(1.22, Math.min(1.58, h / Math.max(1, w)));
      h = w * Hh;
    } else if (isWorkbench) {
      cols = 1;
      const totalAvail = Math.min(L.w - 72 * kk, 980 * kk);
      const midGap = Math.max(20 * kk, Math.min(36 * kk, totalAvail * 0.036));
      const rightW = Math.min(Math.round(totalAvail * 0.54), 520 * kk);
      w = Math.max(220 * kk, totalAvail - rightW - midGap);
      gap = Math.max(10 * kk, Math.min(16 * kk, room * 0.032));
      h = Math.min(w * 0.275, (room - (Math.max(1, n) - 1) * gap) / Math.max(1, n));
      Hh = Math.max(0.20, Math.min(0.30, h / Math.max(1, w)));
      h = w * Hh;
      const startX = L.w / 2 - (w + midGap + rightW) / 2;
      wbLeftX = startX + w / 2;
      const panelH = Math.min(room * 0.96, Math.max(h * n + gap * Math.max(0, n - 1), 330 * kk));
      this.workbenchBox = { x: startX + w + midGap + rightW / 2, y: centerY, w: rightW, h: panelH };
    } else if (isScrollRow) {
      cols = Math.max(1, n);
      gap = Math.max(18 * kk, Math.min(44 * kk, L.w * 0.032));
      w = Math.min((L.w - 72 * kk - (n - 1) * gap) / n, 268 * kk);
      h = Math.min(room * 0.94, w * 1.48);
      Hh = Math.max(1.18, Math.min(1.56, h / Math.max(1, w)));
      h = w * Hh;
    } else if (isMirrorGrid) {
      cols = 2;
      gap = Math.max(24 * kk, Math.min(44 * kk, L.w * 0.032));
      gapY = Math.max(44 * kk, Math.min(62 * kk, L.h * 0.072));
      w = Math.min((L.w - 110 * kk - gap) / 2, 468 * kk);
      h = Math.min((room - gapY) / 2, w * 0.42);
      Hh = Math.max(0.35, Math.min(0.46, h / Math.max(1, w)));
      h = w * Hh;
    } else if (isGrid2) {
      cols = 2;
      const rows = Math.ceil(n / 2);
      gap = Math.max(18 * kk, Math.min(34 * kk, L.w * 0.024));
      gapY = Math.max(10 * kk, Math.min(22 * kk, L.h * (rows >= 4 ? 0.016 : 0.026)));
      w = Math.min((L.w - 104 * kk - gap) / 2, 476 * kk);
      const maxH = Math.max(44 * kk, (room - (rows - 1) * gapY) / rows);
      h = Math.min(w * 0.285, maxH);
      Hh = Math.max(0.22, Math.min(0.31, h / Math.max(1, w)));
      h = w * Hh;
      if (h > maxH) {
        h = maxH;
        w = Math.min(w, h / Hh);
      }
    } else if (skill) {
      cols = 1;
      w = Math.min(L.w * 0.72, 650 * kk, L.w - 40 * kk);
      gap = Math.max(10 * kk, Math.min(24 * kk, L.h * 0.028));
      h = Math.min(w * SKILL_H, (room - (n - 1) * gap) / n);
      Hh = Math.max(0.18, Math.min(SKILL_H, h / Math.max(1, w)));
      h = w * Hh;
    } else {
      cols = 1;
      w = Math.min(L.w * 0.68, 620 * kk);
      h = w * 0.255;
      gap = Math.max(12 * kk, h * 0.16);
      Hh = 0.255;
      if (n * h + (n - 1) * gap > room) {
        gap = 10 * kk;
        h = (room - (n - 1) * gap) / n;
        w = Math.min(L.w * 0.72, h / CARD_H);
        Hh = Math.max(0.2, Math.min(0.27, h / Math.max(1, w)));
        h = w * Hh;
      }
    }

    this.gridCols = cols;
    const lay: AnyLayout = isKeepsake
      ? keepsakeLayout(Hh)
      : isArcana
        ? arcanaLayout(Hh)
        : isWeapons
          ? weaponLayout(Hh)
          : isShop
            ? shopLayout(Hh)
            : isWorkbench
              ? workRowLayout(Hh)
              : isScrollRow
                ? scrollLayout(Hh)
                : isMirrorGrid
                  ? steleLayout(Hh)
                  : boardLayout(Hh);

    const rows = Math.ceil(n / cols);

    this.cards = boons.map(({ boon, tier }, i) => {
      const b = boon as CardBoon;
      const st = styleOf(b, mode);
      const e = entries[i];
      const locked = !!b.locked;
      const root = new THREE.Group();
      root.userData.noTilt = true;
      const accent = e?.accentHex ?? (st === 'mirror' || st === 'keepsake' || st === 'weapon' || st === 'shop' || st === 'arcana' ? hexOf(b.col) : undefined);
      const { mesh: board, metal } = cardBoard(st, tier, Hh, !!e, accent, locked, {
        yin: b.steleInfo?.yin,
        theme: b.workInfo?.theme,
        active: b.arcanaInfo?.active,
        awakening: b.arcanaInfo?.awakening,
      });
      board.renderOrder = 30;
      root.add(board);

      const F = lay.FACE;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
      );
      face.position.set((F.x0 + F.x1) / 2, F.cy, st === 'mirror' || st === 'keepsake' || st === 'weapon' || st === 'shop' || st === 'arcana' ? 0.044 : 0.038);
      face.scale.set(F.x1 - F.x0, F.h, 1);
      face.renderOrder = 31;
      root.add(face);

      let badge: Model3D | null = null, picture: Model3D | null = null, presses: MiniShield[] = [], items: PressItem[] = [];
      if (e) {
        picture = skillIcon3D(e.icon);
        picture.position.set(lay.SOCKET.x, lay.SOCKET.y, 0);
        picture.scale.setScalar(lay.SOCKET.size * 0.94);
        picture.traverse(o2 => { o2.renderOrder = 32; });
        root.add(picture);
        if (e.steps) {
          if (lay.vertical) {
            const fw = F.x1 - F.x0, sBase = Math.min(F.h * 0.165, fw * 0.195);
            let s = sBase, lp = layoutPresses(e.steps, s, e.lit);
            if (lp.w > fw * 0.92) { s *= (fw * 0.92) / lp.w; lp = layoutPresses(e.steps, s, e.lit); }
            items = lp.items;
            const x0 = -lp.w / 2, cy = F.y1 - F.h * 0.425;
            presses = pressShields(items, s, root, x0, cy, 0.055, 33);
          } else {
            const row = language === 'en' ? EN_ROW : ROW;
            const fw = F.x1 - F.x0, s = F.h * row.press, lp = layoutPresses(e.steps, s, e.lit);
            items = lp.items;
            const x0 = F.x0 + fw * 0.004, cy = F.h / 2 - F.h * row.pressY;
            presses = pressShields(items, s, root, x0, cy, 0.05, 33);
          }
        }
      } else if (isWeapons && b.wepInfo) {
        badge = weaponUiModel(b.wepInfo.id, !b.wepInfo.unlocked);
        badge.position.set(lay.SOCKET.x, lay.SOCKET.y, 0.12);
        badge.scale.setScalar(lay.SOCKET.size * 0.94);
        badge.traverse(o2 => { o2.renderOrder = 32; });
        root.add(badge);
      } else {
        const real = itemForCard(b.id);
        badge = (real ? itemModel(real) : null) ?? glyphIcon3D(b.id, b.glyph, locked ? 0x626674 : hexOf(b.col));
        badge.position.set(lay.SOCKET.x, lay.SOCKET.y, isArcana ? 0.095 : 0.075);
        badge.scale.setScalar(lay.SOCKET.size * (isKeepsake || isShop ? 0.86 : isArcana ? 0.88 : 0.78));
        badge.renderOrder = 32;
        root.add(badge);
      }

      const rim = new THREE.Mesh(
        new THREE.PlaneGeometry(lay.vertical ? 1.1 : 1.06, Hh + (st === 'mirror' ? 0.14 : st === 'shop' ? 0.10 : 0.05)),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(metal.glow), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      rim.position.z = -0.03;
      rim.renderOrder = 29;
      root.add(rim);
      L.scene.add(root);

      let cx: number, cy: number;
      if (isScrollRow || isWeapons || isShop) {
        cx = L.w / 2 + (i - (n - 1) / 2) * (w + gap);
        cy = centerY;
      } else if (isArcana) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        cx = arcGridLeftX + (col - (cols - 1) / 2) * (w + gap);
        cy = centerY + (row - (rows - 1) / 2) * (h + gapY);
      } else if (isWorkbench) {
        cx = wbLeftX;
        cy = centerY + (i - (n - 1) / 2) * (h + gap);
      } else if (cols > 1) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const rowCount = row === rows - 1 ? n - row * cols : cols;
        cx = L.w / 2 + (col - (rowCount - 1) / 2) * (w + gap);
        cy = centerY + (row - (rows - 1) / 2) * (h + gapY) + (isMirrorGrid ? 10 * kk : 0);
      } else {
        cx = L.w / 2;
        cy = centerY + (i - (n - 1) / 2) * (h + gap);
      }

      const t0 = o.instant ? clock.rtime - 2 : clock.rtime + 0.04 + i * (cols > 1 || isWorkbench ? 0.04 : 0.09);
      return {
        b, tier, st, locked, e, root, board, face, rim, badge, picture, presses, items, L: lay,
        x: cx, y: cy, w, h, lift: 0, t0, landed: !!o.instant, unfurled: !!o.instant, faceKey: '', focusT: 0,
      };
    });

    this.on = true;
    const initF = o.initialFocus != null ? Math.max(0, Math.min(this.cards.length - 1, o.initialFocus)) : (cols === 1 && !isWorkbench ? Math.min(1, this.cards.length - 1) : 0);
    this.focus = Math.max(0, initF);
    this.leaving = -1;
    this.flyStarted = false;
    if (!o.instant) cue('scroll', 0.8);
    this.openedAt = clock.rtime;
    this.onOpen?.();
  }

  close() {
    const wasOn = this.on;
    for (const c of this.cards) {
      c.root.parent?.remove(c.root);
      c.board.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
      c.face.geometry.dispose();
      const fm = c.face.material as THREE.MeshBasicMaterial;
      fm.map?.dispose(); fm.dispose();
      c.rim.geometry.dispose(); (c.rim.material as THREE.Material).dispose();
      c.badge?.dispose(); c.picture?.dispose();
      for (const p of c.presses) p.dispose();
    }
    this.disposeWorkbenchPreview();
    this.cards = []; this.on = false;
    this.header = null; this.wallet = null; this.tabsOpt = null; this.tabRects = [];
    this.graspBarOpt = null; this.graspBtnRect = null; this.graspBtnHot = false;
    this.footer = null; this.onAltOpt = null; this.onSubOpt = null;
    this.detailOpt = null; this.detailBtnRect = null; this.detailBtnHot = false;
    this.workbenchOpt = null; this.workbenchBtnRect = null; this.workbenchBtnHot = false;
    this.workbenchSubBtnRect = null; this.workbenchSubBtnHot = false;
    this.plates.hidePrefix('cards.');
    this.L.text.hide('act.cards.title'); this.L.text.hide('act.cards.sub');
    this.L.text.hide('act.cards.wallet'); this.L.text.hide('act.cards.back');
    this.L.text.hide('act.cards.footer');
    if (this.back) this.back.visible = false;
    this.backDown = false; this.backHot = 0;
    if (wasOn) this.onClose?.();
  }

  /** leave without a card (the back shield, Esc, pad B) — only where the page allows it */
  leave() {
    if (!this.on || !this.canLeave || this.leaving >= 0 || this.settling) return false;
    cue('deselect', 0.5);
    const d = this.done; this.done = null;
    this.close();
    d?.(-1);
    return true;
  }

  /** force-close current promise cleanly when switching tabs in place */
  cancelSilent() {
    const d = this.done; this.done = null;
    this.close();
    d?.(-2);
  }

  hit(x: number, y: number) {
    return this.cards.findIndex(c => Math.abs(x - c.x) < c.w / 2 && Math.abs(y - c.y) < c.h / 2);
  }

  pointer(type: string, x: number, y: number) {
    if (!this.on || this.leaving >= 0) return this.on;
    if (this.settling) return true;
    if (this.canLeave) {
      const onBack = Math.hypot(x - this.backAt.x, y - this.backAt.y) < this.backAt.r * 1.3
        || (x >= this.backAt.x - this.backAt.r && x <= this.backAt.x + this.backAt.r * 3.8 && Math.abs(y - this.backAt.y) < this.backAt.r * 1.15);
      if (type === 'move') this.backHot = onBack ? 1 : 0;
      if (type === 'down' && onBack) { this.backDown = true; return true; }
      if (type === 'up' && this.backDown) { this.backDown = false; if (onBack) this.leave(); return true; }
    }
    if (this.tabsOpt && this.tabRects.length) {
      const ti = this.tabRects.findIndex(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      if (type === 'down' && ti >= 0 && ti !== this.tabsOpt.active) {
        cue('click', 0.4);
        this.tabsOpt.onSwitch(ti);
        return true;
      }
    }
    if (this.graspBarOpt && this.graspBtnRect) {
      const r = this.graspBtnRect;
      const onG = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      if (type === 'move') { if (onG && !this.graspBtnHot) cue('click', 0.2); this.graspBtnHot = onG; }
      if (type === 'down' && onG) { this.graspBarOpt.onExpand(); return true; }
    } else {
      this.graspBtnHot = false;
    }
    if (this.workbenchBtnRect) {
      const r = this.workbenchBtnRect;
      const onWb = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      if (type === 'move') { if (onWb && !this.workbenchBtnHot) cue('click', 0.2); this.workbenchBtnHot = onWb; }
      if (type === 'down' && onWb) { this.pick(); return true; }
    } else {
      this.workbenchBtnHot = false;
    }
    if (this.workbenchSubBtnRect && this.onSubOpt) {
      const r = this.workbenchSubBtnRect;
      const onSub = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      if (type === 'move') { if (onSub && !this.workbenchSubBtnHot) cue('click', 0.2); this.workbenchSubBtnHot = onSub; }
      if (type === 'down' && onSub) { this.onSubOpt(this.focus); return true; }
    } else {
      this.workbenchSubBtnHot = false;
    }
    if (this.detailBtnRect) {
      const r = this.detailBtnRect;
      const onDet = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      if (type === 'move') { if (onDet && !this.detailBtnHot) cue('click', 0.2); this.detailBtnHot = onDet; }
      if (type === 'down' && onDet) { this.pick(); return true; }
    } else {
      this.detailBtnHot = false;
    }
    const i = this.hit(x, y);
    if (type === 'move' && i >= 0 && i !== this.focus) { this.focus = i; cue('click', 0.25); }
    if (type === 'down' && i >= 0) {
      const wasFocused = this.focus === i;
      this.focus = i;
      const c = this.cards[i];
      // Clicking the top-right alt pill on a stele flips Yang/Yin directly without opening a submenu!
      if (this.onAltOpt && c.b.altBadge && x > c.x + c.w * 0.16 && y < c.y - c.h * 0.02) {
        this.onAltOpt(i);
        return true;
      }
      // In split workbench mode, tapping a different row selects & previews it on the right first; tapping the focused row (or right big button) upgrades!
      if (this.layoutMode === 'workbench' && !wasFocused) {
        cue('click', 0.3);
        return true;
      }
      // In 3×3 Arcana meditation mode, clicking an unlocked card toggles it immediately (Hades 2 feel!); clicking a locked card previews it first.
      if (this.layoutMode === 'arcana' && c.b.arcanaInfo && c.b.arcanaInfo.rank <= 0 && !wasFocused) {
        cue('click', 0.3);
        return true;
      }
      this.pick();
    }
    return true;
  }

  key(k: 'left' | 'right' | 'up' | 'down' | 'ok' | 'alt' | 'tabPrev' | 'tabNext') {
    if (!this.on || this.leaving >= 0 || this.settling) return;
    const n = this.cards.length;
    if (!n) return;
    if (k === 'alt') {
      if (this.onAltOpt) this.onAltOpt(this.focus);
      else if (this.onSubOpt) this.onSubOpt(this.focus);
      else if (this.tabsOpt && this.tabsOpt.items.length > 1) {
        const next = (this.tabsOpt.active + 1) % this.tabsOpt.items.length;
        cue('click', 0.4);
        this.tabsOpt.onSwitch(next);
      }
      return;
    }
    if (k === 'tabPrev' || k === 'tabNext') {
      if (this.tabsOpt && this.tabsOpt.items.length > 1) {
        const len = this.tabsOpt.items.length;
        const next = (this.tabsOpt.active + (k === 'tabNext' ? 1 : len - 1)) % len;
        cue('click', 0.4);
        this.tabsOpt.onSwitch(next);
      } else if (k === 'tabNext' && this.graspBarOpt) {
        this.graspBarOpt.onExpand();
      }
      return;
    }
    if (k === 'ok') { this.pick(); return; }
    const cols = this.gridCols;
    if (cols <= 1) {
      if (k === 'left' || k === 'up') this.focus = (this.focus + n - 1) % n;
      else this.focus = (this.focus + 1) % n;
    } else if (this.isHorizontalRow) {
      if (k === 'left' || k === 'up') this.focus = (this.focus + n - 1) % n;
      else this.focus = (this.focus + 1) % n;
    } else {
      if (k === 'left') this.focus = (this.focus + n - 1) % n;
      else if (k === 'right') this.focus = (this.focus + 1) % n;
      else if (k === 'up') {
        const up = this.focus - cols;
        this.focus = up >= 0 ? up : Math.min(n - 1, this.focus + Math.floor((n - 1) / cols) * cols);
      } else if (k === 'down') {
        const dn = this.focus + cols;
        this.focus = dn < n ? dn : this.focus % cols;
      }
    }
    cue('click', 0.25);
  }

  private pick() {
    const c = this.cards[this.focus];
    const snappy = this.layoutMode === 'keepsake' || this.layoutMode === 'weapons' || this.layoutMode === 'workbench' || this.layoutMode === 'shop' || this.layoutMode === 'arcana' || !!this.onAltOpt;
    if (snappy) {
      // Snappy pick for interactive hideout & shop screens (no slow 0.75s fly-away delay!)
      const i = this.focus, d = this.done;
      if (c?.locked && this.layoutMode !== 'arcana') {
        cue('deny', 0.45);
        return;
      }
      this.done = null;
      if (this.layoutMode !== 'arcana') cue('select', 0.6);
      this.close();
      d?.(i);
      return;
    }
    this.leaving = this.focus;
    this.leaveT = 0;
    cue('relic', 0.8);
    cue('reveal', 1);
  }

  /** the face texture for the card's size on screen (repainted when that or the body font changes) */
  private paint(c: Card) {
    const dpr = this.L.dpr || 1, F = c.L.FACE, fw = c.w * (F.x1 - F.x0), fh = c.w * F.h;
    const key = `${Math.round(fw)}x${Math.round(fh)}@${dpr}|${language}|${c.b.altBadge ?? ''}|${c.locked ? 1 : 0}`;
    if (key === c.faceKey) return;
    c.faceKey = key;
    const m = c.face.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    if (c.L.shape === 'keepsake' && c.b.ksInfo) {
      m.map = paintKeepsakeFace({
        name: c.b.ksInfo.shortName,
        stars: c.b.ksInfo.stars,
        unlocked: c.b.ksInfo.unlocked,
        equipped: c.b.ksInfo.equipped,
        col: c.b.col,
      }, fw, fh, dpr);
    } else if (c.L.shape === 'arcana' && c.b.arcanaInfo) {
      m.map = paintArcanaFace(c.b.arcanaInfo, fw, fh, dpr);
    } else if (c.L.shape === 'weapon' && c.b.wepInfo) {
      m.map = paintWeaponStandFace({
        name: c.b.wepInfo.name,
        lv: c.b.wepInfo.lv,
        unlocked: c.b.wepInfo.unlocked,
        equipped: c.b.wepInfo.equipped,
        col: c.b.col,
      }, fw, fh, dpr);
    } else if (c.L.shape === 'shop' && c.b.shopInfo) {
      m.map = paintShopTagFace(c.b.shopInfo, fw, fh, dpr);
    } else if (c.L.shape === 'workRow' && c.b.workInfo) {
      m.map = paintWorkRowFace(c.b.workInfo, fw, fh, dpr);
    } else if (c.L.shape === 'stele' && c.b.steleInfo) {
      m.map = paintSteleFace(c.b.steleInfo, fw, fh, dpr);
    } else if (c.e) {
      m.map = c.L.vertical ? paintScrollFace(c.e, fw, fh, dpr) : paintSkillFace(c.e, fw, fh, dpr);
    } else {
      m.map = paintFace({
        name: c.b.name,
        tag: tagOf(c.b, c.tier, c.st),
        desc: descOf(c.b, c.tier),
        tier: c.tier,
        style: c.st,
        locked: c.locked,
        altBadge: c.b.altBadge,
      }, fw, fh, dpr);
    }
    m.needsUpdate = true;
  }

  update(dt: number) {
    if (!this.on) return;
    const L = this.L, t = clock.rtime, chosen = this.leaving >= 0 ? this.cards[this.leaving] : null, flies = !!(chosen?.e && this.flight);
    const T = flies ? 0.95 : 0.72;
    if (this.leaving >= 0) {
      this.leaveT += dt;
      if (flies && !this.flyStarted && this.leaveT > 0.3) { this.flyStarted = true; this.flight!.start(chosen!.e!); }
      if (this.leaveT > T) {
        const i = this.leaving, d = this.done, e = chosen?.e;
        this.done = null;
        this.close();
        if (flies && e) this.flight!.land(e);
        d?.(i);
        return;
      }
    }

    const showChrome = this.leaving < 0;
    const dpr = L.dpr || 1, kk = uiScale(L.w, L.h, 0.8, 2.8);

    // Top-left back shield + dark-iron tag plaque
    if (this.canLeave) {
      if (!this.back) {
        this.back = backShield();
        this.back.userData.noTilt = true;
        this.back.traverse(o => { o.renderOrder = 34; });
        L.scene.add(this.back);
      }
      this.backK = this.leaving >= 0 ? Math.max(0, this.backK - dt * 6) : Math.min(1, this.backK + dt * 5);
      const r = Math.max(26 * kk, Math.min(40 * kk, L.h * 0.056));
      this.backAt = { x: Math.max(r + 20 * kk, L.w * 0.048), y: Math.max(r + 14 * kk, 40 * kk), r };
      const bb = this.back;
      bb.visible = this.backK > 0.02;
      const bz = 0.6 + this.backHot * 0.2;
      L.at(this.backAt.x, this.backAt.y, bz, bb.position);
      bb.scale.setScalar(L.px(r * 2, bz) * (this.backDown ? 0.88 : 1) * (1 + 0.07 * this.backHot) * (0.6 + 0.4 * this.backK));
      bb.rotation.set(0, 0.12 + Math.sin(t * 0.7) * 0.03, Math.sin(t * 1.3) * 0.02);
      bb.setOpacity(this.backK);
      bb.setRim(this.backHot ? 0xffe498 : 0x9aa4b4, this.backHot ? 0.65 : 0.25);
      const bLbl = PAD.device === 'key' ? '返回 Esc' : PAD.device === 'pad' ? msg`返回 ${padName(1)}` : '返回';
      this.plates.setTag('cards.back', {
        text: bLbl,
        x: this.backAt.x + r + 50 * kk,
        y: this.backAt.y,
        color: this.backHot ? '#fff8d4' : '#f2e8d2',
        accent: this.backHot ? '#ffd87a' : '#8a7a5c',
        visible: this.backK > 0.3 && showChrome,
        order: 52,
      });
    } else {
      if (this.back) this.back.visible = false;
      this.plates.hide('cards.back');
    }

    const c0 = this.cards[0], cLast = this.cards[this.cards.length - 1];
    const maxBot = this.cards.reduce((a, c) => Math.max(a, c.y + c.h / 2), 0);

    // Top centered header plaque + top-right currency wallet plaque + optional tabs bar
    if (this.header && showChrome && c0) {
      const hdrY = (this.header.sub ? 44 : 36) * kk;
      this.plates.setHeader('cards.header', {
        title: this.header.title,
        sub: this.header.sub,
        color: this.header.col ?? '#ffe6b0',
        accent: this.header.accent ?? '#b88e4a',
        x: L.w / 2,
        y: hdrY,
        visible: true,
      });
    } else {
      this.plates.hide('cards.header');
    }

    if (this.wallet && showChrome) {
      const rightMargin = (typeof __DEBUG_UI__ !== 'undefined' && __DEBUG_UI__ ? 66 : 22) * kk;
      this.plates.setWallet('cards.wallet', {
        ...this.wallet,
        x: L.w - rightMargin,
        y: 38 * kk,
        visible: true,
      });
    } else {
      this.plates.hide('cards.wallet');
    }

    if (this.tabsOpt && showChrome) {
      const tabY = (this.header?.sub ? 104 : 84) * kk;
      this.tabRects = this.plates.setTabs('cards.tabs', this.tabsOpt.items, this.tabsOpt.active, L.w / 2, tabY);
    } else {
      this.tabRects = [];
      this.plates.hide('cards.tabs');
    }

    if (this.graspBarOpt && showChrome) {
      const gY = (this.header?.sub ? 102 : 82) * kk;
      const gRes = this.plates.setGraspBar('cards.grasp', {
        used: this.graspBarOpt.used,
        cap: this.graspBarOpt.cap,
        nextCost: this.graspBarOpt.nextCost,
        have: this.graspBarOpt.have,
        canExpand: this.graspBarOpt.canExpand,
        btnHot: this.graspBtnHot,
        x: L.w / 2,
        y: gY,
        visible: true,
      });
      this.graspBtnRect = gRes.btnRect;
    } else {
      this.graspBtnRect = null;
      this.plates.hide('cards.grasp');
    }

    // Bottom detail panel for Keepsake & Weapon Gallery showcases
    if ((this.layoutMode === 'keepsake' || this.layoutMode === 'weapons') && this.detailOpt && showChrome && this.cards[this.focus]) {
      const det = this.detailOpt(this.focus);
      const detW = Math.min(L.w - 84 * kk, 820 * kk);
      const detY = L.h - 92 * kk;
      this.detailBtnRect = this.plates.setDetail('cards.detail', {
        ...det,
        actionHot: this.detailBtnHot,
        x: L.w / 2,
        y: detY,
        w: detW,
        visible: true,
      });
    } else {
      this.detailBtnRect = null;
      this.plates.hide('cards.detail');
    }

    // Right-side 3D Artifact Workbench panel + live spinning 3D model inside transparent viewport (锻坊 / 孙媪悟性牌阵)
    if ((this.layoutMode === 'workbench' || this.layoutMode === 'arcana') && this.workbenchOpt && showChrome && this.cards[this.focus]) {
      const fc = this.cards[this.focus];
      const wb = this.workbenchOpt(this.focus);
      const res = this.plates.setWorkbench('cards.workbench', {
        ...wb,
        btnHot: this.workbenchBtnHot,
        subBtnHot: this.workbenchSubBtnHot,
        x: this.workbenchBox.x,
        y: this.workbenchBox.y,
        w: this.workbenchBox.w,
        h: this.workbenchBox.h,
        visible: true,
      });
      this.workbenchBtnRect = res.btnRect;
      this.workbenchSubBtnRect = res.subBtnRect;
      const pKey = `${fc.b.id}|${fc.b.workInfo?.weaponId ?? ''}|${fc.b.workInfo?.unlocked === false ? 0 : 1}|${fc.b.arcanaInfo?.active ? 1 : 0}|${fc.b.arcanaInfo?.rank ?? 0}|${wb.theme}`;
      if (!this.workbenchPreview || this.workbenchPreview.key !== pKey) {
        this.disposeWorkbenchPreview();
        const root = new THREE.Group();
        root.userData.noTilt = true;
        const back = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ color: wb.theme === 'medic' ? 0x09120d : 0x0e0a0a, depthWrite: false }),
        );
        back.renderOrder = 29;
        root.add(back);
        let model: Model3D;
        if (fc.b.workInfo?.weaponId) {
          model = weaponUiModel(fc.b.workInfo.weaponId, fc.b.workInfo.unlocked === false);
        } else {
          const real = itemForCard(fc.b.id);
          model = (real ? itemModel(real) : null) ?? glyphIcon3D(fc.b.id, fc.b.glyph, fc.locked ? 0x626674 : hexOf(fc.b.col));
        }
        model.traverse(o2 => { o2.renderOrder = 33; });
        root.add(model);
        L.scene.add(root);
        this.workbenchPreview = { key: pKey, model, root, back };
      }
      const pv = this.workbenchPreview;
      if (pv) {
        const sc = res.showcase;
        L.at(sc.x, sc.y, 0.25, pv.root.position);
        const u = L.px(1, 0.25);
        pv.back.scale.set(sc.w * u, sc.h * u, 1);
        pv.back.position.z = -0.35;
        const mScale = Math.min(sc.w * 0.72, sc.h * 0.84) * u;
        pv.model.scale.setScalar(mScale);
        pv.model.position.z = 0.28;
        pv.model.idle(t, 0.03, 0.45);
        pv.model.setGlow(wb.btnEnabled || fc.b.arcanaInfo?.active ? 1.22 : 0.82);
        pv.root.visible = true;
      }
    } else {
      this.workbenchBtnRect = null;
      this.workbenchSubBtnRect = null;
      this.plates.hide('cards.workbench');
      if (this.workbenchPreview) this.workbenchPreview.root.visible = false;
    }

    // Clean footer bar
    if (showChrome && cLast) {
      const navHint = PAD.device === 'pad'
        ? (this.canLeave ? msg`十字键 选择  ·  ${padName(0)} 确认  ·  ${padName(1)} 返回` : msg`十字键 选择  ·  ${padName(0)} 确认`)
        : PAD.device === 'key'
          ? (this.canLeave ? '方向键 选择  ·  Enter 确认  ·  Esc 返回' : '方向键 选择  ·  Enter 确认')
          : '';
      const footTxt = this.footer ? localize(this.footer) : navHint;
      if (footTxt) {
        this.plates.setFooter('cards.footer', footTxt, L.w / 2, L.h - 22 * kk, true);
      } else {
        this.plates.hide('cards.footer');
      }
    } else {
      this.plates.hide('cards.footer');
    }

    const backEase = (k: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2; };
    for (const [i, c] of this.cards.entries()) {
      this.paint(c);
      const sa = c.board.userData.scrollAnim as { body: THREE.Group; topRoller: THREE.Mesh; botRoller: THREE.Mesh; halfH: number } | undefined;
      const isScroll = !!sa && c.L.shape === 'scroll';
      const isStele = c.L.shape === 'stele';
      const isKs = c.L.shape === 'keepsake';
      const isWep = c.L.shape === 'weapon';
      const isShop = c.L.shape === 'shop';
      const isWork = c.L.shape === 'workRow';
      const isArc = c.L.shape === 'arcana';
      const isUpright = isStele || isKs || isWep || isShop || isArc;
      const r = this.instantOpen ? 1 : Math.min(1, Math.max(0, (t - c.t0) / (isScroll ? 0.56 : 0.38)));
      const e = backEase(r);
      if (isScroll && r > 0.14 && !c.unfurled) { c.unfurled = true; cue('scroll', 0.45); }
      if (r >= 1 && !c.landed) { c.landed = true; cue('clack', 0.55); }
      const want = i === this.focus && this.leaving < 0 ? 1 : 0;
      c.lift += (want - c.lift) * Math.min(1, dt * 13);

      const rDrop = isScroll ? Math.min(1, Math.max(0, (t - c.t0) / 0.18)) : r;
      const dropE = 1 - (1 - rDrop) ** 3;
      const uRaw = isScroll ? Math.min(1, Math.max(0, (t - c.t0 - 0.07) / 0.46)) : 1;
      const unroll = isScroll ? 1 - (1 - uRaw) ** 3 : 1;

      let x = isScroll || isUpright || this.gridCols > 1 ? c.x : isWork ? c.x - (1 - e) * L.w * 0.28 : c.x + (1 - e) * L.w * 0.72;
      let y = isScroll
        ? c.y - (1 - dropE) * L.h * 0.16 - 10 * c.lift
        : isShop
          ? c.y - (1 - e) * L.h * 0.18 - 8 * c.lift
          : isUpright || this.gridCols > 1
            ? c.y + (1 - e) * L.h * 0.24 - 7 * c.lift
            : c.y;
      let sc = 1 + (isKs || isWep || isShop ? 0.06 : isWork ? 0.032 : 0.045) * c.lift;
      let rz = isShop ? Math.sin(t * 1.45 + i * 1.3) * (0.018 - 0.012 * c.lift) : 0;
      let rx = isScroll
        ? (1 - dropE) * -0.24 + 0.05 * (1 - c.lift)
        : isShop
          ? (1 - e) * -0.22 + 0.04 * (1 - c.lift)
          : isUpright || this.gridCols > 1
            ? (1 - Math.min(1, r * 1.15)) * 0.35 + 0.04 * (1 - c.lift)
            : 0.09 * (1 - c.lift);
      let ry = isScroll || isUpright || isWork || this.gridCols > 1 ? 0 : (1 - Math.min(1, r * 1.15)) * -1.0;
      let z = L.px(22) * c.lift;
      let dx = isScroll || isUpright || this.gridCols > 1 ? 0 : L.px(isWork ? 12 : 14) * c.lift;
      const arcActive = isArc && !!c.b.arcanaInfo?.active;
      let warm = c.locked ? 0.01 + 0.06 * c.lift : arcActive ? 0.14 + 0.14 * c.lift : 0.04 + 0.16 * c.lift;
      let rimA = (arcActive ? 0.12 + 0.18 * c.lift : c.lift * (c.locked ? 0.12 : 0.24)) * unroll;
      let alpha = r > 0 ? 1 : 0;
      let scale = L.px(c.w);

      if (sa) {
        sa.body.scale.y = Math.max(0.02, unroll);
        const span = 0.06 + 0.94 * unroll;
        sa.topRoller.position.y = sa.halfH * span;
        sa.botRoller.position.y = -sa.halfH * span;
        sa.topRoller.rotation.x = -(1 - unroll) * Math.PI * 2.5;
        sa.botRoller.rotation.x = (1 - unroll) * Math.PI * 2.5;
        c.face.scale.y = c.L.FACE.h * Math.max(0.02, unroll);
        c.face.position.y = c.L.FACE.cy * unroll;
      }

      if (this.leaving >= 0) {
        const k = Math.min(1, this.leaveT / T);
        if (i === this.leaving) {
          const pk = Math.min(1, this.leaveT / 0.16), punch = pk < 1 ? Math.sin(pk * Math.PI) * 0.1 : 0;
          sc = (1 + 0.05) * (1 + punch);
          warm = this.leaveT < 0.25 ? 0.35 : 0.2;
          rimA = Math.max(0, 0.3 - k * 0.5);
          const go = Math.max(0, (this.leaveT - 0.3) / (T - 0.3));
          if (flies && c.picture) {
            const at = this.flight!.at(c.e!.target), g = go < 0.5 ? 2 * go * go : 1 - (-2 * go + 2) ** 2 / 2;
            const endScale = at.size * 0.66 / c.picture.scale.x;
            scale = L.px(c.w) * sc + (L.px(endScale) - L.px(c.w) * sc) * g; sc = 1;
            const sx = c.L.SOCKET.x * scale / L.px(1), sy = c.L.SOCKET.y * scale / L.px(1);
            x = x + (at.x - sx - x) * g; y = y + (at.y + sy - y) * g;
            z *= 1 - g; dx *= 1 - g; rx *= 1 - g; ry *= 1 - g;
            alpha = Math.max(0, 1 - go / 0.4); rimA *= alpha;
            c.picture.setGlow(1 + 0.6 * Math.sin(Math.min(1, go) * Math.PI));
          } else {
            const g2 = go * go;
            x += (L.w * 0.12 - x) * g2; y += (L.h * 0.08 - y) * g2;
            sc *= 1 - 0.8 * g2; alpha = 1 - g2 * 0.6;
          }
        } else {
          const kf = flies ? Math.min(1, this.leaveT / 0.4) : k, g = kf * kf;
          y += g * L.h * 0.8; rz = (i < this.leaving ? -1 : 1) * 0.5 * g; rimA = 0; warm = 0;
          if (flies) {
            alpha = 1 - kf; fade(c.board, alpha);
            for (const p of c.presses) p.setOpacity(alpha);
            if (c.picture) { c.picture.visible = alpha > 0.01; c.picture.setOpacity(alpha); }
          }
        }
      }

      const bm = c.board.material as THREE.MeshLambertMaterial;
      bm.emissiveIntensity = warm;
      if (flies && i === this.leaving) fade(c.board, alpha);
      (c.rim.material as THREE.MeshBasicMaterial).opacity = rimA;
      const faceUnrollA = isScroll ? Math.min(1, Math.max(0, (unroll - 0.30) / 0.42)) : 1;
      const fm = c.face.material as THREE.MeshBasicMaterial;
      fm.opacity = alpha * faceUnrollA;
      fm.color.setScalar(c.locked ? 0.72 + 0.16 * c.lift : 0.86 + 0.14 * c.lift);

      const dim = this.leaving >= 0 && i !== this.leaving ? 0.4 : c.locked ? 0.45 - 0.15 * c.lift : arcActive ? 0 : 0.16 * (1 - c.lift);
      const picReveal = isScroll ? Math.min(1, Math.max(0, (unroll - 0.44) / 0.42)) : 1;
      if (c.badge) {
        c.badge.idle(t, 0.025, 0.3 + 0.2 * c.lift);
        c.badge.position.z = 0.07 + 0.05 * c.lift;
        c.badge.setGlow(c.locked ? 0.7 : 1 + 0.25 * c.lift);
        c.badge.setDim(dim);
      }
      if (c.picture) {
        const p = c.picture;
        p.idle(t, 0.02, 0.18 + 0.12 * c.lift);
        p.position.y = c.L.SOCKET.y * (isScroll ? unroll : 1);
        p.position.z = 0.048 + p.size[2] * p.scale.x / 2 + 0.02 * c.lift;
        p.setDim(dim);
        if (isScroll && this.leaving < 0) {
          p.visible = picReveal > 0.02;
          p.scale.setScalar(c.L.SOCKET.size * 0.94 * (0.25 + 0.75 * picReveal));
          p.setOpacity(picReveal);
        }
        if (!(flies && i === this.leaving)) p.setGlow(1 + 0.25 * c.lift);
      }
      if (c.presses.length) {
        c.focusT = i === this.focus && this.leaving < 0 && r >= 1 ? c.focusT + dt : 0;
        const beat = 0.32, cyc = c.presses.length * beat + 0.9, u = c.focusT > 0 ? c.focusT % cyc : -1;
        const pressReveal = isScroll ? Math.min(1, Math.max(0, (unroll - 0.50) / 0.38)) : 1;
        c.presses.forEach((p, j) => {
          const local = u - j * beat, on = local >= 0 && local < beat * 0.85 ? Math.sin(Math.min(1, local / (beat * 0.85)) * Math.PI) : 0;
          p.position.z = 0.05 - 0.012 * on; p.icon.setGlow(1 + 1.1 * on);
          (p.mesh.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.35 * on;
          p.icon.setDim(dim); p.visible = alpha * pressReveal > 0.02;
          if (flies && i === this.leaving) p.setOpacity(alpha);
          else if (isScroll && this.leaving < 0) p.setOpacity(pressReveal);
        });
      }
      L.at(x, y, z, c.root.position);
      c.root.scale.setScalar(scale * sc);
      c.root.rotation.set(rx, ry, rz);
      c.root.position.x += dx;
      c.root.visible = r > 0;
    }
  }
}

/** the board fades as the chosen card carries its picture to the HUD */
function fade(board: THREE.Object3D, a: number) {
  board.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mt = m.material as THREE.MeshLambertMaterial;
    mt.transparent = a < 0.999; mt.opacity = a; mt.depthWrite = a >= 0.999;
  });
  board.visible = a > 0.01;
}

/** act-118 / act-136: vertical bamboo-scroll face for 刀谱 — clean vertical partitions so presses NEVER overlap effect lines */
function paintScrollFace(e: SkillEntry, w: number, h: number, dpr: number) {
  const W = Math.max(8, Math.round(w * dpr)), H = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, H), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const cx = Math.round(W / 2), pad = Math.round(8 * dpr), maxW = W - pad * 2;
  // 1. Centered large pixel name
  let S = Math.max(1, Math.round(H * 0.135 / PIX_H));
  while (S > 1 && pixW(e.name) * S > maxW) S--;
  drawPix(g, e.name, cx, Math.round(H * 0.03), { scale: S, color: '#fff2cc', outline: '#0a0708', align: 'center' });
  // 2. Centered pills: 刀谱 + 新派生/变招
  const s2 = Math.max(1, Math.round(H * 0.064 / PIX_H)), pp = Math.max(2, s2 * 3), gap = Math.round(8 * dpr);
  const pills: Array<{ text: string; col: string }> = [];
  if (e.tag) pills.push({ text: e.tag, col: '#f4d68c' });
  if (e.badge) pills.push(e.badge);
  const totalPW = pills.reduce((sum, p, idx) => sum + pixW(p.text) * s2 + pp * 2 + (idx ? gap : 0), 0);
  let px0 = Math.round(cx - totalPW / 2);
  const py = Math.round(H * 0.19);
  for (const p of pills) {
    const tw = pixW(p.text) * s2;
    g.fillStyle = p.col; g.fillRect(px0, py, tw + pp * 2, PIX_H * s2 + pp * 2);
    g.fillStyle = '#140f0a'; g.fillRect(px0 + s2, py + s2, tw + pp * 2 - 2 * s2, PIX_H * s2 + pp * 2 - 2 * s2);
    drawPix(g, p.text, px0 + pp, py + pp, { scale: s2, color: p.col, outline: null, align: 'left' });
    px0 += tw + pp * 2 + gap;
  }
  // 3. Separators between the centered 3D button shields (exact same scale & center math as buildCards)
  if (e.steps?.length) {
    const sBase = Math.min(H * 0.165, W * 0.195);
    let s = sBase, lp = layoutPresses(e.steps, s, e.lit);
    if (lp.w > W * 0.92) { s *= (W * 0.92) / lp.w; lp = layoutPresses(e.steps, s, e.lit); }
    paintSeps(g, lp.items, Math.round((W - lp.w) / 2), Math.round(H * 0.425), s);
  }
  // 4. Effect description (cleanly spaced below button row)
  const eff = localize(e.effect);
  const effPx = Math.max(10, Math.round(H * 0.084));
  const mid = Math.ceil(eff.length / 2);
  const comma = eff.indexOf('，');
  const lines = eff.length > 10 ? (comma > 2 && comma < eff.length - 2 ? [eff.slice(0, comma + 1), eff.slice(comma + 1)] : [eff.slice(0, mid), eff.slice(mid)]) : [eff];
  lines.forEach((ln, idx) => paintEffect(g, ln, pad, Math.round(H * (0.615 + idx * 0.12)), effPx, maxW, '#f0e6d2'));
  // 5. Numbers & trigger condition at bottom
  if (e.num) paintNum(g, e.num, pad, Math.round(H * 0.875), Math.max(9, Math.round(H * 0.072)), maxW, 'left');
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** the face of a 秘传 / 刀谱 card */
function paintSkillFace(e: SkillEntry, w: number, h: number, dpr: number) {
  const W = Math.max(8, Math.round(w * dpr)), H = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, H), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const S = Math.max(1, Math.round(H * ROW.nameH / PIX_H)), x0 = Math.round(W * 0.004);
  const nameW = paintName(g, e, x0, Math.round(H * ROW.nameY), S, dpr);
  const row = language === 'en' ? EN_ROW : ROW;
  const isBoon = e.kind === 'boon';
  if (e.num && row === EN_ROW) paintNum(g, e.num, x0, Math.round(H * 0.84), Math.round(H * row.num), W - x0 - 4 * dpr, 'left', isBoon);
  else if (e.num) paintNum(g, e.num, W - Math.round(6 * dpr), Math.round(H * ROW.nameY + (PIX_H * S - H * row.num) / 2), Math.round(H * row.num), Math.max(40, W - nameW - x0 - 20 * dpr), 'right', isBoon);
  const s = row.press * h * dpr;
  if (e.steps?.length) {
    paintSeps(g, layoutPresses(e.steps, s, e.lit).items, x0, Math.round(H * row.pressY), s);
  }
  const effY = e.resNote ? Math.round(H * (row.effY - 0.06)) : Math.round(H * row.effY);
  paintEffect(g, e.effect, x0, effY, Math.round(H * (e.resNote ? row.eff * 0.90 : row.eff)), W - x0 - 4 * dpr);
  if (e.resNote) {
    const rpx = Math.max(Math.round(10 * dpr), Math.round(H * 0.135));
    const ry = Math.round(H * 0.845);
    const barH = Math.round(rpx * 1.24);
    g.fillStyle = '#332412'; g.fillRect(x0, ry - Math.round(2 * dpr), W - x0 - Math.round(4 * dpr), barH);
    g.fillStyle = '#e8b850'; g.fillRect(x0, ry - Math.round(2 * dpr), Math.max(2, Math.round(3 * dpr)), barH);
    paintEffect(g, e.resNote, x0 + Math.round(8 * dpr), ry, rpx, W - x0 - Math.round(16 * dpr), '#ffe888');
  }
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
