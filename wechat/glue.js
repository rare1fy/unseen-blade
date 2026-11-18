// Native game services that the HTML entry normally supplies.
// (11-18: the WeChat devtools run the game beside a real, read-only HTMLDocument / Window — 「Cannot assign to read only property
// 'createElementNS' of object '#<HTMLDocument>'」, then 「Illegal invocation」 — while a phone has only the adapter's stand-in document. Only the stand-in is
// patched, and a global the runtime refuses to take is left alone: every name below is also a variable of this file, which is what the
// bundle after it uses.)
var document = GameGlobal.document;
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

var atob = GameGlobal.atob || function (value) {
  var bytes = new Uint8Array(wx.base64ToArrayBuffer(value));
  var parts = [];
  for (var i = 0; i < bytes.length; i += 8192) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
  }
  return parts.join('');
};

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
  wx.onHide?.(function () { context.suspend().catch(console.warn); });
  wx.onShow?.(function () { context.resume().catch(console.warn); });
  return context;
};


