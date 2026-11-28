import { finishBuild } from '../engine/buildSteps';
// 据点「嵩山南麓 · 断碑古窑」（act-125 大幅扩建至约 30×27 米，分区清晰、镜头柔和跟人）：
//   正北 · 青砖古窑锻坊：半塌砖拱窑 + 铁炉炭火 + 铁砧淬水槽，冯铁臂在窑口打铁淬刀；
//   中庭北台（青石礼台）：
//     - 左：文家刀廊（4 槽 3D 体素刀架，走近拔刀换武）
//     - 中：刻名复仇碑 + 供台香烛（碑铭潜能）
//     - 右：乌漆铜扣信物匣（8 件随身信物选带）
//   西翼 · 大试剑坪：宽阔夯土场 + 8 根挂铃木桩 + 3 个拉宽间距的木人桩 + 4 块陪练石板，换完名刀当场试手；
//   西北 · 石阶酒台：上山石阶 + 酒坛酒碗，桓越坐于石阶畅饮；
//   东北 · 孙媪药庐药圃：草棚、晾药架、药炉、药圃苗床、主角醒来的草席，孙媪坐镇；
//   东翼 · 竹溪水榭：暗渠青石溪流 + 木栏水榭 + 观溪小桥，卢昭倚栏听竹；
//   东南 · 杜五车马伙房：黑篷车、灰驴、热气腾腾的锅灶与木凳；
//   南门 · 出征山道：挂灯山门 + 门阙石墩 + 外廊出发通道。
// 调试：__dh.hideout(time?, weather?, view?)、__dh.hideoutSolids(on?)。
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
/** a collision shape on the floor (metres): an axis-aligned box (half sizes) or a circle, with optional low/steppable height */
export type HideoutSolid = (
  | { shape: 'box'; x: number; z: number; hx: number; hz: number }
  | { shape: 'circle'; x: number; z: number; r: number }
) & { maxY?: number; steppable?: boolean };

/** the layout contract (metres; x right, z toward the camera, yaw 0 = facing the camera) */
export const HIDEOUT: {
  floor: { x0: number; x1: number; z0: number; z1: number };
  spawn: [number, number];
  people: Record<PersonId, { x: number; z: number; yaw: number }>;
  stele: { x: number; z: number; yaw: number };
  weaponRack: { x: number; z: number; yaw: number };
  keepsakeBox: { x: number; z: number; yaw: number };
  /** act-139 D1: 古窑长明灯（中庭西侧，典藏阁总入口） */
  lantern: { x: number; z: number };
  /** act-139 A5: 西翼试剑坪「试锋碑」（自由约战五首领与试配秘传） */
  trialStele: { x: number; z: number };
  gardenPlots: Array<{ x: number; z: number }>;
  list: { x: number; z: number };
  dummies: Array<[number, number]>;
  slabs: Array<[number, number]>;
  exit: { x0: number; x1: number; z: number };
  solids: HideoutSolid[];
} = {
  // act-125 / act-132: expanded courtyard + eastern Bamboo Stream Garden Terrace (38 × 29 m) + road-end departure pass
  floor: { x0: -14.8, x1: 23.6, z0: -12.6, z1: 16.4 },
  // on 孙媪's straw mat in the northeast herb courtyard, where the heroine wakes
  spawn: [10.4, -9.2],
  people: {
    duwu: { x: 7.9, z: 7.4, yaw: -0.65 },            // southeast camp by cook-fire, cart and donkey
    sunao: { x: 12.25, z: -9.4, yaw: -1.15 },        // northeast herb shelter beside straw mat & stove
    fengtiebi: { x: 0.25, z: -10.8, yaw: 0.25 },     // north kiln bay at the anvil
    luzhao: { x: 12.6, z: -2.4, yaw: -1.35 },        // east bamboo stream pavilion north of the garden bridge
    huanyue: { x: -11.2, z: -11.25, yaw: 0.3 },      // northwest stone steps by the wine jar
  },
  // 中庭北台三大枢纽：左·文家刀廊 / 中·复仇碑 / 右·信物匣（开阔青石礼台，走近即可交互）
  weaponRack: { x: -3.6, z: -5.2, yaw: 0 },
  stele: { x: 0.65, z: -5.3, yaw: 0 },
  keepsakeBox: { x: 4.55, z: -5.1, yaw: 0 },
  lantern: { x: -4.4, z: -0.9 },
  trialStele: { x: -6.0, z: 2.8 },
  // act-132 东翼跨溪「竹溪梯田药圃」6 块 3D 体素药畦（2 列 × 3 行，通道宽敞、独立交互）
  gardenPlots: [
    { x: 18.6, z: -4.8 }, { x: 21.6, z: -4.8 },
    { x: 18.6, z: -1.2 }, { x: 21.6, z: -1.2 },
    { x: 18.6, z: 2.4 },  { x: 21.6, z: 2.4 },
  ],
  list: { x: 0.65, z: -5.3 },
  // 西翼大试剑坪：宽阔练招空间，三具木人桩拉开间距，四块召唤石板排在前缘
  dummies: [[-11.8, -1.6], [-8.8, -1.6], [-10.3, 1.5]],
  slabs: [[-13.0, 5.1], [-11.2, 5.1], [-9.4, 5.1], [-7.6, 5.1]],
  // 南门出征山道真正尽头（石阙与金色光幕紧贴路端 z = 15.6..15.85）
  exit: { x0: -0.85, x1: 1.65, z: 15.6 },
  solids: [],
};

// ------------------------------------------------------------------ the plan in cells (the build and the solids both read it)
const C = (m: number) => M(m);
const KILN = { X: C(-1.0), Z: C(-12.6) };                                // north brick kiln vault
const FORGE = { X: KILN.X - 13, Z: KILN.Z + 13 };
const WALL = { X0: KILN.X + 56, X1: C(14.8), Z0: C(-12.8), Z1: C(-12.3), H: 33 };
const OFFER = { X: C(HIDEOUT.stele.x + 1.15), Z: C(HIDEOUT.stele.z - 0.1) };
const RACK = { X0: WALL.X0 + 8, Z: WALL.Z1 + 1 };                        // 30-blade memorial wall rack on north wall
const CORNER = { X0: C(10.6), X1: C(13.8), Zp: C(-11.4), Zr: C(-11.0) }; // 孙媪's lean-to
const SIDE = { X0: C(14.0), X1: C(14.6), Z1: C(-7.8) };
const STOVE = { X: C(12.35), Z: C(-10.75) }, TABLE = { X: C(12.6), Z: C(-7.85) }, MAT = { X: C(9.8), Z: C(-10.2) };
const HERB_BEDS: Array<[number, number]> = [[C(9.8), C(-5.8)], [C(12.2), C(-5.8)]];
const CH = { X0: C(14.8), X1: C(15.8), Z1: C(30.0) };                    // east stone water channel extending down the south valley
const RAIL = { X: C(14.25), Z0: C(-3.6), Z1: C(2.8) };                   // 卢昭's waterside rail
const STEP = { X: C(-11.2), Z: C(-11.2), hw: 18, rise: 5, run: 10 };     // 桓越's stone steps
const LOGS = { x0: STEP.X + STEP.hw + 4, x1: KILN.X - 58, z0: C(-12.4), z1: C(-10.6) };
const T1 = { z: C(-13.2), h: 18 }, T2 = { z: C(-16.8), h: 38 }, T3 = { z: C(-21.0), h: 58 };
const FENCE = { X: C(-15.0), runs: [[C(-9.5), C(-1.8)], [C(0.4), C(9.0)]] as Array<[number, number]> };
const PRACTICE = { X: C(-14.6), Z: C(-3.2) }, LOCKS: Array<[number, number]> = [[C(-13.5), C(-5.0)], [C(-12.9), C(-4.8)]];
const CART = { X: C(11.6), Z: C(6.0) }, FEED = { X: C(12.4), Z: C(8.5) }, POT = { X: C(6.4), Z: C(5.4) };
const DONKEY = { x: 10.8, z: 8.6 };
const VAT = { X: C(13.6), Z: C(3.2) };
const GATE = { x0: C(-1.0), x1: C(1.8), Z: C(10.6), w0: C(-15.4), w1: C(14.6) };
/** 西翼大试剑坪's ring of bell posts */
const RING = { x: -10.3, z: -0.2, rx: 3.7, rz: 4.1 };
const bellPosts = () => Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2, x = RING.x + RING.rx * Math.sin(a), z = RING.z - RING.rz * Math.cos(a), dx = RING.x - x, dz = RING.z - z;
  const ax = Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) : 0, az = ax ? 0 : Math.sign(dz);
  return { x, z, ax, az };
});
const GRASS = [0x86784a, 0x72663e, 0x968858];

function anvilAt(): [number, number] {
  const f = HIDEOUT.people.fengtiebi, c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  return [f.x + FENG_STRIKE.x * c + FENG_STRIKE.z * s, f.z - FENG_STRIKE.x * s + FENG_STRIKE.z * c];
}

// ------------------------------------------------------------------ collision: every solid thing, from the same plan
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const cbox = (x0: number, x1: number, z0: number, z1: number, maxY?: number, steppable?: boolean): HideoutSolid => ({
  shape: 'box', x: r3(((x0 + x1 + 1) / 2) * CELL), z: r3(((z0 + z1 + 1) / 2) * CELL),
  hx: r3(((x1 - x0 + 1) / 2) * CELL), hz: r3(((z1 - z0 + 1) / 2) * CELL),
  ...(maxY != null ? { maxY } : {}), ...(steppable ? { steppable: true } : {}),
});
const mbox = (x0: number, x1: number, z0: number, z1: number, maxY?: number, steppable?: boolean): HideoutSolid => ({
  shape: 'box', x: r3((x0 + x1) / 2), z: r3((z0 + z1) / 2),
  hx: r3((x1 - x0) / 2), hz: r3((z1 - z0) / 2),
  ...(maxY != null ? { maxY } : {}), ...(steppable ? { steppable: true } : {}),
});
const circ = (x: number, z: number, r: number, maxY?: number, steppable?: boolean): HideoutSolid => ({
  shape: 'circle', x: r3(x), z: r3(z), r,
  ...(maxY != null ? { maxY } : {}), ...(steppable ? { steppable: true } : {}),
});

export interface HideoutSolidOpts {
  rackBuilt?: boolean;
  forgeBuilt?: boolean;
  gardenBuilt?: boolean;
}

/** Build the hideout collision list matching only currently visible/constructed structures (zero unbuilt or phantom airwalls). */
export function hideoutSolids(opts: HideoutSolidOpts = {}): HideoutSolid[] {
  const rackBuilt = opts.rackBuilt ?? true;
  const forgeBuilt = opts.forgeBuilt ?? true;
  const gardenBuilt = opts.gardenBuilt ?? true;
  const K0 = KILN, out: HideoutSolid[] = [];
  // Kiln vault, bay walls, forge, anvil, racks, trough, coal, logs
  out.push(cbox(K0.X - 54, K0.X + 53, K0.Z - 50, K0.Z));
  out.push(cbox(K0.X - 54, K0.X - 45, K0.Z + 1, K0.Z + 34), cbox(K0.X + 44, K0.X + 53, K0.Z + 1, K0.Z + 22));
  out.push(cbox(K0.X + 32, K0.X + 43, K0.Z + 18, K0.Z + 33, 1.05, true), cbox(K0.X + 44, K0.X + 56, K0.Z + 23, K0.Z + 31, 0.95, true));
  out.push(cbox(FORGE.X - 9, FORGE.X + 8, FORGE.Z - 7, FORGE.Z + 6, 1.15), cbox(FORGE.X - 23, FORGE.X - 11, FORGE.Z - 4, FORGE.Z + 3, 0.85, true));
  const [ax, az] = anvilAt(); out.push(circ((C(ax) + 0.5) * CELL, (C(az) + 0.5) * CELL, 0.36, 0.72, true));
  out.push(cbox(K0.X - 42, K0.X - 40, K0.Z + 16, K0.Z + 30, 1.25), cbox(K0.X + 22, K0.X + 41, K0.Z + 2, K0.Z + 8, 0.68, true));
  out.push(circ((K0.X - 27 + 0.5) * CELL, (K0.Z + 29 + 0.5) * CELL, 0.34, 0.62, true));
  if (LOGS.x1 > LOGS.x0 + 2) out.push(cbox(LOGS.x0, LOGS.x1, LOGS.z0, LOGS.z1, 0.58, true));
  // North wall & 孙媪's corner + raised herb planter beds
  out.push(cbox(WALL.X0, WALL.X1, WALL.Z0, WALL.Z1));
  const { X0, X1, Zp, Zr } = CORNER, Zw = WALL.Z1;
  out.push(cbox(X0 + 1, X1 - 1, Zw + 1, Zw + 4, 0.95, true), cbox(X0 + 2, X0 + 3, Zp - 1, Zp), cbox(X1 - 3, X1 - 2, Zp - 1, Zp), cbox(X0, X0 + 1, Zr, Zr + 1), cbox(X1 - 1, X1, Zr, Zr + 1));
  out.push(circ((X0 - 4 + 0.5) * CELL, (Zw + 7 + 0.5) * CELL, 0.38, 0.78), circ((X1 + 1 + 0.5) * CELL, (Zp + 6 + 0.5) * CELL, 0.38, 0.78));
  out.push(cbox(STOVE.X - 5, STOVE.X + 5, STOVE.Z - 4, STOVE.Z + 4, 0.74, true), cbox(TABLE.X - 7, TABLE.X + 6, TABLE.Z - 4, TABLE.Z + 3, 0.56, true));
  out.push(cbox(SIDE.X0, SIDE.X1, WALL.Z0, SIDE.Z1));
  for (const [bx, bz] of HERB_BEDS) out.push(cbox(bx - 12, bx + 12, bz - 6, bz + 6, 0.32, true));
  // 中庭北台三枢纽：文家刀廊、复仇碑+供台、信物匣 + 礼台双青铜暖炉（未建成的区域绝不生成空气墙）
  if (rackBuilt) out.push(mbox(HIDEOUT.weaponRack.x - 1.65, HIDEOUT.weaponRack.x + 1.65, HIDEOUT.weaponRack.z - 0.45, HIDEOUT.weaponRack.z + 0.45, 1.35));
  out.push(mbox(HIDEOUT.stele.x - 0.67, HIDEOUT.stele.x + 0.67, HIDEOUT.stele.z - 0.38, HIDEOUT.stele.z + 0.38));
  out.push(cbox(OFFER.X - 3, OFFER.X + 3, OFFER.Z - 2, OFFER.Z + 2, 0.58, true));
  if (forgeBuilt) out.push(mbox(HIDEOUT.keepsakeBox.x - 0.62, HIDEOUT.keepsakeBox.x + 0.62, HIDEOUT.keepsakeBox.z - 0.42, HIDEOUT.keepsakeBox.z + 0.42, 0.78, true));
  out.push(circ(-5.4, -3.5, 0.42, 0.92), circ(6.0, -3.5, 0.42, 0.92));
  // 西翼大试剑坪：bell posts (centred on the ground post, not under the overhead bell arm), practice rack, stone locks, west fence
  for (const p of bellPosts()) out.push(circ(p.x, p.z, 0.18));
  out.push(cbox(PRACTICE.X, PRACTICE.X + 2, PRACTICE.Z, PRACTICE.Z + 21, 1.28));
  for (const [x, z] of LOCKS) out.push(cbox(x - 2, x + 1, z - 1, z + 1, 0.48, true));
  for (const [a, b] of FENCE.runs) out.push(cbox(FENCE.X - 1, FENCE.X + 1, a, b, 0.92));
  // 西北石阶 & 北侧台地前沿
  out.push(cbox(STEP.X - STEP.hw - 3, STEP.X + STEP.hw + 2, STEP.Z - 3 * STEP.run + 1, STEP.Z, 0.98, true));
  out.push(cbox(C(-22), K0.X - 55, T1.z - 2, T1.z));
  // 东翼竹溪水榭：水渠与栏杆在跨溪木桥口（z = -1.6..+0.8）留出宽敞通行通道，直通东侧竹溪药圃！
  out.push(cbox(CH.X0 - 2, CH.X1 + 2, T1.z + 2, C(-1.75), 0.85), cbox(CH.X0 - 2, CH.X1 + 2, C(0.95), CH.Z1, 0.85));
  out.push(cbox(RAIL.X, RAIL.X + 1, RAIL.Z0, C(-1.75), 0.85), cbox(RAIL.X, RAIL.X + 1, C(0.95), RAIL.Z1 + 1, 0.85));
  out.push(circ((VAT.X + 0.5) * CELL, (VAT.Z + 0.5) * CELL, 0.4, 0.82, true), cbox(VAT.X - 9, VAT.X - 5, VAT.Z + 2, VAT.Z + 6, 0.65, true));
  // act-132 东翼外扩「竹溪梯田药圃」外围篱笆（贴合 2 格实木篱笆厚度）与 6 块药畦矮框碰撞（未开垦前不放隐形药畦碰撞）
  out.push(mbox(16.5, 23.62, -7.62, -7.40, 0.92), mbox(16.5, 23.62, 5.32, 5.54, 0.92), mbox(23.42, 23.66, -7.62, 5.54, 0.92));
  if (gardenBuilt) for (const gp of HIDEOUT.gardenPlots) out.push(mbox(gp.x - 0.88, gp.x + 0.88, gp.z - 0.58, gp.z + 0.58, 0.28, true));
  // 东南杜五伙房：锅灶、黑篷车、灰驴、草料槽 + 中庭西南古井
  out.push(cbox(POT.X - 9, POT.X + 9, POT.Z - 7, POT.Z + 7, 0.78), cbox(CART.X - 34, CART.X + 24, CART.Z - 11, CART.Z + 11, 1.08, true));
  out.push(mbox(DONKEY.x - 0.8, DONKEY.x + 1.12, DONKEY.z - 0.24, DONKEY.z + 0.24), cbox(FEED.X - 10, FEED.X + 8, FEED.Z - 3, FEED.Z + 12, 0.68, true));
  out.push(circ(-4.8, 8.8, 0.62));
  // 南门围墙与外廊出征山道（延伸至路尽头石阙 z = 15.8）
  const pa = GATE.x0 - 3, pb = GATE.x1 + 1;
  out.push(cbox(GATE.w0, GATE.x0 - 4, GATE.Z - 3, GATE.Z + 2), cbox(GATE.x1 + 4, GATE.w1, GATE.Z - 3, GATE.Z + 2));
  out.push(cbox(pa - 1, pa + 3, GATE.Z - 2, GATE.Z + 2), cbox(pb - 1, pb + 3, GATE.Z - 2, GATE.Z + 2), cbox(pb - 1, pb, GATE.Z - 14, GATE.Z - 3));
  // act-129 / act-132: outer departure road curbs & far-end stone piers at z = 15.8 (true end of the road!)
  out.push(cbox(GATE.x0 - 6, GATE.x0 - 2, GATE.Z + 3, C(16.4), 0.72, true), cbox(GATE.x1 + 2, GATE.x1 + 6, GATE.Z + 3, C(16.4), 0.72, true));
  // 西南草垛（2 捆实占尺寸）与南墙柴堆（移除原 (4.4..5.6, 9.0..9.9) 空地幽灵空气墙）
  out.push(cbox(C(-13.8) - 10, C(-13.8) + 8, C(9.4) - 4, C(9.4) + 3, 0.82, true), cbox(C(-3.2), C(-2.2), C(9.1), C(9.9), 0.56, true));
  return out;
}
HIDEOUT.solids.push(...hideoutSolids());

// ------------------------------------------------------------------ custom expanded hideout voxel pieces
/** Raised timber herb planter bed for 孙媪's medicinal garden */
function herbBed(c: Ctx, X: number, Z: number) {
  const w = c.w;
  const SOIL = 0x3e3226, SOIL_D = 0x2c231a;
  // Timber curb frame (25 × 13 cells = 1.75 × 0.91 m)
  w.box(X - 12, 0, Z - 6, X + 12, 3, Z + 6, HV.wood);
  w.box(X - 12, 0, Z - 6, X + 12, 0, Z + 6, HV.woodD);
  w.box(X - 12, 3, Z - 6, X + 12, 3, Z + 6, HV.woodL);
  // Dark tilled earth bed inside
  w.box(X - 10, 1, Z - 4, X + 10, 3, Z + 4, SOIL);
  for (let x = X - 8; x <= X + 8; x += 4) w.box(x, 3, Z - 4, x, 3, Z + 4, SOIL_D);
  // Ordered lush herbal clusters (green sage & amber-gold blossoms, axis-aligned blocks)
  const cols = [0x4c6e34, 0x5c8240, 0x3e5e2e, 0x6e8f48];
  for (let i = 0; i < 4; i++) {
    const px = X - 8 + i * 5;
    const pz = Z + (i % 2 ? 1 : -1);
    w.box(px - 1, 4, pz - 1, px + 1, 6, pz + 1, cols[i]);
    w.box(px, 7, pz, px + 1, 8, pz, i % 2 ? 0x86a854 : 0xd8a846);
  }
}

/** Timber lakeside observation deck & stone lantern beside 卢昭's bamboo channel */
function streamDeck(c: Ctx, X0: number, Z0: number, Z1: number) {
  const w = c.w;
  // Flush timber deck planks along the west bank of the stream
  for (let Z = Z0; Z <= Z1; Z++) {
    const joint = (Z - Z0) % 5 === 0;
    w.box(X0 - 20, -1, Z, X0 - 1, -1, Z, joint ? HV.woodD : (Z % 2 ? HV.wood : HV.woodL));
  }
  // Corner stone lantern post overlooking the stream
  const lx = X0 - 18, lz = Z0 + 4;
  w.box(lx - 2, 0, lz - 2, lx + 2, 1, lz + 2, K.stoneD);
  w.box(lx - 1, 2, lz - 1, lx + 1, 10, lz + 1, K.stone);
  w.box(lx - 2, 11, lz - 2, lx + 2, 12, lz + 2, K.stoneL);
  w.box(lx - 1, 13, lz - 1, lx + 1, 15, lz + 1, 0xffd280);
  w.box(lx - 2, 16, lz - 2, lx + 2, 17, lz + 2, K.stoneD);
  w.box(lx - 1, 18, lz - 1, lx + 1, 18, lz + 1, K.stoneL);
}

/** Ceremonial bronze tripod fire brazier flanking the central stone dais (pure 3D voxel) */
function daisBrazier(c: Ctx, X: number, Z: number, lit: boolean) {
  const w = c.w;
  const BR = 0x5c5342, BRL = 0x7e7054, BRD = 0x3b352c;
  w.box(X - 4, 0, Z - 4, X + 4, 1, Z + 4, K.stoneD);
  w.box(X - 3, 2, Z - 3, X + 3, 2, Z + 3, K.stoneL);
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) w.box(X + dx, 3, Z + dz, X + dx, 6, Z + dz, BRD);
  w.box(X - 3, 7, Z - 3, X + 3, 11, Z + 3, BR);
  w.box(X - 4, 11, Z - 4, X + 4, 12, Z + 4, BRL);
  w.box(X - 2, 11, Z - 2, X + 2, 12, Z + 2, lit ? 0xff7e2c : 0xd86024, 1);
  w.box(X - 1, 13, Z - 1, X + 1, 13, Z + 1, lit ? 0xffc864 : 0xff9238, 1);
  smoke(c, [X * CELL, 1.05, Z * CELL], { rate: 0.7, col: 0x9e9488 });
}

/** Weathered stone courtyard well with timber windlass & charcoal-tile cap (SW inner courtyard anchor) */
function courtyardWell(c: Ctx, X: number, Z: number) {
  const w = c.w;
  w.box(X - 7, 0, Z - 7, X + 7, 1, Z + 7, K.stoneD);
  w.box(X - 6, 2, Z - 6, X + 6, 8, Z + 6, K.stone);
  w.box(X - 6, 9, Z - 6, X + 6, 9, Z + 6, K.stoneL);
  w.box(X - 4, 4, Z - 4, X + 4, 9, Z + 4, null);
  w.box(X - 4, 3, Z - 4, X + 4, 3, Z + 4, K.water);
  for (const dx of [-6, 5]) w.box(X + dx, 10, Z - 1, X + dx + 1, 24, Z + 1, HV.post);
  w.box(X - 6, 17, Z, X + 6, 18, Z, HV.woodL);
  w.box(X - 8, 25, Z - 5, X + 8, 26, Z + 5, HV.tileD);
  w.box(X - 7, 27, Z - 3, X + 7, 27, Z + 3, HV.tile);
  w.box(X - 6, 28, Z - 1, X + 6, 28, Z + 1, HV.tileL);
}

/** Walkable timber footbridge spanning the east bamboo stream into the Bamboo Stream Garden Terrace */
function streamBridge(c: Ctx, X0: number, X1: number, Z0: number, Z1: number) {
  const w = c.w;
  // Flush deck planks at y = -1 so hero walks seamlessly over the stream with zero step bump
  for (let X = X0; X <= X1; X++) {
    const joint = (X - X0) % 4 === 0;
    w.box(X, -1, Z0, X, -1, Z1, joint ? HV.woodD : (X % 2 ? HV.wood : HV.woodL));
  }
  // North & south low bridge curb rails & corner lantern posts
  for (const Z of [Z0 - 1, Z1 + 1]) {
    w.box(X0, 0, Z, X1, 1, Z, HV.woodD);
    for (const X of [X0 + 1, Math.round((X0 + X1) / 2), X1 - 1]) {
      w.box(X, 0, Z, X + 1, 8, Z, HV.post);
      w.box(X, 9, Z, X + 1, 9, Z, HV.woodL);
    }
    w.box(X0 + 1, 6, Z, X1, 7, Z, HV.wood);
  }
}

/** Sleek timber & charcoal-tile waterside eave shelter over 卢昭's northern bamboo stream deck */
function pavilionShelter(c: Ctx, railX: number, Z0: number, Z1: number, lit: boolean) {
  const w = c.w;
  // Support posts strictly on the existing railX column (zero new floor obstruction!)
  for (const Z of [Z0 + 2, Z1 - 2]) {
    w.box(railX, 0, Z, railX + 1, 29, Z + 1, HV.post);
    w.box(railX - 10, 26, Z, railX + 3, 27, Z + 1, HV.woodD);
  }
  w.box(railX, 27, Z0, railX + 1, 28, Z1, HV.woodD);
  // Overhanging waterside charcoal-tile eave
  w.box(railX - 13, 29, Z0 - 2, railX + 5, 30, Z1 + 2, HV.tileD);
  w.box(railX - 11, 31, Z0 - 1, railX + 4, 31, Z1 + 1, HV.tile);
  w.box(railX - 8, 32, Z0, railX + 2, 32, Z1, HV.tileL);
  lantern(c, railX - 10, 28, Math.round((Z0 + Z1) / 2), lit);
}

/** Eastern Bamboo Stream Garden Terrace dressing: archway, bamboo irrigation chute, timber perimeter fence & buckets */
function gardenTerraceDressing(c: Ctx, lit: boolean) {
  const w = c.w;
  const x0 = C(16.6), x1 = C(23.5), z0 = C(-7.5), z1 = C(5.4);
  // Timber garden entrance archway at the east bridgehead (strictly flanking the bridge mouth z = -1.7..+0.9)
  for (const bz of [C(-1.85), C(1.05)]) {
    w.box(x0 - 1, 0, bz - 1, x0 + 1, 2, bz + 1, K.stoneD);
    w.box(x0, 3, bz, x0 + 1, 28, bz + 1, HV.post);
  }
  w.box(x0 - 1, 27, C(-2.2), x0 + 2, 28, C(1.4), HV.woodD);
  w.box(x0 - 3, 29, C(-2.4), x0 + 4, 30, C(1.6), HV.tileD);
  w.box(x0 - 2, 31, C(-2.1), x0 + 3, 31, C(1.3), HV.tileL);
  lantern(c, x0 + 2, 26, C(-1.6), lit);
  // Perimeter low bamboo-and-timber garden fence along north, east, and south terrace edges
  for (let X = x0; X <= x1; X += 12) {
    for (const Z of [z0, z1]) {
      w.box(X, 0, Z, X + 1, 10, Z + 1, HV.post);
      w.box(X, 11, Z, X + 1, 11, Z + 1, HV.woodL);
    }
  }
  for (const Z of [z0, z1]) {
    w.box(x0, 4, Z, x1, 5, Z, HV.wood);
    w.box(x0, 8, Z, x1, 9, Z, HV.woodL);
  }
  for (let Z = z0; Z <= z1; Z += 12) {
    w.box(x1, 0, Z, x1 + 1, 10, Z + 1, HV.post);
    w.box(x1, 11, Z, x1 + 1, 11, Z + 1, HV.woodL);
  }
  w.box(x1, 4, z0, x1, 5, z1, HV.wood);
  w.box(x1, 8, z0, x1, 9, z1, HV.woodL);
  // Bamboo irrigation trough along the north edge feeding water into the garden terrace
  const tw = 0x5c7c3e, twL = 0x789c52;
  w.box(CH.X1, 7, z0 + 4, x1 - 4, 8, z0 + 6, tw);
  w.box(CH.X1, 8, z0 + 5, x1 - 4, 8, z0 + 5, K.water);
  for (let X = CH.X1 + 14; X < x1 - 4; X += 22) w.box(X, 0, z0 + 4, X + 1, 6, z0 + 6, twL);
  // Watering barrels & seed basket near the terrace entry
  const bx = C(17.2), bz = C(-6.4);
  w.box(bx - 3, 0, bz - 3, bx + 2, 6, bz + 2, HV.wood);
  w.box(bx - 3, 2, bz - 3, bx + 2, 2, bz + 2, K.iron);
  w.box(bx - 3, 5, bz - 3, bx + 2, 5, bz + 2, K.iron);
  w.box(bx - 2, 6, bz - 2, bx + 1, 6, bz + 1, K.water);
  const bx2 = C(17.2), bz2 = C(4.3);
  w.box(bx2 - 3, 0, bz2 - 2, bx2 + 2, 4, bz2 + 2, HV.straw);
  w.box(bx2 - 2, 4, bz2 - 1, bx2 + 1, 5, bz2 + 1, 0x769a48);
}

// ------------------------------------------------------------------ the ground
function ground(c: Ctx) {
  const w = c.w, r = (k: number) => hash(k, 71, 3);
  const fill = (x0: number, z0: number, x1: number, z1: number, col: number | ((x: number, z: number) => number)) => {
    for (let X = C(x0); X <= C(x1); X++) for (let Z = C(z0); Z <= C(z1); Z++) w.set(X, -1, Z, typeof col === 'number' ? col : col(X, Z));
  };
  const snap = (v: number) => Math.round(v / 0.35) * 0.35;
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
  const stepRunX = (zc: number, x0: number, x1: number, hd = 7, len = 12, gap = 4, seed = 15) => {
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

  // Broad mountain grass surround (expanded east to x=30 for Bamboo Stream Garden Terrace & south to z=31.0 so departure pass extends seamlessly past camera)
  fill(-23, -14.0, 30, 31.0, GRASS[0]);
  for (let i = 0; i < 84; i++) {
    const x = -23 + r(i) * 53, z = -13 + r(50 + i) * 43, hw = 1.2 + r(100 + i) * 2.4, hd = 1.0 + r(150 + i) * 2.0;
    fill(snap(x - hw), snap(z - hd), snap(x + hw), snap(z + hd), r(200 + i) < 0.6 ? GRASS[1] : GRASS[2]);
  }
  fill(-15.4, -13.2, 14.8, 10.9, K.earth);
  // Natural subtle earth tonal patches across the big courtyard (eliminates flat single-color desert feel!)
  for (let i = 0; i < 24; i++) {
    const x = -13.5 + r(300 + i) * 26.5, z = -11.5 + r(350 + i) * 21.0;
    const hw = 1.0 + r(400 + i) * 2.1, hd = 0.8 + r(450 + i) * 1.8;
    fill(snap(x - hw), snap(z - hd), snap(x + hw), snap(z + hd), r(500 + i) < 0.5 ? K.earthD : K.earthL);
  }
  // Grounded perimeter border
  fill(-15.4, -13.2, 14.8, -11.8, K.earthD);
  fill(-15.4, 9.9, 14.8, 10.9, K.earthD);
  fill(-15.4, -13.2, -14.3, 10.9, K.earthD);
  fill(13.9, -13.2, 14.8, 10.9, K.earthD);
  // Warm trodden camp apron around Du Wu's southeast area + natural cobble hearth circle under cookfire
  fill(5.2, 3.8, 13.6, 9.5, K.earthL);
  flagstones(5.4, 4.4, 7.6, 6.4, 9, 9, 41);

  // 西翼 · 大试剑坪 (spacious 7.8 × 12.6 m timber-curbed arena)
  fill(-14.2, -5.8, -6.4, 6.8, K.yard);
  fill(-14.0, -5.6, -6.6, -5.2, K.yardD); fill(-14.0, 6.4, -6.6, 6.6, K.yardD);
  fill(-14.0, -5.6, -13.6, 6.6, K.yardD); fill(-7.0, -5.6, -6.6, 6.6, K.yardD);
  fill(-12.6, -3.4, -8.0, 2.8, K.yardD);
  fill(-12.2, -3.0, -8.4, 2.4, K.yard);
  for (const [sx, sz] of HIDEOUT.slabs) flagstones(sx - 0.55, sz - 0.45, sx + 0.55, sz + 0.45, 14, 12, 17);
  const kx0 = C(-14.2), kx1 = C(-6.4), kz0 = C(-5.8), kz1 = C(6.8);
  const entZ0 = C(-1.8), entZ1 = C(0.6);
  for (let X = kx0; X <= kx1; X++) for (const Z of [kz0, kz1]) {
    w.set(X, 0, Z, (X - kx0) % 14 === 13 ? HV.woodD : HV.wood);
    w.set(X, 0, Z === kz0 ? Z - 1 : Z + 1, HV.woodD);
  }
  for (let Z = kz0; Z <= kz1; Z++) for (const X of [kx0, kx1]) {
    if (X === kx1 && Z >= entZ0 && Z <= entZ1) continue;
    w.set(X, 0, Z, (Z - kz0) % 14 === 13 ? HV.woodD : HV.wood);
    w.set(X === kx0 ? X - 1 : X + 1, 0, Z, HV.woodD);
  }
  for (const X of [kx0 - 1, kx1]) for (const Z of [kz0 - 1, kz1]) {
    w.box(X, 0, Z, X + 1, 2, Z + 1, K.stoneD);
    w.box(X, 3, Z, X + 1, 3, Z + 1, K.stoneL);
  }

  // 中庭北台 · 青石礼台 (hosting 文家刀廊 / 复仇碑 / 信物匣, framed by a clean stone apron!)
  flagstones(-5.6, -6.5, 6.2, -3.4, 14, 10, 5);
  flagstones(-1.0, -3.4, 1.9, -2.5, 12, 8, 11); // broad front threshold step onto the dais
  // North wall 30-blade memorial apron
  flagstones(3.2, -12.2, 9.6, -10.4, 12, 10, 19);

  // Organic trodden footpaths + weathered blue-stone stepping flagstones (NO harsh CAD-tape black borders!)
  const softPath = (x0: number, z0: number, x1: number, z1: number) => fill(x0, z0, x1, z1, K.path);
  softPath(-0.7, -2.5, 1.6, 10.6);        // south gate → central ceremonial dais
  softPath(-0.6, -10.2, 1.4, -6.5);       // central dais → kiln forge bay
  softPath(-6.4, -1.6, 14.3, 0.5);        // grand east-west promenade: training yard ↔ central yard ↔ bamboo stream bridge!
  softPath(6.2, -9.2, 10.2, -6.2);        // Sun Ao herb yard → central dais
  softPath(1.6, 4.7, 5.5, 6.0);           // central road → Du Wu hearth
  softPath(-11.6, -10.6, -9.0, -5.8);     // Huan Yue stone steps → training yard
  // Dressed stepping stones guiding the eye naturally across the expanded yard
  stepRunZ(0.45, -2.2, 10.2, 10, 12, 5, 7);
  stepRunZ(0.45, -9.8, -6.8, 9, 10, 4, 13);
  stepRunX(-0.55, -5.8, 13.8, 7, 12, 5, 21);
  flagstones(-6.6, -1.6, -5.6, 0.4, 10, 10, 29);

  // act-132 东翼外扩「竹溪梯田药圃」地面（温润耕作土台 + 青石中心步道 + 跨溪桥头石阶）
  fill(16.4, -7.6, 23.6, 5.5, K.earth);
  fill(16.6, -7.4, 23.4, 5.3, K.earthL);
  flagstones(16.4, -1.5, 20.4, 0.6, 10, 10, 33);
  stepRunZ(20.1, -6.2, 4.4, 6, 11, 4, 37);

  // 南门出征山道：从南门 z=10.9 延伸至双石阙出发点 z=16.0，再自然延展为下山车辙土道直抵 z=30.5（绝不露空断崖，且中路完全低矮无遮挡！）
  fill(-1.15, 10.9, 1.95, 16.05, K.path);
  stepRunZ(0.4, 10.9, 15.65, 12, 10, 4, 23);
  flagstones(-1.05, 15.45, 1.85, 16.15, 10, 8, 43); // dressed stone threshold at the departure piers
  for (const X of [C(-1.15), C(1.95)]) for (let Z = C(11.0); Z <= C(16.1); Z++) w.set(X, -1, Z, (Z % 12 < 3) ? K.stoneD : K.earthD);
  // Continuing mountain pass road south of the departure piers (z = 16.2..30.5)
  fill(-1.35, 16.15, 2.15, 30.5, K.path);
  stepRunZ(0.4, 16.5, 22.5, 9, 8, 12, 53);
  for (const X of [C(-1.35), C(2.15)]) for (let Z = C(16.2); Z <= C(30.5); Z++) w.set(X, -1, Z, (Z % 16 < 3) ? K.stoneD : K.earthD);
  for (const X of [C(-0.55), C(1.25)]) for (let Z = C(16.6); Z <= C(30.5); Z++) { w.set(X, -1, Z, K.rut); w.set(X + 1, -1, Z, K.rut); }
}

// ------------------------------------------------------------------ the build
function* build(c: Ctx, o: { time: HideoutTime; weather: HideoutWeather }) {
  const w = c.w, lamp = lampFor(o.time, o.weather), lit = o.time === 'dusk' || o.time === 'night', wet = o.weather === 'rain';
  yield;
  ground(c);
  // Layered Mount Song terraces rising behind the expanded courtyard
  terrace(c, C(-23), KILN.X - 55, T2.z + 1, T1.z, T1.h, K.grass, 1);
  terrace(c, KILN.X + 54, C(23), T2.z + 1, WALL.Z0 - 1, T1.h, K.grass, 2);
  terrace(c, C(-23), C(23), T3.z + 1, T2.z, T2.h, K.grass, 3);
  terrace(c, C(-23), C(23), C(-26), T3.z, T3.h, K.grass, 4);
  yield;
  // 西北 · 石阶酒台 (桓越)
  steps(c, STEP.X, STEP.Z, STEP.hw, STEP.rise, STEP.run);
  { const B = loc(w, STEP.X - 12, STEP.Z - 5, 0); B(-1, 5, -2, 2, 8, 1, HV.clay); B(-1, 8, -2, 2, 8, 1, HV.clayL); B(0, 9, -1, 1, 9, 0, HV.clayD); B(0, 10, -1, 1, 10, 0, HV.red); B(4, 5, -1, 6, 5, 1, HV.grey); }
  if (LOGS.x1 > LOGS.x0 + 2) logStack(c, LOGS.x0, LOGS.x1, LOGS.z0, LOGS.z1, 8);
  // 正北 · 古窑锻坊 (冯铁臂)
  yield;
  const vault = kiln(c, KILN.X, KILN.Z);
  const fire = forge(c, FORGE.X, FORGE.Z);
  const [ax, az] = anvilAt(); anvil(c, C(ax), C(az));
  bladeRack(c, KILN.X - 42, KILN.Z + 16);
  trough(c, KILN.X + 29, KILN.Z + 5);
  forgeSupply(c, KILN.X + 18, KILN.Z + 12);
  coalBasket(c, KILN.X - 27, KILN.Z + 29);
  // 北墙 + 30 刀纪念墙 + 复仇碑供台 + 东北孙媪药庐药圃
  yield;
  northWall(c, WALL.X0, WALL.X1, WALL.Z0, WALL.Z1, WALL.H, [[C(8.4), C(9.0), 3], [WALL.X1 - 6, WALL.X1, 8]]);
  bladeWall(c, RACK.X0, RACK.Z);
  const flame = offering(c, OFFER.X, OFFER.Z, lit);
  for (let Z = WALL.Z0; Z <= SIDE.Z1; Z++) { const h = Z <= C(-10.2) ? 22 : Z <= C(-9.0) ? 14 : 7; for (let x = SIDE.X0; x <= SIDE.X1; x++) for (let y = 0; y <= h; y++) w.set(x, y, Z, y <= 2 ? (y === 2 ? K.stoneL : K.stone) : brickAt(x + Z, y)); }
  recolor(w, SIDE.X0, 3, WALL.Z0, SIDE.X1, 23, SIDE.Z1, (x, y, z) => (w.has(x, y + 1, z) ? null : K.brickL));
  yield;
  herbCorner(c, CORNER.X0, CORNER.X1, WALL.Z1, CORNER.Zp, CORNER.Zr);
  mat(c, MAT.X, MAT.X + 14, MAT.Z, MAT.Z + 28);
  const stove = medStove(c, STOVE.X, STOVE.Z, true);
  lowTable(c, TABLE.X, TABLE.Z);
  for (const [bx, bz] of HERB_BEDS) herbBed(c, bx, bz);
  pigeon(c, C(7.2), WALL.H + 3, WALL.Z0 + 3, -1); pigeon(c, C(7.8), WALL.H + 3, WALL.Z0 + 4, 1);
  // 西翼 · 大试剑坪
  for (const p of bellPosts()) bellPost(c, C(p.x), C(p.z), p.ax, p.az);
  const L = loc(w, 0, 0, 0); for (const [a, b] of FENCE.runs) wattleZ(L, a, b, FENCE.X, 10);
  practiceRack(c, PRACTICE.X, PRACTICE.Z); for (const [x, z] of LOCKS) stoneLock(c, x, z);
  // 东翼 · 竹溪水榭 (卢昭) + 跨溪木桥 + 外扩竹溪梯田药圃
  yield;
  channel(c, CH.X0, CH.X1, T1.z + 2, CH.Z1);
  culvert(c, Math.round((CH.X0 + CH.X1) / 2), WALL.Z0 - 1);
  // Split waterside rail cleanly around the wooden bridge mouth (z = -1.6..+0.8)
  railing(c, RAIL.X, RAIL.Z0, C(-1.75));
  railing(c, RAIL.X, C(0.95), RAIL.Z1);
  streamDeck(c, RAIL.X, RAIL.Z0 + 2, RAIL.Z1 - 2);
  pavilionShelter(c, RAIL.X, RAIL.Z0, C(-1.8), lit);
  streamBridge(c, RAIL.X + 1, C(16.5), C(-1.6), C(0.8));
  gardenTerraceDressing(c, lit);
  { const B = loc(w, VAT.X, VAT.Z, 0); jar(B, 0, 0, 1, true, { lid: true }); B(-9, 0, 2, -5, 4, 6, HV.wood); B(-9, 2, 2, -5, 2, 6, K.iron); B(-8, 4, 3, -6, 4, 5, K.water); B(-7, 5, 4, -7, 7, 4, HV.woodD); }
  // 中庭青石礼台双青铜暖炉 + 西南院井 + 西北古橡树灯柱
  daisBrazier(c, C(-5.4), C(-3.5), lit);
  daisBrazier(c, C(6.0), C(-3.5), lit);
  courtyardWell(c, C(-4.8), C(8.8));
  oak(w, -14.2, -11.4, 6.2, { seed: 73, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x9c6e2c, leafTop: 0xc28e3c, low: 0.44, width: 0.95, vines: 0 });
  // 东南 · 杜五车马伙房 & 南门出征山道
  yield;
  cart(c, CART.X, CART.Z);
  feed(c, FEED.X, FEED.Z);
  const pot = cookFire(c, POT.X, POT.Z, true);
  frontGate(c, GATE.w0, GATE.x0, GATE.x1, GATE.w1, GATE.Z);
  // act-129 / act-132: outer departure mountain road curbs, timber rails, lanterns & far-end stone piers right at z = 15.8 (true end of the road!)
  {
    const cz0 = GATE.Z + 4, cz1 = C(15.85);
    for (const [cx0, cx1] of [[GATE.x0 - 5, GATE.x0 - 3], [GATE.x1 + 3, GATE.x1 + 5]] as const) {
      w.box(cx0, 0, cz0, cx1, 2, cz1, K.stone);
      w.box(cx0, 3, cz0, cx1, 3, cz1, K.stoneL);
      // wooden fence posts & two timber crossbars guiding the player down to the road's end
      const px = cx0 + 1;
      for (let z = cz0 + 6; z <= cz1 - 6; z += 13) {
        w.box(px - 1, 4, z, px, 12, z + 1, HV.post);
        w.box(px - 1, 13, z, px, 13, z + 1, HV.woodL);
      }
      w.box(px, 6, cz0, px, 7, cz1, HV.wood);
      w.box(px, 10, cz0, px, 11, cz1, HV.woodL);
      // grand weathered departure stone piers (出征山阙石墩) framing the golden exit light curtain at the road's true end!
      w.box(cx0 - 1, 0, cz1 - 2, cx1 + 1, 16, cz1 + 3, K.stone);
      w.box(cx0 - 1, 0, cz1 - 2, cx1 + 1, 3, cz1 + 3, K.stoneD);
      w.box(cx0 - 2, 17, cz1 - 3, cx1 + 2, 19, cz1 + 4, K.stoneL);
      w.box(cx0 - 1, 20, cz1 - 2, cx1 + 1, 21, cz1 + 3, K.stone);
    }
    // Mid-road lantern + far-end departure pier lantern
    w.box(GATE.x0 - 4, 22, cz1, GATE.x0 - 3, 29, cz1 + 1, HV.post);
    w.box(GATE.x0 - 3, 28, cz1, GATE.x0 + 2, 29, cz1 + 1, HV.wood);
    lantern(c, GATE.x0 + 1, 27, cz1, true);
    w.box(GATE.x1 + 4, 22, cz1, GATE.x1 + 5, 29, cz1 + 1, HV.post);
    w.box(GATE.x1 - 1, 28, cz1, GATE.x1 + 4, 29, cz1 + 1, HV.wood);
    lantern(c, GATE.x1, 27, cz1, true);
  }
  lantern(c, GATE.x0 - 6, 29, GATE.Z, lit);
  lantern(c, CORNER.X1 - 1, 25, CORNER.Zp - 1, lit);
  // Lush layered bamboo valleys, oaks & mountain pass cliffs framing the expanded perimeter + eastern garden terrace + south departure pass!
  yield;
  grove(c, -22.0, -21.0, -8.5, -16.8, 34, 11, [6.8, 9.0]);
  grove(c, 7.5, -21.0, 27.5, -16.8, 42, 12, [6.8, 9.0]);
  grove(c, -23.0, -25.5, 28.0, -21.2, 58, 13, [8.6, 11.2]);
  // East bamboo framing shifted cleanly behind the new Bamboo Stream Garden Terrace (x >= 24.4) + north/south wings clear of plot sightlines
  grove(c, 16.4, -14.2, 27.5, -8.4, 34, 14, [5.6, 8.0]);
  grove(c, 24.4, -8.2, 29.2, 11.5, 48, 16, [5.8, 8.6]);
  grove(c, 17.2, 8.4, 25.5, 16.2, 30, 22, [4.6, 6.8]);
  // West hillside bamboo
  grove(c, -21.5, -12.0, -16.2, 9.0, 42, 15, [5.2, 7.8]);
  grove(c, -23.5, -16.0, -18.5, 16.5, 36, 17, [5.6, 8.0]);
  // South mountain pass bamboo framing BOTH outer flanks cleanly without poking in front of courtyard NPCs or south gate!
  grove(c, -16.2, 13.8, -5.2, 19.2, 30, 23, [3.8, 5.4]);
  grove(c, 5.6, 13.8, 15.8, 19.2, 30, 24, [3.8, 5.4]);
  deadTree(w, -16.8, -14.2, 6.0, HV.char, HV.charD, { seed: 9, crow: 0.6, moss: false });
  oak(w, -19.2, -14.8, 7.2, { seed: 33, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x866c32, leafTop: 0xaa8a40, low: 0.42, width: 1.05, vines: 0 });
  oak(w, -18.8, 3.2, 6.4, { seed: 53, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x6c7c3a, leafTop: 0x8ea04c, low: 0.40, width: 1.0, vines: 0 });
  oak(w, -17.5, 10.6, 5.8, { seed: 59, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x8a6d32, leafTop: 0xb08d42, low: 0.42, width: 0.95, vines: 0 });
  oak(w, -7.2, 13.8, 5.6, { seed: 83, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x8a6c30, leafTop: 0xb08a3e, low: 0.44, width: 0.95, vines: 0 });
  oak(w, 7.6, 14.2, 5.8, { seed: 89, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x74823c, leafTop: 0x94a44c, low: 0.44, width: 0.95, vines: 0 });
  oak(w, 18.4, -14.0, 7.6, { seed: 21, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x8a6a2c, leafTop: 0xb08a3a, low: 0.4, width: 1.1, vines: 0 });
  oak(w, 25.4, -5.2, 6.6, { seed: 61, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x62783a, leafTop: 0x829c4c, low: 0.40, width: 1.0, vines: 0 });
  oak(w, 25.2, 4.8, 6.4, { seed: 47, bark: 0x4a3c30, dark: 0x30261e, leaf: 0x7c6834, leafTop: 0xa28842, low: 0.42, width: 0.95, vines: 0 });
  for (const [bx, bz, r2] of [
    [-16.8, -9.8, 7], [-17.4, -0.4, 8], [-16.8, 5.2, 7], [-18.0, 9.2, 9],
    [-4.2, 13.0, 7], [-11.5, 14.2, 8], [4.8, 13.2, 7], [11.2, 14.4, 8],
    [17.6, -9.6, 7], [25.0, -1.8, 8], [24.8, 2.8, 8], [18.4, 7.8, 9],
  ] as const) {
    const X = C(bx), Z = C(bz);
    w.box(X - r2, 0, Z - r2, X + r2, 5, Z + r2, 0x4f6434);
    w.box(X - r2 + 2, 6, Z - r2 + 2, X + r2 - 2, 9, Z + r2 - 2, 0x647d40);
    w.box(X - r2 + 4, 10, Z - r2 + 4, X + r2 - 4, 11, Z + r2 - 4, 0x7a944c);
  }
  // Mountain pass flanking boulders & low-profile southern valley continuation (z = 16.2..28.5, low height so NEVER blocks camera sightline!)
  stoneCluster(c, C(-3.8), C(16.2));
  stoneCluster(c, C(4.6), C(16.4));
  stoneCluster(c, C(-9.2), C(12.2));
  stoneCluster(c, C(9.6), C(12.4));
  for (const [bx, bz] of [
    [-3.6, 19.6], [4.4, 20.2], [-4.8, 23.6], [5.2, 24.4], [-3.4, 27.2], [4.6, 27.6],
    [-10.4, 19.8], [10.6, 20.5], [-12.2, 24.8], [11.8, 25.2], [13.8, 22.0], [16.8, 23.5],
  ] as const) {
    const X = C(bx), Z = C(bz);
    w.box(X - 5, 0, Z - 4, X + 5, 3, Z + 4, K.stoneD);
    w.box(X - 4, 4, Z - 3, X + 4, 6, Z + 3, K.stone);
    w.box(X - 2, 7, Z - 2, X + 2, 7, Z + 2, K.stoneL);
  }
  // Low roadside timber guide posts along the downward pass (y <= 7, crisp trail readability, zero occlusion)
  for (const pz of [18.4, 21.8, 25.2, 28.4]) {
    for (const px of [-2.0, 2.75]) {
      const X = C(px), Z = C(pz);
      w.box(X, 0, Z, X + 1, 6, Z + 1, HV.post);
      w.box(X, 7, Z, X + 1, 7, Z + 1, HV.woodL);
    }
  }
  // Low autumn scrub mounds across the outer southern valley (y <= 8)
  for (const [bx, bz, r2] of [
    [-7.2, 18.8, 7], [7.8, 19.0, 7], [-8.6, 22.8, 8], [8.8, 23.4, 8],
    [-6.2, 26.8, 7], [7.2, 27.2, 7], [-14.2, 21.4, 8], [18.6, 19.5, 8],
  ] as const) {
    const X = C(bx), Z = C(bz);
    w.box(X - r2, 0, Z - r2, X + r2, 4, Z + r2, 0x4f6434);
    w.box(X - r2 + 2, 5, Z - r2 + 2, X + r2 - 2, 7, Z + r2 - 2, 0x647d40);
  }
  // Outer-flank low bamboo far from the road center so the departure valley looks lush & infinite
  grove(c, -18.5, 19.5, -7.8, 29.0, 28, 25, [3.2, 4.8]);
  grove(c, 8.6, 19.5, 22.0, 29.0, 32, 26, [3.2, 4.8]);
  // Mount Song limestone cliff outcrops
  cliffOutcrop(c, C(-13.8), T1.h + 1, C(-15.4), 24, 14, 24);
  cliffOutcrop(c, C(-20.0), T2.h + 1, C(-18.6), 28, 18, 30);
  cliffOutcrop(c, C(14.0), T1.h + 1, C(-15.6), 22, 14, 22);
  cliffOutcrop(c, C(20.2), T2.h + 1, C(-19.0), 28, 18, 28);
  cliffOutcrop(c, C(-5.0), T3.h + 1, C(-22.6), 36, 16, 26);
  cliffOutcrop(c, C(7.2), T3.h + 1, C(-22.2), 32, 16, 24);
  // Gate stone bollards & Du Wu's fireside bench
  for (const bx of [GATE.x0 - 8, GATE.x1 + 6]) {
    w.box(bx - 1, 0, GATE.Z + 4, bx + 2, 1, GATE.Z + 7, K.stoneD);
    w.box(bx, 2, GATE.Z + 5, bx + 1, 6, GATE.Z + 6, K.stone);
    w.box(bx, 7, GATE.Z + 5, bx + 1, 7, GATE.Z + 6, K.stoneL);
  }
  w.box(POT.X - 15, 0, POT.Z + 3, POT.X - 14, 3, POT.Z + 5, HV.post);
  w.box(POT.X - 8, 0, POT.Z + 3, POT.X - 7, 3, POT.Z + 5, HV.post);
  w.box(POT.X - 16, 4, POT.Z + 2, POT.X - 6, 4, POT.Z + 6, HV.wood);
  w.box(POT.X - 16, 4, POT.Z + 6, POT.X - 6, 4, POT.Z + 6, HV.woodL);
  for (const [rx, rz] of [[-6.4, 9.6], [-2.8, 9.7], [3.6, 9.6], [13.2, 3.6], [13.2, -4.1], [-14.2, 2.2], [-14.2, -4.8], [-1.4, 11.4], [2.4, 11.5]] as const) {
    const X = C(rx), Z = C(rz);
    w.box(X - 2, 0, Z - 2, X + 2, 1, Z + 1, K.stoneD);
    w.box(X - 1, 2, Z - 1, X + 1, 2, Z, K.stoneL);
    w.box(X + 3, 0, Z - 1, X + 4, 0, Z + 1, K.stone);
  }
  campSupply(c, C(9.6), C(9.6));
  strawCluster(c, C(-13.8), C(9.4), 2);
  logStack(c, C(-3.2), C(-2.2), C(9.1), C(9.9), 7);
  stoneCluster(c, C(-3.2), C(11.6));
  strawCluster(c, C(-16.6), C(-2.4), 3);
  strawCluster(c, C(-16.8), C(5.2), 3);
  stoneCluster(c, C(-16.2), C(9.6));
  logStack(c, C(-16.0), C(-15.0), C(-7.8), C(-6.4), 7);
  stoneCluster(c, C(24.6), C(-3.6));
  stoneCluster(c, C(24.6), C(4.2));
  strawCluster(c, C(17.4), C(9.8), 3);
  terraceRuin(c, C(-15.4), T1.h + 1, C(-14.2));
  terraceRuin(c, C(16.4), T2.h + 1, C(-17.8));
  // Ground dressing cards
  yield;
  const card = (kind: string, x: number, z: number, s: number, tint?: number) => { const y = surface(c, x, z); if (y != null) c.cards.add(kind, x, z, { y, s, tint }); };
  for (let i = 0; i < 28; i++) { const x = -4.6 + hash(i, 1, 9) * 7.4, z = -16.0 + hash(i, 2, 9) * 3.3; card(i % 3 ? 'weeds' : 'grass', x, z, 0.55 + hash(i, 3, 9) * 0.3, 0xb0a078); }
  for (let i = 0; i < 110; i++) { const x = -22 + hash(i, 4, 9) * 44, z = -20 + hash(i, 5, 9) * 7.0; if (Math.abs(x + 1.0) < 4.0 && z > -16.2) continue; card(i % 4 ? 'grass' : 'weeds', x, z, 0.5 + hash(i, 6, 9) * 0.4, i % 2 ? 0xc8b890 : 0xb4a878); }
  for (let i = 0; i < 72; i++) { const z = -12.0 + hash(i, 7, 9) * 41, x = hash(i, 8, 9) < 0.5 ? 16.0 + hash(i, 9, 9) * 0.6 : 14.4 + hash(i, 10, 9) * 0.2; if (z > -2.2 && z < 1.4) continue; if (x < 14.8 && z < 3.0 && z > -4.0) continue; card('reeds', x, z, 0.6 + hash(i, 11, 9) * 0.5, 0xb8b088); }
  for (let i = 0; i < 520; i++) {
    const x = -22 + hash(i, 15, 9) * 50, z = -13 + hash(i, 16, 9) * 43;
    if (x > -15.4 && x < 14.8 && z < 11.0) continue;
    if (x > 16.2 && x < 24.0 && z > -7.8 && z < 5.8) continue; // keep eastern Bamboo Stream Garden Terrace crisp & clean!
    if (x > -1.5 && x < 2.3 && z > 10.6 && z < 30.2) continue; // keep south departure road & continuing mountain pass clean!
    const isFlank = x < -15.4 || x > 23.8 || z > 11.4;
    card(isFlank && i % 3 === 0 ? 'vtuft' : (i % 5 ? 'grass' : 'weeds'), x, z, 0.48 + hash(i, 17, 9) * 0.42, isFlank ? (i % 2 ? 0x9eb878 : 0xb8c488) : (i % 3 ? 0xc8b890 : 0xa8b080));
  }
  for (const [px, pz, s] of [
    [-0.8, 8.4, 1.05], [1.6, 8.1, 1.0], [-0.4, 3.2, 1.02], [2.6, -1.8, 0.96], [5.8, -3.5, 1.05],
    [-6.2, 6.6, 1.02], [-6.2, -5.8, 0.98], [-14.0, 8.2, 1.05], [9.8, -2.4, 0.96], [2.4, 11.6, 1.12],
    [-1.4, 12.2, 1.08], [4.8, 11.4, 1.05], [-5.8, 10.8, 1.12], [8.6, 8.8, 0.98], [0.6, 1.4, 0.95],
    [17.4, -3.0, 0.95], [20.1, 1.0, 0.95], [22.6, -2.8, 0.92],
  ] as const) {
    c.cards.add('vpebble', px, pz, { y: 0.012, s, tint: 0xffffff });
  }
  for (const [lx, lz, s] of [
    [12.4, -3.2, 1.1], [12.0, 1.4, 1.05], [10.4, 8.2, 1.0], [-14.0, 2.5, 1.1], [-13.6, -6.6, 1.05],
    [-1.4, 8.9, 1.02], [6.8, 4.8, 0.96], [1.8, -6.5, 0.98], [-4.2, 11.4, 1.15], [5.2, 11.2, 1.1],
    [17.6, 3.4, 1.05], [22.4, -6.2, 1.05], [0.4, 14.2, 1.02],
  ] as const) {
    c.cards.add('vleaf', lx, lz, { y: 0.010, s, tint: 0xffffff });
  }
  if (wet) {
    for (const [k, cell] of w.cells) if ((Math.floor(k / 1024) % 1024) - 512 === -1 && !cell.g) cell.c = mixC(cell.c, 0x2a2c34, 0.18);
    for (const [x, z, s] of [[-9.6, 0.9, 0.9], [0.4, 13.8, 0.7], [4.6, -1.4, 0.8], [-0.6, -9.1, 0.65], [8.4, 1.9, 0.65], [-11.6, -3.6, 0.6], [1.2, 6.2, 0.55]] as Array<[number, number, number]>) c.cards.add('puddle', x, z, { y: 0.004, s, tint: o.time === 'night' ? 0x7a8698 : o.time === 'dusk' ? 0xa8b4c4 : 0xd0d8e4 });
  }
  // Warm lights across every major wing of the expanded hideout (kiln, cookfire, twin dais braziers, east garden archway & road-end departure piers)
  c.light([fire[0], 0.7, fire[2]], 0xff5a24, 3.6 * Math.max(0.65, lamp), 7.5);
  c.light([pot.fire[0], 0.55, pot.fire[2]], 0xff8a40, 2.4 * Math.max(0.5, lamp), 5.0);
  c.light([-5.4, 1.1, -3.5], 0xff9240, 1.6 * Math.max(0.55, lamp), 5.5);
  c.light([6.0, 1.1, -3.5], 0xff9240, 1.6 * Math.max(0.55, lamp), 5.5);
  c.light([17.2, 1.7, -1.2], 0xffc470, (lit ? 1.8 : 0.75) * Math.max(0.55, lamp), 6.2);
  c.light([0.4, 1.9, 15.8], 0xffb858, (lit ? 2.2 : 0.9) * Math.max(0.6, lamp), 6.5);
  if (lit) c.light([flame[0] - 0.4, flame[1] + 0.3, flame[2] + 0.7], 0xffb060, 1.0 * lamp, 2.8);
  // Smoke, steam, embers & shafts
  smoke(c, [fire[0] + 0.1, 0.9, fire[2]], { rate: wet ? 1.6 : 1.1, col: 0x6e6862 });
  smoke(c, stove.steam, { rate: 0.7, col: 0xc8c4bc }); smoke(c, pot.lid, { rate: 0.8, col: 0xd0ccc4 });
  c.ambient({ kind: 'embers', color: 0xff7a30, rate: 1.6, area: { x0: fire[0] - 0.45, z0: fire[2] - 0.35, x1: fire[0] + 0.45, z1: fire[2] + 0.35 }, y: [0.35, 0.9] });
  c.shaft(fire[0] + 0.9, fire[2] + 0.3, { w: 2.6, h: 7.5, tilt: 0.2, yaw: 0.25, a: o.time === 'day' ? 0.12 : wet ? 0.16 : 0.2 });
  c.shaft(vault.hole[0], vault.hole[1] + 0.3, { w: 1.6, h: 6, tilt: 0.12, yaw: 0.2, a: o.time === 'day' ? 0.12 : 0.18 });
  if (wet) { c.ambient({ kind: 'rain', color: 0xc8dcf6, rate: 28, area: { x0: -4.2, z0: -12.5, x1: 2.2, z1: -10.2 }, follow: false }); }
  for (const a of weatherAmbient(o.weather, o.weather === 'snow' ? 'winter' : 'autumn', o.time, true)) {
    c.ambient(a.kind === 'rain' || a.kind === 'snow' ? { ...a, area: { x0: -20, z0: -18, x1: 24, z1: 20 } } : a);
  }
  yield;
}

function addDonkey(c: Ctx) {
  const donkey = new BattleActor(HIDEOUT_DONKEY); donkey.place(V3(DONKEY.x, 0, DONKEY.z), Math.PI / 2); donkey.yaw = Math.PI / 2; trimShadows(donkey.root, 3); c.add(donkey.root);
  const blob = contactShadow(1.1); blob.position.set(DONKEY.x - 0.1, 0.02, DONKEY.z); blob.scale.set(1.6, 1, 0.8); c.add(blob);
  DONKEYS.add(donkey);
  if (!donkeyHook) { donkeyHook = true; onUpdate(dt => { for (const d of DONKEYS) { if (inScene(d.root)) d.update(dt); else if (!d.root.parent?.parent) DONKEYS.delete(d); } }); }
}
const DONKEYS = new Set<BattleActor>(); let donkeyHook = false;
const inScene = (o: THREE.Object3D) => { let p: THREE.Object3D | null = o; while (p) { if (p === scene) return true; p = p.parent; } return false; };

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

export function hideoutScene(o: { time: HideoutTime; weather: HideoutWeather }): SceneDef {
  return { id: `hideout_${o.time}_${o.weather}`, name: '断碑古窑', group: '节点', kind: '户外', blurb: '嵩山南麓 · 断碑古窑', mood: moodFor(o.time, o.weather === 'snow' ? 'winter' : 'autumn', o.weather), pack: o.time === 'dusk' && o.weather === 'clear' ? 'yard' : undefined,
    build: c => finishBuild(build(c, o)), buildSteps: c => build(c, o), decorate: addDonkey };
}

/** Du Wu's hearthside memorial (杜五的遗灶, pure 3D voxel grounded at y = 0, zero extra airwalls):
 *  weathered timber ration table, red-cloth-sealed stove wine jar, warm flatbread on hemp cloth, clay coin jar, and a soft white mourning paper lantern. */
export function buildDuwuMemorial(): THREE.Group {
  const vw = new VoxWorld(CELL);
  const WD = 0x422d1e, WM = 0x5c402a, WL = 0x76543a;
  const CLAY_D = 0x623a24, CLAY = 0x865234, CLAY_L = 0xa26846;
  const RED = 0x9e2820, CORD = 0x36281c;
  const HEMP = 0x9c8664, BREAD = 0xd6a456, BREAD_L = 0xe8be72;
  const BOWL = 0xb8ae9c, BOWL_D = 0x867e70;
  const LANTERN = 0xeee8da, LANTERN_G = 0xfff0c4, CAP = 0x322a24;

  // Low weathered wooden stand (grounded at y = 0, top at y = 5 -> 0.42m)
  for (const [lx, lz] of [[-5, -3], [4, -3], [-5, 2], [4, 2]]) vw.box(lx, 0, lz, lx + 1, 4, lz + 1, WD);
  vw.box(-6, 4, -4, 6, 5, 4, WM);
  vw.box(-6, 5, -4, 6, 5, 4, WL);
  vw.box(-3, 6, -3, 4, 6, 3, HEMP);

  // Red-cloth-sealed stove-buried wine jar (灶底老酒) on left
  vw.box(-5, 6, -2, -2, 7, 1, CLAY_D);
  vw.box(-5, 8, -2, -2, 10, 1, CLAY);
  vw.box(-4, 11, -1, -3, 11, 0, CLAY_L);
  vw.box(-5, 12, -2, -2, 13, 1, RED);
  vw.box(-4, 11, 1, -3, 11, 1, CORD);

  // Warm flatbreads wrapped on hemp cloth in center
  vw.box(-1, 7, -1, 2, 7, 2, BREAD);
  vw.box(0, 8, 0, 1, 8, 1, BREAD_L);

  // Clay soup bowl & coin jar on right
  vw.box(3, 7, -2, 5, 8, 0, BOWL);
  vw.box(3, 7, -2, 5, 7, 0, BOWL_D);
  vw.box(3, 7, 1, 5, 9, 3, CLAY_D);
  vw.box(3, 9, 1, 5, 9, 3, CLAY);

  // Slender dark-timber pole + hanging white paper mourning lantern at back-left
  vw.box(-7, 0, -4, -6, 22, -3, WD);
  vw.box(-6, 22, -4, -2, 22, -3, WM);
  vw.box(-2, 21, -3, -2, 21, -3, CORD);
  vw.box(-3, 20, -4, -1, 20, -2, CAP);
  vw.box(-3, 15, -4, -1, 19, -2, LANTERN);
  vw.box(-2, 16, -3, -2, 18, -3, LANTERN_G);
  vw.box(-3, 14, -4, -1, 14, -2, CAP);

  const g = new THREE.Group();
  for (const m of vw.build({ rim: 0.25, edge: 0.14, ground: true })) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  const light = new THREE.PointLight(0xffbe74, 1.45, 5.2, 1.8);
  light.position.set(-2 * CELL, 17 * CELL, -3 * CELL);
  g.add(light);
  return g;
}

/** Single warm clay soup bowl placed for Du Wu's empty seat in Ending C */
export function buildExtraBowl(): THREE.Group {
  const vw = new VoxWorld(CELL);
  vw.box(-2, 0, -2, 2, 0, 2, 0x5c402a); // small wooden stool/trivet
  vw.box(-2, 1, -2, 2, 2, 2, 0x9c9486); // clay bowl body
  vw.box(-1, 3, -1, 1, 3, 1, 0xe8b868); // warm broth
  const g = new THREE.Group();
  for (const m of vw.build({ rim: 0.2, edge: 0.12, ground: true })) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

/** act-156: half cloth-wrapped warm flatbread that rolls onto the snow when Du Wu's fingers slip open (duwu_die line 7) */
export function buildFlatbreadProp(): THREE.Group {
  const vw = new VoxWorld(CELL * 0.90);
  vw.box(-2, 0, -2, 2, 1, 2, 0xc2b090); // coarse hemp cloth wrap
  vw.box(-1, 1, -1, 2, 2, 1, 0xdfa84e); // golden flatbread peeking out
  vw.box(0, 2, 0, 1, 2, 1, 0xf2ca78);
  const g = new THREE.Group();
  for (const m of vw.build({ rim: 0.22, edge: 0.14 })) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

/** act-156: warm steaming clay bowl cupped in Liu Bai's hands during Ending C ("两只手捧住温热的陶碗") */
export function buildHeldBowl(): THREE.Group {
  const vw = new VoxWorld(CELL * 0.62);
  vw.box(-2, 0, -2, 2, 1, 2, 0x8a8274);
  vw.box(-2, 2, -2, 2, 2, 2, 0xb2aa9a);
  vw.box(-1, 2, -1, 1, 2, 1, 0xe8ba6a); // warm golden soup
  const g = new THREE.Group();
  for (const m of vw.build({ rim: 0.2, edge: 0.12 })) { m.castShadow = true; g.add(m); }
  return g;
}

/** act-156: small crimson-lacquered wooden box (朱漆匣) holding Father Wen's thumb in ch3_after */
export function buildLacquerBox(): THREE.Group {
  const vw = new VoxWorld(CELL * 0.65);
  vw.box(-2, 0, -2, 2, 2, 2, 0x8e1e1a);
  vw.box(-2, 2, -2, 2, 2, 2, 0xb02822);
  vw.box(-1, 1, 2, 1, 1, 2, 0xdca840); // bronze clasp
  const g = new THREE.Group();
  for (const m of vw.build({ rim: 0.22, edge: 0.12 })) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

/** act-156: four gleaming Wen-family blades laid neatly on the hall flagstones in Ending B ("解下背后的四柄刀放在地上") */
export function buildLaidBlades(): THREE.Group {
  const vw = new VoxWorld(CELL * 0.72);
  const STEEL = 0xd4dde8, EDGE = 0xf4f8ff, GUARD = 0x2e2a30, GRIP = 0x8e241e, RING = 0xdca840;
  for (let i = 0; i < 4; i++) {
    const z = -6 + i * 4;
    vw.box(-9, 0, z, 3, 0, z, STEEL);
    vw.box(-9, 0, z + 1, 2, 0, z + 1, EDGE);
    vw.box(4, 0, z - 1, 4, 1, z + 1, GUARD);
    vw.box(5, 0, z, 8, 0, z, GRIP);
    vw.box(9, 0, z, 10, 0, z + 1, RING);
  }
  const g = new THREE.Group();
  for (const m of vw.build({ rim: 0.25, edge: 0.14, ground: true })) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

// ================================================================== debug: __dh.hideout(time?, weather?, view?), __dh.hideoutSolids(on?)
let SHADOW_TEX: THREE.Texture | null = null;
function contactShadow(r = 0.7) {
  if (!SHADOW_TEX && typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); SHADOW_TEX = new THREE.CanvasTexture(cv);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0608, map: SHADOW_TEX, transparent: true, opacity: 0.6, depthWrite: false }));
  m.renderOrder = 2; return m;
}
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
const CAMS: Record<'wide' | 'lineup', [number[], number[], number]> = { wide: [[0.4, 22.0, 26.0], [0.4, 0, -1.8], 46], lineup: [[0, 8.6, 14.2], [0, 0.55, -0.6], 34] };

function showHideout(time: HideoutTime = 'dusk', weather: HideoutWeather = 'clear', view: View = 'wide', ids: PersonId[] = ['duwu', 'sunao', 'fengtiebi', 'luzhao', 'huanyue']) {
  const act = (dh.api.act as (() => ActShow) | undefined)?.(); if (!act) return 'no game';
  if (!hooked) { hooked = true; onUpdate(dt => { if (!LIVE) return; if (currentStage() !== LIVE.stage) { clearLive(); return; } for (const a of LIVE.actors) a.update(dt); if (LIVE.shadowAt) followShadow(...LIVE.shadowAt); }); }
  clearLive();
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
  const h = act.hero, at: [number, number] = view === 'game' ? HIDEOUT.spawn : view === 'lineup' ? [-5.3, -0.4] : [0.6, -2.0];
  h.pos.set(at[0], 0, at[1]); h.vel.set(0, 0, 0); h.a.yaw = view === 'game' ? -0.6 : 0;
  act.banner.hide(); act.hud.on = view === 'game';
  const cam = view === 'game' ? null : CAMS[view]; (dh.api.cam as (b: number[] | null, l?: number[], fov?: number) => void)(cam ? cam[0] : null, cam?.[1], cam?.[2]);
  return { calls: (dh.api.stats as () => { calls: number })().calls, solids: HIDEOUT.solids.length };
}

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

export function rackBlades(n: number): THREE.Group {
  const g = new THREE.Group(); n = Math.max(0, Math.min(30, Math.floor(n))); if (!n) return g;
  const w = new VoxWorld(CELL), Z = RACK.Z;
  for (let i = 0; i < n; i++) {
    const x = RACK.X0 + 1 + (i % 10) * 2, y = RACK_RAILS[Math.floor(i / 10)];
    w.box(x, y - 1, Z, x, y - 1, Z, 0xb08040); w.box(x, y - 2, Z, x, y - 2, Z, 0x7a2a20); w.box(x, y - 3, Z, x, y - 3, Z, 0x2a2a30);
    w.box(x, y - 7, Z, x, y - 4, Z, 0xb4bcc6); w.box(x, y - 8, Z, x, y - 8, Z, 0xe2e8ee);
  }
  for (const m of w.build({ rim: 0.25, edge: 0.14 })) { if (!m.userData.shadowTiled && m.name !== 'shadowTile') m.castShadow = true; g.add(m); }
  return g;
}
