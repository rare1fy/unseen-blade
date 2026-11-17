// act-37 冷开场「那一夜」（用户：「现在有故事了，开场怎么做知道了吗」；故事 docs/对白/故事板与小说.md 幕一 / 楔子）：
// 熹平六年腊月廿三，汝南寒山坞。远景里四支火把从山口下来、进坞门、穿过村子到铸坊；风箱底下十一岁的阿皎往外看；褚雷发现她、
// 把她拖出来、一把生石灰按向她的眼睛——画面一下全白。然后是她的「眼睛」：全黑，只有声音变成的声纹圈——落雪是细小的圈，远去的
// 脚步和车轮一圈圈退走，父亲最后的几句话打在黑底上。最后黑底退开，高处俯拍：铁砧旁，女孩抱着父亲，雪一层层盖上去，头发白了。
// 字幕：「阿爹说，雪把血盖住，人就看不见我了。」 演出不演对话（台词是字幕），不拍血腥（只有声音和远处的火把）。
import * as THREE from 'three';
import type { UiLayer } from '../ui3d/layer';
import { onUpdate } from '../engine/world';
import { cue } from '../../audio/cues';
import { ROSTER } from '../bestiary/models';
import { BattleActor } from '../bestiary/battle';
import { HS_FORGE, hsRoadY } from '../asm/hanshan/hs_forge';
import { childPose, childSnap, killerPose, killerSnap, torchLight, CHILD_WHITE } from './hanshan_people';
import { GRADE } from '../look/post';
import type { CineShot, V } from './timeline';
import { PRO_COLD } from './scripts';

// ---------------------------------------------------------------- her blind eyes: black, and every sound a ring
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
    const m = this.pool.pop() ?? new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
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
      L.at(r.x * L.w, r.y * L.h, 0, r.m.position); r.m.scale.setScalar(L.px(r.r0 + (r.r1 - r.r0) * (1 - (1 - k) ** 2)));
      (r.m.material as THREE.MeshBasicMaterial).opacity = r.a * (1 - k) * Math.min(1, r.t * 8);
    }
  }
  dispose() { this.alive = false; for (const r of this.rings) this.L.scene.remove(r.m); this.rings = []; this.L.scene.remove(this.veil); }
}

// ---------------------------------------------------------------- the people of that night
/** the locale's anchors are [x, y, z] */
const T = (p: readonly number[]) => ({ x: p[0], y: p[1], z: p[2] });
const spawn = (id: string, root: THREE.Object3D, x: number, z: number, yaw: number) => {
  const def = ROSTER.find(d => d.id === id); if (!def) throw new Error('no model ' + id);
  const a = new BattleActor(def); a.home.set(x, 0, z); a.yaw = yaw; a.root.position.set(x, 0, z); a.root.rotation.y = yaw; root.add(a.root); return a;
};
/** a point on the road from the pass down to the forge, s metres along it (y on the road surface) */
function along(s: number) {
  const P = HS_FORGE.road.path.map(T); let left = Math.max(0, s);
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], d = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= d) { const k = left / d, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k; return { x, z, y: hsRoadY(z), yaw: Math.atan2(b.x - a.x, b.z - a.z) }; }
    left -= d;
  }
  const e = P[P.length - 1]; return { x: e.x, z: e.z, y: hsRoadY(e.z), yaw: 0 };
}

export interface ColdHost { root: THREE.Object3D; pov: BlindPOV }
/** the shots; done() is called by the last one's end (the caller then goes to 「七年后」) */
export function coldOpenShots(h: ColdHost): { shots: CineShot[]; dispose: () => void } {
  const FF = HS_FORGE.forge, F = { front: T(FF.front), bellows: T(FF.bellows), anvil: T(FF.anvil) }, U = T(HS_FORGE.underBellows), UY = HS_FORGE.underYaw, root = h.root, pov = h.pov, people: BattleActor[] = [], lights: Array<() => void> = [];
  const band: BattleActor[] = [], gap = 1.6;
  let girl: BattleActor | null = null, chu: BattleActor | null = null, s0 = 0, snow: THREE.Mesh[] = [];
  const walkBand = (s: number, dt: number) => band.forEach((a, i) => { const p = along(s - i * gap); a.home.set(p.x, p.y, p.z); a.yaw = p.yaw; a.root.position.copy(a.home); a.root.rotation.y = p.yaw; killerPose(a).walk = 1.8; a.update(dt); });
  const tick = (dt: number) => { for (const a of people) if (!band.includes(a)) a.update(dt); };
  const shots: CineShot[] = [
    // 1 the valley at night, snowing; four torches come over the top of the slope
    { dur: 7, ease: 'inOut', caption: { text: '熹平六年 · 腊月廿三', big: true, at: 0.6, hold: 3.6 },
      from: { pos: [1.5, 13, 18], look: [0, 1.5, -20], fov: 36 }, to: { pos: [1.0, 11.5, 15.5], look: [0, 1.4, -19], fov: 36 },
      at: [[0, () => {
        for (let i = 0; i < 4; i++) { const a = spawn(i === 0 ? 'killer_big' : 'killer_cloak', root, 0, -29, 0); band.push(a); people.push(a); killerSnap(a); lights.push(torchLight(a, 2.4, 7)); }
        chu = band[0]; s0 = 12;
      }]],
      tick: (t, dt) => { walkBand(s0 + t * 1.8, dt); tick(dt); } },
    // 2 at the gate, low: they come down the last of the slope and through
    { dur: 5.5, ease: 'linear', from: { pos: [3.2, 1.8, -7.5], look: [0, 1.8, -15], fov: 38 }, to: { pos: [2.8, 1.9, -7.8], look: [0, 1.6, -13], fov: 38 },
      at: [[0, () => { s0 = 30; }], [1.2, () => cue('land', 0.25)], [2.6, () => cue('land', 0.25)]],
      tick: (t, dt) => { walkBand(s0 + t * 1.8, dt); tick(dt); } },
    // 3 the street to the forge: the torches pass between the houses (the screams are only heard)
    { dur: 5, ease: 'inOut', from: { pos: [9, 4.5, 12], look: [-1, 1, -3], fov: 34 }, to: { pos: [7.5, 4.0, 10], look: [-1, 1, -3], fov: 34 },
      at: [[0, () => { s0 = 41; }]], tick: (t, dt) => { walkBand(s0 + t * 1.6, dt); tick(dt); } },
    // 4 the forge: the fire, the bellows; under it a small face looks out; the big one stops, turns
    { dur: 6.5, ease: 'inOut', from: { pos: [F.front.x + 4.6, 2.2, F.front.z + 4.5], look: [F.bellows.x, 0.6, F.bellows.z], fov: 34 }, to: { pos: [F.front.x + 3.8, 2.0, F.front.z + 3.8], look: [F.bellows.x, 0.5, F.bellows.z], fov: 32 },
      at: [[0, () => {
        const u = U; girl = spawn('child_wenjiao', root, u.x, u.z, HS_FORGE.underYaw); people.push(girl); Object.assign(childPose(girl), { crouch: 1, tremble: 1 }); childSnap(girl);
        // the others pass on into the village; he stays at the forge
        band.slice(1).forEach(a => { a.root.visible = false; });
        if (chu) { chu.home.set(F.front.x + 1.6, 0, F.front.z + 0.6); chu.yaw = Math.atan2(F.anvil.x - chu.home.x, F.anvil.z - chu.home.z); chu.root.position.copy(chu.home); chu.root.rotation.y = chu.yaw; killerPose(chu).walk = 0; }
      }], [2.0, () => { if (girl) childPose(girl).look = 0.6; }], [3.8, () => { if (chu) { killerPose(chu).look = 1; chu.yaw = Math.atan2(U.x - chu.home.x, U.z - chu.home.z); } }]],
      tick: (_t, dt) => { if (chu) { chu.root.rotation.y += (chu.yaw - chu.root.rotation.y) * Math.min(1, dt * 3); chu.update(dt); } tick(dt); } },
    // 5 close at the bellows: his hand; she is dragged out; the lime — white
    // (the camera out along the way the gap under the bellows faces — the forge's posts stand either side of it)
    { dur: 3.6, ease: 'linear', from: { pos: [U.x + Math.sin(UY) * 3.8 + Math.cos(UY) * 1.0, 1.7, U.z + Math.cos(UY) * 3.8 - Math.sin(UY) * 1.0], look: [U.x, 0.6, U.z], fov: 34 },
      at: [[0, () => { if (chu) { const u = U; chu.home.set(u.x + 0.9, 0, u.z + 0.6); chu.root.position.copy(chu.home); chu.yaw = Math.atan2(u.x - chu.home.x, u.z - chu.home.z); chu.root.rotation.y = chu.yaw; killerPose(chu).reach = 1; killerPose(chu).down = 1; } }],
        [1.2, () => { if (girl) { const c = childPose(girl); c.look = 0; c.crouch = 0.4; c.dragged = 1; } cue('whoosh', 0.5); }],
        [2.7, () => { pov.fill(0xffffff, 1, true); GRADE.flash = 0.6; cue('impact', 0.8); }]],
      tick: (t, dt) => { if (girl && t > 1.2) { const u = U; girl.home.set(u.x + Math.min(1, (t - 1.2) * 0.8) * 0.7, 0, u.z + Math.min(1, (t - 1.2) * 0.8) * 0.5); girl.root.position.copy(girl.home); } if (chu) chu.update(dt); tick(dt); } },
    // 6–8 her eyes: white turns to black; only sounds — the snow, the boots going, the cart, her father's last words
    ...([PRO_COLD_LINES[0], PRO_COLD_LINES[1], PRO_COLD_LINES[2]] as string[]).map((line, i): CineShot => ({
      dur: i === 2 ? 5.5 : 4.5, ease: 'linear', from: { pos: [0, 30, 30] as V, look: [0, 0, 0] as V, fov: 30 }, caption: { text: line, at: 0.6, hold: i === 2 ? 3.8 : 3.0 },
      at: [[0, () => { if (i === 0) { pov.fill(0x000000, 1); GRADE.flash = 0; for (const a of people) a.root.visible = false; } }]],
      tick: (t, dt) => {
        // the snow: small faint rings everywhere; the boots and the cart: bigger warm / grey rings walking away up the screen
        if (Math.random() < dt * 14) pov.ring(Math.random(), 0.12 + Math.random() * 0.76, { r0: 2, r1: 10 + Math.random() * 10, life: 1.1, a: 0.32 });
        if (i < 2 && Math.floor((t - dt) / 0.55) !== Math.floor(t / 0.55)) { const k = (i * 4.5 + t) / 9; pov.ring(0.5 + Math.sin(t * 3) * 0.04, 0.55 - k * 0.4, { r0: 6, r1: 34 - k * 20, life: 1.0, col: 0xffb070, a: 0.55 - k * 0.3 }); }
        if (i === 1 && Math.floor((t - dt) / 0.9) !== Math.floor(t / 0.9)) pov.ring(0.62 - t * 0.02, 0.35 - t * 0.03, { r0: 8, r1: 30, life: 1.3, col: 0xb0b8c8, a: 0.4 });
        // her heart, close and low
        if (Math.floor((t - dt) / 0.8) !== Math.floor(t / 0.8)) pov.ring(0.5, 0.86, { r0: 10, r1: 26, life: 0.7, col: 0xff6a5a, a: 0.35 });
        // his voice: a warm ring near her when he speaks
        if (t > 0.6 && t < 2.6 && Math.random() < dt * 3) pov.ring(0.46 + Math.random() * 0.08, 0.66, { r0: 12, r1: 60, life: 1.6, col: 0xffe6c0, a: 0.4 });
        tick(dt);
      },
    })),
    // 9 the black opens on a high wide shot: before the forge (out on the snow — the anvil is under its roof) the girl curled against her father, the snow drifting over them, her hair white
    { dur: 9, ease: 'inOut', caption: { text: PRO_COLD, big: true, at: 2.4, hold: 4.6 },
      from: { pos: [F.front.x + 4.6, 8, F.front.z + 6.0], look: [F.front.x + 1.0, 0.2, F.front.z + 2.5], fov: 30 }, to: { pos: [F.front.x + 4.0, 11, F.front.z + 7.2], look: [F.front.x + 1.0, 0.2, F.front.z + 2.5], fov: 33 },
      at: [[0, () => {
        pov.fill(0x000000, 0);
        // her father by the anvil (a man of the forge, lying still) and her against him — her hair already white (under the snow it turned)
        // her father already under the snow (「雪把血盖住，人就看不见了」): a long mound in a man's shape, one dark sleeve out of it
        const fx = F.front.x + 0.8, fz = F.front.z + 2.5, sm = new THREE.MeshLambertMaterial({ color: 0xdfe4ee }), sl = new THREE.MeshLambertMaterial({ color: 0x3a3430 });
        for (const [w, hh, d, x, z] of [[0.62, 0.3, 1.1, 0, 0], [0.44, 0.26, 0.4, 0, -0.72], [0.5, 0.18, 0.6, 0.05, 0.75], [0.3, 0.12, 0.3, -0.38, 0.1]] as Array<[number, number, number, number, number]>) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), sm); m.position.set(fx + x, hh / 2, fz + z); m.castShadow = true; root.add(m); snow.push(m); }
        { const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.12), sl); m.position.set(fx + 0.45, 0.06, fz - 0.15); root.add(m); snow.push(m); }
        girl = spawn(CHILD_WHITE.id, root, fx + 0.7, fz + 0.2, -1.4); people.push(girl); Object.assign(childPose(girl), { crouch: 1, tremble: 0.4, look: -0.4 }); childSnap(girl);
        // the snow over them: low white drifts that build through the shot
        const mat = new THREE.MeshLambertMaterial({ color: 0xe8ecf4 });
        for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3 + (i % 3) * 0.1, 0.06, 0.26 + (i % 2) * 0.1), mat); m.position.set(fx - 0.55 + (i % 3) * 0.5 + (i % 2) * 0.1, 0.02, fz - 0.45 + Math.floor(i / 3) * 0.42); m.scale.y = 0.01; root.add(m); snow.push(m); }
      }]],
      tick: (t, dt) => { snow.forEach((m, i) => { if (i < 5) return; m.scale.y = Math.min(1.3, 0.01 + t * (0.12 + (i % 4) * 0.03)); m.position.y = 0.03 * m.scale.y; }); if (t > 7.6) pov.fill(0x000000, 1); tick(dt); } },
  ];
  return {
    shots,
    dispose: () => { for (const a of people) a.dispose(); for (const off of lights) off(); for (const m of snow) { m.parent?.remove(m); m.geometry.dispose(); } snow = []; GRADE.flash = 0; },
  };
}
/** her father's last words in the dark (楔子) — subtitles over her blindness */
export const PRO_COLD_LINES = ['阿皎……别出声……', '就是他……带的人……', '雪下大了……雪把血盖住，人就看不见你了……'];
