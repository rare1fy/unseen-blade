// QTE 两种：拼刀（狂点攻击钮）和连环破势（按节拍接招），只在精英和头目战里。
// 11-18 用户：「我们游戏里的QTE我还希望再多几种情况，打起来刺激一下肾上腺素，我想到一个是拼刀快速点击。」我列了四种（拼刀、听声、
// 连环破势、挣脱），用户选了拼刀和连环破势，只在精英和头目战里出；追加：「QTE的时候要带镜头表现噢」。设计见 docs/DESIGN.md「QTE：拼刀和连环破势」。
//
// 拼刀：精英 / 头目的重近战落下时她正在破势（藏锋松手接住），或箭步斩正撞上它的起手 → 两把兵器卡住：顿一下、世界放慢到一成、镜头缓到侧面
//   中景；接触点一直迸火星，两人往前顶；两人头顶一根铁条，铜标记往哪边走就是谁在占上风；狂点攻击钮（J / 手柄 X / 触屏）一下推一截，对方
//   一直往回压（精英弱、头目强、头目二阶段更强，越到后面越狠），约两秒定胜负。赢：对方兵器被磕开、长硬直，她顺势一记重斩，杀气 +1、气 +1；
//   输：她被震退，掉一点血。
// 连环破势：头目（和精英）的一串连击，世界不停；每一击落下前她脚下和攻击钮上各有一个冷钢色的圈按节拍收到位，在那一刻按攻击接住（不花气）；
//   攻击钮左上一排铁钉是这一串有几下，接住一下亮一颗；全接住 → 她反手一记重斩（慢放、推近）；漏一下 → 那一下打中她，QTE 结束，后面几下照常
//   打完（她已经能动了，冲刺躲开）。
// 都不在序章里出（打石雷那场是剧情杀，见 canRun）；同一时间只有一个 QTE；每个精英一场最多一次，头目拼刀、连环各最多两次，两次之间至少隔几秒。
import { batchUi } from '../engine/rigidBatch';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { V3, scene } from '../engine/world';
import { FX, slowmo, hitstop, shake } from '../engine/clock';
import { Action, rot } from '../actors/rig';
import { cue } from '../../audio/cues';
import { audio } from '../../audio/audio';
import { fxSparks, fxRing, trailSeg } from '../fx/fx';
import { dustBlocks } from '../kyoto/ninja_fx';
import { PIX_H } from '../v2/pix';
import { slashArc } from './slashArc';
import { actKey, actPad } from './pad';
import { msg, t as localize } from './i18n';
import { worldToUi, type UiLayer } from '../ui3d/layer';
import { PLAY } from '../scenes/props';
import { OUT, type FloorGrid } from '../asm/roomShape';
import { isBoss, dropTeles, setFoeState, markCalm, hiddenFoe, type Foe } from './enemy';
import { movesOf } from './animCatalog';
import { TUNE } from './tune';
import { profileStorage } from '../../platform/crazygames';
import type { Solid } from './solids';
import type { Hero } from './hero';
import type { Input, Btn } from './input';
import type { ActHud } from './hud';

export type QteKind = 'clash' | 'chain';
/** what the duel needs from the show (show.ts builds it; its fields are private, the closures reach them) */
export interface DuelHost {
  L: UiLayer; hud: () => ActHud; inp: Input;
  hero(): Hero | undefined; foes(): Foe[]; grid(): FloorGrid | null;
  /** a fight is on and nothing else owns the moment (not the prologue, not 不见刀's ring, not the cards…); forced = __dh.qte (the yard too) */
  canRun(forced?: boolean): boolean;
  /** a line in the game's log (the bot's result.json) */
  log(s: string): void;
  /** the floor's obstacles (cover, props, posts): the camera picks the side with nothing tall between it and the two */
  solids(): Solid[];
  /** the lowest the banner at the top reaches right now (px; 0 = none up): the bar keeps under it */
  bannerY(): number;
  clamp(p: THREE.Vector3, r: number): void;
  hitFoe(f: Foe, dmg: number, from: THREE.Vector3, o: { knock: number; heavy: boolean; kind: string; stagger?: number }): void;
  /** the heavy cut's hit-stop, push and sound (show.ts feel('rel')) */
  feel(dir: THREE.Vector3): void;
  hurtHero(dmg: number, from: THREE.Vector3, f: Foe): void;
  addIntent(): void;
  camKick(dir: THREE.Vector3, m: number): void; camPunch(m: number): void;
  splitScreen?(k: number): void;
  vibrate(level: 'light' | 'medium' | 'heavy'): void;
}

// ---------------------------------------------------------------- which blows
/** the heavy melee blows a blade can meet (not the arrows, darts, talismans, bolts, jars, the chain's pull, the fan's push, a horse) */
const CLASH_ATK = new Set(['cut', 'slam', 'sweep', 'lunge', 'thrust', 'sweepH', 'bash', 'cutS', 'chop', 'stab', 'whirl', 'slamC', 'snip', 'reap']);
/** each boss's blows that always lock blades when 破势 meets them (until the fight's two are used): 石雷's 紫铜杖 swung into the blade
 *  and his thrust, 阎虎's 开山劈, 封寒's 截指剪, 崔玄's lunge with the drawn 文家刀. 周默 has no blow of his own to meet (his machinery
 *  and his sleeve-bow) — his 执楯刀士 elites lock blades instead */
const MUST_CLASH: Record<string, string[]> = { hj_boss: ['sweep', 'lunge'], ly_boss: ['chop'], xp_boss: ['snip'], cx_boss: ['lunge'] };
type Move = [name: string, at: number, data?: Record<string, unknown>];
/** each boss's string for 连环破势: which of his attacks starts it (and only from his second phase, or only the 3-cut start), and the
 *  blows in it (his own actions; the second phase adds one more of the first) */
const CHAIN_BOSS: Record<string, { atk: string; p2?: boolean; combo?: number; moves: Move[] }> = {
  hj_boss: { atk: 'sweep', p2: true, moves: [['hjSweep', 0.56], ['hjThrust', 0.5], ['hjSweep', 0.56]] },
  ly_boss: { atk: 'sweep', p2: true, moves: [['axeSweep', 0.62, { dist: 0.4 }], ['axeSweep', 0.62, { dist: 0.4 }], ['axeChop', 0.55]] },
  xp_boss: { atk: 'snip', p2: true, moves: [['snip', 0.6], ['snip', 0.6], ['snip', 0.6]] },
  cx_boss: { atk: 'cut', combo: 2, moves: [['attack', 0.5, { atk: 'cut', dist: 0.4 }], ['attack', 0.5, { atk: 'cut', dist: 0.4 }], ['attack', 0.5, { atk: 'cut', dist: 0.4 }]] },
};
const RANGED_ATK = /^(shoot|lob|pull|burst|cast|fan|sow|blow|thunder|axeThrow|iron|ride|ram)$/;
const NOT_MELEE = /^(cast|lob|hjLob|aimXbow|paw|charge|blow|sow|needleFan|hjThunder|appear|drink|rip|kick|axeThrow|ram|ramRun)$/;
/** an elite's own melee moves (the catalog of what each model really plays in a fight) */
function meleeMoves(f: Foe): Move[] {
  const id = (f.a as unknown as { def?: { id: string } }).def?.id ?? f.kind;
  const list = movesOf(id).filter(m => !NOT_MELEE.test(m.name) && !(m.atk && RANGED_ATK.test(m.atk)));
  return list.length ? list.map(m => [m.name, m.at, m.atk ? { atk: m.atk, dist: 0.4 } : { dist: 0.4 }] as Move) : [['attack', 0.5, { atk: 'cut', dist: 0.4 }]];
}
/** the gaps between the string's blows (real s): generous lead-in & crisp readable rhythm so players can react cleanly */
const LEAD = 1.15, GAPS = [0.78, 0.68, 0.60, 0.56];
/** where her draw's pose is held in the bind (k of the 'rel' action: the arm out, past its streak window) */
const HOLD_K = 0.52;

// ---------------------------------------------------------------- iron pieces (the bar, its marker, the plates, the studs)
const IRON = 0x4a4f5a, IRON_D = 0x1e2026, IRON_L = 0x6c7380, BRONZE = 0xb07a3a, STEEL = 0xc8d4de, RUST = 0x7a2a20;
interface BoxSpec { w: number; h: number; d: number; x: number; y: number; z: number; rz?: number; c: number }
function boxes(list: BoxSpec[]) {
  const gs: THREE.BufferGeometry[] = [], ranges: Array<[number, number]> = []; let at = 0; const col = new THREE.Color();
  for (const b of list) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d); if (b.rz) g.rotateZ(b.rz); g.translate(b.x, b.y, b.z);
    const n = g.attributes.position.count, cs = new Float32Array(n * 3); col.setHex(b.c);
    for (let i = 0; i < n; i++) { cs[i * 3] = col.r; cs[i * 3 + 1] = col.g; cs[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cs, 3)); gs.push(g); ranges.push([at, n]); at += n;
  }
  const geo = mergeGeometries(gs)!; for (const g of gs) g.dispose();
  return { geo, ranges };
}
function paint(geo: THREE.BufferGeometry, r: [number, number], c: THREE.Color) {
  const a = geo.attributes.color as THREE.BufferAttribute; for (let i = r[0]; i < r[0] + r[1]; i++) a.setXYZ(i, c.r, c.g, c.b); a.needsUpdate = true;
}
const vc = (emissive = 0x000000) => new THREE.MeshLambertMaterial({ vertexColors: true, emissive, emissiveIntensity: 0 });
const ease = (k: number) => 1 - (1 - k) ** 3;
/** in with a small settle past the mark and back (the camera arriving and stopping: 「带一点惯性和停稳的顿挫」) */
const easeIn = (k: number) => { const c = 0.9, u = k - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

/** the UI of both: the iron bar over the two (拼刀), the plates round the attack button lighting with each press, the closing ring on
 *  the button and the row of studs (连环). Iron pieces in the UI layer, vertex-coloured: six meshes at most, built on first use */
class DuelUi {
  private bar: THREE.Group | null = null; private barGeo!: THREE.BufferGeometry; private barR!: Array<[number, number]>;
  private marker!: THREE.Mesh; private fill!: THREE.Mesh;
  private plates: THREE.Group | null = null; private plateM!: THREE.Mesh; private plateR!: Array<[number, number]>; private lit: number[] = []; private plateI = 0;
  private ring: THREE.Mesh | null = null; private tgt!: THREE.Mesh; private studs: THREE.Group | null = null; private studM: THREE.Mesh | null = null; private studR: Array<[number, number]> = []; private studN = 0;
  private c = new THREE.Color(); private t = 0;
  static readonly PLATES = 9;
  constructor(private L: UiLayer) {}
  private buildBar() {
    const rivets: BoxSpec[] = [-0.36, -0.12, 0.12, 0.36].map(x => ({ w: 0.036, h: 0.036, d: 0.03, x, y: 0.048, z: 0.048, c: 0xd8a048 }));
    const B = boxes([
      { w: 1.02, h: 0.145, d: 0.08, x: 0, y: 0, z: 0, c: IRON_D },
      { w: 1, h: 0.115, d: 0.075, x: 0, y: 0, z: 0.005, c: IRON },
      { w: 1, h: 0.024, d: 0.08, x: 0, y: 0.056, z: 0.006, c: IRON_L },
      { w: 0.9, h: 0.056, d: 0.022, x: 0, y: -0.004, z: 0.04, c: 0x101218 },
      { w: 0.072, h: 0.21, d: 0.11, x: -0.51, y: 0, z: 0, c: 0x9ee4ff },   // range 4: the left end
      { w: 0.072, h: 0.21, d: 0.11, x: 0.51, y: 0, z: 0, c: 0xff5238 },    // range 5: the right end
      ...rivets,
    ]);
    this.barGeo = B.geo; this.barR = B.ranges;
    const g = new THREE.Group(), body = new THREE.Mesh(B.geo, vc()); g.add(body);
    // the share pushed: a vivid strip in the groove from the middle to the marker (steel-blue for hero, crimson for foe)
    this.fill = new THREE.Mesh(new THREE.BoxGeometry(1, 0.046, 0.024).translate(0.5, 0, 0), new THREE.MeshLambertMaterial({ color: 0x9ee4ff, emissive: 0x4288b8, emissiveIntensity: 1 }));
    this.fill.position.set(0, -0.004, 0.052); g.add(this.fill);
    const M = boxes([{ w: 0.075, h: 0.26, d: 0.12, x: 0, y: 0, z: 0.035, c: 0xd89c42 }, { w: 0.075, h: 0.042, d: 0.125, x: 0, y: 0.11, z: 0.038, c: 0xfff0b0 }, { w: 0.026, h: 0.16, d: 0.024, x: 0, y: -0.01, z: 0.098, c: 0xfff4c8 }]);
    this.marker = new THREE.Mesh(M.geo, vc(0xffc858)); g.add(this.marker);
    g.visible = false; this.L.scene.add(g); batchUi(g); this.bar = g;
  }
  private buildPlates() {
    const n = DuelUi.PLATES, list: BoxSpec[] = [];
    // an arc round the attack button's left side and top (lower left → over the top → just short of the lamps of 气 on its right
    // shoulder), inside the jump / dash / dart buttons round it; the tassel and the label below stay clear
    for (let i = 0; i < n; i++) { const a = -2.5 + i * (3.1 / (n - 1)), r = 0.62; list.push({ w: 0.11, h: 0.055, d: 0.05, x: Math.sin(a) * r, y: Math.cos(a) * r, z: 0, rz: -a, c: IRON_D }); }
    const P = boxes(list); this.plateR = P.ranges; this.plateM = new THREE.Mesh(P.geo, vc());
    // (in a group: the UI layer turns groups toward the screen's middle as it does the buttons, so the arc sits on the button's plane)
    this.plates = new THREE.Group(); this.plates.add(this.plateM); this.plates.visible = false; this.L.scene.add(this.plates); batchUi(this.plates);
    this.lit = new Array(n).fill(0);
  }
  private buildChain() {
    const basic = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.5, 8, 1, Math.PI / 8), basic(0xb8c8d6));
    this.tgt = new THREE.Mesh(new THREE.RingGeometry(0.485, 0.5, 8, 1, Math.PI / 8), basic(0x8a9aa8));
    for (const [o, r] of [[this.tgt, 40], [this.ring, 41]] as Array<[THREE.Mesh, number]>) { o.visible = false; o.renderOrder = r; o.userData.noTilt = true; this.L.scene.add(o); }
    this.studs = new THREE.Group(); this.studs.visible = false; this.L.scene.add(this.studs);
  }
  /** the studs, one per blow of the string: up the button's upper-left, between it and the jump / dart buttons */
  private buildStuds(n: number) {
    if (this.studM) { this.studs!.remove(this.studM); this.studM.geometry.dispose(); (this.studM.material as THREE.Material).dispose(); }
    const list: BoxSpec[] = []; for (let i = 0; i < n; i++) { const a = -0.12 - i * 0.21, r = 0.68; list.push({ w: 0.085, h: 0.085, d: 0.07, x: Math.sin(a) * r, y: Math.cos(a) * r, z: 0, rz: -a, c: IRON_D }); }
    const S = boxes(list); this.studR = S.ranges; this.studM = new THREE.Mesh(S.geo, vc()); this.studs!.add(this.studM); this.studN = n;
  }
  /** act-116: prominent tug-of-war iron bar in lower-center screen focus + unmistakable pixel title & button mash callout */
  showBar(x: number, y: number, len: number, m: number, herLeft: boolean, tension: number, dt: number, title: string, btnHint: string, bx: number, by: number, bSize: number, kHud: number) {
    if (!this.bar) this.buildBar();
    this.t += dt; const g = this.bar!; g.visible = true;
    const pop = this.t < 0.16 ? 1 + 0.12 * Math.sin((this.t / 0.16) * Math.PI) : 1;
    this.L.at(x, y, 3, g.position); g.scale.setScalar(this.L.px(len, 3) * pop);
    paint(this.barGeo, this.barR[4], this.c.setHex(herLeft ? 0x9ee4ff : 0xff5238)); paint(this.barGeo, this.barR[5], this.c.setHex(herLeft ? 0xff5238 : 0x9ee4ff));
    const side = herLeft ? 1 : -1, mx = m * 0.44 * side, tr = Math.sin(this.t * 53) * 0.005 * tension;
    this.marker.position.set(mx + tr, 0, 0); this.marker.scale.setScalar(1.04 + 0.16 * tension);
    (this.marker.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.25 + 0.45 * Math.max(0, m) + 0.15 * Math.sin(this.t * 24);
    // fix negative mx fill so BOTH hero advantage (steel-blue) and foe pressure (crimson) render cleanly from center
    this.fill.visible = Math.abs(mx) > 0.006;
    this.fill.scale.set(Math.max(0.001, Math.abs(mx)), 1, 1);
    this.fill.position.x = mx >= 0 ? 0 : mx;
    (this.fill.material as THREE.MeshLambertMaterial).color.setHex(m >= 0 ? 0x9ee4ff : 0xff5238);
    (this.fill.material as THREE.MeshLambertMaterial).emissive.setHex(m >= 0 ? 0x3c84b4 : 0x9a1c12);
    const dpr = this.L.dpr || 1, flash = Math.floor(this.t * 10) % 2 === 0;
    const titlePk = Math.max(1, Math.round(Math.max(20, 24 * kHud) * dpr / PIX_H));
    this.L.text.set('qte.clash.title', { text: title, x, y: y - 54 * kHud, pix: titlePk, color: this.t < 0.25 || flash ? '#fff4b8' : '#ffd26a', outline: '#140c0a', align: 'center', visible: true });
    const btnPk = Math.max(1, Math.round(Math.max(16, 19 * kHud) * dpr / PIX_H));
    this.L.text.set('qte.clash.btn', { text: btnHint, x, y: y + 48 * kHud + (flash ? -2 * kHud : 0), pix: btnPk, color: flash ? '#ffffff' : '#ffe07a', outline: '#140c0a', align: 'center', visible: true });
    void bx; void by; void bSize;
  }
  hideBar() {
    if (this.bar) this.bar.visible = false;
    this.t = 0;
    this.L.text.hide('qte.clash.title');
    this.L.text.hide('qte.clash.btn');
  }
  /** a press: the next plate round the arc lights */
  press() { if (!this.plates) this.buildPlates(); this.plateI = (this.plateI + 1) % DuelUi.PLATES; this.lit[this.plateI] = 1; }
  /** the plates round the attack button: each lit by a press, fading; with no presses a dim light runs round them (「点它」, said in
   *  light — brighter the first time) */
  showPlates(bx: number, by: number, size: number, idle: number, dt: number) {
    if (!this.plates) this.buildPlates();
    const p = this.plates!; p.visible = true; this.L.at(bx, by, 2, p.position); p.scale.setScalar(this.L.px(size, 2));
    const n = DuelUi.PLATES, run = (this.t * 9) % n, dark = new THREE.Color(IRON_D), hot = new THREE.Color(0xffd890);
    for (let i = 0; i < n; i++) {
      this.lit[i] = Math.max(0, this.lit[i] - dt * 3.2);
      const chase = idle * Math.max(0, 1 - Math.abs(i - run)) * 0.55;
      this.c.copy(dark).lerp(hot, Math.min(1, Math.max(this.lit[i], chase)));
      paint(this.plateM.geometry, this.plateR[i], this.c);
    }
  }
  hidePlates() { if (this.plates) this.plates.visible = false; }
  /** the closing ring on the attack button (k 0 → 1 lands; hot = the moment to press) and the studs (state per blow: 0 to come, 1
   *  caught, −1 missed; cur = the one coming now) */
  showChain(bx: number, by: number, size: number, k: number, hot: boolean, n: number, res: number[], cur: number, callout?: string, kHud = 1) {
    if (!this.ring) this.buildChain();
    const s = size * (1 + 2.0 * Math.max(0, 1 - k)), th = hot ? 1.24 : 1;
    for (const o of [this.ring!, this.tgt]) this.L.at(bx, by, 6, o.position);
    this.ring!.visible = k >= 0; this.ring!.scale.set(this.L.px(s, 6) * th, this.L.px(s, 6) * th, 1);
    const rm = this.ring!.material as THREE.MeshBasicMaterial; rm.color.setHex(hot ? 0xfff8dc : 0x7e92a4).lerp(new THREE.Color(hot ? 0xfff8dc : 0xc6d4e0), Math.min(1, Math.max(0, k))); rm.opacity = hot ? 1 : 0.6 + 0.35 * k;
    this.tgt.visible = true; this.tgt.scale.setScalar(this.L.px(size, 6)); const tm = this.tgt.material as THREE.MeshBasicMaterial; tm.color.setHex(hot ? 0xffe898 : 0x8a9aa8); tm.opacity = hot ? 0.98 : 0.52;
    if (this.studN !== n) this.buildStuds(n);
    const st = this.studs!; st.visible = true; this.L.at(bx, by, 2, st.position); st.scale.setScalar(this.L.px(size, 2));
    for (let i = 0; i < n; i++) paint(this.studM!.geometry, this.studR[i], this.c.setHex(res[i] > 0 ? 0xfff0b8 : res[i] < 0 ? 0x8a2a20 : i === cur ? 0x9ab0c4 : 0x30333b));
    if (callout) {
      const dpr = this.L.dpr || 1, pk = Math.max(1, Math.round(Math.max(18, 22 * kHud) * dpr / PIX_H));
      this.L.text.set('qte.chain.tip', { text: callout, x: this.L.w * 0.5, y: Math.min(this.L.h - 86 * kHud, this.L.h * 0.78), pix: pk, color: hot ? '#ffffff' : '#ffe49e', outline: '#140c0a', align: 'center', visible: true });
    }
  }
  hideChain() { if (this.ring) { this.ring.visible = false; this.tgt.visible = false; this.studs!.visible = false; } this.L.text.hide('qte.chain.tip'); }
  hideAll() { this.hideBar(); this.hidePlates(); this.hideChain(); }
}

interface Beat { move: Move; start: number; T: number; pressed: boolean; ok: boolean; pressAt: number; res: number; played: boolean }

export class Duel {
  /** the QTE running (null = none); 'tail' = a string went on after a miss, she is free again */
  mode: QteKind | null = null;
  private f: Foe | null = null; private pend: { f: Foe; kind: QteKind; force: boolean } | null = null;
  private stage: 'run' | 'win' | 'lose' | 'tail' | 'out' = 'run'; private t = 0; private endT = 0;
  private ui: DuelUi; private cool = 0;
  // the clash
  private m = 0; private presses = 0; private dur = 2; private press0 = 0.5; private first = false;
  private hero0 = V3(); private foe0 = V3(); private u = V3(0, 0, 1); private contact = V3(); private sparkT = 0; private dustT = 0; private downT = 0;
  // the chain
  private beats: Beat[] = []; private bi = 0; private ct = 0; private win = 0.12;
  private ringW: THREE.Mesh | null = null;
  // the camera: the framing (base / look / fov) and how much of it is in the view (0..1, eased)
  private camK = 0; private camT = 0; private camIn = true; private camOut = 0; private side = V3(1, 0, 0); private gain = false; private lift = 0;
  private cBase = V3(); private cLook = V3(); private cFov = 34;
  /** what the duel did (__dh.qteStats()) */
  stats = { clash: { n: 0, win: 0, lose: 0, presses: 0, rate: 0 }, chain: { n: 0, full: 0, caught: 0, missed: 0 }, last: '' };
  constructor(private host: DuelHost) { this.ui = new DuelUi(host.L); }

  get on() { return this.mode != null || this.pend != null; }
  /** she is the duel's: her buttons do nothing else, she does not walk */
  get locks() { return this.pend != null || (this.mode != null && (this.stage === 'run' || this.stage === 'win')); }
  /** nothing else hurts her while she is held (a stray bolt, a second foe) */
  get shields() { return this.pend != null || (this.mode != null && this.stage === 'run'); }
  /** the foe the duel moves itself this frame (show.ts skips its AI): held in the bind, or driven by the string's beats */
  holds(f: Foe) { return (this.pend?.f === f) || (this.f === f && this.mode != null && (this.stage === 'run' || this.stage === 'tail')); }
  /** the blade-on-blade drone while blades are locked (−1 = the duel says nothing; show.ts's stance hum otherwise) */
  hum = -1;

  // ---------------------------------------------------------------- who and when
  private firstTime(k: QteKind) { try { const o = JSON.parse(profileStorage.getItem('ub.qte') || '{}') ?? {}; return (o[k] ?? 0) < 1; } catch { return false; } }
  private seen(k: QteKind) { try { const o = JSON.parse(profileStorage.getItem('ub.qte') || '{}') ?? {}; o[k] = (o[k] ?? 0) + 1; profileStorage.setItem('ub.qte', JSON.stringify(o)); } catch { /* private mode: it is slow again next time */ } }
  private eligible(f: Foe) {
    const h = this.host.hero();
    // (not the hounds and the riders: no blade to lock with)
    return !!h && h.alive && f.st !== 'dead' && f.kind !== 'dummy' && (f.elite || isBoss(f)) && f.role !== 'hound' && !/rider/.test(f.kind) && f.inv <= 0 && !hiddenFoe(f) && !f.mem.hidden && f.a.root.visible && this.host.canRun();
  }
  private room(f: Foe, k: QteKind) {
    if (this.on || this.cool > 0) return false;
    const n = (f.mem.qClash ?? 0) + (f.mem.qChain ?? 0);
    // an elite: once (and two elites' worth a room at most — a 死士 room of four would be QTE after QTE); a boss: each kind twice
    if (!isBoss(f)) return n < 1 && this.roomN < 2;
    return (k === 'clash' ? f.mem.qClash ?? 0 : f.mem.qChain ?? 0) < 2 && n < 3;
  }
  /** a new room: the room's count starts again, anything under way is dropped */
  newRoom() { this.abort(); this.roomN = 0; this.cool = 0; }
  /** 破势 / 箭步斩 / 回锋反击 / 重招撞上精英或头目的近战重招: 100% 进拼刀（受每场/每间次数与冷却限制，不再随机吞掉） */
  offerClash(f: Foe, draw = false): boolean {
    if (this.pend?.f === f) return true;
    const why = this.mode ? 'busy' : !this.eligible(f) ? 'not eligible' : !this.room(f, 'clash') ? 'no room' : !(f.st === 'windup' || (f.st === 'strike' && f.t < Math.min(0.45, f.dur))) ? `state ${f.st}` : !CLASH_ATK.has(f.atk) ? `atk ${f.atk}` : '';
    this.stats.last = `offer ${f.kind} ${f.atk} ${draw ? 'draw' : 'parry'}${why ? ': ' + why : ''}`;
    if (why) return false;
    // (the draw / heavy counter: into a blow already well into its windup or early strike)
    if (draw && f.st === 'windup' && f.t / Math.max(0.01, f.dur) < 0.35) return false;
    this.pend = { f, kind: 'clash', force: false }; return true;
  }
  /** start one waiting now (show.ts: right after her update, where the parry / the draw asked for it) */
  flush() { if (this.pend && !this.mode) { const p = this.pend; this.pend = null; if (p.f.st !== 'dead' && this.host.hero()?.alive && this.host.canRun(p.force)) { this.forced = p.force; this.begin(p.f, p.kind); } } }
  /** __dh.qte(kind): the nearest elite / boss (else any foe) at once */
  force(kind: QteKind = 'clash') {
    const h = this.host.hero(); if (!h || this.on) return false;
    const live = this.host.foes().filter(f => f.st !== 'dead' && f.kind !== 'dummy' && !hiddenFoe(f));
    const pick = (l: Foe[]) => l.sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos))[0];
    const f = pick(live.filter(f => f.elite || isBoss(f))) ?? pick(live); if (!f) return false;
    this.pend = { f, kind, force: true }; return true;
  }
  /** a boss / an elite starting the string that is its 连环破势 (each attack looked at once: its warning is new) */
  private looked = new WeakSet<object>();
  private watchChains() {
    if (this.on || this.cool > 0) return;
    const h = this.host.hero(); if (!h || !this.host.canRun()) return;
    if (h.y > 0.05 || !/^(free|k[1-5]|charge|noto)$/.test(h.st)) return;
    for (const f of this.host.foes()) {
      if (f.st !== 'windup' || f.t > 0.2 || !f.tele || this.looked.has(f.tele)) continue;
      this.looked.add(f.tele);
      if (!this.eligible(f) || !this.room(f, 'chain') || f.pos.distanceTo(h.pos) > 5.2) continue;
      const B = CHAIN_BOSS[f.kind];
      let go = false;
      // a boss: the first time his string's attack comes (in its phase) always, then 75%; an elite: 75% on its two-cut string (capped per fight/room)
      if (isBoss(f) && B) { if (f.atk === B.atk && (!B.p2 || f.phase > 1) && (B.combo == null || f.combo >= B.combo)) go = (f.mem.qChain ?? 0) === 0 || Math.random() < 0.75; }
      else if (!isBoss(f) && f.combo > 0 && CLASH_ATK.has(f.atk)) go = Math.random() < 0.75;
      if (go) { this.pend = { f, kind: 'chain', force: false }; return; }
    }
  }

  // ---------------------------------------------------------------- every frame (show.ts frame, after the bot, before her update)
  /** a press of the attack button: from its down state (the show clears the buttons' pressed flags every frame she is held, so a key
   *  held down would read as a press each frame — a held key must not win the clash) */
  private lastDown = false; private forced = false; private roomN = 0;
  private edge(A: Btn) { const e = A.down && !this.lastDown; this.lastDown = A.down; return e; }
  frame(rdt: number) {
    this.cool = Math.max(0, this.cool - rdt);
    this.flush();
    if (!this.mode) { this.lastDown = this.host.inp.b.attack.down; this.watchChains(); this.camStep(rdt); return; }
    const h = this.host.hero(), f = this.f!, held = this.stage === 'run' || this.stage === 'tail';
    if (!h || !h.alive || (held && (f.st === 'dead' || !this.host.foes().includes(f))) || (!this.host.canRun(this.forced) && this.stage !== 'out')) { this.abort(); this.camStep(rdt); return; }
    this.t += rdt;
    // (held: the others keep off — nobody starts a blow into the duel; a boss's own machinery is his and goes on)
    if (this.stage === 'run') markCalm();
    if (this.mode === 'clash') this.clashFrame(rdt, h, f); else this.chainFrame(rdt, h, f);
    this.camStep(rdt);
  }

  private begin(f: Foe, kind: QteKind) {
    const h = this.host.hero()!;
    this.mode = kind; this.f = f; this.stage = 'run'; this.t = 0; this.camT = 0; this.camIn = true; this.first = this.firstTime(kind);
    if (kind === 'clash') f.mem.qClash = (f.mem.qClash ?? 0) + 1; else f.mem.qChain = (f.mem.qChain ?? 0) + 1;
    if (!isBoss(f)) this.roomN++;
    this.seen(kind); this.lastDown = this.host.inp.b.attack.down; this.host.log('qte ' + kind + ' ' + f.kind + (f.elite ? ' elite ' : ' ') + f.atk);
    // she stops whatever she was doing (the draw's lunge, a cut) and stands to him; nothing of the press that started it carries on
    h.forceFree(); h.parryT = 0; h.iaiBonus = false; h.clearInput(); h.inv = 30;   // (> 20: held, not the hit blink)
    dropTeles(f); f.vel.set(0, 0, 0); f.lunge = null; f.attacking = true; setFoeState(f, 'stagger', 99);
    const d = h.pos.clone().sub(f.pos).setY(0); if (d.lengthSq() < 1e-4) d.set(0, 0, 1); d.normalize();
    this.u.copy(d).multiplyScalar(-1);   // u: from her toward him
    this.chooseSide(h.pos.clone().add(f.pos).multiplyScalar(0.5));
    if (kind === 'clash') this.beginClash(h, f); else this.beginChain(h, f);
  }

  // ---------------------------------------------------------------- 拼刀（架刀角力）
  private beginClash(h: Hero, f: Foe) {
    this.m = 0; this.presses = 0; this.stats.clash.n++;
    this.dur = TUNE.clashTime * (this.first ? 1.35 : 1);
    const D = h.r + f.d.r + 0.75;
    this.foe0.copy(f.pos); this.hero0.copy(f.pos).addScaledVector(this.u, -D); this.host.clamp(this.hero0, h.r);
    this.press0 = 0.45;
    // her: the draw's reach held — arm out, the blade forward into his; him: his blow held where it met hers
    { const a = new Action('rel', 1, 0.3); a.t = HOLD_K; h.a.play(a); }
    if (!f.a.act || NOT_MELEE.test(f.a.act.name)) { const mv = (CHAIN_BOSS[f.kind]?.moves ?? meleeMoves(f))[0]; f.a.play(new Action(mv[0], 1.2, mv[1], mv[2] ?? {})); }
    h.scriptPose = () => this.lean(h);
    this.contactAt(h);
    const crossSide = V3(this.u.z, 0, -this.u.x);
    slashArc.clashCross(this.contact, crossSide, 0.62, 'iai', 0.14, 0.85);
    slashArc.clashCross(this.contact, crossSide, -0.62, 'heavy', 0.14, 0.8);
    this.host.splitScreen?.(0.45);
    hitstop(0.11); shake(0.32 * TUNE.shake); this.host.vibrate('heavy');
    fxSparks(this.contact, 0xfff0c8, 20, 7.5, { life: 0.14 }); fxRing(this.contact.clone(), 0xffe6b0, 1.0, { life: 0.08 } as never);
    cue('parry', 1); cue('bladeRing', 0.9); cue('timeSlow', 0.5);
    dustBlocks(h.pos.clone(), 5, this.u.clone().multiplyScalar(-1)); dustBlocks(f.pos.clone(), 5, this.u.clone());
  }
  private contactAt(h: Hero) { this.contact.copy(h.pos).addScaledVector(this.u, h.r + 0.62).setY(1.18); }
  /** her body in the bind (拼刀: leaning in, the sword arm trembling as it gets harder) / on guard between the string's blows */
  private lean(h: Hero) {
    const b = h.a.bones, k = this.tension(), tr = Math.sin(this.t * 47) * 0.02 * k;
    if (this.mode === 'clash' && this.stage === 'run') { rot(b.spine, 0.16 + 0.1 * k); rot(b.chest, 0.06 + 0.04 * k); rot(b.armR, tr, 0, tr * 0.6); rot(b.neck, -0.08); }
    else if (this.mode === 'chain' && this.stage === 'run') { rot(b.spine, 0.14); rot(b.neck, -0.06); rot(b.legL, -0.18); rot(b.shinL, 0.3); rot(b.legR, 0.1); rot(b.shinR, 0.25); }
  }
  private tension() { return this.mode === 'clash' ? Math.min(1, 0.55 * Math.min(1, this.t / this.dur) + 0.45 * Math.abs(this.m)) : Math.min(1, this.bi / 4); }
  private clashFrame(rdt: number, h: Hero, f: Foe) {
    const inp = this.host.inp, A = inp.b.attack;
    if (this.stage === 'run') {
      slowmo(0.05, 0.1);   // the world nearly still — the sparks, the snow, the cloth go on slowly
      // the press: the marker on, a scrape and a few sparks, a plate lit, the button down a moment
      if (this.edge(A)) this.onPress(f);
      // his weight against hers, harder as it goes (×1 → ×1.5 over the bind; a boss more, his second phase more still; the first time
      // a little kinder). With TUNE's numbers, to be ahead when the time runs out: an elite takes about 3.5 presses a second, a boss
      // about 7, his second phase about 7.6 (a phone's thumb does 7–9); at 8 an elite is pushed right through in about 1.5 s
      const base = (isBoss(f) ? TUNE.clashBoss * (f.phase > 1 ? 1.12 : 1) : TUNE.clashElite) * (this.first ? 0.8 : 1);
      // act-125: 0.45s reaction grace at clash start so players read the prompt before losing ground
      if (this.t > 0.45) this.m -= base * (1 + 0.45 * Math.min(1, this.t / this.dur)) * rdt;
      this.m = Math.max(-1, Math.min(1, this.m));
      const k = this.tension();
      // the bind slides toward whoever is losing
      const slide = this.m * 0.38, ent = Math.min(1, this.t / 0.12);
      h.pos.lerp(this.hero0.clone().addScaledVector(this.u, slide), ent);
      f.pos.copy(this.foe0).addScaledVector(this.u, slide);
      h.vel.set(0, 0, 0); h.a.yaw = Math.atan2(this.u.x, this.u.z); f.yaw = Math.atan2(-this.u.x, -this.u.z); f.a.yaw = f.yaw;
      // her draw's reach held (the arm out, the blade forward into his) — held past the draw's streak window (k 0.14–0.46)
      if (h.a.act?.name === 'rel') h.a.act.t = HOLD_K; else { const a = new Action('rel', 1, 0.3); a.t = HOLD_K; h.a.play(a); }
      this.contactAt(h);
      this.sparkT -= rdt; if (this.sparkT <= 0) { this.sparkT = 0.09 - 0.03 * k; fxSparks(this.contact, 0xffd890, 2 + Math.round(k), 2.5 + 2 * k, { life: 0.07 }); }
      this.dustT -= rdt; if (this.dustT <= 0) { this.dustT = 0.5; dustBlocks(h.pos.clone(), 2, this.u.clone().multiplyScalar(-1)); }
      this.hum = 0.35 + 0.65 * k;
      this.downT = Math.max(0, this.downT - rdt); const btn = this.host.hud().btns.attack as { down?: boolean; pid?: number | null }; if (this.downT <= 0 && btn.pid == null && inp.lastDevice !== 'touch') btn.down = false;
      this.drawClashUi(h, f, rdt, k);
      if (this.m >= 1 || (this.t >= this.dur && this.m > 0)) this.clashWin(h, f);
      else if (this.m <= -1 || this.t >= this.dur) this.clashLose(h, f);
      return;
    }
    // after: the camera follows the cut (a win) a moment, then lets go
    this.hum = -1; this.ui.hideAll();
    if (this.stage === 'win' && this.t >= this.endT) this.release(h, 0);
    if (this.stage === 'out' && this.camK <= 0.001 && !this.camIn) this.finish();
  }
  private onPress(f: Foe) {
    const k = this.tension(), inp = this.host.inp;
    this.m = Math.min(1, this.m + TUNE.clashPush); this.presses++; this.stats.clash.presses++;
    this.ui.press(); this.host.hud().btnKick('attack', 0.42, 0xffd890);
    const btn = this.host.hud().btns.attack as { down?: boolean }; if (inp.lastDevice !== 'touch') { btn.down = true; this.downT = 0.05; }
    fxSparks(this.contact, 0xffe8b0, 4, 4.5 + 2 * k, { life: 0.07 });
    audio.any('ub_parry_', { gain: 0.18 + 0.14 * k, rate: 1.45 + 0.45 * k, jitter: 0.06, bus: 'hero', pri: 1 });
    audio.noise(0.07, { from: 5200 + 2400 * k, to: 2200, gain: 0.05 + 0.05 * k, q: 2.5 });
    shake(0.03 * TUNE.shake); void f;
  }
  private drawClashUi(h: Hero, f: Foe, rdt: number, k: number) {
    const L = this.host.L, hud = this.host.hud(), b = hud.btns.attack, dev = this.host.inp.lastDevice;
    // act-116 / act-117: prominent centered lower-third focus (clear of top Boss HP bar, mid-screen swordplay, and bottom-right dock)
    const len = Math.min(L.w * 0.44, 370 * hud.k);
    const x = L.w * 0.5, y = Math.min(L.h - 90 * hud.k, L.h * 0.77);
    const herLeft = worldToUi(h.pos).x <= worldToUi(f.pos).x;
    const btnHint = dev === 'pad' ? msg`连按 ${actPad('attack')}` : dev === 'key' ? msg`连按 ${localize(actKey('attack'))}` : '连按攻击';
    this.ui.showBar(x, y, len, this.m, herLeft, k, rdt, '拼刀 · 连按', btnHint, b.x, b.y, b.size, hud.k);
    // always run a bright gold chase round the attack button plates during clash so the mash target is unmistakable
    this.ui.showPlates(b.x, b.y, b.size, this.presses === 0 ? 1 : 0.72, rdt);
  }
  private clashWin(h: Hero, f: Foe) {
    this.stage = 'win'; this.stats.clash.win++; this.host.log('qte clash win ' + this.presses); this.stats.clash.rate = this.presses / Math.max(0.3, this.t); this.stats.last = 'clash win';
    this.endT = this.t + 0.4; FX.slowmo = 0; this.hum = -1; this.ui.hideAll();
    // his weapon knocked aside, him thrown back reeling; her blade carries on through him
    const dir = this.u.clone();
    this.releaseFoe(f, 1.7);
    f.a.play(new Action('hurt', 1.0, 0.1, { power: 1.6 })); f.vel.copy(dir).multiplyScalar(3);
    cue('guardBreak', 1); cue('swishHeavy', 1); this.host.vibrate('heavy');
    // (sparks and one short ring — the act-34 lesson: 「眼睛都要闪瞎了」; the cut's own streak and the hit carry the moment)
    fxSparks(this.contact, 0xfff4d8, 14, 8, { life: 0.18 }); fxRing(this.contact.clone(), 0xfff0c0, 1.1, { life: 0.12 } as never);
    const act = new Action('rel', 0.5, 0.3); act.t = 0.2; h.a.play(act); h.scriptPose = null;
    const c = f.a.chest(), side = V3(dir.z, 0, -dir.x);
    slashArc.clashCross(c, side, 0.52, 'iai', 0.22, 1.05);
    slashArc.clashCross(c, side, -0.52, 'counter', 0.2, 0.92);
    this.host.splitScreen?.(0.55);
    trailSeg(c.clone().addScaledVector(side, -0.8).add(V3(0, 0.45, 0)), c.clone().addScaledVector(side, 0.8).add(V3(0, -0.3, 0)), 0xfff2c8, 0.14, { life: 0.22, bright: 2.6, spark: 0.4 });
    const dmg = Math.round(TUNE.relDmg * 1.8 + (isBoss(f) ? f.maxHp * 0.06 : f.maxHp * 0.14));
    // (act-138: kind 'clash' bypasses shield guards & awards clash trial progress without triple-dipping parry/counter multipliers)
    this.host.hitFoe(f, dmg, h.pos.clone(), { knock: 2.2, heavy: true, kind: 'clash' }); this.host.feel(dir); this.dim(f);
    if (f.st !== 'dead') { setFoeState(f, 'stagger', 1.45); f.cd = Math.max(f.cd, 1.8); }
    this.host.camKick(dir, 0.12 * TUNE.shake / 2); this.host.camPunch(0.07); slowmo(0.32, 0.3);
    this.gain = true; h.qi = Math.min(3, h.qi + 1);   // (杀气 +1 as the duel lets go, 气 +1 now)
  }
  private clashLose(h: Hero, f: Foe) {
    this.stage = 'lose'; this.stats.clash.lose++; this.host.log('qte clash lose ' + this.presses); this.stats.clash.rate = this.presses / Math.max(0.3, this.t); this.stats.last = 'clash lose';
    FX.slowmo = 0; this.hum = -1; this.ui.hideAll();
    // she is thrown off: a lighter blow than his strike, a stagger, the camera springs back with her
    this.releaseFoe(f, 0); setFoeState(f, 'recover', 0.55); f.attacking = false; markCalm();
    h.scriptPose = null; h.inv = 0; h.a.act = null; this.host.inp.latch(false);
    cue('parry', 0.8); fxSparks(this.contact, 0xffc890, 18, 6, { life: 0.35 }); shake(0.35 * TUNE.shake); this.host.vibrate('heavy');
    this.host.hurtHero(Math.max(3, Math.round(7 * TUNE.enemyDmg * (isBoss(f) ? 1.4 : 1))), f.pos.clone(), f);
    this.host.camKick(this.u.clone().multiplyScalar(-1), 0.14 * TUNE.shake / 2);
    this.stage = 'out'; this.camIn = false; this.camT = 0; this.cool = 5;
  }

  // ---------------------------------------------------------------- 连环破势
  private beginChain(h: Hero, f: Foe) {
    this.stats.chain.n++;
    const B = isBoss(f) ? CHAIN_BOSS[f.kind] : undefined, moves = B?.moves ?? meleeMoves(f);
    const n = isBoss(f) ? (f.phase > 1 ? 4 : 3) : 3, slow = this.first ? 1.3 : 1;
    this.win = TUNE.chainWin * (this.first ? 1.25 : 1);
    this.beats = []; let T = LEAD * slow, start = 0;
    for (let i = 0; i < n; i++) { this.beats.push({ move: moves[i % moves.length], start, T, pressed: false, ok: false, pressAt: -1, res: 0, played: false }); start = T; T += GAPS[Math.min(i, GAPS.length - 1)] * slow; }
    this.bi = 0; this.ct = 0;
    const D = h.r + f.d.r + 1.05;
    this.foe0.copy(f.pos); this.hero0.copy(f.pos).addScaledVector(this.u, -D); this.host.clamp(this.hero0, h.r);
    h.a.act?.cancel(); h.a.act = null; h.scriptPose = () => this.lean(h);
    cue('bladeRing', 0.8); this.host.vibrate('light');
    if (!this.ringW) {
      this.ringW = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc6d4e0, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      this.ringW.renderOrder = 3; this.ringW.visible = false; scene.add(this.ringW);
    }
  }
  private chainFrame(rdt: number, h: Hero, f: Foe) {
    const inp = this.host.inp, A = inp.b.attack;
    if (this.stage === 'run' || this.stage === 'tail') {
      this.ct += rdt;
      const b = this.beats[this.bi];
      // his blow for this beat: its own action, timed so its impact frame lands on the beat
      if (!b.played && this.ct >= b.start) { b.played = true; f.a.play(new Action(b.move[0], Math.max(0.2, (b.T - b.start) / b.move[1]), b.move[1], b.move[2] ?? {})); f.yaw = Math.atan2(h.pos.x - f.pos.x, h.pos.z - f.pos.z); f.a.yaw = f.yaw; }
      if (f.a.act && b.played) f.a.act.t = Math.min(f.a.act.dur * 0.999, this.ct - b.start);
      if (this.stage === 'run') {
        const ent = Math.min(1, this.t / 0.15);
        h.pos.lerp(this.hero0, ent); h.vel.set(0, 0, 0); h.a.yaw = Math.atan2(f.pos.x - h.pos.x, f.pos.z - h.pos.z);
        f.pos.copy(this.foe0);
        const pressed = this.edge(A);
        if (pressed && !b.pressed && this.ct >= b.T - 0.42) {
          b.pressed = true; b.pressAt = this.ct; b.ok = Math.abs(this.ct - b.T) <= this.win;
          this.host.hud().btnKick('attack', 0.35, 0xe8f2fa);
          if (!b.ok) { h.a.play(new Action('rel', 0.45, 0.3)); cue('swish', 0.5); }   // too early: she swings at nothing
        }
        const k = Math.min(1, Math.max(0, (this.ct - b.start) / Math.max(0.05, b.T - b.start))), hot = Math.abs(this.ct - b.T) <= this.win;
        const hud = this.host.hud(), dev = this.host.inp.lastDevice;
        const callout = dev === 'pad' ? msg`连环破势 · 缩圈即按 ${actPad('attack')}` : dev === 'key' ? msg`连环破势 · 缩圈即按 ${localize(actKey('attack'))}` : '连环破势 · 缩圈即按';
        this.ui.showChain(hud.btns.attack.x, hud.btns.attack.y, hud.btns.attack.size, k, hot, this.beats.length, this.beats.map(x => x.res), this.bi, callout, hud.k);
        const rw = this.ringW!; rw.visible = true; rw.position.set(h.pos.x, 0.07, h.pos.z); rw.scale.setScalar((0.95 + 2.3 * (1 - k)) * (hot ? 1.08 : 1));
        (rw.material as THREE.MeshBasicMaterial).color.setHex(hot ? 0xfff8dc : 0x9aaebe); (rw.material as THREE.MeshBasicMaterial).opacity = hot ? 1 : 0.55 + 0.35 * k;
        // the beat resolves: caught (on the beat, or as soon as a late press within the window comes), or it lands on her
        if (b.pressed && b.ok && this.ct >= Math.max(b.T - 0.01, b.pressAt)) this.catchBeat(h, f, b);
        else if ((b.pressed && !b.ok && this.ct >= b.T) || (!b.pressed && this.ct > b.T + this.win)) this.missBeat(h, f, b);
      } else {
        // the tail after a miss: the rest of the string comes on as plain blows — she can move (dash out of it)
        if (this.ct >= b.T) {
          const to = h.pos.clone().sub(f.pos).setY(0), d = to.length(); let a = Math.atan2(to.x, to.z) - f.yaw; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
          cue('foeHeavy', 0.8);
          if (h.alive && d < f.d.r + 2.0 && Math.abs(a) < 1.1) this.host.hurtHero(Math.max(3, Math.round(9 * TUNE.enemyDmg * (isBoss(f) ? 1.3 : 1))), f.pos.clone(), f);
          this.bi++;
          if (this.bi >= this.beats.length) { this.releaseFoe(f, 0); setFoeState(f, 'recover', 0.6); f.attacking = false; markCalm(); this.stage = 'out'; this.camIn = false; this.camT = 0; return; }
        }
        // he steps after her as the string goes on
        const want = h.pos.clone().sub(f.pos).setY(0); if (want.length() > f.d.r + 1.2) { f.pos.addScaledVector(want.normalize(), 2.6 * rdt); this.host.clamp(f.pos, f.d.r); }
      }
      return;
    }
    if (this.stage === 'win' && this.t >= this.endT) this.release(h, 0);
    if (this.stage === 'out' && this.camK <= 0.001 && !this.camIn) this.finish();
  }
  private catchBeat(h: Hero, f: Foe, b: Beat) {
    b.res = 1; this.stats.chain.caught++;
    // the blow met: steel on steel, sparks off her blade, she gives a little ground and stands; the camera knocked along his blow
    const inn = this.u.clone().multiplyScalar(-1), at = h.pos.clone().addScaledVector(this.u, h.r + 0.55).setY(1.15);
    h.a.play(new Action('rel', 0.42, 0.3)); const a = h.a.act; if (a) a.t = 0.08;
    cue('parry', 1); fxSparks(at, 0xf0f6ff, 18, 6, { life: 0.32 }); fxRing(at.clone(), 0xe8f2fa, 0.7, { life: 0.22 } as never);
    shake(0.14 * TUNE.shake); this.host.camKick(inn, 0.05 * TUNE.shake / 2); this.host.vibrate('light');
    this.hero0.addScaledVector(this.u, -0.18); this.foe0.addScaledVector(this.u, -0.18); this.host.clamp(this.hero0, h.r); this.host.clamp(this.foe0, f.d.r);
    this.bi++;
    if (this.bi >= this.beats.length) this.chainWin(h, f);
  }
  private missBeat(h: Hero, f: Foe, b: Beat) {
    b.res = -1; this.stats.chain.missed++; this.stats.last = 'chain miss'; this.host.log('qte chain miss ' + (this.bi + 1) + '/' + this.beats.length);
    this.ui.hideAll(); if (this.ringW) this.ringW.visible = false;
    // the blow lands on her; the rest of the string still comes — she is free to get out of it
    h.inv = 0; h.scriptPose = null; this.stage = 'tail'; this.camIn = false; this.camT = 0; this.cool = 5; this.host.inp.latch(false);
    this.host.hurtHero(Math.max(3, Math.round(9 * TUNE.enemyDmg * (isBoss(f) ? 1.3 : 1))), f.pos.clone(), f);
    this.bi++;
    if (this.bi >= this.beats.length) { this.releaseFoe(f, 0); setFoeState(f, 'recover', 0.6); f.attacking = false; markCalm(); this.stage = 'out'; }
  }
  private chainWin(h: Hero, f: Foe) {
    this.stage = 'win'; this.stats.chain.full++; this.host.log('qte chain full ' + this.beats.length); this.stats.last = 'chain full'; this.endT = this.t + 0.55;
    this.ui.hideAll(); if (this.ringW) this.ringW.visible = false;
    // every blow caught: he is open — she turns the last one aside and cuts back through him (slowed, the camera in close)
    const dir = this.u.clone();
    this.releaseFoe(f, 1.8); f.a.play(new Action('hurt', 1.0, 0.1, { power: 1.6 }));
    const act = new Action('rel', 0.5, 0.3); act.t = 0.16; h.a.play(act);
    const c = f.a.chest(), side = V3(dir.z, 0, -dir.x);
    trailSeg(c.clone().addScaledVector(side, 0.8).add(V3(0, 0.5, 0)), c.clone().addScaledVector(side, -0.8).add(V3(0, -0.35, 0)), 0xf2f8ff, 0.14, { life: 0.25, bright: 2.6, spark: 0.4 });
    cue('guardBreak', 1); cue('swishHeavy', 1); this.host.vibrate('heavy');
    const dmg = Math.round(TUNE.relDmg * 2.1 + (isBoss(f) ? f.maxHp * 0.08 : f.maxHp * 0.16));
    this.host.hitFoe(f, dmg, h.pos.clone(), { knock: 2.4, heavy: true, kind: 'clash' }); this.host.feel(dir); this.dim(f);
    if (f.st !== 'dead') { setFoeState(f, 'stagger', 1.5); f.poise = f.d.poise; f.cd = Math.max(f.cd, 1.8); }
    slowmo(0.5, 0.25); this.host.camPunch(0.1); this.gain = true;
  }

  /** the hit's white flash on him held down: the slow-motion after the cut stretches it (it fades on game time) and he read as a white
   *  blob for a third of a second (act-34: 「眼睛都要闪瞎了」) */
  private dim(f: Foe) { const a = f.a as unknown as { flash: number }; a.flash = Math.min(a.flash, 0.3); }

  // ---------------------------------------------------------------- the end
  /** the foe back to its own AI (stagger s: how long it reels first; 0 = the caller sets its state) */
  private releaseFoe(f: Foe, stagger: number) {
    if (f.st !== 'dead' && stagger > 0) { setFoeState(f, 'stagger', stagger); f.attacking = false; f.combo = 0; f.cd = Math.max(f.cd, stagger + 0.3); }
  }
  /** her back to herself, the camera on its way out; a button still held from the mashing counts once it has been let go; a win's
   *  杀气 now (a full bar opens 不见刀's ring — not over the duel's own beat) */
  private release(h: Hero, inv: number) {
    h.scriptPose = null; h.inv = Math.min(h.inv, inv); this.stage = 'out'; this.camIn = false; this.camT = 0; this.cool = 5; this.hum = -1;
    this.host.inp.latch(false);
    if (this.gain) { this.gain = false; this.host.addIntent(); }
  }
  private finish() { this.mode = null; this.f = null; this.stage = 'run'; this.hum = -1; this.gain = false; this.ui.hideAll(); if (this.ringW) this.ringW.visible = false; }
  /** the room changed, she died, the foe went: everything back at once (the camera eases back from where it was) */
  abort() {
    const h = this.host.hero();
    if (h && this.mode) { h.scriptPose = null; if (h.inv > 20) h.inv = 0; }   // (0, not a short spell: the hit blink would read as a blow)
    if (this.f && this.f.st === 'stagger' && this.f.dur > 50) { setFoeState(this.f, 'move', 0); this.f.attacking = false; }
    if (this.mode) { this.camIn = false; this.camT = 0; this.host.inp.latch(false); }
    this.pend = null; this.finish(); if (FX.slowmo > 0 && FX.slowmoScale <= 0.1) FX.slowmo = 0;
  }
  /** show.ts's foe loop calls this instead of the foe's AI while the duel has it: held in the blow (拼刀) or driven by the string's
   *  beats (连环) — the actor's own update runs after */
  holdFoe(f: Foe, dt: number) {
    void dt; f.vel.set(0, 0, 0); f.a.yaw = f.yaw; f.a.setRunning(false, 0, f.yaw, f.vel);
    if (this.mode === 'clash' && this.stage === 'run') { const a = f.a.act; if (a) a.t = Math.max(0, a.at * a.dur - 0.02); }
  }

  // ---------------------------------------------------------------- the camera
  /** which side the camera stands: of the two sides (toward the room's open front first — the set is dressed to be seen from there),
   *  the one with the floor under it and nothing in the way of the view: no walled-off block, and no post / crate / cover standing
   *  within a metre of the line from the camera down to the two (a post filled the frame in the yard) */
  private chooseSide(mid: THREE.Vector3) {
    const n = V3(this.u.z, 0, -this.u.x); if (n.z < 0) n.multiplyScalar(-1);
    // what can stand in the view: the floor's cover / props / posts, and the other bodies (the yard's wooden dummies, other foes)
    const things: Array<{ x: number; z: number; r: number }> = [];
    for (const o of this.host.solids()) if (o.on) things.push({ x: o.x, z: o.z, r: o.shape === 'circle' ? o.r : Math.max(o.hx, o.hz) });
    for (const f of this.host.foes()) if (f !== this.f && f.st !== 'dead') things.push({ x: f.pos.x, z: f.pos.z, r: f.d.r });
    const D = TUNE.qteCamD, score = (s: THREE.Vector3) => {
      const c = this.lookDir(s, 0.22); let bad = 0;
      if (!this.floorOk(mid.clone().addScaledVector(c, D))) bad += 10;
      if (!this.floorOk(mid.clone().addScaledVector(c, D * 0.5))) bad += 10;
      for (const o of things) {
        // along the line toward the camera, from just past the two to 70 % of the way (the far end is high over everything)
        const along = (o.x - mid.x) * c.x + (o.z - mid.z) * c.z; if (along < 0.5 || along > D * 0.7) continue;
        if (Math.hypot(o.x - (mid.x + c.x * along), o.z - (mid.z + c.z * along)) < o.r + 0.9) bad += 1;
      }
      return bad;
    };
    const m = n.clone().multiplyScalar(-1), a = score(n), b = score(m);
    this.side.copy(b < a ? m : n);
    // neither side clear: the camera goes up and looks down over what is in the way
    this.lift = Math.min(a, b) > 0 && Math.min(a, b) < 10 ? 1.8 : 0;
  }
  /** the way from the two to the camera: out to the side, a little behind her (back: share of −u); never looking out of the room's
   *  open front (at least a third of the way toward +z, where the game camera stands) */
  private lookDir(side: THREE.Vector3, back: number) {
    const c = side.clone().addScaledVector(this.u, -back).setY(0).normalize();
    if (c.z < 0.35) { const sx = c.x < 0 ? -1 : 1; c.set(sx * Math.sqrt(1 - 0.35 * 0.35), 0, 0.35); }
    return c;
  }
  private floorOk(p: THREE.Vector3) {
    if (p.x < PLAY.x0 + 0.6 || p.x > PLAY.x1 - 0.6 || p.z < PLAY.z0 + 0.6 || p.z > PLAY.z1 + 14) return false;
    const g = this.host.grid(); if (g && p.z < PLAY.z1 - 0.5 && g.at(p.x, p.z) === OUT) return false;
    return true;
  }
  private camStep(rdt: number) {
    this.camT += rdt;
    // in: 0.3 s with a small settle past the mark; out: a quarter second, from wherever it was (an abort mid-way too)
    if (this.mode && this.camIn) { this.camK = easeIn(Math.min(1, this.camT / 0.3)); this.camOut = this.camK; }
    else this.camK = Math.max(0, Math.min(1, this.camOut) * (1 - this.camT / 0.25));
    const h = this.host.hero(), f = this.f; if (!this.mode || !h || !f) return;
    const mid = h.pos.clone().add(f.pos).multiplyScalar(0.5), k = this.tension();
    if (this.mode === 'clash') {
      // the side, mid shot: both whole in the frame (the figures about half its height — no close-up, 体素近看露怯); nearer as it gets
      // harder, the aim drifting the way the marker goes; after a win the view rides along her cut a little
      const D = TUNE.qteCamD * (1 - 0.16 * k), ride = this.stage === 'win' ? Math.min(1, Math.max(0, this.t - (this.endT - 0.4)) / 0.4) * 0.6 : 0;
      this.cBase.copy(mid).addScaledVector(this.lookDir(this.side, 0.22), D).addScaledVector(this.u, ride).setY(TUNE.qteCamH + this.lift);
      this.cLook.copy(mid).addScaledVector(this.u, this.m * 0.3 + ride).setY(1.0); this.cFov = 34;
    } else {
      // the string: over her shoulder from the side, him and his blows in front of her; it closes in beat by beat, closer still for
      // the cut back
      const D = TUNE.qteCamD * 1.15 * (1 - 0.05 * this.bi) * (this.stage === 'win' ? 0.84 : 1);
      this.cBase.copy(mid).addScaledVector(this.lookDir(this.side, 0.75), D).setY(TUNE.qteCamH + 1.2 + this.lift);
      this.cLook.copy(h.pos).lerp(f.pos, 0.6).setY(1.0); this.cFov = 36;
    }
    // never past the room's walls, never below a man's head (act-37's rule for the cutscene camera); over a walled-off block: higher
    this.cBase.x = Math.max(PLAY.x0 + 0.8, Math.min(PLAY.x1 - 0.8, this.cBase.x)); this.cBase.z = Math.max(PLAY.z0 + 0.8, Math.min(PLAY.z1 + 12, this.cBase.z)); this.cBase.y = Math.max(2.4, this.cBase.y);
    if (!this.floorOk(this.cBase)) this.cBase.y += 2.2;
  }
  /** show.ts camPose: the game's framing blended toward the duel's */
  cam(p: { base: THREE.Vector3; look: THREE.Vector3; fov: number }) {
    if (this.camK <= 0.001) return p;
    const e = this.camIn ? this.camK : this.camK * this.camK * (3 - 2 * this.camK), c = Math.min(1, e);
    p.base.lerp(this.cBase, e); p.look.lerp(this.cLook, c); p.fov += (this.cFov - p.fov) * c;
    return p;
  }

  // ---------------------------------------------------------------- the bot (smoke tests): mashes the clash, presses on the beat
  private botT = 0;
  bot(b: Btn, rdt: number) {
    this.botT += rdt;
    let on = false;
    if (this.pend) on = false;
    else if (this.mode === 'clash' && this.stage === 'run') on = Math.floor(this.botT / 0.045) % 2 === 0;
    else if (this.mode === 'chain' && this.stage === 'run') { const bt = this.beats[this.bi]; on = !!bt && !bt.pressed && Math.abs(this.ct - bt.T) < this.win * 0.5; }
    b.pressed = on && !b.down; b.down = on; b.held = on ? b.held + rdt : 0;
  }
  /** what a capture reads (__dh.qteStats()); toBeat = real s until the 连环's next blow lands (captures press on it) */
  get state() { const b = this.mode === 'chain' ? this.beats[this.bi] : null; return { mode: this.mode, stage: this.stage, m: +this.m.toFixed(3), t: +this.t.toFixed(3), beat: this.bi, beats: this.beats.length, toBeat: b && !b.pressed ? +(b.T - this.ct).toFixed(3) : null, camK: +this.camK.toFixed(3), stats: this.stats }; }
}
