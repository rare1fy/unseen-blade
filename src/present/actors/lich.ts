// 枯骨巫妖 — the boss: a towering, hovering skeleton-king in a tattered violet robe with gold trim, a hooded crowned skull with soul-green
// eyes, spiked pauldrons, clawed bone hands and a bone staff caging a green soul gem; soul wisps orbit it. Second phase: the robe catches
// green soulfire, the gem cracks brighter.
import * as THREE from 'three';
import { Actor } from './actor';
import { RigBuilder, Action, rot, mov, curve, snap, ball, capsule, limb, lathe, type Bone } from './rig';
import { toon, glow } from '../look/toon';
import { V3 } from '../engine/world';

export class Lich extends Actor {
  readonly height = 3.6;
  gem!: THREE.Mesh; eyes: THREE.Mesh[] = []; wisps: THREE.Mesh[] = []; robeFire = 0; fireMat!: THREE.MeshBasicMaterial;
  constructor() {
    super();
    const R = new RigBuilder(); this.body.add(R.root);
    const float = R.bone('float', null, 0, 0.35, 0), robe = R.bone('robe', float, 0, 0, 0), hem = R.bone('hem', robe, 0, 0, 0);
    const spine = R.bone('spine', float, 0, 1.55, 0), chest = R.bone('chest', spine, 0, 0.5, 0), neck = R.bone('neck', chest, 0, 0.55, 0.05), head = R.bone('head', neck, 0, 0.2, 0.05), jaw = R.bone('jaw', head, 0, -0.12, 0.16);
    const shL = R.bone('shL', chest, 0.62, 0.38, 0), armL = R.bone('armL', shL, 0.05, -0.05, 0), foreL = R.bone('foreL', armL, 0, -0.55, 0), handL = R.bone('handL', foreL, 0, -0.5, 0);
    const shR = R.bone('shR', chest, -0.62, 0.38, 0), armR = R.bone('armR', shR, -0.05, -0.05, 0), foreR = R.bone('foreR', armR, 0, -0.55, 0), handR = R.bone('handR', foreR, 0, -0.5, 0), staff = R.bone('staff', handR, 0, 0, 0.05);
    const robeM = toon(0x2c1f44), robeD = toon(0x1a1228), trim = toon(0xc8a050, { emissive: 0x2a1800 }), boneM = toon(0xe6dcc4), boneD = toon(0xa89c84), metal = toon(0x2e2a36), wood = toon(0x3a2a24);
    const eyeM = glow(0x5affa0, 4), gemM = glow(0x4affa0, 3.2);
    // robe: a flared bell with a ragged hem, inner dark lining, gold trim bands
    R.add(robe, lathe([[0.0, 1.9], [0.42, 1.85], [0.58, 1.4], [0.78, 0.8], [1.05, 0.25], [1.18, 0.0]], 20), robeM);
    R.add(robe, lathe([[0.0, 1.8], [0.38, 1.75], [0.52, 1.3], [0.72, 0.7], [0.98, 0.2], [1.1, 0.02]], 20), robeD, [0, 0.02, 0], [0, 0, 0], [0.98, 1, 0.98]);
    R.add(robe, new THREE.TorusGeometry(1.13, 0.045, 6, 32), trim, [0, 0.08, 0], [Math.PI / 2, 0, 0]);
    R.add(robe, new THREE.TorusGeometry(0.7, 0.035, 6, 24), trim, [0, 0.95, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; R.add(hem, new THREE.ConeGeometry(0.16, 0.42, 4), robeM, [Math.sin(a) * 1.08, -0.12, Math.cos(a) * 1.08], [Math.PI, a, 0]); }
    R.add(robe, new THREE.BoxGeometry(0.34, 1.6, 0.04), trim, [0, 0.9, 0.62], [-0.2, 0, 0]);   // front stole
    for (let i = 0; i < 4; i++) R.add(robe, new THREE.OctahedronGeometry(0.07, 0), glow(0x4affa0, 1.8), [0, 0.5 + i * 0.32, 0.66 - i * 0.04]);
    // chest: ribcage under an open collar, spiked pauldrons
    R.add(chest, lathe([[0.0, -0.5], [0.5, -0.45], [0.62, 0.0], [0.56, 0.4], [0.3, 0.6], [0.0, 0.62]], 16), robeM);
    for (let i = 0; i < 4; i++) R.add(chest, new THREE.TorusGeometry(0.3 - i * 0.03, 0.035, 5, 12, Math.PI), boneM, [0, 0.25 - i * 0.14, 0.32], [0, 0, Math.PI]);
    R.add(chest, new THREE.BoxGeometry(0.06, 0.6, 0.06), boneM, [0, 0.05, 0.36]);
    for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.4; R.add(chest, new THREE.ConeGeometry(0.07, 0.55, 4), robeD, [Math.sin(a) * 0.45, 0.62, -0.05 + Math.cos(a) * 0.2], [-0.5 + Math.abs(a) * 0.1, 0, -a * 0.5]); }   // tall collar
    for (const [sh, sx] of [[shL, 1], [shR, -1]] as Array<[Bone, number]>) {
      R.add(sh, ball(0.32, 1.2, 0.7, 1.1), metal, [sx * 0.05, 0.08, 0]);
      R.add(sh, new THREE.TorusGeometry(0.3, 0.03, 5, 16, Math.PI), trim, [sx * 0.05, 0.12, 0], [0, Math.PI / 2, sx * 0.3]);
      for (let i = 0; i < 3; i++) R.add(sh, new THREE.ConeGeometry(0.06, 0.32, 5), boneD, [sx * (0.1 + i * 0.1), 0.32, -0.1 + i * 0.1], [0, 0, -sx * (0.4 + i * 0.15)]);
    }
    // head: hood, crowned skull, glowing eyes, jaw
    R.add(head, lathe([[0.0, 0.62], [0.32, 0.6], [0.5, 0.35], [0.52, 0.0], [0.42, -0.3]], 16, ), robeD, [0, 0.12, -0.08], [0, 0, 0], [1, 1, 1]);
    R.add(head, ball(0.33), boneM, [0, 0.2, 0.08], [0, 0, 0], [0.95, 1.0, 1.0]);
    R.add(head, ball(0.2), boneD, [0, 0.05, 0.2], [0, 0, 0], [1.1, 0.7, 1]);
    for (const sx of [-1, 1]) R.add(head, ball(0.1), toon(0x08060c), [sx * 0.13, 0.22, 0.32], [0, 0, 0], [1, 0.8, 0.5]);
    R.add(head, new THREE.ConeGeometry(0.05, 0.1, 3), toon(0x08060c), [0, 0.1, 0.38], [Math.PI, 0, 0]);
    for (let i = 0; i < 6; i++) R.add(head, new THREE.BoxGeometry(0.04, 0.07, 0.04), boneM, [-0.13 + i * 0.052, -0.02, 0.33]);
    R.add(head, new THREE.CylinderGeometry(0.34, 0.36, 0.1, 16, 1, true), trim, [0, 0.48, 0.02]);
    for (let i = 0; i < 7; i++) { const a = -1.4 + i * 0.47; R.add(head, new THREE.ConeGeometry(0.045, i % 2 ? 0.22 : 0.34, 4), trim, [Math.sin(a) * 0.34, 0.62 + (i % 2 ? 0 : 0.06), 0.02 + Math.cos(a) * 0.34]); }
    R.add(jaw, new THREE.BoxGeometry(0.3, 0.07, 0.2), boneM, [0, 0, 0.08]);
    for (let i = 0; i < 6; i++) R.add(jaw, new THREE.BoxGeometry(0.04, 0.06, 0.04), boneM, [-0.12 + i * 0.048, 0.06, 0.17]);
    // arms: wide sleeves over thin bone arms, clawed hands
    for (const [arm, fore, hand, sx] of [[armL, foreL, handL, 1], [armR, foreR, handR, -1]] as Array<[Bone, Bone, Bone, number]>) {
      R.add(arm, limb(0.2, 0.28, 0.55, 10), robeM); R.add(arm, limb(0.05, 0.045, 0.55), boneM);
      R.add(fore, limb(0.22, 0.32, 0.5, 12), robeM); R.add(fore, new THREE.TorusGeometry(0.31, 0.03, 5, 18), trim, [0, -0.5, 0], [Math.PI / 2, 0, 0]);
      R.add(fore, limb(0.045, 0.04, 0.5), boneM);
      R.add(hand, ball(0.09), boneM);
      for (let f = 0; f < 4; f++) R.add(hand, limb(0.022, 0.012, 0.28, 5), boneM, [(f - 1.5) * 0.05, -0.04, 0.02], [0.3, 0, (f - 1.5) * 0.2 * sx]);
    }
    // staff with a bone cage around the soul gem
    R.add(staff, limb(0.05, 0.06, 3.2, 8), wood, [0, 1.6, 0]);
    for (let i = 0; i < 4; i++) R.add(staff, new THREE.TorusGeometry(0.07, 0.02, 5, 10), trim, [0, 1.5 - i * 0.7, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; R.add(staff, new THREE.ConeGeometry(0.04, 0.6, 4), boneM, [Math.sin(a) * 0.2, 1.95, Math.cos(a) * 0.2], [Math.cos(a) * -0.35, 0, Math.sin(a) * 0.35]); }
    R.add(staff, ball(0.11), boneM, [0, 1.62, 0]);
    this.bones = R.bones;
    this.finish(R.build());
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gemM); this.gem.position.set(0, 2.0, 0); staff.add(this.gem);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeM); e.position.set(sx * 0.13, 0.22, 0.38); head.add(e); this.eyes.push(e); }
    const wispM = glow(0x7affc0, 2.6);
    for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), wispM); this.root.add(w); this.wisps.push(w); }
    this.fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 1.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const fire = new THREE.Mesh(lathe([[0.0, 1.95], [0.46, 1.9], [0.62, 1.4], [0.84, 0.8], [1.12, 0.25], [1.26, 0.0]], 20), this.fireMat); robe.add(fire);
  }
  weapon() { return this.gem.getWorldPosition(V3()); }

  cast() { return this.play(new Action('cast', 0.9, 0.55)); }
  summon() { return this.play(new Action('summon', 1.1, 0.55)); }
  shield() { return this.play(new Action('shield', 0.8, 0.45)); }
  hurt(power = 1) { this.hit(power); return this.play(new Action('hurt', 0.5, 0.1, { power })); }
  roar() { return this.play(new Action('roar', 1.6, 0.35)); }
  talk(dur = 1.6) { return this.play(new Action('talk', dur, 0.5)); }
  collapse() { this.dead = true; return this.play(new Action('collapse', 2.2, 0.5)); }

  protected pose(dt: number) {
    const b = this.bones, t = this.t, a = this.act, k = a ? a.k : 0, n = a?.name, low = this.lowHp;
    const hover = Math.sin(t * 1.3) * 0.12;
    mov(b.float, 0, hover, 0); rot(b.robe, Math.sin(t * 1.3 + 1) * 0.03, 0, Math.sin(t * 0.9) * 0.02); rot(b.hem, 0, t * 0.15, 0);
    rot(b.spine, 0.05 + low * 0.12 + Math.sin(t * 1.3) * 0.03, Math.sin(t * 0.5) * 0.06, 0); rot(b.neck, -0.05, Math.sin(t * 0.6) * 0.15, 0); rot(b.jaw, 0.05 + Math.max(0, Math.sin(t * 0.7) - 0.95) * 4, 0, 0);
    rot(b.shL, 0, 0, 0.25); rot(b.armL, 0.3 + Math.sin(t * 1.1) * 0.08, 0, 0.35); rot(b.foreL, -0.7 + Math.sin(t * 1.7) * 0.1, 0, 0); rot(b.handL, 0.3 + Math.sin(t * 3) * 0.1, 0, 0);
    rot(b.shR, 0, 0, -0.2); rot(b.armR, 0.2, 0, -0.3); rot(b.foreR, -0.9, 0, 0); rot(b.staff, 0.7, 0, 0.5);
    this.off.set(0, 0, 0);
    this.gem.rotation.y += dt * 1.5; this.gem.rotation.x += dt * 0.7;
    const gs = 1 + Math.sin(t * 4) * 0.08 + low * 0.25; this.gem.scale.setScalar(gs);
    this.wisps.forEach((w, i) => { const ang = t * (0.8 + i * 0.15) + (i / this.wisps.length) * Math.PI * 2, r = 1.5 + Math.sin(t + i) * 0.2; w.position.set(Math.cos(ang) * r, 1.4 + Math.sin(t * 1.7 + i * 2) * 0.6 + hover, Math.sin(ang) * r); w.visible = !this.dead; });
    this.fireMat.opacity = this.robeFire * (0.25 + 0.15 * Math.sin(t * 11) + 0.1 * Math.sin(t * 27));
    if (!a) return;
    switch (n) {
      case 'cast': {   // staff raised high, gem flares, thrust forward on release
        const up = curve(k, [[0, 0], [0.45, 1], [0.6, 0.7], [1, 0]]), thrust = snap(k, [[0, 0], [0.5, 0], [0.6, 1], [1, 0]]);
        rot(b.armR, -1.6 * up - 0.6 * thrust, 0, -0.3 * up); rot(b.foreR, 0.6 * up, 0, 0); rot(b.staff, -0.6 * up + 0.5 * thrust, 0, 0);
        rot(b.armL, -1.0 * up, 0, 0.6 * up); rot(b.handL, -0.6 * up, 0, 0); rot(b.spine, -0.15 * up + 0.2 * thrust, 0, 0); rot(b.jaw, 0.4 * thrust, 0, 0);
        this.gem.scale.multiplyScalar(1 + up * 0.6); mov(b.float, 0, up * 0.25, 0);
        break;
      }
      case 'summon': {
        const up = curve(k, [[0, 0], [0.5, 1], [0.7, 1], [1, 0]]);
        rot(b.armL, -2.4 * up, 0, 0.5 * up); rot(b.armR, -2.0 * up, 0, -0.5 * up); rot(b.spine, -0.3 * up, 0, 0); rot(b.jaw, 0.5 * up, 0, 0); mov(b.float, 0, up * 0.5, 0);
        break;
      }
      case 'shield': {
        const s = curve(k, [[0, 0], [0.4, 1], [0.8, 1], [1, 0]]);
        rot(b.armL, -1.3 * s, 0.6 * s, -0.6 * s); rot(b.armR, -1.0 * s, -0.5 * s, 0.6 * s); rot(b.spine, 0.2 * s, 0, 0); mov(b.float, 0, -0.15 * s, 0);
        break;
      }
      case 'hurt': {
        const p = Math.min(1.6, (a.data.power as number) || 1), s = snap(k, [[0, 0], [0.12, 1], [1, 0]]) * p;
        rot(b.spine, -0.3 * s, 0, 0.12 * s); rot(b.neck, -0.35 * s, 0, 0); rot(b.jaw, 0.5 * s, 0, 0); this.off.z = -0.3 * s;
        break;
      }
      case 'roar': {   // phase two: rears back, arms flung wide, jaw agape
        const s = curve(k, [[0, 0], [0.3, 1], [0.8, 1], [1, 0.4]]), sh = Math.sin(k * 60) * 0.03 * s;
        rot(b.spine, -0.4 * s, sh, 0); rot(b.neck, -0.5 * s, 0, 0); rot(b.jaw, 0.9 * s, 0, 0); rot(b.armL, -1.8 * s, 0, 1.0 * s); rot(b.armR, -1.5 * s, 0, -1.0 * s); mov(b.float, 0, 0.5 * s, 0);
        break;
      }
      case 'talk': rot(b.jaw, Math.max(0, Math.sin(k * 40)) * 0.35, 0, 0); rot(b.handL, Math.sin(k * 8) * 0.2, 0, 0); break;
      case 'collapse': {
        const s = curve(k, [[0, 0], [0.3, 0.3], [1, 1]]);
        rot(b.spine, 0.6 * s, 0, 0.2 * s); rot(b.neck, 0.5 * s, 0, 0); rot(b.jaw, 0.6, 0, 0); mov(b.float, 0, -0.8 * s, 0); rot(b.armL, 0.6 * s, 0, -0.4 * s); rot(b.armR, 0.4 * s, 0, 0.5 * s);
        break;
      }
    }
    void capsule;
  }
}
