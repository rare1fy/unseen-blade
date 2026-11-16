// 忍里的道具库（village 代理）：茅草顶（厚檐、几层大台阶、两端山墙带烟窗）、民家、训练场的木人桩 / 卷藁 / 苦无靶 / 跳桩、炊烟。
// 铁律：横平竖直的大块体，斜面一律几层宽台阶（每层 ≥ 5 格），花纹是结构（板缝、框、带），没有逐格随机色。
// 所有部件在「本地框」里搭（k_village.loc：本地 x 横向，本地 z 朝正面，r = 转几个 90°），所以同一个部件能朝镜头也能朝战斗区。
import * as THREE from 'three';
import { M, type W } from '../../scenes/props';
import type { Ctx } from '../../scenes/stage';
import { loc, locM, type Bx, type P3 } from '../../scenes/k_village';
import { onUpdate, scene } from '../../engine/world';
import { PALPHA, TILE } from '../../engine/particles';

/** 忍里调色：茅草金褐、旧木、泥土、水绿。每种材料两三档（本体 / 暗缝 / 亮边） */
export const VC = {
  th: 0x9a7c48, thD: 0x5a4628, thM: 0x7c623a, thL: 0xb49658,
  ridge: 0x3a2e24, ridgeL: 0x524232,
  wood: 0x6a4e36, woodD: 0x45321f, woodL: 0x8a6a4a, post: 0x33251a, grey: 0x7e7262, greyD: 0x625848,
  mud: 0xa88c66, mudD: 0x8c7454, mudL: 0xbca07a,
  paper: 0xd4c8aa, paperG: 0xc08848, dark: 0x1e1712, ember: 0xe0702a, emberL: 0xffb060,
  stone: 0x7c786e, stoneD: 0x5e5a52, stoneL: 0x96928a,
  earth: 0x6a5c44, earthD: 0x584c38, earthL: 0x7a6a4e, soil: 0x4e3c2c, soilL: 0x5e4a36,
  path: 0x86744f, pathD: 0x5a4c36, kerb: 0x5e5040,
  straw: 0xc8ac64, strawD: 0x9c844a, rope: 0x8c7852,
  indigo: 0x2c3a5c, indigoL: 0x42568a, kaki: 0xc8662a, kakiD: 0x9a4a20, white: 0xdcd4c0, red: 0xa83426, black: 0x24201e,
  iron: 0x34323a, ironL: 0x5a5862, logEnd: 0xb89a6a, logEndD: 0x8a6e48, bark: 0x4a382a,
  leaf: 0x4e7a34, leafL: 0x6e9a44, water: 0x2c5650,
};
/** the local frame of a piece at world (x, z) metres, front turned by r quarter turns (0 = +z, 1 = +x, 3 = −x) */
export const frame = (w: W, x: number, z: number, r = 0) => loc(w, M(x), M(z), r);
/** a group in a wing faces the battle floor; a group at the back faces the camera */
export const faceOf = (s: number) => (s > 0 ? 3 : s < 0 ? 1 : 0);
const ring = (B: Bx, a: number, c: number, b: number, e: number, y: number, col: number) => { B(a, y, c, b, y, c, col); B(a, y, e, b, y, e, col); B(a, y, c, a, y, e, col); B(b, y, c, b, y, e, col); };

// ------------------------------------------------------------------ thatch
/**
 * A thick thatched roof over local [x0..x1]×[z0..z1] from y: tiers from the eave up as [inset, height]; the lowest `hip` tiers step in on
 * all four sides, the rest only front and back, so the ±x ends rise as flat gables of dark boards with a smoke-vent lattice (irimoya).
 * Each tier: a dark cut edge at its foot, a lit top row. The eave tier is thick with a two-tone clipped edge. Dark bark ridge cap with
 * crosspieces on top. Tiers are filled as rings (the part the next tier covers stays hollow). Returns the ridge top y and the gable x.
 */
export function thatch(B: Bx, x0: number, x1: number, z0: number, z1: number, y: number, tiers: Array<[number, number]>, hip: number, o: { vent?: boolean } = {}) {
  let ix = 0, iz = 0, ya = y, gy0 = -1;
  const rect = (i: number) => { let jx = ix, jz = iz; const d = tiers[i]?.[0] ?? 0; if (i < hip) { jx += d; jz += d; } else jz += d; return [jx, jz]; };
  for (let i = 0; i < tiers.length; i++) {
    const [d, th] = tiers[i];
    if (i > 0) { if (i < hip) { ix += d; iz += d; } else iz += d; }
    const a = x0 + ix, b = x1 - ix, c = z0 + iz, e = z1 - iz; if (a > b || c + 3 > e) break;
    const last = i === tiers.length - 1 || (z0 + rect(i + 1)[1]) + 3 > z1 - rect(i + 1)[1];
    if (last) B(a, ya, c, b, ya + th - 1, e, VC.th);
    else { const [nx, nz] = rect(i + 1), kx = nx - ix + 2, kz = nz - iz + 2; B(a, ya, c, b, ya + th - 1, c + kz, VC.th); B(a, ya, e - kz, b, ya + th - 1, e, VC.th); B(a, ya, c, a + kx, ya + th - 1, e, VC.th); B(b - kx, ya, c, b, ya + th - 1, e, VC.th); }
    ring(B, a, c, b, e, ya + th - 1, VC.thL);
    if (!last) { const [nx, nz] = rect(i + 1), kx = nx - ix + 1, kz = nz - iz + 1; B(a, ya + th - 1, c, b, ya + th - 1, c + kz, VC.thL); B(a, ya + th - 1, e - kz, b, ya + th - 1, e, VC.thL); B(a, ya + th - 1, c, a + kx, ya + th - 1, e, VC.thL); B(b - kx, ya + th - 1, c, b, ya + th - 1, e, VC.thL); }
    else B(a, ya + th - 1, c, b, ya + th - 1, e, VC.thL);
    ring(B, a, c, b, e, ya, i === 0 ? VC.thD : VC.thM);
    if (i === 0) ring(B, a, c, b, e, ya + 1, VC.thM);
    if (i >= hip) { if (gy0 < 0) gy0 = ya; for (const gx of [a, b]) B(gx, ya, c + 1, gx, ya + th - 1, e - 1, VC.woodD); }
    ya += th;
  }
  const a = x0 + ix, b = x1 - ix, cz = Math.round((z0 + z1) / 2);
  // the smoke vent on each gable: a dark opening with light bars standing one cell proud
  if (o.vent !== false && gy0 >= 0 && ya - gy0 >= 12) for (const [gx, out] of [[a, -1], [b, 1]] as const) {
    const vy0 = gy0 + 2, vy1 = Math.min(ya - 4, gy0 + 9);
    B(gx, vy0, cz - 5, gx, vy1, cz + 5, VC.dark);
    for (let zz = cz - 5; zz <= cz + 5; zz += 5) B(gx + out, vy0 - 1, zz, gx + out, vy1 + 1, zz, VC.woodL);
    B(gx + out, vy0 - 1, cz - 5, gx + out, vy0 - 1, cz + 5, VC.woodL);
  }
  // the ridge: a dark bark cap, crosspieces sitting on it, raised ends
  B(a - 2, ya, cz - 3, b + 2, ya + 2, cz + 3, VC.ridge); B(a - 2, ya + 3, cz - 2, b + 2, ya + 3, cz + 2, VC.ridgeL);
  for (let x = a + 4; x <= b - 5; x += 11) B(x, ya + 3, cz - 5, x + 1, ya + 5, cz + 5, VC.ridge);
  for (const ex of [a - 4, b + 2]) B(ex, ya - 1, cz - 4, ex + 2, ya + 6, cz + 4, VC.ridge);
  return { top: ya + 6, gx: [a, b] as [number, number] };
}

// ------------------------------------------------------------------ the farmhouse
export interface MinkaOpt {
  hw: number; hd: number; H: number; ev: number; tiers: Array<[number, number]>; hip: number;
  /** front bays left to right: w = wall, s = shoji, d = the doorway into the earthen-floored doma (one 'd' at most) */
  bays: string; lit: boolean; veranda?: boolean; noren?: number;
}
/**
 * 民家：a low stone footing, hollow walls (dark boards below, earthen plaster above, two dark rails), proud dark posts at every bay,
 * shoji panes in a lattice, a doorway into the dark doma with a hearth glow and a split noren, a veranda, and the thick thatch roof.
 * Local frame centred on (x, z), front toward local +z. Returns light / smoke points in world metres.
 */
export function minka(c: Ctx, x: number, z: number, r: number, o: MinkaOpt) {
  const w = c.w, X = M(x), Z = M(z), B = loc(w, X, Z, r), { hw, hd, H } = o;
  B(-hw, -1, -hd, hw, 0, hd, VC.stoneD); B(-hw, 1, -hd, hw, 1, hd, VC.stone);
  const walls = (y0: number, y1: number, col: number) => {
    B(-hw + 1, y0, hd - 3, hw - 1, y1, hd - 1, col); B(-hw + 1, y0, -hd + 1, hw - 1, y1, -hd + 3, col);
    B(-hw + 1, y0, -hd + 1, -hw + 3, y1, hd - 1, col); B(hw - 3, y0, -hd + 1, hw - 1, y1, hd - 1, col);
  };
  walls(2, 10, VC.wood); walls(11, 11, VC.woodD); walls(12, H, VC.mud); walls(H - 7, H - 7, VC.woodD);
  B(-hw + 1, H, -hd + 1, hw - 1, H, hd - 1, VC.woodD);
  const n = o.bays.length, xs = Array.from({ length: n + 1 }, (_, k) => Math.round(-hw + (2 * hw * k) / n));
  let door = 0;
  for (let k = 0; k < n; k++) {
    const xa = xs[k] + 2, xb = xs[k + 1] - 2, t = o.bays[k];
    if (t === 's') {
      B(xa, 6, hd - 1, xb, H - 9, hd - 1, null);
      B(xa, 6, hd - 2, xb, H - 9, hd - 2, o.lit ? VC.paperG : VC.paper, o.lit ? 1 : 0);
      B(xa, 5, hd - 1, xb, 5, hd - 1, VC.woodD); B(xa, H - 8, hd - 1, xb, H - 8, hd - 1, VC.woodD);
      for (let u = xa; u <= xb; u += 5) B(u, 6, hd - 1, u, H - 9, hd - 1, VC.woodD);
      B(xb, 6, hd - 1, xb, H - 9, hd - 1, VC.woodD);
      for (let y = 6 + 7; y < H - 9; y += 7) B(xa, y, hd - 1, xb, y, hd - 1, VC.woodD);
    } else if (t === 'd') {
      door = (xa + xb) >> 1;
      B(xa, 2, hd - 3, xb, H - 9, hd - 1, null);
      B(xa, 1, hd - 7, xb, 1, hd - 1, VC.earthD);
      B(xa - 1, 2, hd - 7, xb + 1, H - 9, hd - 7, VC.dark); B(xa - 1, 2, hd - 6, xa - 1, H - 9, hd - 4, VC.dark); B(xb + 1, 2, hd - 6, xb + 1, H - 9, hd - 4, VC.dark);
      B(xa - 1, H - 8, hd - 7, xb + 1, H - 8, hd - 4, VC.dark);
      if (o.lit) B(door - 3, 2, hd - 6, door + 3, 3, hd - 6, VC.ember, 1); else B(door - 3, 2, hd - 6, door + 3, 2, hd - 6, VC.black);
      if (o.lit) B(door - 1, 4, hd - 6, door + 1, 5, hd - 6, VC.emberL, 1);
      B(xa - 1, H - 8, hd - 1, xb + 1, H - 8, hd - 1, VC.woodD);
      // the noren: three panels under the lintel, a gap between them
      const nc = o.noren ?? VC.indigo, w3 = Math.floor((xb - xa + 1) / 3);
      for (let j = 0; j < 3; j++) B(xa + j * w3, H - 15, hd, xa + j * w3 + w3 - 2, H - 8, hd, nc);
      B(xa, H - 8, hd, xb, H - 8, hd, VC.woodD);
    }
  }
  // posts: front and back at every bay line, side posts at the middle
  for (const px of xs) {
    const a = Math.max(-hw, px - 1), b = Math.min(hw, px + 1);
    B(a, 2, hd - 2, b, H, hd, VC.post); B(a, 2, -hd, b, H, -hd + 2, VC.post);
  }
  for (const sx of [-hw, hw - 2]) B(sx, 2, -1, sx + 2, H, 1, VC.post);
  // the veranda along the front, open at the doorway (a stepping stone there instead)
  if (o.veranda !== false) for (let k = 0; k < n; k++) {
    if (o.bays[k] === 'd') { B(xs[k] + 4, -1, hd + 1, xs[k + 1] - 4, 1, hd + 5, VC.stoneL); continue; }
    const a = k === 0 ? -hw + 1 : xs[k] + (o.bays[k - 1] === 'd' ? 2 : 0), b = k === n - 1 ? hw - 1 : xs[k + 1] - (o.bays[k + 1] === 'd' ? 2 : 0);
    B(a, 0, hd + 1, b, 3, hd + 5, VC.woodD); B(a, 4, hd + 1, b, 4, hd + 5, VC.woodL);
    for (let u = a + 2; u <= b - 2; u += 12) B(u, -1, hd + 5, u + 1, 3, hd + 5, VC.post);
  }
  // the head beam (a ring) and the roof
  ring(B, -hw - 1, -hd - 1, hw + 1, hd + 1, H + 1, VC.post); ring(B, -hw - 1, -hd - 1, hw + 1, hd + 1, H + 2, VC.post);
  B(-hw, H + 1, -hd, hw, H + 1, hd, VC.woodD);
  const R = thatch(B, -hw - o.ev, hw + o.ev, -hd - o.ev, hd + o.ev + 2, H + 3, o.tiers, o.hip);
  return { door: locM(X, Z, r, door, 14, hd + 5), smoke: locM(X, Z, r, Math.round((R.gx[0] + R.gx[1]) / 2), R.top + 2, 0), top: R.top };
}

// ------------------------------------------------------------------ training pieces (local frame: front = +z)
/** 木人桩：a stone foot, a square post, two arms and a middle arm out toward the front, a bent leg peg, a light cap */
export function mokujin(B: Bx, lx: number, lz: number) {
  B(lx - 3, -1, lz - 3, lx + 3, 1, lz + 3, VC.stoneD);
  B(lx - 1, 2, lz - 1, lx + 1, 24, lz + 1, VC.wood); B(lx - 2, 25, lz - 2, lx + 2, 26, lz + 2, VC.woodD);
  B(lx - 2, 18, lz + 1, lx - 2, 19, lz + 6, VC.woodL); B(lx + 2, 18, lz + 1, lx + 2, 19, lz + 6, VC.woodL);
  B(lx - 1, 18, lz + 1, lx - 1, 19, lz + 1, VC.woodL); B(lx + 1, 18, lz + 1, lx + 1, 19, lz + 1, VC.woodL);
  B(lx, 12, lz + 2, lx, 13, lz + 6, VC.woodL);
  B(lx, 5, lz + 2, lx, 6, lz + 7, VC.woodL); B(lx, 2, lz + 7, lx, 4, lz + 7, VC.woodL);
  B(lx - 1, 21, lz - 1, lx + 1, 21, lz + 1, VC.iron); B(lx - 1, 9, lz - 1, lx + 1, 9, lz + 1, VC.iron);
}
/** 卷藁：a post wrapped in a thick straw roll tied with two ropes */
export function makiwara(B: Bx, lx: number, lz: number) {
  B(lx - 1, -1, lz - 1, lx, 20, lz, VC.woodD);
  B(lx - 2, 9, lz - 2, lx + 1, 18, lz + 1, VC.straw); B(lx - 2, 10, lz - 2, lx + 1, 10, lz + 1, VC.rope); B(lx - 2, 16, lz - 2, lx + 1, 16, lz + 1, VC.rope);
  B(lx - 1, 19, lz - 1, lx, 19, lz, VC.strawD);
}
/** 苦无靶：a square board on two legs, painted rings as nested squares (white, black, white, red), three kunai stuck in it */
export function mato(B: Bx, lx: number, lz: number) {
  B(lx - 8, -1, lz, lx - 7, 18, lz, VC.woodD); B(lx + 7, -1, lz, lx + 8, 18, lz, VC.woodD); B(lx - 8, 19, lz, lx + 8, 19, lz, VC.woodD);
  B(lx - 6, 5, lz, lx + 6, 17, lz + 1, VC.white);
  B(lx - 4, 7, lz + 1, lx + 4, 15, lz + 1, VC.black); B(lx - 2, 9, lz + 1, lx + 2, 13, lz + 1, VC.white); B(lx - 1, 10, lz + 1, lx + 1, 12, lz + 1, VC.red);
  for (const [a, b] of [[-3, 14], [2, 9], [4, 15]]) B(lx + a, b, lz + 2, lx + a, b, lz + 3, VC.iron);
}
/** 跳桩：a short round-cut post (plus-shaped in plan), light cut top */
export function kui(B: Bx, lx: number, lz: number, h: number) {
  B(lx - 2, -1, lz - 1, lx + 2, h - 1, lz + 1, VC.wood); B(lx - 1, -1, lz - 2, lx + 1, h - 1, lz + 2, VC.wood);
  B(lx - 1, h, lz - 1, lx + 1, h, lz + 1, VC.logEnd);
}

// ------------------------------------------------------------------ smoke (炊烟): a slow column of soft puffs while the stage is up
/** the puffs start when the group is committed to the stage (c.add replays then) and stop once the stage is torn down */
export function smoke(c: Ctx, at: P3, o: { rate?: number; col?: number } = {}) {
  const mk = new THREE.Object3D(), col = new THREE.Color(o.col ?? 0xbcb6aa), rate = o.rate ?? 2.6;
  mk.addEventListener('added', () => {
    let acc = 0;
    onUpdate((_dt, rdt) => {
      let root: THREE.Object3D = mk; while (root.parent) root = root.parent;
      if (root !== scene || !PALPHA) return;
      acc += Math.min(rdt, 0.1) * rate;
      while (acc >= 1) {
        acc -= 1;
        PALPHA.emit({ p: new THREE.Vector3(at[0] + (Math.random() - 0.5) * 0.25, at[1], at[2] + (Math.random() - 0.5) * 0.25), v: new THREE.Vector3(0.1 + Math.random() * 0.12, 0.42 + Math.random() * 0.2, (Math.random() - 0.5) * 0.08),
          s0: 0.22, s1: 0.8, life: 3.6 + Math.random() * 2, c0: col, alpha: 0.3, tile: TILE.smoke, fadeIn: 0.5, spin: (Math.random() - 0.5) * 0.5 });
      }
    });
  });
  c.add(mk);
}
