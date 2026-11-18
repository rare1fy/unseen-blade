import * as THREE from 'three';
import { CELL } from '../../bestiary/kit';
import { fxEmbers, fxRing } from '../../fx/fx';
import { hash, M } from '../../scenes/props';
import type { Ctx } from '../../scenes/stage';
import type { Rect } from '../types';
import { LY } from './ly_kit';

export const COPPER_Y = -9 * CELL;
const CRUST = 0.98;
// Centres as fractions of the crucible; width and depth in metres.
const RAFTS = [
  [0.12, 0.28, 1.8, 2.4], [0.16, 0.69, 2.6, 1.4], [0.36, 0.20, 2.1, 1.5],
  [0.44, 0.52, 2.9, 2.1], [0.59, 0.78, 2.8, 1.4], [0.61, 0.32, 1.6, 2.8],
  [0.87, 0.21, 2.2, 1.3], [0.86, 0.63, 2.4, 2.2],
];
function rafts(p: Rect): Rect[] {
  return RAFTS.map(([u, v, w, d]) => {
    const x = p.x0 + (p.x1 - p.x0) * u, z = p.z0 + (p.z1 - p.z0) * v;
    return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
  });
}

/** Furnace refractory, slag shelf and floating crust all share the static room batch. */
export function castPit(c: Ctx, p: Rect, room: Rect) {
  const layer = (x0: number, z0: number, x1: number, z1: number, bottom: number, top: number, color: number) =>
    c.w.box(M(x0), bottom, M(z0), M(x1) - 1, top, M(z1) - 1, color);
  const band = (inset: number, width: number, bottom: number, top: number, color: number) => {
    const x0 = p.x0 + inset, z0 = p.z0 + inset, x1 = p.x1 - inset, z1 = p.z1 - inset;
    layer(x0, z0, x1, z0 + width, bottom, top, color);
    layer(x0, z1 - width, x1, z1, bottom, top, color);
    layer(x0, z0 + width, x0 + width, z1 - width, bottom, top, color);
    layer(x1 - width, z0 + width, x1, z1 - width, bottom, top, color);
  };
  layer(p.x0, p.z0, p.x1, p.z1, -11, -11, 0xc8401a);
  band(0, CRUST, -10, -9, 0x3a2622);
  band(0, 0.28, -9, -2, 0xa64b29);
  band(0, 0.28, -2, -1, LY.stoneD);
  for (const [i, q] of rafts(p).entries()) {
    layer(q.x0, q.z0, q.x1, q.z1, -10, -8, i % 2 ? 0x5a3420 : 0x3a2622);
    layer(q.x0 + 0.21, q.z0 + 0.21, q.x1 - 0.28, q.z1 - 0.21, -7, -7, i % 2 ? 0x463028 : 0x523224);
  }
  // Fire-coloured bounce remains readable even on the low-light rig. Keep the paving joints
  // and the facing bricks' original values; tint whole bands by distance to the crucible.
  const warm = (x: number, y: number, z: number, strength: number) => {
    const cell = c.w.get(x, y, z);
    if (!cell || cell.g) return;
    const col = cell.c;
    const red = Math.min(255, (col >>> 16) + Math.round(52 * strength));
    const green = Math.min(255, ((col >>> 8) & 255) + Math.round(12 * strength));
    cell.c = (red << 16) | (green << 8) | Math.round((col & 255) * (1 - 0.22 * strength));
  };
  for (let x = M(p.x0 - 2); x < M(p.x1 + 2); x++) for (let z = M(p.z0 - 2); z < M(p.z1 + 2); z++) {
    const px = (x + 0.5) * CELL, pz = (z + 0.5) * CELL;
    const distance = Math.max(p.x0 - px, px - p.x1, p.z0 - pz, pz - p.z1);
    if (distance > 0) warm(x, -1, z, distance < 0.8 ? 0.9 : 0.4);
  }
  for (const x of [M(room.x0) - 1, M(room.x1)]) {
    for (let z = M(p.z0); z < M(p.z1); z++) for (let y = 0; y < 16; y++)
      warm(x, y, z, y < 7 ? 0.7 : 0.35);
  }
  const dx = p.x1 - p.x0;
  c.light([p.x0 + dx * 0.24, 0.48, p.z1 - 0.5], 0xff792b, 6.5, 11);
  c.light([p.x0 + dx * 0.76, 0.48, p.z0 + 0.5], 0xff8a36, 6.5, 11);
  c.ambient({ kind: 'embers', area: p, y: [COPPER_Y + 0.1, -0.15], rate: 4, color: 0xffa33a });
}

/** A single unlit surface. Each small group of hot fissures has its own phase. */
export class LiquidCopper {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly colors: THREE.Float32BufferAttribute;
  private readonly phases: number[] = [];
  private readonly firstSeam: number;
  private readonly hot = new THREE.Color(0xffb040);
  private readonly blocked: Rect[];
  private bubbleIn = 1.4;
  private sequence = 0;
  constructor(private pit: Rect, bridges: Rect[], private seed: number) {
    const p = pit, plates = rafts(p);
    this.blocked = [...plates, ...bridges];
    const xyz: number[] = [], rgb: number[] = [], indices: number[] = [];
    const quad = (x0: number, z0: number, x1: number, z1: number, y: number, col: THREE.Color) => {
      const i = xyz.length / 3;
      xyz.push(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0);
      for (let k = 0; k < 4; k++) rgb.push(col.r, col.g, col.b);
      indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    };
    // Long pools of different temperatures, interpolated over metre-scale faces.
    const dx = (p.x1 - p.x0) / 4, dz = (p.z1 - p.z0) / 3;
    const base = new THREE.Color(0xc8401a), amber = new THREE.Color(0xef7026);
    for (let j = 0; j <= 3; j++) for (let i = 0; i <= 4; i++) {
      const k = xyz.length / 3;
      xyz.push(p.x0 + i * dx, COPPER_Y, p.z0 + j * dz);
      const col = base.clone().lerp(amber, hash(seed, i, j) * 0.9);
      rgb.push(col.r, col.g, col.b);
      if (i < 4 && j < 3) indices.push(k, k + 5, k + 6, k, k + 6, k + 1);
    }
    this.firstSeam = xyz.length / 3;
    const x0 = p.x0 + CRUST, x1 = p.x1 - CRUST, z0 = p.z0 + CRUST, z1 = p.z1 - CRUST;
    const seam = (a: number, b: number, e: number, f: number, phase: number) => {
      quad(a, b, e, f, COPPER_Y + 0.009, this.hot);
      this.phases.push(phase);
    };
    seam(x0, z0, x1, z0 + 0.16, 0);
    seam(x0, z1 - 0.21, x1, z1, 2);
    seam(x0, z0 + 0.16, x0 + 0.14, z1 - 0.21, 3);
    seam(x1 - 0.18, z0 + 0.16, x1, z1 - 0.21, 5);
    for (const [i, q] of plates.entries()) {
      const phase = hash(seed, i, 18) * Math.PI * 2;
      const end = Math.min(x1, q.x1 + 0.7 + hash(seed, i, 19) * 1.4);
      const edge = i % 2 ? q.z1 : q.z0 - 0.28;
      seam(q.x0 - 0.18, edge, end, edge + 0.28, phase);
      seam(q.x0 - 0.18, q.z0, q.x0, q.z1, phase);
      const branch = i % 3 === 0 ? 1.65 : 0.7;
      if (i % 2) seam(end - 0.27, edge + 0.28, end, edge + branch, phase);
      else seam(end - 0.22, Math.max(z0, edge - branch), end, edge, phase);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
    this.colors = new THREE.Float32BufferAttribute(rgb, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('color', this.colors);
    geo.setIndex(indices);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.mesh.name = 'moltenSurface';
  }

  update(time: number, dt: number) {
    for (const [i, phase] of this.phases.entries()) {
      const k = 0.9 + 0.1 * Math.sin(time * 2 * Math.PI / 2.5 + phase);
      for (let j = 0; j < 4; j++) this.colors.setXYZ(this.firstSeam + i * 4 + j, this.hot.r * k, this.hot.g * k, this.hot.b * k);
    }
    this.colors.needsUpdate = true;
    this.bubbleIn -= dt;
    if (this.bubbleIn > 0) return;
    const rnd = () => hash(this.seed, ++this.sequence, 61);
    this.bubbleIn = 1 + rnd();
    const p = this.pit, margin = CRUST + 0.45;
    for (let i = 0; i < 32; i++) {
      const x = p.x0 + margin + rnd() * (p.x1 - p.x0 - 2 * margin);
      const z = p.z0 + margin + rnd() * (p.z1 - p.z0 - 2 * margin);
      if (this.blocked.some(q => x > q.x0 - 0.4 && x < q.x1 + 0.4 && z > q.z0 - 0.4 && z < q.z1 + 0.4)) continue;
      const at = new THREE.Vector3(x, COPPER_Y + 0.05, z);
      fxRing(at, 0xffac42, 0.38, { life: 0.36, width: 0.2, fill: 0.05 });
      fxEmbers(at, 0xffbd50, 5, { r: 0.12, up: 1.6, life: 0.55 });
      break;
    }
  }
}
