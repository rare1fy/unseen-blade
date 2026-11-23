import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CELL } from '../src/present/bestiary/kit';
import { VoxWorld } from '../src/present/look/voxkit';
import { finishBuild } from '../src/present/engine/buildSteps';
import { shadowBake, type ShadowLayout } from '../src/present/engine/shadowTiles';
import { unpackStage } from '../src/present/scenes/packedStage';
import { Cards } from '../src/present/scenes/cards';
import type { Ctx } from '../src/present/scenes/stage';

/** Emit valid RFC 1951 raw stored DEFLATE blocks without requiring Node's zlib types. */
function rawDeflateStored(input: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const blocks = Math.max(1, Math.ceil(input.length / maxBlock));
  const out = new Uint8Array(input.length + blocks * 5);
  let ip = 0, op = 0;
  for (let b = 0; b < blocks; b++) {
    const len = Math.min(maxBlock, input.length - ip);
    const last = b === blocks - 1 ? 1 : 0;
    out[op++] = last;
    out[op++] = len & 0xff;
    out[op++] = len >>> 8;
    const nlen = (~len) & 0xffff;
    out[op++] = nlen & 0xff;
    out[op++] = nlen >>> 8;
    out.set(input.subarray(ip, ip + len), op);
    ip += len;
    op += len;
  }
  return out;
}

function makeStubCtx(): Ctx {
  const noop = () => {};
  return {
    w: new VoxWorld(CELL, true),
    cut: new VoxWorld(CELL, true),
    cards: new Cards(),
    light: noop,
    flame: noop,
    water: noop,
    earthHole: noop,
    rune: noop,
    cutEaves: noop,
    ambient: noop,
    shaft: noop,
    add: noop,
    onPhase: noop,
  };
}

function byteSplitDeltaU16(arr: Uint16Array): Uint8Array {
  const n = arr.length, raw = new Uint8Array(n * 2);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const v = arr[i], d = (v - prev) & 0xffff;
    raw[i] = d & 0xff;
    raw[n + i] = d >>> 8;
    prev = v;
  }
  return raw;
}

function byteSplitRawU16(arr: Uint16Array): Uint8Array {
  const n = arr.length, raw = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    raw[i] = v & 0xff;
    raw[n + i] = v >>> 8;
  }
  return raw;
}

const V_DIRS: ReadonlyArray<readonly [number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const V_ORDER_SLOT = [2, 3, 4, 0, 1, 5];
const V_AO = [0.52, 0.7, 0.86, 1];
const vDirIndex = (nx: number, ny: number, nz: number) => (nx > 0.5 ? 0 : nx < -0.5 ? 1 : ny > 0.5 ? 2 : ny < -0.5 ? 3 : nz > 0.5 ? 4 : 5);

function packV2SingleTerrain(mesh: THREE.Mesh, layout: ShadowLayout): Uint8Array {
  const g = mesh.geometry;
  const P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color.array;
  const S = g.attributes.aSize.array, E = g.attributes.aOpen.array, I = g.index!.array;
  const nq = I.length / 6;
  const tileOf = new Uint16Array(nq);
  let off = 0;
  for (let ti = 0; ti < layout.tiles.length; ti++) {
    const cnt = layout.tiles[ti].ends[5] / 6;
    for (let j = 0; j < cnt; j++) tileOf[layout.order![off + j]] = ti;
    off += cnt;
  }
  const dirs = new Uint8Array(nq), plane = new Int16Array(nq), w0 = new Int16Array(nq), u0 = new Int16Array(nq);
  const su = new Uint16Array(nq), sw = new Uint16Array(nq), openMask = new Uint8Array(nq), aoMask = new Uint8Array(nq);
  const palIdx = new Uint16Array(nq), palMap = new Map<string, number>(), palRgb: number[] = [];
  for (let q = 0; q < nq; q++) {
    const vp = q * 12, d = vDirIndex(N[vp], N[vp + 1], N[vp + 2]), [dx, dy] = V_DIRS[d];
    dirs[q] = d;
    const x = Math.round(P[vp] / CELL), y = Math.round(P[vp + 1] / CELL), z = Math.round(P[vp + 2] / CELL);
    plane[q] = dx ? x : dy ? y : z; u0[q] = dx ? y : dy ? z : x; w0[q] = dx ? z : dy ? x : y;
    su[q] = Math.round(S[q * 8]); sw[q] = Math.round(S[q * 8 + 1]);
    const ve = q * 16;
    openMask[q] = E[ve] | (E[ve + 1] << 1) | (E[ve + 2] << 2) | (E[ve + 3] << 3);
    let bestM = 0, bestSum = -1;
    for (let k = 0; k < 4; k++) { const s = C[vp + k * 3] + C[vp + k * 3 + 1] + C[vp + k * 3 + 2]; if (s > bestSum) { bestSum = s; bestM = k; } }
    let br = 0, bg = 0, bb = 0, aos = [3, 3, 3, 3];
    if (bestSum > 1e-6) {
      for (let am = 3; am >= 0; am--) {
        const inv = 1 / V_AO[am], tr = C[vp + bestM * 3] * inv, tg = C[vp + bestM * 3 + 1] * inv, tb = C[vp + bestM * 3 + 2] * inv;
        if (tr > 1.001 || tg > 1.001 || tb > 1.001) continue;
        let err = 0; const taos = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          let bk = 3, berr = 1e9;
          for (let a = 0; a < 4; a++) {
            const e = Math.abs(tr * V_AO[a] - C[vp + k * 3]) + Math.abs(tg * V_AO[a] - C[vp + k * 3 + 1]) + Math.abs(tb * V_AO[a] - C[vp + k * 3 + 2]);
            if (e < berr) { berr = e; bk = a; }
          }
          taos[k] = bk; if (berr > err) err = berr;
        }
        if (err < 2e-4) { br = Math.fround(tr); bg = Math.fround(tg); bb = Math.fround(tb); aos = taos; break; }
      }
    }
    aoMask[q] = aos[0] | (aos[1] << 2) | (aos[2] << 4) | (aos[3] << 6);
    const ck = `${Math.round(br * 100000)},${Math.round(bg * 100000)},${Math.round(bb * 100000)}`;
    let pi = palMap.get(ck); if (pi === undefined) { pi = palMap.size; palMap.set(ck, pi); palRgb.push(br, bg, bb); }
    palIdx[q] = pi;
  }
  const perm = new Uint32Array(nq); for (let q = 0; q < nq; q++) perm[q] = q;
  perm.sort((a, b) => (tileOf[a] - tileOf[b]) || (V_ORDER_SLOT[dirs[a]] - V_ORDER_SLOT[dirs[b]]) || (plane[a] - plane[b]) || (w0[a] - w0[b]) || (u0[a] - u0[b]));
  const oldToNew = new Uint32Array(nq); for (let i = 0; i < nq; i++) oldToNew[perm[i]] = i;
  const sPlane = new Uint16Array(nq), sW = new Uint16Array(nq), sU = new Uint16Array(nq);
  let maxSu = 0, maxSw = 0;
  for (let q = 0; q < nq; q++) { if (su[q] > maxSu) maxSu = su[q]; if (sw[q] > maxSw) maxSw = sw[q]; }
  const suBytes: 1 | 2 = maxSu <= 255 ? 1 : 2, swBytes: 1 | 2 = maxSw <= 255 ? 1 : 2;
  const sSu = suBytes === 1 ? new Uint8Array(nq) : new Uint16Array(nq);
  const sSw = swBytes === 1 ? new Uint8Array(nq) : new Uint16Array(nq);
  const sPal = new Uint8Array(nq), sAo = new Uint8Array(nq), sOpen = new Uint8Array(nq);
  const pCode = new Uint8Array(nq), pExtra: number[] = [];
  for (let i = 0; i < nq; i++) {
    const q = perm[i];
    sPlane[i] = (plane[q] + 32768) & 0xffff; sW[i] = (w0[q] + 32768) & 0xffff; sU[i] = (u0[q] + 32768) & 0xffff;
    sSu[i] = su[q]; sSw[i] = sw[q]; sPal[i] = palIdx[q]; sAo[i] = aoMask[q]; sOpen[i] = openMask[q];
    const oldP = layout.partner[q];
    if (oldP === 0) pCode[i] = 0;
    else if (oldP === -1) pCode[i] = 1;
    else {
      const delta = oldToNew[oldP - 1] - i;
      if (delta >= 1 && delta <= 253) pCode[i] = delta + 1;
      else { pCode[i] = 255; pExtra.push(delta); }
    }
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const push = (raw: Uint8Array) => { const p = rawDeflateStored(raw); const span = { start: size, size: p.length }; chunks.push(p); size += p.length; return span; };
  const palArr = new Float32Array(palRgb);
  const voxel = {
    nq,
    plane: push(byteSplitDeltaU16(sPlane)),
    w0: push(byteSplitDeltaU16(sW)),
    u0: push(byteSplitDeltaU16(sU)),
    su: { ...push(sSu instanceof Uint8Array ? sSu : byteSplitRawU16(sSu)), bytes: suBytes },
    sw: { ...push(sSw instanceof Uint8Array ? sSw : byteSplitRawU16(sSw)), bytes: swBytes },
    palRgb: push(new Uint8Array(palArr.buffer)),
    palIdx: { ...push(sPal), bytes: 1 as const },
    ao: push(sAo),
    open: push(sOpen),
  };
  const tiles = {
    tiles: layout.tiles,
    pCode: push(pCode),
    pExtra: pExtra.length ? push(new Uint8Array(new Int32Array(pExtra).buffer)) : undefined,
  };
  mesh.updateMatrix();
  const metaJson = new TextEncoder().encode(JSON.stringify({
    version: 2,
    ops: [],
    meshes: [{
      tiles,
      material: 'terrain',
      glow: 1.35,
      cut: false,
      shadow: true,
      receive: true,
      order: 0,
      name: '',
      matrix: mesh.matrix.toArray(),
      voxel,
    }],
  }));
  const meta = rawDeflateStored(metaJson);
  const out = new Uint8Array(8 + meta.length + size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x314b4255, true);
  dv.setUint32(4, meta.length, true);
  out.set(meta, 8);
  let pos = 8 + meta.length;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

describe('scenery v2 packed stage', () => {
  it('round-trips a tiled VoxWorld mesh via v2 voxel-quad format with exact vertex count, surface area and shadow tiles', () => {
    const w = new VoxWorld(CELL, true);
    w.box(-140, 0, -140, 140, 0, 140, 0x4b5159);
    w.box(-40, 1, -40, 40, 14, -38, 0x7b563a);
    w.box(-10, 1, 10, 10, 8, 12, 0x8f6e4e);
    let captured: ShadowLayout | undefined;
    shadowBake.capture = (_m, l) => { captured = l; };
    const built = w.build({ glow: 1.35 });
    shadowBake.capture = undefined;

    const src = built.find(m => m.name !== 'shadowTile')!;
    expect(captured).toBeDefined();
    const packed = packV2SingleTerrain(src, captured!);

    const root = new THREE.Group(), cut = new THREE.Group();
    finishBuild(unpackStage(packed, makeStubCtx(), root, cut));

    const meshes: THREE.Mesh[] = [];
    root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    const decoded = meshes.find(m => m.userData.stageTerrain)!;
    expect(decoded).toBeDefined();
    expect(decoded.geometry.attributes.position.count).toBe(src.geometry.attributes.position.count);
    expect(decoded.geometry.index!.count).toBe(src.geometry.index!.count);

    // Compare total triangle surface area and color sum (order-independent exactness check)
    const stats = (m: THREE.Mesh) => {
      const p = m.geometry.attributes.position, c = m.geometry.attributes.color, idx = m.geometry.index!;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
      let area = 0, cSum = 0;
      for (let i = 0; i < idx.count; i += 3) {
        a.fromBufferAttribute(p, idx.getX(i)); b.fromBufferAttribute(p, idx.getX(i + 1)); d.fromBufferAttribute(p, idx.getX(i + 2));
        area += b.sub(a).cross(d.sub(a)).length() / 2;
      }
      for (let i = 0; i < c.array.length; i++) cSum += c.array[i];
      return { area, cSum };
    };
    const origStats = stats(src), decStats = stats(decoded);
    expect(decStats.area).toBeCloseTo(origStats.area, 4);
    expect(decStats.cSum).toBeCloseTo(origStats.cSum, 2);

    const tiles = meshes.filter(m => m.name === 'shadowTile');
    expect(tiles.length).toBe(captured!.tiles.length);
    expect(tiles.reduce((s, m) => s + m.geometry.index!.count, 0)).toBe(decoded.geometry.index!.count);

    for (const m of built) m.geometry.dispose();
    root.traverse(o => (o as THREE.Mesh).geometry?.dispose());
  });

  it('rejects unsupported pack versions cleanly', () => {
    const badMeta = rawDeflateStored(new TextEncoder().encode(JSON.stringify({ version: 99, ops: [], meshes: [] })));
    const bad = new Uint8Array(8 + badMeta.length);
    const dv = new DataView(bad.buffer);
    dv.setUint32(0, 0x314b4255, true);
    dv.setUint32(4, badMeta.length, true);
    bad.set(badMeta, 8);
    expect(() => finishBuild(unpackStage(bad, makeStubCtx(), new THREE.Group(), new THREE.Group()))).toThrow();
  });
});
