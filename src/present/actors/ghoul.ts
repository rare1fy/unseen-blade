// 食尸鬼 — the lich's summon: an emaciated, hunched corpse-eater with grey-green hide, a ridge of spine knobs, overlong arms with black
// claws, a split jaw and ember-red eyes. Moves in low lurching hops.
import * as THREE from 'three';
import { Actor } from './actor';
import { RigBuilder, Action, rot, mov, curve, snap, ball, capsule, limb, type Bone } from './rig';
import { toon, glow } from '../look/toon';
import { V3 } from '../engine/world';

export class Ghoul extends Actor {
  readonly height = 1.7;
  walkK = 0;   // 0..1 while hopping forward
  constructor() {
    super();
    const R = new RigBuilder(); this.body.add(R.root);
    const hips = R.bone('hips', null, 0, 0.78, 0), spine = R.bone('spine', hips, 0, 0.18, 0.02), chest = R.bone('chest', spine, 0, 0.36, 0.1), neck = R.bone('neck', chest, 0, 0.3, 0.2), head = R.bone('head', neck, 0, 0.08, 0.14), jaw = R.bone('jaw', head, 0, -0.08, 0.12);
    const shL = R.bone('shL', chest, 0.4, 0.18, 0.05), armL = R.bone('armL', shL, 0, 0, 0), foreL = R.bone('foreL', armL, 0, -0.5, 0), handL = R.bone('handL', foreL, 0, -0.5, 0);
    const shR = R.bone('shR', chest, -0.4, 0.18, 0.05), armR = R.bone('armR', shR, 0, 0, 0), foreR = R.bone('foreR', armR, 0, -0.5, 0), handR = R.bone('handR', foreR, 0, -0.5, 0);
    const legL = R.bone('legL', hips, 0.22, -0.05, 0), shinL = R.bone('shinL', legL, 0, -0.36, 0), footL = R.bone('footL', shinL, 0, -0.34, 0);
    const legR = R.bone('legR', hips, -0.22, -0.05, 0), shinR = R.bone('shinR', legR, 0, -0.36, 0), footR = R.bone('footR', shinR, 0, -0.34, 0);
    const hide = toon(0x7a8c6c), hideD = toon(0x4a5a44), rag = toon(0x3a2e2a), claw = toon(0x1a1416), gum = toon(0x5a1a20), toothM = toon(0xe0d4b0);
    R.add(hips, ball(0.3), hideD, [0, 0, 0], [0, 0, 0], [0.9, 0.7, 0.75]);
    R.add(hips, new THREE.BoxGeometry(0.42, 0.3, 0.3), rag, [0, -0.14, 0], [0.1, 0, 0]);
    R.add(spine, ball(0.3), hide, [0, 0.1, 0], [0, 0, 0], [0.7, 1.0, 0.6]);
    R.add(chest, ball(0.42), hide, [0, 0.05, 0], [0.3, 0, 0], [0.82, 0.72, 0.62]);
    for (let i = 0; i < 4; i++) R.add(chest, new THREE.TorusGeometry(0.28 - i * 0.03, 0.02, 4, 10, Math.PI), hideD, [0, 0.12 - i * 0.1, 0.26], [0.3, 0, Math.PI]);
    for (let i = 0; i < 6; i++) R.add(i < 3 ? spine : chest, ball(0.06), hideD, [0, (i % 3) * 0.12, -0.28 - (i < 3 ? 0 : 0.06)]);
    R.add(head, ball(0.22), hide, [0, 0.05, 0], [0, 0, 0], [0.9, 0.85, 1.3]);
    R.add(head, ball(0.2), hideD, [0, 0.12, -0.04], [0, 0, 0], [1.1, 0.6, 1]);
    for (const sx of [-1, 1]) { R.add(head, ball(0.06), toon(0x080406), [sx * 0.1, 0.1, 0.2]); R.add(head, new THREE.ConeGeometry(0.06, 0.24, 4), hideD, [sx * 0.2, 0.2, -0.05], [0, 0, -sx * 0.9]); }
    R.add(head, ball(0.16), gum, [0, -0.04, 0.16], [0, 0, 0], [1, 0.5, 0.8]);
    for (let i = 0; i < 5; i++) R.add(head, new THREE.ConeGeometry(0.02, 0.07, 4), toothM, [-0.08 + i * 0.04, -0.02, 0.25], [Math.PI, 0, 0]);
    R.add(jaw, ball(0.16), hide, [0, -0.04, 0.06], [0, 0, 0], [1, 0.5, 1.1]);
    for (let i = 0; i < 4; i++) R.add(jaw, new THREE.ConeGeometry(0.02, 0.07, 4), toothM, [-0.06 + i * 0.04, 0.03, 0.16]);
    for (const [arm, fore, hand, sx] of [[armL, foreL, handL, 1], [armR, foreR, handR, -1]] as Array<[Bone, Bone, Bone, number]>) {
      R.add(arm, limb(0.1, 0.07, 0.5), hide); R.add(arm, ball(0.11), hideD);
      R.add(fore, limb(0.075, 0.06, 0.5), hide); R.add(fore, ball(0.08), hideD);
      R.add(hand, ball(0.09, 1.2, 0.7, 1), hideD);
      for (let f = 0; f < 3; f++) R.add(hand, new THREE.ConeGeometry(0.03, 0.26, 4), claw, [(f - 1) * 0.06 * sx, -0.14, 0.05], [0.4, 0, (f - 1) * 0.2]);
    }
    for (const [leg, shin, foot] of [[legL, shinL, footL], [legR, shinR, footR]]) {
      R.add(leg, capsule(0.11, 0.18), hide); R.add(shin, capsule(0.08, 0.2), hide); R.add(foot, ball(0.1, 1, 0.5, 1.8), hideD, [0, 0, 0.1]);
      for (let f = 0; f < 3; f++) R.add(foot, new THREE.ConeGeometry(0.025, 0.12, 4), claw, [(f - 1) * 0.05, -0.02, 0.3], [Math.PI / 2, 0, 0]);
    }
    this.bones = R.bones;
    this.finish(R.build());
    const eyeM = glow(0xff3020, 3.5);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), eyeM); e.position.set(sx * 0.1, 0.1, 0.25); head.add(e); }
    void capsule;
  }
  weapon() { return this.bonePos('handR', 0, -0.2, 0.1); }
  lunge(dist: number) { return this.play(new Action('lunge', 0.75, 0.48, { dist })); }
  hurt(power = 1) { this.hit(power); return this.play(new Action('hurt', 0.45, 0.1, { power })); }
  shriek() { return this.play(new Action('shriek', 0.9, 0.4)); }

  protected pose(dt: number) {
    const b = this.bones, t = this.t, a = this.act, k = a ? a.k : 0, n = a?.name;
    const sway = Math.sin(t * 2.8);
    // idle: crouched, twitchy, arms hanging; hop cycle when walking
    const w = this.walkK, hop = Math.abs(Math.sin(t * 9)) * w;
    mov(b.hips, 0, -0.12 + hop * 0.18 + sway * 0.02, 0);
    rot(b.spine, 0.35 + sway * 0.04 + w * 0.2, Math.sin(t * 1.3) * 0.1, 0); rot(b.chest, 0.3, 0, Math.sin(t * 2.1) * 0.05); rot(b.neck, -0.6, Math.sin(t * 3.3) * 0.25, 0);
    rot(b.head, -0.1 + Math.sin(t * 7) * 0.05, 0, Math.sin(t * 2.6) * 0.15); rot(b.jaw, 0.25 + Math.max(0, Math.sin(t * 2.2)) * 0.25, 0, 0);
    rot(b.armL, 0.4 + Math.sin(t * 2.8 + 1) * 0.15 - w * Math.sin(t * 9) * 0.4, 0, 0.15); rot(b.foreL, -0.4, 0, 0);
    rot(b.armR, 0.4 + Math.sin(t * 2.8 + 2) * 0.15 + w * Math.sin(t * 9) * 0.4, 0, -0.15); rot(b.foreR, -0.4, 0, 0);
    rot(b.legL, -0.5 + w * Math.sin(t * 9) * 0.4, 0, 0.1); rot(b.shinL, 0.9, 0, 0); rot(b.footL, -0.4, 0, 0);
    rot(b.legR, -0.5 - w * Math.sin(t * 9) * 0.4, 0, -0.1); rot(b.shinR, 0.9, 0, 0); rot(b.footR, -0.4, 0, 0);
    this.off.set(0, 0, 0);
    if (!a) return;
    switch (n) {
      case 'lunge': {   // coil, spring at the hero, double claw swipe, scuttle back
        const d = (a.data.dist as number) || 0, coil = curve(k, [[0, 0], [0.3, 1], [0.42, 0], [1, 0]]), swipe = snap(k, [[0, 0], [0.4, 0], [0.5, 1], [0.7, 1], [1, 0]]);
        this.off.z = curve(k, [[0, 0], [0.3, -0.25], [0.48, d], [0.72, d], [1, 0]]); this.off.y = curve(k, [[0, 0], [0.32, 0], [0.4, 0.6], [0.48, 0], [1, 0]]);
        mov(b.hips, 0, -0.2 * coil, 0); rot(b.spine, 0.3 * coil - 0.2 * swipe, 0, 0); rot(b.jaw, 0.7 * (coil + swipe), 0, 0);
        rot(b.armR, -2.2 * coil + 2.6 * swipe, 0, -0.4 * swipe); rot(b.armL, -1.8 * coil + 1.8 * swipe, 0, 0.4 * swipe); rot(b.foreR, -0.6 * coil, 0, 0);
        break;
      }
      case 'hurt': { const p = Math.min(1.5, (a.data.power as number) || 1), s = snap(k, [[0, 0], [0.12, 1], [1, 0]]) * p; rot(b.spine, -0.5 * s, 0, 0.2 * s); rot(b.neck, -0.4 * s, 0, 0); rot(b.jaw, 0.6 * s, 0, 0); this.off.z = -0.4 * s; break; }
      case 'shriek': { const s = curve(k, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]); rot(b.neck, -0.8 * s, 0, 0); rot(b.jaw, 1.0 * s, 0, 0); rot(b.armL, -1.0 * s, 0, 0.8 * s); rot(b.armR, -1.0 * s, 0, -0.8 * s); break; }
    }
    void dt; void V3; void glow;
  }
}
