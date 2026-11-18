import * as THREE from 'three';
import { inflateSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { voxToon, glowMat } from '../look/voxkit';
import { shadowTiles } from '../engine/shadowTiles';
import { smoke as templeSmoke } from '../asm/hanmo/hj_temple_kit';
import { smoke as villageSmoke } from '../asm/ninja/village_kit';
import type { Ctx } from './stage';

type Part = { start: number; size: number; raw: number };
type Attribute = {
  name: string;
  type: 'Float32Array' | 'Uint16Array' | 'Uint32Array';
  itemSize: number;
  count: number;
  parts: Part[];
};
type Surface = {
  material: 'terrain' | 'glow' | 'flora' | 'plain';
  glow: number;
  plain?: object;
  cut: boolean;
  shadow: boolean;
  receive: boolean;
  order: number;
  name: string;
  matrix: number[];
  attributes: Attribute[];
};
type Operation = [string, ...any[]];
type Meta = { version: number; ops: Operation[]; meshes: Surface[]; report?: object };
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
function* decodeAttribute(file: Uint8Array, base: number, a: Attribute) {
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
  return new THREE.BufferAttribute(array, a.itemSize);
}
export function* unpackStage(file: Uint8Array, ctx: Ctx, root: THREE.Group, cut: THREE.Group, report?: object) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0, true) !== 0x314b4255) throw new Error('Invalid scenery pack');
  const base = 8 + view.getUint32(4, true),
    meta: Meta = JSON.parse(strFromU8(inflateSync(file.subarray(8, base))));
  if (meta.version !== 1) throw new Error('Unsupported scenery pack');
  for (const surface of meta.meshes) {
    const geometry = new THREE.BufferGeometry();
    for (const attr of surface.attributes) {
      const a = yield* decodeAttribute(file, base, attr);
      if (attr.name === 'index') geometry.setIndex(a);
      else geometry.setAttribute(attr.name, a);
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
    mesh.name = surface.name;
    mesh.matrix.fromArray(surface.matrix);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = surface.shadow;
    mesh.receiveShadow = surface.receive;
    mesh.renderOrder = surface.order;
    const parent = surface.cut ? cut : root;
    parent.add(mesh);
    if (surface.material === 'terrain') {
      const tiles = shadowTiles(mesh);
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
}
