// 寒山坞（hs_forge）：开场冷开头的地点——熹平六年腊月廿三的雪夜，汝南深山里文家铸刀的匠人坞。不打仗，只给演出用（中远景）。
// 一条山谷：两侧是一整层高低不一的大块山崖，后面一道高山梁；山路从左后方山口出来，沿着山梁脚下的一道平台往右走到正中（平台藏在
// 左边路堑石壁后面，正面只看见火把），再顺着两道石壁夹着的路堑下到谷底：路面是四段平的，每段开头三级石阶（四级台地各一道，正面看是四组横线，不是一路的斜阶），穿过坞门，
// 变成村里的一条土路。路两边七八户匠人的
// 土墙草顶 / 瓦顶房子，左边路旁是铸坊（敞口朝路：炉、风箱、铁砧、淬火槽、生石灰桶、炭堆、刀坯架）。雪是冬天拼装的那一遍：
// 每根露天格子柱顶上一格雪；路堑和村路中间是踩实的雪。山梁后面再远是一排大格子的远山（单独一层，在格子坐标范围外）。
// 演出锚点（世界米）在 HS_FORGE；路面高度 hsRoadY(z)。用 __dh.scene('hs_forge') 看（这个地点只有冬 · 月夜 · 雪）。
import * as THREE from 'three';
import { type Ctx, type Mood } from '../../scenes/stage';
import { CELL } from '../../bestiary/kit';
import { M } from '../../scenes/props';
import { VoxWorld } from '../../look/voxkit';
import type { Layout, Locale, Place, Rect } from '../types';
import { snowPass, SNOW, SNOW_D } from '../season';
import { HV, house, smoke } from '../hanmo/hj_village_kit';
import { woodpile } from '../hanmo/hj_village_props';
import { HS, rockMass, snowPine, lantern, gateFrame, forgeHouse, forgePoints, hollow, wbox, cm, type Face } from './hs_kit';

// ------------------------------------------------------------------ the plan (world cells unless noted)
/** the road: X −19..19; its foot at Z0 (z = −12 m, the valley floor); flat stretches, each starting with a flight of three steps (4 cells
 *  deep, ~3 rows high) at the front of a terrace of the cutting: FLIGHTS = [Z of the flight's first step, the row it climbs to] */
const RX = 19, Z0 = -171, ROAD_TOP = 37;
const FLIGHTS: Array<[number, number]> = [[-172, 8], [-229, 17], [-286, 27], [-343, ROAD_TOP]];
/** the ledge along the foot of the back ridge: from the pass in the left cliffs (X −245) to the top of the road */
const LEDGE = { x0: -245, x1: RX, z0: -434, z1: -401 };
/** the top row of the road's surface cells at cell Z (−1 = the valley floor) */
export function roadRow(Z: number) {
  if (Z >= Z0) return -1;
  let r = -1;
  for (const [zf, top] of FLIGHTS) { if (Z > zf) break; const k = Math.min(3, Math.floor((zf - Z) / 4) + 1); r = r + Math.round((top - r) * k / 3); }
  return r;
}
/** the walking height (m) of the road at world z (the trodden middle; the valley floor is 0) */
export function hsRoadY(z: number) { const r = roadRow(M(z)); return r < 0 ? 0 : (r + 1) * CELL; }
const FORGE = { X: M(-4.7), Z: M(-2.0), r: 1 };
/** the craftsmen's houses (metres; r = the way the front faces: 3 = −x onto the road from the right, 1 = +x from the left, 0 = +z) */
const HOUSES: Array<{ x: number; z: number; r: number; hw: number; hd: number; H: number; roof: 'thatch' | 'tile'; lit?: boolean; smoke?: boolean }> = [
  { x: 6.0, z: -8.6, r: 3, hw: 26, hd: 15, H: 30, roof: 'thatch', lit: true, smoke: true },
  { x: 6.0, z: -1.8, r: 3, hw: 24, hd: 14, H: 29, roof: 'tile' },
  { x: 6.2, z: 4.8, r: 3, hw: 26, hd: 15, H: 30, roof: 'thatch' },
  { x: 6.0, z: 11.0, r: 3, hw: 22, hd: 14, H: 28, roof: 'thatch', lit: true },
  { x: -5.8, z: -9.4, r: 1, hw: 24, hd: 14, H: 29, roof: 'thatch', smoke: true },
  { x: -5.8, z: 6.4, r: 1, hw: 26, hd: 15, H: 30, roof: 'tile', lit: true },
  { x: -8.8, z: -14.6, r: 0, hw: 22, hd: 13, H: 28, roof: 'thatch' },
  { x: 8.8, z: -14.2, r: 0, hw: 22, hd: 13, H: 28, roof: 'thatch' },
];
const F = forgePoints(FORGE.X, FORGE.Z, FORGE.r);
const r2 = (v: number) => Math.round(v * 100) / 100;
const P = (p: [number, number, number]): [number, number, number] => [r2(p[0]), r2(p[1]), r2(p[2])];
/**
 * the cutscene's anchors (world metres): the torch path (out of the pass in the left cliffs, along the ledge, down the cutting, through
 * the gate, along the village road to the forge), the forge's points, the spot under the bellows (floor height, and the yaw that faces
 * out of the forge onto the road)
 */
export const HS_FORGE = {
  road: {
    /** where the four come out of the pass (hidden in the cleft), the corner at the top of the slope, the foot of the slope, the gate */
    pass: P([-16.6, (ROAD_TOP + 1) * CELL, -29.2]), top: P([0, (ROAD_TOP + 1) * CELL, -29.2]), slopeTop: P([0, (ROAD_TOP + 1) * CELL, -28.0]),
    bottom: P([0, 0, -12.0]), gate: P([0, 0, -11.55]),
    /** a walkable polyline from the pass to the forge front (y on the road surface) */
    path: [[-16.6, -29.2], [0, -29.2], [0, -24.85], [0, -24.0], [0, -20.85], [0, -20.0], [0, -16.85], [0, -16.0], [0, -12.85], [0, -12.0], [0, -6], [0, -1.6], [-1.0, -1.6]].map(([x, z]) => P([x, hsRoadY(z), z])),
  },
  forge: { door: P(F.door), front: P([-2.3, 0, -2.0]), fire: P(F.fire), lamp: P(F.lamp), chimney: P(F.chimney), anvil: P(F.anvil), trough: P(F.trough), lime: P(F.lime), bellows: P(F.bellows) },
  /** the floor under the bellows between its two stone blocks (0.91 m clear, 0.91 m wide, 0.56 m deep); yaw faces out to the road */
  underBellows: P(F.under), underYaw: F.underYaw,
};

// ------------------------------------------------------------------ the layout: no battle floor, no slots; the trodden paths keep their snow trodden
const DOORS: Rect[] = HOUSES.filter(h => h.r !== 0).map(h => {
  const front = h.r === 3 ? h.x - (h.hd + 3) * CELL : h.x + (h.hd + 3) * CELL;
  return h.r === 3 ? { x0: 0.9, x1: front, z0: h.z - 0.45, z1: h.z + 0.45 } : { x0: front, x1: -0.9, z0: h.z - 0.45, z1: h.z + 0.45 };
});
const LAYOUT: Layout = {
  id: 'hs_valley', name: '寒山坞', landmark: null, slots: [],
  path: [{ x0: -0.9, x1: 0.9, z0: -12.2, z1: 16 }, { x0: -2.4, x1: -0.9, z0: -4.4, z1: 0.4 }, ...DOORS],
};

// ------------------------------------------------------------------ floor: the valley's frozen earth, the road up the cutting and the ledge
function floor(c: Ctx) {
  const w = c.w, B = wbox(w);
  B(-171, -1, -229, 171, -1, 229, HS.soil);
  B(-215, -1, 87, 215, -1, 229, HS.soil);
  // a few big patches of darker / lighter earth (they show only where the snow is trodden or under the eaves)
  for (const [x0, z0, x1, z1, col] of [[-60, 40, -20, 120, HS.soilD], [30, -120, 90, -60, HS.soilL], [-140, -200, -90, -150, HS.soilD], [20, 130, 120, 200, HS.soilD]] as const) B(x0, -1, z0, x1, -1, z1, col);
  // the road: two rows of packed earth on its rising line (nothing under it: the cutting's banks close its sides)
  for (let Z = Z0 - 1; Z > LEDGE.z1; Z--) {
    const r = roadRow(Z); if (r < 0) continue;
    B(-RX, r - 1, Z, RX, r, Z, HS.road);
    // the bed's dressed-stone side walls down to the ground (a course line every 6 rows)
    for (const X of [-RX, RX]) { B(X, -1, Z, X, r - 2, Z, HS.kerb); for (let y = 4; y <= r - 2; y += 6) B(X, y, Z, X, y, Z, HS.stoneD); }
  }
  B(LEDGE.x0, ROAD_TOP - 1, LEDGE.z0, LEDGE.x1, ROAD_TOP, LEDGE.z1, HS.road);
}

// ------------------------------------------------------------------ the far: the cutting, the cliffs, the back ridge, the village, the far peaks
/** a mass: [X0, X1, Z0, Z1, top row, rock (else earth), the rows its faces start at (null = left off: it butts on a taller one; a face
 *  starts where a lower neighbour stops hiding it)] */
type Mass = [number, number, number, number, number, boolean, Partial<Record<Face, number | null>>];
/** the land either side of the road as it climbs: a low earth bank either side of the gate, then two big low steps each side (the
 *  right side's a little further back than the left); the road runs on its own stone-walled bed between them, standing proud of the
 *  land all the way up (a causeway the torches are seen on from anywhere), and at the top turns left along the ledge's shelf */
const BANKS: Mass[] = [
  [-79, -20, -228, -172, 14, false, { z0: null }], [20, 79, -228, -172, 14, false, { z0: null }],
  [-171, -20, -330, -229, 10, false, { x0: null, z0: null }], [-171, -20, -400, -331, 28, true, { x0: null, z0: null, z1: 10 }],
  [20, 171, -350, -229, 13, false, { x1: null, z0: null }], [20, 171, -434, -351, 32, true, { x1: null, z0: null, z1: 13 }],
  // the ledge: a shelf of rock along the foot of the back ridge, its top the road, its face a low cliff over the upper step
  [-245, -20, -434, -401, ROAD_TOP, true, { z0: null, x0: null, z1: 28 }],
];
/** the cliffs round the valley (one tier, blocks of different heights) and the high ridge behind the ledge; the left cliffs are cut
 *  through by the pass at Z −434..−401 and closed behind it */
const CLIFFS: Mass[] = [
  // the back ridge
  [-171, -90, -511, -435, 120, true, { z0: null, z1: 37, x0: null, x1: 96 }], [-89, -20, -511, -435, 96, true, { z0: null, z1: 37, x0: null, x1: null }],
  [-19, 60, -511, -435, 110, true, { z0: null, z1: 37, x0: 96, x1: null }], [61, 171, -511, -435, 128, true, { z0: null, z1: 37, x0: 110, x1: 118 }],
  // left
  [-245, -172, -511, -435, 134, true, { z0: null, x0: null, z1: 37, x1: 120 }], [-245, -172, -400, -260, 96, true, { x0: null, z0: 37, z1: 70, x1: 46 }],
  [-245, -172, -259, -120, 70, true, { x0: null, z0: null, z1: null }], [-245, -172, -119, -20, 84, true, { x0: null, z0: 70, z1: 58 }],
  [-245, -172, -19, 86, 58, true, { x0: null, z0: null }], [-290, -246, -511, -360, 140, true, { z0: null, x0: null, x1: 37, z1: 96 }],
  // right
  [172, 245, -511, -330, 118, true, { z0: null, x1: null, z1: 88, x0: 42 }], [172, 245, -329, -180, 88, true, { z0: null, x1: null, z1: 64 }],
  [172, 245, -179, -60, 64, true, { z0: null, x1: null, z1: null }], [172, 245, -59, 86, 76, true, { x1: null, z0: 64 }],
  // outcrops standing out of the cliff feet (break the long straight runs)
  [-171, -150, -150, -118, 30, true, { x0: null }], [-171, -160, 70, 100, 26, true, { x0: null }], [150, 171, -40, -10, 34, true, { x1: null }], [154, 171, 40, 62, 40, true, { x1: null }],
];
/** snow pines: [X, Z, h] standing on whatever is under them */
const PINES: Array<[number, number, number, number]> = [
  [-114, -314, 60, 1], [100, -307, 54, 2], [-190, -200, 70, 3], [190, -114, 64, 0], [190, 30, 56, 1], [126, -390, 66, 2],
  [-150, -100, 92, 3], [-155, 40, 74, 0], [-86, -455, 60, 1], [70, -455, 56, 2], [-228, -60, 60, 2], [228, -300, 66, 3],
];
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, B = wbox(w), lamp = (k = 1) => 1.35 * k;
  for (const [x0, x1, z0, z1, top, rock, from] of [...BANKS, ...CLIFFS]) rockMass(w, x0, -1, z0, x1, top, z1, rock ? { from } : { from, face: HS.soil, top: HS.soilL, strata: 9 });
  // the gate where the road comes down into the village, a lantern on its left post
  const g = gateFrame(w, -24, 24, -165, 40);
  const gl = lantern(w, -16, g.hookL[1], -165);
  c.light([gl[0] + 0.3, gl[1], gl[2] + 0.4], 0xffa050, 1.5 * lamp(), 4.5);
  // the forge
  const fo = forgeHouse(c, FORGE.X, FORGE.Z, FORGE.r);
  hollow(w, FORGE.X - 48, 0, FORGE.Z - 68, FORGE.X + 44, 70, FORGE.Z + 68);
  c.light(fo.fire, 0xff7a30, 2.5 * lamp(), 7.5); c.light([fo.fire[0] + 1.4, 1.2, fo.fire[2]], 0xff8a3a, 0.9 * lamp(), 5);
  c.light([fo.lamp[0] + 0.3, fo.lamp[1] - 0.2, fo.lamp[2]], 0xffa050, 1.4 * lamp(), 4.5);
  smoke(c, fo.chimney, { rate: 2.0, col: 0x55524f });
  // the houses (a lit one has its door and windows glowing and a warm light at the door)
  for (const h of HOUSES) {
    const q = house(c, h.x, h.z, h.r, { hw: h.hw, hd: h.hd, H: h.H, roof: h.roof, tiers: h.roof === 'tile' ? 3 : 2, lit: h.lit, wins: [-Math.round(h.hw * 0.58), Math.round(h.hw * 0.58)] });
    if (h.lit) c.light(q.door, 0xff9a48, 1.2 * lamp(), 4);
    if (h.smoke || h.lit) smoke(c, q.smoke, { rate: 1.1, col: 0x8a8682 });
  }
  // yard things: woodpiles against two houses, the charcoal shed behind the forge, a stack of iron bars, jars
  woodpile(c, 8.9, -5.3, 1); woodpile(c, -8.6, 9.6, 3);
  { // the charcoal shed: four posts, a one-tier thatch roof, sacks and a heap under it (behind the forge, against the cliff)
    const X0 = M(-11.6), X1 = M(-8.4), Za = M(-5.2), Zb = M(-1.0);
    for (const x of [X0, X1]) for (const z of [Za, Zb]) B(x, 0, z, x + 1, 26, z + 1, HV.post);
    B(X0 - 3, 27, Za - 3, X1 + 4, 30, Zb + 4, HV.th); B(X0 - 3, 30, Za - 3, X1 + 4, 30, Zb + 4, HV.thL); B(X0 - 3, 27, Za - 3, X1 + 4, 27, Za - 3, HV.thD);
    B(X0 + 3, 0, Za + 3, X1 - 3, 6, Zb - 3, HS.coal); B(X0 + 6, 7, Za + 6, X1 - 6, 10, Zb - 6, HS.coal); B(X0 + 3, 6, Za + 3, X1 - 3, 6, Zb - 3, HS.coalL);
    for (const z of [Za + 4, Za + 14, Za + 24]) { B(X1 - 8, 0, z, X1 - 2, 8, z + 6, HV.hemp); B(X1 - 8, 8, z, X1 - 2, 8, z + 6, HV.hempD); }
  }
  { // a stack of iron bars on two sleepers by the forge's side, a pair of jars by the right-hand houses
    const X = M(-3.0), Z = M(3.4);
    B(X - 8, 0, Z - 1, X + 8, 1, Z, HV.woodD); B(X - 8, 0, Z + 9, X + 8, 1, Z + 10, HV.woodD);
    for (let y = 2; y <= 5; y++) B(X - 6 + (y & 1), y, Z - 2, X + 6 - (y & 1), y, Z + 11, y & 1 ? HS.ironL : HS.iron);
    const J = wbox(w), jx = M(3.6), jz = M(1.9);
    for (const [dx, dz] of [[0, 0], [7, 2]] as const) { J(jx + dx - 3, 0, jz + dz - 3, jx + dx + 3, 7, jz + dz + 3, HV.clay); J(jx + dx - 2, 8, jz + dz - 2, jx + dx + 2, 9, jz + dz + 2, HV.clayL); J(jx + dx - 1, 9, jz + dz - 1, jx + dx + 1, 9, jz + dz + 1, HV.dark); }
  }
  // the snow pines on the terraces and along the cliff feet
  for (const [X, Z, h, s] of PINES) { let y = 0; for (let yy = 140; yy >= -1; yy--) if (w.has(X, yy, Z)) { y = yy + 1; break; } snowPine(w, X, y, Z, h, s); }
  // the far peaks: big snowy masses past the end of the cell grid, in a coarse layer of their own (28 cm blocks, fogged out)
  farPeaks(c);
  // the place is always the winter night: if the spec isn't winter the assembler won't lay the snow, so lay it here
  if (f.p.season !== 'winter') snowPass(c, [...f.layout.path, ...(f.layout.court ? [f.layout.court] : [])]);
}
/** a row of far peaks beyond the back ridge: tiered masses, rock faces under thick snow tops, in 28 cm blocks */
function farPeaks(c: Ctx) {
  const k = 4, w = new VoxWorld(CELL * k), B = wbox(w);
  // [x0, x1 (m), z0, z1 (m, from the group's origin), top (m)]
  const peaks: Array<[number, number, number, number, number]> = [
    [-70, -30, -14, 0, 16], [-48, -16, -26, -8, 24], [-26, 8, -10, 0, 13], [-6, 30, -24, -6, 21], [18, 52, -12, 0, 15], [34, 72, -28, -10, 26], [-4, 20, -36, -20, 30],
  ];
  const q = (m: number) => Math.round(m / (CELL * k));
  for (const [x0, x1, z0, z1, top] of peaks) {
    const X0 = q(x0), X1 = q(x1), Z0p = q(z0), Z1p = q(z1), T = q(top);
    for (let y = -1; y < T; y++) { const col = y >= T - 2 ? SNOW_D : (T - 1 - y) % 6 === 5 ? HS.rockD : HS.rock; B(X0, y, Z1p, X1, y, Z1p, col); B(X0, y, Z0p, X0, y, Z1p, col); B(X1, y, Z0p, X1, y, Z1p, col); }
    B(X0, T, Z0p, X1, T, Z1p, SNOW);
    // a snow step one block in on top: the peak's crown
    B(X0 + 2, T + 1, Z0p + 1, X1 - 2, T + 1, Z1p - 2, SNOW);
  }
  const g = new THREE.Group(); g.position.set(0, -0.1, -36.5);
  for (const m of w.build({ glow: 1.35 })) g.add(m);
  c.add(g);
}

/** the light of 寒山坞 (the title's 雪夜 · 破庙 look, the user's favourite, a little clearer so the valley reads to the back): a deep
 *  blue night, the snow lit by a hidden moon, the windows and the forge the only warm light. The place lays it on when it builds. */
export const HS_MOOD: Mood = {
  sky: true, bg: 0x141a28, fog: 0x232c3e, fogD: 0.022, hemiSky: 0x7a8aa8, hemiGround: 0x3e4452, hemiI: 1.35, moon: 0xa8b8e0, moonI: 1.5, key: 0x8090b0, keyI: 0.28,
  earth: [0x8a92a0, 0x8a92a0, 0x868e9c], mist: 0x5a648c, mistA: 0.06,
  skyTop: 0x0a0e1c, skyMid: 0x1a2234, skyHor: 0x3e4860, skyDisc: [0.3, 0.1, -1], skyDiscCol: [0.32, 0.34, 0.4], moonPos: [-8, 14, -6],
  exposure: 1.35, bloomT: 1.3, glowK: 1.8,
};
// ------------------------------------------------------------------ dressing: the trodden middle of the road, the falling snow, sparks off the stack
function dress(c: Ctx) {
  const w = c.w, tr = (col: number) => { const f = (sh: number) => Math.round(((col >> sh) & 255) * 0.55 + ((0x9ea6b2 >> sh) & 255) * 0.45); return (f(16) << 16) | (f(8) << 8) | f(0); };
  const tread = (X0: number, X1: number, Za: number, Zb: number, row: (Z: number) => number) => {
    for (let Z = Za; Z <= Zb; Z++) { const r = row(Z); if (r < 0) continue; for (let X = X0; X <= X1; X++) { const s = w.get(X, r + 1, Z); if (s && (s.c === SNOW || s.c === SNOW_D)) w.set(X, r + 1, Z, null); const g = w.get(X, r, Z); if (g) g.c = tr(HS.road); } }
  };
  tread(-11, 11, LEDGE.z1 + 1, Z0 - 1, roadRow);
  tread(LEDGE.x0, LEDGE.x1 - 8, LEDGE.z0 + 7, LEDGE.z1 - 6, () => ROAD_TOP);
  // the falling snow over the whole valley and the cutting (the assembler adds the near-stage flurry on top)
  c.ambient({ kind: 'snow', color: 0xeef2fa, rate: 34, area: { x0: -15, z0: -32, x1: 15, z1: 16 } });
  // a few sparks out of the forge stack
  const ch = F.chimney;
  c.ambient({ kind: 'embers', color: 0xff9a40, rate: 1.4, area: { x0: ch[0] - 0.25, z0: ch[2] - 0.25, x1: ch[0] + 0.25, z1: ch[2] + 0.25 }, y: [ch[1] - 0.4, ch[1] - 0.2] });
  // (the night's light is the locale's own mood: HS_MOOD, applied when the place is put up — act-37, not here at build time)
  // no summer fireflies in a snowstorm: the weather layer's warm motes are left out of this place
  const add = c.ambient.bind(c); c.ambient = a => { if (a.kind !== 'fireflies') add(a); };
}

export const hsForge: Locale = {
  id: 'hs_forge', name: '寒山坞', theme: 'hanshan',
  layouts: [], extraLayouts: [LAYOUT],
  seasons: ['winter'], times: ['night'], weathers: ['snow'], mood: HS_MOOD,
  landmarks: [], groups: [],
  floor, far, dress,
};
void cm;
