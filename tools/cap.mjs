// Drive a page in headless Chrome (real GPU via D3D11) over the DevTools protocol: screenshots, recordings (webm), logs.
// Usage: node tools/cap.mjs <url> <out dir> <actions.json | '[...]'> [WxH=412x860] [dpr=1] [vt]
//
// Virtual time ("vt", recommended for recordings): a script injected before the page loads takes over performance.now / Date.now /
// requestAnimationFrame / setTimeout / setInterval and the Web Animations timeline. The harness then advances the page exactly 1/60 s per
// frame and screenshots the frames it records, so a clip is a true 60 fps (or 30 fps) real-speed recording no matter how slowly the GPU
// renders (hit-stop, shake, DOM tweens all stay in sync). Without "vt" the page runs in real time and recordings use the screencast.
//
// Actions (run in order; times are virtual in vt mode):
//   {"wait":ms} {"shot":"name"} {"tap":[x,y]} {"drag":[x1,y1,x2,y2,steps?,stepMs?,holdMs?]} {"down":[x,y]} {"move":[x,y]} {"up":[x,y]}
//   {"path":[[x,y],...],"stepMs":24,"holdMs":0}            pointer down at the first point, through every point, up at the last
//   {"eval":"js"}  {"tapEval":"js -> [x,y]"}  {"pathEval":"js -> [[x,y],...]"}  {"waitFor":"js truthy (sync)","ms":20000}  {"json":"js","file":"x.json"}
//   {"rec":"name","fps":30,"quality":85,"clip":[x,y,w,h]}  ...  {"stop":true,"thumbs":0.5}   records to <out>/<name>.webm; thumbs = also save a jpeg every N s in <out>/<name>_f/
//   {"fps":true}                                            real frames per second (rAF ticks in real mode, stepped frames in vt mode)
// The log (console errors / warnings / exceptions + eval results) is written to <out>/log.txt.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fixDuration } from './webmdur.mjs';

const [, , url, outDir, actionsArg = '[]', size = '412x860', dprArg = '1', mode = ''] = process.argv;
const actions = JSON.parse(actionsArg.trim().startsWith('[') ? actionsArg : readFileSync(actionsArg, 'utf8'));
mkdirSync(outDir, { recursive: true });
const [W, H] = size.split('x').map(Number), DPR = +dprArg, mobile = H > W, VT = mode === 'vt', STEP = 1000 / 60;
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 600);
const prof = `${process.env.TEMP || '.'}/dhcap_prof_${port}`;
const chrome = spawn(CH, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--hide-scrollbars', `--window-size=${W + 20},${H + 40}`, '--no-first-run',
  '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const logs = [], t0 = Date.now(); const log = s => { logs.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + s); };

// ---------------------------------------------------------------- the virtual clock (injected before any page script)
const VT_SCRIPT = `(() => {
  const realRaf = window.requestAnimationFrame.bind(window), base = Date.now(); let vt = 0, rid = 1, tid = 1;
  const raf = [], timers = new Map();
  performance.now = () => vt; Date.now = () => base + Math.floor(vt);
  window.requestAnimationFrame = cb => { const id = rid++; raf.push([id, cb]); return id; };
  window.cancelAnimationFrame = id => { const i = raf.findIndex(r => r[0] === id); if (i >= 0) raf.splice(i, 1); };
  window.setTimeout = (fn, ms, ...args) => { const id = tid++; timers.set(id, { due: vt + Math.max(0, +ms || 0), fn, args }); return id; };
  window.setInterval = (fn, ms, ...args) => { const id = tid++, iv = Math.max(1, +ms || 0); timers.set(id, { due: vt + iv, fn, args, iv }); return id; };
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...a) { const an = animate.apply(this, a); try { an.playbackRate = 0; an.__vt = true; } catch (e) {} return an; };
  function stepAnims(ms) {
    for (const a of document.getAnimations()) {
      if (a.playState === 'finished' || a.playState === 'idle') continue;
      if (a.playState === 'paused') continue;                       // paused by the page itself (debug holds): leave alone
      const t = a.currentTime == null ? 0 : +a.currentTime, end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
      a.__vt = true; if (t + ms >= end) { a.playbackRate = 1; a.currentTime = end; } else { if (a.playbackRate !== 0) a.playbackRate = 0; a.currentTime = t + ms; }
    }
  }
  window.__vt = {
    get now() { return vt; },
    step(ms) {
      vt += ms;
      for (let g = 0; g < 2000; g++) { let best = null; for (const e of timers) if (e[1].due <= vt && (!best || e[1].due < best[1].due)) best = e; if (!best) break;
        const [id, t] = best; if (t.iv) t.due += t.iv; else timers.delete(id); try { typeof t.fn === 'function' && t.fn(...t.args); } catch (e) { console.error(e); } }
      stepAnims(ms);
      const q = raf.splice(0); for (const [, cb] of q) { try { cb(vt); } catch (e) { console.error(e); } }
      return vt;
    },
    realFrame() { return new Promise(r => realRaf(() => r(true))); },
  };
})();`;

// ---------------------------------------------------------------- CDP plumbing: one connection per page target
async function connect(wsUrl, onEvent) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map();
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; } if (m.method && onEvent) onEvent(m); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr, awaitPromise = true) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }); return r.result?.exceptionDetails ? 'EVAL ERROR ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400) : r.result?.result?.value; };
  return { ws, send, evaluate };
}
async function pageWs() { for (let i = 0; i < 80; i++) { try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = list.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error('no page target'); }

let P, rec = null, steps = 0;
function onEvent(m) {
  if (m.method === 'Runtime.exceptionThrown') log('EXCEPTION ' + JSON.stringify(m.params.exceptionDetails).slice(0, 700));
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) log('console.' + m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 400));
  if (m.method === 'Page.screencastFrame') { P.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }); if (rec && !VT) rec.frames.push({ t: m.params.metadata.timestamp, data: m.params.data }); }
}

// ---------------------------------------------------------------- time: one virtual frame (vt) or real sleeping
async function stepFrame() {
  const now = await P.evaluate(`__vt.step(${STEP})`, false); steps++;
  if (rec && steps % rec.every === 0) { const r = await P.send('Page.captureScreenshot', Object.assign({ format: 'jpeg', quality: rec.quality, optimizeForSpeed: true }, rec.clip ? { clip: { x: rec.clip[0], y: rec.clip[1], width: rec.clip[2], height: rec.clip[3], scale: 1 } } : {})); rec.frames.push({ t: now / 1000, data: r.result.data }); }
  else await P.evaluate('__vt.realFrame()');   // let the compositor / GPU keep up
}
async function advance(ms) { if (!VT) return sleep(ms); const n = Math.max(1, Math.round(ms / STEP)); for (let i = 0; i < n; i++) await stepFrame(); }

// ---------------------------------------------------------------- encode recorded frames to webm in a second tab (canvas.captureStream + MediaRecorder, paced at the frame timestamps)
async function encode(frames, file) {
  if (frames.length < 2) { log('rec: too few frames ' + frames.length); return; }
  const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }); const tgt = await r.json();
  const E = await connect(tgt.webSocketDebuggerUrl); await E.send('Runtime.enable'); await E.send('Page.bringToFront');
  await E.evaluate('window.__F = []; true');
  for (let i = 0; i < frames.length; i += 12) { const chunk = frames.slice(i, i + 12).map(f => ({ t: f.t, d: f.data })); await E.evaluate(`window.__F.push(...${JSON.stringify(chunk)}); true`); }
  const b64 = await E.evaluate(`(async () => {
    const F = window.__F; const imgs = await Promise.all(F.map(f => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/jpeg;base64,' + f.d; })));
    const cv = document.createElement('canvas'); cv.width = imgs[0].naturalWidth; cv.height = imgs[0].naturalHeight; document.body.appendChild(cv); const g = cv.getContext('2d');
    g.drawImage(imgs[0], 0, 0);
    const st = cv.captureStream(60); const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const mr = new MediaRecorder(st, { mimeType: mime, videoBitsPerSecond: ${Math.round(2.6e6 * Math.sqrt(DPR))} }); const parts = []; mr.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
    const done = new Promise(r => mr.onstop = r); mr.start(200);
    const T0 = performance.now(), base = F[0].t;
    for (let i = 0; i < imgs.length; i++) { const due = (F[i].t - base) * 1000; const now = performance.now() - T0; if (due > now) await new Promise(r => setTimeout(r, due - now)); g.drawImage(imgs[i], 0, 0); }
    await new Promise(r => setTimeout(r, 300)); mr.requestData(); await new Promise(r => setTimeout(r, 100)); mr.stop(); await done;
    const blob = new Blob(parts, { type: 'video/webm' }); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s);
  })()`);
  if (typeof b64 !== 'string' || b64.startsWith('EVAL ERROR') || !b64.length) log('rec encode failed ' + String(b64).slice(0, 300));
  else { let wb = Buffer.from(b64, 'base64'); try { wb = fixDuration(wb).buf; } catch (e) { log('webm duration fix failed: ' + e.message); } writeFileSync(file, wb); log(`rec saved ${file.split('/').pop()} frames=${frames.length} dur=${(frames[frames.length - 1].t - frames[0].t).toFixed(2)}s bytes=${Math.round(b64.length * 0.75)}`); }
  E.ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${tgt.id}`).catch(() => {}); await P.send('Page.bringToFront');
}

try {
  P = await connect(await pageWs(), onEvent);
  await P.send('Runtime.enable'); await P.send('Page.enable');
  if (VT) await P.send('Page.addScriptToEvaluateOnNewDocument', { source: VT_SCRIPT });
  if (mobile) await P.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' });
  await P.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile });
  await P.send('Page.navigate', { url });
  if (VT) for (let i = 0; i < 200; i++) { if (await P.evaluate('!!window.__vt')) break; await sleep(50); }
  const mouse = (type, x, y) => P.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const path = async (pts, st = 24, hold = 0) => { await mouse('mousePressed', pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 12)); for (let i = 1; i <= n; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await advance(st); } }
    if (hold) await advance(hold); const L = pts[pts.length - 1]; await mouse('mouseReleased', L[0], L[1]); };
  for (const a of actions) {
    if (a.wait) await advance(a.wait);
    else if (a.shot) { const r = await P.send('Page.captureScreenshot', Object.assign({ format: 'png' }, a.clip ? { clip: { x: a.clip[0], y: a.clip[1], width: a.clip[2], height: a.clip[3], scale: 1 } } : {})); writeFileSync(`${outDir}/${a.shot}.png`, Buffer.from(r.result.data, 'base64')); log('shot ' + a.shot); }
    else if (a.tap) { await mouse('mousePressed', a.tap[0], a.tap[1]); await advance(70); await mouse('mouseReleased', a.tap[0], a.tap[1]); }
    else if (a.down) await mouse('mousePressed', a.down[0], a.down[1]);
    else if (a.move) await mouse('mouseMoved', a.move[0], a.move[1]);
    else if (a.up) await mouse('mouseReleased', a.up[0], a.up[1]);
    else if (a.drag) { const [x1, y1, x2, y2, n = 12, st = 30, hold = 0] = a.drag; await path(Array.from({ length: n + 1 }, (_, i) => [x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n]), st / 2, hold); }
    else if (a.path) await path(a.path, a.stepMs, a.holdMs);
    else if (a.eval) log('eval ' + a.eval.slice(0, 90) + ' => ' + String(JSON.stringify(await P.evaluate(a.eval, !VT))).slice(0, 500));
    else if (a.tapEval) { const p = await P.evaluate(a.tapEval, !VT); log('tapEval ' + JSON.stringify(p)); if (Array.isArray(p)) { await mouse('mousePressed', p[0], p[1]); await advance(70); await mouse('mouseReleased', p[0], p[1]); } }
    else if (a.pathEval) { const pts = await P.evaluate(a.pathEval, !VT); log('pathEval ' + JSON.stringify(pts)); if (Array.isArray(pts) && pts.length) await path(pts, a.stepMs, a.holdMs); }
    else if (a.waitFor) {
      const lim = a.ms || 20000, ts = Date.now(); let v, waited = 0;
      while (waited < lim) { v = await P.evaluate(a.waitFor, !VT); if (v && !(typeof v === 'string' && v.startsWith('EVAL ERROR'))) break; if (VT) { await stepFrame(); waited += STEP; } else { await sleep(100); waited = Date.now() - ts; } }
      log('waitFor ' + a.waitFor.slice(0, 70) + ' => ' + JSON.stringify(v) + ` ${Math.round(waited)}ms` + (VT ? ` (real ${Date.now() - ts}ms)` : ''));
    }
    else if (a.json) { const v = await P.evaluate(a.json, !VT); writeFileSync(`${outDir}/${a.file}`, JSON.stringify(v, null, 1)); log('json ' + a.file + ' ' + String(JSON.stringify(v)).slice(0, 300)); }
    else if (a.rec) { const fps = a.fps || 30; rec = { name: a.rec, frames: [], every: Math.max(1, Math.round(60 / fps)), quality: a.quality || 85, clip: a.clip, t0: Date.now() };
      if (!VT) await P.send('Page.startScreencast', { format: 'jpeg', quality: rec.quality, everyNthFrame: 1 }); log('rec start ' + a.rec); }
    else if (a.stop) { if (!VT) await P.send('Page.stopScreencast'); const r = rec; rec = null; if (r) {
        log(`rec ${r.name}: ${r.frames.length} frames in ${((Date.now() - r.t0) / 1000).toFixed(1)}s real`);
        if (a.thumbs) { mkdirSync(`${outDir}/${r.name}_f`, { recursive: true }); let next = r.frames[0]?.t ?? 0, k = 0; for (const f of r.frames) if (f.t >= next - 1e-6) { writeFileSync(`${outDir}/${r.name}_f/${String(k++).padStart(3, '0')}_${(f.t - r.frames[0].t).toFixed(2)}.jpg`, Buffer.from(f.data, 'base64')); next = f.t + a.thumbs; } }
        await encode(r.frames, `${outDir}/${r.name}.webm`); } }
    else if (a.fps) { if (VT) { const ts = Date.now(), s0 = steps; await advance(1000); log('fps (vt stepping) ' + Math.round((steps - s0) * 1000 / (Date.now() - ts))); }
      else log('fps ' + await P.evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); (function f(){ n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); })(); })`)); }
  }
} catch (e) { log('HARNESS ERROR ' + (e && e.stack || e)); }
finally {
  writeFileSync(`${outDir}/log.txt`, logs.join('\n')); console.log(logs.join('\n'));
  try { P && P.ws.close(); } catch {}
  chrome.kill(); process.exit(0);
}
