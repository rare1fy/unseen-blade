// How dice look: material families, face painting and numerals. This is the replaceable part (look packs supply their own
// DiceStyle); the identity design (which die gets which silhouette parts and effects, signature.ts) stays the v5 design.
// The neutral style below is v5's: per-family material + pattern, a hard 1-texel bevel, 5×7 dot-matrix numerals.
import visual from '../data/visualData.json';

export interface Fam { name: string; base: string; base2: string; pip: string; pat: string; rough: number; metal?: number; clear?: number; opacity?: number; emis?: string; glowPip?: boolean; tint?: number; gold?: boolean }
export interface NumStyle { col?: string; stroke?: string; glow?: string; numScale?: number }

export const FAM: Record<string, Fam> = {
  ivory: { name: '象牙', base: '#efe6d2', base2: '#d6c8a8', pip: '#2a2018', pat: 'ivory', rough: 0.42, clear: 0.6 },
  steel: { name: '精钢', base: '#c4ccd6', base2: '#8a94a2', pip: '#16202e', pat: 'brushed', rough: 0.28, metal: 0.75 },
  amethyst: { name: '紫晶', base: '#7a4ab0', base2: '#4e2a80', pip: '#f4e4ff', glowPip: true, pat: 'crystal', rough: 0.12, clear: 1, emis: '#c080ff' },
  chaos: { name: '混沌熔核', base: '#2a0808', base2: '#b8281a', pip: '#ffd040', glowPip: true, pat: 'swirl', emis: '#ff4a20', rough: 0.3 },
  cursed: { name: '诅咒黑石', base: '#3a2a3e', base2: '#22162a', pip: '#c860ff', glowPip: true, pat: 'glyph', emis: '#b040f0', rough: 0.7 },
  cracked: { name: '碎裂岩', base: '#7c7870', base2: '#585448', pip: '#1a1814', pat: 'cracks', rough: 0.92 },
  warrior: { name: '铁血', base: '#8e939c', base2: '#5e636c', pip: '#b41c1c', pat: 'iron', rough: 0.42, metal: 0.6, tint: 0.3 },
  // v5 identity families (02s_dicesig.js)
  blood: { name: '血琥珀', base: '#5e0c12', base2: '#8e1c1e', pip: '#f6e6c8', pat: 'swirl', rough: 0.16, clear: 1, emis: '#ff2a1a' },
  bulwark: { name: '铆钢', base: '#98a2ae', base2: '#6a7480', pip: '#18202a', pat: 'brushed', rough: 0.32, metal: 0.85 },
  fury: { name: '怒焰黑铁', base: '#221816', base2: '#3a2418', pip: '#ffb040', glowPip: true, pat: 'lava', emis: '#ff6a1a', rough: 0.36, metal: 0.4 },
  // new for this slice, following the v5 recipe (one identity point per die)
  titan: { name: '泰坦黑钢', base: '#2c2f36', base2: '#4a4e58', pip: '#ffe6a0', glowPip: true, pat: 'plates', emis: '#ffb040', rough: 0.3, metal: 0.9 },
  gale: { name: '旋风青铜', base: '#5a8a7a', base2: '#2e5a4e', pip: '#f0fff8', pat: 'gale', rough: 0.3, metal: 0.55 },
  headsman: { name: '刽子手铁', base: '#1c1c22', base2: '#3a0e12', pip: '#ff3a3a', glowPip: true, pat: 'notch', emis: '#ff1a1a', rough: 0.4, metal: 0.7 },
};
export const SPECIAL_FAM: Record<string, string> = {
  standard: 'ivory', blade: 'steel', amplify: 'amethyst', chaos: 'chaos', cursed: 'cursed', cracked: 'cracked',
  w_bloodthirst: 'blood', w_ironwall: 'bulwark', w_fury: 'fury', w_titanfist: 'titan', w_whirlwind: 'gale', w_execute: 'headsman',
};
export const famKey = (defId: string) => SPECIAL_FAM[defId] || (defId.startsWith('w_') ? 'warrior' : 'ivory');

/** Numeral style per identity die (v5 DSIG col / stroke / glow). */
export const NUM_STYLE: Record<string, NumStyle> = {
  standard: { col: '#2a2018' },
  w_bloodthirst: { col: '#f6e6c8', stroke: '#2a0606' },
  w_ironwall: { col: '#18202a' },
  w_fury: { col: '#ffd070', glow: '#ff5a10' },
  w_titanfist: { col: '#ffe6a0', stroke: '#14100a', glow: '#ffb040' },
  w_whirlwind: { col: '#f0fff8', stroke: '#10302a' },
  w_execute: { col: '#ff4a4a', stroke: '#0a0000', glow: '#ff1a1a' },
};

const GLYPH57: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};
function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mixHex(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}
const lum = (hex: string) => { const p = parseInt(hex.slice(1), 16); return (((p >> 16) & 255) * 0.3 + ((p >> 8) & 255) * 0.59 + (p & 255) * 0.11) / 255; };

/** 5×7 dot-matrix numeral, as large as the face allows, with a 1-cell contrasting edge (v5 drawGlyphNum). */
function drawGlyphNum(g: CanvasRenderingContext2D, eg: CanvasRenderingContext2D, T: number, txt: string, ink: string, ns: NumStyle | undefined, fam: Fam) {
  const n = txt.length, cs = Math.max(2, Math.floor(T * (n > 1 ? 0.078 : 0.118) * (ns?.numScale || 1))), gw = (5 * n + (n - 1)) * cs, gh = 7 * cs;
  const x0 = Math.round((T - gw) / 2), y0 = Math.round((T - gh) / 2), on: Array<[number, number]> = [];
  [...txt].forEach((ch, ci) => (GLYPH57[ch] || GLYPH57['0']).forEach((row, r) => [...row].forEach((b, c) => { if (b === '1') on.push([x0 + (ci * 6 + c) * cs, y0 + r * cs]); })));
  const edge = ns?.stroke || (lum(ink) > 0.5 ? 'rgba(12,8,4,0.95)' : 'rgba(255,250,236,0.92)');
  g.fillStyle = edge; for (const [x, y] of on) g.fillRect(x - cs, y - cs, cs * 3, cs * 3);
  g.fillStyle = ink; for (const [x, y] of on) g.fillRect(x, y, cs, cs);
  if (fam.glowPip || ns?.glow) { eg.fillStyle = ns?.glow || fam.emis || fam.pip; for (const [x, y] of on) eg.fillRect(x, y, cs, cs); }
}

/** Paint one face tile (material background + pattern + bevel + numeral) at x-offset ox. g = albedo, eg = emissive. */
export function paintFace(g: CanvasRenderingContext2D, eg: CanvasRenderingContext2D, ox: number, T: number, value: number, defId: string, seed: number) {
  const fk = famKey(defId), F = FAM[fk], rnd = mulberry(seed), dc = (visual.diceColors as Record<string, string[]>)[defId];
  const base = F.tint && dc ? mixHex(F.base, dc[2], F.tint) : F.base;
  g.save(); g.translate(ox, 0); eg.save(); eg.translate(ox, 0);
  g.fillStyle = base; g.fillRect(0, 0, T, T); eg.fillStyle = '#000'; eg.fillRect(0, 0, T, T);
  const line = (ctx: CanvasRenderingContext2D, col: string, w: number, pts: number[], a = 1) => { ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); ctx.globalAlpha = 1; };
  const crack = (n: number, len: number) => { const pts = [rnd() * T, rnd() * T]; let a = rnd() * Math.PI * 2; for (let i = 0; i < n; i++) { a += (rnd() - 0.5) * 1.4; pts.push(pts[pts.length - 2] + Math.cos(a) * len, pts[pts.length - 1] + Math.sin(a) * len); } return pts; };
  switch (F.pat) {
    case 'lava': for (let i = 0; i < 5; i++) { const p = crack(6, T * 0.12); line(g, '#ff7a2a', 3, p); line(eg, F.emis!, 5, p); } for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.5 ? '#2a1c18' : '#120c0c'; g.fillRect(rnd() * T, rnd() * T, 3, 3); } break;
    case 'glyph': for (let i = 0; i < 4; i++) line(g, '#1a0e1e', 3, crack(4, T * 0.14)); break;
    case 'cracks': for (let i = 0; i < 6; i++) { const p = crack(5, T * 0.14); line(g, '#2a2620', 3, p); line(g, '#a8a498', 1, p.map(v => v + 1.5)); } break;
    case 'iron': for (let i = 0; i < 26; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'; g.fillRect(0, rnd() * T, T, 1 + rnd() * 2); } break;
    case 'crystal': { const gr = g.createLinearGradient(0, 0, T, T); gr.addColorStop(0, mixHex(base, '#ffffff', 0.35)); gr.addColorStop(0.5, base); gr.addColorStop(1, F.base2); g.fillStyle = gr; g.fillRect(0, 0, T, T); break; }
    case 'brushed': for (let i = 0; i < 60; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'; g.fillRect(0, rnd() * T, T, 1); } break;
    case 'ivory': for (let i = 0; i < 8; i++) { const y0 = rnd() * T; line(g, '#e2d6bc', 2, [0, y0, T, y0 + (rnd() - 0.5) * 20], 0.5); } break;
    case 'swirl': for (let i = 0; i < 4; i++) { const p = crack(8, T * 0.1); line(g, F.base2, 4, p); line(eg, F.emis ? '#7a1a08' : '#000', 4, p); } break;
    case 'plates': { g.fillStyle = F.base2; const m = Math.round(T * 0.16); g.fillRect(m, m, T - 2 * m, T - 2 * m); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(m, T - m - 2, T - 2 * m, 2); g.fillRect(T - m - 2, m, 2, T - 2 * m); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(m, m, T - 2 * m, 1); break; }
    case 'gale': for (let i = 0; i < 5; i++) { const r0 = T * (0.15 + i * 0.07); g.strokeStyle = 'rgba(220,255,240,0.22)'; g.lineWidth = 2; g.beginPath(); g.arc(T / 2, T / 2, r0, i, i + 2.4); g.stroke(); } break;
    case 'notch': for (let i = 0; i < 3; i++) { const y = T * (0.2 + i * 0.3); line(g, F.base2, 3, [0, y, T * 0.18, y + 4]); line(eg, '#300000', 3, [0, y, T * 0.18, y + 4]); } break;
  }
  // a hard 1-texel bevel (light top-left, dark bottom-right): crisp edges without rounding the cube
  g.fillStyle = 'rgba(255,255,255,0.38)'; g.fillRect(0, 0, T, 1); g.fillRect(0, 0, 1, T);
  g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(0, T - 1, T, 1); g.fillRect(T - 1, 0, 1, T);
  const ns = NUM_STYLE[defId];
  drawGlyphNum(g, eg, T, String(value), ns?.col || F.pip, ns, F);
  g.restore(); eg.restore();
}
