// Stage manager: builds one chapter scene at a time (voxel geometry + its lights, fog, sky, mist, flames, water, runes) and tears
// it down when another is shown. Global lights are shared and re-tinted per scene. Returns an Env-compatible handle (phase2).
import * as THREE from 'three';
import { scene, camera, V3, onUpdate, canvasTex } from '../engine/world';
import { clock } from '../engine/clock';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import { glow } from '../look/toon';
import { toon } from '../look/toon';
import { buildSky, noiseTex, runeTex } from '../look/env';
import { AREA } from './props';
import { GRADE } from '../look/post';
import { Cards, ambientTick, shaft, type Ambient } from './cards';
import { quietBattleGlow } from './battleGlow';

export interface Mood {
  sky: boolean; bg: number; fog: number; fogD: number; hemiSky: number; hemiGround: number; hemiI: number; moon: number; moonI: number; key: number; keyI: number;
  /** the flat ground beyond the built stage */
  earth: number[]; mist?: number; mistA?: number;
  /** optional sky gradient (zenith / middle / horizon) and sun-or-moon disc direction; unset = the chapter-1 night sky */
  skyTop?: number; skyMid?: number; skyHor?: number; skyDisc?: [number, number, number]; skyDiscCol?: [number, number, number];
  /** optional frame exposure (default 1.6, tuned for the chapter-1 night) */
  exposure?: number;
  /** optional bloom threshold for this scene (bright snow or noon light must not bloom; only real glows should) */
  bloomT?: number;
  /** optional strength of glowing cells (default 2.6; the battle uses 1.35) */
  glowK?: number;
  /** optional position of the shadow-casting directional light (default [-6, 14, -10]) */
  moonPos?: [number, number, number];
}
export interface Ctx {
  w: VoxWorld;
  light(p: [number, number, number], color: number, intensity?: number, dist?: number): void;
  flame(p: [number, number, number], color: number, size?: number): void;
  water(x0: number, z0: number, x1: number, z1: number, color: number): void;
  rune(x: number, y: number, z: number, r: number): void;
  onPhase(f: (k: number) => void): void;
  /** add a ready-made object (e.g. a prebuilt voxel arena mesh) to the stage */
  add(o: THREE.Object3D): void;
  /** dressing cards (grass, vines, webs, decals) collected during build, instanced after it */
  cards: Cards;
  /** the cutaway layer: roofs, ceilings, front walls and the near tops of side walls — everything that would stand between the
   *  camera and the room. Built like w (same cells, same look), but the camera hides it while it looks into the room from above
   *  (every battle view) and shows it again from far away or from below the eaves (exterior shots). Nothing here casts shadow
   *  into the room while hidden. */
  cut: VoxWorld;
  /** the eaves height (metres) of the cutaway: below it the camera is "inside" and the roof stays visible (default 3.5) */
  cutEaves(h: number): void;
  /** drifting ambient particles while this stage is up */
  ambient(a: Ambient): void;
  /** a soft light shaft from above */
  shaft(x: number, z: number, o?: { w?: number; h?: number; color?: number; tilt?: number; yaw?: number; a?: number }): void;
}
export interface SceneDef { id: string; name: string; group: '普通' | '首领' | '节点'; kind: '户外' | '室内' | '地牢' | '洞穴'; blurb: string; mood: Mood; build(c: Ctx): void; foes?: string[] }

// ------------------------------------------------------------------ shared lights, sky and mist (created once)
let G: { hemi: THREE.HemisphereLight; moon: THREE.DirectionalLight; key: THREE.DirectionalLight; sky: THREE.Mesh; skyMat: THREE.ShaderMaterial; mist: THREE.Mesh[] } | null = null;
function globals() {
  if (G) return G;
  const hemi = new THREE.HemisphereLight(0x5a6098, 0x1a1418, 0.95); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb8c4ff, 2.6); moon.position.set(-6, 14, -10); moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -13, right: 13, top: 14, bottom: -12, near: 1, far: 50 }); moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.02;
  scene.add(moon); scene.add(moon.target);
  const key = new THREE.DirectionalLight(0xffd2a8, 0.9); key.position.set(5, 8, 10); scene.add(key);
  const skyMat = buildSky(), sky = scene.children.find(o => (o as THREE.Mesh).material === skyMat) as THREE.Mesh;
  const nt = noiseTex(), mist: THREE.Mesh[] = [];
  // the ground mist thins out over the battle floor and thickens toward the edges (fog frames the stage without hazing the fight)
  const clearCentre = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32 + 64 * (2 / 44), 0, 32, 32 + 64 * (2 / 44), 32); gr.addColorStop(0, '#404040'); gr.addColorStop(0.24, '#404040'); gr.addColorStop(0.55, '#ffffff'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({ map: nt.clone(), alphaMap: clearCentre, color: 0x5a5c8c, transparent: true, opacity: 0.08, depthWrite: false, fog: true });
    (m.map as THREE.Texture).wrapS = (m.map as THREE.Texture).wrapT = THREE.RepeatWrapping; (m.map as THREE.Texture).repeat.set(2 + i, 2 + i); (m.map as THREE.Texture).needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), m); p.rotation.x = -Math.PI / 2; p.position.set(0, 0.2 + i * 0.25, -2); p.renderOrder = 3; scene.add(p); mist.push(p);
  }
  onUpdate((_dt, rdt) => mist.forEach((p, i) => { const map = (p.material as THREE.MeshBasicMaterial).map!; map.offset.x += rdt * (0.006 + i * 0.003); map.offset.y += rdt * 0.003 * (i % 2 ? 1 : -1); }));
  return (G = { hemi, moon, key, sky, skyMat, mist });
}

function earthTex(cols: number[]) {
  const S = 64, c = cols.map(x => '#' + new THREE.Color(x).getHexString());
  const t = canvasTex(S, S, g => { for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 8) { const r = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1; g.fillStyle = c[r < 0.6 ? 0 : r < 0.85 ? 1 % c.length : 2 % c.length]; g.fillRect(x, y, 8, 8); } });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.repeat.set(140 / (64 * CELL), 140 / (64 * CELL));
  return t;
}

export interface Stage {
  def: SceneDef; root: THREE.Group; phase2(k: number): void; dispose(): void;
  /** the stage's own point lights (scene transitions fade them) and a multiplier on all of them (1 = as built) */
  lights: THREE.Light[]; dim: number;
}
/** scene transitions (scenes/transition.ts): hold = keep the shown stage alive when the next one is built (the transition disposes
 *  it when it is done with it); built = called with every new stage right after it is built, before its first frame */
export const STAGE_HOOK: { hold: boolean; held: Stage[]; built: ((st: Stage) => void) | null } = { hold: false, held: [], built: null };
/** chunk = cells per voxel-wave column (scenes/transVox.ts sets it under ?trans=vox; 0 = plain greedy merging) */
export const STAGE_OPTS = { chunk: 0 };
/** the stage on show */
export const currentStage = (): Stage | null => current;
/** the shared mood (sky, fog, light colours, mist): a scene sets it when it is shown; transitions blend between two of them */
export function applyMood(md: Mood, to?: Mood, k = 0) {
  const g = globals(), c = new THREE.Color(), m = (a: number, b: number | undefined) => (to && b != null ? c.set(a).lerp(new THREE.Color(b), k) : c.set(a));
  const n = (a: number, b: number | undefined) => (to && b != null ? a + (b - a) * k : a);
  scene.background = (scene.background as THREE.Color | null)?.isColor ? (scene.background as THREE.Color).copy(m(md.bg, to?.bg)) : m(md.bg, to?.bg).clone();
  const f = scene.fog as THREE.FogExp2 | null;
  if (f?.isFogExp2) { f.color.copy(m(md.fog, to?.fog)); f.density = n(md.fogD, to?.fogD); } else scene.fog = new THREE.FogExp2(m(md.fog, to?.fog).getHex(), n(md.fogD, to?.fogD));
  g.sky.visible = to ? (k < 0.5 ? md.sky : to.sky) : md.sky;
  g.hemi.color.copy(m(md.hemiSky, to?.hemiSky)); g.hemi.groundColor.copy(m(md.hemiGround, to?.hemiGround)); g.hemi.intensity = n(md.hemiI, to?.hemiI);
  g.moon.color.copy(m(md.moon, to?.moon)); g.moon.intensity = n(md.moonI, to?.moonI); g.key.color.copy(m(md.key, to?.key)); g.key.intensity = n(md.keyI, to?.keyI);
  (g.skyMat.uniforms.uTint.value as THREE.Color).setRGB(1, 1, 1);
  for (const p of g.mist) { const mm = p.material as THREE.MeshBasicMaterial; mm.color.copy(m(md.mist ?? 0x5a5c8c, to ? to.mist ?? 0x5a5c8c : undefined)); mm.opacity = n(md.mistA ?? 0.08, to ? to.mistA ?? 0.08 : undefined); }
  // kyoto: optional sky gradient, sun / moon disc and the shadow light's position (unset = the chapter-1 night sky)
  const u = g.skyMat.uniforms, D = { top: 0x0a0a1e, mid: 0x26204a, hor: 0x5a4a78 };
  (u.uTop.value as THREE.Color).copy(m(md.skyTop ?? D.top, to ? to.skyTop ?? D.top : undefined));
  (u.uMid.value as THREE.Color).copy(m(md.skyMid ?? D.mid, to ? to.skyMid ?? D.mid : undefined));
  (u.uHor.value as THREE.Color).copy(m(md.skyHor ?? D.hor, to ? to.skyHor ?? D.hor : undefined));
  const v3 = (a: [number, number, number], b: [number, number, number] | undefined) => (to && b ? [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * k) as [number, number, number] : a);
  const DISC: [number, number, number] = [-0.25, 0.42, -1], DCOL: [number, number, number] = [1.2, 1.15, 1.3], MOON: [number, number, number] = [-6, 14, -10];
  (u.uMoonDir.value as THREE.Vector3).set(...v3(md.skyDisc ?? DISC, to ? to.skyDisc ?? DISC : undefined)).normalize();
  (u.uMoonCol.value as THREE.Color).setRGB(...v3(md.skyDiscCol ?? DCOL, to ? to.skyDiscCol ?? DCOL : undefined));
  g.moon.position.set(...v3(md.moonPos ?? MOON, to ? to.moonPos ?? MOON : undefined));
}
/** the shared sky dome's material (transitions tint it toward the fog) */
export const skyMaterial = () => globals().skyMat;
/** how the cutaway layer behaves: 'auto' = the camera decides, 'show' / 'hide' = forced (scene browser toggle) */
export const CUT = { mode: 'auto' as 'auto' | 'show' | 'hide', far: 30, focus: V3(0, 0, -3) };

let current: Stage | null = null;
export function showStage(def: SceneDef, options: { combat?: boolean } = {}): Stage {
  if (STAGE_HOOK.hold && current) { STAGE_HOOK.held.push(current); current = null; } else current?.dispose();
  const g = globals(), root = new THREE.Group(); scene.add(root);
  // the night is dark in colour, not in exposure: lift the whole frame and ease the vignette so characters and props read
  GRADE.exposure = def.mood.exposure ?? 1.6; GRADE.vig = 0.32;
  if (def.mood.bloomT != null) GRADE.bloomThreshold = def.mood.bloomT;
  const md = def.mood, lights: THREE.Light[] = [], flames: Array<{ m: THREE.Mesh; l?: THREE.PointLight; base: number; s: number }> = [], phase: Array<(k: number) => void> = [];
  // mood: sky or void, fog, light colours
  applyMood(md);
  // the ground beyond the stage
  const earth = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), toon(0xffffff, { map: earthTex(md.earth) })); earth.rotation.x = -Math.PI / 2; earth.position.y = -2 * CELL; earth.receiveShadow = true; earth.userData.earth = true; root.add(earth);
  const w = new VoxWorld(CELL), cut = new VoxWorld(CELL), cards = new Cards(), amb: Ambient[] = [], cutRoot = new THREE.Group(); let eaves = 3.5;
  root.add(cutRoot);
  const ctx: Ctx = {
    cards, cut,
    cutEaves(h) { eaves = h; },
    ambient(a) {
      // FIX6 §5: in a fight the cyan fireflies stay up the path (never over the HUD band) and turn a pale warm green, dimmer
      if (options.combat && a.kind === 'fireflies') { const ar = a.area ?? { x0: -9, z0: -11, x1: 9, z1: 6 }; a = { ...a, color: 0xb8d89a, rate: a.rate * 0.6, area: { ...ar, z1: Math.min(ar.z1, -0.5) } }; }
      amb.push(a);
    },
    shaft(x, z, o) { shaft(root, x, z, { color: md.moon, ...o }); },
    w,
    light(p, color, intensity = 5, dist = 7) {
      const cyan = ((color>>>8)&255) > ((color>>>16)&255)*1.2 && (color&255) > ((color>>>16)&255)*1.2;
      if(options.combat && cyan) { if(p[2]>-0.5 || (p[0]>4 && p[2]>-5)) return; intensity=Math.min(1.35,intensity); color=0x66a68d; }
      const l = new THREE.PointLight(color, intensity, dist, 1.8); l.position.set(...p); scene.add(l); lights.push(l);
    },
    flame(p, color, size = 0.12) { const m = new THREE.Mesh(new THREE.BoxGeometry(size, size * 1.4, size), glow(color, 3)); m.position.set(...p); root.add(m); flames.push({ m, base: size, s: Math.random() * 10 }); },
    water(x0, z0, x1, z1, color) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82, emissive: new THREE.Color(color).multiplyScalar(0.25) }));
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, -0.05, (z0 + z1) / 2); m.renderOrder = 2; root.add(m);
    },
    rune(x, y, z, r) {
      const mat = new THREE.MeshBasicMaterial({ map: runeTex(), color: new THREE.Color(0.35, 1.6, 0.9), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); root.add(m);
      flames.push({ m, base: -1, s: 0 });
      phase.push(k => mat.color.setRGB(0.35 + 0.4 * k, 1.6 + 1.2 * k, 0.9));
    },
    onPhase(f) { phase.push(f); },
    add(o) { root.add(o); },
  };
  def.build(ctx);
  if (options.combat) quietBattleGlow(w);
  for (const m of w.build({ glow: options.combat ? 1.35 : md.glowK ?? 2.6, chunk: STAGE_OPTS.chunk })) root.add(m);
  cards.build(root);
  if (cut.cells.size) for (const m of cut.build({ glow: 2.6, chunk: STAGE_OPTS.chunk })) cutRoot.add(m);
  const off = { on: true };
  onUpdate((dt, rdt) => {
    if (!off.on) return; const t = clock.rtime;
    ambientTick(amb, rdt);
    cutRoot.visible = CUT.mode === 'show' || (CUT.mode === 'auto' && (camera.position.y < eaves || camera.position.distanceTo(CUT.focus) > CUT.far));
    for (const f of flames) {
      if (f.base < 0) { f.m.rotation.z += rdt * 0.08; ((f.m.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 1.6) * 0.12); continue; }
      const s = 1 + Math.sin(t * 9 + f.s) * 0.15 + Math.sin(t * 23 + f.s) * 0.08; f.m.scale.set(s, s * 1.3, s); f.m.rotation.y += dt * 2;
    }
    lights.forEach((l, i) => { if ((l as THREE.PointLight).isPointLight) (l as THREE.PointLight).intensity = (l.userData.base ??= (l as THREE.PointLight).intensity) * st.dim * (1 + Math.sin(t * 8 + i * 3) * 0.12 + Math.sin(t * 19 + i) * 0.06); });
  });
  const st: Stage = {
    def, root, lights, dim: 1,
    phase2(k: number) {
      (g.skyMat.uniforms.uTint.value as THREE.Color).setRGB(1 - 0.25 * k, 1 + 0.15 * k, 1 - 0.2 * k);
      const f = scene.fog as THREE.FogExp2; f.density = md.fogD * (1 + 0.4 * k); f.color.set(md.fog).lerp(new THREE.Color(0x1a3a2c), 0.5 * k);
      g.hemi.color.set(md.hemiSky).lerp(new THREE.Color(0x3a8a5a), 0.4 * k);
      for (const p of phase) p(k);
    },
    dispose() { off.on = false; scene.remove(root); root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); for (const l of lights) scene.remove(l); if (current === st) current = null; },
  };
  current = st;
  STAGE_HOOK.built?.(st);
  return st;
}
export const AREA_RECT = AREA;
void V3;
