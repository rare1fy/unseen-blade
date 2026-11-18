// act-36 (用户：「三选一的强化怎么还是以前那种low low的ui」): the pick cards as iron boards (cardBoard.ts) in the UI layer. Same
// handling as the old CardPick (cards.ts): one wide card a row; they fly in from the right one after another turning to face the
// viewer and settle with a little overshoot; the one in focus comes forward, squares up, its frame warms and its badge rises and turns;
// a pick: the chosen card gives one short punch (no white flash — act-35 「闪光太严重了」) and flies off, the others drop away.
// Input: pointer move / down, ← → (pad up / down), ok; the first 0.4 s take nothing.
//
// 11-18 (用户：「强化卡片也难以辨认都是干嘛的，icon造型和描述都很抽象」→ 卡面 = 键位 + 招式图标 + 按法；「选了强化后根本看不到自己选的强化是
// 啥，在哪儿、如何释放」): a 秘传 / 刀谱 card is taller and reads left to right —
//   its thick picture on the left, in the board's dark recess (a 刀谱's picture is the one its button turns over to in a fight);
//   row 1: the name and its tier (or 刀谱), the numbers in small type at the right;
//   row 2: how it is done — the HUD's buttons in small, in order, arrows between (skillFace.ts); the card in focus presses them one
//          after another (each sinks and lights), over and over, so the order reads without words;
//   row 3: one line of what comes out (key words behind their little icons).
// Taken: the cards fall away and the chosen one's picture flies down onto its button of the HUD (its frame and text fade on the way),
// lands with a ring of light, and leaves a mark beside it (hud.ts). The other cards (meals, the hideout's lists) keep the short board.
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { clock } from '../engine/clock';
import { cue } from '../../audio/cues';
import { TIER_NAMES, type Boon, type BoonPick } from './boons';
import { cardBoard, glyphIcon3D, paintFace, boardLayout, CARD_H, SKILL_H, type CardStyle } from './cardBoard';
import { onBodyFontChange } from '../ui3d/bodyFont';
import { language } from './i18n';
import { fillVals } from './cards';
import { itemModel, itemForCard } from './itemModels';
import type { Model3D } from '../ui3d/models3d';
import { makeCanvas } from '../../platform/index';
import { PIX_H } from '../v2/pix';
import { backShield, type MiniShield } from './btnBadge';
import { entryOfCard, layoutPresses, paintSeps, pressShields, paintName, paintEffect, paintNum, type SkillEntry, type PressItem } from './skillFace';
import { skillIcon3D } from './skillIcons';
import type { MarkTarget } from './skillInfo';

const styleOf = (b: Boon): CardStyle => {
  const s = b.school as string;
  if (s === 'fg') return 'forge'; if (s === 'md') return 'medic';
  if (s === 'ms') return b.id.startsWith('meal_') || b.id === 'leave' ? 'meal' : 'manual';
  return 'boon';
};
const tagOf = (b: Boon, tier: number, st: CardStyle) => {
  if (language === 'en' && (b.id === 'again' || b.id === 'retry')) return '';
  return (b as { tag?: string }).tag ?? (st === 'boon' ? TIER_NAMES[tier] ?? '' : st === 'manual' ? '刀谱' : '');
};
/** the description with its {v} / {v2} for this tier (boons.ts vals / unit, cards.ts fillVals) */
export const descOf = (b: Boon, tier: number): string[] => b.desc.map(l => fillVals(l, b, tier));
const hexOf = (c: string) => parseInt(c.replace('#', ''), 16) || 0xd8d2c6;

/** the skill face's rows, as shares of the face's height: the name's top and size, the presses' centre and size, the effect's top and size */
const ROW = { nameY: 0.05, nameH: 0.21, pressY: 0.49, press: 0.34, effY: 0.76, eff: 0.17, num: 0.12 };
const EN_ROW = { ...ROW, pressY: 0.41, press: 0.26, effY: 0.68, eff: 0.15, num: 0.125 };
/** where a taken card goes (show.ts): the HUD button's place and size, the HUD back on as it flies, its landing */
export interface CardFlight { at(t: MarkTarget): { x: number; y: number; size: number }; start(e: SkillEntry): void; land(e: SkillEntry): void }

interface Card {
  b: Boon; tier: number; st: CardStyle; e: SkillEntry | null; root: THREE.Group; board: THREE.Mesh; face: THREE.Mesh; rim: THREE.Mesh;
  badge: Model3D | null; picture: Model3D | null; presses: MiniShield[]; items: PressItem[]; L: ReturnType<typeof boardLayout>;
  x: number; y: number; w: number; h: number; lift: number; t0: number; landed: boolean; faceKey: string; focusT: number;
}
export class CardPick3D {
  on = false; focus = 0; private openedAt = 0;
  /** set by show.ts: a taken 秘传 / 刀谱 flies to its HUD button */
  flight: CardFlight | null = null;
  private get settling() { return clock.rtime - this.openedAt < 0.4; }
  private cards: Card[] = []; private done: ((i: number) => void) | null = null; private leaving = -1; private leaveT = 0; private flyStarted = false;
  /** 11-19 (用户：「npc商店页面没有退出按钮」): a page you may leave without taking anything (the hideout's shops) has the back shield
   *  at its top left — a tap on it, Esc or pad B resolves with −1; the reward picks (a card must be taken) have none */
  private back: MiniShield | null = null; private backK = 0; private backHot = 0; private backDown = false; private backAt = { x: 0, y: 0, r: 0 }; private canLeave = false;
  constructor(private L: UiLayer) { onBodyFontChange(() => { for (const c of this.cards) c.faceKey = ''; }); }
  open(boons: BoonPick[], o: { leave?: boolean } = {}): Promise<number> {
    this.close(); this.canLeave = !!o.leave; this.backK = 0; const L = this.L;
    const entries = boons.map(({ boon, tier }) => entryOfCard(boon, tier)), skill = entries.some(e => !!e);
    // one wide card a row, centred; more rows than fit → a shorter board (skill cards) or smaller cards (the hideout's upgrade lists)
    const kk = Math.max(0.8, Math.min(1.25, L.h / 720)), n = boons.length, room = L.h * 0.92;
    let w: number, h: number, gap: number, Hh: number;
    if (skill) {
      // wide enough for the line of what comes out; a phone (short, wide) gets wider and flatter boards rather than smaller ones
      w = Math.min(L.w * 0.72, 640 * kk, L.w - 40); gap = Math.max(8, Math.min(28, L.h * 0.035));
      h = Math.min(w * SKILL_H, (room - (n - 1) * gap) / n); Hh = Math.max(0.17, Math.min(SKILL_H, h / w)); h = w * Hh;
    } else {
      w = Math.min(L.w * 0.7, 620 * kk); h = w * CARD_H; gap = Math.max(10, h * 0.16); Hh = CARD_H;
      if (n * h + (n - 1) * gap > L.h * 0.9) { h = (L.h * 0.9 - (n - 1) * 8) / n; w = h / CARD_H; gap = 8; }
    }
    const lay = boardLayout(Hh);
    this.cards = boons.map(({ boon: b, tier }, i) => {
      const st = styleOf(b), e = entries[i], root = new THREE.Group(); root.userData.noTilt = true;
      const { mesh: board, metal } = cardBoard(st, tier, Hh, !!e); board.renderOrder = 30; root.add(board);
      const F = lay.FACE, face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      face.position.set((F.x0 + F.x1) / 2, 0, 0.035); face.scale.set(F.x1 - F.x0, F.h, 1); face.renderOrder = 31; root.add(face);
      let badge: Model3D | null = null, picture: Model3D | null = null, presses: MiniShield[] = [], items: PressItem[] = [];
      if (e) {
        picture = skillIcon3D(e.icon); picture.position.x = lay.SOCKET.x; picture.scale.setScalar(lay.SOCKET.size * 0.94);
        picture.traverse(o => { o.renderOrder = 32; }); root.add(picture);
        if (e.steps) {
          // the presses: in board units (the face spans F.x0..F.x1 × ±F.h / 2); the separators are painted on the face (paint)
          const row = language === 'en' ? EN_ROW : ROW;
          const fw = F.x1 - F.x0, s = F.h * row.press, lp = layoutPresses(e.steps, s, e.lit); items = lp.items;
          const x0 = F.x0 + fw * 0.004, cy = F.h / 2 - F.h * row.pressY;
          presses = pressShields(items, s, root, x0, cy, 0.05, 33);
        }
      } else {
        // act-41 (用户：「所有道具我要求都是真实的模型」): the real thing when there is one (itemModels.ts), else the old picture
        const real = itemForCard(b.id); badge = (real ? itemModel(real) : null) ?? glyphIcon3D(b.id, b.glyph, hexOf(b.col)); badge.position.set(lay.SOCKET.x, 0, 0.07); badge.scale.setScalar(lay.SOCKET.size * 0.8); badge.renderOrder = 32; root.add(badge);
      }
      // a rim of the metal's light behind the board, only for the card in focus (kept low: no glare)
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(1.04, Hh + 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(metal.glow), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      rim.position.z = -0.03; rim.renderOrder = 29; root.add(rim);
      L.scene.add(root);
      return { b, tier, st, e, root, board, face, rim, badge, picture, presses, items, L: lay, x: L.w / 2, y: L.h * 0.5 + (i - (n - 1) / 2) * (h + gap), w, h, lift: 0, t0: clock.rtime + 0.05 + i * 0.11, landed: false, faceKey: '', focusT: 0 };
    });
    this.on = true; this.focus = Math.min(1, this.cards.length - 1); this.leaving = -1; this.flyStarted = false; cue('scroll', 0.8); this.openedAt = clock.rtime;
    return new Promise(res => { this.done = res; });
  }
  close() {
    for (const c of this.cards) {
      c.root.parent?.remove(c.root); c.board.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
      c.face.geometry.dispose(); const fm = c.face.material as THREE.MeshBasicMaterial; fm.map?.dispose(); fm.dispose();
      c.rim.geometry.dispose(); (c.rim.material as THREE.Material).dispose(); c.badge?.dispose(); c.picture?.dispose(); for (const p of c.presses) p.dispose();
    }
    this.cards = []; this.on = false;
    if (this.back) this.back.visible = false; this.backDown = false; this.backHot = 0;
  }
  /** leave without a card (the back shield, Esc, pad B) — only where the page allows it */
  leave() {
    if (!this.on || !this.canLeave || this.leaving >= 0 || this.settling) return false;
    cue('deselect', 0.5); const d = this.done; this.done = null; this.close(); d?.(-1); return true;
  }
  hit(x: number, y: number) { return this.cards.findIndex(c => Math.abs(x - c.x) < c.w / 2 && Math.abs(y - c.y) < c.h / 2); }
  pointer(type: string, x: number, y: number) {
    if (!this.on || this.leaving >= 0) return this.on;
    if (this.settling) return true;
    if (this.canLeave) {
      const onBack = Math.hypot(x - this.backAt.x, y - this.backAt.y) < this.backAt.r * 1.15;
      if (type === 'move') this.backHot = onBack ? 1 : 0;
      if (type === 'down' && onBack) { this.backDown = true; return true; }
      if (type === 'up' && this.backDown) { this.backDown = false; if (onBack) this.leave(); return true; }
    }
    const i = this.hit(x, y);
    if (type === 'move' && i >= 0 && i !== this.focus) { this.focus = i; cue('click', 0.25); }
    if (type === 'down' && i >= 0) { this.focus = i; this.pick(); }
    return true;
  }
  key(k: 'left' | 'right' | 'ok') {
    if (!this.on || this.leaving >= 0 || this.settling) return;
    if (k === 'left') this.focus = (this.focus + this.cards.length - 1) % this.cards.length;
    else if (k === 'right') this.focus = (this.focus + 1) % this.cards.length;
    else this.pick();
    cue('click', 0.25);
  }
  private pick() { this.leaving = this.focus; this.leaveT = 0; cue('relic', 0.8); cue('reveal', 1); }
  /** the face texture for the card's size on screen (repainted when that or the body font changes) */
  private paint(c: Card) {
    const dpr = this.L.dpr || 1, F = c.L.FACE, fw = c.w * (F.x1 - F.x0), fh = c.w * F.h, key = `${Math.round(fw)}x${Math.round(fh)}@${dpr}`;
    if (key === c.faceKey) return; c.faceKey = key;
    const m = c.face.material as THREE.MeshBasicMaterial; m.map?.dispose();
    m.map = c.e ? paintSkillFace(c.e, fw, fh, dpr) : paintFace({ name: c.b.name, tag: tagOf(c.b, c.tier, c.st), desc: descOf(c.b, c.tier), tier: c.tier, style: c.st }, fw, fh, dpr);
    m.needsUpdate = true;
  }
  update(dt: number) {
    if (!this.on) return;
    const L = this.L, t = clock.rtime, chosen = this.leaving >= 0 ? this.cards[this.leaving] : null, flies = !!(chosen?.e && this.flight);
    const T = flies ? 0.95 : 0.75;
    if (this.leaving >= 0) {
      this.leaveT += dt;
      if (flies && !this.flyStarted && this.leaveT > 0.3) { this.flyStarted = true; this.flight!.start(chosen!.e!); }
      if (this.leaveT > T) { const i = this.leaving, d = this.done, e = chosen?.e; this.done = null; this.close(); if (flies && e) this.flight!.land(e); d?.(i); return; }
    }
    // the back shield (the shops): top left of the column of cards, the same small iron shield as the pause menu's
    if (this.canLeave) {
      if (!this.back) { this.back = backShield(); this.back.userData.noTilt = true; this.back.traverse(o => { o.renderOrder = 34; }); L.scene.add(this.back); }
      this.backK = this.leaving >= 0 ? Math.max(0, this.backK - dt * 6) : Math.min(1, this.backK + dt * 5);
      const r = Math.max(22, Math.min(38, L.h * 0.05)), c0 = this.cards[0], top = c0 ? c0.y - c0.h / 2 : L.h * 0.1, left = c0 ? c0.x - c0.w / 2 : L.w * 0.2;
      this.backAt = { x: Math.max(r + 12, left - r * 1.5), y: Math.max(r + 12, top + r), r };
      const bb = this.back; bb.visible = this.backK > 0.02;
      const bz = 0.6 + this.backHot * 0.2;   // (UI-layer units: a little in front of the cards' plane)
      L.at(this.backAt.x, this.backAt.y, bz, bb.position); bb.scale.setScalar(L.px(r * 2, bz) * (this.backDown ? 0.88 : 1) * (1 + 0.06 * this.backHot) * (0.6 + 0.4 * this.backK));
      bb.rotation.set(0, 0.12 + Math.sin(t * 0.7) * 0.03, Math.sin(t * 1.3) * 0.02); bb.setOpacity(this.backK); bb.setRim(this.backHot ? 0xffd88a : null, 0.45);
    } else if (this.back) this.back.visible = false;
    const back = (k: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2; };   // ease-out, a little past and back
    for (const [i, c] of this.cards.entries()) {
      this.paint(c);
      const r = Math.min(1, Math.max(0, (t - c.t0) / 0.42)), e = back(r);
      if (r >= 1 && !c.landed) { c.landed = true; cue('clack', 0.55); }
      const want = i === this.focus && this.leaving < 0 ? 1 : 0; c.lift += (want - c.lift) * Math.min(1, dt * 12);
      let x = c.x + (1 - e) * L.w * 0.75, y = c.y, sc = 1 + 0.05 * c.lift, rz = 0, rx = 0.1 * (1 - c.lift), ry = (1 - Math.min(1, r * 1.15)) * -1.1, z = L.px(24) * c.lift, dx = L.px(16) * c.lift;
      let warm = 0.04 + 0.16 * c.lift, rimA = c.lift * 0.22, alpha = r > 0 ? 1 : 0, scale = L.px(c.w);
      if (this.leaving >= 0) {
        const k = Math.min(1, this.leaveT / T);
        if (i === this.leaving) {
          const pk = Math.min(1, this.leaveT / 0.16), punch = pk < 1 ? Math.sin(pk * Math.PI) * 0.1 : 0;
          sc = (1 + 0.05) * (1 + punch); warm = this.leaveT < 0.25 ? 0.35 : 0.2; rimA = Math.max(0, 0.3 - k * 0.5);
          const go = Math.max(0, (this.leaveT - 0.3) / (T - 0.3));
          if (flies && c.picture) {
            // Carry the picture out of the recess and land it at the size of the picture already on the HUD.
            const at = this.flight!.at(c.e!.target), g = go < 0.5 ? 2 * go * go : 1 - (-2 * go + 2) ** 2 / 2;
            const endScale = at.size * 0.66 / c.picture.scale.x;
            scale = L.px(c.w) * sc + (L.px(endScale) - L.px(c.w) * sc) * g; sc = 1;
            const sx = c.L.SOCKET.x * scale / L.px(1);
            x = x + (at.x - sx - x) * g; y = y + (at.y - y) * g; z *= 1 - g; dx *= 1 - g; rx *= 1 - g; ry *= 1 - g;
            alpha = Math.max(0, 1 - go / 0.4); rimA *= alpha;
            c.picture.setGlow(1 + 0.6 * Math.sin(Math.min(1, go) * Math.PI));
          } else { const g2 = go * go; x += (L.w * 0.12 - x) * g2; y += (L.h * 0.08 - y) * g2; sc *= 1 - 0.8 * g2; alpha = 1 - g2 * 0.6; }
        } else {
          // (11-18: the ones not taken drop out of the way at once — when the chosen one flies to the HUD it must not pass through them)
          const kf = flies ? Math.min(1, this.leaveT / 0.4) : k, g = kf * kf; y += g * L.h * 0.8; rz = (i < this.leaving ? -1 : 1) * 0.5 * g; rimA = 0; warm = 0;
          if (flies) {
            alpha = 1 - kf; fade(c.board, alpha); for (const p of c.presses) p.setOpacity(alpha);
            if (c.picture) { c.picture.visible = alpha > 0.01; c.picture.setOpacity(alpha); }
          }
        }
      }
      const bm = c.board.material as THREE.MeshLambertMaterial; bm.emissiveIntensity = warm;
      if (flies && i === this.leaving) fade(c.board, alpha);
      (c.rim.material as THREE.MeshBasicMaterial).opacity = rimA;
      const fm = c.face.material as THREE.MeshBasicMaterial; fm.opacity = alpha; fm.color.setScalar(0.82 + 0.18 * c.lift);
      // the picture: a slow idle, up and turning toward the viewer in focus, a little brighter
      const dim = this.leaving >= 0 && i !== this.leaving ? 0.4 : 0.15 * (1 - c.lift);
      if (c.badge) { c.badge.idle(t, 0.025, 0.3 + 0.2 * c.lift); c.badge.position.z = 0.07 + 0.05 * c.lift; c.badge.setGlow(1 + 0.25 * c.lift); c.badge.setDim(dim); }
      if (c.picture) {
        const p = c.picture;
        p.idle(t, 0.02, 0.18 + 0.12 * c.lift);
        p.position.z = 0.048 + p.size[2] * p.scale.x / 2 + 0.02 * c.lift;
        p.setDim(dim);
        if (!(flies && i === this.leaving)) p.setGlow(1 + 0.25 * c.lift);
      }
      // the presses: the card in focus plays them through — each button sinks and lights in turn (a beat each), then a rest, again
      if (c.presses.length) {
        c.focusT = i === this.focus && this.leaving < 0 && r >= 1 ? c.focusT + dt : 0;
        const beat = 0.32, cyc = c.presses.length * beat + 0.9, u = c.focusT > 0 ? c.focusT % cyc : -1;
        c.presses.forEach((p, j) => {
          const local = u - j * beat, on = local >= 0 && local < beat * 0.85 ? Math.sin(Math.min(1, local / (beat * 0.85)) * Math.PI) : 0;
          p.position.z = 0.05 - 0.012 * on; p.icon.setGlow(1 + 1.1 * on); (p.mesh.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.35 * on;
          p.icon.setDim(dim); p.visible = alpha > 0.02; if (flies && i === this.leaving) p.setOpacity(alpha);
        });
      }
      L.at(x, y, z, c.root.position); c.root.scale.setScalar(scale * sc);
      c.root.rotation.set(rx, ry, rz); c.root.position.x += dx;
      c.root.visible = r > 0;
    }
  }
}
/** the board fades as the chosen card carries its picture to the HUD */
function fade(board: THREE.Object3D, a: number) {
  board.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const mt = m.material as THREE.MeshLambertMaterial; mt.transparent = a < 0.999; mt.opacity = a; mt.depthWrite = a >= 0.999; });
  board.visible = a > 0.01;
}
/** the face of a 秘传 / 刀谱 card: the name and its tier, the numbers at the right; the marks between the presses (the buttons themselves
 *  are 3D, laid over this — the row is laid out again here in device px, the same proportions); the line of what comes out. */
function paintSkillFace(e: SkillEntry, w: number, h: number, dpr: number) {
  const W = Math.max(8, Math.round(w * dpr)), H = Math.max(8, Math.round(h * dpr)), c = makeCanvas(W, H), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const S = Math.max(1, Math.round(H * ROW.nameH / PIX_H)), x0 = Math.round(W * 0.004);
  const nameW = paintName(g, e, x0, Math.round(H * ROW.nameY), S, dpr);
  // the numbers: small, right-aligned on the name's row (they never push the name)
  const row = language === 'en' ? EN_ROW : ROW;
  // Give the longer English names and numbers separate lines so neither has to shrink around the other.
  if (e.num && row === EN_ROW) paintNum(g, e.num, x0, Math.round(H * 0.84), Math.round(H * row.num), W - x0 - 4 * dpr);
  else if (e.num) paintNum(g, e.num, W - Math.round(2 * dpr), Math.round(H * ROW.nameY + (PIX_H * S - H * ROW.num) / 2), Math.round(H * ROW.num), W - nameW - x0 - 16 * dpr, 'right');
  const s = row.press * h * dpr; paintSeps(g, layoutPresses(e.steps ?? [], s, e.lit).items, x0, Math.round(H * row.pressY), s);
  paintEffect(g, e.effect, x0, Math.round(H * row.effY), Math.round(H * row.eff), W - x0 - 4 * dpr);
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
