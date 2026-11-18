import { bladeBusy, runRoomBuild, withLoadingBlade } from '../scenes/loadingBlade';
import { language, t } from './i18n';
// 开始画面（docs/DESIGN.md 第二十轮 6；用户 11-17：「最后就是开始画面，再做一版吧，带、继续游戏那些的。氛围上多尝试几版，明早我来选，
// 尽量避免特写镜头，我们体素风，太近了属于自找没趣。」）：
// 几版不同的地点 / 天气 / 时段 / 构图（TITLES，网址 ?title=1…N、__dh.title(n)，开始画面上按数字键 1…N 也能切），都是远景：
// 女主角（游戏默认的白发，act-22 起是 3.5 厘米细格子的 fine_white）是画面里的一个小人，属于这片景；镜头慢慢漂，不推近。
// 左（或右）一栏：「不见刀」大标题（像素标题字，同 opening.ts），下面三块 3D 牌匾（UI 层里的实物：黑铁框、漆面、铜钉）：
// 开始游戏 / 继续游戏（没有存档时暗着）/ 设置（打开调参面板）。点、鼠标悬停、方向键 + 回车、手柄十字键 + A 都能选。
// 选定开始 / 继续：女主角拔刀，一道刀光横贯画面、穿过选中的那块牌匾，画面顺着刀口上下错开滑走，露出据点（不黑屏；拿不到画面时
// 退回竹子擦屏）。show.ts 的 startNewGame() / continueGame() 接着往下走。
// 性能：雨是一条线段网格、雪和余烬各是一组点、飞鸟三个实例化网格、雾是几张贴图面片；没有新的后期通道。
import * as THREE from 'three';
import { V3, R, onUpdate, canvasTex, camera, scene, view, precompile } from '../engine/world';
import { hitstop, shake, PAUSE } from '../engine/clock';
import { activePad } from './pad';
import { shot } from '../director';
import { applyMood, prepareStageSteps, skyMaterial, currentStage, type Ctx, type SceneDef, type Mood, type Stage } from '../scenes/stage';
import { GRADE } from '../look/post';
import { PXU } from '../look/pixel';
import { PALPHA } from '../engine/particles';
import { setStage } from '../scenes/props';
import { assemble, mirrorLayout, stageLayout } from '../asm/assemble';
import { REGISTRY, LOCALES } from '../asm/registry';
import { withExits, type ExitId } from '../asm/exits';
import { arenaPlan } from '../asm/arena';
import type { Spec } from '../asm/types';
import { HC, frame } from '../asm/hanmo/hj_temple_kit';
import { locM } from '../scenes/k_village';
import { M } from '../scenes/props';
import { BattleActor } from '../bestiary/battle';
import { CELL } from '../bestiary/kit';
import { Action, rot, type Bone } from '../actors/rig';
import { POSE_HOOKS, type PoseFn } from '../bestiary/poseHooks';
import { HEROES, motionOf } from './ninjaAct';
import { trimShadows } from './enemy';
import { pixW, PIX_H } from '../v2/pix';
import type { Overlay } from '../v2/overlay';
import type { UiLayer } from '../ui3d/layer';
import { cue } from '../../audio/cues';
import { wipeTransit } from '../scenes/transWipe';
import { dh } from '../../debug/dh';
import { Rain, Ripples, lanternPost, paintTitle, quad, place, contactShadow, stopOpening, FLASH as FLASH_NIGHT } from './opening';
import { TITLE_COUNT } from './titleFlag';

type P3 = [number, number, number];
// ================================================================== the variants
export interface TitleDef {
  id: string; name: string;
  /** the place: built with the scene assembler like a room (fight-less), on the 2x stage */
  spec: Partial<Spec> & { locale: string };
  /** the room's low walls and gate frames round the floor (asm/arena.ts), its cover pieces (well, mill, stele…) */
  walls?: boolean; cover?: boolean; exits?: ExitId[];
  /** extra dressing built with the place (puddles, debris…) */
  dress?(c: Ctx): void;
  /** the light: the place's own mood (asm/sky.ts moodFor) with these changes; stars off unless asked */
  mood(m: Mood): Mood; stars?: boolean; exposure?: number; bloomT?: number; /** colour saturation of the grade (default 1.12) */ sat?: number;
  /** where she stands (x, z) and faces; walk = she walks there from `from` at `speed` m/s first */
  hero: { at: [number, number]; yaw: number; from?: [number, number]; speed?: number; wind?: number };
  /** the camera: its base swings slowly between a and b (period s); the focus (her, at focusY) is held at screen (nx, ny);
   *  follow = a and b are offsets from her (a walking shot) */
  cam: { a: P3; b: P3; period: number; fov: number; ny: number; focusY?: number; follow?: boolean };
  /** the menu column's side (she stands in the other third) */
  ui: 'left' | 'right';
  fx: {
    rain?: { n: number; box: [number, number, number, number] }; ripples?: boolean; lantern?: [number, number, number]; lightning?: boolean;
    snow?: { n: number; box: [number, number, number, number]; col?: number };
    embers?: { n: number; box: [number, number, number, number] };
    /** chaff off the threshed fields, glinting gold, blown sideways */
    chaff?: { n: number; box: [number, number, number, number] };
    birds?: { n: number; from: P3; dir: P3; speed?: number };
    mist?: Array<{ x: number; y: number; z: number; w: number; h: number; a: number }>; mistCol?: number;
    /** a fire somewhere (a warm point light and a flicker) */
    fire?: Array<{ at: P3; col: number; i: number; d: number }>;
    /** smoke columns rising from (x, z) */
    smoke?: Array<[number, number]>;
    /** 11-18: a building burning (run-time: the flames on its vents, its smoke, the sparks; the one fire light above breathes with it) */
    blaze?: { vents: Vent[]; smoke: P3[]; sparks: Box4; n?: number };
  };
}
const mix = (a: number, b: number, k: number) => { const f = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k); return (f(16) << 16) | (f(8) << 8) | f(0); };

// ------------------------------------------------------------------ 11-18 the burning hall of title 3 (hj_temple.ts 残殿, built at the
// axis layout's landmark: centre (0, −17.6) on the 2x stage, its local frame in 7 cm cells, front toward the camera)
const HALL: [number, number] = [0, -17.6];
const hallM = (lx: number, y: number, lz: number): P3 => locM(M(HALL[0]), M(HALL[1]), 0, lx, y, lz);
/** where the fire comes out (world metres): the doorway, the window in the back wall, the broken corner of the roof, the snapped
 *  columns' rubble on the right; n tongues each, h their tallest */
const HALL_VENTS: Vent[] = [
  { ...xyz(hallM(0, 9, -32)), w: 1.7, d: 0.3, h: 2.0, n: 34 },        // the doorway (local x −14..14, up to y 40)
  { ...xyz(hallM(-55, 31, -32)), w: 0.9, d: 0.2, h: 1.3, n: 14 },     // the window (x −62..−48, y 30..44)
  { ...xyz(hallM(-36, 72, 18)), w: 1.7, d: 1.6, h: 2.6, n: 40 },      // the roof's broken front corner (x −50..−22, z 4..34)
  { ...xyz(hallM(58, 9, -6)), w: 1.2, d: 0.6, h: 1.0, n: 14 },        // the heap of tiles and the fallen beam on the right
];
function xyz(p: P3) { return { x: p[0], y: p[1], z: p[2] }; }
/** the hall burnt (static: baked with the stage in the WeChat build): the roof's front corner fallen in with charred rafters left across
 *  the gap, a window burnt through the back wall, soot over the openings, the door banner burnt to half, a bed of embers in the doorway */
function burnHall(c: Ctx) {
  const B = frame(c.w, HALL[0], HALL[1], 0);
  // the roof: its front corner at the snapped end gone, down to the beam; three charred rafters left across the gap, one dropped
  B(-50, 70, 4, -22, 96, 34, null);
  for (const z of [10, 20, 30]) B(-50, 72, z, -22, 73, z + 1, HC.char);
  B(-44, 70, 4, -42, 73, 32, HC.charL); B(-34, 8, 22, -24, 10, 24, HC.char);
  B(-50, 70, 15, -48, 85, 21, HC.char);   // a burnt king post standing in the gap
  // the window, burnt through (a dark back so it is not see-through), a lintel of charred wood, soot above
  B(-62, 30, -37, -48, 44, -34, null); B(-62, 30, -38, -48, 44, -38, HC.char); B(-64, 45, -34, -46, 46, -33, HC.char);
  B(-64, 47, -34, -46, 54, -34, HC.charL); B(-60, 55, -34, -50, 58, -34, HC.charL);
  // the doorway: soot climbing the wall over it, the banner above burnt to its upper half, embers on the sill
  B(-16, 44, -34, -11, 52, -34, HC.charL); B(11, 44, -34, 16, 52, -34, HC.charL);
  B(-10, 44, -33, 10, 51, -33, null); B(-10, 52, -33, 10, 52, -33, HC.char);
  B(-12, 8, -33, 12, 8, -29, HC.ember, 1); B(-6, 8, -28, 6, 8, -26, HC.ember, 1);
  // the right side's rubble smouldering
  B(52, 8, -8, 66, 8, -2, HC.ember, 1);
}

export const TITLES: TitleDef[] = [
  // 1 雨夜 · 残村：开场「雨夜听雨」那条夜雨里的土路，拉远——村口大槐的门楼和老树在后面的雨雾里，路边一盏斜挂的灯笼是唯一的暖光，
  //   她小小地站在灯下听雨，脚边一圈圈淡蓝声纹；偶尔一道闪电把整个村子照白一下。镜头在人眼高度上慢慢横移。
  { id: 'rain', name: '雨夜 · 残村',
    spec: { locale: 'hj_village', layout: 'axis', mirror: false, landmark: 'huaishu', season: 'summer', time: 'day', weather: 'rain', seed: 7 },
    walls: true, cover: true, exits: ['back'],
    mood: () => ({ sky: true, bg: 0x070a10, fog: 0x121926, fogD: 0.034, hemiSky: 0x44567a, hemiGround: 0x0c0e14, hemiI: 1.3, moon: 0x8094c4, moonI: 1.1, key: 0x52607e, keyI: 0.25,
      earth: [0x161c1c, 0x181e1e, 0x141a1a], mist: 0x2e3a50, mistA: 0.13, skyTop: 0x05070d, skyMid: 0x0d121e, skyHor: 0x283246, skyDisc: [-0.35, 0.5, -1], skyDiscCol: [0.16, 0.18, 0.22],
      moonPos: [-5, 13, -12], exposure: 1.4, bloomT: 1.7, glowK: 1.4 }),
    exposure: 1.4, bloomT: 1.7,
    hero: { at: [0.6, -7.5], yaw: 0.3, wind: 0.6 },
    cam: { a: [6.5, 3.0, 15], b: [3.0, 3.3, 16], period: 70, fov: 32, ny: -0.34 },
    ui: 'left',
    fx: { rain: { n: 1100, box: [-10, 12, -16, 14] }, ripples: true, lantern: [-1.9, 0, -6.9], lightning: true } },
  // 2 麦田 · 黄昏：村外割了一半的麦田，太阳正沉到社树后面，树影和她的影子长长地拖到镜头跟前（光顺着格子方向，影子边是直的）；
  //   两边麦垄发着金边，一行乌鸦从天上慢慢飞过，麦糠的金屑被晚风吹着横飘，远处村子还在冒烟。
  { id: 'wheat', name: '麦田 · 黄昏',
    spec: { locale: 'hj_field', layout: 'axis', mirror: false, landmark: 'sheshu', season: 'autumn', time: 'dusk', weather: 'clear', seed: 11 },
    walls: false, exits: ['back'],
    mood: m => ({ ...m, bg: 0x1a2440, fog: 0x6a4a48, fogD: 0.02, skyTop: 0x101c3c, skyMid: 0x4a4870, skyHor: 0xe0904c, skyDisc: [0.05, 0.03, -1], skyDiscCol: [0.7, 0.4, 0.2],
      moonPos: [0, 4, -20], moon: 0xffb050, moonI: 3.8, key: 0xffd8a8, keyI: 0.15, hemiSky: 0x5a6088, hemiGround: 0x3a2818, hemiI: 0.85, mistA: 0, earth: [0x2a2418, 0x2c2619, 0x282216] }),
    exposure: 1.1, bloomT: 1.5, sat: 1.3,
    hero: { at: [-2, -12], yaw: 3.0, wind: 0.8 },
    cam: { a: [4, 3.5, 16], b: [1.5, 3.2, 17.5], period: 80, fov: 30, ny: -0.3 },
    ui: 'right',
    fx: { birds: { n: 7, from: [-18, 13, -30], dir: [1, 0.02, 0.05], speed: 3.0 }, smoke: [[-8, -30], [9, -31]], chaff: { n: 160, box: [0, 30, -20, 4] } } },
  // 3 雪 · 破庙：冬夜落雪的破庙，院子里一层雪，她一个黑影站在甬道上。雪片慢慢斜着飘。
  //   11-18 (用户：「雪景里让背后的房子着火燃烧起来」): 她身后那座残殿烧着——火从殿门、后墙的窗、塌了一角的屋顶往外蹿，顺着风往右斜，
  //   黑烟卷上去被风带走，火星往上飘、和往下落的雪交错（冷开场那句「那年腊月，火比雪大。」）；火光是这幅冷夜里唯一的暖色。
  //   殿的焦黑、塌顶、梁架、窗洞是静态的（dress，微信出包时一起烘）；火苗、烟、火星、火光都在运行时（fx.blaze）
  { id: 'snow', name: '雪夜 · 破庙',
    spec: { locale: 'hj_temple', layout: 'axis', mirror: false, landmark: 'hj_canhall', season: 'winter', time: 'dusk', weather: 'snow', seed: 5 },
    walls: true, cover: false, exits: ['back'],
    dress: burnHall,
    mood: m => ({ ...m, bg: 0x1a2030, fog: 0x2a3446, fogD: 0.03, skyTop: 0x0c1020, skyMid: 0x1e2638, skyHor: 0x4a5468, skyDisc: [0.34, 0.07, -1], skyDiscCol: [0.3, 0.32, 0.38], hemiSky: 0x8a9ab8, hemiGround: 0x4a5060, hemiI: 1.4, moon: 0xa8b8e0, moonI: 1.6, key: 0x8090b0, keyI: 0.3, moonPos: [-8, 14, -6] }),
    exposure: 1.35, bloomT: 1.3,
    hero: { at: [0.2, -7.2], yaw: 0.15, wind: 0.35 },
    cam: { a: [-4, 2.2, 17], b: [-1.5, 2.5, 15.5], period: 76, fov: 30, ny: -0.36 },
    ui: 'right',
    fx: { snow: { n: 1300, box: [-14, 14, -22, 18] }, fire: [{ at: [0.2, 2.6, -14.6], col: 0xff7230, i: 15, d: 26 }],
      blaze: { vents: HALL_VENTS, smoke: [[-2.3, 6.4, -16.6], [0.2, 3.6, -19.6], [4.0, 2.2, -18.2]], sparks: [-8, 8, -21, -14] } } },
  // 4 晨雾 · 长路：天刚亮，雾很重，一条土路从脚下一直伸进雾里，坞堡望楼和杨树一层层淡下去；她背对着我们沿路慢慢走远。
  { id: 'dawn', name: '晨雾 · 长路',
    spec: { locale: 'hj_village', layout: 'axis', mirror: false, landmark: 'wanglou', season: 'autumn', time: 'dawn', weather: 'mist', seed: 21 },
    walls: true, exits: ['back'],
    mood: m => ({ ...m, fog: 0x4a5468, bg: 0x4a5468, fogD: 0.026, skyTop: 0x1e2840, skyMid: 0x4a5674, skyHor: 0xc89878, skyDisc: [0.12, -0.04, -1], skyDiscCol: [0.6, 0.4, 0.26], mist: 0x8a94a8, mistA: 0.04, hemiSky: 0x6a7898, hemiGround: 0x16181e, hemiI: 1.0, moon: 0xffb890, moonI: 1.4, key: 0x8a98c0, keyI: 0.3, moonPos: [0, 3, -16] }),
    exposure: 1.0, bloomT: 1.8, sat: 1.35,
    hero: { at: [0.2, -14.2], from: [0.2, 1], yaw: Math.PI, speed: 0.85, wind: 0.3 },
    cam: { a: [3.0, 2.2, 22], b: [1.4, 2.6, 21], period: 60, fov: 30, ny: -0.34, follow: true },
    ui: 'left',
    fx: { mist: [{ x: 0, y: 0.5, z: -20, w: 60, h: 2.6, a: 0.22 }, { x: 4, y: 1.4, z: -30, w: 80, h: 5, a: 0.3 }, { x: -6, y: 2.4, z: -44, w: 100, h: 9, a: 0.34 }], mistCol: 0x9aa4b8,
      birds: { n: 4, from: [30, 16, -50], dir: [-1, 0, 0.05], speed: 2.4 } } },
  // 5 余烬 · 祠堂：黄昏，村子刚烧过，祠堂塌了一头，门里的火还没灭，几处冒着黑烟，火星一点点往上飘；她背对着我们站在祠堂门前。
  //   天是暗红的。
  { id: 'embers', name: '余烬 · 祠堂',
    spec: { locale: 'hj_village', layout: 'axis', mirror: false, landmark: 'citang', season: 'autumn', time: 'dusk', weather: 'clear', seed: 3 },
    walls: true, exits: ['back'],
    mood: m => ({ ...m, bg: 0x1a1014, fog: 0x3a2224, fogD: 0.026, skyTop: 0x120c18, skyMid: 0x3a1a22, skyHor: 0xa04a2a, skyDisc: [-0.3, -0.03, -1], skyDiscCol: [0.45, 0.16, 0.08], hemiSky: 0x7a5058, hemiGround: 0x1e1214, hemiI: 1.15, moon: 0xff9a6a, moonI: 1.7, key: 0xff8a50, keyI: 0.5, moonPos: [-12, 7, -14] }),
    exposure: 1.3, bloomT: 1.2,
    hero: { at: [0, -9], yaw: Math.PI, wind: 0.2 },
    cam: { a: [1.5, 1.8, 12], b: [4.5, 2.1, 13], period: 72, fov: 30, ny: -0.3 },
    ui: 'left',
    fx: { embers: { n: 260, box: [-14, 14, -22, 4] }, smoke: [[-6, -19], [5, -20], [-14, -10]], fire: [{ at: [-3, 0.6, -17], col: 0xff6a2a, i: 4, d: 8 }, { at: [6, 0.5, -15], col: 0xff7a30, i: 3, d: 6 }] } },
];
if (TITLES.length !== TITLE_COUNT) console.warn('[title] TITLE_COUNT out of step');

// ================================================================== small pooled effects
/** points drawn as square art pixels, sized in metres (the art buffer's height from PXU), fogged like the scene */
function pointMat(size: number, additive: boolean, opacity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uSize: { value: size }, uArtH: PXU.uArtH, uOp: { value: opacity } }, fog: true, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `uniform float uSize, uArtH; attribute vec3 color; varying vec3 vC;
      #include <fog_pars_vertex>
      void main(){ vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; vC = color;
        gl_PointSize = clamp(uSize * projectionMatrix[1][1] * uArtH * 0.5 / max(0.1, -mvPosition.z), 1.0, 3.0);
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uOp; varying vec3 vC;
      #include <fog_pars_fragment>
      void main(){ gl_FragColor = vec4(vC, uOp);
        #include <fog_fragment>
      }`,
  });
}
type Box4 = [number, number, number, number];
/** snow: flakes drifting down and across, each on its own slow sway; one draw call */
class Snow {
  readonly pts: THREE.Points; private n: number; private p: Float32Array; private ph: Float32Array; private v: Float32Array; private pos: THREE.BufferAttribute;
  constructor(n: number, private box: Box4, col = 0xe8eef8) {
    this.n = n; this.p = new Float32Array(n * 3); this.ph = new Float32Array(n); this.v = new Float32Array(n);
    const g = new THREE.BufferGeometry(); this.pos = new THREE.BufferAttribute(this.p, 3); this.pos.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', this.pos);
    const c = new Float32Array(n * 3), cc = new THREE.Color(col);
    for (let i = 0; i < n; i++) { const k = 0.8 + 0.2 * Math.random(); c[i * 3] = cc.r * k; c[i * 3 + 1] = cc.g * k; c[i * 3 + 2] = cc.b * k; this.spawn(i, R(0, 9)); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.pts = new THREE.Points(g, pointMat(0.055, false, 0.9)); this.pts.frustumCulled = false; this.pts.renderOrder = 6;
  }
  private spawn(i: number, y: number) { const b = this.box; this.p[i * 3] = R(b[0], b[1]); this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = R(b[2], b[3]); this.ph[i] = R(0, 6.28); this.v[i] = R(0.55, 0.95); }
  update(dt: number, t: number) {
    const P = this.p;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3; P[i3 + 1] -= this.v[i] * dt; P[i3] += (0.35 + 0.25 * Math.sin(t * 0.6 + this.ph[i])) * dt; P[i3 + 2] += 0.12 * Math.sin(t * 0.8 + this.ph[i] * 1.7) * dt;
      if (P[i3 + 1] < 0) this.spawn(i, R(8, 9.5)); else if (P[i3] > this.box[1]) P[i3] = this.box[0];
    }
    this.pos.needsUpdate = true;
  }
  dispose() { this.pts.parent?.remove(this.pts); this.pts.geometry.dispose(); (this.pts.material as THREE.Material).dispose(); }
}
/** embers: warm sparks rising off the ruins, swaying, flickering out; additive, one draw call */
class Embers {
  /** chaff: gold glints blown along x instead of sparks rising */
  chaff = false;
  readonly pts: THREE.Points; private n: number; private p: Float32Array; private c: Float32Array; private life: Float32Array; private age: Float32Array; private ph: Float32Array;
  private pos: THREE.BufferAttribute; private col: THREE.BufferAttribute;
  /** 11-18 a burning house: sparks are born on its vents ([x, y, z, w, d]) and carried up and off downwind (+x) */
  constructor(n: number, private box: Box4, private rise?: { at: Array<[number, number, number, number, number]>; wind: number }) {
    this.n = n; this.p = new Float32Array(n * 3); this.c = new Float32Array(n * 3); this.life = new Float32Array(n); this.age = new Float32Array(n); this.ph = new Float32Array(n);
    const g = new THREE.BufferGeometry(); this.pos = new THREE.BufferAttribute(this.p, 3); this.pos.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', this.pos);
    this.col = new THREE.BufferAttribute(this.c, 3); this.col.setUsage(THREE.DynamicDrawUsage); g.setAttribute('color', this.col);
    for (let i = 0; i < n; i++) { this.spawn(i); this.age[i] = R(0, this.life[i]); }
    this.pts = new THREE.Points(g, pointMat(0.06, true)); this.pts.frustumCulled = false; this.pts.renderOrder = 7;
  }
  private spawn(i: number) {
    const b = this.box; this.age[i] = 0; this.ph[i] = R(0, 6.28);
    if (this.rise) { const v = this.rise.at[Math.floor(Math.random() * this.rise.at.length)]; this.p[i * 3] = v[0] + R(-0.5, 0.5) * v[3]; this.p[i * 3 + 1] = v[1] + R(0, 0.6); this.p[i * 3 + 2] = v[2] + R(-0.5, 0.5) * v[4]; this.life[i] = R(2.5, 5.5); return; }
    this.p[i * 3] = R(b[0], b[1]); this.p[i * 3 + 1] = R(0.1, 2.5); this.p[i * 3 + 2] = R(b[2], b[3]); this.life[i] = R(3, 7);
  }
  update(dt: number, t: number) {
    const P = this.p, C = this.c, w = this.rise?.wind ?? 0;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt; if (this.age[i] > this.life[i]) this.spawn(i);
      const i3 = i * 3, k = this.age[i] / this.life[i], ph = this.ph[i];
      if (this.chaff) { P[i3] += (0.9 + 0.5 * Math.sin(t * 0.5 + ph)) * dt; P[i3 + 1] += 0.12 * Math.sin(t * 1.1 + ph * 2) * dt; P[i3 + 2] += 0.1 * Math.sin(t * 0.7 + ph) * dt; }
      // (a fire's sparks: a hot updraught first, then the wind takes them — they drift across the falling snow)
      else if (this.rise) { P[i3] += (0.3 + 1.6 * w * k + 0.35 * Math.sin(t * 1.3 + ph)) * dt; P[i3 + 1] += (1.6 * (1 - k) + 0.3 + 0.25 * Math.sin(t * 2.1 + ph * 2)) * dt; P[i3 + 2] += 0.2 * Math.sin(t * 0.9 + ph) * dt; }
      else { P[i3] += (0.25 + 0.3 * Math.sin(t * 0.9 + ph)) * dt; P[i3 + 1] += (0.45 + 0.25 * Math.sin(t * 1.3 + ph * 2)) * dt; P[i3 + 2] += 0.15 * Math.sin(t * 0.7 + ph) * dt; }
      const fl = (0.65 + 0.35 * Math.sin(t * (this.chaff ? 4 : 9) + ph * 7)) * Math.min(1, k * 6) * (1 - k) * (1 - k);
      if (this.chaff) { C[i3] = 1.0 * fl; C[i3 + 1] = 0.78 * fl; C[i3 + 2] = 0.42 * fl; } else { C[i3] = 1.6 * fl; C[i3 + 1] = 0.62 * fl; C[i3 + 2] = 0.2 * fl; }
    }
    this.pos.needsUpdate = true; this.col.needsUpdate = true;
  }
  dispose() { this.pts.parent?.remove(this.pts); this.pts.geometry.dispose(); (this.pts.material as THREE.Material).dispose(); }
}
/** a loose line of crows crossing the sky: body and two wings, three instanced meshes, flat dark silhouettes */
class Birds {
  readonly g = new THREE.Group(); private body: THREE.InstancedMesh; private wl: THREE.InstancedMesh; private wr: THREE.InstancedMesh;
  private b: Array<{ p: THREE.Vector3; ph: number; sp: number }> = []; private dir: THREE.Vector3; private m = new THREE.Matrix4(); private w = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler();
  constructor(private n: number, private from: THREE.Vector3, dir: THREE.Vector3, private speed: number) {
    this.dir = dir.clone().normalize();
    const mat = new THREE.MeshBasicMaterial({ color: 0x16141c, fog: true });
    const bg = new THREE.BoxGeometry(0.14, 0.1, 0.42), wg = new THREE.BoxGeometry(0.42, 0.03, 0.16).translate(0.21, 0, 0.02);
    this.body = new THREE.InstancedMesh(bg, mat, n); this.wl = new THREE.InstancedMesh(wg, mat, n); this.wr = new THREE.InstancedMesh(wg.clone().scale(-1, 1, 1), mat, n);
    for (const im of [this.body, this.wl, this.wr]) { im.frustumCulled = false; this.g.add(im); }
    const side = V3(-this.dir.z, 0, this.dir.x);
    for (let i = 0; i < n; i++) this.b.push({ p: from.clone().addScaledVector(this.dir, -i * 2.2 - R(0, 1)).addScaledVector(side, (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.6).add(V3(0, R(-0.6, 0.6), 0)), ph: R(0, 6.28), sp: R(0.92, 1.08) });
  }
  update(dt: number, t: number) {
    const yaw = Math.atan2(this.dir.x, this.dir.z);
    this.b.forEach((b, i) => {
      b.p.addScaledVector(this.dir, this.speed * b.sp * dt); b.p.y += Math.sin(t * 0.7 + b.ph) * 0.12 * dt;
      // far past the view: back to the start of the line (the whole flock wraps together, a long way out of sight)
      if (b.p.clone().sub(this.from).dot(this.dir) > 95) b.p.addScaledVector(this.dir, -110);
      const flap = Math.sin(t * 7.5 * b.sp + b.ph), glide = (Math.sin(t * 0.5 + b.ph) > 0.4) ? 0.15 : 1;
      this.q.setFromEuler(this.e.set(0, yaw, 0)); this.m.compose(b.p, this.q, V3(1, 1, 1));
      this.body.setMatrixAt(i, this.m);
      for (const [im, s] of [[this.wl, 1], [this.wr, -1]] as const) { this.w.makeRotationZ(s * (0.15 + 0.55 * flap * glide)); this.w.setPosition(s * 0.06, 0.03, 0); im.setMatrixAt(i, this.m.clone().multiply(this.w)); }
    });
    for (const im of [this.body, this.wl, this.wr]) im.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.g.parent?.remove(this.g); this.body.geometry.dispose(); this.wl.geometry.dispose(); this.wr.geometry.dispose(); (this.body.material as THREE.Material).dispose(); }
}
/** soft mist banks: wide planes with a smooth noise of big soft blobs, turned to the camera, drifting sideways */
let MIST_TEX: THREE.Texture | null = null;
function mistTex() {
  if (MIST_TEX) return MIST_TEX;
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  MIST_TEX = canvasTex(256, 64, g => {
    for (let i = 0; i < 40; i++) {
      const x = rnd() * 256, y = 20 + rnd() * 24, r = 18 + rnd() * 30;
      for (const dx of [-256, 0, 256]) { const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 64); }
    }
    // fade out at the top and the bottom
    g.globalCompositeOperation = 'destination-in'; const v = g.createLinearGradient(0, 0, 0, 64); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.35, 'rgba(0,0,0,1)'); v.addColorStop(0.7, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = v; g.fillRect(0, 0, 256, 64);
  });
  MIST_TEX.wrapS = THREE.RepeatWrapping; return MIST_TEX;
}
class Mist {
  readonly g = new THREE.Group(); private ms: THREE.Mesh[] = [];
  constructor(list: NonNullable<TitleDef['fx']['mist']>, col: number) {
    list.forEach((b, i) => {
      const t = mistTex().clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.repeat.set(b.w / 30, 1); t.offset.x = i * 0.37;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: t, color: col, transparent: true, opacity: b.a, depthWrite: false, fog: true }));
      m.position.set(b.x, b.y, b.z); m.renderOrder = 5; this.g.add(m); this.ms.push(m);
    });
  }
  update(dt: number) {
    this.ms.forEach((m, i) => { const map = (m.material as THREE.MeshBasicMaterial).map!; map.offset.x += dt * (0.004 + 0.002 * i) * (i % 2 ? -1 : 1); m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z) * 0.5; });
  }
  dispose() { this.g.parent?.remove(this.g); for (const m of this.ms) { m.geometry.dispose(); const mt = m.material as THREE.MeshBasicMaterial; mt.map?.dispose(); mt.dispose(); } }
}
/** smoke columns: stacked soft grey quads drifting up and leaning with the wind (additive-free, faint) */
let PUFF_TEX: THREE.Texture | null = null;
class Smoke {
  readonly g = new THREE.Group(); private puffs: Array<{ m: THREE.Sprite; base: THREE.Vector3; t: number; life: number }> = [];
  constructor(spots: Array<[number, number]>, col: number) {
    PUFF_TEX ??= canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    for (const [x, z] of spots) for (let i = 0; i < 9; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: PUFF_TEX, color: col, transparent: true, opacity: 0, depthWrite: false, fog: true }));
      m.renderOrder = 4; this.g.add(m); this.puffs.push({ m, base: V3(x, 1.5, z), t: i / 9 * 14, life: 14 });
    }
  }
  update(dt: number) {
    for (const p of this.puffs) {
      p.t = (p.t + dt) % p.life; const k = p.t / p.life;
      p.m.position.set(p.base.x + k * k * 6, p.base.y + k * 11, p.base.z - k * 2); p.m.scale.setScalar(1.6 + k * 5.5);
      (p.m.material as THREE.SpriteMaterial).opacity = 0.62 * Math.min(1, k * 5) * (1 - k);
    }
  }
  dispose() { this.g.parent?.remove(this.g); for (const p of this.puffs) p.m.material.dispose(); }
}
/**
 * 11-18 (用户：「雪景里让背后的房子着火燃烧起来」): a building on fire, all of it moving at run time (the WeChat build bakes the title's still
 * scenery, never this). Three pools, one draw each:
 *  - tongues: upright blocks of flame standing on each vent (a door, a window, a roof breach), each climbing, swelling and thinning to
 *    nothing on its own loop, leaning downwind; their colour runs white-gold at the root → orange → deep red at the tip, squared off
 *    (whole boxes, never a round glow);
 *  - smoke: dark grey blocks rolling up off the roof, growing, carried off downwind, fading;
 *  - sparks: points rising off the fire, swaying, carried downwind and higher than the smoke, flickering out — they cross the falling snow.
 * The light is the title's one fire light (count unchanged: no shader recompiles), pulsing with the fire — slow swells, no strobe.
 */
type Vent = { x: number; y: number; z: number; w: number; d: number; h: number; n: number };
/** instanced blocks with a colour (and for smoke an opacity) each: aCol = rgb, a. solid = the flame blocks (opaque, unlit, drawn like
 *  the braziers' flames — they go out by shrinking, never by turning into a dark brick); fade = the smoke (fades to nothing) */
function blockMat(solid: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog }, fog: true, transparent: !solid, depthWrite: solid, toneMapped: false,
    vertexShader: `attribute vec4 aCol; varying vec4 vC;
      #include <fog_pars_vertex>
      void main(){ vC = aCol; vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec4 vC;
      #include <fog_pars_fragment>
      void main(){ gl_FragColor = vec4(vC.rgb, ${solid ? '1.0' : 'vC.a'});
        #include <fog_fragment>
      }`,
  });
}
class Blaze {
  readonly g = new THREE.Group(); private tongues: THREE.InstancedMesh; private smoke: THREE.InstancedMesh; private sparks: Embers;
  private T: Array<{ v: Vent; ox: number; oz: number; ph: number; sp: number; s: number; h: number }> = [];
  private S: Array<{ x: number; y: number; z: number; age: number; life: number; s: number; vx: number }> = [];
  private tc: THREE.InstancedBufferAttribute; private scol: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private p = V3(); private sc = V3(); private c = new THREE.Color();
  private hot = new THREE.Color(1.15, 0.72, 0.28); private mid = new THREE.Color(1.0, 0.34, 0.07); private tip = new THREE.Color(0.42, 0.06, 0.02);
  constructor(vents: Vent[], private wind: number, private smokeAt: P3[], sparkBox: Box4, sparks = 170) {
    for (const v of vents) for (let i = 0; i < v.n; i++) this.T.push({ v, ox: R(-0.5, 0.5) * v.w, oz: R(-0.5, 0.5) * v.d, ph: R(0, 1), sp: R(0.9, 1.5), s: R(0.7, 1.1), h: R(0.6, 1) });
    // the flame blocks: a unit box standing on its base
    this.tongues = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), blockMat(true), this.T.length);
    this.tc = new THREE.InstancedBufferAttribute(new Float32Array(this.T.length * 4), 4); this.tc.setUsage(THREE.DynamicDrawUsage); this.tongues.geometry.setAttribute('aCol', this.tc);
    this.tongues.frustumCulled = false; this.tongues.renderOrder = 3; this.g.add(this.tongues);
    // smoke: dark blocks, a fixed number recycled
    const n = smokeAt.length * 14;
    for (let i = 0; i < n; i++) { const [x, y, z] = smokeAt[i % smokeAt.length]; this.S.push({ x, y, z, age: R(0, 9), life: R(8, 10), s: R(0.7, 1.2), vx: R(0.8, 1.2) }); }
    this.smoke = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMat(false), n);
    this.scol = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.scol.setUsage(THREE.DynamicDrawUsage); this.smoke.geometry.setAttribute('aCol', this.scol);
    this.smoke.frustumCulled = false; this.smoke.renderOrder = 4; this.g.add(this.smoke);
    this.sparks = new Embers(sparks, sparkBox, { at: vents.map(v => [v.x, v.y + v.h * 0.4, v.z, v.w, v.d] as [number, number, number, number, number]), wind });
    this.g.add(this.sparks.pts);
  }
  /** how bright the fire is now (about 0.8..1.2): two slow waves and a small faster one — the light breathes with the flames, no strobe */
  level(t: number) { return 1 + 0.1 * Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1) + 0.06 * Math.sin(t * 4.1 + 2) + 0.03 * Math.sin(t * 9.3); }
  update(dt: number, t: number) {
    const w = this.wind, drift = 0.25 + 0.5 * w;
    // tongues: a flame is a stream of upright blocks (never turned: 横平竖直), each born at the vent's root and on its own loop (k 0 → 1)
    // climbing, drifting downwind (+x), shrinking to nothing and cooling — white-gold at the root, orange, then deep red at the tip
    this.T.forEach((f, i) => {
      const v = f.v, k = (t * f.sp * 0.8 + f.ph) % 1, gust = 0.8 + 0.2 * Math.sin(t * 2.3 + f.ph * 6);
      const life = 1 - k, wid = (0.1 + 0.16 * f.s) * Math.min(1, 0.4 + v.w * 0.5) * (0.25 + 0.75 * life), hgt = wid * (1.6 + 1.2 * f.h) * (0.6 + 0.4 * gust);
      this.p.set(v.x + f.ox * (1 - 0.5 * k) + k * k * v.h * drift + 0.04 * Math.sin(t * 6 + f.ph * 9), v.y + k * v.h * f.h * gust, v.z + f.oz * (1 - 0.5 * k));
      this.q.identity(); this.sc.set(wid, hgt, wid * 0.85); this.m.compose(this.p, this.q, this.sc); this.tongues.setMatrixAt(i, this.m);
      if (k < 0.25) this.c.copy(this.hot).lerp(this.mid, k / 0.25); else this.c.copy(this.mid).lerp(this.tip, Math.min(1, (k - 0.25) / 0.6));
      this.tc.setXYZW(i, this.c.r, this.c.g, this.c.b, 1);
    });
    this.tongues.instanceMatrix.needsUpdate = true; this.tc.needsUpdate = true;
    // smoke: up and off downwind, swelling; the lowest puffs a little lit by the fire under them; square to the world like everything else
    this.S.forEach((s, i) => {
      s.age += dt; if (s.age > s.life) { const [x, y, z] = this.smokeAt[i % this.smokeAt.length]; Object.assign(s, { x: x + R(-0.6, 0.6), y, z: z + R(-0.4, 0.4), age: 0, life: R(8, 10), s: R(0.7, 1.2), vx: R(0.8, 1.2) }); }
      const k = s.age / s.life, rise = s.age * (0.9 - 0.3 * k);
      this.p.set(s.x + s.age * s.age * 0.05 * (0.6 + w) * s.vx + s.age * 0.25, s.y + rise, s.z - s.age * 0.12);
      const size = s.s * (0.4 + 1.9 * k); this.q.identity(); this.sc.set(size, size * 0.75, size);
      this.m.compose(this.p, this.q, this.sc); this.smoke.setMatrixAt(i, this.m);
      const a = Math.min(1, k * 6) * (1 - k) * 0.42, lit = Math.max(0, 1 - k * 3);
      // (moonlit grey a little under the sky's horizon, so the column reads as smoke, not cloud; warm where the fire is under it)
      this.scol.setXYZW(i, 0.15 + 0.3 * lit, 0.15 + 0.1 * lit, 0.18 - 0.06 * lit, a);
    });
    this.smoke.instanceMatrix.needsUpdate = true; this.scol.needsUpdate = true;
    this.sparks.update(dt, t);
  }
  dispose() { this.g.parent?.remove(this.g); for (const im of [this.tongues, this.smoke]) { im.geometry.dispose(); (im.material as THREE.Material).dispose(); im.dispose(); } this.sparks.dispose(); }
}

// ================================================================== the menu: plaques in the UI layer
// A plaque: a black iron frame round a lacquered panel, bronze end caps with a rivet each, the name in the pixel title font on the
// face. Selected: it slides a little toward the centre and comes forward, the face turns warm gold, the frame breathes an ember glow,
// a small bronze ring-pommel (环首) points at it. Disabled (继续游戏 with no save): darker, the name grey.
interface Item { id: string; label: string; enabled: boolean }
export const IRON_D = 0x1a1b20, IRON = 0x34363e, LACQ = 0x2a1310, LACQ_L = 0x3e1c16, BRONZE = 0xb07a3a, BRONZE_D = 0x6a4622;
export function mergeBoxes(list: Array<{ w: number; h: number; d: number; x: number; y: number; z: number; c: number }>) {
  const gs: THREE.BufferGeometry[] = [], col = new THREE.Color(); let n = 0;
  for (const b of list) { const g = new THREE.BoxGeometry(b.w, b.h, b.d).translate(b.x, b.y, b.z).toNonIndexed(); const k = g.attributes.position.count, cs = new Float32Array(k * 3); col.setHex(b.c); for (let i = 0; i < k; i++) cs.set([col.r, col.g, col.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(cs, 3)); g.deleteAttribute('uv'); gs.push(g); n += k; }
  const out = new THREE.BufferGeometry(), P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3); let at = 0;
  for (const g of gs) { const k = g.attributes.position.count; P.set(g.attributes.position.array as Float32Array, at * 3); N.set(g.attributes.normal.array as Float32Array, at * 3); C.set(g.attributes.color.array as Float32Array, at * 3); at += k; g.dispose(); }
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}
/** the plaque body in units of its width (1 × PH), front face toward +z */
const PH = 0.22;
function plaqueBody() {
  const W = 1, H = PH, b: Parameters<typeof mergeBoxes>[0] = [];
  b.push({ w: W, h: H, d: 0.05, x: 0, y: 0, z: 0, c: IRON_D });                               // the iron back frame
  b.push({ w: W - 0.03, h: 0.02, d: 0.06, x: 0, y: H / 2 - 0.012, z: 0.004, c: IRON });       // lit upper lip
  b.push({ w: W - 0.08, h: H - 0.05, d: 0.056, x: 0, y: 0, z: 0.006, c: LACQ });            // the lacquer panel
  b.push({ w: W - 0.08, h: 0.018, d: 0.058, x: 0, y: H / 2 - 0.036, z: 0.006, c: LACQ_L });  // its lit top band
  for (const s of [-1, 1]) {
    b.push({ w: 0.05, h: H + 0.04, d: 0.07, x: s * (W / 2 + 0.005), y: 0, z: 0.004, c: BRONZE_D });   // the bronze end caps
    b.push({ w: 0.05, h: 0.02, d: 0.072, x: s * (W / 2 + 0.005), y: (H + 0.04) / 2 - 0.01, z: 0.004, c: BRONZE });
    b.push({ w: 0.03, h: 0.03, d: 0.08, x: s * (W / 2 - 0.035), y: 0, z: 0.01, c: BRONZE });      // a rivet inside each cap
  }
  return new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xff7a2a, emissiveIntensity: 0 }));
}
/** the ring-pommel marker: a square bronze ring, a short grip, the stub of a blade (axis-aligned blocks) pointing right */
export function pommel() {
  const b: Parameters<typeof mergeBoxes>[0] = [];
  const s = 0.07;   // the ring (a square of bronze), the wrapped grip, a small iron guard, a long straight blade with a lit edge
  b.push({ w: s * 4, h: s, d: s, x: -s * 6.5, y: s * 1.5, z: 0, c: BRONZE }, { w: s * 4, h: s, d: s, x: -s * 6.5, y: -s * 1.5, z: 0, c: BRONZE_D }, { w: s, h: s * 4, d: s, x: -s * 8, y: 0, z: 0, c: BRONZE });
  b.push({ w: s * 4, h: s * 1.2, d: s, x: -s * 2.5, y: 0, z: 0, c: 0x3a2a22 }, { w: s * 0.8, h: s * 2.6, d: s * 1.4, x: s * 0.2, y: 0, z: 0, c: IRON });
  b.push({ w: s * 9, h: s * 1.3, d: s * 0.5, x: s * 5.2, y: 0, z: 0, c: 0x9aa0aa }, { w: s * 9, h: s * 0.45, d: s * 0.55, x: s * 5.2, y: -s * 0.45, z: 0, c: 0xe0e4ea }, { w: s, h: s * 0.9, d: s * 0.5, x: s * 10.2, y: s * 0.2, z: 0, c: 0xc8ccd4 });
  return new THREE.Mesh(mergeBoxes(b), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffb060, emissiveIntensity: 0.15 }));
}
const TXT = { on: '#d9ccb2', sel: '#ffd88a', off: '#6a625c', line: '#0a0708' };
class Plaque {
  root = new THREE.Group(); private body = plaqueBody(); private face: THREE.Mesh; private texs: Record<'on' | 'sel' | 'off', THREE.CanvasTexture | null> = { on: null, sel: null, off: null };
  x = 0; y = 0; w = 200; selK = 0; inK = 0; flash = 0; private key = '';
  constructor(private L: UiLayer, public item: Item) {
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    this.face.position.z = 0.036; this.root.add(this.body, this.face); this.root.userData.noTilt = true; L.scene.add(this.root);
  }
  get h() { return this.w * PH; }
  /** paint the name for the current size (device px), three states */
  private paint() {
    const label = t(this.item.label), L = this.L, k = L.dpr, fw = this.w * 0.86, fh = this.h * 0.7, key = `${label}${fw.toFixed(0)}x${fh.toFixed(0)}@${k}`;
    if (key === this.key) return; this.key = key;
    const track = 1, width = pixW(label) + track * (label.length - 1);
    const ideal = Math.round(fh * 0.62 * k / PIX_H), S = Math.max(1, language === 'en' ? Math.min(ideal, Math.floor((fw * k - 6) / width)) : ideal);
    const o = Math.max(1, Math.round(S * 0.25)), tw = width * S;
    const cw = Math.round(fw * k), ch = Math.round(fh * k);
    for (const st of ['on', 'sel', 'off'] as const) {
      this.texs[st]?.dispose();
      this.texs[st] = canvasTex(cw, ch, g => { g.imageSmoothingEnabled = false; paintTitle(g, label, Math.round((cw - tw) / 2), Math.round((ch - PIX_H * S) / 2), S, track, TXT[st], TXT.line, o); }) as THREE.CanvasTexture;
      const t = this.texs[st]!; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    }
    this.face.scale.set(0.86, 0.7 * PH, 1);
  }
  update(dt: number, t: number, sel: boolean, side: 1 | -1) {
    const L = this.L; this.paint();
    this.selK += ((sel ? 1 : 0) - this.selK) * Math.min(1, dt * 12); this.flash = Math.max(0, this.flash - dt * 2.5);
    const st = !this.item.enabled ? 'off' : sel ? 'sel' : 'on', mt = this.face.material as THREE.MeshBasicMaterial;
    if (mt.map !== this.texs[st]) { mt.map = this.texs[st]; mt.needsUpdate = true; }
    // slide in from the side (inK 0 → 1), the selected one a little toward the centre and forward
    const e = this.inK * this.inK * (3 - 2 * this.inK), off = (1 - e) * (this.w * 0.9 + 40) * -side;
    const x = this.x + off + side * this.selK * this.w * 0.06, z = this.selK * 3 + this.flash * 4;
    L.at(x, this.y, z, this.root.position); this.root.scale.setScalar(L.px(this.w));
    // a slight turn toward the screen centre (the 3D of the plaque), a slow sway; the selected one squares up
    this.root.rotation.set(-0.05 + Math.sin(t * 0.8 + this.y * 0.02) * 0.02, side * 0.16 * (1 - 0.6 * this.selK) + Math.sin(t * 0.6 + this.y * 0.03) * 0.025, 0);
    const bm = this.body.material as THREE.MeshLambertMaterial;
    bm.color.setScalar(this.item.enabled ? 1 : 0.55);
    bm.emissiveIntensity = (this.item.enabled ? this.selK * (0.035 + 0.02 * Math.sin(t * 3)) : 0) + this.flash * 0.35;
    mt.opacity = e; this.root.visible = e > 0.01;
  }
  hit(x: number, y: number, gap: number) { return Math.abs(x - this.x) < this.w / 2 + 6 && Math.abs(y - this.y) < this.h / 2 + gap / 2; }
  dispose() { this.root.parent?.remove(this.root); this.body.geometry.dispose(); (this.body.material as THREE.Material).dispose(); this.face.geometry.dispose(); (this.face.material as THREE.Material).dispose(); for (const t of Object.values(this.texs)) t?.dispose(); }
}

// ================================================================== the screen
export interface TitleHost {
  ov: Overlay; L: UiLayer;
  /** is there a save to continue (profile.ts hasSave) */
  hasSave(): boolean;
  /** build the next place under the frozen picture: a new game or the saved one (show.ts startNewGame / continueGame) */
  enter(kind: 'new' | 'continue'): void | Promise<void>;
  /** 设置: the tuning panel */
  settings(): void;
}
let running: Title | null = null;
export function titleDefinition(index: number): SceneDef {
  const d = TITLES[index - 1];
  setStage(true);
  const spec: Spec = { layout: 'axis', mirror: false, landmark: null, season: 'autumn', time: 'dusk', weather: 'clear', seed: 7, ...d.spec, exits: d.exits ?? [] };
  if (d.walls) {
    const lb = REGISTRY.layouts[spec.layout] ?? Object.values(LOCALES).flatMap(l => l.extraLayouts ?? []).find(l => l.id === spec.layout)!;
    const layout = withExits(spec.mirror ? mirrorLayout(stageLayout(lb)) : stageLayout(lb), spec.exits ?? []);
    const plan = arenaPlan(layout, (spec.exits ?? []) as ExitId[], spec.seed, spec.locale, 'calm');
    plan.props = []; if (!d.cover) plan.covers = [];
    spec.arena = plan;
  }
  const { def } = assemble(spec, REGISTRY);
  return { ...def, pack: `title-${d.id}`,
    *buildSteps(c) {
      if (def.buildSteps) yield* def.buildSteps(c); else def.build(c);
      d.dress?.(c);
    },
  };
}
/** Resolves once the selected menu and its backdrop can be rendered. */
export function playTitle(n: number, host: TitleHost) {
  stopOpening(); running?.stop();
  const index = Math.max(1, Math.min(TITLES.length, Math.round(n) || 1));
  const prepared = runRoomBuild(prepareStageSteps(titleDefinition(index)));
  const show = (p: import('../scenes/stage').PreparedStage) => { running = new Title(index, host, p.attach()); };
  if (prepared instanceof Promise) return prepared.then(show);
  show(prepared);
}
/** show.ts pointer(): the title takes the pointer while it is up */
export function titlePointer(type: string, x: number, y: number) { return running ? running.pointer(type, x, y) : false; }
export const titleRunning = () => !!running;
/** act-40: put the title away now (a new game that opens on black cards changes no stage, which used to take the title down) */
export function stopTitle() { running?.stop(); }
onUpdate((dt, rdt) => running?.update(dt, rdt));

/** captures: a fixed framing (__dh.tCam([x,y,z], [fx,fy,fz], nx, ny, fov) / __dh.tCam(null)); the walk jumped to its end */
const T_QA: { cam: { base: THREE.Vector3; focus: THREE.Vector3; nx: number; ny: number; fov: number } | null; noGrab: boolean } = { cam: null, noGrab: false };
dh.add({
  tCam: (b: number[] | null, f?: number[], nx = 0, ny = 0, fov = 34) => { T_QA.cam = b ? { base: V3(b[0], b[1], b[2]), focus: V3(f![0], f![1], f![2]), nx, ny, fov } : null; },
  tHero: (x: number, z: number, yaw?: number) => running?.moveHero(x, z, yaw),
  tInfo: () => running && running.info(),
  tPick: (i: number) => running?.pick(i),
  tGo: () => running?.confirm(),
  tNoGrab: (on = true) => { T_QA.noGrab = on; },
  /** look-dev: change the light of the variant on show (Mood fields), the exposure / bloom threshold */
  tMood: (m: Partial<Mood>, exposure?: number, bloomT?: number, sat?: number) => running?.retint(m, exposure, bloomT, sat),
  /** captures: run the title's clock ahead (the walk, the camera drift) */
  tSkip: (s: number) => running?.skip(s),
});

type Beat = 'menu' | 'confirm' | 'draw' | 'cut' | 'split' | 'done';
const TITLE = '不见刀', INK = '#e8ece8', LINE = '#0a0d12';
const MENU: Item[] = [{ id: 'new', label: '开始游戏', enabled: true }, { id: 'cont', label: '继续游戏', enabled: false }, { id: 'set', label: '设置', enabled: true }];
const ASK: Item[] = [{ id: 'yes', label: '重新开始', enabled: true }, { id: 'no', label: '返回', enabled: true }];
const ASK_NOTE = '原有进度将尽数清空';

class Title {
  readonly done: Promise<void>; private resolve!: () => void;
  readonly def: TitleDef; beat: Beat = 'menu'; t = 0; private bt = 0; private alive = true;
  private stage: Stage; private hero: BattleActor; private blob: THREE.Mesh; private heroAt = V3(); private walkFrom: THREE.Vector3 | null = null; private walkK = 0;
  private hookId: string; private baseHook: PoseFn | undefined;
  private rain: Rain | null = null; private rip: Ripples | null = null; private lamp: ReturnType<typeof lanternPost> | null = null; private snow: Snow | null = null; private embers: Embers | null = null;
  private birds: Birds | null = null; private mist: Mist | null = null; private smoke: Smoke | null = null; private fires: THREE.PointLight[] = []; private blaze: Blaze | null = null; private crackle = 2;
  private glint: THREE.Mesh | null = null;
  private flashT = -1; private flashK = 0; private nextFlash = 6; private mood: Mood;
  private shadowSave: { l: number; r: number; t: number; b: number } | null = null; private satSave = 1.12;
  // the overlay title, the cut line, the frozen picture
  private tex: THREE.CanvasTexture | null = null; private titleM: THREE.Mesh | null = null; private noteTex: THREE.CanvasTexture | null = null; private noteM: THREE.Mesh | null = null;
  private lay = { x: 0, y: 0, w: 1, h: 1, key: '', cx: 0, top: 0 };
  private titleA = 0; private line: THREE.Mesh[] = []; private slabs: THREE.Mesh[] = []; private frame: THREE.CanvasTexture | null = null; private grab = false; private grabbed = false; private cutY = 0;
  // the menu
  private items: Item[]; private plaques: Plaque[] = []; private sel = 0; private menuK = 0; private marker: THREE.Mesh; private markerK = 0; private gap = 10;
  private choice: 'new' | 'continue' = 'new'; private padPrev = { up: false, down: false, ok: false, back: false }; private padRep = 0;
  private onKey = (e: KeyboardEvent) => this.key(e);
  constructor(private n: number, private host: TitleHost, stage: Stage) {
    this.def = TITLES[n - 1];
    this.done = new Promise(r => (this.resolve = r));
    const d = this.def;
    // ---- the place
    this.stage = stage;
    const def = stage.def;
    this.mood = d.mood({ ...def.mood, earth: [...def.mood.earth] });
    this.setMood(this.mood);
    GRADE.exposure = d.exposure ?? this.mood.exposure ?? GRADE.exposure; if (d.bloomT != null) GRADE.bloomThreshold = d.bloomT; this.satSave = GRADE.sat; GRADE.sat = d.sat ?? GRADE.sat;
    // the sun's shadows cover the whole wide view (restored at the end)
    const sun = scene.children.find(o => (o as THREE.DirectionalLight).isDirectionalLight && (o as THREE.DirectionalLight).castShadow) as THREE.DirectionalLight | undefined;
    if (sun) { const c = sun.shadow.camera; this.shadowSave = { l: c.left, r: c.right, t: c.top, b: c.bottom }; Object.assign(c, { left: -24, right: 24, top: 24, bottom: -20 }); c.updateProjectionMatrix(); }
    // ---- her: the slim 斗笠 the game wears by default, standing (or walking in) on the road
    this.hero = new BattleActor(HEROES.find(d => d.id === 'fine_white') ?? HEROES[0]); trimShadows(this.hero.root, 7);
    this.heroAt.set(d.hero.at[0], 0, d.hero.at[1]);
    if (d.hero.from) { this.walkFrom = V3(d.hero.from[0], 0, d.hero.from[1]); this.hero.place(this.walkFrom.clone(), d.hero.yaw); }
    else { this.hero.place(this.heroAt.clone(), d.hero.yaw); const hold = new Action('noto', 1e6, 2); hold.t = 0.97e6; this.hero.play(hold); }
    this.hookId = this.hero.hid; this.baseHook = POSE_HOOKS[this.hookId];
    const base = this.baseHook, a = this.hero;
    if (base) POSE_HOOKS[this.hookId] = (b, t, act, off, self) => { base(b, t, act, off, self); if (self === a) this.pose(b, t); };
    this.blob = contactShadow(); this.blob.position.set(this.heroAt.x, 0.02, this.heroAt.z); this.stage.root.add(this.blob);
    // ---- the weather and the light
    const fx = d.fx, root = this.stage.root;
    if (fx.rain) { const l = fx.lantern, warm = l ? V3(l[0] + 10.5 * CELL, l[1] + 28 * CELL, l[2]) : V3(0, -100, 0); this.rain = new Rain(fx.rain.n, { x0: fx.rain.box[0], x1: fx.rain.box[1], z0: fx.rain.box[2], z1: fx.rain.box[3] }, warm); root.add(this.rain.lines); }
    if (fx.ripples) { this.rip = new Ripples({ at: this.heroAt, r: [0.4, 0.7] }); root.add(this.rip.mesh); }
    if (fx.lantern) {
      this.lamp = lanternPost(); this.lamp.g.position.set(fx.lantern[0], fx.lantern[1], fx.lantern[2]); root.add(this.lamp.g);
      this.glint = wetGlint(); this.glint.position.set(fx.lantern[0] + 10.5 * CELL, 0.015, fx.lantern[2]); root.add(this.glint);
    }
    if (fx.snow) { this.snow = new Snow(fx.snow.n, fx.snow.box, fx.snow.col); root.add(this.snow.pts); }
    if (fx.embers) { this.embers = new Embers(fx.embers.n, fx.embers.box); root.add(this.embers.pts); }
    else if (fx.chaff) { this.embers = new Embers(fx.chaff.n, fx.chaff.box); this.embers.chaff = true; root.add(this.embers.pts); }
    if (fx.birds) { this.birds = new Birds(fx.birds.n, V3(...fx.birds.from), V3(...fx.birds.dir), fx.birds.speed ?? 3); root.add(this.birds.g); }
    if (fx.mist) { this.mist = new Mist(fx.mist, fx.mistCol ?? 0xffffff); root.add(this.mist.g); }
    if (fx.smoke) { this.smoke = new Smoke(fx.smoke, d.id === 'embers' ? 0x241a1c : 0x5a4a50); root.add(this.smoke.g); }
    for (const f of fx.fire ?? []) { const l = new THREE.PointLight(f.col, f.i, f.d, 1.6); l.position.set(...f.at); root.add(l); this.fires.push(l); }
    if (fx.blaze) { this.blaze = new Blaze(fx.blaze.vents, d.hero.wind ?? 0.5, fx.blaze.smoke, fx.blaze.sparks, fx.blaze.n); root.add(this.blaze.g); }
    // the stage's own drifting motes would read as speckle in the rain / snow: the alpha pool sits the title out (back at the end)
    if (fx.rain || fx.snow) PALPHA.mesh.visible = false;
    // ---- the camera
    shot('title', t => this.cam(t), { cut: true });
    // ---- the menu
    this.items = MENU.map(it => ({ ...it, enabled: it.id === 'cont' ? host.hasSave() : it.enabled }));
    this.sel = this.items[1].enabled ? 1 : 0;
    this.buildMenu();
    this.marker = pommel(); this.marker.userData.noTilt = true; host.L.scene.add(this.marker); this.marker.visible = false;
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.onKey);
    host.ov.after.push(this.after);
  }
  private buildMenu() { for (const p of this.plaques) p.dispose(); this.plaques = this.items.map(it => new Plaque(this.host.L, it)); }
  /** the place's mood, the stars wiped out of the sky unless the variant keeps them (the opening's trick: the sky's gradient scaled
   *  up and the whole dome tinted down by the same factor) */
  private setMood(m: Mood, to?: Mood, k = 0) {
    applyMood(m, to, k);
    if (this.def.stars) return;
    const u = skyMaterial().uniforms, K = 0.004;
    for (const n of ['uTop', 'uMid', 'uHor', 'uMoonCol']) (u[n].value as THREE.Color).multiplyScalar(1 / K);
    (u.uTint.value as THREE.Color).setScalar(K);
  }
  // ---------------------------------------------------------------- the camera: wide, a slow swing, she held in her third
  private cam(t: number) {
    const q = T_QA.cam, d = this.def.cam;
    const focus = q ? q.focus.clone() : this.hero.home.clone().add(V3(0, d.focusY ?? 1.0, 0));
    const k = 0.5 - 0.5 * Math.cos((t / d.period) * Math.PI * 2), a = V3(...d.a), b = V3(...d.b);
    const base = q ? q.base.clone() : a.lerp(b, k).add(d.follow ? V3(this.hero.home.x, 0, this.hero.home.z) : V3());
    return frameOn(base, focus, q ? q.nx : this.def.ui === 'left' ? 0.34 : -0.34, q ? q.ny : d.ny, q ? q.fov : d.fov);
  }
  /** on top of the held 收刀 pose: standing tall, the face lifted, turning now and then to listen; the wind in the blindfold's tails */
  private pose(b: Record<string, Bone>, t: number) {
    const walking = !!this.walkFrom && this.walkK < 1, wind = this.def.hero.wind ?? 0.5;
    // walking in, the blade stays in its scabbard: the drawn blade the locomotion holds is folded down to the grip in her hand
    if (this.walkFrom && this.beat !== 'draw' && this.beat !== 'cut') b.weapon?.scale.setZ(0.06);
    if (!walking) {
      const ls = Math.sin(t * 0.45) * 0.5 + Math.sin(t * 0.17 + 2) * 0.5;
      if (!this.walkFrom) b.weapon?.scale.setZ(0.6);
      rot(b.chest, -0.06, 0, 0); rot(b.neck, -0.16, 0.12 * ls, 0); rot(b.head, -0.1, 0.16 * ls, 0.08 * ls);
    }
    const gust = (0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.31 + 1.3)) * (0.4 + wind);
    for (const [names, ph] of [[['bfA1', 'bfA2', 'bfA3'], 0], [['bfB1', 'bfB2', 'bfB3'], 1.7]] as Array<[string[], number]>) names.forEach((nm, i) => {
      if (!b[nm]) return; const w = Math.sin(t * 5.2 - i * 1.1 + ph) * (0.06 + 0.1 * gust) * (1 + 0.4 * i);
      rot(b[nm], (i === 0 ? 0.16 : 0.05) * gust + w * 0.5, 0, Math.sin(t * 3.1 - i * 0.8 + ph) * 0.06 * (0.5 + gust) + (i === 0 ? 0.12 * gust : 0));
    });
  }
  // ---------------------------------------------------------------- the frame
  update(dt: number, rdt: number) {
    if (!this.alive) return;
    // another place was built over this one (__dh.opening(), __dh.scene… while the title is up): the title steps aside
    if ((this.beat === 'menu' || this.beat === 'confirm') && currentStage() !== this.stage) { this.stop(); return; }
    this.t += rdt; this.bt += rdt;
    const d = this.def, a = this.hero, frozen = this.beat === 'cut' || this.beat === 'split';
    if (this.beat !== 'split' && this.beat !== 'done') {
      // the walk in: along the road at a slow pace, the stride from the shared locomotion (ninjaAct run()), then she stands
      if (this.walkFrom && this.walkK < 1) {
        const L = this.walkFrom.distanceTo(this.heroAt), sp = d.hero.speed ?? 1, m = motionOf(a);
        this.walkK = Math.min(1, this.walkK + dt * sp / Math.max(0.1, L));
        const slow = Math.min(1, (1 - this.walkK) * L / 1.2);
        a.home.lerpVectors(this.walkFrom, this.heroAt, this.walkK); m.run = this.walkK < 1 ? 0.2 * Math.max(0.3, slow) : 0; m.phase += sp * Math.max(0.3, slow) * 2.9 * dt;
        a.yaw = Math.atan2(this.heroAt.x - this.walkFrom.x, this.heroAt.z - this.walkFrom.z);
        if (this.walkK >= 1) { m.run = 0; }
      }
      this.blob.position.set(a.home.x, 0.02, a.home.z);
      this.aimSun(a.home.x, a.home.z - 4);
      a.update(dt);
      this.rain?.update(dt, this.flashK, (x, z) => { const q = Math.hypot(x - a.home.x, z - a.home.z); if (q < 3.6) this.rip?.spawn(x, z); });
      this.rip?.update(dt, this.flashK);
      if (this.glint) { const g = this.glint, cp = camera.position; g.rotation.y = Math.atan2(cp.x - g.position.x, cp.z - g.position.z); (g.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 + Math.sin(this.t * 7.3) * 0.06) + this.flashK * 0.2; }
      if (this.lamp) { const s = this.lamp.swing; s.rotation.z = 0.2 + Math.sin(this.t * 0.9) * 0.05 + Math.sin(this.t * 2.3) * 0.015; s.rotation.x = Math.sin(this.t * 0.7 + 1) * 0.04; this.lamp.light.intensity = 5.2 * (1 + Math.sin(this.t * 7.3) * 0.05 + Math.sin(this.t * 17) * 0.03); }
      if (!frozen) { this.snow?.update(dt, this.t); this.embers?.update(dt, this.t); this.blaze?.update(dt, this.t); }
      this.birds?.update(rdt, this.t); this.mist?.update(rdt); this.smoke?.update(rdt);
      // the fire light: a burning house breathes (blaze.level: slow swells), a brazier flickers
      const lv = this.blaze?.level(this.t);
      this.fires.forEach((l, i) => { l.intensity = (d.fx.fire![i].i) * (lv ?? (1 + Math.sin(this.t * 8 + i * 3) * 0.12 + Math.sin(this.t * 19 + i) * 0.06)); });
      // now and then the fire's crackle (the oil-fire samples), quiet under the music, only while the menu is up
      if (this.blaze && this.beat === 'menu') { this.crackle -= rdt; if (this.crackle <= 0) { this.crackle = 3.5 + Math.random() * 4; cue('fire', 0); } }
      // the lightning: now and then, a hard flash, a dip, a second flicker, then it ebbs; the thunder a moment later
      if (d.fx.lightning && this.beat === 'menu') {
        this.nextFlash -= rdt; if (this.nextFlash <= 0) { this.nextFlash = 9 + Math.random() * 8; this.flashT = 0; setTimeout(() => { if (this.alive) cue('thunder', 0.5); }, 400 + Math.random() * 700); }
      }
      if (this.flashT >= 0) {
        this.flashT += rdt; const f = this.flashT;
        this.flashK = f < 0.04 ? f / 0.04 : f < 0.1 ? 1 - (f - 0.04) / 0.06 * 0.75 : f < 0.15 ? 0.25 + (f - 0.1) / 0.05 * 0.55 : Math.max(0, 0.8 * Math.pow(Math.max(0, 1 - (f - 0.15) / 0.55), 2));
        this.flashK *= 0.7; this.setMood(this.mood, { ...this.mood, ...FLASH_NIGHT, earth: this.mood.earth }, this.flashK); GRADE.flash = this.flashK * 0.05; GRADE.flashCol.setRGB(0.82, 0.88, 1);
        if (f > 0.75) { this.flashT = -1; this.flashK = 0; this.setMood(this.mood); GRADE.flash = 0; }
      }
    }
    this.pad(rdt);
    if (this.beat === 'draw') {
      if (this.bt > 0.16) { this.beat = 'cut'; this.bt = 0; hitstop(0.5); shake(0.2); cue('ultSlash', 1); }
    }
    if (this.beat === 'cut') {
      if (this.bt > 0.42 && !this.grab && !this.frame) this.grab = true;
      if (this.frame) this.split();
    }
    if (this.beat === 'split') {
      if (this.holdF > 0) { if (this.holdF === 3) precompile(); this.holdF--; this.bt = 0; } else this.slide();
    }
    this.layout(); this.drawOverlay(rdt); this.drawMenu(rdt);
  }
  // ---------------------------------------------------------------- the overlay title (and the note over the confirm)
  private layout() {
    const ov = this.host.ov, W = ov.w, H = ov.h, k = ov.dpr, key = `${W}x${H}@${k}/${language}`;
    if (key === this.lay.key) return;
    this.lay.key = key;
    // the column: a fifth in from the side; the title a sixth of the screen tall, a whole number of device px per font px
    const label = language === 'en' ? t(TITLE).toUpperCase() : TITLE, track = language === 'en' ? 1 : 3;
    const width = pixW(label) + track * (label.length - 1);
    const S = language === 'en' ? Math.max(1, Math.floor(Math.min(H * k / 70, W * k * 0.35 / width))) : Math.max(3, Math.round(Math.min(H * 0.15, W * 0.26 / 3.6) * k / PIX_H));
    const o = Math.max(1, Math.round(S * 0.18)), pad = 2 * o;
    const cw = width * S + pad * 2, ch = PIX_H * S + pad * 2;
    this.tex?.dispose(); this.tex = canvasTex(cw, ch, g => { g.imageSmoothingEnabled = false; paintTitle(g, label, pad, pad, S, track, INK, LINE, o); }, { nearest: true }) as THREE.CanvasTexture;
    if (this.titleM) { ov.scene.remove(this.titleM); this.titleM.geometry.dispose(); (this.titleM.material as THREE.Material).dispose(); }
    this.titleM = quad(this.tex, 0, 1, 90); ov.scene.add(this.titleM);
    const colW = Math.max(cw / k, Math.min(300, W * 0.22)), cx = this.def.ui === 'left' ? Math.max(W * 0.21, colW / 2 + 28) : Math.min(W * 0.79, W - colW / 2 - 28);
    Object.assign(this.lay, { cx, w: cw / k, h: ch / k, x: Math.round(cx - cw / k / 2), y: Math.round(H * 0.22 - ch / k / 2), top: H * 0.22 + ch / k / 2 });
    // the plaques: under the title, a column
    const pw = Math.max(150, Math.min(270, W * 0.17)), gap = Math.max(8, pw * PH * 0.34); this.gap = gap;
    const y0 = Math.max(this.lay.top + H * 0.1, H * 0.5) + pw * PH / 2;
    this.plaques.forEach((p, i) => { p.w = pw; p.x = cx; p.y = y0 + i * (pw * PH + gap); });
    this.noteKey = '\0';   // re-place the note (if any) on the next frame
  }
  private noteKey = '';
  private drawOverlay(rdt: number) {
    if (this.beat === 'split' || this.beat === 'done') return;
    const L = this.lay;
    // the title fades in slowly once the place has settled (from 0.6 s, over 2.4 s), rising a few pixels
    this.titleA = Math.min(1, this.titleA + (this.t > 0.6 ? rdt / 2.4 : 0));
    const ta = this.titleA * this.titleA * (3 - 2 * this.titleA), rise = (1 - ta) * 8;
    if (this.titleM) { place(this.titleM, L.x, L.y + rise, L.w, L.h); const mt = this.titleM.material as THREE.MeshBasicMaterial; mt.opacity = ta * (1 - this.menuK); mt.color.setScalar(1 + this.flashK * 0.3); }
    // the note over the confirm (small, under the title)
    const want = this.beat === 'confirm' ? t(ASK_NOTE) : '';
    if (want !== this.noteKey) {
      this.noteKey = want; const ov = this.host.ov, k = ov.dpr;
      if (this.noteM) { ov.scene.remove(this.noteM); this.noteM.geometry.dispose(); (this.noteM.material as THREE.Material).dispose(); this.noteM = null; } this.noteTex?.dispose(); this.noteTex = null;
      if (want) {
        const HS = Math.max(1, Math.round(Math.max(14, Math.min(20, ov.h * 0.032)) * k / PIX_H)), ho = Math.max(1, Math.round(HS * 0.5)), hw = pixW(want) * HS + ho * 4, hh = PIX_H * HS + ho * 4;
        this.noteTex = canvasTex(hw, hh, g => { g.imageSmoothingEnabled = false; paintTitle(g, want, ho * 2, ho * 2, HS, 0, '#c8c0b0', LINE, ho); }, { nearest: true }) as THREE.CanvasTexture;
        this.noteM = quad(this.noteTex, 0, 1, 90); ov.scene.add(this.noteM);
        const p0 = this.plaques[0]; place(this.noteM, Math.round(L.cx - hw / k / 2), Math.round((p0 ? p0.y - p0.h / 2 : ov.h * 0.5) - hh / k - 10), hw / k, hh / k);
      }
    }
    // the cut line: a white core in a pale glow, opening from the middle out to both edges through the chosen plaque
    if (this.beat === 'cut') {
      this.ensureLine(); const W = this.host.ov.w, [core, , inner, outer] = this.line, wk = 1 - Math.pow(1 - Math.min(1, this.bt / 0.07), 3), fade = this.bt < 0.25 ? 1 : Math.max(0.6, 1 - (this.bt - 0.25) * 1.2);
      const lw = W * wk, lx = (W - lw) / 2, th = Math.max(2, Math.round(this.host.ov.h / 240));
      for (const m of [core, inner, outer]) m.visible = true;
      place(core, lx, this.cutY - th / 2, lw, th); place(inner, lx, this.cutY - th * 2, lw, th * 4); place(outer, lx, this.cutY - th * 6, lw, th * 12);
      (core.material as THREE.MeshBasicMaterial).opacity = fade; (inner.material as THREE.MeshBasicMaterial).opacity = 0.42 * fade; (outer.material as THREE.MeshBasicMaterial).opacity = 0.12 * fade;
    }
  }
  private ensureLine() {
    if (this.line.length) return;
    const mk = (c: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: c, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })); m.renderOrder = 96; this.host.ov.scene.add(m); return m; };
    this.line = [mk(0xf6faff), mk(0xf6faff), mk(0xffe4b0), mk(0xffc070)];
  }
  // ---------------------------------------------------------------- the menu
  private drawMenu(rdt: number) {
    if (this.beat === 'split' || this.beat === 'done') return;
    const side: 1 | -1 = this.def.ui === 'left' ? 1 : -1, live = (this.beat === 'menu' || this.beat === 'confirm') && !PAUSE.menu;
    this.menuK += ((PAUSE.menu ? 1 : 0) - this.menuK) * Math.min(1, rdt * 10);
    this.plaques.forEach((p, i) => {
      const at = 1.6 + i * 0.14;
      // (back from the settings page: they slide in again rather than pop)
      if (live) p.inK = Math.min(Math.min(1, Math.max(0, (this.t - at) / 0.5)), Math.max(p.inK, p.inK + rdt * 4));
      else if (i !== this.sel || PAUSE.menu) p.inK = Math.max(0, p.inK - rdt * 4);   // the way in: the others slide away, the chosen one stays for the cut
      p.update(rdt, this.t, i === this.sel, side);
    });
    // the ring-pommel points at the selected plaque from the outer side, bobbing
    const p = this.plaques[this.sel], L = this.host.L;
    this.markerK += ((live && p && p.inK > 0.9 ? 1 : 0) - this.markerK) * Math.min(1, rdt * 10);
    this.marker.visible = this.markerK > 0.02;
    if (p) {
      const mx = p.x + side * p.w * 0.06 - side * (p.w / 2 + p.h * 0.75 + Math.sin(this.t * 3.2) * 3);
      L.at(mx, p.y, 6, this.marker.position); this.marker.scale.setScalar(L.px(p.h * 0.95) * this.markerK);
      this.marker.rotation.set(0, side > 0 ? 0 : Math.PI, Math.sin(this.t * 1.7) * 0.06);
    }
  }
  private move(d: number) {
    if (this.beat !== 'menu' && this.beat !== 'confirm') return;
    const n = this.items.length; let i = this.sel;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (this.items[i].enabled) break; }
    if (i !== this.sel) { this.sel = i; cue('tick', 0.4); }
  }
  pick(i: number) { if (this.items[i]?.enabled) this.sel = i; }
  confirm() {
    if (this.beat === 'menu' && this.t < 0.3) return;
    const it = this.items[this.sel]; if (!it) return;
    if (!it.enabled) { cue('deny', 0.4); return; }
    const p = this.plaques[this.sel]; if (p) p.flash = 1;
    if (this.beat === 'menu') {
      if (it.id === 'set') { cue('select', 0.5); this.host.settings(); return; }
      if (it.id === 'new' && this.host.hasSave()) { cue('select', 0.5); this.ask(true); return; }
      this.go(it.id === 'cont' ? 'continue' : 'new');
    } else if (this.beat === 'confirm') {
      if (it.id === 'yes') this.go('new'); else { cue('deselect', 0.5); this.ask(false); }
    }
  }
  /** the confirm before a new game wipes the save: the menu gives way to 重新开始 / 返回 */
  private ask(on: boolean) {
    this.beat = on ? 'confirm' : 'menu'; this.items = on ? ASK.map(x => ({ ...x })) : MENU.map(it => ({ ...it, enabled: it.id === 'cont' ? this.host.hasSave() : it.enabled }));
    this.sel = on ? 1 : 0; this.buildMenu(); for (const p of this.plaques) p.inK = 0.4; this.lay.key = ''; this.t = Math.max(this.t, 3);
  }
  // ---------------------------------------------------------------- input: pointer (show.ts hands it over), keys, a gamepad
  private downAt = -1;
  pointer(type: string, x: number, y: number) {
    if (bladeBusy()) return;
    if (this.beat !== 'menu' && this.beat !== 'confirm') return true;
    const i = this.plaques.findIndex(p => p.inK > 0.5 && p.hit(x, y, this.gap));
    if (type === 'move') { if (i >= 0 && this.items[i].enabled && i !== this.sel) { this.sel = i; cue('tick', 0.3); } return false; }
    if (type === 'down') { this.downAt = i; if (i >= 0 && this.items[i].enabled) this.sel = i; return i >= 0; }
    if (type === 'up') { const was = this.downAt; this.downAt = -1; if (i >= 0 && i === was) { this.sel = i; this.confirm(); } return i >= 0; }
    return false;
  }
  private key(e: KeyboardEvent) {
    if (bladeBusy()) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || PAUSE.menu) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') { e.preventDefault(); this.move(-1); }
    else if (k === 'arrowdown' || k === 's') { e.preventDefault(); this.move(1); }
    else if (k === 'enter' || k === ' ' || k === 'j') { e.preventDefault(); this.confirm(); }
    else if ((k === 'escape' || k === 'backspace') && this.beat === 'confirm') { e.preventDefault(); cue('deselect', 0.5); this.ask(false); }
    else if (__DEBUG_UI__ && /^[1-9]$/.test(k) && +k <= TITLES.length && +k !== this.n && this.beat === 'menu') { e.preventDefault(); dh.api.title && (dh.api.title as (n: number) => void)(+k); }
  }
  private pad(rdt: number) {
    const gp = activePad();
    if (!gp) return;
    const ay = gp.axes[1] ?? 0, up = !!gp.buttons[12]?.pressed || ay < -0.5, down = !!gp.buttons[13]?.pressed || ay > 0.5, ok = !!gp.buttons[0]?.pressed || !!gp.buttons[9]?.pressed, back = !!gp.buttons[1]?.pressed;
    if (PAUSE.menu) { this.padPrev = { up, down, ok, back }; return; }   // the settings page is over the menu: it has the pad
    this.padRep -= rdt;
    if ((up && (!this.padPrev.up || this.padRep <= 0))) { this.move(-1); this.padRep = this.padPrev.up ? 0.16 : 0.4; }
    if ((down && (!this.padPrev.down || this.padRep <= 0))) { this.move(1); this.padRep = this.padPrev.down ? 0.16 : 0.4; }
    if (ok && !this.padPrev.ok) this.confirm();
    if (back && !this.padPrev.back && this.beat === 'confirm') { cue('deselect', 0.5); this.ask(false); }
    this.padPrev = { up, down, ok, back };
  }
  // ---------------------------------------------------------------- the way in: she draws, the cut runs through the choice, the picture splits
  private go(kind: 'new' | 'continue') {
    this.choice = kind;
    if (__WX__) {
      this.beat = 'done';
      void withLoadingBlade(() => {
        this.hideOverlay(); this.restore(); return this.host.enter(kind);
      }).finally(() => this.finish());
      return;
    }
    this.beat = 'draw'; this.bt = 0;
    // (her draw-cut is a few pixels at this distance and its trail froze into a glowing blob under the cut's hit-stop: the cut is
    //  the screen's, she only flashes with it)
    const a = this.hero; this.walkK = 1; motionOf(a).run = 0; a.tint(0xe8f0ff, 0.6);
    cue('draw', 1); cue('swishHeavy', 0.6);
    const p = this.plaques[this.sel]; this.cutY = p ? p.y : this.host.ov.h * 0.5;
  }
  /** the picture of the frame just drawn (overlay after-hook): taken once, the frame the cut stands still in */
  private after = (r: THREE.WebGLRenderer) => {
    if (!this.grab || this.frame) return;
    this.grab = false;
    try {
      const src = r.domElement as HTMLCanvasElement, ov = this.host.ov, k = Math.min(2, src.width / Math.max(1, ov.w));
      const c = document.createElement('canvas'); c.width = Math.round(ov.w * k); c.height = Math.round(ov.h * k);
      const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(src, 0, 0, c.width, c.height);
      let lit = 0; for (let i = 1; i < 5; i++) for (let j = 1; j < 5; j++) { const px = g.getImageData(Math.floor(c.width * i / 5), Math.floor(c.height * j / 5), 1, 1).data; lit = Math.max(lit, px[0], px[1], px[2]); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; this.frame = t;
      this.grabbed = lit > 6 && !T_QA.noGrab;
    } catch (e) { console.error('[title] frame grab failed', e); this.grabbed = false; this.frame = new THREE.CanvasTexture(document.createElement('canvas')); }
  };
  private holdF = 0;
  private split() {
    this.beat = 'split'; this.bt = 0;
    const ov = this.host.ov, W = ov.w, H = ov.h, c = this.cutY, v = 1 - c / H;
    if (!this.grabbed) {
      // no picture to split: the stage's own wipe carries it over instead — never a black frame
      this.beat = 'done';
      void wipeTransit(() => { this.hideOverlay(); this.restore(); try { this.host.enter(this.choice); } catch (e) { console.error('[title] enter failed', e); } }).then(() => this.finish());
      return;
    }
    const up = quad(this.frame!, v, 1, 95), dn = quad(this.frame!, 0, v, 95);
    place(up, 0, 0, W, c); place(dn, 0, c, W, H - c); ov.scene.add(up, dn); this.slabs = [up, dn];
    this.hideOverlay(); this.restore();
    try { this.host.enter(this.choice); } catch (e) { console.error('[title] enter failed', e); }
    // act-34 (用户：「卡住半天才揭开」): the halves wait three frames before they part: in the first the new place's shaders are compiled
    // (enter() puts the place up a moment later, after its await), the first renders upload its meshes behind them — then nothing
    // in the way stalls the slide
    this.holdF = 3;
    cue('swishHeavy', 0.7);
  }
  private slide() {
    const ov = this.host.ov, W = ov.w, H = ov.h, c = this.cutY, k = Math.min(1, Math.max(0, (this.bt - 0.1) / 0.75)), e = k * k * (3 - 2 * k) * 0.35 + k * k * k * 0.65;
    const [up, dn] = this.slabs;
    if (up && dn) { place(up, 0, -e * (c + 8), W, c); place(dn, 0, c + e * (H - c + 8), W, H - c); }
    const edgeA = Math.max(0, 1 - this.bt / 0.6);
    this.ensureLine(); const [l0, l1] = this.line;
    if (l0 && l1) { l0.visible = l1.visible = edgeA > 0.01; place(l0, 0, c - e * (c + 8) - 2, W, 2); place(l1, 0, c + e * (H - c + 8), W, 2); for (const l of [l0, l1]) (l.material as THREE.MeshBasicMaterial).opacity = edgeA; }
    if (k >= 1) this.finish();
  }
  private hideOverlay() { for (const m of [this.titleM, this.noteM, ...this.line]) if (m) m.visible = false; for (const p of this.plaques) p.root.visible = false; this.marker.visible = false; }
  // ---------------------------------------------------------------- debug / captures
  /** the shadow-casting light from the mood's direction (moonPos), its shadow box centred on (x, z): the act's followShadow keeps
   *  one fixed direction for the fights, a title wants its own low sun */
  private aimSun(x: number, z: number) {
    const sun = scene.children.find(o => (o as THREE.DirectionalLight).isDirectionalLight && (o as THREE.DirectionalLight).castShadow) as THREE.DirectionalLight | undefined;
    if (!sun) return; const mp = this.mood.moonPos ?? [-6, 14, -10], k = 30 / Math.hypot(...mp);
    sun.target.position.set(x, 0, z); sun.position.set(x + mp[0] * k, mp[1] * k, z + mp[2] * k); sun.target.updateMatrixWorld();
  }
  retint(m: Partial<Mood>, exposure?: number, bloomT?: number, sat?: number) { Object.assign(this.mood, m); this.setMood(this.mood); if (exposure != null) GRADE.exposure = exposure; if (bloomT != null) GRADE.bloomThreshold = bloomT; if (sat != null) GRADE.sat = sat; }
  moveHero(x: number, z: number, yaw?: number) { this.heroAt.set(x, 0, z); this.walkFrom = null; this.hero.home.copy(this.heroAt); if (yaw != null) this.hero.yaw = yaw; }
  skip(s: number) { for (let i = 0; i < Math.round(s * 30); i++) this.update(1 / 30, 1 / 30); }
  info() { return { n: this.n, id: this.def.id, beat: this.beat, t: +this.t.toFixed(2), sel: this.items[this.sel]?.id, items: this.items.map(i => `${i.label}${i.enabled ? '' : '(off)'}`), hero: this.hero.home.toArray().map(v => +v.toFixed(2)), cam: camera.position.toArray().map(v => +v.toFixed(2)) }; }
  // ---------------------------------------------------------------- the end
  /** the act's world takes over: give back the pose hook, the grade, the shadows and the motes; the place's effects go */
  private restore() {
    if (this.baseHook) POSE_HOOKS[this.hookId] = this.baseHook;
    GRADE.flash = 0; GRADE.sat = this.satSave; PALPHA.clear(); PALPHA.mesh.visible = true;
    const sun = scene.children.find(o => (o as THREE.DirectionalLight).isDirectionalLight && (o as THREE.DirectionalLight).castShadow) as THREE.DirectionalLight | undefined;
    if (sun && this.shadowSave) { const c = sun.shadow.camera, s = this.shadowSave; Object.assign(c, { left: s.l, right: s.r, top: s.t, bottom: s.b }); c.updateProjectionMatrix(); this.shadowSave = null; }
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKey);
    this.glint?.parent?.remove(this.glint); this.glint = null;
    this.rain?.dispose(); this.rip?.dispose(); this.snow?.dispose(); this.embers?.dispose(); this.birds?.dispose(); this.mist?.dispose(); this.smoke?.dispose(); this.blaze?.dispose();
    this.rain = null; this.rip = null; this.snow = null; this.embers = null; this.birds = null; this.mist = null; this.smoke = null; this.blaze = null;
    this.hero.dispose();
    for (const p of this.plaques) p.dispose(); this.plaques = [];
    this.marker.parent?.remove(this.marker); this.marker.geometry.dispose(); (this.marker.material as THREE.Material).dispose();
  }
  private finish() {
    if (this.beat === 'done' && !this.alive) return;
    this.beat = 'done'; this.alive = false;
    const ov = this.host.ov;
    for (const m of [this.titleM, this.noteM, ...this.line, ...this.slabs]) if (m) { ov.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.titleM = this.noteM = null; this.line = []; this.slabs = [];
    this.tex?.dispose(); this.noteTex?.dispose(); this.frame?.dispose();
    const i = ov.after.indexOf(this.after); if (i >= 0) ov.after.splice(i, 1);
    if (running === this) running = null;
    this.resolve();
  }
  /** stop without the way in (another variant, __dh.title again): everything goes; the next stage replaces this one */
  stop() {
    if (!this.alive) return;
    if (this.beat !== 'split' && this.beat !== 'done') { this.hideOverlay(); this.restore(); }
    this.finish();
  }
}

// ------------------------------------------------------------------ helpers
/** the lantern on the wet road: a soft warm streak of reflected light stretched toward the lens (turned to it every frame) */
let GLINT_TEX: THREE.Texture | null = null;
function wetGlint() {
  GLINT_TEX ??= canvasTex(32, 128, g => { const gr = g.createRadialGradient(16, 64, 0, 16, 64, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.setTransform(1, 0, 0, 4, 0, -192); g.fillStyle = gr; g.fillRect(0, 0, 32, 128 * 4); });
  const geo = new THREE.PlaneGeometry(0.7, 3.6).rotateX(-Math.PI / 2).translate(0, 0, 1.5);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: GLINT_TEX, color: 0xff9a50, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, toneMapped: false }));
  m.renderOrder = 3; return m;
}
/** a camera at base that holds the focus point at screen (nx, ny) (NDC, y up) with this vertical fov (director.ts narrows it to
 *  0.86 on a landscape screen; the same here so the framing lands where asked on any aspect) */
export function frameOn(base: THREE.Vector3, focus: THREE.Vector3, nx: number, ny: number, fov: number) {
  const asp = view.w / Math.max(1, view.h), f = fov * (asp < 0.8 ? 1 : 0.86) * Math.PI / 180, th = Math.tan(f / 2);
  const d = focus.clone().sub(base), yawF = Math.atan2(d.x, -d.z), pitchF = Math.atan2(d.y, Math.hypot(d.x, d.z));
  const yaw = yawF - Math.atan(nx * asp * th), pitch = pitchF - Math.atan(ny * th);
  const look = base.clone().add(V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(10));
  return { base, look, fov };
}
