// Chapter 1 (幽暗森林) roster + the three classes, as chunky voxel models on one shared block size (kit.ts CELL).
// Names, roles and lines come from the 2D original (src/config/enemy*.ts, src/data/classes.ts); the designs are original.
import { P, newChar, biped, eyes, mouth, axe, sword, staff, rbox, srbox, taper, speckle, foliage, rowOct, tiers, bush, type V, type Anchors } from './kit';
import type { Col } from '../look/voxkit';

export type Kind = 'biped' | 'robe' | 'ghost' | 'quad' | 'spider' | 'sprite';
export type Attack = 'swing' | 'slam' | 'claw' | 'dual' | 'shoot' | 'cast' | 'bite' | 'strike';
export interface ModelDef {
  id: string; name: string; group: '职业' | '普通' | '精英' | '首领'; role: string; line: string;
  kind: Kind; attack: Attack; build: () => V; glow?: number; self?: number; hover?: number; bowL?: boolean;
  /** an alternate look of another model: poses, grip and weapon tip as that id (e.g. the male rogue kept as a backup) */
  as?: string;
  /** weapon tip, in cells along the weapon joint's +z (FX anchor; default 8) */
  tip?: number;
}

// ------------------------------------------------------------------ shared bits
function hoodShell(v: V, A: Anchors, c: Col, o: { extra?: number; peak?: number; dark?: Col } = {}) {
  const e = o.extra ?? 1, x0 = -A.headW / 2 - e, x1 = A.headW / 2 - 1 + e, z0 = A.headZ - A.headD / 2 - e, z1 = A.faceZ;
  v.part('head');
  for (let x = x0; x <= x1; x++) for (let y = A.headY0 - 1; y <= A.headY1 + e; y++) for (let z = z0; z <= z1; z++) {
    const inside = x > x0 && x < x1 && y < A.headY1 + e && z > z0;
    if (inside && z >= A.faceZ - 1 && y >= A.headY0) continue;   // leave the face open
    if (!inside || !v.get(x, y, z)) v.set(x, y, z, c);
  }
  if (o.peak) for (let i = 1; i <= o.peak; i++) v.box(-1, A.headY1 + e + i, z0 + i, 0, A.headY1 + e + i, z0 + i + 1, c);
  if (o.dark) v.box(-A.headW / 2 + 1, A.headY0, A.faceZ - 1, A.headW / 2 - 2, A.headY1, A.faceZ - 1, o.dark);
}
function ghostTail(v: V, A: Anchors, w: number, d: number, c: Col, tip: Col, back = 4) {
  // three clean tiers trailing back and narrowing to a wisp
  v.part('hips');
  const top = A.torsoY0 - 1, t1 = Math.round(top * 0.33), t2 = Math.round(top * 0.66);
  rbox(v, -w, t2, -d, w - 1, top, d - 1, c, 1, false);
  rbox(v, -w + 1, t1, -d + 1 - Math.round(back / 2), w - 2, t2 - 1, d - 2 - Math.round(back / 2), c, 1, false);
  rbox(v, -2, 0, -2 - back, 1, t1 - 1, 1 - back, tip, 0, false);
}
/** claws: a few dark spikes under / in front of a hand */
function claws(v: V, A: Anchors, side: 1 | -1, c: Col, n = 3, len = 2) {
  const x0 = side > 0 ? A.chestW / 2 : -A.chestW / 2 - 3;
  v.part(side > 0 ? 'handL' : 'handR');
  for (let i = 0; i < n; i++) for (let k = 1; k <= len; k++) v.set(x0 + i, A.handY - k, 1 + (k > 1 ? 1 : 0), c);
}

// ================================================================== classes
/** 三职业的闭合握拳：柄穿过拳心，握点位于柄体素中心；武器只随手腕转动。 */
export function heroGrip(v: V, at: [number, number, number], side: 'R' | 'L', glove: Col, knuckle: Col) {
  const [x, y, z] = at, hand = `hand${side}`, weapon = side === 'R' ? 'weapon' : 'offhand';
  v.bone(weapon, hand, x + 0.5, y + 0.5, z + 0.5);
  for (const [key, cell] of v.cells) if (cell.part === hand) v.cells.delete(key);
  v.part(hand);
  for (let xx = x - 1; xx <= x + 1; xx++) for (let yy = y - 1; yy <= y + 1; yy++) for (let zz = z - 1; zz <= z + 1; zz++) {
    if (xx === x && yy === y) continue; // 保留穿过拳头的整根柄，不覆盖武器体素。
    v.set(xx, yy, zz, xx === x + (side === 'R' ? -1 : 1) ? knuckle : glove);
  }
}

function warrior(): V {
  // 嗜血狂战 — a dwarf in heavy plate: horned great-helm open at the face, a braided ginger beard over the breastplate, huge
  // pauldrons, a red tabard, gauntlets and sabatons, a two-handed axe
  const v = newChar(), SK = 0xe0a07a, SKD = 0xb87a56, ST = 0x848c9a, STD = 0x4a505c, STL = 0xaab2c0, GOLD = 0xd8a838, RED = 0xa82626, REDD = 0x6e1818, BEARD = 0xa8522a, BEARD_D = 0x76361a;
  const A = biped(v, { skin: SK, legs: STD, boots: STD, hips: RED, torso: ST, chest: ST, belt: P.LEATH_D, sleeve: STD, fore_: ST, hands: STD, legH: 5, legW: 4, legD: 4, legGap: 1, hipH: 2, torsoH: 7, torsoW: 12, chestW: 14, torsoD: 8, headW: 10, headH: 8, headD: 8, armW: 4, upper: 4, fore: 3, hand: 3 });
  // tabard down the front and back, gold trim on the breastplate, belt buckle
  v.part('hips').box(-2, 0, 4, 1, A.hipY + 1, 4, RED).box(-2, 0, 4, 1, 0, 4, GOLD).box(-2, 1, -5, 1, A.hipY + 1, -5, REDD);
  v.part('spine').box(-6, A.torsoY0, 3, 5, A.torsoY0, 3, GOLD).box(-1, A.torsoY0, 4, 0, A.torsoY0 + 1, 4, GOLD);
  v.part('chest').box(-7, A.torsoY1, -4, 6, A.torsoY1, 3, STL).box(-1, A.torsoY0 + 4, 4, 0, A.torsoY1 - 1, 4, GOLD);
  // big layered pauldrons with gold rims and a spike
  for (const [sh, x0, sx] of [['shL', 7, 1], ['shR', -12, -1]] as Array<[string, number, number]>) {
    v.part(sh).box(x0, A.shoulderY - 2, -4, x0 + 5, A.shoulderY + 1, 3, ST).box(x0, A.shoulderY - 2, -4, x0 + 5, A.shoulderY - 2, 3, GOLD).box(x0 + 1, A.shoulderY + 2, -3, x0 + 4, A.shoulderY + 2, 2, STL)
      .box(sx > 0 ? x0 + 3 : x0 + 2, A.shoulderY + 3, -1, sx > 0 ? x0 + 3 : x0 + 2, A.shoulderY + 4, 0, STL);
  }
  for (const f of ['foreL', 'foreR']) v.part(f).box(f === 'foreL' ? 7 : -12, A.handY + 3, -3, f === 'foreL' ? 11 : -8, A.handY + 4, 2, ST);
  for (const l of ['footL', 'footR']) v.part(l).box(l === 'footL' ? 1 : -5, 0, 2, l === 'footL' ? 4 : -2, 0, 3, STL);
  // face: deep-set eyes under a heavy brow, big nose
  eyes(v, A, { y: 3, w: 2, h: 2, gap: 2, pupil: 0x3a2a1a, brow: BEARD_D, angry: true });
  v.part('head').box(-1, A.headY0 + 2, A.faceZ + 1, 0, A.headY0 + 3, A.faceZ + 1, SKD).box(-1, A.headY0 + 1, A.faceZ + 1, 0, A.headY0 + 1, A.faceZ + 1, SKD);
  // horned great-helm: a steel cap down the sides and back, cheek guards, a nasal, gold band, curving horns (straight runs)
  v.part('hat').box(-6, A.headY1 - 3, -5, 5, A.headY1 + 1, 4, ST).box(-5, A.headY1 + 2, -4, 4, A.headY1 + 2, 3, STL).box(-6, A.headY1 - 3, 4, 5, A.headY1 - 3, 4, GOLD)
    .box(-6, A.headY0, -5, -6, A.headY1, 1, ST).box(5, A.headY0, -5, 5, A.headY1, 1, ST).box(-6, A.headY0, -5, 5, A.headY1, -5, ST).box(-1, A.headY0 + 4, A.faceZ + 1, 0, A.headY1 - 3, A.faceZ + 1, STL)
    .box(-9, A.headY1 - 1, -1, -7, A.headY1, 0, P.BONE).box(-9, A.headY1 + 1, -1, -9, A.headY1 + 4, 0, P.BONE).box(6, A.headY1 - 1, -1, 8, A.headY1, 0, P.BONE).box(8, A.headY1 + 1, -1, 8, A.headY1 + 4, 0, P.BONE);
  // a great braided ginger beard covering the upper breastplate
  v.part('jaw').box(-5, A.headY0 - 1, A.faceZ, 4, A.headY0 + 1, A.faceZ + 1, BEARD).box(-4, A.headY0 - 5, A.faceZ, 3, A.headY0 - 2, A.faceZ + 1, BEARD)
    .box(-3, A.headY0 - 9, A.faceZ + 1, -2, A.headY0 - 6, A.faceZ + 1, BEARD_D).box(1, A.headY0 - 9, A.faceZ + 1, 2, A.headY0 - 6, A.faceZ + 1, BEARD_D)
    .box(-3, A.headY0 - 10, A.faceZ + 1, -2, A.headY0 - 10, A.faceZ + 1, GOLD).box(1, A.headY0 - 10, A.faceZ + 1, 2, A.headY0 - 10, A.faceZ + 1, GOLD)
    .box(-1, A.headY0, A.faceZ + 2, 0, A.headY0, A.faceZ + 2, 0x3a1a10).symBox(5, A.headY0 - 1, A.faceZ - 3, 5, A.headY0 + 2, A.faceZ, BEARD);
  axe(v, A, { len: 20, blade: 8, haft: P.WOOD_D, metal: STD, edge: STL });
  // 握住柄的下段，拳后只留短柄尾，举斧时不顶入护腕。
  for (const [key, cell] of v.cells) if (cell.part === 'weapon' && cell.z < A.wR[2] - 2) v.cells.delete(key);
  v.part('weapon').set(A.wR[0], A.wR[1], A.wR[2] - 2, GOLD);
  v.part('weapon').box(A.wR[0], A.wR[1] + 2, A.wR[2] + 14, A.wR[0], A.wR[1] + 3, A.wR[2] + 16, GOLD);
  heroGrip(v, A.wR, 'R', STD, ST);
  return v;
}

function mage(): V {
  // 星界魔导 — an old human archmage: a deep violet hooded robe with silver trim, a long white beard to the belt, white hair from
  // the hood, bushy brows over arcane-lit eyes, a tall staff crowned with a star crystal
  const v = newChar(), SK = 0xe8c0a0, SKD = 0xc0967a, ROBE = 0x4a2c8e, ROBE_D = 0x2e1a5e, SIL = 0xd8dce8, WHITE = 0xf2f4f8, ARC = 0x8ae8ff;
  const A = biped(v, { skin: SK, robe: { c: ROBE, flare: 3, trim: SIL, hem: ROBE_D }, torso: ROBE, chest: ROBE, sleeve: ROBE, fore_: ROBE_D, hands: SK, boots: ROBE_D, belt: 0x6a4a2a, legH: 9, hipH: 2, torsoH: 9, torsoW: 10, chestW: 12, torsoD: 6, headW: 8, headH: 9, headD: 8, armW: 3, upper: 4, fore: 5, hand: 2 });
  v.part('hips').box(-1, 3, 4, 0, A.hipY + 1, 4, SIL);
  v.part('chest').box(-6, A.torsoY1, -3, 5, A.torsoY1 + 1, 2, ROBE_D);
  // wide sleeves flaring at the cuff, silver cuffs
  for (const f of ['foreL', 'foreR']) { const x0 = f === 'foreL' ? 6 : -10; v.part(f).box(x0, A.handY + 2, -2, x0 + 3, A.handY + 4, 2, ROBE).box(x0, A.handY + 2, -2, x0 + 3, A.handY + 2, 2, SIL); }
  // face: bushy white brows over glowing arcane eyes, a long nose
  eyes(v, A, { y: 4, w: 2, h: 1, gap: 2, style: 'glow', glow: ARC });
  v.part('head').symBox(1, A.headY0 + 5, A.faceZ, 3, A.headY0 + 5, A.faceZ + 1, WHITE).box(-1, A.headY0 + 2, A.faceZ + 1, 0, A.headY0 + 4, A.faceZ + 1, SKD);
  // long white hair: a full crown parted in the middle, falling past the shoulders and down the back; a thin silver circlet
  v.part('hat').box(-5, A.headY1 - 1, -5, 4, A.headY1 + 1, A.faceZ - 1, WHITE).box(-4, A.headY1 + 1, -4, 3, A.headY1 + 1, A.faceZ - 2, 0xe0e4ec).box(-1, A.headY1 + 1, -4, 0, A.headY1 + 1, A.faceZ - 1, 0xc8ccd8)
    .box(-5, A.headY1 - 2, -5, 4, A.headY1 - 2, A.faceZ, SIL).box(-1, A.headY1 - 3, A.faceZ, 0, A.headY1 - 2, A.faceZ, ARC, 1);
  v.part('head').box(-5, A.headY0 - 9, -5, 4, A.headY1, -4, WHITE).box(-5, A.headY0 - 6, -4, -5, A.headY1, A.faceZ - 2, WHITE).box(4, A.headY0 - 6, -4, 4, A.headY1, A.faceZ - 2, WHITE)
    .box(-6, A.headY0 - 6, -2, -6, A.headY0 + 2, A.faceZ - 3, 0xe0e4ec).box(5, A.headY0 - 6, -2, 5, A.headY0 + 2, A.faceZ - 3, 0xe0e4ec).box(-4, A.headY0 - 11, -5, 3, A.headY0 - 10, -5, 0xe0e4ec);
  // a long white beard down to the belt, in two tiers
  v.part('jaw').box(-3, A.headY0 - 1, A.faceZ, 2, A.headY0 + 2, A.faceZ + 1, WHITE).box(-3, A.headY0 - 6, A.faceZ, 2, A.headY0 - 2, A.faceZ + 1, WHITE)
    .box(-2, A.headY0 - 11, A.faceZ, 1, A.headY0 - 7, A.faceZ + 1, WHITE).box(-1, A.headY0 - 12, A.faceZ, 0, A.headY0 - 12, A.faceZ, 0xc8ccd8).box(-1, A.headY0 + 2, A.faceZ + 1, 0, A.headY0 + 2, A.faceZ + 1, 0x8a6a5a);
  // tall staff: silver bands, a crescent cradle and a star crystal
  const top = staff(v, A, { len: 18, wood: 0x6a4a3a, back: 16 });
  v.part('weapon').box(top[0], top[1], top[2] - 8, top[0], top[1], top[2] - 8, SIL).box(top[0], top[1] - 3, top[2] - 1, top[0], top[1] + 3, top[2] - 1, SIL)
    .box(top[0], top[1] - 3, top[2], top[0], top[1] - 3, top[2] + 1, SIL).box(top[0], top[1] + 3, top[2], top[0], top[1] + 3, top[2] + 1, SIL)
    .box(top[0] - 1, top[1] - 1, top[2] + 1, top[0] + 1, top[1] + 1, top[2] + 3, ARC, 1).box(top[0], top[1] - 2, top[2] + 2, top[0], top[1] + 2, top[2] + 2, 0xe0faff, 1);
  heroGrip(v, A.wR, 'R', SK, SKD);
  // 左手展开成一块掌面和一块拇指，掌心随施法手腕朝前。
  for (const [key, cell] of v.cells) if (cell.part === 'handL') v.cells.delete(key);
  v.part('handL').box(A.wL[0] - 1, A.handY - 1, 0, A.wL[0] + 1, A.handY + 1, 0, SK)
    .box(A.wL[0] - 2, A.handY + 1, 0, A.wL[0] - 2, A.handY + 2, 0, SKD);
  // a spellbook on a chain at the hip
  v.part('hips').box(5, A.hipY - 4, -1, 6, A.hipY - 1, 2, 0x5a2a1a).box(5, A.hipY - 3, 3, 6, A.hipY - 2, 3, 0xe0b040);
  return v;
}

function rogueF(): V {
  // 影锋刺客 (default look, user 11-14) — a night-elf kunoichi: dusky violet skin, long ears swept back and up out of a close hood, a
  // long silver high ponytail thrown back out of the hood's crown and falling to mid-back, glowing almond eyes under dark brows, a cloth
  // mask over nose and mouth, silver locks beside the face, a fitted dark gi cinched by a green sash with ribbons at the back, slate
  // bracers, shin wraps, twin short blades held forward. She reads female by silhouette, not skin: narrower shoulders, a cinched waist
  // over wider hips, longer legs, a smaller head than the male backup (rogueM), the ponytail and the locks.
  const v = newChar(), SK = 0x8a7ab8, GI = 0x23232c, GI_L = 0x34343e, MASK = 0x2c2a38, GREEN = 0x2ea860, GREEN_D = 0x1e7a46;
  const SKD = 0x5e4e8a, HAIR = 0xd4d8e8, HAIR_D = 0x9a9eba, BRACER = 0x4a4658, BOOT = 0x16161c, EYE = 0xf0fff8;
  const A = biped(v, { skin: SK, legs: GI, boots: BOOT, hips: GI, torso: GI, chest: GI_L, belt: null, sleeve: GI, fore_: BRACER, hands: BOOT,
    legH: 11, legW: 3, legD: 3, legGap: 1, hipH: 2, torsoH: 7, torsoW: 6, chestW: 8, torsoD: 6, headW: 6, headH: 7, headD: 6, armW: 2, upper: 4, fore: 4, hand: 2 });
  const H0 = A.headY0, H1 = A.headY1, F = A.faceZ, B = A.headZ - A.headD / 2 - 1, T0 = A.torsoY0;
  // hourglass: hips widened to the legs' outer edge (8), the waist stays 6 and is wrapped by the sash, the chest is 8 again
  v.part('hips').box(-4, A.hipY, -3, 3, A.hipY + 1, 2, GI);
  v.paint(c => (c.y <= T0 + 1 ? GREEN : null), 'spine');
  // the sash knot at the back, left of the spine (the waist stays clean from the front), two ribbons of different lengths hanging
  // from it over the hips (their own joint, so they swing)
  v.part('spine').box(1, T0, -4, 2, T0 + 1, -4, GREEN_D);
  v.bone('sash', 'hips', 2, T0, -3.5);
  v.part('sash').box(1, A.hipY - 6, -4, 1, T0 - 1, -4, GREEN).box(2, A.hipY - 4, -4, 2, T0 - 1, -4, GREEN_D);
  // wrap-over gi: the overlap edge down the chest; the hood's cowl over the upper back
  v.paint(c => (c.z === 2 && c.x === 0 && c.y >= T0 + 3 ? GREEN_D : null), 'chest');
  v.part('chest').box(-3, A.torsoY1 - 1, B, 2, A.torsoY1, B, GI);
  // slate bracers ending in a dark sleeve at the elbow (the forearm's top row: upper arm is 4), wrapped shins
  const elbow = A.shoulderY - 5;
  for (const f of ['foreL', 'foreR']) v.part(f).box(f === 'foreL' ? 4 : -6, elbow, -1, f === 'foreL' ? 5 : -5, elbow, 0, GI);
  for (const l of ['shinL', 'shinR']) v.part(l).box(l === 'shinL' ? 1 : -4, 2, -1, l === 'shinL' ? 3 : -2, 4, 1, GI_L);
  // head: a close hood (an 8-wide shell, a narrower top tier, the front edge bound in green), a strip of face — glowing eyes, a
  // row of skin, dark brows — a mask with a nose ridge, and two silver locks slipping out of the hood beside the face onto the chest
  v.part('head').box(-4, H0, B, 3, H1, F - 1, GI).box(-3, H1 + 1, B + 1, 2, H1 + 1, F - 1, GI)
    .box(-3, H0, F, 2, H1, F, SK).box(-4, H1, F, 3, H1, F, GREEN)
    .box(-3, H0, F, 2, H0 + 2, F, MASK).box(-1, H0 + 2, F + 1, 0, H0 + 2, F + 1, MASK)
    .box(-4, H0 - 3, F, -4, H1 - 1, F, HAIR_D).box(3, H0 - 3, F, 3, H1 - 1, F, HAIR_D);
  // almond eyes: the glow on the inner cell, a dark liner on the outer one
  eyes(v, A, { y: 3, w: 1, h: 1, gap: 2, style: 'glow', glow: EYE });
  v.part('head').sym(2, H0 + 3, F, GI).symBox(1, H0 + 5, F, 2, H0 + 5, F, SKD);
  // long ears out through the hood, swept out, back and up: a root at eye level, then a point one row higher (two straight runs)
  v.part('head').symBox(4, H0 + 3, -2, 6, H0 + 4, 0, SK).symBox(6, H0 + 5, -5, 7, H0 + 5, -2, SK);
  // the high ponytail: a green tie in the hood's crown, the hair thrown back out of it over the hood's top edge, falling against the
  // back of the hood (lit down the middle, darker and shorter at the sides), a wrap, a narrower tier to mid-back. Its own joint: it
  // hangs and trails (heroPose.ts), and only ever swings away from the hood.
  v.part('head').box(-1, H1 + 1, -2, 0, H1 + 2, -1, GREEN);
  v.bone('pony', 'head', 0, H1 + 2, -2);
  v.part('pony'); rbox(v, -2, H1 + 1, -6, 1, H1 + 2, -3, HAIR, 1);
  v.box(-2, H0 + 2, -6, 1, H1, -5, HAIR_D).box(-1, H0 + 1, -6, 0, H1, -5, HAIR).box(-1, H0, -6, 0, H0, -5, GREEN_D).box(-1, T0 + 2, -6, 0, H0 - 1, -5, HAIR);
  // 双匕首正握，同男版：护手在拳头前一格，柄从拳心贯穿，刃完整露出。
  for (const side of ['R', 'L'] as const) {
    const at = side === 'R' ? A.wR : A.wL, [x, y, z] = at, part = side === 'R' ? 'weapon' : 'offhand';
    sword(v, A, { len: 8, blade: 0xe6f0f6, guard: GREEN_D, grip: GREEN_D, part, at: [x, y, z + 1] });
    v.part(part).set(x, y, z - 2, GREEN_D).set(x, y, z - 3, HAIR);
    heroGrip(v, at, side, BOOT, GI_L);
  }
  return v;
}

function rogueM(): V {
  // 影锋刺客（男 · 备用，?rogue=m）— a night-elf shinobi: dusky violet skin, long swept ears, a silver top-knot, a black mask and
  // hood-wrap with long green tails, a dark wrapped gi with green sash and arm wraps, split-toe boots, twin short blades held forward
  const v = newChar(), SK = 0x8a7ab8, SKD = 0x6a5a98, GI = 0x23232c, GI_L = 0x34343e, GREEN = 0x2ea860, GREEN_D = 0x1e7a46, SILV = 0xdfe6ee, EYE = 0xf0fff8;
  const A = biped(v, { skin: SK, legs: GI, boots: 0x16161c, hips: GI, torso: GI, chest: GI_L, belt: GREEN, sleeve: GI, fore_: GI_L, hands: 0x16161c, legH: 9, legW: 3, legD: 3, legGap: 1, hipH: 2, torsoH: 8, torsoW: 8, chestW: 10, torsoD: 6, headW: 8, headH: 8, headD: 8, armW: 3, upper: 4, fore: 4, hand: 2 });
  // crossed lapels, sash with hanging tails, wrapped shins and forearms
  v.part('chest').box(-1, A.torsoY0 + 4, 3, 0, A.torsoY1, 3, GREEN_D).box(-5, A.torsoY1, -3, 4, A.torsoY1, 2, GI);
  v.part('hips').box(2, A.hipY - 4, 3, 3, A.hipY + 1, 3, GREEN).box(-4, A.hipY + 1, 3, 3, A.hipY + 1, 3, GREEN_D);
  for (const l of ['shinL', 'shinR']) v.part(l).box(l === 'shinL' ? 1 : -4, 3, 2, l === 'shinL' ? 3 : -2, 3, 2, GI_L);
  for (const f of ['foreL', 'foreR']) v.part(f).box(f === 'foreL' ? 5 : -8, A.handY + 3, -1, f === 'foreL' ? 7 : -6, A.handY + 3, 1, GREEN_D);
  // shoulder guard on the left
  v.part('shL').box(5, A.shoulderY - 1, -2, 8, A.shoulderY, 1, GI_L).box(5, A.shoulderY, -2, 8, A.shoulderY, 1, GREEN_D);
  // head: mask over the lower face, glowing elven eyes, long ears swept back, a hood-wrap with long tails, silver top-knot
  eyes(v, A, { y: 4, w: 2, h: 1, gap: 2, style: 'glow', glow: EYE, brow: SKD });
  v.part('head').box(-5, A.headY0 - 1, -5, 4, A.headY1 + 1, A.faceZ - 1, GI).box(-4, A.headY1 + 2, -4, 3, A.headY1 + 2, A.faceZ - 2, GI).box(-2, A.headY1 + 3, -5, 1, A.headY1 + 3, -3, GI_L)
    .box(-5, A.headY0 - 1, A.faceZ, 4, A.headY0 + 3, A.faceZ, GI).box(-5, A.headY0 + 6, A.faceZ, 4, A.headY1 + 1, A.faceZ, GI).box(-5, A.headY0 + 4, A.faceZ, -5, A.headY0 + 5, A.faceZ, GI).box(4, A.headY0 + 4, A.faceZ, 4, A.headY0 + 5, A.faceZ, GI)
    .box(-5, A.headY0 + 6, A.faceZ, 4, A.headY0 + 6, A.faceZ, GREEN).box(-5, A.headY0 - 1, -5, 4, A.headY0 - 1, A.faceZ, GREEN_D)
    .box(-8, A.headY0 + 4, -2, -6, A.headY0 + 5, 0, SK).box(-10, A.headY0 + 6, -4, -9, A.headY0 + 6, -2, SK).box(5, A.headY0 + 4, -2, 7, A.headY0 + 5, 0, SK).box(8, A.headY0 + 6, -4, 9, A.headY0 + 6, -2, SK);
  v.part('cape').box(-1, A.torsoY1 - 4, -4, 0, A.torsoY1 + 4, -4, GREEN).box(1, A.torsoY1 - 2, -5, 2, A.torsoY1 + 4, -5, GREEN_D).box(-1, A.torsoY1 - 9, -5, 0, A.torsoY1 - 5, -5, GREEN);
  // 双匕首正握；护手在拳头前一格，柄从拳心贯穿，刃完整露出。
  for (const side of ['R', 'L'] as const) {
    const at = side === 'R' ? A.wR : A.wL, [x, y, z] = at, part = side === 'R' ? 'weapon' : 'offhand';
    sword(v, A, { len: 8, blade: 0xe6f0f6, guard: GREEN_D, grip: GREEN_D, part, at: [x, y, z + 1] });
    v.part(part).set(x, y, z - 2, GREEN_D).set(x, y, z - 3, SILV);
    heroGrip(v, at, side, 0x16161c, GI_L);
  }
  return v;
}

// ================================================================== chapter 1 — normals
function ghoul(): V {
  const v = newChar(), H = 0x7c9a52, HD = 0x4c6236;
  const A = biped(v, { skin: H, legs: H, hips: 0x4a3a32, torso: H, belt: 0x4a3a32, legH: 7, legW: 3, hipH: 2, torsoH: 6, torsoW: 8, chestW: 10, torsoD: 6, headW: 8, headH: 7, headD: 8, headZ: 2, armW: 2, upper: 5, fore: 4, hand: 3 });
  v.part('chest').box(-4, A.torsoY0 + 4, 2, -2, A.torsoY0 + 4, 2, HD).box(1, A.torsoY0 + 4, 2, 3, A.torsoY0 + 4, 2, HD);
  v.part('chest').box(-1, A.torsoY0 + 3, -4, 0, A.torsoY1, -4, HD);
  v.part('hips').box(-1, A.hipY - 3, 3, 0, A.hipY, 3, 0x4a3a32);
  eyes(v, A, { y: 3, w: 2, h: 1, gap: 2, style: 'glow', glow: 0xff3a20 });
  v.part('head').symBox(1, A.headY0 + 4, A.faceZ, 3, A.headY0 + 4, A.faceZ + 1, HD).symBox(4, A.headY0 + 4, 0, 5, A.headY0 + 5, 1, H);
  v.box(-4, A.headY0, A.faceZ, 3, A.headY0, A.faceZ, 0x8a2030).sym(2, A.headY0, A.faceZ, 0xeee2c0).sym(0, A.headY0, A.faceZ, 0xeee2c0);
  v.part('jaw').box(-3, A.headY0 - 2, A.faceZ - 3, 2, A.headY0 - 1, A.faceZ, HD).sym(2, A.headY0 - 1, A.faceZ, 0xeee2c0);
  claws(v, A, 1, 0x201a1e, 2, 3); claws(v, A, -1, 0x201a1e, 2, 3);
  return v;
}

function spider(): V {
  const v = newChar(), B = 0x2a1a34, BL = 0x4a2a5a, LEG = 0x221628, TOX = 0x9aff3a;
  v.bone('body', 'root', 0, 9, 0).bone('abdomen', 'body', 0, 10, -5).bone('head', 'body', 0, 9, 5).bone('jaw', 'head', 0, 8, 9);
  v.part('abdomen'); rbox(v, -8, 6, -20, 7, 20, -4, B, 3);
  v.box(-1, 20, -17, 0, 20, -7, TOX, 1).symBox(3, 19, -12, 4, 19, -11, TOX, 1);
  v.part('body'); rbox(v, -5, 7, -4, 4, 13, 4, B, 2);
  v.part('head'); rbox(v, -4, 7, 4, 3, 13, 10, BL, 1);
  v.symBox(1, 11, 11, 2, 12, 11, 0xff2a2a, 1).sym(3, 13, 10, 0xff2a2a, 1);
  v.part('jaw').symBox(1, 5, 10, 2, 7, 11, 0x1a1020).sym(1, 4, 11, TOX, 1);
  // eight legs, each two straight segments: out and up to the knee, then down to the ground
  // thin legs fanned out front to back: up from the body, out to a high knee, down to the ground
  const zs = [5, 1, -4, -9], reach = [11, 14, 14, 12], spread = [5, 2, -3, -7];
  for (let i = 0; i < 4; i++) for (const sx of [1, -1]) {
    const name = `leg${sx > 0 ? 'L' : 'R'}${i}`, z = zs[i] + spread[i];
    v.bone(name, 'body', sx * 5, 10, zs[i]);
    v.part(name);
    const x0 = sx > 0 ? 5 : -6, xk = sx * reach[i] + (sx > 0 ? 0 : -1);
    v.box(x0, 10, zs[i], x0, 14, zs[i], LEG).box(Math.min(x0, xk), 14, Math.min(zs[i], z), Math.min(x0, xk), 14, Math.max(zs[i], z), LEG)
      .box(Math.min(x0, xk), 14, z, Math.max(x0, xk), 14, z, LEG).box(xk, 0, z, xk, 14, z, LEG).set(xk, 15, z, 0x6a3a8a);
  }
  return v;
}

function treant(): V {
  // 腐化树人 — a withered, evil tree-thing: grey-black dead wood split by sickly violet rot, a hunched trunk with a jagged maw of
  // splinter teeth and two hollow sockets burning toxic yellow, long thorned branch-arms ending in claw twigs, a crown of bare
  // broken spikes hung with grey moss, roots for feet
  const v = newChar(), W = 0x3e3632, WD = 0x272120, WL = 0x5a504a, ROT = 0x9a3ad8, MOSS = 0x6a7058, EYE = 0xd8ff3a;
  const A = biped(v, { skin: W, legs: WD, boots: WD, hips: W, torso: W, chest: W, belt: null, legH: 8, legW: 4, legD: 5, legGap: 1, hipH: 2, torsoH: 10, torsoW: 12, chestW: 14, torsoD: 10, headW: 12, headH: 10, headD: 10, headZ: 1, armW: 3, upper: 7, fore: 7, hand: 3, round: 1 });
  // splits in the bark with violet rot showing through, a few lighter dead-wood strips
  v.paint(c => c.c === W && c.z >= 4 && (c.x === -5 || c.x === 4) ? WD : null);
  v.part('chest').box(-2, A.torsoY0 + 4, 5, -2, A.torsoY1, 5, ROT, 1).box(2, A.torsoY0 + 6, 5, 2, A.torsoY1 - 1, 5, ROT, 1).box(-6, A.torsoY0 + 5, 2, -6, A.torsoY1, 2, WL);
  v.part('spine').box(-1, A.torsoY0, 5, -1, A.torsoY0 + 3, 5, ROT, 1);
  // face: deep hollow sockets with toxic embers, a heavy brow ridge, a jagged maw of splinters
  v.part('head').symBox(2, A.headY0 + 5, A.faceZ, 4, A.headY0 + 7, A.faceZ, P.DARK).symBox(3, A.headY0 + 6, A.faceZ, 3, A.headY0 + 6, A.faceZ, EYE, 1)
    .symBox(1, A.headY0 + 8, A.faceZ + 1, 5, A.headY0 + 8, A.faceZ + 1, WD).box(-1, A.headY0 + 7, A.faceZ + 1, 0, A.headY0 + 7, A.faceZ + 1, WD)
    .box(-4, A.headY0 + 1, A.faceZ, 3, A.headY0 + 3, A.faceZ, P.DARK).box(-4, A.headY0 + 3, A.faceZ, 3, A.headY0 + 3, A.faceZ, P.DARK);
  for (const x of [-4, -2, 1, 3]) v.part('head').box(x, A.headY0 + 3, A.faceZ, x, A.headY0 + 3, A.faceZ, WL);
  for (const x of [-3, 0, 2]) v.part('head').box(x, A.headY0 + 1, A.faceZ, x, A.headY0 + 1, A.faceZ, WL);
  // crown of bare broken spikes, grey moss hanging
  v.part('hat').box(-5, A.headY1 + 1, -2, -4, A.headY1 + 7, -1, WD).box(-6, A.headY1 + 7, -2, -6, A.headY1 + 9, -1, WD)
    .box(3, A.headY1 + 1, -3, 4, A.headY1 + 9, -2, WD).box(5, A.headY1 + 9, -3, 5, A.headY1 + 11, -2, WD)
    .box(-1, A.headY1 + 1, 1, 0, A.headY1 + 5, 2, WD).box(-2, A.headY1 + 5, 1, -2, A.headY1 + 6, 2, WD);
  v.part('head').box(-6, A.headY0 - 2, -2, -6, A.headY1 - 2, -1, MOSS).box(5, A.headY0, 0, 5, A.headY1 - 3, 1, MOSS);
  // long branch arms with thorns and claw twigs
  for (const [arm, fore, hand, sx] of [['armL', 'foreL', 'handL', 1], ['armR', 'foreR', 'handR', -1]] as Array<[string, string, string, number]>) {
    const x0 = sx > 0 ? A.chestW / 2 : -A.chestW / 2 - 3;
    v.part(arm).box(sx > 0 ? x0 + 3 : x0 - 1, A.shoulderY - 4, 0, sx > 0 ? x0 + 3 : x0 - 1, A.shoulderY - 4, 0, WD);
    v.part(fore).box(sx > 0 ? x0 + 3 : x0 - 1, A.handY + 5, 1, sx > 0 ? x0 + 3 : x0 - 1, A.handY + 5, 1, WD);
    v.part(hand).box(x0, A.handY - 4, 1, x0, A.handY - 1, 1, WD).box(x0 + 2, A.handY - 5, 1, x0 + 2, A.handY - 1, 1, WD).box(x0 + 1, A.handY - 3, -1, x0 + 1, A.handY - 1, -1, WD);
  }
  v.part('shL').box(7, A.shoulderY, -2, 9, A.shoulderY + 2, 1, WD).box(8, A.shoulderY + 3, -1, 8, A.shoulderY + 4, -1, WD);
  v.part('shR').box(-10, A.shoulderY, -2, -8, A.shoulderY + 1, 1, WD);
  // root feet spreading forward
  for (const f of ['footL', 'footR']) { const x0 = f === 'footL' ? 1 : -5; v.part(f).box(x0 - 1, 0, 2, x0 - 1, 0, 4, WD).box(x0 + 4, 0, 2, x0 + 4, 0, 4, WD); }
  return v;
}

function banshee(): V {
  const v = newChar(), SK = 0x8ab4cc, DR = 0x5a6a9a, DRD = 0x3a4878, HAIR = 0xa8bcd8;
  const A = biped(v, { skin: SK, robe: { c: DR }, torso: DR, chest: DR, sleeve: DRD, fore_: SK, hands: SK, belt: null, legH: 9, hipH: 2, torsoH: 6, torsoW: 8, chestW: 8, torsoD: 6, headW: 8, headH: 8, headD: 8, armW: 2, upper: 5, fore: 5, hand: 2 });
  for (const c of [...v.cells.values()]) if (c.part === 'hips' || c.part === 'footL' || c.part === 'footR') v.set(c.x, c.y, c.z, null);
  ghostTail(v, A, 5, 4, DR, 0x7ad8ff, 5);
  v.paint(c => c.y < 2 ? 0x7ad8ff : c.y < 5 ? DRD : null, 'hips');
  for (const c of v.cells.values()) if (c.part === 'hips' && c.y < 2) c.g = 1;
  eyes(v, A, { y: 4, w: 2, h: 2, gap: 2, style: 'glow', glow: 0x6ae8ff });
  v.part('head').box(-2, A.headY0 + 1, A.faceZ, 1, A.headY0 + 2, A.faceZ, P.DARK).box(-1, A.headY0, A.faceZ, 0, A.headY0, A.faceZ, P.DARK).box(-1, A.headY0 + 1, A.faceZ, 0, A.headY0 + 2, A.faceZ, 0x2a4a6a);
  // long flowing hair down the back (cape bone so it streams)
  v.part('head').box(-5, A.headY0 + 2, -5, 4, A.headY1 + 1, -4, HAIR).symBox(4, A.headY0 - 2, -4, 4, A.headY1, 2, HAIR).box(-4, A.headY1 + 1, -4, 3, A.headY1 + 1, 3, HAIR);
  v.part('cape').box(-5, A.torsoY0 - 6, -5, 4, A.torsoY1 + 1, -4, HAIR).box(-4, A.torsoY0 - 9, -5, -2, A.torsoY0 - 7, -5, HAIR).box(1, A.torsoY0 - 8, -5, 3, A.torsoY0 - 7, -5, HAIR);
  // tattered sleeves
  for (const s of ['armL', 'armR']) v.part(s).box(s === 'armL' ? 4 : -7, A.shoulderY - 6, -1, s === 'armL' ? 6 : -5, A.shoulderY - 5, 1, DRD);
  return v;
}

function wolfSpirit(): V {
  const v = newChar(), F = 0x5e6e9e, FL = 0x9aaad0, FD = 0x3a4672, MOON = 0xc8ecff;
  v.bone('hips', 'root', 0, 10, -6).bone('chest', 'hips', 0, 10, 2).bone('neck', 'chest', 0, 13, 7).bone('head', 'neck', 0, 14, 9).bone('jaw', 'head', 0, 13, 13)
    .bone('legFL', 'chest', 3, 9, 5).bone('legFR', 'chest', -3, 9, 5).bone('legBL', 'hips', 3, 9, -8).bone('legBR', 'hips', -3, 9, -8).bone('tail', 'hips', 0, 12, -13).bone('tail2', 'tail', 0, 14, -18);
  v.part('hips'); rbox(v, -4, 7, -13, 3, 13, -2, F, 2);
  v.part('chest'); rbox(v, -5, 7, -2, 4, 15, 8, F, 2); v.box(-3, 7, 3, 2, 10, 8, FL);
  v.part('neck'); rbox(v, -3, 12, 6, 2, 17, 10, FL, 1);
  v.part('head'); rbox(v, -4, 13, 8, 3, 19, 14, F, 1); v.box(-2, 13, 15, 1, 16, 18, F).box(-2, 16, 18, 1, 16, 18, P.DARK).box(-2, 13, 15, 1, 13, 17, FL);
  v.sym(1, 17, 14, 0x9af0ff, 1).sym(2, 17, 14, P.DARK).symBox(2, 20, 9, 3, 23, 11, F).box(-1, 19, 14, 0, 19, 14, MOON, 1);
  v.part('jaw').box(-2, 12, 13, 1, 12, 17, FL).sym(1, 13, 17, P.WHITE);
  for (const [n, x, z] of [['legFL', 2, 4], ['legFR', -4, 4], ['legBL', 2, -9], ['legBR', -4, -9]] as Array<[string, number, number]>) { v.part(n).box(x, 1, z - 1, x + 2, 9, z + 1, F).box(x, 0, z - 1, x + 2, 0, z + 2, FD); }
  v.part('tail').box(-2, 11, -18, 1, 14, -14, F);
  v.part('tail2').box(-2, 13, -23, 1, 16, -19, FL).box(-1, 14, -24, 0, 16, -24, MOON, 1);
  v.part('hips').box(-1, 14, -11, 0, 14, -4, MOON, 1); v.part('chest').box(-1, 16, -1, 0, 16, 5, MOON, 1);
  return v;
}

function boneReaver(): V {
  const v = newChar(), B = P.BONE, BD = P.BONE_D, RAG = 0x8a1a1a;
  const A = biped(v, { skin: B, legs: B, boots: P.IRON_DD, hips: BD, torso: P.DARK, chest: P.DARK, belt: P.LEATH_D, legW: 2, legD: 2, legGap: 2, legH: 8, hipH: 2, torsoH: 7, torsoW: 8, chestW: 10, torsoD: 6, headW: 8, headH: 8, headD: 8, armW: 2, upper: 4, fore: 4, hand: 2 });
  // three rib bands around a dark hollow, a spine behind
  for (const y of [A.torsoY0 + 3, A.torsoY0 + 5]) v.part('chest').box(-5, y, -3, 4, y, 2, B);
  v.part('spine').box(-4, A.torsoY0 + 1, -3, 3, A.torsoY0 + 1, 2, B).box(-1, A.torsoY0, -3, 0, A.torsoY1, -3, BD);
  v.part('hips').box(-2, A.hipY - 4, 3, 1, A.hipY, 3, RAG).box(-3, A.hipY - 3, -4, 2, A.hipY, -4, RAG);
  v.part('head').symBox(1, A.headY0 + 3, A.faceZ, 2, A.headY0 + 4, A.faceZ, P.DARK).sym(1, A.headY0 + 3, A.faceZ, 0xff3020, 1)
    .box(-1, A.headY0 + 2, A.faceZ, 0, A.headY0 + 2, A.faceZ, P.DARK).box(-3, A.headY0, A.faceZ, 2, A.headY0, A.faceZ, BD);
  // horned iron helm: straight horns
  v.part('hat'); rbox(v, -5, A.headY1 - 2, -5, 4, A.headY1 + 1, 4, P.IRON_DD, 1);
  v.box(-5, A.headY1 - 2, 4, 4, A.headY1 - 2, 4, P.IRON).symBox(5, A.headY1, -1, 6, A.headY1, 0, B).symBox(6, A.headY1 + 1, -1, 6, A.headY1 + 3, 0, B);
  v.part('shR').box(-10, A.shoulderY - 1, -2, -6, A.shoulderY + 1, 1, P.IRON_D).box(-8, A.shoulderY + 2, -1, -8, A.shoulderY + 3, -1, B);
  sword(v, A, { len: 14, w: 3, blade: B, guard: P.IRON_DD, grip: P.LEATH_D });
  v.part('weapon').box(A.wR[0], A.wR[1] - 1, A.wR[2] + 10, A.wR[0], A.wR[1], A.wR[2] + 11, P.BLOOD);
  return v;
}

function poisonSprite(): V {
  const v = newChar(), LEAF = 0x4a8a2e, LEAF_D = 0x2e6020, CAP = 0x7a2a98, SPOT = 0xe0c8f0;
  v.bone('body', 'root', 0, 7, 0).bone('head', 'body', 0, 7, 0).bone('hat', 'head', 0, 13, 0).bone('armL', 'body', 5, 9, 0).bone('armR', 'body', -5, 9, 0).bone('tail', 'body', 0, 3, 0);
  v.part('head'); rbox(v, -5, 4, -5, 4, 13, 4, LEAF, 2); v.box(-5, 4, -5, 4, 5, 4, LEAF_D);
  v.symBox(1, 9, 5, 2, 10, 5, P.DARK).sym(1, 10, 5, 0xffd040, 1).sym(2, 9, 5, 0xffd040, 1).box(-1, 7, 5, 0, 7, 5, 0x1a2a10);
  // mushroom cap in two tiers with four spots
  v.part('hat').box(-7, 13, -7, 6, 14, 6, CAP).box(-5, 15, -5, 4, 16, 4, CAP).box(-6, 12, -6, 5, 12, 5, 0xe0c8f0);
  v.box(-5, 15, 5, -4, 15, 5, SPOT).box(3, 14, 6, 4, 14, 6, SPOT).box(-1, 17, -1, 0, 17, 0, SPOT).box(4, 15, -5, 4, 16, -4, SPOT);
  for (const [s2, sx] of [['armL', 1], ['armR', -1]] as Array<[string, number]>) v.part(s2).box(sx > 0 ? 5 : -7, 8, -1, sx > 0 ? 6 : -6, 9, 0, LEAF_D);
  v.part('tail').box(-1, 2, -1, 0, 3, 0, P.POISON, 1).box(1, 0, 0, 1, 0, 0, P.POISON, 1).box(-2, 1, 1, -2, 1, 1, P.POISON, 1);
  return v;
}

function mossGolem(): V {
  const v = newChar(), S = 0x6a6c78, SD = 0x4a4c58;
  const A = biped(v, { skin: S, legs: S, hips: SD, torso: S, belt: null, legH: 7, legW: 5, legD: 6, legGap: 1, hipH: 3, torsoH: 11, torsoW: 16, chestW: 20, torsoD: 12, headW: 8, headH: 6, headD: 8, headZ: 3, armW: 6, upper: 5, fore: 6, hand: 5, round: 2 });
  v.paint(c => (!v.get(c.x, c.y + 1, c.z) && c.c === S) ? P.MOSS : null);
  v.part('chest').box(-1, A.torsoY1 - 4, 6, 0, A.torsoY1 - 3, 6, 0xffb040, 1).box(-3, A.torsoY1 - 5, 6, 2, A.torsoY1 - 5, 6, SD).box(-3, A.torsoY1 - 2, 6, 2, A.torsoY1 - 2, 6, SD);
  eyes(v, A, { y: 2, w: 2, h: 1, gap: 2, style: 'glow', glow: 0xffa030 });
  v.part('head').box(-4, A.headY0 + 3, A.faceZ, 3, A.headY0 + 3, A.faceZ + 1, SD);
  for (const [s2, x] of [['armL', 12], ['armR', -13]] as Array<[string, number]>) v.part(s2).box(x, A.shoulderY - 6, 3, x, A.shoulderY - 1, 3, P.MOSS_D);
  return v;
}

function wraithCultist(): V {
  const v = newChar(), R = 0x2a1a3a, RD = 0x1a1026, HAND = 0xa8a0b8;
  const A = biped(v, { skin: HAND, robe: { c: R }, torso: R, sleeve: R, fore_: RD, hands: HAND, belt: 0x5a3a7a, legH: 9, hipH: 2, torsoH: 7, torsoW: 8, chestW: 10, torsoD: 6, headW: 8, headH: 8, headD: 8, armW: 3, upper: 3, fore: 4, hand: 2 });
  for (const c of [...v.cells.values()]) if (c.part === 'hips' || c.part === 'footL' || c.part === 'footR') v.set(c.x, c.y, c.z, null);
  ghostTail(v, A, 6, 5, R, 0x6a3aa8, 3);
  for (const c of v.cells.values()) if (c.part === 'hips' && c.y < 3) c.g = 1;
  for (const [x, y] of [[-3, 5], [2, 6], [-1, 8], [3, 9]]) v.part('hips').set(x, y, 4, P.CURSE, 1);
  hoodShell(v, A, R, { extra: 1, peak: 3, dark: P.DARK });
  v.part('head').box(-4, A.headY0, A.faceZ, 3, A.headY1, A.faceZ, P.DARK);
  eyes(v, A, { y: 4, w: 2, h: 1, gap: 2, style: 'glow', glow: P.CURSE });
  // a cursed tome floating at the left hand
  v.part('offhand').box(A.wL[0] - 2, A.wL[1] - 1, 2, A.wL[0] + 2, A.wL[1] + 3, 3, 0x3a2418).box(A.wL[0] - 1, A.wL[1], 4, A.wL[0] + 1, A.wL[1] + 2, 4, P.CURSE, 1);
  return v;
}

function oldWillow(): V {
  const v = newChar(), BK = 0x7a5a3a, BD = 0x4e3622, W = 0x5e8e34, WD = 0x3e6a24;
  const A = biped(v, { skin: BK, robe: { c: 0x5a4a2a, flare: 2, trim: WD, hem: 0x3e3420 }, torso: 0x6a5434, sleeve: 0x5a4a2a, hands: BK, boots: BD, belt: WD, torsoW: 8, chestW: 10, torsoH: 7, torsoD: 6, headW: 8, headH: 9, headD: 8, headZ: 1, armW: 3, upper: 3, fore: 4, hand: 2 });
  eyes(v, A, { y: 4, w: 2, h: 1, gap: 2, style: 'glow', glow: 0xffd860 });
  v.part('head').symBox(1, A.headY0 + 5, A.faceZ, 3, A.headY0 + 5, A.faceZ + 1, BD).box(-1, A.headY0 + 2, A.faceZ + 1, 0, A.headY0 + 4, A.faceZ + 1, BK);
  // willow hair: a flat crown and three broad curtains (back and sides), a long beard
  v.part('hat').box(-6, A.headY1 + 1, -6, 5, A.headY1 + 2, 5, W);
  v.box(-6, A.headY0 - 6, -6, 5, A.headY1, -5, WD).symBox(5, A.headY0 - 3, -5, 5, A.headY1, 2, W);
  v.part('jaw').box(-2, A.headY0 - 7, A.faceZ, 1, A.headY0 + 1, A.faceZ + 1, W).box(-2, A.headY0 + 1, A.faceZ + 1, 1, A.headY0 + 1, A.faceZ + 1, BD);
  const top = staff(v, A, { len: 18, wood: BD, back: 8 });
  v.part('weapon').box(top[0] - 1, top[1] - 1, top[2], top[0] + 1, top[1] + 1, top[2] + 2, 0xd8ff6a, 1);
  return v;
}

// ================================================================== chapter 1 — elites
function necromancer(): V {
  const v = newChar(), R = 0x1e4a34, RD = 0x12261c, SK = 0xb8c0b0;
  const A = biped(v, { skin: SK, robe: { c: R, flare: 3, trim: P.BONE_D, hem: RD }, torso: RD, chest: R, sleeve: R, fore_: RD, hands: SK, boots: P.DARK, belt: P.BONE_D, torsoW: 8, chestW: 10, torsoH: 8, torsoD: 6, headW: 8, headH: 8, headD: 8, armW: 3, upper: 3, fore: 4, hand: 2 });
  hoodShell(v, A, RD, { extra: 1 });
  eyes(v, A, { y: 4, w: 2, h: 1, gap: 2, style: 'glow', glow: P.SOUL, brow: 0x6a7068 });
  v.part('head').box(-1, A.headY0 + 1, A.faceZ, 0, A.headY0 + 1, A.faceZ, 0x4a5048);
  // ram horns: out, then down, then forward — three straight runs
  v.part('head').symBox(5, A.headY0 + 7, 0, 7, A.headY0 + 8, 1, P.BONE_D).symBox(7, A.headY0 + 4, 0, 8, A.headY0 + 7, 1, P.BONE_D).symBox(7, A.headY0 + 4, 2, 8, A.headY0 + 5, 3, P.BONE_D);
  for (const [s2, x0] of [['shL', 5], ['shR', -9]] as Array<[string, number]>) { v.part(s2); rbox(v, x0, A.shoulderY - 1, -2, x0 + 3, A.shoulderY + 2, 2, P.BONE, 1); v.box(x0 + 1, A.shoulderY, 2, x0 + 2, A.shoulderY, 2, P.DARK); }
  v.part('chest').box(-1, A.torsoY0 + 3, 3, 0, A.torsoY1, 3, P.BONE_D);
  const top = staff(v, A, { len: 20, wood: 0x2a2a30, back: 8 });
  v.part('weapon'); rbox(v, top[0] - 2, top[1] - 1, top[2] - 1, top[0] + 2, top[1] + 2, top[2] + 2, P.BONE, 1);
  v.box(top[0] - 1, top[1] + 1, top[2] + 2, top[0] + 1, top[1] + 1, top[2] + 2, P.DARK).box(top[0] - 1, top[1] + 3, top[2], top[0] + 1, top[1] + 5, top[2] + 1, P.SOUL, 1);
  return v;
}

function werewolf(): V {
  const v = newChar(), F = 0x5a4840, FD = 0x3a2e2a, FL = 0xb09878, PANTS = 0x3a3a4a;
  const A = biped(v, { skin: F, legs: PANTS, boots: FD, hips: PANTS, torso: F, chest: F, belt: P.LEATH_D, legH: 9, legW: 4, legD: 5, legGap: 1, hipH: 2, torsoH: 9, torsoW: 12, chestW: 16, torsoD: 10, headW: 8, headH: 7, headD: 8, headZ: 3, armW: 4, upper: 5, fore: 5, hand: 3 });
  v.part('chest').box(-4, A.torsoY0 + 3, 5, 3, A.torsoY1 - 1, 5, FL); v.part('spine').box(-3, A.torsoY0, 5, 2, A.torsoY0 + 3, 5, FL);
  v.part('chest').box(-8, A.torsoY1 + 1, -5, 7, A.torsoY1 + 2, 3, FD).box(-6, A.torsoY1 + 3, -4, 5, A.torsoY1 + 3, 1, FD);
  // a long snout, fangs, glowing eyes, tall ears
  v.part('head').box(-2, A.headY0, A.faceZ + 1, 1, A.headY0 + 3, A.faceZ + 5, F).box(-2, A.headY0 + 3, A.faceZ + 5, 1, A.headY0 + 3, A.faceZ + 5, P.DARK)
    .box(-2, A.headY0, A.faceZ + 1, 1, A.headY0, A.faceZ + 5, FL).sym(1, A.headY0 - 1, A.faceZ + 5, P.WHITE);
  eyes(v, A, { y: 4, w: 2, h: 1, gap: 2, style: 'glow', glow: 0xffd040, brow: FD });
  v.part('hat').symBox(2, A.headY1 + 1, 0, 3, A.headY1 + 4, 1, F);
  v.part('jaw').box(-2, A.headY0 - 1, A.faceZ + 1, 1, A.headY0 - 1, A.faceZ + 4, FD);
  v.paint(c => c.y < 5 && c.c === PANTS ? F : null);
  claws(v, A, 1, P.WHITE, 3, 2); claws(v, A, -1, P.WHITE, 3, 2);
  v.bone('tail', 'hips', 0, A.hipY + 1, -5); v.part('tail').box(-1, A.hipY - 4, -9, 0, A.hipY + 1, -6, F);
  return v;
}

function phantomHunter(): V {
  const v = newChar(), C = 0x1e4a5a, CD = 0x12303c, SK = 0x9ac0c8, GH = 0x7af0ff;
  const A = biped(v, { skin: SK, legs: 0x22303a, boots: 0x16202a, hips: CD, torso: 0x2a3a44, chest: 0x2a3a44, belt: P.LEATH_D, sleeve: CD, fore_: 0x2a3a44, hands: 0x22303a, torsoW: 8, chestW: 10, torsoH: 7, torsoD: 6, headW: 8, headH: 8, headD: 8, armW: 3, upper: 3, fore: 4, hand: 2 });
  hoodShell(v, A, C, { extra: 1, peak: 3 });
  v.part('head').box(-4, A.headY0, A.faceZ, 3, A.headY0 + 2, A.faceZ, 0x16202a);
  eyes(v, A, { y: 3, w: 2, h: 1, gap: 2, style: 'glow', glow: GH });
  v.part('cape').box(-5, 3, -4, 4, A.torsoY1, -4, C).box(-5, 2, -4, 4, 2, -4, GH, 1);
  v.part('chest').box(-5, A.torsoY1, -3, 4, A.torsoY1 + 1, 2, C);
  v.part('chest').box(2, A.torsoY0 + 1, -5, 4, A.torsoY1 + 2, -4, P.LEATH_D).box(2, A.torsoY1 + 3, -5, 4, A.torsoY1 + 3, -5, GH, 1);
  // longbow in the left hand: three straight segments per limb
  v.part('offhand'); const [bx, by] = A.wL;
  // limbs bow toward −y (forward once held up), the string runs on the +y side (toward the archer)
  v.box(bx, by, -2, bx, by, 2, P.LEATH_D).box(bx, by - 1, -7, bx, by - 1, -3, 0x4a6a74).box(bx, by - 1, 3, bx, by - 1, 7, 0x4a6a74).box(bx, by, -11, bx, by, -8, 0x4a6a74).box(bx, by, 8, bx, by, 11, 0x4a6a74);
  v.box(bx, by + 1, -10, bx, by + 1, 10, 0xa8c8d0);
  return v;
}

// ================================================================== chapter 1 — bosses
function lich(): V {
  const v = newChar(), R = 0x5a2488, RD = 0x36145c, RDD = 0x220c3a, MET = 0x3a3448, SOUL = 0x5affa0;
  const A = biped(v, { skin: P.BONE, robe: { c: R, flare: 4, trim: P.GOLD, hem: RD }, torso: R, chest: R, sleeve: R, fore_: R, hands: P.BONE, boots: RDD, belt: P.GOLD_D, legH: 12, hipH: 3, torsoH: 9, torsoW: 12, chestW: 14, torsoD: 8, headW: 10, headH: 10, headD: 10, armW: 4, upper: 4, fore: 5, hand: 3 });
  for (const c of [...v.cells.values()]) if (c.part === 'footL' || c.part === 'footR') v.set(c.x, c.y, c.z, null);
  v.paint(c => c.y < 2 && ((c.x * 7 + c.z * 3) & 3) === 0 ? null : null, 'hips');
  v.part('hips').paint(c => (c.x === -1 || c.x === 0) && c.z >= 3 && c.y > 3 ? P.GOLD_D : null, 'hips');
  // ribcage behind an open collar, tall spiked collar
  v.part('chest').box(-3, A.torsoY0 + 5, 3, 2, A.torsoY1 - 1, 3, P.DARK);
  for (let y = A.torsoY0 + 5; y <= A.torsoY1 - 1; y += 2) v.box(-3, y, 3, 2, y, 3, P.BONE);
  v.box(-1, A.torsoY0 + 5, 3, 0, A.torsoY1 - 1, 3, P.BONE_D).box(-1, A.torsoY1, 4, 0, A.torsoY1, 4, P.GOLD);
  v.box(-7, A.torsoY1 - 1, -5, 6, A.torsoY1 + 4, -5, RD).box(-8, A.torsoY1 - 1, -5, -8, A.torsoY1 + 3, 0, RD).box(7, A.torsoY1 - 1, -5, 7, A.torsoY1 + 3, 0, RD);
  for (const x of [-8, -5, -2, 1, 4, 7]) v.set(x, A.torsoY1 + 5, -5, RDD).set(x, A.torsoY1 + 6, -5, RDD);
  // spiked pauldrons, flared sleeves
  for (const [s, x0] of [['shL', 7], ['shR', -12]] as Array<[string, number]>) { v.part(s).box(x0, A.shoulderY - 2, -3, x0 + 4, A.shoulderY + 1, 2, MET).box(x0, A.shoulderY - 2, -3, x0 + 4, A.shoulderY - 2, 2, P.GOLD_D); for (let i = 0; i < 3; i++) v.set(x0 + 1 + i, A.shoulderY + 2 + (i & 1), -1, P.BONE).set(x0 + 1 + i, A.shoulderY + 3 + (i & 1), -1, P.BONE_D); }
  for (const [s, x0] of [['foreL', 7], ['foreR', -12]] as Array<[string, number]>) v.part(s).box(x0 - (x0 > 0 ? 0 : 1), A.handY + 3, -3, x0 + 4 + (x0 > 0 ? 1 : 0), A.handY + 4, 2, RD).box(x0 - (x0 > 0 ? 0 : 1), A.handY + 3, -3, x0 + 4 + (x0 > 0 ? 1 : 0), A.handY + 3, 2, P.GOLD_D);
  claws(v, A, 1, P.BONE_D, 4, 2); claws(v, A, -1, P.BONE_D, 4, 2);
  // hood, skull with two soul-fire eyes, crown
  hoodShell(v, A, RD, { extra: 1 });
  v.part('head').symBox(1, A.headY0 + 4, A.faceZ, 3, A.headY0 + 6, A.faceZ, P.DARK).symBox(1, A.headY0 + 4, A.faceZ, 2, A.headY0 + 5, A.faceZ, SOUL, 1)
    .box(-1, A.headY0 + 2, A.faceZ, 0, A.headY0 + 3, A.faceZ, P.DARK).symBox(1, A.headY0 + 7, A.faceZ, 4, A.headY0 + 7, A.faceZ, P.BONE_D).sym(4, A.headY0 + 3, A.faceZ, P.BONE_D);
  for (let x = -4; x <= 3; x++) v.set(x, A.headY0 + 1, A.faceZ, (x & 1) ? P.DARK : P.BONE);
  v.part('jaw').box(-3, A.headY0 - 2, A.faceZ - 3, 2, A.headY0, A.faceZ, P.BONE); for (let x = -3; x <= 2; x++) v.set(x, A.headY0, A.faceZ, (x & 1) ? P.DARK : P.BONE);
  v.part('hat'); rowOct(v, 6, 6, A.headY1 + 2, P.GOLD); rowOct(v, 5, 5, A.headY1 + 2, null as unknown as Col);
  for (const [x, z, h] of [[-6, 0, 3], [5, 0, 3], [-4, 4, 2], [3, 4, 2], [-1, 5, 4], [0, 5, 4], [-4, -4, 2], [3, -4, 2]]) v.box(x, A.headY1 + 3, z, x, A.headY1 + 2 + h, z, P.GOLD);
  v.box(-1, A.headY1 + 3, 6, 0, A.headY1 + 4, 6, SOUL, 1);
  // staff with a bone cage around the soul gem
  const top = staff(v, A, { len: 26, wood: P.WOOD_D, back: 10 });
  v.part('weapon').box(top[0] - 2, top[1] - 2, top[2], top[0] + 2, top[1] + 2, top[2] + 4, SOUL, 1).box(top[0] - 1, top[1] - 1, top[2] + 1, top[0] + 1, top[1] + 1, top[2] + 3, 0xd8ffe8, 1);
  for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) v.box(top[0] + dx, top[1] + dy, top[2] - 1, top[0] + dx, top[1] + dy, top[2] + 6, P.BONE);
  v.box(top[0] - 3, top[1] - 3, top[2] + 6, top[0] + 3, top[1] + 3, top[2] + 6, P.BONE_D).box(top[0] - 2, top[1] - 2, top[2] + 6, top[0] + 2, top[1] + 2, top[2] + 6, null);
  return v;
}

function rootColossus(): V {
  const v = newChar(), R = 0x6a4a30, RD = 0x3e2a1a, S = P.STONE;
  const A = biped(v, { skin: R, legs: R, hips: RD, torso: R, belt: null, legH: 14, legW: 7, legD: 8, legGap: 2, hipH: 4, torsoH: 16, torsoW: 22, chestW: 28, torsoD: 16, headW: 10, headH: 8, headD: 10, headZ: 4, armW: 8, upper: 9, fore: 9, hand: 7, round: 2 });
  // a few broad root bands, a stone plate holding the glowing heart
  v.paint(c => c.c === R && (((c.x + 64) % 7) === 0) ? RD : null);
  v.part('chest'); rbox(v, -9, A.torsoY0 + 9, 7, 8, A.torsoY1, 8, S, 2); v.box(-3, A.torsoY0 + 10, 9, 2, A.torsoY0 + 14, 9, P.DARK).box(-2, A.torsoY0 + 11, 9, 1, A.torsoY0 + 13, 9, 0xffb040, 1);
  for (const [s2, x0] of [['shL', 14], ['shR', -22]] as Array<[string, number]>) { v.part(s2); rbox(v, x0, A.shoulderY - 2, -6, x0 + 7, A.shoulderY + 2, 5, S, 2); }
  v.paint(c => (!v.get(c.x, c.y + 1, c.z) && (c.c === S || c.c === R)) ? P.MOSS : null);
  eyes(v, A, { y: 3, w: 2, h: 1, gap: 2, style: 'glow', glow: 0xffa030 });
  v.part('head').box(-5, A.headY0 + 4, A.faceZ, 4, A.headY0 + 4, A.faceZ + 1, RD);
  v.part('jaw').box(-4, A.headY0 - 4, A.faceZ, -3, A.headY0, A.faceZ, RD).box(2, A.headY0 - 3, A.faceZ, 3, A.headY0, A.faceZ, RD);
  v.part('hat').box(-4, A.headY1 + 1, 0, -3, A.headY1 + 5, 1, RD).box(2, A.headY1 + 1, -2, 3, A.headY1 + 6, -1, RD);
  bush(v, -14, A.shoulderY + 3, -1, 4, 2, 4, 0xd85a3a, 0xe87a5a);
  for (const [s2, x0] of [['handL', 15], ['handR', -23]] as Array<[string, number]>) { v.part(s2); for (let i = 0; i < 3; i++) v.box(x0 + i * 3, A.handY - 3 - (i & 1) * 2, -1, x0 + i * 3, A.handY - 1, 0, RD); }
  return v;
}

function covenMatriarch(): V {
  const v = newChar(), SK = 0x8aa08a, D = 0x3a1a4a, DD = 0x22102e, HAIR = 0xb8b8c0, HAT = 0x2a1a34;
  const A = biped(v, { skin: SK, robe: { c: D, flare: 4, trim: 0x5a8a3a, hem: DD }, torso: D, chest: D, sleeve: DD, fore_: D, hands: SK, belt: 0x5a8a3a, legH: 12, hipH: 2, torsoH: 10, torsoW: 10, chestW: 10, torsoD: 6, headW: 8, headH: 9, headD: 8, armW: 3, upper: 4, fore: 5, hand: 2 });
  eyes(v, A, { y: 4, w: 2, h: 1, gap: 2, style: 'glow', glow: P.CURSE, brow: 0x4a4a52 });
  v.part('head').box(-1, A.headY0 + 2, A.faceZ + 1, 0, A.headY0 + 4, A.faceZ + 1, SK).box(-1, A.headY0 + 1, A.faceZ + 2, 0, A.headY0 + 2, A.faceZ + 2, 0x6a806a)
    .box(-3, A.headY0 + 1, A.faceZ, 2, A.headY0 + 1, A.faceZ, P.DARK).sym(3, A.headY0 + 2, A.faceZ, P.DARK)
    .box(-5, A.headY0 - 6, -5, 4, A.headY1, -4, HAIR).symBox(4, A.headY0 - 5, -4, 4, A.headY1, 2, HAIR);
  // crooked witch hat: a wide brim and four tiers leaning back and to one side
  v.part('hat').box(-10, A.headY1 + 1, -10, 9, A.headY1 + 1, 9, HAT);
  tiers(v, 0, A.headY1 + 2, 0, [5, 4, 3, 2, 1], 2, i => (i === 0 ? 0x5a8a3a : HAT), { dz: -1, dx: 0.6 });
  v.box(5, A.headY1 + 2, 4, 6, A.headY1 + 3, 5, P.DARK).set(5, A.headY1 + 3, 6, 0xff2a2a, 1);
  // six spider legs from her back: out, then down
  for (let i = 0; i < 3; i++) for (const sx of [1, -1]) {
    const n = `sp${sx > 0 ? 'L' : 'R'}${i}`, y0 = A.torsoY1 - 1 - i * 3; v.bone(n, 'chest', sx * 3, y0, -3); v.part(n);
    const x1 = sx * (9 + i * 2);
    v.box(Math.min(sx * 3, x1), y0 + 3, -4 - i, Math.max(sx * 3, x1), y0 + 3, -4 - i, DD).box(x1, y0 - 4, -4 - i, x1, y0 + 3, -4 - i, DD).set(x1, y0 + 3, -4 - i, 0x6a3a8a);
  }
  const top = staff(v, A, { len: 22, wood: 0x3a2a24, back: 8 });
  v.part('weapon').box(top[0] - 1, top[1] - 1, top[2], top[0] + 1, top[1] + 1, top[2] + 2, P.POISON, 1).box(top[0] - 2, top[1] - 2, top[2] - 1, top[0] + 2, top[1] - 2, top[2] + 3, 0x3a2a24);
  return v;
}

function treeKing(): V {
  // 远古树王 — an ancient tree rotted from within: black-violet dead wood split by glowing corruption, a crown of withered maroon
  // leaves and dead boughs hung with grey moss, a cavernous maw of long splinter fangs lit from inside, burning sockets, thorned arms,
  // skulls of the lost tangled in its roots
  const v = newChar(), BK = 0x3a3036, BD = 0x231d22, BL = 0x52464a, ROT = 0xb04aff, EYE = 0xd8ff3a, MAW = 0x9aff4a, LEAF = 0x4a2234, LEAF_T = 0x6a2e40, MOSS = 0x6e7466;
  const A = biped(v, { skin: BK, legs: BD, hips: BK, torso: BK, belt: null, legH: 16, legW: 8, legD: 10, legGap: 2, hipH: 5, torsoH: 20, torsoW: 26, chestW: 30, torsoD: 20, headW: 16, headH: 14, headD: 14, headZ: 2, armW: 7, upper: 12, fore: 12, hand: 7, round: 2 });
  // splits of glowing rot climbing the trunk, a few pale dead-wood strips
  v.paint(c => c.c === BK && (((c.x + 64) % 9) === 0) ? BD : null);
  for (const [x, y0, y1] of [[-8, 2, 14], [-3, 8, 19], [5, 0, 12], [9, 6, 17]] as const) v.part(y0 > 9 ? 'chest' : 'spine').box(x, A.torsoY0 + y0, A.torsoD / 2 - 1, x, A.torsoY0 + Math.min(y1, y0 > 9 ? 19 : 9), A.torsoD / 2 - 1, ROT, 1);
  v.part('chest').box(-6, A.torsoY0 + 11, A.torsoD / 2 - 1, -6, A.torsoY1, A.torsoD / 2 - 1, ROT, 1).box(-12, A.torsoY0 + 13, 8, -12, A.torsoY1, 9, BL);
  // face: a heavy cracked brow, deep sockets burning toxic yellow, a cavernous maw with long splinter fangs, glowing within
  v.part('head').symBox(2, A.headY0 + 8, A.faceZ, 6, A.headY0 + 10, A.faceZ, P.DARK).symBox(3, A.headY0 + 9, A.faceZ, 4, A.headY0 + 9, A.faceZ, EYE, 1)
    .symBox(1, A.headY0 + 11, A.faceZ + 1, 7, A.headY0 + 12, A.faceZ + 2, BD).box(-1, A.headY0 + 10, A.faceZ + 1, 0, A.headY0 + 11, A.faceZ + 2, BD)
    .box(-6, A.headY0 + 1, A.faceZ, 5, A.headY0 + 6, A.faceZ, P.DARK).box(-4, A.headY0 + 2, A.faceZ - 1, 3, A.headY0 + 5, A.faceZ - 1, MAW, 1);
  for (const x of [-6, -3, 1, 4]) v.part('head').box(x, A.headY0 + 4, A.faceZ, x + 1, A.headY0 + 6, A.faceZ, BL);
  for (const x of [-5, -1, 3]) v.part('head').box(x, A.headY0 + 1, A.faceZ, x, A.headY0 + 3, A.faceZ, BL);
  // lower jaw hanging open with fangs and a beard of dead moss
  v.part('jaw').box(-6, A.headY0 - 3, A.faceZ - 4, 5, A.headY0, A.faceZ, BK).box(-5, A.headY0, A.faceZ, -5, A.headY0 + 2, A.faceZ, BL).box(4, A.headY0, A.faceZ, 4, A.headY0 + 2, A.faceZ, BL).box(0, A.headY0, A.faceZ, 0, A.headY0 + 1, A.faceZ, BL)
    .box(-7, A.headY0 - 9, A.faceZ - 1, -4, A.headY0 - 4, A.faceZ, MOSS).box(-1, A.headY0 - 11, A.faceZ - 1, 0, A.headY0 - 4, A.faceZ, MOSS).box(3, A.headY0 - 8, A.faceZ - 1, 6, A.headY0 - 4, A.faceZ, MOSS);
  // the crown: dead boughs (straight runs), withered maroon leaf blocks, grey moss hanging, a few glowing rot-fungus caps
  v.part('hat').box(-8, A.headY1 + 1, -1, -6, A.headY1 + 10, 1, BD).box(-12, A.headY1 + 10, -1, -6, A.headY1 + 11, 1, BD).box(5, A.headY1 + 1, -2, 7, A.headY1 + 12, 0, BD).box(7, A.headY1 + 12, -2, 12, A.headY1 + 13, 0, BD)
    .box(-1, A.headY1 + 1, 2, 0, A.headY1 + 15, 3, BD).box(-4, A.headY1 + 15, 2, 0, A.headY1 + 16, 3, BD);
  bush(v, -20, A.headY1 + 9, -5, 12, 6, 10, LEAF, LEAF_T); bush(v, 8, A.headY1 + 11, -6, 13, 6, 10, LEAF, LEAF_T); bush(v, -7, A.headY1 + 15, -4, 11, 5, 9, LEAF, LEAF_T);
  v.box(-18, A.headY1 + 3, 4, -18, A.headY1 + 9, 4, MOSS).box(13, A.headY1 + 5, 3, 13, A.headY1 + 11, 3, MOSS).box(-3, A.headY1 + 9, 6, -3, A.headY1 + 15, 6, MOSS);
  v.box(-14, A.headY1 + 15, 5, -13, A.headY1 + 16, 6, ROT, 1).box(15, A.headY1 + 17, 4, 16, A.headY1 + 18, 5, ROT, 1);
  // thorned branch arms ending in long claw-twigs
  for (const [arm, fore, hand, sx] of [['armL', 'foreL', 'handL', 1], ['armR', 'foreR', 'handR', -1]] as Array<[string, string, string, number]>) {
    const x0 = sx > 0 ? A.chestW / 2 : -A.chestW / 2 - 7, xo = sx > 0 ? x0 + 7 : x0 - 1;
    v.part(arm).box(xo, A.shoulderY - 6, 0, xo, A.shoulderY - 5, 1, BD).box(xo, A.shoulderY - 10, -2, xo, A.shoulderY - 9, -1, BD);
    v.part(fore).box(xo, A.handY + 9, 1, xo, A.handY + 10, 2, BD);
    v.part(hand); for (let i = 0; i < 4; i++) v.box(x0 + i * 2, A.handY - 7 + (i === 1 || i === 2 ? 0 : 2), -1 + (i & 1) * 2, x0 + i * 2, A.handY - 1, -1 + (i & 1) * 2, BD);
  }
  // shoulders of rotten wood, and the skulls of the lost in its roots
  v.part('shL').box(15, A.shoulderY, -6, 21, A.shoulderY + 3, 4, BD).box(17, A.shoulderY + 4, -2, 18, A.shoulderY + 7, -1, BD);
  v.part('shR').box(-22, A.shoulderY, -6, -16, A.shoulderY + 3, 4, BD).box(-19, A.shoulderY + 4, -3, -18, A.shoulderY + 8, -2, BD);
  for (const [f, x] of [['footL', 4], ['footR', -9]] as Array<[string, number]>) v.part(f).box(x, 2, 5, x + 3, 4, 7, P.BONE).box(x + 1, 3, 7, x + 1, 3, 7, P.DARK).box(x + 2, 3, 7, x + 2, 3, 7, P.DARK);
  return v;
}

export const ROSTER: ModelDef[] = [
  { id: 'warrior', name: '嗜血狂战', group: '职业', role: '铁血征服者 · 矮人', line: '以血换伤，一击致命。嗜血越多，越凶。', kind: 'biped', attack: 'swing', build: warrior },
  { id: 'mage', name: '星界魔导', group: '职业', role: '星界禁咒师 · 人类', line: '耐心吟唱2-3回合，攒齐完美手牌一波超载。', kind: 'biped', attack: 'cast', build: mage },
  { id: 'rogue', name: '影锋刺客', group: '职业', role: '暗影连击者 · 暗夜精灵', line: '一回合出牌2次，连击层层加成。', kind: 'biped', attack: 'dual', build: rogueF },
  { id: 'rogue_m', as: 'rogue', name: '影锋刺客（男 · 备用）', group: '职业', role: '暗影连击者 · 暗夜精灵', line: '一回合出牌2次，连击层层加成。', kind: 'biped', attack: 'dual', build: rogueM },
  { id: 'forest_ghoul', name: '食尸鬼', group: '普通', role: '战士型', line: '嘎嘎……新鲜的肉……', kind: 'biped', attack: 'claw', build: ghoul },
  { id: 'forest_spider', name: '剧毒蛛母', group: '普通', role: '游侠型', line: '嘶嘶……陷阱已经布好了……', kind: 'spider', attack: 'strike', build: spider },
  { id: 'forest_treant', name: '腐化树人', group: '普通', role: '守护型', line: '这片……森林……不欢迎你……', kind: 'biped', attack: 'slam', build: treant },
  { id: 'forest_banshee', name: '哀嚎女妖', group: '普通', role: '施法型', line: '听到了吗……死亡的歌声……', kind: 'ghost', attack: 'cast', build: banshee, hover: 0.35 },
  { id: 'forest_wolf_priest', name: '月光狼灵', group: '普通', role: '祭司型', line: '呜——月光指引着我……', kind: 'quad', attack: 'bite', build: wolfSpirit, glow: 1.5 },
  { id: 'forest_bone_reaver', name: '骸骨狂战', group: '普通', role: '战士型', line: '骨刃——饥渴已久！', kind: 'biped', attack: 'swing', build: boneReaver },
  { id: 'forest_poison_sprite', name: '毒雾林精', group: '普通', role: '游侠型', line: '吸一口……就够了。', kind: 'sprite', attack: 'cast', build: poisonSprite, hover: 0.5, glow: 1.3 },
  { id: 'forest_moss_golem', name: '苔岩泥像', group: '普通', role: '守护型', line: '土……吞噬入侵者。', kind: 'biped', attack: 'slam', build: mossGolem },
  { id: 'forest_wraith_cultist', name: '幽冥诅祝', group: '普通', role: '施法型', line: '诅咒……降临！', kind: 'ghost', attack: 'cast', build: wraithCultist, hover: 0.3 },
  { id: 'forest_old_willow', name: '老槐祭司', group: '普通', role: '祭司型', line: '孩儿们，饮下我的树液……', kind: 'biped', attack: 'cast', build: oldWillow },
  { id: 'elite_necromancer', name: '亡灵巫师', group: '精英', role: '施法型', line: '死者……听从我的召唤！', kind: 'biped', attack: 'cast', build: necromancer },
  { id: 'elite_alpha_wolf', name: '狼人首领', group: '精英', role: '战士型', line: '月光之下……狼群为王！', kind: 'biped', attack: 'claw', build: werewolf },
  { id: 'elite_phantom_hunter', name: '魅影猎手', group: '精英', role: '游侠型', line: '你进入了我的猎场。', kind: 'biped', attack: 'shoot', build: phantomHunter, bowL: true },
  { id: 'boss_lich_forest', name: '枯骨巫妖', group: '首领', role: '施法型', line: '千年的死寂，被你这小小的活人惊扰了……不可饶恕。', kind: 'robe', attack: 'cast', build: lich, hover: 0.4, self: 0.15 },
  { id: 'boss_root_colossus', name: '根须巨像', group: '首领', role: '守护型', line: '森林把你交给了我——这片土地上，每一块石头都记得我的名字。', kind: 'biped', attack: 'slam', build: rootColossus },
  { id: 'boss_coven_matriarch', name: '魇森巫母', group: '首领', role: '施法型', line: '我养育了这片森林里所有的毒草，也养育了每一个诅咒。', kind: 'biped', attack: 'cast', build: covenMatriarch },
  { id: 'boss_ancient_treant', name: '远古树王', group: '首领', role: '守护型 · 终章首领', line: '这片森林从我萌芽的那一刻起，就吞噬了无数像你这样的来客。', kind: 'biped', attack: 'slam', build: treeKing },
];

/** ?rogue=m: the title, class pick and battle use the male rogue (kept as a backup look); the default is the female rogueF */
export const ROGUE_M = __DEBUG_UI__ && typeof location !== 'undefined' && /[?&#]rogue=m(?=[&#]|$)/i.test(location.search + location.hash);
/** the model an actor id stands for: 'rogue' → the backup male look when ?rogue=m is on, otherwise the roster entry as is */
export function modelDef(id: string): ModelDef {
  const k = id === 'rogue' && ROGUE_M ? 'rogue_m' : id, d = ROSTER.find(x => x.id === k);
  if (!d) throw new Error('no model ' + id);
  return d;
}
/** the id a model poses as (an alternate look shares the grip, poses and weapon tip of its original) */
export const poseId = (d: ModelDef) => d.as ?? d.id;
