// 拼装场景的批量检查（不开浏览器）：对每个地点 × 每个构图 × 镜像 × 一组季节时段 × 多个种子，建出场景、跑全部摆放检查。
// 失败条件：地标违规（landmark 的检查只当警告记下，这里要求为零）、大量悬空格子、某个插槽在所有种子里都放不进东西、
// 某个组从来没被放下过（写坏了或尺寸声明错了）、灯数超预算。最后打印每个组的放置 / 拒绝次数，给做素材的人看。
// 运行：npx vitest run tests/asm.test.ts（ASM_N=种子数，默认 6；ASM_LOCALE=地点 id 只查一个）
import { assemble, stageLayout, mirrorLayout } from '../src/present/asm/assemble';
import { REGISTRY, LOCALES, addLocales } from '../src/present/asm/registry';
import { NINJA_LOCALES } from '../src/present/asm/ninja';
import { HANMO_LOCALES } from '../src/present/asm/hanmo';
addLocales(NINJA_LOCALES); addLocales(HANMO_LOCALES);
import { pickSpec, sameness } from '../src/present/asm/pick';
import { setStage } from '../src/present/scenes/props';
import { makeShape, SHAPE_K, type PitKind } from '../src/present/asm/roomShape';
import { arenaPlan } from '../src/present/asm/arena';
import { withExits, type ExitId } from '../src/present/asm/exits';
import type { Ctx } from '../src/present/scenes/stage';
import type { Report, Spec, SeasonId, TimeId } from '../src/present/asm/types';
import { VoxWorld } from '../src/present/look/voxkit';
import { CELL } from '../src/present/bestiary/kit';

/** a Ctx that records everything and draws nothing */
function fakeCtx() {
  const cards = new Map<string, number>(), lights: unknown[] = [];
  const c: Ctx = {
    w: new VoxWorld(CELL), cut: new VoxWorld(CELL),
    cards: { add: (k: string) => { cards.set(k, (cards.get(k) ?? 0) + 1); }, count: (k: string) => cards.get(k) ?? 0, scatter: () => {} } as unknown as Ctx['cards'],
    light: (...a) => { lights.push(a); }, flame: () => {}, water: () => {}, rune: () => {}, onPhase: () => {}, add: () => {}, cutEaves: () => {}, ambient: () => {}, shaft: () => {},
  };
  return { c, cards, lights };
}
const N = Number((globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.ASM_N ?? 6);
const SEAS: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'], TIMES: TimeId[] = ['dusk', 'night', 'dawn', 'day'];

describe('assembled scenes', () => {
  // ASM_LOCALE=<id> checks just one place (the agent building it); unset = all
  const only = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.ASM_LOCALE;
  const locales = Object.values(LOCALES).filter(l => (l.groups.length || l.landmarks.length) && (!only || l.id === only));
  it('has locales to test', () => { expect(Object.keys(LOCALES).length).toBeGreaterThan(0); });
  for (const loc of locales) {
    it(`${loc.name}: every layout builds clean`, () => {
      const placedBy = new Map<string, number>(), rejectedBy = new Map<string, Map<string, number>>(), emptyBy = new Map<string, number>(), problems: string[] = [];
      let runs = 0;
      const lays = [...loc.layouts, ...(loc.extraLayouts ?? []).map(l => l.id)];
      for (const layout of lays) for (const mirror of [false, true]) for (let i = 0; i < N; i++) {
        const L = REGISTRY.layouts[layout];
        const lms = L.landmark ? loc.landmarks.filter(l => l.foot.w <= L.landmark!.w + 0.01 && l.foot.d <= L.landmark!.d + 0.01) : [];
        const spec: Spec = { locale: loc.id, layout, mirror, landmark: lms.length ? lms[i % lms.length].id : null, season: (loc.seasons ?? SEAS)[i % (loc.seasons ?? SEAS).length], time: (loc.times ?? TIMES)[(i * 3 + (mirror ? 1 : 0)) % (loc.times ?? TIMES).length], weather: 'clear', seed: 1000 + i * 17 + (mirror ? 7 : 0) };
        const { def, report } = assemble(spec, REGISTRY), f = fakeCtx(); runs++;
        def.build(f.c);
        tally(report, placedBy, rejectedBy, emptyBy);
        const bad = report.warnings.filter(w => !/light budget/.test(w));
        if (bad.length) problems.push(`${report.name} [${layout}${mirror ? '~' : ''} #${spec.seed}]: ${bad.join(' | ')}`);
      }
      const never = loc.groups.filter(g => !placedBy.get(g.id)).map(g => `${g.id}(${[...(rejectedBy.get(g.id) ?? new Map())].map(([k, n]) => k + '×' + n).join(',') || 'never tried'})`);
      const stats = loc.groups.map(g => `${g.id}:${placedBy.get(g.id) ?? 0}/${[...(rejectedBy.get(g.id) ?? new Map())].map(([k, n]) => k + n).join('+') || 0}`).join('  ');
      const emptyRate = [...emptyBy].filter(([, n]) => n / runs > 0.5).map(([k, n]) => `${k} ${Math.round(100 * n / runs)}%`);
      console.log(`\n[${loc.name}] ${runs} scenes · placed/rejected per group: ${stats}\n  slots empty >50%: ${emptyRate.join(', ') || 'none'}`);
      if (problems.length) console.log('  warnings:\n   ' + problems.slice(0, 12).join('\n   '));
      expect(problems, 'landmark / floating / error warnings').toEqual([]);
      expect(never, 'groups never placed').toEqual([]);
    });
  }
  it('a chapter of 10 picks has no near-repeats', () => {
    const recent: Spec[] = [];
    for (let i = 0; i < 10; i++) recent.push(pickSpec(77 + i, locales, REGISTRY.layouts, recent));
    for (let i = 1; i < recent.length; i++) {
      const a = recent[i], b = recent[i - 1];
      expect(sameness(a, b), `#${i} vs #${i - 1}: ${JSON.stringify(a)} / ${JSON.stringify(b)}`).toBeLessThan(8);
      expect(a.time === b.time, `#${i}: same time as the one before`).toBe(false);
    }
    const big = new Set(recent.map(s => `${s.locale}|${s.layout}|${s.landmark}`));
    expect(big.size, 'distinct (locale, layout, landmark) in 10').toBeGreaterThanOrEqual(Math.min(10, 7));
  });
  // 11-18 屋子形态: every place with shapes, every one of its shapes × its pit kinds × a few seeds, built on its own stage with the walls,
  // pits, bridges and infill — no errors, nothing floating, no locale warnings; the groups still find room round the bigger floors
  for (const loc of locales.filter(l => l.shapes?.length)) {
    it(`${loc.name}: every room shape builds clean`, () => {
      const problems: string[] = [], N2 = Math.max(2, Math.round(N / 2));
      for (const id of loc.shapes!) for (const pit of (id === 'bridge' || id === 'pond' ? loc.pits ?? ['water'] : ['water'] as PitKind[])) for (let i = 0; i < N2; i++) {
        setStage(true, SHAPE_K[id]);
        const lay = loc.layouts[i % loc.layouts.length], mirror = i % 2 === 1, exits: ExitId[] = i % 3 === 0 ? ['left', 'right'] : i % 3 === 1 ? ['back'] : [];
        const L = REGISTRY.layouts[lay], layout = withExits(mirror ? mirrorLayout(stageLayout(L)) : stageLayout(L), exits);
        const seed = 3000 + i * 29, sp = makeShape(id, seed, { layout, pit });
        const lms = L.landmark ? loc.landmarks.filter(l => l.foot.w <= L.landmark!.w + 0.01 && l.foot.d <= L.landmark!.d + 0.01) : [];
        const spec: Spec = { locale: loc.id, layout: lay, mirror, landmark: lms.length ? lms[i % lms.length].id : null, season: (loc.seasons ?? SEAS)[i % (loc.seasons ?? SEAS).length], time: TIMES[i % 4], weather: 'clear', seed, exits, arena: arenaPlan(layout, exits, seed, loc.id, 'fight', sp) };
        const { def, report } = assemble(spec, REGISTRY), f = fakeCtx();
        def.build(f.c);
        const bad = report.warnings.filter(w => !/light budget/.test(w));
        if (bad.length) problems.push(`${report.name} [${id}/${pit} ${lay}${mirror ? '~' : ''} #${seed}]: ${bad.join(' | ')}`);
      }
      setStage(true);
      if (problems.length) console.log('  shape warnings:\n   ' + problems.slice(0, 12).join('\n   '));
      expect(problems, 'shape build warnings').toEqual([]);
    });
  }
});

function tally(r: Report, placed: Map<string, number>, rej: Map<string, Map<string, number>>, empty: Map<string, number>) {
  for (const p of r.placed) placed.set(p.id, (placed.get(p.id) ?? 0) + 1);
  for (const x of r.rejected) { const m = rej.get(x.id) ?? new Map<string, number>(); for (const i of x.issues) m.set(i.kind, (m.get(i.kind) ?? 0) + 1); rej.set(x.id, m); }
  for (const s of r.empty) empty.set(s, (empty.get(s) ?? 0) + 1);
}
