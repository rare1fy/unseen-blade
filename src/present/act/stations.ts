// The rooms without a fight (act-17): 行商 (three stalls), 歇脚 (a campfire with two mats), 遗卷 (a scroll on a stone altar).
// Everything is a thing in the scene: a straw mat in front of each station; standing on it without moving fills a ring at the
// feet in 1 s and the station acts (buys, heals, sharpens, gives the scroll). A stall the purse can't pay for shows its price red
// and its ring doesn't fill. Names are agy's (docs/DESIGN.md 第十七轮).
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { toon } from '../look/toon';
import { makeSign } from './yard';
import { fxSparks, fxRing } from '../fx/fx';
import { addBlock } from '../fx/blocks';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import { BattleActor } from '../bestiary/battle';
import { HIDEOUT_MERCHANT } from './hideout_people';
import { trimShadows } from './enemy';
import { setPropOcc } from '../look/occlude';
import type { MiniIcon } from './uiPlate';

export interface Station { id: string; label: string; sub: string; desc: string; icon: MiniIcon; price: number; at: THREE.Vector3; fill: number; done: boolean; once: boolean;
  g: THREE.Group; ring: THREE.Mesh; track: THREE.Mesh; disc: THREE.Mesh; sign: THREE.Group; poor: boolean; onMat: boolean;
  /** act-36 / act-128 / act-136: glowing mat border + clean interactive highlight when in reach */
  edge: THREE.Mesh; ware: THREE.Object3D | null; wareY: number; nearK: number; lastTick: number }

const box = (w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(c)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m; };
const MAT_R = 1.05, NEAR = 2.35, SIGN = { w: 1.85, h: 0.92, post: 1.25 };

// ---------------------------------------------------------------- the stalls and their wares, voxel models in the scene's 7 cm cells
// act-37 (用户：「商店里的选项……好丑，还过曝了」): the old ones were plain boxes under a bright red cloth with small white wares on
// top. Now: a dark wooden trestle counter under an undyed hemp runner; the wares big enough to read from the game camera — a roll
// of bamboo slips on a cradle (秘卷), a glazed medicine gourd with a red label (金疮药), a whetstone with a sabre across it (青砥石),
// and act-122's rotating specialty wares: 虎骨酒 (jar), 重铸骰 (die), 铁药囊 (satchel), plus 焚香蓄锐 (censer) at the campfire.
// Big axis-aligned masses, two or three tones a material, lit like everything else (nothing glows).
type Ware = 'scroll' | 'gourd' | 'stone' | 'jar' | 'die' | 'satchel' | 'censer';
export type ShopSpecial = 'vigor' | 'satchel';
const WD = 0x3e2a1a, WM = 0x5a3c24, WL = 0x74503a;                     // dark wood: shade, body, lit top
const HEMP = 0x8c7656, HEMP_D = 0x6e5c44;
const BAM = 0xc4a058, BAM_D = 0xa8873e, BAM_E = 0xdcc282, CORD = 0x34261a, TAG = 0x9a3024;
const GOURD = 0x7a4220, GOURD_L = 0x965428, GOURD_D = 0x5a2e16, LABEL = 0xa8322a, INK = 0x3a1a10, CORK = 0x9a7a4a;
const POT = 0xc8bea8, POT_D = 0x8e8676, HERB = 0x5e7034, HERB_D = 0x44522a, HERB_L = 0x7a9a4a;
const STONE = 0x4c5a62, STONE_L = 0x6a7a82, STEEL = 0x8e98a2, STEEL_L = 0xc8d0d8, GUARD = 0x26262c, GRIP = 0x8a2a20, BRONZE = 0xb08040, BRONZE_D = 0x785428;
const BONE = 0xdcd2be, BONE_D = 0xb6aa94, IRON_B = 0x6a7482, IRON_L = 0x9aa4b2;
const built = new Map<string, THREE.Mesh[]>();
function voxModel(key: string, draw: (w: VoxWorld) => void) {
  let ms = built.get(key);
  if (!ms) { const w = new VoxWorld(CELL); draw(w); ms = w.build({ rim: 0.25, edge: 0.14, ground: true }); built.set(key, ms); }
  const g = new THREE.Group(); for (const m of ms) { const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = true; c.receiveShadow = true; g.add(c); } return g;
}
/** the counter: two slab trestles, a thick plank top (y 7..8), a lower shelf, the hemp runner over the middle and down the front */
const COUNTER_TOP = 10 * CELL;
function counter() {
  return voxModel('counter', w => {
    for (const x of [-8, 7]) { w.box(x, 0, -3, x + 1, 6, 3, WM); w.box(x, 0, -3, x + 1, 0, 3, WD); }
    w.box(-7, 2, -3, 6, 2, 3, WD);
    w.box(-9, 7, -4, 8, 8, 4, WM); w.box(-9, 8, -4, 8, 8, 4, WL); w.box(-9, 7, 4, 8, 7, 4, WD);
    w.box(-5, 9, -4, 4, 9, 4, HEMP); w.box(-5, 7, 5, 4, 9, 5, HEMP); w.box(-5, 7, 5, 4, 7, 5, HEMP_D);
  });
}
/** the wares, standing on the counter (their y 0 = the runner's top) */
function wareModel(k: Ware) {
  if (k === 'scroll') return voxModel('w_scroll', w => {
    // two cradles, a roll of slips lying along x (slips run along it, two cords round it, the cut ends lighter with a dark core)
    for (const x of [-3, 2]) w.box(x, 0, -2, x + 1, 1, 1, WM);
    w.box(-4, 2, -2, 3, 5, 1, BAM);
    for (let y = 2; y <= 5; y++) if (y % 2) w.box(-4, y, 1, 3, y, 1, BAM_D);
    w.box(-4, 6, -1, 3, 6, 0, BAM);                                       // the roll's rounded top, two rows narrower
    for (const x of [-4, 3]) { w.box(x, 2, -2, x, 5, 1, BAM_E); w.box(x, 3, -1, x, 4, 0, BAM_D); }
    for (const x of [-2, 1]) w.box(x, 2, -2, x, 6, 1, CORD);
    w.box(-2, 1, 2, -2, 3, 2, TAG);                                       // a red tag hanging off the near cord
  });
  if (k === 'gourd') return voxModel('w_gourd', w => {
    // the gourd: a big bulb, a corded waist, a small bulb, the cork; a red paper label on its front; a lidded pot and herbs beside it
    w.box(-3, 0, -3, 2, 5, 2, GOURD); w.box(-3, 0, -3, 2, 0, 2, GOURD_D); w.box(-3, 5, -3, 2, 5, 2, GOURD_L);
    w.box(-2, 6, -2, 1, 6, 1, LABEL);
    w.box(-2, 7, -2, 1, 10, 1, GOURD); w.box(-2, 10, -2, 1, 10, 1, GOURD_L);
    w.box(-1, 11, -1, 0, 12, 0, CORK);
    w.box(-1, 1, 3, 0, 4, 3, LABEL); w.box(-1, 3, 3, 0, 3, 3, INK);
    w.box(4, 0, -1, 7, 2, 2, POT); w.box(4, 0, -1, 7, 0, 2, POT_D); w.box(5, 3, 0, 6, 3, 1, POT_D);
    w.box(-7, 0, -1, -5, 1, 2, HERB); w.box(-7, 2, 0, -6, 2, 1, HERB_D);
  });
  if (k === 'jar') return voxModel('w_jar', w => {
    // 虎骨酒: stout glazed clay wine jar with crimson cloth cap, hemp tie, and a drinking bowl beside it
    w.box(-4, 0, -3, 2, 1, 2, GOURD_D); w.box(-5, 2, -4, 3, 6, 3, GOURD); w.box(-5, 6, -4, 3, 6, 3, GOURD_L);
    w.box(-3, 7, -2, 1, 8, 1, GOURD_D);
    w.box(-4, 9, -3, 2, 10, 2, LABEL); w.box(-3, 8, 2, 1, 8, 2, CORD); // crimson cloth seal + tie
    w.box(-2, 3, 4, 0, 5, 4, BONE); w.box(-1, 4, 4, -1, 4, 4, INK);    // paper wine label
    w.box(5, 0, -1, 7, 2, 1, POT); w.box(5, 0, -1, 7, 0, 1, POT_D); w.box(6, 2, 0, 6, 2, 0, GOURD_L); // cup
  });
  if (k === 'die') return voxModel('w_die', w => {
    // 重铸骰: dark wood casting tray + oversized carved ivory/bronze octagonal die + two tally tokens
    w.box(-6, 0, -4, 5, 1, 3, WD); w.box(-5, 1, -3, 4, 1, 2, WM);
    w.box(-6, 2, -4, 5, 2, -4, WL); w.box(-6, 2, 3, 5, 2, 3, WL);
    w.box(-6, 2, -3, -6, 2, 2, WL); w.box(5, 2, -3, 5, 2, 2, WL);
    w.box(-3, 2, -2, 2, 7, 2, BONE); w.box(-3, 2, -2, 2, 2, 2, BONE_D); // main bone die
    w.box(-2, 7, -1, -2, 7, -1, LABEL); w.box(1, 7, 1, 1, 7, 1, LABEL); w.box(0, 7, 0, 0, 7, 0, LABEL); // crimson pips
    w.box(-1, 4, 2, 0, 5, 2, BRONZE);
    w.box(3, 2, -2, 4, 3, 1, BRONZE); w.box(3, 4, -1, 4, 4, 0, BRONZE_D);
  });
  if (k === 'satchel') return voxModel('w_satchel', w => {
    // 铁药囊: forged iron ingots stacked beside a lush emerald herb bundle on hemp cloth
    w.box(-6, 0, -3, 0, 2, 2, IRON_B); w.box(-5, 3, -2, -1, 4, 1, IRON_L); w.box(-4, 5, -1, -2, 5, 0, STEEL_L);
    w.box(1, 0, -2, 6, 3, 2, HEMP); w.box(1, 0, -2, 6, 0, 2, HEMP_D);
    w.box(2, 4, -2, 5, 6, 2, HERB); w.box(3, 7, -1, 5, 7, 1, HERB_L); w.box(1, 3, 0, 6, 3, 0, CORD);
    w.box(3, 5, 2, 4, 6, 2, HERB_D);
  });
  if (k === 'censer') return voxModel('w_censer', w => {
    // 焚香蓄锐: three-legged bronze incense tripod with ash bed and three burning incense sticks
    for (const [x, z] of [[-3, -2], [2, -2], [-1, 3]]) w.box(x, 0, z, x + 1, 2, z + 1, BRONZE_D);
    w.box(-4, 3, -3, 3, 7, 3, BRONZE); w.box(-4, 3, -3, 3, 3, 3, BRONZE_D); w.box(-5, 6, -1, -5, 8, 1, BRONZE); w.box(4, 6, -1, 4, 8, 1, BRONZE);
    w.box(-3, 7, -2, 2, 7, 2, POT_D); // ash bed
    for (const x of [-2, 0, 1]) { w.box(x, 8, 0, x, 11, 0, BAM_D); w.box(x, 12, 0, x, 12, 0, LABEL); }
  });
  return voxModel('w_stone', w => {
    // a wooden block, the blue-grey whetstone, a sabre lying along it (blade, dark guard, red-bound grip, bronze ring)
    w.box(-6, 0, -2, 5, 1, 2, WM); w.box(-6, 1, -2, 5, 1, 2, WL);
    w.box(-5, 2, -2, 4, 3, 1, STONE); w.box(-5, 3, -2, 4, 3, 1, STONE_L);
    w.box(-7, 4, 0, 4, 4, 0, STEEL); w.box(-7, 5, 0, 4, 5, 0, STEEL_L);
    w.box(5, 3, -1, 5, 5, 2, GUARD); w.box(6, 4, 0, 8, 4, 1, GRIP); w.box(9, 4, -1, 10, 5, 2, BRONZE); w.box(9, 4, 0, 10, 4, 1, null);
  });
}
/** a counter with its ware on top; the ware is userData.ware (it lifts and turns in reach) */
function stall(ware: Ware) {
  const g = counter(), wm = wareModel(ware); wm.scale.setScalar(1.3); wm.position.y = COUNTER_TOP;   // (a little larger than life: read from the game camera)
  g.add(wm); g.userData.ware = wm; g.userData.wareY = COUNTER_TOP; return g;
}
/** an altar of stacked stone slabs, the roll of slips on top */
function altar() {
  const g = new THREE.Group();
  g.add(box(1.4, 0.3, 1.0, 0x6a6660)); g.add(box(1.1, 0.4, 0.8, 0x7a766e, 0, 0.3));
  const wm = wareModel('scroll'); wm.position.y = 0.7; g.add(wm); g.userData.ware = wm; g.userData.wareY = 0.7;
  return g;
}
/** a campfire: a ring of stones, crossed logs, a flame that flickers (blocks) and a warm light */
function campfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(box(0.22, 0.16, 0.22, i % 2 ? 0x5a5650 : 0x6a6660, Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55)); }
  g.add(box(0.9, 0.12, 0.14, 0x4a3020, 0, 0.05)); g.add(box(0.14, 0.12, 0.9, 0x4a3020, 0, 0.12));
  const light = new THREE.PointLight(0xffa050, 2.2, 7, 1.6); light.position.set(0, 0.9, 0); g.add(light);
  g.userData.fire = true; return g;
}

export class Stations {
  list: Station[] = []; root = new THREE.Group(); fires: THREE.Group[] = []; private t = 0;
  /** act-128: visible 3D voxel traveling merchant behind the shop stalls */
  merchant: BattleActor | null = null;
  merchantPos = V3();
  private merchantShadow: THREE.Mesh | null = null;
  constructor(parent: THREE.Object3D, private centre: [number, number] = [0, 0]) { parent.add(this.root); }
  /** the mat's glowing edge: four flat gold bars just outside the straw (one mesh, additive) */
  private edge(at: THREE.Vector3) {
    const W = 1.62, D = 1.32, T = 0.09, g: THREE.BufferGeometry[] = [];
    for (const [w, d, x, z] of [[W, T, 0, -D / 2], [W, T, 0, D / 2], [T, D, -W / 2, 0], [T, D, W / 2, 0]] as Array<[number, number, number, number]>) g.push(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, 0, z));
    const merged = new THREE.BufferGeometry(), P: number[] = [], I: number[] = []; let o = 0;
    for (const q of g) { const pa = q.attributes.position.array as ArrayLike<number>; for (let i = 0; i < pa.length; i++) P.push(pa[i]); const ia = q.index!.array; for (let i = 0; i < ia.length; i++) I.push(ia[i] + o); o += q.attributes.position.count; q.dispose(); }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); merged.setIndex(I);
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(at.x, 0.06, at.z); m.renderOrder = 3; this.root.add(m); return m;
  }
  private mat(at: THREE.Vector3) {
    const mat = box(1.42, 0.04, 1.12, 0x8a7448, at.x, 0, at.z); this.root.add(mat); this.root.add(box(1.22, 0.045, 0.92, 0x9a8250, at.x, 0, at.z));
    // act-128: bold 3-layer stand-to-trigger circle (crisp dark-backed track + thick bright progress sweep + glowing inner pulse disc)
    const track = new THREE.Mesh(new THREE.RingGeometry(MAT_R - 0.16, MAT_R + 0.04, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1c140a, transparent: true, opacity: 0.42, depthWrite: false }));
    track.position.set(at.x, 0.072, at.z); track.renderOrder = 3; this.root.add(track);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(MAT_R - 0.16, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffdc78, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
    disc.position.set(at.x, 0.074, at.z); disc.renderOrder = 3; this.root.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(MAT_R - 0.15, MAT_R + 0.03, 48, 1, Math.PI / 2, 0.001).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0.96, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.set(at.x, 0.086, at.z); ring.renderOrder = 4; this.root.add(ring);
    return { ring, track, disc };
  }
  private add(id: string, label: string, sub: string, desc: string, icon: MiniIcon, price: number, at: THREE.Vector3, prop: THREE.Group, once: boolean, signSide: 1 | -1 = 1) {
    at.x += this.centre[0]; at.z += this.centre[1];
    prop.position.set(at.x, 0, at.z - 1.1); this.root.add(prop);
    // act-136: occlusion outline on stalls & scroll altar so foreground buildings never hide wares
    setPropOcc(prop, 1);
    const sign = makeSign(label, { w: SIGN.w, h: SIGN.h, post: SIGN.post, sub, price }); sign.position.set(at.x + 1.15 * signSide, 0, at.z - 1.38); this.root.add(sign);
    const { ring, track, disc } = this.mat(at);
    this.list.push({ id, label, sub, desc, icon, price, at, fill: 0, done: false, once, g: prop, ring, track, disc, sign, poor: false, onMat: false, edge: this.edge(at), ware: (prop.userData.ware as THREE.Object3D) ?? null, wareY: (prop.userData.wareY as number) ?? 0, nearK: 0, lastTick: 0 });
  }
  /** 行商: 4 stalls in a staggered chevron + visible 3D Traveling Merchant NPC behind the center gap */
  /** noBoon (act-163): her hand has no room for a new boon — the scroll stall would only sell her what the whetstone does (dearer), and
   *  the reroll die rerolls nothing, so the first stall is the tiger-bone wine and the fourth the satchel */
  shop(prices: { boon: number; heal: number; sharpen: number; vigor?: number; satchel?: number }, special: ShopSpecial = 'vigor', noBoon = false) {
    const vigor = (at: THREE.Vector3, side: 1 | -1) => this.add('buy_vigor', '虎骨酒', '血上限', '气血上限 +15 并回血 25 点', 'heal', prices.vigor ?? 55, at, stall('jar'), true, side);
    if (noBoon) { vigor(V3(-3.5, 0, 0.45), -1); special = 'satchel'; }
    else this.add('buy_boon', '秘卷', '秘传', '三选一习得新秘传强化', 'scroll', prices.boon, V3(-3.5, 0, 0.45), stall('scroll'), true, -1);
    this.add('buy_heal', '金疮药', '回血', '立刻恢复 30% 气血', 'heal', prices.heal, V3(-1.35, 0, -1.95), stall('gourd'), true, -1);
    this.add('buy_sharpen', '青砥石', '升阶', '挑一张已得秘传提升品阶', 'forge', prices.sharpen, V3(1.65, 0, -1.95), stall('stone'), true, 1);
    if (special === 'satchel') this.add('buy_satchel', '铁药囊', '残铁药引', '立刻获得 残铁+5 与 药引+5', 'iron', prices.satchel ?? 45, V3(3.6, 0, 0.45), stall('satchel'), true, 1);
    else vigor(V3(3.6, 0, 0.45), 1);
    // act-128: spawn the traveling merchant standing right in the unobstructed center gap behind the stalls, waving warmly to the player!
    const mx = this.centre[0] + 0.15, mz = this.centre[1] - 3.05;
    this.merchantPos.set(mx, 0, mz);
    const m = new BattleActor(HIDEOUT_MERCHANT);
    m.place(V3(mx, 0, mz), 0); m.yaw = 0; trimShadows(m.root, 3);
    this.root.add(m.root);
    this.merchant = m;
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.62, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0608, transparent: true, opacity: 0.48, depthWrite: false }));
    sh.position.set(mx, 0.025, mz); sh.renderOrder = 2; this.root.add(sh);
    this.merchantShadow = sh;
    // warm lantern glow from his merchant pack-frame
    const lanternLight = new THREE.PointLight(0xffb860, 1.5, 5.5, 1.6);
    lanternLight.position.set(mx - 0.35, 1.85, mz - 0.15);
    this.root.add(lanternLight);
  }
  /** 歇脚: a campfire with 3 tactical choices — 裹伤调息 (heal), 焚香蓄锐 (qi+intent+meta), or 寒石砺刃 (sharpen) — taking one puts the rest out */
  rest() {
    const f = campfire(); f.position.set(this.centre[0], 0, this.centre[1] - 2.6); this.root.add(f); this.fires.push(f);
    this.add('rest_heal', '裹伤调息', '回血', '免费恢复 30% 气血（三选一）', 'heal', 0, V3(-3.0, 0, -0.4), new THREE.Group(), true);
    const cen = new THREE.Group(), cw = wareModel('censer'); cw.scale.setScalar(1.3); cen.add(cw); cen.userData.ware = cw; cen.userData.wareY = 0;
    this.add('rest_meditate', '焚香护锋', '护盾·增伤', '获20点素衣护盾（未破前全伤+30%移速+10%）并满气', 'shield', 0, V3(0, 0, 0.35), cen, true);
    this.add('rest_sharpen', '寒石砺刃', '升阶', '免费挑一张已得秘传提升品阶', 'forge', 0, V3(3.0, 0, -0.4), stall('stone'), true);
  }
  /** 遗卷: one scroll on an altar */
  /** up (act-163): her hand is full and no manual is due — the scroll raises one of the boons she holds */
  scroll(up = false) { this.add('scroll', '遗卷', up ? '升阶' : '秘传', up ? '挑一张已得秘传提升品阶' : '研读遗留刀谱或稀世秘传', 'scroll', 0, V3(0, 0, -1.0), altar(), true); }
  /** mark stalls the purse can't pay for (their sign is rebuilt with a red price) */
  setPurse(coins: number) {
    for (const s of this.list) {
      const poor = s.price > coins && !s.done; if (poor === s.poor) continue; s.poor = poor;
      const at = s.sign.position.clone(); this.root.remove(s.sign);
      s.sign = makeSign(s.label, { w: SIGN.w, h: SIGN.h, post: SIGN.post, sub: s.sub, price: s.price, ink: poor ? '#8a2018' : undefined }); s.sign.position.copy(at); this.root.add(s.sign);
    }
  }
  /** one station is spent: its mat dims, its ring goes; `others` = put the rest out too (the rest room's either-or); `silent` skips burst FX when restoring a mid-run save */
  spend(s: Station, others = false, silent = false) {
    s.done = true; s.ring.visible = false; s.track.visible = false; s.disc.visible = false; s.edge.visible = false;
    setPropOcc(s.g, 0);
    if (!silent) { fxRing(s.at.clone().setY(0.08), 0xffe0a0, 1.5, { life: 0.5 } as never); fxSparks(s.at.clone().setY(0.6), 0xffe0a0, 18, 4); }
    if (others) for (const o of this.list) if (o !== s && !o.done) { o.done = true; setPropOcc(o.g, 0); o.ring.visible = false; o.track.visible = false; o.disc.visible = false; o.g.visible = false; o.sign.visible = false; o.edge.visible = false; }
  }
  /** act-136 Scheme A: proximity visual affordance (instant purchase triggered by interact key in show.ts, no 1s standstill wait) */
  update(dt: number, hero: THREE.Vector3, _moving = false, canPay: (s: Station) => boolean = () => true): Station | null {
    this.t += dt;
    if (this.merchant) {
      const targetYaw = Math.max(-0.85, Math.min(0.85, Math.atan2(hero.x - this.merchantPos.x, hero.z - this.merchantPos.z)));
      this.merchant.yaw += (targetYaw - this.merchant.yaw) * Math.min(1, dt * 4);
      this.merchant.update(dt);
    }
    for (const s of this.list) {
      if (s.done) continue;
      const dist = Math.hypot(hero.x - s.at.x, hero.z - s.at.z);
      s.onMat = dist < MAT_R;
      const ok = canPay(s);
      s.fill = 0; s.ring.visible = false;
      const near = dist < NEAR; s.nearK += ((near ? 1 : 0) - s.nearK) * Math.min(1, dt * 10);
      const em = s.edge.material as THREE.MeshBasicMaterial; em.color.setHex(s.poor ? 0xff5a40 : ok ? 0xffd878 : 0x8a847c);
      em.opacity = (0.30 + 0.14 * Math.sin(this.t * 3 + s.at.x)) * (1 - s.nearK) + (0.86 + 0.14 * Math.sin(this.t * 6)) * s.nearK;
      const tm = s.track.material as THREE.MeshBasicMaterial;
      tm.opacity = 0.20 + 0.36 * s.nearK;
      const dm = s.disc.material as THREE.MeshBasicMaterial;
      dm.color.setHex(s.poor ? 0xff4a38 : s.id === 'rest_heal' ? 0x7effa8 : ok ? 0xffdc78 : 0x7a746c);
      dm.opacity = (0.06 + 0.06 * Math.sin(this.t * 3.5 + s.at.x)) * (0.5 + 1.2 * s.nearK) + (s.onMat ? 0.14 : 0);
      if (s.ware) { s.ware.position.y = s.wareY + s.nearK * (0.14 + 0.028 * Math.sin(this.t * 2.6)); s.ware.rotation.y = Math.sin(this.t * 0.9 + s.at.x) * 0.65 * s.nearK; }
    }
    for (const f of this.fires) if (Math.random() < dt * 22) addBlock(f.position.clone().add(V3((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4)), { size: 0.14 + Math.random() * 0.1, v: V3(0, 1.2 + Math.random(), 0), col: Math.random() < 0.5 ? 0xffb040 : 0xff6a20, bright: 1.6, life: 0.5, shrink: 0.5, drag: 1, grav: 0 });
    return null;
  }
  /** the station in reach (for the floating prompt & J interact), the nearest one */
  near(hero: THREE.Vector3): Station | null { let b: Station | null = null, bd = NEAR; for (const s of this.list) { if (s.done) continue; const d = Math.hypot(hero.x - s.at.x, hero.z - s.at.z); if (d < bd) { bd = d; b = s; } } return b; }
  /** true when hero is standing near the traveling merchant behind the stalls */
  nearMerchant(hero: THREE.Vector3): boolean {
    if (!this.merchant || !this.list.some(s => !s.done)) return false;
    return Math.hypot(hero.x - this.merchantPos.x, hero.z - this.merchantPos.z) < 2.25;
  }
  dispose() {
    for (const s of this.list) setPropOcc(s.g, 0);
    this.merchant?.dispose(); this.merchant = null;
    if (this.merchantShadow) { this.merchantShadow.geometry.dispose(); (this.merchantShadow.material as THREE.Material).dispose(); this.merchantShadow = null; }
    this.root.parent?.remove(this.root); this.list = []; this.fires = [];
  }
}
