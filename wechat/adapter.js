// minigame-adapter.js — the minimal global shims three.js r162 needs inside WeChat / Douyin mini-games (prepended to game.js by
// tools/build-minigame.mjs). Written for pxui instead of a third-party adapter: three-platformize pins old three releases and
// weapp-adapter emulates far more DOM than three r162 touches. What three r162 actually uses:
//   canvas.addEventListener (context-loss listeners), self.requestAnimationFrame (setAnimationLoop), performance.now (Clock),
//   document.createElementNS('canvas'|'img') (rare: resizing NPOT textures on WebGL1, ImageLoader), navigator.userAgent.
(function () {
  var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof globalThis !== 'undefined' ? globalThis : this);
  var api = typeof tt !== 'undefined' && tt && tt.createCanvas ? tt : typeof wx !== 'undefined' && wx && wx.createCanvas ? wx : null;
  if (!api) return;   // not a mini-game (e.g. the same bundle opened in a browser for comparison)
  if (!G.canvas) G.canvas = api.createCanvas();   // the first canvas is the screen
  var c = G.canvas, noop = function () {};
  if (!c.addEventListener) { c.addEventListener = noop; c.removeEventListener = noop; }
  if (!c.style) c.style = {};
  if (!c.getBoundingClientRect) c.getBoundingClientRect = function () { var s = api.getSystemInfoSync(); return { left: 0, top: 0, width: s.windowWidth, height: s.windowHeight }; };
  if (typeof G.self === 'undefined') G.self = G;
  else if (G.self && typeof G.self.requestAnimationFrame !== 'function' && typeof requestAnimationFrame === 'function') {
    try { G.self.requestAnimationFrame = requestAnimationFrame; } catch (e) { /* read-only */ }
  }
  if (typeof G.requestAnimationFrame === 'undefined' && typeof requestAnimationFrame !== 'undefined') G.requestAnimationFrame = requestAnimationFrame;
  if (typeof G.cancelAnimationFrame === 'undefined' && typeof cancelAnimationFrame !== 'undefined') G.cancelAnimationFrame = cancelAnimationFrame;
  if (typeof G.performance === 'undefined' || !G.performance || typeof G.performance.now !== 'function') {
    var t0 = Date.now(), perfNow = function () { return Date.now() - t0; };
    try { G.performance = { now: perfNow }; } catch (e) {
      if (G.performance) try { G.performance.now = perfNow; } catch (e2) { /* read-only */ }
    }
  }
  if (typeof G.navigator === 'undefined' || !G.navigator) {
    try { G.navigator = { userAgent: 'minigame', language: 'zh-CN' }; } catch (e) { /* read-only */ }
  }
  // 11-19 (iOS 高性能+): runtime may expose a bare non-DOM GameGlobal.document without createElement / addEventListener;
  // fill missing shims unless it is a real DOM Document (nodeType === 9).
  if (!(G.document && G.document.nodeType === 9)) {
    var mk = function (n) {
      n = String(n).toLowerCase();
      if (n === 'canvas') {
        var cv = api.createCanvas();
        if (!cv.style) cv.style = {};
        if (!cv.addEventListener) { cv.addEventListener = noop; cv.removeEventListener = noop; }
        return cv;
      }
      if (n === 'img') return api.createImage();
      return { style: {}, appendChild: noop, append: noop, addEventListener: noop, removeEventListener: noop, setAttribute: noop, click: noop };
    };
    var mkNS = function (ns, n) { return mk(n); };
    if (!G.document || (typeof G.document !== 'object' && typeof G.document !== 'function')) {
      try {
        G.document = { createElement: mk, createElementNS: mkNS, body: { appendChild: noop, append: noop }, documentElement: { style: {} }, addEventListener: noop, removeEventListener: noop };
      } catch (e) { /* read-only */ }
    } else {
      var d = G.document;
      var putD = function (k, v, isFn) {
        if (isFn ? typeof d[k] === 'function' : d[k]) return;
        try { d[k] = v; } catch (e) {
          try { Object.defineProperty(d, k, { value: v, configurable: true, writable: true }); } catch (e2) { /* frozen */ }
        }
      };
      putD('createElement', mk, true);
      putD('createElementNS', mkNS, true);
      putD('body', { appendChild: noop, append: noop }, false);
      putD('documentElement', { style: {} }, false);
      putD('addEventListener', noop, true);
      putD('removeEventListener', noop, true);
    }
  }
})();
