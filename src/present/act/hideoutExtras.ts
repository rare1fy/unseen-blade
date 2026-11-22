// act-139: 据点 3D 体素新增实物（纯横平竖直体素块，零光滑曲面）：
//   - D1 古窑长明灯台（随灯油总数火焰渐旺）
//   - A4 四件古窑装潢（青铜风铃 / 古窑石灯 / 檐下卧猫 / 竹溪纸灯船，含轻柔实景动画）
//   - A5 西翼试剑坪「试锋碑」（自由约战首领与自由配招入口）
import * as THREE from 'three';
import { VoxWorld } from '../look/voxkit';
import { CELL } from '../bestiary/kit';
import type { HideoutDecorId } from './collectors';

function buildVox(w: VoxWorld, castShadow = true): THREE.Group {
  const g = new THREE.Group();
  for (const m of w.build({ rim: 0.22, edge: 0.14 })) {
    if (castShadow && !m.userData.shadowTiled && m.name !== 'shadowTile') m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** D1: 古窑「长明灯」3D 体素铜灯台（底座青石 + 汉制铜柱 + 灯盏 + 随灯油渐盛的暖金火焰） */
export function buildLanternStand(oilTotal: number): { g: THREE.Group; tick: (t: number) => void } {
  const w = new VoxWorld(CELL * 0.85);
  const ST = 0x6c6862, ST_D = 0x4c4a46, ST_L = 0x8e8a82;
  const BR = 0xb8823c, BR_D = 0x765022, BR_L = 0xe8bc68;
  // stepped Han stone pedestal
  w.box(-4, 0, -4, 3, 1, 3, ST_D);
  w.box(-3, 2, -3, 2, 3, 2, ST);
  w.box(-3, 3, -3, 2, 3, 2, ST_L);
  // bronze column + collar rings
  w.box(-1, 4, -1, 0, 14, 0, BR_D);
  w.box(-2, 7, -2, 1, 7, 1, BR);
  w.box(-2, 12, -2, 1, 12, 1, BR);
  // flared lotus lamp dish
  w.box(-3, 15, -3, 2, 15, 2, BR_D);
  w.box(-4, 16, -4, 3, 16, 3, BR);
  w.box(-3, 17, -3, 2, 17, 2, BR_L);
  w.box(-2, 17, -2, 1, 17, 1, 0x382012); // oil basin

  const g = buildVox(w);
  const level = oilTotal >= 20 ? 3 : oilTotal >= 10 ? 2 : oilTotal >= 3 ? 1 : 0;
  const flameH = 0.22 + level * 0.08;
  const flameW = 0.14 + level * 0.03;
  const flameG = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.BoxGeometry(flameW, flameH, flameW),
    new THREE.MeshBasicMaterial({ color: level >= 2 ? 0xffd268 : 0xff9a3c }),
  );
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(flameW * 0.56, flameH * 0.68, flameW * 0.56),
    new THREE.MeshBasicMaterial({ color: 0xfff6d2 }),
  );
  inner.position.y = -flameH * 0.06;
  flameG.add(outer, inner);
  flameG.position.set(0, 18 * CELL * 0.85 + flameH * 0.45, 0);
  g.add(flameG);

  const pt = new THREE.PointLight(0xffb858, 1.1 + level * 0.45, 6.5 + level * 1.4, 1.5);
  pt.position.set(0, 1.45, 0);
  g.add(pt);

  return {
    g,
    tick: (t: number) => {
      const f = 1 + Math.sin(t * 9.5) * 0.09 + Math.sin(t * 17.3) * 0.05;
      flameG.scale.set(1 + (1 - f) * 0.4, f, 1 + (1 - f) * 0.4);
      pt.intensity = (1.1 + level * 0.45) * (0.92 + 0.08 * Math.sin(t * 8.1));
    },
  };
}

/** A5: 西翼试剑坪「试锋碑」3D 体素小石碑（自由约战首领 & 自由配招沙盒入口） */
export function buildTrialStele(): THREE.Group {
  const w = new VoxWorld(CELL * 0.85);
  const ST = 0x5c626e, ST_D = 0x383c46, ST_L = 0x8690a0, GOLD = 0xe8b858, RED = 0xb83028;
  w.box(-4, 0, -3, 3, 2, 2, ST_D);
  w.box(-3, 3, -2, 2, 16, 1, ST);
  w.box(-3, 16, -2, 2, 16, 1, ST_L);
  w.box(-2, 17, -1, 1, 18, 0, ST_L);
  // carved gold blade emblem on front face
  w.box(-1, 6, 2, 0, 13, 2, GOLD);
  w.box(-2, 8, 2, 1, 8, 2, GOLD);
  w.box(-1, 5, 2, 0, 5, 2, RED);
  return buildVox(w);
}

/** A4: 四件古窑 3D 体素小装潢，含轻柔呼吸/风摆/流水动画 */
export function buildHideoutDecor(decors: Record<HideoutDecorId, boolean>): { g: THREE.Group; tick: (t: number) => void } {
  const root = new THREE.Group();
  const anims: Array<(t: number) => void> = [];

  // 1. 古窑石灯（中庭礼台左右两盏汉制石灯）
  if (decors.stone_lamp) {
    const mkLamp = (x: number, z: number) => {
      const w = new VoxWorld(CELL * 0.9);
      const ST = 0x726e66, ST_D = 0x4e4c46, ST_L = 0x98948a;
      w.box(-3, 0, -3, 2, 1, 2, ST_D);
      w.box(-1, 2, -1, 0, 10, 0, ST);
      w.box(-3, 11, -3, 2, 11, 2, ST_L);
      // four corner pillars around glowing firebox
      for (const [cx, cz] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) w.box(cx, 12, cz, cx, 15, cz, ST_D);
      w.box(-1, 12, -1, 0, 14, 0, 0xffd270, 1);
      // pitched square stone roof
      w.box(-4, 16, -4, 3, 16, 3, ST_D);
      w.box(-3, 17, -3, 2, 17, 2, ST);
      w.box(-1, 18, -1, 0, 18, 0, ST_L);
      const g = buildVox(w);
      g.position.set(x, 0, z);
      const pt = new THREE.PointLight(0xffb656, 1.05, 6.2, 1.5);
      pt.position.set(0, 1.05, 0);
      g.add(pt);
      root.add(g);
      anims.push(t => { pt.intensity = 0.95 + 0.14 * Math.sin(t * 7.2 + x); });
    };
    mkLamp(-2.1, -2.3);
    mkLamp(3.3, -2.3);
  }

  // 2. 青铜风铃（东翼竹溪水榭木架悬铜铃 + 朱砂风签）
  if (decors.windchime) {
    const postW = new VoxWorld(CELL * 0.85);
    postW.box(-1, 0, -1, 0, 26, 0, 0x5c3c22);
    postW.box(-2, 0, -2, 1, 1, 1, 0x62605c);
    postW.box(-1, 25, -1, 7, 26, 0, 0x724c2a);
    const frame = buildVox(postW);
    frame.position.set(13.2, 0, -4.3);

    const bellW = new VoxWorld(CELL * 0.75);
    bellW.box(0, -2, 0, 0, 0, 0, 0x4a3826);
    bellW.box(-1, -5, -1, 1, -3, 1, 0xc89844);
    bellW.box(-2, -8, -2, 2, -6, 2, 0xa8762e);
    bellW.box(0, -14, 0, 0, -9, 0, 0xc22c24); // crimson wind-tag
    const bell = buildVox(bellW, false);
    bell.position.set(6 * CELL * 0.85, 25 * CELL * 0.85, 0);
    frame.add(bell);
    root.add(frame);
    anims.push(t => {
      bell.rotation.z = Math.sin(t * 2.1) * 0.16 + Math.sin(t * 4.7) * 0.05;
      bell.rotation.x = Math.cos(t * 1.7) * 0.08;
    });
  }

  // 3. 檐下卧猫（3.5cm 精细体素狸花猫，蜷在孙婆婆药炉石凳旁呼吸打盹）
  if (decors.eaves_cat) {
    const catW = new VoxWorld(CELL * 0.5);
    const FUR = 0xd6a662, FUR_L = 0xf2dfc0, FUR_D = 0x7a4e26, NOSE = 0xe88c8c;
    // stone warm cushion
    catW.box(-7, 0, -6, 7, 1, 6, 0x6e6a64);
    // curled cat body + tabby stripes
    catW.box(-5, 2, -4, 4, 5, 3, FUR);
    catW.box(-4, 6, -3, 3, 6, 2, FUR_L);
    for (const sx of [-3, 0, 3]) catW.box(sx, 4, -4, sx, 6, 3, FUR_D);
    // tucked head + two pointed ears + cozy paws
    catW.box(-6, 3, 1, -2, 7, 5, FUR);
    catW.box(-5, 4, 5, -3, 5, 5, FUR_L);
    catW.box(-4, 4, 6, -4, 4, 6, NOSE);
    catW.box(-6, 8, 2, -5, 9, 3, FUR_D);
    catW.box(-3, 8, 2, -2, 9, 3, FUR_D);
    catW.box(-5, 2, 4, -2, 2, 5, FUR_L);
    const cat = buildVox(catW);
    cat.position.set(11.3, 0, -8.2);
    cat.rotation.y = -0.55;

    // articulated tail tip gently flicking
    const tailW = new VoxWorld(CELL * 0.5);
    tailW.box(0, 0, 0, 4, 1, 1, FUR_D);
    tailW.box(4, 1, 0, 5, 2, 1, FUR_L);
    const tail = buildVox(tailW, false);
    tail.position.set(4 * CELL * 0.5, 2.5 * CELL * 0.5, 0);
    cat.add(tail);

    root.add(cat);
    anims.push(t => {
      cat.scale.y = 1 + Math.sin(t * 2.2) * 0.035;
      tail.rotation.y = Math.sin(t * 3.4) * 0.18;
    });
  }

  // 4. 竹溪纸灯船（3 盏暖光体素纸灯小舟沿东翼竹溪漂流）
  if (decors.stream_boat) {
    const boats: Array<{ g: THREE.Group; phase: number; speed: number }> = [];
    for (let i = 0; i < 3; i++) {
      const bw = new VoxWorld(CELL * 0.55);
      bw.box(-2, 0, -4, 2, 1, 4, 0xd8c8a2);
      bw.box(-1, 0, -5, 1, 1, 5, 0xb8a278);
      bw.box(-1, 2, -1, 1, 4, 1, 0xffe296, 1);
      bw.box(-1, 5, -1, 1, 5, 1, 0xc83428);
      const bg = buildVox(bw, false);
      const pt = new THREE.PointLight(0xffb858, 0.55, 3.2, 1.8);
      pt.position.set(0, 0.35, 0);
      bg.add(pt);
      root.add(bg);
      boats.push({ g: bg, phase: i * 4.8, speed: 0.42 + i * 0.04 });
    }
    anims.push(t => {
      for (const b of boats) {
        const z = -7.2 + ((t * b.speed + b.phase) % 14.4);
        b.g.position.set(15.28 + Math.sin(t * 1.4 + b.phase) * 0.08, 0.04 + Math.sin(t * 3.2 + b.phase) * 0.015, z);
        b.g.rotation.y = Math.sin(t * 1.1 + b.phase) * 0.18;
      }
    });
  }

  return {
    g: root,
    tick: (t: number) => { for (const fn of anims) fn(t); },
  };
}
