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
    if (material === 'plain' && !['MeshLambertMaterial', 'MeshStandardMaterial', 'MeshBasicMaterial'].includes(mat.type))
      throw Error('Unregistered scenery material ' + mat.type);
    mesh.updateMatrix();
    const attributes = Object.entries(geo.attributes).map(([k, v]) => attribute(k, v as THREE.BufferAttribute));
    if (geo.index) attributes.push(attribute('index', geo.index));
    meshes.push({
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
    geo.dispose();
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
  const meta = deflateRawSync(Buffer.from(JSON.stringify({ version: 1, ops, meshes, report: details })));
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
// These authored rooms have deterministic terrain and fit the scenery budget.
const bakedMaps = new Set(['crossroads', 'courtyards', 'islands']);
for (const m of ROOM_MAPS.filter(map => bakedMaps.has(map.id))) {
  const plan = { type: 'fight', locale: m.locale, reward: null, waves: [] } as const;
  // (11-19: since the drawn rooms are picked per region, roomDefinition only takes the map when it knows the room's region — without it
  //  the map was dropped and these three were baked as nameless random rooms, so the package had none of them)
  const region = REGIONS.findIndex(rg => rg.locales.includes(m.locale) || rg.bossLocale === m.locale);
  for (const count of [1, 2]) {
    const r = roomDefinition({
      ...args,
      recent: [],
      nextRooms: Array(count).fill(plan),
      locale: m.locale,
      map: m.id,
      region: region >= 0 ? region : undefined,
      plan: { ...plan, waves: [] },
      regionSpec: { season: m.locale.startsWith('xp_') ? 'winter' : 'autumn' },
    });
    bake(r.def, true, r.report);
  }
}
