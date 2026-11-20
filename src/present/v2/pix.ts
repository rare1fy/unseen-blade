// Pixel Chinese text for the v2 slice: the baked Fusion Pixel 12px bitmap font (ui/font.js) drawn into canvases, used by the 2D
// overlay (cards, plates, banners) and by world sprites (damage numbers, row titles). One font pixel = `scale` device pixels, so the
// glyphs stay square and crisp; an optional 1-pixel outline is drawn in the four axis directions only (no diagonals).
import * as THREE from 'three';
import FONT_DATA from '../../../ui/font.js';
import { OPT } from '../engine/perfOpts';
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
type SpriteStyle = { color?: string; outline?: string; h?: number; bg?: string };
const glyphTextures = new Map<string, THREE.CanvasTexture>();
// Evict even if a live number still holds its texture: the sprite releases its own reference when it fades.
const users = new WeakMap<THREE.Texture, number>();
const retained = new WeakSet<THREE.Texture>();
function paintSprite(text: string, o: SpriteStyle) {
  const pad = o.bg ? 4 : 1, w = pixW(text) + pad * 2, h = SIZE + pad * 2, { c, g } = canvasOf(w, h);
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(1, 0, w - 2, h); g.fillRect(0, 1, w, h - 2); }
  drawPix(g, text, pad, pad, { scale: 1, color: o.color ?? '#fff6d8', outline: o.bg ? null : o.outline ?? '#1a0e16' });
  const tex = new THREE.CanvasTexture(c as HTMLCanvasElement); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  return tex;
}
export function pixSprite(text: string, o: SpriteStyle = {}) {
  // Repeated damage values have identical canvas pixels. Height only changes the mesh.
  const key = JSON.stringify([text, o.color, o.outline, o.bg]);
  let tex = OPT.dirtyUploads ? glyphTextures.get(key) : undefined;
  if (!tex) {
    tex = paintSprite(text, o);
    if (OPT.dirtyUploads) {
      glyphTextures.set(key, tex); retained.add(tex);
      if (glyphTextures.size > 64) {
        const oldest = glyphTextures.keys().next().value!, prev = glyphTextures.get(oldest)!;
        glyphTextures.delete(oldest); retained.delete(prev);
        if (!users.get(prev)) prev.dispose();
      }
    }
  }
  users.set(tex, (users.get(tex) ?? 0) + 1);
  const { width: w, height: h } = tex.image as HTMLCanvasElement;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const sp = new THREE.Sprite(mat), H = o.h ?? 0.55; sp.scale.set(H * w / h, H, 1); sp.renderOrder = 20; sp.userData.base = sp.scale.clone();
  scene.add(sp); return sp;
}
export function dropSprite(s: THREE.Sprite) {
  scene.remove(s); const tex = s.material.map;
  if (tex) { const n = Math.max(0, (users.get(tex) ?? 1) - 1); users.set(tex, n); if (!n && !retained.has(tex)) tex.dispose(); }
  s.material.dispose();
}
export type PopTier = 'dot' | 'normal' | 'crit' | 'highlight';

interface LivePop { x: number; y: number; z: number; t0: number }
const LIVE_POPS: LivePop[] = [];
let popSeq = 0;

/** Anti-overlap fan-out + 4 distinct visual tiers (dot / normal / crit / highlight) so numbers never blur together and big plays pop cleanly. */
export function popPix(
  text: string,
  at: THREE.Vector3,
  o: { color?: string; outline?: string; h?: number; life?: number; rise?: number; big?: boolean; tier?: PopTier; accent?: string } = {},
) {
  const tier: PopTier = o.tier ?? (o.big ? 'crit' : 'normal');
  const now = performance.now() / 1000;
  for (let i = LIVE_POPS.length - 1; i >= 0; i--) {
    if (now - LIVE_POPS[i].t0 > 0.42) LIVE_POPS.splice(i, 1);
  }
  let near = 0;
  for (const p of LIVE_POPS) {
    if (Math.hypot(p.x - at.x, p.z - at.z) < 1.35 && Math.abs(p.y - at.y) < 1.25) near++;
  }
  const slot = near, seq = ++popSeq;
  const sideSign = ((slot + seq) & 1) ? 1 : -1;
  const spreadX = tier === 'highlight'
    ? (slot > 0 ? sideSign * (0.26 + Math.min(2, slot) * 0.22) : 0)
    : tier === 'dot'
      ? sideSign * (0.44 + (slot % 3) * 0.22)
      : (slot > 0 ? sideSign * (0.28 + ((slot - 1) % 3) * 0.24) : (seq & 1 ? 0.08 : -0.08));
  const spreadY = tier === 'highlight'
    ? 0.44 + Math.min(2, slot) * 0.34
    : tier === 'crit'
      ? 0.16 + Math.min(3, slot) * 0.28
      : tier === 'dot'
        ? -0.06 + (slot % 3) * 0.18
        : Math.min(4, slot) * 0.24;

  const hBase = o.h ?? (tier === 'highlight' ? 0.94 : tier === 'crit' ? 0.72 : tier === 'dot' ? 0.38 : 0.48);
  const color = o.color ?? (tier === 'highlight' ? '#fff4cc' : tier === 'crit' ? '#ffe478' : tier === 'dot' ? '#e87868' : '#f6f2e8');
  const outline = o.outline ?? (tier === 'highlight' ? '#1c0a08' : tier === 'crit' ? '#261206' : '#140c0a');

  let s: THREE.Sprite;
  if (tier === 'highlight') {
    // Dedicated highlight callout sprite with crisp gold/crimson underline bar so 破 / 见切 / 闪 / 血爆 / 斩 stand apart from damage digits
    const scale = 2, pad = 4, tw = pixW(text) * scale, w = Math.max(8, tw + pad * 2), hh = PIX_H * scale + 10;
    const { c, g } = canvasOf(w, hh);
    const barW = Math.max(10, tw + 4), bx = Math.round((w - barW) / 2), by = hh - 5;
    g.fillStyle = outline; g.fillRect(bx - 2, by - 2, barW + 4, 5);
    g.fillStyle = o.accent ?? color; g.fillRect(bx, by, barW, 2);
    drawPix(g, text, Math.round(w / 2), 2, { scale, color, outline, align: 'center' });
    const tex = new THREE.CanvasTexture(c as HTMLCanvasElement);
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    s = new THREE.Sprite(mat); s.scale.set(hBase * w / hh, hBase, 1); s.renderOrder = 26; s.userData.base = s.scale.clone();
    scene.add(s);
  } else {
    s = pixSprite(text, { color, outline, h: hBase });
    s.renderOrder = tier === 'crit' ? 24 : tier === 'dot' ? 19 : 21;
  }

  const startPos = at.clone().add(new THREE.Vector3(spreadX, spreadY, 0));
  s.position.copy(startPos);
  LIVE_POPS.push({ x: at.x, y: at.y, z: at.z, t0: now });

  const b = (s.userData.base as THREE.Vector3).clone(), mat = s.material as THREE.SpriteMaterial;
  const life = o.life ?? (tier === 'highlight' ? 1.08 : tier === 'crit' ? 0.92 : tier === 'dot' ? 0.62 : 0.78);
  const rise = o.rise ?? (tier === 'highlight' ? 0.72 : tier === 'crit' ? 0.88 : tier === 'dot' ? 0.52 : 0.72);
  const driftX = tier === 'dot' ? sideSign * 0.34 : tier === 'normal' ? sideSign * 0.16 : tier === 'crit' ? sideSign * 0.12 : 0;
  anim(life, k => {
    const lift = ease.outCubic(k);
    s.position.set(startPos.x + driftX * lift, startPos.y + rise * lift, startPos.z);
    let sc = 1;
    if (tier === 'highlight') {
      sc = k < 0.12 ? lerp(0.5, 1.42, k / 0.12) : k < 0.26 ? lerp(1.42, 1.0, (k - 0.12) / 0.14) : 1.0;
    } else if (tier === 'crit') {
      sc = k < 0.1 ? lerp(0.4, 1.36, k / 0.1) : lerp(1.36, 1.0, Math.min(1, (k - 0.1) / 0.18));
    } else {
      sc = k < 0.1 ? lerp(0.65, 1.12, k / 0.1) : lerp(1.12, 1.0, Math.min(1, (k - 0.1) / 0.15));
    }
    s.scale.set(b.x * sc, b.y * sc, 1);
    const fadeAt = tier === 'highlight' ? 0.72 : tier === 'crit' ? 0.68 : 0.62;
    mat.opacity = k > fadeAt ? Math.max(0, 1 - (k - fadeAt) / (1 - fadeAt)) : 1;
  }, () => dropSprite(s));
  return s;
}
