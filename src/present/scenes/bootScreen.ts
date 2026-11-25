// 11-19 the first load. v1 (用户：「做一个简单的黑色加载画面……黑色背景小刀旋转，配文字正在翻阅武功秘籍…」) — the user then: 「有点丑陋，转那个刀太大了，
// 设计也比较简陋」; picked 「雪夜听声」 and the line 「雪深何处听刀声」 (agy, gemini-3.8-flash-high). v2: black, a few pixel snowflakes
// drifting down, in the middle a square ring of sound pushing out twice like a heartbeat (the cold open's rings), the line small and
// dim under it. Everything is painted on a small canvas at the art-pixel resolution and drawn up nearest-filtered, so it is pixel art
// whatever the screen. It stays fully up until the title is built and has drawn a few frames behind it, then fades away (0.6 s).
import * as THREE from 'three';
import { text, textW } from '../v2/overlay';
import { t } from '../act/i18n';

const LINE = '雪深何处听刀声';
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
let quad: THREE.Mesh | null = null, cv: HTMLCanvasElement | null = null, g: CanvasRenderingContext2D | null = null, tex: THREE.CanvasTexture | null = null;
let CW = 0, CH = 0;
let state: 'off' | 'on' | 'fading' = 'off', fadeT = 0, clock = 0, last = 0, alpha = 0;
interface Flake { x: number; y: number; v: number; s: number; a: number; ph: number }
let flakes: Flake[] = [];

function ensure(w: number, h: number, dpr: number) {
  // one art pixel ≈ 1/240 of the screen height (whole device pixels)
  const k = Math.max(1, Math.round(h * dpr / 240)), nw = Math.max(1, Math.ceil(w * dpr / k)), nh = Math.max(1, Math.ceil(h * dpr / k));
  if (cv && nw === CW && nh === CH) return;
  CW = nw; CH = nh;
  if (!cv) { cv = document.createElement('canvas'); g = cv.getContext('2d')!; }
  cv.width = CW; cv.height = CH; g!.imageSmoothingEnabled = false;
  tex?.dispose(); tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  if (!quad) quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
  (quad.material as THREE.MeshBasicMaterial).map = tex; (quad.material as THREE.MeshBasicMaterial).needsUpdate = true;
  const n = Math.round(CW * CH / 1100);
  flakes = Array.from({ length: n }, () => newFlake(true));
}
function newFlake(anywhere: boolean): Flake {
  const near = Math.random() < 0.18;
  return { x: Math.random() * CW, y: anywhere ? Math.random() * CH : -2, v: near ? 9 + Math.random() * 5 : 3 + Math.random() * 4, s: near ? 2 : 1, a: near ? 0.75 : 0.25 + Math.random() * 0.35, ph: Math.random() * 6.28 };
}
/** a one-pixel square ring, half size r, centred on (cx, cy) */
function ring(cx: number, cy: number, r: number, col: string) {
  const G = g!; G.fillStyle = col;
  G.fillRect(cx - r, cy - r, 2 * r + 1, 1); G.fillRect(cx - r, cy + r, 2 * r + 1, 1);
  G.fillRect(cx - r, cy - r + 1, 1, 2 * r - 1); G.fillRect(cx + r, cy - r + 1, 1, 2 * r - 1);
}
function paint(dt: number) {
  const G = g!; G.globalAlpha = 1; G.fillStyle = '#000000'; G.fillRect(0, 0, CW, CH);
  const cx = Math.round(CW / 2), cy = Math.round(CH / 2) - 10;
  // snow: whole-pixel positions, a slow sway
  for (const f of flakes) {
    f.y += f.v * dt; if (f.y > CH + 2) Object.assign(f, newFlake(false));
    const x = Math.round(f.x + Math.sin(clock * 0.6 + f.ph) * 2.5), y = Math.round(f.y);
    G.globalAlpha = f.a; G.fillStyle = '#d6dcea'; G.fillRect(x, y, f.s, f.s);
  }
  // the heartbeat: two rings 0.3 s apart every 2.2 s, each growing out and dimming in three steps
  const P = 2.2, life = 1.7, maxR = Math.round(Math.min(CW, CH) * 0.16);
  for (let back = 0; back < 2; back++) for (const off of [0, 0.3]) {
    const tt = (clock % P) - off + back * P; if (tt < 0 || tt > life) continue;
    const k = tt / life, r = Math.max(1, Math.round(2 + (maxR - 2) * (1 - (1 - k) ** 2)));
    const a = (off ? 0.55 : 0.8) * (k < 0.35 ? 1 : k < 0.7 ? 0.55 : 0.25);
    G.globalAlpha = a; ring(cx, cy, r, '#dfe8ff');
  }
  // the centre: a dot that lights on each beat
  const beat = clock % P, lit = beat < 0.12 || (beat > 0.3 && beat < 0.42);
  G.globalAlpha = lit ? 0.9 : 0.35; G.fillStyle = '#dfe8ff'; G.fillRect(cx - 1, cy - 1, 2, 2);
  // the line, fading in
  const words = t(LINE), lw = textW(words, 1);
  G.globalAlpha = Math.min(1, Math.max(0, (clock - 0.4) / 1.0)) * 0.85;
  text(G, words, Math.round((CW - lw) / 2), cy + maxR + 14, 1, '#9a948a', 'left', null);
  G.globalAlpha = 1;
}
export const bootBusy = () => state !== 'off';
/** debug: bring the load screen back up for a look (__dh.bootDemo(), __dh.bootDemo(false) to fade) */
export function bootDemo(on = true) { if (on) bootShow(); else bootDone(); }
/** up at once, before anything else draws */
export function bootShow() { state = 'on'; alpha = 1; fadeT = 0; last = 0; clock = 0; }
/** the scene behind is ready (built, its shaders compiled, a few frames drawn): fade out */
export function bootDone() { if (state === 'on') { if (__WX__) { state = 'off'; alpha = 0; } else { state = 'fading'; fadeT = 0; } } }
export function drawBoot(renderer: THREE.WebGLRenderer, w: number, h: number, now: number) {
  if (state === 'off') return;
  if (__WX__) {
    // On mini-games, skip per-frame Canvas2D snowflake rasterization & texture upload during the ~150 ms boot unpack.
    const ac = renderer.autoClear; renderer.autoClear = true; renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.autoClear = ac;
    return;
  }
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; clock += dt;
  if (state === 'fading') { fadeT += dt; alpha = Math.max(0, 1 - fadeT / (__WX__ ? 0.06 : 0.6)); if (alpha <= 0) { state = 'off'; return; } }
  ensure(w, h, renderer.getPixelRatio());
  paint(dt); tex!.needsUpdate = true;
  (quad!.material as THREE.MeshBasicMaterial).opacity = alpha;
  const ac = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(null);
  renderer.clearDepth(); renderer.render(quad as unknown as THREE.Object3D, ortho);
  renderer.autoClear = ac;
}
