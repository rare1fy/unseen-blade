// Pixel Chinese text for the v2 slice: the baked Fusion Pixel 12px bitmap font (ui/font.js) drawn into canvases, used by the 2D
// overlay (cards, plates, banners) and by world sprites (damage numbers, row titles). One font pixel = `scale` device pixels, so the
// glyphs stay square and crisp; an optional 1-pixel outline is drawn in the four axis directions only (no diagonals).
import * as THREE from 'three';
import FONT_DATA from '../../../ui/font.js';
import { scene } from '../engine/world';
import { anim, ease, lerp } from '../engine/clock';
import { canvasOf } from '../hud/paint';
import { t, language, wrapWords } from '../act/i18n';

interface FontData { size: number; chars: string; adv: string; bits: string; advOff?: number }
interface Glyph { adv: number; rows: Uint8Array }

const F = FONT_DATA as FontData, SIZE = F.size || 12;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64(s: string) {
  s = s.replace(/[^A-Za-z0-9+/]/g, ''); const n = Math.floor(s.length * 3 / 4), out = new Uint8Array(n), T = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) T[B64.charCodeAt(i)] = i;
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = T[s.charCodeAt(i)], b = T[s.charCodeAt(i + 1)], c = i + 2 < s.length ? T[s.charCodeAt(i + 2)] : -1, d = i + 3 < s.length ? T[s.charCodeAt(i + 3)] : -1;
    const v = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    if (o < n) out[o++] = (v >> 16) & 255; if (c >= 0 && o < n) out[o++] = (v >> 8) & 255; if (d >= 0 && o < n) out[o++] = v & 255;
  }
  return out;
}
const BITS = b64(F.bits || '');
const MAP = new Map<number, { off: number; adv: number }>();
{ let off = 0, i = 0; for (const ch of F.chars) { const adv = (parseInt(F.adv[i], 16) + (F.advOff ?? 0)) || SIZE; MAP.set(ch.codePointAt(0)!, { off, adv }); off += adv * SIZE; i++; } }
const CACHE = new Map<number, Glyph>();
export const MISSING = new Set<string>();
/** hand-drawn replacements: Fusion Pixel's 12px 双 is two bold 2-px X's that read as 「XX」 (user 11-14); this one is 又又 in 1-px strokes, the left 又 a narrow 7 with its dot, the right one a full 又 */
const OVERRIDE: Record<number, string[]> = {
  0x53cc: ['............', '####..######', '...#.......#', '...#.......#', '...#.......#', '#..#..#...#.', '.#.#...#..#.', '..#.....##..', '.#.#....##..', '#...#..#..#.', '......#....#', '............'],
};
function glyph(cp: number): Glyph {
  let g = CACHE.get(cp); if (g) return g;
  const ov = SIZE === 12 ? OVERRIDE[cp] : undefined;   // (the hand-drawn 双 is a 12 px glyph; the 16 px font draws its own)
  if (ov) { const adv = ov[0].length, rows = new Uint8Array(adv * SIZE); ov.forEach((r, y) => { for (let x = 0; x < adv; x++) if (r[x] === '#') rows[y * adv + x] = 1; }); g = { adv, rows }; CACHE.set(cp, g); return g; }
  const m = MAP.get(cp);
  if (!m) {
    const wide = cp >= 0x2e80; const adv = cp === 32 ? 6 : wide ? 12 : 6, rows = new Uint8Array(adv * SIZE);
    if (cp !== 32) { MISSING.add(String.fromCodePoint(cp)); for (let y = 2; y < SIZE - 2; y++) for (let x = 1; x < adv - 1; x++) if (y === 2 || y === SIZE - 3 || x === 1 || x === adv - 2) rows[y * adv + x] = 1; }
    g = { adv, rows };
  } else {
    const rows = new Uint8Array(m.adv * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < m.adv; x++) { const b = m.off + y * m.adv + x; if (BITS[b >> 3] & (128 >> (b & 7))) rows[y * m.adv + x] = 1; }
    g = { adv: m.adv, rows };
  }
  CACHE.set(cp, g); return g;
}

/** width of a line in font pixels */
export function pixW(text: string) { let w = 0; for (const ch of t(text)) w += glyph(ch.codePointAt(0)!).adv; return w; }
export const PIX_H = SIZE;

/** wrap text into lines no wider than maxW font pixels (CJK breaks anywhere, \n forces a break) */
export function pixWrap(text: string, maxW: number): string[] {
  if (language === 'en') return t(text).split('\n').flatMap(line => wrapWords(line, maxW, pixW));
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '', w = 0;
    for (const ch of para) { const a = glyph(ch.codePointAt(0)!).adv; if (w + a > maxW && line) { out.push(line); line = ''; w = 0; if (ch === ' ') continue; } line += ch; w += a; }
    out.push(line);
  }
  return out;
}

export interface PixStyle { scale: number; color: string; outline?: string | null; align?: 'left' | 'center' | 'right' }
/** draw one line at (x, y) = top-left (or centre / right per align) in device px */
export function drawPix(g: CanvasRenderingContext2D, text: string, x: number, y: number, st: PixStyle) {
  text = t(text);
  const s = Math.max(1, Math.round(st.scale)), w = pixW(text) * s;
  let cx = st.align === 'center' ? x - w / 2 : st.align === 'right' ? x - w : x; cx = Math.round(cx); y = Math.round(y);
  const pass = (col: string, dx: number, dy: number) => {
    g.fillStyle = col; let px = cx;
    for (const ch of text) {
      const gl = glyph(ch.codePointAt(0)!);
      for (let r = 0; r < SIZE; r++) { let run = -1; for (let c = 0; c <= gl.adv; c++) { const on = c < gl.adv && gl.rows[r * gl.adv + c]; if (on && run < 0) run = c; else if (!on && run >= 0) { g.fillRect(px + run * s + dx, y + r * s + dy, (c - run) * s, s); run = -1; } } }
      px += gl.adv * s;
    }
  };
  if (st.outline) for (const [dx, dy] of [[-s, 0], [s, 0], [0, -s], [0, s]]) pass(st.outline, dx, dy);
  pass(st.color, 0, 0);
  return w;
}

// ---------------------------------------------------------------- world sprites (damage numbers, titles)
export function pixSprite(text: string, o: { color?: string; outline?: string; h?: number; bg?: string } = {}) {
  const pad = o.bg ? 4 : 1, w = pixW(text) + pad * 2, h = SIZE + pad * 2, { c, g } = canvasOf(w, h);
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(1, 0, w - 2, h); g.fillRect(0, 1, w, h - 2); }
  drawPix(g, text, pad, pad, { scale: 1, color: o.color ?? '#fff6d8', outline: o.bg ? null : o.outline ?? '#1a0e16' });
  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const sp = new THREE.Sprite(mat), H = o.h ?? 0.55; sp.scale.set(H * w / h, H, 1); sp.renderOrder = 20; sp.userData.base = sp.scale.clone();
  scene.add(sp); return sp;
}
export function dropSprite(s: THREE.Sprite) { scene.remove(s); (s.material as THREE.SpriteMaterial).map?.dispose(); s.material.dispose(); }
/** a number / word that punches in, rises and fades */
export function popPix(text: string, at: THREE.Vector3, o: { color?: string; outline?: string; h?: number; life?: number; rise?: number; big?: boolean } = {}) {
  const s = pixSprite(text, { ...o, h: (o.h ?? 0.55) * (o.big ? 1.5 : 1) }); s.position.copy(at);
  const b = (s.userData.base as THREE.Vector3).clone(), y0 = at.y, life = o.life ?? 1.0, rise = o.rise ?? 0.8, mat = s.material as THREE.SpriteMaterial;
  anim(life, k => {
    s.position.y = y0 + rise * ease.outCubic(k);
    const sc = k < 0.1 ? lerp(0.3, 1.35, k / 0.1) : lerp(1.35, 1, Math.min(1, (k - 0.1) / 0.2)); s.scale.set(b.x * sc, b.y * sc, 1);
    mat.opacity = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
  }, () => dropSprite(s));
  return s;
}
