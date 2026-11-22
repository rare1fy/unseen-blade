// 剧情演出（act-20 / act-114 重构）：
//   - 所有镜头严格受 PLAY 安全边界约束（safeCam），绝不穿墙、不陷进屋檐/立柱；
//   - 六场头目登场差异化短演出（3.8~5.0s）：按主角当前站位自适应（绝不倒走），每位头目配专属视听记忆点；
//   - 四位三国名将（赵云/吕布/夏侯惇/陆逊）登场短演出（3.0s）；
//   - 据点断碑划名独立仪式过场（3.1s），取代旧版烟雾瞬移 + 假按攻击键。
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { Action } from '../actors/rig';
import { fxEmbers, fxGlow, fxSmoke, fxRing, fxSparks, trailSeg, fxImpact } from '../fx/fx';
import { fxBolt } from '../fx/skillFx';
import { addBlock } from '../fx/blocks';
import { shake, slowmo, hitstop } from '../engine/clock';
import { cue } from '../../audio/cues';
import { flashSky } from '../scenes/stage';
import { PLAY } from '../scenes/props';
import { playDeath } from '../v2/death';
import { motionOf } from './ninjaAct';
import { poseWallVault, snowPuff } from './prologue';
import type { Foe, EKind } from './enemy';
import type { Timeline, CineShot, V } from './timeline';
import type { BattleActor } from '../bestiary/battle';

export interface CineHost {
  hero: { a: BattleActor; pos: THREE.Vector3 };
  /** a foe-shaped puppet in the scene (not a fighter: the cutscene moves and kills it) */
  puppet(kind: EKind, x: number, z: number, faceX: number, faceZ: number): Foe;
  clearPuppets(): void;
  /** a body of radius r stepping toward a spot is held off the walls and the props */
  hold?(p: THREE.Vector3, r: number): void;
}

/** Clamp a cutscene camera safely inside the room's walkable courtyard/hall bounds (never inside walls or below eye height) */
export function safeCam(pos: V, look: V, fov: number): { pos: V; look: V; fov: number } {
  const x = Math.max(PLAY.x0 + 1.0, Math.min(PLAY.x1 - 1.0, pos[0]));
  const y = Math.max(2.2, pos[1]);
  const z = Math.max(PLAY.z0 + 1.0, Math.min(PLAY.z1 + 10.5, pos[2]));
  return { pos: [x, y, z], look, fov };
}

/** the hero walks from a to b over dur seconds (run pose at a walk), facing the way she goes; held off walls and props */
function walker(h: CineHost, a: [number, number], b: [number, number], dur: number) {
  const sp = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(0.1, dur);
  return (t: number, dt: number) => {
    const p = h.hero.pos, m = motionOf(h.hero.a), dx = b[0] - p.x, dz = b[1] - p.z, d = Math.hypot(dx, dz);
    if (t < dur && d > 0.05) {
      const step = Math.min(d, sp * dt), was = p.clone();
      p.x += dx / d * step; p.z += dz / d * step; p.y = 0; h.hold?.(p, 0.42);
      const mx = p.x - was.x, mz = p.z - was.z; if (Math.hypot(mx, mz) > 1e-4) h.hero.a.yaw = Math.atan2(mx, mz);
      m.run = 0.28;
    } else m.run = Math.max(0, m.run - dt * 4);
    h.hero.a.update(dt);
  };
}

/** fires burning across the field: embers, glow and smoke at fixed points, every frame */
function fires(pts: Array<[number, number]>) {
  let acc = 0;
  return (dt: number) => {
    acc += dt; if (acc < 0.045) return; acc = 0;
    for (const [x, z] of pts) for (let n = 0; n < 2; n++) {
      const p = V3(x + (Math.random() - 0.5) * 3.2, 0.25, z + (Math.random() - 0.5) * 3.2);
      fxGlow(p.clone().setY(0.5 + Math.random() * 0.6), Math.random() < 0.5 ? 0xff5a14 : 0xff8a24, 2.0 + Math.random() * 1.2, 0.35, 1.7);
      fxEmbers(p, 0xff8a2a, 3, { r: 0.8, up: 3.2, life: 1.3 });
      if (Math.random() < 0.3) fxSmoke(V3(x + 0.6, 2.2, z), 0x26221f, 1, { r: 1.0, spd: 1.2, up: 2.8, s: 1.3, life: 3.2, alpha: 0.5 });
    }
  };
}

/** Pure 3D voxel burst helper for boss / general intros */
function introBlocks(at: THREE.Vector3, colA: number, colB: number, n = 18, spd = 3.2, up = 2.6) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const r = 0.4 + Math.random() * 0.8;
    addBlock(at.clone().add(V3(Math.cos(a) * r, 0.25 + Math.random() * 0.9, Math.sin(a) * r)), {
      size: 0.09 + Math.random() * 0.09,
      v: V3(Math.cos(a) * spd * (0.6 + Math.random() * 0.6), up * (0.5 + Math.random() * 0.8), Math.sin(a) * spd * (0.6 + Math.random() * 0.6)),
      col: i % 2 ? colA : colB, bright: 1.5, life: 0.5 + Math.random() * 0.3, shrink: 0.55, drag: 1.4, grav: 2.2,
    });
  }
}

/** 开场 (debug / legacy burning field preview) */
export function openingShots(h: CineHost): CineShot[] {
  const F: Array<[number, number]> = [[-12, -14], [-4, -18], [7, -16], [14, -10], [-15, -4], [16, 2], [-9, -24], [10, -24]];
  const burn = fires(F);
  const flee: Foe[] = [];
  const fleeTick = (dt: number) => { for (const f of flee) { f.pos.z += dt * 3.2; f.pos.x += Math.sin(f.uid) * dt * 0.4; f.a.update(dt); } };
  const at0: [number, number] = [-3, 9], at1: [number, number] = [-1, 1], stop: [number, number] = [0, -2];
  let ambush: Foe[] = [];
  return [
    { dur: 6.5, ease: 'out', caption: { text: '中平元年 · 颍川', at: 1.2, hold: 3.2 },
      from: { pos: [6, 30, 34], look: [0, 0, -6], fov: 40 }, to: { pos: [4, 15, 20], look: [-1, 0.6, 0], fov: 38 },
      at: [[0, () => { h.clearPuppets(); flee.length = 0; for (let i = 0; i < 6; i++) { const f = h.puppet('hj_mob', -6 + i * 2.2 + (i % 2) * 0.8, -8 - (i % 3) * 3, 0, 20); f.a.setRunning(true); flee.push(f); } h.hero.pos.set(at0[0], 0, at0[1]); }]],
      tick: (t, dt) => { burn(dt); fleeTick(dt); walker(h, at0, at1, 6.5)(t, dt); } },
    { dur: 5, ease: 'linear',
      from: () => ({ pos: [h.hero.pos.x + 13, 5.2, h.hero.pos.z + 5] as V, look: [h.hero.pos.x, 0.9, h.hero.pos.z] as V, fov: 34 }),
      to: () => ({ pos: [h.hero.pos.x + 13, 5.2, h.hero.pos.z + 5] as V, look: [h.hero.pos.x, 0.9, h.hero.pos.z] as V, fov: 34 }),
      tick: (t, dt) => { burn(dt); fleeTick(dt); walker(h, at1, stop, 5)(t, dt); } },
    { dur: 4, from: { pos: [0, 8.5, 12.5], look: [0, 0.8, -2], fov: 36 }, to: { pos: [0, 7.8, 11.2], look: [0, 0.9, -2], fov: 36 },
      at: [[0, () => { const m = motionOf(h.hero.a); m.run = 0; h.hero.a.yaw = Math.PI; ambush = [h.puppet('hj_archer', -6, -5, 0, -2), h.puppet('hj_hound', 4.5, -6, 0, -2), h.puppet('hj_hound', 5.5, -4, 0, -2), h.puppet('hj_blade', 6.5, -6.5, 0, -2)]; }],
        [0.6, () => { fxRing(V3(-6, 0.05, -5), 0xf2f2ff, 2.4, { life: 1.2, width: 0.12, bright: 1.6 } as never); cue('exitChime', 0.4); }],
        [1.4, () => { fxRing(V3(5.2, 0.05, -5.4), 0xf2f2ff, 2.8, { life: 1.2, width: 0.12, bright: 1.6 } as never); cue('hound', 0.5); }],
        [2.3, () => { fxRing(V3(0, 0.05, -2), 0xf2f2ff, 1.4, { life: 0.9, width: 0.1, bright: 1.2 } as never); }]],
      tick: (_t, dt) => { burn(dt); fleeTick(dt); h.hero.a.update(dt); for (const f of ambush) f.a.update(dt); } },
    { dur: 4.2, from: { pos: [7, 7.5, 8], look: [1.5, 0.8, -3.5], fov: 38 },
      at: [[0.2, () => { trailSeg(V3(-6, 1.3, -5), V3(-1, 1.2, -2.6), 0xffd090, 0.08, { life: 0.3, bright: 2.2 }); cue('arrow', 0.8); }],
        [0.45, () => { h.hero.a.yaw = Math.atan2(-6, -3); fxSparks(V3(-1.1, 1.2, -2.6), 0xffffff, 10, 4); cue('dartHit', 0.8); cue('dartThrow', 0.6); }],
        [0.7, () => { for (const f of ambush.slice(1)) { f.a.setRunning(true); } }],
        [1.6, () => { h.hero.a.yaw = Math.atan2(5, -3); h.hero.a.play(new Action('rel', 0.42, 0.3)); cue('draw', 1); cue('parry', 0.9); slowmo(0.6, 0.25); shake(0.25); }],
        [1.75, () => { for (const f of ambush.slice(1)) { fxImpact(f.a.chest(), 0xfff0d0, 1.2, { stop: false }); void playDeath(f.a, { from: h.hero.pos.clone(), ratio: 2 }); } trailSeg(V3(-0.5, 1, -1.5), V3(5.5, 1, -5), 0xeaf8ff, 0.16, { life: 0.4, bright: 2.6, spark: 0.5 }); cue('cutHeavy', 1); }],
        [2.6, () => { const a = ambush[0]; void playDeath(a.a, { from: h.hero.pos.clone(), ratio: 2 }); trailSeg(V3(0, 1.2, -2), V3(-6, 1.2, -5), 0xc8d8ff, 0.08, { life: 0.3, bright: 2 }); cue('cut', 0.8); }]],
      tick: (t, dt) => { burn(dt); fleeTick(dt); h.hero.a.update(dt); for (const f of ambush.slice(1)) if (t > 0.7 && t < 1.7) { const d = V3(-f.pos.x, 0, -2 - f.pos.z); if (d.length() > 1.2) f.pos.addScaledVector(d.normalize(), dt * 7); f.a.yaw = Math.atan2(d.x, d.z); } for (const f of ambush) f.a.update(dt); } },
    { dur: 4.6, from: { pos: [-3, 4.4, 11.5], look: [0, 2.4, -24], fov: 40 }, to: { pos: [-2.6, 5.0, 13], look: [0, 3.0, -26], fov: 40 },
      at: [[0.2, () => { h.hero.a.yaw = Math.PI; h.hero.a.play(new Action('noto', 0.95, 0.64)); }], [0.8, () => cue('sheathe', 0.9)],
        [2.0, () => { flashSky(0.9); fxBolt(V3(2, 22, -34), V3(1, 3, -32), 0xc8b0ff, { width: 0.4, life: 0.35, bright: 0.6 }); }], [2.5, () => cue('thunder', 0.7)]],
      tick: (_t, dt) => { burn(dt); fleeTick(dt); h.hero.a.update(dt); for (const f of ambush) f.a.update(dt); } },
    { dur: 3.4, from: { pos: [0, 12, 16], look: [0, 0.6, -2], fov: 40 }, to: { pos: [0, 13, 18], look: [0, 0.6, -2], fov: 40 }, caption: { text: '不见刀', big: true, at: 0.2, hold: 2.0 },
      at: [[2.0, () => { cue('ultSlash', 0.8); shake(0.2); }]],
      tick: (_t, dt) => { burn(dt); h.hero.a.update(dt); } },
  ];
}

/**
 * act-114 六场头目差异化短演出（序章崔玄 / 石雷 / 阎虎 / 封寒 / 周默 / 终局崔玄）：
 *  - 主角只朝头目方向前迈 2m（已在近处则站定面朝头目，绝不背对倒走）；
 *  - 机位按主角↔头目连线动态取景，统一走 safeCam 绝不穿墙；
 *  - 每位头目各有专属气质表演与音效（不再全员统一大吼）。
 */
export function bossIntroShots(h: CineHost, boss: Foe, name: string, o: { prologue?: boolean } = {}): CineShot[] {
  const b = boss.pos.clone();
  const p0 = h.hero.pos.clone();

  // ---- act-157 / act-165 / act-174: Prologue Cui Xuan IMMEDIATE 3D wall-vault on frame 0
  // Land realistically ~2.6m inside the west wall aligned with the north courtyard, then take a few crisp planted footsteps
  // into a ~5.8m snowy standoff (ZERO 8m sliding/teleporting straight up to Cui Xuan's face!)
  if (o.prologue && boss.kind === 'cx_boss') {
    const wallX = PLAY.x0 - 0.44;
    const wallY = 2.66;
    // Choose a clean open courtyard landing Z clear of the west-wall stone plinths (around z = -5.4), ~6.5m south-west of Cui Xuan
    const landZ = Math.max(PLAY.z0 + 5.6, Math.min(PLAY.z1 - 3.0, b.z + 6.0));
    const landPos = V3(Math.max(PLAY.x0 + 2.4, Math.min(b.x - 5.2, PLAY.x0 + 2.85)), 0, landZ);
    h.hold?.(landPos, 0.72);
    const landX = landPos.x;
    const lz = landPos.z;
    const standPos = V3(
      Math.min(b.x - 3.6, landX + 2.55),
      0,
      Math.max(PLAY.z0 + 3.6, Math.min(PLAY.z1 - 2.6, lz - 0.75)),
    );
    h.hold?.(standPos, 0.55);
    const vaultYaw = Math.atan2(landX - wallX, 0);
    const faceBossYaw = Math.atan2(b.x - standPos.x, b.z - standPos.z);
    const faceHeroYaw = Math.atan2(standPos.x - b.x, standPos.z - b.z);
    let landed = false, leaped = false;

    // Shot 1A: Heroic angle on the snowy west wall crest — already crouched poised on frame 0, then springs cleanly into the yard
    const shotWallPerch: CineShot = {
      dur: 1.05, ease: 'out',
      from: safeCam([PLAY.x0 + 6.4, 3.45, lz + 4.8], [PLAY.x0 + 0.6, 2.75, lz], 41),
      to: safeCam([PLAY.x0 + 5.9, 3.35, lz + 4.4], [PLAY.x0 + 1.5, 2.45, lz], 40),
      at: [
        [0, () => {
          cue('snowWind', 0.65);
          // Cui Xuan starts back-turned gazing at the snowy hall, unarmed until PRO_CUIXUAN draw beat!
          boss.a.yaw = Math.PI;
          if (boss.a.bones.blade) boss.a.bones.blade.visible = false;
          if (boss.a.bones.fan) boss.a.bones.fan.visible = false;
          motionOf(h.hero.a).run = 0;
          h.hero.pos.set(wallX, 0, lz);
          h.hero.a.home.set(wallX, 0, lz);
          h.hero.a.off.set(0, wallY, 0);
          h.hero.a.yaw = vaultYaw;
          h.hero.a.root.position.set(wallX, wallY, lz);
          poseWallVault(h.hero.a, 'perch', 0.35);
          h.hero.a.root.position.set(wallX, wallY, lz);
        }],
      ],
      tick: (t, dt) => {
        const m = motionOf(h.hero.a);
        if (t < 0.48) {
          const u = t / 0.48;
          m.run = 0;
          h.hero.pos.set(wallX, 0, lz);
          h.hero.a.home.set(wallX, 0, lz);
          h.hero.a.off.set(0, wallY, 0);
          h.hero.a.yaw = vaultYaw;
          h.hero.a.update(dt);
          poseWallVault(h.hero.a, 'perch', 0.35 + 0.65 * u);
          h.hero.a.root.position.set(wallX, wallY, lz);
        } else {
          if (!leaped) {
            leaped = true;
            cue('whoosh', 0.72);
            snowPuff(V3(wallX + 0.25, wallY, lz));
          }
          // First 74% of the ballistic arc plays in Shot 1A; final 26% cuts cleanly to low ground-level impact in Shot 1B!
          const u = ((t - 0.48) / 0.57) * 0.74;
          const x = wallX + (landX - wallX) * u;
          const y = wallY * (1 - u) * (1 - 0.14 * u) + 0.95 * 4 * u * (1 - u);
          m.run = 0;
          h.hero.pos.set(x, 0, lz);
          h.hero.a.home.set(x, 0, lz);
          h.hero.a.off.set(0, y, 0);
          h.hero.a.yaw = vaultYaw;
          h.hero.a.update(dt);
          poseWallVault(h.hero.a, 'leap', u);
          h.hero.a.root.position.set(x, y, lz);
        }
        boss.a.yaw = Math.PI;
        boss.a.update(dt);
      },
    };

    // Shot 1B: HARD CUT to low courtyard ground-level angle — drops into snow crouch near wall, rises & walks 4-5 planted steps into standoff
    const shotWallLand: CineShot = {
      dur: 1.82, ease: 'out',
      from: safeCam([landX + 3.8, 2.50, lz + 5.4], [landX + 0.8, 1.0, lz - 0.3], 39),
      to: safeCam([standPos.x + 3.2, 2.45, standPos.z + 5.2], [standPos.x + 1.0, 1.08, standPos.z - 0.5], 38),
      tick: (t, dt) => {
        const m = motionOf(h.hero.a);
        if (t < 0.22) {
          const u = 0.74 + (t / 0.22) * 0.26;
          const x = wallX + (landX - wallX) * u;
          const y = wallY * (1 - u) * (1 - 0.14 * u) + 0.95 * 4 * u * (1 - u);
          m.run = 0;
          h.hero.pos.set(x, 0, lz);
          h.hero.a.home.set(x, 0, lz);
          h.hero.a.off.set(0, y, 0);
          h.hero.a.yaw = vaultYaw;
          h.hero.a.update(dt);
          poseWallVault(h.hero.a, 'leap', u);
          h.hero.a.root.position.set(x, y, lz);
        } else if (t < 0.68) {
          if (!landed) {
            landed = true;
            cue('land', 0.65); shake(0.10);
            snowPuff(V3(landX, 0.05, lz));
            fxRing(V3(landX, 0.06, lz), 0xeef4ff, 2.2, { life: 0.9, width: 0.09, bright: 1.4 } as never);
          }
          const u = (t - 0.22) / 0.46;
          m.run = 0;
          h.hero.pos.set(landX, 0, lz);
          h.hero.a.home.set(landX, 0, lz);
          h.hero.a.off.set(0, 0, 0);
          h.hero.a.yaw = vaultYaw + (faceBossYaw - vaultYaw) * Math.min(1, u * 1.4);
          h.hero.a.update(dt);
          poseWallVault(h.hero.a, 'land', u);
          h.hero.a.root.position.set(landX, 0, lz);
        } else {
          const u = Math.min(1, (t - 0.68) / 1.08);
          const x = landX + (standPos.x - landX) * u;
          const z = lz + (standPos.z - lz) * u;
          h.hero.pos.set(x, 0, z);
          h.hold?.(h.hero.pos, 0.42);
          h.hero.a.home.copy(h.hero.pos);
          h.hero.a.off.set(0, 0, 0);
          h.hero.a.yaw = faceBossYaw;
          m.run = u < 0.94 ? 0.50 : 0;
          h.hero.a.update(dt);
        }
        boss.a.yaw = Math.PI;
        boss.a.update(dt);
      },
    };

    // Shot 2: HARD CUT to reverse-angle aristocratic reveal — Cui Xuan hears her landing and slowly turns around (blade still hidden)
    const turnDiff = Math.atan2(Math.sin(faceHeroYaw - Math.PI), Math.cos(faceHeroYaw - Math.PI));
    const shotTurn: CineShot = {
      dur: 2.05, ease: 'inOut',
      from: safeCam([b.x + 3.5, 2.55, b.z + 4.4], [b.x - 0.35, 1.15, b.z + 0.35], 35),
      to: safeCam([b.x + 2.9, 2.35, b.z + 3.7], [b.x - 0.25, 1.15, b.z + 0.2], 33),
      caption: { text: name, at: 0.72, hold: 1.30 },
      at: [
        [0, () => {
          h.hero.pos.copy(standPos);
          h.hero.a.home.copy(standPos);
          h.hero.a.off.set(0, 0, 0);
          h.hero.a.root.position.copy(standPos);
          h.hero.a.yaw = faceBossYaw;
          motionOf(h.hero.a).run = 0;
        }],
        [0.28, () => {
          cue('snowWind', 0.52);
          fxRing(b.clone().setY(0.06), 0xf6d88a, 2.4, { life: 1.0, width: 0.1, bright: 1.4 } as never);
        }],
      ],
      tick: (t, dt) => {
        const u = Math.max(0, Math.min(1, (t - 0.24) / 0.88));
        const ease = u * u * (3 - 2 * u);
        boss.a.yaw = Math.PI + turnDiff * ease;
        motionOf(h.hero.a).run = 0;
        h.hero.a.update(dt);
        boss.a.update(dt);
      },
    };

    return [shotWallPerch, shotWallLand, shotTurn];
  }

  const toBoss = V3(b.x - p0.x, 0, b.z - p0.z);
  const dist = toBoss.length() || 1;
  const dir = toBoss.clone().divideScalar(dist);
  const stepDist = o.prologue
    ? (dist > 4.2 ? Math.min(2.2, dist - 3.6) : 0)
    : (dist > 5.0 ? Math.min(2.6, dist - 4.0) : 0);
  const p1: [number, number] = [p0.x + dir.x * stepDist, p0.z + dir.z * stepDist];
  const heroStart: [number, number] = [p0.x, p0.z];
  // perpendicular side vector preferring +z (toward the open front of the courtyard/hall)
  let nx = -dir.z, nz = dir.x;
  if (nz < 0) { nx = -nx; nz = -nz; }
  const walkDur = stepDist > 0.2 ? 1.8 : 0.9;
  const walkFn = stepDist > 0.2 ? walker(h, heroStart, p1, walkDur) : (_t: number, dt: number) => {
    motionOf(h.hero.a).run = 0;
    h.hero.a.yaw = Math.atan2(b.x - h.hero.pos.x, b.z - h.hero.pos.z);
    h.hero.a.update(dt);
  };
  let stepT = 0.25;

  // Dynamic side-on framing of both hero and boss
  const sideShot = (sideDist: number, y: number, fov: number) => {
    const q = h.hero.pos;
    const mx = q.x * 0.35 + b.x * 0.65, mz = q.z * 0.35 + b.z * 0.65;
    return safeCam([mx + nx * sideDist, y, mz + nz * sideDist + 2.2], [mx, 1.15, mz], fov);
  };

  // ---- Shot 1: Hero steps forward into the confrontation (with subtle snow/rain sound rings)
  const shot1: CineShot = {
    dur: walkDur, ease: 'out',
    from: () => {
      const q = h.hero.pos;
      return safeCam([q.x - dir.x * 6.2 + nx * 2.2, 5.4, q.z - dir.z * 6.2 + nz * 2.2], [b.x, 1.1, b.z], 38);
    },
    to: () => {
      const q = h.hero.pos;
      return safeCam([q.x - dir.x * 5.2 + nx * 3.0, 4.6, q.z - dir.z * 5.2 + nz * 3.0], [b.x, 1.2, b.z], 36);
    },
    at: [[0, () => {
      h.hero.a.yaw = Math.atan2(b.x - p0.x, b.z - p0.z);
      boss.a.yaw = Math.atan2(p0.x - b.x, p0.z - b.z);
      if (o.prologue || boss.kind === 'cx_boss') cue('snowWind', 0.65);
    }]],
    tick: (t, dt) => {
      walkFn(t, dt);
      if (stepDist > 0.2) {
        stepT -= dt;
        if (stepT <= 0 && t < walkDur - 0.1) {
          stepT = 0.52;
          fxRing(h.hero.pos.clone().setY(0.05), 0xe8f0ff, 1.0, { life: 0.65, width: 0.08, bright: 1.2 } as never);
        }
      }
      boss.a.yaw = Math.atan2(h.hero.pos.x - b.x, h.hero.pos.z - b.z);
      boss.a.update(dt);
    },
  };

  // ---- Shot 2: Per-boss signature reveal beat + name card
  let at2: Array<[number, () => void]>;
  let tick2: (t: number, dt: number) => void = (_t, dt) => {
    motionOf(h.hero.a).run = 0; h.hero.a.update(dt); boss.a.update(dt);
  };
  let dur2 = 2.9;

  if (o.prologue && boss.kind === 'cx_boss') {
    // Prologue Cui Xuan: calm snowy eaves, turns & draws Wen-family blade with golden blade-hum sound ring (no beast roar!)
    dur2 = 2.8;
    at2 = [
      [0.3, () => { cue('snowWind', 0.55); fxRing(b.clone().setY(0.06), 0xf6d88a, 2.2, { life: 1.0, width: 0.1, bright: 1.4 } as never); }],
      [1.1, () => { cue('draw', 0.9); cue('bladeRing', 0.7); fxSparks(b.clone().setY(1.3), 0xfff0c0, 12, 3.6); shake(0.12); }],
    ];
  } else if (boss.kind === 'hj_boss') {
    // Ch1 Shi Lei: thunderbolt strikes temple court
    dur2 = 3.1;
    at2 = [
      [0.35, () => { boss.a.roar(); cue('roar', 0.85); }],
      [0.95, () => {
        flashSky(1);
        fxBolt(b.clone().add(V3(1.4, 14, 0)), b.clone().add(V3(1.4, 0, 0.4)), 0xfff2a0, { width: 0.35, life: 0.35, bright: 0.65 });
        cue('thunder', 1); shake(0.35);
      }],
    ];
  } else if (boss.kind === 'ly_boss') {
    // Ch2 Yan Hu: giant halberd slam + foundry embers burst
    dur2 = 3.0;
    at2 = [
      [0.35, () => { boss.a.roar(); cue('roar', 0.8); }],
      [0.95, () => {
        cue('wallSlam', 0.95); cue('fire', 0.7); shake(0.36);
        fxRing(b.clone().setY(0.08), 0xff7a2a, 3.2, { life: 0.75, width: 0.14, bright: 1.5 } as never);
        introBlocks(b, 0xff9a38, 0xff4a18, 22, 3.8, 3.2);
      }],
    ];
  } else if (boss.kind === 'xp_boss') {
    // Ch3 Feng Han: cold winter mist + silver needle glint
    dur2 = 2.9;
    at2 = [
      [0.3, () => {
        fxSmoke(b.clone().setY(0.4), 0xc8e4f4, 12, { r: 1.1, spd: 1.2, up: 0.9, s: 0.5, life: 1.3, alpha: 0.55 });
        cue('freeze', 0.65);
      }],
      [0.95, () => {
        cue('needleZing', 0.95);
        fxRing(b.clone().setY(0.08), 0xa8e8ff, 2.6, { life: 0.8, width: 0.1, bright: 1.4 } as never);
        introBlocks(b, 0xdff6ff, 0x7ac8e8, 16, 4.4, 2.0);
        shake(0.14);
      }],
    ];
  } else if (boss.kind === 'wl_boss') {
    // Ch4 Zhou Mo: burning river-ship embers + signal flag command
    dur2 = 2.9;
    at2 = [
      [0.3, () => { cue('fire', 0.85); cue('whoosh', 0.6); introBlocks(b, 0xff8a2a, 0xffcc50, 20, 3.0, 3.6); }],
      [0.95, () => {
        boss.a.play(new Action('cast', 1.2, 0.5));
        fxRing(b.clone().setY(0.08), 0xff6a28, 3.0, { life: 0.85, width: 0.12, bright: 1.4 } as never);
        cue('boom', 0.55); shake(0.22);
      }],
    ];
  } else {
    // Ch5 Final Cui Xuan (cx_vault): 26 Wen-family blades resonate in unison with golden sound-wave rings!
    dur2 = 3.4;
    at2 = [
      [0.2, () => { cue('bladeChorus', 0.95); fxRing(b.clone().add(V3(-3.2, 0.08, -1.8)), 0xffd27a, 2.4, { life: 1.1, width: 0.1, bright: 1.5 } as never); }],
      [0.75, () => { fxRing(b.clone().add(V3(3.2, 0.08, -1.8)), 0xffd27a, 2.4, { life: 1.1, width: 0.1, bright: 1.5 } as never); }],
      [1.35, () => {
        cue('draw', 0.95);
        fxRing(b.clone().setY(0.08), 0xffe4a0, 3.4, { life: 1.0, width: 0.12, bright: 1.6 } as never);
        introBlocks(b, 0xffe49c, 0xffffff, 16, 3.2, 2.2);
        shake(0.16);
      }],
    ];
  }

  // ---- Shot 2: HARD CUT to dramatic low reverse medium close-up on the Boss's signature reveal + name card
  const bossClose = (distOut: number, y: number, fov: number) =>
    safeCam([b.x - dir.x * distOut + nx * 2.2, y, b.z - dir.z * distOut + nz * 2.2], [b.x, 1.25, b.z], fov);
  const shot2: CineShot = {
    dur: Math.max(1.85, dur2 - 0.95), ease: 'out',
    from: () => bossClose(4.6, 2.55, 35),
    to: () => bossClose(4.0, 2.38, 33),
    caption: { text: name, at: 0.55, hold: 1.55 },
    at: at2,
    tick: tick2,
  };

  // ---- Shot 3: HARD CUT to wide martial showdown two-shot framing both fighters facing off across the arena
  const shot3: CineShot = {
    dur: 1.05, ease: 'out',
    from: () => sideShot(8.6, 3.8, 36),
    to: () => sideShot(8.0, 3.55, 35),
    tick: tick2,
  };

  return [shot1, shot2, shot3];
}

/** act-114 三国名将登场短过场（赵云 / 吕布 / 夏侯惇 / 陆逊，约 2.9 秒，安全机位不穿墙） */
export function generalIntroShots(
  h: CineHost,
  genPos: THREE.Vector3,
  genActor: BattleActor,
  name: string,
  kind: 'zhaoyun' | 'lubu' | 'xiahoudun' | 'luxun',
): CineShot[] {
  const hp = h.hero.pos;
  const mx = (hp.x + genPos.x) * 0.5, mz = (hp.z + genPos.z) * 0.5;
  const dx = genPos.x - hp.x, dz = genPos.z - hp.z, len = Math.hypot(dx, dz) || 1;
  let nx = -dz / len, nz = dx / len;
  if (nz < 0) { nx = -nx; nz = -nz; }

  return [{
    dur: 2.9, ease: 'inOut',
    from: () => safeCam([mx + nx * 7.6, 4.5, mz + nz * 7.6 + 1.8], [genPos.x, 1.15, genPos.z], 36),
    to: () => safeCam([mx + nx * 6.8, 3.9, mz + nz * 6.8 + 1.4], [mx, 1.1, mz], 34),
    caption: { text: name, at: 0.7, hold: 1.8 },
    at: [
      [0, () => {
        h.hero.a.yaw = Math.atan2(dx, dz);
        genActor.yaw = Math.atan2(-dx, -dz);
        motionOf(h.hero.a).run = 0;
      }],
      [0.45, () => {
        if (kind === 'zhaoyun') {
          cue('bladeRing', 0.85); cue('swingStab', 0.8);
          fxRing(genPos.clone().setY(0.08), 0xc8e4ff, 2.8, { life: 0.85, width: 0.12, bright: 1.5 } as never);
          introBlocks(genPos, 0xe8f4ff, 0x80b8ff, 16, 3.8, 2.4);
        } else if (kind === 'lubu') {
          genActor.roar(); cue('wallSlam', 0.95); cue('roar', 0.7); shake(0.32);
          fxRing(genPos.clone().setY(0.08), 0xff5a28, 3.4, { life: 0.85, width: 0.14, bright: 1.6 } as never);
          introBlocks(genPos, 0xffaa38, 0xd82820, 22, 4.2, 3.2);
        } else if (kind === 'xiahoudun') {
          cue('draw', 0.95); cue('snowWind', 0.65); shake(0.2);
          fxRing(genPos.clone().setY(0.08), 0xd8504a, 2.6, { life: 0.8, width: 0.12, bright: 1.4 } as never);
          introBlocks(genPos, 0xe8e0d8, 0xa82828, 16, 3.4, 2.2);
        } else {
          cue('fire', 0.75); cue('bladeRing', 0.75);
          fxRing(genPos.clone().setY(0.08), 0x78e0c8, 2.8, { life: 0.85, width: 0.1, bright: 1.4 } as never);
          introBlocks(genPos, 0x90f0d8, 0xff9a38, 18, 3.4, 2.6);
        }
      }],
    ],
    tick: (_t, dt) => { h.hero.a.update(dt); genActor.update(dt); },
  }];
}

/** act-114 据点断碑划名独立仪式过场（3.0s，取代烟雾瞬移 + 假按攻击键，严防穿模与误操作） */
export function steleStrikeShots(h: CineHost, stelePos: { x: number; z: number }, onCut: () => void): CineShot[] {
  // Stand to the left of the stele so ALL 5 carved names on the slab remain 100% unobstructed from the right-front camera!
  const standX = stelePos.x - 0.72, standZ = stelePos.z + 1.48;
  const lookAt: V = [stelePos.x - 0.08, 1.02, stelePos.z + 0.15];
  return [{
    dur: 3.0, ease: 'inOut',
    from: safeCam([stelePos.x + 2.1, 2.2, stelePos.z + 3.65], lookAt, 34),
    to: safeCam([stelePos.x + 1.75, 1.98, stelePos.z + 3.1], lookAt, 32),
    at: [
      [0, () => {
        h.hero.pos.set(standX, 0, standZ);
        h.hero.a.home.copy(h.hero.pos);
        h.hero.a.root.position.copy(h.hero.pos);
        h.hero.a.yaw = Math.atan2(stelePos.x - standX, stelePos.z - standZ);
        motionOf(h.hero.a).run = 0;
      }],
      [0.35, () => { h.hero.a.play(new Action('noto', 0.65, 0.5)); cue('sheathe', 0.75); }],
      [1.15, () => {
        h.hero.a.play(new Action('rel', 0.45, 0.35));
        cue('draw', 0.9); cue('stoneCarve', 0.95); cue('stingStele', 1);
        hitstop(0.12); shake(0.28);
        onCut();
      }],
    ],
    tick: (_t, dt) => { h.hero.a.update(dt); },
  }];
}
