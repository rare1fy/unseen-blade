// 刀谱演示（11-18，用户：「选了强化后根本看不到自己选的强化是啥，在哪儿、如何释放，如何释放的教学不能是纯文字哈」）：
// 拿到一本新刀谱，卡片落到它那颗钮上以后，主角身边出现一个半透明的她（幻影）和一个淡红的虚影敌人，幻影把这一招做一遍（约 2～3 秒）；
// 同时右下角的真按钮跟着按法一颗颗按下去：按下那颗下沉、亮一下；到了能接这一招的那一刻，那颗钮像战斗里一样换成这一招的颜色和图标
// （翻面）——玩家看一遍、照着按。点一下 / 任意键跳过。演示时真的她不接输入、站着不动（拿刀谱都在清场之后，场上没有活着的敌人）。
// 幻影就是一个真的 Hero（同一套状态机、同一套动作和特效），只把它的输入换成脚本、它的世界换成只有那个虚影敌人的小世界，
// 幻影用 Hero 的招式和与卡面共用的按法。这里仅摆虚影和安排按下的时机。
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { BattleActor } from '../bestiary/battle';
import { fxRing, fxSparks, trailSeg } from '../fx/fx';
import { smokeBurst } from '../kyoto/ninja_fx';
import { cue } from '../../audio/cues';
import { PLAY } from '../scenes/props';
import { Hero, type HeroWorld } from './hero';
import { Dart } from './missiles';
import { TUNE } from './tune';
import { IronBtn, type HintKey } from './ironUi';
import type { ActHud } from './hud';
import type { Btn, BtnName, Input } from './input';
import type { Foe } from './enemy';
import type { ModelDef } from '../bestiary/models';
import { manualOf, manualSteps, MANUAL_HINT, KEY_BTN, isPress } from './skillInfo';
import type { MoveId } from './manuals';

type Stick = 'toFoe' | 'away' | 'side' | null;
interface Timing { when?: (g: Hero, d: MoveDemo) => boolean; after?: number; stick?: Stick }
interface Script { dist: number; steps: Timing[]; tail: number }
const TAP = 0.08;
const SCRIPTS: Record<MoveId, Script> = {
  chase: { dist: 4.2, tail: 0.9, steps: [{}, { when: (_g, d) => d.stuck }] },
  backDart: { dist: 3.2, tail: 0.9, steps: [{ stick: 'away' }, { when: g => g.canBackDart, after: 0.06 }] },
  dbl: { dist: 3.2, tail: 1.0, steps: [{}, { when: g => g.canDoubleJump, after: 0.2 }] },
  launch: { dist: 2.3, tail: 1.2, steps: [{}, { when: g => g.canLaunch }] },
  cutDart: { dist: 2.3, tail: 0.9, steps: [{}, { when: g => g.canCutDart }] },
  keep: { dist: 2.3, tail: 1.0, steps: [{}, { stick: 'side', when: g => g.st === 'k1' && g.t / g.dur > 0.4 }, { when: g => g.canKeep && g.st === 'free' }] },
  pause: { dist: 2.3, tail: 1.4, steps: [{}, { when: g => g.st === 'k1' && g.t / g.dur > 0.35 }, { when: g => g.canPause && g.t > 0.3 }] },
  kick: { dist: 3.8, tail: 1.0, steps: [{ stick: 'toFoe' }, { when: g => g.canKick, after: 0.08 }] },
  acut: { dist: 2.3, tail: 1.25, steps: [{}, { when: g => g.canLaunch }, { when: g => g.canAirCut }] },
  swoop: { dist: 3.4, tail: 1.0, steps: [{}, { when: g => g.canSwoop, stick: 'toFoe' }] },
  reel: { dist: 4.1, tail: 1.05, steps: [{}, { when: g => g.canReel }] },
  stomp: { dist: 1.08, tail: 1.2, steps: [{}, { when: g => g.canStomp }] },
};
const ghostMat = (col: number) => new THREE.MeshBasicMaterial({ vertexColors: true, color: col, transparent: true, opacity: 0 });
function ghostOf(root: THREE.Object3D, mat: THREE.Material) { root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = mat; m.castShadow = false; m.receiveShadow = false; } }); }
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const newBtn = (): Btn => ({ down: false, pressed: false, released: false, held: 0, last: 0 });

export class MoveDemo {
  on = false; stuck = false;
  private g: Hero | null = null; private foe: BattleActor | null = null; private F: Foe | null = null; private gm = ghostMat(0xd6e6ff); private fm = ghostMat(0xff9a88);
  private inp = { b: { attack: newBtn(), dash: newBtn(), special: newBtn(), jump: newBtn(), ult: newBtn() } as Record<BtnName, Btn> };
  private hold: Record<BtnName, number> = { attack: 0, dash: 0, special: 0, jump: 0, ult: 0 };
  private script: Script | null = null; private keys: ReturnType<typeof manualSteps> = []; private readyAt = 0; private si = 0; private t = 0; private lastT = 0; private stick: { v: THREE.Vector3; t: number } = { v: V3(), t: 0 };
  private darts: Dart[] = []; private fvy = 0; private fvel = V3(); private prone = 0; private hint: HintKey | null = null; private skipped = false; private fade = 0; private ending = -1;
  private done: (() => void) | null = null; private hud: ActHud | null = null; private dir = V3(1, 0, 0);
  /** play a manual's move beside the hero; resolves when it has played out or been skipped */
  play(id: string, o: { at: THREE.Vector3; def: ModelDef; hud: ActHud }): Promise<void> {
    this.stop();
    const m = manualOf(id);
    if (!m) return Promise.resolve();
    const sc = SCRIPTS[m.id];
    this.keys = manualSteps(m).filter(isPress);
    this.readyAt = 0;
    this.prone = 0;
    this.script = sc; this.si = 0; this.t = 0; this.lastT = 0; this.stuck = false; this.fvy = 0; this.fvel.set(0, 0, 0); this.skipped = false; this.fade = 0; this.ending = -1; this.hud = o.hud;
    this.hint = MANUAL_HINT[m.id];
    // the stage: a line across the screen centred on her, just in front of her (toward the camera — the camera follows her, so the
    // whole move stays in frame; beside her it ran off the screen's edge, up-screen it went behind the hideout's wall); behind her when
    // she stands at the room's front edge
    const mid = (PLAY.x0 + PLAY.x1) / 2, L = sc.dist;
    let z = o.at.z + 2.3; if (z > PLAY.z1 - 1.2) z = o.at.z - 2.3; z = Math.max(PLAY.z0 + 1.2, Math.min(PLAY.z1 - 1.2, z));
    const s = o.at.x > mid ? -1 : 1, dir = this.dir.set(s, 0, 0);
    let cx = o.at.x; cx = Math.max(PLAY.x0 + L / 2 + 1, Math.min(PLAY.x1 - L / 2 - 1, cx));
    const gAt = V3(cx - s * L / 2, 0, z), fAt = V3(cx + s * L / 2, 0, z);
    const g = this.g = new Hero(gAt, o.def); g.moves = m.needs ? { [id]: true, [m.needs]: true } : { [id]: true }; g.a.yaw = Math.atan2(dir.x, dir.z); ghostOf(g.a.root, this.gm);
    const foe = this.foe = new BattleActor('hj_blade'); foe.place(fAt); foe.yaw = Math.atan2(-dir.x, -dir.z); ghostOf(foe.root, this.fm);
    this.F = { st: 'idle', pos: foe.home, d: { r: 0.44 }, a: foe, vel: V3(), kind: 'hj_blade' } as unknown as Foe;
    smokeBurst(gAt, 0.5, 6, { size: 0.24, life: 0.4 }); smokeBurst(fAt, 0.5, 6, { size: 0.24, life: 0.4 }); cue('whoosh', 0.4);
    for (const k of Object.keys(this.hold) as BtnName[]) { this.hold[k] = 0; Object.assign(this.inp.b[k], newBtn()); }
    this.on = true;
    return new Promise(res => { this.done = res; });
  }
  skip() { if (this.on) this.skipped = true; }
  /** the world the ghost fights in: just the shadow foe */
  private world(): HeroWorld {
    const F = this.F!, foe = this.foe!, me = this;
    const hit = (k: number) => { foe.hurt(k); fxSparks(foe.chest(), 0xffe8c8, 8, 3); cue('hitLight', 0.4); return 1; };
    const inArc = (from: THREE.Vector3, yaw: number, range: number, half: number) => {
      const d = F.pos.clone().sub(from).setY(0), l = d.length(); if (l > range + F.d.r) return false; if (half >= Math.PI) return true;
      return Math.abs(wrap(Math.atan2(d.x, d.z) - yaw)) <= half + Math.atan2(F.d.r, Math.max(0.05, l));
    };
    return {
      foes: [F],
      swing: o => (inArc(o.from, o.yaw, o.range, o.half) ? hit(o.heavy ? 1.3 : 0.9) : 0),
      sweep: o => { const ab = o.b.clone().sub(o.a).setY(0), L2 = Math.max(1e-6, ab.lengthSq()), t = Math.max(0, Math.min(1, F.pos.clone().sub(o.a).setY(0).dot(ab) / L2)), q = o.a.clone().addScaledVector(ab, t); return Math.hypot(F.pos.x - q.x, F.pos.z - q.z) < o.r + F.d.r ? hit(1.2) : 0; },
      slam: o => (Math.hypot(F.pos.x - o.at.x, F.pos.z - o.at.z) < o.r + F.d.r ? hit(1.2) : 0),
      launch: o => { if (!inArc(o.from, o.yaw, o.range, o.half)) return 0; me.fvy = 7.5; return hit(1.1); },
      kick: o => { const d = F.pos.clone().sub(o.from).setY(0); if (d.length() > 1.8 || d.dot(o.dir) < 0) return 0; me.fvel.copy(o.dir).setY(0).normalize().multiplyScalar(7); return hit(1.4); },
      dart: o => { me.darts.push(new Dart(o.from.clone(), o.dir.clone().multiplyScalar(TUNE.dartSpeed), 0, TUNE.dartRange)); },
      chaseTarget: () => (me.stuck ? F : null),
      chase: o => { smokeBurst(o.from, 0.5, 8, { size: 0.26, life: 0.5 }); smokeBurst(o.to, 0.5, 8, { size: 0.26, life: 0.5 }); for (const d of me.darts) if (d.stuck) d.stop(); me.stuck = false; cue('dash', 0.8); },
      airFoe: () => F.pos.y > 0.15 ? F : null,
      airHold: (_f, y) => { F.pos.y = Math.max(0.5, y - 0.1); me.fvy = 0; },
      airCut: o => { if (o.n === 3) me.fvy = -16; return hit(o.n === 3 ? 1.3 : 0.9); },
      airSlam: o => { F.pos.y = 0; me.fvy = 0; fxRing(o.at.clone().setY(0.06), 0xe1b5a9, 1.6); return hit(1.3); },
      swoop: o => {
        trailSeg(o.a.clone().setY(0.65), o.b.clone().setY(0.65), 0x9ad8a8, 0.12, { life: 0.28 });
        return hit(1.2);
      },
      reelTarget: (from, min) => me.stuck && from.distanceTo(F.pos) >= min ? { foe: F, heavy: false } : null,
      reel: o => {
        for (const d of me.darts) if (d.stuck === F) d.stop();
        me.stuck = false;
        const g = me.g!;
        trailSeg(g.a.chest(), foe.chest(), 0xd8283a, 0.055, { life: o.dur });
        // The ghost foe has no enemy AI; move it with the tug in the little demonstration world.
        me.fvel.copy(o.to).sub(F.pos).multiplyScalar(7);
        hit(0.8);
      },
      stompable: (from, y) => y >= 0.5 && Math.hypot(from.x - F.pos.x, from.z - F.pos.z) <= 1.4 ? F : null,
      stomp: o => { me.prone = 1.2; fxRing(o.foe.pos.clone().setY(0.06), 0xd8c8a8, 0.9); return hit(1.2); },
      guard: () => {}, incoming: () => null, iaiCatch: () => null,
      clamp: (p, r) => { p.x = Math.max(PLAY.x0 + r, Math.min(PLAY.x1 - r, p.x)); p.z = Math.max(PLAY.z0 + r, Math.min(PLAY.z1 - r, p.z)); },
      stickWorld: () => (me.stick.t > 0 ? me.stick.v.clone() : V3()),
      aimWorld: () => null,
    };
  }
  private w: HeroWorld | null = null;
  /** one frame (real seconds: the demo runs at its own pace whatever the world's time does) */
  update(dt: number) {
    if (!this.on || !this.g || !this.foe || !this.script) return;
    const g = this.g, foe = this.foe, sc = this.script, w = (this.w ??= this.world());
    this.t += dt;
    // the script: the next press fires when its moment comes (and its own condition holds)
    if (this.ending < 0 && this.si < sc.steps.length) {
      const p = sc.steps[this.si], key = this.keys[this.si];
      const ready = this.t - this.lastT >= (p.after ?? (this.si ? 0.12 : 0.35)) && (!p.when || p.when(g, this));
      this.readyAt = ready ? this.readyAt + dt : 0;
      // Give the final button time to turn before the ghost presses it.
      const last = this.si === sc.steps.length - 1;
      if (isPress(key) && ready && (!last || this.readyAt >= 0.14)) {
        const btn = KEY_BTN[key]; this.hold[btn] = TAP; this.lastT = this.t; this.si++; this.readyAt = 0;
        if (p.stick) { const toF = foe.home.clone().sub(g.pos).setY(0).normalize(); this.stick.v.copy(p.stick === 'toFoe' ? toF : p.stick === 'away' ? toF.multiplyScalar(-1) : V3(-toF.z, 0, toF.x)); this.stick.t = 0.12; }
        const b = this.hud?.btns[btn]; if (b instanceof IronBtn) b.kick(0.8, last ? 0xfff2d0 : 0xffe8c0);
      }
    } else if (this.ending < 0 && this.t - this.lastT > sc.tail) this.ending = 0;
    if (this.t > 5.5 && this.ending < 0) this.ending = 0;   // (never hangs: a step whose moment did not come)
    if (this.skipped && this.ending < 0) this.ending = 0.35;
    this.stick.t -= dt;
    // the ghost's buttons, as Input.frame would make them
    for (const n of Object.keys(this.hold) as BtnName[]) {
      const b = this.inp.b[n], d = this.hold[n] > 0; this.hold[n] = Math.max(0, this.hold[n] - dt);
      const was = b.held; b.pressed = d && !b.down; b.released = !d && b.down; b.down = d; b.held = d ? b.held + dt : 0; if (b.released) b.last = was;
      // the real button on the HUD sinks while the ghost holds it
      const hb = this.hud?.btns[n]; if (hb) hb.down = d;
    }
    g.update(dt, this.inp as unknown as Input, w); g.a.update(dt); foe.update(dt);
    // the shadow foe: thrown up (挑云), kicked away (穿心腿), back down
    if (this.fvy !== 0 || foe.home.y > 0) { foe.home.y += this.fvy * dt; this.fvy -= 20 * dt; if (foe.home.y <= 0) { foe.home.y = 0; this.fvy = 0; } }
    if (this.fvel.lengthSq() > 1e-3) { foe.home.addScaledVector(this.fvel, dt); this.fvel.multiplyScalar(Math.exp(-5 * dt)); }
    foe.place(foe.home);
    if (this.prone > 0) {
      const down = Math.min(1, (1.2 - this.prone) / 0.1, this.prone / 0.25);
      foe.body.rotation.x = Math.PI / 2 * down;
      foe.body.position.y = 0.24 * down;
      this.prone = Math.max(0, this.prone - dt);
      if (!this.prone) { foe.body.rotation.x = 0; foe.body.position.y = 0; }
    }
    // darts: fly, the first that reaches the foe sticks in it (寻声 follows it)
    for (const d of this.darts) {
      if (d.dead) continue;
      if (d.stuck) { d.ride(dt); continue; }
      const p0 = d.step(dt), ab = d.p.clone().sub(p0).setY(0), L2 = Math.max(1e-6, ab.lengthSq()), t = Math.max(0, Math.min(1, foe.home.clone().sub(p0).setY(0).dot(ab) / L2)), q = p0.clone().addScaledVector(ab, t);
      if (Math.hypot(foe.home.x - q.x, foe.home.z - q.z) < 0.64 && d.p.y < 2.4) { foe.hurt(0.4); cue('dartHit', 0.6); d.stickIn(this.F!, 3); this.stuck = true; }
      else if (d.life <= 0) d.stop(false);
    }
    // The last press has the same ready condition, palette and model as the corresponding HUD link.
    if (this.hud) {
      const last = sc.steps.length - 1, key = this.keys[last], timing = sc.steps[last];
      const open = this.si === last && isPress(key) && timing.when?.(g, this) ? { [KEY_BTN[key]]: this.hint } : {};
      this.hud.setHints(open);
    }
    // fade in; at the end both go up in smoke
    this.fade = Math.min(1, this.fade + dt / 0.25);
    if (this.ending >= 0) { this.ending += dt; if (this.ending >= 0.35) { this.stop(true); return; } }
    const a = this.ending >= 0 ? Math.max(0, 1 - this.ending / 0.35) : this.fade;
    this.gm.opacity = 0.62 * a; this.fm.opacity = 0.45 * a;
  }
  /** end now (smoke where they stood); the HUD back to the real hero's */
  stop(puff = false) {
    if (this.g) { if (puff) smokeBurst(this.g.pos.clone(), 0.6, 8, { size: 0.26, life: 0.5 }); this.g.a.dispose(); this.g = null; }
    if (this.foe) { if (puff) smokeBurst(this.foe.home.clone(), 0.6, 8, { size: 0.26, life: 0.5 }); this.foe.dispose(); this.foe = null; }
    for (const d of this.darts) d.kill(); this.darts = []; this.w = null; this.F = null;
    if (this.hud) { for (const b of Object.values(this.hud.btns)) b.down = false; this.hud.setHints({}); }
    this.gm.opacity = 0; this.fm.opacity = 0;
    const wasOn = this.on; this.on = false; this.script = null;
    if (wasOn) { const d = this.done; this.done = null; d?.(); }
  }
}
