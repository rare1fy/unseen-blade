// Bestiary models on the battlefield: one actor class that speaks the show's actor interface (actors/cast.ts) — the hero's whirlwind,
// dice toss, block, blood price, cheer and fall; the lich's summon, shield, speech and collapse; the summons' lunge, shriek and death.
// Attack / cast / hurt / roar come from BActor; everything else is posed here.
import * as THREE from 'three';
import { BActor } from './bactor';
import { modelDef, type ModelDef } from './models';
import { CELL } from './kit';
import { Action, rot, mov, curve, snap, type Bone } from '../actors/rig';
import { V3, R } from '../engine/world';
import { PADD, TILE } from '../engine/particles';
import type { Cast } from '../actors/cast';
import { isGripHero } from './heroPose';
import { poseShow } from './showPose';
import { poseIai } from '../ronin/iaiPose';
import { POSE_AFTER, POSE_HOOKS } from './poseHooks';
import { FoeAccessories, FoeGait, ROBED, poseFoeFall, poseFoeHurt, poseFoeIdle } from '../act/foes/foe_motion';

const TIP: Record<string, [number, number]> = { warrior: [17, -3], boss_lich_forest: [29, 0], lego_warrior: [9, -3], lego_lich: [19, 0], fig_warrior: [19, -3], fig_lich: [29, 0] };

export class BattleActor extends BActor {
  aim = 0; breath = 1; robeFire = 0; walkK = 0; running = false; private runK = 0;
  moveSpeed?: number;
  private gait?: FoeGait;
  private accessories?: FoeAccessories;
  private deathAction?: Action;
  private projectileOrigin?: { point: THREE.Vector3; lift: number };
  get strideSwing() { return this.gait?.armSwing ?? 0; }
  get stridePhase() { return this.gait?.phase ?? 0; }
  get gaitSpeed() { return this.gait?.speed ?? 0; }
  /** a roster id ('rogue' follows ?rogue=m, models.ts modelDef) or a ready model */
  constructor(id: string | ModelDef) { super(typeof id === 'string' ? modelDef(id) : id); }
  /** Some attacks read weapon() as a gameplay anchor even when the rendered throw changes. */
  preserveProjectileOrigin(point: THREE.Vector3, lift: number) { this.projectileOrigin = { point, lift }; }
  weapon() {
    if (isGripHero(this.hid)) return super.weapon();
    if (this.projectileOrigin) {
      const { point, lift } = this.projectileOrigin;
      const origin = this.body.localToWorld(point.clone());
      origin.y += lift - this.off.y;
      return origin;
    }
    const t = TIP[this.def.id];
    if (t && this.bones.weapon) return this.bones.weapon.localToWorld(V3(0, t[1] * this.cy, t[0] * this.cx));
    return this.bones.handR ? this.bones.handR.localToWorld(V3(0, -2 * this.cy, this.cx)) : this.chest();
  }
  // hero
  spin(dist: number) { return this.play(new Action('spin', 1.05, 0.55, { dist })); }
  toss() { return this.play(new Action('toss', 0.5, 0.45)); }
  block() { return this.play(new Action('block', 0.6, 0.3)); }
  /** 闪避 (user 11-15: 「闪避要有匹配的动画和特效反馈」): a quick sidestep away from the blow, lean back, then step home */
  dodge() { return this.play(new Action('dodge', 0.55, 0.2)); }
  cheer() { return this.play(new Action('cheer', 1.6, 0.3)); }
  bleed() { return this.play(new Action('bleed', 0.65, 0.4)); }
  fall(fromAngle?: number) {
    this.dead = true;
    const isHeroHook = !this.foe && !!POSE_HOOKS[this.hid];
    return this.play(new Action('fall', isHeroHook ? 1.65 : 1.2, 0.6, fromAngle === undefined ? {} : { fromAngle }));
  }
  /** act-139 C2: stand cleanly back up after 残息未绝 revive */
  revive() {
    this.dead = false;
    this.deathAction = undefined;
    this.act = null;
    this.body.rotation.set(0, 0, 0);
    this.body.position.copy(this.off);
  }
  setRunning(on: boolean, speed?: number, lookYaw?: number, velocity?: { readonly x: number; readonly z: number }) {
    this.running = on;
    this.moveSpeed = speed;
    this.lookYaw = lookYaw ?? this.lookYaw;
    this.moveVelocity = velocity ?? this.moveVelocity;
  }
  // lich
  summon() { return this.play(new Action('summon', 1.1, 0.55)); }
  shield() { return this.play(new Action('shield', 0.8, 0.45)); }
  talk(dur = 1.6) { return this.play(new Action('talk', Math.max(1.2, dur), 0.5)); }
  collapse() { this.dead = true; return this.play(new Action('collapse', 2.2, 0.5)); }
  // fx5 (FX_BRIEF): skill moves of the three heroes, posed in poseMove() on top of the shared grip stance (heroPose.ts untouched).
  // Defensive skills only ever use guard / chant; nothing here changes the feel of the existing actions.
  /** 铁壁 / 血战 guard: the axe raised crosswise overhead → a stomp into a deep braced stance (impact = the stomp) → held → back */
  guard(dur = 1.15, from = 0) { return this.play(new Action('guard', dur, 0.36, { from })); }
  /** 魔导 charge (释放 wind-up, 吟唱, 屏障): staff raised high, rising onto the toes, held (impact = fully raised) */
  chant(dur = 0.9, big = false) { return this.play(new Action('chant', dur, 0.3, { big })); }
  /** 释放: the same charge, held, then the staff is thrust at the enemy in one piece (impact = the thrust) */
  release(dur = 1.3, big = false) { return this.play(new Action('chant', dur, 0.77, { big, burst: true })); }
  /** a quick cast (小咒): the grip stance's raise-and-thrust, faster than cast() */
  quickCast(dur = 0.6) { return this.play(new Action('cast', dur, 0.6)); }
  /** 顺劈斩: wound up to the right, a horizontal sweep across (impact = mid-swing) */
  sweep(dist: number, dur = 0.95) { return this.play(new Action('sweep', dur, 0.5, { dist })); }
  /** 盾冲: head down, haft across the chest, charge into the target (impact = contact) */
  bash(dist: number, dur = 0.9) { return this.play(new Action('bash', dur, 0.48, { dist })); }
  /** 血战 终极: crouch, leap, axe overhead, slam down (impact = landing) */
  leap(dist: number, dur = 1.5) { return this.play(new Action('leap', dur, 0.56, { dist })); }
  /** 袖箭: the left hand cocks back and flicks a knife (impact = release) */
  throwKnife(dur = 0.5) { return this.play(new Action('throw', dur, 0.47)); }
  /** the rogue's double stab, faster with every strike of a combo (speed ≥ 1). anim_report: a coil (blades back, body wound) →
   *  the right blade punches in (impact) → the left follows → a quick recovery; was a slow 0.9 s two-stab with the impact between them */
  stab(dist: number, speed = 1) { const sp = Math.max(0.5, speed), dur = 0.56 / sp; return this.play(new Action('stab', dur, (0.17 / sp) / dur, { dist, sp })); }
  /** anim_report 狂战 劈: load (step back, sink, axe to the very top, held a few frames) → burst (dash in, the axe comes down fast;
   *  impact = it meets the target) → follow (axe in the ground, the body over it, a slow return). w = weight: 1 散骰 · 2 同点 (a hop
   *  into the blow) · 3 阵列 / 破阵 (a jump chop from the air). The beat times (seconds) ride in data: the stage hangs trails on them. */
  hew(dist: number, w: 1 | 2 | 3 = 1, across = false) { const T = hewTiming(dist, across ? Math.min(2, w) as 1 | 2 : w); return this.play(new Action('hew', T.E, T.S / T.E, { dist, w: across ? Math.min(2, w) : w, across, ...T })); }
  /** anim_report: a self-cast heal (no step, no swing): sink and gather (weapon lowered / planted, free hand to the chest), then rise
   *  and open up (impact = the rise, when the light pillar goes up), settle */
  mend(dur = 1.1) { return this.play(new Action('mend', dur, 0.42)); }
  /** a short crouch (anticipation before a blink / dash; impact = lowest point) */
  crouch(dur = 0.22) { return this.play(new Action('crouch', dur, 0.8)); }
  // class select only (SELECT_SHOW_BRIEF 3, bestiary/showPose.ts): while `show` is on the hero takes its select idle and the select
  // moves (亮相 / 招牌动作 / 收尾招式) instead of the battle stance; the battle poses are untouched
  show = false; showK: number | null = null;
  showMove(name: 'sEnter' | 'sSig' | 'sFin', dur: number, at: number) { return this.play(new Action(name, dur, at)); }
  // summons
  lunge(dist: number) { return this.attack(dist); }
  shriek() { return this.roar(); }
  dispose() { this.root.parent?.remove(this.root); }

  protected pose(dt: number) {
    if (this.show && isGripHero(this.hid)) { poseShow(this); this.applyWarp(); return; }
    this.projectileOrigin = undefined;
    super.pose(dt);
    // 11-18 (一局五关): a later region's foe adds its own layer over everything below (POSE_AFTER, by model id)
    this.poseRest(dt);
    const a = this.act, b = this.bones;
    if (this.foe) {
      if (!this.dead) this.deathAction = undefined;
      if (a?.name === 'fall' || a?.name === 'collapse') this.deathAction = a;
    }
    POSE_AFTER[this.def.id]?.(b, this.t, a ?? this.deathAction ?? null, this.off, this);
    if (!this.foe) return;
    if (a?.name === 'hurt') poseFoeHurt(b, this.off, a, this.hitFrom, this.hurtVariant, ROBED.has(this.def.id));
    if (this.deathAction) poseFoeFall(b, this.off, this.def.kind, this.hitFrom, this.deathAction.k, this.deathAction.name === 'collapse');
    (this.accessories ??= new FoeAccessories(this)).pose(this, dt);
  }
  /** the run cycle, the low-HP sag and the named actions over the base pose (pose() runs this, then any POSE_AFTER layer) */
  private poseRest(dt: number) {
    const b = this.bones, t = this.t, a = this.act, k = a ? a.k : 0, n = a?.name;
    // running (intro) and the summons' lurching walk
    this.runK += ((this.running ? 1 : 0) - this.runK) * Math.min(1, dt * 8);
    const run = Math.max(this.runK, this.walkK * 0.7), ph = Math.sin(t * 11);
    const bipedGait = this.def.kind === 'biped' && !!b.footL && !!b.footR && !b.horse;
    const foeGait = this.foe && !!b.hips && (bipedGait || this.def.kind === 'quad');
    if (this.foe && !this.dead && !a) poseFoeIdle(this, this.gait?.speed ?? 0);
    if (foeGait) {
      // The mounted rig has its own hoof solver. Special poses own their steps unless they are locomotion actions.
      (this.gait ??= new FoeGait(this)).pose(this, dt, !this.dead && (!a || n === 'talk' || n === 'stalk' || n === 'flee' || n === 'ramRun'));
    } else if (run > 0.01 && (!a || n === 'talk') && !this.def.id.startsWith('ly_rider')) {
      mov(b.hips, 0, Math.abs(ph) * 0.1 * run, 0); rot(b.spine, 0.22 * run, 0, 0); rot(b.legL, ph * 0.8 * run, 0, 0); rot(b.legR, -ph * 0.8 * run, 0, 0);
      rot(b.armL, -ph * 0.7 * run, 0, 0); rot(b.hat, -0.15 * run, 0, 0);
    }
    if (this.lowHp > 0) { rot(b.spine, 0.2 * this.lowHp, 0, 0); mov(b.hips, 0, -0.05 * this.lowHp, 0); }
    if (this.hid === 'warrior' && this.aim > 0 && !a) { rot(b.armR, -0.2 * this.aim, 0, 0); rot(b.handR, 0.1 * this.aim, 0, 0); }
    // 三职业所有动作由共同的握持架势驱动，避免再叠加旧版肩肘和武器旋转。
    if (isGripHero(this.hid)) { if (a && MOVES.has(n!)) this.poseMove(n!, k, a); if (this.def.id === 'ronin_iai') poseIai(b, t, a); this.applyWarp(); return; }
    // second phase: soul fire on the robe
    if (this.robeFire > 0) {
      for (const f of this.flashMats) { const k2 = this.robeFire * ((f.m as THREE.MeshStandardMaterial).isMeshStandardMaterial ? 0.3 : 1); f.base.setRGB(0.04 * k2, (0.28 + 0.1 * Math.sin(t * 11)) * k2, 0.14 * k2); }   // plastic takes a much lighter tint
      if (!this.dead && Math.random() < dt * 30 * this.robeFire) PADD.emit({ p: this.chest().add(V3(R(-0.7, 0.7), R(-1.2, 0.5), R(-0.5, 0.5))), v: V3(R(-0.2, 0.2), R(1, 2.2), R(-0.2, 0.2)), s0: 0.14, s1: 0.02, life: R(0.4, 0.8), c0: new THREE.Color(0xc0ffd8), c1: new THREE.Color(0x2aff8a), bright: 2.6, tile: TILE.glow });
    }
    if (!a) return;
    switch (n) {
      case 'spin': {   // whirlwind: two full turns with the weapon out at arm's length
        const d = (a.data.dist as number) || 0, s2 = curve(k, [[0, 0], [0.22, 0], [0.78, 1], [1, 1]]), out = curve(k, [[0, 0], [0.18, 1], [0.85, 1], [1, 0]]);
        this.off.z = curve(k, [[0, 0], [0.25, -0.1], [0.6, d], [0.8, d], [1, 0]]); b.hips.rotation.y += s2 * Math.PI * 4;
        rot(b.armR, 0.4 * out, 0, -1.35 * out); rot(b.foreR, 1.45 * out, 0, 0); rot(b.weapon, 0.4 * out, -0.5 * out, 0); rot(b.armL, 0, 0, 1.2 * out); mov(b.hips, 0, -0.15 * out, 0);
        break;
      }
      case 'toss': { const s = snap(k, [[0, 0], [0.35, -1], [0.5, 1], [1, 0]]); rot(b.armL, -1.5 * Math.max(0, s) + 0.7 * Math.max(0, -s), 0, 0.1); rot(b.spine, 0.15 * Math.max(0, s), -0.2 * s, 0); break; }
      case 'dodge': {   // a hop to the side (along −x of the hero's own frame) and a lean away, the weapon pulled in
        const s = curve(k, [[0, 0], [0.18, 1], [0.6, 1], [1, 0]]);
        this.off.x -= 0.75 * s; this.off.y += 0.12 * Math.sin(Math.min(1, k / 0.6) * Math.PI);
        rot(b.spine, -0.25 * s, 0, 0.35 * s); rot(b.hips, 0, 0, 0.15 * s); rot(b.armR, -0.5 * s, 0, 0.4 * s); rot(b.armL, -0.4 * s, 0, -0.4 * s);
        break;
      }
      case 'block': { const s = curve(k, [[0, 0], [0.2, 1], [0.7, 1], [1, 0]]); rot(b.armR, -0.7 * s, 0.3 * s, 0.5 * s); rot(b.weapon, 0.3 * s, 1.1 * s, 0); rot(b.armL, -1.2 * s, 0, -0.4 * s); rot(b.foreL, -0.9 * s, 0, 0); mov(b.hips, 0, -0.1 * s, 0); break; }
      case 'bleed': { const s = curve(k, [[0, 0], [0.3, 1], [0.65, 1], [1, 0]]); rot(b.armL, -1.3 * s, 0, -0.5 * s); rot(b.foreL, -0.6 * s, 0, 0); rot(b.armR, -0.4 * s, 0, 0.6 * s); rot(b.weapon, 0.6 * s, 0.8 * s, 0); rot(b.jaw, 0.4 * s, 0, 0); break; }
      case 'cheer': { const s = curve(k, [[0, 0], [0.2, 1], [1, 1]]), j = Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k); this.off.y += j * 0.5; rot(b.armR, -2.9 * s, 0, -0.3 * s); rot(b.foreR, 1.3 * s, 0, 0); rot(b.armL, -2.7 * s, 0, 0.4 * s); rot(b.jaw, 0.7 * s, 0, 0); break; }
      case 'fall': { if (this.foe || POSE_HOOKS[this.hid]) break; const s = curve(k, [[0, 0], [0.6, 1], [1, 1]]); rot(b.hips, -1.35 * s, 0, 0.2 * s); mov(b.hips, 0, -0.3 * s, -0.3 * s); rot(b.armR, -0.6 * s, 0, -0.9 * s); rot(b.armL, -0.4 * s, 0, 0.9 * s); break; }
      case 'summon': { const up = curve(k, [[0, 0], [0.5, 1], [0.7, 1], [1, 0]]); rot(b.armL, -2.4 * up, 0, 0.4 * up); rot(b.armR, -1.9 * up, 0, -0.4 * up); rot(b.spine, -0.3 * up, 0, 0); rot(b.jaw, 0.5 * up, 0, 0); this.off.y += up * 0.4; break; }
      case 'shield': { const s = curve(k, [[0, 0], [0.4, 1], [0.8, 1], [1, 0]]); rot(b.armL, -1.3 * s, 0.6 * s, -0.6 * s); rot(b.armR, -0.8 * s, -0.5 * s, 0.6 * s); rot(b.spine, 0.2 * s, 0, 0); this.off.y -= 0.15 * s; break; }
      case 'talk': rot(b.jaw, Math.max(0, Math.sin(k * 40)) * 0.35, 0, 0); rot(b.armL, -0.4 * Math.sin(k * Math.PI), 0, 0); break;
      case 'collapse': { if (this.foe) break; const s = curve(k, [[0, 0], [0.3, 0.3], [1, 1]]); rot(b.spine, 0.6 * s, 0, 0.2 * s); rot(b.neck, 0.5 * s, 0, 0); rot(b.jaw, 0.6, 0, 0); this.off.y -= 0.9 * s; rot(b.armL, 0.6 * s, 0, -0.4 * s); rot(b.armR, 0.4 * s, 0, 0.5 * s); break; }
    }
  }

  /** fx5: where the body is drawn while it is away from home (blink / dash), in world space; null = at home. `home` itself never
   *  moves, so the camera framing and everything anchored on home stay put while the rogue flickers round the battlefield. */
  warp: THREE.Vector3 | null = null;
  private applyWarp() {
    if (!this.warp) return;
    const f = this.fwd(), dx = this.warp.x - this.home.x, dz = this.warp.z - this.home.z;
    this.off.z += dx * f.x + dz * f.z; this.off.x += dx * f.z - dz * f.x;
  }
  /** turn to face p from wherever the body is drawn (home or warp) */
  faceFrom(p: THREE.Vector3) { const o = this.warp ?? this.home; this.yaw = Math.atan2(p.x - o.x, p.z - o.z); }

  /** fx5: the hero skill moves (see guard() …). Runs after poseHero(): adds to its stance, then re-aims the weapon with the wrist.
   *  Bone frame: +z forward, +x = the hero's left; armR/armL x < 0 raises the arm forward; wrist elevation 0 = weapon level forward,
   *  π/2 = straight up; yaw > 0 turns the weapon toward the hero's left (across the body for the right hand). */
  private poseMove(n: string, k: number, a: Action) {
    const b = this.bones, mage = this.hid === 'mage', el0 = mage ? 1.62 : Math.PI / 4, yaw0 = mage ? -0.04 : -0.12, D = (a.data.dist as number | undefined) ?? 0.7;
    // a deeper stance without sliding the feet: thigh forward a, shin back 2a, foot a (hips drop ≈ 0.3 m per rad at this stance)
    const bend = (d: number) => { rot(b.legL, -d, 0, 0); rot(b.shinL, 2 * d, 0, 0); rot(b.footL, -d, 0, 0); rot(b.legR, -d * 0.8, 0, 0); rot(b.shinR, 1.6 * d, 0, 0); rot(b.footR, -d * 0.8, 0, 0); mov(b.hips, 0, -0.3 * d, 0); };
    switch (n) {
      case 'guard': {   // 铁壁: never steps toward the enemy
        const s = curve(k, [[0, 0], [0.22, 1], [0.84, 1], [1, 0]]);
        const hi = curve(k, [[0, 0], [0.2, 1], [0.32, 0], [1, 0]]), lo = curve(k, [[0, 0], [0.22, 0], [0.34, 1], [0.84, 1], [1, 0]]);
        const st = snap(k, [[0, 0], [0.3, 0], [0.37, 1], [0.6, 0.7], [0.84, 0.7], [1, 0]]), hop = curve(k, [[0, 0], [0.16, 0], [0.26, 1], [0.34, 0], [1, 0]]);
        // from > 0: the guard starts out where a blow left the body (血战: 斩 then 挡) and hops back home while raising the axe
        const back = (a.data.from as number) || 0, ret = back ? curve(k, [[0, 0], [0.26, 1]]) : 1;
        this.off.y += 0.16 * hop + (back ? 0.25 * Math.sin(Math.PI * ret) : 0); this.off.z = back * (1 - ret) - 0.1 * st;
        bend(0.55 * st);
        rot(b.spine, 0.16 * st - 0.14 * hi, 0, 0); rot(b.neck, -0.12 * st + 0.08 * hi, 0, 0);
        // the hold stays high (a horizontal bar just over the helm): from the battle camera, behind and above, it reads at once
        rot(b.armR, -2.6 * hi - 2.05 * lo, 0, -0.3 * s); rot(b.foreR, 0.95 * hi + 0.75 * lo, 0, 0);
        rot(b.armL, -2.6 * hi - 2.05 * lo, 0, 0.35 * s); rot(b.foreL, 0.95 * hi + 0.7 * lo, 0, 0);
        wrist(b, 'R', lerp(el0, 0.02, s), lerp(yaw0, 1.52, s));
        break;
      }
      case 'chant': {   // staff high, free hand open, rising a little: charge / chant / barrier; burst = 释放 (thrust at the end)
        const burst = !!a.data.burst, m = a.data.big ? 1.25 : 1;
        const s = burst ? curve(k, [[0, 0], [0.28, 1], [0.72, 1], [0.8, 0.35], [1, 0]]) : curve(k, [[0, 0], [0.3, 1], [0.86, 1], [1, 0]]);
        const th = burst ? snap(k, [[0, 0], [0.71, 0], [0.79, 1], [0.9, 1], [1, 0]]) : 0;
        this.off.y += (0.1 + (a.data.big ? 0.14 : 0)) * s + Math.sin(this.t * 7) * 0.025 * s;
        rot(b.spine, -0.14 * s * m + 0.16 * th, 0, 0); rot(b.neck, -0.16 * s * m, 0, 0);
        rot(b.armR, -1.2 * s * m - 0.9 * th, 0, -0.12 * s); rot(b.foreR, 0.65 * s + 0.7 * th, 0, 0);
        rot(b.armL, -1.05 * s - 0.6 * th, 0, 0.5 * s); rot(b.foreL, 0.35 * s + 0.4 * th, 0, 0);
        if (th > 0) bend(0.25 * th);
        wrist(b, 'R', lerp(mage ? el0 : lerp(el0, 1.45, s), 0.55, th), yaw0);   // the staff stays upright while lifted, then points at the enemy
        break;
      }
      case 'sweep': {   // 顺劈斩: wind to the right, sweep across to the left
        const wind = curve(k, [[0, 0], [0.34, 1], [0.44, 0], [1, 0]]), sw = snap(k, [[0, 0], [0.4, 0], [0.56, 1], [0.8, 1], [1, 0]]);
        const w = Math.max(wind, sw);
        this.off.z = curve(k, [[0, 0], [0.34, -0.12], [0.52, D], [0.8, D], [1, 0]]);
        rot(b.spine, 0.12 * sw, -0.32 * wind + 0.32 * sw, 0); rot(b.chest, 0, -0.14 * wind + 0.14 * sw, 0);
        rot(b.armR, -1.05 * w, 0, -0.55 * wind + 0.15 * sw); rot(b.foreR, 0.75 * w, 0, 0);
        rot(b.armL, -0.9 * w, 0, 0.2 * sw); rot(b.foreL, 0.5 * w, 0, 0);
        rot(b.legL, -0.3 * sw, 0, 0); rot(b.legR, 0.22 * sw, 0, 0);
        wrist(b, 'R', lerp(el0, 0.28, w), lerp(yaw0, -1.9 * wind + 1.35 * sw, w));
        break;
      }
      case 'bash': {   // 盾冲: haft across the chest, head down, charge
        const lean = curve(k, [[0, 0], [0.22, 1], [0.66, 1], [1, 0]]), run = curve(k, [[0, 0], [0.22, 0], [0.28, 1], [0.46, 1], [0.5, 0], [1, 0]]);
        this.off.z = curve(k, [[0, 0], [0.24, -0.25], [0.48, D], [0.62, D - 0.35], [1, 0]]);
        this.off.y += Math.abs(Math.sin(k * 44)) * 0.08 * run;
        rot(b.spine, 0.5 * lean, -0.2 * lean, 0); rot(b.neck, -0.35 * lean, 0, 0);
        rot(b.armR, -1.15 * lean, 0, -0.1 * lean); rot(b.foreR, 0.35 * lean, 0, 0);
        rot(b.armL, -1.15 * lean, 0, 0.1 * lean); rot(b.foreL, 0.35 * lean, 0, 0);
        rot(b.legL, -0.8 * Math.sin(k * 44) * run, 0, 0); rot(b.legR, 0.8 * Math.sin(k * 44) * run, 0, 0);
        wrist(b, 'R', lerp(el0, 0.12, lean), lerp(yaw0, 1.45, lean));
        break;
      }
      case 'leap': {   // 血战 终极: crouch, jump, axe back over the head, slam
        const cr = curve(k, [[0, 0], [0.1, 1], [0.17, 0], [0.55, 0], [0.62, 1], [0.84, 0.7], [1, 0]]);
        this.off.z = curve(k, [[0, 0], [0.12, -0.1], [0.56, D], [0.84, D], [1, 0]]);
        this.off.y += curve(k, [[0, 0], [0.13, 0], [0.36, 2.2], [0.5, 1.4], [0.56, 0], [1, 0]]);
        const up = curve(k, [[0, 0], [0.14, 0], [0.3, 1], [0.5, 1], [0.56, 0], [1, 0]]), slam = snap(k, [[0, 0], [0.5, 0], [0.57, 1], [0.84, 1], [1, 0]]);
        bend(0.6 * cr);
        rot(b.spine, -0.3 * up + 0.45 * slam, 0, 0);
        rot(b.armR, -2.6 * up - 1.0 * slam, 0, 0); rot(b.foreR, 0.9 * up + 0.6 * slam, 0, 0);
        rot(b.armL, -2.5 * up - 1.0 * slam, 0, 0); rot(b.foreL, 0.9 * up + 0.5 * slam, 0, 0);
        wrist(b, 'R', el0 + (2.3 - el0) * up + (-0.45 - el0) * slam * (1 - up), yaw0);
        break;
      }
      case 'throw': {   // 袖箭: left hand cocks back, flicks forward
        const cock = curve(k, [[0, 0], [0.34, 1], [0.46, 0], [1, 0]]), fl = snap(k, [[0, 0], [0.4, 0], [0.52, 1], [0.72, 1], [1, 0]]);
        rot(b.spine, 0, 0.35 * cock - 0.3 * fl, 0);
        rot(b.armL, 0.5 * cock - 1.3 * fl, 0, 0.35 * cock); rot(b.foreL, -0.9 * cock + 0.95 * fl, 0, 0);
        wrist(b, 'L', Math.PI / 4 + (1.3 - Math.PI / 4) * cock + (0.05 - Math.PI / 4) * fl, 0.16);
        break;
      }
      case 'crouch': {
        const s = curve(k, [[0, 0], [0.8, 1], [1, 1]]);
        bend(0.5 * s); rot(b.spine, 0.25 * s, 0, 0);
        break;
      }
      case 'hew': {   // 狂战 劈 (anim_report): every key is in seconds (a.data), so the held top is a fixed few frames at any weight
        const d = a.data as unknown as HewData, T = k * a.dur, { C, A, H, S, F, E } = d, Dz = d.dist, jump = d.w === 3, wk = d.w === 1 ? 1 : 1.25;
        const top = jump ? 2.3 : 2.15, low = -0.62, hold = T > A && T < H ? Math.sin(T * 95) * 0.03 : 0;   // the held top strains a little
        // up = the axe raised overhead, dn = brought down (they trade inside the strike window, accelerating into the blow)
        const up = seg(T, jump ? [[0, 0], [C, 0.1, 'out'], [A, 1], [H, 1, 'lin'], [S, 0, 'in'], [E, 0]] : [[0, 0], [A, 1], [H, 1, 'lin'], [S, 0, 'in'], [E, 0]]);
        const dn = seg(T, [[0, 0], [H, 0], [S, 1, 'in'], [F, 1, 'lin'], [E, 0]]);
        const el = seg(T, jump ? [[0, el0], [C, 0.3, 'out'], [A, top], [H, top + 0.06, 'lin'], [S, low, 'in'], [F, low - 0.05, 'lin'], [E, el0]]
          : [[0, el0], [A, top], [H, top + 0.06, 'lin'], [S, low, 'in'], [F, low - 0.05, 'lin'], [E, el0]]);
        const lean = jump ? seg(T, [[0, 0], [C, 1, 'out'], [C + 0.1, 0]]) : 0;   // the jump's crouch folds the body over the knees
        if (d.across) {   // 顺劈: the same beats on a flat arc — wound to the right (axe back past the hip), torn across to the left
          rot(b.armR, -1.15 * up - 1.2 * dn, 0, -0.55 * up + 0.3 * dn); rot(b.foreR, 0.6 * up + 0.3 * dn, 0, 0);
          rot(b.armL, -1.0 * up - 1.1 * dn, 0, -0.2 * up + 0.35 * dn); rot(b.foreL, 0.7 * up + 0.4 * dn, 0, 0);
          rot(b.spine, 0.1 * up + 0.3 * dn + hold, -0.55 * up + 0.5 * dn, 0); rot(b.chest, 0, -0.2 * up + 0.2 * dn, 0); rot(b.neck, -0.1 * dn, 0.3 * up - 0.25 * dn, 0);
        } else {
          rot(b.armR, -2.5 * up - 0.8 * dn, 0, -0.18 * up); rot(b.foreR, 0.95 * up + 0.45 * dn, 0, 0);
          rot(b.armL, -2.3 * up - 0.8 * dn, 0, 0.2 * up); rot(b.foreL, 1.0 * up + 0.55 * dn, 0, 0);
          rot(b.spine, -0.22 * up * wk + 0.55 * dn + 0.3 * lean + hold, 0.16 * up - 0.08 * dn, 0); rot(b.chest, -0.08 * up + 0.12 * dn, 0.1 * up, 0);
          rot(b.neck, 0.12 * up - 0.32 * dn - 0.2 * lean, 0, 0);
        }
        // legs: sink while loading, a long lunge on the blow (left foot forward), a deep squash on the jump's landing
        bend(seg(T, jump ? [[0, 0], [C, 0.62, 'out'], [C + 0.07, 0, 'out'], [S - 0.005, 0], [S + 0.05, 0.66, 'out'], [F, 0.5, 'lin'], [E, 0]]
          : [[0, 0], [A, 0.3 * wk, 'out'], [H, 0.32 * wk, 'lin'], [S, 0.42 * wk, 'in'], [F, 0.5 * wk, 'lin'], [E, 0]]));
        const stride = seg(T, [[0, 0], [H, 0], [S, 1, 'out'], [F, 1, 'lin'], [E, 0]]);
        rot(b.legL, -0.4 * stride, 0, 0); rot(b.shinL, 0.2 * stride, 0, 0); rot(b.legR, 0.45 * stride, 0, 0); rot(b.shinR, 0.25 * stride, 0, 0);
        if (jump) { const tuck = seg(T, [[0, 0], [C + 0.07, 0], [A, 1, 'out'], [H, 1, 'lin'], [S - 0.02, 0, 'in'], [E, 0]]); rot(b.legL, -0.9 * tuck, 0, 0); rot(b.shinL, 1.3 * tuck, 0, 0); rot(b.legR, -0.6 * tuck, 0, 0); rot(b.shinR, 1.1 * tuck, 0, 0); }
        // the body: back a step while loading, then one burst to the target (it lands just before the axe), slow walk back home
        this.off.z = seg(T, jump ? [[0, 0], [C, -0.3, 'out'], [A, Dz * 0.55], [H, Dz * 0.66, 'lin'], [S, Dz, 'in'], [F, Dz + 0.05, 'lin'], [E, 0]]
          : [[0, 0], [A, -0.22 * wk, 'out'], [H, -0.24 * wk, 'lin'], [S - 0.02, Dz, 'out'], [S, Dz + 0.03, 'lin'], [F, Dz + 0.08, 'lin'], [E, 0]]);
        if (jump) this.off.y += seg(T, [[0, 0], [C, 0], [A, 1.9], [H, 1.96, 'lin'], [S, 0, 'in'], [E, 0]]);
        else if (d.w === 2) this.off.y += seg(T, [[0, 0], [H, 0], [H + (S - H) * 0.45, 0.28, 'out'], [S, 0, 'in'], [E, 0]]);
        if (d.across) wrist(b, 'R', seg(T, [[0, el0], [A, 0.4, 'out'], [H, 0.42, 'lin'], [S, 0.12, 'in'], [F, 0.08, 'lin'], [E, el0]]), seg(T, [[0, yaw0], [A, -2.0, 'out'], [H, -2.05, 'lin'], [S, 1.25, 'in'], [F, 1.5, 'lin'], [E, yaw0]]) + hold);
        else wrist(b, 'R', el + hold, yaw0 + 0.1 * up);
        break;
      }
      case 'mend': {   // self-cast heal: never steps toward the enemy, never swings
        const s = curve(k, [[0, 0], [0.22, 1], [0.8, 1], [1, 0]]), dip = curve(k, [[0, 0], [0.26, 1], [0.42, 0], [1, 0]]), lift = snap(k, [[0, 0], [0.32, 0], [0.45, 1], [0.78, 1], [1, 0]]);
        const dk = mage ? 0.45 : 1;   // the mage's robe is one rigid block: a full bow reads as falling over
        bend(0.3 * dip * dk); this.off.y += 0.08 * lift;
        rot(b.spine, 0.14 * dip * dk - 0.2 * lift, 0, 0); rot(b.neck, 0.14 * dip * dk - 0.3 * lift, 0, 0);
        if (this.hid === 'warrior') {   // the axe head goes down beside the right foot, the left fist to the heart, then the chest opens
          rot(b.armR, 0.15 * s, 0, -0.12 * s); wrist(b, 'R', lerp(el0, -1.05, s), lerp(yaw0, -0.3, s));
          rot(b.armL, -0.35 * s - 0.5 * lift, 0, -0.3 * s + 0.6 * lift); rot(b.foreL, -0.25 * s + 0.5 * lift, 0, 0);
        } else if (mage) {   // the staff lifted straight up, the free hand opens upward
          rot(b.armR, -0.85 * lift, 0, -0.1 * lift); rot(b.foreR, 0.3 * lift, 0, 0); wrist(b, 'R', el0, yaw0);
          rot(b.armL, -0.3 * dip - 1.5 * lift, 0, 0.35 * lift); rot(b.foreL, 0.4 * lift, 0, 0);
        } else {   // the rogue: blades crossed low in front, then the arms open wide
          rot(b.armR, -0.2 * dip, 0, 0.3 * dip - 0.55 * lift); rot(b.armL, -0.2 * dip, 0, -0.3 * dip + 0.55 * lift);
          wrist(b, 'R', lerp(el0, -0.5, s), lerp(yaw0, 0.4, dip) - 0.5 * lift); wrist(b, 'L', lerp(Math.PI / 4, -0.5, s), lerp(0.16, -0.4, dip) + 0.5 * lift);
        }
        break;
      }
      case 'stab': {   // the rogue's double stab: coil → right blade in (impact) → left blade → recover; the keys scale with the combo speed
        const sp = (a.data.sp as number) || 1, T = k * a.dur * sp, D = (a.data.dist as number) || 0;
        const coil = seg(T, [[0, 0], [0.11, 1, 'out'], [0.17, 0, 'in'], [0.56, 0]]);
        const r = seg(T, [[0, 0], [0.11, 0], [0.17, 1, 'in'], [0.27, 0.35, 'out'], [0.56, 0]]), l = seg(T, [[0, 0], [0.19, 0], [0.26, 1, 'in'], [0.36, 0.2, 'out'], [0.56, 0]]);
        this.off.z = seg(T, [[0, 0], [0.11, -0.1, 'out'], [0.17, D + 0.22, 'out'], [0.27, D + 0.3, 'lin'], [0.56, 0]]);
        bend(0.3 * coil + 0.12 * (r + l));
        rot(b.spine, -0.08 * coil + 0.22 * (r + l), -0.3 * coil + 0.3 * (r - l), 0);
        rot(b.armR, 0.35 * coil - 1.05 * r, 0, -0.1 * r); rot(b.foreR, -0.35 * coil + 0.85 * r, 0, 0);
        rot(b.armL, 0.3 * coil - 1.1 * l, 0, 0.1 * l); rot(b.foreL, -0.3 * coil + 0.9 * l, 0, 0);
        wrist(b, 'R', Math.PI / 4 + 0.45 * coil - 0.8 * r, -0.12 - 0.2 * coil); wrist(b, 'L', Math.PI / 4 + 0.45 * coil - 0.8 * l, 0.16 + 0.2 * coil);
        break;
      }
    }
  }
}

/** 狂战 劈 beat times in seconds: C crouch end (jump only) · A loaded · H end of the held top · S impact · F follow-through end · E home */
export interface HewData { dist: number; w: 1 | 2 | 3; /** 顺劈: a flat arc instead of the overhead chop */ across?: boolean; C: number; A: number; H: number; S: number; F: number; E: number }
export function hewTiming(dist: number, w: 1 | 2 | 3): Omit<HewData, 'dist' | 'w' | 'across'> {
  if (w === 3) { const C = 0.18, A = 0.42, H = 0.49, S = 0.58 + Math.min(0.05, dist * 0.01), F = S + 0.36, E = F + 0.62; return { C, A, H, S, F, E }; }
  // the held top: 3 frames (散骰) / 4 frames (同点) at 60 fps; the strike window grows a little with the distance it has to cover
  const A = w === 2 ? 0.24 : 0.18, H = A + (w === 2 ? 0.066 : 0.05), S = H + 0.075 + Math.min(0.08, 0.022 * dist), F = S + (w === 2 ? 0.26 : 0.2), E = F + (w === 2 ? 0.5 : 0.42);
  return { C: 0, A, H, S, F, E };
}
type Ease = 'in' | 'out' | 'io' | 'lin';
/** piecewise keys in seconds; each segment eases by the mark on its end key (in = accelerating into it, out = arriving softly) */
function seg(t: number, keys: Array<[number, number, Ease?]>) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e = 'io'] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; let u = (t - t0) / Math.max(1e-6, t1 - t0); u = e === 'in' ? u * u : e === 'out' ? 1 - (1 - u) ** 3 : e === 'lin' ? u : u * u * (3 - 2 * u); return v0 + (v1 - v0) * u; }
  }
  return keys[keys.length - 1][1];
}

const MOVES = new Set(['guard', 'chant', 'sweep', 'bash', 'leap', 'throw', 'crouch', 'hew', 'mend', 'stab']);
const lerp = (x: number, y: number, k: number) => x + (y - x) * k;
const _pq = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _te = new THREE.Euler();
/** the weapon's direction through the wrist (same constraint as heroPose.ts: the fist never leaves the grip) */
function wrist(b: Record<string, Bone>, side: 'R' | 'L', elevation: number, yaw = 0, roll = 0) {
  const hand = b[`hand${side}`]; if (!hand) return;
  _pq.identity();
  for (let p = hand.parent; p && p !== b.root; p = p.parent) _pq.premultiply(p.quaternion);
  _tq.setFromEuler(_te.set(-elevation, yaw, roll, 'YXZ'));
  hand.quaternion.copy(_pq.invert().multiply(_tq));
}

/** the battle cast from the bestiary: 嗜血狂战, 枯骨巫妖, 食尸鬼 */
export const bestiaryCast = (): Cast => ({ hero: () => new BattleActor('warrior'), lich: () => new BattleActor('boss_lich_forest'), ghoul: () => new BattleActor('forest_ghoul') });
