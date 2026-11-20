// 黄巾残村 · 麦田（hj_field 代理）：村外的麦田 / 粟田，麦收割了一半，仗打进了田里。
// 地面是田埂分开的一块块田：中间那块（战斗区）割完了只剩麦茬，大车道从中间穿过；两翼和远处的田要么麦子还站着（far() 用麦垄块填满
// 道具组之间剩下的空地），要么割完了是麦茬，要么已经翻耕。后方远处是村子的夯土墙、望楼、冒烟的屋顶和黄土塬。
// 地标三选一：粮仓（仓 + 两座囷）/ 水碓（渠上的水轮 + 碓房）/ 社树（社坛上的老槐）。道具组在 hj_field_props.ts，地标在 hj_field_lm.ts。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, hash, field, SX, SZ, STAGE_BIG } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { plot, oak, tone, type Mass } from '../../scenes/flora';
import { ground } from '../../scenes/dress';
import type { Layout, Locale, Place, Rect, SeasonId } from '../types';
import { HC, GRASS, STUBBLE, TUFT, ELM, WATER_MARK, cropOf, wheatBed, smoke, type CropPal } from './hj_field_kit';
import { LANDMARKS } from './hj_field_lm';
import { GROUPS, FILLER } from './hj_field_props';
import { fieldInfill } from './hj_infill';

// ------------------------------------------------------------------ the plots (田): a grid of ridges, each plot in one state
type PlotKind = 'field' | 'wheat' | 'stubble' | 'soil';
interface Plot { x0: number; x1: number; z0: number; z1: number; kind: PlotKind; rowsZ: boolean; H: number; pal: CropPal; far: boolean }
/** ridge lines (metres): x lines run along z; the battle plot spans the middle column from the back ridge to the front ridge */
// act-19: read per build, through SX / SZ (the 2x stage moves the ridges outside the floor outward)
const xsOf = () => [SX(-27), SX(-20), SX(-12.8), PLAY.x0 - 0.8, PLAY.x1 + 0.8, SX(13.0), SX(20), SX(27)];
const zsSideOf = () => [SZ(-36), SZ(-25.5), SZ(-15.6), PLAY.z0 - 0.8, SZ(-1.6), PLAY.z1 + 0.8, SZ(14)];
const zsMidOf = () => [SZ(-36), SZ(-25.5), SZ(-15.6), PLAY.z0 - 0.8, PLAY.z1 + 0.8, SZ(14)];
/** half the width of a ridge (m) */
const RH = 0.15;
const plotCache = new Map<string, Plot[]>();
function plotsOf(seed: number, season: SeasonId): Plot[] {
  const key = seed + season + (STAGE_BIG.on ? `B${STAGE_BIG.kx}x${STAGE_BIG.kz}` : ''); const hit = plotCache.get(key); if (hit) return hit;
  const XS = xsOf(), ZS_SIDE = zsSideOf(), ZS_MID = zsMidOf();
  const out: Plot[] = [], r = (a: number, b: number, k: number) => hash(seed * 31 + a * 7, b * 13 + k, 4111);
  for (let i = 0; i + 1 < XS.length; i++) {
    const zs = i === 3 ? ZS_MID : ZS_SIDE;
    for (let j = 0; j + 1 < zs.length; j++) {
      const x0 = XS[i] + RH, x1 = XS[i + 1] - RH, z0 = zs[j] + RH, z1 = zs[j + 1] - RH;
      const far = x0 >= SX(12.8) || x1 <= SX(-12.8) || z1 <= SZ(-15.6);
      let kind: PlotKind;
      if (i === 3 && z0 < PLAY.z0 && z1 > PLAY.z1) kind = 'field';
      else if (z0 >= PLAY.z1) kind = 'stubble';
      else {
        const h = r(i, j, 1), pw = far ? 0.6 : season === 'autumn' ? 0.62 : 0.7, ps = season === 'autumn' ? 0.2 : 0.2;
        kind = h < pw ? 'wheat' : h < pw + ps ? 'stubble' : 'soil';
      }
      const near = !far && z0 > SZ(-2);
      const H = (season === 'autumn' ? 14 : 13) + (r(i, j, 2) < 0.5 ? 1 : 0) - (near ? 2 : 0);
      out.push({ x0, x1, z0, z1, kind, rowsZ: r(i, j, 3) < 0.62, H, pal: cropOf(season, r(i, j, 4) < (season === 'summer' ? 0.3 : 0.4) ? 1 : 0), far });
    }
  }
  plotCache.set(key, out); if (plotCache.size > 64) plotCache.delete(plotCache.keys().next().value!);
  return out;
}
const inR = (r: Rect, x: number, z: number, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const plotAt = (ps: Plot[], x: number, z: number) => ps.find(p => x >= p.x0 - RH && x < p.x1 + RH && z >= p.z0 - RH && z < p.z1 + RH);
/** the landmark's yard (m): its room from the layout, a little grown */
const yardOf = (l: Layout): Rect | null => l.landmark ? { x0: l.landmark.x - l.landmark.w / 2 - 0.3, x1: l.landmark.x + l.landmark.w / 2 + 0.3, z0: l.landmark.z - l.landmark.d / 2 - 0.3, z1: l.landmark.z + l.landmark.d / 2 + 0.3 } : null;

// ------------------------------------------------------------------ ground
function floor(c: Ctx, f: Parameters<Locale['floor']>[1]) {
  const w = c.w, se = f.p.season, sd = f.p.seed % 97, paths = f.layout.path, court = f.layout.court, ps = plotsOf(f.p.seed, se), yard = yardOf(f.layout);
  const isThreshing = f.arena?.shape?.fixed?.id === 'threshing';
  const G = GRASS[se], S = STUBBLE[se], q = (v: number, s: number) => Math.round(v / s) * s;
  for (let X = M(AREA.x0 - 6); X <= M(AREA.x1 + 6); X++) for (let Z = M(AREA.z0 - 8); Z <= M(AREA.z1 + 4); Z++) {
    const x = (X + 0.5) * CELL, z = (Z + 0.5) * CELL; let col: number;
    const r = paths.find(p => inR(p, x, z));
    if (isThreshing && x > PLAY.x0 + 0.4 && x < PLAY.x1 - 0.4 && z > PLAY.z0 + 0.4 && z < PLAY.z1 - 0.4) {
      // Beaten-earth threshing plaza: central rolled chaff circle + surrounding golden stubble band + cart track leading N/S
      const rad = Math.hypot(x + 1.0, z - 0.6);
      if (rad < 5.6) col = rad > 5.0 ? HC.earthD : (rad < 1.8 ? HC.yard : HC.yardL);
      else if (r) {
        const along = r.z1 - r.z0 >= r.x1 - r.x0, v = along ? X - M((r.x0 + r.x1) / 2) : Z - M((r.z0 + r.z1) / 2), hw = Math.round((along ? r.x1 - r.x0 : r.z1 - r.z0) / CELL / 2), av = Math.abs(v);
        col = av >= hw - 6 && av <= hw - 5 ? HC.trackD : av < hw - 6 ? HC.track : HC.earthL;
      } else if (rad < 8.4) col = (((X + Z) % 10) + 10) % 10 < 2 ? S[1] : HC.earthL;
      else col = (((X % 8) + 8) % 8) < 2 ? S[1] : S[0];
    } else if (r) {
      // the cart track: packed earth, two wheel ruts 1.5 m apart, a slightly lighter crown between them
      const along = r.z1 - r.z0 >= r.x1 - r.x0, v = along ? X - M((r.x0 + r.x1) / 2) : Z - M((r.z0 + r.z1) / 2), hw = Math.round((along ? r.x1 - r.x0 : r.z1 - r.z0) / CELL / 2), av = Math.abs(v);
      col = av >= hw - 6 && av <= hw - 5 ? HC.trackD : av < hw - 6 ? HC.track : HC.earthL;
    } else if (paths.some(p => inR(p, x, z, 0.21))) col = G[2];
    else if (court && inR(court, x, z)) {
      // the threshing floor: rolled smooth and pale, a darker kerb of beaten earth round it
      col = inR(court, x, z, -0.21) ? HC.yardL : HC.earthD;
    } else if (yard && inR(yard, x, z)) col = inR(yard, x, z, -0.21) ? HC.yard : HC.earthD;
    else {
      const pl = plotAt(ps, x, z);
      if (!pl) col = G[1];
      else if (x < pl.x0 || x >= pl.x1 || z < pl.z0 || z >= pl.z1) {
        // the ridge (田埂): a grass band with a darker earth edge either side
        const e = Math.min(Math.abs(x - pl.x0), Math.abs(x - pl.x1), Math.abs(z - pl.z0), Math.abs(z - pl.z1));
        col = e > 0.11 ? G[0] : G[1];
      } else if (pl.kind === 'field') {
        // the battle floor: stubble in rows along the cart track, worn to bare earth near the track and in a few broad patches
        const d = Math.min(...paths.map(p => Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1, 0)));
        const worn = q(d + field(X / 16, Z / 16, sd) * 0.7, 0.5);
        if (worn <= 0.5) col = HC.earthL;
        else if (field(Math.floor(X / 7), Math.floor(Z / 7), sd + 4) > 1.1) col = S[2];
        else col = (((X % 8) + 8) % 8) < 2 ? S[1] : S[0];
      } else if (pl.kind === 'stubble') col = ((((pl.rowsZ ? X : Z) % 6) + 6) % 6) < 2 ? S[1] : S[0];
      else if (pl.kind === 'soil') col = ((((pl.rowsZ ? X : Z) % 6) + 6) % 6) < 2 ? HC.soilD : HC.soil;
      else col = HC.soilD;
    }
    w.set(X, -1, Z, col);
  }
}

// ------------------------------------------------------------------ far ring + the standing wheat
/** carve the ditches the groups marked (WATER_MARK at y = −1) and lay one water plane per ditch */
function carveWater(c: Ctx) {
  const w = c.w, marks = new Set<number>(), ck = (X: number, Z: number) => (X + 4096) * 8192 + (Z + 4096);
  for (const [k, v] of w.cells) { if (v.c !== WATER_MARK) continue; const y = (Math.floor(k / 1024) % 1024) - 512; if (y !== -1) continue; const X = Math.floor(k / (1024 * 1024)) - 512, Z = (k % 1024) - 512; marks.add(ck(X, Z)); }
  const seen = new Set<number>();
  for (const k0 of marks) {
    if (seen.has(k0)) continue;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const st = [k0]; seen.add(k0);
    while (st.length) {
      const k = st.pop()!, X = Math.floor(k / 8192) - 4096, Z = (k % 8192) - 4096;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); z0 = Math.min(z0, Z); z1 = Math.max(z1, Z);
      w.set(X, -1, Z, null); w.set(X, -2, Z, HC.bed, 1);
      for (const n of [ck(X + 1, Z), ck(X - 1, Z), ck(X, Z + 1), ck(X, Z - 1)]) if (marks.has(n) && !seen.has(n)) { seen.add(n); st.push(n); }
    }
    c.water(x0 * CELL, z0 * CELL, (x1 + 1) * CELL, (z1 + 1) * CELL, HC.water);
  }
  return marks;
}

const T = 6;   // a wheat row tile (cells): 5 cells of wheat, 1 cell of furrow
function wheatFill(c: Ctx, f: { layout: Layout; p: Place }, ps: Plot[], water: Set<number>) {
  const w = c.w, yard = yardOf(f.layout), walk = [...f.layout.path, ...(f.layout.court ? [f.layout.court] : [])];
  // tiles taken: anything standing (cells at y ≥ 0, flora masses near the ground, the ditches), grown by 3 cells
  const taken = new Set<number>(), tk = (a: number, b: number) => (a + 2048) * 4096 + (b + 2048);
  const mark = (X: number, Z: number, g = 3) => { for (let a = Math.floor((X - g) / T); a <= Math.floor((X + g) / T); a++) for (let b = Math.floor((Z - g) / T); b <= Math.floor((Z + g) / T); b++) taken.add(tk(a, b)); };
  for (const k of w.cells.keys()) { const y = (Math.floor(k / 1024) % 1024) - 512; if (y < 0) continue; mark(Math.floor(k / (1024 * 1024)) - 512, (k % 1024) - 512); }
  for (const m of plot(w).masses) if (m.y0 <= 14) for (let X = m.x0; X <= m.x1; X += 2) for (let Z = m.z0; Z <= m.z1; Z += 2) mark(X, Z);
  for (const k of water) mark(Math.floor(k / 8192) - 4096, (k % 8192) - 4096);
  for (const pl of ps) {
    if (pl.kind !== 'wheat') continue;
    const A0 = Math.ceil(M(pl.x0) / T) + 0, A1 = Math.floor((M(pl.x1) - T) / T), B0 = Math.ceil(M(pl.z0) / T), B1 = Math.floor((M(pl.z1) - T) / T);
    const ok = (a: number, b: number) => {
      if (a < A0 || a > A1 || b < B0 || b > B1 || taken.has(tk(a, b))) return false;
      const x0 = a * T * CELL, x1 = (a + 1) * T * CELL, z0 = b * T * CELL, z1 = (b + 1) * T * CELL, r: Rect = { x0, x1, z0, z1 };
      const hit = (q: Rect, m: number) => r.x0 < q.x1 + m && r.x1 > q.x0 - m && r.z0 < q.z1 + m && r.z1 > q.z0 - m;
      if (hit(PLAY, 0.9) || walk.some(q => hit(q, 0.45)) || (yard && hit(yard, 0.1)) || z1 > SZ(5.8)) return false;
      if (pl.far && hit(villageRect(), 0.3)) return false;
      return true;
    };
    const lead = pl.rowsZ ? [A0, A1] : [B0, B1], run = pl.rowsZ ? [B0, B1] : [A0, A1];
    for (let u = lead[0]; u <= lead[1]; u++) {
      let v = run[0];
      while (v <= run[1]) {
        const at = (vv: number) => (pl.rowsZ ? ok(u, vv) : ok(vv, u));
        if (!at(v)) { v++; continue; }
        let e = v; while (e + 1 <= run[1] && at(e + 1)) e++;
        // one bed per row run: rows along z leave the furrow on the +x side, rows along x on the +z side
        const [X0, X1, Z0, Z1] = pl.rowsZ ? [u * T, u * T + T - 2, v * T, e * T + T - 1] : [v * T, e * T + T - 1, u * T, u * T + T - 2];
        const cx = (X0 + X1) / 2 * CELL, faces: Array<'+z' | '+x' | '-x'> = ['+z'];
        // the side toward the middle of the stage shows: skin it where the next row is missing (or always for rows along x)
        if (!pl.rowsZ) faces.push(cx > 0 ? '-x' : '+x');
        else { const side = cx > 0 ? -1 : 1; let open = false; for (let vv = v; vv <= e && !open; vv++) if (!ok(u + side, vv)) open = true; if (open) faces.push(cx > 0 ? '-x' : '+x'); }
        wheatBed(c, X0, Z0, X1, Z1, pl.H, pl.pal, pl.far ? faces.filter(fc => fc === '+z' || Math.abs(cx) < 18) : faces);
        v = e + 1;
      }
    }
  }
}

/** the village behind the fields (m): left alone by the wheat */
const villageRect = (): Rect => ({ x0: SX(-15), x1: SX(15), z0: SZ(-32), z1: SZ(-24.6) });
/** a flora mass straight from cells (the far silhouettes are prisms: cheap and bevelled) */
const mass = (c: Ctx, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: number, o: Partial<Mass> = {}) => {
  plot(c.w).masses.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1), cx: 0, cz: 0, top: tone(side, 1.12), side, low: tone(side, 0.72), band: 0, ...o });
};
/** a far roof: three stepped slabs of thatch over a rammed-earth body */
function farHouse(c: Ctx, x: number, z: number, hw: number, hd: number, H: number, burning: boolean, p: Place) {
  const X = M(x), Z = M(z);
  mass(c, X - hw, -1, Z - hd, X + hw, H, Z + hd, HC.ram, { band: 3, low: HC.ramD, top: HC.ramL });
  let y = H + 1, i = 0;
  for (const [d, th] of [[-5, 6], [4, 6], [5, 5]] as const) { const a = hw + 5 - (i ? d + (i > 1 ? 4 : 0) : 0) - (i > 1 ? 0 : 0), b = hd + 5 - (i === 0 ? 0 : i === 1 ? 4 : 9); mass(c, X - a, y, Z - b, X + a, y + th - 1, Z + b, burning && i === 2 ? HC.charL : HC.th, { top: burning && i === 2 ? HC.char : HC.thL, low: HC.thD, band: 1 }); y += th; i++; }
  if (burning) {
    // the burning house: a charred gap in the top slab with embers in it, smoke going up
    smoke(c, [x, (y + 2) * CELL, z], { rate: 2.2, col: 0x8a8278 });
    void p;
  }
}
const lit = (p: Place) => p.lamp > 0.3;
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  const p = f.p, se = p.season, ps = plotsOf(p.seed, se), r = (k: number) => hash(p.seed, k, 613);
  const water = carveWater(c);
  // the village: a rammed-earth enclosure wall, house roofs over it (one or two burning), a watchtower (望楼) and the gate tower
  const WZ = M(SZ(-25.2)), W0 = M(SX(-14.6)), W1 = M(SX(14.6));
  mass(c, W0, -1, WZ - 8, W1, 34, WZ, HC.ram, { band: 4, low: HC.ramD, top: HC.ramL });
  for (let y = 4; y < 34; y += 6) mass(c, W0, y, WZ + 1, W1, y, WZ + 1, HC.ramD, { top: HC.ramD, low: HC.ramD });
  mass(c, W0 - 1, 35, WZ - 9, W1 + 1, 37, WZ + 1, HC.th, { top: HC.thL, low: HC.thD });
  // the gate tower: a dark gateway, a timber upper room with stepped roofs
  const gx = M((r(1) - 0.5) * 8);
  mass(c, gx - 22, -1, WZ - 12, gx + 22, 40, WZ + 3, HC.ram, { band: 4, low: HC.ramD, top: HC.ramL });
  c.w.box(gx - 8, -1, WZ + 4, gx + 8, 26, WZ + 4, HC.dark).box(gx - 10, 27, WZ + 4, gx + 10, 28, WZ + 4, HC.woodD);
  mass(c, gx - 18, 41, WZ - 10, gx + 18, 58, WZ + 1, HC.wood, { band: 2, low: HC.woodD, top: HC.woodL });
  mass(c, gx - 14, 46, WZ + 2, gx + 14, 53, WZ + 2, HC.dark, { top: HC.dark, low: HC.dark });
  mass(c, gx - 26, 59, WZ - 16, gx + 26, 63, WZ + 7, HC.greyD, { top: HC.grey, low: HC.black });
  mass(c, gx - 18, 64, WZ - 11, gx + 18, 68, WZ + 2, HC.greyD, { top: HC.grey, low: HC.black });
  // the watchtower: three storeys of timber, each with its own stepped eave
  const tx = M(SX((r(2) < 0.5 ? -1 : 1) * (9.5 + r(3) * 2))), tz = WZ - 26;
  let y = -1;
  for (const [hw, h] of [[14, 30], [11, 22], [9, 18]] as const) {
    mass(c, tx - hw, y, tz - hw, tx + hw, y + h, tz + hw, HC.wood, { band: 2, low: HC.woodD, top: HC.woodL });
    mass(c, tx - hw - 6, y + h + 1, tz - hw - 6, tx + hw + 6, y + h + 3, tz + hw + 6, HC.greyD, { top: HC.grey, low: HC.black });
    y += h + 4;
  }
  mass(c, tx - 5, y, tz - 5, tx + 5, y + 4, tz + 5, HC.greyD, { top: HC.grey });
  // houses behind the wall, roofs over its top
  const burn = Math.floor(r(4) * 4);
  for (let i = 0; i < 4; i++) {
    const hx = SX(-11 + i * 7.2 + (r(10 + i) - 0.5) * 2), hz = SZ(-28.4) - r(20 + i) * 2.2;
    if (Math.abs(hx * 1 - gx * CELL) < 3.4 || Math.abs(hx - tx * CELL) < 2.6) continue;
    farHouse(c, hx, hz, 30 + Math.floor(r(30 + i) * 10), 20, 36 + Math.floor(r(40 + i) * 8), i === burn || (i === (burn + 2) % 4 && r(50) < 0.5), p);
  }
  // loess terraces (黄土塬) far behind: three wide steps, tan faces, crop or dry grass on the tops
  const topC = se === 'autumn' ? 0x9a8a50 : 0x7a8a46;
  for (const [x0, x1, z0, z1, h] of [[-70, 70, -62, -46, 150], [-70, -24, -48, -40, 90], [22, 70, -48, -39, 110], [-44, -14, -42, -36, 50], [12, 46, -42, -36, 64]] as const)
    mass(c, M(SX(x0)), -1, M(SZ(z0)), M(SX(x1)), h, M(SZ(z1)), 0xb09468, { top: topC, low: 0x8a7050, band: 6 });
  // elms and poplars on the far ridges (a little gap where they would stand in front of the gate)
  const lf = ELM[se];
  const trees: Array<[number, number, number]> = [[-17.6, -18.5, 7.5], [16.8, -19.5, 8.5], [-22, -6, 7], [22.5, -9, 8], [-7.5, -23.6, 6.5], [6.8, -23.2, 7], [-21.5, 6, 6.5], [23, 3, 7.5]];
  trees.forEach(([x0, z0, h], i) => { if (r(60 + i) < 0.25) return; const col = lf[i % lf.length], x = SX(x0), z = SZ(z0); oak(c.w, x, z, h + r(70 + i) * 1.5, { seed: p.seed + i * 7, bark: 0x4a3a2c, dark: 0x30241c, leaf: col[0], leafTop: col[1], low: 0.42, width: 0.85, vines: 0 }); });
  // the standing wheat: every wheat plot, in rows, round whatever already stands there
  wheatFill(c, f, ps, water);
}

// ------------------------------------------------------------------ dressing
function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  const se = f.p.season, sd = f.p.seed, ps = plotsOf(sd, se), G = GRASS[se];
  const clear = (x: number, z: number) => f.clear.some(r => inR(r, x, z, 0.2));
  const inPlayG = (x: number, z: number) => inR(PLAY, x, z, 0.5);
  const floorAt = (x: number, z: number) => c.w.get(M(x), -1, M(z))?.c;
  const grassy = new Set([G[0], G[1], G[2]]);
  const plant = (kind: string, n: number, s: [number, number], want: (x: number, z: number) => boolean, tints: number[], cl = 5, sp = 0.4) => {
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 30) {
      tries++;
      const cx = AREA.x0 - 1 + hash(tries, sd, kind.length * 13 + 1) * (AREA.x1 - AREA.x0 + 2), cz = AREA.z0 - 1 + hash(tries, sd, kind.length * 17 + 2) * (AREA.z1 - AREA.z0 + 1);
      if (inPlayG(cx, cz) || clear(cx, cz) || !want(cx, cz)) continue;
      for (let k = 0; k < cl && placed < n; k++) {
        const x = cx + (hash(tries, k, sd + 3) - 0.5) * sp * 2, z = cz + (hash(tries, k, sd + 4) - 0.5) * sp * 2;
        if (inPlayG(x, z) || clear(x, z) || z > 7.2 || !want(x, z)) continue;
        const y = ground(c, x, z); if (y == null || y > 0.08) continue;
        c.cards.add(kind, x, z, { y, s: s[0] + hash(tries, k, 9) * (s[1] - s[0]), tint: tints[Math.floor(hash(tries, k, 6) * tints.length)] }); placed++;
      }
    }
  };
  // grass along the ridges and the track's verges, weeds here and there, a few ears of wheat left standing at the edges of the stubble
  plant('grass', 260, [0.3, 0.5], (x, z) => grassy.has(floorAt(x, z) ?? 0), TUFT[se], 6, 0.5);
  plant('weeds', 40, [0.4, 0.6], (x, z) => grassy.has(floorAt(x, z) ?? 0), TUFT[se], 2, 0.3);
  const stubbly = (x: number, z: number) => { const pl = plotAt(ps, x, z); return !!pl && pl.kind === 'stubble' && x > pl.x0 + 0.3 && x < pl.x1 - 0.3 && z > pl.z0 + 0.3 && z < pl.z1 - 0.3; };
  plant('maituft', 36, [0.55, 0.75], stubbly, [cropOf(se, 0).ear, cropOf(se, 1).ear], 3, 0.3);
  // inside-PLAY edge micro-detail: stray wheat stalks, grass tufts, scattered threshing straw & warm road pebbles hugging fence/wall bases
  const w = c.w;
  const nearEdge = (x: number, z: number) => {
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || w.has(X, 6, Z)) return false;
    return w.has(X + 8, 6, Z) || w.has(X - 8, 6, Z) || w.has(X, 6, Z + 8) || w.has(X, 6, Z - 8);
  };
  const plantIn = (kind: string, n: number, s: [number, number], want: (x: number, z: number) => boolean, tints: number[], yOff = 0.01) => {
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 28) {
      tries++;
      const x = PLAY.x0 + 0.3 + hash(tries, sd + 17, kind.length * 19 + 1) * (PLAY.x1 - PLAY.x0 - 0.6);
      const z = PLAY.z0 + 0.3 + hash(tries, sd + 29, kind.length * 23 + 2) * (PLAY.z1 - PLAY.z0 - 0.6);
      if (!want(x, z)) continue;
      const y = ground(c, x, z); if (y == null || y > 0.08) continue;
      c.cards.add(kind, x, z, { y: y + yOff, s: s[0] + hash(tries, sd, 37) * (s[1] - s[0]), tint: tints[Math.floor(hash(tries, sd, 43) * tints.length)] });
      placed++;
    }
  };
  plantIn('vtuft', 80, [0.55, 0.88], nearEdge, [0xffffff, 0xe8e0c0], 0);
  plantIn('maituft', 44, [0.58, 0.82], nearEdge, [cropOf(se, 0).ear, cropOf(se, 1).ear], 0);
  plantIn('vpebble', 64, [0.85, 1.25], (x, z) => nearEdge(x, z) || floorAt(x, z) === HC.trackD, [0xffffff, 0xe6dcc8], 0.012);
  plantIn('straw', 48, [0.75, 1.15], (x, z) => nearEdge(x, z) || floorAt(x, z) === HC.yardL, [0xd8c07a, 0xc2a862], 0.012);
  // small non-blocking 3D field stones tucked right along wattle fences & granary footings
  let stones = 0;
  for (let i = 0; i < 180 && stones < 16; i++) {
    const x = PLAY.x0 + 0.6 + hash(i, sd, 71) * (PLAY.x1 - PLAY.x0 - 1.2);
    const z = PLAY.z0 + 0.6 + hash(i, sd, 73) * (PLAY.z1 - PLAY.z0 - 1.2);
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || f.layout.path.some(q => inR(q, x, z, 0.5))) continue;
    if (!(w.has(X, 6, Z - 5) || w.has(X - 5, 6, Z) || w.has(X + 5, 6, Z))) continue;
    w.box(X - 2, 0, Z - 2, X + 2, 1, Z + 1, 0x8d806c);
    w.box(X - 1, 2, Z - 1, X + 1, 2, Z, 0xa89a84);
    stones++;
  }
  // the air: chaff and dust drifting over the fields
  c.ambient({ kind: 'dust', color: 0xe8d8a8, rate: 1.6 });
  void tone;
}

export const hjField: Locale = {
  id: 'hj_field', name: '麦田', theme: 'hanmo',
  layouts: ['axis', 'offset', 'garden', 'pair', 'ridge'],
  landmarks: LANDMARKS, groups: GROUPS, filler: FILLER,
  seasons: ['summer', 'autumn'],
  floor, far, dress,
  // 11-18 屋子形态: a corner of standing wheat (曲尺), a field to fight round (回廊), a path through the wheat (窄巷), an irrigation
  // channel or a dry gully with a bridge (过桥), a gully cut into the field (临水)
  shapes: ['ell', 'cloister', 'neck', 'bridge', 'pond'], pits: ['water', 'ditch'], infill: fieldInfill,
};
