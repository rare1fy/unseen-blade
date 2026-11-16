// platform/browser.js — the browser platform for pxui (canvas, pointer input, images, files, safe area, storage, audio).
// Dev extras when served by `node server.mjs` (window.__PXUI_DEV): hot reload of layout/assets over SSE, F2 opens the editor,
// missing glyphs are rasterised live from the Fusion Pixel woff2, and the editor can freeze game time.
import { loadFusion, rasterRGBA } from './glyph-raster.js';

export function createBrowserPlatform(opts = {}) {
  const W = window; let canvas = opts.canvas || null; const resizeFns = new Set(); let fontLive = false;
  const P = {
    name: 'browser',
    get canvas() { return canvas; },
    createCanvas() {
      if (canvas) return canvas; canvas = document.createElement('canvas'); canvas.id = 'pxui-canvas';
      canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;touch-action:none;image-rendering:pixelated;outline:none';
      document.body.appendChild(canvas); const fit = () => { const d = W.devicePixelRatio || 1; canvas.width = Math.round(W.innerWidth * d); canvas.height = Math.round(W.innerHeight * d); };
      fit(); W.addEventListener('resize', fit); return canvas;
    },
    dpr: () => W.devicePixelRatio || 1,
    canvasSize() { const c = canvas; if (!c) return { w: W.innerWidth, h: W.innerHeight }; const r = c.getBoundingClientRect(); return { w: r.width || c.clientWidth || W.innerWidth, h: r.height || c.clientHeight || W.innerHeight }; },
    safeArea() { let p = document.getElementById('pxui-safe'); if (!p) { p = document.createElement('div'); p.id = 'pxui-safe'; p.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(p); }
      const cs = getComputedStyle(p); return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 }; },
    now: () => performance.now(),
    raf: cb => W.requestAnimationFrame(cb),
    setTimeout: (f, ms) => W.setTimeout(f, ms),
    loadImage: url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image ' + url)); im.src = url; }),
    readText: url => { const B = globalThis.__PXUI_BAKED; if (B && B.files && B.files[url] != null) return Promise.resolve(B.files[url]); return fetch(url, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.text(); }); },
    query: k => { try { return new URLSearchParams(W.location.search).get(k); } catch (e) { return null; } },
    // pointer input: window capture phase, coordinates relative to the canvas; events the UI consumes stop here
    onPointer(fn) {
      const conv = (e, type) => { const r = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 }; return { type, id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, raw: e }; };
      const h = type => e => { if (canvas && type === 'down' && e.target !== canvas && !(canvas.contains && canvas.contains(e.target)) && e.target !== document.body && e.target !== document.documentElement) return; if (fn(conv(e, type))) { e.stopPropagation(); if (type === 'down') e.preventDefault(); } };
      W.addEventListener('pointerdown', h('down'), true); W.addEventListener('pointermove', h('move'), true); W.addEventListener('pointerup', h('up'), true); W.addEventListener('pointercancel', h('cancel'), true);
    },
    onResize(fn) { resizeFns.add(fn); W.addEventListener('resize', () => fn()); },
    storage: { get(k) { try { const v = W.localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }, set(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } },
    audio: { play(url, o = {}) { try { const a = new Audio(url); a.loop = !!o.loop; a.volume = o.volume ?? 1; a.play().catch(() => {}); return a; } catch (e) { return null; } } },
    log: (...a) => console.log(...a),
    rasterizeGlyph: (ch) => fontLive ? rasterRGBA(ch) : null,
    // editor: freeze game time (performance.now and rAF timestamps stop) while frames keep rendering, so UI edits stay live
    freeze(on) {
      if (!P._t0) { const pn = performance.now.bind(performance), raf = W.requestAnimationFrame.bind(W); let frozenAt = 0, offset = 0, frozen = false;
        P._t0 = { set(v) { if (v && !frozen) { frozenAt = pn() - offset; frozen = true; } else if (!v && frozen) { offset = pn() - frozenAt; frozen = false; } } };
        const now = () => frozen ? frozenAt : pn() - offset; performance.now = now; W.requestAnimationFrame = cb => raf(() => cb(now())); }
      P._t0.set(on);
    },
    attach(UI) {
      W.PXUI = UI; const dev = W.__PXUI_DEV; if (!dev) return;
      loadFusion('/__pxui/fonts/fusion-pixel-12px-zh_hans.woff2').then(ok => { if (ok) { fontLive = true; UI.setFont(); } }).catch(() => {});
      if (W.__PXUI_IN_EDITOR) return;   // the editor pushes layout changes itself
      try { const es = new EventSource('/__pxui/events'); es.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.type === 'layout' && UI.url) fetch(UI.url + (UI.url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(doc => UI.setLayout(doc)).catch(e => console.warn('[pxui] reload', e));
        if (m.type === 'asset' && m.file) UI.bumpAsset(m.file);
        if (m.type === 'font') import('/' + 'ui/font.js?t=' + Date.now()).then(mod => UI.setFont(mod.default)).catch(() => {}); }; } catch (e) {}
      W.addEventListener('keydown', e => { if (e.key === 'F2') { e.preventDefault(); const u = new URL(W.location.href); u.searchParams.set('edit', '1'); W.location.href = u.toString(); } });
    },
  };
  return P;
}
