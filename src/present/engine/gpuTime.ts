// 11-18 微信帧率: per-stage GPU timing of a frame (EXT_disjoint_timer_query_webgl2) and draw-call / triangle counts per stage.
// Off by default (mark() is a no-op); __dh.perf(frames) turns it on for a while and returns the averages. Desktop GPU numbers are
// not phone numbers, but the shares between the stages are what the WeChat budget is decided on.
import type * as THREE from 'three';

interface Seg { name: string; q: WebGLQuery | null; calls: number; tris: number }
const S = {
  on: false, gl: null as WebGL2RenderingContext | null, ext: null as { TIME_ELAPSED_EXT: number } | null, r: null as THREE.WebGLRenderer | null,
  /** the open segment and the frame's finished ones (queries still in flight) */
  cur: null as Seg | null, frame: [] as Seg[], pending: [] as Seg[][],
  /** name → [sum ms, frames, sum calls, sum tris] */
  acc: new Map<string, [number, number, number, number]>(),
  c0: 0, t0: 0,
};

export function gpuTimeInit(r: THREE.WebGLRenderer) {
  S.r = r; const gl = r.getContext() as WebGL2RenderingContext;
  if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) { S.gl = gl; S.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); }
  // the shadow map is drawn inside renderer.render: its own segment, then back to the one it interrupted
  const sm = r.shadowMap as unknown as { render: (...a: unknown[]) => void }, orig = sm.render.bind(sm);
  sm.render = (...a: unknown[]) => { if (!S.on) return orig(...a); const back = S.cur?.name ?? 'scene'; gpuMark(back + ':shadow'); orig(...a); gpuMark(back); };
}
const close = () => {
  const c = S.cur; if (!c) return; S.cur = null;
  if (c.q && S.gl && S.ext) S.gl.endQuery(S.ext.TIME_ELAPSED_EXT);
  const info = S.r!.info.render; c.calls = info.calls - S.c0; c.tris = info.triangles - S.t0; S.frame.push(c);
};
/** start a named segment (closes the open one) */
export function gpuMark(name: string) {
  if (!S.on) return;
  close();
  const info = S.r!.info.render; S.c0 = info.calls; S.t0 = info.triangles;
  let q: WebGLQuery | null = null;
  if (S.gl && S.ext) { q = S.gl.createQuery(); if (q) S.gl.beginQuery(S.ext.TIME_ELAPSED_EXT, q); }
  S.cur = { name, q, calls: 0, tris: 0 };
}
/** end of the frame: close the last segment, collect the queries that have come back */
export function gpuFrameEnd() {
  if (!S.on) return;
  close(); if (S.frame.length) S.pending.push(S.frame); S.frame = [];
  const gl = S.gl;
  while (S.pending.length) {
    const f = S.pending[0];
    if (gl && S.ext && f.some(s => s.q && !gl.getQueryParameter(s.q, gl.QUERY_RESULT_AVAILABLE))) break;
    S.pending.shift();
    const disjoint = !!(gl && S.ext && gl.getParameter((S.ext as unknown as { GPU_DISJOINT_EXT: number }).GPU_DISJOINT_EXT));
    for (const s of f) {
      const ms = s.q && gl && !disjoint ? gl.getQueryParameter(s.q, gl.QUERY_RESULT) / 1e6 : NaN;
      if (s.q && gl) gl.deleteQuery(s.q);
      const a = S.acc.get(s.name) || [0, 0, 0, 0]; if (!isNaN(ms)) { a[0] += ms; a[1]++; } a[2] += s.calls; a[3] += s.tris; S.acc.set(s.name, a);
    }
  }
}
export const gpuMeasuring = () => S.on;
let frames = 0;
export function gpuCount() { if (S.on) frames++; }
/** measure for n frames (real frames: needs the page running), resolve the per-stage averages */
export function gpuMeasure(n = 120): Promise<Record<string, unknown>> {
  S.acc.clear(); S.pending.length = 0; frames = 0; S.on = true;
  return new Promise(res => {
    const tick = () => {
      if (frames < n) { requestAnimationFrame(tick); return; }
      S.on = false; close(); S.frame = [];
      const out: Record<string, unknown> = { timer: !!S.ext, frames }; let tot = 0, calls = 0, tris = 0;
      for (const [k, [ms, nf, c, t]] of S.acc) { const m = nf ? ms / nf : NaN; tot += m || 0; calls += c / frames; tris += t / frames; out[k] = { ms: Math.round(m * 100) / 100, calls: Math.round(c / frames), tris: Math.round(t / frames) }; }
      out.total = { ms: Math.round(tot * 100) / 100, calls: Math.round(calls), tris: Math.round(tris) };
      res(out);
    };
    requestAnimationFrame(tick);
  });
}
