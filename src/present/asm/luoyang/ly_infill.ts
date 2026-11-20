// 第二关 · 洛阳余烬 建筑填充（ly_infill.ts）：
// 彻底取代 shapeBuild 的灰盒围墙，按块体尺度与方位打造东汉废都洛阳的宏大焦宫建筑群：
//  1) 外缘大/中型实地：向场外延伸出镜的半塌朱墙重檐宫殿 / 焦柱长廊（imperialHall），或铸钱场高炉铁箍冶炼工坊（mintHall）；
//  2) 场内中型块体：断阁残台（石台基 + 焦朱柱 + 半塌汉瓦顶 + 倾倒斗拱 + 余火堆）；
//  3) 单格隔墙：统一单道剥落朱漆宫墙（石基 + 夯土朱漆 + 豁口 + 青灰瓦压顶），彻底消灭双墙灰盒与浮空挑檐。
// 硬性约束：rect 内每格在 y = 5 保持 100% 实心石台基覆盖（满足 roomMaps.test.ts ≥ 60% 校验）。
import type { Ctx } from '../../scenes/stage';
import type { Bx } from '../../scenes/k_village';
import type { Locale, Place, Rect } from '../types';
import { M } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import {
  frame, up, palaceWall, charPost, ingots, qianfan, heap, rubble, emberHeap, fireBasin, smoke, fireLight, LY,
} from './ly_kit';
import { smallFurnace } from './ly_mint_props';

/** Clear shapeBuild's uniform grey perimeter wall cage inside rect AND any 1-cell overhanging coping rim at y = 33..42 */
function clearShapeWalls(w: Ctx['w'], q: Rect, wc: number, dc: number) {
  const X0 = M(q.x0), Z0 = M(q.z0);
  w.box(X0, 0, Z0, X0 + wc - 1, 44, Z0 + dc - 1, null);
  const trimRim = (wx: number, wz: number) => {
    if (w.has(wx, 32, wz) || w.has(wx, 28, wz)) return;
    for (let y = 33; y <= 42; y++) w.set(wx, y, wz, null);
  };
  for (let x = -1; x <= wc; x++) { trimRim(X0 + x, Z0 - 1); trimRim(X0 + x, Z0 + dc); }
  for (let z = 0; z < dc; z++) { trimRim(X0 - 1, Z0 + z); trimRim(X0 + wc, Z0 + z); }
}

/** Heavy Han imperial ribbed charcoal-tile hip roof (supports ridge along X or Z, plus optional half-collapsed cut!) */
function imperialRoof(
  B: Bx, x0: number, x1: number, z0: number, z1: number, y0: number,
  o: { alongZ?: boolean; cutMin?: boolean; cutMax?: boolean; tiers?: number; th?: number } = {},
) {
  const tiers = o.tiers ?? 3, th = o.th ?? 4;
  let ya = y0;
  let a = x0, b = x1, c = z0, e = z1;
  for (let i = 0; i < tiers; i++) {
    const step = i === 0 ? 0 : 5;
    if (o.alongZ) {
      a += step; b -= step;
      if (i > 0 && !o.cutMin) c += 3;
      if (i > 0 && !o.cutMax) e -= 3;
    } else {
      c += step; e -= step;
      if (i > 0 && !o.cutMin) a += 3;
      if (i > 0 && !o.cutMax) b -= 3;
    }
    if (a + 3 >= b || c + 3 >= e) break;
    B(a, ya, c, b, ya + th - 1, e, LY.tile);
    // dark under-eave shadow band on tier 0
    if (i === 0) {
      B(a, ya, c, b, ya, c, LY.tileD); B(a, ya, e, b, ya, e, LY.tileD);
      B(a, ya, c, a, ya, e, LY.tileD); B(b, ya, c, b, ya, e, LY.tileD);
    }
    // ribbed Han barrel-tile lines running down the slope
    if (o.alongZ) {
      for (let z = c + 2; z <= e - 2; z += 5) B(a, ya + th - 1, z, b, ya + th - 1, z, LY.tileL);
    } else {
      for (let x = a + 2; x <= b - 2; x += 5) B(x, ya + th - 1, c, x, ya + th - 1, e, LY.tileL);
    }
    ya += th;
  }
  // monumental imperial roof ridge & chiwei finials (鸱尾)
  if (o.alongZ) {
    const mx = Math.round((a + b) / 2);
    B(mx - 2, ya, c, mx + 2, ya + 2, e, LY.tileD);
    B(mx - 1, ya + 3, c, mx + 1, ya + 3, e, LY.tileL);
    if (!o.cutMin) B(mx - 2, ya + 3, c, mx + 2, ya + 6, c + 3, LY.tileD);
    if (!o.cutMax) B(mx - 2, ya + 3, e - 3, mx + 2, ya + 6, e, LY.tileD);
    // snapped charred rafters sticking out of a collapsed end
    if (o.cutMin) for (let x = x0 + 4; x <= x1 - 4; x += 7) B(x, y0 + 1, z0 - 4, x + 1, y0 + 2, z0, LY.char);
    if (o.cutMax) for (let x = x0 + 4; x <= x1 - 4; x += 7) B(x, y0 + 1, z1, x + 1, y0 + 2, z1 + 4, LY.char);
  } else {
    const mz = Math.round((c + e) / 2);
    B(a, ya, mz - 2, b, ya + 2, mz + 2, LY.tileD);
    B(a, ya + 3, mz - 1, b, ya + 3, mz + 1, LY.tileL);
    if (!o.cutMin) B(a, ya + 3, mz - 2, a + 3, ya + 6, mz + 2, LY.tileD);
    if (!o.cutMax) B(b - 3, ya + 3, mz - 2, b, ya + 6, mz + 2, LY.tileD);
    if (o.cutMin) for (let z = z0 + 4; z <= z1 - 4; z += 7) B(x0 - 4, y0 + 1, z, x0, y0 + 2, z + 1, LY.char);
    if (o.cutMax) for (let z = z0 + 4; z <= z1 - 4; z += 7) B(x1, y0 + 1, z, x1 + 4, y0 + 2, z + 1, LY.char);
  }
  return ya + 4;
}

/** Monumental half-burned Han imperial palace hall bleeding off-camera on any touched perimeter edge */
function imperialHall(
  c: Ctx, q: Rect, B: Bx, wc: number, dc: number, p: Place,
  ext: { w: number; e: number; n: number; s: number; back: boolean },
) {
  const ax0 = -ext.w, ax1 = wc - 1 + ext.e, az0 = -ext.n, az1 = dc - 1 + ext.s;
  const tw = ax1 - ax0 + 1, td = az1 - az0 + 1;
  const alongZ = td > tw * 1.15;
  // Grand monumental imperial height on north & mid-flanks (54..64 voxels = 3.8..4.5m eave, 5.4..6.1m ridge!); camera-safe 38 on south foreground!
  const H = ext.s > 0 ? 38 : (ext.back ? 48 : (tw > 90 || td > 90 ? 64 : 56));

  // 1) Grounded imperial stone plinth across full footprint (y = -1..6 => 100% solid at y = 5!)
  B(ax0 - 1, -1, az0 - 1, ax1 + 1, -1, az1 + 1, LY.ashD);
  B(ax0, 0, az0, ax1, 5, az1, LY.stoneD);
  B(ax0, 6, az0, ax1, 6, az1, LY.stone);
  // plinth cornice molding along visible edges inside rect
  B(0, 3, 0, wc - 1, 3, 0, LY.stoneDD);
  B(0, 3, dc - 1, wc - 1, 3, dc - 1, LY.stoneDD);
  B(0, 3, 0, 0, 3, dc - 1, LY.stoneDD);
  B(wc - 1, 3, 0, wc - 1, 3, dc - 1, LY.stoneDD);

  const U = up(B, 7);
  const wallH = H - 7;
  // Determine which half is intact vs burnt-collapsed (deterministic asymmetric variety!)
  const collapseHi = p.rnd(11) < 0.52;
  const splitFrac = 0.44 + p.rnd(12) * 0.16;

  // 2) Peeling crimson imperial walls recessed slightly behind the front colonnade
  const insetN = ext.n ? 0 : 7, insetS = ext.s ? 0 : 7, insetW = ext.w ? 0 : 7, insetE = ext.e ? 0 : 7;
  const wx0 = ax0 + insetW, wx1 = ax1 - insetE, wz0 = az0 + insetN, wz1 = az1 - insetS;

  if (alongZ) {
    const splitZ = Math.round(az0 + td * splitFrac);
    const intactZ0 = collapseHi ? az0 : splitZ;
    const intactZ1 = collapseHi ? splitZ : az1;
    const ruinZ0 = collapseHi ? splitZ + 1 : az0;
    const ruinZ1 = collapseHi ? az1 : splitZ - 1;

    // Intact half: enclosed vermilion palace hall + colonnade posts + heavy Han tiled roof
    if (wx1 - wx0 >= 10 && intactZ1 - intactZ0 >= 16) {
      B(wx0, 0, intactZ0 + 2, wx1, wallH - 1, intactZ1 - 2, LY.earthD);
      // peeling crimson plaster panels on street-facing east & west walls
      for (const xf of [wx0, wx1]) {
        for (let z = intactZ0 + 2; z <= intactZ1 - 2; z += 14) {
          const ze = Math.min(intactZ1 - 2, z + 12);
          const redTop = Math.min(wallH - 4, Math.round(wallH * (0.55 + p.rnd(20 + z) * 0.35)));
          B(xf, 0, z, xf, redTop, ze, LY.red);
          B(xf, 0, z, xf, 2, ze, LY.redD);
          B(xf, Math.max(4, wallH - 5), z, xf, wallH - 1, ze, LY.charL);
        }
      }
      // tall crimson/charred timber colonnade along the combat-facing side(s)
      const colXs = ext.w && !ext.e ? [ax1 - 3] : ext.e && !ext.w ? [ax0 + 3] : [ax0 + 3, ax1 - 3];
      for (const cx of colXs) {
        for (let z = intactZ0 + 6; z <= intactZ1 - 6; z += 22) {
          charPost(U, cx, z, wallH, { charAt: Math.round(wallH * 0.62) });
        }
        U(cx - 1, wallH - 2, intactZ0 + 2, cx + 1, wallH, intactZ1 - 2, LY.char);
      }
      // double-eave skirt (重檐腰檐) for monumental 2-storey imperial halls
      if (wallH >= 44) {
        U(ax0 - 2, 26, intactZ0, ax1 + 2, 28, intactZ1, LY.tileD);
        U(ax0 - 1, 29, intactZ0 + 1, ax1 + 1, 29, intactZ1 - 1, LY.tile);
      }
      imperialRoof(U, ax0 - 3, ax1 + 3, intactZ0 - 2, intactZ1 + 2, wallH + 1, {
        alongZ: true, cutMin: !collapseHi, cutMax: collapseHi, tiers: tw >= 46 ? 3 : 2, th: 5,
      });
    }

    // Collapsed burned half: snapped vermilion pillars, fallen charred beams, tile rubble & ember pit!
    if (ruinZ1 - ruinZ0 >= 14) {
      const colXs = [ax0 + 6, ax1 - 6];
      for (const cx of colXs) {
        for (let z = ruinZ0 + 8; z <= ruinZ1 - 6; z += 22) {
          const bh = 12 + Math.floor(p.rnd(40 + cx + z) * 14);
          charPost(U, cx, z, Math.min(wallH - 4, bh), { broken: true, charAt: Math.min(bh - 4, 10) });
        }
      }
      const rx = Math.round((ax0 + ax1) / 2), rz = Math.round((ruinZ0 + ruinZ1) / 2);
      rubble(U, rx, rz, Math.min(18, Math.floor(tw * 0.35)), Math.min(16, Math.floor((ruinZ1 - ruinZ0) * 0.36)), 3, { beam: true });
      if (ruinZ1 - ruinZ0 >= 26) {
        emberHeap(U, rx, Math.min(ruinZ1 - 8, rz + 10), p.lamp > 0.25);
        if (typeof (c as Partial<Ctx>).add === 'function' && p.rnd(61) < 0.65) {
          smoke(c, [q.x0 + rx * CELL, 1.4, q.z0 + rz * CELL], { rate: 1.5, col: 0x544e4a });
        }
      }
    }
  } else {
    const splitX = Math.round(ax0 + tw * splitFrac);
    const intactX0 = collapseHi ? ax0 : splitX;
    const intactX1 = collapseHi ? splitX : ax1;
    const ruinX0 = collapseHi ? splitX + 1 : ax0;
    const ruinX1 = collapseHi ? ax1 : splitX - 1;

    // Intact half: monumental peeling-red imperial hall with front colonnade & heavy tiled hip roof
    if (intactX1 - intactX0 >= 16 && wz1 - wz0 >= 10) {
      B(intactX0 + 2, 0, wz0, intactX1 - 2, wallH - 1, wz1, LY.earthD);
      palaceWall(U, intactX0 + 2, intactX1 - 2, wz0, wz0 + 3, wallH - 2, { seed: p.seed + 3, plaster: 0.85 });
      palaceWall(U, intactX0 + 2, intactX1 - 2, wz1 - 3, wz1, wallH - 2, { seed: p.seed + 9, plaster: 0.9 });
      // front street-facing colonnade
      const colZs = ext.n && !ext.s ? [az1 - 3] : ext.s && !ext.n ? [az0 + 3] : [az0 + 3, az1 - 3];
      for (const cz of colZs) {
        for (let x = intactX0 + 6; x <= intactX1 - 6; x += 22) {
          charPost(U, x, cz, wallH, { charAt: Math.round(wallH * 0.62) });
        }
        U(intactX0 + 2, wallH - 2, cz - 1, intactX1 - 2, wallH, cz + 1, LY.char);
      }
      // double-eave skirt (重檐腰檐) for monumental 2-storey imperial halls
      if (wallH >= 44) {
        U(intactX0, 26, az0 - 2, intactX1, 28, az1 + 2, LY.tileD);
        U(intactX0 + 1, 29, az0 - 1, intactX1 - 1, 29, az1 + 1, LY.tile);
      }
      imperialRoof(U, intactX0 - 2, intactX1 + 2, az0 - 3, az1 + 3, wallH + 1, {
        alongZ: false, cutMin: !collapseHi, cutMax: collapseHi, tiers: td >= 46 ? 3 : 2, th: 5,
      });
    }

    // Collapsed burned half: broken colonnade, overturned crimson dougong bracket, rubble & embers
    if (ruinX1 - ruinX0 >= 14) {
      palaceWall(U, ruinX0 + 3, ruinX1 - 3, wz0, wz0 + 3, Math.max(10, wallH - 14), {
        seed: p.seed + 17, plaster: 0.75,
        drops: [[Math.round((ruinX0 + ruinX1) * 0.45), ruinX1 - 3, 8]],
      });
      for (let x = ruinX0 + 8; x <= ruinX1 - 6; x += 22) {
        const bh = 12 + Math.floor(p.rnd(50 + x) * 14);
        charPost(U, x, az1 - 5, Math.min(wallH - 4, bh), { broken: true, charAt: Math.min(bh - 4, 10) });
      }
      const rx = Math.round((ruinX0 + ruinX1) / 2), rz = Math.round((az0 + az1) / 2);
      rubble(U, rx, rz, Math.min(18, Math.floor((ruinX1 - ruinX0) * 0.36)), Math.min(16, Math.floor(td * 0.35)), 3, { beam: true });
      // overturned red-lacquer dougong bracket block
      const bz = Math.max(az0 + 8, az1 - 10);
      U(rx - 7, 0, bz - 2, rx + 7, 6, bz + 2, LY.redD);
      U(rx - 5, 7, bz - 1, rx + 5, 9, bz + 1, LY.red);
      if (ruinX1 - ruinX0 >= 24) {
        emberHeap(U, Math.min(ruinX1 - 8, rx + 8), rz, p.lamp > 0.25);
        if (typeof (c as Partial<Ctx>).add === 'function' && p.rnd(63) < 0.65) {
          smoke(c, [q.x0 + rx * CELL, 1.4, q.z0 + rz * CELL], { rate: 1.5, col: 0x544e4a });
        }
      }
    }
  }

  // Optional 3-Storey Imperial Que Watch-Pavilion Landmark (三层重檐焦宫大阙, y up to ~104 = 7.3m!) on primary NW landmark block
  if (ext.n > 0 && ext.w > 0 && wc >= 38 && dc >= 34) {
    const qx = Math.min(wc - 18, Math.max(12, Math.floor(wc * 0.45)));
    const qz = Math.min(dc - 18, Math.max(10, Math.floor(dc * 0.42)));
    const baseY = wallH + 2;
    // 2nd-storey recessed vermilion palace pavilion rising out of the main hall roof
    U(qx - 17, baseY - 4, qz - 15, qx + 17, baseY + 20, qz + 15, LY.earthD);
    U(qx - 17, baseY, qz + 15, qx + 17, baseY + 14, qz + 15, LY.red);
    U(qx - 17, baseY, qz - 15, qx + 17, baseY + 14, qz - 15, LY.red);
    U(qx + 17, baseY, qz - 15, qx + 17, baseY + 14, qz + 15, LY.red);
    // dark gallery windows & charred corner columns on 2nd floor
    U(qx - 9, baseY + 5, qz + 15, qx + 9, baseY + 13, qz + 16, LY.charD);
    for (const ax of [-17, 15]) for (const az of [-15, 13]) U(qx + ax, baseY - 2, qz + az, qx + ax + 2, baseY + 21, qz + az + 2, LY.char);
    // 2nd-tier overhanging heavy imperial tile eave
    imperialRoof(U, qx - 23, qx + 23, qz - 20, qz + 20, baseY + 21, { alongZ: false, tiers: 2, th: 4 });
    // 3rd-storey crowning belvedere lantern pavilion + tall imperial roof with chiwei finials (soaring to ~7.3m!)
    const topY = baseY + 29;
    U(qx - 11, topY, qz - 10, qx + 11, topY + 14, qz + 10, LY.redD);
    U(qx - 6, topY + 3, qz + 10, qx + 6, topY + 10, qz + 11, LY.ember, 1);
    imperialRoof(U, qx - 16, qx + 16, qz - 14, qz + 14, topY + 15, { alongZ: false, tiers: 2, th: 4 });
    if (typeof (c as Partial<Ctx>).add === 'function') {
      smoke(c, [q.x0 + qx * CELL, (topY + 30) * CELL, q.z0 + qz * CELL], { rate: 1.8, col: 0x4c4642 });
    }
  }

  // Optional warm lit bronze fire basin perched at a visible terrace corner (guarded for unit tests)
  if (typeof (c as Partial<Ctx>).light === 'function' && p.rnd(77) < 0.55) {
    const fx = ext.w ? wc - 9 : 9, fz = ext.n ? dc - 9 : 9;
    if (fx >= 6 && fx <= wc - 6 && fz >= 6 && fz <= dc - 6) {
      const f = fireBasin(U, fx, fz, true, 7);
      fireLight(c, p, [q.x0 + f[0] * CELL, (f[1] + 9) * CELL, q.z0 + f[2] * CELL], 0.85, 5.5);
    }
  }
}

/** Towering black-brick smelting foundry hall for Region 2 Boss Mint (ly_mint) */
function mintHall(
  c: Ctx, q: Rect, B: Bx, wc: number, dc: number, p: Place,
  ext: { w: number; e: number; n: number; s: number; back: boolean },
) {
  const ax0 = -ext.w, ax1 = wc - 1 + ext.e, az0 = -ext.n, az1 = dc - 1 + ext.s;
  // Grounded slag & black-brick plinth (100% solid at y = 5!)
  B(ax0 - 1, -1, az0 - 1, ax1 + 1, -1, az1 + 1, LY.slag);
  B(ax0, 0, az0, ax1, 5, az1, LY.brickD);
  B(ax0, 6, az0, ax1, 6, az1, LY.charD);

  const U = up(B, 7);
  const H = ext.s > 0 ? 36 : (ext.back ? 42 : 52);
  // Back half: heavy black-brick iron-banded smelting workshop with towering square chimney stack!
  const midZ = Math.round((az0 + az1) * 0.45);
  const shZ0 = ext.s ? midZ : az0 + 2;
  const shZ1 = ext.s ? az1 - 2 : Math.max(midZ, az0 + 22);
  if (shZ1 - shZ0 >= 14 && ax1 - ax0 >= 20) {
    B(ax0 + 2, 0, shZ0, ax1 - 2, H - 4, shZ1, LY.brickD);
    // iron reinforcing bands every 8 voxels
    for (let y = 6; y < H - 4; y += 8) B(ax0 + 1, y, shZ0, ax1 - 1, y + 1, shZ1, LY.iron);
    // glowing molten kiln mouth facing the battle floor!
    const mx = Math.round(wc * 0.5), mz = ext.s ? shZ0 : shZ1;
    U(mx - 6, 1, mz - 1, mx + 6, 11, mz + 1, LY.charD);
    U(mx - 4, 2, mz - 1, mx + 4, 9, mz + 1, LY.molten, 1);
    U(mx - 2, 3, mz - 1, mx + 2, 7, mz + 1, LY.moltenL, 1);
    if (typeof (c as Partial<Ctx>).light === 'function') {
      c.light([q.x0 + mx * CELL, 1.2, q.z0 + (mz + (ext.s ? -5 : 5)) * CELL], 0xff7824, 2.2, 6.5);
    }
    // workshop pitched charcoal-tile roof + tall stepped brick chimney
    imperialRoof(U, ax0, ax1, shZ0 - 2, shZ1 + 2, H - 3, { alongZ: false, tiers: 2, th: 4 });
    const chX = ext.w ? Math.max(ax0 + 12, -8) : Math.min(ax1 - 12, wc + 8);
    const chZ = Math.round((shZ0 + shZ1) / 2);
    U(chX - 7, H, chZ - 7, chX + 7, H + 20, chZ + 7, LY.brickD);
    U(chX - 8, H + 10, chZ - 8, chX + 8, H + 11, chZ + 8, LY.iron);
    U(chX - 5, H + 21, chZ - 5, chX + 5, H + 34, chZ + 5, LY.char);
    U(chX - 3, H + 34, chZ - 3, chX + 3, H + 34, chZ + 3, LY.ember, 1);
    if (typeof (c as Partial<Ctx>).add === 'function') smoke(c, [q.x0 + chX * CELL, (H + 34) * CELL, q.z0 + chZ * CELL], { rate: 2.0, col: 0x3a3432 });
  }

  // Front terrace deck inside rect: small crucible furnace, coal/slag heap, copper ingots & coin moulds
  const fx = Math.floor(wc / 2), fz = ext.s ? Math.min(dc - 10, 12) : Math.max(10, dc - 14);
  if (wc >= 36 && dc >= 30) {
    const side = p.rnd(1) < 0.5 ? -1 : 1;
    smallFurnace(U, Math.max(10, Math.min(wc - 10, fx + side * 12)), fz, true);
    heap(U, Math.max(10, Math.min(wc - 10, fx - side * 12)), fz, 9, 8, 3, LY.charD, LY.charL);
    ingots(U, fx, Math.max(8, fz - 10), 4);
    qianfan(U, fx - 4, Math.min(dc - 8, fz + 6), 0, { bronze: true });
  } else {
    ingots(U, fx, fz, 3);
    heap(U, Math.max(8, fx - 8), fz, 7, 7, 2, LY.slag, LY.charL);
  }
}

/** Interior medium ruin block: collapsed imperial pavilion / gatehouse (断阁残台) */
function innerPavilion(B: Bx, wc: number, dc: number, p: Place, back: boolean) {
  B(0, -1, 0, wc - 1, -1, dc - 1, LY.ashD);
  B(0, 0, 0, wc - 1, 5, dc - 1, LY.stoneD);
  B(0, 6, 0, wc - 1, 6, dc - 1, LY.stone);
  const U = up(B, 7);
  const H = back ? 34 : 44;
  const cx = Math.floor(wc / 2), cz = Math.floor(dc / 2);
  // four corner vermilion/charred columns (two standing, two snapped!)
  charPost(U, 6, 6, H, { charAt: Math.round(H * 0.55) });
  charPost(U, 6, dc - 7, H, { charAt: Math.round(H * 0.55) });
  charPost(U, wc - 7, 6, Math.round(H * 0.6), { broken: true, charAt: 8 });
  charPost(U, wc - 7, dc - 7, Math.round(H * 0.45), { broken: true, charAt: 6 });
  // peeling red back screen wall on intact half
  palaceWall(U, 4, Math.round(wc * 0.62), 4, 8, H - 3, { seed: p.seed + 5, plaster: 0.9 });
  // half-surviving Han tile roof covering west half
  const split = Math.max(18, Math.round(wc * 0.58));
  imperialRoof(U, 0, split, 1, dc - 2, H + 1, { alongZ: false, cutMax: true, tiers: 2, th: 3 });
  // fallen charred beams, tile mound & ember glow on collapsed east half
  rubble(U, Math.min(wc - 8, split + 8), cz, Math.max(6, Math.floor((wc - split) * 0.4)), Math.max(6, Math.floor(dc * 0.3)), 2, { beam: true });
  emberHeap(U, cx, cz, p.lamp > 0.3);
}

/** Unified single-layer breached crimson imperial wall for thin 1-cell # partitions (no double grey box!) */
function palaceDivider(B: Bx, wc: number, dc: number, p: Place, back: boolean) {
  B(0, -1, 0, wc - 1, -1, dc - 1, LY.ashD);
  // 100% stone plinth at y = 0..5 so roomMaps.test.ts y=5 coverage is always 100%!
  B(0, 0, 0, wc - 1, 5, dc - 1, LY.stoneD);
  B(0, 5, 0, wc - 1, 5, dc - 1, LY.stone);
  const U = up(B, 6);
  const H = back ? 22 : 28;
  if (wc >= dc) {
    const z0 = Math.max(2, Math.floor(dc / 2) - 4), z1 = Math.min(dc - 3, z0 + 7);
    const dropA = Math.floor(wc * 0.32), dropB = Math.floor(wc * 0.62);
    palaceWall(U, 0, wc - 1, z0, z1, H, {
      seed: p.seed, plaster: 0.88,
      drops: wc >= 40 ? [[dropA, dropB, Math.max(8, H - 12)]] : [],
    });
    // stone & crimson end piers
    if (wc >= 24) {
      charPost(U, 4, Math.floor(dc / 2), H + 2, { charAt: 12 });
      charPost(U, wc - 5, Math.floor(dc / 2), Math.max(12, H - 6), { broken: true, charAt: 10 });
    }
  } else {
    const x0 = Math.max(2, Math.floor(wc / 2) - 4), x1 = Math.min(wc - 3, x0 + 7);
    // vertical crimson wall along Z
    U(x0, 0, 0, x1, H, dc - 1, LY.earth);
    for (let z = 0; z < dc; z += 12) {
      const ze = Math.min(dc - 1, z + 11);
      const redH = Math.min(H - 3, 6 + Math.floor(p.rnd(15 + z) * (H - 8)));
      U(x0, 0, z, x0, redH, ze, LY.red);
      U(x1, 0, z, x1, redH, ze, LY.red);
    }
    U(x0, Math.max(4, H - 4), 0, x1, H, dc - 1, LY.charL);
    U(x0 - 1, H + 1, 0, x1 + 1, H + 1, dc - 1, LY.tileD);
    U(x0, H + 2, 0, x1, H + 2, dc - 1, LY.tile);
    U(x0 + 1, H + 3, 0, x1 - 1, H + 3, dc - 1, LY.tileL);
  }
}

/** Luoyang infill: monumental half-burned imperial halls, foundry smelting sheds, collapsed pavilions & breached crimson walls. */
export function burntInfill(place: 'road' | 'ward' | 'mint'): NonNullable<Locale['infill']> {
  return (c, { rect, shape, p, back }) => {
    const wc = M(rect.x1) - M(rect.x0), dc = M(rect.z1) - M(rect.z0);
    // Wipe shapeBuild's uniform grey wall box & floating coping rim before raising authentic palace ruins
    clearShapeWalls(c.w, rect, wc, dc);
    const B = frame(c.w, rect.x0, rect.z0);

    const box = shape?.box;
    const touchesW = !!box && rect.x0 <= box.x0 + 0.15;
    const touchesE = !!box && rect.x1 >= box.x1 - 0.15;
    const touchesN = !!box && rect.z0 <= box.z0 + 0.15;
    const touchesS = !!box && rect.z1 >= box.z1 - 0.15;
    const touchesOuter = touchesW || touchesE || touchesN || touchesS;

    // 1) Foundry Boss Room (ly_mint): towering black-brick smelting workshops bleeding off-camera!
    if (place === 'mint') {
      mintHall(c, rect, B, wc, dc, p, {
        w: touchesW ? 58 : 0,
        e: touchesE ? 58 : 0,
        n: touchesN ? 48 : 0,
        s: touchesS && !back ? 32 : 0,
        back,
      });
      return;
    }

    // 2) Outer-edge substantial blocks (>= ~1.7m on both axes): full-scale camera-bleeding Han imperial hall!
    if (touchesOuter && wc >= 24 && dc >= 24) {
      imperialHall(c, rect, B, wc, dc, p, {
        w: touchesW ? 64 : 0,
        e: touchesE ? 64 : 0,
        n: touchesN ? 56 : 0,
        s: touchesS && !back ? 36 : 0,
        back,
      });
      return;
    }

    // 3) Interior medium blocks: collapsed imperial pavilion / gatehouse
    if (wc >= 32 && dc >= 32) {
      innerPavilion(B, wc, dc, p, back);
      return;
    }

    // 4) Thin 1-cell walls & narrow perimeter strips: unified peeling crimson imperial wall
    palaceDivider(B, wc, dc, p, back);
  };
}
