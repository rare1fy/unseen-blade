import { finishBuild } from '../engine/buildSteps';
// 拼装器：按 Spec（地点 × 构图 × 地标 × 季节 × 时段 × 天气 × 种子）拼出一张战斗场景，并给出摆放报告。
// 每个道具组都先在「沙盒」里建（临时体素层 + 记下的灯光、面片、植被），量出实际格子，过 check.ts 的检查，通过才并入场景；
// 不通过就记进 report.rejected，换下一个候选。所以组写错了尺寸、和别的东西撞了、悬空了、挡了战斗区，都不会进最终画面。
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import { AREA, PLAY, hash, SX, SZ, STAGE_BIG } from '../scenes/props';
import { plot, buildFlora } from '../scenes/flora';
import type { Ctx, SceneDef } from '../scenes/stage';
import type { Cards } from '../scenes/cards';
import { checkCells, commit, newOcc, floatingCells, type Occ } from './check';
import { moodFor, lampFor, weatherAmbient } from './sky';
import { snowPass } from './season';
import { withExits } from './exits';
import { buildArena } from './arena';
import type { Group, Issue, Layout, Locale, Place, Rect, Report, Slot, Spec } from './types';
import { SEASON_CN, TIME_CN, WEATHER_CN } from './types';

const key = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
export const rndOf = (seed: number, salt: number) => (k: number) => hash(seed * 7919 + 13, salt * 131 + k, 977);
/** the stage the checks allow (a little beyond AREA: the wings run out to |x| ≈ 12); live, AREA grows on the 2x stage */
export const stageRect = (): Rect => ({ x0: AREA.x0 - 2, x1: AREA.x1 + 2, z0: AREA.z0 - 4, z1: AREA.z1 + 1 });

// ------------------------------------------------------------------ the 2x stage (act-19): a layout in the old coordinates, moved
/** a rect through SX / SZ: a narrow one (a road, < 4 m across) keeps its width round its moved centre, a wide one stretches */
function stretchRect(r: Rect): Rect {
  const ax = (a: number, b: number, f: (v: number) => number): [number, number] => b - a < 4 ? [f((a + b) / 2) - (b - a) / 2, f((a + b) / 2) + (b - a) / 2] : [f(a), f(b)];
  const [x0, x1] = ax(r.x0, r.x1, SX), [z0, z1] = ax(r.z0, r.z1, SZ); return { x0, x1, z0, z1 };
}
/** the layout for the current stage: on the 2x stage every slot / landmark / road moves out with the floor (sizes unchanged) */
export function stageLayout(l: Layout): Layout {
  if (!STAGE_BIG.on) return l;
  const roads = l.path.map(r => ({ ...stretchRect(r) }));
  // a road that ran in from the front edge still does
  for (let i = 0; i < roads.length; i++) if (l.path[i].z1 > 8) roads[i].z1 = Math.max(roads[i].z1, AREA.z1 + 0.4);
  return { ...l, landmark: l.landmark ? { ...l.landmark, x: SX(l.landmark.x), z: SZ(l.landmark.z) } : null, path: roads, court: l.court ? stretchRect(l.court) : undefined,
    slots: l.slots.map(s => ({ ...s, x: SX(s.x), z: SZ(s.z) })) };
}
/** most point lights per scene (each one costs every lit pixel; the shader also recompiles when the count changes) */
export const MAX_LIGHTS = 12;
/** QA-only work in the assembler: on in Node (the tests), off in the browser unless asked (__dh / the scene browser) */
export const ASM_QA = { floating: !__WX__ && typeof window === 'undefined' };

// ------------------------------------------------------------------ mirroring a layout (x → −x)
const mirR = (r: Rect): Rect => ({ x0: -r.x1, x1: -r.x0, z0: r.z0, z1: r.z1 });
export function mirrorLayout(l: Layout): Layout {
  return { ...l, id: l.id + '~', landmark: l.landmark ? { ...l.landmark, x: -l.landmark.x } : null, path: l.path.map(mirR), court: l.court ? mirR(l.court) : undefined,
    slots: l.slots.map(s => ({ ...s, x: -s.x, s: (-s.s) as -1 | 0 | 1 })) };
}

// ------------------------------------------------------------------ the sandbox: a Ctx whose writes are held back until commit
/** a VoxWorld that writes to its own cells but reads through to `base` where it has nothing (a group can probe the floor) */
function overlay(base: VoxWorld) {
  const w = new VoxWorld(CELL), own = w.cells;
  w.has = (x, y, z) => own.has(key(x, y, z)) || base.has(x, y, z);
  w.get = (x, y, z) => own.get(key(x, y, z)) ?? base.get(x, y, z);
  return w;
}
interface Held { w: VoxWorld; cut: VoxWorld; ops: Array<(c: Ctx) => void>; cards: Array<[string, number, number, Parameters<Cards['add']>[3]]>; lights: Array<Parameters<Ctx['light']>> }
function sandbox(real: Ctx): { ctx: Ctx; held: Held } {
  const held: Held = { w: overlay(real.w), cut: new VoxWorld(CELL), ops: [], cards: [], lights: [] };
  const cards = {
    add: (k: string, x: number, z: number, o?: Parameters<Cards['add']>[3]) => { held.cards.push([k, x, z, o]); },
    count: (k: string) => real.cards.count(k) + held.cards.filter(c => c[0] === k).length,
    scatter: (...a: Parameters<Cards['scatter']>) => { held.ops.push(c => c.cards.scatter(...a)); },
  } as unknown as Cards;
  const ctx: Ctx = {
    w: held.w, cut: held.cut, cards,
    light: (...a) => { held.lights.push(a); },
    flame: (...a) => { held.ops.push(c => c.flame(...a)); },
    water: (...a) => { held.ops.push(c => c.water(...a)); },
    rune: (...a) => { held.ops.push(c => c.rune(...a)); },
    onPhase: f => { held.ops.push(c => c.onPhase(f)); },
    add: o => { held.ops.push(c => c.add(o)); },
    cutEaves: h => { held.ops.push(c => c.cutEaves(h)); },
    ambient: a => { held.ops.push(c => c.ambient(a)); },
    shaft: (...a) => { held.ops.push(c => c.shaft(...a)); },
  };
  return { ctx, held };
}
/** every cell the held build occupies, voxels (hard) and flora prisms (soft) */
function heldCells(h: Held) {
  const hard: number[] = [...h.w.cells.keys()], soft: number[] = [];
  for (const m of plot(h.w).masses) for (let x = m.x0; x <= m.x1; x++) for (let y = m.y0; y <= m.y1; y++) for (let z = m.z0; z <= m.z1; z++) soft.push(key(x, y, z));
  return { hard, soft };
}
interface Live { lights: number; occ: Occ; soft: Set<number>; hard: Set<number> }
function commitHeld(real: Ctx, h: Held, live: Live, cells: { hard: number[]; soft: number[] }) {
  for (const [k, v] of h.w.cells) real.w.cells.set(k, v);
  for (const [k, v] of h.cut.cells) real.cut.cells.set(k, v);
  const src = plot(h.w), dst = plot(real.w);
  dst.masses.push(...src.masses); dst.hangs.push(...src.hangs); dst.rings.push(...src.rings);
  for (const [k, x, z, o] of h.cards) real.cards.add(k, x, z, o);
  for (const a of h.lights) { if (live.lights >= MAX_LIGHTS) break; real.light(...a); live.lights++; }
  for (const op of h.ops) op(real);
  commit(live.occ, cells.hard); commit(live.occ, cells.soft);
  for (const k of cells.hard) if (((Math.floor(k / 1024) % 1024) - 512) >= 0) live.hard.add(k);
  for (const k of cells.soft) live.soft.add(k);
}
/** hard ∩ (hard ∪ soft) and soft ∩ hard above the body band: a tree through a roof, a roof through a wall. Crowns may mingle. */
function upperClash(cells: { hard: number[]; soft: number[] }, live: Live) {
  let n = 0;
  for (const k of cells.hard) { const y = (Math.floor(k / 1024) % 1024) - 512; if (y > 8 && (live.hard.has(k) || live.soft.has(k))) n++; }
  for (const k of cells.soft) { const y = (Math.floor(k / 1024) % 1024) - 512; if (y > 8 && live.hard.has(k)) n++; }
  return n;
}

// ------------------------------------------------------------------ choosing
function weightedOrder<T extends { weight?: number }>(list: T[], r: (k: number) => number, salt: number) {
  return list.map((g, i) => ({ g, k: -Math.log(1 - r(salt + i) * 0.999) / (g.weight ?? 1) })).sort((a, b) => a.k - b.k).map(o => o.g);
}
const SIZE_RANK = { S: 0, M: 1, L: 2 } as const;
function fits(g: Group, sl: Slot, seasonOk: boolean) {
  return seasonOk && (sl.maxH == null || g.h <= sl.maxH + 0.05) && g.kinds.includes(sl.kind) && SIZE_RANK[g.size] <= SIZE_RANK[sl.size] && g.foot.w <= sl.w + 0.01 && g.foot.d <= sl.d + 0.01;
}

export interface Registry { locales: Record<string, Locale>; layouts: Record<string, Layout>; groupsByTag(tag: string): Group[] }

/** make the scene for a spec; the report fills in while the stage builds (read it after showStage) */
export function assemble(spec: Spec, reg: Registry): { def: SceneDef; report: Report } {
  const loc = reg.locales[spec.locale], base = reg.layouts[spec.layout] ?? loc.extraLayouts?.find(l => l.id === spec.layout);
  if (!loc || !base) throw new Error(`unknown locale / layout ${spec.locale} / ${spec.layout}`);
  const layout = withExits(spec.mirror ? mirrorLayout(stageLayout(base)) : stageLayout(base), spec.exits ?? [], spec.arena?.shape?.fixed);
  const lmName = spec.landmark ? loc.landmarks.find(l => l.id === spec.landmark)?.name ?? '' : '';
  const name = `${loc.name}${lmName ? ' · ' + lmName : ''} · ${SEASON_CN[spec.season]}${TIME_CN[spec.time]}${spec.weather !== 'clear' ? '·' + WEATHER_CN[spec.weather] : ''}`;
  const report: Report = { spec, name, placed: [], rejected: [], empty: [], warnings: [], lights: 0 };
  const mood = loc.mood ? { ...loc.mood } : moodFor(spec.time, spec.season, spec.weather);
  const roomId = spec.arena?.shape?.fixed?.id;
  if (roomId === 'fallen_hall' || roomId === 'palace_road') {
    mood.mistA = 0;
    mood.fogD = 0.009;
  }
  const def: SceneDef = {
    id: `asm_${spec.locale}_${spec.seed}`, name, group: '普通', kind: '户外', blurb: '', mood,
    build(c) { finishBuild(def.buildSteps!(c)); },
    *buildSteps(c) {
      const r = rndOf(spec.seed, 1), lamp = lampFor(spec.time, spec.weather);
      const place = (x: number, z: number, s: -1 | 0 | 1, salt: number): Place => ({ x, z, s, seed: spec.seed * 97 + salt, season: spec.season, time: spec.time, weather: spec.weather, lamp, rnd: rndOf(spec.seed, 1000 + salt) });
      const live: Live = { lights: 0, occ: newOcc(), soft: new Set(), hard: new Set() };
      const walk = [...layout.path, ...(layout.court ? [layout.court] : [])];
      loc.floor(c, { layout, p: place(0, 0, 0, 1), arena: spec.arena });
      yield;
      const usedTags = new Set<string>(), count = new Map<string, number>();
      /** build a group (or landmark) in the sandbox at (x, z), check it, commit it if it passes */
      const tryPlace = (g: { id: string; foot: { w: number; d: number }; tags?: string[]; build(c: Ctx, p: Place): void }, x: number, z: number, s: -1 | 0 | 1, salt: number, slotId: string, o: { strict: boolean; maxH?: number }) => {
        const { ctx, held } = sandbox(c); const issues: Issue[] = [];
        try { g.build(ctx, place(x, z, s, salt)); } catch (e) { issues.push({ kind: 'error', detail: String((e as Error)?.message ?? e) }); }
        const cells = heldCells(held);
        if (!issues.length) issues.push(...checkCells([...cells.hard, ...cells.soft], { anchor: [x, z], foot: g.foot, occ: live.occ, walk: o.strict ? walk : [], stage: stageRect() }));
        if (!issues.length) { const n = upperClash(cells, live); if (n > 6) issues.push({ kind: 'collide', detail: `${n} cells clash above the body band (roof / crown into a building)` }); }
        if (!issues.length && o.maxH != null) { let top = 0; for (const k of cells.hard) top = Math.max(top, (Math.floor(k / 1024) % 1024) - 512); if ((top + 1) * CELL > o.maxH + 0.05) issues.push({ kind: 'bounds', detail: `${((top + 1) * CELL).toFixed(1)} m tall > slot limit ${o.maxH} m` }); }
        if (issues.length && o.strict) { report.rejected.push({ id: g.id, slot: slotId, issues }); return false; }
        if (issues.length) report.warnings.push(`${g.id} @${slotId}: ${issues.map(i => i.kind + ' ' + i.detail).join('; ')}`);
        commitHeld(c, held, live, cells); report.placed.push({ id: g.id, slot: slotId, x: +x.toFixed(2), z: +z.toFixed(2) });
        for (const t of g.tags ?? []) usedTags.add(t); count.set(g.id, (count.get(g.id) ?? 0) + 1);
        return true;
      };
      // 1) the landmark (its own checks are warnings: a landmark that breaks the rules is a locale bug, still shown so QA sees it)
      if (layout.landmark && loc.landmarks.length) {
        const lm = loc.landmarks.find(l => l.id === spec.landmark) ?? loc.landmarks[Math.floor(r(1) * loc.landmarks.length)];
        tryPlace(lm, layout.landmark.x, layout.landmark.z, 0, 2, 'landmark', { strict: false });
      }
      // 2) the slots, big ones first so they get the pick of the groups; each slot tries candidates in a seeded weighted order
      const pool = [...loc.groups, ...(loc.borrow ?? []).flatMap(t => reg.groupsByTag(t))];
      const slots = [...layout.slots].sort((a, b) => SIZE_RANK[b.size] - SIZE_RANK[a.size] || a.id.localeCompare(b.id));
      for (const [si, sl] of slots.entries()) {
        yield;
        const fitK = (g: Group) => { const d = SIZE_RANK[sl.size] - SIZE_RANK[g.size]; return d === 0 ? 3 : d === 1 ? 1 : 0.25; };
        const cand = weightedOrder(pool.map(g => ({ ...g, weight: (g.weight ?? 1) * fitK(g) })), r, 100 + si * 37).filter(g => fits(g, sl, !g.seasons || g.seasons.includes(spec.season)));
        let ok = false;
        for (const g of cand.slice(0, 8)) {
          if ((count.get(g.id) ?? 0) >= (g.max ?? 1)) continue;
          if (g.excludes?.some(t => usedTags.has(t)) || g.tags.some(t => [...pool].some(o => count.has(o.id) && o.excludes?.includes(t)))) continue;
          // the anchor: pushed out so the inner edge clears the battle floor, then jittered inside the slot's spare room
          const spareW = Math.max(0, sl.w - g.foot.w), spareD = Math.max(0, sl.d - g.foot.d);
          let x = sl.x + (r(500 + si) - 0.5) * spareW * 0.8, z = sl.z + (r(600 + si) - 0.5) * spareD * 0.8;
          // beside the battle floor (the slot's z range overlaps it): push the group out so its inner edge clears the floor
          const besidePlay = sl.z + sl.d / 2 > PLAY.z0 - 0.3 && sl.z - sl.d / 2 < PLAY.z1 + 0.3;
          const gap = STAGE_BIG.on ? 1.1 : 0.35;   // the 2x stage has a low wall round its floor (asm/arena.ts)
          if (besidePlay && sl.s > 0) x = Math.max(x, PLAY.x1 + gap + g.foot.w / 2); else if (besidePlay && sl.s < 0) x = Math.min(x, PLAY.x0 - gap - g.foot.w / 2);
          if (tryPlace(g, x, z, sl.s, 10 + si, sl.id, { strict: true, maxH: sl.maxH })) { ok = true; break; }
        }
        if (!ok) report.empty.push(sl.id);
      }
      // 3) filler: small pieces into the room left on the wings (a few tries each, every one checked like a group)
      if (loc.filler?.length) {
        const fill = weightedOrder(loc.filler, r, 900); let n = 0;
        const nMax = STAGE_BIG.on ? 14 : 6, tMax = STAGE_BIG.on ? 120 : 40;
        for (let t = 0; t < tMax && n < nMax; t++) {
          yield;
          const g = fill[t % fill.length], s: -1 | 1 = r(950 + t) < 0.5 ? -1 : 1;
          const x = s * (PLAY.x1 + (STAGE_BIG.on ? 1.2 : 0.6) + g.foot.w / 2 + r(960 + t) * 4.2), z = SZ(-9.5) + r(970 + t) * (SZ(4.5) - SZ(-9.5));
          if ((count.get(g.id) ?? 0) >= (g.max ?? 3)) continue;
          if (tryPlace(g, x, z, s, 300 + t, 'filler', { strict: true })) n++;
          else report.rejected.pop();   // filler misses are expected (it probes for room), keep them out of the report
        }
      }
      // 3b) the 2x stage's walls, gates and cover (inside / on the edge of the battle floor, where no slot group reaches)
      const arenaClear: Rect[] = [];
      if (spec.arena) {
        yield;
        buildArena(c, spec.arena, spec.seed);
        for (const cv of spec.arena.covers) arenaClear.push({ x0: cv.x - cv.hx - 0.3, x1: cv.x + cv.hx + 0.3, z0: cv.z - cv.hz - 0.3, z1: cv.z + cv.hz + 0.3 });
        const w = spec.arena.wall, t = w.gap + w.thick + 0.2;
        arenaClear.push({ x0: PLAY.x0 - t, x1: PLAY.x0, z0: PLAY.z0 - t, z1: PLAY.z1 }, { x0: PLAY.x1, x1: PLAY.x1 + t, z0: PLAY.z0 - t, z1: PLAY.z1 }, { x0: PLAY.x0 - t, x1: PLAY.x1 + t, z0: PLAY.z0 - t, z1: PLAY.z0 });
        // 11-18 屋子形态: what stands on the walled-off parts (the place's infill), and no grass in the water / on a bridge
        const sh = spec.arena.shape;
        if (sh) {
          for (const [i, rc] of sh.solid.entries()) {
            yield;
            const back = rc.z0 > sh.box.z0 + 0.1, front = rc.z1 < sh.box.z1 - 0.1;
            try { loc.infill?.(c, { rect: rc, p: place((rc.x0 + rc.x1) / 2, (rc.z0 + rc.z1) / 2, 0, 700 + i), shape: sh, layout, back, front }); } catch (e) { report.warnings.push(`infill ${i}: ${String((e as Error)?.message ?? e)}`); }
            arenaClear.push({ x0: rc.x0 - t, x1: rc.x1 + t, z0: rc.z0 - t, z1: rc.z1 + t });
          }
          for (const q of [...sh.pits, ...sh.bridges]) arenaClear.push({ x0: q.x0 - 0.2, x1: q.x1 + 0.2, z0: q.z0 - 0.2, z1: q.z1 + 0.2 });
        }
      }
      yield;
      loc.far?.(c, { layout, p: place(0, 0, 0, 3), arena: spec.arena });
      if (spec.season === 'winter' && !loc.noSnow) snowPass(c, walk);
      yield;
      buildFlora(c);
      yield;
      loc.dress?.(c, { layout, p: place(0, 0, 0, 4), clear: [...walk, ...arenaClear] });
      // (11-18: every region's places are Chinese — yellow-brown leaves, not red maple; a burned place has none)
      if (def.mood.sky) for (const a of weatherAmbient(spec.weather, spec.season, spec.time, /^(hj|ly|xp|wl|cx)_/.test(spec.locale))) if (!(loc.noLeaves && a.kind === 'leaves')) c.ambient(a);
      report.lights = live.lights;
      if (live.lights >= MAX_LIGHTS) report.warnings.push(`light budget reached (${MAX_LIGHTS})`);
      // glow cap (11-15 mixed sheet: some lantern / sign faces bloomed into white glare at dusk): every glowing cell keeps its hue
      // but its brightest channel is held at 0xd8, and a lantern body of more than 40 glowing cells gets only its middle cells lit
      let scanned = 0;
      for (const v of c.w.cells.values()) {
        if ((++scanned & 32767) === 0) yield;
        if (v.g <= 0) continue; const r = (v.c >> 16) & 255, gg = (v.c >> 8) & 255, b = v.c & 255, mx = Math.max(r, gg, b); if (mx > 0xd8) { const k = 0xd8 / mx; v.c = (Math.round(r * k) << 16) | (Math.round(gg * k) << 8) | Math.round(b * k); } }
      // (a QA check: 1.5 s on the 2x stage's two million cells, so the game skips it — act-34; the tests and the scene browser keep it)
      if (ASM_QA.floating) { const fl = floatingCells(c.w.cells); if (fl.count > 40) report.warnings.push(`${fl.count} floating cells, e.g. ${JSON.stringify(fl.sample.slice(0, 3))}`); }
    },
  };
  return { def, report };
}
