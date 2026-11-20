// 第三关 · 下邳寒沼（xp_lane / xp_wall / xp_gate）专属建筑填充、远景寒雾山城天际线与街边微装饰：
// 1) 破除平顶白方盒：民居改建二层/三层黑瓦白墙临水大宅（腰檐+暖光格窗+冰凌+挑檐黑瓦仅轻覆雪脊）；
// 2) 城垣与白门楼：高大青砖城垛敌台之上架起二/三层重檐角楼、白门偏楼（含悬索与破损红旌）与低矮箭棚，形成强烈不对称高低层次；
// 3) 场外远景天际线（xiapiDistantBackdrop）：为固定房补齐东西两翼半淹水巷民居/枯柳，并在北方远景铺出寒雾重檐古城与覆雪徐州远山层峦。
import type { Ctx } from '../../scenes/stage';
import { M, PLAY, SZ, hash } from '../../scenes/props';
import { CELL } from '../../bestiary/kit';
import { addCardKind } from '../../scenes/cards';
import { ground } from '../../scenes/dress';
import { plot, tone } from '../../scenes/flora';
import type { Layout, Locale, Place, Rect } from '../types';
import {
  XP, frame, up, capCol, blackRoof, plasterWall, lattice, icicles, crate, brazier, wp, fireLight, sackRow, noose, deadWillow,
} from './xp_kit';

addCardKind('xpstone', { kind: 'decal', w: 16, h: 16 }, g => {
  const r = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  for (const [x, y, w2, h2] of [[1, 3, 6, 4], [9, 2, 5, 3], [3, 10, 7, 4], [11, 9, 4, 3]] as const) {
    r(x, y, w2, h2, '#5a6670'); r(x, y, w2, 1, '#9eb0be'); r(x, y + h2 - 1, w2, 1, '#2c343c');
  }
});
addCardKind('xpfrost', { kind: 'cross', w: 16, h: 16, sway: 0.04 }, g => {
  const r = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  const cols = ['#4a564f', '#5a675f', '#3d4742'];
  for (const [x, h, k] of [[2, 7, 0], [5, 10, 1], [8, 12, 2], [11, 9, 0], [13, 6, 1]] as const) {
    r(x, 16 - h, 2, h, cols[k]); r(x, 16 - h, 2, 1, '#9aaab6');
  }
  r(1, 14, 14, 2, '#2a3336');
});

function clearShapeWalls(w: Ctx['w'], q: Rect, wc: number, dc: number) {
  const X0 = M(q.x0), Z0 = M(q.z0);
  w.box(X0, 0, Z0, X0 + wc - 1, 44, Z0 + dc - 1, null);
  const trim = (wx: number, wz: number) => {
    if (w.has(wx, 32, wz) || w.has(wx, 28, wz)) return;
    for (let y = 33; y <= 42; y++) w.set(wx, y, wz, null);
  };
  for (let x = -1; x <= wc; x++) { trim(X0 + x, Z0 - 1); trim(X0 + x, Z0 + dc); }
  for (let z = 0; z < dc; z++) { trim(X0 - 1, Z0 + z); trim(X0 + wc, Z0 + z); }
}

/** Dark-charcoal pitched Xuzhou roof (shows crisp dark tile ribs with subtle snow/frost ridge, NOT a flat white block!) */
function xuzhouRoof(
  B: ReturnType<typeof frame>, x0: number, x1: number, z0: number, z1: number, y0: number,
  cap: number, tiers = 3, th = 4,
) {
  let ya = y0, a = x0, b = x1, c = z0, e = z1;
  for (let i = 0; i < tiers; i++) {
    if (i > 0) { a += 4; b -= 4; c += 5; e -= 5; }
    if (a + 3 >= b || c + 3 >= e) break;
    B(a, ya, c, b, ya + th - 1, e, XP.tile);
    if (i === 0) {
      B(a, ya, c, b, ya, c, XP.tileD); B(a, ya, e, b, ya, e, XP.tileD);
      B(a, ya, c, a, ya, e, XP.tileD); B(b, ya, c, b, ya, e, XP.tileD);
    }
    for (let x = a + 2; x <= b - 2; x += 5) B(x, ya + th - 1, c, x, ya + th - 1, e, XP.tileL);
    // delicate frost strip along outer eave lip & top tier only (preserves dark tile silhouette!)
    B(a, ya + th - 1, e, b, ya + th - 1, e, cap);
    B(a, ya + th - 1, c, b, ya + th - 1, c, cap);
    ya += th;
  }
  const mz = Math.round((c + e) / 2);
  B(a + 2, ya, mz - 2, b - 2, ya + 2, mz + 2, XP.tileD);
  B(a + 2, ya + 3, mz - 1, b - 2, ya + 3, mz + 1, cap);
  // upturned gable finials
  B(a, ya, mz - 2, a + 3, ya + 5, mz + 2, XP.tileD);
  B(b - 3, ya, mz - 2, b, ya + 5, mz + 2, XP.tileD);
  return ya + 6;
}

/** Exclusive Xiapi `#` infill: 2-3 storey flooded canal halls, double-eave corner watchtowers, White Gate bastions & zero flat white boxes */
export function xiapiInfill(kind: 'lane' | 'wall' | 'gate'): NonNullable<Locale['infill']> {
  return (c, { rect: q, shape, p, back }) => {
    const w = c.w, B = frame(w, q.x0, q.z0);
    const wc = M(q.x1) - M(q.x0), dc = M(q.z1) - M(q.z0);
    const W = q.x1 - q.x0, D = q.z1 - q.z0;
    const cap = capCol(p);
    const box = shape?.box;
    const roomId = shape?.fixed?.id;
    const touchesW = !!box && q.x0 <= box.x0 + 0.15, touchesE = !!box && q.x1 >= box.x1 - 0.15;
    const touchesN = !!box && q.z0 <= box.z0 + 0.15, touchesS = !!box && q.z1 >= box.z1 - 0.15;
    const lit = p.time !== 'day';

    clearShapeWalls(w, q, wc, dc);
    B(0, -1, 0, wc - 1, -1, dc - 1, XP.stoneDD);

    // 1) Narrow 1-cell partition strips: unified wet brick rampart, sandbag dike or covered canal wall
    if (D < 2.6 || W < 2.6) {
      const alongX = W >= D;
      const H = kind === 'lane' ? 28 : 30;
      if (alongX) {
        const z0 = Math.max(2, Math.floor(dc / 2) - 5), z1 = Math.min(dc - 3, z0 + 10);
        B(0, 0, z0 - 1, wc - 1, 6, z1 + 1, XP.stoneD);
        B(0, 0, z0 - 1, wc - 1, 2, z1 + 1, XP.stoneDD);
        if (kind === 'lane') {
          plasterWall(B, 0, wc - 1, z0, z1, 7, H, { bay: 28 });
          xuzhouRoof(B, -1, wc, z0 - 2, z1 + 2, H + 1, cap, 2, 3);
        } else {
          B(0, 7, z0, wc - 1, H, z1, XP.stone);
          for (let y = 11; y < H; y += 5) B(0, y, z0, wc - 1, y, z1, XP.stoneD);
          for (let x = 0; x < wc; x += 14) {
            B(x, H + 1, z0, Math.min(wc - 1, x + 8), H + 6, z1, XP.stone);
            B(x, H + 7, z0, Math.min(wc - 1, x + 8), H + 7, z1, cap);
          }
        }
      } else {
        const x0 = Math.max(2, Math.floor(wc / 2) - 5), x1 = Math.min(wc - 3, x0 + 10);
        B(x0 - 1, 0, 0, x1 + 1, 6, dc - 1, XP.stoneD);
        B(x0, 7, 0, x1, H, dc - 1, kind === 'lane' ? XP.plaster : XP.stone);
        B(x0 - 1, H + 1, 0, x1 + 1, H + 3, dc - 1, XP.tile);
        B(x0, H + 4, 0, x1, H + 4, dc - 1, cap);
      }
      return;
    }

    // 2) Substantial blocks: bleed off-camera on touched perimeter edges!
    const extW = touchesW ? 64 : 0, extE = touchesE ? 64 : 0, extN = touchesN ? 56 : 0, extS = touchesS && !back ? 30 : 0;
    const x0 = -extW, x1 = wc - 1 + extE, z0 = -extN, z1 = dc - 1 + extS;
    B(x0 - 3, -1, z0 - 3, x1 + 3, -1, z1 + 3, XP.stoneDD);

    if (kind === 'lane') {
      // Flooded Xuzhou Canal House: tall 2-storey white-plaster + dark-timber hall on rear/flanks, camera-safe 1-storey on south!
      const isLandmark = touchesN && touchesW && wc >= 44 && dc >= 34;
      const H = touchesS ? 32 : (isLandmark ? 54 : (back ? 42 : 48));
      // flood-stained masonry quay base + dark water-mark line
      B(x0, 0, z0, x1, 6, z1, XP.stoneDD);
      B(x0, 7, z0, x1, 10, z1, XP.stoneD);
      B(x0, 11, z0, x1, 11, z1, XP.line);
      plasterWall(B, x0, x1, z0, z1, 12, H, { bay: 30 });
      // ground-floor lattice windows (warm lantern glow inside at dusk/night!)
      for (const wx of [Math.round(wc * 0.28), Math.round(wc * 0.72)].filter(v => v > 12 && v < wc - 12)) {
        lattice(B, wx - 6, wx + 6, z1, 18, 27);
        if (lit) B(wx - 4, 20, z1 - 1, wx + 4, 25, z1 - 1, 0xd89c4a, 1);
      }
      // 2nd-storey waist eave (腰檐) & upper timber balcony windows when tall!
      if (H >= 46) {
        B(x0 - 2, 31, z0 - 2, x1 + 2, 32, z1 + 3, XP.woodD);
        B(x0 - 2, 33, z1 + 1, x1 + 2, 34, z1 + 4, XP.tile);
        B(x0 - 2, 35, z1 + 2, x1 + 2, 35, z1 + 4, cap);
        for (const wx of [Math.round(wc * 0.25), Math.round(wc * 0.55), Math.round(wc * 0.80)].filter(v => v > 10 && v < wc - 10)) {
          lattice(B, wx - 5, wx + 5, z1, 38, Math.min(H - 4, 46));
          if (lit) B(wx - 3, 40, z1 - 1, wx + 3, 44, z1 - 1, 0xd89c4a, 1);
        }
      }
      const rTop = xuzhouRoof(B, x0 - 3, x1 + 3, z0 - 3, z1 + 3, H + 1, cap, H >= 46 ? 3 : 2, 5);
      icicles(B, Math.max(0, x0), Math.min(wc - 1, x1), z1 + 3, H, 3);

      // Iconic 3-Storey Canal Watch-Pavilion Landmark (三层临水谯楼, height ~6.9m = 98 voxels!) on primary NW block
      if (isLandmark) {
        const tx = Math.min(wc - 18, Math.max(14, Math.floor(wc * 0.48)));
        const tz = Math.min(dc - 16, Math.max(10, Math.floor(dc * 0.42)));
        const baseY = rTop - 4;
        B(tx - 15, baseY - 2, tz - 14, tx + 15, baseY + 18, tz + 14, XP.plaster);
        for (const ax of [-15, 13]) for (const az of [-14, 12]) B(tx + ax, baseY - 2, tz + az, tx + ax + 2, baseY + 20, tz + az + 2, XP.woodD);
        lattice(B, tx - 7, tx + 7, tz + 14, baseY + 4, baseY + 13);
        if (lit) B(tx - 5, baseY + 6, tz + 13, tx + 5, baseY + 11, tz + 13, 0xe8a84a, 1);
        // overhanging timber lookout balcony & crowning 3rd-tier roof
        B(tx - 18, baseY + 19, tz - 17, tx + 18, baseY + 20, tz + 17, XP.woodD);
        xuzhouRoof(B, tx - 21, tx + 21, tz - 20, tz + 20, baseY + 21, cap, 2, 4);
        // crimson winter fortress banner pole
        B(tx + 17, baseY, tz + 14, tx + 18, baseY + 34, tz + 15, XP.woodD);
        B(tx + 19, baseY + 16, tz + 14, tx + 27, baseY + 32, tz + 15, XP.redD);
        B(tx + 19, baseY + 30, tz + 14, tx + 27, baseY + 32, tz + 15, XP.red);
      }
      if (wc >= 36 && dc >= 30) crate(B, 10, dc - 6, 8, 6);
      return;
    }

    // 3) Fortified City Rampart Bastions & White Gate Tower Wings (kind === 'wall' | 'gate')
    // Strong asymmetric vertical hierarchy:
    //  - NW primary bastion -> soaring 2-3 storey Double-Eave Corner Watchtower / White Gate Side Tower (y up to 96 = 6.7m!)
    //  - NE secondary bastion -> mid-height crenellated bastion + single-storey garrison arrow-pavilion (y ~64)
    //  - South foreground -> camera-safe low breached rampart + sandbag dike (y ~32)
    const isPrimaryBastion = touchesN && touchesW && wc >= 46 && dc >= 36;
    const isSecondaryBastion = touchesN && touchesE && wc >= 38 && dc >= 34;
    const baseH = touchesS ? 28 : (isPrimaryBastion ? 44 : (isSecondaryBastion ? 38 : 34));

    // Solid flood-stained fortified masonry bastion base
    B(x0, 0, z0, x1, baseH, z1, XP.stone);
    B(x0, 0, z0, x1, 6, z1, XP.stoneDD);
    B(x0, 7, z0, x1, 14, z1, XP.brickW);
    B(x0, 15, z0, x1, 15, z1, XP.line);
    for (let y = 20; y < baseH; y += 5) B(x0, y, z0, x1, y, z1, XP.stoneD);
    // crenellated battlements facing the street with crisp frost caps (NOT solid white block roof!)
    for (let x = x0; x <= x1; x += 14) {
      B(x, baseH + 1, z1 - 4, Math.min(x1, x + 8), baseH + 6, z1, XP.stone);
      B(x, baseH + 7, z1 - 4, Math.min(x1, x + 8), baseH + 7, z1, cap);
    }
    B(x0, baseH + 1, z0, x1, baseH + 1, z1 - 5, XP.stoneD);

    const U = up(B, baseH + 2);
    if (isPrimaryBastion) {
      // Towering 2-storey Double-Eave Corner Watchtower / White Gate Wing Tower rising on the NW bastion!
      const px0 = Math.max(x0 + 8, -20), px1 = wc - 10, pz0 = Math.max(z0 + 8, -16), pz1 = dc - 10;
      plasterWall(U, px0, px1, pz0, pz1, 0, 24, { bay: 20 });
      for (const wx of [Math.round((px0 + px1) * 0.35), Math.round((px0 + px1) * 0.72)]) {
        if (wx > px0 + 8 && wx < px1 - 8) {
          lattice(U, wx - 6, wx + 6, pz1, 7, 17);
          if (lit) U(wx - 4, 9, pz1 - 1, wx + 4, 15, pz1 - 1, 0xe8a84a, 1);
        }
      }
      // 1st-tier heavy overhanging dark-tile skirt roof (腰檐)
      xuzhouRoof(U, px0 - 5, px1 + 5, pz0 - 5, pz1 + 6, 25, cap, 2, 4);
      // White Gate signature: hanging execution nooses from the projecting eave beam in baimen!
      if (roomId === 'baimen' || kind === 'gate') {
        for (const nx of [Math.max(10, wc - 42), Math.max(24, wc - 22)]) {
          noose(U, nx, pz1 + 5, 24, 16);
        }
      }
      // 2nd-storey recessed lookout tower + crowning pitched roof (soaring to y ~96 = 6.7m!)
      const u2x0 = Math.max(px0 + 12, 4), u2x1 = px1 - 10, u2z0 = Math.max(pz0 + 10, -4), u2z1 = pz1 - 6;
      if (u2x1 - u2x0 >= 22 && u2z1 - u2z0 >= 18) {
        plasterWall(U, u2x0, u2x1, u2z0, u2z1, 33, 50, { bay: 16 });
        const mx = Math.round((u2x0 + u2x1) / 2);
        lattice(U, mx - 6, mx + 6, u2z1, 37, 46);
        if (lit) U(mx - 4, 39, u2z1 - 1, mx + 4, 44, u2z1 - 1, 0xf0b254, 1);
        xuzhouRoof(U, u2x0 - 6, u2x1 + 6, u2z0 - 6, u2z1 + 6, 51, cap, 2, 4);
      }
      // torn crimson fortress war banner flying above the bastion corner
      U(wc - 6, 0, dc - 8, wc - 4, 46, dc - 6, XP.woodD);
      U(wc - 16, 28, dc - 7, wc - 6, 44, dc - 7, XP.redD);
      U(wc - 16, 42, dc - 7, wc - 6, 44, dc - 7, XP.red);
    } else if (isSecondaryBastion) {
      // Mid-height open timber garrison arrow-shed + stacked defence logs (distinctly lower & different silhouette from NW!)
      const px0 = 8, px1 = Math.min(x1 - 8, wc + 18), pz0 = Math.max(z0 + 8, -10), pz1 = dc - 12;
      for (const px of [px0, Math.round((px0 + px1) / 2), px1 - 2]) {
        for (const pz of [pz0, pz1 - 2]) U(px, 0, pz, px + 2, 22, pz + 2, XP.woodD);
      }
      plasterWall(U, px0, px1, pz0, pz0 + 3, 0, 21, { bay: 18 });
      xuzhouRoof(U, px0 - 4, px1 + 4, pz0 - 4, pz1 + 4, 23, cap, 2, 4);
      sackRow(U, 8, Math.min(wc - 8, 36), dc - 10, dc - 6, 2, cap);
    } else {
      // South foreground or mid bastion: low sandbag dike & timber barricade (100% camera-safe!)
      sackRow(U, 6, wc - 7, 6, Math.min(dc - 6, 12), 2, cap);
      if (wc >= 32 && dc >= 26) crate(U, Math.floor(wc * 0.5), Math.floor(dc * 0.55), 7, 5);
    }

    // Warm lit iron fire brazier perched on the bastion deck
    if (typeof (c as Partial<Ctx>).light === 'function') {
      const bf = brazier(U, Math.max(10, Math.min(wc - 10, Math.round(wc * 0.5))), Math.max(8, dc - 9), lit, 5);
      if (lit) fireLight(c, p, [q.x0 + bf[0] * CELL, (baseH + 2 + bf[1] + 3) * CELL, q.z0 + bf[2] * CELL], 0.8, 5.5);
    }
  };
}

/** Distant atmospheric misty river-fortress & snow-dusted Xuzhou mountain skyline + flanking canal houses on drawn rooms */
export function xiapiDistantBackdrop(c: Ctx, f: { layout: Layout; p: Place }, kind: 'lane' | 'wall' | 'gate') {
  const w = c.w, cap = capCol(f.p);
  const addMass = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: number, topC?: number, lowC?: number) => {
    plot(w).masses.push({
      x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      cx: 0, cz: 0, top: topC ?? tone(side, 1.12), side, low: lowC ?? tone(side, 0.76), band: 6,
    });
  };
  const farZ = Math.min(PLAY.z0 - 13, SZ(-22));

  // 1) Distant misty 3-storey Xuzhou city watchtowers & outer fortress silhouettes (远景寒雾古城楼剪影)
  for (const [cxM, dzM, wM, dM, tiers] of [
    [-32, -10, 14, 10, [[44, 0x4f5a64], [8, 0x2a3138], [30, 0x76828c], [8, 0x2a3138], [22, 0x6c7882], [9, 0x2a3138]]],
    [  0, -15, 22, 12, [[54, 0x55606a], [9, 0x2a3138], [36, 0x828e98], [9, 0x2a3138], [26, 0x76828c], [10, 0x2a3138]]],
    [ 34, -11, 15, 10, [[46, 0x4f5a64], [8, 0x2a3138], [32, 0x76828c], [8, 0x2a3138]]],
  ] as Array<[number, number, number, number, Array<[number, number]>]>) {
    const cx = M(cxM), cz = M(farZ + dzM);
    let hw = M(wM / 2), hd = M(dM / 2), y = -1;
    for (let ti = 0; ti < tiers.length; ti++) {
      const [hh, col] = tiers[ti];
      const isRoof = ti % 2 === 1;
      const rh = isRoof ? hw + 6 : hw, rd = isRoof ? hd + 5 : hd;
      addMass(cx - rh, y, cz - rd, cx + rh, y + hh, cz + rd, col, isRoof ? cap : tone(col, 1.08), tone(col, 0.75));
      y += hh + 1;
      if (isRoof) { hw = Math.max(12, Math.round(hw * 0.78)); hd = Math.max(10, Math.round(hd * 0.78)); }
    }
  }
  // 2) Receding snow-dusted Xuzhou winter mountain ridges (寒雾雪山远景层峦)
  for (const [x0, x1, dz0, dz1, h, col] of [
    [-95, -24, -30, -19, 132, 0x4a5764],
    [ 22,  95, -32, -20, 148, 0x465360],
    [-70,  70, -48, -28, 225, 0x3b4855],
  ] as const) {
    addMass(M(x0), -1, M(farZ + dz0), M(x1), h, M(farZ + dz1), col, 0x8a9aa8, tone(col, 0.76));
  }

  // 3) On drawn fixed rooms, populate flanking East & West outer flooded houses & dead willows (especially framing `islands`!)
  const drawn = f.layout.drawn;
  if (!drawn) return;
  const blocksExit = (side: 'left' | 'right', z: number) => {
    const ex = drawn[side];
    return !!ex && Math.abs(z - ex.z) < 4.2;
  };
  const checkEmpty = (X0: number, Z0: number, X1: number, Z1: number) => {
    for (let x = X0; x <= X1; x += 6) for (let z = Z0; z <= Z1; z += 6) {
      if (w.has(x, 8, z) || w.has(x, 22, z)) return false;
    }
    return true;
  };
  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'left' : 'right';
    const edgeX = side < 0 ? PLAY.x0 : PLAY.x1;
    for (let i = 0; i < 3; i++) {
      const zc = PLAY.z0 + 3.2 + i * ((PLAY.z1 - PLAY.z0 - 6.0) / 2);
      if (blocksExit(sideName, zc)) continue;
      const xc = edgeX + side * (5.6 + (i % 2) * 1.4);
      const cx = M(xc), cz = M(zc);
      if (!checkEmpty(cx - 30, cz - 24, cx + 30, cz + 24)) continue;
      const hh = kind === 'lane' ? (36 + (i % 2) * 14) : (42 + (i % 2) * 14);
      addMass(cx - 28, -1, cz - 22, cx + 28, 10, cz + 22, XP.stoneD, XP.stone, XP.stoneDD);
      addMass(cx - 26, 11, cz - 20, cx + 26, hh, cz + 20, kind === 'lane' ? XP.plaster : XP.stone, XP.plasterL, XP.plasterD);
      addMass(cx - 32, hh + 1, cz - 26, cx + 32, hh + 9, cz + 26, XP.tile, cap, XP.tileD);
      addMass(cx - 22, hh + 10, cz - 16, cx + 22, hh + 16, cz + 16, XP.tileD, cap, XP.tileD);
      if (i === 1) deadWillow(c, xc + side * 3.8, zc + 1.4, 5.6, f.p.seed + 300 + i + (side > 0 ? 40 : 0));
    }
  }
}

/** Street-edge & quay micro-detail for all Xiapi rooms: refined frost reeds, wet stone chips & low wall-root sandbag/stone clusters */
export function xiapiEdgeDress(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, sd = f.p.seed;
  const nearWall = (x: number, z: number) => {
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || w.has(X, 6, Z) || !w.has(X, -1, Z)) return false;
    return w.has(X + 9, 6, Z) || w.has(X - 9, 6, Z) || w.has(X, 6, Z + 9) || w.has(X, 6, Z - 9);
  };
  const nearWater = (x: number, z: number) => {
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || !w.has(X, -1, Z)) return false;
    return !w.has(X + 6, -1, Z) || !w.has(X - 6, -1, Z) || !w.has(X, -1, Z + 6) || !w.has(X, -1, Z - 6);
  };
  for (const [kind, count, sMin, sMax, salt, yOff] of [
    ['xpfrost', 54, 0.38, 0.62, 13, 0],
    ['xpstone', 86, 0.78, 1.22, 29, 0.012],
  ] as const) {
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 24) {
      tries++;
      const x = PLAY.x0 + 0.35 + hash(tries, sd + salt, 7) * (PLAY.x1 - PLAY.x0 - 0.7);
      const z = PLAY.z0 + 0.35 + hash(tries, sd + salt, 11) * (PLAY.z1 - PLAY.z0 - 0.7);
      if (!(nearWall(x, z) || nearWater(x, z))) continue;
      const y = ground(c, x, z); if (y == null || y > 0.08) continue;
      c.cards.add(kind, x, z, { y: y + yOff, s: sMin + hash(tries, sd, salt + 5) * (sMax - sMin), tint: 0xffffff });
      placed++;
    }
  }
}
