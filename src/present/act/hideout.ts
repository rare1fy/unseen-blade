import { finishBuild } from '../engine/buildSteps';
// 据点「嵩山南麓 · 断碑古窑」（docs/STORY.md §6）：主角每局死了被拖回来、醒在孙媪的草席上的地方，局外的人都在这里。
// 镜头从前上方看（和房间一样），所以高的东西放后面、矮的放前面：
//   后排正中：塌了半边的青砖拱窑，前半截窑顶塌了（天光 / 雨从塌口落下），塌口里铺着砖，半地下铁炉烧着暗红炭火，冯铁臂在铁砧前打铁；
//   窑右：北墙前立着刻名的复仇碑（碑由游戏放在 HIDEOUT.stele，主角看不见、用手摸字；旁边一方供台，一碗香灰一支蜡）；
//   再右是孙媪的药角（靠墙的草棚、药罐架、晾药的竿、药炉、草席）；
//   左边：试剑坪（夯实的土坪、七根挂铜铃的木桩，留着三个木人桩和四块召唤石板的位置），后面上土台的石阶，桓越坐在最下一级；
//   右边：窑底暗渠流出来的水渠，卢昭倚着渠边的栏杆站在竹影里；
//   前排：杜五的锅灶、黑篷车和灰驴、矮院墙、院门（出发的路）。山脚两三层夯土台地，竹子在后面。
// 第一章只有杜五、孙媪、冯铁臂在（卢昭、桓越后几章才来）：他们的位置空着也成景（石阶上一坛酒一只碗，栏杆和竹影）。
// 和房间一样用 showStage(hideoutScene(...), { combat: true }) 显示；HIDEOUT 是给游戏代码用的摆位约定（地面、出生点、各人站位、复仇碑、
// 木人桩和召唤石板的位置、出口线、碰撞体）。调试：__dh.hideout(time?, weather?, view?)、__dh.hideoutSolids(on?)。
import * as THREE from 'three';
import { VoxWorld } from '../look/voxkit';
import { scene, V3, onUpdate } from '../engine/world';
import { showStage, currentStage, followShadow, type Ctx, type SceneDef, type Stage } from '../scenes/stage';
import { M, PLAY, hash, mix as mixC } from '../scenes/props';
import { CELL } from '../bestiary/kit';
import { moodFor, lampFor, weatherAmbient } from '../asm/sky';
import { HV, smoke, jar } from '../asm/hanmo/hj_village_kit';
import { wattleZ } from '../asm/hanmo/hj_village_props';
import { grove } from '../asm/ninja/wilds_kit';
import { oak, deadTree } from '../scenes/flora';
import { surface } from '../scenes/dress';
import { loc } from '../scenes/k_village';
import { BattleActor } from '../bestiary/battle';
import { trimShadows } from './enemy';
import { dh } from '../../debug/dh';
import type { ActShow } from './show';
import { HIDEOUT_PEOPLE, HIDEOUT_DONKEY, FENG_STRIKE } from './hideout_people';
import { K, kiln, forge, anvil, bladeRack, bladeWall, RACK_RAILS, trough, coalBasket, northWall, offering, logStack, herbCorner, mat, medStove, lowTable, bellPost, steps, terrace, culvert, channel, railing, cart, feed, cookFire, practiceRack, stoneLock, lantern, frontGate, pigeon, recolor, brickAt, strawCluster, stoneCluster, terraceRuin, cliffOutcrop, forgeSupply, campSupply } from './hideout_kit';
export { HIDEOUT_PEOPLE } from './hideout_people';

export type HideoutTime = 'dusk' | 'night' | 'dawn' | 'day';
export type HideoutWeather = 'clear' | 'rain' | 'mist' | 'snow';
type PersonId = 'duwu' | 'sunao' | 'fengtiebi' | 'luzhao' | 'huanyue';
/** a collision shape on the floor (metres): an axis-aligned box (half sizes) or a circle */
export type HideoutSolid = { shape: 'box'; x: number; z: number; hx: number; hz: number } | { shape: 'circle'; x: number; z: number; r: number };

/** the layout contract (metres; x right, z toward the camera, yaw 0 = facing the camera) */
export const HIDEOUT: {
  floor: { x0: number; x1: number; z0: number; z1: number };
  spawn: [number, number];
  people: Record<PersonId, { x: number; z: number; yaw: number }>;
  stele: { x: number; z: number; yaw: number };
  list: { x: number; z: number };
  dummies: Array<[number, number]>;
  slabs: Array<[number, number]>;
  exit: { x0: number; x1: number; z: number };
  solids: HideoutSolid[];
} = {
  // the walkable floor: from the kiln's bay and the north wall at the back into the gate at the front (the front wall either side of
  // the gate is in `solids`, so past z ≈ 6.7 only the gate's opening is open)
  floor: { x0: -8, x1: 8, z0: -8, z1: 7.4 },
  // on 孙媪's straw mat, where the heroine wakes
  spawn: [6.45, -6.1],
  people: {
    duwu: { x: 4.35, z: 4.05, yaw: -0.55 },          // between his cook-fire and the donkey, by the cart, near the gate
    sunao: { x: 7.7, z: -6.05, yaw: -1.25 },          // at the head of the mat, the medicine stove behind her
    fengtiebi: { x: 0.3, z: -7.4, yaw: 0.3 },         // in the kiln's bay, at the anvil (the anvil is built under his strike)
    luzhao: { x: 7.35, z: -1.4, yaw: -1.1 },          // at the rail by the water channel, the bamboo behind her (from chapter 2)
    huanyue: { x: -6.5, z: -7.31, yaw: 0.25 },        // sitting on the bottom step (seat 0.35 m up; place the actor at ground level)
  },
  // the carved revenge stele (the game builds it, 1.33 × 0.75 m, its face toward +z): its middle, backed against the north wall where
  // the wall's apron of pavers is, ~1 m of clear floor in front of it; the offering stand beside it on the right
  // (act-37: moved right from 4.4 to make room for the rack of thirty blades on the wall beside the kiln)
  stele: { x: 5.15, z: -7.95, yaw: 0 },
  list: { x: 5.15, z: -7.95 },
  // 试剑坪: three wooden dummies inside the ring of bell posts, four summon slabs along its front edge (kept clear of everything)
  dummies: [[-5.6, -1.9], [-3.4, -1.9], [-4.5, 0.3]],
  slabs: [[-6.9, 4.0], [-5.5, 4.0], [-4.1, 4.0], [-2.7, 4.0]],
  // the gate in the front wall (its opening x 0.63..3.0, its posts at z 6.9): walking past z = exit.z (toward +z) between x0..x1 starts
  // a run — the floor's clamp lets her get to z ≈ 6.8 inside the opening
  exit: { x0: 0.75, x1: 2.9, z: 6.4 },
  // filled below from the plan (everything she must not walk through)
  solids: [],
};

// ------------------------------------------------------------------ the plan in cells (the build and the solids both read it)
const C = (m: number) => M(m);
const KILN = { X: C(-0.8), Z: C(-9.0) };                            // the vault's centre column, its front face row
const FORGE = { X: KILN.X - 13, Z: KILN.Z + 13 };
const WALL = { X0: KILN.X + 54, X1: C(8.6), Z0: C(-8.9), Z1: C(-8.4), H: 33 };   // the north wall
const OFFER = { X: C(6.2), Z: C(-8.12) };
// the rack of thirty blades on the north wall's left end (beside the kiln): its first cell, its plane one cell off the wall
const RACK = { X0: WALL.X0, Z: WALL.Z1 + 1 };                          // the offering stand beside the stele
const CORNER = { X0: C(6.55), X1: C(8.1), Zp: C(-7.9), Zr: C(-7.55) };   // 孙媪's lean-to (the north wall to its posts), the drying pole
const SIDE = { X0: C(8.2), X1: C(8.6) - 1, Z1: C(-5.0) };          // the corner's side wall (along z)
const STOVE = { X: C(7.42), Z: C(-7.0) }, TABLE = { X: C(7.55), Z: C(-4.75) }, MAT = { X: C(6.0), Z: C(-7.1) };
const CH = { X0: C(8.75), X1: C(9.5), Z1: C(14) };                  // the water channel
const RAIL = { X: C(8.4), Z0: C(-3.6), Z1: C(0.9) };
const STEP = { X: C(-6.5), Z: C(-7.25), hw: 16, rise: 5, run: 10 }; // the steps' middle column and front row
const LOGS = { x0: STEP.X + STEP.hw + 3, x1: KILN.X - 55, z0: C(-8.8), z1: C(-7.0) };   // firewood in the nook between the steps and the kiln
const T1 = { z: C(-9.36), h: 18 }, T2 = { z: C(-12.6), h: 38 }, T3 = { z: C(-16.5), h: 58 };   // the terraces: front row, top cell
const FENCE = { X: C(-8.75), runs: [[C(-6.0), C(-1.2)], [C(0.4), C(5.6)]] as Array<[number, number]> };
const PRACTICE = { X: C(-8.45), Z: C(-3.4) }, LOCKS: Array<[number, number]> = [[C(-7.4), C(-4.75)], [C(-6.9), C(-4.6)]];
const CART = { X: C(6.75), Z: C(2.35) }, FEED = { X: C(7.65), Z: C(4.6) }, POT = { X: C(3.25), Z: C(1.95) };
const DONKEY = { x: 6.4, z: 4.6 };
const VAT = { X: C(7.72), Z: C(0.55) };                             // a water vat on the bank, south of 卢昭's place
const GATE = { x0: C(0.6), x1: C(3.0), Z: C(6.9), w0: C(-9.4), w1: C(8.55) };
/** 试剑坪's ring of bell posts (its middle and half-axes, metres) */
const RING = { x: -4.5, z: -1.0, rx: 2.95, rz: 3.5 };
const bellPosts = () => Array.from({ length: 7 }, (_, k) => {
  const a = (k / 7) * Math.PI * 2, x = RING.x + RING.rx * Math.sin(a), z = RING.z - RING.rz * Math.cos(a), dx = RING.x - x, dz = RING.z - z;
  const ax = Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) : 0, az = ax ? 0 : Math.sign(dz);
  return { x, z, ax, az };
});
const GRASS = [0x86784a, 0x72663e, 0x968858];   // the autumn grass outside the walls (as the 黄巾 rooms)
/** the anvil sits under 冯铁臂's strike: his strike point turned by his yaw onto the floor */
function anvilAt(): [number, number] {
  const f = HIDEOUT.people.fengtiebi, c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  return [f.x + FENG_STRIKE.x * c + FENG_STRIKE.z * s, f.z - FENG_STRIKE.x * s + FENG_STRIKE.z * c];
}

// ------------------------------------------------------------------ collision: every solid thing, from the same plan
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** a box over the cells x0..x1 × z0..z1 (inclusive), in metres */
const cbox = (x0: number, x1: number, z0: number, z1: number): HideoutSolid => ({ shape: 'box', x: r3(((x0 + x1 + 1) / 2) * CELL), z: r3(((z0 + z1 + 1) / 2) * CELL), hx: r3(((x1 - x0 + 1) / 2) * CELL), hz: r3(((z1 - z0 + 1) / 2) * CELL) });
const mbox = (x0: number, x1: number, z0: number, z1: number): HideoutSolid => ({ shape: 'box', x: r3((x0 + x1) / 2), z: r3((z0 + z1) / 2), hx: r3((x1 - x0) / 2), hz: r3((z1 - z0) / 2) });
const circ = (x: number, z: number, r: number): HideoutSolid => ({ shape: 'circle', x: r3(x), z: r3(z), r });
function solidsOf(): HideoutSolid[] {
  const K0 = KILN, out: HideoutSolid[] = [];
  // the kiln: the vault, the bay's side walls, the rubble heaps, the forge and its bellows, the anvil, the blade rack, the trough, coal
  out.push(cbox(K0.X - 54, K0.X + 53, K0.Z - 50, K0.Z));
  out.push(cbox(K0.X - 54, K0.X - 45, K0.Z + 1, K0.Z + 34), cbox(K0.X + 44, K0.X + 53, K0.Z + 1, K0.Z + 22));
  out.push(cbox(K0.X + 32, K0.X + 43, K0.Z + 18, K0.Z + 33), cbox(K0.X + 44, K0.X + 56, K0.Z + 23, K0.Z + 31), cbox(K0.X + 54, K0.X + 60, K0.Z + 32, K0.Z + 37));
  out.push(cbox(FORGE.X - 9, FORGE.X + 8, FORGE.Z - 7, FORGE.Z + 6), cbox(FORGE.X - 23, FORGE.X - 11, FORGE.Z - 4, FORGE.Z + 3));
  const [ax, az] = anvilAt(); out.push(circ((C(ax) + 0.5) * CELL, (C(az) + 0.5) * CELL, 0.34));
  out.push(cbox(K0.X - 42, K0.X - 40, K0.Z + 16, K0.Z + 30), cbox(K0.X + 22, K0.X + 41, K0.Z + 2, K0.Z + 8));
  out.push(circ((K0.X - 27 + 0.5) * CELL, (K0.Z + 29 + 0.5) * CELL, 0.32));
  out.push(cbox(LOGS.x0, LOGS.x1, LOGS.z0, LOGS.z1));
  // the north wall, the revenge stele (the game's model) and the offering stand, 孙媪's corner
  out.push(cbox(WALL.X0, WALL.X1, WALL.Z0, WALL.Z1));
  out.push(mbox(HIDEOUT.stele.x - 0.67, HIDEOUT.stele.x + 0.67, HIDEOUT.stele.z - 0.38, HIDEOUT.stele.z + 0.38));
  out.push(cbox(OFFER.X - 3, OFFER.X + 3, OFFER.Z - 2, OFFER.Z + 2));
  const { X0, X1, Zp, Zr } = CORNER, Zw = WALL.Z1;
  out.push(cbox(X0 + 1, X1 - 1, Zw + 1, Zw + 4), cbox(X0 + 2, X0 + 3, Zp - 1, Zp), cbox(X1 - 3, X1 - 2, Zp - 1, Zp), cbox(X0, X0 + 1, Zr, Zr + 1), cbox(X1 - 1, X1, Zr, Zr + 1));
  out.push(circ((X0 - 4 + 0.5) * CELL, (Zw + 7 + 0.5) * CELL, 0.38), circ((X1 + 1 + 0.5) * CELL, (Zp + 6 + 0.5) * CELL, 0.38));
  out.push(cbox(STOVE.X - 5, STOVE.X + 5, STOVE.Z - 4, STOVE.Z + 4), cbox(TABLE.X - 7, TABLE.X + 6, TABLE.Z - 4, TABLE.Z + 3));
  out.push(cbox(SIDE.X0, SIDE.X1, WALL.Z0, SIDE.Z1));
  // 试剑坪: each bell post with its bell (a circle shifted toward the arm); the practice rack, two stone locks; the fence on the left
  for (const p of bellPosts()) out.push(circ(p.x + p.ax * 0.15, p.z + p.az * 0.15, 0.3));
  out.push(cbox(PRACTICE.X, PRACTICE.X + 2, PRACTICE.Z, PRACTICE.Z + 21));
  for (const [x, z] of LOCKS) out.push(cbox(x - 2, x + 1, z - 1, z + 1));
  for (const [a, b] of FENCE.runs) out.push(cbox(FENCE.X - 1, FENCE.X + 1, a, b));
  // the steps (she can't climb: the game's floor is flat) and the terrace's front either side of them
  out.push(cbox(STEP.X - STEP.hw - 3, STEP.X + STEP.hw + 2, STEP.Z - 3 * STEP.run + 1, STEP.Z));
  out.push(cbox(C(-18), K0.X - 55, T1.z - 2, T1.z));
  // the water: the channel with its kerbs, the rail
  out.push(cbox(CH.X0 - 2, CH.X1 + 2, T1.z + 2, CH.Z1), cbox(RAIL.X, RAIL.X + 1, RAIL.Z0, RAIL.Z1 + 1));
  out.push(circ((VAT.X + 0.5) * CELL, (VAT.Z + 0.5) * CELL, 0.4), cbox(VAT.X - 9, VAT.X - 5, VAT.Z + 2, VAT.Z + 6));
  // 杜五's corner: the cook-fire with its pot frame, the cart, the donkey, its trough and hay
  out.push(cbox(POT.X - 9, POT.X + 9, POT.Z - 7, POT.Z + 7), cbox(CART.X - 34, CART.X + 24, CART.Z - 11, CART.Z + 11));
  out.push(mbox(DONKEY.x - 0.8, DONKEY.x + 1.12, DONKEY.z - 0.24, DONKEY.z + 0.24), cbox(FEED.X - 10, FEED.X + 8, FEED.Z - 3, FEED.Z + 12));
  // the front wall either side of the gate, the gate's posts, the leaf standing open inside the right post, plus inner corner clusters
  const pa = GATE.x0 - 3, pb = GATE.x1 + 1;
  out.push(cbox(GATE.w0, GATE.x0 - 4, GATE.Z - 3, GATE.Z + 2), cbox(GATE.x1 + 4, GATE.w1, GATE.Z - 3, GATE.Z + 2));
  out.push(cbox(pa - 1, pa + 3, GATE.Z - 2, GATE.Z + 2), cbox(pb - 1, pb + 3, GATE.Z - 2, GATE.Z + 2), cbox(pb - 1, pb, GATE.Z - 14, GATE.Z - 3));
  out.push(cbox(C(-8.8), C(-7.3), C(5.3), C(6.6)), cbox(C(-1.3), C(-0.1), C(5.5), C(6.6)), cbox(C(4.7), C(5.8), C(5.5), C(6.3)));
  return out;
}
HIDEOUT.solids.push(...solidsOf());

// ------------------------------------------------------------------ the ground
function ground(c: Ctx) {
  const w = c.w, r = (k: number) => hash(k, 71, 3);
  const fill = (x0: number, z0: number, x1: number, z1: number, col: number | ((x: number, z: number) => number)) => {
    for (let X = C(x0); X <= C(x1); X++) for (let Z = C(z0); Z <= C(z1); Z++) w.set(X, -1, Z, typeof col === 'number' ? col : col(X, Z));
  };
  const snap = (v: number) => Math.round(v / 0.35) * 0.35;
  // ordered dressed-stone flagstone helper (running-bond large slabs with crisp mortar joints, zero random single-cell noise)
  const flagstones = (x0: number, z0: number, x1: number, z1: number, sw = 12, sd = 10, seed = 3) => {
    const X0 = C(x0), X1 = C(x1), Z0 = C(z0), Z1 = C(z1);
    for (let X = X0; X <= X1; X++) for (let Z = Z0; Z <= Z1; Z++) {
      const rz = Math.floor((Z + 600) / sd), u = X + 600 + (rz & 1) * Math.floor(sw / 2);
      const joint = (Z + 600) % sd === 0 || u % sw === 0 || X === X0 || X === X1 || Z === Z0 || Z === Z1;
      if (joint) { w.set(X, -1, Z, K.paveJ); continue; }
      const h = hash(Math.floor(u / sw), rz, seed);
      w.set(X, -1, Z, h < 0.28 ? K.paveD : h < 0.82 ? K.pave : K.paveL);
    }
  };
  // stepping-stone runner: large grey slabs spaced cleanly with 3-cell tamped earth strips between them (aligned with 04-combat-ui.png)
  const stepRunZ = (xc: number, z0: number, z1: number, hw = 8, len = 12, gap = 3, seed = 9) => {
    const Xc = C(xc), Z0 = C(z0), Z1 = C(z1), step = len + gap;
    for (let Z = Z0; Z <= Z1; Z++) {
      const idx = Math.floor((Z - Z0) / step), lz = (Z - Z0) - idx * step;
      if (lz >= len) continue;
      for (let dx = -hw; dx <= hw; dx++) {
        const border = lz === 0 || lz === len - 1 || dx === -hw || dx === hw;
        const h = hash(idx, dx > 0 ? 1 : 0, seed);
        w.set(Xc + dx, -1, Z, border ? K.paveJ : h < 0.3 ? K.paveD : h < 0.8 ? K.pave : K.paveL);
      }
    }
  };
  const stepRunX = (zc: number, x0: number, x1: number, hd = 7, len = 12, gap = 3, seed = 11) => {
    const Zc = C(zc), X0 = C(x0), X1 = C(x1), step = len + gap;
    for (let X = X0; X <= X1; X++) {
      const idx = Math.floor((X - X0) / step), lx = (X - X0) - idx * step;
      if (lx >= len) continue;
      for (let dz = -hd; dz <= hd; dz++) {
        const border = lx === 0 || lx === len - 1 || dz === -hd || dz === hd;
        const h = hash(idx, dz > 0 ? 1 : 0, seed);
        w.set(X, -1, Zc + dz, border ? K.paveJ : h < 0.3 ? K.paveD : h < 0.8 ? K.pave : K.paveL);
      }
    }
  };

  // grass outside, in gentle broad patches; calm unified packed earth inside the courtyard (no harsh random linoleum rectangles)
  fill(-18, -9.5, 18, 14, GRASS[0]);
  for (let i = 0; i < 32; i++) {
    const x = -18 + r(i) * 36, z = -9 + r(50 + i) * 23, hw = 1.0 + r(100 + i) * 2.0, hd = 0.8 + r(150 + i) * 1.6;
    fill(snap(x - hw), snap(z - hd), snap(x + hw), snap(z + hd), r(200 + i) < 0.6 ? GRASS[1] : GRASS[2]);
  }
  fill(-9.3, -9.5, 8.6, 7.2, K.earth);
  // damp / tamped-earth border grounding the perimeter walls, fence, kiln bay, and water channel
  fill(-9.3, -9.5, 8.6, -8.1, K.earthD);
  fill(-9.3, 6.2, 8.6, 7.2, K.earthD);
  fill(-9.3, -9.5, -8.2, 7.2, K.earthD);
  fill(7.8, -9.5, 8.6, 7.2, K.earthD);
  // subtle warm trodden apron around Du Wu's cook-fire & cart area
  fill(2.0, 0.8, 7.5, 5.8, K.earthL);
  fill(2.4, 1.2, 4.1, 2.8, K.earthD);

  // 试剑坪: warm packed earth framed by a 2-cell timber curb + 4 corner stone bollards, open stone threshold on the east edge
  fill(-7.8, -5.2, -1.4, 4.8, K.yard);
  fill(-7.6, -5.0, -1.6, -4.6, K.yardD); fill(-7.6, 4.4, -1.6, 4.6, K.yardD);
  fill(-7.6, -5.0, -7.2, 4.6, K.yardD); fill(-2.0, -5.0, -1.6, 4.6, K.yardD);
  // subtle flat ring marking the central wooden-dummy sparring ground + stone pads under the 4 summon slabs
  fill(-6.4, -3.5, -2.6, 1.7, K.yardD);
  fill(-6.1, -3.2, -2.9, 1.4, K.yard);
  // subtle warm stone plinths flush under the 4 summon slabs (harmonizes with packed training dirt!)
  for (const [sx, sz] of HIDEOUT.slabs) flagstones(sx - 0.5, sz - 0.44, sx + 0.5, sz + 0.44, 14, 12, 17);
  const kx0 = C(-7.8), kx1 = C(-1.4), kz0 = C(-5.2), kz1 = C(4.8);
  const entZ0 = C(-1.55), entZ1 = C(-0.25);
  for (let X = kx0; X <= kx1; X++) for (const Z of [kz0, kz1]) {
    w.set(X, 0, Z, (X - kx0) % 14 === 13 ? HV.woodD : HV.wood);
    w.set(X, 0, Z === kz0 ? Z - 1 : Z + 1, HV.woodD);
  }
  for (let Z = kz0; Z <= kz1; Z++) for (const X of [kx0, kx1]) {
    if (X === kx1 && Z >= entZ0 && Z <= entZ1) continue;
    w.set(X, 0, Z, (Z - kz0) % 14 === 13 ? HV.woodD : HV.wood);
    w.set(X === kx0 ? X - 1 : X + 1, 0, Z, HV.woodD);
  }
  // four dressed corner stone blocks anchoring the training yard
  for (const X of [kx0 - 1, kx1]) for (const Z of [kz0 - 1, kz1]) {
    w.box(X, 0, Z, X + 1, 2, Z + 1, K.stoneD);
    w.box(X, 3, Z, X + 1, 3, Z + 1, K.stoneL);
  }

  // warm weathered sandstone apron in front of the north wall (stele offering pad)
  for (let X = WALL.X0; X <= C(6.4); X++) for (let Z = WALL.Z1 + 1; Z <= C(-7.0); Z++) {
    const row = Math.floor((Z + 600) / 6), u = X + 600 + (row & 1) * 6;
    w.set(X, -1, Z, (Z + 600) % 6 === 5 || u % 12 === 11 ? K.paveJ : (row + Math.floor(u / 12)) % 3 === 0 ? K.paveD : K.pave);
  }
  // natural mountain-courtyard trodden earth footpaths (warm darker ochre dirt — NO jarring blue-grey flagstones across yellow soil!)
  const dirtPath = (x0: number, z0: number, x1: number, z1: number) => {
    fill(x0 - 0.14, z0 - 0.14, x1 + 0.14, z1 + 0.14, K.earthD);
    fill(x0, z0, x1, z1, K.path);
  };
  dirtPath(0.95, -2.0, 2.55, 6.7);      // front gate → central courtyard
  dirtPath(0.2, -6.5, 1.8, -1.6);       // central courtyard → kiln forge bay
  dirtPath(3.9, -6.9, 5.2, -1.6);       // stele apron → east yard
  dirtPath(2.2, -1.6, 7.2, -0.35);      // central courtyard → Lu Zhao rail & channel
  dirtPath(-1.5, -1.5, 1.4, -0.25);     // central courtyard → training yard entrance
  dirtPath(5.0, -5.2, 6.3, -4.2);       // stele spur → Sun Ao herb corner
  // sparse weathered warm-sandstone stepping slabs ONLY at real thresholds (front gate step & kiln hearth step)
  stepRunZ(1.75, 4.4, 6.5, 8, 12, 5, 7);
  flagstones(-0.2, -6.55, 1.8, -5.85, 12, 10, 13);
  flagstones(-1.55, -1.45, -0.75, -0.35, 10, 10, 29);
  void stepRunX;

  // the road outside the front gate: worn earth with stone verges and two deep wheel ruts
  fill(0.45, 7.2, 3.15, 14, K.path);
  for (const X of [C(0.45), C(3.15)]) for (let Z = C(7.3); Z <= C(14); Z++) w.set(X, -1, Z, (Z % 12 < 2) ? K.stoneD : K.earthD);
  for (const X of [C(0.95), C(2.55)]) for (let Z = C(7.3); Z <= C(14); Z++) { w.set(X, -1, Z, K.rut); w.set(X + 1, -1, Z, K.rut); }
}

// ------------------------------------------------------------------ the build
function* build(c: Ctx, o: { time: HideoutTime; weather: HideoutWeather }) {
  const w = c.w, lamp = lampFor(o.time, o.weather), lit = o.time === 'dusk' || o.time === 'night', wet = o.weather === 'rain';
  yield;
  ground(c);
  // the hill: three terraces stepping up behind (the kiln built into the first); the steps up the first on the left, a wine jar and a
  // bowl on the bottom step (桓越's seat), firewood stacked in the nook beside them
  terrace(c, C(-18), KILN.X - 55, T2.z + 1, T1.z, T1.h, K.grass, 1);
  terrace(c, KILN.X + 54, C(18), T2.z + 1, WALL.Z0 - 1, T1.h, K.grass, 2);
  terrace(c, C(-18), C(18), T3.z + 1, T2.z, T2.h, K.grass, 3);
  terrace(c, C(-18), C(18), C(-22), T3.z, T3.h, K.grass, 4);
  yield;
  steps(c, STEP.X, STEP.Z, STEP.hw, STEP.rise, STEP.run);
  { const B = loc(w, STEP.X - 11, STEP.Z - 5, 0); B(-1, 5, -2, 2, 8, 1, HV.clay); B(-1, 8, -2, 2, 8, 1, HV.clayL); B(0, 9, -1, 1, 9, 0, HV.clayD); B(0, 10, -1, 1, 10, 0, HV.red); B(4, 5, -1, 6, 5, 1, HV.grey); }
  logStack(c, LOGS.x0, LOGS.x1, LOGS.z0, LOGS.z1, 8);
  // the kiln, its bay, the forge, the anvil and the smith's things
  yield;
  const vault = kiln(c, KILN.X, KILN.Z);
  const fire = forge(c, FORGE.X, FORGE.Z);
  const [ax, az] = anvilAt(); anvil(c, C(ax), C(az));
  bladeRack(c, KILN.X - 42, KILN.Z + 16);
  trough(c, KILN.X + 29, KILN.Z + 5);
  forgeSupply(c, KILN.X + 18, KILN.Z + 12);
  coalBasket(c, KILN.X - 27, KILN.Z + 29);
  // the north wall (the stele stands before it; an offering beside it), 孙媪's corner and its side wall, pigeons on the wall top
  yield;
  northWall(c, WALL.X0, WALL.X1, WALL.Z0, WALL.Z1, WALL.H, [[C(6.0), C(6.5), 3], [WALL.X1 - 5, WALL.X1, 8]]);
  bladeWall(c, RACK.X0, RACK.Z);
  const flame = offering(c, OFFER.X, OFFER.Z, lit);
  for (let Z = WALL.Z0; Z <= SIDE.Z1; Z++) { const h = Z <= C(-7.0) ? 22 : Z <= C(-6.0) ? 14 : 7; for (let x = SIDE.X0; x <= SIDE.X1; x++) for (let y = 0; y <= h; y++) w.set(x, y, Z, y <= 2 ? (y === 2 ? K.stoneL : K.stone) : brickAt(x + Z, y)); }
  recolor(w, SIDE.X0, 3, WALL.Z0, SIDE.X1, 23, SIDE.Z1, (x, y, z) => (w.has(x, y + 1, z) ? null : K.brickL));
  yield;
  herbCorner(c, CORNER.X0, CORNER.X1, WALL.Z1, CORNER.Zp, CORNER.Zr);
  mat(c, MAT.X, MAT.X + 12, MAT.Z, MAT.Z + 27);
  const stove = medStove(c, STOVE.X, STOVE.Z, true);
  lowTable(c, TABLE.X, TABLE.Z);
  pigeon(c, C(5.2), WALL.H + 3, WALL.Z0 + 3, -1); pigeon(c, C(5.6), WALL.H + 3, WALL.Z0 + 4, 1);
  // 试剑坪: seven bell posts in a ring, each arm toward the ring's middle; a rack of practice weapons, stone locks; the fence on the left
  for (const p of bellPosts()) bellPost(c, C(p.x), C(p.z), p.ax, p.az);
  const L = loc(w, 0, 0, 0); for (const [a, b] of FENCE.runs) wattleZ(L, a, b, FENCE.X, 10);
  practiceRack(c, PRACTICE.X, PRACTICE.Z); for (const [x, z] of LOCKS) stoneLock(c, x, z);
  // water: the culvert under the terrace, the stone channel down the right side, the rail where 卢昭 stands
  yield;
  channel(c, CH.X0, CH.X1, T1.z + 2, CH.Z1);
  culvert(c, Math.round((CH.X0 + CH.X1) / 2), WALL.Z0 - 1);
  railing(c, RAIL.X, RAIL.Z0, RAIL.Z1);
  { const B = loc(w, VAT.X, VAT.Z, 0); jar(B, 0, 0, 1, true, { lid: true }); B(-9, 0, 2, -5, 4, 6, HV.wood); B(-9, 2, 2, -5, 2, 6, K.iron); B(-8, 4, 3, -6, 4, 5, K.water); B(-7, 5, 4, -7, 7, 4, HV.woodD); }
  // 杜五's cook-fire, his cart and the donkey's feed; the front wall and the gate
  yield;
  cart(c, CART.X, CART.Z);
  feed(c, FEED.X, FEED.Z);
  const pot = cookFire(c, POT.X, POT.Z, true);
  frontGate(c, GATE.w0, GATE.x0, GATE.x1, GATE.w1, GATE.Z);
  // two paper lanterns (lit at dusk and night): from the gate's lintel, and at the end of 孙媪's beam
  lantern(c, GATE.x0 - 6, 29, GATE.Z, lit); lantern(c, CORNER.X1 - 1, 25, CORNER.Zp - 1, lit);
  // trees and bamboo: lush Mount Song bamboo valleys framing BOTH East & West flanks plus layered groves behind the kiln!
  yield;
  grove(c, -16.5, -16.5, -6.5, -12.6, 28, 11, [6.4, 8.6]);
  grove(c, 5.0, -16.5, 16.5, -12.6, 30, 12, [6.4, 8.6]);
  grove(c, -18.0, -21.5, 18.0, -16.8, 46, 13, [8.4, 10.8]);
  // Dense East bamboo forest beyond the water channel
  grove(c, 9.9, -9.2, 14.4, 4.8, 40, 14, [5.4, 7.8]);
  grove(c, 12.0, -4.0, 18.2, 10.5, 32, 16, [5.0, 7.4]);
  // Dense West bamboo forest outside the training-yard wattle fence
  grove(c, -14.8, -9.0, -9.9, 6.2, 38, 15, [5.0, 7.4]);
  grove(c, -18.5, -12.5, -13.2, 10.2, 30, 17, [5.4, 7.8]);
  deadTree(w, -11.6, -10.6, 5.6, HV.char, HV.charD, { seed: 9, crow: 0.6, moss: false });
  oak(w, -13.8, -11.4, 6.8, { seed: 33, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x866c32, leafTop: 0xaa8a40, low: 0.42, width: 1.05, vines: 0 });
  oak(w, -13.4, 2.2, 6.0, { seed: 53, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x6c7c3a, leafTop: 0x8ea04c, low: 0.40, width: 1.0, vines: 0 });
  oak(w, -12.2, 7.6, 5.4, { seed: 59, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x8a6d32, leafTop: 0xb08d42, low: 0.42, width: 0.95, vines: 0 });
  oak(w, 12.6, -10.8, 7.4, { seed: 21, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x8a6a2c, leafTop: 0xb08a3a, low: 0.4, width: 1.1, vines: 0 });
  oak(w, 13.8, -1.8, 6.2, { seed: 61, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x62783a, leafTop: 0x829c4c, low: 0.40, width: 1.0, vines: 0 });
  oak(w, 14.5, 5.8, 6.2, { seed: 47, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x7c6834, leafTop: 0xa28842, low: 0.42, width: 0.95, vines: 0 });
  // Low lush hillside voxel shrubs nestled under both bamboo flanks
  for (const [bx, bz, r2] of [
    [-10.6, -7.2, 7], [-11.4, -0.4, 8], [-10.8, 3.6, 7], [-12.6, 5.8, 9],
    [10.8, -7.4, 7], [11.6, -4.6, 8], [11.2, 1.2, 8], [12.4, 4.8, 9],
  ] as const) {
    const X = C(bx), Z = C(bz);
    w.box(X - r2, 0, Z - r2, X + r2, 5, Z + r2, 0x4f6434);
    w.box(X - r2 + 2, 6, Z - r2 + 2, X + r2 - 2, 9, Z + r2 - 2, 0x647d40);
    w.box(X - r2 + 4, 10, Z - r2 + 4, X + r2 - 4, 11, Z + r2 - 4, 0x7a944c);
  }
  // Mount Song rugged limestone/sandstone cliff outcrops anchoring the ancient kiln into the mountainside (bleeding off camera edges!)
  cliffOutcrop(c, C(-8.6), T1.h + 1, C(-11.4), 22, 14, 24);
  cliffOutcrop(c, C(-14.8), T2.h + 1, C(-14.6), 28, 18, 30);
  cliffOutcrop(c, C(9.4), T1.h + 1, C(-11.8), 20, 14, 22);
  cliffOutcrop(c, C(15.2), T2.h + 1, C(-15.0), 28, 18, 28);
  cliffOutcrop(c, C(-3.8), T3.h + 1, C(-18.6), 34, 16, 26);
  cliffOutcrop(c, C(5.8), T3.h + 1, C(-18.2), 30, 16, 24);
  // lived-in courtyard edge details: gate stone bollards (门墩石), low wooden stool by Du Wu's cook-fire, & wall-root weathered pebbles
  for (const bx of [GATE.x0 - 8, GATE.x1 + 6]) {
    w.box(bx - 1, 0, GATE.Z + 4, bx + 2, 1, GATE.Z + 7, K.stoneD);
    w.box(bx, 2, GATE.Z + 5, bx + 1, 6, GATE.Z + 6, K.stone);
    w.box(bx, 7, GATE.Z + 5, bx + 1, 7, GATE.Z + 6, K.stoneL);
  }
  // low wooden bench/stool beside Du Wu's cook-fire (pure visual grounding inside fire zone)
  w.box(POT.X - 15, 0, POT.Z + 3, POT.X - 14, 3, POT.Z + 5, HV.post);
  w.box(POT.X - 8, 0, POT.Z + 3, POT.X - 7, 3, POT.Z + 5, HV.post);
  w.box(POT.X - 16, 4, POT.Z + 2, POT.X - 6, 4, POT.Z + 6, HV.wood);
  w.box(POT.X - 16, 4, POT.Z + 6, POT.X - 6, 4, POT.Z + 6, HV.woodL);
  // small 3D weathered road-edge stones tucked cleanly by wall roots & gate shoulders
  for (const [rx, rz] of [[-4.2, 6.2], [-2.2, 6.3], [3.6, 6.2], [7.8, 1.5], [7.9, -4.1], [-8.2, 2.2], [-8.2, -3.8], [0.1, 7.6], [3.8, 7.7]] as const) {
    const X = C(rx), Z = C(rz);
    w.box(X - 2, 0, Z - 2, X + 2, 1, Z + 1, K.stoneD);
    w.box(X - 1, 2, Z - 1, X + 1, 2, Z, K.stoneL);
    w.box(X + 3, 0, Z - 1, X + 4, 0, Z + 1, K.stone);
  }
  // functional camp & yard narrative details (unpacked crates by Du Wu's cart, straw & timber stacks on flanks, old hillside ruins)
  campSupply(c, C(5.2), C(5.9));
  strawCluster(c, C(-8.1), C(5.9), 2);
  logStack(c, C(-1.2), C(-0.2), C(5.6), C(6.4), 7);
  stoneCluster(c, C(-1.6), C(8.0));
  strawCluster(c, C(-10.8), C(-1.8), 3);
  strawCluster(c, C(-11.2), C(4.0), 3);
  stoneCluster(c, C(-10.4), C(6.6));
  logStack(c, C(-10.1), C(-9.1), C(-5.8), C(-4.4), 7);
  stoneCluster(c, C(10.8), C(-3.0));
  stoneCluster(c, C(10.7), C(2.8));
  strawCluster(c, C(11.8), C(7.0), 3);
  terraceRuin(c, C(-10.4), T1.h + 1, C(-10.2));
  terraceRuin(c, C(11.4), T2.h + 1, C(-14.0));
  // dressing: dry grass on the vault's tiers and the terrace tops, reeds along the water and in the corners, grass outside the walls
  yield;
  const card = (kind: string, x: number, z: number, s: number, tint?: number) => { const y = surface(c, x, z); if (y != null) c.cards.add(kind, x, z, { y, s, tint }); };
  for (let i = 0; i < 26; i++) { const x = -4.4 + hash(i, 1, 9) * 7.2, z = -12.4 + hash(i, 2, 9) * 3.3; card(i % 3 ? 'weeds' : 'grass', x, z, 0.55 + hash(i, 3, 9) * 0.3, 0xb0a078); }
  for (let i = 0; i < 90; i++) { const x = -18 + hash(i, 4, 9) * 36, z = -16 + hash(i, 5, 9) * 6.5; if (Math.abs(x + 0.8) < 3.8 && z > -12.6) continue; card(i % 4 ? 'grass' : 'weeds', x, z, 0.5 + hash(i, 6, 9) * 0.4, i % 2 ? 0xc8b890 : 0xb4a878); }
  for (let i = 0; i < 46; i++) { const z = -8.6 + hash(i, 7, 9) * 22, x = hash(i, 8, 9) < 0.5 ? 9.85 + hash(i, 9, 9) * 0.5 : 8.6 + hash(i, 10, 9) * 0.1; if (x < 9 && (z < 1.2 && z > -5.1)) continue; card('reeds', x, z, 0.6 + hash(i, 11, 9) * 0.5, 0xb8b088); }
  for (let i = 0; i < 26; i++) { const x = -10.5 + hash(i, 12, 9) * 3, z = 4.6 + hash(i, 13, 9) * 4; card('reeds', x, z, 0.6 + hash(i, 14, 9) * 0.4, 0xb8b088); }
  for (let i = 0; i < 360; i++) {
    const x = -18 + hash(i, 15, 9) * 36, z = -10 + hash(i, 16, 9) * 24;
    if (x > -9.3 && x < 8.7 && z < 7.4) continue; if (x > 0.4 && x < 3.2 && z > 7) continue;
    const isFlank = x < -9.3 || x > 9.5;
    card(isFlank && i % 3 === 0 ? 'vtuft' : (i % 5 ? 'grass' : 'weeds'), x, z, 0.48 + hash(i, 17, 9) * 0.42, isFlank ? (i % 2 ? 0x9eb878 : 0xb8c488) : (i % 3 ? 0xc8b890 : 0xa8b080));
  }
  // lived-in courtyard micro-details: crisp wall-root tufts, weathered pebbles along paths, autumn leaf litter & twigs
  for (let i = 0; i < 42; i++) {
    const x = -9 + hash(i, 18, 9) * 17.5, z = -7.8 + hash(i, 19, 9) * 14.5;
    const at = w.get(C(x), -1, C(z))?.c;
    const inYard = x < -1.2 && x > -8 && z > -5.4 && z < 5;
    if (at === K.earthD && !inYard) card('vtuft', x, z, 0.55 + hash(i, 20, 9) * 0.25, i % 2 ? 0xe8e0be : 0xffffff);
  }
  // pebbles along footpath verges, gate threshold, training-yard timber curb, and stele mound
  for (const [px, pz, s] of [
    [0.6, 5.4, 1.05], [2.9, 5.1, 1.0], [0.4, 2.2, 1.02], [2.6, -0.8, 0.96], [4.2, -3.5, 1.05],
    [-1.2, 4.6, 1.02], [-1.2, -4.8, 0.98], [-7.9, 5.2, 1.05], [5.8, -1.8, 0.96], [3.6, 7.6, 1.12],
    [0.2, 8.2, 1.08], [4.8, 8.0, 1.05], [-4.8, 7.6, 1.12], [6.6, 5.8, 0.98], [1.6, 1.0, 0.95],
  ] as const) {
    c.cards.add('vpebble', px, pz, { y: 0.012, s, tint: 0xffffff });
  }
  // fallen autumn leaves tucked along the east bamboo edge, west fence, and cook-fire/firewood corners
  for (const [lx, lz, s] of [
    [7.4, -3.2, 1.1], [7.2, 0.4, 1.05], [6.4, 5.2, 1.0], [-8.0, 2.5, 1.1], [-7.8, -5.6, 1.05],
    [-0.4, 5.9, 1.02], [3.8, 3.0, 0.96], [4.8, -6.5, 0.98], [-3.2, 7.8, 1.15], [5.2, 7.9, 1.1],
  ] as const) {
    c.cards.add('vleaf', lx, lz, { y: 0.010, s, tint: 0xffffff });
  }
  // crisp plant tufts hugging the outside gate wall, broken stele mound, and training curb corners
  for (const [gx, gz, k] of [
    [-0.1, 7.3, 'vtuft'], [3.7, 7.3, 'vtuft'], [4.9, 7.9, 'vtuft'], [5.6, 7.5, 'vtuft'],
    [-7.9, 4.9, 'vtuft'], [-1.3, 4.9, 'vtuft'], [-1.3, -5.3, 'vtuft'], [-7.9, -5.3, 'vtuft'],
    [-5.8, 6.4, 'vtuft'], [-2.6, 6.4, 'vtuft'], [4.4, 6.3, 'vtuft'], [7.6, 3.8, 'vtuft'],
  ] as const) {
    card(k, gx, gz, 0.68, gx > 0 ? 0xe6deb8 : 0xffffff);
  }
  if (wet) {
    // rain: the bare ground a shade darker (wet), a few small puddles
    for (const [k, cell] of w.cells) if ((Math.floor(k / 1024) % 1024) - 512 === -1 && !cell.g) cell.c = mixC(cell.c, 0x2a2c34, 0.18);
    for (const [x, z, s] of [[-4.6, 0.9, 0.8], [1.8, 9.2, 0.7], [3.6, -2.4, 0.8], [-0.6, -6.1, 0.6], [5.4, 0.9, 0.6], [-6.6, -3.6, 0.55], [1.2, 4.2, 0.5]] as Array<[number, number, number]>) c.cards.add('puddle', x, z, { y: 0.004, s, tint: o.time === 'night' ? 0x7a8698 : o.time === 'dusk' ? 0xa8b4c4 : 0xd0d8e4 });
  }
  // light: the forge's dark red glow (always), 杜五's cook-fire, the offering candle by the stele at dusk and night
  c.light([fire[0], 0.7, fire[2]], 0xff5a24, 3.4 * Math.max(0.65, lamp), 6.5);
  c.light([pot.fire[0], 0.55, pot.fire[2]], 0xff8a40, 2.2 * Math.max(0.5, lamp), 4.2);
  if (lit) c.light([flame[0] - 0.4, flame[1] + 0.3, flame[2] + 0.7], 0xffb060, 1.0 * lamp, 2.8);
  // smoke from the forge out of the broken vault, steam off the medicine pot and the cook pot; embers over the coals; light into the bay
  smoke(c, [fire[0] + 0.1, 0.9, fire[2]], { rate: wet ? 1.6 : 1.1, col: 0x6e6862 });
  smoke(c, stove.steam, { rate: 0.7, col: 0xc8c4bc }); smoke(c, pot.lid, { rate: 0.8, col: 0xd0ccc4 });
  c.ambient({ kind: 'embers', color: 0xff7a30, rate: 1.6, area: { x0: fire[0] - 0.45, z0: fire[2] - 0.35, x1: fire[0] + 0.45, z1: fire[2] + 0.35 }, y: [0.35, 0.9] });
  c.shaft(fire[0] + 0.9, fire[2] + 0.3, { w: 2.6, h: 7.5, tilt: 0.2, yaw: 0.25, a: o.time === 'day' ? 0.12 : wet ? 0.16 : 0.2 });
  c.shaft(vault.hole[0], vault.hole[1] + 0.3, { w: 1.6, h: 6, tilt: 0.12, yaw: 0.2, a: o.time === 'day' ? 0.12 : 0.18 });
  if (wet) { c.ambient({ kind: 'rain', color: 0xb8c4d4, rate: 30, area: { x0: -3.6, z0: -8.9, x1: 2.0, z1: -6.7 } }); c.ambient({ kind: 'rain', color: 0xb8c4d4, rate: 12, area: { x0: vault.hole[0] - 0.7, z0: vault.hole[1] - 0.5, x1: vault.hole[0] + 0.7, z1: vault.hole[1] + 0.5 } }); }
  for (const a of weatherAmbient(o.weather, 'autumn', o.time, true)) c.ambient(a.kind === 'rain' ? { ...a, area: { x0: -13, z0: -14, x1: 13, z1: 8 } } : a);
  yield;
}
function addDonkey(c: Ctx) {
  // 杜五's grey donkey at the feed (an actor of its own, part of the stage: it goes when the stage goes)
  const donkey = new BattleActor(HIDEOUT_DONKEY); donkey.place(V3(DONKEY.x, 0, DONKEY.z), Math.PI / 2); donkey.yaw = Math.PI / 2; trimShadows(donkey.root, 3); c.add(donkey.root);
  const blob = contactShadow(1.1); blob.position.set(DONKEY.x - 0.1, 0.02, DONKEY.z); blob.scale.set(1.6, 1, 0.8); c.add(blob);
  DONKEYS.add(donkey);
  if (!donkeyHook) { donkeyHook = true; onUpdate(dt => { for (const d of DONKEYS) { if (inScene(d.root)) d.update(dt); else if (!d.root.parent?.parent) DONKEYS.delete(d); } }); }
}
/** the donkeys of the stages built so far (one updater for all; a donkey whose stage was torn down is dropped) */
const DONKEYS = new Set<BattleActor>(); let donkeyHook = false;
const inScene = (o: THREE.Object3D) => { let p: THREE.Object3D | null = o; while (p) { if (p === scene) return true; p = p.parent; } return false; };

/** captures: the five in a row on a plain stage of the hideout's own stuff (packed earth, the brick wall behind, 桓越's stone seat) */
function lineupScene(o: { time: HideoutTime; weather: HideoutWeather }): SceneDef {
  return { id: 'hideout_lineup', name: '据点五人', group: '节点', kind: '户外', blurb: '', mood: moodFor(o.time, 'autumn', o.weather), build(c) {
    const w = c.w;
    for (let X = C(-14); X <= C(14); X++) for (let Z = C(-8); Z <= C(10); Z++) { const p = hash(Math.floor((X + 600) / 19), Math.floor((Z + 600) / 13), 5); w.set(X, -1, Z, p < 0.6 ? K.earth : p < 0.85 ? K.earthD : K.earthL); }
    northWall(c, C(-9), C(9), C(-2.9), C(-2.4), 30, [[C(-9), C(-6.5), 6], [C(5), C(6.2), 4]]);
    terrace(c, C(-14), C(14), C(-8), C(-3.0), 18, K.grass, 6);
    const B = loc(w, C(LINEUP.x0 + 4 * LINEUP.gap), C(LINEUP.z), 0);
    B(-5, 0, -7, 4, 4, 0, K.stone); B(-5, 4, -7, 4, 4, 0, K.stoneL); B(-5, 0, 0, 4, 0, 0, K.stoneD);
    for (let i = 0; i < 16; i++) { const x = -7 + hash(i, 1, 4) * 14; if (Math.abs(x) < 6.2) continue; c.cards.add('weeds', x, -2 + hash(i, 2, 4) * 3, { y: 0, s: 0.5 + hash(i, 3, 4) * 0.3, tint: 0xc8b890 }); }
    c.light([0, 2.2, 2.5], 0xffc890, 1.2, 9);
  } };
}
const LINEUP = { x0: C(-3.5) * CELL, gap: 1.75, z: 0 };

/** the hideout as a stage (show it with showStage(def, { combat: true }), like a room) */
export function hideoutScene(o: { time: HideoutTime; weather: HideoutWeather }): SceneDef {
  return { id: `hideout_${o.time}_${o.weather}`, name: '断碑古窑', group: '节点', kind: '户外', blurb: '嵩山南麓 · 断碑古窑', mood: moodFor(o.time, o.weather === 'snow' ? 'winter' : 'autumn', o.weather), pack: o.time === 'dusk' && o.weather === 'clear' ? 'yard' : undefined,
    build: c => finishBuild(build(c, o)), buildSteps: c => build(c, o), decorate: addDonkey };
}

// ================================================================== debug: __dh.hideout(time?, weather?, view?), __dh.hideoutSolids(on?)
let SHADOW_TEX: THREE.Texture | null = null;
/** a soft dark spot for under the feet (as show.ts draws under the foes) */
function contactShadow(r = 0.7) {
  if (!SHADOW_TEX && typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); SHADOW_TEX = new THREE.CanvasTexture(cv);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0608, map: SHADOW_TEX, transparent: true, opacity: 0.6, depthWrite: false }));
  m.renderOrder = 2; return m;
}
/** a stand-in for the game's carved stele (stele.ts lives in main): a plinth, the slab, a stepped crown — debug views only */
function stelePlaceholder() {
  const g = new THREE.Group(), st = new THREE.MeshLambertMaterial({ color: 0x8a857c }), sd = new THREE.MeshLambertMaterial({ color: 0x6a665f });
  const box = (w: number, h: number, d: number, y: number, m: THREE.Material) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.y = y + h / 2; b.castShadow = b.receiveShadow = true; g.add(b); };
  box(1.33, 0.28, 0.75, 0, sd); box(1.05, 1.1, 0.35, 0.28, st); box(0.84, 0.14, 0.35, 1.38, st); box(0.56, 0.08, 0.35, 1.52, st);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.84, 0.02), sd); panel.position.set(0, 0.28 + 0.55, 0.18); g.add(panel);
  return g;
}
let LIVE: { stage: Stage; actors: BattleActor[]; extra: THREE.Object3D[]; shadowAt: [number, number] | null } | null = null, hooked = false, SOLIDS: THREE.Group | null = null;
function clearLive() { if (!LIVE) return; for (const a of LIVE.actors) a.dispose(); for (const m of LIVE.extra) m.parent?.remove(m); LIVE = null; SOLIDS = null; }
type View = 'wide' | 'game' | 'lineup';
/** the views for captures: wide = the whole hideout from front-above; game = the battle camera on the heroine at the spawn; lineup =
 *  the five in a row on a plain stage (桓越 on a stone block), the heroine at the end for scale */
const CAMS: Record<'wide' | 'lineup', [number[], number[], number]> = { wide: [[0.4, 15.5, 17.5], [0.4, 0, -2.2], 45], lineup: [[0, 8.6, 14.2], [0, 0.55, -0.6], 34] };
/** ids: who stands in the hideout (chapter 1: 杜五, 孙媪, 冯铁臂; default all five) */
function showHideout(time: HideoutTime = 'dusk', weather: HideoutWeather = 'clear', view: View = 'wide', ids: PersonId[] = ['duwu', 'sunao', 'fengtiebi', 'luzhao', 'huanyue']) {
  const act = (dh.api.act as (() => ActShow) | undefined)?.(); if (!act) return 'no game';
  if (!hooked) { hooked = true; onUpdate(dt => { if (!LIVE) return; if (currentStage() !== LIVE.stage) { clearLive(); return; } for (const a of LIVE.actors) a.update(dt); if (LIVE.shadowAt) followShadow(...LIVE.shadowAt); }); }
  clearLive();
  // a fight-less room (no foes, no yard, no doors), then the hideout's stage in its place; the floor and the camera's box are the hideout's
  (dh.api.scene as (id: string, seed?: number) => unknown)('ninja_wilds', 1);
  act.props?.dispose(); act.props = null; act.gates?.dispose(); act.gates = null; act.leaves?.dispose(); act.leaves = null; act.solids.clear();
  const stage = showStage(view === 'lineup' ? lineupScene({ time, weather }) : hideoutScene({ time, weather }), { combat: true }); act.stage = stage;
  Object.assign(PLAY, HIDEOUT.floor);
  const actors: BattleActor[] = [], extra: THREE.Object3D[] = [];
  const put = (id: PersonId, x: number, z: number, yaw: number) => {
    const a = new BattleActor(HIDEOUT_PEOPLE[id]); a.place(V3(x, 0, z), yaw); a.yaw = yaw; trimShadows(a.root, 4); actors.push(a);
    const s = contactShadow(id === 'fengtiebi' ? 0.55 : 0.42); s.position.set(x + (id === 'huanyue' ? Math.sin(yaw) * 0.18 : 0), 0.025, z + (id === 'huanyue' ? Math.cos(yaw) * 0.18 : 0)); scene.add(s); extra.push(s);
  };
  if (view === 'lineup') (['duwu', 'sunao', 'fengtiebi', 'luzhao', 'huanyue'] as PersonId[]).forEach((id, i) => put(id, LINEUP.x0 + i * LINEUP.gap, LINEUP.z, 0));
  else {
    for (const id of ids) { const p = HIDEOUT.people[id]; if (p) put(id, p.x, p.z, p.yaw); }
    const st = stelePlaceholder(); st.position.set(HIDEOUT.stele.x, 0, HIDEOUT.stele.z); st.rotation.y = HIDEOUT.stele.yaw; scene.add(st); extra.push(st);
  }
  LIVE = { stage, actors, extra, shadowAt: view === 'game' ? null : view === 'lineup' ? [0, 0] : [0.3, -1.5] };
  // the heroine: on the mat (game view), at the end of the lineup, or in the middle of the courtyard (wide view)
  const h = act.hero, at: [number, number] = view === 'game' ? HIDEOUT.spawn : view === 'lineup' ? [-5.3, -0.4] : [2.0, -1.4];
  h.pos.set(at[0], 0, at[1]); h.vel.set(0, 0, 0); h.a.yaw = view === 'game' ? -0.6 : 0;
  act.banner.hide(); act.hud.on = view === 'game';
  const cam = view === 'game' ? null : CAMS[view]; (dh.api.cam as (b: number[] | null, l?: number[], fov?: number) => void)(cam ? cam[0] : null, cam?.[1], cam?.[2]);
  return { calls: (dh.api.stats as () => { calls: number })().calls, solids: HIDEOUT.solids.length };
}
/** checks: draw HIDEOUT.solids as translucent red shapes over the hideout on show (and feed them to the game's collision, so walking
 *  about with the debug view on respects them) */
function showSolids(on = true) {
  if (!LIVE) return 'show the hideout first';
  if (SOLIDS) { SOLIDS.parent?.remove(SOLIDS); LIVE.extra = LIVE.extra.filter(o => o !== SOLIDS); SOLIDS = null; }
  const act = (dh.api.act as () => ActShow)(); act.solids.clear();
  if (!on) return 0;
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.38, depthWrite: false });
  for (const s of HIDEOUT.solids) {
    const mesh = s.shape === 'box' ? new THREE.Mesh(new THREE.BoxGeometry(s.hx * 2, 0.5, s.hz * 2), m) : new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, 0.5, 20), m);
    mesh.position.set(s.x, 0.25, s.z); mesh.renderOrder = 6; g.add(mesh);
    act.solids.add({ kind: 'prop', ...s });
  }
  scene.add(g); LIVE.extra.push(g); SOLIDS = g;
  return HIDEOUT.solids.length;
}
dh.add({ hideout: showHideout, hideoutSolids: showSolids });

/** act-37: the blades she has taken back (0..30), hanging from the rack's pegs in order (top row first, left to right): a bronze
 *  ring on the peg, the red-bound grip, a dark guard, the steel blade with a lighter point. Built in the scene's own cells, so the
 *  group goes in at the stage's origin. */
export function rackBlades(n: number): THREE.Group {
  const g = new THREE.Group(); n = Math.max(0, Math.min(30, Math.floor(n))); if (!n) return g;
  const w = new VoxWorld(CELL), Z = RACK.Z;
  for (let i = 0; i < n; i++) {
    const x = RACK.X0 + 1 + (i % 10) * 2, y = RACK_RAILS[Math.floor(i / 10)];
    w.box(x, y - 1, Z, x, y - 1, Z, 0xb08040); w.box(x, y - 2, Z, x, y - 2, Z, 0x7a2a20); w.box(x, y - 3, Z, x, y - 3, Z, 0x2a2a30);
    w.box(x, y - 7, Z, x, y - 4, Z, 0xb4bcc6); w.box(x, y - 8, Z, x, y - 8, Z, 0xe2e8ee);
  }
  for (const m of w.build({ rim: 0.25, edge: 0.14 })) { if (!m.userData.shadowTiled && m.name !== 'shadowTile') m.castShadow = true; g.add(m); }   // (11-18: a big one casts from its shadow tiles)
  return g;
}
