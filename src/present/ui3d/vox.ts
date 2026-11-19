import { instanceMatrix, instanceColor, finishInstances } from "../engine/uploads";
// Small building blocks for the UI-layer models: static voxel models from cell callbacks (VoxChar, same block material and pixel
// bevel as the world), pixel icons extruded into relief, flat-shaded real-geometry prisms (octagon buttons: straight diagonals, no
// stair-stepped voxels), shared materials, and a pool of square pixel particles that lives in the UI scene.
import * as THREE from 'three';
import { VoxChar } from '../look/voxkit';
import { toon } from '../look/toon';
import { R } from '../engine/world';

export const hexN = (h: string) => parseInt(h.slice(1), 16);

/** A static voxel model: `fill(set)` places cells (x, y, z ints; y up, +z toward the camera). Returns a group centred on (cx, cy, cz). */
export function voxModel(cell: number, fill: (set: (x: number, y: number, z: number, c: number, glow?: number) => void) => void, o: { centre?: [number, number, number]; glow?: number; rim?: number; self?: number; edge?: number } = {}) {
  const v = new VoxChar(cell); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  fill((x, y, z, c, g = 0) => { v.set(x, y, z, c, g); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
  const g = new THREE.Group(); if (!v.cells.size) return g;
  const { root, meshes } = v.build({ jitter: 0, glow: o.glow ?? 2.2, rim: o.rim ?? 0.3, self: o.self ?? 0.08, edge: o.edge ?? 0.18 });
  const c = o.centre ?? [(x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2, (z0 + z1 + 1) / 2];
  root.position.set(-c[0] * cell, -c[1] * cell, -c[2] * cell); g.add(root);
  for (const m of meshes) { m.castShadow = false; m.receiveShadow = false; }
  root.traverse(o2 => { const m = o2 as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  g.userData.meshes = meshes; g.userData.size = [(x1 - x0 + 1) * cell, (y1 - y0 + 1) * cell, (z1 - z0 + 1) * cell];
  return g;
}

/** Extrude a pixel icon (rows of chars, top row first) into cells at depth z0..z0+d-1. pal maps a char to a colour (null = skip). */
export function iconCells(set: (x: number, y: number, z: number, c: number, g?: number) => void, rows: string[], ox: number, oy: number, z0: number, d: number, pal: (ch: string) => { c: number; g?: number } | null) {
  const H = rows.length;
  rows.forEach((row, r) => [...row].forEach((ch, x) => { if (ch === '.') return; const p = pal(ch); if (!p) return; for (let z = z0; z < z0 + d; z++) set(ox + x, oy + (H - 1 - r), z, p.c, p.g); }));
}

/** An octagonal prism along +z (flat edges horizontal / vertical), radius = centre → flat side. Flat shaded. */
export function octPrism(r: number, depth: number, r2 = r) {
  const R0 = r / Math.cos(Math.PI / 8), R1 = r2 / Math.cos(Math.PI / 8);
  const g = new THREE.CylinderGeometry(R1, R0, depth, 8, 1, false, Math.PI / 8); g.rotateX(Math.PI / 2);
  return g.toNonIndexed();
}

/** Flat-shaded toon material for real-geometry UI parts (stone, metal). */
export const flat = (c: number, o: { emissive?: number; ei?: number } = {}) => toon(c, { flat: true, rim: 0.4, self: 0.06, emissive: o.emissive, emissiveIntensity: o.ei });
/** Bright unlit colour (lamps, glows): values > 1 read as light after the tone map. */
export const lampMat = (c: number, k = 1.8) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });

// ---------------------------------------------------------------- square pixel particles in the UI scene
interface P { p: THREE.Vector3; v: THREE.Vector3; life: number; t: number; s: number; c: THREE.Color; grav: number; floor?: number }
export class UiSparks {
  mesh: THREE.InstancedMesh; private ps: P[] = []; private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private sc = new THREE.Vector3();
  constructor(scene: THREE.Scene, n = 240) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false }), n);
    this.mesh.count = 0; this.mesh.renderOrder = 30; this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  }
  /** p, v in scene units; size in scene units; c colour (values > 1 glow) */
  emit(p: THREE.Vector3, v: THREE.Vector3, size: number, c: THREE.ColorRepresentation, life = 0.5, grav = 0, k = 1.6, floor?: number) {
    if (this.ps.length >= this.mesh.instanceMatrix.count) this.ps.shift();
    this.ps.push({ p: p.clone(), v: v.clone(), life: life * R(0.8, 1.2), t: 0, s: size, c: new THREE.Color(c).multiplyScalar(k), grav, floor });
  }
  burst(p: THREE.Vector3, n: number, speed: number, size: number, c: THREE.ColorRepresentation, o: { life?: number; grav?: number; up?: number; k?: number; floor?: number } = {}) {
    for (let i = 0; i < n; i++) { const a = R(0, Math.PI * 2), s = speed * R(0.4, 1); this.emit(p, new THREE.Vector3(Math.cos(a) * s, Math.sin(a) * s + (o.up ?? 0), R(-0.2, 0.2) * s), size * R(0.7, 1.2), c, o.life ?? 0.5, o.grav ?? 0, o.k ?? 1.6, o.floor); }
  }
  update(dt: number) {
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const q = this.ps[i]; q.t += dt; if (q.t >= q.life) { this.ps.splice(i, 1); continue; }
      q.v.y -= q.grav * dt; q.p.addScaledVector(q.v, dt);
      if (q.floor != null && q.p.y < q.floor) { q.p.y = q.floor; q.v.y = Math.abs(q.v.y) * 0.3; q.v.x *= 0.6; }
    }
    for (const q of this.ps) {
      const k = q.t / q.life, s = q.s * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
      this.m4.compose(q.p, this.q, this.sc.set(s, s, s)); instanceMatrix(this.mesh, n, this.m4); instanceColor(this.mesh, n, q.c); n++;
    }
    this.mesh.count = n; finishInstances(this.mesh);
  }
}

/** A damped spring (squash, press, wobble). */
export class Spring { x = 0; v = 0; constructor(public k = 260, public d = 16) {} step(target: number, dt: number) { const h = Math.min(dt, 1 / 30); this.v += ((target - this.x) * this.k - this.v * this.d) * h; this.x += this.v * h; return this.x; } kick(v: number) { this.v += v; } }
