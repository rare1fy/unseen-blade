// Set dressing with cards, the Minecraft-Dungeons way: every block edge softened by tufts, vines and webs, the floor broken up with
// flat decals, and the air filled with motes. One call per scene picks a preset and a few scene facts (which walls to hang growth
// from, which corners get webs, where the water is). Cards land on whatever surface the voxel world has at that spot, never inside
// a prop, never on top of a tall one. Growth follows habitats, not an even scatter: meadow patches, the feet of rocks, trunks and
// walls, a fringe just outside the battle floor, flower colonies of one colour each. The battle floor itself gets only flat decals
// toned to the floor they lie on.
import * as THREE from 'three';
import type { Ctx } from './stage';
import type { VoxWorld } from '../look/voxkit';
import { Cards, ambientTick, shaft, type Ambient } from './cards';
import { onUpdate, camera } from '../engine/world';
import { M, hash, AREA, PLAY, patches } from './props';
import { CELL } from '../bestiary/kit';
import { plot, plantRings, buildFlora, inFlora, tone, SKIN_K, LEAVES, DEAD, pine, deadTree, snag, oak, bush, woodsRing } from './flora';
import { showStage, type SceneDef } from './stage';
import { NIGHT, BARK, BARK_D, PINE, PINE_T } from './common';

type Rect = { x0: number; z0: number; x1: number; z1: number };
export type Preset = 'woods' | 'grave' | 'grove' | 'swamp' | 'house' | 'dungeon' | 'cave' | 'spider' | 'roots';
export interface DressOpt {
  /** wall or rock runs to hang vines and moss from: [x0, z0, x1, z1] along the run, plus the inward direction (toward the stage) */
  hang?: Array<[number, number, number, number, 'n' | 's' | 'e' | 'w']>;
  /** cobweb corners: [x, y, z, yaw] */
  webs?: Array<[number, number, number, number]>;
  /** water rectangles: reeds along their banks */
  water?: Rect[];
  /** moonbeams / window light: [x, z, yaw, tilt, width] */
  shafts?: Array<[number, number, number?, number?, number?]>;
  /** areas kept free of standing cards */
  clear?: Rect[];
  seed?: number;
  /** multiplier on standing-card counts */
  dense?: number;
  /** block colours of foliage the scene built itself: their faces get cut-out leaf skins (trees from flora.ts skin themselves) */
  leaves?: number[];
}

/** top surface height (metres) of the voxel world at (x, z), or null where there is no ground (water, holes) */
export function surface(c: Ctx, x: number, z: number) {
  const X = M(x), Z = M(z);
  for (let y = M(9); y >= -3; y--) if (c.w.has(X, y, Z)) return (y + 1) * CELL;
  return null;
}
/** the floor under (x, z): the top of the ground column, even beneath a canopy or a limb; null where there is no ground, or where
 *  something stands on it within `clear` blocks */
export function ground(c: Ctx, x: number, z: number, clear = 6) {
  const X = M(x), Z = M(z), w = c.w;
  if (!w.has(X, -1, Z)) return null;
  let y = -1; while (y < 8 && w.has(X, y + 1, Z)) y++;
  if (y >= 8) return null;
  for (let k = 2; k <= clear; k++) if (w.has(X, y + k, Z)) return null;
  return (y + 1) * CELL;
}
/** colours of the prisms flora.ts built (they are not voxel cells, so a scene's `leaves` list never double-skins them) */
const floraCols = (w: VoxWorld) => new Set(plot(w).masses.map(m => m.side));
const playDepth = (x: number, z: number) => Math.min(x - PLAY.x0, PLAY.x1 - x, z - PLAY.z0, PLAY.z1 - z);
const inRect = (r: Rect, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

/** what the ground is like at a point (cached per dress call on a 0.25 m grid) */
interface Habitat {
  /** floor height (m) */ y: number;
  /** 0..1: how close something 0.4–1 m tall stands (rock, trunk, bush, wall, prop) — growth gathers at the feet of things */ near: number;
  /** depth inside the battle floor (m): > 0 inside, < 0 outside */ d: number;
  /** 0..1: a smooth low-frequency field (a few metres across) — meadow patches where it is high */ patch: number;
  /** colour of the floor block */ floor: number;
}

export function dress(c: Ctx, preset: Preset, o: DressOpt = {}) {
  plantRings(c);
  const w = c.w, sd = o.seed ?? 1, D = o.dense ?? 1, clear = o.clear ?? [];
  const groundOK = (x: number, z: number, maxY = 0.22) => { const y = ground(c, x, z); return y != null && y <= maxY && y >= -0.1 ? y : null; };
  const ph = [hash(sd, 1) * 6, hash(sd, 2) * 6, hash(sd, 3) * 6];
  const cache = new Map<number, Habitat | null>();
  const at = (x: number, z: number): Habitat | null => {
    const gx = Math.round(x * 4), gz = Math.round(z * 4), k = (gx + 4000) * 8000 + gz + 4000;
    const hit = cache.get(k); if (hit !== undefined) return hit;
    const px = gx / 4, pz = gz / 4, y = groundOK(px, pz);
    let v: Habitat | null = null;
    if (y != null) {
      let near = 0;
      for (const r of [0.3, 0.6, 0.95]) {
        for (let a = 0; a < 8 && !near; a++) { const ax = px + Math.cos(a * Math.PI / 4) * r, az = pz + Math.sin(a * Math.PI / 4) * r; if (w.has(M(ax), M(0.45), M(az)) || w.has(M(ax), M(0.85), M(az)) || inFlora(w, ax, az)) near = 1 - r / 1.25; }
        if (near) break;
      }
      const f = Math.sin(px * 0.9 + ph[0]) * Math.cos(pz * 0.75 + ph[1]) * 0.6 + Math.sin((px + pz) * 0.55 + ph[2]) * 0.4;
      v = { y, near, d: playDepth(px, pz), patch: 0.5 + 0.5 * f, floor: w.get(M(px), Math.round(y / CELL) - 1, M(pz))?.c ?? 0x606060 };
    }
    cache.set(k, v); return v;
  };
  const ss = (a: number, b: number, t: number) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
  // habitats: each gives the chance (0..1) that a clump grows at a point
  type Want = (p: Habitat, x: number, z: number) => number;
  const patchy = (p: Habitat) => ss(0.5, 0.78, p.patch), fringe = (p: Habitat) => (p.d < 0 && p.d > -1.3 ? 1 + p.d / 1.3 : 0);
  const outer = (x: number, z: number) => (Math.abs(x) > 7.4 || z < -8.6 ? 1 : 0);
  const W = {
    grass: ((p, x, z) => Math.max(patchy(p) * 0.85, fringe(p) * 0.9, p.near * 0.8, outer(x, z) * 0.35) + 0.04) as Want,
    tall: ((p, x, z) => Math.max(p.near * 0.75, outer(x, z) * patchy(p) * 0.8, fringe(p) * 0.25)) as Want,
    fern: ((p, x, z) => (p.near > 0.3 ? p.near : 0) * (outer(x, z) ? 1 : 0.6)) as Want,
    feet: ((p) => p.near) as Want,
    flower: ((p) => Math.max(ss(0.42, 0.55, p.patch) * (1 - ss(0.62, 0.8, p.patch)) * 0.7, p.near * 0.55, fringe(p) * 0.3)) as Want,
    weed: ((p, x, z) => Math.max(outer(x, z) * 0.5, p.near * 0.35, (1 - patchy(p)) * 0.12)) as Want,
    back: ((p, x, z) => (z < PLAY.z0 - 1.2 || Math.abs(x) > 7.6 ? 0.45 + p.near * 0.55 : 0)) as Want,
    open: ((p) => patchy(p) * 0.8 + 0.1) as Want,
    any: (() => 1) as Want,
  };
  /** clumps of standing cards where the habitat wants them; never inside the battle floor; colony = one tint per clump */
  const plant = (kind: string, n: number, s: [number, number], want: Want, o2: { tints?: number[]; cluster?: number; spread?: number; colony?: boolean; area?: Rect } = {}) => {
    const ar = o2.area ?? AREA, cl = o2.cluster ?? 5, sp = o2.spread ?? 0.6; let placed = 0, tries = 0; n = Math.round(n * D);
    while (placed < n && tries < n * 30) {
      tries++;
      const cx = ar.x0 + hash(tries, sd, 1 + kind.length * 7) * (ar.x1 - ar.x0), cz = ar.z0 + hash(tries, sd, 2 + kind.length * 11) * (ar.z1 - ar.z0);
      const p = at(cx, cz); if (!p || p.d > -0.1 || clear.some(r => inRect(r, cx, cz))) continue;
      if (hash(tries, sd, 3 + kind.length) > want(p, cx, cz)) continue;
      const t0 = o2.tints ? o2.tints[Math.floor(hash(tries, sd, 5) * o2.tints.length)] : undefined;
      for (let k = 0; k < cl && placed < n; k++) {
        const x = cx + (hash(tries, k, sd + 3) - 0.5) * sp * 2, z = cz + (hash(tries, k, sd + 4) - 0.5) * sp * 2, q = at(x, z);
        if (!q || q.d > -0.1 || clear.some(r => inRect(r, x, z)) || inFlora(w, x, z) || want(q, x, z) < 0.12) continue;
        const y = groundOK(x, z); if (y == null) continue;
        const sc = s[0] + hash(tries, k, 5) * (s[1] - s[0]) * (q.d > -0.6 ? 0.7 : 1);
        c.cards.add(kind, x, z, { y, s: sc, tint: o2.colony ? t0 : o2.tints ? o2.tints[Math.floor(hash(tries, k, 6) * o2.tints.length)] : undefined }); placed++;
      }
    }
  };
  /** flat decals; on the battle floor only the kinds allowed there, toned to the floor they lie on (low contrast) */
  const decal = (kind: string, n: number, s: [number, number], want: Want, o2: { tints?: number[]; inside?: boolean } = {}) => {
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 40) {
      tries++;
      const x = AREA.x0 + hash(tries, sd, 21 + kind.length) * (AREA.x1 - AREA.x0), z = AREA.z0 + hash(tries, sd, 22 + kind.length) * (AREA.z1 - AREA.z0), p = at(x, z);
      if (!p || (p.d > -0.2 && !o2.inside) || p.y > 0.1 || hash(tries, sd, 23) > want(p, x, z)) continue;
      const y = groundOK(x, z, 0.1); if (y == null) continue;
      const tint = p.d > -0.2 ? tone(p.floor, 2.0) : o2.tints ? o2.tints[tries % o2.tints.length] : undefined;
      c.cards.add(kind, x, z, { y, s: (s[0] + hash(tries, 7, sd) * (s[1] - s[0])) * (p.d > -0.2 ? 0.75 : 1), ry: Math.floor(hash(tries, 8, sd) * 4) * Math.PI / 2, tint }); placed++;
    }
  };
  /** vines, moss and roots hanging from the tops of wall or rock runs, on the face toward the stage; never over a niche or an
   *  opening (the wall behind the card must be solid all the way down it), never longer than maxLen metres */
  const hang = (kinds: string[], every: number, tints?: number[], maxLen = 2.0) => {
    for (const [x0, z0, x1, z1, dir] of o.hang ?? []) {
      const [dx, dz] = dir === 's' ? [0, 1] : dir === 'n' ? [0, -1] : dir === 'e' ? [1, 0] : [-1, 0], ry = dir === 's' ? 0 : dir === 'n' ? Math.PI : dir === 'e' ? Math.PI / 2 : -Math.PI / 2;
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / every));
      for (let i = 0; i <= n; i++) {
        if (hash(i, sd, 31 + Math.round(x0 * 7 + z0 * 3)) < 0.3) continue;
        let x = x0 + (x1 - x0) * (i / n) + (hash(i, sd, 32) - 0.5) * every * 0.6, z = z0 + (z1 - z0) * (i / n) + (hash(i, sd, 33) - 0.5) * every * 0.6;
        // march inward: first into the wall (the run line may sit just behind it), then through it until the column at chest
        // height is open again — that boundary is the face
        let top = -1, k = 0, inside = false;
        for (; k < 60; k++) {
          const cx = x + dx * k * CELL, cz = z + dz * k * CELL, solid = w.has(M(cx), M(0.9), M(cz));
          if (!inside) { if (solid) inside = true; else continue; }
          if (!solid) break;
          top = Math.max(top, surface(c, cx, cz) ?? -1);
        }
        if (!inside || k >= 60 || top < 0.9) continue;
        const kind = kinds[Math.floor(hash(i, sd, 34) * kinds.length)], full = 32 * CELL, s = Math.min(0.42 + hash(i, sd, 35) * 0.5, (top - 0.25) / full, maxLen / full);
        // the wall cells right behind the card, across its width and down its length, must all be there
        const fx = x + dx * (k - 1) * CELL, fz = z + dz * (k - 1) * CELL, half = Math.max(1, Math.round(8 * s) - 1), yTop = M(top) - 1, yBot = M(top - s * full);
        let open = false;
        for (let u = -half; u <= half && !open; u += 2) for (let y = yTop; y >= yBot && !open; y -= 2) if (!w.has(M(fx) + (dz ? u : 0), y, M(fz) + (dx ? u : 0))) open = true;
        if (open) continue;
        // the face is the boundary of the first open cell (exact, so the card never sinks into the wall), plus a small gap
        if (dx) { const op = M(x + dx * k * CELL); x = (op - dx * 0.5) * CELL + dx * 0.03; }
        else { const op = M(z + dz * k * CELL); z = (op - dz * 0.5) * CELL + dz * 0.03; }
        c.cards.add(kind, x, z, { y: top + 0.02, ry, s, tint: tints ? tints[i % tints.length] : undefined });
      }
    }
  };
  const reeds = (n: number) => {
    for (const r of o.water ?? []) for (let i = 0; i < n; i++) {
      const side = Math.floor(hash(i, sd, 41) * 4), t = hash(i, sd, 42), j = (hash(i, sd, 43) - 0.3) * 0.8;
      // reeds stand in clumps along the bank: skip most of the bank, crowd the rest
      if (Math.sin(t * 9 + side * 2 + sd) < 0.1) continue;
      const x = side < 2 ? r.x0 + t * (r.x1 - r.x0) : side === 2 ? r.x0 + j : r.x1 - j, z = side >= 2 ? r.z0 + t * (r.z1 - r.z0) : side === 0 ? r.z0 + j : r.z1 - j;
      if (playDepth(x, z) > -0.2) continue;
      c.cards.add('reeds', x, z, { y: (surface(c, x, z) ?? -0.08), s: 0.8 + hash(i, sd, 44) * 0.6 });
    }
  };
  for (const [x, y, z, yaw] of o.webs ?? []) c.cards.add('web', x, z, { y, ry: yaw, s: 0.8 + hash(x, z) * 0.3 });
  buildFlora(c);
  if (o.leaves?.length) skinScene(c, new Set(o.leaves.filter(k => !floraCols(c.w).has(k))));
  for (const [x, z, yaw, tilt, sw] of o.shafts ?? []) c.shaft(x, z, { yaw, tilt, w: sw });

  // Duskwood growth: grass gone to straw and grey-green, a few pale blooms at most, leaf litter, fallen twigs and toadstools at the
  // feet of the dead trees; the living green is a cold, drained green
  const G = [0xe0d494, 0xc8c8a0, 0xd8cc9c, 0xb4bca8], COLD = [0xb8c0c8, 0xa8b0b8, 0xc4c8c8], DRY = [0xe8d8a8, 0xd8c890, 0xc8b880], FERN = [0xc8d0b8, 0xb4bca8, 0xbcc4c0];
  /** flower colours: each colony takes one — pale only, the night has drained the rest */
  const BLOOM = { woods: [0xe8e8f4, 0xc8c0e0, 0xd8d8c8], grave: [0xe0dcf0, 0xf0f0f4, 0xc4bcd8], swamp: [0xe0e0cc, 0xc8c0d8] };
  const FUNGI = [0xffffff, 0xe0d8d0, 0xc8c0c8];
  switch (preset) {
    case 'woods': case 'grove': {
      const g = preset === 'grove' ? 1.2 : 1;
      plant('grass', 380 * g, [0.55, 0.9], W.grass, { tints: G, cluster: 7, spread: 0.7 });
      plant('tallgrass', 130 * g, [0.7, 1.1], W.tall, { tints: DRY, cluster: 5, spread: 0.55 });
      plant('weeds', 70, [0.7, 1.05], W.weed, { tints: DRY, cluster: 4 });
      plant('fern', 45 * g, [0.7, 1.05], W.fern, { tints: FERN, cluster: 3, spread: 0.55 });
      plant('fungus', 46, [0.5, 0.85], W.feet, { tints: FUNGI, cluster: 4, spread: 0.35 });
      plant('flowers', 10, [0.5, 0.75], W.feet, { tints: BLOOM.woods, colony: true, cluster: 4, spread: 0.3 });
      plant('bramble', 30, [0.9, 1.3], W.back, { cluster: 3, tints: [0xa89a9a] });
      decal('litter', 24, [0.55, 0.9], (p) => Math.max(p.near, 0.25)); decal('twigs', 16, [0.6, 1.0], W.feet);
      c.ambient({ kind: 'fireflies', color: preset === 'grove' ? 0xc8f0d0 : 0xd8e8ff, rate: preset === 'grove' ? 3 : 1.2 });
      c.ambient({ kind: 'leaves', color: 0x7a6a4e, rate: 1.8 }); c.ambient({ kind: 'dust', color: 0xb8c0e0, rate: 2.5 });
      break;
    }
    case 'grave': {
      plant('grass', 340, [0.5, 0.85], W.grass, { tints: COLD, cluster: 7, spread: 0.7 });
      plant('weeds', 110, [0.7, 1.1], W.feet, { tints: [0xc8c0b0, 0xa8a090], cluster: 4 });
      plant('tallgrass', 60, [0.7, 1.0], W.tall, { tints: DRY, cluster: 4 });
      plant('fungus', 24, [0.45, 0.75], W.feet, { tints: FUNGI, cluster: 3, spread: 0.3 });
      plant('flowers', 12, [0.5, 0.75], W.feet, { tints: BLOOM.grave, colony: true, cluster: 3, spread: 0.3 });
      plant('bramble', 30, [0.9, 1.3], W.back, { cluster: 3, tints: [0xa89a9a] });
      decal('bones', 4, [0.6, 0.8], W.weed); decal('litter', 14, [0.5, 0.85], W.feet); decal('twigs', 8, [0.6, 0.9], W.feet);
      c.ambient({ kind: 'fireflies', color: 0x9affd0, rate: 2 }); c.ambient({ kind: 'leaves', color: 0x6a5a44, rate: 1.0 }); c.ambient({ kind: 'dust', color: 0xb8c8e8, rate: 2 });
      break;
    }
    case 'swamp': {
      reeds(80);
      plant('tallgrass', 160, [0.7, 1.2], W.tall, { tints: [0xc8c8a0, 0xb8bc98, 0xd0ccb0], cluster: 6 });
      plant('weeds', 70, [0.8, 1.2], W.weed, { tints: [0xb0b088, 0xa0a07c], cluster: 4 });
      plant('grass', 200, [0.5, 0.8], W.grass, { tints: [0xc8c8a0, 0xb8bca0], cluster: 6 });
      plant('fungus', 24, [0.45, 0.75], W.feet, { tints: [0xd8e0c8, 0xc8c8b8], cluster: 3, spread: 0.3 });
      decal('puddle', 6, [0.5, 0.9], W.feet, { tints: [0x98b8a8] }); decal('mossdecal', 8, [0.6, 1.0], W.open, { tints: [0xc0c8a8] }); decal('twigs', 6, [0.6, 0.9], W.feet);
      hang(['moss'], 1.4, [0xb0b8a0], 1.6);
      c.ambient({ kind: 'spores', color: 0x9aff9a, rate: 4 }); c.ambient({ kind: 'fireflies', color: 0x8affb0, rate: 2 });
      break;
    }
    case 'house': {
      // weeds through the boards along the walls, growth outside the ruin, ivy and dead vines, leaves blown into the corners
      plant('weeds', 70, [0.6, 1.0], W.feet, { tints: DRY, cluster: 3, spread: 0.35 });
      plant('grass', 180, [0.55, 0.9], (p, x, z) => (Math.abs(x) > 8.9 || z < -11.5 || z > 6.6 ? W.grass(p, x, z) : 0), { tints: G, cluster: 6, spread: 0.7 });
      plant('tallgrass', 50, [0.7, 1.0], (p, x, z) => (Math.abs(x) > 8.9 || z > 6.6 ? Math.max(p.near, 0.4) : 0), { tints: DRY, cluster: 4 });
      plant('fungus', 16, [0.4, 0.65], W.feet, { tints: FUNGI, cluster: 3, spread: 0.25 });
      hang(['vine', 'deadvine', 'moss'], 1.1, [0xc0c8b0, 0xd8d0c8, 0xb8c0a8], 1.8);
      decal('crack', 5, [0.4, 0.65], W.feet); decal('litter', 10, [0.4, 0.65], W.feet); decal('twigs', 4, [0.5, 0.7], W.feet);
      c.ambient({ kind: 'dust', color: 0xd8d8f0, rate: 7, y: [0.3, 3.2] }); c.ambient({ kind: 'leaves', color: 0x7a6a4e, rate: 0.8 });
      break;
    }
    case 'dungeon': {
      hang(['moss', 'moss', 'vine'], 1.7, [0xd0d8c0, 0xc0c8b0], 1.15);
      plant('shroom', 22, [0.35, 0.55], W.feet, { cluster: 3, spread: 0.3, tints: [0xc8d8e8] });
      plant('weeds', 20, [0.5, 0.8], W.feet, { tints: [0x8a8478], cluster: 3, spread: 0.3 });
      decal('crack', 7, [0.4, 0.7], W.feet); decal('bones', 4, [0.6, 0.8], W.feet); decal('pebbles', 8, [0.5, 0.8], W.feet, { tints: [0x8a8898], inside: true }); decal('puddle', 3, [0.5, 0.8], W.feet, { tints: [0x9aa0c0] });
      c.ambient({ kind: 'dust', color: 0xd8d0e8, rate: 6, y: [0.2, 3.5] });
      break;
    }
    case 'cave': case 'spider': case 'roots': {
      const glow = preset === 'roots' ? [0xffc890] : preset === 'spider' ? [0xc8ff9a] : [0xffffff, 0xe0c8ff];
      plant('shroom', preset === 'cave' ? 90 : 40, [0.5, 1.0], (p) => Math.max(p.near, 0.06), { tints: glow, cluster: 6, spread: 0.45, colony: true });
      hang(preset === 'roots' ? ['roots', 'roots', 'vine'] : preset === 'spider' ? ['moss', 'roots'] : ['moss', 'roots', 'vine'], 0.9, preset === 'roots' ? [0xe0c890, 0xffffff] : [0xd8e8d0, 0xc8c0b0], 1.6);
      plant('weeds', 30, [0.5, 0.9], W.feet, { tints: [0x9a9488], cluster: 3 });
      if (preset !== 'spider') { plant('fern', 26, [0.7, 1.0], W.fern, { tints: [0xa8c8b8], cluster: 3 }); plant('sprig', 24, [0.5, 0.8], W.feet, { tints: [0xa8c8b8], cluster: 3 }); }
      decal('crack', 6, [0.4, 0.7], W.feet); decal('puddle', 3, [0.5, 0.8], W.feet); decal('pebbles', 12, [0.5, 0.9], W.feet, { tints: [0x9a98a8, 0x8a8a9a], inside: true }); decal('mossdecal', 6, [0.6, 1.0], W.feet, { tints: [0x88b0a0] });
      if (preset === 'spider') decal('bones', 6, [0.6, 0.8], W.feet);
      c.ambient({ kind: 'spores', color: preset === 'roots' ? 0xffb050 : preset === 'spider' ? 0xc8ff7a : 0x7ae8ff, rate: 6 });
      c.ambient({ kind: 'dust', color: 0xc8c8d8, rate: 3 });
      break;
    }
  }
}

/** dress a voxel world that was not built through a stage (the battle's own arena): cards, motes and shafts under root */
export function dressWorld(root: THREE.Object3D, w: VoxWorld, preset: Preset, o: DressOpt = {}, moon = 0xb8c4ff) {
  const cards = new Cards(), amb: Ambient[] = [];
  const ctx = { w, cards, ambient: (a: Ambient) => { amb.push(a); }, shaft: (x: number, z: number, so?: object) => { shaft(root, x, z, { color: moon, ...so }); }, add: (m: THREE.Object3D) => { root.add(m); } } as unknown as Ctx;
  dress(ctx, preset, o); cards.build(root);
  onUpdate((_dt, rdt) => { if (root.parent) ambientTick(amb, rdt); });
}

// ------------------------------------------------------------------ skins for foliage a scene built itself
/** scene-built foliage (solid blocks in the given colours): its exposed faces, merged into rectangles, get the same cut-out leaf
 *  skins as the trees from flora.ts, and the side faces whose foot hangs free get a drip fringe */
function skinScene(c: Ctx, cols: Set<number>) {
  if (!cols.size) return;
  const w = c.w, C = CELL, T = 16, off = 0.5, kz = (k: number) => (k % 1024) - 512, ky = (k: number) => (Math.floor(k / 1024) % 1024) - 512, kx = (k: number) => Math.floor(k / 1048576) - 512;
  // slices of exposed faces per direction and plane: 0 +x, 1 −x, 2 +z, 3 −z, 4 top
  const sl = new Map<string, Map<number, number>>();
  for (const [k, v] of w.cells) {
    if (!cols.has(v.c)) continue;
    const x = kx(k), y = ky(k), z = kz(k);
    const put = (d: number, a: number, u: number, t: number) => { const key = d + ':' + a; let m = sl.get(key); if (!m) sl.set(key, (m = new Map())); m.set((u + 512) * 1024 + t + 512, v.c); };
    if (!w.has(x, y + 1, z)) put(4, y, x, z);
    if (!w.has(x + 1, y, z)) put(0, x, z, y); if (!w.has(x - 1, y, z)) put(1, x, z, y);
    if (!w.has(x, y, z + 1)) put(2, z, x, y); if (!w.has(x, y, z - 1)) put(3, z, x, y);
  }
  for (const [key, m] of sl) {
    const [d, a] = key.split(':').map(Number), done = new Set<number>();
    for (const k0 of [...m.keys()].sort((p, q) => p - q)) {
      if (done.has(k0)) continue;
      const col = m.get(k0)!, u0 = Math.floor(k0 / 1024) - 512, t0 = (k0 % 1024) - 512, K = (u: number, t: number) => (u + 512) * 1024 + t + 512;
      let t1 = t0; while (m.get(K(u0, t1 + 1)) === col && !done.has(K(u0, t1 + 1))) t1++;
      let u1 = u0; grow: for (;;) { for (let t = t0; t <= t1; t++) if (m.get(K(u1 + 1, t)) !== col || done.has(K(u1 + 1, t))) break grow; u1++; }
      for (let u = u0; u <= u1; u++) for (let t = t0; t <= t1; t++) done.add(K(u, t));
      const lu = u1 - u0 + 1, lt = t1 - t0 + 1;
      if (d === 4) { c.cards.add('leafskin', (u0 + lu / 2) * C, (t0 + lt / 2) * C, { y: (a + 1 + off) * C, rx: -Math.PI / 2, ry: 0, sx: (lu + 1) / T, sy: (lt + 1) / T, uv: [(lu + 1) / T, (lt + 1) / T, (u0 - 0.5) / T, -(t1 + 1.5) / T], tint: tone(col, SKIN_K.top) }); continue; }
      // side rects: u runs along the face (z for x faces, x for z faces), t is y
      const alongX = d >= 2, nrm = d % 2 === 0 ? 1 : -1, f = nrm > 0 ? a + 1 + off : a - off, mid = u0 + lu / 2, len = lu + 1, hy = lt + off;
      const px = alongX ? mid : f, pz = alongX ? f : mid, ry = alongX ? (nrm > 0 ? 0 : Math.PI) : (nrm > 0 ? Math.PI / 2 : -Math.PI / 2);
      const uo = alongX ? (nrm > 0 ? u0 - 0.5 : -(u1 + 1.5)) : (nrm > 0 ? -(u1 + 1.5) : u0 - 0.5), side = tone(col, 0.9);
      c.cards.add('leafskin', px * C, pz * C, { y: (t0 + hy / 2) * C, ry, sx: len / T, sy: hy / T, uv: [len / T, hy / T, uo / T, t0 / T], tint: tone(side, SKIN_K.side) });
      const mu = Math.round(mid - 0.5), fx = alongX ? mu : a, fz = alongX ? a : mu;
      if (!w.has(fx, t0 - 1, fz)) c.cards.add('leafdrip', px * C, pz * C, { y: (t0 + 1) * C, ry, sx: len / T, sy: 0.5, uv: [len / T, 0.5, uo / T, 0.5], tint: tone(col, 0.7 * SKIN_K.drip) });
    }
  }
}

// ------------------------------------------------------------------ a lab page for the flora (dev): __floraLab('trees' | 'ring' | 'cards')
const LAB: Record<string, SceneDef> = {
  trees: {
    id: 'lab_trees', name: '植被样板 · 树', group: '节点', kind: '户外', blurb: '暗色松、扭曲枯树、老橡树、灌木。', mood: NIGHT,
    build(c) {
      patches(c.w, AREA, [0x2e3a26, 0x34402a, 0x3a3428]);
      pine(c.w, -8, -3, 9, BARK_D, LEAVES.pine[0][0], LEAVES.pine[0][1], { seed: 3 }); pine(c.w, -3.6, -3, 6.5, BARK_D, PINE, PINE_T, { seed: 8 });
      deadTree(c.w, 1, -3, 7, DEAD.bark, DEAD.dark, { seed: 4, crow: 1 }); snag(c.w, 9.4, -2, 3.6, DEAD.bark, DEAD.dark, { seed: 2, crow: 1 }); oak(c.w, 6.4, -3, 8.5, { seed: 5, leaf: LEAVES.oak[0][0], leafTop: LEAVES.oak[0][1] });
      bush(c.w, -6, 4, 0.8, { seed: 1 }); bush(c.w, -3.4, 4.2, 0.55, { seed: 2, leaf: LEAVES.oak[2][0], leafTop: LEAVES.oak[2][1] }); bush(c.w, -1.2, 4, 0.45, { seed: 3, leaf: LEAVES.oak[1][0], leafTop: LEAVES.oak[1][1] });
      oak(c.w, 4.4, 5, 5.4, { seed: 11, low: 0.36, reach: [-1.3, 0], width: 1.1, leaf: 0x263f30, leafTop: 0x3c644a });
      dress(c, 'woods', { seed: 1 });
    },
  },
  ring: {
    id: 'lab_ring', name: '植被样板 · 树墙', group: '节点', kind: '户外', blurb: 'woodsRing 全密度。', mood: NIGHT,
    build(c) { patches(c.w, AREA, [0x2e3a26, 0x34402a, 0x3a3428]); woodsRing(c, 1); dress(c, 'woods', { seed: 1 }); },
  },
  cards: {
    id: 'lab_cards', name: '植被样板 · 面片', group: '节点', kind: '户外', blurb: '每种面片一小丛。', mood: NIGHT,
    build(c) {
      patches(c.w, AREA, [0x2e3a26, 0x34402a, 0x3a3428]);
      // a wall for hanging cards
      c.w.box(M(-6), -1, M(-12.6), M(6), M(2.6), M(-12.4), 0x5a5868);
      const stand = ['grass', 'tallgrass', 'fern', 'flowers', 'weeds', 'shroom', 'bramble', 'reeds', 'leaf', ...LAB_EXTRA.stand];
      stand.forEach((k, i) => { const x = -7 + (i % 6) * 2.8, z = -9.6 + Math.floor(i / 6) * 2.2; for (let j = 0; j < 7; j++) c.cards.add(k, x + (hash(i, j, 1) - 0.5) * 1.2, z + (hash(i, j, 2) - 0.5) * 1.2, { s: 0.8 + hash(i, j, 3) * 0.4, tint: k === 'flowers' ? [0xb8a0ff, 0xffffff, 0xffd870, 0xff7a6a][j % 4] : undefined }); });
      const walls = ['vine', 'moss', 'web', ...LAB_EXTRA.wall];
      walls.forEach((k, i) => c.cards.add(k, -5 + i * 2.4, -12.24, { y: 2.6, ry: 0, s: 0.9 }));
      const decals = ['litter', 'mossdecal', 'crack', 'bones', 'puddle', 'pebbles', ...LAB_EXTRA.decal];
      decals.forEach((k, i) => c.cards.add(k, 2 + (i % 4) * 2.3, -0.5 + Math.floor(i / 4) * 2.3, { y: 0.01, s: 1, ry: 0 }));
      dressWorldless(c);
    },
  },
};
/** card kinds added later, shown in the card lab too */
const LAB_EXTRA = { stand: ['bells', 'sprig', 'fungus'], wall: ['roots', 'deadvine'], decal: ['clover', 'twigs'] };
/** the lab's ambience without a preset's scatter */
function dressWorldless(c: Ctx) { c.ambient({ kind: 'fireflies', color: 0xe8ff9a, rate: 2 }); }
if (typeof window !== 'undefined') {
  const g = window as unknown as { __floraLab: (k: string) => void; __floraProj: (p: number[][]) => number[][] };
  g.__floraLab = (k: string) => { showStage(LAB[k] ?? LAB.trees); };
  /** world points → screen pixels with the live camera (to see what a framing covers) */
  g.__floraProj = (pts: number[][]) => pts.map(([x, y, z]) => { const v = new THREE.Vector3(x, y, z).project(camera); return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]; });
}
