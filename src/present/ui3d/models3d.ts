// R5 thick 3D models for the UI layer (and the world): skill icons, relics, the shared relic pedestal and the pattern badges.
// Every model is a Model3D (a THREE.Group): centred on its bounding box, x right, y up, front = +z (toward the UI camera), sized so
// max(width, height) = 1 unit — scale it to pixels with `m.scale.setScalar(L.px(sizePx))`. The meshes hang on `m.pivot`, so idle /
// spin animation (m.idle) never fights the caller's own transform. Each instance owns its materials: setDim() greys it out (cooldown,
// unusable), setGlow() drives its emissive cells (they bloom on the UI layer). Geometry is built once per model and shared.
//   skillIcon3D('冰锥' | 'm3_same' | 'ice')   relicModel3D('贪婪之手' | 'greedy_hand' | 'hand')   relicPedestal3D()   patternBadge3D('同点' | 'same')
import * as THREE from 'three';
import { VoxChar, voxToon } from '../look/voxkit';
import { octPrism, flat } from './vox';
import { SKILL_ART, RELIC_ART, BADGE_ART, type Set3 } from './models3dArt';
import { makeCanvas } from '../../platform/index';

// ---------------------------------------------------------------- names
/** skill name / row id / art key → art key. Tier-3 forms: 冰环 铁壁 血战 影舞 (UPGRADE maps the base name to its tier-3 form). */
const SKILL_KEY: Record<string, string> = {
  奥术弹: 'arcane', 冰锥: 'ice', 冰环: 'iceRing', 闪电链: 'bolt', 陨石: 'meteor',
  劈砍: 'axe', 顺劈斩: 'cleave', 顺劈: 'cleave', 盾墙: 'shield', 铁壁: 'wall', 狂血: 'blood', 血战: 'bloodWar',
  袖箭: 'dart', 背刺: 'backstab', 影步: 'step', 毒雾: 'fog', 影舞: 'dance',
  m3_same: 'ice', m3_straight: 'bolt', m3_array: 'meteor', w3_same: 'cleave', w3_straight: 'shield', w3_array: 'blood',
  r3_same: 'backstab', r3_straight: 'step', r3_array: 'fog', mage_basic: 'arcane', warrior_basic: 'axe', rogue_basic: 'dart',
};
/** tier-3 (质变) form of a skill icon, by art key or name: 冰锥 → 冰环, 盾墙 → 铁壁, 狂血 → 血战, 毒雾 → 影舞 */
export const UPGRADE: Record<string, string> = { ice: 'iceRing', shield: 'wall', blood: 'bloodWar', fog: 'dance', 冰锥: '冰环', 盾墙: '铁壁', 狂血: '血战', 毒雾: '影舞' };
const RELIC_KEY: Record<string, string> = { 贪婪之手: 'hand', greedy_hand: 'hand', 铁壁护符: 'charm', iron_charm: 'charm', 战场急救: 'kit', field_aid: 'kit' };
const BADGE_KEY: Record<string, string> = { 散骰: 'single', loose: 'single', any: 'single', 同点: 'pair', same: 'pair', 连环: 'straight', 顺子: 'straight', 阵列: 'array' };
export const SKILL_ICONS = Object.keys(SKILL_ART), RELIC_MODELS = Object.keys(RELIC_ART), BADGES = Object.keys(BADGE_ART);
const keyOf = (map: Record<string, string>, art: Record<string, unknown>, name: string) => (art[name] ? name : map[name]) ?? null;

// ---------------------------------------------------------------- the model object
export class Model3D extends THREE.Group {
  /** the meshes hang here (idle animation moves the pivot, never the root) */
  readonly pivot = new THREE.Group();
  /** normalised bounding box [w, h, d] (max(w, h) = 1) */
  size: [number, number, number] = [1, 1, 1];
  /** per-instance materials: lit (dimmed by setDim) and glowing (setGlow) */
  readonly lit: Array<{ m: THREE.MeshToonMaterial; base: THREE.Color }> = []; readonly glows: Array<{ m: THREE.MeshBasicMaterial; base: THREE.Color }> = [];
  /** register a lit material (its current colour is the authored one) */
  addLit(...ms: THREE.Material[]) { for (const m of ms) this.lit.push({ m: m as THREE.MeshToonMaterial, base: (m as THREE.MeshToonMaterial).color.clone() }); }
  private dim = 0; private glowK = 1;
  constructor(readonly kind: string) { super(); this.add(this.pivot); this.name = kind; }
  /** 0 = normal … 1 = dark (cooldown / used up / unaffordable) */
  setDim(k: number) { this.dim = Math.max(0, Math.min(1, k)); this.apply(); return this; }
  /** emissive multiplier (1 = authored; ~1.6 active, ~2.2 tier 3; 0 = glow off) */
  setGlow(k: number) { this.glowK = Math.max(0, k); this.apply(); return this; }
  private apply() {
    const lk = 1 - 0.62 * this.dim, gk = this.glowK * (1 - 0.85 * this.dim);
    for (const l of this.lit) l.m.color.copy(l.base).multiply(TMP.setRGB(lk, lk, lk * (1 + 0.08 * this.dim)));
    for (const g of this.glows) g.m.color.copy(g.base).multiplyScalar(gk);
  }
  /** a gentle idle: bob (± amp units, ~2 s) and a slow yaw sway (± yaw rad), phase-shifted per instance */
  idle(time: number, amp = 0.02, yaw = 0.22) {
    const ph = (this.id * 0.618) % 6.28;
    this.pivot.position.y = Math.sin(time * Math.PI + ph) * amp; this.pivot.rotation.y = Math.sin(time * 0.6 + ph) * yaw;
  }
  dispose() { for (const l of this.lit) l.m.dispose(); for (const g of this.glows) g.m.dispose(); this.parent?.remove(this); }
}
const TMP = new THREE.Color();

// ---------------------------------------------------------------- voxel templates (built once, normalised)
interface Tpl { solid: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null; size: [number, number, number] }
const tpls = new Map<string, Tpl>();
const SOLID = voxToon({ rim: 0.3, self: 0.05, edge: 0.2 });
/** authored brightness of glowing cells: below the UI bloom threshold for coloured cells, white-hot cores just bloom; setGlow(1.6+) makes them shine */
const GLOW_K = 1.25;

function template(key: string, art: (set: Set3) => void): Tpl {
  const hit = tpls.get(key); if (hit) return hit;
  const v = new VoxChar(1); art((x, y, z, c, g = 0) => v.set(x, y, z, c, g));
  const { root } = v.build({ jitter: 0, glow: GLOW_K, rim: 0.3, self: 0.05, edge: 0.2 });
  const solid: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
  root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) (/_glow$/.test(m.name) ? glow : solid).push(m.geometry); });
  const bb = new THREE.Box3(); for (const g of [...solid, ...glow]) { g.computeBoundingBox(); bb.union(g.boundingBox!); }
  const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3()), k = 1 / Math.max(s.x, s.y, 1e-6);
  for (const g of [...solid, ...glow]) { g.translate(-c.x, -c.y, -c.z); g.scale(k, k, k); g.computeBoundingSphere(); }
  const t: Tpl = { solid: solid[0] ?? null, glow: glow[0] ?? null, size: [s.x * k, s.y * k, s.z * k] };
  tpls.set(key, t); return t;
}
/** a private copy of a shared shader material (clone() drops onBeforeCompile; the program stays shared through the cache key) */
function own<M extends THREE.Material>(src: M): M {
  const m = src.clone() as M; m.onBeforeCompile = src.onBeforeCompile; m.customProgramCacheKey = src.customProgramCacheKey.bind(src);
  (m as unknown as { flatShading: boolean }).flatShading = (src as unknown as { flatShading: boolean }).flatShading; return m;
}
function instance(kind: string, t: Tpl, into = new Model3D(kind)) {
  if (t.solid) { const mat = own(SOLID); const m = new THREE.Mesh(t.solid, mat); into.pivot.add(m); into.addLit(mat); }
  if (t.glow) { const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(GLOW_K, GLOW_K, GLOW_K), vertexColors: true, toneMapped: false }); into.pivot.add(new THREE.Mesh(t.glow, mat)); into.glows.push({ m: mat, base: mat.color.clone() }); }
  into.size = [...t.size] as [number, number, number];
  return into;
}

// ---------------------------------------------------------------- public API
/** A skill icon as a thick voxel model. name: Chinese skill name, v3 row id or art key (SKILL_ICONS); unknown names → 奥术弹.
 *  o.tier3: use the tier-3 form when the skill has one (冰锥 → 冰环 …). */
export function skillIcon3D(name: string, o: { tier3?: boolean } = {}): Model3D {
  let key = keyOf(SKILL_KEY, SKILL_ART, name) ?? 'arcane';
  if (o.tier3 && UPGRADE[key]) key = UPGRADE[key];
  return instance(key, template('s:' + key, SKILL_ART[key]));
}

/** A relic as a thick voxel model (贪婪之手 / 铁壁护符 / 战场急救, or relic id / art key); unknown → a gold-rimmed shard. */
export function relicModel3D(name: string): Model3D {
  const key = keyOf(RELIC_KEY, RELIC_ART, name);
  if (key) return instance(key, template('r:' + key, RELIC_ART[key]));
  return instance('relic', template('r:?', set => { for (let y = -5; y <= 5; y++) for (let x = -3; x <= 2; x++) for (let z = -1; z <= 1; z++) set(x, y, z, Math.abs(y) === 5 || x === -3 || x === 2 ? 0xd89a22 : 0x8a52e0, Math.abs(y) < 5 && x > -3 && x < 2 && z === 1 ? 1 : 0); }));
}

/** The pedestal every relic stands on: a round stone dais with a brass band and a rune ring on its top (lit by setActive).
 *  Built pitched toward the viewer (its top shows). `seat` is where the relic hovers (upright, add the relic to it or copy its
 *  position); diameter = 1 unit. */
export class Pedestal3D extends Model3D {
  readonly seat = new THREE.Object3D();
  private rune: THREE.MeshBasicMaterial; private band: THREE.MeshToonMaterial; private act = 0;
  constructor() {
    super('pedestal');
    const tilt = new THREE.Group(); tilt.rotation.x = 0.5; this.pivot.add(tilt);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; tilt.add(m); return m; };
    const stoneD = own(flat(0x2c2838)), stone = own(flat(0x413c50)), top = own(flat(0x5e586c)); this.band = own(flat(0x9a7030, { emissive: 0x000000 })) as THREE.MeshToonMaterial;
    this.addLit(stoneD, stone, top, this.band);
    mk(new THREE.CylinderGeometry(0.47, 0.5, 0.1, 16, 1).toNonIndexed(), stoneD, -0.13);
    mk(new THREE.CylinderGeometry(0.44, 0.47, 0.12, 16, 1).toNonIndexed(), stone, -0.02);
    mk(new THREE.CylinderGeometry(0.465, 0.465, 0.035, 16, 1).toNonIndexed(), this.band, 0.055);
    mk(new THREE.CylinderGeometry(0.4, 0.43, 0.05, 16, 1).toNonIndexed(), top, 0.1);
    this.rune = new THREE.MeshBasicMaterial({ color: 0xffc860, toneMapped: false, transparent: true, opacity: 0.35 });
    const r = mk(new THREE.RingGeometry(0.26, 0.31, 32), this.rune, 0.128); r.rotation.x = -Math.PI / 2;
    this.glows.push({ m: this.rune, base: new THREE.Color(0xffc860) });
    // the seat: above the top centre, in the un-pitched frame (models on it stand upright)
    this.seat.position.set(0, 0.15, 0.06); this.add(this.seat);
    this.size = [1, 0.5, 1];
  }
  /** 0 idle … 1 triggered: the rune ring and brass band light up (bloom) */
  setActive(k: number) {
    this.act = Math.max(0, Math.min(1, k));
    this.rune.opacity = 0.35 + 0.65 * this.act; this.rune.color.setHex(0xffc860).multiplyScalar(1 + 2.2 * this.act);
    this.band.emissive.setHex(0xffb040); this.band.emissiveIntensity = 0.9 * this.act;
    return this;
  }
}
export function relicPedestal3D(): Pedestal3D { return new Pedestal3D(); }

/** A pattern badge (散骰 / 同点 / 连环 / 阵列, or single / pair / straight / array): a thick octagonal plaque, dark stone with a brass
 *  rim, carrying a raised white dice motif. width = 1 unit. */
export function patternBadge3D(kind: string, o: { rim?: number } = {}): Model3D {
  const key = keyOf(BADGE_KEY, BADGE_ART, kind) ?? 'single', m = new Model3D('badge:' + key);
  const rimM = own(flat(o.rim ?? 0xc8963a)), faceM = own(flat(0x2a2634)); m.addLit(rimM, faceM);
  const rim = new THREE.Mesh(octPrism(0.5, 0.16, 0.47), rimM); rim.position.z = -0.04; m.pivot.add(rim);
  const face = new THREE.Mesh(octPrism(0.42, 0.06, 0.4), faceM); face.position.z = 0.06; m.pivot.add(face);
  const icon = instance(key, template('b:' + key, BADGE_ART[key]));
  icon.scale.setScalar(0.62); icon.position.z = 0.1 + icon.size[2] * 0.31; m.pivot.add(icon);
  m.lit.push(...icon.lit); m.glows.push(...icon.glows);
  m.size = [1, 1, 0.3];
  return m;
}

/** A soft round contact shadow (flat, facing +z) for icons hovering over a plate: put it on the plate, scale with the hover height. */
export function shadowDisc3D(opacity = 0.45): THREE.Mesh {
  const c = makeCanvas(64, 64), g = c.getContext('2d') as CanvasRenderingContext2D;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity, depthWrite: false }));
}
