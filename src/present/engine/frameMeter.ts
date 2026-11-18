import type * as THREE from 'three';
import { preferences } from '../../platform/preferences';
import type { UiLayer } from '../ui3d/layer';
import { QUALITY, TIER_CN } from '../look/quality';
import { msg, t } from '../act/i18n';

export const meter = { visible: preferences.get('ub.frameMeter') === '1' };
export const meterLabel = () => msg`显示帧率：${meter.visible ? '开' : '关'}`;
export function toggleMeter() {
  meter.visible = !meter.visible;
  preferences.set('ub.frameMeter', meter.visible ? '1' : '0');
}

type Sample = (ms: number, cpu: number, draws: number, triangles: number, gpu: number | null, ui: number) => void;
let sample: Sample | null = null;
let lastLabel = -Infinity, lastGpu: number | null = null;
export function paintMeter(L: UiLayer, stats: { ms: number; calls: number; tris: number }, now: number) {
  if (!meter.visible) {
    if (lastLabel !== -Infinity) L.text.hide('fps');
    lastLabel = -Infinity;
    return;
  }
  if (now - lastLabel < 500) return;
  lastLabel = now;
  const gpu = lastGpu === null ? '' : ' GPU ' + lastGpu.toFixed(1) + 'ms';
  L.text.set('fps', { x: L.w - 5, y: 10, align: 'right', pix: Math.max(1, Math.round(L.dpr * 0.62)),
    text: `${Math.round(1000 / stats.ms)} FPS  ${stats.ms.toFixed(1)}ms  DC ${stats.calls}  △ ${stats.tris}  ${t(TIER_CN[QUALITY.tier])}${gpu}` });
}

/** A single asynchronous GPU query covers world, UI and text. Never wait for the driver. */
export function frameTimer(renderer: THREE.WebGLRenderer) {
  const context = renderer.getContext(), webgl2 = renderer.capabilities.isWebGL2;
  const ext = context.getExtension(webgl2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query');
  // WebGL1 exposes query objects through the extension. The optional timer never changes rendering.
  const gl: Pick<WebGL2RenderingContext, 'createQuery' | 'beginQuery' | 'endQuery' | 'deleteQuery' |
    'getQueryParameter' | 'QUERY_RESULT' | 'QUERY_RESULT_AVAILABLE'> = webgl2 || !ext
    ? context as WebGL2RenderingContext
    : { createQuery: () => ext.createQueryEXT(), beginQuery: (target, query) => ext.beginQueryEXT(target, query),
        endQuery: target => ext.endQueryEXT(target), deleteQuery: query => ext.deleteQueryEXT(query),
        getQueryParameter: (query, key) => ext.getQueryObjectEXT(query, key),
        QUERY_RESULT: ext.QUERY_RESULT_EXT, QUERY_RESULT_AVAILABLE: ext.QUERY_RESULT_AVAILABLE_EXT };
  const pending: WebGLQuery[] = [];
  let open: WebGLQuery | null = null;
  return {
    begin(otherTimerActive: boolean) {
      if (!ext || otherTimerActive || (!meter.visible && !sample) || pending.length >= 8) return;
      open = gl.createQuery();
      if (open) gl.beginQuery(ext.TIME_ELAPSED_EXT, open);
    },
    end(ms: number, cpu: number, draws: number, triangles: number, ui: number) {
      if (open) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(open); open = null; }
      let gpu: number | null = null;
      if (pending.length && context.getParameter(ext.GPU_DISJOINT_EXT)) {
        for (const q of pending) gl.deleteQuery(q);
        pending.length = 0; lastGpu = null;
      }
      while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = pending.shift()!;
        gpu = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q);
      }
      if (gpu !== null) lastGpu = gpu;
      sample?.(ms, cpu, draws, triangles, gpu, ui);
    },
  };
}

export function measureFight(step: (seconds: number) => void) {
  if (sample) throw new Error('A frame measurement is already running');
  return new Promise(resolve => {
    const times: number[] = [];
    let elapsed = 0, js = 0, calls = 0, uiCalls = 0, tris = 0, gpuTotal = 0, gpuFrames = 0;
    sample = (ms, cpu, draws, triangles, gpu, ui) => {
      uiCalls += ui;
      elapsed += ms; times.push(ms); js += cpu; calls += draws; tris += triangles;
      if (gpu !== null) { gpuTotal += gpu; gpuFrames++; }
      step(elapsed / 1000);
      if (elapsed < 20000) return;
      sample = null;
      times.sort((a, b) => a - b);
      const n = times.length, slow = times.slice(-Math.ceil(n / 100));
      resolve({ frames: n, meanMs: elapsed / n, p99Ms: times[Math.ceil(n * 0.99) - 1],
        worst1PctMs: slow.reduce((a, b) => a + b, 0) / slow.length,
        calls: calls / n, uiCalls: uiCalls / n, triangles: tris / n, jsMs: js / n, gpuMs: gpuFrames ? gpuTotal / gpuFrames : null });
    };
  });
}
