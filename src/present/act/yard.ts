import { language, msg } from './i18n';
// 练武场（木桩关，11-16 用户：「你随后做一个木桩关，让我来调整这些手感」）。打开游戏先到这里：
//   中间三个木人桩：挨打会晃、出伤害数字、打不死（enemy.ts 的 dummy）。
//   右边一列召唤石板：踩上去，场子后面冒烟叫出一个陪练（山贼 / 山犬 / 弓手 / 头目），是真的敌人。
//   后面一排木台（「出发」路口左右各三座）：站着另外几个主角造型，面朝镜头；走上去就换成那个造型（原来的站回台上）；
//   走近木台时镜头推近，方便看模型。
//   后面正中的路口立着「出发」：走进去开始正式的一局。
// 场子里的东西都是实物：木牌（有厚度的木板，正面画字）、石板（踩下去会沉一下、亮一圈）、木台。
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { CELL, rbox, type V } from '../bestiary/kit';
import { VoxChar } from '../look/voxkit';
import { ROSTER, type ModelDef } from '../bestiary/models';
import { POSE_HOOKS } from '../bestiary/poseHooks';
import { rot } from '../actors/rig';
import { BattleActor } from '../bestiary/battle';
import { text, textW, PIX_H } from '../v2/overlay';
import { bodyText, bodyW, onBodyFontChange } from '../ui3d/bodyFont';
import { toon } from '../look/toon';
import { fxSmoke, fxRing } from '../fx/fx';
import { cue } from '../../audio/cues';
import { WOBBLE, trimShadows, type EKind } from './enemy';

// ------------------------------------------------------------------ the wooden dummy (木人桩)
// act-22: 3.5 cm cells like every character (the post's joint where the 7 cm one was, × 2): a square stone foot, the post with two iron
// bands one cell proud, a wider cap with a dark underside, the straw target bound with three cords, three arms and a short leg
function buildDummy(): V {
  const v = new VoxChar(CELL / 2), WOOD = 0x8a5a32, WOOD_D = 0x5e3a20, WOOD_L = 0xa8744a, IRON = 0x4a4c56, STRAW = 0xc9a457, STRAW_D = 0x9a7a3e;
  const STONE = 0x6e7078, STONE_D = 0x5a5c64;
  v.bone('post', 'root', 0, 4, 0);
  // the stone foot (static), its top edges chamfered by one cell; the post on a joint just above it so the whole post rocks
  v.part('root'); rbox(v, -8, 0, -8, 7, 3, 7, STONE, 1, true); v.box(-8, 0, -7, 7, 0, 6, STONE_D).box(-7, 0, -8, 6, 0, 7, STONE_D);
  v.part('post').box(-6, 4, -6, 5, 47, 5, WOOD)
    .box(-7, 12, -7, 6, 13, 6, IRON).box(-7, 40, -7, 6, 41, 6, IRON)
    .box(-8, 48, -8, 7, 55, 7, WOOD_L).box(-8, 48, -8, 7, 48, 7, WOOD_D).box(-8, 55, -8, -8, 55, 7, null).box(7, 55, -8, 7, 55, 7, null).box(-8, 55, -8, 7, 55, -8, null).box(-8, 55, 7, 7, 55, 7, null)
    // the straw pad on the front (the target), bound with three dark cords
    .box(-6, 18, 6, 5, 35, 7, STRAW).box(-6, 18, 6, 5, 18, 7, STRAW_D).box(-6, 26, 6, 5, 27, 7, STRAW_D).box(-6, 35, 6, 5, 35, 7, STRAW_D)
    // three arms: two high (left and right, straight forward), one low in the middle; a short leg forward near the ground
    .box(-8, 36, 6, -5, 39, 17, WOOD_D).box(4, 36, 6, 7, 39, 17, WOOD_D).box(-2, 28, 8, 1, 31, 19, WOOD_D)
    .box(-2, 6, 6, 1, 9, 15, WOOD_D);
  return v;
}
export const DUMMY: ModelDef = { id: 'act_dummy', name: '木人桩', group: '普通', role: '', line: '', kind: 'biped', attack: 'slam', build: buildDummy };
if (!ROSTER.some(d => d.id === DUMMY.id)) ROSTER.push(DUMMY);
POSE_HOOKS[DUMMY.id] = (b, _t, _a, _off, self) => { const w = WOBBLE.get(self as object); if (w && b.post) rot(b.post, w.x, 0, w.z); };

// ------------------------------------------------------------------ signs
/** a wooden sign: a post and a thick board, the face painted with big pixel characters, leaning back a little toward the camera */
export function makeSign(label: string, o: { w?: number; h?: number; board?: number; ink?: string; post?: number; sub?: string; price?: number } = {}) {
  const g = new THREE.Group(), w = o.w ?? 1.1, h = o.h ?? 0.5, post = o.post ?? 0.75;
  const subText = () => (o.price && o.sub ? msg`${o.sub}·${o.price}钱` : o.price ? msg`${o.price} 钱` : o.sub);
  const U = 4, initialSub = subText(), titleScale = initialSub ? U : 2 * U;
  const cw = Math.max(textW(label, titleScale) + 16 * U, (initialSub?.length ?? 0) * 15 * U + 16 * U, initialSub ? Math.ceil(128 * w / h) : 0);
  const ch = Math.round(cw * h / w);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
  const repaint = () => {
    x.fillStyle = '#c4986a'; x.fillRect(0, 0, cw, ch); x.fillStyle = '#9a6e44'; x.fillRect(0, 0, cw, 2 * U); x.fillRect(0, ch - 2 * U, cw, 2 * U);
    const ls = language === 'en' ? Math.max(1, Math.min(titleScale, Math.floor((cw - 8 * U) / textW(label, 1)))) : titleScale;
    const sub = subText(), ty = sub ? 2 * U : (ch - PIX_H * ls) / 2;
    text(x, label, (cw - textW(label, ls)) / 2, ty, ls, o.ink ?? '#2a160c', 'left', null);
    if (sub) {
      const f = Math.min(14 * U, 14 * U * (cw - 8 * U) / Math.max(1, bodyW(sub, 14 * U)));
      bodyText(x, sub, cw / 2, ch - 17 * U, f, o.ink ?? '#4a2a16', 'center');
    }
  };
  repaint();
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  const wood = toon(o.board ?? 0x7a5232), face = new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), [wood, wood, wood, wood, face, wood]);
  board.position.y = post + h / 2; board.rotation.x = -0.32; board.castShadow = true;
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, post + h * 0.6, 0.1), wood); pole.position.set(0, (post + h * 0.6) / 2, -0.06); pole.castShadow = true;
  g.add(pole, board);
  let mounted = false; const unlisten = onBodyFontChange(() => { if (g.parent) mounted = true; else if (mounted) { unlisten(); return; } repaint(); t.needsUpdate = true; });
  return g;
}

// ------------------------------------------------------------------ the yard
interface Pad { kind: EKind; x: number; z: number; slab: THREE.Mesh; mat: THREE.MeshLambertMaterial; sink: number; cd: number; on: boolean }
interface Plinth { x: number; z: number; def: ModelDef; actor: BattleActor; g: THREE.Group; sign: THREE.Group }
// wp/foes: the 黄巾 foes (地域一); right column 刀手 / 力士 / 道士 / 流民, left column 弓手 / 猎犬 / 渠帅
const PADS: Array<[EKind, string]> = [['hj_blade', '刀手'], ['hj_brute', '力士'], ['hj_taoist', '道士'], ['hj_mob', '流民'], ['hj_archer', '弓手'], ['hj_hound', '猎犬'], ['hj_boss', '渠帅']];
export const SPAWN_AT = () => V3((Math.random() - 0.5) * 1.6, 0, -3.8);

export class Yard {
  root = new THREE.Group(); pads: Pad[] = []; plinths: Plinth[] = []; private inside = -1;
  /** 0..1: how close the hero is to the costume rack (the camera leans in) */
  near = 0;
  /** lane = the x range of the road out (the plinths keep clear of it, so walking out never steps onto one) */
  /** where a summoned partner appears (the old yard: the back middle; the hideout: its 试剑坪) */
  spawnAt: () => THREE.Vector3 = SPAWN_AT;
  /** o.pads (act-20, the hideout): the slabs' places and who each calls, in a row; no costume rack (rack = []) */
  constructor(parent: THREE.Object3D, rack: ModelDef[], wearing: ModelDef, lane: [number, number] = [-1.2, 1.2], o: { pads?: Array<{ x: number; z: number; kind: EKind; name: string }>; spawn?: () => THREE.Vector3 } = {}) {
    parent.add(this.root); if (o.spawn) this.spawnAt = o.spawn;
    // summon slabs down the right side, a sign behind each (or at the hideout's places)
    const pads = o.pads ?? PADS.map(([kind, name], i) => { const col = i < 4 ? 1 : -1; return { kind, name, x: 4.3 * col, z: -2.5 + (i < 4 ? i : i - 4) * 1.4 }; });
    pads.forEach(({ kind, name, x, z }) => {
      const col = o.pads ? 0 : x > 0 ? 1 : -1;
      const mat = new THREE.MeshLambertMaterial({ color: 0x7a7c86, emissive: 0xff7a3a, emissiveIntensity: 0 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 1.1), mat); slab.position.set(x, 0.06, z); slab.receiveShadow = true;
      const inset = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.8), toon(0x5a5c66)); inset.position.y = 0.065; slab.add(inset);
      const sign = makeSign(name, { w: 0.9, h: 0.42, post: 0.55 }); sign.position.set(x + 0.15 * col, 0, z - 0.66); sign.rotation.y = -0.35 * col;
      this.root.add(slab, sign);
      this.pads.push({ kind, x, z, slab, mat, sink: 0, cd: 0, on: false });
    });
    // the costume rack: low wooden plinths in a row along the back (two each side of the road out), a model on each facing the
    // camera, a name sign in front
    const others = rack.filter(d => d.id !== wearing.id);
    // slots along the back, 1.3 m apart, none within 0.9 m of the road out; a second row in front if the back runs out
    const slots: Array<[number, number]> = [];
    for (const z of [-4.6, -3.2]) for (let x = -4.6; x <= 4.65; x += 1.3) if (x < lane[0] - 0.9 || x > lane[1] + 0.9) slots.push([x, z]);
    others.forEach((def, i) => {
      const [x, z] = slots[i] ?? [0, -3.2], g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, 1.05), toon(0x5e3a20)); top.position.y = 0.08; top.castShadow = top.receiveShadow = true;
      const rim = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 1.15), toon(0x3e2614)); rim.position.y = 0.03;
      g.add(top, rim); g.position.set(x, 0, z); this.root.add(g);
      this.plinths.push({ x, z, def, actor: this.stand(def, x, z), g, sign: this.label(def, x, z) }); this.spot(x, z);
    });
  }
  private stand(def: ModelDef, x: number, z: number) { const yaw = -x * 0.06; const a = new BattleActor(def); a.place(V3(x, 0.16, z), yaw); a.yaw = yaw; trimShadows(a.root, 4); return a; }
  /** a dark spot on each plinth's top under the model's feet */
  private spot(x: number, z: number) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0608, transparent: true, opacity: 0.45, depthWrite: false }));
    m.position.set(x, 0.165, z); m.renderOrder = 2; this.root.add(m);
  }
  /** each frame: slabs under the hero fire a summon, plinths swap the costume. Returns what happened */
  update(dt: number, hero: THREE.Vector3, heroY: number, alive: number): { summon?: EKind; wear?: ModelDef; plinth?: Plinth } {
    const out: { summon?: EKind; wear?: ModelDef; plinth?: Plinth } = {};
    for (const p of this.pads) {
      p.cd -= dt; const on = heroY < 0.2 && Math.abs(hero.x - p.x) < 0.6 && Math.abs(hero.z - p.z) < 0.6;
      if (on && !p.on && p.cd <= 0 && alive < 6) { p.cd = 1.2; out.summon = p.kind; p.sink = 1; cue('click', 0.6); fxRing(V3(p.x, 0.1, p.z), 0xff9a5a, 0.9, { life: 0.35 } as never); }
      p.on = on; p.sink = Math.max(0, p.sink - dt * 2.5);
      p.slab.position.y = 0.06 - 0.05 * Math.min(1, p.sink * 2); p.mat.emissiveIntensity = 0.5 * p.sink;
    }
    for (const pl of this.plinths) pl.actor.update(dt);
    // the rack: stepping onto a plinth swaps (step off before the next swap)
    const i = this.plinths.findIndex(pl => Math.hypot(hero.x - pl.x, hero.z - pl.z) < 0.55);
    if (i >= 0 && this.inside !== i) { out.wear = this.plinths[i].def; out.plinth = this.plinths[i]; }
    if (i < 0 && this.plinths.every(pl => Math.hypot(hero.x - pl.x, hero.z - pl.z) > 0.9)) this.inside = -1; else if (i >= 0) this.inside = i;
    // near the rack (the back row, off the road): the camera leans in
    const want = hero.z < -2.4 && Math.abs(hero.x) > 1.4 ? Math.min(1, (-2.4 - hero.z) / 1.0) : 0; this.near += (want - this.near) * Math.min(1, dt * 3);
    return out;
  }
  private label(def: ModelDef, x: number, z: number) {
    const sign = makeSign(def.name, { w: 0.8, h: 0.38, post: 0.2 }); sign.position.set(x, 0, z + 0.85); this.root.add(sign); return sign;
  }
  /** the hero took plinth pl's costume: the old one stands on the plinth now (and its sign changes) */
  swap(pl: Plinth, old: ModelDef) {
    fxSmoke(V3(pl.x, 0.6, pl.z), 0x8a8a94, 10, { r: 0.6, spd: 1.2, up: 0.8, s: 0.4, life: 0.6 }); cue('summon', 0.5);
    pl.actor.dispose(); pl.def = old; pl.actor = this.stand(old, pl.x, pl.z);
    pl.sign.parent?.remove(pl.sign); pl.sign = this.label(old, pl.x, pl.z);
  }
  dispose() { for (const pl of this.plinths) pl.actor.dispose(); this.root.parent?.remove(this.root); }
}
