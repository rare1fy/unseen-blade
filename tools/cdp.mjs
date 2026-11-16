// cdp.mjs — tiny headless-Chrome driver over the DevTools protocol (no deps; Node >= 22 has WebSocket). Used by bake-font and QA.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';

export const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export async function launch({ width = 1300, height = 900, headless = true } = {}) {
  const port = 9300 + Math.floor(Math.random() * 600), prof = path.join(os.tmpdir(), 'pxui-chrome-' + port + '-' + Date.now());
  mkdirSync(prof, { recursive: true });
  const proc = spawn(CHROME, [headless ? '--headless=new' : '', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--hide-scrollbars', `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
    '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', 'about:blank'].filter(Boolean), { stdio: 'ignore' });
  let ver = null; for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { await sleep(150); } }
  if (!ver) throw new Error('chrome did not start');
  const browser = { port, proc, prof,
    async newPage(url = 'about:blank') { const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json(); return connect(t.webSocketDebuggerUrl); },
    async pages() { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(t => t.type === 'page'); },
    async close() { try { proc.kill(); } catch (e) {} await sleep(300); try { rmSync(prof, { recursive: true, force: true }); } catch (e) {} } };
  return browser;
}
export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), logs = [], handlers = new Set();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + JSON.stringify(m.params.exceptionDetails).slice(0, 900));
    if (m.method === 'Runtime.consoleAPICalled') logs.push('console.' + m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 600));
    for (const h of handlers) h(m); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  const P = {
    ws, send, logs, on: h => handlers.add(h),
    async eval(expr, timeout = 30000) { const r = await Promise.race([send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }), sleep(timeout).then(() => ({ result: { exceptionDetails: { text: 'eval timeout' } } }))]);
      if (r.result && r.result.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result && r.result.result ? r.result.result.value : undefined; },
    async goto(url, waitExpr, ms = 20000) { await send('Page.navigate', { url }); if (waitExpr) await P.waitFor(waitExpr, ms); else await sleep(500); },
    async waitFor(expr, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await P.eval(expr, 3000)) return true; } catch (e) {} await sleep(100); } throw new Error('waitFor timeout: ' + expr); },
    async viewport(width, height, dpr = 1, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile }); },
    async shot(file, clip) { const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); return file; },
    async mouse(type, x, y, o = {}) { await send('Input.dispatchMouseEvent', { type, x, y, button: o.button || 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' && !o.down ? (o.down ? 1 : 0) : 1, clickCount: o.clickCount || 1, modifiers: o.modifiers || 0 }); },
    async click(x, y, o = {}) { await P.mouse('mouseMoved', x, y); await P.mouse('mousePressed', x, y, o); await sleep(40); await P.mouse('mouseReleased', x, y, o); await sleep(60); },
    async dblclick(x, y) { await P.mouse('mousePressed', x, y, { clickCount: 1 }); await P.mouse('mouseReleased', x, y, { clickCount: 1 }); await P.mouse('mousePressed', x, y, { clickCount: 2 }); await P.mouse('mouseReleased', x, y, { clickCount: 2 }); await sleep(80); },
    async drag(x1, y1, x2, y2, steps = 12, o = {}) { await P.mouse('mouseMoved', x1, y1); await sleep(40); await P.mouse('mousePressed', x1, y1, o); await sleep(50); for (let i = 1; i <= steps; i++) { await P.mouse('mouseMoved', x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps, { down: true, modifiers: o.modifiers }); await sleep(25); } await sleep(o.hold || 100); await P.mouse('mouseReleased', x2, y2, o); await sleep(100); },   // paced: a release that overtakes the moves reads as a click
    async key(key, o = {}) { const code = o.code || (key.length === 1 ? 'Key' + key.toUpperCase() : key); const vk = o.vk || { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, Escape: 27, Delete: 46, Backspace: 8, Tab: 9, F2: 113 }[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
      await send('Input.dispatchKeyEvent', { type: key.length === 1 && !o.modifiers ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, modifiers: o.modifiers || 0, text: key.length === 1 && !(o.modifiers & 2) ? key : undefined });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: o.modifiers || 0 }); await sleep(40); },
    async type(text) { await send('Input.insertText', { text }); await sleep(40); },
    async touch(type, x, y) { await send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] }); },
    async close() { try { await Promise.race([send('Page.close'), sleep(1500)]); } catch (e) {} try { ws.close(); } catch (e) {} },   // closes the tab (WebGL contexts are limited per browser)
  };
  return P;
}
export const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
export { sleep };
