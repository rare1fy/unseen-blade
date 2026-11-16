// KayKit cast (CC0, Kay Lousberg — packed by tools/kaykit_pack.mjs): 嗜血狂战 = Barbarian with a two-handed axe, 枯骨巫妖 = a scaled-up
// Skeleton Mage with a soul gem on its staff, the summons = Skeleton Minion / Warrior. All share KayKit's Rig_Medium, so they play the
// same clip set. Each character also carries a voxel twin bound to the same bones (look/voxel.ts); the look switch swaps them.
// Public surface matches the procedural actors the show was written against (attack / cast / lunge … returning Actions with .impact).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Actor } from './actor';
import { Action, curve } from './rig';
import { toon, glow } from '../look/toon';
import { voxelTwin, onLook } from '../look/voxel';
import { V3, R } from '../engine/world';
import { PADD, TILE } from '../engine/particles';
import heroUrl from '../../assets/models/kk_hero.glb?url';
import lichUrl from '../../assets/models/kk_lich.glb?url';
import minionUrl from '../../assets/models/kk_minion.glb?url';
import warriorUrl from '../../assets/models/kk_warrior.glb?url';
import animsUrl from '../../assets/models/kk_anims.glb?url';
import propsUrl from '../../assets/models/kk_props.glb?url';

type Gltf = { scene: THREE.Group; animations: THREE.AnimationClip[] };
/** the single-file build inlines models as data: URLs; decode them directly — the artifact sandbox blocks fetch() */
async function parse(url: string): Promise<Gltf> {
  let buf: ArrayBuffer;
  if (url.startsWith('data:')) { const bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); buf = u8.buffer; }
  else buf = await (await fetch(url)).arrayBuffer();
  return new Promise((res, rej) => new GLTFLoader().parse(buf, '', g => res(g as unknown as Gltf), rej));
}

export type CharKey = 'hero' | 'lich' | 'minion' | 'warrior';
export interface KKAssets { chars: Record<CharKey, THREE.Group>; clips: Map<string, THREE.AnimationClip>; props: Map<string, THREE.Object3D> }
/** voxel size per character, in model units (KayKit characters stand ~2.4 tall) */
const VOX: Record<CharKey, number> = { hero: 0.075, lich: 0.07, minion: 0.075, warrior: 0.075 };
const EYE = new THREE.Color(0x5affa0);

let cached: Promise<KKAssets> | null = null;
export function loadKK() {
  return (cached ||= (async () => {
    const [hero, lich, minion, warrior, anims, props] = await Promise.all([heroUrl, lichUrl, minionUrl, warriorUrl, animsUrl, propsUrl].map(parse));
    const chars = { hero: hero.scene, lich: lich.scene, minion: minion.scene, warrior: warrior.scene } as Record<CharKey, THREE.Group>;
    for (const [k, sc] of Object.entries(chars) as Array<[CharKey, THREE.Group]>) {
      sc.traverse(o => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const glowy = /glow/i.test((m.material as THREE.Material).name);
        m.material = glowy ? glow(k === 'hero' ? 0xffc070 : EYE, 3.2) : toon(0xffffff, { vertexColors: true, rim: 0.9, self: 0.28 });
        m.castShadow = !glowy; m.receiveShadow = false; m.frustumCulled = false; m.userData.glow = glowy;
      });
      voxelTwin(sc, VOX[k], { self: 0.28 });
    }
    const clips = new Map(anims.animations.map(c => [c.name, c]));
    const pm = new Map<string, THREE.Object3D>();
    for (const o of [...props.scene.children]) {
      o.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) { m.material = toon(0xffffff, { vertexColors: true, rim: 0.5 }); m.castShadow = true; m.receiveShadow = true; } });
      pm.set(o.name, o);
    }
    return { chars, clips, props: pm };
  })());
}

/** SkeletonUtils-style clone: every skinned mesh in the copy (smooth and voxel) is re-bound to the copied bones */
export function cloneSkinned(src: THREE.Object3D): THREE.Object3D {
  const map = new Map<THREE.Object3D, THREE.Object3D>(), clone = src.clone(true);
  const walk = (a: THREE.Object3D, b: THREE.Object3D) => { map.set(a, b); for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]); };
  walk(src, clone);
  const back = new Map<THREE.Object3D, THREE.Object3D>(); for (const [k, v] of map) back.set(v, k);
  clone.traverse(o => {
    const sm = o as THREE.SkinnedMesh; if (!sm.isSkinnedMesh) return;
    const orig = back.get(sm) as THREE.SkinnedMesh;
    sm.bind(new THREE.Skeleton(orig.skeleton.bones.map(b => map.get(b) as THREE.Bone), orig.skeleton.boneInverses), orig.bindMatrix);
  });
  return clone;
}

/** far end of a weapon (in its mesh's local space): along the longest axis, on the side away from the grip */
function tipOf(node: THREE.Object3D) {
  let mesh: THREE.Mesh | null = null; node.traverse(x => { if (!mesh && (x as THREE.Mesh).isMesh && !x.userData.vox) mesh = x as THREE.Mesh; });
  if (!mesh) return null;
  const m = mesh as THREE.Mesh; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox!, sz = bb.getSize(V3()), c = bb.getCenter(V3());
  const ax = sz.x > sz.y && sz.x > sz.z ? 'x' : sz.y > sz.z ? 'y' : 'z';
  c[ax] = Math.abs(bb.max[ax]) > Math.abs(bb.min[ax]) ? bb.max[ax] * 0.85 : bb.min[ax] * 0.85;
  return { mesh: m, local: c };
}

interface ClipSpec { name: string; speed?: number; at?: number; fade?: number }

/** shared machinery: cloned model, mixer, rest-pose reset, smooth/voxel swap, one-shot clips that resolve Actions */
export abstract class KKActor extends Actor {
  model: THREE.Object3D; mixer: THREE.AnimationMixer;
  protected acts = new Map<string, THREE.AnimationAction>(); protected cur: THREE.AnimationAction | null = null;
  protected bonesBy = new Map<string, THREE.Object3D>(); private rest: Array<[THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3]> = [];
  protected idleClip: ClipSpec = { name: 'Idle_A' };
  private offLook: () => void;

  constructor(kk: KKAssets, key: CharKey, readonly scale: number) {
    super();
    this.model = cloneSkinned(kk.chars[key]); this.model.scale.setScalar(scale); this.body.add(this.model);
    const meshes: THREE.Mesh[] = [];
    this.model.traverse(o => {
      if ((o as THREE.Bone).isBone) { this.bonesBy.set(o.name, o); this.rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); }
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    this.finish(meshes);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [n, c] of kk.clips) this.acts.set(n, this.mixer.clipAction(c));
    this.offLook = onLook(v => this.model.traverse(o => { if ((o as THREE.Mesh).isMesh) o.visible = !!o.userData.vox === v; }));
  }
  dispose() { this.offLook(); this.root.parent?.remove(this.root); }

  protected loop(c: ClipSpec, fade = 0.25) {
    const a = this.acts.get(c.name); if (!a) return;
    if (this.cur === a && a.loop === THREE.LoopRepeat && a.isRunning()) { a.timeScale = c.speed ?? 1; return; }
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = c.speed ?? 1; a.enabled = true; a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a) this.cur.crossFadeTo(a, fade, false); a.play(); this.cur = a;
  }
  /** play a clip once; returns an Action whose impact fires at `at` and done at the end (then back to the idle loop) */
  protected once(label: string, c: ClipSpec, data: Record<string, unknown> = {}, o: { hold?: boolean; dur?: number } = {}) {
    const a = this.acts.get(c.name), speed = c.speed ?? 1;
    const dur = o.dur ?? (a ? a.getClip().duration / speed : 0.6);
    if (a) {
      a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = a.getClip().duration / dur; a.enabled = true; a.setEffectiveWeight(1);
      if (this.cur && this.cur !== a) this.cur.crossFadeTo(a, c.fade ?? 0.12, false); a.play(); this.cur = a;
    }
    const act = this.play(new Action(label, dur, c.at ?? 0.5, data));
    if (!o.hold) act.done.then(() => { if ((this.act === null || this.act === act) && !this.dead) this.loop(this.idle(), 0.22); });
    return act;
  }
  protected idle(): ClipSpec { return this.idleClip; }

  bonePos(name: string, x = 0, y = 0, z = 0) {
    const map: Record<string, string> = { head: 'head', chest: 'chest', handL: 'handl', handR: 'handr', weapon: 'handslotr' };
    const b = this.bonesBy.get(map[name] || name); return b ? b.localToWorld(V3(x, y, z)) : this.local(0, this.height * 0.6, 0);
  }
  head() { return this.bonePos('head', 0, 0.75, 0); }
  chest() { return this.bonePos('chest', 0, 0.2, 0); }

  protected abstract extra(dt: number): void;
  protected pose(dt: number) {
    for (const [o, p, q, s] of this.rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
    this.mixer.update(dt);
    this.off.set(0, 0, 0);
    this.extra(dt);
  }
}

// ------------------------------------------------------------------ 嗜血狂战
export class KHero extends KKActor {
  readonly height = 2.25;
  aim = 0; breath = 1; running = false;
  private axe: ReturnType<typeof tipOf>;
  constructor(kk: KKAssets) {
    super(kk, 'hero', 0.95);
    this.idleClip = { name: 'Melee_2H_Idle' };
    let w: THREE.Object3D | null = null; this.model.traverse(o => { if (!w && o.name.startsWith('W_')) w = o; }); this.axe = w ? tipOf(w) : null;
    this.loop(this.idleClip);
  }
  protected idle(): ClipSpec { return this.running ? { name: 'Running_A', speed: 1.1 } : { name: 'Melee_2H_Idle', speed: this.breath }; }
  setRunning(on: boolean) { this.running = on; this.loop(this.idle(), 0.2); }
  weapon() { return this.axe ? this.axe.mesh.localToWorld(this.axe.local.clone()) : this.bonePos('weapon'); }
  attack(dist: number) { return this.once('attack', { name: 'Melee_2H_Attack_Chop', at: 0.42 }, { dist }, { dur: 0.95 }); }
  spin(dist: number) { return this.once('spin', { name: 'Melee_2H_Attack_Spin', at: 0.5 }, { dist }, { dur: 1.25 }); }
  toss() { return this.once('toss', { name: 'Throw', at: 0.42 }, {}, { dur: 0.8 }); }
  hurt(power = 1) { this.hit(power); return this.once('hurt', { name: 'Hit_A', at: 0.1 }, { power }, { dur: 0.55 }); }
  block() { return this.once('block', { name: 'Melee_Block', at: 0.3 }, {}, { dur: 0.8 }); }
  cheer() { return this.once('cheer', { name: 'Cheering', at: 0.3 }, {}, { dur: 1.8 }); }
  bleed() { return this.once('bleed', { name: 'Hit_B', at: 0.35 }, {}, { dur: 0.75 }); }
  fall() { this.dead = true; return this.once('fall', { name: 'Death_A', at: 0.6 }, {}, { hold: true, dur: 1.1 }); }
  protected extra() {
    const a = this.act, k = a ? a.k : 0;
    if (this.cur === this.acts.get('Melee_2H_Idle')) this.cur!.timeScale = this.breath;
    if (!a) return;
    if (a.name === 'attack') {   // leap in on the wind-up, land the chop, step back
      const d = (a.data.dist as number) || 0;
      this.off.z = curve(k, [[0, 0], [0.22, -0.15], [0.42, d], [0.72, d], [1, 0]]); this.off.y = curve(k, [[0, 0], [0.24, 0], [0.33, 0.45], [0.42, 0], [1, 0]]);
    } else if (a.name === 'spin') { const d = (a.data.dist as number) || 0; this.off.z = curve(k, [[0, 0], [0.25, -0.1], [0.5, d], [0.8, d], [1, 0]]); }
    else if (a.name === 'hurt') this.off.z = -0.3 * curve(k, [[0, 0], [0.12, 1], [1, 0]]) * Math.min(1.5, (a.data.power as number) || 1);
  }
}

// ------------------------------------------------------------------ 枯骨巫妖
export class KLich extends KKActor {
  readonly height = 3.6;
  robeFire = 0; gem: THREE.Mesh; wisps: THREE.Mesh[] = []; private staff: ReturnType<typeof tipOf>; private hover = 0.3;
  constructor(kk: KKAssets) {
    super(kk, 'lich', 1.42);
    this.idleClip = { name: 'Idle_B', speed: 0.8 };
    let w: THREE.Object3D | null = null; this.model.traverse(o => { if (!w && o.name.startsWith('W_')) w = o; }); this.staff = w ? tipOf(w) : null;
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glow(0x4affa0, 3.4));
    if (this.staff) { this.staff.mesh.add(this.gem); this.gem.position.copy(this.staff.local).multiplyScalar(1.12); } else this.root.add(this.gem);
    const wm = glow(0x7affc0, 2.6);
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), wm); this.root.add(s); this.wisps.push(s); }
    this.loop(this.idleClip);
  }
  weapon() { return this.gem.getWorldPosition(V3()); }
  cast() { return this.once('cast', { name: 'Ranged_Magic_Shoot', at: 0.5 }, {}, { dur: 0.95 }); }
  summon() { return this.once('summon', { name: 'Ranged_Magic_Summon', at: 0.55 }, {}, { dur: 1.6 }); }
  shield() { return this.once('shield', { name: 'Melee_Block', at: 0.4 }, {}, { dur: 0.9 }); }
  hurt(power = 1) { this.hit(power); return this.once('hurt', { name: 'Hit_A', at: 0.1 }, { power }, { dur: 0.6 }); }
  roar() { return this.once('roar', { name: 'Skeletons_Taunt', at: 0.35 }, {}, { dur: 1.5 }); }
  talk(dur = 1.6) { return this.once('talk', { name: 'Ranged_Magic_Raise', at: 0.5, fade: 0.3 }, {}, { dur: Math.max(1.2, dur) }); }
  collapse() { this.dead = true; return this.once('collapse', { name: 'Skeletons_Death', at: 0.5 }, {}, { hold: true, dur: 2.0 }); }
  protected extra(dt: number) {
    const t = this.t, a = this.act, k = a ? a.k : 0;
    // hovers over its altar; sinks as it dies
    this.off.y = this.dead ? this.hover * (1 - Math.min(1, k * 2)) : this.hover + Math.sin(t * 1.3) * 0.08;
    if (a?.name === 'hurt') this.off.z = -0.3 * curve(k, [[0, 0], [0.12, 1], [1, 0]]) * Math.min(1.6, (a.data.power as number) || 1);
    if (a?.name === 'summon' || a?.name === 'roar') this.off.y += 0.35 * curve(k, [[0, 0], [0.4, 1], [0.8, 1], [1, 0]]);
    this.gem.rotation.y += dt * 1.5; this.gem.rotation.x += dt * 0.7;
    const up = a?.name === 'cast' ? curve(k, [[0, 0], [0.45, 1], [0.6, 0.6], [1, 0]]) : 0;
    this.gem.scale.setScalar(1 + Math.sin(t * 4) * 0.08 + this.lowHp * 0.25 + up * 0.7);
    this.wisps.forEach((w, i) => { const ang = t * (0.8 + i * 0.15) + (i / this.wisps.length) * Math.PI * 2, r = 1.5 + Math.sin(t + i) * 0.2; w.position.set(Math.cos(ang) * r, 1.6 + Math.sin(t * 1.7 + i * 2) * 0.6 + this.off.y, Math.sin(ang) * r); w.visible = !this.dead; });
    // second phase: the robe smoulders with soul fire
    for (const f of this.flashMats) f.base.setRGB(0.05 * this.robeFire, (0.32 + 0.1 * Math.sin(t * 11)) * this.robeFire, 0.16 * this.robeFire);
    if (this.robeFire > 0.05 && !this.dead && Math.random() < dt * 30 * this.robeFire) {
      const p = this.chest().add(V3(R(-0.7, 0.7), R(-1.6, 0.6), R(-0.5, 0.5)));
      PADD.emit({ p, v: V3(R(-0.2, 0.2), R(1, 2.2), R(-0.2, 0.2)), s0: 0.16, s1: 0.02, life: R(0.4, 0.8), c0: new THREE.Color(0xc0ffd8), c1: new THREE.Color(0x2aff8a), bright: 2.6, tile: TILE.glow });
    }
  }
}

// ------------------------------------------------------------------ summoned skeletons (食尸鬼 in the rules)
export class KGhoul extends KKActor {
  readonly height = 1.9;
  walkK = 0; private walking = false;
  constructor(kk: KKAssets, variant: 'minion' | 'warrior') {
    super(kk, variant, 0.8);
    this.idleClip = { name: 'Skeletons_Idle', speed: 1.2 };
    this.loop(this.idleClip);
  }
  protected idle(): ClipSpec { return this.walkK > 0 ? { name: 'Skeletons_Walking', speed: 1.6 } : this.idleClip; }
  weapon() { return this.bonePos('weapon'); }
  rise() { return this.once('rise', { name: 'Skeletons_Awaken_Floor', at: 0.7, fade: 0.01 }, {}, { dur: 1.5 }); }
  lunge(dist: number) { return this.once('lunge', { name: 'Melee_1H_Attack_Jump_Chop', at: 0.52 }, { dist }, { dur: 0.95 }); }
  hurt(power = 1) { this.hit(power); return this.once('hurt', { name: 'Hit_A', at: 0.1 }, { power }, { dur: 0.5 }); }
  shriek() { return this.once('shriek', { name: 'Skeletons_Taunt', at: 0.4 }, {}, { dur: 1.0 }); }
  die() { this.dead = true; return this.once('die', { name: 'Skeletons_Death', at: 0.5 }, {}, { hold: true, dur: 1.3 }); }
  protected extra() {
    if ((this.walkK > 0) !== this.walking && !this.act) { this.walking = this.walkK > 0; this.loop(this.idle(), 0.15); }
    const a = this.act, k = a ? a.k : 0; if (!a) return;
    if (a.name === 'lunge') { const d = (a.data.dist as number) || 0; this.off.z = curve(k, [[0, 0], [0.25, -0.2], [0.5, d], [0.75, d], [1, 0]]); }
    else if (a.name === 'hurt') this.off.z = -0.4 * curve(k, [[0, 0], [0.12, 1], [1, 0]]) * Math.min(1.5, (a.data.power as number) || 1);
  }
}

/** the cast the show asks for: one hero, one lich, summons alternating minion / warrior */
export function kkCast(kk: KKAssets) {
  return { hero: () => new KHero(kk), lich: () => new KLich(kk), ghoul: (n: number) => new KGhoul(kk, n % 2 ? 'warrior' : 'minion') };
}
