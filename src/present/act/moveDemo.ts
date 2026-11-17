// 刀谱演示（11-18，用户：「选了强化后根本看不到自己选的强化是啥，在哪儿、如何释放，如何释放的教学不能是纯文字哈」）：
// 拿到一本新刀谱，卡片落到它那颗钮上以后，主角身边出现一个半透明的她（幻影）和一个淡红的虚影敌人，幻影把这一招做一遍（约 2～3 秒）；
// 同时右下角的真按钮跟着按法一颗颗按下去：按下那颗下沉、亮一下；到了能接这一招的那一刻，那颗钮像战斗里一样换成这一招的颜色和图标
// （翻面）——玩家看一遍、照着按。点一下 / 任意键跳过。演示时真的她不接输入、站着不动（拿刀谱都在清场之后，场上没有活着的敌人）。
// 幻影就是一个真的 Hero（同一套状态机、同一套动作和特效），只把它的输入换成脚本、它的世界换成只有那个虚影敌人的小世界，
// 所以招式和游戏里一模一样；新加的刀谱只要 manuals.ts 填了 how / air，就按通用脚本自动演示（skillInfo manualHow）。
import * as THREE from 'three';
import { V3 } from '../engine/world';
import { BattleActor } from '../bestiary/battle';
import { fxSparks } from '../fx/fx';
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
import { manualOf, manualHow, MANUAL_HINT, KEY_BTN, isPress } from './skillInfo';

type Stick = 'toFoe' | 'away' | 'side' | null;
interface Press { btn: BtnName; hold?: number; when?: (g: Hero, d: MoveDemo) => boolean; after?: number; stick?: Stick }
interface Script { dist: number; steps: Press[]; tail: number }
const TAP = 0.08;
/** the eight 刀谱 (each step fires when the ghost can take it — the same getters the HUD's link hints read) */
const SCRIPTS: Record<string, Script> = {
  chase: { dist: 4.2, tail: 0.9, steps: [{ btn: 'special', after: 0.35 }, { btn: 'attack', when: (_g, d) => d.stuck, after: 0.35 }] },
  backDart: { dist: 3.2, tail: 0.9, steps: [{ btn: 'dash', stick: 'away', after: 0.35 }, { btn: 'special', when: g => g.canBackDart, after: 0.06 }] },
  dbl: { dist: 3.2, tail: 1.0, steps: [{ btn: 'jump', after: 0.35 }, { btn: 'jump', when: g => g.canDoubleJump && g.vy < 2.2, after: 0.2 }] },
  launch: { dist: 2.3, tail: 1.2, steps: [{ btn: 'attack', after: 0.35 }, { btn: 'jump', when: g => g.canLaunch, after: 0.14 }] },
  cutDart: { dist: 2.3, tail: 0.9, steps: [{ btn: 'attack', after: 0.35 }, { btn: 'special', when: g => g.canCutDart, after: 0.14 }] },
  keep: { dist: 2.3, tail: 1.0, steps: [{ btn: 'attack', after: 0.35 }, { btn: 'dash', stick: 'side', when: g => g.st === 'k1' && g.t / g.dur > 0.4 }, { btn: 'attack', when: g => g.canKeep && g.st === 'free', after: 0.04 }] },
  pause: { dist: 2.3, tail: 1.4, steps: [{ btn: 'attack', after: 0.35 }, { btn: 'attack', when: g => g.st === 'k1' && g.t / g.dur > 0.35 }, { btn: 'attack', when: g => g.canPause && g.t > 0.3 }] },
  kick: { dist: 3.8, tail: 1.0, steps: [{ btn: 'dash', stick: 'toFoe', after: 0.35 }, { btn: 'jump', when: g => g.canKick, after: 0.08 }] },
};
/** any other manual: its presses one after another (a held 斩 held through the stance; a pause = a beat more; air = a jump first) */
function genericScript(id: string): Script | null {
  const m = manualOf(id); if (!m) return null;
  const s = manualHow(m), steps: Press[] = []; let extra = 0;
  if (s.air && s.how[0] !== 'jump') steps.push({ btn: 'jump', after: 0.35 });
  for (const st of s.how) {
    if (st === 'wait') { extra += 0.45; continue; }
    if (!isPress(st)) continue;
    steps.push({ btn: KEY_BTN[st], hold: st === 'hold' ? TUNE.holdToCharge + TUNE.chargeFull + 0.15 : TAP, after: (steps.length ? 0.3 : 0.35) + extra, stick: st === 'dash' ? 'toFoe' : null }); extra = 0;
  }
  return { dist: 2.4, tail: 1.1, steps };
}
const ghostMat = (col: number) => new THREE.MeshBasicMaterial({ vertexColors: true, color: col, transparent: true, opacity: 0 });
function ghostOf(root: THREE.Object3D, mat: THREE.Material) { root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = mat; m.castShadow = false; m.receiveShadow = false; } }); }
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const newBtn = (): Btn => ({ down: false, pressed: false, released: false, held: 0, last: 0 });

export class MoveDemo {
  on = false; stuck = false;
  private g: Hero | null = null; private foe: BattleActor | null = null; private F: Foe | null = null; private gm = ghostMat(0xd6e6ff); private fm = ghostMat(0xff9a88);
  private inp = { b: { attack: newBtn(), dash: newBtn(), special: newBtn(), jump: newBtn() } as Record<BtnName, Btn> };
  private hold: Record<BtnName, number> = { attack: 0, dash: 0, special: 0, jump: 0 };
  private script: Script | null = null; private si = 0; private t = 0; private lastT = 0; private stick: { v: THREE.Vector3; t: number } = { v: V3(), t: 0 };
  private darts: Dart[] = []; private fvy = 0; private fvel = V3(); private hint: HintKey | null = null; private skipped = false; private fade = 0; private ending = -1;
  private done: (() => void) | null = null; private hud: ActHud | null = null; private dir = V3(1, 0, 0);
  /** play a manual's move beside the hero; resolves when it has played out or been skipped */
  play(id: string, o: { at: THREE.Vector3; def: ModelDef; hud: ActHud }): Promise<void> {
    this.stop();
    const sc = SCRIPTS[id] ?? genericScript(id); if (!sc) return Promise.resolve();
    this.script = sc; this.si = 0; this.t = 0; this.lastT = 0; this.stuck = false; this.fvy = 0; this.fvel.set(0, 0, 0); this.skipped = false; this.fade = 0; this.ending = -1; this.hud = o.hud;
    this.hint = (MANUAL_HINT[id] ?? null) as HintKey | null;
    // the stage: a line across the screen centred on her, just in front of her (toward the camera — the camera follows her, so the
    // whole move stays in frame; beside her it ran off the screen's edge, up-screen it went behind the hideout's wall); behind her when
    // she stands at the room's front edge
    const mid = (PLAY.x0 + PLAY.x1) / 2, L = sc.dist;
    let z = o.at.z + 2.3; if (z > PLAY.z1 - 1.2) z = o.at.z - 2.3; z = Math.max(PLAY.z0 + 1.2, Math.min(PLAY.z1 - 1.2, z));
    const s = o.at.x > mid ? -1 : 1, dir = this.dir.set(s, 0, 0);
    let cx = o.at.x; cx = Math.max(PLAY.x0 + L / 2 + 1, Math.min(PLAY.x1 - L / 2 - 1, cx));
    const gAt = V3(cx - s * L / 2, 0, z), fAt = V3(cx + s * L / 2, 0, z);
    const g = this.g = new Hero(gAt, o.def); g.moves = { [id]: true }; g.a.yaw = Math.atan2(dir.x, dir.z); ghostOf(g.a.root, this.gm);
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
      const p = sc.steps[this.si];
      if (this.t - this.lastT >= (p.after ?? 0.12) && (!p.when || p.when(g, this))) {
        this.hold[p.btn] = p.hold ?? TAP; this.lastT = this.t; this.si++;
        if (p.stick) { const toF = foe.home.clone().sub(g.pos).setY(0).normalize(); this.stick.v.copy(p.stick === 'toFoe' ? toF : p.stick === 'away' ? toF.multiplyScalar(-1) : V3(-toF.z, 0, toF.x)); this.stick.t = 0.12; }
        const b = this.hud?.btns[p.btn]; if (b instanceof IronBtn) b.kick(0.8, this.hint && this.si === sc.steps.length ? 0xfff2d0 : 0xffe8c0);
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
    // darts: fly, the first that reaches the foe sticks in it (寻声 follows it)
    for (const d of this.darts) {
      if (d.dead) continue;
      if (d.stuck) { d.ride(dt); continue; }
      const p0 = d.step(dt), ab = d.p.clone().sub(p0).setY(0), L2 = Math.max(1e-6, ab.lengthSq()), t = Math.max(0, Math.min(1, foe.home.clone().sub(p0).setY(0).dot(ab) / L2)), q = p0.clone().addScaledVector(ab, t);
      if (Math.hypot(foe.home.x - q.x, foe.home.z - q.z) < 0.64 && d.p.y < 2.4) { foe.hurt(0.4); cue('dartHit', 0.6); d.stickIn(this.F!, 3); this.stuck = true; }
      else if (d.life <= 0) d.stop(false);
    }
    // the button the move goes on takes the move's colour and picture the moment it can be taken (as in a fight)
    if (this.hud) {
      const open: Record<BtnName, HintKey | null> = { attack: null, dash: null, special: null, jump: null }, k = this.hint;
      if (k === 'chase' && this.stuck) open.attack = 'chase';
      else if (k === 'keep' && g.canKeep) open.attack = 'keep';
      else if (k === 'pause' && g.canPause) open.attack = 'pause';
      else if (k === 'back' && g.canBackDart) open.special = 'back';
      else if (k === 'cdart' && g.canCutDart) open.special = 'cdart';
      else if (k === 'launch' && g.canLaunch) open.jump = 'launch';
      else if (k === 'kick' && g.canKick) open.jump = 'kick';
      else if (k === 'dbl' && g.canDoubleJump) open.jump = 'dbl';
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
