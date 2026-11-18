// 3.5 厘米细格子敌人模型的公用小件（11-18，第二关 / 第三关的敌人用；写法和 hj_models.ts 里那几个一模一样，抄出来公用，
// hj_models.ts 不动）：骨架、草鞋腿、男人的脸、头发、倒角方块、平板。骨骼名字、父子关系和 hj_models 的人形一致（动作代码通用）。
// 铁律同 hj_models：横平竖直的大块、2～3 档颜色、不撒随机点、不走斜线台阶；小臂 / 小腿的外侧面不和上臂 / 大腿共面（弯肘屈膝会闪面）。
import { VoxChar, type Col } from '../../look/voxkit';
import { CELL, type V } from '../../bestiary/kit';
import { ROSTER, type ModelDef } from '../../bestiary/models';

export const SKIN = 0xcc9670, SKIN_D = 0x9c6c4c, HAIR = 0x201814, EYE = 0x140e0a, MOUTH = 0x4a2a1c, LINEN = 0x9a917e, LINEN_D = 0x76705e;
export const STRAW = 0xc4a05a, STRAW_D = 0x9a7a3e, INNER = 0xe6dfcc, GOLD = 0xe2b040, GOLD_D = 0xb08424;

/** one fine cell = 3.5 cm (half a scene cell: a scene block is exactly 2 × 2 × 2 of these) */
export const fine = () => new VoxChar(CELL / 2);
export const B = (v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | null, g = 0) => v.part(part).box(x0, y0, z0, x1, y1, z1, c, g);
/** a box with its four vertical edges cut away (a one-cell chamfer down each corner column) */
export function cbox(v: V, part: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col, g = 0) {
  v.part(part);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (!((x === x0 || x === x1) && (z === z0 || z === z1))) for (let y = y0; y <= y1; y++) v.set(x, y, z, c, g);
  return v;
}
/** a flat plate in the x-y plane at depth z, its four corner cells cut (a one-cell chamfer) */
export function plate(v: V, part: string, x0: number, y0: number, x1: number, y1: number, z: number, c: Col) {
  v.part(part);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (!((x === x0 || x === x1) && (y === y0 || y === y1))) v.set(x, y, z, c);
  return v;
}
export const SIDES = [['L', 1], ['R', -1]] as const;
/** a left-side x range, mirrored for the right side (cell x ↔ −1 − x) */
export const MX = (s: number, a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-1 - b, -1 - a]);

/** the biped skeleton (the 7 cm joints × 2, in fine cells) — the same bones and parents as hj_models.ts */
export interface Skel {
  hip: number; spine: number; chest: number; neck: number; head: number; jaw: [number, number]; hat: number; cape: [number, number];
  sh: [number, number, number]; fore: number; hand: number; weapon: [number, number, number]; offhand: [number, number, number]; leg: number; knee: number;
}
export function skel(v: V, k: Skel) {
  const [sx, sy, sz] = k.sh;
  v.bone('hips', 'root', 0, k.hip, 0).bone('spine', 'hips', 0, k.spine, 0).bone('chest', 'spine', 0, k.chest, 0)
    .bone('neck', 'chest', 0, k.neck, 0).bone('head', 'neck', 0, k.head, 0).bone('jaw', 'head', 0, k.jaw[0], k.jaw[1]).bone('hat', 'head', 0, k.hat, 0)
    .bone('cape', 'chest', 0, k.cape[0], k.cape[1]);
  for (const [L, s] of SIDES) {
    v.bone('sh' + L, 'chest', s * sx, sy, sz).bone('arm' + L, 'sh' + L, s * sx, sy, sz).bone('fore' + L, 'arm' + L, s * sx, k.fore, sz).bone('hand' + L, 'fore' + L, s * sx, k.hand, sz)
      .bone('leg' + L, 'hips', s * k.leg, k.hip, 0).bone('shin' + L, 'leg' + L, s * k.leg, k.knee, 0).bone('foot' + L, 'shin' + L, s * k.leg, 4, 0);
  }
  v.bone('weapon', 'handR', ...k.weapon).bone('offhand', 'handL', ...k.offhand);
}
/** legs in straw sandals (see hj_models.ts sandalLegs): the shin keeps one cell clear of the thigh's outer side */
export function sandalLegs(v: V, o: { x0: number; x1: number; z0: number; z1: number; knee: number; hip: number; trou: Col; wrap: boolean; toe: number; skin?: Col; wrapC?: Col; wrapD?: Col; sole?: [Col, Col] }) {
  const sk = o.skin ?? SKIN, zs = o.z1 - 1, W = o.wrapC ?? LINEN, WD = o.wrapD ?? LINEN_D, [S0, S1] = o.sole ?? [STRAW_D, STRAW];
  for (const [L, s] of SIDES) {
    const wide = o.x1 - o.x0 >= 5, [a, b] = MX(s, o.x0, o.x1), [sa, sb] = MX(s, o.x0 + (wide ? 1 : 0), o.x1 - 1), f = 'foot' + L;
    B(v, f, a, 0, o.z0, b, 0, o.toe, S0); B(v, f, a, 1, o.z0, b, 1, o.toe, S1);
    B(v, f, sa, 2, o.z0, sb, 3, o.toe - 1, sk);
    if (o.wrap) B(v, f, sa, 2, o.z0, sb, 3, o.z0 + 2, W);
    B(v, f, sa, 2, zs, sb, 3, zs, S0);
    B(v, 'shin' + L, sa, 4, o.z0, sb, o.knee - 1, zs, o.wrap ? W : sk);
    if (o.wrap) B(v, 'shin' + L, sa, o.knee - 1, o.z0, sb, o.knee - 1, zs, WD).box(sa, 6, o.z0, sb, 6, zs, WD);
    B(v, 'leg' + L, a, o.knee, o.z0, b, o.hip - 1, o.z1, o.trou);
  }
}
/** a man's face on the front plane z = F: 2-row eyes, a frown, a nose one cell proud, a mouth (rows given absolute) */
export function face(v: V, o: { F: number; eyes: [number, number]; eyeY: number; brows: [number, number]; browY: number; nose: [number, number]; noseY: [number, number]; mouth?: [number, number, number]; noseC?: Col; browC?: Col }) {
  const bm = Math.ceil((o.brows[0] + o.brows[1]) / 2), BC = o.browC ?? HAIR;
  v.part('head').symBox(o.eyes[0], o.eyeY, o.F, o.eyes[1], o.eyeY + 1, o.F, EYE).symBox(o.brows[0], o.browY, o.F, o.brows[1], o.browY, o.F, BC)
    .symBox(bm, o.browY + 1, o.F, o.brows[1], o.browY + 1, o.F, BC)
    .box(o.nose[0], o.noseY[0], o.F + 1, o.nose[1], o.noseY[1], o.F + 1, o.noseC ?? SKIN_D);
  if (o.mouth) v.box(o.mouth[0], o.mouth[2], o.F, o.mouth[1], o.mouth[2], o.F, MOUTH);
}
/** hair at the back and the sides of the head, above row y (the face plane and the brow stay skin) */
export function hair(v: V, o: { y: number; back: number; side: number; front: number; c?: Col; skin?: Col }) {
  v.paint(q => (q.y >= o.y && (q.z <= o.back || ((q.x <= -o.side - 1 || q.x >= o.side) && q.z <= o.front)) && q.c === (o.skin ?? SKIN) ? (o.c ?? HAIR) : null), 'head');
}
/** register a model in the bestiary ROSTER (once) */
export const def = (d: ModelDef) => { if (!ROSTER.some(x => x.id === d.id)) ROSTER.push(d); return d; };
