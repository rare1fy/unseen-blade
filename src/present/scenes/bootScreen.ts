// 11-19 (用户：「首次进入游戏的加载画面我不希望是用竹子那个，做一个简单的黑色加载画面就行了，可以是黑色背景小刀旋转，配文字正在翻阅武功秘籍…，
// 等场景完全准备完了再渐变出来，现在会穿帮」): the first load — black, a small ring-pommel dao turning slowly in the middle, a line of pixel
// text under it. It stays fully up until the title is built and has drawn a few frames behind it, then fades away (0.6 s); nothing of the
// half-built scene shows through. Its own little scene and camera, drawn after everything else (like the loading blade).
import * as THREE from 'three';
import { toon } from '../look/toon';
import { text, textW } from '../v2/overlay';
import { PIX_H } from '../v2/pix';
import { t } from '../act/i18n';

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
camera.position.set(0, 0, 3.4); camera.lookAt(0, 0, 0);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
const black = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }));
const blade = new THREE.Group();
let caption: THREE.Mesh | null = null, capKey = '';
let state: 'off' | 'on' | 'fading' = 'off', fadeT = 0, spin = 0, last = 0, alpha = 0;

function build() {
  if (blade.children.length) return;
  scene.add(new THREE.HemisphereLight(0xfff4de, 0x202030, 1.2));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.4); key.position.set(-1.5, 2, 3); scene.add(key);
  const steel = (pts: number[][], color: number, depth: number) => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.12, bevelSize: depth * 0.08, bevelSegments: 1 }); g.translate(0, 0, -depth / 2);
    blade.add(new THREE.Mesh(g, toon(color, { rim: 1.1 })));
  };
  steel([[-0.235, 0.052], [0.28, 0.058], [0.45, 0.086], [0.555, 0.125], [0.45, 0.017], [0.31, -0.025], [-0.235, -0.035]], 0xaebdc8, 0.05);
  steel([[-0.235, -0.035], [0.31, -0.025], [0.45, 0.017], [0.555, 0.125], [0.477, -0.006], [0.32, -0.056], [-0.235, -0.059]], 0xf4efe3, 0.028);
  const box = (c: number, x: number, w: number, h: number, d: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(c)); m.position.x = x; blade.add(m); };
  box(0xd4ad68, -0.245, 0.045, 0.18, 0.12); box(0x493334, -0.385, 0.24, 0.085, 0.09);
  for (let i = 0; i < 4; i++) box(0x85513c, -0.3 - i * 0.053, 0.02, 0.094, 0.098);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.016, 6, 12), toon(0xd4ad68)); ring.position.x = -0.55; blade.add(ring);
  const tas = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), toon(0xac3427)); tas.position.set(-0.56, -0.15, 0); blade.add(tas);
  blade.scale.setScalar(0.62); blade.position.y = 0.12; scene.add(blade);
  black.renderOrder = 0;
}
/** the line under the blade, in the pixel font, on a canvas at the screen's resolution */
function paintCaption(w: number, h: number, dpr: number) {
  const words = t('正在翻阅武功秘籍…'), S = Math.max(2, Math.round(Math.min(w, h) / 200)) * dpr, key = `${words}|${w}x${h}|${S}`;
  if (key === capKey && caption) return; capKey = key;
  if (caption) { scene.remove(caption); (caption.material as THREE.MeshBasicMaterial).map?.dispose(); caption.geometry.dispose(); }
  const cw = textW(words, S) + 8 * dpr, ch = PIX_H * S + 8 * dpr;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(cw)); c.height = Math.max(1, Math.round(ch));
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; text(g, words, 4 * dpr, 4 * dpr, S, '#d9ccb2', 'left', '#000000');
  const tex = new THREE.CanvasTexture(c); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  caption = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  caption.userData.px = [cw / dpr, ch / dpr];
}
export const bootBusy = () => state !== 'off';
/** up at once, before anything else draws */
export function bootShow() { build(); state = 'on'; alpha = 1; fadeT = 0; last = 0; }
/** the scene behind is ready (built, its shaders compiled, a few frames drawn): fade out */
export function bootDone() { if (state === 'on') { state = 'fading'; fadeT = 0; } }
export function drawBoot(renderer: THREE.WebGLRenderer, w: number, h: number, now: number) {
  if (state === 'off') return;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
  if (state === 'fading') { fadeT += dt; alpha = Math.max(0, 1 - fadeT / 0.6); if (alpha <= 0) { state = 'off'; return; } }
  spin += dt * 2.4;
  blade.rotation.set(0.25 * Math.sin(spin * 0.7), spin * 0.35, -spin);
  const dpr = renderer.getPixelRatio();
  paintCaption(w, h, dpr);
  const ac = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(null);
  (black.material as THREE.MeshBasicMaterial).opacity = alpha;
  renderer.clearDepth(); renderer.render(black as unknown as THREE.Object3D, ortho);
  // the blade and the line fade with the black
  scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { const mm = m.material as THREE.Material & { opacity: number }; mm.transparent = true; mm.opacity = alpha; } });
  camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  if (caption) {
    const [cw, ch] = caption.userData.px as [number, number], vh = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * camera.position.z, k = vh / h;
    caption.scale.set(cw * k, ch * k, 1); caption.position.set(0, -0.28, 0); if (!caption.parent) scene.add(caption);
  }
  renderer.clearDepth(); renderer.render(scene, camera);
  renderer.autoClear = ac;
}
