import { language, t as localize, wrapWords } from './i18n';
// 界面的题材风格（act-08 用户：「现在的UI欠缺了题材的风格化」「都做给我看看样式」）。三套，游戏里随时切换对比：
//   漆器（lacquer）：汉代漆器——黑漆底、朱红、描金；技能钮是八角漆盘，中间朱漆、一圈金色分段纹、金字；血量是黑漆长匣里一道朱红。
//   竹简（bamboo）：竹简木牌——竹片拼的方牌、麻绳捆两道、正中一方朱砂印（阴文刻字）；血量是一排竹简，掉血一片片暗下去、沉下去。
//   铁器（iron）：兵戈铁器——黑铁八角盾、一圈铜钉、铜色刻字；血量是一排札甲片（红甲绳），掉血一片片变黑掉落。
// 全是 UI 层里的 3D 实物（有厚度的盘 / 牌 / 甲片），正面是逐像素画出来的贴图（横平竖直，不撒随机点）。
// 切换：U 键、调参面板的按钮、网址 ui=lacquer / bamboo / iron；记在浏览器里。
import * as THREE from 'three';
import { OPT } from '../engine/perfOpts';
import type { UiLayer } from '../ui3d/layer';
import { text, textW, PIX_H } from '../v2/overlay';
import { UiSparks } from '../ui3d/vox';
import { cue } from '../../audio/cues';
import { bodyText, bodyW, onBodyFontChange } from '../ui3d/bodyFont';

export type SkinId = 'lacquer' | 'bamboo' | 'iron';
export const SKINS: SkinId[] = ['lacquer', 'bamboo', 'iron'];
export const SKIN_NAME: Record<SkinId, string> = { lacquer: '汉代漆器', bamboo: '竹简木牌', iron: '兵戈铁器' };
function initialSkin(): SkinId {
  if (!__DEBUG_UI__) return 'iron';   // (11-18: the packages have no skin switch — the iron one)
  let id = ''; try { id = localStorage.getItem('act.ui2') ?? ''; } catch { /* storage blocked */ }
  const q = typeof location !== 'undefined' ? /[?&#]ui=([a-z]+)/.exec(location.href)?.[1] : undefined;
  const pick = (q ?? id) as SkinId; return SKINS.includes(pick) ? pick : 'iron';   // act-09 用户选了铁器
}
export const SKIN = { id: initialSkin() };
export function setSkin(id: SkinId) { SKIN.id = id; try { localStorage.setItem('act.ui2', id); } catch { /* storage blocked */ } }

/** per-skin colours (CSS for the painted faces, hex for the meshes) */
export const PALETTE: Record<SkinId, { body: number; side: number; bar: number; barBack: number; barLag: number; title: string; sub: string; foeFill: number; foeBack: number; foeLag: number; card: { bg: string; frame: string; panel: string; name: string; desc: string; side: number } }> = {
  lacquer: { body: 0x1c1315, side: 0x5a1612, bar: 0xc0362a, barBack: 0x0e090a, barLag: 0xf0d79a, title: '#f0c860', sub: '#f2e2c0', foeFill: 0xc0362a, foeBack: 0x120a0b, foeLag: 0xe8c878,
    card: { bg: '#1c1315', frame: '#c8962e', panel: '#5a1612', name: '#f0c860', desc: '#efe0c2', side: 0x1c1315 } },
  bamboo: { body: 0xb89a5a, side: 0x6e5630, bar: 0x8a9a3a, barBack: 0x3a2a16, barLag: 0xe8dcb0, title: '#2a1a0c', sub: '#3e2c16', foeFill: 0xb02a22, foeBack: 0x3a2a16, foeLag: 0xe8dcb0,
    card: { bg: '#c8ad6c', frame: '#6e5630', panel: '#b42a22', name: '#2a1a0c', desc: '#3a2814', side: 0x8a6e3e } },
  iron: { body: 0x3a3d46, side: 0x23252b, bar: 0xb83228, barBack: 0x15161a, barLag: 0xd8c8a0, title: '#e0a858', sub: '#d8d2c4', foeFill: 0xb83228, foeBack: 0x15161a, foeLag: 0xd8c8a0,
    card: { bg: '#34373f', frame: '#b07a3a', panel: '#24262c', name: '#e8b060', desc: '#dcd6c8', side: 0x24262c } },
};

// ---------------------------------------------------------------- painting
/** an art-pixel canvas: N × M art pixels, each S device pixels */
function art(N: number, M: number, S: number) {
  const c = document.createElement('canvas'); c.width = N * S; c.height = M * S; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  const P = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x * S, y * S, w * S, h * S); };
  return { c, g, P, S };
}
function tex(c: HTMLCanvasElement) { const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; }
/** octagon distance from the centre (matches the octagonal discs) */
const oct = (dx: number, dy: number) => Math.max(Math.abs(dx), Math.abs(dy), (Math.abs(dx) + Math.abs(dy)) * 0.7071);
/** a big pixel glyph centred at (cx, cy) art px */
function glyph(a: ReturnType<typeof art>, ch: string, cx: number, cy: number, scale: number, col: string, outline: string | null) {
  const s = scale * a.S, w = textW(ch, s); text(a.g, ch, cx * a.S - w / 2, cy * a.S - (PIX_H * s) / 2, s, col, 'left', outline);
}

/** a skill button's face: N = 40 art px square (the disc / plaque face) */
export function btnFace(skin: SkinId, ch: string) {
  const N = 40, a = art(N, N, 4);
  if (skin === 'bamboo') {
    // vertical slats (5 px, two tones, a dark seam), two cords across, a cinnabar seal with the character cut out (cream)
    for (let i = 0; i < N; i++) a.P(i, 0, 1, N, i % 5 === 0 ? '#6e5630' : Math.floor(i / 5) % 2 ? '#c9ad6a' : '#b89a58');
    a.P(0, 5, N, 2, '#4a2e16'); a.P(0, 33, N, 2, '#4a2e16');
    a.P(8, 8, 24, 24, '#8e1e18'); a.P(9, 9, 22, 22, '#b42a22'); a.P(9, 9, 22, 1, '#cc3a2c');
    glyph(a, ch, 20, 20.5, 1.5, '#f6e8c8', null);
  } else if (skin === 'iron') {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = oct(x + 0.5 - 20, y + 0.5 - 20); if (r > 20) continue;
      a.P(x, y, 1, 1, r > 18 ? (y < 20 ? '#727884' : '#4a4e58') : r > 16.5 ? '#2a2c32' : '#3e424c');
    }
    // eight bronze rivets on the ring, a lit corner each
    for (let k = 0; k < 8; k++) { const ang = (k / 8) * Math.PI * 2 + Math.PI / 8, x = Math.round(20 + Math.cos(ang) * 14.6) - 1, y = Math.round(20 + Math.sin(ang) * 14.6) - 1; a.P(x, y, 2, 2, '#b07a3a'); a.P(x, y, 1, 1, '#e8b468'); }
    // two straight scratches
    a.P(11, 27, 6, 1, '#5a5e68'); a.P(25, 12, 5, 1, '#5a5e68');
    glyph(a, ch, 20, 20.5, 1.5, '#d8a050', '#121318');
  } else {
    // black lacquer: a gold rim, a ring of gold blocks, a cinnabar centre with a lighter upper half, a gold character
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - 20, dy = y + 0.5 - 20, r = oct(dx, dy); if (r > 20) continue;
      let col = '#1c1315';
      if (r > 18.6) col = '#c8962e';
      else if (r > 15 && r < 17.6) { const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 24); col = seg % 2 ? '#1c1315' : '#a87a26'; }
      else if (r < 13.5) col = y < 18 ? '#b8302a' : '#9a241e';
      a.P(x, y, 1, 1, col);
    }
    glyph(a, ch, 20, 20.5, 1.5, '#f6d070', '#3a0a08');
  }
  return tex(a.c);
}
/** the stick's base face (48 art px) and knob face (24 art px) */
export function stickFace(skin: SkinId, knob: boolean) {
  const N = knob ? 24 : 48, c = N / 2, a = art(N, N, 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = oct(dx, dy) / c; if (skin !== 'bamboo' && r > 1) continue;
    let col: string;
    if (skin === 'bamboo') col = knob ? (r > 0.86 ? '#5a3e22' : r > 0.5 ? '#8a6438' : '#a07848') : (x < 2 || y < 2 || x >= N - 2 || y >= N - 2) ? '#5a4024' : (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? '#c4a666' : '#ad8f50';
    else if (skin === 'iron') col = knob ? (r > 0.8 ? '#7a5426' : r > 0.4 ? '#b07a3a' : '#e0a858') : r > 0.92 ? '#646a76' : r > 0.84 ? '#2a2c32' : '#3a3d46';
    else col = knob ? (r > 0.8 ? '#c8962e' : y < c ? '#b8302a' : '#9a241e') : r > 0.94 ? '#c8962e' : r > 0.86 ? '#1c1315' : r > 0.8 ? '#a87a26' : '#1c1315';
    a.P(x, y, 1, 1, col);
  }
  if (!knob) {
    // four marks at the compass points (gold squares / bronze rivets / dark notches)
    const m = skin === 'lacquer' ? '#c8962e' : skin === 'iron' ? '#b07a3a' : '#5a4024';
    for (const [x, y] of [[c - 1, 6], [c - 1, N - 8], [6, c - 1], [N - 8, c - 1]]) a.P(x, y, 2, 2, m);
  }
  return tex(a.c);
}
/** a banner plaque: the title big, the subtitle small; returns the texture and its size in art px */
export function bannerFace(skin: SkinId, title: string, sub: string, titleCol?: string) {
  // (11-19 用户：「过关和波次切换的横幅调整一下吧，调宽调大，现在太小了有点，英文还会超框」: a wider plaque (a floor on its width,
  //  so 「清场」 isn't a stub), a bigger subtitle, and every width measured at the size it is drawn — the HD font measured at 10–14 px came
  //  out narrower than the same text drawn 8× larger, so English ran past the iron frame)
  const S0 = 8, ts = 2, tw = Math.ceil(textW(title, ts)), maxLine = language === 'en' ? Math.max(340, tw) : Math.max(260, tw);
  const bodySize = language === 'en' ? 13 : 12, PAD = 18;
  const measure = (line: string, px: number) => bodyW(line, px * S0) / S0;
  sub = localize(sub);
  let lines = sub ? [sub] : [];
  if (sub && language === 'en') lines = wrapWords(sub, maxLine, line => measure(line, bodySize));
  else if (sub && measure(sub, bodySize) > maxLine) {
    const chars = [...sub], mid = Math.ceil(chars.length / 2);
    lines = [chars.slice(0, mid).join(''), chars.slice(mid).join('')];
  }
  const bodyPx = lines.length ? Math.min(bodySize, bodySize * maxLine / Math.max(...lines.map(line => measure(line, bodySize)))) : bodySize;
  const sw = lines.length ? Math.ceil(Math.max(...lines.map(line => measure(line, bodyPx)))) : 0;
  const lineH = Math.ceil(bodyPx * 1.4);
  const W = Math.max(200, Math.max(tw, sw) + PAD * 2), H = PIX_H * ts + (lines.length ? lineH * lines.length + 5 : 0) + 16, a = art(W, H, S0), pal = PALETTE[skin];
  if (skin === 'bamboo') {
    for (let i = 0; i < W; i++) a.P(i, 0, 1, H, i % 5 === 0 ? '#6e5630' : Math.floor(i / 5) % 2 ? '#c9ad6a' : '#b89a58');
    a.P(0, 2, W, 1, '#4a2e16'); a.P(0, H - 3, W, 1, '#4a2e16');
    a.P(W - 12, 5, 8, 8, '#b42a22');   // a small seal at the right end
  } else if (skin === 'iron') {
    a.P(0, 0, W, H, '#1e2026'); a.P(1, 1, W - 2, H - 2, '#3e424c'); a.P(1, 1, W - 2, 1, '#6c7380'); a.P(1, H - 2, W - 2, 1, '#2a2c32');
    // iron corner brackets with a bronze rivet each, a red cloth strip hanging down the left edge
    for (const [x, y] of [[1, 1], [W - 7, 1], [1, H - 7], [W - 7, H - 7]]) { a.P(x, y, 6, 6, '#5a606c'); a.P(x + 1, y + 1, 4, 4, '#30333b'); a.P(x + 2, y + 2, 2, 2, '#b07a3a'); a.P(x + 2, y + 2, 1, 1, '#e8b468'); }
    a.P(9, 1, 3, H - 2, '#a8261f'); a.P(9, 1, 1, H - 2, '#c83a2c');
  } else {
    a.P(0, 0, W, H, '#c8962e'); a.P(1, 1, W - 2, H - 2, '#1c1315'); a.P(3, 3, W - 6, H - 6, '#a87a26'); a.P(4, 4, W - 8, H - 8, '#1c1315');
    for (const [x, y] of [[0, 0], [W - 4, 0], [0, H - 4], [W - 4, H - 4]]) a.P(x, y, 4, 4, '#b8302a');
  }
  const S = a.S;
  text(a.g, title, (W * S - textW(title, ts * S)) / 2, 7 * S, ts * S, titleCol ?? pal.title, 'left', skin === 'bamboo' ? null : '#0a0708');
  lines.forEach((line, i) => bodyText(a.g, line, W * S / 2, (PIX_H * ts + 10 + i * lineH) * S, bodyPx * S, pal.sub, 'center'));
  const t = tex(a.c); t.magFilter = t.minFilter = THREE.LinearFilter;
  return { t, W, H };
}

// ---------------------------------------------------------------- shapes
const lam = (t: THREE.Texture | null, color = 0xffffff, emissive = 0.5) => new THREE.MeshLambertMaterial({ color, map: t ?? undefined, emissive: t ? 0xffffff : 0x000000, emissiveMap: t ?? undefined, emissiveIntensity: t ? emissive : 0 });
/** a disc (octagonal) or a square plaque of unit width, its face toward the camera at z = d / 2 */
function slab(skin: SkinId, d: number, faceTex: THREE.Texture, round = skin !== 'bamboo', rope = true) {
  const g = new THREE.Group(), pal = PALETTE[skin];
  const bodyGeo = round ? new THREE.CylinderGeometry(0.5, 0.5, d, 8, 1, false, (5 * Math.PI) / 8).rotateX(Math.PI / 2) : new THREE.BoxGeometry(0.98, 0.98, d);
  const body = new THREE.Mesh(bodyGeo, lam(null, pal.side)); g.add(body);
  const faceMat = lam(faceTex, 0xffffff, 0.5);
  const face = new THREE.Mesh(round ? new THREE.CircleGeometry(0.5, 8, Math.PI / 8) : new THREE.PlaneGeometry(0.98, 0.98), faceMat); face.position.z = d / 2 + 0.002; g.add(face);
  if (skin === 'iron' && round) { const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, d * 0.6, 8, 1, false, (5 * Math.PI) / 8).rotateX(Math.PI / 2), lam(null, 0x1c1d22)); rim.position.z = -d * 0.25; g.add(rim); }
  if (skin === 'bamboo' && rope) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), lam(null, 0x4a2e16)); r.position.set(0, 0.62, -0.02); g.add(r); }
  return { g, faceMat, face };
}
function disposeTree(o: THREE.Object3D) {
  o.traverse(x => { const m = x as THREE.Mesh; if (!m.isMesh) return; m.geometry.dispose(); const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const mt of mats) { const mm = mt as THREE.MeshLambertMaterial; mm.map?.dispose(); mm.dispose(); } });
  o.parent?.remove(o);
}

// ---------------------------------------------------------------- the skill button
export type BtnKey = 'attack' | 'dash' | 'special' | 'jump' | 'ult';
const GLYPH: Record<BtnKey, string> = { attack: '斩', dash: '冲', special: '镖', jump: '跳', ult: '绝' };
export class SkinBtn {
  root = new THREE.Group(); x = 0; y = 0; size = 80; down = false; pid = -1; cd = 0; charge = 0; hot = false;
  private faceMat: THREE.MeshLambertMaterial; private cover: THREE.Mesh; private fill: THREE.Mesh; private pressK = 0; private flashT = 0; private wasReady = true; private tt = 0; private wasFull = false;
  private D = 0.16;
  constructor(private L: UiLayer, public name: BtnKey, private sparks: UiSparks, skin: SkinId) {
    const s = slab(skin, this.D, btnFace(skin, GLYPH[name])); this.root.add(s.g); this.faceMat = s.faceMat;
    const plane = (c: number, o: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false })); m.position.z = this.D / 2 + 0.006; m.visible = false; this.root.add(m); return m; };
    this.cover = plane(0x07050a, 0.6); this.fill = plane(0xffc848, 0.45);
    L.scene.add(this.root);
  }
  hit(x: number, y: number) { const r = this.size * 0.6; return Math.abs(x - this.x) < r && Math.abs(y - this.y) < r; }
  update(dt: number) {
    const L = this.L; this.tt += dt;
    this.pressK += ((this.down ? 1 : 0) - this.pressK) * Math.min(1, dt * 30);
    L.at(this.x, this.y, -this.pressK * 4, this.root.position); this.root.scale.setScalar(L.px(this.size) * (1 - 0.06 * this.pressK));
    const ready = this.cd <= 0, frac = Math.max(0, Math.min(1, this.cd)), fw = 0.84;
    this.cover.visible = !ready; this.cover.scale.set(fw, fw * frac, 1); this.cover.position.y = fw / 2 - (fw * frac) / 2;
    const ch = Math.max(0, Math.min(1, this.charge)), full = ch >= 1;
    this.fill.visible = ch > 0.01; this.fill.scale.set(fw, fw * ch, 1); this.fill.position.y = -fw / 2 + (fw * ch) / 2;
    (this.fill.material as THREE.MeshBasicMaterial).opacity = full ? 0.5 + 0.2 * Math.sin(this.tt * 14) : 0.42;
    if (full && !this.wasFull) this.sparks.burst(L.at(this.x, this.y, 3), 14, L.px(170), L.px(4), 0xffd070, { life: 0.35 });
    this.wasFull = full;
    if (ready && !this.wasReady) { this.flashT = 0.45; this.sparks.burst(L.at(this.x, this.y, 3), 12, L.px(160), L.px(4), 0xffd070, { life: 0.35 }); }
    this.wasReady = ready; this.flashT = Math.max(0, this.flashT - dt);
    const glow = this.flashT > 0 ? this.flashT * 1.6 : full || this.hot ? 0.35 + 0.2 * Math.sin(this.tt * 14) : this.down ? 0.25 : 0;
    this.faceMat.emissiveIntensity = 0.5 + glow; this.faceMat.color.setScalar(ready ? 1 : 0.62);
  }
  dispose() { disposeTree(this.root); }
}

// ---------------------------------------------------------------- the stick
export class SkinStick {
  root = new THREE.Group(); private knobG = new THREE.Group(); private baseMat: THREE.MeshLambertMaterial;
  constructor(private L: UiLayer, skin: SkinId) {
    const b = slab(skin, 0.08, stickFace(skin, false), skin !== 'bamboo', false); this.baseMat = b.faceMat; this.root.add(b.g);
    const k = slab(skin, 0.16, stickFace(skin, true), true, false); k.g.scale.setScalar(0.46); this.knobG.add(k.g); this.knobG.position.z = 0.1; this.root.add(this.knobG);
    L.scene.add(this.root);
  }
  /** s = the input's stick (origin and current thumb, CSS px); home / size = where and how big it rests */
  update(s: { id: number; ox: number; oy: number; x: number; y: number }, home: { x: number; y: number }, size: number) {
    const L = this.L, on = s.id >= 0, ox = on ? s.ox : home.x, oy = on ? s.oy : home.y;
    L.at(ox, oy, 0, this.root.position); this.root.scale.setScalar(L.px(size));
    const dx = on ? s.x - s.ox : 0, dy = on ? s.y - s.oy : 0, d = Math.hypot(dx, dy), r = size * 0.32, k = d > r ? r / d : 1;
    this.knobG.position.set((dx * k) / size, (-dy * k) / size, 0.1);
    this.baseMat.color.setScalar(on ? 1 : 0.72);
  }
  dispose() { disposeTree(this.root); }
}

// ---------------------------------------------------------------- the health bar
export interface HpState { hp: number; maxHp: number }
export class SkinHp {
  root = new THREE.Group(); st: HpState = { hp: 100, maxHp: 100 }; private x = 30; private y = 40; private k = 1;
  private fill: THREE.Mesh | null = null; private lag: THREE.Mesh | null = null; private lagV = 1; private pieces: Array<{ m: THREE.Mesh; mat: THREE.MeshLambertMaterial; drop: number }> = [];
  private shakeT = 0; private flashT = 0; private healT = 0; readonly W: number;
  constructor(private L: UiLayer, private skin: SkinId, private sparks: UiSparks) {
    const pal = PALETTE[skin], box = (w: number, h: number, d: number, c: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(null, c));
    if (skin === 'lacquer') {
      this.W = 300;
      const frame = box(312, 26, 10, pal.body); frame.position.set(150, 0, 0); this.root.add(frame);
      const track = box(300, 14, 2, pal.barBack); track.position.set(150, 0, 5.2); this.root.add(track);
      this.lag = box(1, 14, 2, pal.barLag); this.lag.position.z = 5.6; this.root.add(this.lag);
      this.fill = box(1, 14, 2, pal.bar); this.fill.position.z = 6; this.root.add(this.fill);
      for (const x of [-8, 308]) { const cap = box(16, 38, 14, 0xc8962e); cap.position.set(x, 0, 2); this.root.add(cap); const inner = box(8, 26, 2, 0xb8302a); inner.position.set(x, 0, 9.2); this.root.add(inner); }
      for (let i = 1; i < 6; i++) { const stud = box(4, 4, 2, 0xc8962e); stud.position.set(i * 50, 11, 5.4); this.root.add(stud); }
    } else {
      // a row of bamboo slips bound by two cords / a row of lamellar plates on a red lace
      const n = 10, w = skin === 'bamboo' ? 18 : 22, h = skin === 'bamboo' ? 44 : 30, gap = skin === 'bamboo' ? 4 : 3;
      this.W = n * (w + gap);
      for (let i = 0; i < n; i++) {
        const mat = lam(null, skin === 'bamboo' ? 0xc9ad6a : 0x646a76), m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 8), mat);
        m.position.set(i * (w + gap) + w / 2, 0, 0); this.root.add(m); this.pieces.push({ m, mat, drop: 0 });
      }
      if (skin === 'bamboo') for (const y of [-12, 12]) { const cord = box(this.W + 8, 3, 10, 0x4a2e16); cord.position.set(this.W / 2 - 2, y, 0.5); this.root.add(cord); }
      else { const lace = box(this.W + 4, 3, 10, 0xa8261f); lace.position.set(this.W / 2 - 1.5, 10, 0.5); this.root.add(lace); const lace2 = box(this.W + 4, 2, 10, 0x7a1814); lace2.position.set(this.W / 2 - 1.5, -11, 0.5); this.root.add(lace2); }
    }
    // a long bar: no turn toward the screen centre (that folds it away at the edge), just a slight tip back so its thickness shows
    this.root.userData.noTilt = true; this.root.rotation.set(-0.25, 0.2, 0);
    L.scene.add(this.root);
  }
  place(x: number, y: number, k: number) { this.x = x; this.y = y; this.k = k; }
  set(s: Partial<HpState>) { Object.assign(this.st, s); }
  hit(dmg: number, s?: Partial<HpState>) { if (s) this.set(s); this.shakeT = 0.3; this.flashT = 0.25; void dmg; }
  heal(s?: Partial<HpState>) { if (s) this.set(s); this.healT = 0.5; this.sparks.burst(this.L.at(this.x + this.W * this.k * 0.5, this.y, 6), 14, this.L.px(120), this.L.px(5), 0x7aff9a, { life: 0.6, up: this.L.px(140) }); cue('heal', 0.6); }
  /** where the number goes (CSS px, left-aligned) */
  textAt() { return { x: this.x + (this.W + 26) * this.k, y: this.y - 8 * this.k }; }
  barAt() { return { x: this.x + this.W * this.k / 2, y: this.y, h: (this.skin === 'bamboo' ? 44 : this.skin === 'iron' ? 30 : 14) * this.k }; }
  update(dt: number) {
    const L = this.L, f = Math.max(0, Math.min(1, this.st.hp / Math.max(1, this.st.maxHp)));
    this.shakeT = Math.max(0, this.shakeT - dt); this.flashT = Math.max(0, this.flashT - dt); this.healT = Math.max(0, this.healT - dt);
    const sx = this.shakeT > 0 ? Math.sin(this.shakeT * 90) * 4 * this.shakeT / 0.3 : 0;
    L.at(this.x + sx, this.y, 0, this.root.position); this.root.scale.setScalar(L.px(this.k));
    this.lagV = Math.max(f, this.lagV - dt * 0.6);
    if (this.fill && this.lag) {
      const W = this.W; this.fill.scale.x = Math.max(0.001, W * f); this.fill.position.x = (W * f) / 2; this.lag.scale.x = Math.max(0.001, W * this.lagV); this.lag.position.x = (W * this.lagV) / 2;
      (this.fill.material as THREE.MeshLambertMaterial).emissive.setHex(this.flashT > 0 ? 0xffffff : this.healT > 0 ? 0x2a6a2a : 0x000000); (this.fill.material as THREE.MeshLambertMaterial).emissiveIntensity = this.flashT > 0 ? this.flashT * 2 : this.healT > 0 ? 1 : 0;
    }
    const n = this.pieces.length;
    this.pieces.forEach((p, i) => {
      const v = Math.max(0, Math.min(1, f * n - i)), lost = v <= 0;
      p.drop += ((lost ? 1 : 0) - p.drop) * Math.min(1, dt * 8);
      p.m.position.y = -p.drop * 8; p.m.scale.y = lost ? 1 : 0.35 + 0.65 * v;
      const base = this.skin === 'bamboo' ? 0xc9ad6a : 0x646a76, dead = this.skin === 'bamboo' ? 0x4a3a22 : 0x2a2c32;
      p.mat.color.setHex(lost ? dead : base); p.mat.emissive.setHex(this.flashT > 0 && !lost ? 0xff4a3a : this.healT > 0 && !lost ? 0x3a8a3a : 0x000000); p.mat.emissiveIntensity = this.flashT > 0 || this.healT > 0 ? 0.6 : 0;
    });
  }
  dispose() { disposeTree(this.root); }
}

// ---------------------------------------------------------------- the banner
export class SkinBanner {
  private m: THREE.Mesh | null = null; private t = 99; private hold = 0; private W = 1; private H = 1;
  bottomY = 0;
  private title = ''; private sub = ''; private color?: string; private unlisten: () => void;
  constructor(private L: UiLayer, private skin: SkinId, private bossOn: () => boolean = () => false) {
    this.unlisten = onBodyFontChange(() => { if (this.m) this.repaint(); });
  }
  private repaint() {
    const f = bannerFace(this.skin, this.title, this.sub, this.color); this.W = f.W; this.H = f.H;
    if (this.m) { const mat = (this.m.material as THREE.MeshLambertMaterial[])[4]; mat.map?.dispose(); mat.map = f.t; mat.emissiveMap = f.t; mat.needsUpdate = true; }
  }
  show(title: string, sub = '', hold = 1.2, color?: string) {
    this.clear();
    this.title = title; this.sub = sub; this.color = color && this.skin !== 'bamboo' ? color : undefined;
    const f = bannerFace(this.skin, title, sub, this.color); this.W = f.W; this.H = f.H;
    const mat = lam(f.t, 0xffffff, 0.6), body = lam(null, PALETTE[this.skin].side);
    const box = new THREE.BoxGeometry(1, 1, 0.08);
    if (OPT.bannerFaces) {
      // Five sides share the same opaque iron. Keep the painted front in slot four for repaint().
      const index = Array.from(box.index!.array);
      box.setIndex([...index.slice(0,24), ...index.slice(30), ...index.slice(24,30)]);
      box.clearGroups(); box.addGroup(0,30,0); box.addGroup(30,6,4);
    }
    this.m = new THREE.Mesh(box, [body, body, body, body, mat, body]); this.m.renderOrder = 20; this.L.scene.add(this.m);
    this.t = 0; this.hold = hold * 0.7;
  }
  hide() { this.hold = 0; this.t = 99; this.clear(); }
  private clear() { this.bottomY = 0; if (this.m) { disposeTree(this.m); this.m = null; } }
  update(dt: number) {
    if (!this.m) return;
    this.t += dt; const L = this.L, inT = Math.min(1, this.t / 0.22), out = Math.max(0, (this.t - 0.22 - this.hold) / 0.25);
    if (out >= 1) { this.clear(); return; }
    // one scale for every banner (art px → screen px), so 「清场」 and a two-line room banner have the same letter size; only a very wide one shrinks to fit
    const scale = Math.min(L.h * 1.7 / 720, L.w * 0.8 / this.W), wpx = this.W * scale, hpx = this.H * scale;
    const top = L.h * (this.bossOn() ? 0.13 : 0.05);
    this.bottomY = top + hpx;
    L.at(L.w / 2, top + hpx / 2 - (1 - inT) * 30 - out * 30, 0, this.m.position);
    this.m.scale.set(L.px(wpx), L.px(hpx), L.px(hpx * 0.6)); this.m.visible = true;
    (this.m.material as THREE.Material[])[4].opacity = 1;
  }
  dispose() { this.clear(); this.unlisten(); }
}
