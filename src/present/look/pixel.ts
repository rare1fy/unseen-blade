// The 3D-pixel render style (from the 千珠守关「3D像素舒服版」prototype, kit_pit.js): the scene renders into a low-res art buffer
// (PX.size CSS px per art pixel, default 1 since R5) that is blown up with nearest sampling; 1-art-pixel dark outlines on silhouettes;
// flat face tones with a crisp 1-art-pixel bevel light on big block faces; square pixel particles with stepped halos; a bloom with
// a ceiling that backs off when the screen is busy; a warm-key / cool-fill light balance and a gentle S-curve grade.
// It only changes how the same scene is drawn, and it is a switch over the standard look: #px or ?px (?px=1|2|3) in the URL,
// P toggles at runtime, [ and ] change the pixel size. The HUD, relic bar, the UI-layer 3D scene and floating combat text stay at full
// resolution. R5 (user: "模型要清晰一些……变成 1x 的像素或者退回最早那版的清晰度"): the default is 1 CSS px per art pixel ("高清体素"):
// the same flat face tones, bevel lines and silhouette outline as the pixel look, at screen resolution with MSAA and a smooth bloom.
// #px2 / #px3 bring back the chunky pixels, #std the standard (toon) look.
import * as THREE from 'three';

export const PX = {
  /** the user picked the pixel look as the default (2026-11-13), first at 3x, then 2x ("2x的效果其实是最好的"); R5 (TARGET_MOCKUP: high-res
   *  voxels, "模型要清晰") → 1x. #std or ?px=0 shows the standard look, #px2 the chunky pixels */
  on: true,
  /** CSS px per art pixel (1 / 2 / 3). 2026-11-13 evening: with the UI now crisp on its own layer, the user likes the scene at 3x
   *  (「这种清晰度的UI+3x效果还不错」) → 3 */
  size: 1,   // user 2026-11-13: 「我们默认就1x」 (2× / 3× stay in the settings menu)
  /** render-time light balance (multipliers on the scene's own lights, restored after the frame) */
  warmK: 1.5, coolK: 1.0, hemiK: 1.2, pointK: 1.0,
  /** bloom ceiling (per-pixel cap on the added glow, which is then stepped into 6 bands) and how much it backs off on busy screens */
  bloomCap: 1.1, busyDim: 0.4,
  /** bloom bands at ≥ 2× art pixels (1× keeps a smooth halo) */
  bands: 6,
  /** silhouette outline: relative depth jump that counts as an edge, strength (≥ 2× art pixels / 1×) */
  inkT: 0.05, ink: 0.85, ink1: 0.6,
  /** grade */
  curve: 0.1, sat: 1.06, vig: 0.8, exposure: 1.08,
  /** exposure at 1× art pixels (R5: TARGET_MOCKUP is ~15% brighter in the middle of the frame than the 2× tuning) */
  exposure1: 0.95,   // 2026-11-13: 1.2 × the arena lift 1.6 read overexposed to the user
};

/** shared shader uniforms (materials keep references, so toggling never recompiles) */
export const PXU = { uPx: { value: 0 }, uPxEdge: { value: 0.32 }, uArtH: { value: 360 }, uPxMin: { value: 2.5 } };

type Sub = () => void;
const subs: Sub[] = [];
export function onPixelChange(fn: Sub) { subs.push(fn); }
function changed() { PXU.uPx.value = PX.on ? 1 : 0; for (const f of subs) f(); }

export function setPixel(on: boolean, size?: number) {
  PX.on = on; if (size != null && size >= 1 && size <= 6) PX.size = Math.round(size);
  changed(); return PX.on ? PX.size : 0;
}
export const togglePixel = () => setPixel(!PX.on);
export function stepPixelSize(d: number) { PX.size = Math.max(1, Math.min(3, PX.size + d)); if (!PX.on) PX.on = true; changed(); return PX.size; }

function isPhone() { try { const n = globalThis.navigator as Navigator | undefined, s = globalThis.screen as Screen | undefined; return !!n && (n.maxTouchPoints ?? 0) > 0 && !!s && Math.min(s.width, s.height) < 900; } catch { return false; } }
/** URL switch: #px / #px2 / #name&px (hash tokens), ?px / ?px=1|2|3 (query). Returns the hash without the px token. */
export function readPixelFlag(hash: string, query: (k: string) => string | null): string {
  const toks = hash.split(/[&+,]/).filter(Boolean), rest: string[] = [];
  let on = PX.on, size = PX.size;
  for (const t of toks) { const m = /^px([123])?$/.exec(t); if (m) { on = true; if (m[1]) size = +m[1]; } else if (t === 'std') on = false; else rest.push(t); }
  const q = query('px');
  if (q != null) { on = q !== '0'; if (/^[123]$/.test(q)) size = +q; }
  // phones: 2x/3x art pixels are not readable there (user: 「2x还是太不清晰了在手机上」) — 1x unless the URL asks; a settings switch comes later
  PX.on = on; PX.size = size; PXU.uPx.value = on ? 1 : 0;
  return rest.join('&');
}

/** P toggles the pixel look, [ / ] change the pixel size. */
export function installPixelKeys() {
  if (typeof window === 'undefined' || !window.addEventListener) return;
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'p' || e.key === 'P') { togglePixel(); e.preventDefault(); }
    else if (e.key === '[') { stepPixelSize(-1); e.preventDefault(); }
    else if (e.key === ']') { stepPixelSize(1); e.preventDefault(); }
  });
}

// ---------------------------------------------------------------- light balance: a warm key and a cool fill
// The scenes light themselves (hemisphere sky, a cool moon that casts the shadows, a warm front key). The pixel look of the reference
// leans on a strong warm key and a cool fill, so for the frame we lift warm directional lights, ease cool ones and raise the hemisphere.
const saved: Array<[THREE.Light, number]> = [];
export function pxLightsBegin(scene: THREE.Scene) {
  saved.length = 0;
  for (const o of scene.children) {
    const L = o as THREE.Light; if (!L.isLight || !L.visible) continue;
    let k = 1;
    if ((L as THREE.DirectionalLight).isDirectionalLight) { const c = L.color; k = c.r > c.b * 1.08 ? PX.warmK : c.b > c.r * 1.08 ? PX.coolK : 1; }
    else if ((L as THREE.HemisphereLight).isHemisphereLight) k = PX.hemiK;
    else if ((L as THREE.PointLight).isPointLight) k = PX.pointK;
    if (k !== 1) { saved.push([L, L.intensity]); L.intensity *= k; }
  }
}
export function pxLightsEnd() { for (const [L, i] of saved) L.intensity = i; saved.length = 0; }

// ---------------------------------------------------------------- the UI-layer 3D scene (src/present/ui3d)
// UI models (dice tray, heart flask, skill tablet, stone buttons…) live in their own scene + camera, drawn on top of the world.
// R5 (UX_V3 §6 "UI 不走像素低清"): in every look they render at the screen's native resolution (MSAA, their own bloom, a thin
// contour; look/uiPass.ts) over the finished world frame. Text stays full resolution (the UI layer draws its text after the frame).
export interface Ui3DLayer { scene: THREE.Scene; camera: THREE.PerspectiveCamera | THREE.OrthographicCamera; on: boolean; /** exposure for the UI models (default 1) */ exposure?: number }
export const UI3D: { layer: Ui3DLayer | null } = { layer: null };
/** register (or clear) the UI-layer 3D scene; post.ts renders it every frame while layer.on */
export function setUi3DLayer(layer: Ui3DLayer | null) { UI3D.layer = layer; }

// ---------------------------------------------------------------- overlays kept at full resolution
// Floating combat text is a camera-facing sprite drawn on top of everything (renderOrder ≥ 40, no depth test): it belongs to the UI,
// so in the pixel look it is lifted out of the art buffer and drawn crisp after the upscale.
const overlay = new THREE.Scene(), lifted: THREE.Object3D[] = [];
export function liftOverlays(scene: THREE.Scene) {
  lifted.length = 0;
  for (const o of scene.children) {
    const s = o as THREE.Sprite;
    if (s.isSprite && s.visible && s.renderOrder >= 40 && (s.material as THREE.SpriteMaterial).depthTest === false) lifted.push(s);
  }
  for (const s of lifted) overlay.add(s);   // add() removes it from the scene
  return lifted.length;
}
export function drawOverlays(r: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  if (!lifted.length) return;
  const ac = r.autoClear; r.autoClear = false; r.render(overlay, camera); r.autoClear = ac;
  for (const s of lifted) scene.add(s);
  lifted.length = 0;
}
