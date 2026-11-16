// A die as a real object (v5 02e_dice.js): a block with flat chamfered edges (R5: thick, no rounding) and a painted 6-face atlas
// (R6 plain dice: a square pixel numeral on every face, dice/numFace.ts, nearest-sampled art pixels), emissive numerals, identity parts, rarity trim, a glowing back-face shell for selection (bright enough to bloom), a ground anchor
// (`foot`, optional glow ring) and a badge anchor above the die, and the motion modes the battle uses:
//   hidden → play (recorded throw playback) → rest (on the field; lifts and tilts toward the camera when selected) ⇄ fly (tweens)
import * as THREE from 'three';
import { scene, camera, canvasTex, V3, C, R, TAU } from '../engine/world';
import { anim, ease, lerp, damp, clock } from '../engine/clock';
import { dieDef } from '../../core/data';
import { paintFace, famKey, FAM } from './style';
import { DIE, sigOf, extra, TRIM_MAT, trimGeometry, type DieFxKind } from './signature';
import { dieGeometry, assignFaceValues } from './faces';
import { paintSuitFace, tileSize } from '../ui3d/suitFace';
import { SPECIALS, skinFaces, type SuitSkin } from '../ui3d/suitData';
import '../ui3d/models3dGallery';   // registers __dh.models3d() (debug gallery of the R5 UI models)

export const DT = 48;   // texels per face (one texel ~ one art pixel at the battle view)
/** chamfer width (fraction of the die) */
export const BEVEL = 0.1;
const GEO = dieGeometry(DIE, DIE * BEVEL), SHELL = dieGeometry(DIE * 1.14, DIE * 1.14 * BEVEL * 1.1);
let RING_GEO: THREE.BufferGeometry | null = null;
export type DieMode = 'hidden' | 'play' | 'rest' | 'fly' | 'present' | 'queue' | 'gone';

export interface ThrowRec { rel: number; f: number[]; impacts: Array<{ t: number; v: number }>; top: number; qEnd: THREE.Quaternion; pEnd: THREE.Vector3; dur: number; /** optional start scale, eased to 1 over sT s (UI → world hand-over); default: v1 grow-in */ s0?: number; sT?: number }

export const DICE3D = new Set<Die3D>();
let seq = 1;

export class Die3D {
  readonly id = seq++;
  readonly root = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly outline: THREE.Mesh;
  readonly mat: THREE.MeshStandardMaterial;
  readonly omat: THREE.MeshBasicMaterial;
  readonly tex: THREE.CanvasTexture; readonly etex: THREE.CanvasTexture;
  readonly seed: number;
  faceVals: number[]; topIdx = 2; topTurns = 0;
  /** GROWTH_V5 §4: carved suit per face value (index = value − 1) */
  carves: Array<'fire' | 'ice' | 'gold' | null> | null = null;
  setCarves(c: Array<'fire' | 'ice' | 'gold' | null> | null | undefined) { const k = c ? c.join() : ''; if (k === (this.carves ? this.carves.join() : '')) return; this.carves = c ? c.slice() : null; if (this.suit) this.paint(); }
  mode: DieMode = 'hidden';
  play: { rec: ThrowRec; t0: number; ii: number; /** playback speed (1 = recorded) */ rate?: number } | null = null;
  tween: object | null = null;
  home = V3(); homeQ = new THREE.Quaternion();
  lift = 0; liftT = 0; sepY = 0; dodge = V3(); dodgeT = V3();
  glow = 0; glowCol = C(0xffd860);
  spinPart: THREE.Object3D | null = null;
  /** rules-layer die uid this model shows (null for gallery / queue pips) */
  uid: number | null = null;
  value = 1;

  /** v2 suit faces (ui3d/suitData.ts): when set, the die paints suit faces instead of the v1 numeral style */
  suit: SuitSkin | null = null;
  /** ground anchor: a sibling of root (same parent) that follows the die on the ground plane under it, never tilts or lifts; hang
   *  rings / shadows / markers here (setRing() puts a glowing ring on it) */
  readonly foot = new THREE.Group();
  ring: THREE.Mesh | null = null; ringCol = C(0x6ad8ff); ringOn = 0; ringK = 0;

  constructor(readonly defId: string, o: { parent?: THREE.Object3D; T?: number; suit?: SuitSkin } = {}) {
    const def = dieDef(defId), T = o.T || (o.suit ? tileSize(o.suit) : DT);
    this.suit = o.suit || null;
    this.faceVals = (this.suit ? skinFaces(this.suit) : def.faces.length === 6 ? def.faces : [1, 2, 3, 4, 5, 6]).slice();
    this.seed = (defId.length * 977 + this.id * 31) | 0;
    this.tex = canvasTex(T * 6, T, () => {}, { nearest: true }); this.etex = canvasTex(T * 6, T, () => {}, { nearest: true });
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, emissiveMap: this.etex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 });
    this.mesh = new THREE.Mesh(GEO, this.mat); this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    // selection outline: the back faces of a slightly larger chamfered shell, additive and > 1 so the bloom turns it into a halo
    this.omat = new THREE.MeshBasicMaterial({ color: 0xffd860, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.outline = new THREE.Mesh(SHELL, this.omat); this.outline.renderOrder = 2; this.outline.visible = false;
    this.root.add(this.mesh, this.outline);
    const sig = sigOf(defId);
    for (const k of sig.extras || []) { const X = extra(k), m = new THREE.Mesh(X.geo, X.mat); m.castShadow = true; this.root.add(m); if (sig.spin === k) this.spinPart = m; }
    const tr = FAM[famKey(defId)].gold ? 'legendary' : TRIM_MAT[def.rarity] && !(sig.extras || []).length ? def.rarity : null;
    if (tr) { const t = new THREE.Mesh(trimGeometry(), TRIM_MAT[tr]); t.castShadow = true; this.root.add(t); }
    (o.parent || scene).add(this.root, this.foot); this.root.visible = false; this.foot.visible = false;
    this.setFilter(); this.paint(); DICE3D.add(this);
  }

  /** Repaint the atlas (after the faces were renumbered or the top tile turned). */
  paint() {
    if (this.suit) { this.paintSuit(); return; }
    const T = (this.tex.image as { height: number }).height;
    const g = this.tex.userData.canvas.getContext('2d') as CanvasRenderingContext2D, eg = this.etex.userData.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.faceVals.forEach((v, i) => {
      const turns = i === this.topIdx ? this.topTurns : 0, seed = this.seed * 13 + i;
      if (!turns) { paintFace(g, eg, i * T, T, v, this.defId, seed); return; }
      // paint into scratch tiles, then blit rotated by −turns·90° (counter-clockwise in texture space; see faces.turnedV)
      const tg = scratch(T, 0), te = scratch(T, 1); paintFace(tg.g, te.g, 0, T, v, this.defId, seed);
      for (const [ctx, src] of [[g, tg.c], [eg, te.c]] as const) { ctx.save(); ctx.translate(i * T + T / 2, T / 2); ctx.rotate(-turns * Math.PI / 2); ctx.drawImage(src, -T / 2, -T / 2, T, T); ctx.restore(); }
    });
    this.tex.needsUpdate = true; this.etex.needsUpdate = true;
    const F = FAM[famKey(this.defId)], m = this.mat;
    m.roughness = F.rough ?? 0.5; m.metalness = F.metal || 0; m.opacity = F.opacity || 1; m.transparent = (F.opacity || 1) < 1;
    m.emissiveIntensity = F.emis || F.glowPip ? 1.7 : 0; m.needsUpdate = true;
  }

  /** Put `value` on face `top`, painted upright for the viewer. */
  setValue(value: number, top: number, turns: number) {
    this.value = value; this.faceVals = assignFaceValues(this.suit ? skinFaces(this.suit) : dieDef(this.defId).faces, value, top); this.topIdx = top; this.topTurns = turns; this.paint();
  }

  /** Switch to (or between) suit skins; keeps the shown value on the same face. The atlas is resized when the scheme's tile size changes. */
  setSuit(skin: SuitSkin | null) {
    const top = this.topIdx, v = this.value; this.suit = skin;
    const T = skin ? tileSize(skin) : DT;
    for (const t of [this.tex, this.etex]) { const c = t.userData.canvas; if (c.height !== T) { c.width = T * 6; c.height = T; t.dispose(); } }
    this.setFilter();
    this.faceVals = assignFaceValues(skin ? skinFaces(skin) : dieDef(this.defId).faces, v, top); this.paint();
  }
  /** every face is pixel art on the art-pixel grid (UX_V3 §6b): nearest sampling, no mipmaps, so each texel stays a crisp square */
  private setFilter() {
    for (const t of [this.tex, this.etex]) {
      if (t.minFilter === THREE.NearestFilter && t.magFilter === THREE.NearestFilter && !t.generateMipmaps) continue;
      t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.anisotropy = 1; t.dispose(); t.needsUpdate = true;
    }
  }
  /** A glowing ring on the ground under the die (null = off). Colour values > 1 bloom. B can also hang its own marker on `foot`. */
  setRing(color: THREE.ColorRepresentation | null, k = 2.2) {
    if (color == null) { this.ringOn = 0; return; }
    this.ringOn = 1; this.ringK = k; this.ringCol.set(color);
    if (!this.ring) {
      RING_GEO ||= ringGeometry();
      this.ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      this.ring.renderOrder = 1; this.foot.add(this.ring);
    }
  }
  /** World point above the die (for a badge / marker over it), `up` world units over its top. */
  topAnchor(up = 0.32, out = V3()) { return out.copy(this.root.position).setY(this.root.position.y + DIE * 0.5 * this.root.scale.x + up); }
  private paintSuit() {
    const s = this.suit!, T = (this.tex.image as { height: number }).height;
    const g = this.tex.userData.canvas.getContext('2d') as CanvasRenderingContext2D, eg = this.etex.userData.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.faceVals.forEach((v, i) => {
      const turns = i === this.topIdx ? this.topTurns : 0;
      const top = i === this.topIdx;   // the value face (special dice put their small effect icon there)
      const cv = this.carves?.[v - 1] ?? null;
      if (!turns) { paintSuitFace(g, eg, i * T, T, v, s, top, cv); return; }
      const tg = scratch(T, 0), te = scratch(T, 1); paintSuitFace(tg.g, te.g, 0, T, v, s, top, cv);
      for (const [ctx, src] of [[g, tg.c], [eg, te.c]] as const) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(i * T + T / 2, T / 2); ctx.rotate(-turns * Math.PI / 2); ctx.drawImage(src, -T / 2, -T / 2, T, T); ctx.restore(); }
    });
    this.tex.needsUpdate = true; this.etex.needsUpdate = true;
    // near-matte (R6): a glossy top face caught the moon's specular and lifted the dark numeral to mid blue; flat tones read as pixel art
    const sp = s.special ? SPECIALS[s.special] : null, m = this.mat;
    m.roughness = sp?.metal ? 0.3 : s.plain ? 0.92 : 0.55; m.metalness = sp?.metal ? sp.metal * 0.5 : 0; m.opacity = 1; m.transparent = false;
    m.emissiveIntensity = 1.6; m.needsUpdate = true;
  }

  fx(kind: DieFxKind) { sigOf(this.defId).fx(kind, this.root.getWorldPosition(V3())); }

  dispose() {
    this.root.parent?.remove(this.root); this.foot.parent?.remove(this.foot); this.tex.dispose(); this.etex.dispose(); this.mat.dispose(); this.omat.dispose();
    if (this.ring) (this.ring.material as THREE.Material).dispose();
    DICE3D.delete(this); this.mode = 'gone';
  }
}

const scratches: Array<{ c: any; g: CanvasRenderingContext2D }> = [];
function scratch(T: number, i: number) {
  let s = scratches[i];
  if (!s || s.c.width !== T) { const t = canvasTex(T, T, () => {}); s = { c: t.userData.canvas, g: t.userData.canvas.getContext('2d') }; t.dispose(); scratches[i] = s; }
  s.g.clearRect(0, 0, T, T); return s;
}

/** Tween a die along an arc to a pose. o: q (end orientation), scale, arc height, turns (tumbles on the way), ease. */
export function flyDie(d: Die3D, to: THREE.Vector3, dur: number, o: { q?: THREE.Quaternion; scale?: number; arc?: number; turns?: number; ease?: (k: number) => number; trail?: (d: Die3D, k: number) => void } = {}) {
  d.mode = 'fly'; d.play = null; d.root.visible = true;
  const from = d.root.position.clone(), q0 = d.root.quaternion.clone(), q1 = o.q ? o.q.clone() : q0.clone();
  const s0 = d.root.scale.x, s1 = o.scale ?? s0, mid = from.clone().lerp(to, 0.5); mid.y = Math.max(from.y, to.y) + (o.arc ?? 0.8);
  const axis = V3(R(-1, 1), R(-0.3, 0.3), R(-1, 1)).normalize(), qs = new THREE.Quaternion(), tw = {}; d.tween = tw;
  return new Promise<void>(res => anim(dur, k => {
    if (d.tween !== tw) return;
    const e = (o.ease || ease.inOut)(k), a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
    d.root.position.set(from.x * a + mid.x * b + to.x * c, from.y * a + mid.y * b + to.y * c, from.z * a + mid.z * b + to.z * c);
    d.root.quaternion.slerpQuaternions(q0, q1, ease.outCubic(k));
    if (o.turns) { qs.setFromAxisAngle(axis, TAU * o.turns * (1 - ease.outCubic(k))); d.root.quaternion.premultiply(qs); }
    d.root.scale.setScalar(lerp(s0, s1, ease.outCubic(k)));
    o.trail?.(d, k);
  }, () => { if (d.tween === tw) d.tween = null; res(); }));
}

// ---- per-frame: playback of recorded throws, resting dice (lift / tilt / dodge / clearance), glow
const _pa = V3(), _pb = V3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), UP = V3(0, 1, 0);
export const SIM_FPS = 60;   // recorded frames per second (sim 120 Hz, every 2nd step)
export const throwHooks = { impact: (_d: Die3D, _v: number) => {}, landed: (_d: Die3D) => {} };

export function updateDice(dt: number, rdt: number) {
  for (const d of DICE3D) {
    if (d.mode === 'play' && d.play) {
      const P = d.play, rec = P.rec, t = (clock.time - P.t0) * (P.rate ?? 1) - rec.rel, F = rec.f, nF = F.length / 7;
      if (t < 0) { d.root.visible = false; continue; }
      d.root.visible = true;
      const fi = t * SIM_FPS, i0 = Math.min(nF - 1, Math.floor(fi)), i1 = Math.min(nF - 1, i0 + 1), a = Math.min(1, fi - i0);
      _pa.set(F[i0 * 7], F[i0 * 7 + 1], F[i0 * 7 + 2]); _pb.set(F[i1 * 7], F[i1 * 7 + 1], F[i1 * 7 + 2]); d.root.position.lerpVectors(_pa, _pb, a);
      _qa.set(F[i0 * 7 + 3], F[i0 * 7 + 4], F[i0 * 7 + 5], F[i0 * 7 + 6]); _qb.set(F[i1 * 7 + 3], F[i1 * 7 + 4], F[i1 * 7 + 5], F[i1 * 7 + 6]); d.root.quaternion.slerpQuaternions(_qa, _qb, a);
      d.root.scale.setScalar(rec.s0 != null ? lerp(rec.s0, 1, ease.inOut(Math.min(1, t / (rec.sT ?? 0.3)))) : Math.min(1, 0.55 + t * 3));
      while (P.ii < rec.impacts.length && rec.impacts[P.ii].t <= t) throwHooks.impact(d, rec.impacts[P.ii++].v);
      if (fi >= nF - 1) { d.mode = 'rest'; d.play = null; d.root.position.copy(d.home); d.root.quaternion.copy(d.homeQ); d.liftT = 0; throwHooks.landed(d); }
    } else if (d.mode === 'rest') {
      d.liftT = lerp(d.liftT, d.lift, 1 - Math.exp(-14 * dt));
      d.dodge.lerp(d.dodgeT, 1 - Math.exp(-9 * dt));
      _pa.copy(d.home).add(d.dodge); _pa.y += d.liftT * 0.38;
      const tilt = _qa.setFromUnitVectors(UP, _pb.copy(camera.position).sub(d.root.position).normalize());
      _qb.identity().slerp(tilt, d.liftT * 0.6).multiply(d.homeQ);
      d.sepY = lerp(d.sepY, d.liftT > 0.02 ? clearance(d, _pa, _qb) : 0, 1 - Math.exp(-16 * dt)); _pa.y += d.sepY;
      d.root.position.lerp(_pa, 1 - Math.exp(-20 * dt)); d.root.quaternion.slerp(_qb, 1 - Math.exp(-14 * dt));
    }
    if (d.spinPart) d.spinPart.rotation.y += dt * (d.mode === 'rest' ? (d.glow ? 6 : 1.2) : 3);
    // selection outline: additive, HDR (blooms into a halo), a slow breath
    const pulse = 0.85 + 0.15 * Math.sin(clock.rtime * 5 + d.id);
    d.omat.opacity = damp(d.omat.opacity, d.glow ? Math.min(1, d.glow * 0.85) * pulse : 0, 12, rdt); d.omat.color.copy(d.glowCol).multiplyScalar(1.9); d.outline.visible = d.omat.opacity > 0.02;
    if (d.suit?.plain && !d.suit.special) {
      // plain numeral dice: the body takes on the glow colour (albedo tint, adds no light, so it never blooms the numeral away) plus a
      // faint emissive breath through the grey body of the emissive map; the numerals stay dark
      const k = Math.min(1, d.glow) * 0.3; d.mat.color.setRGB(1, 1, 1).lerp(d.glowCol, k);
      d.mat.emissive.copy(d.glowCol); d.mat.emissiveIntensity = d.glow * (0.05 + 0.03 * Math.sin(clock.rtime * 6));
    } else {
      if (d.mat.color.r !== 1 || d.mat.color.b !== 1) d.mat.color.setRGB(1, 1, 1);
      d.mat.emissive.setRGB(1, 1, 1);
      const F = FAM[famKey(d.defId)], base = d.suit ? 1.6 : F.emis || F.glowPip ? 1.7 : 0;
      d.mat.emissiveIntensity = base + d.glow * (0.16 + 0.06 * Math.sin(clock.rtime * 6)) * 2;
    }
    // ground anchor: under the die on its home plane (no tilt, no lift), with the optional ring
    if (d.root.parent && d.foot.parent !== d.root.parent) d.root.parent.add(d.foot);   // re-parented (UI ↔ world hand-over)
    const fv = d.root.visible && d.mode !== 'gone';
    d.foot.visible = fv;
    if (fv) { d.foot.position.set(d.root.position.x, d.home.y - DIE * 0.5 + 0.012, d.root.position.z); d.foot.scale.setScalar(d.root.scale.x); }
    if (d.ring) {
      const m = d.ring.material as THREE.MeshBasicMaterial;
      m.opacity = damp(m.opacity, d.ringOn ? 0.9 : 0, 10, rdt); m.color.copy(d.ringCol).multiplyScalar(d.ringK * (0.85 + 0.15 * Math.sin(clock.rtime * 3 + d.id)));
      d.ring.visible = m.opacity > 0.02; d.ring.rotation.y += rdt * 0.6;
    }
  }
}

/** A flat ground ring for setRing: a band plus four short ticks, in the XZ plane, radius ~0.65 die. */
function ringGeometry() {
  const parts: THREE.BufferGeometry[] = [], r0 = DIE * 0.6, r1 = DIE * 0.68;
  parts.push(new THREE.RingGeometry(r0, r1, 48, 1));
  for (let i = 0; i < 4; i++) { const t = new THREE.PlaneGeometry(DIE * 0.07, DIE * 0.14); t.translate(0, r1 + DIE * 0.1, 0); t.rotateZ(i * Math.PI / 2 + Math.PI / 4); parts.push(t); }
  const pos: number[] = [], idx: number[] = []; let base = 0;
  for (const g of parts) { const p = g.getAttribute('position'), ix = g.getIndex()!; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)); for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base); base += p.count; g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.rotateX(-Math.PI / 2); g.computeBoundingSphere();
  return g;
}

// box-vs-box overlap test (corners, edge midpoints, face centres) — enough for dice-sized cubes; lifted dice rise until clear
const _cq = new THREE.Quaternion(), _cv = V3(), _cp = V3(), DPTS: number[][] = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) DPTS.push([x, y, z]);
function ptsIn(pA: THREE.Vector3, qA: THREE.Quaternion, hA: number, pB: THREE.Vector3, qB: THREE.Quaternion, hB: number) {
  _cq.copy(qB).invert();
  for (const [x, y, z] of DPTS) { _cv.set(x * hA, y * hA, z * hA).applyQuaternion(qA).add(pA).sub(pB).applyQuaternion(_cq); if (Math.abs(_cv.x) < hB && Math.abs(_cv.y) < hB && Math.abs(_cv.z) < hB) return true; }
  return false;
}
export function boxesHit(pA: THREE.Vector3, qA: THREE.Quaternion, hA: number, pB: THREE.Vector3, qB: THREE.Quaternion, hB: number) {
  if (pA.distanceToSquared(pB) > (hA + hB) * (hA + hB) * 3.1) return false;
  return ptsIn(pA, qA, hA, pB, qB, hB) || ptsIn(pB, qB, hB, pA, qA, hA);
}
function clearance(d: Die3D, pos: THREE.Vector3, q: THREE.Quaternion) {
  const hA = DIE * 0.5 * d.root.scale.x * 1.05; let extraY = 0;
  for (let it = 0; it < 18; it++) {
    _cp.copy(pos); _cp.y += extraY; let hit = false;
    for (const o of DICE3D) {
      if (o === d || !o.root.visible || (o.mode !== 'rest' && o.mode !== 'play') || o.root.parent !== d.root.parent) continue;
      if (boxesHit(_cp, q, hA, o.root.position, o.root.quaternion, DIE * 0.5 * o.root.scale.x * 1.02)) { hit = true; break; }
    }
    if (!hit) return extraY; extraY += 0.06;
  }
  return extraY;
}
