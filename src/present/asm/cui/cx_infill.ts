// 第五关 · 许都雪 · 崔府（cx_court / cx_gallery / cx_vault）深度精修版：
// 五间房各自拥有截然不同的豪门深宅建筑与园林意境（彻底破除四角同款大殿与室内下雪穿帮）：
//  - cx_study（三进书院）：东北三层重檐藏书阁（暖烛三层+飞檐翘角）、西北红梅太湖石偏院、东西不对称厢房与雪顶游廊；
//  - cx_garden（回廊雪园）：西北二层临水听雪轩（暖烛琴室+朱栏）、东北太湖假山红梅林水岸、中央双桥冰荷池；
//  - cx_alley（深宅夹道）：西北二层正宅重檐大堂、东北翠竹石灯八角茶亭、东翼机关秘库；
//  - cx_hall（藏刀阁 Boss · 纯室内）：彻底移除室外雪顶，改建室内二层朱漆藏刀回廊、满墙刀架、青铜连枝烛台与红木兵器屏风座；
//  - yard_5（梅雪偏院）：西北二层暖烛厢房 + 东北傲雪红梅假山石灯景；
//  - 场外远景（cuiDistantBackdrop）：东西两翼豪门深宅雪顶与红梅翠竹 + 远景许都雪夜重檐飞阁天际线与覆雪远山层峦。
import type { Ctx } from '../../scenes/stage';
import { M, PLAY, SZ, hash } from '../../scenes/props';
import { addCardKind } from '../../scenes/cards';
import { ground } from '../../scenes/dress';
import { plot, tone } from '../../scenes/flora';
import type { Layout, Locale, Place, Rect } from '../types';
import { CX, frame, roofK, plum, bamboo, bladeRack, column, wp } from './cx_kit';

addCardKind('cxpetal', { kind: 'decal', w: 16, h: 16 }, g => {
  const r = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  for (const [x, y, c] of [[2, 2, '#d84a5a'], [9, 3, '#f08090'], [5, 8, '#c23a4a'], [12, 9, '#e66474'], [3, 13, '#f08090'], [10, 13, '#d84a5a']] as const) {
    r(x, y, 2, 2, c);
  }
});
addCardKind('cxsnow', { kind: 'decal', w: 16, h: 16 }, g => {
  const r = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  r(1, 2, 7, 4, '#c8d0dc'); r(2, 2, 5, 1, '#e6ecf4'); r(1, 5, 7, 1, '#8c96a6');
  r(9, 8, 6, 4, '#bcc6d4'); r(10, 8, 4, 1, '#e6ecf4'); r(3, 11, 4, 3, '#6c707a');
});

type Bx = ReturnType<typeof frame>;

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

/** Graceful upturned aristocratic Cui Manor snow-dusted black-tile roof (crisp ribbed black tile + clean snow cap!) */
function manorRoof(B: Bx, x0: number, x1: number, z0: number, z1: number, y0: number, tiers = 3, th = 4) {
  let ya = y0, a = x0, b = x1, c = z0, e = z1;
  for (let i = 0; i < tiers; i++) {
    if (i > 0) { a += 4; b -= 4; c += 5; e -= 5; }
    if (a + 3 >= b || c + 3 >= e) break;
    B(a, ya, c, b, ya + th - 1, e, CX.tile);
    if (i === 0) {
      B(a, ya, c, b, ya, c, CX.tileD); B(a, ya, e, b, ya, e, CX.tileD);
      B(a, ya, c, a, ya, e, CX.tileD); B(b, ya, c, b, ya, e, CX.tileD);
      // upturned aristocratic corner eaves
      for (const cx of [a, b - 1]) for (const cz of [c, e - 1]) B(cx, ya + th, cz, cx + 1, ya + th + 1, cz + 1, CX.tile);
    }
    for (let x = a + 2; x <= b - 2; x += 5) B(x, ya + th - 1, c, x, ya + th - 1, e, CX.tileL);
    // clean winter snow ledge along the eave edges (keeps dark tile depth visible!)
    B(a, ya + th - 1, e, b, ya + th - 1, e, CX.snow);
    B(a, ya + th - 1, c, b, ya + th - 1, c, CX.snow);
    ya += th;
  }
  const mz = Math.round((c + e) / 2);
  B(a + 2, ya, mz - 2, b - 2, ya + 2, mz + 2, CX.tileD);
  B(a + 2, ya + 3, mz - 1, b - 2, ya + 3, mz + 1, CX.snow);
  B(a, ya, mz - 2, a + 3, ya + 5, mz + 2, CX.tileD);
  B(b - 3, ya, mz - 2, b, ya + 5, mz + 2, CX.tileD);
  return ya + 6;
}

/** Sculptural gnarled crimson winter plum tree with full layered blossom clouds (傲雪老红梅, 100% solid connected boughs) */
function lushPlumTree(B: Bx, x: number, y: number, z: number, H: number, seed: number) {
  const dir = seed % 2 === 0 ? 1 : -1;
  // gnarled dark trunk rising & leaning slightly
  B(x - 2, y, z - 2, x + 2, y + 6, z + 2, CX.ink);
  B(x - 1, y + 7, z - 1, x + 2, y + Math.floor(H * 0.45), z + 1, CX.ink);
  const mx = x + dir * 3, my = y + Math.floor(H * 0.45);
  B(Math.min(x, mx) - 1, my - 2, z - 1, Math.max(x, mx) + 1, my + 2, z + 1, CX.ink);
  B(mx - 1, my, z - 1, mx + 1, y + Math.floor(H * 0.8), z + 1, CX.ink);
  // two sweeping side boughs
  const b1x = mx + dir * 10, b1y = y + Math.floor(H * 0.68), b1z = z + 3;
  B(Math.min(mx, b1x), b1y - 2, z - 1, Math.max(mx, b1x), b1y, b1z, CX.ink);
  const b2x = mx - dir * 10, b2y = y + Math.floor(H * 0.58), b2z = z - 3;
  B(Math.min(mx, b2x), b2y - 2, b2z, Math.max(mx, b2x), b2y, z + 1, CX.ink);
  // bold multi-tiered crimson & soft-pink blossom canopies resting cleanly on the boughs (never floating!)
  const canopy = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) => {
    B(cx - rx, cy, cz - rz, cx + rx, cy + ry, cz + rz, CX.blossom);
    B(cx - rx + 2, cy + ry + 1, cz - rz + 1, cx + rx - 2, cy + ry + 2, cz + rz - 1, CX.blossomL);
    B(cx - rx + 3, cy + ry + 3, cz - rz + 2, cx + rx - 3, cy + ry + 3, cz + rz - 2, CX.snow);
  };
  canopy(mx, y + Math.floor(H * 0.78), z, 11, 5, 9);
  canopy(b1x, b1y, b1z, 9, 4, 8);
  canopy(b2x, b2y, b2z, 8, 4, 7);
}

/** Sculptural carved Taihu scholar's rockery (太湖假山石) + snow cap */
function taihuRock(B: Bx, x: number, y: number, z: number, scale = 1) {
  const s = (v: number) => Math.max(1, Math.round(v * scale));
  B(x - s(10), y, z - s(7), x + s(10), y + s(7), z + s(7), CX.stoneD);
  B(x - s(8), y + s(8), z - s(5), x + s(6), y + s(16), z + s(5), CX.stone);
  B(x - s(3), y + s(10), z - s(2), x + s(2), y + s(13), z + s(2), null); // classic Taihu hollow aperture!
  B(x - s(6), y + s(17), z - s(4), x + s(9), y + s(24), z + s(4), CX.stone);
  B(x - s(5), y + s(25), z - s(3), x + s(8), y + s(25), z + s(3), CX.snow);
  B(x + s(6), y + s(8), z - s(4), x + s(12), y + s(13), z + s(4), CX.stoneD);
  B(x + s(7), y + s(14), z - s(3), x + s(11), y + s(14), z + s(3), CX.snow);
}

/** Glowing carved stone garden lantern (庭院石灯笼) */
function stoneLantern(c: Ctx, q: Rect, B: Bx, x: number, y: number, z: number) {
  B(x - 4, y, z - 4, x + 4, y + 2, z + 4, CX.stoneD);
  B(x - 2, y + 3, z - 2, x + 2, y + 12, z + 2, CX.stone);
  B(x - 4, y + 13, z - 4, x + 4, y + 14, z + 4, CX.stoneD);
  B(x - 2, y + 15, z - 2, x + 2, y + 19, z + 2, 0xf0be78, 1);
  for (const a of [-3, 3]) for (const b of [-3, 3]) B(x + a, y + 15, z + b, x + a, y + 19, z + b, CX.stoneD);
  B(x - 5, y + 20, z - 5, x + 5, y + 21, z + 5, CX.stone);
  B(x - 3, y + 22, z - 3, x + 3, y + 22, z + 3, CX.snow);
  if (typeof (c as Partial<Ctx>).light === 'function') {
    c.light(wp(q.x0, q.z0, 0, x, y + 17, z + 4), 0xffbe7e, 2.2, 5.5);
  }
}

/** Warm candlelit lattice window helper on a Cui Manor wall */
function manorWindow(B: Bx, wx: number, y0: number, y1: number, zf: number) {
  B(wx - 6, y0, zf - 2, wx + 6, y1, zf, null);
  B(wx - 6, y0, zf - 3, wx + 6, y1, zf - 3, 0xe2b068, 1);
  for (let u = wx - 5; u <= wx + 5; u += 3) B(u, y0, zf - 1, u, y1, zf - 1, CX.woodD);
  B(wx - 7, y0 - 1, zf, wx + 7, y0 - 1, zf + 1, CX.woodD);
  B(wx - 7, y1 + 1, zf, wx + 7, y1 + 1, zf + 1, CX.woodD);
}

/** Hanging glowing red palace silk lantern under eaves */
function eaveLantern(B: Bx, x: number, y: number, z: number) {
  B(x, y + 5, z, x, y + 8, z, CX.ink);
  B(x - 2, y, z - 2, x + 2, y + 4, z + 2, CX.red);
  B(x - 1, y + 1, z - 2, x + 1, y + 3, z + 2, 0xf2b868, 1);
}

/** Exclusive Cui Manor `#` infill: 5 rooms, 5 completely distinct snow-night noble manor & indoor blade-vault identities! */
export function cuiInfill(kind: 'court' | 'gallery' | 'vault', innerPool?: (c: Ctx, r: Rect) => void): NonNullable<Locale['infill']> {
  return (c, { rect: q, shape, p, back }) => {
    const w = c.w, B = frame(w, q.x0, q.z0);
    const wc = M(q.x1) - M(q.x0), dc = M(q.z1) - M(q.z0);
    const W = q.x1 - q.x0, D = q.z1 - q.z0;
    const box = shape?.box;
    const roomId = shape?.fixed?.id;
    const touchesW = !!box && q.x0 <= box.x0 + 0.15, touchesE = !!box && q.x1 >= box.x1 - 0.15;
    const touchesN = !!box && q.z0 <= box.z0 + 0.15, touchesS = !!box && q.z1 >= box.z1 - 0.15;

    // Preserve classical frozen lotus pond courtyard for interior islands in procedural cx_gallery (e.g. cloister)
    if (innerPool && !touchesW && !touchesE && !touchesN && !touchesS && W >= 4.5 && D >= 4.5) {
      innerPool(c, q);
      return;
    }

    clearShapeWalls(w, q, wc, dc);

    // ===================== A) INDOOR BLADE VAULT (cx_hall Boss — ZERO OUTDOOR SNOW ROOFS!) =====================
    if (kind === 'vault') {
      const TIMBER = 0x543b2e, PANEL = 0x664838, DARK = 0x362720;
      B(0, -1, 0, wc - 1, -1, dc - 1, 0x69503c);
      if (touchesS) {
        // Low indoor rosewood weapon-stand pedestal & lacquered folding screen (camera-safe H = 22!)
        B(2, 0, 2, wc - 3, 4, dc - 3, DARK);
        B(4, 5, Math.floor(dc * 0.45), wc - 5, 22, Math.floor(dc * 0.45) + 2, PANEL);
        B(3, 21, Math.floor(dc * 0.45) - 1, wc - 4, 23, Math.floor(dc * 0.45) + 3, CX.redD);
        if (wc >= 28) bladeRack(B, 8, wc - 9, Math.floor(dc * 0.45) + 4, 5, 5, p.seed);
        // glowing bronze candle pedestal at inner corner
        const cx = touchesW ? wc - 7 : 7;
        B(cx - 3, 5, 4, cx + 3, 14, 10, CX.bronzeD);
        B(cx - 2, 15, 5, cx + 2, 18, 9, 0xf2b460, 1);
        if (typeof (c as Partial<Ctx>).light === 'function') c.light(wp(q.x0, q.z0, 0, cx, 18, 4), 0xffb270, 2.0, 6);
        return;
      }
      // North indoor grand 2-storey lacquered Blade-Gallery Balcony (室内二层朱漆藏刀回廊!)
      B(0, 0, 0, wc - 1, 4, dc - 1, DARK);
      B(0, 5, 0, wc - 1, 36, 8, TIMBER);
      B(4, 6, 9, wc - 5, 32, 10, PANEL);
      // Lower gallery gleaming steel blade racks!
      if (wc >= 32) bladeRack(B, 8, wc - 9, 12, 5, 8, p.seed + 3);
      // Crimson lacquered interior pillars along the balcony front
      for (let x = 3; x <= wc - 5; x += 24) column(B, x, dc - 4, 38);
      // 2nd-storey overhanging wooden mezzanine balcony + crimson railing + upper illuminated blade showcase!
      B(0, 24, 0, wc - 1, 26, dc - 2, DARK);
      B(0, 27, dc - 4, wc - 1, 31, dc - 2, CX.redD);
      B(0, 31, dc - 4, wc - 1, 32, dc - 2, CX.red);
      if (wc >= 36) {
        bladeRack(B, 10, wc - 11, 14, 27, 7, p.seed + 11);
        // crimson & gold Cui Clan banners hung from mezzanine beam
        for (const bx of [14, wc - 16]) {
          B(bx - 4, 12, dc - 2, bx + 4, 24, dc - 1, CX.red);
          B(bx - 2, 16, dc - 1, bx + 2, 20, dc, 0xd8a852);
        }
      }
      // Tall bronze multi-branch candelabra casting rich warm light across the blade racks!
      const lx = Math.floor(wc * 0.5);
      B(lx - 4, 5, dc - 9, lx + 4, 7, dc - 3, CX.bronzeD);
      B(lx - 1, 8, dc - 7, lx + 1, 20, dc - 5, CX.bronze);
      B(lx - 5, 21, dc - 8, lx + 5, 22, dc - 4, CX.bronze);
      B(lx - 4, 23, dc - 7, lx - 2, 26, dc - 5, 0xf5b660, 1);
      B(lx + 2, 23, dc - 7, lx + 4, 26, dc - 5, 0xf5b660, 1);
      if (typeof (c as Partial<Ctx>).light === 'function') c.light(wp(q.x0, q.z0, 0, lx, 24, dc + 4), 0xffb270, 2.8, 8);
      return;
    }

    // ===================== B) OUTDOOR SNOWY CUI MANOR =====================
    B(0, -1, 0, wc - 1, -1, dc - 1, CX.snow);

    // 1) Narrow 1-cell partition strips: covered crimson-column winter veranda OR snow-capped garden wall!
    if (D < 2.6 || W < 2.6) {
      const alongX = W >= D;
      const H = 28;
      if (alongX) {
        if ((kind === 'gallery' || roomId === 'cx_study') && wc >= 38) {
          B(0, 0, 0, wc - 1, 4, dc - 1, CX.stoneD);
          B(0, 5, 1, wc - 1, H, 5, CX.plaster);
          for (let x = 2; x <= wc - 4; x += 24) B(x, 5, dc - 4, x + 2, H, dc - 2, CX.red);
          B(0, H - 1, dc - 4, wc - 1, H, dc - 2, CX.woodD);
          manorRoof(B, -1, wc, -1, dc, H + 1, 2, 3);
          eaveLantern(B, Math.floor(wc * 0.5), H - 7, dc - 2);
        } else {
          const z0 = Math.max(2, Math.floor(dc / 2) - 4), z1 = Math.min(dc - 3, z0 + 8);
          B(0, 0, z0 - 1, wc - 1, 4, z1 + 1, CX.brickD);
          B(0, 5, z0, wc - 1, H, z1, CX.plaster);
          manorRoof(B, -1, wc, z0 - 2, z1 + 2, H + 1, 2, 3);
        }
      } else {
        const x0 = Math.max(2, Math.floor(wc / 2) - 4), x1 = Math.min(wc - 3, x0 + 8);
        B(x0 - 1, 0, 0, x1 + 1, 4, dc - 1, CX.brickD);
        B(x0, 5, 0, x1, H, dc - 1, CX.plaster);
        B(x0 - 2, H + 1, 0, x1 + 2, H + 2, dc - 1, CX.tile);
        B(x0 - 1, H + 3, 0, x1 + 1, H + 4, dc - 1, CX.snow);
      }
      return;
    }

    // 2) Substantial blocks: bleed off-camera on touched perimeter edges!
    const extW = touchesW ? 64 : 0, extE = touchesE ? 64 : 0, extN = touchesN ? 56 : 0, extS = touchesS && !back ? 28 : 0;
    const x0 = -extW, x1 = wc - 1 + extE, z0 = -extN, z1 = dc - 1 + extS;
    B(x0 - 3, -1, z0 - 3, x1 + 3, -1, z1 + 3, CX.snow);

    const isNW = touchesN && touchesW, isNE = touchesN && touchesE;

    // --- Archetype 1: Sculptural Taihu Rockery & Blossoming Crimson Plum Garden (假山红梅庭院) ---
    const isPlumGarden = ((roomId === 'cx_study' || roomId === 'cx_bamboo' || roomId === 'cx_archive') && isNW)
      || ((roomId === 'cx_garden' || roomId === 'cx_lotus' || roomId === 'yard_5') && isNE);
    if (isPlumGarden) {
      // carved snowy stone garden terrace + white-plaster perimeter wall on outer back/side edges
      B(x0, 0, z0, x1, 3, z1, CX.stoneD);
      B(x0, 4, z0, x1, 4, z1, CX.snow);
      // outer rear garden wall with upturned snow coping so it frames the garden cleanly
      B(x0, 5, z0, x1, 28, z0 + 6, CX.plaster);
      manorRoof(B, x0 - 2, x1 + 2, z0 - 2, z0 + 8, 29, 2, 3);
      if (touchesW) B(x0, 5, z0, x0 + 6, 26, z1, CX.plaster);
      if (touchesE) B(x1 - 6, 5, z0, x1, 26, z1, CX.plaster);
      // Centerpiece: towering sculptural Taihu scholar's rockery + lush crimson-blossoming winter plum trees + bamboo!
      const gx = Math.floor(wc * 0.46), gz = Math.floor(dc * 0.56);
      taihuRock(B, gx, 5, gz, 1.25);
      lushPlumTree(B, Math.max(12, gx - 16), 5, Math.max(12, gz - 10), 46, p.seed + 17);
      if (wc >= 42) lushPlumTree(B, Math.min(wc - 12, gx + 18), 5, Math.min(dc - 12, gz + 4), 38, p.seed + 31);
      // winter bamboo screen tucked against the white rear wall
      bamboo(frame(w, q.x0 + 0.9, q.z0 + 0.5), 0, Math.min(28, wc - 14), 0, 52, p.seed + 13);
      // On cx_garden / cx_lotus NE: add a crimson-pillared snow-capped Lakeside Viewing Arbor (临水赏梅亭) on the outer east flank!
      if ((roomId === 'cx_garden' || roomId === 'cx_lotus') && wc >= 48) {
        const ax = wc - 16, az = Math.floor(dc * 0.48);
        B(ax - 15, 5, az - 13, ax + 15, 7, az + 13, CX.stone);
        for (const ox of [-12, 10]) for (const oz of [-10, 8]) column(B, ax + ox, az + oz, 34);
        B(ax - 12, 8, az - 10, ax + 12, 13, az - 9, CX.red);
        B(ax + 11, 8, az - 10, ax + 12, 13, az + 10, CX.red);
        const rA = manorRoof(B, ax - 19, ax + 19, az - 17, az + 17, 35, 2, 4);
        manorRoof(B, ax - 11, ax + 11, az - 9, az + 9, rA - 1, 2, 3);
        eaveLantern(B, ax, 27, az + 9);
      }
      stoneLantern(c, q, B, Math.min(wc - 8, Math.max(8, touchesW ? wc - 10 : 10)), 5, dc - 9);
      return;
    }

    // --- Archetype 2: Winter Bamboo & Open Snow-Roofed Tea Pavilion (竹影石灯茶亭) ---
    if ((roomId === 'cx_alley' || roomId === 'cx_pavilion') && isNE) {
      B(x0, 0, z0, x1, 5, z1, CX.stoneD);
      B(x0, 5, z0, x1, 5, z1, CX.stone);
      // open crimson-pillared hexagonal/square tea pavilion with double snow roof & central glowing table lantern
      const px = Math.floor(wc * 0.45), pz = Math.floor(dc * 0.52);
      for (const a of [-16, 14]) for (const b of [-14, 12]) column(B, px + a, pz + b, 34);
      // crimson decorative lattice balustrade around 3 sides
      B(px - 16, 6, pz - 14, px + 16, 12, pz - 13, CX.red);
      B(px + 15, 6, pz - 14, px + 16, 12, pz + 14, CX.red);
      B(px - 16, 6, pz - 14, px - 15, 12, pz + 14, CX.red);
      const r1 = manorRoof(B, px - 23, px + 23, pz - 20, pz + 20, 35, 2, 4);
      // upper lantern cupola (二层亭顶)
      B(px - 10, r1 - 2, pz - 8, px + 10, r1 + 10, pz + 8, CX.redD);
      B(px - 5, r1 + 1, pz + 8, px + 5, r1 + 7, pz + 9, 0xf2bc6a, 1);
      manorRoof(B, px - 15, px + 15, pz - 13, pz + 13, r1 + 11, 2, 3);
      stoneLantern(c, q, B, 9, 6, dc - 9);
      // lush winter bamboo cluster framing behind & east of the pavilion!
      bamboo(frame(w, q.x0 + (wc + 10) * 0.07, q.z0 + 1.0), -10, 14, 0, 54, p.seed + 7);
      bamboo(frame(w, q.x0 + 1.2, q.z0 - 1.2), -10, 14, 0, 50, p.seed + 19);
      return;
    }

    // --- Archetype 3: South Foreground Low Veranda / Garden Wall (camera-safe H = 28..32!) ---
    if (touchesS) {
      const H = 30;
      B(x0, 0, z0, x1, 4, z1, CX.brickD);
      B(x0, 5, z0, x1, 5, z1, CX.stone);
      B(x0, 6, z0, x1, H, z1, CX.plaster);
      for (let x = x0; x <= x1; x += 26) B(Math.min(x, x1 - 2), 6, z0, Math.min(x, x1 - 2) + 2, H, z0 + 2, CX.red);
      manorRoof(B, x0 - 3, x1 + 3, z0 - 3, z1 + 3, H + 1, 2, 4);
      if (wc >= 32) stoneLantern(c, q, B, touchesW ? wc - 8 : 8, 6, 8);
      return;
    }

    // --- Archetype 4: Towering 2-Storey / 3-Storey Snow-Crowned Aristocratic Cui Manor Halls! ---
    // Iconic 3-Storey Clan Library / Listening-Snow Pavilion on primary landmark blocks!
    const isThreeStorey = ((roomId === 'cx_study' || roomId === 'cx_bamboo' || roomId === 'cx_archive') && isNE)
      || ((roomId === 'cx_garden' || roomId === 'cx_alley' || roomId === 'cx_lotus' || roomId === 'cx_pavilion') && isNW)
      || (roomId === 'cx_vault_wing' && !touchesW && !touchesE && !touchesN && !touchesS);
    const H1 = isThreeStorey ? 42 : 36;

    // Dressed-stone plinth + white plaster + crimson colonnade + warm candlelit lattice windows
    B(x0, 0, z0, x1, 5, z1, CX.brickD);
    B(x0, 6, z0, x1, 6, z1, CX.stone);
    B(x0, 7, z0, x1, H1, z1, CX.plaster);
    B(x0, 7, z0, x1, 9, z1, CX.plasterD);
    for (let x = x0; x <= x1; x += 28) {
      const px = Math.min(x, x1 - 2);
      B(px, 7, z1 - 2, px + 2, H1, z1, CX.red);
      B(px, 7, z0, px + 2, H1, z0 + 2, CX.redD);
    }
    B(x0, H1 - 2, z1 - 2, x1, H1, z1, CX.woodD);
    B(x0, H1 - 3, z1, x1, H1 - 3, z1, CX.redD);

    const winXs = [Math.round(wc * 0.24), Math.round(wc * 0.50), Math.round(wc * 0.76)].filter(v => v > 12 && v < wc - 12);
    for (const wx of winXs.slice(0, 3)) manorWindow(B, wx, 15, 27, z1);
    for (const lx of [12, wc - 14].filter(v => v > 6 && v < wc - 6)) eaveLantern(B, lx, H1 - 8, z1 + 2);
    if (winXs.length && typeof (c as Partial<Ctx>).light === 'function') {
      c.light(wp(q.x0, q.z0, 0, winXs[0], 22, z1 + 6), 0xffb878, 2.1, 6.5);
    }

    // 1st-tier heavy upturned snow-rimmed dark tile roof (腰檐)
    const r1Top = manorRoof(B, x0 - 4, x1 + 4, z0 - 4, z1 + 5, H1 + 1, 2, 4);

    // 2nd-storey aristocratic recessed pavilion (二层重檐楼阁) on all non-south north/flank halls!
    if (wc >= 42 && dc >= 30) {
      const s2x0 = touchesW ? Math.max(x0 + 14, -22) : 8;
      const s2x1 = touchesE ? Math.min(x1 - 14, wc + 22) : wc - 9;
      const s2z0 = Math.max(z0 + 10, -16), s2z1 = z1 - 5;
      const y2 = r1Top - 2, H2 = 24;
      if (s2x1 - s2x0 >= 28 && s2z1 - s2z0 >= 18) {
        B(s2x0, y2, s2z0, s2x1, y2 + H2, s2z1, CX.plaster);
        for (let x = s2x0; x <= s2x1; x += 24) B(Math.min(x, s2x1 - 2), y2, s2z1 - 2, Math.min(x, s2x1 - 2) + 2, y2 + H2, s2z1, CX.red);
        // crimson 2nd-floor balcony railing
        B(s2x0 - 3, y2 + 1, s2z1 + 1, s2x1 + 3, y2 + 5, s2z1 + 3, CX.red);
        for (const wx of winXs.slice(0, 2)) {
          if (wx > s2x0 + 9 && wx < s2x1 - 9) manorWindow(B, wx, y2 + 7, y2 + 17, s2z1);
        }
        const r2Top = manorRoof(B, s2x0 - 5, s2x1 + 5, s2z0 - 5, s2z1 + 6, y2 + H2 + 1, 2, 4);

        // 3rd-storey Crowning Snow-Watching / Clan Library Belvedere (三层飞阁, soaring to ~6.8m = 98 voxels!)
        if (isThreeStorey) {
          const mx = Math.min(wc - 18, Math.max(18, Math.floor(wc * 0.5))), mz = Math.max(s2z0 + 10, Math.floor((s2z0 + s2z1) / 2));
          B(mx - 14, r2Top - 2, mz - 10, mx + 14, r2Top + 15, mz + 10, CX.plaster);
          for (const ax of [-14, 12]) for (const az of [-10, 8]) B(mx + ax, r2Top - 2, mz + az, mx + ax + 2, r2Top + 16, mz + az + 2, CX.red);
          manorWindow(B, mx, r2Top + 3, r2Top + 11, mz + 10);
          manorRoof(B, mx - 20, mx + 20, mz - 15, mz + 15, r2Top + 16, 2, 4);
        }
      }
    }

    // Blooming crimson winter plum tree tucked cleanly outside a rear corner
    if (touchesN && !back && wc >= 44) {
      plum(frame(w, touchesW ? q.x0 - 1.6 : q.x1 + 1.6, q.z0 - 1.2), 0, 0, 44, p.seed + 5);
    }
  };
}

/** Distant atmospheric Xudu snow-night aristocratic capital skyline & winter mountain horizon + flanking manor roofs/plums */
export function cuiDistantBackdrop(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w;
  const addMass = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: number, topC?: number, lowC?: number) => {
    plot(w).masses.push({
      x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      cx: 0, cz: 0, top: topC ?? tone(side, 1.12), side, low: lowC ?? tone(side, 0.72), band: 6,
    });
  };
  const farZ = Math.min(PLAY.z0 - 13, SZ(-22));

  // 1) Distant Xudu Snowy Aristocratic Mansions & 3-Storey Pagoda Pavilions (远景许都雪夜重檐府邸剪影)
  for (const [cxM, dzM, wM, dM, tiers] of [
    [-34, -10, 16, 10, [[42, 0x4e5968], [8, 0x222a36], [30, 0x626e7e], [8, 0x222a36], [22, 0x566272], [9, 0x222a36]]],
    [  0, -15, 24, 12, [[52, 0x566272], [9, 0x222a36], [38, 0x6c7888], [9, 0x222a36], [26, 0x5e6a7a], [10, 0x222a36]]],
    [ 34, -11, 17, 10, [[46, 0x4e5968], [8, 0x222a36], [32, 0x626e7e], [8, 0x222a36]]],
  ] as Array<[number, number, number, number, Array<[number, number]>]>) {
    const cx = M(cxM), cz = M(farZ + dzM);
    let hw = M(wM / 2), hd = M(dM / 2), y = -1;
    for (let ti = 0; ti < tiers.length; ti++) {
      const [hh, col] = tiers[ti];
      const isRoof = ti % 2 === 1;
      const rh = isRoof ? hw + 6 : hw, rd = isRoof ? hd + 5 : hd;
      addMass(cx - rh, y, cz - rd, cx + rh, y + hh, cz + rd, col, isRoof ? CX.snow : tone(col, 1.08), tone(col, 0.74));
      y += hh + 1;
      if (isRoof) { hw = Math.max(12, Math.round(hw * 0.78)); hd = Math.max(10, Math.round(hd * 0.78)); }
    }
  }

  // 2) Receding Moonlit Snow-Capped Xudu Mountain Ridges (许都雪夜远山层峦)
  for (const [x0, x1, dz0, dz1, h, col] of [
    [-98, -24, -32, -20, 140, 0x2e3c4c],
    [ 20,  98, -34, -22, 156, 0x2a3848],
    [-72,  72, -50, -30, 235, 0x222e3d],
  ] as const) {
    addMass(M(x0), -1, M(farZ + dz0), M(x1), h, M(farZ + dz1), col, 0x7e92a6, tone(col, 0.72));
  }

  // 3) Flanking East & West snowy noble manor roofs, crimson plum groves & winter bamboo on drawn rooms
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
      const zc = PLAY.z0 + 3.4 + i * ((PLAY.z1 - PLAY.z0 - 6.4) / 2);
      if (blocksExit(sideName, zc)) continue;
      const xc = edgeX + side * (5.6 + (i % 2) * 1.3);
      const cx = M(xc), cz = M(zc);
      if (!checkEmpty(cx - 28, cz - 22, cx + 28, cz + 22)) continue;
      const hh = 38 + (i % 2) * 14;
      addMass(cx - 26, -1, cz - 20, cx + 26, 6, cz + 20, CX.stoneD, CX.stone, CX.brickD);
      addMass(cx - 24, 7, cz - 18, cx + 24, hh, cz + 18, CX.plaster, CX.plaster, CX.plasterD);
      addMass(cx - 30, hh + 1, cz - 24, cx + 30, hh + 8, cz + 24, CX.tile, CX.snow, CX.tileD);
      if (i === 1) plum(frame(w, xc - side * 2.2, zc + 1.8), 0, 0, 46, f.p.seed + 50 + (side > 0 ? 11 : 0));
    }
  }
}

/** Snowy courtyard micro-detail for all Cui Manor rooms: fallen crimson plum petals, snow drifts & wall-root stone curbs/mini lanterns */
export function cuiEdgeDress(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, sd = f.p.seed;
  const nearWall = (x: number, z: number) => {
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || w.has(X, 6, Z) || !w.has(X, -1, Z)) return false;
    return w.has(X + 9, 6, Z) || w.has(X - 9, 6, Z) || w.has(X, 6, Z + 9) || w.has(X, 6, Z - 9);
  };
  const hitsPath = (x: number, z: number) => (f.layout.path ?? []).some(q => x > q.x0 - 0.5 && x < q.x1 + 0.5 && z > q.z0 - 0.5 && z < q.z1 + 0.5);
  for (const [kind, count, sMin, sMax, salt] of [
    ['cxpetal', 105, 0.78, 1.25, 11],
    ['cxsnow', 86, 0.85, 1.35, 23],
  ] as const) {
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 24) {
      tries++;
      const x = PLAY.x0 + 0.35 + hash(tries, sd + salt, 7) * (PLAY.x1 - PLAY.x0 - 0.7);
      const z = PLAY.z0 + 0.35 + hash(tries, sd + salt, 17) * (PLAY.z1 - PLAY.z0 - 0.7);
      if (!nearWall(x, z)) continue;
      const y = ground(c, x, z); if (y == null || y > 0.08) continue;
      c.cards.add(kind, x, z, { y: y + 0.012, s: sMin + hash(tries, sd, salt + 3) * (sMax - sMin), tint: 0xffffff });
      placed++;
    }
  }
  // Low 3D wall-root Taihu garden stones & snow-capped stone pedestals (non-blocking, zero path obstruction!)
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 200 && pts.length < 12; i++) {
    const x = PLAY.x0 + 0.7 + hash(i, sd, 61) * (PLAY.x1 - PLAY.x0 - 1.4);
    const z = PLAY.z0 + 0.7 + hash(i, sd, 67) * (PLAY.z1 - PLAY.z0 - 1.4);
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || !w.has(X, -1, Z) || hitsPath(x, z)) continue;
    if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.8)) continue;
    const touchN = w.has(X, 6, Z - 6) && !w.has(X, 1, Z + 12) && !w.has(X - 5, 1, Z) && !w.has(X + 5, 1, Z);
    if (!touchN) continue;
    if (pts.length % 2 === 0) {
      // snow-dusted mini garden boulder cluster
      w.box(X - 3, 0, Z - 2, X + 2, 3, Z + 2, CX.stoneD);
      w.box(X - 2, 4, Z - 1, X + 1, 5, Z + 1, CX.stone);
      w.box(X - 2, 6, Z - 1, X + 1, 6, Z + 1, CX.snow);
    } else {
      // carved low bronze incense brazier / garden lantern stump
      w.box(X - 2, 0, Z - 2, X + 2, 2, Z + 2, CX.stoneD);
      w.box(X - 1, 3, Z - 1, X + 1, 6, Z + 1, CX.bronzeD);
      w.box(X - 1, 7, Z - 1, X + 1, 7, Z + 1, 0xe6aa60, 1);
    }
    pts.push([x, z]);
  }
}
