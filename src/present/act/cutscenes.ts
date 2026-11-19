// 剧情演出（act-20，分镜照 docs/STORY.md 第 9 节，改成现有素材做得出来的版本；只用远景 / 全景 / 中景，镜头里不演对话）。
// 开场：燃烧的颍川麦田 → 逆着流民走进火里 → 停步听见左右的声纹 → 伏击：一镖打偏冷箭、拔刀破势，扑来的人和狗一起倒 →
// 甩刀归鞘，远处山上破庙雷光 → 大字「不见刀」被一道刀光斩开。首领登场：雨中破庙庭院，每一步一圈声纹 → 渠帅举杖引雷 → 名字卡。
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { Action } from '../actors/rig';
import { fxEmbers, fxGlow, fxSmoke, fxRing, fxSparks, trailSeg, fxImpact } from '../fx/fx';
import { fxBolt } from '../fx/skillFx';
import { shake, slowmo } from '../engine/clock';
import { cue } from '../../audio/cues';
import { flashSky } from '../scenes/stage';
import { playDeath } from '../v2/death';
import { motionOf } from './ninjaAct';
import type { Foe, EKind } from './enemy';
import type { Timeline, CineShot, V } from './timeline';
import type { BattleActor } from '../bestiary/battle';

export interface CineHost {
  hero: { a: BattleActor; pos: THREE.Vector3 };
  /** a foe-shaped puppet in the scene (not a fighter: the cutscene moves and kills it) */
  puppet(kind: EKind, x: number, z: number, faceX: number, faceZ: number): Foe;
  clearPuppets(): void;
  /** 11-19 (用户：「现在演出里穿模的情况非常严重」): a body of radius r stepping from (x, z) toward (tx, tz) is held off the walls and the
   *  props (the game's own clamp: walls, cover, pots, fences) — a cutscene walk that runs into a fence slides along it instead of through */
  hold?(p: THREE.Vector3, r: number): void;
}

/** the hero walks from a to b over dur seconds (run pose at a walk), facing the way she goes; held off the walls and the props as she
 *  goes (11-19: a straight line from wherever she stood ran her through the fences) — the steps follow the ground she covers */
function walker(h: CineHost, a: [number, number], b: [number, number], dur: number) {
  const sp = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(0.1, dur);
  return (t: number, dt: number) => {
    const p = h.hero.pos, m = motionOf(h.hero.a), dx = b[0] - p.x, dz = b[1] - p.z, d = Math.hypot(dx, dz);
    if (t < dur && d > 0.05) {
      const step = Math.min(d, sp * dt), was = p.clone();
      p.x += dx / d * step; p.z += dz / d * step; p.y = 0; h.hold?.(p, 0.4);
      const mx = p.x - was.x, mz = p.z - was.z; if (Math.hypot(mx, mz) > 1e-4) h.hero.a.yaw = Math.atan2(mx, mz);
      m.run = 0.3;
    } else m.run = Math.max(0, m.run - dt * 4);
    h.hero.a.update(dt);
  };
}
/** fires burning across the field: embers, glow and smoke at fixed points, every frame */
function fires(pts: Array<[number, number]>) {
  let acc = 0;
  return (dt: number) => {
    acc += dt; if (acc < 0.045) return; acc = 0;
    // a burning patch: a bed of flame glows (wide, low), embers going up, a dark column of smoke leaning with the wind
    for (const [x, z] of pts) for (let n = 0; n < 2; n++) {
      const p = V3(x + (Math.random() - 0.5) * 3.2, 0.25, z + (Math.random() - 0.5) * 3.2);
      fxGlow(p.clone().setY(0.5 + Math.random() * 0.6), Math.random() < 0.5 ? 0xff5a14 : 0xff8a24, 2.0 + Math.random() * 1.2, 0.35, 1.7);
      fxEmbers(p, 0xff8a2a, 3, { r: 0.8, up: 3.2, life: 1.3 });
      if (Math.random() < 0.3) fxSmoke(V3(x + 0.6, 2.2, z), 0x26221f, 1, { r: 1.0, spd: 1.2, up: 2.8, s: 1.3, life: 3.2, alpha: 0.5 });
    }
  };
}

/** 开场 (after the title, before the first wake in the hideout) */
export function openingShots(h: CineHost): CineShot[] {
  const F: Array<[number, number]> = [[-12, -14], [-4, -18], [7, -16], [14, -10], [-15, -4], [16, 2], [-9, -24], [10, -24]];
  const burn = fires(F);
  // refugees fleeing toward the camera, past her
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
    // she stops: the ambush is heard before it is seen — a ring of sound to the left (a bow drawn), one to the right (dogs, a blade)
    { dur: 4, from: { pos: [0, 8.5, 12.5], look: [0, 0.8, -2], fov: 36 }, to: { pos: [0, 7.8, 11.2], look: [0, 0.9, -2], fov: 36 },
      at: [[0, () => { const m = motionOf(h.hero.a); m.run = 0; h.hero.a.yaw = Math.PI; ambush = [h.puppet('hj_archer', -6, -5, 0, -2), h.puppet('hj_hound', 4.5, -6, 0, -2), h.puppet('hj_hound', 5.5, -4, 0, -2), h.puppet('hj_blade', 6.5, -6.5, 0, -2)]; }],
        [0.6, () => { fxRing(V3(-6, 0.05, -5), 0xf2f2ff, 2.4, { life: 1.2, width: 0.12, bright: 1.6 } as never); cue('exitChime', 0.4); }],
        [1.4, () => { fxRing(V3(5.2, 0.05, -5.4), 0xf2f2ff, 2.8, { life: 1.2, width: 0.12, bright: 1.6 } as never); cue('hound', 0.5); }],
        [2.3, () => { fxRing(V3(0, 0.05, -2), 0xf2f2ff, 1.4, { life: 0.9, width: 0.1, bright: 1.2 } as never); }]],
      tick: (_t, dt) => { burn(dt); fleeTick(dt); h.hero.a.update(dt); for (const f of ambush) f.a.update(dt); } },
    // the ambush: an arrow knocked aside by a dart, the dogs and the blade rush in, one draw and they all fall
    { dur: 4.2, from: { pos: [7, 7.5, 8], look: [1.5, 0.8, -3.5], fov: 38 },
      at: [[0.2, () => { trailSeg(V3(-6, 1.3, -5), V3(-1, 1.2, -2.6), 0xffd090, 0.08, { life: 0.3, bright: 2.2 }); cue('arrow', 0.8); }],
        [0.45, () => { h.hero.a.yaw = Math.atan2(-6, -3); fxSparks(V3(-1.1, 1.2, -2.6), 0xffffff, 10, 4); cue('dartHit', 0.8); cue('dartThrow', 0.6); }],
        [0.7, () => { for (const f of ambush.slice(1)) { f.a.setRunning(true); } }],
        [1.6, () => { h.hero.a.yaw = Math.atan2(5, -3); h.hero.a.play(new Action('rel', 0.42, 0.3)); cue('draw', 1); cue('parry', 0.9); slowmo(0.6, 0.25); shake(0.25); }],
        [1.75, () => { for (const f of ambush.slice(1)) { fxImpact(f.a.chest(), 0xfff0d0, 1.2, { stop: false }); void playDeath(f.a, { from: h.hero.pos.clone(), ratio: 2 }); } trailSeg(V3(-0.5, 1, -1.5), V3(5.5, 1, -5), 0xeaf8ff, 0.16, { life: 0.4, bright: 2.6, spark: 0.5 }); cue('cutHeavy', 1); }],
        [2.6, () => { const a = ambush[0]; void playDeath(a.a, { from: h.hero.pos.clone(), ratio: 2 }); trailSeg(V3(0, 1.2, -2), V3(-6, 1.2, -5), 0xc8d8ff, 0.08, { life: 0.3, bright: 2 }); cue('cut', 0.8); }]],
      tick: (t, dt) => { burn(dt); fleeTick(dt); h.hero.a.update(dt); for (const f of ambush.slice(1)) if (t > 0.7 && t < 1.7) { const d = V3(-f.pos.x, 0, -2 - f.pos.z); if (d.length() > 1.2) f.pos.addScaledVector(d.normalize(), dt * 7); f.a.yaw = Math.atan2(d.x, d.z); } for (const f of ambush) f.a.update(dt); } },
    // the blade wiped and sheathed; far up the hill the temple flickers with lightning
    { dur: 4.6, from: { pos: [-3, 4.4, 11.5], look: [0, 2.4, -24], fov: 40 }, to: { pos: [-2.6, 5.0, 13], look: [0, 3.0, -26], fov: 40 },
      at: [[0.2, () => { h.hero.a.yaw = Math.PI; h.hero.a.play(new Action('noto', 0.95, 0.64)); }], [0.8, () => cue('sheathe', 0.9)],
        [2.0, () => { flashSky(0.9); fxBolt(V3(2, 22, -34), V3(1, 3, -32), 0xc8b0ff, { width: 0.4, life: 0.35, bright: 0.6 }); }], [2.5, () => cue('thunder', 0.7)]],
      tick: (_t, dt) => { burn(dt); fleeTick(dt); h.hero.a.update(dt); for (const f of ambush) f.a.update(dt); } },
    // the title, cut by a line of light
    { dur: 3.4, from: { pos: [0, 12, 16], look: [0, 0.6, -2], fov: 40 }, to: { pos: [0, 13, 18], look: [0, 0.6, -2], fov: 40 }, caption: { text: '不见刀', big: true, at: 0.2, hold: 2.0 },
      at: [[2.0, () => { cue('ultSlash', 0.8); shake(0.2); }]],
      tick: (_t, dt) => { burn(dt); h.hero.a.update(dt); } },
  ];
}

/** chapter 1's boss comes on: the rainy temple yard, a ring of sound at each step, the chief calls down the lightning, his name */
export function bossIntroShots(h: CineHost, boss: Foe, name: string): CineShot[] {
  const b = boss.pos.clone(), p0: [number, number] = [h.hero.pos.x, h.hero.pos.z], p1: [number, number] = [b.x * 0.3, b.z + 7];
  let stepT = 0;
  return [
    // she walks up the temple court: the camera rides high behind her at her pace (never so close her hat fills the frame)
    { dur: 4.4, ease: 'linear', from: () => { const q = h.hero.pos; return { pos: [q.x, 10, q.z + 12.5], look: [q.x, 0.8, q.z - 5], fov: 40 }; }, to: () => { const q = h.hero.pos; return { pos: [q.x * 0.8 + b.x * 0.2, 9, q.z + 12], look: [q.x * 0.7 + b.x * 0.3, 1.0, q.z - 6], fov: 38 }; },
      tick: (t, dt) => { walker(h, p0, p1, 4.2)(t, dt); stepT -= dt; if (stepT <= 0 && t < 4.2) { stepT = 0.55; fxRing(h.hero.pos.clone().setY(0.05), 0xf2f2ff, 1.1, { life: 0.7, width: 0.08, bright: 1.2 } as never); } boss.a.update(dt); } },
    // the two of them side-on, a long shot (no close-ups in voxels): she small at the left, he on his temple steps at the
    // right; he roars, the sky cracks, his name
    { dur: 3.8, from: { pos: [b.x + 16, 9, b.z + 6.5], look: [b.x - 0.4, 1.2, b.z + 3.2], fov: 36 }, to: { pos: [b.x + 16.5, 10, b.z + 7.5], look: [b.x - 0.4, 1.4, b.z + 3.2], fov: 36 }, caption: { text: name, at: 1.3, hold: 2.0 },
      at: [[0.4, () => { boss.a.roar(); cue('roar', 0.9); }], [1.0, () => { flashSky(1); fxBolt(b.clone().add(V3(1.6, 14, 0)), b.clone().add(V3(1.6, 0, 0.5)), 0xfff2a0, { width: 0.35, life: 0.3, bright: 0.6 }); cue('thunder', 1); shake(0.35); }]],
      tick: (_t, dt) => { boss.a.update(dt); h.hero.a.update(dt); } },
  ];
}
