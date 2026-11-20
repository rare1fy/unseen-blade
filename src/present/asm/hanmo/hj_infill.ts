// 黄巾残村两处地点（残村、麦田）的「实地」（11-18 屋子形态）：
// 建筑结构原则（真村落逻辑、无围墙套小房、无双墙死巷、镜头边缘大建筑延伸出镜）：
//  1) 大块实地：直接以真实尺度的白灰木构正堂/酒肆替换 shapeBuild 的泥墙围框，屋面直接临街并向场地外缘延伸出镜（镜头只见局部，确立宏大比例）；
//  2) 窄条隔墙（1格宽 #）：清除双墙夹沟，统一砌成单道完整建筑体（草顶偏棚、低矮夯土麦场墙、火烧断垣或实心门墩），彻底消灭空心鞋盒与死巷；
//  3) 十字街按四象限区分功能与高低层次：西北大户粮仓正堂（高大青灰瓦顶+内凹木檐货棚）→ 东北村口酒肆哨所（敞开木廊+挂旗酒坛）→
//     西南低矮晒谷囤场（矮夯土墙+成排金麦捆，与大屋形成强烈高低反差）→ 东南火烧残院（半塌焦黑民居+断垣余烬）。
import type { Ctx } from '../../scenes/stage';
import { M } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { oak } from '../../scenes/flora';
import { LEAF_BY } from '../season';
import type { Locale, Place, Rect, SeasonId } from '../types';
import { HV, jar, frame, roof, earth, zhiling, stain, smoke } from './hj_village_kit';
import { banner } from './hj_village_props';
import { HC, cropOf, wheatBed, frame as fframe, thatch } from './hj_field_kit';
import { LANDMARKS as FIELD_LANDMARKS } from './hj_field_lm';

const night = (p: Place) => p.lamp > 0.3;

/** warm aged lime-plaster, weathered buff sandstone & neutral charcoal-clay tile palette (matching 02-environments.png & 04-combat-ui.png) */
export const PL = {
  wall: 0xc8b99c, wallS: 0xb5a689, wallD: 0x97886d,
  stone: 0x9c8e78, stoneD: 0x7e725e, stoneL: 0xb4a68e,
  cap: 0xb6a78c, capD: 0x8e7f67, capL: 0xcabca2,
  tile: 0x4b4849, tileD: 0x343233, tileL: 0x625f60, tileR: 0x3e3c3d,
};

/** Clear shapeBuild's perimeter mud walls inside a # rect PLUS any 1-cell overhanging coping rim left floating at y = 33..41 */
function clearShapeWalls(w: Ctx['w'], q: Rect, wc: number, dc: number) {
  const X0 = M(q.x0), Z0 = M(q.z0);
  w.box(X0, 0, Z0, X0 + wc - 1, 44, Z0 + dc - 1, null);
  // strip orphaned 1-cell wall-coping overhang just outside the # perimeter (never touches supported gateposts!)
  const trimRim = (wx: number, wz: number) => {
    if (w.has(wx, 32, wz) || w.has(wx, 28, wz)) return;
    for (let y = 33; y <= 42; y++) w.set(wx, y, wz, null);
  };
  for (let x = -1; x <= wc; x++) { trimRim(X0 + x, Z0 - 1); trimRim(X0 + x, Z0 + dc); }
  for (let z = 0; z < dc; z++) { trimRim(X0 - 1, Z0 + z); trimRim(X0 + wc, Z0 + z); }
}

/** Warm neutral charcoal-clay Han tile roof (zero cool slate-blue cast, 100% supported tiers, never floating) */
export function hallTileRoof(B: ReturnType<typeof frame>, x0: number, x1: number, z0: number, z1: number, y: number, tiers: 2 | 3 = 3, th = 4) {
  const D = z1 - z0 + 1, ins = tiers >= 3 ? [0, 0.2, 0.34] : [0, 0.28];
  let top = y;
  for (let i = 0; i < tiers; i++) {
    const k = Math.round(D * ins[i]), a = z0 + k, b = z1 - k, ya = y + i * th, yb = ya + th - 1;
    B(x0, ya, a, x1, yb, b, PL.tile);
    B(x0, yb, a, x1, yb, b, PL.tileL);
    B(x0, ya, a, x1, ya, a, PL.tileD);
    B(x0, ya, b, x1, ya, b, PL.tileD);
    B(x0, ya, a, x0, yb - 1, b, PL.tileD);
    B(x1, ya, a, x1, yb - 1, b, PL.tileD);
    for (let x = x0 + 1; x < x1; x += 3) {
      B(x, yb, a, x, yb, b, PL.tileD);
      B(x, ya + 1, a, x, ya + 1, a, PL.tileL);
      B(x, ya + 1, b, x, ya + 1, b, PL.tileL);
    }
    top = yb;
  }
  const zc = Math.round((z0 + z1) / 2);
  B(x0, top + 1, zc - 2, x1, top + 3, zc + 2, PL.tileR);
  B(x0, top + 3, zc - 1, x1, top + 3, zc + 1, PL.tileD);
  for (const e of [x0 - 1, x1 - 2]) B(e, top + 1, zc - 2, e + 3, top + 5, zc + 2, PL.tileR);
  return top + 5;
}

/** upright bound golden wheat sheaves (matching 04-combat-ui.png) */
function sheafRow(B: ReturnType<typeof frame>, x0: number, x1: number, zc: number, y0 = 0) {
  for (let x = x0; x + 8 <= x1; x += 10) {
    const h = 11 + ((Math.abs(x) * 3) % 3);
    B(x, y0, zc - 4, x + 7, y0 + h, zc + 4, HV.straw);
    B(x, y0, zc - 4, x + 7, y0 + 1, zc + 4, HV.strawD);
    B(x, y0 + h, zc - 4, x + 7, y0 + h, zc + 4, HV.strawL);
    B(x + 1, y0 + h + 1, zc - 3, x + 6, y0 + h + 1, zc + 3, HV.strawL);
    B(x, y0 + 4, zc - 4, x + 7, y0 + 4, zc + 4, HV.rope);
    B(x, y0 + h - 3, zc - 4, x + 7, y0 + h - 3, zc + 4, HV.rope);
  }
}

/** recessed open timber cargo lean-to / tavern veranda tucked cleanly INSIDE a # building footprint (zero floor collision intrusion!) */
function frontPorch(
  B: ReturnType<typeof frame>,
  x0: number, x1: number, z0: number, z1: number,
  kind: 'cargo' | 'tavern',
  lit: boolean,
) {
  const H = 24;
  // stone floor apron under the recessed porch
  B(x0, -1, z0, x1, -1, z1, PL.stoneD);
  B(x0, 0, z0, x1, 0, z1, PL.stone);
  // heavy timber veranda posts along the front street edge (z1 - 1..z1)
  const span = x1 - x0;
  const posts: number[] = [x0 + 1, x1 - 2];
  if (span > 44) posts.push(Math.round((x0 + x1) / 2));
  else if (span > 30) posts.push(Math.round(x0 + span * 0.5));
  for (const px of posts) {
    B(px - 1, 0, z1 - 2, px + 2, 2, z1, PL.stoneD);
    B(px - 1, 2, z1 - 2, px + 2, 2, z1, PL.stoneL);
    B(px, 3, z1 - 1, px + 1, H, z1, HV.post);
  }
  // front eave tie-beam & sloped warm timber awning roof
  B(x0, H - 1, z1 - 2, x1, H, z1, HV.woodD);
  B(x0 - 1, H + 1, z0, x1 + 1, H + 2, z1 + 2, HV.wood);
  B(x0 - 1, H + 2, z0, x1 + 1, H + 2, z1 + 2, HV.woodL);
  for (let x = x0 + 2; x <= x1 - 2; x += 5) B(x, H + 2, z0, x, H + 2, z1 + 2, HV.woodD);
  // interior functional storytelling under the awning
  const zBack = z0 + 2, zMid = Math.round((z0 + z1) / 2);
  if (kind === 'cargo') {
    // stacked wooden grain crates, hemp sacks, small leaning broom/handcart, and standing golden wheat sheaves (04-combat-ui.png!)
    if (span >= 28) {
      B(x0 + 4, 1, zBack, x0 + 13, 8, zBack + 7, HV.wood);
      B(x0 + 4, 8, zBack, x0 + 13, 8, zBack + 7, HV.woodL);
      B(x0 + 4, 4, zBack, x0 + 13, 4, zBack + 7, HV.woodD);
      B(x0 + 15, 1, zBack + 1, x0 + 24, 6, zBack + 7, HV.hemp);
      B(x0 + 16, 7, zBack + 2, x0 + 23, 10, zBack + 6, HV.hempD);
      if (x1 - (x0 + 28) >= 10) sheafRow(B, x0 + 28, x1 - 3, zMid, 1);
      // stone corner wheel-guard bollard (护墙石墩) right at the porch corner post
      B(x1 - 4, 1, z1 - 3, x1 - 1, 5, z1, PL.stone);
      B(x1 - 4, 5, z1 - 3, x1 - 1, 5, z1, PL.stoneL);
    } else {
      B(x0 + 3, 1, zBack, x0 + 11, 7, zBack + 6, HV.wood);
      B(x0 + 13, 1, zBack, Math.min(x1 - 3, x0 + 21), 5, zBack + 6, HV.hemp);
    }
  } else {
    // roadside tavern veranda: wooden serving counter, wine jars, wooden customer bench, protruding wine-flag pole, warm dusk lantern
    const mid = Math.round((x0 + x1) / 2);
    // wooden counter & bowls + stacked wine jars
    B(x0 + 6, 1, zBack, Math.min(mid - 6, x0 + 28), 7, zBack + 5, HV.wood);
    B(x0 + 5, 8, zBack - 1, Math.min(mid - 5, x0 + 29), 8, zBack + 6, HV.woodL);
    for (let bx = x0 + 9; bx <= Math.min(mid - 9, x0 + 24); bx += 7) B(bx, 9, zBack + 1, bx + 2, 10, zBack + 3, HV.greyL);
    // lived-in low wooden bench in front of the counter (inside the recessed veranda, zero floor collision!)
    B(x0 + 8, 1, z1 - 5, Math.min(mid - 8, x0 + 26), 1, z1 - 3, HV.woodD);
    B(x0 + 10, 1, z1 - 5, x0 + 11, 4, z1 - 3, HV.post);
    B(Math.min(mid - 10, x0 + 24), 1, z1 - 5, Math.min(mid - 9, x0 + 25), 4, z1 - 3, HV.post);
    B(x0 + 8, 5, z1 - 6, Math.min(mid - 8, x0 + 26), 5, z1 - 2, HV.woodL);
    for (let jx = mid + 6; jx <= x1 - 8; jx += 9) {
      jar(B, jx, zBack + 3, jx % 2 === 0 ? 1 : 0, true, { lid: true });
    }
    // hanging indigo tavern cloth (酒幌) + tall projecting timber signboard pole + stone corner bollard
    B(x0 + 5, H - 9, z1 + 1, x0 + 11, H - 2, z1 + 1, HV.indigo);
    B(x0 + 5, H - 11, z1 + 1, x0 + 8, H - 10, z1 + 1, HV.indigoL);
    B(x0 + 1, H - 3, z1, x0 + 2, H + 12, z1 + 1, HV.post);
    B(x0 + 2, H + 10, z1, x0 + 14, H + 11, z1 + 1, HV.woodD);
    B(x0 + 7, H + 2, z1 + 1, x0 + 13, H + 9, z1 + 1, HV.indigo);
    B(x0 + 9, H + 4, z1 + 1, x0 + 11, H + 7, z1 + 1, HV.hemp);
    B(x0 + 3, 1, z1 - 3, x0 + 6, 5, z1, PL.stone);
    B(x0 + 3, 5, z1 - 3, x0 + 6, 5, z1, PL.stoneL);
    if (lit) {
      B(mid - 1, H - 6, z1 - 1, mid + 1, H - 2, z1 + 1, 0xe8a852, 1);
      B(mid - 1, H - 1, z1 - 1, mid + 1, H - 1, z1 + 1, HV.woodD);
    }
  }
}

interface HallOpts {
  /** extensions BEYOND the # rect in cells (negative for W/N, positive for E/S) so grand halls bleed naturally off-camera! */
  extW?: number; extE?: number; extN?: number; extS?: number;
  H: number;
  roofKind?: 'tile' | 'thatch';
  tiers: 2 | 3;
  th?: number;
  porch?: { kind: 'cargo' | 'tavern'; x0: number; x1: number; depth: number };
  lit?: boolean;
  burnt?: 0 | 1;
  yellowBanner?: 'left' | 'right' | 'none';
}

/** Full-scale whitewashed lime-plaster & dark-timber Han hall replacing the # block directly (no enclosing mud wall cage!) */
function hanHall(c: Ctx, q: Rect, wc: number, dc: number, o: HallOpts) {
  const w = c.w, B = frame(w, q.x0, q.z0);
  const x0 = -(o.extW ?? 0), x1 = wc - 1 + (o.extE ?? 0);
  const z0 = -(o.extN ?? 0), z1 = dc - 1 + (o.extS ?? 0);
  const H = o.H, t = 4;

  // 1) erase shapeBuild's mud wall cage & any 1-cell overhanging coping rim so the building facade stands directly on the street!
  clearShapeWalls(w, q, wc, dc);
  // ground base under the full extended footprint (zero floating cells!)
  B(x0 - 4, -1, z0 - 4, x1 + 4, -1, z1 + 4, HV.earthD);

  // if there is a recessed front porch, pull that section of the front wall back by porch.depth (staying 100% inside #!)
  const porch = o.porch;
  const wallZ1 = (x: number) => (porch && x >= porch.x0 && x <= porch.x1 ? dc - 1 - porch.depth : z1);

  // 2) warm weathered sandstone plinth (y = 0..4)
  B(x0, 0, z0, x1, 3, z1, PL.stone);
  B(x0, 0, z0, x1, 0, z1, PL.stoneD);
  B(x0, 4, z0, x1, 4, z1, PL.stoneL);
  if (porch) B(porch.x0, 1, dc - porch.depth, porch.x1, 4, dc - 1, null);

  // 3) main hall whitewashed lime-plaster shell (y = 5..H)
  const mainZ1 = porch ? dc - 1 - porch.depth : z1;
  // full core back to mainZ1
  B(x0, 5, z0, x1, H, mainZ1, PL.wall);
  B(x0, 5, z0, x1, 7, mainZ1, PL.wallD);
  // hollow interior slightly only if burnt so fallen roof reveals ash & beams
  if (o.burnt === 1) {
    B(x0 + t, 5, z0 + t, x1 - t, H, mainZ1 - t, null);
    B(x0 + t, 4, z0 + t, x1 - t, 4, mainZ1 - t, HV.ash);
  }
  // if porch only covers part of the front width (e.g. NW Granary SE cargo bay), extend the non-porch front wing flush to z1!
  if (porch) {
    if (porch.x0 > x0 + 4) {
      B(x0, 5, mainZ1, porch.x0 - 1, H, z1, PL.wall);
      B(x0, 5, mainZ1, porch.x0 - 1, 7, z1, PL.wallD);
    }
    if (porch.x1 < x1 - 4) {
      B(porch.x1 + 1, 5, mainZ1, x1, H, z1, PL.wall);
      B(porch.x1 + 1, 5, mainZ1, x1, 7, z1, PL.wallD);
    }
  }

  // 4) dark-brown structural timber framing (corner columns, bay posts every ~34 cells, horizontal eave & mid beams)
  const colStep = 34;
  for (let x = x0; x <= x1; x += colStep) {
    const px = Math.min(x, x1 - 2), fz = wallZ1(px);
    B(px, 4, fz - 2, px + 2, H, fz, HV.post);
    B(px, 4, z0, px + 2, H, z0 + 2, HV.post);
  }
  // corner & porch-shoulder posts
  for (const px of [x0, x1 - 2, ...(porch ? [Math.max(x0, porch.x0 - 3), Math.min(x1 - 2, porch.x1 + 1)] : [])]) {
    const fz = wallZ1(px);
    B(px, 4, fz - 2, px + 2, H, fz, HV.post);
    B(px, 4, z0, px + 2, H, z0 + 2, HV.post);
  }
  // side street-facing timber posts along west/east gables
  for (const sx of [x0, x1 - 2]) {
    for (let z = z0 + 24; z <= z1 - 12; z += 30) B(sx, 4, z, sx + 2, H, z + 2, HV.post);
  }
  // horizontal timber eave beam & lower sill band along street faces
  B(x0, H - 2, mainZ1 - 2, x1, H, mainZ1, HV.woodD);
  if (porch) {
    if (porch.x0 > x0 + 4) B(x0, H - 2, z1 - 2, porch.x0 - 1, H, z1, HV.woodD);
    if (porch.x1 < x1 - 2) B(porch.x1 + 1, H - 2, z1 - 2, x1, H, z1, HV.woodD);
  }
  B(x0, H - 2, z0, x0 + 2, H, z1, HV.woodD);
  B(x1 - 2, H - 2, z0, x1, H, z1, HV.woodD);

  // 4b) Two-storey articulation (腰檐 + 二层木格气窗) when hall rises tall (H >= 46)
  if (H >= 46) {
    const midY = 29;
    B(x0 - 1, midY, mainZ1 - 1, x1 + 1, midY + 1, mainZ1 + 2, HV.woodD);
    B(x0 - 1, midY + 2, mainZ1, x1 + 1, midY + 2, mainZ1 + 3, o.roofKind === 'thatch' ? HV.th : PL.tile);
    B(x0 - 2, midY, z0, x0 + 1, midY + 2, z1, HV.woodD);
    B(x1 - 1, midY, z0, x1 + 2, midY + 2, z1, HV.woodD);
    for (let ux = 14; ux <= wc - 14; ux += 26) {
      const uz = wallZ1(ux);
      zhiling(B, ux, midY + 6, Math.min(H - 5, midY + 14), uz, 3, o.lit && !o.burnt ? HV.glow : HV.dark, o.lit && !o.burnt ? 1 : 0, 5);
    }
  }

  // 5) front facade doorway & lattice windows (straight from 04-combat-ui.png!)
  const lit = !!o.lit && !o.burnt;
  const doorX = porch ? Math.round((porch.x0 + porch.x1) / 2) : Math.round(wc * 0.5);
  const doorZ = porch ? mainZ1 : z1;
  // heavy plank doorway
  B(doorX - 7, 5, doorZ - 3, doorX + 7, 25, doorZ, null);
  B(doorX - 7, 5, doorZ - 4, doorX + 7, 25, doorZ - 4, lit ? HV.glow : HV.dark, lit ? 1 : 0);
  for (const s of [-1, 1]) B(doorX + s * 8, 5, doorZ - 2, doorX + s * 8 + (s > 0 ? 1 : -1), 26, doorZ + 1, HV.post);
  B(doorX - 10, 26, doorZ - 2, doorX + 10, 28, doorZ + 1, HV.woodD);
  // one wooden door leaf half-closed
  B(doorX - 6, 5, doorZ - 1, doorX - 1, 25, doorZ - 1, HV.wood);
  for (const y of [9, 17, 23]) B(doorX - 6, y, doorZ - 1, doorX - 1, y, doorZ - 1, HV.woodD);
  // wooden lattice windows on visible bays (inside 0..wc-1)
  const winSpots = [Math.round(wc * 0.22), Math.round(wc * 0.52), Math.round(wc * 0.80)].filter(wx => Math.abs(wx - doorX) > 18 && wx > 10 && wx < wc - 10);
  for (const wx of winSpots) {
    const wz = wallZ1(wx);
    zhiling(B, wx, 13, 22, wz, 3, lit ? HV.glow : HV.dark, lit ? 1 : 0, 5);
  }

  // 6) monumental overhanging roof (neutral charcoal-clay tile for grand halls, warm weathered thatch for tavern/secondary halls)
  const roofZ1 = porch && porch.x0 <= 2 && porch.x1 >= wc - 3 ? mainZ1 + 3 : z1 + 3;
  const rTop = o.roofKind === 'thatch'
    ? roof(B, x0 - 3, x1 + 3, z0 - 3, roofZ1, H + 1, 'thatch', { tiers: o.tiers, th: o.th ?? 4 })
    : hallTileRoof(B, x0 - 3, x1 + 3, z0 - 3, roofZ1, H + 1, o.tiers, o.th ?? 4);

  // 7) recessed porch awning & props (cargo lean-to or tavern veranda)
  if (porch) {
    frontPorch(B, porch.x0, porch.x1, dc - porch.depth, dc - 1, porch.kind, lit);
  }

  // 8) burnt half-collapsed treatment (for SE burned cottage)
  if (o.burnt === 1) {
    const cutX = Math.round(wc * 0.48);
    // carve away the west half of the roof & upper wall to reveal charred rafters, soot, & fallen rubble!
    B(x0 - 4, H + 1, z0 - 4, cutX, rTop + 4, roofZ1 + 2, null);
    B(x0, H - 10, z0, cutX - 6, H, z1, null);
    stain(w, M(q.x0), M(q.z0), 0, cutX + 1, H + 1, z0 - 4, cutX + 4, rTop + 2, roofZ1 + 2, HV.charL);
    stain(w, M(q.x0), M(q.z0), 0, x0, 12, z0, cutX + 2, H, z1, HV.soot);
    // exposed charred rafters spanning the open ruin
    for (let rx = x0 + 6; rx <= cutX - 2; rx += 9) B(rx, H - 10, z0 + 2, rx + 1, H - 9, z1 - 2, HV.char);
    // fallen charred beam & dark tile/plaster rubble inside the collapsed bay
    B(x0 + 6, 5, Math.round(dc * 0.45), cutX - 4, 7, Math.round(dc * 0.45) + 3, HV.char);
    B(x0 + 8, 5, 8, x0 + 22, 9, 18, PL.tileD);
    B(x0 + 10, 10, 10, x0 + 18, 11, 15, HV.ashL);
    smoke(c, [q.x0 + 2.2, 2.2, q.z0 + 1.8], { rate: 1.5, col: 0x625d58 });
  }

  // 9) optional Yellow Turban vertical banner accent at a visible street corner
  if (o.yellowBanner === 'left') banner(B, 6, dc - 4, H + 12, 9, 18);
  else if (o.yellowBanner === 'right') banner(B, wc - 8, dc - 4, H + 12, 9, 18);
}

/** Unified single-structure treatment for 1-cell-thick # strips (COMPLETELY eliminates double parallel walls & dead trenches!) */
function thinWallStructure(
  w: Ctx['w'], q: Rect, B: ReturnType<typeof frame>,
  wc: number, dc: number,
  kind: 'shed' | 'lowFarm' | 'burnedRuin' | 'solidPier',
  alongX: boolean,
  p: Place,
) {
  // first wipe shapeBuild's double parallel walls & overhanging coping rim cleanly
  clearShapeWalls(w, q, wc, dc);
  B(0, -1, 0, wc - 1, -1, dc - 1, HV.earthD);

  if (kind === 'shed' && alongX) {
    // Covered granary lean-to / thatched corridor wall: ONE solid back earth wall + timber front posts + continuous thatch roof + sheltered grain sacks!
    const H = 24;
    B(0, 0, 0, wc - 1, 2, 7, PL.stone);
    earth(B, 0, 3, 1, wc - 1, H, 6);
    // front timber posts facing the street
    for (let x = 2; x <= wc - 4; x += 26) {
      B(x, 0, dc - 4, x + 2, 2, dc - 2, PL.stoneD);
      B(x, 3, dc - 4, x + 2, H - 1, dc - 2, HV.post);
    }
    B(wc - 4, 0, dc - 4, wc - 2, 2, dc - 2, PL.stoneD);
    B(wc - 4, 3, dc - 4, wc - 2, H - 1, dc - 2, HV.post);
    B(0, H - 1, dc - 4, wc - 1, H, dc - 2, HV.woodD);
    // continuous warm thatched shed roof spanning cleanly over the full strip
    roof(B, -1, wc, -1, dc, H + 1, 'thatch', { tiers: 2, th: 3 });
    // sheltered grain crates & hemp sacks tucked cleanly inside
    for (let x = 8; x + 16 < wc - 4; x += 28) {
      B(x, 0, 9, x + 9, 7, 17, HV.wood);
      B(x, 7, 9, x + 9, 7, 17, HV.woodL);
      B(x + 11, 0, 10, x + 18, 5, 17, HV.hemp);
      B(x + 12, 6, 11, x + 17, 9, 16, HV.hempD);
    }
    return;
  }

  if (kind === 'lowFarm' && alongX) {
    // Low rustic farmyard wall (only 1.4m tall!) + stacked golden wheat sheaves on its inner shoulder -> dramatic low-profile contrast!
    const H = 19;
    B(0, 0, 2, wc - 1, 2, 10, PL.stone);
    B(0, 0, 2, wc - 1, 0, 10, PL.stoneD);
    earth(B, 0, 3, 3, wc - 1, H, 9);
    // warm buff sandstone coping blocks with a natural weathered break in the middle
    const br0 = Math.round(wc * 0.42), br1 = Math.round(wc * 0.62);
    B(0, H + 1, 2, wc - 1, H + 2, 10, PL.cap);
    B(0, H + 2, 3, wc - 1, H + 2, 9, PL.capL);
    for (let x = 8; x < wc - 4; x += 12) B(x, H + 1, 2, x, H + 2, 10, PL.capD);
    B(br0, H - 4, 2, br1, H + 2, 10, null);
    B(br0, H - 5, 3, br1, H - 5, 9, HV.earthL);
    // tight row of standing golden wheat sheaves, loose masonry stones & leaning cartwheel nestled along the low wall
    sheafRow(B, 4, wc - 18, dc - 8, 0);
    // weathered stone cluster & broken cartwheel tucked at the east end of the farm wall
    B(wc - 14, 0, dc - 10, wc - 6, 4, dc - 3, PL.stoneD);
    B(wc - 12, 5, dc - 9, wc - 8, 6, dc - 5, PL.stoneL);
    B(wc - 16, 0, dc - 6, wc - 15, 9, dc - 4, HV.woodD);
    B(wc - 17, 2, dc - 6, wc - 14, 7, dc - 4, HV.wood);
    // short timber fence posts at the west & east ends
    B(1, 0, dc - 5, 3, 14, dc - 3, HV.post);
    B(wc - 4, 0, dc - 5, wc - 2, 14, dc - 3, HV.post);
    return;
  }

  if (kind === 'burnedRuin' && alongX) {
    // Half-collapsed burned rammed-earth ruin wall: ONE thick soot-stained wall stepping down into rubble & charred beams
    const z0 = 9, z1 = 18;
    B(0, 0, z0 - 1, wc - 1, 2, z1 + 1, PL.stoneD);
    for (let x = 0; x < wc; x++) {
      const seg = Math.floor(x / 18);
      const h = seg === 0 ? 28 : seg === 1 ? 20 : seg === 2 ? 12 : seg === 3 ? 22 : 16;
      B(x, 3, z0, x, h, z1, seg % 2 === 1 ? HV.soot : HV.earth);
      if (h >= 24) B(x, h + 1, z0 - 1, x, h + 2, z1 + 1, PL.capD);
      else B(x, h, z0, x, h, z1, HV.earthL);
    }
    // fallen charred beam & grey broken tiles spilling across the ruin shoulder
    B(Math.round(wc * 0.25), 0, 2, Math.round(wc * 0.62), 3, 7, HV.char);
    B(Math.round(wc * 0.45), 0, z1 + 2, Math.round(wc * 0.72), 4, dc - 2, HV.earthD);
    B(Math.round(wc * 0.50), 5, z1 + 3, Math.round(wc * 0.64), 6, dc - 4, PL.tileD);
    return;
  }

  // solidPier (or vertical/compact 1-cell divider wall): ONE unified solid rammed-earth wall/pier with warm buff sandstone coping!
  const H = p.rnd(9) < 0.35 ? 24 : 30;
  if (alongX) {
    const z0 = Math.max(2, Math.floor(dc / 2) - 5), z1 = Math.min(dc - 3, z0 + 10);
    B(0, 0, z0 - 1, wc - 1, 2, z1 + 1, PL.stone);
    earth(B, 0, 3, z0, wc - 1, H, z1);
    B(0, H + 1, z0 - 1, wc - 1, H + 2, z1 + 1, PL.cap);
    B(0, H + 2, z0, wc - 1, H + 2, z1, PL.capL);
    for (let x = 8; x < wc - 4; x += 12) B(x, H + 1, z0 - 1, x, H + 2, z1 + 1, PL.capD);
  } else {
    const x0 = Math.max(2, Math.floor(wc / 2) - 5), x1 = Math.min(wc - 3, x0 + 10);
    const lowH = dc > 32 && p.rnd(8) < 0.5 ? 20 : H;
    B(x0 - 1, 0, 0, x1 + 1, 2, dc - 1, PL.stone);
    earth(B, x0, 3, 0, x1, lowH, dc - 1);
    B(x0 - 1, lowH + 1, 0, x1 + 1, lowH + 2, dc - 1, PL.cap);
    B(x0, lowH + 2, 0, x1, lowH + 2, dc - 1, PL.capL);
    for (let z = 8; z < dc - 4; z += 12) B(x0 - 1, lowH + 1, z, x1 + 1, lowH + 2, z, PL.capD);
    // tuck a straw bundle or jar cleanly on the wider shoulder if vertical strip is long enough
    if (dc >= 32) {
      B(x1 + 2, 0, 6, Math.min(wc - 2, x1 + 9), 10, 14, HV.straw);
      B(x1 + 2, 4, 6, Math.min(wc - 2, x1 + 9), 4, 14, HV.rope);
      B(x1 + 2, 10, 6, Math.min(wc - 2, x1 + 9), 10, 14, HV.strawL);
    }
  }
}

/** Village `#` infill: real-scale camera-bleeding Han halls, functional quadrant differentiation, and zero double-wall dead alleys! */
export function villageInfill(c: Ctx, f: { rect: Rect; p: Place; back: boolean; front: boolean; shape?: { box: Rect; fixed?: { id: string } } }) {
  const { rect: q, p } = f, w = c.w;
  const X0 = M(q.x0), X1 = M(q.x1) - 1, Z0 = M(q.z0), Z1 = M(q.z1) - 1;
  const B = frame(w, q.x0, q.z0), wc = X1 - X0 + 1, dc = Z1 - Z0 + 1;
  const W = q.x1 - q.x0, D = q.z1 - q.z0;
  const box = f.shape?.box;
  const roomId = f.shape?.fixed?.id;
  const touchesW = !!box && q.x0 <= box.x0 + 0.15;
  const touchesE = !!box && q.x1 >= box.x1 - 0.15;
  const touchesN = !!box && q.z0 <= box.z0 + 0.15;
  const touchesS = !!box && q.z1 >= box.z1 - 0.15;
  const midZ = box ? (box.z0 + box.z1) / 2 : 0;

  // --- 1) Crossroads bespoke functional-quadrant architecture (大/中/小层次 + 材质反差 + 镜头外延伸 + 三层望楼地标) ---
  if (roomId === 'crossroads') {
    // NW Primary Anchor: Towering 2-storey Grand Ancestral Granary Hall + 3-storey Timber Watchtower Landmark!
    if (touchesW && touchesN && W >= 8 && D >= 5) {
      hanHall(c, q, wc, dc, {
        extW: 78, extN: 70, H: 54, roofKind: 'tile', tiers: 3, th: 6,
        porch: { kind: 'cargo', x0: Math.max(10, wc - 54), x1: wc - 3, depth: 18 },
        lit: false, burnt: 0, yellowBanner: 'right',
      });
      // Iconic 3-storey Han timber village watchtower (三层木构谯楼/望楼, height ~6.7m = 96 voxels!) rising out of the NW hall corner
      const tx = Math.max(16, wc - 28), tz = Math.max(10, Math.floor(dc * 0.36));
      const tB = frame(w, q.x0, q.z0);
      // 2nd-storey recessed timber shaft rising cleanly from the hall roof (y = 54..74)
      tB(tx - 15, 52, tz - 15, tx + 15, 72, tz + 15, PL.wall);
      for (const a of [-15, 13]) for (const b of [-15, 13]) tB(tx + a, 52, tz + b, tx + a + 2, 74, tz + b + 2, HV.post);
      // lookout timber balcony & railing at y = 73..79
      tB(tx - 18, 73, tz - 18, tx + 18, 74, tz + 18, HV.woodD);
      for (const s of [-18, 18]) {
        tB(tx - 18, 75, tz + s, tx + 18, 78, tz + s, HV.wood);
        tB(tx + s, 75, tz - 18, tx + s, 78, tz + 18, HV.wood);
      }
      // 3rd-storey open watch pavilion posts + warm amber watch-lantern + crowning charcoal-tile hip roof (y = 75..98!)
      for (const a of [-12, 10]) for (const b of [-12, 10]) tB(tx + a, 75, tz + b, tx + a + 2, 87, tz + b + 2, HV.post);
      tB(tx - 10, 75, tz - 10, tx + 10, 86, tz + 10, HV.dark);
      tB(tx - 3, 79, tz + 11, tx + 3, 84, tz + 13, HV.glow, 1);
      hallTileRoof(tB, tx - 21, tx + 21, tz - 21, tz + 21, 88, 3, 4);
      banner(tB, tx + 15, tz + 16, 94, 10, 22);
      return;
    }
    // NE Secondary Anchor: Warm-Thatched Roadside Tavern & Yellow Turban Post (H=38, clear mid-height step below NW granary!)
    if (touchesE && touchesN && W >= 8 && D >= 4.5) {
      hanHall(c, q, wc, dc, {
        extE: 78, extN: 64, H: 38, roofKind: 'thatch', tiers: 2, th: 6,
        porch: { kind: 'tavern', x0: 4, x1: wc - 6, depth: 16 },
        lit: true, burnt: 0, yellowBanner: 'left',
      });
      return;
    }
    // SE Burned Half-Collapsed Cottage (camera-safe foreground height H=34, bleeds OFF-CAMERA South & East!)
    if (touchesE && touchesS && W >= 6 && D >= 3.2) {
      hanHall(c, q, wc, dc, {
        extE: 64, extS: 44, H: 34, roofKind: 'tile', tiers: 3, th: 5,
        lit: false, burnt: 1, yellowBanner: 'none',
      });
      return;
    }
    // Thin 1-cell horizontal partition walls in crossroads:
    if (D < 2.6 && W >= 4.0) {
      if (touchesW && q.z0 > midZ) {
        thinWallStructure(w, q, B, wc, dc, 'lowFarm', true, p);
      } else if (touchesE && q.z0 > midZ - 1.5) {
        thinWallStructure(w, q, B, wc, dc, 'burnedRuin', true, p);
      } else {
        thinWallStructure(w, q, B, wc, dc, 'shed', true, p);
      }
      return;
    }
    // Short 1-cell piers / SW east low wall
    if (W < 2.6 || D < 2.6) {
      if (touchesS && q.x0 < (box ? (box.x0 + box.x1) / 2 : 0)) {
        clearShapeWalls(w, q, wc, dc);
        B(0, -1, 0, wc - 1, -1, dc - 1, HV.earthD);
        const x0 = Math.floor(wc / 2) - 5, x1 = x0 + 9;
        B(x0 - 1, 0, 0, x1 + 1, 2, dc - 1, PL.stone);
        earth(B, x0, 3, 0, x1, 19, dc - 1);
        B(x0 - 1, 20, 0, x1 + 1, 21, dc - 1, PL.cap);
        B(x0, 21, 0, x1, 21, dc - 1, PL.capL);
        return;
      }
      thinWallStructure(w, q, B, wc, dc, 'solidPier', W >= D, p);
      return;
    }
  }

  // --- 1b) Courtyards (三进院): elevate the rear north Ancestral Shrine wall into a towering 2-storey double-eave Clan Shrine Landmark! ---
  if (roomId === 'courtyards' && touchesN && !touchesW && !touchesE && W >= 6 && D < 2.8) {
    clearShapeWalls(w, q, wc, dc);
    const z0 = -46, z1 = dc - 1;
    B(-6, -1, z0 - 4, wc + 5, -1, z1 + 2, HV.earthD);
    B(-4, 0, z0, wc + 3, 4, z1, PL.stone);
    // 1st-storey red-pillared clan shrine facade + glowing shrine doors
    B(-2, 5, z0, wc + 1, 36, z1, PL.wall);
    for (let x = 2; x <= wc - 4; x += 22) B(x, 5, z1 - 2, x + 2, 36, z1, 0x7c3428);
    B(Math.floor(wc / 2) - 10, 5, z1 - 2, Math.floor(wc / 2) + 10, 26, z1, HV.glow, 1);
    B(Math.floor(wc / 2) - 12, 27, z1 - 2, Math.floor(wc / 2) + 12, 29, z1 + 1, HV.woodD);
    // 1st-tier heavy skirt eave (腰檐)
    hallTileRoof(B, -10, wc + 9, z0 - 4, z1 + 5, 37, 2, 4);
    // 2nd-storey upper ancestral hall pavilion + crowning tall charcoal-tile hip roof (y = 45..82!)
    B(10, 45, z0 + 8, wc - 11, 66, z1 - 4, PL.wall);
    for (let x = 12; x <= wc - 14; x += 20) B(x, 45, z1 - 6, x + 2, 66, z1 - 4, 0x7c3428);
    B(Math.floor(wc / 2) - 12, 52, z1 - 5, Math.floor(wc / 2) + 12, 60, z1 - 3, HV.glow, 1);
    hallTileRoof(B, 2, wc - 3, z0 + 2, z1 + 1, 67, 3, 5);
    return;
  }

  // --- 1c) New Region 1 Bespoke Landmarks (hj_granary / hj_market / hj_alley) ---
  // Central 3-storey Grand Clan Granary in hj_granary (回字粮仓中央独栋三层大义仓!)
  if (roomId === 'hj_granary' && !touchesW && !touchesE && !touchesN && !touchesS && W >= 7 && D >= 7) {
    hanHall(c, q, wc, dc, {
      H: 48, roofKind: 'tile', tiers: 2, th: 5,
      porch: { kind: 'cargo', x0: 10, x1: wc - 11, depth: 15 },
      lit: true, burnt: 0, yellowBanner: 'right',
    });
    const tB = frame(w, q.x0, q.z0);
    const cx = Math.floor(wc * 0.5), cz = Math.floor(dc * 0.44);
    // 2nd-storey recessed granary clerestory + 3rd-storey watch cupola rising to ~6.7m!
    tB(cx - 24, 54, cz - 20, cx + 24, 72, cz + 20, PL.wall);
    for (const ax of [-24, 0, 22]) for (const az of [-20, 18]) tB(cx + ax, 54, cz + az, cx + ax + 2, 74, cz + az + 2, HV.post);
    tB(cx - 8, 60, cz + 19, cx + 8, 67, cz + 21, HV.glow, 1);
    const r2 = hallTileRoof(tB, cx - 30, cx + 30, cz - 26, cz + 26, 73, 2, 4);
    tB(cx - 12, r2 - 2, cz - 10, cx + 12, r2 + 12, cz + 10, HV.post);
    tB(cx - 10, r2 - 2, cz - 8, cx + 10, r2 + 11, cz + 8, PL.wall);
    tB(cx - 4, r2 + 2, cz + 8, cx + 4, r2 + 8, cz + 10, HV.glow, 1);
    hallTileRoof(tB, cx - 17, cx + 17, cz - 15, cz + 15, r2 + 13, 2, 4);
    banner(tB, cx + 22, cz + 18, 78, 10, 22);
    return;
  }
  // 2-storey Market Guild Hall / Opera Stage (残集墟市 · 北侧二层市楼戏台)
  if (roomId === 'hj_market' && touchesN && touchesW && W >= 8) {
    hanHall(c, q, wc, dc, {
      extW: 54, extN: 52, H: 46, roofKind: 'tile', tiers: 3, th: 5,
      porch: { kind: 'tavern', x0: 8, x1: wc - 8, depth: 18 },
      lit: false, burnt: 0, yellowBanner: 'right',
    });
    const tB = frame(w, q.x0, q.z0);
    const cx = Math.floor(wc * 0.52), cz = Math.max(8, Math.floor(dc * 0.35));
    // 2nd-storey open market drum-stage pavilion + hanging indigo & crimson curtains
    tB(cx - 22, 56, cz - 14, cx + 22, 72, cz + 14, PL.wall);
    for (const ax of [-22, -8, 6, 20]) tB(cx + ax, 56, cz + 12, cx + ax + 2, 73, cz + 14, 0x7c3428);
    tB(cx - 18, 57, cz + 14, cx + 18, 61, cz + 15, 0x7c3428);
    hallTileRoof(tB, cx - 28, cx + 28, cz - 20, cz + 20, 73, 2, 4);
    return;
  }
  // 3-storey Alley Watchtower Gatehouse (曲巷伏道 · 东北三层巷口谯楼)
  if (roomId === 'hj_alley' && touchesN && touchesE && W >= 7) {
    hanHall(c, q, wc, dc, {
      extE: 58, extN: 52, H: 46, roofKind: 'tile', tiers: 2, th: 5,
      porch: { kind: 'cargo', x0: 4, x1: Math.min(wc - 4, 42), depth: 15 },
      lit: true, burnt: 0, yellowBanner: 'left',
    });
    const tB = frame(w, q.x0, q.z0);
    const tx = Math.min(wc - 18, 28), tz = Math.max(10, Math.floor(dc * 0.42));
    tB(tx - 15, 52, tz - 14, tx + 15, 74, tz + 14, PL.wall);
    for (const a of [-15, 13]) for (const b of [-14, 12]) tB(tx + a, 52, tz + b, tx + a + 2, 76, tz + b + 2, HV.post);
    tB(tx - 18, 75, tz - 17, tx + 18, 77, tz + 17, HV.woodD);
    tB(tx - 10, 78, tz - 10, tx + 10, 88, tz + 10, HV.dark);
    tB(tx - 4, 80, tz + 10, tx + 4, 86, tz + 12, HV.glow, 1);
    hallTileRoof(tB, tx - 21, tx + 21, tz - 20, tz + 20, 89, 2, 4);
    banner(tB, tx - 14, tz + 15, 92, 10, 20);
    return;
  }

  // --- 2) Generic Village `#` blocks (courtyards, yard_1, random village shapes) ---
  // Narrow 1-cell strips: NEVER leave hollow double parallel walls!
  if (D < 2.6 && W >= 3.2) {
    thinWallStructure(w, q, B, wc, dc, p.rnd(1) < 0.55 ? 'shed' : 'lowFarm', true, p);
    return;
  }
  if (W < 2.6) {
    thinWallStructure(w, q, B, wc, dc, 'solidPier', false, p);
    return;
  }

  // Wide compound/building block: full-scale Han hall bleeding off any touched perimeter edge (taller on rear/flanks, camera-safe on south!)
  const burnt: 0 | 1 = p.rnd(1) < 0.3 ? 1 : 0;
  const big = W >= 8 && D >= 5;
  const tallRear = !touchesS && (touchesN || big || p.rnd(5) < 0.55);
  hanHall(c, q, wc, dc, {
    extW: touchesW ? 60 : 0,
    extE: touchesE ? 60 : 0,
    extN: touchesN ? 55 : 0,
    extS: touchesS && !f.back ? 32 : 0,
    H: touchesS ? 34 : (big ? 52 : (tallRear ? 48 : 40)),
    roofKind: big || p.rnd(3) < 0.6 ? 'tile' : 'thatch',
    tiers: big || tallRear ? 3 : 2,
    th: big || tallRear ? 6 : 5,
    porch: W >= 6.5 && D >= 4.2 && !burnt ? { kind: 'cargo', x0: Math.max(6, wc - 42), x1: wc - 3, depth: 14 } : undefined,
    lit: night(p) && !burnt,
    burnt,
    yellowBanner: p.rnd(4) < 0.5 ? 'right' : 'none',
  });
  // occasional autumn locust tree tucked outside an outer rear corner
  if (touchesN && !f.back && wc > 55 && p.rnd(6) < 0.5) {
    const L = LEAF_BY[p.season as SeasonId];
    oak(w, touchesW ? q.x0 - 1.4 : q.x1 + 1.4, q.z0 - 1.2, 6.2, { seed: p.seed + 7, bark: 0x4e3e30, dark: 0x30261e, leaf: L[0], leafTop: L[1], low: 0.44, width: 1.0, vines: 0 });
  }
}

/** standing wheat (or millet) on a walled-off part of the field: rows with a furrow between, a ridge round the plot; a watch-shed on a
 *  big one */
export function fieldInfill(c: Ctx, f: Parameters<NonNullable<Locale['infill']>>[1]) {
  const { rect: q, p, shape } = f, w = c.w, se = p.season as SeasonId, X0 = M(q.x0), X1 = M(q.x1) - 1, Z0 = M(q.z0), Z1 = M(q.z1) - 1;
  const wc = X1 - X0 + 1, dc = Z1 - Z0 + 1;
  const W = q.x1 - q.x0, D = q.z1 - q.z0;
  // soil under it all, a grass ridge one cell wide round the plot
  for (let X = X0; X <= X1; X++) for (let Z = Z0; Z <= Z1; Z++) w.set(X, -1, Z, X === X0 || X === X1 || Z === Z0 || Z === Z1 ? 0x6a7a38 : HC.soilD);

  if (shape.fixed?.id === 'threshing') {
    const box = shape.box;
    const touchesW = q.x0 <= box.x0 + 0.15, touchesE = q.x1 >= box.x1 - 0.15;
    const touchesN = q.z0 <= box.z0 + 0.15, touchesS = q.z1 >= box.z1 - 0.15;
    // NE rear block behind the bell-locked loading yard: grand granary + paired bins
    if (touchesN && touchesE && W >= 7) {
      FIELD_LANDMARKS.find(l => l.id === 'liangcang')!.build(c, p);
      return;
    }
    // NW farmstead threshing shed & stacked grain sacks bleeding off-camera West & North!
    if (touchesN && touchesW && W >= 5) {
      clearShapeWalls(w, q, wc, dc);
      const B = frame(w, q.x0, q.z0);
      const x0 = -56, x1 = wc - 2, z0 = -46, z1 = dc - 2, H = 42;
      B(x0, -1, z0, x1, -1, z1, HC.earthD);
      B(x0, 0, z0, x1, 3, z1, PL.stone);
      // solid back/west earthen barn wall + open front timber posts facing the threshing floor
      earth(B, x0, 4, z0, x1, H, z0 + 8);
      earth(B, x0, 4, z0, x0 + 8, H, z1);
      for (let x = 2; x <= x1 - 4; x += 24) {
        B(x, 4, z1 - 3, x + 2, H, z1 - 1, HV.post);
      }
      B(x0, H - 2, z1 - 3, x1, H, z1 - 1, HV.woodD);
      roof(B, x0 - 4, x1 + 4, z0 - 4, z1 + 4, H + 1, 'thatch', { tiers: 3, th: 5 });
      // sheltered grain sacks, wheat bundles & cart shafts under the open front shed
      for (let sx = 8; sx <= x1 - 16; sx += 18) {
        B(sx, 4, z1 - 16, sx + 11, 10, z1 - 7, 0xc4a264);
        B(sx + 1, 11, z1 - 15, sx + 9, 15, z1 - 8, 0xd4b678);
        B(sx + 3, 7, z1 - 16, sx + 3, 7, z1 - 7, HV.woodD);
      }
      return;
    }
    // SW low farmstead yard wall + huge stepped golden haystack (大麦秸垛)
    if (touchesW && q.z0 > (box.z0 + box.z1) * 0.5 && W >= 5 && D < 2.8) {
      clearShapeWalls(w, q, wc, dc);
      const B = frame(w, q.x0, q.z0);
      B(0, -1, 0, wc - 1, -1, dc - 1, HC.earthD);
      // low timber rail fence + twin stepped haystacks
      B(0, 0, 2, wc - 1, 2, 7, PL.stone);
      earth(B, 0, 3, 3, wc - 1, 16, 6);
      B(0, 17, 2, wc - 1, 18, 7, PL.cap);
      for (const hx of [Math.floor(wc * 0.28), Math.floor(wc * 0.72)]) {
        B(hx - 14, 0, 9, hx + 14, 10, dc - 2, 0xc8a448);
        B(hx - 11, 11, 11, hx + 11, 18, dc - 4, 0xd6b458);
        B(hx - 7, 19, 13, hx + 7, 23, dc - 6, 0xe0c26a);
      }
      return;
    }
    // SE timber field watchtower (田间望棚) + twin round grain bins bleeding off East!
    if (touchesE && touchesS && W >= 4) {
      clearShapeWalls(w, q, wc, dc);
      const B = frame(w, q.x0, q.z0);
      B(0, -1, 0, wc + 42, -1, dc + 28, HC.earthD);
      const tx = Math.floor(wc * 0.45), tz = Math.floor(dc * 0.52);
      for (const a of [-12, 12]) for (const b of [-12, 12]) B(tx + a - 1, 0, tz + b - 1, tx + a + 1, 52, tz + b + 1, HC.post);
      B(tx - 15, 28, tz - 15, tx + 15, 30, tz + 15, HC.plank);
      for (const u of [-15, 15]) { B(tx + u, 31, tz - 15, tx + u, 36, tz + 15, HC.wood); B(tx - 15, 36, tz + u, tx + 15, 36, tz + u, HC.woodL); }
      thatch(B, tx - 21, tx + 21, tz - 21, tz + 21, 53, [[0, 5], [5, 5]]);
      // ladder facing the floor
      for (const a of [-4, 4]) B(tx + a, 0, tz + 16, tx + a, 28, tz + 16, HC.wood);
      for (let y = 4; y <= 26; y += 5) B(tx - 3, y, tz + 16, tx + 3, y, tz + 16, HC.woodL);
      // paired round clay-and-thatch grain bins just east
      for (const bz of [tz - 12, tz + 14]) {
        const bx = wc + 12;
        B(bx - 10, 0, bz - 10, bx + 10, 2, bz + 10, PL.stone);
        B(bx - 9, 3, bz - 9, bx + 9, 20, bz + 9, PL.wall);
        B(bx - 9, 10, bz - 9, bx + 9, 11, bz + 9, HV.woodD);
        thatch(B, bx - 12, bx + 12, bz - 12, bz + 12, 21, [[0, 4], [4, 4]]);
      }
      return;
    }
  }

  // --- New hj_field bespoke landmarks: hj_mill (水车木磨坊) & hj_ridge (麦坡烽火营楼) ---
  if (shape.fixed?.id === 'hj_mill' || shape.fixed?.id === 'hj_ridge') {
    const box = shape.box;
    const touchesW = q.x0 <= box.x0 + 0.15, touchesE = q.x1 >= box.x1 - 0.15;
    const touchesN = q.z0 <= box.z0 + 0.15, touchesS = q.z1 >= box.z1 - 0.15;
    // hj_mill NW: 2-storey Timber Waterwheel Flour Mill (大木筒车水磨坊!) facing the eastern canal
    if (shape.fixed.id === 'hj_mill' && touchesN && touchesW && W >= 7) {
      clearShapeWalls(w, q, wc, dc);
      const B = frame(w, q.x0, q.z0);
      const x0 = -48, x1 = wc - 2, z0 = -42, z1 = dc - 2, H = 48;
      B(x0, -1, z0, x1 + 4, -1, z1, HC.earthD);
      B(x0, 0, z0, x1, 5, z1, PL.stone);
      B(x0, 6, z0, x1, H, z1, PL.wall);
      for (let x = 2; x <= x1 - 4; x += 26) B(x, 6, z1 - 2, x + 2, H, z1, HV.post);
      B(x0, 28, z0, x1 + 2, 30, z1 + 2, HV.woodD); // 2nd-floor timber belt
      hallTileRoof(B, x0 - 4, x1 + 4, z0 - 4, z1 + 5, H + 1, 3, 5);
      // Giant vertical wooden spoked waterwheel mounted on the east canal face!
      const wx = x1 + 1, wz = Math.floor(dc * 0.55), wy = 16;
      B(wx - 4, wy - 2, wz - 2, wx + 6, wy + 2, wz + 2, HV.woodD); // axle shaft
      for (const [dz, dy] of [[-12, 0], [12, 0], [0, -12], [0, 12], [-9, -9], [9, -9], [-9, 9], [9, 9]]) {
        B(wx + 1, Math.max(0, wy + dy - 2), wz + dz - 2, wx + 5, wy + dy + 2, wz + dz + 2, HV.wood);
      }
      B(wx + 2, Math.max(0, wy - 12), wz - 1, wx + 4, wy + 12, wz + 1, HV.post);
      B(wx + 2, wy - 1, wz - 12, wx + 4, wy + 1, wz + 12, HV.post);
      return;
    }
    // hj_ridge NW: 3-storey Yellow Turban Beacon Watchtower (麦坡烽火营楼!) with blazing fire brazier!
    if (shape.fixed.id === 'hj_ridge' && touchesN && touchesW && W >= 6) {
      clearShapeWalls(w, q, wc, dc);
      const B = frame(w, q.x0, q.z0);
      const x0 = -36, x1 = wc - 2, z0 = -36, z1 = dc - 2;
      B(x0, -1, z0, x1, -1, z1, HC.earthD);
      B(x0, 0, z0, x1, 6, z1, PL.stone);
      earth(B, x0, 7, z0, x1, 40, z1);
      B(x0, 39, z0, x1, 41, z1, HV.woodD);
      const tx = Math.max(18, Math.floor(wc * 0.55)), tz = Math.max(12, Math.floor(dc * 0.45));
      for (const a of [-14, 12]) for (const b of [-14, 12]) B(tx + a, 40, tz + b, tx + a + 2, 74, tz + b + 2, HV.post);
      B(tx - 16, 42, tz - 16, tx + 16, 44, tz + 16, HC.plank);
      for (const s of [-16, 16]) { B(tx - 16, 45, tz + s, tx + 16, 50, tz + s, HV.wood); B(tx + s, 45, tz - 16, tx + s, 50, tz + 16, HV.wood); }
      // blazing bronze signal fire brazier on the watchtower deck!
      B(tx - 5, 45, tz - 5, tx + 5, 50, tz + 5, PL.tileD);
      B(tx - 3, 51, tz - 3, tx + 3, 57, tz + 3, 0xff983a, 1);
      thatch(B, tx - 22, tx + 22, tz - 22, tz + 22, 75, [[0, 5], [5, 5]]);
      banner(B, tx + 16, tz + 16, 78, 10, 22);
      return;
    }
    // Keep narrow 1-cell walls on hj_ridge / hj_mill clean solid earthen walls instead of hollow double mud cages!
    if (D < 2.6 || W < 2.6) {
      clearShapeWalls(w, q, wc, dc);
      const B = frame(w, q.x0, q.z0);
      B(0, -1, 0, wc - 1, -1, dc - 1, HC.earthD);
      if (W >= D) {
        const z0 = Math.max(1, Math.floor(dc / 2) - 5), z1 = Math.min(dc - 2, z0 + 9);
        B(0, 0, z0 - 1, wc - 1, 3, z1 + 1, PL.stone);
        earth(B, 0, 4, z0, wc - 1, 22, z1);
        B(0, 23, z0 - 1, wc - 1, 24, z1 + 1, PL.cap);
      } else {
        const x0 = Math.max(1, Math.floor(wc / 2) - 5), x1 = Math.min(wc - 2, x0 + 9);
        B(x0 - 1, 0, 0, x1 + 1, 3, dc - 1, PL.stone);
        earth(B, x0, 4, 0, x1, 22, dc - 1);
        B(x0 - 1, 23, 0, x1 + 1, 24, dc - 1, PL.cap);
      }
      return;
    }
    // South foreground farm blocks: low thatched granary / haystacks (camera-safe!)
    if (touchesS && W >= 4 && D >= 4) {
      clearShapeWalls(w, q, wc, dc);
      const B = frame(w, q.x0, q.z0);
      B(0, -1, 0, wc - 1, -1, dc - 1, HC.earthD);
      for (const hx of [Math.floor(wc * 0.3), Math.floor(wc * 0.7)]) {
        B(hx - 12, 0, 6, hx + 12, 10, dc - 4, 0xc8a448);
        B(hx - 9, 11, 8, hx + 9, 18, dc - 6, 0xd6b458);
      }
      return;
    }
  }

  const pal = cropOf(se, p.rnd(1) < 0.4 ? 1 : 0), rowsZ = p.rnd(2) < 0.6, T = 6, H = (se === 'autumn' ? 14 : 13);
  // a big plot gets a watch-shed in the middle of its camera-side half, rows left round it
  const shed = W > 6 && D > 6 ? { x: M((q.x0 + q.x1) / 2), z: M(f.back ? q.z1 - D * 0.3 : (q.z0 + q.z1) / 2) } : null;
  const inShed = (X: number, Z: number) => !!shed && Math.abs(X - shed.x) < 24 && Math.abs(Z - shed.z) < 24;
  if (rowsZ) {
    for (let X = X0 + 2; X + T - 2 <= X1 - 1; X += T) {
      let z = Z0 + 2;
      while (z <= Z1 - 2) { if (inShed(X + 2, z)) { z++; continue; } let e = z; while (e + 1 <= Z1 - 2 && !inShed(X + 2, e + 1)) e++; if (e - z > 4) wheatBed(c, X, z, X + T - 2, e, H, pal, ['+z', X + T > X1 - 2 ? '+x' : '-x']); z = e + 1; }
    }
  } else {
    for (let Z = Z0 + 2; Z + T - 2 <= Z1 - 1; Z += T) {
      let x = X0 + 2;
      while (x <= X1 - 2) { if (inShed(x, Z + 2)) { x++; continue; } let e = x; while (e + 1 <= X1 - 2 && !inShed(e + 1, Z + 2)) e++; if (e - x > 4) wheatBed(c, x, Z, e, Z + T - 2, H, pal, ['+z']); x = e + 1; }
    }
  }
  if (shed) {
    // the field watch-shed on stilts (as the 瓜棚 group): four posts, a board deck, a two-slab thatch, a ladder
    const B = fframe(w, shed.x * CELL, shed.z * CELL);
    for (const a of [-12, 12]) for (const b of [-12, 12]) B(a - 1, -1, b - 1, a + 1, 40, b + 1, HC.post);
    B(-14, 22, -14, 14, 23, 14, HC.plank); for (const u of [-14, 14]) { B(u, 24, -14, u, 28, 14, HC.wood); B(-14, 28, u, 14, 28, u, HC.woodL); }
    thatch(B, -19, 19, -19, 19, 41, [[0, 4], [5, 4]]);
    for (const a of [-4, 4]) B(a, -1, 16, a, 22, 16, HC.wood); for (let y = 3; y <= 21; y += 5) B(-3, y, 16, 3, y, 16, HC.woodL);
    if (night(p)) { B(10, 32, 13, 12, 36, 15, 0xe0a050, 1); c.light([shed.x * CELL + 0.77, 2.4, shed.z * CELL + 1.0], 0xffa050, 1.6 * p.lamp, 5); }
  }
}
