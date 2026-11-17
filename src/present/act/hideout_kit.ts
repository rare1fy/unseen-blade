// 据点「嵩山南麓 · 断碑古窑」的道具（hideout.ts 摆位）：塌了半边的青砖拱窑、窑口塌顶处的半地下铁炉与铁砧、北墙与复仇碑旁的供台、
// 孙媪的药角、试剑坪的铜铃木桩、上土台的石阶、山脚的夯土台地、暗渠与栏杆、杜五的锅灶和黑篷车、院门。
// 铁律同残村（hj_village_kit.ts）：横平竖直的大块；拱和穹顶只用两三层宽台阶（每层水平收进都比竖直高度大），不做一格一格的斜阶；
// 花纹只用砖缝、夯层、板缝、绳箍这些结构线，不用逐格随机色；每件东西两三档颜色、至少两种材料。坐标：世界格（CELL = 7 厘米），
// 除特别说明外 y = 0 是地面上第一层格子。
import type { Ctx } from '../scenes/stage';
import { hash, type W } from '../scenes/props';
import { CELL } from '../bestiary/kit';
import { HV, disc, jar, earth, cartWheel, yardWall } from '../asm/hanmo/hj_village_kit';
import { loc } from '../scenes/k_village';

/** the hideout's own colours (rammed earth, thatch, timber, straw come from the village palette HV) */
export const K = {
  // 青砖: blue-grey brick in two close tones, the mortar joint, the light arch ring / fresh break, the soot inside the kiln
  brick: 0x6c7478, brickT: 0x646b70, joint: 0x4a5054, brickL: 0x8a9296, soot: 0x2e2a28, sootD: 0x1c1816, hole: 0x110e0c,
  // the earth and dead grass grown over the vault
  top: 0x77684a, topL: 0x8a7a56,
  // dressed stone, the packed earth of the training ground, its timber kerb
  stone: 0x8a857c, stoneD: 0x6a665f, stoneL: 0xa49e94, yard: 0x8e7c5a, yardD: 0x847252, pave: 0x7a7c78, paveD: 0x6a6c6a, paveJ: 0x555856,
  // iron, embers, the hot blank
  iron: 0x38373e, ironL: 0x5c5c66, ironD: 0x222126, ember: 0x8a2412, emberL: 0xc8461c, coal: 0x2a2422, coalL: 0x3a322e,
  // bronze bells, the offering's candle
  bronze: 0x6a6a46, bronzeL: 0x8e8c5c, bronzeD: 0x46462e, wax: 0xeee4ca, flame: 0xffb050,
  // the courtyard's packed earth, the path, the terraces' tamped faces and grassy tops
  earth: 0x76644a, earthD: 0x6a5a42, earthL: 0x84705a, path: 0x968264, rut: 0x6a5840, face: 0x8a7252, faceS: 0x76603f, grass: [0x6e6a40, 0x5e5a36, 0x7a744a] as const,
  // herbs drying, medicine jars (glazes), the mat, the quilt
  herbs: [0x7a7a40, 0x8e6a3a, 0x5e6a3e, 0x9a8a5a, 0x6a4a3a] as const, glazeB: 0x4a3020, glazeG: 0x5c6a5a, stain: 0x6a2e24,
  // the cart's black hood, the water
  hood: 0x26252a, hoodL: 0x3a3840, hoodD: 0x18171b, water: 0x2c4446, bed: 0x182628,
};
type Box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null, g?: number) => void;
const boxOf = (w: W): Box => (x0, y0, z0, x1, y1, z1, c, g = 0) => { w.box(x0, y0, z0, x1, y1, z1, c, g); };
/** recolour the cells already there in a box (world cells): a colour or a function of the cell */
export function recolor(w: W, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number | ((x: number, y: number, z: number, c: number) => number | null)) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
    const c = w.get(x, y, z); if (!c) continue;
    const n = typeof col === 'number' ? col : col(x, y, z, c.c); if (n != null) c.c = n;
  }
}
/** coursed 青砖: 4-cell courses (a mortar row), 8-cell bricks (a joint), every other course offset half a brick, every fifth brick a
 *  shade darker (whole bricks, never single cells). a runs along the face (x + z serves both the front and the side faces) */
export function brickAt(a: number, y: number) {
  const row = Math.floor((y + 64) / 4), ly = (y + 64) % 4; if (ly === 3) return K.joint;
  const u = a + 512 + (row & 1) * 4; if (u % 8 === 7) return K.joint;
  return (row * 3 + Math.floor(u / 8)) % 5 === 0 ? K.brickT : K.brick;
}

// ------------------------------------------------------------------ the kiln (青砖拱窑)
/**
 * The old brick kiln, half fallen in. Local frame: X0 = the vault's centre cell, Zf = the cell row of its front face (z ≤ 0 stands,
 * z 1..34 is the bay where the front half fell). The vault: walls to 2.1 m, then four wide tiers (each steps in further than it rises)
 * to the crown at 4 m; its front face keeps the arched mouth whole — a light brick ring round the tunnel's stepped profile and a stone
 * keystone — the tunnel behind black with soot, old wares stacked just inside. Right of the crown the vault has fallen in: a crater
 * stepping wider going up, open down into the tunnel, a heap of fallen brick under it in the light. The bay: the side walls left
 * standing (a stub of the fallen vault still clinging to the left one), each broken down in big steps toward the front, the right one
 * to a rubble heap; brick paving under the forge. Earth and dead grass on every top of the mound.
 * Returns the crater's middle (metres) for the light falling into it.
 */
export function kiln(c: Ctx, X0: number, Zf: number) {
  const w = c.w, B: Box = (x0, y0, z0, x1, y1, z1, col, g = 0) => w.box(X0 + x0, y0, Zf + z0, X0 + x1, y1, Zf + z1, col, g);
  const ZB = -50;
  const OH = (y: number) => (y <= 31 ? 54 : y <= 40 ? 44 : y <= 48 ? 32 : y <= 55 ? 20 : y <= 60 ? 10 : -1);
  const IH = (y: number) => (y <= 25 ? 30 : y <= 31 ? 24 : y <= 36 ? 16 : y <= 39 ? 8 : -1);
  const inTun = (x: number, y: number, z: number) => { const ih = IH(y); return y >= 0 && ih > 0 && x >= -ih && x <= ih - 1 && z > ZB + 3 && z <= 0; };
  const hole = (x: number, y: number, z: number) => (y >= 49 ? x >= 2 && x <= 28 && z >= -34 && z <= -10 : y >= 41 ? x >= 6 && x <= 24 && z >= -31 && z <= -13 : y >= 27 ? x >= 9 && x <= 20 && z >= -28 && z <= -16 : false);
  // the vault in coursed brick
  for (let y = 0; y <= 60; y++) { const oh = OH(y); for (let x = -oh; x <= oh - 1; x++) for (let z = ZB; z <= 0; z++) if (!inTun(x, y, z) && !hole(x, y, z)) w.set(X0 + x, y, Zf + z, brickAt(x + z, y)); }
  // the arch ring on the front face (cells within three of the mouth), soot on the tunnel's inner faces, its back lost in the dark
  const near = (x: number, y: number, z: number, d: number) => { for (let k = 1; k <= d; k++) if (inTun(x + k, y, z) || inTun(x - k, y, z) || inTun(x, y + k, z) || inTun(x, y - k, z) || inTun(x, y, z - k)) return true; return false; };
  for (let y = 0; y <= 43; y++) for (let x = -34; x <= 33; x++) for (let z = ZB; z <= 0; z++) {
    const cell = w.get(X0 + x, y, Zf + z); if (!cell) continue;
    if (z >= -1) { if (near(x, y, z, 3)) cell.c = K.brickL; }
    else if (near(x, y, z, 1)) cell.c = z <= ZB + 4 ? K.hole : K.soot;
  }
  B(-2, 40, -1, 1, 43, 0, K.stoneL); B(-2, 40, -1, 1, 40, 0, K.stone);
  B(-30, -1, ZB + 4, 29, -1, 0, K.sootD);
  // the bay: the side walls broken down in steps toward the front (the left keeps a stub of the vault's first tier), the right one
  // ends in rubble
  const hL = (z: number) => (z <= 14 ? 31 : z <= 26 ? 20 : 9), hR = (z: number) => (z <= 10 ? 24 : z <= 22 ? 12 : -1);
  for (let z = 1; z <= 34; z++) {
    for (let y = 0; y <= hL(z); y++) for (let x = -54; x <= -45; x++) w.set(X0 + x, y, Zf + z, brickAt(x + z, y));
    for (let y = 0; y <= hR(z); y++) for (let x = 44; x <= 53; x++) w.set(X0 + x, y, Zf + z, brickAt(x + z, y));
  }
  for (let z = 1; z <= 8; z++) for (let y = 32; y <= 38; y++) for (let x = -54; x <= -40 + (y > 35 ? 0 : 2); x++) w.set(X0 + x, y, Zf + z, brickAt(x + z, y));
  // rubble: low flat-topped heaps of fallen brick in the bay's right corner and spilling out past the wall's end, a few loose bricks
  B(32, 0, 18, 43, 3, 33, K.brick); B(34, 4, 21, 41, 5, 30, K.brickT); B(36, 6, 24, 39, 6, 28, K.brick);
  B(44, 0, 23, 56, 4, 31, K.brickT); B(46, 5, 25, 53, 6, 29, K.brick); B(54, 0, 32, 60, 2, 37, K.brick);
  for (const [x, z, along] of [[26, 31, 1], [49, 39, 0], [-36, 33, 1], [58, 27, 0], [12, 6, 1], [-50, 37, 1]] as Array<[number, number, number]>) B(x, 0, z, x + (along ? 3 : 1), 1, z + (along ? 1 : 3), K.brickL);
  // the crater's fallen brick on the tunnel floor under it
  B(8, 0, -28, 22, 4, -15, K.brick); B(10, 5, -26, 20, 7, -17, K.brickT); B(12, 8, -24, 17, 9, -19, K.brick);
  // every top in the open: earth and dead grass on the mound, a fresh light break on the broken walls and the rubble
  recolor(w, X0 - 55, 0, Zf + ZB, X0 + 61, 61, Zf + 40, (x, y, z) => (w.has(x, y + 1, z) ? null : z - Zf <= 0 && y >= 31 ? hash(x >> 3, z >> 3, 7) < 0.6 ? K.top : K.topL : K.brickL));
  // just inside the mouth: the kiln's last wares, stacks of grey bowls (a light rim on every other bowl) and a cracked big jar
  for (const [x, z, h] of [[-27, -5, 9], [-23, -4, 6], [-25, -10, 12], [-19, -8, 4]] as Array<[number, number, number]>) for (let y = 0; y < h; y++) B(x, y, z, x + 2, y, z + 2, y % 2 ? HV.greyL : HV.grey);
  const J = loc(w, X0 + 20, Zf - 6, 0); jar(J, 0, 0, 1, true, { broken: true });
  // the bay's paving: big grey pavers, staggered, two close tones by whole paver
  for (let x = -44; x <= 43; x++) for (let z = 1; z <= 34; z++) {
    const row = Math.floor((z + 60) / 6), u = x + 60 + (row & 1) * 6, j = (z + 60) % 6 === 5 || u % 12 === 11;
    w.set(X0 + x, -1, Zf + z, j ? K.paveJ : (row + Math.floor(u / 12)) % 3 === 0 ? K.paveD : K.pave);
  }
  // dead vines hanging over the face from the tiers' edges
  for (const [x, y] of [[-37, 41], [27, 49], [50, 32]] as Array<[number, number]>)
    c.cards.add('deadvine', (X0 + x + 0.5) * CELL, (Zf + 1.02) * CELL, { y: y * CELL, ry: 0, s: 0.8 + hash(x, y) * 0.35, tint: 0xd8ccb0 });
  return { hole: [(X0 + 15) * CELL, (Zf - 21) * CELL] as [number, number] };
}

// ------------------------------------------------------------------ the forge (半地下铸铁炉), the bellows, the anvil
/** the sunken forge at cell (X, Z): a dressed-stone kerb two courses above the floor round an iron firepot sunk to the floor; dull red
 *  embers in the pot under black coal lumps (whole lumps, the glow between them), brighter where the blast comes in; the box bellows
 *  on the −x side (a pull handle, iron bands) and its clay pipe into the kerb. Returns the fire point (metres). */
export function forge(c: Ctx, X: number, Z: number): [number, number, number] {
  const B = loc(c.w, X, Z, 0);
  B(-9, 0, -7, 8, 1, 6, K.stone); B(-9, 2, -7, 8, 2, 6, K.stoneL); B(-9, 0, -7, 8, 0, 6, K.stoneD);
  B(-6, 0, -4, 5, 2, 3, null); B(-7, 1, -5, 6, 2, 4, K.ironL); B(-6, 1, -4, 5, 2, 3, null);
  B(-6, -1, -4, 5, -1, 3, K.ember, 1); B(-6, 0, -4, 5, 0, 3, K.ember, 1);
  B(-4, 0, -2, -1, 0, 1, K.emberL, 1); B(-6, 0, -1, -5, 0, 0, K.emberL, 1);
  B(-6, 1, -4, -3, 1, -2, K.coal); B(2, 1, 0, 5, 1, 3, K.coal); B(-1, 1, 2, 1, 1, 3, K.coalL); B(3, 1, -4, 5, 1, -3, K.coalL); B(-2, 1, -4, 0, 1, -4, K.coal);
  // the bellows: a plank box on the −x side, two iron bands, the pull rod and its cross grip; the clay pipe into the kerb
  B(-19, 0, -4, -12, 7, 3, HV.wood); B(-19, 0, -4, -19, 7, 3, HV.woodD); B(-19, 3, -4, -12, 3, 3, K.iron); B(-19, 7, -4, -12, 7, 3, HV.woodL);
  B(-22, 4, 0, -20, 4, 0, HV.woodL); B(-23, 3, -1, -23, 5, 1, HV.woodD);
  B(-11, 2, -1, -10, 3, 0, HV.clay);
  return [(X + 0.5) * CELL, 0.3, (Z + 0.5) * CELL];
}
/** the anvil on its stump at cell (X, Z): a round stump (bark sides, a light cut top), the iron anvil (a wide foot, a waist, a long top
 *  along x with a polished face at 0.7 m), a hammer and a pair of spare tongs leaning on the stump's foot (flat on the ground) */
export function anvil(c: Ctx, X: number, Z: number) {
  const B = loc(c.w, X, Z, 0);
  disc(B, 0, 0, 4, 0, 4, 0x5a4632); disc(B, 0, 0, 4, 5, 5, 0xa48a5e); disc(B, 0, 0, 2, 5, 5, 0x8a7048);
  B(-3, 6, -2, 3, 7, 2, K.ironD); B(-2, 8, -1, 2, 8, 1, K.iron); B(-5, 9, -2, 5, 9, 2, K.iron); B(-4, 9, -1, 4, 9, 1, K.ironL); B(-6, 9, -1, -6, 9, 0, K.iron);
  B(5, 0, 3, 10, 0, 3, HV.woodL); B(10, 0, 2, 12, 1, 4, K.iron);
  B(-11, 0, 4, -3, 0, 4, K.iron); B(-11, 0, 6, -3, 0, 6, K.iron); B(-3, 0, 4, -3, 0, 6, K.ironL);
}

// ------------------------------------------------------------------ the bay's furniture: the blade rack, the quench trough, coal
/** blades standing in a rack (along z, facing +x) at cell (X, Z0..): two posts, two rails, four blanks and blades point up (two bright,
 *  two still black from the fire), each with its tang in the bottom rail */
export function bladeRack(c: Ctx, X: number, Z0: number) {
  const B = boxOf(c.w);
  for (const z of [Z0, Z0 + 13]) B(X, 0, z, X + 1, 18, z + 1, HV.post);
  B(X + 1, 5, Z0, X + 1, 6, Z0 + 14, HV.woodD); B(X + 1, 15, Z0, X + 1, 16, Z0 + 14, HV.woodD);
  [[3, 0xc8ced6, 20], [6, K.iron, 17], [9, 0xb8bec8, 21], [11, K.ironL, 15]].forEach(([dz, col, h]) => { B(X + 2, 1, Z0 + dz, X + 2, 3, Z0 + dz, HV.woodD); B(X + 2, 4, Z0 + dz, X + 2, h, Z0 + dz, col); });
}
/** a stone quench trough with dark water (cells), a wooden bucket beside it */
export function trough(c: Ctx, X: number, Z: number) {
  const B = boxOf(c.w);
  B(X - 7, 0, Z - 3, X + 7, 5, Z + 3, K.stone); B(X - 5, 3, Z - 1, X + 5, 5, Z + 1, null); B(X - 5, 3, Z - 1, X + 5, 3, Z + 1, K.water);
  B(X - 7, 5, Z - 3, X + 7, 5, Z - 3, K.stoneL); B(X - 7, 0, Z - 3, X + 7, 0, Z + 3, K.stoneD);
  B(X + 9, 0, Z - 1, X + 12, 4, Z + 2, HV.wood); B(X + 9, 2, Z - 1, X + 12, 2, Z + 2, K.iron); B(X + 10, 4, Z, X + 11, 4, Z + 1, K.water);
}
/** a round wicker basket of charcoal (cells) */
export function coalBasket(c: Ctx, X: number, Z: number) {
  const B = loc(c.w, X, Z, 0); disc(B, 0, 0, 4, 0, 3, HV.strawD); disc(B, 0, 0, 4, 3, 3, HV.straw); disc(B, 0, 0, 3, 3, 4, K.coal); B(-1, 5, -1, 1, 5, 0, K.coalL);
}

// ------------------------------------------------------------------ the north wall and the revenge list (复仇名单墙)
/** the brick wall across the back (cells X0..X1 along x, Z0..Z1 thick, h high): a stone footing, coursed brick, a two-row tile coping;
 *  drops: [x0, x1, d] knock the top down d cells (coping and all) */
export function northWall(c: Ctx, X0: number, X1: number, Z0: number, Z1: number, h: number, drops: Array<[number, number, number]>) {
  const w = c.w, B = boxOf(w);
  for (let x = X0; x <= X1; x++) { const d = drops.find(q => x >= q[0] && x <= q[1])?.[2] ?? 0, top = h - d; for (let y = 0; y <= top; y++) for (let z = Z0; z <= Z1; z++) w.set(x, y, z, y <= 2 ? (y === 2 ? K.stoneL : K.stone) : brickAt(x + z, y)); if (!d) { B(x, h + 1, Z0 - 1, x, h + 1, Z1 + 1, HV.tileD); B(x, h + 2, Z0, x, h + 2, Z1, (x & 3) === 0 ? HV.tileL : HV.tile); } else B(x, top, Z0, x, top, Z1, K.brickL); }
}
/** act-37 (用户：「据点墙上的刀架」可以): the rack for the thirty 百辟刀 of the 文家 forge, on the north wall beside the kiln — two
 *  dark stiles, three rails (y 31 / 22 / 13), ten pegs on each rail sticking out toward the yard. The blades she has taken back hang
 *  from their pegs (the game adds them: rackBlades in hideout.ts); an empty slot is only its peg. Cells X0..X0 + 20, its plane at Z. */
export const RACK_RAILS = [31, 22, 13];
export function bladeWall(c: Ctx, X0: number, Z: number) {
  const B = boxOf(c.w);
  for (const x of [X0, X0 + 20]) { B(x, 4, Z, x, 32, Z, HV.post); B(x, 32, Z, x, 32, Z + 1, HV.woodD); }
  for (const y of RACK_RAILS) { B(X0, y, Z, X0 + 20, y, Z, HV.woodD); B(X0 + 1, y + 1, Z, X0 + 19, y + 1, Z, HV.wood); for (let i = 0; i < 10; i++) B(X0 + 1 + i * 2, y, Z + 1, X0 + 1 + i * 2, y, Z + 1, HV.post); }
}
/** the offering by the revenge stele (cells, the stand's middle at X, Z): a dressed-stone stand with a light top, on it a clay bowl of
 *  ash and a candle (lit = its flame glows). Returns the flame point */
export function offering(c: Ctx, X: number, Z: number, lit: boolean): [number, number, number] {
  const B = boxOf(c.w);
  B(X - 3, 0, Z - 2, X + 3, 6, Z + 2, K.stone); B(X - 3, 6, Z - 2, X + 3, 6, Z + 2, K.stoneL); B(X - 3, 0, Z - 2, X + 3, 0, Z + 2, K.stoneD);
  B(X - 2, 7, Z - 1, X, 8, Z + 1, HV.clay); B(X - 1, 8, Z, X - 1, 8, Z, HV.ashL);
  B(X + 2, 7, Z, X + 2, 9, Z, K.wax); B(X + 2, 10, Z, X + 2, 10, Z, lit ? K.flame : HV.char, lit ? 1 : 0);
  return [(X + 2.5) * CELL, 10.5 * CELL, (Z + 0.5) * CELL];
}
/** split logs stacked along z (cells x0..x1 × z0..z1, h high): the long side in bark courses, the ends showing the log ends in a grid */
export function logStack(c: Ctx, x0: number, x1: number, z0: number, z1: number, h: number) {
  const B = boxOf(c.w), BARK = 0x5a4632, END = 0xa48a5e, SEAM = 0x7a6444;
  B(x0, 0, z0, x1, h, z1, BARK); for (let y = 3; y < h; y += 4) B(x0, y, z0, x1, y, z1, 0x46362a);
  for (const z of [z0, z1]) { B(x0, 0, z, x1, h, z, END); for (let y = 3; y < h; y += 4) B(x0, y, z, x1, y, z, SEAM); for (let x = x0 + 2; x < x1; x += 3) B(x, 0, z, x, h, z, SEAM); }
}

// ------------------------------------------------------------------ 孙媪的药角
/** the lean-to against the back wall over cells X0..X1 (the wall face at row Zw, the posts at row Zp): two posts, a beam, a two-tier
 *  thatch slab rising to the wall; three shelves of jars under it (small lidded jars in four glazes, a fixed order); bundles of drying
 *  herbs hung along the beam (five kinds in a fixed order, a cut end darker); two big storage jars at the foot */
export function herbCorner(c: Ctx, X0: number, X1: number, Zw: number, Zp: number, Zr: number) {
  const w = c.w, B = boxOf(w), D = Math.round((Zp - Zw) * 0.5);
  for (const x of [X0 + 2, X1 - 3]) B(x, 0, Zp - 1, x + 1, 26, Zp, HV.post);
  B(X0, 26, Zp - 1, X1, 27, Zp, HV.woodD);
  B(X0 - 1, 28, Zw, X1 + 1, 30, Zp + 2, HV.th); B(X0 - 1, 28, Zp + 2, X1 + 1, 28, Zp + 2, HV.thD); B(X0 - 1, 30, Zw, X1 + 1, 30, Zp + 2, HV.thL);
  B(X0 - 1, 31, Zw, X1 + 1, 32, Zw + D, HV.th); B(X0 - 1, 32, Zw, X1 + 1, 32, Zw + D, HV.thL); B(X0 - 1, 31, Zw + D, X1 + 1, 31, Zw + D, HV.thD);
  for (const x of [X0 - 1, X1 + 1]) B(x, 28, Zw, x, 31, Zp + 2, HV.thM);
  // shelves: three planks on brackets, small lidded jars in four glazes (a fixed order, a gap now and then)
  const glaze = [HV.clay, K.glazeG, HV.grey, K.glazeB];
  [6, 13, 20].forEach((y, s) => {
    B(X0 + 1, y, Zw + 1, X1 - 1, y, Zw + 4, HV.woodL); B(X0 + 1, y, Zw + 4, X1 - 1, y, Zw + 4, HV.wood);
    for (let x = X0 + 2, i = 0; x + 2 <= X1 - 2; x += 4, i++) {
      if ((i + s) % 5 === 4) continue;
      const g = glaze[(i + s * 2) % 4], tall = (i + s) % 3 === 0;
      B(x, y + 1, Zw + 2, x + 2, y + (tall ? 4 : 3), Zw + 3, g); B(x + 1, y + (tall ? 5 : 4), Zw + 2, x + 1, y + (tall ? 5 : 4), Zw + 3, HV.woodL);
    }
  });
  for (const x of [X0 + 1, X1 - 1]) for (const y of [5, 12, 19]) B(x, y - 1, Zw + 1, x, y, Zw + 3, HV.woodD);
  // the drying pole in front on two posts, bundles of herbs hung along it (five kinds in a fixed order, the cut ends darker)
  for (const x of [X0, X1 - 1]) B(x, 0, Zr, x + 1, 24, Zr + 1, HV.post);
  B(X0 - 2, 24, Zr, X1 + 1, 24, Zr + 1, HV.woodL);
  for (let x = X0 + 3, i = 0; x <= X1 - 3; x += 3, i++) {
    const col = K.herbs[i % K.herbs.length], len = 4 + (i % 3);
    B(x, 23, Zr, x, 23, Zr, HV.rope); B(x, 23 - len, Zr, x + 1, 22, Zr + 1, col); B(x, 23 - len, Zr, x + 1, 23 - len, Zr + 1, HV.thD);
  }
  // two big storage jars at the ends of the shelves
  const J = loc(w, 0, 0, 0); jar(J, X0 - 4, Zw + 7, 1, false, { lid: true }); jar(J, X1 + 1, Zp + 6, 1, true);
}
/** the straw mat on the ground, along z (cells X0..X1 × Z0..Z1): a bound dark edge, woven rows every 3 cells across it, a wooden headrest
 *  at the back end, an old blood stain, an indigo quilt folded at the foot */
export function mat(c: Ctx, X0: number, X1: number, Z0: number, Z1: number) {
  const w = c.w, B = boxOf(w);
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) w.set(x, 0, z, x === X0 || x === X1 || z === Z0 || z === Z1 ? HV.strawD : (z - Z0) % 3 === 0 ? 0xb89c5c : HV.straw);
  B(X0 + 3, 1, Z0 + 2, X1 - 3, 2, Z0 + 4, HV.wood); B(X0 + 3, 2, Z0 + 2, X1 - 3, 2, Z0 + 4, HV.woodL);
  recolor(w, X0 + 3, 0, Z0 + 12, X0 + 6, 0, Z0 + 15, K.stain);
  B(X0 + 1, 1, Z1 - 3, X1 - 1, 2, Z1 - 1, HV.indigo); B(X0 + 1, 2, Z1 - 3, X1 - 1, 2, Z1 - 3, HV.indigoL);
}
/** a little clay stove (cells): an earth block, a glowing mouth, a clay pot with a wooden lid on top. Returns the fire and the pot top */
export function medStove(c: Ctx, X: number, Z: number, lit: boolean) {
  const B = loc(c.w, X, Z, 0);
  earth(B, -5, 0, -4, 5, 7, 4); B(-5, 7, -4, 5, 7, 4, HV.earthL);
  B(-2, 1, 4, 1, 3, 4, lit ? HV.ember : HV.dark, lit ? 1 : 0); B(-3, 4, 5, 2, 4, 5, K.stone);
  disc(B, 0, 0, 3, 8, 12, HV.clay); disc(B, 0, 0, 3, 12, 12, HV.clayL); disc(B, 0, 0, 2, 13, 13, HV.woodL); B(0, 14, 0, 0, 14, 0, HV.woodD);
  return { fire: [(X + 0.5) * CELL, 0.15, (Z + 4.5) * CELL] as [number, number, number], steam: [(X + 0.5) * CELL, 1.05, (Z + 0.5) * CELL] as [number, number, number] };
}
/** a low table (案) with a cloth roll of needles laid open, a bowl and a small mortar (cells) */
export function lowTable(c: Ctx, X: number, Z: number) {
  const B = loc(c.w, X, Z, 0);
  for (const [a, b] of [[-6, -3], [5, -3], [-6, 2], [5, 2]]) B(a, 0, b, a, 3, b, HV.woodD);
  B(-7, 4, -4, 6, 4, 3, HV.wood); B(-7, 4, 3, 6, 4, 3, HV.woodD);
  B(-5, 5, -2, 0, 5, 1, HV.hemp); for (let x = -4; x <= -1; x++) B(x, 5, -2, x, 5, 0, 0xdde2ea); B(-5, 5, 1, 0, 5, 1, HV.hempD);
  disc(B, 3, 0, 3, 5, 5, HV.strawD); disc(B, 3, 0, 2, 5, 5, K.herbs[2]); B(2, 6, -1, 3, 6, 0, K.herbs[1]);
}

// ------------------------------------------------------------------ 试剑坪: a bell post
/** a training post at cell (X, Z): a round stone foot, a 2 × 2 post with two straw-bound bands, a dark cap; an arm out toward (dx, dz)
 *  (one of the four axes) and on its end a bronze bell on a cord (shoulder, body, a dark lip, the clapper below) */
export function bellPost(c: Ctx, X: number, Z: number, dx: number, dz: number) {
  const B = loc(c.w, X, Z, 0);
  disc(B, 0, 0, 2, 0, 0, K.stoneD); B(-1, 1, -1, 0, 22, 0, HV.wood); B(-1, 1, -1, -1, 22, -1, HV.woodD);
  for (const y of [7, 15]) B(-1, y, -1, 0, y + 1, 0, HV.strawD);
  B(-2, 23, -2, 1, 23, 1, HV.post);
  // the arm (2 × 2, out of the post's top) toward the yard, the bell's 2 × 2 core under its end: cord, shoulder, a 4 × 4 body, lip
  const [bx, bz] = dx > 0 ? [5, 0] : dx < 0 ? [-5, 0] : dz > 0 ? [0, 5] : [0, -5];
  if (dx > 0) B(1, 21, -1, 6, 22, 0, HV.woodD); else if (dx < 0) B(-7, 21, -1, -2, 22, 0, HV.woodD); else if (dz > 0) B(-1, 21, 1, 0, 22, 6, HV.woodD); else B(-1, 21, -7, 0, 22, -2, HV.woodD);
  B(bx, 20, bz, bx, 20, bz, HV.rope); B(bx - 1, 17, bz - 1, bx, 19, bz, K.bronzeL); B(bx - 2, 14, bz - 2, bx + 1, 16, bz + 1, K.bronze); B(bx - 2, 14, bz - 2, bx + 1, 14, bz + 1, K.bronzeD);
  B(bx, 13, bz, bx, 13, bz, K.ironD); B(bx, 11, bz, bx, 12, bz, HV.red);
}

/** a rack of practice weapons along z at cell X (Z0..Z0+20), facing +x: two posts, two rails, four staffs and two wooden swords */
export function practiceRack(c: Ctx, X: number, Z0: number) {
  const B = boxOf(c.w);
  for (const z of [Z0, Z0 + 20]) B(X, 0, z, X + 1, 20, z + 1, HV.post);
  B(X + 1, 7, Z0, X + 1, 8, Z0 + 21, HV.woodD); B(X + 1, 17, Z0, X + 1, 18, Z0 + 21, HV.woodD);
  for (const z of [Z0 + 3, Z0 + 6, Z0 + 9, Z0 + 12]) B(X + 2, 0, z, X + 2, 28, z, (z - Z0) % 2 ? HV.woodL : HV.wood);
  for (const z of [Z0 + 15, Z0 + 18]) { B(X + 2, 0, z, X + 2, 4, z, HV.woodD); B(X + 2, 5, z - 1, X + 2, 5, z + 1, HV.woodD); B(X + 2, 6, z, X + 2, 19, z, 0xb89870); }
}
/** a stone lock (石锁) at cell (X, Z): a block with a looped handle on top */
export function stoneLock(c: Ctx, X: number, Z: number) {
  const B = boxOf(c.w);
  B(X - 2, 0, Z - 1, X + 1, 3, Z + 1, K.stone); B(X - 2, 3, Z - 1, X + 1, 3, Z + 1, K.stoneL); B(X - 2, 4, Z, X + 1, 5, Z, K.stoneD); B(X - 1, 4, Z, X, 4, Z, null);
}

// ------------------------------------------------------------------ the stone steps up the terrace (石阶)
/** three broad steps up to the terrace, front edge at cell row Zf, centred on X, w cells wide, each step `rise` cells up and `run` deep;
 *  stone cheek walls each side stepping with them; vertical joints between the slabs, the worn front edge of each tread lighter */
export function steps(c: Ctx, X: number, Zf: number, hw: number, rise: number, run: number) {
  const B = boxOf(c.w);
  for (let i = 0; i < 3; i++) {
    const z0 = Zf - (i + 1) * run + 1, z1 = Zf - i * run, y1 = (i + 1) * rise - 1;
    B(X - hw, 0, z0, X + hw - 1, y1, z1, K.stone); B(X - hw, y1, z1, X + hw - 1, y1, z1, K.stoneL); B(X - hw, 0, z1, X + hw - 1, 0, z1, K.stoneD);
    for (const j of [-Math.round(hw / 3), Math.round(hw / 3)]) B(X + j, 0, z1, X + j, y1 - 1, z1, K.stoneD);
    for (const s of [-1, 1]) { const a = s < 0 ? X - hw - 3 : X + hw; B(a, 0, z0, a + 2, y1 + 2, z1, K.stoneD); B(a, y1 + 2, z0, a + 2, y1 + 2, z1, K.stone); }
  }
}

// ------------------------------------------------------------------ the hill behind: rammed-earth terraces
/** one terrace (cells x0..x1, front row z1 back to z0, top at y = h): only its shell (a 3-cell front, a 2-cell top: nothing inside is
 *  ever seen) — a stone footing, tamped courses, a grassy top in two tones by big patch */
export function terrace(c: Ctx, x0: number, x1: number, z0: number, z1: number, h: number, grass: readonly number[], seed: number) {
  const w = c.w;
  for (let x = x0; x <= x1; x++) {
    for (let y = -1; y <= h - 1; y++) for (let z = z1 - 2; z <= z1; z++) w.set(x, y, z, y <= 2 ? (y === 2 ? K.stoneL : K.stone) : (y - 3) % 6 === 5 ? K.faceS : K.face);
    for (let z = z0; z <= z1; z++) { const p = hash(Math.floor((x + 600) / 23), Math.floor((z + 600) / 17), seed); w.set(x, h, z, p < 0.55 ? grass[0] : p < 0.85 ? grass[1] : grass[2]); w.set(x, h - 1, z, HV.earthD); }
  }
}

// ------------------------------------------------------------------ water: the culvert mouth and the channel
/** the dark culvert mouth in the terrace face (front at row Zf, centred on X): a dressed-stone face, a stepped arch over a black hole,
 *  water running out of it */
export function culvert(c: Ctx, X: number, Zf: number) {
  const B = boxOf(c.w);
  B(X - 10, -1, Zf - 2, X + 9, 12, Zf, K.stone); B(X - 10, 12, Zf - 2, X + 9, 12, Zf, K.stoneL);
  B(X - 6, -1, Zf - 2, X + 5, 5, Zf, null); B(X - 4, 6, Zf - 2, X + 3, 7, Zf, null); B(X - 6, -1, Zf - 3, X + 5, 7, Zf - 3, K.hole);
  B(X - 7, 6, Zf, X - 7, 6, Zf, K.stoneL); B(X + 6, 6, Zf, X + 6, 6, Zf, K.stoneL); B(X - 5, 8, Zf, X + 4, 8, Zf, K.stoneL);
}
/** the stone-lined channel (cells X0..X1 across, Z0..Z1 along): the floor removed, a dark bed below, stone kerbs one cell proud on both
 *  banks with joints every 9 cells, the water plane */
export function channel(c: Ctx, X0: number, X1: number, Z0: number, Z1: number) {
  const w = c.w, B = boxOf(w);
  B(X0, -1, Z0, X1, -1, Z1, null); B(X0, -2, Z0, X1, -2, Z1, K.bed);
  for (const x of [X0 - 2, X1 + 1]) { B(x, -1, Z0, x + 1, 0, Z1, K.stone); for (let z = Z0; z <= Z1; z += 9) B(x, 0, z, x + 1, 0, z, K.stoneD); }
  c.water(X0 * CELL, Z0 * CELL, (X1 + 1) * CELL, (Z1 + 1) * CELL, K.water);
}
/** a rail fence along z at cell X (Z0..Z1): posts every 13 cells, a top rail and a mid rail */
export function railing(c: Ctx, X: number, Z0: number, Z1: number) {
  const B = boxOf(c.w);
  for (let z = Z0; z <= Z1; z += 13) B(X, 0, z, X + 1, 12, z + 1, HV.post);
  B(X, 12, Z0, X + 1, 12, Z1 + 1, HV.woodL); B(X, 7, Z0, X, 7, Z1 + 1, HV.woodD);
}

// ------------------------------------------------------------------ 杜五's cart (黑篷车), side-on along x
/** the cart at cell (X, Z), its shafts toward −x propped on a trestle: two solid wheels, the plank bed, the black hood over three
 *  hoops (three wide tiers in black cloth, the hoops as dark wood bands, the open back dark inside), a sack and a jar in the tail */
export function cart(c: Ctx, X: number, Z: number) {
  const B = loc(c.w, X, Z, 0);
  cartWheel(B, 2, 10, 10, 10, 1); cartWheel(B, 2, 10, -10, 10, 1);
  B(1, 9, -9, 3, 10, 9, HV.woodD);
  B(-18, 11, -8, 20, 12, 8, HV.woodL); for (let a = -15; a <= 18; a += 6) B(a, 12, -8, a, 12, 8, HV.wood);
  B(-18, 13, -8, 20, 15, -8, HV.wood); B(-18, 13, 8, 20, 15, 8, HV.wood);
  // the hood: three tiers, each stepping in more than it rises; the three hoops as dark bands round it; the open back end dark
  B(-14, 16, -9, 18, 22, 9, K.hood); B(-14, 23, -7, 18, 26, 7, K.hood); B(-14, 27, -4, 18, 28, 4, K.hood);
  B(-14, 22, -9, 18, 22, 9, K.hoodL); B(-14, 26, -7, 18, 26, 7, K.hoodL); B(-14, 28, -4, 18, 28, 4, K.hoodL);
  for (const a of [-14, 2, 18]) { B(a, 16, -9, a, 22, 9, HV.woodD); B(a, 23, -7, a, 26, 7, HV.woodD); B(a, 27, -4, a, 28, 4, HV.woodD); }
  B(18, 16, -7, 18, 21, 7, K.hoodD); B(18, 22, -5, 18, 25, 5, K.hoodD);
  B(-14, 16, -7, -14, 21, 7, K.hoodD);
  // the shafts out to −x onto a trestle, a lantern hook
  for (const b of [-6, 5]) B(-34, 11, b, -19, 12, b + 1, HV.wood);
  B(-31, 0, -8, -30, 10, -7, HV.woodD); B(-31, 0, 7, -30, 10, 8, HV.woodD); B(-31, 10, -8, -30, 10, 8, HV.woodD);
  // the tail: a sack and a jar on the tail board
  B(19, 13, -6, 24, 18, -1, HV.hemp); B(20, 19, -5, 23, 19, -2, HV.hempD);
  const J = loc(c.w, X + 21, Z + 3, 0); const Jy = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number | null, g?: number) => J(x0, y0 + 13, z0, x1, y1 + 13, z1, col, g);
  jar(Jy, 0, 0, 0, true, { lid: true });
  B(21, 11, -8, 24, 12, 8, HV.woodL);
}
/** a hay rack and a stone trough by the cart (cells): the donkey's corner */
export function feed(c: Ctx, X: number, Z: number) {
  const B = loc(c.w, X, Z, 0);
  B(-8, 0, -3, 8, 5, 3, K.stone); B(-6, 3, -1, 6, 5, 1, null); B(-6, 3, -1, 6, 3, 1, K.water); B(-8, 5, -3, 8, 5, -3, K.stoneL);
  B(-10, 0, 6, -3, 4, 12, HV.straw); B(-9, 5, 7, -4, 6, 11, HV.strawL); B(-10, 0, 6, -3, 0, 12, HV.strawD);
}

// ------------------------------------------------------------------ the front: the low wall, the gate posts, the broken stele
/** the low broken front wall (rammed earth, a thatch coping) from cell x0 to x1 at row Z (two runs either side of the gate), the gate's
 *  two posts on stone plinths (the left one snapped), the fallen lintel on the ground, and outside the gate the broken stele the place
 *  is named for: its standing stump on a stone base and its top half (the stepped crown) lying flat beside it */
export function frontGate(c: Ctx, x0: number, gx0: number, gx1: number, x1: number, Z: number) {
  const w = c.w, B = boxOf(w), F = loc(w, 0, Z, 0);
  yardWall(F, x0, gx0 - 4, 0, 7, { drops: [[x0 + 30, x0 + 52, 3], [gx0 - 30, gx0 - 14, 4]] });
  yardWall(F, gx1 + 4, x1, 0, 7, { drops: [[gx1 + 26, gx1 + 44, 4], [x1 - 22, x1, 3]] });
  const pa = gx0 - 3, pb = gx1 + 1;
  for (const x of [pa, pb]) { B(x - 1, 0, Z - 2, x + 3, 2, Z + 2, K.stoneD); B(x, 3, Z - 1, x + 2, 29, Z + 1, HV.post); B(x, 3, Z + 1, x + 2, 29, Z + 1, HV.woodD); }
  B(pa - 4, 30, Z - 1, pb + 6, 31, Z + 1, HV.woodD); B(pa, 27, Z - 1, pb + 2, 27, Z, HV.wood);
  B(pa - 6, 32, Z - 3, pb + 8, 32, Z + 3, HV.tileD); B(pa - 5, 33, Z - 2, pb + 7, 33, Z + 2, HV.tile); B(pa - 3, 34, Z - 1, pb + 5, 34, Z + 1, HV.tileD);
  for (let x = pa - 5; x <= pb + 7; x += 3) B(x, 32, Z + 3, x, 32, Z + 3, HV.tileL);
  // a leaf fallen flat outside, the other swung in against the wall
  B(gx0 + 1, 0, Z + 4, gx0 + 15, 0, Z + 13, HV.wood); for (const k of [6, 10]) B(gx0 + 1, 0, Z + k, gx0 + 15, 0, Z + k, HV.woodD);
  B(pb - 1, 0, Z - 14, pb, 25, Z - 3, HV.wood); for (const y of [5, 18]) B(pb - 1, y, Z - 14, pb - 1, y, Z - 3, HV.woodD);
}
// ------------------------------------------------------------------ 杜五's cook-fire
/** the cook-fire at cell (X, Z): eight stones in a ring round an ash bed, embers under three logs (two along x, one across), a pot
 *  hanging from a bar on two posts (a light rim, a wooden lid). Returns the fire point and the lid (metres) */
export function cookFire(c: Ctx, X: number, Z: number, lit: boolean) {
  const B = loc(c.w, X, Z, 0);
  B(-5, -1, -5, 4, -1, 4, HV.ash); B(-3, -1, -3, 2, -1, 2, HV.ashL);
  for (const [a, b] of [[-7, -2], [-7, 1], [6, -2], [6, 1], [-2, -7], [1, -7], [-2, 6], [1, 6]]) B(a, 0, b, a + 1, 1, b + 1, (a + b) & 1 ? K.stone : K.stoneD);
  B(-2, 0, -2, 1, 0, 1, lit ? HV.ember : HV.char, lit ? 1 : 0); if (lit) B(-1, 0, -1, 0, 0, 0, HV.emberL, 1);
  B(-4, 1, -2, 3, 1, -2, HV.char); B(-4, 1, 1, 3, 1, 1, HV.charL); B(-1, 2, -4, 0, 2, 3, 0x5a4632);
  for (const s of [-1, 1]) B(s * 9 - (s > 0 ? 1 : 0), 0, 0, s * 9 + (s > 0 ? 0 : 1), 17, 0, HV.post);
  B(-9, 18, 0, 9, 18, 0, HV.woodD); B(0, 14, 0, 0, 17, 0, K.ironD);
  B(-3, 6, -3, 2, 11, 2, K.iron); B(-3, 11, -3, 2, 11, 2, K.ironL); B(-2, 5, -2, 1, 5, 1, K.ironD); B(-2, 12, -2, 1, 12, 1, HV.woodL); B(-1, 13, -1, 0, 13, 0, HV.woodD);
  return { fire: [(X + 0.5) * CELL, 0.25, (Z + 0.5) * CELL] as [number, number, number], lid: [(X + 0.5) * CELL, 0.95, (Z + 0.5) * CELL] as [number, number, number] };
}

// ------------------------------------------------------------------ a paper lantern
/** a paper lantern hanging at cell (X, Z) from y = top: a cord, a dark wooden cap and foot, the paper body (glowing when lit: a warm
 *  middle band, the ribs darker), a red tassel under it */
export function lantern(c: Ctx, X: number, top: number, Z: number, lit: boolean) {
  const B = boxOf(c.w), y1 = top - 2, y0 = y1 - 4, g = lit ? 1 : 0;
  B(X, top - 1, Z, X, top, Z, HV.rope); B(X - 1, y1, Z - 1, X + 1, y1, Z + 1, HV.woodD);
  B(X - 1, y0, Z - 1, X + 1, y1 - 1, Z + 1, lit ? 0xd88a3e : 0xd0c098, g); B(X - 1, y0 + 1, Z - 1, X + 1, y0 + 2, Z + 1, lit ? 0xe8a852 : 0xdcd0ac, g);
  B(X - 1, y0, Z - 1, X + 1, y0, Z + 1, HV.woodD); B(X, y0 - 2, Z, X, y0 - 1, Z, HV.red);
}

// ------------------------------------------------------------------ pigeons (白鸽) on a wall top
/** a white pigeon sitting at cell (X, Y, Z) facing ±x: body, a grey wing band, the head, a dark beak */
export function pigeon(c: Ctx, X: number, Y: number, Z: number, f: 1 | -1) {
  const B = boxOf(c.w);
  B(X - 2, Y, Z, X + 1, Y + 1, Z + 1, 0xeeeef0); B(X - 2, Y + 1, Z, X, Y + 1, Z + 1, 0xb8bcc4); B(X + (f > 0 ? 1 : -2), Y + 2, Z, X + (f > 0 ? 1 : -2), Y + 2, Z + 1, 0xeeeef0);
  B(X + (f > 0 ? 2 : -3), Y + 2, Z, X + (f > 0 ? 2 : -3), Y + 2, Z, 0x3a3030); B(X + (f > 0 ? -3 : 2), Y + 1, Z, X + (f > 0 ? -3 : 2), Y + 1, Z + 1, 0x9aa0aa);
}
