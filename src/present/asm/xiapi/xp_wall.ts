// 第三关 · 下邳寒沼 · 湿马道（xp_wall）：城墙根下的马道。战斗区是一条湿透的条石马道（大块条石横铺、几块泡成泥的整块），
// 地上几片浅积水；沙袋墙外两翼是守城的营地：帐篷、箭楼、兵器架、马槽、滚木礌石、拒马、沙袋堆；后方压着高大的城墙和城垛
// （青灰城砖、墙根一道泡水的黑线、垛口上一层霜雪），地标贴着城墙：一座角楼（砖砌马面上两层白墙黑瓦的楼），或一座水门
// （城墙开一个方洞，铁栅栏拦着，水从栅下涌进一条石渠）。马道外面是泥地，再外面是水。
// 和浮栈巷拉开：这里是硬的——大块条石、城砖、沙袋、军营；浮栈巷是软的——民居、木栈道、漂着的东西。部件在 xp_kit.ts。
import type { Ctx } from '../../scenes/stage';
import { M, AREA, PLAY, SX, SZ } from '../../scenes/props';
import type { Group, Landmark, Layout, Locale, Place, Rect } from '../types';
import { XP, frame, up, faceOf, orient, wp, capCol, fireLight, blackRoof, plasterWall, lattice, icicles, markWater, cityWall, grille, sackRow, crate, brazier, deadWillow, smoke } from './xp_kit';
import { poolsOf, specSeedOf, xpFloor, carveMarks, slabs, commonGroups, commonFiller, xpDress, farHouse, farMass, farWall } from './xp_common';

/** this place's pools (its own pattern for a seed: salt 2) */
const pools = (seed: number) => poolsOf(seed, 2);
/** the city wall's front face (m): behind the corner slots (they reach z ≈ −21.1 on the 2x stage), its height (cells) */
const WALL_Z = () => SZ(-12.4) - 3.0, WALL_H = 80;

// ------------------------------------------------------------------ landmarks (against the city wall)
const LANDMARKS: Landmark[] = [
  { id: 'xw_corner', name: '角楼', foot: { w: 9.6, d: 5.6 }, tags: ['tower', 'tall'], build(c, p) {
    // a brick bastion (马面) standing out of the wall: a stone footing in two steps, coursed brick stained to the flood line, a
    // crenellated parapet; on it a two-storey tower — white plaster between dark posts, lattice windows, a balcony rail, two black
    // roofs with frost / snow and icicles; a flag pole at one corner with a dark torn banner; a fire on the parapet
    const B = frame(c.w, p.x, p.z, 0), cap = capCol(p), H = 60;
    cityWall(B, -64, 64, -38, 30, H, cap, { stain: 18 });
    for (const x of [-64, 64]) for (let y = 12; y < H; y += 4) B(x, y, -38, x, y, 30, XP.brickD);
    // a gate passage through the bastion where the road runs on (a square opening stepped at its top in two wide tiers, a light
    // ring of stones round it, the dark beyond), so the way out the back reads as a way
    B(-15, 26, 30, 15, 33, 30, XP.stoneL); B(-17, 0, 30, -16, 33, 30, XP.stoneL); B(16, 0, 30, 17, 33, 30, XP.stoneL);
    B(-13, 0, -38, 13, 26, 34, null); B(-9, 27, -38, 9, 30, 29, null);
    B(-13, 0, -38, 13, 26, -36, XP.dark); B(-9, 27, -38, 9, 30, -36, XP.dark);
    icicles(B, -12, 12, 30, 26, 3);
    // the tower: storey one
    const U = up(B, H + 3);
    plasterWall(U, -44, 44, 10, 11, 0, 30, { bay: 11 }); plasterWall(U, -44, 44, -30, -29, 0, 30, { bay: 11 });
    plasterWall(U, -44, -43, -29, 10, 0, 30, { bay: 13 }); plasterWall(U, 43, 44, -29, 10, 0, 30, { bay: 13 });
    for (const x of [-26, 0, 26]) lattice(U, x - 6, x + 6, 11, 12, 22);
    B(-50, H + 3, 12, 50, H + 3, 20, XP.plankD); for (let x = -48; x <= 48; x += 4) B(x, H + 4, 20, x, H + 9, 20, XP.wood); B(-50, H + 10, 20, 50, H + 10, 20, XP.woodL);
    blackRoof(U, -56, 56, -40, 24, 31, [[0, 2], [5, 2]], cap, { ridge: false }); icicles(U, -54, 54, 24, 30, 3);
    // storey two
    const V = up(B, H + 3 + 35);
    plasterWall(V, -30, 30, 2, 3, 0, 22, { bay: 10 }); plasterWall(V, -30, 30, -24, -23, 0, 22, { bay: 10 });
    plasterWall(V, -30, -29, -23, 2, 0, 22, {}); plasterWall(V, 29, 30, -23, 2, 0, 22, {});
    lattice(V, -8, 8, 3, 8, 16);
    blackRoof(V, -40, 40, -34, 14, 23, [[0, 2], [5, 2], [5, 2]], cap); icicles(V, -38, 38, 14, 22, 3);
    // the flag pole and a torn dark banner (its hem in three wide steps), a fire on the parapet
    B(54, H + 3, 22, 56, H + 64, 24, XP.woodD);
    B(40, H + 44, 23, 53, H + 62, 23, XP.redD); B(40, H + 40, 23, 45, H + 43, 23, XP.redD); B(48, H + 36, 23, 53, H + 43, 23, XP.redD); B(40, H + 60, 23, 53, H + 60, 23, XP.red);
    const lit = p.time !== 'day', f = brazier(up(B, H + 3), -56, 22, lit, 5);
    if (lit) fireLight(c, p, wp(p, 0, f[0], f[1] + H + 6, f[2]), 1.1, 7);
    markWater(B, -66, 31, 66, 38, 0);
  } },
  { id: 'xw_sluice', name: '水门', foot: { w: 9.6, d: 5.6 }, tags: ['gate', 'water'], build(c, p) {
    // a stretch of the wall with a square sluice in its foot: a stone lintel and jambs, an iron grille down to the water, the flood
    // pouring in under it into a stone channel that runs out toward the floor (kerbs either side, white water in three bands at the
    // grille's foot); a small gate house on the wall top for the winch (plaster, black roof); icicles under the lintel
    const B = frame(c.w, p.x, p.z, 0), cap = capCol(p), H = 66;
    cityWall(B, -66, 66, -38, -8, H, cap, { stain: 20 });
    // the channel (water) through the wall's foot and out to the front of the foot, with stone kerbs
    B(-26, -1, -38, 26, -1, 38, XP.stoneDD); markWater(B, -18, -38, 18, 38, 0);
    for (const s of [-1, 1]) { B(s * 19, -1, -8, s * 26, 3, 38, XP.stone); B(s * 19, 4, -8, s * 26, 4, 38, cap); for (let z = -6; z < 38; z += 10) B(s * 19, 1, z, s * 26, 3, z, XP.stoneD); }
    // the opening: jambs and a lintel of big stones, the dark inside, the grille in it
    B(-18, 0, -38, 18, 24, -8, null); B(-18, 0, -38, 18, 24, -36, XP.dark);
    for (const s of [-1, 1]) B(s * 19 - (s > 0 ? 0 : 3), 0, -9, s * 19 + (s > 0 ? 3 : 0), 27, -7, XP.stoneL);
    B(-22, 25, -9, 22, 30, -7, XP.stone); B(-22, 31, -9, 22, 31, -7, XP.stoneL);
    grille(B, -17, 17, -9, 0, 24); icicles(B, -21, 21, -7, 24, 3);
    // the white water where the flood comes in under the grille: three bands across the channel, the nearest the palest
    B(-18, 0, -7, 18, 0, -5, XP.iceL); B(-18, 0, -2, 18, 0, -1, XP.ice); B(-14, 0, 4, 14, 0, 4, XP.ice);
    // the gate house on the wall top
    const U = up(B, H + 3);
    plasterWall(U, -26, 26, -14, -13, 0, 22, { bay: 13 }); plasterWall(U, -26, 26, -34, -33, 0, 22, { bay: 13 });
    plasterWall(U, -26, -25, -33, -14, 0, 22, {}); plasterWall(U, 25, 26, -33, -14, 0, 22, {});
    lattice(U, -8, 8, -12, 8, 16);
    blackRoof(U, -34, 34, -42, -6, 23, [[0, 2], [4, 2], [4, 2]], cap); icicles(U, -32, 32, -6, 22, 3);
    // the winch's two posts and drum on the walk between the house and the parapet
    for (const x of [-12, 12]) B(x - 1, H + 3, -12, x + 1, H + 14, -11, XP.woodD);
    B(-11, H + 11, -12, 11, H + 13, -11, XP.wood); B(-8, H + 11, -12, -6, H + 13, -11, XP.rope); B(6, H + 11, -12, 8, H + 13, -11, XP.rope);
    // spray over the water where it pours in
    const q = wp(p, 0, 0, 2, -2);
    smoke(c, [q[0], 0.15, q[2]], { rate: 2.2, col: 0xb8c8d2 });
    c.ambient({ kind: 'dust', color: 0xdce6ec, rate: 6, area: { x0: q[0] - 1.2, z0: q[2] - 0.4, x1: q[0] + 1.2, z1: q[2] + 1.6 }, y: [0.02, 0.5] });
  } },
];

// ------------------------------------------------------------------ groups: the garrison under the wall
const GROUPS: Group[] = [
  ...commonGroups('xw'),
  { id: 'xw_rampart', name: '城墙残段', tags: ['wall', 'stone'], foot: { w: 3.6, d: 2.0 }, h: 3.2, kinds: ['back', 'corner', 'wing'], size: 'L', weight: 1.4, build(c, p) {
    // a stretch of the inner wall with its crenels, the right end broken down in two wide steps, sandbags heaped against its foot
    const B = frame(c.w, p.x, p.z, orient(p)), cap = capCol(p);
    cityWall(B, -24, 24, -10, 8, 30, cap, { stain: 14 });
    B(10, 22, -10, 24, 44, 8, null); B(17, 14, -10, 24, 21, 8, null);
    B(10, 22, -10, 16, 22, 8, cap); B(17, 14, -10, 24, 14, 8, cap);
    sackRow(B, -22, -2, 9, 13, 2, cap);
  } },
  { id: 'xw_tent', name: '营帐', tags: ['camp', 'cloth'], foot: { w: 3.2, d: 3.4 }, h: 2.8, kinds: ['wing', 'back', 'corner'], size: 'L', weight: 1.3, build(c, p) {
    // a garrison tent: grey canvas in three flat tiers stepping in (a ridge pole on top), the door flap open dark, guy posts at the
    // corners, a weapon rack and a pot by the door; snow / frost on each tier's top
    const r = faceOf(p.s || 1), B = frame(c.w, p.x, p.z, r), cap = capCol(p), CV = 0x7a7c78, CVD = 0x5e605c, CVL = 0x8e908a;
    B(-20, -1, -22, 20, -1, 22, XP.mud);
    B(-18, 0, -20, 18, 14, 20, CV); B(-18, 0, -20, 18, 1, 20, CVD); B(-18, 15, -20, 18, 15, 20, cap);
    B(-14, 15, -16, 14, 24, 16, CV); B(-14, 25, -16, 14, 25, 16, cap);
    B(-9, 25, -11, 9, 32, 11, CVL); B(-9, 33, -11, 9, 33, 11, cap); B(-2, 33, -13, 2, 35, 13, XP.woodD);
    for (const z of [-20, 0]) B(-18, 2, z, 18, 2, z, CVD);
    B(-5, 0, 20, 5, 12, 20, XP.dark); B(-6, 0, 21, -5, 13, 21, CVD); B(5, 0, 21, 6, 13, 21, CVD);
    for (const [a, b] of [[-21, -23], [21, -23], [-21, 23], [21, 23]] as const) B(a, 0, b, a, 6, b, XP.woodD);
    for (const x of [10, 13, 16]) { B(x, 0, 23, x, 24, 23, XP.wood); B(x, 25, 23, x, 28, 23, XP.ironL); }
    B(9, 10, 23, 17, 10, 23, XP.woodD);
    B(-14, 0, 22, -9, 4, 26, XP.iron); B(-13, 5, 23, -10, 5, 25, XP.ironL);
  } },
  { id: 'xw_watch', name: '箭楼', tags: ['tower', 'tall'], foot: { w: 2.2, d: 2.2 }, h: 4.6, kinds: ['back', 'corner'], size: 'M', build(c, p) {
    // a timber watch platform on four posts braced by two rings of rails, a plank floor with a parapet of boards, a black roof on
    // four short posts, a ladder up one side
    const B = frame(c.w, p.x, p.z, orient(p)), cap = capCol(p);
    for (const a of [-12, 11]) for (const b of [-12, 11]) { B(a - 1, -1, b - 1, a + 2, 1, b + 2, XP.stoneD); B(a, 2, b, a + 1, 40, b + 1, XP.woodD); }
    for (const y of [14, 28]) { B(-12, y, -12, 12, y, -12, XP.wood); B(-12, y, 12, 12, y, 12, XP.wood); B(-12, y, -12, -12, y, 12, XP.wood); B(12, y, -12, 12, y, 12, XP.wood); }
    B(-15, 41, -15, 15, 42, 15, XP.plankD); B(-15, 43, -15, 15, 49, -14, XP.plank); B(-15, 43, 14, 15, 49, 15, XP.plank); B(-15, 43, -15, -14, 49, 15, XP.plank); B(14, 43, -15, 15, 49, 15, XP.plank);
    for (let x = -12; x <= 12; x += 4) B(x, 43, 15, x, 49, 15, XP.plankD);
    for (const a of [-14, 13]) for (const b of [-14, 13]) B(a, 50, b, a + 1, 58, b + 1, XP.woodD);
    blackRoof(B, -19, 19, -19, 19, 59, [[0, 2], [5, 2]], cap); icicles(B, -18, 18, 19, 58, 3);
    for (const x of [-4, 3]) B(x, 0, 16, x, 40, 16, XP.wood); for (let y = 4; y <= 38; y += 5) B(-4, y, 16, 3, y, 16, XP.woodL);
  } },
  { id: 'xw_rack', name: '兵器架', tags: ['camp', 'weapons', 'low'], foot: { w: 1.4, d: 2.4 }, h: 0.9, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a low rack of spears and halberds laid flat on two trestles, a shield of hide against it, sacks either side
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)), cap = capCol(p);
    for (const x of [-11, 9]) { B(x, 0, -4, x + 1, 7, -3, XP.woodD); B(x, 0, 3, x + 1, 7, 4, XP.woodD); B(x, 8, -4, x + 1, 8, 4, XP.wood); }
    for (const z of [-2, 0, 2]) { B(-14, 9, z, 13, 9, z, XP.wood); B(14, 9, z, 16, 9, z, XP.ironL); }
    B(-15, 9, -1, -15, 11, 1, XP.ironL);
    B(-5, 0, 6, 3, 9, 6, 0x6a5440); B(-4, 1, 7, 2, 8, 7, 0x7e6650); B(-1, 4, 7, -1, 5, 7, XP.ironL);
    sackRow(B, -14, -6, -10, -6, 2, cap);
  } },
  { id: 'xw_trough', name: '马槽', tags: ['horse', 'low'], foot: { w: 1.4, d: 2.6 }, h: 0.9, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // a long wooden trough on blocks with ice on its water, two hitching posts with rope rings, a heap of wet straw
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1));
    B(-14, 0, -3, -11, 3, 3, XP.stoneD); B(10, 0, -3, 13, 3, 3, XP.stoneD);
    B(-15, 4, -4, 14, 9, 4, XP.wood); B(-13, 6, -2, 12, 9, 2, XP.ice); B(-13, 9, -2, 12, 9, 2, XP.iceL); B(-15, 9, -4, 14, 9, -4, XP.woodL); B(-15, 9, 4, 14, 9, 4, XP.woodL);
    for (const x of [-18, 17]) { B(x - 1, 0, 7, x + 1, 13, 9, XP.woodD); B(x - 2, 10, 7, x + 2, 11, 9, XP.rope); }
    B(-8, 0, 7, 6, 2, 13, XP.straw); B(-5, 3, 8, 3, 3, 12, XP.strawD);
  } },
  { id: 'xw_logs', name: '滚木礌石', tags: ['camp', 'stone', 'low'], foot: { w: 2.4, d: 1.8 }, h: 0.9, kinds: ['wing', 'back'], size: 'S', build(c, p) {
    // the wall's defences stacked for hauling up: logs in two crossed layers, a pyramid of dressed stones in flat tiers
    const B = frame(c.w, p.x, p.z, orient(p)), cap = capCol(p);
    for (const z of [-10, -6, -2]) B(-16, 0, z, 2, 2, z + 2, XP.wood);
    for (const x of [-13, -6]) B(x, 3, -11, x + 2, 5, 1, XP.woodD);
    B(-14, 6, -11, -2, 6, 1, cap);
    B(5, 0, -10, 16, 3, 10, XP.stoneD); B(6, 4, -8, 15, 6, 8, XP.stone); B(8, 7, -5, 13, 9, 5, XP.stone); B(8, 10, -5, 13, 10, 5, cap);
    for (const z of [-6, 2]) B(5, 1, z, 16, 1, z, XP.stoneDD);
  } },
  { id: 'xw_juma', name: '拒马', tags: ['camp', 'low'], foot: { w: 1.0, d: 2.8 }, h: 0.9, kinds: ['wing'], size: 'S', build(c, p) {
    // a 拒马: a long log on two trestle feet with stakes through it, upright, alternating long and short (no slanting stakes),
    // iron tips; a sandbag at each foot
    const B = frame(c.w, p.x, p.z, faceOf(p.s || 1)), cap = capCol(p);
    B(-19, 4, -1, 19, 6, 1, XP.wood);
    for (const x of [-16, 15]) { B(x, 0, -5, x + 1, 3, 5, XP.woodD); B(x - 3, 0, -6, x + 4, 1, -4, XP.sackW); B(x - 3, 0, 4, x + 4, 1, 6, XP.sackW); }
    for (let x = -17, k = 0; x <= 17; x += 4, k++) { const t = k % 2 ? 9 : 12; B(x, 1, 0, x, t, 0, XP.woodD); B(x, t + 1, 0, x, t + 1, 0, XP.ironL); }
    B(-19, 7, -1, 19, 7, 1, cap);
  } },
];
const FILLER: Group[] = commonFiller('xw');

// ------------------------------------------------------------------ ground: the drowned horse road of long blocks, mud beyond, the flood further out
function floor(c: Ctx, f: { layout: Layout; p: Place }) {
  const ps = pools(specSeedOf(f.p)), wz = WALL_Z(), dryX = AREA.x1 + 1.2;
  const roadJoint = 0x464843;
  xpFloor(c, f, ps, (X, Z, x, z, zone, path) => {
    if (zone === 'play') {
      // 马道靠两翼的泥被踩实，湿线贴着积水走，马道中间整片露出条石。
      const shoulder = (x < PLAY.x0 + 4.3 && z > SZ(-1.7)) || (x > PLAY.x1 - 4.2 && z < SZ(-1.2));
      if (shoulder) return ps.some(q => x > q.x0 - 1.4 && x < q.x1 + 1.4 && z > q.z0 - 1.4 && z < q.z1 + 1.4) ? XP.mudD : XP.mudL;
      return slabs(X, Z, 27, 15, 0x5a5b56, roadJoint);
    }
    if (zone === 'path' && path) return slabs(X, Z, 16, 24, 0x5c5d58, roadJoint);
    if (Math.abs(x) > dryX && z > wz - 0.5) return null;
    if (z > PLAY.z1 + 3.2) return null;
    if (z > wz - 0.6 && z < wz + 2.2) return slabs(X, Z, 27, 16, XP.stoneD, XP.stoneDD);
    return x < PLAY.x0 - 2.1 || x > PLAY.x1 + 2.1 ? XP.mudD : XP.mud;
  });
}

// ------------------------------------------------------------------ the far ring: the city wall the whole width, its towers, the flood and roofs beyond the flanks
function far(c: Ctx, f: { layout: Layout; p: Place }) {
  carveMarks(c);
  const w = c.w, r = f.p.rnd, cap = capCol(f.p), wz = WALL_Z(), lm = f.layout.landmark;
  // the wall itself in cells (it is near: real voxels for its crenels and courses), across the whole stage
  const B = frame(w, 0, wz, 0), half = M(AREA.x1 + 7), D = 30;
  cityWall(B, -half, half, -D, 0, WALL_H, cap, { stain: 22, hollow: true });
  // behind the landmark the wall comes forward to meet its back (the landmarks reach 38 cells behind their anchor), so no strip of
  // floor shows between them
  if (lm) { const fb = frame(w, lm.x, wz, 0), hw = M(lm.w / 2) - 6, dz = M(lm.z - wz) - 34; if (dz > 2) cityWall(fb, -hw, hw, 0, dz, WALL_H - 22, cap, { stain: 20, crenel: false, hollow: true }); }
  // towers on the wall every ~9 m (plaster storey, black roofs), skipping the landmark
  for (let x = -half + 40; x <= half - 40; x += 128) {
    if (lm && Math.abs(x * 0.07 - lm.x) < lm.w / 2 + 2) continue;
    const U = up(frame(w, x * 0.07, wz, 0), WALL_H + 3);
    plasterWall(U, -18, 18, -8, -7, 0, 18, { bay: 9 }); plasterWall(U, -18, 18, -26, -25, 0, 18, { bay: 9 });
    plasterWall(U, -18, -17, -25, -8, 0, 18, {}); plasterWall(U, 17, 18, -25, -8, 0, 18, {});
    lattice(U, -6, 6, -6, 6, 13);
    blackRoof(U, -25, 25, -32, -1, 19, [[0, 2], [4, 2], [4, 2]], cap);
  }
  // beyond the flanks: flooded roofs and dead willows standing in the water
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = SZ(-14) + i * 7 + (r(10 + i + (s > 0 ? 20 : 0)) - 0.5); if (z > SZ(2)) break;
    farHouse(c, s * (AREA.x1 + 6.4 + r(40 + i) * 1.5), z, 22 + Math.floor(r(60 + i) * 6), 28, 24 + Math.floor(r(100 + i) * 8), cap, { cut: r(120 + i) < 0.3 });
  }
  for (let i = 0; i < 4; i++) deadWillow(c, (i % 2 ? 1 : -1) * (AREA.x1 + 3.0 + r(280 + i) * 1.2), SZ(-8) + i * 5.2 + r(290 + i) * 2, 4.4 + r(300 + i) * 1.2, 500 + i);
  // over the wall, far off: the roofs of the drowned city and a second wall line in the mist
  farWall(c, -52, 52, wz - 14, 60, cap, 24);
  for (let i = 0; i < 6; i++) farHouse(c, -26 + i * 10.4 + (r(320 + i) - 0.5) * 2, wz - 6.5 - r(330 + i) * 2, 26, 22, 70 + Math.floor(r(340 + i) * 12), cap);
  void farMass; void SX; void crate;
}

function dress(c: Ctx, f: { layout: Layout; p: Place; clear: Rect[] }) {
  xpDress(c, f);
}

export const xpWall: Locale = {
  id: 'xp_wall', name: '湿马道', theme: 'xiapi',
  layouts: ['axis', 'offset', 'ridge', 'pair'],
  landmarks: LANDMARKS, groups: GROUPS, filler: FILLER,
  seasons: ['winter'], weathers: ['mist', 'snow', 'clear'], noSnow: true, noLeaves: true,
  pools, floor, far, dress,
};
void (0 as unknown as Place);
