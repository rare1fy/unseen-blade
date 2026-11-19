// Native game services that the HTML entry normally supplies.
// (11-18: the WeChat devtools run the game beside a real, read-only HTMLDocument / Window — 「Cannot assign to read only property
// 'createElementNS' of object '#<HTMLDocument>'」, then 「Illegal invocation」 — while a phone has only the adapter's stand-in document. Only the stand-in is
// patched, and a global the runtime refuses to take is left alone: every name below is also a variable of this file, which is what the
// bundle after it uses.)
var document = GameGlobal.document;

// 11-19 (act-91 on an iPhone in 高性能+: a black screen, vConsole「window.addEventListener is not a function」): under 高性能+ the runtime
// has a bare `window` global — no addEventListener / removeEventListener — where plain 高性能 and normal mode have none. The game reads
// `typeof window !== 'undefined'` as "a browser" in a dozen places (keys, the iOS haptic switch, the audio unlock, the pause menu's
// wheel…) and the first of them threw at load, before anything drew. A window like that gets do-nothing listeners here, before any game
// code runs: those handlers are browser-only (on a phone the touches come through wx.onTouch*, the keys never come), so they are simply
// never called, as in the other modes.
(function () {
  var w = typeof window !== 'undefined' ? window : undefined;
  if (!w || typeof w !== 'object' && typeof w !== 'function') return;
  var noop = function () {};
  var put = function (k) { if (typeof w[k] === 'function') return; try { w[k] = noop; } catch (e) { try { Object.defineProperty(w, k, { value: noop, configurable: true, writable: true }); } catch (e2) { /* frozen: leave it */ } } };
  put('addEventListener'); put('removeEventListener'); put('dispatchEvent');
  if (typeof w.setTimeout !== 'function' && typeof setTimeout === 'function') try { w.setTimeout = setTimeout; w.clearTimeout = clearTimeout; w.setInterval = setInterval; w.clearInterval = clearInterval; } catch (e) { /* frozen */ }
})();

// 11-18 (act-63 on a phone: only the title drew): WeChat hands out a real WebGL2 context from getContext('webgl2') — on phones and in
// the devtools — but has no global WebGL2RenderingContext, and three.js takes a context for WebGL2 only when `typeof
// WebGL2RenderingContext !== 'undefined' && gl.constructor.name === 'WebGL2RenderingContext'`. So it ran its WebGL1 path on a WebGL2
// context and every WebGL1 extension it asked for came back null (the devtools' 「OES_vertex_array_object / EXT_blend_minmax extension
// not supported」, no instancing, no float textures, no derivatives, no depth textures). The name is this file's own variable (the bundle
// after it resolves it here), and the screen canvas's WebGL2 context is given a constructor of that name. A WebGL2 context that lacks
// WebGL2 calls (iOS reports of 「texStorage2D is not a function」) is refused, so three falls back to WebGL1 — handled by the game.
var WebGL2RenderingContext = GameGlobal.WebGL2RenderingContext || function WebGL2RenderingContext() {};
// 11-19 (用户：「我们把高性能+做了吧」; WeChat's 高性能 / 高性能+ guides) on iOS:
//   · plain 高性能 mode: WebGL2 on iOS 15.0 / 15.1 is "基本不可用" (black or garbled screens) — refused there, three falls back to
//     WebGL1 (高性能+ has WebGL2 on every iOS, so it keeps it);
//   · iOS 14 caps some games at 20–40 fps even when a frame is cheap — the guide's fix is antialias: true below iOS 15;
//   · 高性能+: an RGB texture upload garbles the first screen ("花屏") — any plain RGB upload goes as RGBA (three's own are RGBA).
var __ubIOS = (function () {
  try {
    var s = typeof wx !== 'undefined' && wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
    if (!s || String(s.platform).toLowerCase() !== 'ios') return null;
    var m = /(\d+)(?:\.(\d+))?/.exec(String(s.system || ''));
    return m ? { major: +m[1], minor: +(m[2] || 0) } : { major: 0, minor: 0 };
  } catch (e) { return null; }
})();
var __ubHPPlus = !!GameGlobal.isIOSHighPerformanceModePlus;
(function () {
  var cv = GameGlobal.canvas;
  if (!cv || typeof cv.getContext !== 'function') return;
  var getContext = cv.getContext;
  var wrapped = function (type, attrs) {
    if (__ubIOS && (type === 'webgl' || type === 'webgl2')) {
      if (type === 'webgl2' && !__ubHPPlus && __ubIOS.major === 15 && __ubIOS.minor < 2) return null;
      if (__ubIOS.major > 0 && __ubIOS.major < 15) { var a2 = {}; for (var k in (attrs || {})) a2[k] = attrs[k]; a2.antialias = true; attrs = a2; }
    }
    var gl = getContext.call(cv, type, attrs);
    if (gl && type === 'webgl2') {
      if (typeof gl.texStorage2D !== 'function' || typeof gl.createVertexArray !== 'function' || typeof gl.texImage3D !== 'function' || typeof gl.drawArraysInstanced !== 'function') return null;
      if (!gl.constructor || gl.constructor.name !== 'WebGL2RenderingContext') {
        try { Object.defineProperty(gl, 'constructor', { value: WebGL2RenderingContext, configurable: true, writable: true }); } catch (e) { /* frozen */ }
      }
    }
    if (gl && __ubHPPlus && !gl.__ubRGBA) {
      try {
        var RGB = gl.RGB, RGBA = gl.RGBA, t2 = gl.texImage2D;
        gl.texImage2D = function () {
          var a = arguments;
          // (texImage2D(target, level, internalformat, format, type, source) and the sized form with a null pixel buffer)
          if (a.length === 6 && a[2] === RGB && a[3] === RGB) return t2.call(gl, a[0], a[1], RGBA, RGBA, a[4], a[5]);
          if (a.length >= 9 && a[2] === RGB && a[6] === RGB && a[8] == null) return t2.call(gl, a[0], a[1], RGBA, a[3], a[4], a[5], RGBA, a[7], null);
          return t2.apply(gl, a);
        };
        gl.__ubRGBA = true;
      } catch (e) { /* frozen context: leave it */ }
    }
    return gl;
  };
  try { cv.getContext = wrapped; } catch (e) { try { Object.defineProperty(cv, 'getContext', { value: wrapped, configurable: true, writable: true }); } catch (e2) { /* read-only: three keeps the plain call */ } }
})();

// 11-18 (while the mini-game is not yet known to run on phones): the first error — a thrown one, an unhandled rejection, or three's
// console.error about a shader / the renderer — is shown in a native dialog, which works even when nothing draws, so the user can send
// a screenshot instead of a description. Built in by `npm run wx`; `npm run wx -- --no-diag` leaves it out.
var __ubDiag = typeof __UB_NO_DIAG === 'undefined';
(function () {
  if (!__ubDiag || typeof wx === 'undefined' || !wx.showModal) return;
  var shown = false;
  function show(msg) {
    if (shown) return; shown = true;
    try { wx.showModal({ title: '出错了（请截图发给开发）', content: String(msg).slice(0, 700), showCancel: false }); } catch (e) { /* no dialog */ }
  }
  if (wx.onError) wx.onError(function (e) { show(e && (e.message || e.stack) || e); });
  if (wx.onUnhandledRejection) wx.onUnhandledRejection(function (e) { var r = e && e.reason; show('Promise: ' + (r && (r.stack || r.message) || r)); });
  var ce = console.error;
  try {
    console.error = function () {
      try {
        // (an iPhone's error.stack has no message in it — the message first, then the stack)
        var s = Array.prototype.map.call(arguments, function (a) { return a && a.stack ? String(a) + '\n' + a.stack : String(a); }).join(' ');
        if (/Shader Error|WebGLRenderer|WebGLProgram|TypeError|ReferenceError|SyntaxError|RangeError|\[audio\]/.test(s)) show(s);
      } catch (e) { /* never break logging */ }
      return ce.apply(console, arguments);
    };
  } catch (e) { /* console is read-only */ }
})();

var self = GameGlobal.self;
var navigator = GameGlobal.navigator;
var performance = GameGlobal.performance;
var localStorage = {
  getItem: function (key) {
    var value = wx.getStorageSync(key);
    return value === '' || value == null ? null : String(value);
  },
  setItem: function (key, value) { wx.setStorageSync(key, String(value)); },
  removeItem: function (key) { wx.removeStorageSync(key); }
};
try { GameGlobal.localStorage = localStorage; } catch (e) { /* read-only there */ }

// (11-18, the phone's log: 「vox: can't read ../../../vox/fine_white.vox <TypeError: wx.base64ToArrayBuffer is not a function>」 — a
// phone has neither atob nor that call: the user's MagicaVoxel models never loaded. Decoded here in plain JS instead.)
var atob = GameGlobal.atob || (typeof globalThis !== 'undefined' && globalThis.atob) || (function () {
  var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', T = new Uint8Array(256);
  for (var k = 0; k < 64; k++) T[A.charCodeAt(k)] = k;
  return function (value) {
    var s = String(value).replace(/[^A-Za-z0-9+/]/g, ''), n = s.length, out = new Uint8Array((n * 3) >> 2), o = 0;
    for (var i = 0; i < n; i += 4) {
      var a = T[s.charCodeAt(i)], b = T[s.charCodeAt(i + 1)], c = i + 2 < n ? T[s.charCodeAt(i + 2)] : 0, d = i + 3 < n ? T[s.charCodeAt(i + 3)] : 0;
      var v = (a << 18) | (b << 12) | (c << 6) | d;
      if (o < out.length) out[o++] = (v >> 16) & 255;
      if (o < out.length && i + 2 < n) out[o++] = (v >> 8) & 255;
      if (o < out.length && i + 3 < n) out[o++] = v & 255;
    }
    var parts = [];
    for (var j = 0; j < o; j += 8192) parts.push(String.fromCharCode.apply(null, out.subarray(j, Math.min(o, j + 8192))));
    return parts.join('');
  };
})();

var bundledAudio = new Map();
function fetch(file) {
  var name = String(file).split('/')[0];
  var downloaded = bundledAudio.get(name);
  if (!downloaded) {
    downloaded = new Promise(function (resolve, reject) {
      wx.loadSubpackage({ name: name, success: resolve, fail: reject });
    });
    bundledAudio.set(name, downloaded);
    downloaded.catch(function () { bundledAudio.delete(name); });
  }
  return downloaded.then(function () {
    return {
      arrayBuffer: function () {
        return new Promise(function (resolve, reject) {
          wx.getFileSystemManager().readFile({
            filePath: file,
            success: function (result) { resolve(result.data); },
            fail: reject
          });
        });
      }
    };
  });
}

var createElement = document.createElement;
function makeElement(name) {
  if (String(name).toLowerCase() !== 'img') return createElement.call(document, name);
  var image = wx.createImage();
  if (typeof image.addEventListener !== 'function') {
    image.addEventListener = function (event, fn) { image['on' + event] = fn; };
    image.removeEventListener = function (event, fn) {
      if (image['on' + event] === fn) image['on' + event] = null;
    };
  }
  return image;
}
// A real Document (nodeType 9) belongs to the devtools page and is never touched — whatever realm it comes from: in the devtools
// `HTMLDocument` isn't visible to the game, so act-56's `instanceof HTMLDocument` test let the patch through, createElement (writable
// there) was replaced, and called bare it threw 「Illegal invocation」 (act-57). Only the adapter's stand-in (a plain object) is patched.
if (!(document && document.nodeType === 9)) {
  try { document.createElement = makeElement; document.createElementNS = function (_ns, name) { return makeElement(name); }; } catch (e) { /* a frozen document */ }
}

// 11-18 (act-65 on a phone: a picture, no sound): WeChat's WebAudioContext, shaped like the browser's AudioContext for src/audio. What
// its documentation lists, and so what is filled in here:
//   - AudioParam has only `value` — no setValueAtTime / linearRampToValueAtTime / exponentialRampToValueAtTime / setTargetAtTime /
//     cancelScheduledValues, which the game uses for every fade, duck and swell. A param without them gets them in plain JS: the
//     events are kept per param and its `value` is set from them about 60 times a second (enough for fades; a phone that has the
//     real calls keeps them).
//   - no createConvolver: the room reverb's send goes into a silent gain (`noReverb`, so the game doesn't build impulses for it).
//   - decodeAudioData takes callbacks; resume / suspend are documented as synchronous — a promise is made of whatever comes back.
var __ubParamNames = ['gain', 'frequency', 'detune', 'Q', 'playbackRate', 'threshold', 'knee', 'ratio', 'attack', 'release', 'offset', 'delayTime', 'pan'];
function __ubAutomate(ctx) {
  var live = [], timer = 0;
  function at(p, now) {
    // the value at `now` from the param's events (spec-like: a ramp runs from the event before it; a target decays from where it starts)
    var v = p.__v, t0 = p.__t, ev = p.__ev;
    while (ev.length) {
      var e = ev[0];
      if (e.k === 'set') { if (e.t > now) break; v = e.v; t0 = e.t; ev.shift(); continue; }
      if (e.k === 'lin' || e.k === 'exp') {
        if (e.t <= now) { v = e.v; t0 = e.t; ev.shift(); continue; }
        var f = e.t > t0 ? (now - t0) / (e.t - t0) : 1; if (f < 0) f = 0;
        p.__v = v; p.__t = t0;
        return e.k === 'exp' && v > 0 && e.v > 0 ? v * Math.pow(e.v / v, f) : v + (e.v - v) * f;
      }
      // a target: decays toward e.v from e.t until the next event
      if (e.t > now) break;
      var n = ev[1];
      if (n && n.t <= now) { v = e.v + (v - e.v) * Math.exp(-(n.t - e.t) / e.tau); t0 = n.t; ev.shift(); continue; }
      var d = now - e.t;
      if (d > e.tau * 12) { v = e.v; t0 = now; ev.shift(); continue; }
      p.__v = v; p.__t = t0;
      return e.v + (v - e.v) * Math.exp(-d / e.tau);
    }
    p.__v = v; p.__t = t0;
    return v;
  }
  function tick() {
    var now = ctx.currentTime;
    for (var i = live.length - 1; i >= 0; i--) {
      var p = live[i], v = at(p, now);
      try { p.value = v; } catch (e) { /* out of range */ }
      if (!p.__ev.length) { live.splice(i, 1); p.__on = false; }
    }
    if (!live.length && timer) { clearInterval(timer); timer = 0; }
  }
  function begin(p) {
    if (!p.__ev.length) { p.__v = p.value; p.__t = ctx.currentTime; }
  }
  function add(p, e) {
    var ev = p.__ev, i = ev.length;
    while (i > 0 && ev[i - 1].t > e.t) i--;
    ev.splice(i, 0, e);
    if (!p.__on) { p.__on = true; live.push(p); }
    if (!timer) timer = setInterval(tick, 16);
    if (e.t <= ctx.currentTime && e.k === 'set') tick();
    return p;
  }
  return function patch(node) {
    if (!node) return node;
    for (var k = 0; k < __ubParamNames.length; k++) {
      var p = node[__ubParamNames[k]];
      if (!p || typeof p !== 'object' || !('value' in p) || typeof p.setTargetAtTime === 'function') continue;
      try {
        p.__ev = []; p.__on = false; p.__v = p.value; p.__t = 0;
        p.setValueAtTime = function (v, t) { begin(this); return add(this, { k: 'set', t: t, v: v }); };
        p.linearRampToValueAtTime = function (v, t) { begin(this); return add(this, { k: 'lin', t: t, v: v }); };
        p.exponentialRampToValueAtTime = function (v, t) { begin(this); return add(this, { k: 'exp', t: t, v: v }); };
        p.setTargetAtTime = function (v, t, tau) { begin(this); return add(this, { k: 'tgt', t: t, v: v, tau: Math.max(1e-4, tau) }); };
        p.setValueCurveAtTime = function (curve, t, dur) {
          begin(this); var n = curve.length;
          for (var j = 0; j < n; j++) add(this, { k: j ? 'lin' : 'set', t: t + dur * (n > 1 ? j / (n - 1) : 0), v: curve[j] });
          return this;
        };
        p.cancelScheduledValues = function (t) {
          var now = ctx.currentTime;
          if (t <= now) { var v = at(this, now); this.__ev.length = 0; this.__v = v; this.__t = now; try { this.value = v; } catch (e) { /* range */ } }
          else this.__ev = this.__ev.filter(function (e) { return e.t < t; });
          return this;
        };
        p.cancelAndHoldAtTime = p.cancelScheduledValues;
      } catch (e) { /* a frozen param: its fades are skipped */ }
    }
    return node;
  };
}
function __ubPromise(r) { return r && typeof r.then === 'function' ? r : Promise.resolve(r); }
globalThis.__ubWxAudio = function () {
  if (!wx.createWebAudioContext) return null;
  var native = wx.createWebAudioContext();
  var patch = __ubAutomate(native);
  var context = {
    get currentTime() { return native.currentTime; },
    get sampleRate() { return native.sampleRate || 44100; },
    get state() { return native.state; },
    get destination() { return native.destination; },
    noReverb: !native.createConvolver,
    resume: function () { try { return __ubPromise(native.resume()); } catch (e) { return Promise.reject(e); } },
    suspend: function () { try { return __ubPromise(native.suspend()); } catch (e) { return Promise.reject(e); } },
    decodeAudioData: function (buffer) {
      return new Promise(function (resolve, reject) {
        try { var r = native.decodeAudioData(buffer, resolve, function (e) { reject(e || new Error('decodeAudioData failed')); }); if (r && typeof r.then === 'function') r.then(resolve, reject); }
        catch (e) { reject(e); }
      });
    },
    createConvolver: function () {
      if (native.createConvolver) return patch(native.createConvolver());
      var silent = patch(native.createGain());
      silent.gain.value = 0;
      return silent;
    }
  };
  ['createBuffer', 'createBufferSource', 'createDynamicsCompressor', 'createGain', 'createBiquadFilter', 'createOscillator', 'createDelay', 'createWaveShaper', 'createPanner', 'createConstantSource', 'createAnalyser'].forEach(function (method) {
    if (typeof native[method] !== 'function') return;
    var make = native[method];
    context[method] = method === 'createBuffer' ? make.bind(native) : function () { return patch(make.apply(native, arguments)); };
  });
  // (11-18: ES2015 only in this file — the upload's compiler refused `wx.onHide?.(` 「SyntaxError: Unexpected token .」)
  if (wx.onHide) wx.onHide(function () { context.suspend().catch(function (e) { console.warn(e); }); });
  if (wx.onShow) wx.onShow(function () { context.resume().catch(function (e) { console.warn(e); }); });
  return context;
};


