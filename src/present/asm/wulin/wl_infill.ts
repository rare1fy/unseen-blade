// 第四关 · 锁江 · 乌林水寨（wl_dock / wl_camp / wl_tower）深度精修版：
// 五间房各自拥有截然不同的水上/军营建筑结构与高精细度船械细节（彻底破除雷同与单调）：
//  - wl_chains（连环战船）：西北三层重檐主楼船+硬帆主桅、东北撞击起火残舰、中段铁索大绞盘台、西南覆盾船首；
//  - wl_jetty（水寨栈桥）：西北双层水门木构箭楼、东北敞开水师武库长棚（炉火/兵架/盾排）、中段点将战鼓台；
//  - wl_barracks（乌林大营）：西北中军帅台大帐（红边重檐大纛）、东北江岸造船龙骨台（半成船肋+木吊架）、中段三层望楼、东南炊灶营棚；
//  - wl_flagship（楼船甲板 Boss）：西北双桅硬帆与高架拍竿战台、东北双联重弩炮台、正北拱卫三层督造阁、南侧双船首灯阁；
//  - yard_4（泊船小栈）：西北暖灯重檐渡口茶亭 + 西南泊岸货船首。
import type { Ctx } from '../../scenes/stage';
import { M, PLAY, SZ, hash } from '../../scenes/props';
import { addCardKind } from '../../scenes/cards';
import { ground } from '../../scenes/dress';
import { plot, tone } from '../../scenes/flora';
import type { Layout, Locale, Place, Rect } from '../types';
import { WL, frame, deck, tent, flagpole, fireBasket, lantern, chainCoil, hull, smoke, wp } from './wl_kit';

addCardKind('wlrope', { kind: 'decal', w: 16, h: 16 }, g => {
  const r = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  r(2, 2, 10, 2, '#9a8258'); r(2, 10, 10, 2, '#9a8258'); r(2, 4, 2, 6, '#7e6844'); r(10, 4, 2, 6, '#b89e6e');
  r(4, 4, 6, 1, '#6a5638'); r(4, 9, 6, 1, '#b89e6e'); r(13, 12, 3, 2, '#5a4430');
});
addCardKind('wlscorch', { kind: 'decal', w: 16, h: 16 }, g => {
  const r = (x: number, y: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w2, h2); };
  r(1, 3, 7, 2, '#241e1c'); r(2, 3, 5, 1, '#443832'); r(8, 10, 6, 2, '#28201e');
  r(4, 9, 3, 2, '#9c4220'); r(11, 4, 3, 2, '#4a4e58');
});

type Bx = ReturnType<typeof frame>;

function clearShapeWalls(w: Ctx['w'], q: Rect, wc: number, dc: number) {
  const X0 = M(q.x0), Z0 = M(q.z0);
  w.box(X0, 0, Z0, X0 + wc - 1, 44, Z0 + dc - 1, null);
  const trim = (wx: number, wz: number) => {
    if (w.has(wx, 30, wz) || w.has(wx, 24, wz)) return;
    for (let y = 31; y <= 42; y++) w.set(wx, y, wz, null);
  };
  for (let x = -1; x <= wc; x++) { trim(X0 + x, Z0 - 1); trim(X0 + x, Z0 + dc); }
  for (let z = 0; z < dc; z++) { trim(X0 - 1, Z0 + z); trim(X0 + wc, Z0 + z); }
}

/** Dark charcoal-slate Han warship pagoda roof (pitched ribs + upturned corner eaves + ridge finials) */
function shipRoof(B: Bx, x0: number, x1: number, z0: number, z1: number, y0: number, tiers = 2, th = 4) {
  let ya = y0, a = x0, b = x1, c = z0, e = z1;
  for (let i = 0; i < tiers; i++) {
    if (i > 0) { a += 4; b -= 4; c += 5; e -= 5; }
    if (a + 3 >= b || c + 3 >= e) break;
    B(a, ya, c, b, ya + th - 1, e, 0x383a40);
    if (i === 0) {
      B(a, ya, c, b, ya, c, 0x222428); B(a, ya, e, b, ya, e, 0x222428);
      B(a, ya, c, a, ya, e, 0x222428); B(b, ya, c, b, ya, e, 0x222428);
    }
    for (let x = a + 2; x <= b - 2; x += 5) B(x, ya + th - 1, c, x, ya + th - 1, e, 0x4e5058);
    ya += th;
  }
  const mz = Math.round((c + e) / 2);
  B(a + 2, ya, mz - 2, b - 2, ya + 2, mz + 2, 0x2c2e34);
  B(a + 2, ya + 3, mz - 1, b - 2, ya + 3, mz + 1, 0x565860);
  B(a, ya, mz - 2, a + 3, ya + 6, mz + 2, 0x2c2e34);
  B(b - 3, ya, mz - 2, b, ya + 6, mz + 2, 0x2c2e34);
  return ya + 6;
}

/** Towering Han warship mast with full ribbed bamboo-batten matting sail (硬帆) + masthead pennant! */
function battenedSailMast(B: Bx, x: number, z: number, baseY: number, tall = 84, o: { burnt?: boolean; width?: number } = {}) {
  const hw = o.width ?? 22;
  // iron-banded mast partner box
  B(x - 5, baseY, z - 5, x + 5, baseY + 6, z + 5, WL.tar);
  B(x - 5, baseY + 3, z - 5, x + 5, baseY + 4, z + 5, WL.iron);
  // tall heavy main mast spar
  B(x - 2, baseY + 7, z - 2, x + 2, baseY + tall, z + 2, o.burnt ? WL.char : WL.woodD);
  for (let y = baseY + 16; y < baseY + tall - 6; y += 14) B(x - 2, y, z - 2, x + 2, y + 1, z + 2, WL.iron);
  // full Han ribbed bamboo-batten sail (clearly visible silhouette in panoramic & combat view!)
  if (!o.burnt) {
    const sy0 = baseY + 26, sy1 = baseY + tall - 10;
    B(x - hw, sy1, z + 2, x + hw, sy1 + 2, z + 4, WL.woodD);
    B(x - hw, sy0, z + 2, x + hw, sy0 + 1, z + 4, WL.woodD);
    for (let y = sy0 + 2; y < sy1; y++) {
      const batten = (y - sy0) % 7 === 0;
      const trim = (y - sy0) % 14 < 7;
      B(x - hw + 1, y, z + 3, x + hw - 1, y, z + 3, batten ? WL.woodD : (trim ? WL.canvas : WL.canvasD));
    }
    // dark crimson battle stripe across the middle of the Cao naval sail!
    const midS = Math.round((sy0 + sy1) / 2);
    B(x - hw + 2, midS - 3, z + 3, x + hw - 2, midS + 3, z + 4, WL.red);
  } else {
    // charred broken yardarm angled & smoking
    B(x - 16, baseY + tall - 18, z + 1, x + 12, baseY + tall - 16, z + 3, WL.char);
  }
  // streaming crimson swallowtail masthead pennant
  B(x + 3, baseY + tall - 9, z, x + 18, baseY + tall - 2, z + 1, WL.red);
  B(x + 18, baseY + tall - 9, z, x + 23, baseY + tall - 6, z + 1, WL.redD);
  B(x + 18, baseY + tall - 4, z, x + 23, baseY + tall - 2, z + 1, WL.redD);
}

/** Mounted heavy ship deck ballista (床弩) + bolt rack */
function deckBallista(B: Bx, x: number, y: number, z: number) {
  B(x - 5, y, z - 5, x + 5, y + 3, z + 5, WL.ironD);
  B(x - 2, y + 4, z - 2, x + 2, y + 12, z + 2, WL.woodD);
  B(x - 3, y + 13, z - 14, x + 3, y + 15, z + 16, WL.wood);
  B(x - 20, y + 14, z + 8, x + 20, y + 16, z + 11, WL.woodD);
  B(x - 19, y + 16, z + 7, x + 19, y + 16, z + 7, 0xd8d0b8);
  B(x - 1, y + 16, z - 10, x + 1, y + 17, z + 22, WL.ironL);
  B(x - 2, y + 16, z + 20, x + 2, y + 18, z + 24, WL.ironL);
}

/** Towering warship striking-boom crane (拍竿) with heavy counter-weight stone */
function strikingBoom(B: Bx, x: number, y: number, z: number) {
  for (const s of [-6, 6]) B(x + s - 1, y, z - 3, x + s + 1, y + 30, z + 3, WL.woodD);
  B(x - 7, y + 28, z - 3, x + 7, y + 31, z + 3, WL.iron);
  B(x - 2, y + 31, z - 2, x + 2, y + 86, z + 2, WL.wood);
  for (let yy = y + 42; yy < y + 78; yy += 10) B(x - 3, yy, z - 3, x + 3, yy, z + 3, WL.ironD);
  // heavy carved striking boulder bound at the top
  B(x - 6, y + 78, z - 6, x + 6, y + 90, z + 6, 0x6e6a64);
  B(x - 6, y + 90, z - 6, x + 6, y + 90, z + 6, 0x8c8880);
  B(x - 7, y + 83, z - 7, x + 7, y + 85, z + 7, WL.ironD);
}

/** Giant Iron Chain Capstan Winch (铁索大绞盘) with wooden capstan bars & heavy coiled iron chain */
function ironCapstan(B: Bx, x: number, y: number, z: number) {
  B(x - 10, y, z - 10, x + 10, y + 3, z + 10, WL.tar);
  B(x - 9, y + 3, z - 9, x + 9, y + 3, z + 9, WL.ironD);
  // iron drum wrapped in chain coils
  B(x - 6, y + 4, z - 6, x + 6, y + 18, z + 6, WL.iron);
  for (let yy = y + 6; yy <= y + 16; yy += 3) B(x - 7, yy, z - 7, x + 7, yy + 1, z + 7, WL.ironD);
  // capstan wooden turning bars sticking out in a cross
  B(x - 16, y + 19, z - 1, x + 16, y + 21, z + 1, WL.woodL);
  B(x - 1, y + 19, z - 16, x + 1, y + 21, z + 16, WL.woodL);
  B(x - 5, y + 19, z - 5, x + 5, y + 22, z + 5, WL.red);
}

/** Giant Crimson-and-Gold War Drum on a Timber Pavilion Stand (点将战鼓) */
function warDrum(B: Bx, x: number, y: number, z: number) {
  for (const s of [-9, 7]) B(x + s, y, z - 4, x + s + 2, y + 16, z + 4, WL.woodD);
  B(x - 10, y + 2, z - 4, x + 10, y + 4, z + 4, WL.wood);
  // big crimson lacquer drum barrel + pale oxhide drumheads
  B(x - 8, y + 8, z - 7, x + 8, y + 24, z + 7, WL.red);
  B(x - 9, y + 10, z - 6, x + 9, y + 22, z + 6, WL.redD);
  B(x - 6, y + 11, z + 7, x + 6, y + 21, z + 8, WL.canvas);
  B(x - 6, y + 11, z - 8, x + 6, y + 21, z - 7, WL.canvas);
  B(x - 3, y + 14, z + 8, x + 3, y + 18, z + 8, 0xc89a42);
}

/** Row of overlapping iron-bossed wooden warship shields (船舷盾排) along a gunwale */
function shieldRowX(B: Bx, x0: number, x1: number, y: number, z: number) {
  for (let x = x0; x + 7 <= x1; x += 9) {
    B(x, y, z, x + 6, y + 10, z + 1, WL.redD);
    B(x + 1, y + 1, z + 1, x + 5, y + 9, z + 1, WL.red);
    B(x + 2, y + 4, z + 1, x + 4, y + 6, z + 2, WL.ironL);
  }
}

/** Exclusive Wulin `#` infill: 5 rooms, 5 completely distinct naval & military architectural identities! */
export function wulinInfill(kind: 'dock' | 'camp' | 'tower'): NonNullable<Locale['infill']> {
  return (c, { rect: q, shape, p, back }) => {
    const w = c.w, B = frame(w, q.x0, q.z0);
    const wc = M(q.x1) - M(q.x0), dc = M(q.z1) - M(q.z0);
    const W = q.x1 - q.x0, D = q.z1 - q.z0;
    const lit = p.lamp > 0.3;
    const box = shape?.box;
    const roomId = shape?.fixed?.id;
    const touchesW = !!box && q.x0 <= box.x0 + 0.15, touchesE = !!box && q.x1 >= box.x1 - 0.15;
    const touchesN = !!box && q.z0 <= box.z0 + 0.15, touchesS = !!box && q.z1 >= box.z1 - 0.15;

    clearShapeWalls(w, q, wc, dc);
    deck(B, 0, wc - 1, 0, dc - 1, -1, { along: 'x' });

    // 1) Narrow 1-cell strip: rich naval bulwark with shield row, war-drum gate wall, or pointed log stockade!
    if (D < 2.6 || W < 2.6) {
      const alongX = W >= D;
      if (alongX) {
        const z0 = Math.max(2, Math.floor(dc / 2) - 4), z1 = Math.min(dc - 3, z0 + 8);
        if (kind === 'camp') {
          for (let x = 0; x < wc; x += 4) {
            const h = 26 + ((x / 4) % 2 ? 4 : 0);
            B(x, 0, z0, Math.min(wc - 1, x + 2), h, z1, (x / 4) % 3 ? WL.wood : WL.woodD);
            B(x, h + 1, z0 + 1, Math.min(wc - 1, x + 2), h + 2, z1 - 1, WL.woodL);
          }
          B(0, 8, z0 - 1, wc - 1, 9, z1 + 1, WL.canvasD);
          B(0, 20, z0 - 1, wc - 1, 21, z1 + 1, WL.canvasD);
        } else {
          // Ship gunwale parapet lined with iron-bossed crimson war shields + war drum on wl_jetty mid-wall!
          B(0, 0, z0, wc - 1, 14, z1, WL.tar);
          B(0, 14, z0 - 1, wc - 1, 16, z1 + 1, WL.woodL);
          shieldRowX(B, 2, wc - 3, 12, z1);
          if (roomId === 'wl_jetty' && wc >= 40) {
            warDrum(B, Math.floor(wc / 2), 17, Math.floor((z0 + z1) / 2));
          } else {
            for (let x = 6; x + 12 < wc - 4; x += 22) {
              B(x, 0, z1 + 2, x + 10, 9, Math.min(dc - 2, z1 + 9), WL.wood);
              B(x, 5, z1 + 2, x + 10, 5, Math.min(dc - 2, z1 + 9), WL.ironD);
            }
          }
        }
      } else {
        const x0 = Math.max(2, Math.floor(wc / 2) - 4), x1 = Math.min(wc - 3, x0 + 8);
        B(x0, 0, 0, x1, 16, dc - 1, WL.tar);
        B(x0, 14, 0, x1, 17, dc - 1, WL.red);
        B(x0 - 1, 18, 0, x1 + 1, 19, dc - 1, WL.woodL);
      }
      return;
    }

    // 2) Wide architectural block: bleed off-camera on touched perimeter edges!
    const extW = touchesW ? 64 : 0, extE = touchesE ? 64 : 0, extN = touchesN ? 52 : 0, extS = touchesS && !back ? 28 : 0;
    const x0 = -extW, x1 = wc - 1 + extE, z0 = -extN, z1 = dc - 1 + extS;
    deck(B, x0 - 2, x1 + 2, z0 - 2, z1 + 2, -1, { along: 'x' });

    const isNW = touchesN && touchesW, isNE = touchesN && touchesE;

    // ===================== ROOM-SPECIFIC BESPOKE STRUCTURES =====================

    // A) wl_barracks (乌林大营 · wl_camp): 4 completely distinct military camp functional zones!
    if (kind === 'camp') {
      B(x0, 0, z0, x1, 4, z1, WL.woodD);
      B(x0, 4, z0, x1, 4, z1, WL.plank);
      if (isNW) {
        // Grand General's Command Pavilion (中军帅台大帐) — wide scarlet-trimmed dual-tier command canopy + war drum + Cao standards!
        const cx = Math.min(wc - 26, Math.max(18, Math.floor(wc * 0.45))), cz = Math.min(dc - 18, Math.max(10, Math.floor(dc * 0.42)));
        B(x0 + 4, 5, z0 + 4, wc - 6, 9, dc - 6, WL.wood);
        B(x0 + 4, 9, z0 + 4, wc - 6, 9, dc - 6, WL.plank);
        // ornate oversized general's pavilion tent + scarlet awning
        const T = frame(w, q.x0 + cx * 0.07, q.z0 + cz * 0.07);
        tent(T, 34, 22, 38, { officer: true, lit });
        for (const px of [cx - 28, cx + 26]) B(px, 10, dc - 10, px + 2, 36, dc - 8, WL.red);
        B(cx - 30, 36, cz + 14, cx + 30, 38, dc - 6, WL.red);
        B(cx - 30, 38, cz + 16, cx + 30, 38, dc - 8, WL.redD);
        warDrum(B, wc - 16, 10, dc - 14);
        flagpole(B, wc - 6, dc - 8, 84, { len: 28, wd: 14 });
        flagpole(B, 8, dc - 8, 74, { len: 24, wd: 12 });
        const fb = fireBasket(B, cx + 18, dc - 8, 16, lit);
        if (lit) c.light(wp(q.x0, q.z0, 0, fb[0], fb[1] + 4, fb[2]), 0xff8232, 2.2, 7.5);
        return;
      }
      if (isNE) {
        // Riverbank Warship Dry-Dock Slipway (造船龙骨台): giant half-built warship ribs + timber scaffolding + crane hoist!
        B(4, 5, z0 + 6, x1 - 4, 10, dc - 6, WL.tar);
        // keel & curved ship ribs rising dramatically out of the dry-dock!
        B(8, 11, Math.floor(dc * 0.45) - 3, x1 - 8, 15, Math.floor(dc * 0.45) + 3, WL.woodD);
        for (let rx = 12; rx <= Math.min(wc + 24, x1 - 10); rx += 12) {
          B(rx, 11, 8, rx + 2, 42, 11, WL.wood);
          B(rx, 11, dc - 12, rx + 2, 42, dc - 9, WL.wood);
          B(rx, 38, 8, rx + 2, 40, dc - 9, WL.woodD);
        }
        // towering shipyard scaffolding & hoist beam (y up to 64!)
        for (const sx of [6, wc - 8]) {
          for (const sz of [6, dc - 8]) B(sx, 5, sz, sx + 2, 64, sz + 2, WL.woodD);
          for (let yy = 18; yy <= 54; yy += 16) B(sx, yy, 6, sx + 2, yy + 1, dc - 6, WL.woodL);
        }
        B(4, 62, 12, wc - 4, 64, 15, WL.woodL);
        const fb = fireBasket(B, 14, dc - 8, 12, lit);
        if (lit) c.light(wp(q.x0, q.z0, 0, fb[0], fb[1] + 4, fb[2]), 0xff8232, 1.8, 6);
        return;
      }
      if (!touchesS && touchesW) {
        // Mid-West 3-Storey Timber Camp Watchtower (三层木构水寨望楼, y ~94 = 6.6m!)
        const tx = Math.min(wc - 18, Math.max(16, Math.floor(wc * 0.5))), tz = Math.floor(dc * 0.5);
        for (const a of [-14, 12]) for (const b of [-14, 12]) B(tx + a, 5, tz + b, tx + a + 2, 74, tz + b + 2, WL.tar);
        for (const yy of [24, 48]) {
          B(tx - 16, yy, tz - 16, tx + 16, yy + 2, tz + 16, WL.woodD);
          for (const s of [-16, 16]) { B(tx - 16, yy + 3, tz + s, tx + 16, yy + 7, tz + s, WL.red); B(tx + s, yy + 3, tz - 16, tx + s, yy + 7, tz + 16, WL.red); }
        }
        B(tx - 12, 51, tz - 12, tx + 12, 72, tz + 12, WL.wood);
        B(tx - 7, 57, tz + 12, tx + 7, 66, tz + 13, lit ? 0xe6a64c : 0x1a1414, lit ? 1 : 0);
        shipRoof(B, tx - 21, tx + 21, tz - 21, tz + 21, 75, 2, 4);
        flagpole(B, wc - 8, dc - 6, 80, { len: 24, wd: 12 });
        return;
      }
      // South camp quarters: low open timber supply shed + officer tent + grain sacks (camera-safe)
      for (const px of [4, Math.floor(wc / 2), wc - 6]) B(px, 5, 4, px + 2, 24, 6, WL.woodD);
      B(2, 24, 2, wc - 3, 26, Math.min(dc - 4, 26), WL.wood);
      const T = frame(w, q.x0 + Math.floor(wc / 2) * 0.07, q.z0 + Math.floor(dc / 2) * 0.07);
      tent(T, Math.min(18, Math.floor(wc * 0.34)), Math.min(14, Math.floor(dc * 0.34)), 20, { officer: false, lit });
      return;
    }

    // B) South foreground on ALL dock/tower rooms: ornate bow turrets, shield rows & giant iron capstans (camera-safe!)
    if (touchesS) {
      B(x0, 0, z0, x1, 12, z1, WL.tar);
      B(x0, 12, z0, x1, 13, z1, WL.plank);
      shieldRowX(B, 2, wc - 3, 12, 2);
      if (roomId === 'wl_flagship') {
        // Flagship bow lantern turret + iron capstan
        ironCapstan(B, Math.floor(wc * 0.5), 14, Math.floor(dc * 0.45));
        const ln = lantern(B, touchesW ? wc - 8 : 8, 8, 30, lit);
        if (lit) c.light(wp(q.x0, q.z0, 0, ln[0], ln[1], ln[2]), 0xff9a48, 1.8, 6);
      } else {
        // Moored cargo barge bow with crates, oil barrels & anchor chains
        for (let sx = 6; sx + 12 < wc - 4; sx += 18) {
          B(sx, 14, 6, sx + 10, 22, Math.min(dc - 6, 16), WL.wood);
          B(sx, 18, 6, sx + 10, 18, Math.min(dc - 6, 16), WL.ironD);
        }
        chainCoil(B, Math.floor(wc * 0.5), Math.floor(dc * 0.5), 14, 7);
      }
      return;
    }

    // C) wl_flagship (楼船甲板 Boss): Port = Twin-Mast Battened Sails + Striking Boom (拍竿); Starboard = Twin Ballista Siege Battery!
    if (roomId === 'wl_flagship') {
      B(x0, 0, z0, x1, 16, z1, WL.tar);
      B(x0, 14, z0, x1, 16, z1, WL.red);
      B(x0, 17, z0, x1, 17, z1, WL.oil);
      shieldRowX(B, Math.max(0, x0 + 2), Math.min(wc - 3, x1 - 2), 16, dc - 2);
      if (isNW) {
        // Port Raised Quarterdeck + Twin Towering Battened-Sail Masts + Giant Striking Boom (拍竿)!
        B(x0 + 4, 18, z0 + 4, wc - 8, 34, dc - 14, WL.woodD);
        for (let wx = 12; wx <= wc - 18; wx += 22) B(wx - 5, 22, dc - 14, wx + 5, 30, dc - 13, lit ? 0xe0a24c : 0x1a1414, lit ? 1 : 0);
        shipRoof(B, x0, wc - 4, z0, dc - 10, 35, 2, 4);
        battenedSailMast(B, Math.max(12, wc - 28), Math.max(10, dc - 22), 18, 88, { width: 22 });
        battenedSailMast(B, Math.max(x0 + 28, -14), Math.max(8, dc - 24), 18, 76, { width: 18 });
        strikingBoom(B, wc - 10, 18, dc - 10);
        const fb = fireBasket(B, 14, dc - 8, 22, lit);
        if (lit) c.light(wp(q.x0, q.z0, 0, fb[0], fb[1] + 4, fb[2]), 0xff8232, 2.0, 7);
      } else {
        // Starboard Siege Battery Deck: Twin Mounted Heavy Ballistae (双联床弩) + War Drum + Banner + Fire Basket!
        B(6, 18, z0 + 6, x1 - 4, 24, dc - 10, WL.wood);
        deckBallista(B, Math.max(18, Math.floor(wc * 0.32)), 25, Math.max(12, dc - 22));
        deckBallista(B, Math.min(wc - 14, Math.floor(wc * 0.74)), 25, Math.max(12, dc - 22));
        warDrum(B, Math.floor(wc * 0.5), 18, dc - 8);
        flagpole(B, 10, dc - 8, 82, { len: 28, wd: 14 });
        const fb = fireBasket(B, wc - 10, dc - 8, 26, lit);
        if (lit) c.light(wp(q.x0, q.z0, 0, fb[0], fb[1] + 4, fb[2]), 0xff8232, 2.0, 7);
      }
      return;
    }

    // D) wl_jetty / wl_ring / wl_sluice: NW = 3-Storey Harbor Water-Gate Watchtower; NE = Covered Open-Front Naval Armory & Forge Shed!
    if (roomId === 'wl_jetty' || roomId === 'wl_ring' || roomId === 'wl_sluice') {
      if (isNW) {
        // Tall 3-storey Timber Harbor Water-Gate Watchtower (水寨三层箭楼, soaring to ~6.8m!)
        B(x0, 0, z0, x1, 8, z1, WL.tar);
        B(x0, 8, z0, x1, 9, z1, WL.plank);
        const tx = Math.min(wc - 20, Math.max(18, Math.floor(wc * 0.52))), tz = Math.min(dc - 18, Math.max(10, Math.floor(dc * 0.45)));
        for (const a of [-18, 0, 16]) for (const b of [-16, 14]) B(tx + a, 10, tz + b, tx + a + 2, 74, tz + b + 2, WL.tar);
        // 1st floor timber guardroom + glowing arrow slits
        B(tx - 16, 10, tz - 14, tx + 16, 34, tz + 14, WL.woodD);
        B(tx - 10, 18, tz + 14, tx + 10, 27, tz + 15, lit ? 0xd89a50 : 0x1a1414, lit ? 1 : 0);
        shipRoof(B, tx - 23, tx + 23, tz - 21, tz + 21, 35, 2, 3);
        // 2nd floor open crimson-railed lookout fighting gallery
        B(tx - 18, 43, tz - 16, tx + 18, 45, tz + 16, WL.plank);
        shieldRowX(B, tx - 16, tx + 16, 46, tz + 15);
        // 3rd floor crowning signal watchbox + tall ship roof
        B(tx - 12, 54, tz - 11, tx + 12, 72, tz + 11, WL.wood);
        B(tx - 6, 60, tz + 11, tx + 6, 67, tz + 12, lit ? 0xf0b85c : 0x1a1414, lit ? 1 : 0);
        shipRoof(B, tx - 19, tx + 19, tz - 18, tz + 18, 73, 2, 4);
        ironCapstan(B, 14, 10, dc - 12);
        flagpole(B, wc - 6, dc - 8, 86, { len: 26, wd: 14 });
        return;
      }
      if (isNE) {
        // Covered Open-Front Naval Armory & Blacksmith Workshop (水师武库锻棚) — glowing forge + spear racks + shield wall!
        B(x0, 0, z0, x1, 6, z1, WL.tar);
        B(x0, 6, z0, x1, 6, z1, WL.plank);
        const H = 34;
        B(x0, 7, z0, x1, H, z0 + 12, WL.woodD);
        for (let px = 4; px <= wc - 4; px += 22) B(px, 7, dc - 4, px + 2, H, dc - 2, WL.red);
        shipRoof(B, x0 - 3, x1 + 3, z0 - 3, dc + 3, H + 1, 2, 4);
        // glowing armor-forge hearth & weapon/shield racks visible inside the open workshop!
        const fx = Math.floor(wc * 0.45);
        B(fx - 8, 7, 14, fx + 8, 16, 24, 0x524e4a);
        B(fx - 5, 11, 23, fx + 5, 15, 25, WL.ember, 1);
        B(fx - 3, 13, 24, fx + 3, 15, 25, WL.fireL, 1);
        if (lit) c.light(wp(q.x0, q.z0, 0, fx, 18, 28), 0xff7a2a, 2.2, 7);
        shieldRowX(B, 6, wc - 8, 7, dc - 8);
        return;
      }
    }

    // E) wl_chains (连环战船): NW = 3-Storey Flagship Cabin + Tall Battened Sail Mast; NE = Burning Rammed Fire-Ship Wreck!
    if (roomId === 'wl_chains' && isNE) {
      // Half-charred rammed Fire-Ship Wreckage (撞击起火残舰): snapped mast, glowing blaze, broken ribs, rising smoke!
      B(x0, 0, z0, x1, 8, z1, WL.tar);
      B(x0, 6, z0, x1, 8, z1, WL.char);
      // shattered half-collapsed deckhouse on east side + charred ribs on west
      const split = Math.floor(wc * 0.48);
      B(split, 9, z0 + 4, x1, 30, dc - 10, WL.char);
      B(split, 9, dc - 10, x1, 16, dc - 10, WL.redD);
      shipRoof(B, split - 2, x1 + 3, z0, dc - 6, 31, 2, 3);
      // snapped burning mast + blazing fire-oil puddle on the shattered west deck!
      battenedSailMast(B, Math.max(12, split - 10), Math.floor(dc * 0.48), 9, 58, { burnt: true });
      B(8, 9, 10, split - 4, 11, dc - 10, WL.char);
      B(12, 12, 14, split - 8, 13, dc - 14, WL.ember, 1);
      B(16, 14, 18, split - 12, 17, dc - 18, WL.fire, 1);
      B(18, 18, 20, split - 14, 19, dc - 20, WL.fireL, 1);
      if (lit) c.light(wp(q.x0, q.z0, 0, Math.floor(split * 0.5), 22, Math.floor(dc * 0.5)), 0xff6e20, 2.6, 9);
      smoke(c, [q.x0 + split * 0.04, 2.8, q.z0 + dc * 0.035], { rate: 2.4, col: 0x3a3230 });
      return;
    }

    // F) Default / NW Grand 3-Storey Lou-chuan Command Stern (wl_chains NW, yard_4 NW, generic):
    const isGrand = isNW && wc >= 46 && dc >= 34;
    const H1 = isGrand ? 38 : 32;
    const porchD = dc >= 42 ? 14 : 0;
    const mainZ1 = z1 - porchD;

    B(x0, 0, z0, x1, 6, z1, WL.tar);
    B(x0, 4, z0, x1, 6, z1, WL.ironD);
    B(x0, 7, z0, x1, H1, mainZ1, WL.woodD);
    B(x0, 7, mainZ1, x1, 14, mainZ1, WL.red);
    for (let x = x0; x <= x1; x += 24) {
      const px = Math.min(x, x1 - 2);
      B(px, 6, mainZ1 - 1, px + 2, H1, mainZ1 + 1, WL.red);
    }
    for (let wx = 12; wx <= wc - 14; wx += 22) {
      B(wx - 5, 16, mainZ1, wx + 5, H1 - 6, mainZ1, lit ? 0xd89a50 : 0x1a1414, lit ? 1 : 0);
      for (let u = wx - 4; u <= wx + 4; u += 2) B(u, 16, mainZ1 + 1, u, H1 - 6, mainZ1 + 1, WL.woodD);
    }
    const r1Top = shipRoof(B, x0 - 4, x1 + 4, z0 - 4, mainZ1 + 5, H1 + 1, 2, 4);

    if (isGrand) {
      // 2nd-Storey Command Cabin + 3rd-Storey Belvedere + Prominent Full Battened-Sail Mast!
      const c2x0 = Math.max(x0 + 10, -24), c2x1 = wc - 16, c2z0 = Math.max(z0 + 8, -16), c2z1 = mainZ1 - 4;
      const y2 = r1Top - 2, H2 = 24;
      B(c2x0, y2, c2z0, c2x1, y2 + H2, c2z1, WL.wood);
      for (let x = c2x0; x <= c2x1; x += 22) B(x, y2, c2z1 - 1, Math.min(c2x1, x + 2), y2 + H2, c2z1 + 1, WL.red);
      for (let wx = Math.max(c2x0 + 10, 10); wx <= c2x1 - 10; wx += 20) {
        B(wx - 5, y2 + 6, c2z1, wx + 5, y2 + H2 - 5, c2z1, lit ? 0xe6a856 : 0x1a1414, lit ? 1 : 0);
        for (let u = wx - 4; u <= wx + 4; u += 2) B(u, y2 + 6, c2z1 + 1, u, y2 + H2 - 5, c2z1 + 1, WL.woodD);
      }
      B(c2x0 - 4, y2 + 1, c2z1 + 2, c2x1 + 4, y2 + 5, c2z1 + 4, WL.red);
      const r2Top = shipRoof(B, c2x0 - 5, c2x1 + 5, c2z0 - 5, c2z1 + 6, y2 + H2 + 1, 2, 4);

      const mx = Math.min(wc - 26, Math.max(12, Math.floor(wc * 0.36))), mz = Math.max(c2z0 + 10, Math.floor((c2z0 + c2z1) / 2));
      B(mx - 14, r2Top - 2, mz - 10, mx + 14, r2Top + 14, mz + 10, WL.woodD);
      B(mx - 7, r2Top + 2, mz + 10, mx + 7, r2Top + 10, mz + 11, lit ? 0xf0b85c : 0x1a1414, lit ? 1 : 0);
      shipRoof(B, mx - 19, mx + 19, mz - 14, mz + 14, r2Top + 15, 2, 3);
      // Prominent full ribbed bamboo-batten sail mast rising on the starboard corner of the NW stern!
      battenedSailMast(B, wc - 14, Math.max(8, mainZ1 - 6), H1 + 2, 82, { width: 20 });
      flagpole(B, wc - 4, mainZ1 + 2, H1 + 44, { len: 26, wd: 14 });
    } else {
      // Mid-scale ornate waterside pavilion (e.g. yard_4 tea-pavilion) with double-eave lantern belvedere!
      const mx = Math.floor(wc * 0.5), mz = Math.max(8, Math.floor(mainZ1 * 0.5));
      B(mx - 12, r1Top - 2, mz - 9, mx + 12, r1Top + 13, mz + 9, WL.wood);
      B(mx - 6, r1Top + 2, mz + 9, mx + 6, r1Top + 9, mz + 10, lit ? 0xf0b85c : 0x1a1414, lit ? 1 : 0);
      shipRoof(B, mx - 17, mx + 17, mz - 13, mz + 13, r1Top + 14, 2, 3);
      flagpole(B, Math.max(6, wc - 8), mainZ1, H1 + 36, { len: 22, wd: 12 });
    }

    // Recessed dockside cargo veranda + iron capstan / cargo crates / warm lanterns
    if (porchD > 0) {
      for (let x = 2; x <= wc - 4; x += 24) B(x, 6, z1 - 2, x + 2, 24, z1, WL.tar);
      B(0, 24, z1 - 2, wc - 1, 25, z1, WL.woodD);
      B(-1, 26, mainZ1 + 1, wc, 27, z1 + 2, 0x383a40);
      B(-1, 27, mainZ1 + 1, wc, 27, z1 + 2, 0x4e5058);
      for (let x = 6; x + 12 < wc - 22; x += 22) {
        B(x, 6, mainZ1 + 3, x + 9, 14, z1 - 4, WL.wood);
        B(x, 14, mainZ1 + 3, x + 9, 14, z1 - 4, WL.woodL);
        B(x, 10, mainZ1 + 3, x + 9, 10, z1 - 4, WL.ironD);
      }
      if (roomId === 'wl_chains' && wc >= 60) ironCapstan(B, wc - 16, 6, z1 - 7);
      else chainCoil(B, wc - 10, z1 - 6, 6, 5);
    }
    const ln = lantern(B, 8, z1 - 1, 25, lit);
    if (lit) c.light(wp(q.x0, q.z0, 0, ln[0], ln[1], ln[2]), 0xff9a48, 1.8, 5.5);
  };
}

/** Epic Yangtze River Chibi Fire-Armada & Red Cliff distant horizon backdrop */
export function wulinDistantBackdrop(c: Ctx, f: { layout: Layout; p: Place }, kind: 'dock' | 'camp' | 'tower') {
  const w = c.w, r = f.p.rnd;
  const addMass = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: number, topC?: number, lowC?: number) => {
    plot(w).masses.push({
      x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      cx: 0, cz: 0, top: topC ?? tone(side, 1.12), side, low: lowC ?? tone(side, 0.72), band: 6,
    });
  };
  const farZ = Math.min(PLAY.z0 - 15, SZ(-23));

  for (const [cxM, dzM, wM, burning] of [
    [-38, -8,  18, true],
    [-16, -13, 22, false],
    [  8, -11, 20, true],
    [ 34, -9,  19, true],
    [ 52, -15, 18, false],
  ] as const) {
    const cx = M(cxM), cz = M(farZ + dzM), hw = M(wM / 2);
    addMass(cx - hw, -2, cz - 14, cx + hw, 14, cz + 14, 0x241d1c, 0x382c28, 0x161212);
    addMass(cx - hw + 6, 15, cz - 12, cx + hw - 6, 36, cz + 12, burning ? 0x5c2b20 : 0x3b2c24, 0x4c3a30, 0x261c18);
    addMass(cx - hw + 2, 37, cz - 16, cx + hw - 2, 43, cz + 16, 0x262830, 0x383a44, 0x1a1c22);
    addMass(cx - Math.round(hw * 0.6), 44, cz - 10, cx + Math.round(hw * 0.6), 66, cz + 10, 0x342824, 0x483832, 0x201816);
    addMass(cx - Math.round(hw * 0.68), 67, cz - 13, cx + Math.round(hw * 0.68), 72, cz + 13, 0x262830, 0x383a44, 0x1a1c22);
    addMass(cx - 2, 72, cz - 2, cx + 2, 134, cz + 2, 0x2c221e, 0x3c302a, 0x1a1412);
    addMass(cx - 26, 94, cz - 2, cx + 26, 122, cz + 2, burning ? 0x723822 : 0x463d34, 0x625448, 0x28221c);
    if (burning) smoke(c, [cxM, 6.5, farZ + dzM], { rate: 2.0, col: 0x3a3230 });
  }

  for (const [x0, x1, dz0, dz1, h, col] of [
    [-98, -28, -32, -20, 148, 0x32262c],
    [ 22,  98, -34, -22, 162, 0x30242a],
    [-72,  72, -50, -30, 240, 0x251d24],
  ] as const) {
    addMass(M(x0), -2, M(farZ + dz0), M(x1), h, M(farZ + dz1), col, tone(col, 1.15), tone(col, 0.72));
  }

  const drawn = f.layout.drawn;
  if (!drawn || kind === 'tower') return;
  const blocksExit = (side: 'left' | 'right', z: number) => {
    const ex = drawn[side];
    return !!ex && Math.abs(z - ex.z) < 4.5;
  };
  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'left' : 'right';
    const edgeX = side < 0 ? PLAY.x0 : PLAY.x1;
    for (let i = 0; i < 2; i++) {
      const zc = PLAY.z0 + 4.5 + i * ((PLAY.z1 - PLAY.z0 - 8.5));
      if (blocksExit(sideName, zc)) continue;
      const xc = edgeX + side * 6.8;
      const burning = r(610 + i + (side > 0 ? 7 : 0)) < 0.45;
      const q = hull(c, xc, zc, side > 0 ? 1 : 3, { L: 84, burning, tall: 16 });
      if (burning) {
        for (const l of q.lights) c.light(l, 0xff7a2a, 2.2, 8.5);
        smoke(c, [xc, 2.8, zc], { rate: 1.8, col: 0x3a3430 });
      }
    }
  }
}

/** Deck-edge & dock micro-detail for all Wulin rooms: coiled ropes, scorched splinters & 3D iron-banded mooring bollards/shields! */
export function wulinEdgeDress(c: Ctx, f: { layout: Layout; p: Place }) {
  const w = c.w, sd = f.p.seed;
  const nearEdge = (x: number, z: number) => {
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || w.has(X, 6, Z) || !w.has(X, -1, Z)) return false;
    if (!w.has(X + 6, -1, Z) || !w.has(X - 6, -1, Z) || !w.has(X, -1, Z + 6) || !w.has(X, -1, Z - 6)) return false;
    return w.has(X + 10, 6, Z) || w.has(X - 10, 6, Z) || w.has(X, 6, Z + 10) || w.has(X, 6, Z - 10)
      || !w.has(X + 12, -1, Z) || !w.has(X - 12, -1, Z) || !w.has(X, -1, Z + 12) || !w.has(X, -1, Z - 12);
  };
  const hitsPath = (x: number, z: number) => (f.layout.path ?? []).some(q => x > q.x0 - 0.5 && x < q.x1 + 0.5 && z > q.z0 - 0.5 && z < q.z1 + 0.5);
  for (const [kind, count, sMin, sMax, salt] of [
    ['wlrope', 72, 0.78, 1.20, 17],
    ['wlscorch', 64, 0.78, 1.20, 31],
  ] as const) {
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 24) {
      tries++;
      const x = PLAY.x0 + 0.35 + hash(tries, sd + salt, 9) * (PLAY.x1 - PLAY.x0 - 0.7);
      const z = PLAY.z0 + 0.35 + hash(tries, sd + salt, 13) * (PLAY.z1 - PLAY.z0 - 0.7);
      if (!nearEdge(x, z)) continue;
      const y = ground(c, x, z); if (y == null || y > 0.08) continue;
      c.cards.add(kind, x, z, { y: y + 0.012, s: sMin + hash(tries, sd, salt + 3) * (sMax - sMin), tint: 0xffffff });
      placed++;
    }
  }
  // 3D non-blocking deck-edge iron-banded mooring bollards (系缆桩) & coiled iron chain rings tucked safely along water/wall margins!
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 240 && pts.length < 14; i++) {
    const x = PLAY.x0 + 0.7 + hash(i, sd, 53) * (PLAY.x1 - PLAY.x0 - 1.4);
    const z = PLAY.z0 + 0.7 + hash(i, sd, 59) * (PLAY.z1 - PLAY.z0 - 1.4);
    const X = M(x), Z = M(z);
    if (w.has(X, 1, Z) || !w.has(X, -1, Z) || hitsPath(x, z)) continue;
    if (!w.has(X + 5, -1, Z) || !w.has(X - 5, -1, Z) || !w.has(X, -1, Z + 5) || !w.has(X, -1, Z - 5)) continue;
    if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.6)) continue;
    const edgeWater = !w.has(X + 10, -1, Z) || !w.has(X - 10, -1, Z) || !w.has(X, -1, Z + 10) || !w.has(X, -1, Z - 10);
    const edgeWall = w.has(X, 6, Z - 7) && !w.has(X, 1, Z + 12);
    if (!edgeWater && !edgeWall) continue;
    if (pts.length % 2 === 0) {
      // sturdy iron-banded mooring bollard
      w.box(X - 2, 0, Z - 2, X + 2, 1, Z + 2, WL.ironD);
      w.box(X - 1, 2, Z - 1, X + 1, 9, Z + 1, WL.tar);
      w.box(X - 2, 7, Z - 2, X + 2, 8, Z + 2, WL.iron);
    } else {
      // stacked rope-bound supply crate + small fire-oil jar tucked at edge
      w.box(X - 3, 0, Z - 2, X + 2, 5, Z + 2, WL.wood);
      w.box(X - 3, 3, Z - 2, X + 2, 3, Z + 2, WL.ironD);
      w.box(X + 3, 0, Z - 1, X + 5, 4, Z + 1, WL.redD);
    }
    pts.push([x, z]);
  }
}
