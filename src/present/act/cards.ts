// 三选一的石牌（UI 层的实物：有厚度的石板，正面画图标、名字和两行说明）。从下往上升起，指着哪块哪块抬起、微微转正；
// 点一下（或 ←→ / 手柄上下选、回车 / J / 手柄 A 确认；弹出后 0.4 秒内不收键）选定，选中的那块往上飞走，另外两块沉下去。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { text, textW, icon } from '../v2/overlay';
import { clock } from '../engine/clock';
import { cue } from '../../audio/cues';
import { SCHOOL_NAMES, TIER_NAMES, type Boon, type BoonPick } from './boons';
import { SKIN, PALETTE } from './skin';
import { bodyText, bodyW, onBodyFontChange } from '../ui3d/bodyFont';

/** 把卡面数值按凡、珍、绝档填入；第二组数值供双效果秘传使用。 */
export function fillVals(desc: string, boon: Boon, tier: number) {
  const t = Math.max(0, Math.min(2, Math.floor(tier) || 0));
  return desc.replace(/\{v2?\}/g, key => key === '{v2}' ? `${boon.vals2?.[t] ?? 0}${boon.unit2 ?? ''}` : `${boon.vals?.[t] ?? 0}${boon.unit ?? ''}`);
}

// act-19 (user: 「强化的卡片要像哈迪斯那些经典动作rogue游戏学习，描述关键字要高亮，图标与文字相结合，卡片的样式要和普通面板区分开来」):
// three wide cards stacked in rows; each: the school's emblem in a framed medallion on the left, the name (pixel title font) and its
// tier badge, two lines of description with the key words in colour behind a small icon and the numbers lit; the card's ground and
// border are the school's own (太平道: talisman-paper yellow on umber; 江东水师: wave lines on deep blue; 散人: ink with a red seal),
// so it never reads as a banner or a signboard. Every icon is axis-aligned pixels (no stair-step diagonals).
type Pal = { bg: string; panel: string; frame: string; ink: string; name: string; deco: string };
const SCHOOL_PAL: Record<string, Pal> = {
  tp: { bg: '#241a10', panel: '#33261a', frame: '#d8b048', ink: '#ffe68a', name: '#ffe08a', deco: '#a8302a' },
  jd: { bg: '#0e1c28', panel: '#152c3a', frame: '#7ad0e8', ink: '#9ae8ff', name: '#bff2ff', deco: '#2e5a70' },
  sr: { bg: '#1a1416', panel: '#261d1f', frame: '#c8a070', ink: '#ffd27a', name: '#f2dcb0', deco: '#b8302a' },
  // 刀谱: a bamboo-slip book — dark wood, pale slip colour, an ink-red tie
  ms: { bg: '#2c2216', panel: '#3a2c1c', frame: '#e0c890', ink: '#f0e0b0', name: '#fff0c8', deco: '#7a5a32' },
  // act-20 the hideout's upgrades: the smith (iron, ember) and the healer (dark green, jade)
  fg: { bg: '#1c1a1c', panel: '#2a2626', frame: '#d08a3a', ink: '#ffb060', name: '#ffd8a0', deco: '#6a3a1e' },
  md: { bg: '#141c18', panel: '#1e2a24', frame: '#7ac8a0', ink: '#a8f0c8', name: '#d8f4e0', deco: '#2e5a46' },
};
const TIER_COL = ['#c8c0b0', '#6ad8b0', '#ffd060'];
const tierColor = (tier: number) => TIER_COL[tier] ?? TIER_COL[0];
/** the school emblems (12 × 12): 太平道 a talisman with its red marks, 江东水师 a snow crystal, 散人 an upright blade */
const EMBLEM: Record<string, string[]> = {
  tp: ['...######...', '...#oooo#...', '...######...', '...#....#...', '...#dddd#...', '...#....#...', '...#.dd.#...', '...#.dd.#...', '...#dddd#...', '...#....#...', '...######...', '............'],
  jd: ['.....##.....', '..#..##..#..', '...#.##.#...', '....####....', '.##..##..##.', '############', '############', '.##..##..##.', '....####....', '...#.##.#...', '..#..##..#..', '.....##.....'],
  sr: ['.....##.....', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '..########..', '.....##.....', '.....##.....', '....####....', '.....##.....'],
};
/** the little icons that sit in front of key words (7 × 7) */
const MINI: Record<string, string[]> = {
  bolt: ['...###.', '...#...', '.#####.', '...#...', '.###...', '.#.....', '.......'],
  frost: ['...#...', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '...#...'],
  fire: ['...#...', '..##...', '..###..', '.####..', '.#####.', '.##.##.', '..###..'],
  dart: ['...#...', '..###..', '...#...', '...#...', '..###..', '..#.#..', '..###..'],
  dash: ['.......', '....#..', '######.', '#######', '######.', '....#..', '.......'],
  heart: ['...#...', '..###..', '.#####.', '.#####.', '.#####.', '..###..', '.......'],
  blade: ['...#...', '...#...', '...#...', '...#...', '.#####.', '...#...', '..###..'],
};
/** key words → their icon and colour (longest first when scanning) */
const KEYS: Array<[string, string, string]> = ([
  ['破势', 'blade', '#ffd27a'], ['箭步斩', 'blade', '#ffd27a'], ['收尾那一刀', 'blade', '#ffd27a'], ['收尾一刀', 'blade', '#ffd27a'], ['连斩', 'blade', '#ffd27a'], ['斩击', 'blade', '#ffd27a'],
  ['天雷', 'bolt', '#ffe68a'], ['落雷', 'bolt', '#ffe68a'], ['电弧', 'bolt', '#ffe68a'], ['电击', 'bolt', '#ffe68a'], ['跳电', 'bolt', '#ffe68a'], ['雷球', 'bolt', '#ffe68a'],
  ['寒气', 'frost', '#9ae8ff'], ['冻住', 'frost', '#9ae8ff'], ['冰壳', 'frost', '#9ae8ff'], ['冰路', 'frost', '#9ae8ff'], ['冰片', 'frost', '#9ae8ff'], ['结冰', 'frost', '#9ae8ff'],
  ['点燃', 'fire', '#ff9a4a'], ['飞镖', 'dart', '#e8eef4'], ['三枚', 'dart', '#e8eef4'], ['三镖', 'dart', '#e8eef4'], ['飞踢', 'dash', '#ffc890'], ['按跳', 'dash', '#ffe08a'], ['刀芒', 'blade', '#c8ffd8'],
  ['完美闪避', 'dash', '#9ad8ff'], ['冲刺', 'dash', '#9ad8ff'], ['生命', 'heart', '#8aff9a'], ['回复', 'heart', '#8aff9a'], ['杀气', 'blade', '#ff9a6a'],
] as Array<[string, string, string]>).sort((a, b) => b[0].length - a[0].length);
const NUM = /^([0-9]+%?|[一二三四五六七八九十百半两]+(?:秒|点|成|枚|倍)?)/;
/** one description line, the key words lit behind their icons, the numbers in white; x is the left edge */
function richLine(g: CanvasRenderingContext2D, line: string, x: number, y: number, px: number, base: string) {
  let i = 0, cx = x, plain = '';
  const flush = () => { if (!plain) return; bodyText(g, plain, cx, y, px, base, 'left'); cx += bodyW(plain, px); plain = ''; };
  while (i < line.length) {
    const rest = line.slice(i), k = KEYS.find(([w]) => rest.startsWith(w));
    if (k) {
      flush(); const c = Math.max(1, Math.round(px / 9)), iw = 7 * c;
      icon(g, MINI[k[1]], cx + 1, y + Math.round((px - iw) / 2) + 1, c, { main: k[2] }); cx += iw + Math.round(px * 0.18);
      bodyText(g, k[0], cx, y, px, k[2], 'left'); cx += bodyW(k[0], px); i += k[0].length; continue;
    }
    const n = rest.match(NUM);
    if (n && (i === 0 || !/[一二三四五六七八九十]/.test(line[i - 1]))) { flush(); bodyText(g, n[1], cx, y, px, '#ffffff', 'left'); cx += bodyW(n[1], px); i += n[1].length; continue; }
    plain += line[i]; i++;
  }
  flush();
}
const CW = 520, CH = 120;
function face(b: Boon, tier: number, u: number) {
  const P = SCHOOL_PAL[b.school] ?? SCHOOL_PAL.sr, W = CW * u, H = CH * u, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  const R = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x * u, y * u, w * u, h * u); };
  // ground, the school's pattern, the frame (thicker and with corner pieces as the tier rises)
  R(0, 0, CW, CH, P.bg); R(6, 6, CW - 12, CH - 12, P.panel);
  if ((b.school as string) === 'tp') for (let x = 14; x < CW - 14; x += 26) { R(x, 6, 2, 6, P.deco); R(x + 12, CH - 12, 2, 6, P.deco); }
  else if ((b.school as string) === 'jd') for (let y = CH - 30; y < CH - 8; y += 7) for (let x = 120 + ((y / 7) % 2) * 9; x < CW - 12; x += 18) R(x, y, 10, 1, P.deco);
  else if (b.school === ('ms' as string)) for (let x = 120; x < CW - 12; x += 14) R(x, CH - 22, 8, 12, P.deco);   // the slips along the bottom
  else { R(CW - 30, 12, 16, 16, P.deco); R(CW - 26, 16, 8, 8, '#e05a48'); R(CW - 24, 18, 4, 4, P.deco); }
  const fw = tier === 2 ? 4 : tier === 1 ? 3 : 2, fc = tier === 2 ? TIER_COL[2] : P.frame;
  if (tier === 2) { g.shadowColor = '#ffd060'; g.shadowBlur = 6 * u; }
  R(0, 0, CW, fw, fc); R(0, CH - fw, CW, fw, fc); R(0, 0, fw, CH, fc); R(CW - fw, 0, fw, CH, fc); g.shadowBlur = 0;
  if (tier > 0) for (const [x, y] of [[0, 0], [CW - 12, 0], [0, CH - 12], [CW - 12, CH - 12]]) { R(x, y, 12, 12, fc); R(x + 3, y + 3, 6, 6, P.bg); }
  // the medallion: a framed square, the emblem inside it
  const MX = 14, MY = 14, MS = CH - 28;
  R(MX, MY, MS, MS, P.frame); R(MX + 3, MY + 3, MS - 6, MS - 6, P.bg); R(MX + 6, MY + 6, MS - 12, MS - 12, '#0b0809');
  for (const [x, y] of [[MX - 2, MY - 2], [MX + MS - 6, MY - 2], [MX - 2, MY + MS - 6], [MX + MS - 6, MY + MS - 6]]) R(x, y, 8, 8, P.frame);
  const own = ['ms', 'fg', 'md'].includes(b.school as string), ec = Math.floor((MS - 20) / 12); icon(g, own ? b.glyph : EMBLEM[b.school] ?? EMBLEM.sr, (MX + (MS - 12 * ec) / 2) * u, (MY + (MS - 12 * ec) / 2) * u, ec * u, { main: P.ink, acc: '#fff4d8', dark: P.deco });
  // the name (pixel title font) and the tier badge; the school's name in the top right
  const TX = MX + MS + 16, nameScale = 2 * u;
  text(g, b.name, TX * u, 14 * u, nameScale, tier === 2 ? TIER_COL[2] : P.name, 'left', '#0a0710');
  const ms = own, nw = textW(b.name, nameScale) / u, tag = (b as { tag?: string }).tag ?? (b.school === ('ms' as string) ? '刀谱' : TIER_NAMES[tier] ?? ''), bw = Math.ceil(bodyW(tag, 13 * u) / u) + 12;
  if (tag) { R(TX + nw + 12, 17, bw, 20, tierColor(tier)); R(TX + nw + 13, 18, bw - 2, 18, '#0d0a0b'); bodyText(g, tag, (TX + nw + 18) * u, 19 * u, 13 * u, tierColor(tier), 'left'); }
  if (!ms) bodyText(g, SCHOOL_NAMES[b.school] ?? '', (CW - (b.school === 'sr' ? 38 : 16)) * u, 18 * u, 12 * u, P.frame, 'right');
  // the two lines
  b.desc.forEach((l, i) => richLine(g, fillVals(l, b, tier), TX * u, (54 + i * 28) * u, 19 * u, '#e8e0d4'));
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return { t, W, H };
}

interface Card { b: Boon; tier: number; u: number; m: THREE.Mesh; x: number; y: number; w: number; h: number; lift: number; t0: number; rim: THREE.Mesh; landed: boolean }
export class CardPick {
  on = false; focus = 0; private openedAt = 0;
  /** act-30 之后: the first 0.4 s after the cards come up take no input (a cut mashed as the room clears must not pick one) */
  private get settling() { return clock.rtime - this.openedAt < 0.4; }
  private cards: Card[] = []; private done: ((i: number) => void) | null = null; private leaving = -1; private leaveT = 0;
  constructor(private L: UiLayer) { onBodyFontChange(() => {
    for (const c of this.cards) { const f = face(c.b, c.tier, c.u), mat = (c.m.material as THREE.MeshLambertMaterial[])[4]; mat.map?.dispose(); mat.map = f.t; mat.emissiveMap = f.t; mat.needsUpdate = true; }
  }); }
  open(boons: BoonPick[]): Promise<number> {
    this.close(); const L = this.L, u = Math.max(1, Math.round(Math.max(0.78, Math.min(L.h / 720, 1.2)) * (L.dpr || 1)));
    // phones (412 px tall): the cards keep a readable size and take more of the screen
    // rows: one wide card per row, centred; on a phone they take most of the width
    // rows: one wide card per row, centred; more rows than fit → smaller cards (the hideout's upgrade lists)
    let w = Math.min(L.w * 0.7, 600 * Math.max(0.8, Math.min(1.25, L.h / 720))), h = w * CH / CW, gap = Math.max(8, h * 0.12);
    const n = boons.length, room = L.h * 0.9; if (n * h + (n - 1) * gap > room) { h = (room - (n - 1) * 6) / n; w = h * CW / CH; gap = 6; }
    this.cards = boons.map(({ boon: b, tier }, i) => {
      const f = face(b, tier, u * 2), side = new THREE.MeshLambertMaterial({ color: tier === 0 ? PALETTE[SKIN.id].card.side : tierColor(tier), emissive: tier === 2 ? 0xffd060 : 0x000000, emissiveIntensity: 0.15 }), fm = new THREE.MeshLambertMaterial({ map: f.t, emissive: 0xffffff, emissiveMap: f.t, emissiveIntensity: 0.6 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(L.px(w), L.px(h), L.px(16)), [side, side, side, side, fm, side]); m.renderOrder = 30; L.scene.add(m);
      // act-29 (用户：「三选一的卡片……太廉价了」): a rim of light behind the card in its tier's colour, lit when the card is in focus
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(L.px(w + 14), L.px(h + 14)), new THREE.MeshBasicMaterial({ color: new THREE.Color(tierColor(tier)), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      rim.position.z = -L.px(9); rim.renderOrder = 29; m.add(rim);
      return { b, tier, u: u * 2, m, x: L.w / 2, y: L.h * 0.5 + (i - (boons.length - 1) / 2) * (h + gap), w, h, lift: 0, t0: clock.rtime + 0.05 + i * 0.11, rim, landed: false };
    });
    this.on = true; this.focus = Math.min(1, this.cards.length - 1); this.leaving = -1; cue('scroll', 0.8); this.openedAt = clock.rtime;
    return new Promise(res => { this.done = res; });
  }
  close() {
    for (const c of this.cards) {
      c.m.parent?.remove(c.m); c.m.geometry.dispose(); c.rim.geometry.dispose(); (c.rim.material as THREE.Material).dispose();
      for (const m of new Set(c.m.material as THREE.MeshLambertMaterial[])) { m.map?.dispose(); m.dispose(); }
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
  update(dt: number) {
    if (!this.on) return;
    const L = this.L, T = 0.75;
    if (this.leaving >= 0) { this.leaveT += dt; if (this.leaveT > T) { const i = this.leaving, d = this.done; this.done = null; this.close(); d?.(i); return; } }
    const back = (k: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2; };   // ease-out with an overshoot
    for (const [i, c] of this.cards.entries()) {
      // in: from the right, turned away, spinning to face the viewer, landing past its place and settling (one after another)
      const r = Math.min(1, Math.max(0, (clock.rtime - c.t0) / 0.42)), e = back(r);
      if (r >= 1 && !c.landed) { c.landed = true; cue('clack', 0.55); }
      const want = i === this.focus ? 1 : 0; c.lift += (want - c.lift) * Math.min(1, dt * 12);
      let x = c.x + (1 - e) * L.w * 0.75, y = c.y, sc = 1 + 0.06 * c.lift + (i === this.focus ? 0.012 * Math.sin(clock.rtime * 3) : 0), rz = 0, ry = (1 - Math.min(1, r * 1.15)) * -1.1;
      const fm = (c.m.material as THREE.MeshLambertMaterial[])[4];
      let glow = 0.42 + 0.33 * c.lift, rimA = c.lift * (0.55 + 0.25 * Math.sin(clock.rtime * 5));
      if (this.leaving >= 0) {
        const k = Math.min(1, this.leaveT / T);
        if (i === this.leaving) {
          // chosen: a punch and a white flash, held a beat, then off to the top left (into her) small and fading
          const pk = Math.min(1, this.leaveT / 0.16), punch = pk < 1 ? Math.sin(pk * Math.PI) * 0.16 : 0;
          sc *= 1 + punch; glow = this.leaveT < 0.22 ? 1.6 - this.leaveT * 3 : 0.9; rimA = Math.max(0, 1 - k * 1.4);
          const go = Math.max(0, (this.leaveT - 0.28) / (T - 0.28)), g2 = go * go;
          x += (L.w * 0.12 - x) * g2; y += (L.h * 0.08 - y) * g2; sc *= 1 - 0.8 * g2;
        } else { const g = k * k; y += g * L.h * 0.7; rz = (i < this.leaving ? -1 : 1) * 0.5 * g; rimA = 0; glow *= 1 - k; }
      }
      fm.emissiveIntensity = glow; (c.rim.material as THREE.MeshBasicMaterial).opacity = rimA;
      L.at(x, y, L.px(24) * c.lift, c.m.position); c.m.scale.setScalar(sc);
      c.m.rotation.set(0.12 * (1 - c.lift), ry, rz); c.m.position.x += L.px(18) * c.lift;   // the focused card leans out toward the viewer and steps right
    }
  }
}
