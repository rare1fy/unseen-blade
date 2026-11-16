// The moonlit graveyard in the characters' block language (same block size as the bestiary). Shared by the battle (look/env.ts) and
// the scene browser, so its contract is fixed: the courtyard, the altar (centre, radius, top height) and the four lantern posts stay
// where the battle staging expects them, and the courtyard floor stays flat and clear for the dice.
// Rules for a calm read: big flat masses, only axis-aligned edges, slopes as a few wide tiers, no random speckle; detail comes from
// structured patterns (stone courses, iron finials in a row, carved panels) and from props grouped into small scenes.
// Layout: the lich's altar in the middle; behind it a gated iron fence with two hooded keeper statues on the gate piers, and the
// mausoleum (podium, portico, pediment roof, a crypt door) as the landmark at the back; broken walls along the sides; rows of grave
// plots on both flanks; dead trees in the corners.
// Desolation pass (Duskwood): nobody has tended this place in years. Headstones lean (an upper part offset by a cell, never a slope),
// some have snapped and lie across their graves, some graves are dug open with the earth heaped beside them; the mausoleum has lost a
// column, a corner of its roof and a door leaf; the fence has a fallen panel and a bent run, its iron rusting; flagstones are missing
// or heaved up at the margins; flowers are dead; the only flames are cold soul-light; crows sit on the high points.
import * as THREE from 'three';
import { VoxWorld } from './voxkit';
import { CELL } from '../bestiary/kit';

const C = {
  TILE: [0x646274, 0x5e5c70, 0x6a687c], GROUT: 0x2a2832, MOSS: 0x4e7038, MOSS_D: 0x3a5a2c, DIRT: 0x3a3030, EARTH: 0x3e3a36, DIRT_D: 0x1e1a1c, RUN: [0x7a788c, 0x747286], RUN_E: 0x4a4858, APRON: 0x5a586c,
  ALTAR: 0x6a687e, ALTAR_D: 0x52506a, STEP: 0x84849c, GOLD: 0xd0a850, GOLD_D: 0x8a6a3a,
  PILLAR: 0x7a7a90, PILLAR_D: 0x5c5c72, GRAVE: [0x7c7e8e, 0x686a7a, 0x5a5c6c], ENGRAVE: 0x3a3a4a, IRON: 0x2c2a36, IRON_L: 0x4a4858, RUST: 0x5e3a2a, RUST_L: 0x7a4c32,
  BARK: 0x403436, BARK_D: 0x2c2326, WALL: 0x5a586a, WALL_D: 0x46445a, WALL_L: 0x6e6c80, SOUL: 0x5affb0,
  ROOF: 0x4a4860, ROOF_L: 0x5e5c76, DOOR: 0x2a2430, DARK: 0x14121a, STATUE: 0x7c7e90, STATUE_D: 0x5e6072, STATUE_L: 0x9496a8,
  TURF: [0x2e3430, 0x282e2a, 0x36382e], WAX: 0xcfcab8, CANDLE: 0x9af0d0, PETAL: [0x7a6c64, 0x8a8478, 0x6e6268], LEAFG: 0x4a5040,
  IVY: 0x34442e, IVY_L: 0x42543a, WOOD_D: 0x3a302c, BONE: 0xd8d0bc, CROW: 0x16161c, CROW_L: 0x2c2c38, BEAK: 0x4a4440,
};
const hash = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export interface VoxArena { meshes: THREE.Mesh[]; flames: THREE.Vector3[]; altarTop: number; world: VoxWorld }

export function buildVoxArena(o: { altar: THREE.Vector3; altarR: number; lanterns: THREE.Vector3[] }): VoxArena {
  const w = new VoxWorld(CELL), M = (m: number) => Math.round(m / CELL);
  const B = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g = 0) => w.box(x0, y0, z0, x1, y1, z1, c, g);
  const ax = M(o.altar.x), az = M(o.altar.z), rB = M(o.altarR + 0.7), rM = M(o.altarR + 0.2), top = M(0.56);
  const stepW = M(1.3), stepFront = az + rM - 2 + 15;
  // ---------------------------------------------------------------- courtyard: big staggered flagstones (~1 m), flush with y = 0;
  // a processional runner of lighter slabs from the altar steps to the front, a darker apron around the altar. Some slabs are gone
  // (bare earth, flush), and at the margins some have heaved up a cell.
  const X0 = M(-6.5), X1 = M(6.5), Z0 = M(-9.1), Z1 = M(7.9), P = 15, RW = M(1.25);
  for (let x = X0; x < X1; x++) for (let z = Z0; z < Z1; z++) {
    const dx = Math.abs(x - ax), dz = Math.abs(z - az);
    if (Math.abs(x) <= RW && z >= stepFront) {
      if (Math.abs(x) === RW) { w.set(x, -1, z, C.RUN_E); continue; }
      const k = Math.floor((z - stepFront) / 12), lz = (z - stepFront) % 12; if (lz === 11) { w.set(x, -2, z, C.GROUT); continue; }
      w.set(x, -1, z, hash(k, x < 0 ? 1 : 2, 7) < 0.2 && Math.abs(x) > 2 ? C.EARTH : C.RUN[k % 2]); continue;
    }
    if (dx <= rB + 3 && dz <= rB + 3) { w.set(x, -1, z, C.APRON); continue; }
    const tz = Math.floor((z - Z0) / P), lz = (z - Z0) % P, sx = x - X0 + (tz & 1 ? 7 : 0), tx = Math.floor(sx / P), lx = sx % P;
    if (lx === P - 1 || lz === P - 1) { w.set(x, -2, z, C.GROUT); continue; }
    const margin = Math.abs(x * CELL) > 5.4 || z * CELL < -7.6 || z * CELL > 6.4;
    if (hash(tx, tz, 5) < 0.08) { w.set(x, -1, z, margin ? C.MOSS_D : C.EARTH); continue; }
    const edge = Math.abs(x * CELL) > 4.2 || z * CELL < -6.6, col = (margin && hash(tx, tz, 2) < 0.45) || (edge && hash(tx, tz, 2) < 0.22) ? C.MOSS_D : C.TILE[Math.floor(hash(tx, tz, 1) * 3)];
    // a right-angle crack across some slabs: in from one edge, a turn at the middle, out through the next
    const ck = hash(tx, tz, 8), m = 6 + Math.floor(hash(tx, tz, 9) * 3);
    if (ck < 0.22 && ((lz === m && lx <= m) || (lx === m && lz >= m && lz < P - 1))) { w.set(x, -1, z, C.GROUT); continue; }
    w.set(x, -1, z, col);
    if (margin && hash(tx, tz, 6) < 0.16 && lx > 0 && lz > 0 && lx < P - 2 && lz < P - 2) w.set(x, 0, z, col);
  }
  // the graveyard ground outside the courtyard: dark turf in big blocky patches; a short paved path from the gate to the mausoleum
  for (let x = M(-12.5); x < M(12.5); x++) for (let z = M(-16); z < M(8.6); z++) {
    if (x >= X0 - 3 && x < X1 + 3 && z >= Z0 - 3 && z < Z1 + 3) continue;
    if (Math.abs(x) <= 22 && z >= M(-10.5) && z < Z0 - 3) { const lz = (z - M(-10.5)) % 10; w.set(x, lz === 9 || Math.abs(x) === 22 ? -2 : -1, z, lz === 9 || Math.abs(x) === 22 ? C.GROUT : C.TILE[(Math.floor((z + 400) / 10) + (x < 0 ? 0 : 1)) % 3]); continue; }
    const px = Math.floor(x / 9), pz = Math.floor(z / 9), f = Math.sin(px * 0.8 + 2) * Math.cos(pz * 0.6) + Math.sin((px + pz) * 0.37) * 0.5;
    w.set(x, -1, z, f > 0.7 ? C.TURF[2] : f < -0.6 ? C.TURF[1] : C.TURF[0]);
  }
  // a kerb around the courtyard, in long even runs, broken in a few places
  const curb = (x0: number, z0: number, x1: number, z1: number) => B(x0, -2, z0, x1, 0, z1, C.WALL_D);
  curb(X0 - 3, Z0 - 3, X1 + 2, Z0 - 1); curb(X0 - 3, Z1, X1 + 2, Z1 + 2); curb(X0 - 3, Z0, X0 - 1, Z1 - 1); curb(X1, Z0, X1 + 2, Z1 - 1);
  B(X0 - 3, -1, M(-3.2), X0 - 1, 0, M(-2.4), null); B(X1, -1, M(1.6), X1 + 2, 0, M(2.6), null); B(M(3.2), -1, Z1, M(4.4), 0, Z1 + 2, null);

  // ---------------------------------------------------------------- small pieces used everywhere
  function candles(x: number, y: number, z: number, sd: number, n = 3) {
    const hs = [3, 5, 2];
    [[-1, 0], [1, -1], [0, 1]].slice(0, n).forEach(([dx, dz], i) => { const h = hs[(i + Math.abs(sd)) % 3]; B(x + dx, y, z + dz, x + dx, y + h - 1, z + dz, C.WAX); w.set(x + dx, y + h, z + dz, C.CANDLE, 1); });
  }
  const deadFlowers = (x: number, z: number, sd: number) => {
    B(x - 1, 0, z - 1, x + 1, 1, z + 1, C.WALL_D); B(x, 2, z, x, 3, z, C.LEAFG);
    const p = C.PETAL[sd % 3]; w.set(x - 1, 3, z, p).set(x + 1, 2, z, p).set(x, 4, z, p);
  };
  /** a crow on a perch (y = first cell above it), facing f: 0 +z, 1 +x, 2 -z, 3 -x */
  function crow(x: number, y: number, z: number, f: number) {
    const [ux, uz] = [[0, 1], [1, 0], [0, -1], [-1, 0]][f & 3];
    const P2 = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, c: number) => {
      const xs = [x + u0 * ux + v0 * uz, x + u1 * ux + v1 * uz], zs = [z + u0 * uz - v0 * ux, z + u1 * uz - v1 * ux];
      B(Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), y1, Math.max(...zs), c);
    };
    P2(0, y, -1, 0, y, -1, C.BEAK); P2(0, y, 1, 0, y, 1, C.BEAK);
    P2(-2, y + 1, -1, 1, y + 3, 1, C.CROW); P2(-2, y + 2, -1, 0, y + 2, -1, C.CROW_L); P2(-2, y + 2, 1, 0, y + 2, 1, C.CROW_L);
    P2(1, y + 3, -1, 2, y + 4, 1, C.CROW); P2(3, y + 3, 0, 3, y + 3, 0, C.BEAK); P2(-4, y + 1, -1, -3, y + 1, 1, C.CROW);
  }

  // ---------------------------------------------------------------- the altar: plinth with a lit lip, upper tier with carved panels and a
  // gold rim (flaking off in stretches), candle posts on the notched corners (one snapped), front steps between cheek blocks
  const sq = (dx: number, dz: number, r: number, n: number) => Math.abs(dx) <= r && Math.abs(dz) <= r && !(Math.abs(dx) > r - n && Math.abs(dz) > r - n);
  for (let dx = -rB; dx <= rB; dx++) for (let dz = -rB; dz <= rB; dz++) {
    if (sq(dx, dz, rM, 5)) { B(ax + dx, -2, az + dz, ax + dx, top - 1, az + dz, C.ALTAR); if (!sq(dx, dz, rM - 1, 5)) w.set(ax + dx, top - 1, az + dz, hash(Math.floor((dx + 40) / 7), Math.floor((dz + 40) / 7), 3) < 0.3 ? C.ALTAR_D : C.GOLD); }
    else if (sq(dx, dz, rB, 7)) { B(ax + dx, -2, az + dz, ax + dx, 1, az + dz, C.ALTAR_D); if (!sq(dx, dz, rB - 1, 7)) w.set(ax + dx, 1, az + dz, C.STEP); }
  }
  for (const [fx, fz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) for (const u of fz === 1 ? [-26, 26] : [-20, -10, 0, 10, 20]) {
    const hw = fz === 1 ? 2 : 3, px = fz ? ax + u : ax + fx * rM, pz = fz ? az + fz * rM : az + u;
    B(fz ? px - hw : px, 3, fz ? pz : pz - hw, fz ? px + hw : px, 5, fz ? pz : pz + hw, C.ALTAR_D);
    if (fz === 1) B(px, 3, pz, px, 5, pz, C.SOUL, 1);
  }
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    const cx = ax + sx * (rM - 2), cz = az + sz * (rM - 2);
    if (i === 1) {   // snapped: a stump with a broken top, its gold cap and a candle lying on the plinth below
      B(cx - 2, 2, cz - 2, cx + 2, top - 2, cz + 2, C.ALTAR_D); B(cx - 2, top - 1, cz - 2, cx, top - 1, cz + 2, C.ALTAR_D);
      B(cx + 4, 2, cz - 6, cx + 8, 2, cz - 2, C.GOLD_D); B(cx + 5, 2, cz + 1, cx + 7, 2, cz + 1, C.WAX); return;
    }
    B(cx - 2, 2, cz - 2, cx + 2, top + 1, cz + 2, C.ALTAR_D);
    B(cx - 2, top + 2, cz - 2, cx + 2, top + 2, cz + 2, C.GOLD_D).box(cx - 1, top + 3, cz - 1, cx + 1, top + 3, cz + 1, C.GOLD_D);
    candles(cx, top + 4, cz, sx * 3 + sz, i === 2 ? 1 : 3);
  });
  for (let i = 0; i < 3; i++) {
    const sw = stepW, z0 = az + rM - 2 + i * 5, h = top - 1 - (i + 1) * 2;
    B(ax - sw, -2, z0, ax + sw, h, z0 + 4, C.STEP); B(ax - sw, h, z0 + 4, ax + (i === 1 ? -3 : sw), h, z0 + 4, C.GOLD);
    for (const s of [-1, 1]) { const a = s < 0 ? ax - stepW - 4 : ax + stepW + 1, b = s < 0 ? ax - stepW - 1 : ax + stepW + 4; B(a, -2, z0, b, h + 1, z0 + 4, C.ALTAR_D); B(a, h + 2, z0, b, h + 2, z0 + 4, C.STEP); }
  }
  B(ax + stepW + 1, 4, az + rM + 6, ax + stepW + 4, 4, az + rM + 12, null);   // a cheek block's coping knocked off

  // ---------------------------------------------------------------- the mausoleum at the back centre (the landmark), half fallen in
  {
    const Zf = M(-10.4), Zb = M(-14.8), cz0 = M(-14.3), cz1 = M(-11.9), ez1 = M(-10.9), zc = M(-11.3);
    // podium in two tiers, stairs down to the gate
    B(-50, -2, Zb, 50, 2, Zf, C.WALL_D); B(-46, 3, Zb + 4, 46, 6, Zf - 4, C.STEP);
    B(-46, 6, Zf - 4, 46, 6, Zf - 4, C.WALL_L);
    B(-16, -2, Zf - 4, 16, 3, Zf - 1, C.STEP); B(-16, -2, Zf, 16, 0, Zf + 3, C.STEP);
    B(-16, 3, Zf - 1, 16, 3, Zf - 1, C.WALL_L); B(-16, 0, Zf + 3, 16, 0, Zf + 3, C.WALL_L); B(6, 3, Zf - 1, 12, 3, Zf - 1, C.STEP);
    for (const s of [-1, 1]) B(s * 17, -2, Zf - 4, s * 19, 6, Zf + 3, C.WALL_D);
    // the cella: ashlar courses, a darker base course, corner pilasters, two right-angle cracks
    for (let y = 7; y <= 38; y++) B(-34, y, cz0, 34, y, cz1, y <= 8 ? C.WALL_D : Math.floor((y - 9) / 6) % 2 ? C.WALL : C.PILLAR_D);
    for (const s of [-1, 1]) B(s < 0 ? -36 : 33, 7, cz1 - 3, s < 0 ? -33 : 36, 38, cz1 + 1, C.PILLAR);
    B(-20, 28, cz1, -20, 36, cz1, C.DARK).box(-20, 28, cz1, -16, 28, cz1, C.DARK).box(-16, 19, cz1, -16, 28, cz1, C.DARK);
    B(22, 30, cz1, 22, 36, cz1, C.DARK).box(19, 30, cz1, 22, 30, cz1, C.DARK).box(19, 24, cz1, 19, 30, cz1, C.DARK);
    // crypt door: stepped arch; the left leaf still hangs, the right one is gone (it lies on the path below), the crypt black inside
    // with a little soul light at the back
    const dTop = 28;
    B(-10, 7, cz1 + 1, 10, dTop + 6, cz1 + 1, C.PILLAR); B(-3, dTop + 4, cz1 + 1, 3, dTop + 8, cz1 + 2, C.STEP);
    const open = (x: number, y: number) => Math.abs(x) <= 7 && y >= 7 && y <= dTop + 3 && !(y > dTop && Math.abs(x) > 5) && !(y > dTop + 2 && Math.abs(x) > 3);
    for (let x = -8; x <= 8; x++) for (let y = 7; y <= dTop + 4; y++) if (open(x, y)) B(x, y, cz1 - 3, x, y, cz1 + 1, null);
    B(-1, 6, cz1 - 14, 9, dTop + 4, cz1 - 4, C.DARK); B(1, 7, cz1 - 13, 7, dTop + 3, cz1 - 4, null);
    B(2, 7, cz1 - 13, 6, 7, cz1 - 11, C.SOUL, 1);
    B(-7, 7, cz1 - 4, 0, dTop + 3, cz1 - 4, C.DOOR);
    for (const y of [11, 18, 25]) B(-7, y, cz1 - 3, 0, y, cz1 - 3, C.IRON_L);
    B(0, 8, cz1 - 3, 0, dTop, cz1 - 3, C.SOUL, 1); B(-6, 7, cz1 - 3, -1, 7, cz1 - 3, C.SOUL, 1);
    w.set(-3, 17, cz1 - 2, C.RUST);
    B(-3, 0, -144, 18, 0, -138, C.DOOR); for (const x of [1, 8, 15]) B(x, 1, -144, x, 1, -138, C.RUST);
    // portico: three columns stand; the right outer one has snapped and its drum lies on the podium
    for (const cx of [-28, -12, 12, 28]) {
      B(cx - 3, 7, zc - 3, cx + 3, 8, zc + 3, C.WALL_L);
      if (cx === 28) { B(cx - 2, 9, zc - 2, cx + 2, 16, zc + 2, C.PILLAR); B(cx - 2, 17, zc - 2, cx, 19, zc + 2, C.PILLAR); continue; }
      B(cx - 2, 9, zc - 2, cx + 2, 33, zc + 2, C.PILLAR); B(cx - 1, 9, zc + 2, cx + 1, 33, zc + 2, C.STATUE_L);
      B(cx - 3, 34, zc - 3, cx + 3, 35, zc + 3, C.WALL_L); B(cx - 4, 36, zc - 4, cx + 4, 36, zc + 4, C.STEP);
    }
    B(20, 7, zc + 4, 33, 10, zc + 7, C.PILLAR); B(20, 7, zc + 7, 33, 7, zc + 7, C.PILLAR_D);
    // entablature and pediment roof, with the right corner fallen away in wide steps
    B(-36, 37, cz0 - 1, 36, 39, ez1, C.PILLAR); B(-35, 40, cz0, 35, 42, ez1 - 1, C.PILLAR_D);
    for (let x = -32; x <= 32; x += 8) B(x - 1, 40, ez1, x + 1, 42, ez1, C.PILLAR);
    B(-38, 43, cz0 - 3, 38, 44, ez1 + 1, C.STEP);
    for (let k = 0; k < 5; k++) {
      const hw = 37 - k * 7, y0 = 45 + k * 4;
      B(-hw, y0, cz0 - 3, hw, y0 + 3, ez1, C.ROOF); B(-hw, y0 + 3, cz0 - 3, hw, y0 + 3, cz0 - 3 + 1, C.ROOF_L);
      B(-hw, y0, ez1, hw, y0 + 3, ez1, C.PILLAR); B(-hw, y0 + 3, ez1, hw, y0 + 3, ez1, C.STEP);
    }
    B(30, 37, cz0 - 4, 40, 44, ez1 + 2, null); B(22, 45, cz0 - 4, 40, 52, ez1 + 2, null); B(14, 53, cz0 - 4, 40, 56, ez1 + 2, null);
    B(36, 7, Zf - 10, 44, 9, Zf - 5, C.STEP); B(40, 3, Zf - 3, 47, 4, Zf - 1, C.PILLAR); B(52, -1, Zf - 2, 58, 1, Zf + 3, C.ROOF);
    // the tympanum emblem: a soul gem in a tarnished frame; finials (the right one went with the corner); ivy down the cella
    B(-4, 47, ez1 + 1, 4, 55, ez1 + 1, C.GOLD_D); B(-2, 49, ez1 + 1, 2, 53, ez1 + 2, C.SOUL, 1);
    B(-2, 65, ez1 - 4, 2, 66, ez1, C.STEP); B(-1, 67, ez1 - 3, 1, 68, ez1 - 1, C.PILLAR); w.set(0, 69, ez1 - 2, C.STEP);
    B(-38, 45, ez1 - 2, -36, 47, ez1, C.STEP); w.set(-37, 48, ez1 - 1, C.PILLAR);
    crow(0, 70, ez1 - 2, 1); crow(-37, 49, ez1 - 1, 0);
    for (const [x, len] of [[-32, 16], [-31, 22], [-24, 10], [-23, 14], [24, 12], [25, 18]] as const) for (let y = 36; y > 36 - len; y--) w.set(x, y, cz1 + 1, (36 - y) % 3 === 2 ? C.IVY_L : C.IVY);
    for (const [z, len] of [[cz1 - 6, 18], [cz1 - 5, 24], [cz1 - 14, 12]] as const) for (let y = 38; y > 38 - len; y--) w.set(-35, y, z, (38 - y) % 3 === 2 ? C.IVY_L : C.IVY);
    // soul braziers at the stair foot: the left one tipped over, its embers spilled on the path; the right one barely alight
    B(-28, 3, Zf - 4, -24, 6, Zf - 1, C.IRON); B(-27, 4, Zf, -25, 6, Zf, C.IRON_L); B(-27, 0, Zf + 1, -23, 0, Zf + 3, C.SOUL, 1); B(-29, 0, Zf + 4, -26, 0, Zf + 5, C.DIRT_D);
    { const bx = 26, bz = Zf - 2; B(bx - 2, 3, bz - 2, bx + 2, 6, bz + 2, C.IRON); B(bx - 3, 7, bz - 3, bx + 3, 8, bz + 3, C.RUST); B(bx - 2, 8, bz - 2, bx + 2, 8, bz + 2, C.DIRT_D); w.set(bx, 9, bz, C.SOUL, 1); }
  }

  // ---------------------------------------------------------------- iron fence with spear finials on a stone sill, stone piers, a wide
  // gate guarded by two hooded keeper statues. On the left a panel has fallen flat on the ground; on the right a run is bent forward
  // (its upper half one cell out) and a stretch has lost its finials; rust on the rails and on every third finial.
  {
    const fz = M(-9.6), x0 = M(3.6), x1 = M(9.6);
    for (const s of [-1, 1]) {
      const a = s < 0 ? -x1 : x0, b = s < 0 ? -x0 : x1;
      const gone = (x: number) => s < 0 && x >= -112 && x <= -96, bent = (x: number) => s > 0 && x >= 100 && x <= 124, snapped = (x: number) => s > 0 && x >= 66 && x <= 82;
      for (let x = a; x <= b; x++) {
        const sill = gone(x) ? 0 : 2; B(x, -2, fz - 1, x, sill, fz + 1, C.WALL_D); if (!gone(x)) B(x, 3, fz - 2, x, 3, fz + 2, C.WALL_L);
        if (gone(x)) continue;
        const dz = bent(x) ? 1 : 0, rust = Math.floor((x + 400) / 4) % 3 === 0;
        if ((x + 400) % 4 === 0) {
          if (snapped(x)) { B(x, 4, fz, x, 10 + ((x / 4) & 3) * 2, fz, C.IRON); continue; }
          B(x, 4, fz, x, 13, fz, C.IRON); B(x, 14, fz + dz, x, 22, fz + dz, C.IRON);
          B(x - 1, 23, fz + dz, x + 1, 23, fz + dz, rust ? C.RUST_L : C.IRON_L); B(x, 24, fz + dz, x, 25, fz + dz, rust ? C.RUST_L : C.IRON_L);
        }
        w.set(x, 7, fz, C.RUST); if (!snapped(x)) w.set(x, 19, fz + dz, (x & 7) < 3 ? C.RUST : C.IRON);
      }
      for (const px of [s < 0 ? a : b, Math.round((a + b) / 2)]) {
        const broken = s < 0 && px !== a;
        B(px - 3, -2, fz - 3, px + 3, broken ? 18 : 24, fz + 3, C.WALL);
        if (broken) { B(px - 3, 19, fz - 3, px, 21, fz + 3, C.WALL); B(px + 5, -1, fz + 4, px + 9, 1, fz + 8, C.WALL_L); continue; }
        B(px - 4, 25, fz - 4, px + 4, 26, fz + 4, C.WALL_L); B(px - 2, 27, fz - 2, px + 2, 27, fz + 2, C.STEP); B(px - 1, 28, fz - 1, px + 1, 29, fz + 1, C.WALL_L);
        if (s > 0 && px === b) crow(px, 30, fz, 3);
      }
    }
    // the fallen panel, lying flat in front of its gap: bars along z, two rails across, all rusted
    for (let x = -112; x <= -96; x += 4) B(x, 0, fz + 3, x, 0, fz + 21, C.RUST);
    B(-113, 0, fz + 7, -95, 0, fz + 7, C.RUST_L); B(-113, 0, fz + 18, -95, 0, fz + 18, C.RUST_L);
    // gate piers carrying the statues
    for (const s of [-1, 1]) {
      const px = s * M(3.0);
      B(px - 6, -2, fz - 6, px + 6, 1, fz + 6, C.WALL_D); B(px - 5, 2, fz - 5, px + 5, 11, fz + 5, C.WALL); B(px - 6, 12, fz - 6, px + 6, 13, fz + 6, C.WALL_L);
      B(px - 5, 6, fz + 6, px + 5, 6, fz + 6, C.WALL_D);
      keeper(px, 14, fz, s > 0);
    }
  }
  // a hooded grave-keeper: a robe flaring in three tiers with folds, a mantle wider than the chest hanging down the back, sleeves
  // meeting at hands folded on the pommel of a sword planted point-down, a deep hood with a shadowed face and a stepped peak.
  // The damaged one has lost its hood's peak and the lower blade (both pieces lie on the pier top).
  function keeper(x: number, y: number, z: number, damaged: boolean) {
    B(x - 6, y, z - 5, x + 6, y + 5, z + 4, C.STATUE); for (const fx of [-4, -2, 2, 4]) B(x + fx, y, z + 4, x + fx, y + 4, z + 4, C.STATUE_D);
    B(x - 5, y + 6, z - 4, x + 5, y + 13, z + 3, C.STATUE); B(x - 4, y + 14, z - 3, x + 4, y + 19, z + 3, C.STATUE);
    B(x - 5, y + 8, z - 5, x + 5, y + 19, z - 4, C.STATUE_D); B(x - 6, y + 20, z - 5, x + 6, y + 22, z + 3, C.STATUE_D);
    for (const s2 of [-1, 1]) B(x + s2 * 2, y + 15, z + 3, x + s2 * 4, y + 20, z + 4, C.STATUE);
    if (!damaged) { B(x, y, z + 5, x, y, z + 5, C.STATUE_L); B(x - 1, y + 1, z + 5, x + 1, y + 10, z + 5, C.STATUE_L); }
    else { B(x - 1, y + 7, z + 5, x + 1, y + 10, z + 5, C.STATUE_L); B(x - 1, y + 6, z + 5, x, y + 6, z + 5, C.STATUE_L); B(x + 2, y, z + 6, x + 6, y, z + 6, C.STATUE_L); }
    B(x - 3, y + 11, z + 4, x + 3, y + 12, z + 6, C.STATUE_D);
    B(x - 2, y + 13, z + 4, x + 2, y + 16, z + 6, C.STATUE); B(x - 1, y + 17, z + 5, x + 1, y + 17, z + 6, C.STATUE_D);
    B(x - 3, y + 23, z - 3, x + 3, y + 23, z + 2, C.STATUE_D);
    B(x - 4, y + 23, z - 4, x + 4, y + 30, z + 3, C.STATUE); B(x - 3, y + 31, z - 4, x + 3, y + 32, z + 2, C.STATUE);
    if (!damaged) B(x - 1, y + 33, z - 3, x + 1, y + 34, z, C.STATUE); else { B(x, y + 31, z - 4, x + 3, y + 32, z - 1, null); B(x - 6, y, z + 5, x - 4, y + 1, z + 6, C.STATUE); }
    B(x - 2, y + 24, z + 1, x + 2, y + 28, z + 3, null); B(x - 2, y + 24, z, x + 2, y + 28, z, C.DARK);
    B(x - 3, y + 29, z + 3, x + 3, y + 29, z + 3, C.STATUE_L); for (const s2 of [-3, 3]) B(x + s2, y + 23, z + 3, x + s2, y + 28, z + 3, C.STATUE_L);
    B(x - 6, y + 22, z - 5, x - 3, y + 22, z, C.MOSS_D); B(x - 3, y + 32, z - 4, x - 1, y + 32, z - 1, C.MOSS_D);
    if (!damaged) crow(x, y + 35, z - 1, 1);
  }

  // ---------------------------------------------------------------- broken walls down both sides: plinth, coursed body, coping; tops
  // stepping down in wide steps toward the breaks, fallen coping blocks on the ground, ivy hanging down the inner faces
  for (const side of [-1, 1]) {
    const segs: Array<[number, number, number, number]> = [[-7.6, -5.8, 1.0, 1], [-5.0, -3.6, 0.5, -1], [-2.2, -0.2, 0.9, 1], [1.0, 2.2, 0.4, -1], [3.4, 5.0, 0.75, 1]];
    const xc = side * M(6.95);
    segs.forEach(([za, zb, h, brk], i) => {
      const A = M(za), Bz = M(zb), H = M(h), n = Bz - A;
      B(xc - 4, -2, A - 1, xc + 4, 1, Bz + 1, C.WALL_D);
      for (let k = 0; k <= n; k++) {
        const t = brk > 0 ? k : n - k, hh = t > n * 0.7 ? Math.round(H * 0.35) : t > n * 0.45 ? Math.round(H * 0.7) : H, z = A + k;
        for (let y = 2; y <= hh; y++) B(xc - 3, y, z, xc + 3, y, z, Math.floor((y - 2) / 5) % 2 ? C.WALL : C.PILLAR_D);
        if (hh === H) B(xc - 4, H + 1, z, xc + 4, H + 2, z, C.WALL_L);
        if (hh === H && (k % 9 === 2 || k % 9 === 3)) for (let y = H; y > H - 5 - (k % 4) * 2 && y > 1; y--) w.set(xc - side * 4, y, z, (H - y) % 3 === 2 ? C.IVY_L : C.IVY);
      }
      const fzc = brk > 0 ? Bz + 4 : A - 4, fx = xc - side * 7;
      B(fx - 4, -1, fzc - 2, fx + 4, 1, fzc + 2, C.WALL_L); B(fx - 2, 2, fzc - 1, fx + 3, 3, fzc + 2, C.WALL);
      if (i % 2) B(xc + side * 6, -1, fzc - 3, xc + side * 10, 2, fzc + 1, C.PILLAR_D);
    });
  }

  // ---------------------------------------------------------------- grave plots, untended: headstone on a plinth, a kerbed mound or ledger.
  // Each stone either stands, leans (its upper part one or two cells out of line), has snapped (a stump; the slab lies across the
  // grave in two pieces), or the grave has been dug open (a black pit, the earth heaped beside it, the coffin lid thrown on the heap).
  let gi = 0;
  const plot = (gx: number, gz: number, s: number) => {
    const kind = Math.floor(hash(gi, 9) * 6), x0 = M(gx), z0 = M(gz), stone = C.GRAVE[gi % 3], sd = gi++;
    const H = Math.round(16 * s), Wd = Math.round(5 * s), L = Math.round(14 * s), st = hash(sd, 11);
    const fate = st < 0.16 ? 'fallen' : st < 0.32 ? 'dug' : st < 0.78 ? 'lean' : 'up';
    const lean = hash(sd, 12) < 0.5 ? [0, -1] : [hash(sd, 13) < 0.5 ? -1 : 1, 0], ys = Math.round(H * 0.4), ys2 = Math.round(H * 0.75);
    const cut = fate === 'fallen' ? 4 : 999;
    // the stone's pieces go through S: leaning shifts what lies above ys by one cell and above ys2 by two; a snapped stone keeps its stump
    const S = (x0b: number, y0: number, z0b: number, x1b: number, y1: number, z1b: number, c: number) => {
      for (let y = y0; y <= Math.min(y1, cut); y++) { const k = fate === 'lean' ? (y >= ys2 ? 2 : y >= ys ? 1 : 0) : 0; B(x0b + lean[0] * k, y, z0b + lean[1] * k, x1b + lean[0] * k, y, z1b + lean[1] * k, c); }
    };
    B(x0 - Wd - 2, -2, z0 - 3, x0 + Wd + 2, 0, z0 + 2, C.WALL_D);
    B(x0 - Wd - 1, -1, z0 + 3, x0 - Wd - 1, 0, z0 + 3 + L, C.WALL_D); B(x0 + Wd + 1, -1, z0 + 3, x0 + Wd + 1, 0, z0 + 3 + L, C.WALL_D); B(x0 - Wd - 1, -1, z0 + 4 + L, x0 + Wd + 1, 0, z0 + 4 + L, C.WALL_D);
    if (kind === 0) {   // round-topped slab (two inset steps) with an engraved cross
      S(x0 - Wd, 1, z0 - 1, x0 + Wd, H - 4, z0 + 1, stone); S(x0 - Wd + 2, H - 3, z0 - 1, x0 + Wd - 2, H - 2, z0 + 1, stone); S(x0 - Wd + 4, H - 1, z0 - 1, x0 + Wd - 4, H, z0 + 1, stone);
      S(x0, Math.round(H * 0.3), z0 + 2, x0, H - 5, z0 + 2, C.ENGRAVE); S(x0 - 2, H - 8, z0 + 2, x0 + 2, H - 8, z0 + 2, C.ENGRAVE);
    } else if (kind === 1) {   // a cross on a stepped base
      S(x0 - 3, 1, z0 - 2, x0 + 3, 3, z0 + 2, stone); S(x0 - 1, 4, z0 - 1, x0 + 1, H + 3, z0 + 1, stone);
      const ay = Math.round((H + 3) * 0.68); S(x0 - Wd - 1, ay, z0 - 1, x0 + Wd + 1, ay + 2, z0 + 1, stone);
    } else if (kind === 2) {   // an obelisk in four steps
      const t = Math.round(H / 4); S(x0 - Wd, 1, z0 - Wd + 2, x0 + Wd, t, z0 + 2, stone); S(x0 - Wd + 1, t + 1, z0 - Wd + 3, x0 + Wd - 1, t + 2, z0 + 1, C.ENGRAVE);
      S(x0 - 2, t + 3, z0 - 3, x0 + 2, H + 2, z0 + 1, stone); S(x0 - 1, H + 3, z0 - 2, x0 + 1, H + 5, z0, stone);
    } else if (kind === 3) {   // a double family stone with two stepped crowns
      S(x0 - Wd - 3, 1, z0 - 1, x0 + Wd + 3, H - 5, z0 + 1, stone);
      for (const s2 of [-1, 1]) { S(x0 + s2 * 4 - 3, H - 4, z0 - 1, x0 + s2 * 4 + 3, H - 2, z0 + 1, stone); S(x0 + s2 * 4 - 1, H - 1, z0 - 1, x0 + s2 * 4 + 1, H - 1, z0 + 1, stone); }
      S(x0, 2, z0 + 2, x0, H - 6, z0 + 2, C.ENGRAVE);
    } else if (kind === 4) {   // an urn on a pedestal
      S(x0 - 3, 1, z0 - 3, x0 + 3, 2, z0 + 3, stone); S(x0 - 2, 3, z0 - 2, x0 + 2, 9, z0 + 2, stone); S(x0 - 3, 10, z0 - 3, x0 + 3, 10, z0 + 3, stone);
      S(x0 - 2, 11, z0 - 2, x0 + 2, 14, z0 + 2, C.STATUE); S(x0 - 1, 15, z0 - 1, x0 + 1, 15, z0 + 1, C.STATUE); S(x0 - 2, 16, z0 - 2, x0 + 2, 16, z0 + 2, C.STATUE_L);
    } else {   // a low slab
      S(x0 - Wd, 1, z0 - 1, x0 + Wd, Math.round(H * 0.6), z0 + 1, stone); S(x0 - Wd + 2, Math.round(H * 0.6) + 1, z0 - 1, x0 + Wd - 2, Math.round(H * 0.6) + 1, z0 + 1, stone);
    }
    if (fate === 'fallen' && (kind === 0 || kind === 3 || kind === 5)) B(x0 - Wd, cut + 1, z0 - 1, x0, cut + 1, z0 + 1, stone);
    // the grave itself
    if (fate === 'dug') {
      B(x0 - Wd, -1, z0 + 4, x0 + Wd, -1, z0 + 2 + L, null);
      B(x0 - Wd - 1, -4, z0 + 3, x0 + Wd + 1, -2, z0 + 3 + L, C.DIRT); B(x0 - Wd, -2, z0 + 4, x0 + Wd, -2, z0 + 2 + L, null); B(x0 - Wd, -3, z0 + 4, x0 + Wd, -3, z0 + 2 + L, null);
      B(x0 - Wd, -4, z0 + 4, x0 + Wd, -4, z0 + 2 + L, C.DIRT_D);
      B(x0 - 1, -3, z0 + 8, x0 + 1, -2, z0 + 10, C.BONE); w.set(x0, -2, z0 + 10, C.DARK);
      const hx = x0 + (x0 > 0 ? 1 : -1) * (Wd + 5);
      B(hx - 2, -1, z0 + 4, hx + 2, 1, z0 + L, C.DIRT); B(hx - 1, 2, z0 + 6, hx + 1, 2, z0 + L - 2, C.DIRT);
      B(hx - 3, 3, z0 + 5, hx + 3, 3, z0 + L - 3, C.WOOD_D); B(hx - 3, 4, z0 + 5, hx - 3, 4, z0 + L - 3, C.WOOD_D);
    } else if (hash(sd, 4) < 0.5) { B(x0 - Wd, -1, z0 + 3, x0 + Wd, 0, z0 + 3 + L, C.DIRT); B(x0 - Wd + 1, 1, z0 + 5, x0 + Wd - 1, 1, z0 + 1 + L, hash(sd, 5) < 0.5 ? C.MOSS_D : C.DIRT); }
    else { B(x0 - Wd, -1, z0 + 3, x0 + Wd, 0, z0 + 3 + L, C.WALL_D); B(x0 - Wd + 1, 1, z0 + 4, x0 + Wd - 1, 1, z0 + 2 + L, stone); B(x0, 2, z0 + 6, x0, 2, z0 + L - 1, C.ENGRAVE); B(x0 - 2, 2, z0 + 8, x0 + 2, 2, z0 + 8, C.ENGRAVE); }
    if (fate === 'fallen') {   // the snapped slab lies across the grave in two pieces, the second knocked a cell sideways
      const len = Math.max(6, H - 6), mid = z0 + 4 + (len >> 1);
      B(x0 - Wd, 2, z0 + 4, x0 + Wd, 3, mid - 1, stone); B(x0 - Wd + 1, 2, mid + 1, x0 + Wd + 1, 3, z0 + 4 + len, stone);
      B(x0 - Wd + 1, 4, mid + 1, x0 + 1, 4, z0 + 4 + len - 2, C.MOSS_D);
    }
    const deco = hash(sd, 6);
    if (fate !== 'dug' && deco < 0.3) deadFlowers(x0 + (hash(sd, 7) < 0.5 ? -Wd + 1 : Wd - 1), z0 + 4 + L - 2 + 3, sd);
    else if (fate === 'up' && deco < 0.55) candles(x0 + Wd - 1, 0, z0 + 3, sd, 1);
    if (fate === 'up' && kind === 1 && hash(sd, 14) < 0.7) crow(x0, H + 4, z0, 1 + (sd & 2));
  };
  for (let row = 0; row < 4; row++) for (let k = 0; k < 3; k++) for (const side of [-1, 1]) plot(side * (7.9 + k * 1.6), -7.4 + row * 3.25, 0.85 + hash(row, k, 3) * 0.3);
  for (const [x, z] of [[-5.6, -11.6], [-7.2, -12.2], [-8.8, -11.4], [5.6, -11.8], [7.2, -11.2], [8.8, -12.4], [-6.4, -14.2], [6.6, -14.0], [-9.6, -14.6], [9.4, -14.4]]) plot(x, z, 1.15);

  // ---------------------------------------------------------------- dead trees: root flare, trunk in three widths, limbs that go out then
  // up with a short twig across; crows on some of the limb ends
  [[-10.6, -10.4, 7.0, 1], [10.8, -10.0, 7.6, 2], [-10.4, 5.8, 5.6, 3], [10.6, 5.6, 6.0, 4], [-12.4, -5.6, 6.4, 5], [12.6, -3.8, 6.8, 6]].forEach(([tx, tz, h, s], ti) => {
    const x = M(tx), z = M(tz), trunk = M(h * 0.5), t3 = Math.round(trunk / 3);
    B(x - 5, -2, z - 5, x + 5, 2, z + 5, C.BARK_D);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) B(dx > 0 ? x + 5 : dx < 0 ? x - 10 : x - 1, -2, dz > 0 ? z + 5 : dz < 0 ? z - 10 : z - 1, dx > 0 ? x + 10 : dx < 0 ? x - 5 : x + 1, 0, dz > 0 ? z + 10 : dz < 0 ? z - 5 : z + 1, C.BARK_D);
    B(x - 3, 3, z - 3, x + 3, t3, z + 3, C.BARK); B(x - 2, t3 + 1, z - 2, x + 2, 2 * t3, z + 2, C.BARK); B(x - 1, 2 * t3 + 1, z - 1, x + 1, trunk + M(h * 0.15), z + 1, C.BARK);
    const arms: Array<[number, number, number, number]> = [[1, 0, trunk - 4, 1], [-1, 0, trunk - 10, 0], [0, 1, trunk + 2, 1], [0, -1, trunk - 6, 0]];
    arms.forEach(([ddx, ddz, y, up], ai) => {
      const len = M(h * (0.15 + hash(s, y) * 0.08)), rise = M(h * (0.1 + up * 0.08)), ex = x + ddx * len, ez = z + ddz * len;
      B(Math.min(x, ex), y, Math.min(z, ez), Math.max(x, ex), y + 1, Math.max(z, ez), C.BARK); B(ex, y, ez, ex + (ddz ? 1 : 0), y + rise, ez + (ddx ? 1 : 0), C.BARK_D);
      const tw = Math.round(len * 0.5); B(Math.min(ex, ex + ddz * tw), y + rise, Math.min(ez, ez - ddx * tw), Math.max(ex, ex + ddz * tw), y + rise, Math.max(ez, ez - ddx * tw), C.BARK_D);
      if ((ti * 4 + ai) % 7 === 0) crow(ex, y + rise + 1, ez, ai + ti);
    });
  });

  // ---------------------------------------------------------------- soul-fire lantern posts: stepped stone foot, iron post with a rusted
  // collar, a caged lantern under a stepped iron roof (one roof knocked askew); the cold flames stay where the battle expects them
  const flames: THREE.Vector3[] = [];
  o.lanterns.forEach((p, li) => {
    const x = M(p.x), z = M(p.z), hTop = M(2.1), sk = li === 1 ? 1 : 0;
    B(x - 4, -2, z - 4, x + 4, 1, z + 4, C.WALL_D); B(x - 3, 2, z - 3, x + 3, 3, z + 3, C.WALL); B(x - 2, 4, z - 2, x + 2, 4, z + 2, C.WALL_L);
    B(x - 1, 5, z - 1, x + 1, hTop, z + 1, C.IRON); B(x - 2, 14, z - 2, x + 2, 15, z + 2, C.RUST);
    B(x - 3, hTop + 1, z - 3, x + 3, hTop + 1, z + 3, C.IRON_L);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) B(x + dx, hTop + 2, z + dz, x + dx, hTop + 6, z + dz, C.IRON);
    B(x - 3 + sk, hTop + 7, z - 3, x + 3 + sk, hTop + 7, z + 3, C.IRON); B(x - 2 + sk * 2, hTop + 8, z - 2, x + 2 + sk * 2, hTop + 8, z + 2, C.RUST_L); B(x - 1 + sk * 2, hTop + 9, z - 1, x + 1 + sk * 2, hTop + 9, z + 1, C.IRON); w.set(x + sk * 2, hTop + 10, z, C.IRON_L);
    B(x - 1, hTop + 2, z - 1, x + 1, hTop + 4, z + 1, C.SOUL, 1);
    flames.push(new THREE.Vector3((x + 0.5) * CELL, (hTop + 4) * CELL, (z + 0.5) * CELL));
  });
  return { meshes: w.build({ glow: 2.6 }), flames, altarTop: top * CELL, world: w };
}
