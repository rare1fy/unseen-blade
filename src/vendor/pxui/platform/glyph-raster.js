// glyph-raster.js — rasterise Fusion Pixel 12px glyphs into 1-bit bitmaps with a 2D canvas (browser only).
// Used by the bake tool (tools/bake-font.mjs drives it in headless Chrome), the editor's 「烘焙字库」, and live fallback in dev.
export const FAMILY = 'PxuiFusionPixel';
export async function loadFusion(url) {
  if (typeof FontFace === 'undefined') return false; for (const f of document.fonts) if (f.family === FAMILY && f.status === 'loaded') return true;
  const ff = new FontFace(FAMILY, `url(${url})`); await ff.load(); document.fonts.add(ff); return true;
}
let ctx = null, base = 10;
function context() {
  if (ctx) return ctx; const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(32, 16) : Object.assign(document.createElement('canvas'), { width: 32, height: 16 });
  ctx = c.getContext('2d', { willReadFrequently: true }); ctx.font = `12px ${FAMILY}`; ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText('国'); const asc = m.fontBoundingBoxAscent ?? 10, desc = m.fontBoundingBoxDescent ?? 2; base = Math.round(asc - (asc + desc - 12) / 2); return ctx;
}
// -> { adv, bits: Uint8Array(adv*12) of 0/1 }  (null if the font lacks the glyph)
export function rasterBits(ch) {
  const g = context(); g.clearRect(0, 0, 32, 16); g.fillStyle = '#fff'; g.fillText(ch, 0, base);
  let adv = Math.round(g.measureText(ch).width); if (!(adv > 0)) return null; adv = Math.min(16, adv);
  const img = g.getImageData(0, 0, adv, 12).data, bits = new Uint8Array(adv * 12); let any = false;
  for (let i = 0; i < adv * 12; i++) if (img[i * 4 + 3] >= 128) { bits[i] = 1; any = true; }
  return { adv, bits, any };
}
export function rasterRGBA(ch) { const r = rasterBits(ch); if (!r) return null; const data = new Uint8Array(r.adv * 12 * 4); for (let i = 0; i < r.bits.length; i++) if (r.bits[i]) data.set([255, 255, 255, 255], i * 4); return { adv: r.adv, data }; }
// does the font have this glyph? (Fusion Pixel draws a notdef box for missing ones; compare with a private-use code point)
let notdef = null;
export function hasGlyph(ch) { if (!notdef) { const r = rasterBits(''); notdef = r ? r.bits.join('') : ''; } const r = rasterBits(ch); return !!r && (r.bits.join('') !== notdef || ch === ' '); }
// bake a font module object from a list of characters
export function bakeFont(chars, name = 'fusion-pixel-12') {
  const list = [...new Set([...chars])].filter(ch => ch !== '\n' && ch !== '\r' && ch !== '\t'); const ok = [], adv = [], bitsAll = []; const missing = [];
  for (const ch of list) { if (ch !== ' ' && !hasGlyph(ch)) { missing.push(ch); continue; } const r = rasterBits(ch); if (!r) { missing.push(ch); continue; } ok.push(ch); adv.push(r.adv.toString(16)); for (const b of r.bits) bitsAll.push(b); }
  const bytes = new Uint8Array(Math.ceil(bitsAll.length / 8)); for (let i = 0; i < bitsAll.length; i++) if (bitsAll[i]) bytes[i >> 3] |= 128 >> (i & 7);
  let s = ''; const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < bytes.length; i += 3) { const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2], v = (a << 16) | ((b || 0) << 8) | (c || 0); s += B[v >> 18 & 63] + B[v >> 12 & 63] + (i + 1 < bytes.length ? B[v >> 6 & 63] : '=') + (i + 2 < bytes.length ? B[v & 63] : '='); }
  return { font: { name, size: 12, chars: ok.join(''), adv: adv.join(''), bits: s }, missing, count: ok.length, bytes: bytes.length };
}
