// act-36 (用户：「三选一的强化怎么还是以前那种low low的ui」): the pick cards as iron boards (cardBoard.ts) in the UI layer. Same
// handling as the old CardPick (cards.ts): one wide card a row; they fly in from the right one after another turning to face the
// viewer and settle with a little overshoot; the one in focus comes forward, squares up, its frame warms and its badge rises and turns;
// a pick: the chosen card gives one short punch (no white flash — act-35 「闪光太严重了」) and flies off to the top left, the others
// drop away. Input: pointer move / down, ← → (pad up / down), ok; the first 0.4 s take nothing.
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { clock } from '../engine/clock';
import { cue } from '../../audio/cues';
import { TIER_NAMES, type Boon, type BoonPick } from './boons';
import { cardBoard, glyphIcon3D, paintFace, CARD_H, FACE, SOCKET, type CardStyle } from './cardBoard';
import { onBodyFontChange } from '../ui3d/bodyFont';
import { fillVals } from './cards';
import { itemModel, itemForCard } from './itemModels';
import type { Model3D } from '../ui3d/models3d';

const styleOf = (b: Boon): CardStyle => {
  const s = b.school as string;
  if (s === 'fg') return 'forge'; if (s === 'md') return 'medic';
  if (s === 'ms') return b.id.startsWith('meal_') || b.id === 'leave' ? 'meal' : 'manual';
  return 'boon';
};
const tagOf = (b: Boon, tier: number, st: CardStyle) => (b as { tag?: string }).tag ?? (st === 'boon' ? TIER_NAMES[tier] ?? '' : st === 'manual' ? '刀谱' : '');
/** the description with its {v} / {v2} for this tier (boons.ts vals / unit, cards.ts fillVals) */
export const descOf = (b: Boon, tier: number): string[] => b.desc.map(l => fillVals(l, b, tier));
const hexOf = (c: string) => parseInt(c.replace('#', ''), 16) || 0xd8d2c6;

interface Card {
  b: Boon; tier: number; st: CardStyle; root: THREE.Group; board: THREE.Mesh; face: THREE.Mesh; badge: Model3D; rim: THREE.Mesh;
  x: number; y: number; w: number; h: number; lift: number; t0: number; landed: boolean; faceKey: string;
}
export class CardPick3D {
  on = false; focus = 0; private openedAt = 0;
  private get settling() { return clock.rtime - this.openedAt < 0.4; }
  private cards: Card[] = []; private done: ((i: number) => void) | null = null; private leaving = -1; private leaveT = 0;
  constructor(private L: UiLayer) { onBodyFontChange(() => { for (const c of this.cards) c.faceKey = ''; }); }
  open(boons: BoonPick[]): Promise<number> {
    this.close(); const L = this.L;
    // one wide card a row, centred; more rows than fit → smaller cards (the hideout's upgrade lists)
    let w = Math.min(L.w * 0.7, 620 * Math.max(0.8, Math.min(1.25, L.h / 720))), h = w * CARD_H, gap = Math.max(10, h * 0.16);
    const n = boons.length, room = L.h * 0.9; if (n * h + (n - 1) * gap > room) { h = (room - (n - 1) * 8) / n; w = h / CARD_H; gap = 8; }
    this.cards = boons.map(({ boon: b, tier }, i) => {
      const st = styleOf(b), root = new THREE.Group(); root.userData.noTilt = true;
      const { mesh: board, metal } = cardBoard(st, tier); board.renderOrder = 30; root.add(board);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      face.position.set((FACE.x0 + FACE.x1) / 2, 0, 0.035); face.scale.set(FACE.x1 - FACE.x0, FACE.h, 1); face.renderOrder = 31; root.add(face);
      // act-41 (用户：「所有道具我要求都是真实的模型」): the real thing on the card when there is one (itemModels.ts), else the old picture
      const real = itemForCard(b.id), badge = (real ? itemModel(real) : null) ?? glyphIcon3D(b.id, b.glyph, hexOf(b.col)); badge.position.set(SOCKET.x, 0, 0.07); badge.scale.setScalar(SOCKET.size * 0.8); badge.renderOrder = 32; root.add(badge);
      // a rim of the metal's light behind the board, only for the card in focus (kept low: no glare)
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(1.04, CARD_H + 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(metal.glow), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      rim.position.z = -0.03; rim.renderOrder = 29; root.add(rim);
      L.scene.add(root);
      return { b, tier, st, root, board, face, badge, rim, x: L.w / 2, y: L.h * 0.5 + (i - (n - 1) / 2) * (h + gap), w, h, lift: 0, t0: clock.rtime + 0.05 + i * 0.11, landed: false, faceKey: '' };
    });
    this.on = true; this.focus = Math.min(1, this.cards.length - 1); this.leaving = -1; cue('scroll', 0.8); this.openedAt = clock.rtime;
    return new Promise(res => { this.done = res; });
  }
  close() {
    for (const c of this.cards) {
      c.root.parent?.remove(c.root); c.board.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
      c.face.geometry.dispose(); const fm = c.face.material as THREE.MeshBasicMaterial; fm.map?.dispose(); fm.dispose();
      c.rim.geometry.dispose(); (c.rim.material as THREE.Material).dispose(); c.badge.dispose();
    }
    this.cards = []; this.on = false;
  }
  hit(x: number, y: number) { return this.cards.findIndex(c => Math.abs(x - c.x) < c.w / 2 && Math.abs(y - c.y) < c.h / 2); }
  pointer(type: string, x: number, y: number) {
    if (!this.on || this.leaving >= 0) return this.on;
    if (this.settling) return true;
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
    const dpr = this.L.dpr || 1, fw = c.w * (FACE.x1 - FACE.x0), fh = c.w * FACE.h, key = `${Math.round(fw)}x${Math.round(fh)}@${dpr}`;
    if (key === c.faceKey) return; c.faceKey = key;
    const m = c.face.material as THREE.MeshBasicMaterial; m.map?.dispose();
    m.map = paintFace({ name: c.b.name, tag: tagOf(c.b, c.tier, c.st), desc: descOf(c.b, c.tier), tier: c.tier, style: c.st }, fw, fh, dpr); m.needsUpdate = true;
  }
  update(dt: number) {
    if (!this.on) return;
    const L = this.L, T = 0.75, t = clock.rtime;
    if (this.leaving >= 0) { this.leaveT += dt; if (this.leaveT > T) { const i = this.leaving, d = this.done; this.done = null; this.close(); d?.(i); return; } }
    const back = (k: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2; };   // ease-out, a little past and back
    for (const [i, c] of this.cards.entries()) {
      this.paint(c);
      const r = Math.min(1, Math.max(0, (t - c.t0) / 0.42)), e = back(r);
      if (r >= 1 && !c.landed) { c.landed = true; cue('clack', 0.55); }
      const want = i === this.focus && this.leaving < 0 ? 1 : 0; c.lift += (want - c.lift) * Math.min(1, dt * 12);
      let x = c.x + (1 - e) * L.w * 0.75, y = c.y, sc = 1 + 0.05 * c.lift, rz = 0;
      const ry = (1 - Math.min(1, r * 1.15)) * -1.1;
      let warm = 0.04 + 0.16 * c.lift, rimA = c.lift * 0.22, alpha = r > 0 ? 1 : 0;
      if (this.leaving >= 0) {
        const k = Math.min(1, this.leaveT / T);
        if (i === this.leaving) {
          // chosen: one short punch, the frame warms a beat, then off to the top left (into her), shrinking
          const pk = Math.min(1, this.leaveT / 0.16), punch = pk < 1 ? Math.sin(pk * Math.PI) * 0.1 : 0;
          sc = (1 + 0.05) * (1 + punch); warm = this.leaveT < 0.25 ? 0.35 : 0.2; rimA = Math.max(0, 0.3 - k * 0.5);
          const go = Math.max(0, (this.leaveT - 0.28) / (T - 0.28)), g2 = go * go;
          x += (L.w * 0.12 - x) * g2; y += (L.h * 0.08 - y) * g2; sc *= 1 - 0.8 * g2; alpha = 1 - g2 * 0.6;
        } else { const g = k * k; y += g * L.h * 0.7; rz = (i < this.leaving ? -1 : 1) * 0.5 * g; rimA = 0; warm = 0; }
      }
      (c.board.material as THREE.MeshLambertMaterial).emissiveIntensity = warm;
      (c.rim.material as THREE.MeshBasicMaterial).opacity = rimA;
      const fm = c.face.material as THREE.MeshBasicMaterial; fm.opacity = alpha; fm.color.setScalar(0.82 + 0.18 * c.lift);
      // the badge: a slow idle, up and turning toward the viewer in focus, a little brighter
      c.badge.idle(t, 0.025, 0.3 + 0.2 * c.lift); c.badge.position.z = 0.07 + 0.05 * c.lift; c.badge.setGlow(1 + 0.25 * c.lift); c.badge.setDim(this.leaving >= 0 && i !== this.leaving ? 0.4 : 0.15 * (1 - c.lift));
      L.at(x, y, L.px(24) * c.lift, c.root.position); c.root.scale.setScalar(L.px(c.w) * sc);
      c.root.rotation.set(0.1 * (1 - c.lift), ry, rz); c.root.position.x += L.px(16) * c.lift;
      c.root.visible = r > 0;
    }
  }
}
