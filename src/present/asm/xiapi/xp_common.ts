// 第三关 · 下邳寒沼：三个地点共用的积水（pools）、地面铺法、水面、近排矮件、填空件、飘雪和飘雾。
// 积水的做法：地面层（y = −1）在积水处不放格子，整个舞台下面垫一块暗色的「水底」平面，再盖一块半透明的水面（c.water），
// 有地砖的地方地砖把它们挡住，挖空的地方就露出暗青灰的水；舞台外的远处同样是这一片水（泡在水里的城外）。
// 道具组建在沙盒里拿不走地面格子，所以要「泡在水里」的组在地面层涂 XP_MARK，far() 里统一挖掉（carveMarks）。
// 战斗区里的积水矩形由 poolsOf(spec.seed) 给出：show.ts 用 LOCALES[id].pools(spec.seed) 取同一份给水鬼用，所以必须只看种子。
import * as THREE from 'three';
import { attachCraftWater } from '../../look/craft';
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, hash, STAGE_BIG } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { plot, tone } from '../../scenes/flora';
import type { Group, Layout, Place, Rect } from '../types';
import { XP, XP_MARK, frame, orient, faceOf, wp, capCol, fireLight, brazier, sackRow, crate, bollard, sunkBoat, markWater } from './xp_kit';

// ------------------------------------------------------------------ the pools on the battle floor
/**
 * The shallow water on this room's battle floor (m, world), from the spec's seed alone: 2–4 rects about 3.5×3 to 5.6×4.2 m, on a
 * 0.7 m grid (whole slabs), kept off the way in (x ±2.6, z 5.7…), the boss's mark (0, −9.2) and 2.6 m round it, the strip in front
 * of the back wall (its gate's approach) and the side gates' approaches, ≥ 1.4 m apart. Written for the 2x stage (x −10.4…10.8,
 * z −12.8…11.2); on the old small stage (the batch tests) everything is halved. salt: each place its own pattern for the same seed.
 */
export function poolsOf(seed: number, salt: number, o: { n?: [number, number] } = {}): Rect[] {
  const key = `${seed}|${salt}|${STAGE_BIG.on ? 1 : 0}`, hit = POOL_CACHE.get(key); if (hit) return hit.map(r => ({ ...r }));
  const r = (k: number) => hash(seed * 131 + 17, k * 7 + salt * 1013, 7717), G = 0.7;
  const P = { x0: -10.4, x1: 10.8, z0: -12.8, z1: 11.2 };
  const avoid: Rect[] = [
    { x0: -3.0, x1: 3.0, z0: 5.3, z1: 12 },        // her way in
    { x0: -3.0, x1: 3.0, z0: -12.2, z1: -6.2 },    // the boss's mark (0, −9.2) and 2.6 m round it (and the back gate's approach)
    { x0: -11, x1: 11.4, z0: -13, z1: -10.2 },     // the strip in front of the back wall
    { x0: -11, x1: -5.4, z0: -12, z1: -6.4 },      // the side gates' approaches (behind the enemy line)
    { x0: 5.6, x1: 11.4, z0: -12, z1: -6.4 },
  ];
  const [nMin, nMax] = o.n ?? [2, 4], want = nMin + Math.floor(r(1) * (nMax - nMin + 1)), out: Rect[] = [];
  const ws = [3.5, 4.2, 4.9, 5.6], ds = [2.8, 3.5, 3.5, 4.2];
  const hits = (a: Rect, b: Rect, m: number) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
  for (let t = 0; t < 80 && out.length < want; t++) {
    const w = ws[Math.floor(r(10 + t * 5) * ws.length) % ws.length], d = ds[Math.floor(r(11 + t * 5) * ds.length) % ds.length];
    const cx = P.x0 + 0.8 + w / 2 + r(12 + t * 5) * (P.x1 - P.x0 - 1.6 - w), cz = P.z0 + 2.4 + d / 2 + r(13 + t * 5) * (P.z1 - P.z0 - 3.1 - d);
    const x0 = Math.round((cx - w / 2) / G) * G, z0 = Math.round((cz - d / 2) / G) * G, q = { x0, x1: x0 + w, z0, z1: z0 + d };
    if (q.x0 < P.x0 + 0.7 || q.x1 > P.x1 - 0.7 || q.z0 < P.z0 + 2.4 || q.z1 > P.z1 - 0.7) continue;
    if (avoid.some(a => hits(q, a, 0)) || out.some(b => hits(q, b, 1.4))) continue;
    out.push(q);
  }
  // on the old small stage (tests): the same pattern at half size, on its 0.35 m grid
  const k = STAGE_BIG.on ? 1 : 0.5, snap = (v: number) => Math.round(v * k / 0.35) * 0.35;
  const res = out.map(q => ({ x0: +snap(q.x0).toFixed(2), x1: +snap(q.x1).toFixed(2), z0: +snap(q.z0).toFixed(2), z1: +snap(q.z1).toFixed(2) }));
  POOL_CACHE.set(key, res); if (POOL_CACHE.size > 64) POOL_CACHE.delete(POOL_CACHE.keys().next().value!);
  return res.map(q => ({ ...q }));
}
const POOL_CACHE = new Map<string, Rect[]>();
/** the spec's seed back from the floor's Place (assemble.ts: place(…, salt 1).seed = spec.seed * 97 + 1) */
export const specSeedOf = (p: Place) => Math.round((p.seed - 1) / 97);
export const inR = (r: Rect, x: number, z: number, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

// ------------------------------------------------------------------ the floor
/** where a floor cell is: 'play' = the battle floor and the wall's band round it, 'path' = a walkway outside it, 'rest' = the rest */
export type Zone = 'play' | 'path' | 'rest';
/** a place's paving: colour of the cell (X, Z) (cells; x, z = its centre in m) in its zone; null = under water */
export type Pave = (X: number, Z: number, x: number, z: number, zone: Zone, path: Rect | null) => number | null;
/** the extent every place floors (cells) */
export const floorBox = () => ({ X0: M(AREA.x0 - 6), X1: M(AREA.x1 + 6), Z0: M(AREA.z0 - 8), Z1: M(AREA.z1 + 4) });
/**
 * Pave the stage: the pools (and a two-cell rim of dark wet stone round them) on the battle floor, the rest by the place's own pave();
 * a cell the pave leaves null is water. Then the water: a dark bed plane under the whole stage and the semi-transparent surface on it
 * (both under the floor's top, so the paving hides them and only the open cells show water).
 */
export function xpFloor(c: Ctx, f: { layout: Layout; p: Place }, pools: Rect[], pave: Pave, o: { keep?: (x: number, z: number) => boolean } = {}) {
  const w = c.w, { X0, X1, Z0, Z1 } = floorBox(), band = 0.75, rim = CELL * 2.01;
  const PB = { x0: PLAY.x0 - band, x1: PLAY.x1 + band, z0: PLAY.z0 - band, z1: PLAY.z1 + 2 };
  for (let X = X0; X <= X1; X++) for (let Z = Z0; Z <= Z1; Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL;
    // act-146: walkable shallow puddles (pools) keep visible wet sunken flagstones underneath instead of looking like bottomless deep canals!
    if (pools.some(q => inR(q, x, z))) { w.set(X, -1, Z, slabs(X, Z, 10, 10, XP.shore, XP.dark)); continue; }
    const inP = inR(PB, x, z), path = f.layout.path.find(q => inR(q, x, z)) ?? null;
    // (the place's own structure on the battle floor — the lane's boardwalk — runs right up to the water, no stone rim)
    // the pool's edge: one cell of dark wet stone at the water, then one of a pale kerb (frames the shallow puddle in every light)
    if (!o.keep?.(x, z) && pools.some(q => inR(q, x, z, rim))) { w.set(X, -1, Z, pools.some(q => inR(q, x, z, CELL * 1.01)) ? XP.slabW : XP.kerb); continue; }
    const col = pave(X, Z, x, z, inP ? 'play' : path ? 'path' : 'rest', path);
    if (col != null) w.set(X, -1, Z, col);
  }
  // Thin translucent ankle-deep puddle glaze over each walkable pool (stone slabs & joints remain clearly visible underneath!)
  if (pools.length) {
    const pMat = attachCraftWater(new THREE.MeshStandardMaterial({ color: 0x3a5462, roughness: 0.14, metalness: 0.28, transparent: true, opacity: 0.36, depthWrite: false, emissive: new THREE.Color(0x0c1820) }));
    for (const q of pools) {
      const pw = Math.max(0.2, q.x1 - q.x0 - CELL * 0.4), pd = Math.max(0.2, q.z1 - q.z0 - CELL * 0.4);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), pMat);
      pm.rotation.x = -Math.PI / 2;
      pm.position.set((q.x0 + q.x1) / 2, 0.012, (q.z0 + q.z1) / 2);
      pm.renderOrder = 2; pm.receiveShadow = true;
      c.add(pm);
    }
  }
  waterPlanes(c);
}
/** the deep flood bed and surface (once per stage). Recessed at y = -0.52 m so impassable deep canals (~ PIT) show their true
 *  stone embankment drop-off and can never be confused with walkable shallow puddles on the paved street. */
export function waterPlanes(c: Ctx) {
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshLambertMaterial({ color: XP.bed }));
  bed.rotation.x = -Math.PI / 2; bed.position.y = -0.78; bed.receiveShadow = true; c.add(bed);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), attachCraftWater(new THREE.MeshStandardMaterial({ color: XP.water, roughness: 0.22, metalness: 0.3, transparent: true, opacity: 0.88, emissive: new THREE.Color(0x081014) })));
  top.rotation.x = -Math.PI / 2; top.position.y = -0.52; top.renderOrder = 2; top.receiveShadow = true; c.add(top);
}
/** dig out what the groups marked as water (XP_MARK at y = −1): no cell there, so the water shows. A mark that reached the battle
 *  floor or the wall's band round it becomes dark wet stone instead: the only water on the floor is the pools (the 水鬼 swim in
 *  exactly those). Returns how many cells were dug. */
export function carveMarks(c: Ctx) {
  const w = c.w, gone: number[] = [], band = 0.8;
  for (const [k, v] of w.cells) {
    if (v.c !== XP_MARK) continue;
    const X = Math.floor(k / (1024 * 1024)) - 512, Z = (k % 1024) - 512, x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL;
    if (x > PLAY.x0 - band && x < PLAY.x1 + band && z > PLAY.z0 - band && z < PLAY.z1 + band) v.c = XP.shore; else gone.push(k);
  }
  for (const k of gone) w.cells.delete(k);
  return gone.length;
}
/** 11-18 (用户：「不许逐格随机碎点」): 槽线按铺法错开，石色由整片路面和水边决定。 */
export function slabs(X: number, Z: number, sw: number, sd: number, body: number, joint: number) {
  const sx = X + (Math.floor(Z / sd) & 1) * Math.floor(sw / 2);
  return Z % sd === 0 || sx % sw === 0 ? joint : body;
}

/** 栈道沿着通道铺同色长板，只留板缝和错开的接头。 */
export function deck(X: number, Z: number, alongX: boolean) {
  const across = alongX ? Z : X, along = alongX ? X : Z, board = Math.floor(across / 6);
  return across - board * 6 === 5 || (along + board * 16) % 32 === 0 ? XP.plankD : XP.plank;
}

// ------------------------------------------------------------------ the near-row pieces every 下邳 place has (≤ 0.9 m, so they may stand
// in the near slots; the brazier is the one exception and the only warm light most rooms get)
export function commonGroups(pre: string): Group[] {
  return [
    { id: `${pre}_brazier`, name: '火盆', tags: ['fire', 'light'], foot: { w: 1.2, d: 1.2 }, h: 1.2, kinds: ['wing', 'back'], size: 'S', weight: 0.7, build(c, p) {
      const B = frame(c.w, p.x, p.z, 0), lit = p.time !== 'day' || p.rnd(1) < 0.5, fl = brazier(B, 0, 0, lit, 8);
      B(-8, -1, -8, 8, -1, 8, XP.stoneDD);
      if (lit) fireLight(c, p, wp(p, 0, fl[0], fl[1] + 3, fl[2]), 1, 5);
    } },
    { id: `${pre}_sacks`, name: '沙袋堆', tags: ['sandbag', 'low'], foot: { w: 2.4, d: 2.0 }, h: 0.8, kinds: ['wing', 'back'], size: 'S', weight: 1.3, build(c, p) {
      // an L of bags three courses high, the short arm two; the frost / snow on the top course
      const B = frame(c.w, p.x, p.z, orient(p)), cap = capCol(p);
      sackRow(B, -16, 14, -6, 1, 3, cap); sackRow(B, 8, 16, 2, 12, 2, cap);
      B(-18, -1, -9, 18, -1, 14, XP.mud);
    } },
    { id: `${pre}_float`, name: '漂箱', tags: ['water', 'low'], foot: { w: 2.2, d: 2.2 }, h: 0.6, kinds: ['wing', 'back'], size: 'S', build(c, p) {
      // a patch of flood with crates sunk to their middles, a door leaf floating flat, a jar on its side
      const B = frame(c.w, p.x, p.z, orient(p));
      markWater(B, -14, -12, 14, 12, 2);
      crate(B, -6, -4, 4); crate(B, 3, -6, 3);
      B(-4, 0, 4, 10, 0, 10, XP.plank); for (let x = -4; x <= 10; x += 4) B(x, 0, 4, x, 0, 10, XP.plankD); B(-4, 0, 6, 10, 0, 6, XP.woodD);
      B(8, 0, -2, 12, 2, 1, 0x5e5650); B(9, 3, -1, 11, 3, 0, 0x4a4440);
    } },
    { id: `${pre}_moor`, name: '系船石', tags: ['stone', 'low'], foot: { w: 1.4, d: 2.2 }, h: 0.8, kinds: ['wing'], size: 'S', build(c, p) {
      const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
      bollard(B, -10, 0, 10); bollard(B, 10, 0, 9);
      B(-6, 7, 0, 6, 7, 0, XP.rope); B(-2, 0, 4, 3, 1, 8, XP.rope); B(-1, 2, 5, 2, 2, 7, XP.ropeD);
      markWater(B, -14, -9, 14, -5, 1);
    } },
    { id: `${pre}_skiff`, name: '半沉的船', tags: ['boat', 'water', 'low'], foot: { w: 3.0, d: 1.6 }, h: 0.6, kinds: ['wing', 'back'], size: 'S', build(c, p) {
      const B = frame(c.w, p.x, p.z, 0); sunkBoat(B, 0, 0, 30, 6);
      B(-6, 2, -12, 10, 2, -11, XP.woodD);   // an oar adrift beside it
    } },
  ];
}
/** small pieces for the leftover room on the wings: on dry ground a stone or a bag, on the water a plank or a cake of ice */
export function commonFiller(pre: string): Group[] {
  // (a group's water is still marked, not carved, while the filler probes: a mark counts as water)
  const isWet = (c: Ctx, p: Place) => { const v = c.w.get(M(p.x), -1, M(p.z)); return !v || v.c === XP_MARK; };
  const dry = (c: Ctx, p: Place) => { if (isWet(c, p)) throw new Error('no ground'); };
  const wet = (c: Ctx, p: Place) => { if (!isWet(c, p)) throw new Error('not water'); };
  return [
    { id: `${pre}_f_stone`, name: '残石', tags: ['low'], foot: { w: 1.0, d: 0.9 }, h: 0.4, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
      dry(c, p); const B = frame(c.w, p.x, p.z); B(-6, 0, -4, 6, 3, 4, XP.stoneD); B(-4, 4, -3, 3, 5, 2, XP.stone); B(-4, 6, -3, 3, 6, 2, capCol(p));
    } },
    { id: `${pre}_f_sack`, name: '沙袋', tags: ['low'], foot: { w: 1.0, d: 0.8 }, h: 0.3, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
      dry(c, p); const B = frame(c.w, p.x, p.z); B(-6, 0, -3, 1, 2, 3, XP.sackW); B(2, 0, -3, 6, 2, 2, XP.sack); B(-3, 3, -2, 3, 4, 2, XP.sackL); B(-3, 5, -2, 3, 5, 2, capCol(p));
    } },
    { id: `${pre}_f_plank`, name: '漂板', tags: ['low'], foot: { w: 1.2, d: 0.7 }, h: 0.1, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
      wet(c, p); const B = frame(c.w, p.x, p.z); B(-8, -7, -3, 8, -7, 3, XP.plank); B(-8, -7, 0, 8, -7, 0, XP.plankD); B(-8, -7, -3, -8, -7, 3, XP.woodD);
    } },
    { id: `${pre}_f_ice`, name: '浮冰', tags: ['low'], foot: { w: 1.0, d: 0.8 }, h: 0.1, kinds: ['wing'], size: 'S', max: 3, build(c, p) {
      wet(c, p); const B = frame(c.w, p.x, p.z); B(-6, -7, -4, 5, -7, 4, XP.ice); B(-4, -7, -2, 2, -7, 2, XP.iceL); B(6, -7, -2, 8, -7, 1, XP.ice);
    } },
  ];
}

// ------------------------------------------------------------------ the far ring: cheap prisms (flora masses: a few faces each, no cells)
/** a far prism (cells, bounds in any order): side colour, its lit top, the dark band at its foot */
export function farMass(c: Ctx, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: number, o: { top?: number; low?: number; band?: number } = {}) {
  plot(c.w).masses.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1), cx: 0, cz: 0, top: o.top ?? tone(side, 1.12), side, low: o.low ?? tone(side, 0.7), band: o.band ?? 0 });
}
/** a far flooded house (m): a white body standing in the water (its wet foot a dark band, dark posts every 10 cells and a band of dark
 *  windows on the faces), a black roof of three stepped slabs, snow / frost on each */
export function farHouse(c: Ctx, x: number, z: number, hw: number, hd: number, H: number, cap: number, o: { cut?: boolean } = {}) {
  const X = M(x), Z = M(z);
  farMass(c, X - hw, -1, Z - hd, X + hw, H, Z + hd, XP.plasterD, { band: 7, low: XP.dampD, top: XP.plaster });
  // posts and a window band as thin plates on the four faces (their own prisms, a cell proud)
  for (let a = X - hw; a <= X + hw; a += 10) for (const zz of [Z - hd - 1, Z + hd + 1]) farMass(c, a, 6, zz, a + 1, H, zz, XP.woodD, { top: XP.woodD, low: XP.woodD });
  for (let b = Z - hd; b <= Z + hd; b += 10) for (const xx of [X - hw - 1, X + hw + 1]) farMass(c, xx, 6, b, xx, H, b + 1, XP.woodD, { top: XP.woodD, low: XP.woodD });
  const wy = Math.round(H * 0.55);
  for (const xx of [X - hw - 1, X + hw + 1]) farMass(c, xx, wy, Z - hd + 4, xx, wy + 5, Z + hd - 4, XP.dark, { top: XP.dark, low: XP.dark });
  for (const zz of [Z - hd - 1, Z + hd + 1]) farMass(c, X - hw + 4, wy, zz, X + hw - 4, wy + 5, zz, XP.dark, { top: XP.dark, low: XP.dark });
  let y = H + 1;
  const tiers: Array<[number, number, number]> = [[hw + 4, hd + 5, 3], [hw + 1, hd + 1, 3], [hw - 2, hd - 4, 3]];
  tiers.forEach(([a, b, th], i) => { if (b < 2) return; const a1 = o.cut && i ? Math.round(a * 0.3) : a; farMass(c, X - a, y, Z - b, X + a1, y + th - 1, Z + b, XP.tile, { top: cap === XP.snow || i === 2 ? cap : XP.tileL, low: XP.tileD, band: 1 }); y += th; });
}
/** a far city wall along x (m) at z, H cells tall: the body, a walkway course, merlons 6 cells wide every 10 (snow / frost on top) */
export function farWall(c: Ctx, x0: number, x1: number, z: number, H: number, cap: number, d = 30) {
  const X0 = M(x0), X1 = M(x1), Z = M(z);
  farMass(c, X0, -1, Z - d, X1, H, Z, XP.brickD, { band: 10, low: XP.brickW, top: cap });
  farMass(c, X0, H + 1, Z - 3, X1, H + 4, Z, XP.brickD, { top: cap });
  for (let x = X0; x + 5 <= X1; x += 10) farMass(c, x, H + 5, Z - 3, x + 5, H + 9, Z, XP.brickD, { top: cap });
}
/** a far tower on the wall (m): a brick base, a white storey, two black roof slabs (a city gate tower in the mist) */
export function farTower(c: Ctx, x: number, z: number, hw: number, H: number, cap: number) {
  const X = M(x), Z = M(z);
  farMass(c, X - hw, -1, Z - hw, X + hw, H, Z + hw, XP.brickD, { band: 10, low: XP.brickW, top: cap });
  farMass(c, X - hw + 4, H + 1, Z - hw + 4, X + hw - 4, H + 22, Z + hw - 4, XP.plasterD, { top: XP.plaster });
  farMass(c, X - hw - 2, H + 23, Z - hw - 2, X + hw + 2, H + 26, Z + hw + 2, XP.tile, { top: cap, low: XP.tileD, band: 1 });
  farMass(c, X - hw + 5, H + 27, Z - hw + 5, X + hw - 5, H + 30, Z + hw - 5, XP.tile, { top: cap, low: XP.tileD, band: 1 });
}

/** 潮湿石面围着积水成片，空气里的浅雾和飞雪交给粒子。 */
export function xpDress(c: Ctx, f: { p: Place }, scale = 1) {
  const mist = f.p.weather === 'mist';
  c.ambient({ kind: 'dust', color: 0xc8d4dc, rate: scale * (mist ? 3.2 : 1.4), y: [0.1, 1.2] });
  if (f.p.weather !== 'snow') c.ambient({ kind: 'snow', color: 0xe8eef4, rate: mist ? 2 : 4 });
}
