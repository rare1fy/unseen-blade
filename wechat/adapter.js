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
  if (typeof G.requestAnimationFrame === 'undefined' && typeof requestAnimationFrame !== 'undefined') G.requestAnimationFrame = requestAnimationFrame;
  if (typeof G.cancelAnimationFrame === 'undefined' && typeof cancelAnimationFrame !== 'undefined') G.cancelAnimationFrame = cancelAnimationFrame;
  if (typeof G.performance === 'undefined' || !G.performance.now) { var t0 = Date.now(); G.performance = { now: function () { return Date.now() - t0; } }; }
  if (typeof G.navigator === 'undefined') G.navigator = { userAgent: 'minigame', language: 'zh-CN' };
  if (typeof G.document === 'undefined') {
    var mk = function (n) { n = String(n).toLowerCase(); if (n === 'canvas') { var cv = api.createCanvas(); if (!cv.style) cv.style = {}; if (!cv.addEventListener) { cv.addEventListener = noop; cv.removeEventListener = noop; } return cv; } if (n === 'img') return api.createImage(); return { style: {}, appendChild: noop, addEventListener: noop }; };
    G.document = { createElement: mk, createElementNS: function (ns, n) { return mk(n); }, body: { appendChild: noop }, documentElement: { style: {} }, addEventListener: noop };
  }
})();
