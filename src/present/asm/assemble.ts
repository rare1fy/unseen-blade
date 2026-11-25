import { finishBuild } from '../engine/buildSteps';
// 拼装器：按 Spec（地点 × 构图 × 地标 × 季节 × 时段 × 天气 × 种子）拼出一张战斗场景，并给出摆放报告。
// 每个道具组都先在「沙盒」里建（临时体素层 + 记下的灯光、面片、植被），量出实际格子，过 check.ts 的检查，通过才并入场景；
// 不通过就记进 report.rejected，换下一个候选。所以组写错了尺寸、和别的东西撞了、悬空了、挡了战斗区，都不会进最终画面。
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import { AREA, PLAY, M, hash, SX, SZ, STAGE_BIG } from '../scenes/props';
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
export const ASM_QA = { reports: __DEV__, floating: !__WX__ && typeof window === 'undefined' };

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
  commit(live.occ, cells.hard, ASM_QA.reports); commit(live.occ, cells.soft, ASM_QA.reports);
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
    // act-128: attach weather ambient particles in decorate() so baked WeChat packs ALSO get randomized weather particles!
    decorate(c) {
      if (def.mood.sky) for (const a of weatherAmbient(spec.weather, spec.season, spec.time, /^(hj|ly|xp|wl|cx)_/.test(spec.locale))) if (!(loc.noLeaves && a.kind === 'leaves')) c.ambient(a);
    },
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
        const inspect = o.strict || ASM_QA.reports;
        if (inspect && !issues.length) issues.push(...checkCells([...cells.hard, ...cells.soft], { anchor: [x, z], foot: g.foot, occ: live.occ, walk: o.strict ? walk : [], stage: stageRect(), firstOnly: !ASM_QA.reports }));
        if (inspect && !issues.length) { const n = upperClash(cells, live); if (n > 6) issues.push({ kind: 'collide', detail: `${n} cells clash above the body band (roof / crown into a building)` }); }
        if (inspect && !issues.length && o.maxH != null) { let top = 0; for (const k of cells.hard) top = Math.max(top, (Math.floor(k / 1024) % 1024) - 512); if ((top + 1) * CELL > o.maxH + 0.05) issues.push({ kind: 'bounds', detail: `${((top + 1) * CELL).toFixed(1)} m tall > slot limit ${o.maxH} m` }); }
        if (issues.length && o.strict) { if (ASM_QA.reports) report.rejected.push({ id: g.id, slot: slotId, issues }); return false; }
        if (ASM_QA.reports && issues.length) report.warnings.push(`${g.id} @${slotId}: ${issues.map(i => i.kind + ' ' + i.detail).join('; ')}`);
        commitHeld(c, held, live, cells); if (ASM_QA.reports) report.placed.push({ id: g.id, slot: slotId, x: +x.toFixed(2), z: +z.toFixed(2) });
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
        if (!ok && ASM_QA.reports) report.empty.push(sl.id);
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
          else if (ASM_QA.reports) report.rejected.pop();   // filler misses are expected (it probes for room), keep them out of the report
        }
      }
      // 3b) the 2x stage's walls, gates and cover (inside / on the edge of the battle floor, where no slot group reaches)
      const arenaClear: Rect[] = [];
      if (spec.arena) {
        yield;
        buildArena(c, spec.arena, spec.seed);
        for (const cv of spec.arena.covers) arenaClear.push({ x0: cv.x - cv.hx - 0.3, x1: cv.x + cv.hx + 0.3, z0: cv.z - cv.hz - 0.3, z1: cv.z + cv.hz + 0.3 });
        const w = spec.arena.wall, t = w.gap + w.thick + 0.2;
        arenaClear.push(
          { x0: PLAY.x0 - t, x1: PLAY.x0, z0: PLAY.z0 - t, z1: PLAY.z1 + t },
          { x0: PLAY.x1, x1: PLAY.x1 + t, z0: PLAY.z0 - t, z1: PLAY.z1 + t },
          { x0: PLAY.x0 - t, x1: PLAY.x1 + t, z0: PLAY.z0 - t, z1: PLAY.z0 },
          ...(spec.arena.openFront ? [] : [{ x0: PLAY.x0 - t, x1: PLAY.x1 + t, z0: PLAY.z1, z1: PLAY.z1 + t }]),
        );
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
      southForegroundPass(c, spec);
      if (spec.season === 'winter' && !loc.noSnow) snowPass(c, walk);
      yield;
      buildFlora(c);
      yield;
      loc.dress?.(c, { layout, p: place(0, 0, 0, 4), clear: [...walk, ...arenaClear] });
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


/**
 * act-135 (用户：「出发的出口处景物要延申出去，所有的地图都要这样，不能一眼就是镜头背后的东西都没做，满足不遮挡的情况下适当补全」):
 * Unified low-profile (y ≤ 8 cells ≈ 0.56 m, ZERO camera occlusion) 3D voxel foreground continuation
 * extending south of PLAY.z1 across all 5 regions (黄巾 / 洛阳 / 下邳 / 乌林 / 崔府) so the camera-side edge
 * always reads as a living, continuing world instead of a sharp void cut-off.
 */
function southForegroundPass(c: Ctx, spec: Spec) {
  const loc = spec.locale;
  const isHJ = loc.startsWith('hj_') || loc.startsWith('ninja_');
  const isLY = loc.startsWith('ly_');
  const isXP = loc.startsWith('xp_');
  const isWL = loc.startsWith('wl_');
  const isCX = loc.startsWith('cx_');
  if (!isHJ && !isLY && !isXP && !isWL && !isCX) return;

  const w = c.w, sd = spec.seed * 31 + 17;
  const r = (k: number) => hash(sd, k, 521);
  const zA = PLAY.z1 + 1.5, zB = AREA.z1 + 2.6;
  const xMin = PLAY.x0 - 4.5, xMax = PLAY.x1 + 4.5;
  if (zB <= zA + 1.0) return;

  // Helper: check if ground voxel exists under footprint so nothing ever floats
  const grounded = (X: number, Z: number, pad = 2) =>
    w.has(X, -1, Z) && w.has(X - pad, -1, Z) && w.has(X + pad, -1, Z) && w.has(X, -1, Z - pad) && w.has(X, -1, Z + pad);
  // Helper: ensure footprint isn't already occupied by an existing solid above floor
  const emptyAbove = (X: number, Z: number, pad = 2) =>
    !w.has(X, 0, Z) && !w.has(X - pad, 1, Z) && !w.has(X + pad, 1, Z) && !w.has(X, 1, Z - pad) && !w.has(X, 1, Z + pad);

  // 1) Central southern approach road / avenue / jetty continuation (strictly flush y = -1..0, zero occlusion)
  const cx = (PLAY.x0 + PLAY.x1) * 0.5;
  const roadHW = isLY ? 2.4 : isCX ? 2.0 : isWL ? 1.8 : 1.7;
  const Xr0 = M(cx - roadHW), Xr1 = M(cx + roadHW), Zr0 = M(PLAY.z1 + 0.6), Zr1 = M(zB + 0.8);
  if (isHJ || isLY || isCX) {
    const body = isLY ? 0x6c5e54 : isCX ? 0x707884 : 0x8a7558;
    const edge = isLY ? 0x4e433c : isCX ? 0x525a66 : 0x6b5840;
    const slab = isLY ? 0x84766a : isCX ? 0x8a929e : 0x9c8868;
    for (let X = Xr0; X <= Xr1; X++) {
      for (let Z = Zr0; Z <= Zr1; Z++) {
        if (!w.has(X, -1, Z)) continue;
        if (w.has(X, 0, Z)) continue;
        const isEdge = X <= Xr0 + 1 || X >= Xr1 - 1;
        const isSlab = !isEdge && Math.abs(X - M(cx)) <= 8 && ((Z % 14 + 14) % 14) <= 7;
        w.set(X, -1, Z, isEdge ? edge : isSlab ? slab : body);
      }
    }
  } else if (isWL) {
    // Southern timber pier extension & flanking mooring posts rooted cleanly into river bed
    const pX0 = M(cx - 1.3), pX1 = M(cx + 1.3), pZ0 = M(PLAY.z1 + 0.8), pZ1 = M(PLAY.z1 + 5.6);
    for (let X = pX0; X <= pX1; X++) {
      for (let Z = pZ0; Z <= pZ1; Z++) {
        if (w.has(X, 0, Z)) continue;
        const seam = ((Z % 6) + 6) % 6 === 0;
        const rail = X === pX0 || X === pX1;
        w.set(X, -1, Z, rail ? 0x3c281a : seam ? 0x4a3222 : 0x62442e);
      }
    }
    for (const px of [pX0, pX1]) for (let pz = pZ0 + 6; pz <= pZ1; pz += 18) {
      w.box(px, -4, pz, px + 1, 5, pz + 1, 0x382418);
      w.box(px, 6, pz, px + 1, 6, pz + 1, 0x725036);
    }
  }

  // 1b) act-189: Camera-side flanking architecture outside the south wall corners (outer flanks |x| near PLAY.x0/x1, z ∈ [PLAY.z1+1.2..PLAY.z1+5.6])
  // Gives real built structures on both sides of the camera foreground without ever obstructing the central battle sightline!
  if (spec.arena && !spec.arena.openFront) {
    for (const side of [-1, 1] as const) {
      const fx = side < 0 ? PLAY.x0 - 2.4 : PLAY.x1 + 2.4;
      const fz = PLAY.z1 + 2.4;
      const FX = M(fx), FZ = M(fz);
      if (isHJ) {
        // Flanking village low courtyard return wall + timber woodpile / cart outside the SW/SE gate corners
        if (grounded(FX, FZ, 6) && emptyAbove(FX, FZ, 5)) {
          w.box(FX - 12, 0, FZ - 3, FX + 12, 2, FZ + 3, 0x7e6848);
          w.box(FX - 11, 3, FZ - 2, FX + 11, 11, FZ + 2, 0xa88a60);
          w.box(FX - 12, 12, FZ - 3, FX + 12, 13, FZ + 3, 0x56585e);
          w.box(FX - 11, 14, FZ - 2, FX + 11, 14, FZ + 2, 0x72747a);
          // Adjacent stacked supply crates & hay bale
          const sx = FX - side * 14, sz = FZ + 6;
          if (grounded(sx, sz, 4) && emptyAbove(sx, sz, 3)) {
            w.box(sx - 4, 0, sz - 3, sx + 4, 5, sz + 3, 0x6e5238);
            w.box(sx - 4, 6, sz - 3, sx + 4, 6, sz + 3, 0x8e6e4c);
            w.box(sx + 5, 0, sz - 3, sx + 11, 4, sz + 3, 0xb89648);
          }
        }
      } else if (isLY) {
        // Scorched palace colonnade wing plinths + snapped charred red pillars & tile rubble
        if (grounded(FX, FZ, 6) && emptyAbove(FX, FZ, 5)) {
          w.box(FX - 10, 0, FZ - 5, FX + 10, 3, FZ + 5, 0x5e5854);
          w.box(FX - 9, 4, FZ - 4, FX + 9, 5, FZ + 4, 0x76706a);
          w.box(FX - 4, 6, FZ - 3, FX + 4, 15, FZ + 3, 0x6a2c22);
          w.box(FX - 4, 14, FZ - 3, FX + 4, 16, FZ + 3, 0x26211e);
          w.box(FX + side * 7, 0, FZ + 4, FX + side * 13, 5, FZ + 8, 0x45474c);
        }
      } else if (isXP) {
        // Flooded Xiapi stone quay bastion / timber flood-gate abutment rooted into canal bed
        if (emptyAbove(FX, FZ, 5)) {
          w.box(FX - 8, -4, FZ - 5, FX + 8, 4, FZ + 5, 0x485058);
          w.box(FX - 7, 5, FZ - 4, FX + 7, 8, FZ + 4, 0x646e78);
          w.box(FX - 6, 9, FZ - 3, FX + 6, 10, FZ + 3, 0x9aa6ae);
          // Heavy dark mooring timber posts flanking the bastion
          w.box(FX - 9, -4, FZ + 5, FX - 7, 12, FZ + 7, 0x332f29);
          w.box(FX + 7, -4, FZ + 5, FX + 9, 12, FZ + 7, 0x332f29);
        }
      } else if (isWL) {
        // Yangtze camp/dock timber crib tower base + lashed palisade wing & iron-banded supply barrels
        if (emptyAbove(FX, FZ, 5)) {
          w.box(FX - 9, -4, FZ - 4, FX + 9, 5, FZ + 4, 0x4a3220);
          w.box(FX - 8, 6, FZ - 3, FX + 8, 12, FZ + 3, 0x68482e);
          w.box(FX - 9, 8, FZ - 4, FX + 9, 9, FZ + 4, 0x9a8058);
          w.box(FX - 8, 13, FZ - 3, FX + 8, 13, FZ + 3, 0x4a4f5a);
        }
      } else if (isCX) {
        // Cui Manor whitewashed snow-capped garden wing wall + carved granite courtyard lantern
        if (grounded(FX, FZ, 6) && emptyAbove(FX, FZ, 5)) {
          w.box(FX - 11, 0, FZ - 3, FX + 11, 3, FZ + 3, 0x4a4848);
          w.box(FX - 10, 4, FZ - 2, FX + 10, 12, FZ + 2, 0xdcd8cc);
          w.box(FX - 12, 13, FZ - 4, FX + 12, 14, FZ + 4, 0x34363c);
          w.box(FX - 10, 15, FZ - 2, FX + 10, 15, FZ + 2, 0xdce4ee);
          // Carved stone garden lantern beside the wing wall
          const lx = FX - side * 13, lz = FZ + 5;
          if (grounded(lx, lz, 3) && emptyAbove(lx, lz, 2)) {
            w.box(lx - 2, 0, lz - 2, lx + 2, 2, lz + 2, 0x666c78);
            w.box(lx - 1, 3, lz - 1, lx + 1, 9, lz + 1, 0x7c8492);
            w.box(lx - 2, 10, lz - 2, lx + 2, 12, lz + 2, 0x525a66);
            w.box(lx - 1, 10, lz - 1, lx + 1, 11, lz + 1, 0xd8a862);
            w.box(lx - 3, 13, lz - 3, lx + 3, 14, lz + 3, 0xdce4ee);
          }
        }
      }
    }
  }

  // 2) Region-themed low-profile foreground props scattered across both south flanks (strictly y <= 8!)
  const count = isXP || isWL ? 16 : 20;
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const tx = cx + side * (roadHW + 1.1 + r(10 + i) * Math.max(2.0, (xMax - xMin) * 0.42 - roadHW));
    const tz = zA + r(60 + i) * (zB - zA - 0.6);
    if (tx < xMin || tx > xMax) continue;
    const X = M(tx), Z = M(tz);

    if (isXP) {
      // Frozen Xiapi marshes: water-rooted timber mooring posts, low wet stone piers & drifting flat ice blocks
      if (!emptyAbove(X, Z, 3)) continue;
      if (!w.has(X, -1, Z)) {
        if (i % 3 === 0) {
          // Drifting low ice slab (rooted to -2 so zero floating voxel warnings)
          w.box(X - 4, -2, Z - 3, X + 4, -1, Z + 3, 0x627c8e);
          w.box(X - 3, 0, Z - 2, X + 3, 0, Z + 2, 0xb8d4e6);
        } else {
          // Wet dark-timber mooring piling cluster rooted down to y = -4
          w.box(X - 1, -4, Z - 1, X + 1, 5, Z + 1, 0x3a2e28);
          w.box(X - 1, 6, Z - 1, X + 1, 6, Z + 1, 0x5c4c42);
          if (i % 2 === 0) w.box(X + 2, -4, Z, X + 3, 3, Z + 1, 0x2e2622);
        }
      } else if (grounded(X, Z, 3)) {
        // Low wet limestone embankment boulder
        w.box(X - 4, 0, Z - 3, X + 4, 3, Z + 3, 0x485058);
        w.box(X - 3, 4, Z - 2, X + 3, 5, Z + 2, 0x646e78);
        c.cards.add('reeds', tx + 0.5, tz, { y: 0, s: 0.7, tint: 0x9aa69a });
      }
      continue;
    }

    if (isWL) {
      // Wulin Yangtze riverfront: rooted mooring bollards, floating supply rafts & low riverside barrels
      if (!emptyAbove(X, Z, 3)) continue;
      if (!w.has(X, -1, Z)) {
        if (i % 3 === 0) {
          // Floating lashed timber supply raft + low crate
          w.box(X - 5, -2, Z - 4, X + 5, -1, Z + 4, 0x4a3220);
          w.box(X - 5, 0, Z - 4, X + 5, 0, Z + 4, 0x68482e);
          w.box(X - 2, 1, Z - 2, X + 2, 4, Z + 2, 0x825838);
          w.box(X - 2, 5, Z - 2, X + 2, 5, Z + 2, 0xa2744a);
        } else {
          // Iron-capped mooring bollard pilings
          w.box(X - 1, -4, Z - 1, X + 1, 5, Z + 1, 0x3a2618);
          w.box(X - 1, 6, Z - 1, X + 1, 6, Z + 1, 0x4c525c);
        }
      } else if (grounded(X, Z, 2)) {
        w.box(X - 2, 0, Z - 2, X + 2, 4, Z + 2, 0x72482c);
        w.box(X - 2, 2, Z - 2, X + 2, 2, Z + 2, 0x383c44);
      }
      continue;
    }

    if (!grounded(X, Z, 3) || !emptyAbove(X, Z, 3)) continue;

    if (isHJ) {
      // Hanmo village / fields: low hay bundles, weathered boundary boulders, low wooden posts & autumn scrub
      const kind = i % 4;
      if (kind === 0) {
        // Low hay bale / straw stack (y <= 6)
        w.box(X - 4, 0, Z - 3, X + 4, 4, Z + 3, 0xb89648);
        w.box(X - 3, 5, Z - 2, X + 3, 6, Z + 2, 0xd4b25c);
      } else if (kind === 1) {
        // Low weathered limestone boulder pair
        w.box(X - 4, 0, Z - 3, X + 4, 3, Z + 3, 0x6e6a62);
        w.box(X - 2, 4, Z - 2, X + 3, 5, Z + 2, 0x8a847a);
      } else if (kind === 2) {
        // Low broken timber fence stub (y <= 7)
        w.box(X - 4, 0, Z, X - 3, 6, Z + 1, 0x4e3622);
        w.box(X + 3, 0, Z, X + 4, 5, Z + 1, 0x4e3622);
        w.box(X - 3, 3, Z, X + 3, 4, Z + 1, 0x6e4e32);
      } else {
        // Low autumn bush mound
        w.box(X - 4, 0, Z - 4, X + 4, 3, Z + 4, 0x5c6836);
        w.box(X - 3, 4, Z - 3, X + 3, 5, Z + 3, 0x7a8244);
      }
      c.cards.add(i % 2 ? 'grass' : 'weeds', tx + 0.6, tz + 0.3, { y: 0, s: 0.65, tint: 0xb8a878 });
    } else if (isLY) {
      // Luoyang scorched avenue: low broken column drums, charred timber stubs, scorched brick piles & extinguished iron braziers
      const kind = i % 3;
      if (kind === 0) {
        w.box(X - 4, 0, Z - 4, X + 4, 3, Z + 4, 0x625a54);
        w.box(X - 3, 4, Z - 3, X + 3, 6, Z + 3, 0x7c726a);
      } else if (kind === 1) {
        w.box(X - 5, 0, Z - 2, X + 5, 2, Z + 2, 0x2c2624);
        w.box(X - 3, 3, Z - 1, X + 2, 3, Z + 1, 0x423632);
      } else {
        // Low iron brazier pedestal (unlit or faint coal bed, y <= 7)
        w.box(X - 3, 0, Z - 3, X + 3, 3, Z + 3, 0x524c48);
        w.box(X - 3, 4, Z - 3, X + 3, 6, Z + 3, 0x36343a);
        w.box(X - 2, 7, Z - 2, X + 2, 7, Z + 2, 0xb84824);
      }
    } else if (isCX) {
      // Cui Manor snowy courtyard: low carved stone balustrade piers, snow-capped Taihu rocks & trimmed low winter shrubs
      const kind = i % 3;
      if (kind === 0) {
        // Low carved granite pier (y <= 7)
        w.box(X - 3, 0, Z - 3, X + 3, 5, Z + 3, 0x666c78);
        w.box(X - 4, 6, Z - 4, X + 4, 7, Z + 4, 0x868e9c);
      } else if (kind === 1) {
        // Snow-dusted Taihu garden rock
        w.box(X - 4, 0, Z - 3, X + 4, 4, Z + 3, 0x545c66);
        w.box(X - 3, 5, Z - 2, X + 2, 6, Z + 2, 0xdce4ee);
      } else {
        // Low snow-capped winter evergreen bush
        w.box(X - 4, 0, Z - 4, X + 4, 4, Z + 4, 0x2e4638);
        w.box(X - 3, 5, Z - 3, X + 3, 6, Z + 3, 0xd8e2ec);
      }
    }
  }
}
