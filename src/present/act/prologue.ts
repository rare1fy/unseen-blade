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
import { flashSky, currentStage } from '../scenes/stage';
import { PLAY } from '../scenes/props';
import { toon, glow } from '../look/toon';
import { onUpdate } from '../engine/world';
import { motionOf } from './ninjaAct';
import type { Foe, EKind } from './enemy';
import type { CineShot, V } from './timeline';
import type { BattleActor } from '../bestiary/battle';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

/** act-40 (用户：「刘白被驼走的动画，人就这么粘在骡子旁边……僵硬过头了」): her body slung across the donkey's back — face down, the waist
 *  on its spine, the trunk and arms hanging down one side, the legs down the other, everything limp and swinging a little with the
 *  stride (ph = the donkey's walk phase). (x, y, z) is the top of its back, yaw its heading */
let HIP_H = -1;
export function drapeOver(a: BattleActor, x: number, y: number, z: number, yaw: number, ph: number) {
  const b = a.bones;
  if (HIP_H < 0 && b.hips) { a.body.rotation.set(0, 0, 0); a.body.position.set(0, 0, 0); a.root.updateMatrixWorld(true); const hp = new THREE.Vector3(); b.hips.getWorldPosition(hp); HIP_H = Math.max(0.4, hp.y - a.root.position.y); }
  const sw = Math.sin(ph), sw2 = Math.sin(ph * 2 + 0.6);
  a.root.position.set(x, y + Math.abs(sw) * 0.025, z); a.root.rotation.set(0, yaw + Math.PI / 2, 0);
  // face down (her head toward the root's +z = across the donkey), the hips on the root, a hand's breadth above the back
  a.body.rotation.set(Math.PI / 2, 0, 0.05 * sw); a.body.position.set(0, 0.13, -(HIP_H > 0 ? HIP_H : 0.9));
  const R = (n: string, rx: number, ry = 0, rz = 0) => { const o = b[n]; if (o) o.rotation.set(rx, ry, rz); };
  // the trunk folds down over its side; the head hangs; the arms hang past the head toward the ground and swing
  R('spine', 1.05 + 0.04 * sw2); R('chest', 0.4); R('neck', 0.25); R('head', 0.35, 0.15 * sw);
  R('armL', -2.55 + 0.12 * sw, 0, 0.18); R('foreL', -0.25); R('armR', -2.55 - 0.12 * sw, 0, -0.18); R('foreR', -0.3);
  // the legs hang down the other side, knees a little bent, swinging out of step with the arms
  // (the hero's rig flexes the thigh forward with a positive angle — the other way from the 寒山坞 cast's)
  R('legL', 1.3 + 0.08 * sw2, 0, 0.06); R('shinL', -0.3); R('footL', -0.2); R('legR', 1.3 - 0.08 * sw2, 0, -0.06); R('shinR', -0.35); R('footR', -0.2);
}

/** act-37 (用户：「人物的动作也很僵硬，也有很多穿模的问题」): a cutscene camera stays over the yard — inside the walls left, right and
 *  behind (the 2x stage's court), free to stand back in front (the open side), never lower than a man's head — so a shot set relative
 *  to where she fell can't end up inside the buildings beyond the wall */
export function inYard(v: V): V { return [Math.max(PLAY.x0 + 0.8, Math.min(PLAY.x1 - 0.8, v[0])), Math.max(2.5, v[1]), Math.max(PLAY.z0 + 0.8, Math.min(PLAY.z1 + 12, v[2]))]; }
const camKey = (k: { pos: V; look: V; fov: number }) => ({ ...k, pos: inYard(k.pos) });
/** act-37 (用户：「开场的战斗不是雪夜吗，光影上明明就是大白天」): the snowy night's warm points — iron braziers on three legs, a fire
 *  of glowing blocks that dances and a warm light that flickers with it; they are things in the yard (a solid round each) */
const BRAZIERS = new Set<{ g: THREE.Group; light: THREE.PointLight; flames: THREE.Mesh[]; s: number }>();
let brazT = 0;
onUpdate((dt) => {
  brazT += dt;
  for (const b of BRAZIERS) {
    if (!b.g.parent) { BRAZIERS.delete(b); continue; }
    const k = 1 + Math.sin(brazT * 9 + b.s) * 0.12 + Math.sin(brazT * 23 + b.s * 2) * 0.07;
    b.light.intensity = 4.2 * k;
    b.flames.forEach((f, i) => { const q = 1 + Math.sin(brazT * (7 + i) + b.s + i) * 0.18; f.scale.set(q, 1.1 * q + 0.15 * Math.sin(brazT * 11 + i), q); });
  }
});
export function brazier(x: number, z: number) {
  const g = new THREE.Group(), iron = toon(0x2a2a30), ironL = toon(0x4a4a54);
  const box = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); return o; };
  for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [0, 0.26]]) box(0.06, 0.8, 0.06, iron, lx, 0.4, lz);
  box(0.66, 0.1, 0.66, iron, 0, 0.82, 0); box(0.72, 0.16, 0.08, ironL, 0, 0.92, 0.33); box(0.72, 0.16, 0.08, ironL, 0, 0.92, -0.33); box(0.08, 0.16, 0.72, ironL, 0.33, 0.92, 0); box(0.08, 0.16, 0.72, ironL, -0.33, 0.92, 0);
  box(0.5, 0.08, 0.5, toon(0x3a1a10), 0, 0.92, 0);   // coals
  const flames: THREE.Mesh[] = [];
  for (const [fx, fz, h, c] of [[0, 0, 0.36, 0xffb040], [-0.12, 0.08, 0.24, 0xff7a2a], [0.12, -0.06, 0.26, 0xff8a30], [0.02, -0.12, 0.18, 0xffd070]] as Array<[number, number, number, number]>) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14).translate(0, h / 2, 0), glow(c, 2.2)); f.position.set(fx, 0.96, fz); g.add(f); flames.push(f);
  }
  const light = new THREE.PointLight(0xff9a4a, 4.2, 8, 1.6); light.position.set(0, 1.4, 0); g.add(light);
  g.position.set(x, 0, z); BRAZIERS.add({ g, light, flames, s: x * 1.7 + z });
  return g;
}

/** act-36 (用户：「timeline里面的死人堆，就那么几个，算啥死人堆」): a field of the dead that costs a few draw calls — each body is posed once
 *  (on its side, its back or face down, limbs thrown out), then every visible mesh of every body is baked into world space and merged by
 *  material; the actors themselves are thrown away. The pile never moves again (the dead do not breathe). */
export function bakeStill(roots: THREE.Object3D[], parent: THREE.Object3D) {
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || !m.visible || Array.isArray(m.material)) return;
      let vis = true; for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) { vis = false; break; }
      if (!vis) return;
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld); const key = m.material as THREE.Material;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(g);
    });
  }
  const out: THREE.Mesh[] = [];
  for (const [mat, gs] of groups) {
    // (geometries with a different attribute set than the first are merged on their own — never dropped)
    const sets = new Map<string, THREE.BufferGeometry[]>();
    for (const g of gs) { const k = Object.keys(g.attributes).sort().join(',') + (g.index ? '|i' : ''); (sets.get(k) ?? sets.set(k, []).get(k)!).push(g); }
    for (const list of sets.values()) {
      const merged = mergeGeometries(list, false); for (const g of list) g.dispose(); if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; parent.add(mesh); out.push(mesh);
    }
  }
  return out;
}
/** the dead in the temple yard at dawn: the ones given first (he stops at them), then heaps and strays around (deterministic) */
function deadField(ox: number, oz: number, named: Array<[EKind, number, number]>) {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const kinds: EKind[] = ['hj_mob', 'hj_mob', 'hj_blade', 'hj_mob', 'hj_archer', 'hj_blade', 'hj_mob'];
  const out: Array<{ k: EKind; x: number; z: number; y: number; yaw: number; how: 0 | 1 | 2; r: () => number }> = [];
  const free = (x: number, z: number) => Math.hypot(x - ox, z - oz) > 1.6 && out.every(o => Math.hypot(o.x - x, o.z - z) > 0.9 || o.y > 0);
  for (const [k, x, z] of named) out.push({ k, x, z, y: 0, yaw: rnd() * 6.28, how: 0, r: rnd });
  // heaps: two or three bodies, the upper ones lying across the lower (raised, turned)
  const heaps: Array<[number, number, number]> = [[-5.5, -2.5, 3], [4.8, -3.6, 3], [-3.2, -6.4, 2], [6.2, 2.8, 2], [-7.4, 3.2, 3], [2.6, -7.8, 2], [-1.6, 6.8, 2], [7.6, -7.0, 2], [-8.6, -6.0, 2]];
  for (const [hx, hz, n] of heaps) {
    const x0 = ox + hx, z0 = oz + hz; if (!free(x0, z0)) continue;
    for (let i = 0; i < n; i++) out.push({ k: kinds[Math.floor(rnd() * kinds.length)], x: x0 + (rnd() - 0.5) * 0.5, z: z0 + (rnd() - 0.5) * 0.5, y: i * 0.24, yaw: rnd() * 6.28, how: (i === 0 ? 0 : Math.floor(rnd() * 3)) as 0 | 1 | 2, r: rnd });
  }
  // strays: alone, face down or on their backs, across the yard
  for (let t = 0; t < 60 && out.length < 34; t++) {
    const x = ox + (rnd() - 0.5) * 18, z = oz + (rnd() - 0.5) * 16; if (!free(x, z)) continue;
    out.push({ k: kinds[Math.floor(rnd() * kinds.length)], x, z, y: 0, yaw: rnd() * 6.28, how: Math.floor(rnd() * 3) as 0 | 1 | 2, r: rnd });
  }
  return out;
}
/** pose a body as it fell: 0 on its side, 1 on its back, 2 face down; arms and legs thrown out (a little different each one) */
export function layDead(a: BattleActor, how: 0 | 1 | 2, r: () => number) {
  const b = a.bones, rz = (n: string, v: number) => { if (b[n]) b[n].rotation.z = v; }, rx = (n: string, v: number) => { if (b[n]) b[n].rotation.x = v; };
  a.body.rotation.set(0, 0, 0); a.body.position.set(0, 0, 0);
  if (how === 0) { a.body.rotation.z = Math.PI / 2; a.body.rotation.y = (r() - 0.5) * 0.6; a.body.position.set(0.12, 0.12, 0); }
  else if (how === 1) { a.body.rotation.x = -Math.PI / 2; a.body.position.set(0, 0.1, -0.05); }
  else { a.body.rotation.x = Math.PI / 2; a.body.position.set(0, 0.1, 0.05); }
  rz('armL', 0.5 + r() * 1.1); rz('armR', -(0.4 + r() * 1.2)); rx('armL', (r() - 0.5) * 1.2); rx('armR', (r() - 0.5) * 1.2);
  rx('legL', (r() - 0.3) * 0.9); rx('legR', (r() - 0.7) * 0.9); rz('legL', 0.05 + r() * 0.25); rz('legR', -(0.05 + r() * 0.25));
  if (b.head) { b.head.rotation.y = (r() - 0.5) * 1.2; b.head.rotation.z = (r() - 0.5) * 0.5; }
}

/** the blow that ends the first fight: he winds up the ringed staff, lightning, she is struck down; then the camera rises */
export function fallShots(h: PrologueHost, boss: Foe): CineShot[] {
  const hp = () => h.hero.pos, b = () => boss.pos;
  // from the side of the line between them, far enough to see both whole (a medium-wide, never over his shoulder)
  const side = (dist: number, up: number): { pos: V; look: V; fov: number } => {
    const mx = (hp().x + b().x) / 2, mz = (hp().z + b().z) / 2; let dx = b().x - hp().x, dz = b().z - hp().z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let nx = -dz, nz = dx; if (nz < 0) { nx = -nx; nz = -nz; }
    return camKey({ pos: [mx + nx * dist, up, mz + nz * dist] as V, look: [mx, 1.0, mz] as V, fov: 36 });
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
    { dur: 6.5, ease: 'inOut', from: camKey({ pos: [p.x + 2.5, 3.2, p.z + 4.0], look: [p.x, 0.3, p.z], fov: 34 }), to: camKey({ pos: [p.x + 1.0, 13, p.z + 7], look: [p.x, 0, p.z - 1], fov: 38 }),
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
    return camKey({ pos: [fx.x + 5.2, 4.6, fx.z + 6.4] as V, look: [fx.x, 0.6, fx.z] as V, fov: 38 }); };
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
    { dur: 5.5, ease: 'inOut', from: camKey({ pos: [ox + 10, 9.5, oz + 14], look: [ox - 2, 0.2, oz + 1], fov: 40 }), to: camKey({ pos: [ox + 7, 7.5, oz + 11], look: [ox - 2, 0.2, oz + 1.5], fov: 38 }),
      at: [[0, () => {
        // the dead: laid down once, never updated again (no breathing corpses)
        // act-36 (用户：「死人堆，就那么几个，算啥死人堆」): the two he stops at, then the rest of the night's dead — heaps of two and three
        // (bodies thrown across each other), a few alone, all around the yard and up the steps; posed once and baked into a few meshes
        const roots: THREE.Object3D[] = [];
        for (const d of deadField(ox, oz, dead)) {
          const f = h.puppet(d.k, d.x, d.z, d.x + Math.sin(d.yaw), d.z + Math.cos(d.yaw)); f.a.update(0.016); layDead(f.a, d.how, d.r);
          f.a.root.position.set(d.x, d.y, d.z); f.a.root.rotation.y = d.yaw; f.a.root.userData.still = true; roots.push(f.a.root); corpses.push(f);
        }
        const st = currentStage(); if (st) { bakeStill(roots, st.root); for (const r of roots) r.visible = false; }
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
/** the top of the grey donkey's back (m) */
const DONKEY_BACK = 1.02;
export function loadShots(h: PrologueHost, who: { duwu: BattleActor | null; donkey: BattleActor | null }): CineShot[] {
  const duwu = who.duwu as Walker | null, donkey = who.donkey as Walker | null, p = h.hero.pos.clone();
  let crouch = 0; const dir = Math.atan2(-1, 0.35);   // away to the left, toward the yard's way out
  return [
    { dur: 2.6, ease: 'inOut', from: camKey({ pos: [p.x + 4.2, 2.8, p.z + 4.6], look: [p.x, 0.5, p.z], fov: 34 }),
      at: [[1.0, () => { if (duwu) duwu.yaw += 0.6; }], [1.6, () => { if (duwu) duwu.yaw -= 1.1; }], [2.1, () => cue('land', 0.3)]],
      tick: (_t, dt) => { if (!duwu) return; crouch = Math.min(1, crouch + dt * 2.5); duwu.kneel = crouch; duwu.walkPh = undefined; duwu.update(dt); donkey?.update(dt); } },
    // she is across the donkey's back now; he leads it off, she rides along limp
    { dur: 5.5, ease: 'linear', from: camKey({ pos: [p.x + 7.5, 5.2, p.z + 8.5], look: [p.x - 2.5, 0.6, p.z + 1.5], fov: 38 }),
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
        // her: slung across its back, limp, swinging with its stride (act-40)
        drapeOver(h.hero.a, donkey.home.x, DONKEY_BACK, donkey.home.z, dir, donkey.walkPh ?? 0);
        duwu.update(dt); donkey.update(dt);
      } },
  ];
}
/** snow in the air for the snow shots (the room's weather does it in play; the cutscenes add a little more near the camera) */
export function snowPuff(p: THREE.Vector3) { fxSmoke(p.clone().setY(0.2), 0xe8eef8, 2, { r: 0.4, spd: 0.4, up: 0.3, s: 0.3, life: 0.8, alpha: 0.4 }); fxGlow(p, 0xffffff, 0.3, 0.2, 0.5); fxSparks(p, 0xffffff, 2, 1); }
