// act-37 冷开场「那一夜」。v1（远景四支火把进坞 → 风箱底 → 石灰 → 声纹 → 雪盖父女，约 50 秒）用户说「太长了，太拖沓……人都全部叠一起了」
// 「看不懂到底发生了什么」，并给了分镜；v2 照分镜（约 30 秒，镜头和闪回见 coldOpenShots 的说明）：俯视里贼兵烧完抢完跑着撤出坞门 → 推到
// 伏在阿爹尸体上哭的女孩 → 正面掩面哭，中间硬切四次闪回（放火、一刀砍死阿爹、褚雷狂笑、第一人称：锻炉被踹翻、红炭和热灰扑脸），
// 每次切回头发白一截 → 黑屏声纹「阿爹说……」→「七年了……」。眼睛改成意外烫瞎（用户：「贼人作乱意外伤到眼睛更好」），不再是石灰。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { onUpdate } from '../engine/world';
import { cue } from '../../audio/cues';
import { ROSTER } from '../bestiary/models';
import { BattleActor } from '../bestiary/battle';
import { HS_FORGE, hsRoadY } from '../asm/hanshan/hs_forge';
import { childPose, childSnap, killerPose, killerSnap, torchLight, fatherPose, CHILD_WENJIAO, CHILD_GREYS, CHILD_WHITE, FATHER_DEF } from './hanshan_people';
import { GRADE } from '../look/post';
import type { CineShot, V } from './timeline';
import { PRO_COLD, COLD_CARDS } from './scripts';
import { V3 } from '../engine/world';
import { hitstop } from '../engine/clock';
import { addBlock } from '../fx/blocks';
import { blood } from './blood';
import { layDead } from './prologue';
import { PX } from '../look/pixel';

// ---------------------------------------------------------------- her blind eyes: black, and every sound a ring
/** a square ring of outer half-size 1 whose band is set per mesh (setBand): the corner cells stay square */
const SQ_RING = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3)); g.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]); return g; })();
const BANDS = new Map<number, THREE.BufferGeometry>();
/** the ring's band: inner half-size 1 − w (w in units of the outer half-size), geometry shared per width */
function setBand(m: THREE.Mesh, w: number) {
  const q = Math.round(w * 200) / 200; let g = BANDS.get(q);
  if (!g) { const i = 1 - q; g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0, -i, -i, 0, i, -i, 0, i, i, 0, -i, i, 0]), 3));
    g.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]); BANDS.set(q, g); }
  m.geometry = g;
}
interface Ring { m: THREE.Mesh; x: number; y: number; vx: number; vy: number; r0: number; r1: number; t: number; life: number; a: number }
export class BlindPOV {
  private veil: THREE.Mesh; private rings: Ring[] = []; private pool: THREE.Mesh[] = []; private k = 0; private want = 0; private col = new THREE.Color(0x000000); private alive = true;
  constructor(private L: UiLayer) {
    onUpdate((_dt, rdt) => { if (this.alive) this.update(rdt); });   // (it runs on its own: the dark outlasts the cutscene)
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.veil.renderOrder = 55; this.veil.visible = false; L.scene.add(this.veil);
  }
  /** cover the screen with a colour (white = the lime, black = her blindness); secs to get there */
  fill(color: number, alpha: number, now = false) { this.col.setHex(color); this.want = alpha; if (now) this.k = alpha; }
  /** a sound: a ring at (x, y) in 0..1 screen units, growing from r0 to r1 px, drifting, fading; colour; strength */
  ring(x: number, y: number, o: { r0?: number; r1?: number; life?: number; vx?: number; vy?: number; col?: number; a?: number } = {}) {
    // (11-19 用户：「开场黑幕文字的波纹不是像素风的」: a square ring, its band a whole number of screen pixels, its size stepping out a
    //  pixel block at a time and its brightness in three steps — not a smooth round anti-aliased circle)
    const m = this.pool.pop() ?? new THREE.Mesh(SQ_RING, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    (m.material as THREE.MeshBasicMaterial).color.setHex(o.col ?? 0xdfe8ff); m.renderOrder = 56; this.L.scene.add(m);
    this.rings.push({ m, x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, r0: o.r0 ?? 4, r1: o.r1 ?? 40, t: 0, life: o.life ?? 1.4, a: o.a ?? 0.7 });
  }
  update(dt: number) {
    const L = this.L; this.k += (this.want - this.k) * Math.min(1, dt * 4);
    const vm = this.veil.material as THREE.MeshBasicMaterial; vm.color.copy(this.col); vm.opacity = this.k; this.veil.visible = this.k > 0.003;
    L.at(L.w / 2, L.h / 2, 0, this.veil.position); this.veil.scale.set(L.px(L.w + 40), L.px(L.h + 40), 1);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = r.t / r.life;
      if (k >= 1) { this.L.scene.remove(r.m); this.pool.push(r.m); this.rings.splice(i, 1); continue; }
      r.x += r.vx * dt; r.y += r.vy * dt;
      // the radius in whole art pixels (the pixel look's block: 2 CSS px at 2x), the centre on the pixel grid, the brightness in steps
      const blk = PX.on ? PX.size : 1, rad = Math.max(2, Math.round((r.r0 + (r.r1 - r.r0) * (1 - (1 - k) ** 2)) / (2 * blk)) * 2 * blk);
      const cx = Math.round(r.x * L.w / blk) * blk, cy = Math.round(r.y * L.h / blk) * blk;
      L.at(cx, cy, 0, r.m.position); r.m.scale.setScalar(L.px(rad));
      const op = r.a * (1 - k) * Math.min(1, r.t * 8);
      (r.m.material as THREE.MeshBasicMaterial).opacity = op > 0.6 * r.a ? r.a : op > 0.3 * r.a ? 0.6 * r.a : op > 0.06 * r.a ? 0.3 * r.a : 0;
      // (the band: one art pixel thick whatever the radius — the geometry is a unit square ring, its inner edge set per ring)
      setBand(r.m, Math.min(0.5, blk / rad));
    }
  }
  dispose() { this.alive = false; for (const r of this.rings) this.L.scene.remove(r.m); this.rings = []; this.L.scene.remove(this.veil); }
}

// ---------------------------------------------------------------- the people of that night
/** the locale's anchors are [x, y, z] */
const T = (p: readonly number[]) => ({ x: p[0], y: p[1], z: p[2] });
const spawn = (id: string, root: THREE.Object3D, x: number, z: number, yaw: number, y = 0) => {
  const def = ROSTER.find(d => d.id === id); if (!def) throw new Error('no model ' + id);
  const a = new BattleActor(def); a.home.set(x, y, z); a.yaw = yaw; a.root.position.set(x, y, z); a.root.rotation.y = yaw; root.add(a.root); return a;
};
const place = (a: BattleActor, x: number, z: number, yaw: number, y = 0) => { a.home.set(x, y, z); a.yaw = yaw; a.root.position.set(x, y, z); a.root.rotation.y = yaw; };

/** the second black card (agy, gemini-3.8-flash-high; the user: 「七年了，这次血债血偿之类的」) */
export const COLD_CARD2 = '七年了。刀磨好了。';

export interface ColdHost { root: THREE.Object3D; pov: BlindPOV }
/**
 * act-37 冷开场 v2 — the user's storyboard (「timeline……太长了，太拖沓……看不懂到底发生了什么」→ 约半分钟):
 *  1–2 from high above, the raiders running out of the burning village, the camera pushing down to the girl bowed over her father;
 *  3 her face-on, kneeling, hands over her face; four flashbacks cut in (the torch to the thatch, the blow that kills him, 褚雷's laugh,
 *    her own eyes: the forge kicked over, the coals and hot ash in her face) — after each her hair is whiter; at the end it is white;
 *  4 black, rings of sound, 「阿爹说……」; 5 the second card; then the snowy village seven years on.
 */
export function coldOpenShots(h: ColdHost): { shots: CineShot[]; dispose: () => void } {
  const U = T(HS_FORGE.underBellows), UY = HS_FORGE.underYaw, root = h.root, pov = h.pov;
  const people: BattleActor[] = [], lights: Array<() => void> = [], fires: Array<{ x: number; z: number; y: number; w: number; d: number; l: THREE.PointLight; on: boolean }> = [];
  // the father lies on his back in the trodden snow before the forge, head toward it; she kneels at his side facing the road
  const DAD = { x: -0.25, z: -0.35 }, GIRL = { x: -1.3, z: -1.25 };
  let dad: BattleActor | null = null, dadUp: BattleActor | null = null, girls: BattleActor[] = [], hair = 0, killer: BattleActor | null = null, chu: BattleActor | null = null, kicker: BattleActor | null = null;
  const runners: Array<{ a: BattleActor; lane: number; z0: number }> = [];
  const faceLight = new THREE.PointLight(0xffa060, 0, 3.5, 1.5);
  let flash = 0, flashT = 0;
  const pulse = (k: number) => { flash = Math.max(flash, k); flashT = 0; };
  // ---- the village burning: three thatch roofs, flame blocks off the ridge, an orange light each
  const fire = (x: number, z: number, y: number, w: number, d: number) => { const l = new THREE.PointLight(0xff7a30, 0, 10, 1.6); l.position.set(x, y + 0.6, z); root.add(l); fires.push({ x, z, y, w, d, l, on: true }); };
  const burn = (dt: number, t: number) => {
    for (const f of fires) {
      f.l.intensity = f.on ? 3.2 * (1 + Math.sin(t * 9 + f.x) * 0.15 + Math.sin(t * 23 + f.z) * 0.08) : 0;
      if (!f.on) continue;
      const n = Math.random() < dt * 60 ? 2 : Math.random() < dt * 30 ? 1 : 0;
      for (let i = 0; i < n; i++) addBlock(V3(f.x + (Math.random() - 0.5) * f.w, f.y + Math.random() * 0.4, f.z + (Math.random() - 0.5) * f.d), { size: 0.16 + Math.random() * 0.16, v: V3((Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 1.4, (Math.random() - 0.5) * 0.4), col: Math.random() < 0.45 ? 0xffc04a : Math.random() < 0.7 ? 0xff7a28 : 0xd8401a, bright: 1.5, life: 0.55 + Math.random() * 0.3, shrink: 0.6, drag: 1, grav: 0 });
    }
  };
  const showNow = (on: boolean) => { if (dad) dad.root.visible = on; girls.forEach((g, i) => { g.root.visible = on && i === hair; }); };
  const setHair = (k: number) => { hair = Math.min(girls.length - 1, k); showNow(true); };
  const girl = () => girls[hair];
  const tickGirl = (dt: number) => { const g = girl(); if (g) g.update(dt); };
  // the flash and the memory's colour: a short white cut-in, a warm dark veil while it lasts, the colour drained
  const G0 = { exposure: GRADE.exposure, vig: GRADE.vig, gain: GRADE.gain.clone() }, NIGHT = 0.8;
  GRADE.exposure = G0.exposure * NIGHT;   // (the snow under the moon read as day from above: the whole night a fifth darker)
  const memory = (on: boolean) => {
    pov.fill(0x000000, 0, true); GRADE.desat = on ? 0.3 : 0; GRADE.exposure = G0.exposure * NIGHT * (on ? 0.68 : 1); GRADE.vig = on ? 1.05 : G0.vig;
    if (on) GRADE.gain.setRGB(1.16, 0.86, 0.76); else GRADE.gain.copy(G0.gain);
  };
  const fade = (dt: number) => { flashT += dt; GRADE.flash = flash * Math.max(0, 1 - flashT / 0.22); };
  // the runners' line: their own lane in the village street, closing to the middle (|x| < 0.8) through the gate and up the cutting
  const laneX = (lane: number, z: number) => (z > -6 ? lane : z > -11 ? lane + (lane * 0.4 - lane) * ((-6 - z) / 5) : lane * 0.4);
  const runTick = (t: number, dt: number) => runners.forEach(r => {
    const z = r.z0 - t * 4.2, x = laneX(r.lane, z), y = hsRoadY(z);
    r.a.home.set(x, y, z); r.a.root.position.set(x, y, z); r.a.yaw = Math.PI; r.a.root.rotation.y = Math.PI; r.a.update(dt);
    r.a.root.visible = z > -24;
  });
  const front = (back: number, up = 0.85): CineShot['from'] => ({ pos: [GIRL.x - 0.05, up, GIRL.z + back] as V, look: [GIRL.x, 0.6, GIRL.z] as V, fov: 30 });
  const C = (dur: number, back0: number, back1: number, k: number, extra?: (t: number, dt: number) => void): CineShot => ({
    dur, ease: 'linear', from: front(back0), to: front(back1),
    at: [[0, () => { memory(false); setHair(k); runners.forEach(r => { r.a.root.visible = false; }); if (killer) killer.root.visible = false; if (chu) chu.root.visible = false; if (kicker) kicker.root.visible = false; if (dadUp) dadUp.root.visible = false; pulse(k > 0 ? 0.55 : 0); }]],
    tick: (t, dt) => { fade(dt); tickGirl(dt); burn(dt, t); extra?.(t, dt); },
  });
  const shots: CineShot[] = [
    // 1 from high above: the village burning, the raiders running out up the street, through the gate, up the cutting
    { dur: 6, ease: 'inOut', caption: { text: '熹平六年 · 寒山坞', at: 0.6, hold: 3.2 },
      from: { pos: [0.6, 24, 3.0], look: [0.2, 0, -2.6], fov: 42 }, to: { pos: [-0.6, 13.5, 1.2], look: [-0.9, 0, -1.4], fov: 42 },
      at: [[0, () => {
        // the dead father and the girl bowed over him, there from the first frame (small, far below)
        dad = spawn(FATHER_DEF.id, root, DAD.x, DAD.z, Math.PI / 2); people.push(dad); dad.update(0.016); layDead(dad, 1, () => 0.5);
        if (dad.bones.head) dad.bones.head.rotation.y = 0.5;
        girls = [CHILD_WENJIAO, ...CHILD_GREYS, CHILD_WHITE].map(d => { const g = spawn(d.id, root, GIRL.x, GIRL.z, 0); Object.assign(childPose(g), { kneel: 1, bow: 1 }); childSnap(g); g.update(0.016); people.push(g); return g; });
        setHair(0);
        // six of them, a lane each, two metres apart: 褚雷 among them; three torches lit
        [0.55, 1.45, 0.9, 1.85, 0.6, 1.25].forEach((lane, i) => {
          const a = spawn(i === 1 ? 'killer_big' : 'killer_cloak', root, lane, 2 + i * 2, Math.PI); Object.assign(killerPose(a), { walk: 4.2, torch: i % 2 ? 0 : 1 }); killerSnap(a); people.push(a);
          if (i % 2 === 0) lights.push(torchLight(a, 2.0, 6)); runners.push({ a, lane, z0: 2 + i * 2 });
        });
        fire(6.0, -8.6, 2.5, 1.4, 3.0); fire(-5.8, -9.4, 2.5, 1.4, 3.0); fire(6.2, 4.8, 2.5, 1.4, 3.0);
        cue('fire', 0.4);
      }]],
      tick: (t, dt) => { runTick(t, dt); burn(dt, t); tickGirl(dt); } },
    // 2 still pushing down: the street empty now; her, bowed over him, from straight above
    { dur: 4, ease: 'out', from: { pos: [-0.6, 13.5, 1.2], look: [-0.9, 0, -1.4], fov: 42 }, to: { pos: [-1.1, 4.3, 1.4], look: [-1.15, 0.15, -0.8], fov: 40 },
      tick: (t, dt) => { runTick(6 + t, dt); burn(dt, 6 + t); tickGirl(dt); } },
    // 3 face-on: kneeling, both hands over her face, the shoulders heaving
    { ...C(2.4, 3.1, 2.9, 0), at: [[0, () => { for (const g of girls) { Object.assign(childPose(g), { kneel: 1, bow: 0, sob: 1 }); childSnap(g); } runners.forEach(r => { r.a.root.visible = false; }); }]] },
    // flashback 1: a raider holds his torch into the thatch eaves; the roof goes up
    { dur: 1.3, ease: 'linear', from: { pos: [-2.2, 0.9, -7.2], look: [-4.9, 2.1, -9.4], fov: 38 }, to: { pos: [-2.4, 0.9, -7.4], look: [-4.9, 2.2, -9.4], fov: 38 },
      at: [[0, () => {
        showNow(false); memory(true); pulse(0.8); cue('whoosh', 0.5);
        if (!killer) { killer = spawn('killer_cloak', root, -4.0, -9.0, -Math.PI / 2); people.push(killer); } place(killer, -4.0, -9.0, -Math.PI / 2);
        Object.assign(killerPose(killer), { walk: 0, torch: 1, reach: 0.5, look: 0 }); killerSnap(killer); killer.root.visible = true; lights.push(torchLight(killer, 2.2, 6));
      }], [0.45, () => { addBlockBurst(V3(-4.7, 2.3, -9.4), 26, 1.0); cue('fire', 0.6); }]],
      tick: (t, dt) => { fade(dt); if (killer) killer.update(dt); burn(dt, t); } },
    C(1.4, 2.85, 2.75, 1),
    // flashback 2: in front of the forge, a raider's sabre comes down on her father
    { dur: 1.4, ease: 'linear', from: { pos: [-0.7, 1.55, 3.9], look: [-0.75, 1.15, -0.4], fov: 36 }, to: { pos: [-0.7, 1.5, 3.6], look: [-0.75, 1.15, -0.4], fov: 36 },
      at: [[0, () => {
        showNow(false); memory(true); pulse(0.8); cue('whoosh', 0.5);
        if (!dadUp) { dadUp = spawn(FATHER_DEF.id, root, -1.45, -0.4, Math.PI / 2); people.push(dadUp); } place(dadUp, -1.45, -0.4, Math.PI / 2); dadUp.root.visible = true;
        if (killer) { place(killer, -0.05, -0.4, -Math.PI / 2); Object.assign(killerPose(killer), { torch: 0, reach: 0, swing: 1 }); killerSnap(killer); killer.root.visible = true; }
      }], [0.38, () => { if (killer) killerPose(killer).swing = 2; }],
        [0.52, () => { if (dadUp) { fatherPose(dadUp).flinch = 1; blood.spray(dadUp.local(0, 1.35, 0.1), V3(-1, 0.25, 0.2).normalize(), 34, 1.3); } cue('cutHeavy', 1); cue('gore', 0.8); hitstop(0.06); }]],
      tick: (t, dt) => { fade(dt); blood.update(dt); if (killer) killer.update(dt); if (dadUp) dadUp.update(dt); burn(dt, t); } },
    C(1.4, 2.7, 2.6, 2),
    // flashback 3: 褚雷 against the fire, head thrown back, laughing
    { dur: 1.2, ease: 'linear', from: { pos: [2.2, 1.25, 0.9], look: [1.0, 1.75, -3.0], fov: 36 }, to: { pos: [2.1, 1.25, 0.6], look: [1.0, 1.8, -3.0], fov: 36 },
      at: [[0, () => {
        showNow(false); memory(true); pulse(0.8); cue('whoosh', 0.5);
        if (killer) killer.root.visible = false; if (dadUp) dadUp.root.visible = false;
        if (!chu) { chu = spawn('killer_big', root, 1.0, -3.0, 0); people.push(chu); } place(chu, 1.0, -3.0, 0);
        Object.assign(killerPose(chu), { walk: 0, torch: 1, laugh: 1 }); killerSnap(chu); chu.root.visible = true; lights.push(torchLight(chu, 2.4, 6));
        faceLight.position.set(1.15, 2.3, -2.1); faceLight.intensity = 3.5; root.add(faceLight);
        cue('roar', 0.35);
      }]],
      tick: (t, dt) => { fade(dt); if (chu) chu.update(dt); burn(dt, t); } },
    C(1.2, 2.55, 2.45, 3),
    // flashback 4: her own eyes, from beside the hearth — a boot kicks the forge over; the coals and the hot ash come at her; white
    { dur: 1.5, ease: 'linear',
      from: () => ({ pos: [U.x + Math.sin(UY) * 0.45, 0.55, U.z + Math.cos(UY) * 0.45] as V, look: [U.x + Math.sin(UY) * 2.4, 0.95, U.z + Math.cos(UY) * 2.4] as V, fov: 46 }),
      at: [[0, () => {
        showNow(false); memory(true); pulse(0.8); cue('whoosh', 0.5);
        if (chu) chu.root.visible = false; faceLight.intensity = 0;
        const kx = U.x + Math.sin(UY) * 2.0, kz = U.z + Math.cos(UY) * 2.0;
        if (!kicker) { kicker = spawn('killer_cloak', root, kx, kz, UY + Math.PI); people.push(kicker); } place(kicker, kx, kz, UY + Math.PI);
        Object.assign(killerPose(kicker), { walk: 0, torch: 0, swing: 0, laugh: 0, kick: 0, down: 0.6 }); killerSnap(kicker); kicker.root.visible = true; lights.push(torchLight(kicker, 1.6, 5));
      }], [0.45, () => { if (kicker) killerPose(kicker).kick = 1; cue('wallSlam', 0.7); }],
        [0.62, () => {
          // the coals and the ash: a spray of glowing blocks from the hearth straight at her face
          const eye = V3(U.x + Math.sin(UY) * 0.45, 0.55, U.z + Math.cos(UY) * 0.45), src = V3(U.x + Math.sin(UY) * 1.45, 0.4, U.z + Math.cos(UY) * 1.45);
          for (let i = 0; i < 60; i++) { const dir = eye.clone().sub(src).normalize().add(V3((Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.4, (Math.random() - 0.5) * 0.5)).normalize();
            addBlock(src.clone().add(V3((Math.random() - 0.5) * 0.5, Math.random() * 0.25, (Math.random() - 0.5) * 0.5)), { size: 0.08 + Math.random() * 0.1, v: dir.multiplyScalar(3 + Math.random() * 2.5), col: Math.random() < 0.4 ? 0xffb050 : Math.random() < 0.6 ? 0xd8501c : 0x9a948c, bright: 1.3, life: 0.8, shrink: 0.15, drag: 0.5, grav: 1.5 }); }
          cue('fire', 0.8); cue('impact', 0.6);
        }],
        [1.08, () => { pov.fill(0xffffff, 1, true); memory(false); pov.fill(0xffffff, 1, true); cue('impact', 0.9); }]],
      tick: (t, dt) => { fade(dt); if (kicker) kicker.update(dt); } },
    // 5 back on her: the hair white now; hold, then the dark comes down
    { ...C(2.6, 2.4, 2.2, 4, t => { if (t > 1.9) pov.fill(0x000000, 1); }), at: [[0, () => { memory(false); setHair(4); if (kicker) kicker.root.visible = false; pulse(0.9); }]] },
    // 6 black, the sound of the snow as rings; her father's words in the middle
    { dur: 3.4, ease: 'linear', from: { pos: [0, 30, 30] as V, look: [0, 0, 0] as V, fov: 30 }, caption: { text: PRO_COLD, big: true, at: 0.4, hold: 2.6 },
      at: [[0, () => { pov.fill(0x000000, 1, true); GRADE.flash = 0; for (const a of people) a.root.visible = false; for (const f of fires) f.on = false; }]],
      tick: (t, dt) => { rings(t, dt, true); } },
    // 7 the second card
    { dur: 2.8, ease: 'linear', from: { pos: [0, 30, 30] as V, look: [0, 0, 0] as V, fov: 30 }, caption: { text: COLD_CARD2, big: true, at: 0.3, hold: 2.2 },
      tick: (t, dt) => { rings(t, dt, false); } },
  ];
  // the dark: small faint rings for the falling snow; in the first card, a slow ring from the middle (a heartbeat)
  function rings(t: number, dt: number, heart: boolean) {
    if (Math.random() < dt * 12) pov.ring(Math.random(), 0.12 + Math.random() * 0.76, { r0: 2, r1: 10 + Math.random() * 10, life: 1.1, a: 0.3 });
    if (heart && Math.floor((t - dt) / 0.9) !== Math.floor(t / 0.9)) pov.ring(0.5, 0.62, { r0: 10, r1: 70, life: 1.4, col: 0xdfe8ff, a: 0.35 });
  }
  // a burst of flame off the eaves (flashback 1): many blocks at once
  function addBlockBurst(p: THREE.Vector3, n: number, spread: number) {
    for (let i = 0; i < n; i++) addBlock(p.clone().add(V3((Math.random() - 0.5) * spread, Math.random() * 0.3, (Math.random() - 0.5) * spread)), { size: 0.18 + Math.random() * 0.2, v: V3((Math.random() - 0.5) * 0.8, 1.6 + Math.random() * 1.8, (Math.random() - 0.5) * 0.8), col: Math.random() < 0.5 ? 0xffc04a : 0xff6a20, bright: 1.7, life: 0.7, shrink: 0.6, drag: 1, grav: 0 });
  }
  return {
    shots,
    dispose: () => {
      for (const a of people) a.dispose(); for (const off of lights) off(); for (const f of fires) { root.remove(f.l); } root.remove(faceLight);
      GRADE.flash = 0; GRADE.desat = 0; GRADE.exposure = G0.exposure; GRADE.vig = G0.vig; GRADE.gain.copy(G0.gain);
    },
  };
}

// ---------------------------------------------------------------- act-40: the cold open as black cards
// 用户：「现在开场太墨迹了，把那段timeline先搞成黑幕快速交代背景吧」— for now the night is told in five cards on black (the falling snow
// as faint rings, a slow ring like a heartbeat under the father's words); the 寒山坞 cutscene above stays for later
// (act-45 用户：「开局的黑幕文字太啰嗦了，本来是氛围文字，结果慌里慌气说一大堆」: three short cards with room between them — the night,
//  her father's words, the years — nothing explained; who, where and why are the snowy village's and the temple's to tell)
export const COLD_CARD_LINES = COLD_CARDS.slice(0, -2);
export function coldCardShots(pov: BlindPOV): CineShot[] {
  const cards = COLD_CARDS, last = cards.length - 1;
  return cards.map((text, i): CineShot => ({
    dur: i === last ? 3.2 : i === last - 1 ? 4.6 : 3.6, ease: 'linear', from: { pos: [0, 30, 30] as V, look: [0, 0, 0] as V, fov: 30 },
    caption: { text, big: true, at: 0.6, hold: i === last ? 2.0 : i === last - 1 ? 3.2 : 2.4 },
    at: [[0, () => { if (i === 0) pov.fill(0x000000, 1, true); }]],
    tick: (t, dt) => {
      if (Math.random() < dt * 10) pov.ring(Math.random(), 0.12 + Math.random() * 0.76, { r0: 2, r1: 10 + Math.random() * 10, life: 1.1, a: 0.28 });
      if (i === last - 1 && Math.floor((t - dt) / 0.9) !== Math.floor(t / 0.9)) pov.ring(0.5, 0.62, { r0: 10, r1: 70, life: 1.4, col: 0xdfe8ff, a: 0.35 });
    },
  }));
}

