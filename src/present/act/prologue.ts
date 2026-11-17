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
      tick: (_t, dt) => { if (lie > 0) { lie = Math.min(1, lie + dt * 1.6); lieDown(h.hero.a, lie); } if (lie < 1) h.hero.a.update(dt); boss.a.update(dt); } },   // (act-30: once down, she lies still)
  ];
}
/** after his line: she lies in the snow, the camera rises slowly away, the snow keeps falling */
export function snowShots(h: PrologueHost, boss: Foe): CineShot[] {
  const p = h.hero.pos.clone();
  return [
    { dur: 6.5, ease: 'inOut', from: { pos: [p.x + 2.5, 3.2, p.z + 4.0], look: [p.x, 0.3, p.z], fov: 34 }, to: { pos: [p.x + 1.0, 13, p.z + 7], look: [p.x, 0, p.z - 1], fov: 38 },
      at: [[0.4, () => { boss.a.yaw = Math.atan2(0, -1); }], [1.0, () => cue('bodyFall', 0.5)]],
      tick: (t, dt) => { lieDown(h.hero.a, 1); if (t > 0.8) { boss.pos.z -= dt * 1.2; boss.a.setRunning(true); } boss.a.update(dt); } },
  ];
}
/** act-30 (用户：「人物的动画、穿模那些问题必须好好解决一下了，不然看起来太滑稽了」): the people really walk (legs, arms, bob — the
 *  hooks read walkPh), crouch over what they pick at, and the dead and the unconscious do not move at all (their poses are set once
 *  and never updated again) */
type Walker = BattleActor & { walkPh?: number; kneel?: number };
const place = (a: BattleActor, x: number, z: number, yaw: number) => { a.home.set(x, 0, z); a.yaw = yaw; a.root.position.set(x, 0, z); a.root.rotation.y = yaw; };
/** dawn: the snow has stopped; a lean man with a grey donkey picks over the dead (boots, coins) and comes to her */
export function dawnShots(h: PrologueHost, at: { x: number; z: number }, dead: Array<[EKind, number, number]>, out: { duwu: BattleActor | null; donkey: BattleActor | null }): CineShot[] {
  const ox = at.x, oz = at.z;
  let duwu: Walker | null = null, donkey: Walker | null = null; const corpses: Foe[] = [];
  // where he goes: in from the left, a stop (crouched) at each body, then to her
  const way: Array<[number, number, number]> = [[ox - 10, oz + 6, 0], ...dead.slice(0, 2).map(([, x, z]) => [x + 0.8, z + 0.5, 1.7] as [number, number, number]), [ox + 0.85, oz + 0.55, 0]];
  let seg = 0, segT = 0, dwell = 0, crouch = 0, heading = 0;
  const fx = { x: ox - 4, z: oz + 3 };
  const cam = () => { const d = duwu as Walker | null; if (d) { fx.x += ((d.home.x + ox) / 2 - fx.x) * 0.06; fx.z += ((d.home.z + oz) / 2 - fx.z) * 0.06; }
    return { pos: [fx.x + 5.2, 4.6, fx.z + 6.4] as V, look: [fx.x, 0.6, fx.z] as V, fov: 38 }; };
  const step = (dt: number) => {
    if (!duwu || !donkey) return;
    if (dwell > 0) {
      dwell -= dt; crouch = Math.min(1, crouch + dt * 3); if (dwell < 0.35) crouch = Math.max(0, crouch - dt * 6);
      duwu.walkPh = undefined; donkey.walkPh = undefined; duwu.kneel = crouch; if (dwell <= 0) { duwu.kneel = 0; crouch = 0; }
    } else if (seg < way.length - 1) {
      const [x0, z0] = way[seg], [x1, z1, d1] = way[seg + 1], L = Math.hypot(x1 - x0, z1 - z0), dur = L / 1.25; segT += dt;
      const k = Math.min(1, segT / dur); heading = Math.atan2(x1 - x0, z1 - z0);
      duwu.walkPh = (duwu.walkPh ?? 0) + dt * 7.5; donkey.walkPh = (donkey.walkPh ?? 0) + dt * 6.5; duwu.kneel = 0;
      place(duwu, x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, heading);
      if (k >= 1) { seg++; segT = 0; if (d1 > 0) { dwell = d1; cue('coin', 0.25); } }
    } else { duwu.walkPh = undefined; donkey.walkPh = undefined; duwu.kneel = 0; duwu.yaw = Math.atan2(ox - duwu.home.x, oz - duwu.home.z); }
    // the donkey keeps a pace behind him, on his line
    const bx = duwu.home.x - Math.sin(heading) * 1.9, bz = duwu.home.z - Math.cos(heading) * 1.9;
    place(donkey, donkey.home.x + (bx - donkey.home.x) * Math.min(1, dt * 3), donkey.home.z + (bz - donkey.home.z) * Math.min(1, dt * 3), heading);
    duwu.update(dt); donkey.update(dt);
  };
  return [
    // the yard at dawn, wide: the dead in the snow, her among them; far off a man and a donkey come in
    { dur: 5.5, ease: 'inOut', from: { pos: [ox + 10, 9.5, oz + 14], look: [ox - 2, 0.2, oz + 1], fov: 40 }, to: { pos: [ox + 7, 7.5, oz + 11], look: [ox - 2, 0.2, oz + 1.5], fov: 38 },
      at: [[0, () => {
        // the dead: laid down once, never updated again (no breathing corpses)
        for (const [k, x, z] of dead) { const f = h.puppet(k, x, z, x + 1, z); f.a.update(0.016); lieDown(f.a, 1); f.a.root.userData.still = true; corpses.push(f); }
        duwu = h.person('duwu', way[0][0], way[0][1], 0) as Walker; donkey = h.person('donkey', way[0][0] - 1.9, way[0][1], 0) as Walker; out.duwu = duwu; out.donkey = donkey;
        lieDown(h.hero.a, 1);
      }]],
      tick: (_t, dt) => step(dt) },
    // closer (medium): he stops, crouches over the bodies, then comes to her
    // (the camera keeps him in frame: it follows a smoothed point between him and her)
    { dur: 9.5, ease: 'linear', from: () => cam(), to: () => cam(),
      tick: (_t, dt) => step(dt) },
  ];
}
/** after his words: he kneels to her, looks round; then (a cut) she lies across the donkey's back and he leads it away */
export function loadShots(h: PrologueHost, who: { duwu: BattleActor | null; donkey: BattleActor | null }): CineShot[] {
  const duwu = who.duwu as Walker | null, donkey = who.donkey as Walker | null, p = h.hero.pos.clone();
  let crouch = 0; const dir = Math.atan2(-1, 0.35);   // away to the left, toward the yard's way out
  return [
    { dur: 2.6, ease: 'inOut', from: { pos: [p.x + 4.2, 2.8, p.z + 4.6], look: [p.x, 0.5, p.z], fov: 34 },
      at: [[1.0, () => { if (duwu) duwu.yaw += 0.6; }], [1.6, () => { if (duwu) duwu.yaw -= 1.1; }], [2.1, () => cue('land', 0.3)]],
      tick: (_t, dt) => { if (!duwu) return; crouch = Math.min(1, crouch + dt * 2.5); duwu.kneel = crouch; duwu.walkPh = undefined; duwu.update(dt); donkey?.update(dt); } },
    // she is across the donkey's back now; he leads it off, she rides along limp
    { dur: 5.5, ease: 'linear', from: { pos: [p.x + 7.5, 5.2, p.z + 8.5], look: [p.x - 2.5, 0.6, p.z + 1.5], fov: 38 },
      at: [[0, () => {
        if (!duwu || !donkey) return;
        place(donkey, p.x - 0.6, p.z + 0.9, dir); place(duwu, p.x - 0.6 + Math.sin(dir) * 1.5, p.z + 0.9 + Math.cos(dir) * 1.5, dir); duwu.kneel = 0;
      }]],
      tick: (t, dt) => {
        if (!duwu || !donkey) return;
        const v = 1.0 * Math.min(1, t * 1.5);
        duwu.walkPh = (duwu.walkPh ?? 0) + dt * 6.5 * Math.min(1, t * 1.5); donkey.walkPh = (donkey.walkPh ?? 0) + dt * 6 * Math.min(1, t * 1.5);
        place(duwu, duwu.home.x + Math.sin(dir) * v * dt, duwu.home.z + Math.cos(dir) * v * dt, dir);
        place(donkey, donkey.home.x + Math.sin(dir) * v * dt, donkey.home.z + Math.cos(dir) * v * dt, dir);
        // her: lying across its back (side-on to its spine), riding with it; her pose stays as it fell
        const a = h.hero.a; lieDown(a, 1); a.root.position.set(donkey.home.x, 0.98 + Math.abs(Math.sin(donkey.walkPh ?? 0)) * 0.02, donkey.home.z); a.root.rotation.y = dir + Math.PI / 2;
        duwu.update(dt); donkey.update(dt);
      } },
  ];
}
/** snow in the air for the snow shots (the room's weather does it in play; the cutscenes add a little more near the camera) */
export function snowPuff(p: THREE.Vector3) { fxSmoke(p.clone().setY(0.2), 0xe8eef8, 2, { r: 0.4, spd: 0.4, up: 0.3, s: 0.3, life: 0.8, alpha: 0.4 }); fxGlow(p, 0xffffff, 0.3, 0.2, 0.5); fxSparks(p, 0xffffff, 2, 1); }
