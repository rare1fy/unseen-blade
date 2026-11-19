import { dirtyRange } from './uploads';
// 11-18 微信帧率: a character's body parts drawn as one mesh. Every voxel character is a rig of bones with one mesh per body part
// (a room of seven people was ~106 draws, ~39 more for their shadows); WeChat's JS issues each draw far slower than a desktop browser.
// Here the parts of one actor that share a material become a single SkinnedMesh in which every part is its own "bone": the bone IS the
// part mesh (its matrixWorld, still posed by the actor's animation), with an identity inverse and an identity bind matrix, so a vertex
// lands exactly where the part mesh would have put it. The part meshes stay in the scene graph (the game keeps moving, hiding and
// reading them) but are moved to a layer no camera draws.
// Anything the batch can't follow sends that part back to being drawn on its own, every frame it holds: the part is hidden or under a
// hidden group (→ its bone collapses to a point), its material was swapped (隐身 fades), it stopped casting a shadow, its geometry was
// replaced (MagicaVoxel live edits), or it left the actor (a thrown axe). A clone of a hidden part (留影's afterimage) gets its
// original layer back (Object3D.copy is wrapped).
import * as THREE from 'three';
import { PartPalette, PartState, partMaterial } from './partPalette';
import { OPT, CAPS } from './perfOpts';

const HIDE = 31;
/** parts now hidden from the cameras → their own layer mask */
const HIDDEN = new WeakMap<THREE.Object3D, number>();
{
  const proto = THREE.Object3D.prototype as unknown as { copy: (src: THREE.Object3D, rec?: boolean) => THREE.Object3D }, orig = proto.copy;
  proto.copy = function (this: THREE.Object3D, src: THREE.Object3D, rec?: boolean) { orig.call(this, src, rec); const m = HIDDEN.get(src); if (m !== undefined) this.layers.mask = m; return this; };
}
const ID = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// The only inverse used here is identity or a zero scale (hidden part). Skeleton.update otherwise
// uploads its float texture even during hit-stop when every joint has exactly the same packed pose.
class RigidSkeleton extends THREE.Skeleton {
  override update() {
    if (!OPT.dirtyUploads) { super.update(); return; }
    const a = this.boneMatrices; let dirty = false;
    for (let i = 0; i < this.bones.length; i++) {
      const e = this.bones[i].matrixWorld.elements, visible = this.boneInverses[i] === ID;
      for (let k = 0; k < 16; k++) {
        const v = visible || k >= 12 ? Math.fround(e[k]) : 0, j = i * 16 + k;
        if (a[j] !== v) { a[j] = v; dirty = true; }
      }
    }
    if (dirty && this.boneTexture) this.boneTexture.needsUpdate = true;
  }
}
interface Part { mesh: THREE.Mesh; geo: THREE.BufferGeometry; i: number; mask: number; merged: boolean; vertex: number; colorVersion: number }
interface Group { mesh: THREE.SkinnedMesh; inv: THREE.Matrix4[]; mat: THREE.Material; cast: boolean; recv: boolean; parts: Part[]; state?: PartState; palette?: PartPalette; packed?: Packed }

const sig = (g: THREE.BufferGeometry) => Object.keys(g.attributes).sort().map(k => { const a = g.attributes[k] as THREE.BufferAttribute; return `${k}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`; }).join('|');
const plainRender = THREE.Object3D.prototype.onBeforeRender;
// r162 calls this material hook too; the installed typings only declare the object hook.
const plainMaterialRender: unknown = Reflect.get(THREE.Material.prototype, 'onBeforeRender');
function eligible(m: THREE.Mesh, ui: boolean) {
  if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh || m.userData.noBatch) return false;
  const mat = m.material as THREE.Material, g = m.geometry;
  if (!mat || Array.isArray(mat) || mat.transparent || !g || !g.index || !g.attributes.position) return false;
  if (Object.keys(g.morphAttributes).length || (!ui && g.groups.length > 1) || m.onBeforeRender !== plainRender) return false;
  for (const k in g.attributes) if ((g.attributes[k] as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return false;
  if (ui && (!partMaterial(mat) || Reflect.get(mat, 'onBeforeRender') !== plainMaterialRender || mat.opacity !== 1 || !mat.visible || g.drawRange.start !== 0 || g.drawRange.count < g.index.count)) return false;
  return true;
}

// Identical enemy rigs share their packed vertex/index buffers too. The bones and palette remain per instance.
export const templateGeometry = new WeakSet<THREE.BufferGeometry>();
type Packed = { sources: THREE.BufferGeometry[]; geometry: THREE.BufferGeometry; users: number };
const packed = new WeakMap<THREE.BufferGeometry, Packed[]>();
const retiredPalettes: PartPalette[] = [];
class RigidBatch {
  groups: Group[] = [];
  constructor(readonly root: THREE.Object3D, private uiRoots?: Set<THREE.Object3D>) {
    const states: PartState[] = [];
    const byKey = new Map<string, THREE.Mesh[]>();
    // (another actor carried inside this one — her on the donkey's back — is its own batch's business)
    const walk = (o: THREE.Object3D) => {
      if (o !== root && ROOTS.has(o)) return;
      const m = o as THREE.Mesh;
      if (eligible(m, !!uiRoots)) {
        const mat = m.material as THREE.Material; let key = mat.uuid;
        if (uiRoots) { let i = states.findIndex(s => s.matches(mat)); if (i < 0) i = states.push(new PartState(mat)) - 1; key = String(i); }
        const k = `${key}|${m.layers.mask}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${sig(m.geometry)}`; let l = byKey.get(k); if (!l) byKey.set(k, (l = [])); l.push(m); }
      for (const c of o.children) walk(c);
    };
    if (uiRoots) { for (const widget of uiRoots) walk(widget); } else walk(root);
    for (const list of byKey.values()) if (list.length >= 2) this.groups.push(this.merge(list));
  }
  private geometry(list: THREE.Mesh[]) {
    const first = list[0].geometry, names = Object.keys(first.attributes);
    let nv = 0, ni = 0; for (const m of list) { nv += m.geometry.attributes.position.count; ni += m.geometry.index!.count; }
    const g = new THREE.BufferGeometry();
    for (const k of names) {
      const a0 = first.attributes[k] as THREE.BufferAttribute, Arr = a0.array.constructor as new (n: number) => THREE.TypedArray, arr = new Arr(nv * a0.itemSize);
      let o = 0; for (const m of list) { const a = m.geometry.attributes[k] as THREE.BufferAttribute; arr.set(a.array as THREE.TypedArray, o); o += a.array.length; }
      g.setAttribute(k, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized));
    }
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
    let vo = 0, io = 0;
    list.forEach((m, i) => {
      const I = m.geometry.index!.array, n = m.geometry.attributes.position.count;
      for (let k = 0; k < I.length; k++) idx[io++] = I[k] + vo;
      for (let v = vo; v < vo + n; v++) { si[v * 4] = i; sw[v * 4] = 1; }
      vo += n;
    });
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    return g;
  }
  private merge(list: THREE.Mesh[]): Group {
    const first = list[0].geometry;
    let shared: Packed | undefined;
    if (!this.uiRoots && OPT.fightWarmup && list.every(m => templateGeometry.has(m.geometry))) {
      let variants = packed.get(first);
      if (!variants) packed.set(first, variants = []);
      shared = variants.find(v => v.sources.length === list.length && v.sources.every((g,i) => g === list[i].geometry));
      if (!shared) { shared = { sources: list.map(m => m.geometry), geometry: this.geometry(list), users: 0 }; variants.push(shared); }
      shared.users++;
    }
    const g = shared?.geometry ?? this.geometry(list);
    const mat = list[0].material as THREE.Material, palette = this.uiRoots && partMaterial(mat) ? new PartPalette(mat, list.length) : undefined;
    const sm = new THREE.SkinnedMesh(g, palette?.material ?? mat), inv = list.map(() => new THREE.Matrix4());
    sm.layers.mask = list[0].layers.mask; sm.userData.noTilt = true; sm.name = 'rigidBatch'; sm.frustumCulled = false; sm.castShadow = list[0].castShadow; sm.receiveShadow = list[0].receiveShadow; sm.renderOrder = list[0].renderOrder;
    sm.bind(new RigidSkeleton(list as unknown as THREE.Bone[], inv), new THREE.Matrix4());
    this.root.add(sm);
    let vertex = 0;
    const parts = list.map((m, i) => { const start = vertex; vertex += m.geometry.attributes.position.count;
      return { mesh: m, geo: m.geometry, i, mask: m.layers.mask, merged: false, vertex: start, colorVersion: (m.geometry.attributes.color as THREE.BufferAttribute)?.version ?? 0 }; });
    return { mesh: sm, packed: shared, inv, mat, cast: sm.castShadow, recv: sm.receiveShadow, palette, state: palette ? new PartState(mat) : undefined, parts };
  }
  /** per frame, before the render: which parts the batch draws (and where), which go back to drawing themselves */
  sync() {
    const on = this.uiRoots ? OPT.uiBatch : this.root.userData.propBatch ? OPT.propBatch : OPT.batch;
    for (const G of this.groups) {
      let visible = false, dirty = false;
      for (const p of G.parts) {
        const m = p.mesh;
        let inRoot = false, vis = m.visible;
        for (let o: THREE.Object3D | null = m.parent; o; o = o.parent) { if (o === this.root) { inRoot = true; break; } if (!o.visible) vis = false; }
        const ok = on && inRoot && (G.state ? !Array.isArray(m.material) && G.state.matches(m.material) && m.renderOrder === G.mesh.renderOrder && m.onBeforeRender === plainRender : m.material === G.mat) && m.geometry === p.geo && m.castShadow === G.cast && m.receiveShadow === G.recv;
        if (ok !== p.merged) { p.merged = ok; if (ok) { HIDDEN.set(m, p.mask); m.layers.set(HIDE); } else { HIDDEN.delete(m); m.layers.mask = p.mask; } }
        if (ok && vis) {
          visible = true;
          if (G.palette) {
            const mat = m.material as typeof G.palette.material;
            if (G.palette.update(p.i, mat)) dirty = true;
            const colors = p.geo.attributes.color as THREE.BufferAttribute;
            if (colors && p.colorVersion !== colors.version) {
              const dst = G.mesh.geometry.attributes.color as THREE.BufferAttribute, offset = p.vertex * colors.itemSize;
              const values = colors.array;
              if (!OPT.dirtyUploads || values.some((v, i) => v !== dst.array[offset + i])) {
                dst.array.set(values, offset); dirtyRange(dst, offset, values.length);
              }
              p.colorVersion = colors.version;
            }
          }
        }
        G.inv[p.i] = ok && vis ? ID : ZERO;
      }
      G.mesh.visible = on && visible;
      if (dirty) G.palette!.texture.needsUpdate = true;
    }
  }
  release() {
    for (const G of this.groups) {
      for (const p of G.parts) if (p.merged) { p.merged = false; HIDDEN.delete(p.mesh); p.mesh.layers.mask = p.mask; }
      G.mesh.parent?.remove(G.mesh); if (!G.packed || --G.packed.users === 0) G.mesh.geometry.dispose();
      G.mesh.skeleton.dispose(); if (G.palette) retiredPalettes.push(G.palette);
    }
    this.groups = [];
  }
}

interface Entry { root: THREE.Object3D; batch: RigidBatch | null; away: number }
const ENTRIES = new Set<Entry>(), ROOTS = new WeakSet<THREE.Object3D>();
/** an actor's root: batch its parts once it is in a scene (built on the first sync after that, or in precompile) */
interface UiEntry { widgets: Set<THREE.Object3D>; batch?: RigidBatch; dirty: boolean }
const widgetScenes = new Map<THREE.Object3D, UiEntry>(), barScenes = new Map<THREE.Object3D, UiEntry>();
const uiSets = [widgetScenes, barScenes];
export function batchUi(root: THREE.Object3D, healthBars = false) { batchActor(root, { matState: true, healthBars }); }
export function batchActor(root: THREE.Object3D, options?: { matState?: boolean; healthBars?: boolean }) {
  if (options?.matState) {
    const scene = root.parent;
    if (!scene) return;
    const uiScenes = options.healthBars ? barScenes : widgetScenes;
    let entry = uiScenes.get(scene);
    if (!entry) { entry = { widgets: new Set(), dirty: true }; uiScenes.set(scene, entry); }
    const ui = entry;
    if (ui.widgets.has(root)) return;
    const changed = () => { ui.dirty = true; };
    const removed = () => {
      ui.widgets.delete(root); changed();
      root.removeEventListener('childadded', changed); root.removeEventListener('childremoved', changed); root.removeEventListener('removed', removed);
    };
    ui.widgets.add(root); changed(); root.addEventListener('removed', removed);
    root.addEventListener('childadded', changed); root.addEventListener('childremoved', changed);
    return;
  }
  if (ROOTS.has(root) || !CAPS.boneTex) return;
  ROOTS.add(root);
  const entry = { root, batch: null, away: 0 } as Entry;
  ENTRIES.add(entry);
  if (root.userData.propBatch) root.addEventListener('removed', () => {
    entry.batch?.release(); ENTRIES.delete(entry); ROOTS.delete(root);
  });
}
/** every frame before the render (and before a precompile): build pending batches, follow the parts; a root out of every scene for
 *  5 s is let go (its parts back to drawing themselves) */
export function syncBatches() {
  if (!CAPS.boneTex) return;
  // Give the replacement material one render to acquire its program before releasing the old owner.
  for (const p of retiredPalettes) p.dispose();
  retiredPalettes.length = 0;
  for (const uiScenes of uiSets) for (const [scene, ui] of uiScenes) {
    if (ui.dirty && (OPT.uiBatch || ui.batch)) {
      ui.batch?.release(); ui.batch = undefined;
      if (!ui.widgets.size) { uiScenes.delete(scene); continue; }
      if (OPT.uiBatch) { ui.batch = new RigidBatch(scene, ui.widgets); ui.dirty = false; }
    }
    ui.batch?.sync();
  }
  for (const e of ENTRIES) {
    if (!e.root.parent) { if (++e.away > 300) { e.batch?.release(); ENTRIES.delete(e); } continue; }
    e.away = 0;
    if (!e.batch) { if (!OPT.batch) continue; e.batch = new RigidBatch(e.root); }
    e.batch.sync();
  }
}
/** draws saved this frame by batching (for __dh.perf): parts merged, groups drawn */
export function batchStats() { let parts = 0, groups = 0, actors = 0; for (const e of ENTRIES) if (e.batch && e.root.parent) { actors++; for (const G of e.batch.groups) { groups++; for (const p of G.parts) if (p.merged) parts++; } } return { actors, groups, parts }; }
