// platform/minigame.js — WeChat (wx) and Douyin (tt) mini-game platform for pxui. No DOM: the screen canvas, touch, images,
// package files, safe area and storage all come from the mini-game API object.
export function createMinigamePlatform(api, name, opts = {}) {
  const G = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
  let sys = api.getSystemInfoSync(); let canvas = opts.canvas || G.canvas || null; const resizeFns = new Set();
  const P = {
    name,
    get canvas() { return canvas; },
    createCanvas() { if (!canvas) { canvas = api.createCanvas(); G.canvas = canvas; } return canvas; },   // the first canvas created is the on-screen one
    dpr: () => sys.pixelRatio || 1,
    canvasSize: () => ({ w: sys.windowWidth, h: sys.windowHeight }),
    safeArea() { const s = sys.safeArea; if (!s) return { top: sys.statusBarHeight || 0, right: 0, bottom: 0, left: 0 }; return { top: s.top || 0, left: s.left || 0, right: Math.max(0, sys.windowWidth - s.right), bottom: Math.max(0, sys.windowHeight - s.bottom) }; },
    now: () => Date.now(),
    raf: cb => (G.requestAnimationFrame || requestAnimationFrame)(cb),
    setTimeout: (f, ms) => setTimeout(f, ms),
    loadImage: url => new Promise((res, rej) => { const im = api.createImage(); im.onload = () => res(im); im.onerror = e => rej(new Error('image ' + url + ' ' + (e && e.errMsg || ''))); im.src = url; }),
    readText(url) {
      if (/^https?:/.test(url)) return new Promise((res, rej) => api.request({ url, dataType: 'text', responseType: 'text', success: r => res(typeof r.data === 'string' ? r.data : JSON.stringify(r.data)), fail: rej }));
      try { return Promise.resolve(api.getFileSystemManager().readFileSync(url.replace(/^\.\//, ''), 'utf8')); } catch (e) { return Promise.reject(e); }
    },
    query: k => { try { const q = (api.getLaunchOptionsSync && api.getLaunchOptionsSync().query) || {}; return q[k] ?? null; } catch (e) { return null; } },
    onPointer(fn) {
      const each = type => e => { for (const t of e.changedTouches || []) fn({ type, id: t.identifier, x: t.clientX ?? t.x, y: t.clientY ?? t.y, raw: e }); };
      api.onTouchStart(each('down')); api.onTouchMove(each('move')); api.onTouchEnd(each('up')); api.onTouchCancel(each('cancel'));
    },
    onResize(fn) { resizeFns.add(fn); if (api.onWindowResize) api.onWindowResize(() => { sys = api.getSystemInfoSync(); fn(); }); },
    storage: { get(k) { try { const v = api.getStorageSync(k); return v === '' ? null : v; } catch (e) { return null; } }, set(k, v) { try { api.setStorageSync(k, v); } catch (e) {} } },
    audio: { play(url, o = {}) { try { const a = api.createInnerAudioContext(); a.src = url; a.loop = !!o.loop; a.volume = o.volume ?? 1; a.play(); return a; } catch (e) { return null; } } },
    log: (...a) => console.log(...a),
    attach(UI) { G.PXUI = UI; },
  };
  return P;
}
