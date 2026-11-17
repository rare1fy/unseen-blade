// 开篇（act-29，用户选方案 1：「方案1开做吧」；设计见 docs/DESIGN.md「故事开篇与对话演出」「按钮说明、界面优化、开篇方案 1 开工」）。
// 那一夜（寒山坞，冷开场）→「七年后」→ 雪夜残村（序章第一间，一个人打几个黄巾哨兵）→ 雪夜破庙见褚雷，两三句后开打，他打不死，
// 到时候一杖把她砸倒 → 倒在雪里，镜头升高、雪往下落 → 天亮：收尸的杜五牵驴扒死人鞋，摸到她还有气，犹豫，把她拖走 → 破窑醒来。
// 这里只放演出的镜头（timeline 只交代事和氛围，台词走立绘对话，show.ts 在镜头之间插 talk()）。全是中远景，没有特写。
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { Action } from '../actors/rig';
import { fxRing, fxSparks, fxImpact, fxGlow, fxSmoke } from '../fx/fx';
import { fxBolt } from '../fx/skillFx';
import { shake, slowmo } from '../engine/clock';
import { cue } from '../../audio/cues';
import { flashSky } from '../scenes/stage';
import { motionOf } from './ninjaAct';
import type { Foe, EKind } from './enemy';
import type { CineShot, V } from './timeline';
import type { BattleActor } from '../bestiary/battle';

export interface PrologueHost {
  hero: { a: BattleActor; pos: THREE.Vector3 };
  /** a person placed in the scene for the cutscene (杜五, the donkey); the host updates and removes them */
  person(id: 'duwu' | 'donkey', x: number, z: number, yaw: number): BattleActor;
  puppet(kind: EKind, x: number, z: number, faceX: number, faceZ: number): Foe;
}

/** lay an actor down on her side in the snow (k 0 → 1): the body pivots at the feet, a little sunk; poses keep breathing */
export function lieDown(a: BattleActor, k: number) {
  const e = 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
  a.body.rotation.set(0, 0, 0); a.body.rotation.z = (Math.PI / 2) * e; a.body.rotation.y = 0.25 * e; a.body.position.set(0.12 * e, 0.12 * e, 0);
}

/** the blow that ends the first fight: he winds up the ringed staff, lightning, she is struck down; then the camera rises */
export function fallShots(h: PrologueHost, boss: Foe): CineShot[] {
  const hp = () => h.hero.pos, b = () => boss.pos;
  // from the side of the line between them, far enough to see both whole (a medium-wide, never over his shoulder)
  const side = (dist: number, up: number): { pos: V; look: V; fov: number } => {
    const mx = (hp().x + b().x) / 2, mz = (hp().z + b().z) / 2; let dx = b().x - hp().x, dz = b().z - hp().z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let nx = -dz, nz = dx; if (nz < 0) { nx = -nx; nz = -nz; }
    return { pos: [mx + nx * dist, up, mz + nz * dist], look: [mx, 1.0, mz], fov: 36 };
  };
  let lie = 0;
  return [
    { dur: 2.2, ease: 'out', from: () => side(11, 5.5), to: () => side(10, 5.0),
      at: [[0.1, () => { boss.a.yaw = Math.atan2(hp().x - b().x, hp().z - b().z); boss.a.roar(); cue('roar', 0.8); }],
        [0.9, () => { flashSky(1); fxBolt(V3(b().x, 24, b().z), V3(b().x, 3.4, b().z), 0xd8c8ff, { width: 0.5, life: 0.4, bright: 0.7 }); cue('thunder', 1); }],
        [1.25, () => { slowmo(0.9, 0.2); shake(0.6); fxImpact(h.hero.a.chest(), 0xfff0d0, 2.2, { stop: false }); fxRing(hp().clone().setY(0.06), 0xffffff, 3, { life: 0.6 } as never);
          h.hero.a.play(new Action('hurt', 0.6, 0.1, { power: 2 })); cue('cutHeavy', 1); cue('hurt', 1); lie = 0.001; }]],
      tick: (_t, dt) => { if (lie > 0) { lie = Math.min(1, lie + dt * 1.6); lieDown(h.hero.a, lie); } h.hero.a.update(dt); boss.a.update(dt); } },
  ];
}
/** after his line: she lies in the snow, the camera rises slowly away, the snow keeps falling */
export function snowShots(h: PrologueHost, boss: Foe): CineShot[] {
  const p = h.hero.pos.clone();
  return [
    { dur: 6.5, ease: 'inOut', from: { pos: [p.x + 2.5, 3.2, p.z + 4.0], look: [p.x, 0.3, p.z], fov: 34 }, to: { pos: [p.x + 1.0, 13, p.z + 7], look: [p.x, 0, p.z - 1], fov: 38 },
      at: [[0.4, () => { boss.a.yaw = Math.atan2(0, -1); }], [1.0, () => cue('bodyFall', 0.5)]],
      tick: (t, dt) => { lieDown(h.hero.a, 1); h.hero.a.update(dt); if (t > 0.8) { boss.pos.z -= dt * 1.2; boss.a.setRunning(true); } boss.a.update(dt); } },
  ];
}
/** dawn: the snow has stopped; a lean man with a grey donkey picks over the dead (boots, coins) and comes to her */
export function dawnShots(h: PrologueHost, at: { x: number; z: number }, dead: Array<[EKind, number, number]>): CineShot[] {
  const ox = at.x, oz = at.z;
  let duwu: BattleActor | null = null, donkey: BattleActor | null = null; const corpses: Foe[] = [];
  const path: Array<[number, number]> = [[ox - 9, oz + 6], [dead[0] ? dead[0][1] + 0.9 : ox - 4, dead[0] ? dead[0][2] + 0.4 : oz + 3], [dead[1] ? dead[1][1] + 0.9 : ox - 2, dead[1] ? dead[1][2] + 0.4 : oz + 2], [ox + 0.9, oz + 0.5]];
  let seg = 0, segT = 0, stopT = 0;
  const walk = (dt: number) => {
    if (!duwu) return; const m = motionOf(duwu);
    if (seg >= path.length - 1) { m.run = Math.max(0, m.run - dt * 4); duwu.update(dt); return; }
    if (stopT > 0) { stopT -= dt; m.run = Math.max(0, m.run - dt * 4); duwu.update(dt); return; }
    const [x0, z0] = path[seg], [x1, z1] = path[seg + 1], L = Math.hypot(x1 - x0, z1 - z0), dur = L / 1.3; segT += dt;
    const k = Math.min(1, segT / dur); duwu.home.set(x0 + (x1 - x0) * k, 0, z0 + (z1 - z0) * k); duwu.root.position.copy(duwu.home);
    duwu.yaw = Math.atan2(x1 - x0, z1 - z0); m.run = 0.32; m.phase += dt * 3.2; duwu.update(dt);
    if (donkey) { donkey.home.set(duwu.home.x - 1.6 * Math.sin(duwu.yaw), 0, duwu.home.z - 1.6 * Math.cos(duwu.yaw)); donkey.root.position.copy(donkey.home); donkey.yaw = duwu.yaw; const dm = motionOf(donkey); dm.run = 0.3; dm.phase += dt * 3; donkey.update(dt); }
    if (k >= 1) { seg++; segT = 0; stopT = seg < path.length - 1 ? 1.3 : 0; if (seg < path.length - 1) cue('coin', 0.2); }
  };
  return [
    // the yard at dawn, wide: the dead in the snow, her among them; far off a man and a donkey come in
    { dur: 5.5, ease: 'inOut', from: { pos: [ox + 10, 9.5, oz + 14], look: [ox - 2, 0.2, oz + 1], fov: 40 }, to: { pos: [ox + 7, 7.5, oz + 11], look: [ox - 2, 0.2, oz + 1.5], fov: 38 },
      at: [[0, () => {
        for (const [k, x, z] of dead) { const f = h.puppet(k, x, z, x + 1, z); f.a.update(0.016); lieDown(f.a, 1); corpses.push(f); }
        duwu = h.person('duwu', path[0][0], path[0][1], 0); donkey = h.person('donkey', path[0][0] - 1.6, path[0][1], 0); lieDown(h.hero.a, 1);
      }]],
      tick: (_t, dt) => { walk(dt); lieDown(h.hero.a, 1); h.hero.a.update(dt); for (const f of corpses) { lieDown(f.a, 1); f.a.update(dt); } } },
    // closer (medium): he stops by the bodies, then by her
    { dur: 6.5, ease: 'linear', from: () => ({ pos: [ox + 5.5, 4.2, oz + 6.5] as V, look: [ox - 1.2, 0.6, oz + 1.6] as V, fov: 34 }),
      tick: (_t, dt) => { walk(dt); lieDown(h.hero.a, 1); h.hero.a.update(dt); for (const f of corpses) { lieDown(f.a, 1); f.a.update(dt); } } },
  ];
}
/** after his words: he looks round, crouches, takes her under the arms and drags her off to the cart */
export function dragShots(h: PrologueHost, duwuOf: () => BattleActor | null): CineShot[] {
  const start = h.hero.pos.clone();
  return [
    { dur: 5.2, ease: 'inOut', from: { pos: [start.x + 6, 3.6, start.z + 6], look: [start.x, 0.5, start.z], fov: 36 }, to: { pos: [start.x + 7.5, 5.5, start.z + 9], look: [start.x - 2.5, 0.5, start.z + 2], fov: 38 },
      at: [[0.2, () => { const d = duwuOf(); if (d) d.yaw = -Math.PI / 2; }], [0.9, () => { const d = duwuOf(); if (d) d.yaw = Math.PI / 2; }], [1.6, () => cue('land', 0.3)]],
      tick: (t, dt) => {
        const d = duwuOf(); lieDown(h.hero.a, 1);
        if (d && t > 1.8) { const k = (t - 1.8) * 0.9; d.home.set(start.x + 0.9 - k, 0, start.z + 0.5 + k * 0.5); d.root.position.copy(d.home); d.yaw = Math.atan2(-1, 0.5) + Math.PI; const m = motionOf(d); m.run = 0.22; m.phase += dt * 2.2;
          h.hero.pos.set(start.x - k * 0.95, 0, start.z + k * 0.48); }
        d?.update(dt); h.hero.a.update(dt);
      } },
  ];
}
/** snow in the air for the snow shots (the room's weather does it in play; the cutscenes add a little more near the camera) */
export function snowPuff(p: THREE.Vector3) { fxSmoke(p.clone().setY(0.2), 0xe8eef8, 2, { r: 0.4, spd: 0.4, up: 0.3, s: 0.3, life: 0.8, alpha: 0.4 }); fxGlow(p, 0xffffff, 0.3, 0.2, 0.5); fxSparks(p, 0xffffff, 2, 1); }
