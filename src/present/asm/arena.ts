// 2x 舞台的场地（act-19，用户：「战斗舞台太小了」「通道看起来也不像是通道」「希望场景中有各种可破坏的场景物件」）：
// 战斗区两侧和后方一圈矮墙（残村夯土墙带瓦檐、麦田编篱、破庙青砖墙），前方（镜头这边）不围；
// 出口是墙上的门洞（石础 + 方门柱 + 门楣小檐），这一间要走的门洞空着（木栅由 act/gates.ts 挡着、清场后倒下），
// 其余路口的门洞关着两扇木门；场地中间放 2～4 件不会坏的掩体大件（水井、石碾、柴车、石堆、香鼎、石碑、水槽），
// 和一批可破坏物件（陶罐、木箱、草垛、火油坛、立柱；逻辑在 act/breakLogic.ts，模型在 act/breakables.ts）。
// 规划（arenaPlan）是纯数据、按种子确定：拼场景时用它建墙门掩体的体素，战斗时用它建碰撞和物件，两边一致。
import { M, PLAY, hash, SZ } from '../scenes/props';
import type { Ctx } from '../scenes/stage';
import type { Layout, Rect } from './types';
import { exitInfo, type ExitId } from './exits';
import { FloorGrid, type ShapePlan } from './roomShape';
import { buildShape } from './shapeBuild';

export type WallStyle = 'earth' | 'wattle' | 'brick' | 'rail' | 'stockade' | 'plaster' | 'palace' | 'sandbag';
export type CoverKind = 'well' | 'mill' | 'cart' | 'stones' | 'ding' | 'stele' | 'trough' | 'bollard' | 'chains' | 'barrels' | 'rockery' | 'screen' | 'basin' | 'vaultChest'
  // 11-18 第二关「洛阳」(palace) / 第三关「下邳」(sandbag): drawn by their own arena_*.ts ('mooring' = 下邳's mooring stone; 'bollard' is 乌林's iron post)
  | 'camel' | 'streetCamel' | 'bellrack' | 'charpile' | 'beast' | 'mintPress' | 'columnBase' | 'columnStub' | 'boat' | 'mooring' | 'bags' | 'raft';
export type PropKind = 'pot' | 'crate' | 'hay' | 'oil' | 'pillar' | 'fence' | 'rack' | 'banner' | 'basket' | 'sack' | 'lamp';
/** a box in a wall run's own frame: p along the run, q across it (cells) */
export type RunBox = (p0: number, y0: number, q0: number, p1: number, y1: number, q1: number, col: number) => void;
/** a box in a cover piece's own frame, centred on its cell (cells; x = its long side) */
export type CoverBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number) => void;
/** 11-18 (一局五关): a wall style of a later region, from its own file (asm/<region>/arena_*.ts registers it here), so the places of
 *  each region get their own walls, gate posts, cover and small breakables without this file growing a branch per region */
export interface ArenaStyle {
  /** one straight stretch: segs = [p0, p1, top] runs of equal height (a broken stretch is lower), b0..b1 = the wall's band across */
  wall(bx: RunBox, segs: Array<[number, number, number]>, b0: number, b1: number, H: number): void;
  /** the gate posts: body, dark, light */ post: [number, number, number];
  covers: CoverKind[]; size: Partial<Record<CoverKind, [number, number]>>; cover: Partial<Record<CoverKind, (bx: CoverBox) => void>>;
  /** the heap a cover piece crumbles to: body, dark, light */ rubble: [number, number, number];
  /** the small breakables in the clusters; banners = 黄巾 banners on the floor (no for the other regions) */ smalls: PropKind[]; banners: boolean;
}
export const ARENA_STYLES: Partial<Record<WallStyle, ArenaStyle>> = {};
/** locale id → its wall style (filled by the regions' style files) */
export const LOCALE_STYLE: Record<string, WallStyle> = {};
/** a gap in the wall: centre (x, z), along 'x' (the back wall) or 'z' (a side wall), opening width w; open = this room's way out */
export interface Gate { id: ExitId | 'path'; x: number; z: number; along: 'x' | 'z'; w: number; open: boolean; out: [number, number] }
export interface Cover { kind: CoverKind; x: number; z: number; hx: number; hz: number; rot: 0 | 1 }
export interface ArenaPlan { style: WallStyle; gates: Gate[]; covers: Cover[]; props: Array<{ kind: PropKind; x: number; z: number; rot?: 0 | 1; model?: 'palaceColumn' }>;
  /** the wall's inner face sits this far outside PLAY (m) and it is this thick / tall */ wall: { gap: number; thick: number; h: number };
  /** 11-18 屋子形态: the room's shape (asm/roomShape.ts) — its walls follow the floor's outline, its pits and bridges; absent = the
   *  act-19 rectangle (the title screens) */
  shape?: ShapePlan;
  /** act-189: leave the camera-side (+z) wall open (used only by low eye-level title screens) */
  openFront?: boolean }

export const WALL = { gap: 0.1, thick: 0.49, h: 1.19 };
/** act-189: chest-high physical south (camera-side) perimeter wall height (1.19 m = 17 cells) — clearly blocks the player while keeping torso/head/telegraphs legible */
export const SOUTH_WALL_H = WALL.h;
/** 11-18 (用户：「我觉得怎么那么多矮墙啊……感觉墙都没人高，很不自然」): a wall stands taller than a person (she is ≈ 1.7 m); a field's
 *  wattle fence, a ship's rail and a sandbag breastwork are low by nature and keep the old height */
export const WALL_TALL = 2.45;
const LOW_BY_NATURE: WallStyle[] = ['wattle', 'rail', 'sandbag'];
export const wallHOf = (st: WallStyle) => LOW_BY_NATURE.includes(st) ? WALL.h : WALL_TALL;
export const styleOf = (locale: string): WallStyle => ARENA_LOOK[locale]?.style ?? LOCALE_STYLE[locale] ?? (locale === 'hj_field' ? 'wattle' : locale === 'hj_temple' ? 'brick' : 'earth');
const COVERS: Partial<Record<WallStyle, CoverKind[]>> = { earth: ['well', 'mill', 'cart', 'stones'], wattle: ['cart', 'trough', 'mill', 'stones'], brick: ['ding', 'stele', 'stones', 'well'],
  rail: ['bollard', 'chains', 'barrels'], stockade: ['barrels', 'chains', 'cart', 'stones'], plaster: ['rockery', 'screen', 'basin'] };
const COVER_SIZE: Partial<Record<CoverKind, [number, number]>> = { well: [0.75, 0.75], mill: [0.8, 0.8], cart: [1.15, 0.65], stones: [0.7, 0.6], ding: [0.6, 0.6], stele: [0.75, 0.4], trough: [1.0, 0.45],
  bollard: [0.55, 0.55], chains: [0.9, 0.7], barrels: [0.85, 0.6], rockery: [0.9, 0.75], screen: [1.1, 0.3], basin: [0.7, 0.7], vaultChest: [0.95, 0.6] };
/** wp/regB (第四关 · 锁江、第五关 · 许都雪): a place outside 地域一 registers the look of its battle floor here — the wall style, the
 *  cover, the small breakables and how many of the 黄巾 banners / lantern posts / oil jars / pillars it has (the banner is a yellow
 *  黄巾 one: the 曹军 and the 崔府 have none). Every place registered here is built on the 2x stage (bigStage) */
export interface ArenaLook { style: WallStyle; covers?: CoverKind[]; smalls?: PropKind[]; banners?: number; lamps?: number; oil?: number; pillars?: number; fences?: number; racks?: number }
export const ARENA_LOOK: Record<string, ArenaLook> = {};
/** the room is built on the 2x stage with walls, gates, cover and breakables (地域一's places and every one in ARENA_LOOK) */
export const bigStage = (locale: string) => locale.startsWith('hj_') || locale in ARENA_LOOK || locale in LOCALE_STYLE;
const coversOf = (st: WallStyle) => ARENA_STYLES[st]?.covers ?? COVERS[st] ?? COVERS.earth!;
const sizeOf = (k: CoverKind): [number, number] => COVER_SIZE[k] ?? Object.values(ARENA_STYLES).find(s => s?.size[k])?.size[k] ?? [0.7, 0.6];

interface WallAnchor { x: number; z: number; along: 'x' | 'z'; nx: number; nz: number }

/** Scan clean, wide-facing wall-hugging anchor points (never inside narrow corridors, doorways, or pits). */
function wallAnchors(grid: FloorGrid | null, box: Rect): WallAnchor[] {
  const out: WallAnchor[] = [];
  if (grid) {
    const step = 3; // ~1.47 m between candidate wall stations
    const dirs: Array<[number, number, 'x' | 'z']> = [[-1, 0, 'z'], [1, 0, 'z'], [0, -1, 'x'], [0, 1, 'x']];
    for (let j = 0; j < grid.nz; j++) for (let i = 0; i < grid.nx; i++) {
      if (grid.kind(i, j) !== 1 || grid.elevAt(i, j) !== 0) continue; // ground FLOOR only (keep elevated terraces uncluttered)
      for (const [dx, dz, along] of dirs) {
        if ((along === 'z' ? j : i) % step !== 1) continue;
        // must back onto an actual solid wall (OUT === 0), never a water/ditch pit (PIT === 2)
        if (grid.kind(i + dx, j + dz) !== 0) continue;
        // never hug the open camera-facing front edge
        if (dz > 0 && grid.cz(j) > box.z1 - 0.9) continue;
        // wall must continue on at least one side along its tangent (solid flat wall, not a corner tooth)
        const tx = along === 'x' ? 1 : 0, tz = along === 'z' ? 1 : 0;
        if (grid.kind(i + dx + tx, j + dz + tz) !== 0 && grid.kind(i + dx - tx, j + dz - tz) !== 0) continue;
        const nx = -dx, nz = -dz;
        const ax = grid.cx(i) + nx * 0.42, az = grid.cz(j) + nz * 0.42;
        // strict narrow-corridor avoidance: open floor must extend at least ~2.6 m in front of the wall station
        if (!grid.clear(ax, az, 0.45) || !grid.clear(ax + nx * 1.45, az + nz * 1.45, 0.95)) continue;
        out.push({ x: +ax.toFixed(2), z: +az.toFixed(2), along, nx, nz });
      }
    }
    return out;
  }
  for (let z = box.z0 + 2.2; z <= box.z1 - 3.6; z += 1.8) {
    out.push({ x: +(box.x0 + 0.82).toFixed(2), z: +z.toFixed(2), along: 'z', nx: 1, nz: 0 });
    out.push({ x: +(box.x1 - 0.82).toFixed(2), z: +z.toFixed(2), along: 'z', nx: -1, nz: 0 });
  }
  for (let x = box.x0 + 2.4; x <= box.x1 - 2.4; x += 1.8) {
    out.push({ x: +x.toFixed(2), z: +(box.z0 + 0.82).toFixed(2), along: 'x', nx: 0, nz: 1 });
  }
  return out;
}

/** the plan for one room: gates from the layout's roads and this room's exits, cover and props from the seed; with a shape (11-18 屋子形态)
 *  the walls follow the shape's floor, cover and props stand only on its floor (never in the water, on a bridge or in a walled-off part) */
export function arenaPlan(layout: Layout, exits: ExitId[], seed: number, locale: string, kind: 'fight' | 'boss' | 'calm', shape?: ShapePlan): ArenaPlan {
  if (shape?.fixed) return drawnPlan(layout, exits, seed, locale, kind, shape);
  const r = (k: number) => hash(seed * 7 + 11, k, 4513), style = styleOf(locale), gates: Gate[] = [], look = ARENA_LOOK[locale];
  const grid = shape ? new FloorGrid(shape, 2) : null;
  // the side exits cut their own gate; every road that runs out through the back wall gets one (the back exit's road is open)
  for (const id of exits) if (id !== 'back') { const e = exitInfo(layout, id); gates.push({ id, x: id === 'left' ? PLAY.x0 : PLAY.x1, z: (e.lane.z0 + e.lane.z1) / 2, along: 'z', w: 2.8, open: true, out: [id === 'left' ? -1 : 1, 0] }); }
  const back = exits.includes('back') ? exitInfo(layout, 'back') : null;
  for (const p of layout.path) if (p.z0 < PLAY.z0 - 0.5 && p.z1 > PLAY.z0) {
    const cx = (p.x0 + p.x1) / 2, w = Math.min(3.0, Math.max(2.6, p.x1 - p.x0 + 0.4));
    if (gates.some(g => g.along === 'x' && Math.abs(g.x - cx) < w)) continue;
    const open = !!back && Math.abs((back.lane.x0 + back.lane.x1) / 2 - cx) < 0.5;
    gates.push({ id: open ? 'back' : 'path', x: cx, z: PLAY.z0, along: 'x', w, open, out: [0, -1] });
  }
  // the floor kept clear: the hero's way in, generous gate funnels, main paved paths, boss mark, calm stations, bridges
  const ent = shape?.enter ?? [0, PLAY.z1 - 2.5];
  const clear: Rect[] = [{ x0: ent[0] - 2.8, x1: ent[0] + 2.8, z0: ent[1] - 4.2, z1: PLAY.z1 + 1 }];
  for (const g of gates) clear.push(g.along === 'x'
    ? { x0: g.x - g.w / 2 - 1.4, x1: g.x + g.w / 2 + 1.4, z0: g.z, z1: g.z + 5.0 }
    : { x0: g.out[0] < 0 ? g.x : g.x - 5.0, x1: g.out[0] < 0 ? g.x + 5.0 : g.x, z0: g.z - g.w / 2 - 1.4, z1: g.z + g.w / 2 + 1.4 });
  for (const p of layout.path) clear.push({ x0: p.x0 - 0.5, x1: p.x1 + 0.5, z0: p.z0 - 0.5, z1: p.z1 + 0.5 });
  clear.push({ x0: -2.8, x1: 2.8, z0: SZ(-4.6) - 2.8, z1: SZ(-4.6) + 2.8 });
  if (kind === 'calm') clear.push({ x0: -5.5, x1: 5.5, z0: -3.4, z1: 1.6 });
  for (const b of shape?.bridges ?? []) clear.push({ x0: b.x0 - 0.8, x1: b.x1 + 0.8, z0: b.z0 - 2.4, z1: b.z1 + 2.4 });
  const inClear = (x: number, z: number, pad: number) => clear.some(c => x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad);
  const inFloor = (x: number, z: number, pad: number) => grid ? grid.clear(x, z, pad) : x > PLAY.x0 + pad && x < PLAY.x1 - pad && z > PLAY.z0 + pad && z < PLAY.z1 - pad;
  // cover: on a jittered 3 m grid, ≥ 6 m apart, ≥ 2.5 m in from the walls, clear of paths & gate funnels
  const covers: Cover[] = [], kinds = look?.covers ?? coversOf(style), want = kind === 'calm' ? 2 : kind === 'boss' ? 2 : 3 + (r(1) < 0.4 ? 1 : 0);
  const spots: Array<[number, number, number]> = [];
  for (let x = PLAY.x0 + 3; x < PLAY.x1 - 2.5; x += 3) for (let z = PLAY.z0 + 3; z < PLAY.z1 - 2.5; z += 3) spots.push([x + (r(x * 31 + z) - 0.5) * 1.2, z + (r(x * 37 + z * 3) - 0.5) * 1.2, r(x * 41 + z * 7)]);
  spots.sort((a, b) => a[2] - b[2]);
  for (const [x, z] of spots) {
    if (covers.length >= want) break;
    const k = kinds[covers.length % kinds.length], rot = (r(x * 13 + z) < 0.5 ? 0 : 1) as 0 | 1, [a, b] = sizeOf(k), hx = rot ? b : a, hz = rot ? a : b;
    if (!inFloor(x, z, 2.5) || inClear(x, z, Math.max(hx, hz) + 0.5) || covers.some(c => Math.hypot(c.x - x, c.z - z) < 6)) continue;
    covers.push({ kind: k, x: +x.toFixed(2), z: +z.toFixed(2), hx, hz, rot });
  }
  // props: structured clusters beside cover and snapped flush along walls (never floating in lanes or blocking doors)
  const props: ArenaPlan['props'] = [], R0: Record<PropKind, number> = { pot: 0.32, crate: 0.4, hay: 0.55, oil: 0.38, pillar: 0.3, fence: 0.85, rack: 0.5, banner: 0.25, basket: 0.34, sack: 0.34, lamp: 0.25 };
  const free = (x: number, z: number, rr: number) => inFloor(x, z, rr + 0.3) && !inClear(x, z, rr + 0.25) && covers.every(c => Math.abs(c.x - x) > c.hx + rr + 0.35 || Math.abs(c.z - z) > c.hz + rr + 0.35) && props.every(p => Math.hypot(p.x - x, p.z - z) > R0[p.kind] + rr + 0.25);
  const put = (k: PropKind, x: number, z: number, rot?: 0 | 1) => { if (!free(x, z, R0[k])) return false; props.push({ kind: k, x: +x.toFixed(2), z: +z.toFixed(2), ...(rot != null ? { rot } : {}) }); return true; };
  const smalls: PropKind[] = look?.smalls ?? ARENA_STYLES[style]?.smalls ?? (style === 'wattle' ? ['hay', 'pot', 'sack', 'hay', 'basket'] : style === 'brick' ? ['pot', 'pot', 'crate', 'basket'] : ['hay', 'crate', 'pot', 'sack', 'basket']);
  let salt = 100;
  const cluster = (ax: number, az: number, n: number) => { const k = smalls[Math.floor(r(salt++) * smalls.length)]; for (let i = 0, t = 0; i < n && t < 12; t++) { const a = r(salt++) * Math.PI * 2, d = 0.5 + r(salt++) * 0.8; if (put(i === 0 ? k : smalls[Math.floor(r(salt++) * smalls.length)], ax + Math.cos(a) * d, az + Math.sin(a) * d)) i++; } };
  for (const c of covers) { const s = r(salt++) < 0.5 ? -1 : 1; cluster(c.x + s * (c.hx + 0.9), c.z + (r(salt++) - 0.5) * c.hz * 2, 2 + (r(salt++) < 0.5 ? 1 : 0)); }

  // wall-snapped stations (ordered by seeded shuffle, spaced evenly along walls, never inside clear corridors)
  const anchors = wallAnchors(grid, shape?.box ?? PLAY).map(a => ({ a, o: r(salt++) })).sort((p, q) => p.o - q.o).map(q => q.a);
  const usedStations: Array<[number, number]> = [];
  const takeAnchor = (minGap: number) => {
    for (const a of anchors) {
      if (inClear(a.x, a.z, 0.7)) continue;
      if (usedStations.some(([ux, uz]) => Math.hypot(ux - a.x, uz - a.z) < minGap)) continue;
      usedStations.push([a.x, a.z]);
      return a;
    }
    return null;
  };
  const putWall = (a: WallAnchor, k: PropKind, tang = 0, rot?: 0 | 1) => {
    const tx = a.along === 'x' ? 1 : 0, tz = a.along === 'z' ? 1 : 0;
    const off = Math.max(0, R0[k] - 0.24);
    return put(k, a.x + a.nx * off + tx * tang, a.z + a.nz * off + tz * tang, rot);
  };
  // structured wall-hugging narrative sets (hay pairs / crate+pot groups lined up parallel to the wall)
  const nWallSets = kind === 'calm' ? 3 : 5;
  for (let i = 0; i < nWallSets; i++) {
    const a = takeAnchor(4.2); if (!a) break;
    const lead = style === 'earth' || style === 'wattle' ? (i % 2 === 0 ? 'hay' : 'crate') : smalls[i % smalls.length];
    const side = smalls[(i + 2) % smalls.length];
    putWall(a, lead, 0);
    putWall(a, lead === 'hay' ? 'hay' : side, 1.18);
    if (r(salt++) < 0.7) putWall(a, side, -1.08);
  }
  if (kind !== 'calm') {
    const nOil = look?.oil ?? (kind === 'boss' ? 3 : 2 + (r(salt++) < 0.5 ? 1 : 0)), nPil = look?.pillars ?? (kind === 'boss' ? 2 : 1 + (r(salt++) < 0.5 ? 1 : 0));
    for (let i = 0, t = 0; i < nOil && t < 40; t++) { const x = PLAY.x0 + 3 + r(salt++) * (PLAY.x1 - PLAY.x0 - 6), z = PLAY.z0 + 3 + r(salt++) * (PLAY.z1 - PLAY.z0 - 8); if (covers.every(c => Math.hypot(c.x - x, c.z - z) > 3) && props.filter(p => p.kind === 'oil').every(p => Math.hypot(p.x - x, p.z - z) > 4) && put('oil', x, z)) i++; }
    for (let i = 0, t = 0; i < nPil && t < 40; t++) { const x = PLAY.x0 + 3.5 + r(salt++) * (PLAY.x1 - PLAY.x0 - 7), z = PLAY.z0 + 3.5 + r(salt++) * (PLAY.z1 - PLAY.z0 - 9); if (props.filter(p => p.kind === 'pillar').every(p => Math.hypot(p.x - x, p.z - z) > 6) && put('pillar', x, z)) i++; }
  }
  // wall-aligned racks, banners, lamps, and flank fences (keeping the middle combat space & roads clean)
  const nRacks = look?.racks ?? 2;
  for (let i = 0; i < nRacks; i++) { const a = takeAnchor(4.5); if (a) putWall(a, 'rack', 0, a.along === 'z' ? 1 : 0); }
  const wantBanners = look?.banners != null || (ARENA_STYLES[style]?.banners ?? true);
  const nBan = wantBanners ? (look?.banners ?? (kind === 'calm' ? 1 : 3)) : 0;
  for (let i = 0; i < nBan; i++) { const a = takeAnchor(4.8); if (a) putWall(a, 'banner', 0); }
  const nLamp = (look?.lamps ?? 2) + (wantBanners ? 0 : (kind === 'calm' ? 1 : 2));
  for (let i = 0; i < nLamp; i++) { const a = takeAnchor(5.2); if (a) putWall(a, 'lamp', 0); }
  const nFence = look?.fences ?? (kind === 'calm' ? 1 : 2);
  for (let i = 0; i < nFence; i++) { const a = takeAnchor(4.8); if (a) putWall(a, 'fence', 0, a.along === 'z' ? 1 : 0); }
  return { style, gates, covers, props, wall: { ...WALL, ...(shape ? { gap: 0 } : {}) }, ...(shape ? { shape } : {}) };
}

/** 11-18 定死的屋子 (asm/roomMaps.ts): the plan of a drawn room — every gate, cover piece and breakable where the map puts it (the
 *  kinds and the small dressing from the room's own seed, so the room is the same every time). Wall dressing snaps cleanly to wide
 *  walls and avoids entrances, internal doors, puzzle mechanisms, and narrow lanes. */
function drawnPlan(layout: Layout, exits: ExitId[], seed: number, locale: string, kind: 'fight' | 'boss' | 'calm', shape: ShapePlan): ArenaPlan {
  const fx = shape.fixed!, r = (k: number) => hash(seed * 7 + 11, k, 4513), style = styleOf(locale), look = ARENA_LOOK[locale], gates: Gate[] = [];
  const grid = new FloorGrid({ ...shape, fixed: { ...fx, closed: [] } }, 2);
  const used = new Set<string>();
  for (const id of exits) {
    const e = layout.drawn?.[id]; if (!e) continue; used.add(`${e.x},${e.z}`);
    gates.push(e.side === 'back' ? { id, x: e.x, z: PLAY.z0, along: 'x', w: 2.8, open: true, out: [0, -1] } : { id, x: e.x, z: e.z, along: 'z', w: 2.8, open: true, out: [e.side === 'left' ? -1 : 1, 0] });
  }
  for (const e of fx.exits) if (!used.has(`${e.x},${e.z}`)) gates.push(e.side === 'back' ? { id: 'path', x: e.x, z: PLAY.z0, along: 'x', w: 2.8, open: false, out: [0, -1] } : { id: 'path', x: e.x, z: e.z, along: 'z', w: 2.8, open: false, out: [e.side === 'left' ? -1 : 1, 0] });
  // cover: the map's 'o' (the place's kinds in turn) and '0' (its biggest)
  const kinds = look?.covers ?? coversOf(style), big = kinds.slice().sort((a, b) => sizeOf(b)[0] * sizeOf(b)[1] - sizeOf(a)[0] * sizeOf(a)[1])[0];
  const covers: Cover[] = fx.covers.map((c, i) => {
    const k = c.kind ?? (c.big ? big : kinds[i % kinds.length]);
    const rot = k === 'streetCamel' || k === 'mintPress' || r(i + 1) < 0.5 ? 0 : 1, [a, b] = sizeOf(k);
    return { kind: k, x: c.x, z: c.z, hx: rot ? b : a, hz: rot ? a : b, rot };
  });
  const props: ArenaPlan['props'] = [], R0: Record<PropKind, number> = { pot: 0.32, crate: 0.4, hay: 0.55, oil: 0.38, pillar: 0.3, fence: 0.85, rack: 0.5, banner: 0.25, basket: 0.34, sack: 0.34, lamp: 0.25 };
  // strict avoidance zones: doors/hollow walls/barricades (both sides), sunk paths, bridges, puzzle marks, gate funnels, spawn runway
  const clear: Rect[] = [
    ...fx.closed.map(q => ({ x0: q.x0 - 1.85, x1: q.x1 + 1.85, z0: q.z0 - 1.85, z1: q.z1 + 1.85 })),
    ...fx.sunk.map(q => ({ x0: q.x0 - 0.8, x1: q.x1 + 0.8, z0: q.z0 - 0.8, z1: q.z1 + 0.8 })),
    ...shape.bridges.map(b => ({ x0: b.x0 - 0.8, x1: b.x1 + 0.8, z0: b.z0 - 2.0, z1: b.z1 + 2.0 })),
    ...(shape.stones ?? []).map(s => ({ x0: s.x0 - 0.9, x1: s.x1 + 0.9, z0: s.z0 - 0.9, z1: s.z1 + 0.9 })),
    ...(shape.ramps ?? []).map(rp => ({ x0: rp.x0 - 1.2, x1: rp.x1 + 1.2, z0: rp.z0 - 1.2, z1: rp.z1 + 1.2 })),
    ...fx.marks.map(m => ({ x0: m.x - 1.65, x1: m.x + 1.65, z0: m.z - 1.65, z1: m.z + 1.65 })),
    ...gates.map(g => g.along === 'x'
      ? { x0: g.x - 2.6, x1: g.x + 2.6, z0: g.z, z1: g.z + 4.4 }
      : { x0: g.out[0] < 0 ? g.x : g.x - 4.4, x1: g.out[0] < 0 ? g.x + 4.4 : g.x, z0: g.z - 2.6, z1: g.z + 2.6 }),
    { x0: shape.enter[0] - 2.4, x1: shape.enter[0] + 2.4, z0: shape.enter[1] - 4.2, z1: shape.enter[1] + 3.0 },
  ];
  if (fx.boss) clear.push({ x0: fx.boss[0] - 2.8, x1: fx.boss[0] + 2.8, z0: fx.boss[1] - 2.8, z1: fx.boss[1] + 2.8 });
  if (fx.stations) {
    const [x, z] = fx.stations;
    clear.push({ x0: x - 5.6, x1: x + 6.0, z0: z - 3.8, z1: z + 1.4 });
  }
  const free = (x: number, z: number, rr: number) => grid.clear(x, z, rr + 0.35) && !clear.some(c => x > c.x0 - rr && x < c.x1 + rr && z > c.z0 - rr && z < c.z1 + rr)
    && covers.every(c => Math.abs(c.x - x) > c.hx + rr + 0.4 || Math.abs(c.z - z) > c.hz + rr + 0.4) && props.every(p => Math.hypot(p.x - x, p.z - z) > R0[p.kind] + rr + 0.25);
  const put = (k: PropKind, x: number, z: number, rot?: 0 | 1, force = false) => { if (!force && !free(x, z, R0[k])) return false; props.push({ kind: k, x: +x.toFixed(2), z: +z.toFixed(2), ...(rot != null ? { rot } : {}) }); return true; };
  const smalls: PropKind[] = look?.smalls ?? ARENA_STYLES[style]?.smalls ?? (style === 'wattle' ? ['hay', 'pot', 'sack', 'hay', 'basket'] : style === 'brick' ? ['pot', 'pot', 'crate', 'basket'] : ['hay', 'crate', 'pot', 'sack', 'basket']);
  let salt = 100;
  // 1) authored map marks first, strictly on their cells
  for (const p of fx.props) if (p.kind !== 'small') put(p.kind, p.x, p.z, undefined, true);
  if (fx.id === 'fallen_hall') for (const p of props) if (p.kind === 'pillar') p.model = 'palaceColumn';
  for (const p of fx.props) if (p.kind === 'small') {
    const k = smalls[Math.floor(r(salt++) * smalls.length)]; put(k, p.x, p.z, undefined, true);
    for (let i = 0, t = 0; i < 2 && t < 10; t++) { const a = r(salt++) * Math.PI * 2, d = 0.58 + r(salt++) * 0.45; if (put(smalls[Math.floor(r(salt++) * smalls.length)], p.x + Math.cos(a) * d, p.z + Math.sin(a) * d)) i++; }
  }
  // 2) ordered wall-snapped dressing along wide courtyard walls (never blocking lanes, doors, or puzzles)
  const anchors = wallAnchors(grid, shape.box).map(a => ({ a, o: r(salt++) })).sort((p, q) => p.o - q.o).map(q => q.a);
  const usedStations: Array<[number, number]> = [];
  const takeAnchor = (minGap: number) => {
    for (const a of anchors) {
      if (clear.some(c => a.x > c.x0 - 0.6 && a.x < c.x1 + 0.6 && a.z > c.z0 - 0.6 && a.z < c.z1 + 0.6)) continue;
      if (usedStations.some(([ux, uz]) => Math.hypot(ux - a.x, uz - a.z) < minGap)) continue;
      usedStations.push([a.x, a.z]);
      return a;
    }
    return null;
  };
  const putWall = (a: WallAnchor, k: PropKind, tang = 0, rot?: 0 | 1) => {
    const tx = a.along === 'x' ? 1 : 0, tz = a.along === 'z' ? 1 : 0;
    const off = Math.max(0, R0[k] - 0.24);
    return put(k, a.x + a.nx * off + tx * tang, a.z + a.nz * off + tz * tang, rot);
  };
  const nRacks = look?.racks ?? 2;
  for (let i = 0; i < nRacks; i++) { const a = takeAnchor(4.6); if (a) putWall(a, 'rack', 0, a.along === 'z' ? 1 : 0); }
  const wantBanners = look?.banners != null || (ARENA_STYLES[style]?.banners ?? true);
  const nBan = wantBanners ? (look?.banners ?? 3) : 0;
  for (let i = 0; i < nBan; i++) { const a = takeAnchor(4.8); if (a) putWall(a, 'banner', 0); }
  const nLamp = (look?.lamps ?? 2) + (wantBanners ? 0 : 2);
  for (let i = 0; i < nLamp; i++) { const a = takeAnchor(5.2); if (a) putWall(a, 'lamp', 0); }
  // grouped wall-hugging prop clusters (kept purposeful & restrained so functional architecture dominates)
  const nClusters = kind === 'calm' ? 1 : style === 'earth' || style === 'wattle' ? 3 : 2;
  for (let i = 0; i < nClusters; i++) {
    const a = takeAnchor(3.8); if (!a) break;
    const lead = style === 'earth' || style === 'wattle' ? (i % 2 === 0 ? 'hay' : 'crate') : smalls[i % smalls.length];
    const side = smalls[(i + 2) % smalls.length];
    if (putWall(a, lead, 0)) {
      putWall(a, lead === 'hay' ? 'hay' : side, 1.18);
      putWall(a, side, -1.06);
    }
  }
  return { style, gates, covers, props, wall: { ...WALL, gap: 0 }, shape };
}

// ================================================================== voxels: walls, gates, cover
type B = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) => void;
const PAL = {
  earth: { body: 0xa88a60, seam: 0x947954, top: 0xbc9e72, foot: 0x7e6848, cap: 0xb6a78c, capD: 0x8e7f67, capL: 0xcabca2, base: 0x90826e, baseD: 0x746856, baseL: 0xa69882 },
  wattle: { post: 0x4a3622, postL: 0x6e5238, rail: 0x5e4630, weave: 0x8c703e, weaveD: 0x6a5430, weaveL: 0xa8884c },
  brick: { body: 0x7f7c75, joint: 0x5c5a55, top: 0xa4a19a, foot: 0x5c5a55, cap: 0x6c6a64, capL: 0x8a8780 },
  wood: 0x6e5238, woodD: 0x4a3622, woodL: 0x8e6e4c, red: 0x8e3b2c, redD: 0x6a2b21, redL: 0xa44c36,
  stone: 0x8a8780, stoneD: 0x6c6a64, stoneL: 0xa4a19a, tile: 0x56585e, tileD: 0x3a3c42, tileL: 0x72747a,
  water: 0x2a3440, bronze: 0x5a6a50, bronzeD: 0x3e4a38, bronzeL: 0x7a8a68, straw: 0xccb06a, strawD: 0xa08850,
  // wp/regB: the ship's rail (tarred wood, iron caps), the camp stockade, the 崔府 garden wall
  rail: { post: 0x3a2a20, rail: 0x4a3626, railL: 0x6a4e36, board: 0x4e3a2a, boardD: 0x3a2a1e, cap: 0x4a4f5a },
  stockade: { log: 0x6a5038, logD: 0x54402c, logL: 0x84684a, rope: 0x9a8058 },
  plaster: { body: 0xdcd8cc, bodyD: 0xbcb8ac, foot: 0x4a4848, footD: 0x3a3838, cap: 0x34363c, capD: 0x26282c, capL: 0x4a4c54 },
  iron: 0x4a4f5a, ironD: 0x30343c, ironL: 0x6e7480, tar: 0x2a2220, rock: 0x6e7078, rockD: 0x50525a, rockL: 0x8e9098, jade: 0x7a9a88,
};

/** walls (with their gaps), gate frames, closed doors and cover into the scene's voxels */
export function buildArena(c: Ctx, plan: ArenaPlan, seed: number) {
  // 11-18 屋子形态: a shaped room's walls follow its floor (shapeBuild.ts), with its pits and bridges
  if (plan.shape) { buildShape(c, plan.shape, plan, seed); return; }
  const box: B = (x0, y0, z0, x1, y1, z1, col) => { c.w.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), col); };
  const r = (k: number) => hash(seed * 3 + 5, k, 919);
  const H = M(wallHOf(plan.style)) - 1, Hfront = M(SOUTH_WALL_H) - 1, T = M(plan.wall.thick), G = M(plan.wall.gap);
  // act-189: enclose ALL four sides with real walls — left, right, back at full height, and south (camera side) at chest height + closed entry gate (unless openFront for title screens)
  const xl0 = M(PLAY.x0) - G - T, xl1 = M(PLAY.x0) - G - 1, xr0 = M(PLAY.x1) + G, xr1 = M(PLAY.x1) + G + T - 1;
  const zb0 = M(PLAY.z0) - G - T, zb1 = M(PLAY.z0) - G - 1;
  const zf0 = M(PLAY.z1) + G, zf1 = zf0 + T - 1;
  const zSideEnd = plan.openFront ? M(PLAY.z1) + 2 : zf1;
  const holes = (along: 'x' | 'z', side: number) => plan.gates.filter(g => g.along === along && (along === 'x' || Math.sign(g.out[0]) === side)).map(g => along === 'x' ? [M(g.x - g.w / 2), M(g.x + g.w / 2)] : [M(g.z - g.w / 2), M(g.z + g.w / 2)]);
  const run = (along: 'x' | 'z', a0: number, a1: number, b0: number, b1: number, gaps: number[][], salt: number, hWall = H) => {
    // split the run at the gaps; each piece is built by the style, with a broken-down stretch now and then (lower, axis-aligned)
    const cuts = [a0, ...gaps.flat().sort((p, q) => p - q), a1]; let k = salt;
    for (let i = 0; i < cuts.length; i += 2) {
      const s0 = cuts[i] + (i ? 1 : 0), s1 = cuts[i + 1] - (i + 1 < cuts.length - 1 ? 1 : 0); if (s1 - s0 < 2) continue;
      wallPiece(box, plan.style, along, s0, s1, b0, b1, hWall, r, k++);
    }
  };
  run('z', zb0, zSideEnd, xl0, xl1, holes('z', -1), 10); run('z', zb0, zSideEnd, xr0, xr1, holes('z', 1), 40); run('x', xl0, xr1, zb0, zb1, holes('x', 0), 70);
  if (!plan.openFront) {
    const gw = 2.6, gx = 0;
    const g0 = M(gx - gw / 2), g1 = M(gx + gw / 2);
    run('x', xl0, xr1, zf0, zf1, [[g0, g1]], 100, Hfront);
    southGateFrame(box, plan.style, gx, zf0, zf1, gw);
  }
  for (const g of plan.gates) gateFrame(box, plan.style, g, T, G);
  void r;   // act-20: the cover pieces are breakable now — built by act/breakables.ts from coverVox()
}

/** act-189: closed chest-high south entry gate (twin open-top stone-plinth gate piers + shut double doors with cross lock-bar).
 *  Open-top design keeps the hero & camera sightline 100% clear while physically sealing the entry road behind the player. */
export function southGateFrame(box: B, st: WallStyle, cx: number, z0: number, z1: number, w = 2.6) {
  const half = Math.round(M(w) / 2), cA = M(cx);
  const ext = ARENA_STYLES[st]?.post;
  const post = ext?.[0] ?? (st === 'brick' ? PAL.red : st === 'plaster' ? 0x2a2a30 : PAL.wood);
  const postD = ext?.[1] ?? (st === 'brick' ? PAL.redD : st === 'plaster' ? 0x1a1a20 : PAL.woodD);
  const postL = ext?.[2] ?? (st === 'brick' ? PAL.redL : st === 'plaster' ? 0x3e3e46 : PAL.woodL);
  const warmGate = st === 'earth' || st === 'wattle';
  const stC = warmGate ? PAL.earth.base : PAL.stone, stD = warmGate ? PAL.earth.baseD : PAL.stoneD, stL = warmGate ? PAL.earth.baseL : PAL.stoneL;
  const m0 = Math.floor((z0 + z1) / 2) - 2, m1 = m0 + 4;
  const pierH = st === 'wattle' || st === 'rail' || st === 'sandbag' ? 20 : 23;
  const doorH = 15;
  // Stone/timber threshold across the entry doorway
  box(cA - half - 2, -1, z0 - 1, cA + half + 2, -1, z1 + 1, stC);
  box(cA - half - 2, -1, z0 - 1, cA + half + 2, -1, z0 - 1, stL);
  // Twin open-top flanking gate piers (双阙门柱)
  for (const s of [-1, 1]) {
    const a = cA + s * (half + 2), a0 = a - 2, a1 = a + 2;
    box(a0 - 1, 0, m0 - 1, a1 + 1, 2, m1 + 1, stD);
    box(a0 - 1, 3, m0 - 1, a1 + 1, 4, m1 + 1, stC);
    box(a0, 4, m0, a1, 4, m1, stL);
    box(a0, 5, m0, a1, pierH, m1, post);
    box(a0, 5, m0, a0, pierH, m0, postD);
    box(a1, 5, m1, a1, pierH, m1, postL);
    box(a0, 6, m0, a1, 7, m1, PAL.ironD);
    // Stepped stone/tile pier cap (no overhead roof beam blocking camera)
    const capC = st === 'plaster' || st === 'palace' ? PAL.tile : warmGate ? PAL.earth.cap : stC;
    const capL = st === 'plaster' || st === 'palace' ? PAL.tileL : warmGate ? PAL.earth.capL : stL;
    box(a0 - 1, pierH + 1, m0 - 1, a1 + 1, pierH + 2, m1 + 1, capC);
    box(a0, pierH + 3, m0, a1, pierH + 3, m1, capL);
  }
  // Closed double doors / heavy timber gate (紧闭双扉门) with horizontal bands & inner cross lock-bar (门闩)
  const dm0 = Math.floor((z0 + z1) / 2) - 1, dm1 = dm0 + 2;
  const doorC = st === 'brick' || st === 'palace' ? PAL.redD : st === 'rail' ? PAL.rail.board : st === 'plaster' ? 0x343236 : PAL.wood;
  const doorD = st === 'brick' || st === 'palace' ? 0x3c1814 : st === 'rail' ? PAL.rail.boardD : st === 'plaster' ? 0x222024 : PAL.woodD;
  const doorL = st === 'brick' || st === 'palace' ? PAL.red : st === 'rail' ? PAL.rail.railL : st === 'plaster' ? 0x4c4850 : PAL.woodL;
  // Low stone/wood sill
  box(cA - half, 0, dm0, cA + half, 1, dm1, stD);
  // Left & right closed door leaves
  box(cA - half, 2, dm0, cA - 1, doorH, dm1, doorC);
  box(cA + 1, 2, dm0, cA + half, doorH, dm1, doorC);
  box(cA, 2, dm0, cA, doorH, dm1, doorD); // center door seam
  // Vertical plank grooves
  for (let x = cA - half + 4; x < cA + half - 2; x += 5) if (Math.abs(x - cA) > 1) box(x, 2, dm0, x, doorH, dm0, doorD);
  // Top timber rail & iron strap bands
  box(cA - half, doorH, dm0, cA + half, doorH, dm1, doorL);
  for (const y of [4, 11]) box(cA - half, y, dm0 - 1, cA + half, y + 1, dm1 + 1, PAL.ironD);
  // Heavy wooden lock-bar across the inner (north) face + twin bronze ring studs
  box(cA - half + 2, 7, dm0 - 1, cA + half - 2, 9, dm0 - 1, PAL.woodL);
  box(cA - 4, 8, dm0 - 1, cA - 3, 9, dm0 - 1, PAL.bronzeL);
  box(cA + 3, 8, dm0 - 1, cA + 4, 9, dm0 - 1, PAL.bronzeL);
}

/** one straight stretch of wall between a0..a1 (cells along the run), b0..b1 across it (shapeBuild.ts builds a shape's walls with it) */
export function wallPiece(box: B, st: WallStyle, along: 'x' | 'z', a0: number, a1: number, b0: number, b1: number, H: number, r: (k: number) => number, salt: number) {
  const bx = (p0: number, y0: number, q0: number, p1: number, y1: number, q1: number, col: number) => along === 'x' ? box(p0, y0, q0, p1, y1, q1, col) : box(q0, y0, p0, q1, y1, p1, col);
  // a broken stretch: one in three runs drops 4–6 cells over 1–2 m somewhere in its middle
  const len = a1 - a0, brk = len > 40 && r(salt) < 0.45 ? { s: a0 + 8 + Math.floor(r(salt + 1) * (len - 40)), n: 14 + Math.floor(r(salt + 2) * 14), d: 4 + Math.floor(r(salt + 3) * 3) } : null;
  const top = (a: number) => brk && a >= brk.s && a < brk.s + brk.n ? H - brk.d : H;
  const segs: Array<[number, number, number]> = []; let s = a0;
  for (let a = a0 + 1; a <= a1 + 1; a++) if (a > a1 || top(a) !== top(s)) { segs.push([s, a - 1, top(s)]); s = a; }
  const ext = ARENA_STYLES[st]; if (ext) { ext.wall(bx, segs, b0, b1, H); return; }   // 11-18: a later region's own walls
  if (st === 'earth') {
    const P = PAL.earth;
    const c0 = b1 - b0 >= 4 ? b0 + 1 : b0, c1 = b1 - b0 >= 4 ? b1 - 1 : b1;
    for (const [p0, p1, h] of segs) {
      // warm weathered sandstone footing (harmonizes with yellow loess, zero cold blue-grey clash)
      bx(p0, 0, b0, p1, 2, b1, P.base);
      bx(p0, 0, b0, p1, 0, b1, P.baseD);
      bx(p0, 2, b0, p1, 2, b1, P.baseL);
      for (let a = p0 + 10; a < p1 - 4; a += 14) bx(a, 0, b0, a, 2, b1, P.baseD);
      // recessed rammed-earth curtain with tamped horizontal courses
      bx(p0, 3, c0, p1, h, c1, P.body);
      bx(p0, 3, c0, p1, 4, c1, P.foot);
      for (let y = 8; y < h - 1; y += 5) bx(p0, y, c0, p1, y, c1, P.seam);
      // rhythmic full-width rammed-earth pilasters (墙垛) capped with warm buff stone blocks (matching 02-environments.png & 04-combat-ui.png)
      if (p1 - p0 >= 28) {
        for (let a = p0 + 4; a + 4 <= p1 - 4; a += 44) {
          bx(a, 0, b0, a + 4, 3, b1, P.baseD);
          bx(a, 3, b0, a + 4, 3, b1, P.baseL);
          bx(a, 4, b0, a + 4, h, b1, P.body);
          for (let y = 8; y < h - 1; y += 5) bx(a, y, b0, a + 4, y, b1, P.seam);
          if (h === H) {
            bx(a - 1, h + 1, b0 - 1, a + 5, h + 2, b1 + 1, P.cap);
            bx(a - 1, h + 3, b0 - 1, a + 5, h + 3, b1 + 1, P.capL);
          } else bx(a, h, b0, a + 4, h, b1, P.top);
        }
      }
      if (h === H) {
        // warm buff sandstone coping blocks (墙顶压石) with recessed mortar joints every 12 cells — faithful to 04-combat-ui.png
        bx(p0, h + 1, b0 - 1, p1, h + 1, b1 + 1, P.capD);
        bx(p0, h + 2, b0 - 1, p1, h + 2, b1 + 1, P.cap);
        bx(p0, h + 3, b0, p1, h + 3, b1, P.capL);
        for (let a = p0 + 6; a < p1 - 2; a += 12) {
          bx(a, h + 1, b0 - 1, a, h + 3, b1 + 1, P.capD);
        }
      } else {
        // broken wall top: stepped exposed earth & loose warm stone cap
        bx(p0, h, c0, p1, h, c1, P.top);
        bx(p0 + 2, h - 1, c0, p1 - 2, h - 1, c1, P.seam);
      }
    }
  } else if (st === 'brick') {
    const P = PAL.brick;
    const c0 = b1 - b0 >= 4 ? b0 + 1 : b0, c1 = b1 - b0 >= 4 ? b1 - 1 : b1;
    for (const [p0, p1, h] of segs) {
      bx(p0, 0, b0, p1, 2, b1, P.foot);
      bx(p0, 2, b0, p1, 2, b1, PAL.stone);
      bx(p0, 3, c0, p1, h, c1, P.body);
      for (let y = 6; y < h; y += 4) bx(p0, y, c0, p1, y, c1, P.joint);
      for (let y = 3; y < h; y += 4) for (let a = p0 + ((y / 4) % 2 ? 4 : 0); a <= p1; a += 8) {
        bx(a, y + 1, c0, a, Math.min(h, y + 3), c0, P.joint);
        bx(a, y + 1, c1, a, Math.min(h, y + 3), c1, P.joint);
      }
      if (p1 - p0 >= 28) {
        for (let a = p0 + 4; a + 4 <= p1 - 4; a += 44) {
          bx(a, 0, b0, a + 4, h, b1, P.body);
          bx(a, 0, b0, a + 4, 2, b1, P.foot);
          if (h === H) { bx(a - 1, h + 1, b0 - 1, a + 5, h + 2, b1 + 1, P.cap); bx(a, h + 3, b0, a + 4, h + 4, b1, P.capL); }
        }
      }
      if (h === H) {
        bx(p0, h + 1, b0 - 1, p1, h + 2, b1 + 1, P.cap);
        bx(p0, h + 3, c0, p1, h + 3, c1, P.capL);
        for (let a = p0 + 1; a <= p1; a += 4) bx(a, h + 1, b1 + 1, a, h + 1, b1 + 1, P.capL);
      } else bx(p0, h, c0, p1, h, c1, P.top);
    }
  } else if (st === 'wattle') {
    // 编篱: posts every 9 cells, two rails, a woven panel between (horizontal bands, two tones)
    const P = PAL.wattle, mid0 = b0 + Math.floor((b1 - b0) / 2) - 1, mid1 = mid0 + 2;
    for (const [p0, p1, h] of segs) {
      const hh = h - 2;
      bx(p0, 1, mid0, p1, hh - 2, mid1 - 1, P.weave);
      for (let y = 2; y < hh - 2; y += 3) bx(p0, y, mid0, p1, y, mid1 - 1, P.weaveD);
      bx(p0, 3, mid0 - 1, p1, 4, mid1, P.rail); bx(p0, hh - 4, mid0 - 1, p1, hh - 3, mid1, P.rail);
      for (let a = p0; a <= p1; a += 9) { const a1 = Math.min(p1, a + 2); bx(a, 0, mid0 - 1, a1, hh, mid1, P.post); bx(a, hh, mid0 - 1, a1, hh, mid1, P.postL); }
      bx(p1 - 2, 0, mid0 - 1, p1, hh, mid1, P.post);
    }
  } else if (st === 'rail') {
    // wp/regB 横江浮栈 / 督造高阁: a ship's rail along the deck edge — square posts every 10 cells, a heavy top rail, a mid rail, a
    // low plank kick-board; the rail's own dark wood (tarred), iron caps on the posts
    const P = PAL.rail, m0 = b0 + Math.floor((b1 - b0) / 2) - 1, m1 = m0 + 2;
    for (const [p0, p1, h] of segs) {
      const hh = h - 2;
      bx(p0, 0, m0 - 1, p1, 4, m1, P.board); bx(p0, 4, m0 - 1, p1, 4, m1, P.boardD);
      bx(p0, hh - 3, m0 - 2, p1, hh - 1, m1 + 1, P.rail); bx(p0, hh - 1, m0 - 2, p1, hh - 1, m1 + 1, P.railL);
      bx(p0, 9, m0, p1, 10, m1 - 1, P.rail);
      for (let a = p0; a <= p1; a += 10) { const a1 = Math.min(p1, a + 2); bx(a, 0, m0 - 1, a1, hh + 1, m1, P.post); bx(a, hh + 2, m0 - 1, a1, hh + 2, m1, P.cap); }
      bx(p1 - 2, 0, m0 - 1, p1, hh + 1, m1, P.post);
    }
  } else if (st === 'stockade') {
    // wp/regB 乌林辕门: a camp stockade — close-set pointed logs (the points a stepped tier, never a slope), two lashing bands of rope
    const P = PAL.stockade;
    for (const [p0, p1, h] of segs) {
      for (let a = p0; a <= p1; a += 3) { const a1 = Math.min(p1, a + 1), t = h + ((a / 3) % 2 ? 2 : 0); bx(a, 0, b0 + 1, a1, t, b1 - 1, ((a / 3) % 3) ? P.log : P.logD); bx(a, t + 1, b0 + 2, a1, t + 2, b1 - 2, P.logL); }
      for (const y of [5, h - 4]) bx(p0, y, b0, p1, y, b1, P.rope);
    }
  } else {
    // wp/regB 崔府: a whitewashed garden wall on a dark brick footing, a black tiled coping in two tiers (a stepped eave both sides)
    const P = PAL.plaster;
    for (const [p0, p1, h] of segs) {
      bx(p0, 0, b0, p1, 3, b1, P.foot); for (let a = p0 + 3; a <= p1; a += 6) bx(a, 1, b0, a, 2, b1, P.footD);
      bx(p0, 4, b0, p1, h, b1, P.body); bx(p0, 4, b0, p1, 4, b1, P.bodyD);
      if (h === H) { bx(p0, h + 1, b0 - 2, p1, h + 1, b1 + 2, P.capD); bx(p0, h + 2, b0 - 1, p1, h + 3, b1 + 1, P.cap); bx(p0, h + 4, b0 + 1, p1, h + 4, b1 - 1, P.capL); for (let a = p0 + 1; a <= p1; a += 3) bx(a, h + 1, b0 - 2, a, h + 1, b0 - 2, P.capL); }
      else bx(p0, h, b0, p1, h, b1, P.bodyD);
    }
  }
}

/** the gate: stone plinths, square posts, a lintel and a small two-tier eave; a closed one gets two board doors */
export function gateFrame(box: B, st: WallStyle, g: Gate, T: number, Gp: number) {
  const along = g.along, half = Math.round(M(g.w) / 2), cA = along === 'x' ? M(g.x) : M(g.z);
  // across the wall: the wall's own band
  const b0 = along === 'x' ? M(PLAY.z0) - Gp - T : (g.out[0] < 0 ? M(PLAY.x0) - Gp - T : M(PLAY.x1) + Gp), b1 = b0 + T - 1;
  const bx = (p0: number, y0: number, q0: number, p1: number, y1: number, q1: number, col: number) => along === 'x' ? box(p0, y0, q0, p1, y1, q1, col) : box(q0, y0, p0, q1, y1, p1, col);
  const ext = ARENA_STYLES[st]?.post, post = ext?.[0] ?? (st === 'brick' ? PAL.red : st === 'plaster' ? 0x2a2a30 : PAL.wood), postD = ext?.[1] ?? (st === 'brick' ? PAL.redD : st === 'plaster' ? 0x1a1a20 : PAL.woodD), postL = ext?.[2] ?? (st === 'brick' ? PAL.redL : st === 'plaster' ? 0x3e3e46 : PAL.woodL);
  const PH = Math.max(35, M(wallHOf(st)) + 7), m0 = Math.floor((b0 + b1) / 2) - 2, m1 = m0 + 4;   // thick Han timber gatehouse
  const warmGate = st === 'earth' || st === 'wattle';
  const stC = warmGate ? PAL.earth.base : PAL.stone, stD = warmGate ? PAL.earth.baseD : PAL.stoneD, stL = warmGate ? PAL.earth.baseL : PAL.stoneL;
  // flush stone threshold across the gate floor
  bx(cA - half - 2, -1, b0 - 1, cA + half + 2, -1, b1 + 1, stC);
  bx(cA - half - 2, -1, b1 + 1, cA + half + 2, -1, b1 + 1, stL);
  for (const s of [-1, 1]) {
    const a = cA + s * (half + 2), a0 = Math.min(a - 2, a + 2), a1 = Math.max(a - 2, a + 2);
    // stepped stone pier base (抱鼓石础) + sturdy timber column
    bx(a0 - 1, 0, m0 - 1, a1 + 1, 2, m1 + 1, stD);
    bx(a0 - 1, 3, m0 - 1, a1 + 1, 4, m1 + 1, stC);
    bx(a0, 4, m0, a1, 4, m1, stL);
    const postTop = warmGate ? PH + 6 : PH;
    bx(a0, 5, m0, a1, postTop, m1, post);
    bx(a0, 5, m0, a0, postTop, m0, postD);
    bx(a1, 5, m1, a1, postTop, m1, postL);
    bx(a0, 6, m0, a1, 7, m1, PAL.ironD);
    if (warmGate) {
      // stepped timber post cap projecting cleanly above the twin crossbeams (matching 02-environments.png & 04-combat-ui.png!)
      bx(a0 - 1, postTop + 1, m0 - 1, a1 + 1, postTop + 2, m1 + 1, postD);
      bx(a0, postTop + 2, m0, a1, postTop + 2, m1, postL);
    }
    // heavy wooden bracket (雀替) supporting the lintel
    const bi0 = s < 0 ? a1 + 1 : a0 - 3, bi1 = s < 0 ? a1 + 3 : a0 - 1;
    bx(bi0, PH - 4, m0 + 1, bi1, PH - 2, m1 - 1, postD);
  }
  const L0 = cA - half - 7, L1 = cA + half + 7;
  // double heavy Han lintel beams + projecting beam ends
  bx(L0, PH + 1, m0 - 1, L1, PH + 3, m1 + 1, postD);
  bx(L0 + 1, PH + 2, m0 - 1, L1 - 1, PH + 2, m1 + 1, post);
  bx(L0 + 2, PH - 2, m0, L1 - 2, PH - 1, m1, post);
  if (!warmGate) {
    // 3-tier overhanging tile roof for brick/plaster gates (village earth/wattle gates stay authentic twin-beam timber archways!)
    bx(L0 - 3, PH + 4, m0 - 4, L1 + 3, PH + 5, m1 + 4, PAL.tileD);
    bx(L0 - 1, PH + 6, m0 - 2, L1 + 1, PH + 7, m1 + 2, PAL.tile);
    bx(L0 + 2, PH + 8, m0, L1 - 2, PH + 9, m1, PAL.tileL);
    for (let a = L0 - 2; a <= L1 + 2; a += 4) {
      bx(a, PH + 4, m1 + 4, a, PH + 4, m1 + 4, PAL.tileL);
      bx(a, PH + 6, m0 - 2, a, PH + 6, m1 + 2, PAL.tileD);
    }
  } else {
    // twin vertical strut blocks tying lower & upper beams (authentic Han timber gateway from 04-combat-ui.png)
    for (const s of [-1, 1]) bx(cA + s * 6 - 1, PH - 1, m0, cA + s * 6 + 1, PH + 1, m1, postD);
  }
  // torn Yellow Turban banner draped from the high crossbeam (matching 04-combat-ui.png gatehouse, high above walking headroom)
  if (warmGate && g.open) {
    const qf = m1;
    bx(cA - 4, PH - 11, qf, cA + 4, PH - 3, qf, 0xd4ac30);
    bx(cA - 4, PH - 4, qf, cA + 4, PH - 3, qf, 0xa4821e);
    bx(cA - 4, PH - 14, qf, cA - 1, PH - 12, qf, 0xd4ac30);
    bx(cA + 2, PH - 13, qf, cA + 4, PH - 12, qf, 0xa4821e);
    bx(cA, PH - 10, qf, cA, PH - 5, qf, 0xa4821e);
  }
  if (!g.open) {   // heavy double plank doors with iron cross-straps and bronze knockers
    const d0 = cA - half, d1 = cA + half;
    bx(d0, 0, m0 + 1, d1, PH - 3, m1 - 1, PAL.woodD);
    for (let a = d0 + 2; a < d1; a += 4) bx(a, 1, m0 + 1, a + 2, PH - 4, m1 - 1, PAL.wood);
    for (const y of [7, 17, 26]) bx(d0, y, m0, d1, y + 1, m1, PAL.ironD);
    bx(cA, 1, m0, cA, PH - 4, m1, PAL.woodD);
    for (const s of [-1, 1]) bx(cA + s * 4, 13, m1, cA + s * 4 + s, 15, m1, PAL.bronzeL);
  }
}

/** one piece of cover, centred on its cell, its long side along x (rot 0) or z (rot 1) */
/** a cover piece's voxels at the origin (act-20: they break now, so they are their own meshes); rubble = the heap it falls to */
export function coverVox(w: { box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | null): unknown }, kind: CoverKind, rot: 0 | 1, rubble = false) {
  const box: B = (x0, y0, z0, x1, y1, z1, col) => { w.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), col); };
  const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number) => rot ? box(z0, y0, x0, z1, y1, x1, col) : box(x0, y0, z0, x1, y1, z1, col);
  // 11-18: a later region's cover piece (its own file), and the heap in that region's rubble colours
  const ext = Object.values(ARENA_STYLES).find(s => s?.cover[kind]);
  if (ext) { if (!rubble) { ext.cover[kind]!(bx); return; } const [a, d, l] = ext.rubble; bx(-9, 0, -6, 2, 3, 6, a); bx(-9, 4, -6, 2, 4, 6, l); bx(3, 0, -5, 10, 2, 3, d); bx(-4, 4, -3, 0, 6, 2, d); bx(4, 3, -2, 8, 3, 1, l); return; }
  if (!rubble) { cover(box, { kind, x: 0, z: 0, hx: 0, hz: 0, rot }, () => 0); return; }
  // the heap: low broken blocks in the piece's own materials, flat-topped, axis-aligned
  const stoneish = kind === 'well' || kind === 'mill' || kind === 'stones' || kind === 'stele' || kind === 'trough' || kind === 'rockery' || kind === 'basin' || kind === 'screen', iron = kind === 'chains' || kind === 'bollard';
  const a = stoneish ? PAL.stone : kind === 'ding' ? PAL.bronze : iron ? PAL.iron : PAL.wood, d = stoneish ? PAL.stoneD : kind === 'ding' ? PAL.bronzeD : iron ? PAL.ironD : PAL.woodD, l = stoneish ? PAL.stoneL : kind === 'ding' ? PAL.bronzeL : iron ? PAL.ironL : PAL.woodL;
  bx(-9, 0, -6, 2, 3, 6, a); bx(-9, 4, -6, 2, 4, 6, l); bx(3, 0, -5, 10, 2, 3, d); bx(-4, 4, -3, 0, 6, 2, d); bx(4, 3, -2, 8, 3, 1, l);
  if (kind === 'cart' || kind === 'well') { bx(-12, 0, 5, -2, 1, 7, PAL.woodD); bx(6, 0, -8, 8, 1, 2, PAL.wood); }
}
function cover(box: B, cv: Cover, r: (k: number) => number) {
  const X = M(cv.x), Z = M(cv.z), rot = cv.rot;
  const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number) => rot ? box(X + z0, y0, Z + x0, X + z1, y1, Z + x1, col) : box(X + x0, y0, Z + z0, X + x1, y1, Z + z1, col);
  switch (cv.kind) {
    case 'well': {   // 井: warm weathered sandstone apron & curb, windlass frame with neutral charcoal-clay roof
      const ws = PAL.earth.base, wsD = PAL.earth.baseD, wsL = PAL.earth.baseL;
      bx(-11, 0, -11, 11, 1, 11, wsD);
      bx(-10, 2, -10, 10, 9, 10, ws); bx(-10, 9, -10, 10, 10, 10, wsL);
      for (const k of [-4, 4]) { bx(k, 2, 10, k, 9, 10, wsD); bx(k, 2, -10, k, 9, -10, wsD); bx(10, 2, k, 10, 9, k, wsD); bx(-10, 2, k, -10, 9, k, wsD); }
      bx(-7, 2, -7, 7, 10, 7, wsD); bx(-7, 2, -7, 7, 6, 7, PAL.water);
      for (const s of [-1, 1]) bx(s * 11 - 1, 0, -1, s * 11 + 1, 30, 1, PAL.woodD);
      bx(-12, 31, -1, 12, 32, 1, PAL.wood);
      bx(-14, 33, -6, 14, 34, 6, 0x363435); bx(-13, 35, -4, 13, 35, 4, 0x4b4849); bx(-11, 36, -2, 11, 36, 2, 0x625f60);
      bx(-4, 24, -3, 4, 28, 3, PAL.woodL); bx(-1, 14, -1, 1, 23, 1, PAL.woodD); bx(-3, 10, -3, 3, 14, 3, PAL.wood);
      break;
    }
    case 'mill': {   // 石碾: a round-cornered stone bed (notched), a stone roller on it held by a timber frame
      bx(-11, 0, -9, 11, 5, 9, PAL.stone); bx(-9, 0, -11, 9, 5, 11, PAL.stone); bx(-9, 6, -9, 9, 6, 9, PAL.stoneL);
      bx(-7, 7, -4, 7, 14, 4, PAL.stoneD); bx(-6, 15, -3, 6, 15, 3, PAL.stoneL); bx(-7, 7, -4, -7, 14, 4, PAL.stone); bx(7, 7, -4, 7, 14, 4, PAL.stone);
      bx(-9, 10, -1, 9, 11, 1, PAL.woodD); bx(-1, 7, -1, 1, 24, 1, PAL.woodD); bx(-1, 24, -1, 9, 25, 1, PAL.wood);
      break;
    }
    case 'cart': {   // 柴车: sturdy Han ox-cart with spoke-banded solid wheels, iron hubs, plank sideboards, bound golden straw bales & sack
      bx(-16, 9, -8, 16, 11, 8, PAL.wood); bx(-16, 12, -8, 16, 15, -7, PAL.woodD); bx(-16, 12, 7, 16, 15, 8, PAL.woodD); bx(-16, 12, -8, -15, 15, 8, PAL.woodD);
      for (let x = -14; x <= 14; x += 6) bx(x, 9, -8, x, 11, 8, PAL.woodD);
      for (const s of [-1, 1]) {
        const z = s * 9;
        bx(-7, 3, z, 7, 13, z + s, PAL.woodD); bx(-5, 1, z, 5, 15, z + s, PAL.woodD); bx(-3, 0, z, 3, 16, z + s, PAL.woodD);
        bx(-5, 4, z, 5, 12, z + s, PAL.wood); bx(-3, 2, z, 3, 14, z + s, PAL.wood);
        bx(-2, 6, z + s, 2, 10, z + s, PAL.iron); bx(-1, 7, z + s, 1, 9, z + s, PAL.ironL);
      }
      bx(16, 0, -6, 26, 2, -5, PAL.woodD); bx(16, 0, 5, 26, 2, 6, PAL.woodD); bx(16, 2, -6, 18, 9, 6, PAL.woodD);
      for (let i = 0; i < 3; i++) {
        const x = -13 + i * 8;
        bx(x, 12, -6, x + 6, 19 + (i % 2) * 2, 6, PAL.straw);
        bx(x, 19 + (i % 2) * 2, -6, x + 6, 19 + (i % 2) * 2, 6, 0xdcc484);
        bx(x, 15, -6, x + 6, 15, 6, PAL.woodD);
      }
      bx(10, 12, -5, 15, 18, 4, 0xc0b08c); bx(11, 18, -4, 14, 18, 3, 0x9e906e);
      break;
    }
    case 'stones': {   // architectural masonry rubble: dressed ashlar blocks + stacked dark broken roof tiles
      bx(-10, 0, -8, 10, 1, 8, PAL.stoneD);
      bx(-10, 2, -8, 3, 7, 7, PAL.stone); bx(-10, 7, -8, 3, 7, 7, PAL.stoneL);
      bx(4, 2, -6, 10, 5, 5, PAL.stoneD); bx(4, 5, -6, 10, 5, 5, PAL.stone);
      bx(-8, 8, -5, 1, 12, 3, PAL.stone); bx(-8, 12, -5, 1, 12, 3, PAL.stoneL);
      bx(3, 6, -4, 9, 8, 2, PAL.tileD); bx(4, 8, -3, 8, 9, 1, PAL.tile);
      bx(-9, 2, 5, -2, 3, 8, PAL.tileD);
      break;
    }
    case 'ding': {   // 香鼎: a square bronze cauldron on four legs, two upright handles, ash inside
      for (const [x, z] of [[-6, -6], [4, -6], [-6, 4], [4, 4]]) bx(x, 0, z, x + 1, 5, z + 1, PAL.bronzeD);
      bx(-8, 5, -8, 7, 16, 7, PAL.bronze); bx(-8, 16, -8, 7, 17, 7, PAL.bronzeL); bx(-6, 14, -6, 5, 17, 5, 0x5c5650);
      bx(-8, 9, -8, 7, 10, 7, PAL.bronzeD); bx(-5, 18, -8, -3, 22, -8, PAL.bronze); bx(2, 18, -8, 4, 22, -8, PAL.bronze); bx(-5, 18, 7, -3, 22, 7, PAL.bronze); bx(2, 18, 7, 4, 22, 7, PAL.bronze);
      break;
    }
    case 'stele': {  // 石碑: a slab on a stone base, a carved frame (two tones)
      bx(-11, 0, -6, 11, 5, 6, PAL.stoneD); bx(-11, 5, -6, 11, 5, 6, PAL.stone);
      bx(-8, 6, -2, 8, 36, 2, PAL.stone); bx(-8, 37, -2, 8, 38, 2, PAL.stoneL); bx(-6, 9, 3, 6, 33, 3, PAL.stoneD); bx(-5, 10, 3, 5, 32, 3, PAL.stone);
      break;
    }
    case 'trough': { // 水槽: a long stone trough with water, on two blocks
      bx(-14, 0, -6, -10, 4, 6, PAL.stoneD); bx(10, 0, -6, 14, 4, 6, PAL.stoneD); bx(-15, 4, -6, 15, 10, 6, PAL.stone); bx(-13, 6, -4, 13, 10, 4, PAL.water); bx(-15, 10, -6, 15, 10, -6, PAL.stoneL); bx(-15, 10, 6, 15, 10, 6, PAL.stoneL);
      break;
    }
    // ---- wp/regB: 乌林水寨 and 崔府
    case 'bollard': {  // 缆桩: a thick tarred mooring post on an iron-bound base, a hawser coiled round its foot
      bx(-7, 0, -7, 7, 3, 7, PAL.rail.post); bx(-7, 3, -7, 7, 3, 7, PAL.ironD);
      bx(-4, 4, -4, 4, 20, 4, PAL.tar); bx(-5, 18, -5, 5, 20, 5, PAL.iron); bx(-4, 21, -4, 4, 22, 4, PAL.ironL); bx(-5, 9, -5, 5, 10, 5, PAL.iron);
      for (const [y, k] of [[4, 0], [6, 1]] as const) { bx(-8, y, -8, 8, y + 1, -6, k ? PAL.strawD : PAL.straw); bx(-8, y, 6, 8, y + 1, 8, k ? PAL.strawD : PAL.straw); bx(-8, y, -6, -6, y + 1, 6, k ? PAL.straw : PAL.strawD); bx(6, y, -6, 8, y + 1, 6, k ? PAL.straw : PAL.strawD); }
      break;
    }
    case 'chains': {   // 铁索盘: a heap of the great chain — links laid flat in coils, two tones, a big iron ring on top
      for (let y = 0, i = 0; y < 9; y += 3, i++) { const h = 13 - i * 3, d = 10 - i * 2; bx(-h, y, -d, h, y + 2, d, i % 2 ? PAL.ironD : PAL.iron); bx(-h + 2, y + 2, -d + 2, h - 2, y + 2, d - 2, PAL.ironL); }
      bx(-4, 9, -1, -3, 15, 1, PAL.iron); bx(3, 9, -1, 4, 15, 1, PAL.iron); bx(-4, 9, -1, 4, 10, 1, PAL.iron); bx(-4, 15, -1, 4, 15, 1, PAL.ironL);
      bx(10, 0, -12, 16, 1, -9, PAL.iron); bx(14, 0, -9, 16, 1, -3, PAL.ironD);
      break;
    }
    case 'barrels': {  // 油桶: three tarred barrels on a pallet, iron hoops, one lying on top
      bx(-15, 0, -8, 15, 1, 8, PAL.wood);
      for (const x of [-9, 1]) { bx(x - 5, 2, -6, x + 5, 14, 6, PAL.rail.board); bx(x - 4, 2, -7, x + 4, 14, 7, PAL.rail.board); for (const y of [4, 11]) { bx(x - 5, y, -7, x + 5, y, 7, PAL.ironD); } bx(x - 4, 15, -6, x + 4, 15, 6, PAL.tar); }
      bx(9, 2, -5, 14, 9, 5, PAL.rail.board); bx(9, 4, -5, 14, 4, 5, PAL.ironD); bx(-6, 16, -4, 6, 21, 4, PAL.rail.boardD); bx(-6, 16, -4, -6, 21, 4, PAL.ironD); bx(6, 16, -4, 6, 21, 4, PAL.ironD);
      break;
    }
    case 'rockery': {  // 假山石: a pile of pale lake stones in big blocks, stepped and set back, one standing tall
      bx(-13, 0, -10, 6, 8, 9, PAL.rock); bx(-13, 8, -10, 6, 8, 9, PAL.rockL); bx(4, 0, -7, 13, 5, 6, PAL.rockD); bx(4, 5, -7, 13, 5, 6, PAL.rock);
      bx(-9, 9, -6, -1, 22, 3, PAL.rock); bx(-9, 22, -6, -1, 22, 3, PAL.rockL); bx(-7, 23, -4, -3, 28, 1, PAL.rockD); bx(-6, 14, 3, -4, 18, 3, PAL.rockD);
      bx(-15, 0, 9, -11, 1, 12, PAL.rockD);
      break;
    }
    case 'screen': {   // 影壁: a short spirit wall on a stone base, a whitewashed panel in a dark frame, a little tiled roof
      bx(-16, 0, -4, 16, 3, 4, PAL.stoneD); bx(-16, 3, -4, 16, 3, 4, PAL.stone);
      bx(-14, 4, -2, 14, 28, 2, PAL.plaster.body); bx(-14, 4, -2, -13, 28, 2, PAL.plaster.cap); bx(13, 4, -2, 14, 28, 2, PAL.plaster.cap); bx(-14, 4, -2, 14, 5, 2, PAL.plaster.cap);
      bx(-8, 12, 3, 8, 20, 3, PAL.plaster.bodyD); bx(-6, 14, 3, 6, 18, 3, PAL.jade);
      bx(-17, 29, -5, 17, 30, 5, PAL.plaster.capD); bx(-15, 31, -3, 15, 32, 3, PAL.plaster.cap); bx(-13, 33, -1, 13, 33, 1, PAL.plaster.capL);
      break;
    }
    case 'basin': {    // 石缸: a big square stone basin full of ice (the snowy night), on a plinth
      bx(-9, 0, -9, 9, 2, 9, PAL.stoneD); bx(-10, 3, -10, 10, 13, 10, PAL.stone); bx(-10, 13, -10, 10, 13, 10, PAL.stoneL); bx(-8, 8, -8, 8, 13, 8, 0xb8c8d8); bx(-6, 13, -6, 6, 13, 6, 0xd8e4ee);
      bx(-10, 7, -10, 10, 7, 10, PAL.stoneD);
      break;
    }
    case 'vaultChest': {
      // 藏刀阁里可劈坏的木箱，铁箍压住箱盖，和墙上的刀架用同一套木色。
      bx(-13, 0, -8, 13, 1, 8, PAL.woodD);
      bx(-12, 2, -7, 12, 12, 7, PAL.wood);
      bx(-13, 12, -8, 13, 12, 8, PAL.woodD);
      bx(-13, 13, -8, 13, 15, 8, PAL.woodL);
      for (const x of [-9, 8]) {
        bx(x, 3, -8, x + 1, 15, -8, PAL.ironD);
        bx(x, 15, -8, x + 1, 15, 8, PAL.ironD);
        bx(x, 3, 8, x + 1, 15, 8, PAL.ironD);
      }
      bx(-2, 9, 8, 2, 12, 8, PAL.bronze);
      break;
    }
  }
  void r;
}
