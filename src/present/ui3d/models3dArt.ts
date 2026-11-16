// Voxel recipes for the R5 UI models (models3d.ts builds, caches and instances them). Authored in cells: x right, y up, +z toward
// the viewer; every model is a thick block (4–8 cells deep) made of big axis-aligned masses with few tiers (art rule: no stair-stepped
// diagonals, no random speckle). Glowing cells (g = 1) are unlit and bloom on the UI layer. Pillowed shapes: the outline is the
// solid colour, the inner cells come one cell further out front and back in a lighter / glowing colour, so the icons read as fat
// extruded badges with a lit core, not as paper cut-outs.

export type Set3 = (x: number, y: number, z: number, c: number | null, g?: number) => void;

/** a 2D mask of cells (x, y) */
export class Mask {
  s = new Set<string>();
  rect(x0: number, y0: number, x1: number, y1: number) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.s.add(x + ',' + y); return this; }
  cut(x0: number, y0: number, x1: number, y1: number) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.s.delete(x + ',' + y); return this; }
  has(x: number, y: number) { return this.s.has(x + ',' + y); }
  cells() { return [...this.s].map(k => k.split(',').map(Number) as [number, number]); }
  /** cells whose 8 neighbours are all inside */
  erode() { const m = new Mask(); for (const [x, y] of this.cells()) { let ok = true; for (let dx = -1; dx <= 1 && ok; dx++) for (let dy = -1; dy <= 1; dy++) if (!this.has(x + dx, y + dy)) { ok = false; break; } if (ok) m.s.add(x + ',' + y); } return m; }
  /** mirror across x = 0 (cell x ↔ −1 − x) */
  sym() { for (const [x, y] of this.cells()) this.s.add((-1 - x) + ',' + y); return this; }
}

/** extrude a mask over z0..z1 */
export function extrude(set: Set3, m: Mask, z0: number, z1: number, c: number, g = 0) { for (const [x, y] of m.cells()) for (let z = z0; z <= z1; z++) set(x, y, z, c, g); }
/** pillow: outline at z0..z1 in c, the eroded core at z0−1..z1+1 in c2 (g2), a second erosion one more cell out front in c3 */
export function pillow(set: Set3, m: Mask, z0: number, z1: number, c: number, c2: number, g2 = 0, c3?: number, g3 = g2, back = true) {
  extrude(set, m, z0, z1, c);
  const e = m.erode(); extrude(set, e, back ? z0 - 1 : z0, z1 + 1, c2, g2);
  if (c3 != null) { const e2 = e.erode(); extrude(set, e2, z1 + 2, z1 + 2, c3, g3); }
}
export function box(set: Set3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g = 0) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) set(x, y, z, c, g);
}
/** a chunky two-tier ball: a core cube plus three plates one cell out (no stair-steps beyond one notch) */
export function ball(set: Set3, cx: number, cy: number, cz: number, r: number, c: number, g = 0) {
  const a = r - 1, b = r - 2;
  box(set, cx - a, cy - a, cz - a, cx + a - 1, cy + a - 1, cz + a - 1, c, g);
  box(set, cx - r, cy - b, cz - b, cx + r - 1, cy + b - 1, cz + b - 1, c, g);
  box(set, cx - b, cy - r, cz - b, cx + b - 1, cy + r - 1, cz + b - 1, c, g);
  box(set, cx - b, cy - b, cz - r, cx + b - 1, cy + b - 1, cz + r - 1, c, g);
}
/** an upright crystal prism (w × w cells, h tall from y0) with a stepped glowing tip and a lit front edge */
export function crystal(set: Set3, x0: number, y0: number, z0: number, w: number, h: number, body: number, edge: number, tip: number) {
  box(set, x0, y0, z0, x0 + w - 1, y0 + h - 1, z0 + w - 1, body);
  box(set, x0, y0 + 1, z0 + w - 1, x0, y0 + h - 1, z0 + w - 1, edge, 1);   // the lit front-left edge
  const t = w >= 4 ? 2 : 1, o = Math.floor((w - t) / 2), th = w >= 4 ? 3 : 2;
  box(set, x0 + o, y0 + h, z0 + o, x0 + o + t - 1, y0 + h + th - 1, z0 + o + t - 1, tip, 1);
}

// ---------------------------------------------------------------- palette
const P = {
  vio0: 0x2a1052, vio1: 0x4e2296, vio2: 0x7a44cc, vioG: 0xb070ff, vioC: 0xf0d8ff,
  ice0: 0x22508a, ice1: 0x3a8ed0, ice2: 0x7cc4f0, iceG: 0x7ee0ff, iceW: 0xd8f8ff, rock: 0x323c54,
  gold0: 0x7a4c0c, gold1: 0xc0841a, gold2: 0xe8b43a, goldG: 0xffe070,
  fire0: 0xd0300c, fire1: 0xff5a0a, fire2: 0xffa41c, fireW: 0xffe890, ember: 0x3a1a10,
  st0: 0x343c48, st1: 0x5c6674, st2: 0x8c98a8, stE: 0xc8d6e6,
  wood: 0x7a4824, wood0: 0x4a2a14, leather: 0x3a2418,
  bl0: 0x5a0610, bl1: 0x9a0e1a, bl2: 0xd42632, blG: 0xff3a3a, blW: 0xffb8b8,
  red: 0xa82224, blue0: 0x1a3268, blue1: 0x2850a0, cyanG: 0x60e4ff,
  po0: 0x1c4c10, po1: 0x358a1e, po2: 0x62c03a, poG: 0x8cf040, poD: 0x0e2408,
  sh0: 0x1e1030, sh1: 0x3a2258, sh2: 0x6a46a0, shG: 0xa860ff,
  white: 0xe8e4dc, grey: 0xaaa69e, greyD: 0x5a5a62, cross: 0xc81e1e,
};

/** a square frame with notched corners (the "upgraded" ring every tier-3 icon wears), glowing, in the XY plane */
function frame(set: Set3, r: number, w: number, z0: number, z1: number, c: number, g = 1) {
  const m = new Mask().rect(-r, -r, r - 1, r - 1).cut(-r + w, -r + w, r - 1 - w, r - 1 - w);
  m.cut(-r, -r, -r + 1, -r + 1).cut(r - 2, -r, r - 1, -r + 1).cut(-r, r - 2, -r + 1, r - 1).cut(r - 2, r - 2, r - 1, r - 1);
  extrude(set, m, z0, z1, c, g);
}

// ---------------------------------------------------------------- skill icons
export const SKILL_ART: Record<string, (set: Set3) => void> = {
  // 奥术弹: a rounded violet orb (bevelled block + plates), a white-hot core, a thin orbit band and three sparks
  arcane: set => {
    for (let x = -6; x <= 5; x++) for (let y = -6; y <= 5; y++) for (let z = -6; z <= 5; z++) {
      const ex = (x === -6 || x === 5 ? 1 : 0) + (y === -6 || y === 5 ? 1 : 0) + (z === -6 || z === 5 ? 1 : 0); if (ex < 2) set(x, y, z, P.vio1);
    }
    box(set, -4, -4, -7, 3, 3, -7, P.vio2); box(set, -7, -4, -4, -7, 3, 3, P.vio2); box(set, 6, -4, -4, 6, 3, 3, P.vio2);
    box(set, -4, 6, -4, 3, 6, 3, P.vio2); box(set, -4, -7, -4, 3, -7, 3, P.vio0);
    box(set, -4, -4, 6, 3, 3, 6, P.vioG, 1); box(set, -2, -2, 7, 1, 1, 7, P.vioC, 1); box(set, -1, -1, 8, 0, 0, 8, 0xffffff, 1);
    const band = new Mask().rect(-10, -10, 9, 9).cut(-9, -9, 8, 8).cut(-10, -10, -9, -9).cut(8, -10, 9, -9).cut(-10, 8, -9, 9).cut(8, 8, 9, 9);
    for (const [x, z] of band.cells()) set(x, -3, z, P.vioG, 1);
    box(set, 8, 6, 0, 9, 7, 1, P.vioG, 1); box(set, -10, 3, 1, -9, 4, 2, P.vioC, 1); box(set, 5, -10, 2, 6, -9, 3, P.vioG, 1);
  },
  // 冰锥: a cluster of upright ice prisms on a rock
  ice: set => {
    box(set, -8, -3, -3, 7, -1, 3, P.rock); box(set, -6, -4, -2, 5, -4, 2, P.rock);
    crystal(set, -2, -1, -2, 4, 12, P.ice1, P.iceG, P.iceW);
    crystal(set, -6, -1, -1, 3, 7, P.ice1, P.iceG, P.iceW);
    crystal(set, 3, -1, -1, 3, 9, P.ice1, P.iceG, P.iceW);
    crystal(set, -4, -1, 1, 2, 4, P.ice2, P.iceG, P.iceW);
    crystal(set, 2, -1, 1, 2, 5, P.ice2, P.iceG, P.iceW);
    crystal(set, 0, -1, -3, 3, 6, P.ice0, P.iceG, P.iceW);
  },
  // 冰环 (冰锥 tier 3): a glowing ice frame with four spikes and a crystal heart
  iceRing: set => {
    const m = new Mask().rect(-8, -8, 7, 7).cut(-5, -5, 4, 4).cut(-8, -8, -7, -7).cut(6, -8, 7, -7).cut(-8, 6, -7, 7).cut(6, 6, 7, 7);
    pillow(set, m, -1, 1, P.ice1, P.ice2, 0);
    extrude(set, m.erode(), 2, 2, P.iceG, 1);
    box(set, -1, 8, -1, 0, 11, 0, P.ice2); box(set, -1, 12, -1, 0, 13, 0, P.iceW, 1);
    box(set, -1, -12, -1, 0, -9, 0, P.ice2); box(set, -12, -1, -1, -9, 0, 0, P.ice2); box(set, 8, -1, -1, 11, 0, 0, P.ice2);
    box(set, -13, -1, -1, -13, 0, 0, P.iceW, 1); box(set, 12, -1, -1, 12, 0, 0, P.iceW, 1); box(set, -1, -13, -1, 0, -13, 0, P.iceW, 1);
    crystal(set, -2, -4, -2, 4, 5, P.ice1, P.iceG, P.iceW); box(set, -1, -4, 2, 0, 2, 2, P.iceG, 1);
  },
  // 闪电链: a fat bolt of big offset blocks slanting down-left to a point, gold rim, white-hot core
  bolt: set => {
    const m = new Mask().rect(2, 14, 8, 17).rect(0, 10, 6, 13).rect(-2, 7, 8, 9).rect(1, 4, 5, 6).rect(-1, 1, 3, 3).rect(-2, -2, 1, 0).rect(-3, -4, -2, -3);
    for (const [x, y] of m.cells()) for (let z = -2; z <= 1; z++) set(x - 3, y - 7, z, P.gold1);
    const e = m.erode(); for (const [x, y] of e.cells()) for (let z = -3; z <= 2; z++) set(x - 3, y - 7, z, P.goldG, 1);
    for (const [x, y] of e.erode().cells()) set(x - 3, y - 7, 3, P.fireW, 1);
  },
  // 陨石: a dark rock with glowing cracks, wrapped by upright flame tongues behind it
  meteor: set => {
    const f = new Mask().rect(-7, -2, 6, 4).rect(-7, 5, -4, 8).rect(-2, 5, 1, 13).rect(3, 5, 6, 10).rect(-1, 14, 0, 15).rect(-6, 9, -5, 10).rect(4, 11, 5, 12);
    extrude(set, f, -4, -1, P.fire1, 1);
    const e = f.erode(); extrude(set, e, -5, 0, P.fire2, 1); extrude(set, e.erode(), 1, 1, P.fireW, 1);
    ball(set, 0, -3, 2, 6, P.ember); box(set, -4, 2, 3, 3, 2, 6, 0x5a2a18);
    box(set, -4, -3, 7, 3, -3, 7, P.fire1, 1); box(set, -1, -7, 7, -1, 0, 7, P.fire1, 1); box(set, 2, -6, 7, 2, -4, 7, P.fire2, 1);
  },
  // 劈砍: a single-bit war axe
  axe: set => {
    box(set, -1, -10, -1, 0, 8, 0, P.wood); box(set, -1, -10, -1, 0, -8, 0, P.leather); box(set, -1, -11, -1, 0, -11, 0, P.st1);
    box(set, -2, 1, -2, 1, 7, 1, P.st0);
    const m = new Mask().rect(2, 1, 7, 7).rect(8, -1, 9, 9).rect(10, 0, 10, 8);
    for (const [x, y] of m.cells()) for (let z = -1; z <= 0; z++) set(x, y, z, x >= 9 ? P.stE : x >= 8 ? P.st2 : P.st1);
    box(set, 3, 3, 1, 6, 5, 1, P.st2); box(set, 4, 4, 2, 5, 4, 2, P.blG, 1);
    box(set, -4, 3, -1, -3, 5, 0, P.st0); box(set, -1, 9, -1, 0, 9, 0, P.st1);
  },
  // 顺劈斩: a double-bit great axe with glowing red edges
  cleave: set => {
    box(set, -1, -11, -1, 0, 9, 0, P.wood); box(set, -1, -11, -1, 0, -9, 0, P.leather); box(set, -2, 1, -2, 1, 8, 1, P.st0);
    const m = new Mask().rect(2, 1, 7, 8).rect(8, -1, 9, 10).sym();
    for (const [x, y] of m.cells()) for (let z = -1; z <= 0; z++) set(x, y, z, Math.abs(x + 0.5) >= 8 ? P.st2 : P.st1);
    box(set, 10, 0, -1, 10, 9, 0, P.blG, 1); box(set, -11, 0, -1, -11, 9, 0, P.blG, 1);
    box(set, 3, 3, 1, 6, 6, 1, P.st2); box(set, -7, 3, 1, -4, 6, 1, P.st2); box(set, -1, 10, -1, 0, 11, 0, P.st1);
  },
  // 盾墙: a heater shield, steel rim, red field, gold boss
  shield: set => {
    const m = new Mask().rect(-7, -2, 6, 8).rect(-6, -5, 5, -3).rect(-4, -8, 3, -6).rect(-2, -10, 1, -9);
    extrude(set, m, -1, 1, P.st1); const e = m.erode().erode();
    extrude(set, e, 0, 1, P.red); for (const [x, y] of m.cells()) if (!e.has(x, y)) set(x, y, 2, P.st2);
    box(set, -1, -7, 1, 0, 6, 1, P.gold1); box(set, -3, 0, 2, 2, 4, 3, P.gold1); box(set, -2, 1, 4, 1, 3, 4, P.gold2);
  },
  // 铁壁 (盾墙 tier 3): three tower shields in a wall, the front one with a glowing rim
  wall: set => {
    const tower = (cx: number, z: number, rim: number, field: number, glow: boolean) => {
      const m = new Mask().rect(cx - 4, -8, cx + 3, 7).cut(cx - 4, -8, cx - 4, -8).cut(cx + 3, -8, cx + 3, -8);
      extrude(set, m, z - 1, z, rim); const e = m.erode();
      extrude(set, e, z, z, field); for (const [x, y] of m.cells()) if (!e.has(x, y)) set(x, y, z + 1, glow ? P.cyanG : P.st2, glow ? 1 : 0);
      box(set, cx - 1, -1, z + 1, cx, 2, z + 2, P.gold2);
    };
    tower(-6, -3, P.st0, P.blue0, false); tower(6, -3, P.st0, P.blue0, false); tower(0, 0, P.st1, P.blue1, true);
  },
  // 狂血: a fat blood drop with a glowing core
  blood: set => {
    const m = new Mask().rect(-1, 8, 0, 10).rect(-2, 5, 1, 7).rect(-4, 2, 3, 4).rect(-6, -4, 5, 1).rect(-5, -6, 4, -5).rect(-3, -7, 2, -7);
    pillow(set, m, -2, 1, P.bl1, P.bl2, 0, P.blG, 1);
    box(set, -4, -1, 3, -4, 1, 4, P.blW, 1); box(set, -3, 2, 3, -3, 2, 3, P.blW, 1);
  },
  // 血战 (狂血 tier 3): the drop inside a glowing blood frame
  bloodWar: set => { SKILL_ART.blood(set); frame(set, 12, 2, -1, 0, P.blG); box(set, -1, 12, -1, 0, 13, 0, P.blG, 1); box(set, -1, -14, -1, 0, -13, 0, P.blG, 1); },
  // 袖箭: two steel darts with violet fletching
  dart: set => {
    const dart = (cx: number, y0: number, h: number) => {
      box(set, cx, y0, -1, cx + 1, y0 + h, 0, P.sh1);
      box(set, cx - 1, y0 + h + 1, -1, cx + 2, y0 + h + 2, 0, P.st1); box(set, cx, y0 + h + 3, -1, cx + 1, y0 + h + 5, 0, P.stE, 1);
      box(set, cx - 2, y0, -2, cx + 3, y0 + 2, 1, P.sh2); box(set, cx - 1, y0 - 1, -1, cx + 2, y0 - 1, 0, P.sh2);
      box(set, cx, y0 + 3, 1, cx + 1, y0 + h, 1, P.shG, 1);
    };
    dart(-5, -8, 10); dart(3, -11, 9);
  },
  // 背刺: a dagger stabbing down, violet-glowing fuller
  backstab: set => {
    const blade = new Mask().rect(-2, -9, 1, 1).rect(-1, -12, 0, -10);
    extrude(set, blade, -1, 0, P.st1); box(set, -2, -8, 1, -2, 1, 1, P.st2); box(set, -1, -11, 1, 0, 0, 1, P.shG, 1);
    box(set, -6, 2, -2, 5, 3, 1, P.gold1); box(set, -6, 4, -2, -5, 4, 1, P.gold1); box(set, 4, 4, -2, 5, 4, 1, P.gold1);
    box(set, -1, 4, -1, 0, 9, 0, P.leather); box(set, -2, 10, -2, 1, 11, 1, P.gold1); box(set, -1, 11, 2, 0, 11, 2, P.shG, 1);
  },
  // 影步: a shadow boot leaving violet streaks
  step: set => {
    const m = new Mask().rect(-4, -2, 1, 8).rect(-4, -6, 6, -2).cut(6, -2, 6, -2);
    extrude(set, m, -2, 2, P.sh1); box(set, -5, 7, -3, 2, 8, 3, P.sh2); box(set, -4, -7, -2, 6, -7, 2, P.sh0);
    box(set, -3, 0, 3, 0, 6, 3, P.sh2); box(set, 2, -5, 3, 5, -3, 3, P.sh2);
    box(set, -11, -5, 0, -6, -5, 0, P.shG, 1); box(set, -13, -2, 0, -7, -2, 0, P.shG, 1); box(set, -10, 2, 0, -7, 2, 0, P.shG, 1);
  },
  // 毒雾: a toxic cloud with hollow skull eyes and dripping poison
  fog: set => {
    const m = new Mask().rect(-8, -3, 7, 2).rect(-6, 3, -1, 6).rect(0, 3, 5, 5).rect(-3, 7, 1, 8).rect(-9, -2, -9, 1).rect(8, -2, 8, 1);
    pillow(set, m, -2, 1, P.po1, P.po2, 0, P.poG, 1);
    for (const ex of [-5, 2]) box(set, ex, 0, -1, ex + 2, 1, 4, P.poD);
    box(set, -1, -2, 3, 0, -2, 4, P.poD);
    box(set, -5, -6, 0, -5, -4, 0, P.poG, 1); box(set, 1, -5, 0, 2, -4, 0, P.poG, 1); box(set, 5, -8, 0, 5, -4, 0, P.poG, 1); box(set, 5, -9, 0, 5, -9, 0, P.poG, 1);
  },
  // 影舞 (毒雾 tier 3): twin violet daggers, one up one down, inside a shadow frame
  dance: set => {
    const dagger = (cx: number, dir: number) => {
      const y = (v: number) => v * dir;
      box(set, cx - 1, y(-1), -1, cx, y(-9), 0, P.st1); box(set, cx - 1, y(-1), 1, cx, y(-8), 1, P.shG, 1); box(set, cx, y(-10), -1, cx, y(-11), 0, P.stE, 1);
      box(set, cx - 3, y(0), -2, cx + 2, y(1), 1, P.sh2); box(set, cx - 1, y(2), -1, cx, y(6), 0, P.leather); box(set, cx - 1, y(7), -1, cx, y(7), 0, P.gold1);
    };
    dagger(-3, -1); dagger(4, 1); frame(set, 12, 2, -2, -1, P.shG);
  },
};

// ---------------------------------------------------------------- relics
export const RELIC_ART: Record<string, (set: Set3) => void> = {
  // 贪婪之手: a golden open hand with a coin glowing in the palm
  hand: set => {
    box(set, -6, -6, -1, 4, 2, 1, P.gold1);
    for (const [x0, h] of [[-6, 5], [-3, 7], [0, 8], [3, 7]] as const) box(set, x0, 3, -1, x0 + 1, 2 + h, 1, P.gold1);
    for (const [x0, h] of [[-6, 5], [-3, 7], [0, 8], [3, 7]] as const) box(set, x0, 2 + h, 0, x0 + 1, 2 + h, 1, P.gold2);
    box(set, 5, -4, -1, 7, 0, 1, P.gold1); box(set, 6, 1, -1, 7, 3, 1, P.gold1);
    box(set, -5, -9, -2, 3, -7, 2, P.gold0); box(set, -2, -9, 3, 0, -7, 3, P.blG, 1);
    box(set, -3, -4, 2, 1, 0, 2, P.gold2); box(set, -2, -3, 3, 0, -1, 3, P.goldG, 1);
  },
  // 铁壁护符: a blue shield amulet with a gold rim, a glowing star and a ring to hang it by
  charm: set => {
    const m = new Mask().rect(-6, -2, 5, 7).rect(-5, -5, 4, -3).rect(-3, -7, 2, -6).rect(-1, -8, 0, -8);
    extrude(set, m, -1, 1, P.gold1); const e = m.erode();
    extrude(set, e, -1, 1, P.blue1); for (const [x, y] of m.cells()) if (!e.has(x, y)) set(x, y, 2, P.gold2);
    box(set, -1, -4, 2, 0, 5, 2, P.cyanG, 1); box(set, -4, 0, 2, 3, 1, 2, P.cyanG, 1); box(set, -1, 0, 3, 0, 1, 3, 0xffffff, 1);
    const ring = new Mask().rect(-2, 8, 1, 11).cut(-1, 9, 0, 10); extrude(set, ring, 0, 0, P.gold1);
  },
  // 战场急救: a white kit with a raised red cross, a lid seam, a handle and steel corners
  kit: set => {
    box(set, -7, -5, -3, 6, 4, 3, P.white);
    for (let x = -7; x <= 6; x++) { set(x, 2, -3, P.grey); set(x, 2, 3, P.grey); } for (let z = -3; z <= 3; z++) { set(-7, 2, z, P.grey); set(6, 2, z, P.grey); }
    box(set, -1, -4, 4, 0, 1, 4, P.cross); box(set, -3, -2, 4, 2, -1, 4, P.cross);
    const h = new Mask().rect(-3, 5, 2, 7).cut(-2, 5, 1, 6); extrude(set, h, -1, 0, P.greyD);
    for (const x of [-7, 6]) for (const y of [-5, 4]) for (const z of [-3, 3]) set(x, y, z, P.greyD);
    box(set, -6, 1, 4, -5, 2, 4, P.greyD); box(set, 4, 1, 4, 5, 2, 4, P.greyD);
  },
};

// ---------------------------------------------------------------- pattern badge icons (white dice motifs, raised on the plaque)
export const BADGE_ART: Record<string, (set: Set3) => void> = {
  single: set => { box(set, -3, -3, 0, 2, 2, 1, P.white); box(set, -1, -1, 2, 0, 0, 2, 0x22242e); },
  pair: set => {
    for (const ox of [-6, 1]) { box(set, ox, -3, 0, ox + 4, 1, 1, P.white); box(set, ox, 1, 2, ox, 1, 2, 0x22242e); box(set, ox + 4, -3, 2, ox + 4, -3, 2, 0x22242e); }
  },
  straight: set => { box(set, -6, -4, 0, -4, -2, 1, P.white); box(set, -2, -4, 0, 0, 0, 1, P.white); box(set, 2, -4, 0, 4, 2, 1, P.white); box(set, 2, 2, 2, 4, 2, 2, P.goldG, 1); },
  array: set => { for (const ox of [-5, 1]) for (const oy of [-4, 1]) box(set, ox, oy, 0, ox + 3, oy + 2, 1, P.white); },
};
