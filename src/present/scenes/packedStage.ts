import { CELL } from '../bestiary/kit';
import type { TerrainLight } from './terrainLight';
import * as THREE from 'three';
import { inflateSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { voxToon, glowMat } from '../look/voxkit';
import { OPT } from '../engine/perfOpts';
import { shadowTiles, restoreShadowTiles, type ShadowLayout } from '../engine/shadowTiles';
import { smoke as templeSmoke } from '../asm/hanmo/hj_temple_kit';
import { smoke as villageSmoke } from '../asm/ninja/village_kit';
import type { Ctx } from './stage';

type Part = { start: number; size: number; raw: number };
type Span = { start: number; size: number };
type Attribute = {
  name: string;
  type: 'Float32Array' | 'Uint16Array' | 'Uint32Array';
  itemSize: number;
  count: number;
  parts: Part[];
  faces?: { width: number; itemSize: number; type: Attribute['type']; table: Attribute; origins?: Attribute };
};
type VoxelQuads = {
  nq: number;
  dirCounts?: number[];
  plane: Span;
  w0: Span;
  u0: Span;
  su: Span & { bytes: 1 | 2 };
  sw: Span & { bytes: 1 | 2 };
  palRgb: Span;
  palIdx: Span & { bytes: 1 | 2 };
  ao: Span;
  open: Span;
};
type PackedTilesV1 = Pick<ShadowLayout, 'tiles' | 'groups'> & { order: Attribute; groupOf: Attribute; partner: Attribute };
type PackedTilesV2 = Pick<ShadowLayout, 'tiles'> & { pCode: Span; pExtra?: Span };
type Surface = {
  material: 'terrain' | 'glow' | 'flora' | 'plain';
  glow: number;
  plain?: object;
  cut: boolean;
  shadow: boolean;
  tiles?: PackedTilesV1 | PackedTilesV2;
  receive: boolean;
  order: number;
  name: string;
  matrix: number[];
  attributes?: Attribute[];
  voxel?: VoxelQuads;
};
type Operation = [string, ...any[]];
type Meta = { version: number; ops: Operation[]; meshes: Surface[]; light?: Omit<TerrainLight, 'depth'> & { start: number; length: number }; report?: object };
type WxFiles = { loadSubpackage(o: object): void; getFileSystemManager(): { readFile(o: object): void } };
const recent = new Map<string, Promise<Uint8Array | null>>();
export function readStagePack(key: string): Promise<Uint8Array | null> {
  const globals = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
  const path = (globals as { __ubStageFiles?: Record<string, string> }).__ubStageFiles?.[key];
  if (!path) return Promise.resolve(null);
  const cached = recent.get(key);
  if (cached) return cached;
  const api = typeof wx !== 'undefined' ? (wx as WxFiles) : (globalThis as unknown as { wx: WxFiles }).wx;
  const request = new Promise<Uint8Array>((resolve, reject) => {
    const read = () => {
      try {
        api.getFileSystemManager().readFile({
          filePath: path,
          success: (result: { data: ArrayBuffer }) => resolve(new Uint8Array(result.data)),
          fail: reject,
        });
      } catch (error) { reject(error); }
    };
    if (path.startsWith('assets/')) read();
    else api.loadSubpackage({ name: path.split('/')[0], success: read, fail: reject });
  }).catch((e) => {
    if (recent.get(key) === request) recent.delete(key);
    console.warn('[stage] using procedural build', key, e);
    return null;
  });
  recent.set(key, request);
  if (recent.size > 3) recent.delete(recent.keys().next().value!);
  return request;
}
const constructors = { Float32Array, Uint16Array, Uint32Array };
const V_DIRS: ReadonlyArray<readonly [number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const V_ORDER = [3, 4, 0, 1, 2, 5];
const V_AO = [0.52, 0.7, 0.86, 1];

function alignedBuffer(u: Uint8Array): ArrayBuffer {
  return (u.byteOffset & 3) === 0 ? (u.buffer as ArrayBuffer) : u.slice().buffer;
}
function alignedOffset(u: Uint8Array): number {
  return (u.byteOffset & 3) === 0 ? u.byteOffset : 0;
}
function inflateSpan(file: Uint8Array, base: number, span: Span): Uint8Array {
  return inflateSync(file.subarray(base + span.start, base + span.start + span.size));
}
function decodeDeltaU16(packed: Uint8Array, n: number): Int16Array {
  const out = new Int16Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc = (acc + (packed[i] | (packed[n + i] << 8))) & 0xffff;
    out[i] = acc - 32768;
  }
  return out;
}
function decodeRawU16(packed: Uint8Array, n: number): Uint16Array {
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) out[i] = packed[i] | (packed[n + i] << 8);
  return out;
}
function decodeDeltaU16Unsigned(packed: Uint8Array, n: number): Uint16Array {
  const out = new Uint16Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc = (acc + (packed[i] | (packed[n + i] << 8))) & 0xffff;
    out[i] = acc;
  }
  return out;
}
function* decodeVoxelMesh(file: Uint8Array, base: number, v: VoxelQuads, tiles?: PackedTilesV2['tiles']): Generator<void, THREE.BufferGeometry> {
  const nq = v.nq;
  const plane = decodeDeltaU16(inflateSpan(file, base, v.plane), nq); yield;
  const w0 = decodeDeltaU16(inflateSpan(file, base, v.w0), nq); yield;
  const u0 = decodeDeltaU16(inflateSpan(file, base, v.u0), nq); yield;
  const suRaw = inflateSpan(file, base, v.su);
  const su = v.su.bytes === 1 ? suRaw : decodeRawU16(suRaw, nq);
  const swRaw = inflateSpan(file, base, v.sw);
  const sw = v.sw.bytes === 1 ? swRaw : decodeRawU16(swRaw, nq);
  const palBuf = inflateSpan(file, base, v.palRgb);
  const palRgb = new Float32Array(alignedBuffer(palBuf), alignedOffset(palBuf), palBuf.byteLength >> 2);
  const palIdxRaw = inflateSpan(file, base, v.palIdx);
  const palIdx = v.palIdx.bytes === 1 ? palIdxRaw : decodeDeltaU16Unsigned(palIdxRaw, nq);
  const ao = inflateSpan(file, base, v.ao);
  const open = inflateSpan(file, base, v.open);
  yield;

  const P = new Float32Array(nq * 12), N = new Float32Array(nq * 12), C = new Float32Array(nq * 12);
  const U = new Float32Array(nq * 8), S = new Float32Array(nq * 8), E = new Float32Array(nq * 16);
  const I = nq * 4 > 65535 ? new Uint32Array(nq * 6) : new Uint16Array(nq * 6);

  // Build contiguous direction segments (either per tile in V_ORDER or global dirCounts in V_ORDER)
  const segDir: number[] = [], segEnd: number[] = [];
  if (tiles) {
    let baseQ = 0;
    for (let ti = 0; ti < tiles.length; ti++) {
      const ends = tiles[ti].ends;
      let prev = 0;
      for (let s = 0; s < 6; s++) {
        const end = ends[s] / 6;
        if (end > prev) { segDir.push(V_ORDER[s]); segEnd.push(baseQ + end); }
        prev = end;
      }
      baseQ += prev;
    }
  } else if (v.dirCounts) {
    let acc = 0;
    for (let s = 0; s < 6; s++) {
      if (v.dirCounts[s] > 0) { acc += v.dirCounts[s]; segDir.push(V_ORDER[s]); segEnd.push(acc); }
    }
  }

  let q = 0;
  for (let si = 0; si < segDir.length; si++) {
    const d = segDir[si], endQ = segEnd[si];
    const [dx, dy, dz] = V_DIRS[d];
    const pos = dx + dy + dz > 0;
    for (; q < endQ; q++) {
      const pl = plane[q], uu = u0[q], ww = w0[q], dsu = su[q], dsw = sw[q];
      const u1 = uu + dsu, w1 = ww + dsw;
      const vp = q * 12;
      if (dx) {
        const x = pl * CELL, y0 = uu * CELL, y1 = u1 * CELL, z0 = ww * CELL, z1 = w1 * CELL;
        P[vp] = x; P[vp + 1] = y0; P[vp + 2] = z0;
        P[vp + 3] = x; P[vp + 4] = y1; P[vp + 5] = z0;
        P[vp + 6] = x; P[vp + 7] = y1; P[vp + 8] = z1;
        P[vp + 9] = x; P[vp + 10] = y0; P[vp + 11] = z1;
      } else if (dy) {
        const y = pl * CELL, z0 = uu * CELL, z1 = u1 * CELL, x0 = ww * CELL, x1 = w1 * CELL;
        P[vp] = x0; P[vp + 1] = y; P[vp + 2] = z0;
        P[vp + 3] = x0; P[vp + 4] = y; P[vp + 5] = z1;
        P[vp + 6] = x1; P[vp + 7] = y; P[vp + 8] = z1;
        P[vp + 9] = x1; P[vp + 10] = y; P[vp + 11] = z0;
      } else {
        const z = pl * CELL, x0 = uu * CELL, x1 = u1 * CELL, y0 = ww * CELL, y1 = w1 * CELL;
        P[vp] = x0; P[vp + 1] = y0; P[vp + 2] = z;
        P[vp + 3] = x1; P[vp + 4] = y0; P[vp + 5] = z;
        P[vp + 6] = x1; P[vp + 7] = y1; P[vp + 8] = z;
        P[vp + 9] = x0; P[vp + 10] = y1; P[vp + 11] = z;
      }
      N[vp] = dx; N[vp + 1] = dy; N[vp + 2] = dz;
      N[vp + 3] = dx; N[vp + 4] = dy; N[vp + 5] = dz;
      N[vp + 6] = dx; N[vp + 7] = dy; N[vp + 8] = dz;
      N[vp + 9] = dx; N[vp + 10] = dy; N[vp + 11] = dz;

      const pc = palIdx[q] * 3, r = palRgb[pc], g = palRgb[pc + 1], b = palRgb[pc + 2];
      const am = ao[q], a0 = am & 3, a1 = (am >> 2) & 3, a2 = (am >> 4) & 3, a3 = (am >> 6) & 3;
      const f0 = V_AO[a0], f1 = V_AO[a1], f2 = V_AO[a2], f3 = V_AO[a3];
      C[vp] = r * f0; C[vp + 1] = g * f0; C[vp + 2] = b * f0;
      C[vp + 3] = r * f1; C[vp + 4] = g * f1; C[vp + 5] = b * f1;
      C[vp + 6] = r * f2; C[vp + 7] = g * f2; C[vp + 8] = b * f2;
      C[vp + 9] = r * f3; C[vp + 10] = g * f3; C[vp + 11] = b * f3;

      const vu = q * 8;
      U[vu] = 0; U[vu + 1] = 0; U[vu + 2] = dsu; U[vu + 3] = 0; U[vu + 4] = dsu; U[vu + 5] = dsw; U[vu + 6] = 0; U[vu + 7] = dsw;
      S[vu] = dsu; S[vu + 1] = dsw; S[vu + 2] = dsu; S[vu + 3] = dsw; S[vu + 4] = dsu; S[vu + 5] = dsw; S[vu + 6] = dsu; S[vu + 7] = dsw;

      const om = open[q], o0 = om & 1, o1 = (om >> 1) & 1, o2 = (om >> 2) & 1, o3 = (om >> 3) & 1;
      const ve = q * 16;
      E[ve] = o0; E[ve + 1] = o1; E[ve + 2] = o2; E[ve + 3] = o3;
      E[ve + 4] = o0; E[ve + 5] = o1; E[ve + 6] = o2; E[ve + 7] = o3;
      E[ve + 8] = o0; E[ve + 9] = o1; E[ve + 10] = o2; E[ve + 11] = o3;
      E[ve + 12] = o0; E[ve + 13] = o1; E[ve + 14] = o2; E[ve + 15] = o3;

      const vi = q * 6, vb = q * 4;
      const flip = a0 + a2 < a1 + a3;
      if (flip) {
        if (pos) { I[vi] = vb + 1; I[vi + 1] = vb + 2; I[vi + 2] = vb + 3; I[vi + 3] = vb + 1; I[vi + 4] = vb + 3; I[vi + 5] = vb; }
        else { I[vi] = vb + 1; I[vi + 1] = vb + 3; I[vi + 2] = vb + 2; I[vi + 3] = vb + 1; I[vi + 4] = vb; I[vi + 5] = vb + 3; }
      } else {
        if (pos) { I[vi] = vb; I[vi + 1] = vb + 1; I[vi + 2] = vb + 2; I[vi + 3] = vb; I[vi + 4] = vb + 2; I[vi + 5] = vb + 3; }
        else { I[vi] = vb; I[vi + 1] = vb + 2; I[vi + 2] = vb + 1; I[vi + 3] = vb; I[vi + 4] = vb + 3; I[vi + 5] = vb + 2; }
      }
      if ((q & 2047) === 2047) yield;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geometry.setAttribute('aVox', new THREE.BufferAttribute(U, 2));
  geometry.setAttribute('aOpen', new THREE.BufferAttribute(E, 4));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(S, 2));
  geometry.setIndex(new THREE.BufferAttribute(I, 1));
  return geometry;
}
function decodePartnerV2(file: Uint8Array, base: number, layout: PackedTilesV2, nq: number): Int32Array {
  const code = inflateSpan(file, base, layout.pCode);
  const extraRaw = layout.pExtra ? inflateSpan(file, base, layout.pExtra) : null;
  const extra = extraRaw ? new Int32Array(alignedBuffer(extraRaw), alignedOffset(extraRaw), extraRaw.byteLength >> 2) : null;
  const partner = new Int32Array(nq);
  let ei = 0;
  for (let i = 0; i < nq; i++) {
    const c = code[i];
    if (c === 0) partner[i] = 0;
    else if (c === 1) partner[i] = -1;
    else if (c === 255) partner[i] = i + extra![ei++] + 1;
    else partner[i] = i + (c - 1) + 1;
  }
  return partner;
}
function* decodeAttribute(file: Uint8Array, base: number, a: Attribute): Generator<void, THREE.BufferAttribute> {
  const array = new constructors[a.type](a.count);
  const bytes = array.BYTES_PER_ELEMENT;
  const words = bytes === 2 ? new Uint16Array(array.buffer) : new Uint32Array(array.buffer);
  let offset = 0;
  for (const part of a.parts) {
    const packed = inflateSync(file.subarray(base + part.start, base + part.start + part.size));
    const n = part.raw / bytes;
    if (packed.length !== part.raw || offset + n > array.length) throw new Error('Invalid scenery buffer');
    for (let j = 0; j < n; j++) {
      let delta = packed[j] | (packed[j + n] << 8);
      if (bytes === 4) delta |= (packed[j + 2 * n] << 16) | (packed[j + 3 * n] << 24);
      words[offset + j] = delta + (j >= a.itemSize ? words[offset + j - a.itemSize] : 0);
    }
    offset += n;
    yield;
  }
  if (offset !== array.length) throw new Error('Incomplete scenery buffer');
  if (!a.faces) return new THREE.BufferAttribute(array, a.itemSize);
  const { width, itemSize, type, table, origins } = a.faces;
  const patterns = (yield* decodeAttribute(file, base, table)).array;
  const coords = origins ? (yield* decodeAttribute(file, base, origins)).array : null;
  const result = new constructors[type](array.length * width);
  for (let q = 0; q < array.length; q++) {
    const start = array[q] * width;
    for (let j = 0; j < width; j++) {
      const v = patterns[start + j];
      result[q * width + j] = coords ? (coords[q * 3 + j % 3] - 32768 + v) * CELL : a.name === 'index' ? q * 4 + v : v;
    }
    if ((q & 2047) === 2047) yield;
  }
  return new THREE.BufferAttribute(result, itemSize);
}
export function* unpackStage(file: Uint8Array, ctx: Ctx, root: THREE.Group, cut: THREE.Group, report?: object) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0, true) !== 0x314b4255) throw new Error('Invalid scenery pack');
  const base = 8 + view.getUint32(4, true),
    meta: Meta = JSON.parse(strFromU8(inflateSync(file.subarray(8, base))));
  if (meta.version !== 1 && meta.version !== 2) throw new Error('Unsupported scenery pack');
  for (const surface of meta.meshes) {
    let geometry: THREE.BufferGeometry;
    if (surface.voxel) {
      geometry = yield* decodeVoxelMesh(file, base, surface.voxel, surface.tiles?.tiles);
    } else {
      geometry = new THREE.BufferGeometry();
      for (const attr of surface.attributes ?? []) {
        const a = yield* decodeAttribute(file, base, attr);
        if (attr.name === 'index') geometry.setIndex(a);
        else geometry.setAttribute(attr.name, a);
      }
    }
    const material =
      surface.material === 'flora'
        ? voxToon({ rim: 0.2, self: 0.16, edge: 0.1, hole: true })
        : surface.material === 'terrain'
          ? voxToon({ rim: 0.35, self: 0.03, edge: 0.16, hole: true })
          : surface.material === 'glow'
            ? glowMat(surface.glow)
            : new THREE.MaterialLoader().parse(surface.plain as never);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = surface.name; mesh.userData.packedStatic = true;
    mesh.matrix.fromArray(surface.matrix);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = surface.shadow;
    mesh.receiveShadow = surface.receive;
    mesh.renderOrder = surface.order;
    const parent = surface.cut ? cut : root;
    parent.add(mesh);
    if (surface.material === 'terrain') {
      mesh.userData.stageTerrain = !surface.cut;
      const layout = surface.tiles;
      let tiles: THREE.Mesh[];
      if (OPT.packedLighting && layout) {
        if ('pCode' in layout) {
          const nq = geometry.index!.count / 6;
          const partner = decodePartnerV2(file, base, layout, nq);
          tiles = yield* restoreShadowTiles(mesh, { tiles: layout.tiles, partner });
        } else {
          const order = (yield* decodeAttribute(file, base, layout.order)).array as Uint32Array;
          const groupOf = (yield* decodeAttribute(file, base, layout.groupOf)).array as Uint32Array;
          const partner = (yield* decodeAttribute(file, base, layout.partner)).array;
          tiles = yield* restoreShadowTiles(mesh, { ...layout, order, groupOf, partner: new Int32Array(partner.buffer) });
        }
      } else tiles = shadowTiles(mesh);
      if (tiles.length) {
        mesh.castShadow = false;
        mesh.userData.shadowTiled = true;
        parent.add(...tiles);
      }
    }
    yield;
  }
  for (const [i, op] of meta.ops.entries()) {
    const [name, ...args] = op;
    if (name === 'card') ctx.cards.add(...(args as Parameters<Ctx['cards']['add']>));
    else if (name === 'templeSmoke' || name === 'villageSmoke')
      (name === 'templeSmoke' ? templeSmoke : villageSmoke)(
        ctx,
        ...(args as Parameters<typeof templeSmoke> extends [Ctx, ...infer P] ? P : never)
      );
    else if (['light', 'flame', 'water', 'earthHole', 'rune', 'cutEaves', 'ambient', 'shaft'].includes(name))
      (ctx[name as keyof Ctx] as (...a: unknown[]) => void)(...args);
    else throw new Error('Unknown scenery operation ' + name);
    if ((i & 127) === 127) yield;
  }
  if (report && meta.report) Object.assign(report, meta.report);
  if (!meta.light || !OPT.packedLighting) return null;
  const { start, length, ...light } = meta.light;
  const depth = inflateSync(file.subarray(base + start, base + start + length));
  if (depth.length !== light.size * light.size) throw Error('Invalid baked light size');
  return { ...light, depth };
}
