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
const V_DIRS: ReadonlyArray<readonly [number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const V_ORDER_SLOT = [2, 3, 4, 0, 1, 5];
const V_AO = [0.52, 0.7, 0.86, 1];
const vDirIndex = (nx: number, ny: number, nz: number) => (nx > 0.5 ? 0 : nx < -0.5 ? 1 : ny > 0.5 ? 2 : ny < -0.5 ? 3 : nz > 0.5 ? 4 : 5);

function byteSplitDeltaU16(arr: Uint16Array): Buffer {
  const n = arr.length, raw = Buffer.alloc(n * 2);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const v = arr[i], d = (v - prev) & 0xffff;
    raw[i] = d & 0xff;
    raw[n + i] = d >>> 8;
    prev = v;
  }
  return raw;
}
function byteSplitRawU16(arr: Uint16Array): Buffer {
  const n = arr.length, raw = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    raw[i] = v & 0xff;
    raw[n + i] = v >>> 8;
  }
  return raw;
}

function bake(def: SceneDef, combat: boolean, report?: any) {
  const chunks: Buffer[] = [],
    ops: unknown[][] = [],
    meshes: object[] = [];
  let size = 0;
  const terrain: THREE.Mesh[] = [];
  const shadows = new WeakMap<THREE.Mesh, ShadowLayout>();
  shadowBake.capture = (mesh, layout) => shadows.set(mesh, layout);
  function pushSpan(raw: Buffer | Uint8Array) {
    const packed = deflateRawSync(raw, { level: 9 });
    const span = { start: size, size: packed.length };
    chunks.push(packed);
    size += packed.length;
    return span;
  }
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
      const n = Math.min(131072, words.length - offset),
        raw = Buffer.alloc(n * bytes);
      for (let j = 0; j < n; j++) {
        const delta = words[offset + j] - (j >= a.itemSize ? words[offset + j - a.itemSize] : 0);
        for (let b = 0; b < bytes; b++) raw[b * n + j] = delta >>> (8 * b);
      }
      const packed = deflateRawSync(raw, { level: 9 });
      parts.push({ start: size, size: packed.length, raw: raw.length });
      chunks.push(packed);
      size += packed.length;
      offset += n;
    }
    return { name, type: array.constructor.name, itemSize: a.itemSize, count: array.length, parts };
  }
  /** Exact lossless v2 voxel-quad encoder for VoxWorld meshes (terrain & glow):
   *  stores only (plane, w0, u0, su, sw, palIdx, ao, open) sorted by (tile, ORDER_SLOT[dir], plane, w0, u0),
   *  deriving normal, aVox, aSize, index, shadowTiles.order and shadowTiles.groupOf at decode time (~66% smaller). */
  function encodeVoxelMesh(geo: THREE.BufferGeometry, layout?: ShadowLayout) {
    const attrNames = Object.keys(geo.attributes);
    if (attrNames.length !== 6 || !geo.index) return null;
    const pA = geo.attributes.position, nA = geo.attributes.normal, cA = geo.attributes.color;
    const uA = geo.attributes.aVox, sA = geo.attributes.aSize, eA = geo.attributes.aOpen;
    if (!pA || !nA || !cA || !uA || !sA || !eA) return null;
    const I = geo.index.array, nq = I.length / 6;
    if (!Number.isInteger(nq) || nq <= 0 || pA.count !== nq * 4) return null;
    const P = pA.array, N = nA.array, C = cA.array, U = uA.array, S = sA.array, E = eA.array;

    const tileOf = new Uint16Array(nq);
    if (layout) {
      if (!layout.order || layout.order.length !== nq) return null;
      let off = 0;
      for (let ti = 0; ti < layout.tiles.length; ti++) {
        const cnt = layout.tiles[ti].ends[5] / 6;
        for (let j = 0; j < cnt; j++) tileOf[layout.order[off + j]] = ti;
        off += cnt;
      }
      if (off !== nq) return null;
    }

    const dirs = new Uint8Array(nq);
    const plane = new Int16Array(nq), w0 = new Int16Array(nq), u0 = new Int16Array(nq);
    const su = new Uint16Array(nq), sw = new Uint16Array(nq);
    const openMask = new Uint8Array(nq), aoMask = new Uint8Array(nq);
    const palIdx = new Uint16Array(nq);
    const palMap = new Map<string, number>(), palRgb: number[] = [];
    let maxSu = 0, maxSw = 0;

    for (let q = 0; q < nq; q++) {
      const vp = q * 12;
      const d = vDirIndex(N[vp], N[vp + 1], N[vp + 2]);
      const [dx, dy, dz] = V_DIRS[d];
      for (let k = 0; k < 4; k++) {
        if (N[vp + k * 3] !== dx || N[vp + k * 3 + 1] !== dy || N[vp + k * 3 + 2] !== dz) return null;
      }
      dirs[q] = d;
      const x = Math.round(P[vp] / CELL), y = Math.round(P[vp + 1] / CELL), z = Math.round(P[vp + 2] / CELL);
      const pl = dx ? x : dy ? y : z, uu = dx ? y : dy ? z : x, ww = dx ? z : dy ? x : y;
      if (Math.abs(pl) > 32767 || Math.abs(uu) > 32767 || Math.abs(ww) > 32767) return null;
      const vu = q * 8;
      const dsu = Math.round(S[vu]), dsw = Math.round(S[vu + 1]);
      if (dsu <= 0 || dsw <= 0 || dsu > 65535 || dsw > 65535) return null;
      // Verify exact corner positions, aVox and aSize
      const u1 = uu + dsu, w1 = ww + dsw;
      const exp = dx
        ? [pl, uu, ww, pl, u1, ww, pl, u1, w1, pl, uu, w1]
        : dy
          ? [ww, pl, uu, ww, pl, u1, w1, pl, u1, w1, pl, uu]
          : [uu, ww, pl, u1, ww, pl, u1, w1, pl, uu, w1, pl];
      for (let k = 0; k < 12; k++) if (Math.abs(P[vp + k] - exp[k] * CELL) > 1e-4) return null;
      if (U[vu] !== 0 || U[vu + 1] !== 0 || U[vu + 2] !== dsu || U[vu + 3] !== 0 || U[vu + 4] !== dsu || U[vu + 5] !== dsw || U[vu + 6] !== 0 || U[vu + 7] !== dsw) return null;
      for (let k = 0; k < 8; k += 2) if (S[vu + k] !== dsu || S[vu + k + 1] !== dsw) return null;

      plane[q] = pl; u0[q] = uu; w0[q] = ww;
      su[q] = dsu; sw[q] = dsw;
      if (dsu > maxSu) maxSu = dsu;
      if (dsw > maxSw) maxSw = dsw;

      const ve = q * 16;
      const o0 = E[ve], o1 = E[ve + 1], o2 = E[ve + 2], o3 = E[ve + 3];
      if ((o0 !== 0 && o0 !== 1) || (o1 !== 0 && o1 !== 1) || (o2 !== 0 && o2 !== 1) || (o3 !== 0 && o3 !== 1)) return null;
      for (let k = 4; k < 16; k += 4) if (E[ve + k] !== o0 || E[ve + k + 1] !== o1 || E[ve + k + 2] !== o2 || E[ve + k + 3] !== o3) return null;
      openMask[q] = o0 | (o1 << 1) | (o2 << 2) | (o3 << 3);

      // Recover exact base RGB + 4 corner AO levels
      let bestM = 0, bestSum = -1;
      for (let k = 0; k < 4; k++) {
        const s = C[vp + k * 3] + C[vp + k * 3 + 1] + C[vp + k * 3 + 2];
        if (s > bestSum) { bestSum = s; bestM = k; }
      }
      let br = 0, bg = 0, bb = 0, aos = [3, 3, 3, 3];
      if (bestSum > 1e-6) {
        let found = false;
        for (let am = 3; am >= 0; am--) {
          const inv = 1 / V_AO[am];
          const tr = C[vp + bestM * 3] * inv, tg = C[vp + bestM * 3 + 1] * inv, tb = C[vp + bestM * 3 + 2] * inv;
          if (tr > 1.001 || tg > 1.001 || tb > 1.001) continue;
          let err = 0;
          const taos = [0, 0, 0, 0];
          for (let k = 0; k < 4; k++) {
            const cr = C[vp + k * 3], cg = C[vp + k * 3 + 1], cb = C[vp + k * 3 + 2];
            let bk = 3, berr = 1e9;
            for (let a = 0; a < 4; a++) {
              const e = Math.abs(tr * V_AO[a] - cr) + Math.abs(tg * V_AO[a] - cg) + Math.abs(tb * V_AO[a] - cb);
              if (e < berr) { berr = e; bk = a; }
            }
            taos[k] = bk;
            if (berr > err) err = berr;
          }
          if (err < 2e-4) { br = Math.fround(tr); bg = Math.fround(tg); bb = Math.fround(tb); aos = taos; found = true; break; }
        }
        if (!found) return null;
      }
      aoMask[q] = aos[0] | (aos[1] << 2) | (aos[2] << 4) | (aos[3] << 6);
      // Verify index matches exact quad winding + AO diagonal flip
      const flip = aos[0] + aos[2] < aos[1] + aos[3], pos = dx + dy + dz > 0, vb = q * 4;
      const iq = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
      const expI = pos ? iq : [iq[0], iq[2], iq[1], iq[3], iq[5], iq[4]];
      for (let k = 0; k < 6; k++) if (I[q * 6 + k] !== vb + expI[k]) return null;

      const ck = `${Math.round(br * 100000)},${Math.round(bg * 100000)},${Math.round(bb * 100000)}`;
      let pi = palMap.get(ck);
      if (pi === undefined) {
        pi = palMap.size;
        if (pi > 65535) return null;
        palMap.set(ck, pi);
        palRgb.push(br, bg, bb);
      }
      palIdx[q] = pi;
    }

    const perm = new Uint32Array(nq);
    for (let q = 0; q < nq; q++) perm[q] = q;
    perm.sort((a, b) =>
      (tileOf[a] - tileOf[b]) ||
      (V_ORDER_SLOT[dirs[a]] - V_ORDER_SLOT[dirs[b]]) ||
      (plane[a] - plane[b]) ||
      (w0[a] - w0[b]) ||
      (u0[a] - u0[b])
    );

    const sPlane = new Uint16Array(nq), sW = new Uint16Array(nq), sU = new Uint16Array(nq);
    const suBytes: 1 | 2 = maxSu <= 255 ? 1 : 2, swBytes: 1 | 2 = maxSw <= 255 ? 1 : 2;
    const sSu = suBytes === 1 ? new Uint8Array(nq) : new Uint16Array(nq);
    const sSw = swBytes === 1 ? new Uint8Array(nq) : new Uint16Array(nq);
    const palBytes: 1 | 2 = palMap.size <= 256 ? 1 : 2;
    const sPal = palBytes === 1 ? new Uint8Array(nq) : new Uint16Array(nq);
    const sAo = new Uint8Array(nq), sOpen = new Uint8Array(nq);
    const dirCounts = [0, 0, 0, 0, 0, 0];

    for (let i = 0; i < nq; i++) {
      const q = perm[i];
      sPlane[i] = (plane[q] + 32768) & 0xffff;
      sW[i] = (w0[q] + 32768) & 0xffff;
      sU[i] = (u0[q] + 32768) & 0xffff;
      sSu[i] = su[q]; sSw[i] = sw[q];
      sPal[i] = palIdx[q];
      sAo[i] = aoMask[q];
      sOpen[i] = openMask[q];
      dirCounts[V_ORDER_SLOT[dirs[q]]]++;
    }

    let tilesOut;
    if (layout) {
      // Sanity check that per-tile direction endpoints match after sorting
      let off = 0;
      for (let ti = 0; ti < layout.tiles.length; ti++) {
        const ends = layout.tiles[ti].ends;
        let prev = 0;
        for (let s = 0; s < 6; s++) {
          const end = ends[s] / 6;
          for (let j = prev; j < end; j++) {
            const q = perm[off + j];
            if (tileOf[q] !== ti || V_ORDER_SLOT[dirs[q]] !== s) return null;
          }
          prev = end;
        }
        off += prev;
      }
      const oldToNew = new Uint32Array(nq);
      for (let i = 0; i < nq; i++) oldToNew[perm[i]] = i;
      const pCode = new Uint8Array(nq), pExtra: number[] = [];
      for (let i = 0; i < nq; i++) {
        const oldP = layout.partner[perm[i]];
        if (oldP === 0) pCode[i] = 0;
        else if (oldP === -1) pCode[i] = 1;
        else {
          const delta = oldToNew[oldP - 1] - i;
          if (delta >= 1 && delta <= 253) pCode[i] = delta + 1;
          else { pCode[i] = 255; pExtra.push(delta); }
        }
      }
      tilesOut = {
        tiles: layout.tiles,
        pCode: pushSpan(pCode),
        pExtra: pExtra.length ? pushSpan(Buffer.from(new Int32Array(pExtra).buffer)) : undefined,
      };
    }

    const voxel = {
      nq,
      dirCounts: layout ? undefined : dirCounts,
      plane: pushSpan(byteSplitDeltaU16(sPlane)),
      w0: pushSpan(byteSplitDeltaU16(sW)),
      u0: pushSpan(byteSplitDeltaU16(sU)),
      su: { ...pushSpan(sSu instanceof Uint8Array ? sSu : byteSplitRawU16(sSu)), bytes: suBytes },
      sw: { ...pushSpan(sSw instanceof Uint8Array ? sSw : byteSplitRawU16(sSw)), bytes: swBytes },
      palRgb: pushSpan(Buffer.from(new Float32Array(palRgb).buffer)),
      palIdx: { ...pushSpan(sPal instanceof Uint8Array ? sPal : byteSplitDeltaU16(sPal)), bytes: palBytes },
      ao: pushSpan(sAo),
      open: pushSpan(sOpen),
    };
    return { voxel, tiles: tilesOut };
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
    const layout = shadows.get(mesh);
    const vox = (source === 'terrain' || source === 'glow') ? encodeVoxelMesh(geo, layout) : null;
    if (vox) {
      meshes.push({
        tiles: vox.tiles,
        material,
        glow: cut ? 2.6 : combat ? 1.35 : (def.mood.glowK ?? 2.6),
        cut,
        shadow: mesh.castShadow || !!mesh.userData.shadowTiled,
        receive: mesh.receiveShadow,
        order: mesh.renderOrder,
        name: mesh.name,
        matrix: mesh.matrix.toArray(),
        voxel: vox.voxel,
      });
    } else {
      const attributes = Object.entries(geo.attributes).map(([k, v]) => attribute(k, v as THREE.BufferAttribute));
      if (geo.index) attributes.push(attribute('index', geo.index));
      const tiles = layout && layout.order && layout.groupOf && layout.groups ? {
        tiles: layout.tiles, groups: layout.groups,
        order: attribute('order', new THREE.BufferAttribute(layout.order, 1)),
        groupOf: attribute('groupOf', new THREE.BufferAttribute(layout.groupOf, 1)),
        partner: attribute('partner', new THREE.BufferAttribute(new Uint32Array(layout.partner.buffer), 1)),
      } : undefined;
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
    }
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
    const packed = deflateRawSync(depth, { level: 9 });
    light = { ...projection, start: size, length: packed.length };
    chunks.push(packed); size += packed.length;
  }
  const meta = deflateRawSync(Buffer.from(JSON.stringify({ version: 2, ops, meshes, light, report: details })), { level: 9 });
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
    // Bake the primary exit layout per room (2 exits for fight/calm, 0/1 for boss) to keep all 49 rooms within WeChat's 30 MB total limit;
    // rare 1-exit pre-boss rooms fall back cleanly to sliced procedural building via readStagePack().
    for (const count of m.kind === 'boss' ? [region === REGIONS.length - 1 ? 0 : 1] : [2]) {
      const r = roomDefinition({ ...args, recent: [], nextRooms: Array(count).fill(plan), locale: m.locale,
        map: m.id, region, plan: { ...plan, waves: [] }, regionSpec: rg.spec });
      if (!r.def.pack) throw Error('Missing stage key for ' + m.id);
      if (!written.has(r.def.pack)) bake(r.def, true, r.report);
      written.add(r.def.pack);
    }
  }
}
