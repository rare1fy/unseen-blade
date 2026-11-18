// Native game services that the HTML entry normally supplies.
// (11-18: the WeChat devtools run the game beside a real, read-only HTMLDocument / Window — 「Cannot assign to read only property
// 'createElementNS' of object '#<HTMLDocument>'」, then 「Illegal invocation」 — while a phone has only the adapter's stand-in document. Only the stand-in is
// patched, and a global the runtime refuses to take is left alone: every name below is also a variable of this file, which is what the
// bundle after it uses.)
var document = GameGlobal.document;

// 11-18 (act-63 on a phone: only the title drew): WeChat hands out a real WebGL2 context from getContext('webgl2') — on phones and in
// the devtools — but has no global WebGL2RenderingContext, and three.js takes a context for WebGL2 only when `typeof
// WebGL2RenderingContext !== 'undefined' && gl.constructor.name === 'WebGL2RenderingContext'`. So it ran its WebGL1 path on a WebGL2
// context and every WebGL1 extension it asked for came back null (the devtools' 「OES_vertex_array_object / EXT_blend_minmax extension
// not supported」, no instancing, no float textures, no derivatives, no depth textures). The name is this file's own variable (the bundle
// after it resolves it here), and the screen canvas's WebGL2 context is given a constructor of that name. A WebGL2 context that lacks
// WebGL2 calls (iOS reports of 「texStorage2D is not a function」) is refused, so three falls back to WebGL1 — handled by the game.
var WebGL2RenderingContext = GameGlobal.WebGL2RenderingContext || function WebGL2RenderingContext() {};
(function () {
  var cv = GameGlobal.canvas;
  if (!cv || typeof cv.getContext !== 'function') return;
  var getContext = cv.getContext;
  var wrapped = function (type, attrs) {
    var gl = getContext.call(cv, type, attrs);
    if (gl && type === 'webgl2') {
      if (typeof gl.texStorage2D !== 'function' || typeof gl.createVertexArray !== 'function' || typeof gl.texImage3D !== 'function' || typeof gl.drawArraysInstanced !== 'function') return null;
      if (!gl.constructor || gl.constructor.name !== 'WebGL2RenderingContext') {
        try { Object.defineProperty(gl, 'constructor', { value: WebGL2RenderingContext, configurable: true, writable: true }); } catch (e) { /* frozen */ }
      }
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
        var s = Array.prototype.map.call(arguments, function (a) { return a && a.stack ? a.stack : String(a); }).join(' ');
        if (/Shader Error|WebGLRenderer|WebGLProgram|TypeError|ReferenceError|SyntaxError|RangeError/.test(s)) show(s);
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

globalThis.__ubWxAudio = function () {
  if (!wx.createWebAudioContext) return null;
  var native = wx.createWebAudioContext();
  var context = {
    get currentTime() { return native.currentTime; },
    get sampleRate() { return native.sampleRate || 44100; },
    get state() { return native.state; },
    get destination() { return native.destination; },
    decodeAudioData: function (buffer) {
      return new Promise(function (resolve, reject) { native.decodeAudioData(buffer, resolve, reject); });
    },
    createConvolver: function () {
      if (native.createConvolver) return native.createConvolver();
      var silent = native.createGain();
      silent.gain.value = 0;
      return silent;
    }
  };
  for (var method of [
    'resume', 'suspend', 'createBuffer', 'createBufferSource', 'createDynamicsCompressor',
    'createGain', 'createBiquadFilter', 'createOscillator'
  ]) context[method] = native[method].bind(native);
  // (11-18: ES2015 only in this file — the upload's compiler refused `wx.onHide?.(` 「SyntaxError: Unexpected token .」)
  if (wx.onHide) wx.onHide(function () { context.suspend().catch(console.warn); });
  if (wx.onShow) wx.onShow(function () { context.resume().catch(console.warn); });
  return context;
};


