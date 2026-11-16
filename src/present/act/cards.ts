// 三选一的石牌（UI 层的实物：有厚度的石板，正面画图标、名字和两行说明）。从下往上升起，指着哪块哪块抬起、微微转正；
// 点一下（或 ←→ 选、回车 / J 确认）选定，选中的那块往上飞走，另外两块沉下去。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { text, textW, icon } from '../v2/overlay';
import { clock } from '../engine/clock';
import { cue } from '../../audio/cues';
import { boonTag, type Boon, type BoonPick } from './boons';
import { SKIN, PALETTE } from './skin';
import { bodyText, onBodyFontChange } from '../ui3d/bodyFont';

const tierColor = (tier: number) => tier === 2 ? '#ffd060' : tier === 1 ? '#6ad8b0' : PALETTE[SKIN.id].card.frame;
function face(b: Boon, tier: number, u: number) {
  // the card in the UI's skin (skin.ts): a lacquer tablet / a bamboo-slip plaque / an iron token
  const P = PALETTE[SKIN.id].card, W = 200 * u, H = 250 * u, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  g.fillStyle = P.bg; g.fillRect(0, 0, W, H);
  if (SKIN.id === 'bamboo') for (let x = 0; x < W; x += 12 * u) { g.fillStyle = (x / (12 * u)) % 2 ? '#b89a58' : '#c9ad6a'; g.fillRect(x, 0, 12 * u, H); g.fillStyle = '#6e5630'; g.fillRect(x, 0, u, H); }
  if (tier === 2) { g.shadowColor = '#ffd060'; g.shadowBlur = 5 * u; }
  g.fillStyle = tierColor(tier); g.fillRect(0, 0, W, 4 * u); g.fillRect(0, H - 4 * u, W, 4 * u); g.fillRect(0, 0, 4 * u, H); g.fillRect(W - 4 * u, 0, 4 * u, H);
  g.shadowBlur = 0;
  if (SKIN.id === 'iron') { g.fillStyle = '#b07a3a'; for (const [x, y] of [[8, 8], [W / u - 14, 8], [8, H / u - 14], [W / u - 14, H / u - 14]]) g.fillRect(x * u, y * u, 6 * u, 6 * u); }
  if (SKIN.id === 'lacquer') { g.fillStyle = '#b8302a'; for (const [x, y] of [[0, 0], [W / u - 12, 0], [0, H / u - 12], [W / u - 12, H / u - 12]]) g.fillRect(x * u, y * u, 12 * u, 12 * u); }
  g.fillStyle = P.panel; g.fillRect(10 * u, 10 * u, W - 20 * u, 96 * u);
  icon(g, b.glyph, (W - 10 * 7 * u) / 2, 22 * u, 7 * u, { main: b.col, acc: '#fff4d8', dark: '#120c10' });
  const tag = boonTag(b, tier);
  bodyText(g, tag, W / 2, 113 * u, 14 * u, tier === 0 ? P.desc : tierColor(tier), 'center');
  const nameScale = textW(b.name, 2 * u) > W - 24 * u ? u : 2 * u;
  text(g, b.name, (W - textW(b.name, nameScale)) / 2, 136 * u, nameScale, P.name, 'left', SKIN.id === 'bamboo' ? null : '#0a0710');
  b.desc.forEach((l, i) => bodyText(g, l, W / 2, (176 + i * 20) * u, 15 * u, P.desc, 'center'));
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return { t, W, H };
}

interface Card { b: Boon; tier: number; u: number; m: THREE.Mesh; x: number; y: number; w: number; h: number; lift: number; t0: number }
export class CardPick {
  on = false; focus = 0; private cards: Card[] = []; private done: ((i: number) => void) | null = null; private leaving = -1; private leaveT = 0;
  constructor(private L: UiLayer) { onBodyFontChange(() => {
    for (const c of this.cards) { const f = face(c.b, c.tier, c.u), mat = (c.m.material as THREE.MeshLambertMaterial[])[4]; mat.map?.dispose(); mat.map = f.t; mat.emissiveMap = f.t; mat.needsUpdate = true; }
  }); }
  open(boons: BoonPick[]): Promise<number> {
    this.close(); const L = this.L, u = Math.max(1, Math.round(Math.max(0.78, Math.min(L.h / 720, 1.2)) * (L.dpr || 1)));
    // phones (412 px tall): the cards keep a readable size and take more of the screen
    const k = Math.min(1.2, Math.max(0.78, L.h / 720)), w = 200 * k * 1.15, h = 250 * k * 1.15, gap = 30 * k;
    this.cards = boons.map(({ boon: b, tier }, i) => {
      const f = face(b, tier, u * 2), side = new THREE.MeshLambertMaterial({ color: tier === 0 ? PALETTE[SKIN.id].card.side : tierColor(tier), emissive: tier === 2 ? 0xffd060 : 0x000000, emissiveIntensity: 0.15 }), fm = new THREE.MeshLambertMaterial({ map: f.t, emissive: 0xffffff, emissiveMap: f.t, emissiveIntensity: 0.6 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(L.px(w), L.px(h), L.px(16)), [side, side, side, side, fm, side]); m.renderOrder = 30; L.scene.add(m);
      return { b, tier, u: u * 2, m, x: L.w / 2 + (i - (boons.length - 1) / 2) * (w + gap), y: L.h * 0.5, w, h, lift: 0, t0: clock.rtime + i * 0.08 };
    });
    this.on = true; this.focus = Math.min(1, this.cards.length - 1); this.leaving = -1; cue('reveal', 0.6);
    return new Promise(res => { this.done = res; });
  }
  close() {
    for (const c of this.cards) {
      c.m.parent?.remove(c.m); c.m.geometry.dispose();
      for (const m of new Set(c.m.material as THREE.MeshLambertMaterial[])) { m.map?.dispose(); m.dispose(); }
    }
    this.cards = []; this.on = false;
  }
  hit(x: number, y: number) { return this.cards.findIndex(c => Math.abs(x - c.x) < c.w / 2 && Math.abs(y - c.y) < c.h / 2); }
  pointer(type: string, x: number, y: number) {
    if (!this.on || this.leaving >= 0) return this.on;
    const i = this.hit(x, y);
    if (type === 'move' && i >= 0 && i !== this.focus) { this.focus = i; cue('click', 0.25); }
    if (type === 'down' && i >= 0) { this.focus = i; this.pick(); }
    return true;
  }
  key(k: 'left' | 'right' | 'ok') {
    if (!this.on || this.leaving >= 0) return;
    if (k === 'left') this.focus = (this.focus + this.cards.length - 1) % this.cards.length;
    else if (k === 'right') this.focus = (this.focus + 1) % this.cards.length;
    else this.pick();
    cue('click', 0.25);
  }
  private pick() { this.leaving = this.focus; this.leaveT = 0; cue('relic', 0.8); }
  update(dt: number) {
    if (!this.on) return;
    const L = this.L;
    if (this.leaving >= 0) { this.leaveT += dt; if (this.leaveT > 0.55) { const i = this.leaving, d = this.done; this.done = null; this.close(); d?.(i); return; } }
    for (const [i, c] of this.cards.entries()) {
      const rise = Math.min(1, Math.max(0, (clock.rtime - c.t0) / 0.35)), e = 1 - (1 - rise) ** 3;
      const want = i === this.focus ? 1 : 0; c.lift += (want - c.lift) * Math.min(1, dt * 12);
      let y = c.y + (1 - e) * L.h * 0.6 - c.lift * 14, sc = 1 + 0.06 * c.lift;
      if (this.leaving >= 0) { const k = this.leaveT / 0.55; if (i === this.leaving) { y -= k * k * L.h * 0.5; sc *= 1 + 0.1 * k; } else y += k * k * L.h * 0.6; }
      L.at(c.x, y, L.px(24) * c.lift, c.m.position); c.m.scale.setScalar(sc);
      c.m.rotation.set(0.25 * (1 - c.lift) * 0.3, (c.x - L.w / 2) / L.w * -0.5 * (1 - c.lift), 0);
    }
  }
}
