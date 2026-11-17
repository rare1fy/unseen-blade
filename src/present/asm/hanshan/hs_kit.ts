// 寒山坞（熹平六年腊月，开场冷开头）的道具库：铸坊（敞口的打铁作坊：炉、风箱、铁砧、淬火槽、生石灰桶、炭堆、刀坯架、工具墙、
// 挂灯）、山体（一格厚的壳子：只有外面看得见的面，省格子）、雪松（几层方台）、坞门、灯笼。
// 铁律同残村（hanmo/hj_village_kit.ts）：横平竖直的大块；坡面只用几层宽台阶，不做一格一格的斜阶；花纹只用夯层、砖缝、板缝、
// 岩层这些结构线，不用逐格随机色；每件东西两三档颜色。雪不在这里画：冬天的拼装会在每根露天格子柱的顶上盖一格雪（asm/season.ts）。
// 坐标：世界格（CELL = 7 厘米），y = 0 是地面上第一层格子；loc(w, X, Z, r) 的本地框里 front = 本地 +z。
import type { Ctx } from '../../scenes/stage';
import type { W } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { loc, locM, type Bx, type P3 } from '../../scenes/k_village';
import { HV, disc, roof } from '../hanmo/hj_village_kit';

/** 寒山坞的颜色：冷山岩、冻土、铸坊的砖和铁、炭、生石灰、刀坯 */
export const HS = {
  // mountain rock: the cliff face, its strata line, the lip under the snow
  rock: 0x58544e, rockD: 0x46433e, rockL: 0x6c675f,
  // frozen earth on the valley floor and the banks; the road's packed earth and its stone kerb
  soil: 0x5e5446, soilD: 0x4e4639, soilL: 0x6e6352, road: 0x6a5e4c, kerb: 0x6e6a62,
  // the forge floor (dark trodden earth, soot by the furnace)
  floor: 0x463c32, floorS: 0x2e2824,
  // fired clay brick of the furnace and its joints, the hot mouth
  brick: 0x6c4a3e, brickJ: 0x4e3a30, brickL: 0x7e5a4a, sootB: 0x2a2220,
  fire: 0xffb456, fireO: 0xe86424, fireD: 0xa8361a,
  // iron, the anvil's face, blades (raw black / ground grey), their edge
  iron: 0x34333a, ironL: 0x55545e, ironD: 0x222126, raw: 0x44464e, ground: 0xa4aab4, edge: 0xd4d8de,
  // charcoal
  coal: 0x24201f, coalL: 0x38322e,
  // quicklime (生石灰) and the wooden tub
  lime: 0xe4e0d6, limeD: 0xc4c0b6,
  // dressed stone (blocks under the bellows, the trough, the threshold)
  stone: 0x7a766e, stoneD: 0x5e5b55, stoneL: 0x928d84,
  // pine: dark needles, a lit top step, the hem, the trunk
  pine: 0x26352c, pineL: 0x34473a, pineD: 0x1c2822, bark: 0x3e3028,
};

/** world cells → metres (cell centre) */
export const cm = (X: number, Y: number, Z: number): P3 => [(X + 0.5) * CELL, (Y + 0.5) * CELL, (Z + 0.5) * CELL];
/** a box in world cells */
export const wbox = (w: W): Bx => (x0, y0, z0, x1, y1, z1, c, g = 0) => { w.box(x0, y0, z0, x1, y1, z1, c, g); };

// ------------------------------------------------------------------ mountain masses as shells
/**
 * A rock mass from y0 up to the top row y1, as a shell one cell thick: the top layer and the four side faces only (nothing inside — a
 * mountain the camera only ever sees from outside costs its surface, not its volume). Each side face starts at the row given in
 * `from` (the part below it is hidden behind a lower neighbour) or is left off with null (it butts against a taller one). The faces
 * carry a darker strata line every `strata` rows counted down from the top (so every mass shows the same rhythm under its snow lip)
 * and a lighter lip row at the top.
 */
export type Face = 'x0' | 'x1' | 'z0' | 'z1';
export function rockMass(w: W, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: { strata?: number; face?: number; top?: number; from?: Partial<Record<Face, number | null>> } = {}) {
  const face = o.face ?? HS.rock, st = o.strata ?? 14, top = o.top ?? HS.rockL, from = o.from ?? {};
  const col = (y: number) => (y === y1 - 1 ? top : (y1 - 1 - y) % st === st - 1 ? HS.rockD : face);
  const start = (f: Face) => { const v = from[f]; return v === null ? null : Math.max(y0, v ?? y0); };
  w.box(x0, y1, z0, x1, y1, z1, top);
  const s = { x0: start('x0'), x1: start('x1'), z0: start('z0'), z1: start('z1') };
  for (let y = y0; y < y1; y++) {
    const c = col(y);
    if (s.z0 != null && y >= s.z0) w.box(x0, y, z0, x1, y, z0, c);
    if (s.z1 != null && y >= s.z1) w.box(x0, y, z1, x1, y, z1, c);
    if (s.x0 != null && y >= s.x0) w.box(x0, y, z0, x0, y, z1, c);
    if (s.x1 != null && y >= s.x1) w.box(x1, y, z0, x1, y, z1, c);
  }
}

/**
 * Clear the cells inside a box that nothing can ever see: every one of their 26 neighbours is filled (so no face of theirs is open and
 * no open face's corner shading reads them). Thick rammed-earth walls and solid roof slabs keep their look and lose their middles —
 * the scene builds faster and holds less. Glowing cells stay.
 */
export function hollow(w: W, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  const out: Array<[number, number, number]> = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const c = w.get(x, y, z); if (!c || c.g > 0) continue;
    if (!w.has(x + 1, y, z) || !w.has(x - 1, y, z) || !w.has(x, y + 1, z) || !w.has(x, y - 1, z) || !w.has(x, y, z + 1) || !w.has(x, y, z - 1)) continue;
    let all = true;
    for (let dx = -1; dx <= 1 && all; dx++) for (let dy = -1; dy <= 1 && all; dy++) for (let dz = -1; dz <= 1; dz++) if (!w.has(x + dx, y + dy, z + dz)) { all = false; break; }
    if (all) out.push([x, y, z]);
  }
  for (const [x, y, z] of out) w.set(x, y, z, null);
  return out.length;
}

// ------------------------------------------------------------------ a snow pine (cells, so it can stand on a terrace)
/**
 * 雪松：a trunk on a short root flare carrying three or four flat square boughs stacked up it with a gap between them (the trunk shows
 * in the gaps), each bough an octagon of two rects (corners cut one step, never a pixel circle), narrower up the tree, its lower row a
 * darker hem and its top row lighter; a short spire. Stands on cell (X, Y, Z); h = height in cells. The winter pass lays a clean slab
 * of snow on every bough.
 */
export function snowPine(w: W, X: number, Y: number, Z: number, h: number, seed = 0) {
  const B = wbox(w), n = h >= 64 ? 4 : 3, base = Y + Math.round(h * 0.16), sp = Math.round((h * 0.78) / n), t = Math.max(4, Math.min(6, Math.round(sp * 0.4)));
  B(X - 2, Y, Z - 2, X + 1, Y + 1, Z + 1, HS.bark); B(X - 1, Y, Z - 1, X, base + (n - 1) * sp + t, Z, HS.bark);
  const R0 = Math.max(6, Math.round(h * 0.19));
  for (let i = 0; i < n; i++) {
    const r = Math.max(3, Math.round(R0 * (1 - 0.24 * i))), y0 = base + i * sp, y1 = y0 + t - 1;
    const cx = X + (((seed + i) & 1) ? 1 : 0), cz = Z + (((seed + i) & 2) ? 1 : 0), k = Math.max(1, Math.round(r * 0.35));
    const slab = (yy0: number, yy1: number, c: number) => { B(cx - r, yy0, cz - r + k, cx + r - 1, yy1, cz + r - 1 - k, c); B(cx - r + k, yy0, cz - r, cx + r - 1 - k, yy1, cz + r - 1, c); };
    slab(y0, y1, HS.pine); slab(y0, y0, HS.pineD); slab(y1, y1, HS.pineL);
  }
  const yt = base + (n - 1) * sp + t;
  B(X - 1, yt, Z - 1, X + 1, yt + Math.round(sp * 0.6), Z + 1, HS.pine); B(X - 1, yt + Math.round(sp * 0.6), Z - 1, X + 1, yt + Math.round(sp * 0.6), Z + 1, HS.pineL);
}

// ------------------------------------------------------------------ a hanging lantern
/** a paper lantern hanging from (X, top, Z): a cord, a dark cap and foot, a glowing body in two warm tones. Returns its centre */
export function lantern(w: W, X: number, top: number, Z: number, lit = true): P3 {
  const B = wbox(w), y1 = top - 2, y0 = y1 - 5, g = lit ? 1 : 0;
  B(X, top - 1, Z, X, top, Z, HV.rope);
  B(X - 1, y1, Z - 1, X + 1, y1, Z + 1, HV.woodD);
  B(X - 2, y0 + 1, Z - 1, X + 2, y1 - 1, Z + 1, lit ? 0x96481e : 0xd0c098, g); B(X - 1, y0 + 1, Z - 2, X + 1, y1 - 1, Z + 2, lit ? 0x96481e : 0xd0c098, g);
  B(X - 1, y0 + 2, Z - 2, X + 1, y0 + 3, Z + 2, lit ? 0xb0642a : 0xdcd0ac, g); B(X - 2, y0 + 2, Z - 1, X + 2, y0 + 3, Z + 1, lit ? 0xb0642a : 0xdcd0ac, g);
  B(X - 1, y0, Z - 1, X + 1, y0, Z + 1, HV.woodD); B(X, y0 - 2, Z, X, y0 - 1, Z, HV.red);
  return cm(X, y0 + 3, Z);
}

// ------------------------------------------------------------------ the village gate (坞门): two posts, a lintel with a little tile cap
/** across a road along z at cell Z, posts at X0 and X1; returns the lantern hook point (cells) on the left post's inner face */
export function gateFrame(w: W, X0: number, X1: number, Z: number, h: number) {
  const B = wbox(w);
  for (const x of [X0, X1]) { B(x - 2, -1, Z - 2, x + 2, 0, Z + 2, HS.stone); B(x - 1, 1, Z - 1, x + 1, h, Z + 1, HV.post); }
  B(X0 - 5, h + 1, Z - 2, X1 + 5, h + 3, Z + 2, HV.woodD); B(X0 - 4, h - 2, Z - 1, X1 + 4, h, Z + 1, HV.wood);
  B(X0 - 6, h + 4, Z - 4, X1 + 6, h + 4, Z + 4, HV.tileD); B(X0 - 6, h + 5, Z - 3, X1 + 6, h + 6, Z + 3, HV.tile);
  for (let x = X0 - 5; x <= X1 + 5; x += 3) B(x, h + 4, Z + 4, x, h + 4, Z + 4, HV.tileL);
  return { hookL: [X0 + 2, h - 3, Z] as [number, number, number], hookR: [X1 - 2, h - 3, Z] as [number, number, number] };
}

// ------------------------------------------------------------------ the forge (铸坊)
export interface ForgeOut {
  /** world metres: the furnace mouth (light), the chimney top (smoke), the lantern (over the trough corner), the front door (the open front's middle on the
   *  threshold), the floor point under the bellows where a crouching child fits (and the way she faces), the lime tub, the anvil top */
  fire: P3; chimney: P3; lamp: P3; door: P3; under: P3; underYaw: number; lime: P3; anvil: P3; bellows: P3; trough: P3;
}
/**
 * 铸坊：a smithy whose whole front stands open on timber posts (a corner post each side, one more off-centre so the bellows bay is
 * clear), brick-footed rammed-earth walls, a big three-tier tile roof with the furnace's brick stack through it.
 * Inside, seen from the front (local +x = the viewer's right):
 *   left  — the box bellows (风箱): a long low plank box along x with two iron bands, raised on two dressed-stone blocks 0.91 m high so
 *           the space between them is a dark hollow a crouching child fits in; the push-pull rod and its T grip at the left end, the clay
 *           pipe at the right end into the furnace's side; tongs and hammers on the left wall behind the smith's place;
 *   middle — the furnace (炉) against the back wall: a brick block with its mouth on the front glowing (two warm tones, coal lumps on
 *           the sill), a stepped brick hood narrowing up into the stack; the anvil on its stump in front of it;
 *   right  — the stone quench trough with dark water, the tub of quicklime (生石灰) beside it, a tiered charcoal heap against the back
 *           wall, a basket of charcoal by the furnace, the rack of unfinished blades (raw black and ground grey, ring pommels).
 * (X, Z) = the centre of the footprint in world cells, r = quarter turns of the front (1 = facing +x).
 */
export function forgeHouse(c: Ctx, X: number, Z: number, r: number): ForgeOut {
  const w = c.w, B = loc(w, X, Z, r), H = 38, M3 = (lx: number, y: number, lz: number) => locM(X, Z, r, lx, y, lz);
  // ---- footing, floor, threshold
  B(-61, -1, -39, 61, -1, 35, HS.floor);
  B(-61, -1, -39, 61, 0, -37, HS.stone); B(-61, -1, -39, -58, 0, 31, HS.stone); B(58, -1, -39, 61, 0, 31, HS.stone);
  B(-60, -1, 32, 60, -1, 36, HS.stoneL); B(-60, -1, 36, 60, -1, 36, HS.stoneD);
  B(-26, -1, -34, 10, -1, -14, HS.floorS);                                                         // soot on the floor round the furnace
  // ---- walls: brick to waist height, rammed earth above with tamped seams; an eave beam
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    B(x0, 1, z0, x1, 9, z1, HS.brick); for (const y of [3, 6]) B(x0, y, z0, x1, y, z1, HS.brickJ); B(x0, 9, z0, x1, 9, z1, HS.brickL);
    B(x0, 10, z0, x1, H, z1, HV.earth); for (let y = 15; y < H; y += 6) B(x0, y, z0, x1, y, z1, HV.earthS);
  };
  wall(-60, -39, 60, -37); wall(-61, -36, -58, 30); wall(58, -36, 61, 30);
  // ---- the open front: posts, a lintel beam, the eave beam's ends
  for (const [a, b] of [[-61, -57], [57, 61], [12, 15]] as const) { B(a, 1, 30, b, H, 33, HV.post); B(a, 0, 30, b, 0, 33, HS.stoneL); }
  B(-63, H - 3, 30, 63, H, 34, HV.woodD); B(-63, H - 3, 34, 63, H - 3, 34, HV.wood);
  // ---- the roof: three tile tiers over the whole house, eaves well out over the front
  const top = roof(B, -65, 65, -45, 41, H + 1, 'tile', { tiers: 3 });
  // ---- the furnace: x −20..4 against the back wall, 15 rows tall; mouth on the front
  B(-20, 0, -36, 4, 14, -19, HS.brick);
  for (const y of [3, 7, 11]) B(-20, y, -36, 4, y, -19, HS.brickJ);
  for (let a = -18; a <= 2; a += 6) B(a, 0, -19, a, 14, -19, HS.brickJ);
  B(-21, 14, -36, 5, 14, -18, HS.brickL);
  B(-13, 2, -23, -3, 9, -19, null);                                                                 // the mouth, recessed 5
  B(-13, 2, -24, -3, 9, -24, HS.fireD, 1); B(-12, 3, -24, -4, 8, -24, HS.fireO, 1); B(-10, 3, -24, -6, 6, -24, HS.fire, 1);
  B(-13, 2, -23, -3, 2, -19, HS.fireO, 1);                                                          // the hot bed
  B(-12, 3, -21, -9, 4, -19, HS.coal); B(-7, 3, -22, -4, 3, -20, HS.coalL); B(-10, 3, -23, -8, 3, -22, HS.coal);
  B(-14, 10, -19, -2, 10, -18, HS.ironL);                                                           // an iron lintel over the mouth
  B(-14, 1, -18, -2, 1, -16, HS.stoneD);                                                            // the stone sill in front
  // the hood (two steps in) and the stack up through the roof to above the ridge, a flat cap; soot round its top
  B(-19, 15, -36, 3, 18, -22, HS.brick); B(-19, 18, -36, 3, 18, -22, HS.brickJ);
  B(-16, 19, -36, 0, 23, -26, HS.brick); B(-16, 23, -36, 0, 23, -26, HS.brickJ);
  B(-13, 24, -36, -3, top + 6, -29, HS.brick); for (let y = 29; y < top + 6; y += 6) B(-13, y, -36, -3, y, -29, HS.brickJ);
  B(-14, top + 7, -37, -2, top + 7, -28, HS.brickL); B(-11, top + 7, -35, -5, top + 7, -30, HS.sootB);
  B(-13, top + 3, -36, -3, top + 6, -29, HS.sootB);
  // ---- the bellows: box x −46..−24, z −28..−19, rows 13..20; a stone block under each end (0.91 m clear between them); rod and T
  // grip on the left; clay pipe right
  B(-45, 0, -27, -42, 12, -20, HS.stoneD); B(-28, 0, -27, -25, 12, -20, HS.stoneD);
  B(-45, 12, -27, -42, 12, -20, HS.stone); B(-28, 12, -27, -25, 12, -20, HS.stone);
  B(-45, 0, -27, -42, 0, -20, 0x4a4743); B(-28, 0, -27, -25, 0, -20, 0x4a4743);
  B(-46, 13, -28, -24, 20, -19, 0x7a6248);
  B(-46, 16, -28, -24, 16, -19, 0x5a4636); B(-46, 20, -28, -24, 20, -19, 0x94785a);                // a plank seam, the lit top plank
  for (const a of [-41, -29]) B(a, 13, -28, a, 20, -19, HS.iron);                                    // two iron bands
  B(-47, 13, -28, -47, 20, -19, HV.woodD); B(-23, 13, -28, -23, 20, -19, HV.woodD);                 // the end boards
  B(-53, 16, -24, -48, 17, -23, HV.woodL); B(-55, 13, -26, -54, 20, -21, HV.woodD); B(-55, 20, -26, -54, 20, -21, HV.woodL);   // rod, T grip
  B(-22, 15, -25, -22, 17, -23, HV.clay); B(-21, 15, -25, -21, 17, -23, HV.clayD);                  // the pipe into the furnace
  // ---- tools on the left wall behind the smith's place: two pairs of tongs, two hammers on pegs
  B(-57, 26, -30, -57, 26, -10, HV.woodD);
  for (const [z, len] of [[-28, 14], [-24, 12]] as const) B(-57, 26 - len, z, -57, 26, z + 1, HS.iron);
  for (const z of [-18, -13]) { B(-57, 16, z, -57, 26, z, HV.woodL); B(-57, 15, z - 2, -57, 17, z + 2, HS.iron); }
  // ---- the anvil on its stump in front of the furnace, a hammer on its face
  disc(B, -6, -6, 4, 0, 4, 0x5a4632); disc(B, -6, -6, 4, 4, 4, 0xa48a5e); disc(B, -6, -6, 2, 4, 4, 0x8a7048);
  B(-9, 5, -8, -3, 5, -4, HS.ironD); B(-8, 6, -7, -4, 7, -5, HS.iron); B(-10, 8, -8, -2, 9, -4, HS.iron); B(-10, 9, -8, -2, 9, -4, HS.ironL);
  B(-12, 9, -7, -11, 9, -5, HS.iron); B(-11, 8, -7, -11, 8, -5, HS.iron);                         // the horn, a step down
  B(-7, 10, -6, -7, 10, -2, HV.woodL); B(-8, 10, -7, -6, 11, -6, HS.ironD);                          // a hammer on the face
  // ---- the quench trough (stone, dark water, a pair of tongs standing in it) and the tub of quicklime beside it
  B(14, 0, -7, 32, 7, 0, HS.stone); B(14, 7, -7, 32, 7, 0, HS.stoneL); B(14, 0, -7, 32, 0, 0, HS.stoneD);
  B(16, 4, -5, 30, 7, -2, null); B(16, 4, -5, 30, 4, -2, HV.water);
  B(27, 5, -4, 27, 14, -4, HS.iron); B(28, 5, -4, 28, 13, -4, HS.ironL);
  disc(B, 37, -3, 4, 0, 6, HV.wood); for (const y of [1, 5]) disc(B, 37, -3, 4, y, y, HS.iron);
  disc(B, 37, -3, 3, 6, 6, HS.lime); B(36, 7, -4, 38, 7, -2, HS.lime); B(35, 6, 0, 39, 6, 0, HS.limeD);
  B(40, 7, -3, 44, 7, -3, HV.woodL); B(39, 7, -4, 40, 8, -2, HV.woodD);                              // a wooden scoop across the rim
  // ---- charcoal: a tiered heap against the back wall right of the furnace, a wicker basket by the furnace
  B(8, 0, -36, 26, 4, -27, HS.coal); B(11, 5, -36, 23, 7, -30, HS.coal); B(14, 8, -36, 20, 9, -33, HS.coal);
  B(8, 4, -27, 26, 4, -27, HS.coalL); B(11, 7, -30, 23, 7, -30, HS.coalL); B(14, 9, -33, 20, 9, -33, HS.coalL);
  disc(B, 8, -13, 4, 0, 4, HV.strawD); disc(B, 8, -13, 4, 4, 4, HV.straw); disc(B, 8, -13, 3, 4, 5, HS.coal); B(7, 6, -14, 9, 6, -13, HS.coalL);
  // ---- the blade rack against the back wall: two posts, two rails, seven blades point up (raw black / ground grey with a bright
  // edge), ring pommels at the foot of three of them
  for (const a of [30, 54]) B(a, 0, -36, a + 1, 22, -34, HV.post);
  B(30, 6, -33, 55, 7, -33, HV.woodD); B(30, 17, -33, 55, 18, -33, HV.woodD);
  for (let i = 0; i < 7; i++) {
    const a = 33 + i * 3, raw = i % 2 === 0, h = 19 + (i % 3);
    B(a, 4, -34, a + 1, h, -34, raw ? HS.raw : HS.ground); if (!raw) B(a + 1, 4, -34, a + 1, h, -34, HS.edge);
    if (i % 3 === 1) { B(a - 1, 1, -34, a + 2, 3, -34, HS.ironL); B(a, 2, -34, a + 1, 2, -34, null); } else B(a, 1, -34, a + 1, 3, -34, HV.woodD);
  }
  // ---- the lantern under the front beam, over the bellows bay
  const lampC = (() => { const [lx, lz] = [44, 32]; const Bl = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number | null, g = 0) => B(x0, y0, z0, x1, y1, z1, col, g);
    Bl(lx, H - 5, lz, lx, H - 4, lz, HV.rope); Bl(lx - 1, H - 6, lz - 1, lx + 1, H - 6, lz + 1, HV.woodD);
    Bl(lx - 2, H - 11, lz - 1, lx + 2, H - 7, lz + 1, 0x96481e, 1); Bl(lx - 1, H - 11, lz - 2, lx + 1, H - 7, lz + 2, 0x96481e, 1);
    Bl(lx - 2, H - 10, lz - 1, lx + 2, H - 9, lz + 1, 0xb0642a, 1); Bl(lx - 1, H - 10, lz - 2, lx + 1, H - 9, lz + 2, 0xb0642a, 1);
    Bl(lx - 1, H - 12, lz - 1, lx + 1, H - 12, lz + 1, HV.woodD); Bl(lx, H - 14, lz, lx, H - 13, lz, HV.red);
    return M3(lx, H - 9, lz); })();
  void lampC;
  return forgePoints(X, Z, r, top);
}
/** the forge's anchor points (world metres) for a forge built at cell (X, Z) turned r; top = its ridge row (for the chimney) */
export function forgePoints(X: number, Z: number, r: number, top = 55): ForgeOut {
  const M3 = (lx: number, y: number, lz: number) => locM(X, Z, r, lx, y, lz), u = M3(-35, 0, -24);
  return {
    fire: M3(-8, 6, -17), chimney: M3(-8, top + 9, -32), lamp: M3(44, 29, 32), door: M3(-12, 0, 36),
    under: [u[0], 0, u[2]], underYaw: r * Math.PI / 2,
    lime: M3(37, 7, -3), anvil: M3(-6, 10, -6), bellows: M3(-35, 17, -23), trough: M3(23, 6, -3),
  };
}
