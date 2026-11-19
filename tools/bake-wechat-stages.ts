import { bakeTerrainLight } from '../src/present/scenes/terrainLight';
// Run by build-wechat.mjs through vite-node, with the same room definitions as the game.
import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import * as THREE from 'three';
// The HUD allocates a measurement canvas when imported. Baking never draws UI.
Object.assign(globalThis, {
  OffscreenCanvas: class {
    getContext() {
      return {};
    }
  },
});
const { roomDefinition } = await import('../src/present/act/show');
const { titleDefinition } = await import('../src/present/act/title');
import { ROOM_MAPS } from '../src/present/asm/roomMaps';
import { REGIONS } from '../src/present/act/regions';
import { shadowBake, type ShadowLayout } from '../src/present/engine/shadowTiles';
import { ASM_QA } from '../src/present/asm/assemble';
import { VoxWorld } from '../src/present/look/voxkit';
import { quietBattleGlow } from '../src/present/scenes/battleGlow';
import { Cards } from '../src/present/scenes/cards';
import { CELL } from '../src/present/bestiary/kit';
import { finishBuild } from '../src/present/engine/buildSteps';
import type { SceneDef, Ctx } from '../src/present/scenes/stage';

const out = process.env.UB_STAGE_OUT!;
if (!out) throw Error('No scenery output directory');
fs.mkdirSync(out, { recursive: true });
ASM_QA.floating = false;
function bake(def: SceneDef, combat: boolean, report?: any) {
  const chunks: Buffer[] = [],
    ops: unknown[][] = [],
    meshes: object[] = [];
  let size = 0;
  const terrain: THREE.Mesh[] = [];
  const shadows = new WeakMap<THREE.Mesh, ShadowLayout>();
  shadowBake.capture = (mesh, layout) => shadows.set(mesh, layout);
  function attribute(name: string, a: THREE.BufferAttribute) {
    const array = a.array,
      bytes = array.BYTES_PER_ELEMENT;
    if (bytes !== 2 && bytes !== 4) throw Error('Unexpected geometry format');
    const words =
      bytes === 2
        ? new Uint16Array(array.buffer, array.byteOffset, array.length)
        : new Uint32Array(array.buffer, array.byteOffset, array.length);
    const parts = [];
    for (let offset = 0; offset < words.length;) {
      const n = Math.min(32768, words.length - offset),
        raw = Buffer.alloc(n * bytes);
      for (let j = 0; j < n; j++) {
        const delta = words[offset + j] - (j >= a.itemSize ? words[offset + j - a.itemSize] : 0);
        for (let b = 0; b < bytes; b++) raw[b * n + j] = delta >>> (8 * b);
      }
      const packed = deflateRawSync(raw, { level: 6 });
      parts.push({ start: size, size: packed.length, raw: raw.length });
      chunks.push(packed);
      size += packed.length;
      offset += n;
    }
    return { name, type: array.constructor.name, itemSize: a.itemSize, count: array.length, parts };
  }
  // The four vertices of a voxel face repeat a small vocabulary of colours, edges and normals.
  // Store one dictionary index per face. Coordinates use the exact 7 cm grid, indices the local quad.
  function faceAttribute(name: string, a: THREE.BufferAttribute) {
    const index = name === 'index', grid = name === 'position', width = index ? 6 : 4 * a.itemSize;
    const rows = a.array.length / width;
    if (!Number.isInteger(rows)) return attribute(name, a);
    const dictionary: number[] = [], ids = new Map<string, number>(), codes = new Uint16Array(rows);
    const origins = grid ? new Uint16Array(rows * 3) : undefined;
    for (let q = 0; q < rows; q++) {
      const row: number[] = [];
      for (let j = 0; j < width; j++) {
        const value = a.array[q * width + j];
        if (grid) {
          const cell = Math.round(value / CELL);
          if (Math.fround(cell * CELL) !== value || Math.abs(cell) > 32767) return attribute(name, a);
          if (j < 3) origins![q * 3 + j] = cell + 32768;
          row.push(cell - (origins![q * 3 + j % 3] - 32768));
        } else row.push(value - (index ? 4 * q : 0));
      }
      const key = row.join(',');
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        if (id > 65535) return attribute(name, a);
        ids.set(key, id); dictionary.push(...row);
      }
      codes[q] = id;
    }
    return { ...attribute(name, new THREE.BufferAttribute(codes, 1)), faces: {
      width, itemSize: a.itemSize, type: a.array.constructor.name,
      table: attribute('table', new THREE.Float32BufferAttribute(dictionary, width)),
      origins: origins && attribute('origins', new THREE.BufferAttribute(origins, 3)),
    } };
  }
  function add(obj: THREE.Object3D, source = 'plain', cut = false) {
    if (obj.userData.stageEffect) {
      ops.push(obj.userData.stageEffect);
      return;
    }
    if (!(obj as THREE.Mesh).isMesh || obj.children.length)
      throw Error('Unregistered stage effect in ' + def.id + ' ' + obj.type);
    const mesh = obj as THREE.Mesh,
      mat = mesh.material as THREE.Material,
      geo = mesh.geometry;
    if (mesh.name === 'shadowTile') {
      geo.dispose();
      return;
    }
    const material = mesh.name === 'flora' ? 'flora' : source;
    if (!cut && material === 'terrain') terrain.push(mesh);
    if (material === 'plain' && !['MeshLambertMaterial', 'MeshStandardMaterial', 'MeshBasicMaterial'].includes(mat.type))
      throw Error('Unregistered scenery material ' + mat.type);
    mesh.updateMatrix();
    const encode = source === 'terrain' || source === 'glow' ? faceAttribute : attribute;
    const attributes = Object.entries(geo.attributes).map(([k, v]) => encode(k, v as THREE.BufferAttribute));
    if (geo.index) attributes.push(encode('index', geo.index));
    const layout = shadows.get(mesh);
    const tiles = layout && {
      tiles: layout.tiles, groups: layout.groups,
      order: attribute('order', new THREE.BufferAttribute(layout.order, 1)),
      groupOf: attribute('groupOf', new THREE.BufferAttribute(layout.groupOf, 1)),
      partner: attribute('partner', new THREE.BufferAttribute(new Uint32Array(layout.partner.buffer), 1)),
    };
    meshes.push({
      tiles,
      material,
      plain: material === 'plain' ? mat.toJSON() : undefined,
      glow: cut ? 2.6 : combat ? 1.35 : (def.mood.glowK ?? 2.6),
      cut,
      shadow: mesh.castShadow || !!mesh.userData.shadowTiled,
      receive: mesh.receiveShadow,
      order: mesh.renderOrder,
      name: mesh.name,
      matrix: mesh.matrix.toArray(),
      attributes,
    });
    if (!terrain.includes(mesh)) geo.dispose();
  }
  const w = new VoxWorld(CELL, true),
    cut = new VoxWorld(CELL, true),
    cards = new Cards();
  const addCard = cards.add.bind(cards);
  cards.add = (...args) => {
    ops.push(['card', ...args]);
    return addCard(...args);
  };
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      ops.push([name, ...args]);
    };
  const ctx: Ctx = {
    w,
    cut,
    cards,
    light: record('light'),
    flame: record('flame'),
    water: record('water'),
    earthHole: record('earthHole'),
    rune: record('rune'),
    cutEaves: record('cutEaves'),
    ambient: record('ambient'),
    shaft: record('shaft'),
    add: (o) => add(o),
    onPhase() {
      throw Error('Unregistered phase effect in ' + def.id);
    },
  };
  if (def.buildSteps) finishBuild(def.buildSteps(ctx));
  else def.build(ctx);
  if (combat) quietBattleGlow(w);
  for (const [world, isCut] of [
    [w, false],
    [cut, true],
  ] as const) {
    if (!world.cells.size) continue;
    for (const m of world.build({ glow: isCut ? 2.6 : combat ? 1.35 : (def.mood.glowK ?? 2.6) }))
      add(m, (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial ? 'glow' : 'terrain', isCut);
    world.cells.clear();
  }
  const details = report
    ? { placed: report.placed, rejected: report.rejected, empty: report.empty, warnings: report.warnings, lights: report.lights }
    : undefined;
  const field = bakeTerrainLight(terrain, def.mood.moonPos);
  for (const mesh of terrain) mesh.geometry.dispose();
  shadowBake.capture = undefined;
  let light;
  if (field) {
    const { depth, ...projection } = field;
    const packed = deflateRawSync(depth);
    light = { ...projection, start: size, length: packed.length };
    chunks.push(packed); size += packed.length;
  }
  const meta = deflateRawSync(Buffer.from(JSON.stringify({ version: 1, ops, meshes, light, report: details })));
  const header = Buffer.alloc(8);
  header.writeUInt32LE(0x314b4255);
  header.writeUInt32LE(meta.length, 4);
  const bytes = Buffer.concat([header, meta, ...chunks]);
  fs.writeFileSync(path.join(out, def.pack + '.bin'), bytes);
  console.log('  ' + def.pack + ' ' + (bytes.length / 1048576).toFixed(2) + ' MB');
}
bake(titleDefinition(3), false);
const args = { isYard: false, room: 0, recent: [], nextRooms: [], viewSpec: null, forceSpec: null, noArena: false } as const;
const yard = roomDefinition({ ...args, isYard: true, recent: [], nextRooms: [], locale: 'ninja_wilds', plan: null });
bake(yard.def, true);
const written = new Set<string>();
for (const [region, rg] of REGIONS.entries()) {
  for (const m of ROOM_MAPS.filter(map => map.kind === 'boss' ? rg.bossLocale === map.locale : rg.locales.includes(map.locale))) {
    const plan = { type: m.kind === 'calm' ? 'rest' : m.kind, locale: m.locale, reward: null, waves: [] } as const;
    // The room before a boss has one exit, including when it is a rest stop.
    for (const count of m.kind === 'boss' ? [region === REGIONS.length - 1 ? 0 : 1] : [1, 2]) {
      const r = roomDefinition({ ...args, recent: [], nextRooms: Array(count).fill(plan), locale: m.locale,
        map: m.id, region, plan: { ...plan, waves: [] }, regionSpec: rg.spec });
      if (!r.def.pack) throw Error('Missing stage key for ' + m.id);
      if (!written.has(r.def.pack)) bake(r.def, true, r.report);
      written.add(r.def.pack);
    }
  }
}
